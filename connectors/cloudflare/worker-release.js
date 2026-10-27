import { createHash, randomUUID, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

const APP = /^[a-z0-9](?:[a-z0-9-]{0,40}[a-z0-9])?$/;
const VERSION = /^(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})$/;
const HASH = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const VAR_NAME = /^[A-Z][A-Z0-9_]{0,63}$/;
const SECRET_NAME = /(?:^|_)(?:SECRET|TOKEN|PASSWORD|PASSWD|KEY|CREDENTIALS?|AUTHORIZATION)(?:_|$)/;
const plainName = (name) => string(name, VAR_NAME) && !SECRET_NAME.test(name);
const MODULE_TYPES = { '.js': 'application/javascript+module', '.mjs': 'application/javascript+module',
  '.cjs': 'application/javascript', '.wasm': 'application/wasm', '.txt': 'text/plain',
  '.html': 'text/plain', '.bin': 'application/octet-stream' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const BINDING = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
// Reserve space before the first vendor call for a completion JWT not yet issued.
// A larger token is an invalid vendor response, never a reason to exceed the cap.
const TOKEN_BYTES = 16384;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const string = (v, pattern) => typeof v === 'string' && pattern.test(v);
const shape = (v, required, optional = []) => object(v)
  && required.every((key) => Object.hasOwn(v, key))
  && Object.keys(v).every((key) => required.includes(key) || optional.includes(key));
// Format 2 fixes both the field set and its serialization order.
const orderedShape = (v, keys) => shape(v, keys) && keys.every((key, i) => Object.keys(v)[i] === key);
const before = (reason, extra = {}) => ({ status: 'invalid_arguments', field: 'release', reason, stage: 'before upload', ...extra });
const bodyBytes = (form) => 4 * Math.ceil(form.body.length / 3);

function safePath(value, absolute) {
  if (typeof value !== 'string' || value.length > 512 || !value.length) return false;
  if (absolute !== value.startsWith('/')) return false;
  const path = absolute ? value.slice(1) : value;
  return /^[A-Za-z0-9_./-]+$/.test(path) && !path.includes('..')
    && path.split('/').every((part) => part.length > 0 && part !== '.');
}
function date(value) {
  return string(value, /^\d{4}-\d{2}-\d{2}$/)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function mime(value) {
  return string(value, /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+(?:; charset=[A-Za-z0-9_-]+)?$/) && value.length <= 128;
}

// Shared by the materializer and the runtime. No network or writes at import.
export function validReleaseConfig(config, hosts) {
  if (!shape(config, ['format', 'base', 'apps']) || config.format !== 1 || typeof config.base !== 'string') return false;
  let base;
  try { base = new URL(config.base); } catch { return false; }
  if (base.protocol !== 'https:' || base.username || base.password || base.port || base.search || base.hash
    || base.href !== config.base || !base.pathname.endsWith('/')
    || (base.pathname !== '/' && !safePath(base.pathname.slice(0, -1), true))
    || !Array.isArray(hosts) || !hosts.includes(base.hostname)) return false;
  if (!object(config.apps) || Object.keys(config.apps).length < 1 || Object.keys(config.apps).length > 100) return false;
  return Object.entries(config.apps).every(([app, entry]) => APP.test(app)
    && shape(entry, ['keys']) && Array.isArray(entry.keys) && entry.keys.length > 0 && entry.keys.length <= 8
    && new Set(entry.keys.map((key) => key?.id)).size === entry.keys.length
    && entry.keys.every((key) => shape(key, ['id', 'ed25519']) && string(key.id, /^[0-9a-f]{16}$/)
      && string(key.ed25519, /^[A-Za-z0-9+/]{43}=$/) && Buffer.from(key.ed25519, 'base64').length === 32
      && Buffer.from(key.ed25519, 'base64').toString('base64') === key.ed25519));
}
function releaseConfig() {
  let config;
  try { config = JSON.parse(readFileSync(new URL('./release.json', import.meta.url), 'utf8')); }
  catch (err) { return { error: before(`release.json is ${err.code === 'ENOENT' ? 'missing' : 'malformed'}`) }; }
  let hosts;
  try { hosts = JSON.parse(readFileSync(new URL('./manifest.json', import.meta.url), 'utf8')).modules.workers.release_hosts; }
  catch { return { error: before('release.json base host is not in release_hosts') }; }
  if (!validReleaseConfig(config, hosts)) return { error: before('release.json is malformed or its base host is not in release_hosts') };
  return { config };
}

function assetsConfig(config) {
  return orderedShape(config, ['html_handling', 'not_found_handling', 'run_worker_first'])
    && ['auto-trailing-slash', 'force-trailing-slash', 'drop-trailing-slash', 'none'].includes(config.html_handling)
    && ['none', '404-page', 'single-page-application'].includes(config.not_found_handling)
    && config.run_worker_first === true;
}
function checkedManifest(manifest, input) {
  if (!orderedShape(manifest, ['format', 'app', 'version', 'created', 'source', 'checks', 'worker', 'assets', 'migrations']) || manifest.format !== 2) return { error: before('release manifest malformed') };
  if (manifest.app !== input.app || manifest.version !== input.version) return { error: before('release names another version') };
  if (!string(manifest.app, APP) || !string(manifest.version, VERSION)
    || !string(manifest.created, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/) || !Number.isFinite(Date.parse(manifest.created))
    || new Date(manifest.created).toISOString().slice(0, 19) !== manifest.created.slice(0, 19)) return { error: before('release manifest malformed') };
  const s = manifest.source;
  if (!orderedShape(s, ['repository', 'commit', 'upstream_commit', 'f1']) || s.repository !== 'wisermethod/wiser-crm'
    || !string(s.commit, COMMIT) || !string(s.upstream_commit, COMMIT)
    || !orderedShape(s.f1, ['count', 'limit']) || !Number.isSafeInteger(s.f1.count) || s.f1.count < 0
    || !Number.isSafeInteger(s.f1.limit) || s.f1.limit < 0 || s.f1.count > s.f1.limit) return { error: before('release source malformed') };
  if (!orderedShape(manifest.checks, ['lockfile', 'install_log', 'bundle_inputs'])
    || !Object.values(manifest.checks).every((value) => value === 'PASS')) return { error: before('release checks malformed') };
  const w = manifest.worker;
  if (!orderedShape(w, ['main_module', 'compatibility_date', 'compatibility_flags', 'd1_binding', 'assets_binding', 'vars_required', 'modules'])
    || !safePath(w.main_module, false) || !date(w.compatibility_date)
    || !Array.isArray(w.compatibility_flags) || w.compatibility_flags.length > 100
    || !w.compatibility_flags.every((flag) => string(flag, /^[a-z][a-z0-9_]{0,127}$/))
    || new Set(w.compatibility_flags).size !== w.compatibility_flags.length
    || !string(w.d1_binding, BINDING) || !string(w.assets_binding, BINDING) || w.d1_binding === w.assets_binding
    || !Array.isArray(w.vars_required) || !w.vars_required.every(plainName)
    || new Set(w.vars_required).size !== w.vars_required.length
    || w.vars_required.includes(w.d1_binding) || w.vars_required.includes(w.assets_binding)
    || !Array.isArray(w.modules) || !w.modules.length || w.modules.length > 50) return { error: before('release worker malformed') };
  const a = manifest.assets;
  if (!orderedShape(a, ['config', 'files']) || !assetsConfig(a.config) || !Array.isArray(a.files) || a.files.length > 20000) return { error: before('release assets malformed') };
  const m = manifest.migrations;
  if (!orderedShape(m, ['table', 'files']) || !string(m.table, /^[A-Za-z_][A-Za-z0-9_]*$/)
    || !Array.isArray(m.files)) return { error: before('release migrations malformed') };
  const modules = new Set();
  const paths = new Set();
  const migrations = new Set();
  const files = new Map();
  let total = 0;
  for (const [items, kind] of [[w.modules, 'module'], [a.files, 'asset'], [m.files, 'migration']]) {
    for (const file of items) {
      const keys = kind === 'module' ? ['name', 'type', 'sha256', 'size']
        : kind === 'asset' ? ['path', 'sha256', 'size', 'content_type'] : ['name', 'sha256', 'size'];
      if (!orderedShape(file, keys) || !string(file.sha256, HASH) || !Number.isSafeInteger(file.size)
        || file.size < 0 || file.size > MAX_FILE_BYTES) return { error: before(`release ${kind} malformed`) };
      if (kind === 'module') {
        if (!safePath(file.name, false) || file.name === 'metadata' || modules.has(file.name)
          || !Object.hasOwn(MODULE_TYPES, extname(file.name)) || MODULE_TYPES[extname(file.name)] !== file.type) return { error: before('release module malformed') };
        modules.add(file.name);
      } else if (kind === 'asset') {
        if (!safePath(file.path, true) || paths.has(file.path) || !mime(file.content_type)) return { error: before('release asset malformed') };
        paths.add(file.path);
      } else {
        if (!safePath(file.name, false) || !/^\d+_[A-Za-z0-9_-]+\.sql$/.test(file.name)
          || migrations.has(file.name)) return { error: before('release migration malformed') };
        migrations.add(file.name);
      }
      total += file.size;
      if (total > MAX_TOTAL_BYTES) return { error: before('release exceeds 64 MiB total') };
      if (files.has(file.sha256) && files.get(file.sha256).size !== file.size) return { error: before('release hash has inconsistent sizes') };
      files.set(file.sha256, file);
    }
  }
  if (!modules.has(w.main_module)) return { error: before('release main module missing') };
  return { files: [...files.values()] };
}
function varsShape(vars) {
  return object(vars) && [Object.prototype, null].includes(Object.getPrototypeOf(vars))
    && Object.entries(vars).every(([name, value]) => plainName(name) && typeof value === 'string' && [...value].length <= 512);
}

async function loadManifest(input, ctx) {
  const loaded = releaseConfig();
  if (loaded.error) return { error: loaded.error };
  const config = loaded.config;
  if (!Object.hasOwn(config.apps, input.app)) return { error: before('release app is not listed') };
  const fetched = [];
  const calls = [];
  const prefix = `${input.app}/${input.version}/`;
  async function fetchFile(path, maxBytes, hash) {
    fetched.push(path);
    try { return await ctx.fetchRelease(config.base + path, { maxBytes }); }
    catch (err) {
      if (!err?.object) throw err;
      if (hash && ['release content-length exceeds maxBytes', 'release body exceeds maxBytes'].includes(err.object.reason)) {
        return { error: before(`release file mismatch: ${hash}`, { fetched, calls }) };
      }
      return { error: { status: err.object.status, reason: 'release fetch refused',
        ...(Number.isInteger(err.object.http_status) ? { http_status: err.object.http_status } : {}), stage: 'before upload', fetched, calls } };
    }
  }
  const raw = await fetchFile(prefix + 'manifest.json', 1024 * 1024);
  if (raw.error) return { error: raw.error };
  const sig = await fetchFile(prefix + 'manifest.sig', 64);
  if (sig.error) return { error: sig.error };
  let keyId;
  for (const key of config.apps[input.app].keys) {
    const publicKey = await webcrypto.subtle.importKey('raw', Buffer.from(key.ed25519, 'base64'), { name: 'Ed25519' }, false, ['verify']);
    if (sig.bytes.length === 64 && await webcrypto.subtle.verify('Ed25519', publicKey, sig.bytes, raw.bytes)) { keyId = key.id; break; }
  }
  if (!keyId) return { error: before('release signature invalid', { fetched, calls }) };
  let manifest;
  try { manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw.bytes)); }
  catch { return { error: before('release manifest malformed', { fetched, calls }) }; }
  const checked = checkedManifest(manifest, input);
  if (checked.error) return { error: { ...checked.error, fetched, calls } };
  return { fetched, calls, prefix, fetchFile, raw, keyId, manifest, checked };
}

