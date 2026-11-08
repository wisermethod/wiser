import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { loadConnector } from '../src/manifest.js';
import { matchStandingApproval, maxStandingApprovalDays, STANDING_APPROVAL_DAY_MS as DAY } from '../src/standing-approvals.js';
import { createFakeProviders, createTestGateway, putActive } from './fake-provider.js';

const NOW = Date.parse('2026-11-07T12:00:00Z');
const ROOT = 'Scheduled Work';
const PLAYBOOK = 'scheduled-writes.plan.md';
const GOOGLE = fileURLToPath(new URL('../../connectors/google', import.meta.url));
const LIMIT_WARNING = 'Each send goes out without you seeing it first and cannot be called back.';
const schema = {
  type: 'object', properties: { recipient: { type: 'string' } },
  required: ['recipient'], additionalProperties: false,
};

async function fixture(t, options = {}) {
  t.mock.method(globalThis, 'fetch', async () => assert.fail('offline test attempted network access'));
  const calls = [];
  const actions = Object.fromEntries(['send', 'change', 'delete', 'pay', 'publish', 'grant_access'].map((kind) => [kind, {
    risk: kind === 'delete' ? 'destructive' : 'medium', confirmation: 'always',
    standing_approval: { kind, summary: `${kind.replace('_', ' ')} test items` },
    execution: { prefer: 'proxy' }, input: schema,
  }]));
  actions.unmarked_delete = { risk: 'destructive', confirmation: 'always', input: schema };
  const connector = {
    id: 'probe', service: 'probe', manifest: { modules: { items: {
      auth: { provider: 'catalog', toolkit: 'FAKE_KIT', privilege: 'write' }, actions,
    } } }, impl: { modules: { items: Object.fromEntries(Object.keys(actions).map((name) => [name, async (input) => {
      calls.push({ name, input });
      return { ok: true };
    }])) } },
  };
  const f = await createTestGateway({ session: false, now: () => NOW, connectors: [connector], ...options });
  t.after(() => rmSync(f.home, { recursive: true, force: true }));
  const service = options.connectors ? 'google' : 'probe';
  const module = options.connectors ? (options.module ?? 'gmail') : 'items';
  const record = await putActive(f.store, f.fake, { service, module });
  return { ...f, calls, record, actions };
}

const tool = (f, args) => f.gw.callTool('standing_approvals', args);
const scope = (kinds = ['send', 'change']) => ({
  actions: kinds.map((kind) => `probe.items.${kind}`), root: ROOT, playbook: PLAYBOOK, days: null,
});
const call = (kind, extra = {}) => ({
  action: `probe.items.${kind}`, input: { recipient: 'person@example.com' }, root: ROOT, playbook: PLAYBOOK, ...extra,
});

async function grant(f, args) {
  assert.equal((await tool(f, { ...args, mode: 'propose' })).status, 'standing_approval_proposed');
  const made = await tool(f, { ...args, mode: 'grant', confirmed: true });
  assert.equal(made.status, 'ok', JSON.stringify(made));
  return made.standing_approval;
}

test('a grant retried after its proposal was lost and the grant revoked is refused, not reported as made', async (t) => {
  const f = await fixture(t);
  // Dated, so this file store keeps the revoked row as the hosted store keeps every revoked row; it compacts a
  // revoked no-end one, which is safe here because a local process never hydrates a consumed proposal again.
  const args = { ...scope(['send']), days: 30 };
  assert.equal((await tool(f, { ...args, mode: 'propose' })).status, 'standing_approval_proposed');
  // A host that failed to persist the consumed proposal hydrates it again on the retry.
  const lost = [...f.gw.pendingConfirmations.entries()];
  assert.equal(lost.length, 1);
  const made = await tool(f, { ...args, mode: 'grant', confirmed: true });
  assert.equal(made.status, 'ok');
  assert.equal((await tool(f, { mode: 'revoke', id: made.standing_approval.id })).status, 'ok');
  for (const [key, expiry] of lost) f.gw.pendingConfirmations.set(key, expiry);
  const replay = await tool(f, { ...args, mode: 'grant', confirmed: true });
  assert.deepEqual(replay, { status: 'invalid_arguments', field: 'confirmed', reason: 'revoked' });
  assert.deepEqual((await tool(f, { mode: 'list' })).standing_approvals, []);
  assert.equal((await f.gw.execute(call('send'))).status, 'needs_confirmation');
  assert.deepEqual(f.calls, []);
});

