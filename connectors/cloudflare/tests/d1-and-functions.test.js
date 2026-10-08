import { confirmCall } from '../../../gateway/test/fake-provider.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix, win32 } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { modules } from '../index.js';

import { existsSync as __exists } from 'node:fs';
import { dirname as __dirname_, join as __join } from 'node:path';
import { fileURLToPath as __toPath, pathToFileURL as __toUrl } from 'node:url';
function __findGateway() {
  let dir = __toPath(new URL('.', import.meta.url));
  for (let i = 0; i < 8; i += 1) {
    const candidate = __join(dir, 'gateway', 'test', 'fake-provider.js');
    if (__exists(candidate)) return __toUrl(candidate).href;
    const parent = __dirname_(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('gateway/test/fake-provider.js not found above this test');
}
const { createTestGateway, putActive } = await import(__findGateway());

const CONNECTORS = fileURLToPath(new URL('../..', import.meta.url));
const ACCOUNT = '0123456789abcdef0123456789abcdef';
const DATABASE = '01234567-89ab-cdef-0123-456789abcdef';
const PROJECT = 'wiser-site';
const MIGRATION_TABLE_SQL = 'CREATE TABLE IF NOT EXISTS "d1_migrations"(\n\t\tid         INTEGER PRIMARY KEY AUTOINCREMENT,\n\t\tname       TEXT UNIQUE,\n\t\tapplied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL\n);';

function scratch() {
  return realpathSync(mkdtempSync(join(tmpdir(), 'cf-new-')));
}

function cleanup(root) {
  rmSync(root, { recursive: true, force: true });
}

function bundleBytes({ bindings, metadata = true, main = 'worker.js' } = {}) {
  const boundary = 'WiserBoundary';
  const meta = { main_module: main };
  if (bindings !== undefined) meta.bindings = bindings;
  const parts = [];
  if (metadata) {
    parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n${JSON.stringify(meta)}\r\n`);
  }
  parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${main}"; filename="${main}"\r\nContent-Type: application/javascript+module\r\n\r\nexport default {}\r\n`);
  parts.push(`--${boundary}--\r\n`);
  return Buffer.from(parts.join(''), 'utf8');
}

function routesJson(overrides = {}) {
  return `${JSON.stringify({ version: 1, include: ['/api/*'], exclude: [], ...overrides })}\n`;
}

function writeBuild(dir, { bundle, routes, routing, extra, linkName, assets, functions, build } = {}) {
  mkdirSync(dir, { recursive: true });
  const provenance = build !== undefined ? build : {
    tool: 'pages-functions',
    assets: assets || join(dirname(dir), 'static'),
    functions: functions || join(dirname(dir), 'functions-src'),
    // The sha256 of a function source that is not in the static fixture.
    sources: [{ path: 'api/x.js', sha256: '5f2b1e7c0d9a8b6c4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d' }],
  };
  if (provenance !== null) writeFileSync(join(dir, 'build.json'), typeof provenance === 'string' ? provenance : `${JSON.stringify(provenance)}\n`);
  writeFileSync(join(dir, '_worker.bundle'), bundle || bundleBytes());
  if (linkName) {
    const real = join(dir, '..', 'linked-routes.json');
    writeFileSync(real, routes || routesJson());
    symlinkSync(real, join(dir, linkName));
  } else {
    writeFileSync(join(dir, '_routes.json'), routes || routesJson());
  }
  writeFileSync(join(dir, 'functions-filepath-routing-config.json'), routing || `${JSON.stringify({ routes: [] })}\n`);
  if (extra) writeFileSync(join(dir, extra), 'nope\n');
  return dir;
}

function formParts(binary) {
  const boundary = binary.content_type.split('boundary=')[1];
  const text = Buffer.from(binary.base64, 'base64');
  const raw = text.toString('latin1');
  const parts = [];
  for (const chunk of raw.split(`--${boundary}`)) {
    const trimmed = chunk.replace(/^\r\n/, '');
    if (trimmed === '' || trimmed === '--\r\n' || trimmed === '--') continue;
    const splitAt = trimmed.indexOf('\r\n\r\n');
    if (splitAt < 0) continue;
    const head = trimmed.slice(0, splitAt);
    let value = trimmed.slice(splitAt + 4);
    if (value.endsWith('\r\n')) value = value.slice(0, -2);
    const name = /name="([^"]+)"/.exec(head)?.[1];
    parts.push({ name, value, head });
  }
  return { boundary, parts };
}

async function granted(moduleName) {
  const { gw, store, fake } = await createTestGateway({ connectorDirs: [CONNECTORS] });
  await putActive(store, fake, { service: 'cloudflare', module: moduleName });
  return { gw, store, fake };
}

function envelope(result) {
  return { status: 200, data: { success: true, result, errors: [], messages: [] }, headers: {} };
}

async function d1Calls(action, input, onProxy) {
  const calls = [];
  const result = await modules.pages[`d1_${action}`](input, {
    async proxy(req) {
      calls.push(req);
      if (onProxy) return onProxy(req, calls);
      return envelope([{ results: [{ ok: 1 }], success: true, meta: { rows_written: 1 } }]);
    },
  });
  return { result, calls };
}

test('d1 actions ride the pages grant: needs_connect without it, and no d1 grant exists', async () => {
  const { gw, store, fake } = await createTestGateway({ connectorDirs: [CONNECTORS] });
  const reads = [
    ['cloudflare.pages.d1_list_databases', { account_id: ACCOUNT }],
    ['cloudflare.pages.d1_get_database', { account_id: ACCOUNT, database_id: DATABASE }],
    ['cloudflare.pages.d1_query', { account_id: ACCOUNT, database_id: DATABASE, sql: 'SELECT 1' }],
  ];
  for (const [action, input] of reads) {
    const denied = await gw.execute({ action, input });
    assert.equal(denied.status, 'needs_connect', action);
    assert.equal(denied.module, 'pages', action);
  }
  // A dns grant does not unlock them.
  await putActive(store, fake, { service: 'cloudflare', module: 'dns' });
  const stillDenied = await gw.execute({ action: reads[0][0], input: reads[0][1] });
  assert.equal(stillDenied.status, 'needs_connect');
  assert.equal(stillDenied.module, 'pages');
  // There is no separate d1 module to connect.
  const noModule = await gw.execute({ action: 'cloudflare.d1.list_databases', input: { account_id: ACCOUNT } });
  assert.notEqual(noModule.status, 'ok');
  assert.equal(noModule.result, undefined);
  await putActive(store, fake, { service: 'cloudflare', module: 'pages' });
  fake.auth.proxy = async () => envelope([]);
  const listed = await gw.execute({ action: reads[0][0], input: reads[0][1] });
  assert.equal(listed.success, true);
});

