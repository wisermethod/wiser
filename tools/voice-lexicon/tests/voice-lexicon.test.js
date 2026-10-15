import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  linkSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = join(ROOT, 'tests', 'fixtures');
// VOICE_LEXICON_SCRIPT points the suite at another entry script; it exists
// only so the suite can be proved to fail against a stub.
const SCRIPT = process.env.VOICE_LEXICON_SCRIPT || join(ROOT, 'scripts', 'voice-lexicon.js');

const MAREN = ['maren-a1.txt', 'maren-a2.txt', 'maren-a3.txt'];
const DALE = ['dale-c1.txt', 'dale-c2.txt', 'dale-c3.txt'];

function fixture(name) {
  return join(FIXTURES, name);
}

function text(name) {
  return readFileSync(fixture(name), 'utf8');
}

function run(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
}

function withDir(files, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'voice-lexicon-'));
  try {
    for (const [name, content] of Object.entries(files)) {
      const path = join(dir, name);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
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
  const body = JSON.parse(result.stdout);
  assert.equal(typeof body, 'object');
  assert.notEqual(body, null);
  assert.equal(Array.isArray(body), false);
  return body;
}

function refused(args, pattern) {
  const result = run(args);
  assert.equal(result.status, 1, `expected exit 1, got ${result.status}; stdout: ${result.stdout}`);
  assert.equal(result.stdout, '');
  assert.notEqual(result.stderr.trim(), '');
  if (pattern) assert.match(result.stderr, pattern);
  return result.stderr;
}

function entry(id, path, register = 'governing', origin = 'own') {
  return { id, path, register, origin };
}

function profileOf(entries, extra = []) {
  return withDir({ 'samples.json': entries }, (dir) =>
    ok(['profile', '--samples', join(dir, 'samples.json'), ...extra]));
}

function marenEntries() {
  return MAREN.map((name, i) => entry(`A${i + 1}`, fixture(name)));
}

function daleEntries() {
  return DALE.map((name, i) => entry(`C${i + 1}`, fixture(name)));
}

function markersOf(body, cls) {
  assert.ok(Array.isArray(body.markers), 'markers is an array');
  return body.markers.filter((m) => m.class === cls);
}

function findMarker(body, cls, pattern) {
  return markersOf(body, cls).find((m) => typeof m.marker === 'string' && pattern.test(m.marker));
}

function sameSet(actual, expected) {
  assert.deepEqual([...actual].sort(), [...expected].sort());
}

function firstWords(source, n) {
  return source.split(/\s+/).filter(Boolean).slice(0, n).join(' ') + '\n';
}

// Profiles reused by many tests are computed once, lazily.
let marenProfile;
function maren() {
  if (!marenProfile) marenProfile = profileOf(marenEntries());
  return marenProfile;
}

let daleProfile;
function dale() {
  if (!daleProfile) daleProfile = profileOf(daleEntries());
  return daleProfile;
}

describe('help', () => {
  for (const args of [['help'], ['--help']]) {
    it(`${args[0]} exits 0 with usage on stdout and installs nothing`, () => {
      const result = run(args);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stderr, '');
      assert.match(result.stdout, /profile/);
      assert.match(result.stdout, /check/);
      assert.match(result.stdout, /--samples/);
      assert.match(result.stdout, /--draft/);
      assert.match(result.stdout, /--profile/);
      assert.equal(existsSync(join(ROOT, 'node_modules')), false);
    });
  }
});

describe('refusals of the command line', () => {
  it('refuses an unknown command', () => {
    refused(['dance']);
  });

  it('refuses an unknown flag by name, on either command', () => {
    withDir({ 'samples.json': marenEntries() }, (dir) => {
      refused(['profile', '--samples', join(dir, 'samples.json'), '--frobnicate'], /--frobnicate/);
    });
    refused(['check', '--draft', fixture('maren-a1.txt'), '--wibble', 'x'], /--wibble/);
  });

  it('refuses --install by name', () => {
    withDir({ 'samples.json': marenEntries() }, (dir) => {
      refused(['profile', '--samples', join(dir, 'samples.json'), '--install'], /--install/);
    });
    refused(['--install'], /--install/);
  });

  it('refuses a relative path', () => {
    refused(['profile', '--samples', 'samples.json']);
    withDir({ 'profile.json': { status: 'enough', markers: [] } }, (dir) => {
      refused(['check', '--draft', 'draft.txt', '--profile', join(dir, 'profile.json')]);
    });
  });

  it('refuses a missing file', () => {
    refused(['profile', '--samples', join(tmpdir(), 'voice-lexicon-no-such-samples.json')]);
    withDir({ 'samples.json': [entry('A1', fixture('maren-a1.txt')), entry('A2', join(tmpdir(), 'voice-lexicon-no-such-sample.txt'))] }, (dir) => {
      refused(['profile', '--samples', join(dir, 'samples.json')]);
    });
    withDir({ 'draft.txt': text('maren-a1.txt') }, (dir) => {
      refused(['check', '--draft', join(dir, 'draft.txt'), '--profile', join(dir, 'no-such-profile.json')]);
    });
  });

  it('refuses a sample entry whose path is relative', () => {
    withDir({ 'samples.json': [entry('A1', fixture('maren-a1.txt')), entry('A2', 'maren-a2.txt')] }, (dir) => {
      refused(['profile', '--samples', join(dir, 'samples.json')]);
    });
  });
});

describe('refusals of the samples file', () => {
  const cases = {
    'not an array': { id: 'A1', path: '/x' },
    'not JSON at all': 'this is not json',
    'an entry missing id': [{ path: fixture('maren-a1.txt'), register: 'governing', origin: 'own' }, entry('A2', fixture('maren-a2.txt'))],
    'an entry missing path': [{ id: 'A1', register: 'governing', origin: 'own' }, entry('A2', fixture('maren-a2.txt'))],
    'a register outside its set': [entry('A1', fixture('maren-a1.txt'), 'primary'), entry('A2', fixture('maren-a2.txt'))],
    'an origin outside its set': [entry('A1', fixture('maren-a1.txt'), 'governing', 'ghostwritten'), entry('A2', fixture('maren-a2.txt'))],
    'a duplicate id': [entry('A1', fixture('maren-a1.txt')), entry('A1', fixture('maren-a2.txt'))]
  };
  for (const [label, content] of Object.entries(cases)) {
    it(`refuses ${label}`, () => {
      withDir({ 'samples.json': content }, (dir) => {
        refused(['profile', '--samples', join(dir, 'samples.json')]);
      });
    });
  }
});

