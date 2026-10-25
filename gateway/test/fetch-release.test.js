import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { createTestGateway, putActive } from './fake-provider.js';

const HOSTS = ['releases.example.com', 'cdn.example.com'];
const URL = 'https://releases.example.com/app/1.0.0/manifest.json';

async function fixture(t, { hosts = HOSTS, omit = false, fetch = () => new Response('abc') } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'fetch-release-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const connectorDir = join(root, 'connectors', 'release-proof');
  mkdirSync(connectorDir, { recursive: true });
  writeFileSync(join(connectorDir, 'package.json'), '{"type":"module"}');
  const mod = {
    auth: { provider: 'catalog', toolkit: 'FAKE_KIT', scheme: 'API_KEY', privilege: 'read' },
    actions: {
      inspect: { risk: 'low', confirmation: 'none', execution: { prefer: 'proxy' } },
      download: { risk: 'low', confirmation: 'none', execution: { prefer: 'proxy' },
        input: { type: 'object', additionalProperties: false, properties: { url: {}, maxBytes: {} } } },
    },
    ...(!omit ? { release_hosts: hosts } : {}),
  };
  writeFileSync(join(connectorDir, 'manifest.json'), JSON.stringify({
    id: 'release-proof', service: 'release-proof', modules: { releases: mod },
  }));
  // Only this synthetic connector accepts URLs as input. Production modules pin them.
  writeFileSync(join(connectorDir, 'index.js'), `export const modules = { releases: {
    inspect: async (_, ctx) => ({ present: Object.hasOwn(ctx, 'fetchRelease'), kind: typeof ctx.fetchRelease }),
    download: async (input, ctx) => ctx.fetchRelease(input.url, { maxBytes: input.maxBytes }),
  } };`);
  const requests = [];
  const { gw, store, fake } = await createTestGateway({
    home: join(root, 'home'), session: false, connectorDirs: [join(root, 'connectors')],
    fetchImpl: async (url, options) => { requests.push({ url, options }); return fetch(url, options); },
  });
  await putActive(store, fake, { service: 'release-proof', module: 'releases', privilege: 'read' });
  return { gw, requests, download: (url = URL, ...budget) => gw.execute({
    action: 'release-proof.releases.download', input: { url, maxBytes: budget.length ? budget[0] : 16 },
  }) };
}

function denied(result, reason) {
  assert.equal(result.status, 'denied', JSON.stringify(result));
  assert.match(result.reason, reason);
}

test('fetchRelease is absent without release_hosts', async (t) => {
  const f = await fixture(t, { omit: true });
  assert.deepEqual(await f.gw.execute({ action: 'release-proof.releases.inspect' }), { present: false, kind: 'undefined' });
  assert.equal(f.requests.length, 0);
});

const malformed = [null, 'releases.example.com', [], Array(9).fill('a.example'),
  ['a.example', 'a.example'], [42], ['UPPER.example'], ['*.example'], ['a.example:443'],
  ['127.0.0.1'], ['[::1]'], ['a.example.'], ['nodot'], ['a..example'], ['-a.example'],
  ['a-.example'], [`${'a'.repeat(64)}.example`], ['a_foo.example'], ['a.example/path'],
  ['a.example\n'], ['0x7f.0.0.1'], [Array(5).fill('a'.repeat(63)).join('.')]];
for (const [i, hosts] of malformed.entries()) {
  test(`malformed release_hosts refused at load (${i}: ${JSON.stringify(hosts)})`, async (t) => {
    await assert.rejects(() => fixture(t, { hosts }), (err) => {
      assert.equal(err.field, 'modules.releases.release_hosts');
      assert.match(err.message, /manifest\.json/);
      return true;
    });
  });
}

test('listed host fetched using GET and only accept, without credentials', async (t) => {
  const bytes = new Uint8Array([0, 255, 128, 1]);
  const f = await fixture(t, { fetch: () => new Response(bytes, { headers: { 'content-type': 'example/binary' } }) });
  const result = await f.download(URL.replace('/app/', ':443/app/'));
  assert.equal(result.status, 200);
  assert.ok(result.bytes instanceof Uint8Array);
  assert.deepEqual(result.bytes, bytes);
  assert.equal(result.content_type, 'example/binary');
  assert.equal(f.requests.length, 1);
  const req = f.requests[0];
  assert.equal(req.url, URL);
  assert.deepEqual(Object.fromEntries(new Headers(req.options.headers)), { accept: 'application/octet-stream' });
  assert.equal(req.options.method, 'GET');
  assert.equal(req.options.credentials, 'omit');
  assert.equal(req.options.redirect, 'manual');
  assert.equal(req.options.body, undefined);
  assert.ok(req.options.signal instanceof AbortSignal);
});

for (const [name, url] of [
  ['unlisted host', 'https://evil.example.com/file'], ['HTTP', 'http://releases.example.com/file'],
  ['userinfo', 'https://user:password@releases.example.com/file'], ['non-default port', 'https://releases.example.com:444/file'],
  ['non-string URL', { href: URL }], ['malformed URL', 'this is not a URL'],
]) {
  test(`${name} refused before any request`, async (t) => {
    const f = await fixture(t);
    denied(await f.download(url), /release (host|URL)/);
    assert.equal(f.requests.length, 0);
  });
}

