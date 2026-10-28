import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestGateway, putActive } from '../../../gateway/test/fake-provider.js';

const ACCOUNT = '0123456789abcdef0123456789abcdef';
const DATABASE = '01234567-89ab-cdef-0123-456789abcdef';
const VERSION_ID = '12345678-1234-1234-1234-123456789abc';
const VARS = { ACCESS_TEAM_DOMAIN: 'fixture-team.example', ACCESS_AUD: 'fixture-audience', AGENT_CLIENT_ID: 'fixture-client-id' };
const INPUT = { account_id: ACCOUNT, script_name: 'proof-worker', app: 'wiser-crm', version: '1.0.0', database_id: DATABASE, vars: VARS };
const BASE = 'https://releases.example.test/';
// The temporary connector copy lists the test host, so no test depends on the host the release ships.
const TEST_HOSTS = ['releases.example.test'];
const ROOT = `/accounts/${ACCOUNT}/workers`;
const SCRIPT = `${ROOT}/scripts/${INPUT.script_name}`;
const PREFIX = `${INPUT.app}/${INPUT.version}/`;
const CAP = 3 * 1024 * 1024;
const UPLOAD = 'fixture-upload-token-private';
const COMPLETE = 'fixture-completion-token-private';
const sha = (value) => createHash('sha256').update(value).digest('hex');
// assemble fixture from wiser-crm fork commit f82bd8961ed2f15ef9eacd347720124bd75ee391.
// Generated once by that commit's release/build.mjs; never import the fork here.
const FIXTURE = new URL('./fixtures/worker-release-format2/', import.meta.url);
const ASSEMBLED_BYTES = readFileSync(new URL('manifest.json', FIXTURE));
const ASSEMBLED = JSON.parse(ASSEMBLED_BYTES);
const { privateKey: KEY, publicKey } = generateKeyPairSync('ed25519');
const SECOND_KEY = generateKeyPairSync('ed25519').privateKey;
const publicBytes = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32);
const CONFIG = JSON.parse(readFileSync(new URL('../release.json', import.meta.url)));
const FIXTURE_CONFIG = { format: 1, base: BASE, apps: { [INPUT.app]: { keys: [{ id: sha(publicBytes).slice(0, 16), ed25519: publicBytes.toString('base64') }] } } };
const envelope = (result) => ({ status: 200, data: { success: true, result, errors: [], messages: [] } });
const refusal = (req, status, codes) => ({ status, error: { code: 'vendor_error', endpoint: req.endpoint, method: req.method, provider_codes: codes } });
const trace = (calls) => calls.map(({ method, endpoint }) => [method, endpoint]);
const readInput = { account_id: ACCOUNT, script_name: INPUT.script_name };

