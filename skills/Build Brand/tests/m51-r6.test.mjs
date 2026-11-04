import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LIBRARY } from '../scripts/assemble.mjs';
import { select } from '../scripts/select.mjs';
import { boardOperator as operator , looksAnswers} from './select-fixtures.mjs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const triple = b => [b.pairing.id, b.palette.id, b.graphicSet.id].join('/');
// Synthetic Dana fixture: r4 run 2's answers and all twelve displayed looks.
const dana = {
  "type": "personal",
  "name": "Dana Ruiz",
  "sentence": "I do the books for restaurants and help owners work out what to do next.",
  "words": [
    {
      "word": "Clear",
      "not": "fussy"
    },
    {
      "word": "Practical",
      "not": "showy"
    },
    {
      "word": "Warm",
      "not": "gushy"
    }
  ],
  "taps": {
    "mode": "light",
    "feel": "natural",
    "history": "established-current",
    "strength": "balanced",
    "technology": "kitchenaid",
    "style": "patagonia",
    "posture": "toyota",
    "mood": "ikea",
    "place": "design-workshop"
  },
  "off": [],
  "kept": {},
  "photoRules": "When a photograph is used, show real restaurant work in warm natural light, with simple surroundings and no staged poses.",
  "heroPhrase": "books for restaurants",
  "looks": [
    "look-f9b2fe71682c236f0a35cf2d923bf7b4",
    "look-cdd001427ccd75e9e9064fe092873fd8"
  ],
  "looksShown": [
    {
      "value": "look-26aa27ff64d3e414276513eb841156c2",
      "pairing": "soft-serif",
      "palette": "paper-orange",
      "graphicSet": "drawn"
    },
    {
      "value": "look-f9b2fe71682c236f0a35cf2d923bf7b4",
      "pairing": "warm-grotesque",
      "palette": "draft-paper",
      "graphicSet": "editorial"
    },
    {
      "value": "look-cdd001427ccd75e9e9064fe092873fd8",
      "pairing": "humanist",
      "palette": "olive-paper",
      "graphicSet": "stitch"
    },
    {
      "value": "look-52c06deb3ad6ddc999391f6b1e995b9e",
      "pairing": "lively",
      "palette": "plaster-red",
      "graphicSet": "drafting"
    },
    {
      "value": "look-59a43e35c01e4889a938ddf0b1c73739",
      "pairing": "friendly-serif",
      "palette": "plum-peach",
      "graphicSet": "riso"
    },
    {
      "value": "look-95183e207aa653e18fc0cd39034dfd10",
      "pairing": "chunky",
      "palette": "gold-pink",
      "graphicSet": "marker"
    },
    {
      "value": "look-6d8f4a41b5a7bfc266659dc3a791c97b",
      "pairing": "soft-serif",
      "palette": "tan-blue",
      "graphicSet": "drafting"
    },
    {
      "value": "look-0cce75bfd9d3a1388cab5a882a02b013",
      "pairing": "soft-serif",
      "palette": "stone-cobalt",
      "graphicSet": "drawn"
    },
    {
      "value": "look-af801e317f317dacc8c32042d234e19d",
      "pairing": "soft-serif",
      "palette": "white-oxblood",
      "graphicSet": "marker"
    },
    {
      "value": "look-33175486f45eaa5c1d9b63f524de4da1",
      "pairing": "soft-serif",
      "palette": "white-vermilion",
      "graphicSet": "drafting"
    },
    {
      "value": "look-39bc92079a6b2feab3f96e9c1e59a2fc",
      "pairing": "soft-serif",
      "palette": "ink-amber",
      "graphicSet": "marker"
    },
    {
      "value": "look-b8a84012a8f00b9b8c510173cf7d66d9",
      "pairing": "soft-serif",
      "palette": "navy-coral",
      "graphicSet": "drawn"
    }
  ]
};
test('Dana Round 1 never revives an unpicked look in Close or recommends it', () => {
  const before = JSON.stringify(dana), result = select('round1', dana);
  const picked = new Set(dana.looksShown.filter(l => dana.looks.includes(l.value)).map(l => [l.pairing,l.palette,l.graphicSet].join('/')));
  const rejected = new Set(dana.looksShown.filter(l => !dana.looks.includes(l.value)).map(l => [l.pairing,l.palette,l.graphicSet].join('/')));
  assert.equal(result.selection.boards.length, 12);
  const pickedTriples = [...picked].map(t => t.split('/')), near = b => pickedTriples.some(p => p.filter((v, i) => v === triple(b).split('/')[i]).length >= 2);
  const matching = result.selection.boards.filter(b => b.group === 'close' && near(b));
  if (matching.length) assert.ok(result.selection.boards.some(b => b.recommendation));
  else assert.match(result.notes.join('\n'), /No Close board shares two parts with a picked look/);
  for (const b of result.selection.boards) {
    if (b.group === 'close' || b.recommendation) assert.ok(!rejected.has(triple(b)), triple(b));
    if (b.recommendation) assert.ok(near(b), triple(b));
  }
  assert.equal(JSON.stringify(dana), before);
  assert.deepEqual(result, select('round1', dana));
});

