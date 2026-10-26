import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, readdirSync, readFileSync, writeFileSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startSamples } from '../scripts/mux.js';

const entry = fileURLToPath(new URL('../scripts/edit.js', import.meta.url));
const tags = 'setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv';
function run(bin, args, binary = false) {
  return spawnSync(bin, args, { encoding: binary ? null : 'utf8', maxBuffer: 64 * 1024 * 1024 });
}
function ff(args, binary = false) {
  const r = run('ffmpeg', ['-v', 'error', '-nostdin', '-y', '-filter_threads', '1', ...args], binary);
  assert.equal(r.status, 0, r.stderr?.toString()); return r.stdout;
}
function probe(path, args = []) {
  const r = run('ffprobe', ['-v', 'error', ...args, '-of', 'json', path]);
  assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout);
}
function temp(fn) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'video-edit-mux-test-')));
  try { return fn(directory); } finally { rmSync(directory, { recursive: true, force: true }); }
}
function video(d, name = 'picture.mp4', { fps = '30000/1001', frames = 91, bf = 0, offset = null } = {}) {
  const path = join(d, name);
  ff(['-f', 'lavfi', '-i', `color=c=gray:s=64x64:r=${fps}`, '-frames:v', String(frames),
    '-vf', tags, '-an', '-c:v', 'libx264', '-threads:v', '1', '-pix_fmt', 'yuv420p',
    '-bf', String(bf), '-x264-params', 'b-adapt=0', '-use_editlist', '0',
    ...(offset === null ? [] : ['-bsf:v', `setts=pts=PTS+${offset}/TB`]), path]);
  return path;
}
function narration(d, name = 'narration.wav', { rate = 48000, channels = 1, duration = '0.8' } = {}) {
  const path = join(d, name);
  ff(['-f', 'lavfi', '-i', `aevalsrc=if(lt(n\\,480)\\,0.4*cos(2*PI*1000*t)\\,0.01*sin(2*PI*1000*t)):s=${rate}:d=${duration}`,
    '-ac', String(channels), '-c:a', 'pcm_s24le', path]);
  return path;
}
function invoke(command, inputs, output, flags = []) {
  return spawnSync(process.execPath, [entry, command, ...inputs.flatMap(p => ['--input', p]), '--output', output, ...flags],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, TMPDIR: dirname(inputs[0]) } });
}
function success(command, inputs, output, flags = []) {
  const r = invoke(command, inputs, output, flags); assert.equal(r.status, 0, r.stderr); assert.equal(r.stderr, '');
  assert.ok(existsSync(output)); assert.ok(!readdirSync(dirname(output)).some(p => p.startsWith('.wiser-video-edit-')));
  return JSON.parse(r.stdout);
}
function mux(input, audio, output, start) {
  return success('mux', [input], output, ['--audio', audio, ...(start === undefined ? [] : ['--audio-start', start])]);
}
function refuse(inputs, output, pattern, flags = []) {
  const parent = dirname(output), before = readdirSync(parent).sort();
  const r = invoke('mux', inputs, output, flags);
  assert.equal(r.status, 1, r.stderr); assert.equal(r.stdout, ''); assert.match(r.stderr, /^Error: /); assert.match(r.stderr, pattern);
  assert.deepEqual(readdirSync(parent).sort(), before); assert.ok(!existsSync(output));
}
function raw(path) { return ff(['-i', path, '-map', '0:a:0', '-c:a', 'pcm_f64le', '-f', 'f64le', '-'], true); }
function onset(audio, expected, channels = 1, tolerance = 0) {
  let peak = 0;
  for (let n = expected; n < expected + 480; n++) peak = Math.max(peak, Math.abs(audio.readDoubleLE(n * channels * 8)));
  assert.ok(peak > 0.001);
  let first = Math.max(0, expected - Math.max(100, tolerance));
  while (Math.abs(audio.readDoubleLE(first * channels * 8)) < peak / 2) first++;
  assert.ok(Math.abs(first - expected) <= tolerance, `first narration sample ${first}, expected ${expected} +/- ${tolerance}`);
}
function firstSample(path, stream = 'v:0') {
  const info = probe(path, ['-select_streams', stream, '-show_streams', '-show_frames', '-read_intervals', '%+#1']);
  const [p, q] = info.streams[0].time_base.split('/').map(BigInt);
  return Number(BigInt(info.frames[0].best_effort_timestamp) * p * 48000n / q);
}
function packets(path) {
  return probe(path, ['-select_streams', 'v:0', '-show_packets', '-show_data_hash', 'sha256',
    '-show_entries', 'packet=pts,dts,duration,data_hash']).packets;
}
function noEditList(path) {
  const data = readFileSync(path);
  function walk(start, end) {
    for (let n = start; n < end;) {
      let length = data.readUInt32BE(n), header = 8;
      const type = data.toString('ascii', n + 4, n + 8);
      if (length === 1) { length = Number(data.readBigUInt64BE(n + 8)); header = 16; }
      if (!length) length = end - n;
      assert.notEqual(type, 'elst');
      if (['moov', 'trak', 'edts'].includes(type)) walk(n + header, n + length);
      n += length;
    }
  }
  walk(0, data.length);
}

