function invalidArguments(field) {
  return { status: 'invalid_arguments', field };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// A gateway stop carries a string status and is returned to the caller untouched.
function isStatusObject(value) {
  return isPlainObject(value) && typeof value.status === 'string';
}

function extraKey(input, allowed) {
  if (!isPlainObject(input)) return invalidArguments('input');
  const extra = Object.keys(input).find((key) => !allowed.includes(key));
  return extra === undefined ? null : invalidArguments(extra);
}

// A deliberate SUBSET of BCP 47, not the whole grammar: language, optional script,
// optional region, optional variants. The loose form accepted single-character
// subtags such as "a" and "en-a", which are not tags.
//
// Outside the subset, each excluded on purpose because no translation caller needs it:
// grandfathered and private-use tags; extlang, so "zh-cmn" is refused where "cmn" is
// taken; and extension sequences such as "en-US-u-ca-gregory", which select a calendar
// and mean nothing to a translator. One malformed shape is inside it: a repeated
// variant like "de-DE-1901-1901", which RFC 5646 section 2.2.5 forbids and this
// expression admits. It reaches the vendor and the vendor refuses it, which is a
// vendor_error naming the endpoint rather than a wrong translation.
const BCP47 = /^[A-Za-z]{2,8}(-[A-Za-z]{4})?(-([A-Za-z]{2}|[0-9]{3}))?(-([A-Za-z0-9]{5,8}|[0-9][A-Za-z0-9]{3}))*$/;

function isBcp47(value) {
  return typeof value === 'string' && BCP47.test(value);
}

function isAbsoluteHttpUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

const STRATEGIES = new Set(['mobile', 'desktop']);
const CATEGORIES = new Set(['performance', 'accessibility', 'best-practices', 'seo', 'pwa']);
const INSIGHTS_ENDPOINT = 'https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed';

function omitAudits(data) {
  if (!isPlainObject(data)) return data;
  const lighthouse = data.lighthouseResult;
  if (!isPlainObject(lighthouse)) return data;
  if (!Object.hasOwn(lighthouse, 'audits')) return data;
  const lighthouseResult = { ...lighthouse };
  delete lighthouseResult.audits;
  return { ...data, lighthouseResult };
}

// A runPagespeed success always carries `lighthouseResult`; field data under
// `loadingExperience` is absent for a URL with no CrUX history and is not the test.
function readInsights(payload, audits) {
  const body = isPlainObject(payload) && Object.hasOwn(payload, 'data') ? payload.data : payload;
  if (!isPlainObject(body) || !isPlainObject(body.lighthouseResult)) {
    return { status: 'vendor_error', endpoint: INSIGHTS_ENDPOINT, method: 'GET' };
  }
  return audits === true ? body : omitAudits(body);
}

const FORMATS = new Set(['text', 'html']);
const TRANSLATE_ENDPOINT = 'https://translation.googleapis.com/language/translate/v2';

function isTextList(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 128) return false;
  for (let i = 0; i < value.length; i += 1) {
    const item = value[i];
    if (typeof item !== 'string' || !item.trim()) return false;
  }
  return true;
}

// Each reader below follows one rule: it recognises exactly one success shape and
// refuses everything else rather than forwarding it. An unreadable envelope may be a
// vendor error body, and `standards/script-contract.md` Output forbids returning one;
// a vendor_error names the endpoint and the method and carries no body. Passing the
// value through instead would both leak that body and report a malformed payload as a
// success. Every module answers this the same way on purpose: one hardened reader
// beside a passthrough one is the inconsistency a later reader trusts by mistake.
function readTranslations(payload) {
  const outer = isPlainObject(payload) && Object.hasOwn(payload, 'data') ? payload.data : payload;
  const body = isPlainObject(outer) && Object.hasOwn(outer, 'data') ? outer.data : outer;
  if (isPlainObject(body) && Array.isArray(body.translations)) {
    return { translations: body.translations };
  }
  return { status: 'vendor_error', endpoint: TRANSLATE_ENDPOINT, method: 'GET' };
}

const SYNTHESIZE_ENDPOINT = 'https://texttospeech.googleapis.com/v1/text:synthesize';
const VOICES_ENDPOINT = 'https://texttospeech.googleapis.com/v1/voices';
const INPUT_BYTES = 5000;
// `SSML_VOICE_GENDER_UNSPECIFIED` means no preference and is a real member, so it is
// accepted rather than refused; it is equivalent to omitting the field. `NEUTRAL` is
// a member Google documents as not yet supported, which is the vendor's refusal to
// make and not this module's.
const GENDERS = new Set(['SSML_VOICE_GENDER_UNSPECIFIED', 'MALE', 'FEMALE', 'NEUTRAL']);

