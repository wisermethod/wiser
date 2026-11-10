import assert from 'node:assert/strict';
import { portable } from '../portable-loader.js';
import { strictRoute } from './strict-route.mjs';

const core = await portable(new URL('../../scripts/browser-core.js', import.meta.url));
let queued = 0;
const arrays = core.textBytes.constructor('return Array.prototype')();
const push = arrays.push;
arrays.push = function (...values) {
  queued += values.filter(value => ArrayBuffer.isView(value) && value.byteLength > core.INPUT_LIMIT).length;
  return Reflect.apply(push, this, values);
};
let handle, reads = 0, cancelled = 0, fulfilled = 0, release;
const refs = [];
const ready = new Promise(resolve => { release = resolve; });
const network = await core.addressRoutes({ route: async (_, fn) => { handle = fn; } }, 'https://public.example/page', {
  lookup: async () => ['93.184.216.34'], responseBody: bytes => Buffer.from(bytes),
  fetch: async url => {
    if (url.endsWith('/page')) return new Response(null);
    return { status: 200, headers: new Headers(), body: { getReader: () => ({
      read: async () => {
        assert.ok(++reads <= 4, 'no second read after overflow');
        if (reads === 4) release();
        await ready;
        const value = new Uint8Array(20 * 1024 * 1024);
        refs.push(new WeakRef(value));
        return { done: false, value };
      }, cancel: async () => { cancelled++; }, releaseLock() {}
    }) } };
  }
}, new AbortController().signal);
await Promise.all(Array.from({ length: 4 }, (_, i) => {
  const route = strictRoute(`https://public.example/large-${i}`);
  route.fulfill = async () => { fulfilled++; };
  return handle(route);
}));
assert.throws(network.check, /8 MiB/);
assert.equal(queued, 0, 'an over-budget chunk was retained in a core array, even briefly');
// End the WeakRef creation job before collecting; test liveness, not RSS.
for (let i = 0; i < 3; i++) { await new Promise(resolve => setImmediate(resolve)); globalThis.gc(); }
const retained = refs.filter(ref => ref.deref()).length;
assert.equal(retained, 0, 'oversized chunks remain strongly referenced after cancellation');
console.log(JSON.stringify({ reads, cancelled, fulfilled, retained }));
