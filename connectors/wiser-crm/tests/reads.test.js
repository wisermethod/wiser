import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { recordPath } from '../index.js';
import { installToolkitRow } from '../../../gateway/providers/composio/custom-toolkits.js';
import { toolkitFor } from '../../../gateway/providers/composio/mapping.js';
import { createFakeProviders, createTestGateway, makeHome } from '../../../gateway/test/fake-provider.js';

const SERVICE = 'wiser-crm';
const LABEL = 'test-install';
const ORIGIN = 'https://crm.example.test';
const CONNECTORS = fileURLToPath(new URL('../..', import.meta.url));
// Offline v0.3.1 capture, keyed by source filename. Refusals keep the
// adapter's status and error envelope with the CRM body removed.
const captures = JSON.parse(readFileSync(new URL('./v0.3.1-captures.json', import.meta.url), 'utf8'));
const capture = (number) => Object.entries(captures)
  .find(([name]) => name.startsWith(`${String(number).padStart(2, '0')}-`))[1];
const recordId = (number) => capture(number).endpoint.split('/').at(-1);

async function setup(t, { grant = true } = {}) {
  const home = makeHome();
  t.after(() => rmSync(home, { recursive: true, force: true }));
  let answer;
  const fake = createFakeProviders({ proxyRules: [{ match: () => true, result: () => answer }] });
  fake.auth.installToolkitRow = installToolkitRow;
  const proxy = t.mock.method(fake.auth, 'proxy');
  t.mock.method(fake.catalog, 'execute', () => assert.fail('expected proxy transport'));
  const { gw, store, connectors } = await createTestGateway({
    home, fake, connectorDirs: [CONNECTORS], session: false,
    installOrigin: (service, label) => service === SERVICE && label === LABEL ? ORIGIN : undefined,
  });
  const connector = connectors.find(({ id }) => id === SERVICE);
  const connection = { service: SERVICE, module: 'records', label: LABEL };
  if (grant) {
    const link = await gw.callTool('start_connect', connection);
    assert.equal(link.status, 'link');
    assert.equal(link.install_origin, ORIGIN);
    fake.auth.setStatus(store.getConnection(connection).provider_account_id, 'ACTIVE');
    assert.equal((await gw.callTool('connect_status', connection)).status, 'connected');
  }
  return {
    connector,
    reply(value) { answer = value; },
    execute(action, input) { return gw.execute({ action: `${SERVICE}.${action}`, label: LABEL, input }); },
    calls() { return proxy.mock.calls.map(({ arguments: [request] }) => request); },
    audit() { return readFileSync(join(home, 'audit.jsonl'), 'utf8'); },
  };
}

const cases = [
  ['companies list', 'records.list', { entity: 'companies' }, 10, ['companies', 'total', 'page', 'limit']],
  ['contacts list', 'records.list', { entity: 'contacts' }, 18, ['contacts', 'total', 'page', 'limit']],
  ['deals list', 'records.list', { entity: 'deals' }, 26, ['deals', 'total', 'page', 'limit', 'totalValue']],
  ['company detail', 'records.get', { entity: 'companies', id: recordId(12) }, 12, ['company']],
  ['contact detail', 'records.get', { entity: 'contacts', id: recordId(20) }, 20, ['contact']],
  ['deal detail', 'records.get', { entity: 'deals', id: recordId(28) }, 28, ['deal']],
  ['email lookup', 'records.lookup', capture(42).query, 42, ['contact', 'company', 'deals', 'last_call_at', 'next_meeting']],
  ['domain lookup', 'records.lookup', capture(43).query, 43],
  ['empty lookup', 'records.lookup', capture(64).query, 64],
  ['stages', 'records.stages', {}, 1, ['stages']],
  ['fields', 'records.fields', {}, 46, ['defs']],
  ['instance', 'records.instance', {}, 57, ['instance', 'version', 'caller', 'read_only']],
  ['contact activities', 'activities.list', capture(51).query, 51, ['activities']],
  ['deal activities', 'activities.list', capture(41).query, 41],
  ['people', 'people.list', {}, 58, ['you', 'people']],
  ['empty deals list', 'records.list', { entity: 'deals' }, 62],
  ...[
    ['search and status', 'contacts', 34],
    ['contacts by company', 'contacts', 35],
    ['deals by company', 'deals', 36],
    ['deals by contact', 'deals', 37],
    ['deals by stage', 'deals', 38],
  ].map(([name, entity, number]) => [name, 'records.list', { entity, ...capture(number).query }, number]),
];

