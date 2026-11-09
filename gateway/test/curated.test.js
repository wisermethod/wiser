import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { CURATED } from '../providers/composio/curated.js';
import { createCatalogProvider } from '../providers/composio/catalog-provider.js';
import { createAuthProvider as createStubProvider } from '../providers/nango/auth-provider.js';
import { loadCuratedActions } from '../src/curated.js';
import { curatedActionDefinition } from '../src/catalog.js';
import { createAudit } from '../src/audit.js';
import { ConnectionGateway, PENDING_CONFIRMATION_TTL_MS } from '../src/gateway.js';
import { loadConnectors } from '../src/manifest.js';
import { loadPolicy } from '../src/policy.js';
import { JsonFileStore } from '../src/store.js';
import { createFakeProviders, DEFAULT_CONNECTORS, DEFAULT_POLICY, makeHome, putActive } from './fake-provider.js';

const CONNECTORS = await loadConnectors([DEFAULT_CONNECTORS]);
const READ = CURATED.find((row) => row.id === 'google.gmail.list_labels');
const CHANGE = CURATED.find((row) => row.id === 'google.gmail.create_label');

/** Same unknown-method pass-through used by the service's provider proxies. */
function passThrough(provider) {
  return new Proxy(provider, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

async function fixture(rows = CURATED, options = {}) {
  const home = makeHome();
  const store = new JsonFileStore(home);
  const fake = createFakeProviders();
  const calls = [];
  let reads = 0;
  const catalog = fake.catalog;
  catalog.curated = function () {
    assert.equal(this, catalog, 'a wrapper must bind the optional synchronous method');
    reads += 1;
    return rows;
  };
  for (const row of rows) {
    if (row && typeof row.id === 'string') {
      catalog.setSlug(row.id, row.tool);
      catalog.setResult(row.tool, (args) => ({ ok: true, arguments: args }));
    }
  }
  const execute = catalog.execute.bind(catalog);
  catalog.execute = async (call) => {
    calls.push({ ...call, slug: catalog.toSlug(call.actionId) });
    return execute(call);
  };
  const audit = createAudit(home);
  const opts = {
    home, store, audit,
    role: options.role ?? 'runtime',
    harness: 'wiser-service',
    policy: options.policy ?? loadPolicy({ home, defaultPath: DEFAULT_POLICY }),
    authProvider: fake.auth,
    catalogProvider: passThrough(passThrough(catalog)),
    localFileProvider: null,
    envPath: null,
    classifier: null,
    connectors: options.connectors ?? CONNECTORS,
    pendingConfirmations: options.pendingConfirmations ?? new Map(),
    ...(options.now ? { now: options.now } : {}),
  };
  const gw = new ConnectionGateway(opts);
  const record = await putActive(store, fake, { service: 'google', module: 'gmail' });
  return { gw, opts, store, fake, calls, record, audit, reads: () => reads };
}

function auditLines(audit) {
  return readFileSync(audit.file, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
}

function fixtureRow(kind) {
  return {
    ...structuredClone(CHANGE), id: `google.gmail.fixture_${kind}`, tool: `FAKE_${kind.toUpperCase()}`,
    kind, summary: `${kind === 'send' ? 'Send' : 'Delete'} the named test item.`, key_fields: ['target'],
    input_schema: { type: 'object', properties: { target: { type: 'string' } }, required: ['target'], additionalProperties: false },
  };
}

function providerForRows(rows) {
  const slugs = new Map(rows.map((row) => [row.id, row.tool]));
  return { curated: () => rows, toSlug: (id) => slugs.get(id) ?? null };
}

test('46 curated rows include the two narrowed Solve schemas and hint tags, with provider-local slugs', () => {
  const provider = createCatalogProvider({ envPath: null });
  assert.ok(Object.isFrozen(CURATED));
  assert.equal(provider.curated(), CURATED);
  assert.equal(CURATED.length, 46);
  assert.deepEqual([READ, CHANGE].map((row) => row?.id), ['google.gmail.list_labels', 'google.gmail.create_label']);
  for (const row of CURATED) {
    assert.equal(Object.getPrototypeOf(row), Object.prototype);
    assert.equal(provider.toSlug(row.id), row.tool);
  }
  // Hashes of the recorded schemas after narrowing user_id, including annotations.
  const hashes = [
    '311b755cbea6baa8c0f64de35c22486fd1dc9c0ac14ea5004e2817f12aace684',
    '1db5a3e2602f116368515e8062b0d3070e61500fbaa5fe4179784253875ca9b2',
  ];
  for (const [index, row] of [READ, CHANGE].entries()) {
    assert.equal(createHash('sha256').update(JSON.stringify(row.input_schema)).digest('hex'), hashes[index]);
    assert.deepEqual(row.narrowed, ['user_id']);
    assert.equal(Object.hasOwn(row.input_schema.properties, 'user_id'), false);
  }
  assert.equal(READ.tool, 'GMAIL_LIST_LABELS');
  assert.equal(CHANGE.tool, 'GMAIL_CREATE_LABEL');
  assert.deepEqual(READ.hint, ['openWorldHint', 'readOnlyHint']);
  assert.deepEqual(CHANGE.hint, ['createHint', 'openWorldHint']);
  assert.equal(provider.toSlug('github.repos.get'), 'GITHUB_GET_A_REPOSITORY');
});

test('curated read runs without a stop, maps the slug and arguments, and audits catalog', async () => {
  const { gw, calls, record, audit, reads } = await fixture();
  const input = { include_details: true };
  assert.deepEqual(await gw.callTool('execute', { action: READ.id, input }), { ok: true, arguments: input });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].actionId, READ.id);
  assert.equal(calls[0].slug, 'GMAIL_LIST_LABELS');
  assert.deepEqual(calls[0].arguments, input);
  assert.equal(calls[0].providerAccountId, record.provider_account_id);
  assert.equal(typeof calls[0].userId, 'string');
  assert.equal(gw.pendingConfirmations.size, 0);
  assert.equal(reads(), 1, 'rows load once per gateway, never per call');
  const [line] = auditLines(audit);
  assert.equal(line.path, 'catalog');
  assert.equal(line.status, 'ok');
  assert.equal(line.action, READ.id);
  assert.equal(line.provider_account_id, record.provider_account_id);
  assert.equal(line.harness, 'wiser-service');
  assert.equal(line.grant_id, null);
  assert.equal(Object.hasOwn(line, 'input'), false);
});

test('Calendar quick-add discloses the actual event and notifications without the old sample event', async () => {
  const { gw, store, fake, calls } = await fixture();
  await putActive(store, fake, { service: 'google', module: 'calendar', privilege: 'write' });
  const input = { calendar_id: 'primary', send_updates: 'all', text: 'Project review Tuesday at 10am' };
  const stop = await gw.execute({ action: 'google.calendar.quick_add', input });
  assert.equal(stop.status, 'needs_confirmation');
  assert.doesNotMatch(JSON.stringify(stop), /Lunch with Sam/);
  assert.ok(stop.summary.startsWith('Add an event to your calendar from one line of text. '
    + 'text="Project review Tuesday at 10am", send_updates="all", calendar_id="primary"'));
  assert.equal(calls.length, 0);
});

test('Calendar patch keeps notifications and attendees visible when every free-form property is long', async () => {
  const { gw, store, fake, calls } = await fixture();
  await putActive(store, fake, { service: 'google', module: 'calendar', privilege: 'write' });
  const row = CURATED.find((item) => item.id === 'google.calendar.patch_event');
  const input = {};
  const longFields = [];
  for (const [name, property] of Object.entries(row.input_schema.properties)) {
    if (property.type === 'string' && !property.enum && !property.pattern) {
      input[name] = `${name} ${'x'.repeat(150)}`;
      longFields.push(name);
    } else if (property.type === 'array') {
      input[name] = [`${name}@example.test`, `${'x'.repeat(150)}@example.test`];
      longFields.push(name);
    }
  }
  // Put notification behavior last in input order, behind the oversized values.
  input.send_updates = 'all';
  const stop = await gw.execute({ action: row.id, input });
  assert.equal(stop.status, 'needs_confirmation');
  for (const name of longFields) assert.equal(stop.input_values.find((field) => field.name === name).truncated, true, name);
  const attendees = stop.input_values.find((field) => field.name === 'attendees');
  assert.ok(stop.summary.startsWith(`${row.summary} send_updates="all", attendees=${attendees.value}, summary=`));
  assert.ok(stop.summary.length <= 2000);
  assert.equal(calls.length, 0);
});

for (const row of [CHANGE, fixtureRow('send'), fixtureRow('delete')]) {
  test(`curated ${row.kind} discloses its fields, binds confirmation and consumes it once`, async () => {
    const { gw, calls, audit } = await fixture([row]);
    const input = row.kind === 'change' ? { label_name: 'Work/Projects' } : { target: 'item-1' };
    const call = { action: row.id, input };
    const stopped = await gw.callTool('execute', call);
    assert.equal(stopped.status, 'needs_confirmation');
    assert.equal(stopped.confirmation, 'always');
    assert.equal(stopped.description, row.summary);
    assert.deepEqual(stopped.input_fields, Object.keys(input));
    assert.deepEqual(stopped.input_values, Object.entries(input).map(([name, value]) => ({ name, value: JSON.stringify(value), truncated: false })));
    assert.deepEqual(stopped.withheld_fields, []);
    assert.ok(stopped.summary.includes(Object.values(input)[0]));
    assert.equal(calls.length, 0);
    const wrong = await gw.execute({ action: row.id, input: { ...input, [Object.keys(input)[0]]: 'a-different-target' }, confirm: true });
    assert.equal(wrong.status, 'needs_confirmation');
    assert.equal(wrong.reason, 'unmatched_confirm');
    assert.equal(calls.length, 0);
    assert.deepEqual(await gw.execute({ ...call, confirm: true }), { ok: true, arguments: input });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].slug, row.tool);
    const replay = await gw.execute({ ...call, confirm: true });
    assert.equal(replay.status, 'needs_confirmation');
    assert.equal(replay.reason, 'unmatched_confirm');
    assert.equal(calls.length, 1);
    assert.deepEqual(auditLines(audit).map((line) => line.path), Array(4).fill('catalog'));
    assert.equal(readFileSync(audit.file, 'utf8').includes(Object.values(input)[0]), false);
  });
}

