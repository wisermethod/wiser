// The youtube connector, held to its approved plan's rules that a builder could most
// easily miss (zBuilds playbooks/gates/production-studio/2026-10-21-m3-youtube-plan.md):
// every write refused before any write call when the signed-in channel or the resource's
// owner is not the caller's; a video never read more than one 3 MiB chunk at a time; the
// upload session address in no result and no audit line; nothing written to the console.
// Written apart from the implementation, against the plan. Invented data only.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import fs, { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { confirmCall, createTestGateway, makeHome, putActive } from '../../../gateway/test/fake-provider.js';

const CHUNK = 3145728;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const randomId = (n) => Array.from(randomBytes(n), (b) => ALPHABET[b % 64]).join('');
const CHANNEL = `UC${randomId(22)}`;
const OTHER = `UC${randomId(22)}`;
const UPLOAD_ID = randomId(64);
const LOCATION = `https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status&upload_id=${UPLOAD_ID}`;
const VIDEO_ID = randomId(11);
const PLAYLIST_ID = `PL${randomId(32)}`;
const ITEM_ID = randomId(40);
const MODULES = ['channels', 'videos', 'captions', 'playlists'];
const HERE = dirname(fileURLToPath(import.meta.url));

function pick(raw, names) {
  if (!Array.isArray(names) || names.length === 0) return undefined;
  const out = {};
  for (const [k, v] of Object.entries(raw)) if (names.includes(k.toLowerCase())) out[k.toLowerCase()] = v;
  return out;
}

function holdsRun(text, id = UPLOAD_ID, run = 16) {
  for (let i = 0; i + run <= id.length; i += 1) if (text.includes(id.slice(i, i + run))) return true;
  return false;
}

function paramValue(req, name) {
  const p = Array.isArray(req.parameters) ? req.parameters.find((x) => String(x.name).toLowerCase() === name.toLowerCase()) : null;
  return p ? String(p.value) : null;
}

// A simulated YouTube behind the gateway's fake provider. signedIn and owner set who
// the channel read and the resource reads name; refuseAt makes one chunk at that offset
// answer the provider's 413 once.
function fakeYouTube({ signedIn = CHANNEL, owner = CHANNEL, refuseAt = null } = {}) {
  const calls = [];
  const pieces = [];
  let receivedBytes = 0;
  let total = 0;
  let refused = false;
  const proxy = async (req) => {
    calls.push({ endpoint: req.endpoint, method: req.method, response_headers: req.response_headers });
    const ep = String(req.endpoint);
    if (req.method === 'GET' && ep.startsWith('/channels')) {
      return { status: 200, data: { items: signedIn === null ? [] : [{ id: signedIn, snippet: { title: 'Invented channel', customUrl: '@invented' }, status: { longUploadsStatus: 'allowed', privacyStatus: 'public', isLinked: true } }] } };
    }
    if (req.method === 'GET' && ep.startsWith('/videos')) {
      return { status: 200, data: { items: [{ id: VIDEO_ID, snippet: { channelId: owner, title: 'Invented', description: '', categoryId: '27', tags: [] }, status: { privacyStatus: 'unlisted', uploadStatus: 'processed' } }] } };
    }
    if (req.method === 'GET' && ep.startsWith('/playlists')) {
      return { status: 200, data: { items: [{ id: PLAYLIST_ID, snippet: { channelId: owner, title: 'Invented list' }, status: { privacyStatus: 'private' } }] } };
    }
    if (req.method === 'GET' && ep.startsWith('/playlistItems')) {
      return { status: 200, data: { items: [{ id: ITEM_ID, snippet: { playlistId: PLAYLIST_ID, channelId: owner, resourceId: { kind: 'youtube#video', videoId: VIDEO_ID } } }] } };
    }
    if (req.method === 'POST' && ep.startsWith('https://www.googleapis.com/upload/youtube/v3/videos')) {
      total = Number(paramValue(req, 'X-Upload-Content-Length'));
      const h = pick({ Location: LOCATION, 'Set-Cookie': 'sid=invented' }, req.response_headers);
      return h ? { status: 200, data: {}, headers: h } : { status: 200, data: {} };
    }
    if (req.method === 'PUT' && ep === LOCATION) {
      const range = paramValue(req, 'Content-Range') || '';
      if (/^bytes \*\//.test(range)) {
        const h = pick({ Range: `bytes=0-${receivedBytes - 1}` }, req.response_headers);
        return { status: 308, data: '', ...(h ? { headers: h } : {}) };
      }
      const m = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(range);
      assert.ok(m, `a chunk without a usable Content-Range: ${range}`);
      const first = Number(m[1]);
      if (refuseAt !== null && first === refuseAt && !refused) {
        refused = true;
        return { status: 413, error: { code: 'vendor_error', endpoint: req.endpoint, method: 'PUT' } };
      }
      assert.equal(first, receivedBytes, 'a chunk did not start where the last commit ended');
      const bytes = Buffer.from(req.binary_body.base64, 'base64');
      pieces.push(bytes);
      receivedBytes += bytes.length;
      if (receivedBytes < total) {
        const h = pick({ Range: `bytes=0-${receivedBytes - 1}` }, req.response_headers);
        return { status: 308, data: '', ...(h ? { headers: h } : {}) };
      }
      return { status: 200, data: { id: VIDEO_ID, snippet: { channelId: signedIn, title: 'Invented' }, status: { privacyStatus: 'unlisted', uploadStatus: 'uploaded' } } };
    }
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') {
      return { status: 200, data: { id: 'written-invented', snippet: { channelId: signedIn } } };
    }
    return { status: 404, error: { code: 'vendor_error', endpoint: req.endpoint, method: req.method } };
  };
  return { proxy, calls, received: () => Buffer.concat(pieces) };
}

