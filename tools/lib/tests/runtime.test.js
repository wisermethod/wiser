import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fixture, fakeNpm } from './fixtures.js';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function complete(dir) {
  mkdirSync(join(dir, 'node_modules/playwright'), { recursive: true });
  writeFileSync(join(dir, 'node_modules/playwright/package.json'), JSON.stringify({version:'1.62.0'}));
}
function run(script, env = process.env) {
  const child = spawn(process.execPath, ['--input-type=module', '-e', script], { env, stdio: ['ignore','pipe','pipe'] });
  let stderr = '', stdout = '';
  child.stdout.on('data', data => { stdout += data; });
  child.stderr.on('data', data => { stderr += data; });
  const done = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code, signal) => resolve({code, signal, stderr, stdout}));
  });
  return {child, done};
}
function installScript(f) { return `const r = await import(${JSON.stringify(pathToFileURL(join(f.runtime, 'browser-runtime.js')).href)}); await r.installBrowserRuntime();`; }

test('runtime key hashes the exact lockfile bytes and changes with them', async t => {
  const f = fixture(t), r = await f.import('browser-runtime/browser-runtime.js');
  const file = join(f.runtime, 'package-lock.json'), bytes = readFileSync(file);
  assert.equal(r.runtimeKey(), createHash('sha256').update(bytes).digest('hex').slice(0, 16));
  const before = r.personRuntimeDir();
  writeFileSync(file, Buffer.concat([bytes, Buffer.from(' ')]));
  assert.notEqual(r.personRuntimeDir(), before);
  assert.match(r.personRuntimeDir(), /runtimes[/\\]browser-[a-f0-9]{16}$/);
});

test('active runtime prefers copy, then person, then none; partial trees do not count', async t => {
  const f = fixture(t), r = await f.import('browser-runtime/browser-runtime.js'), person = r.personRuntimeDir();
  assert.equal(r.activeRuntimeDir(), null); assert.equal(r.runtimeDir(), person);
  mkdirSync(join(f.runtime, 'node_modules'), { recursive: true });
  mkdirSync(join(person, 'node_modules'), { recursive: true });
  assert.equal(r.activeRuntimeDir(), null);
  complete(person); assert.equal(r.activeRuntimeDir(), person);
  assert.equal(r.libCacheDir(), join(person, 'node_modules/.wiser-lib'));
  complete(f.runtime); assert.equal(r.activeRuntimeDir(), f.runtime);
  assert.equal(r.libCacheDir(), join(f.runtime, 'node_modules/.wiser-lib'));
  rmSync(join(f.runtime, 'node_modules'), {recursive:true});
  assert.equal(r.activeRuntimeDir(), person);
});

test('install publishes complete packages privately, loads by absolute path, and reuses them', async t => {
  const f = fixture(t), r = await f.import('browser-runtime/browser-runtime.js');
  fakeNpm(f);
  const dir = await r.installBrowserRuntime();
  assert.equal(dir, r.personRuntimeDir()); assert.equal(r.activeRuntimeDir(), dir);
  assert.deepEqual(readdirSync(dirname(dir)), [dir.split('/').at(-1)]);
  assert.equal(existsSync(join(f.runtime, 'node_modules')), false);
  for (const path of [dirname(dirname(dir)), dirname(dir), dir]) assert.equal(statSync(path).mode & 0o777, 0o700);
  const loaded = await r.loadPlaywright();
  assert.equal((loaded.chromium || loaded.default.chromium).fixture, true);
  fakeNpm(f, 'process.exit(7)');
  assert.equal(await r.installBrowserRuntime(), dir);
});

for (const [name, body, pattern] of [
  ['npm failure', 'process.exit(7)', /npm ci failed in/],
  ['interrupted npm', 'process.kill(process.pid, "SIGTERM")', /npm ci failed in/],
  ['missing marker', '', /npm ci finished but/]
]) test(`install cleans its temporary sibling on ${name}`, async t => {
  const f = fixture(t), r = await f.import('browser-runtime/browser-runtime.js');
  fakeNpm(f, body || 'process.exit(0)');
  await assert.rejects(r.installBrowserRuntime(), pattern);
  assert.deepEqual(readdirSync(dirname(r.personRuntimeDir())), []);
  assert.equal(r.activeRuntimeDir(), null);
});

