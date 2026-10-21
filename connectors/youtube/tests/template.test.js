import { createHash } from 'node:crypto';
import { linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, truncateSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createModules } from '../index.js';
import { confirmCall, createTestGateway, putActive } from '../../../gateway/test/fake-provider.js';

const CHANNEL = 'UCabcdefghijklmnopqrstuv';
const OTHER = 'UCzyxwvutsrqponmlkjihgfe';
const VIDEO = 'abcdefghijk';
const PLAYLIST = 'PLexample123';
const ITEM = 'item123456';
const CHUNK = 3145728;
const SESSION = `https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=${'invented-session-'.repeat(5)}`;
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const channel = (id = CHANNEL, allowed = 'allowed') => ({ id, snippet: { title: 'Invented channel', customUrl: '@invented' }, status: { privacyStatus: 'public', longUploadsStatus: allowed, isLinked: true } });
const snippet = { channelId: CHANNEL, publishedAt: '2026-01-01T00:00:00Z', channelTitle: 'Invented channel', liveBroadcastContent: 'none',
  title: 'Before', description: 'Keep description', tags: ['keep'], categoryId: '27', defaultLanguage: 'en', defaultAudioLanguage: 'en',
  localized: { title: 'Keep localized' }, thumbnails: { default: { url: 'https://example.invalid/image' } } };
const video = () => ({ id: VIDEO, snippet: structuredClone(snippet), status: { privacyStatus: 'private', uploadStatus: 'uploaded', embeddable: true, selfDeclaredMadeForKids: false }, ignored: 'not projected' });
const inputs = (files) => ({
 'channels.mine': {},
 'videos.upload': { channel_id: CHANNEL, path: files.mp4, title: 'Invented video', category_id: '27', made_for_kids: false },
 'videos.get': { video_id: VIDEO },
 'videos.update': { channel_id: CHANNEL, video_id: VIDEO, title: 'After' },
 'videos.set_thumbnail': { channel_id: CHANNEL, video_id: VIDEO, path: files.jpg },
 'captions.insert': { channel_id: CHANNEL, video_id: VIDEO, path: files.srt, language: 'en' },
 'captions.list': { video_id: VIDEO },
 'playlists.create': { channel_id: CHANNEL, title: 'Invented playlist' },
 'playlists.list': {},
 'playlists.add_video': { channel_id: CHANNEL, playlist_id: PLAYLIST, video_id: VIDEO },
 'playlists.list_items': { playlist_id: PLAYLIST },
 'playlists.remove_item': { channel_id: CHANNEL, playlist_item_id: ITEM },
});
const WRITES = ['videos.upload', 'videos.update', 'videos.set_thumbnail', 'captions.insert', 'playlists.create', 'playlists.add_video', 'playlists.remove_item'];

