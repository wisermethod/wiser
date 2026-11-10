/** Browser boundary: Web APIs and an injected Playwright Browser only. */
import { readZip, archiveName } from '../../lib/archive-core.js';
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
export class ExportError extends Error {}
export function refuse(reason) { throw new ExportError(`Error: ${reason}`); }
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
  const timeoutError = () => new ExportError('Error: browser job exceeded 60 seconds; nothing was returned.');
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
    } catch (error) { problem ||= error instanceof ExportError ? error : new ExportError('Error: could not read an uploaded asset.'); await route.abort().catch(() => {}); }
  });
  return () => { if (problem) throw problem; };
}