function endpoint(input, tail = '') {
  return `/accounts/${input.account_id}/workers${input.script_name ? `/scripts/${input.script_name}` : ''}${tail}`;
}
function short(path) { return path.replace(/^\/accounts\/[^/]+/, ''); }
function vendor(req, status) {
  return { status: 'vendor_error', method: req.method, endpoint: short(req.endpoint), ...(Number.isInteger(status) ? { http_status: status } : {}) };
}
// Nothing copied from the response or exception besides the numeric status/code.
// In particular a provider's diagnostic can echo the Authorization or metadata JWT.
async function call(ctx, req, calls = []) {
  calls.push({ method: req.method, endpoint: short(req.endpoint), body_bytes: req.binary_body ? req.binary_body.base64.length : req.body ? Buffer.byteLength(JSON.stringify(req.body)) : 0 });
  let res;
  try { res = await ctx.proxy(req); }
  catch (err) {
    if (!err?.object) throw err;
    return { error: vendor(req, err.object.http_status), codes: err.object.provider_codes };
  }
  if (res?.status >= 400) return { error: vendor(req, res.status), codes: res.error?.provider_codes };
  const data = Object.hasOwn(res || {}, 'data') ? res.data : res;
  if (!object(data) || data.success !== true) return { error: vendor(req), codes: data?.errors?.map((e) => e.code) };
  return { result: data.result, info: data.result_info };
}
function noSubdomain(reply) {
  // Workers errors documents 10007, and Wrangler's getWorkersDevSubdomain uses
  // that code. 403 is always a permission failure, even with this code.
  return reply.error && reply.error.http_status !== 403
    && (reply.error.http_status === 404 || (reply.codes?.length === 1 && reply.codes[0] === 10007));
}
async function subdomain(input, ctx, calls) {
  const reply = await call(ctx, { endpoint: endpoint({ account_id: input.account_id }, '/subdomain'), method: 'GET' }, calls);
  if (noSubdomain(reply)) return { exists: false, subdomain: null };
  if (reply.error) return reply.error;
  if (!string(reply.result?.subdomain, LABEL)) return vendor({ endpoint: endpoint({ account_id: input.account_id }, '/subdomain'), method: 'GET' });
  return { exists: true, subdomain: reply.result.subdomain };
}
function bindings(value = []) {
  if (!Array.isArray(value)) return null;
  const out = [];
  for (const binding of value) {
    if (!object(binding) || typeof binding.name !== 'string' || typeof binding.type !== 'string') return null;
    const item = { name: binding.name, type: binding.type };
    if (binding.type === 'd1' && string(binding.database_id ?? binding.id, UUID)) item.database_id = binding.database_id ?? binding.id;
    out.push(item);
  }
  return out;
}
async function getWorker(input, ctx) {
  const req = { endpoint: endpoint(input, '/deployments'), method: 'GET' };
  const reply = await call(ctx, req);
  if (reply.error) return reply.error.http_status === 404 ? { exists: false } : reply.error;
  const deployments = reply.result?.deployments;
  if (!Array.isArray(deployments)) return vendor(req);
  if (!deployments.length) {
    const settingsReq = { endpoint: endpoint(input, '/settings'), method: 'GET' };
    const settings = await call(ctx, settingsReq);
    if (settings.error) return settings.error.http_status === 404 ? { exists: false } : settings.error;
    const names = bindings(settings.result?.bindings);
    return names ? { exists: true, version_id: null, bindings: names } : vendor(settingsReq);
  }
  const active = deployments[0].versions;
  if (!Array.isArray(active) || !active.length || active.length > 100) return vendor(req);
  const versions = [];
  for (const version of active) {
    if (!string(version.version_id, UUID) || !Number.isFinite(version.percentage)
      || version.percentage < 0 || version.percentage > 100) return vendor(req);
    const versionReq = { endpoint: endpoint(input, `/versions/${version.version_id}`), method: 'GET' };
    const detail = await call(ctx, versionReq);
    if (detail.error) return detail.error.http_status === 404 ? { exists: false } : detail.error;
    const names = bindings(detail.result?.resources?.bindings);
    if (!names) return vendor(versionReq);
    versions.push({ version_id: version.version_id, percentage: version.percentage, bindings: names });
  }
  // Only one version at 100 percent is a usable pre-upgrade rollback target.
  const single = singleDeployedVersion(versions);
  return { exists: true, version_id: single,
    bindings: single ? versions[0].bindings : [], ...(!single ? { versions,
      reason: 'live deployment has no single version at 100 percent; record no rollback target' } : {}) };
}