test('an unseen Review retry builds one fresh page, excluding every blocked board', () => {
  const a = operator(), avoid = []; let result = select('round1', a, {check:true}), rebuilt;
  for (let i = 0; i < 18; i++) {
    avoid.push(result.selection.boards[0]);
    result = select('round1', { ...a, avoid, pageDisplayed: false }, {check:true});
    assert.ok(result.selection.boards.every(b => !avoid.some(old => triple(old) === triple(b) && old.primaryMode === b.primaryMode && old.container === b.container)));
    if (result.notes.some(n => /rebuilt/i.test(n))) { rebuilt = result; break; }
  }
  assert.ok(rebuilt, 'exhausted ranked spares must rebuild the unseen page');
  assert.equal(rebuilt.selection.boards.length, 12); assert.ok(rebuilt.form);
  assert.deepEqual(rebuilt, select('round1', { ...a, avoid, pageDisplayed: false }, {check:true}));
  assert.deepEqual(select('round1', { ...a, avoid, pageDisplayed: true, displayedBoards: rebuilt.selection.boards }, {check:true}).selection.boards, rebuilt.selection.boards);
  avoid.push(rebuilt.selection.boards[0]);
  assert.ok(select('round1', { ...a, avoid, pageDisplayed: false }, {check:true}).selection.boards.every(b => !avoid.some(old => JSON.stringify([old.pairing,old.palette,old.graphicSet,old.container,old.primaryMode]) === JSON.stringify([b.pairing,b.palette,b.graphicSet,b.container,b.primaryMode]))));
});

test('Assembly documents the rule gate used by both quick paths', () => {
  const assembly = read('parts/parts.md').split('## Assembly')[1].split('## Opening taps')[0];
  assert.match(assembly, /`--check-rules`/);
  assert.doesNotMatch(assembly, /There are no other flags/);
});
test('records make every brief path B1 to B7 file-settled answer the explicit exception', () => {
  assert.match(read('records.md'), /B1 to B7[^.]*rows[^.]*answers they settle/);
});
test('lock instructions specify the one-line taste description without the question or options', () => {
  for (const path of ['lock.md','parts/parts.md']) assert.match(read(path), /`readBack.text`[^.]*taste description as shown alone[^.]*one line[^.]*without the question or its options/);
});

test('an unseen variations page plainly reports when rebuilding cannot fill the page', () => {
  const library = JSON.parse(readFileSync(LIBRARY)), a = operator();
  const seed = select('round1', a).selection.boards[0];
  library.pairings = library.pairings.filter(p => p.id === seed.pairing.id);
  library.palettes = library.palettes.filter(p => p.id === seed.palette.id);
  library.graphics = library.graphics.filter(p => p.id === seed.graphicSet.id);
  library.containers = library.containers.filter(p => [seed.container, 'drawn-ring', 'filled-square'].includes(p.id));
  const answers = { ...a, picks: [seed], shown: [seed] }, options = { library };
  const original = select('variations', answers, options);
  assert.throws(() => select('variations', { ...answers, avoid: original.selection.boards, pageDisplayed: false }, options), /unseen page rebuilt.*cannot fill a complete page/);
});

test('whole-look Form options also exclude passed-over triples and empty picks recommend nothing', () => {
  const a = operator(), looks = select('looks',looksAnswers( a));
  const answers = { ...a, looks: [looks.options[0].value], looksShown: looks.options };
  const passed = new Set(looks.options.slice(1).map(o => triple(o.board)));
  for (const b of select('round1', answers).selection.boards) if (b.group === 'close' || b.recommendation) assert.ok(!passed.has(triple(b)));
  assert.ok(select('round1', { ...a, looks: [], looksShown: looks.looks }).selection.boards.every(b => !b.recommendation));
  assert.throws(() => select('round1', { ...answers, looksShown: [] }), /include every picked look/);
});
