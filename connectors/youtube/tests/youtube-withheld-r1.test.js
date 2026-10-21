// The youtube connector, the cases its adversarial review round 1 found open (Grok run
// 20261021-041549): videos.update sending read-only fields back, and an upload that never
// ends on a 308 that does not advance. Written apart from the implementation. Invented data.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { confirmCall, createTestGateway, makeHome, putActive } from '../../../gateway/test/fake-provider.js';
import { createModules } from '../index.js';

const CHUNK = 3145728;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const randomId = (n) => Array.from(randomBytes(n), (b) => ALPHABET[b % 64]).join('');
const CHANNEL = `UC${randomId(22)}`;
const VIDEO_ID = randomId(11);
const LOCATION = `https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status&upload_id=${randomId(64)}`;
const SNIPPET_WRITABLE = ['title', 'description', 'tags', 'categoryId', 'defaultLanguage', 'defaultAudioLanguage'];
const STATUS_WRITABLE = ['privacyStatus', 'embeddable', 'publicStatsViewable', 'license', 'selfDeclaredMadeForKids', 'containsSyntheticMedia', 'publishAt'];
const MODULES = ['channels', 'videos', 'captions', 'playlists'];

function channelAnswer() {
  return { status: 200, data: { items: [{ id: CHANNEL, snippet: { title: 'Invented' }, status: { longUploadsStatus: 'allowed' } }] } };
}

function currentVideo({ privacy = 'private', publishAt } = {}) {
  return {
    id: VIDEO_ID,
    snippet: {
      publishedAt: '2026-10-20T00:00:00Z', channelId: CHANNEL, title: 'Invented', description: 'Invented', tags: ['a'],
      categoryId: '27', defaultLanguage: 'en', defaultAudioLanguage: 'en', channelTitle: 'Invented', liveBroadcastContent: 'none',
      thumbnails: { default: { url: 'https://i.ytimg.invalid/x.jpg', width: 120, height: 90 } }, localized: { title: 'Invented', description: 'Invented' },
    },
    status: {
      uploadStatus: 'processed', failureReason: undefined, privacyStatus: privacy, license: 'youtube', embeddable: true,
      publicStatsViewable: true, madeForKids: false, selfDeclaredMadeForKids: false, ...(publishAt ? { publishAt } : {}),
    },
  };
}

async function setup(t, proxy) {
  const home = makeHome();
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const state = await createTestGateway({ home, session: false });
  state.fake.auth.proxy = proxy;
  state.fake.catalog.execute = async () => assert.fail('a youtube action reached the catalog');
  for (const module of MODULES) await putActive(state.store, state.fake, { service: 'youtube', module, privilege: 'write' });
  return state;
}

function updateProxy(video, sink) {
  return async (req) => {
    const ep = String(req.endpoint);
    if (req.method === 'GET' && ep.startsWith('/channels')) return channelAnswer();
    if (req.method === 'GET' && ep.startsWith('/videos')) return { status: 200, data: { items: [video] } };
    if (req.method === 'PUT' && ep.startsWith('/videos')) { sink.push(req.body); return { status: 200, data: { ...video, ...req.body } }; }
    return { status: 404, error: { code: 'vendor_error', endpoint: req.endpoint, method: req.method } };
  };
}

test('U1: videos.update sends only writable snippet and status fields', async (t) => {
  const sink = [];
  const state = await setup(t, updateProxy(currentVideo(), sink));
  await confirmCall(state.gw, { action: 'youtube.videos.update', input: { channel_id: CHANNEL, video_id: VIDEO_ID, title: 'Invented again' } });
  assert.equal(sink.length, 1, 'no update was sent');
  const body = sink[0];
  for (const key of Object.keys(body.snippet ?? {})) assert.ok(SNIPPET_WRITABLE.includes(key), `snippet sent read-only ${key}`);
  for (const key of Object.keys(body.status ?? {})) assert.ok(STATUS_WRITABLE.includes(key), `status sent read-only ${key}`);
  assert.equal(body.snippet.title, 'Invented again');
  assert.equal(body.snippet.categoryId, '27', 'the required categoryId was dropped');
  assert.equal(body.snippet.description, 'Invented', 'an unchanged field was dropped');
  assert.equal(body.status.selfDeclaredMadeForKids, false, 'made-for-kids was not kept');
});

