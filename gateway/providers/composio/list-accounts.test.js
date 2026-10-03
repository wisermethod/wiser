import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAuthProvider } from './auth-provider.js';

const FAILED = 'could not list connected accounts';
const SIX = ['INITIALIZING', 'INITIATED', 'ACTIVE', 'FAILED', 'EXPIRED', 'INACTIVE'];
const SENTINEL = 'provider-body-sentinel';

function jsonResponse(status, body) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return { status, text: async () => text };
}

function account(id, status, toolkit = 'GITHUB') {
  const item = {
    id,
    status,
    state: { val: { access_token: SENTINEL } },
  };
  if (toolkit === null) return item;
  item.toolkit = { slug: toolkit };
  return item;
}

/**
 * @param {import('node:test').TestContext} t
 * @param {string | null} env
 * @param {(parsed: URL, calls: URL[]) => Promise<object> | object} fetchImpl
 */
function providerWith(t, env, fetchImpl) {
  const dir = mkdtempSync(join(tmpdir(), 'wiser-list-accounts-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  let envPath = null;
  if (env !== null) {
    envPath = join(dir, 'auth-provider.env');
    writeFileSync(envPath, env);
  }
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    const parsed = new URL(url);
    calls.push(parsed);
    return fetchImpl(parsed, calls);
  });
  return { provider: createAuthProvider({ envPath }), calls };
}

function configured(t, fetchImpl) {
  return providerWith(t, 'WISER_AUTH_PROVIDER_KEY=synthetic-test-key\n', fetchImpl);
}

function assertActiveQuery(parsed, { userId = 'wiser-user', cursor = null } = {}) {
  assert.equal(parsed.pathname, '/api/v3.1/connected_accounts');
  assert.equal(parsed.searchParams.get('user_ids'), userId);
  assert.deepEqual(parsed.searchParams.getAll('statuses'), ['ACTIVE']);
  assert.equal(parsed.searchParams.get('limit'), '100');
  assert.equal(parsed.searchParams.get('cursor'), cursor);
}

async function rejectsListing(promise) {
  await assert.rejects(promise, { message: FAILED });
}

test('listAccounts returns only public fields and drops credential state', async (t) => {
  const { provider, calls } = configured(t, (parsed) => {
    assertActiveQuery(parsed);
    return jsonResponse(200, {
      items: [{
        id: 'ca_1',
        toolkit: { slug: 'GITHUB' },
        status: 'ACTIVE',
        state: { val: { access_token: 'should-not-leave' } },
      }],
    });
  });
  const accounts = await provider.listAccounts({ userId: 'wiser-user' });
  assert.equal(calls.length, 1);
  assert.deepEqual(accounts, [{ id: 'ca_1', toolkit: 'GITHUB', status: 'ACTIVE' }]);
  assert.deepEqual(Object.keys(accounts[0]), ['id', 'toolkit', 'status']);
  assert.equal(JSON.stringify(accounts).includes('access_token'), false);
  assert.equal(JSON.stringify(accounts).includes('should-not-leave'), false);
});

test('listAccounts follows next_cursor across three pages and keeps the query on each', async (t) => {
  const pages = [
    {
      items: [
        account('ca_1', 'ACTIVE', 'GITHUB'),
        account('ca_drop', 'EXPIRED', 'GITHUB'),
      ],
      next_cursor: 'cursor-2',
    },
    {
      items: [{ id: 'ca_2', toolkit_slug: 'SLACK', status: 'ACTIVE', state: { access_token: SENTINEL } }],
      next_cursor: 'cursor-3',
    },
    {
      items: [account('ca_3', 'active', 'NOTION')],
      next_cursor: null,
    },
  ];
  let i = 0;
  const { provider, calls } = configured(t, () => jsonResponse(200, pages[i++]));
  const accounts = await provider.listAccounts({ userId: 'wiser-user' });
  assert.equal(calls.length, 3);
  assertActiveQuery(calls[0], { cursor: null });
  assertActiveQuery(calls[1], { cursor: 'cursor-2' });
  assertActiveQuery(calls[2], { cursor: 'cursor-3' });
  assert.deepEqual(accounts, [
    { id: 'ca_1', toolkit: 'GITHUB', status: 'ACTIVE' },
    { id: 'ca_2', toolkit: 'SLACK', status: 'ACTIVE' },
    { id: 'ca_3', toolkit: 'NOTION', status: 'ACTIVE' },
  ]);
  for (const row of accounts) assert.deepEqual(Object.keys(row), ['id', 'toolkit', 'status']);
  assert.equal(JSON.stringify(accounts).includes(SENTINEL), false);
});