test('stale curated confirmation and a changed connection cannot run', async () => {
  let now = 1_000_000;
  const { gw, calls, store, record } = await fixture(CURATED, { now: () => now });
  const call = { action: CHANGE.id, input: { label_name: 'Old stop' } };
  assert.equal((await gw.execute(call)).status, 'needs_confirmation');
  now += PENDING_CONFIRMATION_TTL_MS + 1;
  assert.equal((await gw.execute({ ...call, confirm: true })).reason, 'unmatched_confirm');
  store.putConnection({ ...record, provider_account_id: 'fake-new-account' });
  assert.equal((await gw.execute({ ...call, confirm: true })).reason, 'unmatched_confirm');
  assert.equal(calls.length, 0);
});

for (const [name, action, input, field] of [
  ['missing required', CHANGE.id, {}, 'label_name'],
  ['wrong string type', CHANGE.id, { label_name: 3 }, 'label_name'],
  ['wrong boolean type', READ.id, { include_details: 'true' }, 'include_details'],
  ['enum', CHANGE.id, { label_name: 'Work', message_list_visibility: 'labelShow' }, 'message_list_visibility'],
  ['undeclared', READ.id, { extra: 'never sent' }, 'extra'],
  ['narrowed read account selector', READ.id, { user_id: 'me' }, 'user_id'],
  ['narrowed change account selector', CHANGE.id, { label_name: 'Work', user_id: 'me' }, 'user_id'],
]) test(`curated input refuses ${name} before the provider`, async () => {
  const { gw, calls } = await fixture();
  assert.deepEqual(await gw.execute({ action, input }), { status: 'invalid_arguments', field });
  assert.equal(calls.length, 0);
  assert.equal(gw.pendingConfirmations.size, 0);
});

