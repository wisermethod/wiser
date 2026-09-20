import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTestGateway, putActive } from './fake-provider.js';

/**
 * The teardown tool.
 *
 * **Its unit is the credential, not the module.** `hydrateFromProvider` writes one
 * provider account into every module of its toolkit that has no grant of its own,
 * measured at five modules on one account, so a teardown scoped to the named module
 * would revoke a credential the others were running on and leave their rows ACTIVE
 * against an account that no longer exists — the stale-row defect this build removes,
 * recreated by the tool built to remove it.
 */

const KIT = 'fake-acct-shared';

/** Two modules of one service on ONE provider account, which is what hydration makes. */
async function shared(options = {}) {
  const made = await createTestGateway(options);
  made.fake.auth.setStatus(KIT, 'ACTIVE');
  for (const module of ['repos', 'issues']) {
    made.store.putConnection({
      id: `conn-${module}`,
      service: 'github',
      module,
      privilege: 'write',
      provider: 'catalog',
      provider_account_id: KIT,
      scopes: [],
      status: 'ACTIVE',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    });
  }
  return made;
}

const rows = (store) => store.listConnections().map((r) => `${r.service}/${r.module}`).sort();

// ------------------------------------------------------- the stop, before anything

test('an unconfirmed call stops, and the stop names every module the credential ends', async () => {
  const { gw, store } = await shared();
  const r = await gw.callTool('disconnect', { service: 'github', module: 'repos' });
  assert.equal(r.status, 'needs_confirmation');
  assert.equal(r.provider_account_id, KIT);
  assert.deepEqual(r.modules_ending.map((m) => `${m.service}/${m.module}`).sort(),
    ['github/issues', 'github/repos']);
  // The account is rendered through Session 1's escaper, and the module list rides the
  // description, which that function escapes too.
  assert.match(r.summary, /provider_account_id="fake-acct-shared"/);
  assert.match(r.summary, /ending github\/repos, github\/issues/);
  assert.match(r.summary, /removes 2 local records/);
  assert.equal(r.risk, 'destructive');
  // Nothing happened.
  assert.deepEqual(rows(store), ['github/issues', 'github/repos']);
});

test('the stop is enforced, not advisory: confirmation is not a manifest field here', async () => {
  // Witness 14: `confirmation` lives inside `execute` and a top-level tool is not on
  // that path, so this tool implements its own or it has none.
  const { gw, store, fake } = await shared();
  await gw.callTool('disconnect', { service: 'github', module: 'repos' });
  assert.equal(await fake.auth.status({ providerAccountId: KIT }), 'ACTIVE',
    'the credential was revoked without an approval');
  assert.equal(rows(store).length, 2);
});

// ---------------------------------------------------------------- a clean teardown

test('a confirmed teardown revokes once and removes every row on that credential', async () => {
  const { gw, store, fake, home } = await shared();
  const r = await gw.callTool('disconnect', {
    service: 'github', module: 'repos', provider_account_id: KIT, confirm: true,
  });
  assert.equal(r.status, 'disconnected');
  assert.deepEqual(r.steps.map((s) => s.step), ['revoke', 'delete']);
  assert.equal(r.steps.every((s) => s.ok), true);
  assert.deepEqual(r.removed.map((m) => `${m.service}/${m.module}`).sort(),
    ['github/issues', 'github/repos']);
  assert.deepEqual(rows(store), [], 'a sibling row survived a credential that is gone');
  assert.equal(await fake.auth.status({ providerAccountId: KIT }), 'ABSENT');

  const audit = readFileSync(`${home}/audit.jsonl`, 'utf8').trim().split('\n').map(JSON.parse);
  const last = audit.at(-1);
  assert.equal(last.op, 'disconnect');
  assert.equal(last.status, 'disconnected');
  assert.equal(last.provider_account_id, KIT);
  assert.equal('input' in last, false);
});

// ------------------------------------------------------------------ the refusals

test('a provider that refuses the revoke removes nothing, and says what each step did', async () => {
  const { gw, store, fake } = await shared();
  fake.auth.setRevokeOutcome({
    supported: true,
    steps: [{ step: 'revoke', status: 400, ok: false }, { step: 'delete', status: 500, ok: false }],
  });
  const r = await gw.callTool('disconnect', {
    service: 'github', module: 'repos', provider_account_id: KIT, confirm: true,
  });
  assert.equal(r.status, 'teardown_incomplete');
  assert.equal(r.reason, 'not_absent_after_revoke');
  assert.equal(r.provider_status, 'ACTIVE');
  assert.deepEqual(r.steps.map((s) => s.ok), [false, false]);
  assert.deepEqual(rows(store), ['github/issues', 'github/repos'], 'rows went on a refused revoke');
});

