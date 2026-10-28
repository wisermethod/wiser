import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { rat, rational, intervals, selection, strictJSON } from '../scripts/conform.js';
import { correlate, acceptMeasurement, acceptDrift } from '../scripts/conform-clock.js';
const tool = resolve(dirname(fileURLToPath(import.meta.url)), '..'), entry = join(tool, 'scripts/edit.js');
const hash = p => createHash('sha256').update(readFileSync(p)).digest('hex');
const identity = p => ({ bytes: readFileSync(p).length, sha256: hash(p) });
async function temp(fn) { const d = realpathSync(mkdtempSync(join(tmpdir(), 'wiser-conform-test-'))); try { return await fn(d); } finally { rmSync(d, { recursive: true, force: true }); } }
function run(bin, args, opts = {}) { return spawnSync(bin, args, { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, ...opts }); }
function ff(args, binary = false) { const r = run('ffmpeg', ['-nostdin', '-y', '-v', 'error', '-filter_threads', '1', ...args], { encoding: binary ? null : 'utf8' }); assert.equal(r.status, 0, r.stderr?.toString()); return r.stdout; }
function wave(p, data, rate = 48000, channels = 1) {
  const b = Buffer.alloc(44 + data.length * 2); b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(channels, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * channels * 2, 28); b.writeUInt16LE(channels * 2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(data.length * 2, 40);
  data.forEach((v, i) => b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v * 32767))), 44 + 2 * i)); writeFileSync(p, b);
}
function noise(n = 48000, seed = 74123) {
  let state = seed, last = 0; return Float64Array.from({ length: n }, (_, i) => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; last = last * 0.6 + ((state / 4294967296) * 2 - 1) * 0.2; return last * (i % 5701 < 700 ? 2 : 0.6); });
}
function shifted(x, lag, drift = 0) { return Float64Array.from({ length: x.length }, (_, i) => x[i - lag - (i > x.length / 2 ? drift : 0)] ?? 0); }
function receipt(d, path, count, rate = 48000) {
  const p = join(d, 'receipt.json'); writeFileSync(p, JSON.stringify({ schema: 'speech-upload', version: 1, padded: { file: 'padded.wav', identity: identity(path), rate, channels: 1, sample_count: count }, mapping: { source_zero_at_upload_sample: 12000 }, source: { before: { sha256: '1'.repeat(64) } }, readback: { sample_count: count, delay: { residual_decoded_displacement_samples: 0 } } })); return p;
}
function fixture(d, { lag = 0, frames = 25, bf = 0, audio = true, cancel = false, silent = false, aac = false, stereo = false, pictureOffset = '0', audioOffset = '0', rate = 48000 } = {}) {
  const reference = join(d, 'padded.wav'), vendor = join(d, 'vendor.wav'), raw = join(d, 'pictures.yuv'), input = join(d, 'vendor.mp4');
  const x = noise(rate); wave(reference, x, rate); const y = shifted(x, Math.round(lag * rate / 48000));
  wave(vendor, cancel || stereo ? Float64Array.from({ length: y.length * 2 }, (_, i) => (cancel && i % 2 ? -1 : 1) * y[i >> 1]) : silent ? new Float64Array(y.length) : y, rate, cancel || stereo ? 2 : 1);
  const size = 64 * 48 * 3 / 2, bytes = Buffer.alloc(size * frames);
  for (let n = 0; n < frames; n++) { for (let i = 0; i < 64 * 48; i++) bytes[n * size + i] = 16 + ((n * 13 + Math.floor(i / 64) * 7 + i % 64) % 220);
    for (let bit = 0; bit < 8; bit++) bytes.fill(n & (1 << bit) ? 220 : 25, n * size + bit * 8, n * size + bit * 8 + 8);
    bytes.fill(25 + n * 7 % 200, n * size + 64 * 48, n * size + 64 * 48 * 5 / 4); bytes.fill(225 - n * 11 % 200, n * size + 64 * 48 * 5 / 4, (n + 1) * size); }
  writeFileSync(raw, bytes);
  ff(['-copyts', '-itsoffset', pictureOffset, '-f', 'rawvideo', '-pixel_format', 'yuv420p', '-video_size', '64x48', '-framerate', '25', '-i', raw,
    ...(audio ? ['-itsoffset', audioOffset, '-i', vendor] : []), '-map', '0:v', ...(audio ? ['-map', '1:a'] : []), '-c:v', 'libx264', '-crf', bf ? '18' : '0', '-threads:v', '1', '-bf', String(bf), '-x264-params', 'b-adapt=0',
    ...(audio ? ['-c:a', aac ? 'aac' : 'pcm_s16le'] : []), '-vf', 'setsar=1', '-avoid_negative_ts', 'disabled', '-use_editlist', '1', input]);
  return { d, input, reference, receipt: receipt(d, reference, x.length, rate), lag };
}
function args(f, output = join(f.d, 'bundle'), changes = {}) {
  const v = { input: f.input, sha256: hash(f.input), reference: f.reference, 'reference-sha256': hash(f.reference), 'upload-receipt': f.receipt, 'upload-receipt-sha256': hash(f.receipt), output,
    frames: '30', rate: '30/1', width: '64', height: '48', origin: '0', 'correlation-floor': '0.95', 'max-offset': '0.1', 'drift-tolerance': '0', window: '0.5', 'max-hold-start': '3', 'max-hold-end': '3', 'source-colour': 'bt709-tv', ...changes };
  return ['conform', ...Object.entries(v).flatMap(([k, value]) => [`--${k}`, String(value)])];
}
function invoke(f, changes = {}, program = entry, name = 'bundle') { return run(process.execPath, [program, ...args(f, join(f.d, name), changes)]); }
function success(f, changes = {}, name = 'bundle', program = entry) { const r = invoke(f, changes, program, name); assert.equal(r.status, 0, r.stderr); assert.equal(r.stderr, ''); const v = JSON.parse(r.stdout); return { ...v, detail: JSON.parse(readFileSync(v.receipt)) }; }
function refusal(f, changes, pattern, name = 'bundle', program = entry) { const before = readdirSync(f.d).sort(), r = invoke(f, changes, program, name); assert.equal(r.status, 1, r.stderr); assert.equal(r.stdout, ''); assert.match(r.stderr, pattern); assert.deepEqual(readdirSync(f.d).sort(), before); }
const rawPixels = p => ff(['-noautorotate', '-i', p, '-map', '0:v:0', '-an', '-fps_mode', 'passthrough', '-pix_fmt', 'yuv420p', '-f', 'rawvideo', '-'], true);
function oracle(f, result, { rateN = 30n, rateD = 1n, originN = 0n, originD = 1n, lagN = BigInt(f.lag), lagD = 48000n, sourceCount = 25, width = 64, height = 48 } = {}) {
  // Closed-form CFR oracle from fixture facts, never the implementation's map.
  const source = ff(['-noautorotate', '-i', f.input, '-map', '0:v', '-an', '-vf', `scale=${width}:${height}:flags=lanczos:in_color_matrix=bt709:out_color_matrix=bt709:in_range=tv:out_range=tv`, '-fps_mode', 'passthrough', '-pix_fmt', 'yuv420p', '-f', 'rawvideo', '-'], true), output = rawPixels(result.segment), size = width * height * 3 / 2;
  assert.equal(output.length, result.frames * size);
  for (let n = 0; n < result.frames; n++) {
    const a = (originN * lagD + lagN * originD) * rateN + BigInt(n) * rateD * originD * lagD, b = originD * lagD * rateN;
    let k = a * 25n / b; if (a < 0n && a * 25n % b) k--; const ordinal = Math.max(0, Math.min(sourceCount - 1, Number(k)));
    assert.deepEqual(output.subarray(n * size, (n + 1) * size), source.subarray(ordinal * size, (ordinal + 1) * size), `oracle output ${n} -> source ${ordinal}`);
    assert.equal(result.detail.frames[n].source_ordinal, ordinal);
  }
}
for (const lag of [0, 480, -480]) test(`25 to 30 fps numbered pixels and signed lag ${lag}`, () => temp(d => {
  const f = fixture(d, { lag }), result = success(f); assert.equal(result.detail.correlation.lag_samples, lag); oracle(f, result);
  assert.deepEqual(readdirSync(result.output).sort(), ['complete.json', 'receipt.json', 'segment.mp4']);
  const marker = JSON.parse(readFileSync(result.completion)); assert.deepEqual(marker.files['segment.mp4'], identity(result.segment)); assert.deepEqual(marker.files['receipt.json'], identity(result.receipt)); assert.equal(success(f, {}, 'repeat').sha256, result.sha256);
}));
test('fractional rate, span origin, scale, one-frame-short source, allowed/refused holds', () => temp(d => {
  const f = fixture(d, { frames: 24 }), result = success(f, { frames: 31, rate: '30000/1001', origin: '1/25', width: 32, height: 24, 'max-hold-end': 5 });
  oracle(f, result, { rateN: 30000n, rateD: 1001n, originN: 1n, originD: 25n, sourceCount: 24, width: 32, height: 24 }); assert.ok(result.held[1] > 0); refusal(f, { frames: 31, rate: '30000/1001', origin: '1/25', 'max-hold-end': 0 }, /edge holds/, 'refused');
}));
test('B-frame display order and unequal decoded audio/picture origins', () => temp(d => {
  const f = fixture(d, { bf: 2, lag: 480, pictureOffset: '0.1', audioOffset: '0.14' }), result = success(f, { 'max-offset': '0.2', 'max-hold-end': 5 });
  const info = JSON.parse(run('ffprobe', ['-v', 'error', '-show_streams', '-show_frames', '-of', 'json', f.input]).stdout);
  assert.ok(info.frames.some(f => f.pict_type === 'B'), 'fixture must contain genuine reordered pictures');
  const first = type => { const s = info.streams.find(s => s.codec_type === type), frame = info.frames.find(f => f.media_type === type), [a, b] = s.time_base.split('/').map(BigInt); return [BigInt(frame.pts) * a, b]; };
  const [vn, vd] = first('video'), [an, ad] = first('audio'); const lagN = 480n * vd * ad + (an * vd - vn * ad) * 48000n, lagD = 48000n * vd * ad;
  oracle(f, result, { lagN, lagD }); assert.ok(Number(an) / Number(ad) !== Number(vn) / Number(vd));
}));
test('exact half-open boundary and both rational neighbours', () => {
  const clock = intervals([{ pts: 0, duration: 1 }, { pts: 1, duration: 1 }, { pts: 2, duration: 1 }], { time_base: '1/25' });
  for (const [at, want] of [['39999999999999999999/1000000000000000000000', 0], ['1/25', 1], ['40000000000000000001/1000000000000000000000', 1]]) assert.equal(selection(clock.rows, 1, rat(30n), rational(at), rat(0n), [0, 0]).map[0].source_ordinal, want);
  assert.throws(() => intervals([{ pts: 0 }, { pts: 0, duration: 1 }], { time_base: '1/25' }), /non-increasing/); assert.throws(() => intervals([{ pts: 0 }], { time_base: '1/25' }), /terminal/);
});
function clockPolicy(changes = {}) { return { window: rat(1n, 2n), floor: rational('0.95'), offset: rational('0.1'), drift: rat(0n), ...changes }; }
test('floor, signed offset, drift: inclusive equality and just outside', () => {
  assert.ok(acceptMeasurement(0.95, rat(1n, 10n), rat(95n, 100n), rat(1n, 10n))); assert.throws(() => acceptMeasurement(0.9499999999999998, rat(0n), rat(95n, 100n), rat(1n)), /floor/);
  for (const sign of [1n, -1n]) { assert.ok(acceptMeasurement(1, rat(sign * 4800n, 48000n), rat(1n), rat(1n, 10n))); assert.throws(() => acceptMeasurement(1, rat(sign * 4801n, 48000n), rat(1n), rat(1n, 10n)), /offset/); }
  assert.ok(acceptDrift([rat(0n), rat(960n, 48000n)], rat(1n, 50n))); assert.throws(() => acceptDrift([rat(0n), rat(961n, 48000n)], rat(1n, 50n)), /drift/);
});
test('correlation floor/offset boundaries and deliberate drift', () => {
  const x = noise(), y = shifted(x, 480); assert.equal(correlate(x, y, clockPolicy(), rat(0n)).lag_samples, 480);
  assert.ok(correlate(x, y, clockPolicy({ floor: rat(1n), offset: rat(1n, 100n) }), rat(0n))); assert.throws(() => correlate(x, y, clockPolicy({ offset: rat(479n, 48000n) }), rat(0n)), /offset/);
  const drifting = shifted(x, 0, 40); assert.throws(() => correlate(x, drifting, clockPolicy({ floor: rat(1n, 2n) }), rat(0n)), /drift/); assert.equal(correlate(x, drifting, clockPolicy({ floor: rat(1n, 2n), drift: rat(40n, 48000n) }), rat(0n)).drift_seconds, '1/1200');
});
test('silence, repeated phrases, near-equal peaks and tiny overlap', () => {
  assert.throws(() => correlate(new Float64Array(48000), new Float64Array(48000), clockPolicy(), rat(0n)), /signal/);
  const pattern = noise(1200), repeat = Float64Array.from({ length: 48000 }, (_, i) => pattern[i % 1200]); assert.throws(() => correlate(repeat, repeat, clockPolicy(), rat(0n)), /tie/);
  const near = Float64Array.from(repeat, (v, i) => v + (i % 17) * 1e-12); assert.throws(() => correlate(repeat, near, clockPolicy(), rat(0n)), /tie/); assert.throws(() => correlate(noise(), noise(100), clockPolicy(), rat(0n)), /overlap/);
});
for (const [name, opts, pattern] of [['silence', { silent: true }, /silent/], ['cancelling channels', { cancel: true }, /cancel/], ['absent audio', { audio: false }, /audio track/]]) test(`refuses ${name} without scratch or partial publication`, () => temp(d => refusal(fixture(d, opts), {}, pattern)));
test('AAC, 44.1k reference, unchanged mux/loudness/finish', () => temp(d => {
  const f = fixture(d, { aac: true, rate: 44100 }), r = success(f, { 'correlation-floor': '0.8', 'drift-tolerance': '1/1000', frames: 33 }); oracle(f, r);
  const laid = run(process.execPath, [entry, 'mux', '--input', r.segment, '--audio', f.reference, '--audio-start', '0.0123', '--output', join(d, 'laid.mp4')]); assert.equal(laid.status, 0, laid.stderr); const mux = JSON.parse(laid.stdout); assert.equal(mux.audioStartSample, 591); assert.equal(mux.firstFrameSample, 0); assert.equal(mux.frames, 33);
  for (const [command, pattern] of [['loudness', /exactly one audio stream/], ['finish', /no gated block/]]) {
    const output = join(d, `bare-${command}.mp4`), before = readdirSync(d).sort();
    const bare = run(process.execPath, [entry, command, '--input', r.segment, '--output', output, '--target', '-24', '--true-peak', '-1']);
    assert.equal(bare.status, 1); assert.equal(bare.stdout, ''); assert.match(bare.stderr, pattern); assert.ok(!existsSync(output)); assert.deepEqual(readdirSync(d).sort(), before);
  }
  for (const command of ['loudness', 'finish']) { const out = join(d, `${command}.mp4`), result = run(process.execPath, [entry, command, '--input', mux.output, '--output', out, '--target', '-24', '--true-peak', '-1']); assert.equal(result.status, 0, result.stderr); const v = JSON.parse(result.stdout); assert.ok(Math.abs(v.after.integrated + 24) <= (command === 'finish' ? 1 : 0.5)); assert.ok(v.after.truePeak <= -1); }
}));
test('receipts, identities, links, protected paths, collisions, CLI and missing dependencies', () => temp(d => {
  const f = fixture(d), base = args(f), blocked = { env: { ...process.env, PATH: '/no-dependencies' } };
  for (const values of [['help'], ['conform', '--help']]) { const h = run(process.execPath, [entry, ...values], blocked); assert.equal(h.status, 0); assert.match(h.stdout, /video-edit 0.3.0/); }
  for (const extra of [['--bogus', 'x'], ['--origin', '0'], ['--fps', '30']]) { const r = run(process.execPath, [entry, ...base, ...extra], blocked); assert.equal(r.status, 1); assert.equal(r.stdout, ''); assert.doesNotMatch(r.stderr, /missing ffmpeg/); }
  const missing = run(process.execPath, [entry, ...base], blocked); assert.equal(missing.status, 1); assert.match(missing.stderr, /missing ffmpeg/); refusal(f, { sha256: '0'.repeat(64) }, /SHA-256/);
  const original = readFileSync(f.receipt), stale = JSON.parse(original); stale.padded.identity.sha256 = '0'.repeat(64); writeFileSync(f.receipt, JSON.stringify(stale)); refusal(f, {}, /receipt/); writeFileSync(f.receipt, original); assert.throws(() => strictJSON('{"padded":1,"padded":2}'), /duplicate/);
  for (const path of [join(d, 'memory', 'file.mp4'), join(d, '.env')]) { const r = invoke(f, { input: path, sha256: '0'.repeat(64) }); assert.equal(r.status, 1); assert.equal(r.stdout, ''); assert.match(r.stderr, /protected/); }
  const link = join(d, 'linked.mp4'); linkSync(f.input, link); refusal(f, { input: link }, /one link/); rmSync(link);
  const alias = join(d, 'tool'); symlinkSync(tool, alias); const r = invoke(f, { output: join(alias, 'forbidden') }); assert.equal(r.status, 1); assert.match(r.stderr, /inside this tool/);
  mkdirSync(join(d, 'bundle')); writeFileSync(join(d, 'bundle', 'sentinel'), 'keep'); refusal(f, {}, /already exists/);
}));
function mutant(d, name, change) {
  const copy = join(d, name); mkdirSync(copy); cpSync(join(tool, 'scripts'), join(copy, 'scripts'), { recursive: true }); writeFileSync(join(copy, 'package.json'), '{"type":"module"}');
  const file = join(copy, 'scripts', 'conform.js'), original = readFileSync(file, 'utf8'), modified = change(original); assert.notEqual(modified, original); writeFileSync(file, modified); return join(copy, 'scripts', 'edit.js');
}
test('planted one-frame shift, wrong sign, doubled lead: independent every-frame oracle fails', () => temp(d => {
  const f = fixture(d, { lag: 480 });
  for (const [name, change] of [
    ['shift', s => s.replace('const row = rows[edge === 0 ? 0 : source];', 'const row = rows[Math.min(rows.length - 1, (edge === 0 ? 0 : source) + 1)];')],
    ['sign', s => s.replace('rational(correlation.lag_seconds, true)', 'neg(rational(correlation.lag_seconds, true))')],
    ['lead', s => s.replaceAll('p.origin, lag, p.holds', 'add(p.origin, rat(1n, 4n)), lag, p.holds')]
  ]) { const program = mutant(d, name, change), result = invoke(f, { frames: 36, 'max-hold-start': 20, 'max-hold-end': 20 }, program, `out-${name}`);
    if (result.status === 0) { const r = JSON.parse(result.stdout); r.detail = JSON.parse(readFileSync(r.receipt)); assert.throws(() => oracle(f, r), /oracle|source_ordinal/); } else assert.match(result.stderr, /correspondence|frame map/); }
}));
test('planted relabelled colour, audio leak, stale receipt: readback refuses', () => temp(d => {
  const f = fixture(d);
  const colour = mutant(d, 'colour', s => s.replace("'-color_range', 'tv', '-video_track_timescale'", "'-color_range', 'pc', '-video_track_timescale'")); refusal(f, {}, /colour|contradicts|pixel correspondence/, 'colour-out', colour);
  const leak = mutant(d, 'leak', s => s.replace("'-map', '0:v:0', '-an', '-frames:v'", "'-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-map', '0:v:0', '-map', '1:a:0', '-c:a', 'aac', '-shortest', '-frames:v'")); refusal(f, {}, /audio leak/, 'leak-out', leak);
  const stale = mutant(d, 'stale', s => s.replace("const receiptPath = join(stage, 'receipt.json'); jsonWrite(receiptPath, result);", "const receiptPath = join(stage, 'receipt.json'); jsonWrite(receiptPath, {...result, tool_version:'stale'});")); refusal(f, {}, /staged receipt/, 'stale-out', stale);
}));
test('planted skipped drift check fails the deliberate-drift refusal assertion', () => temp(async d => {
  const file = join(d, 'mutant-clock.mjs'), original = readFileSync(join(tool, 'scripts/conform-clock.js'), 'utf8');
  writeFileSync(file, original.replace("'./conform.js'", JSON.stringify(pathToFileURL(join(tool, 'scripts/conform.js')).href)).replace("if (cmp(spread, tolerance) > 0)", 'if (false)')); const module = await import(pathToFileURL(file));
  assert.throws(() => assert.throws(() => module.correlate(noise(), shifted(noise(), 0, 40), clockPolicy({ floor: rat(1n, 2n) }), rat(0n)), /drift/), /Missing expected exception/);
}));

