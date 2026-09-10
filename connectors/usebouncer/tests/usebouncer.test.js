import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestGateway, putActive } from '../../../gateway/test/fake-provider.js';

const localFileProvider = {
  isConfigured: () => true,
  status: async () => 'ACTIVE',
  unwrap: async () => ({ supported: true, header: 'x-api-key', value: 'test-key' }),
};

test('no local grant stops and billed verification needs confirmation before HTTP', async () => {
  const previous = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error('Unexpected HTTP'); };
  try {
    const { gw, store, fake } = await createTestGateway({ localFileProvider });
    const call = { action: 'usebouncer.verify.single', input: { email: 'example@example.com' } };
    assert.equal((await gw.execute(call)).status, 'needs_connect');
    await putActive(store, fake, { service: 'usebouncer', module: 'verify', provider: 'local-file' });
    assert.equal((await gw.execute(call)).status, 'needs_confirmation');
    assert.equal((await gw.execute({ action: 'usebouncer.verify.bulk', input: { emails: [{ email: 'example@example.com' }] } })).status, 'needs_confirmation');
    assert.equal(calls, 0);
  } finally { globalThis.fetch = previous; }
});

test('credits, single, bulk, status and download use safe HTTP and preserve vendor fields', async () => {
  const previous = globalThis.fetch;
  const seen = [];
  const vendor = { status: 'deliverable', reason: 'accepted_email', domain: { acceptAll: 'no', disposable: 'no' }, account: { role: 'no' }, retryAfter: '2026-09-08T12:00:00Z' };
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(url);
    assert.equal(parsed.protocol, 'https:');
    assert.equal(parsed.hostname, 'api.usebouncer.com');
    assert.equal(Object.hasOwn(options.headers, 'x-api-key'), true);
    assert.equal(options.redirect, 'manual');
    seen.push({ parsed, options });
    let result = vendor;
    if (parsed.pathname.endsWith('/credits')) result = { credits: 10 };
    else if (options.method === 'POST') {
      assert.deepEqual(JSON.parse(options.body), [{ email: 'example@example.com' }]);
      result = { batchId: 'batch-example', status: 'queued' };
    } else if (parsed.pathname.endsWith('/batch/batch-example')) result = { status: 'completed' };
    else if (parsed.pathname.endsWith('/download')) result = [vendor];
    return { ok: true, status: 200, text: async () => JSON.stringify(result) };
  };
  try {
    const { gw, store, fake } = await createTestGateway({ localFileProvider });
    await putActive(store, fake, { service: 'usebouncer', module: 'verify', provider: 'local-file' });
    assert.equal((await gw.execute({ action: 'usebouncer.verify.credits', input: {} })).credits, 10);
    assert.deepEqual(await gw.execute({ action: 'usebouncer.verify.single', input: { email: 'example+tag@example.com' }, confirm: true }), vendor);
    assert.equal(seen[1].parsed.searchParams.get('email'), 'example+tag@example.com');
    const bulk = await gw.execute({ action: 'usebouncer.verify.bulk', input: { emails: [{ email: 'example@example.com' }] }, confirm: true });
    assert.equal(bulk.batchId, 'batch-example');
    assert.equal((await gw.execute({ action: 'usebouncer.verify.status', input: { id: bulk.batchId } })).status, 'completed');
    assert.deepEqual(await gw.execute({ action: 'usebouncer.verify.download', input: { id: bulk.batchId } }), [vendor]);
    assert.equal(seen[4].parsed.searchParams.get('download'), 'all');
    assert.equal(seen.length, 5);
  } finally { globalThis.fetch = previous; }
});
