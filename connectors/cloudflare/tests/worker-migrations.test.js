import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestGateway, putActive } from '../../../gateway/test/fake-provider.js';

const ACCOUNT = '0123456789abcdef0123456789abcdef';
const ID = '12345678-1234-1234-1234-123456789abc';
const TEMP_ID = 'abcdefab-1234-1234-1234-123456789abc';
const ROOT = `/accounts/${ACCOUNT}/d1/database`;
const QUERY = ROOT + '/' + ID + '/query';
const BASE = 'https://releases.example.test/';
const TOKEN = 'fixture-provider-token-never-in-answers';
const SQL = 'CREATE TABLE contacts (id TEXT PRIMARY KEY, label TEXT); -- SQL-BYTES-NEVER-IN-ANSWERS';
const input = { account_id: ACCOUNT, database_id: ID, app: 'wiser-crm', version: '1.0.0' };
const sha = (b) => createHash('sha256').update(b).digest('hex');
const envelope = (result) => ({ status: 200, data: { success: true, result } });
const error = (status) => ({ status, data: { success: false, errors: [{ message: SQL + TOKEN }] } });
const statement = (results = []) => ({ success: true, results, meta: { rows_written: 1 }, sql: SQL, token: TOKEN });
const fixture = JSON.parse(readFileSync(new URL('./fixtures/worker-release-format2/manifest.json', import.meta.url)));
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const keyBytes = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32);

const shape = () => ({
  contacts: {
    columns: [
      { cid: 0, name: 'id', type: 'TEXT', notnull: 0, dflt_value: null, pk: 1 },
      { cid: 1, name: 'label', type: 'TEXT', notnull: 1, dflt_value: "'new'", pk: 0 },
    ],
    indexes: [{ seq: 0, name: 'sqlite_autoindex_contacts_1', unique: 1, origin: 'pk', partial: 0 },
      { seq: 1, name: 'idx_contacts_label', unique: 0, origin: 'c', partial: 1 }],
    foreign: [{ id: 0, seq: 0, table: 'labels', from: 'label', to: 'name', on_update: 'NO ACTION', on_delete: 'CASCADE', match: 'NONE' }],
  },
  labels: { columns: [{ cid: 0, name: 'name', type: 'TEXT', notnull: 0, dflt_value: null, pk: 1 }], indexes: [], foreign: [] },
});
const indexColumns = () => ({ sqlite_autoindex_contacts_1: [{ seqno: 0, cid: 0, name: 'id' }], idx_contacts_label: [{ seqno: 0, cid: 1, name: 'label' }, { seqno: 1, cid: 0, name: 'id' }] });

