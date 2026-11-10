import assert from 'node:assert/strict';
import dns from 'node:dns';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

let buffered = 0, rejected = 0;
globalThis.__wiserStrictBrowser = browser => new Proxy(browser, {
  get(target, key) {
    if (key === 'newContext') return async options => {
      const context = await target.newContext(options);
      return new Proxy(context, {
        get(target, key) {
          if (key === 'route') return (pattern, handler) => target.route(pattern, realRoute => handler(new Proxy(realRoute, {
            get(target, key) {
              // A strict fake fulfill sits at the actual CLI host boundary.
              if (key === 'fulfill') return async options => {
                if (ArrayBuffer.isView(options.body) && !Buffer.isBuffer(options.body)) {
                  rejected++;
                  assert.fail('route.fulfill received a raw Uint8Array');
                }
                if (Buffer.isBuffer(options.body)) buffered++;
                return target.fulfill(options);
              };
              const value = target[key];
              return typeof value === 'function' ? value.bind(target) : value;
            }
          })));
          const value = target[key];
          return typeof value === 'function' ? value.bind(target) : value;
        }
      });
    };
    const value = target[key];
    return typeof value === 'function' ? value.bind(target) : value;
  }
});
registerHooks({ load(url, context, next) {
  const answer = next(url, context);
  if (url.endsWith('/browser-runtime/browser-runtime.js')) {
    const source = String(answer.source).replace('export async function launch(options = {}) {', 'async function strictUnderlyingLaunch(options = {}) {');
    return { ...answer, source: source + '\nexport async function launch(options = {}) { return globalThis.__wiserStrictBrowser(await strictUnderlyingLaunch(options)); }\n' };
  }
  if (process.env.STRICT_BODY_MUTANT === 'identity' && /\/scripts\/(?:render|deck)\.js$/.test(url)) {
    const source = String(answer.source);
    assert.ok(source.includes('responseBody: bytes => Buffer.from(bytes)'), 'CLI converter was not found');
    return { ...answer, source: source.replace('responseBody: bytes => Buffer.from(bytes)', 'responseBody: bytes => bytes') };
  }
  return answer;
} });
if (process.env.STRICT_BODY_NETWORK === 'true') {
  dns.promises.lookup = async () => [{ address: '93.184.216.34' }];
  globalThis.fetch = async url => new URL(url).pathname === '/pixel.png'
    ? new Response(readFileSync(new URL('./shared/pixel.png', import.meta.url)), { headers: { 'content-type': 'image/png' } })
    : new Response('<body><img src="/pixel.png"></body>', { headers: { 'content-type': 'text/html' } });
}
process.on('exit', () => {
  process.stderr.write(`STRICT_BODY ${JSON.stringify({ buffered, rejected })}\n`);
  if (process.exitCode !== 1 && buffered === 0) process.exitCode = 1;
});