test('one-frame output at exact interval boundary and its two rational neighbours', () => temp(d => {
  const f = fixture(d);
  const times = ['39999999999999999999/1000000000000000000000', '1/25', '40000000000000000001/1000000000000000000000'];
  const source = rawPixels(f.input), size = 64 * 48 * 3 / 2;
  times.forEach((origin, i) => { const r = success(f, { frames: 1, origin }, `edge-${i}`), expected = i ? 1 : 0; assert.deepEqual(rawPixels(r.segment), source.subarray(expected * size, (expected + 1) * size)); assert.equal(r.detail.frames[0].source_ordinal, expected); });
}));

test('negative lag start-hold budget at equality and one below, and final hold at equality', () => temp(d => {
  const f = fixture(d, { lag: -480 }), r = success(f, { 'max-hold-start': 1 }); assert.equal(r.held[0], 1); refusal(f, { 'max-hold-start': 0 }, /edge holds/, 'no-start-hold');
  const tail = success(f, { frames: 33, 'max-hold-end': 2 }, 'tail'); assert.equal(tail.held[1], 2); refusal(f, { frames: 33, 'max-hold-end': 1 }, /edge holds/, 'no-tail-hold');
}));

test('contradictory colour, display matrix, corrupt video and forced-demuxer playlist refuse', () => temp(d => {
  const f = fixture(d), altered = join(d, 'altered.mp4');
  ff(['-i', f.input, '-map', '0', '-c', 'copy', '-bsf:v', 'h264_metadata=colour_primaries=6:transfer_characteristics=6:matrix_coefficients=6', altered]); refusal(f, { input: altered, sha256: hash(altered) }, /contradicts/);
  const rotated = join(d, 'rotated.mp4'); ff(['-display_rotation:v:0', '90', '-i', f.input, '-map', '0', '-c', 'copy', rotated]); refusal(f, { input: rotated, sha256: hash(rotated) }, /display matrix|rotation/);
  for (const data of ['invalid MP4', '#EXTM3U\n#EXTINF:1\nhttps://invalid.example/never-fetched.ts\n']) { const bad = join(d, 'bad.mp4'); writeFileSync(bad, data); refusal(f, { input: bad, sha256: hash(bad) }, /ffprobe/); }
}));