describe('profile --output', () => {
  it('refuses an output path inside the tool directory and writes nothing there', () => {
    const inside = join(ROOT, 'voice-lexicon-test-output.json');
    try {
      withDir({ 'samples.json': marenEntries() }, (dir) => {
        refused(['profile', '--samples', join(dir, 'samples.json'), '--output', inside]);
      });
      assert.equal(existsSync(inside), false);
    } finally {
      rmSync(inside, { force: true });
    }
  });

  it('writes the profile to a temp path and reports it as written', () => {
    withDir({ 'samples.json': marenEntries() }, (dir) => {
      const out = join(dir, 'profile.json');
      const body = ok(['profile', '--samples', join(dir, 'samples.json'), '--output', out]);
      assert.deepEqual(Object.keys(body), ['written']);
      assert.equal(realpathSync(body.written), realpathSync(out));
      const written = JSON.parse(readFileSync(out, 'utf8'));
      assert.equal(written.status, 'enough');
      assert.equal(written.samples, 3);
      assert.ok(Array.isArray(written.markers));
      assert.ok(written.markers.length > 0);
    });
  });
});

describe('profile sufficiency', () => {
  it('one sample is too little text, with no markers', () => {
    const body = profileOf([entry('A1', fixture('maren-a1.txt'))]);
    assert.equal(body.status, 'too-little-text');
    assert.deepEqual(body.markers, []);
    assert.equal(body.samples, 1);
    assert.ok(body.words > 1000, `words ${body.words}`);
    assert.equal(body.registers, 1);
    assert.equal(body.origins, 1);
  });

  it('two samples under 1500 words in total are too little text', () => {
    withDir({
      's1.txt': firstWords(text('dale-c1.txt'), 300),
      's2.txt': firstWords(text('dale-c2.txt'), 300)
    }, (dir) => {
      const body = profileOf([entry('S1', join(dir, 's1.txt')), entry('S2', join(dir, 's2.txt'))]);
      assert.equal(body.status, 'too-little-text');
      assert.deepEqual(body.markers, []);
      assert.equal(body.samples, 2);
      assert.ok(body.words > 0 && body.words < 1500, `words ${body.words}`);
    });
  });

  it('1500 to 2999 words is thin', () => {
    const body = profileOf(daleEntries().slice(0, 2));
    assert.equal(body.status, 'thin');
    assert.equal(body.samples, 2);
    assert.ok(body.words >= 1500 && body.words < 3000, `words ${body.words}`);
    assert.ok(Array.isArray(body.markers));
  });

  it('3000 words or more is enough, with words, samples, registers and origins reported', () => {
    const body = maren();
    assert.equal(body.status, 'enough');
    assert.ok(body.words >= 3000, `words ${body.words}`);
    assert.equal(body.samples, 3);
    assert.equal(body.registers, 1);
    assert.equal(body.origins, 1);
  });
});

