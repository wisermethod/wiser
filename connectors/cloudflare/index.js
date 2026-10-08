import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync, constants as fsConstants, fstatSync, lstatSync, openSync, readFileSync, readdirSync, realpathSync, statSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, extname, isAbsolute, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Copied from the vercel connector's path screen. A module may not import
// another connector (standards/script-contract.md, Connector modules), which
// is why this duplicate exists. userConfigDir must stay in step with
// gateway/src/paths.js wiserUserConfigDir.
function userConfigDir(platform = process.platform, env = process.env, home = homedir()) {
  if (platform === 'win32') {
    const base = env.APPDATA && env.APPDATA.length > 0 ? env.APPDATA : join(home, 'AppData', 'Roaming');
    return join(base, 'wiser');
  }
  if (platform === 'darwin') return join(home, 'Library', 'Application Support', 'wiser');
  const xdg = env.XDG_CONFIG_HOME;
  if (typeof xdg === 'string' && xdg.length > 0) return join(xdg, 'wiser');
  return join(home, '.config', 'wiser');
}

function canonicalize(input) {
  let head = resolve(String(input));
  const below = [];
  for (;;) {
    try {
      return below.length === 0 ? realpathSync(head) : join(realpathSync(head), ...[...below].reverse());
    } catch {
      const parent = dirname(head);
      if (parent === head) return null;
      below.push(basename(head));
      head = parent;
    }
  }
}

function identity(path) {
  try {
    const s = statSync(path);
    return `${s.dev}:${s.ino}`;
  } catch {
    return null;
  }
}

function isInside(child, parent) {
  return child === parent || child.startsWith(parent.endsWith(sep) ? parent : parent + sep);
}

function refusedSet() {
  const dir = canonicalize(userConfigDir());
  const ids = new Set();
  const home = canonicalize(homedir());
  if (home) ids.add(identity(home));
  if (dir) {
    const seen = new Set();
    const stack = [dir];
    while (stack.length > 0) {
      const here = stack.pop();
      const hereId = identity(here);
      if (hereId) {
        if (seen.has(hereId)) continue;
        seen.add(hereId);
        ids.add(hereId);
      }
      let entries;
      try {
        entries = readdirSync(here, { withFileTypes: true });
      } catch { continue; }
      for (const entry of entries) {
        const child = canonicalize(join(here, entry.name));
        if (!child) continue;
        const childId = identity(child);
        if (childId) ids.add(childId);
        if (entry.isDirectory()) stack.push(child);
      }
    }
  }
  ids.delete(null);
  return { dir, home, ids };
}

function screenFile(input, refused, root) {
  const resolved = canonicalize(input);
  if (!resolved) return { refused: 'unresolvable' };
  if (root && !isInside(resolved, root)) return { refused: 'outside the named directory', resolved };
  let stats;
  try {
    stats = statSync(resolved);
  } catch {
    return { refused: 'not found', resolved };
  }
  if (!stats.isFile()) return { refused: 'not a regular file', resolved };
  if (refused.ids.has(`${stats.dev}:${stats.ino}`)) return { refused: 'credential', resolved };
  if (refused.dir && isInside(resolved, refused.dir)) return { refused: 'credential', resolved };
  const base = basename(resolved);
  if (base === '.env' || base.startsWith('.env.')) return { refused: 'credential', resolved };
  return { resolved, size: stats.size, id: `${stats.dev}:${stats.ino}` };
}

function relativeName(root, full) {
  const rest = full === root ? '' : full.slice(root.length).replace(/^[\\/]+/, '');
  return rest.split(sep).join('/');
}

function invalid(field, reason) {
  return reason === undefined
    ? { status: 'invalid_arguments', field }
    : { status: 'invalid_arguments', field, reason };
}

function requiredString(value) {
  return typeof value === 'string' && [...value].length >= 1;
}

// Published on pages.create_project name. Lowercase letters, digits, hyphens,
// 1 to 58 characters, no leading or trailing hyphen.
const PROJECT_NAME = /^[a-z0-9](?:[a-z0-9-]{0,56}[a-z0-9])?$/;

// Published on remove_domain and delete_project, whose values land in a DELETE
// path: a hostname of dot-separated labels, so `.` and `..` cannot turn a domain
// removal into a request against the project itself.
const HOSTNAME = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;

function projectNameOk(value) {
  return typeof value === 'string' && PROJECT_NAME.test(value);
}

const MAX_FILES = 20000;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_BUCKET_FILES = 1000;
// Byte length of JSON.stringify of one POST /pages/assets/upload body.
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

const CONTENT_TYPES = {
  html: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  mjs: 'text/javascript',
  json: 'application/json',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  ico: 'image/x-icon',
  txt: 'text/plain',
  xml: 'application/xml',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  pdf: 'application/pdf',
  webmanifest: 'application/manifest+json',
  map: 'application/json',
};

function contentTypeFor(extension) {
  const key = extension.startsWith('.') ? extension.slice(1).toLowerCase() : extension.toLowerCase();
  return CONTENT_TYPES[key] || 'application/octet-stream';
}

// Wrangler uses blake3(base64(content) + extension), hex, first 32 characters.
// Node has no blake3 built-in and a connector module may not add a dependency,
// so this is sha256 of that same input. extension is Node's extname, including
// the leading dot. The key is client-chosen: Pages accepted these keys and served
// the files on the live deploys of 2026-09-24 and 2026-09-25.
function assetHash(bytes, extension) {
  const material = Buffer.from(bytes).toString('base64') + extension;
  return createHash('sha256').update(material).digest('hex').slice(0, 32);
}

function screenDeployDir(input, refused) {
  const lexical = resolve(String(input));
  if (basename(lexical) !== 'dist') return { error: invalid('dir', 'basename is not dist') };
  if (basename(dirname(lexical)) !== 'site') return { error: invalid('dir', 'parent basename is not site') };
  const resolved = canonicalize(lexical);
  if (!resolved) return { error: invalid('dir', 'unresolvable') };
  // The path the person approved is the path deployed. A symbolic link at site/ or
  // at dist/ would let an approved spelling publish some other kit, so the two
  // named segments must resolve to themselves under their canonical grandparent.
  const above = canonicalize(dirname(dirname(lexical)));
  if (!above || resolved !== join(above, 'site', 'dist')) {
    return { error: invalid('dir', 'site or dist is a symbolic link') };
  }
  let stats;
  try {
    stats = statSync(resolved);
  } catch {
    return { error: invalid('dir', 'not found') };
  }
  if (!stats.isDirectory()) return { error: invalid('dir', 'not a directory') };
  const parent = dirname(resolved);
  let kitStat;
  try {
    kitStat = lstatSync(join(parent, 'kit.json'));
  } catch {
    return { error: invalid('dir', 'kit.json missing') };
  }
  if (!kitStat.isFile()) return { error: invalid('dir', 'kit.json missing') };
  const id = `${stats.dev}:${stats.ino}`;
  if (refused.ids.has(id)) return { error: invalid('dir', 'credential directory') };
  if (refused.dir && (isInside(resolved, refused.dir) || isInside(refused.dir, resolved))) {
    return { error: invalid('dir', 'credential directory') };
  }
  if (refused.home && resolved === refused.home) return { error: invalid('dir', 'home directory') };
  return { resolved };
}

function isDirectoryPath(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

// Build output has no business holding a dotfile or a key. A hidden name is
// skipped (`.well-known` excepted, which sites publish on purpose), and a name
// shaped like a private key or certificate bundle is skipped as a credential.
// This is a screen for the common shapes, not a data-loss boundary: the
// confirmation stop and the returned file list are the controls for the rest.
const KEY_NAME = /\.(pem|key|p12|pfx|jks|keystore)$|^id_(rsa|dsa|ecdsa|ed25519)/i;

// Opens without following a link and checks the handle is the file the walk
// screened, so a file swapped for a link after screening is not read.
function readScreened(resolved, id) {
  let fd;
  try {
    fd = openSync(resolved, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW || 0));
  } catch {
    return null;
  }
  try {
    const st = fstatSync(fd);
    if (!st.isFile() || `${st.dev}:${st.ino}` !== id) return null;
    return readFileSync(fd);
  } catch {
    return null;
  } finally {
    closeSync(fd);
  }
}

