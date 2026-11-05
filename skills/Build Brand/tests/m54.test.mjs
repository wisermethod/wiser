import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { select } from '../scripts/select.mjs';
import { operator } from './select-fixtures.mjs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const section = (text, start, end) => text.split(start)[1].split(end)[0];

test('M5.4 item 1: own words return to the sentence-and-pairs screen before selection', () => {
  for (const path of ['questions.md', 'paths/sitting.md']) {
    const text = read(path);
    assert.match(text, /own-words[^\n]*draft three to five word\/boundary pairs[^\n]*sentence-and-pairs screen/i);
  }
  assert.match(read('paths/sitting.md'), /Never run a selector command with empty `words`/);
});

test('M5.4 item 1: looks and round1 refuse empty words before selection', () => {
  assert.match(read('parts/parts.md'), /Required non-empty array of `\{word, not\}`/);
  for (const command of ['looks', 'round1']) {
    const a = { ...operator(), words: [], ...(command === 'round1' ? { looksShown: [] } : {}) };
    assert.throws(() => select(command, a), /words:.*(?:non-empty|at least one|chosen words)/);
  }
});

test('M5.4 item 2: F9 records a comparison without a question or gap slot', () => {
  const voice = section(read('writing.md'), '## Voice check\n', '## Write and read back');
  assert.doesNotMatch(voice, /load and ask F9|consumes its gap allowance/);
  assert.match(voice, /no member question and no gap slot/i);
  assert.match(voice, /record[^\n]*F9/i);
});

test('M5.4 item 3: each paged brand list precedes its chat question', () => {
  const bank = read('questions.md');
  for (let n = 5; n <= 8; n++) {
    const tap = section(bank, `### T${n}\n`, `### T${n + 1}\n`);
    assert.ok(tap.indexOf('- None of these') < tap.indexOf('Chat buttons and the question tool:'));
    assert.doesNotMatch(tap.split('Chat buttons and the question tool:')[1], /- None of these/);
  }
});

test('M5.4 item 4: voice question omits codes, saved note keeps them', () => {
  const note = section(read('lock.md'), '## Voice note\n', '## Status and lock command');
  assert.match(note, /question number[^\n]*only[^\n]*written section/i);
  assert.match(note, /Keep it:[^\n]*each line citing its question number/);
});

test('M5.4 item 5: correction announcements follow a successful relock', () => {
  const close = section(read('lock.md'), '## Ghost Writer and close\n', '## Offers,');
  assert.match(close, /Only after[^\n]*relock returns success[^\n]*tightened-sentence[^\n]*one-word/i);
  assert.match(close, /If it fails, say neither[^\n]*record the failure/);
});

test('M5.4 item 6: organisation offers retain the ordinary pre-show writing gate', () => {
  const rule = read('SKILL.md').split('\n').find(line => line.startsWith('**Voice check.**'));
  assert.match(rule, /O1 and O2[^\n]*Content Author's ordinary gate, including Ghost Writer, before they are shown/);
  assert.doesNotMatch(rule, /promise: they are shown unchecked/);
});

test('M5.4 item 7: recorded brand gets one sample card and banner without reopening design', () => {
  const text = read('paths/brief-boards.md');
  assert.match(text, /one sample card and one banner/);
  assert.match(text, /no colour and no lettering at all/);
  assert.match(text, /no photo-rule gate/i);
  assert.match(text, /`design.md` stays complete/);
  assert.match(text, /simple-brand caption/);
  assert.doesNotMatch(text.split('## Only when neither colour nor lettering was recorded')[0], /ten to twelve|Colour and type stay marked working|lock caption/);
});

test('M5.4 item 8: simple design-source cites the caller request at R0', () => {
  const simple = read('paths/simple.md');
  assert.match(simple, /design-source[^\n]*R0[^\n]*caller/);
  assert.doesNotMatch(simple, /B0/);
  assert.doesNotMatch(read('SKILL.md'), /B0 stays inside the already-chosen brief path/);
});

test('M5.4 item 9: simple Review judges one already chosen board and discloses absence verbatim', () => {
  const simple = read('paths/simple.md');
  assert.match(simple, /one board, made at the member's request, already chosen, not a choice among alternatives/);
  assert.match(simple, /These boards skipped my usual design check, so treat them as a first look\./);
  assert.ok(simple.includes('Here is the simple look I made for your work from what you told me.'));
  assert.ok(simple.includes("Tell me in the chat anything you'd change."));
  assert.doesNotMatch(simple, /as `brief-boards.md` Review before showing says/);
});

test('M5.4 item 10: displayed replacements recompute recommendation order without changing other fields', () => {
  const looks = select('looks', operator());
  // Three picks produce multiple nearby Close boards. Try each displayed
  // Close slot, including a later slot that can gain a recommendation.
  let retries = 0;
  for (const picks of [looks.looks.slice(0, 3), looks.looks.slice(3, 6), looks.looks.slice(6, 9)]) {
    const a = { ...operator(), looks: picks.map(p => p.value), looksShown: looks.looks };
    const shown = select('round1', a).selection.boards;
    for (const blocked of shown.filter(b => b.group === 'close')) {
      let result;
      try { result = select('round1', { ...a, pageDisplayed: true, displayedBoards: shown, avoid: [blocked] }); }
      catch (e) { assert.match(e.message, /slot .*exhausted/); continue; }
      retries++;
      const after = result.selection.boards;
      const near = b => picks.some(p => [b.pairing.id === p.pairing, b.palette.id === p.palette, b.graphicSet.id === p.graphicSet].filter(Boolean).length >= 2);
      const expected = after.filter(b => b.group === 'close' && !b.zero && near(b)).slice(0, 2);
      assert.deepEqual(after.filter(b => b.recommendation).map(b => b.number), expected.map(b => b.number));
      assert.equal(result.notes.includes('No Close board shares two parts with a picked look; no recommendation is available.'), expected.length === 0);
      for (const b of after.filter(b => b.number !== blocked.number)) {
        const strip = ({ recommendation, ...rest }) => rest;
        assert.equal(JSON.stringify(strip(b)), JSON.stringify(strip(shown.find(old => old.number === b.number))));
      }
      assert.deepEqual(select('round1', { ...a, pageDisplayed: true, displayedBoards: shown, avoid: [] }).selection.boards, shown);
      // Saved pages can carry stale stars after earlier replacements. A new
      // replacement must repair all Close flags, not preserve those flags.
      const stale = structuredClone(shown);
      for (const b of stale) delete b.recommendation;
      for (const b of stale.filter(b => b.group === 'close').slice(-2)) b.recommendation = b.why;
      const repaired = select('round1', { ...a, pageDisplayed: true, displayedBoards: stale, avoid: [blocked] });
      assert.deepEqual(repaired.selection.boards.filter(b => b.recommendation).map(b => b.number), expected.map(b => b.number));

    }
  }
  assert.ok(retries > 0);
});

test('M5.4 item 11: catalogue delegates choices and keeps handwriting in notes', () => {
  const text = read('parts/catalogue.md');
  assert.doesNotMatch(text, /rank its `pairings` against the visual answers/);
  assert.match(text, /paths\/simple.md/);
  assert.match(text, /Handwriting is for margin notes and the card back only/);
  const pairings=text.split('## Pairings')[1].split('## Settings')[0];
  assert.doesNotMatch(pairings,/\| marker \|/);
});

test('M5.4 item 12: citation checklist scopes O1 to O3 to organisation types', () => {
  assert.match(read('parts/parts.md'), /personal audience and promise use their ids in `answerNumbers`; O1, O2 and O3 apply only to an organisation, client or department/);
});
