import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mp4Structure } from '../scripts/finish.js';

const tool = resolve(dirname(fileURLToPath(import.meta.url)), '..'), entry = join(tool, 'scripts/edit.js');
const id = p => ({ bytes: statSync(p).size, sha256: createHash('sha256').update(readFileSync(p)).digest('hex') });
const json = p => JSON.parse(readFileSync(p, 'utf8'));
function temp(fn) { const d = realpathSync(mkdtempSync(join(tmpdir(), 'wiser-video-evidence-test-'))); try { return fn(d); } finally { rmSync(d, { recursive: true, force: true }); } }
function run(bin, args, extra = {}) { return spawnSync(bin, args, { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, ...extra }); }
function ff(args, binary = false) {
  const r = run('ffmpeg', ['-nostdin', '-y', '-v', 'error', '-filter_threads', '1', ...args], { encoding: binary ? null : 'utf8' });
  assert.equal(r.status, 0, r.stderr?.toString()); return r.stdout;
}
function probe(p) { const r = run('ffprobe', ['-v', 'error', '-show_streams', '-show_frames', '-of', 'json', p]); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout); }
function fixture(d, name, { width = 64, height = 48, count = 8, rate = '30/1', timescale = '30', bf = 0, seed = 17, audio = false, tags = true } = {}) {
  const size = width * height * 3 / 2, raw = join(d, `${name}.yuv`), bytes = Buffer.alloc(size * count);
  for (let n = 0; n < count; n++) {
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) bytes[n * size + y * width + x] = 16 + (seed + n * 23 + y * 7 + x * 3) % 220;
    for (let bit = 0; bit < 8; bit++) bytes.fill(n & 1 << bit ? 220 : 30, n * size + bit * 4, n * size + bit * 4 + 4);
    for (let c = 0; c < width * height / 4; c++) { bytes[n * size + width * height + c] = 16 + (c * 7 + n * 17 + seed) % 224; bytes[n * size + width * height * 5 / 4 + c] = 16 + (c * 11 + n * 13 + seed) % 224; }
  }
  writeFileSync(raw, bytes);
  const path = join(d, `${name}.mp4`);
  ff(['-f', 'rawvideo', '-pixel_format', 'yuv420p', '-video_size', `${width}x${height}`, '-framerate', rate, '-i', raw,
    ...(audio ? ['-f', 'lavfi', '-i', 'sine=frequency=997:sample_rate=48000:d=1'] : []), '-map', '0:v:0', ...(audio ? ['-map', '1:a:0', '-c:a', 'pcm_s16le'] : []),
    '-frames:v', String(count), '-c:v', 'libx264', '-crf', bf ? '18' : '0', '-threads:v', '1', '-bf', String(bf), '-x264-params', 'b-adapt=0:scenecut=0',
    '-vf', tags ? 'setsar=1,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv' : 'setsar=1', ...(tags ? ['-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv'] : []),
    '-video_track_timescale', timescale, '-use_editlist', bf ? '1' : '0', path]);
  return path;
}
function exactArgs(input, output, requests = [{ ordinal: 0 }]) { return ['exact-frames', '--input', input, '--sha256', id(input).sha256, '--requests', JSON.stringify(requests), '--output', output]; }
function compArgs(base, inset, output, changes = {}) {
  const o = { base, 'base-sha256': id(base).sha256, inset, 'inset-sha256': id(inset).sha256, output, start: 2, end: 6, 'inset-start': 1, rect: '8,4,56,44', fit: 'contain', 'border-colour': '25,90,180', 'border-width': 2, ...changes };
  return ['composite', ...Object.entries(o).flatMap(([k, v]) => [`--${k}`, String(v)])];
}
function success(args, program = entry, extra = {}) { const r = run(process.execPath, [program, ...args], extra); assert.equal(r.status, 0, r.stderr); assert.equal(r.stderr, ''); return JSON.parse(r.stdout); }
function refuse(d, args, pattern, program = entry, extra = {}) {
  const before = readdirSync(d).sort(), r = run(process.execPath, [program, ...args], extra);
  assert.equal(r.status, 1, r.stderr); assert.equal(r.stdout, ''); assert.match(r.stderr, pattern); assert.deepEqual(readdirSync(d).sort(), before); return r;
}
function replaceFlag(args, flag, value) { const a = [...args]; a[a.indexOf(flag) + 1] = value; return a; }
function complete(result, name) {
  const c = json(result.completion); assert.equal(c.complete, true);
  for (const [file, expected] of Object.entries(c.files)) assert.deepEqual(id(join(result.output, file)), expected);
  assert.deepEqual(readdirSync(result.output).sort(), Object.keys(c.files).concat('complete.json').sort());
  assert.equal(json(join(result.output, name)).tool_version, '0.4.0');
}
const rgbFilter = 'scale=iw:ih:flags=bilinear+accurate_rnd:in_color_matrix=bt709:out_color_matrix=bt709:in_range=tv:out_range=pc,format=rgb24';
const rawRGB = p => ff(['-noautorotate', '-i', p, '-map', '0:v:0', '-an', '-vf', rgbFilter, '-fps_mode', 'passthrough', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], true);
const rawYUV = p => ff(['-noautorotate', '-i', p, '-map', '0:v:0', '-an', '-fps_mode', 'passthrough', '-pix_fmt', 'yuv420p', '-f', 'rawvideo', '-'], true);
function reduced(n, d) {
  let a = n < 0n ? -n : n, b = d;
  while (b) [a, b] = [b, a % b];
  return `${n / a}/${d / a}`;
}
function exactOracle(input, result, requests) {
  const m = json(result.manifest), info = probe(input), s = info.streams.find(s => s.codec_type === 'video'), frames = info.frames.filter(f => f.media_type === 'video');
  const pixels = rawRGB(input), size = s.width * s.height * 3, [tp, tq] = s.time_base.split('/').map(BigInt);
  assert.deepEqual(m.source.before, id(input)); assert.deepEqual(m.source.after, id(input)); assert.equal(m.source.expected_sha256, id(input).sha256);
  assert.equal(m.video.decoded_frame_count, frames.length); assert.equal(m.video.first_displayed_pts, String(frames[0].pts)); assert.equal(m.video.time_base, s.time_base);
  assert.equal(m.requests.length, requests.length);
  requests.forEach((request, index) => {
    const row = m.requests[index], [l, t, r, b] = request.crop ?? [0, 0, s.width, s.height], image = join(result.output, row.image.path);
    assert.equal(row.request_index, index); assert.equal(row.requested_ordinal, request.ordinal); assert.equal(row.actual_ordinal, request.ordinal); assert.equal(row.pts, String(frames[request.ordinal].pts));
    assert.equal(row.presentation_time, reduced((BigInt(frames[request.ordinal].pts) - BigInt(frames[0].pts)) * tp, tq), `presentation_time request ${index}`);
    assert.deepEqual(row.requested_crop, request.crop ?? null); assert.deepEqual(row.applied_crop, [l, t, r, b]); assert.deepEqual(id(image), { sha256: row.image.sha256, bytes: row.image.bytes });
    const expected = Buffer.concat(Array.from({ length: b - t }, (_, y) => pixels.subarray(request.ordinal * size + ((t + y) * s.width + l) * 3, request.ordinal * size + ((t + y) * s.width + r) * 3)));
    const actual = ff(['-i', image, '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], true);
    assert.deepEqual(actual, expected, `decoded ordinal/crop request ${index}`);
    assert.equal(row.image.width, r - l); assert.equal(row.image.height, b - t);
  }); complete(result, 'manifest.json');
}
test('exact ordinals: 0, interior, last, unsorted, repeated/full/crop, odd and exclusive crop edges', () => temp(d => {
  const input = fixture(d, 'numbered'), requests = [{ ordinal: 7 }, { ordinal: 0 }, { ordinal: 3, crop: [1, 1, 64, 48] }, { ordinal: 3 }, { ordinal: 3, crop: [1, 1, 64, 48] }, { ordinal: 0, crop: [63, 47, 64, 48] }];
  const r = success(exactArgs(input, join(d, 'exact'), requests)); exactOracle(input, r, requests);
  assert.equal(r.frames, 5); assert.equal(r.requests[2].image.path, r.requests[4].image.path); assert.notEqual(r.requests[2].image.path, r.requests[3].image.path);
  mkdirSync(join(d, 'stale')); writeFileSync(join(d, 'stale', 'frame_9999.png'), 'old image');
  refuse(d, exactArgs(input, join(d, 'stale'), requests), /already exists/); assert.equal(readFileSync(join(d, 'stale', 'frame_9999.png'), 'utf8'), 'old image');
}));
test('exact B-frame presentation order and nonzero timestamp origin', () => temp(d => {
  const input = fixture(d, 'bframes', { bf: 2, count: 12 }), info = probe(input); assert.ok(info.frames.some(f => f.pict_type === 'B'));
  assert.equal(mp4Structure(input).editList, true, 'exercise the edit-listed vendor file itself');
  const requests = [{ ordinal: 11 }, { ordinal: 0 }, { ordinal: 1 }, { ordinal: 2 }, { ordinal: 5 }];
  exactOracle(input, success(exactArgs(input, join(d, 'edit-listed'), requests)), requests);
  // Disable default MOV edit-list handling on all input probes and decodes.
  // Publication must still succeed, so only the external presentation oracle fails.
  const ignored = mutant(d, 'ignore-edit-list', 'evidence-media.js', s => s.replace("'-use_absolute_path', '0'", "'-use_absolute_path', '0', '-ignore_editlist', '1'"));
  const wrong = success(exactArgs(input, join(d, 'ignored-edit-list'), requests), ignored);
  assert.throws(() => exactOracle(input, wrong, requests), assert.AssertionError);
  const shifted = join(d, 'shifted.mp4'); ff(['-i', input, '-c', 'copy', '-bsf:v', 'setts=pts=PTS+2/TB:dts=DTS+2/TB', '-use_editlist', '0', shifted]);
  exactOracle(shifted, success(exactArgs(shifted, join(d, 'out'), requests)), requests);
  assert.ok(Number(probe(shifted).frames[0].pts) > 0);
}));
test('exact malformed, oversized, out-of-range requests and source identity refuse without writes', () => temp(d => {
  const input = fixture(d, 'input'), a = exactArgs(input, join(d, 'out'));
  for (const request of ['[]', '{}', '[', '[{"ordinal":0,"ordinal":1}]', '[{"ordinal":0,"extra":true}]', '[{"ordinal":"0"}]', '[{"ordinal":0.5}]', '[{"ordinal":-1}]', '[{"ordinal":8}]', '[{"ordinal":9007199254740992}]', '[{"ordinal":0,"crop":null}]', '[{"ordinal":0,"crop":[0,0,65,48]}]', '[{"ordinal":0,"crop":[0,0,1.5,1]}]', '[{"ordinal":0,"crop":[2,0,1,1]}]', JSON.stringify(Array(61).fill({ ordinal: 0 })), ' '.repeat(16385)]) {
    refuse(d, replaceFlag(a, '--requests', request), /Error:/);
  }
  refuse(d, replaceFlag(a, '--sha256', '0'.repeat(64)), /SHA-256/);
  for (const extra of [['--fps', '1'], ['--requests', '[]'], ['--bogus', '1'], ['--install']]) refuse(d, [...a, ...extra], /option|twice/);
}));
function compositeOracle(base, inset, result, { start = 2, end = 6, insetStart = 1, rect = [8, 4, 56, 44], border = 2, colour = [25, 90, 180] } = {}) {
  const b = probe(base).streams[0], i = probe(inset).streams[0], record = json(result.receipt);
  // Test's fit oracle enumerates all possible even sizes at the original ratio,
  // independently of the implementation's reduced-aspect multiplier arithmetic.
  let fw = 0, fh = 0;
  for (let w = 2; w <= rect[2] - rect[0] - 2 * border; w += 2) for (let h = 2; h <= rect[3] - rect[1] - 2 * border; h += 2) if (w * i.height === h * i.width && w > fw) { fw = w; fh = h; }
  const x = rect[0] + border + Math.floor((rect[2] - rect[0] - 2 * border - fw) / 4) * 2, y = rect[1] + border + Math.floor((rect[3] - rect[1] - 2 * border - fh) / 4) * 2;
  assert.deepEqual(record.geometry.fitted, [x, y, x + fw, y + fh]); assert.deepEqual(record.mapping.active_interval, [start, end]); assert.equal(record.mapping.inset_start, insetStart);
  const scaled = ff(['-i', inset, '-an', '-vf', `scale=${fw}:${fh}:flags=lanczos:in_color_matrix=bt709:out_color_matrix=bt709:in_range=tv:out_range=tv`, '-fps_mode', 'passthrough', '-pix_fmt', 'yuv420p', '-f', 'rawvideo', '-'], true);
  const src = rawYUV(base), out = rawYUV(result.segment), size = b.width * b.height * 3 / 2, ss = fw * fh * 3 / 2;
  assert.equal(out.length, src.length); assert.deepEqual(record.inputs.base.before, id(base)); assert.deepEqual(record.inputs.base.after, id(base));
  assert.deepEqual(record.inputs.inset.before, id(inset)); assert.deepEqual(record.inputs.inset.after, id(inset));
  for (let n = 0; n < src.length / size; n++) {
    if (n < start || n >= end) { assert.deepEqual(out.subarray(n * size, (n + 1) * size), src.subarray(n * size, (n + 1) * size), `outside interval ${n}`); continue; }
    for (let plane = 0; plane < 3; plane++) {
      const f = plane ? 2 : 1, w = b.width / f, h = b.height / f, offset = plane === 0 ? 0 : plane === 1 ? b.width * b.height : b.width * b.height * 5 / 4, so = plane === 0 ? 0 : plane === 1 ? fw * fh : fw * fh * 5 / 4;
      for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
        const active = px * f >= rect[0] && px * f < rect[2] && py * f >= rect[1] && py * f < rect[3], fit = px * f >= x && px * f < x + fw && py * f >= y && py * f < y + fh;
        const at = n * size + offset + py * w + px;
        const expected = !active ? src[at] : !fit ? colour[plane] : scaled[(insetStart + n - start) * ss + so + (py - y / f) * (fw / f) + px - x / f];
        assert.equal(out[at], expected, `sample ${n}/${plane}/${px}/${py}`);
      }
    }
  }
  assert.deepEqual(id(base), record.inputs.base.before); complete(result, 'receipt.json');
}
test('composite: moving nonuniform sources, insertion/removal, inset start, fit bars and border', () => temp(d => {
  const base = fixture(d, 'base'), inset = fixture(d, 'inset', { width: 32, height: 24, seed: 91 }), original = id(base), result = success(compArgs(base, inset, join(d, 'out')));
  compositeOracle(base, inset, result); assert.deepEqual(id(base), original);
  const requests = [{ ordinal: 1 }, { ordinal: 2 }, { ordinal: 5, crop: [8, 4, 56, 44] }, { ordinal: 6 }];
  exactOracle(result.segment, success(exactArgs(result.segment, join(d, 'evidence'), requests)), requests);
  assert.equal(success(compArgs(base, inset, join(d, 'repeat'))).sha256, result.sha256);
}));
for (const [start, end] of [[0, 1], [7, 8], [0, 8], [3, 4]]) test(`composite legal interval [${start},${end}) with no border and full-frame footprint`, () => temp(d => {
  const base = fixture(d, 'base'), inset = fixture(d, 'inset', { seed: 99 }), opts = { start, end, 'inset-start': 0, rect: '0,0,64,48', 'border-width': 0 };
  const r = success(compArgs(base, inset, join(d, 'out'), opts)); compositeOracle(base, inset, r, { start, end, insetStart: 0, rect: [0, 0, 64, 48], border: 0 });
}));
test('composite fractional grid preserves base time base and fits a portrait inset with horizontal bars', () => temp(d => {
  const base = fixture(d, 'base', { rate: '30000/1001', timescale: '30000' }), inset = fixture(d, 'inset', { width: 24, height: 48, seed: 99, rate: '30000/1001', timescale: '30000' });
  const r = success(compArgs(base, inset, join(d, 'out'))); compositeOracle(base, inset, r); assert.equal(probe(r.segment).streams[0].time_base, '1/30000');
}));
test('composite refuses audio, short inset, mismatched clocks/rates, geometry, unknown colour and hashes', () => temp(d => {
  const base = fixture(d, 'base'), inset = fixture(d, 'inset'), a = changes => compArgs(base, inset, join(d, 'out'), changes);
  for (const changes of [{ start: -1 }, { start: 2.5 }, { start: 2, end: 2 }, { end: 9 }, { 'inset-start': 7 }, { rect: '1,2,30,30' }, { rect: '0,0,66,48' }, { rect: '8,4,4,8' }, { rect: '0,0,2,2', 'border-width': 2 }, { 'border-width': 1 }, { fit: 'cover' }, { 'border-colour': '0,128,128' }, { 'base-sha256': '0'.repeat(64) }]) refuse(d, a(changes), /Error:/);
  for (const [name, options, pattern] of [['audio', { audio: true }, /refuses audio/], ['short', { count: 2 }, /inset too short/], ['rate', { rate: '25/1', timescale: '30' }, /constant grid|rates|clock/], ['colour', { tags: false }, /unresolved/]]) {
    const other = fixture(d, name, options); refuse(d, a({ inset: other, 'inset-sha256': id(other).sha256 }), pattern);
  }
  const av = fixture(d, 'avbase', { audio: true }); refuse(d, a({ base: av, 'base-sha256': id(av).sha256 }), /refuses audio/);
}));
function mutant(d, name, file, change) {
  const copy = join(d, name); mkdirSync(copy); cpSync(join(tool, 'scripts'), join(copy, 'scripts'), { recursive: true }); writeFileSync(join(copy, 'package.json'), '{"type":"module"}');
  const p = join(copy, 'scripts', file), original = readFileSync(p, 'utf8'), updated = change(original); assert.notEqual(updated, original, name); writeFileSync(p, updated); return join(copy, 'scripts/edit.js');
}
test('planted off-by-one extraction and one-pixel crop shift are rejected by independent decode', () => temp(d => {
  const input = fixture(d, 'input'), a = exactArgs(input, join(d, 'out'), [{ ordinal: 3, crop: [2, 2, 40, 30] }]);
  for (const [name, change] of [
    ['ordinal', s => s.replace('select=eq(n\\\\,${r.ordinal})', 'select=eq(n\\\\,${r.ordinal + 1})')],
    ['crop', s => s.replace('${applied[0]}:${applied[1]}:exact=1', '${applied[0] + 1}:${applied[1]}:exact=1')]
  ]) refuse(d, a, /ordinal\/crop pixel/, mutant(d, name, 'exact-frames.js', change));
}));
test('planted wrong source identity, ordinal or sub-tolerance rational time fails the manifest oracle', () => temp(d => {
  const input = fixture(d, 'input'), requests = [{ ordinal: 3 }];
  for (const [name, change] of [['hash', s => s.replace('expected_sha256: o.sha256, before, after', 'expected_sha256: o.sha256, before: {...before, sha256:"0".repeat(64)}, after')], ['row', s => s.replace('actual_ordinal: frame.ordinal', 'actual_ordinal: frame.ordinal + 1')],
    // Ordinal 3 is exactly 1/10; this reduced fraction is only 1e-13 later.
    ['time', s => s.replace('presentation_time: frame.time', "presentation_time: '1000000000001/10000000000000'")]]) {
    const p = mutant(d, name, 'exact-frames.js', change), r = success(exactArgs(input, join(d, `out-${name}`), requests), p);
    assert.throws(() => exactOracle(input, r, requests), name === 'time' ? { code: 'ERR_ASSERTION', message: /presentation_time request 0/ } : assert.AssertionError);
  }
  const p = mutant(d, 'unchecked-hash', 'evidence-media.js', s => s.replace('if (id.sha256 !== expected)', 'if (false)'));
  assert.throws(() => refuse(d, replaceFlag(exactArgs(input, join(d, 'unchecked')), '--sha256', '0'.repeat(64)), /SHA-256/, p), assert.AssertionError);
}));
test('planted activation, inset mapping, one-pixel/chroma spill and lossy encode fail readback', () => temp(d => {
  const base = fixture(d, 'base'), inset = fixture(d, 'inset', { seed: 94 });
  for (const [name, change] of [
    ['activation', s => s.replace('n >= start && n < end ? paint', 'n > start && n < end ? paint')],
    ['mapping', s => s.replace('readFrame(inf, insetSize, insetStart + n - start), b.width', 'readFrame(inf, insetSize, insetStart + n - start + 1), b.width')],
    ['pixel-spill', s => s.replace('return base;', 'base[0] ^= 1; return base;')],
    ['chroma-spill', s => s.replace('return base;', 'base[width * height] ^= 1; return base;')],
    ['lossy', s => s.replace("'-crf', '0'", "'-crf', '18'")]
  ]) { const p = mutant(d, name, 'composite.js', change); refuse(d, compArgs(base, inset, join(d, 'out')), /equality/, p); }
}));
test('short-inset and audio refusal assertions fail when their guards are planted away', () => temp(d => {
  const base = fixture(d, 'base'), short = fixture(d, 'short', { count: 2 }), audio = fixture(d, 'audio', { audio: true });
  const output = join(d, 'out'), a = compArgs(base, short, output), check = r => {
    assert.equal(r.status, 1, r.stderr); assert.equal(r.stdout, '');
    assert.match(r.stderr, /Error: video evidence: active interval outside base or inset too short;/);
    assert.ok(!existsSync(join(output, 'complete.json')));
  };
  check(run(process.execPath, [entry, ...a]));
  const p = mutant(d, 'no-length-guard', 'composite.js', s => s.replace('if (end > b.count || insetStart + end - start > i.count)', 'if (false)'));
  const unguarded = run(process.execPath, [p, ...a]);
  assert.equal(unguarded.status, 1); assert.match(unguarded.stderr, /short decoded frame/);
  assert.ok(!existsSync(join(output, 'complete.json')));
  assert.throws(() => check(unguarded), { code: 'ERR_ASSERTION', operator: 'match' });
  const q = mutant(d, 'no-audio-guard', 'evidence-media.js', s => s.replace('silent && streams.length !== 1', 'false'));
  assert.throws(() => refuse(d, compArgs(base, audio, join(d, 'audio-out')), /refuses audio/, q), assert.AssertionError);
}));
test('path screens, aliases, incomplete destination and forced local demuxer retain inputs', () => temp(d => {
  const input = fixture(d, 'input'), inset = fixture(d, 'inset'), output = join(d, 'out'), a = exactArgs(input, output);
  for (const p of ['relative.mp4', join(d, 'memory', 'private.mp4'), join(d, '.env'), join(d, 'credentials.json')]) refuse(d, replaceFlag(a, '--input', p), /absolute|protected/);
  const toolLink = join(d, 'tool-link'); symlinkSync(tool, toolLink); refuse(d, replaceFlag(a, '--output', join(toolLink, 'forbidden')), /inside this tool/);
  const protectedLink = join(d, 'protected.mp4'); symlinkSync(join(d, 'memory'), protectedLink); refuse(d, replaceFlag(a, '--input', protectedLink), /canonicalized/);
  const hard = join(d, 'hard.mp4'); linkSync(input, hard); refuse(d, a, /one link/); rmSync(hard);
  refuse(d, replaceFlag(a, '--output', input), /already exists/); refuse(d, compArgs(input, input, output), /distinct/);
  const old = join(d, 'old'); mkdirSync(old); writeFileSync(join(old, 'receipt.json'), '{}'); refuse(d, replaceFlag(a, '--output', old), /already exists/);
  const bad = join(d, 'playlist.mp4'); writeFileSync(bad, '#EXTM3U\n#EXTINF:1\nhttps://invalid.example/never.ts\n'); refuse(d, exactArgs(bad, output), /ffprobe/);
  const rotated = join(d, 'rotated.mp4'); ff(['-display_rotation:v:0', '90', '-i', input, '-c', 'copy', rotated]); refuse(d, exactArgs(rotated, output), /rotation|matrix/);
  refuse(d, compArgs(input, inset, output, { inset: rotated, 'inset-sha256': id(rotated).sha256 }), /rotation|matrix/);
}));
function actual(bin) { const r = run('/usr/bin/which', [bin]); assert.equal(r.status, 0); return r.stdout.trim(); }
function wrapper(d, name, source) {
  const bin = join(d, name); mkdirSync(bin); writeFileSync(join(bin, 'ffmpeg'), `#!${process.execPath}\n${source}`, { mode: 0o755 }); return { env: { ...process.env, PATH: bin + ':' + process.env.PATH } };
}
test('help/import/closed flags precede dependencies; new ffprobe and encoder checks are scoped', () => temp(d => {
  const input = fixture(d, 'input'), inset = fixture(d, 'inset'), a = exactArgs(input, join(d, 'out')), c = compArgs(input, inset, join(d, 'out'));
  const empty = { env: { ...process.env, PATH: '/no-dependencies' } };
  for (const command of ['help', 'exact-frames', 'composite']) { const r = run(process.execPath, [entry, command, ...(command === 'help' ? [] : ['--help'])], empty); assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /Exact decoded frames/); assert.equal(r.stderr, ''); }
  const imported = run(process.execPath, ['--input-type=module', '-e', `import ${JSON.stringify(new URL('../scripts/edit.js', import.meta.url).href)}`], empty); assert.equal(imported.status, 0); assert.equal(imported.stdout, '');
  for (const args of [a, c]) { refuse(d, [...args, '--fps', '30'], /option/, entry, empty); refuse(d, [...args, '--output', 'relative'], /twice/, entry, empty); refuse(d, args, /missing ffmpeg/, entry, empty); }
  const ffmpeg = actual('ffmpeg'), env = wrapper(d, 'bin', `const r=require('node:child_process').spawnSync(${JSON.stringify(ffmpeg)},process.argv.slice(2),{stdio:'inherit'});process.exit(r.status??1);`);
  writeFileSync(join(d, 'bin', 'ffprobe'), `#!${process.execPath}\nprocess.exit(98);`, { mode: 0o755 });
  for (const args of [a, c]) refuse(d, args, /missing ffprobe/, entry, env);
  success(['frames', '--input', input, '--output', join(d, 'old-sampling'), '--fps', '2'], entry, env);
  rmSync(join(d, 'bin', 'ffprobe'));
  const blocked = wrapper(d, 'no-encoders', `const a=process.argv.slice(2);if(a.includes('-encoders')){process.stdout.write('empty\\n');process.exit(0)}if(a.includes('-version'))process.exit(0);throw Error('media must not run');`);
  refuse(d, a, /missing png/, entry, blocked); refuse(d, c, /missing libx264/, entry, blocked);
}));
test('missing filter refuses after successful encoder probes; removing the filter loop publishes', () => temp(d => {
  const base = fixture(d, 'base'), inset = fixture(d, 'inset'), ffmpeg = actual('ffmpeg');
  // All required filters except scale are advertised. Real encoders and media
  // calls still work, so bypassing only the filter loop must publish a bundle.
  const env = wrapper(d, 'no-scale', `const a=process.argv.slice(2);if(a.includes('-filters')){process.stdout.write(' ... format filter\\n ... select filter\\n ... crop filter\\n ... setsar filter\\n ... setparams filter\\n');process.exit(0)}const r=require('node:child_process').spawnSync(${JSON.stringify(ffmpeg)},a,{stdio:'inherit'});process.exit(r.status??1);`);
  const p = mutant(d, 'no-filter-loop', 'evidence-media.js', s => s.replace("for (const name of composite ? ['scale', 'setsar', 'setparams'] : ['scale', 'format', 'select', 'crop'])", 'for (const name of [])'));
  const check = r => { assert.equal(r.status, 1, r.stderr); assert.equal(r.stdout, ''); assert.match(r.stderr, /missing scale filter/); };
  for (const command of ['exact-frames', 'composite']) {
    const output = join(d, command), a = command === 'composite' ? compArgs(base, inset, output) : exactArgs(base, output);
    check(refuse(d, a, /missing scale filter/, entry, env)); assert.ok(!existsSync(join(output, 'complete.json')));
    const unguarded = run(process.execPath, [p, ...a], env); assert.equal(unguarded.status, 0, unguarded.stderr); assert.equal(unguarded.stderr, '');
    complete(JSON.parse(unguarded.stdout), command === 'composite' ? 'receipt.json' : 'manifest.json');
    assert.throws(() => check(unguarded), { code: 'ERR_ASSERTION', operator: 'strictEqual' });
  }
}));
test('missing/non-increasing PTS are refused before staging using a local probe stand-in', () => temp(d => {
  const input = fixture(d, 'input'), ffprobe = actual('ffprobe'), bin = join(d, 'probe'); mkdirSync(bin);
  for (const mutate of ['delete v.frames[0].pts;', 'v.frames[1].pts=v.frames[0].pts;v.frames[1].best_effort_timestamp=v.frames[0].pts;']) {
    writeFileSync(join(bin, 'ffprobe'), `#!${process.execPath}\nconst a=process.argv.slice(2),r=require('node:child_process').spawnSync(${JSON.stringify(ffprobe)},a,{encoding:'utf8'});if(a.includes('-show_frames')){const v=JSON.parse(r.stdout);${mutate}process.stdout.write(JSON.stringify(v));}else process.stdout.write(r.stdout);process.exit(r.status??1);`, { mode: 0o755 });
    refuse(d, exactArgs(input, join(d, 'out')), /timestamp/, entry, { env: { ...process.env, PATH: bin + ':' + process.env.PATH } });
  }
}));
test('late empty-directory collisions are never replaced; reservation kills remain incomplete', () => temp(d => {
  const base = fixture(d, 'base'), inset = fixture(d, 'inset');
  for (const command of ['exact-frames', 'composite']) {
    const output = join(d, `${command}-collision`), args = command === 'composite' ? compArgs(base, inset, output) : exactArgs(base, output);
    const p = mutant(d, `${command}-late`, 'evidence-media.js', s => s.replace('screen(output, true);\n  // Exclusively', 'screen(output, true); mkdirSync(output);\n  // Exclusively'));
    const r = run(process.execPath, [p, ...args]); assert.equal(r.status, 1); assert.equal(r.stdout, ''); assert.match(r.stderr, /destination collision/); assert.deepEqual(readdirSync(output), []);
    assert.ok(!readdirSync(d).some(x => x.startsWith('.wiser-video-')));
    const killed = join(d, `${command}-reserved`), fresh = replaceFlag(args, '--output', killed);
    const q = mutant(d, `${command}-reserved-kill`, 'evidence-media.js', s => s.replace('const reservation = statSync(output);', "process.kill(process.pid, 'SIGKILL'); const reservation = statSync(output);"));
    const k = run(process.execPath, [q, ...fresh]); assert.equal(k.signal, 'SIGKILL'); assert.equal(k.stdout, ''); assert.deepEqual(readdirSync(killed), []);
    refuse(d, fresh, /already exists/);
    const prefix = command === 'composite' ? '.wiser-video-composite-' : '.wiser-video-exact-';
    for (const name of readdirSync(d).filter(x => x.startsWith(prefix))) {
      const abandoned = join(d, name), before = readdirSync(abandoned).sort();
      success(replaceFlag(fresh, '--output', join(d, `${command}-fresh`))); assert.deepEqual(readdirSync(abandoned).sort(), before);
      // Keep the next command's assertion scoped to its own staging population.
      rmSync(abandoned, { recursive: true });
    }
  }
}));
test('changed input and forced interruption: no publication, only named staging, abandoned staging retained', () => temp(d => {
  const ffmpeg = actual('ffmpeg');
  for (const command of ['exact-frames', 'composite']) {
    const base = fixture(d, `${command}-base`), inset = fixture(d, `${command}-inset`), output = join(d, `${command}-out`), a = command === 'composite' ? compArgs(base, inset, output) : exactArgs(base, output);
    const env = wrapper(d, `${command}-change`, `const a=process.argv.slice(2),r=require('node:child_process').spawnSync(${JSON.stringify(ffmpeg)},a,{stdio:'inherit'});if(r.status===0&&(a.at(-1).endsWith('.png')||a.at(-1).endsWith('/segment.mp4')))require('node:fs').appendFileSync(${JSON.stringify(base)},'changed');process.exit(r.status??1);`);
    refuse(d, a, /identity changed/, entry, env);
    // Interruption uses a new valid fixture; the mutation case retains its
    // deliberately damaged source, which must not be reused as valid media.
    const killBase = fixture(d, `${command}-killbase`);
    const fresh = command === 'composite' ? compArgs(killBase, inset, output) : exactArgs(killBase, output);
    const killed = wrapper(d, `${command}-kill`, `const a=process.argv.slice(2);if(a.at(-1).endsWith('.png')||a.at(-1).endsWith('/segment.mp4')){process.kill(process.ppid,'SIGKILL');process.exit(1)}const r=require('node:child_process').spawnSync(${JSON.stringify(ffmpeg)},a,{stdio:'inherit'});process.exit(r.status??1);`);
    const r = run(process.execPath, [entry, ...fresh], killed); assert.equal(r.signal, 'SIGKILL'); assert.equal(r.stdout, ''); assert.ok(!existsSync(output));
    const prefix = command === 'composite' ? '.wiser-video-composite-' : '.wiser-video-exact-', stages = readdirSync(d).filter(x => x.startsWith(prefix)); assert.equal(stages.length, 1);
    const abandoned = join(d, stages[0]), files = readdirSync(abandoned).sort(); assert.ok(!files.includes('complete.json')); assert.ok(files.some(x => /\.(rgb|yuv)$/.test(x)));
    success(fresh); assert.deepEqual(readdirSync(abandoned).sort(), files);
  }
}));
test('conform -> exact-frames -> composite with conformed inset -> unchanged mux/loudness/finish', () => temp(d => {
  const reference = join(d, 'padded.wav'), raw = join(d, 'noise.s16le'), samples = Buffer.alloc(48000 * 2); let state = 31;
  for (let n = 0; n < 48000; n++) { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; samples.writeInt16LE((state >>> 17) - 16384, n * 2); }
  writeFileSync(raw, samples); ff(['-f', 's16le', '-ar', '48000', '-ac', '1', '-i', raw, reference]);
  const picture = fixture(d, 'picture', { count: 30 }), vendor = join(d, 'vendor.mp4'); ff(['-i', picture, '-i', reference, '-map', '0:v', '-map', '1:a', '-c', 'copy', '-use_editlist', '0', vendor]);
  const receipt = join(d, 'upload.json'); writeFileSync(receipt, JSON.stringify({ schema: 'speech-upload', version: 1, padded: { file: 'padded.wav', identity: id(reference), rate: 48000, channels: 1, sample_count: 48000 }, mapping: { source_zero_at_upload_sample: 0 }, source: { before: id(reference) }, readback: { sample_count: 48000, delay: { residual_decoded_displacement_samples: 0 } } }));
  const opts = { input: vendor, sha256: id(vendor).sha256, reference, 'reference-sha256': id(reference).sha256, 'upload-receipt': receipt, 'upload-receipt-sha256': id(receipt).sha256, output: join(d, 'conformed'), frames: 30, rate: '30/1', width: 64, height: 48, origin: 0, 'correlation-floor': '0.99', 'max-offset': 0, 'drift-tolerance': 0, window: '0.5', 'max-hold-start': 0, 'max-hold-end': 0, 'source-colour': 'bt709-tv' };
  const c = success(['conform', ...Object.entries(opts).flatMap(([k, v]) => [`--${k}`, String(v)])]);
  const requests = [{ ordinal: 29 }, { ordinal: 0 }, { ordinal: 15 }, { ordinal: 15, crop: [4, 8, 60, 48] }]; exactOracle(c.segment, success(exactArgs(c.segment, join(d, 'conform-evidence'), requests)), requests);
  const expected = Buffer.alloc(33 * 1600 * 2); samples.copy(expected, 591 * 2);
  const placement = result => {
    const decoded = ff(['-i', result.output, '-map', '0:a:0', '-c:a', 'pcm_s16le', '-f', 's16le', '-'], true);
    assert.deepEqual(decoded, expected, 'decoded narration: 591 silent samples, all 48000 source samples, then silence');
    assert.equal(result.audioStartSample, 591); assert.equal(result.firstFrameSample, 0); assert.equal(result.frames, 33);
    assert.equal(result.narrationSamples, 48000); assert.equal(result.samples, 52800);
  };
  const noDelay = mutant(d, 'no-placement-delay', 'finish.js', s => s.replace('if (shift > 0) filters.push(`adelay=${shift}S:all=1`);', ''));
  for (const timescale of ['30', '15360']) {
    const base = fixture(d, `base-${timescale}`, { count: 33, timescale }), composite = success(compArgs(base, c.segment, join(d, `composite-${timescale}`), { start: 1, end: 31, 'inset-start': 0 }));
    assert.equal(probe(composite.segment).streams[0].time_base, `1/${timescale}`);
    compositeOracle(base, c.segment, composite, { start: 1, end: 31, insetStart: 0 }); exactOracle(composite.segment, success(exactArgs(composite.segment, join(d, `composite-evidence-${timescale}`), requests)), requests);
    const a = ['mux', '--input', composite.segment, '--audio', reference, '--audio-start', '0.0123', '--output', join(d, `mux-${timescale}.mp4`)];
    const mux = success(a); placement(mux); assert.equal(probe(mux.output).streams.find(s => s.codec_type === 'video').time_base, `1/${timescale}`);
    const unplaced = success(replaceFlag(a, '--output', join(d, `unplaced-${timescale}.mp4`)), noDelay);
    assert.throws(() => placement(unplaced), { code: 'ERR_ASSERTION', operator: 'deepStrictEqual' });
    for (const command of ['loudness', 'finish']) { const r = success([command, '--input', mux.output, '--output', join(d, `${command}-${timescale}.mp4`), '--target', '-24', '--true-peak', '-1']); assert.ok(r.after.truePeak <= -1); }
  }
}));


