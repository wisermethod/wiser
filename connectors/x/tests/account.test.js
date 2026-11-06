import { rmSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confirmCall, createTestGateway, putActive } from '../../../gateway/test/fake-provider.js';
import { modules } from '../index.js';

const API = 'https://api.x.com/2';
const USER_ID = '1000000000000000001';
const POST_ID = '2000000000000000001';
const POST_INPUT = { post_id: POST_ID };
const ACTIONS = [
  ['me', {}], ['get_post', POST_INPUT], ['recent_posts', {}], ['delete_post', POST_INPUT],
];

// All vendor bodies are invented, with unverified shapes. These are not captures.
const ME = { data: { id: USER_ID, username: 'example', name: 'Example' } };
const POST = { data: { id: POST_ID, text: 'Example.' } };
const RECENT = { data: [{ id: POST_ID, text: 'Example.' }], meta: { result_count: 1 } };
const DELETED = { data: { deleted: true } };

async function fixture(t, respond = () => ({ status: 200, data: ME }), connected = true) {
  t.mock.method(globalThis, 'fetch', () => assert.fail('X tests must stay offline'));
  const f = await createTestGateway({ session: false });
  t.after(() => rmSync(f.home, { recursive: true, force: true }));
  if (connected) await putActive(f.store, f.fake, { service: 'x', module: 'account', privilege: 'write' });
  f.fake.catalog.execute = async () => assert.fail('X must use proxy, never catalog execution');
  const calls = [];
  f.fake.auth.proxy = async (request) => {
    calls.push(request);
    return structuredClone(await respond(request, calls.length));
  };
  return { ...f, calls };
}

function execute(gw, action, input) {
  return gw.execute({ action: `x.account.${action}`, input });
}

function run(gw, action, input) {
  return confirmCall(gw, { action: `x.account.${action}`, input });
}

function requestIs(request, method, path, query = {}) {
  const url = new URL(request.endpoint);
  assert.equal(url.origin, 'https://api.x.com');
  assert.equal(url.pathname, `/2${path}`);
  assert.deepEqual(Object.fromEntries(url.searchParams), query);
  assert.equal(request.method, method);
  assert.equal(request.body, undefined);
  assert.equal(request.binary_body, undefined);
  assert.equal(request.parameters, undefined);
  assert.equal(request.providerAccountId, 'fake-acct-x-account');
  assert.equal(request.toolkit, 'TWITTER');
}

test('each action needs_connect before the account write grant exists, with no transport', async (t) => {
  const { gw, calls, fake } = await fixture(t, () => assert.fail('unconnected action reached transport'), false);
  for (const [action, input] of ACTIONS) {
    const result = await execute(gw, action, input);
    assert.equal(result.status, 'needs_connect');
    assert.equal(result.service, 'x');
    assert.equal(result.module, 'account');
    assert.equal(result.privilege, 'write');
  }
  assert.equal(calls.length, 0);
  assert.equal(fake.accounts.size, 0);
});

test('me uses one absolute GET with user.fields=username and returns only vendor data', async (t) => {
  const { gw, calls } = await fixture(t, () => ({ status: 200, data: ME }));
  assert.deepEqual(await execute(gw, 'me', {}), ME.data);
  assert.equal(calls.length, 1);
  requestIs(calls[0], 'GET', '/users/me', { 'user.fields': 'username' });
});

test('get_post uses one absolute GET with exactly the planned fields and returns vendor data', async (t) => {
  const { gw, calls } = await fixture(t, () => ({ status: 200, data: POST }));
  assert.deepEqual(await execute(gw, 'get_post', POST_INPUT), POST.data);
  assert.equal(calls.length, 1);
  requestIs(calls[0], 'GET', `/tweets/${POST_ID}`, { 'tweet.fields': 'created_at,author_id,conversation_id' });
});

