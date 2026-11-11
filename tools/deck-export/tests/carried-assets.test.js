import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { toolCopy, assertPinnedCopy } from '../../lib/tests/carried-copy.js';
test('every carried theme scaffolds without packages, a browser, consent or npm', t => {
  const f = toolCopy(t,'deck-export');
  const manifest = JSON.parse(readFileSync(join(f.tool,'vendor/manifest.json')));
  assert.equal(manifest.version,'5.2.1');
  const themes = manifest.files.filter(file=>/^reveal\.js\/dist\/theme\/[^/]+\.css$/.test(file.path));
  assert.ok(themes.length >= 15);
  for (const theme of themes) {
    const name = theme.path.split('/').pop().slice(0,-4);
    const out = f.run(['scaffold','--output',join(f.root,name),'--theme',name], { imports:[f.preload], environment:f.isolatedEnv });
    assert.equal(out.status,0,out.stderr); assert.equal(out.stderr,'');
    const answer = JSON.parse(out.stdout);
    assert.equal(answer.theme,name);
    assert.deepEqual(readFileSync(join(answer.assets,'reveal.js')),readFileSync(join(f.tool,'vendor/reveal.js/dist/reveal.js')));
    assert.equal(existsSync(join(answer.assets,'THIRD-PARTY-NOTICES.txt')),false);
    for (const notice of ['LICENSE','highlight-LICENSE']) assert.ok(existsSync(join(answer.assets,notice)));
    assert.deepEqual(readFileSync(join(answer.assets,'highlight-LICENSE')),readFileSync(join(f.tool,'vendor/reveal.js/plugin/highlight/LICENSE')));
  }
});
test('template scaffolding, survey and invalid theme do not probe tool packages or consent', t => {
  const f = toolCopy(t,'deck-export'), input = join(f.root,'Template.html');
  writeFileSync(input,'<title>{{TITLE}}</title>');
  mkdirSync(join(f.root,'Template Assets'));
  for (const args of [['scaffold','--template',input,'--output',join(f.root,'templated')], ['check']]) {
    const out = f.run(args,{ imports:[f.preload],environment:f.isolatedEnv });
    assert.equal(out.status,0,out.stderr); assert.equal(out.stderr,'');
    if (args[0] === 'check') { const survey = JSON.parse(out.stdout); assert.equal(survey['reveal.js'],true); assert.equal(survey.playwright,false); }
  }
  const invalid = f.run(['scaffold','--output',join(f.root,'invalid'),'--theme','unknown'],{imports:[f.preload],environment:f.isolatedEnv});
  assert.equal(invalid.status,1); assert.equal(invalid.stdout,''); assert.match(invalid.stderr,/Available:/);
});

for (const path of ['dist/reveal.js','dist/theme/white.css','plugin/notes/notes.js','dist/theme/fonts/league-gothic/league-gothic.woff']) test(`selected carried ${path} is refused before copying or serving`, async t => {
  const f = toolCopy(t, 'deck-export');
  const target = join(f.tool, 'vendor/reveal.js', path);
  writeFileSync(target, Buffer.concat([readFileSync(target), Buffer.from(' ')]));
  const theme = path.includes('/fonts/') ? 'league' : 'white';
  const out = f.run(['scaffold', '--theme', theme, '--output', join(f.root, 'deck')], { environment: f.isolatedEnv });
  assert.equal(out.status, 1); assert.equal(out.stdout, ''); assert.match(out.stderr, /Restore this plugin copy/);
  const { revealAssets } = await import(pathToFileURL(join(f.tool, 'scripts/package-assets.js')));
  if (path.includes('/theme/')) assert.doesNotThrow(() => revealAssets());
  else assert.throws(() => revealAssets(), /Restore this plugin copy/);
});

test('unused carried files do not stop a font-free starter while check keeps the full scan', t => {
  const f = toolCopy(t, 'deck-export');
  rmSync(join(f.tool, 'vendor/reveal.js/dist/theme/fonts/league-gothic/OFL.md'));
  rmSync(join(f.tool, 'vendor/reveal.js/dist/theme/black.css'));
  const starter = f.run(['scaffold', '--theme', 'serif', '--output', join(f.root, 'deck')], { environment: f.isolatedEnv });
  assert.equal(starter.status, 0, starter.stderr);
  const survey = f.run(['check'], { environment: f.isolatedEnv });
  assert.equal(JSON.parse(survey.stdout)['reveal.js'], false);
});

