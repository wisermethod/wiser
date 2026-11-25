import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { installToolkitRow, registeredSlug } from '../providers/composio/custom-toolkits.js';
import { TOOLS } from '../src/tools.js';
import { createFakeProviders, createTestGateway, makeHome } from './fake-provider.js';

const SERVICE = 'per-install-fixture';
const CONNECTORS = fileURLToPath(new URL('./fixtures/per-install/', import.meta.url));
const ORIGIN = 'https://crm.example.test';
const OTHER_ORIGIN = 'https://other.example.test';
const TOOLKIT = 'WISERCRM_0CA5EFCA53F1D1B0';
const MODULES = ['records', 'activities', 'people'];

async function fixture(t, options = {}) {
  const home = makeHome();
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const fake = createFakeProviders();
  fake.auth.installToolkitRow = installToolkitRow;
  const initiation = t.mock.method(fake.auth, 'initiate');
  const { gw, store } = await createTestGateway({ home, fake, connectorDirs: [CONNECTORS], session: false, ...options });
  const installs = join(home, 'installs.json');
  const addresses = (labels) => writeFileSync(installs, JSON.stringify({ [SERVICE]: labels }));
  const args = (label = 'alpha', module = 'records') => ({ service: SERVICE, module, label });
  const start = (label, module) => gw.callTool('start_connect', args(label, module));
  const status = (label, module) => gw.callTool('connect_status', args(label, module));
  const row = (label, module) => store.getConnection(args(label, module));
  async function activate(label, module) {
    fake.auth.setStatus(row(label, module).provider_account_id, 'ACTIVE');
    const result = await status(label, module);
    assert.equal(result.status, 'connected');
    return result.connection;
  }
  return { gw, fake, store, installs, addresses, start, status, row, activate, initiation, args };
}

test('start_connect requires a label and reports missing install addresses', async (t) => {
  const { gw, start, addresses, initiation, store } = await fixture(t);
  const unlabelled = await gw.callTool('start_connect', { service: SERVICE, module: 'records' });
  assert.deepEqual(unlabelled, { status: 'invalid_arguments', tool: 'start_connect', field: 'label', labels: [] });
  assert.equal((await start()).reason, 'install_address_missing');
  addresses({ beta: ORIGIN });
  assert.deepEqual(await start(), {
    status: 'invalid_arguments', tool: 'start_connect', field: 'label',
    label: 'alpha', reason: 'install_address_missing', file: 'installs.json',
  });
  assert.equal(initiation.mock.callCount(), 0);
  assert.deepEqual(store.listConnections(), []);
});

test('invalid origins are refused without echoing the address or reaching the provider', async (t) => {
  const { start, addresses, installs, initiation, store } = await fixture(t);
  const invalid = [
    'http://crm.example.test', 'https://user:password@crm.example.test',
    'https://crm.example.test/api', 'https://crm.example.test/../', 'https://crm.example.test/?q=1',
    'https://crm.example.test?', 'https://crm.example.test#', 'https://crm.example.test/#hash',
    'https://crm.example.test:8443', 'https://192.0.2.1', 'https://[2001:db8::1]',
    'https://localhost', 'https://crm.localhost', 'https://crm.local', 'https://crm.internal',
    'https://crm.example.test.', 'https://CRM.example.test', 'https://crm.exаmple.test',
    'https://crm.xn--exmple-4nf.test',
    'https://crm.test.123', 'https://%63rm.example.test', 'https://crm.example.test\n',
    'https://test', 'https://a_b.example.test', `https://${'a'.repeat(64)}.example.test`,
  ];
  for (const origin of invalid) {
    addresses({ alpha: origin });
    const result = await start();
    assert.equal(result.status, 'invalid_arguments', origin);
    assert.equal(result.field, 'label', origin);
    assert.equal(result.reason, 'install_address_invalid', origin);
    assert.equal(JSON.stringify(result).includes(origin), false, origin);
  }
  writeFileSync(installs, '{ invalid JSON');
  assert.equal((await start()).reason, 'install_address_invalid');
  assert.equal(initiation.mock.callCount(), 0);
  assert.deepEqual(store.listConnections(), []);
});