function walkPages(root, refused, kitRule = true, sourceHashes = null) {
  const assets = [];
  const skipped = [];
  let headers = null;
  let redirects = null;
  const names = new Set();
  const stack = [root];
  const walked = new Set([identity(root)].filter(Boolean));
  while (stack.length > 0) {
    const dir = stack.pop();
    const atRoot = dir === root;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      skipped.push({ file: relativeName(root, dir), reason: 'unreadable' });
      continue;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      const logical = relativeName(root, full);
      if (kitRule && atRoot && entry.name === '_worker.js') {
        return { error: invalid('dir', 'static kit output only') };
      }
      if (kitRule && atRoot && entry.name === 'functions' && (entry.isDirectory() || isDirectoryPath(full))) {
        return { error: invalid('dir', 'static kit output only') };
      }
      if (!kitRule) {
        const lower = entry.name.toLowerCase();
        if (FOREIGN_REFUSED.has(lower)) return { error: invalid('dir', `not build output: ${logical}`) };
        if (!atRoot && FOREIGN_SKIPPED.has(lower)) {
          skipped.push({ file: logical, reason: 'source file' });
          continue;
        }
      }
      if (entry.name === 'node_modules') {
        skipped.push({ file: logical, reason: 'skipped name' });
        continue;
      }
      if (entry.name.startsWith('.') && entry.name !== '.well-known') {
        skipped.push({ file: logical, reason: 'hidden' });
        continue;
      }
      if (KEY_NAME.test(entry.name)) {
        skipped.push({ file: logical, reason: 'credential' });
        continue;
      }
      const resolved = canonicalize(full);
      if (!resolved || !isInside(resolved, root)) {
        skipped.push({ file: logical, reason: 'outside the named directory' });
        continue;
      }
      let stats;
      try {
        stats = statSync(resolved);
      } catch {
        skipped.push({ file: logical, reason: 'not found' });
        continue;
      }
      if (entry.isSymbolicLink() && stats.isDirectory()) {
        skipped.push({ file: logical, reason: 'link to a directory' });
        continue;
      }
      if (stats.isDirectory()) {
        const dirId = `${stats.dev}:${stats.ino}`;
        if (walked.has(dirId)) {
          skipped.push({ file: logical, reason: 'already walked' });
          continue;
        }
        walked.add(dirId);
        stack.push(resolved);
        continue;
      }
      const top = !logical.includes('/');
      if (top && entry.name === '_routes.json') {
        skipped.push({ file: logical, reason: 'not an asset' });
        continue;
      }
      const screened = screenFile(resolved, refused, root);
      if (screened.refused) {
        skipped.push({ file: logical, reason: screened.refused });
        continue;
      }
      if (screened.size > MAX_FILE_BYTES) {
        return { error: invalid('dir', `file over 25 MiB: ${logical}`) };
      }
      if (names.has(logical)) {
        skipped.push({ file: logical, reason: 'duplicate path' });
        continue;
      }
      names.add(logical);
      // The inode screenFile checked, not a fresh lookup, so a file swapped in
      // after screening fails the handle check. An intermediate directory swapped
      // for a link between screening and open is not caught: Node has no openat,
      // and that residual belongs to whoever can write into dist while it deploys.
      const id = screened.id;
      const bytes = readScreened(resolved, id);
      if (!bytes) {
        skipped.push({ file: logical, reason: 'unreadable' });
        continue;
      }
      if (top && (entry.name === '_headers' || entry.name === '_redirects')) {
        const kept = { resolved, id, bytes };
        if (entry.name === '_headers') headers = kept;
        else redirects = kept;
        continue;
      }
      if (assets.length >= MAX_FILES) {
        return { error: invalid('dir', 'more than 20000 files') };
      }
      const extension = extname(logical);
      // Only the hash and the upload-entry size are kept. The bytes are read again,
      // bucket by bucket, when a file is uploaded, so memory holds one bucket rather
      // than the whole site. Base64 is ASCII and JSON does not escape it, so the
      // entry size is the empty-value skeleton plus the base64 length, without
      // building the base64 a second time. Field order matches the object sent.
      if (sourceHashes && sourceHashes.has(createHash('sha256').update(bytes).digest('hex'))) {
        return { error: invalid('dir', `functions source in dir: ${logical}`) };
      }
      const hash = assetHash(bytes, extension);
      const contentType = contentTypeFor(extension);
      const base64Length = Math.ceil(bytes.length / 3) * 4;
      const entryBytes = base64Length + Buffer.byteLength(JSON.stringify({
        key: hash,
        value: '',
        metadata: { contentType },
        base64: true,
      }));
      assets.push({
        rel: logical,
        resolved,
        id,
        extension,
        hash,
        entryBytes,
        contentType,
      });
    }
  }
  assets.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  return { assets, headers, redirects, skipped };
}

// A bucket closes when the next asset would put it over 1,000 files or over
// MAX_UPLOAD_BYTES of serialized body. A bucket of k entries is
// 2 + sum(entry bytes) + (k - 1): the brackets and the commas between entries.
// The count is the JSON body, so it includes each entry's key, metadata and
// punctuation, and 3 MiB of body is at most 3 MiB of base64. There is no
// exception that lets one oversized file travel alone: deploy refuses any asset
// whose single-entry body exceeds the cap before this runs, so every item here
// fits in a bucket of its own and no bucket is emitted over the cap.
// Facts, 2026-10-07. A 73-file kit site batched as 29 files (4.94 MiB of base64)
// then 43 files (1.83 MiB of base64). The first request came back HTTP 413
// through the provider's proxy and nothing was published. wisermemory.com batches as
// one request of 81 files, 2.08 MiB of base64, and has uploaded and served on
// every deploy since 2026-10-03. At this cap, the same 73-file site then deployed
// live on 2026-10-07 in three requests of about 2.07, 2.88 and 1.84 MiB. The limit
// on this route therefore lies between about 2.9 MiB and about 4.9 MiB per request. The adapter reports a 413 from the
// proxy and one from Cloudflare alike, so which hop refused is not known. The
// provider's proxy documentation, read 2026-10-07, states no request-size limit,
// so the cap is taken from that evidence: 3 MiB.
function bucketize(items) {
  const out = [];
  let current = [];
  let bytes = 0;
  for (const item of items) {
    if (current.length > 0 && (current.length >= MAX_BUCKET_FILES || bytes + 1 + item.entryBytes > MAX_UPLOAD_BYTES)) {
      out.push(current);
      current = [];
    }
    bytes = current.length === 0 ? 2 + item.entryBytes : bytes + 1 + item.entryBytes;
    current.push(item);
  }
  if (current.length > 0) out.push(current);
  return out;
}

// The JWT rides the provider proxy as an Authorization header parameter, which
// overrides the grant's own header on these three calls. Verified live by the
// deploys of 2026-09-24 and 2026-09-25, which uploaded and served. The token is only
// an Authorization header parameter. It is never copied into a result, an
// error message, or a log.
async function assetCall(ctx, jwt, endpoint, body) {
  const res = await ctx.proxy({
    endpoint,
    method: 'POST',
    body,
    parameters: [{ name: 'Authorization', value: `Bearer ${jwt}`, type: 'header' }],
  });
  if (res && typeof res === 'object' && Object.prototype.hasOwnProperty.call(res, 'data')) {
    return res.data;
  }
  return res;
}

// Cloudflare answers { success, errors, messages, result }. A 2xx envelope that
// says success: false is a failure, and the flow stops on it.
function envelopeOk(data) {
  return Boolean(data) && typeof data === 'object' && !Array.isArray(data) && data.success !== false;
}

function readJwt(data) {
  if (!envelopeOk(data)) return null;
  const result = data.result;
  const jwt = result && typeof result === 'object' && !Array.isArray(result) ? result.jwt : undefined;
  return typeof jwt === 'string' && jwt.length > 0 ? jwt : null;
}

function readMissing(data) {
  if (!envelopeOk(data) || !Array.isArray(data.result)) return null;
  if (!data.result.every((item) => typeof item === 'string')) return null;
  return data.result;
}

function vendorError(endpoint, method) {
  return { status: 'vendor_error', endpoint, method };
}

function redact(value, secret) {
  if (!secret || typeof value === 'number' || typeof value === 'boolean' || value == null) return value;
  if (typeof value === 'string') {
    return value.includes(secret) ? value.split(secret).join('[redacted]') : value;
  }
  if (Array.isArray(value)) return value.map((item) => redact(item, secret));
  if (typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) out[key] = redact(item, secret);
    return out;
  }
  return value;
}

function buildMultipart(parts) {
  let boundary;
  do {
    boundary = `wiser-${randomUUID()}`;
  } while (parts.some((part) => part.value.includes(boundary)));
  const chunks = [];
  for (const part of parts) {
    const filename = part.filename ? `; filename="${part.filename}"` : '';
    chunks.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${part.name}"${filename}\r\nContent-Type: ${part.contentType}\r\n\r\n`,
      'utf8',
    ));
    chunks.push(part.value);
    chunks.push(Buffer.from('\r\n', 'utf8'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));
  return { boundary, body: Buffer.concat(chunks) };
}

function accountPath(accountId, projectName, rest) {
  const base = `/accounts/${encodeURIComponent(accountId)}/pages/projects`;
  if (!projectName) return base;
  const tail = rest ? `/${rest}` : '';
  return `${base}/${encodeURIComponent(projectName)}${tail}`;
}

function remap(input, pairs) {
  const out = { ...(input || {}) };
  for (const [from, to] of Object.entries(pairs)) {
    if (from in out && to !== from) {
      out[to] = out[from];
      delete out[from];
    }
  }
  return out;
}

async function viaCatalog(input, ctx) {
  return ctx.catalog(`${ctx.service}.${ctx.module}.${ctx.action}`, input);
}

function withQuery(path, input, names) {
  const url = new URL(path, 'https://api.cloudflare.com');
  for (const name of names) {
    if (!input || input[name] == null || input[name] === '') continue;
    url.searchParams.set(name, String(input[name]));
  }
  return url.pathname + url.search;
}

async function proxyData(ctx, req) {
  const res = await ctx.proxy(req);
  if (res && typeof res === 'object' && Object.prototype.hasOwnProperty.call(res, 'data')) {
    return res.data;
  }
  return res;
}

async function proxyEnvelope(ctx, req) {
  const data = await proxyData(ctx, req);
  if (!envelopeOk(data)) return vendorError(req.endpoint, req.method);
  return data;
}

const ACCOUNT_ID = /^[0-9a-f]{32}$/;
const DATABASE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const BINDING_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const SQL_MAX_CODE_POINTS = 100000;
const PARAMS_MAX = 100;
const MIGRATION_MAX_BYTES = 1048576;
const BUNDLE_MAX_BYTES = 2 * 1024 * 1024;
const LOCATION_HINTS = new Set(['wnam', 'enam', 'weur', 'eeur', 'apac', 'oc']);

// Wrangler's getCreateMigrationsTableQuery for table d1_migrations, two tabs
// before each column, from wrangler 4.136.3.
const MIGRATION_TABLE_SQL = 'CREATE TABLE IF NOT EXISTS "d1_migrations"(\n\t\tid         INTEGER PRIMARY KEY AUTOINCREMENT,\n\t\tname       TEXT UNIQUE,\n\t\tapplied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL\n);';

const BUILD_OUTPUT_NAMES = [
  'functions',
  '_worker.js',
  '_worker.bundle',
  'functions-filepath-routing-config.json',
  'package.json',
  'wrangler.toml',
  'wrangler.json',
  'wrangler.jsonc',
];
const REQUIRED_BUILD_FILES = ['_worker.bundle', '_routes.json', 'functions-filepath-routing-config.json', 'build.json'];
// Anywhere below dir, case-insensitive: these are server code and stop the deploy.
const FOREIGN_REFUSED = new Set(['_worker.js', '_worker.bundle', 'functions-filepath-routing-config.json']);
// Below dir's root, case-insensitive: source files, skipped and listed.
const FOREIGN_SKIPPED = new Set(['package.json', 'package-lock.json', 'wrangler.toml', 'wrangler.json', 'wrangler.jsonc']);

// A path whose spelling holds `.` or `..` or an empty segment is refused rather
// than normalized: `/tmp/../x` normalizes to `/x`, while the filesystem follows
// the /tmp link first, so the approved spelling and the file read would differ.
// The comparison is with the platform's own normal form, so every separator it
// accepts is inspected (on Windows `/` as well as `\`), a UNC root keeps its
// double separator, and one trailing separator is allowed.
function notNormalForm(input) {
  const strip = (value) => (value.length > 1 && /[\\/]$/.test(value) ? value.slice(0, -1) : value);
  return strip(normalize(input)) !== strip(input);
}