describe('profile markers', () => {
  it('every marker has the shared fields and meets the consistency rule', () => {
    const body = maren();
    assert.ok(body.markers.length > 0);
    const ids = new Set(['A1', 'A2', 'A3']);
    for (const m of body.markers) {
      assert.ok(['signature', 'variant', 'punctuation', 'idiom'].includes(m.class), `class ${m.class}`);
      assert.equal(typeof m.marker, 'string');
      assert.equal(typeof m.count, 'number');
      assert.equal(typeof m.spread, 'number');
      assert.equal(typeof m.weight, 'number');
      assert.ok(Array.isArray(m.samples));
      assert.ok(m.samples.length >= 2, `${m.marker} in ${m.samples.length} samples`);
      for (const id of m.samples) assert.ok(ids.has(id), `unknown sample id ${id}`);
      assert.ok(m.count >= (['signature', 'variant'].includes(m.class) ? 3 : 2), `${m.marker} count ${m.count}`);
    }
    assert.ok(markersOf(body, 'signature').length <= 15);
    for (const m of markersOf(body, 'signature')) {
      assert.ok(['uncommon-word', 'habit-phrase'].includes(m.basis), `${m.marker} basis ${m.basis}`);
    }
  });

  it('reports the engineered signature phrase with its samples, count, spread and weight', () => {
    const body = maren();
    const upshot = findMarker(body, 'signature', /^upshot$/);
    assert.ok(upshot, `no signature marker for "the upshot" in ${JSON.stringify(body.markers)}`);
    sameSet(upshot.samples, ['A1', 'A2', 'A3']);
    assert.ok(upshot.count >= 3, `count ${upshot.count}`);
    assert.equal(upshot.spread, 1);
    assert.equal(upshot.weight, 1);
    assert.equal(upshot.basis, 'uncommon-word');

    const kerfuffle = findMarker(body, 'signature', /^kerfuffle$/);
    assert.ok(kerfuffle, 'no signature marker for kerfuffle');
    sameSet(kerfuffle.samples, ['A1', 'A2', 'A3']);
    assert.ok(kerfuffle.count >= 3);
  });

  it('reports a habit phrase of common words found in every sample', () => {
    const body = maren();
    const m = markersOf(body, 'signature').find((x) => x.marker === 'in practice');
    assert.ok(m, `no signature marker for "in practice" in ${JSON.stringify(markersOf(body, 'signature'))}`);
    assert.equal(m.basis, 'habit-phrase');
    sameSet(m.samples, ['A1', 'A2', 'A3']);
    assert.ok(m.count >= 5, `count ${m.count}`);
  });

  it('does not report an everyday phrase used in only one sample', () => {
    const insert = [
      '',
      'On the whole the night shift ran well. On the whole the rota held, and on the whole the trucks',
      'left on time, though on the whole I would still move the benches.',
      ''
    ].join('\n');
    withDir({ 'a1.txt': text('maren-a1.txt') + insert }, (dir) => {
      const body = profileOf([
        entry('A1', join(dir, 'a1.txt')),
        entry('A2', fixture('maren-a2.txt')),
        entry('A3', fixture('maren-a3.txt'))
      ]);
      assert.equal(body.status, 'enough');
      const control = markersOf(body, 'signature').find((x) => x.marker === 'in practice');
      assert.ok(control, 'positive control: in practice is reported');
      assert.equal(control.basis, 'habit-phrase');
      assert.equal(body.markers.some((m) => /on the whole|the whole/.test(m.marker)), false);
    });
  });

  it('does not report a term that appears in only one sample', () => {
    const body = maren();
    assert.ok(findMarker(body, 'signature', /^upshot$/), 'positive control: the upshot is reported');
    assert.equal(body.markers.some((m) => /zeitgeist/.test(m.marker)), false);
  });

  it('reports variant preferences with their other form and share', () => {
    const body = maren();
    for (const [preferred, over, minimum] of [['towards', 'toward', 6], ['whilst', 'while', 6], ['analyse', 'analyze', 6]]) {
      const m = markersOf(body, 'variant').find((x) => x.marker === preferred);
      assert.ok(m, `no variant marker for ${preferred} in ${JSON.stringify(markersOf(body, 'variant'))}`);
      assert.equal(m.over, over);
      assert.ok(m.share >= 0.8, `${preferred} share ${m.share}`);
      assert.ok(m.count >= minimum, `${preferred} count ${m.count}`);
      sameSet(m.samples, ['A1', 'A2', 'A3']);
    }
  });

  it('reports a semicolon habit at a rate above its reference', () => {
    const body = maren();
    const m = markersOf(body, 'punctuation').find((x) => x.marker === 'semicolon');
    assert.ok(m, `no semicolon marker in ${JSON.stringify(markersOf(body, 'punctuation'))}`);
    assert.equal(typeof m.rate, 'number');
    assert.equal(typeof m.reference, 'number');
    assert.ok(m.rate > m.reference, `rate ${m.rate} reference ${m.reference}`);
    assert.ok(m.rate >= 2 * m.reference, 'reported only at double the reference or more');
    assert.ok(m.count >= 30, `count ${m.count}`);
    sameSet(m.samples, ['A1', 'A2', 'A3']);
  });

  it('reports the altered cake idiom with its usual form', () => {
    const body = maren();
    const m = findMarker(body, 'idiom', /eat your cake and have it/);
    assert.ok(m, `no idiom marker in ${JSON.stringify(markersOf(body, 'idiom'))}`);
    assert.match(m.usual, /have your cake and eat it/);
    assert.ok(m.count >= 2);
    assert.ok(m.samples.length >= 2);
  });

  it('weights a marker found only in other or model-assisted samples below 1', () => {
    const skein = '\nWe pulled the skein of loose ends together, and the skein held better than we feared.\n';
    withDir({
      'w2.txt': text('dale-c2.txt') + skein,
      'w3.txt': text('dale-c3.txt') + skein
    }, (dir) => {
      const body = profileOf([
        entry('W1', fixture('dale-c1.txt'), 'governing', 'own'),
        entry('W2', join(dir, 'w2.txt'), 'other', 'own'),
        entry('W3', join(dir, 'w3.txt'), 'governing', 'model-assisted')
      ]);
      assert.equal(body.status, 'enough');
      assert.equal(body.registers, 2);
      assert.equal(body.origins, 2);
      const m = findMarker(body, 'signature', /^skein$/);
      assert.ok(m, `no signature marker for skein in ${JSON.stringify(markersOf(body, 'signature'))}`);
      sameSet(m.samples, ['W2', 'W3']);
      assert.ok(m.weight < 1, `weight ${m.weight}`);
      assert.ok(m.weight > 0);
    });
  });

  it('finds none of the engineered markers in the control writer', () => {
    const body = dale();
    assert.equal(body.status, 'enough');
    assert.equal(body.samples, 3);
    assert.ok(Array.isArray(body.markers));
    assert.equal(markersOf(body, 'signature').some((m) => /upshot|kerfuffle|practice|zeitgeist/.test(m.marker)), false);
    assert.deepEqual(markersOf(body, 'idiom'), []);
    assert.equal(markersOf(body, 'variant').some((m) => ['towards', 'whilst', 'analyse'].includes(m.marker)), false);
    assert.equal(markersOf(body, 'punctuation').some((m) => m.marker === 'semicolon' && m.rate > m.reference), false);
  });

  it('does not report a preference for the ordinary form of a spelling pair', () => {
    // The control writer uses toward, while and analyze every time, at least 3 times each.
    const body = dale();
    assert.equal(body.status, 'enough');
    const variants = markersOf(body, 'variant');
    for (const ordinary of ['toward', 'while', 'analyze']) {
      assert.equal(variants.some((m) => m.marker === ordinary), false, `${ordinary} reported: ${JSON.stringify(variants)}`);
    }
  });

  it('does not report a saying used in its usual form', () => {
    const insert = [
      '',
      "As my grandmother liked to say, you can't have your cake and eat it too.",
      '',
      'There was a brouhaha about parking, and then a second brouhaha about the first one.',
      ''
    ].join('\n');
    withDir({
      'u1.txt': text('dale-c1.txt') + insert,
      'u2.txt': text('dale-c2.txt') + insert,
      'u3.txt': text('dale-c3.txt') + insert
    }, (dir) => {
      const body = profileOf([
        entry('U1', join(dir, 'u1.txt')),
        entry('U2', join(dir, 'u2.txt')),
        entry('U3', join(dir, 'u3.txt'))
      ]);
      assert.equal(body.status, 'enough');
      assert.ok(findMarker(body, 'signature', /^brouhaha$/), 'positive control: brouhaha is reported');
      assert.deepEqual(markersOf(body, 'idiom'), []);
    });
  });
});

describe('profile text handling', () => {
  it('drops quoted-mail lines and long quotations but keeps the writer\'s own words', () => {
    const insert = [
      '',
      '> The flibbertigibbet in accounts says the flibbertigibbet report is late again.',
      '',
      'Our arborist once told us, "quixotry is planting a tree you will never sit under, and we chose that quixotry anyway." We laughed about it for weeks.',
      '',
      'There was a brouhaha about parking, and then a second brouhaha about the first one.',
      ''
    ].join('\n');
    withDir({
      'q1.txt': text('dale-c1.txt') + insert,
      'q2.txt': text('dale-c2.txt') + insert,
      'q3.txt': text('dale-c3.txt') + insert
    }, (dir) => {
      const body = profileOf([
        entry('Q1', join(dir, 'q1.txt')),
        entry('Q2', join(dir, 'q2.txt')),
        entry('Q3', join(dir, 'q3.txt'))
      ]);
      assert.equal(body.status, 'enough');
      const control = findMarker(body, 'signature', /^brouhaha$/);
      assert.ok(control, 'positive control: brouhaha, outside quotes, is reported');
      sameSet(control.samples, ['Q1', 'Q2', 'Q3']);
      assert.equal(body.markers.some((m) => /flibbertigibbet/.test(m.marker)), false);
      assert.equal(body.markers.some((m) => /quixotry/.test(m.marker)), false);
    });
  });
});

