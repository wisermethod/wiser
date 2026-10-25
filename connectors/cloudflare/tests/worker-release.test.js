import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createPrivateKey, sign } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestGateway, putActive } from '../../../gateway/test/fake-provider.js';

const ACCOUNT = '0123456789abcdef0123456789abcdef';
const DATABASE = '01234567-89ab-cdef-0123-456789abcdef';
const VERSION_ID = '12345678-1234-1234-1234-123456789abc';
const INPUT = { account_id: ACCOUNT, script_name: 'proof-worker', app: 'wiser-crm-proof', version: '1.0.0', database_id: DATABASE };
const BASE = 'https://releases.example.test/';
const ROOT = `/accounts/${ACCOUNT}/workers`;
const SCRIPT = `${ROOT}/scripts/${INPUT.script_name}`;
const PREFIX = `${INPUT.app}/${INPUT.version}/`;
const CAP = 3 * 1024 * 1024;
const UPLOAD = 'fixture-upload-token-private';
const COMPLETE = 'fixture-completion-token-private';
const sha = (value) => createHash('sha256').update(value).digest('hex');
// RFC 8032 test vector 1. The private half exists only in this test file.
const privateKey = (seed) => createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]), format: 'der', type: 'pkcs8' });
const KEY = privateKey(Buffer.from('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60', 'hex'));
const SECOND_KEY = privateKey(Buffer.alloc(32, 2));
const CONFIG = JSON.parse(readFileSync(new URL('../release.json', import.meta.url)));
const FIXTURE_CONFIG = { format: 1, base: BASE, apps: { 'wiser-crm-proof': { keys: [{ id: '21fe31dfa154a261', ed25519: '11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo=' }] } } };
const envelope = (result) => ({ status: 200, data: { success: true, result, errors: [], messages: [] } });
const refusal = (req, status, codes) => ({ status, error: { code: 'vendor_error', endpoint: req.endpoint, method: req.method, provider_codes: codes } });
const trace = (calls) => calls.map(({ method, endpoint }) => [method, endpoint]);
const readInput = { account_id: ACCOUNT, script_name: INPUT.script_name };

function release(options = {}) {
  const contents = new Map();
  const file = (bytes) => { const hash = sha(bytes); contents.set(hash, bytes); return { sha256: hash, size: bytes.length }; };
  const manifest = {
    format: 1, app: INPUT.app, version: INPUT.version, created: '2026-10-18T00:00:00.000Z',
    worker: { main_module: 'index.js', compatibility_date: '2026-10-18', compatibility_flags: ['nodejs_compat'], d1_binding: 'DB', assets_binding: 'ASSETS', modules: [
      { name: 'index.js', type: 'application/javascript+module', ...file(Buffer.alloc(options.scriptBytes || 100, 65)) },
      { name: 'pad.js', type: 'application/javascript+module', ...file(Buffer.from('export default 1;')) },
    ] },
    assets: { config: { html_handling: 'auto-trailing-slash', not_found_handling: 'single-page-application' }, files: [
      { path: '/index.html', content_type: 'text/html; charset=utf-8', ...file(Buffer.from('<html>proof</html>')) },
      ...[1, 2, 3].map((i) => ({ path: `/assets/${i}.bin`, content_type: 'application/octet-stream', ...file(Buffer.alloc(options.assetBytes || 750000, i)) })),
    ] }, migrations: [],
  };
  if (options.change) options.change(manifest);
  const raw = Buffer.from(JSON.stringify(manifest));
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
  // Copy only this proof's runtime files. The existing kit tests temporarily
  // move kit-function.json, so copying that unrelated fixture would race them.
  for (const name of ['index.js', 'worker-release.js', 'manifest.json']) {
    cpSync(fileURLToPath(new URL('../' + name, import.meta.url)), join(dir, name));
  }
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
  const manifestPath = join(dir, 'manifest.json');
  const connectorManifest = JSON.parse(readFileSync(manifestPath));
  connectorManifest.modules.pages.release_hosts = ['releases.example.test'];
  writeFileSync(manifestPath, JSON.stringify(connectorManifest));
  writeFileSync(join(dir, 'release.json'), JSON.stringify(FIXTURE_CONFIG));
  if (options.config === 'missing') unlinkSync(join(dir, 'release.json'));
  else if (options.config !== undefined) writeFileSync(join(dir, 'release.json'), typeof options.config === 'string' ? options.config : JSON.stringify(options.config));
  const env = await createTestGateway({ home, connectorDirs: [connectors], fetchImpl });
  await putActive(env.store, env.fake, { service: 'cloudflare', module: 'pages' });
  const calls = [];
  let missing;
  const uploaded = new Set();
  env.fake.auth.proxy = async (req) => {
    calls.push(req);
    if (options.responder) return options.responder(req, calls.length);
    if (req.endpoint === `${SCRIPT}/assets-upload-session`) {
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
    if (req.endpoint === SCRIPT && req.method === 'PUT') return envelope({ id: INPUT.script_name, jwt: COMPLETE });
    if (req.endpoint === `${SCRIPT}/subdomain`) return options.noSubdomain ? refusal(req, 404, [10007]) : envelope({ enabled: true, previews_enabled: false });
    if (req.endpoint === `${ROOT}/subdomain`) return options.noSubdomain ? refusal(req, 404, [10007]) : envelope({ subdomain: 'wiser-proof' });
    assert.fail(`unexpected request ${req.method} ${req.endpoint}`);
  };
  async function execute(action = 'deploy_worker_release', input = INPUT) {
    const args = { action: `cloudflare.pages.${action}`, input };
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
function noTokens(result) {
  const text = JSON.stringify(result);
  for (const token of [UPLOAD, COMPLETE]) assert.equal(text.includes(token), false, text);
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

test('fixture release config public key matches the pinned fixture', () => {
  // A --release copy intentionally pins another key; the test environment above
  // still uses the fixed test fixture. Validate the checked-in fixture by key id.
  if (CONFIG.base === BASE) assert.deepEqual(CONFIG, FIXTURE_CONFIG);
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
    bindings: [{ type: 'd1', name: 'DB', database_id: DATABASE }, { type: 'assets', name: 'ASSETS' }],
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
for (const [name, config] of [ ['missing', 'missing'], ['malformed', '{'], ['unlisted base host', { ...FIXTURE_CONFIG, base: 'https://other.example.test/' }], ['wrong key length', { ...FIXTURE_CONFIG, apps: { 'wiser-crm-proof': { keys: [{ id: '0123456789abcdef', ed25519: 'bad' }] } } }] ]) {
  test(`release.json ${name} refuses before any fetch or proxy call`, async (t) => {
    const env = await setup(t, { config }); preflight(env, await env.execute(), /release.json/, []);
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
  ['migration in proof', (m) => { m.migrations = ['DROP TABLE users']; }],
]) {
  test(`signed manifest rejects ${name} before any file fetch or proxy call`, async (t) => {
    const env = await setup(t, { change }); const result = await env.execute();
    preflight(env, result, /release/, name === 'too many assets' ? signedPaths.slice(0, 1) : signedPaths);
  });
}
test('gateway confirmation displays every deploy input before any fetch and runs only after confirm', async (t) => {
  const env = await setup(t, { noneMissing: true });
  const args = { action: 'cloudflare.pages.deploy_worker_release', input: INPUT };
  const stop = await env.gw.execute(args);
  assert.equal(stop.status, 'needs_confirmation', JSON.stringify(stop));
  for (const [name, value] of Object.entries(INPUT)) assert.ok(stop.input_values.some((field) => field.name === name && field.value === JSON.stringify(value)));
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
