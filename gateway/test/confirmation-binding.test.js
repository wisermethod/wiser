import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { FIRST_PARTY_ACTIONS } from '../src/resolve.js';
import {
  PENDING_CONFIRMATION_MAX,
  PENDING_CONFIRMATION_TTL_MS,
  confirmationDigest,
} from '../src/gateway.js';
import { createTestGateway, makeHome, putActive } from './fake-provider.js';

/**
 * `confirm: true` runs only the stop it answers. Each test is named for the
 * point it proves.
 */

const RAW_UNSAFE = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}]/u;

function everyString(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) everyString(v, out);
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) { out.push(k); everyString(v, out); }
  }
  return out;
}

async function probe(action, options = {}) {
  const root = makeHome();
  const dir = join(root, 'probe');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({
    id: 'probe',
    service: 'probe',
    modules: {
      thing: {
        auth: { provider: 'catalog', toolkit: 'FAKE_KIT', scheme: 'OAUTH2', privilege: 'write' },
        unwrap_token: false,
        fallback: 'none',
        actions: { act: action },
      },
    },
  }));
  writeFileSync(join(dir, 'index.js'),
    'export const modules = { thing: { act: async (input, ctx) => { await ctx.proxy({ endpoint: "/probe", method: "POST", body: input }); return { ok: true }; } } };\n');
  const made = await createTestGateway({ connectorDirs: [root], ...options });
  await putActive(made.store, made.fake, { service: 'probe', module: 'thing', privilege: 'write' });
  const calls = [];
  const original = made.fake.auth.proxy.bind(made.fake.auth);
  made.fake.auth.proxy = async (args) => { calls.push(args); return original(args); };
  made.calls = calls;
  return made;
}

const ALWAYS = {
  description: 'Probe',
  risk: 'low',
  confirmation: 'always',
  execution: { prefer: 'proxy' },
  input: {
    type: 'object',
    properties: {
      n: { type: 'string' },
      payload: { type: 'object' },
      items: { type: 'array' },
    },
  },
};

function auditText(audit) {
  return readFileSync(audit.file, 'utf8');
}

test('1 a first stop records a pending approval and carries no reason', async () => {
  const { gw, calls, audit } = await probe(ALWAYS);
  const input = { n: 'one' };
  const stop = await gw.execute({ action: 'probe.thing.act', input });
  assert.equal(stop.status, 'needs_confirmation');
  assert.equal(Object.hasOwn(stop, 'reason'), false);
  assert.equal(calls.length, 0);
  const key = confirmationDigest(['execute', 'probe.thing.act', input, 'fake-acct-probe-thing']);
  assert.equal(gw.pendingConfirmations.has(key), true);
  assert.equal(auditText(audit).includes(key), false);
  assert.equal(auditText(audit).includes('one'), false);
});

test('2 confirm true with no earlier stop is a fresh stop and nothing runs', async () => {
  const { gw, calls } = await probe(ALWAYS);
  const refused = await gw.execute({ action: 'probe.thing.act', input: { n: 'one' }, confirm: true });
  assert.equal(refused.status, 'needs_confirmation');
  assert.equal(refused.reason, 'unmatched_confirm');
  assert.equal(calls.length, 0, 'an unmatched confirm reached the module');
  assert.equal(gw.pendingConfirmations.size, 1);
});

test('3 a matched confirm is single use', async () => {
  const { gw, calls } = await probe(ALWAYS);
  const input = { n: 'one' };
  const stop = await gw.execute({ action: 'probe.thing.act', input });
  assert.equal(stop.status, 'needs_confirmation');
  const ran = await gw.execute({ action: 'probe.thing.act', input, confirm: true });
  assert.equal(ran.ok, true);
  assert.equal(calls.length, 1);
  const again = await gw.execute({ action: 'probe.thing.act', input, confirm: true });
  assert.equal(again.status, 'needs_confirmation');
  assert.equal(again.reason, 'unmatched_confirm');
  assert.equal(calls.length, 1, 'a spent approval ran the module again');
});

