import { createHash, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';

const APP = /^[a-z0-9](?:[a-z0-9-]{0,40}[a-z0-9])?$/;
const VERSION = /^(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})$/;
const HASH = /^[0-9a-f]{64}$/;
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
  try { hosts = JSON.parse(readFileSync(new URL('./manifest.json', import.meta.url), 'utf8')).modules.pages.release_hosts; }
  catch { return { error: before('release.json base host is not in release_hosts') }; }
  if (!validReleaseConfig(config, hosts)) return { error: before('release.json is malformed or its base host is not in release_hosts') };
  return { config };
}

function assetsConfig(config) {
  if (!shape(config, [], ['html_handling', 'not_found_handling', 'run_worker_first', 'serve_directly', '_headers', '_redirects', 'base_path'])) return false;
  for (const [key, value] of Object.entries(config)) {
    if (key === 'html_handling' && !['auto-trailing-slash', 'force-trailing-slash', 'drop-trailing-slash', 'none'].includes(value)) return false;
    if (key === 'not_found_handling' && !['none', '404-page', 'single-page-application'].includes(value)) return false;
    if (key === 'serve_directly' && typeof value !== 'boolean') return false;
    if (key === '_headers' || key === '_redirects') {
      if (typeof value !== 'string' || value.length > 65536 || value.includes('\0')) return false;
    }
    if (key === 'base_path' && value !== '/' && !safePath(value, true)) return false;
    if (key === 'run_worker_first' && typeof value !== 'boolean') {
      if (!Array.isArray(value) || !value.length || value.length > 100
        || !value.every((rule) => string(rule, /^!?\/[A-Za-z0-9_./*!-]*$/) && rule.length <= 512 && !rule.includes('..'))
        || !value.some((rule) => rule.startsWith('/'))) return false;
    }
  }
  return true;
}
function checkedManifest(manifest, input) {
  if (!shape(manifest, ['format', 'app', 'version', 'created', 'worker', 'assets', 'migrations']) || manifest.format !== 1) return { error: before('release manifest malformed') };
  if (manifest.app !== input.app || manifest.version !== input.version) return { error: before('release names another version') };
  if (!string(manifest.app, APP) || !string(manifest.version, VERSION)
    || !string(manifest.created, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/) || !Number.isFinite(Date.parse(manifest.created))
    || new Date(manifest.created).toISOString().slice(0, 19) !== manifest.created.slice(0, 19)
    || !Array.isArray(manifest.migrations) || manifest.migrations.length !== 0) return { error: before('release manifest malformed') };
  const w = manifest.worker;
  if (!shape(w, ['main_module', 'compatibility_date', 'compatibility_flags', 'd1_binding', 'assets_binding', 'modules'])
    || !safePath(w.main_module, false) || !date(w.compatibility_date)
    || !Array.isArray(w.compatibility_flags) || w.compatibility_flags.length > 100
    || !w.compatibility_flags.every((flag) => string(flag, /^[a-z][a-z0-9_]{0,127}$/))
    || new Set(w.compatibility_flags).size !== w.compatibility_flags.length
    || !string(w.d1_binding, BINDING) || !string(w.assets_binding, BINDING) || w.d1_binding === w.assets_binding
    || !Array.isArray(w.modules) || !w.modules.length || w.modules.length > 50) return { error: before('release worker malformed') };
  const a = manifest.assets;
  if (!shape(a, ['config', 'files']) || !assetsConfig(a.config) || !Array.isArray(a.files) || a.files.length > 20000) return { error: before('release assets malformed') };
  const modules = new Set();
  const paths = new Set();
  const files = new Map();
  let total = 0;
  for (const [items, kind] of [[w.modules, 'module'], [a.files, 'asset']]) {
    for (const file of items) {
      const keys = kind === 'module' ? ['name', 'type', 'sha256', 'size'] : ['path', 'sha256', 'size', 'content_type'];
      if (!shape(file, keys) || !string(file.sha256, HASH) || !Number.isSafeInteger(file.size)
        || file.size < 0 || file.size > MAX_FILE_BYTES) return { error: before(`release ${kind} malformed`) };
      if (kind === 'module') {
        if (!safePath(file.name, false) || file.name === 'metadata' || modules.has(file.name)
          || !['application/javascript+module', 'application/wasm', 'text/plain', 'application/octet-stream'].includes(file.type)) return { error: before('release module malformed') };
        modules.add(file.name);
      } else {
        if (!safePath(file.path, true) || paths.has(file.path) || !mime(file.content_type)) return { error: before('release asset malformed') };
        paths.add(file.path);
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
  return { result: data.result };
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
    if (!string(version.version_id, UUID)) return vendor(req);
    const versionReq = { endpoint: endpoint(input, `/versions/${version.version_id}`), method: 'GET' };
    const detail = await call(ctx, versionReq);
    if (detail.error) return detail.error.http_status === 404 ? { exists: false } : detail.error;
    const names = bindings(detail.result?.resources?.bindings);
    if (!names) return vendor(versionReq);
    versions.push({ version_id: version.version_id, percentage: version.percentage, bindings: names });
  }
  // A gradual deployment has several current versions. Do not invent one id.
  return { exists: true, version_id: versions.length === 1 ? versions[0].version_id : null,
    bindings: versions.length === 1 ? versions[0].bindings : [], ...(versions.length > 1 ? { versions } : {}) };
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
        { type: 'assets', name: manifest.worker.assets_binding }],
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
    get_worker: getWorker,
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
      const loaded = releaseConfig();
      if (loaded.error) return loaded.error;
      const config = loaded.config;
      if (!Object.hasOwn(config.apps, input.app)) return before('release app is not listed');
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
      if (raw.error) return raw.error;
      const sig = await fetchFile(prefix + 'manifest.sig', 64);
      if (sig.error) return sig.error;
      let keyId;
      for (const key of config.apps[input.app].keys) {
        const publicKey = await webcrypto.subtle.importKey('raw', Buffer.from(key.ed25519, 'base64'), { name: 'Ed25519' }, false, ['verify']);
        if (sig.bytes.length === 64 && await webcrypto.subtle.verify('Ed25519', publicKey, sig.bytes, raw.bytes)) { keyId = key.id; break; }
      }
      if (!keyId) return before('release signature invalid', { fetched, calls });
      let manifest;
      try { manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw.bytes)); }
      catch { return before('release manifest malformed', { fetched, calls }); }
      const checked = checkedManifest(manifest, input);
      if (checked.error) return { ...checked.error, fetched, calls };
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
      const finish = (result) => tokens.reduce((out, token) => redact(out, token), result);
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
