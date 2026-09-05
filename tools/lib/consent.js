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
 *   flagAuthorised() -> boolean
 *     True when this run carries --install or WISER_ALLOW_INSTALL=1.
 *   installAuthorised(fromFile) -> boolean
 *     True when flagAuthorised(), or when .wiser-consent at the plugin root
 *     records a realpath equal to the current plugin root. A missing, unreadable,
 *     or mismatched marker is not consent. help never calls this.
 *   writeConsent(fromFile, tool) -> void
 *     When flagAuthorised(), write .wiser-consent at the plugin root: one JSON
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

export function flagAuthorised() {
  return process.argv.includes('--install') || process.env.WISER_ALLOW_INSTALL === '1';
}

export function installAuthorised(fromFile) {
  if (flagAuthorised()) return true;
  const root = pluginRoot(fromFile);
  if (!root) return false;
  try {
    const data = JSON.parse(readFileSync(join(root, MARKER_NAME), 'utf8'));
    return typeof data?.realpath === 'string' && data.realpath === root;
  } catch {
    return false;
  }
}

export function writeConsent(fromFile, tool) {
  if (!flagAuthorised()) return;
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
