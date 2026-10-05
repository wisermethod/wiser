import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT, 'scripts', 'copy-check.js');
const EM = String.fromCodePoint(0x2014);
const EN = String.fromCodePoint(0x2013);
const LQ = String.fromCodePoint(0x201C);
const RQ = String.fromCodePoint(0x201D);

function run(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
}

function withDir(files, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'copy-check-'));
  try {
    for (const [name, content] of Object.entries(files)) {
      const path = join(dir, name);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content);
    }
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function ok(args) {
  const result = run(args);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  return JSON.parse(result.stdout);
}

function refused(args, pattern) {
  const result = run(args);
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, pattern);
  return result.stderr;
}

function ledger(rows) {
  return [
    '| ID | Claim | Source | Register / label | Use |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
    ''
  ].join('\n');
}

function factMap(rows) {
  return [
    '| # | Sentence | Rows | Note |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
    ''
  ].join('\n');
}

const LEDGER = ledger([
  '| L1 | Builds tools for other people | https://example.com/a | Public statement / Verified | usable |'
]);

const MAP = factMap([
  '| 1 | She leads the practice | L1 | role |'
]);

describe('help', () => {
  it('prints usage and installs nothing', () => {
    const result = run(['help']);
    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.match(result.stdout, /--copy/);
    assert.match(result.stdout, /--ledger/);
    assert.match(result.stdout, /--fact-map/);
    assert.match(result.stdout, /--allow/);
    assert.match(result.stdout, /--patterns/);
    assert.match(result.stdout, /--corpus/);
    assert.match(result.stdout, /--n/);
    assert.match(result.stdout, /--help/);
    assert.match(result.stdout, /--env/);
    assert.match(result.stdout, /--install/);
    assert.equal(existsSync(join(ROOT, 'node_modules')), false);
  });

  for (const command of ['facts', 'prohibited', 'overlap', 'dashes']) {
    it(`${command} --help exits 0`, () => {
      const result = run([command, '--help']);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stderr, '');
      assert.match(result.stdout, new RegExp(command));
      assert.match(result.stdout, /--copy/);
    });
  }
});

describe('refusals of the command line', () => {
  it('refuses an unknown command, --install, and --env by name', () => {
    refused(['dance'], /unknown command "dance"/);
    refused(['facts', '--install'], /unknown option "--install"/);
    refused(['facts', '--env', '/tmp/x'], /unknown option "--env"/);
    refused(['--install'], /unknown option "--install"/);
  });

  it('refuses a relative path and a missing file', () => {
    refused(['dashes', '--copy', 'copy.md'], /absolute path/);
    refused(['dashes', '--copy', '/tmp/copy-check-missing-file.md'], /no file at/);
  });

  it('refuses a repeated flag and a flag with no value', () => {
    refused(['dashes', '--copy', '--copy'], /--copy was given more than once|--copy needs a value/);
    refused(['dashes', '--copy'], /--copy needs a value/);
  });
});

