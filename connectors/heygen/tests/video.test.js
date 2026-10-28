import fs from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modules } from '../index.js';
import { inspectMp4 } from '../video.js';
import { statusSignal, STATUS } from '../../../gateway/src/errors.js';
import { putActive } from '../../../gateway/test/fake-provider.js';
import { setup, run, mp3, wav, mp4, hash, wire, page, avatarGroup, avatarLook, videoInput, videoAnswer, noPrivate, ADDRESS, VIDEO_ADDRESS, PRIVATE, SIGNATURE } from './fixtures.js';

const upload = (f, extra = {}) => ({ path: f.file, idempotency_key: 'invented-upload-key', ...extra });
const assetInput = (extra = {}) => { const v = videoInput({ audio_asset_id: 'asset_fake-1', ...extra }); delete v.script; delete v.voice_id; return v; };
const noFiles = (f) => assert.deepEqual(fs.existsSync(join(f.home, 'outputs')) ? fs.readdirSync(join(f.home, 'outputs')) : [], []);
const postCount = (f) => f.calls.filter((r) => r.method === 'POST').length;

test('clone creation accepts 2xx with a valid voice id, never readiness or malformed acknowledgements', async (t) => {
  const f = await setup(t);
  for (const status of [200, 201, 202, 204, 299]) {
    f.reply = () => ({ status, data: { data: { voice_id: 'clone_fake-2', status: 'PENDING', preview_audio_url: ADDRESS } } });
    assert.deepEqual(await run(f, 'voices.add', { ...upload(f), name: 'Clone' }), { voice_id: 'clone_fake-2', accepted: true });
  }
  for (const data of [null, {}, { voice_id: '' }, { voice_id: ADDRESS }, { voice_id: 5 }, { voice_id: 'clone_fake-2', error: SIGNATURE }]) {
    f.reply = () => ({ status: 200, data: { data } });
    const got = await run(f, 'voices.add', { ...upload(f), name: 'Clone' });
    assert.equal(got.status, 'vendor_error'); noPrivate(got);
  }
});

test('multipart independently parses one exact MP3/WAV file, fixed name/MIME and idempotency', async (t) => {
  const f = await setup(t);
  for (const [ext, bytes, mime] of [['mp3', mp3(), 'audio/mpeg'], ['wav', wav(), 'audio/wav']]) {
    const path = join(f.home, `untransmitted.${ext}`); fs.writeFileSync(path, bytes);
    const got = await run(f, 'assets.upload_audio', upload(f, { path }));
    assert.deepEqual(got, { asset_id: 'asset_fake-1', mime_type: mime, size_bytes: bytes.length }); noPrivate(got);
    const req = f.calls.at(-1);
    assert.equal(req.body, undefined); assert.equal(req.method, 'POST'); assert.equal(req.endpoint, 'https://api.heygen.com/v3/assets');
    assert.deepEqual(Object.keys(req.binary_body).sort(), ['base64', 'content_type']);
    const boundary = /^multipart\/form-data; boundary=([A-Za-z0-9]+)$/.exec(req.binary_body.content_type)?.[1]; assert.ok(boundary);
    const parts = Buffer.from(req.binary_body.base64, 'base64').toString('latin1').split(`--${boundary}`);
    assert.equal(parts.length, 3); assert.equal(parts[0], ''); assert.equal(parts[2], '--\r\n');
    const [headers, ...body] = parts[1].split('\r\n\r\n');
    assert.equal(headers, `\r\nContent-Disposition: form-data; name="file"; filename="narration.${ext}"\r\nContent-Type: ${mime}`);
    assert.deepEqual(Buffer.from(body.join('\r\n\r\n').slice(0, -2), 'latin1'), bytes);
    assert.equal(bytes.includes(Buffer.from(boundary)), false);
    assert.deepEqual(req.parameters, [{ name: 'Idempotency-Key', value: 'invented-upload-key', type: 'header' }]);
    assert.equal(req.serialized.includes(path), false);
    assert.ok(f.measurements.some((m) => m.serialized === req.serialized && m.count === Buffer.byteLength(req.serialized)));
  }
});

