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
    "look-80570fb5d7f54e8f851a2c3d4e9217d3",
    "look-fca63ffb59c742da9714ad26fc9b29a5"
  ],
  "looksShown": [
    {
      "value": "look-00f29b45cfcba77c5cbfe0d2b5d8eef3",
      "pairing": "hand-made",
      "palette": "tangerine-and-sky-muted",
      "graphicSet": "drawn"
    },
    {
      "value": "look-80570fb5d7f54e8f851a2c3d4e9217d3",
      "pairing": "friendly-rounded",
      "palette": "business-blue-muted",
      "graphicSet": "editorial"
    },
    {
      "value": "look-fca63ffb59c742da9714ad26fc9b29a5",
      "pairing": "old-style",
      "palette": "sage-mist-and-green-balanced",
      "graphicSet": "stitch"
    },
    {
      "value": "look-fcabee2513cf6c42282c445c4f380be1",
      "pairing": "playful-display",
      "palette": "signal-red-muted",
      "graphicSet": "drafting"
    },
    {
      "value": "look-ce310bbc151ce20b70a5411c57240567",
      "pairing": "heritage-slab",
      "palette": "orchid-and-plum-balanced",
      "graphicSet": "riso"
    },
    {
      "value": "look-b67248e5afc4c84766c0e788e89fcecf",
      "pairing": "friendly-rounded",
      "palette": "pastel-sorbet-balanced",
      "graphicSet": "marker"
    },
    {
      "value": "look-0c6a9d272aed57753cccb79ccca048b4",
      "pairing": "hand-made",
      "palette": "sunflower-and-espresso-muted",
      "graphicSet": "drafting"
    },
    {
      "value": "look-4e76f94b9b0da3cddd4d34fb0c61d798",
      "pairing": "hand-made",
      "palette": "ink-and-paper-muted",
      "graphicSet": "drawn"
    },
    {
      "value": "look-9be712a7dc4eb6349f6bcb94fe542b0c",
      "pairing": "hand-made",
      "palette": "signal-red-balanced",
      "graphicSet": "marker"
    },
    {
      "value": "look-e3f7cf965eb281d4d95846e785657741",
      "pairing": "hand-made",
      "palette": "tangerine-and-sky-balanced",
      "graphicSet": "drafting"
    },
    {
      "value": "look-2aef7357b3ae226e250635753a91ce80",
      "pairing": "hand-made",
      "palette": "ink-and-paper-bold",
      "graphicSet": "marker"
    },
    {
      "value": "look-b6a966ad07ea1d1ffb6186fbf6aad659",
      "pairing": "hand-made",
      "palette": "business-blue-bold",
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
  library.containers = library.containers.filter(p => p.id===seed.container||library.containers.indexOf(p)<5);
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