async function setup(t, options = {}) {
  const home = mkdtempSync(join(tmpdir(), 'worker-migrations-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const dir = join(home, 'connectors/cloudflare');
  mkdirSync(dir, { recursive: true });
  for (const name of ['index.js', 'worker-release.js', 'manifest.json']) cpSync(fileURLToPath(new URL('../' + name, import.meta.url)), join(dir, name));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
  writeFileSync(join(dir, 'release.json'), JSON.stringify({ format: 1, base: BASE,
    apps: { 'wiser-crm': { keys: [{ id: sha(keyBytes).slice(0, 16), ed25519: keyBytes.toString('base64') }] } } }));
  const manifest = structuredClone(fixture);
  const texts = options.texts ?? { '0001_baseline.sql': SQL, '0002_next.sql': 'ALTER TABLE contacts ADD COLUMN other TEXT;' };
  const files = new Map();
  manifest.migrations = { table: options.table ?? 'd1_migrations', files: Object.entries(texts).map(([name, text]) => {
    const bytes = Buffer.from(text), hash = sha(bytes); files.set(hash, bytes);
    return { name, sha256: hash, size: bytes.length };
  }) };
  if (options.changeManifest) options.changeManifest(manifest);
  const raw = Buffer.from(JSON.stringify(manifest));
  const signature = sign(null, raw, options.wrongKey ? generateKeyPairSync('ed25519').privateKey : privateKey);
  const fetches = [], calls = [], events = [], writes = [];
  const env = await createTestGateway({ home, connectorDirs: [join(home, 'connectors')], fetchImpl: async (url) => {
    fetches.push(url); events.push('fetch');
    const path = new URL(url).pathname.split('/').at(-1);
    if (path === 'manifest.json') return new Response(raw);
    if (path === 'manifest.sig') return new Response(signature);
    assert.ok(files.has(path), 'only signed migration hashes may be fetched');
    return new Response(options.badHash ? Buffer.from('X'.repeat(files.get(path).length)) : files.get(path));
  } });
  if (!options.disconnected) await putActive(env.store, env.fake, { service: 'cloudflare', module: 'workers' });
  const reference = shape(), target = options.empty ? {} : shape();
  const refColumns = indexColumns(), targetColumns = indexColumns();
  if (options.mutate) options.mutate(target, targetColumns);
  let history = options.history === undefined ? null : [...options.history];
  let temporary = null, temporaryName = null;
  function query(req, isTemp) {
    const sql = req.body.sql;
    if (!/^SELECT\b/.test(sql) || sql.includes('INSERT INTO')) {
      if (!isTemp) {
        writes.push(req);
        if (options.failMigration && sql.includes(options.failMigration)) return envelope([statement(), { success: false, error: SQL + TOKEN }, statement()]);
        if (sql.startsWith('CREATE TABLE IF NOT EXISTS')) history ??= [];
        const matched = /INSERT INTO \w+ \(name\)\s+values \('([^']+)'\)/.exec(sql);
        if (matched) history.push(matched[1]);
      }
      return envelope([statement()]);
    }
    if (sql.includes('sqlite_master')) {
      const names = Object.keys(isTemp ? reference : target);
      if (!isTemp && history !== null) names.push(options.table ?? 'd1_migrations');
      return envelope([statement(names.sort().map((name) => ({ name })))]);
    }
    if (/SELECT name FROM \w+ ORDER BY id/.test(sql)) return envelope([statement((history ?? []).map((name) => ({ name })))]);
    const match = /^SELECT \* FROM pragma_(table_info|index_list|index_info|foreign_key_list)\('((?:[^']|'')*)'\)$/.exec(sql);
    assert.ok(match, 'shape reads must be single SELECTs of table-valued pragmas');
    const name = match[2].replaceAll("''", "'");
    const data = isTemp ? reference : target;
    const indexes = isTemp ? refColumns : targetColumns;
    const rows = match[1] === 'index_info' ? indexes[name] : data[name]?.[{ table_info: 'columns', index_list: 'indexes', foreign_key_list: 'foreign' }[match[1]]];
    return envelope([statement(rows ?? [])]);
  }
  env.fake.auth.proxy = async (req) => {
    calls.push(req); events.push('proxy');
    const normal = () => {
      if (req.endpoint === ROOT && req.method === 'GET') {
        temporaryName = req.parameters.find(({ name }) => name === 'name').value;
        return envelope(options.collision && !temporary ? [{ name: temporaryName, uuid: TEMP_ID }] : temporary ? [temporary] : []);
      }
      if (req.endpoint === ROOT && req.method === 'POST') { temporary = { name: req.body.name, uuid: TEMP_ID }; return envelope(temporary); }
      if (req.endpoint === ROOT + '/' + TEMP_ID && req.method === 'GET') return temporary ? envelope(temporary) : error(404);
      if (req.endpoint === ROOT + '/' + TEMP_ID && req.method === 'DELETE') { if (!options.keepTemporary) temporary = null; return envelope(null); }
      if (req.endpoint === QUERY || req.endpoint === ROOT + '/' + TEMP_ID + '/query') return query(req, req.endpoint !== QUERY);
      assert.fail(`unexpected request ${req.method} ${req.endpoint}`);
    };
    return options.responder ? options.responder(req, normal) : normal();
  };
  const execute = async (action, value = input) => {
    const args = { action: 'cloudflare.workers.' + action, input: value };
    const first = await env.gw.execute(args);
    return first.status === 'needs_confirmation' ? env.gw.execute({ ...args, confirm: true }) : first;
  };
  return { ...env, execute, calls, events, fetches, writes, manifest, reference, target, temporary: () => temporary,
    history: () => history, temporaryName: () => temporaryName };
}
const noSql = (answer) => {
  const text = JSON.stringify(answer);
  for (const hidden of [SQL, TOKEN, 'SQL-BYTES-NEVER-IN-ANSWERS', 'ALTER TABLE', 'CREATE TABLE', 'INSERT INTO', 'SELECT *']) assert.ok(!text.includes(hidden), 'answer must not echo SQL or provider text');
};
const deleted = (env, answer) => {
  assert.equal(env.calls.filter(({ method }) => method === 'DELETE').length, 1, 'temporary database DELETE required');
  assert.equal(env.temporary(), null);
  assert.equal(answer.temporary_database.deleted, true);
  assert.equal(answer.temporary_database.read_back, 'absent');
  assert.match(answer.temporary_database.name, /^wiser-adopt-[0-9a-f-]+$/);
  assert.equal(env.calls[0].method, 'GET');
  assert.equal(env.calls[1].method, 'POST');
  noSql(answer);
};

