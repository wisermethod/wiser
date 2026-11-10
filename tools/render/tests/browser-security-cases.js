import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { createSocket } from 'node:dgram';
import { launch } from '../../lib/browser-runtime/browser-runtime.js';
import { portable } from './portable-loader.js';

export function browserSecurityCases(url) {
  test('uploads are offline before navigation and HTTP allowlisting remains active', async () => {
    const core = await portable(url);
    const events = [];
    const context = {
      setOffline: async value => events.push(['offline', value]),
      addInitScript: async () => events.push(['init']),
      routeWebSocket: async () => {},
      route: async () => events.push(['route']),
      newPage: async () => ({ setDefaultTimeout() {}, setDefaultNavigationTimeout() {} }),
      close: async () => {}
    };
    await core.withPage({ newContext: async () => context }, {}, async (_, ctx) => {
      await core.uploadRoutes(ctx, new Map()); events.push(['navigate']);
    });
    assert.ok(events.findIndex(e => e[0] === 'offline' && e[1]) >= 0);
    assert.ok(events.findIndex(e => e[0] === 'offline') < events.findIndex(e => e[0] === 'navigate'));
    assert.ok(events.some(e => e[0] === 'route'));
  });

  test('WebSocket routing is optional and every frame loses socket constructors', async () => {
    const core = await portable(url), browser = await launch();
    try {
      const withoutSocketRoute = { newContext: async options => {
        const ctx = await browser.newContext(options);
        return new Proxy(ctx, { get(target, key) {
          if (key === 'routeWebSocket') return undefined;
          const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
        } });
      } };
      await core.withPage(withoutSocketRoute, {}, async (page, ctx) => {
        const html = '<iframe srcdoc="<p>child</p>"></iframe>';
        const check = await core.uploadRoutes(ctx, new Map([['index.html', { bytes: core.textBytes(html) }]]));
        await page.goto(core.href('index.html'));
        for (const frame of page.frames()) {
          assert.deepEqual(await frame.evaluate(() => ['RTCPeerConnection', 'webkitRTCPeerConnection', 'RTCDataChannel', 'WebSocket'].map(key => typeof window[key])), ['undefined', 'undefined', 'undefined', 'undefined']);
        }
        check();
      });
    } finally { await browser.close(); }
  });

  test('hostile uploaded WebRTC, WebSocket and preconnect attempt no TCP or UDP socket', async () => {
    const tcp = createServer(socket => { attempts++; socket.destroy(); }), udp = createSocket('udp4');
    let attempts = 0;
    udp.on('message', () => attempts++);
    await new Promise(resolve => tcp.listen(0, '127.0.0.1', resolve));
    await new Promise(resolve => udp.bind(0, '127.0.0.1', resolve));
    const browser = await launch(), core = await portable(url);
    try {
      await core.withPage(browser, {}, async (page, ctx) => {
        const html = `<link rel="preconnect" href="http://127.0.0.1:${tcp.address().port}"><script>
          try { const pc = new RTCPeerConnection({iceServers:[{urls:'stun:127.0.0.1:${udp.address().port}'}]}); pc.createDataChannel('c'); pc.createOffer().then(o=>pc.setLocalDescription(o)); } catch {}
          try { new WebSocket('ws://127.0.0.1:${tcp.address().port}'); } catch {}
        </script>`;
        await core.uploadRoutes(ctx, new Map([['index.html', { bytes: core.textBytes(html) }]]));
        await page.goto(core.href('index.html'));
        await new Promise(resolve => setTimeout(resolve, 700));
        assert.equal(attempts, 0);
      });
    } finally { await browser.close(); await new Promise(resolve => tcp.close(resolve)); udp.close(); }
  });

  for (const late of [false, true]) test(`deadline exposes durable cleanup for ${late ? 'late context creation' : 'hung close'}`, async () => {
    let expire, arrive, finishClose, closing = false;
    const core = await portable(url, { setTimeout: fn => { expire = fn; return 1; }, clearTimeout() {} });
    const context = {
      addInitScript: async () => {}, setOffline: async () => {}, routeWebSocket: async () => {},
      newPage: async () => ({ setDefaultTimeout() {}, setDefaultNavigationTimeout() {} }),
      close: () => { closing = true; return new Promise(resolve => { finishClose = resolve; }); }
    };
    const job = core.withPage({ newContext: () => late ? new Promise(resolve => { arrive = resolve; }) : Promise.resolve(context) }, {}, async () => 'done');
    if (!late) while (!closing) await Promise.resolve();
    expire();
    const error = await job.catch(error => error);
    assert.equal(error.code, 'browser_abandoned');
    assert.equal(typeof error.cleanup?.then, 'function');
    let cleaned = false;
    const waitUntil = promise => promise.then(() => { cleaned = true; });
    const pending = waitUntil(error.cleanup);
    if (late) arrive(context);
    while (!closing) await Promise.resolve();
    await Promise.resolve(); assert.equal(cleaned, false);
    finishClose(); await pending; assert.equal(cleaned, true);
  });

  test('a failed close is reported to the host instead of swallowed', async () => {
    const core = await portable(url);
    const context = {
      addInitScript: async () => {}, setOffline: async () => {}, routeWebSocket: async () => {},
      newPage: async () => ({ setDefaultTimeout() {}, setDefaultNavigationTimeout() {} }),
      close: async () => { throw new Error('close failed'); }
    };
    const error = await core.withPage({newContext: async () => context}, {}, async () => 'done').catch(e => e);
    assert.equal(error.code, 'browser_abandoned');
    assert.equal((await error.cleanup).closed, false);
  });
}