for (const command of ['pdf', 'png']) test(`${command} exports with an unused carried font licence missing`, t => {
  const f = toolCopy(t, 'deck-export');
  rmSync(join(f.tool, 'vendor/reveal.js/dist/theme/fonts/league-gothic/OFL.md'));
  const input = join(f.root, 'Deck.html');
  writeFileSync(input, readFileSync(new URL('./fixtures/shared/deck.html', import.meta.url)));
  const output = join(f.root, command === 'pdf' ? 'deck.pdf' : 'pictures');
  const out = f.run([command, '--input', input, '--output', output, '--scale', '1']);
  assert.equal(out.status, 0, out.stderr);
  assert.ok(existsSync(output));
});

test('a font-using starter verifies every copied font and licence before writing', t => {
  const f = toolCopy(t, 'deck-export');
  rmSync(join(f.tool, 'vendor/reveal.js/dist/theme/fonts/league-gothic/OFL.md'));
  const output = join(f.root, 'deck');
  const out = f.run(['scaffold', '--theme', 'league', '--output', output], { environment: f.isolatedEnv });
  assert.equal(out.status, 1); assert.match(out.stderr, /Restore this plugin copy/);
  assert.equal(existsSync(output), false);
});

test('SETUP describes template mode as copying caller files', () => {
  const setup = readFileSync(new URL('../SETUP.md', import.meta.url), 'utf8');
  assert.match(setup, /Template mode copies the caller['’]s files/);
  assert.doesNotMatch(setup, /Both scaffold modes use carried/);
});

for (const path of ['dist/reveal.js','plugin/notes/notes.js','dist/theme/white.css']) test(`survey reports false for missing ${path}`, t => {
  const f=toolCopy(t,'deck-export'); rmSync(join(f.tool,'vendor/reveal.js',path));
  const out=f.run(['check'],{environment:f.isolatedEnv});
  assert.equal(out.status,0,out.stderr); assert.equal(JSON.parse(out.stdout)['reveal.js'],false);
});
test('missing reveal marker does not stop authorised browser repair',t=>{
  const f=toolCopy(t,'deck-export');rmSync(join(f.tool,'vendor/reveal.js/dist/reveal.js'));
  const runtime=join(f.tool,'../lib/browser-runtime/browser-runtime.js');
  writeFileSync(runtime,`export const runtimeDir=()=>'/synthetic';export const activeRuntimeDir=()=>null;export const personRuntimeDir=()=>'/synthetic';export const installBrowserRuntime=async()=>{throw new Error('browser repair reached')};`);
  const out=f.run(['check','--install'],{environment:f.isolatedEnv});
  assert.equal(out.status,1);assert.match(out.stderr,/browser repair reached/);assert.doesNotMatch(out.stderr,/Restore this plugin copy/);
});
test('League Gothic full upstream licence and package stub travel with starter fonts',t=>{
  const f=toolCopy(t,'deck-export');
  const out=f.run(['scaffold','--theme','league','--output',join(f.root,'deck')],{environment:f.isolatedEnv});
  assert.equal(out.status,0,out.stderr);const assets=JSON.parse(out.stdout).assets;
  const licence=readFileSync(join(assets,'fonts/league-gothic/OFL.md'));
  assert.deepEqual(licence,readFileSync(join(f.tool,'build/league-gothic-OFL.md')));
  assert.match(licence.toString(),/Reserved Font Name: "League Gothic"/);
  assert.match(licence.toString(),/Permission & Conditions/);
  assert.deepEqual(readFileSync(join(assets,'fonts/league-gothic/LICENSE')),readFileSync(join(f.tool,'vendor/reveal.js/dist/theme/fonts/league-gothic/LICENSE')));
});

test('paired carried and manifest edits are rejected by the pinned-package builder check', t => assertPinnedCopy(t, 'deck-export'));
