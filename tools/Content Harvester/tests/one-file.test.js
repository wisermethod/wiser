import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fixture, successful } from '../../lib/build/install-free-fixture.mjs';
import { ROOT } from '../../lib/build/one-file.mjs';
import { installedRequirement, packInstalledPackage } from '../../lib/build/test-package-cache.mjs';

const casePath = fileURLToPath(new URL('./fixtures/case-0.json', import.meta.url));
const network = fileURLToPath(new URL('./fixtures/cli-network.mjs', import.meta.url));
const request = JSON.stringify(JSON.parse(readFileSync(casePath, 'utf8')).request);

test('loadable installed packages run source even when the compiled file is unusable', t => {
  const f = fixture(t, 'Content Harvester');
  symlinkSync(join(process.env.WISER_TEST_SOURCE_ROOT || ROOT, 'tools/Content Harvester/node_modules'), join(f.target, 'node_modules'), 'dir');
  writeFileSync(join(f.target, 'dist/harvest.mjs'), 'throw Error("compiled entry reached");');
  successful(f.run(['run', '--request', f.write('request.json', request), '--output', f.root], { preload: network, extra: { HARVEST_CASE: casePath } }));
  unlinkSync(join(f.target, 'node_modules'));
  f.assertClean();
});

test('fresh documented entry and direct compiled entry harvest RSS without packages, npm or consent', t => {
  const f = fixture(t, 'Content Harvester');
  const path = f.write('request.json', request);
  for (const compiled of [false, true]) {
    const answer = successful(f.run(['run', '--request', path, '--output', f.root, ...(compiled ? ['--install'] : [])], { compiled, preload: network, extra: { HARVEST_CASE: casePath } }));
    assert.ok(answer.candidate_count > 0);
    const bundle = JSON.parse(readFileSync(join(answer.output_directory, 'harvest-candidates.json')));
    assert.ok(bundle.candidates.some(item => item.title));
  }
  f.assertClean();
});

test('partial parser install falls back to compiled file and preparation never needs undici', t => {
  const f = fixture(t, 'Content Harvester');
  const path = f.write('request.json', request);
  const marker = join(f.target, 'node_modules/fast-xml-parser');
  mkdirSync(marker, { recursive: true });
  writeFileSync(join(marker, 'package.json'), '{"name":"fast-xml-parser","type":"module","main":"missing.js"}');
  successful(f.run(['run', '--request', path, '--output', f.root], { preload: network, extra: { HARVEST_CASE: casePath, HTTPS_PROXY: '   ' } }));
  rmSync(join(f.target, 'node_modules'), { recursive: true });
  for (const args of [['sample'], ['validate', '--request', path], ['run', '--request', path, '--dry-run']]) {
    successful(f.run(args, { extra: { HTTPS_PROXY: 'http://proxy.invalid:8080' } }));
  }
  f.assertClean();
});

