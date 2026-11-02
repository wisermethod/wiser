import { test } from 'node:test';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConnectionGateway, PENDING_CONFIRMATION_TTL_MS, buildStandingApprovalWarning, confirmationDigest, createStandingApprovals, matchStandingApproval, validateArgs } from '../src/gateway.js';
import { loadConnector } from '../src/manifest.js';
import { STANDING_APPROVAL_DAY_MS } from '../src/standing-approvals.js';
import { JsonFileStore } from '../src/store.js';
import { StatusSignal } from '../src/errors.js';
import { createTestGateway, makeHome } from './fake-provider.js';

const TWENTY = fileURLToPath(new URL('../../connectors/twenty', import.meta.url));
const NOW = Date.parse('2026-10-22T12:00:00.000Z');
const UUID = '11111111-1111-4111-8111-111111111111';
const CREATE = 'twenty.records.create';
const UPDATE = 'twenty.records.update';
const INPUT = { object: 'person', data: { name: 'Example' } };
const SCOPE = { actions: [CREATE], root: 'wiser-memory' };
const CALL = { action: CREATE, input: INPUT, root: SCOPE.root };

function put(f, label, extra = {}) {
  const record = f.store.putConnection({
    service: 'twenty', module: 'records', label, privilege: 'admin', provider: 'catalog',
    provider_account_id: `account-${label ?? 'default'}`, status: 'ACTIVE', scopes: [], ...extra,
  });
  f.fake.auth.setStatus(record.provider_account_id, record.status);
  return record;
}

async function fixture(t, options = {}) {
  const connectors = options.connectors || [await loadConnector(TWENTY)];
  const f = await createTestGateway({ session: false, now: () => NOW, ...options, connectors });
  t.after(() => rmSync(f.home, { recursive: true, force: true }));
  if (!options.policy) {
    f.gw.policy = { ...f.policy, rules: [
      { role: 'runtime', service: 'twenty', privilege: 'admin', op: 'execute', effect: 'allow' },
      ...f.policy.rules,
    ] };
  }
  f.calls = [];
  // Keep the real Twenty implementation; count entry into the module, not its HTTP calls.
  f.gw.connectors = connectors.map((connector) => ({
    ...connector,
    impl: { modules: Object.fromEntries(Object.entries(connector.impl.modules).map(([module, actions]) => [
      module, Object.fromEntries(Object.entries(actions).map(([action, fn]) => [action, async (input, ctx) => {
        f.calls.push({ input, ctx });
        if (Object.hasOwn(f, 'result')) {
          if (f.result instanceof StatusSignal) throw f.result;
          return f.result;
        }
        return fn(input, ctx);
      }])),
    ])) },
  }));
  f.fake.auth.proxy = async () => ({ status: 200, data: { data: { createPerson: { id: UUID }, updatePerson: { id: UUID } } } });
  put(f);
  return f;
}

function tool(f, args) {
  return f.gw.callTool('standing_approvals', args);
}

async function grant(f, args = SCOPE) {
  const proposal = await tool(f, { ...args, mode: 'propose' });
  assert.equal(proposal.status, 'standing_approval_proposed', JSON.stringify(proposal));
  const answer = await tool(f, { ...args, mode: 'grant', confirmed: true });
  assert.equal(answer.status, 'ok', JSON.stringify(answer));
  return answer.standing_approval;
}

function auditLines(f) {
  return readFileSync(f.audit.file, 'utf8').trim().split('\n').map(JSON.parse);
}

/** A marked send and an unmarked write prove the boundaries a real manifest cannot. */
async function probe(t, { confirmation = 'always', kind = 'send' } = {}) {
  const root = makeHome();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dir = join(root, 'probe');
  mkdirSync(dir);
  const action = {
    risk: 'low', confirmation, execution: { prefer: 'proxy' },
    input: { type: 'object', properties: {
      object: { type: 'string' }, channel: { type: 'string' }, payload: { type: 'object' },
    }, additionalProperties: false },
  };
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({
    id: 'probe', service: 'probe', modules: { items: {
      auth: { provider: 'catalog', toolkit: 'FAKE_KIT', scheme: 'API_KEY', privilege: 'write' },
      actions: {
        marked: { ...action, standing_approval: { kind, summary: 'send messages' } },
        unmarked: action,
      },
    } },
  }));
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  writeFileSync(join(dir, 'index.js'), 'export const modules = { items: { marked: async () => ({ ok: true }), unmarked: async () => ({ ok: true }) } };');
  const f = await fixture(t, { connectors: [await loadConnector(dir)] });
  put(f, undefined, { service: 'probe', module: 'items' });
  f.scope = { module: 'probe.items', root: SCOPE.root };
  f.call = { action: 'probe.items.marked', input: { object: 'person' }, root: SCOPE.root };
  return f;
}

test('propose, grant and execute use one warning and one module call, with audit and result stamps', async (t) => {
  const f = await fixture(t);
  const proposal = await tool(f, { ...SCOPE, mode: 'propose' });
  assert.equal(proposal.status, 'standing_approval_proposed');
  assert.equal(Object.hasOwn(proposal, 'reason'), false);
  assert.equal(proposal.expires_on, '2027-01-20');
  assert.equal(f.gw.pendingConfirmations.has(confirmationDigest(['standing_approval', proposal.scope, proposal.warning])), true);
  assert.equal((await f.gw.standingApprovals.list()).length, 0);
  const answer = await tool(f, { ...SCOPE, mode: 'grant', confirmed: true });
  const saved = answer.standing_approval;
  assert.match(saved.id, /^sa_[0-9a-f]{32}$/);
  assert.deepEqual(Object.keys(saved).sort(), [
    'id', 'service', 'module', 'actions', 'module_wide', 'label', 'provider_account_id', 'root', 'playbook', 'where',
    'summaries', 'cautions', 'kinds', 'heightened', 'created_at', 'expires_at', 'revoked_at',
  ].sort());
  // The plain words the person was warned with travel on the grant, so a list reads the same way.
  assert.deepEqual(saved.summaries, ['create records in Twenty']);
  assert.match(answer.summary, /^Lets your assistant create records in Twenty on your connection /);
  assert.equal(answer.summary.includes(saved.id), false);
  assert.equal(saved.expires_at, '2027-01-20T12:00:00.000Z');
  assert.equal(saved.label, null);
  assert.equal(saved.module_wide, false);
  assert.equal(saved.heightened, false);
  assert.deepEqual(saved.kinds, ['change']);
  const ran = await f.gw.callTool('execute', { ...CALL, playbook: 'Any Playbook' });
  assert.equal(ran.id, UUID);
  assert.deepEqual(ran.standing_approval, { id: saved.id, expires_at: saved.expires_at });
  assert.equal(f.calls.length, 1);
  assert.equal(Object.hasOwn(f.calls[0].ctx, 'root'), false);
  assert.equal(Object.hasOwn(f.calls[0].ctx, 'playbook'), false);
  assert.equal(Object.hasOwn(f.calls[0].input, 'root'), false);
  assert.equal(f.gw.pendingConfirmations.size, 0);
  assert.equal(f.gw.confirmedOnce.size, 0);
  const lines = auditLines(f);
  assert.deepEqual(lines.map((line) => line.op), ['standing_approvals.propose', 'standing_approvals.grant', 'execute']);
  assert.deepEqual(lines.map((line) => line.grant_id), [null, saved.id, saved.id]);
  for (const line of lines) {
    assert.equal(line.service, 'twenty');
    assert.equal(line.module, 'records');
  }
});

