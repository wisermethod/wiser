import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { select } from '../scripts/select.mjs';
import { LIBRARY } from '../scripts/assemble.mjs';
import { operator } from './select-fixtures.mjs';
const answers = () => ({ ...operator(), looksShown: [] });
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const triple = b => [b.pairing.id, b.palette.id, b.graphicSet.id].join('/');
const key = b => JSON.stringify([b.pairing, b.palette, b.graphicSet, b.container, b.primaryMode]);
function look(b) {
  return { value: 'look-' + createHash('sha256').update(triple(b)).digest('hex').slice(0,32), pairing: b.pairing.id, palette: b.palette.id, graphicSet: b.graphicSet.id };
}
function rebuilt(command, a) {
  let result = select(command, a); const avoid = [];
  for (let i = 0; i < 18; i++) {
    avoid.push(result.selection.boards[0]);
    result = select(command, { ...a, avoid, pageDisplayed: false });
    if (result.notes.some(n => /rebuilt/i.test(n))) return { result, avoid };
  }
  assert.fail('expected an unseen rebuild');
}
for (const command of ['round1', 'variations']) test(`${command}: a displayed rebuilt page preserves every unblocked record after JSON resume`, () => {
  const a = answers(), seed = select('round1', a).selection.boards;
  if (command === 'variations') Object.assign(a, { picks: [seed[0]], shown: seed });
  const { result: shown, avoid } = rebuilt(command, a), blocked = shown.selection.boards[0];
  const input = JSON.parse(JSON.stringify({ ...a, avoid: [...avoid, blocked], pageDisplayed: true, displayedBoards: shown.selection.boards }));
  const before = JSON.stringify(input), result = select(command, input);
  assert.notEqual(key(result.selection.boards[0]), key(blocked));
  assert.equal(JSON.stringify(result.selection.boards.slice(1)), JSON.stringify(shown.selection.boards.slice(1)));
  assert.ok(result.selection.boards.every(b => !input.avoid.some(old => key(b) === key(old))));
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(select(command, input), result);
  assert.deepEqual(select(command, { ...input, avoid: [] }).selection.boards, shown.selection.boards);
});

test('successive unseen generations exclude every blocked key, including records unrelated to the original page', () => {
  const a = answers(), first = select('round1', a), { result, avoid } = rebuilt('round1', a);
  let next = result;
  for (let generation = 0; generation < 4; generation++) {
    // Numbers are deliberately unrelated: exclusions are identities, not slots.
    avoid.push({ ...next.selection.boards[0], number: 12 });
    next = select('round1', { ...a, avoid, pageDisplayed: false });
    assert.equal(next.selection.boards.length, 12);
    assert.ok(next.selection.boards.every(b => !avoid.some(old => key(b) === key(old))));
  }
  assert.notDeepEqual(next.selection.boards, first.selection.boards);
});

for (const command of ['round1', 'variations']) test(`${command}: missing looksShown is refused even with picked looks`, () => {
  const a = answers(), looks = select('looks', operator()), seed = select('round1', a).selection.boards;
  delete a.looksShown; a.looks = [looks.looks[0].value];
  if (command === 'variations') Object.assign(a, { picks: [seed[0]], shown: seed });
  assert.throws(() => select(command, a), /looksShown.*required/);
});

test('the first matching Close boards are recommended even beyond the first two slots', () => {
  const a = answers(), initial = select('round1', a);
  // The comparison mode keeps ranking stable while finding a picked triple
  // that lands later in Close under ordinary scoring.
  const choices = initial.selection.boards.filter(b => b.group === 'close').map(look);
  let exercised = false;
  for (const picked of choices) {
    const result = select('round1', { ...a, looks: [picked.value], looksShown: [picked] });
    const matching = result.selection.boards.filter(b => b.group === 'close' && triple(b) === [picked.pairing,picked.palette,picked.graphicSet].join('/'));
    if (matching.some(b => b.number > 2)) {
      exercised = true;
      assert.deepEqual(result.selection.boards.filter(b => b.recommendation).map(b => b.number), matching.slice(0,2).map(b => b.number));
    }
  }
  assert.ok(exercised, 'fixture must exercise a picked look beyond slot 2');
});

test('every single pick is either recommended near or explained in the notes', () => {
  const a = answers(), looks = select('looks', operator());
  for (const picked of looks.looks) {
    const result = select('round1', { ...a, looks: [picked.value], looksShown: looks.looks });
    const parts = [picked.pairing, picked.palette, picked.graphicSet], near = b => parts.filter((v, i) => v === triple(b).split('/')[i]).length >= 2;
    const matching = result.selection.boards.filter(b => b.group === 'close' && near(b)), recommended = result.selection.boards.filter(b => b.recommendation);
    if (matching.length) { assert.ok(recommended.length >= 1, picked.value); assert.ok(recommended.every(near), picked.value); }
    else assert.match(result.notes.join('\n'), /No Close board shares two parts with a picked look/);
  }
});

test('records and resume retain displayed page state and every file-settled brief row', () => {
  const records = read('records.md'), sitting = read('paths/sitting.md');
  assert.match(records, /B1 to B7[^.]*rows[^.]*answers they settle/);
  for (const command of ['round1', 'variations']) {
    const row = records.split('\n').find(line => line.startsWith('| `' + command + '`'));
    assert.match(row, /pageDisplayed/); assert.match(row, /displayedBoards/);
  }
  assert.match(sitting, /resume[^\n]*displayedBoards|displayedBoards[^\n]*resume/i);
});


test('an unfillable unseen Round 1 keeps its rebuild failure when disabling cluster rules would fill it', () => {
  const library = JSON.parse(readFileSync(LIBRARY));
  const ids = ['warm-grotesque','sharp-serif','chunky','poster','condensed'];
  library.pairings = library.pairings.filter(p => ids.includes(p.id));
  library.pairings.find(p => p.id === 'condensed').displayStyle = 'test';
  library.refusedClusters = [{id:'test-style',displayStyle:'test',ground:{near:'#141B3D',maxRgbDistance:500},accents:{roles:['pop'],match:'all',bands:[{hue:[0,360]}]}}];
  const a = { ...answers(), kept: {palette:{id:'navy-gold'}} }, options = { library, unsteered:true };
  const initial = select('round1', a, options), seed = initial.selection.boards[1];
  const graphics = ['drawn','geometric','editorial','stitch','stamp','drafting','marker','riso'];
  const containers = {drawn:'drawn-ring',geometric:'filled-square',editorial:'rule-box',stitch:'oval',stamp:'double-ring',drafting:'drafting-box',marker:'marker-swash',riso:'double-ring'};
  // Fifteen successive Review refusals from the original fixture, before
  // its first unfillable rebuild. Use full records, not just slot numbers.
  const avoid = ['light','dark'].flatMap(primaryMode => graphics.map(graphicSet => {
    const b = structuredClone(seed); b.primaryMode = primaryMode;
    b.graphicSet = {id:graphicSet}; b.container = containers[graphicSet];
    b.name = [library.pairings.find(p=>p.id===b.pairing.id).name,library.palettes.find(p=>p.id===b.palette.id).name,library.graphics.find(p=>p.id===graphicSet).name,library.containers.find(p=>p.id===b.container).name,primaryMode].join(' / ');
    return b;
  })).slice(0,15);
  assert.throws(() => select('round1', {...a,avoid}, options), error => {
    assert.match(error.message, /^avoid: unseen page rebuilt.*cannot fill a complete page/);
    assert.doesNotMatch(error.message, /rule refusal prevents/);
    return true;
  });
});