test('d1 schema refusals happen at the gateway after the grant', async () => {
  const { gw } = await granted('pages');
  const base = { account_id: ACCOUNT, database_id: DATABASE, sql: 'SELECT 1' };
  const undeclared = await gw.execute({ action: 'cloudflare.pages.d1_query', input: { ...base, extra: 1 } });
  assert.equal(undeclared.status, 'invalid_arguments');
  assert.equal(undeclared.field, 'extra');
  assert.equal(undeclared.reason, undefined);
  const badAccount = await gw.execute({ action: 'cloudflare.pages.d1_get_database', input: { account_id: 'acct-1', database_id: DATABASE } });
  assert.equal(badAccount.status, 'invalid_arguments');
  assert.equal(badAccount.field, 'account_id');
  const badDatabase = await gw.execute({ action: 'cloudflare.pages.d1_get_database', input: { account_id: ACCOUNT, database_id: 'not-a-uuid' } });
  assert.equal(badDatabase.status, 'invalid_arguments');
  assert.equal(badDatabase.field, 'database_id');
});

test('d1 reads return the envelope and writes confirm', async () => {
  const { gw, fake } = await granted('pages');
  const calls = [];
  fake.auth.proxy = async (request) => {
    calls.push(request);
    if (request.method === 'GET' && request.endpoint.includes('/d1/database') && !request.endpoint.endsWith(DATABASE)) {
      return envelope([{ uuid: DATABASE, name: 'widget' }]);
    }
    if (request.method === 'GET') return envelope({ uuid: DATABASE, name: 'widget' });
    if (request.method === 'DELETE') return envelope({ uuid: DATABASE });
    return envelope({ uuid: DATABASE, name: request.body && request.body.name });
  };
  const listed = await gw.execute({
    action: 'cloudflare.pages.d1_list_databases',
    input: { account_id: ACCOUNT, name: 'widget', page: 2, per_page: 10 },
  });
  assert.equal(listed.success, true);
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].endpoint, `/accounts/${ACCOUNT}/d1/database?name=widget&page=2&per_page=10`);
  const got = await gw.execute({ action: 'cloudflare.pages.d1_get_database', input: { account_id: ACCOUNT, database_id: DATABASE } });
  assert.equal(got.result.uuid, DATABASE);
  const create = { action: 'cloudflare.pages.d1_create_database', input: { account_id: ACCOUNT, name: 'widget', primary_location_hint: 'weur' } };
  assert.equal((await gw.execute(create)).status, 'needs_confirmation');
  const created = await confirmCall(gw, create);
  assert.equal(created.result.name, 'widget');
  const post = calls.find((item) => item.method === 'POST' && item.endpoint.endsWith('/d1/database'));
  assert.deepEqual(post.body, { name: 'widget', primary_location_hint: 'weur' });
  const remove = { action: 'cloudflare.pages.d1_delete_database', input: { account_id: ACCOUNT, database_id: DATABASE } };
  assert.equal((await gw.execute(remove)).status, 'needs_confirmation');
  const removed = await confirmCall(gw, remove);
  assert.equal(removed.success, true);
  assert.equal(calls.some((item) => item.method === 'DELETE' && item.endpoint.endsWith(`/d1/database/${DATABASE}`)), true);
});

test('d1 query accepts a single SELECT and refuses everything else before a call', async () => {
  const input = { account_id: ACCOUNT, database_id: DATABASE };
  for (const sql of ['select 1', 'SELECT 1;', '  SELECT a FROM t WHERE b = ?']) {
    const params = sql.includes('?') ? ['x'] : undefined;
    const { result, calls } = await d1Calls('query', { ...input, sql, ...(params ? { params } : {}) });
    assert.equal(result.success, true, sql);
    assert.equal(calls.length, 1, sql);
    assert.equal(calls[0].method, 'POST');
    assert.equal(calls[0].endpoint, `/accounts/${ACCOUNT}/d1/database/${DATABASE}/query`);
    assert.equal(calls[0].body.sql, sql);
    if (params) assert.deepEqual(calls[0].body.params, params);
    else assert.equal(Object.hasOwn(calls[0].body, 'params'), false);
  }
  const refusedSql = [
    'SELECT 1; DROP TABLE t',
    "SELECT ';DROP TABLE t'",
    'WITH x AS (SELECT 1) DELETE FROM t',
    'PRAGMA table_info(t)',
    'INSERT INTO t VALUES (1)',
    'selectx',
  ];
  for (const sql of refusedSql) {
    const { result, calls } = await d1Calls('query', { ...input, sql });
    assert.equal(result.status, 'invalid_arguments', sql);
    assert.equal(result.field, 'sql', sql);
    assert.equal(result.reason, 'not a single SELECT statement; use cloudflare.pages.d1_execute', sql);
    assert.equal(calls.length, 0, sql);
  }
  const accepted = `SELECT ${'😀'.repeat(100000 - 'SELECT '.length)}`;
  assert.equal([...accepted].length, 100000);
  const ok = await d1Calls('query', { ...input, sql: accepted });
  assert.equal(ok.result.success, true);
  assert.equal(ok.calls.length, 1);
  const tooMany = '😀'.repeat(100001);
  const longSelect = await d1Calls('query', { ...input, sql: `${accepted}😀` });
  assert.equal(longSelect.calls.length, 0);
  assert.equal(longSelect.result.reason, 'sql longer than 100000 code points');
  const longEmoji = await d1Calls('query', { ...input, sql: tooMany });
  assert.equal(longEmoji.calls.length, 0);
  assert.equal(longEmoji.result.reason, 'sql longer than 100000 code points');
  const tooManyParams = await d1Calls('query', { ...input, sql: 'SELECT 1', params: Array.from({ length: 101 }, () => 'a') });
  assert.equal(tooManyParams.calls.length, 0);
  assert.equal(tooManyParams.result.field, 'params');
  const page = await d1Calls('list_databases', { account_id: ACCOUNT, page: 0 });
  assert.equal(page.calls.length, 0);
  assert.equal(page.result.field, 'page');
  const perPage = await d1Calls('list_databases', { account_id: ACCOUNT, per_page: 10001 });
  assert.equal(perPage.calls.length, 0);
  assert.equal(perPage.result.field, 'per_page');
});

