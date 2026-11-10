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
  ['me', {}], ['get_post', POST_INPUT], ['recent_posts', {}], ['delete_post', POST_INPUT], ['create_post', { text: 'Example.' }],
];

// All values are invented; the read/delete shapes follow the live captures.
const ME = { data: { id: USER_ID, username: 'example', name: 'Example' } };
const POST = { data: {
  id: POST_ID, text: 'Example.', author_id: USER_ID, conversation_id: POST_ID,
  created_at: '2026-01-01T12:00:00.000Z', edit_history_tweet_ids: [POST_ID],
} };
const RECENT = { data: [{
  id: POST_ID, text: 'Example.', created_at: '2026-01-01T12:00:00.000Z', edit_history_tweet_ids: [POST_ID],
}], meta: { result_count: 1 } };
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
  const { gw, calls } = await fixture(t, (request) => ({ status: 200, data: request.method === 'DELETE'
    ? DELETED : { data: { ...POST.data, id: new URL(request.endpoint).pathname.split('/').at(-1) } } }));
  for (const action of ['get_post', 'delete_post']) {
    for (const post_id of ['1', POST_ID]) {
      assert.deepEqual(await run(gw, action, { post_id }),
        action === 'delete_post' ? DELETED.data : { ...POST.data, id: post_id });
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

test('create_post returns vendor data without constraining its invented fields or types', async (t) => {
  const unchecked = [null, false, 42, 'unverified', [], {}, { id: null, deleted: 'unverified', extra: [1] }];
  const { gw, calls, fake } = await fixture(t);
  for (const [action, input] of [['create_post', { text: 'Example.' }]]) {
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

async function publish(gw, calls, input) {
  const args = { action: 'x.account.create_post', input };
  const before = calls.length;
  const stop = await gw.execute(args);
  assert.equal(stop.status, 'needs_confirmation', 'module cases must first pass disclosure');
  assert.equal(stop.risk, 'high');
  assert.equal(stop.confirmation, 'always');
  assert.deepEqual(stop.withheld_fields, []);
  assert.equal(calls.length, before, 'nothing is sent before matching the stop');
  return gw.execute({ ...args, confirm: true });
}

test('create_post plain text control sends exactly one POST with exactly text', async (t) => {
  const { gw, calls } = await fixture(t, () => ({ status: 201, data: POST }));
  assert.deepEqual(await publish(gw, calls, { text: 'Example.' }), POST.data);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    endpoint: `${API}/tweets`, method: 'POST', body: { text: 'Example.' },
    providerAccountId: 'fake-acct-x-account', toolkit: 'TWITTER',
    binary_body: undefined, parameters: undefined,
  });
  assert.equal((await execute(gw, 'create_post', { text: 'Example.' })).status, 'needs_confirmation');
  assert.equal(calls.length, 1);
});

for (const [name, text] of [
  ['141 U+1F600', '\u{1F600}'.repeat(141)],
  ['141 U+4E00', '\u4E00'.repeat(141)],
  ['140 U+4E00 plus ASCII', '\u4E00'.repeat(140) + 'a'],
]) {
  test(`create_post ${name} passes disclosure but the module refuses its weight`, async (t) => {
    const { gw, calls } = await fixture(t, () => assert.fail('overweight text reached transport'));
    assert.deepEqual(await publish(gw, calls, { text }), { status: 'invalid_arguments', field: 'text' });
    assert.equal(calls.length, 0);
  });
}

for (const [name, text] of [
  ['141 U+00A9, weight 141', '\u00A9'.repeat(141)],
  ['140 U+4E00, weight 280', '\u4E00'.repeat(140)],
  ['140 U+1F600, weight 280 and 280 UTF-16 units', '\u{1F600}'.repeat(140)],
  ['280 ASCII, weight 280', 'a'.repeat(280)],
]) {
  test(`create_post accepts ${name} with exactly one request`, async (t) => {
    const { gw, calls } = await fixture(t, () => ({ status: 201, data: POST }));
    assert.deepEqual(await publish(gw, calls, { text }), POST.data);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].body, { text });
  });
}

test('create_post 281 ASCII is refused by disclosure maxLength before the module runs', async (t) => {
  const { gw, calls } = await fixture(t, () => assert.fail('overlength text reached transport'));
  const invoke = t.mock.method(modules.account, 'create_post', async () => assert.fail('disclosure let overlength input run'));
  const result = await execute(gw, 'create_post', { text: 'a'.repeat(281) });
  assert.equal(result.status, 'invalid_arguments');
  assert.equal(result.field, 'text');
  assert.equal(invoke.mock.callCount(), 0);
  assert.equal(calls.length, 0);
});

test('create_post module independently enforces maxLength in code points', async () => {
  const ctx = { proxy: async () => assert.fail('overlength text reached transport') };
  assert.deepEqual(await modules.account.create_post({ text: 'a'.repeat(281) }, ctx),
    { status: 'invalid_arguments', field: 'text' });
});

for (const text of ['https://example.com', 'www.example.com', 'example.com', 'ftp://example.com', 'mailto:person@example.com']) {
  test(`create_post detected URL ${text} needs explicit allow_url after matching confirmation`, async (t) => {
    const { gw, calls } = await fixture(t, () => assert.fail('unapproved URL reached transport'));
    for (const input of [{ text }, { text, allow_url: false }]) {
      assert.deepEqual(await publish(gw, calls, input),
        { status: 'invalid_arguments', field: 'text', reason: 'url_requires_allow_url' });
    }
    assert.equal(calls.length, 0);
  });
}

for (const text of ['221 Mission Pitch: Cut the Personal Story', 'Ideas, e.g. this one.', 'U.S. news today.', 'Note:no space after the colon.']) {
  test(`create_post ordinary punctuation ${JSON.stringify(text)} is not a URL and makes one call without allow_url`, async (t) => {
    const { gw, calls } = await fixture(t, () => ({ status: 201, data: POST }));
    assert.deepEqual(await publish(gw, calls, { text }), POST.data);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].body, { text });
  });
}

