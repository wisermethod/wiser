// The signed Pages release contract and the publisher layout catalog: their
// trust configuration, signature domains and closed schemas. No network access,
// and no file access but loadPagesTrust's bounded read of pages-trust.json beside
// this module. index.js reads the payload files, fetches the catalogs through
// ctx.fetchRelease, and hands their exact bytes here.
//
// A contract is a static release artifact naming a payload's layout, the
// publisher-approved worker fingerprint and the field names of its records. Its
// signature covers the exact contract bytes behind PAGES_RELEASE_DOMAIN, never a
// re-serialization. The keys that may sign one come only from pages-trust.json
// beside this module, which is Pages-only: release.json's Workers app keys are
// not consulted, and a payload never supplies a key, a trust file or a hash that
// stands in for the signature.
//
// A layout catalog is a publisher's signed list of the release layouts it has
// published: pairs of a release root's name and its assets path. The foreign
// deploy routes refuse a listed layout's assets, and pages.deploy requires its
// contract's own layout to be listed by its own publisher. A catalog approves no
// code and carries no hash. Its signature covers its exact bytes behind
// PAGES_LAYOUTS_DOMAIN, so neither it nor a contract or Workers signature
// verifies in another's place. pages-trust.json names, per publisher, the keys
// and the two HTTPS URLs its catalog and detached signature are read from, on a
// host the Pages module's release_hosts lists; the caller names none of them.
import { closeSync, constants as fsConstants, fstatSync, lstatSync, openSync, readSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { verifiedKeyId } from './signature.js';

export const PAGES_RELEASE_DOMAIN = Buffer.from('wiser.pages-release.v1\u0000', 'latin1');
export const PAGES_LAYOUTS_DOMAIN = Buffer.from('wiser.pages-layouts.v1\u0000', 'latin1');
export const CONTRACT_MAX_BYTES = 16 * 1024;
export const SIGNATURE_BYTES = 64;
export const CATALOG_MAX_BYTES = 64 * 1024;
export const CATALOG_MAX_LAYOUTS = 128;
// pages-trust.json's bound. Its closed shape at its limits (8 publishers, 8 keys
// each, two 512-character URLs each) is under 20 KiB even pretty-printed.
export const TRUST_MAX_BYTES = 64 * 1024;
const MAX_URL_CHARS = 512;
const URL_SEGMENT = /^[A-Za-z0-9._-]{1,128}$/;

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,40}[a-z0-9])?$/;
const KEY_ID = /^[0-9a-f]{16}$/;
const ED25519 = /^[A-Za-z0-9+/]{43}=$/;
const RELEASE = /^(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})$/;
const SEGMENT = /^[A-Za-z0-9._-]{1,64}$/;
const FIELD = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const RESERVED_FIELDS = new Set(['__proto__', 'constructor', 'prototype']);
const MODULE = /^[A-Za-z0-9._-]{1,128}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const KEY_NAME = /\.(pem|key|p12|pfx|jks|keystore)$|^id_(rsa|dsa|ecdsa|ed25519)/i;
const MAX_PATH_SEGMENTS = 8;
const MAX_PATH_CHARS = 256;
const MAX_PUBLISHERS = 8;
const MAX_KEYS = 8;
const MAX_MAGIC_BYTES = 16;
const MAX_DATA_VERSION = 2147483647;
// Record bounds: entries of the carried lists, and the length of each.
const MAX_LIST_ENTRIES = 100000;
const MAX_LIST_CHARS = 2048;
const MAX_RECORD_STRING = 256;

const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const closed = (v, keys) => object(v) && Object.keys(v).length === keys.length && keys.every((key) => Object.hasOwn(v, key));
const string = (v, pattern) => typeof v === 'string' && pattern.test(v);

// ---- Trust ------------------------------------------------------------------

// A trusted catalog URL: HTTPS on a listed host, no userinfo, port, query or
// fragment, already in canonical form, and a path of plain segments that does
// not end in a separator.
export function trustedCatalogUrl(value, hosts) {
  if (typeof value !== 'string' || value.length > MAX_URL_CHARS) return false;
  let url;
  try { url = new URL(value); } catch { return false; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash) return false;
  if (url.href !== value || !hosts.includes(url.hostname)) return false;
  const segments = url.pathname.split('/').slice(1);
  return segments.length >= 1 && segments.every((segment) => URL_SEGMENT.test(segment) && segment !== '.' && segment !== '..');
}