describe('facts', () => {
  it('passes when every unit maps to an allowed row', () => {
    withDir({
      'copy.md': 'She leads the practice today.\n',
      'ledger.md': LEDGER,
      'map.md': MAP
    }, (dir) => {
      const body = ok(['facts', '--copy', join(dir, 'copy.md'), '--ledger', join(dir, 'ledger.md'), '--fact-map', join(dir, 'map.md'), '--allow', 'usable']);
      assert.equal(body.pass, true);
      assert.equal(body.command, 'facts');
      assert.equal(body.unmapped.length, 0);
      assert.equal(body.stale.length, 0);
      assert.equal(body.ambiguous.length, 0);
      assert.equal(body.missingRows.length, 0);
      assert.equal(body.disallowed.length, 0);
      assert.equal(body.control.fired, true);
      assert.equal(body.control.planted, 'Copycheckcontrol plant sentence one.');
      assert.ok(!body.unmapped.some((row) => row.unit.includes('Copycheckcontrol')));
      assert.ok(body.units >= 1);
      assert.ok(body.characters > 0);
    });
  });

  it('reads a link, emphasis, and curly quotes as the sentence', () => {
    const copy = [
      'Read [the full title of the book](https://example.com/book) before the meeting.',
      'She is a *careful builder of tools* for clients.',
      `She said ${LQ}hello to the whole room${RQ} today and left.`,
      ''
    ].join('\n\n');
    const map = factMap([
      '| 1 | Read the full title of the book before | L1 | link |',
      '| 2 | She is a careful builder of tools | L1 | emphasis |',
      '| 3 | She said "hello to the whole room" today | L1 | quotes |'
    ]);
    withDir({ 'copy.md': copy, 'ledger.md': LEDGER, 'map.md': map }, (dir) => {
      const body = ok(['facts', '--copy', join(dir, 'copy.md'), '--ledger', join(dir, 'ledger.md'), '--fact-map', join(dir, 'map.md'), '--allow', 'usable']);
      assert.equal(body.pass, true, JSON.stringify(body.unmapped));
      assert.equal(body.unmapped.length, 0);
    });
  });

  it('reports unmapped, stale, ambiguous, missing, and disallowed without failing the process', () => {
    const copy = 'She leads the practice today. She leads the practice tomorrow. This sentence has no row at all. Nothing maps this extra sentence here.\n';
    const map = factMap([
      '| 1 | She leads the practice | L9 | ambiguous |',
      '| 2 | Nobody wrote this sentence here | L1 | stale |',
      '| 3 | This sentence has no row | L2 | disallowed |'
    ]);
    const book = ledger([
      '| L1 | Builds tools for other people | https://example.com/a | Public statement / Verified | usable |',
      '| L2 | A personal detail of the person | the person | Firsthand / Unverified: requires confirmation | confirm |'
    ]);
    withDir({ 'copy.md': copy, 'ledger.md': book, 'map.md': map }, (dir) => {
      const body = ok(['facts', '--copy', join(dir, 'copy.md'), '--ledger', join(dir, 'ledger.md'), '--fact-map', join(dir, 'map.md'), '--allow', 'usable']);
      assert.equal(body.pass, false);
      assert.ok(body.ambiguous.some((row) => row.unitCount === 2));
      assert.ok(body.stale.some((row) => row.sentence.includes('Nobody wrote')));
      assert.ok(body.unmapped.some((row) => row.unit.includes('Nothing maps')));
      assert.ok(!body.unmapped.some((row) => row.unit.includes('Copycheckcontrol')));
      assert.ok(body.missingRows.some((row) => row.id === 'L9'));
      assert.ok(body.disallowed.some((row) => row.id === 'L2' && row.code === 'confirm'));
      assert.equal(body.control.fired, true);
    });
  });

  it('names an ignored table and keeps an escaped pipe in the claim', () => {
    const book = [
      '| Name | Value |',
      '| --- | --- |',
      '| plain | note |',
      '',
      '| ID | Claim | Source | Register / label | Use |',
      '| --- | --- | --- | --- | --- |',
      '| L1 | a \\| b is the claim here | https://example.com/a | Public statement / Verified | **usable** |',
      ''
    ].join('\n');
    withDir({
      'copy.md': 'She leads the practice today.\n',
      'ledger.md': book,
      'map.md': MAP
    }, (dir) => {
      const body = ok(['facts', '--copy', join(dir, 'copy.md'), '--ledger', join(dir, 'ledger.md'), '--fact-map', join(dir, 'map.md'), '--allow', 'usable']);
      assert.equal(body.pass, true);
      assert.ok(body.ignoredTables.some((table) => table.file === 'ledger' && table.header[0] === 'Name'));
    });
  });

  it('accepts a none row for a sentence that states no fact', () => {
    withDir({
      'copy.md': 'She leads the practice today.\n',
      'ledger.md': LEDGER,
      'map.md': factMap(['| 1 | She leads the practice | none | definition |'])
    }, (dir) => {
      const body = ok(['facts', '--copy', join(dir, 'copy.md'), '--ledger', join(dir, 'ledger.md'), '--fact-map', join(dir, 'map.md'), '--allow', 'usable']);
      assert.equal(body.pass, true);
    });
  });

  it('refuses a bad ledger and a bad fact map', () => {
    withDir({
      'copy.md': 'She leads the practice today.\n',
      'ledger.md': LEDGER,
      'map.md': MAP,
      'no-ledger.md': '| Name | Value |\n| --- | --- |\n| a | b |\n',
      'bad-order.md': '| Claim | ID | Source | Register / label | Use |\n| --- | --- | --- | --- | --- |\n| text | L1 | s | r | usable |\n',
      'bad-count.md': '| ID | Claim | Source | Register / label | Use |\n| --- | --- | --- | --- | --- |\n| L1 | only two cells |\n',
      'empty-id.md': '| ID | Claim | Source | Register / label | Use |\n| --- | --- | --- | --- | --- |\n|  | claim text is here now | s | r | usable |\n',
      'dup.md': '| ID | Claim | Source | Register / label | Use |\n| --- | --- | --- | --- | --- |\n| L1 | claim text is here now | s | r | usable |\n| L1 | claim text is here too | s | r | usable |\n',
      'empty-use.md': '| ID | Claim | Source | Register / label | Use |\n| --- | --- | --- | --- | --- |\n| L1 | claim text is here now | s | r |  |\n',
      'short.md': '| # | Sentence | Rows | Note |\n| --- | --- | --- | --- |\n| 1 | Too few words | none | x |\n',
      'empty-rows.md': '| # | Sentence | Rows | Note |\n| --- | --- | --- | --- |\n| 1 | One two three four |  | x |\n',
      'bad-header.md': '| # | Sentence | Rows |\n| --- | --- | --- |\n| 1 | One two three four | none |\n',
      'no-map.md': 'No table here.\n',
      'bad-row.md': '| # | Sentence | Rows | Note |\n| --- | --- | --- | --- |\n| 1 | One two three four |\n'
    }, (dir) => {
      const base = ['facts', '--copy', join(dir, 'copy.md'), '--allow', 'usable'];
      refused([...base, '--ledger', join(dir, 'no-ledger.md'), '--fact-map', join(dir, 'map.md')], /no ledger table/);
      refused([...base, '--ledger', join(dir, 'bad-order.md'), '--fact-map', join(dir, 'map.md')], /line 1/);
      refused([...base, '--ledger', join(dir, 'bad-count.md'), '--fact-map', join(dir, 'map.md')], /line 3/);
      refused([...base, '--ledger', join(dir, 'empty-id.md'), '--fact-map', join(dir, 'map.md')], /empty ID/);
      refused([...base, '--ledger', join(dir, 'dup.md'), '--fact-map', join(dir, 'map.md')], /duplicated/);
      refused([...base, '--ledger', join(dir, 'empty-use.md'), '--fact-map', join(dir, 'map.md')], /no Use code/);
      refused([...base, '--ledger', join(dir, 'ledger.md'), '--fact-map', join(dir, 'empty-rows.md')], /empty Rows/);
      refused([...base, '--ledger', join(dir, 'ledger.md'), '--fact-map', join(dir, 'bad-header.md')], /malformed/);
      refused([...base, '--ledger', join(dir, 'ledger.md'), '--fact-map', join(dir, 'no-map.md')], /no map table/);
      refused([...base, '--ledger', join(dir, 'ledger.md'), '--fact-map', join(dir, 'bad-row.md')], /line 3/);
      refused([...base, '--ledger', join(dir, 'ledger.md')], /--fact-map is required/);
    });
  });

  it('follows a symlink to the real copy', () => {
    withDir({
      'real.md': 'She leads the practice today.\n',
      'ledger.md': LEDGER,
      'map.md': MAP
    }, (dir) => {
      symlinkSync(join(dir, 'real.md'), join(dir, 'link.md'));
      const body = ok(['facts', '--copy', join(dir, 'link.md'), '--ledger', join(dir, 'ledger.md'), '--fact-map', join(dir, 'map.md'), '--allow', 'usable']);
      assert.equal(body.pass, true);
    });
  });
});