test('asset file safety: cap edges, protected names never opened, links, FIFO, directory and changed/unreadable files', async (t) => {
  const f = await setup(t);
  for (const [ext, bytes] of [['mp3', mp3(3000000)], ['wav', wav(3000000)]]) {
    const path = join(f.home, `cap.${ext}`); fs.writeFileSync(path, bytes);
    assert.equal((await run(f, 'assets.upload_audio', upload(f, { path }))).size_bytes, 3000000);
  }
  for (const size of [0, 3000001]) {
    const path = join(f.home, 'invalid-size.wav'); fs.writeFileSync(path, Buffer.alloc(size));
    const opened = t.mock.method(fs, 'openSync', () => assert.fail('size refused before open'));
    assert.equal((await modules.assets.upload_audio(upload(f, { path }), {})).status, 'invalid_arguments');
    assert.equal(opened.mock.callCount(), 0); opened.mock.restore();
  }
  const symlink = join(f.home, 'symlink.mp3'), ancestor = join(f.home, 'alias'), hard = join(f.home, 'hard.mp3'), fifo = join(f.home, 'fifo.mp3');
  fs.symlinkSync(f.file, symlink); fs.symlinkSync(f.home, ancestor); fs.linkSync(f.file, hard); execFileSync('mkfifo', [fifo]);
  const opened = t.mock.method(fs, 'openSync', () => assert.fail('unsafe path opened'));
  for (const path of [symlink, join(ancestor, 'sample.mp3'), hard, fifo, f.home, 'relative.mp3', 'https://example.test/audio.mp3', join(f.home, '.env.mp3'), join(f.home, 'memory', 'sample.mp3')])
    assert.equal((await modules.assets.upload_audio(upload(f, { path }), {})).status, 'invalid_arguments');
  assert.equal(opened.mock.callCount(), 0); opened.mock.restore(); fs.unlinkSync(hard);
  let mock = t.mock.method(fs, 'openSync', () => { throw new Error(SIGNATURE); });
  assert.equal((await modules.assets.upload_audio(upload(f), {})).status, 'invalid_arguments'); mock.mock.restore();
  const open = fs.openSync;
  mock = t.mock.method(fs, 'openSync', (path, flags) => { fs.unlinkSync(f.file); fs.writeFileSync(f.file, mp3()); return open(path, flags); });
  assert.equal((await modules.assets.upload_audio(upload(f), {})).status, 'invalid_arguments'); mock.mock.restore();
  const read = fs.readSync; let changed = false;
  mock = t.mock.method(fs, 'readSync', (...args) => { const n = read(...args); if (!changed) { changed = true; fs.writeFileSync(f.file, Buffer.alloc(417)); } return n; });
  assert.equal((await modules.assets.upload_audio(upload(f), {})).status, 'invalid_arguments'); mock.mock.restore();
  fs.writeFileSync(f.file, wav());
  assert.equal((await run(f, 'assets.upload_audio', upload(f))).status, 'invalid_arguments');
});

test('asset acknowledgement requires matching MIME, safe id and exact integer byte count', async (t) => {
  const f = await setup(t);
  for (const extra of [{ asset_id: '' }, { asset_id: ADDRESS }, { mime_type: 'audio/wav' }, { mime_type: 'text/plain' }, { size_bytes: 416 }, { size_bytes: NaN }, { size_bytes: 417.5 }, { size_bytes: '417' }, { error: ADDRESS }]) {
    f.reply = () => ({ status: 200, data: { data: { asset_id: 'asset_fake-1', mime_type: 'audio/mpeg', size_bytes: 417, url: ADDRESS, ...extra } } });
    const got = await run(f, 'assets.upload_audio', upload(f)); assert.equal(got.status, 'vendor_error'); noPrivate(got);
  }
});

test('new upload and video envelopes obey exact 4100000/4100001 wire budget with actual synthetic account id', async (t) => {
  const f = await setup(t);
  for (const [module, action, input] of [['assets', 'assets.upload_audio', upload(f)], ['videos', 'videos.create', videoInput({ title: '𐐀"\\' })]]) {
    await run(f, action, input);
    const template = f.calls.at(-1), base = Buffer.byteLength(wire({ ...template, providerAccountId: '' }));
    for (const target of [4100000, 4100001]) {
      const account = 'a'.repeat(target - base), row = f.store.getConnection({ service: 'heygen', module });
      f.store.putConnection({ ...row, provider_account_id: account }); f.fake.auth.setStatus(account, 'ACTIVE');
      const before = postCount(f), got = await run(f, action, input);
      if (target === 4100000) {
        assert.equal(got.status, undefined); assert.equal(postCount(f), before + 1);
        assert.equal(Buffer.byteLength(f.calls.at(-1).serialized), target);
        assert.ok(f.measurements.some((m) => m.count === target && m.serialized === f.calls.at(-1).serialized));
      } else {
        assert.deepEqual(got, { status: 'vendor_error', reason: 'proxy_body_too_large' }); assert.equal(postCount(f), before);
      }
    }
    await putActive(f.store, f.fake, { service: 'heygen', module });
  }
});

