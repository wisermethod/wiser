import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestGateway, putActive } from '../../../gateway/test/fake-provider.js';

const ACCOUNT = '0123456789abcdef0123456789abcdef';
const DB = '12345678-1234-1234-1234-123456789abc';
const OTHER_DB = 'abcdefab-1234-1234-1234-123456789abc';
const VERSION = '23456789-2345-2345-2345-23456789abcd';
const LATEST = '34567890-3456-3456-3456-34567890abcd';
const BOOKMARK = '00000001-00000002-00004e2f-0a83ea2fceebc654de0640c422be4653';
const NEW_BOOKMARK = '00000002-00000003-00004e2f-0a83ea2fceebc654de0640c422be4653';
const OTHER_BOOKMARK = '00000009-00000008-00004e2f-0a83ea2fceebc654de0640c422be4653';
// Invented credential-shaped canaries, never actual credentials.
const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJmaXh0dXJlIjp0cnVlfQ.fixture-signature';
const API_TOKEN = 'fixture-api-token-never-returned';
const CLIENT_SECRET = 'fixture-client-secret-never-returned';
const DAY = 86_400_000;
const d1 = { account_id: ACCOUNT, database_id: DB };
const worker = { account_id: ACCOUNT, script_name: 'proof-worker' };
const d1Path = (id = DB) => `/accounts/${ACCOUNT}/d1/database/${id}/time_travel`;
const script = `/accounts/${ACCOUNT}/workers/scripts/proof-worker`;
const restore = (age = 1, window_days = 7) => ({ ...d1, bookmark: BOOKMARK,
  bookmark_time: new Date(Date.now() - age * DAY).toISOString(), window_days });
const inputs = () => ({ d1_bookmark: d1, d1_restore: restore(), rollback: { ...worker, version_id: VERSION } });
const envelope = (result) => ({ status: 200, data: { success: true, result,
  messages: [{ message: TOKEN + OTHER_BOOKMARK }], token: API_TOKEN } });
const failure = (status) => ({ status, data: { success: false,
  errors: [{ message: TOKEN + CLIENT_SECRET + OTHER_BOOKMARK }] } });
const safe = (answer, foreign = OTHER_BOOKMARK) => {
  const text = JSON.stringify(answer);
  for (const secret of [TOKEN, API_TOKEN, CLIENT_SECRET, foreign].filter(Boolean)) {
    assert.ok(!text.includes(secret), 'answer must omit credentials and other-database bookmarks');
  }
};
const trace = (calls) => calls.map(({ method, endpoint }) => [method, endpoint]);

