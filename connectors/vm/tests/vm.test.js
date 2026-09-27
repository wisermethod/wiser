import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confirmCall, createTestGateway, putActive } from '../../../gateway/test/fake-provider.js';
import { modules } from '../index.js';

const MACHINE = 'web-1';
const UNIT = 'app.service';
const ROUTES = ['/health', '/facts', '/list_hosts', '/exec', '/read_file', '/write_file', '/service'];

// The shipped default denies privilege admin. These tests allow vm so the
// action, not the policy, is what they measure. The deny test uses the default.
const allowVm = {
  roles: ['runtime', 'readonly'],
  default_role: 'runtime',
  rules: [
    { role: 'runtime', service: 'vm', privilege: 'admin', op: 'execute', effect: 'allow' },
    { role: 'runtime', privilege: 'admin', effect: 'deny' },
    { role: 'runtime', risk: 'destructive', effect: 'confirm' },
    { role: '*', effect: 'allow' },
  ],
};

const CASES = [
  {
    id: 'vm.inventory.health',
    module: 'inventory',
    input: { machine: MACHINE },
    endpoint: '/health',
    body: { machine: MACHINE },
    confirm: false,
  },
  {
    id: 'vm.inventory.facts',
    module: 'inventory',
    input: { machine: MACHINE },
    endpoint: '/facts',
    body: { machine: MACHINE },
    confirm: false,
  },
  {
    id: 'vm.inventory.list_hosts',
    module: 'inventory',
    input: {},
    endpoint: '/list_hosts',
    body: {},
    confirm: false,
  },
  {
    id: 'vm.command.run',
    module: 'command',
    input: { machine: MACHINE, argv: ['uname', '-a'] },
    endpoint: '/exec',
    body: { machine: MACHINE, argv: ['uname', '-a'] },
    confirm: true,
  },
  {
    id: 'vm.files.read_file',
    module: 'files',
    input: { machine: MACHINE, path: '/a' },
    endpoint: '/read_file',
    body: { machine: MACHINE, path: '/a' },
    confirm: false,
  },
  {
    id: 'vm.files.write_file',
    module: 'files',
    input: { machine: MACHINE, path: '/a', content: 'hello' },
    endpoint: '/write_file',
    body: { machine: MACHINE, path: '/a', content: 'hello' },
    confirm: true,
  },
  {
    id: 'vm.units.status',
    module: 'units',
    input: { machine: MACHINE, unit: UNIT },
    endpoint: '/service',
    body: { machine: MACHINE, argv: ['systemctl', 'status', '--no-pager', '--', UNIT] },
    confirm: false,
  },
  {
    id: 'vm.units.service',
    module: 'units',
    input: { machine: MACHINE, verb: 'restart', unit: UNIT },
    endpoint: '/service',
    body: { machine: MACHINE, argv: ['systemctl', 'restart', '--', UNIT] },
    confirm: true,
  },
];

const OUTCOMES = {
  ok: { outcome: 'ok', request_id: 'req-ok', machine: MACHINE, output: 'up', exit_code: 0, truncated: false, bytes_out: 2 },
  remote_failure: { outcome: 'remote_failure', request_id: 'req-rf', machine: MACHINE, output: 'boom', exit_code: 1, truncated: false, bytes_out: 4, reason: 'exit' },
  timeout: { outcome: 'timeout', request_id: 'req-to', machine: MACHINE, truncated: false, bytes_out: 0 },
  busy: { outcome: 'busy', request_id: 'req-busy' },
  path_refused: { outcome: 'path_refused', request_id: 'req-pr', reason: 'outside_allowlist' },
  unknown_machine: { outcome: 'unknown_machine', request_id: 'req-um', machine: MACHINE },
  truncated: { outcome: 'truncated', request_id: 'req-tr', output: 'cut', truncated: true, bytes_out: 3 },
  oversize: { outcome: 'oversize', request_id: 'req-ov', reason: 'read_file_max_bytes' },
  quote_refused: { outcome: 'quote_refused', request_id: 'req-qr', reason: 'nul' },
};

function assertRelative(endpoint) {
  assert.equal(typeof endpoint, 'string');
  assert.equal(endpoint.startsWith('/'), true, endpoint);
  assert.equal(endpoint.startsWith('//'), false, endpoint);
  assert.equal(/^[a-z][a-z0-9+.-]*:/i.test(endpoint), false, endpoint);
  assert.ok(ROUTES.includes(endpoint), endpoint);
}

