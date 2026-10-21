import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { confirmationDigest, validateArgs } from '../src/gateway.js';
import { createTestGateway } from './fake-provider.js';

const allowTwenty = {
  roles: ['runtime'],
  default_role: 'runtime',
  rules: [
    { role: 'runtime', service: 'twenty', privilege: 'admin', effect: 'allow' },
    { role: 'runtime', privilege: 'admin', effect: 'deny' },
    { role: '*', effect: 'allow' },
  ],
};
const key = { service: 'twenty', module: 'records' };
const read = { action: 'twenty.records.workspace', input: {} };
const write = { action: 'twenty.records.create', input: { object: 'person', data: { name: 'Example' } } };
const pattern = '^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$';

async function fixture(t, options = {}) {
  const f = await createTestGateway({ policy: allowTwenty, session: false, ...options });
  t.after(() => rmSync(f.home, { recursive: true, force: true }));
  f.calls = [];
  f.fake.auth.proxy = async (request) => {
    f.calls.push(request);
    return {
      status: 200,
      data: { data: {
        currentWorkspace: { id: 'workspace-1', subdomain: request.providerAccountId, displayName: 'Example' },
        createPerson: { id: 'record-1' },
      } },
    };
  };
  return f;
}

function put(f, label, extra = {}) {
  const record = f.store.putConnection({
    ...key,
    ...(label === undefined ? {} : { label }),
    privilege: 'admin',
    provider: 'catalog',
    provider_account_id: `account-${label ?? 'default'}`,
    scopes: [],
    status: 'ACTIVE',
    ...extra,
  });
  if (record.provider_account_id) f.fake.auth.setStatus(record.provider_account_id, record.status);
  return record;
}

async function connect(f, label) {
  const args = { ...key, ...(label === undefined ? {} : { label }) };
  assert.equal((await f.gw.callTool('start_connect', args)).status, 'link');
  const row = f.store.getConnection(args);
  f.fake.auth.setStatus(row.provider_account_id, 'ACTIVE');
  const result = await f.gw.callTool('connect_status', args);
  assert.equal(result.status, 'connected');
  return result.connection;
}

function noProvider(f) {
  for (const name of ['initiate', 'status', 'listAccounts', 'proxy', 'revoke']) {
    f.fake.auth[name] = async () => assert.fail(`unexpected provider ${name}`);
  }
}

test('labels are optional on exactly four tool schemas and accept the published boundaries', async (t) => {
  const { gw } = await fixture(t);
  for (const tool of gw.listTools()) {
    if (['execute', 'start_connect', 'connect_status', 'disconnect'].includes(tool.name)) {
      const schema = tool.inputSchema.properties.label;
      assert.equal(schema.type, 'string');
      assert.equal(schema.pattern, pattern);
      assert.equal(typeof schema.description, 'string');
      assert.equal(tool.inputSchema.required.includes('label'), false);
      const args = tool.name === 'execute' ? read : key;
      for (const label of ['a', '0', 'a-b', 'a--b', 'a'.repeat(32)]) {
        assert.equal(validateArgs(tool.name, { ...args, label }), null);
      }
      assert.equal(validateArgs(tool.name, args), null);
    } else {
      assert.equal(Object.hasOwn(tool.inputSchema.properties, 'label'), false);
    }
  }
});

test('invalid labels stop before other validation, audit, store or provider activity', async (t) => {
  const f = await fixture(t);
  noProvider(f);
  for (const tool of ['execute', 'start_connect', 'connect_status', 'disconnect']) {
    for (const label of ['', null, undefined, 1, false, {}, [], 'Acme', '-acme', 'acme-', 'a_b', 'a b', 'a\n', 'a'.repeat(33)]) {
      assert.deepEqual(await f.gw.callTool(tool, { label }), {
        status: 'invalid_arguments', tool, field: 'label',
      });
    }
  }
  assert.equal(existsSync(f.audit.file), false);
  assert.equal(existsSync(f.store.file), false);
});

