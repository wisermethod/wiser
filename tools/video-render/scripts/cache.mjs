import { createHash, randomUUID } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import { copyFile, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { TOOL_DIR } from './dependencies.mjs';
import { canonical, inside } from './sequence.mjs';
import { protectedPath } from './project.mjs';

// Raise this whenever the tool changes the bytes a render produces.
export const RENDER_VERSION = '0.2.0';
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const isHash = (value) => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);

// Locale, property insertion order and filesystem traversal order cannot affect a key.
export function canonicalJSON(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJSON(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export const cacheKey = (inputs) => digest(canonicalJSON(inputs));

export async function fileHash(path) {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(path)) hash.update(bytes);
  return hash.digest('hex');
}

export async function cacheDirectory(path, project) {
  const resolved = await canonical(path, '--cache');
  if (await inside(resolved, TOOL_DIR)) throw new Error('--cache resolves inside the tool directory; choose a work directory.');
  if (await inside(resolved, project)) throw new Error('--cache is inside --project; choose a separate directory.');
  // No configuration is read or inferred. Only credential filenames in the directory
  // and its ancestors are inspected, before the cache is opened or created.
  for (let head = resolved;; head = dirname(head)) {
    try {
      const info = await lstat(head);
      if (!info.isDirectory()) throw new Error('--cache must name a directory with directory parents.');
      const entries = await readdir(head, { withFileTypes: true });
      if (entries.some((entry) => !entry.isDirectory() && protectedPath(entry.name))) {
        throw new Error('--cache is beside a credential file or inside its directory; choose a separate work directory.');
      }
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (dirname(head) === head) break;
  }
  return resolved;
}

export function validFrameHashes(text, count) {
  if (typeof text !== 'string') return false;
  const records = text.split('\n').filter((line) => line && !line.startsWith('#'));
  return records.length === count && records.every((line) => /,\s*[0-9a-f]{64}$/i.test(line));
}

async function entryFile(path) {
  try {
    const info = await lstat(path);
    // Do not follow links planted in a caller-owned cache, including hard links.
    return info.isFile() && info.nlink === 1 ? 'file' : 'unsafe';
  } catch (error) { if (error.code === 'ENOENT') return 'absent'; throw error; }
}

export async function readCache(directory, key, inputs, checkNames) {
  const video = join(directory, `${key}.mp4`), json = join(directory, `${key}.json`);
  const states = [await entryFile(video), await entryFile(json)];
  if (states.every((state) => state === 'absent')) return { record: null, reason: null };
  let reason, record;
  if (states.includes('unsafe')) reason = 'Cache entry contains a link or non-regular file.';
  else if (states.includes('absent')) reason = 'Cache entry is incomplete.';
  else {
    try { record = JSON.parse(await readFile(json, 'utf8')); }
    catch { reason = 'Cache record cannot be read as JSON.'; }
    if (!reason && (!record || record.key !== key || canonicalJSON(record.inputs) !== canonicalJSON(inputs)
      || !Number.isSafeInteger(record.bytes) || record.bytes < 1 || !isHash(record.sha256)
      || !validFrameHashes(record.frameHashes, inputs.frameCount) || !isHash(record.sequenceHashesSha256)
      || !Array.isArray(record.lintFindings) || !record.lintFindings.every((line) => typeof line === 'string')
      || !checkNames.every((name) => record.checks?.[name] === true))) reason = 'Cache record is invalid or incomplete.';
    if (!reason) {
      try {
        if ((await lstat(video)).size !== record.bytes || await fileHash(video) !== record.sha256) {
          reason = 'Cached MP4 bytes or SHA-256 do not match the record.';
        }
      } catch { reason = 'Cached MP4 cannot be read.'; }
    }
  }
  if (!reason) return { record, reason: null, video };
  // Only these two named entries are discarded. Unrelated cache entries are untouched.
  await rm(json, { force: true });
  await rm(video, { force: true });
  return { record: null, reason };
}

export async function writeCache(directory, record, source) {
  await mkdir(directory, { recursive: true });
  const stem = join(directory, `.wiser-video-cache-${randomUUID()}`);
  const video = `${stem}.mp4`, json = `${stem}.json`;
  try {
    await copyFile(source, video, constants.COPYFILE_EXCL);
    await writeFile(json, `${canonicalJSON(record)}\n`, { flag: 'wx' });
    // Both files are complete before either gains its final name. The record is
    // published last; an interrupted pair is an explicit miss on the next read.
    await rename(video, join(directory, `${record.key}.mp4`));
    await rename(json, join(directory, `${record.key}.json`));
  } finally {
    await rm(video, { force: true });
    await rm(json, { force: true });
  }
}
