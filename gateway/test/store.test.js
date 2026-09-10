import { test } from 'node:test';
import assert from 'node:assert/strict';

import { JsonFileStore } from '../src/store.js';
import { makeHome } from './fake-provider.js';

function sample(extra = {}) {
  return {
    id: 'c1',
    service: 'github',
    module: 'repos',
    privilege: 'write',
    provider: 'catalog',
    provider_account_id: 'acct-1',
    scopes: [],
    status: 'ACTIVE',
    created: '2026-09-05T00:00:00.000Z',
    updated: '2026-09-05T00:00:00.000Z',
    ...extra,
  };
}

test('put and get a metadata record', () => {
  const store = new JsonFileStore(makeHome());
  store.putConnection(sample());
  const got = store.getConnection({ service: 'github', module: 'repos' });
  assert.equal(got.provider_account_id, 'acct-1');
  assert.equal(got.status, 'ACTIVE');
  assert.equal(store.listConnections().length, 1);
});

test('store throws on a forbidden key', () => {
  const store = new JsonFileStore(makeHome());
  assert.throws(
    () => store.putConnection(sample({ access_token: 'nope' })),
    /access_token/,
  );
  assert.throws(
    () => store.putConnection(sample({ token: 'nope' })),
    /token/,
  );
  assert.throws(
    () => store.putConnection(sample({ api_key: 'nope' })),
    /api_key/,
  );
});

test('store throws on a token-shaped value', () => {
  const store = new JsonFileStore(makeHome());
  assert.throws(
    () => store.putConnection(sample({ notes: 'ghp_example' })),
    /credential-shaped/,
  );
  assert.throws(
    () => store.putConnection(sample({ notes: 'Bearer abc' })),
    /credential-shaped/,
  );
  const err = (() => {
    try {
      store.putConnection(sample({ notes: 'sk-live-example' }));
      return null;
    } catch (e) {
      return e;
    }
  })();
  assert.ok(err);
  assert.doesNotMatch(err.message, /sk-live-example/);
});

test('getUserId persists wiser-uuid', () => {
  const store = new JsonFileStore(makeHome());
  const a = store.getUserId();
  const b = store.getUserId();
  assert.match(a, /^wiser-[0-9a-f-]+$/i);
  assert.equal(a, b);
});
