import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, readdirSync, existsSync, readFileSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fraction, groupSize, offsetsFor, samplesAt } from '../scripts/finish.js';
import { measure, rateFilter } from '../scripts/loudness.js';

const entry = fileURLToPath(new URL('../scripts/edit.js', import.meta.url));
const tag = 'setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv';
function processRun(bin, args, binary = false) {
  return spawnSync(bin, args, { encoding: binary ? null : 'utf8', maxBuffer: 64 * 1024 * 1024 });
}
function ff(args, binary = false) {
  const r = processRun('ffmpeg', ['-v', 'error', '-nostdin', '-y', ...args], binary);
  assert.equal(r.status, 0, r.stderr?.toString()); return r;
}
function meterRun(args, label, bin = 'ffmpeg') {
  const r = processRun(bin, args); assert.equal(r.status, 0, `${label}: ${r.stderr}`); return r;
}
function inTemp(fn) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'video-edit-test-')));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}
function fixture(dir, name = 'input.mp4', options = {}) {
  const { fps = '30', frames = 47, size = '64x64', rate = 48000, channels = 1,
    audio = 'sine=frequency=1000', tags = tag, pix = 'yuv420p', extra = [], bf = 0,
    audioDuration = frames / evalFraction(fps) } = options;
  const output = join(dir, name);
  const picture = audio === null ? output : join(dir, `${name}.picture.mp4`);
  ff(['-f', 'lavfi', '-i', `color=c=gray:s=${size}:r=${fps}`, '-frames:v', String(frames),
    '-vf', tags || 'null', '-c:v', 'libx264', '-pix_fmt', pix, '-threads:v', '1', '-bf', String(bf),
    '-g', String(Math.round(evalFraction(fps) / 2)), '-an', ...extra, picture]);
  if (audio !== null) {
    const sound = audio.startsWith('sine=') ? `${audio}:sample_rate=${rate}:duration=${audioDuration}`
      : audio.startsWith('anullsrc=') ? `${audio}:d=${audioDuration}` : `${audio}:s=${rate}:d=${audioDuration}`;
    ff(['-i', picture, '-f', 'lavfi', '-i', sound, '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
      '-c:a', 'pcm_s24le', '-ac', String(channels), output]);
  }
  return output;
}

function evalFraction(raw) { const [p, q = '1'] = String(raw).split('/'); return Number(p) / Number(q); }
function invoke(command, inputs, output, flags = ['--target', '-24', '--true-peak', '-1']) {
  return processRun(process.execPath, [entry, command, ...inputs.flatMap(i => ['--input', i]), '--output', output, ...flags]);
}
function success(command, inputs, output, flags) {
  const result = invoke(command, inputs, output, flags); assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, ''); const json = JSON.parse(result.stdout); assert.ok(existsSync(output));
  assert.ok(!readdirSync(dirname(output)).some(n => n.startsWith('.wiser-video-edit-')));
  return json;
}
function refusal(command, inputs, output, pattern, flags) {
  const before = readdirSync(dirname(output)).sort();
  const r = invoke(command, inputs, output, flags);
  assert.equal(r.status, 1, r.stderr); assert.equal(r.stdout, ''); assert.match(r.stderr, pattern);
  assert.ok(!existsSync(output)); assert.deepEqual(readdirSync(dirname(output)).sort(), before);
}
function rawAudio(path) { return ff(['-i', path, '-map', '0:a:0', '-c:a', 'pcm_f64le', '-f', 'f64le', '-'], true).stdout; }
function videoHash(path) { return ff(['-noautorotate', '-i', path, '-map', '0:v:0', '-c:v', 'copy', '-f', 'hash', '-hash', 'sha256', '-']).stdout; }
function frameClock(path, stream, firstOnly = false) {
  const r = processRun('ffprobe', ['-v', 'error', '-select_streams', stream,
    ...(firstOnly ? ['-read_intervals', '%+#1'] : []), '-show_streams', '-show_frames',
    '-show_entries', 'stream=time_base:frame=best_effort_timestamp', '-of', 'json', path]);
  assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout);
}
function firstAudioSample(path) {
  const info = frameClock(path, 'a:0', true);
  assert.equal(info.streams[0].time_base, '1/48000');
  return Number(info.frames[0].best_effort_timestamp);
}

