import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync, constants as fsConstants, fstatSync, lstatSync, openSync, readFileSync, readdirSync, realpathSync, statSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, extname, join, resolve, sep } from 'node:path';

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
const MAX_BUCKET_BASE64 = 5 * 1024 * 1024;

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

function walkPages(root, refused) {
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
      if (atRoot && entry.name === '_worker.js') {
        return { error: invalid('dir', 'static kit output only') };
      }
      if (atRoot && entry.name === 'functions' && (entry.isDirectory() || isDirectoryPath(full))) {
        return { error: invalid('dir', 'static kit output only') };
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
      // Only the hash is kept. The bytes are read again, bucket by bucket, when a
      // file is uploaded, so memory holds one bucket rather than the whole site.
      assets.push({
        rel: logical,
        resolved,
        id,
        extension,
        hash: assetHash(bytes, extension),
        base64Length: Math.ceil(bytes.length / 3) * 4,
        contentType: contentTypeFor(extension),
      });
    }
  }
  assets.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  return { assets, headers, redirects, skipped };
}

// A bucket closes at 1,000 files or 5 MiB of base64, except that one file always
// fits: a file up to the 25 MiB per-file limit travels alone, as about 33 MiB of
// base64. Whether the provider's proxy accepts a request that size is UNVERIFIED.
function bucketize(items) {
  const out = [];
  let current = [];
  let size = 0;
  for (const item of items) {
    const n = item.base64Length;
    if (current.length > 0 && (current.length >= MAX_BUCKET_FILES || size + n > MAX_BUCKET_BASE64)) {
      out.push(current);
      current = [];
      size = 0;
    }
    current.push(item);
    size += n;
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
      const tokenEndpoint = accountPath(input.account_id, input.project_name, 'upload-token');
      const tokenData = await proxyData(ctx, { endpoint: tokenEndpoint, method: 'GET' });
      const jwt = readJwt(tokenData);
      if (!jwt) return vendorError(tokenEndpoint, 'GET');
      const byHash = new Map();
      for (const asset of walked.assets) {
        if (!byHash.has(asset.hash)) byHash.set(asset.hash, asset);
      }
      const allHashes = [...byHash.keys()];
      const checked = await assetCall(ctx, jwt, '/pages/assets/check-missing', { hashes: allHashes });
      const missing = readMissing(checked);
      if (!missing) return vendorError('/pages/assets/check-missing', 'POST');
      // Only hashes this deploy asked about are uploaded; anything else in the
      // answer is ignored rather than trusted.
      const missingSet = new Set(missing.filter((hash) => byHash.has(hash)));
      let uploaded = 0;
      let alreadyPresent = 0;
      for (const asset of walked.assets) {
        if (missingSet.has(asset.hash)) uploaded += 1;
        else alreadyPresent += 1;
      }
      const toUpload = [...missingSet].map((hash) => byHash.get(hash));
      for (const bucket of bucketize(toUpload)) {
        const payload = [];
        for (const asset of bucket) {
          const bytes = readScreened(asset.resolved, asset.id);
          if (!bytes || assetHash(bytes, asset.extension) !== asset.hash) {
            return invalid('dir', `file changed during deploy: ${asset.rel}`);
          }
          payload.push({
            key: asset.hash,
            value: bytes.toString('base64'),
            metadata: { contentType: asset.contentType },
            base64: true,
          });
        }
        const up = await assetCall(ctx, jwt, '/pages/assets/upload', payload);
        if (!envelopeOk(up)) return vendorError('/pages/assets/upload', 'POST');
      }
      // Every file, uploaded or already present, is read again and must still be
      // what was hashed, so the manifest describes the tree as it stands now.
      for (const asset of walked.assets) {
        const bytes = readScreened(asset.resolved, asset.id);
        if (!bytes || assetHash(bytes, asset.extension) !== asset.hash) {
          return invalid('dir', `file changed during deploy: ${asset.rel}`);
        }
      }
      for (const [name, kept] of [['_headers', walked.headers], ['_redirects', walked.redirects]]) {
        if (!kept) continue;
        const now = readScreened(kept.resolved, kept.id);
        if (!now || !now.equals(kept.bytes)) return invalid('dir', `file changed during deploy: ${name}`);
      }
      const upserted = await assetCall(ctx, jwt, '/pages/assets/upsert-hashes', { hashes: allHashes });
      if (!envelopeOk(upserted)) return vendorError('/pages/assets/upsert-hashes', 'POST');
      const manifest = {};
      for (const asset of walked.assets) manifest[`/${asset.rel}`] = asset.hash;
      const parts = [{
        name: 'manifest',
        contentType: 'application/json',
        value: Buffer.from(JSON.stringify(manifest), 'utf8'),
      }];
      if (walked.headers) {
        parts.push({
          name: '_headers',
          filename: '_headers',
          contentType: 'text/plain',
          value: walked.headers.bytes,
        });
      }
      if (walked.redirects) {
        parts.push({
          name: '_redirects',
          filename: '_redirects',
          contentType: 'text/plain',
          value: walked.redirects.bytes,
        });
      }
      const form = buildMultipart(parts);
      const deploymentsEndpoint = accountPath(input.account_id, input.project_name, 'deployments');
      const deploymentData = await proxyData(ctx, {
        endpoint: deploymentsEndpoint,
        method: 'POST',
        binary_body: {
          base64: form.body.toString('base64'),
          content_type: `multipart/form-data; boundary=${form.boundary}`,
        },
      });
      if (!envelopeOk(deploymentData) || !deploymentData.result || typeof deploymentData.result !== 'object') {
        return vendorError(deploymentsEndpoint, 'POST');
      }
      return redact({
        deployment: deploymentData.result,
        dir: root.resolved,
        files: walked.assets.length,
        uploaded,
        already_present: alreadyPresent,
        manifest: Object.keys(manifest),
        skipped: walked.skipped,
      }, jwt);
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
