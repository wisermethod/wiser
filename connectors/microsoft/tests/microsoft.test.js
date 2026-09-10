import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestGateway, putActive } from '../../../gateway/test/fake-provider.js';
import { modules } from '../index.js';

const service = 'microsoft';
const module = 'outlook';
const privilege = 'read';
const cases = {
  list_messages: {"input":{"folder":"example","search":"example","top":1,"skip":1,"page_token":"example","subject":"example","is_read":false},"required":[],"expected":{"folder":"example","search":"example","top":1,"skip":1,"page_token":"example","subject":"example","is_read":false},"result":{"value":[{"id":"msg-example"}]}},
  get_message: {"input":{"message_id":"example","select":["example"]},"required":["message_id"],"expected":{"message_id":"example","select":["example"]},"result":{"id":"msg-example"}},
};

test('every action needs_connect before the module grant and starts nothing', async () => {
  const { gw, fake } = await createTestGateway();
  fake.catalog.execute = async () => assert.fail('unconnected action reached catalog');
  for (const [action, fixture] of Object.entries(cases)) {
    const result = await gw.execute({ action: `${service}.${module}.${action}`, input: fixture.input });
    assert.equal(result.status, 'needs_connect');
    assert.equal(result.module, module);
  }
  assert.equal(fake.accounts.size, 0);
});

for (const [action, fixture] of Object.entries(cases)) {
  test(`${action} forwards approved inputs and exposes the invented result after grant`, async () => {
    const { gw, store, fake } = await createTestGateway();
    await putActive(store, fake, { service, module, privilege });
    const calls = [];
    const execute = fake.catalog.execute;
    fake.catalog.execute = async (request) => { calls.push(request); return execute(request); };
    const input = structuredClone(fixture.input);
    const result = await gw.execute({ action: `${service}.${module}.${action}`, input, confirm: true });
    assert.deepEqual(result, fixture.result);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].actionId, `${service}.${module}.${action}`);
    assert.deepEqual(calls[0].arguments, fixture.expected);
    assert.deepEqual(input, fixture.input, 'caller input must not be mutated');
  });

  test(`${action} accepts only the required inputs and preserves failure statuses`, async () => {
    const { gw, store, fake } = await createTestGateway();
    await putActive(store, fake, { service, module, privilege });
    const input = Object.fromEntries(fixture.required.map((field) => [field, fixture.input[field]]));
    assert.deepEqual(await gw.execute({ action: `${service}.${module}.${action}`, input, confirm: true }), fixture.result);
    const failure = { status: 'vendor_error', error: { code: 'vendor_error', endpoint: '/example', method: 'GET' } };
    const ctx = { service, module, action, catalog: async () => failure };
    assert.equal(await modules[module][action](input, ctx), failure);
  });

  test(`${action} refuses missing, mistyped, and undeclared fields before transport`, async () => {
    const { gw, store, fake } = await createTestGateway();
    await putActive(store, fake, { service, module, privilege });
    fake.catalog.execute = async () => assert.fail('invalid input reached catalog');
    const invalid = [{ input: { ...fixture.input, undeclared: 'example' }, field: 'undeclared' }];
    for (const field of fixture.required) {
      const input = { ...fixture.input }; delete input[field];
      invalid.push({ input, field });
      const wrong = typeof fixture.input[field] === 'string' ? ['', ' ', 1] : ['1', 1.5];
      for (const value of wrong) invalid.push({ input: { ...fixture.input, [field]: value }, field });
    }
    for (const [field, value] of Object.entries(fixture.input)) {
      invalid.push({ input: { ...fixture.input, [field]: null }, field });
      const wrong = Array.isArray(value) ? ['example', [null]] : [typeof value === 'string' ? 1 : 'example'];
      for (const item of wrong) invalid.push({ input: { ...fixture.input, [field]: item }, field });
    }
    for (const { input, field } of invalid) {
      assert.deepEqual(await gw.execute({ action: `${service}.${module}.${action}`, input, confirm: true }), { status: 'invalid_arguments', field });
    }
    const ctx = { service, module, action, catalog: async () => assert.fail('malformed input reached catalog') };
    for (const input of [null, [], 'example', 1]) {
      assert.deepEqual(await modules[module][action](input, ctx), { status: 'invalid_arguments', field: 'input' });
    }
  });
}

test('Outlook refuses user_id and another service grant does not unlock it', async () => {
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'google', module: 'gmail', privilege: 'read' });
  assert.equal((await gw.execute({ action: 'microsoft.outlook.list_messages', input: {} })).status, 'needs_connect');
  await putActive(store, fake, { service, module, privilege });
  fake.catalog.execute = async () => assert.fail('user override reached catalog');
  for (const [action, fixture] of Object.entries(cases)) {
    assert.deepEqual(await gw.execute({ action: `${service}.${module}.${action}`, input: { ...fixture.input, user_id: 'another-user' } }), { status: 'invalid_arguments', field: 'user_id' });
  }
});