test('schema enforcement refuses undeclared, mistyped, missing and non-object input before transport', async (t) => {
  const { gw, calls } = await fixture(t, () => assert.fail('invalid input reached transport'));

  // **Keep this block when you copy the template.** The 2026-09-20 connector audit found
  // that the eleven connectors agreeing with their own manifests were the eleven that had
  // copied a validator and its tests together, and that twelve of the fourteen without it
  // asserted nothing of the kind and held every divergence. The validator now lives in the
  // gateway and no connector carries one, so what a connector still has to carry is this:
  // proof that its published schema is the one being applied to its own actions.
  for (const input of [
    { post_id: POST_ID, undeclared: 'example' },
    { post_id: 12345 },
    {},
  ]) {
    const refused = await execute(gw, 'get_post', input);
    assert.equal(refused.status, 'invalid_arguments', JSON.stringify(input));
  }
  for (const input of [null, [], 'example', 1]) {
    assert.deepEqual(
      await execute(gw, 'get_post', input),
      { status: 'invalid_arguments', field: 'input' });
  }

  for (const [action, input] of ACTIONS) {
    assert.deepEqual(await execute(gw, action, { ...input, undeclared: true }),
      { status: 'invalid_arguments', field: 'undeclared' });
    for (const invalid of [null, [], 'example', 1]) {
      assert.deepEqual(await execute(gw, action, invalid),
        { status: 'invalid_arguments', field: 'input' });
    }
  }
  for (const action of ['get_post', 'delete_post']) {
    for (const input of [{}, { post_id: 12345 }]) {
      assert.deepEqual(await execute(gw, action, input),
        { status: 'invalid_arguments', field: 'post_id' });
    }
  }
  for (const max_results of ['5', 5.5, null, true]) {
    assert.deepEqual(await execute(gw, 'recent_posts', { max_results }),
      { status: 'invalid_arguments', field: 'max_results' });
  }
  assert.deepEqual(await execute(gw, 'recent_posts', { user_id: USER_ID }),
    { status: 'invalid_arguments', field: 'user_id' });
  assert.equal(calls.length, 0);
});

test('post_id accepts 1 through 19 digits and refuses ids outside the published pattern', async (t) => {
  const { gw, calls } = await fixture(t, () => ({ status: 200, data: POST }));
  for (const action of ['get_post', 'delete_post']) {
    for (const post_id of ['1', POST_ID]) {
      assert.deepEqual(await run(gw, action, { post_id }), POST.data);
      assert.equal(new URL(calls.at(-1).endpoint).pathname, `/2/tweets/${post_id}`);
    }
    const before = calls.length;
    for (const post_id of ['', 'nope', '1/2', '1?x=2', '1'.repeat(20), '-1', '1.2']) {
      assert.deepEqual(await execute(gw, action, { post_id }),
        { status: 'invalid_arguments', field: 'post_id' });
    }
    assert.equal(calls.length, before);
  }
});

for (const max_results of [4, 11, 100]) {
  test(`recent_posts max_results=${max_results} is refused before any vendor request`, async (t) => {
    const { gw, calls } = await fixture(t, () => assert.fail('out-of-range max_results reached transport'));
    assert.deepEqual(await execute(gw, 'recent_posts', { max_results }),
      { status: 'invalid_arguments', field: 'max_results' });
    assert.equal(calls.length, 0);
  });
}

for (const max_results of [undefined, 5, 10]) {
  test(`recent_posts max_results=${max_results ?? 'omitted'} sends ${max_results ?? 5} on tweets only`, async (t) => {
    const { gw, calls } = await fixture(t, (request, count) => ({ status: 200, data: count === 1 ? ME : RECENT }));
    const input = max_results === undefined ? {} : { max_results };
    assert.deepEqual(await execute(gw, 'recent_posts', input), RECENT.data);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].endpoint, `${API}/users/me`);
    requestIs(calls[0], 'GET', '/users/me');
    requestIs(calls[1], 'GET', `/users/${USER_ID}/tweets`, {
      max_results: String(max_results ?? 5), 'tweet.fields': 'created_at',
    });
  });
}

for (const id of ['nope', '1/2']) {
  test(`recent_posts id=${id} makes exactly one request and refuses the second`, async (t) => {
    const { gw, calls } = await fixture(t, () => ({ status: 200, data: { data: { id } } }));
    assert.deepEqual(await execute(gw, 'recent_posts', {}),
      { status: 'vendor_error', endpoint: `${API}/users/me`, method: 'GET' });
    assert.equal(calls.length, 1);
    requestIs(calls[0], 'GET', '/users/me');
  });
}