test('both video alternatives send exact Avatar IV body, selected look, bounds, title and background', async (t) => {
  const f = await setup(t, { hosted: true });
  for (const input of [videoInput({ title: '𐐀'.repeat(200), script: '𐐀'.repeat(5000), background_color: '#01aBcF', resolution: '1080p', aspect_ratio: '9:16' }), assetInput()]) {
    const before = postCount(f); const got = await run(f, 'videos.create', input);
    assert.deepEqual(got, { video_id: 'video_fake-1', video_status: 'waiting', output_format: 'mp4' }); noPrivate(got);
    assert.equal(postCount(f), before + 1);
    const req = f.calls.at(-1);
    assert.deepEqual(req.body, { type: 'avatar', avatar_id: input.avatar_id, engine: { type: 'avatar_iv' }, resolution: input.resolution, aspect_ratio: input.aspect_ratio, output_format: 'mp4',
      ...(input.title ? { title: input.title } : {}), ...(input.background_color ? { background: { value: input.background_color } } : {}),
      ...(input.audio_asset_id ? { audio_asset_id: input.audio_asset_id } : { script: input.script, voice_id: input.voice_id }) });
    assert.deepEqual(req.parameters, [{ name: 'Idempotency-Key', value: input.idempotency_key, type: 'header' }]);
    assert.ok(f.calls.every((r) => r.budget === 4100000 && r.providerAccountId === 'fake-acct-heygen-videos'));
  }
  const base = videoInput(); delete base.script; delete base.voice_id;
  for (const input of [base, { ...base, script: 'missing voice' }, { ...base, voice_id: 'voice_fake-1' }, videoInput({ audio_asset_id: 'asset_fake-1' }), { ...base, audio_asset_id: 'asset_fake-1', voice_id: 'voice_fake-1' }, { ...base, audio_asset_id: 'asset_fake-1', script: 'forbidden' }]) {
    const before = f.calls.length; assert.equal((await run(f, 'videos.create', input)).status, 'invalid_arguments'); assert.equal(f.calls.length, before);
  }
  for (const extra of [{ script: '𐐀'.repeat(5001) }, { title: '𐐀'.repeat(201) }]) {
    assert.equal((await modules.videos.create(videoInput(extra), {})).status, 'invalid_arguments');
  }
});

test('selected look and multiple group pages: no first-item inference, malformed pages, missing group, readiness/consent and engines stop spend', async (t) => {
  const f = await setup(t);
  const original = f.defaultReply;
  f.reply = (req) => {
    const path = new URL(req.endpoint).pathname;
    if (path.startsWith('/v3/avatars/looks/')) return { status: 200, data: { data: avatarLook({ id: 'chosen-look', group_id: 'second-group' }) } };
    if (path === '/v3/avatars') return { status: 200, data: req.parameters.some((p) => p.name === 'token') ? page([avatarGroup({ id: 'second-group' })]) : page([avatarGroup({ id: 'first-group' })], { has_more: true, next_token: 'page-two' }) };
    return original(req);
  };
  assert.equal((await run(f, 'videos.create', videoInput({ avatar_id: 'chosen-look' }))).video_id, 'video_fake-1');
  assert.equal(f.calls.at(-1).body.avatar_id, 'chosen-look');
  const groupCalls = f.calls.filter((r) => new URL(r.endpoint).pathname === '/v3/avatars'); assert.equal(groupCalls.length, 2);
  assert.deepEqual(groupCalls[1].parameters, [{ name: 'limit', value: 50, type: 'query' }, { name: 'token', value: 'page-two', type: 'query' }]);
  for (const look of [avatarLook({ id: 'wrong-look' }), avatarLook({ status: 'processing' }), avatarLook({ status: null }), avatarLook({ supported_api_engines: ['avatar_v'] })]) {
    f.reply = (req) => req.endpoint.includes('/looks/') ? { status: 200, data: { data: look } } : original(req);
    const before = postCount(f); assert.ok((await run(f, 'videos.create', videoInput())).status); assert.equal(postCount(f), before);
  }
  for (const envelope of [page([]), page([avatarGroup({ id: 'other' })], { has_more: true, next_token: 'repeated' }), page([avatarGroup()], { has_more: true }), page([avatarGroup({ status: 'training' })]), page([avatarGroup({ consent_status: 'pending' })])]) {
    f.reply = (req) => new URL(req.endpoint).pathname === '/v3/avatars' ? { status: 200, data: envelope } : original(req);
    const before = postCount(f); assert.ok((await run(f, 'videos.create', videoInput())).status); assert.equal(postCount(f), before);
  }
  f.reply = (req) => req.endpoint.includes('/looks/') ? { status: 200, data: { data: avatarLook({ group_id: 'look_fake-1' }) } } : new URL(req.endpoint).pathname === '/v3/avatars' ? { status: 200, data: page([avatarGroup({ id: 'look_fake-1', status: null, consent_status: null })]) } : original(req);
  assert.equal((await run(f, 'videos.create', videoInput())).video_id, 'video_fake-1');
});

