// Network access is exclusively through action-bound gateway capabilities.
import { inspectWav, readUpload } from './audio.js';
import { randomUUID } from 'node:crypto';
import { inspectMp4 } from './video.js';

const API = 'https://api.heygen.com';
const VOICES = '/v3/models/audio/voices';
const BUDGET = 4100000;
const WAV_MAX = 67108864;
const MP4_MAX = 268435456;
const TURBO_FREE_END = Date.parse('2026-12-01T00:00:00.000Z');
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const id = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);
const text = (v) => typeof v === 'string';
const length = (v) => Array.from(v).length;
const invalid = (field, reason) => ({ status: 'invalid_arguments', field, ...(reason ? { reason } : {}) });
const unexpected = (endpoint, method) => ({ status: 'vendor_error', endpoint, method, reason: 'unexpected answer' });
const STOPS = new Set(['needs_connect','needs_provider','needs_confirmation','denied','needs_connector','needs_provider_capability','invalid_arguments','local_only']);
const MEDIA_DETAILS = new Set(['invalid_request','invalid_url','host_refused','media_type_refused','dns_failed','address_refused','transport_failed','redirect_refused','http_refused','encoding_refused','length_refused','empty','truncated','over_cap','deadline','allocation_failed','inactive']);
function failure(error, endpoint, method) {
  const v = error?.object ?? error;
  if (STOPS.has(v?.status)) return { status: v.status };
  if (v?.reason === 'proxy_body_too_large') return { status: 'vendor_error', reason: 'proxy_body_too_large' };
  if (v?.reason === 'media_download_failed') return { status: 'vendor_error', reason: 'media_download_failed',
    ...(MEDIA_DETAILS.has(v.detail) ? { detail: v.detail } : {}), ...(Number.isInteger(v.http_status) ? { http_status: v.http_status } : {}) };
  const code = v?.http_status ?? (typeof v?.status === 'number' ? v.status : null);
  return { status: 'vendor_error', endpoint, method, http_status: Number.isInteger(code) && code >= 100 && code <= 599 ? code : null };
}
const embeddedError = (v) => object(v) && (v.error != null || v.success === false || v.successful === false);
async function request(ctx, path, method = 'GET', fields = {}) {
  const req = { endpoint: API + path, method, ...fields };
  try {
    // Context also applies and snapshots this budget, and the provider checks the exact
    // immutable serialization at send time. Preflight never sends or observes transport.
    let count;
    try { count = await ctx.measureProxyBody(req); } catch { return { stop: { status: 'needs_provider_capability' } }; }
    if (!Number.isSafeInteger(count) || count < 0) return { stop: { status: 'needs_provider_capability' } };
    if (count > BUDGET) return { stop: { status: 'vendor_error', reason: 'proxy_body_too_large' } };
    const res = await ctx.proxy(req);
    if (res?.supported === false) return { stop: { status: 'needs_provider_capability' } };
    if (typeof res?.status === 'string' || res?.error || res?.status >= 400) return { stop: failure(res, req.endpoint, method) };
    if (!Number.isInteger(res?.status) || res.status < 200 || res.status >= 300 ||
        !object(res.data) || embeddedError(res.data) || embeddedError(res.data.data)) return { stop: unexpected(req.endpoint, method) };
    return { envelope: res.data, data: res.data.data, http_status: res.status };
  } catch (error) { return { stop: failure(error, req.endpoint, method) }; }
}
function bounds(input, lengths = {}, numbers = {}) {
  // Residual action bounds only. The gateway owns schema validation.
  for (const [key, max] of Object.entries(lengths)) if (input[key] !== undefined && length(input[key]) > max) return invalid(key);
  for (const [key, [min, max]] of Object.entries(numbers)) if (input[key] !== undefined && (!Number.isFinite(input[key]) || input[key] < min || input[key] > max)) return invalid(key);
}
const query = (input, keys) => ({ parameters: keys.filter((key) => input[key] !== undefined).map((key) => ({ name: key, value: input[key], type: 'query' })) });
const preview = (v) => v == null || typeof v === 'string';
// Failure messages are never forwarded. Unknown vendor codes are omitted.
const FAILURE_CODES = new Set(['AUDIO_TOO_SHORT','AUDIO_TOO_LONG','AUDIO_INVALID','NO_SPEECH_DETECTED','INSUFFICIENT_AUDIO_QUALITY','VOICE_CLONE_FAILED','TRAINING_FAILED','INTERNAL_ERROR']);
// HeyGen names a voice's id `voice_id` in both the list and a single voice, as read live on 2026-10-28;
// this connector returns it as `id`, the key its callers read.
function voice(v) {
  if (!object(v) || !id(v.voice_id) || !text(v.name) || !['instant','professional'].includes(v.mode) ||
      !['PENDING','ACTIVE','FAILED'].includes(v.status) || !(v.language == null || text(v.language)) || !preview(v.preview_audio_url)) return null;
  return { id: v.voice_id, name: v.name, mode: v.mode, status: v.status, language: v.language ?? null,
    preview_audio_present: Boolean(v.preview_audio_url), ...(FAILURE_CODES.has(v.failure_code) ? { failure_code: v.failure_code } : {}) };
}
function group(v) {
  if (!object(v) || !id(v.id) || !text(v.name) || !Number.isSafeInteger(v.looks_count) || v.looks_count < 0 || !preview(v.preview_image_url)) return null;
  const out = { id: v.id, name: v.name, looks_count: v.looks_count, preview_image_present: Boolean(v.preview_image_url) };
  for (const key of ['status','consent_status','default_voice_id']) if (Object.hasOwn(v, key)) {
    if (v[key] !== null && !(key === 'default_voice_id' ? id(v[key]) : safeState(v[key]))) return null;
    out[key] = v[key];
  }
  return out;
}
const safeState = (v) => typeof v === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(v);
function look(v) {
  if (!object(v) || !id(v.id) || !text(v.name) || !(v.group_id == null || id(v.group_id)) ||
      !['studio_avatar','digital_twin','photo_avatar'].includes(v.avatar_type) || !(v.status === null || safeState(v.status)) ||
      !(v.default_voice_id == null || id(v.default_voice_id)) || !Array.isArray(v.supported_api_engines) ||
      v.supported_api_engines.some((e) => !safeState(e)) || !preview(v.preview_image_url) || !preview(v.preview_video_url)) return null;
  return { id: v.id, name: v.name, group_id: v.group_id ?? null, avatar_type: v.avatar_type, status: v.status,
    default_voice_id: v.default_voice_id ?? null, supported_api_engines: [...v.supported_api_engines],
    preview_image_present: Boolean(v.preview_image_url), preview_video_present: Boolean(v.preview_video_url) };
}
function page(envelope, project, input, key) {
  if (!object(envelope) || !Array.isArray(envelope.data) || typeof envelope.has_more !== 'boolean') return null;
  const token = envelope.next_token;
  if (envelope.has_more ? !text(token) || length(token) < 1 || length(token) > 2048 || token === input.token : token != null && token !== '') return null;
  const items = envelope.data.map(project);
  if (items.some((v) => v === null) || (envelope.has_more && !items.length)) return null;
  return { [key]: items, has_more: envelope.has_more, next_token: envelope.has_more ? token : null };
}
async function privateVoice(ctx, voiceId) {
  const seen = new Set();
  let token;
  for (;;) {
    const input = { type: 'private', limit: 100, ...(token ? { token } : {}) };
    const res = await request(ctx, VOICES, 'GET', query(input, ['type','limit','token']));
    if (res.stop) return res;
    const got = page(res.envelope, voice, input, 'voices');
    if (!got) return { stop: unexpected(API + VOICES, 'GET') };
    if (got.voices.some((v) => v.id === voiceId)) return { found: true };
    if (!got.has_more) return { found: false };
    if (seen.has(got.next_token)) return { stop: unexpected(API + VOICES, 'GET') };
    seen.add(got.next_token); token = got.next_token;
  }
}
function wallet(v) {
  if (!object(v) || !safeState(v.billing_type)) return null;
  if (v.wallet == null) return { billing_type: v.billing_type, wallet: null };
  if (!object(v.wallet) || !text(v.wallet.currency) || !Number.isFinite(v.wallet.remaining_balance)) return null;
  return { billing_type: v.billing_type, wallet: { currency: v.wallet.currency, remaining_balance: v.wallet.remaining_balance } };
}
function timings(v, scene) {
  if (!Array.isArray(v) || !v.length) return null;
  const out = []; let previous = -1;
  for (const c of v) {
    if (!object(c) || !text(c.text) || !Number.isFinite(c.start_time) || !Number.isFinite(c.end_time) ||
        c.start_time < 0 || c.end_time < c.start_time || c.start_time < previous) return null;
    out.push({ text: c.text, start_time: c.start_time, end_time: c.end_time }); previous = c.start_time;
  }
  return out.map((c) => c.text).join('') === scene ? out : null;
}