function standin(d, program, source) { const bin = join(d, 'bin'); if (!existsSync(bin)) mkdirSync(bin); writeFileSync(join(bin, program), `#!${process.execPath}\n${source}`, { mode: 0o755 }); return { env: { ...process.env, PATH: bin + ':' + process.env.PATH } }; }
function actual(binary) { const r = run('/usr/bin/which', [binary]); assert.equal(r.status, 0); return r.stdout.trim(); }

test('new ffprobe/encoder/filter probes are operation-scoped and refuse before media reads', () => temp(d => {
  const f = fixture(d), ffmpeg = actual('ffmpeg');
  const probe = standin(d, 'ffprobe', `if(process.argv[2]==='-version') process.exit(1); throw new Error('unexpected media read');`);
  const a = run(process.execPath, [entry, ...args(f)], probe); assert.equal(a.status, 1); assert.match(a.stderr, /missing ffprobe/);
  rmSync(join(d, 'bin', 'ffprobe'));
  for (const flag of ['-encoders', '-filters']) {
    const blocked = standin(d, 'ffmpeg', `const args=process.argv.slice(2);if(args.includes(${JSON.stringify(flag)})){process.stdout.write('empty list\\n');process.exit(0)}if(args.includes('-version'))process.exit(0);if(args.includes('-encoders')){process.stdout.write(' V....D libx264 encoder\\n');process.exit(0)}throw new Error('unexpected media pass');`);
    const r = run(process.execPath, [entry, ...args(f)], blocked); assert.equal(r.status, 1); assert.match(r.stderr, /missing libx264|missing scale filter/); assert.equal(r.stdout, '');
  }
  // Old sampled frames must require neither ffprobe nor the new filter-list probe.
  const limited = standin(d, 'ffmpeg', `const {spawnSync}=require('node:child_process');const args=process.argv.slice(2);if(args.includes('-encoders')||args.includes('-filters'))process.exit(98);const r=spawnSync(${JSON.stringify(ffmpeg)},args,{stdio:'inherit'});process.exit(r.status??1);`);
  standin(d, 'ffprobe', `process.exit(98)`);
  const old = run(process.execPath, [entry, 'frames', '--input', f.input, '--output', join(d, 'old-frames'), '--fps', '1'], limited); assert.equal(old.status, 0, old.stderr);
}));

