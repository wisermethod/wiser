import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync,
  readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareText, characterTimings, delayFor, strictJSON } from '../scripts/speech.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENTRY = fileURLToPath(new URL('../scripts/speech.js', import.meta.url));
const FIXTURE = join(HERE, 'fixtures', 'gapless.mp3');
const sha = x => createHash('sha256').update(x).digest('hex');
const clone = x => structuredClone(x);
const json = x => JSON.stringify(x);
function work(fn) {
  // Workspace-only scratch. A private installed copy lets output tests write
  // beside that copy while still enforcing its own protected directory.
  const dir = mkdtempSync(join(HERE, 'work-'));
  const scripts = join(dir, 'tool', 'scripts');
  mkdirSync(scripts, { recursive: true });
  copyFileSync(ENTRY, join(scripts, 'speech.js'));
  writeFileSync(join(dir, 'tool', 'package.json'), '{"type":"module"}');
  const command = (args, env = {}) => spawnSync(process.execPath, [join(scripts, 'speech.js'), ...args], {
    encoding: 'utf8', env: { ...process.env, ...env }
  });
  const put = (name, content) => {
    const path = join(dir, name); writeFileSync(path, content, { flag: 'wx' }); return path;
  };
  try { return fn({ dir, command, put }); }
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
function alignment(text) {
  const chars = [...text];
  return { characters: chars, character_start_times_seconds: chars.map((_, i) => i / 10),
    character_end_times_seconds: chars.map((_, i) => i / 10 + 0.05) };
}
const SCRIPT = '  Again <emphasis>again</emphasis>. [pause]\nPress <emphasis>New</emphasis> now [pause] and <emphasis>finish.</emphasis>  ';

test('both routes preserve exact UTF-8 identity, repeated words, emphasis and pauses', () => {
  for (const [route, text] of [
    ['elevenlabs', 'Again AGAIN... Press NEW now... and FINISH.'],
    ['chatterbox', 'Again again. <#0.5#> Press New now <#0.5#> and finish.']
  ]) {
    const p = prepareText(SCRIPT, route);
    assert.equal(p.script.text, SCRIPT);
    assert.equal(p.script.sha256, sha(Buffer.from(SCRIPT)));
    assert.equal(p.script.code_points, [...SCRIPT].length);
    assert.equal(p.submitted.text, text);
    assert.equal(p.submitted.sha256, sha(Buffer.from(text)));
    assert.equal(p.submitted.code_points, [...text].length);
    assert.deepEqual(p.tokens, ['Again', 'again.', 'Press', 'New', 'now', 'and', 'finish.']);
    assert.deepEqual(p.words, p.tokens);
    assert.equal(p.correspondence.length, p.tokens.length);
    for (const [i, c] of p.correspondence.entries()) {
      assert.equal(c.script_index, i);
      assert.equal(c.script_token, p.tokens[i]);
      assert.equal([...text].slice(c.route_start, c.route_end).join(''), c.route_word);
      assert.ok(c.spoken_start >= c.route_start && c.spoken_end <= c.route_end);
    }
  }
});
test('emphasis inside a token, Unicode case expansion and code-point offsets', () => {
  const p = prepareText('re<emphasis>peat</emphasis> repeat <emphasis>Straße</emphasis>. 🌍word', 'elevenlabs');
  assert.equal(p.submitted.text, 'rePEAT repeat STRASSE. 🌍word');
  assert.deepEqual(p.tokens, ['repeat', 'repeat', 'Straße.', '🌍word']);
  const times = characterTimings(p, alignment(p.submitted.text));
  assert.equal(times[2].text, 'Straße.');
  assert.equal(times[3].start, p.correspondence[3].spoken_start / 10);
  assert.equal(prepareText('a<emphasis>gain</emphasis> again.', 'chatterbox').submitted.text, 'again again.');
});
test('sentence-ending punctuation stays before the pause ellipsis', () => {
  assert.equal(prepareText('Go! [pause] Now? [pause] Yes.', 'elevenlabs').submitted.text, 'Go!... Now?... Yes.');
});
test('token whitespace includes Unicode separators without normalizing script identity', () => {
  const original = 'one\u2028two\u2029three';
  const p = prepareText(original, 'chatterbox');
  assert.deepEqual(p.tokens, ['one', 'two', 'three']);
  assert.equal(p.submitted.text, 'one two three');
  assert.equal(p.script.text, original);
});
test('NEXT LINE, which a cue counter does not split on, is refused rather than split', () => {
  // A word counter on JavaScript's \s keeps one\u0085two as one token, so splitting it here would lose that cue.
  for (const route of ['elevenlabs', 'chatterbox']) {
    assert.throws(() => prepareText('one\u0085two three', route), /Unsupported control character/);
  }
});
test('5,000 code points are inclusive for original and submitted text', () => {
  const exact = 'a'.repeat(5000);
  for (const route of ['elevenlabs', 'chatterbox']) assert.equal(prepareText(exact, route).submitted.code_points, 5000);
  assert.equal(prepareText('𐐨'.repeat(5000), 'elevenlabs').script.code_points, 5000);
  assert.throws(() => prepareText('𐐨'.repeat(5001), 'elevenlabs'), /Script exceeds/);
  // A pause attached to the preceding token needs an additional route space.
  const near = 'a'.repeat(4991) + '[pause] b';
  assert.equal([...near].length, 5000);
  assert.throws(() => prepareText(near, 'chatterbox'), /Submitted text exceeds/);
  assert.throws(() => prepareText('<emphasis>' + 'ß'.repeat(2501) + '</emphasis>', 'elevenlabs'), /Submitted text exceeds/);
  assert.throws(() => prepareText('a'.repeat(5001), 'chatterbox'), /Script exceeds/);
});

const refusals = [
  ['unknown square tag', 'one [breath] two'], ['unknown angle tag', '<strong>one</strong>'],
  ['numeric tag supplied as script', 'one <#0.5#> two'], ['unclosed emphasis', '<emphasis>one'],
  ['stray emphasis', 'one</emphasis>'], ['nested emphasis', '<emphasis>a<emphasis>b</emphasis></emphasis>'],
  ['empty emphasis', 'one <emphasis> </emphasis> two'], ['malformed emphasis', '<emphasis a>one</emphasis>'],
  ['stray opener', 'one ['], ['stray closer', 'one >'], ['empty speech', ' \n\t'],
  ['marks only', '[pause]<emphasis> </emphasis>'], ['punctuation token', 'one ... two'],
  ['pause within token', 'one[pause]two'], ['leading pause', '[pause] one'],
  ['trailing pause', 'one [pause]'], ['adjacent pauses', 'one [pause] [pause] two'],
  ['control character', 'one\0two']
];
for (const [name, text] of refusals) {
  test(`${name} refuses both routes before writing any artifact`, () => work(({ dir, put, command }) => {
    const input = put('script.txt', text), before = readdirSync(dir).sort();
    for (const route of ['elevenlabs', 'chatterbox']) {
      failure(command(['text', '--script', input, '--route', route, '--output', join(dir, 'prepared.json'),
        '--route-text', join(dir, 'route.txt'), '--words', join(dir, 'words.json')]), /Speech Preparation:/);
      assert.deepEqual(readdirSync(dir).sort(), before);
    }
  }));
}
test('Chatterbox preflights English token exclusions without rewriting them', () => {
  for (const word of ['123', 'café', 'co-operate', 'A/B', 'hello_world']) {
    assert.throws(() => prepareText(`Say ${word}`, 'chatterbox'), /Unsupported English alignment token/);
    assert.equal(prepareText(`Say ${word}`, 'elevenlabs').tokens[1], word);
  }
  assert.deepEqual(prepareText('“Don’t” (stop), again.', 'chatterbox').words, ['“Don’t”', '(stop),', 'again.']);
  assert.throws(() => prepareText('word', 'other'), /Unsupported route/);
});
test('text CLI writes exact route text, words, evidence and one stdout object', () => work(({ dir, put, command }) => {
  const input = put('script.txt', '\uFEFF' + SCRIPT);
  const paths = ['prepared.json', 'route.txt', 'words.json'].map(p => join(dir, p));
  const before = readFileSync(input);
  const p = success(command(['text', '--script', input, '--route', 'chatterbox', '--output', paths[0], '--route-text', paths[1], '--words', paths[2]]));
  assert.deepEqual(JSON.parse(readFileSync(paths[0], 'utf8')), p);
  assert.equal(readFileSync(paths[1], 'utf8'), p.submitted.text);
  assert.deepEqual(JSON.parse(readFileSync(paths[2], 'utf8')), p.tokens);
  assert.equal(p.script.sha256, sha(before));
  assert.deepEqual(readFileSync(input), before);
}));
test('invalid UTF-8 fails without replacement or files', () => work(({ dir, put, command }) => {
  failure(command(['text', '--script', put('bad.txt', Buffer.from([0xc3, 0x28])), '--route', 'elevenlabs', '--output', join(dir, 'out.json')]), /UTF-8/);
  assert.ok(!existsSync(join(dir, 'out.json')));
}));
test('character timings keep repeated original tokens and exclude pause punctuation', () => {
  const p = prepareText(SCRIPT, 'elevenlabs'), a = alignment(p.submitted.text);
  const got = characterTimings(p, a);
  assert.deepEqual(got.map(w => w.text), p.tokens);
  assert.equal(got[0].start, 0);
  assert.equal(got[1].end, a.character_end_times_seconds[10]);
  for (const [i, c] of p.correspondence.entries()) {
    assert.equal(got[i].start, a.character_start_times_seconds[c.spoken_start]);
    assert.equal(got[i].end, a.character_end_times_seconds[c.spoken_end - 1]);
  }
});
const defects = [
  ['characters differ', a => a.characters[0] = 'X'],
  ['missing word', a => { for (const k of Object.keys(a)) a[k].splice(0, 6); }],
  ['short starts', a => a.character_start_times_seconds.pop()],
  ['empty arrays', a => { for (const k of Object.keys(a)) a[k] = []; }],
  ['multi-character entry', a => a.characters[0] = 'AA'],
  ['non-string character', a => a.characters[0] = null],
  ['string time', a => a.character_start_times_seconds[0] = '0'],
  ['boolean time', a => a.character_end_times_seconds[0] = true],
  ['negative time', a => a.character_start_times_seconds[0] = -1],
  ['nonfinite time', a => a.character_end_times_seconds[0] = Infinity],
  ['NaN time', a => a.character_start_times_seconds[0] = NaN],
  ['backward bound', a => a.character_end_times_seconds[0] = -0.1],
  ['unordered starts', a => a.character_start_times_seconds[4] = 0],
  ['unordered ends', a => a.character_end_times_seconds[3] = 0.7],
  ['extra key', a => a.extra = true]
];
for (const [name, corrupt] of defects) test(`alignment refuses ${name}`, () => {
  const p = prepareText(SCRIPT, 'elevenlabs'), a = alignment(p.submitted.text);
  corrupt(a); assert.throws(() => characterTimings(p, a), /Alignment|character time/);
});
test('alignment characters are the submitted code points one for one, never surrogate halves', () => {
  const p = prepareText('A \u{10428} B', 'elevenlabs');
  const text = p.submitted.text;
  const halves = ['A', ' ', '\uD801', '\uDC28', ' ', 'B'];
  assert.equal(halves.join(''), text);
  const bad = { characters: halves, character_start_times_seconds: halves.map((_, i) => i / 10),
    character_end_times_seconds: halves.map((_, i) => i / 10 + 0.05) };
  assert.throws(() => characterTimings(p, bad), /Alignment characters must equal/);
  const times = characterTimings(p, alignment(text));
  assert.equal(times[2].text, 'B');
  assert.equal(times[2].start, ([...text].length - 1) / 10);
});
test('preparation evidence and correspondence cannot be changed or reordered', () => {
  const p = prepareText(SCRIPT, 'elevenlabs'), a = alignment(p.submitted.text);
  for (const corrupt of [q => q.tokens.reverse(), q => q.words.pop(), q => q.correspondence[0].script_index = 1,
    q => q.script.sha256 = '0'.repeat(64), q => q.submitted.text += '!', q => q.correspondence[1].spoken_end++,
    q => q.extra = true, q => q.version = true]) {
    const q = clone(p); corrupt(q); assert.throws(() => characterTimings(q, a), /Prepared text/);
  }
  assert.throws(() => characterTimings(prepareText('again', 'chatterbox'), a), /elevenlabs/);
});
test('strict JSON refuses escaped duplicates at every nesting level', () => {
  for (const text of ['{"a":1,"a":2}', '{"a":[{"b":1,"\\u0062":2}]}', '[{"a":1,"a":2}]']) assert.throws(() => strictJSON(text), /Duplicate/);
  for (const text of ['{"a":1,}', '/* comment */{}', '{"a":NaN}']) assert.throws(() => strictJSON(text), /Invalid JSON/);
  assert.deepEqual(strictJSON('{"a":[{},[],true,null,"a,}:b"],"b":2}'), { a: [{}, [], true, null, 'a,}:b'], b: 2 });
});
test('timing CLI writes the array and refuses mismatched/duplicate evidence with no output', () => work(({ dir, put, command }) => {
  const p = prepareText('Go <emphasis>again</emphasis>. [pause] Go again.', 'elevenlabs');
  const pp = put('prepared.json', json(p)), aa = alignment(p.submitted.text);
  const ap = put('alignment.json', json(aa)), out = join(dir, 'timings.json');
  const r = success(command(['character-timings', '--prepared', pp, '--alignment', ap, '--output', out]));
  assert.deepEqual(JSON.parse(readFileSync(out, 'utf8')), r.timings);
  const bad = clone(aa); bad.characters[0] = 'x';
  const bp = put('bad.json', json(bad));
  failure(command(['character-timings', '--prepared', pp, '--alignment', bp, '--output', join(dir, 'bad-out.json')]), /characters/);
  const dp = put('duplicate.json', json(p).replace('"version":1', '"version":1,"version":1'));
  failure(command(['character-timings', '--prepared', dp, '--alignment', ap, '--output', join(dir, 'bad-out.json')]), /Duplicate/);
  assert.ok(!existsSync(join(dir, 'bad-out.json')));
}));

function wav({ rate = 24000, channels = 1, bits = 24, samples = 2401 } = {}) {
  const bytes = bits / 8, data = Buffer.alloc(samples * channels * bytes), header = Buffer.alloc(44);
  for (let i = 0; i < samples * channels; i++) {
    const sample = (i % 97 - 48) * 512;
    if (bits === 24) data.writeIntLE(sample * 256, i * bytes, 3);
    else data.writeInt16LE(sample, i * bytes);
  }
  header.write('RIFF'); header.writeUInt32LE(36 + data.length, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * channels * bytes, 28);
  header.writeUInt16LE(channels * bytes, 32); header.writeUInt16LE(bits, 34);
  header.write('data', 36); header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}
function pcmData(bytes) {
  for (let at = 12; at + 8 <= bytes.length;) {
    const size = bytes.readUInt32LE(at + 4);
    if (bytes.toString('ascii', at, at + 4) === 'data') return bytes.subarray(at + 8, at + 8 + size);
    at += 8 + size + size % 2;
  }
  assert.fail('Missing WAV data chunk');
}
for (const options of [{}, { rate: 44100, channels: 2, bits: 24, samples: 1001 }, { rate: 48000, channels: 1, bits: 16, samples: 1703 }]) {
  test(`PCM preserves clock, channels, length and amplitude ${json(options)}`, () => work(({ dir, put, command }) => {
    const original = wav(options), input = put('source.wav', original), out = join(dir, 'out.wav'), desc = join(dir, 'pcm.json');
    const r = success(command(['pcm', '--input', input, '--output', out, '--descriptor', desc]));
    assert.equal(r.basis, 'pcm'); assert.equal(r.removed, 0); assert.equal(r.stated, null); assert.equal(r.usable, true);
    assert.equal(r.rate, options.rate ?? 24000); assert.equal(r.channels, options.channels ?? 1);
    assert.equal(r.sample_count, options.samples ?? 2401); assert.equal(r.codec, 'pcm_s16le'); assert.equal(r.time_base, `1/${r.rate}`);
    assert.deepEqual(r.source.before, { bytes: original.length, sha256: sha(original) });
    assert.deepEqual(r.source.before, r.source.after); assert.deepEqual(readFileSync(input), original);
    const bytes = readFileSync(out); assert.equal(r.bytes, bytes.length); assert.equal(r.sha256, sha(bytes));
    assert.deepEqual(JSON.parse(readFileSync(desc, 'utf8')), r);
    const data = pcmData(bytes);
    assert.equal(data.length, r.sample_count * r.channels * 2);
    for (let i = 0; i < data.length / 2; i++) assert.equal(data.readInt16LE(i * 2), (i % 97 - 48) * 512);
  }));
}
test('MP3 gapless fixture: header skip applied once, source bytes unchanged', () => work(({ dir, command }) => {
  const before = readFileSync(FIXTURE), output = join(dir, 'out.wav');
  const r = success(command(['pcm', '--input', FIXTURE, '--output', output]));
  assert.equal(r.basis, 'header_skip_samples'); assert.equal(r.removed, 0); assert.equal(r.stated, 1105);
  assert.equal(r.sample_count, 11025); assert.equal(r.rate, 44100); assert.equal(r.channels, 1);
  assert.deepEqual(r.source.before, r.source.after); assert.deepEqual(readFileSync(FIXTURE), before);
}));
test('headerless LAME removes exactly 1105 samples; unknown writes no WAV', () => work(({ dir, put, command }) => {
  const withoutHeader = readFileSync(FIXTURE).subarray(417);
  assert.match(withoutHeader.toString('latin1'), /LAME[0-9]/);
  const input = put('lame.mp3', withoutHeader), out = join(dir, 'out.wav');
  const decoded = spawnSync('ffmpeg', ['-nostdin', '-v', 'error', '-f', 'mp3', '-i', input, '-f', 's16le', '-c:a', 'pcm_s16le', 'pipe:1']);
  assert.equal(decoded.status, 0, String(decoded.stderr));
  const r = success(command(['pcm', '--input', input, '--output', out]));
  assert.equal(r.basis, 'lame_no_header'); assert.equal(r.removed, 1105); assert.equal(r.stated, null);
  assert.equal(r.sample_count, decoded.stdout.length / 2 - 1105);
  assert.deepEqual(pcmData(readFileSync(out)), decoded.stdout.subarray(1105 * 2));
  assert.deepEqual(readFileSync(input), withoutHeader);
  const unknown = Buffer.from(withoutHeader.toString('latin1').replace(/LAME(?=[0-9])/g, 'NONE'), 'latin1');
  const up = put('unknown.mp3', unknown), uo = join(dir, 'unknown.wav'), descriptor = join(dir, 'unknown.json');
  const u = success(command(['pcm', '--input', up, '--output', uo, '--descriptor', descriptor]));
  assert.equal(u.basis, 'unknown'); assert.equal(u.usable, false); assert.equal(u.output, null);
  for (const key of ['sample_count', 'bytes', 'sha256', 'codec', 'time_base']) assert.equal(u[key], null);
  assert.deepEqual(u.source.before, u.source.after); assert.ok(!existsSync(uo));
  assert.equal(JSON.parse(readFileSync(descriptor, 'utf8')).usable, false);
}));
test('malformed Skip Samples is refused instead of falling through to LAME', () => {
  for (const skip of [-1, true, 0.5, '1105', Infinity, undefined]) assert.throws(() => delayFor({ packets: [{ side_data_list: [{ side_data_type: 'Skip Samples', skip_samples: skip }] }] }, true), /Invalid Skip Samples/);
  assert.throws(() => delayFor({ packets: [{ side_data_list: [{ side_data_type: 'Skip Samples', skip_samples: 1 }, { side_data_type: 'Skip Samples', skip_samples: 2 }] }] }, true), /Invalid Skip Samples/);
  assert.deepEqual(delayFor({ packets: [{ side_data_list: [{ side_data_type: 'Skip Samples', skip_samples: 0 }] }] }, false), { basis: 'header_skip_samples', removed: 0, stated: 0 });
  assert.throws(() => delayFor({ packets: [{ side_data_list: [null] }] }, true), /Malformed/);
});

// These stand-ins exercise failure paths unavailable with a healthy real
// FFmpeg. Neither program can contact a service or read any unlisted file.
function standIns(dir, mode) {
  const bin = join(dir, 'bin'); mkdirSync(bin);
  const metadata = { codec_type: 'audio', codec_name: 'pcm_s16le', sample_rate: '24000', channels: 1, time_base: '1/24000', duration_ts: 2401 };
  const mutations = {
    codec: { codec_name: 'pcm_s24le' }, rate: { sample_rate: '16000' }, channels: { channels: 2 },
    time_base: { time_base: '1/1000' }, samples: { duration_ts: 2400 }, boolean_samples: { duration_ts: true },
    fractional_samples: { duration_ts: 2401.5 }
  };
  for (const [name, body] of [
    ['ffprobe', `
const args = process.argv.slice(2);
if (args.includes('-version')) process.exit(0);
const meta = ${json(metadata)};
if (args.at(-1).endsWith('out.wav')) Object.assign(meta, ${json(mutations[mode] ?? {})});
process.stdout.write(JSON.stringify({streams:[meta]}));`],
    ['ffmpeg', `
import { appendFileSync, copyFileSync } from 'node:fs';
const args = process.argv.slice(2);
if (args.includes('-version')) process.exit(0);
const input = args[args.indexOf('-i') + 1], output = args.at(-1);
if (${json(mode)} !== 'no_output') copyFileSync(input, output, 1);
if (${json(mode)} === 'change_source') appendFileSync(input, 'x');
if (${json(mode)} === 'printed') process.stderr.write('DO_NOT_ECHO_RAW_LOG');`]
  ]) {
    const path = join(bin, name);
    writeFileSync(path, `#!${process.execPath}\n${body}\n`, { flag: 'wx' }); chmodSync(path, 0o755);
  }
  // Extensionless stand-ins use ESM imports under the nearest package scope.
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}', { flag: 'wx' });
  return bin;
}
for (const mode of ['codec', 'rate', 'channels', 'time_base', 'samples', 'boolean_samples', 'fractional_samples', 'no_output', 'printed', 'change_source']) {
  test(`PCM refuses ${mode} after decoder/readback instead of reporting success`, () => work(({ dir, put, command }) => {
    const input = put('source.wav', wav({ bits: 16 })), output = join(dir, 'out.wav');
    const original = readFileSync(input), bin = standIns(dir, mode);
    const r = command(['pcm', '--input', input, '--output', output], { PATH: bin });
    failure(r, mode === 'change_source' ? /Source changed.*before.*after/ : /readback|no WAV|silently/);
    assert.doesNotMatch(r.stderr, /DO_NOT_ECHO_RAW_LOG/);
    assert.equal(existsSync(output), mode !== 'no_output');
    if (mode !== 'change_source') assert.deepEqual(readFileSync(input), original);
    else assert.equal(readFileSync(input).length, original.length + 1);
  }));
}

