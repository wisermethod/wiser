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
  assert.equal((await gateway.callTool('search_actions', { query: 'sitemap' })).actions[0].action, definition.action);
  assert.deepEqual(await gateway.callTool('describe_action', { action: definition.action }), definition);
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

test('construction rejects duplicate ids, connector-module collisions and malformed entries', () => {
  const execute = async () => ({});
  const entry = { definition, execute };
  const make = (opts) => new ConnectionGateway({ standingApprovals: {}, ...opts });
  assert.throws(() => make({ hostedActions: [entry, entry] }), /colliding hosted action/);
  const connectors = [{ id: 'wiser', service: 'wiser', manifest: { modules: {
    sitemap: { auth: { privilege: 'read' }, actions: { fetch: { risk: 'low', confirmation: 'none' } } },
  } } }];
  assert.throws(() => make({ connectors, hostedActions: [entry] }), /colliding hosted action/);
  for (const invalid of [null, {}, { definition }, { ...entry, definition: { ...definition, action: 'bad' } },
    { ...entry, definition: { ...definition, execution: 'local' } },
    { ...entry, definition: { ...definition, service: 'other' } },
    { ...entry, definition: { ...definition, module: 'other' } }]) {
    assert.throws(() => make({ hostedActions: [invalid] }), /Invalid or colliding hosted action/);
  }
});

test('hosted definitions are snapshots and description results cannot mutate them', () => {
  const supplied = structuredClone(definition);
  const gateway = new ConnectionGateway({ standingApprovals: {}, hostedActions: [{ definition: supplied, execute() {} }] });
  supplied.input.required = [];
  const described = gateway.describeAction(definition.action);
  described.input.required = [];
  assert.deepEqual(gateway.describeAction(definition.action), definition);
});

test('schema violations are refused before execution or a pending confirmation', async () => {
  const { gateway, calls } = setup({ rules: [{ effect: 'confirm' }] });
  for (const input of [undefined, null, [], {}, { domain: 5 }, { domain: '' }, { domain: 'site.test', extra: true }]) {
    assert.equal((await gateway.execute({ action: definition.action, input, confirm: true })).status, 'invalid_arguments');
  }
  assert.equal(gateway.pendingConfirmations.size, 0);
  assert.deepEqual(calls, []);
});

test('empty hostedActions preserves search, describe, refused execute and audit bytes', async () => {
  const run = async (option) => {
    const lines = [];
    const gateway = new ConnectionGateway({ policy: { rules: [{ effect: 'allow' }] }, standingApprovals: {},
      audit: { write({ cid, ms, ...line }) { lines.push(line); } }, ...option });
    const answers = [];
    answers.push(await gateway.callTool('search_actions', { query: 'sitemap' }));
    answers.push(await gateway.callTool('describe_action', { action: definition.action }));
    answers.push(await gateway.callTool('execute', { action: definition.action, input: { domain: 'site.test' } }));
    assert.equal(answers.at(-1).status, 'needs_subscription');
    assert.equal(lines[0].firstParty, true);
    assert.equal(lines[0].path, 'none');
    return JSON.stringify({ answers, lines });
  };
  assert.equal(await run({ hostedActions: [] }), await run({}));
});

test('hosted audit classification belongs only to the gateway holding that entry', async () => {
  const { gateway, lines } = setup();
  gateway.hostedActions.get(definition.action).execute = () => ({ status: 'input-domain-private-token', snapshot: 'private-result' });
  await gateway.execute({ action: definition.action, input: { domain: 'input-domain-private-token' } });
  assert.equal(lines[0].status, 'classifier_other');
  assert.equal(lines[0].action, definition.action);
  assert.equal(lines[0].path, 'hosted_tool');
  assert.equal(Object.hasOwn(lines[0], 'firstParty'), false);
  assert.doesNotMatch(JSON.stringify(lines), /input-domain-private-token|private-result/);
  await gateway.execute({ action: 'wiser.decide.choice', input: {} });
  assert.equal(lines[1].firstParty, true);
  assert.equal(lines[1].path, 'none');
  const absentLines = [];
  const absent = new ConnectionGateway({ policy: gateway.policy, standingApprovals: {}, audit: { write: (line) => absentLines.push(line) } });
  await absent.execute({ action: definition.action, input: {} });
  assert.equal(absentLines[0].firstParty, true);
  assert.equal(absentLines[0].path, 'none');
  assert.equal(absentLines[0].privilege, null);
});
