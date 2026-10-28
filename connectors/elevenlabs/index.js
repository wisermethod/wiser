import fs from 'node:fs';
import crypto from 'node:crypto';
import { homedir } from 'node:os';
import { basename, dirname, extname, isAbsolute, join, parse, resolve, sep } from 'node:path';

const AUDIO_MAX = 16777216;
const UPLOAD_MAX = 3000000;
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const stopped = (v) => object(v) && typeof v.status === 'string';
const GATEWAY_STOPS = new Set(['needs_connect', 'needs_provider', 'needs_confirmation', 'denied', 'needs_connector',
  'needs_provider_capability', 'invalid_arguments', 'teardown_incomplete', 'needs_subscription', 'classifier_unbound', 'local_only']);
const invalid = (field, reason) => ({ status: 'invalid_arguments', field, ...(reason ? { reason } : {}) });
const unexpected = (endpoint, method) => ({ status: 'vendor_error', endpoint, method, reason: 'unexpected answer' });

function failure(value, endpoint, method) {
  const signal = value?.object ?? value;
  // Preserve gateway stops without exception text, headers or vendor payloads.
  if (stopped(signal) && GATEWAY_STOPS.has(signal.status)) return { status: signal.status };
  const code = signal?.http_status ?? (typeof signal?.status === 'number' ? signal.status : null);
  const raw = signal?.provider_codes ?? signal?.error?.provider_codes;
  const codes = Array.isArray(raw) ? [...new Set(raw.filter(Number.isSafeInteger))].slice(0, 10) : [];
  return { status: 'vendor_error', endpoint, method, http_status: Number.isSafeInteger(code) ? code : null,
    ...(codes.length ? { provider_codes: codes } : {}) };
}

async function request(ctx, req) {
  let res;
  try { res = await ctx.proxy(req); }
  catch (error) { return { stop: failure(error, req.endpoint, req.method) }; }
  if (res?.supported === false) return { stop: { status: 'needs_provider_capability' } };
  if (stopped(res) || res?.error || res?.status >= 400) return { stop: failure(res, req.endpoint, req.method) };
  const data = res?.data;
  if (object(data) && (data.error || data.success === false || data.successful === false)) return { stop: unexpected(req.endpoint, req.method) };
  return { data };
}

function decodeAudio(audio) {
  // Bound allocation first; a flat alphabet scan avoids recursive regex limits.
  if (typeof audio !== 'string' || !audio.length || audio.length > 4 * Math.ceil(AUDIO_MAX / 3) || audio.length % 4) return null;
  const padding = audio.endsWith('==') ? 2 : audio.endsWith('=') ? 1 : 0;
  if (/[^A-Za-z0-9+/]/.test(audio.slice(0, audio.length - padding))) return null;
  const length = audio.length / 4 * 3 - padding;
  if (length < 1 || length > AUDIO_MAX) return null;
  const bytes = Buffer.from(audio, 'base64');
  return bytes.length === length && bytes.toString('base64') === audio ? bytes : null;
}

function alignment(value) {
  if (!object(value)) return null;
  const chars = value.characters;
  const starts = value.character_start_times_seconds;
  const ends = value.character_end_times_seconds;
  if (!Array.isArray(chars) || !chars.length || !Array.isArray(starts) || !Array.isArray(ends) ||
      chars.length !== starts.length || chars.length !== ends.length) return null;
  for (let i = 0; i < chars.length; i += 1) {
    if (typeof chars[i] !== 'string' || !Number.isFinite(starts[i]) || !Number.isFinite(ends[i]) ||
        starts[i] < 0 || ends[i] < starts[i] || (i > 0 && starts[i] < starts[i - 1])) return null;
  }
  return { characters: [...chars], character_start_times_seconds: [...starts], character_end_times_seconds: [...ends] };
}

// Platform user-config location, matching gateway/src/paths.js. Screen names
// and metadata only; never open a credential or enumerate its contents.
function credentialDir() {
  if (process.platform === 'win32') return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'wiser');
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'wiser');
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'wiser');
}