test('states all asks for the six documented states on every page and keeps each status', async (t) => {
  const pages = [
    {
      items: [
        account('ca_INITIALIZING', 'INITIALIZING'),
        account('ca_INITIATED', 'INITIATED'),
        account('ca_ACTIVE', 'ACTIVE'),
        account('ca_PENDING', 'PENDING'),
      ],
      next_cursor: 'rest',
    },
    {
      items: [
        account('ca_FAILED', 'FAILED'),
        account('ca_EXPIRED', 'EXPIRED'),
        account('ca_INACTIVE', 'INACTIVE'),
        account('ca_bare', 'ACTIVE', null),
        { id: 'ca_slug', toolkit_slug: 'LINEAR', status: 'initializing', state: { access_token: SENTINEL } },
      ],
      next_cursor: '',
    },
  ];
  let i = 0;
  const { provider, calls } = configured(t, () => jsonResponse(200, pages[i++]));
  const accounts = await provider.listAccounts({ userId: 'wiser-user', states: 'all' });
  assert.equal(calls.length, 2);
  for (const parsed of calls) {
    assert.equal(parsed.pathname, '/api/v3.1/connected_accounts');
    assert.equal(parsed.searchParams.get('user_ids'), 'wiser-user');
    assert.deepEqual(parsed.searchParams.getAll('statuses'), SIX);
    assert.equal(parsed.searchParams.get('limit'), '100');
  }
  assert.equal(calls[0].searchParams.get('cursor'), null);
  assert.equal(calls[1].searchParams.get('cursor'), 'rest');
  assert.deepEqual(accounts, [
    { id: 'ca_INITIALIZING', toolkit: 'GITHUB', status: 'INITIALIZING' },
    { id: 'ca_INITIATED', toolkit: 'GITHUB', status: 'INITIATED' },
    { id: 'ca_ACTIVE', toolkit: 'GITHUB', status: 'ACTIVE' },
    { id: 'ca_PENDING', toolkit: 'GITHUB', status: 'INITIATED' },
    { id: 'ca_FAILED', toolkit: 'GITHUB', status: 'FAILED' },
    { id: 'ca_EXPIRED', toolkit: 'GITHUB', status: 'EXPIRED' },
    { id: 'ca_INACTIVE', toolkit: 'GITHUB', status: 'INACTIVE' },
    { id: 'ca_bare', toolkit: null, status: 'ACTIVE' },
    { id: 'ca_slug', toolkit: 'LINEAR', status: 'INITIALIZING' },
  ]);
  assert.equal(JSON.stringify(accounts).includes(SENTINEL), false);
});

test('an empty listing is an empty array', async (t) => {
  const { provider, calls } = configured(t, () => jsonResponse(200, { items: [] }));
  const accounts = await provider.listAccounts({ userId: 'wiser-user' });
  assert.deepEqual(accounts, []);
  assert.equal(calls.length, 1);
});

test('listAccounts rejects when there is no project key and does not call the provider', async (t) => {
  const missing = providerWith(t, 'WISER_USER_ID=wiser-user\n', () => {
    throw new Error(SENTINEL);
  });
  await rejectsListing(missing.provider.listAccounts({ userId: 'wiser-user' }));
  await rejectsListing(missing.provider.listAccounts({ userId: 'wiser-user', states: 'all' }));
  assert.equal(missing.calls.length, 0);

  const absent = providerWith(t, null, () => {
    throw new Error(SENTINEL);
  });
  await rejectsListing(absent.provider.listAccounts({ userId: 'wiser-user' }));
  assert.equal(absent.calls.length, 0);
});

test('listAccounts rejects any states value other than all', async (t) => {
  const { provider, calls } = configured(t, () => {
    throw new Error(SENTINEL);
  });
  for (const states of ['ACTIVE', 'ALL', '', null]) {
    await rejectsListing(provider.listAccounts({ userId: 'wiser-user', states }));
  }
  assert.equal(calls.length, 0);
});

