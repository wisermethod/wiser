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
    // Retired by graph.md D2 and D7: overuse: [] became dosage.over: false. DRAFT_PASS (121 words) holds no class 1 or class 4 marker.
    assert.equal(body.dosage.over, false);
    assert.deepEqual(body.contradicted, []);
    // Retired by graph.md D1 and D6: missing: false became missing: null, since a 121-word draft is short.
    assert.equal(body.missing, null);
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
    // Retired by graph.md D1 and D6: missing: false became missing: null, since a 107-word draft is short.
    assert.equal(body.missing, null);
    assert.notEqual(body.pass, true);
  });

  // Retired by graph.md D2 and D7: "reports overuse when a signature phrase repeats more than once
  // per 75 words" became the stuffed-draft case of 0.2.0: T5, on the same DRAFT_OVERUSE.

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

  // Retired by graph.md D6: "reports missing when the draft has no class 1 or 2 marker and the
  // profile has at least 3" (DRAFT_PLAIN, 98 words) became 0.2.0: T13, since missing needs 500
  // words and no longer fails pass.

  it('does not report missing when the profile has fewer than 3 class 1 or 2 markers', () => {
    const body = checkWith({ 'draft.txt': DRAFT_PLAIN }, (dir) =>
      ['--draft', join(dir, 'draft.txt'), '--profile', join(dir, 'thin-profile.json')]);
    assert.equal(body.status, 'checked');
    // Retired by graph.md D1 and D6: missing: false became missing: null, since a 98-word draft is short.
    assert.equal(body.missing, null);
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
    // Retired by graph.md D2 and D7: own.overuse: [] and own.pass: true on raw a3 became 0.2.0: T2
    // (identity holds on the raw text) and 0.2.0: T6 (the raw text is over the dose, its polished version passes).
    assert.deepEqual(own.avoided, []);
  });

  it('does not pass the other writer as this one', () => {
    const { other } = results();
    assert.equal(other.status, 'checked', JSON.stringify(other));
    assert.ok(other.contradicted.length > 0, `other writer not contradicted: ${JSON.stringify(other)}`);
    assert.ok(other.missing === true || other.contradicted.length > 0);
    assert.equal(other.pass, false, JSON.stringify(other));
  });
});

// ---------------------------------------------------------------------------
// 0.2.0: dosage, ranges, the confirmed copy and two quirks. Each describe pins one test,
// T1 to T14, of .claude/graph-runs/2026-10-15-voice-dosage-ranges/graph.md (Revision 1 wins).
// ---------------------------------------------------------------------------