test('store identity separates old unlabelled rows and each label through updates and deletes', async (t) => {
  const f = await fixture(t);
  const old = put(f);
  const acme = put(f, 'acme');
  const beta = put(f, 'beta');
  assert.deepEqual(f.store.listConnections(), [old, acme, beta]);
  assert.equal(Object.hasOwn(old, 'label'), false);
  assert.deepEqual(Object.keys(old).sort(), [
    'id', 'service', 'module', 'privilege', 'provider', 'provider_account_id', 'scopes', 'status', 'created', 'updated',
  ].sort());
  assert.deepEqual(f.store.getConnection(key), old);
  assert.deepEqual(f.store.getConnection({ ...key, label: 'acme' }), acme);
  assert.equal(f.store.getConnection({ ...key, label: 'missing' }), null);
  const changed = put(f, 'acme', { provider_account_id: 'replacement', status: 'INITIATED' });
  assert.equal(changed.id, acme.id);
  assert.equal(changed.created, acme.created);
  assert.deepEqual(f.store.getConnection(key), old);
  assert.deepEqual(f.store.getConnection({ ...key, label: 'beta' }), beta);
  assert.deepEqual(f.store.deleteConnection({ ...key, label: 'acme' }), [changed]);
  assert.equal(f.store.getConnection({ ...key, label: 'acme' }), null);
  assert.deepEqual(f.store.deleteConnection(key), [old]);
  assert.deepEqual(f.store.listConnections(), [beta]);
  put(f, 'acme', { provider_account_id: beta.provider_account_id });
  assert.equal(f.store.deleteConnection({ providerAccountId: beta.provider_account_id }).length, 2);
  assert.deepEqual(f.store.listConnections(), []);
});

test('start_connect replaces only the requested labelled row and does not revoke the old account', async (t) => {
  const f = await fixture(t);
  const old = put(f);
  const acme = put(f, 'acme');
  const beta = put(f, 'beta');
  f.fake.auth.revoke = async () => assert.fail('reconnect must not revoke');
  assert.equal((await f.gw.callTool('start_connect', { ...key, label: 'acme' })).status, 'link');
  const initiated = f.store.getConnection({ ...key, label: 'acme' });
  assert.equal(initiated.status, 'INITIATED');
  assert.equal(initiated.label, 'acme');
  assert.notEqual(initiated.provider_account_id, acme.provider_account_id);
  assert.deepEqual(f.store.getConnection(key), old);
  assert.deepEqual(f.store.getConnection({ ...key, label: 'beta' }), beta);
  assert.equal(f.fake.accounts.get(acme.provider_account_id), 'ACTIVE');
});

test('start_connect refuses a local-file label before policy and provider checks', async (t) => {
  const f = await fixture(t, { policy: { rules: [{ role: '*', effect: 'deny' }] }, authConfigured: false });
  noProvider(f);
  assert.deepEqual(await f.gw.callTool('start_connect', { service: 'usebouncer', module: 'verify', label: 'acme' }), {
    status: 'invalid_arguments', tool: 'start_connect', field: 'label',
  });
  assert.equal(existsSync(f.store.file), false);
});

test('connect_status without a labelled account never hydrates or asks the provider', async (t) => {
  const f = await fixture(t);
  const old = put(f);
  noProvider(f);
  const expected = { status: 'needs_connect', ...key, privilege: 'admin', label: 'acme' };
  assert.deepEqual(await f.gw.callTool('connect_status', { ...key, label: 'acme' }), expected);
  put(f, 'acme', { provider_account_id: null, status: 'INITIATED' });
  const before = f.store.listConnections();
  assert.deepEqual(await f.gw.callTool('connect_status', { ...key, label: 'acme' }), expected);
  assert.deepEqual(f.store.listConnections(), before);
  assert.deepEqual(f.store.getConnection(key), old);
});