test('video wallet preflight refuses unknown billing, currency or empty balance without rendering', async (t) => {
  const f = await setup(t);
  for (const data of [{ billing_type: 'subscription', wallet: null }, { billing_type: 'wallet', wallet: null }, { billing_type: 'wallet', wallet: { currency: 'eur', remaining_balance: 1 } }, ...[0, -1, NaN].map((remaining_balance) => ({ billing_type: 'wallet', wallet: { currency: 'usd', remaining_balance } }))]) {
    f.reply = (req) => req.endpoint.endsWith('/users/me') ? { status: 200, data: { data } } : f.defaultReply(req);
    const before = postCount(f); assert.equal((await run(f, 'videos.create', assetInput())).reason, 'wallet_unavailable_or_insufficient'); assert.equal(postCount(f), before);
  }
});

test('upload success and create failure preserve asset id; explicit retry retains body/idempotency and never reuploads', async (t) => {
  const f = await setup(t); const asset = await run(f, 'assets.upload_audio', upload(f));
  f.reply = (req) => req.endpoint.endsWith('/v3/videos') ? { status: 503, error: { code: 'unavailable' }, data: { raw: SIGNATURE } } : f.defaultReply(req);
  const input = assetInput({ audio_asset_id: asset.asset_id }); const got = await run(f, 'videos.create', input);
  assert.equal(got.status, 'vendor_error'); assert.equal(asset.asset_id, 'asset_fake-1'); noPrivate(got);
  assert.equal(f.calls.filter((r) => r.endpoint.endsWith('/v3/assets')).length, 1); assert.equal(postCount(f), 2);
  const failed = f.calls.at(-1); f.reply = null;
  assert.equal((await run(f, 'videos.create', input)).video_id, 'video_fake-1');
  assert.deepEqual(f.calls.at(-1).body, failed.body); assert.deepEqual(f.calls.at(-1).parameters, failed.parameters);
});

test('poll and resume same video id through all states, unknown state and recognized failure; no URLs or extra POST', async (t) => {
  const f = await setup(t, { video: true });
  for (const status of ['pending', 'waiting', 'processing', 'completed', 'failed', 'new_provider_state']) {
    f.reply = () => ({ status: 200, data: { data: videoAnswer({ status, duration: status === 'completed' ? 3.97 : null, failure_code: 'VIDEO_GENERATION_FAILED' }) } });
    const got = await run(f, 'videos.get', { video_id: 'video_fake-1' });
    assert.deepEqual(got, { video_id: 'video_fake-1', video_status: status === 'new_provider_state' ? 'unknown' : status, duration: status === 'completed' ? 3.97 : null, failure_code: 'VIDEO_GENERATION_FAILED' }); noPrivate(got);
    if (status !== 'completed') { const result = await run(f, 'videos.download', { video_id: 'video_fake-1' }); const { video_id, ...metadata } = got; assert.deepEqual(result, metadata); }
  }
  assert.equal(f.media.requests.length, 0); assert.equal(postCount(f), 0); noFiles(f);
  assert.ok(f.calls.every((r) => r.method === 'GET' && r.endpoint.endsWith('/v3/videos/video_fake-1')));
  for (const extra of [{ id: 'another-id' }, { status: ADDRESS }, { duration: -1 }, { duration: NaN }, { duration: '3.97' }]) {
    f.reply = () => ({ status: 200, data: { data: videoAnswer(extra) } });
    assert.equal((await run(f, 'videos.get', { video_id: 'video_fake-1' })).status, 'vendor_error');
  }
  for (const extra of [{ duration: null }, { duration: 0 }, { video_url: null }]) {
    f.reply = () => ({ status: 200, data: { data: videoAnswer(extra) } });
    assert.equal((await run(f, 'videos.download', { video_id: 'video_fake-1' })).status, 'vendor_error');
  }
});

