import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CUSTOM_TOOLKITS, registeredSlug, findCustomToolkit } from './custom-toolkits.js';
import { createAuthProvider, createCustomToolkitBody } from './auth-provider.js';
import { toolkitFor, toSlug } from './mapping.js';

function fixture(t, responses) {
  const dir = mkdtempSync(join(tmpdir(), 'custom-toolkit-test-'));
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

const connect = { userId: 'example', toolkit: 'CUSTOM_COURTLISTENER', scheme: 'API_KEY' };
const link = { redirect_url: 'https://example.com/connect', connected_account_id: 'example' };

test('custom toolkit body uses the unprefixed slug and exact Token header template', () => {
  const body = createCustomToolkitBody(CUSTOM_TOOLKITS[0]);
  assert.deepEqual(body, {
    slug: 'COURTLISTENER',
    toolkit_config: {
      name: 'CourtListener',
      app_url: 'https://www.courtlistener.com',
      auth_schemes: [{ mode: 'API_KEY', headers: { Authorization: 'Token {{generic_api_key}}' } }],
    },
  });
  assert.notEqual(body.slug, 'CUSTOM_COURTLISTENER');
  body.toolkit_config.auth_schemes[0].headers.Authorization = 'changed';
  assert.equal(
    createCustomToolkitBody(CUSTOM_TOOLKITS[0]).toolkit_config.auth_schemes[0].headers.Authorization,
    'Token {{generic_api_key}}',
  );
});

test('registered toolkit resolves service and both slug forms without catalog actions', () => {
  assert.equal(registeredSlug(), 'CUSTOM_COURTLISTENER');
  for (const name of ['courtlistener', 'COURTLISTENER', 'CUSTOM_COURTLISTENER']) {
    assert.equal(findCustomToolkit(name), CUSTOM_TOOLKITS[0]);
  }
  assert.equal(findCustomToolkit('example'), null);
  assert.equal(toolkitFor('courtlistener', 'caselaw'), registeredSlug());
  assert.equal(toSlug('courtlistener.caselaw.search'), null);
});

test('initiate upserts before creating an empty API-key auth config and hosted link', async (t) => {
  const { provider, calls } = fixture(t, [[200, {}], [200, { items: [] }], [200, { id: 'example' }], [200, link]]);
  assert.deepEqual(await provider.initiate({ ...connect, toolkit: 'COURTLISTENER' }), {
    kind: 'link', url: link.redirect_url, providerAccountId: 'example',
  });
  assert.deepEqual(calls.map((c) => [new URL(c.url).pathname, c.method]), [
    ['/api/v3.1/custom/toolkits/upsert', 'POST'], ['/api/v3.1/auth_configs', 'GET'],
    ['/api/v3.1/auth_configs', 'POST'], ['/api/v3.1/connected_accounts/link', 'POST'],
  ]);
  assert.deepEqual(calls[0].body, createCustomToolkitBody(CUSTOM_TOOLKITS[0]));
  assert.equal(new URL(calls[1].url).searchParams.get('toolkit_slug'), registeredSlug());
  assert.equal(calls[2].body.toolkit.slug, registeredSlug());
  assert.deepEqual(calls[2].body.auth_config.credentials, {});
  assert.equal(calls[2].body.auth_config.authScheme, 'API_KEY');
});

test('identical re-upserts continue and reuse an existing auth config', async (t) => {
  const responses = () => [[200, {}], [200, { items: [{ id: 'example' }] }], [200, link]];
  const { provider, calls } = fixture(t, [...responses(), ...responses()]);
  for (let i = 0; i < 2; i += 1) assert.equal((await provider.initiate(connect)).kind, 'link');
  assert.deepEqual(calls[0].body, calls[3].body);
  assert.equal(calls.filter((c) => c.method === 'POST' && new URL(c.url).pathname.endsWith('/auth_configs')).length, 0);
});

for (const status of [409, 500]) {
  test(`upsert ${status} stops before auth config or link without deleting or leaking the body`, async (t) => {
    const { provider, calls } = fixture(t, [[status, { message: 'synthetic-private-response' }]]);
    assert.deepEqual(await provider.initiate(connect), {
      status, error: { code: 'vendor_error', endpoint: '/custom/toolkits/upsert', method: 'POST' },
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'POST');
  });
}

test('ordinary catalog connect does not upsert a custom toolkit', async (t) => {
  const { provider, calls } = fixture(t, [[200, { items: [] }], [200, { id: 'example' }], [200, link]]);
  assert.equal((await provider.initiate({ ...connect, toolkit: 'GITHUB', scheme: 'OAUTH2' })).kind, 'link');
  assert.equal(calls.length, 3);
  assert.equal(new URL(calls[0].url).pathname, '/api/v3.1/auth_configs');
  assert.equal(calls[1].body.auth_config.type, 'use_composio_managed_auth');
});