test('absence is verified and never inferred: a revoke that reports success but leaves the account removes nothing', async (t) => {
  // The whole reason Session 2 added ABSENT. A revoke returning `supported: true` with
  // every step ok is not evidence the credential is gone; the provider saying it is gone
  // is. The post-revoke reading is driven directly here rather than through the fake's
  // own bookkeeping, because the fake correctly ties its deletion to the delete step and
  // so cannot express a provider that disagrees with its own success.
  const { gw, store, fake } = await shared();
  fake.auth.setRevokeOutcome({
    supported: true,
    steps: [{ step: 'revoke', status: 200, ok: true }, { step: 'delete', status: 200, ok: true }],
  });
  t.mock.method(fake.auth, 'status', async () => 'ACTIVE');
  const r = await gw.callTool('disconnect', {
    service: 'github', module: 'repos', provider_account_id: KIT, confirm: true,
  });
  assert.notEqual(r.status, 'disconnected');
  assert.equal(r.reason, 'not_absent_after_revoke');
  assert.equal(r.provider_status, 'ACTIVE');
  assert.equal(rows(store).length, 2);
});

test('an adapter with no revoke is a missing capability, not a failure to report', async () => {
  const { gw, store } = await shared();
  const provider = gw.authProvider;
  delete provider.revoke;
  const r = await gw.callTool('disconnect', {
    service: 'github', module: 'repos', provider_account_id: KIT, confirm: true,
  });
  assert.equal(r.status, 'needs_provider_capability');
  assert.equal(r.capability, 'revoke');
  assert.equal(rows(store).length, 2);
});

test('an adapter answering supported: false reports how, and removes nothing', async () => {
  const { gw, store, fake } = await shared();
  fake.auth.setRevokeOutcome({ supported: false, how: 'delete the file', steps: [] });
  const r = await gw.callTool('disconnect', {
    service: 'github', module: 'repos', provider_account_id: KIT, confirm: true,
  });
  assert.equal(r.status, 'needs_provider_capability');
  assert.equal(r.how, 'delete the file');
  assert.equal(rows(store).length, 2);
});

test('a grant absent locally is said plainly rather than reported as a success that removed nothing', async () => {
  const { gw } = await createTestGateway();
  const r = await gw.callTool('disconnect', { service: 'github', module: 'repos' });
  assert.equal(r.status, 'needs_connect');
  assert.equal(r.reason, 'nothing_to_disconnect');
});

test('a readonly caller is denied by a policy rule, not by a metadata field', async () => {
  const { gw, store } = await shared({ role: 'readonly' });
  const r = await gw.callTool('disconnect', { service: 'github', module: 'repos' });
  assert.equal(r.status, 'denied');
  assert.equal(rows(store).length, 2);
  // And denied before any stop is composed, so a readonly caller never sees the summary.
  assert.equal(r.summary, undefined);
});

test('a repeated disconnect finds nothing to do the second time', async () => {
  const { gw } = await shared();
  const first = await gw.callTool('disconnect', {
    service: 'github', module: 'repos', provider_account_id: KIT, confirm: true,
  });
  assert.equal(first.status, 'disconnected');
  const second = await gw.callTool('disconnect', { service: 'github', module: 'repos' });
  assert.equal(second.status, 'needs_connect');
  assert.equal(second.reason, 'nothing_to_disconnect');
});

// --------------------------------------------------- the approval and its binding

test('a confirmed call carrying no account id is refused', async () => {
  const { gw, store } = await shared();
  const r = await gw.callTool('disconnect', { service: 'github', module: 'repos', confirm: true });
  assert.equal(r.status, 'invalid_arguments');
  assert.equal(r.field, 'provider_account_id');
  assert.equal(rows(store).length, 2);
});