// M1 continued: invented fixtures for the separate family grants.
const familyCases = {
  "microsoft.calendar.list_events": {"input": {"filter": "example", "timezone": "example", "page_token": "example", "calendar_id": "example", "top": 1, "skip": 1, "expand_recurring_events": false, "include_sensitivity_label": false, "select": ["example"]}, "required": [], "expected": {"filter": "example", "timezone": "example", "page_token": "example", "calendar_id": "example", "top": 1, "skip": 1, "expand_recurring_events": false, "include_sensitivity_label": false, "select": ["example"]}, "result": {"value": [{"id": "event-example"}]}, "enums": {}},
  "microsoft.calendar.get_event": {"input": {"event_id": "example", "include_sensitivity_label": false}, "required": ["event_id"], "expected": {"event_id": "example", "include_sensitivity_label": false}, "result": {"id": "event-example"}, "enums": {}},
  "microsoft.onedrive.find": {"input": {"q": "example", "expand": "example", "select": "example", "orderby": "example", "drive_id": "example", "page_token": "example", "top": 1, "search_scope": "drive"}, "required": ["q"], "expected": {"q": "example", "expand": "example", "select": "example", "orderby": "example", "drive_id": "example", "page_token": "example", "top": 1, "search_scope": "drive"}, "result": {"value": [{"id": "item-example", "name": "Example"}]}, "enums": {"search_scope": ["drive", "root"]}},
  "microsoft.onedrive.get": {"input": {"item_id": "example", "drive_id": "example", "select_fields": ["example"], "expand_relations": ["example"]}, "required": ["item_id"], "expected": {"item_id": "example", "drive_id": "example", "select_fields": ["example"], "expand_relations": ["example"]}, "result": {"id": "item-example", "name": "Example"}, "enums": {}},
  "microsoft.sharepoint.list": {"input": {"expand": "example", "filter": "example", "select": "example", "orderby": "example", "site_name": "example", "top": 1, "skip": 1}, "required": [], "expected": {"expand": "example", "filter": "example", "select": "example", "orderby": "example", "site_name": "example", "top": 1, "skip": 1}, "result": {"value": [{"id": "list-example"}]}, "enums": {}},
  "microsoft.sharepoint.get": {"input": {"list_title": "example", "site_name": "example"}, "required": ["list_title"], "expected": {"list_title": "example", "site_name": "example"}, "result": {"id": "list-example"}, "enums": {}},
  "microsoft.excel.search": {"input": {"query": "example", "drive_id": "example", "skip_token": "example", "top": 1, "scope": "drive"}, "required": ["query"], "expected": {"query": "example", "drive_id": "example", "skip_token": "example", "top": 1, "scope": "drive"}, "result": {"value": [{"id": "file-example", "name": "Example.xlsx"}]}, "enums": {"scope": ["drive", "root"]}},
  "microsoft.excel.get_values": {"input": {"address": "Sheet1!A1:B1", "item_id": "example", "worksheet_id": "example", "drive_id": "example", "session_id": "example"}, "required": ["address", "item_id", "worksheet_id"], "expected": {"address": "Sheet1!A1:B1", "item_id": "example", "worksheet_id": "example", "drive_id": "example", "session_id": "example"}, "result": {"id": "range-example", "values": [["Example"]]}, "enums": {}},
  "microsoft.teams.list": {"input": {"page_token": "example"}, "required": [], "expected": {"page_token": "example", "user_id": "me"}, "result": {"value": [{"id": "team-example"}]}, "enums": {}},
  "microsoft.teams.get": {"input": {"group_id": "example", "expand": "example", "select": "example"}, "required": ["group_id"], "expected": {"group_id": "example", "expand": "example", "select": "example"}, "result": {"id": "team-example"}, "enums": {}},
};

