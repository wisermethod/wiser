import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fixture, successful } from '../../lib/build/install-free-fixture.mjs';
import { ROOT } from '../../lib/build/one-file.mjs';

function setup(t) {
  const f = fixture(t, 'keynote-render');
  const brand = f.write('brand.yaml', 'theme: Test\nlayouts:\n  bullets: Title\ntexts:\n  Title:\n    subtitle: 1\n');
  const spec = f.write('spec.json', JSON.stringify({ slides: [{ layout: 'bullets', title: 'Hello', texts: { subtitle: 'Mapped' } }] }));
  const preload = f.write('keynote.mjs', `import fs from 'node:fs'; import cp from 'node:child_process'; import { syncBuiltinESMExports } from 'node:module';
const exists = fs.existsSync;
fs.existsSync = path => String(path) === '/Applications/Keynote.app' || exists(path);
cp.execFileSync = (program, args) => { if (program !== '/usr/bin/osascript') throw Error('installer called'); return 'true'; };
cp.execFile = (program, args, options, callback) => {
  if (program !== '/usr/bin/osascript') throw Error('installer called');
  const params = JSON.parse(args.at(-1));
  fs.appendFileSync(process.env.KEYNOTE_CALLS, JSON.stringify(params) + '\\n');
  let result = { name: 'Test', slideCount: 1, slides: [{slideNumber:1,layout:'Title',titleSet:true,bodySet:true}] };
  if (params.outputPath) fs.writeFileSync(params.outputPath, 'fake-keynote');
  if (params.ops) result = {slideCount:1,applied:[{op:'update',slideNumber:1,titleSet:true,bodySet:true}]};
  callback(null, JSON.stringify(result), '');
}; syncBuiltinESMExports();`);
  return { ...f, brand, spec, preload, calls: join(f.root, 'calls.jsonl') };
}

test('loadable installed yaml runs source even when the compiled file is unusable', t => {
  const f = setup(t);
  symlinkSync(join(process.env.WISER_TEST_SOURCE_ROOT || ROOT, 'tools/keynote-render/node_modules'), join(f.target, 'node_modules'), 'dir');
  writeFileSync(join(f.target, 'dist/render.mjs'), 'throw Error("compiled entry reached");');
  successful(f.run(['build', '--spec', f.spec, '--brand', f.brand, '--out', join(f.root, 'source.key')], { preload: f.preload, extra: { KEYNOTE_CALLS: f.calls } }));
  unlinkSync(join(f.target, 'node_modules'));
  f.assertClean();
});

test('fresh branded JSON and markdown builds use bundled yaml with the unchanged entry command', t => {
  const f = setup(t);
  for (const compiled of [false, true]) {
    const out = join(f.root, `built-${compiled}.key`);
    const answer = successful(f.run(['build', '--spec', f.spec, '--brand', f.brand, '--out', out, ...(compiled ? ['--install'] : [])], { compiled, preload: f.preload, extra: { KEYNOTE_CALLS: f.calls } }));
    assert.equal(answer.theme, 'Test');
    assert.equal(readFileSync(out, 'utf8'), 'fake-keynote');
    const params = JSON.parse(readFileSync(f.calls, 'utf8').trim().split('\n').at(-1));
    assert.equal(params.slides[0].layout, 'Title');
    assert.deepEqual(params.slides[0].texts, { 1: 'Mapped' });
  }
  const md = f.write('slides.md', '## Slide 1. Hello\nlayout: bullets\nOn slide:\n- Body\n');
  const answer = successful(f.run(['sync', '--md', md, '--deck', join(f.root, 'sync.key'), '--brand', f.brand], { preload: f.preload, extra: { KEYNOTE_CALLS: f.calls } }));
  assert.equal(answer.mode, 'build');
  f.assertClean();
});

test('branded markdown patch uses bundled yaml and archives the existing deck', t => {
  const f = setup(t);
  const md = f.write('slides.md', '## Slide 1. Updated\nlayout: bullets\nOn slide:\n- Body\n');
  const deck = f.write('existing.key', 'hand-crafted deck');
  const answer = successful(f.run(['sync', '--md', md, '--deck', deck, '--brand', f.brand, '--confirm'], { preload: f.preload, extra: { KEYNOTE_CALLS: f.calls } }));
  assert.equal(answer.mode, 'patch');
  assert.equal(readFileSync(answer.archivePath, 'utf8'), 'hand-crafted deck');
  assert.equal(answer.applied[0].op, 'update');
  f.assertClean();
});

test('partial yaml tree falls back; malformed brands fail before Keynote or npm', t => {
  const f = setup(t);
  const pkg = join(f.target, 'node_modules/yaml');
  mkdirSync(pkg, { recursive: true });
  writeFileSync(join(pkg, 'package.json'), '{"name":"yaml","type":"module","main":"missing.js"}');
  const brand = f.write('bad-brand.yaml', 'theme: [unterminated');
  const out = f.run(['build', '--spec', f.spec, '--brand', brand, '--out', join(f.root, 'bad.key')]);
  assert.equal(out.status, 1); assert.equal(out.stdout, '');
  assert.match(out.stderr, /not valid YAML/);
  assert.doesNotMatch(out.stderr, /--install|test refused/);
  rmSync(join(f.target, 'node_modules'), { recursive: true });
  f.assertClean();
});