// A profile written by hand in the shared spec's shape, so check is tested on its own.
const PROFILE = {
  status: 'enough',
  words: 3660,
  samples: 3,
  registers: 1,
  origins: 1,
  markers: [
    { class: 'signature', marker: 'the upshot', basis: 'uncommon-word', count: 9, samples: ['A1', 'A2', 'A3'], spread: 1, weight: 1 },
    { class: 'signature', marker: 'kerfuffle', basis: 'uncommon-word', count: 6, samples: ['A1', 'A2', 'A3'], spread: 1, weight: 1 },
    { class: 'variant', marker: 'towards', over: 'toward', share: 1, count: 7, samples: ['A1', 'A2', 'A3'], spread: 1, weight: 1 },
    { class: 'variant', marker: 'whilst', over: 'while', share: 1, count: 6, samples: ['A1', 'A2', 'A3'], spread: 1, weight: 1 },
    { class: 'punctuation', marker: 'semicolon', rate: 11.48, reference: 2, count: 42, samples: ['A1', 'A2', 'A3'], spread: 1, weight: 1 },
    { class: 'idiom', marker: "you can't eat your cake and have it too", usual: "you can't have your cake and eat it too", count: 3, samples: ['A1', 'A2', 'A3'], spread: 1, weight: 1 }
  ]
};

const THIN_PROFILE = {
  status: 'thin',
  words: 2000,
  samples: 2,
  registers: 1,
  origins: 1,
  markers: [
    { class: 'signature', marker: 'the upshot', basis: 'uncommon-word', count: 4, samples: ['A1', 'A2'], spread: 1, weight: 1 }
  ]
};

// About 120 words; uses "towards" once, no signature marker, no avoided term.
const DRAFT_PASS = `The team met on Monday to review the plan for the new loading bay. We agreed to move the
slow stock towards the back wall and to keep the fast lines near the packing benches. Nobody
expects the change to be finished in a week. The shift leads will walk the aisles each morning
and note anything that looks out of place. We will meet again on Friday to compare notes and
decide what to move next. If the queue at the benches is still long by then, we will add a
second packer in the afternoon. The aim is a quieter floor before the busy season begins, with
less walking for everyone and fewer questions about where stock really lives.
`;

// About 150 words; "the upshot" four times, more than once per 75 words.
const DRAFT_OVERUSE = `The upshot of the review is simple. The fast lines sit too far from the benches, and the
pickers walk too much. The upshot of all that walking is a slower shift and a longer queue in
the afternoon. We looked at the numbers for the last quarter and found the same story in every
week of it. The upshot is that the layout, not the people, is the problem we should fix first.
We will move the top movers over a weekend, give the slotting rules a named owner, and staff
the packing benches to the afternoon peak rather than the daily average. None of this needs
new software or a large budget. It needs a plan, a weekend and a few pallet trucks. The upshot
is a calmer floor, shorter routes, and a team that can see its own effort turn into output once
again, which is what everyone on the site has been asking for.
`;

// About 100 words; "toward" twice and never "towards" or "while".
const DRAFT_CONTRADICTED = `The board asked for a short note on the yard. Lorries now arrive toward the end of the day,
and the team is stretched thin by then. We propose a booking sheet so that deliveries spread
across the morning and the afternoon. Suppliers have been helpful and several already prefer
early slots. We will review the first month of bookings and report back. The goal is to move
toward a yard that is never empty in the morning and never jammed after lunch, with the gate
team able to plan its work around the bookings rather than around surprises.
`;

// About 100 words; no class 1 or class 2 marker in either form.
const DRAFT_PLAIN = `The board asked for a short note on the yard. Lorries now arrive late in the day, and the team
is stretched thin by then. We propose a booking sheet so that deliveries spread across the
morning and the afternoon. Suppliers have been helpful and several already prefer early slots.
We will review the first month of bookings and report back. The goal is a yard that is never
empty in the morning and never jammed after lunch, with the gate team able to plan its work
around the bookings rather than around surprises that nobody saw coming.
`;

// About 100 words; "basically" twice and "leverage" once, with "towards" so missing stays false.
const DRAFT_AVOIDED = `The plan is basically the same as last month. We want to leverage the quiet mornings to clear
the returns cage, and we want to move the slow stock towards the back wall. The shift leads
will check the bays each day and log anything that looks wrong. Basically, the floor should be
calmer by the end of the month, with less walking for the pickers and a shorter queue at the
benches. We will meet on Friday to see how far we got and what is left to do before the busy
season begins in earnest, and to agree who owns each of the remaining tasks.
`;

function checkWith(files, args) {
  return withDir({ 'profile.json': PROFILE, 'thin-profile.json': THIN_PROFILE, ...files }, (dir) =>
    ok(['check', ...args(dir)]));
}

describe('check', () => {
  it('a draft under 50 words is too little text', () => {
    const body = checkWith({ 'draft.txt': 'The upshot is that we move the stock towards the back wall on Friday.\n' }, (dir) =>
      ['--draft', join(dir, 'draft.txt'), '--profile', join(dir, 'profile.json')]);
    assert.equal(body.status, 'too-little-text');
    assert.ok(body.words < 50);
  });

  it('passes a draft that keeps the voice and uses nothing it should not', () => {
    const body = checkWith({ 'draft.txt': DRAFT_PASS, 'avoid.txt': 'basically\nleverage\n' }, (dir) =>
      ['--draft', join(dir, 'draft.txt'), '--profile', join(dir, 'profile.json'), '--avoid', join(dir, 'avoid.txt')]);
    assert.equal(body.status, 'checked');
    assert.ok(body.words >= 50, `words ${body.words}`);
    assert.deepEqual(body.avoided, []);
    assert.deepEqual(body.overuse, []);
    assert.deepEqual(body.contradicted, []);
    assert.equal(body.missing, false);
    assert.equal(body.pass, true);
  });

  it('counts avoided terms from the --avoid file', () => {
    const body = checkWith({ 'draft.txt': DRAFT_AVOIDED, 'avoid.txt': 'basically\nleverage\nsynergy\n' }, (dir) =>
      ['--draft', join(dir, 'draft.txt'), '--profile', join(dir, 'profile.json'), '--avoid', join(dir, 'avoid.txt')]);
    assert.equal(body.status, 'checked');
    const basically = body.avoided.find((a) => a.term === 'basically');
    const leverage = body.avoided.find((a) => a.term === 'leverage');
    assert.ok(basically, JSON.stringify(body.avoided));
    assert.equal(basically.count, 2);
    assert.ok(leverage, JSON.stringify(body.avoided));
    assert.equal(leverage.count, 1);
    assert.equal(body.avoided.some((a) => a.term === 'synergy' && a.count > 0), false);
    assert.equal(body.missing, false);
    assert.notEqual(body.pass, true);
  });

  it('reports overuse when a signature phrase repeats more than once per 75 words', () => {
    const body = checkWith({ 'draft.txt': DRAFT_OVERUSE }, (dir) =>
      ['--draft', join(dir, 'draft.txt'), '--profile', join(dir, 'profile.json')]);
    assert.equal(body.status, 'checked');
    const m = body.overuse.find((o) => o.marker === 'the upshot');
    assert.ok(m, JSON.stringify(body.overuse));
    assert.equal(m.count, 4);
    assert.equal(body.missing, false);
    assert.notEqual(body.pass, true);
  });

  it('reports a variant preference used the other way as contradicted', () => {
    const body = checkWith({ 'draft.txt': DRAFT_CONTRADICTED }, (dir) =>
      ['--draft', join(dir, 'draft.txt'), '--profile', join(dir, 'profile.json')]);
    assert.equal(body.status, 'checked');
    const m = body.contradicted.find((c) => c.marker === 'towards');
    assert.ok(m, JSON.stringify(body.contradicted));
    assert.equal(m.used, 'toward');
    assert.equal(m.count, 2);
    assert.notEqual(body.pass, true);
  });

  it('reports missing when the draft has no class 1 or 2 marker and the profile has at least 3', () => {
    const body = checkWith({ 'draft.txt': DRAFT_PLAIN }, (dir) =>
      ['--draft', join(dir, 'draft.txt'), '--profile', join(dir, 'profile.json')]);
    assert.equal(body.status, 'checked');
    assert.deepEqual(body.avoided, []);
    assert.deepEqual(body.overuse, []);
    assert.deepEqual(body.contradicted, []);
    assert.equal(body.missing, true);
    assert.notEqual(body.pass, true);
  });

  it('does not report missing when the profile has fewer than 3 class 1 or 2 markers', () => {
    const body = checkWith({ 'draft.txt': DRAFT_PLAIN }, (dir) =>
      ['--draft', join(dir, 'draft.txt'), '--profile', join(dir, 'thin-profile.json')]);
    assert.equal(body.status, 'checked');
    assert.equal(body.missing, false);
    assert.equal(body.pass, true);
  });

  it('checks a draft against a profile the tool wrote itself', () => {
    withDir({ 'samples.json': marenEntries(), 'draft.txt': DRAFT_CONTRADICTED }, (dir) => {
      const out = join(dir, 'profile.json');
      ok(['profile', '--samples', join(dir, 'samples.json'), '--output', out]);
      const body = ok(['check', '--draft', join(dir, 'draft.txt'), '--profile', out]);
      assert.equal(body.status, 'checked');
      assert.ok(body.contradicted.some((c) => c.marker === 'towards' && c.used === 'toward'));
      assert.notEqual(body.pass, true);
    });
  });
});

