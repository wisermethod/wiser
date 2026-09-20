import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAuthProvider } from './auth-provider.js';

/**
 * The adapter contract the teardown needs, at the adapter.
 *
 * Two defects this covers, both measured before they were fixed: `status` answered
 * INACTIVE for a deleted account and for a switched-off one alike, so no caller could
 * tell them apart; and `revoke` awaited its own POST and discarded the result, so a
 * vendor refusing revocation reported success.
 */

/** A provider bound to a synthetic key, with `fetch` driven by a route table. */
function provider(t, routes) {
  const dir = mkdtempSync(join(tmpdir(), 'wiser-revoke-status-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const envPath = join(dir, 'auth-provider.env');
  writeFileSync(envPath, 'WISER_AUTH_PROVIDER_KEY=synthetic-test-key\n');
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const { pathname } = new URL(url);
    const method = init?.method ?? 'GET';
    calls.push({ pathname, method });
    for (const route of routes) {
      if (route.method === method && pathname.endsWith(route.endsWith)) {
        return { status: route.status, text: async () => route.body ?? '' };
      }
    }
    throw new Error(`unrouted ${method} ${pathname}`);
  });
  return { provider: createAuthProvider({ envPath }), calls };
}

// ------------------------------------------------------------------- status

test('a 404 is ABSENT: the account does not exist at the provider', async (t) => {
  const { provider: p } = provider(t, [
    { method: 'GET', endsWith: '/connected_accounts/ca_gone', status: 404, body: '{"error":"not found"}' },
  ]);
  assert.equal(await p.status({ providerAccountId: 'ca_gone' }), 'ABSENT');
});

test('a live account reporting INACTIVE is INACTIVE: it exists and is switched off', async (t) => {
  const { provider: p } = provider(t, [
    { method: 'GET', endsWith: '/connected_accounts/ca_off', status: 200, body: '{"status":"INACTIVE"}' },
  ]);
  assert.equal(await p.status({ providerAccountId: 'ca_off' }), 'INACTIVE');
});

test('the two are distinguishable, which is the whole point and was not true before', async (t) => {
  const { provider: p } = provider(t, [
    { method: 'GET', endsWith: '/connected_accounts/ca_gone', status: 404, body: '' },
    { method: 'GET', endsWith: '/connected_accounts/ca_off', status: 200, body: '{"status":"INACTIVE"}' },
  ]);
  const gone = await p.status({ providerAccountId: 'ca_gone' });
  const off = await p.status({ providerAccountId: 'ca_off' });
  assert.notEqual(gone, off, 'a deleted account and a switched-off one still answer alike');
  assert.equal(gone, 'ABSENT');
  assert.equal(off, 'INACTIVE');
});

test('a transport failure is still neither, so an outage cannot look like a dead grant', async (t) => {
  const { provider: p } = provider(t, [
    { method: 'GET', endsWith: '/connected_accounts/ca_1', status: 500, body: '' },
  ]);
  const answer = await p.status({ providerAccountId: 'ca_1' });
  assert.equal(typeof answer, 'object');
  assert.equal(answer.error.code, 'vendor_error');
  assert.equal(answer.status, 500);
});

// ------------------------------------------------------------------- revoke

test('both steps succeed: each is reported', async (t) => {
  const { provider: p, calls } = provider(t, [
    { method: 'POST', endsWith: '/revoke', status: 200, body: '{}' },
    { method: 'DELETE', endsWith: '/connected_accounts/ca_1', status: 200, body: '{}' },
  ]);
  const result = await p.revoke({ providerAccountId: 'ca_1' });
  assert.equal(result.supported, true);
  assert.deepEqual(result.steps, [
    { step: 'revoke', status: 200, ok: true },
    { step: 'delete', status: 200, ok: true },
  ]);
  assert.equal(result.error, undefined);
  assert.deepEqual(calls.map((c) => c.method), ['POST', 'DELETE']);
});

test('the POST fails and the DELETE succeeds: reported as such, not as plain success', async (t) => {
  // Measured at the vendor 2026-09-19: a custom API_KEY toolkit answers the revoke
  // POST with 400 and "does not support programmatic credential revocation". Before
  // this change the caller saw `{ supported: true }` and nothing else.
  const { provider: p } = provider(t, [
    { method: 'POST', endsWith: '/revoke', status: 400, body: '{"error":"does not support programmatic credential revocation"}' },
    { method: 'DELETE', endsWith: '/connected_accounts/ca_1', status: 200, body: '{}' },
  ]);
  const result = await p.revoke({ providerAccountId: 'ca_1' });
  assert.equal(result.supported, true);
  assert.deepEqual(result.steps, [
    { step: 'revoke', status: 400, ok: false },
    { step: 'delete', status: 200, ok: true },
  ]);
  // The vendor's sentence is not carried out of the adapter.
  assert.equal(JSON.stringify(result).includes('programmatic'), false);
});