function singleDeployedVersion(versions) {
  return Array.isArray(versions) && versions.length === 1
    && string(versions[0]?.version_id, UUID) && versions[0].percentage === 100
    ? versions[0].version_id : null;
}

async function listVersions(input, ctx) {
  const versions = [];
  const seen = new Set();
  for (let page = 1; page <= 1000; page++) {
    const req = { endpoint: endpoint(input, '/versions'), method: 'GET', parameters: [
      { name: 'page', value: String(page), type: 'query' }, { name: 'per_page', value: '100', type: 'query' }] };
    const reply = await call(ctx, req);
    if (reply.error) return reply.error;
    const items = reply.result?.items;
    if (!Array.isArray(items) || items.length > 100) return vendor(req);
    for (const item of items) {
      const time = item?.metadata?.created_on;
      if (!string(item?.id, UUID) || seen.has(item.id) || typeof time !== 'string'
        || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(time) || !Number.isFinite(Date.parse(time))) return vendor(req);
      seen.add(item.id);
      versions.push({ id: item.id, created_on: time });
    }
    if (items.length < 100) return { versions };
  }
  return { status: 'vendor_error', reason: 'version listing incomplete' };
}

// Read by hostname without a service filter: otherwise another Worker's domain
// would look absent. A malformed or incomplete listing never authorizes a write.
async function findDomain(input, ctx) {
  const req = { endpoint: endpoint({ account_id: input.account_id }, '/domains'), method: 'GET',
    parameters: [{ name: 'hostname', value: input.hostname.toLowerCase(), type: 'query' }] };
  const reply = await call(ctx, req);
  if (reply.error) return { error: reply.error };
  if (!Array.isArray(reply.result) || reply.result.length > 1
    || (reply.info?.total_pages !== undefined && reply.info.total_pages !== 1 && reply.info.total_pages !== 0)) return { error: vendor(req) };
  if (!reply.result.length) return { domain: null };
  const domain = reply.result[0];
  if (!object(domain) || !string(domain.id, /^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/)
    || typeof domain.hostname !== 'string' || domain.hostname.toLowerCase() !== input.hostname.toLowerCase()
    || typeof domain.service !== 'string') return { error: vendor(req) };
  return { domain };
}
const domainOwner = (domain, input) => domain.service === input.script_name
  && (!domain.environment || domain.environment === 'production');
const refused = (reason) => ({ status: 'invalid_arguments', reason });


// Wrangler 4.93.1: lexical names first, then a stable numeric-prefix sort.
// Keep the comparison (rather than subtraction) even for very large prefixes.
const migrationOrder = (files) => [...files].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
  .sort((a, b) => {
    const left = parseInt(a.name.split('_')[0]);
    const right = parseInt(b.name.split('_')[0]);
    return left < right ? -1 : left > right ? 1 : 0;
  });
const historyDDL = (table) => `CREATE TABLE IF NOT EXISTS ${table}(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);`;
const recordMigration = (table, name) => `INSERT INTO ${table} (name)\nvalues ('${name.replaceAll("'", "''")}');`;
const d1Path = (input, id = input.database_id) => `/accounts/${input.account_id}/d1/database${id ? `/${id}` : ''}`;
const sqlString = (value) => `'${value.replaceAll("'", "''")}'`;
// Time Travel's documented bookmark spelling. Never return arbitrary vendor text.
const BOOKMARK = /^[0-9a-f]{8}-[0-9a-f]{8}-[0-9a-f]{8}-[0-9a-f]{32}$/;
const BOOKMARK_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const DAY_MS = 24 * 60 * 60 * 1000;

