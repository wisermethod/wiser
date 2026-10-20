function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function unexpected(endpoint, method) {
  return { status: 'vendor_error', endpoint, method, reason: 'unexpected answer' };
}

async function proxyData(ctx, request) {
  const result = await ctx.proxy(request);
  return isObject(result) && Object.hasOwn(result, 'data') ? result.data : result;
}

// Flat scans avoid the recursive base64 regex that fails on megabyte envelopes.
// Buffer's decoder alone is permissive; re-encoding also checks padding bits.
function decodeAudio(audio) {
  if (typeof audio !== 'string' || audio.length === 0 || audio.length % 4 !== 0) return null;
  let body = audio;
  if (body.endsWith('==')) body = body.slice(0, -2);
  else if (body.endsWith('=')) body = body.slice(0, -1);
  if (/[^A-Za-z0-9+/]/.test(body)) return null;
  const bytes = Buffer.from(audio, 'base64');
  return bytes.toString('base64') === audio ? bytes : null;
}

function wordTimings({ graph_chars, graph_times }) {
  // Keep a timing alongside every code point while dropping complete tags.
  // A tag inside a word does not split it; whitespace is the word boundary.
  const text = graph_chars.join('');
  const times = graph_chars.flatMap((char, i) => Array.from(char, () => graph_times[i]));
  const words = [];
  let offset = 0;
  let word = null;
  for (const match of text.matchAll(/\[[^\]]*\]|<[^>]*>|\s+|[^\s[<]+|[\s\S]/gu)) {
    const token = match[0];
    const length = Array.from(token).length;
    if (/^\s/u.test(token)) {
      if (word) words.push(word);
      word = null;
    } else if (!(token.startsWith('[') && token.endsWith(']')) &&
               !(token.startsWith('<') && token.endsWith('>'))) {
      if (!word) word = { text: '', start: times[offset][0], end: 0 };
      word.text += token;
      word.end = times[offset + length - 1][1];
    }
    offset += length;
  }
  if (word) words.push(word);
  return words;
}

function readSpeech(answer, input, characters) {
  const endpoint = '/v1/tts';
  if (!isObject(answer) || answer.content_type !== 'audio/mpeg' ||
      typeof answer.duration !== 'number' || !Number.isFinite(answer.duration) || answer.duration <= 0 ||
      !isObject(answer.audio_timestamps)) return unexpected(endpoint, 'POST');
  const { graph_chars, graph_times } = answer.audio_timestamps;
  if (!Array.isArray(graph_chars) || !Array.isArray(graph_times) || graph_chars.length !== graph_times.length ||
      !graph_chars.every((char) => typeof char === 'string') ||
      !graph_times.every((pair) => Array.isArray(pair) && pair.length === 2 && pair.every(Number.isFinite))) {
    return unexpected(endpoint, 'POST');
  }
  const data = decodeAudio(answer.audio);
  if (!data) return unexpected(endpoint, 'POST');
  const result = {
    duration: answer.duration,
    content_type: answer.content_type,
    voice_id: input.voice_id,
    characters,
  };
  const timings = input.timings ?? 'words';
  if (timings === 'words') result.timings = wordTimings({ graph_chars, graph_times });
  if (timings === 'characters') result.timings = { graph_chars, graph_times };
  // The gateway consumes the slot before serialising the result. This module
  // never writes a file, and never returns the envelope or audio in metadata.
  return { ...result, output_file: { media_type: 'audio/mpeg', data } };
}

function readVoices(answer, endpoint, custom = false) {
  if (!isObject(answer) || !Array.isArray(answer.voices)) return unexpected(endpoint, 'GET');
  const voices = [];
  for (const voice of answer.voices) {
    if (!isObject(voice) || typeof voice.voice_id !== 'string' || typeof voice.name !== 'string') {
      return unexpected(endpoint, 'GET');
    }
    const projected = { voice_id: voice.voice_id, name: voice.name };
    if (custom) {
      for (const [key, value] of Object.entries(voice)) {
        if (/^(?:language|created|creation)(?:$|_|[A-Z])/.test(key) && typeof value === 'string') {
          projected[key] = value;
        }
      }
    }
    voices.push(projected);
  }
  return {
    voices,
    ...(typeof answer.pagination_token === 'string' ? { pagination_token: answer.pagination_token } : {}),
  };
}

export const modules = {
  voice: {
    async synthesize(input, ctx) {
      // The gateway enforces the published types, required fields, enums and
      // patterns. These are the bounds it deliberately leaves to the module.
      const characters = Array.from(input.text).length;
      if (characters > 5000) return { status: 'invalid_arguments', field: 'text' };
      if (input.speed !== undefined && (!Number.isFinite(input.speed) || input.speed < 0.7 || input.speed > 1.5)) {
        return { status: 'invalid_arguments', field: 'speed' };
      }
      const body = {
        text: input.text,
        voice_id: input.voice_id,
        language: input.language,
        output_format: { codec: 'mp3', sample_rate: input.sample_rate ?? 48000, bit_rate: input.bit_rate ?? 192000 },
        with_timestamps: true,
      };
      for (const key of ['speed', 'text_normalization']) {
        if (input[key] !== undefined) body[key] = input[key];
      }
      const answer = await proxyData(ctx, { endpoint: '/v1/tts', method: 'POST', body });
      return readSpeech(answer, input, characters);
    },
    async list_voices(_input, ctx) {
      const endpoint = '/v1/tts/voices';
      return readVoices(await proxyData(ctx, { endpoint, method: 'GET' }), endpoint);
    },
    async list_custom_voices(input, ctx) {
      if (input.limit !== undefined && (input.limit < 1 || input.limit > 1000)) {
        return { status: 'invalid_arguments', field: 'limit' };
      }
      const endpoint = '/v1/custom-voices';
      const parameters = [];
      for (const key of ['limit', 'pagination_token']) {
        if (input[key] !== undefined) parameters.push({ name: key, value: String(input[key]), type: 'query' });
      }
      return readVoices(await proxyData(ctx, { endpoint, method: 'GET', parameters }), endpoint, true);
    },
  },
};