test('a reconnect between the stop and the confirmed call refuses audibly', async () => {
  const { gw, store } = await shared();
  const stop = await gw.callTool('disconnect', { service: 'github', module: 'repos' });
  assert.equal(stop.status, 'needs_confirmation');

  // A reconnect installs a different account id on that row.
  store.putConnection({
    id: 'conn-repos', service: 'github', module: 'repos', privilege: 'write',
    provider: 'catalog', provider_account_id: 'fake-acct-different', scopes: [],
    status: 'ACTIVE', created: new Date().toISOString(), updated: new Date().toISOString(),
  });

  const r = await gw.callTool('disconnect', {
    service: 'github', module: 'repos', provider_account_id: stop.provider_account_id, confirm: true,
  });
  assert.equal(r.status, 'denied');
  assert.equal(r.rule.reason, 'account_changed');
  assert.equal(rows(store).length, 2, 'the reconnected row was touched');
});

test('a reconnect DURING the provider round trip cannot take the new row, within one process', async () => {
  // The window question 6 was really about: the binding check above happens before the
  // revoke, and the reconnect can land while the provider call is in flight. The delete
  // filters on the APPROVED account id, so the reconnected row carries a different id
  // and is skipped whether or not anything checks. Proved rather than reasoned.
  //
  // **This is one interleaving in one process, and the scope is the point.** The store
  // is an unlocked read-modify-write, so two gateway processes can still lose an update
  // and erase the reconnected row. That race predates this tool and is recorded at
  // `src/store.js`; an earlier version of this test's name claimed "by construction",
  // which claimed more than one process can establish.
  const { gw, store, fake } = await shared();
  fake.auth.setRevokeOutcome(({ providerAccountId }) => {
    // Mid-teardown: somebody reconnects `repos` onto a fresh account.
    store.putConnection({
      id: 'conn-repos', service: 'github', module: 'repos', privilege: 'write',
      provider: 'catalog', provider_account_id: 'fake-acct-reconnected', scopes: [],
      status: 'ACTIVE', created: new Date().toISOString(), updated: new Date().toISOString(),
    });
    fake.auth.removeAccount(providerAccountId);
    return {
      supported: true,
      steps: [{ step: 'revoke', status: 200, ok: true }, { step: 'delete', status: 200, ok: true }],
    };
  });
  const r = await gw.callTool('disconnect', {
    service: 'github', module: 'repos', provider_account_id: KIT, confirm: true,
  });
  assert.equal(r.status, 'disconnected');
  // Only the sibling still on the approved credential went. The reconnected row stands.
  assert.deepEqual(r.removed.map((m) => `${m.service}/${m.module}`), ['github/issues']);
  assert.deepEqual(rows(store), ['github/repos']);
  assert.equal(store.getConnection({ service: 'github', module: 'repos' }).provider_account_id,
    'fake-acct-reconnected');
});

// ------------------------------------------- the scope caveat Session 2 handed on

test('a provider error after the revoke leaves every row alone', async () => {
  // providers/AGENTS.md: an error object is a transport or provider failure and not a
  // grant state. It must not read as absence, because absence is what removes rows.
  const { gw, store, fake } = await shared();
  fake.auth.setRevokeOutcome({
    supported: true,
    steps: [{ step: 'revoke', status: 200, ok: true }, { step: 'delete', status: 200, ok: true }],
  });
  fake.auth.status = async () => ({ status: 503, error: { code: 'vendor_error', endpoint: '/x', method: 'GET' } });
  const r = await gw.callTool('disconnect', {
    service: 'github', module: 'repos', provider_account_id: KIT, confirm: true,
  });
  assert.equal(r.status, 'vendor_error');
  assert.deepEqual(r.removed, []);
  assert.equal(rows(store).length, 2);
});

test('an INACTIVE account after the revoke is not absence, so nothing is removed', async (t) => {
  // The inverse of today's defect and the easy mistake while fixing today's defect: a
  // grant that is merely suspended is coming back, and its rows must survive.
  const { gw, store, fake } = await shared();
  fake.auth.setRevokeOutcome({
    supported: true,
    steps: [{ step: 'revoke', status: 200, ok: true }, { step: 'delete', status: 200, ok: true }],
  });
  t.mock.method(fake.auth, 'status', async () => 'INACTIVE');
  const r = await gw.callTool('disconnect', {
    service: 'github', module: 'repos', provider_account_id: KIT, confirm: true,
  });
  assert.equal(r.reason, 'not_absent_after_revoke');
  assert.equal(r.provider_status, 'INACTIVE');
  assert.equal(rows(store).length, 2);
});