test('exact integer sample arithmetic, including the 3,2,3 fractional join', () => {
  for (const fps of ['30/1', '25/1', '30000/1001']) {
    const f = fraction(fps), counts = [47, 52, 53], offsets = offsetsFor(counts, f);
    assert.equal(groupSize(f), fps === '25/1' ? 13 : 15);
    offsets.forEach((o, i) => assert.equal(o.firstSample, Number(BigInt(counts.slice(0, i).reduce((a, b) => a + b, 0)) * 48000n * f.q / f.p)));
  }
  assert.equal(offsetsFor([3, 2, 3], fraction('30000/1001'))[1].firstSample, 4804);
  assert.equal(samplesAt(2, fraction('30000/1001')), 3203);
  assert.deepEqual(rateFilter(48000), []); assert.deepEqual(rateFilter(44100), ['aresample=48000:first_pts=0']);
});

test('help works and importing edit.js performs no command', () => {
  const help = processRun(process.execPath, [entry, 'help']); assert.equal(help.status, 0); assert.match(help.stdout, /loudness/); assert.match(help.stdout, /finish/);
  const imported = processRun(process.execPath, ['--input-type=module', '-e', `import ${JSON.stringify(new URL('../scripts/edit.js', import.meta.url).href)}`]);
  assert.equal(imported.status, 0, imported.stderr); assert.equal(imported.stdout, '');
});

test('loudness linear: exact copied packets, mono channels, 24-bit samples and identical repeats', () => inTemp(d => {
  const input = fixture(d), output = join(d, 'out.mp4');
  const result = success('loudness', [input], output);
  assert.equal(result.limiterEngaged, false); assert.equal(result.maximumGainReductionDB, 0);
  assert.ok(Math.abs(result.after.integrated + 24) <= 0.5); assert.equal(videoHash(input), videoHash(output));
  const a = rawAudio(input), b = rawAudio(output), gain = 10 ** (result.gainDB / 20);
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i += 8) assert.ok(Math.abs(b.readDoubleLE(i) - a.readDoubleLE(i) * gain) <= 1 / 8388608);
  const repeat = success('loudness', [input], join(d, 'repeat.mp4'));
  assert.equal(repeat.sha256, result.sha256); assert.deepEqual(readFileSync(output), readFileSync(repeat.output));
}));

test('loudness limited: oversampled ceiling, measured gain reduction and repeat bytes', () => inTemp(d => {
  const input = fixture(d, 'peaky.mp4', { frames: 181, audio: "aevalsrc=0.025*sin(2*PI*1000*t)+if(lt(mod(t\\,0.8)\\,0.004)\\,0.65*sin(2*PI*2000*t)\\,0)" });
  const flags = ['--target', '-14', '--true-peak', '-1'];
  const result = success('loudness', [input], join(d, 'limited.mp4'), flags);
  assert.equal(result.limiterEngaged, true); assert.ok(result.maximumGainReductionDB > 1);
  assert.ok(Math.abs(result.after.integrated + 14) <= 0.5); assert.ok(result.after.truePeak <= -1);
  assert.ok(result.passes <= result.maxPasses);
  assert.equal(success('loudness', [input], join(d, 'repeat.mp4'), flags).sha256, result.sha256);
}));

