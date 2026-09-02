/**
 * Pre-mutation archive of an existing deck (or any file) into a sibling
 * zArchive/, named per standards/conventions.md § Archives.
 *
 * Name form: `YY-MM-DD Vn - <original filename and extension unchanged>`.
 * Version numbering starts at 1 and resets each calendar day. Never overwrite
 * or delete a prior archive copy.
 *
 * Node built-ins only. Callers must not mutate the source until this returns.
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

/**
 * Copy `filePath` into sibling `zArchive/` (or an explicit override directory
 * that still uses the same naming rules). Returns the absolute archive path.
 *
 * @param {string} filePath absolute path to the file being preserved
 * @param {{ archiveDir?: string }} [options] optional absolute zArchive dir
 * @returns {string} absolute path of the archive copy
 */
export function archiveBeside(filePath, options = {}) {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('archiveBeside requires an absolute file path.');
  }
  const source = resolve(filePath);
  if (!existsSync(source)) {
    throw new Error(`cannot archive: no file at ${source}`);
  }
  let sourceStat;
  try {
    sourceStat = statSync(source);
  } catch (error) {
    throw new Error(`cannot archive: could not read ${source}: ${error.message}`);
  }
  if (!sourceStat.isFile()) {
    throw new Error(`cannot archive: ${source} is not a regular file`);
  }

  const archiveDir = options.archiveDir
    ? resolve(options.archiveDir)
    : join(dirname(source), 'zArchive');

  mkdirSync(archiveDir, { recursive: true });

  const originalName = basename(source);
  const prefix = todayPrefix();
  const version = nextVersion(archiveDir, prefix, originalName);
  const archiveName = `${prefix} V${version} - ${originalName}`;
  const archivePath = join(archiveDir, archiveName);

  if (existsSync(archivePath)) {
    // nextVersion should have skipped this; refuse rather than overwrite.
    throw new Error(
      `archive path already occupied at ${archivePath}. Scan of ${archiveDir} for free Vn failed; do not overwrite prior archives.`
    );
  }

  try {
    copyFileSync(source, archivePath);
  } catch (error) {
    throw new Error(
      `archive copy failed (${source} → ${archivePath}): ${error.message}. The original was not modified.`
    );
  }

  if (!existsSync(archivePath)) {
    throw new Error(
      `archive copy reported success but ${archivePath} is missing. The original was not modified.`
    );
  }

  return archivePath;
}

/** `YY-MM-DD` for the local calendar day (the conventions.md archive exception). */
function todayPrefix() {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * Highest Vn already used today for this original name, plus one.
 * Pattern: `YY-MM-DD Vn - originalName` with originalName matched exactly.
 */
function nextVersion(archiveDir, prefix, originalName) {
  const escaped = originalName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^${prefix.replace(/-/g, '\\-')} V(\\d+) - ${escaped}$`);
  let max = 0;
  let names;
  try {
    names = readdirSync(archiveDir);
  } catch (error) {
    throw new Error(`cannot read archive directory ${archiveDir}: ${error.message}`);
  }
  for (const name of names) {
    const match = name.match(re);
    if (match) {
      const n = Number(match[1]);
      if (Number.isInteger(n) && n > max) max = n;
    }
  }
  return max + 1;
}