function validHosts(hosts) {
  return Array.isArray(hosts) && hosts.length >= 1 && hosts.every((host) => typeof host === 'string' && host.length > 0);
}

export function validPagesTrust(config, hosts) {
  if (!validHosts(hosts)) return false;
  if (!closed(config, ['format', 'purpose', 'publishers']) || config.format !== 1 || config.purpose !== 'cloudflare.pages.deploy') return false;
  if (!object(config.publishers)) return false;
  const labels = Object.keys(config.publishers);
  if (labels.length < 1 || labels.length > MAX_PUBLISHERS) return false;
  const ids = new Set();
  const urls = new Set();
  for (const label of labels) {
    const entry = config.publishers[label];
    if (!LABEL.test(label) || !closed(entry, ['keys', 'catalog', 'catalog_signature', 'catalog_sha256']) || !Array.isArray(entry.keys)
      || entry.keys.length < 1 || entry.keys.length > MAX_KEYS || !string(entry.catalog_sha256, SHA256_HEX)) return false;
    for (const url of [entry.catalog, entry.catalog_signature]) {
      if (!trustedCatalogUrl(url, hosts) || urls.has(url)) return false;
      urls.add(url);
    }
    for (const key of entry.keys) {
      if (!closed(key, ['id', 'ed25519']) || !string(key.id, KEY_ID) || !string(key.ed25519, ED25519)) return false;
      const raw = Buffer.from(key.ed25519, 'base64');
      if (raw.length !== 32 || raw.toString('base64') !== key.ed25519) return false;
      if (ids.has(key.id)) return false;
      ids.add(key.id);
    }
  }
  return true;
}

// pages-trust.json is read from disk afresh on every call, never imported as a
// JSON module: a module import is cached for the life of the process, so a file
// deleted, corrupted or narrowed after its first use would go on being trusted.
// The path is fixed beside this module and never an input. The file must be a
// regular file, not a symbolic link, and at most TRUST_MAX_BYTES; it is checked
// with lstat before it is opened, opened without following a link and without
// blocking (so a FIFO put in its place cannot hang the call), checked again on
// the open descriptor, and read into a buffer one byte larger than the bound.
// Every failure refuses that call, with the state named, and never the module
// load. The hosted service bundles this module with no file beside it and
// offers no Pages deploy action; were one called there, it would refuse as
// missing.
function readTrustFile() {
  let path;
  try {
    path = fileURLToPath(new URL('./pages-trust.json', import.meta.url));
  } catch {
    return { error: 'missing' };
  }
  let before;
  try {
    before = lstatSync(path);
  } catch (err) {
    return { error: err && (err.code === 'ENOENT' || err.code === 'ENOTDIR') ? 'missing' : 'unreadable' };
  }
  if (before.isSymbolicLink()) return { error: 'a symbolic link' };
  if (!before.isFile()) return { error: 'not a regular file' };
  if (before.size > TRUST_MAX_BYTES) return { error: 'too large' };
  let fd;
  try {
    fd = openSync(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW || 0) | (fsConstants.O_NONBLOCK || 0));
  } catch (err) {
    if (err && err.code === 'ENOENT') return { error: 'missing' };
    if (err && err.code === 'ELOOP') return { error: 'a symbolic link' };
    return { error: 'unreadable' };
  }
  try {
    const opened = fstatSync(fd);
    if (!opened.isFile()) return { error: 'not a regular file' };
    // Replaced between the lstat and the open.
    if (opened.dev !== before.dev || opened.ino !== before.ino) return { error: 'unreadable' };
    const buf = Buffer.alloc(TRUST_MAX_BYTES + 1);
    let offset = 0;
    while (offset < buf.length) {
      const n = readSync(fd, buf, offset, buf.length - offset, null);
      if (n <= 0) break;
      offset += n;
    }
    if (offset > TRUST_MAX_BYTES) return { error: 'too large' };
    return { bytes: buf.subarray(0, offset) };
  } catch {
    return { error: 'unreadable' };
  } finally {
    try { closeSync(fd); } catch { /* already closed */ }
  }
}