for (const fps of ['30/1', '25/1', '30000/1001']) {
  test(`finish ${fps}: every stored presentation time is exactly on the constant frame grid`, () => inTemp(d => {
    const inputs = [47, 52, 53].map((frames, i) => fixture(d, `scene${i}.mp4`, { fps, frames }));
    const result = success('finish', inputs, join(d, 'out.mp4'));
    const r = processRun('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_streams', '-show_packets',
      '-show_entries', 'stream=time_base:packet=pts,duration', '-of', 'json', result.output]);
    assert.equal(r.status, 0, r.stderr);
    const info = JSON.parse(r.stdout), rate = fraction(fps);
    const [p, q] = info.streams[0].time_base.split('/').map(BigInt);
    assert.equal(info.streams[0].time_base, `1/${rate.p}`);
    const frames = info.packets.sort((a, b) => a.pts - b.pts);
    assert.equal(frames.length, 152);
    const first = BigInt(frames[0].pts);
    frames.forEach((frame, n) => {
      assert.equal((BigInt(frame.pts) - first) * p * rate.p, BigInt(n) * rate.q * q, `frame ${n}`);
      assert.equal(BigInt(frame.duration) * p * rate.p, rate.q * q, `frame ${n} duration`);
    });
  }));

  test(`finish ${fps}: three long scenes, running-total floors, silence and repeat bytes`, () => inTemp(d => {
    const inputs = [47, 52, 53].map((frames, i) => fixture(d, `scene${i}.mp4`, { fps, frames, audio: i === 1 ? null : 'sine=frequency=1000', rate: i === 2 ? 44100 : 48000 }));
    const result = success('finish', inputs, join(d, 'out.mp4'));
    assert.equal(result.frames, 152); assert.equal(result.fps, fps); assert.equal(result.limiterEngaged, false);
    assert.deepEqual(result.offsets, offsetsFor([47, 52, 53], fraction(fps)));
    assert.equal(result.audioDelaySeconds, samplesAt(2, fraction(fps)) / 48000);
    assert.ok(result.checks.includes('keyframesIDR')); assert.ok(result.checks.includes('audioDuration'));
    const measured = measure(result.output, meterRun); assert.ok(Math.abs(measured.integrated + 24) <= 1); assert.ok(measured.truePeak <= -1);
    const audio = rawAudio(result.output);
    const middle = (result.offsets[1].firstSample + Math.floor(result.offsets[1].samples / 2)) * 16;
    assert.ok(Math.abs(audio.readDoubleLE(middle)) < 0.0001);
    assert.equal(success('finish', inputs, join(d, 'repeat.mp4')).sha256, result.sha256);
  }));
}

test('44.1 kHz resampling keeps the first sample within one sample', () => inTemp(d => {
  const input = fixture(d, 'impulse.mp4', { rate: 44100, frames: 47,
    audio: "aevalsrc=if(eq(n\\,0)\\,0.8\\,0.025*sin(2*PI*1000*t))" });
  const result = success('loudness', [input], join(d, 'out.mp4'));
  const audio = rawAudio(result.output); let max = 0, index = 0;
  for (let i = 0; i < 16; i++) if (Math.abs(audio.readDoubleLE(i * 8)) > max) { max = Math.abs(audio.readDoubleLE(i * 8)); index = i; }
  assert.ok(index <= 1);
}));

test('finish aligns the first source pulse to its own first shown frame (Opus priming)', () => inTemp(d => {
  const input = fixture(d, 'pulse.mp4', { frames: 91, fps: '30000/1001',
    audio: "aevalsrc=if(lt(n\\,480)\\,0.4*cos(2*PI*1000*t)\\,0.02*sin(2*PI*1000*t))" });
  const result = success('finish', [input], join(d, 'out.mp4'));
  const audio = rawAudio(result.output); let max = 0;
  for (let i = 0; i < audio.length; i += 16) max = Math.max(max, Math.abs(audio.readDoubleLE(i)));
  let onset = 0; while (Math.abs(audio.readDoubleLE(onset * 16)) < max / 2) onset++;
  const picture = frameClock(result.output, 'v:0', true);
  const [p, q] = picture.streams[0].time_base.split('/').map(Number);
  const shownTime = picture.frames[0].best_effort_timestamp * p / q;
  const presentedTime = (firstAudioSample(result.output) + onset) / 48000;
  assert.ok(Math.abs(presentedTime - shownTime) <= 1 / 48000, `pulse at ${presentedTime}, first shown frame at ${shownTime}`);
}));

test('finish refuses a picture delay smaller than the Opus pre-skip without publishing', () => inTemp(d => {
  const input = fixture(d, 'fast.mp4', { fps: '400', frames: 240 });
  refusal('finish', [input], join(d, 'out.mp4'), /finish: first-frame audio delay .* smaller than Opus pre-skip/);
  const output = join(d, 'existing.mp4'); writeFileSync(output, 'existing destination');
  const r = invoke('finish', [input], output);
  assert.equal(r.status, 1); assert.equal(r.stdout, ''); assert.match(r.stderr, /smaller than Opus pre-skip/);
  assert.equal(readFileSync(output, 'utf8'), 'existing destination');
  assert.ok(!readdirSync(d).some(n => n.startsWith('.wiser-video-edit-')));
}));