test('create_post allow_url=true sends exactly text and never the control flag', async (t) => {
  const { gw, calls } = await fixture(t, () => ({ status: 201, data: POST }));
  const text = 'https://example.com';
  assert.deepEqual(await publish(gw, calls, { text, allow_url: true }), POST.data);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body, { text });
});

test('create_post reply_to sends exactly text and the nested reply id in one request', async (t) => {
  const { gw, calls } = await fixture(t, () => ({ status: 201, data: POST }));
  assert.deepEqual(await publish(gw, calls, { text: 'Example.', reply_to: POST_ID }), POST.data);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].endpoint, `${API}/tweets`);
  assert.equal(calls[0].method, 'POST');
  assert.deepEqual(calls[0].body, { text: 'Example.', reply: { in_reply_to_tweet_id: POST_ID } });
});

test('create_post confirmation must match the same text, reply target and URL permission', async (t) => {
  const { gw, calls } = await fixture(t, () => ({ status: 201, data: POST }));
  const args = { action: 'x.account.create_post', input: { text: 'Example.', reply_to: POST_ID, allow_url: true } };
  assert.equal((await gw.execute(args)).status, 'needs_confirmation');
  for (const change of [{ text: 'Another example.' }, { reply_to: '2' }, { allow_url: false }]) {
    const result = await gw.execute({ ...args, input: { ...args.input, ...change }, confirm: true });
    assert.equal(result.status, 'needs_confirmation');
    assert.equal(result.reason, 'unmatched_confirm');
    assert.equal(calls.length, 0);
  }
  assert.deepEqual(await gw.execute({ ...args, confirm: true }), POST.data);
  assert.equal(calls.length, 1);
});

test('create_post schema refuses missing, mistyped, whitespace and undeclared fields before transport', async (t) => {
  const { gw, calls } = await fixture(t, () => assert.fail('invalid post reached transport'));
  for (const [input, field] of [
    [{}, 'text'], [{ text: 1 }, 'text'], [{ text: '' }, 'text'], [{ text: ' \n\t' }, 'text'],
    [{ text: 'Example.', reply_to: 1 }, 'reply_to'], [{ text: 'Example.', reply_to: '1/2' }, 'reply_to'],
    [{ text: 'Example.', reply_to: '1'.repeat(20) }, 'reply_to'],
    [{ text: 'Example.', allow_url: 'true' }, 'allow_url'],
    [{ text: 'Example.', allow_url: null }, 'allow_url'],
    [{ text: 'Example.', extra: true }, 'extra'],
  ]) {
    assert.deepEqual(await execute(gw, 'create_post', input), { status: 'invalid_arguments', field });
  }
  assert.equal(calls.length, 0);
});

const RESPONSE_CASES = [
  ['me', {}, 'object', null],
  ['me', {}, 'object array', []],
  ['me', {}, 'id pattern', { ...ME.data, id: 'nope' }],
  ['me', {}, 'id type', { ...ME.data, id: 1 }],
  ['me', {}, 'id length', { ...ME.data, id: '1'.repeat(20) }],
  ['me', {}, 'username pattern', { ...ME.data, username: 'example-name' }],
  ['me', {}, 'username length', { ...ME.data, username: 'a'.repeat(16) }],
  ['me', {}, 'username type', { ...ME.data, username: null }],
  ['me', {}, 'name type', { ...ME.data, name: 1 }],
  ['get_post', POST_INPUT, 'object', []],
  ['get_post', POST_INPUT, 'id equality', { ...POST.data, id: '2' }],
  ['get_post', POST_INPUT, 'id type', { ...POST.data, id: 2 }],
  ['get_post', POST_INPUT, 'text type', { ...POST.data, text: null }],
  ['recent_posts', {}, 'array', {}],
  ['recent_posts', {}, 'maximum result count', Array(6).fill(RECENT.data[0])],
  ['recent_posts', {}, 'item object', [null]],
  ['recent_posts', {}, 'item array', [[]]],
  ['recent_posts', {}, 'item id pattern', [{ ...RECENT.data[0], id: 'nope' }]],
  ['recent_posts', {}, 'item id type', [{ ...RECENT.data[0], id: 1 }]],
  ['recent_posts', {}, 'item id length', [{ ...RECENT.data[0], id: '1'.repeat(20) }]],
  ['recent_posts', {}, 'item text type', [{ ...RECENT.data[0], text: false }]],
  ['delete_post', POST_INPUT, 'object', null],
  ['delete_post', POST_INPUT, 'deleted type', { deleted: 'true' }],
  ['delete_post', POST_INPUT, 'deleted presence', {}],
];

