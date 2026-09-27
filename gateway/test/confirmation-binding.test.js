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
import { containsUnsafeCodePoint, discloseInput } from '../src/disclosure.js';
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

/** One object wrapped `levels` times. Built by assignment, so the build itself does not recurse. */
function nestObject(levels, leaf) {
  let value = leaf;
  for (let i = 0; i < levels; i += 1) value = { n: value };
  return value;
}

/** One array wrapped `levels` times. */
function nestArray(levels, leaf) {
  let value = leaf;
  for (let i = 0; i < levels; i += 1) value = [value];
  return value;
}

const GATED_LIMITS = {
  description: 'Probe',
  risk: 'low',
  confirmation: 'always',
  execution: { prefer: 'proxy' },
  input: {
    type: 'object',
    properties: {
      n: { type: 'string', maxLength: 3 },
      count: { type: 'number', minimum: 0, maximum: 10, multipleOf: 1 },
      payload: { type: 'object' },
    },
  },
};

test('R1.2 a disconnect approval names the rows it will end', async () => {
  const { gw, store, fake } = await createTestGateway();
  const id = 'fake-acct-shared';
  fake.auth.setStatus(id, 'ACTIVE');
  const row = (module) => ({
    id: `conn-${module}`,
    service: 'github',
    module,
    privilege: 'write',
    provider: 'catalog',
    provider_account_id: id,
    scopes: [],
    status: 'ACTIVE',
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  });
  store.putConnection(row('repos'));
  const stop = await gw.disconnect({ service: 'github', module: 'repos' });
  assert.equal(stop.status, 'needs_confirmation');
  assert.equal(Object.hasOwn(stop, 'reason'), false);
  const shown = stop.modules_ending.map((m) => `${m.service}/${m.module}`).sort();
  assert.deepEqual(shown, ['github/repos']);
  const key = confirmationDigest(['disconnect', 'github', 'repos', id, shown]);
  assert.equal(gw.pendingConfirmations.has(key), true);
  assert.equal(
    gw.pendingConfirmations.has(confirmationDigest(['disconnect', 'github', 'repos', id])),
    false,
    'the approval must name the modules, not only the account',
  );

  store.putConnection(row('issues'));
  const refused = await gw.disconnect({
    service: 'github', module: 'repos', provider_account_id: id, confirm: true,
  });
  assert.equal(refused.status, 'needs_confirmation');
  assert.equal(refused.reason, 'unmatched_confirm');
  assert.deepEqual(
    refused.modules_ending.map((m) => `${m.service}/${m.module}`).sort(),
    ['github/issues', 'github/repos'],
  );
  assert.equal(store.listConnections().length, 2);
  assert.equal(await fake.auth.status({ providerAccountId: id }), 'ACTIVE');
  const current = ['github/issues', 'github/repos'];
  assert.equal(
    gw.pendingConfirmations.has(confirmationDigest(['disconnect', 'github', 'repos', id, current])),
    true,
    'the fresh stop records the modules it shows',
  );

  const ran = await gw.disconnect({
    service: 'github', module: 'repos', provider_account_id: id, confirm: true,
  });
  assert.equal(ran.status, 'disconnected');
  assert.equal(store.listConnections().length, 0);
  assert.equal(await fake.auth.status({ providerAccountId: id }), 'ABSENT');
});