test('canonical origin and default HTTPS port share a slug, with the origin shown on the link', async (t) => {
  const { addresses, start, row, installs, initiation } = await fixture(t);
  addresses({ alpha: ORIGIN, beta: ORIGIN + ':443/', gamma: ORIGIN + ':0443' });
  const before = readFileSync(installs);
  for (const label of ['alpha', 'beta', 'gamma']) {
    const link = await start(label);
    assert.equal(link.status, 'link');
    assert.equal(link.install_origin, ORIGIN);
    assert.equal(row(label).status, 'INITIATED');
    assert.equal(row(label).toolkit, TOOLKIT);
  }
  assert.equal(new Set(['alpha', 'beta', 'gamma'].map((label) => row(label).provider_account_id)).size, 3);
  assert.deepEqual(initiation.mock.calls.map((call) => call.arguments[0].installToolkit),
    [installToolkitRow(ORIGIN), installToolkitRow(ORIGIN), installToolkitRow(ORIGIN)]);
  assert.deepEqual(readFileSync(installs), before);
});

test('a hosted resolver can supply the address and is read only on start_connect', async (t) => {
  const calls = [];
  const { gw: hosted, fake, row } = await fixture(t, {
    installOrigin: async (...args) => { calls.push(args); return ORIGIN; },
  });
  assert.equal((await hosted.callTool('start_connect', { service: SERVICE, module: 'records', label: 'alpha' })).install_origin, ORIGIN);
  fake.auth.setStatus(row().provider_account_id, 'ACTIVE');
  assert.equal((await hosted.callTool('connect_status', { service: SERVICE, module: 'records', label: 'alpha' })).status, 'connected');
  await hosted.callTool('execute', { action: SERVICE + '.records.ping', label: 'alpha', input: {} });
  await hosted.callTool('list_connections');
  assert.deepEqual(calls, [[SERVICE, 'alpha']]);
});

test('an INITIATED row blocks re-pointing the label from any sibling module', async (t) => {
  const { addresses, start, initiation, store } = await fixture(t);
  addresses({ alpha: ORIGIN });
  assert.equal((await start()).status, 'link');
  const before = store.listConnections();
  addresses({ alpha: OTHER_ORIGIN });
  assert.equal((await start('alpha', 'activities')).reason, 'install_address_changed');
  assert.equal(initiation.mock.callCount(), 1);
  assert.deepEqual(store.listConnections(), before);
});

test('ACTIVE status preserves the slug and account, blocks re-pointing and keeps execution bound to the stored account', async (t) => {
  const { gw, fake, addresses, start, status, activate, initiation, store } = await fixture(t);
  addresses({ alpha: ORIGIN });
  assert.equal((await start()).status, 'link');
  assert.equal((await status()).status, 'INITIATED');
  const active = await activate();
  assert.equal(active.toolkit, TOOLKIT);
  const before = store.listConnections();
  addresses({ alpha: OTHER_ORIGIN });
  assert.equal((await start()).reason, 'install_address_changed');
  assert.equal(initiation.mock.callCount(), 1);
  assert.deepEqual(store.listConnections(), before);
  const proxy = t.mock.method(fake.auth, 'proxy');
  const result = await gw.callTool('execute', { action: SERVICE + '.records.ping', label: 'alpha', input: {} });
  assert.deepEqual(result, {});
  assert.equal(proxy.mock.calls[0].arguments[0].providerAccountId, active.provider_account_id);
});

test('refreshing a grant to INACTIVE does not release the install label', async (t) => {
  const { fake, addresses, start, status, row, initiation } = await fixture(t);
  addresses({ alpha: ORIGIN });
  await start();
  fake.auth.setStatus(row().provider_account_id, 'INACTIVE');
  assert.equal((await status()).provider_status, 'INACTIVE');
  addresses({ alpha: OTHER_ORIGIN });
  assert.equal((await start()).reason, 'install_address_changed');
  assert.equal(initiation.mock.callCount(), 1);
  assert.equal(row().toolkit, TOOLKIT);
});

test('a confirmed disconnect releases the label for a different origin', async (t) => {
  const { gw, addresses, start, activate, args, store } = await fixture(t);
  addresses({ alpha: ORIGIN, beta: ORIGIN });
  await start();
  const alpha = await activate();
  await start('beta');
  const beta = await activate('beta');
  addresses({ alpha: OTHER_ORIGIN, beta: ORIGIN });
  assert.equal((await start()).reason, 'install_address_changed');

  const stop = await gw.callTool('disconnect', args());
  assert.equal(stop.status, 'needs_confirmation');
  assert.equal(stop.label, 'alpha');
  assert.equal(stop.provider_account_id, alpha.provider_account_id);
  const done = await gw.callTool('disconnect', {
    ...args(), confirm: true, provider_account_id: stop.provider_account_id,
  });
  assert.equal(done.status, 'disconnected');
  assert.equal(done.removed.length, 3);
  assert.ok(store.listConnections().every((entry) =>
    entry.label === 'beta' && entry.provider_account_id === beta.provider_account_id));
  assert.equal((await start()).install_origin, OTHER_ORIGIN);
});