function codePoints(value) {
  return typeof value === 'string' ? [...value].length : 0;
}

function checkInt(value, field, minimum, maximum) {
  if (value == null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value)) return invalid(field);
  if (value < minimum || (maximum !== undefined && value > maximum)) return invalid(field);
  return null;
}

function accountIdOk(value) {
  return typeof value === 'string' && ACCOUNT_ID.test(value);
}

function databaseIdOk(value) {
  return typeof value === 'string' && DATABASE_ID.test(value);
}

function d1QueryPath(accountId, databaseId) {
  return `/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`;
}

function checkParams(params) {
  if (params == null) return null;
  if (!Array.isArray(params)) return invalid('params');
  if (params.length > PARAMS_MAX) return invalid('params', 'more than 100 params');
  for (const item of params) {
    if (typeof item !== 'string') return invalid('params');
  }
  return null;
}

function sqlLengthError(sql) {
  if (typeof sql !== 'string') return invalid('sql');
  if (codePoints(sql) > SQL_MAX_CODE_POINTS) return invalid('sql', 'sql longer than 100000 code points');
  return null;
}

// D1 splits multi-statement SQL on `;` server-side without regard to string
// literals, so `SELECT ';DROP TABLE x'` would run a DROP if `;` were allowed.
// The published pattern on pages.d1_query's sql, applied here as well: after leading
// whitespace, SELECT and a character that is not a letter, digit, underscore or
// semicolon, then no semicolon but one optional trailing one.
const READ_SQL = /^\s*[Ss][Ee][Ll][Ee][Cc][Tt][^A-Za-z0-9_;][^;]*(?:;\s*)?$/;

function singleSelect(sql) {
  return READ_SQL.test(sql);
}

function queryBody(sql, params) {
  const body = { sql };
  if (params != null) body.params = params;
  return body;
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function screenMigrationFile(file, refused) {
  if (typeof file !== 'string' || codePoints(file) < 1) return { error: invalid('file') };
  if (!isAbsolute(file)) return { error: invalid('file', 'path must be absolute') };
  if (notNormalForm(file)) return { error: invalid('file', 'path is not in normal form') };
  const lexical = resolve(file);
  const resolved = canonicalize(file);
  if (!resolved) return { error: invalid('file', 'unresolvable') };
  if (resolved !== lexical) return { error: invalid('file', 'symbolic link in path') };
  if (extname(resolved).toLowerCase() !== '.sql') return { error: invalid('file', 'extension must be .sql') };
  const screened = screenFile(resolved, refused);
  if (screened.refused) {
    const reason = screened.refused === 'not a regular file' ? 'not a regular file' : screened.refused;
    return { error: invalid('file', reason) };
  }
  if (screened.size > MIGRATION_MAX_BYTES) {
    return {
      error: {
        status: 'invalid_arguments',
        field: 'file',
        reason: 'file over 1 MiB (1048576 bytes)',
        fallback: 'Apply it with Wrangler: wrangler d1 migrations apply',
      },
    };
  }
  const bytes = readScreened(screened.resolved, screened.id);
  if (!bytes) return { error: invalid('file', 'unreadable') };
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return { error: invalid('file', 'invalid UTF-8') };
  }
  if (text.trim() === '') return { error: invalid('file', 'empty file') };
  return { resolved: screened.resolved, text, name: basename(screened.resolved) };
}

function migrationResultRows(data, endpoint) {
  if (!envelopeOk(data) || !Array.isArray(data.result)) return { error: vendorError(endpoint, 'POST') };
  return { rows: data.result };
}

function screenAbsoluteDir(input, field, refused) {
  if (typeof input !== 'string' || codePoints(input) < 1) return { error: invalid(field) };
  if (!isAbsolute(input)) return { error: invalid(field, 'path must be absolute') };
  if (notNormalForm(input)) return { error: invalid(field, 'path is not in normal form') };
  const lexical = resolve(input);
  const resolved = canonicalize(input);
  if (!resolved) return { error: invalid(field, 'unresolvable') };
  if (resolved !== lexical) return { error: invalid(field, 'symbolic link in path') };
  let stats;
  try {
    stats = statSync(resolved);
  } catch {
    return { error: invalid(field, 'not found') };
  }
  if (!stats.isDirectory()) return { error: invalid(field, 'not a directory') };
  if (dirname(resolved) === resolved) return { error: invalid(field, 'filesystem root') };
  const id = `${stats.dev}:${stats.ino}`;
  if (refused.ids.has(id)) return { error: invalid(field, 'credential directory') };
  if (refused.dir && (isInside(resolved, refused.dir) || isInside(refused.dir, resolved))) {
    return { error: invalid(field, 'credential directory') };
  }
  if (refused.home && resolved === refused.home) return { error: invalid(field, 'home directory') };
  return { resolved };
}

function screenNotBuildOutput(root) {
  let names;
  try {
    // Case-insensitive, because a case-insensitive filesystem serves Functions/ as functions/.
    names = new Set(readdirSync(root).map((name) => name.toLowerCase()));
  } catch {
    return invalid('dir', 'unreadable');
  }
  for (const name of BUILD_OUTPUT_NAMES) {
    if (names.has(name)) return invalid('dir', `not build output: ${name}`);
  }
  return null;
}

function oversizeAssetError(assets) {
  const oversize = assets.filter((asset) => 2 + asset.entryBytes > MAX_UPLOAD_BYTES);
  if (oversize.length === 0) return null;
  const files = oversize.map((asset) => asset.rel);
  return {
    status: 'invalid_arguments',
    field: 'dir',
    reason: `file over the 3 MiB upload request limit: ${files[0]}`,
    files,
    fallback: 'Deploy with Wrangler, per skills/Cloudflare Pages/SETUP.md',
  };
}

async function uploadMissingAssets(ctx, jwt, assets) {
  const byHash = new Map();
  for (const asset of assets) {
    if (!byHash.has(asset.hash)) byHash.set(asset.hash, asset);
  }
  const allHashes = [...byHash.keys()];
  const checked = await assetCall(ctx, jwt, '/pages/assets/check-missing', { hashes: allHashes });
  const missing = readMissing(checked);
  if (!missing) return { error: vendorError('/pages/assets/check-missing', 'POST') };
  const missingSet = new Set(missing.filter((hash) => byHash.has(hash)));
  let uploaded = 0;
  let alreadyPresent = 0;
  for (const asset of assets) {
    if (missingSet.has(asset.hash)) uploaded += 1;
    else alreadyPresent += 1;
  }
  const toUpload = [...missingSet].map((hash) => byHash.get(hash));
  const buckets = bucketize(toUpload);
  let batchesSent = 0;
  for (const bucket of buckets) {
    const payload = [];
    for (const asset of bucket) {
      const bytes = readScreened(asset.resolved, asset.id);
      if (!bytes || assetHash(bytes, asset.extension) !== asset.hash) {
        return { error: invalid('dir', `file changed during deploy: ${asset.rel}`) };
      }
      payload.push({
        key: asset.hash,
        value: bytes.toString('base64'),
        metadata: { contentType: asset.contentType },
        base64: true,
      });
    }
    const bodyBytes = Buffer.byteLength(JSON.stringify(payload));
    let up;
    try {
      up = await assetCall(ctx, jwt, '/pages/assets/upload', payload);
    } catch (err) {
      // ctx.proxy throws a gateway StatusSignal. This module may not import
      // the gateway, so the signal is recognized by its shape. status stays
      // vendor_error: the gateway's closed STATUS set is the only one
      // isStatusObject accepts, and a new string would be read as success.
      // The upload JWT is not copied onto this result.
      if (err && typeof err === 'object' && err.object && err.object.status === 'vendor_error' && err.object.http_status === 413) {
        return {
          error: {
            status: 'vendor_error',
            http_status: 413,
            endpoint: '/pages/assets/upload',
            method: 'POST',
            reason: 'request too large',
            batch: { files: bucket.length, bytes: bodyBytes },
            limit_bytes: MAX_UPLOAD_BYTES,
            batches_sent: batchesSent,
            batches: buckets.length,
          },
        };
      }
      throw err;
    }
    if (!envelopeOk(up)) return { error: vendorError('/pages/assets/upload', 'POST') };
    batchesSent += 1;
  }
  return { uploaded, alreadyPresent, allHashes };
}

function rereadDeployFiles(assets, headers, redirects) {
  for (const asset of assets) {
    const bytes = readScreened(asset.resolved, asset.id);
    if (!bytes || assetHash(bytes, asset.extension) !== asset.hash) {
      return invalid('dir', `file changed during deploy: ${asset.rel}`);
    }
  }
  for (const [name, kept] of [['_headers', headers], ['_redirects', redirects]]) {
    if (!kept) continue;
    const now = readScreened(kept.resolved, kept.id);
    if (!now || !now.equals(kept.bytes)) return invalid('dir', `file changed during deploy: ${name}`);
  }
  return null;
}

function manifestFor(assets) {
  const manifest = {};
  for (const asset of assets) manifest[`/${asset.rel}`] = asset.hash;
  return manifest;
}

function deploymentParts(manifest, headers, redirects, extra = []) {
  const parts = [{
    name: 'manifest',
    contentType: 'application/json',
    value: Buffer.from(JSON.stringify(manifest), 'utf8'),
  }];
  if (headers) {
    parts.push({
      name: '_headers',
      filename: '_headers',
      contentType: 'text/plain',
      value: headers.bytes,
    });
  }
  if (redirects) {
    parts.push({
      name: '_redirects',
      filename: '_redirects',
      contentType: 'text/plain',
      value: redirects.bytes,
    });
  }
  for (const part of extra) parts.push(part);
  return parts;
}

async function postDeployment(ctx, endpoint, form) {
  const deploymentData = await proxyData(ctx, {
    endpoint,
    method: 'POST',
    binary_body: {
      base64: form.body.toString('base64'),
      content_type: `multipart/form-data; boundary=${form.boundary}`,
    },
  });
  if (!envelopeOk(deploymentData) || !deploymentData.result || typeof deploymentData.result !== 'object') {
    return { error: vendorError(endpoint, 'POST') };
  }
  return { deployment: deploymentData.result };
}

function base64Length(bytes) {
  return 4 * Math.ceil(bytes / 3);
}

