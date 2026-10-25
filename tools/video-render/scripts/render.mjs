import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, lstat, mkdir, mkdtemp, open, rename, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, isAbsolute, join, relative, sep } from 'node:path';
import { promisify } from 'node:util';
import { childEnvironment, prepareRuntime } from './dependencies.mjs';
import { BROWSER_SWITCHES, optionsForSequence, sequence } from './sequence.mjs';
import { inspectProject } from './project.mjs';
import { RENDER_VERSION, cacheDirectory, cacheKey, canonicalJSON, fileHash, readCache, validFrameHashes, writeCache } from './cache.mjs';

const execute = promisify(execFile);
const FILTER = 'format=rgb24,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,'
  + 'setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv,setsar=1';

async function media(executable, args, label) {
  try {
    return await execute(executable, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
      env: childEnvironment(tmpdir()), windowsHide: true });
  } catch (error) {
    throw new Error(`${label} failed: ${error.code ?? error.signal ?? 'process error'}${error.stderr ? `; ${error.stderr.trim()}` : ''}. Check ${executable} -version and the input, then retry with new output paths.`);
  }
}

async function refuseExisting(path, name) {
  try { await lstat(path); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  throw new Error(`${name} already exists: ${path}; choose a new file.`);
}

export async function optionsForRender(input) {
  const options = await optionsForSequence(input);
  if (extname(options.output).toLowerCase() !== '.mp4') throw new Error('--output must name an absolute .mp4 file; see video-render.js help.');
  if (options.width % 2 || options.height % 2) throw new Error('--width and --height must be even for H.264 yuv420p; see video-render.js help.');
  const profile = input.profile ?? 'publish';
  if (!['publish', 'intermediate'].includes(profile)) throw new Error('--profile must be publish or intermediate; see video-render.js help.');
  const gop = Math.round(options.fps / 2);
  if (profile === 'publish' && (!Number.isSafeInteger(gop) || gop < 1)) throw new Error('--fps must give round(fps / 2) >= 1 for publish; see video-render.js help.');
  let frameHashes = null;
  if (input['frame-hashes'] !== undefined) {
    // Reuse the core's canonical, inode-aware destination screen, including symlink parents.
    try { frameHashes = (await optionsForSequence({ ...input, output: input['frame-hashes'] })).output; }
    catch (error) { throw new Error(error.message.replaceAll('--output', '--frame-hashes')); }
    if (frameHashes === options.output) throw new Error('--frame-hashes must differ from --output; choose two new files.');
    const contains = (a, b) => { const rel = relative(a, b); return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel); };
    if (contains(frameHashes, options.output) || contains(options.output, frameHashes)) throw new Error('--frame-hashes and --output cannot contain each other; choose separate files.');
  }
  const cache = input.cache === undefined ? null : await cacheDirectory(input.cache, options.project);
  if (cache) {
    const contains = (a, b) => { const rel = relative(a, b); return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel); };
    for (const path of [options.output, frameHashes].filter(Boolean)) {
      if (contains(cache, path) || contains(path, cache)) throw new Error('--cache and output files cannot contain each other; choose separate paths.');
    }
  }
  return { ...options, profile, gop, frameHashes, cache };
}

