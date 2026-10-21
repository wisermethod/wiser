import { createHash, randomUUID } from 'node:crypto';
import { closeSync, constants as fsConstants, fstatSync, openSync, readSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, extname, join, resolve, sep } from 'node:path';

// Copied from cloudflare: connector modules cannot import another connector.
// userConfigDir stays in step with gateway/src/paths.js wiserUserConfigDir.
function userConfigDir(platform = process.platform, env = process.env, home = homedir()) {
  if (platform === 'win32') {
    const base = env.APPDATA && env.APPDATA.length > 0 ? env.APPDATA : join(home, 'AppData', 'Roaming');
    return join(base, 'wiser');
  }
  if (platform === 'darwin') return join(home, 'Library', 'Application Support', 'wiser');
  const xdg = env.XDG_CONFIG_HOME;
  if (typeof xdg === 'string' && xdg.length > 0) return join(xdg, 'wiser');
  return join(home, '.config', 'wiser');
}

function canonicalize(input) {
  let head = resolve(String(input));
  const below = [];
  for (;;) {
    try {
      return below.length === 0 ? realpathSync(head) : join(realpathSync(head), ...[...below].reverse());
    } catch {
      const parent = dirname(head);
      if (parent === head) return null;
      below.push(basename(head));
      head = parent;
    }
  }
}

function identity(path) {
  try {
    const s = statSync(path);
    return `${s.dev}:${s.ino}`;
  } catch {
    return null;
  }
}

function isInside(child, parent) {
  return child === parent || child.startsWith(parent.endsWith(sep) ? parent : parent + sep);
}

function refusedSet() {
  const dir = canonicalize(userConfigDir());
  const ids = new Set();
  const home = canonicalize(homedir());
  if (home) ids.add(identity(home));
  if (dir) {
    const seen = new Set();
    const stack = [dir];
    while (stack.length > 0) {
      const here = stack.pop();
      const hereId = identity(here);
      if (hereId) {
        if (seen.has(hereId)) continue;
        seen.add(hereId);
        ids.add(hereId);
      }
      let entries;
      try {
        entries = readdirSync(here, { withFileTypes: true });
      } catch { continue; }
      for (const entry of entries) {
        const child = canonicalize(join(here, entry.name));
        if (!child) continue;
        const childId = identity(child);
        if (childId) ids.add(childId);
        if (entry.isDirectory()) stack.push(child);
      }
    }
  }
  ids.delete(null);
  return { dir, home, ids };
}

function screenFile(input, refused, root) {
  const resolved = canonicalize(input);
  if (!resolved) return { refused: 'unresolvable' };
  if (root && !isInside(resolved, root)) return { refused: 'outside the named directory', resolved };
  let stats;
  try {
    stats = statSync(resolved);
  } catch {
    return { refused: 'not found', resolved };
  }
  if (!stats.isFile()) return { refused: 'not a regular file', resolved };
  if (refused.ids.has(`${stats.dev}:${stats.ino}`)) return { refused: 'credential', resolved };
  if (refused.dir && isInside(resolved, refused.dir)) return { refused: 'credential', resolved };
  const base = basename(resolved);
  if (base === '.env' || base.startsWith('.env.')) return { refused: 'credential', resolved };
  return { resolved, size: stats.size, id: `${stats.dev}:${stats.ino}` };
}

const UPLOAD = 'https://www.googleapis.com/upload/youtube/v3';
const UPLOAD_PATH = '/upload/youtube/v3/videos';
const CHUNK = 3145728;
const VIDEO_TYPES = { '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm' };
const IMAGE_TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };
const CAPTION_TYPES = { '.srt': 'application/octet-stream', '.vtt': 'text/vtt', '.sbv': 'application/octet-stream' };
const EDITABLE = ['title', 'description', 'tags', 'category_id', 'language', 'privacy'];
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const stopped = (v) => object(v) && typeof v.status === 'string';
const invalid = (field, reason) => ({ status: 'invalid_arguments', field, reason });
const unexpected = (endpoint, method = 'GET') => ({ status: 'vendor_error', endpoint, method, reason: 'unexpected answer' });
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function failure(value, endpoint, method) {
  const signal = value?.object ?? value;
  if (stopped(signal) && signal.status !== 'vendor_error') {
    // Preserve gateway stops without copying transport text or an upload address.
    return { status: signal.status };
  }
  const code = signal?.http_status ?? (typeof signal?.status === 'number' ? signal.status : null);
  const codes = signal?.provider_codes ?? signal?.error?.provider_codes;
  const providerCodes = Array.isArray(codes) ? [...new Set(codes.filter(Number.isSafeInteger))].slice(0, 10) : [];
  return { status: 'vendor_error', http_status: Number.isSafeInteger(code) ? code : null, endpoint, method,
    ...(providerCodes.length ? { provider_codes: providerCodes } : {}) };
}