for (const command of ['loudness', 'finish']) {
  test(`${command}: refuses audio-only, multiple video/audio streams and gated silence`, () => inTemp(d => {
    const wav = join(d, 'audio.wav'); ff(['-f', 'lavfi', '-i', 'sine=d=2', wav]);
    refusal(command, [wav], join(d, 'out.mp4'), /exactly one video stream/);
    const input = fixture(d);
    const multi = join(d, 'multi.mp4'); ff(['-i', input, '-map', '0:v', '-map', '0:a', '-map', '0:a', '-c', 'copy', multi]);
    refusal(command, [multi], join(d, 'out.mp4'), /one audio stream/);
    const videos = join(d, 'videos.mp4'); ff(['-i', input, '-map', '0:v', '-map', '0:v', '-map', '0:a', '-c', 'copy', videos]);
    refusal(command, [videos], join(d, 'out.mp4'), /exactly one video stream/);
    const silence = fixture(d, 'silent.mp4', { audio: 'anullsrc=r=48000:cl=mono' });
    refusal(command, [silence], join(d, 'out.mp4'), /no gated block.*-70 LUFS/);
  }));
  test(`${command}: target and true-peak are required decimals with closed ranges`, () => inTemp(d => {
    const input = fixture(d);
    for (const [flag, values, other] of [['--target', ['-40.1', '-4.9', 'NaN', 'Infinity', '-24e0', ''], ['--true-peak', '-1']], ['--true-peak', ['-9.1', '0.1', 'NaN', '-1e0', ''], ['--target', '-24']]]) {
      refusal(command, [input], join(d, 'out.mp4'), new RegExp(flag), other);
      for (const value of values) refusal(command, [input], join(d, 'out.mp4'), new RegExp(flag), [flag, value, ...other]);
    }
  }));
  test(`${command}: cleanup on a bounded, impossible loudness correction`, () => inTemp(d => {
    const input = fixture(d);
    refusal(command, [input], join(d, 'out.mp4'), /converge in 12 passes/, ['--target', '-5', '--true-peak', '-9']);
  }));
}

test('loudness refuses no audio and repeated inputs', () => inTemp(d => {
  const input = fixture(d, 'silent-picture.mp4', { audio: null });
  refusal('loudness', [input], join(d, 'out.mp4'), /exactly one audio stream/);
  refusal('loudness', [input, input], join(d, 'out.mp4'), /takes one --input/);
}));

test('finish refuses differing width, height and frame rate before writes', () => inTemp(d => {
  const input = fixture(d);
  for (const [name, options, pattern] of [['width', {size:'80x64'}, /width or height/], ['height', {size:'64x80'}, /width or height/], ['rate', {fps:'25'}, /frame rate/]]) {
    const other = fixture(d, `${name}.mp4`, options); refusal('finish', [input, other], join(d, 'out.mp4'), pattern);
  }
}));

test('finish refuses untagged, wrong colour attributes, pixel format, display matrix and multichannel', () => inTemp(d => {
  const cases = [
    ['untagged', {tags:''}, /BT.709/],
    ['601', {tags:'setparams=color_primaries=smpte170m:color_trc=smpte170m:colorspace=smpte170m:range=tv'}, /BT.709/],
    ['range', {tags:tag.replace('range=tv','range=pc')}, /BT.709/],
    ['transfer', {tags:tag.replace('color_trc=bt709','color_trc=linear')}, /BT.709/],
    ['matrix', {tags:tag.replace('colorspace=bt709','colorspace=smpte170m')}, /BT.709/],
    ['pix', {pix:'yuv444p'}, /yuv420p/],
    ['channels', {channels:6}, /more than two audio channels/]
  ];
  for (const [name, options, pattern] of cases) refusal('finish', [fixture(d, `${name}.mp4`, options)], join(d,'out.mp4'), pattern);
  const input = fixture(d), matrix = join(d, 'matrix.mp4');
  ff(['-display_rotation:v:0', '90', '-i', input, '-c', 'copy', matrix]);
  const metadata = processRun('ffprobe', ['-v','error','-show_streams','-of','json',matrix]);
  assert.match(metadata.stdout, /Display Matrix/);
  refusal('finish', [matrix], join(d,'out.mp4'), /display matrix/);
}));