async function setup(t, options = {}) {
  const home = mkdtempSync(join(tmpdir(), 'worker-rollback-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const dir = join(home, 'connectors/cloudflare');
  mkdirSync(dir, { recursive: true });
  for (const name of ['index.js', 'worker-release.js', 'manifest.json']) {
    cpSync(fileURLToPath(new URL('../' + name, import.meta.url)), join(dir, name));
  }
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
  const env = await createTestGateway({ home, connectorDirs: [join(home, 'connectors')],
    fetchImpl: () => assert.fail('restore and rollback never fetch releases') });
  if (!options.disconnected) await putActive(env.store, env.fake, { service: 'cloudflare', module: 'workers' });
  const calls = [];
  let live = options.live ?? [{ version_id: LATEST, percentage: 100 }];
  env.fake.auth.proxy = async (req) => {
    calls.push(req);
    if (options.responder) return options.responder(req, calls.length);
    for (const [id, bookmark] of [[DB, BOOKMARK], [OTHER_DB, OTHER_BOOKMARK]]) {
      if (req.endpoint === d1Path(id) + '/bookmark') return envelope({ bookmark,
        other_database: { bookmark: id === DB ? OTHER_BOOKMARK : BOOKMARK }, token: TOKEN });
      if (req.endpoint === d1Path(id) + '/restore') return envelope({ bookmark: NEW_BOOKMARK,
        previous_bookmark: bookmark, message: TOKEN + (id === DB ? OTHER_BOOKMARK : BOOKMARK) });
    }
    if (req.endpoint === script + '/deployments' && req.method === 'POST') {
      if (!options.keepLive) live = req.body.versions;
      return envelope({ versions: live, token: TOKEN, previous_bookmark: OTHER_BOOKMARK });
    }
    if (req.endpoint === script + '/deployments') return envelope({ deployments: [
      { versions: live, secret: CLIENT_SECRET }, { versions: [{ version_id: LATEST, percentage: 100 }] },
    ] });
    if (req.endpoint === script + '/versions') return envelope({ items: [
      { id: LATEST, metadata: { created_on: new Date().toISOString() } },
    ] });
    if ([VERSION, LATEST].some((id) => req.endpoint === script + '/versions/' + id)) {
      return envelope({ resources: { bindings: [{ name: 'DB', type: 'd1', database_id: DB,
        bookmark: OTHER_BOOKMARK }, { name: 'KEY', type: 'secret_text', text: TOKEN }] } });
    }
    assert.fail(`unexpected request ${req.method} ${req.endpoint}`);
  };
  const execute = async (action, input = inputs()[action]) => {
    const args = { action: 'cloudflare.workers.' + action, input };
    const first = await env.gw.execute(args);
    safe(first, input?.database_id === OTHER_DB ? BOOKMARK : OTHER_BOOKMARK);
    return first.status === 'needs_confirmation' ? env.gw.execute({ ...args, confirm: true }) : first;
  };
  return { ...env, calls, execute };
}

for (const action of ['d1_bookmark', 'd1_restore', 'rollback']) {
  test(`${action}: needs_connect before a grant`, async (t) => {
    const env = await setup(t, { disconnected: true });
    assert.equal((await env.execute(action)).status, 'needs_connect');
    assert.deepEqual(env.calls, []);
  });
  test(`${action}: gateway schema rejects extra, mistyped, missing and non-object inputs before transport`, async (t) => {
    const env = await setup(t), input = inputs()[action];
    const missing = { ...input }; delete missing.account_id;
    for (const bad of [{ ...input, extra: TOKEN }, { ...input, account_id: 7 }, missing, null, [], 'bad']) {
      const result = await env.execute(action, bad);
      assert.equal(result.status, 'invalid_arguments'); safe(result);
      assert.deepEqual(env.calls, []);
    }
  });
  for (const code of [403, 404, 429, 500]) test(`${action}: HTTP ${code} omits diagnostics and foreign bookmarks`, async (t) => {
    const env = await setup(t, { responder: () => failure(code) });
    const result = await env.execute(action);
    assert.equal(result.status, 'vendor_error'); assert.equal(result.http_status, code);
    safe(result); assert.equal(env.calls.length, 1);
  });
  test(`${action}: thrown provider error omits its message`, async (t) => {
    const env = await setup(t, { responder: () => { throw new Error(TOKEN + OTHER_BOOKMARK); } });
    const result = await env.execute(action);
    assert.equal(result.status, 'vendor_error'); safe(result); assert.equal(env.calls.length, 1);
  });
}

test('d1_bookmark: GET current bookmark without timestamp, only bookmark and local request-start time returned', async (t) => {
  const env = await setup(t);
  const start = Date.now(), result = await env.execute('d1_bookmark'), end = Date.now();
  assert.deepEqual(Object.keys(result).sort(), ['bookmark', 'bookmark_time']);
  assert.equal(result.bookmark, BOOKMARK);
  assert.ok(Date.parse(result.bookmark_time) >= start && Date.parse(result.bookmark_time) <= end);
  assert.deepEqual(trace(env.calls), [['GET', d1Path() + '/bookmark']]);
  assert.equal(env.calls[0].body, undefined); assert.equal(env.calls[0].parameters, undefined);
  safe(result);
});
test('d1_bookmark: sequential database reads never reuse another database bookmark', async (t) => {
  const env = await setup(t);
  const first = await env.execute('d1_bookmark'); safe(first);
  const other = await env.execute('d1_bookmark', { ...d1, database_id: OTHER_DB });
  assert.equal(other.bookmark, OTHER_BOOKMARK); safe(other, BOOKMARK);
  const again = await env.execute('d1_bookmark'); assert.equal(again.bookmark, BOOKMARK); safe(again);
  assert.deepEqual(trace(env.calls), [['GET', d1Path() + '/bookmark'], ['GET', d1Path(OTHER_DB) + '/bookmark'], ['GET', d1Path() + '/bookmark']]);
});
for (const value of [undefined, null, TOKEN, 'bad-bookmark', { bookmark: BOOKMARK }]) {
  test('d1_bookmark: malformed bookmark response is a value-free vendor error', async (t) => {
    const env = await setup(t, { responder: () => envelope({ bookmark: value, diagnostic: TOKEN }) });
    const result = await env.execute('d1_bookmark'); assert.equal(result.status, 'vendor_error'); safe(result);
  });
}

test('d1_restore: confirmation names bookmark time and says every later change is lost', async (t) => {
  const env = await setup(t), input = restore();
  const stop = await env.gw.execute({ action: 'cloudflare.workers.d1_restore', input });
  assert.equal(stop.status, 'needs_confirmation'); assert.equal(stop.confirmation, 'always');
  assert.ok(stop.summary.includes(input.bookmark_time));
  assert.match(stop.summary, /Every change after that time is lost/);
  safe(stop); assert.deepEqual(env.calls, []);
});
test('d1_restore: POST bookmark as query, return new and previous bookmarks only', async (t) => {
  const env = await setup(t), result = await env.execute('d1_restore');
  assert.deepEqual(trace(env.calls), [['POST', d1Path() + '/restore']]);
  assert.deepEqual(env.calls[0].parameters, [{ name: 'bookmark', value: BOOKMARK, type: 'query' }]);
  assert.equal(env.calls[0].body, undefined);
  assert.deepEqual(result, { bookmark: NEW_BOOKMARK, previous_bookmark: BOOKMARK }); safe(result);
});
test('d1_restore: another database read cannot contaminate restore answer', async (t) => {
  const env = await setup(t); await env.execute('d1_bookmark', { ...d1, database_id: OTHER_DB });
  safe(await env.execute('d1_restore'));
});
for (const [age, window] of [[8, 7], [7.0001, 7], [31, 30], [30.0001, 30], [31, 7]]) {
  test(`d1_restore: ${age}-day age past ${window}-day window refused before any call`, async (t) => {
    const env = await setup(t), result = await env.execute('d1_restore', restore(age, window));
    assert.equal(result.status, 'invalid_arguments'); assert.equal(result.field, 'bookmark_time');
    assert.ok(result.age_days >= age); assert.match(result.reason, /bookmark age [0-9.]+ days exceeds/);
    assert.ok(result.reason.includes(`${window}-day`));
    assert.match(result.reason, /30-day/); assert.deepEqual(env.calls, []); safe(result);
  });
}
for (const window of [7, 30]) test(`d1_restore: exact ${window}-day boundary accepted; one millisecond older refused`, async (t) => {
  const env = await setup(t), now = Date.now();
  t.mock.method(Date, 'now', () => now);
  assert.deepEqual(await env.execute('d1_restore', restore(window, window)), { bookmark: NEW_BOOKMARK, previous_bookmark: BOOKMARK });
  env.calls.length = 0;
  const input = { ...restore(window, window), bookmark_time: new Date(now - window * DAY - 1).toISOString() };
  const result = await env.execute('d1_restore', input);
  assert.equal(result.status, 'invalid_arguments'); assert.deepEqual(env.calls, []); safe(result);
});
test('d1_restore: 20-day bookmark accepted on the 30-day plan', async (t) => {
  const env = await setup(t);
  assert.deepEqual(await env.execute('d1_restore', restore(20, 30)), { bookmark: NEW_BOOKMARK, previous_bookmark: BOOKMARK });
});
for (const time of ['not-a-time', '2026-02-30T00:00:00Z', '2026-01-01T24:00:00Z', '2026-01-01', '2026-01-01T00:00:00+00:00', '2026-01-01T00:00:00.1234Z', () => new Date(Date.now() + DAY).toISOString()]) {
  test('d1_restore: invalid or future bookmark_time refused before transport', async (t) => {
    const env = await setup(t), input = { ...restore(), bookmark_time: typeof time === 'function' ? time() : time };
    const result = await env.execute('d1_restore', input);
    assert.equal(result.status, 'invalid_arguments'); assert.equal(result.field, 'bookmark_time');
    assert.deepEqual(env.calls, []); safe(result);
  });
}
for (const value of [0, 8, 31, '7', 7.5, null]) test('d1_restore: window_days is exactly numeric 7 or 30', async (t) => {
  const env = await setup(t), result = await env.execute('d1_restore', { ...restore(), window_days: value });
  assert.equal(result.status, 'invalid_arguments'); assert.equal(result.field, 'window_days');
  assert.deepEqual(env.calls, []); safe(result);
});
for (const field of ['bookmark', 'bookmark_time', 'window_days']) test(`d1_restore: ${field} required by gateway schema`, async (t) => {
  const env = await setup(t), input = restore(); delete input[field];
  const result = await env.execute('d1_restore', input);
  assert.equal(result.status, 'invalid_arguments'); assert.equal(result.field, field); assert.deepEqual(env.calls, []);
});
for (const result of [{}, { bookmark: NEW_BOOKMARK }, { previous_bookmark: BOOKMARK }, { bookmark: TOKEN, previous_bookmark: BOOKMARK }, { bookmark: NEW_BOOKMARK, previous_bookmark: TOKEN }]) {
  test('d1_restore: incomplete or contaminated restore response reports submitted, never invents undo bookmark', async (t) => {
    const env = await setup(t, { responder: () => envelope({ ...result, message: TOKEN + OTHER_BOOKMARK }) });
    const answer = await env.execute('d1_restore');
    assert.equal(answer.status, 'vendor_error'); assert.match(answer.reason, /restore submitted/); safe(answer);
  });
}

test('rollback: required version_id absent is refused by gateway schema, before confirmation or transport', async (t) => {
  const env = await setup(t), result = await env.execute('rollback', worker);
  assert.equal(result.status, 'invalid_arguments'); assert.equal(result.field, 'version_id');
  assert.deepEqual(env.calls, []); safe(result);
});
test('rollback: confirmation always shows the recorded version before transport', async (t) => {
  const env = await setup(t), input = inputs().rollback;
  const stop = await env.gw.execute({ action: 'cloudflare.workers.rollback', input });
  assert.equal(stop.status, 'needs_confirmation'); assert.equal(stop.confirmation, 'always');
  assert.ok(stop.summary.includes(VERSION)); safe(stop); assert.deepEqual(env.calls, []);
});
for (const live of [[{ version_id: LATEST, percentage: 100 }], [{ version_id: LATEST, percentage: 60 }, { version_id: VERSION, percentage: 40 }], []]) {
  test('rollback: deploy recorded id regardless of live traffic and read back at 100 percent, never list versions', async (t) => {
    const env = await setup(t, { live }), result = await env.execute('rollback');
    assert.deepEqual(result, { version_id: VERSION }); safe(result);
    assert.deepEqual(trace(env.calls), [['POST', script + '/deployments'], ['GET', script + '/deployments']]);
    assert.deepEqual(env.calls[0].body, { strategy: 'percentage', versions: [{ version_id: VERSION, percentage: 100 }] });
    assert.equal(env.calls[0].parameters, undefined); assert.equal(env.calls[1].body, undefined);
    assert.ok(!env.calls.some((req) => req.endpoint.includes('/versions')));
  });
}
for (const id of ['', null, TOKEN, '../previous', 7]) test('rollback: invalid version id refused by schema before transport', async (t) => {
  const env = await setup(t), result = await env.execute('rollback', { ...worker, version_id: id });
  assert.equal(result.status, 'invalid_arguments'); assert.equal(result.field, 'version_id'); safe(result); assert.deepEqual(env.calls, []);
});
for (const live of [[{ version_id: LATEST, percentage: 100 }], [{ version_id: VERSION, percentage: 99 }], [{ version_id: VERSION, percentage: 50 }, { version_id: LATEST, percentage: 50 }], []]) {
  test('rollback: read-back must confirm supplied version alone at 100 percent', async (t) => {
    const env = await setup(t, { live, keepLive: true }), result = await env.execute('rollback');
    assert.equal(result.status, 'vendor_error'); assert.match(result.reason, /rollback submitted/);
    assert.ok(!Object.hasOwn(result, 'version_id')); safe(result); assert.equal(env.calls.length, 2);
  });
}
test('rollback: failed read-back names unverified deployment and omits provider data', async (t) => {
  const env = await setup(t, { responder: (req) => req.method === 'POST' ? envelope({}) : failure(500) });
  const result = await env.execute('rollback'); assert.equal(result.status, 'vendor_error');
  assert.match(result.reason, /rollback submitted/); safe(result); assert.equal(env.calls.length, 2);
});

test('get_worker: single version at 100 percent is the recorded pre-upgrade id', async (t) => {
  const env = await setup(t, { live: [{ version_id: VERSION, percentage: 100 }] });
  const result = await env.execute('get_worker', worker);
  assert.equal(result.version_id, VERSION); safe(result);
  assert.deepEqual(trace(env.calls), [['GET', script + '/deployments'], ['GET', script + '/versions/' + VERSION]]);
});
test('get_worker: split deployment refuses to name a singular rollback version', async (t) => {
  const env = await setup(t, { live: [{ version_id: VERSION, percentage: 60 }, { version_id: LATEST, percentage: 40 }] });
  const result = await env.execute('get_worker', worker);
  assert.equal(result.version_id, null); assert.deepEqual(result.bindings, []);
  assert.match(result.reason, /no single version at 100 percent/); safe(result);
});
test('get_worker: a sole version below 100 percent is not a rollback target', async (t) => {
  const env = await setup(t, { live: [{ version_id: VERSION, percentage: 99 }] });
  const result = await env.execute('get_worker', worker); assert.equal(result.version_id, null); safe(result);
});
for (const percentage of [TOKEN, null, -1, 101]) test('get_worker: malformed traffic percentage cannot leak vendor text', async (t) => {
  const env = await setup(t, { live: [{ version_id: VERSION, percentage }] });
  const result = await env.execute('get_worker', worker); assert.equal(result.status, 'vendor_error'); safe(result);
});
