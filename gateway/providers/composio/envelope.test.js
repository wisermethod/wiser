import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createCatalogProvider, providerExecuteFailed } from './catalog-provider.js';

// HTTP 200 failures measured 2026-10-19; text and ids are synthetic.
const refusedToolEnvelopes = [401, 404].map((status) => ({
  data: { http_error: `${status} Client Error: fixture`, message: 'fixture message', status_code: status },
  successful: false,
  error: 'fixture error',
  log_id: 'log_fixture',
}));

for (const envelope of refusedToolEnvelopes) {
  const status = envelope.data.status_code;
  test(`HTTP 200 tool refusal preserves upstream ${status} and drops the body`, async (t) => {
    assert.deepEqual(providerExecuteFailed(envelope), { failed: true, httpStatus: status });
    const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'wiser-tool-refusal-'));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const envPath = join(dir, 'project-key.txt');
    writeFileSync(envPath, 'WISER_AUTH_PROVIDER_KEY=synthetic-test-key\n');
    t.mock.method(globalThis, 'fetch', async () => ({ status: 200, text: async () => JSON.stringify(envelope) }));
    const provider = createCatalogProvider({ envPath });
    assert.deepEqual(await provider.execute({ actionId: 'github.repos.get', arguments: {} }), {
      status,
      error: { code: 'vendor_error', endpoint: '/tools/execute/GITHUB_GET_A_REPOSITORY', method: 'POST' },
    });
  });
}

const refusalCodeCases = [
  [400, 400], [401, 401], [599, 599],
  [399, 400], [600, 400], ['401', 400], [401.5, 400],
  [null, 400], [undefined, 400], [NaN, 400], [Infinity, 400],
];

test('failed envelope reads only an integer data.status_code from 400 through 599', () => {
  for (const [code, expected] of refusalCodeCases) {
    for (const failure of [{ successful: false }, { success: false }, { error: 'fixture' }]) {
      assert.deepEqual(providerExecuteFailed({ ...failure, data: { status_code: code } }),
        { failed: true, httpStatus: expected }, `data.status_code: ${String(code)}`);
    }
  }
});

// A status field keeps the reading it had before status_code was read: any value Number()
// makes 400 or more, a numeric string included. Only status_code is held to an integer from
// 400 through 599.
test('a top-level status of 400 or more still wins over data.status_code', () => {
  for (const [status, expected] of [[400, 400], [403, 403], [599, 599], [600, 600], [400.5, 400.5], ['403', 403]]) {
    assert.deepEqual(providerExecuteFailed({ status, successful: false, data: { status_code: 401 } }),
      { failed: true, httpStatus: expected });
  }
  for (const status of [200, null, undefined]) {
    assert.deepEqual(providerExecuteFailed({ status, successful: false, data: { status_code: 401 } }),
      { failed: true, httpStatus: 401 });
  }
});

for (const field of ['data', 'response']) {
  for (const failure of ['success', 'successful']) {
    test(`nested ${field}.${failure}:false reads its own status, then status_code`, () => {
      for (const [code, expected] of refusalCodeCases) {
        assert.deepEqual(providerExecuteFailed({ successful: true, [field]: { [failure]: false, status_code: code } }),
          { failed: true, httpStatus: expected }, `status_code: ${String(code)}`);
      }
      for (const [status, expected] of [[403, 403], ['403', 403], [600, 600], [400.5, 400.5]]) {
        assert.deepEqual(providerExecuteFailed({ [field]: { [failure]: false, status, status_code: 422 } }),
          { failed: true, httpStatus: expected }, `status: ${String(status)}`);
      }
      for (const status of [200, 399, null, undefined]) {
        assert.deepEqual(providerExecuteFailed({ [field]: { [failure]: false, status, status_code: 422 } }),
          { failed: true, httpStatus: 422 }, `status: ${String(status)}`);
      }
    });
  }
}

test('status_code alone never makes a successful body a failure', () => {
  for (const code of [401, 404, 410, 422, 599]) {
    for (const body of [
      { successful: true, status_code: code },
      { successful: true, data: { status_code: code } },
      { success: true, response: { status_code: code } },
    ]) assert.deepEqual(providerExecuteFailed(body), { failed: false, httpStatus: null });
  }
});

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