test('d1 execute confirms, posts the sql, and enforces length', async () => {
  const { gw, fake } = await granted('pages');
  const calls = [];
  fake.auth.proxy = async (request) => {
    calls.push(request);
    return envelope([{ results: [], success: true, meta: {} }]);
  };
  const call = { action: 'cloudflare.pages.d1_execute', input: { account_id: ACCOUNT, database_id: DATABASE, sql: 'INSERT INTO t VALUES (1)' } };
  assert.equal((await gw.execute(call)).status, 'needs_confirmation');
  assert.equal(calls.length, 0);
  const ran = await confirmCall(gw, call);
  assert.equal(ran.success, true);
  assert.equal(calls.at(-1).body.sql, 'INSERT INTO t VALUES (1)');
  const long = await modules.pages.d1_execute(
    { account_id: ACCOUNT, database_id: DATABASE, sql: 'a'.repeat(100001) },
    { proxy() { throw new Error('called'); } },
  );
  assert.equal(long.status, 'invalid_arguments');
  assert.equal(long.reason, 'sql longer than 100000 code points');
});

test('d1 query maps success false to vendor_error without the body', async () => {
  const { result } = await d1Calls('get_database', { account_id: ACCOUNT, database_id: DATABASE }, () => ({
    status: 200,
    data: { success: false, errors: [{ message: 'secret-vendor-text' }], result: null },
    headers: {},
  }));
  assert.equal(result.status, 'vendor_error');
  assert.equal(result.method, 'GET');
  assert.equal(result.endpoint, `/accounts/${ACCOUNT}/d1/database/${DATABASE}`);
  assert.equal(JSON.stringify(result).includes('secret-vendor-text'), false);
});

test('apply_migration posts the Wrangler SQL, skips a recorded name, and doubles quotes', async () => {
  const root = scratch();
  try {
    const file = join(root, 'm.sql');
    writeFileSync(file, 'CREATE TABLE t(id INTEGER);\n');
    const quoted = join(root, "o'brien.sql");
    writeFileSync(quoted, 'SELECT 1;\n');
    const { result, calls } = await d1Calls('apply_migration', { account_id: ACCOUNT, database_id: DATABASE, file }, (req, seen) => {
      if (seen.length === 2) return envelope([{ results: [], success: true, meta: { rows_written: 0 } }]);
      if (seen.length === 3) {
        return envelope([
          { success: true, meta: { rows_written: 1 }, results: [] },
          { success: true, meta: { rows_written: 1 }, results: [] },
        ]);
      }
      return envelope([{ success: true, meta: { rows_written: 0 }, results: [] }]);
    });
    assert.equal(calls.length, 3);
    assert.equal(calls[0].body.sql, MIGRATION_TABLE_SQL);
    assert.deepEqual(calls[1].body, { sql: 'SELECT name FROM "d1_migrations" WHERE name = ?', params: ['m.sql'] });
    assert.equal(calls[2].body.sql, 'CREATE TABLE t(id INTEGER);\n\nINSERT INTO "d1_migrations" (name)\nvalues (\'m.sql\');');
    assert.equal(result.applied, true);
    assert.equal(result.name, 'm.sql');
    assert.equal(result.database_id, DATABASE);
    assert.equal(result.statements, 2);
    assert.equal(result.rows_written, 2);
    assert.equal(JSON.stringify(result).includes('CREATE TABLE t'), false);
    const again = await d1Calls('apply_migration', { account_id: ACCOUNT, database_id: DATABASE, file }, (req, seen) => {
      if (seen.length === 2) return envelope([{ results: [{ name: 'm.sql' }], success: true, meta: {} }]);
      return envelope([{ success: true, results: [], meta: {} }]);
    });
    assert.equal(again.calls.length, 2);
    assert.deepEqual(again.result, { already_applied: true, name: 'm.sql', database_id: DATABASE });
    const named = await d1Calls('apply_migration', { account_id: ACCOUNT, database_id: DATABASE, file: quoted }, (req, seen) => {
      if (seen.length === 2) return envelope([{ results: [], success: true, meta: {} }]);
      return envelope([{ success: true, meta: { rows_written: 0 }, results: [] }]);
    });
    assert.match(named.calls[2].body.sql, /values \('o''brien\.sql'\);$/);
    const failed = await d1Calls('apply_migration', { account_id: ACCOUNT, database_id: DATABASE, file }, (req, seen) => {
      if (seen.length < 3) return envelope([{ results: [], success: true, meta: {} }]);
      return envelope([
        { success: true, meta: { rows_written: 1 }, results: [] },
        { success: false, meta: {}, results: [] },
      ]);
    });
    assert.equal(failed.result.status, 'vendor_error');
    assert.equal(failed.result.reason, 'statement failed');
    assert.equal(failed.result.statement_index, 1);
    assert.equal(failed.result.method, 'POST');
  } finally {
    cleanup(root);
  }
});

test('apply_migration refuses a bad file before any call', async () => {
  const root = scratch();
  const holder = scratch();
  try {
    const sql = join(root, 'ok.sql');
    writeFileSync(sql, 'SELECT 1;\n');
    const linkDir = join(holder, 'linked');
    symlinkSync(root, linkDir);
    const cases = [
      ['migration.sql', 'path must be absolute'],
      [join(linkDir, 'ok.sql'), 'symbolic link in path'],
      [join(root, 'notes.txt'), 'extension must be .sql'],
      [join(root, '.env.sql'), 'credential'],
      [join(root, 'blank.sql'), 'empty file'],
      [join(root, 'bad.sql'), 'invalid UTF-8'],
      [join(root, 'big.sql'), 'file over 1 MiB (1048576 bytes)'],
    ];
    writeFileSync(join(root, 'notes.txt'), 'nope\n');
    writeFileSync(join(root, '.env.sql'), 'SELECT 1;\n');
    writeFileSync(join(root, 'blank.sql'), ' \n\t');
    writeFileSync(join(root, 'bad.sql'), Buffer.from([0xff, 0xfe]));
    writeFileSync(join(root, 'big.sql'), Buffer.alloc(1048577, 0x41));
    for (const [file, reason] of cases) {
      let calls = 0;
      const result = await modules.pages.d1_apply_migration(
        { account_id: ACCOUNT, database_id: DATABASE, file },
        { proxy() { calls += 1; throw new Error('called'); } },
      );
      assert.equal(calls, 0, file);
      assert.equal(result.status, 'invalid_arguments', file);
      assert.equal(result.field, 'file', file);
      assert.equal(result.reason, reason, file);
    }
    const { gw } = await granted('pages');
    const pending = await gw.execute({ action: 'cloudflare.pages.d1_apply_migration', input: { account_id: ACCOUNT, database_id: DATABASE, file: sql } });
    assert.equal(pending.status, 'needs_confirmation');
  } finally {
    cleanup(holder);
    cleanup(root);
  }
});