function release(options = {}) {
  const contents = new Map();
  const file = (bytes) => { const hash = sha(bytes); contents.set(hash, bytes); return { sha256: hash, size: bytes.length }; };
  const manifest = options.assembled ? structuredClone(ASSEMBLED) : {
    format: 2, app: INPUT.app, version: INPUT.version, created: '2026-10-18T00:00:00.000Z',
    source: structuredClone(ASSEMBLED.source), checks: { lockfile: 'PASS', install_log: 'PASS', bundle_inputs: 'PASS' },
    worker: { main_module: 'index.js', compatibility_date: '2026-10-18', compatibility_flags: ['nodejs_compat'], d1_binding: 'DB', assets_binding: 'ASSETS', vars_required: Object.keys(VARS), modules: [
      { name: 'index.js', type: 'application/javascript+module', ...file(Buffer.alloc(options.scriptBytes || 100, 65)) },
      { name: 'pad.js', type: 'application/javascript+module', ...file(Buffer.from('export default 1;')) },
    ] },
    assets: { config: { html_handling: 'auto-trailing-slash', not_found_handling: 'single-page-application', run_worker_first: true }, files: [
      { path: '/index.html', ...file(Buffer.from('<html>proof</html>')), content_type: 'text/html; charset=utf-8' },
      ...[1, 2, 3].map((i) => ({ path: `/assets/${i}.bin`, ...file(Buffer.alloc(options.assetBytes || 750000, i)), content_type: 'application/octet-stream' })),
    ] }, migrations: structuredClone(ASSEMBLED.migrations),
  };
  for (const record of options.assembled ? [...manifest.worker.modules, ...manifest.assets.files, ...manifest.migrations.files] : manifest.migrations.files) {
    contents.set(record.sha256, readFileSync(new URL(`files/${record.sha256}`, FIXTURE)));
  }
  if (options.change) options.change(manifest);
  const raw = options.assembled && !options.change ? ASSEMBLED_BYTES : Buffer.from(JSON.stringify(manifest));
  const sig = sign(null, raw, options.key || KEY);
  const served = new Map([[PREFIX + 'manifest.json', raw], [PREFIX + 'manifest.sig', sig], ...[...contents].map(([hash, bytes]) => [PREFIX + `files/${hash}`, bytes])]);
  if (options.badSignature) { const changed = Buffer.from(raw); changed[changed.length - 1] ^= 1; served.set(PREFIX + 'manifest.json', changed); }
  if (options.badFile) { const hash = manifest.assets.files[1].sha256; const changed = Buffer.from(contents.get(hash)); changed[0] ^= 1; served.set(PREFIX + `files/${hash}`, changed); }
  return { manifest, raw, served, contents };
}
async function setup(t, options = {}) {
  const fixture = release(options);
  if (options.serveChange) options.serveChange(fixture);
  const fetches = [];
  const fetchImpl = async (url, req) => {
    fetches.push({ url, req });
    assert.ok(url.startsWith(BASE), url);
    const bytes = fixture.served.get(url.slice(BASE.length));
    return new Response(bytes || 'missing', { status: bytes ? 200 : 404 });
  };
  const home = mkdtempSync(join(tmpdir(), 'worker-release-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const connectors = join(home, 'connectors');
  const dir = join(connectors, 'cloudflare');
  mkdirSync(dir, { recursive: true });
  // Copy only the Worker runtime files. The existing kit tests temporarily
  // move kit-function.json, so copying that unrelated fixture would race them.
  for (const name of ['index.js', 'worker-release.js', 'manifest.json']) {
    cpSync(fileURLToPath(new URL('../' + name, import.meta.url)), join(dir, name));
  }
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
  const manifestPath = join(dir, 'manifest.json');
  const connectorManifest = JSON.parse(readFileSync(manifestPath));
  connectorManifest.modules.workers.release_hosts = TEST_HOSTS;
  writeFileSync(manifestPath, JSON.stringify(connectorManifest));
  writeFileSync(join(dir, 'release.json'), JSON.stringify(FIXTURE_CONFIG));
  if (options.config === 'missing') unlinkSync(join(dir, 'release.json'));
  else if (options.config !== undefined) writeFileSync(join(dir, 'release.json'), typeof options.config === 'string' ? options.config : JSON.stringify(options.config));
  const env = await createTestGateway({ home, connectorDirs: [connectors], fetchImpl });
  await putActive(env.store, env.fake, { service: 'cloudflare', module: 'workers' });
  const calls = [];
  const script = `${ROOT}/scripts/${options.scriptName ?? INPUT.script_name}`;
  let missing;
  const uploaded = new Set();
  env.fake.auth.proxy = async (req) => {
    calls.push(req);
    if (options.responder) return options.responder(req, calls.length);
    if (req.endpoint === `${script}/assets-upload-session`) {
      const hashes = [...new Set(Object.values(req.body.manifest).map((entry) => entry.hash))];
      missing = options.noneMissing ? [] : hashes.slice(1);
      return envelope({ jwt: options.noneMissing ? COMPLETE : UPLOAD, buckets: missing.length ? [missing] : [] });
    }
    if (req.endpoint === `${ROOT}/assets/upload?base64=true`) {
      if (options.asset413) return refusal(req, 413);
      const form = await parseForm(req);
      for (const [hash] of form) uploaded.add(hash);
      return envelope(uploaded.size === missing.length ? { jwt: COMPLETE } : {});
    }
    if (req.endpoint === script && req.method === 'PUT') return envelope({ id: options.scriptName ?? INPUT.script_name, jwt: COMPLETE });
    if (req.endpoint === `${script}/subdomain`) return options.noSubdomain ? refusal(req, 404, [10007]) : envelope({ enabled: true, previews_enabled: false });
    if (req.endpoint === `${ROOT}/subdomain`) return options.noSubdomain ? refusal(req, 404, [10007]) : envelope({ subdomain: 'wiser-proof' });
    assert.fail(`unexpected request ${req.method} ${req.endpoint}`);
  };
  async function execute(action = 'deploy_worker_release', input = INPUT) {
    const args = { action: `cloudflare.workers.${action}`, input };
    const first = await env.gw.execute(args);
    return first.status === 'needs_confirmation' ? env.gw.execute({ ...args, confirm: true }) : first;
  }
  return { ...env, ...fixture, fetches, calls, execute };
}
async function parseForm(req) {
  assert.deepEqual(Object.keys(req.binary_body).sort(), ['base64', 'content_type']);
  assert.match(req.binary_body.content_type, /^multipart\/form-data; boundary=/);
  assert.equal((req.parameters || []).some((p) => p.name.toLowerCase() === 'content-type'), false);
  return new Request('https://fixture.invalid/', { method: 'POST', headers: { 'Content-Type': req.binary_body.content_type }, body: Buffer.from(req.binary_body.base64, 'base64') }).formData();
}
function noTokens(result, allowCallValues = false) {
  const text = JSON.stringify(result);
  for (const token of [UPLOAD, COMPLETE, ...(allowCallValues ? [] : Object.values(VARS))]) assert.equal(text.includes(token), false, text);
}
function preflight(env, result, reason, paths) {
  assert.equal(result.stage, 'before upload', JSON.stringify(result));
  assert.match(result.reason, reason);
  assert.deepEqual(env.calls, []);
  if (paths) assert.deepEqual(env.fetches.map((f) => f.url.slice(BASE.length)), paths);
  assert.ok(env.fetches.every((f) => f.url.startsWith(BASE)));
  noTokens(result);
}
const signedPaths = [PREFIX + 'manifest.json', PREFIX + 'manifest.sig'];

test('the shipped release config names a listed host and the workers module owns the four actions', () => {
  const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url)));
  assert.ok(manifest.modules.workers.release_hosts.includes(new URL(CONFIG.base).hostname));
  assert.ok(Object.hasOwn(CONFIG.apps, INPUT.app));
  assert.equal(manifest.modules.workers.auth.toolkit, 'CLOUDFLARE_API_KEY');
  assert.equal(manifest.modules.pages.release_hosts, undefined);
  for (const name of ['workers_subdomain', 'get_worker', 'deploy_worker_release', 'delete_worker']) {
    assert.ok(manifest.modules.workers.actions[name]);
    assert.equal(manifest.modules.pages.actions[name], undefined);
  }
});
test('assemble format 2 exact bytes signed by a generated key are accepted with every derived module type', async (t) => {
  const env = await setup(t, { assembled: true, noneMissing: true });
  assert.deepEqual(env.raw, ASSEMBLED_BYTES);
  const result = await env.execute();
  assert.equal(result.script_name, INPUT.script_name, JSON.stringify(result));
  const metadata = JSON.parse((await parseForm(env.calls.find((c) => c.method === 'PUT'))).get('metadata'));
  assert.deepEqual(metadata.bindings.slice(2), Object.entries(VARS).map(([name, text]) => ({ name, text, type: 'plain_text' })));
  const form = await parseForm(env.calls.find((c) => c.method === 'PUT'));
  for (const module of ASSEMBLED.worker.modules) {
    assert.equal(form.get(module.name).type, module.type);
    assert.deepEqual(Buffer.from(await form.get(module.name).arrayBuffer()), env.contents.get(module.sha256));
  }
  assert.ok(env.fetches.every(({ url }) => TEST_HOSTS.includes(new URL(url).hostname)));
  assert.deepEqual(result.fetched, [...env.served.keys()]);
  assert.deepEqual(trace(env.calls), [['POST', `${SCRIPT}/assets-upload-session`], ['PUT', SCRIPT], ['POST', `${SCRIPT}/subdomain`], ['GET', `${ROOT}/subdomain`]]);
  assert.ok(ASSEMBLED.migrations.files.length > 0);
  assert.equal(env.calls.some((c) => c.endpoint.includes('/d1/')), false);
  noTokens(result);
});
test('good release splits a returned bucket into capped multipart requests and reports the whole proof', async (t) => {
  const env = await setup(t, { scriptBytes: 1600000 });
  const result = await env.execute();
  assert.equal(result.script_name, INPUT.script_name, JSON.stringify(result));
  const uploads = env.calls.filter((c) => c.endpoint.includes('/assets/upload?'));
  assert.equal(uploads.length, 2);
  assert.deepEqual(trace(env.calls), [ ['POST', `${SCRIPT}/assets-upload-session`], ...uploads.map(() => ['POST', `${ROOT}/assets/upload?base64=true`]), ['PUT', SCRIPT], ['POST', `${SCRIPT}/subdomain`], ['GET', `${ROOT}/subdomain`] ]);
  const sessionManifest = env.calls[0].body.manifest;
  assert.deepEqual(Object.keys(sessionManifest), env.manifest.assets.files.map((f) => f.path));
  const expectedHash = (bytes, path) => sha(bytes.toString('base64') + path.slice(path.lastIndexOf('.'))).slice(0, 32);
  assert.deepEqual(sessionManifest, Object.fromEntries(env.manifest.assets.files.map((f) => [f.path, { hash: expectedHash(env.contents.get(f.sha256), f.path), size: f.size }])));
  for (const req of uploads) {
    assert.ok(req.binary_body.base64.length <= CAP);
    assert.equal(req.body, undefined);
    assert.deepEqual(req.parameters.map((p) => [p.name, p.type]), [['Authorization', 'header']]);
    assert.equal(req.parameters[0].value, `Bearer ${UPLOAD}`);
    const form = await parseForm(req);
    for (const [hash, value] of form) {
      assert.ok(/^[0-9a-f]{32}$/.test(hash));
      const item = env.manifest.assets.files.find((f) => sessionManifest[f.path].hash === hash);
      assert.equal(value.type, item.content_type);
      assert.deepEqual(Buffer.from(await value.text(), 'base64'), env.contents.get(item.sha256));
    }
  }
  const put = env.calls.at(-3);
  assert.ok(put.binary_body.base64.length <= CAP);
  assert.equal(put.parameters, undefined);
  const form = await parseForm(put);
  const metadata = JSON.parse(form.get('metadata'));
  assert.deepEqual(metadata, { main_module: 'index.js', compatibility_date: '2026-10-18', compatibility_flags: ['nodejs_compat'],
    bindings: [{ type: 'd1', name: 'DB', database_id: DATABASE }, { type: 'assets', name: 'ASSETS' }, ...Object.entries(VARS).map(([name, text]) => ({ name, text, type: 'plain_text' }))],
    assets: { jwt: COMPLETE, config: env.manifest.assets.config } });
  assert.deepEqual([...form.keys()], ['metadata', 'index.js', 'pad.js']);
  for (const module of env.manifest.worker.modules) assert.deepEqual(Buffer.from(await form.get(module.name).arrayBuffer()), env.contents.get(module.sha256));
  assert.deepEqual(env.calls.at(-2).body, { enabled: true, previews_enabled: false });
  assert.equal(result.script_name, INPUT.script_name);
  assert.equal(result.app, INPUT.app); assert.equal(result.version, INPUT.version);
  assert.equal(result.key_id, FIXTURE_CONFIG.apps[INPUT.app].keys[0].id);
  assert.equal(result.manifest_sha256, sha(env.raw));
  assert.deepEqual(result.worker, { modules: env.manifest.worker.modules.map((m) => ({ name: m.name, bytes: m.size, sha256: m.sha256 })), request_bytes: put.binary_body.base64.length });
  assert.deepEqual(result.assets, { files: 4, uploaded: 3, already_present: 1, requests: uploads.map((r, i) => ({ files: i === 0 ? 2 : 1, body_bytes: r.binary_body.base64.length })) });
  assert.deepEqual(result.database_binding, { name: 'DB', database_id: DATABASE });
  assert.equal(result.url, 'https://proof-worker.wiser-proof.workers.dev/');
  assert.deepEqual(result.fetched, [...env.served.keys()]);
  assert.deepEqual(result.calls, env.calls.map((c) => ({ method: c.method, endpoint: c.endpoint.replace(`/accounts/${ACCOUNT}`, ''), body_bytes: c.binary_body?.base64.length ?? (c.body ? Buffer.byteLength(JSON.stringify(c.body)) : 0) })));
  assert.deepEqual(env.fetches.map((f) => f.url), result.fetched.map((path) => BASE + path));
  noTokens(result);
});
test('unlisted app refuses before any fetch or proxy call', async (t) => {
  const env = await setup(t); const result = await env.execute('deploy_worker_release', { ...INPUT, app: 'unlisted' });
  preflight(env, result, /app is not listed/, []);
});
test('signature check refuses one changed manifest byte before fetching any file', async (t) => {
  const env = await setup(t, { badSignature: true });
  preflight(env, await env.execute(), /release signature invalid/, signedPaths);
});
test('signature check refuses a second signing key before fetching any file', async (t) => {
  const env = await setup(t, { key: SECOND_KEY });
  preflight(env, await env.execute(), /release signature invalid/, signedPaths);
});
test('valid signature naming another version refuses before proxy calls', async (t) => {
  const env = await setup(t, { change: (m) => { m.version = '2.0.0'; } });
  preflight(env, await env.execute(), /release names another version/, signedPaths);
});
test('file hash check refuses one changed file byte, names the hash and never calls proxy', async (t) => {
  const env = await setup(t, { badFile: true });
  preflight(env, await env.execute(), new RegExp(`release file mismatch: ${env.manifest.assets.files[1].sha256}`));
});
test('script request over 3 MiB refuses and names its base64 bytes before proxy calls', async (t) => {
  const env = await setup(t, { scriptBytes: 2400000 });
  const result = await env.execute(); preflight(env, result, /Worker upload request too large: [0-9]+ bytes/);
  assert.ok(result.request_bytes > CAP); assert.equal(result.limit_bytes, CAP);
  assert.ok(result.reason.includes(String(result.request_bytes)));
});
test('a single oversized double-base64 asset refuses before proxy calls', async (t) => {
  const env = await setup(t, { assetBytes: 1800000 });
  const result = await env.execute(); preflight(env, result, /asset upload request too large/); assert.ok(result.request_bytes > CAP);
});
test('413 asset upload returns its batch report without a script PUT or either token', async (t) => {
  const env = await setup(t, { asset413: true }); const result = await env.execute();
  assert.deepEqual(trace(env.calls), [['POST', `${SCRIPT}/assets-upload-session`], ['POST', `${ROOT}/assets/upload?base64=true`]]);
  assert.equal(result.status, 'vendor_error'); assert.equal(result.http_status, 413);
  assert.equal(result.reason, 'request too large'); assert.deepEqual(result.batch, { files: 2, bytes: env.calls[1].binary_body.base64.length });
  assert.equal(result.limit_bytes, CAP); assert.equal(result.batches_sent, 0); assert.equal(result.batches, 2); noTokens(result);
});
test('empty upload buckets use the session completion token directly', async (t) => {
  const env = await setup(t, { noneMissing: true }); const result = await env.execute();
  assert.deepEqual(trace(env.calls), [['POST', `${SCRIPT}/assets-upload-session`], ['PUT', SCRIPT], ['POST', `${SCRIPT}/subdomain`], ['GET', `${ROOT}/subdomain`]]);
  assert.deepEqual(result.assets, { files: 4, uploaded: 0, already_present: 4, requests: [] });
  assert.equal(JSON.parse((await parseForm(env.calls[1])).get('metadata')).assets.jwt, COMPLETE); noTokens(result);
});
test('deployment succeeds with null URL if the account has no subdomain', async (t) => {
  const env = await setup(t, { noneMissing: true, noSubdomain: true }); const result = await env.execute();
  assert.equal(result.script_name, INPUT.script_name); assert.equal(result.url, null); assert.match(result.reason, /no workers.dev subdomain/);
  assert.deepEqual(trace(env.calls), [['POST', `${SCRIPT}/assets-upload-session`], ['PUT', SCRIPT], ['POST', `${SCRIPT}/subdomain`], ['GET', `${ROOT}/subdomain`]]); noTokens(result);
});
for (const [name, config, reason] of [ ['missing', 'missing', /^release\.json is missing$/], ['malformed', '{', /^release\.json is malformed$/], ['unlisted base host', { ...FIXTURE_CONFIG, base: 'https://other.example.test/' }, /^release\.json is malformed or its base host is not in release_hosts$/], ['wrong key length', { ...FIXTURE_CONFIG, apps: { 'wiser-crm': { keys: [{ id: '0123456789abcdef', ed25519: 'bad' }] } } }, /^release\.json is malformed or its base host is not in release_hosts$/] ]) {
  test(`release.json ${name} refuses before any fetch or proxy call`, async (t) => {
    const env = await setup(t, { config }); preflight(env, await env.execute(), reason, []);
  });
}
for (const [name, change] of [
  ['unknown top level key', (m) => { m.extra = true; }],
  ['unknown worker key', (m) => { m.worker.url = BASE; }],
  ['unknown file key', (m) => { m.worker.modules[0].url = BASE; }],
  ['bad file digest', (m) => { m.worker.modules[0].sha256 = '../file'; }],
  ['fractional file size', (m) => { m.worker.modules[0].size = 1.5; }],
  ['per-file cap', (m) => { m.worker.modules[0].size = 25 * 1024 * 1024 + 1; }],
  ['total cap', (m) => { m.assets.files.forEach((f) => { f.size = 25 * 1024 * 1024; }); }],
  ['too many modules', (m) => { m.worker.modules = Array(51).fill(m.worker.modules[0]); }],
  ['too many assets', (m) => { m.assets.files = Array(20001).fill(m.assets.files[0]); }],
  ['duplicate module', (m) => { m.worker.modules.push(m.worker.modules[0]); }],
  ['duplicate asset', (m) => { m.assets.files.push(m.assets.files[0]); }],
  ['parent module', (m) => { m.worker.modules[0].name = '../index.js'; }],
  ['absolute module', (m) => { m.worker.modules[0].name = '/index.js'; }],
  ['missing main module', (m) => { m.worker.main_module = 'absent.js'; }],
  ['module MIME injection', (m) => { m.worker.modules[0].type = 'text/plain\r\nx: y'; }],
  ['relative asset', (m) => { m.assets.files[0].path = 'index.html'; }],
  ['parent asset', (m) => { m.assets.files[0].path = '/a/../index.html'; }],
  ['empty path segment', (m) => { m.assets.files[0].path = '/a//index.html'; }],
  ['backslash path', (m) => { m.assets.files[0].path = '/a\\index.html'; }],
  ['oversized path', (m) => { m.assets.files[0].path = '/' + 'a'.repeat(512); }],
  ['asset MIME injection', (m) => { m.assets.files[0].content_type = 'text/html\r\nx: y'; }],
  ['wrong asset config type', (m) => { m.assets.config.run_worker_first = 1; }],
  ['unknown asset config key', (m) => { m.assets.config.binding = 'ASSETS'; }],
  ['wrong config enum', (m) => { m.assets.config.html_handling = 'bad'; }],
  ['invalid compatibility date', (m) => { m.worker.compatibility_date = '2026-02-31'; }],
  ['bad flag', (m) => { m.worker.compatibility_flags = [false]; }],
  ['same binding names', (m) => { m.worker.assets_binding = 'DB'; }],
  ['migration array instead of format-2 object', (m) => { m.migrations = ['DROP TABLE users']; }],
  ['source.repository removed', (m) => { delete m.source.repository; }],
  ['source.f1.limit removed', (m) => { delete m.source.f1.limit; }],
  ['source.commit invalid', (m) => { m.source.commit = 'a'.repeat(39); }],
  ['upstream_commit invalid', (m) => { m.source.upstream_commit = 'g'.repeat(40); }],
  ['source.f1 negative count', (m) => { m.source.f1.count = -1; }],
  ['source.f1 negative limit', (m) => { m.source.f1.limit = -1; }],
  ['source.f1 fractional count', (m) => { m.source.f1.count = 0.5; }],
  ['source.f1 unsafe limit', (m) => { m.source.f1.limit = 2 ** 53; }],
  ['source.f1 excess', (m) => { m.source.f1.count = m.source.f1.limit + 1; }],
  ...['lockfile', 'install_log', 'bundle_inputs'].map((key) => [`checks.${key} not PASS`, (m) => { m.checks[key] = 'FAIL'; }]),
  ['format 1', (m) => { m.format = 1; }],
  ['run_worker_first false', (m) => { m.assets.config.run_worker_first = false; }],
  ['run_worker_first missing', (m) => { delete m.assets.config.run_worker_first; }],
  ['cjs module typed as ESM', (m) => { m.worker.modules[1].name = 'pad.cjs'; }],
  ['unknown module extension', (m) => { m.worker.modules[1].name = 'pad.json'; }],
  ['vars_required invalid name', (m) => { m.worker.vars_required[0] = 'lowercase'; }],
  ['vars_required duplicate', (m) => { m.worker.vars_required.push(m.worker.vars_required[0]); }],
  ['vars_required secret name', (m) => { m.worker.vars_required.push('AGENT_CLIENT_SECRET'); }],
  ['vars_required resource collision', (m) => { m.worker.vars_required.push('DB'); }],
  ['migration table injection', (m) => { m.migrations.table = 'history; DROP TABLE users'; }],
  ['migration duplicate', (m) => { m.migrations.files.push(m.migrations.files[0]); }],
  ['migration parent name', (m) => { m.migrations.files[0].name = '../0001_baseline.sql'; }],
  ['migration size fraction', (m) => { m.migrations.files[0].size = 0.5; }],
  ['migration bad digest', (m) => { m.migrations.files[0].sha256 = 'g'.repeat(64); }],
  ['key order', (m) => { m.checks = { install_log: 'PASS', lockfile: 'PASS', bundle_inputs: 'PASS' }; }],
]) {
  test(`signed manifest rejects ${name} before any file fetch or proxy call`, async (t) => {
    const env = await setup(t, { change }); const result = await env.execute();
    preflight(env, result, /release/, name === 'too many assets' ? signedPaths.slice(0, 1) : signedPaths);
  });
}
test('gateway confirmation displays every deploy input before any fetch and runs only after confirm', async (t) => {
  const env = await setup(t, { noneMissing: true });
  const args = { action: 'cloudflare.workers.deploy_worker_release', input: INPUT };
  const stop = await env.gw.execute(args);
  assert.equal(stop.status, 'needs_confirmation', JSON.stringify(stop));
  for (const [name, value] of Object.entries(INPUT)) {
    const field = stop.input_values.find((field) => field.name === name);
    assert.ok(field); assert.deepEqual(JSON.parse(field.full ?? field.value), value);
  }
  noTokens(stop, true);
  assert.deepEqual(env.fetches, []); assert.deepEqual(env.calls, []);
  const result = await env.gw.execute({ ...args, confirm: true }); assert.equal(result.script_name, INPUT.script_name);
  assert.deepEqual(trace(env.calls), [['POST', `${SCRIPT}/assets-upload-session`], ['PUT', SCRIPT], ['POST', `${SCRIPT}/subdomain`], ['GET', `${ROOT}/subdomain`]]); noTokens(result);
});
for (const [name, present, delete404] of [['deleted and absent', false, false], ['still present is a failure', true, false], ['404 on delete is already absent', false, true]]) {
  test(`delete_worker ${name}`, async (t) => {
    const env = await setup(t, { responder: (req) => {
      if (req.method === 'DELETE') return delete404 ? refusal(req, 404) : envelope(null);
      if (req.endpoint.endsWith('/deployments')) return present ? envelope({ deployments: [{ versions: [{ version_id: VERSION_ID, percentage: 100 }] }] }) : refusal(req, 404);
      return envelope({ resources: { bindings: [] } });
    } });
    const result = await env.execute('delete_worker', readInput);
    assert.deepEqual(trace(env.calls), [['DELETE', SCRIPT], ...(!delete404 ? [['GET', `${SCRIPT}/deployments`], ...(present ? [['GET', `${SCRIPT}/versions/${VERSION_ID}`]] : [])] : [])]);
    if (delete404) { assert.equal(result.deleted, null); assert.equal(result.reason, 'no such Worker'); }
    else assert.equal(result.deleted, INPUT.script_name);
    assert.equal(result.read_back, present ? 'present' : 'absent');
    if (present) assert.equal(result.success, false);
    noTokens(result);
  });
}
test('get_worker returns only deployed version ids and binding names/types plus D1 database id', async (t) => {
  const env = await setup(t, { responder: (req) => req.endpoint.endsWith('/deployments') ? envelope({ deployments: [{ versions: [{ version_id: VERSION_ID, percentage: 100 }] }] }) : envelope({ resources: { bindings: [
    { type: 'd1', name: 'DB', database_id: DATABASE, secret: UPLOAD }, { type: 'assets', name: 'ASSETS', id: UPLOAD }, { type: 'secret_text', name: 'AGENT_KEY', text: COMPLETE },
  ] } }) });
  const result = await env.execute('get_worker', readInput);
  assert.deepEqual(trace(env.calls), [['GET', `${SCRIPT}/deployments`], ['GET', `${SCRIPT}/versions/${VERSION_ID}`]]);
  assert.equal(result.exists, true); assert.equal(result.version_id, VERSION_ID);
  assert.deepEqual(result.bindings, [{ type: 'd1', name: 'DB', database_id: DATABASE }, { type: 'assets', name: 'ASSETS' }, { type: 'secret_text', name: 'AGENT_KEY' }]); noTokens(result);
});
for (const status of [404, 403, 500]) test(`get_worker HTTP ${status}`, async (t) => {
  const env = await setup(t, { responder: (req) => refusal(req, status) });
  const result = await env.execute('get_worker', readInput);
  assert.deepEqual(trace(env.calls), [['GET', `${SCRIPT}/deployments`]]);
  if (status === 404) assert.equal(result.exists, false); else assert.equal(result.status, 'vendor_error'); noTokens(result);
});
for (const [name, status, codes] of [['with subdomain', 200], ['without subdomain', 404, [10007]], ['10007 without 404', 400, [10007]], ['403 stays vendor_error', 403, [10007]]]) {
  test(`workers_subdomain ${name}`, async (t) => {
    const env = await setup(t, { responder: (req) => status === 200 ? envelope({ subdomain: 'wiser-proof' }) : refusal(req, status, codes) });
    const result = await env.execute('workers_subdomain', { account_id: ACCOUNT });
    assert.deepEqual(trace(env.calls), [['GET', `${ROOT}/subdomain`]]);
    if (status === 403) assert.equal(result.status, 'vendor_error');
    else { assert.equal(result.exists, status === 200); assert.equal(result.subdomain, status === 200 ? 'wiser-proof' : null); }
    noTokens(result);
  });
}
test('provider diagnostics containing both tokens never appear in a refusal', async (t) => {
  const env = await setup(t, { responder: () => { throw { object: { status: 'vendor_error', http_status: 403, reason: UPLOAD + COMPLETE, endpoint: UPLOAD } }; } });
  const result = await env.execute();
  assert.deepEqual(trace(env.calls), [['POST', `${SCRIPT}/assets-upload-session`]]);
  assert.equal(result.status, 'vendor_error'); noTokens(result);
});