test('complete MP4 structure, not MIME or a magic prefix, is required', () => {
  const bytes = mp4(); assert.equal(inspectMp4(bytes), true);
  for (const b of [Buffer.from('....ftypisom'), bytes.subarray(0, 100), Buffer.concat([bytes, Buffer.from([1])]), Buffer.alloc(10)]) assert.equal(inspectMp4(b), false);
  for (const needle of ['ftyp', 'moov', 'mvhd', 'trak', 'tkhd', 'mdia', 'mdhd', 'hdlr', 'minf', 'mdat']) {
    const b = Buffer.from(bytes); b.write('xxxx', b.indexOf(needle)); assert.equal(inspectMp4(b), false, needle);
  }
  const b = Buffer.from(bytes); b.writeUInt32BE(0xffffffff, 0); assert.equal(inspectMp4(b), false);
});

test('a locally generated H.264 MP4 is independently probed and downloaded byte for byte', async (t) => {
  // Test-only system tools; no media file, network or codec package is installed.
  const bytes = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=16x16:r=1',
    '-frames:v', '1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', 'frag_keyframe+empty_moov', '-f', 'mp4', 'pipe:1']);
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-i', 'pipe:0', '-show_entries', 'stream=codec_name,width,height', '-of', 'json'], { input: bytes }));
  assert.deepEqual(probe.streams, [{ codec_name: 'h264', width: 16, height: 16 }]); assert.equal(inspectMp4(bytes), true);
  const f = await setup(t, { video: true, media: { chunks: [bytes], headers: { 'content-type': 'binary/octet-stream' } } });
  const got = await run(f, 'videos.download', { video_id: 'video_fake-1' });
  assert.deepEqual(fs.readFileSync(got.file.path), bytes); assert.equal(got.file.sha256, hash(bytes)); noPrivate(got);
});

test('completed MP4 download is byte-identical despite binary/octet-stream, same id, no render, private metadata only', async (t) => {
  const f = await setup(t, { video: true, media: { headers: { 'content-type': 'binary/octet-stream' } } });
  const got = await run(f, 'videos.download', { video_id: 'video_fake-1' });
  assert.equal(got.video_id, undefined); assert.equal(got.duration, 3.97);
  assert.equal(got.file.media_type, 'video/mp4'); assert.equal(got.file.bytes, mp4().length); assert.equal(got.file.sha256, hash(mp4()));
  assert.deepEqual(fs.readFileSync(got.file.path), mp4()); assert.match(got.file.path, /[0-9a-f-]{36}\.mp4$/);
  assert.equal(fs.statSync(got.file.path).mode & 0o777, 0o600); noPrivate(got);
  assert.equal(f.calls.length, 1); assert.equal(postCount(f), 0); assert.equal(f.media.requests.length, 1);
  assert.deepEqual(f.media.options[0].headers, { Host: 'files2.heygen.ai', 'Accept-Encoding': 'identity' });
  assert.equal(f.media.options[0].path, new URL(VIDEO_ADDRESS).pathname + new URL(VIDEO_ADDRESS).search);
  assert.equal(f.media.options[0].auth, undefined); assert.equal(f.media.options[0].servername, 'files2.heygen.ai');
});