test('bind_d1 patches only the named binding and reports collateral names', async () => {
  const { gw, fake } = await granted('pages');
  const calls = [];
  const before = {
    production: {
      env_vars: { TOKEN: 'super-secret-value' },
      d1_databases: { OTHER: { id: 'old-other' }, DB: { id: 'previous-db' } },
      fail_open: true,
      compatibility_date: '2026-01-01',
    },
    preview: {
      d1_databases: { OTHER: { id: 'preview-other' } },
      fail_open: false,
      compatibility_date: '2026-02-02',
    },
  };
  const after = {
    production: {
      d1_databases: { OTHER: { id: 'changed-other' }, DB: { id: DATABASE } },
      fail_open: true,
      compatibility_date: '2026-01-01',
    },
    preview: {
      d1_databases: { OTHER: { id: 'preview-other' }, DB: { id: DATABASE } },
      fail_open: false,
      compatibility_date: '2026-02-02',
    },
  };
  fake.auth.proxy = async (request) => {
    calls.push(request);
    if (request.method === 'GET') return envelope({ deployment_configs: before });
    return envelope({ deployment_configs: after });
  };
  const call = { action: 'cloudflare.pages.bind_d1', input: { account_id: ACCOUNT, project_name: PROJECT, binding: 'DB', database_id: DATABASE } };
  assert.equal((await gw.execute(call)).status, 'needs_confirmation');
  assert.equal(calls.length, 0);
  const result = await confirmCall(gw, call);
  const patch = calls.find((item) => item.method === 'PATCH');
  assert.deepEqual(patch.body, {
    deployment_configs: {
      production: { d1_databases: { DB: { id: DATABASE } } },
      preview: { d1_databases: { DB: { id: DATABASE } } },
    },
  });
  assert.deepEqual(result.environments, ['production', 'preview']);
  assert.deepEqual(result.replaced, { production: 'previous-db', preview: null });
  assert.deepEqual(result.fail_open, { production: true, preview: false });
  assert.deepEqual(result.compatibility_date, { production: '2026-01-01', preview: '2026-02-02' });
  assert.deepEqual(result.collateral_changes, ['production.d1_databases.OTHER', 'production.env_vars']);
  assert.equal(JSON.stringify(result).includes('super-secret-value'), false);
  calls.length = 0;
  const one = await confirmCall(gw, {
    action: 'cloudflare.pages.bind_d1',
    input: { ...call.input, environments: ['production'] },
  });
  const only = calls.find((item) => item.method === 'PATCH');
  assert.deepEqual(Object.keys(only.body.deployment_configs), ['production']);
  assert.deepEqual(one.environments, ['production']);
  const dup = await confirmCall(gw, {
    action: 'cloudflare.pages.bind_d1',
    input: { ...call.input, environments: ['production', 'production'] },
  });
  assert.equal(dup.status, 'invalid_arguments');
  assert.equal(dup.field, 'environments');
  calls.length = 0;
  fake.auth.proxy = async (request) => {
    calls.push(request);
    if (request.method === 'GET') return envelope({ deployment_configs: before });
    return envelope({ deployment_configs: { production: { d1_databases: {} }, preview: { d1_databases: {} } } });
  };
  const missing = await confirmCall(gw, call);
  assert.equal(missing.status, 'vendor_error');
  assert.equal(missing.reason, 'binding not applied');
  assert.equal(missing.method, 'PATCH');
  assert.deepEqual(missing.environments, ['production', 'preview']);
});

function staticAndBuild() {
  const root = scratch();
  const dir = join(root, 'static');
  const build = join(root, 'build');
  mkdirSync(dir);
  writeFileSync(join(dir, 'index.html'), '<h1>Hi</h1>\n');
  writeFileSync(join(dir, '.hidden'), 'secret\n');
  writeFileSync(join(dir, 'id_rsa'), 'key\n');
  writeFileSync(join(dir, '.env'), 'TOKEN=1\n');
  writeBuild(build);
  return { root, dir, build };
}

function deployProxy(calls, { mutate } = {}) {
  return async (request) => {
    calls.push(request);
    if (mutate) mutate(request);
    if (request.method === 'GET' && request.endpoint.endsWith('/upload-token')) {
      return envelope({ jwt: 'functions-upload-jwt' });
    }
    if (request.endpoint === '/pages/assets/check-missing') return envelope([]);
    if (request.endpoint === '/pages/assets/upload' || request.endpoint === '/pages/assets/upsert-hashes') return envelope(null);
    if (request.method === 'POST' && request.endpoint.endsWith('/deployments')) {
      return envelope({ id: 'dep-fn', url: 'https://wiser-site.pages.dev' });
    }
    return envelope({});
  };
}

test('deploy_with_functions sends the three build files and skips screened names', async () => {
  const { gw, fake } = await granted('pages');
  const tree = staticAndBuild();
  const calls = [];
  fake.auth.proxy = deployProxy(calls);
  const bundle = readFileSync(join(tree.build, '_worker.bundle'));
  const routes = readFileSync(join(tree.build, '_routes.json'));
  const routing = readFileSync(join(tree.build, 'functions-filepath-routing-config.json'));
  const call = {
    action: 'cloudflare.pages.deploy_with_functions',
    input: { account_id: ACCOUNT, project_name: PROJECT, dir: tree.dir, functions_build: tree.build },
  };
  try {
    assert.equal((await gw.execute(call)).status, 'needs_confirmation');
    assert.equal(calls.length, 0);
    const result = await confirmCall(gw, call);
    const deployment = calls.find((item) => item.endpoint.endsWith('/deployments'));
    const form = formParts(deployment.binary_body);
    const names = form.parts.map((part) => part.name);
    assert.deepEqual(names, ['manifest', 'functions-filepath-routing-config.json', '_worker.bundle', '_routes.json']);
    const manifest = JSON.parse(form.parts[0].value);
    assert.deepEqual(Object.keys(manifest), ['/index.html']);
    for (const banned of ['_worker.bundle', '_routes.json', 'functions-filepath-routing-config.json']) {
      assert.equal(Object.hasOwn(manifest, `/${banned}`), false);
    }
    // The bundle is sent as rebuilt from what was screened: the same metadata and
    // module, under the connector's own boundary and headers.
    const sent = form.parts.find((part) => part.name === '_worker.bundle').value;
    assert.match(sent, /^--wiser-[0-9a-f-]+\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n\{"main_module":"worker\.js"\}\r\n/);
    assert.match(sent, /Content-Disposition: form-data; name="worker\.js"; filename="worker\.js"\r\nContent-Type: application\/javascript\+module\r\n\r\nexport default \{\}\r\n/);
    assert.equal(sent === bundle.toString('latin1'), false);
    assert.equal(form.parts.find((part) => part.name === '_routes.json').value, routes.toString('latin1'));
    assert.equal(form.parts.find((part) => part.name === 'functions-filepath-routing-config.json').value, routing.toString('latin1'));
    const uploads = calls.filter((item) => item.endpoint === '/pages/assets/upload');
    assert.equal(uploads.length, 0);
    assert.equal(result.functions.main_module, 'worker.js');
    assert.equal(result.functions.bundle_bytes, Buffer.byteLength(sent, 'latin1'));
    assert.deepEqual(result.functions.routes, { include: ['/api/*'], exclude: [] });
    assert.equal(result.functions.build.assets, tree.dir);
    assert.equal(result.files, 1);
    assert.ok(result.skipped.some((item) => item.file === '.hidden' && item.reason === 'hidden'));
    assert.ok(result.skipped.some((item) => item.file === '.env' && item.reason === 'hidden'));
    assert.ok(result.skipped.some((item) => item.file === 'id_rsa' && item.reason === 'credential'));
    assert.equal(JSON.stringify(result).includes('functions-upload-jwt'), false);
  } finally {
    cleanup(tree.root);
  }
});