// A word as the tool counts it: a run of letters with inner apostrophes or hyphens.
const WORD = /\p{L}+(?:['’-]\p{L}+)*/gu;
function countWords(source) {
  return (source.match(WORD) || []).length;
}

function sentencesOf(source) {
  return source.split(/(?<=[.!?])\s+/).filter((s) => countWords(s) > 0);
}

const FEATURES = ['sentence_mean', 'sentence_cv', 'long_sentences', 'first_singular', 'first_plural', 'second_person', 'hedges', 'boosters'];
const STANCE = ['first_singular', 'first_plural', 'second_person', 'hedges', 'boosters'];
const CHECK_KEYS = ['status', 'words', 'short', 'avoided', 'dosage', 'contradicted', 'ranges', 'missing', 'pass'];

// Ten sentences of exactly 10 words each: no I, we or you form, no hedge or booster, no
// contraction, no marker of any profile used with them, and no toward or while.
const NEUTRAL = [
  'The crew moved the posts to the shed on Monday.',
  'Two pallets of boots arrived at the dock before noon.',
  'The night shift cleared the returns cage by early evening.',
  'Each picker walked the same long route through the aisles.',
  'The packing benches sit in a row along the wall.',
  'Suppliers booked their slots a week ahead of each delivery.',
  'The yard team checked every trailer against the booking sheet.',
  'Fast lines now live in the bays nearest the benches.',
  'The slotting rules have a named owner and a review.',
  'Graders sorted the returned coats into four separate piles today.'
];
// 10 words, one first_singular form.
const I_SENTENCE = 'I checked the slotting sheet against the system that morning.';
// 10 words each, one hedge from Revision 1's required list each, nothing else from either list.
const HEDGE_SENTENCES = [
  'Perhaps the crew finishes the north fence by Friday afternoon.',
  'Maybe the second packer starts on the late shift tomorrow.',
  'The new labels probably arrive with the Thursday morning delivery.',
  'The returns cage possibly needs a second gate by spring.'
];
// 10 words each, one marker each (PROFILE: "the upshot", "kerfuffle", the cake saying).
const UPSHOT_SENTENCE = 'The upshot is that the night shift needs two packers.';
const KERFUFFLE_SENTENCE = 'A kerfuffle about parking delayed the first lorry on Monday.';
const CAKE_SENTENCE = "You can't eat your cake and have it too here.";
const CAKE = "you can't eat your cake and have it too";

// n sentences of 10 words, so exactly 10 x n words, in paragraphs of five. `at` maps a sentence
// index to the sentence placed there instead of the neutral one.
function tenWordText(n, at = {}) {
  const sentences = [];
  for (let i = 0; i < n; i++) sentences.push(at[i] ?? NEUTRAL[i % NEUTRAL.length]);
  const paragraphs = [];
  for (let i = 0; i < sentences.length; i += 5) paragraphs.push(sentences.slice(i, i + 5).join(' '));
  return paragraphs.join('\n\n') + '\n';
}

// { index: sentence } for each index given.
function placed(indices, sentence) {
  return Object.fromEntries(indices.map((i) => [i, typeof sentence === 'function' ? sentence(i) : sentence]));
}

function range(from, count) {
  return Array.from({ length: count }, (_, i) => from + i);
}

function checkText(profile, draft, avoid) {
  const files = { 'profile.json': profile, 'draft.txt': draft };
  if (avoid !== undefined) files['avoid.txt'] = avoid;
  return withDir(files, (dir) => ok([
    'check', '--draft', join(dir, 'draft.txt'), '--profile', join(dir, 'profile.json'),
    ...(avoid !== undefined ? ['--avoid', join(dir, 'avoid.txt')] : [])
  ]));
}

function refusedCheck(profile, pattern) {
  return withDir({ 'profile.json': profile, 'draft.txt': DRAFT_PASS }, (dir) =>
    refused(['check', '--draft', join(dir, 'draft.txt'), '--profile', join(dir, 'profile.json')], pattern));
}

// The objective profile: Maren's a1 and a2 only, a3 held out.
let marenTwoProfile;
function marenTwo() {
  if (!marenTwoProfile) marenTwoProfile = profileOf([entry('A1', fixture('maren-a1.txt')), entry('A2', fixture('maren-a2.txt'))]);
  return marenTwoProfile;
}

function dose(body) {
  assert.ok(body.dosage && typeof body.dosage === 'object', `no dosage in ${JSON.stringify(body)}`);
  return { budget: body.dosage.budget, used: body.dosage.used, over: body.dosage.over };
}

function uses(body) {
  return body.dosage.uses.map((u) => [u.marker, u.count]);
}

function repeats(body) {
  return body.dosage.repeated.map((r) => [r.marker, r.count, r.cap]);
}

function sides(body) {
  assert.ok(Array.isArray(body.ranges), `ranges is not a list: ${JSON.stringify(body.ranges)}`);
  return body.ranges.map((r) => `${r.feature} ${r.side}`);
}

function bandOf(band) {
  return { low: band.low, q1: band.q1, median: band.median, q3: band.q3, high: band.high };
}

// A band in the profile's shape; q1 and q3 are null unless given.
function band(low, median, high, q1 = null, q3 = null) {
  return { low, q1, median, q3, high };
}

// Bands wide enough that no draft below falls outside them, on every feature but the one a test sets.
function wideFeatures(quartiles) {
  const b = (low, median, high) => (quartiles ? band(low, median, high, (low + median) / 2, (median + high) / 2) : band(low, median, high));
  return {
    sentence_mean: b(1, 20, 100),
    sentence_cv: b(0, 0.5, 5),
    long_sentences: b(0, 20, 100),
    first_singular: b(0, 200, 1000),
    first_plural: b(0, 200, 1000),
    second_person: b(0, 200, 1000),
    hedges: b(0, 200, 1000),
    boosters: b(0, 200, 1000)
  };
}

// A hand-written profile with ranges, in the 0.2.0 shape.
function rangedProfile(features, chunks) {
  return {
    status: 'enough',
    words: 4600,
    samples: 3,
    registers: 1,
    origins: 1,
    markers: [
      { class: 'signature', marker: 'kerfuffle', basis: 'uncommon-word', count: 6, samples: ['A1', 'A2', 'A3'], spread: 1, weight: 1 },
      { class: 'variant', marker: 'towards', over: 'toward', share: 1, count: 7, samples: ['A1', 'A2', 'A3'], spread: 1, weight: 1 }
    ],
    ranges: { chunk_words: 500, chunks, features }
  };
}

// 100 sentences of 10 words (1,000 words) of which k carry one hedge each, so the draft's hedge
// count equals its rate per 1,000 words.
function hedgedThousand(k) {
  return tenWordText(100, placed(range(0, k).map((i) => i * 8), (i) => HEDGE_SENTENCES[(i / 8) % HEDGE_SENTENCES.length]));
}

describe('0.2.0: T1 profile ranges', () => {
  function assertBand(name, b, quartiles) {
    assert.ok(b && typeof b === 'object', `${name}: ${JSON.stringify(b)}`);
    const keys = quartiles ? ['low', 'q1', 'median', 'q3', 'high'] : ['low', 'median', 'high'];
    for (const k of keys) {
      assert.equal(typeof b[k], 'number', `${name}.${k} is ${JSON.stringify(b[k])}`);
      assert.equal(Math.round(b[k] * 100) / 100, b[k], `${name}.${k} ${b[k]} is rounded to 2 places`);
    }
    for (let i = 1; i < keys.length; i++) assert.ok(b[keys[i - 1]] <= b[keys[i]], `${name}: ${JSON.stringify(b)}`);
    if (!quartiles) {
      assert.equal(b.q1, null, `${name}.q1 under 8 chunks`);
      assert.equal(b.q3, null, `${name}.q3 under 8 chunks`);
    }
  }

  it('the maren profile has 500-word chunks, the 8 features and its class 3 bands, with no quartiles under 8 chunks', () => {
    const body = maren();
    const { ranges } = body;
    assert.ok(ranges && typeof ranges === 'object', `ranges: ${JSON.stringify(ranges)}`);
    assert.equal(ranges.chunk_words, 500);
    assert.ok(Number.isInteger(ranges.chunks), `chunks ${ranges.chunks}`);
    // a1 (1,365 words), a2 (1,188) and a3 (1,107) cut by Revision 1's rule give 3 + 2 + 2 = 7 chunks.
    assert.ok(ranges.chunks >= 5 && ranges.chunks < 8, `chunks ${ranges.chunks}`);
    const punctuation = markersOf(body, 'punctuation').map((m) => m.marker);
    assert.ok(punctuation.includes('semicolon'), 'positive control: the semicolon habit is reported');
    sameSet(Object.keys(ranges.features), [...FEATURES, ...punctuation]);
    for (const [name, b] of Object.entries(ranges.features)) assertBand(name, b, false);
  });

  it('six distinct samples of 8 or more chunks report low <= q1 <= median <= q3 <= high', () => {
    // maren-a1..a3 and dale-c1..c3, six distinct files: 7 + 6 = 13 chunks by Revision 1's rule.
    const body = profileOf([...marenEntries(), ...daleEntries()]);
    assert.equal(body.status, 'enough');
    assert.ok(body.ranges.chunks >= 8, `chunks ${body.ranges.chunks}`);
    for (const name of FEATURES) assertBand(name, body.ranges.features[name], true);
  });

  it('takes the percentiles over chunk values by linear interpolation at (n - 1) x p', () => {
    // Eight samples of exactly 500 words (50 sentences of 10), one chunk each. First-person
    // sentences per sample 3, 0, 7, 1, 2, 9, 4, 5 give rates 6, 0, 14, 2, 4, 18, 8, 10 per 1,000.
    // Sorted 0 2 4 6 8 10 14 18, n = 8: q1 at 1.75 = 2 + 0.75 x 2 = 3.5; median at 3.5 = 6 + 0.5 x 2 = 7;
    // q3 at 5.25 = 10 + 0.25 x 4 = 11; low 0; high 18. Every sentence is 10 words: mean 10, cv 0, no long one.
    const counts = [3, 0, 7, 1, 2, 9, 4, 5];
    const texts = {};
    counts.forEach((k, s) => {
      texts[`S${s + 1}`] = tenWordText(50, placed(range(0, k).map((i) => i * 5 + s % 5), I_SENTENCE));
    });
    const body = profileTexts(texts);
    assert.equal(body.status, 'enough');
    assert.equal(body.words, 4000);
    assert.equal(body.ranges.chunk_words, 500);
    assert.equal(body.ranges.chunks, 8);
    const f = body.ranges.features;
    assert.deepEqual(bandOf(f.first_singular), { low: 0, q1: 3.5, median: 7, q3: 11, high: 18 });
    assert.deepEqual(bandOf(f.sentence_mean), { low: 10, q1: 10, median: 10, q3: 10, high: 10 });
    assert.deepEqual(bandOf(f.sentence_cv), { low: 0, q1: 0, median: 0, q3: 0, high: 0 });
    assert.deepEqual(bandOf(f.long_sentences), { low: 0, q1: 0, median: 0, q3: 0, high: 0 });
    assert.deepEqual(bandOf(f.first_plural), { low: 0, q1: 0, median: 0, q3: 0, high: 0 });
    assert.deepEqual(bandOf(f.second_person), { low: 0, q1: 0, median: 0, q3: 0, high: 0 });
  });

  it('keeps a trailing piece of 250 words or more, drops a shorter one, and needs 3 chunks', () => {
    // A: 76 sentences (760 words) = a chunk of 500 with 2 I-sentences (rate 4) and a kept tail of
    // 260 with none (rate 0). B: 74 sentences (740 words) = a chunk of 500 with 5 I-sentences
    // (rate 10) and a dropped tail of 240 holding 9. 1,500 words is thin; chunks 3; values 0, 4, 10.
    // Had B's tail been kept it would read 37.5; had it been merged, B would read 18.92.
    const body = profileTexts({
      A: tenWordText(76, placed([0, 1], I_SENTENCE)),
      B: tenWordText(74, placed([...range(0, 5), ...range(50, 9)], I_SENTENCE))
    });
    assert.equal(body.status, 'thin');
    assert.equal(body.words, 1500);
    assert.equal(body.ranges.chunks, 3);
    assert.deepEqual(bandOf(body.ranges.features.first_singular), { low: 0, q1: null, median: 4, q3: null, high: 10 });

    // Two samples of 740 words (one chunk each) and one of 240 (none): 1,720 words is thin, but
    // 2 chunks give ranges: null.
    const two = profileTexts({
      A: tenWordText(74, placed([3], I_SENTENCE)),
      B: tenWordText(74, placed([7, 9], I_SENTENCE)),
      C: tenWordText(24)
    });
    assert.equal(two.status, 'thin');
    assert.equal(two.words, 1720);
    assert.equal(two.ranges, null);
  });

  it('too-little-text gives ranges: null', () => {
    const body = profileOf([entry('A1', fixture('maren-a1.txt'))]);
    assert.equal(body.status, 'too-little-text');
    assert.equal(body.ranges, null);
  });
});

describe('0.2.0: T2 identity holds on the raw held-out sample (objective)', () => {
  // Raw a3 cut at blank lines: a piece closes once it holds 500 words or more, and a tail under
  // 400 words joins the piece before it. a3 (1,107 words) gives pieces of 503 and 604 words.
  function pieces(source) {
    const paragraphs = source.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    const out = [];
    let current = [];
    for (const p of paragraphs) {
      current.push(p);
      if (countWords(current.join('\n\n')) >= 500) {
        out.push(current);
        current = [];
      }
    }
    if (current.length) {
      if (out.length && countWords(current.join('\n\n')) < 400) out[out.length - 1].push(...current);
      else out.push(current);
    }
    return out.map((p) => p.join('\n\n') + '\n');
  }

  it('raw a3, whole and in pieces of 400 words or more, contradicts nothing and sits inside every range', () => {
    const profile = marenTwo();
    assert.ok(profile.ranges && profile.ranges.features, `positive control: the a1+a2 profile has ranges: ${JSON.stringify(profile.ranges)}`);
    const whole = checkText(profile, text('maren-a3.txt'));
    assert.equal(whole.status, 'checked');
    assert.equal(whole.words, 1107);
    assert.deepEqual(whole.contradicted, [], JSON.stringify(whole));
    assert.deepEqual(whole.ranges, [], `the held-out sample falls outside its own ranges: ${JSON.stringify(whole.ranges)}`);
    assert.equal(whole.missing, false, JSON.stringify(whole));

    const parts = pieces(text('maren-a3.txt'));
    assert.ok(parts.length >= 2, `pieces ${parts.length}`);
    for (const part of parts) {
      const body = checkText(profile, part);
      assert.equal(body.status, 'checked');
      assert.ok(body.words >= 400, `piece of ${body.words} words`);
      assert.deepEqual(body.contradicted, [], JSON.stringify(body));
      assert.deepEqual(body.ranges, [], `a ${body.words}-word piece of the held-out sample falls outside: ${JSON.stringify(body.ranges)}`);
    }
  });
});

describe('0.2.0: T3 other writer flagged (objective)', () => {
  it('dale-c1 is contradicted, fails, and is outside on a pronoun range', () => {
    const body = checkText(marenTwo(), text('dale-c1.txt'));
    assert.equal(body.status, 'checked');
    assert.ok(body.contradicted.length > 0, JSON.stringify(body));
    assert.equal(body.pass, false);
    const outside = sides(body);
    assert.ok(outside.includes('first_plural above') || outside.includes('first_singular below'), JSON.stringify(body.ranges));
  });
});

describe('0.2.0: T4 guardrails are advice, each specific', () => {
  function cleanButAdvised(body) {
    assert.equal(body.status, 'checked');
    assert.ok(body.words >= 500 && body.words <= 600, `words ${body.words}`);
    assert.deepEqual(body.avoided, []);
    assert.deepEqual(body.contradicted, [], JSON.stringify(body.contradicted));
    assert.equal(body.dosage.over, false, JSON.stringify(body.dosage));
    assert.deepEqual(body.dosage.repeated, []);
    assert.ok(body.ranges.length > 0, 'ranges is non-empty');
    assert.equal(body.pass, true, `ranges must not fail pass (D7): ${JSON.stringify(body)}`);
  }

  it('flat-draft is reported on sentence_cv below and on no stance feature, and passes', () => {
    const source = text('flat-draft.txt');
    for (const s of sentencesOf(source)) {
      const n = countWords(s);
      assert.ok(n >= 17 && n <= 21, `fixture sentence of ${n} words: ${s}`);
    }
    const body = checkText(marenTwo(), source, 'basically\nleverage\n');
    cleanButAdvised(body);
    assert.ok(sides(body).includes('sentence_cv below'), JSON.stringify(body.ranges));
    assert.equal(body.ranges.some((r) => STANCE.includes(r.feature)), false, JSON.stringify(body.ranges));
  });

  it('rambling-draft is reported on long_sentences above, and passes', () => {
    const source = text('rambling-draft.txt');
    const lengths = sentencesOf(source).map(countWords);
    assert.ok(lengths.filter((n) => n >= 35).length > lengths.length / 2, `fixture lengths ${lengths}`);
    const body = checkText(marenTwo(), source, 'basically\nleverage\n');
    cleanButAdvised(body);
    assert.ok(sides(body).includes('long_sentences above'), JSON.stringify(body.ranges));
  });

  it('hedged-draft is reported on hedges above, and passes', () => {
    const body = checkText(marenTwo(), text('hedged-draft.txt'), 'basically\nleverage\n');
    cleanButAdvised(body);
    assert.ok(sides(body).includes('hedges above'), JSON.stringify(body.ranges));
  });
});

describe('0.2.0: T5 dosage, and a stuffed draft fails', () => {
  // Every draft here is 10-word sentences, so words = 10 x sentences.
  // budget = max(1, floor(words / 500)); per-marker cap = max(1, floor(words / 1000)).
  it('about 500 words with one marker is not over', () => {
    // 520 words: budget 1, cap 1; used 1.
    const body = checkText(PROFILE, tenWordText(52, placed([10], UPSHOT_SENTENCE)));
    assert.equal(body.status, 'checked');
    assert.equal(body.words, 520);
    assert.equal(body.short, false);
    assert.deepEqual(dose(body), { budget: 1, used: 1, over: false });
    assert.deepEqual(uses(body), [['the upshot', 1]]);
    assert.deepEqual(body.dosage.repeated, []);
    assert.equal(body.pass, true, JSON.stringify(body));
  });

  it('about 500 words with two distinct markers is over', () => {
    // 520 words: budget 1, cap 1; used 2 (one each), so over, and nothing repeated.
    const body = checkText(PROFILE, tenWordText(52, { 10: UPSHOT_SENTENCE, 40: KERFUFFLE_SENTENCE }));
    assert.equal(body.words, 520);
    assert.deepEqual(dose(body), { budget: 1, used: 2, over: true });
    assert.deepEqual(uses(body), [['kerfuffle', 1], ['the upshot', 1]]);
    assert.deepEqual(body.dosage.repeated, []);
    assert.equal(body.pass, false);
  });

  it('about 1,000 words with two distinct markers once each is not over', () => {
    // 1,040 words: budget floor(1040 / 500) = 2, cap 1; used 2.
    const body = checkText(PROFILE, tenWordText(104, { 20: UPSHOT_SENTENCE, 80: KERFUFFLE_SENTENCE }));
    assert.equal(body.words, 1040);
    assert.deepEqual(dose(body), { budget: 2, used: 2, over: false });
    assert.deepEqual(body.dosage.repeated, []);
    assert.equal(body.pass, true, JSON.stringify(body));
  });

  it('one marker twice in about 1,000 words is repeated with cap 1', () => {
    // 1,040 words: budget 2, cap floor(1040 / 1000) = 1; "the upshot" twice is within the budget
    // but over its cap, so pass fails on the repeat alone.
    const body = checkText(PROFILE, tenWordText(104, placed([0, 103], UPSHOT_SENTENCE)));
    assert.equal(body.words, 1040);
    assert.deepEqual(dose(body), { budget: 2, used: 2, over: false });
    assert.deepEqual(repeats(body), [['the upshot', 2, 1]]);
    assert.equal(body.pass, false);
  });

  it('one marker twice in 2,000 words or more, far apart, is not repeated', () => {
    // 2,080 words: budget 4, cap floor(2080 / 1000) = 2; first and last sentence.
    const body = checkText(PROFILE, tenWordText(208, placed([0, 207], UPSHOT_SENTENCE)));
    assert.equal(body.words, 2080);
    assert.deepEqual(dose(body), { budget: 4, used: 2, over: false });
    assert.deepEqual(body.dosage.repeated, []);
    assert.equal(body.pass, true, JSON.stringify(body));
  });

  it('an altered saying counts in used', () => {
    // 520 words: the cake saying alone is used 1; with "the upshot" as well, used 2 over budget 1.
    const alone = checkText(PROFILE, tenWordText(52, placed([25], CAKE_SENTENCE)));
    assert.deepEqual(dose(alone), { budget: 1, used: 1, over: false });
    assert.deepEqual(uses(alone), [[CAKE, 1]]);
    assert.equal(alone.pass, true, JSON.stringify(alone));
    const both = checkText(PROFILE, tenWordText(52, { 10: UPSHOT_SENTENCE, 40: CAKE_SENTENCE }));
    assert.deepEqual(dose(both), { budget: 1, used: 2, over: true });
    assert.deepEqual(uses(both), [['the upshot', 1], [CAKE, 1]]);
    assert.equal(both.pass, false);
  });

  it('the stuffed draft fails on the dose and the repeat', () => {
    // DRAFT_OVERUSE: 158 words, short, so budget 1 and cap 1; "the upshot" 4 times.
    const body = checkText(PROFILE, DRAFT_OVERUSE);
    assert.equal(body.status, 'checked');
    assert.equal(body.words, 158);
    assert.equal(body.short, true);
    assert.deepEqual(dose(body), { budget: 1, used: 4, over: true });
    assert.deepEqual(repeats(body), [['the upshot', 4, 1]]);
    assert.equal(body.pass, false);
  });
});

describe('0.2.0: T6 polish is the target (objective)', () => {
  function cake(profile) {
    const m = findMarker(profile, 'idiom', /eat your cake and have it/);
    assert.ok(m, `no cake saying in ${JSON.stringify(markersOf(profile, 'idiom'))}`);
    return m.marker;
  }

  it('the a1+a2 profile holds the four class 1 markers Revision 1 names', () => {
    const signature = markersOf(marenTwo(), 'signature').map((m) => [m.marker, m.count]);
    assert.deepEqual(signature.sort(), [['drifted', 3], ['in practice', 6], ['kerfuffle', 4], ['upshot', 6]]);
    assert.ok(marenTwo().ranges, 'the a1+a2 profile carries ranges');
  });

  it('raw a3 is over the dose with repeated markers, while it holds its identity', () => {
    const profile = marenTwo();
    const raw = checkText(profile, text('maren-a3.txt'));
    // 1,107 words: budget floor(1107 / 500) = 2, cap 1. Uses: in practice 3, upshot 3,
    // kerfuffle 2 and the cake saying 1, so used 9.
    assert.deepEqual(dose(raw), { budget: 2, used: 9, over: true });
    assert.deepEqual(uses(raw), [['in practice', 3], ['upshot', 3], ['kerfuffle', 2], [cake(profile), 1]]);
    assert.deepEqual(repeats(raw), [['in practice', 3, 1], ['upshot', 3, 1], ['kerfuffle', 2, 1]]);
    assert.deepEqual(raw.contradicted, []);
    assert.deepEqual(raw.ranges, []);
    assert.equal(raw.pass, false);
  });

  it('maren-a3-polished passes: within the dose, nothing repeated or contradicted, inside every range', () => {
    const profile = marenTwo();
    const body = checkText(profile, text('maren-a3-polished.txt'), 'basically\nleverage\n');
    // 1,100 words: budget 2, cap 1. Uses: kerfuffle 1 and the cake saying 1, so used 2.
    assert.equal(body.status, 'checked');
    assert.equal(body.words, 1100);
    assert.deepEqual(body.avoided, []);
    assert.deepEqual(dose(body), { budget: 2, used: 2, over: false });
    assert.deepEqual(uses(body), [['kerfuffle', 1], [cake(profile), 1]]);
    assert.deepEqual(body.dosage.repeated, []);
    assert.deepEqual(body.contradicted, [], JSON.stringify(body.contradicted));
    assert.deepEqual(body.ranges, [], JSON.stringify(body.ranges));
    assert.equal(body.pass, true, JSON.stringify(body));
  });
});

describe('0.2.0: T7 short pieces', () => {
  // 192 words of Maren-like prose with no marker of the a1+a2 profile.
  const BASE = `I spent Tuesday at the Northampton site with the returns team, and I want to note what I saw
before the week runs away with me. The team grades every returned item by hand, at two benches near
the goods-in doors. Each grader works through a cage of returns in the morning and a second cage after
lunch. The grading rules sit in a binder on the first bench, and the binder is out of date by a full
season. Most graders have stopped reading it and work from memory instead, which is fine for the
experienced people and hard on the new starters. I would ask the site manager for three small changes.
First, the rules go on a single sheet, owned by one named person. Second, new starters spend their first
week beside an experienced grader. Third, the cages are emptied in the order they arrived, so that
nothing waits at the back for a fortnight. None of this costs much, and all of it can start next week.
The returns team has asked for this for some time, and the manager agreed to it at the end of my visit.
`;
  const ONE = BASE + 'The upshot is a calmer bench and faster grading.\n';
  const TWO = ONE + 'There was a small kerfuffle about the binder on Tuesday.\n';

  it('a 200-word draft is short, with ranges and missing null and budget 1', () => {
    assert.ok(marenTwo().ranges, 'positive control: the profile has ranges, so null comes from the length');
    const body = checkText(marenTwo(), BASE);
    assert.equal(body.status, 'checked');
    assert.ok(body.words >= 150 && body.words < 250, `words ${body.words}`);
    assert.equal(body.short, true);
    assert.equal(body.ranges, null);
    assert.equal(body.missing, null);
    assert.deepEqual(dose(body), { budget: 1, used: 0, over: false });
    assert.deepEqual(body.contradicted, []);
    assert.equal(body.pass, true, JSON.stringify(body));
  });

  it('with one marker it passes', () => {
    const body = checkText(marenTwo(), ONE);
    assert.ok(body.words < 250, `words ${body.words}`);
    assert.equal(body.short, true);
    assert.deepEqual(dose(body), { budget: 1, used: 1, over: false });
    assert.equal(body.pass, true, JSON.stringify(body));
  });

  it('with two distinct markers it is over', () => {
    const body = checkText(marenTwo(), TWO);
    assert.ok(body.words < 250, `words ${body.words}`);
    assert.equal(body.short, true);
    assert.deepEqual(dose(body), { budget: 1, used: 2, over: true });
    assert.deepEqual(body.dosage.repeated, []);
    assert.equal(body.pass, false);
  });
});

describe('0.2.0: T8 a polished range reaches check, as advice', () => {
  // Drafts are 1,000 words (100 sentences of 10), so a hedge count is its rate per 1,000 words,
  // and L and H are the band's low and high as written. Every other feature has a wide band.
  it('with 8 or more chunks, high narrowed to q1 reports a draft at the highest chunk rate and not one at q1', () => {
    // Measured hedges band: low 2, q1 4, median 6, q3 8, high 12. Polished copy: high = q1 = 4.
    // 12 hedges: above when count > H + 2 x sqrt(max(H, 1)) = 4 + 2 x 2 = 8; 12 > 8, reported.
    // 4 hedges: 4 <= 8, and L - 2 x sqrt(L) = 2 - 2.83 is not above 0, so never below: not reported.
    // Control, the measured band: 12 + 2 x sqrt(12) = 18.93, so 12 hedges are not reported.
    const measured = rangedProfile({ ...wideFeatures(true), hedges: band(2, 6, 12, 4, 8) }, 9);
    const polished = rangedProfile({ ...wideFeatures(true), hedges: band(2, 6, 4, 4, 8) }, 9);
    const high = checkText(polished, hedgedThousand(12));
    assert.equal(high.words, 1000);
    assert.deepEqual(high.ranges, [{ feature: 'hedges', value: 12, low: 2, high: 4, side: 'above' }]);
    assert.equal(high.pass, true, JSON.stringify(high));
    const atQ1 = checkText(polished, hedgedThousand(4));
    assert.deepEqual(atQ1.ranges, []);
    assert.equal(atQ1.pass, true);
    const control = checkText(measured, hedgedThousand(12));
    assert.deepEqual(control.ranges, []);
  });

  it('under 8 chunks, high narrowed to the median does the same', () => {
    // Measured: low 2, median 6, high 12, q1 and q3 null (5 chunks). Polished copy: high = median = 6.
    // 12 hedges: 6 + 2 x sqrt(6) = 10.90; 12 > 10.90, reported. 6 hedges: 6 <= 10.90, not reported.
    const polished = rangedProfile({ ...wideFeatures(false), hedges: band(2, 6, 6) }, 5);
    const high = checkText(polished, hedgedThousand(12));
    assert.deepEqual(high.ranges, [{ feature: 'hedges', value: 12, low: 2, high: 6, side: 'above' }]);
    assert.equal(high.pass, true, JSON.stringify(high));
    const atMedian = checkText(polished, hedgedThousand(6));
    assert.deepEqual(atMedian.ranges, []);
    assert.equal(atMedian.pass, true);
  });
});

describe('0.2.0: T9 serial comma', () => {
  const bare = (name) => text(name).replace(/,/g, '');
  const asides = [
    'That is fine, I am told, and true.',
    'The fence, we hope, and the shed.',
    'The soil, they said, and the drain.',
    'The deer, of course, and the rabbits.',
    'The grant, frankly, and the cider.',
    'Our arborist, bless her, and two friends.'
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
  const serialOf = (body) => markersOf(body, 'punctuation').find((m) => /serial/.test(m.marker));

  it('six short-clause parenthetical sentences in three samples give no serial comma above reference', () => {
    const body = profileTexts({
      P1: bare('dale-c1.txt') + '\n' + asides + '\n',
      P2: bare('dale-c2.txt') + '\n' + asides + '\n',
      P3: bare('dale-c3.txt') + '\n' + asides + '\n'
    });
    assert.equal(body.status, 'enough');
    assert.ok(findMarker(body, 'signature', /^orchard$/), 'positive control: orchard is reported');
    const serial = serialOf(body);
    assert.ok(!serial || serial.rate <= serial.reference, JSON.stringify(serial));
  });

  it('the same asides added to the list sentences leave the serial count unchanged, at 20 or more', () => {
    const listsOnly = serialOf(profileTexts({
      P1: bare('dale-c1.txt') + '\n' + lists + '\n',
      P2: bare('dale-c2.txt') + '\n' + lists + '\n',
      P3: bare('dale-c3.txt') + '\n' + lists + '\n'
    }));
    const withAsides = serialOf(profileTexts({
      P1: bare('dale-c1.txt') + '\n' + lists + '\n' + asides + '\n',
      P2: bare('dale-c2.txt') + '\n' + lists + '\n' + asides + '\n',
      P3: bare('dale-c3.txt') + '\n' + lists + '\n' + asides + '\n'
    }));
    assert.ok(listsOnly && listsOnly.count >= 20, JSON.stringify(listsOnly));
    assert.ok(withAsides, 'the lists are still reported with the asides added');
    assert.equal(withAsides.count, listsOnly.count, `asides counted as lists: ${JSON.stringify({ listsOnly, withAsides })}`);
  });
});

describe('0.2.0: T10 plural fold', () => {
  // 86 words; "work day" once and "work days" once, and no other marker of the dale profile.
  const DRAFT_WORK_DAYS = `The steering group met on Tuesday evening to plan the spring season.
We agreed that every work day should start at nine and finish by eleven, with a short list of tasks
posted at the gate. The first two work days will focus on mulching and on checking the young trees
for damage after the winter. Volunteers should bring gloves, a flask and a friend. We will send a
reminder the week before, and the library has offered its meeting room if the weather turns bad.
`;

  it('the dale profile has one work day marker with both forms, and towards stays a class 2 marker', () => {
    const signature = markersOf(dale(), 'signature');
    const day = signature.find((m) => m.marker === 'work day');
    assert.ok(day, JSON.stringify(signature));
    assert.deepEqual(day.forms, ['work day', 'work days']);
    assert.equal(day.count, 10);
    assert.equal(signature.some((m) => m.marker === 'work days'), false, JSON.stringify(signature));

    const towards = markersOf(maren(), 'variant').find((m) => m.marker === 'towards');
    assert.ok(towards, JSON.stringify(markersOf(maren(), 'variant')));
    assert.equal(towards.over, 'toward');
    assert.equal(towards.count, 7);
    assert.equal(markersOf(maren(), 'signature').some((m) => /toward/.test(m.marker) || (m.forms || []).some((f) => /toward/.test(f))), false);
  });

  it('check counts work days as a use of the folded marker', () => {
    // 86 words, short: budget 1, cap 1. One marker with 2 uses, so it is repeated.
    const body = checkText(dale(), DRAFT_WORK_DAYS);
    assert.equal(body.status, 'checked');
    const day = body.dosage.uses.find((u) => u.marker === 'work day');
    assert.ok(day, JSON.stringify(body.dosage));
    assert.equal(day.count, 2);
    assert.equal(body.dosage.uses.some((u) => u.marker === 'work days'), false, JSON.stringify(body.dosage));
    assert.ok(repeats(body).some(([m, count, cap]) => m === 'work day' && count === 2 && cap === 1), JSON.stringify(body.dosage));
  });
});

describe('0.2.0: T11 compatibility', () => {
  // 310 words (31 sentences of 10) with one kerfuffle: not short, budget 1, used 1.
  it('a 0.1.0-shape profile checks, with ranges: null and dosage computed', () => {
    for (const profile of [PROFILE, { ...PROFILE, ranges: null }]) {
      const body = checkText(profile, tenWordText(31, placed([15], KERFUFFLE_SENTENCE)));
      assert.equal(body.status, 'checked');
      assert.equal(body.words, 310);
      assert.equal(body.short, false);
      assert.equal(body.ranges, null);
      assert.equal(body.missing, null);
      assert.deepEqual(dose(body), { budget: 1, used: 1, over: false });
      assert.deepEqual(uses(body), [['kerfuffle', 1]]);
      assert.deepEqual(body.dosage.repeated, []);
      assert.equal(body.pass, true, JSON.stringify(body));
      sameSet(Object.keys(body), CHECK_KEYS);
    }
  });
});

describe('0.2.0: T12 refusal of a malformed profile', () => {
  const valid = () => rangedProfile(wideFeatures(false), 5);
  const withFeature = (name, value) => {
    const p = valid();
    p.ranges.features[name] = value;
    return p;
  };

  it('accepts a well-formed ranges object (positive control)', () => {
    // 300 words of 10-word sentences, inside every wide band.
    const body = checkText(valid(), tenWordText(30));
    assert.equal(body.status, 'checked');
    assert.equal(body.words, 300);
    assert.deepEqual(body.ranges, []);
  });

  it('refuses ranges that is not an object, or whose features is not an object, by name', () => {
    refusedCheck({ ...PROFILE, ranges: 'wide' }, /ranges/);
    refusedCheck({ ...PROFILE, ranges: 7 }, /ranges/);
    refusedCheck({ ...PROFILE, ranges: { chunk_words: 500, chunks: 5 } }, /features|ranges/);
    refusedCheck({ ...PROFILE, ranges: { chunk_words: 500, chunks: 5, features: 'all' } }, /features|ranges/);
  });

  it('refuses a feature that is not an object of numeric low, median and high with q1 and q3 numbers or null', () => {
    refusedCheck(withFeature('hedges', 'wide'), /hedges|ranges/);
    refusedCheck(withFeature('hedges', { low: '2', q1: null, median: 6, q3: null, high: 12 }), /hedges|ranges/);
    refusedCheck(withFeature('hedges', { low: 2, q1: null, q3: null, high: 12 }), /hedges|ranges/);
    refusedCheck(withFeature('hedges', { low: 2, q1: null, median: 6, q3: null, high: null }), /hedges|ranges/);
    refusedCheck(withFeature('hedges', { low: 2, q1: 'x', median: 6, q3: null, high: 12 }), /hedges|ranges/);
    refusedCheck(withFeature('hedges', { low: 2, q1: null, median: 6, q3: '8', high: 12 }), /hedges|ranges/);
  });

  it('refuses a feature name outside the eight features and the class 3 keys, by that name', () => {
    refusedCheck(withFeature('sparkle_rate', band(0, 1, 2)), /sparkle_rate/);
  });

  it('refuses a signature marker whose forms is not a non-empty array of non-empty strings', () => {
    const withForms = (forms) => ({
      ...PROFILE,
      markers: PROFILE.markers.map((m) => (m.marker === 'the upshot' ? { ...m, forms } : m))
    });
    refusedCheck(withForms([]), /forms/);
    refusedCheck(withForms(['']), /forms/);
    refusedCheck(withForms('the upshot'), /forms/);
    const body = checkText(withForms(['the upshot', 'the upshots']), DRAFT_PASS);
    assert.equal(body.status, 'checked');
    assert.equal(body.dosage.used, 0, 'positive control: well-formed forms are accepted');
  });
});

describe('0.2.0: T13 missing is information only', () => {
  it('plain-600 has missing: true and passes', () => {
    const body = checkText(marenTwo(), text('plain-600.txt'), 'basically\nleverage\n');
    assert.equal(body.status, 'checked');
    assert.ok(body.words >= 500, `words ${body.words}`);
    assert.deepEqual(body.avoided, []);
    assert.deepEqual(body.contradicted, [], JSON.stringify(body.contradicted));
    assert.deepEqual(dose(body), { budget: 1, used: 0, over: false });
    assert.equal(body.missing, true);
    assert.equal(body.pass, true, JSON.stringify(body));
  });

  it('its first 400 words have missing: null', () => {
    const body = checkText(marenTwo(), firstWords(text('plain-600.txt'), 400));
    assert.equal(body.status, 'checked');
    assert.ok(body.words >= 250 && body.words < 500, `words ${body.words}`);
    assert.equal(body.short, false);
    assert.equal(body.missing, null);
    assert.equal(body.pass, true, JSON.stringify(body));
  });

  it('the 98-word DRAFT_PLAIN has missing: null and passes', () => {
    const body = checkText(PROFILE, DRAFT_PLAIN);
    assert.equal(body.status, 'checked');
    assert.equal(body.short, true);
    assert.deepEqual(body.avoided, []);
    assert.deepEqual(body.contradicted, []);
    assert.equal(body.missing, null);
    assert.equal(body.pass, true, JSON.stringify(body));
  });
});

describe('0.2.0: T14 the confirmed copy', () => {
  // A copy with 8 or more chunks whose hedges band was polished on its high side: measured
  // low 2, high 12; the D4 target q1 = 4 now held in high. Arithmetic as T8: on 1,000 words,
  // 12 hedges are above 4 + 2 x sqrt(4) = 8 (reported), 4 hedges are not. Judged by the measured
  // high instead, 12 would sit under 12 + 2 x sqrt(12) = 18.93 and not be reported.
  function copy(hedgesExtra = {}, keepExtra = {}) {
    const features = wideFeatures(true);
    features.hedges = { ...band(2, 6, 4, 4, 8), decision: 'polish', polish: 'high', measured: { low: 2, high: 12 }, ...hedgesExtra };
    features.first_singular = { ...features.first_singular, decision: 'keep', ...keepExtra };
    features.second_person = { ...features.second_person, decision: 'polish', polish: 'low', measured: { low: 0, high: 1000 } };
    return rangedProfile(features, 9);
  }

  it('a copy carrying decision, polish and measured checks, and is judged by low and high', () => {
    const high = checkText(copy(), hedgedThousand(12));
    assert.equal(high.status, 'checked');
    assert.equal(high.words, 1000);
    assert.deepEqual(high.ranges, [{ feature: 'hedges', value: 12, low: 2, high: 4, side: 'above' }]);
    assert.equal(high.pass, true, JSON.stringify(high));
    const atTarget = checkText(copy(), hedgedThousand(4));
    assert.deepEqual(atTarget.ranges, []);
    assert.equal(atTarget.pass, true);
  });

  it('refuses a decision outside keep and polish, naming the key', () => {
    refusedCheck(copy({ decision: 'maybe' }), /decision/);
    refusedCheck(copy({}, { decision: 'maybe' }), /decision/);
  });

  it('refuses a polish side outside high and low, or a measured that is not two numbers, naming the key', () => {
    refusedCheck(copy({ polish: 'middle' }), /polish/);
    refusedCheck(copy({ measured: { low: 2 } }), /measured/);
    refusedCheck(copy({ measured: { low: 2, high: 'twelve' } }), /measured/);
    refusedCheck(copy({ measured: 12 }), /measured/);
  });

  it('refuses any other key inside a feature, naming it', () => {
    refusedCheck(copy({ target: 3 }), /target/);
    refusedCheck(copy({}, { note: 'kept by the person' }), /note/);
  });
});

describe('0.2.0: T15 fold order', () => {
  // Revision 1, corrected: the singular is tried as ies to y, then s dropped, then es dropped,
  // taking the first that occurs as a token in the samples and is not a function word.
  // The control writer with "note" replaced, so the samples hold "not" but never "note".
  const noNote = (name) => text(name).replace(/\bnote\b/gi, 'word');
  const markerStrings = (body) => body.markers.flatMap((m) => [m.marker, ...(m.forms || [])]);
  function profileWith(base, inserts) {
    const texts = {};
    DALE.forEach((name, i) => {
      texts[`F${i + 1}`] = base(name) + '\n' + inserts[i].join('\n') + '\n';
    });
    for (const t of Object.values(texts)) {
      assert.match(t, /\bnot\b/, 'fixture: each sample holds "not"');
    }
    return profileTexts(texts);
  }

  it('does not fold notes into not when note is absent: "field notes" is reported as written', () => {
    const literal = 'I wrote it all down in my field notes.';
    const asWritten = profileWith(noNote, [[literal, literal], [literal, literal], [literal, literal]]);
    assert.equal(asWritten.status, 'enough');
    const signature = markersOf(asWritten, 'signature');
    // Positive control: folding is on in this run (work days folds into work day), so "notes"
    // stays apart by the rule, not because nothing folds.
    const day = signature.find((m) => m.marker === 'work day');
    assert.ok(day && Array.isArray(day.forms) && day.forms.includes('work days'), JSON.stringify(day));
    assert.ok(signature.some((m) => /(^| )field notes$/.test(m.marker)), JSON.stringify(signature));
    assert.equal(markerStrings(asWritten).some((s) => /\bnot\b/.test(s)), false, JSON.stringify(asWritten.markers));

    // The same phrase in varied sentences, so the only recurring phrase is "field notes" (6 uses).
    const varied = profileWith(noNote, [
      ['Her field notes were short and tidy.', 'We read the field notes on the pear tree twice.'],
      ['Two field notes blew away in the wind.', 'Our field notes now live in the shed.'],
      ['The field notes from June were the best.', 'New field notes arrived from the printer.']
    ]);
    for (const t of DALE.map(noNote)) assert.doesNotMatch(t, /\bnote\b/i, 'fixture: no sample holds "note"');
    const notes = markersOf(varied, 'signature').find((m) => m.marker === 'field notes');
    assert.ok(notes, JSON.stringify(markersOf(varied, 'signature')));
    assert.equal(notes.count, 6);
    assert.equal(notes.forms, undefined, JSON.stringify(notes));
    assert.equal(markerStrings(varied).some((s) => /\bnot\b/.test(s)), false, JSON.stringify(varied.markers));
  });

  it('folds notes into note when note is present, and boxes into box when no boxe occurs', () => {
    // "field notes" 6 and "field note" 3 fold to one marker of 9, its forms by count.
    const notes = profileWith(noNote, [
      ['Her field notes were short and tidy.', 'We read the field note on the pear tree twice.', 'The field notes went home in a tin.'],
      ['Two field notes blew away in the wind.', 'One field note was lost in the mud.', 'Our field notes now live in the shed.'],
      ['The field notes from June were the best.', 'A field note fell behind the bench.', 'New field notes arrived from the printer.']
    ]);
    const note = markersOf(notes, 'signature').find((m) => /^field notes?$/.test(m.marker));
    assert.ok(note, JSON.stringify(markersOf(notes, 'signature')));
    assert.equal(note.marker, 'field notes');
    assert.equal(note.count, 9);
    assert.deepEqual(note.forms, ['field notes', 'field note']);
    assert.equal(markerStrings(notes).some((s) => /\bnot\b/.test(s)), false, JSON.stringify(notes.markers));

    // "boxes": s dropped gives "boxe", which never occurs; es dropped gives "box", which does.
    // "seed boxes" 6 and "seed box" 3 fold to one marker of 9.
    const boxInserts = [
      ['The seed boxes went back on the shelf.', 'Two seed boxes stayed in the shed.', 'One seed box was left out in the rain.'],
      ['The seed boxes need new labels.', 'Our seed boxes are full again.', 'A seed box fell off the cart.'],
      ['Old seed boxes make good trays.', 'The seed boxes came from a neighbor.', 'Each seed box holds one variety.']
    ];
    const boxes = profileWith((name) => text(name), boxInserts);
    for (const i of [0, 1, 2]) assert.doesNotMatch(text(DALE[i]) + boxInserts[i].join(' '), /\bboxe\b/i, 'fixture: no "boxe"');
    const box = markersOf(boxes, 'signature').find((m) => /^seed box(es)?$/.test(m.marker));
    assert.ok(box, JSON.stringify(markersOf(boxes, 'signature')));
    assert.equal(box.marker, 'seed boxes');
    assert.equal(box.count, 9);
    assert.deepEqual(box.forms, ['seed boxes', 'seed box']);
  });
});

// ---------------------------------------------------------------------------
// 0.2.0, Revision 2 (graph.md, corrections from the N7a code review). (a) to (c) pin the three
// corrections; (d) strengthens weak tests; (e) kills the mutants N7a's harness left alive,
// each named in its test.
// ---------------------------------------------------------------------------

// A sentence of exactly n words, none a pronoun, hedge, booster or marker of any profile here.
const VOCAB = ['crew', 'moved', 'posts', 'shed', 'pallets', 'boots', 'arrived', 'dock', 'benches', 'wall', 'trailer',
  'sheet', 'yard', 'gate', 'lorry', 'labels', 'cage', 'aisles', 'route', 'bays', 'spring', 'fence'];
function sentenceOf(n, seed = 0) {
  const words = Array.from({ length: n }, (_, i) => VOCAB[(seed + i) % VOCAB.length]);
  words[0] = words[0][0].toUpperCase() + words[0].slice(1);
  return words.join(' ') + '.';
}
function textOfLengths(lengths) {
  return lengths.map((n, i) => sentenceOf(n, i)).join(' ') + '\n';
}

describe('0.2.0: R2 serial comma with contracted subject pronouns', () => {
  const bare = (name) => text(name).replace(/,/g, '');
  const asides = [
    "That is fine, I'm told, and true.",
    "The fence, we're sure, and the shed.",
    "The soil, they'd say, and the drain.",
    "The deer, it's said, and the rabbits.",
    "The hedge, you'll see, and the gate.",
    "The cider, she'd say, and the pies."
  ].join('\n');

  it('six asides opening on a contracted subject pronoun, in three samples, give no serial comma above reference', () => {
    const body = profileTexts({
      P1: bare('dale-c1.txt') + '\n' + asides + '\n',
      P2: bare('dale-c2.txt') + '\n' + asides + '\n',
      P3: bare('dale-c3.txt') + '\n' + asides + '\n'
    });
    assert.equal(body.status, 'enough');
    assert.ok(findMarker(body, 'signature', /^orchard$/), 'positive control: orchard is reported');
    const serial = markersOf(body, 'punctuation').find((m) => /serial/.test(m.marker));
    assert.ok(!serial || serial.rate <= serial.reference, JSON.stringify(serial));
  });
});

describe('0.2.0: R2 folding and light words', () => {
  it('reports the habit phrase "big numbers" although its folded form "number" is a light word', () => {
    const insert = '\nWe looked at the big numbers again. The big numbers told the same story. One number stood out.\n';
    const body = profileTexts({
      B1: text('dale-c1.txt') + insert,
      B2: text('dale-c2.txt') + insert,
      B3: text('dale-c3.txt') + insert
    });
    assert.equal(body.status, 'enough');
    const big = markersOf(body, 'signature').find((m) => m.marker === 'big numbers');
    assert.ok(big, JSON.stringify(markersOf(body, 'signature')));
    assert.equal(big.basis, 'habit-phrase');
    assert.equal(big.count, 6);
  });
});

describe('0.2.0: R2 negative bands are refused', () => {
  it('refuses a negative low, naming the feature', () => {
    const features = wideFeatures(false);
    features.first_singular = band(-1, 200, 1000);
    refusedCheck(rangedProfile(features, 5), /first_singular/);
  });

  it('refuses a negative measured low in a confirmed copy, naming the feature', () => {
    const features = wideFeatures(true);
    features.hedges = { ...band(2, 6, 4, 4, 8), decision: 'polish', polish: 'high', measured: { low: -2, high: 12 } };
    refusedCheck(rangedProfile(features, 9), /hedges/);
  });
});

describe('0.2.0: R2 missing needs 3 eligible markers at 500 words or more', () => {
  // 520 words (52 sentences of 10) with no marker of any profile below: not short, so missing is judged.
  const draft = tenWordText(52);
  const eligible = PROFILE.markers.filter((m) => m.class === 'signature' || m.class === 'variant');

  it('fewer than 3 class 1 or 2 markers give missing: false (mutant M1)', () => {
    for (const markers of [THIN_PROFILE.markers, eligible.slice(0, 2)]) {
      const body = checkText({ ...PROFILE, markers }, draft);
      assert.equal(body.words, 520);
      assert.equal(body.short, false);
      assert.equal(body.missing, false, `${markers.length} eligible markers: ${JSON.stringify(body)}`);
      assert.equal(body.pass, true);
    }
  });

  it('3 or more class 1 or 2 markers, none used, give missing: true, and pass is unaffected', () => {
    for (const markers of [eligible.slice(0, 3), PROFILE.markers]) {
      const body = checkText({ ...PROFILE, markers }, draft);
      assert.equal(body.missing, true, JSON.stringify(body));
      assert.equal(body.pass, true);
    }
  });
});

describe('0.2.0: R2 a variant form that is not a function word never folds (mutant M26)', () => {
  it('afterwards stays apart from afterward, and the recurring phrase around it is reported as written', () => {
    const inserts = [
      ['The crew went home afterwards with the tools.', 'We all went home afterwards in the rain.', 'The crew went home afterward on foot.'],
      ['The deer went home afterwards to the woods.', 'Our friends went home afterwards by bus.', 'They went home afterward with cider.'],
      ['The grant team went home afterwards happy.', 'Everyone went home afterwards before dark.', 'The children went home afterward tired.']
    ];
    const body = profileTexts({
      V1: text('dale-c1.txt') + '\n' + inserts[0].join('\n') + '\n',
      V2: text('dale-c2.txt') + '\n' + inserts[1].join('\n') + '\n',
      V3: text('dale-c3.txt') + '\n' + inserts[2].join('\n') + '\n'
    });
    const signature = markersOf(body, 'signature');
    const home = signature.find((m) => m.marker === 'went home');
    assert.ok(home, JSON.stringify(signature));
    assert.equal(home.count, 9);
    assert.equal(signature.some((m) => [m.marker, ...(m.forms || [])].some((s) => /afterward/.test(s))), false, JSON.stringify(signature));
  });
});

describe('0.2.0: R2 each half of the aside rule alone', () => {
  const bare = (name) => text(name).replace(/,/g, '');
  const serialOf = (body) => markersOf(body, 'punctuation').find((m) => /serial/.test(m.marker));
  function profileWithAsides(sentences) {
    const insert = '\n' + sentences.join('\n') + '\n';
    return profileTexts({ P1: bare('dale-c1.txt') + insert, P2: bare('dale-c2.txt') + insert, P3: bare('dale-c3.txt') + insert });
  }

  it('a middle part opening on a subject pronoun breaks the run (mutant M12)', () => {
    const body = profileWithAsides([
      'That is fine, I am told, and true.',
      'The fence, we hope, and the shed.',
      'The soil, they said, and the drain.',
      'The hedge, you know, and the gate.',
      'The bench, he said, and the path.',
      'The cider, she thinks, and the pies.'
    ]);
    assert.ok(findMarker(body, 'signature', /^orchard$/), 'positive control: orchard is reported');
    const serial = serialOf(body);
    assert.ok(!serial || serial.rate <= serial.reference, JSON.stringify(serial));
  });

  it('a middle part from the closed list of asides breaks the run (mutant M12b)', () => {
    const body = profileWithAsides([
      'The deer, of course, and the rabbits.',
      'The grant, frankly, and the cider.',
      'Our arborist, bless her, and two friends.',
      'The fence, as usual, and the shed.',
      'The library, to its credit, and the city.',
      'The soil, in fact, and the drain.'
    ]);
    assert.ok(findMarker(body, 'signature', /^orchard$/), 'positive control: orchard is reported');
    const serial = serialOf(body);
    assert.ok(!serial || serial.rate <= serial.reference, JSON.stringify(serial));
  });
});

describe('0.2.0: R2 count-feature judging', () => {
  const BOOSTER_SENTENCES = [
    'The fence is certainly the first job for the spring.',
    'The gate clearly needs a new hinge before the winter.',
    'The shed obviously needs a new roof before the rain.'
  ];

  it('a band whose scaled high is under 1 still allows 2 (mutant M5)', () => {
    // boosters band 0 to 0 on 1,000 words: H = 0, above only when count > 0 + 2 x sqrt(max(0, 1)) = 2.
    const features = { ...wideFeatures(false), boosters: band(0, 0, 0) };
    const two = checkText(rangedProfile(features, 5), tenWordText(100, { 10: BOOSTER_SENTENCES[0], 50: BOOSTER_SENTENCES[1] }));
    assert.equal(two.words, 1000);
    assert.deepEqual(two.ranges, []);
    const three = checkText(rangedProfile(features, 5), tenWordText(100, { 10: BOOSTER_SENTENCES[0], 50: BOOSTER_SENTENCES[1], 90: BOOSTER_SENTENCES[2] }));
    assert.deepEqual(three.ranges, [{ feature: 'boosters', value: 3, low: 0, high: 0, side: 'above' }]);
  });

  it('overlapping stance entries count once: "it seems to" is one hedge (mutant M8)', () => {
    // 4 sentences holding "it seems to" in 1,000 words: 4 hedges, rate 4. Band 0 to 0: 4 > 2, reported.
    const features = { ...wideFeatures(false), hedges: band(0, 0, 0) };
    const seems = 'It seems to rain on every Monday in the spring.';
    const body = checkText(rangedProfile(features, 5), tenWordText(100, placed([5, 30, 55, 80], seems)));
    assert.equal(body.words, 1000);
    assert.deepEqual(body.ranges, [{ feature: 'hedges', value: 4, low: 0, high: 0, side: 'above' }]);
  });

  it('a sentence of exactly 30 words is long (mutant M16)', () => {
    // 10 sentences of 30 words: long_sentences = 100 per 100 sentences. Band 0 to 0: H = 0, 10 > 2.
    const features = { ...wideFeatures(false), long_sentences: band(0, 0, 0) };
    const body = checkText(rangedProfile(features, 5), textOfLengths(Array(10).fill(30)));
    assert.equal(body.words, 300);
    assert.deepEqual(body.ranges, [{ feature: 'long_sentences', value: 100, low: 0, high: 0, side: 'above' }]);
  });
});

describe('0.2.0: R2 rhythm margins', () => {
  // 100 sentences alternating 5 and 15 words: 1,000 words, mean 10, population sd 5, cv 0.5.
  const alternating = textOfLengths(Array.from({ length: 100 }, (_, i) => (i % 2 ? 15 : 5)));

  it('sentence_cv is judged with the margin 2 x cv / sqrt(2n) (mutant M9)', () => {
    // Band low 0.585: margin 2 x 0.5 / sqrt(200) = 0.0707, bound 0.514; 0.5 is below it.
    // With sqrt(n) the margin would be 0.1 and the bound 0.485, and 0.5 would not be reported.
    const features = { ...wideFeatures(false), sentence_cv: band(0.585, 1, 5) };
    const body = checkText(rangedProfile(features, 5), alternating);
    assert.equal(body.words, 1000);
    assert.deepEqual(body.ranges, [{ feature: 'sentence_cv', value: 0.5, low: 0.585, high: 5, side: 'below' }]);
  });

  it('sentence_mean is judged with the margin 2 x sd / sqrt(n) (mutant M10)', () => {
    // Margin 2 x 5 / sqrt(100) = 1. Band low 10.5: bound 9.5, mean 10 not reported.
    // Band low 11.5: bound 10.5, mean 10 reported below.
    const inside = checkText(rangedProfile({ ...wideFeatures(false), sentence_mean: band(10.5, 20, 100) }, 5), alternating);
    assert.deepEqual(inside.ranges, []);
    const outside = checkText(rangedProfile({ ...wideFeatures(false), sentence_mean: band(11.5, 20, 100) }, 5), alternating);
    assert.deepEqual(outside.ranges, [{ feature: 'sentence_mean', value: 10, low: 11.5, high: 100, side: 'below' }]);
  });

  it('sentence_cv uses the population standard deviation (mutant M36)', () => {
    // 8 sentences alternating 20 and 60 words (320 words): mean 40, population sd 20, cv 0.5
    // (the sample sd would give 0.53). Band high 0.2: margin 2 x 0.5 / sqrt(16) = 0.25; 0.5 > 0.45.
    const features = { ...wideFeatures(false), sentence_cv: band(0, 0.1, 0.2) };
    const body = checkText(rangedProfile(features, 5), textOfLengths([20, 60, 20, 60, 20, 60, 20, 60]));
    assert.equal(body.words, 320);
    assert.deepEqual(body.ranges, [{ feature: 'sentence_cv', value: 0.5, low: 0, high: 0.2, side: 'above' }]);
  });
});

describe('0.2.0: R2 ranges order and class 3 bands', () => {
  const BUT_MARKER = { class: 'punctuation', marker: 'initial_but', rate: 6, reference: 2, count: 20, samples: ['A1', 'A2', 'A3'], spread: 1, weight: 1 };
  const BUT = 'But the crew moved the posts to the shed today.';
  // 1,000 words: 4 hedge sentences and 5 sentences opening on "But", all of 10 words.
  const draft = tenWordText(100, {
    ...placed([3, 33, 63, 93], (i) => HEDGE_SENTENCES[[3, 33, 63, 93].indexOf(i)]),
    ...placed([10, 30, 50, 70, 90], BUT)
  });
  const features = { ...wideFeatures(false), sentence_mean: band(1, 5, 6), hedges: band(0, 0, 0), initial_but: band(0, 0, 0) };

  it('lists entries in the features table order, then punctuation keys (mutant M14)', () => {
    // sentence_mean 10 > 6 (sd 0, margin 0); hedges 4 > 2; initial_but 5 > 2.
    const profile = { ...rangedProfile(features, 5), markers: [...rangedProfile(features, 5).markers, BUT_MARKER] };
    const body = checkText(profile, draft);
    assert.equal(body.words, 1000);
    assert.deepEqual(body.ranges.map((r) => r.feature), ['sentence_mean', 'hedges', 'initial_but'], JSON.stringify(body.ranges));
  });

  it('judges a class 3 band only when the profile holds that class 3 marker (mutant M31)', () => {
    const body = checkText(rangedProfile(features, 5), draft);
    assert.deepEqual(body.ranges.map((r) => r.feature), ['sentence_mean', 'hedges'], JSON.stringify(body.ranges));
  });
});

describe('0.2.0: R2 too little text, chunks and band order', () => {
  it('a draft under 50 words reports avoided only, with every other judgement null (mutant M17)', () => {
    const body = checkText(PROFILE, 'The upshot is that we move the stock towards the back wall on Friday.\n', 'basically\n');
    assert.equal(body.status, 'too-little-text');
    assert.ok(body.words < 50);
    assert.ok(Array.isArray(body.avoided));
    assert.equal(body.dosage, null);
    assert.equal(body.contradicted, null);
    assert.equal(body.ranges, null);
    assert.equal(body.missing, null);
    assert.equal(body.pass, false);
  });

  it('keeps a trailing piece of exactly 250 words (mutant M18b)', () => {
    // Two samples of 75 sentences (750 words): a chunk of 500 and a kept tail of 250 each, 4 chunks.
    const body = profileTexts({
      A: tenWordText(75, placed([0, 1], I_SENTENCE)),
      B: tenWordText(75, placed([2, 60], I_SENTENCE))
    });
    assert.equal(body.status, 'thin');
    assert.equal(body.words, 1500);
    assert.equal(body.ranges.chunks, 4);
  });

  it('refuses a band whose low is above its high, naming the feature (mutant M11)', () => {
    const features = wideFeatures(false);
    features.hedges = band(5, 3, 2);
    refusedCheck(rangedProfile(features, 5), /hedges/);
  });
});

describe('0.2.0: R2 folding exclusions', () => {
  function profileWith(inserts) {
    return profileTexts({
      X1: text('dale-c1.txt') + '\n' + inserts[0].join('\n') + '\n',
      X2: text('dale-c2.txt') + '\n' + inserts[1].join('\n') + '\n',
      X3: text('dale-c3.txt') + '\n' + inserts[2].join('\n') + '\n'
    });
  }
  const allStrings = (body) => markersOf(body, 'signature').flatMap((m) => [m.marker, ...(m.forms || [])]);

  it('never folds a word of the closed exception list: means stays apart from mean (mutant M25)', () => {
    const body = profileWith([
      ['The means test came back late.', 'Our means test form was long.', 'A mean test score was fine.'],
      ['The means test took an hour.', 'Every means test needs a stamp.', 'The mean test result was low.'],
      ['Two means test letters arrived.', 'The means test office shut early.', 'One mean test figure looked odd.']
    ]);
    const means = markersOf(body, 'signature').find((m) => m.marker === 'means test');
    assert.ok(means, JSON.stringify(markersOf(body, 'signature')));
    assert.equal(means.count, 6);
    assert.equal(allStrings(body).includes('mean test'), false, JSON.stringify(markersOf(body, 'signature')));
  });

  it('never folds a word under 4 letters: ads stays apart from ad (mutant M27)', () => {
    const body = profileWith([
      ['The radio ads went out on Monday.', 'Our radio ads drew a crowd.', 'A radio ad ran at noon.'],
      ['The radio ads need a new voice.', 'Every radio ads slot was booked.', 'The radio ad on Friday was short.'],
      ['Two radio ads ran in the evening.', 'The radio ads came from a neighbor.', 'One radio ad stayed on the shelf.']
    ]);
    const ads = markersOf(body, 'signature').find((m) => m.marker === 'radio ads');
    assert.ok(ads, JSON.stringify(markersOf(body, 'signature')));
    assert.equal(ads.count, 6);
    assert.equal(allStrings(body).includes('radio ad'), false, JSON.stringify(markersOf(body, 'signature')));
  });

  it('never folds a word ending in ics: economics stays an uncommon word apart from economic (mutant M28)', () => {
    const body = profileWith([
      ['She studied economics at the college.', 'The economics of a small orchard are odd.', 'The economic case was weak.'],
      ['Our economics teacher came to plant a tree.', 'The economics of cider surprised us.', 'An economic report arrived in May.'],
      ['The economics of fencing are simple.', 'His economics class helped with the budget.', 'The economic outlook was fine.']
    ]);
    const economics = markersOf(body, 'signature').find((m) => m.marker === 'economics');
    assert.ok(economics, JSON.stringify(markersOf(body, 'signature')));
    assert.equal(economics.basis, 'uncommon-word');
    assert.equal(economics.count, 6);
    assert.equal(economics.forms, undefined, JSON.stringify(economics));
  });

  it('a folded word is common when any surface form is: spectacle with spectacles is no uncommon word (mutant M35)', () => {
    // "spectacles" is in the common-word set and "spectacle" is not; folded together, they are common.
    const body = profileWith([
      ['She lost her spectacles in the long grass.', 'The blossom was quite a spectacle in May.'],
      ['His spectacles fell into the compost bin.', 'The cider evening was a spectacle of its own.'],
      ['Two pairs of spectacles turned up by the gate.', 'The storm made a spectacle of the old fence.']
    ]);
    assert.ok(findMarker(body, 'signature', /^orchard$/), 'positive control: orchard is reported');
    assert.equal(allStrings(body).some((s) => /spectacle/.test(s)), false, JSON.stringify(markersOf(body, 'signature')));
  });
});