test('audio-start decimal arithmetic never rounds through a float', () => {
  for (const [s, n] of [['0', 0], ['0.0123', 591], ['1.5', 72000], ['0.2', 9600],
    ['0.00002083333333333333333333333333333333333333333333333334', 2],
    ['0.00002083333333333333333333333333333333333333333333333333', 1]]) assert.equal(startSamples(s), n);
});

for (const bf of [0, 2]) for (const start of ['0', '0.0123', '1.5', '0.2']) {
  test(`mux ${bf ? 'B-frame delayed' : 'zero-start'} picture: audio-start ${start}`, () => temp(d => {
    const input = video(d, 'picture.mp4', { bf, fps: '25/1' }), audio = narration(d), output = join(d, 'out.mp4');
    const result = mux(input, audio, output, start), data = raw(output);
    const f = firstSample(input), lead = ({ '0': 0, '0.0123': 591, '1.5': 72000, '0.2': 9600 })[start];
    assert.equal(result.firstFrameSample, f); assert.equal(f, bf ? 3840 : 0);
    assert.equal(result.audioStartSample, f + lead); assert.equal(result.samples, f + 91 * 1920);
    assert.equal(result.narrationSamples, 38400); assert.equal(result.resampled, false); assert.equal(result.channels, 1);
    assert.equal(result.frames, 91); assert.equal(result.fps, '25/1'); assert.deepEqual(result.operations, ['mux']);
    assert.equal(data.length / 8, result.samples); assert.deepEqual(packets(input), packets(output));
    assert.ok(data.subarray(0, result.audioStartSample * 8).every(n => n === 0));
    const source = raw(audio); assert.deepEqual(data.subarray(result.audioStartSample * 8, (result.audioStartSample + 38400) * 8), source);
    assert.ok(data.subarray((result.audioStartSample + 38400) * 8).every(n => n === 0)); onset(data, f + lead);
    const streams = probe(output, ['-show_streams']).streams;
    assert.equal(streams.length, 2); assert.equal(streams[1].codec_name, 'pcm_s24le'); assert.equal(streams[1].start_pts, 0);
    assert.equal(streams[1].sample_rate, '48000'); noEditList(output);
    const repeat = mux(input, audio, join(d, 'repeat.mp4'), start);
    assert.equal(repeat.sha256, result.sha256); assert.deepEqual(readFileSync(output), readFileSync(repeat.output));
  }));
}

test('mux default start, stereo preservation, fractional frame time, and 44.1 kHz delay compensation', () => temp(d => {
  const input = video(d, 'bframes.mp4', { bf: 2 });
  const audio = narration(d, '44100.wav', { rate: 44100, channels: 2 });
  const result = mux(input, audio, join(d, 'out.mp4'));
  assert.equal(firstSample(input), 3203); assert.equal(result.audioStartSample, 3203); assert.equal(result.resampled, true);
  assert.equal(result.channels, 2); assert.equal(result.narrationSamples, 38400);
  assert.equal(result.samples, 3203 + Number(91n * 8008n / 5n));
  const data = raw(result.output); assert.equal(data.length / 16, result.samples); onset(data, 3203, 2, 1);
}));

test('mux preserves a picture clock with an explicit nonzero origin', () => temp(d => {
  const input = video(d, 'offset.mp4', { bf: 2, offset: '1.25' });
  const result = mux(input, narration(d), join(d, 'out.mp4'), '0.0123');
  assert.ok(result.firstFrameSample > 48000); assert.equal(result.firstFrameSample, firstSample(input));
  assert.deepEqual(packets(input), packets(result.output)); onset(raw(result.output), result.firstFrameSample + 591);
}));