test('4 expiry is read through now, and a reassigned now expires the approval', async () => {
  let t = 1_000_000;
  const { gw, calls } = await probe(ALWAYS, { now: () => t });
  const input = { n: 'one' };
  assert.equal((await gw.execute({ action: 'probe.thing.act', input })).status, 'needs_confirmation');
  gw.now = () => t + PENDING_CONFIRMATION_TTL_MS;
  const expired = await gw.execute({ action: 'probe.thing.act', input, confirm: true });
  assert.equal(expired.status, 'needs_confirmation');
  assert.equal(expired.reason, 'unmatched_confirm');
  assert.equal(calls.length, 0);
  assert.equal(
    gw.pendingConfirmations.has(confirmationDigest(['execute', 'probe.thing.act', input, 'fake-acct-probe-thing'])),
    true,
    'the refused confirm records a fresh stop',
  );
});

test('5 an unexpired approval still inside the fifteen minutes runs', async () => {
  let t = 5_000;
  const { gw, calls } = await probe(ALWAYS, { now: () => t });
  const input = { n: 'one' };
  await gw.execute({ action: 'probe.thing.act', input });
  t += PENDING_CONFIRMATION_TTL_MS - 1;
  const ran = await gw.execute({ action: 'probe.thing.act', input, confirm: true });
  assert.equal(ran.ok, true);
  assert.equal(calls.length, 1);
});

test('6 the pending map drops the oldest past 256 and a repeated stop refreshes recency', async () => {
  const { gw, calls } = await probe(ALWAYS);
  const action = 'probe.thing.act';
  await gw.execute({ action, input: { n: 'first' } });
  await gw.execute({ action, input: { n: 'second' } });
  await gw.execute({ action, input: { n: 'first' } });
  // One short of a full map of new keys: `second` is oldest and is the entry
  // the bound drops, and the refreshed `first` stays.
  for (let i = 0; i < PENDING_CONFIRMATION_MAX - 1; i += 1) {
    await gw.execute({ action, input: { n: `pad-${i}` } });
  }
  assert.equal(gw.pendingConfirmations.size, PENDING_CONFIRMATION_MAX);
  const firstKey = confirmationDigest(['execute', action, { n: 'first' }, 'fake-acct-probe-thing']);
  const secondKey = confirmationDigest(['execute', action, { n: 'second' }, 'fake-acct-probe-thing']);
  assert.equal(gw.pendingConfirmations.has(firstKey), true, 'a repeated stop must refresh recency');
  assert.equal(gw.pendingConfirmations.has(secondKey), false, 'the oldest entry must be dropped');
  const ran = await gw.execute({ action, input: { n: 'first' }, confirm: true });
  assert.equal(ran.ok, true);
  assert.equal(calls.length, 1);
  const refused = await gw.execute({ action, input: { n: 'second' }, confirm: true });
  assert.equal(refused.reason, 'unmatched_confirm');
  assert.equal(calls.length, 1);
});

test('7 a changed provider account id voids the execute approval', async () => {
  const { gw, store, calls } = await probe(ALWAYS);
  const input = { n: 'one' };
  await gw.execute({ action: 'probe.thing.act', input });
  const row = store.getConnection({ service: 'probe', module: 'thing' });
  store.putConnection({ ...row, provider_account_id: 'fake-acct-other' });
  const refused = await gw.execute({ action: 'probe.thing.act', input, confirm: true });
  assert.equal(refused.status, 'needs_confirmation');
  assert.equal(refused.reason, 'unmatched_confirm');
  assert.equal(calls.length, 0);
});

test('8 object key order is one input and list order is two', async () => {
  const { gw, calls } = await probe(ALWAYS);
  const action = 'probe.thing.act';
  await gw.execute({ action, input: { payload: { b: 2, a: 1 } } });
  const same = await gw.execute({ action, input: { payload: { a: 1, b: 2 } }, confirm: true });
  assert.equal(same.ok, true, 'key order must not void the approval');
  assert.equal(calls.length, 1);

  await gw.execute({ action, input: { items: ['a', 'b'] } });
  const swapped = await gw.execute({ action, input: { items: ['b', 'a'] }, confirm: true });
  assert.equal(swapped.status, 'needs_confirmation');
  assert.equal(swapped.reason, 'unmatched_confirm');
  assert.equal(calls.length, 1, 'list order must not share an approval');
  const ordered = await gw.execute({ action, input: { items: ['a', 'b'] }, confirm: true });
  assert.equal(ordered.ok, true);
  assert.equal(calls.length, 2);
});

