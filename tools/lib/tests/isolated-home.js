// Each test worker and all of its children use a disposable person profile.
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.npm_config_offline = 'true';
process.env.PIP_NO_INDEX = '1';
const home = mkdtempSync(join(tmpdir(), 'wiser-suite-home-'));
process.env.HOME = home;
process.env.USERPROFILE = home;
process.env.TMPDIR = join(home, 'tmp');
mkdirSync(process.env.TMPDIR);
for (const key of ['XDG_CONFIG_HOME', 'APPDATA', 'LOCALAPPDATA', 'WISER_ALLOW_INSTALL']) delete process.env[key];
process.on('exit', () => rmSync(home, { recursive: true, force: true }));
export function homeEnvironment(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  return { ...process.env, HOME: directory, USERPROFILE: directory, XDG_CONFIG_HOME: '', APPDATA: '', LOCALAPPDATA: '' };
}