// The catalog hosts are the Pages module's own release_hosts in manifest.json,
// the same list the gateway's release fetcher enforces for this module; that
// installed declaration is the gateway's own bound and is imported as a JSON
// module, as worker-release.js imports it.
export async function loadPagesTrust() {
  const read = readTrustFile();
  if (read.error) return { error: read.error };
  let config;
  try {
    config = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(read.bytes));
  } catch {
    return { error: 'malformed' };
  }
  let hosts;
  try {
    hosts = (await import('./manifest.json', { with: { type: 'json' } })).default.modules.pages.release_hosts;
  } catch {
    return { error: 'malformed' };
  }
  if (!validPagesTrust(config, hosts)) return { error: 'malformed' };
  return { config };
}

// Tries each configured publisher's keys over the domain-prefixed exact bytes.
// Returns the publisher whose key verified, or null.
export async function verifyPagesContract(config, contractBytes, signature) {
  if (!Buffer.isBuffer(signature) || signature.length !== SIGNATURE_BYTES) return null;
  for (const label of Object.keys(config.publishers).sort()) {
    const keyId = await verifiedKeyId(config.publishers[label].keys, signature, contractBytes, PAGES_RELEASE_DOMAIN);
    if (keyId) return { publisher: label, keyId };
  }
  return null;
}

// ---- Contract schema --------------------------------------------------------

function reservedSegment(segment) {
  const lower = segment.toLowerCase();
  return lower === '.' || lower === '..' || lower === '.env' || lower.startsWith('.env.') || lower === '.git'
    || lower === '.ssh' || lower === '.gnupg' || lower === '.aws' || lower === 'node_modules' || lower === 'memory'
    || lower === 'agents.md' || lower === 'claude.md' || lower === 'zarchive' || KEY_NAME.test(segment);
}

// A relative path: 1 to 8 normal segments of plain ASCII, no '.', '..', empty
// segment, separator other than '/', or reserved name.
function relPath(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > MAX_PATH_CHARS) return null;
  const segments = value.split('/');
  if (segments.length > MAX_PATH_SEGMENTS) return null;
  for (const segment of segments) {
    if (!SEGMENT.test(segment) || reservedSegment(segment)) return null;
  }
  return segments;
}

// One file name, not hidden.
function fileName(value) {
  const segments = relPath(value);
  return segments && segments.length === 1 && !value.startsWith('.') ? value : null;
}

function field(value) {
  return string(value, FIELD) && !RESERVED_FIELDS.has(value) ? value : null;
}

const lowerParts = (segments) => segments.map((segment) => segment.toLowerCase());
function prefixOf(a, b) {
  return a.length <= b.length && a.every((segment, i) => segment === b[i]);
}
// Case-insensitive, so a case-insensitive filesystem cannot alias two roles.
function overlaps(a, b) {
  const x = lowerParts(a);
  const y = lowerParts(b);
  return prefixOf(x, y) || prefixOf(y, x);
}

