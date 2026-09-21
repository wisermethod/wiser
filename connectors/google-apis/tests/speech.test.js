import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestGateway, putActive } from '../../../gateway/test/fake-provider.js';
import { modules } from '../index.js';

const DIR = fileURLToPath(new URL('..', import.meta.url));
const ACTION = 'google-apis.speech.recognize';
const RECOGNIZE_ENDPOINT = 'https://speech.googleapis.com/v1/speech:recognize';
const VALID = { audio_content: 'dGVzdA==', language_code: 'en-US' };

const ENCODINGS = [
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
];

const TRANSCRIPTION = {
  results: [
    {
      alternatives: [
        { transcript: 'hello world', confidence: 0.98 },
      ],
    },
  ],
};

const FULL_ENVELOPE = {
  results: TRANSCRIPTION.results,
  usingLegacyModels: false,
  totalBilledTime: '1.500s',
  requestId: '1234567890',
  speechAdaptationInfo: { adaptationTimeout: false },
};

async function activeGateway(data = TRANSCRIPTION) {
  const fixture = await createTestGateway();
  await putActive(fixture.store, fixture.fake, { service: 'google-apis', module: 'speech', privilege: 'read' });
  fixture.fake.catalog.execute = async () => assert.fail('proxy action used catalog execute');
  const calls = [];
  fixture.fake.auth.proxy = async (request) => {
    calls.push(request);
    return { status: 200, data: structuredClone(data), headers: { 'x-example': 'secret' } };
  };
  return { ...fixture, calls };
}

function run(gw, input, extra = {}) {
  return gw.execute({ action: ACTION, input, confirm: true, ...extra });
}

function recognize(input, data) {
  return modules.speech.recognize(input, {
    proxy: async () => ({ status: 200, data, headers: { 'x-example': 'secret' } }),
  });
}

test('recognize needs_connect until the speech read grant is active', async () => {
  const { gw, fake } = await createTestGateway();
  fake.auth.proxy = fake.catalog.execute = async () => assert.fail('unconnected action reached transport');
  const result = await gw.execute({ action: ACTION, input: VALID });
  assert.equal(result.status, 'needs_connect');
  assert.equal(result.module, 'speech');
  assert.equal(result.privilege, 'read');
  assert.equal(fake.accounts.size, 0);
});

test('recognize requires confirmation on every call and returns a transcription', async () => {
  const { gw, calls } = await activeGateway();
  const call = { action: ACTION, input: VALID };
  assert.equal((await gw.execute(call)).status, 'needs_confirmation');
  assert.deepEqual((await gw.execute({ ...call, confirm: true })).results, TRANSCRIPTION.results);
  assert.equal((await gw.execute(call)).status, 'needs_confirmation');
  assert.equal(calls.length, 1);
});

test('recognize with confirm uses an absolute POST proxy and sends only supplied keys', async () => {
  const { gw, calls } = await activeGateway();
  const result = await run(gw, VALID);
  assert.deepEqual(result.results, TRANSCRIPTION.results);
  assert.equal(Object.hasOwn(result, 'data'), false);
  assert.equal(Object.hasOwn(result, 'headers'), false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].endpoint, RECOGNIZE_ENDPOINT);
  assert.deepEqual(calls[0].body, {
    config: { languageCode: VALID.language_code },
    audio: { content: VALID.audio_content },
  });
  assert.deepEqual(Object.keys(calls[0].body), ['config', 'audio']);
  assert.deepEqual(Object.keys(calls[0].body.config), ['languageCode']);
  assert.deepEqual(Object.keys(calls[0].body.audio), ['content']);
  assert.equal(Object.hasOwn(calls[0].body.audio, 'uri'), false);
});

test('a later recognize also stops without confirm', async () => {
  const { gw, calls } = await activeGateway();
  const call = { action: ACTION, input: VALID };
  const first = await gw.execute({ ...call, confirm: true });
  assert.equal(first.status, undefined);
  assert.deepEqual(first.results, TRANSCRIPTION.results);
  const second = await gw.execute(call);
  assert.equal(second.status, 'needs_confirmation');
  assert.equal(calls.length, 1);
});

