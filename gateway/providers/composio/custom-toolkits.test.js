import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CUSTOM_TOOLKITS, registeredSlug, findCustomToolkit, installToolkitRow } from './custom-toolkits.js';
import { createAuthProvider, createCustomToolkitBody } from './auth-provider.js';
import { toolkitFor, toSlug } from './mapping.js';

function fixture(t, responses) {
  const dir = mkdtempSync(join(tmpdir(), 'custom-toolkit-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const envPath = join(dir, 'project-key.txt');
  writeFileSync(envPath, 'WISER_AUTH_PROVIDER_KEY=synthetic-test-key\n');
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, method: options.method, body: options.body ? JSON.parse(options.body) : undefined, wire: options.body });
    assert.ok(responses.length, 'unexpected request');
    const [status, data, raw] = responses.shift();
    return { status, text: async () => raw ?? JSON.stringify(data) };
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

test('Tiny Fish body uses an unprefixed slug and key-only X-API-Key header', () => {
  const row = CUSTOM_TOOLKITS[1];
  assert.equal(row.service, 'tinyfish');
  const body = createCustomToolkitBody(row);
  assert.deepEqual(body, {
    slug: 'TINYFISH',
    toolkit_config: {
      name: 'TinyFish',
      app_url: 'https://tinyfish.ai',
      auth_schemes: [{ mode: 'API_KEY', headers: { 'X-API-Key': '{{generic_api_key}}' } }],
    },
  });
  assert.equal(registeredSlug(row), 'CUSTOM_TINYFISH');
  for (const name of ['tinyfish', 'TINYFISH', 'CUSTOM_TINYFISH']) assert.equal(findCustomToolkit(name), row);
  assert.equal(toolkitFor('tinyfish', 'web'), registeredSlug(row));
  for (const action of ['search', 'fetch']) assert.equal(toSlug(`tinyfish.web.${action}`), null);
  body.toolkit_config.auth_schemes[0].headers['X-API-Key'] = 'changed';
  assert.equal(createCustomToolkitBody(row).toolkit_config.auth_schemes[0].headers['X-API-Key'], '{{generic_api_key}}');
});

test('google-apis upsert body uses the unprefixed slug and the X-Goog-Api-Key template', () => {
  const row = findCustomToolkit('google-apis');
  assert.ok(row);
  assert.equal(CUSTOM_TOOLKITS[2], row);
  const body = createCustomToolkitBody(row);
  assert.deepEqual(body, {
    slug: 'GOOGLE_APIS',
    toolkit_config: {
      name: 'Google APIs',
      app_url: 'https://pagespeedonline.googleapis.com',
      auth_schemes: [{ mode: 'API_KEY', headers: { 'X-Goog-Api-Key': '{{generic_api_key}}' } }],
    },
  });
  // The API prefixes CUSTOM_. Sending the prefixed slug on upsert registers the wrong toolkit.
  assert.notEqual(body.slug, 'CUSTOM_GOOGLE_APIS');
  assert.equal(registeredSlug(row), 'CUSTOM_GOOGLE_APIS');
  for (const name of ['google-apis', 'GOOGLE_APIS', 'CUSTOM_GOOGLE_APIS']) {
    assert.equal(findCustomToolkit(name), row);
  }
  assert.equal(toolkitFor('google-apis', 'insights'), registeredSlug(row));
  assert.equal(toolkitFor('google-apis', 'translate'), registeredSlug(row));
  assert.equal(toSlug('google-apis.insights.run'), null);
  assert.equal(toSlug('google-apis.translate.text'), null);
  body.toolkit_config.auth_schemes[0].headers['X-Goog-Api-Key'] = 'changed';
  assert.equal(
    createCustomToolkitBody(row).toolkit_config.auth_schemes[0].headers['X-Goog-Api-Key'],
    '{{generic_api_key}}',
  );
});

const installOrigin = 'https://crm.example.test';
const installToolkit = installToolkitRow(installOrigin);
const installConnect = { userId: 'example', toolkit: installToolkit.slug, scheme: 'API_KEY', installToolkit };
const lookup = '/api/v3.1/toolkits/CUSTOM_WISERCRM_0CA5EFCA53F1D1B0';
// S2b's two-field body, with the G4 slug, origin and display name.
const installBody = '{"slug":"WISERCRM_0CA5EFCA53F1D1B0","toolkit_config":{"name":"Wiser CRM","app_url":"https://crm.example.test","auth_schemes":[{"mode":"API_KEY","headers":{"CF-Access-Client-Id":"{{generic_id}}","CF-Access-Client-Secret":"{{generic_api_key}}"},"api_key_field":{"display_name":"Client Secret","description":"The service token\'s Client Secret"},"additional_fields":{"generic_id":{"display_name":"Client ID","description":"The service token\'s Client ID, ending in .access"}}}]}}';

test('per-install initiation reads by registered slug before upserting the exact S2b two-field body', async (t) => {
  const { provider, calls } = fixture(t, [[404, {}], [200, {}], [200, { items: [] }], [200, { id: 'example-config' }], [200, link]]);
  assert.equal(JSON.stringify(createCustomToolkitBody(installToolkit)), installBody);
  assert.equal((await provider.initiate(installConnect)).kind, 'link');
  assert.deepEqual(calls.map((call) => [call.method, new URL(call.url).pathname]), [
    ['GET', lookup], ['POST', '/api/v3.1/custom/toolkits/upsert'],
    ['GET', '/api/v3.1/auth_configs'], ['POST', '/api/v3.1/auth_configs'],
    ['POST', '/api/v3.1/connected_accounts/link'],
  ]);
  assert.equal(calls[1].wire, installBody);
  assert.equal(new URL(calls[2].url).searchParams.get('toolkit_slug'), registeredSlug(installToolkit));
  assert.equal(calls[3].body.toolkit.slug, registeredSlug(installToolkit));
});

test('per-install initiation links a matching toolkit without upserting it', async (t) => {
  const { provider, calls } = fixture(t, [
    [200, { meta: { app_url: installOrigin } }], [200, { items: [{ id: 'example-config' }] }], [200, link],
  ]);
  assert.equal((await provider.initiate(installConnect)).kind, 'link');
  assert.deepEqual(calls.map((call) => [call.method, new URL(call.url).pathname]), [
    ['GET', lookup], ['GET', '/api/v3.1/auth_configs'], ['POST', '/api/v3.1/connected_accounts/link'],
  ]);
});

test('per-install initiation refuses a mismatched app_url before upsert', async (t) => {
  const { provider, calls } = fixture(t, [[200, { meta: { app_url: 'https://other.example.test' } }]]);
  assert.deepEqual(await provider.initiate(installConnect), { error: { code: 'install_address_changed' } });
  assert.deepEqual(calls.map((call) => [call.method, new URL(call.url).pathname]), [['GET', lookup]]);
});

test('per-install initiation refuses an unreadable toolkit response before upsert', async (t) => {
  const { provider, calls } = fixture(t, [[200, { meta: {} }]]);
  assert.equal((await provider.initiate(installConnect)).error.code, 'vendor_error');
  assert.equal(calls.length, 1);
});

for (const [name, response] of [
  ['status 500', [500, { meta: { app_url: installOrigin } }]],
  ['status 401', [401, {}]],
  ['status 0', [0, {}]],
  ['a malformed body', [200, null, '{"meta":']],
  ['an empty app_url', [200, { meta: { app_url: '' } }]],
  ['a non-string app_url', [200, { meta: { app_url: 443 } }]],
  ['only the SDK spelling appUrl', [200, { meta: { appUrl: installOrigin } }]],
]) {
  test(`per-install toolkit read with ${name} stops after one request, without upserting`, async (t) => {
    const { provider, calls } = fixture(t, [response]);
    assert.equal((await provider.initiate(installConnect)).error.code, 'vendor_error');
    assert.deepEqual(calls.map((call) => [call.method, new URL(call.url).pathname]), [['GET', lookup]]);
  });
}

test('per-install upsert maps a frozen-config 409 without deleting the toolkit', async (t) => {
  const { provider, calls } = fixture(t, [[404, {}], [409, { message: 'synthetic-private-response' }]]);
  const result = await provider.initiate(installConnect);
  assert.equal(result.error.code, 'vendor_error');
  assert.equal(result.status, 409);
  assert.deepEqual(calls.map((call) => [call.method, new URL(call.url).pathname]),
    [['GET', lookup], ['POST', '/api/v3.1/custom/toolkits/upsert']]);
});

test('per-install initiation refuses a link without a provider account id', async (t) => {
  const { provider } = fixture(t, [
    [200, { meta: { app_url: installOrigin } }], [200, { items: [{ id: 'example-config' }] }],
    [200, { redirect_url: link.redirect_url }],
  ]);
  const result = await provider.initiate(installConnect);
  assert.equal(result.error.code, 'vendor_error');
  assert.equal(result.error.endpoint, '/connected_accounts/link');
});