test('install cleans up when its own process receives SIGTERM during npm', {timeout:10000}, async t => {
  const f = fixture(t), r = await f.import('browser-runtime/browser-runtime.js');
  const started = join(f.root, 'started');
  fakeNpm(f, `fs.writeFileSync(${JSON.stringify(started)}, process.cwd()); setInterval(()=>{},1000);`);
  const execution = run(installScript(f));
  t.after(() => { if (execution.child.exitCode === null) execution.child.kill('SIGKILL'); });
  for (let i=0; i<200 && !existsSync(started); i++) await delay(10);
  assert.ok(existsSync(started));
  execution.child.kill('SIGTERM');
  const result = await execution.done;
  assert.equal(result.code, 1); assert.match(result.stderr, /Interrupted by SIGTERM/);
  assert.deepEqual(readdirSync(dirname(r.personRuntimeDir())), []);
});

test('two independent processes racing publish one complete runtime and no siblings', {timeout:10000}, async t => {
  const f = fixture(t), r = await f.import('browser-runtime/browser-runtime.js');
  fakeNpm(f, `setTimeout(() => {fs.mkdirSync('node_modules/playwright',{recursive:true});fs.writeFileSync('node_modules/playwright/package.json',JSON.stringify({version:'1.62.0'}));},250);`);
  const results = await Promise.all([run(installScript(f)).done, run(installScript(f)).done]);
  for (const result of results) assert.equal(result.code, 0, result.stderr);
  assert.equal(r.activeRuntimeDir(), r.personRuntimeDir());
  assert.deepEqual(readdirSync(dirname(r.personRuntimeDir())), [r.personRuntimeDir().split('/').at(-1)]);
});

test('an unwritable runtime parent names the person destination', async t => {
  const f = fixture(t), r = await f.import('browser-runtime/browser-runtime.js');
  mkdirSync(dirname(dirname(r.personRuntimeDir())), {recursive:true});
  writeFileSync(dirname(r.personRuntimeDir()), 'blocked');
  await assert.rejects(r.installBrowserRuntime(), /browser runtime parent .* is not a directory/);
});


test('an existing copy-local install is reused without npm or changes to its files', async t => {
  const f = fixture(t), r = await f.import('browser-runtime/browser-runtime.js');
  complete(f.runtime);
  const marker = join(f.runtime, 'node_modules/playwright/package.json');
  const before = readFileSync(marker);
  fakeNpm(f, 'throw new Error("copy-local install must not run npm");');
  assert.equal(await r.installBrowserRuntime(), f.runtime);
  assert.deepEqual(readFileSync(marker), before);
  assert.deepEqual(readdirSync(f.home), []);
});

test('npm receives ci and the exact shipped manifests in a private sibling', async t => {
  const f = fixture(t), r = await f.import('browser-runtime/browser-runtime.js');
  const observed = join(f.root, 'npm-observed.json');
  fakeNpm(f, `fs.writeFileSync(${JSON.stringify(observed)}, JSON.stringify({
    args:process.argv.slice(2), cwd:process.cwd(),
    package:fs.readFileSync('package.json','utf8'), lock:fs.readFileSync('package-lock.json','utf8')
  }));
  process.stdout.write('npm chatter must not reach stdout');
  fs.mkdirSync('node_modules/playwright',{recursive:true});
  fs.writeFileSync('node_modules/playwright/package.json',JSON.stringify({version:'1.62.0'}));`);
  const execution = await run(installScript(f)).done;
  assert.equal(execution.code, 0, execution.stderr);
  assert.equal(execution.stdout, '');
  const data = JSON.parse(readFileSync(observed, 'utf8'));
  assert.deepEqual(data.args, ['ci']);
  assert.ok(data.cwd.startsWith(r.personRuntimeDir() + '.tmp-'));
  assert.equal(data.package, readFileSync(join(f.runtime, 'package.json'), 'utf8'));
  assert.equal(data.lock, readFileSync(join(f.runtime, 'package-lock.json'), 'utf8'));
  assert.equal(existsSync(data.cwd), false);
});