async function connected(policy) {
  const fixture = await createTestGateway(policy ? { policy } : {});
  for (const module of ['inventory', 'command', 'files', 'units']) {
    await putActive(fixture.store, fixture.fake, { service: 'vm', module, privilege: 'admin' });
  }
  const calls = [];
  fixture.fake.catalog.execute = async () => {
    throw new Error('catalog execute was used');
  };
  fixture.calls = calls;
  fixture.reply = (data) => {
    fixture.fake.auth.proxy = async (request) => {
      calls.push(request);
      return { status: 200, data, headers: { authorization: 'Bearer planted' } };
    };
  };
  fixture.reply({ outcome: 'ok', request_id: 'req-1' });
  return fixture;
}

async function run(fixture, row, extra = {}) {
  const args = {
    action: row.id,
    input: extra.input ?? row.input,
    confirm: extra.confirm ?? (row.confirm ? true : undefined),
  };
  if (args.confirm === true) return confirmCall(fixture.gw, args);
  return fixture.gw.execute(args);
}

test('every action posts its fixed relative endpoint and body', async () => {
  const fixture = await connected(allowVm);
  for (const row of CASES) {
    fixture.calls.length = 0;
    const result = await run(fixture, row);
    assert.deepEqual(result, { outcome: 'ok', request_id: 'req-1' }, row.id);
    assert.equal(JSON.stringify(result).includes('planted'), false, row.id);
    assert.equal(fixture.calls.length, 1, row.id);
    assert.equal(fixture.calls[0].method, 'POST', row.id);
    assert.equal(fixture.calls[0].endpoint, row.endpoint, row.id);
    assertRelative(fixture.calls[0].endpoint);
    assert.deepEqual(fixture.calls[0].body, row.body, row.id);
  }
});