export function parseContract(bytes) {
  let parsed;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return { error: 'release contract is not JSON' };
  }
  const bad = (what) => ({ error: `release contract is malformed: ${what}` });
  if (!closed(parsed, ['format', 'purpose', 'publisher', 'release', 'layout', 'worker', 'data', 'record'])) return bad('fields');
  if (parsed.format !== 1) return bad('format');
  if (parsed.purpose !== 'cloudflare.pages.deploy') return bad('purpose');
  if (!string(parsed.publisher, LABEL)) return bad('publisher');
  if (!string(parsed.release, RELEASE)) return bad('release');

  const layout = parsed.layout;
  if (!closed(layout, ['root_name', 'assets', 'identity', 'build', 'function'])) return bad('layout');
  if (!fileName(layout.root_name)) return bad('layout.root_name');
  const assets = relPath(layout.assets);
  if (!assets) return bad('layout.assets');
  if (!closed(layout.identity, ['path', 'version'])) return bad('layout.identity');
  const identity = relPath(layout.identity.path);
  if (!identity || !field(layout.identity.version)) return bad('layout.identity');
  if (!closed(layout.build, ['path', 'time'])) return bad('layout.build');
  const build = relPath(layout.build.path);
  if (!build || !field(layout.build.time)) return bad('layout.build');
  const fn = layout.function;
  if (!closed(fn, ['directory', 'worker', 'routes', 'data', 'record'])) return bad('layout.function');
  const fnDir = relPath(fn.directory);
  if (!fnDir) return bad('layout.function.directory');
  const roleNames = ['worker', 'routes', 'data', 'record'];
  for (const role of roleNames) {
    if (!fileName(fn[role])) return bad(`layout.function.${role}`);
  }
  if (new Set(roleNames.map((role) => fn[role].toLowerCase())).size !== roleNames.length) return bad('layout.function names repeat');
  const roots = [['assets', assets], ['function', fnDir], ['identity', identity], ['build', build]];
  for (let i = 0; i < roots.length; i += 1) {
    for (let j = i + 1; j < roots.length; j += 1) {
      if (overlaps(roots[i][1], roots[j][1])) return bad(`layout ${roots[i][0]} overlaps ${roots[j][0]}`);
    }
  }

  if (parsed.worker === null && parsed.data === null && parsed.record === null) {
    return { contract: parsed, segments: { assets, identity, build, function: fnDir }, magic: null };
  }

  const worker = parsed.worker;
  if (!closed(worker, ['sha256', 'module_name']) || !string(worker.sha256, SHA256_HEX)) return bad('worker');
  if (!string(worker.module_name, MODULE) || worker.module_name === 'metadata'
    || worker.module_name.toLowerCase() === fn.data.toLowerCase()) return bad('worker.module_name');

  const data = parsed.data;
  if (!closed(data, ['magic', 'container', 'version_field', 'version'])) return bad('data');
  if (typeof data.magic !== 'string' || data.magic.length === 0 || !BASE64.test(data.magic)) return bad('data.magic');
  const magic = Buffer.from(data.magic, 'base64');
  if (magic.length < 1 || magic.length > MAX_MAGIC_BYTES || magic.toString('base64') !== data.magic) return bad('data.magic');
  if (data.container !== 'u32be-json') return bad('data.container');
  if (!field(data.version_field)) return bad('data.version_field');
  if (!Number.isSafeInteger(data.version) || data.version < 0 || data.version > MAX_DATA_VERSION) return bad('data.version');

  const record = parsed.record;
  if (!closed(record, ['version', 'time', 'hashes', 'carried', 'not_carried', 'paths'])) return bad('record');
  if (!closed(record.hashes, ['worker', 'routes', 'data'])) return bad('record.hashes');
  const names = [record.version, record.time, record.hashes.worker, record.hashes.routes, record.hashes.data,
    record.carried, record.not_carried, record.paths];
  if (!names.every((name) => field(name))) return bad('record field name');
  if (new Set(names).size !== names.length) return bad('record field names repeat');

  return {
    contract: parsed,
    segments: { assets, identity, build, function: fnDir },
    magic,
  };
}

// ---- Layout catalog -----------------------------------------------------------

// The closed catalog schema: format 1, purpose cloudflare.pages.layouts, the
// publisher label it was fetched for, and 1 to 128 layouts, each exactly a root
// name (one plain segment) and an assets path (the contract's path vocabulary).
// No two layouts may repeat or overlap under the same root name, in any letter
// case. Returns { layouts } with each assets path's segments, or { error }.
export function parseLayoutCatalog(bytes, publisher) {
  let parsed;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return { error: 'not JSON' };
  }
  if (!closed(parsed, ['format', 'purpose', 'publisher', 'layouts'])) return { error: 'fields' };
  if (parsed.format !== 1) return { error: 'format' };
  if (parsed.purpose !== 'cloudflare.pages.layouts') return { error: 'purpose' };
  if (parsed.publisher !== publisher) return { error: 'publisher' };
  if (!Array.isArray(parsed.layouts) || parsed.layouts.length < 1 || parsed.layouts.length > CATALOG_MAX_LAYOUTS) return { error: 'layouts' };
  const layouts = [];
  for (let i = 0; i < parsed.layouts.length; i += 1) {
    const entry = parsed.layouts[i];
    if (!closed(entry, ['root_name', 'assets'])) return { error: `layouts[${i}]` };
    if (!fileName(entry.root_name)) return { error: `layouts[${i}].root_name` };
    const assets = relPath(entry.assets);
    if (!assets) return { error: `layouts[${i}].assets` };
    const root = entry.root_name.toLowerCase();
    if (layouts.some((other) => other.root_name.toLowerCase() === root && overlaps(other.segments, assets))) {
      return { error: 'layouts repeat or overlap' };
    }
    layouts.push({ root_name: entry.root_name, assets: entry.assets, segments: assets });
  }
  return { layouts };
}

