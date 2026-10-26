import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const entry = fileURLToPath(new URL('../scripts/edit.js', import.meta.url));
const tags = 'setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv';
function run(binary, args, options = {}) {
  return spawnSync(binary, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...options });
}
function ff(args) {
  const result = run('ffmpeg', ['-v', 'error', '-nostdin', '-y', '-filter_threads', '1', ...args]);
  assert.equal(result.status, 0, result.stderr);
  return result;
}
function temp(fn) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'video-edit-review-test-')));
  try { return fn(directory); } finally { rmSync(directory, { recursive: true, force: true }); }
}
function picture(d, name, { fps = '30', frames = 90, filter = 'null', extra = [] } = {}) {
  const output = join(d, name);
  ff(['-f', 'lavfi', '-i', `color=c=gray:s=64x64:r=${fps}`, '-frames:v', String(frames),
    '-vf', `${filter},${tags}`, '-an', '-c:v', 'libx264', '-threads:v', '1', '-bf', '2',
    '-x264-params', 'b-adapt=0', '-pix_fmt', 'yuv420p', '-use_editlist', '0', ...extra, output]);
  return output;
}
function audio(d, expression = '0.1*sin(2*PI*1000*t)', duration = 0.8) {
  const output = join(d, 'audio.wav');
  ff(['-f', 'lavfi', '-i', `aevalsrc=${expression}:s=48000:d=${duration}`, '-c:a', 'pcm_s24le', output]);
  return output;
}
function withAudio(d, video, wav) {
  const output = join(d, 'input.mp4');
  ff(['-i', video, '-i', wav, '-map', '0:v:0', '-map', '1:a:0', '-c', 'copy', '-use_editlist', '0', output]);
  return output;
}
function invoke(command, input, output, flags = ['--target', '-24', '--true-peak', '-1']) {
  return run(process.execPath, [entry, command, '--input', input, '--output', output, ...flags],
    { env: { ...process.env, TMPDIR: dirname(input) } });
}
function success(command, input, output, flags) {
  const result = invoke(command, input, output, flags);
  assert.equal(result.status, 0, result.stderr); assert.equal(result.stderr, ''); assert.ok(existsSync(output));
  return JSON.parse(result.stdout);
}
function perChannelPeaks(path) {
  const info = run('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=channels', '-of', 'json', path]);
  assert.equal(info.status, 0, info.stderr);
  return Array.from({ length: JSON.parse(info.stdout).streams[0].channels }, (_, channel) => {
    const result = run('ffmpeg', ['-hide_banner', '-nostdin', '-loglevel', 'info', '-i', path, '-map', '0:a:0', '-vn',
      '-af', `pan=mono|c0=c${channel},ebur128=peak=true:framelog=verbose`, '-f', 'null', '-']);
    assert.equal(result.status, 0, result.stderr);
    const peak = /True peak:\s*Peak:\s*([+-]?(?:[\d.]+|inf)) dBFS/.exec(result.stderr.slice(result.stderr.lastIndexOf('Summary:')));
    assert.ok(peak, 'no mono true-peak summary');
    return Number(peak[1]);
  });
}
function clock(path) {
  const result = run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_streams', '-show_packets',
    '-show_entries', 'stream=r_frame_rate,avg_frame_rate,time_base:packet=pts', '-of', 'json', path]);
  assert.equal(result.status, 0, result.stderr);
  const info = JSON.parse(result.stdout), stream = info.streams[0];
  const [p, q] = stream.time_base.split('/').map(Number);
  const [r, s] = stream.r_frame_rate.split('/').map(Number);
  const timestamps = info.packets.map(packet => packet.pts).sort((a, b) => a - b);
  return { stream, timestamps, errors: timestamps.map((pts, n) => (pts - timestamps[0]) * p / q * r / s - n) };
}