test('every non-absent word leaves the rows alone, so the gate is ABSENT and not "not ACTIVE"', async (t) => {
  // Both directions: the four stopped words and ACTIVE all withhold removal; ABSENT is
  // the only word that permits it.
  for (const word of ['ACTIVE', 'EXPIRED', 'FAILED', 'INACTIVE', 'INITIATED']) {
    const { gw, store, fake } = await shared();
    fake.auth.setRevokeOutcome({
      supported: true,
      steps: [{ step: 'revoke', status: 200, ok: true }, { step: 'delete', status: 200, ok: true }],
    });
    t.mock.method(fake.auth, 'status', async () => word);
    const r = await gw.callTool('disconnect', {
      service: 'github', module: 'repos', provider_account_id: KIT, confirm: true,
    });
    assert.notEqual(r.status, 'disconnected', `${word} permitted a removal`);
    assert.equal(rows(store).length, 2, `${word} removed a row`);
    t.mock.restoreAll();
  }
  // And the control: ABSENT does permit it, so the assertions above are not passing
  // because removal is unreachable.
  const { gw, store, fake } = await shared();
  fake.auth.setRevokeOutcome({
    supported: true,
    steps: [{ step: 'revoke', status: 200, ok: true }, { step: 'delete', status: 200, ok: true }],
  });
  t.mock.method(fake.auth, 'status', async () => 'ABSENT');
  const ok = await gw.callTool('disconnect', {
    service: 'github', module: 'repos', provider_account_id: KIT, confirm: true,
  });
  assert.equal(ok.status, 'disconnected');
  assert.deepEqual(rows(store), []);
});

test('a module no connector declares is a connector gap, not a teardown', async () => {
  const { gw } = await createTestGateway();
  const r = await gw.callTool('disconnect', { service: 'github', module: 'nosuchmodule' });
  assert.equal(r.status, 'needs_connector');
});

test('arguments that are not identifiers are refused before anything is read', async () => {
  const { gw } = await shared();
  for (const args of [
    { service: 'github/../x', module: 'repos' },
    { service: 'github', module: '' },
    { service: 'github', module: 'repos', provider_account_id: '' },
    { service: 'github', module: 'repos', confirm: 'yes' },
  ]) {
    const r = await gw.callTool('disconnect', args);
    assert.equal(r.status, 'invalid_arguments', JSON.stringify(args));
  }
});

// --------------------------------------------- findings from the adversarial review

test('a module the policy denies cannot be ended through a sibling that shares its credential', async () => {
  // The policy is written per service and module, and this tool acts on the credential.
  // Calling through a permitted module would otherwise end a denied one. It is this
  // build's own lesson committed again, at a third unit, and caught by review.
  const { gw, store, fake } = await shared({
    policy: {
      roles: ['runtime', 'readonly'],
      default_role: 'runtime',
      rules: [
        { role: 'runtime', op: 'disconnect', module: 'issues', effect: 'deny' },
        { role: '*', effect: 'allow' },
      ],
    },
  });
  const r = await gw.callTool('disconnect', { service: 'github', module: 'repos' });
  assert.equal(r.status, 'denied');
  assert.equal(r.reason, 'bound_module_denied');
  assert.equal(r.module, 'issues');
  assert.equal(rows(store).length, 2);
  assert.equal(await fake.auth.status({ providerAccountId: KIT }), 'ACTIVE',
    'the credential was revoked despite a denied sibling');
});

test('the same call is permitted once no bound module is denied, so the denial above is not blanket', async () => {
  const { gw, store } = await shared({
    policy: {
      roles: ['runtime', 'readonly'],
      default_role: 'runtime',
      rules: [
        { role: 'runtime', op: 'disconnect', module: 'nosuchmodule', effect: 'deny' },
        { role: '*', effect: 'allow' },
      ],
    },
  });
  const r = await gw.callTool('disconnect', {
    service: 'github', module: 'repos', provider_account_id: KIT, confirm: true,
  });
  assert.equal(r.status, 'disconnected');
  assert.deepEqual(rows(store), []);
});

test('an account that reads absent after a FAILED teardown fails closed and removes nothing', async (t) => {
  // providers/AGENTS.md records that ABSENT means absent within the scope this
  // credential can see: a project change or a visibility restriction also answers 404.
  // If the teardown's own final step failed, the two readings cannot be told apart.
  const { gw, store, fake } = await shared();
  fake.auth.setRevokeOutcome({
    supported: true,
    steps: [{ step: 'revoke', status: 200, ok: true }, { step: 'delete', status: 500, ok: false }],
  });
  t.mock.method(fake.auth, 'status', async () => 'ABSENT');
  const r = await gw.callTool('disconnect', {
    service: 'github', module: 'repos', provider_account_id: KIT, confirm: true,
  });
  assert.equal(r.status, 'teardown_incomplete');
  assert.equal(r.reason, 'absent_but_teardown_failed');
  assert.equal(rows(store).length, 2);
});