function assertRequest(f, endpoint, query = {}) {
  const request = f.calls().at(-1);
  assert.ok(request);
  assert.equal(request.endpoint, endpoint);
  assert.match(request.endpoint, /^\/(?!\/)/);
  assert.equal(request.method, 'GET');
  assert.equal(request.body, undefined);
  const parameters = Object.entries(query).map(([name, value]) => ({ name, value: String(value), type: 'query' }));
  assert.deepEqual(request.parameters ?? [], parameters);
}

test('manifest and exports contain exactly the eight per-install proxy reads with no static toolkit', async (t) => {
  const { connector } = await setup(t, { grant: false });
  const expected = {
    records: ['list', 'get', 'lookup', 'stages', 'fields', 'instance'],
    activities: ['list'],
    people: ['list'],
  };
  assert.deepEqual(Object.keys(connector.manifest.modules).sort(), Object.keys(expected).sort());
  for (const [module, actions] of Object.entries(expected)) {
    const declared = connector.manifest.modules[module];
    assert.deepEqual(declared.auth, { provider: 'catalog', per_install: true, scheme: 'API_KEY', privilege: 'write' });
    assert.equal(declared.unwrap_token, false);
    assert.equal(declared.fallback, 'none');
    assert.equal(toolkitFor(SERVICE, module), null);
    assert.deepEqual(Object.keys(declared.actions).sort(), [...actions].sort());
    for (const action of Object.values(declared.actions)) {
      assert.equal(action.execution.prefer, 'proxy');
      assert.equal(action.risk, 'low');
      assert.equal(action.confirmation, 'none');
      assert.equal(action.input.additionalProperties, false);
    }
  }
  assert.deepEqual(connector.manifest.modules.records.actions.lookup.input.anyOf, [
    { required: ['email'] }, { required: ['domain'] },
  ]);
});

for (const [action, input] of [
  ['records.instance', {}],
  ['activities.list', capture(51).query],
  ['people.list', {}],
]) {
  test(`${action} needs a labelled grant before transport`, async (t) => {
    const f = await setup(t, { grant: false });
    const answer = await f.execute(action, input);
    assert.equal(answer.status, 'needs_connect');
    assert.equal(answer.label, LABEL);
    assert.deepEqual(f.calls(), []);
  });
}

for (const [name, action, input, number, fields = []] of cases) {
  const { endpoint, query, answer } = capture(number);
  test(`${name} reaches its fixed endpoint and returns the captured shape`, async (t) => {
    const f = await setup(t);
    f.reply(answer);
    assert.deepEqual(await f.execute(action, input), answer.data);
    assert.equal(f.calls().length, 1);
    assertRequest(f, endpoint, query);
  });

  for (const field of fields) {
    test(`${name} refuses a malformed ${field} in the response`, async (t) => {
      const f = await setup(t);
      const data = { ...answer.data, [field]: 0 };
      if (typeof answer.data[field] === 'number') data[field] = '0';
      f.reply({ ...answer, data });
      assert.deepEqual(await f.execute(action, input), {
        status: 'vendor_error', reason: 'not_crm_answer', http_status: 200, endpoint,
      });
      assert.equal(f.calls().length, 1);
    });
  }
}

test('gateway schema refuses undeclared keys, mistyped fields, missing required fields and non-object input', async (t) => {
  const f = await setup(t);
  const id = recordId(20);
  const entity = 'contacts';
  // Keep the template's schema-enforcement block at the gateway boundary.
  for (const [input, field] of [
    [{ entity, id, undeclared: 'example' }, 'undeclared'],
    [{ entity, id: 12345 }, 'id'],
    [{ entity }, 'id'],
  ]) {
    assert.deepEqual(await f.execute('records.get', input), { status: 'invalid_arguments', field });
  }
  for (const input of [null, [], 'example', 1]) {
    assert.deepEqual(await f.execute('records.get', input), { status: 'invalid_arguments', field: 'input' });
  }
  assert.deepEqual(f.calls(), []);
});