test('proxy selection trims and skips blanks in sitemap order; only run asks for external undici', t => {
  const f = fixture(t, 'Content Harvester');
  const path = f.write('request.json', request);
  const proxies = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy'];
  for (const selected of proxies) {
    const extra = Object.fromEntries(proxies.map(name => [name, ' \t ']));
    extra[selected] = ' http://selected.invalid:8080 ';
    const out = f.run(['run', '--request', path], { extra: { ...extra, NO_PROXY: '*', no_proxy: '*' } });
    assert.equal(out.status, 1);
    assert.equal(out.stdout, '');
    assert.match(out.stderr, /undici/);
    assert.match(out.stderr, /--install/);
  }
  // Fake only the external dispatcher, recording which proxy the compiled file uses.
  const pkg = join(f.target, 'node_modules/undici');
  mkdirSync(pkg, { recursive: true });
  writeFileSync(join(pkg, 'package.json'), '{"name":"undici","version":"6.28.0","type":"module","exports":"./index.js"}');
  writeFileSync(join(pkg, 'index.js'), 'export class ProxyAgent { constructor(url) { globalThis.proxyConstructed = true; if (url !== process.env.EXPECT_PROXY) throw Error("wrong proxy: " + url); } } export function setGlobalDispatcher() { globalThis.dispatcherSet = true; }');
  const guardedNetwork = f.write('proxy-network.mjs', `import ${JSON.stringify(pathToFileURL(network).href)};
const fetch = globalThis.fetch; globalThis.fetch = (...args) => { if (!globalThis.proxyConstructed || !globalThis.dispatcherSet) process.exit(78); return fetch(...args); };`);
  for (let i = 0; i < proxies.length; i++) {
    const extra = Object.fromEntries(proxies.map((name, j) => [name, j < i ? ' \t ' : ` http://proxy${j}.invalid:8080 `]));
    successful(f.run(['run', '--request', path, '--output', f.root], { preload: guardedNetwork, extra: { ...extra, EXPECT_PROXY: `http://proxy${i}.invalid:8080`, HARVEST_CASE: casePath } }));
  }
  rmSync(join(f.target, 'node_modules'), { recursive: true });
  f.assertClean();
});

test('compiled path still refuses requests and outputs inside its tool, unknown options and bad requests', t => {
  const f = fixture(t, 'Content Harvester');
  const path = f.write('request.json', request);
  const bad = f.write('bad.json', '{');
  for (const args of [
    ['run', '--request', path, '--output', join(f.target, 'out')],
    ['validate', '--request', join(f.target, 'package.json')],
    ['run', '--request', path, '--unknown'], ['run', '--request', bad]
  ]) {
    const out = f.run(args);
    assert.equal(out.status, 1); assert.equal(out.stdout, '');
    assert.doesNotMatch(out.stderr, /--install|test refused/);
  }
  f.assertClean();
});

test('source and compiled entries import without running main', t => {
  const f = fixture(t, 'Content Harvester');
  const driver = f.write('import.mjs',
    `import ${JSON.stringify(pathToFileURL(join(f.target, 'scripts/harvest.js')).href)};\n` +
    `import ${JSON.stringify(pathToFileURL(join(f.target, 'dist/harvest.mjs')).href)};\nconsole.log('imported');`);
  const out = spawnSync(process.execPath, [driver], {env:f.env,encoding:'utf8',timeout:15000});
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.stdout, 'imported\n'); assert.equal(out.stderr, '');
  f.assertClean();
});

test('loadable parser at the wrong version uses the compiled file', t => {
  const f = fixture(t, 'Content Harvester');
  const args = ['run', '--request', f.write('request.json', request), '--output', f.root];
  const options = { preload: network, extra: { HARVEST_CASE: casePath } };
  const baseline = f.run(args, { ...options, compiled: true });
  successful(baseline);
  const pkg = join(f.target, 'node_modules/fast-xml-parser');
  mkdirSync(pkg, { recursive: true });
  writeFileSync(join(pkg, 'package.json'), '{"name":"fast-xml-parser","version":"0.0.1","type":"module","exports":"./index.js"}');
  writeFileSync(join(pkg, 'index.js'), 'export class XMLParser { constructor() { process.exit(77); } }');
  const out = f.run(args, options);
  const locked = JSON.parse(readFileSync(join(f.target, 'package-lock.json'))).packages['node_modules/fast-xml-parser'].version;
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.stderr, `Using compiled harvest: fast-xml-parser installed version 0.0.1 differs from locked version ${locked}.\n`);
  assert.equal(out.stdout, baseline.stdout);
  const answer = JSON.parse(out.stdout);
  assert.ok(answer.candidate_count > 0);
});