test('a call fails when any action endpoint is absolute or outside the router paths', async () => {
  const fixture = await connected(allowVm);
  for (const row of CASES) {
    await run(fixture, row);
  }
  assert.equal(fixture.calls.length, CASES.length);
  for (const call of fixture.calls) {
    assertRelative(call.endpoint);
    assert.equal(call.endpoint.includes('..'), false);
  }
  const src = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  assert.equal(/https?:\/\//.test(src), false);
  assert.equal(src.includes('/reload'), false);
  assert.equal(src.includes("'/service'"), true);
});

test('list_hosts sends an empty body and returns identifiers with the self flag', async () => {
  const fixture = await connected(allowVm);
  const data = {
    outcome: 'ok',
    request_id: 'req-hosts',
    hosts: [{ id: 'web-1', self: true }, { id: 'web-2', self: false }],
  };
  fixture.reply(data);
  const result = await fixture.gw.execute({ action: 'vm.inventory.list_hosts', input: {} });
  assert.deepEqual(result, data);
  assert.equal(JSON.stringify(result).includes('100.64.'), false);
  assert.deepEqual(fixture.calls[0].body, {});
  assert.deepEqual(await fixture.gw.execute({ action: 'vm.inventory.list_hosts' }), data);
});

test('units build systemctl argv and never forward a caller vector', async () => {
  const fixture = await connected(allowVm);
  for (const suffix of ['service', 'timer', 'socket', 'target', 'path', 'mount']) {
    const unit = `app.${suffix}`;
    fixture.calls.length = 0;
    await fixture.gw.execute({ action: 'vm.units.status', input: { machine: MACHINE, unit } });
    assert.deepEqual(fixture.calls[0].body, {
      machine: MACHINE,
      argv: ['systemctl', 'status', '--no-pager', '--', unit],
    });
  }
  for (const verb of ['start', 'stop', 'restart', 'reload', 'enable', 'disable']) {
    fixture.calls.length = 0;
    const refused = await fixture.gw.execute({
      action: 'vm.units.service',
      input: { machine: MACHINE, verb, unit: UNIT, argv: ['rm', '-rf', '/'] },
    });
    assert.equal(refused.status, 'invalid_arguments');
    assert.equal(fixture.calls.length, 0, verb);
    fixture.calls.length = 0;
    await confirmCall(fixture.gw, {
      action: 'vm.units.service',
      input: { machine: MACHINE, verb, unit: UNIT },
      confirm: true,
    });
    assert.deepEqual(fixture.calls[0].endpoint, '/service');
    assert.deepEqual(fixture.calls[0].body.argv, ['systemctl', verb, '--', UNIT]);
    assert.equal(fixture.calls[0].body.argv.includes('rm'), false);
  }
});

// The gateway's schema refuses these first, so this calls the module directly: the
// module's own pattern is the second layer and must refuse them without the schema.
test('the units module refuses a leading-dash unit itself, before any proxy call', async () => {
  let calls = 0;
  const ctx = { proxy: async () => { calls += 1; return { data: { outcome: 'ok' } }; } };
  for (const unit of ['-Hother.service', '-Mcontainer.service', '-.mount']) {
    assert.deepEqual(await modules.units.status({ machine: MACHINE, unit }, ctx), { status: 'invalid_arguments', field: 'unit' });
    assert.deepEqual(await modules.units.service({ machine: MACHINE, verb: 'restart', unit }, ctx), { status: 'invalid_arguments', field: 'unit' });
  }
  assert.equal(calls, 0);
  assert.equal((await modules.units.status({ machine: MACHINE, unit: UNIT }, ctx)).outcome, 'ok');
  assert.equal(calls, 1);
});

test('each router outcome is returned intact and an outer failure stays vendor_error', async () => {
  const fixture = await connected(allowVm);
  for (const [name, data] of Object.entries(OUTCOMES)) {
    fixture.calls.length = 0;
    fixture.reply(data);
    const result = await fixture.gw.execute({ action: 'vm.inventory.health', input: { machine: MACHINE } });
    assert.deepEqual(result, data, name);
    assert.equal(result.status, undefined, name);
    assert.equal(JSON.stringify(result).includes('planted'), false, name);
  }
  fixture.fake.auth.proxy = async ({ endpoint, method }) => ({
    status: 502,
    error: { code: 'vendor_error', endpoint, method },
  });
  const outer = await fixture.gw.execute({ action: 'vm.inventory.health', input: { machine: MACHINE } });
  assert.equal(outer.status, 'vendor_error');
  assert.equal(outer.http_status, 502);
  assert.equal(outer.endpoint, '/health');
  assert.equal(outer.method, 'POST');
  assert.equal(Object.hasOwn(outer, 'outcome'), false);
  assert.equal(JSON.stringify(outer).includes('boom'), false);
  const command = await confirmCall(fixture.gw, {
    action: 'vm.command.run',
    input: { machine: MACHINE, argv: ['uname'] },
    confirm: true,
  });
  assert.equal(command.status, 'vendor_error');
  assert.equal(Object.hasOwn(command, 'outcome'), false);
});

test('a router remote_failure on a command keeps output and exit code', async () => {
  const fixture = await connected(allowVm);
  fixture.reply(OUTCOMES.remote_failure);
  const result = await confirmCall(fixture.gw, {
    action: 'vm.command.run',
    input: { machine: MACHINE, argv: ['false'] },
    confirm: true,
  });
  assert.deepEqual(result, OUTCOMES.remote_failure);
  assert.equal(result.outcome, 'remote_failure');
  assert.equal(result.exit_code, 1);
  assert.equal(result.output, 'boom');
});

test('destructive actions stop for confirmation and do not call the router', async () => {
  const fixture = await connected(allowVm);
  let calls = 0;
  fixture.fake.auth.proxy = async () => {
    calls += 1;
    return { status: 200, data: { outcome: 'ok', request_id: 'req-1' } };
  };
  for (const row of CASES.filter((item) => item.confirm)) {
    const stopped = await fixture.gw.execute({ action: row.id, input: row.input });
    assert.equal(stopped.status, 'needs_confirmation', row.id);
    assert.equal(stopped.confirmation, 'always', row.id);
    assert.equal(calls, 0, row.id);
  }
  assert.equal(calls, 0);
});

test('the shipped default policy denies admin before any router call', async () => {
  const fixture = await connected();
  fixture.fake.auth.proxy = async () => {
    throw new Error('denied action reached the router');
  };
  for (const row of CASES) {
    const result = await confirmCall(fixture.gw, { action: row.id, input: row.input, confirm: true });
    assert.equal(result.status, 'denied', row.id);
  }
});

test('each module needs its own admin grant before transport', async () => {
  const { gw, fake, store } = await createTestGateway({ policy: allowVm });
  fake.auth.proxy = async () => {
    throw new Error('unconnected action reached the router');
  };
  for (const row of CASES) {
    const result = await confirmCall(gw, { action: row.id, input: row.input, confirm: true });
    assert.equal(result.status, 'needs_connect', row.id);
    assert.equal(result.module, row.module, row.id);
    assert.equal(result.privilege, 'admin', row.id);
  }
  await putActive(store, fake, { service: 'vm', module: 'inventory', privilege: 'admin' });
  fake.auth.proxy = async () => ({ status: 200, data: { outcome: 'ok', request_id: 'req-1' }, headers: {} });
  const health = await gw.execute({ action: 'vm.inventory.health', input: { machine: MACHINE } });
  assert.equal(health.outcome, 'ok');
  const command = await confirmCall(gw, {
    action: 'vm.command.run',
    input: { machine: MACHINE, argv: ['true'] },
    confirm: true,
  });
  assert.equal(command.status, 'needs_connect');
  assert.equal(command.module, 'command');
});

test('published schema refusals happen at the gateway boundary', async () => {
  // Kept from the connector template. Undeclared, mistyped, missing and non-object
  // inputs are refused before the module runs.
  const fixture = await connected(allowVm);
  fixture.fake.auth.proxy = async () => {
    throw new Error('schema refusal reached the router');
  };
  for (const row of CASES) {
    const sample = row.id === 'vm.inventory.list_hosts' ? {} : { ...row.input };
    const undeclared = { ...sample, undeclared: 'example' };
    assert.equal((await confirmCall(fixture.gw, { action: row.id, input: undeclared, confirm: true })).status, 'invalid_arguments', row.id);
    if (row.id !== 'vm.inventory.list_hosts') {
      const key = Object.keys(sample)[0];
      const mistyped = { ...sample, [key]: 12345 };
      const missing = { ...sample };
      delete missing[key];
      assert.equal((await confirmCall(fixture.gw, { action: row.id, input: mistyped, confirm: true })).status, 'invalid_arguments', `${row.id} type`);
      assert.equal((await confirmCall(fixture.gw, { action: row.id, input: missing, confirm: true })).status, 'invalid_arguments', `${row.id} required`);
    }
    for (const input of [null, [], 'example', 1]) {
      assert.deepEqual(
        await confirmCall(fixture.gw, { action: row.id, input, confirm: true }),
        { status: 'invalid_arguments', field: 'input' },
        row.id,
      );
    }
  }
});

test('out-of-bound input is refused before transport', async () => {
  const fixture = await connected(allowVm);
  fixture.fake.auth.proxy = async () => {
    throw new Error('out-of-bound input reached the router');
  };
  const refused = async (action, input) => {
    const result = await confirmCall(fixture.gw, { action, input, confirm: true });
    assert.equal(result.status, 'invalid_arguments', `${action} ${JSON.stringify(input).slice(0, 80)}`);
  };
  await refused('vm.command.run', { machine: MACHINE, argv: [] });
  await refused('vm.command.run', { machine: MACHINE, argv: Array.from({ length: 65 }, () => 'a') });
  await refused('vm.command.run', { machine: MACHINE, argv: [''] });
  await refused('vm.command.run', { machine: MACHINE, argv: ['😀'.repeat(4097)] });
  await refused('vm.command.run', { machine: '_web', argv: ['true'] });
  await refused('vm.command.run', { machine: 'a'.repeat(64), argv: ['true'] });
  await refused('vm.files.read_file', { machine: MACHINE, path: 'relative' });
  await refused('vm.files.read_file', { machine: MACHINE, path: `/a\n` });
  await refused('vm.files.read_file', { machine: MACHINE, path: `/${'a'.repeat(4096)}` });
  await refused('vm.files.read_file', { machine: MACHINE, path: `/${'😀'.repeat(4096)}` });
  await refused('vm.files.read_file', { machine: MACHINE, path: `/\uD800` });
  await refused('vm.files.write_file', { machine: MACHINE, path: '/a', content: 'a'.repeat(60001) });
  await refused('vm.files.write_file', { machine: MACHINE, path: '/a', content: '😀'.repeat(60001) });
  await refused('vm.files.write_file', { machine: MACHINE, path: '/a', content: '\uD800' });
  const over = '\u0001'.repeat(50000);
  assert.ok([...over].length <= 60000);
  assert.ok(Buffer.byteLength(JSON.stringify({ machine: MACHINE, path: '/a', content: over }), 'utf8') > 262144);
  await refused('vm.files.write_file', { machine: MACHINE, path: '/a', content: over });
  await refused('vm.units.status', { machine: MACHINE, unit: 'nope' });
  await refused('vm.units.status', { machine: MACHINE, unit: `${'a'.repeat(121)}.service` });
  // A leading - is a systemctl option: -H names a remote host, -M a container.
  for (const unit of ['-Hother.service', '-Mcontainer.service', '-.mount']) {
    await refused('vm.units.status', { machine: MACHINE, unit });
    await refused('vm.units.service', { machine: MACHINE, verb: 'restart', unit });
  }
  await refused('vm.units.service', { machine: MACHINE, verb: 'status', unit: UNIT });
  await refused('vm.units.service', { machine: MACHINE, verb: 'START', unit: UNIT });
  await refused('vm.inventory.list_hosts', { machine: MACHINE });
});

test('bounds the gateway does not enforce are accepted at the published limit', async () => {
  const fixture = await connected(allowVm);
  const ok = async (action, input) => {
    fixture.calls.length = 0;
    const result = await confirmCall(fixture.gw, { action, input, confirm: true });
    assert.equal(result.outcome, 'ok', action);
    assert.equal(fixture.calls.length, 1, action);
    return fixture.calls[0];
  };
  const wide = await ok('vm.command.run', { machine: MACHINE, argv: ['😀'.repeat(4096), ''] });
  assert.equal(wide.body.argv[0], '😀'.repeat(4096));
  assert.equal(wide.body.argv[1], '');
  const many = await ok('vm.command.run', { machine: MACHINE, argv: Array.from({ length: 64 }, () => 'a') });
  assert.equal(many.body.argv.length, 64);
  const path = `/${'😀'.repeat(4095)}`;
  assert.equal([...path].length, 4096);
  const read = await ok('vm.files.read_file', { machine: MACHINE, path });
  assert.equal(read.body.path, path);
  const slipped = await ok('vm.files.read_file', { machine: MACHINE, path: '/a/../b' });
  assert.equal(slipped.body.path, '/a/../b');
  const content = '😀'.repeat(60000);
  assert.equal([...content].length, 60000);
  assert.ok(Buffer.byteLength(JSON.stringify({ machine: MACHINE, path: '/a', content }), 'utf8') <= 262144);
  const wrote = await ok('vm.files.write_file', { machine: MACHINE, path: '/a', content });
  assert.equal(wrote.body.content, content);
  const empty = await ok('vm.files.write_file', { machine: MACHINE, path: '/a', content: '' });
  assert.equal(empty.body.content, '');
  const controls = '\u0001'.repeat(1000);
  assert.ok(Buffer.byteLength(JSON.stringify({ machine: MACHINE, path: '/a', content: controls }), 'utf8') <= 262144);
  await ok('vm.files.write_file', { machine: MACHINE, path: '/a', content: controls });
  const unit = `${'a'.repeat(120)}.service`;
  const status = await ok('vm.units.status', { machine: MACHINE, unit });
  assert.deepEqual(status.body.argv, ['systemctl', 'status', '--no-pager', '--', unit]);
  await ok('vm.inventory.health', { machine: 'a'.repeat(63) });
  await ok('vm.command.run', { machine: MACHINE, argv: ['true'] });
});

test('a success body with no outcome stays vendor_error', async () => {
  const fixture = await connected(allowVm);
  fixture.fake.auth.proxy = async () => ({ status: 200, data: { request_id: 'req-x' }, headers: {} });
  const result = await fixture.gw.execute({ action: 'vm.inventory.health', input: { machine: MACHINE } });
  assert.equal(result.status, 'vendor_error');
  assert.equal(result.endpoint, '/health');
  assert.equal(Object.hasOwn(result, 'request_id'), false);
});

test('machine accepts every identifier the router registers, within 63 characters, and refuses the rest', async () => {
  const fixture = await connected(allowVm);
  const health = CASES.find((row) => row.id === 'vm.inventory.health');
  for (const machine of ['web_1', 'Web.2', 'a', 'x'.repeat(63)]) {
    fixture.calls.length = 0;
    const result = await run(fixture, health, { input: { machine } });
    assert.equal(result.outcome, 'ok', machine);
    assert.equal(fixture.calls.length, 1, machine);
    assert.equal(fixture.calls[0].endpoint, '/health', machine);
    assert.deepEqual(fixture.calls[0].body, { machine }, machine);
  }
  for (const machine of ['-x', '.a', '_a', 'a/b', 'a b', '../x', 'x'.repeat(64), '']) {
    fixture.calls.length = 0;
    const result = await run(fixture, health, { input: { machine } });
    assert.equal(result.status, 'invalid_arguments', JSON.stringify(machine));
    assert.equal(fixture.calls.length, 0, JSON.stringify(machine));
  }
});
