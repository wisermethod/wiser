import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAuthProvider } from './auth-provider.js';

const CAP = 4100000;
const OVER = { status: 'vendor_error', reason: 'proxy_body_too_large' };
const UNSUPPORTED = { status: 'needs_provider_capability' };

function provider(t) {
  const home = mkdtempSync(join(tmpdir(), 'wiser-budget-wire-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const envPath = join(home, 'invented-project.txt');
  writeFileSync(envPath, 'WISER_AUTH_PROVIDER_KEY=invented-offline-key\n');
  return createAuthProvider({ envPath });
}

function transport(t) {
  const sent = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(new URL(url).pathname, '/api/v3.1/tools/execute/proxy');
    assert.equal(options.method, 'POST');
    assert.equal(typeof options.body, 'string');
    sent.push(options.body);
    return { status: 200, text: async () => '{"status":200,"data":{"accepted":true}}' };
  });
  return sent;
}

// Independent expected outer request: deliberately does not import the preparer.
function expectedWire(req) {
  return JSON.stringify({
    connected_account_id: req.providerAccountId, endpoint: req.endpoint, method: req.method || 'GET',
    ...(req.body === undefined ? {} : { body: req.body }),
    ...(req.binary_body === undefined ? {} : { binary_body: req.binary_body }),
    ...(req.parameters?.length ? { parameters: req.parameters } : {}),
  });
}
const bytes = (text) => Buffer.byteLength(text, 'utf8');

for (const [name, account, binary] of [
  ['short account JSON', 'a', false],
  ['UUID account JSON', '00000000-0000-0000-0000-000000000000', false],
  ['long escaped account multipart', 'ca_' + '𐐀"\\'.repeat(256), true],
]) test(`${name}: exact UTF-8 measurement; 4100000 sends once, 4100001 sends nothing`, async (t) => {
  const adapter = provider(t);
  const sent = transport(t);
  const req = {
    providerAccountId: account,
    endpoint: '/invented/音声?local=\\"',
    parameters: [
      { name: 'X-Invented', value: 'é\n"\\\u0000𐐀', type: 'header' },
      { name: 'q', value: '雪𐐀\t', type: 'query' },
    ],
    // Auth/toolkit/response headers are not part of the JSON body.
    toolkit: 'INVENTED', response_headers: ['range'],
  };
  if (binary) {
    req.method = 'POST';
    const boundary = 'InventedBoundary';
    const multipart = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="音声.wav"\r\nContent-Type: audio/wav\r\n\r\ninvented\r\n--${boundary}--\r\n`);
    req.binary_body = { content_type: `multipart/form-data; boundary=${boundary}`, base64: multipart.toString('base64') };
  } else req.body = { text: 'é𐐀雪"\\\n\u0000\ud800' };
  // ASCII query padding makes the independent outer JSON exactly the desired
  // byte length while retaining real base64 and Unicode/escaping in every case.
  const pad = { name: 'padding', value: '', type: 'query' };
  req.parameters.push(pad);
  pad.value = 'x'.repeat(CAP - bytes(expectedWire(req)));
  assert.equal(bytes(expectedWire(req)), CAP);
  assert.equal(await adapter.measureProxyBody(req), CAP);
  assert.equal(sent.length, 0, 'measurement must never send');
  await adapter.proxy(req, { proxyBodyMaxBytes: CAP });
  assert.equal(sent.length, 1);
  assert.equal(bytes(sent[0]), CAP, 'independently intercepted transport bytes');
  assert.equal(sent[0], expectedWire(req));
  assert.equal(JSON.parse(sent[0]).method, req.method || 'GET');
  // A stale successful measurement is no authority for the later mutation.
  pad.value += 'x';
  assert.equal(bytes(expectedWire(req)), CAP + 1);
  assert.equal(await adapter.measureProxyBody(req), CAP + 1);
  await assert.rejects(adapter.proxy(req, { proxyBodyMaxBytes: CAP }), (err) => {
    assert.deepEqual(err.object, OVER); return true;
  });
  assert.equal(sent.length, 1, 'over cap must never reach fetch');
  t.diagnostic('intercepted 4100000 UTF-8 bytes once; 4100001 refused with zero additional sends');
});

test('send-time check survives mutation after measuring', async (t) => {
  const adapter = provider(t); const sent = transport(t);
  const req = { providerAccountId: 'invented', endpoint: '/read', body: { text: 'small' } };
  const before = await adapter.measureProxyBody(req);
  req.body.text += '𐐀';
  await assert.rejects(adapter.proxy(req, { proxyBodyMaxBytes: before }), (err) => {
    assert.deepEqual(err.object, OVER); return true;
  });
  assert.equal(sent.length, 0);
});

test('send serializes only once and sends the exact checked string', async (t) => {
  const adapter = provider(t); const sent = transport(t);
  let preparations = 0;
  const req = { providerAccountId: 'invented', endpoint: '/single', body: {
    toJSON() { preparations++; return preparations === 1 ? 'small' : 'x'.repeat(CAP + 1); },
  } };
  const exact = expectedWire({ ...req, body: 'small' });
  await adapter.proxy(req, { proxyBodyMaxBytes: bytes(exact) });
  assert.equal(preparations, 1, 'a second serialization can change the checked body');
  assert.deepEqual(sent, [exact]);
});

test('measurement and send sanitize unmeasurable requests without transport', async (t) => {
  const adapter = provider(t); const sent = transport(t);
  const cycle = {}; cycle.self = cycle;
  for (const body of [cycle, { count: 1n }, { toJSON() { throw new Error('invented-private-canary'); } }]) {
    const req = { providerAccountId: 'invented', endpoint: '/private', body };
    for (const invoke of [() => adapter.measureProxyBody(req), () => adapter.proxy(req, { proxyBodyMaxBytes: CAP })]) {
      await assert.rejects(async () => invoke(), (err) => {
        assert.deepEqual(err.object, UNSUPPORTED);
        assert.equal(String(err).includes('canary'), false);
        return true;
      });
    }
  }
  // Without an action budget, retain the pre-existing sanitized refusal.
  assert.deepEqual(await adapter.proxy({ providerAccountId: 'invented', endpoint: '/existing', body: cycle }), {
    status: 0, error: { code: 'vendor_error', endpoint: '/existing', method: 'POST' },
  });
  assert.equal(sent.length, 0);
});

test('invalid private bounds stop; no bound preserves larger existing requests', async (t) => {
  const adapter = provider(t); const sent = transport(t);
  const req = { providerAccountId: 'invented', endpoint: '/existing', body: 'x'.repeat(CAP + 1) };
  for (const proxyBodyMaxBytes of [0, -1, 1.5, NaN, Infinity, '4100000', Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(adapter.proxy(req, { proxyBodyMaxBytes }), (err) => {
      assert.deepEqual(err.object, UNSUPPORTED); return true;
    });
  }
  assert.equal(sent.length, 0);
  await adapter.proxy(req);
  assert.equal(sent.length, 1);
  assert.ok(bytes(sent[0]) > CAP);
});
