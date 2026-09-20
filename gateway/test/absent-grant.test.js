import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTestGateway, makeHome, putActive } from './fake-provider.js';

/** A one-module connector, so a specific auth branch can be reached. */
function connector(auth, fn, unwrapToken = false) {
  return {
    id: 'github',
    manifest: { modules: { repos: { auth, unwrap_token: unwrapToken, actions: { get: { risk: 'low', confirmation: 'none' } } } } },
    impl: { modules: { repos: { get: fn } } },
  };
}

/**
 * `ABSENT` reaching every consumer of the provider status contract.
 *
 * The word was added on 2026-09-20 so a caller can tell a deleted grant from a
 * switched-off one, which the composio adapter could not. A new word is only useful
 * if every reader of that contract learns it: the gateway had the non-ACTIVE list in
 * two places, one of which would have downgraded an unknown word to INACTIVE and the
 * other of which would have ignored it. These assert it survives on each path.
 */

test('the fake provider distinguishes absent from inactive, so a fake-only proof cannot hide the defect', async () => {
  const { fake } = await createTestGateway();
  fake.auth.setStatus('ca_off', 'INACTIVE');
  assert.equal(await fake.auth.status({ providerAccountId: 'ca_off' }), 'INACTIVE');
  assert.equal(await fake.auth.status({ providerAccountId: 'ca_never_existed' }), 'ABSENT');
  // And a revoke makes a present account absent, rather than merely inactive.
  fake.auth.setStatus('ca_live', 'ACTIVE');
  await fake.auth.revoke({ providerAccountId: 'ca_live' });
  assert.equal(await fake.auth.status({ providerAccountId: 'ca_live' }), 'ABSENT');
});

test('the fake reports each teardown step, and a refusal can be driven', async () => {
  const { fake } = await createTestGateway();
  fake.auth.setStatus('ca_1', 'ACTIVE');
  const clean = await fake.auth.revoke({ providerAccountId: 'ca_1' });
  assert.equal(clean.supported, true);
  assert.deepEqual(clean.steps.map((s) => s.step), ['revoke', 'delete']);
  assert.equal(clean.steps.every((s) => s.ok), true);

  fake.auth.setRevokeOutcome({
    supported: true,
    steps: [{ step: 'revoke', status: 400, ok: false }, { step: 'delete', status: 200, ok: true }],
  });
  const refused = await fake.auth.revoke({ providerAccountId: 'ca_2' });
  assert.equal(refused.steps[0].ok, false);
  assert.equal(refused.steps[1].ok, true);
});

/**
 * A local-file gateway whose provider answers `status` with whatever is asked for.
 * Unwrapping is ENABLED, so "the credential was not unwrapped" is a claim about the
 * pre-check's position rather than about a branch that was never reachable.
 * Adversarial review found the first version asserting it with `unwrap_token: false`.
 */
async function localFileGateway(statusWord) {
  const seen = { ran: false, unwrapped: false };
  const localFileProvider = {
    name: 'local-file',
    isConfigured: () => true,
    setupText: () => 'fixture',
    async status() { return statusWord; },
    async unwrap() { seen.unwrapped = true; return { supported: true, header: 'Authorization', value: 'Bearer fixture' }; },
    async revoke() { return { supported: false, how: 'delete the file', steps: [] }; },
  };
  const made = await createTestGateway({
    localFileProvider,
    connectors: [connector(
      { provider: 'local-file', privilege: 'read', file: 'fixture.txt', variables: ['VALUE'], hosts: ['api.example.com'] },
      async () => { seen.ran = true; return { ok: true }; },
      true,
    )],
  });
  made.store.putConnection({
    id: 'conn-local', service: 'github', module: 'repos', privilege: 'read',
    provider: 'local-file', provider_account_id: null, scopes: [], status: 'ACTIVE',
    created: new Date().toISOString(), updated: new Date().toISOString(),
  });
  return { ...made, seen };
}

test('consumer one, the local-file pre-check: ABSENT is recorded as ABSENT, not downgraded', async () => {
  // This branch whitelists the non-ACTIVE words and falls back to INACTIVE for anything
  // else, so before the shared constant it would have silently downgraded the new word.
  // Reverting that constant fails this test, which was checked by mutation.
  const { gw, store, seen } = await localFileGateway('ABSENT');
  const r = await gw.execute({ action: 'github.repos.get', input: { owner: 'o', repo: 'r' } });
  assert.equal(r.status, 'needs_connect');
  assert.equal(r.provider_status, 'ABSENT', 'the new word was downgraded on the way out');
  assert.equal(store.getConnection({ service: 'github', module: 'repos' }).status, 'ABSENT');
  assert.equal(seen.ran, false, 'the module ran despite an absent grant');
  assert.equal(seen.unwrapped, false, 'the credential was unwrapped despite an absent grant');
});

test('the same fixture with an ACTIVE grant reaches both unwrap and the module', async () => {
  // The control that makes the two assertions above mean something: unwrapping and the
  // module are reachable in this fixture, so their absence is the pre-check's doing.
  const { gw, seen } = await localFileGateway('ACTIVE');
  await gw.execute({ action: 'github.repos.get', input: { owner: 'o', repo: 'r' } });
  assert.equal(seen.unwrapped, true, 'unwrap is unreachable here, so asserting its absence proves nothing');
  assert.equal(seen.ran, true, 'the module is unreachable here, so asserting its absence proves nothing');
});