test('supplied optional fields map onto the vendor body and unsupplied keys are omitted', async () => {
  const { gw, calls } = await activeGateway();
  const input = {
    audio_content: VALID.audio_content,
    language_code: 'en-GB',
    encoding: 'LINEAR16',
    sample_rate_hertz: 16000,
    model: 'latest_short',
    max_alternatives: 3,
    alternative_language_codes: ['es', 'fr'],
    enable_automatic_punctuation: true,
    enable_word_time_offsets: true,
    profanity_filter: false,
  };
  const result = await run(gw, input);
  assert.equal(result.status, undefined);
  assert.deepEqual(calls[0].body, {
    config: {
      languageCode: 'en-GB',
      encoding: 'LINEAR16',
      sampleRateHertz: 16000,
      model: 'latest_short',
      maxAlternatives: 3,
      alternativeLanguageCodes: ['es', 'fr'],
      enableAutomaticPunctuation: true,
      enableWordTimeOffsets: true,
      profanityFilter: false,
    },
    audio: { content: VALID.audio_content },
  });
});

test('required fields missing are refused by name before the proxy', async () => {
  const { gw, fake } = await activeGateway();
  fake.auth.proxy = async () => assert.fail('invalid input reached the proxy');
  const { audio_content, ...withoutAudio } = VALID;
  const missingAudio = await run(gw, withoutAudio);
  assert.equal(missingAudio.status, 'invalid_arguments');
  assert.equal(missingAudio.field, 'audio_content');
  const { language_code, ...withoutLanguage } = VALID;
  const missingLanguage = await run(gw, withoutLanguage);
  assert.equal(missingLanguage.status, 'invalid_arguments');
  assert.equal(missingLanguage.field, 'language_code');
  for (const audio of ['', ' ', 1, null, true, {}, 'not base64!!', 'Q', 'YQ=', 'YQ===']) {
    const result = await run(gw, { audio_content: audio, language_code: 'en-US' });
    assert.equal(result.status, 'invalid_arguments', JSON.stringify(audio));
    assert.equal(result.field, 'audio_content');
  }
  for (const language of ['a', 'en-a', 'en-USA', '123', '', 'en-', '-en', 'en--US', 'en_US', 1, null, true]) {
    const result = await run(gw, { ...VALID, language_code: language });
    assert.equal(result.status, 'invalid_arguments', JSON.stringify(language));
    assert.equal(result.field, 'language_code');
  }
});

test('sample_rate_hertz edges match the vendor and never reach transport when outside them', async () => {
  const { gw, fake, calls } = await activeGateway();
  for (const sample_rate_hertz of [8000, 48000, 16000]) {
    const result = await run(gw, { ...VALID, sample_rate_hertz });
    assert.equal(result.status, undefined, String(sample_rate_hertz));
    assert.equal(calls.at(-1).body.config.sampleRateHertz, sample_rate_hertz);
  }
  fake.auth.proxy = async () => assert.fail('out of range sample_rate_hertz reached the proxy');
  for (const sample_rate_hertz of [7999, 48001, 1.5, 8000.5, 0, -1, Number.NaN, Number.POSITIVE_INFINITY, '8000', null, true]) {
    const result = await run(gw, { ...VALID, sample_rate_hertz });
    assert.equal(result.status, 'invalid_arguments', String(sample_rate_hertz));
    assert.equal(result.field, 'sample_rate_hertz');
  }
  assert.equal(calls.length, 3);
});

test('max_alternatives edges include zero and never reach transport when outside them', async () => {
  const { gw, fake, calls } = await activeGateway();
  for (const max_alternatives of [0, 30, 1]) {
    const result = await run(gw, { ...VALID, max_alternatives });
    assert.equal(result.status, undefined, String(max_alternatives));
    assert.equal(calls.at(-1).body.config.maxAlternatives, max_alternatives);
  }
  fake.auth.proxy = async () => assert.fail('out of range max_alternatives reached the proxy');
  for (const max_alternatives of [-1, 31, 1.5, 0.5, Number.NaN, '0', null, true]) {
    const result = await run(gw, { ...VALID, max_alternatives });
    assert.equal(result.status, 'invalid_arguments', String(max_alternatives));
    assert.equal(result.field, 'max_alternatives');
  }
  assert.equal(calls.length, 3);
});

