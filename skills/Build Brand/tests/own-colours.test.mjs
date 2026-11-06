import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const moduleURL = new URL('../scripts/own-colours.mjs', import.meta.url);
const load = () => import(moduleURL);
test('own colour words: flag red, white and navy blue, all roles and checks', async () => {
  const { buildOwnColours, checkPalette } = await load();
  const r = buildOwnColours('red, white and blue');
  assert.equal(r.status, 'ready');
  const p = r.kept.palette.overrides;
  assert.equal(p.light.ground, '#FFFFFF'); assert.equal(p.dark.ground, '#162D50');
  assert.equal(p.light.pop, '#B22234'); assert.equal(p.dark.pop, '#B22234');
  assert.equal(p.light.text, '#162D50'); assert.equal(p.dark.text, '#FFFFFF');
  for (const mode of ['light','dark']) assert.equal(Object.keys(p[mode]).length, 19);
  assert.deepEqual(checkPalette(p).problems, []);
  assert.deepEqual(Object.keys(r.checks.light.principles), ['P1','P2','P3','P4','P5','P6','P7','P8']);
  assert.equal(r.said, 'red, white and blue');
});
test('gold on white takes the closest passing fixed-hue/chroma lightness and reports deepened', async () => {
  const { buildOwnColours, minimumLightnessMove, fromOklch, oklch, wcag, apca } = await load();
  const r = buildOwnColours('green and gold');
  assert.equal(r.status, 'ready');
  const p = r.kept.palette.overrides;
  const gold = r.values.find(c => c.name === 'gold');
  assert.ok(wcag(gold.value, '#FFFFFF') < 4.5);
  const move = r.moves.find(m => m.colour === 'gold' && m.role === 'pop');
  assert.equal(move.direction, 'deepened');
  const passes = c => wcag('#FFFFFF', c) >= 4.5 && Math.abs(apca('#FFFFFF', c)) >= 60;
  assert.equal(move.to, minimumLightnessMove(gold.value, passes).value);
  assert.equal(passes(fromOklch({...oklch(gold.value),L:move.toL+1e-7})),false,'a smaller move fails');
  assert.ok(Math.abs(oklch(move.to).C-oklch(gold.value).C)<.002);
  assert.ok(Math.abs(oklch(move.to).H-oklch(gold.value).H)<1);
  assert.equal(p.light.pop, move.to); assert.equal(p.dark.pop, move.to);
  assert.ok(r.lines.includes('I deepened your gold a little, so words on it stay easy to read.'));
  assert.deepEqual(r.checks.problems, []);
});
test('one colour gives white, near-black and theirs; an already readable code stays byte exact', async () => {
  const { buildOwnColours } = await load();
  const r = buildOwnColours('just red');
  assert.equal(r.kept.palette.overrides.light.ground, '#FFFFFF');
  assert.equal(r.kept.palette.overrides.dark.ground, '#181A1B');
  assert.equal(r.kept.palette.overrides.light.pop, '#B22234');
  const code = buildOwnColours('#b22234');
  assert.equal(code.values[0].value, '#b22234');
  assert.equal(code.kept.palette.overrides.light.pop, '#b22234');
});
test('unknown words are returned verbatim with C5 and no guessed palette', async () => {
  const { buildOwnColours } = await load();
  const r = buildOwnColours('red and Blurple');
  assert.deepEqual(r.unknown, ['Blurple']); assert.equal(r.kept, undefined);
  assert.deepEqual(r.lines, ['I don\'t know the colour "Blurple". Could you say it another way, or type its code?']);
  assert.deepEqual(buildOwnColours('constructor purple').unknown,['constructor purple']);
});
test('a white text endpoint repairs the supporting background and records its direction', async () => {
  const {buildOwnColours}=await load();
  const r=buildOwnColours('grey and white');
  assert.equal(r.status,'ready');assert.deepEqual(r.checks.problems,[]);
  assert.equal(r.kept.palette.overrides.dark.text,'#FFFFFF');
  assert.ok(r.moves.some(m=>m.mode==='dark'&&m.role==='panel'&&m.direction==='deepened'));
});
test('neutral codes retain input ordering, and lighter reading repairs use C4 lightened', async () => {
  const {buildOwnColours}=await load();
  const r=buildOwnColours('#737373 and white');
  assert.equal(r.kept.palette.overrides.light.pop,'#737373');
  assert.ok(r.moves.some(m=>m.direction==='lightened'));
  assert.ok(r.lines.includes('I lightened your white a little, so words on it stay easy to read.'));
});
test('bright colours can use the existing dark words; a code no lightness move can fix is toned a touch, hue kept', async () => {
  const {buildOwnColours}=await load();
  const r=buildOwnColours('yellow');
  assert.equal(r.kept.palette.overrides.light.pop,r.values[0].value);
  assert.equal(r.kept.palette.overrides.light.onPop,'#181A1B');
  assert.deepEqual(r.checks.problems,[]);
  const red=buildOwnColours('#FF0000');
  assert.deepEqual(red.checks.problems,[]);
  const moved=JSON.stringify(red);
  assert.match(moved,/chromaDelta/);
  assert.match(red.lines.join(' '),/I deepened your #FF0000 a little, so words on it stay easy to read\.|I deepened your red a little/);
});
test('the table has everyday colours and measured modifiers, longest names before modifiers', async () => {
  const { buildOwnColours, oklch } = await load();
  const names = JSON.parse(readFileSync(new URL('../parts/colour-names.json', import.meta.url)));
  assert.ok(Object.keys(names.colours).length >= 145 && Object.keys(names.colours).length <= 160);
  for (const modifier of ['deep','dark','light','soft','bright']) assert.ok(names.modifiers[modifier]);
  for (const text of ['forest green and gold','a deep plum','light blue']) assert.equal(buildOwnColours(text).status, 'ready', text);
  assert.ok(oklch(buildOwnColours('deep plum').values[0].value).L < oklch(names.colours.plum).L);
});
test('CLI help is standalone, refuses unknown flags and emits one JSON result', async () => {
  await load();
  const cli = (...args) => spawnSync(process.execPath,[fileURLToPath(moduleURL),...args],{encoding:'utf8'});
  assert.match(cli('--help').stdout, /Usage:.*own-colours.mjs/);
  for (const flag of ['--install','--env','--bad']) {const r=cli(flag);assert.equal(r.status,1);assert.equal(r.stdout,'');assert.match(r.stderr,/unknown option/);}
  const r=cli('--colours','red, white and blue');assert.equal(r.status,0);assert.equal(JSON.parse(r.stdout).status,'ready');
});