test('composite shares exact 30fps presentation times across 1/15360 and 1/30 time bases; old check fails', () => temp(d => {
  const base = fixture(d, 'base', { timescale: '15360' }), inset = fixture(d, 'inset', { width: 32, height: 24, timescale: '30', seed: 91 });
  const check = program => { const r = success(compArgs(base, inset, join(d, program === entry ? 'out' : 'old-out')), program); compositeOracle(base, inset, r); return r; };
  const r = check(entry); assert.equal(probe(base).streams[0].time_base, '1/15360'); assert.equal(probe(inset).streams[0].time_base, '1/30'); assert.equal(probe(r.segment).streams[0].time_base, '1/15360');
  const old = mutant(d, 'time-base-string', 'composite.js', s => s.replace('if (cmp(rate, insetRate))', 'if (cmp(rate, insetRate) || cmp(b.tb, i.tb))'));
  assert.throws(() => check(old), assert.AssertionError);
}));
test('composite refuses a one-tick off-grid frame; removing the per-frame grid guard fails the assertion', () => temp(d => {
  const base = fixture(d, 'base', { timescale: '15360' }), inset = fixture(d, 'inset', { timescale: '3000' }), offGrid = join(d, 'off-grid.mp4');
  ff(['-i', inset, '-map', '0:v', '-c', 'copy', '-bsf:v', 'setts=pts=PTS+if(eq(N\\,3)\\,1\\,0)', '-video_track_timescale', '3000', '-use_editlist', '0', offGrid]);
  const info = probe(offGrid), frames = info.frames.filter(f => f.media_type === 'video');
  assert.equal(info.streams[0].r_frame_rate, '30/1'); assert.equal(frames[3].pts, 301);
  const a = compArgs(base, offGrid, join(d, 'out')); refuse(d, a, /exact constant grid/);
  const bypass = mutant(d, 'no-frame-grid', 'evidence-media.js', s => s.replace("cmp(r.seconds, rat(BigInt(r.ordinal) * rate.d, rate.n)) || r.duration === undefined || pts(r.duration) * info.tb.n * rate.n !== rate.d * info.tb.d", 'false'));
  assert.throws(() => refuse(d, a, /exact constant grid/, bypass), assert.AssertionError);
  const output = join(d, 'out'); assert.ok(existsSync(join(output, 'complete.json')));
  compositeOracle(base, offGrid, { output, segment: join(output, 'segment.mp4'), receipt: join(output, 'receipt.json'), completion: join(output, 'complete.json') });
}));
