// Conform is independent of every existing command. Importing checks nothing.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, lstatSync, mkdtempSync, openSync, readFileSync, readSync, realpathSync, renameSync, rmSync, statSync, writeFileSync, writeSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { hash, mp4Structure } from './finish.js';
import { correlate } from './conform-clock.js';
import { rateFilter } from './loudness.js';

export const VERSION = '0.4.0';
export const CONFORM_HELP = `Conform (all flags required, each once):
  node scripts/edit.js conform --input <local.mp4> --sha256 <HEX>
    --reference <padded.wav> --reference-sha256 <HEX>
    --upload-receipt <receipt.json> --upload-receipt-sha256 <HEX>
    --output <new-directory> --frames <N> --rate <p/q> --width <even> --height <even>
    --origin <rational-seconds> --correlation-floor <0..1>
    --max-offset <seconds> --drift-tolerance <seconds> --window <seconds>
    --max-hold-start <frames> --max-hold-end <frames> --source-colour bt709-tv
  Silent lossless intermediate + receipt.json + complete.json, published together.
  Seconds accept exact decimals or integer fractions. Rate is a positive fraction.
  Analysis: 48 kHz, search +/-1 second; max-offset and drift-tolerance <= 1 second;
  window 0.25..60 seconds. See TOOL.md for evidence and resource bounds.
  --fps remains exclusive to sampled frames/gif; conform uses --rate.`;
