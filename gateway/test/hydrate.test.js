import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConnectionGateway } from '../src/gateway.js';
import { JsonFileStore } from '../src/store.js';

const github = {
  id: 'github',
  service: 'github',
  manifest: {
    modules: {
      repos: {
        auth: { provider: 'catalog', toolkit: 'GITHUB', privilege: 'write' },
        actions: {
          get: { risk: 'low', confirmation: 'none', execution: { prefer: 'catalog' }, input: { type: 'object', properties: {} } },
        },
      },
      issues: { auth: { provider: 'catalog', toolkit: 'GITHUB', privilege: 'write' } },
      users: { auth: { provider: 'catalog', toolkit: 'GITHUB', privilege: 'read' } },
    },
  },
};

const localFile = {
  id: 'usebouncer',
  service: 'usebouncer',
  manifest: {
    modules: {
      verify: { auth: { provider: 'local-file', file: 'usebouncer.env' } },
    },
  },
};

function gateway(t, { accounts = [], storeRecords = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'wiser-hydrate-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const envPath = join(dir, 'auth-provider.env');
  writeFileSync(envPath, 'WISER_AUTH_PROVIDER_KEY=synthetic-test-key\nWISER_USER_ID=wiser-01234567-89ab-cdef-0123-456789abcdef\n');
  const store = new JsonFileStore(dir);
  for (const row of storeRecords) store.putConnection(row);
  const stats = { listCalls: 0, executes: [] };
  const authProvider = {
    name: 'test',
    isConfigured: () => true,
    async listAccounts({ userId }) {
      stats.listCalls += 1;
      assert.equal(userId, 'wiser-01234567-89ab-cdef-0123-456789abcdef');
      return accounts;
    },
  };
  const catalogProvider = {
    toSlug(id) { return id === 'github.repos.get' ? 'TEST_CATALOG_SLUG' : null; },
    async execute(args) {
      stats.executes.push(args);
      return { full_name: 'example/repo' };
    },
  };
  const gw = new ConnectionGateway({
    home: dir,
    store,
    policy: { roles: ['runtime'], default_role: 'runtime', rules: [{ role: '*', effect: 'allow' }] },
    audit: { record() {}, write() {} },
    authProvider,
    catalogProvider,
    authConfigured: true,
    connectors: [github, localFile],
    envPath,
  });
  return { gw, stats };
}

test('list_connections hydrates github modules from one ACTIVE toolkit account', async (t) => {
  const { gw } = gateway(t, {
    accounts: [{ id: 'ca_github', toolkit: 'GITHUB', status: 'ACTIVE' }],
  });
  const result = await gw.listConnections();
  assert.equal(result.status, undefined);
  const rows = result.connections.sort((a, b) => a.module.localeCompare(b.module));
  assert.deepEqual(rows.map((r) => [r.service, r.module, r.status, r.provider_account_id]), [
    ['github', 'issues', 'ACTIVE', 'ca_github'],
    ['github', 'repos', 'ACTIVE', 'ca_github'],
    ['github', 'users', 'ACTIVE', 'ca_github'],
  ]);
  assert.equal(rows.some((r) => r.service === 'usebouncer'), false);
});

test('hydrate does not overwrite an existing ACTIVE row', async (t) => {
  const { gw } = gateway(t, {
    accounts: [{ id: 'ca_new', toolkit: 'GITHUB', status: 'ACTIVE' }],
    storeRecords: [{
      service: 'github', module: 'repos', privilege: 'write', provider: 'catalog',
      provider_account_id: 'ca_existing', status: 'ACTIVE',
    }],
  });
  const result = await gw.listConnections();
  const repos = result.connections.find((r) => r.module === 'repos');
  assert.equal(repos.provider_account_id, 'ca_existing');
});

test('execute hydrates on a missing local row then runs', async (t) => {
  const { gw, stats } = gateway(t, {
    accounts: [{ id: 'ca_github', toolkit: 'GITHUB', status: 'ACTIVE' }],
  });
  const result = await gw.execute({ action: 'github.repos.get', input: { owner: 'example', repo: 'repo' } });
  assert.equal(result.status, undefined);
  assert.equal(result.full_name, 'example/repo');
  assert.equal(stats.listCalls, 1);
  assert.equal(stats.executes[0].providerAccountId, 'ca_github');
});

test('execute does not hydrate when the local row is already ACTIVE', async (t) => {
  const { gw, stats } = gateway(t, {
    accounts: [{ id: 'ca_new', toolkit: 'GITHUB', status: 'ACTIVE' }],
    storeRecords: [{
      service: 'github', module: 'repos', privilege: 'write', provider: 'catalog',
      provider_account_id: 'ca_existing', status: 'ACTIVE',
    }],
  });
  const result = await gw.execute({ action: 'github.repos.get', input: { owner: 'example', repo: 'repo' } });
  assert.equal(result.full_name, 'example/repo');
  assert.equal(stats.listCalls, 0);
  assert.equal(stats.executes[0].providerAccountId, 'ca_existing');
});
