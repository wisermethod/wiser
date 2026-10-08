// The kit Function, site kit 0.5.0. Every kit site that has a scheduled article carries these exact bytes;
// KIT.md states their sha256 and cloudflare.pages.deploy admits no other. It renders nothing: the build made
// every page it serves. dist/ is the build-time view and is served as it is; schedule.bin, which the build
// writes beside this file, holds the later version of each page, feed and list that a scheduled article
// changes, and the instant each takes effect. A request gets a later version once its instant has passed;
// every other request, and every error, goes to the static files, so a Function that fails shows the
// build-time view and never a page early. The only inputs read are the method, the path, If-None-Match,
// and the platform's clock.
import schedule from './schedule.bin';

const HEADERS = {
  'cache-control': 'public, max-age=0, must-revalidate',
  'x-content-type-options': 'nosniff',
  'access-control-allow-origin': '*',
  'referrer-policy': 'strict-origin-when-cross-origin',
};
const TYPES = new Set([
  'text/html; charset=utf-8',
  'application/xml',
  'text/plain; charset=utf-8',
  'text/css; charset=utf-8',
  'application/javascript',
  'application/json',
]);
const ETAG = /^[0-9a-f]{32}$/;

let loaded = null;

function whole(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function load() {
  if (loaded) return loaded;
  const bytes = new Uint8Array(schedule);
  if (bytes.length < 8 || String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== 'WKS1') throw new Error('kit schedule: unreadable');
  const length = new DataView(schedule).getUint32(4);
  if (8 + length > bytes.length) throw new Error('kit schedule: unreadable');
  const head = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(8, 8 + length)));
  const blobs = bytes.subarray(8 + length);
  if (!head || head.v !== 1 || !head.paths || typeof head.paths !== 'object' || Array.isArray(head.paths)) throw new Error('kit schedule: unreadable');
  const paths = new Map();
  for (const [path, entry] of Object.entries(head.paths)) {
    if (!path.startsWith('/') || !entry || typeof entry.page !== 'boolean' || !Array.isArray(entry.list) || entry.list.length === 0) throw new Error('kit schedule: unreadable');
    let previous = -Infinity;
    for (const version of entry.list) {
      if (!version || !whole(version.at) || version.at <= previous || !whole(version.off) || !whole(version.len) || !whole(version.size)
        || version.off + version.len > blobs.length || !ETAG.test(version.etag) || !TYPES.has(version.type)) throw new Error('kit schedule: unreadable');
      previous = version.at;
    }
    paths.set(path, entry);
  }
  loaded = { paths, blobs };
  return loaded;
}

function effective(entry, now) {
  let pick = null;
  for (const version of entry.list) {
    if (version.at <= now) pick = version;
    else break;
  }
  return pick;
}

async function serve(request, env) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return env.ASSETS.fetch(request);
  const url = new URL(request.url);
  let path;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    return env.ASSETS.fetch(request);
  }
  const { paths, blobs } = load();
  const now = Date.now();
  const entry = paths.get(path);
  if (entry) {
    const version = effective(entry, now);
    if (!version) return env.ASSETS.fetch(request);
    const etag = `"${version.etag}"`;
    const headers = new Headers({ ...HEADERS, 'content-type': version.type, etag });
    const match = request.headers.get('if-none-match');
    if (match && match.split(',').some((tag) => tag.trim().replace(/^W\//, '') === etag)) return new Response(null, { status: 304, headers });
    const packed = blobs.subarray(version.off, version.off + version.len);
    const body = await new Response(new Response(packed).body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    if (body.byteLength !== version.size) throw new Error('kit schedule: unreadable');
    return new Response(request.method === 'HEAD' ? null : body, { status: 200, headers });
  }
  // A page that exists only from an instant answers Pages' own spellings once it is live: its .html name
  // and a trailing slash redirect to it, as Pages does for a static page.
  let target = null;
  if (path.endsWith('.html')) target = path === '/index.html' ? '/' : path.slice(0, -5);
  else if (path.length > 1 && path.endsWith('/')) target = path.slice(0, -1);
  const page = target === null ? null : paths.get(target);
  if (page && page.page && effective(page, now)) {
    return new Response(null, { status: 308, headers: { location: `${encodeURI(target)}${url.search}`, 'cache-control': 'no-store' } });
  }
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request, env) {
    try {
      return await serve(request, env);
    } catch {
      return env.ASSETS.fetch(request);
    }
  },
};