async function d1Bookmark(input, ctx) {
  const req = { endpoint: d1Path(input) + '/time_travel/bookmark', method: 'GET' };
  // The API (and Wrangler's info command) returns no timestamp. This is the
  // local request-start checkpoint, not a server-verified bookmark timestamp.
  const bookmark_time = new Date().toISOString();
  const reply = await d1Call(ctx, req);
  if (reply.error) return reply.error;
  return string(reply.result?.bookmark, BOOKMARK)
    ? { bookmark: reply.result.bookmark, bookmark_time } : vendor(req);
}

async function d1Restore(input, ctx) {
  const time = Date.parse(input.bookmark_time);
  if (!string(input.bookmark_time, BOOKMARK_TIME) || !Number.isFinite(time)
    || new Date(time).toISOString().slice(0, 19) !== input.bookmark_time.slice(0, 19)) {
    return { ...refused('bookmark_time must be a valid UTC date-time ending in Z, with at most millisecond precision'), field: 'bookmark_time' };
  }
  const age = (Date.now() - time) / DAY_MS;
  if (age < 0) return { ...refused('bookmark_time is in the future'), field: 'bookmark_time' };
  // Check both the supplied account plan and the API ceiling before transport.
  if (age > input.window_days || age > 30) {
    return { ...refused(`bookmark age ${age.toFixed(6)} days exceeds the ${input.window_days}-day account window or the API's 30-day limit`),
      field: 'bookmark_time', age_days: age };
  }
  // Resolve this checked time at Cloudflare, as Wrangler does. A caller-supplied
  // fresh timestamp must never authorize restoring a different bookmark.
  const lookup = { endpoint: d1Path(input) + '/time_travel/bookmark', method: 'GET',
    parameters: [{ name: 'timestamp', value: input.bookmark_time, type: 'query' }] };
  const resolved = await d1Call(ctx, lookup);
  if (resolved.error) return resolved.error;
  const bookmark = resolved.result?.bookmark;
  if (!string(bookmark, BOOKMARK)) return vendor(lookup);
  if (bookmark !== input.bookmark) return { ...refused('bookmark does not match the bookmark Cloudflare returned for bookmark_time'), field: 'bookmark' };
  const req = { endpoint: d1Path(input) + '/time_travel/restore', method: 'POST',
    parameters: [{ name: 'bookmark', value: bookmark, type: 'query' }] };
  const reply = await d1Call(ctx, req);
  if (reply.error) return reply.error;
  if (!string(reply.result?.bookmark, BOOKMARK) || !string(reply.result?.previous_bookmark, BOOKMARK)) {
    return { ...vendor(req), reason: 'restore submitted; new and previous bookmarks not both available' };
  }
  return { bookmark: reply.result.bookmark, previous_bookmark: reply.result.previous_bookmark };
}

async function rollback(input, ctx) {
  const req = { endpoint: endpoint(input, '/deployments'), method: 'POST',
    body: { strategy: 'percentage', versions: [{ version_id: input.version_id, percentage: 100 }] } };
  const reply = await d1Call(ctx, req);
  if (reply.error) return reply.error;
  const read = { endpoint: req.endpoint, method: 'GET' };
  const after = await d1Call(ctx, read);
  if (after.error) return { ...after.error, reason: 'rollback submitted; active deployment read-back failed' };
  const version = singleDeployedVersion(after.result?.deployments?.[0]?.versions);
  if (!version || version !== input.version_id) {
    return { ...vendor(read), reason: 'rollback submitted; recorded version is not the single live version at 100 percent' };
  }
  return { version_id: version };
}

// Neither an exception, a SQL diagnostic nor a returned row is an answer.
async function d1Call(ctx, req) {
  try { return await call(ctx, req); }
  catch { return { error: vendor(req) }; }
}
async function d1Query(input, ctx, sql, id = input.database_id) {
  const req = { endpoint: d1Path(input, id) + '/query', method: 'POST', body: { sql } };
  const reply = await d1Call(ctx, req);
  if (reply.error) return reply;
  if (!Array.isArray(reply.result) || !reply.result.length) return { error: vendor(req) };
  const rows = reply.result.flat();
  for (let index = 0; index < rows.length; index++) {
    if (rows[index]?.success === false) return { error: { ...vendor(req), reason: 'statement failed', statement_index: index } };
    if (!object(rows[index]) || rows[index].success !== true) return { error: vendor(req) };
  }
  return { rows };
}
async function d1Select(input, ctx, sql, id = input.database_id) {
  const reply = await d1Query(input, ctx, sql, id);
  if (reply.error) return reply;
  if (reply.rows.length !== 1 || !Array.isArray(reply.rows[0].results)
    || !reply.rows[0].results.every(object)) {
    return { error: vendor({ endpoint: d1Path(input, id) + '/query', method: 'POST' }) };
  }
  return { rows: reply.rows[0].results };
}

async function loadMigrations(input, ctx, maxBytes) {
  const loaded = await loadManifest(input, ctx);
  if (loaded.error) return loaded;
  const { manifest, prefix, fetchFile, fetched, calls } = loaded;
  const files = [];
  const content = new Map();
  for (const file of manifest.migrations.files) {
    if (!content.has(file.sha256)) {
      const reply = await fetchFile(prefix + `files/${file.sha256}`, Math.max(1, file.size), file.sha256);
      if (reply.error) return { error: reply.error };
      const bytes = Buffer.from(reply.bytes);
      if (bytes.length !== file.size || sha256(bytes) !== file.sha256) {
        return { error: before(`release file mismatch: ${file.sha256}`, { fetched, calls }) };
      }
      let text;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
      catch { return { error: before('release migration is not UTF-8') }; }
      content.set(file.sha256, text);
    }
    const text = content.get(file.sha256);
    const sql = `${text}\n${recordMigration(manifest.migrations.table, file.name)}`;
    if (Buffer.byteLength(JSON.stringify({ sql })) > maxBytes) return { error: before('migration query exceeds proxy request limit') };
    files.push({ name: file.name, text, sql });
  }
  return { table: manifest.migrations.table, files: migrationOrder(files) };
}