test('U2: making a scheduled video public drops its publishAt', async (t) => {
  const sink = [];
  const future = new Date(Date.now() + 7 * 864e5).toISOString();
  const state = await setup(t, updateProxy(currentVideo({ privacy: 'private', publishAt: future }), sink));
  await confirmCall(state.gw, { action: 'youtube.videos.update', input: { channel_id: CHANNEL, video_id: VIDEO_ID, privacy: 'public' } });
  assert.equal(sink.length, 1);
  assert.equal(sink[0].status.privacyStatus, 'public');
  assert.equal(Object.hasOwn(sink[0].status, 'publishAt'), false, 'publishAt sent with public');
});

test('U3: a past publishAt is not sent back on a title edit', async (t) => {
  const sink = [];
  const past = new Date(Date.now() - 7 * 864e5).toISOString();
  const state = await setup(t, updateProxy(currentVideo({ privacy: 'private', publishAt: past }), sink));
  await confirmCall(state.gw, { action: 'youtube.videos.update', input: { channel_id: CHANNEL, video_id: VIDEO_ID, title: 'Invented again' } });
  assert.equal(sink.length, 1);
  assert.equal(Object.hasOwn(sink[0].status ?? {}, 'publishAt'), false, 'a past publishAt was sent');
});

function stallProxy(kind, counter) {
  let total = 0;
  return async (req) => {
    const ep = String(req.endpoint);
    if (req.method === 'GET' && ep.startsWith('/channels')) return channelAnswer();
    if (req.method === 'POST' && ep.startsWith('https://www.googleapis.com/upload/youtube/v3/videos')) {
      total = Number(req.parameters.find((p) => p.name === 'X-Upload-Content-Length').value);
      return { status: 200, data: {}, headers: { location: LOCATION } };
    }
    if (req.method === 'PUT' && ep === LOCATION) {
      counter.puts += 1;
      if (counter.puts > 50) throw new Error('the upload did not stop');
      if (kind === 'no-range') return { status: 308, data: '' };
      if (kind === 'same-range') return { status: 308, data: '', headers: { range: `bytes=0-${CHUNK - 1}` } };
      if (kind === 'whole-308') {
        const range = req.parameters.find((p) => p.name === 'Content-Range').value;
        if (range.startsWith('bytes */')) return { status: 201, data: { id: VIDEO_ID, status: { privacyStatus: 'unlisted', uploadStatus: 'uploaded' } } };
        const end = Number(/^bytes \d+-(\d+)\//.exec(range)[1]);
        return { status: 308, data: '', headers: { range: `bytes=0-${end}` } };
      }
    }
    return { status: 404, error: { code: 'vendor_error', endpoint: req.endpoint, method: req.method } };
  };
}

async function runUpload(t, kind, bytes) {
  const dir = mkdtempSync(join(tmpdir(), 'yt-r1-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'clip.mp4');
  writeFileSync(path, bytes);
  const counter = { puts: 0 };
  const proxy = stallProxy(kind, counter);
  const waits = [];
  const modules = createModules({ wait: async (ms) => { waits.push(ms); } });
  const input = { channel_id: CHANNEL, path, title: 'Invented', category_id: '27', made_for_kids: false, privacy: 'unlisted' };
  const ctx = { proxy: async (req) => { const res = await proxy({ ...req, response_headers: ['location', 'range'] }); if (res.error) throw Object.assign(new Error('refused'), { object: { status: 'vendor_error', http_status: res.status } }); return res; } };
  const result = await modules.videos.upload(input, ctx);
  return { result, counter, waits };
}

for (const kind of ['no-range', 'same-range']) {
  test(`U4: a 308 that never advances (${kind}) ends the call after a bounded number of tries, with backoff`, async (t) => {
    const bytes = randomBytes(2 * CHUNK + 5);
    const { result, counter, waits } = await runUpload(t, kind, bytes);
    assert.ok(counter.puts <= 12, `${counter.puts} chunk calls`);
    assert.ok(typeof result.status === 'string', `the call did not end in a status: ${JSON.stringify(result).slice(0, 200)}`);
    assert.equal(Object.hasOwn(result, 'video_id'), false);
    assert.ok(waits.length >= 1, 'no backoff between stalled tries');
  });
}

test('U5: a 308 whose range covers the whole file is followed by a status query, and its 201 returns the video once', async (t) => {
  const bytes = randomBytes(CHUNK + 9);
  const { result, counter } = await runUpload(t, 'whole-308', bytes);
  assert.equal(result.video_id, VIDEO_ID, JSON.stringify(result).slice(0, 200));
  assert.ok(counter.puts <= 4, `${counter.puts} calls`);
});