for (const name of [
  'another action', 'another label', 'rebound account', 'another root', 'no root',
  'missing playbook', 'another playbook', 'wrong where', 'missing where', 'expired', 'revoked',
]) {
  test(`out of scope: ${name} stops before the module`, async (t) => {
    const f = await fixture(t);
    put(f, 'acme');
    put(f, 'beta');
    const scope = { ...SCOPE, label: 'acme', playbook: 'CRM Work', where: { object: ['person'] } };
    const saved = await grant(f, scope);
    const call = { ...CALL, label: 'acme', playbook: 'CRM Work' };
    if (name === 'another action') { call.action = UPDATE; call.input = { ...INPUT, id: UUID }; }
    if (name === 'another label') call.label = 'beta';
    if (name === 'rebound account') put(f, 'acme', { provider_account_id: 'another-account' });
    if (name === 'another root') call.root = 'another-root';
    if (name === 'no root') delete call.root;
    if (name === 'missing playbook') delete call.playbook;
    if (name === 'another playbook') call.playbook = 'Other Work';
    if (name === 'wrong where') call.input = { object: 'company', data: {} };
    // The fixture's channel is optional, so absence reaches the matcher.
    if (name === 'missing where') {
      const p = await probe(t);
      await grant(p, { ...p.scope, where: { channel: ['email'] } });
      assert.equal((await p.gw.callTool('execute', p.call)).status, 'needs_confirmation');
      assert.equal(p.calls.length, 0);
      return;
    }
    if (name === 'expired') f.gw.now = () => Date.parse(saved.expires_at);
    if (name === 'revoked') assert.equal((await tool(f, { mode: 'revoke', id: saved.id })).status, 'ok');
    const stop = await f.gw.callTool('execute', call);
    assert.equal(stop.status, 'needs_confirmation');
    assert.equal(f.calls.length, 0);
    assert.equal(auditLines(f).at(-1).grant_id, null);
  });
}

test('a module grant freezes eligible actions and never covers an unmarked action', async (t) => {
  const f = await probe(t);
  const saved = await grant(f, f.scope);
  assert.equal(saved.module_wide, true);
  assert.deepEqual(saved.actions, ['probe.items.marked']);
  assert.equal((await f.gw.callTool('execute', { ...f.call, action: 'probe.items.unmarked' })).status, 'needs_confirmation');
  assert.equal(f.calls.length, 0);
  const definitions = f.gw.connectors[0].manifest.modules.items.actions;
  definitions.unmarked.standing_approval = { kind: 'change', summary: 'change things' };
  assert.equal((await f.gw.callTool('execute', { ...f.call, action: 'probe.items.unmarked' })).status, 'needs_confirmation');
  delete definitions.marked.standing_approval;
  assert.equal((await f.gw.callTool('execute', f.call)).status, 'needs_confirmation');
  assert.equal(f.calls.length, 0);
});

test('a module proposal expands just the two Twenty actions, and canonicalizes the scope', async (t) => {
  const f = await fixture(t);
  const saved = await grant(f, { module: 'twenty.records', root: SCOPE.root, where: { object: ['person', 'company'] } });
  assert.deepEqual(saved.actions, [CREATE, UPDATE]);
  assert.deepEqual(saved.where, { object: ['company', 'person'] });
  assert.equal((await f.gw.callTool('execute', { action: UPDATE, root: SCOPE.root, input: { ...INPUT, id: UUID } })).id, UUID);
});

for (const change of ['no proposal', 'root', 'days', 'where', 'used', 'false', 'missing confirmed', 'account', 'expired proposal']) {
  test(`grant binding: ${change} creates nothing`, async (t) => {
    const f = await fixture(t);
    const scope = { ...SCOPE, where: { object: ['person'] } };
    if (change !== 'no proposal') await tool(f, { ...scope, mode: 'propose' });
    const args = { ...scope, mode: 'grant', confirmed: true };
    if (change === 'root') args.root = 'other-root';
    if (change === 'days') args.days = 89;
    if (change === 'where') args.where = { object: ['person', 'company'] };
    if (change === 'account') put(f, undefined, { provider_account_id: 'rebound' });
    if (change === 'false') args.confirmed = false;
    if (change === 'missing confirmed') delete args.confirmed;
    if (change === 'expired proposal') f.gw.now = () => NOW + PENDING_CONFIRMATION_TTL_MS;
    if (change === 'used') assert.equal((await tool(f, args)).status, 'ok');
    const before = (await f.gw.standingApprovals.list()).length;
    const result = await tool(f, args);
    assert.equal(result.status, 'standing_approval_proposed');
    assert.equal(result.reason, ['false', 'missing confirmed'].includes(change) ? undefined : 'unmatched_confirm');
    assert.equal((await f.gw.standingApprovals.list()).length, before);
    assert.equal(f.calls.length, 0);
  });
}

test('canonical order shares a proposal and a host can hydrate its pending map', async (t) => {
  const f = await fixture(t);
  const args = { actions: [UPDATE, CREATE, CREATE], root: SCOPE.root, where: { object: ['person', 'company'] } };
  await tool(f, { ...args, mode: 'propose' });
  const host = new ConnectionGateway({ ...f.gw, pendingConfirmations: f.gw.pendingConfirmations });
  const result = await host.callTool('standing_approvals', {
    actions: [CREATE, UPDATE], root: SCOPE.root, where: { object: ['company', 'person'] }, mode: 'grant', confirmed: true,
  });
  assert.equal(result.status, 'ok');
  assert.equal(f.gw.pendingConfirmations.size, 0);
});

test('durations enforce 365 and seven day maxima and choose the right defaults', async (t) => {
  const f = await fixture(t);
  // This send grant names no Playbook, so the 90-day send-only exception cannot apply.
  const p = await probe(t);
  for (const [instance, args, days] of [[f, SCOPE, 366], [p, p.scope, 8]]) {
    const refused = await tool(instance, { ...args, mode: 'propose', days });
    assert.equal(refused.status, 'invalid_arguments');
    assert.equal(refused.field, 'days');
    assert.equal(refused.reason, 'max');
  }
  const ordinary = await grant(f);
  const heightened = await grant(p, p.scope);
  assert.equal(Date.parse(ordinary.expires_at) - NOW, 90 * STANDING_APPROVAL_DAY_MS);
  assert.equal(Date.parse(heightened.expires_at) - NOW, 7 * STANDING_APPROVAL_DAY_MS);
  assert.equal(heightened.heightened, true);
  assert.deepEqual(heightened.kinds, ['send']);
  assert.equal((await grant(f, { ...SCOPE, days: 365 })).expires_at, '2027-10-22T12:00:00.000Z');
  // One day reads as a day, so the warning a person approves is grammatical at the smallest grant.
  const oneDay = await tool(f, { ...SCOPE, mode: 'propose', days: 1 });
  assert.match(oneDay.warning, / For 1 day, until 2026-10-23, /);
});

const SEND_PLAYBOOK = '2026-10-22-send-messages.plan.md';
const SEND_CAUTION = 'These messages may start a workflow.';

test('proposal cap: a send-only Playbook grant accepts 90 days', async (t) => {
  const f = await probe(t);
  const saved = await grant(f, { ...f.scope, playbook: SEND_PLAYBOOK, days: 90 });
  assert.equal(Date.parse(saved.expires_at) - Date.parse(saved.created_at), 90 * STANDING_APPROVAL_DAY_MS);
});

test('a send-only Playbook proposal defaults to 90 days, grants with 90 and matches through its last day', async (t) => {
  const f = await probe(t);
  const scope = { ...f.scope, playbook: SEND_PLAYBOOK };
  const proposal = await tool(f, { ...scope, mode: 'propose' });
  assert.equal(proposal.status, 'standing_approval_proposed');
  assert.equal(proposal.scope.days, 90);
  assert.equal(proposal.expires_on, '2027-01-20');
  assert.equal(proposal.heightened, true);
  assert.deepEqual(proposal.kinds, ['send']);
  // An explicit 90 is the same canonical scope as the proposed default.
  const answer = await tool(f, { ...scope, days: 90, mode: 'grant', confirmed: true });
  assert.equal(answer.status, 'ok');
  const saved = answer.standing_approval;
  assert.equal(Date.parse(saved.expires_at) - Date.parse(saved.created_at), 90 * STANDING_APPROVAL_DAY_MS);
  const call = { ...f.call, playbook: SEND_PLAYBOOK };
  for (const at of [NOW, Date.parse(saved.expires_at) - 1]) {
    f.gw.now = () => at;
    assert.equal((await f.gw.callTool('execute', call)).standing_approval?.id, saved.id);
  }
  assert.equal(f.calls.length, 2);
  assert.equal(auditLines(f).at(-1).grant_id, saved.id);
});