test('changed input after encoding refuses and cleans only this run staging', () => temp(d => {
  const f = fixture(d), ffmpeg = actual('ffmpeg');
  const wrapped = standin(d, 'ffmpeg', `const {spawnSync}=require('node:child_process');const {appendFileSync}=require('node:fs');const args=process.argv.slice(2);const r=spawnSync(${JSON.stringify(ffmpeg)},args,{stdio:'inherit'});if(r.status===0&&args.at(-1).endsWith('/segment.mp4'))appendFileSync(${JSON.stringify(f.input)},'changed');process.exit(r.status??1);`);
  const before = readdirSync(d).sort(), r = run(process.execPath, [entry, ...args(f)], wrapped); assert.equal(r.status, 1); assert.equal(r.stdout, ''); assert.match(r.stderr, /input changed/); assert.deepEqual(readdirSync(d).sort(), before);
}));

test('forced kill leaves only incomplete staging; a fresh run never reuses or removes it', () => temp(d => {
  const f = fixture(d), ffmpeg = actual('ffmpeg');
  const wrapped = standin(d, 'ffmpeg', `const args=process.argv.slice(2);if(args.at(-1).endsWith('/segment.mp4')){process.kill(process.ppid,'SIGKILL');process.exit(1)}const r=require('node:child_process').spawnSync(${JSON.stringify(ffmpeg)},args,{stdio:'inherit'});process.exit(r.status??1);`);
  const r = run(process.execPath, [entry, ...args(f)], wrapped); assert.equal(r.signal, 'SIGKILL'); assert.equal(r.stdout, ''); assert.ok(!existsSync(join(d, 'bundle')));
  const stages = readdirSync(d).filter(s => s.startsWith('.wiser-video-conform-')); assert.equal(stages.length, 1); const stage = join(d, stages[0]), files = readdirSync(stage).sort(); assert.ok(!files.includes('complete.json')); assert.ok(files.includes('reference.f64le'));
  success(f, {}, 'fresh'); assert.deepEqual(readdirSync(stage).sort(), files);
}));