describe('prohibited', () => {
  const patterns = JSON.stringify({
    patterns: [
      { id: 'p1', from: 'default', phrase: 'thought leader' },
      { id: 'p2', from: 'voice', regex: 'builder' }
    ]
  });

  it('passes when nothing matches, and still fires its control', () => {
    withDir({
      'copy.md': 'She leads the practice today.\n',
      'patterns.json': patterns
    }, (dir) => {
      const body = ok(['prohibited', '--copy', join(dir, 'copy.md'), '--patterns', join(dir, 'patterns.json')]);
      assert.equal(body.pass, true);
      assert.equal(body.matches.length, 0);
      assert.equal(body.control.fired, true);
    });
  });

  it('reports a plain hit with line and column', () => {
    withDir({
      'copy.md': 'She is a thought leader today.\n',
      'patterns.json': patterns
    }, (dir) => {
      const body = ok(['prohibited', '--copy', join(dir, 'copy.md'), '--patterns', join(dir, 'patterns.json')]);
      assert.equal(body.pass, false);
      assert.equal(body.matches.length, 1);
      assert.equal(body.matches[0].id, 'p1');
      assert.equal(body.matches[0].from, 'default');
      assert.equal(body.matches[0].text, 'thought leader');
      assert.equal(body.matches[0].line, 1);
      assert.equal(body.matches[0].column, 10);
      assert.equal(body.matches[0].context, 'text');
    });
  });

  it('reports a quotation and a reproduced title, and does not exempt either', () => {
    const copy = [
      'She said "thought leader" once in the interview.',
      'Read [thought leader](https://example.com/x) later today.',
      ''
    ].join('\n\n');
    withDir({ 'copy.md': copy, 'patterns.json': patterns }, (dir) => {
      const body = ok(['prohibited', '--copy', join(dir, 'copy.md'), '--patterns', join(dir, 'patterns.json')]);
      assert.equal(body.pass, false);
      assert.equal(body.matches.length, 2);
      assert.ok(body.matches.some((match) => match.context === 'quotation'));
      assert.ok(body.matches.some((match) => match.context === 'title'));
    });
  });

  it('refuses a bad patterns file', () => {
    withDir({
      'copy.md': 'She leads the practice today.\n',
      'bad.json': '{',
      'empty.json': '{"patterns":[]}',
      'dup.json': '{"patterns":[{"id":"p","from":"about","phrase":"alpha"},{"id":"p","from":"about","phrase":"beta"}]}',
      'from.json': '{"patterns":[{"id":"p","from":"nope","phrase":"alpha"}]}',
      'both.json': '{"patterns":[{"id":"p","from":"about","phrase":"alpha","regex":"beta"}]}',
      'neither.json': '{"patterns":[{"id":"p","from":"about"}]}',
      'regex.json': '{"patterns":[{"id":"p","from":"default","regex":"["}]}'
    }, (dir) => {
      const copy = join(dir, 'copy.md');
      refused(['prohibited', '--copy', copy, '--patterns', join(dir, 'bad.json')], /not valid JSON/);
      refused(['prohibited', '--copy', copy, '--patterns', join(dir, 'empty.json')], /no patterns/);
      refused(['prohibited', '--copy', copy, '--patterns', join(dir, 'dup.json')], /duplicated/);
      refused(['prohibited', '--copy', copy, '--patterns', join(dir, 'from.json')], /not about, voice, or default/);
      refused(['prohibited', '--copy', copy, '--patterns', join(dir, 'both.json')], /both phrase and regex/);
      refused(['prohibited', '--copy', copy, '--patterns', join(dir, 'neither.json')], /neither phrase nor regex/);
      refused(['prohibited', '--copy', copy, '--patterns', join(dir, 'regex.json')], /does not compile/);
    });
  });
});