const VIDEO_STATES = new Set(['pending', 'waiting', 'processing', 'completed', 'failed']);
const VIDEO_FAILURES = new Set(['AUDIO_INVALID', 'AVATAR_NOT_READY', 'INSUFFICIENT_CREDITS', 'VIDEO_GENERATION_FAILED', 'INTERNAL_ERROR']);
function video(v, videoId) {
  if (!object(v) || !id(v.id) || v.id !== videoId || !safeState(v.status) ||
      !(v.duration == null || (Number.isFinite(v.duration) && v.duration >= 0))) return null;
  return { video_id: v.id, video_status: VIDEO_STATES.has(v.status) ? v.status : 'unknown', duration: v.duration ?? null,
    ...(VIDEO_FAILURES.has(v.failure_code) ? { failure_code: v.failure_code } : {}) };
}
async function selectedLook(ctx, avatarId) {
  const path = `/v3/avatars/looks/${encodeURIComponent(avatarId)}`;
  const read = await request(ctx, path); if (read.stop) return read;
  const selected = look(read.data);
  if (!selected || selected.id !== avatarId) return { stop: unexpected(API + path, 'GET') };
  if (selected.status !== 'completed' || !selected.supported_api_engines.includes('avatar_iv'))
    return { stop: invalid('avatar_id', 'requires a completed look supporting Avatar IV') };
  // A group id is a relationship returned by HeyGen, never inferred from the look id.
  // Missing optional group states do not invent consent; explicit non-ready states stop.
  if (selected.group_id !== null) {
    const seen = new Set(); let token;
    for (;;) {
      const input = { limit: 50, ...(token ? { token } : {}) };
      const res = await request(ctx, '/v3/avatars', 'GET', query(input, ['limit', 'token']));
      if (res.stop) return res;
      const got = page(res.envelope, group, input, 'groups');
      if (!got) return { stop: unexpected(API + '/v3/avatars', 'GET') };
      const owner = got.groups.find((v) => v.id === selected.group_id);
      if (owner) {
        if ((owner.status != null && !['completed', 'ready', 'active'].includes(owner.status.toLowerCase())) ||
            (owner.consent_status != null && !['approved', 'accepted', 'consented', 'verified', 'completed'].includes(owner.consent_status.toLowerCase())))
          return { stop: invalid('avatar_id', 'avatar group is not ready or consented') };
        break;
      }
      if (!got.has_more) return { stop: invalid('avatar_id', 'look group membership unavailable') };
      if (seen.has(got.next_token)) return { stop: unexpected(API + '/v3/avatars', 'GET') };
      seen.add(got.next_token); token = got.next_token;
    }
  }
  return { selected };
}