test('multi-block whole-file correlation and three consecutive 1.5-second windows retain 1105-sample lag', () => {
  // Each window crosses the implementation's 65536-sample convolution block.
  // The oracle is the independent fixture shift, including zero extension.
  const x = noise(216000), y = shifted(x, 1105);
  const r = correlate(x, y, clockPolicy({ window: rat(3n, 2n) }), rat(0n));
  assert.equal(r.lag_samples, 1105); assert.equal(r.lag_seconds, '221/9600');
  assert.equal(r.windows.length, 3); assert.ok(r.windows.every(w => w.lag_samples === 1105 && w.peak > 0.999999999)); assert.equal(r.drift_seconds, '0/1');
});


for (const window of [1n, 2n, 4n]) test(`${window}s window: short silent tail permits the last scored window at delayed, one-frame-early audio end`, () => {
  const x = noise(235200); x.fill(0, x.length - 14400);
  const y = shifted(x, 1105).subarray(0, x.length - 1920);
  const r = correlate(x, y, clockPolicy({ window: rat(window) }), rat(0n));
  assert.equal(r.lag_samples, 1105);
  assert.equal(r.windows.length, Math.ceil(4.9 / Number(window)));
  assert.ok(r.windows.every(w => !w.excluded && w.lag_samples === 1105 && w.peak > 0.999999999));
  assert.ok(r.windows.at(-1).overlap_samples < 0.95 * 43200);
});