test('the POST succeeds and the DELETE fails: an error, and both steps still reported', async (t) => {
  const { provider: p } = provider(t, [
    { method: 'POST', endsWith: '/revoke', status: 200, body: '{}' },
    { method: 'DELETE', endsWith: '/connected_accounts/ca_1', status: 500, body: '' },
  ]);
  const result = await p.revoke({ providerAccountId: 'ca_1' });
  assert.equal(result.error.code, 'vendor_error');
  assert.equal(result.error.method, 'DELETE');
  assert.equal(result.status, 500);
  assert.deepEqual(result.steps, [
    { step: 'revoke', status: 200, ok: true },
    { step: 'delete', status: 500, ok: false },
  ]);
});

test('both fail: the caller can see that nothing happened at either step', async (t) => {
  const { provider: p } = provider(t, [
    { method: 'POST', endsWith: '/revoke', status: 400, body: '' },
    { method: 'DELETE', endsWith: '/connected_accounts/ca_1', status: 404, body: '' },
  ]);
  const result = await p.revoke({ providerAccountId: 'ca_1' });
  assert.equal(result.steps.every((s) => s.ok === false), true);
  assert.equal(result.error.code, 'vendor_error');
});

test('with no key configured, revoke answers the shape every adapter answers', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'wiser-revoke-nokey-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const envPath = join(dir, 'auth-provider.env');
  writeFileSync(envPath, 'WISER_AUTH_PROVIDER_KEY=\n');
  const p = createAuthProvider({ envPath });
  const result = await p.revoke({ providerAccountId: 'ca_1' });
  assert.deepEqual(result, { supported: false, how: 'not configured', steps: [] });
});

test('the account id is encoded into every path, and the error names the path called', async (t) => {
  const { provider: p, calls } = provider(t, [
    { method: 'POST', endsWith: '/revoke', status: 200, body: '{}' },
    { method: 'DELETE', endsWith: '/connected_accounts/ca%2F..%2Fescape', status: 500, body: '' },
  ]);
  const result = await p.revoke({ providerAccountId: 'ca/../escape' });
  assert.ok(calls.every((c) => !c.pathname.includes('/../')), 'an id traversed the path');
  // The reported endpoint is the one actually called, not the raw caller string.
  assert.equal(result.error.endpoint.includes('..%2F'), true);
  assert.equal(result.error.endpoint.includes('/../'), false);
});

// ------------------------------------------------- regressions from review round one

test('a body that cannot be read does not discard the steps already taken', async (t) => {
  // Adversarial review, P2. `res.text()` was awaited uncaught, so a connection breaking
  // while reading the DELETE response threw out of revoke and took the completed POST
  // result with it. The status line is known even when the body is not.
  const dir = mkdtempSync(join(tmpdir(), 'wiser-revoke-body-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const envPath = join(dir, 'auth-provider.env');
  writeFileSync(envPath, 'WISER_AUTH_PROVIDER_KEY=synthetic-test-key\n');
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const method = init?.method ?? 'GET';
    if (method === 'POST') return { status: 200, text: async () => '{}' };
    return { status: 200, text: async () => { throw new Error('connection reset while reading body'); } };
  });
  const p = createAuthProvider({ envPath });
  const result = await p.revoke({ providerAccountId: 'ca_1' });
  assert.deepEqual(result.steps, [
    { step: 'revoke', status: 200, ok: true },
    { step: 'delete', status: 200, ok: true },
  ], 'the completed first step was lost');
});

test('a rejected fetch at the first step still reports both steps', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'wiser-revoke-reject-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const envPath = join(dir, 'auth-provider.env');
  writeFileSync(envPath, 'WISER_AUTH_PROVIDER_KEY=synthetic-test-key\n');
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if ((init?.method ?? 'GET') === 'POST') throw new Error('network down');
    return { status: 200, text: async () => '{}' };
  });
  const p = createAuthProvider({ envPath });
  const result = await p.revoke({ providerAccountId: 'ca_1' });
  assert.deepEqual(result.steps, [
    { step: 'revoke', status: 0, ok: false },
    { step: 'delete', status: 200, ok: true },
  ]);
  assert.equal(result.supported, true);
});

