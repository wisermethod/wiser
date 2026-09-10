import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestGateway, putActive } from '../../../gateway/test/fake-provider.js';
import { modules } from '../index.js';

const service = 'zoho';
const module = 'crm';
const privilege = 'write';
const cases = {
  get: {"input":{"id":"example","fields":"example","page":1,"per_page":1,"page_token":"example"},"required":["id"],"expected":{"ids":"example","fields":"example","page":1,"per_page":1,"page_token":"example","module_api_name":"Leads"},"result":{"data":[{"id":"lead-example"}]}},
  search: {"input":{"word":"example","email":"person@example.com","phone":"example","criteria":"example","fields":"example","page":1,"per_page":1},"required":[],"expected":{"word":"example","email":"person@example.com","phone":"example","criteria":"example","fields":"example","page":1,"per_page":1},"result":{"data":[{"id":"lead-example"}]}},
  create: {"input":{"last_name":"Example","first_name":"example","email":"person@example.com","company":"example","phone":"example","description":"example","lead_source":"example","lead_status":"example","website":"example"},"required":["last_name"],"expected":{"Last_Name":"Example","First_Name":"example","Email":"person@example.com","Company":"example","Phone":"example","Description":"example","Lead_Source":"example","Lead_Status":"example","Website":"example"},"result":{"data":[{"id":"lead-example","status":"success"}]}},
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

test('create requires confirmation once and readonly cannot use the write grant', async () => {
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service, module, privilege });
  const calls = [];
  const execute = fake.catalog.execute;
  fake.catalog.execute = async (request) => { calls.push(request); return execute(request); };
  const request = { action: 'zoho.crm.create', input: { last_name: 'Example' } };
  const needs = await gw.execute(request);
  assert.equal(needs.status, 'needs_confirmation');
  assert.equal(needs.action, request.action);
  assert.equal(calls.length, 0);
  assert.deepEqual(await gw.execute({ ...request, confirm: true }), cases.create.result);
  assert.deepEqual(await gw.execute(request), cases.create.result);
  const readonly = await createTestGateway({ role: 'readonly' });
  await putActive(readonly.store, readonly.fake, { service, module, privilege });
  readonly.fake.catalog.execute = async () => assert.fail('readonly reached catalog');
  for (const [action, fixture] of Object.entries(cases)) {
    assert.equal((await readonly.gw.execute({ action: `${service}.${module}.${action}`, input: fixture.input, confirm: true })).status, 'denied');
  }
});

test('get refuses a caller-selected CRM module', async () => {
  const ctx = { service, module, action: 'get', catalog: async () => assert.fail('module override reached catalog') };
  assert.deepEqual(await modules.crm.get({ id: 'lead-example', module_api_name: 'Contacts' }, ctx), { status: 'invalid_arguments', field: 'module_api_name' });
});

// M1 continued: invented fixtures for the separate family grants.
const familyCases = {
  "zoho.mail.list": {"input": {"account_id": "example", "status": "example", "sort_by": "example", "folder_id": "example", "search_key": "example", "limit": 1, "start": 1, "flagged": false, "sort_order": false, "threaded_mails": false, "only_attachment": false}, "required": ["account_id"], "expected": {"account_id": "example", "status": "example", "sort_by": "example", "folder_id": "example", "search_key": "example", "limit": 1, "start": 1, "flagged": false, "sort_order": false, "threaded_mails": false, "only_attachment": false}, "result": {"data": [{"id": "message-example"}]}, "enums": {}},
  "zoho.mail.get": {"input": {"folder_id": "example", "account_id": "example", "message_id": "example", "include_block_content": false}, "required": ["folder_id", "account_id", "message_id"], "expected": {"folder_id": "example", "account_id": "example", "message_id": "example", "include_block_content": false}, "result": {"data": {"id": "message-example"}}, "enums": {}},
  "zoho.books.list": {"input": {"status": "example", "date_end": "example", "page": 1}, "required": [], "expected": {"status": "example", "date_end": "example", "page": 1}, "result": {"data": [{"id": "invoice-example"}]}, "enums": {}},
  "zoho.books.get": {"input": {"invoice_id": "example", "print": false, "accept": "json"}, "required": ["invoice_id"], "expected": {"invoice_id": "example", "print": false, "accept": "json"}, "result": {"data": {"id": "invoice-example"}}, "enums": {"accept": ["json", "pdf", "html"]}},
  "zoho.desk.list": {"input": {"orgId": "example", "viewId": "example", "from": 1, "limit": 1}, "required": [], "expected": {"orgId": "example", "viewId": "example", "from": 1, "limit": 1}, "result": {"data": [{"id": "ticket-example"}]}, "enums": {}},
  "zoho.desk.get": {"input": {"orgId": "example", "include": "example", "ticket_id": 1}, "required": ["ticket_id"], "expected": {"orgId": "example", "include": "example", "ticket_id": 1}, "result": {"data": {"id": "ticket-example"}}, "enums": {}},
  "zoho.inventory.list": {"input": {"organization_id": "example"}, "required": [], "expected": {"organization_id": "example"}, "result": {"data": [{"id": "contact-example"}]}, "enums": {}},
  "zoho.inventory.get": {"input": {"contact_id": "example", "organization_id": "example"}, "required": ["contact_id"], "expected": {"contact_id": "example", "organization_id": "example"}, "result": {"data": {"id": "contact-example"}}, "enums": {}},
  "zoho.invoice.list": {"input": {"date": "example", "email": "person@example.com", "organization_id": "example", "page": 1}, "required": [], "expected": {"date": "example", "email": "person@example.com", "organization_id": "example", "page": 1}, "result": {"data": [{"id": "invoice-example"}]}, "enums": {}},
  "zoho.invoice.get": {"input": {"invoice_id": "example", "organization_id": "example"}, "required": ["invoice_id", "organization_id"], "expected": {"invoice_id": "example", "organization_id": "example"}, "result": {"data": {"id": "invoice-example"}}, "enums": {}},
  "zoho.bigin.list": {"input": {"fields": "example", "cvid": "example", "page_token": "example", "page": 1, "per_page": 1}, "required": ["fields"], "expected": {"fields": "example", "cvid": "example", "page_token": "example", "page": 1, "per_page": 1, "module_api_name": "Contacts"}, "result": {"data": [{"id": "contact-example"}]}, "enums": {}},
  "zoho.bigin.get": {"input": {"record_id": "example"}, "required": ["record_id"], "expected": {"record_id": "example", "module_api_name": "Contacts"}, "result": {"data": {"id": "contact-example"}}, "enums": {}},
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
    assert.deepEqual(calls[0].arguments, module === 'bigin' ? { ...input, module_api_name: 'Contacts' } : input);
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
      'zoho.inventory.list': ['page', 'per_page', 'search_text', 'filter_by'],
      'zoho.bigin.list': ['word', 'email', 'phone', 'criteria'],
    };
    const forbidden = ['undeclared', 'use_bearer_auth', ...(module === 'mail' ? ['region', 'accept_language'] : []), ...(module === 'bigin' ? ['module', 'module_api_name'] : [])];
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