test('labelled activation binds both real Twenty modules with their declared metadata', async (t) => {
  const f = await fixture(t);
  const old = put(f);
  const beta = put(f, 'beta', { module: 'metadata' });
  const active = await connect(f, 'acme');
  const sibling = f.store.getConnection({ service: 'twenty', module: 'metadata', label: 'acme' });
  assert.equal(sibling.provider_account_id, active.provider_account_id);
  assert.equal(sibling.status, 'ACTIVE');
  assert.equal(sibling.privilege, 'admin');
  assert.equal(sibling.provider, 'catalog');
  assert.deepEqual(f.store.getConnection(key), old);
  assert.deepEqual(f.store.getConnection({ service: 'twenty', module: 'metadata', label: 'beta' }), beta);
  const listed = await f.gw.callTool('list_connections', {});
  assert.equal(listed.connections.filter((row) => row.label === 'acme').length, 2);
  for (const module of ['records', 'metadata']) {
    const answer = await f.gw.callTool('execute', { action: `twenty.${module}.workspace`, label: 'acme', input: {} });
    assert.equal(answer.subdomain, active.provider_account_id);
    assert.equal(f.calls.at(-1).providerAccountId, active.provider_account_id);
  }
});

test('labelled toolkit binding normalizes case and CUSTOM_ and moves every same-label sibling to its credential', async (t) => {
  const f = await fixture(t);
  const twenty = f.connectors.find((c) => c.id === 'twenty');
  const modules = structuredClone(twenty.manifest.modules);
  modules.metadata.auth.toolkit = 'twenty';
  modules.metadata.auth.privilege = 'read';
  modules.other = { auth: { ...modules.records.auth, toolkit: 'OTHER' } };
  modules.local = { auth: { ...modules.records.auth, provider: 'local-file' } };
  f.gw.connectors = [{ ...twenty, manifest: { ...twenty.manifest, modules } }];
  put(f, 'acme', { module: 'metadata', status: 'EXPIRED' });
  const active = await connect(f, 'acme');
  const siblingKey = { service: 'twenty', module: 'metadata', label: 'acme' };
  const sibling = f.store.getConnection(siblingKey);
  assert.equal(sibling.provider_account_id, active.provider_account_id);
  assert.equal(sibling.privilege, 'read');
  assert.equal(f.store.getConnection({ ...siblingKey, module: 'other' }), null);
  assert.equal(f.store.getConnection({ ...siblingKey, module: 'local' }), null);
  put(f, 'acme', { module: 'metadata', provider_account_id: 'independent-account' });
  await f.gw.callTool('connect_status', { ...key, label: 'acme' });
  const moved = f.store.getConnection(siblingKey);
  assert.equal(moved.provider_account_id, active.provider_account_id);
  assert.equal(moved.status, 'ACTIVE');
});

test('unlabelled connect_status activates only its own module', async (t) => {
  const f = await fixture(t);
  const active = await connect(f);
  assert.equal(Object.hasOwn(active, 'label'), false);
  assert.equal(f.store.getConnection({ service: 'twenty', module: 'metadata' }), null);
});

test('labelled status writes and provider failures leave other labels and the default intact', async (t) => {
  const f = await fixture(t);
  const old = put(f);
  const beta = put(f, 'beta');
  const acme = put(f, 'acme');
  f.fake.auth.setStatus(acme.provider_account_id, 'EXPIRED');
  const result = await f.gw.callTool('connect_status', { ...key, label: 'acme' });
  assert.deepEqual(result, { status: 'needs_connect', ...key, privilege: 'admin', label: 'acme', provider_status: 'EXPIRED' });
  assert.equal(f.store.getConnection({ ...key, label: 'acme' }).status, 'EXPIRED');
  assert.deepEqual(f.store.getConnection(key), old);
  assert.deepEqual(f.store.getConnection({ ...key, label: 'beta' }), beta);
  const before = f.store.listConnections();
  f.fake.auth.status = async () => ({ status: 503, error: { code: 'vendor_error', endpoint: '/status', method: 'GET' } });
  assert.equal((await f.gw.callTool('connect_status', { ...key, label: 'acme' })).status, 'vendor_error');
  assert.deepEqual(f.store.listConnections(), before);
  f.fake.auth.status = async () => null;
  assert.equal((await f.gw.callTool('connect_status', { ...key, label: 'acme' })).label, 'acme');
  assert.deepEqual(f.store.listConnections(), before);
});

