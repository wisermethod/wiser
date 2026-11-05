import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { select } from '../scripts/select.mjs';
import { assemble, LIBRARY } from '../scripts/assemble.mjs';
import { assembleCore } from '../scripts/assemble-core.mjs';
import { validateBrandBoards } from '../../../tools/Contact Sheet/scripts/brand-boards.js';
import { renderBrandBoards } from '../../../tools/Contact Sheet/scripts/brand-board-view.js';
import { boardOperator as operator , looksAnswers} from './select-fixtures.mjs';
import { board, selection, matchingPairing } from './selections.mjs';
import { extname } from 'node:path';

const library = JSON.parse(readFileSync(LIBRARY));
const roleWords = /paragraphs|names|primary action|drawings|gestures|main page|large deep fields|supporting (?:words|surfaces)|titles|reading ink|page base/i;
const lists = p => [p.swatches, ...Object.values(p.modeSwatches ?? {}), ...Object.values(p.chips ?? {})];
for (const ground of ['#171B18', '#201B1A']) test(`refusal names only the blocking near-black cluster for ${ground}, without a kept pairing`, () => {
  const a = { ...operator(), kept: { palette: { overrides: Object.fromEntries(['light', 'dark'].map(mode => [mode, { ground, pop: '#EE4828', mark: '#EE4828' }])) } } };
  for (const command of ['looks', 'round1']) assert.throws(() => select(command, command==='looks'?looksAnswers(a):a), error => {
    assert.match(error.message, /rule refusal prevents a complete page: refused cluster near-black-single-acid-or-vermilion \(light\)/);
    assert.doesNotMatch(error.message, /marker|cream-serif/);
    assert.equal((error.message.match(/refused cluster/g) ?? []).length, 1); return true;
  });
});

test('Contact Sheet exhaustion stays a slot failure when only retired type could fill it', () => {
  const a = operator(), first = select('round1', a), changed = structuredClone(library), seed = first.selection.boards[0];
  changed.pairings = [changed.pairings.find(p=>p.id===seed.pairing.id), {...structuredClone(changed.pairings[0]),id:'retired-test',selectable:false}];
  changed.palettes = changed.palettes.filter(p => p.id === seed.palette.id);
  changed.graphics = changed.graphics.filter(p => p.id === seed.graphicSet.id);
  changed.containers = changed.containers.filter(p => [seed.container, 'drawn-ring', 'filled-square'].includes(p.id));
  changed.pairings.find(p => p.id === 'retired-test').type = structuredClone(library.pairings.find(p => p.id === seed.pairing.id).type);
  changed.graphics[0].pattern.strength = { light: 0, dark: 0 };
  changed.graphics[0].texture.strength = { light: 0, dark: 0 };
  for (const p of changed.pairings.filter(p => p.selectable !== false)) p.type.heading.sizes.small.size = 7;
  const answers = { ...a, picks: [seed], shown: [seed] };
  assert.throws(() => select('variations', answers, { library: changed, check: true }), error => {
    assert.match(error.message, /no passing new one-or-two-part variation remains/);
    assert.doesNotMatch(error.message, /rule refusal|retired/); return true;
  });
});

test('every library and assembled swatch or chip hides its role and has a unique name', () => {
  for (const p of library.palettes) {
    const b = assembleCore(selection([board(library, { palette: p.id, pairing: matchingPairing(library, p) })], library), library).boards[0];
    for (const list of [...lists(p), ...lists(b.palette)]) {
      assert.equal(new Set(list.map(s => s.name)).size, list.length, p.id);
      for (const s of list) { assert.doesNotMatch(s.name, roleWords, `${p.id}.${s.key}`); assert.doesNotMatch(s.name, /[()]/); }
    }
  }
});

test('kept dark brown gets a colour name and neutral collisions, even from legacy names', () => {
  const changed = structuredClone(library);
  for (const p of changed.palettes) for (const list of lists(p)) for (const s of list) if (p.light[s.key] === '#3A3029') s.name = 'Dark brown (the main page)';
  changed.palettes[0].light.deep='#3A3029';
  for(const list of [changed.palettes[0].swatches,changed.palettes[0].modeSwatches.light])for(const swatch of list)if(swatch.key==='deep')swatch.name='Dark brown (the main page)';
  const s = selection([board(library,{palette:changed.palettes[0].id})], library);
  s.boards[0].palette.overrides = { light: { panel: '#3A3029', deep: '#3A3029' } };
  const p = assembleCore(s, changed).boards[0].palette;
  for (const list of lists(p)) {
    assert.equal(new Set(list.map(s => s.name)).size, list.length);
    for (const swatch of list) assert.doesNotMatch(swatch.name, roleWords);
  }
  const kept = p.modeSwatches.light.filter(s => ['panel', 'deep'].includes(s.key));
  assert.equal(kept.length, 2);
  for (const swatch of kept) assert.match(swatch.name, /^Dark brown(?: \d+)?$/);
});

for (const palette of ['business-blue-bold', 'business-blue-balanced']) test(`${palette}: member HTML has colour labels without role text`, () => {
  const s = selection([board(library, { palette, pairing: matchingPairing(library, library.palettes.find(p => p.id === palette)) })], library);
  s.boards[0].primaryMode = 'dark';
  const spec = assemble(s, library); spec.showChecks = false;
  const assets = { add(path) { return { path, extension: extname(path), uri: `data:font/woff2;base64,${readFileSync(path).toString('base64')}` }; } };
  const html = renderBrandBoards(validateBrandBoards(spec, assets, () => {}));
  const labels = [...html.matchAll(/data-swatch=[^>]+><div><b[^>]*>([^<]+)<\/b>/g)].map(m => m[1]);
  assert.ok(labels.length > 0);
  for (const label of labels) assert.doesNotMatch(label, roleWords);
});
