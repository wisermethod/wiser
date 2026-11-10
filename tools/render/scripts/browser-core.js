/** Browser boundary: Web APIs and an injected Playwright Browser only. */
import { readZip, archiveName } from '../../lib/archive-core.js';
import { destinationReason, destinationReasonText } from '../../lib/destination-core.js';
import { classifyFailure } from './failure-core.js';
export const INPUT_LIMIT = 8 * 1024 * 1024;
export const OUTPUT_LIMIT = 4 * 1024 * 1024;
export const JOB_MS = 60000;
export const ORIGIN = 'https://wiser-upload.invalid';
export const textBytes = text => new TextEncoder().encode(text);
export const textOf = bytes => new TextDecoder().decode(bytes);
function bodyOf(bytes, type, responseBody) {
  if (responseBody) return responseBody(bytes);
  if (/^(?:text\/|application\/(?:javascript|json)|image\/svg\+xml)/i.test(type)) return textOf(bytes);
  refuse('host must supply responseBody to transmit binary browser assets.');
}
export class RenderError extends Error {}
export function refuse(reason) { throw new RenderError(`Error: ${reason}`); }
export function positive(value, fallback, name, max = Infinity, integer = true) {
  const n = value == null ? fallback : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0 || n > max || (integer && !Number.isSafeInteger(n))) refuse(`${name} must be ${integer ? 'a whole number' : 'a number'} above zero and at most ${max}.`);
  return n;
}
export function pixels(width, height, scale = 1) {
  if (!Number.isFinite(width * height * scale) || width < 1 || height < 1 || width * scale > 8192 || height * scale > 8192 || width * height * scale * scale > 16777216) refuse('image size exceeds 8192 pixels per side or 16777216 pixels in total.');
}
export function result(answer, files) {
  if (JSON.stringify(answer).length >= 48000) refuse('answer reaches the 48000-character limit; nothing was returned.');
  if (files.reduce((n, file) => n + file.bytes.byteLength, 0) >= OUTPUT_LIMIT) refuse('output files reach the 4 MiB limit; nothing was returned.');
  return { answer, files };
}
export function fileInput(input, files) {
  if (textBytes(JSON.stringify(input)).length > INPUT_LIMIT) refuse('JSON input exceeds 8 MiB.');
  if (!Array.isArray(files) || files.length !== 1 || !(files[0].bytes instanceof Uint8Array)) refuse('supply exactly one file as bytes.');
  if (files[0].bytes.length > INPUT_LIMIT) refuse('input file exceeds 8 MiB.');
  return files[0];
}
export function mediaType(name) {
  return ({ html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript', mjs: 'text/javascript', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', json: 'application/json' })[name.split('.').pop().toLowerCase()] || 'application/octet-stream';
}
export async function upload(input, files, extension = /\.html?$/i) {
  const file = fileInput(input, files);
  const entries = /\.zip$/i.test(file.name) ? await readZip(file.bytes, { maxBytes: INPUT_LIMIT }) : [file];
  const names = entries.filter(entry => extension.test(entry.name)).map(entry => entry.name);
  const entry = input.entry == null ? (names.includes('index.html') ? 'index.html' : names.length === 1 ? names[0] : null) : archiveName(input.entry);
  if (!entry || !names.includes(entry)) refuse('name one HTML entry with entry when the ZIP has multiple pages.');
  return { entry, entries: new Map(entries.map(file => [file.name, file])) };
}
export function href(name) { return `${ORIGIN}/${name.split('/').map(encodeURIComponent).join('/')}`; }

/** Runs before uploaded scripts in every document, including child frames. */
function browserGuards() {
  for (const key of ['RTCPeerConnection', 'webkitRTCPeerConnection', 'RTCDataChannel', 'WebSocket']) {
    Object.defineProperty(window, key, { value: undefined, writable: false, configurable: false });
  }
  let frozen = false;
  const stop = Event.prototype.stopImmediatePropagation;
  window.addEventListener('resize', event => { if (frozen) stop.call(event); }, true);
  Object.defineProperty(window, '__wiserFreezeDocument', { configurable: false, writable: false, value: () => {
    frozen = true;
    window.onresize = null;
    const style = document.createElement('style');
    style.textContent = '*, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }';
    document.documentElement.appendChild(style);
    for (const animation of document.getAnimations()) animation.cancel();
  } });
}

export async function freezeDocument(page) {
  await page.evaluate(() => window.__wiserFreezeDocument());
}

/** A fresh isolated context per job; the caller retains ownership of browser.
 * On abandonment the host must retain error.cleanup (for example waitUntil),
 * and discard its browser if cleanup reports closed:false or remains stuck.
 */