// Empty is accepted on purpose. The discovery document caps this at three and
// states no lower bound, and an empty repeated field is proto3's "none". An
// earlier draft refused it, which was a bound this module invented rather than
// read from the vendor.
test('alternative_language_codes accepts nought to three BCP 47 tags and refuses the rest', async () => {
  const { gw, fake, calls } = await activeGateway();
  const accepted = [
    [],
    ['en'],
    ['es', 'fr', 'de'],
  ];
  for (const alternative_language_codes of accepted) {
    const result = await run(gw, { ...VALID, alternative_language_codes });
    assert.equal(result.status, undefined, JSON.stringify(alternative_language_codes));
    assert.deepEqual(calls.at(-1).body.config.alternativeLanguageCodes, alternative_language_codes);
  }
  fake.auth.proxy = async () => assert.fail('invalid alternative_language_codes reached the proxy');
  const rejected = [
    ['en', 'es', 'fr', 'de'],
    ['en-a'],
    ['en', ''],
    ['en', 1],
    'en',
    1,
    null,
    true,
  ];
  for (const alternative_language_codes of rejected) {
    const result = await run(gw, { ...VALID, alternative_language_codes });
    assert.equal(result.status, 'invalid_arguments', JSON.stringify(alternative_language_codes));
    assert.equal(result.field, 'alternative_language_codes');
  }
  assert.equal(calls.length, accepted.length);
});

test('all eleven encodings pass, including ENCODING_UNSPECIFIED', async () => {
  const { gw, fake, calls } = await activeGateway();
  for (const encoding of ENCODINGS) {
    const result = await run(gw, { ...VALID, encoding });
    assert.equal(result.status, undefined, encoding);
    assert.equal(calls.at(-1).body.config.encoding, encoding);
  }
  fake.auth.proxy = async () => assert.fail('invalid encoding reached the proxy');
  for (const encoding of ['PCM', 'M4A', 'WAV', 'AUDIO_ENCODING_UNSPECIFIED', 'mp3', 'linear16', '', 1, null, true]) {
    const result = await run(gw, { ...VALID, encoding });
    assert.equal(result.status, 'invalid_arguments', JSON.stringify(encoding));
    assert.equal(result.field, 'encoding');
  }
  assert.equal(calls.length, ENCODINGS.length);
});

test('a model string the prose does not name is accepted rather than treated as an enum', async () => {
  const { gw, calls } = await activeGateway();
  const result = await run(gw, { ...VALID, model: 'some_future_model' });
  assert.equal(result.status, undefined);
  assert.equal(calls[0].body.config.model, 'some_future_model');
});

// The empty string is protobuf's own default for a string field and so is the
// vendor's way of spelling "auto-select". Refusing it would invent a bound the
// generated schema does not state.
test('an empty model is accepted and reaches the vendor', async () => {
  const { gw, calls } = await activeGateway();
  const result = await run(gw, { ...VALID, model: '' });
  assert.equal(result.status, undefined);
  assert.equal(calls[0].body.config.model, '');
});

test('a non-string model is refused before the proxy', async () => {
  const { gw, fake } = await activeGateway();
  fake.auth.proxy = async () => assert.fail('invalid model reached the proxy');
  for (const model of [1, null, true, {}]) {
    const result = await run(gw, { ...VALID, model });
    assert.equal(result.status, 'invalid_arguments', JSON.stringify(model));
    assert.equal(result.field, 'model');
  }
});

test('boolean flags are sent when supplied, including false, and non-booleans are refused', async () => {
  const { gw, fake, calls } = await activeGateway();
  const result = await run(gw, {
    ...VALID,
    enable_automatic_punctuation: false,
    enable_word_time_offsets: false,
    profanity_filter: false,
  });
  assert.equal(result.status, undefined);
  assert.equal(calls[0].body.config.enableAutomaticPunctuation, false);
  assert.equal(calls[0].body.config.enableWordTimeOffsets, false);
  assert.equal(calls[0].body.config.profanityFilter, false);
  fake.auth.proxy = async () => assert.fail('invalid boolean reached the proxy');
  for (const field of ['enable_automatic_punctuation', 'enable_word_time_offsets', 'profanity_filter']) {
    for (const value of ['true', 1, 0, null, 'false']) {
      const flagged = await run(gw, { ...VALID, [field]: value });
      assert.equal(flagged.status, 'invalid_arguments', `${field}=${String(value)}`);
      assert.equal(flagged.field, field);
    }
  }
});