test('labelled status cannot recreate a row removed or rebound during its provider call', async (t) => {
  for (const change of ['remove', 'rebind']) {
    const f = await fixture(t);
    const beta = put(f, 'beta');
    put(f, 'acme');
    f.fake.auth.status = async () => {
      if (change === 'remove') f.store.deleteConnection({ ...key, label: 'acme' });
      else put(f, 'acme', { provider_account_id: 'new-account', status: 'INITIATED' });
      return 'ACTIVE';
    };
    const result = await f.gw.callTool('connect_status', { ...key, label: 'acme' });
    assert.equal(result.status, 'needs_connect');
    assert.equal(result.label, 'acme');
    assert.equal(result.reason, change === 'remove' ? 'removed_while_checking' : 'rebound_while_checking');
    assert.deepEqual(f.store.getConnection({ ...key, label: 'beta' }), beta);
    assert.equal(f.store.getConnection({ service: 'twenty', module: 'metadata', label: 'acme' }), null);
  }
});

test('execute selects only the named label or the unlabelled account', async (t) => {
  const f = await fixture(t);
  const old = put(f);
  const acme = put(f, 'acme');
  const beta = put(f, 'beta');
  f.fake.auth.listAccounts = async () => assert.fail('ACTIVE execute must not hydrate');
  for (const row of [acme, beta, old]) {
    const result = await f.gw.callTool('execute', { ...read, ...(row.label === undefined ? {} : { label: row.label }) });
    assert.equal(result.subdomain, row.provider_account_id);
    assert.equal(f.calls.at(-1).providerAccountId, row.provider_account_id);
  }
});

test('execute with a missing or inactive label stops without provider calls or hydration', async (t) => {
  const f = await fixture(t);
  put(f);
  put(f, 'beta');
  noProvider(f);
  for (const status of [null, 'INITIATED', 'EXPIRED', 'INACTIVE', 'FAILED', 'ABSENT']) {
    if (status) put(f, 'acme', { status });
    const before = f.store.listConnections();
    assert.deepEqual(await f.gw.callTool('execute', { ...read, label: 'acme' }), {
      status: 'needs_connect', ...key, privilege: 'admin', label: 'acme',
    });
    assert.deepEqual(f.store.listConnections(), before);
  }
});

test('execute and disconnect without a default refuse with sorted module labels before provider activity', async (t) => {
  const f = await fixture(t);
  put(f, 'zeta', { status: 'EXPIRED' });
  put(f, 'acme');
  put(f, 'other-module', { module: 'metadata' });
  noProvider(f);
  for (const tool of ['execute', 'disconnect']) {
    assert.deepEqual(await f.gw.callTool(tool, tool === 'execute' ? read : key), {
      status: 'invalid_arguments', tool, field: 'label', labels: ['acme', 'zeta'],
    });
  }
});

test('unlabelled execute never adopts onto a toolkit that holds a labelled row', async (t) => {
  for (const status of [null, 'EXPIRED']) {
    const f = await fixture(t);
    const labelled = put(f, 'acme', { module: 'metadata' });
    if (status) put(f, undefined, { status });
    f.fake.auth.listAccounts = async () => [{ id: 'adoptable-account', toolkit: 'CUSTOM_TWENTY', status: 'ACTIVE' }];
    const before = f.calls.length;
    const result = await f.gw.callTool('execute', read);
    assert.equal(result.status, 'needs_connect');
    assert.equal(f.calls.length, before);
    const row = f.store.getConnection(key);
    assert.equal(row?.provider_account_id === 'adoptable-account', false);
    assert.deepEqual(f.store.getConnection({ service: 'twenty', module: 'metadata', label: 'acme' }), labelled);
  }
});

