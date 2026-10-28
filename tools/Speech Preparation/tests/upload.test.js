import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { atSample, clock, seconds } from '../scripts/upload.js';

const TOOL = fileURLToPath(new URL('..', import.meta.url));
const sha = x => createHash('sha256').update(x).digest('hex');
function source(rate = 24000, channels = 1, count = rate) {
  const h = Buffer.alloc(44), pcm = Buffer.alloc(count * channels * 2);
  for (let i = 0; i < count; i++) for (let c = 0; c < channels; c++) {
    // A nonperiodic band-limited clock, with identifiable first/last samples.
    const t = i / rate;
    const value = Math.round(9000 * Math.sin(2 * Math.PI * (330 * t + 900 * t * t)) * (0.6 + 0.3 * Math.sin(2 * Math.PI * 7.3 * t)) +
      3000 * Math.sin(2 * Math.PI * (790 * t + 377 * t * t)) + c * 100);
    pcm.writeInt16LE(value, (i * channels + c) * 2);
  }
  pcm.writeInt16LE(14321, 0); pcm.writeInt16LE(-12345, pcm.length - 2);
  h.write('RIFF'); h.writeUInt32LE(pcm.length + 36, 4); h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * channels * 2, 28); h.writeUInt16LE(channels * 2, 32);
  h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return { bytes: Buffer.concat([h, pcm]), pcm, count, channels, rate };
}
function work(fn) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'wiser-upload-test-'))), tool = join(dir, 'tool');
  mkdirSync(tool);
  cpSync(join(TOOL, 'scripts'), join(tool, 'scripts'), { recursive: true });
  writeFileSync(join(tool, 'package.json'), '{"type":"module"}');
  const entry = join(tool, 'scripts', 'speech.js'), module = join(tool, 'scripts', 'upload.js');
  const command = (args, env = {}) => spawnSync(process.execPath, [entry, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });
  const put = (name, bytes) => { const path = join(dir, name); writeFileSync(path, bytes, { flag: 'wx' }); return path; };
  const context = { dir, tool, entry, module, command, put };
  try {
    const result = fn(context);
    if (result?.then) return result.finally(() => rmSync(dir, { recursive: true, force: true }));
    rmSync(dir, { recursive: true, force: true }); return result;
  } catch (e) { rmSync(dir, { recursive: true, force: true }); throw e; }
}
function ok(r) { assert.equal(r.status, 0, r.stderr); assert.equal(r.stderr, ''); return JSON.parse(r.stdout); }
function refused(r, pattern) { assert.equal(r.status, 1, r.stdout); assert.equal(r.stdout, ''); assert.match(r.stderr, pattern); }
function args(input, bytes, output, recipe = 'wav', mode = ['--lead', '0.025', '--tail', '0.035'], ceiling = '3000000') {
  return ['upload', '--input', input, '--sha256', sha(bytes), '--max-bytes', ceiling, '--recipe', recipe, '--output', output, ...mode];
}
function decode(path, mono = false) {
  const r = spawnSync('ffmpeg', ['-nostdin', '-v', 'error', '-xerror', '-protocol_whitelist', 'file,pipe', '-i', path, '-map', '0:a:0', ...(mono ? ['-ac', '1'] : []), '-f', 's16le', '-c:a', 'pcm_s16le', 'pipe:1'], { maxBuffer: 16 * 1024 * 1024 });
  assert.equal(r.status, 0, String(r.stderr)); assert.equal(r.stderr.length, 0); return r.stdout;
}
const read = path => JSON.parse(readFileSync(path, 'utf8'));
function clean(dir, output) {
  assert.ok(!existsSync(output)); assert.deepEqual(readdirSync(dir).filter(n => n.startsWith('.wiser-speech-upload-')), []);
}
function mutate(module, needle, replacement) {
  const code = readFileSync(module, 'utf8'); assert.equal(code.split(needle).length, 2, needle);
  writeFileSync(module, code.replace(needle, replacement));
}

test('exact decimal and fraction rounding, ties upward, without Number time arithmetic', () => {
  assert.equal(atSample(seconds('0.0000625'), 24000), 2);
  assert.equal(atSample(seconds('1/48000'), 24000), 1);
  assert.equal(atSample(seconds('0.100000000000000000000001'), 44100), 4410);
  for (const t of ['-1', '1e-3', '.5', '1/0', 'NaN', 'Infinity', '1.2/3', ' 1']) assert.throws(() => seconds(t));
});