for (const command of ['loudness', 'finish']) {
  test(`${command}: a loud right channel engages the limiter and every channel meets the true-peak limit`, t => temp(d => {
    const wav = audio(d, '0.1*sin(2*PI*1000*t)|if(lt(mod(t\\,0.8)\\,0.004)\\,0.9\\,0.01)*sin(2*PI*2000*t)', 3);
    const input = withAudio(d, picture(d, 'picture.mp4'), wav), before = perChannelPeaks(input), limit = -6;
    assert.equal(before.length, 2); assert.ok(before[0] < limit && before[1] > limit, JSON.stringify(before));
    const result = success(command, input, join(d, 'out.mp4'), ['--target', '-21', '--true-peak', String(limit)]);
    const after = perChannelPeaks(result.output);
    t.diagnostic(`per-channel true peaks (dBTP): input ${JSON.stringify(before)}, output ${JSON.stringify(after)}, limit ${limit}`);
    assert.equal(result.before.truePeak, Math.max(...before));
    assert.equal(result.limiterEngaged, true); assert.ok(result.maximumGainReductionDB > 1);
    assert.ok(after.every(peak => peak <= limit), JSON.stringify(after));
    assert.equal(result.after.truePeak, Math.max(...after));
    assert.ok(Math.abs(result.after.integrated + 21) <= (command === 'loudness' ? 0.5 : 1));
  }));
}

test('mux and finish refuse variable presentation times before creating a destination or scratch directory; loudness preserves them', () => temp(d => {
  const video = picture(d, 'variable.mp4', { frames: 60,
    filter: 'setpts=if(lt(N\\,30)\\,N/(30*TB)\\,(1+(N-30)/15)/TB)', extra: ['-fps_mode', 'vfr'] });
  const wav = audio(d), input = withAudio(d, video, wav);
  const timing = clock(video);
  assert.equal(timing.timestamps.length, 60); assert.ok(timing.errors.some(error => Math.abs(error) > 0.5));
  assert.ok(timing.timestamps.some((pts, i, all) => i && pts - all[i - 1] !== all[1] - all[0]));
  for (const command of ['mux', 'finish']) {
    const source = command === 'mux' ? video : input, output = join(d, `absent-${command}`, 'out.mp4');
    const before = readdirSync(d).sort();
    const result = invoke(command, source, output, command === 'mux' ? ['--audio', wav] : undefined);
    assert.equal(result.status, 1, result.stderr); assert.equal(result.stdout, '');
    assert.ok(result.stderr.startsWith(`Error: ${command}: input ${source} is not at a constant frame rate;`), result.stderr);
    assert.ok(!existsSync(dirname(output))); assert.deepEqual(readdirSync(d).sort(), before);
  }
  const result = success('loudness', input, join(d, 'levelled.mp4'));
  assert.deepEqual(clock(result.output).timestamps, clock(input).timestamps);
}));

test('mux and finish accept a 30000/1001 grid rounded to a 1/1000 time base despite differing average frame rate', () => temp(d => {
  const video = picture(d, 'rounded.mp4', { fps: '30000/1001', frames: 91, extra: ['-video_track_timescale', '1000'] });
  const timing = clock(video);
  assert.equal(timing.stream.r_frame_rate, '30000/1001'); assert.equal(timing.stream.time_base, '1/1000');
  assert.notEqual(timing.stream.avg_frame_rate, timing.stream.r_frame_rate);
  assert.ok(timing.errors.some(error => Math.abs(error) > 0.001));
  assert.ok(timing.errors.every(error => Math.abs(error) <= 0.5));
  const wav = audio(d), input = withAudio(d, video, wav);
  for (const command of ['mux', 'finish']) {
    const result = success(command, command === 'mux' ? video : input, join(d, `${command}.mp4`),
      command === 'mux' ? ['--audio', wav] : undefined);
    assert.equal(result.fps, '30000/1001'); assert.equal(result.frames, 91);
  }
}));

test('finish pre-skip refusal leaves no newly created parent or scratch directory', () => temp(d => {
  const input = withAudio(d, picture(d, 'fast.mp4', { fps: '400', frames: 240 }), audio(d, undefined, 0.6));
  const before = readdirSync(d).sort(), output = join(d, 'absent', 'nested', 'out.mp4');
  const result = invoke('finish', input, output);
  assert.equal(result.status, 1, result.stderr); assert.equal(result.stdout, '');
  assert.match(result.stderr, /finish: first-frame audio delay .* smaller than Opus pre-skip/);
  assert.ok(!existsSync(join(d, 'absent'))); assert.deepEqual(readdirSync(d).sort(), before);
}));
