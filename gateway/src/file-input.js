/**
 * screenInputFiles(paths, declaration, schema, options) synchronously returns an
 * ordered array of { path, dev, ino, size, name, media_type }, or invalid_arguments.
 * declaration is { field, max_bytes }; schema is that field's bounded array schema.
 * options supplies home, the actual envPath (including its default), secretFiles
 * (a service-to-path object or array), and optional secretsDir. No content is read.
 * readInputFiles(screened) accepts only an array returned here and synchronously
 * returns { data: Buffer, name, media_type, size, sha256 } records, or a refusal.
 * Both use fixed input_file_refused/unreadable/changed/too_large reasons with the
 * declared field and optional index. Neither performs I/O at import. Screen state
 * and caps are private copies. Each occurrence gets one bounded descriptor read.
 * Links at any component, even before '..', and all multiply linked files are
 * refused. A spelling through a linked ancestor is refused; give the real path.
 */
import {
  accessSync, closeSync, constants, fstatSync, lstatSync, openSync, readlinkSync, readSync, realpathSync, statSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, dirname, extname, isAbsolute, join, normalize, parse, relative, sep } from 'node:path';
import { STATUS, statusObject } from './errors.js';

const FIELD = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const ENV_NAME = /(?:^\.env(?:[.-].*)?$|\.env$)/i;
const screenedBatches = new WeakMap();
const MEDIA_TYPES = Object.freeze({
  '.pdf': 'application/pdf', '.txt': 'text/plain', '.md': 'text/markdown',
  '.csv': 'text/csv', '.tsv': 'text/tab-separated-values', '.html': 'text/html', '.htm': 'text/html',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.zip': 'application/zip',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
});

class FileRefusal extends Error {
  constructor(reason) { super(reason); this.reason = reason; }
}

function fail(reason = 'input_file_refused') { throw new FileRefusal(reason); }

function refusal(err, field, index) {
  return statusObject(STATUS.INVALID_ARGUMENTS, {
    field, reason: err instanceof FileRefusal ? err.reason : 'input_file_unreadable',
    ...(index === undefined ? {} : { index }),
  });
}

function positiveInteger(value) { return Number.isSafeInteger(value) && value > 0; }

// Nothing is expanded, so a '$' or '%' in an absolute path is that file's own name.
function nativePath(value) {
  if (typeof value !== 'string' || !isAbsolute(value) || value.includes('\u0000') ||
      [...value].some((c) => c.codePointAt(0) >= 0xd800 && c.codePointAt(0) <= 0xdfff)) fail();
  return value;
}

function identity(st) {
  if (!Number.isSafeInteger(st.dev) || st.dev < 0 || !positiveInteger(st.ino)) fail();
  return { dev: st.dev, ino: st.ino };
}

function sameIdentity(a, b) { return a.dev === b.dev && a.ino === b.ino; }

function sameMetadata(a, b) {
  return sameIdentity(a, b) && a.size === b.size && a.nlink === b.nlink && a.mode === b.mode &&
    a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
}

function inside(path, directory) {
  const tail = relative(directory, path);
  return tail === '' || (tail !== '..' && !tail.startsWith(`..${sep}`) && !isAbsolute(tail));
}

function memoryComponent(path) { return path.split(sep).some((part) => part.toLowerCase() === 'memory'); }

/** Inspect every traversed component before join/realpath can erase a '..'. */
function walk(path) {
  const root = parse(path).root;
  let current = root;
  let st = lstatSync(current);
  const ancestors = [];
  const remember = () => {
    if (st.isSymbolicLink()) fail();
    identity(st);
    if (st.isDirectory()) ancestors.push({ path: current, ...identity(st) });
  };
  remember();
  for (const part of path.slice(root.length).split(sep)) {
    if (!part) continue;
    if (!st.isDirectory()) fail();
    current = part === '..' ? dirname(current) : part === '.' ? current : join(current, part);
    st = lstatSync(current);
    remember();
  }
  return { st, ancestors };
}

/** Configuration may name missing files; resolve their deepest existing parent. */
function protectedLocation(path, directory) {
  nativePath(path);
  let ancestor = path;
  const tail = [];
  while (true) {
    try {
      const canonical = join(realpathSync(ancestor), ...tail);
      let st;
      try { st = statSync(canonical); } catch (err) { if (err.code !== 'ENOENT') throw err; }
      if (st && directory && !st.isDirectory()) fail();
      return { path: canonical, ...(st ? identity(st) : {}) };
    } catch (err) {
      if (err.code !== 'ENOENT' || dirname(ancestor) === ancestor) throw err;
      // A dangling configuration link has no cleared canonical destination.
      try { if (lstatSync(ancestor).isSymbolicLink()) fail(); } catch (missing) {
        if (missing.code !== 'ENOENT') throw missing;
      }
      tail.unshift(basename(ancestor));
      ancestor = dirname(ancestor);
    }
  }
}