for (const kinds of [['send'], ['change'], ['send', 'change']]) {
  test(`no-end ${kinds.join('+')} Playbook grant persists, matches years later, lists and revokes`, async (t) => {
    const f = await fixture(t);
    const args = { ...scope(kinds), where: { recipient: ['person@example.com'] } };
    const proposal = await tool(f, { ...args, mode: 'propose' });
    assert.equal(proposal.scope.days, null);
    assert.equal(proposal.expires_on, null);
    assert.ok(proposal.warning.includes('No end date: it lasts until you revoke it.'));
    if (kinds.includes('send')) assert.ok(proposal.warning.includes(LIMIT_WARNING));
    else assert.doesNotMatch(proposal.warning, /Each send goes out/);
    assert.ok(!/at most|For \d+ days|until 20\d\d-/.test(proposal.warning));
    const answer = await tool(f, { ...args, mode: 'grant', confirmed: true });
    assert.equal(answer.status, 'ok', 'one yes to the warning grants it');
    const saved = answer.standing_approval;
    assert.equal(saved.expires_at, null);
    assert.ok(answer.summary.includes('no end date, until you revoke it'));
    const journal = readFileSync(`${f.home}/standing-approvals.jsonl`, 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(journal[0].grant.expires_at, null);
    f.gw.now = () => NOW + 10 * 365 * DAY;
    for (const kind of kinds) {
      const ran = await f.gw.callTool('execute', call(kind));
      assert.equal(ran.ok, true);
      assert.deepEqual(ran.standing_approval, { id: saved.id, expires_at: null });
    }
    assert.equal(f.gw.pendingConfirmations.size, 0);
    assert.equal(f.gw.confirmedOnce.size, 0);
    const listed = await tool(f, { mode: 'list' });
    assert.equal(listed.standing_approvals[0].expires_at, null);
    assert.ok(listed.standing_approvals[0].summary.includes('no end date'));
    // Adding a dated grant compacts expired entries but retains the no-end one.
    await grant(f, { actions: ['probe.items.change'], root: ROOT, days: 1 });
    f.gw.now = () => NOW + 11 * 365 * DAY;
    await grant(f, { actions: ['probe.items.change'], root: ROOT, days: 1 });
    assert.equal((await f.gw.standingApprovals.list()).find((g) => g.id === saved.id).expires_at, null);
    assert.equal((await tool(f, { mode: 'revoke', id: saved.id })).status, 'ok');
    assert.equal((await f.gw.standingApprovals.list()).find((g) => g.id === saved.id).revoked_at, new Date(f.gw.now()).toISOString());
    assert.ok(!(await tool(f, { mode: 'list' })).standing_approvals.some((g) => g.id === saved.id));
    // Avoid the separate dated change grant when checking that revocation restores the stop.
    for (const other of (await tool(f, { mode: 'list' })).standing_approvals) await tool(f, { mode: 'revoke', id: other.id });
    assert.equal((await f.gw.callTool('execute', call(kinds[0]))).status, 'needs_confirmation');
  });
}

test('adding a grant compacts revoked no-end send grants and retains active no-end grants', async (t) => {
  const f = await fixture(t);
  const revokedRecipient = 'revoked@example.com';
  const retainedRecipient = 'retained@example.com';
  const saved = await grant(f, { ...scope(['send']), where: { recipient: [revokedRecipient] } });
  const retained = await grant(f, { ...scope(['send']), where: { recipient: [retainedRecipient] } });
  const req = call('send', { input: { recipient: revokedRecipient } });
  assert.equal((await f.gw.callTool('execute', req)).standing_approval.id, saved.id);
  assert.equal((await tool(f, { mode: 'revoke', id: saved.id })).status, 'ok');

  const file = `${f.home}/standing-approvals.jsonl`;
  const before = readFileSync(file, 'utf8');
  const revokedEntries = before.trim().split('\n').map(JSON.parse)
    .filter((entry) => (entry.grant?.id ?? entry.revoke?.id) === saved.id);
  assert.deepEqual(revokedEntries.map((entry) => Object.keys(entry)[0]), ['grant', 'revoke']);
  assert.ok(before.includes(revokedRecipient));
  await tool(f, { mode: 'list' });
  assert.equal(readFileSync(file, 'utf8'), before, 'list must not compact');

  const added = await grant(f, { actions: ['probe.items.change'], root: ROOT, days: 1 });
  const after = readFileSync(file, 'utf8');
  const entries = after.trim().split('\n').map(JSON.parse);
  assert.equal(after.includes(saved.id), false, 'remove both the grant and its revoke');
  assert.equal(after.includes(revokedRecipient), false, 'remove the revoked where values');
  assert.deepEqual(entries.map((entry) => entry.grant?.id ?? entry.revoke?.id), [retained.id, added.id]);
  assert.equal(entries[0].grant.expires_at, null);
  assert.deepEqual(entries[0].grant.where, { recipient: [retainedRecipient] });
  assert.equal((await f.gw.callTool('execute', req)).status, 'needs_confirmation');
  assert.equal(f.calls.length, 1, 'the revoked send must not execute after compaction');
  const ran = await f.gw.callTool('execute', call('send', { input: { recipient: retainedRecipient } }));
  assert.deepEqual(ran.standing_approval, { id: retained.id, expires_at: null });
  assert.equal(f.calls.length, 2);
});

test('null days are published and validated while dated defaults and ceilings stay unchanged', async (t) => {
  const f = await fixture(t);
  assert.deepEqual(f.gw.listTools().find((t) => t.name === 'standing_approvals').inputSchema.properties.days.type, ['integer', 'null']);
  for (const [kinds, playbook, cap, defaults] of [
    [['send'], PLAYBOOK, 90, 90], [['change'], PLAYBOOK, 365, 90],
    [['send', 'change'], PLAYBOOK, 7, 7], [['send', 'change'], undefined, 7, 7],
    [['send'], undefined, 7, 7], [['change'], undefined, 365, 90],
    [['pay'], PLAYBOOK, 7, 7], [['publish'], PLAYBOOK, 7, 7], [['grant_access'], PLAYBOOK, 7, 7],
  ]) {
    assert.equal(maxStandingApprovalDays(kinds, playbook), cap);
    const { days, ...args } = { ...scope(kinds), playbook };
    const proposed = await tool(f, { ...args, mode: 'propose' });
    assert.equal(proposed.scope.days, defaults);
    assert.equal((await tool(f, { ...args, days: cap + 1, mode: 'propose' })).reason, 'max');
    if (cap < 365) assert.equal((await tool(f, { ...args, days: cap, mode: 'propose' })).scope.days, cap);
    if (!playbook || kinds.some((k) => !['send', 'change'].includes(k))) {
      const refused = await tool(f, { ...args, days: null, mode: 'grant', confirmed: true });
      assert.equal(refused.status, 'invalid_arguments');
      assert.equal(refused.field, 'days');
    }
  }
});

test('no-end grants keep warning binding and every scope boundary', async (t) => {
  const f = await fixture(t);
  const args = { ...scope(), where: { recipient: ['person@example.com'] } };
  await tool(f, { ...args, mode: 'propose' });
  const changed = await tool(f, { ...args, days: 7, mode: 'grant', confirmed: true });
  assert.equal(changed.reason, 'unmatched_confirm');
  assert.deepEqual(await f.gw.standingApprovals.list(), []);
  const saved = await grant(f, args);
  for (const extra of [{ playbook: undefined }, { playbook: 'Other' }, { root: 'Other' }, { root: undefined },
    { input: { recipient: 'other@example.com' } }]) {
    assert.equal((await f.gw.callTool('execute', call('send', extra))).status, 'needs_confirmation');
  }
  const matcherCall = { ...call('send'), manifestAction: f.actions.send, providerAccountId: saved.provider_account_id, now: NOW };
  for (const invalid of [{ playbook: null }, { kinds: ['send', 'pay'] }, { kinds: [] }, { heightened: false },
    { created_at: 'invalid' }, { expires_at: undefined }, { revoked_at: new Date(NOW).toISOString() }]) {
    assert.equal(matchStandingApproval([{ ...saved, ...invalid }], matcherCall), null);
  }
  f.actions.send.standing_approval.caution = 'A new caution.';
  assert.equal((await f.gw.callTool('execute', call('send'))).status, 'needs_confirmation');
});

for (const action of ['delete', 'unmarked_delete', 'disguised_delete']) {
  for (const mixed of [false, true]) {
    test(`scope refuses ${action} ${mixed ? 'mixed with sending' : 'alone'} before any confirmation`, async (t) => {
      const f = await fixture(t);
      f.actions.disguised_delete = { ...f.actions.change, risk: 'destructive' };
      f.gw.connectors[0].impl.modules.items.disguised_delete = async () => assert.fail('delete ran');
      for (const mode of ['propose', 'grant']) {
        const refused = await tool(f, { ...scope(mixed ? ['send', action] : [action]), mode, ...(mode === 'grant' ? { confirmed: true } : {}) });
        assert.equal(refused.status, 'invalid_arguments');
        assert.match(refused.reason, /Delete actions cannot/);
      }
      assert.equal(f.gw.pendingConfirmations.size, 0);
      assert.deepEqual(await f.gw.standingApprovals.list(), []);
      assert.deepEqual(f.calls, []);
    });
  }
}

test('delete refusal covers module expansion, declaration-only deletes and injected legacy grants', async (t) => {
  const f = await fixture(t);
  f.actions.delete.risk = 'low'; // The declaration alone must refuse it.
  for (const args of [{ actions: ['probe.items.delete'] }, { module: 'probe.items' },
    { actions: ['unknown.items.write', 'probe.items.delete'] }]) {
    assert.match((await tool(f, { ...args, root: ROOT, mode: 'propose' })).reason, /Delete actions cannot/);
  }
  const saved = await grant(f, scope(['change']));
  const injected = { ...saved, actions: ['probe.items.delete'], kinds: ['delete'], summaries: [f.actions.delete.standing_approval.summary], heightened: true, expires_at: new Date(NOW + DAY).toISOString() };
  assert.equal(matchStandingApproval([injected], { ...call('delete'), manifestAction: f.actions.delete,
    providerAccountId: saved.provider_account_id, now: NOW }), null);
  f.actions.change.risk = 'destructive';
  assert.equal((await f.gw.callTool('execute', call('change'))).status, 'needs_confirmation');
});

function curatedRow(kind) {
  return { id: `google.gmail.automatic_${kind}`, tool: `FAKE_AUTOMATIC_${kind.toUpperCase()}`, toolkit: 'GMAIL',
    kind, summary: `${kind} test messages`, key_fields: ['recipient'], input_schema: schema,
    hint: [kind === 'read' ? 'readOnlyHint' : kind === 'delete' ? 'destructiveHint' : 'createHint'] };
}

async function curatedFixture(t, kinds) {
  const rows = kinds.map(curatedRow);
  const fake = createFakeProviders();
  fake.catalog.curated = () => rows;
  for (const row of rows) {
    fake.catalog.setSlug(row.id, row.tool);
    fake.catalog.setResult(row.tool, { ok: true });
  }
  return fixture(t, { fake, connectors: [await loadConnector(GOOGLE)] });
}

for (const kind of ['change', 'send']) {
  test(`curated ${kind} is grantable, matches without a stop and stops after revocation`, async (t) => {
    const f = await curatedFixture(t, [kind]);
    const row = curatedRow(kind);
    const args = { actions: [row.id], root: ROOT, playbook: PLAYBOOK, days: null, where: { recipient: ['person@example.com'] } };
    const req = { ...call(kind), action: row.id };
    assert.equal((await f.gw.callTool('execute', req)).status, 'needs_confirmation');
    const saved = await grant(f, args);
    const ran = await f.gw.callTool('execute', req);
    assert.equal(ran.ok, true);
    assert.deepEqual(ran.standing_approval, { id: saved.id, expires_at: null });
    const lastLine = readFileSync(f.audit.file, 'utf8').trim().split('\n').map(JSON.parse).at(-1);
    assert.equal(lastLine.path, 'catalog');
    assert.equal(lastLine.grant_id, saved.id);
    await tool(f, { mode: 'revoke', id: saved.id });
    assert.equal((await f.gw.callTool('execute', req)).status, 'needs_confirmation');
  });
}

test('curated module grant freezes sends and changes, reads need none and deletes refuse every scope', async (t) => {
  const f = await curatedFixture(t, ['read', 'change', 'send']);
  const saved = await grant(f, { module: 'google.gmail', root: ROOT, playbook: PLAYBOOK, days: null });
  assert.ok(saved.actions.includes(curatedRow('send').id));
  assert.ok(saved.actions.includes(curatedRow('change').id));
  assert.ok(!saved.actions.includes(curatedRow('read').id));
  assert.equal((await f.gw.callTool('execute', { ...call('send'), action: curatedRow('send').id })).standing_approval.id, saved.id);
  const read = await f.gw.callTool('execute', { ...call('read'), action: curatedRow('read').id });
  assert.equal(read.ok, true);
  assert.ok(!Object.hasOwn(read, 'standing_approval'));
  const d = await curatedFixture(t, ['delete', 'send']);
  for (const mode of ['propose', 'grant']) for (const args of [
    { actions: [curatedRow('delete').id] }, { actions: [curatedRow('send').id, curatedRow('delete').id] }, { module: 'google.gmail' },
  ]) {
    const refused = await tool(d, { ...args, root: ROOT, mode, ...(mode === 'grant' ? { confirmed: true } : {}) });
    assert.match(refused.reason, /Delete actions cannot/);
  }
  assert.deepEqual(await d.gw.standingApprovals.list(), []);
});

test('Calendar create and update share a send grant, with or without attendee notifications', async (t) => {
  const f = await fixture(t, { connectors: [await loadConnector(GOOGLE)], module: 'calendar' });
  const calls = [];
  f.fake.auth.proxy = async (request) => { calls.push(request); return { status: 200, data: { id: 'event-fake' } }; };
  const actions = ['create_event', 'update_event'].map((name) => `google.calendar.${name}`);
  for (const name of ['create_event', 'update_event']) assert.equal(f.connectors[0].manifest.modules.calendar.actions[name].standing_approval.kind, 'send');
  const saved = await grant(f, { actions, root: ROOT, playbook: PLAYBOOK, days: null, where: { calendar_id: ['primary'] } });
  for (const notify_guests of [true, false]) for (const action of actions) {
    const input = action.endsWith('.create_event')
      ? { calendar_id: 'primary', summary: 'Scheduled meeting', start: '2026-11-08', end: '2026-11-09' }
      : { calendar_id: 'primary', event_id: 'event-fake', summary: 'Updated meeting' };
    const ran = await f.gw.callTool('execute', { action, input: { ...input, attendees: ['person@example.com'], notify_guests }, root: ROOT, playbook: PLAYBOOK });
    assert.equal(ran.id, 'event-fake', JSON.stringify(ran));
    assert.equal(ran.status, undefined);
    assert.equal(ran.standing_approval.id, saved.id);
    assert.ok(calls.at(-1).endpoint.includes(`sendUpdates=${notify_guests ? 'all' : 'none'}`));
  }
  assert.equal(calls.length, 4);
  assert.equal(f.gw.pendingConfirmations.size, 0);
});