test('unlabelled adoption still runs on a toolkit with no labelled row', async (t) => {
  const f = await fixture(t);
  f.fake.auth.listAccounts = async () => [{ id: 'adoptable-account', toolkit: 'CUSTOM_TWENTY', status: 'ACTIVE' }];
  f.fake.auth.setStatus('adoptable-account', 'ACTIVE');
  const result = await f.gw.callTool('execute', read);
  assert.equal(result.subdomain, 'adoptable-account');
  const row = f.store.getConnection(key);
  assert.equal(row.status, 'ACTIVE');
  assert.equal(Object.hasOwn(row, 'label'), false);
});

test('an account a label just let go of is never adopted into the unlabelled binding', async (t) => {
  const f = await fixture(t);
  const first = await connect(f, 'acme');
  assert.equal((await f.gw.callTool('start_connect', { ...key, label: 'acme' })).status, 'link');
  assert.equal((await f.gw.callTool('start_connect', { service: 'twenty', module: 'metadata', label: 'acme' })).status, 'link');
  f.fake.auth.listAccounts = async () => [{ id: first.provider_account_id, toolkit: 'CUSTOM_TWENTY', status: 'ACTIVE' }];
  await f.gw.callTool('list_connections', {});
  assert.equal(f.store.getConnection(key), null);
  assert.equal(f.store.getConnection({ service: 'twenty', module: 'metadata' }), null);
  const refused = await f.gw.callTool('execute', read);
  assert.equal(refused.status, 'invalid_arguments');
  assert.deepEqual(refused.labels, ['acme']);
});

test('hydration never adopts an account held by any labelled row or refreshes a labelled row', async (t) => {
  const f = await fixture(t);
  const held = put(f, 'acme', { module: 'metadata', status: 'EXPIRED' });
  const stale = put(f, undefined, { status: 'EXPIRED' });
  f.fake.auth.listAccounts = async () => [{ id: held.provider_account_id, toolkit: 'CUSTOM_TWENTY', status: 'ACTIVE' }];
  await f.gw.hydrateFromProvider();
  assert.deepEqual(f.store.listConnections(), [held, stale]);
  assert.equal((await f.gw.callTool('execute', read)).status, 'needs_connect');
  assert.deepEqual(f.store.listConnections(), [held, stale]);
  f.store.deleteConnection(key);
  assert.equal((await f.gw.callTool('connect_status', key)).status, 'needs_connect');
  assert.deepEqual((await f.gw.callTool('list_connections', {})).connections, [held]);
});

test('hydration rechecks labelled ownership after an account listing was requested', async (t) => {
  const f = await fixture(t);
  let held;
  f.fake.auth.listAccounts = async () => {
    held = put(f, 'acme', { module: 'metadata' });
    return [{ id: held.provider_account_id, toolkit: 'TWENTY', status: 'ACTIVE' }];
  };
  await f.gw.hydrateFromProvider();
  assert.deepEqual(f.store.listConnections(), [held]);
});

test('execute confirmation binds label even when the account and input are identical', async (t) => {
  const f = await fixture(t);
  const acme = put(f, 'acme');
  put(f, 'beta', { provider_account_id: acme.provider_account_id });
  put(f, undefined, { provider_account_id: acme.provider_account_id });
  const stop = await f.gw.callTool('execute', { ...write, label: 'acme' });
  assert.equal(stop.status, 'needs_confirmation');
  assert.equal(stop.label, 'acme');
  assert.equal(f.gw.pendingConfirmations.has(confirmationDigest([
    'execute', write.action, write.input, acme.provider_account_id, 'acme',
  ])), true);
  for (const label of ['beta', undefined]) {
    const result = await f.gw.callTool('execute', { ...write, confirm: true, ...(label === undefined ? {} : { label }) });
    assert.equal(result.status, 'needs_confirmation');
    assert.equal(result.reason, 'unmatched_confirm');
    assert.equal(result.label, label ?? null);
  }
  assert.equal(f.calls.length, 0);
  assert.deepEqual(await f.gw.callTool('execute', { ...write, label: 'acme', confirm: true }), { id: 'record-1' });
  assert.equal(f.calls.length, 1);
  assert.equal((await f.gw.callTool('execute', { ...write, label: 'acme', confirm: true })).reason, 'unmatched_confirm');
});