for (const [name, media, url, detail] of [
  ['host', {}, `https://other.test/${PRIVATE}`, 'host_refused'], ['HTTP', {}, VIDEO_ADDRESS.replace('https:', 'http:'), 'invalid_url'],
  ['userinfo', {}, VIDEO_ADDRESS.replace('https://', 'https://user@'), 'invalid_url'], ['fragment', {}, VIDEO_ADDRESS + '#secret', 'invalid_url'],
  ['port', {}, VIDEO_ADDRESS.replace('.ai/', '.ai:444/'), 'invalid_url'], ['IP', {}, `https://127.0.0.1/${PRIVATE}`, 'invalid_url'],
  ['DNS', { v4: ['127.0.0.1'], v6: [] }, VIDEO_ADDRESS, 'address_refused'], ['mixed DNS', { v4: ['93.184.216.35', '10.0.0.1'], v6: [] }, VIDEO_ADDRESS, 'address_refused'],
  ['redirect', { status: 302, headers: { location: VIDEO_ADDRESS } }, VIDEO_ADDRESS, 'redirect_refused'], ['expired', { status: 403 }, VIDEO_ADDRESS, 'http_refused'],
  ['incomplete', { complete: false }, VIDEO_ADDRESS, 'truncated'], ['compressed', { headers: { 'content-encoding': 'gzip' } }, VIDEO_ADDRESS, 'encoding_refused'],
  ['throw', { requestError: true }, VIDEO_ADDRESS, 'transport_failed'],
]) test(`video download ${name} refuses privately without output, retry or rerender`, async (t) => {
  const f = await setup(t, { video: true, media });
  f.reply = () => ({ status: 200, data: { data: videoAnswer({ video_url: url }) } });
  const got = await run(f, 'videos.download', { video_id: 'video_fake-1' });
  assert.equal(got.reason, 'media_download_failed'); assert.equal(got.detail, detail); noPrivate(got); noFiles(f);
  assert.equal(postCount(f), 0); assert.equal(f.calls.length, 1); assert.ok(f.media.requests.length <= 1);
  assert.equal(f.store.getConnection({ service: 'heygen', module: 'videos' }).status, 'ACTIVE');
});

test('MP4 deadline discards chunks; next explicit call obtains status for the same id without rerender', async (t) => {
  const f = await setup(t, { video: true, media: { slow: 'body' } });
  const pending = run(f, 'videos.download', { video_id: 'video_fake-1' });
  for (let i = 0; i < 100 && !f.media.responses.length; i++) await new Promise((resolve) => setImmediate(resolve));
  assert.ok(f.media.responses.length); f.media.expire(); const got = await pending;
  assert.equal(got.detail, 'deadline'); noFiles(f); noPrivate(got);
  await run(f, 'videos.get', { video_id: 'video_fake-1' }); assert.equal(f.calls.length, 2); assert.equal(postCount(f), 0);
});

test('MP4 exact cap publishes and streamed cap plus one refuses without a partial file', async (t) => {
  for (const size of [268435456, 268435457]) await t.test(String(size), async (t) => {
    const bytes = mp4(size), f = await setup(t, { video: true, media: { chunks: [bytes] } });
    const got = await run(f, 'videos.download', { video_id: 'video_fake-1' });
    if (size === 268435456) { assert.equal(got.file.bytes, size); assert.equal(got.file.sha256, hash(bytes)); assert.equal(fs.statSync(got.file.path).size, size); }
    else { assert.equal(got.detail, 'over_cap'); noFiles(f); }
    noPrivate(got); assert.equal(f.calls.length, 1); assert.equal(postCount(f), 0);
  });
});

test('malformed MP4 for a 32-character id stays unexpected answer, not a private-address refusal', async (t) => {
  // HeyGen's signed video path carries the video id (read live 2026-10-28); the guard windows that path.
  const id = 'f0e1d2c3b4a5968778695a4b3c2d1e0f';
  const f = await setup(t, { video: true, media: { chunks: [Buffer.from('....ftypisom')] } });
  const got = await run(f, 'videos.download', { video_id: id });
  assert.equal(got.status, 'vendor_error');
  assert.equal(got.reason, 'unexpected answer');
  assert.notEqual(got.detail, 'private_address');
  assert.ok(!JSON.stringify(got).includes(id));
  noFiles(f); noPrivate(got); assert.equal(postCount(f), 0);
});

test('malformed MP4 and complete container with private address never publish', async (t) => {
  for (const planted of [false, true]) await t.test(String(planted), async (t) => {
    const bytes = planted ? mp4() : Buffer.from('....ftypisom'); if (planted) bytes.write(VIDEO_ADDRESS, 600);
    const f = await setup(t, { video: true, media: { chunks: [bytes] } });
    const got = await run(f, 'videos.download', { video_id: 'video_fake-1' }); assert.equal(got.status, 'vendor_error');
    if (planted) assert.equal(got.reason, 'output_refused'); else assert.equal(got.reason, 'unexpected answer');
    noFiles(f); noPrivate(got); assert.equal(postCount(f), 0);
  });
});