for (const name of [
  'another playbook', 'missing playbook', 'another root', 'another label', 'rebound account',
  'expired', 'revoked', 'changed summary', 'changed caution', 'another action', 'wrong where', 'missing where',
]) {
  test(`a 90-day send-only Playbook grant refuses ${name} before the module`, async (t) => {
    const f = await probe(t);
    const actions = f.gw.connectors[0].manifest.modules.items.actions;
    actions.marked.standing_approval.caution = SEND_CAUTION;
    put(f, 'acme', { service: 'probe', module: 'items' });
    // Keep the account identical so the label test cannot pass through the account check alone.
    put(f, 'beta', { service: 'probe', module: 'items', provider_account_id: 'account-acme' });
    const saved = await grant(f, {
      ...f.scope, label: 'acme', playbook: SEND_PLAYBOOK, days: 90, where: { channel: ['email'] },
    });
    const call = { ...f.call, label: 'acme', playbook: SEND_PLAYBOOK, input: { ...f.call.input, channel: 'email' } };
    if (name === 'another playbook') call.playbook = 'Other Work';
    if (name === 'missing playbook') delete call.playbook;
    if (name === 'another root') call.root = 'another-root';
    if (name === 'another label') call.label = 'beta';
    if (name === 'rebound account') put(f, 'acme', { service: 'probe', module: 'items', provider_account_id: 'another-account' });
    if (name === 'expired') f.gw.now = () => Date.parse(saved.expires_at);
    if (name === 'revoked') assert.equal((await tool(f, { mode: 'revoke', id: saved.id })).status, 'ok');
    if (name === 'changed summary') actions.marked.standing_approval.summary = 'send different messages';
    if (name === 'changed caution') actions.marked.standing_approval.caution = 'A different caution.';
    if (name === 'another action') {
      actions.unmarked.standing_approval = { ...actions.marked.standing_approval };
      call.action = 'probe.items.unmarked';
    }
    if (name === 'wrong where') call.input.channel = 'sms';
    if (name === 'missing where') delete call.input.channel;
    const stop = await f.gw.callTool('execute', call);
    assert.equal(stop.status, 'needs_confirmation');
    assert.equal(Object.hasOwn(stop, 'standing_approval'), false);
    assert.equal(f.calls.length, 0);
    assert.equal(auditLines(f).at(-1).grant_id, null);
  });
}

for (const [kinds, playbook, days] of [
  [['send'], undefined, 8], [['send'], SEND_PLAYBOOK, 91],
  [['delete'], undefined, 8], [['delete'], SEND_PLAYBOOK, 8],
  [['pay'], undefined, 8], [['pay'], SEND_PLAYBOOK, 8],
  [['publish'], SEND_PLAYBOOK, 8], [['grant_access'], SEND_PLAYBOOK, 8],
  [['send', 'change'], SEND_PLAYBOOK, 8],
]) {
  test(`proposal cap: ${kinds.join('+')} ${playbook ? 'with' : 'without'} a Playbook refuses ${days} days`, async (t) => {
    const f = await probe(t, { kind: kinds[0] });
    if (kinds.length > 1) {
      f.gw.connectors[0].manifest.modules.items.actions.unmarked.standing_approval = {
        kind: kinds[1], summary: 'change things',
      };
    }
    const scope = { ...f.scope, ...(playbook ? { playbook } : {}) };
    const refused = await tool(f, { ...scope, days, mode: 'propose' });
    assert.deepEqual(refused, { status: 'invalid_arguments', field: 'days', reason: 'max' });
    assert.equal(f.gw.pendingConfirmations.size, 0);
    assert.deepEqual(await f.gw.standingApprovals.list(), []);
    assert.equal(f.calls.length, 0);
    if (days === 8) {
      const defaulted = await tool(f, { ...scope, mode: 'propose' });
      assert.equal(defaulted.scope.days, 7);
      const saved = await grant(f, { ...scope, days: 7 });
      assert.equal((await f.gw.callTool('execute', { ...f.call, ...(playbook ? { playbook } : {}) })).standing_approval?.id, saved.id);
    }
  });
}

for (const [name, kinds, playbook, lifetime, currentKind = kinds[0]] of [
  ['unscoped send at 30 days', ['send'], null, 30 * STANDING_APPROVAL_DAY_MS],
  ['Playbook send at 91 days', ['send'], SEND_PLAYBOOK, 91 * STANDING_APPROVAL_DAY_MS],
  ['Playbook delete+send at 30 days', ['delete', 'send'], SEND_PLAYBOOK, 30 * STANDING_APPROVAL_DAY_MS, 'send'],
  ['Playbook send+change at 30 days on send', ['send', 'change'], SEND_PLAYBOOK, 30 * STANDING_APPROVAL_DAY_MS],
  ['Playbook send+change at 30 days on change', ['send', 'change'], SEND_PLAYBOOK, 30 * STANDING_APPROVAL_DAY_MS, 'change'],
  ['Playbook send one millisecond over 90 days', ['send'], SEND_PLAYBOOK, 90 * STANDING_APPROVAL_DAY_MS + 1],
  ['Playbook send at zero lifetime', ['send'], SEND_PLAYBOOK, 0],
  ['Playbook send at negative lifetime', ['send'], SEND_PLAYBOOK, -1],
]) {
  test(`stored lifetime: ${name} cannot match`, async (t) => {
    const f = await probe(t, { kind: currentKind });
    const base = await grant(f, { ...f.scope, days: 7 });
    await tool(f, { mode: 'revoke', id: base.id });
    // Bypass proposal validation. Expiry remains in the future even for zero/negative
    // lifetimes, so the lifetime check itself must reject these records.
    const expiresAt = NOW + 100 * STANDING_APPROVAL_DAY_MS;
    const stored = {
      ...base, id: 'sa_stored_lifetime', kinds, playbook,
      created_at: new Date(expiresAt - lifetime).toISOString(), expires_at: new Date(expiresAt).toISOString(),
    };
    await f.gw.standingApprovals.add(stored);
    assert.ok((await f.gw.standingApprovals.list()).some((row) => row.id === stored.id && !row.revoked_at));
    // Supplying a Playbook on the call must never extend an unscoped stored grant.
    const stop = await f.gw.callTool('execute', { ...f.call, playbook: SEND_PLAYBOOK });
    assert.equal(stop.status, 'needs_confirmation');
    assert.equal(f.calls.length, 0);
    assert.equal(auditLines(f).at(-1).grant_id, null);
  });
}

test('stored lifetime: a 90-day send-only Playbook record matches independently of proposal validation', async (t) => {
  const f = await probe(t);
  const base = await grant(f, { ...f.scope, days: 7 });
  await tool(f, { mode: 'revoke', id: base.id });
  const stored = {
    ...base, id: 'sa_stored_send_playbook', playbook: SEND_PLAYBOOK,
    // Duplicate kinds still have the distinct kinds ["send"].
    kinds: ['send', 'send'], expires_at: new Date(NOW + 90 * STANDING_APPROVAL_DAY_MS).toISOString(),
  };
  await f.gw.standingApprovals.add(stored);
  const call = { ...f.call, playbook: SEND_PLAYBOOK };
  assert.equal((await f.gw.callTool('execute', call)).standing_approval?.id, stored.id);
  assert.equal(f.calls.length, 1);
  const manifestAction = f.gw.connectors[0].manifest.modules.items.actions.marked;
  for (const attachments of [[], null, ['invented-file']]) {
    assert.equal(matchStandingApproval([stored], {
      ...call, manifestAction: { ...manifestAction, input_files: { field: 'attachments', max_bytes: 100 } },
      input: { ...call.input, attachments }, providerAccountId: stored.provider_account_id, now: NOW,
    }), null);
  }
});