test('consumer two, the refresh after an auth refusal: ABSENT stops the grant', async (t) => {
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'github', module: 'repos', privilege: 'write', provider: 'catalog' });
  t.mock.method(fake.auth, 'status', async () => 'ABSENT');
  fake.catalog.setResult('FAKE_REPOS_GET', { status: 401, error: { code: 'vendor_error', endpoint: '/x', method: 'GET' } });
  const r = await gw.execute({ action: 'github.repos.get', input: { owner: 'o', repo: 'r' } });
  assert.equal(r.status, 'needs_connect');
  assert.equal(r.provider_status, 'ABSENT');
  assert.equal(store.getConnection({ service: 'github', module: 'repos' }).status, 'ABSENT');
});

test('consumer three, connect_status: an absent account writes ABSENT and answers needs_connect', async (t) => {
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'github', module: 'repos', privilege: 'write', provider: 'catalog' });
  t.mock.method(fake.auth, 'status', async () => 'ABSENT');
  const r = await gw.connectStatus({ service: 'github', module: 'repos' });
  assert.equal(r.status, 'needs_connect');
  assert.equal(store.getConnection({ service: 'github', module: 'repos' }).status, 'ABSENT');
});

test('an INACTIVE account is still INACTIVE everywhere, so the new word did not swallow the old one', async (t) => {
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'github', module: 'repos', privilege: 'write', provider: 'catalog' });
  t.mock.method(fake.auth, 'status', async () => 'INACTIVE');
  const r = await gw.connectStatus({ service: 'github', module: 'repos' });
  assert.equal(r.status, 'needs_connect');
  assert.equal(store.getConnection({ service: 'github', module: 'repos' }).status, 'INACTIVE');
});

test('local-file answers INACTIVE for a missing file and never ABSENT, which is decided', async (t) => {
  // Recorded in providers/local-file/auth-provider.js and providers/AGENTS.md: a file
  // that is not on this disk says nothing about whether anything upstream was revoked.
  // An earlier version of this test passed `{ dir, bound }`, which that adapter does
  // not accept, so it proved the unconfigured path rather than the missing-file one.
  const { createAuthProvider } = await import('../providers/local-file/auth-provider.js');
  const secretsDir = makeHome();
  t.after(() => rmSync(secretsDir, { recursive: true, force: true }));
  const provider = createAuthProvider({ secretsDir });
  const args = { service: 'github', file: 'definitely-not-written.txt', variables: ['API_KEY'] };

  // The directory exists and is configured; the file inside it does not.
  assert.equal(await provider.status(args), 'INACTIVE');

  // And a file that exists but lacks the named variable is also INACTIVE, not ABSENT.
  writeFileSync(join(secretsDir, 'partial.txt'), 'OTHER=value\n');
  assert.equal(await provider.status({ ...args, file: 'partial.txt' }), 'INACTIVE');

  // A complete file is ACTIVE, so the assertions above are not passing by misconfiguration.
  writeFileSync(join(secretsDir, 'whole.txt'), 'API_KEY=fixture\n');
  assert.equal(await provider.status({ ...args, file: 'whole.txt' }), 'ACTIVE');

  assert.deepEqual(await provider.revoke({}), { supported: false, how: 'delete the file', steps: [] });
});

test('a refused teardown leaves the account present, so a later removal cannot be approved', async () => {
  // Adversarial review, P1: the fake deleted the account before applying a configured
  // refusal, so a teardown test could have approved a local removal after a revoke the
  // provider rejected.
  const { fake } = await createTestGateway();
  fake.auth.setStatus('ca_refused', 'ACTIVE');
  fake.auth.setRevokeOutcome({
    supported: true,
    steps: [{ step: 'revoke', status: 400, ok: false }, { step: 'delete', status: 500, ok: false }],
  });
  const result = await fake.auth.revoke({ providerAccountId: 'ca_refused' });
  assert.equal(result.steps.every((s) => s.ok === false), true);
  assert.equal(await fake.auth.status({ providerAccountId: 'ca_refused' }), 'ACTIVE',
    'the fake removed an account the teardown did not remove');
});

test('a partial teardown whose delete succeeded does remove the account', async () => {
  const { fake } = await createTestGateway();
  fake.auth.setStatus('ca_partial', 'ACTIVE');
  fake.auth.setRevokeOutcome({
    supported: true,
    steps: [{ step: 'revoke', status: 400, ok: false }, { step: 'delete', status: 200, ok: true }],
  });
  await fake.auth.revoke({ providerAccountId: 'ca_partial' });
  assert.equal(await fake.auth.status({ providerAccountId: 'ca_partial' }), 'ABSENT');
});

test('the default fake revoke of an absent account carries the documented failure envelope', async () => {
  // Adversarial review, round two: both steps reported 404 and false, but no top-level
  // error, so a caller could handle the fake's refusal and still not handle the real
  // adapter's. providers/AGENTS.md requires the envelope when the final step fails.
  const { fake } = await createTestGateway();
  const result = await fake.auth.revoke({ providerAccountId: 'ca_never_existed' });
  assert.equal(result.steps.every((s) => s.ok === false), true);
  assert.equal(result.error.code, 'vendor_error');
  assert.equal(result.error.method, 'DELETE');
  assert.equal(result.status, 404);

  // And a successful teardown carries no error, so the envelope is not always present.
  fake.auth.setStatus('ca_live', 'ACTIVE');
  const clean = await fake.auth.revoke({ providerAccountId: 'ca_live' });
  assert.equal(clean.error, undefined);
});
