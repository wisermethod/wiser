import { constants } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { optionsForSequence, sequence } from './sequence.mjs';
import { inspectProject } from './project.mjs';

export async function optionsForFrames(input) {
  const options = await optionsForSequence(input);
  if (typeof input.times !== 'string' || !input.times.trim()) throw new Error('--times is required: pass comma-separated seconds; see video-render.js help.');
  const parts = input.times.split(',');
  if (parts.length > 60) throw new Error('--times accepts at most 60 times; see video-render.js help.');
  const times = parts.map((part) => part.trim() ? Number(part) : NaN);
  if (times.some((time) => !Number.isFinite(time) || time < 0)) throw new Error('--times must contain finite, non-negative numbers of seconds; see video-render.js help.');
  if (new Set(times).size !== times.length) throw new Error('--times contains duplicate times; pass each time once. See video-render.js help.');
  const frames = times.map((requestedTime) => {
    const frame = Math.min(Math.floor(requestedTime * options.fps), options.expectedFrames - 1);
    return { requestedTime, frame, time: frame / options.fps, file: `frame_${String(frame).padStart(6, '0')}.png` };
  });
  return { ...options, frames };
}

export async function frames(input, { install = false } = {}) {
  const started = performance.now();
  const options = await optionsForFrames(input);
  await inspectProject(options.project);
  const temporary = await mkdtemp(join(tmpdir(), 'wiser-video-frames-'));
  let claimed = false;
  try {
    const output = join(temporary, 'sequence');
    const core = await sequence({ ...options, output }, { install });
    // The core hashes decoded RGBA pixels for every sequence frame. PNGs start at
    // 1 on disk; requested frame numbers and their displayed times start at 0.
    const hashes = new Map((await readFile(core.hashesPath, 'utf8')).trim().split('\n')
      .map((line) => [line.slice(66), line.slice(0, 64)]));
    const selected = options.frames.map((frame) => {
      const source = `frame_${String(frame.frame + 1).padStart(6, '0')}.png`;
      const sha256 = hashes.get(source);
      if (!sha256) throw new Error(`PNG sequence check failed at frame ${frame.frame}; require frame_%06d.png starting at 1.`);
      return { ...frame, sha256 };
    });
    await mkdir(dirname(options.output), { recursive: true });
    // Claim the new directory exclusively, including when another process wrote
    // it during rendering. Only a directory this run claimed is removed on error.
    await mkdir(options.output);
    claimed = true;
    const copied = new Set();
    for (const frame of selected) {
      if (copied.has(frame.frame)) continue;
      const source = `frame_${String(frame.frame + 1).padStart(6, '0')}.png`;
      await copyFile(join(output, 'frames', source), join(options.output, frame.file), constants.COPYFILE_EXCL);
      copied.add(frame.frame);
    }
    await writeFile(join(options.output, 'frames.json'), `${JSON.stringify(selected, null, 2)}\n`, { flag: 'wx' });
    return { ...core, output: options.output, frames: selected, logPath: null, hashesPath: null,
      seconds: Math.round((performance.now() - started) / 10) / 100 };
  } catch (error) {
    if (claimed) await rm(options.output, { recursive: true, force: true });
    throw error;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
