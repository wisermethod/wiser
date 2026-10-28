import './isolated-home.js';
import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { fixture, fakeNpm } from './fixtures.js';
import { wiserUserConfigDir } from '../user-config.js';

const source = fileURLToPath(new URL('../../../', import.meta.url));

function plant(f, dir) {
  fs.mkdirSync(join(dir, 'node_modules/playwright'), { recursive: true });
  fs.writeFileSync(join(dir, 'node_modules/playwright/package.json'), JSON.stringify({version:'1.62.0', main:'index.js'}));
  fs.writeFileSync(join(dir, 'node_modules/playwright/index.js'), `require('node:fs').writeFileSync(${JSON.stringify(join(f.root, 'IMPORTED'))},'planted');module.exports={chromium:{planted:true}};`);
}

function snapshot(root) {
  const result = {};
  function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      const p = join(dir, name), s = fs.lstatSync(p), rel = p.slice(root.length);
      result[rel] = s.isSymbolicLink() ? ['link', fs.readlinkSync(p)] : s.isDirectory() ? ['dir', s.mode] : ['file', fs.readFileSync(p).toString('base64')];
      if (s.isDirectory()) walk(p);
    }
  }
  walk(root);
  return result;
}

for (const kind of ['symlink', 'group-writable', 'foreign-owned']) for (const operation of ['active', 'load', 'install']) {
  test(`R1 ${kind} ${operation}`, async t => {
    const f = fixture(t), r = await f.import('browser-runtime/browser-runtime.js');
    const target = r.personRuntimeDir(), config = wiserUserConfigDir();
    plant(f, target);
    fakeNpm(f, 'throw new Error("npm must not run");');
    let owner;
    if (kind === 'symlink') {
      const actual = join(f.root, 'actual-config');
      fs.renameSync(config, actual);
      fs.symlinkSync(actual, config);
    } else if (kind === 'group-writable') fs.chmodSync(config, 0o770);
    else {
      const uid = process.getuid();
      owner = mock.method(process, 'getuid', () => uid + 1);
    }
    const before = snapshot(f.root);
    try {
      if (operation === 'active') assert.equal(r.activeRuntimeDir(), null);
      if (operation === 'load') await assert.rejects(r.loadPlaywright(), /Playwright is missing/);
      if (operation === 'install') {
        let line = '';
        try { await r.installBrowserRuntime(); } catch (error) { line = `Error: ${error.message}\n`; }
        assert.match(line, /^Error: [^\r\n]+\n$/);
        assert.ok(line.includes(config));
        assert.match(line, kind === 'symlink' ? /real directory/ : kind === 'group-writable' ? /writable by group/ : /owned by another/);
      }
      assert.equal(fs.existsSync(join(f.root, 'IMPORTED')), false);
      assert.deepEqual(snapshot(f.root), before, 'untrusted tree remains byte-for-byte untouched');
    } finally { owner?.mock.restore(); }
  });
}

for (const part of ['runtimes', 'browser']) test(`R1 linked ${part} refused`, async t => {
  const f = fixture(t), r = await f.import('browser-runtime/browser-runtime.js'), target = r.personRuntimeDir();
  plant(f, target);
  const link = part === 'runtimes' ? dirname(target) : target, actual = join(f.root, 'linked-target');
  fs.renameSync(link, actual);
  fs.symlinkSync(actual, link);
  const before = snapshot(f.root);
  assert.equal(r.activeRuntimeDir(), null);
  await assert.rejects(r.loadPlaywright());
  await assert.rejects(r.installBrowserRuntime(), /symbolic link/);
  assert.deepEqual(snapshot(f.root), before);
});

test('R1 cached import is rechecked after directory trust changes', async t => {
  const f = fixture(t), r = await f.import('browser-runtime/browser-runtime.js');
  fakeNpm(f);
  await r.installBrowserRuntime();
  await r.loadPlaywright();
  fs.chmodSync(wiserUserConfigDir(), 0o770);
  await assert.rejects(r.loadPlaywright(), /Playwright is missing/);
});

test('R2 Node copy symlink does not grant consent; a regular matching marker does', async t => {
  const f = fixture(t), c = await f.import('consent.js'), script = join(f.copy, 'tools/fake/run.js');
  const marker = join(f.copy, '.wiser-consent'), target = join(f.root, 'matching-marker');
  fs.writeFileSync(target, JSON.stringify({realpath:fs.realpathSync(f.copy)}));
  fs.symlinkSync(target, marker);
  assert.equal(c.installAuthorised(script, false), false);
  fs.unlinkSync(marker);
  fs.copyFileSync(target, marker);
  assert.equal(c.installAuthorised(script, false), true);
});