async function setup(t, { active = true, failures = [], channelItems = [channel()], size = CHUNK * 2 + 29 } = {}) {
  const home = mkdtempSync(join(tmpdir(), 'youtube-test-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const files = {};
  for (const [ext, bytes] of Object.entries({ mp4: Buffer.alloc(size, 71), jpg: Buffer.from([255, 216, 255, 1, 2, 3]), srt: Buffer.from('1\n00:00:00,000 --> 00:00:01,000\nInvented words\n') })) {
    files[ext] = join(home, `fixture.${ext}`);
    writeFileSync(files[ext], bytes);
  }
  const state = await createTestGateway({ home, session: false });
  const waits = [];
  state.gw.connectors = state.connectors.map((c) => c.id === 'youtube' ? { ...c, impl: { modules: createModules({ wait: async (ms) => { waits.push(ms); } }) } } : c);
  const api = { calls: [], ranges: [], queries: 0, writes: [], channelItems, video: video(), playlistOwner: CHANNEL, itemOwner: CHANNEL,
    total: 0, committed: 0, received: Buffer.alloc(size), dataAttempts: 0, failures: [...failures], noRangeOnce: false,
    initHeaders: { location: SESSION }, rawAnswer: undefined, queryFailure: false, finishOnQuery: false };
  state.fake.catalog.execute = async () => assert.fail('YouTube must not call catalog');
  state.fake.auth.proxy = async (request) => {
    api.calls.push(request);
    const u = new URL(request.endpoint, 'https://www.googleapis.com/youtube/v3/');
    const route = u.pathname.split('/').at(-1);
    const response = (body, status = 200, headers = {}) => ({ status, data: structuredClone(body), headers });
    if (request.method === 'GET') {
      if (api.rawAnswer !== undefined) return response(api.rawAnswer);
      if (route === 'channels') return response({ items: api.channelItems });
      if (route === 'videos') return response({ items: [api.video] });
      if (route === 'playlists') return response({ items: [{ id: PLAYLIST, snippet: { channelId: api.playlistOwner, title: 'Invented playlist' }, status: { privacyStatus: 'private' }, ignored: 'drop' }], nextPageToken: 'invented-next' });
      if (route === 'playlistItems') return response({ items: [{ id: ITEM, snippet: { channelId: api.itemOwner, playlistId: PLAYLIST, title: 'Invented item', position: 2, resourceId: { videoId: VIDEO } }, ignored: 'drop' }], nextPageToken: 'items-next' });
      if (route === 'captions') return response({ items: [{ id: 'caption123', snippet: { videoId: VIDEO, language: 'en', name: 'English', trackKind: 'standard', status: 'serving', isDraft: false }, ignored: 'drop' }] });
    }
    if (request.endpoint === SESSION) {
      const range = request.parameters.find((p) => p.name === 'Content-Range');
      assert.equal(range.type, 'header');
      if (!request.binary_body) {
        api.queries += 1;
        assert.equal(range.value, `bytes */${api.total}`);
        if (api.queryFailure) return { status: 503, error: { code: 'vendor_error', endpoint: request.endpoint, method: 'PUT' } };
        if (api.finishOnQuery && api.committed === api.total) return response(api.video, 201);
        return response('', 308, api.committed ? { range: `bytes=0-${api.committed - 1}` } : {});
      }
      api.ranges.push(range.value);
      api.dataAttempts += 1;
      const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(range.value);
      assert.ok(match);
      const [start, end, total] = match.slice(1).map(Number);
      const bytes = Buffer.from(request.binary_body.base64, 'base64');
      assert.equal(start, api.committed);
      assert.equal(total, api.total);
      assert.equal(end, start + bytes.length - 1);
      assert.equal(bytes.length, Math.min(CHUNK, total - start));
      assert.equal(request.binary_body.content_type, 'video/mp4');
      const planned = api.failures.find((f) => f.at === api.dataAttempts);
      if (planned) {
        const keep = planned.keep ?? 0;
        bytes.copy(api.received, start, 0, keep);
        api.committed += keep;
        if (planned.transport) throw new Error('invented transport failure');
        if (planned.status === 308) return response('', 308, planned.noRange ? {} : { range: `bytes=0-${api.committed - 1}` });
        return { status: planned.status ?? 503, error: { code: 'vendor_error', endpoint: request.endpoint, method: 'PUT', provider_codes: [17, 'discard', 17] } };
      }
      if (api.noRangeOnce) { api.noRangeOnce = false; return response('', 308); }
      bytes.copy(api.received, start);
      api.committed = end + 1;
      return api.committed === total ? response(api.video, 201) : response('', 308, { range: `bytes=0-${api.committed - 1}` });
    }
    api.writes.push(request);
    if (u.pathname.endsWith('/videos') && request.method === 'POST') {
      api.total = Number(request.parameters.find((p) => p.name === 'X-Upload-Content-Length').value);
      assert.equal(request.parameters.find((p) => p.name === 'X-Upload-Content-Type').value, 'video/mp4');
      return response('', 200, api.initHeaders);
    }
    if (route === 'videos') return response({ ...api.video, ...request.body });
    if (route === 'set') return response({ items: [{ default: { url: 'https://example.invalid/thumb', width: 100, height: 100 } }] });
    if (route === 'captions') return response({ id: 'caption123', snippet: { videoId: VIDEO, language: 'en', isDraft: false, status: 'serving' } });
    if (route === 'playlists') return response({ id: PLAYLIST, ...request.body });
    if (route === 'playlistItems') return request.method === 'DELETE' ? response(null, 204) : response({ id: ITEM, ...request.body });
    assert.fail(`unexpected invented API request ${request.method} ${route}`);
  };
  if (active) for (const module of ['channels', 'videos', 'captions', 'playlists']) await putActive(state.store, state.fake, { service: 'youtube', module });
  const call = (action, input = inputs(files)[action]) => confirmCall(state.gw, { action: `youtube.${action}`, input });
  return { ...state, files, api, waits, call };
}

for (const action of Object.keys(inputs({}))) {
  test(`${action}: needs_connect without a grant`, async (t) => {
    const s = await setup(t, { active: false, size: 1 });
    const got = await s.call(action);
    assert.equal(got.status, 'needs_connect');
    assert.equal(got.privilege, 'write');
    assert.equal(s.api.calls.length, 0);
  });
}
for (const action of WRITES) {
  test(`${action}: always stops for confirmation naming channel_id`, async (t) => {
    const s = await setup(t, { size: 1 });
    const stop = await s.gw.execute({ action: `youtube.${action}`, input: inputs(s.files)[action] });
    assert.equal(stop.status, 'needs_confirmation');
    assert.ok(stop.summary.includes(CHANNEL));
    assert.equal(s.api.calls.length, 0);
    await s.call(action);
    assert.ok(s.api.writes.length);
    assert.equal((await s.gw.execute({ action: `youtube.${action}`, input: inputs(s.files)[action] })).status, 'needs_confirmation');
  });
  for (const [name, items] of [['no channel', []], ['two channels', [channel(), channel(OTHER)]], ['different channel', [channel(OTHER)]]]) {
    test(`${action}: ${name} prevents every write`, async (t) => {
      const s = await setup(t, { channelItems: items, size: 1 });
      const got = await s.call(action);
      assert.equal(got.status, 'invalid_arguments');
      assert.equal(got.field, 'channel_id');
      assert.equal(got.reason, 'not the signed-in channel');
      assert.deepEqual(got.signed_in_channels, items.map((c) => ({ channel_id: c.id, title: c.snippet.title })));
      assert.equal(s.api.calls.length, 1);
      assert.equal(s.api.writes.length, 0);
    });
  }
}
for (const action of ['videos.update', 'videos.set_thumbnail', 'captions.insert', 'playlists.add_video', 'playlists.remove_item']) {
  test(`${action}: another resource owner prevents writes`, async (t) => {
    const s = await setup(t, { size: 1 });
    s.api.video.snippet.channelId = OTHER;
    s.api.playlistOwner = OTHER;
    s.api.itemOwner = OTHER;
    assert.equal((await s.call(action)).status, 'invalid_arguments');
    assert.equal(s.api.writes.length, 0);
  });
}
test('add_video checks video owner after playlist owner, remove_item checks playlist owner after item owner', async (t) => {
  for (const action of ['playlists.add_video', 'playlists.remove_item']) {
    const s = await setup(t, { size: 1 });
    if (action === 'playlists.add_video') s.api.video.snippet.channelId = OTHER;
    else s.api.playlistOwner = OTHER;
    assert.equal((await s.call(action)).status, 'invalid_arguments');
    assert.equal(s.api.calls.length, 3);
    assert.equal(s.api.writes.length, 0);
  }
});
for (const [name, failures, expected] of [
  ['clean', [], 0],
  ['midway short commit', [{ at: 2, keep: 262144, status: 413 }], 1],
  ['first chunk refused', [{ at: 1, status: 413 }], 1],
  ['transport refused', [{ at: 1, transport: true }], 1],
  ['five consecutive refusals', Array.from({ length: 5 }, (_, i) => ({ at: i + 1 })), 5],
  ['six consecutive refusals', Array.from({ length: 6 }, (_, i) => ({ at: i + 1 })), 6],
]) {
  test(`upload: ${name}`, async (t) => {
    const s = await setup(t, { failures });
    const got = await s.call('videos.upload');
    assert.equal(s.api.queries, Math.min(expected, 5));
    assert.deepEqual(s.waits, [1000, 2000, 4000, 8000, 16000].slice(0, Math.min(expected, 5)));
    if (expected === 6) {
      assert.equal(got.status, 'vendor_error');
      assert.equal(got.http_status, 503);
      assert.deepEqual(got.provider_codes, [17]);
      assert.equal(s.api.dataAttempts, 6);
    } else {
      const original = readFileSync(s.files.mp4);
      assert.deepEqual(s.api.received, original);
      assert.equal(got.sha256, digest(s.api.received));
      assert.equal(got.bytes, original.length);
      assert.equal(got.chunks, s.api.dataAttempts);
      assert.equal(got.refusals, expected);
      assert.equal(got.video_id, VIDEO);
      assert.equal(got.channel_id, CHANNEL);
      assert.ok(got.seconds >= 0);
      assert.deepEqual(Object.keys(got).sort(), ['video_id', 'channel_id', 'privacy_status', 'upload_status', 'bytes', 'sha256', 'chunks', 'refusals', 'seconds'].sort());
      if (name === 'midway short commit') assert.ok(s.api.ranges[2].startsWith(`bytes ${CHUNK + 262144}-`));
      assert.equal(s.api.writes[0].body.status.privacyStatus, 'private');
      assert.equal(s.api.writes[0].body.status.selfDeclaredMadeForKids, false);
    }
  });
}
test('upload retries a first 308 without range with a refusal and wait', async (t) => {
  const s = await setup(t);
  s.api.noRangeOnce = true;
  const got = await s.call('videos.upload');
  assert.equal(got.sha256, digest(s.api.received));
  assert.equal(got.refusals, 1);
  assert.deepEqual(s.waits, [1000]);
  assert.equal(s.api.ranges[0], s.api.ranges[1]);
});
for (const [name, failures] of [
  ['ten 308s without range', Array.from({ length: 10 }, (_, i) => ({ at: i + 1, status: 308, noRange: true }))],
  ['ten 308s repeating the offset after a refused short commit', [{ at: 1, status: 413, keep: 1 },
    ...Array.from({ length: 10 }, (_, i) => ({ at: i + 2, status: 308 }))]],
]) {
  test(`upload caps ${name} at six consecutive refusals`, async (t) => {
    const s = await setup(t, { size: CHUNK + 29, failures });
    const got = await s.call('videos.upload');
    assert.deepEqual(got, { status: 'vendor_error', endpoint: '/upload/youtube/v3/videos', method: 'PUT', reason: 'upload did not advance' });
    assert.equal(s.api.dataAttempts, 6);
    assert.equal(s.api.queries, 5);
    assert.deepEqual(s.waits, [1000, 2000, 4000, 8000, 16000]);
    assert.equal(new Set(s.api.ranges.slice(1)).size, 1);
  });
}
test('upload resets the refusal count on advancing 308s, then caps six stalled data calls', async (t) => {
  const s = await setup(t, { size: CHUNK + 29, failures: [{ at: 1 },
    ...Array.from({ length: 10 }, (_, i) => ({ at: i + 3, status: 308 }))] });
  const got = await s.call('videos.upload');
  assert.equal(got.reason, 'upload did not advance');
  assert.equal(s.api.dataAttempts, 8); // One refusal, one advancing chunk, six stalled chunks.
  assert.deepEqual(s.waits, [1000, 1000, 2000, 4000, 8000, 16000]);
});
for (const transport of [false, true]) {
  test(`upload finishes from a status-query 201 after ${transport ? 'a final transport refusal' : 'a 308 covering the whole file'}`, async (t) => {
    const size = 29;
    const s = await setup(t, { size, failures: [{ at: 1, keep: size, status: 308, transport }] });
    s.api.finishOnQuery = true;
    const got = await s.call('videos.upload');
    assert.equal(got.video_id, VIDEO);
    assert.equal(got.sha256, digest(readFileSync(s.files.mp4)));
    assert.deepEqual(s.api.received, readFileSync(s.files.mp4));
    assert.equal(got.bytes, size);
    assert.equal(got.chunks, 1);
    assert.equal(got.refusals, transport ? 1 : 0);
    assert.equal(s.api.dataAttempts, 1);
    assert.equal(s.api.queries, 1);
    assert.deepEqual(s.waits, transport ? [1000] : []);
  });
}
test('upload start refusal returns only the sanitized endpoint path', async (t) => {
  const s = await setup(t, { size: 1 });
  const proxy = s.fake.auth.proxy;
  s.fake.auth.proxy = async (request) => {
    if (request.method !== 'POST') return proxy(request);
    return { status: 403, error: { code: 'vendor_error', endpoint: request.endpoint, method: 'POST',
      provider_codes: [17, 'discard', 17], message: 'invented vendor message' } };
  };
  assert.deepEqual(await s.call('videos.upload'), { status: 'vendor_error', http_status: 403,
    endpoint: '/upload/youtube/v3/videos', method: 'POST', provider_codes: [17] });
  assert.equal(s.api.dataAttempts, 0);
  assert.equal(s.api.queries, 0);
});
test('upload missing session stops with the fixed start error', async (t) => {
  const s = await setup(t, { size: 1 });
  s.api.initHeaders = {};
  assert.deepEqual(await s.call('videos.upload'), { status: 'vendor_error', endpoint: '/upload/youtube/v3/videos', method: 'POST', reason: 'no upload session' });
  assert.equal(s.api.dataAttempts, 0);
});
test('upload stops when its single status query fails', async (t) => {
  const s = await setup(t, { failures: [{ at: 1 }] });
  s.api.queryFailure = true;
  const got = await s.call('videos.upload');
  assert.equal(got.status, 'vendor_error');
  assert.equal(got.http_status, 503);
  assert.equal(s.api.queries, 1);
  assert.equal(s.api.dataAttempts, 1);
});
for (const allowed of ['disallowed', 'eligible', undefined]) {
  test(`thumbnail requires allowed long uploads status (${allowed})`, async (t) => {
    const c = channel();
    c.status.longUploadsStatus = allowed;
    const s = await setup(t, { channelItems: [c], size: 1 });
    assert.deepEqual(await s.call('videos.set_thumbnail'), { status: 'vendor_error', field: 'channel_id', reason: 'channel_not_verified', verify_url: 'https://www.youtube.com/verify' });
    assert.equal(s.api.writes.length, 0);
  });
}
test('verified thumbnail sends the exact whole image and MIME type', async (t) => {
  const s = await setup(t, { size: 1 });
  const got = await s.call('videos.set_thumbnail');
  assert.equal(got.bytes, 6);
  assert.deepEqual(Buffer.from(s.api.writes[0].binary_body.base64, 'base64'), readFileSync(s.files.jpg));
  assert.equal(s.api.writes[0].binary_body.content_type, 'image/jpeg');
});
test('caption multipart contains metadata and exact file bytes', async (t) => {
  const s = await setup(t, { size: 1 });
  const got = await s.call('captions.insert', { ...inputs(s.files)['captions.insert'], name: 'English captions' });
  assert.equal(got.caption_id, 'caption123');
  const request = s.api.writes[0];
  const boundary = request.binary_body.content_type.split('boundary=')[1];
  assert.ok(request.binary_body.content_type.startsWith('multipart/related;'));
  const bytes = Buffer.from(request.binary_body.base64, 'base64');
  const parts = bytes.toString('utf8').split(`--${boundary}`);
  assert.equal(parts.length, 4);
  const meta = JSON.parse(parts[1].split('\r\n\r\n')[1].trim());
  assert.deepEqual(meta, { snippet: { videoId: VIDEO, language: 'en', name: 'English captions', isDraft: false } });
  assert.ok(bytes.includes(readFileSync(s.files.srt)));
});
for (const action of ['videos.set_thumbnail', 'captions.insert']) {
  test(`${action}: file over 3 MiB refused before any transport`, async (t) => {
    const s = await setup(t, { size: 1 });
    truncateSync(action === 'captions.insert' ? s.files.srt : s.files.jpg, CHUNK + 1);
    assert.equal((await s.call(action)).status, 'invalid_arguments');
    assert.equal(s.api.calls.length, 0);
  });
}
test('update sends only writable snippet/status fields with named changes', async (t) => {
  const s = await setup(t, { size: 1 });
  s.api.video.status = { privacyStatus: 'private', uploadStatus: 'uploaded', failureReason: 'codec', rejectionReason: 'duplicate',
    embeddable: false, publicStatsViewable: false, license: 'creativeCommon', madeForKids: true, containsSyntheticMedia: false,
    publishAt: new Date(Date.now() + 86400000).toISOString() };
  const changes = { title: 'Changed', description: '', tags: [], category_id: '28', language: 'fr-CA', privacy: 'public' };
  await s.call('videos.update', { channel_id: CHANNEL, video_id: VIDEO, ...changes });
  assert.deepEqual(s.api.writes[0].body, { id: VIDEO,
    snippet: { title: 'Changed', description: '', tags: [], categoryId: '28', defaultLanguage: 'fr-CA', defaultAudioLanguage: 'fr-CA' },
    status: { privacyStatus: 'public', embeddable: false, publicStatsViewable: false, license: 'creativeCommon', selfDeclaredMadeForKids: true, containsSyntheticMedia: false } });
  s.api.writes.length = 0;
  await s.call('videos.update', { channel_id: CHANNEL, video_id: VIDEO, privacy: 'unlisted' });
  assert.deepEqual(s.api.writes[0].body.snippet, { title: 'Before', description: 'Keep description', tags: ['keep'], categoryId: '27', defaultLanguage: 'en', defaultAudioLanguage: 'en' });
  assert.equal(Object.hasOwn(s.api.writes[0].body.status, 'publishAt'), false);
});
for (const [name, privacy, publishAt, keep] of [
  ['future private schedule', undefined, () => new Date(Date.now() + 86400000).toISOString(), true],
  ['explicit private future schedule', 'private', () => new Date(Date.now() + 86400000).toISOString(), true],
  ['past private schedule', undefined, () => '2020-01-01T00:00:00Z', false],
  ['invalid private schedule', undefined, () => 'invalid timestamp', false],
  ['existing public schedule', undefined, () => new Date(Date.now() + 86400000).toISOString(), false],
]) {
  test(`update ${name} sends publishAt only for a future private schedule`, async (t) => {
    const s = await setup(t, { size: 1 });
    s.api.video.status.publishAt = publishAt();
    s.api.video.status.madeForKids = true; // The self-declared false takes precedence.
    if (name === 'existing public schedule') s.api.video.status.privacyStatus = 'public';
    await s.call('videos.update', { channel_id: CHANNEL, video_id: VIDEO, title: 'Changed', ...(privacy === undefined ? {} : { privacy }) });
    assert.deepEqual(s.api.writes[0].body.status, { privacyStatus: s.api.video.status.privacyStatus,
      embeddable: true, selfDeclaredMadeForKids: false, ...(keep ? { publishAt: s.api.video.status.publishAt } : {}) });
    assert.equal(s.api.writes[0].body.snippet.categoryId, '27');
  });
}
test('update omits absent writable fields and preserves a false madeForKids fallback', async (t) => {
  const s = await setup(t, { size: 1 });
  s.api.video.snippet = { channelId: CHANNEL, title: 'Before', categoryId: '27' };
  s.api.video.status = { privacyStatus: 'private', madeForKids: false, uploadStatus: 'uploaded' };
  await s.call('videos.update');
  assert.deepEqual(s.api.writes[0].body, { id: VIDEO, snippet: { title: 'After', categoryId: '27' },
    status: { privacyStatus: 'private', selfDeclaredMadeForKids: false } });
});
test('update without any edit refuses before transport', async (t) => {
  const s = await setup(t, { size: 1 });
  assert.equal((await s.call('videos.update', { channel_id: CHANNEL, video_id: VIDEO })).status, 'invalid_arguments');
  assert.equal(s.api.calls.length, 0);
});
for (const [name, action, patch, field] of [
  ['undeclared', 'videos.upload', { extra: true }, 'extra'],
  ['relative path', 'videos.upload', { path: 'fixture.mp4' }, 'path'],
  ['title bracket', 'videos.upload', { title: 'bad<title' }, 'title'],
  ['title over bound', 'videos.upload', { title: 'x'.repeat(101) }, 'title'],
  ['description bytes', 'videos.upload', { description: 'é'.repeat(2501) }, 'description'],
  ['description bracket', 'videos.upload', { description: 'bad>' }, 'description'],
  ['public upload', 'videos.upload', { privacy: 'public' }, 'privacy'],
  ['tag count', 'videos.upload', { tags: Array(51).fill('x') }, 'tags'],
  ['tag chars including commas', 'videos.upload', { tags: ['x'.repeat(250), 'y'.repeat(250)] }, 'tags'],
  ['tag chars including quotes', 'videos.upload', { tags: ['a '.repeat(250)] }, 'tags'],
  ['caption name', 'captions.insert', { name: 'x'.repeat(151) }, 'name'],
  ['playlist title', 'playlists.create', { title: 'x'.repeat(151) }, 'title'],
  ['page size 51', 'playlists.list', { max_results: 51 }, 'max_results'],
  ['page size zero', 'playlists.list_items', { max_results: 0 }, 'max_results'],
  ['negative position', 'playlists.add_video', { position: -1 }, 'position'],
]) {
  test(`refused before transport: ${name}`, async (t) => {
    const s = await setup(t, { size: 1 });
    const got = await s.call(action, { ...inputs(s.files)[action], ...patch });
    assert.equal(got.status, 'invalid_arguments');
    assert.equal(got.field, field);
    assert.equal(s.api.calls.length, 0);
  });
}
test('file screen refuses extensions, resolved .env names, missing files, directories and user-config paths', async (t) => {
  const s = await setup(t, { size: 1 });
  const text = join(s.home, 'bad.txt'); writeFileSync(text, 'invented');
  const hidden = join(s.home, '.env.fixture'); writeFileSync(hidden, 'invented');
  const link = join(s.home, 'alias.mp4'); symlinkSync(hidden, link);
  const config = process.platform === 'darwin' ? join(homedir(), 'Library', 'Application Support', 'wiser') : process.platform === 'win32' ? join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'wiser') : join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'wiser');
  for (const path of [text, hidden, link, s.home, join(s.home, 'missing.mp4'), join(config, 'invented.mp4')]) {
    assert.equal((await s.call('videos.upload', { ...inputs(s.files)['videos.upload'], path })).status, 'invalid_arguments');
  }
  assert.equal(s.api.calls.length, 0);
});
test('resolved normal symlink and hard link use the cleared bytes', async (t) => {
  const s = await setup(t, { size: 1 });
  const linked = join(s.home, 'linked.jpg'); symlinkSync(s.files.jpg, linked);
  const hard = join(s.home, 'hard.jpg'); linkSync(s.files.jpg, hard);
  for (const path of [linked, hard]) assert.equal((await s.call('videos.set_thumbnail', { ...inputs(s.files)['videos.set_thumbnail'], path })).sha256, digest(readFileSync(s.files.jpg)));
});
test('zero and oversize video are refused without transport', async (t) => {
  const s = await setup(t, { size: 0 });
  assert.equal((await s.call('videos.upload')).status, 'invalid_arguments');
  truncateSync(s.files.mp4, 274877906945);
  assert.equal((await s.call('videos.upload')).status, 'invalid_arguments');
  assert.equal(s.api.calls.length, 0);
});
test('code point title, tag and name boundaries accept astral characters', async (t) => {
  const s = await setup(t, { size: 1 });
  assert.equal((await s.call('videos.update', { channel_id: CHANNEL, video_id: VIDEO, title: '🌟'.repeat(100), tags: ['🌟'.repeat(500)] })).title, '🌟'.repeat(100));
  assert.equal((await s.call('playlists.create', { channel_id: CHANNEL, title: '🌟'.repeat(150) })).title, '🌟'.repeat(150));
  assert.equal((await s.call('captions.insert', { ...inputs(s.files)['captions.insert'], name: '🌟'.repeat(150) })).caption_id, 'caption123');
});
test('reads project named fields and encode query values', async (t) => {
  const s = await setup(t, { size: 1 });
  assert.deepEqual(await s.call('channels.mine'), { channels: [{ channel_id: CHANNEL, title: 'Invented channel', handle: '@invented', privacy_status: 'public', long_uploads_status: 'allowed', is_linked: true }] });
  s.api.video.processingDetails = { processingStatus: 'succeeded', ignored: 'drop' };
  s.api.video.fileDetails = { fileSize: '7', container: 'mov', videoStreams: [{ widthPixels: 1920, ignored: 'drop' }], audioStreams: [{ codec: 'aac', ignored: 'drop' }], ignored: 'drop' };
  s.api.video.contentDetails = { duration: 'PT1S', definition: 'hd', caption: 'true', ignored: 'drop' };
  const got = await s.call('videos.get');
  assert.equal(got.processing_status, 'succeeded');
  assert.deepEqual(got.file, { size: '7', container: 'mov', video_streams: [{ widthPixels: 1920 }], audio_streams: [{ codec: 'aac' }] });
  assert.deepEqual(got.content, { duration: 'PT1S', definition: 'hd', caption: 'true' });
  const page_token = 'next+ &/?=token';
  const playlists = await s.call('playlists.list', { max_results: 50, page_token });
  assert.deepEqual(playlists, { playlists: [{ playlist_id: PLAYLIST, title: 'Invented playlist', privacy_status: 'private' }], next_page_token: 'invented-next' });
  assert.equal(new URL(s.api.calls.at(-1).endpoint, 'https://example.invalid').searchParams.get('pageToken'), page_token);
  const items = await s.call('playlists.list_items');
  assert.deepEqual(items, { items: [{ playlist_item_id: ITEM, video_id: VIDEO, title: 'Invented item', position: 2 }], next_page_token: 'items-next' });
  const tracks = await s.call('captions.list');
  assert.equal(tracks.tracks[0].caption_id, 'caption123');
  assert.equal(JSON.stringify([got, playlists, items, tracks]).includes('ignored'), false);
});
for (const action of ['channels.mine', 'videos.get', 'captions.list', 'playlists.list', 'playlists.list_items']) {
  test(`${action}: non-object answer is a sanitized vendor_error`, async (t) => {
    const s = await setup(t, { size: 1 });
    for (const value of ['invented body', null, []]) {
      s.api.rawAnswer = value;
      assert.equal((await s.call(action)).status, 'vendor_error');
    }
  });
}
test('gateway preserves provider capability stops and numeric vendor codes, never vendor text', async (t) => {
  const s = await setup(t, { size: 1 });
  s.fake.auth.proxy = async () => ({ supported: false });
  assert.equal((await s.call('channels.mine')).status, 'needs_provider_capability');
  s.fake.auth.proxy = async ({ endpoint, method }) => ({ status: 429, error: { code: 'vendor_error', endpoint, method, provider_codes: [8, 8, 'not numeric'], message: 'invented vendor message' } });
  const got = await s.call('channels.mine');
  assert.equal(got.endpoint.split('?')[0], '/channels');
  assert.deepEqual({ ...got, endpoint: '/channels' }, { status: 'vendor_error', http_status: 429, endpoint: '/channels', method: 'GET', provider_codes: [8] });
});
test('template schema-enforcement block is kept at the gateway boundary', async (t) => {
  const { gw, api } = await setup(t, { size: 1 });
  // **Keep this block when you copy the template.** The 2026-09-20 connector audit found
  // that the eleven connectors agreeing with their own manifests were the eleven that had
  // copied a validator and its tests together, and that twelve of the fourteen without it
  // asserted nothing of the kind and held every divergence. The validator now lives in the
  // gateway and no connector carries one, so what a connector still has to carry is this:
  // proof that its published schema is the one being applied to its own actions.
  for (const input of [{ video_id: VIDEO, undeclared: 'example' }, { video_id: 12345 }, {}]) {
    const refused = await gw.execute({ action: 'youtube.videos.get', input });
    assert.equal(refused.status, 'invalid_arguments', JSON.stringify(input));
  }
  for (const input of [null, [], 'example', 1]) {
    assert.deepEqual(await gw.execute({ action: 'youtube.videos.get', input }), { status: 'invalid_arguments', field: 'input' });
  }
  assert.equal(api.calls.length, 0);
});
test('module emits no console/stdout/stderr and uses no file-writing API', async (t) => {
  const s = await setup(t, { size: 1 });
  const source = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  assert.equal(/\bconsole\s*[.[]|process\.(?:stdout|stderr)|\b(?:writeFile|appendFile|createWriteStream|writeSync|mkdir|rename|unlink)\w*\s*\(/.test(source), false);
  const prior = Object.fromEntries(['log', 'error', 'warn', 'info', 'debug', 'trace', 'dir'].map((key) => [key, console[key]]));
  const out = process.stdout.write, err = process.stderr.write;
  const emitted = [];
  try {
    for (const key of Object.keys(prior)) console[key] = (...args) => { emitted.push(key); };
    process.stdout.write = () => { emitted.push('stdout'); return true; };
    process.stderr.write = () => { emitted.push('stderr'); return true; };
    for (const [action, input] of Object.entries(inputs(s.files))) await s.call(action, input);
  } finally {
    Object.assign(console, prior);
    process.stdout.write = out;
    process.stderr.write = err;
  }
  assert.deepEqual(emitted, []);
});
test('manifest/export parity, closed inputs and the sole response-header declaration', () => {
  const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
  const modules = createModules();
  const found = [];
  for (const [name, mod] of Object.entries(manifest.modules)) {
    assert.deepEqual(mod.auth, { provider: 'catalog', toolkit: 'YOUTUBE', scheme: 'OAUTH2', privilege: 'write' });
    assert.equal(mod.unwrap_token, false);
    assert.equal(mod.fallback, 'none');
    assert.deepEqual(Object.keys(mod.actions).sort(), Object.keys(modules[name]).sort());
    for (const [action, def] of Object.entries(mod.actions)) {
      const id = `${name}.${action}`;
      found.push(id);
      assert.equal(def.input.additionalProperties, false);
      assert.equal(def.execution.prefer, 'proxy');
      assert.equal(def.confirmation, WRITES.includes(id) ? 'always' : 'none');
      assert.deepEqual(def.response_headers, id === 'videos.upload' ? ['location', 'range'] : undefined);
    }
  }
  assert.deepEqual(found.sort(), Object.keys(inputs({})).sort());
  assert.equal(found.length, 12);
});
