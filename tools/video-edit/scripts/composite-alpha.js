import { spawn } from 'node:child_process';
import { constants, existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, sep } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { composeAlpha } from './alpha-blend.js';
import { verifyFrame } from './alpha-verify.js';
import { VERSION, alphaClock, alphaDependencies, builds, clock, cmp, digest, expectedIdentity, fail, identity, inspect, integer, isDeepStrictEqual, local, options, publish, run, sameSources, screen, text } from './evidence-media.js';

export const COMPOSITE_ALPHA_HELP = `Full-frame silent RGBA composite (all flags required, once):
  node scripts/edit.js composite-alpha --base <local.mp4> --base-sha256 <HEX>
    --layer <frames-directory> --layer-manifest-sha256 <HEX> --layer-first-index <n>
    --layer-alpha straight --layer-colour bt709 --output <new-directory>
  Layer-first-index: 0..999999; output ordinal n uses layer index first+n.
  Straight 8-bit RGBA PNGs, same size/count as base, frame_NNNNNN.png plus frames.sha256.
  PNG chunks: IHDR, IDAT, IEND, pHYs only; CRC checked. No transfer conversion.
  Base: silent progressive H.264 yuv420p BT.709 TV, square pixels, exact CFR,
  zero first displayed PTS, no edit list but one identity edit is allowed.
  No fit, crop, offset, retiming or audio.
  Bounds: even width/height <=8192, <=2073600 pixels; 1..27000 frames;
  PNG <=64 MiB; manifest <=27000 lines of 83 bytes. Streams 14 bytes/pixel/frame,
  <=784 GB across construction/read-back; scratch beyond segment <64 MiB.
  Policy composite-alpha-policy/1, support composite-alpha-support/1: exact integers,
  once half up, no clipping; luma per pixel, chroma per touched 2x2 block.
  Lossless segment.mp4 + receipt.json + complete.json, independently sample-checked.`;

const PREFIX = ['-nostdin', '-n', '-v', 'error', '-xerror', '-filter_threads', '1', '-filter_complex_threads', '1'];
const PNG_INPUT = ['-protocol_whitelist', 'file,pipe', '-format_whitelist', 'png_pipe', '-f', 'png_pipe'];
const MAX_PIXELS = 2073600, MAX_FRAMES = 27000, MAX_PNG = 64 * 1024 ** 2, MAX_MANIFEST = MAX_FRAMES * 83;
const POLICY = { version: 'composite-alpha-policy/1', support: 'composite-alpha-support/1', alpha: 'straight', colour: 'bt709',
  blend: "Y'CbCr: luma per pixel, chroma box filter of the premultiplied blend per 2x2 block", rounding: 'once, half up, exact integers', clip: 'none' };
const protectedPath = p => p.split(sep).some(s => s.toLowerCase() === 'memory' || /^(?:\.env(?:\..*)?|credentials\.json)$/i.test(s) || /\.env$/i.test(s));
function unlinked(path, directory = false) {
  const s = lstatSync(path);
  if (directory ? !s.isDirectory() : !s.isFile() || s.nlink !== 1) fail(directory ? 'layer must be an unlinked directory' : 'source must be a regular file with one link, never a symbolic link');
  return s;
}
function layerDirectory(raw) {
  if (!isAbsolute(raw) || protectedPath(raw)) fail('--layer must be absolute and outside protected paths');
  try {
    unlinked(raw, true);
    const directory = realpathSync(raw);
    if (protectedPath(directory)) fail('--layer resolves to a protected path');
    return directory;
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes(error.code)) fail('path cannot be canonicalized or its parent does not exist');
    throw error;
  }
}
function sourceFile(raw) {
  const path = screen(raw);
  unlinked(raw);
  return path;
}
function listing(directory, names) {
  try {
    unlinked(directory, true);
    if (!isDeepStrictEqual(readdirSync(directory).sort(), [...names].sort())) fail('layer directory must contain exactly frames.sha256 and the requested indexed PNG frames');
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes(error.code)) fail('path cannot be canonicalized or its parent does not exist');
    throw error;
  }
}