for (const limited of [false, true]) {
  test(`the send-only Playbook warning is exact ${limited ? 'with' : 'without'} where limits and carries a shared caution once`, async (t) => {
    const f = await probe(t);
    const actions = f.gw.connectors[0].manifest.modules.items.actions;
    actions.marked.standing_approval.caution = SEND_CAUTION;
    actions.unmarked.standing_approval = { kind: 'send', summary: 'send other messages', caution: SEND_CAUTION };
    const scope = { ...f.scope, playbook: SEND_PLAYBOOK, ...(limited ? { where: { channel: ['email'] } } : {}) };
    const proposal = await tool(f, { ...scope, mode: 'propose' });
    assert.equal(proposal.scope.days, 90);
    assert.deepEqual(proposal.kinds, ['send']);
    const expected = `This standing approval lets your assistant send messages and send other messages on your connection with no label without asking you first, for work done from the root "wiser-memory", in the Playbook "2026-10-22-send-messages.plan.md"${limited ? ', and only where channel is "email"' : ''}. For 90 days, until 2027-01-20, every call that matches runs straight away, with no approval step for you to see or refuse. Anything outside it still asks you, as today. These messages may start a workflow. This approval sends messages to other people, ${limited ? 'to any recipient the limits above allow' : 'to any recipient'}, and nobody looks at each one before it is sent; once sent, a message cannot be called back. Because it covers only sending, and only in one Playbook, it lasts at most 90 days. You can end it at any time: ask your assistant to revoke it, or remove it on your Wiser account page. Answer yes to grant it, or no to leave things as they are.`;
    assert.equal(proposal.warning, expected);
    assert.equal(proposal.warning.split(SEND_CAUTION).length - 1, 1);
    const saved = await grant(f, scope);
    assert.deepEqual(saved.cautions, [SEND_CAUTION]);
  });
}

for (const [where, reason] of [
  [{ object: ['sk-canary-private'] }, 'credential_like'],
  [{ object: ['a\u2060b'] }, 'unsafe'],
  [{ object: ['a\n'] }, 'unsafe'],
  [{ object: ['person', 'person'] }, 'duplicate'],
  [{ data: ['person'] }, 'not_declared'],
  [{ missing: ['person'] }, 'not_declared'],
]) {
  test(`where validation refuses ${reason}: ${Object.keys(where)[0]}`, async (t) => {
    const f = await fixture(t);
    const result = await tool(f, { ...SCOPE, where, mode: 'propose' });
    assert.equal(result.status, 'invalid_arguments');
    assert.equal(result.reason, reason);
    assert.equal(result.field, `where.${Object.keys(where)[0]}`);
    assert.equal(f.gw.pendingConfirmations.size, 0);
  });
}

test('where must be declared as a string by every covered action', async (t) => {
  const f = await fixture(t);
  const result = await tool(f, { actions: [CREATE, UPDATE], root: SCOPE.root, where: { id: [UUID] }, mode: 'propose' });
  assert.equal(result.status, 'invalid_arguments');
  assert.equal(result.field, 'where.id');
  assert.equal(result.reason, 'not_declared');
});

test('readonly is denied every writing mode by policy and may list', async (t) => {
  const f = await fixture(t, { role: 'readonly' });
  for (const mode of ['propose', 'grant', 'revoke']) {
    const result = await tool(f, { ...SCOPE, mode, id: 'absent' });
    assert.equal(result.status, 'denied');
    assert.equal(result.rule.op, 'standingApproval');
  }
  assert.deepEqual(await tool(f, { mode: 'list' }), { status: 'ok', standing_approvals: [] });
  assert.equal(auditLines(f).length, 4);
});

test('list is oldest first, excludes ended grants, and revoke persists exactly once', async (t) => {
  const f = await fixture(t);
  const first = await grant(f);
  f.gw.now = () => NOW + 1000;
  const second = await grant(f);
  const expired = { ...first, id: 'sa_expired', expires_at: new Date(NOW).toISOString() };
  await f.gw.standingApprovals.add(expired);
  const listed = await tool(f, { mode: 'list' });
  assert.deepEqual(listed.standing_approvals.map((item) => item.id), [first.id, second.id]);
  assert.equal(listed.standing_approvals.every((item) => typeof item.summary === 'string' && !item.summary.includes('\n')), true);
  const revoked = await tool(f, { mode: 'revoke', id: first.id });
  assert.equal(revoked.revoked.revoked_at, '2026-10-22T12:00:01.000Z');
  assert.equal(auditLines(f).at(-1).grant_id, first.id);
  assert.equal((await f.gw.standingApprovals.list()).some((item) => item.id === first.id && item.revoked_at), true);
  assert.deepEqual((await tool(f, { mode: 'list' })).standing_approvals.map((item) => item.id), [second.id]);
  for (const id of [first.id, expired.id, 'sa_unknown']) {
    assert.deepEqual(await tool(f, { mode: 'revoke', id }), { status: 'invalid_arguments', field: 'id', reason: 'not_found' });
  }
});

test('the default adapter persists grants and revocation across gateway instances in a 0600 store', async (t) => {
  const first = await fixture(t);
  const saved = await grant(first);
  const second = await fixture(t, { home: first.home });
  assert.equal((await tool(second, { mode: 'list' })).standing_approvals[0].id, saved.id);
  assert.equal((await second.gw.callTool('execute', CALL)).standing_approval.id, saved.id);
  await tool(second, { mode: 'revoke', id: saved.id });
  const third = await fixture(t, { home: first.home });
  assert.deepEqual((await tool(third, { mode: 'list' })).standing_approvals, []);
  assert.equal((await third.gw.callTool('execute', CALL)).status, 'needs_confirmation');
  assert.equal(statSync(join(first.home, 'standing-approvals.jsonl')).mode & 0o777, 0o600);
  assert.equal((await first.gw.callTool('execute', CALL)).status, 'needs_confirmation');
});

test('the exported adapter keeps grants separate and prunes on add using a movable clock', async (t) => {
  const f = await fixture(t);
  writeFileSync(f.store.file, JSON.stringify({ userId: null, connections: f.store.listConnections() }));
  assert.equal(Object.hasOwn(new JsonFileStore(f.home).read(), 'standing_approvals'), false);
  const saved = await grant(f, { ...SCOPE, days: 1 });
  let at = NOW;
  const adapter = createStandingApprovals(f.store.home, () => at);
  await adapter.revoke(saved.id, new Date(at).toISOString());
  assert.equal((await adapter.list()).length, 1);
  at += STANDING_APPROVAL_DAY_MS;
  await adapter.add({ ...saved, id: 'sa_next', expires_at: new Date(at + 1000).toISOString() });
  assert.deepEqual((await adapter.list()).map((row) => row.id), ['sa_next']);
  assert.equal(readFileSync(join(f.home, 'standing-approvals.jsonl'), 'utf8').includes(saved.id), false);
  at += 1000;
  assert.equal(await adapter.revoke('sa_absent', new Date(at).toISOString()), null);
  assert.equal(Object.hasOwn(f.store.read(), 'standing_approvals'), false);
  await assert.rejects(() => adapter.add({ ...saved, root: 'sk-must-not-store', expires_at: new Date(at + 1000).toISOString() }), /credential-shaped/);
});

test('a host adapter supplied to the constructor owns grant storage', async (t) => {
  const f = await fixture(t);
  const rows = [];
  const adapter = {
    async list() { return rows; },
    async add(row) { rows.push(row); },
    async revoke(id, at) { const row = rows.find((item) => item.id === id); row.revoked_at = at; return row; },
  };
  f.gw = new ConnectionGateway({ ...f.gw, standingApprovals: adapter });
  const saved = await grant(f);
  assert.equal(rows[0].id, saved.id);
  assert.equal(Object.hasOwn(f.store.read(), 'standing_approvals'), false);
  assert.equal((await f.gw.callTool('execute', CALL)).standing_approval.id, saved.id);
  await tool(f, { mode: 'revoke', id: saved.id });
  assert.ok(rows[0].revoked_at);
});