test('describe and search expose curated metadata; changes and sends are grantable, deletes are refused', async () => {
  const send = fixtureRow('send');
  const deleted = fixtureRow('delete');
  const { gw } = await fixture([...CURATED, send, deleted]);
  const described = await gw.callTool('describe_action', { action: CHANGE.id });
  assert.equal(described.curated, true);
  assert.equal(described.kind, 'change');
  assert.equal(described.summary, CHANGE.summary);
  assert.equal(described.source, 'catalog');
  assert.deepEqual(described.input, CHANGE.input_schema);
  described.input.required.length = 0;
  assert.deepEqual(gw.describeAction(CHANGE.id).input, CHANGE.input_schema, 'description cannot mutate the loaded schema');
  assert.deepEqual(gw.searchActions({ query: 'list_labels' }).actions, [{
    action: READ.id, privilege: 'write', risk: 'low', confirmation: 'none',
    description: READ.summary, curated: true, kind: READ.kind, summary: READ.summary,
  }]);
  for (const [row, phrase] of [[CHANGE, 'create a new Gmail label'], [send, 'send the named test item']]) {
    const checked = gw.standingApprovalScope({ mode: 'propose', actions: [row.id], root: 'Test' });
    assert.equal(checked.refusal, undefined);
    assert.deepEqual(checked.scope.actions, [row.id]);
    assert.deepEqual(checked.kinds, [row.kind]);
    assert.deepEqual(checked.summaries, [phrase]);
  }
  assert.equal(gw.standingApprovalScope({ mode: 'propose', actions: [READ.id], root: 'Test' }).refusal.reason, 'not_eligible');
  assert.deepEqual(gw.standingApprovalScope({ mode: 'propose', actions: [deleted.id], root: 'Test' }).refusal,
    { status: 'invalid_arguments', field: 'actions', reason: 'Delete actions cannot be covered by a standing approval.' });
});