test('each admitted key is tried until a key verifies', async (t) => {
  const wrong = { id: '0123456789abcdef', ed25519: Buffer.alloc(32, 2).toString('base64') };
  const config = structuredClone(FIXTURE_CONFIG); config.apps[INPUT.app].keys.unshift(wrong);
  const env = await setup(t, { config, noneMissing: true }); const result = await env.execute();
  assert.equal(result.key_id, FIXTURE_CONFIG.apps[INPUT.app].keys[0].id);
  assert.deepEqual(trace(env.calls), [['POST', `${SCRIPT}/assets-upload-session`], ['PUT', SCRIPT], ['POST', `${SCRIPT}/subdomain`], ['GET', `${ROOT}/subdomain`]]); noTokens(result);
});
for (const length of ['shorter', 'longer']) test(`file ${length} than declared refuses with its hash before any proxy call`, async (t) => {
  const env = await setup(t, { serveChange: (r) => {
    const hash = r.manifest.assets.files[1].sha256; const path = PREFIX + `files/${hash}`;
    const bytes = r.served.get(path); r.served.set(path, length === 'shorter' ? bytes.subarray(1) : Buffer.concat([bytes, Buffer.from('x')]));
  } });
  preflight(env, await env.execute(), new RegExp(`release file mismatch: ${env.manifest.assets.files[1].sha256}`));
});
for (const [name, reply] of [
  ['unknown hash', { jwt: UPLOAD, buckets: [['f'.repeat(32)]] }],
  ['duplicate hash in one bucket', null],
  ['missing token', { buckets: [] }],
]) test(`malformed session ${name} refuses without uploading or leaking tokens`, async (t) => {
  const env = await setup(t, { responder: (req) => {
    const hash = Object.values(req.body.manifest)[0].hash;
    return envelope(reply || { jwt: UPLOAD, buckets: [[hash, hash]] });
  } }); const result = await env.execute();
  assert.equal(result.status, 'vendor_error');
  assert.deepEqual(trace(env.calls), [['POST', `${SCRIPT}/assets-upload-session`]]); noTokens(result);
});
for (const index of [1, 2, 3, 4, 5, 6]) test(`vendor refusal at call ${index} never leaks either token or proceeds`, async (t) => {
  const env = await setup(t); const normal = env.fake.auth.proxy;
  env.fake.auth.proxy = (req) => {
    if (env.calls.length + 1 === index) {
      env.calls.push(req);
      throw { object: { status: 'vendor_error', http_status: 500, reason: UPLOAD + COMPLETE, endpoint: COMPLETE, body: UPLOAD } };
    }
    return normal(req);
  };
  const result = await env.execute();
  assert.equal(result.status, 'vendor_error');
  const expected = [['POST', `${SCRIPT}/assets-upload-session`], ['POST', `${ROOT}/assets/upload?base64=true`], ['POST', `${ROOT}/assets/upload?base64=true`], ['PUT', SCRIPT], ['POST', `${SCRIPT}/subdomain`], ['GET', `${ROOT}/subdomain`]];
  assert.deepEqual(trace(env.calls), expected.slice(0, index)); noTokens(result);
});
test('gradual deployment returns each active version and its own safe binding projection', async (t) => {
  const second = '23456789-2345-2345-2345-23456789abcd';
  const env = await setup(t, { responder: (req) => req.endpoint.endsWith('/deployments')
    ? envelope({ deployments: [{ versions: [{ version_id: VERSION_ID, percentage: 60 }, { version_id: second, percentage: 40 }] }] })
    : envelope({ resources: { bindings: [{ name: 'KEY', type: 'secret_text', text: COMPLETE }] } }) });
  const result = await env.execute('get_worker', readInput);
  assert.deepEqual(trace(env.calls), [['GET', `${SCRIPT}/deployments`], ['GET', `${SCRIPT}/versions/${VERSION_ID}`], ['GET', `${SCRIPT}/versions/${second}`]]);
  assert.equal(result.exists, true); assert.equal(result.version_id, null); assert.deepEqual(result.bindings, []);
  assert.deepEqual(result.versions, [VERSION_ID, second].map((version_id, i) => ({ version_id, percentage: i ? 40 : 60, bindings: [{ name: 'KEY', type: 'secret_text' }] }))); noTokens(result);
});
test('a Worker without a deployment returns null version and settings bindings', async (t) => {
  const env = await setup(t, { responder: (req) => req.endpoint.endsWith('/deployments') ? envelope({ deployments: [] }) : envelope({ bindings: [] }) });
  const result = await env.execute('get_worker', readInput);
  assert.deepEqual(trace(env.calls), [['GET', `${SCRIPT}/deployments`], ['GET', `${SCRIPT}/settings`]]);
  assert.equal(result.exists, true); assert.equal(result.version_id, null); assert.deepEqual(result.bindings, []); noTokens(result);
});

