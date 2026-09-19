import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAuthProvider } from './auth-provider.js';

function fixture(t, responses) {
  const dir = mkdtempSync(join(tmpdir(), 'auth-config-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const envPath = join(dir, 'project-key.txt');
  writeFileSync(envPath, 'WISER_AUTH_PROVIDER_KEY=synthetic-test-key\n');
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, method: options.method, body: options.body ? JSON.parse(options.body) : undefined });
    assert.ok(responses.length, 'unexpected request');
    const [status, data] = responses.shift();
    return { status, text: async () => JSON.stringify(data) };
  });
  return { provider: createAuthProvider({ envPath }), calls };
}

const connect = { userId: 'example', toolkit: 'GITHUB', scheme: 'OAUTH2' };
const link = { redirect_url: 'https://example.com/connect', connected_account_id: 'example' };

function pathnames(calls) {
  return calls.map((c) => [new URL(c.url).pathname, c.method]);
}

test('initiate with one auth config reuses it and returns a link', async (t) => {
  const { provider, calls } = fixture(t, [
    [200, { items: [{ id: 'acfg_one' }] }],
    [200, link],
  ]);
  assert.deepEqual(await provider.initiate(connect), {
    kind: 'link', url: link.redirect_url, providerAccountId: 'example',
  });
  assert.deepEqual(pathnames(calls), [
    ['/api/v3.1/auth_configs', 'GET'],
    ['/api/v3.1/connected_accounts/link', 'POST'],
  ]);
  assert.equal(calls[1].body.auth_config_id, 'acfg_one');
});

test('initiate with no auth config creates one and returns a link', async (t) => {
  const { provider, calls } = fixture(t, [
    [200, { items: [] }],
    [200, { id: 'acfg_created' }],
    [200, link],
  ]);
  assert.deepEqual(await provider.initiate(connect), {
    kind: 'link', url: link.redirect_url, providerAccountId: 'example',
  });
  assert.deepEqual(pathnames(calls), [
    ['/api/v3.1/auth_configs', 'GET'],
    ['/api/v3.1/auth_configs', 'POST'],
    ['/api/v3.1/connected_accounts/link', 'POST'],
  ]);
  assert.equal(calls[1].body.toolkit.slug, 'GITHUB');
  assert.equal(calls[2].body.auth_config_id, 'acfg_created');
});

test('initiate with two auth configs refuses without picking an id or leaking credentials', async (t) => {
  const { provider, calls } = fixture(t, [[200, {
    items: [
      {
        id: 'acfg_managed',
        auth_config_id: 'acfg_managed_alt',
        credentials: { client_secret: 'synthetic-secret-alpha', api_key: 'synthetic-key-alpha' },
      },
      {
        id: 'acfg_custom',
        uuid: 'acfg_custom_uuid',
        credentials: { client_id: 'synthetic-client-beta' },
      },
    ],
  }]]);
  const result = await provider.initiate(connect);
  assert.deepEqual(result, {
    status: null,
    error: { code: 'vendor_error', endpoint: '/auth_configs', method: 'GET' },
    toolkit: 'GITHUB',
    configs: 2,
  });
  const blob = JSON.stringify(result);
  assert.equal(blob.includes('acfg_managed'), false);
  assert.equal(blob.includes('acfg_managed_alt'), false);
  assert.equal(blob.includes('acfg_custom'), false);
  assert.equal(blob.includes('acfg_custom_uuid'), false);
  assert.equal(blob.includes('synthetic-secret-alpha'), false);
  assert.equal(blob.includes('synthetic-key-alpha'), false);
  assert.equal(blob.includes('synthetic-client-beta'), false);
  assert.equal(blob.includes('client_secret'), false);
  assert.equal(blob.includes('api_key'), false);
  assert.equal(blob.includes('credentials'), false);
  assert.deepEqual(pathnames(calls), [['/api/v3.1/auth_configs', 'GET']]);
});