test('asset and JSON-only video answers discard private JSON fields even without a download guard', async (t) => {
  const f = await setup(t, { video: true }); const writes = [];
  const stdout = t.mock.method(process.stdout, 'write', (v) => { writes.push(String(v)); return true; });
  const stderr = t.mock.method(process.stderr, 'write', (v) => { writes.push(String(v)); return true; });
  try {
    for (const [id, input] of [['assets.upload_audio', upload(f)], ['videos.create', videoInput()], ['videos.get', { video_id: 'video_fake-1' }], ['videos.download', { video_id: 'video_fake-1' }]]) {
      const action = `heygen.${id}`, stop = await f.gw.callTool('execute', { action, input }); noPrivate(stop);
      const got = stop.status === 'needs_confirmation' ? await f.gw.callTool('execute', { action, input, confirm: true }) : stop;
      noPrivate(got); noPrivate(JSON.stringify({ evidence: got }));
    }
  } finally { stdout.mock.restore(); stderr.mock.restore(); }
  assert.equal(writes.length, 0); noPrivate(writes);
  for (const value of f.gw.pendingConfirmations.values()) noPrivate(value);
  noPrivate(fs.readFileSync(join(f.home, 'audit.jsonl'), 'utf8'));
});

test('new mutations require matched confirmation; changed look, scene, asset, key or local file path stops', async (t) => {
  const f = await setup(t);
  for (const [id, input, changes] of [['videos.create', videoInput(), [{ avatar_id: 'other-look' }, { script: 'changed' }, { voice_id: 'other-voice' }, { idempotency_key: 'other-key-123' }]], ['videos.create', assetInput(), [{ audio_asset_id: 'other-asset' }]], ['assets.upload_audio', upload(f), [{ path: join(f.home, 'other.mp3') }, { idempotency_key: 'other-key-123' }]]]) {
    const call = { action: `heygen.${id}`, input };
    for (const change of changes) {
      await f.gw.execute(call); const before = f.calls.length;
      const got = await f.gw.execute({ ...call, input: { ...input, ...change }, confirm: true });
      assert.equal(got.status, 'needs_confirmation'); assert.equal(got.reason, 'unmatched_confirm'); assert.equal(f.calls.length, before);
    }
    await f.gw.execute(call); assert.equal((await f.gw.execute({ ...call, confirm: true })).status, undefined);
    assert.equal((await f.gw.execute({ ...call, confirm: true })).status, 'needs_confirmation');
  }
});

test('new actions preserve sanitized provider failures/capability stops without retry', async (t) => {
  const f = await setup(t, { video: true });
  for (const [id, input] of [['assets.upload_audio', upload(f)], ['videos.create', videoInput()], ['videos.get', { video_id: 'video_fake-1' }], ['videos.download', { video_id: 'video_fake-1' }]]) {
    for (const error of [...[401, 403, 402, 409, 413, 422, 429, 500].map((status) => ({ status, error: { code: 'invented' }, data: { raw: SIGNATURE } })), new Error(VIDEO_ADDRESS, { cause: new Error(SIGNATURE) }), statusSignal(STATUS.VENDOR_ERROR, { reason: 'proxy_body_too_large', raw: ADDRESS })]) {
      f.reply = () => { if (error instanceof Error) throw error; return error; };
      const before = f.calls.length, got = await run(f, id, input); assert.equal(got.status, 'vendor_error'); assert.equal(f.calls.length, before + 1); noPrivate(got);
      if (error.object?.reason) assert.equal(got.reason, 'proxy_body_too_large');
    }
    f.fake.auth.measureProxyBody = () => ({ supported: false }); const before = f.calls.length;
    assert.deepEqual(await run(f, id, input), { status: 'needs_provider_capability' }); assert.equal(f.calls.length, before);
    f.fake.auth.measureProxyBody = (req) => Buffer.byteLength(wire(req));
  }
});

test('video file output is local_only before connections/provider; JSON-only remote create/get work hosted', async (t) => {
  const f = await setup(t, { hosted: true });
  const get = t.mock.method(f.store, 'getConnection', () => assert.fail('hosted output touched connection'));
  const got = await f.gw.execute({ action: 'heygen.videos.download', input: { video_id: 'video_fake-1' } });
  assert.equal(got.status, 'local_only'); assert.equal(f.calls.length, 0); get.mock.restore();
  assert.equal((await run(f, 'videos.create', assetInput())).video_id, 'video_fake-1');
  assert.equal((await run(f, 'videos.get', { video_id: 'video_fake-1' })).video_status, 'pending');
});