async function proxy(ctx, request, safeEndpoint = request.endpoint.split('?')[0]) {
  const res = await ctx.proxy(request);
  if (stopped(res) || res?.error || res?.status >= 400) return failure(res, safeEndpoint, request.method);
  return res;
}

async function uploadProxy(ctx, request) {
  try { return await proxy(ctx, request, UPLOAD_PATH); }
  catch (error) { return failure(error, UPLOAD_PATH, request.method); }
}

function endpoint(path, values) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined) query.set(key, String(value));
  return `${path}?${query}`;
}

async function data(ctx, path, values, method = 'GET', body) {
  const answer = await proxy(ctx, { endpoint: endpoint(path, values), method, ...(body === undefined ? {} : { body }) });
  if (stopped(answer)) return answer;
  return object(answer?.data) ? answer.data : unexpected(path, method);
}

function bounds(input, titleLimit = 100) {
  if (input.title !== undefined && (Array.from(input.title).length > titleLimit || /[<>]/u.test(input.title))) {
    return invalid('title', 'title length or forbidden character');
  }
  if (input.description !== undefined && (Buffer.byteLength(input.description, 'utf8') > 5000 || /[<>]/u.test(input.description))) {
    return invalid('description', 'description length or forbidden character');
  }
  if (input.tags !== undefined) {
    const length = input.tags.reduce((n, tag) => n + Array.from(tag).length + (tag.includes(' ') ? 2 : 0), Math.max(0, input.tags.length - 1));
    if (input.tags.length > 50 || length > 500) return invalid('tags', 'tags length');
  }
  if (input.name !== undefined && Array.from(input.name).length > 150) return invalid('name', 'name length');
  if (input.max_results !== undefined && (input.max_results < 1 || input.max_results > 50)) return invalid('max_results', 'outside 1 to 50');
  if (input.position !== undefined && input.position < 0) return invalid('position', 'negative position');
  return null;
}

