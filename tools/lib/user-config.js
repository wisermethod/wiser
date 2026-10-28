/**
 * Tools' implementation of the platform user-config rule owned by gateway/SETUP.md.
 * Kept separate from gateway/src/paths.js because tools are self-contained under
 * standards/script-contract.md. The agreement test guards both implementations.
 */
import { homedir } from 'node:os';
import { join } from 'node:path';

export function wiserUserConfigDir(platform = process.platform, env = process.env, home = homedir()) {
  if (platform === 'win32') {
    const base = (env.APPDATA && env.APPDATA.length > 0)
      ? env.APPDATA
      : join(home, 'AppData', 'Roaming');
    return join(base, 'wiser');
  }
  if (platform === 'darwin') return join(home, 'Library', 'Application Support', 'wiser');
  const xdg = env.XDG_CONFIG_HOME;
  if (typeof xdg === 'string' && xdg.length > 0) return join(xdg, 'wiser');
  return join(home, '.config', 'wiser');
}
