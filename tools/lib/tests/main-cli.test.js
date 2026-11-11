import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mainCli, offlineEnv } from './main-cli.js';

const root = process.env.WISER_TEST_SOURCE_ROOT || fileURLToPath(new URL('../../../', import.meta.url));
const released = 'f8211bef4788e19c0495b16c71e7d0b74ecccb5b';
const expected = {
  window: { start: '2024-03-01', end: '2024-03-05' },
  previousWindow: { start: '2024-02-25', end: '2024-02-29' }
};

test('released baseline carries archive-core and its CLI can run outside the repository', t => {
  const cli = mainCli(t, 'seo-data');
  const library = join(dirname(cli), '../../lib/archive-core.js');
  assert.deepEqual(readFileSync(library), execFileSync('git', ['show', `${released}:tools/lib/archive-core.js`], { cwd: root }));
  const run = spawnSync(process.execPath, [cli, 'previous-window', '--start', '2024-03-01', '--end', '2024-03-05'], { encoding: 'utf8', env: offlineEnv() });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stderr, '');
  assert.deepEqual(JSON.parse(run.stdout), expected);
});

test('relocated helper uses WISER_TEST_SOURCE_ROOT and stays pinned when that repository moves main', t => {
  const scratch = mkdtempSync(join(tmpdir(), 'wiser-baseline-source-'));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const repository = join(scratch, 'repository');
  // Local objects only: no network, new commits, staging, or shared ref changes.
  execFileSync('git', ['clone', '--shared', '--no-checkout', '--quiet', root, repository], { env: offlineEnv() });
  execFileSync('git', ['branch', '--force', 'main', 'b11bd900'], { cwd: repository });
  const helper = join(scratch, 'main-cli.mjs');
  copyFileSync(new URL('./main-cli.js', import.meta.url), helper);
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { execFileSync } from 'node:child_process';
    import { readFileSync } from 'node:fs';
    import { mainCli } from ${JSON.stringify(pathToFileURL(helper).href)};
    const cleanup = [];
    try {
      const cli = mainCli({after: fn => cleanup.push(fn)}, 'seo-data');
      const expected = execFileSync('git', ['show', '${released}:tools/seo-data/scripts/seo-data.js'], {cwd: process.env.WISER_TEST_SOURCE_ROOT});
      assert.deepEqual(readFileSync(cli), expected, 'moving main cannot change the baseline bytes');
    } finally { for (const fn of cleanup) fn(); }
  `], { encoding: 'utf8', env: offlineEnv({ WISER_TEST_SOURCE_ROOT: repository }) });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stderr, '');
});

for (const source of ['shallow clone', 'installed tree without git']) test(`baseline names the missing commit in a ${source}`, t => {
  const scratch = mkdtempSync(join(tmpdir(), 'wiser-baseline-missing-'));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const repository = join(scratch, 'repository');
  if (source === 'shallow clone') {
    // --no-local honors depth using only the local repository transport.
    execFileSync('git', ['clone', '--no-local', '--depth', '1', '--no-checkout', '--quiet', root, repository], { env: offlineEnv() });
    assert.notEqual(spawnSync('git', ['cat-file', '-e', `${released}^{commit}`], { cwd: repository }).status, 0);
  } else mkdirSync(repository);
  const helper = join(scratch, 'main-cli.mjs');
  copyFileSync(new URL('./main-cli.js', import.meta.url), helper);
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { mainCli } from ${JSON.stringify(pathToFileURL(helper).href)};
    try { mainCli({after() {}}, 'seo-data'); process.exitCode = 1; }
    catch (error) { console.log(error.message); }
  `], { encoding: 'utf8', env: offlineEnv({ WISER_TEST_SOURCE_ROOT: repository }) });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stderr, '');
  assert.equal(run.stdout, `Baseline commit ${released} is unavailable; a full clone is needed to run baseline comparisons.\n`);
});

test('baseline omits an absent one-file dependency and carries it when the pin moves to a snapshot that has it', t => {
  const old = mainCli(t, 'seo-data');
  assert.equal(existsSync(join(dirname(old), '../../lib/one-file.js')), false);
  const scratch = mkdtempSync(join(tmpdir(), 'wiser-baseline-one-file-'));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const next = execFileSync('git', ['rev-parse', '72de8667^{commit}'], { cwd: root, encoding: 'utf8' }).trim();
  const helper = join(scratch, 'main-cli.mjs');
  writeFileSync(helper, readFileSync(new URL('./main-cli.js', import.meta.url), 'utf8').replace(released, next));
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { execFileSync } from 'node:child_process';
    import { readFileSync } from 'node:fs';
    import { dirname, join } from 'node:path';
    import { mainCli } from ${JSON.stringify(pathToFileURL(helper).href)};
    const cleanup = [];
    try {
      const cli = mainCli({after: fn => cleanup.push(fn)}, 'data');
      const expected = execFileSync('git', ['show', '${next}:tools/lib/one-file.js'], {cwd: process.env.WISER_TEST_SOURCE_ROOT});
      assert.deepEqual(readFileSync(join(dirname(cli), '../../lib/one-file.js')), expected);
      execFileSync(process.execPath, [cli, '--help'], {stdio: 'pipe'});
    } finally { for (const fn of cleanup) fn(); }
  `], { encoding: 'utf8', env: offlineEnv({ WISER_TEST_SOURCE_ROOT: root }) });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stderr, '');
});
