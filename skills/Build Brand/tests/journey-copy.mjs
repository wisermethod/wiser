import assert from 'node:assert/strict';

// Compare only copy at its actual screen, never arbitrary text in a path or
// Source notes. Blockquote lines retain inner quotes and markdown verbatim.
const blocks = text => text.split('\n').filter(line => /^>\s+\S/.test(line)).map(line => line.slice(2));
const options = text => text.split('\n').filter(line => /^- /.test(line)).map(line => line.slice(2));
function between(text, start, end) {
  const at = text.indexOf(start);
  assert.ok(at >= 0, `missing copy boundary: ${start}`);
  const tail = text.slice(at + start.length), stop = end ? tail.indexOf(end) : tail.length;
  assert.ok(stop >= 0, `missing copy boundary: ${end}`);
  return tail.slice(0, stop);
}
function capture(text, pattern) {
  const found = text.match(pattern);
  assert.ok(found, `missing member copy: ${pattern}`);
  return found[1];
}
const h2 = (text, heading) => between(text, `## ${heading}\n`, '\n## ');
const sorted = values => [...values].sort();
const eq = (actual, expected, screen) => assert.deepEqual(actual, expected, screen);

export function compareJourneyCopy(source, bank, openingTaps) {
  const journey = between(source, '## Opening\n', '## Words never said\n');
  const j = name => h2(source, name), b = name => h2(bank, name);
  const checked = [], expectedBankBlockquotes = [], expectedJourneyBlockquotes = [];
  function screen(name, actual, expected) {
    // Sorting allows prose to place an org variant next to its personal line;
    // duplicates remain significant. Options are compared separately in order.
    eq(sorted(actual), sorted(expected), name);
    checked.push(...expected);
  }
  function bankScreen(name, actual, expected) {
    screen(name, actual, expected);
    expectedBankBlockquotes.push(...expected);
  }
  function quotedScreen(name, actual, expected, added = []) {
    const sourceLines = blocks(expected);
    bankScreen(`${name}: complete lines`, blocks(actual), [...sourceLines, ...added]);
    expectedJourneyBlockquotes.push(...sourceLines);
  }
  const opening = j('Opening');
  quotedScreen('Opening', b('Opening'), opening, [capture(opening, /For an organisation: "(.*)"/)]);

  const keep = j('Step 1: What to keep'), bankKeep = b('Step 1: What to keep');
  const keepBlocks = blocks(keep);
  expectedJourneyBlockquotes.push(...keepBlocks);
  bankScreen('What to keep', blocks(bankKeep), [keepBlocks[0], capture(keep, /For an organisation, "(.*)"/), keepBlocks[1], capture(keep, /Where the app cannot open one: "(.*)" with the same second sentence/), capture(keep, /Done with nothing placed or dropped: "(.*)" and the same two options/)]);
  eq(options(bankKeep), options(keep), 'What to keep: options in order');
  checked.push(...options(keep));

  const org = j("Step 2, organisation only: Who it's for"), bankOrg = b("Organisation: Who it's for");
  quotedScreen('Organisation', bankOrg, org);
  eq(options(bankOrg), options(org), 'Organisation: options in order');
  screen('Organisation: redraft controls', [capture(bankOrg, /Close or Not quite: "(.*?)",/), capture(bankOrg, /and "(.*?)" last/)], [capture(org, /two redrafts, "(.*?)",/), capture(org, /with "(.*?)" last/)]);

  const words = j('Step 2 (3 for an organisation): What your brand says'), bankWords = b('Step 2: What your brand says');
  quotedScreen('Words, including the nested-quote thin question', bankWords, words);
  const secondOptions = [capture(words, /options read (A), B,/), 'B', capture(words, /options read A, B, "(.*?)"/), capture(words, /options read A, B, ".*?" and "(.*?)"/)];
  eq(options(bankWords), [...options(words), ...secondOptions], 'Words: all options in order');
  checked.push(...options(words), ...secondOptions);
  screen('Words: picture rule caption', [capture(bankWords, /picture rule, "(.*?)",/)], [capture(words, /board states \("(.*?)"\)/)]);

  const taste = j('Step 3 (4 for an organisation): How it should look');
  const reveal = between(taste, '**The taste description**', '**Whole looks,');
  quotedScreen('Taste description and pull', b('Step 3: Reveal and pull'), reveal);
  eq(options(b('Step 3: Reveal and pull')), options(reveal), 'Taste description and pull: options');
  screen('Taste correction', [capture(b('Step 3: Reveal and pull'), /brings one question, "(.*?)",/)], [capture(reveal, /one question, "(.*?)",/)]);

  const looks = between(taste, '**Whole looks,', '**Making the boards.**'), bankLooks = b('Step 3: Whole looks');
  quotedScreen('Whole looks', bankLooks, looks);
  const lookActions = [...looks.matchAll(/^- (?:Nothing|One|Two or three) picked: "(.*?)"\. Its line: "(.*?)"/gm)].map(m => [m[1], m[2]]);
  assert.equal(lookActions.length, 3, 'all whole-look actions extracted');
  const actualLookActions = bankLooks.split('\n').filter(line => /^\| (None|One|Two or three) \|/.test(line)).map(line => line.split('|').slice(2, 4).map(v => v.trim()));
  eq(actualLookActions, lookActions, 'Whole looks: action labels and captions');
  screen('Whole looks: overflow and retry', [capture(bankLooks, /grey with "(.*?)"/), capture(bankLooks, /below with "(.*?)",/)], [capture(looks, /line reads "(.*?)"/), capture(looks, /comment reading "(.*?)"/)]);

  const making = between(taste, '**Making the boards.**');
  quotedScreen('Making the boards', b('Making the boards'), making, [capture(making, /instead reads "(.*?)"/)]);

  const boards = j('Step 4 (5 for an organisation): The boards'), bankBoards = b('Step 4: The boards');
  quotedScreen('Boards and initials caption', bankBoards, boards, [capture(boards, /locked\."\): "(.*?)"/), capture(boards, /which has no lock \(the operator's choice of 2026-11-02\): "(.*?)"/)]);
  const sourceBoardCopy = [capture(boards, /Under each tile, apart from its tap area, "(.*?)"/), capture(boards, /between "(.*?)" above/), capture(boards, /tick box, "(.*?)"/), capture(boards, /always shown: "(.*?)"/), capture(boards, /with nothing picked, "(.*?)"/), capture(boards, /with one, "(.*?)"/), capture(boards, /with two or three, "(.*?)"/), capture(boards, /exactly one picked: "(.*?)"/), capture(boards, /Its line: "(.*?)"/), capture(boards, /its line reads "(.*?)"/)];
  const actualBoardCopy = [capture(bankBoards, /\. "(.*?)" replaces all tiles/), capture(bankBoards, /same card\. "(.*?)" above and below it/), capture(bankBoards, /with "(.*?)" tick/), ...bankBoards.split('\n').filter(line => /^\| (Show me more|Lock this board in) \|/.test(line)).flatMap(line => {
    const [, label, detail] = line.split('|').map(s => s.trim());
    return label === 'Show me more' ? [label, ...detail.split('; ').map(value => value.slice(value.indexOf(': ') + 2))] : [label, detail];
  }), capture(bankBoards, /grey with "(.*?)"/)];
  screen('Boards: all controls and captions', actualBoardCopy, sourceBoardCopy);

  const blend = j('Step 5 (6 for an organisation): Blend and tune');
  const steer = between(blend, '**Steering the round.**', '**The rounds.**');
  quotedScreen('Steer', b('Steering a round'), steer, [capture(steer, /question reads "(.*?)"/)]);
  eq(options(b('Steering a round')), options(steer).filter(line => !line.startsWith('A box,')), 'Steer: options in order');
  quotedScreen('Blend page', b('Step 5: Blend and tune'), between(blend, '**The rounds.**', '**Leaving early.**'));
  quotedScreen('Leaving early, including inner ask quotes', b('Leaving early'), between(blend, '**Leaving early.**'));

  const lock = j('Step 6 (7 for an organisation): Lock'), bankLock = b('Step 6: Lock and close');
  quotedScreen('Lock and close', bankLock, lock, [capture(lock, /before "Done", "(.*?)", with nothing/)]);
  eq(options(bankLock), options(lock).filter(line => !line.startsWith('The locked board,')), 'Lock: optional note options');
  screen('Organisation share offer', [capture(bankLock, /offers lead with "(.*?)"/)], [capture(lock, /offers lead with "(.*?)"/)]);

  const brief = j('The brand-folder branch: a member who already has a brand'), bankBrief = b('The brief path');
  quotedScreen('Brand-folder files, gaps, read-back and close', bankBrief, brief, [capture(brief, /line reads "(.*?)"/), capture(brief, /brings "(.*?)" as a plain message/), capture(brief, /Done with nothing dropped: "(.*)"/), capture(brief, /status line, never a task for the member: "(.*)" Where/), capture(brief, /in one line: "(.*?)"/), capture(brief, /Something's off brings "(.*?)",/)]);
  eq(options(bankBrief), [...options(brief.split('**Step 2 of 3:')[0]), ...options(between(brief, '**Step 3 of 3:'))], 'Brand-folder: options in order');

  // All step progress and why lines are compared at their owning screen.
  for (const [name, sourceText, bankText] of [
    ['keep', keep, bankKeep], ['organisation', org, bankOrg], ['words', words, bankWords],
    ['taste', taste, b('Step 3: Nine taps')], ['boards', boards, bankBoards],
    ['blend', blend, b('Step 5: Blend and tune')], ['lock', lock, bankLock]
  ]) {
    screen(`${name}: progress`, [capture(bankText, /Progress[^\n]*?: "(.*?)"/)], [capture(sourceText, /\*\*Progress:\*\* "(.*?)"/)]);
    if (sourceText.includes('**Why')) screen(`${name}: why`, [capture(bankText, /(?:Why[^\n]*?|why only): "(.*?)"/)], [capture(sourceText, /\*\*Why[^\n]*?"(.*?)"/)]);
  }
  screen('Organisation final-say why', [capture(bankOrg, /own why: "(.*?)"/)], [capture(org, /own why line "(.*?)"/)]);
  for (const [heading, progress] of [['Brand files', 'Step 1 of 3: your brand files'], ['Anything missing', 'Step 2 of 3'], ['B8. Check it', 'Step 3 of 3: check it']]) {
    const bankStep = between(bankBrief, `### ${heading}\n`, '\n### ');
    const actual = capture(bankStep, /Progress: "(.*?)"/);
    const expected = progress === 'Step 2 of 3' ? capture(brief, /with "(Step 2 of 3)"/) : capture(brief, new RegExp(`\\*\\*(${progress})\\.`));
    screen(`Brief progress: ${heading}`, [actual], [expected]);
  }
  screen('Brief why', [capture(bankBrief, /Why: "(.*?)"/)], [capture(brief, /\*\*Why:\*\* "(.*?)"/)]);

  const orgNames = ['what to keep', "who it's for", 'what your brand says', 'how it should look', 'your boards', 'blend and tune', 'locked'];
  const sourceProgress = [keep, org, words, taste, boards, blend, lock].map(text => capture(text, /\*\*Progress:\*\* "(.*?)"/)).map((line, i) => line.replace(/Step \d of \d/, `Step ${i + 1} of 7`));
  eq(options(b('Organisation: Progress and substitutions')), sourceProgress, 'all organisation progress lines');
  assert.equal(orgNames.length, sourceProgress.length);
  const bankSubstitutions = b('Organisation: Progress and substitutions');
  screen('Organisation substitutions', [capture(bankSubstitutions, /thin record: "(.*?)"/), capture(bankSubstitutions, /sentence screen: "(.*?)"/), capture(bankSubstitutions, /and "(.*?)"/), capture(bankSubstitutions, /places: "(.*?)"/), capture(bankSubstitutions, /own-words line: "(.*?)"/)], [capture(words, /For an organisation, "(.*?)"/), capture(words, /For an organisation, "(When someone.*?)"/), capture(words, /and "(Is that.*?)"/), capture(taste, /For an organisation, "(.*?)"/), capture(words, /For an organisation, "(In your own words.*?)"/)]);
  screen('Folder extra lines', [capture(bankKeep, /same second sentence: "(.*?)"/), capture(bankKeep, /Say "(.*?)" only/), capture(bankKeep, /ownership phrase: "(.*?)"/)], [capture(keep, /folder:\n\n> .*?\. (Put them.*?)\n/), capture(keep, /"(Or drop them here in the chat)" is said/), capture(keep, /For an organisation, "(\[org\]'s.*?)"/)]);

  // The journey incorporates the opening taps by reference. Their own source
  // tables, not runtime ids/nudges, supply the question and option wording.
  const rows = [...openingTaps.matchAll(/^\| ([1-9]) \| (.*?) \| (.*?) \|.*$/gm)];
  assert.equal(rows.length, 9, 'all nine incorporated taps');
  const question = capture(taste, /each asked as "(.*?)"/);
  const appCopy = j('Each app');
  const suffix = capture(appCopy, /brand sets read "\.\.\. the direction you're going for (.*?)" to/);
  assert.equal(suffix, '(1 of 4).');
  assert.ok(appCopy.includes('"(4 of 4)."'), 'last question-tool suffix');
  for (const row of rows) {
    const number = Number(row[1]), brands = number >= 5 && number <= 8;
    const tap = between(bank, `### T${number}\n`, '\n##');
    const expectedQuestion = brands ? question.replace(/\.$/, ` (${number - 4} of 4).`) : row[2];
    const expectedOptions = (brands ? row[2] : row[3]).split(' · ');
    if (number === 2) expectedOptions[0] += ': ' + capture(taste, /Under "Engineered".*?: "(.*?)"/);
    const expectedLines = [expectedQuestion];
    bankScreen(`T${number}: question-tool question`, blocks(tap), expectedLines);
    eq(options(tap), expectedOptions, `T${number}: options in order`);
    checked.push(...expectedOptions);
  }
  assert.ok(!bank.includes('## Source notes'), 'operator asides do not belong in the bank');
  // Scan the entire member-copy range, including sections with no expected
  // blockquotes (organisation progress and the tap preamble). Compare counts
  // too: an extra copy of a valid line is still an invented screen. Expected
  // lines come only from the journey and its incorporated taps above.
  const bankCopy = between(bank, '## Opening\n', '## The five questions\n');
  eq(sorted(blocks(bankCopy)), sorted(expectedBankBlockquotes), 'all bank blockquotes from Opening through the brief close match both ways');
  // Cover the whole source range too, even a new screen in an unmapped section
  // or a duplicate of an existing line. Neither side can hide extra copy.
  eq(sorted(blocks(journey)), sorted(expectedJourneyBlockquotes), 'all journey blockquotes from Opening through Each app are mapped');
  return checked;
}