test('listAccounts rejects a non-2xx page and does not return the earlier page', async (t) => {
  let n = 0;
  const { provider, calls } = configured(t, () => {
    n += 1;
    if (n === 1) {
      return jsonResponse(200, {
        items: [account('ca_1', 'ACTIVE')],
        next_cursor: 'page-2',
        error: SENTINEL,
      });
    }
    return jsonResponse(500, { error: SENTINEL, items: [account('ca_2', 'ACTIVE')] });
  });
  await rejectsListing(provider.listAccounts({ userId: 'wiser-user' }));
  assert.equal(calls.length, 2);
});

test('listAccounts rejects a network failure', async (t) => {
  const { provider } = configured(t, () => {
    throw new Error(`network down ${SENTINEL}`);
  });
  await rejectsListing(provider.listAccounts({ userId: 'wiser-user' }));
});

test('listAccounts rejects a page whose body is not JSON', async (t) => {
  const { provider } = configured(t, () => jsonResponse(200, `not-json ${SENTINEL}`));
  await rejectsListing(provider.listAccounts({ userId: 'wiser-user' }));
});

test('listAccounts rejects when items is missing or not an array', async (t) => {
  const bodies = [
    {},
    { connected_accounts: [account('ca_1', 'ACTIVE')] },
    { data: [account('ca_1', 'ACTIVE')] },
    { items: null },
    { items: { id: 'ca_1' } },
    { items: 'ca_1' },
  ];
  let i = 0;
  const { provider, calls } = configured(t, () => jsonResponse(200, bodies[i]));
  for (let n = 0; n < bodies.length; n += 1) {
    i = n;
    await rejectsListing(provider.listAccounts({ userId: 'wiser-user' }));
  }
  assert.equal(calls.length, bodies.length);
});

test('listAccounts rejects an item that is not an object or has no account id', async (t) => {
  const bodies = [
    { items: [null] },
    { items: ['ca_1'] },
    { items: [12] },
    { items: [account('ca_ok', 'ACTIVE'), null] },
    { items: [{ toolkit: { slug: 'GITHUB' }, status: 'ACTIVE' }] },
    { items: [{ id: '', toolkit: { slug: 'GITHUB' }, status: 'ACTIVE' }] },
    { items: [{ id: 12, toolkit: { slug: 'GITHUB' }, status: 'ACTIVE' }] },
    { items: [{ nanoid: 'ca_nano', toolkit: { slug: 'GITHUB' }, status: 'ACTIVE' }] },
  ];
  let i = 0;
  const { provider } = configured(t, () => jsonResponse(200, bodies[i]));
  for (let n = 0; n < bodies.length; n += 1) {
    i = n;
    await rejectsListing(provider.listAccounts({ userId: 'wiser-user' }));
  }
});

test('listAccounts rejects a next_cursor that repeats one already followed', async (t) => {
  const pages = [
    { items: [account('ca_1', 'ACTIVE')], next_cursor: 'again' },
    { items: [account('ca_2', 'ACTIVE')], next_cursor: 'again' },
    { items: [account('ca_3', 'ACTIVE')], next_cursor: null },
  ];
  let i = 0;
  const { provider, calls } = configured(t, () => jsonResponse(200, pages[i++]));
  await rejectsListing(provider.listAccounts({ userId: 'wiser-user' }));
  assert.equal(calls.length, 2);
  assert.equal(calls[1].searchParams.get('cursor'), 'again');
});

test('listAccounts rejects a listing that would pass 100 pages without reading another', async (t) => {
  const { provider, calls } = configured(t, () => {
    const n = calls.length;
    return jsonResponse(200, {
      items: [account(`ca_${n}`, 'ACTIVE')],
      next_cursor: `cursor-${n}`,
    });
  });
  await rejectsListing(provider.listAccounts({ userId: 'wiser-user' }));
  assert.equal(calls.length, 100);
});

test('listAccounts returns a listing that ends on the 100th page', async (t) => {
  const { provider, calls } = configured(t, () => {
    const n = calls.length;
    const last = n === 100;
    return jsonResponse(200, {
      items: [account(`ca_${n}`, 'ACTIVE')],
      next_cursor: last ? null : `cursor-${n}`,
    });
  });
  const accounts = await provider.listAccounts({ userId: 'wiser-user' });
  assert.equal(calls.length, 100);
  assert.equal(accounts.length, 100);
  assert.equal(accounts[0].id, 'ca_1');
  assert.equal(accounts[99].id, 'ca_100');
  assert.deepEqual(Object.keys(accounts[99]), ['id', 'toolkit', 'status']);
});