const ORDINARY_WARNING = 'This standing approval lets your assistant create records in Twenty and change fields on existing Twenty records on your connection labelled "acme" without asking you first, for work done from the root "wiser-memory", in the Playbook "CRM Work", and only where id is "id-a" or "id-b", and only where object is "company" or "person". For 90 days, until 2027-01-20, every call that matches runs straight away, with no approval step for you to see or refuse. Anything outside it still asks you, as today. You can end it at any time: ask your assistant to revoke it, or remove it on your Wiser account page. Answer yes to grant it, or no to leave things as they are.';
const HEIGHTENED_WARNING = 'This standing approval lets your assistant send messages on your connection with no label without asking you first, for work done from the root "wiser-memory". For 7 days, until 2026-10-29, every call that matches runs straight away, with no approval step for you to see or refuse. Anything outside it still asks you, as today. Some of these actions delete things, send messages to other people, spend money, publish where others can see and give someone access. Under this approval nobody looks at each one before it happens, and once done it cannot be called back. It lasts at most 7 days. You can end it at any time: ask your assistant to revoke it, or remove it on your Wiser account page. Answer yes to grant it, or no to leave things as they are.';

test('the ordinary and heightened warnings are exactly the fixed text', async (t) => {
  const f = await fixture(t);
  const manifest = f.gw.connectors[0].manifest;
  const summaries = [CREATE, UPDATE].map((id) => manifest.modules.records.actions[id.split('.')[2]].standing_approval.summary);
  assert.equal(buildStandingApprovalWarning({
    scope: { label: 'acme', root: SCOPE.root, playbook: 'CRM Work', days: 90, where: { object: ['company', 'person'], id: ['id-a', 'id-b'] } },
    summaries, kinds: ['change'], heightened: false, expiresOn: '2027-01-20',
  }), ORDINARY_WARNING);
  assert.equal(buildStandingApprovalWarning({
    scope: { label: null, root: SCOPE.root, playbook: null, where: null, days: 7 }, summaries: ['send messages'],
    kinds: ['grant_access', 'publish', 'pay', 'send', 'delete'], heightened: true, expiresOn: '2026-10-29',
  }), HEIGHTENED_WARNING);
});

test('audit has a null grant on ordinary execution and never stores warnings or where values', async (t) => {
  const f = await fixture(t);
  const value = 'scopeCanary493';
  const proposal = await tool(f, { ...SCOPE, where: { object: [value] }, mode: 'propose' });
  const saved = (await tool(f, { ...SCOPE, where: { object: [value] }, mode: 'grant', confirmed: true })).standing_approval;
  await f.gw.callTool('execute', CALL);
  await tool(f, { mode: 'list' });
  await tool(f, { mode: 'revoke', id: saved.id });
  const lines = auditLines(f);
  assert.equal(lines.find((line) => line.op === 'execute').grant_id, null);
  const raw = readFileSync(f.audit.file, 'utf8');
  for (const forbidden of [value, proposal.warning, 'This standing approval', 'where', SCOPE.root]) {
    assert.equal(raw.includes(forbidden), false, forbidden);
  }
  assert.equal(lines.every((line) => Object.hasOwn(line, 'grant_id')), true);
});

test('matched confirm true still uses the original path with or without a grant', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.gw.callTool('execute', CALL)).status, 'needs_confirmation');
  const confirmed = await f.gw.callTool('execute', { ...CALL, confirm: true });
  assert.equal(confirmed.id, UUID);
  assert.equal(Object.hasOwn(confirmed, 'standing_approval'), false);
  assert.equal(f.calls.length, 1);
  await grant(f);
  assert.equal((await f.gw.callTool('execute', { ...CALL, confirm: true })).reason, 'unmatched_confirm');
  assert.equal(f.calls.length, 1);
  assert.equal((await f.gw.callTool('execute', { ...CALL, confirm: true })).id, UUID);
  assert.equal(auditLines(f).at(-1).grant_id, null);
});

for (const result of [null, 42, 'text', ['one'], { status: 'vendor_error', http_status: 503 }, new StatusSignal({ status: 'vendor_error', http_status: 500 })]) {
  test(`a granted call stamps a ${result === null ? 'null' : Array.isArray(result) ? 'array' : typeof result} result`, async (t) => {
    const f = await fixture(t);
    const saved = await grant(f);
    f.result = result;
    const ran = await f.gw.callTool('execute', CALL);
    assert.equal(Object.getPrototypeOf(ran), Object.prototype);
    assert.equal(ran.standing_approval.id, saved.id);
    if (result === null || typeof result !== 'object' || Array.isArray(result)) assert.deepEqual(ran.result, result);
    else assert.equal(ran.status, 'vendor_error');
    assert.equal(f.calls.length, 1);
  });
}

for (const mode of ['always', 'once', 'policy']) {
  test(`a grant covers ${mode} stops without remembering confirmation, while policy deny still wins`, async (t) => {
    const f = await probe(t, { confirmation: mode === 'always' ? 'always' : 'once', kind: 'change' });
    if (mode === 'policy') {
      f.gw.policy = { rules: [{ op: 'execute', effect: 'confirm' }, { effect: 'allow' }] };
      // The once stop has already been cleared, so only the policy raises this one.
      f.gw.confirmedOnce.add(f.call.action);
    }
    const before = [...f.gw.confirmedOnce];
    const saved = await grant(f, f.scope);
    assert.equal((await f.gw.callTool('execute', f.call)).standing_approval.id, saved.id);
    assert.equal(f.gw.pendingConfirmations.size, 0);
    assert.deepEqual([...f.gw.confirmedOnce], before);
    f.gw.policy = { rules: [{ effect: 'deny' }] };
    assert.equal((await f.gw.callTool('execute', f.call)).status, 'denied');
    assert.equal(f.calls.length, 1);
  });
}

test('disclosure refusal precedes a matching grant', async (t) => {
  const f = await probe(t);
  await grant(f, f.scope);
  let deep = {};
  for (let i = 0; i < 40; i += 1) deep = { deep };
  const result = await f.gw.callTool('execute', { ...f.call, input: { payload: deep } });
  assert.equal(result.status, 'invalid_arguments');
  assert.equal(result.reason, 'depth');
  assert.equal(f.calls.length, 0);
});

test('the pure matcher chooses the oldest eligible active grant and does not mutate its input', async (t) => {
  const f = await fixture(t);
  const first = await grant(f);
  const second = { ...first, id: 'sa_later', created_at: new Date(NOW + 1000).toISOString() };
  const grants = [second, first];
  const call = { ...CALL, manifestAction: f.gw.connectors[0].manifest.modules.records.actions.create,
    providerAccountId: first.provider_account_id, now: NOW };
  assert.equal(matchStandingApproval(grants, call), first);
  assert.deepEqual(grants, [second, first]);
  assert.equal(matchStandingApproval(grants, { ...call, manifestAction: {} }), null);
  assert.equal(matchStandingApproval(grants, { ...call, now: Date.parse(first.expires_at) }), null);
});

// Each scope check isolated: every other check passes, so only the one under test can refuse.
// Added after the mutation controls showed label and action each covered only by a neighbour.
test('the pure matcher refuses another label on the same account, and an unnamed action with an identical summary', async (t) => {
  const f = await fixture(t);
  const made = await grant(f);
  const create = f.gw.connectors[0].manifest.modules.records.actions.create;
  const call = { ...CALL, manifestAction: create, label: made.label, providerAccountId: made.provider_account_id, now: NOW };
  assert.equal(matchStandingApproval([made], call), made);
  // The same provider account under another label: only the label check can refuse it.
  const sameAccount = { ...made, label: 'other-label' };
  assert.equal(matchStandingApproval([sameAccount], call), null);
  assert.equal(matchStandingApproval([sameAccount], { ...call, label: 'other-label' }), sameAccount);
  // Another action whose manifest entry is identical in kind, summary and caution: only the action check can refuse it.
  const twin = 'twenty.records.create-twin';
  assert.equal(matchStandingApproval([made], { ...call, action: twin }), null);
  assert.equal(matchStandingApproval([{ ...made, actions: [...made.actions, twin] }], { ...call, action: twin }).id, made.id);
});

