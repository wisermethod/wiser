import assert from 'node:assert/strict';
import { test } from 'node:test';
import { join } from 'node:path';
import { fixture } from './fixtures.js';
import { wiserUserConfigDir } from '../user-config.js';
import { wiserUserConfigDir as gatewayDir } from '../../../gateway/src/paths.js';

for (const platform of ['darwin', 'linux', 'win32']) {
  for (const populated of [false, true, 'empty']) {
    test(`user-config agreement: ${platform}, environment ${populated}`, t => {
      const { home } = fixture(t);
      const env = populated === true ? { APPDATA: join(home, 'roaming'), XDG_CONFIG_HOME: join(home, 'xdg'), USERPROFILE: home }
        : populated === 'empty' ? { APPDATA: '', XDG_CONFIG_HOME: '' } : {};
      const expected = platform === 'darwin' ? join(home, 'Library', 'Application Support', 'wiser')
        : platform === 'win32' ? join(env.APPDATA || join(home, 'AppData', 'Roaming'), 'wiser')
        : join(env.XDG_CONFIG_HOME || join(home, '.config'), 'wiser');
      assert.equal(wiserUserConfigDir(platform, env, home), expected);
      assert.equal(wiserUserConfigDir(platform, env, home), gatewayDir(platform, env, home));
      if (platform === process.platform && populated === false) assert.equal(wiserUserConfigDir(), expected);
    });
  }
}
