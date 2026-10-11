import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConnectionGateway } from '../src/gateway.js';
import { JsonFileStore } from '../src/store.js';
import { createAuthProvider } from '../providers/composio/auth-provider.js';
import { createAuthProvider as createLocalFileProvider } from '../providers/local-file/auth-provider.js';
import { createFakeProviders } from './fake-provider.js';

/**
 * Live, 2026-09-19, recorded in the SEO proofs: `connect_status` for
 * dataforseo and bing, neither of which had a connection record, called the
 * catalog account endpoint with an empty id. That URL is `/connected_accounts/`.
 * The provider answered 200 with a listing, and the gateway mapped the listing
 * to `vendor_error` (`http_status` 200, endpoint `/connected_accounts/`).
 * `execute` already answers `needs_connect` for a catalog module that still
 * has no account id after it refreshes from the account list.
 *
 * The fake provider's `status` answers `ABSENT` for an id it has never seen,
 * and `connect_status` already turns that word into `needs_connect`. A test
 * that uses only the fake passes on the code that failed live. The cases
 * below drive the shipped catalog adapter. `fetch` is replaced and any URL
 * the fixture does not name throws, so the run does not reach the network.
 */

const USER = 'wiser-01234567-89ab-cdef-0123-456789abcdef';
const ALLOW = { roles: ['runtime'], default_role: 'runtime', rules: [{ role: '*', effect: 'allow' }] };

function catalogConnector(service, module, toolkit, ran) {
  return {
    id: service,
    service,
    manifest: {
      modules: {
        [module]: {
          auth: { provider: 'catalog', toolkit, privilege: 'write' },
          actions: {
            ping: {
              risk: 'low',
              confirmation: 'none',
              input: { type: 'object', properties: {}, additionalProperties: false },
            },
          },
        },
      },
    },
    impl: { modules: { [module]: { ping: async () => { ran.count += 1; return { ok: true }; } } } },
  };
}

function emptyAccountEndpoint(pathname) {
  return pathname.endsWith('/connected_accounts/');
}

function accountList(call) {
  return call.pathname.endsWith('/connected_accounts') && call.search.includes('limit=');
}

function jsonResponse(status, body) {
  return { status, text: async () => JSON.stringify(body) };
}

/**
 * A 200 whose body is a listing, which is what the empty-id URL returned live.
 * `status` reads `data.status`, which a listing does not have, and maps that
 * to vendor_error. `listAccounts` reads `items`.
 * @param {object[]} items
 */
function routeListing(items) {
  return (url) => {
    if (emptyAccountEndpoint(url.pathname)) {
      return { status: 200, body: { items, next_cursor: null } };
    }
    if (url.pathname.endsWith('/connected_accounts') && url.searchParams.has('limit')) {
      return { status: 200, body: { items, next_cursor: null } };
    }
    const id = url.pathname.split('/').pop();
    const item = items.find((row) => row.id === id);
    if (item && url.pathname.endsWith(`/connected_accounts/${id}`)) {
      return { status: 200, body: { status: item.status } };
    }
    return null;
  };
}

function detail(result) {
  return JSON.stringify({
    status: result.status,
    http_status: result.http_status ?? null,
    endpoint: result.endpoint ?? null,
  });
}

/**
 * @param {import('node:test').TestContext} t
 * @param {(url: URL) => { status: number, body: object } | null} route
 * @param {object} [overrides]
 */
function mount(t, route, overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'wiser-connect-status-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const envPath = join(dir, 'auth-provider.env');
  writeFileSync(envPath, `WISER_AUTH_PROVIDER_KEY=synthetic-test-key\nWISER_USER_ID=${USER}\n`);
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const parsed = new URL(url);
    const method = init?.method ?? 'GET';
    calls.push({ pathname: parsed.pathname, search: parsed.search, method });
    const answered = route(parsed);
    if (!answered) throw new Error(`unrouted ${method} ${parsed.pathname}${parsed.search}`);
    return jsonResponse(answered.status, answered.body);
  });
  const ran = { count: 0 };
  const store = new JsonFileStore(dir);
  const gw = new ConnectionGateway({
    home: dir,
    role: 'runtime',
    harness: 'test',
    store,
    policy: overrides.policy || ALLOW,
    audit: { write() {} },
    authProvider: createAuthProvider({ envPath }),
    authConfigured: overrides.authConfigured !== undefined ? overrides.authConfigured : true,
    connectors: [
      catalogConnector('dataforseo', 'research', 'DATAFORSEO', ran),
      catalogConnector('bing', 'webmaster', 'BING_WEBMASTER_TOOLS', ran),
    ],
    envPath,
  });
  return { gw, store, calls, ran, provider: gw.authProvider };
}