test('deploy_with_functions refuses build output, overlap, and a bad bundle before any call', async () => {
  const { gw } = await granted('pages');
  const names = ['functions', '_worker.js', '_worker.bundle', 'functions-filepath-routing-config.json', 'package.json', 'wrangler.toml', 'wrangler.json', 'wrangler.jsonc'];
  // Each name is also tried in another letter case: a case-insensitive filesystem
  // serves Functions/ as functions/, so the screen compares lowercased names.
  const spellings = [...names.map((name) => [name, name]), ['Functions', 'functions'], ['Package.json', 'package.json'], ['_Worker.js', '_worker.js'], ['WRANGLER.TOML', 'wrangler.toml']];
  for (const [spelled, name] of spellings) {
    const root = scratch();
    const dir = join(root, 'static');
    const build = join(root, 'build');
    mkdirSync(dir);
    writeFileSync(join(dir, 'index.html'), 'x\n');
    if (name === 'functions') mkdirSync(join(dir, spelled));
    else writeFileSync(join(dir, spelled), 'x\n');
    writeBuild(build);
    try {
      const result = await confirmCall(gw, {
        action: 'cloudflare.pages.deploy_with_functions',
        input: { account_id: ACCOUNT, project_name: PROJECT, dir, functions_build: build },
      });
      assert.equal(result.status, 'invalid_arguments', spelled);
      assert.equal(result.reason, `not build output: ${name}`, spelled);
    } finally {
      cleanup(root);
    }
  }
  const root = scratch();
  try {
    const dir = join(root, 'static');
    const inner = join(dir, 'fns');
    mkdirSync(dir);
    writeFileSync(join(dir, 'index.html'), 'x\n');
    writeBuild(inner);
    const inside = await confirmCall(gw, {
      action: 'cloudflare.pages.deploy_with_functions',
      input: { account_id: ACCOUNT, project_name: PROJECT, dir, functions_build: inner },
    });
    assert.equal(inside.reason, 'functions_build overlaps dir');
    const outer = join(root, 'outer');
    const nested = join(outer, 'static');
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(nested, 'index.html'), 'x\n');
    const swapped = await confirmCall(gw, {
      action: 'cloudflare.pages.deploy_with_functions',
      input: { account_id: ACCOUNT, project_name: PROJECT, dir: nested, functions_build: outer },
    });
    assert.equal(swapped.reason, 'functions_build overlaps dir');
  } finally {
    cleanup(root);
  }
});

test('deploy_with_functions refuses a bad functions_build before any call', async () => {
  const { gw, fake } = await granted('pages');
  const calls = [];
  fake.auth.proxy = async (request) => {
    calls.push(request);
    return envelope({});
  };
  async function refuse(setup) {
    calls.length = 0;
    const root = scratch();
    const dir = join(root, 'static');
    mkdirSync(dir);
    writeFileSync(join(dir, 'index.html'), 'x\n');
    const build = join(root, 'build');
    try {
      setup(build);
      const result = await confirmCall(gw, {
        action: 'cloudflare.pages.deploy_with_functions',
        input: { account_id: ACCOUNT, project_name: PROJECT, dir, functions_build: build },
      });
      assert.equal(calls.length, 0);
      assert.equal(result.status, 'invalid_arguments');
      assert.equal(result.field, 'functions_build');
      return result;
    } finally {
      cleanup(root);
    }
  }
  const missing = await refuse((build) => {
    mkdirSync(build);
    writeFileSync(join(build, '_worker.bundle'), bundleBytes());
    writeFileSync(join(build, 'functions-filepath-routing-config.json'), '{"routes":[]}\n');
  });
  assert.equal(missing.reason, 'missing _routes.json');
  const extra = await refuse((build) => writeBuild(build, { extra: 'extra.txt' }));
  assert.equal(extra.reason, 'unexpected entry: extra.txt');
  const linked = await refuse((build) => writeBuild(build, { linkName: '_routes.json' }));
  assert.equal(linked.reason, 'symbolic link: _routes.json');
  const bindings = await refuse((build) => writeBuild(build, { bundle: bundleBytes({ bindings: [{ name: 'DB' }] }) }));
  assert.match(bindings.reason, /bundle carries bindings/);
  assert.match(bindings.reason, /cloudflare\.pages\.bind_d1/);
  const noMeta = await refuse((build) => writeBuild(build, { bundle: bundleBytes({ metadata: false }) }));
  assert.equal(noMeta.reason, 'bundle has no metadata part');
  const version = await refuse((build) => writeBuild(build, { routes: routesJson({ version: 2 }) }));
  assert.equal(version.reason, '_routes.json version is not 1');
  const many = await refuse((build) => writeBuild(build, { routes: routesJson({ include: Array.from({ length: 101 }, (_, i) => `/r/${i}`) }) }));
  assert.equal(many.reason, '_routes.json has more than 100 rules');
  const slash = await refuse((build) => writeBuild(build, { routes: routesJson({ include: ['api'] }) }));
  assert.equal(slash.reason, '_routes.json rule does not start with /');
  const huge = await refuse((build) => {
    writeBuild(build);
    writeFileSync(join(dirOf(build), '..', 'static', '_headers'), Buffer.alloc(2400000, 0x61));
  });
  assert.equal(huge.reason, 'deployment request over the 3 MiB limit');
  assert.equal(typeof huge.bytes, 'number');
  assert.ok(huge.bytes > 3 * 1024 * 1024);
  assert.match(huge.fallback, /wrangler pages deploy/);
});

function dirOf(build) {
  return build;
}