// ---------------------------------------------------------------------------
// Revision 4 (review corrections). Each test pins one rule of graph.md Revision 4.
// ---------------------------------------------------------------------------

// Writes each { id: content } to a temp dir and profiles them as governing/own samples.
function profileTexts(texts, extra = []) {
  const files = {};
  for (const [id, content] of Object.entries(texts)) files[`${id}.txt`] = content;
  return withDir(files, (dir) => {
    const entries = Object.keys(texts).map((id) => entry(id, join(dir, `${id}.txt`)));
    writeFileSync(join(dir, 'samples.json'), JSON.stringify(entries));
    return ok(['profile', '--samples', join(dir, 'samples.json'), ...extra]);
  });
}

const BROUHAHA = '\nThere was a brouhaha about parking, and then a second brouhaha about the first one.\n';

// Function words a class 1 phrase may not end in: articles, determiners, prepositions, conjunctions, "to".
const FUNCTION_WORDS = new Set([
  'a', 'an', 'the', 'this', 'that', 'these', 'those', 'my', 'our', 'your', 'his', 'her', 'their', 'its',
  'of', 'to', 'in', 'on', 'at', 'for', 'with', 'by', 'from', 'about', 'as', 'into', 'onto', 'upon',
  'over', 'under', 'between', 'through', 'and', 'or', 'but', 'nor'
]);

describe('revision 4: --output destination screen', () => {
  function refusedOutput(setup) {
    withDir({ 'samples.json': marenEntries() }, (dir) => {
      const out = setup(dir);
      refused(['profile', '--samples', join(dir, 'samples.json'), '--output', out], /--output/);
    });
  }

  it('refuses a dangling symbolic link and creates nothing at its target', () => {
    withDir({ 'samples.json': marenEntries() }, (dir) => {
      const target = join(dir, 'nowhere.json');
      const link = join(dir, 'link.json');
      symlinkSync(target, link);
      refused(['profile', '--samples', join(dir, 'samples.json'), '--output', link], /--output/);
      assert.equal(existsSync(target), false);
    });
  });

  it('refuses a symbolic link to an existing file and leaves the file as it was', () => {
    withDir({ 'samples.json': marenEntries(), 'keep.json': 'keep' }, (dir) => {
      const link = join(dir, 'link.json');
      symlinkSync(join(dir, 'keep.json'), link);
      refused(['profile', '--samples', join(dir, 'samples.json'), '--output', link], /--output/);
      assert.equal(readFileSync(join(dir, 'keep.json'), 'utf8'), 'keep');
    });
  });

  it('refuses a file with more than one hard link and leaves it as it was', () => {
    withDir({ 'samples.json': marenEntries(), 'keep.json': 'keep' }, (dir) => {
      const second = join(dir, 'second.json');
      linkSync(join(dir, 'keep.json'), second);
      refused(['profile', '--samples', join(dir, 'samples.json'), '--output', second], /--output/);
      assert.equal(readFileSync(join(dir, 'keep.json'), 'utf8'), 'keep');
    });
  });

  it('refuses an existing directory', () => {
    refusedOutput((dir) => {
      mkdirSync(join(dir, 'out-dir'));
      return join(dir, 'out-dir');
    });
  });

  it('refuses /dev/null', () => {
    refusedOutput(() => '/dev/null');
  });
});

describe('revision 4: empty flag values', () => {
  it('refuses an empty value by the flag name, on every path flag', () => {
    withDir({
      'samples.json': marenEntries(),
      'profile.json': PROFILE,
      'draft.txt': DRAFT_PASS
    }, (dir) => {
      const samples = join(dir, 'samples.json');
      refused(['profile', '--samples', ''], /--samples/);
      refused(['profile', '--samples', samples, '--output', ''], /--output/);
      refused(['profile', '--samples', samples, '--baseline', ''], /--baseline/);
      refused(['check', '--draft', '', '--profile', join(dir, 'profile.json')], /--draft/);
      refused(['check', '--draft', join(dir, 'draft.txt'), '--profile', ''], /--profile/);
      refused(['check', '--draft', join(dir, 'draft.txt'), '--profile', join(dir, 'profile.json'), '--avoid', ''], /--avoid/);
    });
  });
});

