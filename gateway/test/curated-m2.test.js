import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { CURATED } from '../providers/composio/curated.js';
import { createCatalogProvider, curatedSlugMap } from '../providers/composio/catalog-provider.js';
import { loadCuratedActions } from '../src/curated.js';
import { loadConnectors } from '../src/manifest.js';
import { createFakeProviders, createTestGateway, DEFAULT_CONNECTORS, putActive } from './fake-provider.js';

const CONNECTORS = await loadConnectors([DEFAULT_CONNECTORS]);
const READ = CURATED.find((row) => row.id === 'google.gmail.list_labels');
const CHANGE = CURATED.find((row) => row.id === 'google.gmail.create_label');

function provider(rows, toSlug = (id) => rows.find((row) => row.id === id)?.tool ?? null) {
  return { curated: () => rows, toSlug };
}

async function fixture(rows = [READ, CHANGE], options = {}) {
  const fake = createFakeProviders();
  const calls = [];
  fake.catalog.curated = () => rows;
  for (const row of rows) {
    fake.catalog.setSlug(row.id, row.tool);
    fake.catalog.setResult(row.tool, (args) => ({ ok: true, arguments: args }));
  }
  const execute = fake.catalog.execute.bind(fake.catalog);
  fake.catalog.execute = async (call) => { calls.push(call); return execute(call); };
  const result = await createTestGateway({ ...options, fake, session: false });
  for (const row of rows) {
    const [service, module] = row.id.split('.');
    if (service === 'wiser') continue;
    await putActive(result.store, fake, { service, module });
  }
  return { ...result, calls };
}

const schema = (value) => ({ type: 'object', properties: { value } });
const rowWithSchema = (input_schema) => ({ ...READ, key_fields: [], input_schema });

test('the curated data holds all 48 rows, recorded narrowing and exact provider mappings', () => {
  assert.equal(CURATED.length, 48);
  assert.equal(new Set(CURATED.map((row) => row.id)).size, 48);
  const catalog = createCatalogProvider();
  for (const row of CURATED) {
    assert.equal(catalog.toSlug(row.id), row.tool, row.id);
    assert.ok(Array.isArray(row.narrowed), row.id);
    for (const key of row.narrowed) {
      assert.equal(Object.hasOwn(row.input_schema.properties, key), false, `${row.id}: ${key}`);
      assert.equal(row.input_schema.required?.includes(key) ?? false, false, `${row.id}: ${key}`);
    }
  }
});

for (const [name, value] of [
  ['missing property type', {}],
  ['object property', { type: 'object' }],
  ['array without items', { type: 'array' }],
  ['untyped array items', { type: 'array', items: {} }],
  ['object array items', { type: 'array', items: { type: 'object' } }],
  ['array array items', { type: 'array', items: { type: 'array', items: { type: 'string' } } }],
]) test(`unconstrained curated input is rejected before any provider call: ${name}`, async () => {
  const row = rowWithSchema(schema(value));
  assert.deepEqual(loadCuratedActions(provider([row]), CONNECTORS), {
    rows: [], errors: [{ id: row.id, reason: 'unsupported_input_schema' }],
  });
  const { gw, calls } = await fixture([row]);
  assert.equal((await gw.execute({ action: row.id, input: { value: { arbitrary: true } } })).status, 'needs_connector');
  assert.equal(calls.length, 0);
});

for (const key of ['user_id', 'userId', 'user_principal_name']) {
  test(`a curated schema cannot select another account with ${key}`, async () => {
    const row = rowWithSchema({ type: 'object', properties: { [key]: { type: 'string' } } });
    assert.deepEqual(loadCuratedActions(provider([row]), CONNECTORS).errors,
      [{ id: row.id, reason: 'account_selector' }]);
    const { gw, calls } = await fixture([row]);
    assert.equal((await gw.execute({ action: row.id, input: { [key]: 'other@example.com' } })).status, 'needs_connector');
    assert.equal(calls.length, 0);
  });
}

test('a removed selector is refused on the shipped read and never reaches the provider', async () => {
  const { gw, calls } = await fixture();
  assert.deepEqual(await gw.execute({ action: READ.id, input: { user_id: 'other@example.com' } }),
    { status: 'invalid_arguments', field: 'user_id' });
  assert.equal(calls.length, 0);
});