// The bundle Cloudflare receives is rebuilt here from what was screened, so a
// part whose headers two parsers could read differently never reaches it. Each
// part may carry only Content-Disposition and Content-Type, each once; the
// disposition is form-data with name and an optional filename, each once and
// quoted; part names are unique. Accepted module content types are the ones
// Wrangler writes for a module.
const BUNDLE_MODULE_TYPES = new Set([
  'application/javascript+module',
  'application/javascript',
  'text/javascript',
  'application/wasm',
  'application/octet-stream',
  'text/plain',
  'application/json',
  'application/source-map',
]);

const BUNDLE_PART_NAME = /^[A-Za-z0-9._\/-]{1,256}$/;

function parseDisposition(value) {
  const match = /^form-data((?:\s*;\s*[A-Za-z]+="[^"\\\r\n]*")*)\s*$/i.exec(value);
  if (!match) return null;
  const params = {};
  for (const param of match[1].matchAll(/;\s*([A-Za-z]+)="([^"\\\r\n]*)"/g)) {
    const key = param[1].toLowerCase();
    if ((key !== 'name' && key !== 'filename') || Object.prototype.hasOwnProperty.call(params, key)) return null;
    params[key] = param[2];
  }
  return params.name ? params : null;
}

function parseBundle(bytes) {
  if (bytes.length > BUNDLE_MAX_BYTES) return { error: 'bundle over 2 MiB' };
  const raw = bytes.toString('latin1');
  const firstCrlf = raw.indexOf('\r\n');
  if (firstCrlf < 3 || !raw.startsWith('--')) return { error: 'bundle is not multipart' };
  const boundary = raw.slice(2, firstCrlf);
  if (boundary.length === 0) return { error: 'bundle is not multipart' };
  if (!raw.startsWith(`--${boundary}\r\n`)) return { error: 'bundle is not multipart' };
  const pieces = raw.slice(boundary.length + 4).split(`\r\n--${boundary}`);
  if (pieces.length < 2) return { error: 'bundle is not multipart' };
  const closing = pieces[pieces.length - 1];
  if (!/^--(?:\r\n)?$/.test(closing)) return { error: 'bundle is not multipart' };
  const parts = [];
  const names = new Set();
  for (const piece of pieces.slice(0, -1)) {
    const part = piece.startsWith('\r\n') ? piece.slice(2) : piece;
    const splitAt = part.indexOf('\r\n\r\n');
    if (splitAt < 0) return { error: 'bundle part has no header' };
    const headers = {};
    for (const line of part.slice(0, splitAt).split('\r\n')) {
      const colon = line.indexOf(':');
      if (colon < 1) return { error: 'bundle part has a malformed header' };
      const key = line.slice(0, colon).trim().toLowerCase();
      if (key !== 'content-disposition' && key !== 'content-type') return { error: `bundle part has an unexpected header: ${key}` };
      if (Object.prototype.hasOwnProperty.call(headers, key)) return { error: `bundle part repeats ${key}` };
      headers[key] = line.slice(colon + 1).trim();
    }
    const disposition = headers['content-disposition'] ? parseDisposition(headers['content-disposition']) : null;
    if (!disposition) return { error: 'bundle part has an ambiguous or missing name' };
    // Latin-1 here and UTF-8 at the receiver would read a non-ASCII name as two
    // different names, so a part name is plain ASCII.
    if (!BUNDLE_PART_NAME.test(disposition.name)) return { error: 'bundle part name is not plain ASCII' };
    if (names.has(disposition.name)) return { error: `bundle has two parts named ${disposition.name}` };
    names.add(disposition.name);
    parts.push({
      name: disposition.name,
      filename: disposition.filename,
      contentType: headers['content-type'],
      body: Buffer.from(part.slice(splitAt + 4), 'latin1'),
    });
  }
  const metadataPart = parts.find((part) => part.name === 'metadata');
  if (!metadataPart) return { error: 'bundle has no metadata part' };
  if (metadataPart.filename !== undefined || (metadataPart.contentType !== undefined && metadataPart.contentType !== 'application/json')) {
    return { error: 'bundle metadata part is not plain JSON' };
  }
  let metadata;
  try {
    metadata = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(metadataPart.body).trim());
  } catch {
    return { error: 'bundle metadata is not JSON' };
  }
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return { error: 'bundle metadata is not an object' };
  }
  if (typeof metadata.main_module !== 'string' || metadata.main_module.length === 0) {
    return { error: 'bundle metadata has no main_module' };
  }
  if (Object.prototype.hasOwnProperty.call(metadata, 'bindings') && !(Array.isArray(metadata.bindings) && metadata.bindings.length === 0)) {
    return { error: 'bundle carries bindings; bindings go on the project through cloudflare.pages.bind_d1' };
  }
  const modulesParts = parts.filter((part) => part.name !== 'metadata');
  for (const part of modulesParts) {
    if (part.filename !== undefined && part.filename !== part.name) return { error: `bundle part ${part.name} names another file` };
    if (!BUNDLE_MODULE_TYPES.has(part.contentType)) return { error: `bundle part ${part.name} has an unexpected content type` };
  }
  if (!modulesParts.some((part) => part.name === metadata.main_module)) {
    return { error: `bundle has no part named ${metadata.main_module}` };
  }
  // The canonical bundle: the screened metadata, serialized again, then each
  // module part with headers written here.
  const value = [Buffer.from(JSON.stringify(metadata), 'utf8'), ...modulesParts.map((part) => part.body)];
  let canonicalBoundary;
  do {
    canonicalBoundary = `wiser-${randomUUID()}`;
  } while (value.some((chunk) => chunk.includes(canonicalBoundary)));
  const chunks = [Buffer.from(`--${canonicalBoundary}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n`, 'utf8'), value[0], Buffer.from('\r\n', 'utf8')];
  for (const part of modulesParts) {
    chunks.push(Buffer.from(`--${canonicalBoundary}\r\nContent-Disposition: form-data; name="${part.name}"; filename="${part.name}"\r\nContent-Type: ${part.contentType}\r\n\r\n`, 'latin1'));
    chunks.push(part.body);
    chunks.push(Buffer.from('\r\n', 'utf8'));
  }
  chunks.push(Buffer.from(`--${canonicalBoundary}--\r\n`, 'utf8'));
  return { main_module: metadata.main_module, canonical: Buffer.concat(chunks) };
}

function parseRoutes(bytes) {
  let parsed;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    return { error: '_routes.json is not JSON' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { error: '_routes.json is not an object' };
  if (parsed.version !== 1) return { error: '_routes.json version is not 1' };
  if (!Array.isArray(parsed.include) || parsed.include.length === 0 || !parsed.include.every((item) => typeof item === 'string')) {
    return { error: '_routes.json include must be a non-empty array of strings' };
  }
  const exclude = parsed.exclude == null ? [] : parsed.exclude;
  if (!Array.isArray(exclude) || !exclude.every((item) => typeof item === 'string')) {
    return { error: '_routes.json exclude must be an array of strings' };
  }
  if (parsed.include.length + exclude.length > 100) return { error: '_routes.json has more than 100 rules' };
  for (const rule of [...parsed.include, ...exclude]) {
    if (!rule.startsWith('/')) return { error: '_routes.json rule does not start with /' };
  }
  return { include: parsed.include, exclude };
}

function parseRoutingConfig(bytes) {
  let parsed;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    return { error: 'functions-filepath-routing-config.json is not JSON' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !Array.isArray(parsed.routes)) {
    return { error: 'functions-filepath-routing-config.json has no routes array' };
  }
  return { ok: true };
}

function readBuildEntry(root, name, refused) {
  const full = join(root, name);
  let linked;
  try {
    linked = lstatSync(full);
  } catch {
    return { error: invalid('functions_build', `missing ${name}`) };
  }
  if (linked.isSymbolicLink()) return { error: invalid('functions_build', `symbolic link: ${name}`) };
  if (!linked.isFile()) return { error: invalid('functions_build', `not a regular file: ${name}`) };
  const resolved = canonicalize(full);
  if (!resolved || resolved !== resolve(full)) return { error: invalid('functions_build', `symbolic link: ${name}`) };
  const screened = screenFile(resolved, refused, root);
  if (screened.refused) return { error: invalid('functions_build', `${screened.refused}: ${name}`) };
  const bytes = readScreened(screened.resolved, screened.id);
  if (!bytes) return { error: invalid('functions_build', `unreadable: ${name}`) };
  return { name, resolved: screened.resolved, id: screened.id, bytes };
}

// Cloudflare writes an empty setting back in another shape (env_vars null
// before a PATCH, {} after, seen live 2026-10-07), so null, a missing key, {}
// and [] compare equal and are not reported as a change.
function sameSetting(left, right) {
  const empty = (value) => value == null
    || (Array.isArray(value) && value.length === 0)
    || (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0);
  if (empty(left) && empty(right)) return true;
  return JSON.stringify(left) === JSON.stringify(right);
}

function collateralChanges(env, before, after, binding) {
  const names = [];
  const left = asObject(before) || {};
  const right = asObject(after) || {};
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (key === 'd1_databases') continue;
    if (!sameSetting(left[key], right[key])) names.push(`${env}.${key}`);
  }
  const leftBindings = asObject(left.d1_databases) || {};
  const rightBindings = asObject(right.d1_databases) || {};
  const bindingNames = new Set([...Object.keys(leftBindings), ...Object.keys(rightBindings)]);
  for (const key of bindingNames) {
    if (key === binding) continue;
    if (!sameSetting(leftBindings[key], rightBindings[key])) {
      names.push(`${env}.d1_databases.${key}`);
    }
  }
  names.sort();
  return names;
}

