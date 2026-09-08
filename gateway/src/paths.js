import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
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

const EMPTY_ENV = 'WISER_AUTH_PROVIDER_KEY=\n';

/**
 * Create the platform config directory and an empty project-key file if they
 * are missing. Never overwrites a file that already exists. Never writes a
 * key value. Returns the file path.
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
    writeFileSync(file, EMPTY_ENV, { mode: 0o600 });
    try { chmodSync(file, 0o600); } catch { /* windows */ }
  }
  return file;
}
