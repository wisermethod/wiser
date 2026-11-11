import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from './copy-assets.mjs';

function fixture(t, omittedPaths = []) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'wiser-real-hook-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const copy = (from, to) => cpSync(from, to, { recursive: true, filter: path => !path.split(/[\\/]/).some(part => part === 'node_modules' || part === '.env' || part.startsWith('.env.')) });
  for (const tool of ['render', 'deck-export', 'data', 'Content Harvester', 'keynote-render', 'lib']) copy(join(ROOT, 'tools', tool), join(root, 'tools', tool));
  for (const path of omittedPaths) rmSync(join(root, path));
  mkdirSync(join(root, 'system/hooks'), { recursive: true });
  cpSync(join(ROOT, 'system/hooks/pre-commit'), join(root, 'system/hooks/pre-commit'));
  mkdirSync(join(root, 'system/gates'));
  // These unrelated gates are outside this test's subject. Node and both
  // carried-copy builders are real processes operating on the fixture bytes.
  for (const name of ['typed-file-flags.sh', 'tool-frontmatter.sh', 'classifier-seam.sh']) {
    writeFileSync(join(root, 'system/gates', name), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  }
  const trace = join(root, 'builder-calls.log'), profile = join(root, 'profile');
  mkdirSync(profile);
  const preload = join(root, 'observe.mjs');
  writeFileSync(preload, `import { appendFileSync } from 'node:fs';
import os from 'node:os';
import { syncBuiltinESMExports } from 'node:module';
os.homedir = () => ${JSON.stringify(profile)};
syncBuiltinESMExports();
if (process.argv.includes('--check') && ['copy-assets.mjs','one-file.mjs'].some(name => (process.argv[1] || '').endsWith('/'+name))) {
  appendFileSync(${JSON.stringify(trace)}, JSON.stringify({args:process.argv.slice(1).map(p=>p.replace(${JSON.stringify(root + '/')},'')),offline:process.env.npm_config_offline})+'\\n');
}
`);
  const env = { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --import=${preload}`, npm_config_cache: join(root, 'empty-cache') };
  const git = (...args) => {
    const out = spawnSync('git', args, { cwd: root, env, encoding: 'utf8' });
    assert.equal(out.status, 0, out.stderr);
    return out.stdout.trim();
  };
  git('init', '-q');
  git('config', 'core.ignorecase', 'false');
  git('add', '.');
  // A baseline object in this disposable repository gives rename detection a
  // real old tree. The product worktree's index is never touched.
  const tree = git('write-tree');
  const commit = spawnSync('git', ['commit-tree', tree, '-m', 'test fixture'], {
    cwd: root, encoding: 'utf8', env: { ...env, GIT_AUTHOR_NAME: 'Wiser Test', GIT_AUTHOR_EMAIL: 'test@wiser.invalid', GIT_COMMITTER_NAME: 'Wiser Test', GIT_COMMITTER_EMAIL: 'test@wiser.invalid' }
  });
  assert.equal(commit.status, 0, commit.stderr);
  git('update-ref', 'HEAD', commit.stdout.trim());
  const reset = () => { git('reset', '--hard', '-q', 'HEAD'); writeFileSync(trace, ''); };
  const stage = path => {
    const disk = join(root, path);
    mkdirSync(dirname(disk), { recursive: true });
    appendFileSync(disk, '\n');
    git('add', '--', path);
  };
  const run = () => {
    writeFileSync(trace, '');
    const out = spawnSync('sh', [join(root, 'system/hooks/pre-commit')], { cwd: root, env, encoding: 'utf8', timeout: 60000 });
    const calls = readFileSync(trace, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
    return { ...out, calls };
  };
  const install = tool => {
    const target = join(root, 'tools', tool, 'node_modules');
    cpSync(realpathSync(join(ROOT, 'tools', tool, 'node_modules')), target, { recursive: true });
  };
  return { root, profile, env, git, reset, stage, run, install };
}
const copy = tool => ['tools/lib/build/copy-assets.mjs', tool, '--check'];
const data = ['tools/lib/build/one-file.mjs', '--check'];

test('hook routes staged paths to real offline builders with absent packages', async t => {
  // Start without this input so both spellings are new paths on case-insensitive filesystems.
  const f = fixture(t, ['tools/Content Harvester/build/nodable-entities-3.0.0-LICENSE.txt']);
  const cases = [
    ...['render', 'deck-export'].flatMap(tool => [
      [`tools/${tool}/vendor/probe`, [copy(tool)]],
      [`tools/${tool}/vendor/path with spaces.js`, [copy(tool)]],
      [`tools/${tool}/package.json`, [copy(tool)]],
      ...['package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lock', 'bun.lockb'].map(lock => [`tools/${tool}/${lock}`, [copy(tool)]]),
      [`tools/${tool}/build/THIRD-PARTY-NOTICES.txt`, [copy(tool)]]
    ]),
    ['tools/render/build/mermaid-10.9.6-LICENSE.txt', [copy('render')]],
    ['tools/deck-export/build/highlightjs-11.9.0-LICENSE.txt', [copy('deck-export')]],
    ['tools/deck-export/build/league-gothic-OFL.md', [copy('deck-export')]],
    ['tools/lib/build/copy-assets.mjs', [copy('render')]],
    ...['data', 'Content Harvester', 'keynote-render'].flatMap(tool => [
      [`tools/${tool}/dist/probe`, [data]],
      ...['package.json', 'package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lock'].map(lock => [`tools/${tool}/${lock}`, [data]])
    ]),
    ...['package.json', 'package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml'].map(lock => [`tools/data/${lock}`, [data]]),
    ...['tools/lib/build/one-file.mjs', 'tools/lib/build/compiler-package-lock.json', 'tools/lib/build/locked-package.mjs', 'tools/lib/one-file.js'].map(path => [path, [data]]),
    ['tools/Content Harvester/build/nodable-entities-3.0.0-LICENSE.txt', [data]],
    ['TOOLS/CONTENT HARVESTER/BUILD/NODABLE-ENTITIES-3.0.0-LICENSE.TXT', [data]],
    ['Tools/Render/Vendor/probe', [copy('render')]],
    ['tools/DECK-EXPORT/Build/league-gothic-OFL.md', [copy('deck-export')]],
    ['TOOLS/DATA/DIST/probe', [data]],
    ...['README.md', 'tools/tag-audit/package-lock.json', 'tools/lib/browser-runtime/package-lock.json', 'tools/render/scripts/render.js', 'tools/render/dist/probe', 'tools/data/vendor/probe', 'tools/render/build/README.md', 'tools/deck-export/build/test.js', 'tools/render/nested/package-lock.json', 'tools/render/package-lock.yaml', 'tools/other/vendor/probe', 'tools/lib/build/copy-assets.test.mjs'].map(path => [path, []])
  ];
  for (const [path, expected] of cases) await t.test(path, () => {
    f.reset(); f.stage(path);
    const out = f.run();
    assert.deepEqual(out.calls.map(call => call.args), expected, out.stderr);
    assert.equal(out.status, expected.length ? 1 : 0, out.stderr);
    for (const call of out.calls) assert.equal(call.offline, 'true');
    if (expected.length) {
      assert.match(out.stderr.trim(), /needs npm ci.*check cannot verify the staged copy without it\.$/);
      assert.equal(out.stderr.trim().split('\n').length, 1);
    }
  });
});

test('hook rejects staged bytes differing from disk, including case and builder inputs', async t => {
  const f = fixture(t);
  for (const path of ['tools/render/vendor/mermaid/mermaid.min.js', 'tools/deck-export/vendor/reveal.js/dist/reveal.js', 'tools/data/dist/data.mjs', 'tools/Content Harvester/dist/harvest.mjs', 'tools/keynote-render/dist/render.mjs', 'tools/Content Harvester/build/nodable-entities-3.0.0-LICENSE.txt', 'tools/render/package.json', 'tools/lib/build/copy-assets.mjs', 'tools/lib/build/one-file.mjs', 'Tools/Render/Vendor/probe']) await t.test(path, () => {
    f.reset();
    const disk = join(f.root, path), original = existsSync(disk) ? readFileSync(disk) : Buffer.from('good');
    f.stage(path); writeFileSync(disk, original);
    const out = f.run();
    assert.equal(out.status, 1, out.stderr);
    assert.match(out.stderr, /staged copy differs from the worktree/);
    assert.deepEqual(out.calls, []);
  });
});

test('hook checks rename source and deletion with real installed copy builder', async t => {
  const f = fixture(t); f.install('deck-export');
  f.env.npm_config_cache = spawnSync('npm', ['config', 'get', 'cache'], { encoding: 'utf8' }).stdout.trim();
  for (const operation of ['rename', 'delete']) await t.test(operation, () => {
    f.reset();
    const old = 'tools/deck-export/vendor/reveal.js/dist/reveal.js';
    if (operation === 'rename') f.git('mv', old, 'tools/deck-export/kept.js');
    else f.git('rm', old);
    const out = f.run();
    assert.equal(out.status, 1, out.stderr);
    assert.match(out.stderr, /missing, stale or unexpected carried files/);
    assert.deepEqual(out.calls.map(call => call.args), [copy('deck-export')]);
  });
});

test('hook checks each installed tool independently and diagnoses absent archives offline', async t => {
  const f = fixture(t);
  const cache = spawnSync('npm', ['config', 'get', 'cache'], { encoding: 'utf8' }).stdout.trim();
  f.env.npm_config_cache = cache;
  for (const tool of ['render', 'deck-export']) await t.test(tool, () => {
    f.reset(); f.install(tool);
    // A second recognised lockfile triggers a check without changing the npm inputs.
    f.stage(`tools/${tool}/yarn.lock`);
    const out = f.run();
    assert.equal(out.status, 0, out.stderr);
    assert.deepEqual(out.calls.map(call => call.args), [copy(tool)]);
    rmSync(join(f.root, 'tools', tool, 'node_modules'), { recursive: true });
  });
  await t.test('data', () => {
    f.reset();
    for (const tool of ['data', 'Content Harvester', 'keynote-render']) f.install(tool);
    cpSync(join(process.env.WISER_TEST_COMPILER_CACHE || join(process.env.HOME, '.cache/wiser-connector-launch'), 'npm'), join(f.profile, '.cache/wiser-connector-launch/npm'), { recursive: true });
    f.env.npm_config_cache = process.env.npm_config_cache || cache;
    const fresh = spawnSync(process.execPath, ['tools/lib/build/one-file.mjs', 'data'], {cwd:f.root, env:{...f.env,npm_config_offline:'true'},encoding:'utf8'});
    assert.equal(fresh.status, 0, fresh.stderr);
    f.stage('tools/data/yarn.lock');
    const out = f.run();
    assert.equal(out.status, 0, out.stderr);
    assert.deepEqual(out.calls.map(call => call.args), [data]);
    rmSync(join(f.profile, '.cache/wiser-connector-launch/npm'), { recursive: true });
    f.env.npm_config_cache = join(f.root,'empty-cache');
    const cold = f.run();
    assert.equal(cold.status, 1, cold.stderr);
    assert.match(cold.stderr.trim(), /^pre-commit: data needs npm ci.*check cannot verify the staged copy without it\.$/);
    assert.equal(cold.stderr.trim().split('\n').length, 1);
  });
  await t.test('missing copy archive', () => {
    f.reset(); f.install('render'); f.env.npm_config_cache = join(f.root, 'empty-cache');
    f.stage('tools/render/yarn.lock');
    const out = f.run();
    assert.equal(out.status, 1, out.stderr);
    assert.match(out.stderr.trim(), /^pre-commit: render needs npm ci.*check cannot verify the staged copy without it\.$/);
    assert.equal(out.stderr.trim().split('\n').length, 1);
  });
});

test('installed builders cannot hide a dirty index behind clean worktree bytes', async t => {
  const f = fixture(t);
  for (const tool of ['render', 'deck-export', 'data']) f.install(tool);
  f.env.npm_config_cache = spawnSync('npm', ['config', 'get', 'cache'], { encoding: 'utf8' }).stdout.trim();
  cpSync(join(process.env.WISER_TEST_COMPILER_CACHE || join(process.env.HOME, '.cache/wiser-connector-launch'), 'npm'), join(f.profile, '.cache/wiser-connector-launch/npm'), { recursive: true });
  for (const path of ['tools/render/vendor/mermaid/mermaid.min.js', 'tools/deck-export/vendor/reveal.js/dist/reveal.js', 'tools/data/dist/data.mjs']) await t.test(path, () => {
    f.reset();
    const original = readFileSync(join(f.root, path));
    f.stage(path);
    writeFileSync(join(f.root, path), original);
    const out = f.run();
    assert.equal(out.status, 1, out.stderr);
    assert.match(out.stderr, /staged copy differs from the worktree/);
    assert.deepEqual(out.calls, []);
  });
});

test('copy builder input checks both installed tools and unrelated staged input checks neither', t => {
  const f = fixture(t);
  f.install('render'); f.install('deck-export');
  f.env.npm_config_cache = spawnSync('npm', ['config', 'get', 'cache'], { encoding: 'utf8' }).stdout.trim();
  f.stage('tools/lib/build/copy-assets.mjs');
  for (const tool of ['render', 'deck-export']) {
    const out = spawnSync(process.execPath, ['tools/lib/build/copy-assets.mjs', tool], { cwd: f.root, env: { ...f.env, npm_config_offline: 'true' }, encoding: 'utf8' });
    assert.equal(out.status, 0, out.stderr);
    f.git('add', '--', `tools/${tool}/vendor/manifest.json`);
  }
  const out = f.run();
  assert.equal(out.status, 0, out.stderr);
  assert.deepEqual(out.calls.map(call => call.args), [copy('render'), copy('deck-export')]);
  f.reset(); f.stage('tools/another/package-lock.json');
  const unrelated = f.run();
  assert.equal(unrelated.status, 0, unrelated.stderr);
  assert.deepEqual(unrelated.calls, []);
});

for (const path of ['tools/Content Harvester/scripts/lib/fetch.js', 'tools/keynote-render/scripts/lib/keynote.js', 'tools/data/scripts/data-core.js', 'tools/lib/destination-core.js', 'tools/lib/consent.js']) {
  test(`source-only change cannot commit an old bundle: ${path}`, t => {
    const f = fixture(t);
    for (const tool of ['data', 'Content Harvester', 'keynote-render']) f.install(tool);
    f.env.npm_config_cache = process.env.npm_config_cache;
    f.stage(path);
    const out = f.run();
    assert.equal(out.status, 1, 'stale source must fail the hook');
    assert.match(out.stderr, /missing or stale/);
    assert.deepEqual(out.calls.map(call => call.args), [data], out.stderr);
  });
}