for (const action of ['d1_migrate', 'd1_adopt']) {
  test(`${action}: needs_connect before a grant`, async (t) => {
    const env = await setup(t, { disconnected: true });
    assert.equal((await env.execute(action)).status, 'needs_connect');
    assert.deepEqual(env.calls, []); assert.deepEqual(env.fetches, []);
  });
  test(`${action}: closed schema, required fields and patterns enforced before transport`, async (t) => {
    const env = await setup(t);
    const missing = { ...input }; delete missing.version;
    for (const bad of [null, [], 'x', missing, { ...input, extra: SQL }, { ...input, account_id: 4 }, { ...input, database_id: '..' }, { ...input, app: 'https://evil.test' }, { ...input, version: '../x' }]) {
      assert.equal((await env.execute(action, bad)).status, 'invalid_arguments');
      assert.deepEqual(env.calls, []); assert.deepEqual(env.fetches, []);
    }
  });
  test(`${action}: always confirmation before any fetch or Cloudflare call`, async (t) => {
    const env = await setup(t);
    const answer = await env.gw.execute({ action: 'cloudflare.workers.' + action, input });
    assert.equal(answer.status, 'needs_confirmation'); noSql(answer);
    assert.deepEqual(env.calls, []); assert.deepEqual(env.fetches, []);
  });
  for (const [label, options] of [['signature', { wrongKey: true }], ['hash', { badHash: true }], ['size', { changeManifest: (m) => m.migrations.files[0].size++ }],
    ['format', { changeManifest: (m) => m.format = 1 }], ['table', { table: 'd1; DROP TABLE contacts' }], ['name', { texts: { "0001_bad'name.sql": SQL } }]]) {
    test(`${action}: ${label} mismatch refused before any Cloudflare call`, async (t) => {
      const env = await setup(t, options);
      // Size mismatch is a short response, not an oversized fetch.
      const answer = await env.execute(action);
      assert.equal(answer.status, 'invalid_arguments'); noSql(answer); assert.deepEqual(env.calls, []);
    });
  }
  test(`${action}: provider failure contains no SQL or token`, async (t) => {
    const env = await setup(t, { responder: () => error(403) });
    const answer = await env.execute(action);
    assert.equal(answer.status, 'vendor_error'); noSql(answer);
  });
}