test('unexpected vendor echoes in safe-looking fields still cannot disclose known upload tokens', async (t) => {
  const env = await setup(t, { noneMissing: true }); const normal = env.fake.auth.proxy;
  env.fake.auth.proxy = (req) => {
    if (req.endpoint === `${ROOT}/subdomain`) { env.calls.push(req); return envelope({ subdomain: COMPLETE }); }
    return normal(req);
  };
  const result = await env.execute();
  assert.deepEqual(trace(env.calls), [['POST', `${SCRIPT}/assets-upload-session`], ['PUT', SCRIPT], ['POST', `${SCRIPT}/subdomain`], ['GET', `${ROOT}/subdomain`]]);
  noTokens(result);
});
test('a diagnostic status field cannot smuggle a token into a refusal', async (t) => {
  const env = await setup(t, { responder: () => { throw { object: { status: 'vendor_error', http_status: COMPLETE } }; } });
  const result = await env.execute();
  assert.deepEqual(trace(env.calls), [['POST', `${SCRIPT}/assets-upload-session`]]);
  assert.equal(result.status, 'vendor_error'); noTokens(result);
});

// Repeat the brief's malformed cases against the unmodified assemble fixture's shape.
for (const [name, change] of [
  ['source.repository removed', (m) => { delete m.source.repository; }],
  ['source.f1.limit removed', (m) => { delete m.source.f1.limit; }],
  ['unknown key', (m) => { m.unrecognised = true; }],
  ['run_worker_first false', (m) => { m.assets.config.run_worker_first = false; }],
  ['format 1', (m) => { m.format = 1; }],
  ['cjs module typed as ESM', (m) => { m.worker.modules.find((f) => f.name.endsWith('.cjs')).type = 'application/javascript+module'; }],
]) test(`assemble fixture refuses ${name} before content fetch or proxy`, async (t) => {
  const env = await setup(t, { assembled: true, change });
  preflight(env, await env.execute(), /release/, signedPaths);
});
for (const location of ['source', 'f1', 'checks', 'worker', 'module', 'assets', 'config', 'asset', 'migrations', 'migration']) {
  test(`unknown ${location} key refused before content fetch or proxy`, async (t) => {
    const env = await setup(t, { assembled: true, change: (m) => {
      const object = { source: m.source, f1: m.source.f1, checks: m.checks, worker: m.worker, module: m.worker.modules[0],
        assets: m.assets, config: m.assets.config, asset: m.assets.files[0], migrations: m.migrations, migration: m.migrations.files[0] }[location];
      object.extra = true;
    } });
    preflight(env, await env.execute(), /release/, signedPaths);
  });
}
test('assemble fixture migration hash changed is refused before proxy', async (t) => {
  const changed = 'f'.repeat(64);
  const env = await setup(t, { assembled: true, change: (m) => { m.migrations.files[0].sha256 = changed; }, serveChange: (r) => {
    r.served.set(PREFIX + `files/${changed}`, r.contents.get(ASSEMBLED.migrations.files[0].sha256));
  } });
  preflight(env, await env.execute(), new RegExp(`release file mismatch: ${changed}`));
});
for (const length of ['shorter', 'longer']) test(`migration ${length} than declared refuses before proxy`, async (t) => {
  const env = await setup(t, { assembled: true, serveChange: (r) => {
    const key = PREFIX + `files/${r.manifest.migrations.files[0].sha256}`;
    const bytes = r.served.get(key);
    r.served.set(key, length === 'shorter' ? bytes.subarray(1) : Buffer.concat([bytes, Buffer.from('x')]));
  } });
  preflight(env, await env.execute(), /release file mismatch/);
});
for (const kind of ['missing', 'extra']) test(`assemble fixture vars name ${kind} refuses after verified shape before content fetch`, async (t) => {
  const env = await setup(t, { assembled: true });
  const vars = { ...VARS };
  if (kind === 'missing') delete vars.ACCESS_AUD; else vars.EXTRA_NAME = 'extra-fixture-value';
  preflight(env, await env.execute('deploy_worker_release', { ...INPUT, vars }), /vars_required/, signedPaths);
});
for (const [name, vars] of [
  ['null', null], ['array', []], ['string', 'value'], ['non-string value', { ACCESS_AUD: 1 }],
  ['lowercase name', { audience: 'fixture' }], ['long name', { ['A'.repeat(65)]: 'fixture' }],
  ['513 code points', { ACCESS_AUD: 'a'.repeat(513) }], ['513 astral code points', { ACCESS_AUD: '𐐀'.repeat(513) }],
  ...['AGENT_CLIENT_SECRET', 'API_TOKEN', 'PASSWORD', 'API_KEY', 'PRIVATE_KEY', 'CREDENTIALS', 'AUTHORIZATION'].map((key) => [key, { [key]: 'invented-secret-value' }]),
]) test(`vars input ${name} refuses before any fetch`, async (t) => {
  const env = await setup(t);
  const result = await env.execute('deploy_worker_release', { ...INPUT, vars });
  assert.equal(result.status, 'invalid_arguments');
  assert.deepEqual(env.fetches, []); assert.deepEqual(env.calls, []);
  noTokens(result);
  assert.equal(JSON.stringify(result).includes('invented-secret-value'), false);
});
test('vars 512 Unicode code points and empty values are accepted and uploaded unchanged', async (t) => {
  const vars = { ACCESS_TEAM_DOMAIN: '𐐀'.repeat(512), ACCESS_AUD: '', AGENT_CLIENT_ID: 'fixture-client-id' };
  const env = await setup(t, { assembled: true, noneMissing: true });
  const result = await env.execute('deploy_worker_release', { ...INPUT, vars });
  assert.equal(result.script_name, INPUT.script_name);
  const form = await parseForm(env.calls.find((c) => c.method === 'PUT'));
  assert.deepEqual(JSON.parse(form.get('metadata')).bindings.slice(2), Object.entries(vars).map(([name, text]) => ({ name, text, type: 'plain_text' })));
  assert.equal(JSON.stringify(result).includes(vars.ACCESS_TEAM_DOMAIN), false);
  noTokens(result);
});
test('a release with no required variables accepts an empty vars object', async (t) => {
  const env = await setup(t, { assembled: true, noneMissing: true, change: (m) => { m.worker.vars_required = []; } });
  assert.equal((await env.execute('deploy_worker_release', { ...INPUT, vars: {} })).script_name, INPUT.script_name);
});
test('signature and shape refusals precede exact variable-name comparison', async (t) => {
  const env = await setup(t, { assembled: true, key: SECOND_KEY });
  preflight(env, await env.execute('deploy_worker_release', { ...INPUT, vars: {} }), /release signature invalid/, signedPaths);
  const malformed = await setup(t, { assembled: true, change: (m) => { delete m.source.repository; } });
  preflight(malformed, await malformed.execute('deploy_worker_release', { ...INPUT, vars: {} }), /release source malformed/, signedPaths);
});
test('valid subdomain labels are reported while provider diagnostic variable echoes are omitted', async (t) => {
  const env = await setup(t, { noneMissing: true });
  const normal = env.fake.auth.proxy;
  env.fake.auth.proxy = (req) => {
    if (req.endpoint === `${ROOT}/subdomain`) { env.calls.push(req); return envelope({ subdomain: VARS.ACCESS_AUD }); }
    return normal(req);
  };
  const result = await env.execute();
  assert.equal(result.url, `https://${INPUT.script_name}.${VARS.ACCESS_AUD}.workers.dev/`);
  noTokens(result, true);
  const refused = await setup(t, { responder: () => { throw { object: { status: 'vendor_error', http_status: 500, reason: Object.values(VARS).join(' ') + UPLOAD + COMPLETE } }; } });
  noTokens(await refused.execute());
});
for (const input of [null, [], 'input', { ...INPUT, extra: 'invented-secret-value' }, { ...INPUT, account_id: 1 }, { ...INPUT, vars: undefined }]) {
  test('gateway refuses malformed deploy input before transport', async (t) => {
    const env = await setup(t);
    const result = await env.execute('deploy_worker_release', input);
    assert.equal(result.status, 'invalid_arguments');
    assert.deepEqual(env.fetches, []); assert.deepEqual(env.calls, []);
    noTokens(result);
  });
}
for (const [field, value] of [['app', '../app'], ['app', 'https://example.test/'], ['version', '../1.0.0'], ['version', '01.0.0'], ['version', '1.0.0?url=x']]) {
  test(`gateway rejects unsafe ${field} before transport`, async (t) => {
    const env = await setup(t);
    const result = await env.execute('deploy_worker_release', { ...INPUT, [field]: value });
    assert.equal(result.status, 'invalid_arguments');
    assert.deepEqual(env.fetches, []); assert.deepEqual(env.calls, []);
    noTokens(result);
  });
}

