import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConnectionGateway } from '../src/gateway.js';

const active = { service: 'github', module: 'repos', status: 'ACTIVE' };

function fixture({ configured, records = [], omitProvider = false }) {
  let reads = 0;
  const gateway = new ConnectionGateway({
    store: { listConnections() { reads += 1; return records; } },
    authProvider: omitProvider ? null : {
      isConfigured: () => configured,
      setupText: () => 'Open the instituted project-key file, save, and restart.',
      initiate() { assert.fail('Setup must not start a grant'); },
      status() { assert.fail('Setup must not query a vendor'); },
    },
  });
  return { gateway, reads: () => reads };
}

for (const records of [[], [active]]) {
  test(`unconfigured list_connections stops before reading ${records.length} cached records`, async () => {
    const { gateway, reads } = fixture({ configured: false, records });
    const result = await gateway.callTool('list_connections', {});
    assert.equal(result.status, 'needs_provider');
    assert.equal(typeof result.setup, 'string');
    assert.equal(Object.hasOwn(result, 'connections'), false);
    assert.equal(reads(), 0);
  });

  test(`configured list_connections preserves ${records.length} records without starting a grant`, async () => {
    const { gateway, reads } = fixture({ configured: true, records });
    const result = await gateway.callTool('list_connections', {});
    assert.deepEqual(result, { connections: records });
    assert.equal(reads(), 1);
  });
}

test('missing adapter returns needs_provider with fallback instructions', async () => {
  const { gateway, reads } = fixture({ omitProvider: true });
  const result = await gateway.callTool('list_connections', {});
  assert.equal(result.status, 'needs_provider');
  assert.equal(typeof result.setup, 'string');
  assert.equal(reads(), 0);
});

test('unconfigured gateway still exposes all six tools for setup', () => {
  const { gateway } = fixture({ configured: false });
  assert.deepEqual(gateway.listTools().map(({ name }) => name).sort(), [
    'connect_status', 'describe_action', 'execute', 'list_connections',
    'search_actions', 'start_connect',
  ]);
});