describe('overlap', () => {
  it('passes when no sequence is shared, and reports a match when one is', () => {
    withDir({
      'copy.md': 'Alpha bravo charlie delta echo sits in this note.\n',
      'corpus/one.md': 'one two three four five six stays in the corpus file.\n'
    }, (dir) => {
      const clean = ok(['overlap', '--copy', join(dir, 'copy.md'), '--corpus', join(dir, 'corpus')]);
      assert.equal(clean.pass, true);
      assert.equal(clean.n, 5);
      assert.equal(clean.control.fired, true);
      assert.deepEqual(clean.filesRead, ['one.md']);
      assert.equal(clean.filesSkipped.length, 0);

      writeFileSync(join(dir, 'copy.md'), 'one two three four five sits in this note.\n');
      const hit = ok(['overlap', '--copy', join(dir, 'copy.md'), '--corpus', join(dir, 'corpus')]);
      assert.equal(hit.pass, false);
      assert.ok(hit.sections.some((section) => section.matches.some((match) => match.sequence === 'one two three four five' && match.files.includes('one.md'))));
    });
  });

  it('excludes quotations, and reports a run inside link text', () => {
    const copy = [
      '# Work',
      '',
      'The page opens on a different set of words entirely here.',
      '',
      '"ships and sails and weather and tides and moons" is a quotation.',
      '',
      'See [ships and sails and weather and tides](https://example.com/book) for it.',
      ''
    ].join('\n');
    withDir({
      'copy.md': copy,
      'corpus/book.md': 'ships and sails and weather and tides and moons appear in the corpus.\n'
    }, (dir) => {
      const body = ok(['overlap', '--copy', join(dir, 'copy.md'), '--corpus', join(dir, 'corpus'), '--n', '5']);
      assert.equal(body.pass, false, JSON.stringify(body.sections));
      assert.ok(body.excludedWords >= 5);
      const seqs = body.sections.flatMap((section) => section.matches.map((m) => m.sequence));
      assert.ok(seqs.includes('ships and sails and weather'), JSON.stringify(seqs));
      assert.ok(!seqs.includes('weather and tides and moons'), JSON.stringify(seqs));
    });
  });

  it('lists skipped files and refuses a corpus with nothing readable', () => {
    withDir({
      'copy.md': 'Alpha bravo charlie delta echo sits in this note.\n',
      'corpus/notes.pdf': 'not markdown',
      'corpus/good.md': 'one two three four five six stays in the corpus file.\n',
      'corpus/bad.md': Buffer.from([0xff, 0xfe, 0x00]),
      'empty/readme.pdf': 'no'
    }, (dir) => {
      symlinkSync(join(dir, 'corpus', 'good.md'), join(dir, 'corpus', 'link.md'));
      const body = ok(['overlap', '--copy', join(dir, 'copy.md'), '--corpus', join(dir, 'corpus')]);
      assert.ok(body.filesSkipped.some((file) => file.path === 'notes.pdf' && file.reason === 'extension'));
      assert.ok(body.filesSkipped.some((file) => file.path === 'bad.md' && file.reason === 'not-utf8'));
      assert.ok(body.filesSkipped.some((file) => file.path === 'link.md' && file.reason === 'symlink'));
      assert.deepEqual(body.filesRead, ['good.md']);
      refused(['overlap', '--copy', join(dir, 'copy.md'), '--corpus', join(dir, 'empty')], /no readable/);
    });
  });

  it('refuses --n outside 3 to 12', () => {
    withDir({
      'copy.md': 'Alpha bravo charlie delta echo sits in this note.\n',
      'corpus/one.md': 'one two three four five six stays.\n'
    }, (dir) => {
      refused(['overlap', '--copy', join(dir, 'copy.md'), '--corpus', join(dir, 'corpus'), '--n', '2'], /--n/);
      refused(['overlap', '--copy', join(dir, 'copy.md'), '--corpus', join(dir, 'corpus'), '--n', '13'], /--n/);
      refused(['overlap', '--copy', join(dir, 'copy.md'), '--corpus', join(dir, 'corpus'), '--n', 'five'], /--n/);
    });
  });
});

