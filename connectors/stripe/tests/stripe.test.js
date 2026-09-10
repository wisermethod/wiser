import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestGateway, putActive } from '../../../gateway/test/fake-provider.js';
import { modules } from '../index.js';

const service = 'stripe';
const module = 'billing';
const privilege = 'read';
const cases = {
  list_customers: {"input":{"email":"person@example.com","limit":1,"starting_after":"example","ending_before":"example"},"required":[],"expected":{"email":"person@example.com","limit":1,"starting_after":"example","ending_before":"example"},"result":{"data":[{"id":"cus_example"}]}},
  get_customer: {"input":{"customer_id":"example"},"required":["customer_id"],"expected":{"customer_id":"example"},"result":{"id":"cus_example"}},
  list_charges: {"input":{"customer":"example","limit":1,"starting_after":"example","ending_before":"example"},"required":[],"expected":{"customer":"example","limit":1,"starting_after":"example","ending_before":"example"},"result":{"data":[{"id":"ch_example"}]}},
  get_charge: {"input":{"charge_id":"example"},"required":["charge_id"],"expected":{"charge_id":"example"},"result":{"id":"ch_example"}},
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