for (const [id, fixture] of Object.entries(familyCases)) {
  const [, module, action] = id.split('.');
  test(`${id} needs its own grant and forwards approved inputs unchanged`, async () => {
    const { gw, store, fake } = await createTestGateway();
    const calls = [];
    const execute = fake.catalog.execute;
    fake.catalog.execute = async (request) => { calls.push(request); return execute(request); };
    const stopped = await gw.execute({ action: id, input: fixture.input });
    assert.equal(stopped.status, 'needs_connect');
    assert.equal(stopped.module, module);
    assert.equal(calls.length, 0);
    assert.equal(fake.accounts.size, 0);
    await putActive(store, fake, { service, module, privilege: 'read' });
    const input = structuredClone(fixture.input);
    assert.deepEqual(await gw.execute({ action: id, input }), fixture.result);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].actionId, id);
    assert.deepEqual(calls[0].arguments, fixture.expected);
    assert.deepEqual(input, fixture.input, 'caller input must not be mutated');
  });

  test(`${id} accepts required-only inputs and preserves failure statuses`, async () => {
    const { gw, store, fake } = await createTestGateway({ role: 'readonly' });
    await putActive(store, fake, { service, module, privilege: 'read' });
    const input = Object.fromEntries(fixture.required.map((field) => [field, fixture.input[field]]));
    const calls = [];
    const execute = fake.catalog.execute;
    fake.catalog.execute = async (request) => { calls.push(request); return execute(request); };
    assert.deepEqual(await gw.execute({ action: id, input }), fixture.result);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].arguments, module === 'teams' && action === 'list' ? { ...input, user_id: 'me' } : input);
    for (const status of ['vendor_error', 'needs_connect', 'needs_provider']) {
      const failure = { status, error: { code: status, endpoint: '/example', method: 'GET' } };
      const ctx = { service, module, action, catalog: async () => failure };
      assert.equal(await modules[module][action](input, ctx), failure);
    }
  });

  test(`${id} refuses missing, mistyped, and undeclared fields before transport`, async () => {
    const { gw, store, fake } = await createTestGateway();
    await putActive(store, fake, { service, module, privilege: 'read' });
    fake.catalog.execute = async () => assert.fail('invalid input reached catalog');
    const invalid = [];
    const excluded = {
      'microsoft.calendar.list_events': ['orderby'],
      'microsoft.onedrive.find': ['internal_transform', 'transform'],
      'microsoft.sharepoint.list': ['skiptoken', 'search'],
      'microsoft.sharepoint.get': ['expand', 'select'],
      'microsoft.teams.list': ['top', 'filter'],
      'microsoft.teams.get': ['chat_id'],
    };
    const forbidden = ['undeclared', 'user_id'];
    for (const field of [...forbidden, ...(excluded[id] ?? [])]) invalid.push({ input: { ...fixture.input, [field]: 'example' }, field });
    for (const field of fixture.required) {
      const input = { ...fixture.input }; delete input[field];
      invalid.push({ input, field });
      const wrong = typeof fixture.input[field] === 'string' ? ['', ' ', 1] : ['1', 1.5];
      for (const value of wrong) invalid.push({ input: { ...fixture.input, [field]: value }, field });
    }
    for (const [field, value] of Object.entries(fixture.input)) {
      invalid.push({ input: { ...fixture.input, [field]: null }, field });
      const wrong = Array.isArray(value) ? ['example', [null], [1], Array(1)]
        : typeof value === 'number' && Number.isInteger(value) ? ['1', 1.5]
        : [typeof value === 'string' ? 1 : 'example'];
      for (const item of wrong) invalid.push({ input: { ...fixture.input, [field]: item }, field });
    }
    for (const field of Object.keys(fixture.enums)) invalid.push({ input: { ...fixture.input, [field]: 'not-an-approved-value' }, field });
    for (const { input, field } of invalid) {
      assert.deepEqual(await gw.execute({ action: id, input }), { status: 'invalid_arguments', field });
    }
    const ctx = { service, module, action, catalog: async () => assert.fail('malformed input reached catalog') };
    for (const input of [null, [], 'example', 1, undefined]) {
      assert.deepEqual(await modules[module][action](input, ctx), { status: 'invalid_arguments', field: 'input' });
    }
  });

  for (const [field, values] of Object.entries(fixture.enums)) {
    test(`${id} forwards every approved ${field} enum value`, async () => {
      const { gw, store, fake } = await createTestGateway();
      await putActive(store, fake, { service, module, privilege: 'read' });
      for (const value of values) {
        fake.catalog.setResult(fake.catalog.toSlug(id), (args) => {
          assert.equal(args[field], value);
          return fixture.result;
        });
        assert.deepEqual(await gw.execute({ action: id, input: { ...fixture.input, [field]: value } }), fixture.result);
      }
    });
  }
}

const isolationCases = {
  ...Object.fromEntries(Object.entries(cases).map(([action, fixture]) => [`${service}.${module}.${action}`, fixture])),
  ...familyCases,
};
for (const grant of Object.keys(modules)) {
  test(`${service}.${grant} grant unlocks only its own module`, async () => {
    const { gw, store, fake } = await createTestGateway();
    await putActive(store, fake, { service, module: grant, privilege: service === 'zoho' && grant === 'crm' ? 'write' : 'read' });
    const calls = [];
    const execute = fake.catalog.execute;
    fake.catalog.execute = async (request) => { calls.push(request); return execute(request); };
    for (const [id, fixture] of Object.entries(isolationCases)) {
      const target = id.split('.')[1];
      const result = await gw.execute({ action: id, input: fixture.input, confirm: true });
      if (target === grant) assert.deepEqual(result, fixture.result);
      else {
        assert.equal(result.status, 'needs_connect', id);
        assert.equal(result.module, target);
      }
    }
    assert.ok(calls.length > 0);
    assert.ok(calls.every((request) => request.actionId.split('.')[1] === grant));
    assert.equal(fake.accounts.size, 1);
  });
}

test('facade exports exactly the approved first slices', () => {
  const ids = Object.entries(modules).flatMap(([module, actions]) => Object.keys(actions).map((action) => `${service}.${module}.${action}`));
  assert.deepEqual(ids.sort(), Object.keys(isolationCases).sort());
});
