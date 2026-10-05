/**
 * Caller-named paths, screened as standards/script-contract.md requires.
 *
 * This tool takes no --env and writes no file. The credential set that clause
 * refuses is empty, and the tool directory is refused for a destination only.
 * What remains, and what every open uses, is the canonical path: absolute,
 * symlink-collapsed, or refused when it cannot be resolved.
 */

import { lstatSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const TOOL_DIR = resolve(SCRIPT_DIR, '..', '..');

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

/**
 * Screen a source path. `kind` is `file` or `directory`.
 * The returned path is the one every later open must use.
 */
export function screenSource(name, value, kind) {
  if (typeof value !== 'string' || value.length === 0) {
    fail(`Error: ${name} needs a path. Run "node scripts/copy-check.js help" for usage.`);
  }
  if (!isAbsolute(value)) {
    fail(`Error: ${name} must be an absolute path; got "${value}", which would resolve against whatever directory the caller happened to be in.`);
  }

  const resolved = canonical(name, value);

  let info;
  try {
    info = statSync(resolved);
  } catch {
    fail(`Error: no ${kind} at ${resolved}. Pass an absolute path to a readable ${kind}.`);
  }

  if (kind === 'file' && !info.isFile()) {
    fail(`Error: ${name} ${resolved} is not a file.`);
  }
  if (kind === 'directory' && !info.isDirectory()) {
    fail(`Error: ${name} ${resolved} is not a directory.`);
  }

  // Touch the identity a hard link keeps. There is no --env file to refuse,
  // and a source is not refused for sitting in this tool directory.
  try {
    lstatSync(resolved);
  } catch {
    fail(`Error: ${name} could not be resolved to a real path at ${resolved}. Confirm every folder on the way is readable by this account and that no symbolic link on it points at itself.`);
  }

  return resolved;
}
