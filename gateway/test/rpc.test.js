import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRpcHandler, pickProtocolVersion } from '../src/rpc.js';
import { createTestGateway, putActive } from './fake-provider.js';

const SERVER = fileURLToPath(new URL('../server.js', import.meta.url));

test('help without env prints usage and exits 0', () => {
  const r = spawnSync(process.execPath, [SERVER, 'help'], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Usage:/);
  assert.match(r.stdout, /--env/);
  assert.equal(r.stderr, '');
});

test('--help without env prints usage and exits 0', () => {
  const r = spawnSync(process.execPath, [SERVER, '--help'], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Usage:/);
});

test('unknown flag is refused by name before reading anything', () => {
  const r = spawnSync(process.execPath, [SERVER, '--bogus'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--bogus/);
  assert.match(r.stderr, /help/);
  assert.equal(r.stdout, '');
});

test('--role setup is refused', () => {
  const r = spawnSync(process.execPath, [SERVER, '--role', 'setup', '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--role must be runtime or readonly/);
  assert.match(r.stderr, /setup/);
  assert.equal(r.stdout, '');
});

test('pickProtocolVersion echoes a known version and defaults otherwise', () => {
  assert.equal(pickProtocolVersion('2025-03-26'), '2025-03-26');
  assert.equal(pickProtocolVersion('2024-11-05'), '2024-11-05');
  assert.equal(pickProtocolVersion('2025-06-18'), '2025-06-18');
  assert.equal(pickProtocolVersion('nope'), '2025-06-18');
});

test('rpc round trip initialize -> tools/list -> tools/call execute', async () => {
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'github', module: 'repos', privilege: 'write' });
  const handle = createRpcHandler({ gateway: gw, version: '0.1.0' });

  const init = await handle(JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '0' } },
  }));
  assert.equal(init.id, 1);
  assert.equal(init.result.protocolVersion, '2025-03-26');
  assert.equal(init.result.serverInfo.name, 'wiser-gateway');
  assert.equal(init.result.capabilities.tools.listChanged, false);

  const notified = await handle(JSON.stringify({
    jsonrpc: '2.0',
    method: 'notifications/initialized',
  }));
  assert.equal(notified, null);

  const listed = await handle(JSON.stringify({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
  }));
  const names = listed.result.tools.map((t) => t.name);
  assert.deepEqual(names, [
    'execute',
    'start_connect',
    'connect_status',
    'list_connections',
    'search_actions',
    'describe_action',
  ]);
  const execTool = listed.result.tools.find((t) => t.name === 'execute');
  assert.equal(execTool.annotations.destructiveHint, true);
  const listTool = listed.result.tools.find((t) => t.name === 'list_connections');
  assert.equal(listTool.annotations.readOnlyHint, true);

  const called = await handle(JSON.stringify({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'execute',
      arguments: { action: 'github.repos.get', input: { owner: 'example-org', repo: 'example-repo' } },
    },
  }));
  assert.equal(called.id, 3);
  assert.equal(called.result.isError, false);
  const payload = JSON.parse(called.result.content[0].text);
  assert.equal(payload.name, 'example-repo');
  assert.equal(payload.owner.login, 'example-org');
});

test('malformed line is parse error with id null', async () => {
  const { gw } = await createTestGateway();
  const handle = createRpcHandler({ gateway: gw, version: '0.1.0' });
  const res = await handle('not-json');
  assert.equal(res.id, null);
  assert.equal(res.error.code, -32700);
});

test('unknown method is -32601', async () => {
  const { gw } = await createTestGateway();
  const handle = createRpcHandler({ gateway: gw, version: '0.1.0' });
  const res = await handle(JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'nope' }));
  assert.equal(res.error.code, -32601);
});