test('a drifted transitive parser package is named once before compiled parsing', t => {
  const sourceRoot = process.env.WISER_TEST_SOURCE_ROOT || ROOT;
  const missing = installedRequirement('Content Harvester', ['node_modules/fast-xml-parser', 'node_modules/anynum'], sourceRoot);
  if (missing) { t.skip(missing); return; }
  const f = fixture(t, 'Content Harvester');
  const args = ['run', '--request', f.write('request.json', request), '--output', f.root];
  const options = { preload: network, extra: { HARVEST_CASE: casePath } };
  const baseline = f.run(args, { ...options, compiled: true });
  successful(baseline);
  // dereference: a suite runner may supply node_modules as a link to a shared cache, and this test changes its copy.
  cpSync(join(sourceRoot, 'tools/Content Harvester/node_modules'), join(f.target, 'node_modules'), { recursive: true, dereference: true });
  const marker = join(f.target, 'node_modules/anynum/package.json');
  const manifest = JSON.parse(readFileSync(marker));
  manifest.version = '0.0.1';
  writeFileSync(marker, JSON.stringify(manifest));
  const locked = JSON.parse(readFileSync(join(f.target, 'package-lock.json'))).packages['node_modules/anynum'].version;
  const guard = f.write('notice-before-compiled.mjs', `import ${JSON.stringify(pathToFileURL(network).href)};
const write = process.stderr.write.bind(process.stderr);
process.stderr.write = (message, ...args) => { if (String(message).startsWith('Using compiled harvest:')) globalThis.versionNoticeWritten = true; return write(message, ...args); };`);
  const dist = join(f.target, 'dist/harvest.mjs');
  writeFileSync(dist, 'if (!globalThis.versionNoticeWritten) throw Error("compiled file ran before its version notice");\n' + readFileSync(dist, 'utf8'));
  const out = f.run(args, { ...options, preload: guard });
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.stderr, `Using compiled harvest: anynum installed version 0.0.1 differs from locked version ${locked}.\n`);
  assert.equal(out.stdout, baseline.stdout);
});

test('selected proxy refuses an undici without dispatcher exports before fetching', t => {
  const f = fixture(t, 'Content Harvester');
  const pkg = join(f.target, 'node_modules/undici');
  mkdirSync(pkg, { recursive: true });
  writeFileSync(join(pkg, 'package.json'), '{"name":"undici","version":"6.28.0","type":"module","exports":"./index.js"}');
  writeFileSync(join(pkg, 'index.js'), 'export const incomplete = true;');
  const preload = f.write('no-fetch.mjs', `globalThis.fetch = () => { throw Error('FETCH MUST NOT RUN'); };`);
  const out = f.run(['run', '--request', f.write('request.json', request), '--output', f.root], { preload, extra: { HTTPS_PROXY: 'http://proxy.invalid:8080' } });
  assert.equal(out.status, 1);
  assert.equal(out.stdout, '');
  assert.equal(out.stderr.trim(), 'Error: the installed undici cannot configure the selected proxy. Restore this tool’s dependencies with npm ci.');
});

test('compiled proxy consent names only undici and its measured size', t => {
  const f = fixture(t, 'Content Harvester');
  const out = f.run(['run', '--request', f.write('request.json', request)], { extra: { HTTPS_PROXY: 'http://proxy.invalid:8080' } });
  assert.equal(out.status, 1);
  assert.match(out.stderr.split('\n')[0], /install undici .*about 1\.6 MB/);
  assert.doesNotMatch(out.stderr, /feed reader|fast-xml-parser/);
});