test('d1_migrate: Wrangler order, recorded skip and ignored extra history', async (t) => {
  const texts = { '10_last.sql': 'SELECT 10;', '2_z.sql': 'SELECT 2;', '0001_baseline.sql': SQL, '2_a.sql': 'SELECT 1;', '02_c.sql': 'SELECT 3;' };
  const env = await setup(t, { texts, table: 'release_history', history: ['0001_baseline.sql', '0099_external.sql'] });
  const answer = await env.execute('d1_migrate');
  assert.deepEqual(answer.applied, ['02_c.sql', '2_a.sql', '2_z.sql', '10_last.sql']);
  assert.deepEqual(answer.skipped, ['0001_baseline.sql']); assert.deepEqual(answer.ignored, ['0099_external.sql']);
  assert.deepEqual(env.history(), ['0001_baseline.sql', '0099_external.sql', ...answer.applied]);
  assert.equal(env.writes.length, 5, 'must not send recorded migration');
  assert.ok(env.calls[0].body.sql.includes('CREATE TABLE IF NOT EXISTS release_history('));
  assert.ok(env.calls[0].body.sql.includes('id INTEGER PRIMARY KEY AUTOINCREMENT'));
  assert.ok(env.calls[0].body.sql.includes('name TEXT UNIQUE'));
  assert.ok(env.calls[0].body.sql.includes('applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL'));
  for (const req of env.writes.slice(1)) assert.match(req.body.sql, /\nINSERT INTO release_history \(name\)\nvalues \('[A-Za-z0-9_.]+\.sql'\);$/);
  const firstProxy = env.events.indexOf('proxy');
  assert.equal(firstProxy, 2 + Object.keys(texts).length, 'all migrations verified before first Cloudflare call');
  assert.equal(env.fetches.length, 2 + Object.keys(texts).length); noSql(answer);
});
test('d1_migrate: repeat skips every recorded migration', async (t) => {
  const env = await setup(t, { history: ['0001_baseline.sql', '0002_next.sql'] });
  const answer = await env.execute('d1_migrate');
  assert.deepEqual(answer.applied, []); assert.deepEqual(answer.skipped, ['0001_baseline.sql', '0002_next.sql']);
  assert.equal(env.writes.length, 1); noSql(answer);
});
test('d1_migrate: success false stops with file and zero-based statement index', async (t) => {
  const env = await setup(t, { failMigration: 'SQL-BYTES-NEVER-IN-ANSWERS' });
  const answer = await env.execute('d1_migrate');
  assert.equal(answer.status, 'vendor_error'); assert.equal(answer.file, '0001_baseline.sql'); assert.equal(answer.statement_index, 1);
  assert.deepEqual(answer.applied, []); assert.equal(env.writes.length, 2, 'no later migration after failing statement'); noSql(answer);
});
test('d1_migrate: completed files retained in failure answer; later file never sent', async (t) => {
  const env = await setup(t, { texts: { '0001_baseline.sql': SQL, '0002_fail.sql': 'SECOND-FAIL', '0003_never.sql': 'THIRD-NEVER' }, failMigration: 'SECOND-FAIL' });
  const answer = await env.execute('d1_migrate');
  assert.deepEqual(answer.applied, ['0001_baseline.sql']); assert.equal(answer.file, '0002_fail.sql');
  assert.ok(!env.calls.some(({ body }) => body?.sql?.includes('THIRD-NEVER'))); noSql(answer);
});
test('d1_migrate: no SQL echoed from a corrupt extra history name', async (t) => {
  const env = await setup(t, { history: [SQL] });
  const answer = await env.execute('d1_migrate');
  assert.deepEqual(answer.ignored, [{ withheld: true, sha256: sha(Buffer.from(SQL)) }]); noSql(answer);
});
for (const response of [null, [], [{}], [{ success: true }], [{ success: true, results: null }]]) {
  test(`d1_migrate: malformed history refused (${JSON.stringify(response)})`, async (t) => {
    const env = await setup(t, { responder: (req, normal) => req.body?.sql?.startsWith('SELECT name') ? envelope(response) : normal() });
    const answer = await env.execute('d1_migrate'); assert.equal(answer.status, 'vendor_error'); assert.equal(env.writes.length, 1); noSql(answer);
  });
}