export const modules = {
  speech: {
    async synthesize(input, ctx) {
      const bad = bounds(input, { text: 5000, language: 32 }, { expressiveness_boost: [0, 1] });
      if (bad) return bad;
      if (input.model === 'heygen-voice-1-turbo-free' && Date.now() >= TURBO_FREE_END)
        return invalid('model', 'turbo_free_offer_ended');
      const membership = await privateVoice(ctx, input.voice_id);
      if (membership.stop) return membership.stop;
      if (!membership.found) return invalid('voice_id', 'requires a private instant ACTIVE voice');
      const read = await request(ctx, `${VOICES}/${encodeURIComponent(input.voice_id)}`);
      if (read.stop) return read.stop;
      const selected = voice(read.data);
      if (!selected || selected.id !== input.voice_id) return unexpected(API + VOICES, 'GET');
      if (selected.mode !== 'instant' || selected.status !== 'ACTIVE') return invalid('voice_id', 'requires a private instant ACTIVE voice');
      const characters = length(input.text);
      if (input.model !== 'heygen-voice-1-turbo-free') {
        const readWallet = await request(ctx, '/v3/users/me');
        if (readWallet.stop) return readWallet.stop;
        const w = wallet(readWallet.data);
        const cost = characters * (input.model === 'heygen-voice-1' ? 15 : 4) / 1000000;
        if (!w || w.billing_type !== 'wallet' || w.wallet?.currency !== 'usd' || w.wallet.remaining_balance < cost)
          return { status: 'vendor_error', reason: 'wallet_unavailable_or_insufficient' };
      }
      const path = '/v3/models/audio/tts';
      const body = { text: input.text, voice_id: input.voice_id, model: input.model, with_timestamps: true,
        expressiveness_boost: input.expressiveness_boost ?? 0.5, ...(input.language === undefined ? {} : { language: input.language }) };
      const res = await request(ctx, path, 'POST', { body });
      if (res.stop) return res.stop;
      const v = res.data;
      const original = timings(v?.original_characters, input.text);
      if (!object(v) || !Number.isFinite(v.duration) || v.duration <= 0 || !text(v.audio_url) || !original) return unexpected(API + path, 'POST');
      let bytes;
      try { bytes = await ctx.downloadMedia({ url: v.audio_url, media_type: 'audio/wav' }); }
      catch (error) { return failure(error, API + path, 'POST'); }
      if (!Buffer.isBuffer(bytes) || bytes.length > WAV_MAX) return unexpected(API + path, 'POST');
      const wav = inspectWav(bytes, true);
      if (!wav) return unexpected(API + path, 'POST');
      return { model: input.model, characters, duration: v.duration, sample_duration: wav.duration,
        original_characters: original, output_file: { media_type: 'audio/wav', data: bytes } };
    },
  },
  voices: {
    async list(input, ctx) {
      const bad = bounds(input, { token: 2048 }, { limit: [1, 100] }); if (bad) return bad;
      const res = await request(ctx, VOICES, 'GET', query(input, ['type','limit','token']));
      return res.stop ?? page(res.envelope, voice, input, 'voices') ?? unexpected(API + VOICES, 'GET');
    },
    async get(input, ctx) {
      const path = `${VOICES}/${encodeURIComponent(input.voice_id)}`;
      const res = await request(ctx, path); if (res.stop) return res.stop;
      const v = voice(res.data);
      return v && v.id === input.voice_id ? { voice: v } : unexpected(API + path, 'GET');
    },
    async add(input, ctx) {
      const bad = bounds(input, { name: 64, path: 4096, language: 32 }); if (bad) return bad;
      const audio = readUpload(input.path); if (audio.status) return audio;
      const body = { mode: 'instant', name: input.name, audio: [{ type: 'base64', media_type: audio.media_type, data: audio.bytes.toString('base64') }],
        similarity: input.similarity ?? 'max', remove_background_noise: input.remove_background_noise ?? false,
        ...(input.language === undefined ? {} : { language: input.language }) };
      const res = await request(ctx, VOICES, 'POST', { body,
        parameters: [{ name: 'Idempotency-Key', value: input.idempotency_key, type: 'header' }] });
      if (res.stop) return res.stop;
      return id(res.data?.voice_id) ? { voice_id: res.data.voice_id, accepted: true } : unexpected(API + VOICES, 'POST');
    },
    async delete(input, ctx) {
      const member = await privateVoice(ctx, input.voice_id); if (member.stop) return member.stop;
      if (!member.found) return invalid('voice_id', 'requires a private account voice');
      const path = `${VOICES}/${encodeURIComponent(input.voice_id)}`;
      const res = await request(ctx, path, 'DELETE'); if (res.stop) return res.stop;
      return res.data?.status === 'ok' ? { deleted: true, voice_id: input.voice_id } : unexpected(API + path, 'DELETE');
    },
  },
  avatars: {
    async list(input, ctx) {
      const bad = bounds(input, { token: 2048 }, { limit: [1, 50] }); if (bad) return bad;
      const path = '/v3/avatars';
      const res = await request(ctx, path, 'GET', query(input, ['ownership','limit','token']));
      return res.stop ?? page(res.envelope, group, input, 'groups') ?? unexpected(API + path, 'GET');
    },
    async list_looks(input, ctx) {
      const bad = bounds(input, { token: 2048 }, { limit: [1, 50] }); if (bad) return bad;
      const path = '/v3/avatars/looks';
      const res = await request(ctx, path, 'GET', query(input, ['group_id','ownership','avatar_type','limit','token']));
      if (res.stop) return res.stop;
      const got = page(res.envelope, look, input, 'looks');
      if (!got || got.looks.some((v) => (input.group_id !== undefined && v.group_id !== input.group_id) ||
          (input.avatar_type !== undefined && v.avatar_type !== input.avatar_type))) return unexpected(API + path, 'GET');
      return got;
    },
  },
  assets: {
    async upload_audio(input, ctx) {
      const bad = bounds(input, { path: 4096 }); if (bad) return bad;
      const audio = readUpload(input.path); if (audio.status) return audio;
      let boundary;
      do { boundary = `wiser${randomUUID().replaceAll('-', '')}`; }
      while (audio.bytes.includes(Buffer.from(boundary)));
      const filename = audio.media_type === 'audio/wav' ? 'narration.wav' : 'narration.mp3';
      const head = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${audio.media_type}\r\n\r\n`);
      const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
      const res = await request(ctx, '/v3/assets', 'POST', {
        binary_body: { base64: Buffer.concat([head, audio.bytes, tail]).toString('base64'), content_type: `multipart/form-data; boundary=${boundary}` },
        parameters: [{ name: 'Idempotency-Key', value: input.idempotency_key, type: 'header' }],
      });
      if (res.stop) return res.stop;
      const v = res.data;
      return object(v) && id(v.asset_id) && v.mime_type === audio.media_type && Number.isSafeInteger(v.size_bytes) && v.size_bytes === audio.bytes.length
        ? { asset_id: v.asset_id, mime_type: v.mime_type, size_bytes: v.size_bytes } : unexpected(API + '/v3/assets', 'POST');
    },
  },
  videos: {
    async create(input, ctx) {
      const bad = bounds(input, { script: 5000, title: 200 }); if (bad) return bad;
      const script = input.script !== undefined, voiceId = input.voice_id !== undefined, asset = input.audio_asset_id !== undefined;
      if (!((script && voiceId && !asset) || (asset && !script && !voiceId)))
        return invalid('audio_asset_id', 'supply script and voice_id, or audio_asset_id alone');
      const checked = await selectedLook(ctx, input.avatar_id); if (checked.stop) return checked.stop;
      const read = await request(ctx, '/v3/users/me'); if (read.stop) return read.stop;
      const w = wallet(read.data);
      // Duration is not bounded by this action. A positive wallet is an advisory
      // preflight only; the caller estimates the charge, and HeyGen enforces balance.
      if (!w || w.billing_type !== 'wallet' || w.wallet?.currency !== 'usd' || w.wallet.remaining_balance <= 0)
        return { status: 'vendor_error', reason: 'wallet_unavailable_or_insufficient' };
      const body = { type: 'avatar', avatar_id: checked.selected.id, engine: { type: 'avatar_iv' },
        resolution: input.resolution, aspect_ratio: input.aspect_ratio, output_format: 'mp4',
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.background_color === undefined ? {} : { background: { value: input.background_color } }),
        ...(asset ? { audio_asset_id: input.audio_asset_id } : { script: input.script, voice_id: input.voice_id }) };
      const res = await request(ctx, '/v3/videos', 'POST', { body,
        parameters: [{ name: 'Idempotency-Key', value: input.idempotency_key, type: 'header' }] });
      if (res.stop) return res.stop;
      const v = res.data;
      return object(v) && id(v.video_id) && safeState(v.status) && v.output_format === 'mp4'
        ? { video_id: v.video_id, video_status: VIDEO_STATES.has(v.status) ? v.status : 'unknown', output_format: 'mp4' }
        : unexpected(API + '/v3/videos', 'POST');
    },
    async get(input, ctx) {
      const path = `/v3/videos/${encodeURIComponent(input.video_id)}`;
      const res = await request(ctx, path); if (res.stop) return res.stop;
      return video(res.data, input.video_id) ?? unexpected(API + path, 'GET');
    },
    async download(input, ctx) {
      const path = `/v3/videos/${encodeURIComponent(input.video_id)}`;
      const res = await request(ctx, path); if (res.stop) return res.stop;
      const got = video(res.data, input.video_id);
      if (!got) return unexpected(API + path, 'GET');
      // The caller holds this id; HeyGen also embeds it in the private media path.
      delete got.video_id;
      if (got.video_status !== 'completed') return got;
      if (!(got.duration > 0) || !text(res.data.video_url)) return unexpected(API + path, 'GET');
      // Once the media address is remembered, its path holds this id, so nothing after the download
      // names an endpoint carrying it, or the gateway's guard would turn the answer into a leak.
      let bytes;
      try { bytes = await ctx.downloadMedia({ url: res.data.video_url, media_type: 'video/mp4' }); }
      catch (error) { return failure(error, API + '/v3/videos', 'GET'); }
      if (!Buffer.isBuffer(bytes) || bytes.length > MP4_MAX || !inspectMp4(bytes)) return unexpected(API + '/v3/videos', 'GET');
      return { ...got, output_file: { media_type: 'video/mp4', data: bytes } };
    },
  },
  account: {
    async wallet(_input, ctx) {
      const path = '/v3/users/me'; const res = await request(ctx, path); if (res.stop) return res.stop;
      return wallet(res.data) ?? unexpected(API + path, 'GET');
    },
    async permissions(_input, ctx) {
      const path = '/v3/api_keys/self'; const res = await request(ctx, path); if (res.stop) return res.stop;
      const v = res.data;
      return object(v) && ['custom','full'].includes(v.scope_mode) && Array.isArray(v.scopes) && v.scopes.every(text)
        ? { scope_mode: v.scope_mode, scopes: [...v.scopes] } : unexpected(API + path, 'GET');
    },
  },
};