test('once confirmations are scoped to the labelled account', async (t) => {
  const f = await fixture(t);
  const twenty = f.connectors.find((c) => c.id === 'twenty');
  const manifest = structuredClone(twenty.manifest);
  manifest.modules.records.actions.create.confirmation = 'once';
  f.gw.connectors = [{ ...twenty, manifest }];
  put(f, 'acme');
  put(f, 'beta');
  await f.gw.callTool('execute', { ...write, label: 'acme' });
  assert.deepEqual(await f.gw.callTool('execute', { ...write, label: 'acme', confirm: true }), { id: 'record-1' });
  assert.equal((await f.gw.callTool('execute', { ...write, label: 'beta' })).status, 'needs_confirmation');
  put(f, 'acme', { provider_account_id: 'new-account' });
  assert.equal((await f.gw.callTool('execute', { ...write, label: 'acme' })).status, 'needs_confirmation');
});

test('execute auth refusals refresh only the selected label and carry it on needs_connect', async (t) => {
  const f = await fixture(t);
  const old = put(f);
  const beta = put(f, 'beta');
  const acme = put(f, 'acme');
  f.fake.auth.setStatus(acme.provider_account_id, 'EXPIRED');
  f.fake.auth.proxy = async () => ({ status: 401, error: { code: 'vendor_error', endpoint: '/metadata', method: 'POST' } });
  const result = await f.gw.callTool('execute', { ...read, label: 'acme' });
  assert.deepEqual(result, { status: 'needs_connect', ...key, privilege: 'admin', provider_status: 'EXPIRED', reason: 'refused_by_provider', label: 'acme' });
  assert.equal(f.store.getConnection({ ...key, label: 'acme' }).status, 'EXPIRED');
  assert.deepEqual(f.store.getConnection(key), old);
  assert.deepEqual(f.store.getConnection({ ...key, label: 'beta' }), beta);
});

test('disconnect names labels and revokes every binding to the selected credential only', async (t) => {
  const f = await fixture(t);
  const acme = await connect(f, 'acme');
  const beta = await connect(f, 'beta');
  put(f, undefined, { provider_account_id: acme.provider_account_id });
  const stop = await f.gw.callTool('disconnect', { ...key, label: 'acme' });
  assert.equal(stop.status, 'needs_confirmation');
  assert.equal(stop.label, 'acme');
  assert.deepEqual(stop.modules_ending, [
    { ...key, label: 'acme' },
    { service: 'twenty', module: 'metadata', label: 'acme' },
    key,
  ]);
  assert.match(stop.summary, /twenty\/records@acme/);
  assert.match(stop.summary, /twenty\/metadata@acme/);
  const args = { ...key, label: 'acme', confirm: true, provider_account_id: acme.provider_account_id };
  assert.deepEqual(await f.gw.callTool('disconnect', { ...args, provider_account_id: 'different-account' }), {
    status: 'denied', rule: { effect: 'deny', reason: 'account_changed' }, ...key,
  });
  const result = await f.gw.callTool('disconnect', args);
  assert.equal(result.status, 'disconnected');
  assert.deepEqual(
    result.removed.map((row) => `${row.module}@${row.label ?? ''}`).sort(),
    ['metadata@acme', 'records@', 'records@acme'],
  );
  assert.equal(result.removed.filter((row) => Object.hasOwn(row, 'label')).length, 2);
  assert.equal(f.fake.accounts.has(acme.provider_account_id), false);
  assert.equal(f.fake.accounts.get(beta.provider_account_id), 'ACTIVE');
  assert.equal(f.store.listConnections().length, 2);
  assert.equal(f.store.listConnections().every((row) => row.label === 'beta'), true);
});