for (const value of ['https://evil.example/x', '//evil.example/x']) {
  test(`C2 treats ${value} as a query value or refuses it by pattern`, async (t) => {
    const f = await setup(t);
    f.reply(capture(18).answer);
    assert.deepEqual(await f.execute('records.list', { entity: 'contacts', search: value, status: value }), capture(18).answer.data);
    assertRequest(f, '/api/contacts', { search: value, status: value });
    f.reply(capture(42).answer);
    assert.deepEqual(await f.execute('records.lookup', { email: value }), capture(42).answer.data);
    assertRequest(f, '/api/lookup', { email: value });

    for (const field of ['stage', 'company_id', 'contact_id']) {
      assert.deepEqual(await f.execute('records.list', { entity: 'deals', [field]: value }), { status: 'invalid_arguments', field });
    }
    assert.deepEqual(await f.execute('records.lookup', { domain: value }), { status: 'invalid_arguments', field: 'domain' });
    assert.deepEqual(await f.execute('records.get', { entity: 'deals', id: value }), { status: 'invalid_arguments', field: 'id' });
    assert.deepEqual(await f.execute('activities.list', { entity_type: 'deal', entity_id: value }), { status: 'invalid_arguments', field: 'entity_id' });
    assert.equal(f.calls().length, 2);
  });
}

test('C2 record path builder encodes URL-shaped IDs inside one segment', () => {
  assert.equal(recordPath('contacts', 'https://evil.example/x'), '/api/contacts/https%3A%2F%2Fevil.example%2Fx');
  assert.equal(recordPath('deals', '//evil.example/x'), '/api/deals/%2F%2Fevil.example%2Fx');
});

test('list oneOf refuses each entity-specific filter outside the declared branches', async (t) => {
  const f = await setup(t);
  for (const [entity, field, value] of [
    ['companies', 'status', 'lead'],
    ['deals', 'status', 'lead'],
    ['companies', 'company_id', recordId(12)],
    ['companies', 'contact_id', recordId(20)],
    ['contacts', 'contact_id', recordId(20)],
    ['companies', 'stage', 'prospect'],
    ['contacts', 'stage', 'prospect'],
  ]) {
    assert.deepEqual(await f.execute('records.list', { entity, [field]: value }), { status: 'invalid_arguments', field });
  }
  assert.deepEqual(f.calls(), []);
});

test('lookup anyOf accepts both selectors and refuses neither', async (t) => {
  const f = await setup(t);
  const input = { ...capture(42).query, ...capture(43).query };
  f.reply(capture(42).answer);
  assert.deepEqual(await f.execute('records.lookup', input), capture(42).answer.data);
  assertRequest(f, '/api/lookup', input);
  assert.deepEqual(await f.execute('records.lookup', {}), { status: 'invalid_arguments', field: 'email' });
  assert.equal(f.calls().length, 1);
});

test('lookup rejects noncanonical hostnames before transport', async (t) => {
  const f = await setup(t);
  for (const domain of [
    'EXAMPLE.com', 'example.com.', 'example..com', '-example.com', 'example-.com',
    'example', '127.0.0.1', '0x7f.0.0.1', 'test.123', 'crm.localhost', 'crm.local',
    'crm.internal', 'xn--exmple-cua.com', `${'a'.repeat(64)}.com`,
  ]) {
    assert.deepEqual(await f.execute('records.lookup', { domain }), { status: 'invalid_arguments', field: 'domain' }, domain);
  }
  assert.deepEqual(f.calls(), []);
});

test('numeric bounds and code-point limits are inclusive and query numbers are strings', async (t) => {
  const f = await setup(t);
  f.reply(capture(18).answer);
  for (const [page, limit] of [[1, 1], [10000, 100]]) {
    const query = { page, limit, search: '🙂'.repeat(200), status: '🙂'.repeat(64) };
    assert.deepEqual(await f.execute('records.list', { entity: 'contacts', ...query }), capture(18).answer.data);
    assertRequest(f, '/api/contacts', query);
  }
  for (const [field, value] of [
    ['page', 0], ['page', 10001], ['limit', 0], ['limit', 101],
    ['search', '🙂'.repeat(201)], ['status', '🙂'.repeat(65)],
  ]) {
    assert.deepEqual(await f.execute('records.list', { entity: 'contacts', [field]: value }), { status: 'invalid_arguments', field });
  }
  f.reply(capture(42).answer);
  const email = '🙂'.repeat(254);
  assert.deepEqual(await f.execute('records.lookup', { email }), capture(42).answer.data);
  assertRequest(f, '/api/lookup', { email });
  assert.deepEqual(await f.execute('records.lookup', { email: `${email}🙂` }), { status: 'invalid_arguments', field: 'email' });
  const atLimit = [63, 63, 63, 61].map((n) => 'a'.repeat(n)).join('.');
  assert.equal(atLimit.length, 253);
  assert.deepEqual(await f.execute('records.lookup', { domain: atLimit }), capture(42).answer.data);
  assertRequest(f, '/api/lookup', { domain: atLimit });
  assert.deepEqual(await f.execute('records.lookup', { domain: `${atLimit}a` }), { status: 'invalid_arguments', field: 'domain' });
  assert.equal(f.calls().length, 4);
});