test('locked RSS install and package-free compiled file produce identical output bytes', t => {
  const f = fixture(t, 'Content Harvester');
  const install = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci', '--offline', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: f.target, env: process.env, encoding: 'utf8' });
  assert.equal(install.status, 0, install.stderr);
  const dist = join(f.target, 'dist/harvest.mjs'), original = readFileSync(dist);
  writeFileSync(dist, 'throw Error("source comparison accidentally used compiled file");');
  const args = ['run', '--request', f.write('request.json', request), '--output', f.root];
  const options = { preload: network, extra: { HARVEST_CASE: casePath } };
  const source = f.run(args, options), answer = successful(source);
  const artifacts = () => Object.fromEntries(readdirSync(answer.output_directory).sort().map(name => [name, readFileSync(join(answer.output_directory, name), 'utf8')]));
  const expected = artifacts();
  assert.ok(expected['harvest-candidates.json'].includes('solar'));
  writeFileSync(dist, original);
  rmSync(join(f.target, 'node_modules'), { recursive: true }); f.assertClean();
  const compiled = f.run(args, { ...options, compiled: true });
  for (const key of ['status', 'stdout', 'stderr']) assert.equal(compiled[key], source[key], key);
  assert.deepEqual(artifacts(), expected);
});

test('compiled proxy install fetches only locked undici and the next run keeps compiled parsing', t => {
  const f = fixture(t, 'Content Harvester');
  const manifest = readFileSync(join(f.target, 'package.json')), lock = readFileSync(join(f.target, 'package-lock.json'));
  const version = JSON.parse(lock).packages['node_modules/undici'].version;
  const trace = join(f.root, 'install.json');
  const preload = f.write('install-proxy.mjs', `import fs from 'node:fs'; import cp from 'node:child_process'; import {syncBuiltinESMExports} from 'node:module';
import ${JSON.stringify(pathToFileURL(network).href)};
cp.execFileSync = (program, args, options) => {
  if (!/npm/.test(program) || args[0] !== 'ci') throw Error('unexpected installer');
  const manifest = JSON.parse(fs.readFileSync(options.cwd+'/package.json'));
  const lock = JSON.parse(fs.readFileSync(options.cwd+'/package-lock.json'));
  fs.writeFileSync(${JSON.stringify(trace)}, JSON.stringify({args,manifest,lock}));
  const dir = options.cwd+'/node_modules/undici'; fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(dir+'/package.json', JSON.stringify({name:'undici', version:${JSON.stringify(version)}, type:'module', exports:'./index.js'}));
  fs.writeFileSync(dir+'/index.js', 'export class ProxyAgent {} export function setGlobalDispatcher() {}');
}; syncBuiltinESMExports();`);
  const args = ['run', '--request', f.write('request.json', request), '--output', f.root];
  const extra = { HTTPS_PROXY: 'http://proxy.invalid:8080', HARVEST_CASE: casePath };
  const out = f.run([...args, '--install'], { preload, extra });
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stderr, /First run: installing dependencies in a temporary directory; copying undici into this tool directory\./);
  assert.doesNotMatch(out.stderr, /First run: installing dependencies in this tool directory\./);
  const installed = JSON.parse(readFileSync(trace));
  assert.deepEqual(installed.manifest.dependencies, {undici:version});
  assert.deepEqual(Object.keys(installed.lock.packages).sort(), ['', 'node_modules/undici']);
  assert.deepEqual(installed.lock.packages['node_modules/undici'], JSON.parse(lock).packages['node_modules/undici']);
  assert.equal(existsSync(join(f.target,'node_modules/fast-xml-parser')), false);
  writeFileSync(join(f.target,'scripts/adapters/rss.js'), 'throw Error("source parser reached after proxy install");');
  successful(f.run(args, { preload: network, extra }));
  assert.deepEqual(readFileSync(join(f.target,'package.json')), manifest);
  assert.deepEqual(readFileSync(join(f.target,'package-lock.json')), lock);
});

