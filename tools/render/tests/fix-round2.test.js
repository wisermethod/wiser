import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { portable } from './portable-loader.js';
import { strictRoute } from './fixtures/strict-route.mjs';

const coreUrl = new URL('../scripts/browser-core.js', import.meta.url);
const lookup = async () => ['93.184.216.34'];
const turn = () => new Promise(resolve => setImmediate(resolve));

test('300 unique hosts share four DNS slots, signal, and stop at the first refusal', { timeout: 5000 }, async () => {
  const core = await portable(coreUrl);
  let handle, active = 0, peak = 0, calls = 0, callsAtRefusal;
  const signals = [];
  const network = await core.addressRoutes({ route: async (_, fn) => { handle = fn; } }, 'https://public.example/page', {
    responseBody: bytes => Buffer.from(bytes),
    lookup: async (host, options) => {
      if (host === 'public.example') return lookup();
      calls++;
      peak = Math.max(peak, ++active);
      signals.push(options?.signal);
      try {
        await turn();
        if (host === 'asset-0.example') {
          callsAtRefusal = calls;
          return ['127.0.0.1'];
        }
        return lookup();
      } finally { active--; }
    },
    fetch: async () => new Response(null)
  }, new AbortController().signal);
  await Promise.all(Array.from({ length: 300 }, (_, i) => handle(strictRoute(`https://asset-${i}.example/image`))));
  assert.throws(network.check, /loopback/);
  assert.ok(peak <= 4, `peak concurrent lookups: ${peak}`);
  assert.ok(signals.length > 0 && signals.every(signal => signal?.aborted), 'every resolver receives the shared abort signal');
  assert.equal(new Set(signals).size, 1);
  assert.equal(calls, callsAtRefusal, 'queued resolvers did not start after refusal');
  await handle(strictRoute('https://after-refusal.example/image'));
  assert.equal(calls, callsAtRefusal);
});

test('four declared 3 MiB bodies reserve the shared budget before obtaining readers', async () => {
  const core = await portable(coreUrl);
  let handle, readers = 0, reads = 0;
  const signals = [];
  const network = await core.addressRoutes({ route: async (_, fn) => { handle = fn; } }, 'https://public.example/page', {
    lookup, responseBody: bytes => Buffer.from(bytes), fetch: async (url, { signal }) => {
      if (url.endsWith('/page')) return new Response(null);
      signals.push(signal);
      return { status: 200, headers: new Headers({ 'content-length': String(3 * 1024 * 1024) }), body: {
        cancel: async () => {},
        getReader() {
          readers++;
          let sent = false;
          return { read: async () => {
            reads++;
            await turn();
            if (sent || signal.aborted) return { done: true };
            sent = true;
            return { done: false, value: new Uint8Array(3 * 1024 * 1024) };
          }, cancel: async () => {}, releaseLock() {} };
        }
      } };
    }
  }, new AbortController().signal);
  await Promise.all(Array.from({ length: 4 }, (_, i) => handle(strictRoute(`https://public.example/body-${i}`))));
  assert.throws(network.check, /8 MiB/);
  assert.equal(readers, 2, 'only bodies that fit their reservations may obtain a reader');
  assert.equal(reads, 2);
  assert.ok(signals.every(signal => signal.aborted));
});

test('a body exceeding its declared reservation is still charged for its extra bytes', async () => {
  const core = await portable(coreUrl);
  let handle, reads = 0;
  const network = await core.addressRoutes({ route: async (_, fn) => { handle = fn; } }, 'https://public.example/page', {
    lookup, responseBody: bytes => Buffer.from(bytes), fetch: async url => {
      if (url.endsWith('/page')) return new Response(null);
      return { status: 200, headers: new Headers({ 'content-length': '1' }), body: {
        getReader: () => ({ read: async () => ({ done: false, value: new Uint8Array(++reads <= 2 ? 5 * 1024 * 1024 : 0) }), cancel: async () => {}, releaseLock() {} })
      } };
    }
  }, new AbortController().signal);
  await handle(strictRoute('https://public.example/under-declared'));
  assert.throws(network.check, /8 MiB/);
  assert.equal(reads, 2);
});

test('completed bodies release unused reservations without double-charging their chunks', async () => {
  const core = await portable(coreUrl);
  let handle;
  const network = await core.addressRoutes({ route: async (_, fn) => { handle = fn; } }, 'https://public.example/page', {
    lookup, responseBody: bytes => Buffer.from(bytes), fetch: async url => url.endsWith('/page') ? new Response(null) : new Response(new Uint8Array(1024 * 1024), {
      headers: { 'content-type': 'image/png', 'content-length': String(6 * 1024 * 1024) }
    })
  }, new AbortController().signal);
  for (const i of [0, 1, 2]) {
    const route = strictRoute(`https://public.example/small-${i}`);
    await handle(route);
    network.check();
    assert.equal(route.bodies[0].byteLength, 1024 * 1024);
  }
});

test('four unknown-length 20 MiB first chunks are cancelled and not retained', () => {
  const run = spawnSync(process.execPath, ['--expose-gc', '--experimental-vm-modules', fileURLToPath(new URL('./fixtures/oversized-chunks.mjs', import.meta.url))], {
    encoding: 'utf8', timeout: 15000, env: { ...process.env, npm_config_offline: 'true' }
  });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), { reads: 4, cancelled: 4, fulfilled: 0, retained: 0 });
});

for (const mode of ['upload', 'address']) test(`${mode} fulfill converts bytes and catches a host that forgets`, async () => {
  const core = await portable(coreUrl);
  for (const bad of [false, true]) {
    let handle;
    const context = { route: async (_, fn) => { handle = fn; } };
    const bytes = new Uint8Array([137, 80, 78, 71]);
    const responseBody = bad ? value => value : value => Buffer.from(value);
    let check;
    if (mode === 'upload') check = await core.uploadRoutes(context, new Map([['asset.png', { bytes }]]), {}, responseBody);
    else ({ check } = await core.addressRoutes(context, 'https://public.example/asset.png', { lookup, responseBody, fetch: async () => new Response(bytes, { headers: { 'content-type': 'image/png' } }) }, new AbortController().signal));
    const route = strictRoute(mode === 'upload' ? core.href('asset.png') : 'https://public.example/asset.png');
    await handle(route);
    if (bad) { assert.throws(check, /asset|fetch|capture|request/); assert.equal(route.aborted, true); assert.equal(route.bodies.length, 0); }
    else { check(); assert.deepEqual(route.bodies, [Buffer.from(bytes)]); }
  }
});
