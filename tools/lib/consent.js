/**
 * Person-scoped and matching plugin-copy consent for first-run installs.
 *
 * Every Node entry script that installs anything imports this file by a path
 * resolved from the script itself. Node built-ins and tools/lib/ only.
 *
 * API:
 *   pluginRoot(fromFile) -> string | null
 *     Walk up from the script to the nearest directory that contains
 *     tools/AGENTS.md, and return that directory's realpath.
 *   parsedInstallFlag(argv, valueFlags) -> boolean
 *     True when argv carries a bare --install that is not the value of a flag
 *     in valueFlags. Does not read process.argv.
 *   flagAuthorised(install) -> boolean
 *     True when the tool's parsed install flag is true, or WISER_ALLOW_INSTALL=1.
 *     Does not read process.argv. A value whose text is --install is not consent.
 *   installAuthorised(fromFile, install) -> boolean
 *     Accept the parsed flag/environment, a matching copy marker, or a valid
 *     person marker. Help never calls this.
 *   writeConsent(fromFile, tool, install) -> void
 *     On explicit consent, write the person marker and the matching copy marker,
 *     owner-only, at the moment an authorised install runs.
 */

import { closeSync, constants, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { wiserUserConfigDir } from './user-config.js';

export const INSTALL_ONCE = "You'll only be asked once: your yes also covers anything else Wiser needs to download later, including after updates.";
export const INSTALL_HELP = "Say yes to the download this tool needs. You'll only be asked once: your yes also covers anything else Wiser needs to download later, including after updates.";

export const INSTALL_COPY_ONLY = "Wiser will install this, but it can only remember your yes until the next Wiser update, so you may be asked again then. Reason: ";
export const INSTALL_NOT_SAVED = "Wiser will install this now, but it couldn't remember your yes, so you'll be asked again next time. Reason: ";

export function installQuestion(what, purpose, size) {
  return 'This Wiser skill needs to download and install ' + what + ' on your machine in order to ' + purpose + '.'
    + (size ? " It's about " + size + '.' : '') + ' ' + INSTALL_ONCE;
}

// Decimal units for measured install footprints, rounded for the member question.
export function formatInstallSize(bytes) {
  const kb = Math.max(1, Math.round(bytes / 1000));
  const tenths = Math.round(bytes / 100000);
  const mb = bytes / 1e6;
  if (mb < 1) return kb < 1000 ? `${kb} KB` : '1.0 MB';
  if (mb < 10) return tenths < 100 ? `${(tenths / 10).toFixed(1)} MB` : '10 MB';
  const rounded = Math.round(mb / (mb >= 100 ? 10 : 1)) * (mb >= 100 ? 10 : 1);
  return rounded >= 1000 ? `${(Math.round(bytes / 1e8) / 10).toFixed(1)} GB` : `${rounded} MB`;
}

const MARKER_NAME = '.wiser-consent';

export function pluginRoot(fromFile) {
  let dir = dirname(fromFile);
  for (;;) {
    if (existsSync(join(dir, 'tools', 'AGENTS.md'))) {
      try {
        return realpathSync(dir);
      } catch {
        return null;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * A bare `--install` in `argv`, ignoring tokens that belong to `valueFlags`.
 * The next word after a value flag is its value, including a value spelled
 * `--install`. This does not read `process.argv`.
 * @param {readonly string[]} argv
 * @param {ReadonlySet<string>} [valueFlags]
 * @returns {boolean}
 */
export function parsedInstallFlag(argv, valueFlags) {
  const flags = valueFlags || new Set();
  const values = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    if (values.has(index)) continue;
    if (flags.has(argv[index])) values.add(index + 1);
  }
  for (let index = 0; index < argv.length; index += 1) {
    if (values.has(index)) continue;
    if (argv[index] === '--install') return true;
  }
  return false;
}

/**
 * @param {boolean} install the tool's parsed bare `--install`, never an argv scan
 * @returns {boolean}
 */
export function flagAuthorised(install) {
  return install === true || process.env.WISER_ALLOW_INSTALL === '1';
}

// Windows trusts the marker by its location in the person's own profile.
// POSIX additionally checks the directory and the opened file, without links.
export function trustedDirectory(dir) {
  const info = lstatSync(dir);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('the user-config directory is not a real directory');
  if (process.platform !== 'win32') {
    if (info.uid !== process.getuid()) throw new Error('the user-config directory is owned by another user');
    if (info.mode & 0o022) throw new Error('the user-config directory is writable by group or others');
  }
}

function personConsent() {
  let fd;
  try {
    const dir = wiserUserConfigDir();
    trustedDirectory(dir);
    fd = openSync(join(dir, MARKER_NAME), constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    const info = fstatSync(fd);
    if (!info.isFile() || (process.platform !== 'win32' &&
        (info.uid !== process.getuid() || (info.mode & 0o022)))) return false;
    const data = JSON.parse(readFileSync(fd, 'utf8'));
    return data?.scope === 'person' && typeof data.tool === 'string' && data.tool.length > 0 &&
      typeof data.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.date) && !data.date.startsWith('0000-') &&
      Number.isFinite(Date.parse(data.date)) && new Date(data.date).toISOString().slice(0, 10) === data.date;
  } catch { return false; }
  finally { if (fd !== undefined) closeSync(fd); }
}

export function installAuthorised(fromFile, install) {
  if (flagAuthorised(install) || personConsent()) return true;
  const root = pluginRoot(fromFile);
  if (!root) return false;
  let fd;
  try {
    fd = openSync(join(root, MARKER_NAME), constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    if (!fstatSync(fd).isFile()) return false;
    const data = JSON.parse(readFileSync(fd, 'utf8'));
    return typeof data?.realpath === 'string' && data.realpath === root;
  } catch {
    return false;
  } finally { if (fd !== undefined) closeSync(fd); }
}

// Publish a new file rather than truncating a potentially linked marker.
function writeMarker(file, data) {
  const temporary = `${file}.tmp-${randomUUID()}`;
  let fd;
  try {
    fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW || 0), 0o600);
    writeFileSync(fd, `${JSON.stringify(data)}\n`);
    closeSync(fd); fd = undefined;
    renameSync(temporary, file);
  } finally {
    if (fd !== undefined) closeSync(fd);
    rmSync(temporary, { force: true });
  }
}

const warned = new Set();
function copyOnly(error, saved = true) {
  const reason = String(error.message || error.code || error).split(/[\r\n]/)[0];
  const message = `${saved ? INSTALL_COPY_ONLY : INSTALL_NOT_SAVED}${reason}.`;
  if (!warned.has(message)) { process.stderr.write(`${message}\n`); warned.add(message); }
}

export function writeConsent(fromFile, tool, install) {
  if (!flagAuthorised(install)) {
    if (!installAuthorised(fromFile, false)) return;
    // An inherited copy grant still works when the person directory is unsafe.
    if (!personConsent()) {
      try { trustedDirectory(wiserUserConfigDir()); } catch (error) { copyOnly(error); }
    }
    return;
  }
  const root = pluginRoot(fromFile);
  const date = new Date().toISOString().slice(0, 10);
  let personError;
  let copySaved = false;
  try {
    const dir = wiserUserConfigDir();
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    trustedDirectory(dir);
    writeMarker(join(dir, MARKER_NAME), { scope: 'person', date, tool });
  } catch (error) { personError = error; }
  if (root) {
    try { writeMarker(join(root, MARKER_NAME), { realpath: root, date, tool }); copySaved = true; }
    catch { /* Explicit authorisation still permits this install. */ }
  }
  if (personError) copyOnly(personError, copySaved);
}

// Allocated bytes measured on macOS ARM64, 2026-10-28 (du -sk times 1024).
export const INSTALL_BYTES = Object.freeze({
  chromium: 578678784, playwright: 19120128, mermaid: 64602112, reveal: 6045696,
  image: 16936960, harvester: 3768320, request: 1617920, data: 1499136, keynote: 1310720,
});