for (const patch of [{}, { kind: 'unknown' }]) test(`all duplicate id copies are invalid, including a later ${patch.kind ?? 'valid'} tool swap`, async () => {
  const rows = [READ, { ...READ, ...patch, tool: 'GMAIL_SEND_EMAIL' }];
  assert.deepEqual(loadCuratedActions(provider(rows), CONNECTORS), {
    rows: [], errors: rows.map((row) => ({ id: row.id, reason: 'duplicate_id' })),
  });
  assert.equal(curatedSlugMap(rows).has(READ.id), false);
  const { gw, calls } = await fixture(rows);
  assert.equal((await gw.execute({ action: READ.id, input: {} })).status, 'needs_connector');
  assert.equal(calls.length, 0, 'neither duplicate tool may reach execute');
});

for (const [name, toSlug] of [
  ['different slug', () => 'GMAIL_SEND_EMAIL'],
  ['no slug', () => null],
  ['no mapping method', undefined],
]) test(`a curated row requires its exact mapped slug: ${name}`, () => {
  const catalog = { curated: () => [READ], toSlug };
  assert.deepEqual(loadCuratedActions(catalog, CONNECTORS), {
    rows: [], errors: [{ id: READ.id, reason: 'slug_mismatch' }],
  });
});

test('provider curated slug registration keeps unique siblings and rejects every ambiguous id', () => {
  const map = curatedSlugMap([READ, { ...READ, tool: 'OTHER' }, CHANGE]);
  assert.equal(map.has(READ.id), false);
  assert.equal(map.get(CHANGE.id), CHANGE.tool);
});

for (const [kind, hint] of [
  ['read', 'createHint'], ['read', 'updateHint'], ['read', 'destructiveHint'],
  ['change', 'destructiveHint'], ['send', 'destructiveHint'],
]) test(`contradictory kind ${kind} and ${hint} are rejected`, () => {
  const row = { ...READ, kind, hint: [hint] };
  assert.deepEqual(loadCuratedActions(provider([row]), CONNECTORS), {
    rows: [], errors: [{ id: row.id, reason: 'kind_hint_mismatch' }],
  });
});

test('an invalid curated id cannot hide a declared first-party description', async () => {
  const id = 'wiser.decide.choice';
  const row = { ...READ, id };
  const classifier = { actions: () => [id], describe: () => ({ answer: { chosen: 'test' } }) };
  const { gw } = await fixture([row], { classifier, envPath: null });
  const described = gw.describeAction(id);
  assert.equal(described.action, id);
  assert.equal(described.source, 'first_party_mcp');
  assert.equal(described.confirmation, 'none');
  assert.equal(described.curated, undefined);
});

test('an invalid curated collision leaves a hand-written description in place', async () => {
  const row = { ...READ, id: 'google.gmail.list_messages' };
  const { gw } = await fixture([row]);
  assert.equal(gw.describeAction(row.id).curated, undefined);
  assert.equal(gw.describeAction(row.id).description, 'List or search messages');
});

test('search preserves hand-written matches, applies the same filter, and describes copied key fields', async () => {
  const { gw, connectors } = await fixture();
  const previous = await createTestGateway({ connectors, session: false });
  for (const query of ['send_message', 'github', 'a query with no results']) {
    assert.deepEqual(gw.searchActions({ query }), previous.gw.searchActions({ query }));
  }
  const old = previous.gw.searchActions({ query: 'gmail' }).actions;
  const added = gw.searchActions({ query: 'gmail' }).actions;
  assert.deepEqual(added.slice(0, old.length), old);
  assert.deepEqual(added.slice(old.length).map((row) => row.action), [READ.id, CHANGE.id]);
  for (const row of added.slice(old.length)) {
    assert.equal(row.curated, true);
    assert.equal(typeof row.kind, 'string');
    assert.equal(row.description, row.summary);
  }
  assert.deepEqual(gw.searchActions({ service: 'microsoft', query: 'gmail' }).actions, []);
  const described = gw.describeAction(CHANGE.id);
  assert.deepEqual(described.key_fields, CHANGE.key_fields);
  assert.deepEqual(described.input, CHANGE.input_schema);
  described.key_fields.push('not_in_the_schema');
  assert.deepEqual(gw.describeAction(CHANGE.id).key_fields, CHANGE.key_fields);
});