export function encodeArguments(frames, output, options) {
  const args = ['-hide_banner', '-loglevel', 'error', '-n', '-framerate', String(options.fps), '-start_number', '1',
    '-i', join(frames, 'frame_%06d.png'), '-frames:v', String(options.expectedFrames), '-vf', FILTER];
  if (options.profile === 'publish') args.push(
    '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'medium', '-crf', '16', '-threads', '4',
    '-g', String(options.gop), '-keyint_min', String(options.gop), '-sc_threshold', '0', '-flags', '+cgop', '-bf', '2',
    '-x264-params', 'open-gop=0:b-adapt=0:cabac=1:colorprim=bt709:transfer=bt709:colormatrix=bt709',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv');
  else args.push('-c:v', 'libx264', '-crf', '0', '-preset', 'medium', '-threads', '1', '-pix_fmt', 'yuv420p',
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv',
    '-bsf:v', 'h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1:video_full_range_flag=0');
  return [...args, '-an', '-movflags', '+faststart', '-use_editlist', '0', '-fflags', '+bitexact', '-flags:v', '+bitexact', output];
}

// Pure: callers supply version probes and project digests; output paths, workers,
// process state and environment variables never enter the canonical input object.
export function renderCacheInputs(options, versions, files) {
  return {
    toolVersion: versions.toolVersion ?? RENDER_VERSION,
    hyperframesVersion: versions.hyperframesVersion, chromeBuild: versions.chromeBuild,
    ffmpegVersion: versions.ffmpegVersion, gpu: options.gpu, capture: options.capture,
    width: options.width, height: options.height, fps: options.fps, duration: options.duration,
    frameCount: options.expectedFrames, profile: options.profile,
    browserSwitches: [...BROWSER_SWITCHES],
    encoderArguments: encodeArguments('<frames>', '<output>.mp4', options),
    files: files.map(({ path, sha256 }) => ({ path, sha256 })).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
  };
}

function requiredChecks(options) {
  return ['videoOnly', 'frameCount', 'h264', 'yuv420p', 'bt709TV', 'squarePixels', 'dimensions', 'noEditList',
    ...(options.profile === 'publish' ? ['firstFrameKeyframe', 'keyframeSpacing', 'lastGroup', 'keyframesIDR'] : []),
    'decodedFrameHashes'];
}

function requireCheck(checks, name, passed, detail) {
  if (!passed) throw new Error(`MP4 check ${name} failed: ${detail}; no output published. Retry after correcting the render or encoder.`);
  checks[name] = true;
}

export function checkMetadata(probe, options) {
  const checks = {};
  const streams = probe.streams ?? [], frames = probe.frames ?? [];
  requireCheck(checks, 'videoOnly', streams.length === 1 && streams[0].codec_type === 'video', 'require exactly one video stream and no audio');
  const stream = streams[0];
  requireCheck(checks, 'frameCount', Number(stream.nb_read_frames) === options.expectedFrames && frames.length === options.expectedFrames,
    `decoded ${stream.nb_read_frames ?? 'unknown'} frames (${frames.length} frame records); expected ${options.expectedFrames}`);
  requireCheck(checks, 'h264', stream.codec_name === 'h264', 'require H.264');
  requireCheck(checks, 'yuv420p', stream.pix_fmt === 'yuv420p', 'require yuv420p');
  requireCheck(checks, 'bt709TV', stream.color_primaries === 'bt709' && stream.color_transfer === 'bt709'
    && stream.color_space === 'bt709' && stream.color_range === 'tv', 'require BT.709 primaries, transfer, matrix and TV range');
  requireCheck(checks, 'squarePixels', stream.sample_aspect_ratio === '1:1', 'require sample aspect ratio 1:1');
  requireCheck(checks, 'dimensions', stream.width === options.width && stream.height === options.height, 'require the requested width and height');
  if (options.profile === 'publish') {
    const keys = frames.flatMap((frame, index) => frame.key_frame === 1 ? [index] : []);
    requireCheck(checks, 'firstFrameKeyframe', keys[0] === 0, 'the first decoded frame must be a keyframe');
    requireCheck(checks, 'keyframeSpacing', keys.slice(1).every((key, i) => key - keys[i] === options.gop), `every keyframe gap must be ${options.gop} frames`);
    requireCheck(checks, 'lastGroup', frames.length - keys.at(-1) <= options.gop, `the last group must contain at most ${options.gop} frames`);
  }
  return checks;
}

// MP4 access units contain length-prefixed AVC NAL units, not Annex B start codes.
export function packetHasIDR(data, lengthSize) {
  if (![1, 2, 3, 4].includes(lengthSize)) throw new Error('MP4 check keyframesIDR failed: invalid AVC NAL length size.');
  if (!data.length) throw new Error('MP4 check keyframesIDR failed: empty packet data.');
  let idr = false;
  for (let offset = 0; offset < data.length;) {
    if (offset + lengthSize > data.length) throw new Error('MP4 check keyframesIDR failed: truncated AVC length.');
    const size = data.readUIntBE(offset, lengthSize);
    offset += lengthSize;
    if (!size || offset + size > data.length) throw new Error('MP4 check keyframesIDR failed: truncated AVC NAL unit.');
    if ((data[offset] & 31) === 5) idr = true;
    offset += size;
  }
  return idr;
}

export async function checkIDR(path, probe, packets, checks) {
  const byPosition = new Map(packets.map((packet) => [packet.pos, packet]));
  const frames = probe.frames;
  const file = await open(path, 'r');
  let valid = packets.length === frames.length;
  try {
    const { size: fileSize } = await file.stat();
    for (const frame of frames) {
      const packet = byPosition.get(frame.pkt_pos);
      const position = Number(packet?.pos), size = Number(packet?.size);
      if (!Number.isSafeInteger(position) || position < 0 || !Number.isSafeInteger(size) || size < 1 || position + size > fileSize) { valid = false; break; }
      // Read one access unit at a time; ffprobe's hex-dump JSON would buffer the whole video.
      const data = Buffer.alloc(size);
      if ((await file.read(data, 0, size, position)).bytesRead !== size) { valid = false; break; }
      const idr = packetHasIDR(data, Number(probe.streams[0].nal_length_size));
      if (idr !== (frame.key_frame === 1) || idr !== packet.flags.includes('K')) { valid = false; break; }
    }
  } finally { await file.close(); }
  requireCheck(checks, 'keyframesIDR', valid, 'each keyframe must contain an IDR picture, and every IDR must be a keyframe');
}

export async function hasEditList(path) {
  const file = await open(path, 'r');
  try {
    const { size: fileSize } = await file.stat();
    async function walk(start, end) {
      for (let offset = start; offset < end;) {
        const header = Buffer.alloc(16);
        if (end - offset < 8 || (await file.read(header, 0, 8, offset)).bytesRead !== 8) throw new Error('MP4 check noEditList failed: truncated box header.');
        const type = header.toString('ascii', 4, 8);
        let size = header.readUInt32BE(0), headerSize = 8;
        if (size === 1) {
          if (end - offset < 16 || (await file.read(header, 8, 8, offset + 8)).bytesRead !== 8) throw new Error('MP4 check noEditList failed: truncated extended box header.');
          size = Number(header.readBigUInt64BE(8));
          headerSize = 16;
        } else if (size === 0) size = end - offset;
        if (!Number.isSafeInteger(size) || size < headerSize || offset + size > end) throw new Error('MP4 check noEditList failed: invalid box size.');
        if (type === 'elst') return true;
        if (['moov', 'trak', 'edts'].includes(type) && await walk(offset + headerSize, offset + size)) return true;
        offset += size;
      }
      return false;
    }
    return await walk(0, fileSize);
  } finally { await file.close(); }
}

export async function verifyMP4(path, options) {
  const { stdout } = await media('ffprobe', ['-v', 'error', '-count_frames', '-show_streams', '-show_frames',
    '-show_entries', 'stream=codec_type,codec_name,pix_fmt,color_primaries,color_transfer,color_space,color_range,sample_aspect_ratio,nb_read_frames,nal_length_size,width,height:frame=key_frame,pkt_pos',
    '-of', 'json', path], 'MP4 check ffprobe readback');
  const probe = JSON.parse(stdout);
  const checks = checkMetadata(probe, options);
  requireCheck(checks, 'noEditList', !await hasEditList(path), 'an elst box is present');
  if (options.profile === 'publish') {
    const data = await media('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_packets',
      '-show_entries', 'packet=pos,size,flags', '-of', 'json', path], 'MP4 check keyframesIDR readback');
    await checkIDR(path, probe, JSON.parse(data.stdout).packets ?? [], checks);
  }
  return { frameCount: Number(probe.streams[0].nb_read_frames), checks };
}