for (const [action, input, constraint, data] of RESPONSE_CASES) {
  test(`${action} rejects unexpected response ${constraint}`, async (t) => {
    const { gw, calls } = await fixture(t, (_request, count) => ({
      status: 200, data: action === 'recent_posts' && count === 1 ? ME : { data },
    }));
    const result = await run(gw, action, input);
    const request = calls.at(-1);
    assert.deepEqual(result, {
      status: 'vendor_error', reason: 'unexpected_response', endpoint: request.endpoint.split('?')[0], method: request.method,
    });
    assert.equal(calls.length, action === 'recent_posts' ? 2 : 1);
  });
}

test('recent_posts accepts exactly the requested count, including a minimal first-call id', async (t) => {
  const data = Array.from({ length: 10 }, () => ({ ...RECENT.data[0] }));
  const { gw, calls } = await fixture(t, (_request, count) => ({ status: 200,
    data: count % 2 === 1 ? { data: { id: USER_ID } } : { data },
  }));
  assert.deepEqual(await execute(gw, 'recent_posts', { max_results: 10 }), data);
  assert.equal(calls.length, 2);
  assert.deepEqual(await execute(gw, 'recent_posts', { max_results: 5 }), {
    status: 'vendor_error', reason: 'unexpected_response', endpoint: `${API}/users/${USER_ID}/tweets`, method: 'GET',
  });
  assert.equal(calls.length, 4);
});

test('recent_posts accepts an empty data array', async (t) => {
  const { gw, calls } = await fixture(t, (_request, count) => ({ status: 200, data: count === 1 ? ME : { data: [] } }));
  assert.deepEqual(await execute(gw, 'recent_posts', {}), []);
  assert.equal(calls.length, 2);
});

test('recent_posts documented no-data result_count=0 case returns an empty array', async (t) => {
  const { gw, calls } = await fixture(t, (_request, count) => ({
    status: 200, data: count === 1 ? ME : { meta: { result_count: 0 } },
  }));
  assert.deepEqual(await execute(gw, 'recent_posts', {}), []);
  assert.equal(calls.length, 2);
});

test('delete_post returns only the boolean deleted, including false', async (t) => {
  const { gw, calls } = await fixture(t, () => ({ status: 200, data: { data: { deleted: false, extra: 'Example.' } } }));
  assert.deepEqual(await run(gw, 'delete_post', POST_INPUT), { deleted: false });
  assert.equal(calls.length, 1);
});

for (const [name, body, problem] of [
  ['allowed twitter problem', { errors: [{ type: 'https://api.twitter.com/2/problems/resource-not-found', detail: 'Do not copy.' }] },
    'https://api.twitter.com/2/problems/resource-not-found'],
  ['allowed x problem', { errors: [{ type: 'https://api.x.com/2/problems/resource-not-found' }] },
    'https://api.x.com/2/problems/resource-not-found'],
  ['untrusted problem', { errors: [{ type: 'https://example.com/2/problems/resource-not-found', title: 'Do not copy.' }] }],
  ['problem with query', { errors: [{ type: 'https://api.x.com/2/problems/resource-not-found?detail=example' }] }],
  ['non-string problem', { errors: [{ type: 1 }] }],
  ['overlong problem', { errors: [{ type: `https://api.x.com/2/problems/${'a'.repeat(65)}` }] }],
  ['only first problem counts', { errors: [{ type: 'nope' }, { type: 'https://api.x.com/2/problems/resource-not-found' }] }],
  ['empty body', {}],
]) {
  test(`no_data with ${name} is sanitized on every action and both recent_posts requests`, async (t) => {
    const { gw, calls, fake } = await fixture(t);
    for (const [action, input] of ACTIONS) {
      for (const failSecond of action === 'recent_posts' ? [false, true] : [false]) {
        const before = calls.length;
        fake.auth.proxy = async (request) => {
          calls.push(request);
          return { status: 200, data: failSecond && calls.length === before + 1 ? ME : body };
        };
        const result = await run(gw, action, input);
        const request = calls.at(-1);
        assert.deepEqual(result, {
          status: 'vendor_error', reason: 'no_data', endpoint: request.endpoint.split('?')[0], method: request.method,
          ...(problem === undefined ? {} : { problem }),
        });
        assert.equal(calls.length, before + (failSecond ? 2 : 1));
      }
    }
  });
}
