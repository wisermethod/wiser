// Each test runs with a temporary home, so the runner names the pinned Chrome HyperFrames
// already installed, in WISER_TEST_HYPERFRAMES_CACHE (on macOS ~/.cache/hyperframes/chrome),
// and the temporary home links it as its own. The tests never install it.
import '../../lib/tests/isolated-home.js';
import { mkdirSync, symlinkSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
const cache = process.env.WISER_TEST_HYPERFRAMES_CACHE;
if (!cache || !isAbsolute(cache)) throw new Error('Set WISER_TEST_HYPERFRAMES_CACHE to the existing pinned Chrome cache; tests never install it.');
const parent = join(process.env.HOME, '.cache/hyperframes');
mkdirSync(parent, {recursive:true});
symlinkSync(cache, join(parent, 'chrome'), 'dir');