test('short plain variables preserve result hashes, identifiers and vendor statuses', async (t) => {
  const vars = { ACCESS_TEAM_DOMAIN: 'a', ACCESS_AUD: '1', AGENT_CLIENT_ID: 'f' };
  const env = await setup(t, { assembled: true, noneMissing: true });
  const result = await env.execute('deploy_worker_release', { ...INPUT, vars });
  assert.equal(result.script_name, INPUT.script_name);
  assert.equal(result.app, INPUT.app); assert.equal(result.version, INPUT.version);
  assert.equal(result.manifest_sha256, sha(ASSEMBLED_BYTES));
  assert.deepEqual(result.worker.modules.map((m) => m.sha256), ASSEMBLED.worker.modules.map((m) => m.sha256));
  assert.equal(result.url, `https://${INPUT.script_name}.wiser-proof.workers.dev/`);
  assert.equal(result.reason, undefined);
  const failed = await setup(t, { responder: (req) => refusal(req, 500) });
  const error = await failed.execute('deploy_worker_release', { ...INPUT, vars });
  assert.equal(error.status, 'vendor_error');
  assert.equal(error.http_status, 500);
});

test('deploy reports the live WISER_INSTANCE coincidence in its script address', async (t) => {
  const scriptName = 'wiser-proof-crm-m6-20261026';
  const env = await setup(t, { scriptName, noneMissing: true,
    change: (m) => { m.worker.vars_required.push('WISER_INSTANCE'); } });
  const result = await env.execute('deploy_worker_release', { ...INPUT, script_name: scriptName, vars: { ...VARS, WISER_INSTANCE: 'wiser-proof' } });
  assert.equal(result.script_name, scriptName);
  assert.equal(result.url, `https://${scriptName}.wiser-proof.workers.dev/`);
  assert.equal(result.reason, undefined); noTokens(result);
});
test('deploy rejects a subdomain failing LABEL with vendor_error and no address', async (t) => {
  const env = await setup(t, { noneMissing: true });
  const normal = env.fake.auth.proxy;
  env.fake.auth.proxy = (req) => {
    if (req.endpoint === `${ROOT}/subdomain`) { env.calls.push(req); return envelope({ subdomain: 'invalid.label/' + UPLOAD }); }
    return normal(req);
  };
  const result = await env.execute();
  assert.equal(result.status, 'vendor_error'); assert.equal(result.url, undefined); noTokens(result);
});
test('the release module reads nothing from disk, so the hosted bundle can carry it', () => {
  // The hosted service bundles with node:fs aliased and import.meta.url fixed to one
  // address, so a file read beside this module finds nothing there.
  const source = readFileSync(new URL('../worker-release.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /(?:\bfrom\s+|\brequire\s*\(\s*|\bimport\s*\(\s*)['"](?:node:)?fs(?:\/promises)?['"]/);
  assert.doesNotMatch(source, /import\.meta\.url/);
});