async function migrate(input, ctx, maxBytes) {
  const loaded = await loadMigrations(input, ctx, maxBytes);
  if (loaded.error) return loaded.error;
  const { table, files } = loaded;
  const applied = [], skipped = [], ignored = [];
  const report = { database_id: input.database_id, table, applied, skipped, ignored };
  const created = await d1Query(input, ctx, historyDDL(table));
  if (created.error) return { ...created.error, ...report };
  const history = await d1Select(input, ctx, `SELECT name FROM ${table} ORDER BY id`);
  if (history.error) return { ...history.error, ...report };
  if (history.rows.some((row) => typeof row.name !== 'string')) return { ...vendor({ endpoint: d1Path(input) + '/query', method: 'POST' }), ...report };
  const names = new Set(history.rows.map(({ name }) => name));
  for (const name of names) {
    if (!files.some((file) => file.name === name)) {
      // History is member data: a non-filename cannot echo SQL or a diagnostic.
      ignored.push(/^[A-Za-z0-9_.-]{1,512}\.sql$/.test(name) ? name : { withheld: true, sha256: sha256(Buffer.from(name)) });
    }
  }
  for (const file of files) {
    if (names.has(file.name)) { skipped.push(file.name); continue; }
    const result = await d1Query(input, ctx, file.sql);
    if (result.error) return { ...result.error, ...report, file: file.name };
    applied.push(file.name);
  }
  return report;
}

// List by generated name, not by a caller-provided target. A short page proves
// the search complete; total_count is account-wide even with a name filter.
async function temporaryByName(input, ctx, name) {
  const found = [];
  for (let page = 1; page <= 1000; page++) {
    const req = { endpoint: d1Path(input, null), method: 'GET', parameters: [
      { name: 'name', value: name, type: 'query' },
      { name: 'page', value: String(page), type: 'query' },
      { name: 'per_page', value: '100', type: 'query' },
    ] };
    const reply = await d1Call(ctx, req);
    if (reply.error) return reply;
    if (!Array.isArray(reply.result) || reply.result.length > 100
      || reply.result.some((db) => !object(db) || typeof db.name !== 'string' || !string(db.uuid, UUID))) return { error: vendor(req) };
    found.push(...reply.result.filter((db) => db.name === name).map((db) => ({ name, uuid: db.uuid })));
    if (reply.result.length < 100) return { databases: found };
  }
  return { error: { status: 'vendor_error', reason: 'temporary database listing incomplete' } };
}
async function deleteTemporary(input, ctx, name, id) {
  const failed = { name, deleted: false, read_back: 'unconfirmed' };
  if (!id) {
    const found = await temporaryByName(input, ctx, name);
    if (found.error) return failed;
    if (!found.databases.length) return { name, deleted: true, read_back: 'absent' };
    if (found.databases.length !== 1) return failed;
    id = found.databases[0].uuid;
  }
  if (id === input.database_id) return failed;
  // Verify ownership before deletion, then absence both by id and by name.
  const req = { endpoint: d1Path(input, id), method: 'GET' };
  const current = await d1Call(ctx, req);
  if (!current.error && (current.result?.name !== name || current.result?.uuid !== id)) return failed;
  if (current.error && current.error.http_status !== 404) return failed;
  if (!current.error) await d1Call(ctx, { ...req, method: 'DELETE' });
  const after = await d1Call(ctx, req);
  const named = await temporaryByName(input, ctx, name);
  return after.error?.http_status === 404 && !named.error && !named.databases.length
    ? { name, deleted: true, read_back: 'absent' } : failed;
}

async function compareBaseline(input, ctx, referenceId, baseline, table, files) {
  const select = async (sql, id) => {
    const answer = await d1Select(input, ctx, sql, id);
    if (answer.error) throw answer.error;
    return answer.rows;
  };
  const targetTables = await select("SELECT name FROM sqlite_master WHERE type = 'table'");
  if (targetTables.some((row) => typeof row.name !== 'string')) throw vendor({ endpoint: d1Path(input) + '/query', method: 'POST' });
  const haveTables = new Set(targetTables.map(({ name }) => name));
  const hasHistory = haveTables.has(table);
  if (hasHistory) {
    const names = (await select(`SELECT name FROM ${table} ORDER BY id`)).map(({ name }) => name);
    const lexical = files.map(({ name }) => name).sort();
    if (!names.length) return refused(`Refusing ${table} history: empty. Nothing changed.`);
    if (lexical[0] !== baseline.name || names.length > lexical.length || names.some((name, i) => name !== lexical[i])) {
      return refused(`Refusing ${table} history: names must be an ordered prefix of the migration files. Nothing changed.`);
    }
  }
  const requiredTables = (await select("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name", referenceId)).map(({ name }) => name);
  if (!requiredTables.length || requiredTables.some((name) => typeof name !== 'string')) throw vendor({ endpoint: d1Path(input, referenceId) + '/query', method: 'POST' });
  if (!hasHistory && !requiredTables.some((name) => haveTables.has(name))) {
    return { result: 'empty', message: 'No baseline tables found; nothing changed. Run wrangler d1 migrations apply.' };
  }
  const mismatches = [];
  const rows = (pragma, name, id) => select(`SELECT * FROM pragma_${pragma}(${sqlString(name)})`, id);
  for (const name of requiredTables) {
    if (!haveTables.has(name)) { mismatches.push(`missing table ${name}`); continue; }
    const required = await rows('table_info', name, referenceId);
    const actual = await rows('table_info', name);
    for (const column of required) {
      const found = actual.find(({ name }) => name === column.name);
      if (!found) { mismatches.push(`missing column ${name}.${column.name}`); continue; }
      for (const property of ['type', 'notnull', 'dflt_value', 'pk']) {
        if (found[property] !== column[property]) mismatches.push(`column ${name}.${column.name} ${property} differs`);
      }
    }
    const actualIndexes = await rows('index_list', name);
    for (const index of await rows('index_list', name, referenceId)) {
      const found = actualIndexes.find(({ name }) => name === index.name);
      if (!found) { mismatches.push(`missing index ${name}.${index.name}`); continue; }
      for (const property of ['unique', 'partial']) {
        if (found[property] !== index[property]) mismatches.push(`index ${name}.${index.name} ${property} differs`);
      }
      const columns = async (id) => (await rows('index_info', index.name, id)).sort((a, b) => a.seqno - b.seqno).map(({ name }) => name);
      if (!isDeepStrictEqual(await columns(), await columns(referenceId))) mismatches.push(`index columns differ: ${name}.${index.name}`);
    }
    if (!isDeepStrictEqual(await rows('foreign_key_list', name), await rows('foreign_key_list', name, referenceId))) mismatches.push(`foreign keys differ: ${name}`);
  }
  if (mismatches.length) return { ...refused('Refusing incompatible baseline. Nothing changed.'), mismatches };
  if (hasHistory) return { result: 'already_adopted', message: `${table} already records the baseline and the schema matches; nothing changed.` };
  const changed = await d1Query(input, ctx, `${historyDDL(table)}\n${recordMigration(table, baseline.name)}`);
  if (changed.error) return changed.error;
  return { result: 'adopted', name: baseline.name, table, message: `Adopted ${baseline.name} without running it; recorded in ${table}.` };
}