const fail = message => { throw new Error(`Error: conform: ${message}; correct the input and retry to a fresh bundle. See node scripts/edit.js help.`); };
export const gcd = (a, b) => b ? gcd(b, a % b) : a;
export function rat(n, d = 1n) {
  if (d <= 0n) fail('invalid rational denominator');
  const g = gcd(n < 0n ? -n : n, d); return { n: n / g, d: d / g };
}
export const add = (a, b) => rat(a.n * b.d + b.n * a.d, a.d * b.d);
export const neg = a => rat(-a.n, a.d);
export const cmp = (a, b) => a.n * b.d < b.n * a.d ? -1 : a.n * b.d > b.n * a.d ? 1 : 0;
export const abs = a => rat(a.n < 0n ? -a.n : a.n, a.d);
export const text = a => `${a.n}/${a.d}`;
export function rational(raw, signed = false) {
  if (typeof raw !== 'string' || raw.length > 128 || !(signed ? /^-?(?:\d+(?:\.\d+)?|\d+\/[1-9]\d*)$/ : /^(?:\d+(?:\.\d+)?|\d+\/[1-9]\d*)$/).test(raw)) fail('seconds must be exact decimals or integer fractions');
  if (raw.includes('/')) { const [n, d] = raw.split('/').map(BigInt); return rat(n, d); }
  const negative = raw.startsWith('-'), [whole, part = ''] = raw.replace(/^-/, '').split('.'), d = 10n ** BigInt(part.length);
  return rat((negative ? -1n : 1n) * (BigInt(whole) * d + BigInt(part || '0')), d);
}
const int = (v, label, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  if (!/^\d+$/.test(String(v)) || !Number.isSafeInteger(Number(v)) || Number(v) < min || Number(v) > max) fail(`${label} must be an integer from ${min} to ${max}`);
  return Number(v);
};
const integerPTS = v => { if (!/^-?\d+$/.test(String(v)) || !Number.isSafeInteger(Number(v))) fail('missing or unsafe decoded PTS'); return BigInt(v); };
const identity = path => ({ bytes: statSync(path).size, sha256: hash(path) });
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const tool = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const protectedPath = path => path.split(sep).some(p => p.toLowerCase() === 'memory' || /^(?:\.env(?:\..*)?|auth-provider\.env|credentials\.json)$/i.test(p) || /\.env$/i.test(p));
function under(path, root) {
  const id = statSync(root);
  for (let p = path;; p = dirname(p)) {
    try { const s = statSync(p); if (s.dev === id.dev && s.ino === id.ino) return true; } catch {}
    if (p === dirname(p)) return false;
  }
}
export function screen(raw, output = false) {
  if (typeof raw !== 'string' || !isAbsolute(raw) || protectedPath(raw)) fail('path must be absolute and outside protected memory or credential paths');
  let path;
  try {
    // A new bundle's parent must exist. Never create ancestors during refusal.
    path = output ? join(realpathSync(dirname(raw)), basename(raw)) : realpathSync(raw);
    if (output) { try { lstatSync(path); fail('destination already exists (complete or incomplete)'); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
  } catch (e) { if (e.message.startsWith('Error: conform:')) throw e; fail('path cannot be canonicalized or parent does not exist'); }
  if (protectedPath(path) || output && under(path, tool)) fail('path resolves to a protected path or inside this tool directory');
  if (!output) { const s = statSync(path); if (!s.isFile() || s.nlink !== 1) fail('input must be a regular file with one link'); }
  return path;
}
// A small duplicate-key-aware JSON reader. Metadata is data, never executable.
export function strictJSON(raw) {
  let i = 0;
  const ws = () => { while (/\s/.test(raw[i] ?? '') && i < raw.length) i++; };
  function value() {
    ws(); const c = raw[i];
    if (c === '{') {
      i++; ws(); const keys = new Set(); if (raw[i] === '}') { i++; return; }
      for (;;) { ws(); const k = string(); if (keys.has(k)) fail('duplicate JSON key'); keys.add(k); ws(); if (raw[i++] !== ':') throw Error(); value(); ws(); const end = raw[i++]; if (end === '}') return; if (end !== ',') throw Error(); }
    }
    if (c === '[') { i++; ws(); if (raw[i] === ']') { i++; return; } for (;;) { value(); ws(); const end = raw[i++]; if (end === ']') return; if (end !== ',') throw Error(); } }
    if (c === '"') { string(); return; }
    const m = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(raw.slice(i)); if (!m) throw Error(); i += m[0].length;
  }
  function string() { const start = i; if (raw[i++] !== '"') throw Error(); while (i < raw.length) { if (raw[i++] === '\\') i++; else if (raw[i - 1] === '"') return JSON.parse(raw.slice(start, i)); } throw Error(); }
  try { value(); ws(); if (i !== raw.length) throw Error(); return JSON.parse(raw); } catch (e) { if (e.message.startsWith('Error: conform:')) throw e; fail('malformed JSON'); }
}
const flags = ['input', 'sha256', 'reference', 'reference-sha256', 'upload-receipt', 'upload-receipt-sha256', 'output', 'frames', 'rate', 'width', 'height', 'origin', 'correlation-floor', 'max-offset', 'drift-tolerance', 'window', 'max-hold-start', 'max-hold-end', 'source-colour'];
export function options(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i]; if (!flags.includes(name.slice(2)) || !name.startsWith('--')) fail(`unknown option ${name}`);
    if (name in o) fail(`${name} was given twice`);
    if (argv[i + 1] === undefined || argv[i + 1].startsWith('--')) fail(`${name} needs a value`);
    o[name] = argv[i + 1];
  }
  for (const name of flags) if (!(`--${name}` in o)) fail(`--${name} is required`);
  for (const key of ['--sha256', '--reference-sha256', '--upload-receipt-sha256']) {
    if (!/^[a-f\d]{64}$/i.test(o[key])) fail(`${key} must be 64 hexadecimal digits`); o[key] = o[key].toLowerCase();
  }
  const frames = int(o['--frames'], '--frames', 1, 100000), width = int(o['--width'], '--width', 2, 8192), height = int(o['--height'], '--height', 2, 8192);
  if (width % 2 || height % 2) fail('dimensions must be even for yuv420p');
  if (!/^[1-9]\d*\/[1-9]\d*$/.test(o['--rate'])) fail('--rate must be a positive integer fraction p/q');
  const rate = rational(o['--rate']); if (rate.n > 1000000n || rate.d > 1000000n || cmp(rate, rat(240n)) > 0 || cmp(rate, rat(1n)) < 0) fail('rate must be 1..240 fps with reduced terms <=1000000');
  const floor = rational(o['--correlation-floor']), offset = rational(o['--max-offset']), drift = rational(o['--drift-tolerance']), window = rational(o['--window']), origin = rational(o['--origin']);
  if (cmp(floor, rat(1n)) > 0 || cmp(floor, rat(0n)) <= 0) fail('correlation floor must be >0 and <=1');
  if (cmp(offset, rat(1n)) > 0 || cmp(drift, rat(1n)) > 0) fail('offset and drift tolerance must be <=1 second');
  if (cmp(window, rat(1n, 4n)) < 0 || cmp(window, rat(60n)) > 0) fail('window must be 0.25..60 seconds');
  if (o['--source-colour'] !== 'bt709-tv') fail('only explicit --source-colour bt709-tv is supported');
  return { o, frames, width, height, rate, floor, offset, drift, window, origin,
    holds: [int(o['--max-hold-start'], '--max-hold-start'), int(o['--max-hold-end'], '--max-hold-end')] };
}
const local = format => ['-protocol_whitelist', 'file,pipe', '-format_whitelist', format, '-f', format,
  ...(format === 'mov' ? ['-enable_drefs', '0', '-use_absolute_path', '0'] : [])];
