// Internal mechanics for exact-frames/composite. No work or probes at import.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, realpathSync, renameSync, rmdirSync, rmSync, statSync, writeFileSync, writeSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { hash, mp4Structure } from './finish.js';
import { add, cmp, neg, rat, rational, strictJSON, text } from './conform.js';
export { add, cmp, neg, rat, rational, strictJSON, text, isDeepStrictEqual };
export const VERSION = '0.4.0';
export const fail = s => { throw new Error(`Error: video evidence: ${s}; correct the inputs or use a fresh destination. See node scripts/edit.js help.`); };
export const digest = b => createHash('sha256').update(b).digest('hex');
export const identity = p => ({ bytes: statSync(p).size, sha256: hash(p) });
export function integer(v, label, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (!/^\d+$/.test(String(v)) || !Number.isSafeInteger(Number(v)) || Number(v) < min || Number(v) > max) fail(`${label} must be an integer from ${min} to ${max}`);
  return Number(v);
}
export function options(argv, required, optional = []) {
  const o = Object.create(null);
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i];
    if (!k.startsWith('--') || ![...required, ...optional].includes(k.slice(2))) fail(`unknown or inapplicable option ${k}`);
    if (Object.hasOwn(o, k.slice(2))) fail(`${k} was given twice`);
    if (argv[i + 1] === undefined || argv[i + 1].startsWith('--')) fail(`${k} needs a value`);
    o[k.slice(2)] = argv[i + 1];
  }
  for (const k of required) if (!Object.hasOwn(o, k)) fail(`--${k} is required`);
  for (const k of Object.keys(o).filter(k => k.endsWith('sha256'))) {
    if (!/^[a-f\d]{64}$/i.test(o[k])) fail(`--${k} must be 64 hexadecimal digits`);
    o[k] = o[k].toLowerCase();
  }
  return o;
}
const tool = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const protectedPath = p => p.split(sep).some(s => s.toLowerCase() === 'memory' || /^(?:\.env(?:\..*)?|credentials\.json)$/i.test(s) || /\.env$/i.test(s));
function inside(p, root) {
  const r = statSync(root);
  for (;;) {
    try { const s = statSync(p); if (r.dev === s.dev && r.ino === s.ino) return true; } catch (e) { if (!['ENOENT', 'ENOTDIR'].includes(e.code)) throw e; }
    if (p === dirname(p)) return false;
    p = dirname(p);
  }
}
export function screen(raw, output = false) {
  if (typeof raw !== 'string' || !isAbsolute(raw) || protectedPath(raw)) fail('paths must be absolute and outside protected memory or credential paths');
  let p;
  try {
    p = output ? join(realpathSync(dirname(raw)), basename(raw)) : realpathSync(raw);
    if (output) {
      try { lstatSync(p); fail('destination already exists (complete or incomplete)'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    }
  } catch (e) { if (e.message.startsWith('Error: video evidence:')) throw e; fail('path cannot be canonicalized or its parent does not exist'); }
  if (protectedPath(p) || output && inside(p, tool)) fail('path resolves to a protected path or inside this tool directory');
  if (!output) { const s = statSync(p); if (!s.isFile() || s.nlink !== 1) fail('source must be a regular file with one link'); }
  return p;
}
export function run(bin, args, binary = false) {
  const r = spawnSync(bin, args, { encoding: binary ? null : 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024 });
  if (r.error || r.status !== 0 || r.stderr.length) fail(`${bin} could not complete media readback (decoder diagnostics withheld)`);
  return r.stdout;
}
export const local = ['-protocol_whitelist', 'file,pipe', '-format_whitelist', 'mov', '-f', 'mov', '-enable_drefs', '0', '-use_absolute_path', '0'];
export const ff = args => run('ffmpeg', ['-nostdin', '-n', '-v', 'error', '-xerror', '-filter_threads', '1', '-filter_complex_threads', '1', ...args]);
export function dependencies(composite = false) {
  for (const bin of ['ffmpeg', 'ffprobe']) if (spawnSync(bin, ['-version'], { stdio: 'ignore' }).status !== 0) fail(`missing ${bin}; check: ${bin} -version`);
  const encoders = run('ffmpeg', ['-v', 'error', '-encoders']);
  const encoder = composite ? 'libx264' : 'png';
  if (!new RegExp(`^\\s*V\\S*\\s+${encoder}\\s`, 'm').test(encoders)) fail(`missing ${encoder} encoder; check: ffmpeg -encoders`);
  const filters = run('ffmpeg', ['-v', 'error', '-filters']);
  for (const name of composite ? ['scale', 'setsar', 'setparams'] : ['scale', 'format', 'select', 'crop']) {
    if (!new RegExp(`^\\s*\\S+\\s+${name}\\s`, 'm').test(filters)) fail(`missing ${name} filter; check: ffmpeg -filters`);
  }
}
export function alphaDependencies() {
  for (const bin of ['ffmpeg', 'ffprobe']) if (spawnSync(bin, ['-version'], { stdio: 'ignore' }).status !== 0) fail(`missing ${bin}; check: ${bin} -version`);
  const encoders = run('ffmpeg', ['-v', 'error', '-encoders']);
  if (!/^\s*V\S*\s+libx264\s/m.test(encoders)) fail('missing libx264 encoder; check: ffmpeg -encoders');
  const decoders = run('ffmpeg', ['-v', 'error', '-decoders']);
  if (!/^\s*V\S*\s+png\s/m.test(decoders)) fail('missing png decoder; check: ffmpeg -decoders');
  const filters = run('ffmpeg', ['-v', 'error', '-filters']);
  for (const name of ['setsar', 'setparams']) {
    if (!new RegExp(`^\\s*\\S+\\s+${name}\\s`, 'm').test(filters)) fail(`missing ${name} filter; check: ffmpeg -filters`);
  }
}
function pts(v) {
  if (!/^-?\d+$/.test(String(v)) || !Number.isSafeInteger(Number(v))) fail('missing or unsafe decoded presentation timestamp');
  return BigInt(v);
}
function colour(s) {
  if (s.codec_name !== 'h264' || s.pix_fmt !== 'yuv420p' || s.sample_aspect_ratio !== '1:1' || s.field_order !== 'progressive') fail('only progressive square-pixel H.264 yuv420p is supported');
  for (const [k, v] of Object.entries({ color_primaries: 'bt709', color_transfer: 'bt709', color_space: 'bt709', color_range: 'tv' })) if (s[k] !== v) fail(`unsupported or unresolved ${k}; require tagged BT.709 TV`);
  if (s.side_data_list?.some(x => /display matrix/i.test(x.side_data_type)) || Number(s.tags?.rotate ?? 0)) fail('rotation or display matrix is unsupported');
}
export function inspect(path, silent = false) {
  const info = strictJSON(run('ffprobe', ['-v', 'error', ...local, '-show_streams', '-show_frames', '-of', 'json', path]));
  const streams = info.streams ?? [], videos = streams.filter(s => s.codec_type === 'video'), s = videos[0];
  if (videos.length !== 1 || streams.some(x => !['video', 'audio'].includes(x.codec_type)) || silent && streams.length !== 1) fail('require one video stream; composite refuses audio and extra streams');
  colour(s);
  const width = integer(s.width, 'width', 2, 8192), height = integer(s.height, 'height', 2, 8192);
  if (width % 2 || height % 2) fail('stored dimensions must be even');
  const frames = (info.frames ?? []).filter(f => f.media_type === 'video');
  if (!frames.length || frames.length > 100000) fail('decoded frame count must be 1..100000');
  const tb = rational(s.time_base);
  if (tb.n <= 0n) fail('unusable time base');
  let previous;
  const rows = frames.map((f, ordinal) => {
    colour({ ...s, ...f });
    if (f.width !== width || f.height !== height || f.interlaced_frame) fail('changing or interlaced geometry is unsupported');
    const p = pts(f.pts);
    if (f.best_effort_timestamp === undefined || pts(f.best_effort_timestamp) !== p || previous !== undefined && p <= previous) fail('missing, duplicate or non-increasing presentation timestamps');
    previous = p;
    return { ordinal, pts: String(p), seconds: rat(p * tb.n, tb.d), duration: f.duration ?? f.pkt_duration };
  });
  const first = rows[0].seconds;
  for (const r of rows) r.time = text(add(r.seconds, neg(first)));
  return { stream: s, rows, first, tb, width, height, count: rows.length };
}
export function clock(info, path) {
  const rate = rational(info.stream.r_frame_rate);
  if (cmp(rate, rat(1n)) < 0 || cmp(rate, rat(240n)) > 0 || rate.n > 1000000n || rate.d > 1000000n || info.tb.n !== 1n) fail('unsupported rate or clock');
  if (cmp(info.first, rat(0n)) || mp4Structure(path).editList) fail('composite requires zero picture origin and no edit list');
  for (const r of info.rows) {
    if (cmp(r.seconds, rat(BigInt(r.ordinal) * rate.d, rate.n)) || r.duration === undefined || pts(r.duration) * info.tb.n * rate.n !== rate.d * info.tb.d) fail('every decoded frame must occupy the exact constant grid');
  }
  return rate;
}
export function readFrame(fd, size, n) {
  const b = Buffer.alloc(size);
  if (readSync(fd, b, 0, size, n * size) !== size) fail('short decoded frame');
  return b;
}
export function writeAll(fd, b) { let i = 0; while (i < b.length) i += writeSync(fd, b, i, b.length - i); }
export function decode(path, output, pixelFormat, filter = null) {
  ff(['-noautorotate', ...local, '-i', path, '-map', '0:v:0', '-an', ...(filter ? ['-vf', filter] : []), '-fps_mode', 'passthrough', '-pix_fmt', pixelFormat, '-c:v', 'rawvideo', '-threads:v', '1', '-f', 'rawvideo', output]);
}
export function sameSources(paths, before) {
  const after = paths.map(identity);
  if (!isDeepStrictEqual(after, before)) fail('source identity changed during operation');
  return after;
}
export const jsonWrite = (p, v) => writeFileSync(p, JSON.stringify(v, null, 2) + '\n', { flag: 'wx' });
export function publish(stage, output, schema, recordName, record, files, paths, before, scratch) {
  sameSources(paths, before);
  const p = join(stage, recordName); jsonWrite(p, record);
  if (!isDeepStrictEqual(strictJSON(readFileSync(p, 'utf8')), record)) fail('staged manifest/receipt readback failed');
  for (const [name, id] of Object.entries(files)) if (!isDeepStrictEqual(identity(join(stage, name)), id)) fail('staged artifact identity changed');
  for (const name of scratch) rmSync(join(stage, name));
  const recordId = identity(p), complete = { schema: `${schema}-complete`, version: 1, complete: true, files: { ...files, [recordName]: recordId } };
  jsonWrite(join(stage, 'complete.json'), complete);
  if (!isDeepStrictEqual(strictJSON(readFileSync(join(stage, 'complete.json'), 'utf8')), complete)) fail('completion marker readback failed');
  sameSources(paths, before); screen(output, true);
  // Exclusively reserve the final name: rename alone can replace an empty
  // directory another run created after the final screen. No payload is visible
  // until the checked directory replaces our own empty reservation.
  try { mkdirSync(output); } catch { fail('destination collision or unusable publication directory'); }
  const reservation = statSync(output);
  try { renameSync(stage, output); }
  catch {
    try {
      const current = lstatSync(output);
      if (current.dev === reservation.dev && current.ino === reservation.ino) rmdirSync(output);
    } catch { /* A nonempty/replaced reservation is retained, never removed. */ }
    fail('bundle publication failed; inspect any incomplete destination before choosing a fresh one');
  }
  return { [recordName === 'manifest.json' ? 'manifest' : 'receipt']: join(output, recordName), record_identity: recordId, completion: join(output, 'complete.json') };
}
export function expectedIdentity(path, expected) {
  const id = identity(path);
  if (id.sha256 !== expected) fail('source SHA-256 differs from expected identity');
  return id;
}
export function builds() { return { ffmpeg: run('ffmpeg', ['-version']), ffprobe: run('ffprobe', ['-version']) }; }
export function withFrames(paths, fn) {
  const fds = [];
  try { for (const p of paths) fds.push(openSync(p, 'r')); return fn(...fds); }
  finally { for (const fd of fds) closeSync(fd); }
}