export async function withPage(browser, options, work) {
  if (!browser?.newContext) refuse('the host must supply a Playwright browser.');
  const controller = new AbortController();
  let timer, expired = false, closing;
  const creation = (async () => browser.newContext({ ...options, serviceWorkers: 'block', acceptDownloads: false }))();
  function close() {
    return closing ||= creation.then(async context => {
      try { await context.close(); return { closed: true }; }
      catch { return { closed: false }; }
    }, () => ({ closed: true }));
  }
  function abandoned(reason = 'browser job exceeded 60 seconds; nothing was returned.') {
    const error = new RenderError(`Error: ${reason}`);
    error.code = 'browser_abandoned';
    error.cleanup = close();
    return error;
  }
  async function run() {
    try {
      const context = await creation;
      if (expired) throw abandoned();
      await context.addInitScript(browserGuards);
      // Intercepted HTTP responses still work offline. Speculative connections,
      // preconnect, and channels outside the HTTP route must never go online.
      await context.setOffline(true);
      if (typeof context.routeWebSocket === 'function') await context.routeWebSocket('**/*', socket => socket.close());
      const page = await context.newPage();
      page.setDefaultTimeout(JOB_MS - 1000);
      page.setDefaultNavigationTimeout(JOB_MS - 1000);
      return await work(page, context, controller.signal);
    } finally {
      if (!(await close()).closed) throw abandoned('browser context could not be closed; discard the host browser.');
    }
  }
  try {
    return await Promise.race([
      run(),
      new Promise((_, reject) => { timer = setTimeout(() => {
        expired = true;
        controller.abort();
        reject(abandoned());
      }, JOB_MS); })
    ]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

/** No file:// access. Every relative asset is a member-supplied ZIP entry. */
export async function uploadRoutes(context, entries, overrides = {}, responseBody) {
  let problem;
  await context.route('**/*', async route => {
    try {
      const url = new URL(route.request().url());
      const name = decodeURIComponent(url.pathname.slice(1));
      const pinned = overrides[name.split('/').pop()];
      const file = pinned || (url.origin === ORIGIN ? entries.get(name) : null);
      if (!file) refuse('an asset is missing from the upload or uses an external address; include every asset in the ZIP.');
      if (route.request().method() !== 'GET') refuse('uploaded pages may request assets with GET only.');
      await route.fulfill({ status: 200, contentType: mediaType(name), body: bodyOf(file.bytes, mediaType(name), responseBody) });
    } catch (error) { problem ||= error instanceof RenderError ? error : new RenderError('Error: could not read an uploaded asset.'); await route.abort().catch(() => {}); }
  });
  return () => { if (problem) throw problem; };
}

export async function screen(value, lookup, namedAddress) {
  if (typeof value !== 'string' || value.length > 4096) refuse('url must be a string of at most 4096 characters.');
  let url;
  try { url = new URL(value); } catch { refuse('url must be a full public http or https address.'); }
  if (!['http:', 'https:'].includes(url.protocol)) refuse('url must use http or https.');
  if (url.username || url.password) refuse('addresses carrying credentials are not accepted.');
  const named = namedAddress ? new URL(namedAddress) : null;
  if (url.port && !['80', '443'].includes(url.port) && !(named && url.origin === named.origin)) refuse('address uses a port other than 80 or 443 that the member did not name.');
  const reason = await destinationReason(url.hostname, lookup);
  if (reason) refuse(`--url ${url.href} points at ${destinationReasonText(reason)}, which this tool does not fetch.`);
  return url;
}

/** Host fetch performs every hop. The service transport must recheck public
 * destinations at connection time and refuse Wiser domains; DNS is not pinned here.
 */
export async function addressRoutes(context, initial, { fetch, lookup, responseBody }, signal) {
  if (typeof fetch !== 'function' || typeof lookup !== 'function') refuse('address capture requires host fetch and all-address DNS lookup.');
  const controller = new AbortController();
  const pending = [];
  let active = 0, transferred = 0, requests = 0, problem, finalUrl = initial;
  const redirects = new Set([301, 302, 303, 307, 308]);
  function fail(error) {
    if (!problem) {
      problem = error instanceof RenderError ? error : new RenderError(classifyFailure(error.cause?.code || error.message, { url: initial }).message);
      controller.abort();
      for (const waiter of pending.splice(0)) waiter.reject(problem);
    }
    return problem;
  }
  const abort = () => fail(new RenderError('Error: browser job exceeded 60 seconds; nothing was returned.'));
  if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
  async function acquire() {
    if (controller.signal.aborted) throw problem;
    if (active < 4) { active++; return; }
    await new Promise((resolve, reject) => pending.push({ resolve, reject }));
  }
  function release() {
    const next = pending.shift();
    if (next) next.resolve(); else active--;
  }
  async function get(address, requestHeaders = {}) {
    let acquired = false;
    const checked = address => screen(address, async host => {
      // Literal-address and URL refusals do not need DNS or a slot. This lets
      // them cancel a saturated pool, while every resolver runs inside it.
      if (!acquired) { await acquire(); acquired = true; }
      if (controller.signal.aborted) throw problem;
      return lookup(host, { signal: controller.signal });
    }, initial);
    try {
      let url = await checked(address);
      if (!acquired) { await acquire(); acquired = true; }
      for (let hops = 0; ; hops++) {
        if (controller.signal.aborted) throw problem;
        if (++requests > 200) refuse('page exceeds 200 network requests.');
        const response = await fetch(url.href, { redirect: 'manual', signal: controller.signal, credentials: 'omit', headers: { Accept: requestHeaders.accept || '*/*' } });
        if (controller.signal.aborted) throw problem;
        if (response.redirected || (response.url && new URL(response.url).href.split('#')[0] !== url.href.split('#')[0])) refuse('host fetch followed a redirect automatically; redirect: manual is required.');
        if (redirects.has(response.status)) {
          const location = response.headers.get('location');
          await response.body?.cancel();
          if (!location || hops >= 5) refuse('redirect chain is missing Location or exceeds 5 hops.');
          url = await checked(new URL(location, url).href);
          continue;
        }
        // Reject a known over-budget body before obtaining a reader/buffering.
        const declared = response.headers.get('content-length');
        if (declared != null && (!/^\d+$/.test(declared) || Number(declared) > INPUT_LIMIT - transferred)) {
          response.body?.cancel().catch(() => {});
          refuse('page and its assets exceed 8 MiB.');
        }
        // Reserve across all four readers before any read can allocate a body.
        // Chunks consume this reservation; a lying length still pays for extras.
        let reserved = declared == null ? 0 : Number(declared);
        transferred += reserved;
        const chunks = [];
        let length = 0;
        if (response.body) {
          const reader = response.body.getReader();
          const cancel = () => { reader.cancel().catch(() => {}); };
          controller.signal.addEventListener('abort', cancel, { once: true });
          try {
            for (;;) {
              if (controller.signal.aborted) throw problem;
              let { done, value } = await reader.read();
              if (controller.signal.aborted) { value = null; throw problem; }
              if (done) break;
              // Account against the shared budget before retaining the chunk.
              const extra = Math.max(0, value.byteLength - reserved);
              if (extra > INPUT_LIMIT - transferred) {
                value = null;
                refuse('page and its assets exceed 8 MiB.');
              }
              reserved = Math.max(0, reserved - value.byteLength);
              transferred += extra; length += value.byteLength;
              chunks.push(value);
            }
          } catch (error) { throw fail(error); }
          finally { controller.signal.removeEventListener('abort', cancel); reader.releaseLock(); }
        }
        transferred -= reserved;
        const bytes = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
        // No encoding, length, Set-Cookie, refresh, auth or reporting headers.
        const headers = { 'content-type': response.headers.get('content-type') || 'application/octet-stream' };
        return { url: url.href, status: response.status, headers, bytes };
      }
    } catch (error) { throw fail(error); }
    finally { if (acquired) release(); }
  }
  const first = await get(initial);
  let cached = first;
  finalUrl = first.url;
  await context.route('**/*', async route => {
    try {
      if (problem) throw problem;
      const request = route.request();
      if (!['GET', 'HEAD'].includes(request.method())) refuse('address capture permits GET and HEAD requests only.');
      const response = cached && new URL(request.url()).href.split('#')[0] === new URL(cached.url).href.split('#')[0] ? cached : await get(request.url(), request.headers());
      cached = null;
      if (problem) throw problem;
      if (request.isNavigationRequest() && request.frame() === context.pages()[0].mainFrame()) finalUrl = response.url;
      if (response.url.split('#')[0] !== request.url().split('#')[0] && ['stylesheet', 'script'].includes(request.resourceType())) refuse('a script or stylesheet redirected; intercepted bodies cannot preserve its final resource URL.');
      let bytes = response.bytes;
      if (response.url !== request.url() && response.headers['content-type'].includes('text/html')) {
        const escaped = response.url.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
        bytes = textBytes(`<base href="${escaped}">` + textOf(bytes));
      }
      await route.fulfill({ status: response.status, headers: response.headers, body: bodyOf(bytes, response.headers['content-type'], responseBody) });
    } catch (error) {
      fail(error);
      await route.abort().catch(() => {});
    }
  });
  return { url: first.url, finalUrl: () => finalUrl, check: () => { if (problem) throw problem; } };
}