export function run(binary, args) {
  const r = spawnSync(binary, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 128 * 1024 * 1024 });
  if (r.error || r.status !== 0 || r.stderr) fail(`${binary} could not complete the media check (decoder diagnostics withheld)`);
  return r.stdout;
}
const probe = (path, format, extra = []) => strictJSON(run('ffprobe', ['-v', 'error', ...local(format), ...extra, '-of', 'json', path]));
const ff = args => run('ffmpeg', ['-nostdin', '-n', '-v', 'error', '-xerror', '-filter_threads', '1', '-filter_complex_threads', '1', ...args]);
function dependencies() {
  for (const binary of ['ffmpeg', 'ffprobe']) if (spawnSync(binary, ['-version'], { stdio: 'ignore' }).status !== 0) fail(`missing ${binary}; check: ${binary} -version`);
  if (!/^\s*V\S*\s+libx264\s/m.test(run('ffmpeg', ['-v', 'error', '-encoders']))) fail('missing libx264 encoder; check: ffmpeg -encoders');
  const filters = run('ffmpeg', ['-v', 'error', '-filters']);
  for (const name of ['scale', 'format', 'setsar', 'setparams', 'aresample', 'asetpts']) if (!new RegExp(`^\\s*\\S+\\s+${name}\\s`, 'm').test(filters)) fail(`missing ${name} filter; check: ffmpeg -filters`);
}
function colour(v) {
  // An absent or unspecified sample aspect ratio (ffprobe's N/A or 0:1) is read as square, as untagged colour is read
  // through the caller's interpretation; any stated ratio but 1:1 refuses. HeyGen's digital twin renders carry none.
  if (v.codec_name !== 'h264' || v.pix_fmt !== 'yuv420p' || ![undefined, 'N/A', '0:1', '1:1'].includes(v.sample_aspect_ratio)) fail('source must be square-pixel H.264 yuv420p');
  for (const [key, expected] of Object.entries({ color_primaries: 'bt709', color_transfer: 'bt709', color_space: 'bt709', color_range: 'tv' })) if (v[key] && !['unknown', 'unspecified', expected].includes(v[key])) fail(`source ${key} contradicts bt709-tv`);
  if (v.side_data_list?.some(s => /display matrix/i.test(s.side_data_type)) || Number(v.tags?.rotate ?? 0)) fail('source carries a display matrix or rotation');
}
export function intervals(frames, stream) {
  const tb = rational(stream.time_base);
  const points = frames.map(f => { const pts = integerPTS(f.pts); if (f.best_effort_timestamp !== undefined && integerPTS(f.best_effort_timestamp) !== pts) fail('decoded PTS disagrees with best-effort timestamp'); return rat(pts * tb.n, tb.d); });
  if (!points.length || points.some((p, i) => i && cmp(p, points[i - 1]) <= 0)) fail('missing, duplicate or non-increasing presentation intervals');
  let duration = frames.at(-1).duration ?? frames.at(-1).pkt_duration;
  if (!duration || integerPTS(duration) <= 0n) fail('last decoded picture has no positive terminal duration');
  const first = points[0], terminal = add(points.at(-1), rat(integerPTS(duration) * tb.n, tb.d));
  return { first, tb, rows: points.map((p, i) => ({ ordinal: i, pts: String(frames[i].pts), start: add(p, neg(first)), end: add(points[i + 1] ?? terminal, neg(first)) })) };
}
export function selection(rows, count, rate, origin, lag, holds) {
  const map = [], held = [0, 0]; let source = 0;
  for (let n = 0; n < count; n++) {
    const at = add(add(origin, rat(BigInt(n) * rate.d, rate.n)), lag);
    while (source + 1 < rows.length && cmp(at, rows[source].end) >= 0) source++;
    const edge = cmp(at, rows[0].start) < 0 ? 0 : cmp(at, rows.at(-1).end) >= 0 ? 1 : null;
    if (edge !== null) held[edge]++;
    const row = rows[edge === 0 ? 0 : source];
    map.push({ output_ordinal: n, reference_seconds: text(add(origin, rat(BigInt(n) * rate.d, rate.n))), source_seconds: text(at), source_ordinal: row.ordinal, source_pts: row.pts,
      interval: [text(row.start), text(row.end)], held: edge === null ? null : ['start', 'end'][edge] });
  }
  if (held.some((c, i) => c > holds[i])) fail(`edge holds ${held.join('/')} exceed start/end budgets ${holds.join('/')}`);
  return { map, held, ranges: ['start', 'end'].flatMap(edge => { const a = map.filter(m => m.held === edge); return a.length ? [{ edge, start: a[0].output_ordinal, end: a.at(-1).output_ordinal + 1 }] : []; }) };
}
function audioClock(path, format, stream) {
  const frames = probe(path, format, ['-select_streams', 'a:0', '-show_frames', '-show_entries', 'frame=pts,best_effort_timestamp,nb_samples']).frames ?? [];
  const tb = rational(stream.time_base), rate = int(stream.sample_rate, 'audio rate', 8000, 192000);
  if (!frames.length) fail('absent or undecodable audio track');
  const first = rat(integerPTS(frames[0].pts) * tb.n, tb.d); let count = 0;
  for (const f of frames) {
    if (f.best_effort_timestamp !== undefined && integerPTS(f.best_effort_timestamp) !== integerPTS(f.pts)) fail('audio decoded PTS disagrees with best-effort timestamp');
    if (cmp(rat(integerPTS(f.pts) * tb.n, tb.d), add(first, rat(BigInt(count), BigInt(rate)))) !== 0) fail('audio decoded timestamps are discontinuous');
    count += int(f.nb_samples, 'decoded audio frame samples', 1);
  }
  if (count / rate > 360) fail('audio exceeds 360-second operating bound');
  return { first, count, rate, time_base: stream.time_base, first_pts: String(frames[0].pts) };
}
function decodeAudio(path, format, stream, scratch, name, clock) {
  const out = join(scratch, `${name}.f64le`);
  const settings = [...local(format), '-i', path, '-map', '0:a:0', '-vn', '-af', ['asetpts=N/SR/TB', ...rateFilter(clock.rate)].join(','), '-ac', String(stream.channels), '-c:a', 'pcm_f64le', '-threads:a', '1', '-f', 'f64le', out];
  ff(settings);
  const bytes = readFileSync(out), channels = int(stream.channels, 'channels', 1, 2), count = bytes.length / (channels * 8);
  if (!Number.isInteger(count) || !count || count > 360 * 48000 + 32) fail('unusable decoded audio count');
  if (count !== Number((BigInt(clock.count) * 48000n + BigInt(clock.rate) - 1n) / BigInt(clock.rate))) fail('decoded/resampled audio count differs from decoded native clock');
  const mono = new Float64Array(count), energies = Array(channels).fill(0); let energy = 0;
  for (let n = 0; n < count; n++) { let sum = 0; for (let c = 0; c < channels; c++) { const a = bytes.readDoubleLE((n * channels + c) * 8); if (!Number.isFinite(a)) fail('nonfinite decoded audio'); energies[c] += a * a; sum += a; } mono[n] = sum / channels; energy += mono[n] ** 2; }
  if (channels === 2 && energy < Math.max(...energies) * 0.01) fail('stereo channels cancel in analysis');
  if (energy / count < (16 / 32768) ** 2) fail('silent or insufficient audio signal');
  mono.analysis = { samples: count, rate: 48000, channels, channel_rms: energies.map(e => Math.sqrt(e / count)), mono_rms: Math.sqrt(energy / count),
    mean_to_strongest_energy_ratio: energy / Math.max(...energies), settings: settings.map(a => a === out ? `${name}.f64le` : a) };
  return mono;
}
export function checkUpload(r, ref, wave, referencePath) {
  // Do not open any path carried by a receipt. Only its bound padded identity is
  // consumed. This tool never selects or reopens a take or encoded upload.
  if (r.schema === 'speech-upload' && r.version === 1) {
    if (r.padded?.file !== 'padded.wav' || basename(referencePath) !== 'padded.wav' || !isDeepStrictEqual(r.padded.identity, ref) || r.padded.rate !== wave.rate || r.padded.channels !== wave.channels || r.padded.sample_count !== wave.count || r.readback?.delay?.residual_decoded_displacement_samples !== 0 || r.readback?.sample_count !== wave.count) fail('upload receipt does not identify this padded reference and zero decoded clock');
    return { schema: r.schema, version: r.version, mapping: r.mapping, source_identity: r.source?.before };
  }
  fail('unsupported or stale upload receipt');
}
function pcmClock(path) {
  const s = probe(path, 'wav', ['-show_streams']).streams;
  if (s?.length !== 1 || s[0].codec_name !== 'pcm_s16le' || s[0].codec_type !== 'audio' || ![1, 2].includes(s[0].channels)) fail('reference must be mono/stereo signed PCM16 WAV');
  const stream = s[0], clock = audioClock(path, 'wav', stream);
  return { stream, clock, rate: clock.rate, channels: stream.channels, count: clock.count };
}
const jsonWrite = (path, obj) => writeFileSync(path, JSON.stringify(obj, null, 2) + '\n', { flag: 'wx' });
function frameHashes(path, format, filter = null) {
  const result = ff(['-noautorotate', ...local(format), '-i', path, '-map', '0:v:0', '-an', ...(filter ? ['-vf', filter] : []), '-fps_mode', 'passthrough', '-pix_fmt', 'yuv420p', '-c:v', 'rawvideo', '-threads:v', '1', '-f', 'framehash', '-hash', 'sha256', '-']);
  return result.split('\n').filter(l => l && !l.startsWith('#')).map(l => { const parts = l.split(',').map(s => s.trim()); if (parts.length !== 6 || !/^[a-f\d]{64}$/.test(parts[5])) fail('invalid decoded frame hash'); return parts[5]; });
}
export function verifyOutput(path, policy, mapping, sourceHashes, sourceRows, lag) {
  const info = probe(path, 'mov', ['-show_streams', '-show_frames']), v = info.streams?.[0];
  if (info.streams?.length !== 1 || v.codec_type !== 'video') fail('readback found an audio leak or extra stream');
  colour(v);
  for (const [key, expected] of Object.entries({ width: policy.width, height: policy.height, color_primaries: 'bt709', color_transfer: 'bt709', color_space: 'bt709', color_range: 'tv' })) if (v[key] !== expected) fail(`readback size or colour differs at ${key} (expected ${expected}, read ${v[key]})`);
  const decoded = intervals(info.frames, v), times = decoded.rows;
  if (times.length !== policy.frames || cmp(decoded.first, rat(0n)) !== 0 || mp4Structure(path).editList) fail('readback frame count, origin or edit list failed');
  times.forEach((r, n) => { if (cmp(r.start, rat(BigInt(n) * policy.rate.d, policy.rate.n)) || cmp(r.end, rat(BigInt(n + 1) * policy.rate.d, policy.rate.n))) fail('readback exact grid failed'); });
  const hashes = frameHashes(path, 'mov');
  if (hashes.length !== times.length) fail('readback decoded picture count failed');
  // Walk source starts at each PROBED output time. This does not reuse the
  // construction selector, its output grid, or its interval-end cursor.
  let ordinal = 0;
  times.forEach((r, n) => {
    const at = add(add(policy.origin, r.start), lag);
    while (ordinal + 1 < sourceRows.length && cmp(sourceRows[ordinal + 1].start, at) <= 0) ordinal++;
    if (mapping[n].source_ordinal !== ordinal || hashes[n] !== sourceHashes[ordinal]) fail('readback decoded pixel correspondence or frame map failed');
  });
  return { checks: ['silent', 'h264-yuv420p', 'bt709-tv', 'square-pixels', 'no-matrix', 'no-edit-list', 'zero-origin', 'exact-grid', 'every-frame-pixels'],
    stream: v, frames: hashes.length, frame_sha256: hashes };
}
export function conform(argv) {
  const p = options(argv), o = p.o;
  const input = screen(o['--input']), reference = screen(o['--reference']), uploadReceipt = screen(o['--upload-receipt']), output = screen(o['--output'], true);
  if (extname(input).toLowerCase() !== '.mp4' || extname(reference).toLowerCase() !== '.wav' || extname(uploadReceipt).toLowerCase() !== '.json') fail('expected local .mp4, .wav and .json inputs');
  if (new Set([input, reference, uploadReceipt]).size !== 3 || dirname(reference) !== dirname(uploadReceipt)) fail('inputs must be distinct and reference/receipt in the same bundle');
  const paths = [input, reference, uploadReceipt], expected = [o['--sha256'], o['--reference-sha256'], o['--upload-receipt-sha256']];
  dependencies();
  const before = paths.map(identity); before.forEach((s, i) => { if (s.sha256 !== expected[i]) fail('input SHA-256 differs from expected identity'); });
  if (before[1].bytes > 256 * 1024 * 1024 || before[2].bytes > 4 * 1024 * 1024) fail('reference/receipt exceeds operating bound');
  const receipt = strictJSON(readFileSync(uploadReceipt, 'utf8')), wave = pcmClock(reference), upload = checkUpload(receipt, before[1], wave, reference);
  const info = probe(input, 'mov', ['-show_streams', '-show_frames']), streams = info.streams ?? [], v = streams.find(s => s.codec_type === 'video'), a = streams.find(s => s.codec_type === 'audio');
  if (streams.length !== 2 || !v || !a || ![1, 2].includes(a.channels)) fail('source needs exactly one video and one mono/stereo audio track');
  colour(v);
  const pictures = info.frames.filter(f => f.media_type === 'video'); pictures.forEach(f => colour({ ...v, ...f }));
  const clock = intervals(pictures, v), sound = audioClock(input, 'mov', a);
  const bytesPerFrame = p.width * p.height * 3 / 2;
  if ((pictures.length + p.frames) * bytesPerFrame > 64 * 1024 ** 3) fail('raw picture scratch exceeds 64 GiB bound');
  const stage = mkdtempSync(join(dirname(output), '.wiser-video-conform-'));
  try {
    const scratch = join(stage, 'source.yuv'), chosen = join(stage, 'selected.yuv'), video = join(stage, 'segment.mp4');
    const x = decodeAudio(reference, 'wav', wave.stream, stage, 'reference', wave.clock), y = decodeAudio(input, 'mov', a, stage, 'vendor', sound);
    const delta = add(sound.first, neg(clock.first));
    const correlation = correlate(x, y, p, delta);
    const lag = rational(correlation.lag_seconds, true), selected = selection(clock.rows, p.frames, p.rate, p.origin, lag, p.holds);
    const filter = `scale=${p.width}:${p.height}:flags=lanczos:in_color_matrix=bt709:out_color_matrix=bt709:in_range=tv:out_range=tv,format=yuv420p,setsar=1,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv`;
    ff(['-noautorotate', ...local('mov'), '-i', input, '-map', '0:v:0', '-an', '-vf', filter, '-fps_mode', 'passthrough', '-c:v', 'rawvideo', '-threads:v', '1', '-f', 'rawvideo', scratch]);
    if (statSync(scratch).size !== pictures.length * bytesPerFrame) fail('decoded source picture count changed');
    const src = openSync(scratch, 'r'), dst = openSync(chosen, 'wx'), buffer = Buffer.alloc(bytesPerFrame);
    try { for (const m of selected.map) { if (readSync(src, buffer, 0, buffer.length, m.source_ordinal * bytesPerFrame) !== buffer.length) fail('short source picture'); let at = 0; while (at < buffer.length) at += writeSync(dst, buffer, at, buffer.length - at); } }
    finally { closeSync(src); closeSync(dst); }
    const settings = ['-f', 'rawvideo', '-pixel_format', 'yuv420p', '-video_size', `${p.width}x${p.height}`, '-framerate', text(p.rate), '-i', chosen,
      '-map', '0:v:0', '-an', '-frames:v', String(p.frames), '-c:v', 'libx264', '-preset', 'medium', '-crf', '0', '-pix_fmt', 'yuv420p', '-threads:v', '1', '-bf', '0',
      '-vf', 'setsar=1,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv', '-x264-params', 'colorprim=bt709:transfer=bt709:colormatrix=bt709:fullrange=off',
      '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv', '-video_track_timescale', String(p.rate.n),
      '-movflags', '+faststart', '-use_editlist', '0', '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:v', '+bitexact', video];
    ff(settings);
    // Separate decodes witness both the transform and the encoded selections.
    const sourceHashes = frameHashes(input, 'mov', filter);
    if (sourceHashes.length !== pictures.length) fail('source readback frame count changed');
    const readback = verifyOutput(video, p, selected.map, sourceHashes, intervals(pictures, v).rows, lag);
    const after = paths.map(identity); if (!isDeepStrictEqual(before, after)) fail('input changed during conform');
    const ffmpegVersion = run('ffmpeg', ['-version']), ffprobeVersion = run('ffprobe', ['-version']);
    const outId = identity(video), result = { schema: 'video-conform', version: 1, tool_version: VERSION,
      inputs: Object.fromEntries(['video', 'reference', 'upload_receipt'].map((name, i) => [name, { path: paths[i], expected_sha256: expected[i], before: before[i], after: after[i] }])),
      upload_identity: upload, target: { frames: p.frames, rate: text(p.rate), width: p.width, height: p.height, origin: text(p.origin) },
      policy: Object.fromEntries(flags.filter(k => !['input', 'reference', 'upload-receipt', 'output'].includes(k)).map(k => [k.replaceAll('-', '_'), o[`--${k}`]])),
      clocks: { picture: { time_base: v.time_base, first_pts: pictures[0].pts, first_seconds: text(clock.first), count: pictures.length, terminal: text(clock.rows.at(-1).end) },
        vendor_audio: { ...sound, first: text(sound.first) }, reference_audio: { ...wave.clock, first: text(wave.clock.first), sample_zero: '0/1' } },
      correlation, offset: { rule: 'lag = vendor_first_decoded_audio_pts - first_displayed_picture_pts + sample_lag/48000; source_time = origin + n/rate + lag',
        audio_minus_picture_origin: text(delta), sample_lag: correlation.lag_samples, lag: text(lag), reference_clock: 'padded sample zero; no lead, guard or encoder delay added' },
      frames: selected.map.map(m => ({ ...m, source_sha256: sourceHashes[m.source_ordinal], output_sha256: readback.frame_sha256[m.output_ordinal] })),
      holds: { counts: selected.held, budgets: p.holds, comparison: '<=', passed: true, ranges: selected.ranges },
      treatment: { source_colour: o['--source-colour'], source_sample_aspect_ratio: v.sample_aspect_ratio ?? null, sample_aspect_ratio_read_as: '1:1', source_tags: Object.fromEntries(['color_primaries', 'color_transfer', 'color_space', 'color_range'].map(k => [k, v[k] ?? null])), filter, autorotation: false, audio: 'analysis only; dropped', speed_change: false },
      decoder: { build: ffmpegVersion, probe_build: ffprobeVersion, shared_ffmpeg_arguments: ['-nostdin', '-n', '-v', 'error', '-xerror', '-filter_threads', '1', '-filter_complex_threads', '1'],
        reference_audio: x.analysis, vendor_audio: y.analysis, video: { input_arguments: ['-noautorotate', ...local('mov'), '-i', input], map: '0:v:0', filter,
          output_arguments: ['-an', '-fps_mode', 'passthrough', '-pix_fmt', 'yuv420p', '-c:v', 'rawvideo', '-threads:v', '1'], verification: 'separate source and output framehash decodes; SHA-256 of every planar YUV frame' } },
      encoder: { ffmpeg_version: ffmpegVersion, ffprobe_version: ffprobeVersion, settings: settings.map(a => a === chosen ? 'selected.yuv' : a === video ? 'segment.mp4' : a) },
      output: { file: 'segment.mp4', identity: outId }, readback };
    const receiptPath = join(stage, 'receipt.json'); jsonWrite(receiptPath, result);
    if (!isDeepStrictEqual(strictJSON(readFileSync(receiptPath, 'utf8')), result) || !isDeepStrictEqual(identity(video), outId) || !isDeepStrictEqual(paths.map(identity), before)) fail('staged receipt or input identity changed before publication');
    for (const file of ['source.yuv', 'selected.yuv', 'reference.f64le', 'vendor.f64le']) rmSync(join(stage, file));
    const receiptId = identity(receiptPath), completion = { schema: 'video-conform-complete', version: 1, complete: true, files: { 'segment.mp4': outId, 'receipt.json': receiptId } };
    const marker = join(stage, 'complete.json'); jsonWrite(marker, completion);
    if (!isDeepStrictEqual(strictJSON(readFileSync(marker, 'utf8')), completion)) fail('completion marker readback failed');
    screen(output, true); renameSync(stage, output);
    return { ok: true, output, operations: ['conform'], segment: join(output, 'segment.mp4'), receipt: join(output, 'receipt.json'), receipt_identity: receiptId, completion: join(output, 'complete.json'), ...outId,
      frames: p.frames, fps: text(p.rate), lag_seconds: text(lag), peak: correlation.whole.peak, drift_seconds: correlation.drift_seconds, held: selected.held };
  } finally { if (existsSync(stage)) rmSync(stage, { recursive: true, force: true }); }
}