test('the measured API_KEY case still passes: a refused revoke POST with a successful DELETE', async (t) => {
  // The control for the clause above. Measured at the vendor 2026-09-19: a custom
  // API_KEY toolkit refuses the revoke POST with 400 and the DELETE does the work.
  // Failing closed on any failed step would have broken the case the build cares about.
  const { gw, store, fake } = await shared();
  fake.auth.setRevokeOutcome({
    supported: true,
    steps: [{ step: 'revoke', status: 400, ok: false }, { step: 'delete', status: 200, ok: true }],
  });
  t.mock.method(fake.auth, 'status', async () => 'ABSENT');
  const r = await gw.callTool('disconnect', {
    service: 'github', module: 'repos', provider_account_id: KIT, confirm: true,
  });
  assert.equal(r.status, 'disconnected');
  assert.deepEqual(rows(store), []);
});

test('an adapter that throws is a vendor error, not a missing capability', async () => {
  // Four situations wore one status word until review separated them: a caller told to
  // report a broken connector cannot tell that the right move was to retry.
  const { gw, store, fake } = await shared();
  fake.auth.revoke = async () => { throw new Error('socket hang up'); };
  const r = await gw.callTool('disconnect', {
    service: 'github', module: 'repos', provider_account_id: KIT, confirm: true,
  });
  assert.equal(r.status, 'vendor_error');
  assert.equal(r.method, 'revoke');
  assert.equal(rows(store).length, 2);
});

test('a readonly caller is denied on a module the MANIFEST declares read', async () => {
  // The first version of this test wrote `privilege: 'read'` into a github/repos row,
  // but authorization reads the manifest and that module is declared write, so the
  // pre-existing readonly-plus-write rule denied it and the disconnect-specific rule
  // could have been deleted unnoticed. `github/users` is declared read.
  const { gw, store, fake } = await createTestGateway({ role: 'readonly' });
  fake.auth.setStatus(KIT, 'ACTIVE');
  store.putConnection({
    id: 'conn-users', service: 'github', module: 'users', privilege: 'read',
    provider: 'catalog', provider_account_id: KIT, scopes: [], status: 'ACTIVE',
    created: new Date().toISOString(), updated: new Date().toISOString(),
  });
  const r = await gw.callTool('disconnect', { service: 'github', module: 'users' });
  assert.equal(r.status, 'denied');
  assert.equal(r.rule.op, 'disconnect', 'denied by some other rule than the one for this tool');
  assert.equal(rows(store).length, 1);
});

test('a status answer that overtakes a teardown does not resurrect the row it removed', async (t) => {
  // Before disconnect, nothing removed a row, so this interleaving could not happen.
  // The new tool created it in an old function. connect_status captures the row, awaits
  // the provider, and wrote it back unconditionally.
  const { gw, store, fake } = await shared();
  let removeDuringCheck = null;
  t.mock.method(fake.auth, 'status', async () => {
    if (removeDuringCheck) { removeDuringCheck(); removeDuringCheck = null; }
    return 'ACTIVE';
  });
  removeDuringCheck = () => { store.deleteConnection({ providerAccountId: KIT }); };
  const r = await gw.connectStatus({ service: 'github', module: 'repos' });
  assert.equal(r.status, 'needs_connect');
  assert.equal(r.reason, 'removed_while_checking');
  assert.deepEqual(rows(store), [], 'a revoked credential was given a fresh ACTIVE row');
});

test('an ordinary connect_status still records an ACTIVE grant, so the guard is not refusing everything', async (t) => {
  // Starting from INITIATED and asserting the transition, because starting ACTIVE and
  // counting rows passes whether or not a write happened.
  const { gw, store, fake } = await shared();
  store.putConnection({
    ...store.getConnection({ service: 'github', module: 'repos' }), status: 'INITIATED',
  });
  assert.equal(store.getConnection({ service: 'github', module: 'repos' }).status, 'INITIATED');
  t.mock.method(fake.auth, 'status', async () => 'ACTIVE');
  const r = await gw.connectStatus({ service: 'github', module: 'repos' });
  assert.equal(r.status, 'connected');
  assert.equal(store.getConnection({ service: 'github', module: 'repos' }).status, 'ACTIVE',
    'the guard blocked an ordinary write');
});