describe('revision 4: class 1 phrases', () => {
  const extra = {
    A1: [
      'Half the delay was due to the yard. In order to fix it we moved the benches based on what the pickers said. The rest of the plan waits for spring.',
      'The waiting fee was due to late bookings. In order to stop it we wrote a sheet based on last month. The rest of the week went well.',
      'At the end of the shift we read the list of open jobs.'
    ],
    A2: [
      'The queue was due to staffing. In order to clear it we hired two packers based on the afternoon peak. The rest of the team stayed on days.',
      'The damage was due to careless loading. In order to protect the stock we added padding based on advice from the insurer. The rest of the money went on tools.',
      'By the end of May the list of fixes was short.'
    ],
    A3: [
      'Most waste was due to slow grading. In order to cut it we wrote rules based on returns data. The rest of the stock went back on sale.',
      'One delay was due to rain. In order to dry out the yard we laid gravel based on a quote from a builder. The rest of the job took a day.',
      'Near the end of term the list of returns grew again.'
    ]
  };

  function profileWithPhrases() {
    return profileTexts({
      A1: text('maren-a1.txt') + '\n' + extra.A1.join('\n') + '\n',
      A2: text('maren-a2.txt') + '\n' + extra.A2.join('\n') + '\n',
      A3: text('maren-a3.txt') + '\n' + extra.A3.join('\n') + '\n'
    });
  }

  it('reports no phrase that ends in a function word, and keeps "in practice"', () => {
    const body = profileWithPhrases();
    assert.equal(body.status, 'enough');
    const signature = markersOf(body, 'signature');
    const practice = signature.find((m) => m.marker === 'in practice');
    assert.ok(practice, `positive control: in practice is reported, in ${JSON.stringify(signature)}`);
    assert.equal(practice.basis, 'habit-phrase');
    for (const phrase of ['end of', 'list of', 'due to', 'in order to', 'in order', 'based on', 'rest of', 'order to']) {
      assert.equal(signature.some((m) => m.marker === phrase), false, `"${phrase}" reported`);
    }
    for (const m of signature) {
      const words = m.marker.split(/\s+/);
      if (words.length < 2) continue;
      assert.equal(FUNCTION_WORDS.has(words[words.length - 1]), false, `"${m.marker}" ends in a function word`);
      assert.equal(['a', 'an', 'the', 'this', 'that', 'these', 'those', 'my', 'our', 'your', 'his', 'her', 'their', 'its'].includes(words[0]), false, `"${m.marker}" starts with a determiner`);
    }
  });

  it('reports no function-word-ending phrase in the unmodified engineered writer either', () => {
    const signature = markersOf(maren(), 'signature');
    assert.ok(signature.some((m) => m.marker === 'in practice'), 'positive control: in practice is reported');
    assert.equal(signature.some((m) => m.marker === 'end of' || m.marker === 'list of'), false, JSON.stringify(signature));
  });

  it('reports an uncommon word alone where it stands for its phrase', () => {
    const body = profileTexts({
      B1: text('dale-c1.txt') + BROUHAHA,
      B2: text('dale-c2.txt') + BROUHAHA,
      B3: text('dale-c3.txt') + BROUHAHA
    });
    const signature = markersOf(body, 'signature');
    assert.ok(signature.some((m) => m.marker === 'brouhaha'), JSON.stringify(signature));
    assert.equal(signature.some((m) => m.marker !== 'brouhaha' && /brouhaha/.test(m.marker)), false, JSON.stringify(signature));
  });
});

describe('revision 4: markdown', () => {
  const links = [
    'Sign up on [the volunteer sheet](https://example.org/sheet) or read [last season notes](https://example.org/notes).',
    'The plan is on [the shared folder](https://example.org/folder) and [the library page](https://example.org/library).',
    'Photos are here ![the orchard in May](https://example.org/may.png) and here ![the new fence](https://example.org/fence.png).',
    'Directions are on [the map](https://example.org/map) and parking is on [the city site](https://example.org/parking).',
    'Questions go to [the steering group](https://example.org/group) or [the board](https://example.org/board).'
  ].join('\n');
  const code = [
    '```js',
    'const zorbitron = trees.filter((t) => t.alive); zorbitron.sort(); log(zorbitron);',
    'let total = 0; for (const t of zorbitron) { total += t.age; }',
    'report(zorbitron); save(zorbitron); print(total);',
    '```',
    '',
    'Run `zorbitron.check();` before `zorbitron.save();` each week.',
    '',
    '```',
    'zorbitron; zorbitron; zorbitron; (zorbitron) (zorbitron) (zorbitron)',
    '```'
  ].join('\n');
  const insert = `\n${links}\n\n${code}\n`;

  it('reads links as their text and drops code, so neither makes a punctuation or signature marker', () => {
    const body = profileTexts({
      M1: text('dale-c1.txt') + insert,
      M2: text('dale-c2.txt') + insert,
      M3: text('dale-c3.txt') + insert
    });
    assert.equal(body.status, 'enough');
    assert.ok(findMarker(body, 'signature', /^orchard$/), 'positive control: orchard is reported');
    const punctuation = markersOf(body, 'punctuation');
    // The control writer uses no semicolon, parenthesis or exclamation mark of its own.
    assert.equal(punctuation.some((m) => /semicolon|paren|exclamation/.test(m.marker)), false, JSON.stringify(punctuation));
    assert.equal(body.markers.some((m) => /zorbitron|const|filter|example|https/.test(m.marker)), false, JSON.stringify(body.markers));
  });
});

describe('revision 4: sayings', () => {
  const usual = [
    'Honestly the ball is in their court now.',
    'We cannot have our cake and eat it here.',
    'As they say the early bird gets the worm.',
    'By Friday the cat is out of the bag.'
  ].join('\n');
  const twisted = "\nYou can't eat your cake and have it too.\n";

  it('does not report pronoun-slot or accepted forms, and still reports the twisted cake form', () => {
    const body = profileTexts({
      U1: text('dale-c1.txt') + '\n' + usual + twisted,
      U2: text('dale-c2.txt') + '\n' + usual + '\n',
      U3: text('dale-c3.txt') + '\n' + usual + twisted
    });
    assert.equal(body.status, 'enough');
    const idioms = markersOf(body, 'idiom');
    assert.equal(idioms.length, 1, JSON.stringify(idioms));
    assert.match(idioms[0].marker, /eat your cake and have it/);
    sameSet(idioms[0].samples, ['U1', 'U3']);
    assert.equal(idioms[0].count, 2);
  });
});

