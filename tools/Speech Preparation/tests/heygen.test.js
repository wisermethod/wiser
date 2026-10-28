import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync,
  readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareText, characterTimings } from '../scripts/speech.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENTRY = fileURLToPath(new URL('../scripts/speech.js', import.meta.url));
const json = value => JSON.stringify(value);
const sha = text => createHash('sha256').update(text).digest('hex');
function work(fn) {
  // All scratch stays in this workspace. CLI outputs sit outside a private
  // script copy, so the real tool's destination boundary is still exercised.
  const dir = mkdtempSync(join(HERE, 'heygen-work-'));
  const scripts = join(dir, 'tool', 'scripts');
  mkdirSync(scripts, { recursive: true });
  const entry = join(scripts, 'speech.js');
  copyFileSync(ENTRY, entry);
  writeFileSync(join(dir, 'tool', 'package.json'), '{"type":"module"}');
  const put = (name, content) => {
    const path = join(dir, name); writeFileSync(path, content, { flag: 'wx' }); return path;
  };
  const command = args => spawnSync(process.execPath, [entry, ...args], {
    encoding: 'utf8', env: { ...process.env, PATH: dir }
  });
  try { return fn({ dir, entry, put, command }); }
  finally { rmSync(dir, { recursive: true, force: true }); }
}
function success(result) {
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  return JSON.parse(result.stdout);
}
function failure(result, pattern) {
  assert.equal(result.status, 1, result.stdout);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, pattern);
}
// Invented connector-shaped timings, with no vendor media or proof-run data.
function alignment(text) {
  return { original_characters: [...text].map((text, i) => ({ text, start_time: i / 10, end_time: i / 10 + 0.05 })) };
}
const SCRIPT = ' \t“Go,” [pause]\n“<emphasis>Go</emphasis>,” re<emphasis>peat</emphasis> café-2. \u{1F30D}word\u2028𐐨\u0301!  ';
const SUBMITTED = '“Go,” “Go,” repeat café-2. \u{1F30D}word 𐐨\u0301!';
const TOKENS = ['“Go,”', '“Go,”', 'repeat', 'café-2.', '\u{1F30D}word', '𐐨\u0301!'];
const RANGES = [[0, 5, 1, 3], [6, 11, 7, 9], [12, 18, 12, 18],
  [19, 26, 19, 25], [27, 32, 28, 32], [33, 36, 33, 35]];

test('HeyGen plain instant-voice text preserves identity, spelling and code-point correspondence', () => {
  const p = prepareText(SCRIPT, 'heygen');
  assert.equal(p.route, 'heygen'); assert.equal(p.version, 1);
  assert.deepEqual(p.script, { text: SCRIPT, code_points: [...SCRIPT].length, sha256: sha(SCRIPT) });
  assert.deepEqual(p.submitted, { text: SUBMITTED, code_points: 36, sha256: sha(SUBMITTED) });
  assert.deepEqual(p.tokens, TOKENS); assert.deepEqual(p.words, TOKENS);
  assert.deepEqual(p.correspondence, RANGES.map(([route_start, route_end, spoken_start, spoken_end], i) => ({
    script_index: i, script_token: TOKENS[i], route_word: TOKENS[i],
    route_start, route_end, spoken_start, spoken_end
  })));
  assert.equal(prepareText('Go![pause] Now? [pause] Yes.', 'heygen').submitted.text, 'Go! Now? Yes.');
  assert.equal(prepareText('<emphasis>Straße</emphasis> 123 co-operate A/B hello_world', 'heygen').submitted.text,
    'Straße 123 co-operate A/B hello_world');
});
test('HeyGen accepts 5,000 code points without Chatterbox alignment or case-expansion limits', () => {
  const p = prepareText('𐐨'.repeat(5000), 'heygen');
  assert.equal(p.submitted.code_points, 5000);
  assert.equal(p.submitted.text, p.script.text);
  const near = 'a'.repeat(4991) + '[pause] b';
  assert.equal([...near].length, 5000);
  assert.equal(prepareText(near, 'heygen').submitted.text, 'a'.repeat(4991) + ' b');
  assert.equal(prepareText('<emphasis>' + 'ß'.repeat(2501) + '</emphasis>', 'heygen').submitted.text, 'ß'.repeat(2501));
});
test('HeyGen text CLI writes exact artifacts without FFmpeg, packages or configuration', () => work(({ dir, put, command }) => {
  const input = put('script.txt', '\uFEFF' + SCRIPT), original = readFileSync(input);
  const output = join(dir, 'prepared.json'), route = join(dir, 'route.txt'), words = join(dir, 'words.json');
  const p = success(command(['text', '--script', input, '--route', 'heygen', '--output', output,
    '--route-text', route, '--words', words]));
  assert.deepEqual(JSON.parse(readFileSync(output, 'utf8')), p);
  assert.equal(readFileSync(route, 'utf8'), SUBMITTED);
  assert.deepEqual(JSON.parse(readFileSync(words, 'utf8')), TOKENS);
  assert.equal(p.script.sha256, sha(original));
  assert.deepEqual(readFileSync(input), original);
  const help = command(['help']);
  assert.equal(help.status, 0); assert.match(help.stdout, /heygen/); assert.equal(help.stderr, '');
}));