test('an ACTIVE row without a slug fails closed', async (t) => {
  const { addresses, start, store, initiation, args } = await fixture(t);
  addresses({ alpha: ORIGIN });
  store.putConnection({ ...args(), privilege: 'write', provider: 'catalog', status: 'ACTIVE', provider_account_id: 'legacy' });
  const before = store.listConnections();
  assert.equal((await start()).reason, 'install_address_changed');
  assert.equal(initiation.mock.callCount(), 0);
  assert.deepEqual(store.listConnections(), before);
});

test('a retired module still holds its install label', async (t) => {
  const { gw, addresses, start, activate, store, initiation } = await fixture(t);
  addresses({ alpha: ORIGIN });
  await start('alpha', 'activities');
  await activate('alpha', 'activities');
  store.deleteConnection({ service: SERVICE, module: 'records', label: 'alpha' });
  store.deleteConnection({ service: SERVICE, module: 'people', label: 'alpha' });
  delete gw.connectors[0].manifest.modules.activities;
  const before = store.listConnections();
  addresses({ alpha: OTHER_ORIGIN });
  assert.equal((await start()).reason, 'install_address_changed');
  assert.equal(initiation.mock.callCount(), 1);
  assert.deepEqual(store.listConnections(), before);
});

test('a provider toolkit mismatch is returned as a label refusal without writing a row', async (t) => {
  const { fake, addresses, start, store } = await fixture(t);
  addresses({ alpha: ORIGIN });
  fake.auth.initiate = async () => ({ error: { code: 'install_address_changed' } });
  assert.deepEqual(await start(), {
    status: 'invalid_arguments', tool: 'start_connect', field: 'label',
    label: 'alpha', reason: 'install_address_changed', file: 'installs.json',
  });
  assert.deepEqual(store.listConnections(), []);
});

test('sibling modules adopt only onto the same label, slug and account', async (t) => {
  const { addresses, start, activate, store, row } = await fixture(t);
  addresses({ alpha: ORIGIN });
  await start();
  const active = await activate();
  for (const module of MODULES) {
    assert.equal(row('alpha', module).toolkit, TOOLKIT);
    assert.equal(row('alpha', module).provider_account_id, active.provider_account_id);
    assert.equal(store.getConnection({ service: SERVICE, module }), null);
  }
});

test('hydration uses known labelled accounts, including two accounts sharing a toolkit', async (t) => {
  const { gw, fake, addresses, start, activate, store, row } = await fixture(t);
  addresses({ alpha: ORIGIN, beta: ORIGIN });
  const listing = [];
  for (const label of ['alpha', 'beta']) {
    await start(label);
    const active = await activate(label);
    listing.push({ id: active.provider_account_id, status: 'ACTIVE', toolkit: registeredSlug(installToolkitRow(ORIGIN)) });
    store.deleteConnection({ service: SERVICE, module: 'people', label });
  }
  listing.push({ id: 'unknown-account', status: 'ACTIVE', toolkit: registeredSlug(installToolkitRow(OTHER_ORIGIN)) });
  fake.auth.listAccounts = async () => listing;
  await gw.callTool('list_connections');
  for (const [label, account] of [['alpha', listing[0]], ['beta', listing[1]]]) {
    assert.equal(row(label, 'people').provider_account_id, account.id);
    assert.equal(row(label, 'people').toolkit, TOOLKIT);
  }
  assert.equal(store.listConnections().length, 6);
  assert.ok(store.listConnections().every((entry) => entry.label));
});

test('hydration does not choose between two local accounts during a reconnect', async (t) => {
  const { gw, fake, addresses, start, activate, store, row } = await fixture(t);
  addresses({ alpha: ORIGIN });
  await start();
  const active = await activate();
  store.deleteConnection({ service: SERVICE, module: 'people', label: 'alpha' });
  await start('alpha', 'activities');
  const pending = row('alpha', 'activities');
  fake.auth.listAccounts = async () => [active, pending].map((entry) => ({
    id: entry.provider_account_id, status: 'ACTIVE', toolkit: 'CUSTOM_' + TOOLKIT,
  }));
  await gw.callTool('list_connections');
  assert.equal(row('alpha', 'people'), null);
  await activate('alpha', 'activities');
  assert.equal(row('alpha', 'people').provider_account_id, pending.provider_account_id);
});