test('branded mutators preserve the original deck in an archive before the stubbed JXA call', t => {
  const f = setup(t);
  const deck = f.write('deck.key', 'original');
  for (const args of [
    ['update-slide', '--slide', '1', '--title', 'Changed'],
    ['insert-slide', '--after', '1', '--title', 'Inserted', '--layout', 'bullets'],
    ['delete-slide', '--slide', '1']
  ]) {
    const answer = successful(f.run([...args, '--deck', deck, '--brand', f.brand, '--confirm'], { preload: f.preload, extra: { KEYNOTE_CALLS: f.calls } }));
    assert.equal(readFileSync(answer.archivePath, 'utf8'), 'original');
  }
  f.assertClean();
});

test('help and check need no packages; flags, tool paths and replacement refusals stay intact', t => {
  const f = setup(t);
  assert.equal(f.run(['help']).status, 0);
  assert.equal(typeof successful(f.run(['check'])).keynote, 'boolean');
  const occupied = f.write('occupied.key', 'keep');
  for (const args of [
    ['build', '--spec', f.spec, '--brand', f.brand, '--out', join(f.target, 'output.key')],
    ['build', '--spec', f.spec, '--brand', f.brand, '--out', occupied],
    ['build', '--spec', f.spec, '--unknown'],
    ['update-slide', '--deck', occupied, '--slide', '1', '--title', 'Changed']
  ]) {
    const out = f.run(args); assert.equal(out.status, 1); assert.equal(out.stdout, '');
    assert.doesNotMatch(out.stderr, /--install|test refused/);
  }
  assert.equal(readFileSync(occupied, 'utf8'), 'keep');
  f.assertClean();
});

test('source and compiled entries import without running main', t => {
  const f = fixture(t, 'keynote-render');
  const driver = f.write('import.mjs',
    `import ${JSON.stringify(pathToFileURL(join(f.target, 'scripts/render.js')).href)};\n` +
    `import ${JSON.stringify(pathToFileURL(join(f.target, 'dist/render.mjs')).href)};\nconsole.log('imported');`);
  const out = spawnSync(process.execPath, [driver], {env:f.env,encoding:'utf8',timeout:15000});
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.stdout, 'imported\n'); assert.equal(out.stderr, '');
  f.assertClean();
});

test('loadable yaml at the wrong version uses the compiled file', t => {
  const f = setup(t);
  const args = ['build', '--spec', f.spec, '--brand', f.brand, '--out', join(f.root, 'version.key')];
  const options = { preload: f.preload, extra: { KEYNOTE_CALLS: f.calls } };
  const baseline = f.run(args, { ...options, compiled: true });
  successful(baseline);
  rmSync(join(f.root, 'version.key'));
  const pkg = join(f.target, 'node_modules/yaml');
  mkdirSync(pkg, { recursive: true });
  writeFileSync(join(pkg, 'package.json'), '{"name":"yaml","version":"0.0.1","type":"module","exports":"./index.js"}');
  writeFileSync(join(pkg, 'index.js'), 'export function parse() { throw Error("wrong-version yaml ran"); }');
  const out = f.run(args, options);
  const locked = JSON.parse(readFileSync(join(f.target, 'package-lock.json'))).packages['node_modules/yaml'].version;
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.stderr, `Using compiled render: yaml installed version 0.0.1 differs from locked version ${locked}.\n`);
  assert.equal(out.stdout, baseline.stdout);
});

test('keynote post-install check rejects a marker whose yaml still does not load', t => {
  const f = setup(t);
  rmSync(join(f.target, 'dist'), { recursive: true });
  const preload = f.write('install-broken.mjs', `import fs from 'node:fs'; import cp from 'node:child_process'; import { syncBuiltinESMExports } from 'node:module';
cp.execFileSync = (program, args, options) => {
  if (args[0] !== 'ci') throw Error('unexpected process');
  const pkg = options.cwd + '/node_modules/yaml'; fs.mkdirSync(pkg, {recursive:true});
  fs.writeFileSync(pkg+'/package.json', JSON.stringify({name:'yaml',version:'2.9.0',type:'module',exports:'./missing.js'}));
}; syncBuiltinESMExports();`);
  const out = f.run(['build', '--spec', f.spec, '--brand', f.brand, '--out', join(f.root, 'broken.key'), '--install'], { preload });
  assert.equal(out.status, 1);
  assert.match(out.stderr, /npm ci finished but the required packages do not load/);
});

test('locked brand install and package-free compiled file produce identical output and JXA parameters', t => {
  const f = setup(t);
  const install = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci', '--offline', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: f.target, env: process.env, encoding: 'utf8' });
  assert.equal(install.status, 0, install.stderr);
  const dist = join(f.target,'dist/render.mjs'), original = readFileSync(dist);
  writeFileSync(dist, 'throw Error("source comparison accidentally used compiled file");');
  const out = join(f.root,'comparison.key');
  const args = ['build', '--spec', f.spec, '--brand', f.brand, '--out', out];
  const options = {preload:f.preload,extra:{KEYNOTE_CALLS:f.calls}};
  const source = f.run(args, options); successful(source);
  const deck = readFileSync(out), calls = readFileSync(f.calls);
  rmSync(out); rmSync(f.calls); writeFileSync(dist, original);
  rmSync(join(f.target,'node_modules'), {recursive:true}); f.assertClean();
  const compiled = f.run(args, {...options,compiled:true});
  for (const key of ['status','stdout','stderr']) assert.equal(compiled[key], source[key], key);
  assert.deepEqual(readFileSync(out), deck); assert.deepEqual(readFileSync(f.calls), calls);
});