// Parse the container rather than asking a decoder to discard unsupported chunks.
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let bit = 0; bit < 8; bit++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}
function pngStructure(path, width, height) {
  const bytes = readFileSync(path);
  if (bytes.length > MAX_PNG || bytes.length < 8 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) fail('layer frame is not a bounded PNG');
  let offset = 8, header = false, data = false, ended = false, density = false, dataEnded = false;
  while (offset < bytes.length) {
    if (ended || offset + 12 > bytes.length) fail('invalid PNG chunk layout');
    const length = bytes.readUInt32BE(offset), end = offset + 12 + length;
    if (end > bytes.length) fail('truncated PNG chunk');
    const type = bytes.toString('latin1', offset + 4, offset + 8), body = bytes.subarray(offset + 8, end - 4);
    if (bytes.readUInt32BE(end - 4) !== crc(bytes.subarray(offset + 4, end - 4))) fail('PNG chunk CRC mismatch');
    if (!['IHDR', 'IDAT', 'IEND', 'pHYs'].includes(type)) fail(`unsupported PNG chunk ${type.replace(/[^A-Za-z]/g, '?')}`);
    if (!header && type !== 'IHDR') fail('PNG IHDR must be first');
    if (type === 'IHDR') {
      if (header || length !== 13 || body.readUInt32BE(0) !== width || body.readUInt32BE(4) !== height || body[8] !== 8 || body[9] !== 6 || body[10] !== 0 || body[11] !== 0 || body[12] !== 0) fail('PNG must be same-size noninterlaced 8-bit straight RGBA');
      header = true;
    } else if (type === 'IDAT') {
      if (dataEnded) fail('PNG IDAT chunks must be consecutive');
      data = true;
    } else if (type === 'pHYs') {
      if (density || data || length !== 9 || body[8] > 1) fail('invalid PNG pHYs chunk');
      density = true;
    } else {
      if (!data || length !== 0) fail('invalid PNG IEND');
      ended = true;
    }
    if (data && type !== 'IDAT') dataEnded = true;
    offset = end;
  }
  if (!header || !data || !ended) fail('PNG requires IHDR, IDAT and IEND');
}
function probePNG(path, width, height) {
  const info = JSON.parse(run('ffprobe', ['-v', 'error', ...PNG_INPUT, '-show_streams', '-of', 'json', path]));
  const s = info.streams?.[0];
  if (info.streams?.length !== 1 || s.codec_name !== 'png' || s.pix_fmt !== 'rgba' || s.width !== width || s.height !== height) fail('layer frame must probe as one same-size rgba PNG');
}
const decodeArgs = (path, png = false) => [...PREFIX, '-noautorotate', ...(png ? PNG_INPUT : local), '-i', path, '-map', '0:v:0', '-an', '-fps_mode', 'passthrough', '-pix_fmt', png ? 'rgba' : 'yuv420p', '-c:v', 'rawvideo', '-threads:v', '1', '-f', 'rawvideo', 'pipe:1'];