// The kit Function is code, so _worker.js is admitted only when its sha256 is
// listed beside this module. _routes.json and schedule.bin are the site's own
// and carry no code: they are screened by shape, and can only send more or
// fewer requests to that Function. Read once per deploy; a missing or
// malformed list fails closed for every kit Function deploy.
const KIT_FUNCTION_FILES = ['_worker.js', '_routes.json', 'schedule.bin', 'function.json'];
const FUNCTION_RECORD_KEYS = new Set(['kitVersion', 'buildTime', 'worker', 'routes', 'schedule', 'carried', 'notCarried', 'paths']);
const SHA256_HEX = /^[0-9a-f]{64}$/;

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function loadKitFingerprints() {
  const path = fileURLToPath(new URL('./kit-function.json', import.meta.url));
  let bytes;
  try {
    bytes = readFileSync(path);
  } catch {
    return { error: invalid('dir', 'kit-function.json is missing; refusing the kit Function') };
  }
  let parsed;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return { error: invalid('dir', 'kit-function.json is malformed; refusing the kit Function') };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.keys(parsed).length !== 1
    || !Array.isArray(parsed.fingerprints) || parsed.fingerprints.length === 0) {
    return { error: invalid('dir', 'kit-function.json is malformed; refusing the kit Function') };
  }
  const seen = new Set();
  for (const entry of parsed.fingerprints) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return { error: invalid('dir', 'kit-function.json is malformed; refusing the kit Function') };
    }
    const keys = Object.keys(entry);
    if (keys.length !== 2 || !Object.prototype.hasOwnProperty.call(entry, 'kitVersion') || !Object.prototype.hasOwnProperty.call(entry, 'sha256')
      || typeof entry.kitVersion !== 'string' || entry.kitVersion.length === 0
      || typeof entry.sha256 !== 'string' || !SHA256_HEX.test(entry.sha256) || seen.has(entry.sha256)) {
      return { error: invalid('dir', 'kit-function.json is malformed; refusing the kit Function') };
    }
    seen.add(entry.sha256);
  }
  return { fingerprints: parsed.fingerprints };
}

function parseFunctionRecord(bytes) {
  let parsed;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return { error: 'function.json is not JSON' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { error: 'function.json is not an object' };
  const keys = Object.keys(parsed);
  if (keys.length !== FUNCTION_RECORD_KEYS.size || keys.some((key) => !FUNCTION_RECORD_KEYS.has(key))) {
    return { error: 'function.json is not the kit record' };
  }
  if (typeof parsed.kitVersion !== 'string' || parsed.kitVersion.length === 0) return { error: 'function.json kitVersion is missing' };
  if (typeof parsed.buildTime !== 'string') return { error: 'function.json buildTime is missing' };
  for (const name of ['worker', 'routes', 'schedule']) {
    if (typeof parsed[name] !== 'string' || !SHA256_HEX.test(parsed[name])) return { error: `function.json ${name} is not a sha256` };
  }
  if (!Array.isArray(parsed.carried) || !Array.isArray(parsed.notCarried)) return { error: 'function.json carried is not an array' };
  if (typeof parsed.paths !== 'number' || !Number.isInteger(parsed.paths) || parsed.paths < 0) {
    return { error: 'function.json paths is not a count' };
  }
  return { record: parsed };
}

function screenKitRoutes(bytes) {
  let parsed;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return { error: '_routes.json is not JSON' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { error: '_routes.json is not an object' };
  for (const key of Object.keys(parsed)) {
    if (key !== 'version' && key !== 'include' && key !== 'exclude') return { error: `_routes.json has an unexpected key: ${key}` };
  }
  const routes = parseRoutes(bytes);
  if (routes.error) return routes;
  for (const rule of [...routes.include, ...routes.exclude]) {
    if (codePoints(rule) > 100) return { error: '_routes.json rule is longer than 100 characters' };
  }
  return routes;
}

function screenSchedule(bytes) {
  if (bytes.length < 4 || bytes.subarray(0, 4).toString('latin1') !== 'WKS1') {
    return { error: 'schedule.bin does not start with WKS1' };
  }
  if (bytes.length < 8) return { error: 'schedule.bin header does not parse' };
  const length = bytes.readUInt32BE(4);
  if (length > bytes.length - 8) return { error: 'schedule.bin header does not parse' };
  let head;
  try {
    head = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(8, 8 + length)));
  } catch {
    return { error: 'schedule.bin header does not parse' };
  }
  // The header's other fields, and every byte after it, are data. They are not interpreted.
  if (!head || typeof head !== 'object' || Array.isArray(head) || head.v !== 1) {
    return { error: 'schedule.bin header v is not 1' };
  }
  return { ok: true };
}

function kitWorkerBundle(worker, schedule) {
  const metadata = Buffer.from('{"main_module":"_worker.js"}', 'utf8');
  const bodies = [metadata, worker, schedule];
  let boundary;
  do {
    boundary = `wiser-${randomUUID()}`;
  } while (bodies.some((body) => body.includes(boundary)));
  const raw = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n`, 'utf8'),
    metadata,
    Buffer.from('\r\n', 'utf8'),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="_worker.js"; filename="_worker.js"\r\nContent-Type: application/javascript+module\r\n\r\n`, 'utf8'),
    worker,
    Buffer.from('\r\n', 'utf8'),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="schedule.bin"; filename="schedule.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`, 'utf8'),
    schedule,
    Buffer.from('\r\n', 'utf8'),
    Buffer.from(`--${boundary}--\r\n`, 'utf8'),
  ]);
  // The bytes sent are the canonical bundle parseBundle writes, so the part
  // headers are the ones that parser accepts and no other shape can reach Cloudflare.
  const parsed = parseBundle(raw);
  if (parsed.error) return { error: parsed.error };
  if (parsed.canonical.length > BUNDLE_MAX_BYTES) return { error: 'bundle over 2 MiB' };
  return { canonical: parsed.canonical };
}

function readKitVersion(site, refused) {
  const full = join(site, 'kit.json');
  let linked;
  try {
    linked = lstatSync(full);
  } catch {
    return { error: invalid('dir', 'kit.json missing') };
  }
  if (linked.isSymbolicLink() || !linked.isFile()) return { error: invalid('dir', 'kit.json missing') };
  const resolved = canonicalize(full);
  if (!resolved || resolved !== resolve(full)) return { error: invalid('dir', 'kit.json missing') };
  const screened = screenFile(resolved, refused, site);
  if (screened.refused) return { error: invalid('dir', `kit.json ${screened.refused}`) };
  const bytes = readScreened(screened.resolved, screened.id);
  if (!bytes) return { error: invalid('dir', 'kit.json unreadable') };
  let parsed;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return { error: invalid('dir', 'kit.json unreadable') };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || typeof parsed.kitVersion !== 'string') {
    return { error: invalid('dir', 'kitVersion mismatch') };
  }
  return { kitVersion: parsed.kitVersion };
}

function readBuildRecord(site, refused) {
  const astro = join(site, '.astro');
  let astroStat;
  try {
    astroStat = lstatSync(astro);
  } catch {
    return { error: invalid('dir', 'missing build record') };
  }
  if (astroStat.isSymbolicLink() || !astroStat.isDirectory()) return { error: invalid('dir', 'kit build record unreadable') };
  const full = join(astro, 'kit-build.json');
  let linked;
  try {
    linked = lstatSync(full);
  } catch {
    return { error: invalid('dir', 'missing build record') };
  }
  if (linked.isSymbolicLink() || !linked.isFile()) return { error: invalid('dir', 'kit build record unreadable') };
  const resolved = canonicalize(full);
  if (!resolved || resolved !== resolve(full) || resolved !== join(site, '.astro', 'kit-build.json')) {
    return { error: invalid('dir', 'kit build record unreadable') };
  }
  const screened = screenFile(resolved, refused, site);
  if (screened.refused) return { error: invalid('dir', 'kit build record unreadable') };
  const bytes = readScreened(screened.resolved, screened.id);
  if (!bytes) return { error: invalid('dir', 'kit build record unreadable') };
  let parsed;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return { error: invalid('dir', 'kit build record unreadable') };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || typeof parsed.buildTime !== 'string') {
    return { error: invalid('dir', 'kit build record unreadable') };
  }
  return { buildTime: parsed.buildTime };
}

function readKitFunctionFile(root, name, refused) {
  const full = join(root, name);
  const resolved = canonicalize(full);
  if (!resolved || resolved !== resolve(full)) return { error: invalid('dir', `symbolic link: ${name}`) };
  const screened = screenFile(resolved, refused, root);
  if (screened.refused) return { error: invalid('dir', `${screened.refused}: ${name}`) };
  const bytes = readScreened(screened.resolved, screened.id);
  if (!bytes) return { error: invalid('dir', `unreadable: ${name}`) };
  return { name, resolved: screened.resolved, id: screened.id, bytes };
}

// site is the canonical parent of the dist screenDeployDir accepted. Absent
// means this deploy is the static one. Anything other than the four regular
// files refuses before a byte is trusted.
function readKitFunction(site, refused) {
  const lexical = join(site, 'dist-function');
  let linked;
  try {
    linked = lstatSync(lexical);
  } catch (err) {
    if (err && err.code === 'ENOENT') return { absent: true };
    return { error: invalid('dir', 'dist-function unreadable') };
  }
  if (linked.isSymbolicLink()) return { error: invalid('dir', 'dist-function is a symbolic link') };
  if (!linked.isDirectory()) return { error: invalid('dir', 'dist-function is not a directory') };
  const resolved = canonicalize(lexical);
  if (!resolved || resolved !== lexical) return { error: invalid('dir', 'dist-function is a symbolic link') };
  let entries;
  try {
    entries = readdirSync(resolved, { withFileTypes: true });
  } catch {
    return { error: invalid('dir', 'dist-function unreadable') };
  }
  const present = new Set();
  for (const entry of entries) {
    const full = join(resolved, entry.name);
    let st;
    try {
      st = lstatSync(full);
    } catch {
      return { error: invalid('dir', `unreadable: ${entry.name}`) };
    }
    if (st.isSymbolicLink()) return { error: invalid('dir', `symbolic link: ${entry.name}`) };
    if (!st.isFile()) return { error: invalid('dir', `not a regular file: ${entry.name}`) };
    if (!KIT_FUNCTION_FILES.includes(entry.name) || present.has(entry.name)) {
      return { error: invalid('dir', `unexpected entry: ${entry.name}`) };
    }
    present.add(entry.name);
  }
  for (const name of KIT_FUNCTION_FILES) {
    if (!present.has(name)) return { error: invalid('dir', `missing ${name}`) };
  }
  const files = [];
  for (const name of KIT_FUNCTION_FILES) {
    const read = readKitFunctionFile(resolved, name, refused);
    if (read.error) return read;
    files.push(read);
  }
  const byName = Object.fromEntries(files.map((file) => [file.name, file]));
  const list = loadKitFingerprints();
  if (list.error) return list;
  const workerSha = sha256Hex(byName['_worker.js'].bytes);
  const routesSha = sha256Hex(byName['_routes.json'].bytes);
  const scheduleSha = sha256Hex(byName['schedule.bin'].bytes);
  const match = list.fingerprints.find((entry) => entry.sha256 === workerSha);
  if (!match) return { error: invalid('dir', 'unlisted fingerprint') };
  const parsed = parseFunctionRecord(byName['function.json'].bytes);
  if (parsed.error) return { error: invalid('dir', parsed.error) };
  const meta = parsed.record;
  if (meta.worker !== workerSha || meta.routes !== routesSha || meta.schedule !== scheduleSha) {
    const which = meta.worker !== workerSha ? 'worker' : meta.routes !== routesSha ? 'routes' : 'schedule';
    return { error: invalid('dir', `function.json hash mismatch: ${which}`) };
  }
  const kit = readKitVersion(site, refused);
  if (kit.error) return kit;
  if (meta.kitVersion !== match.kitVersion || kit.kitVersion !== match.kitVersion) {
    return { error: invalid('dir', 'kitVersion mismatch') };
  }
  const build = readBuildRecord(site, refused);
  if (build.error) return build;
  if (build.buildTime !== meta.buildTime) return { error: invalid('dir', 'buildTime mismatch') };
  const routes = screenKitRoutes(byName['_routes.json'].bytes);
  if (routes.error) return { error: invalid('dir', routes.error) };
  const schedule = screenSchedule(byName['schedule.bin'].bytes);
  if (schedule.error) return { error: invalid('dir', schedule.error) };
  const bundle = kitWorkerBundle(byName['_worker.js'].bytes, byName['schedule.bin'].bytes);
  if (bundle.error) return { error: invalid('dir', bundle.error) };
  return {
    payload: {
      files,
      routesBytes: byName['_routes.json'].bytes,
      bundle: bundle.canonical,
      carried: meta.carried,
      report: {
        kit_version: meta.kitVersion,
        worker_sha256: workerSha,
        schedule_bytes: byName['schedule.bin'].bytes.length,
        routes: { include: routes.include.length, exclude: routes.exclude.length },
        carried: meta.carried,
        not_carried: meta.notCarried,
      },
    },
  };
}

