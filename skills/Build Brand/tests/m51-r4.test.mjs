import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { select } from '../scripts/select.mjs';
import { assemble, LIBRARY } from '../scripts/assemble.mjs';
import { createBoardModel } from '../../../tools/Contact Sheet/scripts/board-model.js';
import { validateBrandBoards } from '../../../tools/Contact Sheet/scripts/brand-boards.js';
import { operator, firstStrategy, harbor } from './select-fixtures.mjs';
import { board, selection, matchingPairing } from './selections.mjs';

const library = JSON.parse(readFileSync(LIBRARY));
const part = (kind, id) => library[kind].find(p => p.id === id);
function uniqueLabels(result) {
  for (const options of [result.selection.boards.map(b => ({ label: b.name })), result.options, result.looks, result.form?.questions[0].options].filter(Boolean)) {
    const labels = options.map(o => o.label);
    assert.equal(new Set(labels).size, labels.length, JSON.stringify(labels));
    assert.ok(labels.every(label => label.length <= 120));
  }
}
for (const get of [operator, firstStrategy, harbor]) test(`every ${get.name} page has distinct labels, including one-pick variations`, () => {
  const a = get(), looks = select('looks', a), round = select('round1', a);
  uniqueLabels(looks); uniqueLabels(round);
  uniqueLabels(select('looks', { ...a, shown: looks.looks }));
  uniqueLabels(select('variations', { ...a, picks: [], shown: round.selection.boards, steer: {} }));
  for (const count of [1, 2, 3]) for (const steer of [{}, { warmCool: 1, quietBold: -1 }]) {
    const r = select('variations', { ...a, picks: round.selection.boards.slice(0, count), shown: round.selection.boards, steer });
    uniqueLabels(r);
    for (const b of r.selection.boards) for (const name of [part('pairings', b.pairing.id).name, part('palettes', b.palette.id).name, part('graphics', b.graphicSet.id).name, part('containers', b.container).name, b.primaryMode]) {
      assert.ok(b.name.toLowerCase().includes(name.toLowerCase()), `${b.name}: missing ${name}`);
    }
    if (r.form) assert.deepEqual(r.form.questions[0].options.map(o => o.label), r.selection.boards.map(b => b.name));
  }
});

const roleNames = /^(?:page base|inset field|reading ink|deep field|drawing ink|action fill|detail ink|title ink)$/i;
function named(list, at) {
  for (const s of list) {
    assert.equal(typeof s.name, 'string', `${at}.${s.key}: missing everyday name`);
    assert.ok(s.name.trim(), `${at}.${s.key}`); assert.doesNotMatch(s.name, roleNames, at); assert.doesNotMatch(s.name, /^#/, at);
  }
}
function model(s) {
  const spec = assemble(s, library);
  const assets = { add(path) { return { path, extension: extname(path), uri: `data:font/woff2;base64,${readFileSync(path).toString('base64')}` }; } };
  return createBoardModel(validateBrandBoards(spec, assets, () => {}));
}
for (const palette of library.palettes.filter(p => p.selectable !== false)) test(`${palette.id}: board swatches and chips have everyday names in both modes`, () => {
  named(palette.swatches, `${palette.id}.swatches`);
  const s = selection([board(library, { palette: palette.id, pairing: matchingPairing(library, palette) })], library);
  const b = model(s).boards[0];
  for (const mode of ['light', 'dark']) {
    named(palette.modeSwatches?.[mode] ?? palette.swatches, `${palette.id}.${mode}`);
    named(b.modes[mode].swatches, `${palette.id}.${mode}.model.swatches`);
    named(b.modes[mode].chips, `${palette.id}.${mode}.model.chips`);
  }
});
test('kept colours are named from their resolved colours, including short hex and dark mode', () => {
  const s = selection([board(library, { palette: 'paper-orange' })], library);
  s.boards[0].palette.overrides = { light: { pop: '#0000ff', mark: '#00F' }, dark: { pop: '#ffff00', mark: '#ff0', onPop: '#000' } };
  s.boards[0].graphicSet.pattern = { strength: { light: 0, dark: 0 } };
  const before = structuredClone(s), b = model(s).boards[0];
  for (const [mode, colour] of [['light', 'blue'], ['dark', 'yellow']]) {
    for (const list of [b.modes[mode].swatches, b.modes[mode].chips]) {
      named(list, mode);
      for (const key of ['pop', 'mark']) assert.match(list.find(s => s.key === key).name.toLowerCase(), new RegExp(colour));
    }
  }
  assert.deepEqual(s, before);
});
