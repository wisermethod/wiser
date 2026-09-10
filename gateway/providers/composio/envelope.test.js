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