test('a status read whose body cannot be read is an error, not a grant state', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'wiser-status-body-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const envPath = join(dir, 'auth-provider.env');
  writeFileSync(envPath, 'WISER_AUTH_PROVIDER_KEY=synthetic-test-key\n');
  t.mock.method(globalThis, 'fetch', async () => ({
    status: 200, text: async () => { throw new Error('connection reset'); },
  }));
  const p = createAuthProvider({ envPath });
  const answer = await p.status({ providerAccountId: 'ca_1' });
  assert.equal(typeof answer, 'object', 'an unreadable body must not become a grant word');
  assert.equal(answer.error.code, 'vendor_error');
});

// ------------------------------- regressions from review round two: the initiate path

/**
 * `initiate` needs the response BODY, not just its status line. Catching a rejecting
 * `res.text()` so that `revoke` could keep its steps turned an unreadable 200 into an
 * "ok with no data", and this consumer read that as an empty list and as a link.
 * Adversarial review found it; it is the fix at one unit recreating the defect at the
 * unit the system shares.
 */
function initiator(t, routes) {
  const dir = mkdtempSync(join(tmpdir(), 'wiser-initiate-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const envPath = join(dir, 'auth-provider.env');
  writeFileSync(envPath, 'WISER_AUTH_PROVIDER_KEY=synthetic-test-key\n');
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const { pathname } = new URL(url);
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${pathname}`);
    for (const route of routes) {
      if (route.method === method && pathname.endsWith(route.endsWith)) {
        if (route.unreadable) return { status: route.status, text: async () => { throw new Error('connection reset'); } };
        return { status: route.status, text: async () => route.body ?? '' };
      }
    }
    throw new Error(`unrouted ${method} ${pathname}`);
  });
  return { provider: createAuthProvider({ envPath }), calls };
}

test('an unreadable config list is refused, and no config is created from it', async (t) => {
  const { provider: p, calls } = initiator(t, [
    { method: 'GET', endsWith: '/auth_configs', status: 200, unreadable: true },
  ]);
  const result = await p.initiate({ userId: 'u', toolkit: 'GITHUB', scheme: 'OAUTH2' });
  assert.equal(result.error.code, 'vendor_error');
  assert.equal(calls.length, 1, 'it went on to write after a body it could not read');
});

test('two configs are still refused, so the refusal above is reachable', async (t) => {
  // The control. Without it, the assertion above could pass because the refusal path
  // is unreachable rather than because the malformed body was caught.
  const { provider: p } = initiator(t, [
    { method: 'GET', endsWith: '/auth_configs', status: 200, body: '{"items":[{"id":"a"},{"id":"b"}]}' },
  ]);
  const result = await p.initiate({ userId: 'u', toolkit: 'GITHUB', scheme: 'OAUTH2' });
  assert.equal(result.error.code, 'vendor_error');
  assert.equal(result.configs, 2);
});

test('an unreadable link response is refused rather than returned as a link', async (t) => {
  const { provider: p } = initiator(t, [
    { method: 'GET', endsWith: '/auth_configs', status: 200, body: '{"items":[{"id":"cfg_1"}]}' },
    { method: 'POST', endsWith: '/connected_accounts/link', status: 200, unreadable: true },
  ]);
  const result = await p.initiate({ userId: 'u', toolkit: 'GITHUB', scheme: 'OAUTH2' });
  assert.equal(result.error.code, 'vendor_error');
  assert.equal(result.kind, undefined, 'an unusable link was handed back as a link');
});

test('a link response carrying no url is refused, because a link with no url is not a link', async (t) => {
  const { provider: p } = initiator(t, [
    { method: 'GET', endsWith: '/auth_configs', status: 200, body: '{"items":[{"id":"cfg_1"}]}' },
    { method: 'POST', endsWith: '/connected_accounts/link', status: 200, body: '{"connected_account_id":"ca_1"}' },
  ]);
  const result = await p.initiate({ userId: 'u', toolkit: 'GITHUB', scheme: 'OAUTH2' });
  assert.equal(result.error.code, 'vendor_error');
  assert.equal(result.kind, undefined);
});

test('a whole initiate still succeeds, so the four refusals above are not refusing everything', async (t) => {
  const { provider: p } = initiator(t, [
    { method: 'GET', endsWith: '/auth_configs', status: 200, body: '{"items":[{"id":"cfg_1"}]}' },
    { method: 'POST', endsWith: '/connected_accounts/link', status: 200, body: '{"redirect_url":"https://example.com/c","connected_account_id":"ca_1"}' },
  ]);
  const result = await p.initiate({ userId: 'u', toolkit: 'GITHUB', scheme: 'OAUTH2' });
  assert.deepEqual(result, { kind: 'link', url: 'https://example.com/c', providerAccountId: 'ca_1' });
});
