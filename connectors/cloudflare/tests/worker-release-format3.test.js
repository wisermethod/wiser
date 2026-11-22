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
const OTHER_DB = 'bbbbbbbb-1234-1234-1234-123456789abc';
const VERSION_ID = '11111111-1111-1111-1111-111111111111';
const RETIRED_VERSION = '22222222-2222-2222-2222-222222222222';
const ROOT = `/accounts/${ACCOUNT}/workers`;
const BASE = 'https://releases.example.com/';
const CRM_VARS = { ACCESS_TEAM_DOMAIN: 'https://example-team.cloudflareaccess.com', ACCESS_AUD: 'audience', AGENT_CLIENT_ID: 'client',
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

function schemaRows(sql, schema) {
  const named = /^SELECT name, type FROM sqlite_master WHERE name = '([^']+)' COLLATE NOCASE AND type IN \(([^)]+)\)$/.exec(sql);
  if (named) {
    const [, name, predicate] = named;
    const types = [...predicate.matchAll(/'([^']+)'/g)].map(([, type]) => type);
    return schema.filter((row) => row.name.toLowerCase() === name.toLowerCase() && types.includes(row.type));
  }
  const tables = /^SELECT name FROM sqlite_master WHERE type = '([^']+)' AND name <> '([^']+)' COLLATE NOCASE AND LOWER\(name\) NOT GLOB '([^']+)\*' AND LOWER\(name\) NOT GLOB '([^']+)\*' LIMIT 1$/.exec(sql);
  assert.ok(tables, 'unexpected SQLite schema query');
  const [, type, excluded, ...prefixes] = tables;
  return schema.filter((row) => row.type === type && row.name.toLowerCase() !== excluded.toLowerCase()
    && prefixes.every((prefix) => !row.name.toLowerCase().startsWith(prefix))).slice(0, 1).map(({ name }) => ({ name }));
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
  const migrationNames = (app) => release.apps?.[app]?.migrations.files.map(({ name }) => name) ?? [];
  const history = new Map(Object.entries(options.history ?? {
    [CRM_DB]: migrationNames(CRM), [INTAKE_DB]: migrationNames(INTAKE), [OTHER_DB]: migrationNames(INTAKE),
  }));
  const databases = new Map(Object.entries(options.databases ?? {}));
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
    if (req.endpoint.endsWith('/subdomain')) return options.subdomainFailure ? { status: 500 }
      : envelope({ enabled: true, previews_enabled: false });
    const script = req.endpoint.match(/\/scripts\/([^/]+)/)?.[1];
    if (req.method === 'PUT' && script) {
      deployed.set(script, JSON.parse(await metadata(req)).bindings);
      return envelope({ id: script });
    }
    if (req.endpoint.endsWith('/deployments')) {
      if (options.serving?.script === script && !deployed.has(script)) {
        const versions = options.serving.versions?.map(({ version_id, percentage }) => ({ version_id, percentage }));
        return envelope({ deployments: versions ? [{ versions }] : [] });
      }
      return deployed.has(script) ? envelope({ deployments: [{ versions: [{ version_id: VERSION_ID, percentage: 100 }] }] })
        : { status: 404 };
    }
    if (req.endpoint.endsWith('/settings') && options.serving?.script === script) {
      return envelope({ bindings: options.serving.bindings });
    }
    if (req.endpoint.includes('/versions/') && options.serving?.script === script && !deployed.has(script)) {
      const version = options.serving.versions?.find(({ version_id }) => req.endpoint.endsWith('/' + version_id));
      if (version) return version.missing ? { status: 404 } : envelope({ resources: { bindings: version.bindings } });
    }
    if (req.endpoint.endsWith('/versions/' + VERSION_ID)) {
      return options.peerDetail404 ? { status: 404 } : envelope({ resources: { bindings: deployed.get(script) } });
    }
    if (req.endpoint.endsWith('/query')) {
      const database = req.endpoint.split('/').at(-2);
      const { sql } = req.body;
      const rows = (results = []) => envelope([{ success: true, results }]);
      if (sql.includes('FROM sqlite_master')) {
        const schema = [...(options.schema?.[database] ?? [])];
        if (history.has(database)) schema.push({ name: 'd1_migrations', type: 'table' });
        return rows(schemaRows(sql, schema));
      }
      if (sql === 'SELECT name FROM d1_migrations ORDER BY id') {
        if (!history.has(database)) return { status: 400 };
        const names = history.get(database).map((name) => ({ name }));
        if (!names.length) await options.beforeEmptyHistoryReturns?.();
        return rows(names);
      }
      if (sql.startsWith('CREATE TABLE IF NOT EXISTS d1_migrations(')) {
        if (!history.has(database)) history.set(database, options.historyAtCreate?.[database] ?? []);
        return rows();
      }
      const recorded = /INSERT INTO d1_migrations \(name\)\s+values \('([^']+)'\)/.exec(sql);
      assert.ok(recorded, 'unexpected D1 write');
      if (options.noStatementResults) return envelope([[]]);
      history.get(database).push(recorded[1]);
      return rows();
    }
    if (req.endpoint.endsWith('/d1/database') && req.method === 'POST') {
      const { name } = req.body;
      return envelope({ name, uuid: databases.get(name) ?? INTAKE_DB });
    }
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
  return { ...env, release, input, calls, fetches, deployed, history, write,
    migrate: (app, database_id) => write('workers.d1_migrate', { account_id: ACCOUNT, database_id, app, version: release.version }),
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
  const firstDeployCall = env.calls.length;
  const intake = await env.deploy();
  assert.equal(intake.app, INTAKE, JSON.stringify(intake));
  assert.equal(intake.peer, 'absent');
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
  assert.equal(crm.peer, 'agrees');
  assert.equal(env.calls.slice(firstDeployCall).some(({ endpoint }) => endpoint.endsWith(`/d1/database/${CRM_DB}/query`)), false);
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


function declareBrandVars(manifest) {
  manifest.version = '0.3.0';
  manifest.apps[CRM].vars.optional.push('BRAND_NAME', 'BRAND_ACCENT');
  manifest.apps[INTAKE].vars.optional.push('NOTICE_FROM_NAME');
}

const brandVars = {
  [CRM]: { BRAND_NAME: '  Northwind Studio  ', BRAND_ACCENT: '#7a4BD6' },
  [INTAKE]: { NOTICE_FROM_NAME: '  Northwind Enquiries  ' },
};

function setReleaseVars(env, app, vars) {
  const { account_id, script_name, version } = env.input(app);
  return env.write('workers.set_vars', { account_id, script_name, app, version, vars });
}

async function assertBrandSettingsUpdate(env, app, vars) {
  const before = env.deployed.get(app);
  const retained = before.filter(({ name }) => !Object.hasOwn(vars, name));
  const updates = Object.entries(vars).map(([name, text]) => ({ name, text, type: 'plain_text' }));
  const expectedBindings = [...retained.map(({ name }) => ({ name, type: 'inherit' })), ...updates];
  const originalProxy = env.fake.auth.proxy;
  const script = ROOT + '/scripts/' + app;
  let patched = false;
  env.fake.auth.proxy = async (req) => {
    env.calls.push(req);
    if (req.endpoint === script + '/settings') {
      if (req.method === 'GET') return envelope({ bindings: patched ? [...retained, ...updates] : before });
      assert.equal(req.method, 'PATCH');
      const form = await new Response(Buffer.from(req.binary_body.base64, 'base64'),
        { headers: { 'Content-Type': req.binary_body.content_type } }).formData();
      assert.deepEqual(JSON.parse(form.get('settings')), { bindings: expectedBindings });
      patched = true;
      return envelope({});
    }
    if (req.endpoint === script + '/deployments') {
      const version_id = patched ? RETIRED_VERSION : VERSION_ID;
      return envelope({ deployments: [{ versions: [{ version_id, percentage: 100 }] }] });
    }
    if (req.endpoint === script + '/versions') {
      return envelope({ items: [{ id: VERSION_ID, metadata: { created_on: '2026-11-20T00:00:00Z' } }] });
    }
    assert.fail('unexpected fake settings request');
  };
  try {
    assert.deepEqual(await setReleaseVars(env, app, vars), { keys_set: Object.keys(vars), version_id: RETIRED_VERSION });
    assert.ok(patched);
  } finally {
    env.fake.auth.proxy = originalProxy;
  }
}

test('brand vars: a 0.3.0-shaped release installs both apps with defaults when omitted', async (t) => {
  const env = await setup(t, { change: declareBrandVars });
  await installBoth(env);
  for (const app of [INTAKE, CRM]) {
    await assertBrandSettingsUpdate(env, app, brandVars[app]);
  }
});

test('brand vars: a 0.3.0-shaped release deploys supplied brand bindings and accepts settings updates', async (t) => {
  const env = await setup(t, { change: declareBrandVars });
  for (const app of [INTAKE, CRM]) {
    const result = await env.deploy(app, { vars: { ...env.input(app).vars, ...brandVars[app] } });
    assert.equal(result.app, app, JSON.stringify(result));
    assert.deepEqual(env.deployed.get(app).slice(-Object.keys(brandVars[app]).length),
      Object.entries(brandVars[app]).map(([name, text]) => ({ name, text, type: 'plain_text' })));
  }

  await assertBrandSettingsUpdate(env, CRM, { BRAND_NAME: '  Wiser Example  ', BRAND_ACCENT: '#Ab12f0' });
  await assertBrandSettingsUpdate(env, INTAKE, { NOTICE_FROM_NAME: '  Enquiries From Wiser Example  ' });
});

test('brand vars: a 0.2.0-shaped release installs both apps and refuses every undeclared brand variable', async (t) => {
  const env = await setup(t, { change: (m) => { m.version = '0.2.0'; } });
  await installBoth(env);
  env.calls.length = 0;
  for (const app of [INTAKE, CRM]) {
    for (const [name, valid] of Object.entries(brandVars[app])) {
      for (const value of [valid, 'fixture<invalid>']) {
        const supplied = { [name]: value };
        const deployed = await env.deploy(app, { vars: { ...env.input(app).vars, ...supplied } });
        const updated = await setReleaseVars(env, app, supplied);
        for (const result of [deployed, updated]) {
          assert.equal(result.status, 'invalid_arguments', name);
          assert.equal(result.field, 'vars', name);
          assert.match(result.reason, /undeclared/, name);
          assert.ok(!JSON.stringify(result).includes(value), name);
        }
        assert.equal(env.calls.length, 0);
      }
    }
  }
});

for (const [label, app, change, reason] of [
  ['original CRM and branded intake', CRM, (m) => { m.apps[CRM].vars.optional = []; }, /variable declarations malformed.*same set/],
  ['branded CRM and original intake', INTAKE, (m) => { m.apps[INTAKE].vars.optional.pop(); }, /variable declarations malformed.*same set/],
  ['partial CRM list', CRM, (m) => { m.apps[CRM].vars.optional.pop(); }, /variable declarations.*malformed/i],
  ['reordered CRM list', INTAKE, (m) => { m.apps[CRM].vars.optional.reverse(); }, /variable declarations.*malformed/i],
  ['reordered intake list', CRM, (m) => { m.apps[INTAKE].vars.optional.reverse(); }, /variable declarations.*malformed/i],
  ['duplicated intake name', INTAKE, (m) => { m.apps[INTAKE].vars.optional.push('NOTICE_FROM_NAME'); }, /variable declarations.*malformed/i],
  ['extra CRM name', CRM, (m) => { m.apps[CRM].vars.optional.push('NOTICE_FROM_NAME'); }, /variable declarations.*malformed/i],
]) {
  test(`brand vars: format 3 refuses ${label}`, async (t) => {
    const env = await setup(t, { change: (m) => { declareBrandVars(m); change(m); } });
    for (const result of [await env.deploy(app), await setReleaseVars(env, app, env.input(app).vars)]) {
      assert.equal(result.status, 'invalid_arguments');
      assert.equal(result.field, 'release');
      assert.match(result.reason, reason);
    }
    assert.equal(env.calls.length, 0);
  });
}

const nonBmpLetter = '\u{10400}';
const nameControls = ['\x00', '\t', '\r', '\n', '\x7f', '\x85', '\u2028', '\u2029', '<', '>'];

for (const [app, name, invalidValues, validValues] of [
  [CRM, 'BRAND_NAME',
    ['', '   ', nonBmpLetter.repeat(41), '\nA brand', ...nameControls.map((char) => `A${char} brand`)],
    ['A', '  ' + nonBmpLetter.repeat(40) + '  ', 'Café north']],
  [CRM, 'BRAND_ACCENT',
    ['ddee00', '#abc', '#aabbccdd', '#g12345', ' #aabbcc', '#aabbcc\n'], ['#000000', '#AaBb01']],
  [INTAKE, 'NOTICE_FROM_NAME',
    ['', '   ', nonBmpLetter.repeat(61), 'A sender\r',
      ...[...nameControls, '"', ',', ';', ':', '@', '\\'].map((char) => `A${char} sender`)],
    ['N', '  ' + nonBmpLetter.repeat(60) + '  ', 'Café north']],
]) {
  test(`brand vars: ${name} checks supplied values on deploy and set_vars`, async (t) => {
    const env = await setup(t, { change: declareBrandVars });
    if (app === CRM) env.deployed.set(INTAKE, [intakeBinding(INTAKE_DB)]);
    for (const value of invalidValues) {
      const supplied = { [name]: value };
      const deployed = await env.deploy(app, { vars: { ...env.input(app).vars, ...supplied } });
      const updated = await setReleaseVars(env, app, supplied);
      for (const result of [deployed, updated]) {
        assert.equal(result.status, 'invalid_arguments');
        assert.equal(result.field, name);
        assert.ok(result.reason.includes(name));
        const display = JSON.stringify(value).slice(1, -1);
        if (display) assert.ok(!JSON.stringify(result).includes(display), 'refusal echoed the submitted value');
      }
      assert.equal(env.calls.length, 0);
    }
    for (const value of validValues) {
      const result = await env.deploy(app, { vars: { ...env.input(app).vars, [name]: value } });
      assert.equal(result.app, app);
      assert.deepEqual(env.deployed.get(app).find((binding) => binding.name === name),
        { name, text: value, type: 'plain_text' });
      await assertBrandSettingsUpdate(env, app, { [name]: value });
    }
  });
}

// Expected cases come from wiser-crm worker/sign-in.ts isConfigured at d73341c.
for (const [name, cases] of [
  ['ACCESS_TEAM_DOMAIN', [
    ['bare team hostname', 'example-team.cloudflareaccess.com', false],
    ['trailing slash', CRM_VARS.ACCESS_TEAM_DOMAIN + '/', false],
    ['path', CRM_VARS.ACCESS_TEAM_DOMAIN + '/path', false],
    ['HTTP', 'http://example-team.cloudflareaccess.com', false],
    ['uppercase team', 'https://Example.cloudflareaccess.com', false],
    ['leading hyphen', 'https://-example.cloudflareaccess.com', false],
    ['trailing hyphen', 'https://example-.cloudflareaccess.com', false],
    ['64-character team', 'https://' + 'a'.repeat(64) + '.cloudflareaccess.com', false],
    ['more than one team label', 'https://sub.example.cloudflareaccess.com', false],
    ['query', CRM_VARS.ACCESS_TEAM_DOMAIN + '?query', false],
    ['newline', CRM_VARS.ACCESS_TEAM_DOMAIN + '\n', false],
    ['one-character team', 'https://x.cloudflareaccess.com', true],
    ['hyphenated team', CRM_VARS.ACCESS_TEAM_DOMAIN, true],
    ['63-character team', 'https://' + 'a'.repeat(63) + '.cloudflareaccess.com', true],
  ]],
  ['ACCESS_AUD', [
    ['empty audience', '', false],
    ['malformed audience', 'invalid.fixture.audience', false],
    ['audience with whitespace', 'with space', false],
    ['audience with newline', 'example\n', false],
    ['short audience', 'A', true],
    ['letters, digits, hyphen and underscore', 'Ab9-_', true],
  ]],
]) {
  test(`format 3 ${name} matches CRM isConfigured at d73341c`, async (t) => {
    const env = await setup(t);
    env.deployed.set(INTAKE, [intakeBinding(INTAKE_DB)]);
    for (const [label, value, accepted] of cases) {
      const count = env.calls.length;
      const result = await env.deploy(CRM, { vars: { ...CRM_VARS, [name]: value } });
      if (accepted) {
        assert.equal(result.app, CRM, label);
        assert.ok(env.calls.length > count, label);
        assert.equal(env.deployed.get(CRM).find((binding) => binding.name === name).text, value, label);
      } else {
        assert.equal(result.status, 'invalid_arguments', label);
        assert.equal(result.field, name, label);
        assert.ok(result.reason.includes(name), label);
        assert.equal(env.calls.length, 0, label);
        const { account_id, script_name, app, version } = env.input(CRM);
        const updated = await env.write('workers.set_vars', { account_id, script_name, app, version, vars: { [name]: value } });
        assert.equal(updated.status, 'invalid_arguments', label);
        assert.equal(updated.field, name, label);
        assert.ok(updated.reason.includes(name), label);
        assert.equal(env.calls.length, 0, label);
      }
    }
  });
}

for (const [app, name, invalidValues, validValue] of [
  [CRM, 'WISER_INSTANCE', [''], 'fixture install'],
  [INTAKE, 'INTAKE_ORIGIN', ['', 'null', ' trimmed.example', 'broken\norigin'], 'example-origin'],
  [INTAKE, 'INTAKE_RETURN_URL', ['', 'broken\nlocation'], '/thank-you'],
  [INTAKE, 'NOTICE_TO', [''], 'recipient@example.com'],
  [INTAKE, 'NOTICE_FROM', [''], 'sender@example.com'],
  [INTAKE, 'INTAKE_MAX_PER_ADDRESS_PER_DAY', ['0', '-1', '1.5', '9007199254740992', 'garbage'], ' 0x5 '],
  [INTAKE, 'INTAKE_MAX_PER_HOUR', ['0', '-1', '1.5', '9007199254740992', 'garbage'], '6e1'],
]) {
  test(`format 3 refuses invalid ${name} before any Cloudflare call`, async (t) => {
    const env = await setup(t);
    if (app === CRM) env.deployed.set(INTAKE, [intakeBinding(INTAKE_DB)]);
    const { account_id, script_name, version, vars } = env.input(app);
    for (const value of invalidValues) {
      const deployed = await env.deploy(app, { vars: { ...vars, [name]: value } });
      assert.equal(deployed.status, 'invalid_arguments');
      assert.equal(deployed.field, name);
      assert.ok(deployed.reason.includes(name));
      assert.equal(env.calls.length, 0);
      const updated = await env.write('workers.set_vars', { account_id, script_name, app, version, vars: { [name]: value } });
      assert.equal(updated.status, 'invalid_arguments');
      assert.equal(updated.field, name);
      assert.ok(updated.reason.includes(name));
      assert.equal(env.calls.length, 0);
    }
    const deployed = await env.deploy(app, { vars: { ...vars, [name]: validValue } });
    assert.equal(deployed.app, app);
    assert.equal(env.deployed.get(app).find((binding) => binding.name === name).text, validValue);
  });
}

test('format 3 sets a corrected team address in a partial update without reading sibling values', async (t) => {
  const env = await setup(t);
  const { account_id, script_name, app, version } = env.input(CRM);
  const bindings = [
    { name: 'ACCESS_TEAM_DOMAIN', type: 'plain_text' },
    { name: 'ACCESS_AUD', type: 'plain_text', get text() { assert.fail('must not check an omitted value'); } },
  ];
  env.fake.auth.proxy = async (req) => {
    env.calls.push(req);
    if (req.endpoint.endsWith('/settings')) return envelope({ bindings });
    if (req.endpoint.endsWith('/deployments')) {
      const version_id = env.calls.some(({ method }) => method === 'PATCH') ? VERSION_ID : RETIRED_VERSION;
      return envelope({ deployments: [{ versions: [{ version_id, percentage: 100 }] }] });
    }
    if (req.endpoint.endsWith('/versions')) {
      return envelope({ items: [{ id: RETIRED_VERSION, metadata: { created_on: '2026-11-20T00:00:00Z' } }] });
    }
    assert.fail('unexpected fake request');
  };
  const vars = { ACCESS_TEAM_DOMAIN: CRM_VARS.ACCESS_TEAM_DOMAIN };
  assert.deepEqual(await env.write('workers.set_vars', { account_id, script_name, app, version, vars }),
    { keys_set: ['ACCESS_TEAM_DOMAIN'], version_id: VERSION_ID });
  assert.equal(env.calls.filter(({ method }) => method === 'PATCH').length, 1);
});

test('format 3 passes through CRM_URL text and the app’s read-only flag unchanged', async (t) => {
  const env = await setup(t);
  const CRM_URL = 'fixture display text\nwith a line break';
  const WISER_READ_ONLY = 'arbitrary-nonempty-flag';
  assert.equal((await env.deploy(INTAKE, { vars: { ...INTAKE_VARS, CRM_URL } })).app, INTAKE);
  assert.equal((await env.deploy(CRM, { vars: { ...CRM_VARS, WISER_READ_ONLY } })).app, CRM);
  assert.equal(env.deployed.get(INTAKE).find(({ name }) => name === 'CRM_URL').text, CRM_URL);
  assert.equal(env.deployed.get(CRM).find(({ name }) => name === 'WISER_READ_ONLY').text, WISER_READ_ONLY);
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
  assert.equal(result.peer, 'format-2');
  assert.deepEqual(result.peer_comparison, { script_name: CRM, database_id: CRM_DB, intake_database_id: INTAKE_DB });
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

const writes = (calls) => calls.filter(({ method, endpoint, body }) => method !== 'GET'
  && !(endpoint.endsWith('/query') && /^SELECT\b/.test(body?.sql)));
const intakeBinding = (database_id) => ({ name: 'INTAKE_DB', type: 'd1', database_id });
const legacyCrmBindings = [
  { name: 'DB', type: 'd1', database_id: CRM_DB },
  { name: 'ASSETS', type: 'assets' },
];

for (const [label, history, reason] of [
  ['CRM baseline', ['0001_baseline.sql'], /holds the CRM's migrations/],
  ['mixed histories', ['0001_intake.sql', '0001_baseline.sql'], /holds the CRM's migrations/],
  ['empty history', [], /missing intake migration.*0001_intake\.sql/],
  ['missing history table', undefined, /missing intake migration.*0001_intake\.sql/],
]) {
  for (const app of [INTAKE, CRM]) {
    test(`format 3 ${app} deploy refuses ${label} on the intake database before any write`, async (t) => {
      const env = await setup(t, { history: history ? { [INTAKE_DB]: history } : {} });
      if (app === CRM) env.deployed.set(INTAKE, [intakeBinding(INTAKE_DB)]);
      const result = await env.deploy(app);
      assert.deepEqual(writes(env.calls), []);
      assert.equal(result.status, 'invalid_arguments', JSON.stringify(result));
      assert.equal(result.field, app === CRM ? 'intake_database_id' : 'database_id');
      assert.match(result.reason, reason);
    });
  }
}

test('format 3 intake refuses a history missing a later signed intake migration', async (t) => {
  const env = await setup(t, { history: { [INTAKE_DB]: ['0001_intake.sql'] }, change: (manifest) => {
    const files = manifest.apps[INTAKE].migrations.files;
    files.push({ ...files[0], name: '0002_next.sql' });
  } });
  const result = await env.deploy();
  assert.deepEqual(writes(env.calls), []);
  assert.match(result.reason, /missing intake migration.*0002_next\.sql/);
});

for (const [label, app, peerBindings] of [
  ['intake with a missing CRM peer', INTAKE, null],
  ['intake with a legacy CRM peer', INTAKE, [{ name: 'DB', type: 'd1', database_id: CRM_DB }, { name: 'ASSETS', type: 'assets' }]],
  ['CRM with an agreeing intake peer', CRM, [intakeBinding(OTHER_DB)]],
]) {
  test(`format 3 refuses to move a serving ${label} to another intake database`, async (t) => {
    const env = await setup(t);
    env.deployed.set(app, [intakeBinding(INTAKE_DB)]);
    if (peerBindings) env.deployed.set(app === CRM ? INTAKE : CRM, peerBindings);
    const result = await env.deploy(app, app === CRM ? { intake_database_id: OTHER_DB } : { database_id: OTHER_DB });
    assert.deepEqual(writes(env.calls), []);
    assert.equal(result.status, 'invalid_arguments', JSON.stringify(result));
    assert.match(result.reason, /serving.*INTAKE_DB.*different database/);
  });
}

test('format 3 retry after the script upload and subdomain failure refuses a different intake database', async (t) => {
  const env = await setup(t, { subdomainFailure: true });
  const first = await env.deploy();
  assert.equal(first.status, 'vendor_error', JSON.stringify(first));
  assert.equal(first.http_status, 500);
  assert.deepEqual(env.deployed.get(INTAKE)?.[0], intakeBinding(INTAKE_DB));
  const count = env.calls.length;
  const retry = await env.deploy(INTAKE, { database_id: OTHER_DB });
  assert.deepEqual(writes(env.calls.slice(count)), []);
  assert.equal(retry.status, 'invalid_arguments', JSON.stringify(retry));
  assert.match(retry.reason, /serving.*INTAKE_DB.*different database/);
  assert.deepEqual(env.deployed.get(INTAKE)?.[0], intakeBinding(INTAKE_DB));
});

for (const [label, serving, reason] of [
  ['settings bindings without a deployment ID', { bindings: [intakeBinding(INTAKE_DB)] }, /different database/],
  ['only a zero-traffic version has an intake binding', { versions: [
    { version_id: VERSION_ID, percentage: 100, bindings: [] },
    { version_id: RETIRED_VERSION, percentage: 0, bindings: [intakeBinding(INTAKE_DB)] },
  ] }, /unreadable INTAKE_DB/],
  ['a sole serving intake version has no intake binding', { versions: [
    { version_id: VERSION_ID, percentage: 100, bindings: [] },
  ] }, /unreadable INTAKE_DB/],
]) {
  test('format 3 deploy refuses when ' + label, async (t) => {
    const env = await setup(t, { serving: { script: INTAKE, ...serving } });
    const result = await env.deploy(INTAKE, { database_id: OTHER_DB, peer_script_name: 'missing-crm' });
    assert.equal(result.status, 'invalid_arguments', JSON.stringify(result));
    assert.match(result.reason, reason);
    assert.deepEqual(writes(env.calls), []);
  });
}

test('format 3 deploy skips a different intake binding on a zero-traffic version', async (t) => {
  const env = await setup(t, { serving: { script: INTAKE, versions: [
    { version_id: VERSION_ID, percentage: 100, bindings: [intakeBinding(INTAKE_DB)] },
    { version_id: RETIRED_VERSION, percentage: 0, bindings: [intakeBinding(OTHER_DB)] },
  ] } });
  const result = await env.deploy();
  assert.equal(result.app, INTAKE, JSON.stringify(result));
});

test('format 3 deploy can proceed when details of the zero-traffic version are gone', async (t) => {
  const env = await setup(t, { serving: { script: INTAKE, versions: [
    { version_id: VERSION_ID, percentage: 100, bindings: [intakeBinding(INTAKE_DB)] },
    { version_id: RETIRED_VERSION, percentage: 0, missing: true },
  ] } });
  const result = await env.deploy();
  assert.equal(result.app, INTAKE, JSON.stringify(result));
  assert.ok(env.calls.every(({ endpoint }) => !endpoint.endsWith(RETIRED_VERSION)));
});

test('format 2 CRM upgrades to format 3 after deploying intake against a distinct database', async (t) => {
  const env = await setup(t, { history: { [CRM_DB]: ['0001_baseline.sql'] } });
  env.deployed.set(CRM, legacyCrmBindings);
  assert.deepEqual((await env.migrate(INTAKE, INTAKE_DB)).applied, ['0001_intake.sql']);
  const intake = await env.deploy();
  assert.equal(intake.peer, 'format-2', JSON.stringify(intake));
  const crm = await env.deploy(CRM);
  assert.equal(crm.peer, 'agrees', JSON.stringify(crm));
  assert.deepEqual(env.deployed.get(CRM)?.slice(0, 3), [
    legacyCrmBindings[0], { type: 'd1', name: 'INTAKE_DB', database_id: INTAKE_DB }, legacyCrmBindings[1],
  ]);
});

test('format 3 CRM refuses a serving version missing both intake and the legacy assets binding', async (t) => {
  const env = await setup(t);
  env.deployed.set(INTAKE, [intakeBinding(INTAKE_DB)]);
  env.deployed.set(CRM, [legacyCrmBindings[0]]);
  const result = await env.deploy(CRM);
  assert.match(result.reason, /unreadable INTAKE_DB/);
  assert.deepEqual(writes(env.calls), []);
});

for (const [app, database_id, reason] of [
  [INTAKE, CRM_DB, /holds the CRM's migrations/],
  [CRM, INTAKE_DB, /holds intake's migrations/],
]) {
  test(`format 3 ${app} migration refuses the other app's database before any write`, async (t) => {
    const env = await setup(t);
    const result = await env.write('workers.d1_migrate', { account_id: ACCOUNT, database_id, app, version: env.release.version });
    assert.deepEqual(writes(env.calls), []);
    assert.equal(result.status, 'invalid_arguments', JSON.stringify(result));
    assert.match(result.reason, reason);
  });
}

test('format 3 first install creates both databases, migrates each and deploys intake before CRM', async (t) => {
  const directory = process.env.CRM_UNSIGNED_RELEASE_DIR;
  const fixture = directory ? { directory, raw: readFileSync(join(directory, 'manifest.json')) } : {};
  const env = await setup(t, { ...fixture, history: {}, databases: { 'demo-crm': CRM_DB, 'demo-intake': INTAKE_DB } });
  for (const [name, databaseId] of [['demo-crm', CRM_DB], ['demo-intake', INTAKE_DB]]) {
    const created = await env.write('pages.d1_create_database', { account_id: ACCOUNT, name });
    assert.equal(created.result?.uuid, databaseId, JSON.stringify(created));
  }
  for (const [app, database_id, baseline, table] of [
    [INTAKE, INTAKE_DB, '0001_intake.sql', 'submissions'], [CRM, CRM_DB, '0001_baseline.sql', 'contacts'],
  ]) {
    const result = await env.migrate(app, database_id);
    const migrations = env.release.apps[app].migrations.files.map(({ name }) => name);
    assert.deepEqual(result.applied, migrations, JSON.stringify(result));
    assert.deepEqual(env.history.get(database_id), migrations);
    const queries = env.calls.filter(({ endpoint }) => endpoint.endsWith(`/${database_id}/query`));
    const ddl = queries.findIndex(({ body }) => body.sql.startsWith('CREATE TABLE IF NOT EXISTS d1_migrations('));
    assert.ok(ddl > 1 && queries[ddl - 1].body.sql.includes('FROM sqlite_master'));
    assert.equal(queries[ddl + 1].body.sql, 'SELECT name FROM d1_migrations ORDER BY id');
    assert.equal(writes(queries).length, migrations.length + 1);
    const firstFile = queries.find(({ body }) => body.sql.endsWith(`values ('${baseline}');`));
    assert.ok(firstFile);
    if (!directory) assert.match(firstFile.body.sql, new RegExp(`CREATE TABLE ${table} `));
  }
  await installBoth(env);
});

const crmSchema = { [CRM_DB]: [{ name: 'contacts', type: 'table' }] };

test('format 3 migrate refuses to initialize history on a legacy CRM database', async (t) => {
  const env = await setup(t, { history: {}, schema: crmSchema });
  const result = await env.migrate(INTAKE, CRM_DB);
  assert.equal(result.status, 'invalid_arguments', JSON.stringify(result));
  assert.match(result.reason, /application tables.*no recorded migration.*d1_adopt.*no history table.*intake database.*empty/i);
  assert.deepEqual(writes(env.calls), []);
});

test('format 3 migrate refuses a legacy CRM schema with an existing empty history table', async (t) => {
  const env = await setup(t, { history: { [CRM_DB]: [] }, schema: crmSchema });
  env.deployed.set(CRM, legacyCrmBindings);
  const result = await env.migrate(INTAKE, CRM_DB);
  assert.equal(result.status, 'invalid_arguments', JSON.stringify(result));
  assert.match(result.reason, /application tables.*no recorded migration/i);
  const deploy = await env.deploy(INTAKE, { database_id: CRM_DB, peer_script_name: 'mistyped-crm' });
  assert.match(deploy.reason, /missing intake migration.*0001_intake\.sql/);
  assert.deepEqual(env.history.get(CRM_DB), []);
  assert.deepEqual(writes(env.calls), []);
});

test('a history-less CRM database cannot be migrated and then deployed as intake with a missing peer', async (t) => {
  const env = await setup(t, { history: {}, schema: crmSchema });
  env.deployed.set(CRM, legacyCrmBindings);
  const migrated = await env.migrate(INTAKE, CRM_DB);
  const deployed = await env.deploy(INTAKE, { database_id: CRM_DB, peer_script_name: 'mistyped-crm' });
  assert.match(deployed.reason, /missing intake migration.*0001_intake\.sql/);
  assert.equal(migrated.status, 'invalid_arguments', JSON.stringify(migrated));
  assert.equal(env.history.has(CRM_DB), false);
  assert.deepEqual(writes(env.calls), []);
});

for (const [app, database_id, table, absentPeer, deployReason] of [
  [INTAKE, CRM_DB, 'contacts', 'missing-crm', /missing intake migration.*0001_intake\.sql/],
  [CRM, INTAKE_DB, 'submissions', 'missing-intake', /peer Worker has no single live deployment/],
]) {
  test(`format 3 ${app} cannot migrate the other app's tables with only custom history or deploy with a missing peer`, async (t) => {
    const env = await setup(t, {
      history: { [database_id]: ['0099_custom.sql'] },
      schema: { [database_id]: [{ name: table, type: 'table' }] },
    });
    const migrated = await env.migrate(app, database_id);
    const migrationWrites = writes(env.calls).length;
    const deployed = await env.deploy(app, {
      database_id, peer_script_name: absentPeer, ...(app === CRM ? { intake_database_id: OTHER_DB } : {}),
    });
    assert.deepEqual({
      migrationStatus: migrated.status, migrationWrites,
      uploaded: env.deployed.has(app), history: env.history.get(database_id),
    }, {
      migrationStatus: 'invalid_arguments', migrationWrites: 0, uploaded: false, history: ['0099_custom.sql'],
    });
    assert.equal(migrated.field, 'database_id');
    assert.match(migrated.reason, /application tables.*no recorded migration/i);
    assert.ok(env.calls.some(({ method, endpoint }) => method === 'GET' && endpoint === ROOT + `/scripts/${absentPeer}/deployments`));
    assert.match(deployed.reason, deployReason);
    assert.deepEqual(writes(env.calls), []);
  });
}

test('format 3 CRM migration explains the adoption prerequisite when history exists but is empty', async (t) => {
  const env = await setup(t, { history: { [CRM_DB]: [] }, schema: crmSchema });
  const result = await env.migrate(CRM, CRM_DB);
  assert.equal(result.status, 'invalid_arguments', JSON.stringify(result));
  assert.doesNotMatch(result.reason, /\b(?:insert|repair|reconcile)\b/i);
  assert.match(result.reason, /d1_adopt.*records.*baseline.*when.*has no history table/);
  assert.match(result.reason, /first migration stopped partway.*new empty database.*restore the bookmark/);
  assert.doesNotMatch(result.reason, /resume|retry|insert/i);
  assert.deepEqual(writes(env.calls), []);
});

test('format 3 CRM migration continues from its recorded first file without probing application tables', async (t) => {
  const next = '0002_add_email.sql';
  const env = await setup(t, {
    history: { [CRM_DB]: ['0001_baseline.sql', '0099_custom.sql'] },
    schema: crmSchema,
    change: (manifest, files) => {
      const sql = Buffer.from('ALTER TABLE contacts ADD COLUMN email TEXT;');
      const sha256 = sha(sql);
      files.set(sha256, sql);
      manifest.apps[CRM].migrations.files.push({ name: next, sha256, size: sql.length });
    },
  });
  const result = await env.migrate(CRM, CRM_DB);
  assert.deepEqual(result.applied, [next], JSON.stringify(result));
  assert.deepEqual(result.skipped, ['0001_baseline.sql']);
  assert.deepEqual(result.ignored, ['0099_custom.sql']);
  assert.deepEqual(env.history.get(CRM_DB), ['0001_baseline.sql', '0099_custom.sql', next]);
  assert.equal(env.calls.some(({ body }) => body?.sql.startsWith('SELECT name FROM sqlite_master')), false);
  const [file, ...extra] = writes(env.calls);
  assert.deepEqual(extra, []);
  assert.match(file.body.sql, /^ALTER TABLE contacts ADD COLUMN email TEXT/);
});

test('format 3 migration ignores internal tables and unrelated views but catches literal prefix lookalikes', async (t) => {
  const internal = [
    { name: 'sqlite_sequence', type: 'table' },
    { name: '_cf_KV', type: 'table' },
    { name: 'contacts', type: 'view' },
  ];
  const empty = await setup(t, { history: {}, schema: { [INTAKE_DB]: internal } });
  assert.deepEqual((await empty.migrate(INTAKE, INTAKE_DB)).applied, ['0001_intake.sql']);
  for (const name of ['sqliteXapp', '_cfXapp', 'xcf_app']) {
    const env = await setup(t, { history: {}, schema: { [INTAKE_DB]: [...internal, { name, type: 'table' }] } });
    assert.equal((await env.migrate(INTAKE, INTAKE_DB)).status, 'invalid_arguments', name);
    assert.deepEqual(writes(env.calls), []);
  }
});

test('format 3 migrate rechecks for foreign migration names immediately after creating history', async (t) => {
  const env = await setup(t, { history: {}, historyAtCreate: { [INTAKE_DB]: ['0001_baseline.sql'] } });
  const result = await env.migrate(INTAKE, INTAKE_DB);
  assert.match(result.reason, /holds the CRM's migrations/);
  assert.equal(writes(env.calls).length, 1);
  assert.match(writes(env.calls)[0].body.sql, /^CREATE TABLE IF NOT EXISTS d1_migrations/);
});

test('intake deploy refuses mixed history after overlapping format 3 migrations', { timeout: 5000 }, async (t) => {
  let releaseReads;
  const bothRead = new Promise((resolve) => { releaseReads = resolve; });
  let readers = 0;
  const env = await setup(t, { history: {}, beforeEmptyHistoryReturns: async () => {
    if (++readers === 2) releaseReads();
    await bothRead;
  } });
  await Promise.all([env.migrate(CRM, CRM_DB), env.migrate(INTAKE, CRM_DB)]);
  assert.equal(readers, 2);
  assert.deepEqual([...env.history.get(CRM_DB)].sort(), ['0001_baseline.sql', '0001_intake.sql']);
  const beforeDeploy = env.calls.length;
  const result = await env.deploy(INTAKE, { database_id: CRM_DB, peer_script_name: 'missing-crm' });
  assert.match(result.reason, /holds the CRM's migrations/);
  assert.deepEqual(writes(env.calls.slice(beforeDeploy)), []);
});

test('a case-insensitive view of the migration history name yields vendor_error before any write', async (t) => {
  const env = await setup(t, { history: {}, schema: { [INTAKE_DB]: [{ name: 'D1_MIGRATIONS', type: 'view' }] } });
  const result = await env.migrate(INTAKE, INTAKE_DB);
  assert.equal(result.status, 'vendor_error', JSON.stringify(result));
  assert.equal(env.calls.length, 1);
  assert.deepEqual(writes(env.calls), []);
});

test('format 3 migration writes nothing when the other app bundle violates the signed input graph', async (t) => {
  const env = await setup(t, { change: (m) => { m.apps[INTAKE].worker.bundle_inputs.shift(); } });
  const result = await env.write('workers.d1_migrate', { account_id: ACCOUNT, database_id: CRM_DB, app: CRM, version: env.release.version });
  assert.match(result.reason, /source sections/);
  assert.deepEqual(env.calls, []);
});

test('format 3 migration receives no statement results and reports no applied migration', async (t) => {
  const env = await setup(t, { history: {}, noStatementResults: true });
  const result = await env.write('workers.d1_migrate', { account_id: ACCOUNT, database_id: INTAKE_DB, app: INTAKE, version: env.release.version });
  assert.equal(result.status, 'vendor_error', JSON.stringify(result));
  assert.deepEqual(result.applied, []);
  assert.equal(result.file, '0001_intake.sql');
});