test('ineligible, unknown, mixed and inactive scopes cannot be proposed', async (t) => {
  const f = await fixture(t);
  const p = await probe(t);
  f.gw.connectors.push(...p.gw.connectors);
  for (const [args, field, reason] of [
    [{ actions: ['wiser.route.ask'] }, 'actions', 'not_eligible'],
    [{ actions: ['unknown.items.write'] }, 'actions', 'not_eligible'],
    [{ actions: ['twenty.metadata.create_object'] }, 'actions', 'not_eligible'],
    [{ actions: [CREATE, 'probe.items.marked'] }, 'actions', 'mixed_modules'],
    [{ module: 'twenty.metadata' }, 'module', 'not_eligible'],
    [{}, 'actions', 'exactly_one'],
    [{ actions: [CREATE], module: 'twenty.records' }, 'actions', 'exactly_one'],
  ]) {
    const result = await tool(f, { root: SCOPE.root, ...args, mode: 'propose' });
    assert.equal(result.status, 'invalid_arguments');
    assert.equal(result.field, field);
    assert.equal(result.reason, reason);
  }
  for (const status of ['EXPIRED', 'INACTIVE', 'INITIATED']) {
    put(f, undefined, { status });
    assert.deepEqual(await tool(f, { ...SCOPE, mode: 'propose' }), { status: 'needs_connect', service: 'twenty', module: 'records', privilege: 'admin' });
  }
  assert.equal((await tool(f, { ...SCOPE, label: 'missing', mode: 'propose' })).status, 'needs_connect');
  f.store.deleteConnection({ service: 'twenty', module: 'records' });
  assert.equal((await tool(f, { ...SCOPE, mode: 'propose' })).status, 'needs_connect');
});

test('the published schema and argument checks enforce scope shapes and identifier limits', async (t) => {
  const f = await fixture(t);
  const schema = f.gw.listTools().find((item) => item.name === 'standing_approvals').inputSchema;
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, ['mode']);
  assert.equal(Object.values(schema.properties).every((item) => typeof item.description === 'string' && item.description.endsWith('.')), true);
  for (const [args, field] of [
    [{ mode: 'other' }, 'mode'], [{ extra: 1 }, 'extra'], [{ actions: [] }, 'actions'],
    [{ actions: Array(21).fill(CREATE) }, 'actions'], [{ actions: ['bad'] }, 'actions'],
    [{ root: 'bad/root' }, 'root'], [{ root: 'a'.repeat(65) }, 'root'],
    [{ playbook: 'a'.repeat(129) }, 'playbook'], [{ playbook: 'bad/path' }, 'playbook'],
    [{ days: 1.5 }, 'days'], [{ days: 0 }, 'days'], [{ where: [] }, 'where'],
    [{ where: { object: [] } }, 'where.object'], [{ where: { object: [1] } }, 'where.object'],
    [{ where: { object: [''] } }, 'where.object'], [{ where: { object: ['a'.repeat(121)] } }, 'where.object'],
  ]) assert.equal(validateArgs('standing_approvals', { ...SCOPE, mode: 'propose', ...args }).field, field);
  for (const field of ['root', 'playbook']) {
    assert.equal(validateArgs('execute', { action: CREATE, [field]: 'bad/path' }).field, field);
  }
});

test('a union string declaration can restrict scope and canonicalizes two where fields', async (t) => {
  const f = await probe(t);
  f.gw.connectors[0].manifest.modules.items.actions.marked.input.properties.object.type = ['string', 'null'];
  const saved = await grant(f, { ...f.scope, where: { object: ['person'], channel: ['sms', 'email'] } });
  assert.deepEqual(Object.keys(saved.where), ['channel', 'object']);
  assert.deepEqual(saved.where.channel, ['email', 'sms']);
});

test('an inactive connection at grant time cannot consume or save the proposed scope', async (t) => {
  const f = await fixture(t);
  await tool(f, { ...SCOPE, mode: 'propose' });
  put(f, undefined, { status: 'EXPIRED' });
  assert.equal((await tool(f, { ...SCOPE, mode: 'grant', confirmed: true })).status, 'needs_connect');
  assert.equal((await f.gw.standingApprovals.list()).length, 0);
  assert.equal(f.gw.pendingConfirmations.size, 1);
});

test('a call without a root or current eligibility never reads standing approval storage', async (t) => {
  const f = await fixture(t);
  f.gw.standingApprovals = { async list() { assert.fail('out-of-scope call must not consult grants'); } };
  const noRoot = { action: CREATE, input: INPUT };
  assert.equal((await f.gw.callTool('execute', noRoot)).status, 'needs_confirmation');
  delete f.gw.connectors[0].manifest.modules.records.actions.create.standing_approval;
  assert.equal((await f.gw.callTool('execute', CALL)).status, 'needs_confirmation');
  assert.equal(f.calls.length, 0);
});

test('real root and Playbook names propose, grant and match in execute and both schemas', async (t) => {
  const f = await fixture(t);
  const scope = { ...SCOPE, root: 'Wiser Memory', playbook: '2026-10-22-standing-approvals.plan.md' };
  const saved = await grant(f, scope);
  const call = { ...CALL, root: scope.root, playbook: scope.playbook };
  assert.equal((await f.gw.callTool('execute', call)).standing_approval.id, saved.id);
  for (const name of ['execute', 'standing_approvals']) {
    const schema = f.gw.listTools().find((tool) => tool.name === name).inputSchema;
    const args = name === 'execute' ? call : { ...scope, mode: 'propose' };
    assert.equal(validateArgs(name, args), null);
    for (const field of ['root', 'playbook']) {
      assert.equal(new RegExp(schema.properties[field].pattern).test(args[field]), true);
      for (const bad of ['Wiser Memory ', ' Wiser', '.hidden', 'name.']) {
        assert.equal(new RegExp(schema.properties[field].pattern).test(bad), false, `${name}.${field}: ${bad}`);
        const result = await f.gw.callTool(name, { ...args, [field]: bad });
        assert.equal(result.status, 'invalid_arguments');
        assert.equal(result.field, field);
      }
    }
  }
});

test('a revoke survives a stale connection document written by another store', async (t) => {
  const f = await fixture(t);
  const saved = await grant(f);
  const other = new JsonFileStore(f.home);
  const stale = other.read();
  // Hold the old document through putConnection's read-modify-write cycle.
  other.read = () => stale;
  assert.equal((await tool(f, { mode: 'revoke', id: saved.id })).status, 'ok');
  other.putConnection({ ...stale.connections[0], status: 'ACTIVE' });
  const stored = (await f.gw.standingApprovals.list()).find((row) => row.id === saved.id);
  assert.equal(stored.revoked_at, new Date(NOW).toISOString());
  assert.equal((await f.gw.callTool('execute', CALL)).status, 'needs_confirmation');
  assert.equal(Object.hasOwn(other.read(), 'standing_approvals'), false);
  assert.equal(f.calls.length, 0);
});

test('a revoke after an incomplete journal line remains a separate readable record', async (t) => {
  const f = await fixture(t);
  const saved = await grant(f);
  const file = join(f.home, 'standing-approvals.jsonl');
  writeFileSync(file, `${readFileSync(file, 'utf8')}{incomplete`);
  assert.equal((await tool(f, { mode: 'revoke', id: saved.id })).status, 'ok');
  assert.ok((await f.gw.standingApprovals.list()).find((row) => row.id === saved.id).revoked_at);
  assert.equal((await f.gw.callTool('execute', CALL)).status, 'needs_confirmation');
});

test('a stale approval lock is removed before granting and cleaned up afterwards', async (t) => {
  const f = await fixture(t);
  const lock = join(f.home, 'standing-approvals.lock');
  mkdirSync(lock);
  const stale = new Date(Date.now() - 11000);
  utimesSync(lock, stale, stale);
  const saved = await grant(f);
  assert.equal((await f.gw.standingApprovals.list())[0].id, saved.id);
  assert.equal(existsSync(lock), false);
});

test('a fresh approval lock times out without writing a grant', async (t) => {
  const f = await fixture(t);
  await tool(f, { ...SCOPE, mode: 'propose' });
  const lock = join(f.home, 'standing-approvals.lock');
  mkdirSync(lock);
  const started = Date.now();
  await assert.rejects(() => tool(f, { ...SCOPE, mode: 'grant', confirmed: true }), /lock/i);
  assert.ok(Date.now() - started >= 2000);
  assert.equal(existsSync(join(f.home, 'standing-approvals.jsonl')), false);
  assert.equal(existsSync(lock), true);
  assert.equal(auditLines(f).at(-1).status, 'error');
});