for (const rate of [24000, 44100]) for (const channels of [1, 2]) for (const mode of ['whole', 'span']) {
  test(`WAV ${mode} ${rate} Hz ${channels} channels: every retained sample and silence after actual decode`, () => work(({ dir, put, command }) => {
    const s = source(rate, channels), input = put('source.wav', s.bytes), output = join(dir, 'bundle');
    // All oracle counts below are literal integers, independent of tool rounding.
    const span = ['--start', `201/${rate * 2}`, '--end', `${rate * 2 - 201}/${rate * 2}`, '--pre-guard', `7/${rate * 2}`, '--post-guard', `11/${rate * 2}`];
    const whole = ['--lead', `7/${rate * 2}`, '--tail', `11/${rate * 2}`];
    const result = ok(command(args(input, s.bytes, output, 'wav', mode === 'span' ? span : whole)));
    const receipt = read(result.receipt), marker = read(result.completion);
    const start = mode === 'span' ? 101 : 0, end = mode === 'span' ? rate - 100 : rate, pre = 4, post = 6;
    const expected = Buffer.concat([Buffer.alloc(pre * channels * 2), s.pcm.subarray(start * channels * 2, end * channels * 2), Buffer.alloc(post * channels * 2)]);
    assert.deepEqual(decode(result.upload), expected);
    assert.deepEqual(decode(join(output, 'padded.wav')), expected);
    assert.deepEqual(receipt.span, { start_sample: start, end_sample: end, start_seconds: receipt.span.start_seconds, end_seconds: receipt.span.end_seconds });
    assert.equal(receipt.mapping.source_sample_at_upload_zero, start - pre);
    assert.equal(receipt.mapping.source_zero_at_upload_sample, pre - start);
    assert.equal(receipt.mapping.retained_upload_end, pre + end - start);
    assert.equal(receipt.silence.before_samples, pre); assert.equal(receipt.silence.after_samples, post);
    assert.equal(receipt.readback.sample_count, pre + end - start + post);
    assert.equal(receipt.readback.correlation.lag_samples, 0);
    assert.ok(receipt.readback.correlation.peak > 0.999999);
    assert.deepEqual(readFileSync(input), s.bytes);
    assert.deepEqual(readdirSync(output).sort(), ['complete.json', 'padded.wav', 'receipt.json', 'upload.wav']);
    for (const [file, id] of Object.entries(marker.files)) {
      const bytes = readFileSync(join(output, file)); assert.deepEqual(id, { bytes: bytes.length, sha256: sha(bytes) });
    }
    if (rate === 44100) {
      assert.deepEqual(receipt.placement_48000.before_at_48000_samples, { numerator: '640', denominator: '147' });
      assert.equal(receipt.placement_48000.requested_before_ceil_48000_samples, '4');
      assert.deepEqual(receipt.placement_48000.before_minus_requested_ceil_48000_samples, { numerator: '52', denominator: '147' });
    }
  }));
}
for (const rate of [24000, 44100]) for (const mode of ['whole', 'span']) {
  test(`MP3 ${mode} ${rate} Hz: mono 64k, gapless count, clock and boundary pulses`, () => work(({ dir, put, command }) => {
    const s = source(rate, 1, rate * 2), input = put('source.wav', s.bytes), output = join(dir, 'bundle');
    const modeArgs = mode === 'whole' ? ['--lead', '0.125', '--tail', '0.25'] : ['--start', '0.10001', '--end', '1.70003', '--pre-guard', '0.125', '--post-guard', '0.25'];
    const r = ok(command(args(input, s.bytes, output, 'mp3', modeArgs))), receipt = read(r.receipt);
    const data = decode(r.upload), padded = decode(join(output, 'padded.wav'));
    assert.equal(data.length, padded.length); assert.equal(receipt.readback.rate, rate);
    assert.equal(receipt.readback.channels, 1); assert.equal(receipt.encoder.bitrate_bits_per_second, 64000);
    assert.equal(receipt.readback.correlation.lag_samples, 0); assert.ok(receipt.readback.correlation.peak >= 0.9);
    assert.ok(receipt.readback.delay.header_skip_samples > 0);
    assert.ok(receipt.readback.delay.end_padding_samples >= 0);
    assert.equal(receipt.readback.sample_count, receipt.padded.sample_count);
    // Lossy ringing near each edge is allowed; deep inserted silence stays quiet.
    const pre = receipt.silence.before_samples, post = receipt.silence.after_samples;
    for (const [a, b] of [[0, pre - 2048], [data.length / 2 - post + 2048, data.length / 2]]) {
      for (let i = a; i < b; i++) assert.ok(Math.abs(data.readInt16LE(i * 2)) <= 2);
    }
    assert.equal(receipt.mapping.retained_upload_start, pre);
    assert.equal(receipt.mapping.retained_upload_end, data.length / 2 - post);
  }));
}
test('MP3 stereo recipe explicitly downmixes; phase cancellation cannot establish a clock', () => work(({ dir, put, command }) => {
  const s = source(24000, 2), input = put('stereo.wav', s.bytes);
  const r = ok(command(args(input, s.bytes, join(dir, 'mono'), 'mp3')));
  assert.equal(read(r.receipt).readback.channels, 1);
  const cancel = Buffer.from(s.bytes);
  for (let i = 44; i < cancel.length; i += 4) cancel.writeInt16LE(-cancel.readInt16LE(i), i + 2);
  const cp = put('cancel.wav', cancel), out = join(dir, 'cancel');
  refused(command(args(cp, cancel, out, 'mp3')), /clock cannot be established/); clean(dir, out);
}));