test('invalid curated input cannot reach provider hydration with a missing connection', async () => {
  const { gw, fake, calls } = await fixture();
  gw.store = new JsonFileStore(makeHome());
  fake.auth.listAccounts = () => assert.fail('invalid input reached provider hydration');
  assert.deepEqual(await gw.execute({ action: CHANGE.id, input: {} }), { status: 'invalid_arguments', field: 'label_name' });
  assert.equal(calls.length, 0);
});

test('curated policy denial runs no provider and is audited on the catalog path', async () => {
  const { gw, calls, audit } = await fixture(CURATED, { role: 'readonly' });
  assert.equal((await gw.execute({ action: CHANGE.id, input: { label_name: 'Denied' }, confirm: true })).status, 'denied');
  assert.equal(calls.length, 0);
  assert.equal(gw.pendingConfirmations.size, 0);
  assert.equal(auditLines(audit)[0].path, 'catalog');
});

test('a curated row reads as a phrase inside the warning and the summary line, as a manifest summary does', async () => {
  const { gw } = await fixture();
  const scope = { actions: [CHANGE.id], root: 'Test', playbook: 'Test writes', days: null };
  const proposed = await gw.callTool('standing_approvals', { ...scope, mode: 'propose' });
  assert.ok(proposed.warning.startsWith('Create a new Gmail label without asking you each time'));
  const granted = await gw.callTool('standing_approvals', { ...scope, mode: 'grant', confirmed: true });
  assert.ok(granted.summary.startsWith('Lets your assistant create a new Gmail label on your connection'));
  assert.ok(granted.summary.endsWith(', with no end date, until you revoke it.'));
  for (const row of CURATED.filter((entry) => entry.kind === 'change' || entry.kind === 'send')) {
    const phrase = curatedActionDefinition(row).standing_approval.summary;
    assert.match(phrase, /^[a-z][^.]*[^.\s]$/, `${row.id}: "${phrase}"`);
  }
  // Reworded so the warning's "on your connection" cannot attach to their last words (session 2 review).
  for (const [id, phrase] of [['google.gmail.update_draft', 'change an unsent Gmail draft'],
    ['google.calendar.events_move', 'move an event between your calendars'],
    ['google.drive.create_file_from_text', 'create a Google Drive file from text']]) {
    assert.equal(curatedActionDefinition(CURATED.find((row) => row.id === id)).standing_approval.summary, phrase);
  }
});