const refusedScripts = [
  ['unknown square tag', 'one [breath] two'], ['unknown angle tag', '<strong>one</strong>'],
  ['route tag in script', 'one <#0.5#> two'], ['unclosed emphasis', '<emphasis>one'],
  ['stray emphasis', 'one</emphasis>'], ['nested emphasis', '<emphasis>a<emphasis>b</emphasis></emphasis>'],
  ['empty emphasis', 'one <emphasis> </emphasis> two'], ['malformed emphasis', '<emphasis a>one</emphasis>'],
  ['stray square opener', 'one ['], ['stray square closer', 'one ]'],
  ['stray angle opener', 'one <'], ['stray angle closer', 'one >'],
  ['empty speech', ' \n\t'], ['marks only', '[pause]<emphasis> </emphasis>'],
  ['punctuation token', 'one ... two'], ['pause inside token', 'one[pause]two'],
  ['leading pause', '[pause] one'], ['trailing pause', 'one [pause]'],
  ['repeated pauses', 'one [pause] [pause] two'], ['control character', 'one\0two'],
  ['NEXT LINE', 'one\u0085two'], ['oversized script', '𐐨'.repeat(5001)],
  ['invalid UTF-8', Buffer.from([0xc3, 0x28])]
];
for (const [name, script] of refusedScripts) test(`HeyGen refuses ${name} before writing any artifact`, () => work(({ dir, put, command }) => {
  const input = put('script.txt', script), before = readdirSync(dir).sort();
  failure(command(['text', '--script', input, '--route', 'heygen', '--output', join(dir, 'prepared.json'),
    '--route-text', join(dir, 'route.txt'), '--words', join(dir, 'words.json')]), /Speech Preparation:/);
  assert.deepEqual(readdirSync(dir).sort(), before);
}));
test('HeyGen refuses invalid Unicode through its imported API', () => {
  for (const script of [null, 7, '\uD801word', 'word\uDC28']) {
    assert.throws(() => prepareText(script, 'heygen'), /valid Unicode/);
  }
});