test('a JSON string is parsed and transport headers stay out of the answer and audit', async (t) => {
  const f = await setup(t);
  const { answer } = capture(57);
  const marker = 'invented-header-value';
  f.reply({ ...answer, data: JSON.stringify(answer.data), headers: { location: marker, 'x-test': marker } });
  assert.deepEqual(await f.execute('records.instance', {}), answer.data);
  assert.equal(f.audit().includes(marker), false);
});

test('HTML and non-object JSON answers contain no body in the refusal or audit', async (t) => {
  const f = await setup(t);
  const marker = 'invented-private-body';
  const { endpoint, answer } = capture(57);
  for (const data of [`<html>${marker}</html>`, JSON.stringify(marker), JSON.stringify([marker]), null, [marker]]) {
    f.reply({ ...answer, data });
    const refused = await f.execute('records.instance', {});
    assert.deepEqual(refused, { status: 'vendor_error', reason: 'not_crm_answer', http_status: 200, endpoint });
    assert.equal(JSON.stringify(refused).includes(marker), false);
  }
  assert.equal(f.audit().includes(marker), false);
});

for (const [name, action, input, number] of [
  ['missing company', 'records.get', { entity: 'companies', id: recordId(13) }, 13],
  ['missing contact', 'records.get', { entity: 'contacts', id: recordId(21) }, 21],
  ['missing deal', 'records.get', { entity: 'deals', id: recordId(29) }, 29],
  ['read-only stages', 'records.stages', {}, 68],
  ['read-only deals list', 'records.list', { entity: 'deals' }, 69],
  ['read-only deal detail', 'records.get', { entity: 'deals', id: recordId(70) }, 70],
  ['read-only lookup', 'records.lookup', capture(71).query, 71],
]) {
  test(`${name} reports only the refusal status and endpoint`, async (t) => {
    const f = await setup(t);
    const { endpoint, query, answer } = capture(number);
    assert.equal(Object.hasOwn(answer, 'data'), false);
    f.reply(answer);
    assert.deepEqual(await f.execute(action, input), { status: 'vendor_error', http_status: answer.status, endpoint });
    assertRequest(f, endpoint, query);
  });
}

test('lookup returns a booked meeting and a last call unchanged, and refuses either in another type', async (t) => {
  const f = await setup(t);
  const { answer } = capture(42);
  const data = {
    ...answer.data,
    last_call_at: '2026-11-20T15:00:00.000Z',
    next_meeting: { title: 'Invented review', starts_at: '2026-12-01T16:00:00.000Z' },
  };
  f.reply({ ...answer, data });
  assert.deepEqual(await f.execute('records.lookup', capture(42).query), data);
  for (const changed of [{ last_call_at: 1764000000 }, { next_meeting: 'Invented review' }]) {
    f.reply({ ...answer, data: { ...data, ...changed } });
    assert.equal((await f.execute('records.lookup', capture(42).query)).reason, 'not_crm_answer');
  }
});

test('a non-200 answer that still carries data does not echo it', async (t) => {
  const f = await setup(t);
  const marker = 'invented-redirect-body';
  for (const status of [204, 302]) {
    f.reply({ status, data: { instance: marker, note: marker } });
    const refused = await f.execute('records.instance', {});
    assert.deepEqual(refused, { status: 'vendor_error', http_status: status, endpoint: '/api/wiser/instance' });
    assert.equal(JSON.stringify(refused).includes(marker), false);
  }
});

test('a refusal drops provider codes and method, keeping status and endpoint only', async (t) => {
  const f = await setup(t);
  f.reply({ status: 404, error: { code: 'vendor_error', endpoint: '/api/wiser/instance', method: 'GET', provider_codes: [9999] } });
  const refused = await f.execute('records.instance', {});
  assert.deepEqual(refused, { status: 'vendor_error', http_status: 404, endpoint: '/api/wiser/instance' });
  assert.equal(JSON.stringify(refused).includes('9999'), false);
});
