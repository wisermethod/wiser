import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { createTestGateway, makeHome, putActive } from '../../../gateway/test/fake-provider.js';

const CRM = 'wiser-crm';
const INTAKE = 'wiser-crm-intake';
const ACCOUNT = '0123456789abcdef0123456789abcdef';
const CRM_DB = '12345678-1234-1234-1234-123456789abc';
const INTAKE_DB = 'abcdefab-1234-1234-1234-123456789abc';
const VERSION_ID = '11111111-1111-1111-1111-111111111111';
const ROOT = `/accounts/${ACCOUNT}/workers`;
const BASE = 'https://releases.example.com/';
const CRM_VARS = { ACCESS_TEAM_DOMAIN: 'team.example.com', ACCESS_AUD: 'audience', AGENT_CLIENT_ID: 'client',
  WISER_INSTANCE: 'demo', WISER_READ_ONLY: '' };
const INTAKE_VARS = { INTAKE_ORIGIN: 'https://www.example.com', INTAKE_RETURN_URL: 'https://www.example.com/thanks',
  NOTICE_TO: 'recipient@example.com', NOTICE_FROM: 'sender@example.com' };
const key = generateKeyPairSync('ed25519');
const otherKey = generateKeyPairSync('ed25519');
const rawKey = key.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const trust = { keys: [{ id: sha(rawKey).slice(0, 16), ed25519: rawKey.toString('base64') }] };
const envelope = (result) => ({ status: 200, data: { success: true, result } });

function syntheticRelease() {
  const files = new Map();
  function record(text) {
    const bytes = Buffer.from(text), hash = sha(bytes);
    files.set(hash, bytes);
    return { sha256: hash, size: bytes.length };
  }
  const module = (name, text) => ({ name, type: 'application/javascript+module', ...record(text) });
  const manifest = {
    format: 3, app: CRM, version: '0.1.0', created: '2026-11-20T00:00:00.000Z',
    source: { repository: 'wisermethod/wiser-crm', commit: 'a'.repeat(40), upstream_commit: 'b'.repeat(40), f1: { count: 10, limit: 10 } },
    checks: { lockfile: 'PASS', install_log: 'PASS', bundle_inputs: 'PASS' },
    apps: {
      [CRM]: {
        worker: { main_module: 'index.js', compatibility_date: '2025-04-01', compatibility_flags: ['nodejs_compat'],
          modules: [module('index.js', 'export default {};')] },
        assets: { binding: 'ASSETS', config: { html_handling: 'auto-trailing-slash', not_found_handling: 'single-page-application', run_worker_first: true },
          files: [{ path: '/index.html', ...record('<!doctype html>'), content_type: 'text/html; charset=utf-8' }] },
        bindings: { d1: [{ name: 'DB', database: 'crm' }, { name: 'INTAKE_DB', database: 'intake' }], mail: [] },
        vars: { required: Object.keys(CRM_VARS), optional: [] },
        migrations: { database: 'crm', table: 'd1_migrations',
          files: [{ name: '0001_baseline.sql', ...record('CREATE TABLE contacts (id TEXT);') }] },
      },
      [INTAKE]: {
        worker: { main_module: 'worker.js', compatibility_date: '2025-04-01', compatibility_flags: [],
          modules: [module('worker.js', '// notice.ts\n// worker.ts\nexport default {};\n')], bundle_inputs: ['intake/notice.ts', 'intake/worker.ts'] },
        assets: null,
        bindings: { d1: [{ name: 'INTAKE_DB', database: 'intake' }],
          mail: [{ name: 'NOTICE', destination_var: 'NOTICE_TO', sender_var: 'NOTICE_FROM' }] },
        vars: { required: Object.keys(INTAKE_VARS), optional: ['INTAKE_MAX_PER_ADDRESS_PER_DAY', 'INTAKE_MAX_PER_HOUR', 'CRM_URL'] },
        migrations: { database: 'intake', table: 'd1_migrations',
          files: [{ name: '0001_intake.sql', ...record('CREATE TABLE submissions (id TEXT);') }] },
      },
    },
  };
  return { manifest, files };
}