describe('dashes', () => {
  it('passes on a hyphen, exempts a quotation, and counts a dash in link text', () => {
    withDir({ 'copy.md': 'A plain hyphen-minus is not the fault.\n' }, (dir) => {
      const body = ok(['dashes', '--copy', join(dir, 'copy.md')]);
      assert.equal(body.pass, true);
      assert.equal(body.counted, 0);
      assert.equal(body.exempt, 0);
      assert.equal(body.control.fired, true);
      assert.equal(body.control.planted, 'U+2014');
      assert.equal(body.hits.length, 0);
    });

    withDir({ 'copy.md': `He wrote "cost ${EM} benefit" in the note.\n` }, (dir) => {
      const body = ok(['dashes', '--copy', join(dir, 'copy.md')]);
      assert.equal(body.pass, true);
      assert.equal(body.counted, 0);
      assert.equal(body.exempt, 1);
      assert.equal(body.hits[0].context, 'quotation');
      assert.equal(body.hits[0].character, 'U+2014');
    });

    withDir({ 'copy.md': `See [Cost ${EN} benefit note](https://example.com/a) today.\n` }, (dir) => {
      const body = ok(['dashes', '--copy', join(dir, 'copy.md')]);
      assert.equal(body.pass, false);
      assert.equal(body.counted, 1);
      assert.equal(body.exempt, 0);
      assert.equal(body.hits[0].context, 'title');
      assert.equal(body.hits[0].character, 'U+2013');
    });
  });

  it('counts a dash in text, including inside italics', () => {
    withDir({ 'copy.md': `Cost ${EM} benefit is stated.\n` }, (dir) => {
      const body = ok(['dashes', '--copy', join(dir, 'copy.md')]);
      assert.equal(body.pass, false);
      assert.equal(body.counted, 1);
      assert.equal(body.hits[0].line, 1);
      assert.equal(body.hits[0].column, 6);
      assert.equal(body.hits[0].context, 'text');
    });

    withDir({ 'copy.md': `The *range ${EM} gap* is wide enough.\n` }, (dir) => {
      const body = ok(['dashes', '--copy', join(dir, 'copy.md')]);
      assert.equal(body.pass, false);
      assert.equal(body.counted, 1);
      assert.equal(body.hits[0].context, 'text');
    });
  });
});

describe('further refusals and limits', () => {
  it('refuses a directory as copy, a file as corpus, and a second map', () => {
    withDir({
      'copy.md': 'She leads the practice today.\n',
      'ledger.md': LEDGER,
      'map.md': [
        factMap(['| 1 | She leads the practice | L1 | role |']).trimEnd(),
        '',
        factMap(['| 2 | She leads the practice tomorrow | L1 | extra |'])
      ].join('\n'),
      'corpus.md': 'one two three four five six\n'
    }, (dir) => {
      refused(['dashes', '--copy', dir], /is not a file/);
      refused(['overlap', '--copy', join(dir, 'copy.md'), '--corpus', join(dir, 'corpus.md')], /is not a directory/);
      refused(['facts', '--copy', join(dir, 'copy.md'), '--ledger', join(dir, 'ledger.md'), '--fact-map', join(dir, 'map.md'), '--allow', 'usable'], /second map table/);
    });
  });

  it('refuses a spaced ID on its own and a phrase that is empty or padded', () => {
    withDir({
      'copy.md': 'She leads the practice today.\n',
      'ledger.md': ledger([
        '| L 1 | Builds tools for other people | https://example.com/a | Public statement / Verified | usable |'
      ]),
      'map.md': MAP,
      'empty.json': '{"patterns":[{"id":"p","from":"default","phrase":""}]}\n',
      'padded.json': '{"patterns":[{"id":"p","from":"default","phrase":" thought leader"}]}\n'
    }, (dir) => {
      refused(['facts', '--copy', join(dir, 'copy.md'), '--ledger', join(dir, 'ledger.md'), '--fact-map', join(dir, 'map.md'), '--allow', 'usable'], /not a single token/);
      refused(['prohibited', '--copy', join(dir, 'copy.md'), '--patterns', join(dir, 'empty.json')], /phrase is empty/);
      refused(['prohibited', '--copy', join(dir, 'copy.md'), '--patterns', join(dir, 'padded.json')], /leading or trailing whitespace/);
    });
  });

  it('splits a sentence at an abbreviation and skips an empty cell', () => {
    const copy = [
      'See the note, e.g. This continues as a new sentence here.',
      '',
      '| Role held at the firm | Year of the appointment |',
      '| --- | --- |',
      '| Led the practice group | |',
      ''
    ].join('\n');
    const map = factMap([
      '| 1 | See the note, e.g. | L1 | abbreviation |',
      '| 2 | This continues as a new sentence | L1 | continuation |',
      '| 3 | Role held at the firm | L1 | heading cell |',
      '| 4 | Year of the appointment | L1 | heading cell |',
      '| 5 | Led the practice group | L1 | body cell |'
    ]);
    withDir({ 'copy.md': copy, 'ledger.md': LEDGER, 'map.md': map }, (dir) => {
      const body = ok(['facts', '--copy', join(dir, 'copy.md'), '--ledger', join(dir, 'ledger.md'), '--fact-map', join(dir, 'map.md'), '--allow', 'usable']);
      assert.equal(body.pass, true, JSON.stringify(body.unmapped));
      assert.equal(body.units, 5);
      assert.ok(!body.unmapped.some((row) => row.unit === ''));
      assert.equal(body.stale.length, 0);
    });
  });

  it('plants overlap from a later corpus file when the first is short', () => {
    withDir({
      'copy.md': 'The page states a different sequence of words here today.\n',
      'corpus/a.md': 'short file\n',
      'corpus/b.md': 'alpha bravo charlie delta echo foxtrot stays unique.\n'
    }, (dir) => {
      const body = ok(['overlap', '--copy', join(dir, 'copy.md'), '--corpus', join(dir, 'corpus')]);
      assert.equal(body.pass, true);
      assert.equal(body.control.fired, true);
      assert.equal(body.control.planted, 'alpha bravo charlie delta echo');
      assert.ok(body.sections.every((section) => section.matches.length === 0));
    });
  });
});