test('HeyGen timings retain repeated tokens and exclude edge punctuation by code point', () => {
  const p = prepareText(SCRIPT, 'heygen'), a = alignment(SUBMITTED);
  assert.deepEqual(characterTimings(p, a), TOKENS.map((text, i) => ({
    text, start: RANGES[i][2] / 10, end: (RANGES[i][3] - 1) / 10 + 0.05
  })));
  assert.equal(characterTimings(prepareText('one', 'heygen'), {
    original_characters: [...'one'].map(text => ({ text, start_time: 0, end_time: 0 }))
  })[0].end, 0); // Equal times are ordered, including zero-duration characters.
});
const defects = [
  ['null alignment', () => null], ['array alignment', a => a.original_characters],
  ['missing characters', () => ({})], ['null characters', () => ({ original_characters: null })],
  ['nonarray characters', () => ({ original_characters: {} })],
  ['empty characters', () => ({ original_characters: [] })],
  ['extra top-level key', a => ({ ...a, extra: true })],
  ['transport envelope', a => ({ timings: a })],
  ['ElevenLabs form', () => ({ characters: ['a'], character_start_times_seconds: [0], character_end_times_seconds: [0.1] })],
  ['null entry', a => { a.original_characters[0] = null; }],
  ['array entry', a => { a.original_characters[0] = []; }],
  ['string entry', a => { a.original_characters[0] = '“'; }],
  ['missing text', a => { delete a.original_characters[0].text; }],
  ['missing start', a => { delete a.original_characters[0].start_time; }],
  ['missing end', a => { delete a.original_characters[0].end_time; }],
  ['extra entry key', a => { a.original_characters[0].extra = true; }],
  ['changed character', a => { a.original_characters[1].text = 'X'; }],
  ['reordered characters', a => { [a.original_characters[1].text, a.original_characters[2].text] = ['o', 'G']; }],
  ['nonstring character', a => { a.original_characters[0].text = null; }],
  ['multicharacter entry', a => { a.original_characters[0].text = '“G'; }],
  ['empty character', a => { a.original_characters[0].text = ''; }],
  ['missing word', a => { a.original_characters.splice(0, 6); }],
  ['extra character', a => { a.original_characters.push({ text: '!', start_time: 4, end_time: 4.1 }); }],
  ['string time', a => { a.original_characters[0].start_time = '0'; }],
  ['boolean time', a => { a.original_characters[0].end_time = true; }],
  ['null time', a => { a.original_characters[0].start_time = null; }],
  ['negative start', a => { a.original_characters[0].start_time = -1; }],
  ['negative end', a => { a.original_characters[0].end_time = -0.1; }],
  ['end before start', a => { a.original_characters[4].end_time = 0.39; }],
  ['unordered starts', a => { a.original_characters[4].start_time = 0.2; }],
  ['unordered ends', a => { a.original_characters[3].end_time = 0.7; }]
];
for (const [name, corrupt] of defects) test(`HeyGen timings refuse ${name} without output`, () => work(({ dir, put, command }) => {
  const p = prepareText(SCRIPT, 'heygen'), a = alignment(SUBMITTED);
  const bad = corrupt(a), input = bad === undefined ? a : bad;
  assert.throws(() => characterTimings(p, input), /Alignment|character time/);
  const pp = put('prepared.json', json(p)), ap = put('alignment.json', json(input)), output = join(dir, 'out.json');
  failure(command(['character-timings', '--prepared', pp, '--alignment', ap, '--output', output]), /Alignment|character time/);
  assert.ok(!existsSync(output));
}));
test('HeyGen rejects all nonfinite numeric bounds, including values JSON cannot encode', () => {
  const p = prepareText(SCRIPT, 'heygen');
  for (const key of ['start_time', 'end_time']) for (const value of [NaN, Infinity, -Infinity]) {
    const a = alignment(SUBMITTED); a.original_characters[0][key] = value;
    assert.throws(() => characterTimings(p, a), /Invalid character time/);
  }
});
test('HeyGen refuses surrogate halves even when concatenated text is identical', () => {
  const p = prepareText('A 𐐨 B', 'heygen');
  const a = alignment(p.submitted.text), halves = p.submitted.text.split('');
  assert.equal(halves.join(''), p.submitted.text);
  a.original_characters = halves.map((text, i) => ({ text, start_time: i / 10, end_time: i / 10 + 0.05 }));
  assert.throws(() => characterTimings(p, a), /Alignment characters/);
});
test('HeyGen preparation is regenerated and every evidence field is checked', () => {
  const p = prepareText(SCRIPT, 'heygen'), a = alignment(SUBMITTED);
  for (const corrupt of [q => q.tokens.reverse(), q => q.words.pop(), q => q.correspondence.reverse(),
    q => q.correspondence[0].script_index++, q => q.correspondence[0].spoken_end++,
    q => q.script.sha256 = '0'.repeat(64), q => q.submitted.text += '!',
    q => q.submitted.code_points++, q => q.submitted.sha256 = '0'.repeat(64),
    q => q.extra = true, q => q.version = true]) {
    const bad = structuredClone(p); corrupt(bad);
    assert.throws(() => characterTimings(bad, a), /Prepared text/);
  }
  for (const bad of [null, {}, { route: 'other' }, prepareText('again', 'chatterbox')]) {
    assert.throws(() => characterTimings(bad, a), /preparation/);
  }
  assert.throws(() => characterTimings(prepareText('one', 'elevenlabs'), alignment('one')), /Alignment/);
});
test('HeyGen timing CLI writes the array and refuses duplicate JSON and changed evidence', () => work(({ dir, put, command }) => {
  const p = prepareText(SCRIPT, 'heygen'), a = alignment(SUBMITTED);
  const pp = put('prepared.json', json(p)), ap = put('alignment.json', json(a)), output = join(dir, 'out.json');
  const r = success(command(['character-timings', '--prepared', pp, '--alignment', ap, '--output', output]));
  assert.equal(r.ok, true); assert.equal(r.output, output); assert.equal(r.words, TOKENS.length);
  assert.deepEqual(r.timings, characterTimings(p, a));
  assert.deepEqual(JSON.parse(readFileSync(output, 'utf8')), r.timings);
  const duplicate = put('duplicate.json', json(a).replace('"start_time":0', '"start_time":0,"start_time":0'));
  const duplicatePrepared = put('duplicate-prepared.json', json(p).replace('"version":1', '"version":1,"version":1'));
  const changed = structuredClone(p); changed.correspondence[0].spoken_end++;
  const changedPrepared = put('changed.json', json(changed));
  for (const [prepared, timing, pattern] of [[pp, duplicate, /Duplicate/],
    [duplicatePrepared, ap, /Duplicate/], [changedPrepared, ap, /Prepared text/]]) {
    const out = join(dir, 'bad-out.json');
    failure(command(['character-timings', '--prepared', prepared, '--alignment', timing, '--output', out]), pattern);
    assert.ok(!existsSync(out));
  }
}));