test('mux then loudness keeps B-frame narration on its picture clock, with identical repeats', () => temp(d => {
  const input = video(d, 'bframes.mp4', { bf: 2 }), audio = narration(d);
  const laid = mux(input, audio, join(d, 'mux.mp4'), '0.2');
  const flags = ['--target', '-30', '--true-peak', '-1'];
  const result = success('loudness', [laid.output], join(d, 'loud.mp4'), flags);
  assert.equal(result.limiterEngaged, false); assert.deepEqual(packets(laid.output), packets(result.output));
  const before = raw(laid.output), after = raw(result.output), gain = 10 ** (result.gainDB / 20);
  assert.equal(before.length, after.length);
  for (let n = 0; n < before.length; n += 8) assert.ok(Math.abs(after.readDoubleLE(n) - before.readDoubleLE(n) * gain) <= 1 / 8388608);
  onset(after, laid.audioStartSample); noEditList(result.output);
  assert.equal(success('loudness', [laid.output], join(d, 'repeat.mp4'), flags).sha256, result.sha256);
}));

for (const start of ['0.123', '-0.123']) {
  test(`loudness reads audio stream start ${start} from the input and keeps its sample times`, () => temp(d => {
    const input = video(d), wav = narration(d), shifted = join(d, 'shifted.mp4');
    ff(['-copyts', '-i', input, '-itsoffset', start, '-i', wav, '-map', '0:v', '-map', '1:a', '-c', 'copy',
      '-avoid_negative_ts', 'disabled', shifted]);
    const stream = probe(shifted, ['-select_streams', 'a:0', '-show_streams']).streams[0];
    const [p, q] = stream.time_base.split('/').map(BigInt);
    const numerator = BigInt(stream.start_pts) * p * 48000n;
    const a = Number(numerator / q - (numerator < 0n && numerator % q ? 1n : 0n));
    const result = success('loudness', [shifted], join(d, 'out.mp4'), ['--target', '-30', '--true-peak', '-1']);
    const before = raw(shifted), after = raw(result.output), gain = 10 ** (result.gainDB / 20);
    assert.equal(after.length / 8, before.length / 8 + a);
    for (let n = Math.max(0, a); n < after.length / 8; n++) {
      assert.ok(Math.abs(after.readDoubleLE(n * 8) - before.readDoubleLE((n - a) * 8) * gain) <= 1 / 8388608);
    }
    if (a > 0) assert.ok(after.subarray(0, a * 8).every(n => n === 0)); noEditList(result.output);
  }));
}

test('mux then finish places three fractional-rate inputs by running totals, dropping pre-frame audio', () => temp(d => {
  const counts = [47, 52, 53], starts = ['0.0123', '0.2', '0.12345'], leads = [591, 9600, 5926];
  const inputs = counts.map((frames, i) => {
    const v = video(d, `picture-${i}.mp4`, { frames, bf: 2 });
    return mux(v, narration(d, `narration-${i}.wav`), join(d, `mux-${i}.mp4`), starts[i]).output;
  });
  const flags = ['--target', '-30', '--true-peak', '-1'];
  const result = success('finish', inputs, join(d, 'out.mp4'), flags), data = raw(result.output);
  assert.equal(result.limiterEngaged, false); const delay = firstSample(result.output); assert.equal(delay, 3203);
  const origin = firstSample(result.output, 'a:0');
  let total = 0;
  for (let i = 0; i < counts.length; i++) {
    const position = Number(BigInt(total) * 8008n / 5n);
    assert.equal(result.offsets[i].firstSample, position); onset(data, delay - origin + position + leads[i], 2, 48);
    total += counts[i];
  }
  noEditList(result.output); assert.equal(probe(result.output, ['-select_streams', 'a:0', '-show_streams']).streams[0].start_pts, 0);
  assert.equal(success('finish', inputs, join(d, 'repeat.mp4'), flags).sha256, result.sha256);
}));