async function overlapMutant(d, name, change) {
  const file = join(d, `${name}.mjs`), original = readFileSync(join(tool, 'scripts/conform-clock.js'), 'utf8');
  const changed = change(original); assert.notEqual(changed, original);
  writeFileSync(file, changed.replace("'./conform.js'", JSON.stringify(pathToFileURL(join(tool, 'scripts/conform.js')).href)));
  return (await import(pathToFileURL(file))).correlate;
}
test('silent-tail success assertion fails with the original 95% guard; missing signal refusal fails without silence check', () => temp(async d => {
  const x = noise(235200); x.fill(0, x.length - 14400);
  const y = shifted(x, 1105).subarray(0, x.length - 1920), p = clockPolicy({ window: rat(1n) });
  const check = fn => { const r = fn(x, y, p, rat(0n)); assert.equal(r.windows.at(-1).lag_samples, 1105); assert.ok(!r.windows.at(-1).excluded); };
  check(correlate);
  const old = await overlapMutant(d, 'old-overlap', s => s.replace('count * 100 < (e - s) * 95 && !silentUncovered', 'count * 100 < (e - s) * 95'));
  assert.throws(() => check(old), /floor/);
  const signal = noise(235200), shortened = shifted(signal, 1105).subarray(0, signal.length - 1920);
  const refusal = fn => assert.throws(() => fn(signal, shortened, p, rat(0n)), /floor|overlap/);
  refusal(correlate);
  const missing = await overlapMutant(d, 'missing-silence-check', s => s.replace('count * 100 < (e - s) * 95 && !silentUncovered', 'false'));
  assert.throws(() => refusal(missing), /Missing expected exception/);
}));
test('uncovered edge silence threshold is strict, with a failing inclusive-threshold control', () => temp(async d => {
  // Dyadic PCM16 levels keep prefix-energy subtraction exact at the threshold.
  const x = Float64Array.from(noise(235200), v => Math.round(v * 32768) / 32768), start = x.length - 14400, p = clockPolicy({ window: rat(1n) });
  x.fill(15 / 32768, start);
  let r = correlate(x, shifted(x, 1105).subarray(0, x.length - 1920), p, rat(0n));
  assert.equal(r.windows.at(-1).lag_samples, 1105); assert.equal(r.windows.at(-1).silent_uncovered_samples, 3025);
  x.fill(16 / 32768, start);
  const y = shifted(x, 1105).subarray(0, x.length - 1920), check = fn => assert.throws(() => fn(x, y, p, rat(0n)), /floor|overlap/);
  check(correlate);
  const inclusive = await overlapMutant(d, 'inclusive-silence', s => s.replace('(xe[b] - xe[a]) / (b - a) < RMS ** 2', '(xe[b] - xe[a]) / (b - a) <= RMS ** 2'));
  assert.throws(() => check(inclusive), /Missing expected exception/);
}));
test('a missing signal edge cannot be diluted by the other silent edge, with a pooled-energy control', () => temp(async d => {
  const x = noise(); x.fill(32 / 32768, 0, 100); x.fill(0, 40000);
  const y = x.subarray(100, 40000), p = clockPolicy({ window: rat(1n) });
  const check = fn => assert.throws(() => fn(x, y, p, rat(0n)), /floor|overlap/);
  check(correlate);
  const pooled = await overlapMutant(d, 'pooled-edges', s => s.replace('silent(s, from) && silent(until, e)', '(xe[from] - xe[s] + xe[e] - xe[until]) / (from - s + e - until || 1) < RMS ** 2'));
  assert.equal(pooled(x, y, p, rat(0n)).lag_samples, -100);
  assert.throws(() => check(pooled), /Missing expected exception/);
}));
test('whole-file search also permits uncovered silence, with an original duration-preclip control', () => temp(async d => {
  const x = noise(235200); x.fill(0, x.length - 24000);
  const y = shifted(x, 1105).subarray(0, x.length - 20000), p = clockPolicy({ window: rat(1n) });
  const check = fn => {
    const r = fn(x, y, p, rat(0n));
    assert.equal(r.whole.lag_samples, 1105); assert.ok(r.whole.overlap_samples < 0.95 * x.length);
    assert.ok(r.windows.every(w => !w.excluded && w.lag_samples === 1105));
  };
  check(correlate);
  const old = await overlapMutant(d, 'duration-preclip', s => s.replace('hi = Math.min(hi, y.length - MIN);', 'hi = Math.min(hi, y.length - Math.ceil(x.length * 19 / 20));'));
  assert.throws(() => check(old), /overlap/);
}));