test('curated changes and sends run under a matching grant; an injected grant cannot cover a delete', async () => {
  for (const row of [CHANGE, fixtureRow('send'), fixtureRow('delete')]) {
    const { gw, calls, record, audit } = await fixture([row]);
    const scope = { actions: [row.id], root: 'Test', playbook: 'Test writes', days: null };
    const input = row.kind === 'change' ? { label_name: 'Work' } : { target: 'item-1' };
    const call = { action: row.id, input, root: scope.root, playbook: scope.playbook };
    assert.equal((await gw.execute(call)).status, 'needs_confirmation');
    assert.equal(calls.length, 0);
    if (row.kind === 'delete') {
      gw.standingApprovals = { list: () => [{
        id: 'sa_injected_delete', actions: [row.id], kinds: ['delete'], summaries: [row.summary], cautions: [],
        root: scope.root, playbook: scope.playbook, label: null, where: null, heightened: true,
        provider_account_id: record.provider_account_id, created_at: new Date(gw.now()).toISOString(),
        expires_at: new Date(gw.now() + 86_400_000).toISOString(), revoked_at: null,
      }] };
      const stopped = await gw.execute(call);
      assert.equal(stopped.status, 'needs_confirmation');
      assert.equal(stopped.risk, 'destructive');
      assert.equal(stopped.standing_approval, undefined);
      assert.equal(calls.length, 0);
      assert.ok(auditLines(audit).every((line) => line.grant_id === null));
    } else {
      assert.equal((await gw.callTool('standing_approvals', { ...scope, mode: 'propose' })).status, 'standing_approval_proposed');
      const granted = await gw.callTool('standing_approvals', { ...scope, mode: 'grant', confirmed: true });
      assert.equal(granted.status, 'ok');
      const ran = await gw.execute(call);
      assert.equal(ran.ok, true);
      assert.deepEqual(ran.standing_approval, { id: granted.standing_approval.id, expires_at: null });
      assert.equal(calls.length, 1);
      assert.equal(calls[0].providerAccountId, record.provider_account_id);
      assert.equal(auditLines(audit).at(-1).grant_id, granted.standing_approval.id);
    }
  }
});

test('providers without curated(), including the second adapter, supply no rows', () => {
  for (const provider of [undefined, createFakeProviders().catalog, createStubProvider()]) {
    assert.deepEqual(loadCuratedActions(provider, CONNECTORS), { rows: [], errors: [] });
  }
});

test('a broken optional curated method reports a diagnostic without breaking construction or calls', async () => {
  const { opts } = await fixture();
  for (const curated of [() => { throw new Error('provider detail must not escape'); }, () => null, () => Promise.resolve([])]) {
    const provider = { ...opts.catalogProvider, curated };
    assert.equal(loadCuratedActions(provider, CONNECTORS).errors.length, 1);
    const gw = new ConnectionGateway({ ...opts, catalogProvider: provider });
    assert.equal((await gw.execute({ action: READ.id })).status, 'needs_connector');
  }
});