for (const name of ['standing-approvals.jsonl', 'standing-approvals.lock']) {
  test(`approval storage refuses a symbolic link at ${name}`, async (t) => {
    const f = await fixture(t);
    const target = join(f.home, 'untouched');
    writeFileSync(target, 'unchanged');
    symlinkSync(target, join(f.home, name));
    await assert.rejects(() => grant(f), /symbolic link/);
    assert.equal(readFileSync(target, 'utf8'), 'unchanged');
  });
}

test('the approval journal skips malformed lines and compacts expired grants and revokes only on add', async (t) => {
  const f = await fixture(t);
  let at = NOW;
  const adapter = createStandingApprovals(f.home, () => at);
  const saved = await grant(f, { ...SCOPE, days: 1 });
  await adapter.revoke(saved.id, new Date(at).toISOString());
  const active = { ...saved, id: 'sa_active', expires_at: new Date(NOW + 3 * STANDING_APPROVAL_DAY_MS).toISOString() };
  const revoked = { ...active, id: 'sa_revoked' };
  await adapter.add(active);
  await adapter.add(revoked);
  await adapter.revoke(revoked.id, new Date(at).toISOString());
  const file = join(f.home, 'standing-approvals.jsonl');
  const before = readFileSync(file, 'utf8');
  const entries = before.trim().split('\n').map(JSON.parse);
  assert.deepEqual(entries.map((entry) => Object.keys(entry)[0]), ['grant', 'revoke', 'grant', 'grant', 'revoke']);
  assert.deepEqual(entries[1], { revoke: { id: saved.id, at: new Date(at).toISOString() } });
  writeFileSync(file, `${before}{bad json\nnull\n`);
  at += STANDING_APPROVAL_DAY_MS;
  assert.deepEqual((await adapter.list()).map((row) => row.id), [active.id, revoked.id]);
  assert.ok(readFileSync(file, 'utf8').includes(saved.id), 'list must not compact');
  await adapter.add({ ...active, id: 'sa_new' });
  const compacted = readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(JSON.stringify(compacted).includes(saved.id), false);
  assert.deepEqual(compacted.map((entry) => entry.grant?.id ?? entry.revoke.id), [active.id, revoked.id, revoked.id, 'sa_new']);
  assert.ok((await adapter.list()).find((row) => row.id === revoked.id).revoked_at);
  assert.equal(statSync(file).mode & 0o777, 0o600);
  const clean = readFileSync(file, 'utf8');
  await assert.rejects(() => adapter.add({ ...active, root: 'sk-must-not-store' }), /credential-shaped/);
  await assert.rejects(() => adapter.revoke(active.id, 'sk-must-not-store'), /credential-shaped/);
  assert.equal(readFileSync(file, 'utf8'), clean);
  assert.equal(existsSync(join(f.home, 'standing-approvals.lock')), false);
});

for (const kind of ['send', 'delete']) {
  test(`a ninety-day change approval stops when the current kind becomes ${kind}`, async (t) => {
    const f = await probe(t, { kind: 'change' });
    const saved = await grant(f, f.scope);
    assert.equal(saved.heightened, false);
    assert.equal((await f.gw.callTool('execute', f.call)).standing_approval.id, saved.id);
    f.gw.connectors[0].manifest.modules.items.actions.marked.standing_approval.kind = kind;
    assert.equal((await f.gw.callTool('execute', f.call)).status, 'needs_confirmation');
    assert.equal(f.calls.length, 1);
  });
}

test('an unscoped heightened match requires the current kind, explicit heightened consent and a seven-day lifetime', async (t) => {
  // No Playbook is stored, so this send grant still has the seven-day ceiling.
  const f = await probe(t);
  const saved = await grant(f, f.scope);
  const call = { ...f.call, manifestAction: f.gw.connectors[0].manifest.modules.items.actions.marked,
    providerAccountId: saved.provider_account_id, now: NOW };
  assert.equal(matchStandingApproval([saved], call), saved);
  for (const invalid of [
    { kinds: ['change'] }, { kinds: undefined }, { heightened: false }, { heightened: undefined },
    { expires_at: new Date(NOW + 7 * STANDING_APPROVAL_DAY_MS + 1).toISOString() },
    { created_at: 'invalid' },
  ]) assert.equal(matchStandingApproval([{ ...saved, ...invalid }], call), null, JSON.stringify(invalid));
});

for (const proposedAt of ['2026-10-22T23:50:00Z', '2026-10-22T23:55:00Z']) {
  test(`a proposal at ${proposedAt} crossing midnight UTC must show the changed expiry date before granting`, async (t) => {
    const f = await fixture(t);
    const scope = { ...SCOPE, days: 1 };
    f.gw.now = () => Date.parse(proposedAt);
    const proposal = await tool(f, { ...scope, mode: 'propose' });
    f.gw.now = () => Date.parse('2026-10-23T00:05:00Z');
    const result = await tool(f, { ...scope, mode: 'grant', confirmed: true });
    assert.equal(result.status, 'standing_approval_proposed');
    assert.equal(result.reason, 'unmatched_confirm');
    assert.equal(result.expires_on, '2026-10-24');
    assert.notEqual(result.warning, proposal.warning);
    assert.deepEqual(await f.gw.standingApprovals.list(), []);
    assert.equal((await tool(f, { ...scope, mode: 'grant', confirmed: true })).status, 'ok');
  });
}

test('an append waits for another process to release the approval lock', async (t) => {
  const f = await fixture(t);
  const saved = await grant(f);
  const lock = join(f.home, 'standing-approvals.lock');
  mkdirSync(lock);
  const child = spawn(process.execPath, ['-e',
    "setTimeout(() => require('node:fs').rmdirSync(process.argv[1]), 150)", lock],
  { stdio: 'ignore' });
  t.after(() => child.kill());
  const ended = once(child, 'exit');
  const started = Date.now();
  const result = await tool(f, { mode: 'revoke', id: saved.id });
  assert.equal(result.status, 'ok');
  assert.ok(Date.now() - started >= 150);
  assert.deepEqual(await ended, [0, null]);
  assert.equal(existsSync(lock), false);
  assert.equal((await f.gw.callTool('execute', CALL)).status, 'needs_confirmation');
});

test('a held lock prevents both revocation and compaction from changing the journal', async (t) => {
  const f = await fixture(t);
  const saved = await grant(f);
  const adapter = f.gw.standingApprovals;
  await adapter.add({ ...saved, id: 'sa_expired', expires_at: new Date(NOW).toISOString() });
  const file = join(f.home, 'standing-approvals.jsonl');
  const original = readFileSync(file, 'utf8');
  mkdirSync(join(f.home, 'standing-approvals.lock'));
  await assert.rejects(() => adapter.revoke(saved.id, new Date(NOW).toISOString()), /lock/i);
  assert.equal(readFileSync(file, 'utf8'), original);
  await assert.rejects(() => adapter.add({ ...saved, id: 'sa_unwritten' }), /lock/i);
  assert.equal(readFileSync(file, 'utf8'), original);
});

for (const [field, value] of [['summary', 'change records in Twenty'], ['caution', 'A changed caution.']]) {
  test(`a changed manifest ${field} needs a fresh proposal`, async (t) => {
    const f = await fixture(t);
    const proposal = await tool(f, { ...SCOPE, mode: 'propose' });
    f.gw.connectors[0].manifest.modules.records.actions.create.standing_approval[field] = value;
    const result = await tool(f, { ...SCOPE, mode: 'grant', confirmed: true });
    assert.equal(result.status, 'standing_approval_proposed');
    assert.equal(result.reason, 'unmatched_confirm');
    assert.notEqual(result.warning, proposal.warning);
    assert.deepEqual(await f.gw.standingApprovals.list(), []);
  });
}

const TWENTY_CAUTION = "Creating or changing a Twenty record can start your workspace's own workflows, and a workflow may send email from a connected mailbox, so under this approval nobody looks at the record before that happens.";
const TWENTY_WARNING = 'This standing approval lets your assistant create records in Twenty and change fields on existing Twenty records on your connection with no label without asking you first, for work done from the root "Wiser Memory". For 90 days, until 2027-01-20, every call that matches runs straight away, with no approval step for you to see or refuse. Anything outside it still asks you, as today. ' + TWENTY_CAUTION + ' You can end it at any time: ask your assistant to revoke it, or remove it on your Wiser account page. Answer yes to grant it, or no to leave things as they are.';