test('failed temporary undici install preserves shipped manifests and reports npm without destructive advice', t => {
  const f = fixture(t, 'Content Harvester');
  const manifest = readFileSync(join(f.target, 'package.json')), lock = readFileSync(join(f.target, 'package-lock.json'));
  const trace = join(f.root, 'install-cwd.txt');
  const preload = f.write('fail-install.mjs', `import fs from 'node:fs'; import cp from 'node:child_process'; import {syncBuiltinESMExports} from 'node:module';
cp.execFileSync = (program, args, options) => {
  if (!/npm/.test(program) || args[0] !== 'ci') throw Error('unexpected installer');
  fs.writeFileSync(${JSON.stringify(trace)}, options.cwd);
  process.stderr.write('npm error EOFFLINE fixture registry unavailable\\n');
  const error = new Error('npm exited 1'); error.status = 1; throw error;
}; syncBuiltinESMExports();`);
  const out = f.run(['run', '--request', f.write('request.json', request), '--output', f.root, '--install'], { preload, extra: { HTTPS_PROXY: 'http://proxy.invalid:8080' } });
  assert.equal(out.status, 1, out.stderr);
  assert.equal(out.stdout, '');
  assert.deepEqual(readFileSync(join(f.target, 'package.json')), manifest);
  assert.deepEqual(readFileSync(join(f.target, 'package-lock.json')), lock);
  assert.equal(existsSync(readFileSync(trace, 'utf8')), false, 'temporary install must be removed');
  assert.match(out.stderr, /npm error EOFFLINE fixture registry unavailable/);
  assert.match(out.stderr, /temporary undici install failed/);
  assert.match(out.stderr, /tool's package\.json and package-lock\.json were left unchanged/);
  assert.doesNotMatch(out.stderr, /[Dd]elete|[Rr]emove.*node_modules|run "?npm ci|npm ci failed in/);
});

test('real offline reduced undici install uses only its own freshly built cache', t => {
  const sourceRoot = process.env.WISER_TEST_SOURCE_ROOT || ROOT;
  const missing = installedRequirement('Content Harvester', ['node_modules/undici'], sourceRoot);
  if (missing) { t.skip(missing); return; }
  const f = fixture(t, 'Content Harvester');
  const cache = join(f.root, 'private-npm-cache');
  const lockPath = join(f.target, 'package-lock.json'), fixtureLock = JSON.parse(readFileSync(lockPath));
  // Only the disposable fixture lock authenticates the test's locally packed tarball.
  fixtureLock.packages['node_modules/undici'].integrity = packInstalledPackage(join(sourceRoot, 'tools/Content Harvester/node_modules/undici'), cache);
  writeFileSync(lockPath, JSON.stringify(fixtureLock));
  const manifest = readFileSync(join(f.target, 'package.json')), lock = readFileSync(lockPath);
  const out = f.run(['run', '--request', f.write('request.json', request), '--output', f.root, '--install'], {
    offlineInstall: true, preload: network, extra: { HTTPS_PROXY: 'http://proxy.invalid:8080', HARVEST_CASE: casePath, npm_config_cache: cache }
  });
  assert.equal(out.status, 0, out.stderr);
  assert.ok(JSON.parse(out.stdout).candidate_count > 0);
  assert.equal(JSON.parse(readFileSync(join(f.target, 'node_modules/undici/package.json'))).version, fixtureLock.packages['node_modules/undici'].version);
  assert.equal(existsSync(join(f.target, 'node_modules/fast-xml-parser')), false);
  assert.match(out.stderr, /installing dependencies in a temporary directory/);
  assert.deepEqual(readFileSync(join(f.target, 'package.json')), manifest);
  assert.deepEqual(readFileSync(lockPath), lock);
});

test('offline fixture blocks spawn, exec and DNS resolution escape paths', t => {
  const f = fixture(t, 'Content Harvester');
  const preload = f.write('guard-controls.mjs', `import cp from 'node:child_process'; import dns from 'node:dns';
for (const call of [() => cp.spawn('false'), () => cp.exec('false'), () => dns.resolve('network.invalid'), () => dns.promises.resolve('network.invalid')]) {
  let refused = false; try { call(); } catch (error) { refused = error.message === 'test refused real network or installer'; } if (!refused) process.exit(79);
}`);
  successful(f.run(['sample'], { preload }));
});