export async function render(input, { install = false } = {}) {
  const started = performance.now();
  const options = await optionsForRender(input);
  const project = await inspectProject(options.project);
  // Refuse a missing readback dependency before rendering or authorising an install.
  await media('ffprobe', ['-version'], 'ffprobe presence check');
  let runtime, inputs, entry, key = null, cacheReason = null;
  if (options.cache) {
    runtime = await prepareRuntime({ install, gpu: options.gpu });
    inputs = renderCacheInputs(options, { hyperframesVersion: runtime.hyperframes.version,
      chromeBuild: runtime.chrome.build, ffmpegVersion: runtime.ffmpeg.version }, project.files);
    key = cacheKey(inputs);
    ({ record: entry, reason: cacheReason } = await readCache(options.cache, key, inputs, requiredChecks(options)));
  }
  let temporary;
  const pending = join(dirname(options.output), `.wiser-video-render-${randomUUID()}.mp4`);
  let wroteHashes = false;
  try {
    let core, verified, hashes = null, bytes, sha256;
    await mkdir(dirname(options.output), { recursive: true });
    if (entry) {
      await copyFile(join(options.cache, `${key}.mp4`), pending, constants.COPYFILE_EXCL);
      bytes = (await stat(pending)).size;
      sha256 = await fileHash(pending);
      if (bytes !== entry.bytes || sha256 !== entry.sha256) throw new Error('Cached MP4 changed while copying; retry with new output paths.');
      core = { hyperframesVersion: inputs.hyperframesVersion, chromeBuild: inputs.chromeBuild,
        gpu: options.gpu, capture: options.capture, lintFindings: entry.lintFindings, hashesSha256: entry.sequenceHashesSha256 };
      verified = { frameCount: inputs.frameCount, checks: entry.checks };
      hashes = options.frameHashes ? entry.frameHashes : null;
    } else {
      temporary = await mkdtemp(join(tmpdir(), 'wiser-video-encode-'));
      core = await sequence({ ...options, output: join(temporary, 'sequence') }, { install, runtime });
      const frames = join(temporary, 'sequence/frames');
      // The sequence core checks count and pixels; also require the exact names the demuxer consumes.
      for (let i = 1; i <= options.expectedFrames; i++) {
        if (!(await stat(join(frames, `frame_${String(i).padStart(6, '0')}.png`))).isFile()) throw new Error(`PNG sequence check failed at frame ${i}; require frame_%06d.png starting at 1.`);
      }
      await media('ffmpeg', encodeArguments(frames, pending, options), 'FFmpeg encode');
      verified = await verifyMP4(pending, options);
      if (options.frameHashes || options.cache) {
        hashes = (await media('ffmpeg', ['-v', 'error', '-i', pending, '-map', '0:v:0', '-an', '-pix_fmt', 'yuv420p',
          '-fps_mode', 'passthrough', '-f', 'framehash', '-hash', 'sha256', '-'], 'decoded frame hashes')).stdout;
        requireCheck(verified.checks, 'decodedFrameHashes', validFrameHashes(hashes, verified.frameCount), 'require one SHA-256 per decoded frame');
      }
      bytes = (await stat(pending)).size;
      sha256 = await fileHash(pending);
      if (options.cache) {
        if (canonicalJSON((await inspectProject(options.project)).files) !== canonicalJSON(inputs.files)) {
          throw new Error('Project files changed during rendering; no cache entry or output published. Retry with stable inputs.');
        }
        await writeCache(options.cache, { key, inputs, bytes, sha256, frameHashes: hashes,
          sequenceHashesSha256: core.hashesSha256, lintFindings: core.lintFindings, checks: verified.checks }, pending);
      }
      if (!options.frameHashes) hashes = null;
    }
    await refuseExisting(options.output, '--output');
    if (hashes !== null) {
      await mkdir(dirname(options.frameHashes), { recursive: true });
      const file = await open(options.frameHashes, 'wx');
      wroteHashes = true;
      try { await file.writeFile(hashes); } finally { await file.close(); }
    }
    await rename(pending, options.output);
    return { ...core, profile: options.profile, output: options.output, bytes, sha256, ...verified,
      cache: options.cache ? entry ? 'hit' : 'miss' : 'off', key, ...(cacheReason ? { cacheReason } : {}),
      sequenceHashesSha256: core.hashesSha256, logPath: null, hashesPath: options.frameHashes,
      hashesSha256: hashes === null ? null : createHash('sha256').update(hashes).digest('hex'),
      seconds: Math.round((performance.now() - started) / 10) / 100 };
  } catch (error) {
    if (wroteHashes) await rm(options.frameHashes, { force: true });
    throw error;
  } finally {
    try { await rm(pending, { force: true }); }
    finally { if (temporary) await rm(temporary, { recursive: true, force: true }); }
  }
}