describe('revision 4: unicode', () => {
  it('normalizes decomposed text to NFC and keeps combining marks inside words', () => {
    const nfc = 'résumé';
    const line = `\nHer ${nfc} was thin, but the ${nfc} she sent next was better.\n`.normalize('NFD');
    assert.notEqual(line, line.normalize('NFC'), 'the inserted line really is decomposed');
    const body = profileTexts({
      N1: text('dale-c1.txt') + line,
      N2: text('dale-c2.txt') + line,
      N3: text('dale-c3.txt') + line
    });
    const signature = markersOf(body, 'signature');
    const m = signature.find((x) => x.marker === nfc);
    assert.ok(m, `no NFC résumé marker in ${JSON.stringify(signature)}`);
    assert.equal(m.basis, 'uncommon-word');
    assert.equal(m.count, 6);
    assert.equal(body.markers.some((x) => x.marker !== nfc && /sum|́/.test(x.marker)), false, JSON.stringify(body.markers));
  });
});

describe('revision 4: avoid terms', () => {
  const draft = `We now run the yard 24/7 and the cover is basically sound. Plan C is the fallback if the
second packer cannot start in time. Running 24/7 costs more than we hoped but the queue at the
benches is gone and the pickers walk far less than they did. We will review the rota towards the
end of the month and report back to the board with the figures.
`;

  it('matches terms with symbols literally and splits a CR-only avoid file into separate terms', () => {
    const body = checkWith({ 'draft.txt': draft, 'avoid.txt': '24/7\rC++\rbasically\r' }, (dir) =>
      ['--draft', join(dir, 'draft.txt'), '--profile', join(dir, 'profile.json'), '--avoid', join(dir, 'avoid.txt')]);
    assert.equal(body.status, 'checked');
    const allDay = body.avoided.find((a) => a.term === '24/7');
    assert.ok(allDay, JSON.stringify(body.avoided));
    assert.equal(allDay.count, 2);
    const basically = body.avoided.find((a) => a.term === 'basically');
    assert.ok(basically, JSON.stringify(body.avoided));
    assert.equal(basically.count, 1);
    assert.equal(body.avoided.some((a) => a.term === 'C++' && a.count > 0), false, JSON.stringify(body.avoided));
    assert.equal(body.avoided.some((a) => /\r|\n/.test(a.term)), false);
  });
});

describe('revision 4: contraction pairs', () => {
  const CONTRACTION_FORMS = new Set([
    "don't", 'do not', "it's", 'it is', "can't", 'cannot', "won't", 'will not', "i'm", 'i am',
    "we're", 'we are', "they're", 'they are', "isn't", 'is not', "doesn't", 'does not',
    "that's", 'that is', "there's", 'there is', "you're", 'you are', "wouldn't", 'would not',
    "shouldn't", 'should not', "couldn't", 'could not', 'let us', "let's", 'i have', "i've"
  ]);

  it('reports one full-forms marker with a pairs breakdown and no per-pair markers', () => {
    const variants = markersOf(maren(), 'variant');
    const full = variants.find((m) => m.marker === 'full forms');
    assert.ok(full, JSON.stringify(variants));
    assert.equal(full.over, 'contractions');
    assert.ok(full.share >= 0.8, `share ${full.share}`);
    assert.ok(full.count >= 5, `count ${full.count}`);
    assert.ok(full.pairs && typeof full.pairs === 'object', 'pairs breakdown present');
    assert.ok(Object.keys(full.pairs).length >= 2, JSON.stringify(full.pairs));
    assert.equal(variants.some((m) => CONTRACTION_FORMS.has(m.marker) || CONTRACTION_FORMS.has(m.over)), false, JSON.stringify(variants));
  });

  it('does not make "let us know" a variant', () => {
    const letUs = '\nPlease let us know by Friday. If you cannot come, let us know and we will save you a tree.\n';
    const body = profileTexts({
      L1: text('dale-c1.txt') + letUs,
      L2: text('dale-c2.txt') + letUs,
      L3: text('dale-c3.txt') + letUs
    });
    assert.equal(body.status, 'enough');
    const variants = markersOf(body, 'variant');
    assert.ok(variants.length > 0, 'positive control: the control writer has some variant marker');
    assert.equal(variants.some((m) => /let us|let's|i have|i've/.test(`${m.marker} ${m.over}`)), false, JSON.stringify(variants));
  });

  const FULL_PROFILE = {
    status: 'enough',
    words: 3660,
    samples: 3,
    registers: 1,
    origins: 1,
    markers: [
      { class: 'variant', marker: 'full forms', over: 'contractions', share: 0.95, count: 40, pairs: { 'it is': 14, 'they are': 7, 'is not': 5 }, samples: ['A1', 'A2', 'A3'], spread: 1, weight: 1 }
    ]
  };

  const CONTRACTED = `We don't expect the fence to be finished before May, and it's fine if the shed waits too.
We're still short of posts, and the supplier can't deliver until the second week. That's the
honest picture. The volunteers have been patient and the trees are dormant, so nothing is lost by
waiting a little longer for the right materials and a dry weekend to put them in.
`;

  const UNCONTRACTED = `We do not expect the fence to be finished before May, and it is fine if the shed waits too.
We are still short of posts, and the supplier cannot deliver until the second week. That is the
honest picture. The volunteers have been patient and the trees are dormant, so nothing is lost by
waiting a little longer for the right materials and a dry weekend to put them in.
`;

  it('check reports contractions used against a full-forms preference as contradicted', () => {
    const body = withDir({ 'profile.json': FULL_PROFILE, 'draft.txt': CONTRACTED }, (dir) =>
      ok(['check', '--draft', join(dir, 'draft.txt'), '--profile', join(dir, 'profile.json')]));
    assert.equal(body.status, 'checked');
    const m = body.contradicted.find((c) => c.marker === 'full forms');
    assert.ok(m, JSON.stringify(body.contradicted));
    assert.ok(m.count >= 3, `count ${m.count}`);
    assert.notEqual(body.pass, true);
  });

  it('check passes full forms against a full-forms preference', () => {
    const body = withDir({ 'profile.json': FULL_PROFILE, 'draft.txt': UNCONTRACTED }, (dir) =>
      ok(['check', '--draft', join(dir, 'draft.txt'), '--profile', join(dir, 'profile.json')]));
    assert.equal(body.status, 'checked');
    assert.deepEqual(body.contradicted, []);
    assert.equal(body.pass, true);
  });

  it('a profile the tool wrote flags contractions in a draft', () => {
    withDir({ 'samples.json': marenEntries(), 'draft.txt': CONTRACTED }, (dir) => {
      const out = join(dir, 'profile.json');
      ok(['profile', '--samples', join(dir, 'samples.json'), '--output', out]);
      const body = ok(['check', '--draft', join(dir, 'draft.txt'), '--profile', out]);
      assert.ok(body.contradicted.some((c) => c.marker === 'full forms'), JSON.stringify(body.contradicted));
    });
  });
});