for (const referenceRate of [48000, 44100]) test(`AAC 48k stereo, PCM ${referenceRate}, +1105 samples and unequal origins: external pixels and one-sided analysis delay`, () => temp(d => {
  const f = fixture(d, { aac: true, stereo: true, lag: 1105, pictureOffset: '0.04', audioOffset: '0' });
  if (referenceRate !== 48000) {
    const converted = join(d, 'converted.wav'); ff(['-i', f.reference, '-ar', String(referenceRate), '-c:a', 'pcm_s16le', converted]);
    writeFileSync(f.reference, readFileSync(converted)); receipt(d, f.reference, referenceRate, referenceRate);
  }
  const changes = { 'correlation-floor': '0.8', 'drift-tolerance': '1/1000', 'max-offset': '0.2', 'max-hold-end': 8 };
  const r = success(f, changes), c = r.detail.correlation;
  const info = JSON.parse(run('ffprobe', ['-v', 'error', '-show_streams', '-show_frames', '-of', 'json', f.input]).stdout);
  const a = info.streams.find(s => s.codec_type === 'audio'); assert.equal(a.codec_name, 'aac'); assert.equal(a.sample_rate, '48000'); assert.equal(a.channels, 2);
  const first = type => { const s = info.streams.find(s => s.codec_type === type), frame = info.frames.find(f => f.media_type === type), [n, d] = s.time_base.split('/').map(BigInt); return [BigInt(frame.pts) * n, d]; };
  const [vn, vd] = first('video'), [an, ad] = first('audio'); assert.notEqual(an * vd, vn * ad);
  // Audio content starts at zero, picture starts at 1/25 second. AAC's edit
  // list removes priming. This oracle uses fixture facts, never measured lag.
  assert.equal(an, 0n); assert.equal(vn * 25n, vd);
  const lagN = 1105n * vd - vn * 48000n, lagD = vd * 48000n;
  oracle(f, r, { lagN, lagD });
  assert.equal(c.lag_samples, 1105);
  const settings = r.detail.decoder.vendor_audio.settings, af = settings[settings.indexOf('-af') + 1]; assert.equal(af, 'asetpts=N/SR/TB');
  const refSettings = r.detail.decoder.reference_audio.settings, refAF = refSettings[refSettings.indexOf('-af') + 1];
  assert.equal(refAF, referenceRate === 48000 ? 'asetpts=N/SR/TB' : 'asetpts=N/SR/TB,aresample=48000:first_pts=0');
  assert.equal(r.detail.decoder.build, r.detail.encoder.ffmpeg_version); assert.match(r.detail.decoder.build, /^ffmpeg version/);
  assert.equal(r.detail.decoder.probe_build, r.detail.encoder.ffprobe_version); assert.match(r.detail.decoder.probe_build, /^ffprobe version/);
  const delayed = mutant(d, 'vendor-delay', s => s.replace('ff(settings);\n  const bytes = readFileSync(out)', `ff(settings);
  if (name === 'vendor') { const pcm = readFileSync(out); pcm.copyWithin(97 * stream.channels * 8, 0, pcm.length - 97 * stream.channels * 8); pcm.fill(0, 0, 97 * stream.channels * 8); writeFileSync(out, pcm); }
  const bytes = readFileSync(out)`));
  const moved = success(f, changes, 'delayed', delayed);
  assert.equal(moved.detail.decoder.vendor_audio.samples, r.detail.decoder.vendor_audio.samples);
  assert.equal(moved.detail.correlation.lag_samples, c.lag_samples + 97);
  assert.throws(() => assert.equal(moved.detail.correlation.lag_samples, c.lag_samples), assert.AssertionError);
  // A stand-in models a count-preserving resampler delay only when an unnecessary
  // 48k resampler is present, only on the vendor side. Removing the branch fails.
  const ffmpeg = actual('ffmpeg'), wrapped = standin(d, 'ffmpeg', `const fs=require('node:fs'),a=process.argv.slice(2),r=require('node:child_process').spawnSync(${JSON.stringify(ffmpeg)},a,{stdio:'inherit'});if(r.status===0&&a.at(-1).endsWith('/vendor.f64le')&&a[a.indexOf('-af')+1].includes('aresample')){const p=a.at(-1),b=fs.readFileSync(p);b.copyWithin(97*16,0,b.length-97*16);b.fill(0,0,97*16);fs.writeFileSync(p,b)}process.exit(r.status??1);`);
  const check = program => { const v = run(process.execPath, [program, ...args(f, join(d, program === entry ? 'branch-ok' : 'branch-mutant'), changes)], wrapped); assert.equal(v.status, 0, v.stderr); assert.equal(JSON.parse(readFileSync(JSON.parse(v.stdout).receipt)).correlation.lag_samples, c.lag_samples); };
  check(entry);
  const always = mutant(d, 'always-resample', s => s.replace("...rateFilter(clock.rate)", "'aresample=48000:first_pts=0'"));
  assert.throws(() => check(always), assert.AssertionError);
}));
test('audio PTS/best-effort disagreement refuses; removing only its guard permits publication', () => temp(d => {
  const f = fixture(d), ffprobe = actual('ffprobe');
  const wrapped = standin(d, 'ffprobe', `const a=process.argv.slice(2),r=require('node:child_process').spawnSync(${JSON.stringify(ffprobe)},a,{encoding:'utf8'});if(r.status===0&&a.includes('-select_streams')&&a[a.indexOf('-select_streams')+1]==='a:0'){const v=JSON.parse(r.stdout);v.frames[0].best_effort_timestamp=v.frames[0].pts+1;process.stdout.write(JSON.stringify(v))}else process.stdout.write(r.stdout);process.stderr.write(r.stderr);process.exit(r.status??1);`);
  const check = program => { const r = run(process.execPath, [program, ...args(f)], wrapped); assert.equal(r.status, 1, r.stderr); assert.equal(r.stdout, ''); assert.match(r.stderr, /audio decoded PTS disagrees/); };
  check(entry); assert.ok(!existsSync(join(d, 'bundle')));
  const bypass = mutant(d, 'no-audio-pts-guard', s => s.replace('f.best_effort_timestamp !== undefined && integerPTS(f.best_effort_timestamp) !== integerPTS(f.pts)', 'false'));
  assert.throws(() => check(bypass), assert.AssertionError);
  assert.ok(existsSync(join(d, 'bundle', 'complete.json')));
}));
test('readback independently refuses a change to only the construction selection call; bypass control fails', () => temp(d => {
  const f = fixture(d), plant = s => s.replace('selection(clock.rows, p.frames, p.rate, p.origin, lag, p.holds)', 'selection(clock.rows, p.frames, p.rate, add(p.origin, rat(1n, 25n)), lag, p.holds)');
  const check = r => { assert.equal(r.status, 1, r.stderr); assert.equal(r.stdout, ''); assert.match(r.stderr, /readback.*correspondence|frame map/); };
  const planted = mutant(d, 'first-map-only', plant); check(invoke(f, { 'max-hold-end': 10 }, planted, 'out')); assert.ok(!existsSync(join(d, 'out')));
  const bypass = mutant(d, 'shared-map', s => plant(s).replace('mapping[n].source_ordinal !== ordinal || hashes[n] !== sourceHashes[ordinal]', 'hashes[n] !== sourceHashes[mapping[n].source_ordinal]'));
  const result = invoke(f, { 'max-hold-end': 10 }, bypass, 'unchecked'); assert.equal(result.status, 0, result.stderr);
  assert.throws(() => check(result), assert.AssertionError);
  const r = JSON.parse(result.stdout); r.detail = JSON.parse(readFileSync(r.receipt)); assert.throws(() => oracle(f, r), assert.AssertionError);
}));
test('file/pipe protocol whitelist itself refuses an otherwise valid non-file reference, entirely offline', () => temp(d => {
  const f = fixture(d), ffprobe = actual('ffprobe'), diagnostic = join(d, 'protocol-diagnostic.txt');
  const wrapped = standin(d, 'ffprobe', `const fs=require('node:fs'),a=process.argv.slice(2);if(a.includes('-show_streams')&&a.at(-1)===${JSON.stringify(f.reference)})a[a.length-1]='data:audio/wav;base64,'+fs.readFileSync(${JSON.stringify(f.reference)}).toString('base64');const r=require('node:child_process').spawnSync(${JSON.stringify(ffprobe)},a,{encoding:'utf8'});if(r.stderr||r.error)fs.writeFileSync(${JSON.stringify(diagnostic)},String(r.status)+' '+String(r.error??'')+' '+String(r.stderr).split('\\n')[0]);process.stdout.write(r.stdout);process.stderr.write(r.stderr);process.exit(r.status??1);`);
  const check = r => { assert.equal(r.status, 1); assert.equal(r.stdout, ''); assert.match(readFileSync(diagnostic, 'utf8'), /Protocol 'data' not on whitelist 'file,pipe'/); };
  check(run(process.execPath, [entry, ...args(f)], wrapped)); assert.ok(!existsSync(join(d, 'bundle')));
  const bypass = mutant(d, 'no-protocol-whitelist', s => s.replace("'-protocol_whitelist', 'file,pipe', ", ''));
  const result = run(process.execPath, [bypass, ...args(f)], wrapped); assert.equal(result.status, 0, result.stderr + readFileSync(diagnostic, 'utf8').slice(0,300));
  assert.throws(() => check(result), assert.AssertionError); assert.ok(existsSync(join(d, 'bundle', 'complete.json')));
}));
test('one-frame rival 0.001 below best is outside the declared ambiguity bound; stricter-bound control fails', () => temp(async d => {
  const pattern = noise(1600), unique = noise(48000, 1234567), x = Float64Array.from(unique, (v, i) => pattern[i % 1600] + 0.0464 * v), p = clockPolicy({ window: rat(1n) });
  const check = fn => { const r = fn(x, x, p, rat(0n)); assert.equal(r.whole.lag_samples, 0); assert.ok(Math.abs(r.whole.peak_margin - 0.001) < 0.0001, String(r.whole.peak_margin)); assert.ok(r.whole.overlap_samples >= 45600); assert.ok(48000 - 1600 >= 45600);
    let dot = 0, xx = 0, yy = 0; for (let j = 0; j < 46400; j++) { dot += x[j] * x[j + 1600]; xx += x[j] ** 2; yy += x[j + 1600] ** 2; }
    assert.ok(Math.abs(r.whole.runner_up_peak - dot / Math.sqrt(xx * yy)) < 1e-9, 'runner must be the legal one-frame rival'); return r; };
  check(correlate);
  const strict = await overlapMutant(d, 'strict-ambiguity', s => s.replace('margin < 0.000001', 'margin < 0.002'));
  assert.throws(() => check(strict), /near-tie/);
}));
test('whole-file lag is required in drift spread even when the window lags agree', () => temp(async d => {
  // Isolate aggregation from estimation: a stand-in whole-file result differs
  // by one sample while every real window remains at zero. No other check moves.
  const plant = s => s.replace("const [n, d] = whole.lag_seconds.split('/').map(BigInt);", "whole.lag_seconds = '1/48000'; const [n, d] = whole.lag_seconds.split('/').map(BigInt);");
  const guarded = await overlapMutant(d, 'whole-lag-planted', plant), x = noise(), check = fn => assert.throws(() => fn(x, x, clockPolicy(), rat(0n)), /drift/);
  check(guarded);
  const bypass = await overlapMutant(d, 'whole-lag-omitted', s => plant(s).replace('acceptDrift([...lags, rat(n, d)], policy.drift)', 'acceptDrift(lags, policy.drift)'));
  const r = bypass(x, x, clockPolicy(), rat(0n)); assert.equal(r.whole.lag_seconds, '1/48000'); assert.ok(r.windows.every(w => w.lag_seconds === '0/1')); assert.equal(r.drift_seconds, '0/1'); assert.throws(() => check(bypass), /Missing expected exception/);
}));

test('decoder build receipt checks fail on the old placeholder strings', () => temp(d => {
  const f = fixture(d), check = r => { assert.equal(r.detail.decoder.build, r.detail.encoder.ffmpeg_version); assert.equal(r.detail.decoder.probe_build, r.detail.encoder.ffprobe_version); assert.match(r.detail.decoder.build, /^ffmpeg version/); assert.match(r.detail.decoder.probe_build, /^ffprobe version/); };
  check(success(f));
  const placeholder = mutant(d, 'placeholder-builds', s => s.replace('build: ffmpegVersion, probe_build: ffprobeVersion', "build: 'encoder.ffmpeg_version', probe_build: 'encoder.ffprobe_version'"));
  const r = success(f, {}, 'placeholder-output', placeholder); assert.throws(() => check(r), assert.AssertionError);
}));
