import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Platform user-config directory for person-scoped files that are not gateway
 * state. Never a composed root. Never under `--home`.
 *
 * Windows: `%APPDATA%\wiser` (fallback `%USERPROFILE%\AppData\Roaming\wiser`)
 * macOS: `~/Library/Application Support/wiser`
 * Linux: `$XDG_CONFIG_HOME/wiser` or `~/.config/wiser`
 *
 * @param {string} [platform]
 * @param {NodeJS.ProcessEnv} [env]
 * @param {string} [home]
 */
export function wiserUserConfigDir(platform = process.platform, env = process.env, home = homedir()) {
  if (platform === 'win32') {
    const base = (env.APPDATA && env.APPDATA.length > 0)
      ? env.APPDATA
      : join(home, 'AppData', 'Roaming');
    return join(base, 'wiser');
  }
  if (platform === 'darwin') {
    return join(home, 'Library', 'Application Support', 'wiser');
  }
  const xdg = env.XDG_CONFIG_HOME;
  if (typeof xdg === 'string' && xdg.length > 0) return join(xdg, 'wiser');
  return join(home, '.config', 'wiser');
}

/**
 * Default `--env` path: the auth provider's project key, one file per person
 * on this machine. Not a vendor token.
 *
 * @param {string} [platform]
 * @param {NodeJS.ProcessEnv} [env]
 * @param {string} [home]
 */
export function defaultProviderEnvPath(platform = process.platform, env = process.env, home = homedir()) {
  return join(wiserUserConfigDir(platform, env, home), 'auth-provider.env');
}

/**
 * Default `--home`: connection store and audit. Matches Browser Control's
 * `~/.wiser/` precedent. Must not sit in the same directory as `--env`.
 *
 * @param {string} [home]
 */
export function defaultGatewayHome(home = homedir()) {
  return join(home, '.wiser', 'gateway');
}

const EMPTY_ENV = 'WISER_AUTH_PROVIDER_KEY=\nWISER_USER_ID=\n';
const USER_ID_RE = /^wiser-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * @param {string} text
 * @returns {Record<string, string>}
 */
export function parseEnvText(text) {
  const map = {};
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    map[line.slice(0, eq)] = line.slice(eq + 1);
  }
  return map;
}

/**
 * @param {string} value
 * @returns {boolean}
 */
export function isProviderUserId(value) {
  return typeof value === 'string' && USER_ID_RE.test(value);
}

/**
 * @param {string | null | undefined} envPath
 * @returns {string | null}
 */
export function readProviderUserId(envPath) {
  if (!envPath || !existsSync(envPath)) return null;
  let text;
  try {
    text = readFileSync(envPath, 'utf8');
  } catch {
    return null;
  }
  const value = parseEnvText(text).WISER_USER_ID;
  return isProviderUserId(value) ? value : null;
}

function writeEnvFile(file, text) {
  writeFileSync(file, text, { encoding: 'utf8', mode: 0o600 });
  try { chmodSync(file, 0o600); } catch { /* created with mode */ }
}

/**
 * Create the platform config directory and an empty project-key file if they
 * are missing. Never overwrites a file that already exists. Never writes a
 * key value. An existing file missing `WISER_USER_ID=` gets that empty line
 * appended; the key line is left alone. Returns the file path.
 *
 * @param {string} [platform]
 * @param {NodeJS.ProcessEnv} [env]
 * @param {string} [home]
 */
export function ensureProviderEnvFile(platform = process.platform, env = process.env, home = homedir()) {
  const dir = wiserUserConfigDir(platform, env, home);
  const file = join(dir, 'auth-provider.env');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  try { chmodSync(dir, 0o700); } catch { /* windows */ }
  if (!existsSync(file)) {
    writeEnvFile(file, EMPTY_ENV);
    return file;
  }
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return file;
  }
  const map = parseEnvText(text);
  if (!Object.prototype.hasOwnProperty.call(map, 'WISER_USER_ID')) {
    const next = text.endsWith('\n') || text.length === 0 ? `${text}WISER_USER_ID=\n` : `${text}\nWISER_USER_ID=\n`;
    writeEnvFile(file, next);
  }
  return file;
}

/**
 * Write `userId` into an empty `WISER_USER_ID=` line. Never changes
 * `WISER_AUTH_PROVIDER_KEY`. Never overwrites a user id that is already set.
 * Returns true when the file was written.
 *
 * @param {string | null | undefined} envPath
 * @param {string} userId
 * @returns {boolean}
 */
export function writeProviderUserIdIfEmpty(envPath, userId) {
  if (!envPath || !isProviderUserId(userId) || !existsSync(envPath)) return false;
  if (readProviderUserId(envPath)) return false;
  let text;
  try {
    text = readFileSync(envPath, 'utf8');
  } catch {
    return false;
  }
  const lines = text.split(/\n/);
  let found = false;
  const next = lines.map((line) => {
    if (!/^\s*WISER_USER_ID=/.test(line)) return line;
    found = true;
    const indent = line.match(/^\s*/)[0];
    return `${indent}WISER_USER_ID=${userId}`;
  });
  if (!found) next.push(`WISER_USER_ID=${userId}`);
  const body = next.join('\n');
  writeEnvFile(envPath, body.endsWith('\n') ? body : `${body}\n`);
  return true;
}