const INVALID = [
  ['two id parts', { id: 'google.gmail' }, 'invalid_id'],
  ['four id parts', { id: 'google.gmail.labels.list' }, 'invalid_id'],
  ['empty id part', { id: 'google..list_labels' }, 'invalid_id'],
  ['unknown module', { id: 'google.missing.list_labels' }, 'module_auth_mismatch'],
  ['wrong toolkit', { toolkit: 'OTHER' }, 'module_auth_mismatch'],
  ['manifest action', { id: 'google.gmail.list_messages' }, 'manifest_action'],
  ['unknown kind', { kind: 'publish' }, 'invalid_kind'],
  ['prototype kind', { kind: 'toString' }, 'invalid_kind'],
  ['non-string kind', { kind: ['read'] }, 'invalid_kind'],
];
for (const [name, patch, reason] of INVALID) test(`invalid curated row is skipped and check reports it: ${name}`, async () => {
  const row = { ...structuredClone(READ), ...patch };
  const checked = loadCuratedActions(providerForRows([row]), CONNECTORS);
  assert.deepEqual(checked.rows, []);
  assert.deepEqual(checked.errors, [{ id: row.id, reason }]);
  const { gw, calls } = await fixture([row]);
  if (reason === 'manifest_action') {
    assert.equal(gw.describeAction(row.id).curated, undefined);
    await gw.execute({ action: row.id, input: { query: 'hello' } });
    assert.equal(calls.length, 1, 'the hand-written action still runs');
  } else {
    assert.equal((await gw.execute({ action: row.id })).status, 'needs_connector');
    if (['two id parts', 'empty id part'].includes(name)) {
      assert.deepEqual(gw.describeAction(row.id), { status: 'needs_connector', action: row.id });
    } else {
      const [service, module] = row.id.split('.');
      // The fixture registers every supplied id as a provider mapping. A
      // rejected row contributes no schema or safety metadata to that mapping.
      assert.deepEqual(gw.describeAction(row.id), { action: row.id, service, module, source: 'catalog', input: null });
    }
    assert.equal(calls.length, 0);
  }
});

for (const kind of ['change', 'send', 'delete']) test(`a read-privilege module rejects curated ${kind}`, async () => {
  const connectors = CONNECTORS.map((c) => ({ ...c, manifest: structuredClone(c.manifest) }));
  connectors.find((c) => c.service === 'google').manifest.modules.gmail.auth.privilege = 'read';
  const row = fixtureRow(kind);
  assert.deepEqual(loadCuratedActions(providerForRows([row]), connectors).errors,
    [{ id: row.id, reason: 'insufficient_privilege' }]);
  const { gw, calls } = await fixture([row], { connectors });
  assert.equal((await gw.execute({ action: row.id, input: { target: 'item-1' } })).status, 'needs_connector');
  assert.equal(calls.length, 0);
});

test('a module with non-catalog auth rejects a curated row', async () => {
  const connectors = CONNECTORS.map((c) => ({ ...c, manifest: structuredClone(c.manifest) }));
  connectors.find((c) => c.service === 'google').manifest.modules.gmail.auth.provider = 'local-file';
  assert.deepEqual(loadCuratedActions(providerForRows([READ]), connectors).errors,
    [{ id: READ.id, reason: 'module_auth_mismatch' }]);
  const { gw, calls } = await fixture([READ], { connectors });
  assert.equal((await gw.execute({ action: READ.id })).status, 'needs_connector');
  assert.equal(calls.length, 0);
});

for (const [name, property, value] of [
  ['numeric bound', { type: 'number', minimum: 0, maximum: 10, exclusiveMinimum: -1, exclusiveMaximum: 11, multipleOf: 0.5 }, 2.5],
  ['string bound', { type: 'string', maxLength: 5 }, 'hello'],
  ['array bound', { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 2 }, ['hello']],
]) test(`curated schema accepts ${name} and preserves it for execution`, async () => {
  const schema = { type: 'object', properties: { value: property } };
  const row = { ...READ, input_schema: schema, key_fields: [] };
  assert.deepEqual(loadCuratedActions(providerForRows([row]), CONNECTORS), { rows: [row], errors: [] });
  const { gw, calls } = await fixture([row]);
  assert.deepEqual(gw.describeAction(row.id).input, schema);
  const input = { value };
  assert.deepEqual(await gw.execute({ action: row.id, input }), { ok: true, arguments: input });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].slug, row.tool);
  assert.deepEqual(calls[0].arguments, input);
  assert.equal(gw.pendingConfirmations.size, 0);
});