test('the shipped catalog status maps an empty account id and a 200 listing to the live vendor_error, and the fake does not', async (t) => {
  const { provider, calls } = mount(t, (url) => {
    if (emptyAccountEndpoint(url.pathname)) {
      return { status: 200, body: { items: [{ id: 'ca_other', status: 'ACTIVE' }], next_cursor: null } };
    }
    if (url.pathname.endsWith('/connected_accounts/ca_live')) {
      return { status: 200, body: { status: 'ACTIVE' } };
    }
    return null;
  });
  const listing = await provider.status({ providerAccountId: '' });
  assert.equal(listing.error.code, 'vendor_error');
  assert.equal(listing.status, 200);
  assert.equal(listing.error.endpoint, '/connected_accounts/');
  assert.equal(listing.error.method, 'GET');
  assert.equal(calls.some((call) => emptyAccountEndpoint(call.pathname)), true);

  const named = await provider.status({ providerAccountId: 'ca_live' });
  assert.equal(named, 'ACTIVE');
  assert.notEqual(named, listing.status);

  const { auth } = createFakeProviders();
  assert.equal(await auth.status({ providerAccountId: '' }), 'ABSENT');
  assert.equal(await auth.status({ providerAccountId: null }), 'ABSENT');
});

test('connect_status with no catalog record, or a record with no account id, answers needs_connect and does not call the empty account endpoint', async (t) => {
  const { gw, store, calls, ran } = mount(t, routeListing([]));
  const emptyCalls = () => calls.filter((call) => emptyAccountEndpoint(call.pathname));

  const fresh = await gw.connectStatus({ service: 'dataforseo', module: 'research' });
  assert.equal(fresh.status, 'needs_connect', detail(fresh));
  assert.equal(fresh.service, 'dataforseo');
  assert.equal(fresh.module, 'research');
  assert.equal(fresh.privilege, 'write');
  assert.equal(emptyCalls().length, 0);
  assert.equal(calls.some(accountList), true);
  assert.equal(store.getConnection({ service: 'dataforseo', module: 'research' }), null);

  const also = await gw.connectStatus({ service: 'bing', module: 'webmaster' });
  assert.equal(also.status, 'needs_connect', detail(also));
  assert.equal(also.service, 'bing');
  assert.equal(also.module, 'webmaster');
  assert.equal(emptyCalls().length, 0);

  store.putConnection({
    service: 'dataforseo',
    module: 'research',
    privilege: 'write',
    provider: 'catalog',
    provider_account_id: null,
    scopes: [],
    status: 'INITIATED',
  });
  const missing = await gw.connectStatus({ service: 'dataforseo', module: 'research' });
  assert.equal(missing.status, 'needs_connect', detail(missing));
  assert.equal(emptyCalls().length, 0);
  const missingRow = store.getConnection({ service: 'dataforseo', module: 'research' });
  assert.equal(missingRow.provider_account_id, null);
  assert.equal(missingRow.status, 'INITIATED');

  store.putConnection({
    service: 'bing',
    module: 'webmaster',
    privilege: 'write',
    provider: 'catalog',
    provider_account_id: '',
    scopes: [],
    status: 'INITIATED',
  });
  const blank = await gw.connectStatus({ service: 'bing', module: 'webmaster' });
  assert.equal(blank.status, 'needs_connect', detail(blank));
  assert.equal(emptyCalls().length, 0);
  assert.equal(store.getConnection({ service: 'bing', module: 'webmaster' }).provider_account_id, '');

  const executed = await gw.execute({ action: 'dataforseo.research.ping', input: {} });
  assert.equal(executed.status, 'needs_connect');
  assert.equal(ran.count, 0);
  assert.equal(emptyCalls().length, 0);
});

