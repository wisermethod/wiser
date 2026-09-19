import { test } from 'node:test';
import assert from 'node:assert/strict';

import { providerExecuteFailed } from './catalog-provider.js';

test('GitHub-shaped catalog body is not a failure', () => {
  const r = providerExecuteFailed({
    successful: true,
    data: { full_name: 'wisermethod/wiser', id: 1 },
  });
  assert.equal(r.failed, false);
});

test('Composio successful:false stays a failure', () => {
  const r = providerExecuteFailed({ successful: false, error: 'nope' });
  assert.equal(r.failed, true);
  assert.equal(r.httpStatus, 400);
});

test('inner status 400 stays a failure', () => {
  const r = providerExecuteFailed({ status: 400, data: {} });
  assert.equal(r.failed, true);
  assert.equal(r.httpStatus, 400);
});

test('Cloudflare nested success:false stays a failure', () => {
  const r = providerExecuteFailed({
    successful: true,
    data: {
      success: false,
      errors: [{ code: 9106, message: 'Authentication failed (status: 400)' }],
      result: null,
    },
  });
  assert.equal(r.failed, true);
  assert.equal(r.httpStatus, 400);
});

test('top-level Cloudflare success:false stays a failure', () => {
  const r = providerExecuteFailed({
    success: false,
    errors: [{ code: 9106, message: 'Authentication failed (status: 400)' }],
    result: null,
  });
  assert.equal(r.failed, true);
});

test('proxy malformed 200 is vendor_error with no data field', async (t) => {
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { createAuthProvider } = await import('./auth-provider.js');
  const dir = mkdtempSync(join(tmpdir(), 'wiser-proxy-malformed-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const envPath = join(dir, 'project-key.txt');
  writeFileSync(envPath, 'WISER_AUTH_PROVIDER_KEY=synthetic-test-key\n');
  t.mock.method(globalThis, 'fetch', async () => ({
    status: 200,
    text: async () => 'not-json{',
  }));
  const provider = createAuthProvider({ envPath });
  const result = await provider.proxy({
    providerAccountId: 'example',
    endpoint: '/v3/example',
    method: 'POST',
  });
  assert.equal(result.error.code, 'vendor_error');
  assert.equal(result.status, 502);
  assert.equal(Object.hasOwn(result, 'data'), false);
});

test('proxy binary_data URL is fetched as text', async () => {
  const { resolveProxyPayload } = await import('./auth-provider.js');
  const r = await resolveProxyPayload(
    {
      data: {},
      binary_data: { url: 'https://example.com/zone.txt', content_type: 'text/plain', size: 4 },
      status: 200,
    },
    async () => ({ ok: true, status: 200, text: async () => ';; BIND' }),
  );
  assert.equal(r, ';; BIND');
});

test('OAuth auth-config create uses managed auth; API key uses empty credentials', async () => {
  const { createAuthConfigBody } = await import('./auth-provider.js');
  const oauth = createAuthConfigBody('GITHUB', 'OAUTH2');
  assert.equal(oauth.toolkit.slug, 'GITHUB');
  assert.equal(oauth.auth_config.type, 'use_composio_managed_auth');
  const key = createAuthConfigBody('REPLICATE', 'API_KEY');
  assert.equal(key.toolkit.slug, 'REPLICATE');
  assert.equal(key.auth_config.type, 'use_custom_auth');
  assert.equal(key.auth_config.authScheme, 'API_KEY');
  assert.deepEqual(key.auth_config.credentials, {});
});