test('finish trims at most one frame of excess, pads short audio, and refuses longer audio', () => inTemp(d => {
  const short = fixture(d, 'short.mp4', {audioDuration: 0.8});
  success('finish', [short], join(d, 'short-out.mp4'));
  const one = fixture(d, 'one.mp4', {audioDuration: 48 / 30});
  success('finish', [one], join(d, 'one-out.mp4'));
  const long = fixture(d, 'long.mp4', {audioDuration: 49 / 30});
  refusal('finish', [long], join(d, 'out.mp4'), /longer than its picture by more than one frame/);
  const valid441 = fixture(d, 'valid441.mp4', {fps:'30000/1001', rate:44100, audioDuration:70629/44100});
  success('finish', [valid441], join(d,'valid441-out.mp4'));
  const excess441 = fixture(d, 'excess441.mp4', {fps:'30000/1001', rate:44100, audioDuration:70630/44100});
  assert.equal(rawAudio(excess441).length / 8, 70630);
  refusal('finish', [excess441], join(d,'excess441-out.mp4'), /longer than its picture by more than one frame/);
}));

test('new flags belong only to new commands; old flags are refused on new commands', () => inTemp(d => {
  const input = fixture(d);
  for (const command of ['edit', 'concat', 'frames', 'gif']) for (const flag of ['--target','--true-peak']) {
    const out = join(d, command === 'gif' ? 'out.gif' : command === 'frames' ? 'frames' : 'out.mp4');
    refusal(command, command === 'concat' ? [input,input] : [input], out, new RegExp(`${flag} does not apply`), [flag,'-9']);
  }
  for (const command of ['loudness','finish']) for (const flags of [['--fps','10'],['--width','64'],['--remove-audio'],['--text','x'],['--speed','1'],['--trim-start','0'],['--text-position','top']]) {
    refusal(command,[input],join(d,'out.mp4'), /does not apply/, [...flags,'--target','-24','--true-peak','-1']);
  }
}));

test('path screens, unknown/duplicate flags and failed FFmpeg leave no partial output', () => inTemp(d => {
  const input = fixture(d);
  for (const command of ['loudness','finish']) {
    refusal(command,[input],join(d,'out.mp4'), /unknown option.*--bogus/, ['--bogus','1']);
    refusal(command,[input],join(d,'out.mp4'), /--target was given twice/, ['--target','-24','--target','-23']);
    refusal(command,[input],join(d,'out.gif'), /must end .mp4/);
    refusal(command,['relative.mp4'],join(d,'out.mp4'), /--input must be absolute/);
    const blocked = join(d,'tool-link'); if (!existsSync(blocked)) symlinkSync(resolve(dirname(entry),'..'),blocked);
    const r = invoke(command,[input],join(blocked,'screened.mp4')); assert.equal(r.status,1); assert.equal(r.stdout,''); assert.match(r.stderr,/inside this tool directory/);
  }
  const bad = join(d,'bad.mp4'); writeFileSync(bad,'invalid media');
  refusal('loudness',[bad],join(d,'out.mp4'), /message is withheld/);
}));

test('edit, concat, frames and gif retain their existing operations', () => inTemp(d => {
  const input = fixture(d);
  const edited = success('edit',[input],join(d,'edit.mp4'),['--trim-start','0','--trim-end','1','--width','32','--height','32','--speed','2','--remove-audio']);
  assert.deepEqual(edited.operations,['trim','resize','speed','remove-audio']); assert.equal(edited.audio,'removed');
  const concatenated = success('concat',[input,input],join(d,'concat.mp4'),[]); assert.equal(concatenated.inputs,2); assert.equal(concatenated.audio,'kept');
  const frames = success('frames',[input],join(d,'frames'),['--fps','2']); assert.equal(frames.fps,2); assert.ok(frames.frames >= 3);
  const gif = success('gif',[input],join(d,'out.gif'),['--fps','2']); assert.equal(gif.width,480); assert.equal(gif.fps,2);
}));