async function adopt(input, ctx, maxBytes) {
  const loaded = await loadMigrations(input, ctx, maxBytes);
  if (loaded.error) return loaded.error;
  // adopt.mjs binds exactly this baseline and Wrangler's default table.
  const baseline = loaded.files.find(({ name }) => name === '0001_baseline.sql');
  if (!baseline || loaded.table !== 'd1_migrations' || loaded.files.map(({ name }) => name).sort()[0] !== baseline.name) {
    return refused('Adoption requires 0001_baseline.sql first and Wrangler default d1_migrations table');
  }
  const name = 'wiser-adopt-' + randomUUID();
  const absent = await temporaryByName(input, ctx, name);
  if (absent.error) return { ...absent.error, temporary_database: { name, created: false } };
  if (absent.databases.length) return { ...refused('temporary database name already exists'), temporary_database: { name, created: false } };
  let id, result, cleanup;
  try {
    // A transport failure can follow a successful create, so cleanup also finds
    // the generated name when the create response could not yield its id.
    const req = { endpoint: d1Path(input, null), method: 'POST', body: { name } };
    const created = await d1Call(ctx, req);
    if (created.error) result = created.error;
    else if (created.result?.name !== name || !string(created.result?.uuid, UUID) || created.result.uuid === input.database_id) result = vendor(req);
    else {
      id = created.result.uuid;
      const applied = await d1Query(input, ctx, baseline.text, id);
      result = applied.error || await compareBaseline(input, ctx, id, baseline, loaded.table, loaded.files);
    }
  } catch (error) {
    // Only the locally constructed status can pass, never exception prose.
    result = error?.status === 'vendor_error' ? error : { status: 'vendor_error', reason: 'baseline comparison failed' };
  } finally {
    cleanup = await deleteTemporary(input, ctx, name, id);
  }
  if (!cleanup.deleted) return { status: 'vendor_error', reason: 'temporary database deletion could not be confirmed',
    temporary_database: cleanup, outcome: result };
  return { ...result, temporary_database: cleanup };
}