export const modules = {
  dns: {
    async list_records(input, ctx) {
      return proxyData(ctx, {
        endpoint: withQuery(`/zones/${input.zone_id}/dns_records`, input, ['type', 'name', 'page', 'per_page']),
        method: 'GET',
      });
    },
    // confirmed proxy execute 2026-09-08; object result in the vendor envelope.
    async get_record(input, ctx) {
      return proxyData(ctx, {
        endpoint: `/zones/${input.zone_id}/dns_records/${input.record_id}`,
        method: 'GET',
      });
    },
    async create_record(input, ctx) {
      return proxyData(ctx, {
        endpoint: `/zones/${input.zone_id}/dns_records`,
        method: 'POST',
        body: {
          type: input.type,
          name: input.name,
          content: input.content,
          ...(input.ttl != null ? { ttl: input.ttl } : {}),
          ...(input.proxied != null ? { proxied: input.proxied } : {}),
          ...(input.priority != null ? { priority: input.priority } : {}),
        },
      });
    },
    async update_record(input, ctx) {
      return ctx.catalog('cloudflare.dns.update_record', remap(input, { record_id: 'dns_record_id' }));
    },
    async delete_record(input, ctx) {
      return ctx.catalog('cloudflare.dns.delete_record', remap(input, { record_id: 'dns_record_id' }));
    },
    async export_zone(input, ctx) {
      const res = await ctx.proxy({
        endpoint: `/zones/${input.zone_id}/dns_records/export`,
        method: 'GET',
      });
      return { zone_file: res.data };
    },
    async import_zone(input, ctx) {
      // JSON returned 400 on 2026-09-08. Assemble multipart here; the
      // gateway's provider forwards raw binary_body without assembling a form.
      let boundary;
      do { boundary = `wiser-${randomUUID()}`; } while (input.zone_file.includes(boundary));
      const parts = [
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="zone.txt"\r\nContent-Type: text/plain\r\n\r\n${input.zone_file}\r\n`,
      ];
      if (input.proxied !== undefined) {
        parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="proxied"\r\n\r\n${input.proxied}\r\n`);
      }
      parts.push(`--${boundary}--\r\n`);
      return proxyData(ctx, {
        endpoint: `/zones/${input.zone_id}/dns_records/import`,
        method: 'POST',
        binary_body: {
          base64: Buffer.from(parts.join(''), 'utf8').toString('base64'),
          content_type: `multipart/form-data; boundary=${boundary}`,
        },
      });
    },
    async batch(input, ctx) {
      return proxyData(ctx, {
        endpoint: `/zones/${input.zone_id}/dns_records/batch`,
        method: 'POST',
        body: {
          deletes: input.deletes,
          patches: input.patches,
          puts: input.puts,
          posts: input.posts,
        },
      });
    },
  },

  zones: {
    async list(input, ctx) {
      const onePage = input && input.page != null;
      const pageSize = (input && input.per_page) || 50;
      let page = (input && input.page) || 1;
      const all = [];
      let last = null;
      while (true) {
        const q = {
          name: input && input.name,
          status: input && input.status,
          page,
          per_page: pageSize,
        };
        const endpoint = withQuery('/zones', q, ['name', 'status', 'page', 'per_page']);
        const extra = (input && input.account_id)
          ? `${endpoint}${endpoint.includes('?') ? '&' : '?'}account.id=${encodeURIComponent(input.account_id)}`
          : endpoint;
        last = await proxyData(ctx, { endpoint: extra, method: 'GET' });
        const rows = last && Array.isArray(last.result) ? last.result : [];
        all.push(...rows);
        if (onePage) return last;
        const totalPages = (last && last.result_info && last.result_info.total_pages) || 1;
        if (page >= totalPages) break;
        page += 1;
      }
      return {
        success: true,
        errors: [],
        result: all,
        result_info: {
          count: all.length,
          total_count: (last && last.result_info && last.result_info.total_count) || all.length,
          page: 1,
          per_page: pageSize,
          total_pages: 1,
        },
      };
    },
    async get(input, ctx) {
      return proxyData(ctx, {
        endpoint: `/zones/${input.zone_id}`,
        method: 'GET',
      });
    },
    async list_accounts(input, ctx) {
      return proxyData(ctx, {
        endpoint: withQuery('/accounts', input || {}, ['page', 'per_page', 'name']),
        method: 'GET',
      });
    },
    async create(input, ctx) {
      return proxyData(ctx, {
        endpoint: '/zones',
        method: 'POST',
        body: {
          name: input.name,
          type: input.type,
          account: input.account_id ? { id: input.account_id } : undefined,
        },
      });
    },
    async delete(input, ctx) {
      return ctx.catalog('cloudflare.zones.delete', input);
    },
  },

  pages: {
    // confirmed proxy execute 2026-09-08; { success, result, errors, messages, result_info }.
    // Live result was an empty array on every account the zones grant listed.
    async list_projects(input, ctx) {
      return proxyData(ctx, {
        endpoint: `/accounts/${input.account_id}/pages/projects`,
        method: 'GET',
      });
    },
    async get_project(input, ctx) {
      return proxyData(ctx, {
        endpoint: `/accounts/${input.account_id}/pages/projects/${input.project_name}`,
        method: 'GET',
      });
    },
    async list_deployments(input, ctx) {
      return proxyData(ctx, {
        endpoint: `/accounts/${input.account_id}/pages/projects/${input.project_name}/deployments`,
        method: 'GET',
      });
    },
    async create_project(input, ctx) {
      if (!requiredString(input && input.account_id)) return invalid('account_id');
      if (!projectNameOk(input && input.name)) return invalid('name');
      if (!requiredString(input && input.production_branch)) return invalid('production_branch');
      return proxyData(ctx, {
        endpoint: accountPath(input.account_id),
        method: 'POST',
        body: { name: input.name, production_branch: input.production_branch },
      });
    },
    async add_domain(input, ctx) {
      if (!requiredString(input && input.account_id)) return invalid('account_id');
      if (!requiredString(input && input.project_name)) return invalid('project_name');
      if (!requiredString(input && input.domain)) return invalid('domain');
      return proxyData(ctx, {
        endpoint: accountPath(input.account_id, input.project_name, 'domains'),
        method: 'POST',
        body: { name: input.domain },
      });
    },
    async remove_domain(input, ctx) {
      if (!requiredString(input && input.account_id)) return invalid('account_id');
      if (!projectNameOk(input && input.project_name)) return invalid('project_name');
      if (typeof (input && input.domain) !== 'string' || !HOSTNAME.test(input.domain)) return invalid('domain');
      return proxyData(ctx, {
        endpoint: accountPath(input.account_id, input.project_name, `domains/${encodeURIComponent(input.domain)}`),
        method: 'DELETE',
      });
    },
    // Reads the project first and refuses while a custom domain is attached, so
    // remove_domain comes first, as its own confirmed call. Best effort: a domain
    // attached by someone else between the read and the DELETE is not caught.
    // A read with no domains array fails closed rather than counting as none.
    async delete_project(input, ctx) {
      if (!requiredString(input && input.account_id)) return invalid('account_id');
      if (!projectNameOk(input && input.project_name)) return invalid('project_name');
      const endpoint = accountPath(input.account_id, input.project_name);
      const project = await proxyData(ctx, { endpoint, method: 'GET' });
      if (!envelopeOk(project) || !project.result || typeof project.result !== 'object') {
        return vendorError(endpoint, 'GET');
      }
      const domains = project.result.domains;
      if (!Array.isArray(domains) || !domains.every((domain) => typeof domain === 'string')) {
        return vendorError(endpoint, 'GET');
      }
      // The live read lists the project's own subdomain among its domains
      // (2026-09-24), so exactly that one is exempt and any other name blocks,
      // another *.pages.dev included. No subdomain on the read means none is exempt.
      const norm = (name) => name.toLowerCase().replace(/\.+$/, '');
      const own = typeof project.result.subdomain === 'string' ? norm(project.result.subdomain) : null;
      const custom = domains.filter((domain) => norm(domain) !== own);
      if (custom.length > 0) {
        return { status: 'invalid_arguments', field: 'project_name', reason: 'custom domain still attached', domains: custom };
      }
      return proxyData(ctx, { endpoint, method: 'DELETE' });
    },
    async deploy(input, ctx) {
      if (!requiredString(input && input.account_id)) return invalid('account_id');
      if (!requiredString(input && input.project_name)) return invalid('project_name');
      if (!requiredString(input && input.dir)) return invalid('dir');
      const refused = refusedSet();
      const root = screenDeployDir(input.dir, refused);
      if (root.error) return root.error;
      const walked = walkPages(root.resolved, refused);
      if (walked.error) return walked.error;
      if (walked.assets.length === 0) {
        return { status: 'invalid_arguments', field: 'dir', reason: 'no uploadable files', skipped: walked.skipped };
      }
      // A file of about 2.25 MiB on disk is the practical ceiling. Base64 expands
      // by 4/3, and the entry's key, content type and punctuation share the 3 MiB
      // request, so one file whose single-entry body exceeds the cap can never be
      // sent. Every walked asset is checked, not only those later reported missing,
      // and this runs before the upload-token call: nothing is known about missing
      // hashes yet, and a refusal sends nothing.
      const oversize = oversizeAssetError(walked.assets);
      if (oversize) return oversize;
      // site/dist-function/ is the sibling of the dist this screen accepted.
      // Absent, the deploy is the static one and function is null.
      const fn = readKitFunction(dirname(root.resolved), refused);
      if (fn.error) return fn.error;
      const manifest = manifestFor(walked.assets);
      let prepared = null;
      if (fn.payload) {
        const extra = [
          {
            name: '_worker.bundle',
            filename: '_worker.bundle',
            contentType: 'application/octet-stream',
            value: fn.payload.bundle,
          },
          {
            name: '_routes.json',
            filename: '_routes.json',
            contentType: 'application/octet-stream',
            value: fn.payload.routesBytes,
          },
        ];
        const form = buildMultipart(deploymentParts(manifest, walked.headers, walked.redirects, extra));
        const encoded = base64Length(form.body.length);
        if (encoded > MAX_UPLOAD_BYTES) {
          const pages = fn.payload.carried.length;
          return {
            status: 'invalid_arguments',
            field: 'dir',
            reason: `deployment request over the 3 MiB limit; the kit Function carries ${pages} scheduled instants`,
            bytes: encoded,
            scheduled_instants: pages,
            fallback: 'Deploy with Wrangler: wrangler pages deploy',
          };
        }
        prepared = form;
      }
      const tokenEndpoint = accountPath(input.account_id, input.project_name, 'upload-token');
      const tokenData = await proxyData(ctx, { endpoint: tokenEndpoint, method: 'GET' });
      const jwt = readJwt(tokenData);
      if (!jwt) return vendorError(tokenEndpoint, 'GET');
      const sent = await uploadMissingAssets(ctx, jwt, walked.assets);
      if (sent.error) return sent.error;
      // Every file, uploaded or already present, is read again and must still be
      // what was hashed, so the manifest describes the tree as it stands now.
      const changed = rereadDeployFiles(walked.assets, walked.headers, walked.redirects);
      if (changed) return changed;
      const upserted = await assetCall(ctx, jwt, '/pages/assets/upsert-hashes', { hashes: sent.allHashes });
      if (!envelopeOk(upserted)) return vendorError('/pages/assets/upsert-hashes', 'POST');
      // The four Function files are re-read immediately before the deployment
      // request. A change stops the deploy, and no byte of them is an asset.
      if (fn.payload) {
        for (const file of fn.payload.files) {
          const now = readScreened(file.resolved, file.id);
          if (!now || !now.equals(file.bytes)) return invalid('dir', `file changed during deploy: ${file.name}`);
        }
      }
      const form = prepared || buildMultipart(deploymentParts(manifest, walked.headers, walked.redirects));
      const deploymentsEndpoint = accountPath(input.account_id, input.project_name, 'deployments');
      const posted = await postDeployment(ctx, deploymentsEndpoint, form);
      if (posted.error) return posted.error;
      return redact({
        deployment: posted.deployment,
        dir: root.resolved,
        files: walked.assets.length,
        uploaded: sent.uploaded,
        already_present: sent.alreadyPresent,
        manifest: Object.keys(manifest),
        skipped: walked.skipped,
        function: fn.payload ? fn.payload.report : null,
      }, jwt);
    },
    async bind_d1(input, ctx) {
      if (!accountIdOk(input && input.account_id)) return invalid('account_id');
      if (!projectNameOk(input && input.project_name)) return invalid('project_name');
      if (typeof (input && input.binding) !== 'string' || !BINDING_NAME.test(input.binding)) return invalid('binding');
      if (!databaseIdOk(input && input.database_id)) return invalid('database_id');
      let environments = input && input.environments;
      if (environments == null) environments = ['production', 'preview'];
      else {
        if (!Array.isArray(environments) || environments.length < 1 || environments.length > 2) return invalid('environments');
        if (new Set(environments).size !== environments.length) return invalid('environments', 'duplicate environment');
        for (const env of environments) {
          if (env !== 'production' && env !== 'preview') return invalid('environments');
        }
      }
      const endpoint = accountPath(input.account_id, input.project_name);
      const project = await proxyData(ctx, { endpoint, method: 'GET' });
      const configs = project && project.result && project.result.deployment_configs;
      if (!envelopeOk(project) || !asObject(configs)) return vendorError(endpoint, 'GET');
      const replaced = {};
      const deployment_configs = {};
      for (const env of environments) {
        const before = configs[env];
        const beforeObject = asObject(before);
        const current = beforeObject && asObject(beforeObject.d1_databases);
        const id = current && current[input.binding] ? current[input.binding].id : null;
        replaced[env] = id ?? null;
        deployment_configs[env] = { d1_databases: { [input.binding]: { id: input.database_id } } };
      }
      const patched = await proxyData(ctx, {
        endpoint,
        method: 'PATCH',
        body: { deployment_configs },
      });
      const afterConfigs = patched && patched.result && patched.result.deployment_configs;
      if (!envelopeOk(patched) || !asObject(afterConfigs)) {
        return { status: 'vendor_error', endpoint, method: 'PATCH', reason: 'binding not applied', environments: [...environments] };
      }
      const fail_open = {};
      const compatibility_date = {};
      const collateral_changes = [];
      // Both environments are compared, so a PATCH that changed one it was not
      // sent for is reported; the requested binding is exempt only where it was
      // set. Computed before the binding is checked, so a failed bind reports it too.
      for (const env of ['production', 'preview']) {
        const afterEnv = asObject(afterConfigs[env]) || {};
        const named = environments.includes(env);
        if (named) {
          fail_open[env] = afterEnv.fail_open ?? null;
          compatibility_date[env] = afterEnv.compatibility_date ?? null;
        }
        collateral_changes.push(...collateralChanges(env, configs[env], afterEnv, named ? input.binding : null));
      }
      collateral_changes.sort();
      const missing = [];
      for (const env of environments) {
        const afterEnv = asObject(afterConfigs[env]);
        const bindings = afterEnv && asObject(afterEnv.d1_databases);
        const applied = bindings && bindings[input.binding];
        if (!applied || applied.id !== input.database_id) missing.push(env);
      }
      if (missing.length > 0) {
        return { status: 'vendor_error', endpoint, method: 'PATCH', reason: 'binding not applied', environments: missing, collateral_changes };
      }
      return {
        project_name: input.project_name,
        binding: input.binding,
        database_id: input.database_id,
        environments: [...environments],
        replaced,
        fail_open,
        compatibility_date,
        collateral_changes,
      };
    },
    async deploy_with_functions(input, ctx) {
      if (!accountIdOk(input && input.account_id)) return invalid('account_id');
      if (!projectNameOk(input && input.project_name)) return invalid('project_name');
      if (!requiredString(input && input.dir)) return invalid('dir');
      if (!requiredString(input && input.functions_build)) return invalid('functions_build');
      const refused = refusedSet();
      const root = screenAbsoluteDir(input.dir, 'dir', refused);
      if (root.error) return root.error;
      // A kit payload goes through pages.deploy, whose screens and gate are the
      // kit's; this action never carries a Function onto a kit site.
      let kitMarker = null;
      try {
        kitMarker = lstatSync(join(dirname(root.resolved), 'kit.json'));
      } catch { /* none */ }
      let insideKit = false;
      for (let above = dirname(root.resolved); ; above = dirname(above)) {
        let marker = null;
        try {
          marker = lstatSync(join(above, 'kit.json'));
        } catch { /* none */ }
        if (marker && marker.isFile() && isInside(root.resolved, join(above, 'dist'))) insideKit = true;
        if (dirname(above) === above) break;
      }
      if (kitMarker || insideKit || (basename(root.resolved) === 'dist' && basename(dirname(root.resolved)) === 'site')) {
        return invalid('dir', 'kit payload: use cloudflare.pages.deploy');
      }
      const blocked = screenNotBuildOutput(root.resolved);
      if (blocked) return blocked;
      const buildRoot = screenAbsoluteDir(input.functions_build, 'functions_build', refused);
      if (buildRoot.error) return buildRoot.error;
      if (isInside(buildRoot.resolved, root.resolved) || isInside(root.resolved, buildRoot.resolved)) {
        return invalid('functions_build', 'functions_build overlaps dir');
      }
      let buildEntries;
      try {
        buildEntries = readdirSync(buildRoot.resolved, { withFileTypes: true });
      } catch {
        return invalid('functions_build', 'unreadable');
      }
      const allowed = new Set(REQUIRED_BUILD_FILES);
      for (const entry of buildEntries) {
        if (!allowed.has(entry.name)) return invalid('functions_build', `unexpected entry: ${entry.name}`);
        const full = join(buildRoot.resolved, entry.name);
        if (entry.isSymbolicLink()) return invalid('functions_build', `symbolic link: ${entry.name}`);
        let st;
        try {
          st = lstatSync(full);
        } catch {
          return invalid('functions_build', `not a regular file: ${entry.name}`);
        }
        if (!st.isFile()) return invalid('functions_build', `not a regular file: ${entry.name}`);
      }
      const present = new Set(buildEntries.map((entry) => entry.name));
      for (const name of REQUIRED_BUILD_FILES) {
        if (!present.has(name)) return invalid('functions_build', `missing ${name}`);
      }
      const kept = {};
      for (const name of REQUIRED_BUILD_FILES) {
        const read = readBuildEntry(buildRoot.resolved, name, refused);
        if (read.error) return read.error;
        kept[name] = read;
      }
      const bundle = parseBundle(kept['_worker.bundle'].bytes);
      if (bundle.error) return invalid('functions_build', bundle.error);
      const routes = parseRoutes(kept['_routes.json'].bytes);
      if (routes.error) return invalid('functions_build', routes.error);
      const routing = parseRoutingConfig(kept['functions-filepath-routing-config.json'].bytes);
      if (routing.error) return invalid('functions_build', routing.error);
      let buildProvenance;
      try {
        buildProvenance = JSON.parse(kept['build.json'].bytes.toString('utf8'));
      } catch {
        return invalid('functions_build', 'build.json is not JSON');
      }
      if (!buildProvenance || typeof buildProvenance !== 'object' || Array.isArray(buildProvenance)) {
        return invalid('functions_build', 'build.json is not an object');
      }
      // The build names the static directory it was made for and the functions
      // source it was made from. It must be this dir, and the source must not be
      // published with it.
      if (buildProvenance.assets !== root.resolved) {
        return invalid('functions_build', 'build.json assets is not dir');
      }
      if (typeof buildProvenance.functions !== 'string' || !isAbsolute(buildProvenance.functions)
        || notNormalForm(buildProvenance.functions) || canonicalize(buildProvenance.functions) !== resolve(buildProvenance.functions)) {
        return invalid('functions_build', 'build.json names no functions source by its real path');
      }
      // The function source's own bytes may not be published anywhere in dir,
      // under any name: build.json lists each source file's sha256.
      if (!Array.isArray(buildProvenance.sources) || buildProvenance.sources.length === 0
        || !buildProvenance.sources.every((item) => asObject(item) && typeof item.sha256 === 'string' && /^[0-9a-f]{64}$/.test(item.sha256))) {
        return invalid('functions_build', 'build.json lists no sources');
      }
      const sourceHashes = new Set(buildProvenance.sources.map((item) => item.sha256));
      if (isInside(buildProvenance.functions, root.resolved) || isInside(root.resolved, buildProvenance.functions)) {
        return invalid('functions_build', 'functions source overlaps dir');
      }
      const walked = walkPages(root.resolved, refused, false, sourceHashes);
      if (walked.error) return walked.error;
      const oversize = oversizeAssetError(walked.assets);
      if (oversize) return oversize;
      const manifest = manifestFor(walked.assets);
      const extra = ['functions-filepath-routing-config.json', '_worker.bundle', '_routes.json'].map((name) => ({
        name,
        filename: name,
        contentType: 'application/octet-stream',
        value: name === '_worker.bundle' ? bundle.canonical : kept[name].bytes,
      }));
      const form = buildMultipart(deploymentParts(manifest, walked.headers, walked.redirects, extra));
      const encoded = base64Length(form.body.length);
      if (encoded > MAX_UPLOAD_BYTES) {
        return {
          status: 'invalid_arguments',
          field: 'functions_build',
          reason: 'deployment request over the 3 MiB limit',
          bytes: encoded,
          fallback: 'Deploy with Wrangler: wrangler pages deploy',
        };
      }
      let jwt = null;
      let uploaded = 0;
      let alreadyPresent = 0;
      let allHashes = [];
      if (walked.assets.length > 0) {
        const tokenEndpoint = accountPath(input.account_id, input.project_name, 'upload-token');
        const tokenData = await proxyData(ctx, { endpoint: tokenEndpoint, method: 'GET' });
        jwt = readJwt(tokenData);
        if (!jwt) return vendorError(tokenEndpoint, 'GET');
        const sent = await uploadMissingAssets(ctx, jwt, walked.assets);
        if (sent.error) return sent.error;
        uploaded = sent.uploaded;
        alreadyPresent = sent.alreadyPresent;
        allHashes = sent.allHashes;
      }
      const changed = rereadDeployFiles(walked.assets, walked.headers, walked.redirects);
      if (changed) return changed;
      for (const name of REQUIRED_BUILD_FILES) {
        const now = readScreened(kept[name].resolved, kept[name].id);
        if (!now || !now.equals(kept[name].bytes)) return invalid('functions_build', `file changed during deploy: ${name}`);
      }
      if (walked.assets.length > 0) {
        const upserted = await assetCall(ctx, jwt, '/pages/assets/upsert-hashes', { hashes: allHashes });
        if (!envelopeOk(upserted)) return vendorError('/pages/assets/upsert-hashes', 'POST');
      }
      const deploymentsEndpoint = accountPath(input.account_id, input.project_name, 'deployments');
      const posted = await postDeployment(ctx, deploymentsEndpoint, form);
      if (posted.error) return posted.error;
      return redact({
        deployment: posted.deployment,
        dir: root.resolved,
        files: walked.assets.length,
        uploaded,
        already_present: alreadyPresent,
        manifest: Object.keys(manifest),
        skipped: walked.skipped,
        functions: {
          main_module: bundle.main_module,
          bundle_bytes: bundle.canonical.length,
          routes: { include: routes.include, exclude: routes.exclude },
          build: buildProvenance,
        },
      }, jwt);
    },
    async d1_list_databases(input, ctx) {
      if (!accountIdOk(input && input.account_id)) return invalid('account_id');
      const page = checkInt(input && input.page, 'page', 1);
      if (page) return page;
      const perPage = checkInt(input && input.per_page, 'per_page', 1, 10000);
      if (perPage) return perPage;
      return proxyEnvelope(ctx, {
        endpoint: withQuery(`/accounts/${encodeURIComponent(input.account_id)}/d1/database`, input, ['name', 'page', 'per_page']),
        method: 'GET',
      });
    },
    async d1_get_database(input, ctx) {
      if (!accountIdOk(input && input.account_id)) return invalid('account_id');
      if (!databaseIdOk(input && input.database_id)) return invalid('database_id');
      return proxyEnvelope(ctx, {
        endpoint: `/accounts/${encodeURIComponent(input.account_id)}/d1/database/${encodeURIComponent(input.database_id)}`,
        method: 'GET',
      });
    },
    async d1_create_database(input, ctx) {
      if (!accountIdOk(input && input.account_id)) return invalid('account_id');
      if (!requiredString(input && input.name)) return invalid('name');
      if (input.primary_location_hint != null && !LOCATION_HINTS.has(input.primary_location_hint)) {
        return invalid('primary_location_hint');
      }
      const body = { name: input.name };
      if (input.primary_location_hint != null) body.primary_location_hint = input.primary_location_hint;
      return proxyEnvelope(ctx, {
        endpoint: `/accounts/${encodeURIComponent(input.account_id)}/d1/database`,
        method: 'POST',
        body,
      });
    },
    async d1_query(input, ctx) {
      if (!accountIdOk(input && input.account_id)) return invalid('account_id');
      if (!databaseIdOk(input && input.database_id)) return invalid('database_id');
      const length = sqlLengthError(input && input.sql);
      if (length) return length;
      const params = checkParams(input && input.params);
      if (params) return params;
      if (!singleSelect(input.sql)) {
        return invalid('sql', 'not a single SELECT statement; use cloudflare.pages.d1_execute');
      }
      return proxyEnvelope(ctx, {
        endpoint: d1QueryPath(input.account_id, input.database_id),
        method: 'POST',
        body: queryBody(input.sql, input.params),
      });
    },
    async d1_execute(input, ctx) {
      if (!accountIdOk(input && input.account_id)) return invalid('account_id');
      if (!databaseIdOk(input && input.database_id)) return invalid('database_id');
      const length = sqlLengthError(input && input.sql);
      if (length) return length;
      const params = checkParams(input && input.params);
      if (params) return params;
      return proxyEnvelope(ctx, {
        endpoint: d1QueryPath(input.account_id, input.database_id),
        method: 'POST',
        body: queryBody(input.sql, input.params),
      });
    },
    async d1_apply_migration(input, ctx) {
      if (!accountIdOk(input && input.account_id)) return invalid('account_id');
      if (!databaseIdOk(input && input.database_id)) return invalid('database_id');
      const refused = refusedSet();
      const file = screenMigrationFile(input && input.file, refused);
      if (file.error) return file.error;
      const endpoint = d1QueryPath(input.account_id, input.database_id);
      const created = await proxyData(ctx, {
        endpoint,
        method: 'POST',
        body: { sql: MIGRATION_TABLE_SQL },
      });
      const createdRows = migrationResultRows(created, endpoint);
      if (createdRows.error) return createdRows.error;
      if (createdRows.rows.length !== 1 || createdRows.rows.some((row) => !asObject(row) || row.success !== true)) {
        return { status: 'vendor_error', endpoint, method: 'POST', reason: 'migration table not created' };
      }
      const listed = await proxyData(ctx, {
        endpoint,
        method: 'POST',
        body: { sql: 'SELECT name FROM "d1_migrations" WHERE name = ?', params: [file.name] },
      });
      const listedRows = migrationResultRows(listed, endpoint);
      if (listedRows.error) return listedRows.error;
      const first = listedRows.rows[0];
      if (listedRows.rows.length !== 1 || !asObject(first) || first.success !== true || !Array.isArray(first.results)) {
        return { status: 'vendor_error', endpoint, method: 'POST', reason: 'migration history unreadable' };
      }
      if (first.results.length > 0) {
        return { already_applied: true, name: file.name, database_id: input.database_id };
      }
      const appliedSql = `${file.text}\nINSERT INTO "d1_migrations" (name)\nvalues ('${file.name.replace(/'/g, "''")}');`;
      const applied = await proxyData(ctx, {
        endpoint,
        method: 'POST',
        body: { sql: appliedSql },
      });
      const appliedRows = migrationResultRows(applied, endpoint);
      if (appliedRows.error) return appliedRows.error;
      let rowsWritten = 0;
      for (let index = 0; index < appliedRows.rows.length; index += 1) {
        const row = appliedRows.rows[index];
        if (row && row.success === false) {
          return { status: 'vendor_error', endpoint, method: 'POST', reason: 'statement failed', statement_index: index };
        }
        const written = row && row.meta && row.meta.rows_written;
        if (typeof written === 'number' && Number.isFinite(written)) rowsWritten += written;
      }
      return {
        applied: true,
        name: file.name,
        database_id: input.database_id,
        statements: appliedRows.rows.length,
        rows_written: rowsWritten,
      };
    },
    async d1_delete_database(input, ctx) {
      if (!accountIdOk(input && input.account_id)) return invalid('account_id');
      if (!databaseIdOk(input && input.database_id)) return invalid('database_id');
      return proxyEnvelope(ctx, {
        endpoint: `/accounts/${encodeURIComponent(input.account_id)}/d1/database/${encodeURIComponent(input.database_id)}`,
        method: 'DELETE',
      });
    },
  },


  rulesets: {
    // grant ACTIVE 2026-09-08; create not run. get with an invented id was
    // catalog HTTP 400; live envelope UNVERIFIED.
    create: viaCatalog,
    get: viaCatalog,
    delete: viaCatalog,
    add_rule: viaCatalog,
    remove_rule: viaCatalog,
  },
};