describe('revision 4: serial comma', () => {
  // The control writer with every comma removed, so the only commas are the ones inserted.
  const bare = (name) => text(name).replace(/,/g, '');
  const parenthetical = [
    'That is fine, I am told, and the trees will cope with the cold well enough.',
    'The fence, we hope, and the shed will both be finished long before the first spring work day.',
    'Our steering group, as usual, and a few neighbors met again on Tuesday evening at the library.',
    'The soil, they said, and the drainage were the two things to fix before anything else this year.',
    'The deer, of course, and the rabbits found the young trees within a week of the planting.',
    'The grant, frankly, and the cider evening paid for nearly everything we bought last season.',
    'Our arborist, bless her, and two of her friends pruned every tree in a single long morning.',
    'The library, to its credit, and the city both answered our letters within a few days.'
  ].join('\n');
  const lists = [
    'We planted apples, pears, and plums.',
    'Bring gloves, rakes, and a hat.',
    'We need wire, posts, and staples.',
    'The shed needs wood, nails, and paint.',
    'Volunteers brought soup, bread, and cider.',
    'We saw deer, rabbits, or voles most nights.',
    'The border has asters, daisies, and mint.',
    'The fund pays for soil, trees, and fencing.'
  ].join('\n');

  it('does not count parenthetical clauses closed by ", and"', () => {
    const body = profileTexts({
      P1: bare('dale-c1.txt') + '\n' + parenthetical + '\n',
      P2: bare('dale-c2.txt') + '\n' + parenthetical + '\n',
      P3: bare('dale-c3.txt') + '\n' + parenthetical + '\n'
    });
    assert.equal(body.status, 'enough');
    assert.ok(findMarker(body, 'signature', /^orchard$/), 'positive control: orchard is reported');
    const serial = markersOf(body, 'punctuation').find((m) => /serial/.test(m.marker));
    assert.ok(!serial || serial.rate < serial.reference, JSON.stringify(serial));
  });

  it('counts a run of short items closed by ", and" or ", or"', () => {
    const body = profileTexts({
      P1: bare('dale-c1.txt') + '\n' + lists + '\n',
      P2: bare('dale-c2.txt') + '\n' + lists + '\n',
      P3: bare('dale-c3.txt') + '\n' + lists + '\n'
    });
    const serial = markersOf(body, 'punctuation').find((m) => /serial/.test(m.marker));
    assert.ok(serial, JSON.stringify(markersOf(body, 'punctuation')));
    assert.ok(serial.rate > serial.reference);
    assert.ok(serial.count >= 20, `count ${serial.count}`);
  });
});

describe('revision 4: --baseline', () => {
  // Every word the control writer uses is common in this baseline except "fence".
  function baselineFor(names, eol) {
    const words = new Set();
    for (const name of names) for (const w of text(name).toLowerCase().match(/[a-z']+/g)) words.add(w);
    words.delete('fence');
    return [...words].map((w) => `${w}\t1000`).concat(['fence\t1']).join(eol) + eol;
  }

  it('refuses a relative baseline path, a missing one, and a malformed line', () => {
    withDir({
      'samples.json': daleEntries(),
      'no-tab.txt': 'fence 12\nthe\t1000\n',
      'not-a-number.txt': 'fence\tlots\nthe\t1000\n'
    }, (dir) => {
      const samples = join(dir, 'samples.json');
      refused(['profile', '--samples', samples, '--baseline', 'baseline.txt']);
      refused(['profile', '--samples', samples, '--baseline', join(dir, 'missing.txt')]);
      refused(['profile', '--samples', samples, '--baseline', join(dir, 'no-tab.txt')]);
      refused(['profile', '--samples', samples, '--baseline', join(dir, 'not-a-number.txt')]);
    });
  });

  for (const [label, eol] of [['LF', '\n'], ['CR', '\r']]) {
    it(`treats a word under 1 per 10,000 in the baseline as uncommon (${label} lines)`, () => {
      assert.equal(markersOf(dale(), 'signature').some((m) => m.marker === 'fence'), false, 'without a baseline, fence is common');
      withDir({ 'samples.json': daleEntries(), 'baseline.txt': baselineFor(DALE, eol) }, (dir) => {
        const body = ok(['profile', '--samples', join(dir, 'samples.json'), '--baseline', join(dir, 'baseline.txt')]);
        const fence = markersOf(body, 'signature').find((m) => m.marker === 'fence');
        assert.ok(fence, JSON.stringify(markersOf(body, 'signature')));
        assert.equal(fence.basis, 'uncommon-word');
        sameSet(fence.samples, ['C1', 'C2', 'C3']);
      });
    });
  }
});

describe('objective: identifies the writer', () => {
  // Profile from two of Maren's samples; the third is held out and never profiled.
  function run2() {
    return withDir({
      'samples.json': [entry('A1', fixture('maren-a1.txt')), entry('A2', fixture('maren-a2.txt'))]
    }, (dir) => {
      const out = join(dir, 'profile.json');
      ok(['profile', '--samples', join(dir, 'samples.json'), '--output', out]);
      const profile = JSON.parse(readFileSync(out, 'utf8'));
      const own = ok(['check', '--draft', fixture('maren-a3.txt'), '--profile', out]);
      const other = ok(['check', '--draft', fixture('dale-c1.txt'), '--profile', out]);
      return { profile, own, other };
    });
  }

  let result;
  function results() {
    if (!result) result = run2();
    return result;
  }

  it('builds a usable profile from two samples, with class 1 and class 2 markers', () => {
    const { profile } = results();
    assert.notEqual(profile.status, 'too-little-text', JSON.stringify(profile));
    assert.ok(['thin', 'enough'].includes(profile.status), JSON.stringify(profile));
    assert.ok(markersOf(profile, 'signature').length >= 1, JSON.stringify(profile.markers));
    assert.ok(markersOf(profile, 'variant').length >= 1, JSON.stringify(profile.markers));
  });

  it('recognises the held-out sample as the same writer', () => {
    const { own } = results();
    assert.equal(own.status, 'checked', JSON.stringify(own));
    assert.deepEqual(own.contradicted, [], `held-out sample contradicted: ${JSON.stringify(own)}`);
    assert.equal(own.missing, false, `held-out sample missing markers: ${JSON.stringify(own)}`);
    assert.deepEqual(own.overuse, [], `overuse flags the writer's own normal writing: ${JSON.stringify(own.overuse)}`);
    assert.deepEqual(own.avoided, []);
    assert.equal(own.pass, true, JSON.stringify(own));
  });

  it('does not pass the other writer as this one', () => {
    const { other } = results();
    assert.equal(other.status, 'checked', JSON.stringify(other));
    assert.ok(other.contradicted.length > 0, `other writer not contradicted: ${JSON.stringify(other)}`);
    assert.ok(other.missing === true || other.contradicted.length > 0);
    assert.equal(other.pass, false, JSON.stringify(other));
  });
});