test('disconnect approvals bind the selected label even on a shared account', async (t) => {
  const f = await fixture(t);
  const acme = put(f, 'acme');
  put(f, 'beta', { provider_account_id: acme.provider_account_id });
  put(f, undefined, { provider_account_id: acme.provider_account_id });
  await f.gw.callTool('disconnect', { ...key, label: 'acme' });
  f.fake.auth.revoke = async () => assert.fail('unmatched label approval must not revoke');
  for (const label of ['beta', undefined]) {
    const stop = await f.gw.callTool('disconnect', {
      ...key, confirm: true, provider_account_id: acme.provider_account_id,
      ...(label === undefined ? {} : { label }),
    });
    assert.equal(stop.status, 'needs_confirmation');
    assert.equal(stop.reason, 'unmatched_confirm');
    assert.equal(stop.label, label ?? null);
  }
});

test('disconnect approval is invalidated when a bound row changes its label', async (t) => {
  const f = await fixture(t);
  const acme = put(f, 'acme');
  put(f, 'beta', { module: 'metadata', provider_account_id: acme.provider_account_id });
  await f.gw.callTool('disconnect', { ...key, label: 'acme' });
  f.store.deleteConnection({ service: 'twenty', module: 'metadata', label: 'beta' });
  put(f, 'gamma', { module: 'metadata', provider_account_id: acme.provider_account_id });
  f.fake.auth.revoke = async () => assert.fail('changed bound labels must not revoke');
  const result = await f.gw.callTool('disconnect', {
    ...key, label: 'acme', confirm: true, provider_account_id: acme.provider_account_id,
  });
  assert.equal(result.status, 'needs_confirmation');
  assert.equal(result.reason, 'unmatched_confirm');
  assert.match(result.summary, /twenty\/metadata@gamma/);
});

test('unlabelled disconnect selects the default and leaves other accounts intact', async (t) => {
  const f = await fixture(t);
  const old = put(f);
  const acme = put(f, 'acme');
  const stop = await f.gw.callTool('disconnect', key);
  assert.equal(stop.label, null);
  assert.deepEqual(stop.modules_ending, [key]);
  const result = await f.gw.callTool('disconnect', { ...key, provider_account_id: old.provider_account_id, confirm: true });
  assert.equal(result.status, 'disconnected');
  assert.deepEqual(f.store.listConnections(), [acme]);
});

test('every audited operation records its label or null, including stops', async (t) => {
  const f = await fixture(t);
  for (const label of ['acme', undefined]) {
    const connection = await connect(f, label);
    const labelled = label === undefined ? {} : { label };
    await f.gw.callTool('execute', { ...write, ...labelled });
    await f.gw.callTool('disconnect', { ...key, ...labelled });
    const lines = readFileSync(f.audit.file, 'utf8').trim().split('\n').map(JSON.parse);
    const recent = lines.slice(-4);
    assert.deepEqual(recent.map((row) => row.op), ['startConnect', 'connectStatus', 'execute', 'disconnect']);
    assert.equal(recent.every((row) => Object.hasOwn(row, 'label') && row.label === (label ?? null)), true);
    assert.equal(recent[2].provider_account_id, connection.provider_account_id);
  }
  await f.gw.callTool('execute', { ...read, label: 'missing' });
  const last = JSON.parse(readFileSync(f.audit.file, 'utf8').trim().split('\n').at(-1));
  assert.equal(last.label, 'missing');
  assert.equal(last.status, 'needs_connect');
});