test('mux: refusals open with Error: for wrong stream types, multiple streams, multichannel and every overrun before writes', () => temp(d => {
  const input = video(d), audio = narration(d), output = join(d, 'out.mp4');
  const av = mux(input, audio, join(d, 'av.mp4')).output;
  refuse([av], output, /video .*already carries audio/, ['--audio', audio]);
  refuse([audio], output, /exactly one video stream/, ['--audio', audio]);
  refuse([input], output, /--audio .*holds a video stream/, ['--audio', av]);
  refuse([input], output, /--audio .*holds a video stream/, ['--audio', input]);
  const multiVideo = join(d, 'videos.mp4'); ff(['-i', input, '-map', '0:v', '-map', '0:v', '-c', 'copy', multiVideo]);
  refuse([multiVideo], output, /exactly one video stream/, ['--audio', audio]);
  const multiAudio = join(d, 'audio.mka'); ff(['-i', audio, '-map', '0:a', '-map', '0:a', '-c', 'copy', multiAudio]);
  refuse([input], output, /exactly one audio stream/, ['--audio', multiAudio]);
  const six = narration(d, 'six.wav', { channels: 6 });
  refuse([input], output, /more than two channels/, ['--audio', six]);
  const long = narration(d, 'long.wav', { duration: '4' });
  refuse([input], output, /narration .*past the video's end/, ['--audio', long]);
  for (const start of ['2.5', '3.0363666666666666666667', '4']) {
    refuse([input], output, /narration .*past the video's end/, ['--audio', audio, '--audio-start', start]);
  }
  const exactVideo = video(d, 'exact.mp4', { fps: '25', frames: 25 });
  refuse([exactVideo], output, /narration .*past the video's end/, ['--audio', audio, '--audio-start', '1']);
  const noParent = join(d, 'absent', 'out.mp4');
  const r = invoke('mux', [input], noParent, ['--audio', long]); assert.equal(r.status, 1); assert.ok(!existsSync(dirname(noParent)));
}));

test('mux exact fit succeeds and one extra source sample is refused', () => temp(d => {
  const input = video(d, 'exact.mp4', { fps: '25', frames: 25 });
  const audio = narration(d, 'fit.wav', { duration: '1' });
  const result = mux(input, audio, join(d, 'fit.mp4')); assert.equal(result.samples, 48000);
  const long = join(d, 'one-more.wav');
  ff(['-f', 'lavfi', '-i', 'aevalsrc=0.1:s=48000', '-af', 'atrim=end_sample=48001', '-c:a', 'pcm_s24le', long]);
  refuse([input], join(d, 'out.mp4'), /narration .*past the video's end/, ['--audio', long]);
}));

test('mux options, required local audio paths and output screens are closed before writes', () => temp(d => {
  const input = video(d), audio = narration(d), output = join(d, 'out.mp4');
  refuse([input], output, /--audio is required/);
  for (const value of ['-1', 'NaN', 'Infinity', '0.2e0', '', '+1', '9999999999999999999999999999']) {
    refuse([input], output, /--audio-start/, ['--audio', audio, '--audio-start', value]);
  }
  for (const [path, pattern] of [['relative.wav', /--audio must be absolute/], [join(d, 'missing.wav'), /no file/], [d, /not a file/]]) {
    refuse([input], output, pattern, ['--audio', path]);
  }
  refuse([input], output, /--audio was given twice/, ['--audio', audio, '--audio', audio]);
  refuse([input], output, /--audio-start was given twice/, ['--audio', audio, '--audio-start', '0', '--audio-start', '1']);
  refuse([input], output, /--audio-start needs a value/, ['--audio', audio, '--audio-start']);
  refuse([input, input], output, /takes one --input/, ['--audio', audio]);
  refuse([input], join(d, 'out.wav'), /must end .mp4/, ['--audio', audio]);
  for (const flags of [['--fps', '10'], ['--target', '-24'], ['--true-peak', '-1'], ['--width', '64'], ['--remove-audio']]) {
    refuse([input], output, /does not apply to mux/, ['--audio', audio, ...flags]);
  }
  const link = join(d, 'tool'); symlinkSync(resolve(dirname(entry), '..'), link);
  const r = invoke('mux', [input], join(link, 'screened.mp4'), ['--audio', audio]);
  assert.equal(r.status, 1); assert.match(r.stderr, /inside this tool directory/);
  for (const command of ['edit', 'concat', 'frames', 'gif', 'loudness', 'finish']) for (const flag of ['--audio', '--audio-start']) {
    const out = join(d, command === 'gif' ? 'out.gif' : command === 'frames' ? 'frames' : 'out.mp4');
    const result = invoke(command, command === 'concat' ? [input, input] : [input], out, [flag, flag === '--audio' ? audio : '0']);
    assert.equal(result.status, 1); assert.equal(result.stdout, ''); assert.match(result.stderr, new RegExp(`${flag} does not apply to ${command}`));
    assert.ok(!existsSync(out));
  }
}));

test('mux keeps existing destinations on failure and cleans all scratch files after success', () => temp(d => {
  const input = video(d), audio = narration(d), output = join(d, 'out.mp4');
  const temps = () => readdirSync(d).filter(n => n.startsWith('wiser-video-edit-')).sort();
  const before = temps(); writeFileSync(output, 'existing destination');
  const result = invoke('mux', [input], output, ['--audio', audio, '--audio-start', '5']);
  assert.equal(result.status, 1); assert.equal(readFileSync(output, 'utf8'), 'existing destination');
  assert.deepEqual(temps(), before); mux(input, audio, output); assert.deepEqual(temps(), before);
  const parent = join(d, 'file'); writeFileSync(parent, 'file');
  const failed = invoke('mux', [input], join(parent, 'out.mp4'), ['--audio', audio]);
  assert.equal(failed.status, 1); assert.equal(failed.stdout, ''); assert.deepEqual(temps(), before);
}));