test('help and import work without FFmpeg; flags are closed before reads', () => work(({ dir, command }) => {
  for (const args of [[], ['help'], ['--help'], ['text', '--help'], ['pcm', '-h']]) {
    const r = command(args, { PATH: dir }); assert.equal(r.status, 0); assert.match(r.stdout, /Usage/); assert.equal(r.stderr, '');
  }
  for (const args of [['text', '--install'], ['pcm', '--env', '/not-read'], ['text', '--typo'], ['help', '--typo'], ['text', '--route', 'elevenlabs', '--route', 'chatterbox'], ['pcm', 'extra'], ['no-command']]) failure(command(args, { PATH: dir }), /help/);
  failure(command(['text']), /--script is required/);
  const imported = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${json(ENTRY)}); process.stdout.write('imported')`], { encoding: 'utf8', env: { ...process.env, PATH: dir } });
  assert.equal(imported.status, 0, imported.stderr); assert.equal(imported.stdout, 'imported');
}));
test('missing FFmpeg/ffprobe are named, and text does not require either', () => work(({ dir, put, command }) => {
  const input = put('source.wav', wav()), output = join(dir, 'out.wav');
  failure(command(['pcm', '--input', input, '--output', output], { PATH: dir }), /Missing ffmpeg; check: ffmpeg -version/);
  const stub = put('ffmpeg', '#!/bin/sh\nexit 0\n');
  // The entry is a synthetic executable, never an installed program.
  chmodSync(stub, 0o755);
  failure(command(['pcm', '--input', input, '--output', output], { PATH: dir }), /Missing ffprobe; check: ffprobe -version/);
  success(command(['text', '--script', put('script.txt', 'one'), '--route', 'elevenlabs', '--output', join(dir, 'out.json')], { PATH: dir }));
  assert.ok(!existsSync(output));
}));
test('all existing destinations, aliases and duplicate outputs are refused unchanged', () => work(({ dir, put, command }) => {
  const text = put('script.txt', 'one two'), occupied = put('existing.json', 'keep'), audio = put('source.wav', wav());
  for (const flag of ['--output', '--route-text', '--words']) {
    const args = ['text', '--script', text, '--route', 'elevenlabs', '--output', flag === '--output' ? occupied : join(dir, 'prepared.json')];
    if (flag !== '--output') args.push(flag, occupied);
    failure(command(args), /already exists/); assert.equal(readFileSync(occupied, 'utf8'), 'keep');
    assert.ok(!existsSync(join(dir, 'prepared.json')));
  }
  failure(command(['text', '--script', text, '--route', 'elevenlabs', '--output', join(dir, 'same.json'), '--words', join(dir, 'same.json')]), /coincide/);
  const p = put('p.json', json(prepareText('one', 'elevenlabs'))), a = put('a.json', json(alignment('one')));
  failure(command(['character-timings', '--prepared', p, '--alignment', a, '--output', occupied]), /already exists/);
  failure(command(['pcm', '--input', audio, '--output', audio]), /already exists/);
  failure(command(['pcm', '--input', audio, '--output', join(dir, 'out.wav'), '--descriptor', occupied]), /already exists/);
  symlinkSync(occupied, join(dir, 'alias.json'));
  failure(command(['text', '--script', text, '--route', 'elevenlabs', '--output', join(dir, 'alias.json')]), /already exists/);
}));
test('paths must be absolute, canonical, outside the tool, and unprotected', () => work(({ dir, put, command }) => {
  const script = put('script.txt', 'one'), base = ['text', '--route', 'elevenlabs'];
  for (const [input, output, match] of [
    ['relative.txt', join(dir, 'out.json'), /absolute/], [script, 'relative.json', /absolute/],
    [join(dir, 'missing.txt'), join(dir, 'out.json'), /Filesystem/],
    [script, join(dir, 'tool', 'inside.json'), /inside this tool/],
    [join(dir, '.env'), join(dir, 'out.json'), /Protected/],
    [join(dir, 'memory', 'data.txt'), join(dir, 'out.json'), /Protected/],
    [script, join(dir, '.env.file'), /Protected/], [script, join(dir, 'auth-provider.env'), /Protected/]
  ]) failure(command([...base, '--script', input, '--output', output]), match);
  symlinkSync(join(dir, 'tool'), join(dir, 'tool-alias'));
  failure(command([...base, '--script', script, '--output', join(dir, 'tool-alias', 'inside.json')]), /inside this tool/);
  symlinkSync(join(dir, 'not-present'), join(dir, 'broken'));
  failure(command([...base, '--script', script, '--output', join(dir, 'broken')]), /Broken symbolic link/);
  symlinkSync(join(dir, 'loop'), join(dir, 'loop'));
  failure(command([...base, '--script', script, '--output', join(dir, 'loop')]), /resolved/);
  symlinkSync(join(dir, '.env'), join(dir, 'hidden.txt'));
  failure(command([...base, '--script', join(dir, 'hidden.txt'), '--output', join(dir, 'out.json')]), /Broken symbolic link/);
  linkSync(script, join(dir, 'hard.txt'));
  failure(command([...base, '--script', join(dir, 'hard.txt'), '--output', join(dir, 'out.json')]), /one link/);
}));
test('an MP3 carrying another stream, such as cover art, is refused and publishes no WAV', () => work(({ dir, command }) => {
  const cover = join(dir, 'cover.png'), withArt = join(dir, 'with-art.mp3'), output = join(dir, 'out.wav');
  const make = (args) => assert.equal(spawnSync('ffmpeg', ['-v', 'error', '-n', ...args]).status, 0);
  make(['-f', 'lavfi', '-i', 'color=c=red:s=16x16', '-frames:v', '1', cover]);
  make(['-i', FIXTURE, '-i', cover, '-map', '0:a', '-map', '1:v', '-c', 'copy', '-id3v2_version', '3',
    '-disposition:v', 'attached_pic', withArt]);
  failure(command(['pcm', '--input', withArt, '--output', output]), /exactly one audio stream/);
  assert.ok(!existsSync(output));
}));
test('wrong audio formats and malformed media never publish a WAV', () => work(({ dir, put, command }) => {
  for (const name of ['wrong.mp3', 'wrong.wav', 'wrong.ogg']) {
    failure(command(['pcm', '--input', put(name, 'not audio'), '--output', join(dir, 'out.wav')]), /Speech Preparation:/);
    assert.ok(!existsSync(join(dir, 'out.wav')));
  }
  const input = put('valid.wav', wav());
  failure(command(['pcm', '--input', input, '--output', join(dir, 'out.mp3')]), /new .wav/);
}));