test('execute, connect_status and disconnect require labels even with a legacy unlabelled row', async (t) => {
  const { gw, fake, store, addresses, start } = await fixture(t);
  addresses({ alpha: ORIGIN, beta: OTHER_ORIGIN });
  await start('beta', 'activities');
  await start();
  store.putConnection({ service: SERVICE, module: 'records', privilege: 'write',
    provider: 'catalog', status: 'ACTIVE', provider_account_id: 'legacy' });
  const proxy = t.mock.method(fake.auth, 'proxy');
  const status = t.mock.method(fake.auth, 'status');
  for (const [tool, input] of [
    ['execute', { action: SERVICE + '.records.ping', input: {} }],
    ['connect_status', { service: SERVICE, module: 'records' }],
    ['disconnect', { service: SERVICE, module: 'records' }],
  ]) {
    assert.deepEqual(await gw.callTool(tool, input),
      { status: 'invalid_arguments', tool, field: 'label', labels: ['alpha', 'beta'] });
  }
  assert.equal(proxy.mock.callCount(), 0);
  assert.equal(status.mock.callCount(), 0);
});

test('refreshing an orphan retains the stored slug', async (t) => {
  const { gw, fake, addresses, start, status, row } = await fixture(t);
  addresses({ alpha: ORIGIN });
  await start();
  const accountId = row().provider_account_id;
  fake.auth.setStatus(accountId, 'ACTIVE');
  gw.connectors = [];
  const result = await status();
  assert.equal(result.reason, 'orphaned_record');
  assert.equal(row().toolkit, TOOLKIT);
  assert.equal(row().status, 'ACTIVE');
  assert.equal(row().provider_account_id, accountId);
});

test('competing starts for the same label cannot link to different origins', async (t) => {
  const { fake, addresses, start, row } = await fixture(t);
  const initiate = fake.auth.initiate;
  let release;
  let entered;
  const paused = new Promise((resolve) => { release = resolve; });
  const started = new Promise((resolve) => { entered = resolve; });
  const spy = t.mock.method(fake.auth, 'initiate', async (...args) => {
    entered();
    await paused;
    return initiate(...args);
  });
  addresses({ alpha: ORIGIN });
  const first = start();
  await started;
  addresses({ alpha: OTHER_ORIGIN });
  const second = start('alpha', 'activities');
  release();
  assert.equal((await first).status, 'link');
  assert.equal((await second).reason, 'install_address_changed');
  assert.equal(spy.mock.callCount(), 1);
  assert.equal(row().toolkit, TOOLKIT);
});

test('two labels for one toolkit finish initiating in order', async (t) => {
  const { fake, addresses, start, row } = await fixture(t);
  const initiate = fake.auth.initiate;
  let release;
  let entered;
  const paused = new Promise((resolve) => { release = resolve; });
  const started = new Promise((resolve) => { entered = resolve; });
  let entries = 0;
  t.mock.method(fake.auth, 'initiate', async (...args) => {
    entries += 1;
    if (entries === 1) {
      entered();
      await paused;
    } else {
      assert.equal(row('alpha').status, 'INITIATED');
    }
    return initiate(...args);
  });
  addresses({ alpha: ORIGIN, beta: ORIGIN });
  const first = start('alpha');
  await started;
  const second = start('beta');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(entries, 1);
  release();
  assert.equal((await first).status, 'link');
  assert.equal((await second).status, 'link');
  assert.equal(entries, 2);
  assert.notEqual(row('alpha').provider_account_id, row('beta').provider_account_id);
});

test('connection tool schemas are closed and expose no address field', () => {
  const fields = {
    start_connect: ['service', 'module', 'label'],
    connect_status: ['service', 'module', 'label'],
    execute: ['action', 'input', 'root', 'playbook', 'label', 'confirm'],
    disconnect: ['service', 'module', 'label', 'provider_account_id', 'confirm'],
  };
  for (const tool of TOOLS) {
    assert.ok(Object.keys(tool.inputSchema.properties).every((field) => !/address|origin|hostname|url/i.test(field)));
    if (!Object.hasOwn(fields, tool.name)) continue;
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.deepEqual(Object.keys(tool.inputSchema.properties), fields[tool.name]);
    assert.equal(new RegExp(tool.inputSchema.properties.label.pattern).test('crm.example.test'), false);
  }
});