test('R1.3 a stop never offers an approval for a value it did not show', async () => {
  const { gw, calls, audit } = await probe(GATED_LIMITS);
  const action = 'probe.thing.act';
  const canary = 'zzq-withheld-canary-9c3f';

  const refused = await gw.execute({ action, input: { n: canary } });
  assert.deepEqual(refused, { status: 'invalid_arguments', field: 'n', reason: 'maxLength' });
  assert.equal(calls.length, 0);
  assert.equal(gw.pendingConfirmations.size, 0);
  assert.equal(JSON.stringify(refused).includes(canary), false);
  assert.equal(auditText(audit).includes(canary), false);

  const withConfirm = await gw.execute({ action, input: { n: canary }, confirm: true });
  assert.deepEqual(withConfirm, { status: 'invalid_arguments', field: 'n', reason: 'maxLength' });
  assert.equal(calls.length, 0);
  assert.equal(gw.pendingConfirmations.size, 0);

  assert.deepEqual(
    await gw.execute({ action, input: { count: -1 } }),
    { status: 'invalid_arguments', field: 'count', reason: 'minimum' },
  );
  assert.deepEqual(
    await gw.execute({ action, input: { count: 11 } }),
    { status: 'invalid_arguments', field: 'count', reason: 'maximum' },
  );
  assert.deepEqual(
    await gw.execute({ action, input: { count: 1.5 } }),
    { status: 'invalid_arguments', field: 'count', reason: 'multipleOf' },
  );
  assert.deepEqual(
    await gw.execute({ action, input: { count: Number.NaN } }),
    { status: 'invalid_arguments', field: 'count', reason: 'type' },
  );
  assert.equal(calls.length, 0);
  assert.equal(gw.pendingConfirmations.size, 0);

  // The first withheld field follows the order the caller supplied the keys.
  assert.deepEqual(
    await gw.execute({ action, input: { n: canary, count: -1 } }),
    { status: 'invalid_arguments', field: 'n', reason: 'maxLength' },
  );
  assert.deepEqual(
    await gw.execute({ action, input: { count: -1, n: canary } }),
    { status: 'invalid_arguments', field: 'count', reason: 'minimum' },
  );

  const deep = await gw.execute({ action, input: { payload: nestObject(20000, 'zzq-depth-canary') } });
  assert.deepEqual(deep, { status: 'invalid_arguments', field: 'payload', reason: 'depth' });
  assert.equal(JSON.stringify(deep).includes('zzq-depth-canary'), false);
  const deepConfirm = await gw.execute({
    action, input: { payload: nestObject(20000, 'zzq-depth-canary') }, confirm: true,
  });
  assert.deepEqual(deepConfirm, { status: 'invalid_arguments', field: 'payload', reason: 'depth' });
  assert.equal(calls.length, 0);
  assert.equal(gw.pendingConfirmations.size, 0);

  // A call that needs no approval does not consult the disclosure check.
  const ungated = await probe({ ...GATED_LIMITS, confirmation: 'none', risk: 'low' });
  const ran = await ungated.gw.execute({ action, input: { n: canary } });
  assert.equal(ran.ok, true);
  assert.equal(ungated.calls.length, 1);
  assert.equal(ungated.gw.pendingConfirmations.size, 0);

  const fpCalls = [];
  const classifier = {
    name: 'direct',
    actions: () => ['wiser.route.roster'],
    describe() { return { request: {}, answer: {} }; },
    async execute(req) {
      fpCalls.push(req);
      return { ok: true, roster_sha256: 'abc', accepted: 1, rejected: 0 };
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
  const first = await createTestGateway({ classifier, policy, connectors: [] });
  const rows = nestArray(20000, 'zzq-fp-depth');
  const fp = await first.gw.execute({ action: 'wiser.route.roster', input: { rows } });
  assert.deepEqual(fp, { status: 'invalid_arguments', field: 'rows', reason: 'depth' });
  assert.equal(JSON.stringify(fp).includes('zzq-fp-depth'), false);
  const fpConfirm = await first.gw.execute({
    action: 'wiser.route.roster', input: { rows }, confirm: true,
  });
  assert.deepEqual(fpConfirm, { status: 'invalid_arguments', field: 'rows', reason: 'depth' });
  assert.equal(fpCalls.length, 0, 'a withheld first-party confirm reached the adapter');
  assert.equal(first.gw.pendingConfirmations.size, 0);
});

test('R1.4 an ungated call with a hostile depth runs', async () => {
  const { gw, calls } = await probe({ ...ALWAYS, confirmation: 'none', risk: 'low' });
  const input = { payload: nestObject(20000, 'leaf') };
  const ran = await gw.execute({ action: 'probe.thing.act', input });
  assert.equal(ran.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body, input);
  assert.equal(gw.pendingConfirmations.size, 0);
});

test('R1.5 a disconnect refuses an unsafe stored account id before any stop', async () => {
  const unsafeIds = ['acct-\u0007', 'acct-\u202e', 'acct-\u2028', 'acct-\u2060'];
  for (const id of unsafeIds) {
    assert.equal(containsUnsafeCodePoint(id), true, `fixture is not unsafe: ${JSON.stringify(id)}`);
    const { gw, store, fake } = await createTestGateway();
    fake.auth.setStatus(id, 'ACTIVE');
    store.putConnection({
      id: 'conn-repos', service: 'github', module: 'repos', privilege: 'write', provider: 'catalog',
      provider_account_id: id, scopes: [], status: 'ACTIVE',
      created: new Date().toISOString(), updated: new Date().toISOString(),
    });
    for (const args of [
      { service: 'github', module: 'repos' },
      { service: 'github', module: 'repos', provider_account_id: id, confirm: true },
    ]) {
      const refused = await gw.disconnect(args);
      assert.equal(refused.status, 'denied');
      assert.equal(refused.reason, 'unsafe_account_id');
      assert.equal(Object.hasOwn(refused, 'provider_account_id'), false);
      for (const s of everyString(refused)) {
        assert.equal(containsUnsafeCodePoint(s), false, `raw unsafe code point in ${JSON.stringify(refused)}`);
      }
      assert.equal(gw.pendingConfirmations.size, 0);
      assert.equal(store.listConnections().length, 1);
      assert.equal(await fake.auth.status({ providerAccountId: id }), 'ACTIVE');
    }
  }

  const { gw, store, fake } = await createTestGateway();
  const safe = 'fake-acct-plain';
  assert.equal(containsUnsafeCodePoint(safe), false);
  fake.auth.setStatus(safe, 'ACTIVE');
  store.putConnection({
    id: 'conn-repos', service: 'github', module: 'repos', privilege: 'write', provider: 'catalog',
    provider_account_id: safe, scopes: [], status: 'ACTIVE',
    created: new Date().toISOString(), updated: new Date().toISOString(),
  });
  const stop = await gw.disconnect({ service: 'github', module: 'repos' });
  assert.equal(stop.status, 'needs_confirmation');
  assert.equal(stop.provider_account_id, safe);
});

// R1.6 rendered an undefined member absent so the stop agreed with the key. Review
// round two (R2.2) found the class wider than undefined: a nested NaN rendered `NaN`
// and keyed `null`, and the connector still received the original object. A gated
// structured value must now be plain JSON, and anything else is refused unshown.
test('R1.6 and R2.2 a gated structured value that is not plain JSON is refused, never shown', async () => {
  const action = 'probe.thing.act';
  const notJson = [
    ['an undefined member', { payload: { x: undefined, y: 1 } }, 'payload'],
    ['an undefined element', { items: [undefined, 'a'] }, 'items'],
    ['an array hole', { items: [, 'a'] }, 'items'], // eslint-disable-line no-sparse-arrays
    ['a nested NaN', { payload: { x: NaN } }, 'payload'],
    ['a nested Infinity', { items: [1, -Infinity] }, 'items'],
    ['a nested Date', { payload: { at: new Date(0) } }, 'payload'],
    ['a nested bigint', { payload: { n: 1n } }, 'payload'],
    ['a nested function', { payload: { f() {} } }, 'payload'],
  ];
  for (const [label, input, field] of notJson) {
    assert.deepEqual(discloseInput(ALWAYS, input).withheld, [{ name: field, reason: 'not_json' }], label);
    const { gw, calls } = await probe(ALWAYS);
    const stop = await gw.execute({ action, input });
    assert.equal(stop.status, 'invalid_arguments', label);
    assert.equal(stop.field, field, label);
    assert.equal(stop.reason, 'not_json', label);
    assert.equal(gw.pendingConfirmations.size, 0, `${label}: no approval recorded`);
    const confirmed = await gw.execute({ action, input, confirm: true });
    assert.equal(confirmed.status, 'invalid_arguments', label);
    assert.equal(calls.length, 0, `${label}: nothing ran`);
  }

  // The stop for the null a NaN would have keyed as must not be reachable from the NaN.
  const { gw, calls } = await probe(ALWAYS);
  const nullStop = await gw.execute({ action, input: { payload: { x: null } } });
  assert.equal(nullStop.status, 'needs_confirmation');
  const viaNaN = await gw.execute({ action, input: { payload: { x: NaN } }, confirm: true });
  assert.equal(viaNaN.status, 'invalid_arguments');
  assert.equal(calls.length, 0);

  // Plain JSON still renders, keys and runs, and the connector receives exactly it.
  const plain = { payload: { x: null, y: [1, 'a', { z: false }] } };
  const plainStop = await gw.execute({ action, input: plain });
  assert.equal(plainStop.input_values.find((f) => f.name === 'payload').value, '{"x": null, "y": [1, "a", {"z": false}]}');
  const ran = await gw.execute({ action, input: plain, confirm: true });
  assert.equal(ran.ok, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body, plain);
});