test('d1_adopt: matching baseline recorded without running it; temporary deleted', async (t) => {
  const env = await setup(t);
  const answer = await env.execute('d1_adopt');
  assert.equal(answer.result, 'adopted'); assert.deepEqual(env.history(), ['0001_baseline.sql']);
  assert.equal(env.writes.length, 1); assert.ok(!env.writes[0].body.sql.includes(SQL));
  assert.match(env.writes[0].body.sql, /CREATE TABLE IF NOT EXISTS d1_migrations[\s\S]+INSERT INTO d1_migrations/);
  assert.ok(env.calls.some(({ body, endpoint }) => endpoint.includes(TEMP_ID) && body?.sql === SQL)); deleted(env, answer);
});
test('d1_adopt: empty database with unrelated table unchanged; temporary deleted', async (t) => {
  const env = await setup(t, { empty: true, mutate: (target) => target.unrelated = {} });
  const answer = await env.execute('d1_adopt'); assert.equal(answer.result, 'empty'); assert.deepEqual(env.writes, []); deleted(env, answer);
});
test('d1_adopt: existing valid history still checks schema and changes nothing', async (t) => {
  const env = await setup(t, { history: ['0001_baseline.sql', '0002_next.sql'] });
  const answer = await env.execute('d1_adopt'); assert.equal(answer.result, 'already_adopted'); assert.deepEqual(env.writes, []);
  assert.ok(env.calls.some(({ endpoint, body }) => endpoint === QUERY && body?.sql.includes('pragma_table_info'))); deleted(env, answer);
});
for (const [label, mutate, diagnostic] of [
  ['missing table', (s) => delete s.labels, 'missing table labels'],
  ['missing column', (s) => s.contacts.columns.pop(), 'missing column contacts.label'],
  ...['type', 'notnull', 'dflt_value', 'pk'].map((p) => [p, (s) => s.contacts.columns[1][p] = 'different', `column contacts.label ${p} differs`]),
  ['missing autoindex', (s) => s.contacts.indexes.shift(), 'missing index contacts.sqlite_autoindex_contacts_1'],
  ...['unique', 'partial'].map((p) => [p, (s) => s.contacts.indexes[1][p] = 9, `index contacts.idx_contacts_label ${p} differs`]),
  ['index columns', (_s, c) => c.idx_contacts_label[0].name = 'id', 'index columns differ: contacts.idx_contacts_label'],
  ['foreign key', (s) => s.contacts.foreign[0].on_delete = 'SET NULL', 'foreign keys differ: contacts'],
]) {
  test(`d1_adopt: ${label} refused without member writes; temporary deleted`, async (t) => {
    const env = await setup(t, { mutate }); const answer = await env.execute('d1_adopt');
    assert.equal(answer.status, 'invalid_arguments'); assert.ok(answer.mismatches.includes(diagnostic)); assert.deepEqual(env.writes, []); deleted(env, answer);
  });
}
test('d1_adopt: extras and changed table column order allowed', async (t) => {
  const env = await setup(t, { mutate: (s) => {
    s.contacts.columns.reverse(); s.contacts.columns.forEach((c, i) => c.cid = i);
    s.contacts.columns.push({ cid: 2, name: 'custom', type: 'TEXT' });
    s.contacts.indexes.push({ name: 'custom_idx' }); s.custom_table = {};
  } });
  const answer = await env.execute('d1_adopt'); assert.equal(answer.result, 'adopted'); deleted(env, answer);
});
for (const history of [[], ['unknown.sql'], ['0002_next.sql'], ['0002_next.sql', '0001_baseline.sql'], ['0001_baseline.sql', '0001_baseline.sql'], ['0001_baseline.sql', '0002_next.sql', '0003_absent.sql']]) {
  test(`d1_adopt: refuses invalid history ${JSON.stringify(history)} and deletes temporary`, async (t) => {
    const env = await setup(t, { history }); const answer = await env.execute('d1_adopt');
    assert.equal(answer.status, 'invalid_arguments'); assert.match(answer.reason, /history/); assert.deepEqual(env.writes, []); deleted(env, answer);
  });
}
test('d1_adopt: existing history never excuses an incompatible schema', async (t) => {
  const env = await setup(t, { history: ['0001_baseline.sql'], mutate: (s) => s.contacts.columns[0].type = 'INTEGER' });
  const answer = await env.execute('d1_adopt'); assert.equal(answer.status, 'invalid_arguments'); assert.deepEqual(env.writes, []); deleted(env, answer);
});
test('d1_adopt: thrown provider error after create still deletes temporary', async (t) => {
  const env = await setup(t, { responder: (req, normal) => {
    if (req.endpoint === ROOT + '/' + TEMP_ID + '/query') throw new Error(SQL + TOKEN);
    return normal();
  } });
  const answer = await env.execute('d1_adopt'); assert.equal(answer.status, 'vendor_error'); assert.deepEqual(env.writes, []); deleted(env, answer);
});
test('d1_adopt: rejected pragma SELECT stops without member writes and deletes temporary', async (t) => {
  const env = await setup(t, { responder: (req, normal) => req.body?.sql?.includes('pragma_table_info') ? error(400) : normal() });
  const answer = await env.execute('d1_adopt'); assert.equal(answer.status, 'vendor_error'); assert.deepEqual(env.writes, []); deleted(env, answer);
});
test('d1_adopt: unconfirmed delete reports failure by generated database name', async (t) => {
  const env = await setup(t, { keepTemporary: true, empty: true });
  const answer = await env.execute('d1_adopt'); assert.equal(answer.status, 'vendor_error');
  assert.equal(answer.temporary_database.name, env.temporaryName()); assert.equal(answer.temporary_database.deleted, false);
  assert.equal(env.calls.filter(({ method }) => method === 'DELETE').length, 1); noSql(answer);
});
test('d1_adopt: lost create response finds generated name and deletes it', async (t) => {
  const env = await setup(t, { responder: (req, normal) => {
    const value = normal(); if (req.endpoint === ROOT && req.method === 'POST') throw new Error(TOKEN); return value;
  } });
  const answer = await env.execute('d1_adopt'); assert.equal(answer.status, 'vendor_error'); assert.deepEqual(env.writes, []); deleted(env, answer);
});
test('d1_adopt: occupied generated name is refused before create or delete', async (t) => {
  const env = await setup(t, { collision: true }); const answer = await env.execute('d1_adopt');
  assert.equal(answer.status, 'invalid_arguments'); assert.equal(env.calls.length, 1); noSql(answer);
});
for (const options of [{ texts: { '0002_next.sql': SQL } }, { table: 'other_history' }]) {
  test('d1_adopt: unsupported baseline/table refused before Cloudflare', async (t) => {
    const env = await setup(t, options); const answer = await env.execute('d1_adopt');
    assert.equal(answer.status, 'invalid_arguments'); assert.deepEqual(env.calls, []); noSql(answer);
  });
}

test('d1_adopt: swapped index seqno refused without member writes; temporary deleted', async (t) => {
  const env = await setup(t, { mutate: (_s, columns) => {
    // Keep the returned array and column names identical. Only the index order changes.
    columns.idx_contacts_label[0].seqno = 1;
    columns.idx_contacts_label[1].seqno = 0;
  } });
  const answer = await env.execute('d1_adopt');
  assert.equal(answer.status, 'invalid_arguments');
  assert.ok(answer.mismatches.includes('index columns differ: contacts.idx_contacts_label'));
  assert.deepEqual(env.writes, []); deleted(env, answer);
});