async function setup(t, options = {}) {
  const { manifest, files } = syntheticRelease();
  options.change?.(manifest, files);
  const raw = options.raw ?? Buffer.from(JSON.stringify(manifest, null, options.noncanonical ? undefined : 2) + '\n');
  const release = JSON.parse(raw);
  const signature = sign(null, raw, (options.otherKey ? otherKey : key).privateKey);
  const connector = new URL('../', import.meta.url);
  const home = realpathSync(makeHome());
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const dir = join(home, 'connectors/cloudflare');
  mkdirSync(dir, { recursive: true });
  for (const name of ['index.js', 'worker-release.js', 'signature.js', 'pages-release.js']) cpSync(new URL(name, connector), join(dir, name));
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  const connectorManifest = JSON.parse(readFileSync(new URL('manifest.json', connector)));
  connectorManifest.modules.workers.release_hosts = [new URL(BASE).hostname];
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(connectorManifest));
  const apps = { [CRM]: trust, ...(options.unadmitted ? {} : { [INTAKE]: trust }), 'absent-app': trust };
  writeFileSync(join(dir, 'release.json'), JSON.stringify({ format: 1, base: BASE, apps }));
  const calls = [], fetches = [], deployed = new Map();
  const env = await createTestGateway({ home, connectorDirs: [join(home, 'connectors')], fetchImpl: async (url) => {
    const path = url.slice(BASE.length);
    fetches.push(path);
    assert.ok(url.startsWith(BASE));
    const prefix = `${options.publisher ?? CRM}/${release.version}/`;
    assert.ok(path.startsWith(prefix), path);
    const name = path.slice(prefix.length);
    const bytes = name === 'manifest.json' ? raw : name === 'manifest.sig' ? signature
      : options.directory ? readFileSync(join(options.directory, name)) : files.get(name.slice('files/'.length));
    assert.ok(bytes, name);
    return new Response(bytes);
  } });
  await putActive(env.store, env.fake, { service: 'cloudflare', module: 'workers' });
  await putActive(env.store, env.fake, { service: 'cloudflare', module: 'pages' });
  env.fake.auth.proxy = async (req) => {
    calls.push(req);
    if (req.endpoint.endsWith('/assets-upload-session')) return envelope({ jwt: 'fixture-completion', buckets: [] });
    if (req.endpoint === ROOT + '/subdomain') return envelope({ subdomain: 'member' });
    if (req.endpoint.endsWith('/subdomain')) return envelope({ enabled: true, previews_enabled: false });
    const script = req.endpoint.match(/\/scripts\/([^/]+)/)?.[1];
    if (req.method === 'PUT' && script) {
      deployed.set(script, JSON.parse(await metadata(req)).bindings);
      return envelope({ id: script });
    }
    if (req.endpoint.endsWith('/deployments')) {
      return deployed.has(script) ? envelope({ deployments: [{ versions: [{ version_id: VERSION_ID, percentage: 100 }] }] })
        : { status: 404 };
    }
    if (req.endpoint.endsWith('/versions/' + VERSION_ID)) {
      return options.peerDetail404 ? { status: 404 } : envelope({ resources: { bindings: deployed.get(script) } });
    }
    if (req.endpoint.endsWith('/query')) {
      if (options.noStatementResults && req.body.sql.includes('INSERT INTO')) return envelope([[]]);
      return envelope([{ success: true, results: [] }]);
    }
    if (req.endpoint.endsWith('/d1/database') && req.method === 'POST') return envelope({ name: req.body.name, uuid: INTAKE_DB });
    assert.fail(`unexpected request: ${req.method} ${req.endpoint}`);
  };
  const input = (app, overrides = {}) => ({
    account_id: ACCOUNT, script_name: app, app, version: release.version,
    database_id: app === CRM ? CRM_DB : INTAKE_DB,
    vars: app === CRM ? CRM_VARS : INTAKE_VARS,
    peer_script_name: app === CRM ? INTAKE : CRM,
    ...(app === CRM ? { intake_database_id: INTAKE_DB } : {}),
    ...overrides,
  });
  async function write(action, value) {
    const request = { action: 'cloudflare.' + action, input: value };
    const count = [calls.length, fetches.length];
    const stop = await env.gw.execute(request);
    assert.equal(stop.status, 'needs_confirmation', JSON.stringify(stop));
    assert.deepEqual([calls.length, fetches.length], count);
    return env.gw.execute({ ...request, confirm: true });
  }
  return { ...env, release, input, calls, fetches, deployed, write,
    deploy: (app = INTAKE, overrides) => write('workers.deploy_worker_release', input(app, overrides)) };
}