// ------------------------------------------- findings from the second review round

test('a bound row whose module no longer resolves is denied, not authorized as privilege-less', async () => {
  // Passing `undefined` privilege made every privilege rule skip, so an admin binding
  // left behind by a retired module sailed past the runtime/admin denial.
  const { gw, store, fake } = await createTestGateway();
  fake.auth.setStatus(KIT, 'ACTIVE');
  for (const [module, privilege] of [['repos', 'write'], ['retired_module', 'admin']]) {
    store.putConnection({
      id: `conn-${module}`, service: 'github', module, privilege,
      provider: 'catalog', provider_account_id: KIT, scopes: [], status: 'ACTIVE',
      created: new Date().toISOString(), updated: new Date().toISOString(),
    });
  }
  const r = await gw.callTool('disconnect', { service: 'github', module: 'repos' });
  assert.equal(r.status, 'denied');
  assert.equal(r.reason, 'bound_module_denied');
  assert.equal(r.module, 'retired_module');
  assert.equal(rows(store).length, 2);
  assert.equal(await fake.auth.status({ providerAccountId: KIT }), 'ACTIVE');
});

test('an adapter reporting no steps has established nothing, so nothing is removed', async (t) => {
  // `{ supported: true, steps: [] }` plus an ABSENT reading deleted every row until the
  // second review round: the original ambiguity returning through the gate built for it.
  const { gw, store, fake } = await shared();
  fake.auth.setRevokeOutcome({ supported: true, steps: [] });
  t.mock.method(fake.auth, 'status', async () => 'ABSENT');
  const r = await gw.callTool('disconnect', {
    service: 'github', module: 'repos', provider_account_id: KIT, confirm: true,
  });
  assert.equal(r.status, 'teardown_incomplete');
  assert.equal(r.reason, 'no_teardown_evidence');
  assert.equal(rows(store).length, 2);
});

test('hydration does not resurrect a credential this process just revoked', async () => {
  // Hydration writes an ACTIVE row for any module of a toolkit lacking its own grant,
  // from a listing it may have captured before the revoke. Checking whether a row
  // exists cannot catch this, because writing missing rows is what hydration is for.
  const { gw, store, fake } = await shared();
  const done = await gw.callTool('disconnect', {
    service: 'github', module: 'repos', provider_account_id: KIT, confirm: true,
  });
  assert.equal(done.status, 'disconnected');
  assert.deepEqual(rows(store), []);

  // A listing that still carries the revoked account, as a delayed response would.
  fake.auth.listAccounts = async () => [{ id: KIT, toolkit: 'GITHUB', status: 'ACTIVE' }];
  await gw.hydrateFromProvider();
  assert.deepEqual(rows(store), [], 'the stale rows this tool removes came straight back');
});

test('hydration still works for an account that was never revoked, so the guard is narrow', async () => {
  const { gw, store, fake } = await createTestGateway();
  fake.auth.listAccounts = async () => [{ id: 'ca_fresh', toolkit: 'GITHUB', status: 'ACTIVE' }];
  await gw.hydrateFromProvider();
  assert.ok(rows(store).length > 0, 'the guard blocked an ordinary hydration');
});

test('a NON-ACTIVE status answer that overtakes a teardown does not resurrect the row either', async (t) => {
  // The first fix guarded only the ACTIVE branch; the other branch wrote the captured
  // record back unconditionally, so a delayed INACTIVE put the deleted row back.
  const { gw, store, fake } = await shared();
  let removeDuringCheck = null;
  t.mock.method(fake.auth, 'status', async () => {
    if (removeDuringCheck) { removeDuringCheck(); removeDuringCheck = null; }
    return 'INACTIVE';
  });
  removeDuringCheck = () => { store.deleteConnection({ providerAccountId: KIT }); };
  const r = await gw.connectStatus({ service: 'github', module: 'repos' });
  assert.equal(r.status, 'needs_connect');
  assert.deepEqual(rows(store), [], 'a removed row was written back with a non-ACTIVE status');
});

test('a non-ACTIVE status still updates an ordinary row, so that guard is narrow too', async (t) => {
  const { gw, store, fake } = await shared();
  t.mock.method(fake.auth, 'status', async () => 'EXPIRED');
  await gw.connectStatus({ service: 'github', module: 'repos' });
  assert.equal(store.getConnection({ service: 'github', module: 'repos' }).status, 'EXPIRED');
});
