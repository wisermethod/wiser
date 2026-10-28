import fs from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createTestGateway, makeHome, putActive, confirmCall } from '../../../gateway/test/fake-provider.js';
import { transport } from '../../../gateway/test/media-transport.js';
import { statusSignal, STATUS } from '../../../gateway/src/errors.js';

export const MODULES = ['speech','voices','avatars','account'];
export const PRIVATE = 'invented-private-path-123456789';
export const SIGNATURE = 'invented-signature-value-987654321';
export const ADDRESS = `https://resource2.heygen.ai/${PRIVATE}/speech.wav?sig=${SIGNATURE}`;
export const voice = (extra = {}) => ({ id: 'voice_fake-1', name: 'Invented clone', mode: 'instant', status: 'ACTIVE', language: 'en', preview_audio_url: ADDRESS, ...extra });
export const characterTimings = (text) => Array.from(text, (text, i) => ({ text, start_time: i / 10, end_time: (i + 1) / 10 }));
export const scene = (text = 'Hi', model = 'heygen-voice-1-turbo-free') => ({ text, voice_id: 'voice_fake-1', model });
export const page = (data = [], extra = {}) => ({ data, has_more: false, ...extra });
export const speechAnswer = (text) => ({ data: { audio_url: ADDRESS, duration: 1.25, original_characters: characterTimings(text), preview: ADDRESS, extra: ADDRESS } });
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
  const home = fs.realpathSync(makeHome());
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('offline transport'); });
  const f = await createTestGateway({ home, outputsDir: config.hosted ? undefined : join(home, 'outputs') });
  f.file = join(home, 'sample.mp3'); fs.writeFileSync(f.file, mp3());
  f.calls = []; f.measurements = []; f.reply = null;
  const independentMeasure = (req) => Buffer.byteLength(wire(req), 'utf8');
  f.fake.auth.measureProxyBody = (req) => { const count = independentMeasure(req); f.measurements.push({ serialized: wire(req), count }); return count; };
  f.fake.auth.proxy = async (req, options = {}) => {
    const serialized = wire(req);
    if (Buffer.byteLength(serialized) > options.proxyBodyMaxBytes) throw statusSignal(STATUS.VENDOR_ERROR, { reason: 'proxy_body_too_large' });
    f.calls.push({ ...req, serialized, budget: options.proxyBodyMaxBytes });
    if (f.reply) return f.reply(req);
    const path = new URL(req.endpoint).pathname;
    if (path === '/v3/models/audio/tts') return { status: 200, data: speechAnswer(req.body.text) };
    if (path === '/v3/models/audio/voices' && req.method === 'POST') return { status: 202, data: { data: { voice_id: 'clone_fake-1' } } };
    if (path === '/v3/models/audio/voices') return { status: 200, data: page([voice()]) };
    if (path.startsWith('/v3/models/audio/voices/')) return { status: 200, data: { data: req.method === 'DELETE' ? { status: 'ok' } : voice({ id: path.split('/').at(-1) }) } };
    if (path === '/v3/users/me') return { status: 200, data: { data: { billing_type: 'wallet', wallet: { currency: 'usd', remaining_balance: 3 }, extra: ADDRESS } } };
    if (path === '/v3/api_keys/self') return { status: 200, data: { data: { scope_mode: 'custom', scopes: ['voices:write','videos:write','assets:write','avatars:read','account:read'], api_key: SIGNATURE } } };
    if (path === '/v3/avatars' || path === '/v3/avatars/looks') return { status: 200, data: page() };
    assertUnreachable(path);
  };
  f.media = transport(t, { host: 'resource2.heygen.ai', chunks: [wav()], ...config.media });
  if (!config.unbound) for (const module of MODULES) await putActive(f.store, f.fake, { service: 'heygen', module });
  return f;
}
function assertUnreachable(path) { throw new Error(`unexpected invented endpoint ${path}`); }
export const run = (f, id, input = {}) => confirmCall(f.gw, { action: `heygen.${id}`, input });
export function noPrivate(value) {
  const s = JSON.stringify(value);
  for (const needle of [ADDRESS, PRIVATE, SIGNATURE, 'audio_url', 'preview_audio_url', 'preview_image_url', 'preview_video_url', 'output_file', 'raw-envelope-canary']) {
    if (s.includes(needle)) throw new Error(`private field escaped: ${needle === ADDRESS ? 'address' : needle}`);
  }
}