// Every subprocess has stdin closed, drains diagnostics without echoing them, and
// remains owned by this run until close, including during failure cleanup.
function launch(bin, args, children) {
  const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let diagnostic = false;
  const task = { child, failed: false, closed: false, completed: null };
  children.add(task);
  child.stderr.on('data', () => { diagnostic = true; });
  task.completed = new Promise((resolve, reject) => {
    child.on('error', () => { task.failed = true; reject(new Error('media subprocess could not start')); });
    child.on('close', code => {
      task.closed = true;
      children.delete(task);
      if (code !== 0 || diagnostic) { task.failed = true; reject(new Error('media subprocess failed (decoder diagnostics withheld)')); }
      else resolve();
    });
  });
  task.completed.catch(() => {});
  return task;
}
async function capture(bin, args, children, limit) {
  const task = launch(bin, args, children), chunks = [];
  let length = 0;
  for await (const chunk of task.child.stdout) {
    length += chunk.length;
    if (length > limit) { task.child.kill(); fail('media subprocess output exceeded its bound'); }
    chunks.push(chunk);
  }
  await task.completed;
  return Buffer.concat(chunks, length);
}
async function* frames(stream, size) {
  let frame = Buffer.allocUnsafe(size), used = 0;
  for await (const chunk of stream) {
    let offset = 0;
    while (offset < chunk.length) {
      const take = Math.min(size - used, chunk.length - offset);
      chunk.copy(frame, used, offset, offset + take);
      used += take; offset += take;
      if (used === size) { yield frame; frame = Buffer.allocUnsafe(size); used = 0; }
    }
  }
  if (used) fail('decoder returned a partial frame');
}
async function rgba(path, size, expected, children) {
  const layer = await capture('ffmpeg', decodeArgs(path, true), children, size);
  if (layer.length !== size || digest(layer) !== expected) fail('layer decoded RGBA SHA-256 differs from manifest');
  return layer;
}
async function fifoWriter(fifo, encoder) {
  // A blocking open can wait forever if the encoder exits before opening its
  // reader. Nonblocking open/write keeps failure visible and memory bounded.
  for (;;) {
    if (encoder.failed || encoder.closed) fail('encoder closed before FIFO input was opened');
    try { return await open(fifo, constants.O_WRONLY | constants.O_NONBLOCK); }
    catch (error) { if (error.code !== 'ENXIO') throw error; await delay(2); }
  }
}
async function writeFrame(writer, bytes, encoder) {
  let offset = 0;
  while (offset < bytes.length) {
    if (encoder.failed || encoder.closed) fail('encoder closed before all frames were written');
    try {
      const { bytesWritten } = await writer.write(bytes, offset, bytes.length - offset);
      if (!bytesWritten) fail('FIFO write made no progress');
      offset += bytesWritten;
    } catch (error) { if (error.code !== 'EAGAIN') throw error; await delay(1); }
  }
}

