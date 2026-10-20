import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createAuthProvider } from '../providers/composio/auth-provider.js';
import { createCatalogProvider } from '../providers/composio/catalog-provider.js';
import { createTestGateway, makeHome } from './fake-provider.js';

// A lapsed grant end to end, through both real provider adapters, with the provider's
// answers as measured on 2026-10-19: the first call after the lapse is HTTP 200 carrying
// the upstream 401 in data.status_code; every later execute is HTTP 410.
const key = { service: 'google', module: 'drive' };
const action = 'google.drive.find_file';
const account = 'ca_lapsed_fixture';
const firstCall = { successful: false, error: 'fixture', data: { message: 'fixture', status_code: 401 }, log_id: 'log_fixture' };
const laterCall = { error: { code: 1820, slug: 'fixture', status: 410, message: 'fixture' } };

async function gateway(t, { executeStatus, executeBody, accountStatus }) {
  const home = makeHome();
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const envPath = join(home, 'provider.env');
  writeFileSync(envPath, 'WISER_AUTH_PROVIDER_KEY=synthetic-test-key\n');
  const fake = { auth: createAuthProvider({ envPath }), catalog: createCatalogProvider({ envPath }) };
  const { gw, store } = await createTestGateway({ home, fake });
  const record = store.putConnection({
    id: 'conn-google-drive', ...key, privilege: 'write', provider: 'catalog',
    provider_account_id: account, scopes: [], status: 'ACTIVE',
    created: new Date().toISOString(), updated: new Date().toISOString(),
  });
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    const path = new URL(String(url)).pathname;
    calls.push(path);
    if (path.endsWith('/tools/execute/GOOGLEDRIVE_FIND_FILE')) {
      return { status: executeStatus, text: async () => JSON.stringify(executeBody) };
    }
    if (path.endsWith(`/connected_accounts/${account}`)) {
      return { status: 200, text: async () => JSON.stringify({ id: account, status: accountStatus }) };
    }
    throw new Error(`unexpected request ${path}`);
  });
  return { gw, store, record, calls };
}

for (const [label, executeStatus, executeBody] of [['first call, 200 with a 401 inside', 200, firstCall], ['later call, 410', 410, laterCall]]) {
  test(`${label}, then EXPIRED, answers needs_connect with refused_by_provider`, async (t) => {
    const { gw, store, calls } = await gateway(t, { executeStatus, executeBody, accountStatus: 'EXPIRED' });
    const result = await gw.execute({ action, input: { page_size: 1 } });
    assert.deepEqual(result, {
      status: 'needs_connect', ...key, privilege: 'write', provider_status: 'EXPIRED', reason: 'refused_by_provider',
    });
    assert.equal(store.getConnection(key).status, 'EXPIRED');
    assert.equal(calls.filter((p) => p.endsWith(`/connected_accounts/${account}`)).length, 1);
  });

  test(`${label}, then ACTIVE, stays vendor_error and leaves the row`, async (t) => {
    const { gw, store, record } = await gateway(t, { executeStatus, executeBody, accountStatus: 'ACTIVE' });
    const result = await gw.execute({ action, input: { page_size: 1 } });
    assert.equal(result.status, 'vendor_error');
    assert.equal(result.http_status, executeStatus === 200 ? 401 : 410);
    assert.equal(JSON.stringify(result).includes('fixture'), false);
    assert.deepEqual(store.getConnection(key), record);
  });
}