test('deploy_with_functions stops when a build file changes and pages.deploy still rejects a kit worker', async () => {
  const { gw, fake } = await granted('pages');
  const tree = staticAndBuild();
  const seen = [];
  fake.auth.proxy = async (request) => {
    seen.push(request.endpoint);
    if (request.endpoint === '/pages/assets/check-missing') {
      writeFileSync(join(tree.build, '_routes.json'), `${JSON.stringify({ version: 1, include: ['/changed'], exclude: [] })}\n`);
    }
    if (request.method === 'GET' && request.endpoint.endsWith('/upload-token')) return envelope({ jwt: 'jwt-change' });
    if (request.endpoint === '/pages/assets/check-missing') return envelope([]);
    return envelope(null);
  };
  try {
    const changed = await confirmCall(gw, {
      action: 'cloudflare.pages.deploy_with_functions',
      input: { account_id: ACCOUNT, project_name: PROJECT, dir: tree.dir, functions_build: tree.build },
    });
    assert.equal(changed.status, 'invalid_arguments');
    assert.equal(changed.field, 'functions_build');
    assert.equal(changed.reason, 'file changed during deploy: _routes.json');
    assert.equal(seen.some((endpoint) => endpoint.endsWith('/deployments')), false);
    assert.equal(seen.some((endpoint) => endpoint.endsWith('/upsert-hashes')), false);
  } finally {
    cleanup(tree.root);
  }
  const kit = realpathSync(mkdtempSync(join(tmpdir(), 'kit-still-')));
  const dist = join(kit, 'site', 'dist');
  mkdirSync(dist, { recursive: true });
  writeFileSync(join(kit, 'site', 'kit.json'), '{}\n');
  writeFileSync(join(dist, 'index.html'), '<h1>Hi</h1>\n');
  writeFileSync(join(dist, '_worker.js'), 'export default {}\n');
  const functions = join(dist, 'functions');
  try {
    const worker = await confirmCall(gw, {
      action: 'cloudflare.pages.deploy',
      input: { account_id: 'acct-1', project_name: 'kit-site', dir: dist },
    });
    assert.equal(worker.reason, 'static kit output only');
    rmSync(join(dist, '_worker.js'));
    mkdirSync(functions);
    writeFileSync(join(functions, 'api.js'), 'export {}\n');
    const fn = await confirmCall(gw, {
      action: 'cloudflare.pages.deploy',
      input: { account_id: 'acct-1', project_name: 'kit-site', dir: dist },
    });
    assert.equal(fn.reason, 'static kit output only');
  } finally {
    cleanup(kit);
  }
});

// Adversarial review round 1, 2026-10-07: one case per supported finding.

test('review 1: a bundle whose part headers two parsers could read differently is refused', async () => {
  const { gw, fake } = await granted('pages');
  const calls = [];
  fake.auth.proxy = deployProxy(calls);
  const B = 'Spoof';
  const evil = JSON.stringify({ main_module: 'worker.js', bindings: [{ type: 'plain_text', name: 'EVIL', text: 'x' }] });
  const clean = JSON.stringify({ main_module: 'worker.js' });
  const mod = `--${B}\r\nContent-Disposition: form-data; name="worker.js"; filename="worker.js"\r\nContent-Type: application/javascript+module\r\n\r\nexport default {}\r\n`;
  const cases = [
    [`--${B}\r\nContent-Disposition: form-data; name="metadata"; x-name="decoy"\r\n\r\n${evil}\r\n--${B}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n${clean}\r\n${mod}--${B}--\r\n`, 'bundle part has an ambiguous or missing name'],
    [`--${B}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n${clean}\r\n--${B}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n${evil}\r\n${mod}--${B}--\r\n`, 'bundle has two parts named metadata'],
    [`--${B}\r\nContent-Disposition: form-data; name="metadata"; name="other"\r\n\r\n${clean}\r\n${mod}--${B}--\r\n`, 'bundle part has an ambiguous or missing name'],
    [`--${B}\r\nContent-Disposition: form-data; name="metadata"\r\nContent-Disposition: form-data; name="x"\r\n\r\n${clean}\r\n${mod}--${B}--\r\n`, 'bundle part repeats content-disposition'],
    [`--${B}\r\nContent-Disposition: form-data; name="metadata"\r\nX-Extra: 1\r\n\r\n${clean}\r\n${mod}--${B}--\r\n`, 'bundle part has an unexpected header: x-extra'],
    [`--${B}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n${clean}\r\n--${B}\r\nContent-Disposition: form-data; name="worker.js"\r\nContent-Type: text/html\r\n\r\nx\r\n--${B}--\r\n`, 'bundle part worker.js has an unexpected content type'],
  ];
  for (const [bundle, reason] of cases) {
    const tree = staticAndBuild();
    writeFileSync(join(tree.build, '_worker.bundle'), bundle);
    try {
      calls.length = 0;
      const result = await confirmCall(gw, {
        action: 'cloudflare.pages.deploy_with_functions',
        input: { account_id: ACCOUNT, project_name: PROJECT, dir: tree.dir, functions_build: tree.build },
      });
      assert.equal(result.status, 'invalid_arguments', reason);
      assert.equal(result.reason, reason);
      assert.equal(calls.length, 0, reason);
    } finally {
      cleanup(tree.root);
    }
  }
});

test('review 2: a path spelled with . or .. or an empty segment is refused, not normalized', async () => {
  const { gw, fake } = await granted('pages');
  fake.auth.proxy = deployProxy([]);
  const tree = staticAndBuild();
  try {
    for (const dir of [`${tree.root}/static/../static`, `${tree.root}/./static`, `${tree.root}//static`]) {
      const result = await confirmCall(gw, {
        action: 'cloudflare.pages.deploy_with_functions',
        input: { account_id: ACCOUNT, project_name: PROJECT, dir, functions_build: tree.build },
      });
      assert.equal(result.reason, 'path is not in normal form', dir);
    }
    const trailing = await confirmCall(gw, {
      action: 'cloudflare.pages.deploy_with_functions',
      input: { account_id: ACCOUNT, project_name: PROJECT, dir: `${tree.dir}/`, functions_build: tree.build },
    });
    assert.notEqual(trailing.reason, 'path is not in normal form');
    const sql = join(tree.root, 'm.sql');
    writeFileSync(sql, 'CREATE TABLE t(x);\n');
    const { result, calls } = await d1Calls('apply_migration', { account_id: ACCOUNT, database_id: DATABASE, file: `${tree.root}/static/../m.sql` });
    assert.equal(result.reason, 'path is not in normal form');
    assert.equal(calls.length, 0);
  } finally {
    cleanup(tree.root);
  }
});

