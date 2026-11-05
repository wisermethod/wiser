import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConnectionGateway } from '../src/gateway.js';
import { StatusSignal } from '../src/errors.js';
const definition = {
  action: 'wiser.sitemap.fetch', service: 'wiser', module: 'sitemap',
  privilege: 'read', risk: 'low', confirmation: 'none', execution: 'hosted', description: 'Read a sitemap',
  input: { type: 'object', additionalProperties: false, required: ['domain'], properties: { domain: { type: 'string', minLength: 1 } } },
};
function setup(policy = { rules: [{ effect: 'allow' }] }) {
  const lines = [], calls = [];
  const gateway = new ConnectionGateway({ policy, audit: { write: (line) => lines.push(line) }, standingApprovals: {},
    hostedActions: [{ definition, execute: async (input) => { calls.push(input); return { count: 0 }; } }] });
  return { gateway, lines, calls };
}
test('registration is explicit, filtered, described and optional without a provider or connection', async () => {
  const { gateway, lines, calls } = setup();
  assert.equal(gateway.listActions({ service: 'wiser', query: 'sitemap' })[0].action, definition.action);
  assert.deepEqual(gateway.listActions({ service: 'google' }), []);
  assert.deepEqual(gateway.describeAction(definition.action), definition);
  assert.deepEqual(await gateway.execute({ action: definition.action, input: { domain: 'example.com' } }), { count: 0 });
  assert.deepEqual(calls, [{ domain: 'example.com' }]);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].path, 'hosted_tool');
  const absent = new ConnectionGateway({ policy: { rules: [{ effect: 'allow' }] }, audit: { write() {} }, standingApprovals: {} });
  assert.deepEqual(absent.listActions(), []);
  assert.equal((await absent.execute({ action: definition.action, input: {} })).status, 'needs_subscription');
});
test('ordinary execute refuses undeclared fields, labels and policy denial before invoking a hosted capability', async () => {
  const { gateway, calls } = setup();
  for (const args of [{ input: { file: '/file' } }, { input: { domain: 'example.com' }, label: 'work' }]) {
    assert.equal((await gateway.execute({ action: definition.action, ...args })).status, 'invalid_arguments');
  }
  gateway.policy = { rules: [{ effect: 'deny' }] };
  assert.equal((await gateway.execute({ action: definition.action, input: { domain: 'example.com' } })).status, 'denied');
  assert.deepEqual(calls, []);
});
test('hosted confirmation uses the existing input-bound single-use match and ordinary status audit', async () => {
  const { gateway, calls, lines } = setup({ rules: [{ effect: 'confirm' }] });
  const args = { action: definition.action, input: { domain: 'example.com' } };
  assert.equal((await gateway.execute({ ...args, confirm: true })).status, 'needs_confirmation');
  assert.equal((await gateway.execute({ ...args, input: { domain: 'other.com' }, confirm: true })).status, 'needs_confirmation');
  assert.deepEqual(calls, []);
  assert.deepEqual(await gateway.execute({ ...args, confirm: true }), { count: 0 });
  assert.equal((await gateway.execute({ ...args, confirm: true })).status, 'needs_confirmation');
  assert.equal(calls.length, 1);
  gateway.policy = { rules: [{ effect: 'allow' }] };
  gateway.hostedActions.get(definition.action).execute = () => { throw new StatusSignal({ status: 'unavailable', reason: 'daily_limit' }); };
  assert.equal((await gateway.execute(args)).reason, 'daily_limit');
  assert.equal(lines.at(-1).status, 'unavailable');
});
