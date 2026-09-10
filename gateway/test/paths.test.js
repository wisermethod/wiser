import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  wiserUserConfigDir,
  defaultProviderEnvPath,
  defaultGatewayHome,
  ensureProviderEnvFile,
  readProviderUserId,
  writeProviderUserIdIfEmpty,
} from '../src/paths.js';

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

test('ensureProviderEnvFile creates an empty KEY= and USER_ID= template and does not overwrite the key', () => {
  const home = mkdtempSync(join(tmpdir(), 'wiser-cfg-'));
  const file = ensureProviderEnvFile('darwin', {}, home);
  assert.equal(file, defaultProviderEnvPath('darwin', {}, home));
  assert.equal(readFileSync(file, 'utf8'), 'WISER_AUTH_PROVIDER_KEY=\nWISER_USER_ID=\n');
  writeFileSync(file, 'WISER_AUTH_PROVIDER_KEY=already\n');
  ensureProviderEnvFile('darwin', {}, home);
  assert.equal(readFileSync(file, 'utf8'), 'WISER_AUTH_PROVIDER_KEY=already\nWISER_USER_ID=\n');
});

test('writeProviderUserIdIfEmpty fills an empty USER_ID line and never changes the key', () => {
  const home = mkdtempSync(join(tmpdir(), 'wiser-cfg-'));
  const file = ensureProviderEnvFile('darwin', {}, home);
  writeFileSync(file, 'WISER_AUTH_PROVIDER_KEY=already\nWISER_USER_ID=\n');
  const id = 'wiser-01234567-89ab-cdef-0123-456789abcdef';
  assert.equal(writeProviderUserIdIfEmpty(file, id), true);
  const text = readFileSync(file, 'utf8');
  assert.match(text, /^WISER_AUTH_PROVIDER_KEY=already$/m);
  assert.equal(readProviderUserId(file), id);
  assert.equal(writeProviderUserIdIfEmpty(file, 'wiser-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'), false);
  assert.equal(readProviderUserId(file), id);
});