test('undeclared keys and non-object input never reach transport', async () => {
  const { gw, fake } = await activeGateway();
  fake.auth.proxy = async () => assert.fail('invalid arguments reached the proxy');
  for (const input of [
    { ...VALID, purpose: 'example' },
    { ...VALID, uri: 'gs://bucket/object' },
    { ...VALID, content: VALID.audio_content },
  ]) {
    const result = await run(gw, input);
    assert.equal(result.status, 'invalid_arguments');
  }
  const extra = await run(gw, { ...VALID, extra: true });
  assert.equal(extra.status, 'invalid_arguments');
  assert.equal(extra.field, 'extra');
  for (const input of [undefined, null, [], 'example', 1]) {
    assert.equal(
      (await modules.speech.recognize(input, { proxy: async () => assert.fail('reached proxy') })).status,
      'invalid_arguments',
    );
  }
});

test('readTranscription recognises the success envelope by its key set', async () => {
  const full = await recognize(VALID, FULL_ENVELOPE);
  assert.deepEqual(full, FULL_ENVELOPE);
  const empty = await recognize(VALID, {});
  assert.deepEqual(empty, {});
  const billedOnly = await recognize(VALID, { totalBilledTime: '7s' });
  assert.deepEqual(billedOnly, { totalBilledTime: '7s' });
  const emptyResults = await recognize(VALID, { results: [] });
  assert.deepEqual(emptyResults, { results: [] });
  const wrapped = await modules.speech.recognize(VALID, {
    proxy: async () => ({ status: 200, data: { results: TRANSCRIPTION.results }, headers: {} }),
  });
  assert.deepEqual(wrapped, { results: TRANSCRIPTION.results });
});

test('an envelope recognize cannot read is a vendor_error, never the body', async () => {
  const unreadable = [
    { error: { code: 403, message: 'synthetic-private-response', key: 'AIza-example' } },
    { data: { error: { code: 403, message: 'synthetic-private-response' } } },
    { results: 'not-an-array' },
    { results: null },
    { undocumented: true },
    { results: [], extra: 'synthetic-private-response' },
    { quotaNote: 'synthetic-private-response' },
    null,
    false,
    0,
    '',
    'synthetic-private-response',
    [{ results: [] }],
  ];
  for (const data of unreadable) {
    const result = await modules.speech.recognize(VALID, {
      proxy: async () => ({ status: 200, data, headers: { 'x-example': 'secret' } }),
    });
    assert.equal(result.status, 'vendor_error', JSON.stringify(data));
    assert.equal(result.endpoint, RECOGNIZE_ENDPOINT);
    assert.equal(result.method, 'POST');
    assert.equal(Object.hasOwn(result, 'data'), false);
    assert.equal(Object.hasOwn(result, 'headers'), false);
    const dumped = JSON.stringify(result);
    assert.equal(dumped.includes('synthetic-private-response'), false, JSON.stringify(data));
    assert.equal(dumped.includes('AIza-example'), false);
  }
});

test('a string payload is a vendor_error and carries no body', async () => {
  const result = await modules.speech.recognize(VALID, {
    proxy: async () => 'synthetic-private-response',
  });
  assert.equal(result.status, 'vendor_error');
  assert.equal(result.endpoint, RECOGNIZE_ENDPOINT);
  assert.equal(result.method, 'POST');
  assert.equal(JSON.stringify(result).includes('synthetic-private-response'), false);
});

// Regression test for defect class 3 on the input side: a quantified regex
// group inside a quantifier throws `RangeError: Maximum call stack size
// exceeded` on V8 at around five megabytes of base64. The fixture is
// deliberately larger than that threshold. There is no local byte cap; the
// generated schema states none.
test('a multi-megabyte audio_content is accepted without throwing', async () => {
  const audio_content = Buffer.alloc(6 * 1024 * 1024, 0xab).toString('base64');
  assert.ok(audio_content.length > 6 * 1024 * 1024, 'fixture is at least 6 MB of base64');
  const calls = [];
  const result = await modules.speech.recognize(
    { audio_content, language_code: 'en-US' },
    {
      proxy: async (request) => {
        calls.push(request);
        return { status: 200, data: {}, headers: {} };
      },
    },
  );
  assert.equal(result.status, undefined);
  assert.deepEqual(result, {});
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.audio.content, audio_content);
});