test('R3 scaffold succeeds without browser lockfile and performs no HOME reads', t => {
  const f = fixture(t), tool = join(f.copy, 'tools/deck-export');
  fs.cpSync(join(source, 'tools/deck-export/scripts'), join(tool, 'scripts'), {recursive:true});
  fs.cpSync(join(source, 'tools/deck-export/templates'), join(tool, 'templates'), {recursive:true});
  // A stand-in reveal.js holding the files scaffold copies, so the test needs no installed package.
  const reveal = join(tool, 'node_modules/reveal.js');
  for (const file of ['dist/reveal.js', 'dist/reset.css', 'dist/reveal.css', 'dist/theme/white.css', 'plugin/highlight/highlight.js', 'plugin/highlight/monokai.css', 'plugin/notes/notes.js']) {
    fs.mkdirSync(dirname(join(reveal, file)), {recursive:true});
    fs.writeFileSync(join(reveal, file), `/* stand-in ${file} */\n`);
  }
  fs.writeFileSync(join(reveal, 'package.json'), JSON.stringify({name:'reveal.js', version:'0.0.0-test'}));
  fs.rmSync(join(f.runtime, 'package-lock.json'));
  const guard = join(f.root, 'home-guard.mjs'), record = join(f.root, 'home-reads.jsonl');
  fs.writeFileSync(guard, `import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';import {fileURLToPath} from 'node:url';
const append=fs.appendFileSync,home=process.env.HOME;for(const method of ['readFileSync','openSync','statSync','lstatSync','realpathSync','readdirSync','existsSync','accessSync']){const original=fs[method];fs[method]=function(p,...args){let value=p instanceof URL?fileURLToPath(p):String(p);if(value===home||value.startsWith(home+'/')){append(${JSON.stringify(record)},JSON.stringify({method,value})+'\\n');throw new Error('HOME read forbidden');}return original.call(this,p,...args);};}syncBuiltinESMExports();`);
  const result = spawnSync(process.execPath, ['--import', guard, join(tool, 'scripts/deck.js'), 'scaffold', '--output', join(f.root, 'deck'), '--title', 'R2'], {env:process.env, encoding:'utf8'});
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(record), false);
  assert.ok(fs.existsSync(join(f.root, 'deck/R2.html')));
  const check = spawnSync(process.execPath, ['--import', guard, join(tool, 'scripts/deck.js'), 'check'], {env:process.env, encoding:'utf8'});
  assert.equal(check.status, 1);
  assert.match(check.stderr, /^Error: cannot read browser runtime lockfile [^\n]+\n$/);
  // Prove the read recorder fires, independently of the successful command.
  const control = spawnSync(process.execPath, ['--import', guard, '--input-type=module', '-e', `import {readFileSync} from 'node:fs';readFileSync(process.env.HOME+'/planted');`], {env:process.env, encoding:'utf8'});
  assert.notEqual(control.status, 0);
  assert.ok(fs.readFileSync(record, 'utf8').includes('readFileSync'));
});

test('R4 a file at the final runtime path is repaired on exactly one retry', async t => {
  const f = fixture(t), r = await f.import('browser-runtime/browser-runtime.js'), target = r.personRuntimeDir();
  fs.mkdirSync(dirname(target), {recursive:true});
  fs.writeFileSync(target, 'interrupted runtime');
  fakeNpm(f);
  let renames = 0, stderr = '';
  const original = fs.renameSync;
  const watch = mock.method(fs, 'renameSync', (from, to) => {
    if (to === target) renames++;
    return original(from, to);
  });
  const output = mock.method(process.stderr, 'write', s => { stderr += s; return true; });
  syncBuiltinESMExports();
  try { assert.equal(await r.installBrowserRuntime(), target); }
  finally { watch.mock.restore(); output.mock.restore(); syncBuiltinESMExports(); }
  assert.equal(renames, 2);
  assert.equal(r.activeRuntimeDir(), target);
  assert.doesNotMatch(stderr, /not writable/);
  assert.deepEqual(fs.readdirSync(dirname(target)), [target.split('/').at(-1)]);
});

for (const code of ['EACCES', 'EPERM', 'EROFS', 'ENOTDIR']) test(`R4 writable advice only for permission errors: ${code}`, async t => {
  const f = fixture(t), r = await f.import('browser-runtime/browser-runtime.js'), target = r.personRuntimeDir();
  fakeNpm(f);
  const original = fs.renameSync;
  const watch = mock.method(fs, 'renameSync', (from, to) => {
    if (to === target) throw Object.assign(new Error('synthetic publication failure'), {code});
    return original(from, to);
  });
  syncBuiltinESMExports();
  try {
    await assert.rejects(r.installBrowserRuntime(), error => code === 'ENOTDIR' ? !/not writable/.test(error.message) : /not writable/.test(error.message));
  } finally { watch.mock.restore(); syncBuiltinESMExports(); }
});

test('R5 Node untrusted config plus unwritable copy reports no saved consent', async t => {
  const f = fixture(t), c = await f.import('consent.js'), config = wiserUserConfigDir();
  fs.mkdirSync(config, {recursive:true, mode:0o700});
  fs.chmodSync(config, 0o770);
  fs.chmodSync(f.copy, 0o500);
  let stderr = '';
  const watch = mock.method(process.stderr, 'write', s => { stderr += s; return true; });
  try { c.writeConsent(join(f.copy, 'tools/fake/run.js'), 'R2', true); }
  finally { watch.mock.restore(); fs.chmodSync(f.copy, 0o700); }
  assert.equal(stderr, 'This run is authorised and no consent was saved: the user-config directory is writable by group or others.\n');
  assert.equal(fs.existsSync(join(config, '.wiser-consent')), false);
  assert.equal(fs.existsSync(join(f.copy, '.wiser-consent')), false);
});

test('R1 trust failure before publication keeps its directory and reason', async t => {
  const f = fixture(t), r = await f.import('browser-runtime/browser-runtime.js'), config = wiserUserConfigDir();
  fakeNpm(f, `fs.mkdirSync('node_modules/playwright',{recursive:true});fs.writeFileSync('node_modules/playwright/package.json','{"version":"1.62.0"}');fs.chmodSync(${JSON.stringify(config)},0o770);`);
  await assert.rejects(r.installBrowserRuntime(), error => error.message.includes(config) && /writable by group/.test(error.message));
  assert.equal(fs.existsSync(r.personRuntimeDir()), false);
});