// Each control runs a refusal assertion unchanged against the entry script,
// then against a private mutant. Removing the named guard must fail that test.
for (const [name, guard, replacement, corrupt] of [
  ['code-point equality', 'chars.length !== sent.length || chars.some((c, i) => c !== sent[i])', 'false',
    "a.original_characters[0].text = 'X';"],
  ['start order', 'i > 0 && (starts[i] < starts[i - 1] || ends[i] < ends[i - 1])', 'false',
    'a.original_characters[2].start_time = 0;'],
  ['end order', 'i > 0 && (starts[i] < starts[i - 1] || ends[i] < ends[i - 1])', 'false',
    'a.original_characters[1].end_time = 0.7;']
]) test(`HeyGen ${name} control fails when its guard is removed`, () => work(({ entry }) => {
  const source = readFileSync(entry, 'utf8');
  assert.equal(source.split(guard).length, 2, 'The control must remove exactly one guard.');
  const check = `
    import assert from 'node:assert/strict';
    const { prepareText, characterTimings } = await import(${json(entry)});
    const p = prepareText('one two', 'heygen');
    const a = ${json(alignment('one two'))};
    ${corrupt}
    assert.throws(() => characterTimings(p, a));`;
  const run = () => spawnSync(process.execPath, ['--input-type=module', '-e', check], { encoding: 'utf8' });
  const baseline = run(); assert.equal(baseline.status, 0, baseline.stderr);
  writeFileSync(entry, source.replace(guard, replacement));
  const mutant = run();
  assert.equal(mutant.status, 1); assert.equal(mutant.stdout, '');
  assert.match(mutant.stderr, /ERR_ASSERTION/);
}));