for (const choice of ['google.gmail.list_messages', READ.id]) {
  test(`curated search uses the existing classifier ranking for ${choice}`, async () => {
    const { gw } = await fixture();
    gw.classifierSearchAttempt = () => ({ call: true });
    gw.execute = async ({ action, input }) => {
      assert.equal(action, 'wiser.decide.choice');
      assert.ok(input.options.some((option) => option.id === READ.id));
      assert.ok(input.options.some((option) => option.id === 'google.gmail.list_messages'));
      return { choice, confidence: 0.9 };
    };
    const result = await gw.searchActions({ query: 'gmail' });
    assert.equal(result.actions[0].action, choice);
    assert.equal(result.actions[0].classifier, true);
    assert.equal(result.classifier.path, 'classifier');
    assert.equal(result.actions.filter((row) => row.action === choice).length, 1);
  });
}

test('supported scalar arrays still enforce each item before the provider', async () => {
  const row = rowWithSchema(schema({ type: 'array', items: { type: 'string' } }));
  assert.equal(loadCuratedActions(provider([row]), CONNECTORS).rows.length, 1);
  const { gw, calls } = await fixture([row]);
  assert.deepEqual(await gw.execute({ action: row.id, input: { value: ['ok', {}] } }),
    { status: 'invalid_arguments', field: 'value' });
  assert.equal(calls.length, 0);
  assert.equal((await gw.execute({ action: row.id, input: { value: ['ok'] } })).ok, true);
  assert.equal(calls.length, 1);
});

for (const kind of ['read', 'change', 'send', 'delete']) {
  test(`curated ${kind} follows the kind policy and uses one provider call and audit per execution`, async () => {
    const row = {
      ...READ, id: `google.gmail.policy_${kind}`, tool: `FIXTURE_${kind}`, kind,
      hint: [kind === 'read' ? 'readOnlyHint' : kind === 'delete' ? 'destructiveHint' : 'createHint'],
      key_fields: ['value'], input_schema: schema({ type: 'string' }),
    };
    const { gw, calls, audit, store } = await fixture([row]);
    // Neither an explicit grant nor a module grant can remove a curated stop.
    if (kind !== 'read') gw.standingApprovals = { list: () => assert.fail('curated calls cannot consult grants') };
    const call = { action: row.id, input: { value: 'item' }, root: 'Test' };
    const first = await gw.execute(call);
    if (kind === 'read') assert.equal(first.ok, true);
    else {
      assert.equal(first.status, 'needs_confirmation');
      assert.equal(first.confirmation, 'always');
      assert.equal(calls.length, 0);
      assert.equal(gw.standingApprovalScope({ mode: 'propose', actions: [row.id], root: 'Test' }).refusal.reason, 'not_eligible');
      const moduleGrant = gw.standingApprovalScope({ mode: 'propose', module: 'google.gmail', root: 'Test' });
      assert.equal(moduleGrant.scope.actions.includes(row.id), false);
      assert.equal((await gw.execute({ ...call, confirm: true })).ok, true);
      assert.equal((await gw.execute(call)).status, 'needs_confirmation', 'a delete or write stops again after its one approved run');
    }
    assert.equal(calls.length, 1);
    assert.equal(calls[0].providerAccountId, store.getConnection({ service: 'google', module: 'gmail' }).provider_account_id);
    const lines = readFileSync(audit.file, 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(lines.filter((line) => line.status === 'ok').length, 1);
    assert.ok(lines.every((line) => line.service === 'google' && line.path === 'catalog'));
  });
}

for (const id of ['google.gmail.list_labels', 'google.calendar.get_calendar', 'google.drive.get_about', 'microsoft.outlook.count_messages', 'microsoft.calendar.find_meeting_times']) {
  test(`curated service identity reaches host wrappers once: ${id}`, async () => {
    const row = CURATED.find((item) => item.id === id);
    const { gw, calls, policy } = await fixture([row]);
    const input = Object.fromEntries((row.input_schema.required ?? []).map((key) => [key, 'test']));
    const [service] = id.split('.');
    const original = gw.catalogProvider.execute;
    let counted = 0;
    gw.catalogProvider.execute = (call) => {
      assert.equal(call.actionId.split('.')[0], service);
      counted += 1;
      return original(call);
    };
    assert.equal((await gw.execute({ action: id, input })).ok, true);
    assert.equal(counted, 1);
    assert.equal(calls.length, 1);
    gw.policy = { ...policy, rules: [{ service, op: 'execute', effect: 'deny' }] };
    assert.equal((await gw.execute({ action: id, input })).status, 'denied');
    assert.equal(counted, 1);
  });
}
