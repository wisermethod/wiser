import './browser-home.mjs';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { sequence } from '../scripts/sequence.mjs';

for (const [name, width, height] of [['zoom', 1280, 720], ['fade', 960, 540]]) {
  test(`${name}: default renders repeat one worker's decoded frames and the split control differs`, { timeout: 240_000 }, async (t) => {
    const path = await mkdtemp(join(tmpdir(), 'wiser-video-split-test-'));
    t.after(() => rm(path, { recursive: true, force: true }));
    const project = fileURLToPath(new URL(`./fixtures/${name}/`, import.meta.url));
    const temporary = join(path, 'tmp');
    await mkdir(temporary);
    const hashes = async (label, workers) => {
      const previous = process.env.TMPDIR;
      let report;
      process.env.TMPDIR = temporary;
      try {
        report = await sequence({ project, output: join(path, label), width, height, fps: 30, duration: 3,
          ...(workers === undefined ? {} : { workers }) });
      } finally {
        if (previous === undefined) delete process.env.TMPDIR;
        else process.env.TMPDIR = previous;
      }
      assert.deepEqual(await readdir(temporary), [], 'the in-process render must remove its temporary directories');
      assert.equal(report.frameCount, 90);
      return (await readFile(report.hashesPath, 'utf8')).trim().split('\n').map((line) => line.slice(0, 64));
    };
    const first = await hashes('default-first'), second = await hashes('default-second');
    const one = await hashes('one', 1), three = await hashes('three', 3);
    const firstDifference = (a, b) => a.findIndex((hash, i) => hash !== b[i]);
    const split = firstDifference(one, three);
    t.diagnostic(JSON.stringify({ fixture: name, firstDifferingFrame: split, numbering: 'zero-based' }));
    const repeated = firstDifference(first, second), explicit = firstDifference(one, first);
    assert.equal(repeated, -1, `${name}: default renders differ; first differing frame: ${repeated} (zero-based)`);
    assert.equal(explicit, -1, `${name}: default must equal --workers 1; first differing frame: ${explicit} (zero-based)`);
    assert.notEqual(split, -1, `${name} fixture no longer shows a split difference on this Chrome, so the fixture has lost its power; first differing frame: none`);
  });
}
