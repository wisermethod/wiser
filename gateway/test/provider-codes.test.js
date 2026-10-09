import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAuthProvider, providerCodes } from '../providers/composio/auth-provider.js';
import { buildContext } from '../src/context.js';
import { vendorErrorFrom } from '../src/errors.js';

/**
 * A vendor_error may carry the vendor's numeric error codes and nothing else from
 * its body. Cloudflare answers "Access is not enabled" and "permission missing"
 * with the same 403 and tells them apart only by code (9999 against 10000).
 */

test('providerCodes keeps safe integer codes only, at most ten, and nothing else', () => {
  assert.deepEqual(providerCodes({ errors: [{ code: 9999, message: 'access.api.error.not_enabled: secret-ish text' }] }), [9999]);
  assert.deepEqual(providerCodes({ errors: [{ code: '9999' }, { code: 1.5 }, { code: null }, {}, 'x', { code: 10000 }] }), [10000]);
  assert.deepEqual(providerCodes({ errors: Array.from({ length: 15 }, (_, i) => ({ code: i })) }), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(providerCodes(null), []);
  assert.deepEqual(providerCodes({ errors: 'nope' }), []);
  assert.deepEqual(providerCodes({ errors: [{ code: Number.MAX_SAFE_INTEGER + 2 }] }), []);
});

test('vendorErrorFrom passes provider_codes filtered again, and omits them when there are none', () => {
  assert.deepEqual(
    vendorErrorFrom({ status: 403, error: { code: 'vendor_error', endpoint: '/e', method: 'GET', provider_codes: [9999, 'x', 2.5, 10000] } }),
    { status: 'vendor_error', http_status: 403, endpoint: '/e', method: 'GET', provider_codes: [9999, 10000] },
  );
  assert.deepEqual(
    vendorErrorFrom({ status: 403, error: { code: 'vendor_error', endpoint: '/e', method: 'GET' } }),
    { status: 'vendor_error', http_status: 403, endpoint: '/e', method: 'GET' },
  );
  const many = vendorErrorFrom({ status: 403, error: { provider_codes: Array.from({ length: 30 }, (_, i) => i) } });
  assert.equal(many.provider_codes.length, 10);
  assert.equal(Object.hasOwn(vendorErrorFrom({ status: 403, error: { provider_codes: [] } }), 'provider_codes'), false);
  assert.equal(Object.hasOwn(vendorErrorFrom({ status: 403, error: { provider_codes: 'abc' } }), 'provider_codes'), false);
});

function adapterWith(t, answer) {
  const dir = mkdtempSync(join(tmpdir(), 'wiser-provider-codes-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const envPath = join(dir, 'project-key.txt');
  writeFileSync(envPath, 'WISER_AUTH_PROVIDER_KEY=synthetic-test-key\n');
  t.mock.method(globalThis, 'fetch', async () => ({ status: 200, text: async () => JSON.stringify(answer) }));
  return createAuthProvider({ envPath });
}

test('the proxy adapter carries a refused answer\'s codes and no message or other field', async (t) => {
  const provider = adapterWith(t, {
    status: 403,
    data: { success: false, errors: [{ code: 9999, message: 'access.api.error.not_enabled: Access is not enabled.' }], result: null, messages: ['m'] },
  });
  const res = await provider.proxy({ providerAccountId: 'ca_x', endpoint: '/accounts/a/access/apps', method: 'GET' });
  assert.deepEqual(res, {
    status: 403,
    error: { code: 'vendor_error', endpoint: '/accounts/a/access/apps', method: 'GET', provider_codes: [9999] },
  });
  assert.equal(JSON.stringify(res).includes('not_enabled'), false);
});

test('a refused answer with no codes keeps the old shape exactly', async (t) => {
  const provider = adapterWith(t, { status: 403, data: { success: false, errors: [], result: null } });
  const res = await provider.proxy({ providerAccountId: 'ca_x', endpoint: '/e', method: 'GET' });
  assert.deepEqual(res, { status: 403, error: { code: 'vendor_error', endpoint: '/e', method: 'GET' } });
});

test('ctx.proxy throws a signal that carries the codes to the module', async (t) => {
  const provider = adapterWith(t, { status: 403, data: { success: false, errors: [{ code: 9999, message: 'm' }] } });
  const ctx = buildContext({
    service: 'cloudflare', module: 'zones', action: 'list_access_apps', input: {}, confirm: false,
    record: { provider_account_id: 'ca_x' }, auth: { provider: 'catalog', toolkit: 'T' }, authProvider: provider,
  });
  await assert.rejects(ctx.proxy({ endpoint: '/e', method: 'GET' }), (err) => {
    assert.deepEqual(err.object, { status: 'vendor_error', http_status: 403, endpoint: '/e', method: 'GET', provider_codes: [9999] });
    return true;
  });
});

test('projectProviderCodes filters a vendor_error a module built itself, and leaves other results alone', async () => {
  const { projectProviderCodes } = await import('../src/errors.js');
  assert.deepEqual(
    projectProviderCodes({ status: 'vendor_error', http_status: 403, provider_codes: ['secret text', 9999, { a: 1 }, ...Array.from({ length: 20 }, (_, i) => i)], reason: 'own' }),
    { status: 'vendor_error', http_status: 403, provider_codes: [9999, 0, 1, 2, 3, 4, 5, 6, 7, 8], reason: 'own' },
  );
  assert.deepEqual(projectProviderCodes({ status: 'vendor_error', provider_codes: ['only text'] }), { status: 'vendor_error' });
  const ok = { success: true, provider_codes: ['not a vendor error'] };
  assert.equal(projectProviderCodes(ok), ok);
});

test('execute filters provider_codes on a vendor_error the module returned itself', async () => {
  const { createTestGateway, putActive } = await import('./fake-provider.js');
  const env = await createTestGateway();
  await putActive(env.store, env.fake, { service: 'cloudflare', module: 'zones' });
  const { modules } = await import('../../connectors/cloudflare/index.js');
  const original = modules.zones.get;
  modules.zones.get = async () => ({ status: 'vendor_error', http_status: 500, provider_codes: ['leak', 7] });
  try {
    const out = await env.gw.execute({ action: 'cloudflare.zones.get', input: { zone_id: '0123456789abcdef0123456789abcdef' } });
    assert.deepEqual(out.provider_codes, [7]);
  } finally {
    modules.zones.get = original;
  }
});