test('the module source names no credential surface and a call returns none', async () => {
  const source = readFileSync(join(DIR, 'index.js'), 'utf8');
  for (const token of ['process.env', 'generic_api_key', 'X-Goog-Api-Key', 'readFileSync']) {
    assert.equal(source.includes(token), false, token);
  }
  const { gw, calls } = await activeGateway();
  const result = await run(gw, VALID);
  const dumped = JSON.stringify({ result, calls });
  assert.equal(/api[_-]?key|generic_api_key|AIza/i.test(dumped), false);
  assert.equal(Object.hasOwn(calls[0], 'headers'), false);
  assert.equal(Object.hasOwn(result, 'headers'), false);
});

test('module preserves gateway status objects untouched', async () => {
  for (const status of ['needs_connect', 'needs_provider_capability', 'vendor_error', 'denied']) {
    const result = { status };
    assert.equal(await modules.speech.recognize(VALID, { proxy: async () => result }), result);
  }
});

test('gateway preserves proxy capability and vendor failure stops without the vendor body', async () => {
  const { gw, fake } = await activeGateway();
  fake.auth.proxy = async () => ({ supported: false });
  assert.equal((await run(gw, VALID)).status, 'needs_provider_capability');
  fake.auth.proxy = async ({ endpoint, method }) => ({
    status: 429,
    data: { error: { message: 'synthetic-private-response', key: 'AIza-example' } },
    error: { code: 'vendor_error', endpoint, method },
  });
  const result = await run(gw, VALID);
  assert.equal(result.status, 'vendor_error');
  assert.equal(Object.hasOwn(result, 'data'), false);
  assert.equal(Object.hasOwn(result, 'headers'), false);
  assert.equal(JSON.stringify(result).includes('synthetic-private-response'), false);
  assert.equal(JSON.stringify(result).includes('AIza-example'), false);
});

// ProtoJSON accepts "either standard or URL-safe base64 encoding with/without
// paddings" for a `bytes` field, and `audio_content` is caller-supplied, so every
// spelling below is audio the vendor would have accepted. An earlier draft reused
// the response-side validator here, which requires padding and refuses `-` and
// `_`, and so refused four of these six without ever calling Google. That is the
// failure shape that leaves no evidence: local refusal, no cost, no live run.
test('audio_content accepts every ProtoJSON byte spelling, padded or not, either alphabet', async () => {
  const { gw, calls } = await activeGateway();
  const accepted = [
    'dGVzdA==',
    'dGVzdA',
    'YQ==',
    'YQ',
    'a-b_',
    '-_-_',
  ];
  for (const audio_content of accepted) {
    const result = await run(gw, { audio_content, language_code: 'en-US' });
    assert.equal(result.status, undefined, audio_content);
    assert.equal(calls.at(-1).body.audio.content, audio_content);
  }
  assert.equal(calls.length, accepted.length);
});

// The two base64 checks in this file are deliberately different strengths, and
// the direction is the point: the input check accepts everything the vendor
// accepts, and the response check holds the vendor to the one spelling the
// vendor emits. Asserted directly against both modules so a later reader meeting
// two base64 validators finds the asymmetry is intended rather than an oversight.
test('the input check is permissive where the response check is strict, on the same string', async () => {
  const unpadded = 'dGVzdA';
  const urlSafe = 'a-b_';

  for (const audio_content of [unpadded, urlSafe]) {
    const accepted = await recognize({ audio_content, language_code: 'en-US' }, TRANSCRIPTION);
    assert.equal(accepted.status, undefined, `input check should accept ${audio_content}`);
  }

  for (const audioContent of [unpadded, urlSafe]) {
    const refused = await modules.voice.synthesize(
      { text: 'x', language_code: 'en-US', encoding: 'MP3' },
      { proxy: async () => ({ status: 200, data: { audioContent }, headers: {} }) },
    );
    assert.equal(refused.status, 'vendor_error', `response check should refuse ${audioContent}`);
    assert.equal(refused.endpoint, 'https://texttospeech.googleapis.com/v1/text:synthesize');
    assert.equal(Object.hasOwn(refused, 'audioContent'), false);
  }
});