// Taken from Google's live v1 discovery document, revision 20260827, which is
// generated from the running service and is why it is the authority here: the HTML
// enum page for v1 omits `PCM` and `M4A` and is stale against it. An earlier version
// of this module refused those two on the strength of that page, which would have
// failed a caller asking for headerless PCM without ever reaching Google.
// `AUDIO_ENCODING_UNSPECIFIED` is in the enum and is documented as returning an
// invalid-argument error, so it stays refused locally rather than spent on a round
// trip that cannot succeed.
const ENCODINGS = new Set(['MP3', 'LINEAR16', 'OGG_OPUS', 'MULAW', 'ALAW', 'PCM', 'M4A']);

// int32 on the wire. A larger safe integer passes a plain integer check and is then
// refused by the vendor, which spends a call to learn what this bound already knows.
const MAX_INT32 = 2147483647;

// Base64 as the vendor emits it for `audioContent`: `format: "byte"` in the v1
// discovery document, which is ProtoJSON's standard alphabet with padding.
//
// **Deliberately not a regular expression**, and the reason is measured rather than
// stylistic. The obvious form, `(?:[A-Za-z0-9+/]{4})*` followed by an optional
// padding group, backtracks per four-character group and throws `RangeError:
// Maximum call stack size exceeded` on V8 at around five megabytes of base64. Five
// megabytes is roughly 109 seconds of LINEAR16 at 24 kHz, which 5000 bytes of input
// text reaches easily, so that form destroys the result of a synthesis the caller
// has already paid for. Measured here at 2 MB passing in 6 ms and 5 MB throwing.
// The length check plus one flat negated-class scan is linear and cannot recurse.
//
// What this establishes is narrow: the field is well-formed base64. It does not
// establish that the decoded bytes are audio, and short words in the alphabet such
// as "test" are well-formed base64. It is enough to separate a real payload from an
// ordinary diagnostic sentence, which is the case it exists for.
const NON_BASE64 = /[^A-Za-z0-9+/]/;

function isBase64(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length % 4 !== 0) return false;
  let body = value;
  if (body.endsWith('==')) body = body.slice(0, -2);
  else if (body.endsWith('=')) body = body.slice(0, -1);
  return !NON_BASE64.test(body);
}
const SYNTHESIZE_KEYS = [
  'text',
  'ssml',
  'language_code',
  'voice_name',
  'gender',
  'encoding',
  'speaking_rate',
  'pitch',
  'volume_gain_db',
  'sample_rate_hertz',
];