describe('the tool source', () => {
  it('carries neither U+2014 nor U+2013 as a literal', () => {
    function walk(dir) {
      const files = [];
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) files.push(...walk(path));
        else if (name.endsWith('.js')) files.push(path);
      }
      return files;
    }
    for (const file of walk(join(ROOT, 'scripts'))) {
      const text = readFileSync(file, 'utf8');
      assert.equal(text.includes(EM), false, file);
      assert.equal(text.includes(EN), false, file);
    }
  });
});

describe('fixes after the build read', () => {
  it('maps a unit under four words by its whole text, and only by its whole text', () => {
    const copy = '---\ntitle: Jane Roe\n---\n\n## Bio\n\nJane Roe leads the practice group at the firm.\n\n- [LinkedIn](https://example.com/in)\n';
    const map = factMap([
      '| 1 | Jane Roe | L1 | the title |',
      '| 2 | Bio | none | heading |',
      '| 3 | Jane Roe leads the practice | L1 | |',
      '| 4 | LinkedIn | none | link |'
    ]);
    withDir({ 'copy.md': copy, 'ledger.md': LEDGER, 'map.md': map }, (dir) => {
      const body = ok(['facts', '--copy', join(dir, 'copy.md'), '--ledger', join(dir, 'ledger.md'), '--fact-map', join(dir, 'map.md'), '--allow', 'usable']);
      assert.equal(body.pass, true, JSON.stringify(body));
      assert.equal(body.ambiguous.length, 0);
    });
    const prefixOnly = factMap([
      '| 1 | Jane Roe | L1 | a short sentence is not a prefix |',
      '| 2 | Bio | none | heading |',
      '| 3 | LinkedIn | none | link |'
    ]);
    withDir({ 'copy.md': copy, 'ledger.md': LEDGER, 'map.md': prefixOnly }, (dir) => {
      const body = ok(['facts', '--copy', join(dir, 'copy.md'), '--ledger', join(dir, 'ledger.md'), '--fact-map', join(dir, 'map.md'), '--allow', 'usable']);
      assert.equal(body.pass, false);
      assert.ok(body.unmapped.some((row) => row.unit.startsWith('Jane Roe leads')));
    });
  });

  it('reads the Use code as the leading word, without trailing punctuation', () => {
    const ledgerText = '| ID | Claim | Source | Register / label | Use |\n| --- | --- | --- | --- | --- |\n| L1 | Leads the practice group | s | r | **usable**, as worded |\n| L2 | Another claim held | s | r | confirm: wording |\n';
    const copy = 'Jane Roe leads the practice group at the firm.\n';
    const map = factMap(['| 1 | Jane Roe leads the practice | L1 | |']);
    withDir({ 'copy.md': copy, 'ledger.md': ledgerText, 'map.md': map }, (dir) => {
      const body = ok(['facts', '--copy', join(dir, 'copy.md'), '--ledger', join(dir, 'ledger.md'), '--fact-map', join(dir, 'map.md'), '--allow', 'usable']);
      assert.equal(body.pass, true, JSON.stringify(body));
    });
  });

  it('never pairs a quotation across a blank line', () => {
    const copy = ['A stray 10" mark sits in this paragraph.', '', 'This dash ' + EM + ' sits outside any quotation.', '', 'She wrote "a quoted ' + EM + ' dash" here.', ''].join('\n');
    withDir({ 'copy.md': copy }, (dir) => {
      const body = ok(['dashes', '--copy', join(dir, 'copy.md')]);
      assert.equal(body.counted, 1, JSON.stringify(body.hits));
      assert.equal(body.exempt, 1, JSON.stringify(body.hits));
    });
  });
  it('maps one sentence repeated verbatim in two bios with one row, and still flags a prefix shared by different units', () => {
    const copy = '## Short bio\n\nJane Roe leads the practice group.\n\n## Longer bio\n\nJane Roe leads the practice group. She founded it in 2011.\n\n## Other\n\nJane Roe leads the practice group at night.\n';
    const same = factMap([
      '| 1 | Short bio | none | heading |', '| 2 | Longer bio | none | heading |', '| 3 | Other | none | heading |',
      '| 4 | "Jane Roe leads the practice group." | L1 | both bios |',
      '| 5 | She founded it in 2011 | L1 | |',
      '| 6 | Jane Roe leads the practice group at | L1 | |'
    ]);
    withDir({ 'copy.md': copy, 'ledger.md': LEDGER, 'map.md': same }, (dir) => {
      const body = ok(['facts', '--copy', join(dir, 'copy.md'), '--ledger', join(dir, 'ledger.md'), '--fact-map', join(dir, 'map.md'), '--allow', 'usable']);
      assert.equal(body.ambiguous.length, 0, JSON.stringify(body.ambiguous));
      assert.equal(body.pass, true, JSON.stringify(body));
    });
    const prefix = factMap([
      '| 1 | Short bio | none | heading |', '| 2 | Longer bio | none | heading |', '| 3 | Other | none | heading |',
      '| 4 | Jane Roe leads the practice | L1 | shared prefix |',
      '| 5 | She founded it in 2011 | L1 | |'
    ]);
    withDir({ 'copy.md': copy, 'ledger.md': LEDGER, 'map.md': prefix }, (dir) => {
      const body = ok(['facts', '--copy', join(dir, 'copy.md'), '--ledger', join(dir, 'ledger.md'), '--fact-map', join(dir, 'map.md'), '--allow', 'usable']);
      assert.equal(body.ambiguous.length, 1);
      assert.equal(body.pass, false);
    });
  });
});

