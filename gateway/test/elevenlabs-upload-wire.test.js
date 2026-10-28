import fs from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAuthProvider } from '../providers/composio/auth-provider.js';
import { confirmCall, createTestGateway, makeHome, putActive } from './fake-provider.js';

// No vendor or gateway call leaves the process. Only proxy() is borrowed from
// the real adapter; grant, store, approval and other provider methods are fake.
// Issued account-id maximum is not specified by this checkout or approved plan.
// Exercise UUID/prefixed shapes and a 1024-character conservative envelope
// budget, rather than claim an invented id proves the provider's maximum.
test('maximum ElevenLabs upload measures the real adapter fetch body below 4100000 bytes', async (t) => {
  const home = fs.realpathSync(makeHome());
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const envPath = join(home, 'synthetic-project-key.txt');
  fs.writeFileSync(envPath, 'WISER_AUTH_PROVIDER_KEY=synthetic-test-key\n');
  const adapter = createAuthProvider({ envPath });
  const f = await createTestGateway({ home });
  await putActive(f.store, f.fake, { service: 'elevenlabs', module: 'voices' });
  f.fake.auth.proxy = (req) => adapter.proxy(req);
  const path = join(home, 'invented-sample.mp3');
  const audio = Buffer.alloc(3000000, 0xb7);
  fs.writeFileSync(path, audio);
  let sent = 0;
  const measured = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    // Intercept fetch itself: this is the adapter's serialized request, not a
    // reconstruction of its serializer or a connector-only binary-body count.
    assert.ok(new URL(url).pathname.endsWith('/tools/execute/proxy'));
    assert.equal(options.method, 'POST');
    assert.equal(typeof options.body, 'string');
    const bytes = Buffer.byteLength(options.body, 'utf8');
    assert.ok(bytes <= 4100000, `wire body ${bytes} exceeds transport budget`);
    const body = JSON.parse(options.body);
    assert.equal(body.endpoint, '/v1/voices/add');
    assert.equal(body.method, 'POST');
    assert.equal(Object.hasOwn(body, 'body'), false);
    assert.equal(Object.hasOwn(body, 'parameters'), false);
    assert.equal(options.body.includes(path), false);
    const multipart = Buffer.from(body.binary_body.base64, 'base64');
    assert.ok(multipart.length - audio.length < 2000);
    assert.ok(body.binary_body.base64.length <= 4002668);
    assert.ok(bytes - body.binary_body.base64.length < 2000);
    const form = await new Response(multipart, { headers: { 'content-type': body.binary_body.content_type } }).formData();
    assert.equal(form.get('name'), currentName);
    assert.equal(form.get('files').name, 'sample.mp3');
    assert.deepEqual(Buffer.from(await form.get('files').arrayBuffer()), audio);
    assert.equal(form.get('remove_background_noise'), 'false');
    measured.push(bytes);
    sent += 1;
    return { status: 200, text: async () => JSON.stringify({ status: 200, data: { voice_id: 'invented-clone', requires_verification: false } }) };
  });
  let currentName;
  for (const [id, name] of [
    ['00000000-0000-0000-0000-000000000000', '\u0000'.repeat(100)],
    ['ca_' + 'x'.repeat(36), '"\\\r\n\t'.repeat(20)],
    ['x'.repeat(1024), '𐐀'.repeat(100)],
  ]) {
    assert.equal(Array.from(name).length, 100);
    const row = await f.store.getConnection({ service: 'elevenlabs', module: 'voices' });
    await f.store.putConnection({ ...row, provider_account_id: id });
    f.fake.auth.setStatus(id, 'ACTIVE');
    currentName = name;
    const got = await confirmCall(f.gw, { action: 'elevenlabs.voices.add', input: { name, path } });
    assert.deepEqual(got, { voice_id: 'invented-clone', requires_verification: false });
  }
  assert.equal(sent, 3);
  // Return only byte counts, never the synthetic credential, account ids or body.
  t.diagnostic(`measured UTF-8 wire bytes: ${measured.join(', ')}`);
  fs.writeFileSync(path, Buffer.alloc(3000001));
  const before = sent;
  const refused = await confirmCall(f.gw, { action: 'elevenlabs.voices.add', input: { name: 'Too large', path } });
  assert.equal(refused.status, 'invalid_arguments');
  assert.match(refused.reason, /3000001/);
  assert.equal(sent, before);
});