// Only this publisher's keys, over the catalog's exact bytes behind the catalog
// domain. Returns the key id that verified, or null.
export async function verifyLayoutCatalog(keys, catalogBytes, signature) {
  if (!Buffer.isBuffer(signature) || signature.length !== SIGNATURE_BYTES) return null;
  return verifiedKeyId(keys, signature, catalogBytes, PAGES_LAYOUTS_DOMAIN);
}

// True when the canonical directory's segments place it at a listed layout's
// assets or below them: some segment is the layout's root name and the segments
// after it start with the assets path. Letter case is ignored, so a
// case-insensitive filesystem's alias is caught too.
export function layoutHolds(dirSegments, layout) {
  const lower = lowerParts(dirSegments);
  const root = layout.root_name.toLowerCase();
  const assets = lowerParts(layout.segments);
  for (let i = 0; i + assets.length < lower.length; i += 1) {
    if (lower[i] === root && assets.every((segment, k) => lower[i + 1 + k] === segment)) return true;
  }
  return false;
}

// The lowercase first segment of every role, which a contract or signature file
// sitting in the release root must not take.
export function rootRoleNames(parsed) {
  return new Set(Object.values(parsed.segments).map((segments) => segments[0].toLowerCase()));
}

// ---- Records ----------------------------------------------------------------

function decodeJson(bytes) {
  try {
    return { value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) };
  } catch {
    return null;
  }
}

// A top-level string field of an identity or build record. null when the file
// is not a JSON object or the field is not a string.
export function recordString(bytes, name) {
  const decoded = decodeJson(bytes);
  if (!decoded || !object(decoded.value) || typeof decoded.value[name] !== 'string') return null;
  return decoded.value[name];
}

function stringList(value) {
  return Array.isArray(value) && value.length <= MAX_LIST_ENTRIES
    && value.every((item) => typeof item === 'string' && [...item].length <= MAX_LIST_CHARS);
}

// The Function record: exactly the eight signed field names.
export function parseFunctionRecord(bytes, contract, name) {
  const decoded = decodeJson(bytes);
  if (!decoded) return { error: `${name} is not JSON` };
  const value = decoded.value;
  if (!object(value)) return { error: `${name} is not an object` };
  const r = contract.record;
  const keys = [r.version, r.time, r.hashes.worker, r.hashes.routes, r.hashes.data, r.carried, r.not_carried, r.paths];
  if (!closed(value, keys)) return { error: `${name} is not the signed record` };
  if (typeof value[r.version] !== 'string' || value[r.version].length === 0 || value[r.version].length > MAX_RECORD_STRING) {
    return { error: `${name} ${r.version} is not a string` };
  }
  if (typeof value[r.time] !== 'string' || value[r.time].length > MAX_RECORD_STRING) return { error: `${name} ${r.time} is not a string` };
  for (const key of [r.hashes.worker, r.hashes.routes, r.hashes.data]) {
    if (!string(value[key], SHA256_HEX)) return { error: `${name} ${key} is not a sha256` };
  }
  for (const key of [r.carried, r.not_carried]) {
    if (!stringList(value[key])) return { error: `${name} ${key} is not an array of strings` };
  }
  if (!Number.isSafeInteger(value[r.paths]) || value[r.paths] < 0) return { error: `${name} ${r.paths} is not a count` };
  return {
    record: {
      version: value[r.version],
      time: value[r.time],
      worker: value[r.hashes.worker],
      routes: value[r.hashes.routes],
      data: value[r.hashes.data],
      carried: value[r.carried],
      notCarried: value[r.not_carried],
    },
  };
}

// The data container: the signed magic, a big-endian u32 length, that many bytes
// of UTF-8 JSON whose signed version field equals the signed version. Every
// other byte is data and is not interpreted.
export function screenData(bytes, contract, magic, name) {
  if (bytes.length < magic.length || !bytes.subarray(0, magic.length).equals(magic)) {
    return { error: `${name} does not start with the signed magic` };
  }
  if (bytes.length < magic.length + 4) return { error: `${name} header does not parse` };
  const length = bytes.readUInt32BE(magic.length);
  const start = magic.length + 4;
  if (length > bytes.length - start) return { error: `${name} header does not parse` };
  const decoded = decodeJson(bytes.subarray(start, start + length));
  if (!decoded) return { error: `${name} header does not parse` };
  const field = contract.data.version_field;
  if (!object(decoded.value) || decoded.value[field] !== contract.data.version) {
    return { error: `${name} header ${field} is not ${contract.data.version}` };
  }
  return { ok: true };
}