/**
 * Resolve a configured path one component at a time, as realpath does, keeping the directory
 * each link sits in: realpath reports only the end of a chain, and every hop is a key location.
 */
function linkParents(path) {
  const parents = [];
  let pending = path.split(sep).filter(Boolean);
  let resolved = parse(path).root;
  for (let hops = 0; pending.length;) {
    const part = pending.shift();
    if (part === '.') continue;
    if (part === '..') { resolved = dirname(resolved); continue; }
    const next = join(resolved, part);
    let st;
    try { st = lstatSync(next); } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      resolved = next;
      continue;
    }
    if (!st.isSymbolicLink()) { resolved = next; continue; }
    hops += 1;
    if (hops > 40) fail();
    // A system link at the root, such as macOS's /tmp or /var, would otherwise guard the whole disk.
    if (resolved !== parse(resolved).root) parents.push(resolved);
    const target = readlinkSync(next);
    pending = [...target.split(sep).filter(Boolean), ...pending];
    if (isAbsolute(target)) resolved = parse(target).root;
  }
  return parents;
}

function protection(options) {
  const files = [options.envPath, ...options.secretFiles].map((p) => protectedLocation(p, false));
  const linked = [options.envPath, ...options.secretFiles, ...(options.secretsDir ? [options.secretsDir] : [])];
  // A linked key file guards the directory it resolves into, and every directory a link on the way sits in.
  const directories = [options.home, dirname(options.envPath), ...options.secretFiles.map((p) => dirname(p)),
    ...files.map((file) => dirname(file.path)), ...linked.flatMap(linkParents),
    ...(options.secretsDir ? [options.secretsDir] : [])].map((p) => protectedLocation(p, true));
  return { files, directories };
}

function copyOptions(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) fail();
  const secretFiles = options.secretFiles ?? {};
  if (!secretFiles || typeof secretFiles !== 'object') fail();
  const out = {
    home: nativePath(options.home), envPath: nativePath(options.envPath),
    secretFiles: Object.values(secretFiles).map(nativePath),
    secretsDir: options.secretsDir == null ? null : nativePath(options.secretsDir),
  };
  return out;
}

function unchangedAncestors(ancestors) {
  for (const dir of ancestors) {
    const st = lstatSync(dir.path);
    if (st.isSymbolicLink() || !st.isDirectory() || !sameIdentity(st, dir)) fail('input_file_changed');
  }
}

// macOS's /.vol names a file by device and inode, around every name this screen checks.
// Normalised and case-folded, so `//.vol`, `/./.vol`, `/x/../.vol` and `/.VOL` are caught too.
function volfs(path) { return normalize(path).split(sep)[1]?.toLowerCase() === '.vol'; }

function inspect(path, guards) {
  if (volfs(path) || memoryComponent(path) || ENV_NAME.test(basename(path))) fail();
  const spelled = walk(path);
  const canonical = realpathSync(path);
  if (volfs(canonical) || memoryComponent(canonical) || ENV_NAME.test(basename(canonical))) fail();
  const resolved = walk(canonical);
  const st = resolved.st;
  if (!st.isFile() || st.nlink !== 1) fail();
  identity(st);
  if (!Number.isSafeInteger(st.size) || st.size < 0 || !Number.isFinite(st.mtimeMs) || !Number.isFinite(st.ctimeMs)) fail();
  const ancestors = [...spelled.ancestors, ...resolved.ancestors];
  for (const guard of guards) {
    if (guard.files.some((file) => canonical === file.path || sameIdentity(st, file)) ||
        guard.directories.some((dir) => inside(canonical, dir.path) ||
          ancestors.some((entry) => sameIdentity(entry, dir)))) fail();
  }
  if (!sameMetadata(st, spelled.st)) fail('input_file_changed');
  unchangedAncestors(ancestors);
  // access checks ACLs; the mode check refuses a file with no read bit, even for a privileged uid.
  if ((st.mode & 0o444) === 0) fail('input_file_unreadable');
  accessSync(canonical, constants.R_OK);
  return {
    record: { path: canonical, ...identity(st), size: st.size, name: basename(canonical),
      media_type: MEDIA_TYPES[extname(canonical).toLowerCase()] || 'application/octet-stream' },
    st, ancestors,
  };
}