function openFile(path, types, max, min = 0) {
  const screened = screenFile(path, refusedSet());
  if (screened.refused) return invalid('path', screened.refused);
  const type = types[extname(screened.resolved).toLowerCase()];
  if (!type) return invalid('path', 'unsupported extension');
  if (screened.size < min || screened.size > max) return invalid('path', 'file size');
  let fd;
  try {
    fd = openSync(screened.resolved, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const stats = fstatSync(fd);
    if (!stats.isFile() || `${stats.dev}:${stats.ino}` !== screened.id || stats.size !== screened.size) {
      closeSync(fd);
      return invalid('path', 'file changed');
    }
    return { fd, size: stats.size, type };
  } catch {
    if (fd !== undefined) closeSync(fd);
    return invalid('path', 'unreadable file');
  }
}

function readPiece(read, fd, buffer, offset, length) {
  let got = 0;
  while (got < length) {
    let n;
    try { n = read(fd, buffer, got, length - got, offset + got); }
    catch { return false; }
    if (!Number.isInteger(n) || n <= 0 || n > length - got) return false;
    got += n;
  }
  return true;
}

const channelProjection = (c) => ({ channel_id: c.id, title: c.snippet?.title ?? null, handle: c.snippet?.customUrl ?? null,
  privacy_status: c.status?.privacyStatus ?? null, long_uploads_status: c.status?.longUploadsStatus ?? null, is_linked: c.status?.isLinked ?? null });
async function channels(ctx) {
  const answer = await data(ctx, '/channels', { part: 'id,snippet,status', mine: true });
  if (stopped(answer)) return answer;
  return Array.isArray(answer.items) && answer.items.every(object) ? answer.items : unexpected('/channels');
}
async function checkChannel(input, ctx) {
  const items = await channels(ctx);
  if (stopped(items)) return items;
  if (items.length !== 1 || items[0].id !== input.channel_id) {
    return { ...invalid('channel_id', 'not the signed-in channel'),
      signed_in_channels: items.map((c) => ({ channel_id: c.id ?? null, title: c.snippet?.title ?? null })) };
  }
  return items[0];
}
async function owned(ctx, path, id, channelId, field, part = 'snippet,status') {
  const answer = await data(ctx, path, { part, id });
  if (stopped(answer)) return answer;
  if (!Array.isArray(answer.items) || !answer.items.every(object)) return unexpected(path);
  const resource = answer.items.find((item) => item.id === id);
  if (!resource) return invalid(field, 'not found');
  if (resource.snippet?.channelId !== channelId) return invalid(field, 'not owned by channel_id');
  return resource;
}

function snippet(input, current = {}) {
  const out = select(current, ['title', 'description', 'tags', 'categoryId', 'defaultLanguage', 'defaultAudioLanguage']);
  for (const key of ['title', 'description', 'tags']) if (input[key] !== undefined) out[key] = input[key];
  if (input.category_id !== undefined) out.categoryId = input.category_id;
  if (input.language !== undefined) {
    out.defaultLanguage = input.language;
    out.defaultAudioLanguage = input.language;
  }
  return out;
}
function select(source, keys) {
  const out = {};
  if (object(source)) for (const key of keys) if (Object.hasOwn(source, key)) out[key] = source[key];
  return out;
}
function videoProjection(v) {
  return { video_id: v.id ?? null, channel_id: v.snippet?.channelId ?? null, title: v.snippet?.title ?? null,
    description: v.snippet?.description ?? null, category_id: v.snippet?.categoryId ?? null,
    language: v.snippet?.defaultLanguage ?? null, audio_language: v.snippet?.defaultAudioLanguage ?? null,
    status: select(v.status, ['uploadStatus', 'failureReason', 'rejectionReason', 'privacyStatus', 'publishAt', 'license', 'embeddable', 'publicStatsViewable', 'madeForKids', 'selfDeclaredMadeForKids', 'containsSyntheticMedia']),
    processing_status: v.processingDetails?.processingStatus ?? null,
    file: object(v.fileDetails) ? { size: v.fileDetails.fileSize ?? null, container: v.fileDetails.container ?? null,
      video_streams: (v.fileDetails.videoStreams ?? []).map((s) => select(s, ['widthPixels', 'heightPixels', 'frameRateFps', 'aspectRatio', 'codec', 'bitrateBps', 'rotation', 'vendor'])),
      audio_streams: (v.fileDetails.audioStreams ?? []).map((s) => select(s, ['channelCount', 'codec', 'bitrateBps', 'vendor'])) } : null,
    content: select(v.contentDetails, ['duration', 'definition', 'caption']) };
}
const playlistProjection = (p) => ({ playlist_id: p.id ?? null, title: p.snippet?.title ?? null, privacy_status: p.status?.privacyStatus ?? null });
const itemProjection = (p) => ({ playlist_item_id: p.id ?? null, video_id: p.snippet?.resourceId?.videoId ?? p.contentDetails?.videoId ?? null,
  title: p.snippet?.title ?? null, position: p.snippet?.position ?? null });
const captionProjection = (c) => ({ caption_id: c.id ?? null, video_id: c.snippet?.videoId ?? null, language: c.snippet?.language ?? null,
  name: c.snippet?.name ?? null, kind: c.snippet?.trackKind ?? null, status: c.snippet?.status ?? null,
  is_draft: c.snippet?.isDraft ?? null, last_updated: c.snippet?.lastUpdated ?? null });
async function list(ctx, path, values, key, project) {
  const answer = await data(ctx, path, values);
  if (stopped(answer)) return answer;
  if (!Array.isArray(answer.items) || !answer.items.every(object)) return unexpected(path);
  return { [key]: answer.items.map(project), ...(typeof answer.nextPageToken === 'string' ? { next_page_token: answer.nextPageToken } : {}) };
}
function committed(answer, total, sentThrough) {
  if (answer.headers?.range === undefined) return 0;
  const m = /^bytes=0-(\d+)$/.exec(answer.headers.range);
  const next = m ? Number(m[1]) + 1 : NaN;
  return Number.isSafeInteger(next) && next > 0 && next <= total && next <= sentThrough ? next : null;
}

// Test injection changes neither action inputs nor the production wait/read path.
export function createModules({ wait = sleep, read = readSync } = {}) {
  function action(run, { titleLimit = 100, fileTypes, maxBytes, minBytes = 0, updating = false } = {}) {
    return async (input, ctx) => {
      const bad = bounds(input, titleLimit);
      if (bad) return bad;
      if (updating && !EDITABLE.some((key) => input[key] !== undefined)) return invalid('input', 'at least one editable field required');
      let file;
      if (fileTypes) {
        file = openFile(input.path, fileTypes, maxBytes, minBytes);
        if (stopped(file)) return file;
      }
      try { return await run(input, ctx, file); }
      finally { if (file) closeSync(file.fd); }
    };
  }
  return {
    channels: {
      mine: action(async (_input, ctx) => {
        const items = await channels(ctx);
        return stopped(items) ? items : { channels: items.map(channelProjection) };
      }),
    },
    videos: {
      upload: action(async (input, ctx, file) => {
        const channel = await checkChannel(input, ctx);
        if (stopped(channel)) return channel;
        const started = Date.now();
        const initial = await uploadProxy(ctx, { endpoint: `${UPLOAD}/videos?uploadType=resumable&part=snippet,status`, method: 'POST',
          body: { snippet: snippet(input), status: { privacyStatus: input.privacy ?? 'private', selfDeclaredMadeForKids: input.made_for_kids } },
          parameters: [{ name: 'X-Upload-Content-Length', value: String(file.size), type: 'header' },
            { name: 'X-Upload-Content-Type', value: file.type, type: 'header' }] });
        if (stopped(initial)) return initial;
        const session = initial?.headers?.location;
        if (typeof session !== 'string' || !session) return { status: 'vendor_error', endpoint: UPLOAD_PATH, method: 'POST', reason: 'no upload session' };
        const buffer = Buffer.alloc(CHUNK);
        const hash = createHash('sha256');
        let offset = 0, hashedThrough = 0, chunks = 0, refusals = 0, consecutive = 0;
        const query = () => uploadProxy(ctx, { endpoint: session, method: 'PUT',
          parameters: [{ name: 'Content-Range', value: `bytes */${file.size}`, type: 'header' }] });
        const finish = (answer) => {
          if (!object(answer?.data) || typeof answer.data.id !== 'string' || hashedThrough !== file.size) return unexpected(UPLOAD_PATH, 'PUT');
          return { video_id: answer.data.id, channel_id: input.channel_id,
            privacy_status: answer.data.status?.privacyStatus ?? null, upload_status: answer.data.status?.uploadStatus ?? null,
            bytes: file.size, sha256: hash.digest('hex'), chunks, refusals, seconds: (Date.now() - started) / 1000 };
        };
        for (;;) {
          let answer;
          if (offset === file.size) answer = await query();
          else {
            const size = Math.min(CHUNK, file.size - offset);
            if (!readPiece(read, file.fd, buffer, offset, size)) return invalid('path', 'file changed');
            // Hash each file byte once, even when a refusal or short commit replays it.
            const end = offset + size;
            if (end > hashedThrough) { hash.update(buffer.subarray(hashedThrough - offset, size)); hashedThrough = end; }
            chunks += 1;
            answer = await uploadProxy(ctx, { endpoint: session, method: 'PUT',
              binary_body: { base64: buffer.subarray(0, size).toString('base64'), content_type: file.type },
              parameters: [{ name: 'Content-Range', value: `bytes ${offset}-${end - 1}/${file.size}`, type: 'header' }] });
          }
          if (answer?.status === 200 || answer?.status === 201) return finish(answer);
          if (answer?.status === 308) {
            const next = committed(answer, file.size, hashedThrough);
            if (next === null) return unexpected(UPLOAD_PATH, 'PUT');
            if (next > offset) {
              consecutive = 0;
              offset = next;
              continue;
            }
            answer = { status: 'vendor_error', endpoint: UPLOAD_PATH, method: 'PUT', reason: 'upload did not advance' };
          } else if (answer?.status !== 'vendor_error' || !(answer.http_status === null || answer.http_status === 0 || answer.http_status === 413 || answer.http_status >= 500)) return answer;
          refusals += 1;
          consecutive += 1;
          if (consecutive > 5) return answer;
          await wait(1000 * (2 ** (consecutive - 1)));
          const status = await query();
          if (stopped(status)) return status;
          if (status?.status === 200 || status?.status === 201) return finish(status);
          if (status?.status !== 308) return unexpected(UPLOAD_PATH, 'PUT');
          const next = committed(status, file.size, hashedThrough);
          if (next === null) return unexpected(UPLOAD_PATH, 'PUT');
          offset = next;
        }
      }, { fileTypes: VIDEO_TYPES, maxBytes: 274877906944, minBytes: 1 }),
      get: action(async (input, ctx) => {
        const answer = await data(ctx, '/videos', { part: 'snippet,status,processingDetails,fileDetails,contentDetails', id: input.video_id });
        if (stopped(answer)) return answer;
        if (!Array.isArray(answer.items) || !object(answer.items[0])) return unexpected('/videos');
        return videoProjection(answer.items[0]);
      }),
      update: action(async (input, ctx) => {
        const channel = await checkChannel(input, ctx);
        if (stopped(channel)) return channel;
        const current = await owned(ctx, '/videos', input.video_id, input.channel_id, 'video_id');
        if (stopped(current)) return current;
        const nextSnippet = snippet(input, current.snippet);
        if (nextSnippet.categoryId === undefined) return unexpected('/videos');
        const status = select(current.status, ['privacyStatus', 'embeddable', 'publicStatsViewable', 'license', 'selfDeclaredMadeForKids', 'containsSyntheticMedia', 'publishAt']);
        if (!Object.hasOwn(status, 'selfDeclaredMadeForKids') && object(current.status) && Object.hasOwn(current.status, 'madeForKids')) {
          status.selfDeclaredMadeForKids = current.status.madeForKids;
        }
        if (input.privacy !== undefined) status.privacyStatus = input.privacy;
        if (status.privacyStatus !== 'private' || !(Date.parse(status.publishAt) > Date.now())) delete status.publishAt;
        const answer = await data(ctx, '/videos', { part: 'snippet,status' }, 'PUT', { id: input.video_id, snippet: nextSnippet, status });
        return stopped(answer) ? answer : videoProjection(answer);
      }, { updating: true }),
      set_thumbnail: action(async (input, ctx, file) => {
        const channel = await checkChannel(input, ctx);
        if (stopped(channel)) return channel;
        if (channel.status?.longUploadsStatus !== 'allowed') return { status: 'vendor_error', field: 'channel_id', reason: 'channel_not_verified', verify_url: 'https://www.youtube.com/verify' };
        const video = await owned(ctx, '/videos', input.video_id, input.channel_id, 'video_id');
        if (stopped(video)) return video;
        const bytes = Buffer.alloc(file.size);
        if (!readPiece(read, file.fd, bytes, 0, file.size)) return invalid('path', 'file changed');
        const answer = await proxy(ctx, { endpoint: `${UPLOAD}/thumbnails/set?videoId=${encodeURIComponent(input.video_id)}&uploadType=media`, method: 'POST',
          binary_body: { base64: bytes.toString('base64'), content_type: file.type } }, '/upload/youtube/v3/thumbnails/set');
        if (stopped(answer)) return answer;
        if (!object(answer?.data)) return unexpected('/upload/youtube/v3/thumbnails/set', 'POST');
        return { video_id: input.video_id, bytes: file.size, sha256: createHash('sha256').update(bytes).digest('hex') };
      }, { fileTypes: IMAGE_TYPES, maxBytes: CHUNK }),
    },
    captions: {
      insert: action(async (input, ctx, file) => {
        const channel = await checkChannel(input, ctx);
        if (stopped(channel)) return channel;
        const video = await owned(ctx, '/videos', input.video_id, input.channel_id, 'video_id');
        if (stopped(video)) return video;
        const bytes = Buffer.alloc(file.size);
        if (!readPiece(read, file.fd, bytes, 0, file.size)) return invalid('path', 'file changed');
        const boundary = `wiser-${randomUUID()}`;
        const meta = { snippet: { videoId: input.video_id, language: input.language, name: input.name ?? '', isDraft: false } };
        const head = Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${file.type}\r\n\r\n`);
        const body = Buffer.concat([head, bytes, Buffer.from(`\r\n--${boundary}--\r\n`)]);
        const answer = await proxy(ctx, { endpoint: `${UPLOAD}/captions?uploadType=multipart&part=snippet`, method: 'POST',
          binary_body: { base64: body.toString('base64'), content_type: `multipart/related; boundary=${boundary}` } }, '/upload/youtube/v3/captions');
        if (stopped(answer)) return answer;
        return object(answer?.data) ? captionProjection(answer.data) : unexpected('/upload/youtube/v3/captions', 'POST');
      }, { fileTypes: CAPTION_TYPES, maxBytes: CHUNK }),
      list: action((input, ctx) => list(ctx, '/captions', { part: 'snippet', videoId: input.video_id }, 'tracks', captionProjection)),
    },
    playlists: {
      create: action(async (input, ctx) => {
        const channel = await checkChannel(input, ctx);
        if (stopped(channel)) return channel;
        const answer = await data(ctx, '/playlists', { part: 'snippet,status' }, 'POST', {
          snippet: { title: input.title, ...(input.description === undefined ? {} : { description: input.description }) }, status: { privacyStatus: input.privacy ?? 'private' } });
        return stopped(answer) ? answer : playlistProjection(answer);
      }, { titleLimit: 150 }),
      list: action((input, ctx) => list(ctx, '/playlists', { part: 'snippet,status,contentDetails', mine: true, maxResults: input.max_results, pageToken: input.page_token }, 'playlists', playlistProjection)),
      add_video: action(async (input, ctx) => {
        const channel = await checkChannel(input, ctx);
        if (stopped(channel)) return channel;
        const playlist = await owned(ctx, '/playlists', input.playlist_id, input.channel_id, 'playlist_id');
        if (stopped(playlist)) return playlist;
        const video = await owned(ctx, '/videos', input.video_id, input.channel_id, 'video_id');
        if (stopped(video)) return video;
        const answer = await data(ctx, '/playlistItems', { part: 'snippet' }, 'POST', { snippet: { playlistId: input.playlist_id,
          resourceId: { kind: 'youtube#video', videoId: input.video_id }, ...(input.position === undefined ? {} : { position: input.position }) } });
        return stopped(answer) ? answer : itemProjection(answer);
      }),
      list_items: action((input, ctx) => list(ctx, '/playlistItems', { part: 'snippet,contentDetails', playlistId: input.playlist_id, maxResults: input.max_results, pageToken: input.page_token }, 'items', itemProjection)),
      remove_item: action(async (input, ctx) => {
        const channel = await checkChannel(input, ctx);
        if (stopped(channel)) return channel;
        const item = await owned(ctx, '/playlistItems', input.playlist_item_id, input.channel_id, 'playlist_item_id', 'snippet');
        if (stopped(item)) return item;
        if (typeof item.snippet.playlistId !== 'string') return unexpected('/playlistItems');
        const playlist = await owned(ctx, '/playlists', item.snippet.playlistId, input.channel_id, 'playlist_item_id');
        if (stopped(playlist)) return playlist;
        const answer = await proxy(ctx, { endpoint: endpoint('/playlistItems', { id: input.playlist_item_id }), method: 'DELETE' });
        return stopped(answer) ? answer : { playlist_item_id: input.playlist_item_id, removed: true };
      }),
    },
  };
}
export const modules = createModules();