async function metadata(req) {
  const data = {
    method: 'POST', headers: { 'Content-Type': req.binary_body.content_type },
    body: Buffer.from(req.binary_body.base64, 'base64'),
  };
  return (await new Request('https://example.com', data).formData()).get('metadata');
}

async function installBoth(env) {
  const intake = await env.deploy();
  assert.equal(intake.app, INTAKE, JSON.stringify(intake));
  const put = env.calls.find(({ method }) => method === 'PUT');
  const worker = env.release.apps[INTAKE].worker;
  // Compare the exact metadata bytes, including the order of the S1 mail object.
  const expected = JSON.stringify({
    main_module: worker.main_module, compatibility_date: worker.compatibility_date, compatibility_flags: worker.compatibility_flags,
    bindings: [{ type: 'd1', name: 'INTAKE_DB', database_id: INTAKE_DB },
      { name: 'NOTICE', type: 'send_email', destination_address: 'recipient@example.com' },
      ...Object.entries(INTAKE_VARS).map(([name, text]) => ({ name, text, type: 'plain_text' }))],
  });
  assert.equal(await metadata(put), expected);
  assert.equal(env.calls.some(({ endpoint }) => endpoint.includes('assets')), false);
  assert.equal(env.fetches[0], `${CRM}/${env.release.version}/manifest.json`);
  const crm = await env.deploy(CRM);
  assert.equal(crm.app, CRM, JSON.stringify(crm));
  const crmPut = env.calls.filter(({ method }) => method === 'PUT').at(-1);
  const uploaded = JSON.parse(await metadata(crmPut));
  assert.deepEqual(uploaded.bindings, [
    { type: 'd1', name: 'DB', database_id: CRM_DB },
    { type: 'd1', name: 'INTAKE_DB', database_id: INTAKE_DB },
    { type: 'assets', name: 'ASSETS' },
    ...Object.entries(CRM_VARS).map(([name, text]) => ({ name, text, type: 'plain_text' })),
  ]);
  assert.equal(uploaded.assets.config.run_worker_first, true);
  assert.equal(env.calls.filter(({ endpoint }) => endpoint.endsWith('/assets-upload-session')).length, 1);
}

test('format 3 installs intake and CRM with exact signed bindings, one shared ID, and no intake assets calls', async (t) => {
  await installBoth(await setup(t));
});

if (process.env.CRM_UNSIGNED_RELEASE_DIR) {
  test('the locally built unsigned format 3 release installs both apps after signing exact bytes in memory', async (t) => {
    const directory = process.env.CRM_UNSIGNED_RELEASE_DIR;
    await installBoth(await setup(t, { directory, raw: readFileSync(join(directory, 'manifest.json')) }));
  });
}

test('release.json admits intake under the CRM publisher key', () => {
  const config = JSON.parse(readFileSync(new URL('../release.json', import.meta.url)));
  assert.deepEqual(config.apps[INTAKE], config.apps[CRM]);
});

