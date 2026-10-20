import {
  chmodSync, closeSync, constants, fchmodSync, fsyncSync, lstatSync, mkdirSync, openSync,
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
 * Best effort, without creating a directory or following a link. A failure on
 * one entry leaves it alone and does not stop the remaining entries or a call.
 * @param {string | null} outputsDir
 * @param {number} [now]
 */
export function cleanupOutputs(outputsDir, now = Date.now()) {
  if (!outputsDir) return;
  let names;
  try {
    const dir = lstatSync(outputsDir);
    if (dir.isSymbolicLink() || !dir.isDirectory()) return;
    names = readdirSync(outputsDir);
  } catch { return; }
  for (const name of names) {
    try {
      const path = join(outputsDir, name);
      const st = lstatSync(path);
      if (st.isFile() && st.nlink === 1 && OUTPUT_NAME.test(name) && now - st.mtimeMs > RETENTION_MS) {
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
  if (isStatusObject(result) || !result || typeof result !== 'object' || !Object.hasOwn(result, 'output_file')) return result;
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
  try {
    // Keep a snapshot for both the write and its digest, including a view that
    // spans only part of a Uint8Array's underlying buffer.
    const data = Buffer.from(bytes);
    const sha256 = createHash('sha256').update(data).digest('hex');
    const { output_file: _slot, ...out } = result;
    const name = `${cid}.${OUTPUT_EXTENSIONS[mediaType]}`;
    const path = join(outputsDir, name);
    const answer = { ...out, file: { path, bytes: data.length, sha256, media_type: mediaType } };
    try { mkdirSync(outputsDir, { mode: 0o700 }); } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
    const dir = lstatSync(outputsDir);
    if (dir.isSymbolicLink() || !dir.isDirectory()) return refused('outputs_not_clean', { entry: basename(outputsDir) });
    chmodSync(outputsDir, 0o700);
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
      try { unlinkSync(partial); } catch { /* Never remove a file we did not create. */ }
    }
  }
}