for (const fps of ['30/1', '25/1', '30000/1001']) {
  test(`finish ${fps}: decoded pulse locations follow running floors, with a 44.1 kHz scene`, () => inTemp(d => {
    const counts = [47, 52, 53];
    const inputs = counts.map((frames, i) => fixture(d, `pulse-${i}.mp4`, {
      frames, fps, rate: i === 2 ? 44100 : 48000, audio: i === 1 ? null :
        "aevalsrc=if(between(t\\,0.1\\,0.11)\\,0.4*sin(2*PI*1000*t)\\,0.01*sin(2*PI*1000*t))"
    }));
    const result = success('finish', inputs, join(d, 'out.mp4'), ['--target','-30','--true-peak','-1']);
    assert.equal(result.limiterEngaged, false);
    const audio = rawAudio(result.output), origin = firstAudioSample(result.output);
    let running = 0;
    for (let i = 0; i < counts.length; i++) {
      const first = Number(BigInt(running) * 48000n * fraction(fps).q / fraction(fps).p);
      running += counts[i]; if (i === 1) continue;
      const expected = first + Math.floor(2 * 48000 / evalFraction(fps)) + 4800;
      let peak = 0;
      for (let sample = expected - origin - 100; sample < expected - origin + 600; sample++) peak = Math.max(peak,Math.abs(audio.readDoubleLE(sample * 16)));
      let onset = expected - origin - 100;
      while (Math.abs(audio.readDoubleLE(onset * 16)) < peak / 2) onset++;
      assert.ok(Math.abs(origin + onset - expected) <= 48, `scene ${i}, presented sample ${origin + onset}, expected ${expected}`);
    }
  }));
}

test('loudness preserves stereo channels and finish handles an input whose picture starts after zero', () => inTemp(d => {
  const input = fixture(d, 'stereo.mp4', { channels: 2, frames: 91, bf: 2, extra: ['-use_editlist','0'] });
  const loudness = success('loudness', [input], join(d, 'loud.mp4'));
  const info = JSON.parse(processRun('ffprobe',['-v','error','-select_streams','a:0','-show_streams','-of','json',loudness.output]).stdout);
  assert.equal(info.streams[0].channels,2); assert.equal(info.streams[0].codec_name,'pcm_s24le'); assert.equal(info.streams[0].sample_rate,'48000');
  const a = rawAudio(input), b = rawAudio(loudness.output), gain = 10 ** (loudness.gainDB / 20);
  assert.equal(a.length,b.length);
  for(let n=0;n<a.length;n+=8) assert.ok(Math.abs(b.readDoubleLE(n)-a.readDoubleLE(n)*gain)<=1/8388608);
  const finished = success('finish',[input],join(d,'finished.mp4'));
  assert.equal(finished.frames,91); assert.equal(finished.audioDelaySeconds,3200/48000);
}));

test('finish limited path converges on encoded Opus and is byte identical', () => inTemp(d => {
  const input = fixture(d, 'peaky.mp4', {frames:181, channels:2,
    audio: "aevalsrc=0.025*sin(2*PI*1000*t)+if(lt(mod(t\\,0.8)\\,0.004)\\,0.65*sin(2*PI*2000*t)\\,0)" });
  const flags = ['--target','-14','--true-peak','-1'];
  const result = success('finish',[input],join(d,'out.mp4'),flags);
  assert.equal(result.limiterEngaged,true); assert.ok(result.maximumGainReductionDB > 1);
  const after = measure(result.output,meterRun); assert.ok(Math.abs(after.integrated + 14)<=1); assert.ok(after.truePeak<=-1);
  assert.equal(success('finish',[input],join(d,'repeat.mp4'),flags).sha256,result.sha256);
}));

test('existing destinations are replaced only after success and temporary directories are removed', () => inTemp(d => {
  const input = fixture(d), output = join(d,'out.mp4');
  const temps = () => readdirSync(realpathSync(tmpdir())).filter(n=>n.startsWith('wiser-video-edit-')).sort();
  const before = temps(); writeFileSync(output,'existing output');
  const failed = invoke('loudness',[input],output,['--target','-5','--true-peak','-9']);
  assert.equal(failed.status,1); assert.equal(failed.stdout,''); assert.equal(readFileSync(output,'utf8'),'existing output');
  assert.deepEqual(temps(),before);
  success('loudness',[input],output); assert.notEqual(readFileSync(output).toString('ascii',0,8),'existing'); assert.deepEqual(temps(),before);
  const failedDirectory = join(d,'parent-file'); writeFileSync(failedDirectory,'a file');
  const r = invoke('finish',[input],join(failedDirectory,'out.mp4')); assert.equal(r.status,1); assert.equal(r.stdout,''); assert.deepEqual(temps(),before);
}));