for (const [label, options, app, overrides, reason] of [
  ['unknown numeric format', { change: (m) => { m.format = 4; } }, INTAKE, {}, /unknown release format/],
  ['non-numeric format', { change: (m) => { m.format = '3'; } }, INTAKE, {}, /unknown release format/],
  ['selected app absent from signed release', { publisher: 'absent-app' }, 'absent-app', {}, /does not carry/],
  ['unadmitted intake app', { unadmitted: true }, INTAKE, {}, /not listed/],
  ['no destination', {}, INTAKE, { vars: { ...INTAKE_VARS, NOTICE_TO: '' } }, /destination/],
  ['no sender', {}, INTAKE, { vars: Object.fromEntries(Object.entries(INTAKE_VARS).filter(([k]) => k !== 'NOTICE_FROM')) }, /sender/],
  ['missing required variable', {}, INTAKE, { vars: { NOTICE_FROM: INTAKE_VARS.NOTICE_FROM, NOTICE_TO: INTAKE_VARS.NOTICE_TO } }, /required/],
  ['undeclared variable', {}, INTAKE, { vars: { ...INTAKE_VARS, EXTRA: 'value' } }, /undeclared/],
  ['CRM without the intake database ID', {}, CRM, { intake_database_id: undefined }, /intake_database_id/],
  ['CRM without a named intake peer', {}, CRM, { peer_script_name: undefined }, /peer_script_name/],
  ['intake without a named CRM peer', {}, INTAKE, { peer_script_name: undefined }, /peer_script_name/],
  ['intake input IDs differ', {}, INTAKE, { intake_database_id: CRM_DB }, /same intake database/],
  ['CRM and intake must be distinct databases', {}, CRM, { intake_database_id: CRM_DB }, /distinct/],
  ['unknown mail field in the signed release', { change: (m) => { m.apps[INTAKE].bindings.mail[0].address = 'literal@example.com'; } }, INTAKE, {}, /mail binding/],
  ['unknown D1 binding in the signed release', { change: (m) => { m.apps[CRM].bindings.d1.push({ name: 'EXTRA_DB', database: 'crm' }); } }, INTAKE, {}, /D1 bindings/],
  ['wrong signed declaration order', { change: (m) => { m.apps[INTAKE].vars.optional.reverse(); } }, INTAKE, {}, /variable declarations/],
  ['wrong signed file order', { change: (m) => { const [first] = m.apps[CRM].worker.modules; m.apps[CRM].worker.modules.push({ ...first, name: 'aaa.js' }); } }, INTAKE, {}, /out of order/],
  ['noncanonical signed JSON', { noncanonical: true }, INTAKE, {}, /canonical/],
  ['bundle sections disagree with signed source inputs', { change: (m) => { m.apps[INTAKE].worker.bundle_inputs.shift(); } }, CRM, {}, /source sections/],
  ['altered file in the other app', { change: (m, files) => { const hash = m.apps[CRM].assets.files[0].sha256; files.get(hash)[0] ^= 1; } }, INTAKE, {}, /file mismatch/],
  ['another key signature', { otherKey: true }, INTAKE, {}, /signature invalid/],
]) {
  test(`format 3 refuses ${label} before provider calls`, async (t) => {
    const env = await setup(t, options);
    // Undefined denotes an omitted JSON field.
    const input = Object.fromEntries(Object.entries(env.input(app, overrides)).filter(([, value]) => value !== undefined));
    const result = await env.write('workers.deploy_worker_release', input);
    assert.equal(result.status, 'invalid_arguments', JSON.stringify(result));
    assert.match(result.reason, reason);
    assert.deepEqual(env.calls, []);
    if (options.unadmitted) {
      assert.deepEqual(env.fetches, []);
      const admitted = await setup(t);
      assert.equal((await admitted.deploy()).app, INTAKE, 'the same release is accepted with an intake pin');
    }
  });
}

test('format 3 refuses a disagreeing live peer binding before any write', async (t) => {
  const env = await setup(t);
  env.deployed.set(INTAKE, [{ name: 'INTAKE_DB', type: 'd1', database_id: CRM_DB }]);
  const result = await env.deploy(CRM, { database_id: 'bbbbbbbb-1234-1234-1234-123456789abc' });
  assert.equal(result.status, 'invalid_arguments', JSON.stringify(result));
  assert.match(result.reason, /same intake database/);
  assert.deepEqual(env.calls.map(({ method }) => method), ['GET', 'GET']);
});

test('format 3 intake can deploy before an installed format 2 CRM is upgraded when its database is distinct', async (t) => {
  const env = await setup(t);
  env.deployed.set(CRM, [{ name: 'DB', type: 'd1', database_id: CRM_DB }, { name: 'ASSETS', type: 'assets' }]);
  const result = await env.deploy();
  assert.equal(result.app, INTAKE, JSON.stringify(result));
  assert.deepEqual(env.calls.slice(0, 2).map(({ method }) => method), ['GET', 'GET']);
});