const writes = (calls) => calls.filter((c) => c.method !== 'GET');

async function setup(t, yt) {
  const home = makeHome();
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const state = await createTestGateway({ home, session: false });
  state.fake.auth.proxy = yt.proxy;
  state.fake.catalog.execute = async () => assert.fail('a youtube action reached the catalog');
  for (const module of MODULES) await putActive(state.store, state.fake, { service: 'youtube', module, privilege: 'write' });
  return state;
}

function tempFile(t, name, bytes) {
  const dir = mkdtempSync(join(tmpdir(), 'yt-withheld-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, name);
  writeFileSync(path, bytes);
  return path;
}

function writeCases(t) {
  const video = tempFile(t, 'clip.mp4', randomBytes(1024));
  const thumb = tempFile(t, 'thumb.jpg', randomBytes(2048));
  const subs = tempFile(t, 'subs.srt', Buffer.from('1\n00:00:00,000 --> 00:00:01,000\nInvented\n'));
  return [
    ['youtube.videos.upload', { channel_id: CHANNEL, path: video, title: 'Invented', category_id: '27', made_for_kids: false, privacy: 'unlisted' }, false],
    ['youtube.videos.update', { channel_id: CHANNEL, video_id: VIDEO_ID, title: 'Invented again' }, true],
    ['youtube.videos.set_thumbnail', { channel_id: CHANNEL, video_id: VIDEO_ID, path: thumb }, true],
    ['youtube.captions.insert', { channel_id: CHANNEL, video_id: VIDEO_ID, path: subs, language: 'en' }, true],
    ['youtube.playlists.create', { channel_id: CHANNEL, title: 'Invented list' }, false],
    ['youtube.playlists.add_video', { channel_id: CHANNEL, playlist_id: PLAYLIST_ID, video_id: VIDEO_ID }, true],
    ['youtube.playlists.remove_item', { channel_id: CHANNEL, playlist_item_id: ITEM_ID }, true],
  ];
}

test('R4: every write is refused before any write call when the signed-in channel is another', async (t) => {
  for (const [action, input] of writeCases(t)) {
    for (const signedIn of [OTHER, null]) {
      const yt = fakeYouTube({ signedIn });
      const state = await setup(t, yt);
      const result = await confirmCall(state.gw, { action, input });
      assert.equal(result.status, 'invalid_arguments', `${action} with ${signedIn ? 'another channel' : 'no channel'}: ${JSON.stringify(result).slice(0, 200)}`);
      assert.equal(result.field, 'channel_id', action);
      assert.deepEqual(writes(yt.calls), [], `${action} made a write call`);
    }
  }
});

test('R4: a write on a video, playlist or item another channel owns is refused before any write call', async (t) => {
  for (const [action, input, onResource] of writeCases(t)) {
    if (!onResource) continue;
    const yt = fakeYouTube({ owner: OTHER });
    const state = await setup(t, yt);
    const result = await confirmCall(state.gw, { action, input });
    assert.ok(typeof result.status === 'string' && result.status !== 'ok', `${action} went ahead: ${JSON.stringify(result).slice(0, 200)}`);
    assert.deepEqual(writes(yt.calls), [], `${action} made a write call`);
  }
});

function watchReads(videoPath) {
  const seen = { maxRead: 0, whole: [], streams: [] };
  const fds = new Set();
  seen.maxAlloc = 0;
  const allocs = { alloc: Buffer.alloc, allocUnsafe: Buffer.allocUnsafe, allocUnsafeSlow: Buffer.allocUnsafeSlow };
  for (const name of Object.keys(allocs)) {
    Buffer[name] = function (size, ...rest) { if (typeof size === 'number') seen.maxAlloc = Math.max(seen.maxAlloc, size); return allocs[name].call(this, size, ...rest); };
  }
  const original = { openSync: fs.openSync, readSync: fs.readSync, readFileSync: fs.readFileSync, read: fs.read, createReadStream: fs.createReadStream, promisesReadFile: fs.promises.readFile };
  fs.openSync = function (path, ...rest) {
    const fd = original.openSync.call(this, path, ...rest);
    if (String(path) === videoPath) fds.add(fd);
    return fd;
  };
  fs.readSync = function (fd, buffer, offsetOrOptions, length, position) {
    if (fds.has(fd)) {
      let want;
      if (typeof offsetOrOptions === 'object' && offsetOrOptions !== null) want = offsetOrOptions.length ?? (buffer.length - (offsetOrOptions.offset ?? 0));
      else want = typeof length === 'number' ? length : buffer.length - (offsetOrOptions ?? 0);
      seen.maxRead = Math.max(seen.maxRead, want);
    }
    return original.readSync.call(this, fd, buffer, offsetOrOptions, length, position);
  };
  fs.readFileSync = function (path, ...rest) {
    if (String(path) === videoPath || (typeof path === 'number' && fds.has(path))) seen.whole.push('readFileSync');
    return original.readFileSync.call(this, path, ...rest);
  };
  fs.read = function (fd, ...rest) {
    if (fds.has(fd)) seen.whole.push('async read');
    return original.read.call(this, fd, ...rest);
  };
  fs.createReadStream = function (path, opts) {
    if (String(path) === videoPath) seen.streams.push(opts?.highWaterMark ?? 65536);
    return original.createReadStream.call(this, path, opts);
  };
  fs.promises.readFile = function (path, ...rest) {
    if (String(path) === videoPath) seen.whole.push('promises.readFile');
    return original.promisesReadFile.call(this, path, ...rest);
  };
  syncBuiltinESMExports();
  return {
    seen,
    restore() {
      fs.openSync = original.openSync; fs.readSync = original.readSync; fs.readFileSync = original.readFileSync;
      fs.read = original.read; fs.createReadStream = original.createReadStream; fs.promises.readFile = original.promisesReadFile;
      for (const name of Object.keys(allocs)) Buffer[name] = allocs[name];
      syncBuiltinESMExports();
    },
  };
}

test('R6: an upload reads the file one chunk of at most 3 MiB at a time, and YouTube receives it whole', async (t) => {
  const bytes = randomBytes(3 * CHUNK + 12345);
  const path = tempFile(t, 'long.mp4', bytes);
  const yt = fakeYouTube();
  const state = await setup(t, yt);
  const watch = watchReads(path);
  let result;
  try {
    result = await confirmCall(state.gw, { action: 'youtube.videos.upload', input: { channel_id: CHANNEL, path, title: 'Invented', category_id: '27', made_for_kids: false, privacy: 'unlisted' } });
  } finally {
    watch.restore();
  }
  assert.equal(result.video_id, VIDEO_ID, JSON.stringify(result).slice(0, 300));
  assert.deepEqual(watch.seen.whole, [], 'the video was read whole');
  // The module may bind readSync at load, out of this watch's reach; the largest buffer
  // allocated during the call is the measure that holds either way.
  assert.ok(watch.seen.maxRead <= CHUNK, `a read of ${watch.seen.maxRead} bytes`);
  assert.ok(watch.seen.maxAlloc > 0, 'no allocation was seen');
  assert.ok(watch.seen.maxAlloc <= CHUNK, `an allocation of ${watch.seen.maxAlloc} bytes, more than one chunk`);
  assert.ok(watch.seen.streams.every((hwm) => hwm <= CHUNK), 'a stream reads more than a chunk at a time');
  assert.ok(yt.received().equals(bytes), 'YouTube did not receive the file as it is');
  assert.equal(result.sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.equal(result.bytes, bytes.length);
  const chunkCalls = yt.calls.filter((c) => c.endpoint === LOCATION && c.method === 'PUT');
  assert.equal(chunkCalls.length, 4, 'not four chunks for three full chunks and a remainder');
});

for (const refuseAt of [null, CHUNK]) {
  test(`R5: the session address is in no result and no audit line (${refuseAt === null ? 'clean run' : 'one refused chunk'})`, async (t) => {
    const bytes = randomBytes(2 * CHUNK + 777);
    const path = tempFile(t, 'clip.mp4', bytes);
    const yt = fakeYouTube({ refuseAt });
    const state = await setup(t, yt);
    const result = await confirmCall(state.gw, { action: 'youtube.videos.upload', input: { channel_id: CHANNEL, path, title: 'Invented', category_id: '27', made_for_kids: false, privacy: 'unlisted' } });
    assert.equal(result.video_id, VIDEO_ID, JSON.stringify(result).slice(0, 300));
    assert.ok(yt.received().equals(bytes), 'YouTube did not receive the file as it is');
    const text = JSON.stringify(result) + readFileSync(state.audit.file, 'utf8');
    assert.equal(text.includes(LOCATION), false, 'the address');
    assert.equal(text.includes('upload_id'), false, 'the upload id parameter');
    assert.equal(holdsRun(text), false, 'a run of the upload id');
    assert.equal(JSON.stringify(result).includes('googleapis'), false, 'the address host');
    const declared = yt.calls.filter((c) => Array.isArray(c.response_headers) && c.response_headers.length > 0);
    assert.ok(declared.length > 0, 'the upload never asked for its headers');
    for (const c of declared) assert.deepEqual([...c.response_headers].sort(), ['location', 'range']);
  });
}

test('No console: the module source calls no console method and writes nothing to stdout or stderr', () => {
  const dir = join(HERE, '..');
  const sources = readdirSync(dir).filter((f) => f.endsWith('.js') || f.endsWith('.mjs'));
  assert.ok(sources.includes('index.js'));
  for (const f of sources) {
    const src = readFileSync(join(dir, f), 'utf8');
    assert.equal(/\bconsole\s*\./.test(src), false, `${f} calls console`);
    assert.equal(/process\s*\.\s*(stdout|stderr)/.test(src), false, `${f} writes to stdout or stderr`);
    assert.equal(/\b(writeFileSync|appendFileSync|createWriteStream|writeSync|writeFile)\b/.test(src), false, `${f} writes a file`);
  }
});

test('No console: an upload and every write call no console method', async (t) => {
  const spied = [];
  const original = {};
  for (const m of ['log', 'info', 'warn', 'error', 'debug', 'trace']) {
    original[m] = console[m];
    console[m] = (...args) => { spied.push(m); };
  }
  try {
    for (const [action, input] of writeCases(t)) {
      const yt = fakeYouTube();
      const state = await setup(t, yt);
      await confirmCall(state.gw, { action, input });
    }
  } finally {
    for (const m of Object.keys(original)) console[m] = original[m];
  }
  assert.deepEqual(spied, []);
});
