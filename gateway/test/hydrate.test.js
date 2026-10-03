import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConnectionGateway } from '../src/gateway.js';
import { JsonFileStore } from '../src/store.js';
import { createAuthProvider } from '../providers/composio/auth-provider.js';

const github = {
  id: 'github',
  service: 'github',
  manifest: {
    modules: {
      repos: {
        auth: { provider: 'catalog', toolkit: 'GITHUB', privilege: 'write' },
        actions: {
          // The two fields these tests supply are declared here because the gateway
          // validates a call against its published schema before running it. A fixture
          // that sends what its own manifest does not declare is the divergence class
          // gateway/test/agreement.test.js exists to catch, in a test fixture.
          get: {
            risk: 'low', confirmation: 'none', execution: { prefer: 'catalog' },
            input: {
              type: 'object',
              properties: { owner: { type: 'string' }, repo: { type: 'string' } },
              additionalProperties: false,
            },
          },
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

const customGithub = {
  id: 'other',
  service: 'other',
  manifest: {
    modules: {
      repos: {
        auth: { provider: 'catalog', toolkit: 'CUSTOM_GITHUB', privilege: 'write' },
        actions: {},
      },
    },
  },
};

function gateway(t, { accounts = [], storeRecords = [], connectors } = {}) {
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
    connectors: connectors || [github, localFile],
    envPath,
  });
  return { gw, store, stats };
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

test('hydrate skips a toolkit when two ACTIVE accounts share it and leaves an existing record untouched', async (t) => {
  const existing = {
    service: 'github', module: 'repos', privilege: 'write', provider: 'catalog',
    provider_account_id: 'ca_existing', status: 'INITIATED',
  };
  const { gw, store } = gateway(t, {
    accounts: [
      { id: 'ca_one', toolkit: 'GITHUB', status: 'ACTIVE' },
      { id: 'ca_two', toolkit: 'GITHUB', status: 'ACTIVE' },
    ],
    storeRecords: [existing],
  });
  const before = store.getConnection({ service: 'github', module: 'repos' });
  const result = await gw.listConnections();
  assert.equal(result.status, undefined);
  const after = store.getConnection({ service: 'github', module: 'repos' });
  assert.equal(after.provider_account_id, before.provider_account_id);
  assert.equal(after.status, before.status);
  assert.equal(after.id, before.id);
  assert.deepEqual(
    result.connections.map((r) => [r.service, r.module, r.status, r.provider_account_id]),
    [['github', 'repos', 'INITIATED', 'ca_existing']],
  );
});

test('hydrate treats CUSTOM_ and unprefixed toolkit keys as the same grant', async (t) => {
  const { gw } = gateway(t, {
    accounts: [
      { id: 'ca_plain', toolkit: 'GITHUB', status: 'ACTIVE' },
      { id: 'ca_custom', toolkit: 'CUSTOM_GITHUB', status: 'ACTIVE' },
    ],
    connectors: [github, customGithub, localFile],
  });
  const result = await gw.listConnections();
  assert.equal(result.status, undefined);
  assert.deepEqual(result.connections, []);
});

test('hydrate adopts the one ACTIVE account when the other is not ACTIVE', async (t) => {
  const { gw } = gateway(t, {
    accounts: [
      { id: 'ca_active', toolkit: 'GITHUB', status: 'ACTIVE' },
      { id: 'ca_idle', toolkit: 'GITHUB', status: 'INACTIVE' },
    ],
  });
  const result = await gw.listConnections();
  assert.equal(result.status, undefined);
  const rows = result.connections.sort((a, b) => a.module.localeCompare(b.module));
  assert.deepEqual(rows.map((r) => [r.service, r.module, r.status, r.provider_account_id]), [
    ['github', 'issues', 'ACTIVE', 'ca_active'],
    ['github', 'repos', 'ACTIVE', 'ca_active'],
    ['github', 'users', 'ACTIVE', 'ca_active'],
  ]);
});

const notion = {
  id: 'notion',
  service: 'notion',
  manifest: {
    modules: {
      pages: { auth: { provider: 'catalog', toolkit: 'NOTION', privilege: 'read' } },
    },
  },
};

const LISTING_USER = 'wiser-01234567-89ab-cdef-0123-456789abcdef';

/**
 * Hydration through the real auth adapter. A fake that throws cannot show a
 * first page being written when a later page fails, because the gateway only
 * sees the array or the rejection.
 */
function listingGateway(t, { pages, storeRecords = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'wiser-hydrate-list-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const envPath = join(dir, 'auth-provider.env');
  writeFileSync(envPath, `WISER_AUTH_PROVIDER_KEY=synthetic-test-key\nWISER_USER_ID=${LISTING_USER}\n`);
  const store = new JsonFileStore(dir);
  for (const row of storeRecords) store.putConnection(row);
  let n = 0;
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    const parsed = new URL(url);
    calls.push(parsed);
    const page = pages[n++];
    const status = page.status ?? 200;
    const body = page.body ?? { error: 'provider-body-sentinel' };
    return { status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) };
  });
  const gw = new ConnectionGateway({
    home: dir,
    store,
    policy: { roles: ['runtime'], default_role: 'runtime', rules: [{ role: '*', effect: 'allow' }] },
    audit: { record() {}, write() {} },
    authProvider: createAuthProvider({ envPath }),
    authConfigured: true,
    connectors: [github, notion, localFile],
    envPath,
  });
  return { gw, store, calls };
}

function projected(connections) {
  return connections
    .map((row) => [row.service, row.module, row.status, row.provider_account_id])
    .sort((a, b) => `${a[0]}/${a[1]}`.localeCompare(`${b[0]}/${b[1]}`));
}

test('hydrate writes ACTIVE rows from both pages of a provider listing', async (t) => {
  const { gw, calls } = listingGateway(t, {
    pages: [
      {
        body: {
          items: [
            { id: 'ca_github', toolkit: { slug: 'GITHUB' }, status: 'ACTIVE', state: { access_token: 'should-not-leave' } },
            { id: 'ca_old', toolkit: { slug: 'GITHUB' }, status: 'EXPIRED' },
          ],
          next_cursor: 'page-2',
        },
      },
      {
        body: {
          items: [{ id: 'ca_notion', toolkit: { slug: 'NOTION' }, status: 'ACTIVE' }],
          next_cursor: null,
        },
      },
    ],
  });
  await gw.hydrateFromProvider();
  assert.equal(calls.length, 2);
  for (const parsed of calls) {
    assert.equal(parsed.searchParams.get('user_ids'), LISTING_USER);
    assert.deepEqual(parsed.searchParams.getAll('statuses'), ['ACTIVE']);
    assert.equal(parsed.searchParams.get('limit'), '100');
  }
  assert.equal(calls[0].searchParams.get('cursor'), null);
  assert.equal(calls[1].searchParams.get('cursor'), 'page-2');
  assert.deepEqual(projected(gw.store.listConnections()), [
    ['github', 'issues', 'ACTIVE', 'ca_github'],
    ['github', 'repos', 'ACTIVE', 'ca_github'],
    ['github', 'users', 'ACTIVE', 'ca_github'],
    ['notion', 'pages', 'ACTIVE', 'ca_notion'],
  ]);
});

test('hydrate writes nothing when a later listing page fails', async (t) => {
  const existing = {
    service: 'github', module: 'repos', privilege: 'write', provider: 'catalog',
    provider_account_id: 'ca_existing', status: 'INITIATED',
  };
  const { gw, store, calls } = listingGateway(t, {
    storeRecords: [existing],
    pages: [
      {
        body: {
          items: [{ id: 'ca_github', toolkit: { slug: 'GITHUB' }, status: 'ACTIVE' }],
          next_cursor: 'page-2',
        },
      },
      { status: 500, body: { error: 'provider-body-sentinel' } },
    ],
  });
  const before = store.getConnection({ service: 'github', module: 'repos' });
  await gw.hydrateFromProvider();
  assert.equal(calls.length, 2);
  const after = store.getConnection({ service: 'github', module: 'repos' });
  assert.equal(after.id, before.id);
  assert.equal(after.status, 'INITIATED');
  assert.equal(after.provider_account_id, 'ca_existing');
  assert.deepEqual(projected(store.listConnections()), [
    ['github', 'repos', 'INITIATED', 'ca_existing'],
  ]);
});