test('delete_post stops before transport and makes one DELETE after a matching confirmation', async (t) => {
  const { gw, calls } = await fixture(t, () => ({ status: 200, data: DELETED }));
  const args = { action: 'x.account.delete_post', input: POST_INPUT };
  const stop = await gw.execute(args);
  assert.equal(stop.status, 'needs_confirmation');
  assert.equal(stop.risk, 'high');
  assert.equal(stop.confirmation, 'always');
  assert.match(stop.summary, new RegExp(POST_ID));
  assert.equal(calls.length, 0);
  assert.deepEqual(await gw.execute({ ...args, confirm: true }), DELETED.data);
  assert.equal(calls.length, 1);
  requestIs(calls[0], 'DELETE', `/tweets/${POST_ID}`);
  assert.equal((await gw.execute(args)).status, 'needs_confirmation');
  assert.equal(calls.length, 1, 'always requires a new confirmation');
});

test('delete_post with an unmatched confirmation makes no request', async (t) => {
  const { gw, calls } = await fixture(t, () => ({ status: 200, data: DELETED }));
  const args = { action: 'x.account.delete_post', input: POST_INPUT };
  assert.equal((await gw.execute(args)).status, 'needs_confirmation');
  const different = await gw.execute({ ...args, input: { post_id: '2' }, confirm: true });
  assert.equal(different.status, 'needs_confirmation');
  assert.equal(different.reason, 'unmatched_confirm');
  assert.equal(calls.length, 0);
  assert.deepEqual(await gw.execute({ ...args, confirm: true }), DELETED.data);
  assert.equal(calls.length, 1);
});

test('every action returns vendor data without constraining its invented fields or types', async (t) => {
  const unchecked = [null, false, 42, 'unverified', [], {}, { id: null, deleted: 'unverified', extra: [1] }];
  const { gw, calls, fake } = await fixture(t);
  for (const [action, input] of ACTIONS) {
    for (const data of unchecked) {
      const before = calls.length;
      fake.auth.proxy = async (request) => {
        calls.push(request);
        return { status: 200, data: action === 'recent_posts' && calls.length === before + 1 ? ME : { data } };
      };
      assert.deepEqual(await run(gw, action, input), data);
      assert.equal(calls.length, before + (action === 'recent_posts' ? 2 : 1));
    }
  }
});

for (const http_status of [401, 403, 429, 503]) {
  test(`vendor ${http_status} maps to the gateway vendor_error on every action while the grant is ACTIVE`, async (t) => {
    const { gw, calls } = await fixture(t, (request) => ({
      status: http_status,
      data: { message: 'invented-vendor-body-must-not-escape' },
      error: { code: 'vendor_error', endpoint: request.endpoint, method: request.method },
    }));
    for (const [action, input] of ACTIONS) {
      const before = calls.length;
      const result = await run(gw, action, input);
      assert.equal(calls.length, before + 1);
      assert.deepEqual(result, {
        status: 'vendor_error', http_status, endpoint: calls.at(-1).endpoint, method: calls.at(-1).method,
      });
    }
  });
}

test('recent_posts also preserves the gateway failure from its second request', async (t) => {
  const { gw, calls } = await fixture(t, (request, count) => count === 1
    ? { status: 200, data: ME }
    : { status: 429, error: { code: 'vendor_error', endpoint: request.endpoint, method: request.method } });
  const result = await execute(gw, 'recent_posts', {});
  assert.equal(calls.length, 2);
  assert.deepEqual(result, { status: 'vendor_error', http_status: 429, endpoint: calls[1].endpoint, method: 'GET' });
});

for (const http_status of [401, 403]) {
  test(`vendor ${http_status} followed by an EXPIRED grant maps to needs_connect`, async (t) => {
    const { gw, fake, calls } = await fixture(t);
    fake.auth.proxy = async (request) => {
      calls.push(request);
      fake.auth.setStatus('fake-acct-x-account', 'EXPIRED');
      return { status: http_status, error: { code: 'vendor_error', endpoint: request.endpoint, method: request.method } };
    };
    assert.deepEqual(await execute(gw, 'me', {}), {
      status: 'needs_connect', service: 'x', module: 'account', privilege: 'write',
      provider_status: 'EXPIRED', reason: 'refused_by_provider',
    });
    assert.equal(calls.length, 1);
  });
}

test('module returns gateway stops untouched on either request', async () => {
  for (const status of ['needs_connect', 'needs_provider_capability', 'vendor_error', 'denied']) {
    const stop = { status };
    for (const [action, input] of ACTIONS) {
      assert.equal(await modules.account[action](input, { proxy: async () => stop }), stop);
    }
    let calls = 0;
    assert.equal(await modules.account.recent_posts({}, {
      proxy: async () => ++calls === 1 ? { status: 200, data: ME } : stop,
    }), stop);
    assert.equal(calls, 2);
  }
});