test('9 confirmation once remembers only a matched confirm', async () => {
  const { gw, calls } = await probe({ ...ALWAYS, confirmation: 'once' });
  const input = { n: 'one' };
  const unmatched = await gw.execute({ action: 'probe.thing.act', input, confirm: true });
  assert.equal(unmatched.reason, 'unmatched_confirm');
  assert.equal(gw.confirmedOnce.has('probe.thing.act'), false);
  assert.equal(calls.length, 0);
  const ran = await gw.execute({ action: 'probe.thing.act', input, confirm: true });
  assert.equal(ran.ok, true);
  assert.equal(gw.confirmedOnce.has('probe.thing.act'), true);
  const later = await gw.execute({ action: 'probe.thing.act', input });
  assert.equal(later.ok, true);
  assert.equal(calls.length, 2);
});

test('10 a policy confirm effect is bound on the connector path', async () => {
  const { gw, calls } = await probe({ ...ALWAYS, confirmation: 'none', risk: 'destructive' });
  const input = { n: 'one' };
  const stop = await gw.execute({ action: 'probe.thing.act', input });
  assert.equal(stop.status, 'needs_confirmation');
  assert.equal(stop.confirmation, 'none');
  const refused = await gw.execute({ action: 'probe.thing.act', input: { n: 'other' }, confirm: true });
  assert.equal(refused.reason, 'unmatched_confirm');
  assert.equal(calls.length, 0);
  const ran = await gw.execute({ action: 'probe.thing.act', input, confirm: true });
  assert.equal(ran.ok, true);
  assert.equal(calls.length, 1);
  const again = await gw.execute({ action: 'probe.thing.act', input });
  assert.equal(again.status, 'needs_confirmation', 'a policy confirm is not remembered as once');
});

