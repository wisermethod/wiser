import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const bank = read('questions.md'), sitting = read('paths/sitting.md');
const section = (text, heading) => text.split('## ' + heading + '\n')[1]?.split('\n## ')[0];

test('M6 item 1: only boards use forms; word screens use the coach question pattern and own C14 rows', () => {
  const asking = section(sitting, 'Asking and saving');
  assert.match(asking, /Only `boards` questions go through `skills\/Ask in a Form\/`/);
  assert.match(asking, /skills\/Build Voice\/paths\/coach.md.*How you ask/);
  assert.match(asking, /one question per message with lettered options/);
  assert.match(asking, /progress line in the message before each screen/);
  assert.match(asking, /why line before a step's first screen/);
  assert.match(asking, /writes each tapped answer's C14 row itself/);
  for (const field of ['own number', 'bank version', 'what was shown', 'answer', 'status']) assert.ok(asking.includes(field), field);
  assert.match(asking, /Ask in a Form still hands back the rows for boards questions/);
  assert.doesNotMatch(sitting, /paged|Every choice goes through|Other forms retain/);
  assert.match(read('records.md'), /writes each tapped answer's C14 row itself/);
  assert.match(read('SKILL.md'), /Only `boards` questions/);
});

test('M6 item 1: three taste screens, no paged variants or counts, full sentence inside tool question', () => {
  assert.match(sitting, /three screens: T1 to T4, then T5 to T8, then T9/);
  assert.match(sitting, /third screen is not asked/);
  assert.match(section(sitting, 'Step 2: What your brand says'), /sentence and pairs.*inside the question.*in full/);
  assert.doesNotMatch(bank, /Paged card|Paged progress|paged count|· [0-9] of [0-9]/);
  for (let i = 5; i <= 8; i++) {
    const tap = bank.split('### T' + i + '\n')[1].split(/\n##/)[0];
    assert.deepEqual(tap.split('\n').filter(line => line.startsWith('> ')), ["> Choose the one brand that most reflects the direction you're going for (" + (i - 4) + ' of 4).']);
    assert.equal(tap.split('\n').filter(line => line.startsWith('- ')).length, 4);
  }
  assert.match(read('paths/organisation.md'), /two screens.*audience and promise together.*final say on its own screen/);
  assert.match(read('lock.md'), /question tool.*Keep it or Drop it/);
});

test('M6 item 3: taste description example and limits follow the journey', () => {
  const journey = readFileSync(process.env.BUILD_BRAND_JOURNEY || new URL('../../../../journey.md', import.meta.url), 'utf8');
  const source = journey.split('**The taste description**')[1].split('**The pull,')[0];
  const reveal = section(bank, 'Step 3: Reveal and pull');
  const quote = text => text.split('\n').filter(line => line.startsWith('> '));
  assert.deepEqual(quote(reveal).slice(0, 2), quote(source));
  for (const phrase of ['Two sentences in everyday words', 'written fresh from their taps and a carried place', 'how the colours feel', 'what the lettering is like', 'overall impression', 'at most two of their brand picks', 'for what each shares with the look', 'No colour or font names', 'no word from Words never said', 'nothing their taps do not support']) assert.ok(reveal.includes(phrase), phrase);
  assert.doesNotMatch(bank + sitting, /Here's what I heard|everyday pole word/);
  assert.match(reveal, /tapped option words and brand picks as a pick-any list/);
  assert.match(reveal, /A carried place is not listed/);
  assert.match(reveal, /no description is given again/);
  assert.match(bank, /J3a taste description as shown/);
  assert.match(sitting, /Save the description as shown at J3a/);
});

test('M6 item 4: three steering taps, coupled quiet/soft mapping, fourth comment and historical numbers', () => {
  const steer = section(bank, 'Steering a round');
  assert.doesNotMatch(bank + sitting + read('parts/parts.md'), /Softer or stronger\?/);
  assert.deepEqual(steer.split('\n').filter(line => line.startsWith('- ')), ['- Warmer', '- As it is', '- Cooler', '- Quieter', '- As it is', '- Bolder', '- More classic', '- As it is', '- More current', '- Nothing to add']);
  assert.match(steer, /fourth question on the same screen/);
  for (const text of [sitting, read('parts/parts.md')]) {
    assert.match(text, /Quieter.*`quietBold: -1`.*`softStrong: -1`/);
    assert.match(text, /Bolder.*`quietBold: \+1`.*`softStrong: \+1`/);
    assert.match(text, /As it is.*unanswered.*leaves both alone/);
  }
  assert.match(steer, /needs two options or more/);
  assert.match(steer, /reply of no or nothing.*no comment/);
  assert.match(bank, /S1 to S4/);
  assert.match(bank, /Rows already written under bank 0.3.0 keep their numbers/);
});

test('M6 item 5: no extra tapped-answer read-back outside the taste description', () => {
  const asking = section(sitting, 'Asking and saving');
  assert.match(asking, /After a screen of taps, continue without repeating their answers/);
  assert.doesNotMatch(sitting, /Read back the option words|read-back; the extra host lines/);
  assert.match(section(sitting, 'Step 3: How it should look'), /taste description/);
});
