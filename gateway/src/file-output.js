import {
  chmodSync, closeSync, constants, fchmodSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync,
  readdirSync, renameSync, unlinkSync, writeSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, join } from 'node:path';
import { STATUS, isStatusObject, statusObject } from './errors.js';

/** The closed table shared by manifest validation, naming and cleanup. */
export const OUTPUT_EXTENSIONS = Object.freeze({ 'audio/mpeg': 'mp3' });

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const CORRELATION_ID = new RegExp(`^${UUID}$`);
const extensions = Object.values(OUTPUT_EXTENSIONS).map((ext) => ext.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const OUTPUT_NAME = new RegExp(`^${UUID}\\.(?:${extensions.join('|')})(?:\\.partial)?$`);
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

function refused(detail, extra = {}) {
  return statusObject(STATUS.VENDOR_ERROR, { reason: 'output_refused', detail, ...extra });
}

/**
 * A copy of `result` without its `output_file` member. A status object, or a
 * thrown status, from a file-output action can still carry the slot a module
 * built before it gave up; the slot never reaches a tool answer that way.
 * @param {unknown} result
 */
export function stripSlot(result) {
  if (!result || typeof result !== 'object' || !Object.hasOwn(result, 'output_file')) return result;
  const { output_file: _slot, ...rest } = result;
  return rest;
}

/**
 * Open `outputsDir` itself, refusing a symbolic link or a non-directory, and
 * return its descriptor and identity. Node has no openat, so later steps go by
 * path; each one re-checks that the path still names this same directory.
 * @param {string} outputsDir
 */
function openDirectory(outputsDir) {
  const fd = openSync(outputsDir, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  const st = fstatSync(fd);
  return { fd, dev: st.dev, ino: st.ino };
}

/** True while the path still names the directory that was opened. */
function sameDirectory(outputsDir, dir) {
  try {
    const st = lstatSync(outputsDir);
    return !st.isSymbolicLink() && st.isDirectory() && st.dev === dir.dev && st.ino === dir.ino;
  } catch { return false; }
}

/**
 * Best effort, without creating a directory or following a link. A failure on
 * one entry leaves it alone and does not stop the remaining entries or a call.
 * @param {string | null} outputsDir
 * @param {number} [now]
 */
export function cleanupOutputs(outputsDir, now = Date.now()) {
  if (!outputsDir) return;
  let dir;
  let names;
  try {
    const st = lstatSync(outputsDir);
    if (st.isSymbolicLink() || !st.isDirectory()) return;
    dir = { dev: st.dev, ino: st.ino };
    names = readdirSync(outputsDir);
  } catch { return; }
  for (const name of names) {
    try {
      if (!OUTPUT_NAME.test(name)) continue;
      // The directory is re-checked before every removal, so a path swapped for a
      // link after the open stops the sweep rather than reaching its target.
      if (!sameDirectory(outputsDir, dir)) return;
      const path = join(outputsDir, name);
      const st = lstatSync(path);
      if (st.isFile() && st.nlink === 1 && now - st.mtimeMs > RETENTION_MS) {
        unlinkSync(path);
      }
    } catch { /* Leave an unreadable or unremovable entry alone. */ }
  }
}

/**
 * Replace the module's declared byte slot with metadata. Every refusal drops
 * the whole result, so an invalid slot cannot be serialised into a tool answer.
 * All filesystem operations are synchronous: another call in this process
 * cannot interleave its screen, cleanup or rename with this write.
 * @param {object} declaration
 * @param {unknown} result
 * @param {string} outputsDir
 * @param {string} cid The correlation id already assigned by withAudit.
 */
export function writeOutputFile(declaration, result, outputsDir, cid) {
  if (isStatusObject(result)) return stripSlot(result);
  if (!result || typeof result !== 'object' || !Object.hasOwn(result, 'output_file')) return result;
  const slot = result.output_file;
  const mediaType = slot?.media_type;
  if (!declaration.media_types.includes(mediaType) || !Object.hasOwn(OUTPUT_EXTENSIONS, mediaType)) {
    return refused('undeclared_type');
  }
  const bytes = slot.data;
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) return refused('not_bytes');
  if (bytes.byteLength === 0) return refused('empty');
  if (bytes.byteLength > declaration.max_bytes) return refused('over_cap');
  if (!CORRELATION_ID.test(cid)) return refused('write_failed');

  let partial;
  let created = false;
  let fd;
  let dir;
  try {
    // Keep a snapshot for both the write and its digest, including a view that
    // spans only part of a Uint8Array's underlying buffer.
    const data = Buffer.from(bytes);
    const sha256 = createHash('sha256').update(data).digest('hex');
    const { output_file: _slot, ...out } = result;
    const name = `${cid}.${OUTPUT_EXTENSIONS[mediaType]}`;
    const path = join(outputsDir, name);
    const answer = { ...out, file: { path, bytes: data.length, sha256, media_type: mediaType } };
    try {
      mkdirSync(outputsDir, { mode: 0o700 });
      // A restrictive umask can leave the new directory unreadable to its owner.
      // It was created a moment ago by this call; its mode is set by path only
      // while the path is still a real directory, never through a link, and the
      // open below refuses it if it has since become one.
      const made = lstatSync(outputsDir);
      if (!made.isSymbolicLink() && made.isDirectory()) chmodSync(outputsDir, 0o700);
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
    try {
      dir = openDirectory(outputsDir);
    } catch {
      return refused('outputs_not_clean', { entry: basename(outputsDir) });
    }
    fchmodSync(dir.fd, 0o700);
    for (const name of readdirSync(outputsDir)) {
      const st = lstatSync(join(outputsDir, name));
      if (st.isSymbolicLink() || !st.isFile() || st.nlink > 1) {
        return refused('outputs_not_clean', { entry: name });
      }
    }
    cleanupOutputs(outputsDir);
    partial = join(outputsDir, `${name}.partial`);
    fd = openSync(partial, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    created = true;
    fchmodSync(fd, 0o600);
    // The file just created must be the one the path names, in the directory
    // that was opened: a directory swapped between the screen and the open fails here.
    const opened = fstatSync(fd);
    const named = lstatSync(partial);
    if (!sameDirectory(outputsDir, dir) || named.dev !== opened.dev || named.ino !== opened.ino) {
      throw new Error('outputs directory changed');
    }
    let offset = 0;
    while (offset < data.length) {
      const written = writeSync(fd, data, offset, data.length - offset);
      if (written <= 0) throw new Error('incomplete output write');
      offset += written;
    }
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    try {
      lstatSync(path);
      return refused('write_failed');
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    if (!sameDirectory(outputsDir, dir)) throw new Error('outputs directory changed');
    renameSync(partial, path);
    created = false;
    return answer;
  } catch {
    return refused('write_failed');
  } finally {
    if (fd !== undefined) {
      try { closeSync(fd); } catch { /* Best effort after a failed write. */ }
    }
    if (created) {
      // Only the partial this call created, and a second try if the first fails.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try { unlinkSync(partial); break; } catch { /* Retried once, then left. */ }
      }
    }
    if (dir) {
      try { closeSync(dir.fd); } catch { /* Best effort. */ }
    }
  }
}