test('a reconnect under a label moves the whole label to the new credential', async (t) => {
  const f = await fixture(t);
  const first = await connect(f, 'acme');
  const metadataKey = { service: 'twenty', module: 'metadata', label: 'acme' };
  assert.equal(f.store.getConnection(metadataKey).provider_account_id, first.provider_account_id);
  const second = await connect(f, 'acme');
  assert.notEqual(second.provider_account_id, first.provider_account_id);
  assert.equal(f.store.getConnection(metadataKey).provider_account_id, second.provider_account_id);
  assert.equal(f.store.getConnection(metadataKey).status, 'ACTIVE');
});

test('a row whose label is null or empty reads as the unlabelled binding', async (t) => {
  const f = await fixture(t);
  const file = join(f.home, 'connections.json');
  const now = new Date().toISOString();
  const row = (module, label) => ({
    id: `row-${module}`, service: 'twenty', module, label, privilege: 'admin', provider: 'catalog',
    provider_account_id: `account-${module}`, scopes: [], status: 'ACTIVE', created: now, updated: now,
  });
  writeFileSync(file, JSON.stringify({ userId: null, connections: [row('records', null), row('metadata', '')] }));
  for (const module of ['records', 'metadata']) {
    const found = f.store.getConnection({ service: 'twenty', module });
    assert.equal(found?.provider_account_id, `account-${module}`);
    assert.equal(Object.hasOwn(found, 'label'), false);
  }
  assert.equal(f.store.getConnection({ ...key, label: null })?.provider_account_id, 'account-records');
  assert.throws(() => f.store.putConnection({ ...key, label: '', privilege: 'admin', provider: 'catalog', status: 'ACTIVE' }));
  f.store.putConnection({ ...key, label: null, privilege: 'admin', provider: 'catalog', provider_account_id: 'account-new', status: 'ACTIVE' });
  assert.equal(f.store.listConnections().filter((r) => r.module === 'records').length, 1);
  assert.equal(f.store.getConnection(key).provider_account_id, 'account-new');
});

test('a label on a local-file module is refused on every tool that takes one', async (t) => {
  const f = await fixture(t);
  noProvider(f);
  for (const [tool, args] of [
    ['execute', { action: 'usebouncer.verify.credits', input: {} }],
    ['connect_status', { service: 'usebouncer', module: 'verify' }],
    ['disconnect', { service: 'usebouncer', module: 'verify' }],
  ]) {
    const result = await f.gw.callTool(tool, { ...args, label: 'acme' });
    assert.equal(result.status, 'invalid_arguments', tool);
    assert.equal(result.field, 'label', tool);
  }
  assert.equal(f.store.listConnections().length, 0);
});

test('a refresh under a label leaves a sibling that is mid-reconnect onto a new account', async (t) => {
  const f = await fixture(t);
  const first = await connect(f, 'acme');
  const metadataKey = { service: 'twenty', module: 'metadata', label: 'acme' };
  assert.equal((await f.gw.callTool('start_connect', metadataKey)).status, 'link');
  const pending = f.store.getConnection(metadataKey);
  assert.equal(pending.status, 'INITIATED');
  assert.notEqual(pending.provider_account_id, first.provider_account_id);
  assert.equal((await f.gw.callTool('connect_status', { ...key, label: 'acme' })).status, 'connected');
  assert.deepEqual(f.store.getConnection(metadataKey), pending);
  f.fake.auth.setStatus(pending.provider_account_id, 'ACTIVE');
  assert.equal((await f.gw.callTool('connect_status', metadataKey)).status, 'connected');
  assert.equal(f.store.getConnection({ ...key, label: 'acme' }).provider_account_id, pending.provider_account_id);
});

test('an empty label in a lookup or a removal reads as no label', async (t) => {
  const f = await fixture(t);
  const plain = put(f, undefined);
  assert.deepEqual(f.store.getConnection({ ...key, label: '' }), plain);
  assert.equal(f.store.deleteConnection({ ...key, label: '' }).length, 1);
  assert.equal(f.store.getConnection(key), null);
});
