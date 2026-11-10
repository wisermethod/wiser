/** Browser boundary: Web APIs and an injected Playwright Browser only. */
import { readZip, archiveName } from '../../lib/archive-core.js';
import { destinationReason, destinationReasonText } from '../../lib/destination-core.js';
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

/** A fresh isolated context per job; the caller retains ownership of browser. */
export async function withPage(browser, options, work) {
  if (!browser?.newContext) refuse('the host must supply a Playwright browser.');
  const controller = new AbortController();
  let context, timer, expired = false, closing;
  const timeoutError = () => new RenderError('Error: browser job exceeded 60 seconds; nothing was returned.');
  function close() {
    if (!context) return Promise.resolve();
    return closing ||= context.close().catch(() => {});
  }
  async function run() {
    try {
      context = await browser.newContext({ ...options, serviceWorkers: 'block', acceptDownloads: false });
      if (expired) throw timeoutError();
      // HTTP routing does not intercept WebSockets. Never let one bypass the host.
      if (typeof context.routeWebSocket !== 'function') refuse('the browser must support WebSocket routing.');
      await context.routeWebSocket('**/*', socket => socket.close());
      const page = await context.newPage();
      page.setDefaultTimeout(JOB_MS - 1000);
      page.setDefaultNavigationTimeout(JOB_MS - 1000);
      return await work(page, context, controller.signal);
    } finally { await close(); }
  }
  try {
    return await Promise.race([
      run(),
      new Promise((_, reject) => { timer = setTimeout(() => {
        expired = true;
        controller.abort();
        void close();
        reject(timeoutError());
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

export async function screen(value, lookup) {
  if (typeof value !== 'string' || value.length > 4096) refuse('url must be a string of at most 4096 characters.');
  let url;
  try { url = new URL(value); } catch { refuse('url must be a full public http or https address.'); }
  if (!['http:', 'https:'].includes(url.protocol)) refuse('url must use http or https.');
  if (url.username || url.password) refuse('addresses carrying credentials are not accepted.');
  const reason = await destinationReason(url.hostname, lookup);
  if (reason) refuse(`--url ${url.href} points at ${destinationReasonText(reason)}, which this tool does not fetch.`);
  return url;
}

/** Host fetch performs every hop. Chromium never opens a network connection. */
export async function addressRoutes(context, initial, { fetch, lookup, responseBody }, signal) {
  if (typeof fetch !== 'function' || typeof lookup !== 'function') refuse('address capture requires host fetch and all-address DNS lookup.');
  let transferred = 0, requests = 0, problem, finalUrl = initial;
  const redirects = new Set([301, 302, 303, 307, 308]);
  async function get(address, requestHeaders = {}) {
    let url = await screen(address, lookup);
    for (let hops = 0; ; hops++) {
      if (signal.aborted) refuse('browser job exceeded 60 seconds; nothing was returned.');
      if (++requests > 200) refuse('page exceeds 200 network requests.');
      const response = await fetch(url.href, { redirect: 'manual', signal, credentials: 'omit', headers: { Accept: requestHeaders.accept || '*/*' } });
      if (response.redirected || (response.url && new URL(response.url).href.split('#')[0] !== url.href.split('#')[0])) refuse('host fetch followed a redirect automatically; redirect: manual is required.');
      if (redirects.has(response.status)) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location || hops >= 5) refuse('redirect chain is missing Location or exceeds 5 hops.');
        url = await screen(new URL(location, url).href, lookup);
        continue;
      }
      const chunks = [];
      let length = 0;
      if (response.body) {
        const reader = response.body.getReader();
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            length += value.length; transferred += value.length;
            if (transferred > INPUT_LIMIT) { await reader.cancel(); refuse('page and its assets exceed 8 MiB.'); }
            chunks.push(value);
          }
        } finally { reader.releaseLock(); }
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      // Fetch has already decompressed the body. Do not forward encoding, length,
      // cookies, redirects, refresh, auth or browser network reporting headers.
      const headers = { 'content-type': response.headers.get('content-type') || 'application/octet-stream' };
      return { url: url.href, status: response.status, headers, bytes };
    }
  }
  const first = await get(initial);
  let cached = first;
  finalUrl = first.url;
  await context.route('**/*', async route => {
    try {
      const request = route.request();
      if (!['GET', 'HEAD'].includes(request.method())) refuse('address capture permits GET and HEAD requests only.');
      const response = cached && new URL(request.url()).href.split('#')[0] === new URL(cached.url).href.split('#')[0] ? cached : await get(request.url(), request.headers());
      cached = null;
      if (request.isNavigationRequest() && request.frame() === context.pages()[0].mainFrame()) finalUrl = response.url;
      if (response.url.split('#')[0] !== request.url().split('#')[0] && ['stylesheet', 'script'].includes(request.resourceType())) refuse('a script or stylesheet redirected; intercepted bodies cannot preserve its final resource URL.');
      let bytes = response.bytes;
      // A script-initiated navigation may itself redirect. Keep relative assets
      // based at the screened final document even when it was fulfilled in place.
      if (response.url !== request.url() && response.headers['content-type'].includes('text/html')) {
        const escaped = response.url.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
        bytes = textBytes(`<base href="${escaped}">` + textOf(bytes));
      }
      await route.fulfill({ status: response.status, headers: response.headers, body: bodyOf(bytes, response.headers['content-type'], responseBody) });
    } catch (error) {
      problem ||= error instanceof RenderError ? error : new RenderError('Error: a public page request failed.');
      await route.abort().catch(() => {});
    }
  });
  return { url: first.url, finalUrl: () => finalUrl, check: () => { if (problem) throw problem; } };
}