test('11 the first-party path with a policy confirm rule binds confirm to that input', async () => {
  const calls = [];
  const classifier = {
    name: 'direct',
    calls,
    actions: () => ['wiser.route.ask'],
    describe() { return { request: {}, answer: {} }; },
    async execute(req) {
      calls.push(req);
      return { ok: true, family: 'skill', target: 'example', confidence: 1, pass: true };
    },
  };
  const policy = {
    roles: ['runtime'],
    default_role: 'runtime',
    rules: [
      { role: '*', service: 'wiser', effect: 'confirm' },
      { role: '*', effect: 'allow' },
    ],
  };
  const { gw, audit } = await createTestGateway({ classifier, policy, connectors: [] });
  const input = { ask: 'what should I load', roster_sha256: 'abc' };
  const stop = await gw.execute({ action: 'wiser.route.ask', input });
  assert.equal(stop.status, 'needs_confirmation');
  assert.equal(Object.hasOwn(stop, 'reason'), false);
  assert.equal(calls.length, 0);
  const key = confirmationDigest(['execute', 'wiser.route.ask', input, null]);
  assert.equal(gw.pendingConfirmations.has(key), true);
  const unmatched = await gw.execute({
    action: 'wiser.route.ask',
    input: { ask: 'a different ask', roster_sha256: 'abc' },
    confirm: true,
  });
  assert.equal(unmatched.status, 'needs_confirmation');
  assert.equal(unmatched.reason, 'unmatched_confirm');
  assert.equal(calls.length, 0, 'an unmatched first-party confirm reached the adapter');
  assert.equal(auditText(audit).includes('what should I load'), false);
  assert.equal(auditText(audit).includes(key), false);
  const ran = await gw.execute({ action: 'wiser.route.ask', input, confirm: true });
  assert.equal(ran.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(FIRST_PARTY_ACTIONS['wiser.route.ask'].confirmation, 'none');
});

test('12 a confirm that needs no approval runs and records nothing', async () => {
  const { gw, calls } = await probe({ ...ALWAYS, confirmation: 'none', risk: 'low' });
  const ran = await gw.execute({ action: 'probe.thing.act', input: { n: 'one' }, confirm: true });
  assert.equal(ran.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(gw.pendingConfirmations.size, 0);
});

test('13 undefined input and an empty object are one approval', async () => {
  const { gw, calls } = await probe(ALWAYS);
  await gw.execute({ action: 'probe.thing.act' });
  const ran = await gw.execute({ action: 'probe.thing.act', input: {}, confirm: true });
  assert.equal(ran.ok, true);
  assert.equal(calls.length, 1);
});

test('14 a host can hydrate pendingConfirmations into the next gateway', async () => {
  const first = await probe(ALWAYS);
  const input = { n: 'one' };
  await first.gw.execute({ action: 'probe.thing.act', input });
  const second = await createTestGateway({
    home: first.home,
    store: first.store,
    fake: first.fake,
    connectors: first.connectors,
    audit: first.audit,
    pendingConfirmations: first.gw.pendingConfirmations,
    now: () => first.gw.now(),
  });
  const calls = [];
  const original = second.fake.auth.proxy.bind(second.fake.auth);
  second.fake.auth.proxy = async (args) => { calls.push(args); return original(args); };
  const ran = await second.gw.execute({ action: 'probe.thing.act', input, confirm: true });
  assert.equal(ran.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(first.gw.pendingConfirmations.size, 0);
});

test('15 disconnect refuses an unmatched confirm and revokes nothing', async () => {
  const { gw, store, fake } = await createTestGateway();
  const id = 'fake-acct-shared';
  fake.auth.setStatus(id, 'ACTIVE');
  store.putConnection({
    id: 'conn-repos', service: 'github', module: 'repos', privilege: 'write', provider: 'catalog',
    provider_account_id: id, scopes: [], status: 'ACTIVE',
    created: new Date().toISOString(), updated: new Date().toISOString(),
  });
  const refused = await gw.disconnect({
    service: 'github', module: 'repos', provider_account_id: id, confirm: true,
  });
  assert.equal(refused.status, 'needs_confirmation');
  assert.equal(refused.reason, 'unmatched_confirm');
  assert.equal(Object.hasOwn(
    (await gw.disconnect({ service: 'github', module: 'repos' })),
    'reason',
  ), false);
  assert.equal(store.listConnections().length, 1);
  assert.equal(await fake.auth.status({ providerAccountId: id }), 'ACTIVE');
});

test('16 a changed disconnect account is refused before the match and does not consume it', async () => {
  const { gw, store, fake } = await createTestGateway();
  const id = 'fake-acct-shared';
  fake.auth.setStatus(id, 'ACTIVE');
  store.putConnection({
    id: 'conn-repos', service: 'github', module: 'repos', privilege: 'write', provider: 'catalog',
    provider_account_id: id, scopes: [], status: 'ACTIVE',
    created: new Date().toISOString(), updated: new Date().toISOString(),
  });
  const stop = await gw.disconnect({ service: 'github', module: 'repos' });
  assert.equal(stop.status, 'needs_confirmation');
  assert.equal(Object.hasOwn(stop, 'reason'), false);
  const wrong = await gw.disconnect({
    service: 'github', module: 'repos', provider_account_id: 'someone-else', confirm: true,
  });
  assert.equal(wrong.status, 'denied');
  assert.equal(wrong.rule.reason, 'account_changed');
  assert.equal(await fake.auth.status({ providerAccountId: id }), 'ACTIVE');
  const ran = await gw.disconnect({
    service: 'github', module: 'repos', provider_account_id: id, confirm: true,
  });
  assert.equal(ran.status, 'disconnected');
  assert.equal(store.listConnections().length, 0);
});

test('17 a stop with a truncated value carries full and the summary names input_values', async () => {
  const { gw } = await probe(ALWAYS);
  const n = `${'a'.repeat(200)}\u0000`;
  const stop = await gw.execute({ action: 'probe.thing.act', input: { n, items: ['\u001b'.repeat(50)] } });
  assert.equal(stop.status, 'needs_confirmation');
  for (const field of stop.input_values) {
    assert.equal(field.truncated, true);
    assert.equal(typeof field.full, 'string');
    assert.ok(field.full.length > field.value.length);
    assert.equal(Object.hasOwn(field, 'full'), true);
  }
  assert.match(stop.summary, /input_values/);
  assert.match(stop.summary, /shortened here/);
  assert.ok(stop.summary.length <= 2000);
  for (const s of everyString(stop)) assert.equal(RAW_UNSAFE.test(s), false, s.slice(0, 40));
  const plain = await gw.execute({ action: 'probe.thing.act', input: { n: 'short' } });
  assert.equal(Object.hasOwn(plain.input_values[0], 'full'), false);
});