describe('fixes after adversarial round 1', () => {
  it('refuses a title or description that is not a single-line value', () => {
    for (const fm of ['description:\n  Jane Roe is a thought leader.', 'description: >\n  folded value', 'description: |\n  literal value', 'title:']) {
      withDir({ 'copy.md': `---\n${fm}\n---\n\nBody text sits here now.\n` }, (dir) => {
        refused(['dashes', '--copy', join(dir, 'copy.md')], /single-line value/);
      });
    }
    withDir({ 'copy.md': '---\ntitle: Jane Roe\ndescription: "One line, quoted."\nlayout: page\n---\n\nBody text sits here now.\n' }, (dir) => {
      const body = ok(['dashes', '--copy', join(dir, 'copy.md')]);
      assert.equal(body.pass, true);
    });
  });

  it('keeps paragraph boundaries in overlap so a stray quote cannot exempt a later paragraph', () => {
    const copy = ['## Notes', '', 'He measured 10" here.', '', 'alpha bravo charlie delta echo', '', 'She wrote "done" plainly.', ''].join('\n');
    withDir({ 'copy.md': copy, 'corpus/a.md': 'alpha bravo charlie delta echo foxtrot\n' }, (dir) => {
      const body = ok(['overlap', '--copy', join(dir, 'copy.md'), '--corpus', join(dir, 'corpus')]);
      assert.equal(body.pass, false, JSON.stringify(body.sections));
    });
  });

  it('searches a list item in source order across its continuation line', () => {
    const copy = ['## Items', '', '- alpha bravo', '  charlie delta echo', ''].join('\n');
    withDir({ 'copy.md': copy, 'corpus/a.md': 'alpha bravo charlie delta echo\n' }, (dir) => {
      const body = ok(['overlap', '--copy', join(dir, 'copy.md'), '--corpus', join(dir, 'corpus')]);
      assert.equal(body.pass, false, JSON.stringify(body.sections));
    });
  });
});

