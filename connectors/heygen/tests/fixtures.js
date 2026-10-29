import fs from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createTestGateway, makeHome, putActive, confirmCall } from '../../../gateway/test/fake-provider.js';
import { transport } from '../../../gateway/test/media-transport.js';
import { statusSignal, STATUS } from '../../../gateway/src/errors.js';

export const MODULES = ['speech','voices','avatars','assets','videos','account'];
export const PRIVATE = 'invented-private-path-123456789';
export const SIGNATURE = 'invented-signature-value-987654321';
export const speechAddress = (voiceId) => `https://resource2.heygen.ai/${PRIVATE}/${voiceId}/speech.wav`;
export const ADDRESS = speechAddress('voice_fake-1');
// HeyGen's voice objects carry `voice_id`, as read live on 2026-10-28; an `id` override here sets that vendor key.
export const voice = ({ id, ...extra } = {}) => ({ voice_id: id ?? 'voice_fake-1', name: 'Invented clone', mode: 'instant', status: 'ACTIVE', language: 'en', preview_audio_url: ADDRESS, created_at: 1793030044, ...extra });
export const characterTimings = (text) => Array.from(text, (text, i) => ({ text, start_time: i / 10, end_time: (i + 1) / 10 }));
export const scene = (text = 'Hi', model = 'heygen-voice-1-turbo-free') => ({ text, voice_id: 'voice_fake-1', model });
export const page = (data = [], extra = {}) => ({ data, has_more: false, ...extra });
export const speechAnswer = (text, voiceId = 'voice_fake-1') => ({ data: { audio_url: speechAddress(voiceId), duration: 1.25, original_characters: characterTimings(text), preview: ADDRESS, extra: ADDRESS } });
export const videoAddress = (videoId) => `https://files2.heygen.ai/${PRIVATE}/${videoId}/video.mp4?sig=${SIGNATURE}`;
export const VIDEO_ADDRESS = videoAddress('video_fake-1');
export const avatarGroup = (extra = {}) => ({ id: 'group_fake-1', name: 'Duplicate character', looks_count: 3, preview_image_url: ADDRESS, ...extra });
export const avatarLook = (extra = {}) => ({ id: 'look_fake-1', group_id: 'group_fake-1', name: 'Duplicate look', avatar_type: 'digital_twin', status: 'completed', default_voice_id: 'voice_fake-1', supported_api_engines: ['avatar_v', 'avatar_iv'], preview_image_url: ADDRESS, preview_video_url: VIDEO_ADDRESS, ...extra });
export const videoInput = (extra = {}) => ({ avatar_id: 'look_fake-1', engine: 'avatar_iv', script: 'Invented scene.', voice_id: 'voice_fake-1', resolution: '720p', aspect_ratio: '16:9', idempotency_key: 'invented-video-key', ...extra });
export const videoAnswer = (extra = {}) => {
  const videoId = extra.id ?? 'video_fake-1';
  return { id: videoId, status: 'completed', duration: 3.97, video_url: videoAddress(videoId),
    thumbnail_url: `https://files2.heygen.ai/${PRIVATE}/${videoId}/thumbnail.jpg?sig=${SIGNATURE}`,
    gif_url: `https://files2.heygen.ai/${PRIVATE}/${videoId}/preview.gif?sig=${SIGNATURE}`,
    video_page_url: `https://files2.heygen.ai/${PRIVATE}/${videoId}/page.html`,
    failure_message: SIGNATURE, extra: ADDRESS, ...extra };
};
const box = (type, ...data) => {
  const payload = Buffer.concat(data), header = Buffer.alloc(8);
  header.writeUInt32BE(8 + payload.length); header.write(type, 4); return Buffer.concat([header, payload]);
};
// Generated ISO BMFF movie/track/media headers and sample table. The connector
// validates containers, not encoded H.264/AAC samples or playback.
export function mp4(size = 1024) {
  const ftyp = box('ftyp', Buffer.from('isom\0\0\0\0isomiso2mp41'));
  const movie = box('moov', box('mvhd', Buffer.alloc(100)), box('trak', box('tkhd', Buffer.alloc(84)),
    box('mdia', box('mdhd', Buffer.alloc(24)), box('hdlr', Buffer.alloc(24)), box('minf', box('stbl', box('stsz', Buffer.alloc(12)))))));
  const prefix = Buffer.concat([ftyp, movie]);
  const result = Buffer.alloc(size); prefix.copy(result);
  result.writeUInt32BE(size - prefix.length, prefix.length); result.write('mdat', prefix.length + 4);
  result[result.length - 1] = 1;
  return result;
}
export function wav(size = 88244) {
  const b = Buffer.alloc(size);
  b.write('RIFF'); b.writeUInt32LE(size - 8, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(44100, 24); b.writeUInt32LE(88200, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(size - 44, 40);
  return b;
}
export function mp3(size = 417) {
  if (size === 417) { const b = Buffer.alloc(417); b.set([255,251,144,0]); return b; }
  const b = Buffer.alloc(size);
  const padding = size - 417 - 10;
  b.write('ID3'); b[3] = 4;
  for (let i = 0; i < 4; i++) b[9-i] = (padding >> (7 * i)) & 127;
  b.set([255,251,144,0], size - 417);
  return b;
}
export function wire(req) {
  return JSON.stringify({ connected_account_id: req.providerAccountId, endpoint: req.endpoint, method: req.method || 'GET',
    ...(req.body === undefined ? {} : { body: req.body }), ...(req.binary_body === undefined ? {} : { binary_body: req.binary_body }),
    ...(req.parameters?.length ? { parameters: req.parameters } : {}) });
}
export const hash = (b) => createHash('sha256').update(b).digest('hex');
export async function setup(t, config = {}) {
  // Fix the connector's clock too, so offer tests never depend on the run date.
  const now = config.now ?? (() => Date.parse('2026-10-28T12:00:00.000Z'));
  t.mock.method(Date, 'now', now);
  const home = fs.realpathSync(makeHome());
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('offline transport'); });
  const f = await createTestGateway({ home, now, outputsDir: config.hosted ? undefined : join(home, 'outputs') });
  f.file = join(home, 'sample.mp3'); fs.writeFileSync(f.file, mp3());
  f.calls = []; f.measurements = []; f.reply = null;
  const independentMeasure = (req) => Buffer.byteLength(wire(req), 'utf8');
  f.fake.auth.measureProxyBody = (req) => { const count = independentMeasure(req); f.measurements.push({ serialized: wire(req), count }); return count; };
  f.fake.auth.proxy = async (req, options = {}) => {
    const serialized = wire(req);
    if (Buffer.byteLength(serialized) > options.proxyBodyMaxBytes) throw statusSignal(STATUS.VENDOR_ERROR, { reason: 'proxy_body_too_large' });
    f.calls.push({ ...req, serialized, budget: options.proxyBodyMaxBytes });
    return f.reply ? f.reply(req) : f.defaultReply(req);
  };
  f.defaultReply = (req) => {
    const path = new URL(req.endpoint).pathname;
    if (path === '/v3/models/audio/tts') return { status: 200, data: speechAnswer(req.body.text, req.body.voice_id) };
    if (path === '/v3/models/audio/voices' && req.method === 'POST') return { status: 202, data: { data: { voice_id: 'clone_fake-1' } } };
    if (path === '/v3/models/audio/voices') return { status: 200, data: page([voice({ id: config.voiceId ?? 'voice_fake-1' })]) };
    if (path.startsWith('/v3/models/audio/voices/')) return { status: 200, data: { data: req.method === 'DELETE' ? { status: 'ok' } : voice({ id: path.split('/').at(-1) }) } };
    if (path === '/v3/users/me') return { status: 200, data: { data: { billing_type: 'wallet', wallet: { currency: 'usd', remaining_balance: 3 }, extra: ADDRESS } } };
    if (path === '/v3/api_keys/self') return { status: 200, data: { data: { scope_mode: 'custom', scopes: ['voices:write','videos:write','assets:write','avatars:read','account:read'], api_key: SIGNATURE } } };
    if (path === '/v3/avatars') return { status: 200, data: page([avatarGroup()]) };
    if (path === '/v3/avatars/looks') return { status: 200, data: page([avatarLook()]) };
    if (path.startsWith('/v3/avatars/looks/')) return { status: 200, data: { data: avatarLook({ id: path.split('/').at(-1) }) } };
    if (path === '/v3/assets') {
      const body = Buffer.from(req.binary_body.base64, 'base64');
      const split = body.indexOf('\r\n\r\n') + 4;
      const tail = body.lastIndexOf('\r\n--');
      return { status: 200, data: { data: { asset_id: 'asset_fake-1', mime_type: body.subarray(0, split).includes('audio/wav') ? 'audio/wav' : 'audio/mpeg', size_bytes: tail - split, url: ADDRESS } } };
    }
    if (path === '/v3/videos') return { status: 200, data: { data: { video_id: 'video_fake-1', status: 'waiting', output_format: 'mp4', extra: ADDRESS } } };
    if (path.startsWith('/v3/videos/')) return { status: 200, data: { data: videoAnswer({ id: path.split('/').at(-1), ...(config.video ? {} : { status: 'pending', duration: null }) }) } };
    assertUnreachable(path);
  };
  f.media = transport(t, { host: config.video ? 'files2.heygen.ai' : 'resource2.heygen.ai', chunks: [config.video ? mp4() : wav()], ...config.media });
  if (!config.unbound) for (const module of MODULES) await putActive(f.store, f.fake, { service: 'heygen', module });
  return f;
}
function assertUnreachable(path) { throw new Error(`unexpected invented endpoint ${path}`); }
export const run = (f, id, input = {}) => confirmCall(f.gw, { action: `heygen.${id}`, input });
export function noPrivate(value) {
  const s = JSON.stringify(value);
  for (const needle of [ADDRESS, VIDEO_ADDRESS, PRIVATE, SIGNATURE, 'audio_url', 'video_url', 'thumbnail_url', 'gif_url', 'video_page_url', 'preview_audio_url', 'preview_image_url', 'preview_video_url', 'output_file', 'raw-envelope-canary']) {
    if (s.includes(needle)) throw new Error(`private field escaped: ${needle === ADDRESS ? 'address' : needle}`);
  }
}