function available() {
  if (!positiveInteger(constants.O_NOFOLLOW) || !positiveInteger(constants.O_NONBLOCK)) fail();
}

/** The field schema is checked here too; all string/count checks precede I/O. */
export function screenInputFiles(paths, declaration, schema, options) {
  const validField = typeof declaration?.field === 'string' && FIELD.test(declaration.field) && !/\s/.test(declaration.field);
  const field = validField ? declaration.field : 'input';
  let index;
  try {
    available();
    if (!validField) fail();
    const cap = declaration.max_bytes;
    if (!positiveInteger(cap) || schema?.type !== 'array' || schema.items?.type !== 'string' ||
        !positiveInteger(schema.minItems) || !positiveInteger(schema.maxItems) || schema.minItems > schema.maxItems ||
        !positiveInteger(schema.items.minLength) || !positiveInteger(schema.items.maxLength) ||
        schema.items.minLength > schema.items.maxLength) fail();
    let pattern;
    if (Object.hasOwn(schema.items, 'pattern')) {
      if (typeof schema.items.pattern !== 'string') fail();
      try { pattern = new RegExp(schema.items.pattern); } catch { fail(); }
    }
    if (!Array.isArray(paths) || paths.length < schema.minItems || paths.length > schema.maxItems) fail();
    const spellings = [];
    for (index = 0; index < paths.length; index += 1) {
      const path = nativePath(paths[index]);
      const length = [...path].length;
      if (length < schema.items.minLength || length > schema.items.maxLength || (pattern && !pattern.test(path))) fail();
      spellings.push(path);
    }
    index = undefined;
    const access = copyOptions(options);
    const guards = protection(access);
    const entries = [];
    let total = 0;
    for (index = 0; index < spellings.length; index += 1) {
      const entry = inspect(spellings[index], [guards]);
      if (entry.st.size > cap - total) fail('input_file_too_large');
      total += entry.st.size;
      entries.push({ ...entry, spelling: spellings[index] });
    }
    const screened = Object.freeze(entries.map((entry) => Object.freeze(entry.record)));
    screenedBatches.set(screened, { entries, cap, field, access, guards });
    return screened;
  } catch (err) { return refusal(err, field, index); }
}

function recheck(entry, batch) {
  unchangedAncestors(entry.ancestors);
  const current = inspect(entry.spelling, [batch.guards, protection(batch.access)]);
  if (current.record.path !== entry.record.path || !sameMetadata(current.st, entry.st)) fail('input_file_changed');
  return current;
}

/** Open each occurrence once; never follow a leaf link or block on a FIFO. */
export function readInputFiles(screened) {
  const batch = screenedBatches.get(screened);
  if (!batch) return refusal(new FileRefusal('input_file_refused'), 'input');
  let index;
  try {
    available();
    // Re-screen the whole batch before opening any source for content.
    for (index = 0; index < batch.entries.length; index += 1) recheck(batch.entries[index], batch);
    const records = [];
    let total = 0;
    for (index = 0; index < batch.entries.length; index += 1) {
      const entry = batch.entries[index];
      let fd;
      try {
        recheck(entry, batch);
        fd = openSync(entry.record.path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
        const before = fstatSync(fd);
        identity(before);
        if (!before.isFile() || before.nlink !== 1 || !sameMetadata(before, entry.st)) fail('input_file_changed');
        recheck(entry, batch);
        if (before.size > batch.cap - total) fail('input_file_too_large');
        const data = Buffer.alloc(before.size);
        let offset = 0;
        while (offset < data.length) {
          const n = readSync(fd, data, offset, Math.min(65536, data.length - offset), offset);
          if (!Number.isSafeInteger(n) || n <= 0 || n > Math.min(65536, data.length - offset)) fail('input_file_changed');
          offset += n;
        }
        // Probe EOF without retaining any growth beyond the screened allocation.
        if (readSync(fd, Buffer.alloc(1), 0, 1, offset) !== 0) {
          fail(total + offset >= batch.cap ? 'input_file_too_large' : 'input_file_changed');
        }
        const after = fstatSync(fd);
        if (!after.isFile() || after.nlink !== 1 || !sameMetadata(after, before)) fail('input_file_changed');
        recheck(entry, batch);
        total += data.length;
        records.push({ data, name: entry.record.name, media_type: entry.record.media_type, size: data.length,
          sha256: createHash('sha256').update(data).digest('hex') });
      } finally {
        if (fd !== undefined) closeSync(fd);
      }
    }
    return records;
  } catch (err) { return refusal(err, batch.field, index); }
}