test('a grant that exists only in the provider listing is read by that account id', async (t) => {
  const items = [{ id: 'ca_dataforseo', toolkit: { slug: 'DATAFORSEO' }, status: 'ACTIVE' }];
  const { gw, store, calls } = mount(t, routeListing(items));
  store.putConnection({
    service: 'dataforseo',
    module: 'research',
    privilege: 'write',
    provider: 'catalog',
    provider_account_id: null,
    scopes: [],
    status: 'INITIATED',
  });
  const data = await gw.connectStatus({ service: 'dataforseo', module: 'research' });
  assert.equal(data.status, 'connected', detail(data));
  assert.equal(calls.filter((call) => emptyAccountEndpoint(call.pathname)).length, 0);
  assert.equal(calls.some(accountList), true);
  assert.equal(calls.some((call) => call.pathname.endsWith('/connected_accounts/ca_dataforseo')), true);
  assert.equal(data.connection.provider_account_id, 'ca_dataforseo');
  assert.equal(data.connection.status, 'ACTIVE');

  const bing = await gw.connectStatus({ service: 'bing', module: 'webmaster' });
  assert.equal(bing.status, 'needs_connect', detail(bing));
  assert.equal(calls.filter((call) => emptyAccountEndpoint(call.pathname)).length, 0);
  assert.equal(store.getConnection({ service: 'bing', module: 'webmaster' }), null);
});

test('a record that has an account id still reports a provider failure from the shipped adapter', async (t) => {
  const { gw, store, calls } = mount(t, (url) => {
    if (url.pathname.endsWith('/connected_accounts/ca_real')) {
      return { status: 500, body: {} };
    }
    return null;
  });
  store.putConnection({
    service: 'dataforseo',
    module: 'research',
    privilege: 'write',
    provider: 'catalog',
    provider_account_id: 'ca_real',
    scopes: [],
    status: 'ACTIVE',
  });
  const result = await gw.connectStatus({ service: 'dataforseo', module: 'research' });
  assert.equal(result.status, 'vendor_error');
  assert.equal(result.http_status, 500);
  assert.equal(result.endpoint, '/connected_accounts/ca_real');
  assert.equal(result.method, 'GET');
  assert.equal(store.getConnection({ service: 'dataforseo', module: 'research' }).status, 'ACTIVE');
  assert.equal(calls.some((call) => emptyAccountEndpoint(call.pathname)), false);
  assert.equal(calls.some((call) => call.pathname.endsWith('/connected_accounts/ca_real')), true);
});

test('a denied connect_status policy still answers denied before any provider call', async (t) => {
  const { gw, calls } = mount(t, () => {
    throw new Error('fetch must not run');
  }, {
    policy: { roles: ['runtime'], default_role: 'runtime', rules: [{ role: '*', op: 'connectStatus', effect: 'deny' }] },
  });
  const result = await gw.connectStatus({ service: 'dataforseo', module: 'research' });
  assert.equal(result.status, 'denied');
  assert.equal(calls.length, 0);
});

test('a missing provider credential on connect_status still answers needs_provider', async (t) => {
  const { gw, calls } = mount(t, () => {
    throw new Error('fetch must not run');
  }, { authConfigured: false });
  const result = await gw.connectStatus({ service: 'dataforseo', module: 'research' });
  assert.equal(result.status, 'needs_provider');
  assert.equal(calls.length, 0);
});

test('a local-file module with no record still reads the credential file', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'wiser-connect-status-file-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const secrets = join(dir, 'secrets');
  mkdirSync(secrets);
  const local = createLocalFileProvider({ secretsDir: secrets });
  let statusCalls = 0;
  const readFile = local.status.bind(local);
  local.status = async (args) => {
    statusCalls += 1;
    return readFile(args);
  };
  const gw = new ConnectionGateway({
    home: dir,
    role: 'runtime',
    harness: 'test',
    store: new JsonFileStore(dir),
    policy: ALLOW,
    audit: { write() {} },
    authProvider: { isConfigured: () => true, async status() { throw new Error('catalog status'); } },
    localFileProvider: local,
    authConfigured: true,
    connectors: [{
      id: 'usebouncer',
      service: 'usebouncer',
      manifest: {
        modules: {
          verify: {
            auth: { provider: 'local-file', privilege: 'read', file: 'usebouncer.env', variables: ['API_KEY'] },
            actions: {},
          },
        },
      },
    }],
  });
  const result = await gw.connectStatus({ service: 'usebouncer', module: 'verify' });
  assert.equal(result.status, 'needs_connect');
  assert.equal(result.provider_status, 'INACTIVE');
  assert.equal(statusCalls, 1);
});