for (const status of [301, 302, 303, 307, 308]) {
  test(`redirect ${status} to listed host followed`, async (t) => {
    const f = await fixture(t, { fetch: (url) => url === URL
      ? new Response(null, { status, headers: { location: 'https://cdn.example.com/file' } })
      : new Response('final') });
    const result = await f.download();
    assert.equal(result.status, 200);
    assert.equal(new TextDecoder().decode(result.bytes), 'final');
    assert.deepEqual(f.requests.map((r) => r.url), [URL, 'https://cdn.example.com/file']);
    for (const r of f.requests) assert.equal(r.options.method, 'GET');
  });
}

test('relative redirect resolved against current URL', async (t) => {
  let calls = 0;
  const f = await fixture(t, { fetch: () => ++calls === 1
    ? new Response(null, { status: 302, headers: { location: '../files/file' } }) : new Response('done') });
  assert.equal((await f.download()).status, 200);
  assert.equal(f.requests[1].url, 'https://releases.example.com/app/files/file');
});

test('redirect to unlisted host refused before second request', async (t) => {
  const f = await fixture(t, { fetch: (url) => url === URL
    ? new Response(null, { status: 302, headers: { location: 'https://evil.example.com/file' } }) : new Response('unsafe') });
  denied(await f.download(), /host/);
  assert.equal(f.requests.length, 1);
});

for (const location of ['http://releases.example.com/file', 'https://x@y@releases.example.com/file', 'https://releases.example.com:444/file', '']) {
  test(`redirect with unsafe Location ${JSON.stringify(location)} refused`, async (t) => {
    const f = await fixture(t, { fetch: () => new Response(null, { status: 307, headers: { location } }) });
    denied(await f.download(), /URL/);
    assert.equal(f.requests.length, 1);
  });
}

test('fourth redirect refused before fifth request', async (t) => {
  let calls = 0;
  const f = await fixture(t, { fetch: () => ++calls <= 4
    ? new Response(null, { status: 302, headers: { location: `/next-${calls}` } }) : new Response('done') });
  denied(await f.download(), /redirect limit/);
  assert.equal(f.requests.length, 4);
});

test('content-length over maxBytes refused without reading the body', async (t) => {
  let reads = 0;
  const f = await fixture(t, { fetch: () => ({ status: 200, headers: new Headers({ 'content-length': '17' }),
    body: { getReader: () => { reads++; return new Response('x').body.getReader(); } } }) });
  denied(await f.download(), /content-length/);
  assert.equal(reads, 0);
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].options.signal.aborted, true);
});

test('streamed body over maxBytes aborted and cancelled', async (t) => {
  let cancelled = false;
  let chunks = 0;
  const f = await fixture(t, { fetch: () => new Response(new ReadableStream({
    pull(c) { c.enqueue(new Uint8Array(10)); if (++chunks === 5) c.close(); }, cancel() { cancelled = true; },
  })) });
  denied(await f.download(), /body exceeds/);
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].options.signal.aborted, true);
  assert.equal(cancelled, true);
});

test('exact byte limit accepted', async (t) => {
  const f = await fixture(t, { fetch: () => new Response(new Uint8Array(16), { headers: { 'content-length': '16' } }) });
  assert.equal((await f.download()).bytes.byteLength, 16);
});

test('404 becomes vendor_error naming status and endpoint without body or query', async (t) => {
  const f = await fixture(t, { fetch: () => new Response('PRIVATE_RESPONSE_BODY', { status: 404 }) });
  const result = await f.download(`${URL}?secret=hidden`);
  assert.equal(result.status, 'vendor_error');
  assert.equal(result.http_status, 404);
  assert.equal(result.endpoint, URL);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_RESPONSE_BODY|secret|hidden/);
});

for (const maxBytes of [undefined, null, 0, -1, 1.5, '16', 33_554_433, Infinity, NaN]) {
  test(`invalid maxBytes ${String(maxBytes)} refused before any request`, async (t) => {
    const f = await fixture(t);
    denied(await f.download(URL, maxBytes), /maxBytes/);
    assert.equal(f.requests.length, 0);
  });
}

test('request timeout aborts a stalled fetch', async (t) => {
  const f = await fixture(t, { fetch: () => new Promise(() => {}) });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = f.download();
  // Execute passes async grant checks before the fetch begins.
  while (!f.requests.length) await new Promise(setImmediate);
  t.mock.timers.tick(60_000);
  const result = await pending;
  assert.equal(result.status, 'vendor_error');
  assert.equal(result.reason, 'release request timed out');
  assert.equal(f.requests[0].options.signal.aborted, true);
});

test('request timeout includes a stalled body', async (t) => {
  const f = await fixture(t, { fetch: () => new Response(new ReadableStream({ pull() {} })) });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = f.download();
  while (!f.requests.length) await new Promise(setImmediate);
  await new Promise(setImmediate);
  t.mock.timers.tick(60_000);
  assert.equal((await pending).reason, 'release request timed out');
  assert.equal(f.requests[0].options.signal.aborted, true);
});