function inRange(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function readAudio(payload) {
  const body = isPlainObject(payload) && Object.hasOwn(payload, 'data') ? payload.data : payload;
  const audio = isPlainObject(body) ? body.audioContent : undefined;
  if (isBase64(audio)) {
    return { audioContent: audio };
  }
  return { status: 'vendor_error', endpoint: SYNTHESIZE_ENDPOINT, method: 'POST' };
}

function readVoices(payload) {
  const body = isPlainObject(payload) && Object.hasOwn(payload, 'data') ? payload.data : payload;
  if (isPlainObject(body) && Array.isArray(body.voices)) {
    return { voices: body.voices };
  }
  return { status: 'vendor_error', endpoint: VOICES_ENDPOINT, method: 'GET' };
}

export const modules = {
  insights: {
    // Contract from the approved plan dated 2026-09-19; live behavior unverified.
    async run(input, ctx) {
      const invalid = extraKey(input, ['url', 'strategy', 'category', 'locale', 'audits']);
      if (invalid) return invalid;
      if (!isAbsoluteHttpUrl(input.url)) return invalidArguments('url');
      if (input.strategy !== undefined && !STRATEGIES.has(input.strategy)) return invalidArguments('strategy');
      if (input.category !== undefined) {
        if (!Array.isArray(input.category) || !input.category.every((value) => CATEGORIES.has(value))) {
          return invalidArguments('category');
        }
      }
      if (input.locale !== undefined && !isBcp47(input.locale)) return invalidArguments('locale');
      if (input.audits !== undefined && typeof input.audits !== 'boolean') return invalidArguments('audits');
      const query = new URLSearchParams();
      query.set('url', input.url);
      if (input.strategy !== undefined) query.set('strategy', input.strategy);
      if (Array.isArray(input.category)) {
        for (const value of input.category) query.append('category', value);
      }
      if (input.locale !== undefined) query.set('locale', input.locale);
      const result = await ctx.proxy({ endpoint: `${INSIGHTS_ENDPOINT}?${query}`, method: 'GET' });
      return isStatusObject(result) ? result : readInsights(result, input.audits);
    },
  },
  translate: {
    // Contract from the approved plan dated 2026-09-19; live behavior unverified.
    async text(input, ctx) {
      const invalid = extraKey(input, ['text', 'target', 'source', 'format']);
      if (invalid) return invalid;
      if (!isTextList(input.text)) return invalidArguments('text');
      if (!isBcp47(input.target)) return invalidArguments('target');
      if (input.source !== undefined && !isBcp47(input.source)) return invalidArguments('source');
      if (input.format !== undefined && !FORMATS.has(input.format)) return invalidArguments('format');
      const query = new URLSearchParams();
      for (const value of input.text) query.append('q', value);
      query.set('target', input.target);
      if (input.source !== undefined) query.set('source', input.source);
      if (input.format !== undefined) query.set('format', input.format);
      const result = await ctx.proxy({ endpoint: `${TRANSLATE_ENDPOINT}?${query}`, method: 'GET' });
      return isStatusObject(result) ? result : readTranslations(result);
    },
  },
  voice: {
    // Contract from the approved plan dated 2026-09-19; live behavior unverified.
    async synthesize(input, ctx) {
      const invalid = extraKey(input, SYNTHESIZE_KEYS);
      if (invalid) return invalid;
      const hasText = Object.hasOwn(input, 'text');
      const hasSsml = Object.hasOwn(input, 'ssml');
      if (hasText === hasSsml) return invalidArguments(hasText ? 'ssml' : 'text');
      const sourceField = hasText ? 'text' : 'ssml';
      const sourceValue = input[sourceField];
      if (typeof sourceValue !== 'string' || !sourceValue.trim()) return invalidArguments(sourceField);
      if (Buffer.byteLength(sourceValue, 'utf8') > INPUT_BYTES) return invalidArguments(sourceField);
      if (!isBcp47(input.language_code)) return invalidArguments('language_code');
      if (input.voice_name !== undefined && (typeof input.voice_name !== 'string' || !input.voice_name.trim())) {
        return invalidArguments('voice_name');
      }
      if (input.gender !== undefined && !GENDERS.has(input.gender)) return invalidArguments('gender');
      // Required, because the vendor requires it. `audioConfig` is a required request
      // field and `audioEncoding` is required inside it, with no documented default:
      // AUDIO_ENCODING_UNSPECIFIED is itself an INVALID_ARGUMENT. An optional field
      // here would make the shortest call, text plus language_code, a vendor refusal.
      if (!ENCODINGS.has(input.encoding)) return invalidArguments('encoding');
      // Zero is not out of range, it is the vendor's own "use the default": the v1
      // discovery document reads "If unset(0.0), defaults to the native 1.0 speed."
      // Treating it as below the minimum would refuse a documented request.
      if (input.speaking_rate !== undefined
        && input.speaking_rate !== 0
        && !inRange(input.speaking_rate, 0.25, 2.0)) {
        return invalidArguments('speaking_rate');
      }
      if (input.pitch !== undefined && !inRange(input.pitch, -20, 20)) return invalidArguments('pitch');
      if (input.volume_gain_db !== undefined && !inRange(input.volume_gain_db, -96, 16)) {
        return invalidArguments('volume_gain_db');
      }
      if (input.sample_rate_hertz !== undefined
        && !(Number.isSafeInteger(input.sample_rate_hertz)
          && input.sample_rate_hertz > 0
          && input.sample_rate_hertz <= MAX_INT32)) {
        return invalidArguments('sample_rate_hertz');
      }
      const body = {
        input: hasText ? { text: input.text } : { ssml: input.ssml },
        voice: { languageCode: input.language_code },
      };
      if (input.voice_name !== undefined) body.voice.name = input.voice_name;
      if (input.gender !== undefined) body.voice.ssmlGender = input.gender;
      const audioConfig = { audioEncoding: input.encoding };
      if (input.speaking_rate !== undefined) audioConfig.speakingRate = input.speaking_rate;
      if (input.pitch !== undefined) audioConfig.pitch = input.pitch;
      if (input.volume_gain_db !== undefined) audioConfig.volumeGainDb = input.volume_gain_db;
      if (input.sample_rate_hertz !== undefined) audioConfig.sampleRateHertz = input.sample_rate_hertz;
      body.audioConfig = audioConfig;
      const result = await ctx.proxy({ endpoint: SYNTHESIZE_ENDPOINT, method: 'POST', body });
      return isStatusObject(result) ? result : readAudio(result);
    },
    async list_voices(input, ctx) {
      const invalid = extraKey(input, ['language_code']);
      if (invalid) return invalid;
      if (input.language_code !== undefined && !isBcp47(input.language_code)) return invalidArguments('language_code');
      let endpoint = VOICES_ENDPOINT;
      if (input.language_code !== undefined) {
        endpoint = `${VOICES_ENDPOINT}?${new URLSearchParams({ languageCode: input.language_code })}`;
      }
      const result = await ctx.proxy({ endpoint, method: 'GET' });
      return isStatusObject(result) ? result : readVoices(result);
    },
  },
};