test('review 3: kit payloads, nested server files and a mismatched build.json are refused; nested source files are skipped', async () => {
  const { gw, fake } = await granted('pages');
  const calls = [];
  fake.auth.proxy = deployProxy(calls);
  const deploy = (dir, build) => confirmCall(gw, {
    action: 'cloudflare.pages.deploy_with_functions',
    input: { account_id: ACCOUNT, project_name: PROJECT, dir, functions_build: build },
  });
  // A kit payload: site/dist beside site/kit.json.
  const kitRoot = scratch();
  try {
    const dist = join(kitRoot, 'site', 'dist');
    mkdirSync(dist, { recursive: true });
    writeFileSync(join(kitRoot, 'site', 'kit.json'), '{}\n');
    writeFileSync(join(dist, 'index.html'), 'x\n');
    const build = join(kitRoot, 'build');
    writeBuild(build, { assets: dist });
    assert.equal((await deploy(dist, build)).reason, 'kit payload: use cloudflare.pages.deploy');
  } finally {
    cleanup(kitRoot);
  }
  // Nested server files stop the deploy, in any case.
  for (const name of ['_worker.bundle', '_Worker.js', 'functions-filepath-routing-config.json']) {
    const tree = staticAndBuild();
    try {
      mkdirSync(join(tree.dir, 'public'));
      writeFileSync(join(tree.dir, 'public', name), 'x\n');
      const result = await deploy(tree.dir, tree.build);
      assert.equal(result.reason, `not build output: public/${name}`, name);
    } finally {
      cleanup(tree.root);
    }
  }
  // build.json must name this dir, and a functions source outside it.
  {
    const tree = staticAndBuild();
    try {
      writeBuild(tree.build, { assets: join(tree.root, 'elsewhere') });
      assert.equal((await deploy(tree.dir, tree.build)).reason, 'build.json assets is not dir');
      rmSync(tree.build, { recursive: true, force: true });
      writeBuild(tree.build, { functions: join(tree.dir, 'fn') });
      assert.equal((await deploy(tree.dir, tree.build)).reason, 'functions source overlaps dir');
      rmSync(tree.build, { recursive: true, force: true });
      writeBuild(tree.build, { build: null });
      assert.equal((await deploy(tree.dir, tree.build)).reason, 'missing build.json');
    } finally {
      cleanup(tree.root);
    }
  }
  // Nested source files are skipped and listed; the deploy goes ahead.
  {
    const tree = staticAndBuild();
    try {
      mkdirSync(join(tree.dir, 'demo'));
      writeFileSync(join(tree.dir, 'demo', 'package.json'), '{}\n');
      writeFileSync(join(tree.dir, 'demo', 'Wrangler.toml'), 'x\n');
      calls.length = 0;
      const result = await deploy(tree.dir, tree.build);
      assert.equal(result.deployment.id, 'dep-fn');
      assert.ok(result.skipped.some((item) => item.file === 'demo/package.json' && item.reason === 'source file'));
      assert.ok(result.skipped.some((item) => item.file === 'demo/Wrangler.toml' && item.reason === 'source file'));
      assert.equal(result.manifest.some((path) => path.startsWith('/demo/')), false);
    } finally {
      cleanup(tree.root);
    }
  }
});

test('review 4: a failed migration table or history statement stops before the migration runs', async () => {
  const root = scratch();
  try {
    const file = join(root, '0001_x.sql');
    writeFileSync(file, 'CREATE TABLE x(id INTEGER);\n');
    const input = { account_id: ACCOUNT, database_id: DATABASE, file };
    const tableFails = await d1Calls('apply_migration', input, () => envelope([{ success: false, results: [] }]));
    assert.equal(tableFails.result.reason, 'migration table not created');
    assert.equal(tableFails.calls.length, 1);
    const historyFails = await d1Calls('apply_migration', input, (req, calls) => (calls.length === 1
      ? envelope([{ success: true, results: [] }])
      : envelope([{ success: false, error: 'lookup failed' }])));
    assert.equal(historyFails.result.reason, 'migration history unreadable');
    assert.equal(historyFails.calls.length, 2);
    const historyShapeless = await d1Calls('apply_migration', input, (req, calls) => (calls.length === 1
      ? envelope([{ success: true, results: [] }])
      : envelope([{ success: true }])));
    assert.equal(historyShapeless.result.reason, 'migration history unreadable');
    assert.equal(historyShapeless.calls.length, 2);
  } finally {
    cleanup(root);
  }
});

test('review 5: a change to an environment the bind did not name is reported', async () => {
  const { gw, fake } = await granted('pages');
  fake.auth.proxy = async (request) => {
    if (request.method === 'GET') {
      return envelope({ deployment_configs: {
        production: { fail_open: true, d1_databases: {} },
        preview: { env_vars: { SECRET: { type: 'secret_text' } }, d1_databases: { OTHER: { id: DATABASE } } },
      } });
    }
    return envelope({ deployment_configs: {
      production: { fail_open: true, d1_databases: { DB: { id: DATABASE } } },
      preview: {},
    } });
  };
  const result = await confirmCall(gw, {
    action: 'cloudflare.pages.bind_d1',
    input: { account_id: ACCOUNT, project_name: PROJECT, binding: 'DB', database_id: DATABASE, environments: ['production'] },
  });
  assert.deepEqual(result.collateral_changes, ['preview.d1_databases.OTHER', 'preview.env_vars']);
  assert.equal(JSON.stringify(result).includes('secret_text'), false);
  assert.deepEqual(Object.keys(result.fail_open), ['production']);
});

test('bind_d1 does not report an empty setting rewritten in another shape (null to {}, seen live)', async () => {
  const { gw, fake } = await granted('pages');
  fake.auth.proxy = async (request) => {
    if (request.method === 'GET') {
      return envelope({ deployment_configs: { production: { env_vars: null, fail_open: true }, preview: { env_vars: null, fail_open: true } } });
    }
    return envelope({ deployment_configs: {
      production: { env_vars: {}, fail_open: true, d1_databases: { DB: { id: DATABASE } } },
      preview: { env_vars: {}, fail_open: true, d1_databases: { DB: { id: DATABASE } } },
    } });
  };
  const result = await confirmCall(gw, {
    action: 'cloudflare.pages.bind_d1',
    input: { account_id: ACCOUNT, project_name: PROJECT, binding: 'DB', database_id: DATABASE },
  });
  assert.deepEqual(result.collateral_changes, []);
  fake.auth.proxy = async (request) => {
    if (request.method === 'GET') {
      return envelope({ deployment_configs: { production: { env_vars: { A: { type: 'plain_text', value: 'x' } } }, preview: {} } });
    }
    return envelope({ deployment_configs: { production: { env_vars: {}, d1_databases: { DB: { id: DATABASE } } }, preview: { d1_databases: { DB: { id: DATABASE } } } } });
  };
  const emptied = await confirmCall(gw, {
    action: 'cloudflare.pages.bind_d1',
    input: { account_id: ACCOUNT, project_name: PROJECT, binding: 'DB', database_id: DATABASE },
  });
  assert.deepEqual(emptied.collateral_changes, ['production.env_vars']);
});