test('the exact Twenty warning includes the shared create and update caution once', async (t) => {
  const f = await fixture(t);
  const result = await tool(f, { mode: 'propose', module: 'twenty.records', root: 'Wiser Memory' });
  assert.equal(result.warning, TWENTY_WARNING);
  assert.equal(result.warning.split(TWENTY_CAUTION).length - 1, 1);
  const saved = await grant(f, { module: 'twenty.records', root: 'Wiser Memory' });
  assert.deepEqual(saved.kinds, ['change']);
  assert.equal(saved.heightened, false);
  assert.deepEqual(saved.cautions, [TWENTY_CAUTION]);
});

test('covered cautions are distinct and follow action order before the heightened warning', async (t) => {
  const f = await fixture(t);
  const actions = f.gw.connectors[0].manifest.modules.records.actions;
  actions.create.standing_approval.caution = 'First caution.';
  actions.update.standing_approval.caution = 'Second caution.';
  actions.update.standing_approval.kind = 'send';
  const result = await tool(f, { mode: 'propose', actions: [UPDATE, CREATE], root: SCOPE.root });
  assert.match(result.warning, /Anything outside it still asks you, as today\. First caution\. Second caution\. Some of these actions send messages/);
});


test('rehydrating the same proposal grants once and returns the stored grant; a fresh proposal has a new id', async (t) => {
  const first = await fixture(t);
  await tool(first, { ...SCOPE, mode: 'propose' });
  const pending = new Map(first.gw.pendingConfirmations);
  const saved = (await tool(first, { ...SCOPE, mode: 'grant', confirmed: true })).standing_approval;
  const second = await fixture(t, { home: first.home, pendingConfirmations: new Map(pending), now: () => NOW + 1000 });
  const retry = await tool(second, { ...SCOPE, mode: 'grant', confirmed: true });
  assert.equal(retry.status, 'ok');
  assert.deepEqual(retry.standing_approval, saved);
  const [[key, expiry]] = pending;
  assert.equal(saved.id, `sa_${createHash('sha256').update(`${key}:${expiry}`).digest('hex').slice(0, 32)}`);
  const entries = readFileSync(join(first.home, 'standing-approvals.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(entries.filter((entry) => entry.grant).length, 1);
  assert.equal((await tool(second, { mode: 'revoke', id: saved.id })).status, 'ok');
  second.gw.now = () => NOW + 2000;
  const fresh = await grant(second);
  assert.notEqual(fresh.id, saved.id);
  assert.equal((await second.gw.callTool('execute', CALL)).standing_approval.id, fresh.id);
});

test('an aged approval lock with a live owner times out without writing a grant', async (t) => {
  const f = await fixture(t);
  await tool(f, { ...SCOPE, mode: 'propose' });
  const lock = join(f.home, 'standing-approvals.lock');
  mkdirSync(lock);
  const owner = `${process.pid} live-owner`;
  writeFileSync(join(lock, 'owner'), owner);
  const stale = new Date(Date.now() - 11000);
  utimesSync(lock, stale, stale);
  const started = performance.now();
  await assert.rejects(() => tool(f, { ...SCOPE, mode: 'grant', confirmed: true }), /within 2 seconds/);
  assert.ok(performance.now() - started >= 2000);
  assert.equal(readFileSync(join(lock, 'owner'), 'utf8'), owner);
  assert.equal(existsSync(join(f.home, 'standing-approvals.jsonl')), false);
});

test('an aged approval lock with a dead owner is removed before granting', async (t) => {
  const f = await fixture(t);
  const child = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
  const deadPid = child.pid;
  await once(child, 'exit');
  assert.throws(() => process.kill(deadPid, 0), { code: 'ESRCH' });
  const lock = join(f.home, 'standing-approvals.lock');
  mkdirSync(lock);
  writeFileSync(join(lock, 'owner'), `${deadPid} dead-owner`);
  const stale = new Date(Date.now() - 11000);
  utimesSync(lock, stale, stale);
  const saved = await grant(f);
  assert.equal((await f.gw.standingApprovals.list())[0].id, saved.id);
  assert.equal(existsSync(lock), false);
});

test('approval lock release leaves a replacement owner token alone', async (t) => {
  const f = await fixture(t);
  const lock = join(f.home, 'standing-approvals.lock');
  const append = fs.appendFileSync;
  let heldOwner;
  t.mock.method(fs, 'appendFileSync', (file, ...args) => {
    if (file === join(f.home, 'standing-approvals.jsonl')) {
      heldOwner = readFileSync(join(lock, 'owner'), 'utf8');
      writeFileSync(join(lock, 'owner'), `${process.pid} replacement-owner`);
    }
    return append(file, ...args);
  });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  const saved = await grant(f);
  assert.match(heldOwner, new RegExp(`^${process.pid} [0-9a-f-]+$`));
  assert.equal((await f.gw.standingApprovals.list())[0].id, saved.id);
  assert.equal(readFileSync(join(lock, 'owner'), 'utf8'), `${process.pid} replacement-owner`);
});

test('approval compaction syncs the temporary file before replacing the journal', async (t) => {
  const f = await fixture(t);
  await grant(f, { ...SCOPE, days: 1 });
  f.gw.now = () => NOW + STANDING_APPROVAL_DAY_MS;
  const synced = new Set();
  const sync = fs.fsyncSync;
  const rename = fs.renameSync;
  let replacements = 0;
  t.mock.method(fs, 'fsyncSync', (fd) => {
    sync(fd);
    synced.add(fs.fstatSync(fd).ino);
  });
  t.mock.method(fs, 'renameSync', (from, to) => {
    if (to === join(f.home, 'standing-approvals.jsonl')) {
      assert.ok(synced.has(statSync(from).ino), 'the replacement must be synced before rename');
      replacements += 1;
    }
    return rename(from, to);
  });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  await grant(f);
  assert.equal(replacements, 1);
});

for (const [field, value] of [['summary', 'send different messages'], ['caution', 'Messages may start a workflow.']]) {
  test(`a changed manifest ${field} stops an existing grant from matching`, async (t) => {
    const f = await probe(t);
    const saved = await grant(f, f.scope);
    assert.equal((await f.gw.callTool('execute', f.call)).standing_approval.id, saved.id);
    f.gw.connectors[0].manifest.modules.items.actions.marked.standing_approval[field] = value;
    assert.equal((await f.gw.callTool('execute', f.call)).status, 'needs_confirmation');
    assert.equal(f.calls.length, 1);
    assert.deepEqual(saved.cautions, []);
  });
}

test('a legacy grant without cautions matches only an action with no caution', async (t) => {
  const f = await probe(t);
  const saved = await grant(f, f.scope);
  delete saved.cautions;
  const manifestAction = f.gw.connectors[0].manifest.modules.items.actions.marked;
  const call = { ...f.call, manifestAction, providerAccountId: saved.provider_account_id, now: NOW };
  assert.equal(matchStandingApproval([saved], call), saved);
  manifestAction.standing_approval.caution = 'A new caution.';
  assert.equal(matchStandingApproval([saved], call), null);
});

test('a Twenty grant stores both cautions and matches both warned actions', async (t) => {
  const f = await fixture(t);
  const actions = f.gw.connectors[0].manifest.modules.records.actions;
  actions.create.standing_approval.caution = 'First caution.';
  actions.update.standing_approval.caution = 'Second caution.';
  const saved = await grant(f, { module: 'twenty.records', root: SCOPE.root });
  assert.deepEqual(saved.cautions, ['First caution.', 'Second caution.']);
  assert.equal((await f.gw.callTool('execute', CALL)).standing_approval.id, saved.id);
  assert.equal((await f.gw.callTool('execute', { ...CALL, action: UPDATE, input: { ...INPUT, id: UUID } })).standing_approval.id, saved.id);
  assert.equal(f.calls.length, 2);
});