for (const format of ['commonjs', 'module']) test(`Playwright ${format} export shape supplies Chromium to both launch methods`, async t => {
  const f = fixture(t), r = await f.import('browser-runtime/browser-runtime.js');
  const body = `const chromium = {
    executablePath: () => '',
    launch: async () => ({fixture:true}),
    launchPersistentContext: async () => ({fixture:true})
  };` + (format === 'module' ? 'export {chromium};' : 'module.exports = { ["chromium"]: chromium };');
  fakeNpm(f, `fs.mkdirSync('node_modules/playwright',{recursive:true});
    fs.writeFileSync('node_modules/playwright/package.json', JSON.stringify({version:'1.62.0',name:'playwright',main:'index.js',type:${JSON.stringify(format)}}));
    fs.writeFileSync('node_modules/playwright/index.js',${JSON.stringify(body)});`);
  await r.installBrowserRuntime();
  assert.equal((await r.launch()).fixture, true);
  assert.equal((await r.launchPersistentContext(join(f.root, 'profile'))).fixture, true);
});


test('incomplete final directory is repaired on one rename retry without not-writable advice', async t => {
  const f = fixture(t), r = await f.import('browser-runtime/browser-runtime.js');
  const target = r.personRuntimeDir();
  mkdirSync(target, {recursive:true});
  writeFileSync(join(target, 'incomplete'), 'killed install');
  fakeNpm(f);
  let renames=0;
  const rename=fs.renameSync;
  const watch=mock.method(fs,'renameSync',(from,to)=>{if(to===target)renames++;return rename(from,to);});
  syncBuiltinESMExports();
  try { await r.installBrowserRuntime(); }
  finally { watch.mock.restore(); syncBuiltinESMExports(); }
  assert.equal(renames,2,'one failed publication and exactly one retry');
  assert.equal(existsSync(join(target, 'incomplete')), false);
  assert.equal(r.activeRuntimeDir(), target);
  assert.deepEqual(readdirSync(dirname(target)), [target.split('/').at(-1)]);
});

test('only stale temporary siblings for this key are removed; a fresh install is left', async t => {
  const f = fixture(t), r = await f.import('browser-runtime/browser-runtime.js');
  const target = r.personRuntimeDir(), stale = target+'.tmp-old', fresh = target+'.tmp-fresh';
  const unrelated = join(dirname(target), 'browser-other.tmp-old');
  for (const dir of [stale, fresh, unrelated]) mkdirSync(dir, {recursive:true});
  const old = new Date(Date.now()-2*60*60*1000);
  utimesSync(stale, old, old); utimesSync(unrelated, old, old);
  fakeNpm(f); await r.installBrowserRuntime();
  assert.equal(existsSync(stale), false);
  assert.equal(existsSync(fresh), true);
  assert.equal(existsSync(unrelated), true);
});

test('wrong-version copy-local Playwright is skipped unchanged for a valid person runtime', async t => {
  const f = fixture(t), r = await f.import('browser-runtime/browser-runtime.js'), person = r.personRuntimeDir();
  complete(f.runtime); complete(person);
  const file = join(f.runtime, 'node_modules/playwright/package.json');
  writeFileSync(file, '{"version":"0.0.0"}');
  const bytes = readFileSync(file);
  fakeNpm(f, 'throw new Error("must reuse person runtime")');
  assert.equal(r.activeRuntimeDir(), person);
  assert.equal(await r.installBrowserRuntime(), person);
  assert.deepEqual(readFileSync(file), bytes);
});

test('wrong-version person Playwright is reinstalled with the lockfile version', async t => {
  const f = fixture(t), r = await f.import('browser-runtime/browser-runtime.js'), person = r.personRuntimeDir();
  complete(person);
  writeFileSync(join(person, 'node_modules/playwright/package.json'), '{"version":"0.0.0"}');
  assert.equal(r.activeRuntimeDir(), null);
  fakeNpm(f);
  assert.equal(await r.installBrowserRuntime(), person);
  assert.equal(JSON.parse(readFileSync(join(person, 'node_modules/playwright/package.json'))).version, '1.62.0');
});