export async function compositeAlpha(argv) {
  const children = new Set();
  let stage, writer;
  try {
    const o = options(argv, ['base', 'base-sha256', 'layer', 'layer-manifest-sha256', 'layer-first-index', 'layer-alpha', 'layer-colour', 'output']);
    const first = integer(o['layer-first-index'], '--layer-first-index', 0, 999999);
    if (o['layer-alpha'] !== 'straight') fail('--layer-alpha supports only straight');
    if (o['layer-colour'] !== 'bt709') fail('--layer-colour supports only bt709');
    const base = sourceFile(o.base), directory = layerDirectory(o.layer), output = screen(o.output, true);
    if (extname(base).toLowerCase() !== '.mp4') fail('--base must be a local .mp4');
    await alphaDependencies();
    const baseBefore = expectedIdentity(base, o['base-sha256']), b = inspect(base, true), rate = alphaClock(b, base);
    const pixels = b.width * b.height, size = pixels * 3 / 2;
    if (pixels > MAX_PIXELS || b.count > MAX_FRAMES || first + b.count - 1 > 999999 || 14 * pixels * b.count > 784000000000) fail('picture, frame count, index or streamed-byte bound exceeded');
    const names = Array.from({ length: b.count }, (_, n) => `frame_${String(first + n).padStart(6, '0')}.png`), entries = ['frames.sha256', ...names];
    listing(directory, entries);
    const manifest = sourceFile(join(directory, 'frames.sha256'));
    if (unlinked(manifest).size > MAX_MANIFEST) fail('frames.sha256 exceeds 27000 lines of 83 bytes');
    const manifestBefore = expectedIdentity(manifest, o['layer-manifest-sha256']), manifestBytes = readFileSync(manifest);
    if (manifestBytes.length !== b.count * 83) fail('frames.sha256 must contain exactly one 83-byte line per frame');
    const hashes = names.map((name, n) => {
      const line = manifestBytes.subarray(n * 83, (n + 1) * 83).toString('ascii');
      if (!/^[a-f0-9]{64}  frame_[0-9]{6}\.png\n$/.test(line) || line.slice(66, -1) !== name || !manifestBytes.subarray(n * 83, (n + 1) * 83).equals(Buffer.from(line, 'ascii'))) fail('frames.sha256 line syntax, order or frame name mismatch');
      return line.slice(0, 64);
    });
    const pngs = [], pngBefore = [];
    for (const name of names) {
      const path = sourceFile(join(directory, name));
      if (unlinked(path).size > MAX_PNG) fail('layer PNG exceeds 64 MiB');
      const before = identity(path);
      pngStructure(path, b.width, b.height); probePNG(path, b.width, b.height);
      pngs.push(path); pngBefore.push(before);
    }
    const paths = [base, manifest, ...pngs], before = [baseBefore, manifestBefore, ...pngBefore], versions = builds();
    // Allow for all frame rows/hashes, identities and completion fields before
    // staging. Paths and probe/build text are the caller-dependent large fields.
    const recordBound = Buffer.byteLength(JSON.stringify({ paths, stream: b.stream, versions })) + b.count * 1024 + 16384;
    if (recordBound >= 64 * 1024 ** 2) fail('receipt and completion scratch exceeds 64 MiB');
    sameSources(paths, before); listing(directory, entries);
    stage = mkdtempSync(join(dirname(output), '.wiser-video-composite-alpha-'));
    const fifo = join(stage, 'composite.fifo'), video = join(stage, 'segment.mp4');
    await capture('mkfifo', [fifo], children, 0);
    const settings = ['-f', 'rawvideo', '-pixel_format', 'yuv420p', '-video_size', `${b.width}x${b.height}`, '-framerate', text(rate), '-i', fifo,
      '-map', '0:v:0', '-an', '-frames:v', String(b.count), '-c:v', 'libx264', '-preset', 'medium', '-crf', '0', '-pix_fmt', 'yuv420p', '-threads:v', '1', '-bf', '0',
      '-vf', 'setsar=1,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv', '-x264-params', 'colorprim=bt709:transfer=bt709:colormatrix=bt709:fullrange=off',
      '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv', '-video_track_timescale', String(b.tb.d),
      '-movflags', '+faststart', '-use_editlist', '0', '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:v', '+bitexact', video];
    const encoder = launch('ffmpeg', [...PREFIX, ...settings], children);
    encoder.child.stdout.resume();
    writer = await fifoWriter(fifo, encoder);
    const decoder = launch('ffmpeg', decodeArgs(base), children);
    let count = 0;
    for await (const frame of frames(decoder.child.stdout, size)) {
      if (count === b.count) fail('base decoded frame count increased');
      const layer = await rgba(pngs[count], pixels * 4, hashes[count], children);
      await writeFrame(writer, composeAlpha(frame, b.width, b.height, layer), encoder);
      count++;
    }
    await decoder.completed;
    if (count !== b.count) fail('base decoded frame count decreased');
    await writer.close(); writer = null;
    await encoder.completed;
    rmSync(fifo);
    const v = inspect(video, true), vr = clock(v, video);
    if (v.width !== b.width || v.height !== b.height || v.count !== b.count || cmp(vr, rate) || cmp(v.tb, b.tb)) fail('output intermediate geometry/count/clock changed');

    // New decoders, new RGBA buffers, and the separately authored verifier.
    // Neither composeAlpha nor supportMasks participates in this pass.
    const verifyBase = launch('ffmpeg', decodeArgs(base), children), verifyOutput = launch('ffmpeg', decodeArgs(video), children);
    const bases = frames(verifyBase.child.stdout, size), outputs = frames(verifyOutput.child.stdout, size), frameHashes = [];
    const readPair = async () => {
      const results = await Promise.allSettled([bases.next(), outputs.next()]);
      const failed = results.find(result => result.status === 'rejected');
      if (failed) throw failed.reason;
      return results.map(result => result.value);
    };
    try {
      for (let n = 0; n < b.count; n++) {
        const [baseFrame, actual] = await readPair();
        if (baseFrame.done || actual.done) fail('independent decoded frame count decreased');
        const layer = await rgba(pngs[n], pixels * 4, hashes[n], children), mismatch = verifyFrame(actual.value, baseFrame.value, layer, b.width, b.height);
        if (mismatch) fail(`independent readback ${mismatch.protected ? 'protected' : 'expected'} sample mismatch at frame ${n}, plane ${mismatch.plane}, ${mismatch.x},${mismatch.y}`);
        frameHashes.push(digest(actual.value));
      }
      const [baseEnd, outputEnd] = await readPair();
      if (!baseEnd.done || !outputEnd.done) fail('independent decoded frame count increased');
      await Promise.all([verifyBase.completed, verifyOutput.completed]);
    } catch (error) {
      await Promise.allSettled([bases.return(), outputs.return()]);
      throw error;
    }
    listing(directory, entries);
    for (const path of paths) unlinked(path);
    const after = sameSources(paths, before), outId = identity(video);
    const record = { schema: 'video-composite-alpha', version: 1, tool_version: VERSION, policy: { ...POLICY },
      inputs: { base: { path: base, expected_sha256: o['base-sha256'], before: baseBefore, after: after[0] },
        layer: { directory, first_index: first, manifest: { expected_sha256: o['layer-manifest-sha256'], before: manifestBefore, after: after[1] },
          frames: names.map((file, ordinal) => ({ ordinal, file, ...pngBefore[ordinal], decoded_rgba_sha256: hashes[ordinal] })) } },
      clocks: { base: { stream: b.stream, frames: b.count, first_pts: b.rows[0].pts, edit_list: rate.edit_list }, rate: text(rate), time_base: b.stream.time_base },
      mapping: { first_index: first, rule: 'output ordinal n = layer frame_{first_index+n} over base frame n', frames: b.count },
      encoder: { ...versions, settings: settings.map(a => a === fifo ? 'composite.fifo' : a === video ? 'segment.mp4' : a) },
      decoder: { input_arguments: { base: ['-noautorotate', ...local], layer: ['-noautorotate', ...PNG_INPUT], output: ['-noautorotate', ...local] },
        pixel_formats: { base: 'yuv420p', layer: 'rgba', output: 'yuv420p' },
        verification: 'separate new base/layer/output FFmpeg decodes; alpha-verify.js verifyFrame on every frame, every planar sample checked against independent exact integer policy and protected base samples' },
      output: { file: 'segment.mp4', identity: outId },
      readback: { checks: ['silent-intermediate', 'base-size-rate-clock-count', 'layer-decoded-rgba-manifest', 'outside-luma-support-equal', 'outside-chroma-support-equal', 'every-policy-sample-equal', 'sources-unchanged', 'layer-listing-unchanged'], frames: b.count, frame_sha256: frameHashes } };
    if (Buffer.byteLength(JSON.stringify(record, null, 2)) + 4096 >= 64 * 1024 ** 2) fail('receipt and completion scratch exceeds 64 MiB');
    const result = publish(stage, output, record.schema, 'receipt.json', record, { 'segment.mp4': outId }, paths, before, []);
    return { ok: true, output, operations: ['composite-alpha'], segment: join(output, 'segment.mp4'), ...result, ...outId, frames: b.count, fps: text(rate), policy: POLICY.version, support: POLICY.support };
  } catch (error) {
    if (error.message?.startsWith('Error: video evidence:')) throw error;
    fail('composite-alpha could not complete local media processing (diagnostics withheld)');
  } finally {
    for (const task of children) task.child.kill('SIGKILL');
    if (writer) await writer.close().catch(() => {});
    await Promise.allSettled([...children].map(task => task.completed));
    if (stage && existsSync(stage)) rmSync(stage, { recursive: true, force: true });
  }
}