for (const recipe of ['wav', 'mp3']) test(`${recipe}: extensible 3.0 speaker mask retains center narration`, () => work(({ dir, put, command }) => {
  const center = source(), count = center.count, data = Buffer.alloc(count * 6), header = Buffer.alloc(68);
  for (let i = 0; i < count; i++) data.writeInt16LE(center.pcm.readInt16LE(i * 2), i * 6 + 4);
  header.write('RIFF'); header.writeUInt32LE(60 + data.length, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(40, 16); header.writeUInt16LE(65534, 20); header.writeUInt16LE(3, 22);
  header.writeUInt32LE(24000, 24); header.writeUInt32LE(144000, 28); header.writeUInt16LE(6, 32); header.writeUInt16LE(16, 34);
  header.writeUInt16LE(22, 36); header.writeUInt16LE(16, 38); header.writeUInt32LE(7, 40);
  Buffer.from('0100000000001000800000aa00389b71', 'hex').copy(header, 44);
  header.write('data', 60); header.writeUInt32LE(data.length, 64);
  const bytes = Buffer.concat([header, data]), input = put('center.wav', bytes), output = join(dir, 'bundle');
  const r = ok(command(args(input, bytes, output, recipe, ['--lead', '0', '--tail', '0']))), receipt = read(r.receipt);
  assert.equal(receipt.source.channel_mask, 7); assert.equal(receipt.source.channel_layout, '3.0');
  assert.equal(receipt.padded.channel_layout, '3.0');
  const decoded = decode(r.upload);
  if (recipe === 'wav') { assert.deepEqual(decoded, data); assert.equal(receipt.readback.stream.channel_layout, '3.0'); }
  else {
    assert.equal(decoded.length, count * 2);
    // Decode the untouched source independently; its speaker mask is the oracle,
    // not the tool's padded header or an assumed downmix gain.
    const reference = decode(input, true);
    const rms = pcm => { let energy = 0; for (let i = 0; i < count; i++) energy += pcm.readInt16LE(i * 2) ** 2; return Math.sqrt(energy / count); };
    assert.ok(rms(reference) > 1000);
    assert.ok(rms(decoded) > rms(reference) * 0.8 && rms(decoded) < rms(reference) * 1.2, 'center narration must survive the mono downmix');
    assert.equal(receipt.readback.correlation.lag_samples, 0);
  }
}));

test('identifiable cut-edge pulses retain both endpoint samples and exclude real neighbours', () => work(({ dir, put, command }) => {
  const s = source(24000), bytes = Buffer.from(s.bytes); bytes.fill(0, 44);
  // Neighbours are deliberately louder and distinct from the retained endpoints.
  for (const [i, amplitude] of [[2399, 30000], [2400, 12345], [2401, -8000], [7000, 15000], [13007, -14000], [19198, 7000], [19199, -11223], [19200, -30000]]) bytes.writeInt16LE(amplitude, 44 + i * 2);
  const input = put('pulses.wav', bytes), output = join(dir, 'bundle');
  const r = ok(command(args(input, bytes, output, 'wav', ['--start', '0.1', '--end', '0.8', '--pre-guard', '1/2400', '--post-guard', '1/1200'])));
  const decoded = decode(r.upload), values = Array.from({ length: decoded.length / 2 }, (_, i) => decoded.readInt16LE(i * 2));
  assert.deepEqual(values.slice(0, 10), Array(10).fill(0));
  assert.equal(values[10], 12345); assert.equal(values[11], -8000);
  assert.equal(values.at(-21), -11223); assert.deepEqual(values.slice(-20), Array(20).fill(0));
  assert.ok(!values.includes(30000) && !values.includes(-30000));
}));

test('135.37-second synthetic upload fits without changing the fixed recipe; no speech quality claim', () => work(({ dir, put, command }) => {
  const s = source(24000, 1, 3248880), output = join(dir, 'bundle');
  // The short-fixture chirp sweeps beyond Nyquist on a long clock. Preserve it
  // as a refusal case, then construct a separate bounded voice-band signal.
  const wide = put('wideband.wav', s.bytes), rejected = join(dir, 'wideband');
  refused(command(args(wide, s.bytes, rejected, 'mp3')), /clock cannot be established/); clean(dir, rejected);
  for (let i = 0; i < s.count; i++) {
    const t = i / 24000;
    s.bytes.writeInt16LE(Math.round(9000 * Math.sin(2 * Math.PI * (330 * t + 27 * Math.sin(2 * Math.PI * 0.37 * t))) +
      4000 * Math.sin(2 * Math.PI * (790 * t + 19 * Math.sin(2 * Math.PI * 0.23 * t)))), 44 + i * 2);
  }
  const input = put('long.wav', s.bytes);
  const result = ok(command(args(input, s.bytes, output, 'mp3', ['--lead', '0.25', '--tail', '0.5'])));
  assert.ok(result.bytes < 3000000); const receipt = read(result.receipt);
  assert.equal(receipt.readback.sample_count, 3266880);
  assert.equal(receipt.encoder.bitrate_bits_per_second, 64000);
  assert.equal(receipt.readback.correlation.lag_samples, 0);
}));

for (const recipe of ['wav', 'mp3']) test(`${recipe}: complete byte ceiling equality passes; one byte over and impossible fit refuse and clean`, () => work(({ dir, put, command }) => {
  const s = source(), input = put('source.wav', s.bytes), first = ok(command(args(input, s.bytes, join(dir, 'first'), recipe)));
  const size = first.bytes;
  assert.equal(ok(command(args(input, s.bytes, join(dir, 'equal'), recipe, undefined, String(size)))).bytes, size);
  for (const ceiling of [size - 1, 1]) {
    const output = join(dir, `over-${ceiling}`);
    refused(command(args(input, s.bytes, output, recipe, undefined, String(ceiling))), new RegExp(`${size} bytes.*${ceiling}`)); clean(dir, output);
  }
}));
test('malformed, truncated, wrong bit-depth and changed expected identity never publish', () => work(({ dir, put, command }) => {
  const s = source(), badBits = Buffer.from(s.bytes); badBits.writeUInt16LE(24, 34);
  for (const [name, bytes] of [['malformed', Buffer.from('not media')], ['truncated', s.bytes.subarray(0, -2)], ['extra', Buffer.concat([s.bytes, Buffer.from('x')])], ['bits', badBits]]) {
    const p = put(`${name}.wav`, bytes), output = join(dir, name);
    refused(command(args(p, bytes, output)), /WAV|PCM/); clean(dir, output);
  }
  const input = put('source.wav', s.bytes), output = join(dir, 'changed'), a = args(input, s.bytes, output);
  a[a.indexOf('--sha256') + 1] = '0'.repeat(64);
  refused(command(a), /SHA-256/); clean(dir, output);
}));
test('changed source during encoding removes this run staging', () => work(({ dir, put, command, module }) => {
  const s = source(), input = put('source.wav', s.bytes), output = join(dir, 'bundle');
  mutate(module, "run('ffmpeg', settings, true);", "run('ffmpeg', settings, true); writeFileSync(input, Buffer.concat([readFileSync(input), Buffer.from('x')]));");
  refused(command(args(input, s.bytes, output)), /Source changed/); clean(dir, output);
}));
for (const [name, statement, pattern] of [
  ['silent decode', 'decoded.fill(0);', /clock cannot be established/],
  ['truncated decode', 'decoded = decoded.subarray(2);', /sample count/],
  ['corrupt header', 'writeFileSync(encoded, readFileSync(encoded).subarray(0, 24));', /silently|header|gapless/]
]) test(`${name} refuses with no publication`, () => work(({ dir, put, command, module }) => {
  const s = source(), input = put('source.wav', s.bytes), output = join(dir, 'bundle');
  if (name === 'corrupt header') mutate(module, "const back = probe(encoded, policy.recipe), outChannels", `${statement} const back = probe(encoded, policy.recipe), outChannels`);
  else mutate(module, 'const decoded = decode(encoded, policy.recipe, decodedPath);', `let decoded = decode(encoded, policy.recipe, decodedPath); ${statement}`);
  refused(command(args(input, s.bytes, output, 'mp3')), pattern); clean(dir, output);
}));

test('malformed staged receipt is refused before completion', () => work(({ dir, put, command, module }) => {
  const s = source(), input = put('source.wav', s.bytes), output = join(dir, 'bundle');
  mutate(module, "writeJSON(receiptPath, receipt);", "writeFileSync(receiptPath, '{invalid JSON', { flag: 'wx' });");
  refused(command(args(input, s.bytes, output)), /Invalid JSON/); clean(dir, output);
}));
test('silence and ambiguous periodic correlation are refused', () => {
  assert.throws(() => clock(Buffer.alloc(20000), Buffer.alloc(20000)), /silence/);
  const tone = Buffer.alloc(24000 * 2);
  for (let i = 0; i < 24000; i++) tone.writeInt16LE(Math.round(10000 * Math.sin(i * 2 * Math.PI / 24)), i * 2);
  assert.throws(() => clock(tone, tone), /unambiguous/);
});

// Baseline refusal assertions are rerun unchanged against isolated mutants.
// A mutant that still rejects for another reason does not count as a control.
for (const [name, plant, planted, guard] of [
  ['mapping', "const receiptPath = join(stage, 'receipt.json');", "receipt.mapping.source_zero_at_upload_sample++; const receiptPath = join(stage, 'receipt.json');", '!isDeepStrictEqual(receipt.mapping, mapping(facts.start, facts.end, facts.pre, facts.lag))'],
  ['size identity', "const receiptPath = join(stage, 'receipt.json');", "receipt.upload.identity = { ...receipt.upload.identity, bytes: receipt.upload.identity.bytes + 1 }; const receiptPath = join(stage, 'receipt.json');", '!isDeepStrictEqual(receipt.upload.identity, facts.upload)'],
  ['lag', "const decoded = decode(encoded, policy.recipe, decodedPath);", "const decoded = decode(encoded, policy.recipe, decodedPath); decoded.copyWithin(2, 0, decoded.length - 2); decoded.fill(0, 0, 2);", 'Math.abs(best.lag) > 0'],
  ['encoder delay', "const gapless = policy.recipe === 'mp3' ? gaplessTag(readFileSync(encoded)) : null;", "const gapless = policy.recipe === 'mp3' ? gaplessTag(readFileSync(encoded)) : null; if (gapless) gapless.encoder_priming_samples++;", 'decoderPriming < 0 || gapless.encoder_end_padding_samples - decoderPriming !== skips.reduce((n, s) => n + s.discard_padding, 0)'],
  ['inclusive ceiling', 'if (facts.upload.bytes > receipt.byte_ceiling)', 'if (facts.upload.bytes > receipt.byte_ceiling)', 'facts.upload.bytes > receipt.byte_ceiling']
]) test(`planted ${name} refuses, and refusal assertion fails when its guard is removed`, () => work(({ dir, put, command, module }) => {
  const s = source(), input = put('source.wav', s.bytes), output = join(dir, 'bundle');
  if (name !== 'inclusive ceiling') mutate(module, plant, planted);
  const a = args(input, s.bytes, output, 'mp3', undefined, name === 'inclusive ceiling' ? '1' : '3000000');
  const check = r => { assert.equal(r.status, 1); assert.equal(r.stdout, ''); };
  check(command(a)); clean(dir, output);
  mutate(module, guard, 'false');
  const bypassed = command(a);
  assert.equal(bypassed.status, 0, bypassed.stderr);
  assert.throws(() => check(bypassed), { code: 'ERR_ASSERTION' });
}));

test('upload help, missing dependencies and strict flags precede media work', () => work(({ dir, put, command }) => {
  const s = source(), input = put('source.wav', s.bytes), output = join(dir, 'bundle');
  const a = args(input, s.bytes, output), env = { PATH: dir };
  const h = command(['upload', '--help'], env); assert.equal(h.status, 0); assert.match(h.stdout, /Speech Preparation 0.2.0/);
  for (const extra of [['--wat', 'x'], ['--max-bytes', '1'], ['--start', '0']]) {
    refused(command([...a, ...extra], env), /Unknown|twice|Choose/); clean(dir, output);
  }
  for (const [flag, value] of [['--recipe', 'ogg'], ['--max-bytes', '1.5'], ['--lead', 'NaN'], ['--sha256', 'no']]) {
    const bad = [...a]; bad[bad.indexOf(flag) + 1] = value;
    refused(command(bad, env), /recipe|max-bytes|Seconds|sha256/); clean(dir, output);
  }
  refused(command(a, env), /Missing ffmpeg/);
  const stub = put('ffmpeg', '#!/bin/sh\nexit 0\n'); chmodSync(stub, 0o755);
  refused(command(a, env), /Missing ffprobe/);
  const stubProbe = put('ffprobe', '#!/bin/sh\nexit 0\n'); chmodSync(stubProbe, 0o755);
  refused(command(args(input, s.bytes, output, 'mp3'), env), /Missing libmp3lame/); clean(dir, output);
}));
test('empty, out-of-bounds, rounded-empty spans and unsupported rates refuse', () => work(({ dir, put, command }) => {
  const s = source(), input = put('source.wav', s.bytes), output = join(dir, 'bundle');
  for (const [a, b] of [['1', '1'], ['1', '0'], ['0', '1.00000000001'], ['0', '0.0000001']]) {
    refused(command(args(input, s.bytes, output, 'wav', ['--start', a, '--end', b, '--pre-guard', '0', '--post-guard', '0'])), /span/); clean(dir, output);
  }
  const odd = source(25000), op = put('odd.wav', odd.bytes);
  refused(command(args(op, odd.bytes, output, 'mp3')), /preserve this source rate/); clean(dir, output);
}));
test('destinations, aliases, hardlinks and protected spellings cannot bypass screening', () => work(({ dir, put, command, tool }) => {
  const s = source(), input = put('source.wav', s.bytes), output = join(dir, 'bundle');
  mkdirSync(output); put('bundle/keep.txt', 'keep');
  refused(command(args(input, s.bytes, output)), /already exists/); assert.equal(readFileSync(join(output, 'keep.txt'), 'utf8'), 'keep');
  symlinkSync(output, join(dir, 'alias')); refused(command(args(input, s.bytes, join(dir, 'alias'))), /already exists/);
  symlinkSync(tool, join(dir, 'tool-alias')); refused(command(args(input, s.bytes, join(dir, 'tool-alias', 'out'))), /inside this tool/);
  linkSync(input, join(dir, 'hard.wav')); refused(command(args(input, s.bytes, join(dir, 'out'))), /one link/);
  rmSync(join(dir, 'hard.wav'));
  for (const dest of [join(dir, 'memory', 'out'), join(dir, '.env.out'), 'relative']) refused(command(args(input, s.bytes, dest)), /Protected|absolute/);
}));

test('forced SIGKILL leaves only inventoried incomplete staging; a fresh destination can recover', () => work(async ({ dir, put, entry, module, command }) => {
  const s = source(), input = put('source.wav', s.bytes), output = join(dir, 'bundle');
  const original = readFileSync(module, 'utf8');
  mutate(module, 'try {\n    const padded', 'try {\n    while (true) {}\n    const padded');
  const child = spawn(process.execPath, [entry, ...args(input, s.bytes, output)], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = ''; child.stdout.on('data', b => stdout += b);
  const exit = new Promise(resolve => child.once('exit', resolve));
  const deadline = Date.now() + 10000;
  try {
    while (!readdirSync(dir).some(n => n.startsWith('.wiser-speech-upload-'))) {
      assert.ok(Date.now() < deadline, 'staging must become visible'); await new Promise(r => setTimeout(r, 20));
    }
  } finally { child.kill('SIGKILL'); await exit; }
  assert.equal(stdout, ''); assert.ok(!existsSync(output));
  const stages = readdirSync(dir).filter(n => n.startsWith('.wiser-speech-upload-'));
  assert.equal(stages.length, 1); assert.ok(!existsSync(join(dir, stages[0], 'complete.json')));
  writeFileSync(module, original);
  ok(command(args(input, s.bytes, output)));
  assert.ok(existsSync(join(output, 'complete.json')));
  assert.ok(existsSync(join(dir, stages[0])), 'a later run never deletes another run staging');
}));