describe('visible copy, block by block', () => {
  const phrase = 'alpha bravo charlie delta echo';

  it('refuses a folded description whose body follows a blank line', () => {
    const copy = ['---', 'description: > # SEO description', '', '  Jane Roe is a thought leader.', '---', '', 'Body text sits here now.', ''].join('\n');
    withDir({ 'copy.md': copy }, (dir) => {
      refused(['dashes', '--copy', join(dir, 'copy.md')], /frontmatter description at line 2/);
      refused(['dashes', '--copy', join(dir, 'copy.md')], /single-line value/);
    });
  });

  it('refuses a plain description continued on an indented line after a blank line', () => {
    const copy = ['---', 'description: plain value', '', '  continued value', '---', '', 'Body text sits here now.', ''].join('\n');
    withDir({ 'copy.md': copy }, (dir) => {
      refused(['dashes', '--copy', join(dir, 'copy.md')], /frontmatter description at line 2/);
    });
  });

  it('matches a quoted frontmatter description the same way as the unquoted value', () => {
    const quoted = ['---', `description: "${phrase}"`, '---', ''].join('\n');
    const plain = ['---', `description: ${phrase}`, '---', ''].join('\n');
    withDir({
      'quoted.md': quoted,
      'plain.md': plain,
      'corpus/a.md': `${phrase}\n`
    }, (dir) => {
      const fromQuoted = ok(['overlap', '--copy', join(dir, 'quoted.md'), '--corpus', join(dir, 'corpus')]);
      const fromPlain = ok(['overlap', '--copy', join(dir, 'plain.md'), '--corpus', join(dir, 'corpus')]);
      assert.equal(fromQuoted.pass, false, JSON.stringify(fromQuoted.sections));
      assert.ok(fromQuoted.sections.some((section) => section.section === 'frontmatter' && section.matches.some((match) => match.sequence === phrase)));
      assert.deepEqual(fromQuoted.sections, fromPlain.sections);
      assert.equal(fromQuoted.excludedWords, fromPlain.excludedWords);
    });
  });

  it('counts a dash inside a quoted frontmatter value', () => {
    const copy = ['---', `description: "a quoted value${EM} here"`, '---', ''].join('\n');
    withDir({ 'copy.md': copy }, (dir) => {
      const body = ok(['dashes', '--copy', join(dir, 'copy.md')]);
      assert.equal(body.counted, 1, JSON.stringify(body.hits));
      assert.equal(body.exempt, 0, JSON.stringify(body.hits));
      assert.equal(body.hits[0].context, 'text');
    });
  });

  it('keeps a corpus match when a fence with a blank line sits between an inch mark and the words', () => {
    const copy = [
      'He measured 10" here.',
      '~~~',
      '',
      '~~~',
      phrase,
      'She wrote "done".'
    ].join('\n');
    withDir({ 'copy.md': copy, 'corpus/a.md': `${phrase}\n` }, (dir) => {
      const body = ok(['overlap', '--copy', join(dir, 'copy.md'), '--corpus', join(dir, 'corpus')]);
      assert.equal(body.pass, false, JSON.stringify(body.sections));
      assert.ok(body.sections.some((section) => section.matches.some((match) => match.sequence === phrase)));
    });
  });

  it('counts a dash on the far side of a heading from a stray inch mark', () => {
    const copy = [
      'He measured 10".',
      '## Work',
      `New prose${EM} here.`,
      'She wrote "done".'
    ].join('\n');
    withDir({ 'copy.md': copy }, (dir) => {
      const body = ok(['dashes', '--copy', join(dir, 'copy.md')]);
      assert.equal(body.counted, 1, JSON.stringify(body.hits));
      assert.equal(body.exempt, 0, JSON.stringify(body.hits));
      assert.equal(body.hits[0].context, 'text');
    });
  });

  it('matches words around a link and around an image, without the URL', () => {
    withDir({
      'link.md': `alpha bravo [charlie](https://example.com) delta echo\n`,
      'image.md': `alpha bravo ![charlie](https://example.com/a.png) delta echo\n`,
      'corpus/a.md': `${phrase}\n`
    }, (dir) => {
      for (const name of ['link.md', 'image.md']) {
        const body = ok(['overlap', '--copy', join(dir, name), '--corpus', join(dir, 'corpus')]);
        assert.equal(body.pass, false, `${name} ${JSON.stringify(body.sections)}`);
        assert.ok(body.sections.some((section) => section.matches.some((match) => match.sequence === phrase)), name);
      }
    });
  });

  it('counts a dash in a table cell outside that cell\'s quotation', () => {
    const copy = [
      `| 10" | She said "done" ${EM} here |`,
      '| --- | --- |',
      '| alpha | beta |',
      ''
    ].join('\n');
    withDir({ 'copy.md': copy }, (dir) => {
      const body = ok(['dashes', '--copy', join(dir, 'copy.md')]);
      assert.equal(body.counted, 1, JSON.stringify(body.hits));
      assert.equal(body.exempt, 0, JSON.stringify(body.hits));
      assert.equal(body.hits[0].context, 'text');
    });
  });
});