function canonicalName(path) {
  const tail = [];
  let head = resolve(path);
  for (;;) {
    try { return join(fs.realpathSync(head), ...tail.reverse()); }
    catch {
      const parent = dirname(head);
      if (parent === head) return head;
      tail.push(basename(head));
      head = parent;
    }
  }
}

const inside = (child, parent) => child === parent || child.startsWith(parent.endsWith(sep) ? parent : parent + sep);
const forbidden = (name) => /^memory$/i.test(name) || /^\.env(?:\.|$)/i.test(name);
const sameIdentity = (a, b) => a.dev === b.dev && a.ino === b.ino;
const unchanged = (a, b) => sameIdentity(a, b) && a.size === b.size && a.nlink === b.nlink &&
  a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;

function screen(path) {
  if (!isAbsolute(path) || path.includes('\0')) throw new Error('path');
  const credential = resolve(credentialDir());
  const protectedDir = canonicalName(credential);
  // Inspect the original spelling too, including a link followed by .. .
  let here = parse(path).root;
  const ancestors = [];
  // Windows accepts both separators; elsewhere a backslash is part of a name.
  for (const component of path.slice(here.length).split(sep === '\\' ? /[\\/]/ : '/')) {
    if (!component || component === '.') continue;
    if (forbidden(component)) throw new Error('protected');
    here = resolve(here, component);
    if (inside(here, credential) || inside(here, protectedDir)) throw new Error('protected');
    const stats = fs.lstatSync(here, { bigint: true });
    if (stats.isSymbolicLink()) throw new Error('link');
    ancestors.push({ path: here, stats });
  }
  const canonical = fs.realpathSync(here);
  if (canonical.split(sep).some(forbidden) || inside(canonical, protectedDir)) throw new Error('protected');
  const stats = fs.lstatSync(canonical, { bigint: true });
  if (!stats.isFile() || stats.nlink !== 1n || extname(basename(canonical)).toLowerCase() !== '.mp3') throw new Error('file');
  return { path: canonical, stats, ancestors };
}

