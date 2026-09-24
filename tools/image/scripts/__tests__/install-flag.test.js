import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const CONSENT = fileURLToPath(new URL('../../../lib/consent.js', import.meta.url));
const EDIT_VALUE_FLAGS = ['--file', '--output', '--resize', '--crop', '--rotate', '--blur', '--brightness', '--contrast', '--sharpness', '--canvas', '--at'];

test('image install consent is the parsed flag, not a token in process.argv', () => {
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { flagAuthorised, parsedInstallFlag } from ${JSON.stringify(CONSENT)};
    const valueFlags = new Set(${JSON.stringify(EDIT_VALUE_FLAGS)});
    const valued = ['edit', '--resize', '10x10', '--at', '--install'];
    if (parsedInstallFlag(valued, valueFlags) !== false) process.exit(2);
    const bare = ['edit', '--install', '--file', '/work/a.png'];
    if (parsedInstallFlag(bare, valueFlags) !== true) process.exit(3);
    process.argv = [process.argv[0], process.argv[1], ...valued];
    if (flagAuthorised(false) !== false) process.exit(4);
    if (flagAuthorised(true) !== true) process.exit(5);
  `], { encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr);
});
