import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { wiserUserConfigDir, defaultProviderEnvPath, defaultGatewayHome } from '../src/paths.js';

test('windows uses APPDATA', () => {
  const base = join('C:', 'Users', 'x', 'AppData', 'Roaming');
  const home = join('C:', 'Users', 'x');
  assert.equal(wiserUserConfigDir('win32', { APPDATA: base }, home), join(base, 'wiser'));
});

test('windows falls back to AppData/Roaming under the profile', () => {
  const home = join('C:', 'Users', 'x');
  assert.equal(wiserUserConfigDir('win32', {}, home), join(home, 'AppData', 'Roaming', 'wiser'));
});

test('macOS uses Application Support', () => {
  const home = join('/', 'Users', 'x');
  assert.equal(
    wiserUserConfigDir('darwin', {}, home),
    join(home, 'Library', 'Application Support', 'wiser'),
  );
});

test('linux uses XDG_CONFIG_HOME when set', () => {
  const home = join('/', 'home', 'x');
  assert.equal(
    wiserUserConfigDir('linux', { XDG_CONFIG_HOME: join('/', 'custom', 'config') }, home),
    join('/', 'custom', 'config', 'wiser'),
  );
});

test('linux uses ~/.config when XDG_CONFIG_HOME is empty', () => {
  const home = join('/', 'home', 'x');
  assert.equal(wiserUserConfigDir('linux', {}, home), join(home, '.config', 'wiser'));
});

test('default env path is auth-provider.env under the config dir', () => {
  const home = join('/', 'Users', 'x');
  assert.equal(
    defaultProviderEnvPath('darwin', {}, home),
    join(home, 'Library', 'Application Support', 'wiser', 'auth-provider.env'),
  );
});

test('default env directory is not inside default --home, and --home is not inside it', () => {
  const home = join('/', 'Users', 'x');
  const state = defaultGatewayHome(home);
  const config = wiserUserConfigDir('darwin', {}, home);
  assert.equal(state.startsWith(`${config}/`) || state === config, false);
  assert.equal(config.startsWith(`${state}/`) || config === state, false);
});