for (const [name, schema] of [
  ['composition', { type: 'object', oneOf: [{ required: ['id'] }] }],
  ['reference', { type: 'object', $ref: '#/$defs/input' }],
  ['union', { type: 'object', properties: { value: { type: ['string', 'null'] } } }],
  ['nested constraint', { type: 'object', properties: { value: { type: 'object', required: ['id'] } } }],
  ['object property', { type: 'object', properties: { value: { type: 'object' } } }],
  ['untyped property', { type: 'object', properties: { value: {} } }],
  ['untyped array items', { type: 'object', properties: { value: { type: 'array', maxItems: 2 } } }],
  ['array of arrays', { type: 'object', properties: { value: { type: 'array', items: { type: 'array', items: { type: 'string' } } } } }],
  ['array item constraint', { type: 'object', properties: { value: { type: 'array', items: { type: 'string', format: 'email' } } } }],
  ['open input', { type: 'object', additionalProperties: true }],
  ['invalid pattern', { type: 'object', properties: { value: { type: 'string', pattern: '[' } } }],
  ['malformed required', { type: 'object', required: true }],
  ['malformed properties', { type: 'object', properties: null }],
  ['boolean schema', true],
]) test(`unsupported curated schema is skipped and check reports it: ${name}`, async () => {
  const row = { ...READ, input_schema: schema, key_fields: [] };
  assert.deepEqual(loadCuratedActions(providerForRows([row]), CONNECTORS).errors,
    [{ id: row.id, reason: 'unsupported_input_schema' }]);
  const { gw, calls } = await fixture([row]);
  assert.equal((await gw.execute({ action: row.id, input: {} })).status, 'needs_connector');
  assert.deepEqual(gw.describeAction(row.id), {
    action: row.id, service: 'google', module: 'gmail', source: 'catalog', input: null,
  });
  assert.equal(calls.length, 0);
});

test('invalid rows do not hide valid siblings, and loaded data is a snapshot', async () => {
  const rows = structuredClone([READ, CHANGE]);
  const { gw, calls, reads } = await fixture(rows);
  rows[1].kind = 'read';
  rows[1].input_schema.required = [];
  assert.equal((await gw.execute({ action: CHANGE.id, input: {} })).status, 'invalid_arguments');
  assert.equal((await gw.execute({ action: CHANGE.id, input: { label_name: 'Work' } })).status, 'needs_confirmation');
  assert.equal(calls.length, 0);
  assert.equal(reads(), 1);
  const checked = loadCuratedActions(providerForRows([READ, { ...CHANGE, kind: 'unknown' }]), CONNECTORS);
  assert.deepEqual(checked.rows, [READ]);
  assert.deepEqual(checked.errors, [{ id: CHANGE.id, reason: 'invalid_kind' }]);
});

test('hosted construction with bound proxies preserves rows and hydrated pending confirmations across requests', async () => {
  const pendingConfirmations = new Map();
  const { gw, opts, calls, reads } = await fixture(CURATED, { pendingConfirmations });
  assert.equal(Object.hasOwn(opts, 'outputsDir'), false);
  assert.equal(Object.hasOwn(opts, 'inputFileAccess'), false);
  assert.equal(Object.hasOwn(opts, 'authConfigured'), false);
  assert.equal(gw.pendingConfirmations, pendingConfirmations);
  assert.equal(gw.listActions().filter((row) => row.curated).length, 46);
  assert.equal((await gw.execute({ action: READ.id, input: {} })).ok, true);
  const call = { action: CHANGE.id, input: { label_name: 'Across requests' } };
  assert.equal((await gw.execute(call)).status, 'needs_confirmation');
  assert.equal(pendingConfirmations.size, 1);
  const nextRequest = new ConnectionGateway(opts);
  assert.equal(nextRequest.pendingConfirmations, pendingConfirmations);
  assert.equal(nextRequest.listActions().filter((row) => row.curated).length, 46);
  assert.equal((await nextRequest.execute({ ...call, confirm: true })).ok, true);
  assert.equal(calls.length, 2);
  assert.equal(pendingConfirmations.size, 0);
  assert.equal(reads(), 2, 'one static read per request construction, through both proxies');
});
