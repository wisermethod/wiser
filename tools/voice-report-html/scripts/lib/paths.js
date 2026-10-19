/**
 * Caller-named paths, screened as standards/script-contract.md requires.
 * Adapted from tools/voice-lexicon/scripts/lib/paths.js; a tool imports no
 * other tool's files, so this copy is the voice-report-html tool's own.
 *
 * This tool takes no --env, so the credential set that clause refuses is
 * empty. A destination (--output) is refused when it resolves inside this
 * tool's directory (compared by device and inode on every existing
 * ancestor), when it is a symbolic link (dangling or not), and when anything
 * already exists at the path: this tool never overwrites, so the caller
 * archives an earlier file first. It is written with no-follow where Node allows,
 * and checked again through the open descriptor before a byte is written.
 */

import {
  closeSync,
  constants,
  fstatSync,
  ftruncateSync,
  lstatSync,
  openSync,
  realpathSync,
  statSync,
  writeSync
} from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const TOOL_DIR = resolve(SCRIPT_DIR, '..', '..');

const HELP_HINT = 'Run "node scripts/voice-report-html.js help" for usage.';

export class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}

export function fail(message) {
  throw new UsageError(message);
}

export function canonical(name, candidate) {
  const absolute = resolve(candidate);
  const missing = [];
  let head = absolute;

  for (;;) {
    try {
      const real = realpathSync(head);
      return missing.length === 0 ? real : join(real, ...missing);
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') {
        fail(`Error: ${name} could not be resolved to a real path at ${head}. Confirm every folder on the way is readable by this account and that no symbolic link on it points at itself.`);
      }
      const parent = dirname(head);
      if (parent === head) return absolute;
      missing.unshift(basename(head));
      head = parent;
    }
  }
}

function requireAbsolute(name, value) {
  if (typeof value !== 'string' || value.length === 0) {
    fail(`Error: ${name} needs a path. ${HELP_HINT}`);
  }
  if (!isAbsolute(value)) {
    fail(`Error: ${name} must be an absolute path; got "${value}", which would resolve against whatever directory the caller happened to be in. Pass the full path.`);
  }
}

/**
 * Screen a source file. The returned path is the one every later open uses.
 */
export function screenSource(name, value) {
  requireAbsolute(name, value);
  const resolved = canonical(name, value);

  let info;
  try {
    info = statSync(resolved);
  } catch {
    fail(`Error: ${name} names no file at ${resolved}. Pass an absolute path to a readable file.`);
  }
  if (!info.isFile()) {
    fail(`Error: ${name} ${resolved} is not a regular file. Pass an absolute path to a readable file.`);
  }
  try {
    lstatSync(resolved);
  } catch {
    fail(`Error: ${name} could not be resolved to a real path at ${resolved}. Confirm every folder on the way is readable by this account and that no symbolic link on it points at itself.`);
  }
  return resolved;
}

function identity(path) {
  try {
    const info = statSync(path);
    return { dev: info.dev, ino: info.ino, isDirectory: info.isDirectory(), isFile: info.isFile() };
  } catch {
    return null;
  }
}

function linkInfo(path) {
  try {
    return lstatSync(path);
  } catch {
    return null;
  }
}

export function sameFile(left, right) {
  const a = identity(left);
  const b = identity(right);
  return Boolean(a && b && a.dev === b.dev && a.ino === b.ino);
}

function refuseExisting(name, shown, info) {
  if (info.isSymbolicLink()) {
    fail(`Error: ${name} ${shown} is a symbolic link; this tool never writes through one. Pass the path of a regular file, or of one that does not exist yet.`);
  }
  if (info.isDirectory()) {
    fail(`Error: ${name} ${shown} is a directory. Pass the absolute path of the file to write.`);
  }
  if (!info.isFile()) {
    fail(`Error: ${name} ${shown} exists and is not a regular file (a device, FIFO or socket). Pass the path of a regular file, or of one that does not exist yet.`);
  }
  if (info.nlink > 1) {
    fail(`Error: ${name} ${shown} has ${info.nlink} hard links; writing it would change every other name for the same file. Pass a new path.`);
  }
}

/**
 * Screen a destination file. Refused inside this tool's directory, on a
 * symbolic link, on an existing non-regular or multiply linked file, or
 * below a folder that does not exist.
 */
export function screenDestination(name, value) {
  requireAbsolute(name, value);

  // The final component as the caller spelled it: a link here is refused
  // before canonicalizing could follow it (or, dangling, fail to).
  const spelled = linkInfo(value);
  if (spelled) refuseExisting(name, value, spelled);

  const resolved = canonical(name, value);
  const found = linkInfo(resolved);
  if (found) refuseExisting(name, resolved, found);
  if (spelled || found) {
    fail(`Error: ${name} ${resolved} already exists, and this tool never overwrites a file. Archive the earlier file per standards/conventions.md Archives, then run again, or pass a new path.`);
  }

  const toolIdentity = identity(TOOL_DIR);
  let toolReal = TOOL_DIR;
  try {
    toolReal = realpathSync(TOOL_DIR);
  } catch {
    // The identity comparison below still runs on whatever exists.
  }
  const refuseInside = () => fail(`Error: ${name} ${resolved} is inside the voice-report-html tool directory, where a tool never writes its output. Pass a path in the owning root's work directory instead.`);

  if (resolved === toolReal || resolved.startsWith(toolReal + sep)) refuseInside();
  let head = resolved;
  for (;;) {
    const here = identity(head);
    if (here && toolIdentity && here.dev === toolIdentity.dev && here.ino === toolIdentity.ino) refuseInside();
    const parent = dirname(head);
    if (parent === head) break;
    head = parent;
  }

  const parent = identity(dirname(resolved));
  if (!parent || !parent.isDirectory) {
    fail(`Error: ${name} ${resolved} is in a folder that does not exist (${dirname(resolved)}). Create that folder first, or pass a path in one that exists.`);
  }
  return resolved;
}

/**
 * Write a screened destination: opened with no-follow (and non-blocking, so
 * a FIFO swapped in fails rather than waits), checked through the descriptor
 * as a regular file with one link, and only then truncated and written.
 */
export function writeDestination(name, path, content) {
  const flags = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL
    | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0);
  let fd;
  try {
    fd = openSync(path, flags, 0o644);
  } catch (error) {
    if (error.code === 'EEXIST') {
      fail(`Error: ${name} ${path} already exists, and this tool never overwrites a file. Archive the earlier file per standards/conventions.md Archives, then run again, or pass a new path.`);
    }
    if (error.code === 'ELOOP') {
      fail(`Error: ${name} ${path} is a symbolic link; this tool never writes through one. Pass the path of a regular file, or of one that does not exist yet.`);
    }
    if (error.code === 'ENXIO') {
      fail(`Error: ${name} ${path} exists and is not a regular file (a device, FIFO or socket). Pass the path of a regular file, or of one that does not exist yet.`);
    }
    fail(`Error: ${name} ${path} could not be written (${error.code || 'open failed'}). Pass a path in a folder this account can write.`);
  }
  try {
    refuseExisting(name, path, fstatSync(fd));
    ftruncateSync(fd, 0);
    const buffer = Buffer.from(content, 'utf8');
    let offset = 0;
    while (offset < buffer.length) offset += writeSync(fd, buffer, offset, buffer.length - offset, offset);
  } catch (error) {
    if (error && error.name === 'UsageError') throw error;
    fail(`Error: ${name} ${path} could not be written (${error.code || 'write failed'}). Pass a path in a folder this account can write.`);
  } finally {
    closeSync(fd);
  }
}