function readUpload(path) {
  let fd;
  try {
    const screened = screen(path);
    if (screened.stats.size > BigInt(UPLOAD_MAX)) return invalid('path', `file size ${screened.stats.size} exceeds ${UPLOAD_MAX} bytes`);
    if (screened.stats.size === 0n) return invalid('path', 'file must be nonempty');
    fd = fs.openSync(screened.path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    const opened = fs.fstatSync(fd, { bigint: true });
    if (!opened.isFile() || !unchanged(screened.stats, opened)) return invalid('path', 'file changed');
    const bytes = Buffer.alloc(Number(opened.size) + 1);
    let read = 0;
    while (read < bytes.length) {
      const n = fs.readSync(fd, bytes, read, bytes.length - read, null);
      if (!n) break;
      read += n;
    }
    if (read !== Number(opened.size) || !unchanged(opened, fs.fstatSync(fd, { bigint: true }))) return invalid('path', 'file changed');
    const after = screen(path);
    if (after.path !== screened.path || !unchanged(opened, after.stats) ||
        screened.ancestors.some(({ path: ancestor, stats }) => !sameIdentity(stats, fs.lstatSync(ancestor, { bigint: true })))) return invalid('path', 'file changed');
    return bytes.subarray(0, read);
  } catch {
    return invalid('path', 'requires an unchanged, readable regular MP3, without links or protected path components');
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function multipart(name, bytes) {
  const nameBytes = Buffer.from(name, 'utf8');
  let boundary;
  do { boundary = `wiser-${crypto.randomBytes(24).toString('hex')}`; }
  while (bytes.includes(boundary) || nameBytes.includes(boundary));
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="name"\r\n\r\n`), nameBytes,
    Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="sample.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n`), bytes,
    Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="remove_background_noise"\r\n\r\nfalse\r\n--${boundary}--\r\n`),
  ]);
  return { base64: body.toString('base64'), content_type: `multipart/form-data; boundary=${boundary}` };
}

export const modules = {
  speech: {
    async synthesize(input, ctx) {
      const characters = Array.from(input.text).length;
      if (characters > 5000) return invalid('text');
      const endpoint = `/v1/text-to-speech/${encodeURIComponent(input.voice_id)}/with-timestamps`;
      const { stop, data } = await request(ctx, { endpoint, method: 'POST', body: { text: input.text, model_id: input.model_id },
        parameters: [{ name: 'output_format', value: 'mp3_44100_128', type: 'query' }] });
      if (stop) return stop;
      if (!object(data)) return unexpected(endpoint, 'POST');
      const audio = decodeAudio(data.audio_base64);
      const original = alignment(data.alignment);
      const normalized = data.normalized_alignment == null ? null : alignment(data.normalized_alignment);
      if (!audio || !original || original.characters.join('') !== input.text ||
          (data.normalized_alignment != null && !normalized)) return unexpected(endpoint, 'POST');
      return { voice_id: input.voice_id, model_id: input.model_id, characters, alignment: original,
        ...(normalized ? { normalized_alignment: normalized } : {}), output_file: { media_type: 'audio/mpeg', data: audio } };
    },
  },
  voices: {
    async list(_input, ctx) {
      const endpoint = '/v1/voices';
      const { stop, data } = await request(ctx, { endpoint, method: 'GET' });
      if (stop) return stop;
      if (!object(data) || !Array.isArray(data.voices) || data.voices.some((v) =>
        !object(v) || !['voice_id', 'name', 'category'].every((key) => typeof v[key] === 'string'))) return unexpected(endpoint, 'GET');
      return { voices: data.voices.map(({ voice_id, name, category }) => ({ voice_id, name, category })) };
    },
    async add(input, ctx) {
      for (const [key, max] of [['name', 100], ['path', 4096]]) if (Array.from(input[key]).length > max) return invalid(key);
      const bytes = readUpload(input.path);
      if (!Buffer.isBuffer(bytes)) return bytes;
      const endpoint = '/v1/voices/add';
      const { stop, data } = await request(ctx, { endpoint, method: 'POST', binary_body: multipart(input.name, bytes) });
      if (stop) return stop;
      if (!object(data) || typeof data.voice_id !== 'string' || !data.voice_id.length || typeof data.requires_verification !== 'boolean') return unexpected(endpoint, 'POST');
      return { voice_id: data.voice_id, requires_verification: data.requires_verification };
    },
    async delete(input, ctx) {
      const endpoint = `/v1/voices/${encodeURIComponent(input.voice_id)}`;
      const { stop, data } = await request(ctx, { endpoint, method: 'DELETE' });
      if (stop) return stop;
      if (!object(data) || data.status !== 'ok') return unexpected(endpoint, 'DELETE');
      return { deleted: true, voice_id: input.voice_id };
    },
  },
  models: {
    async list(_input, ctx) {
      const endpoint = '/v1/models';
      const { stop, data } = await request(ctx, { endpoint, method: 'GET' });
      if (stop) return stop;
      if (!Array.isArray(data)) return unexpected(endpoint, 'GET');
      const models = [];
      for (const model of data) {
        if (!object(model) || typeof model.model_id !== 'string' || typeof model.name !== 'string' ||
            typeof model.can_do_text_to_speech !== 'boolean') return unexpected(endpoint, 'GET');
        const item = { model_id: model.model_id, name: model.name, can_do_text_to_speech: model.can_do_text_to_speech };
        if (Object.hasOwn(model, 'maximum_text_length_per_request')) {
          if (!Number.isInteger(model.maximum_text_length_per_request) || model.maximum_text_length_per_request <= 0) return unexpected(endpoint, 'GET');
          item.maximum_text_length_per_request = model.maximum_text_length_per_request;
        }
        if (Object.hasOwn(model, 'model_rates')) {
          if (!object(model.model_rates)) return unexpected(endpoint, 'GET');
          const rates = {};
          for (const key of ['character_cost_multiplier', 'cost_discount_multiplier']) if (Object.hasOwn(model.model_rates, key)) {
            if (!Number.isFinite(model.model_rates[key]) || model.model_rates[key] < 0) return unexpected(endpoint, 'GET');
            rates[key] = model.model_rates[key];
          }
          if (Object.keys(rates).length) item.model_rates = rates;
        }
        models.push(item);
      }
      return { models };
    },
  },
};
