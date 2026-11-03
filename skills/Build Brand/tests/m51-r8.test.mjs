import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LIBRARY } from '../scripts/assemble.mjs';
import { assembleCore } from '../scripts/assemble-core.mjs';
import { select } from '../scripts/select.mjs';
import { boardOperator } from './select-fixtures.mjs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('lock instructions agree with nearest working-size cuts and exact per-size classes', () => {
  const line = read('lock.md').split('\n').find(l => l.startsWith('The type rules retain'));
  assert.match(line, /h1.*h2.*h3.*(?:body|reading text).*nearest.*working size/);
  assert.match(line, /\.type-heading-display.*(?:exact|unchanged)/);
  assert.doesNotMatch(line, /applies display to h1/);
});

test('every graphic sample has three labels and matching discrete stages after assembly', () => {
  const library = JSON.parse(readFileSync(LIBRARY)), result = select('round1', boardOperator());
  const seed = result.selection.boards[0];
  for (const graphic of library.graphics) {
    const b = structuredClone(seed); b.graphicSet.id = graphic.id;
    const spec = assembleCore({ ...result.selection, boards: [b] }, library), sample = spec.boards[0].sample;
    assert.equal(sample.steps.length, 3, graphic.id);
    // Continuous drawn/stitch lines do not enumerate stages. Discrete marks
    // must count exactly: riso uses one pair of dots per stage; drafting and
    // stamp use a connecting/diagonal stroke in addition to the stage marks.
    const circles = (sample.path.match(/<circle\b/g) || []).length;
    const moves = [...sample.path.matchAll(/ d="([^"]*)"/g)].reduce((n, m) => n + (m[1].match(/M/g) || []).length, 0);
    const stages = { editorial: circles, geometric: circles, riso: circles / 2, drafting: moves - 1, marker: moves, stamp: moves - 1 };
    if (Object.hasOwn(stages, graphic.id)) assert.equal(stages[graphic.id], sample.steps.length, graphic.id);
    else { assert.ok(['drawn', 'stitch'].includes(graphic.id)); assert.equal(moves, 1, graphic.id); }
  }
});

test('Review handoff includes the voice answers file that supplied a carried P12 place', () => {
  const review = read('paths/sitting.md').split('**Review before showing.**')[1].split('The card supplies')[0];
  assert.match(review, /carried.*P12.*voice answers file.*(?:brief|read)/i);
});