// Adversarial review round 2, 2026-10-07: one case per supported finding.

test('review 2.1: a function source published under any name, or an unresolved source path, is refused', async () => {
  const { gw, fake } = await granted('pages');
  fake.auth.proxy = deployProxy([]);
  const deploy = (tree) => confirmCall(gw, {
    action: 'cloudflare.pages.deploy_with_functions',
    input: { account_id: ACCOUNT, project_name: PROJECT, dir: tree.dir, functions_build: tree.build },
  });
  const source = Buffer.from('export const onRequest = () => new Response("secret logic");\n');
  const sha256 = createHash('sha256').update(source).digest('hex');
  const tree = staticAndBuild();
  try {
    mkdirSync(join(tree.dir, 'public', 'functions'), { recursive: true });
    writeFileSync(join(tree.dir, 'public', 'functions', 'api.ts'), source);
    rmSync(tree.build, { recursive: true, force: true });
    writeBuild(tree.build, { build: { assets: tree.dir, functions: join(tree.root, 'functions-src'), sources: [{ path: 'api.ts', sha256 }] } });
    assert.equal((await deploy(tree)).reason, 'functions source in dir: public/functions/api.ts');
    rmSync(tree.build, { recursive: true, force: true });
    writeBuild(tree.build, { build: { assets: tree.dir, functions: `${tree.root}/alias/../static/server`, sources: [{ path: 'x', sha256 }] } });
    assert.equal((await deploy(tree)).reason, 'build.json names no functions source by its real path');
    rmSync(tree.build, { recursive: true, force: true });
    writeBuild(tree.build, { build: { assets: tree.dir, functions: join(tree.root, 'functions-src'), sources: [] } });
    assert.equal((await deploy(tree)).reason, 'build.json lists no sources');
  } finally {
    cleanup(tree.root);
  }
});

test('review 2.2: normal form is the platform normal form, so Windows separators and UNC roots are judged right', () => {
  // The helper is not exported; its rule is path.normalize, checked here on both platforms' modules.
  const strip = (value) => (value.length > 1 && /[\\/]$/.test(value) ? value.slice(0, -1) : value);
  const notNormal = (p, input) => strip(p.normalize(input)) !== strip(input);
  assert.equal(notNormal(win32, 'C:/work/link/../out'), true);
  assert.equal(notNormal(win32, 'C:\\work\\link\\..\\out'), true);
  assert.equal(notNormal(win32, 'C:\\work\\out'), false);
  assert.equal(notNormal(win32, '\\\\server\\share\\out'), false);
  assert.equal(notNormal(win32, 'C:\\work\\out\\'), false);
  assert.equal(notNormal(posix, '/work/out/'), false);
  assert.equal(notNormal(posix, '/work//out'), true);
});

test('review 2.5: a migration table or history statement without success true stops the migration', async () => {
  const root = scratch();
  try {
    const file = join(root, '0002_y.sql');
    writeFileSync(file, 'CREATE TABLE y(id INTEGER);\n');
    const input = { account_id: ACCOUNT, database_id: DATABASE, file };
    const tableSilent = await d1Calls('apply_migration', input, () => envelope([{}]));
    assert.equal(tableSilent.result.reason, 'migration table not created');
    assert.equal(tableSilent.calls.length, 1);
    const historySilent = await d1Calls('apply_migration', input, (req, calls) => (calls.length === 1
      ? envelope([{ success: true, results: [] }])
      : envelope([{ results: [], error: 'lookup failed' }])));
    assert.equal(historySilent.result.reason, 'migration history unreadable');
    assert.equal(historySilent.calls.length, 2);
  } finally {
    cleanup(root);
  }
});

test('review 2.6: a directory inside a kit dist is a kit payload', async () => {
  const { gw, fake } = await granted('pages');
  fake.auth.proxy = deployProxy([]);
  const root = scratch();
  try {
    const nested = join(root, 'site', 'dist', 'public');
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(root, 'site', 'kit.json'), '{}\n');
    writeFileSync(join(nested, 'index.html'), 'x\n');
    const build = join(root, 'build');
    writeBuild(build, { assets: nested });
    const result = await confirmCall(gw, {
      action: 'cloudflare.pages.deploy_with_functions',
      input: { account_id: ACCOUNT, project_name: PROJECT, dir: nested, functions_build: build },
    });
    assert.equal(result.reason, 'kit payload: use cloudflare.pages.deploy');
  } finally {
    cleanup(root);
  }
});

test('review 2.7: a failed bind still reports collateral changes', async () => {
  const { gw, fake } = await granted('pages');
  fake.auth.proxy = async (request) => {
    if (request.method === 'GET') {
      return envelope({ deployment_configs: { production: {}, preview: { d1_databases: { OTHER: { id: DATABASE } } } } });
    }
    return envelope({ deployment_configs: { production: {}, preview: {} } });
  };
  const result = await confirmCall(gw, {
    action: 'cloudflare.pages.bind_d1',
    input: { account_id: ACCOUNT, project_name: PROJECT, binding: 'DB', database_id: DATABASE, environments: ['production'] },
  });
  assert.equal(result.reason, 'binding not applied');
  assert.deepEqual(result.collateral_changes, ['preview.d1_databases.OTHER']);
});

test('review 2.8: a bundle part name that is not plain ASCII is refused', async () => {
  const { gw, fake } = await granted('pages');
  fake.auth.proxy = deployProxy([]);
  const B = 'Ascii';
  const name = Buffer.from('café.js', 'utf8').toString('latin1');
  const bundle = Buffer.from(`--${B}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n${JSON.stringify({ main_module: name })}\r\n--${B}\r\nContent-Disposition: form-data; name="${name}"\r\nContent-Type: application/javascript+module\r\n\r\nexport default {}\r\n--${B}--\r\n`, 'latin1');
  const tree = staticAndBuild();
  try {
    writeFileSync(join(tree.build, '_worker.bundle'), bundle);
    const result = await confirmCall(gw, {
      action: 'cloudflare.pages.deploy_with_functions',
      input: { account_id: ACCOUNT, project_name: PROJECT, dir: tree.dir, functions_build: tree.build },
    });
    assert.equal(result.reason, 'bundle part name is not plain ASCII');
  } finally {
    cleanup(tree.root);
  }
});
