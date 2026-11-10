import assert from 'node:assert/strict';

// Buffer is a Uint8Array subclass, but is accepted by Node Playwright.
// Cloudflare Playwright silently mishandles an unconverted Uint8Array.
export function strictRoute(url, type = 'image', method = 'GET') {
  const bodies = [];
  let aborted = false;
  return {
    bodies,
    get aborted() { return aborted; },
    request: () => ({ url: () => url, method: () => method, headers: () => ({}),
      resourceType: () => type, isNavigationRequest: () => false }),
    fulfill: async ({ body }) => {
      assert.ok(!ArrayBuffer.isView(body) || Buffer.isBuffer(body), 'route.fulfill received a raw Uint8Array');
      assert.ok(typeof body === 'string' || Buffer.isBuffer(body), 'route.fulfill needs text or Buffer');
      bodies.push(body);
    },
    abort: async () => { aborted = true; }
  };
}