export function workerActions({ buildMultipart, assetHash, MAX_UPLOAD_BYTES, redact }) {
  // The shape every live multipart through the provider's proxy has used
  // (index.js postDeployment, dns.import_zone, vercel's file upload): the body as
  // base64 with its content type beside it, never a Content-Type header.
  const multipart = (form) => ({ binary_body: { base64: form.body.toString('base64'),
    content_type: `multipart/form-data; boundary=${form.boundary}` } });
  const assetForm = (assets) => buildMultipart(assets.map((asset) => ({ name: asset.hash, filename: asset.hash,
    contentType: asset.content_type, value: Buffer.from(asset.bytes.toString('base64')) })));
  const scriptForm = (manifest, input, files, jwt) => buildMultipart([
    { name: 'metadata', contentType: 'application/json', value: Buffer.from(JSON.stringify({
      main_module: manifest.worker.main_module,
      compatibility_date: manifest.worker.compatibility_date,
      compatibility_flags: manifest.worker.compatibility_flags,
      bindings: [{ type: 'd1', name: manifest.worker.d1_binding, database_id: input.database_id },
        { type: 'assets', name: manifest.worker.assets_binding },
        // Cloudflare Upload Worker Module: metadata.bindings PlainText has name,
        // text and type: 'plain_text'. https://developers.cloudflare.com/api/resources/workers/subresources/scripts/methods/update/
        ...manifest.worker.vars_required.map((name) => ({ name, text: input.vars[name], type: 'plain_text' }))],
      assets: { jwt, config: manifest.assets.config },
    })) },
    ...manifest.worker.modules.map((module) => ({ name: module.name, filename: module.name, contentType: module.type, value: files.get(module.sha256) })),
  ]);
  function batchAssets(assets) {
    const batches = [];
    let batch = [];
    // Multipart boundaries have fixed length. Count parts once, without building
    // an O(n^2) series of multipart bodies for a large release.
    const closing = buildMultipart([]).body.length;
    let bytes = closing;
    for (const asset of assets) {
      const partBytes = assetForm([asset]).body.length - closing;
      if (batch.length && (4 * Math.ceil((bytes + partBytes) / 3) > MAX_UPLOAD_BYTES || batch.length >= 1000)) {
        batches.push(batch); batch = []; bytes = closing;
      }
      batch.push(asset); bytes += partBytes;
    }
    if (batch.length) batches.push(batch);
    return batches;
  }
  return {
    workers_subdomain: subdomain,
    d1_migrate: (input, ctx) => migrate(input, ctx, MAX_UPLOAD_BYTES),
    d1_adopt: (input, ctx) => adopt(input, ctx, MAX_UPLOAD_BYTES),
    d1_bookmark: d1Bookmark,
    d1_restore: d1Restore,
    rollback,
    get_worker: getWorker,
    async set_vars(input, ctx) {
      if (!varsShape(input.vars) || !Object.keys(input.vars).length) return { ...refused('vars must be non-empty and contain only non-secret uppercase names and strings of at most 512 characters'), field: 'vars' };
      const keys_set = Object.keys(input.vars);
      const loaded = await loadManifest(input, ctx);
      if (loaded.error) return loaded.error;
      const { manifest } = loaded;
      if (!Object.keys(input.vars).every((name) => manifest.worker.vars_required.includes(name))) {
        return { ...refused('vars contains a name outside release vars_required'), field: 'vars' };
      }
      const req = { endpoint: endpoint(input, '/settings'), method: 'GET' };
      const current = await call(ctx, req);
      if (current.error) return current.error;
      const previous = current.result?.bindings;
      if (!Array.isArray(previous) || previous.some((b) => !object(b) || typeof b.name !== 'string' || typeof b.type !== 'string')
        || new Set(previous.map((b) => b.name)).size !== previous.length) return vendor(req);
      // Never turn an existing resource or secret binding into a plain variable.
      if (previous.some((b) => Object.hasOwn(input.vars, b.name) && b.type !== 'plain_text')) return refused('vars would replace a non-plain binding');
      const versionReq = { endpoint: endpoint(input, '/deployments'), method: 'GET' };
      const active = await call(ctx, versionReq);
      if (active.error) return active.error;
      const listed = await listVersions(input, ctx);
      if (listed.status) return listed;
      const serving = singleDeployedVersion(active.result?.deployments?.[0]?.versions);
      let tiedNewest = false;
      const newest = listed.versions.reduce((latest, item) => {
        if (!latest) return item;
        const delta = Date.parse(item.created_on) - Date.parse(latest.created_on);
        // Cloudflare timestamps can distinguish versions within one millisecond.
        const fraction = (v) => v.created_on.split('.')[1]?.slice(0, -1) ?? '';
        const a = fraction(item), b = fraction(latest), width = Math.max(a.length, b.length);
        if (delta > 0 || (delta === 0 && a.padEnd(width, '0') > b.padEnd(width, '0'))) {
          tiedNewest = false;
          return item;
        }
        if (delta === 0 && a.padEnd(width, '0') === b.padEnd(width, '0')) tiedNewest = true;
        return latest;
      }, null);
      if (tiedNewest) return refused('Worker version history has tied newest creation times; cannot determine which version is newest. Cloudflare changes variables only on the newest deployed version. Roll back to a recorded version or deploy a release instead.');
      if (!serving || newest?.id !== serving) {
        return refused("Worker's newest version is not the one serving, as after a rollback; Cloudflare changes variables only on the newest deployed version. Roll back to a recorded version or deploy a release instead.");
      }
      // Wrangler inherits unchanged bindings by name, including secrets whose bytes
      // cannot be read back. No binding value is copied out into an answer.
      const next = previous.filter((b) => !Object.hasOwn(input.vars, b.name)).map((b) => ({ name: b.name, type: 'inherit' }));
      next.push(...Object.entries(input.vars).map(([name, text]) => ({ name, text, type: 'plain_text' })));
      const form = buildMultipart([{ name: 'settings', contentType: 'application/json', value: Buffer.from(JSON.stringify({ bindings: next })) }]);
      const update = { endpoint: endpoint(input, '/settings'), method: 'PATCH', ...multipart(form) };
      if (bodyBytes(form) > MAX_UPLOAD_BYTES) return refused('Worker settings request too large');
      const changed = await call(ctx, update);
      if (changed.error) return { ...changed.error, provider_codes: Array.isArray(changed.codes) ? changed.codes.filter(Number.isInteger) : [] };
      // The settings API does not document a version id in its answer. Read the
      // active deployment instead of treating a binding id as a Worker version.
      const after = await call(ctx, versionReq);
      if (after.error) return { ...after.error, reason: 'settings updated; active deployment read-back failed' };
      const version_id = singleDeployedVersion(after.result?.deployments?.[0]?.versions);
      if (!version_id) {
        return { ...vendor(versionReq), reason: 'settings updated; no single active version at 100 percent reported' };
      }
      // Versions are immutable, so the preflight id still serving is the version without
      // this change: never report it as the new one (a stopped N that is still writable).
      if (version_id === serving) {
        return { ...vendor(versionReq), reason: 'settings updated; the serving version is still the version from before the update' };
      }
      // Confirm only the keys we set. Read names and types, never binding values.
      const settings = await call(ctx, req);
      if (settings.error) return { ...settings.error, reason: 'settings updated; binding names/types read-back failed' };
      const confirmed = settings.result?.bindings;
      if (!Array.isArray(confirmed) || confirmed.some((b) => !object(b) || typeof b.name !== 'string' || typeof b.type !== 'string')
        || new Set(confirmed.map((b) => b.name)).size !== confirmed.length
        || !keys_set.every((key) => confirmed.some((b) => b.name === key && b.type === 'plain_text'))) {
        return { ...vendor(req), reason: 'settings updated; set keys not confirmed as plain_text bindings' };
      }
      return { keys_set, version_id };
    },
    async add_custom_domain(input, ctx) {
      const found = await findDomain(input, ctx);
      if (found.error) return found.error;
      if (found.domain && !domainOwner(found.domain, input)) return refused('domain is attached to another Worker');
      const req = { endpoint: endpoint({ account_id: input.account_id }, '/domains'), method: 'PUT',
        body: { hostname: input.hostname.toLowerCase(), service: input.script_name, zone_id: input.zone_id } };
      const reply = await call(ctx, req);
      if (reply.error) return reply.error;
      if (typeof reply.result?.hostname !== 'string' || reply.result.hostname.toLowerCase() !== input.hostname.toLowerCase() || !domainOwner(reply.result || {}, input)
        || reply.result?.zone_id !== input.zone_id) return vendor(req);
      return { hostname: input.hostname, script_name: input.script_name, attached: true };
    },
    async remove_custom_domain(input, ctx) {
      const found = await findDomain(input, ctx);
      if (found.error) return found.error;
      if (!found.domain) return refused('no such Worker custom domain');
      if (!domainOwner(found.domain, input)) return refused('domain is attached to another Worker');
      // Read the selected domain again by id immediately before removing it.
      const read = { endpoint: endpoint({ account_id: input.account_id }, `/domains/${found.domain.id}`), method: 'GET' };
      const detail = await call(ctx, read);
      if (detail.error) return detail.error;
      if (typeof detail.result?.hostname !== 'string' || detail.result.hostname.toLowerCase() !== input.hostname.toLowerCase() || !domainOwner(detail.result || {}, input)) return refused('domain is attached to another Worker');
      const req = { ...read, method: 'DELETE' };
      const reply = await call(ctx, req);
      if (reply.error) return reply.error;
      const after = await call(ctx, read);
      if (after.error && after.error.http_status !== 404) return after.error;
      if (!after.error) return { hostname: input.hostname, removed: false, read_back: 'present' };
      // Also check the hostname: a replacement id must not count as gone.
      const remaining = await findDomain(input, ctx);
      if (remaining.error) return remaining.error;
      return { hostname: input.hostname, removed: !remaining.domain, read_back: remaining.domain ? 'present' : 'absent' };
    },
    async set_workers_dev(input, ctx) {
      const address = await subdomain(input, ctx);
      if (address.status) return address;
      if (!address.exists && (input.enabled || input.previews_enabled)) return refused('account has no workers.dev subdomain; create it separately');
      const req = { endpoint: endpoint(input, '/subdomain'), method: 'POST',
        body: { enabled: input.enabled, previews_enabled: input.previews_enabled } };
      const reply = await call(ctx, req);
      if (reply.error) return reply.error;
      if (typeof reply.result?.enabled !== 'boolean' || typeof reply.result?.previews_enabled !== 'boolean') return vendor(req);
      return { enabled: reply.result.enabled, previews_enabled: reply.result.previews_enabled };
    },
    list_versions: listVersions,
    async delete_worker(input, ctx) {
      const reply = await call(ctx, { endpoint: endpoint(input), method: 'DELETE' });
      if (reply.error) return reply.error.http_status === 404
        ? { deleted: null, read_back: 'absent', reason: 'no such Worker' } : reply.error;
      const after = await getWorker(input, ctx);
      if (after.status) return after;
      return after.exists ? { deleted: input.script_name, read_back: 'present', success: false }
        : { deleted: input.script_name, read_back: 'absent' };
    },
    async deploy_worker_release(input, ctx) {
      if (!varsShape(input.vars)) return { ...before('vars must contain only non-secret uppercase names and strings of at most 512 characters'), field: 'vars' };
      const loaded = await loadManifest(input, ctx);
      if (loaded.error) return loaded.error;
      const { fetched, calls, prefix, fetchFile, raw, keyId, manifest, checked } = loaded;
      if (Object.keys(input.vars).length !== manifest.worker.vars_required.length
        || !manifest.worker.vars_required.every((name) => Object.hasOwn(input.vars, name))) {
        return { ...before('vars must exactly match release vars_required', { fetched, calls }), field: 'vars' };
      }
      const files = new Map();
      for (const file of checked.files) {
        // fetchRelease's smallest budget is one byte; empty files still must be
        // exactly zero bytes after fetching and must match SHA-256 below.
        const reply = await fetchFile(prefix + `files/${file.sha256}`, Math.max(1, file.size), file.sha256);
        if (reply.error) return reply.error;
        const bytes = Buffer.from(reply.bytes);
        if (bytes.length !== file.size || sha256(bytes) !== file.sha256) return before(`release file mismatch: ${file.sha256}`, { fetched, calls });
        files.set(file.sha256, bytes);
      }
      const reserved = scriptForm(manifest, input, files, 'x'.repeat(TOKEN_BYTES));
      if (bodyBytes(reserved) > MAX_UPLOAD_BYTES) return before(`Worker upload request too large: ${bodyBytes(reserved)} bytes`, { request_bytes: bodyBytes(reserved), limit_bytes: MAX_UPLOAD_BYTES, fetched, calls });
      const assets = manifest.assets.files.map((file) => ({ ...file, bytes: files.get(file.sha256), hash: assetHash(files.get(file.sha256), extname(file.path)) }));
      const byHash = new Map();
      const assetManifest = {};
      for (const asset of assets) {
        if (bodyBytes(assetForm([asset])) > MAX_UPLOAD_BYTES) return before(`asset upload request too large: ${asset.path}`, { request_bytes: bodyBytes(assetForm([asset])), limit_bytes: MAX_UPLOAD_BYTES, fetched, calls });
        const previous = byHash.get(asset.hash);
        if (previous && (previous.sha256 !== asset.sha256 || previous.content_type !== asset.content_type)) return before('release asset hash collision or conflicting content types', { fetched, calls });
        byHash.set(asset.hash, asset);
        assetManifest[asset.path] = { hash: asset.hash, size: asset.size };
      }
      // All release verification and all request-size refusals precede this call.
      const session = await call(ctx, { endpoint: endpoint(input, '/assets-upload-session'), method: 'POST', body: { manifest: assetManifest } }, calls);
      let completion;
      const tokens = [];
      const remember = (token) => { if (typeof token === 'string' && token.length) tokens.push(token); };
      const finish = (result) => {
        const out = tokens.reduce((value, token) => redact(value, token), result);
        return out;
      };
      remember(session.result?.jwt);
      const fail = (error) => finish({ ...error, fetched, calls });
      if (session.error) return fail(session.error);
      const jwtOk = (jwt) => typeof jwt === 'string' && jwt.length > 0 && Buffer.byteLength(jwt) <= TOKEN_BYTES && /^[A-Za-z0-9._-]+$/.test(jwt);
      if (!jwtOk(session.result?.jwt) || !Array.isArray(session.result?.buckets) || session.result.buckets.length > byHash.size) return fail(vendor({ endpoint: endpoint(input, '/assets-upload-session'), method: 'POST' }));
      const missing = new Set();
      const batches = [];
      for (const bucket of session.result.buckets) {
        if (!Array.isArray(bucket) || !bucket.length || bucket.length > byHash.size) return fail(vendor({ endpoint: endpoint(input, '/assets-upload-session'), method: 'POST' }));
        for (const hash of bucket) {
          if (!byHash.has(hash) || missing.has(hash)) return fail(vendor({ endpoint: endpoint(input, '/assets-upload-session'), method: 'POST' }));
          missing.add(hash);
        }
        batches.push(...batchAssets(bucket.map((hash) => byHash.get(hash))));
      }
      completion = batches.length ? null : session.result.jwt;
      const requests = [];
      const uploadEndpoint = `/accounts/${input.account_id}/workers/assets/upload?base64=true`;
      for (const batch of batches) {
        const form = assetForm(batch);
        const req = { endpoint: uploadEndpoint, method: 'POST', ...multipart(form),
          parameters: [{ name: 'Authorization', value: `Bearer ${session.result.jwt}`, type: 'header' }] };
        const reply = await call(ctx, req, calls);
        if (reply.error) {
          if (reply.error.http_status === 413) return fail({ ...reply.error, reason: 'request too large',
            batch: { files: batch.length, bytes: bodyBytes(form) }, limit_bytes: MAX_UPLOAD_BYTES, batches_sent: requests.length, batches: batches.length });
          return fail(reply.error);
        }
        requests.push({ files: batch.length, body_bytes: bodyBytes(form) });
        completion = reply.result?.jwt;
        remember(completion);
      }
      if (!jwtOk(completion)) return fail(vendor({ endpoint: uploadEndpoint, method: 'POST' }));
      const form = scriptForm(manifest, input, files, completion);
      const script = await call(ctx, { endpoint: endpoint(input), method: 'PUT', ...multipart(form) }, calls);
      if (script.error) return fail(script.error);
      const enabled = await call(ctx, { endpoint: endpoint(input, '/subdomain'), method: 'POST', body: { enabled: true, previews_enabled: false } }, calls);
      // Enabling may itself report no account subdomain. Still read it, never create it.
      if (enabled.error && !noSubdomain(enabled)) return fail(enabled.error);
      const address = await subdomain(input, ctx, calls);
      if (address.status) return fail(address);
      if (enabled.error && address.exists) return fail(enabled.error);
      return finish({ script_name: input.script_name, app: input.app, version: input.version, key_id: keyId, manifest_sha256: sha256(raw.bytes),
        // Hashed from the bytes the script request carried, so a reader can match them to the fetched files.
        worker: { modules: manifest.worker.modules.map((module) => ({ name: module.name, bytes: files.get(module.sha256).length,
          sha256: sha256(files.get(module.sha256)) })), request_bytes: bodyBytes(form) },
        assets: { files: assets.length, uploaded: assets.filter((asset) => missing.has(asset.hash)).length,
          already_present: assets.filter((asset) => !missing.has(asset.hash)).length, requests },
        database_binding: { name: manifest.worker.d1_binding, database_id: input.database_id },
        url: address.exists ? `https://${input.script_name}.${address.subdomain}.workers.dev/` : null,
        ...(!address.exists ? { reason: 'account has no workers.dev subdomain' } : {}), fetched, calls });
    },
  };
}
