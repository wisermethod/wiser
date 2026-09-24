/**
 * Plugin-copy consent for first-run installs.
 *
 * Every Node entry script that installs anything imports this file by a path
 * resolved from the script itself. Node built-ins only.
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
 *     True when flagAuthorised(install), or when .wiser-consent at the plugin root
 *     records a realpath equal to the current plugin root. A missing, unreadable,
 *     or mismatched marker is not consent. help never calls this.
 *   writeConsent(fromFile, tool, install) -> void
 *     When flagAuthorised(install), write .wiser-consent at the plugin root: one JSON
 *     object with realpath, date (YYYY-MM-DD), and the tool that wrote it, mode
 *     0600. A mismatched marker is overwritten. Called at the moment an authorised
 *     install runs, so a survey check without --install never reaches it.
 */

import { chmodSync, existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

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

export function installAuthorised(fromFile, install) {
  if (flagAuthorised(install)) return true;
  const root = pluginRoot(fromFile);
  if (!root) return false;
  try {
    const data = JSON.parse(readFileSync(join(root, MARKER_NAME), 'utf8'));
    return typeof data?.realpath === 'string' && data.realpath === root;
  } catch {
    return false;
  }
}

export function writeConsent(fromFile, tool, install) {
  if (!flagAuthorised(install)) return;
  const root = pluginRoot(fromFile);
  if (!root) return;
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const body = `${JSON.stringify({
    realpath: root,
    date: `${now.getFullYear()}-${month}-${day}`,
    tool
  })}\n`;
  try {
    writeFileSync(join(root, MARKER_NAME), body);
    chmodSync(join(root, MARKER_NAME), 0o600);
  } catch {
    // The authorised install still proceeds; the next tool will ask again.
  }
}