test('format 3 intake refuses to use the existing format 2 CRM database', async (t) => {
  const env = await setup(t);
  env.deployed.set(CRM, [{ name: 'DB', type: 'd1', database_id: CRM_DB }, { name: 'ASSETS', type: 'assets' }]);
  const result = await env.deploy(INTAKE, { database_id: CRM_DB });
  assert.match(result.reason, /distinct databases/);
  assert.deepEqual(env.calls.map(({ method }) => method), ['GET', 'GET']);
});

test('format 3 intake refuses an unverified live peer whose version detail disappeared', async (t) => {
  const env = await setup(t, { peerDetail404: true });
  env.deployed.set(CRM, [{ name: 'DB', type: 'd1', database_id: CRM_DB }, { name: 'ASSETS', type: 'assets' }]);
  const result = await env.deploy();
  assert.equal(result.status, 'vendor_error', JSON.stringify(result));
  assert.equal(result.http_status, 404);
  assert.deepEqual(env.calls.map(({ method }) => method), ['GET', 'GET']);
});

test('format 3 uploads supplied optional variables only and keeps the mail destination pinned on settings updates', async (t) => {
  const env = await setup(t);
  assert.equal((await env.deploy(INTAKE, { vars: { ...INTAKE_VARS, CRM_URL: 'https://crm.example.com' } })).app, INTAKE);
  assert.deepEqual(env.deployed.get(INTAKE).slice(2).map(({ name }) => name), [...Object.keys(INTAKE_VARS), 'CRM_URL']);
  const count = env.calls.length;
  const { account_id, script_name, app, version } = env.input(INTAKE);
  const result = await env.write('workers.set_vars', { account_id, script_name, app, version, vars: { NOTICE_TO: 'other@example.com' } });
  assert.match(result.reason, /pin/);
  assert.equal(env.calls.length, count);
});

test('existing D1 create plus confirmed format 3 migrations use each selected app and database', async (t) => {
  const env = await setup(t);
  await env.write('pages.d1_create_database', { account_id: ACCOUNT, name: 'demo-intake' });
  assert.deepEqual(env.calls[0].body, { name: 'demo-intake' });
  for (const [app, database_id, baseline, table] of [
    [INTAKE, INTAKE_DB, '0001_intake.sql', 'submissions'], [CRM, CRM_DB, '0001_baseline.sql', 'contacts'],
  ]) {
    const { account_id, version } = env.input(app);
    const result = await env.write('workers.d1_migrate', { account_id, version, app, database_id });
    assert.deepEqual(result.applied, [baseline], JSON.stringify(result));
    const queries = env.calls.filter(({ endpoint }) => endpoint.endsWith(`/${database_id}/query`));
    assert.equal(queries.length, 3);
    assert.match(queries[2].body.sql, new RegExp(`CREATE TABLE ${table} .*\\nINSERT INTO d1_migrations \\(name\\)\\nvalues \\('${baseline}'\\);`));
  }
});

test('format 3 migration writes nothing when the other app bundle violates the signed input graph', async (t) => {
  const env = await setup(t, { change: (m) => { m.apps[INTAKE].worker.bundle_inputs.shift(); } });
  const result = await env.write('workers.d1_migrate', { account_id: ACCOUNT, database_id: CRM_DB, app: CRM, version: env.release.version });
  assert.match(result.reason, /source sections/);
  assert.deepEqual(env.calls, []);
});

test('format 3 migration receives no statement results and reports no applied migration', async (t) => {
  const env = await setup(t, { noStatementResults: true });
  const result = await env.write('workers.d1_migrate', { account_id: ACCOUNT, database_id: INTAKE_DB, app: INTAKE, version: env.release.version });
  assert.equal(result.status, 'vendor_error', JSON.stringify(result));
  assert.deepEqual(result.applied, []);
  assert.equal(result.file, '0001_intake.sql');
});
