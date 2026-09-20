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

// The same question asked in the other direction, and it gets a different answer.
//
// `isBase64` above validates a field the **vendor** emits, so it may hold Google to
// the one spelling Google uses. This one validates a field the **caller** supplies,
// so it must accept everything the vendor would. ProtoJSON's rule for a `bytes`
// field is that "either standard or URL-safe base64 encoding with/without paddings
// are accepted", so `-` and `_` are in the alphabet and padding is optional. An
// earlier draft of `speech.recognize` reused `isBase64` here, which requires padding
// and refuses both URL-safe characters, and so would have refused audio Google
// accepts without ever calling the vendor: local `invalid_arguments`, no cost, no
// evidence, which is this connector's most expensive failure shape.
//
// Flat negated-class scan for the same measured reason `isBase64` is one. This
// string is the caller's audio and is routinely megabytes; a quantified group
// inside a quantifier throws `RangeError` on V8 at around five of them.
const NON_BASE64_ANY = /[^A-Za-z0-9+/\-_]/;

function isProtoJsonBytes(value) {
  if (typeof value !== 'string' || value.length === 0) return false;
  let body = value;
  if (body.endsWith('==')) body = body.slice(0, -2);
  else if (body.endsWith('=')) body = body.slice(0, -1);
  // Padding is optional, but present padding must be well-formed: it only ever
  // pads a length up to a multiple of four.
  if (body.length !== value.length && value.length % 4 !== 0) return false;
  // No base64 body is one more than a multiple of four, padded or not, because
  // no number of input bytes produces that many output characters.
  if (body.length % 4 === 1) return false;
  return !NON_BASE64_ANY.test(body);
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

const RECOGNIZE_ENDPOINT = 'https://speech.googleapis.com/v1/speech:recognize';

// Taken from Google's live Speech-to-Text v1 discovery document, revision
// 20260910, which is generated from the running service. All eleven members
// are accepted, including `ENCODING_UNSPECIFIED`. That differs from `voice`,
// where `AUDIO_ENCODING_UNSPECIFIED` is refused locally because Text-to-Speech
// documents it as an invalid-argument error. Speech-to-Text's enumDescription
// for this member is only "Not specified." and the field itself is optional
// ("optional for `FLAC` and `WAV` audio files and required for all other audio
// formats"). Refusing it here would be understating the vendor.
const RECOGNIZE_ENCODINGS = new Set([
  'ENCODING_UNSPECIFIED',
  'LINEAR16',
  'FLAC',
  'MULAW',
  'AMR',
  'AMR_WB',
  'OGG_OPUS',
  'SPEEX_WITH_HEADER_BYTE',
  'MP3',
  'WEBM_OPUS',
  'ALAW',
]);

const RECOGNIZE_KEYS = [
  'audio_content',
  'language_code',
  'encoding',
  'sample_rate_hertz',
  'model',
  'max_alternatives',
  'alternative_language_codes',
  'enable_automatic_punctuation',
  'enable_word_time_offsets',
  'profanity_filter',
];

const RECOGNIZE_RESPONSE_KEYS = new Set([
  'results',
  'usingLegacyModels',
  'totalBilledTime',
  'requestId',
  'speechAdaptationInfo',
]);

// RecognizeResponse has no single required field: the discovery document,
// revision 20260910, describes it as containing "zero or more sequential
// SpeechRecognitionResult messages." Audio with no detectable speech is a
// billed success that may omit `results` entirely. Siblings recognise success
// by one required key (`lighthouseResult`, `translations`, `audioContent`,
// `voices`); here the test is the key set, because requiring `results` would
// turn that legitimate success into a vendor_error. This is still not a
// passthrough: it recognises one success shape and refuses everything else.
function readTranscription(payload) {
  const body = isPlainObject(payload) && Object.hasOwn(payload, 'data') ? payload.data : payload;
  if (!isPlainObject(body) || Object.hasOwn(body, 'error')) {
    return { status: 'vendor_error', endpoint: RECOGNIZE_ENDPOINT, method: 'POST' };
  }
  for (const key of Object.keys(body)) {
    if (!RECOGNIZE_RESPONSE_KEYS.has(key)) {
      return { status: 'vendor_error', endpoint: RECOGNIZE_ENDPOINT, method: 'POST' };
    }
  }
  if (Object.hasOwn(body, 'results') && !Array.isArray(body.results)) {
    return { status: 'vendor_error', endpoint: RECOGNIZE_ENDPOINT, method: 'POST' };
  }
  return body;
}

const ANNOTATE_ENDPOINT = 'https://language.googleapis.com/v1/documents:annotateText';

// Taken from Google's live Natural Language v1 discovery document, revision
// 20260913, which is generated from the running service. `TYPE_UNSPECIFIED` is
// in the enum and is documented as returning an INVALID_ARGUMENT error ("If the
// type is not set or is `TYPE_UNSPECIFIED`, returns an `INVALID_ARGUMENT`
// error."), so it stays refused locally. That is the `voice` case, where
// `AUDIO_ENCODING_UNSPECIFIED` is refused for the same reason, and not the
// `speech` case, where `ENCODING_UNSPECIFIED` is accepted because Speech-to-Text
// documents it only as "Not specified." Two sibling modules treat a same-shaped
// member differently; this one follows the vendor's error, not the sibling.
const DOCUMENT_TYPES = new Set(['PLAIN_TEXT', 'HTML']);

// `NONE` is a documented member with real meaning: "encoding-dependent
// information (such as `begin_offset`) will be set at `-1`". It is not an
// error member. Refusing it would be understating the vendor.
const ENCODING_TYPES = new Set(['NONE', 'UTF8', 'UTF16', 'UTF32']);

const CONTENT_CATEGORIES_VERSIONS = new Set([
  'CONTENT_CATEGORIES_VERSION_UNSPECIFIED',
  'V1',
  'V2',
]);

const ANNOTATE_KEYS = [
  'content',
  'type',
  'language_code',
  'encoding_type',
  'extract_document_sentiment',
  'extract_syntax',
  'extract_entities',
  'extract_entity_sentiment',
  'classify_text',
  'moderate_text',
  'classification_model_options',
];

const ANNOTATE_RESPONSE_KEYS = new Set([
  'documentSentiment',
  'categories',
  'moderationCategories',
  'entities',
  'language',
  'sentences',
  'tokens',
]);

const ANNOTATE_ARRAY_KEYS = [
  'categories',
  'moderationCategories',
  'entities',
  'sentences',
  'tokens',
];

// Validated structurally against ClassificationModelOptions and forwarded
// nested, not flattened. The schema states no mutual exclusion with
// `classify_text`, only that the field is "Only used if `classify_text` is
// set to true", which is the vendor describing what it ignores rather than
// what it refuses.
function isClassificationModelOptions(value) {
  if (!isPlainObject(value)) return false;
  for (const key of Object.keys(value)) {
    if (key !== 'v1Model' && key !== 'v2Model') return false;
  }
  if (Object.hasOwn(value, 'v1Model')) {
    if (!isPlainObject(value.v1Model) || Object.keys(value.v1Model).length !== 0) return false;
  }
  if (Object.hasOwn(value, 'v2Model')) {
    if (!isPlainObject(value.v2Model)) return false;
    for (const key of Object.keys(value.v2Model)) {
      if (key !== 'contentCategoriesVersion') return false;
    }
    if (Object.hasOwn(value.v2Model, 'contentCategoriesVersion')
      && !CONTENT_CATEGORIES_VERSIONS.has(value.v2Model.contentCategoriesVersion)) {
      return false;
    }
  }
  return true;
}

// AnnotateTextResponse has no required field: every member is conditional on
// a feature flag. A caller who enables nothing gets a response carrying
// almost nothing, including `{}`. Siblings recognise success by one required
// key (`lighthouseResult`, `translations`, `audioContent`, `voices`); here
// the test is the key set, because requiring any one key would turn that
// legitimate billed success into a vendor_error. That is `readAudio`'s
// original defect. This is still not a passthrough: it recognises one success
// shape and refuses everything else.
function readAnnotation(payload) {
  const body = isPlainObject(payload) && Object.hasOwn(payload, 'data') ? payload.data : payload;
  if (!isPlainObject(body) || Object.hasOwn(body, 'error')) {
    return { status: 'vendor_error', endpoint: ANNOTATE_ENDPOINT, method: 'POST' };
  }
  for (const key of Object.keys(body)) {
    if (!ANNOTATE_RESPONSE_KEYS.has(key)) {
      return { status: 'vendor_error', endpoint: ANNOTATE_ENDPOINT, method: 'POST' };
    }
  }
  for (const key of ANNOTATE_ARRAY_KEYS) {
    if (Object.hasOwn(body, key) && !Array.isArray(body[key])) {
      return { status: 'vendor_error', endpoint: ANNOTATE_ENDPOINT, method: 'POST' };
    }
  }
  // The two members that are not arrays are typed here for the same reason the
  // arrays are. This reader validates a field the **vendor** returns, so it may
  // hold Google to the one spelling Google emits, and too loose is the defect in
  // this direction rather than too strict. An earlier version checked the five
  // arrays and neither of these, so `{ language: 42 }` was returned to the caller
  // as a successful annotation. Presence is still not required of either: every
  // member of AnnotateTextResponse is conditional on a feature flag.
  //
  // The check is the container's type and stops there. Whether a recognised
  // success array or message should have its documented fields projected is a
  // question for this connector's family as a whole, open on all four modules,
  // and not one this module settles alone.
  if (Object.hasOwn(body, 'language') && typeof body.language !== 'string') {
    return { status: 'vendor_error', endpoint: ANNOTATE_ENDPOINT, method: 'POST' };
  }
  if (Object.hasOwn(body, 'documentSentiment') && !isPlainObject(body.documentSentiment)) {
    return { status: 'vendor_error', endpoint: ANNOTATE_ENDPOINT, method: 'POST' };
  }
  return body;
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
  speech: {
    // Contract from the approved plan dated 2026-09-19; live behavior unverified.
    async recognize(input, ctx) {
      const invalid = extraKey(input, RECOGNIZE_KEYS);
      if (invalid) return invalid;
      // No byte cap on `audio_content`. The generated schema states none.
      // Google's synchronous content limit lives only on an HTML page, which
      // is the source this connector has already learned not to trust for
      // bounds. Oversized audio is the vendor's refusal to make.
      if (!isProtoJsonBytes(input.audio_content)) return invalidArguments('audio_content');
      if (!isBcp47(input.language_code)) return invalidArguments('language_code');
      if (input.encoding !== undefined && !RECOGNIZE_ENCODINGS.has(input.encoding)) {
        return invalidArguments('encoding');
      }
      if (input.sample_rate_hertz !== undefined
        && !(Number.isSafeInteger(input.sample_rate_hertz)
          && input.sample_rate_hertz >= 8000
          && input.sample_rate_hertz <= 48000)) {
        return invalidArguments('sample_rate_hertz');
      }
      // `model` is `type: string` with no enum and no minimum length in the
      // generated schema. The property description names eight models in prose;
      // that list is not a schema and is not shipped as one. The empty string is
      // accepted too, because it is protobuf's own default for a string field and
      // therefore means "auto-select", which is exactly what the vendor documents
      // for an unset model. An earlier draft refused it, which invented a bound
      // and turned the vendor's own way of saying "choose for me" into a local
      // refusal. Any string reaches the vendor; an unknown name is its refusal.
      if (input.model !== undefined && typeof input.model !== 'string') {
        return invalidArguments('model');
      }
      if (input.max_alternatives !== undefined
        && !(Number.isSafeInteger(input.max_alternatives)
          && input.max_alternatives >= 0
          && input.max_alternatives <= 30)) {
        return invalidArguments('max_alternatives');
      }
      // Empty is accepted. The discovery document caps this at "up to 3
      // additional" tags and states no lower bound, and an empty repeated
      // field is proto3's own way of spelling "none", identical to omitting
      // it. An earlier draft required at least one item, which was a bound
      // this module invented rather than read, and refusing input the vendor
      // accepts is the failure mode this connector has already paid for once.
      if (input.alternative_language_codes !== undefined) {
        if (!Array.isArray(input.alternative_language_codes)
          || input.alternative_language_codes.length > 3
          || !input.alternative_language_codes.every((value) => isBcp47(value))) {
          return invalidArguments('alternative_language_codes');
        }
      }
      if (input.enable_automatic_punctuation !== undefined
        && typeof input.enable_automatic_punctuation !== 'boolean') {
        return invalidArguments('enable_automatic_punctuation');
      }
      if (input.enable_word_time_offsets !== undefined
        && typeof input.enable_word_time_offsets !== 'boolean') {
        return invalidArguments('enable_word_time_offsets');
      }
      if (input.profanity_filter !== undefined && typeof input.profanity_filter !== 'boolean') {
        return invalidArguments('profanity_filter');
      }
      const config = { languageCode: input.language_code };
      if (input.encoding !== undefined) config.encoding = input.encoding;
      if (input.sample_rate_hertz !== undefined) config.sampleRateHertz = input.sample_rate_hertz;
      if (input.model !== undefined) config.model = input.model;
      if (input.max_alternatives !== undefined) config.maxAlternatives = input.max_alternatives;
      if (input.alternative_language_codes !== undefined) {
        config.alternativeLanguageCodes = input.alternative_language_codes;
      }
      if (input.enable_automatic_punctuation !== undefined) {
        config.enableAutomaticPunctuation = input.enable_automatic_punctuation;
      }
      if (input.enable_word_time_offsets !== undefined) {
        config.enableWordTimeOffsets = input.enable_word_time_offsets;
      }
      if (input.profanity_filter !== undefined) config.profanityFilter = input.profanity_filter;
      const body = { config, audio: { content: input.audio_content } };
      const result = await ctx.proxy({ endpoint: RECOGNIZE_ENDPOINT, method: 'POST', body });
      return isStatusObject(result) ? result : readTranscription(result);
    },
  },
  language: {
    // Contract from the approved plan dated 2026-09-19; live behavior unverified.
    async analyze(input, ctx) {
      const invalid = extraKey(input, ANNOTATE_KEYS);
      if (invalid) return invalid;
      // `content` is required here because this module removed `gcsContentUri`,
      // the other way a Document carries text. Document accepts either
      // `content` or `gcsContentUri`; `gcsContentUri` is excluded for the same
      // Cloud Storage reason `speech` excludes `audio.uri`. So `content` is the
      // only content field this module offers, and an omitted one leaves nothing
      // to annotate. The vendor's schema does not mark `content` Required: this
      // requirement is the module's, and it follows from the module's own
      // exclusion rather than from anything measured at the vendor.
      //
      // No emptiness check and no byte cap. The schema states no minLength and
      // no maxLength. Google's content-size limits live only on an HTML page,
      // which is the source class this connector does not trust for bounds.
      // Oversized or empty content is the vendor's refusal to make. `translate`
      // and `voice` check nonemptiness because a vendor rule required it; there
      // is no such rule here, so copying theirs would be a bound this module
      // invented.
      if (typeof input.content !== 'string') return invalidArguments('content');
      if (!DOCUMENT_TYPES.has(input.type)) return invalidArguments('type');
      if (input.language_code !== undefined && !isBcp47(input.language_code)) {
        return invalidArguments('language_code');
      }
      if (input.encoding_type !== undefined && !ENCODING_TYPES.has(input.encoding_type)) {
        return invalidArguments('encoding_type');
      }
      if (input.extract_document_sentiment !== undefined
        && typeof input.extract_document_sentiment !== 'boolean') {
        return invalidArguments('extract_document_sentiment');
      }
      if (input.extract_syntax !== undefined && typeof input.extract_syntax !== 'boolean') {
        return invalidArguments('extract_syntax');
      }
      if (input.extract_entities !== undefined && typeof input.extract_entities !== 'boolean') {
        return invalidArguments('extract_entities');
      }
      if (input.extract_entity_sentiment !== undefined
        && typeof input.extract_entity_sentiment !== 'boolean') {
        return invalidArguments('extract_entity_sentiment');
      }
      if (input.classify_text !== undefined && typeof input.classify_text !== 'boolean') {
        return invalidArguments('classify_text');
      }
      if (input.moderate_text !== undefined && typeof input.moderate_text !== 'boolean') {
        return invalidArguments('moderate_text');
      }
      if (input.classification_model_options !== undefined
        && !isClassificationModelOptions(input.classification_model_options)) {
        return invalidArguments('classification_model_options');
      }
      const document = { type: input.type, content: input.content };
      if (input.language_code !== undefined) document.language = input.language_code;
      // The vendor marks the `features` object Required and every member inside
      // it optional, so `features: {}` satisfies the schema. The module always
      // sends a `features` object and puts into it only the flags the caller
      // supplied. No check that at least one feature is true: that would be an
      // invented bound, the same class adversarial review upheld three times
      // on `speech`.
      const features = {};
      if (input.extract_document_sentiment !== undefined) {
        features.extractDocumentSentiment = input.extract_document_sentiment;
      }
      if (input.extract_syntax !== undefined) features.extractSyntax = input.extract_syntax;
      if (input.extract_entities !== undefined) features.extractEntities = input.extract_entities;
      if (input.extract_entity_sentiment !== undefined) {
        features.extractEntitySentiment = input.extract_entity_sentiment;
      }
      if (input.classify_text !== undefined) features.classifyText = input.classify_text;
      if (input.moderate_text !== undefined) features.moderateText = input.moderate_text;
      if (input.classification_model_options !== undefined) {
        features.classificationModelOptions = input.classification_model_options;
      }
      const body = { document, features };
      if (input.encoding_type !== undefined) body.encodingType = input.encoding_type;
      const result = await ctx.proxy({ endpoint: ANNOTATE_ENDPOINT, method: 'POST', body });
      return isStatusObject(result) ? result : readAnnotation(result);
    },
  },
};
