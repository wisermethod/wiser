import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestGateway, putActive } from '../../../gateway/test/fake-provider.js';
import { modules } from '../index.js';

const DIR = fileURLToPath(new URL('..', import.meta.url));
const SYNTHESIZE = 'google-apis.voice.synthesize';
const LIST_VOICES = 'google-apis.voice.list_voices';
const SYNTHESIZE_ENDPOINT = 'https://texttospeech.googleapis.com/v1/text:synthesize';
const VOICES_ENDPOINT = 'https://texttospeech.googleapis.com/v1/voices';
const VALID = { text: 'Hello world', language_code: 'en-US', encoding: 'MP3' };

const AUDIO = { audioContent: 'c3ludGhldGljLWF1ZGlv' };
const VOICES = {
  voices: [
    { name: 'en-US-Standard-A', languageCodes: ['en-US'], ssmlGender: 'FEMALE', naturalSampleRateHertz: 24000 },
  ],
};

async function activeGateway() {
  const fixture = await createTestGateway();
  await putActive(fixture.store, fixture.fake, { service: 'google-apis', module: 'voice', privilege: 'read' });
  fixture.fake.catalog.execute = async () => assert.fail('proxy action used catalog execute');
  const calls = [];
  fixture.fake.auth.proxy = async (request) => {
    calls.push(request);
    if (request.method === 'POST') {
      return { status: 200, data: structuredClone(AUDIO), headers: { 'x-example': 'secret' } };
    }
    return { status: 200, data: structuredClone(VOICES), headers: { 'x-example': 'secret' } };
  };
  return { ...fixture, calls };
}

function run(gw, input, extra = {}) {
  return gw.execute({ action: SYNTHESIZE, input, confirm: true, ...extra });
}

function list(gw, input = {}, extra = {}) {
  return gw.execute({ action: LIST_VOICES, input, ...extra });
}

test('synthesize needs_connect until the voice read grant is active', async () => {
  const { gw, fake } = await createTestGateway();
  fake.auth.proxy = fake.catalog.execute = async () => assert.fail('unconnected action reached transport');
  const result = await gw.execute({ action: SYNTHESIZE, input: VALID });
  assert.equal(result.status, 'needs_connect');
  assert.equal(result.module, 'voice');
  assert.equal(result.privilege, 'read');
  assert.equal(fake.accounts.size, 0);
});

test('list_voices needs_connect until the voice read grant is active', async () => {
  const { gw, fake } = await createTestGateway();
  fake.auth.proxy = fake.catalog.execute = async () => assert.fail('unconnected action reached transport');
  const result = await gw.execute({ action: LIST_VOICES, input: {} });
  assert.equal(result.status, 'needs_connect');
  assert.equal(result.module, 'voice');
  assert.equal(result.privilege, 'read');
});

test('synthesize needs_confirmation after the grant without confirm', async () => {
  const { gw, fake } = await activeGateway();
  fake.auth.proxy = async () => assert.fail('unconfirmed action reached transport');
  const result = await gw.execute({ action: SYNTHESIZE, input: VALID });
  assert.equal(result.status, 'needs_confirmation');
  assert.equal(result.confirmation, 'once');
  assert.equal(result.risk, 'medium');
});

test('list_voices does not ask for confirmation', async () => {
  const { gw, calls } = await activeGateway();
  const result = await list(gw, {});
  assert.equal(result.status, undefined);
  assert.deepEqual(result.voices, VOICES.voices);
  assert.equal(calls.length, 1);
});

test('synthesize with confirm uses an absolute POST proxy and exposes audioContent only', async () => {
  const { gw, calls } = await activeGateway();
  const result = await run(gw, VALID);
  assert.equal(result.audioContent, AUDIO.audioContent);
  assert.equal(Object.hasOwn(result, 'data'), false);
  assert.equal(Object.hasOwn(result, 'headers'), false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].endpoint, SYNTHESIZE_ENDPOINT);
  // The shortest accepted call. `audioConfig` is always present because the vendor
  // requires `audioEncoding` and documents no default, so `encoding` is required here
  // and every other audioConfig field stays omitted unless the caller supplied it.
  assert.deepEqual(calls[0].body, {
    input: { text: VALID.text },
    voice: { languageCode: VALID.language_code },
    audioConfig: { audioEncoding: 'MP3' },
  });
  assert.deepEqual(Object.keys(calls[0].body.audioConfig), ['audioEncoding']);
  assert.deepEqual(Object.keys(calls[0].body.voice), ['languageCode']);
});

test('confirmation once lets a later synthesize through without confirm', async () => {
  const { gw, calls } = await activeGateway();
  assert.equal((await gw.execute({ action: SYNTHESIZE, input: VALID })).status, 'needs_confirmation');
  assert.equal(calls.length, 0);
  const first = await run(gw, VALID);
  assert.equal(first.audioContent, AUDIO.audioContent);
  const second = await gw.execute({ action: SYNTHESIZE, input: VALID });
  assert.equal(second.status, undefined);
  assert.equal(second.audioContent, AUDIO.audioContent);
  assert.equal(calls.length, 2);
});

test('ssml is sent in place of text and the two never travel together', async () => {
  const { gw, calls } = await activeGateway();
  const ssml = '<speak>Hello</speak>';
  const result = await run(gw, { ssml, language_code: 'en-US', encoding: 'MP3' });
  assert.equal(result.status, undefined);
  assert.deepEqual(calls[0].body.input, { ssml });
  assert.equal(Object.hasOwn(calls[0].body.input, 'text'), false);
});

test('supplied optional fields map onto the vendor body and unsupplied keys are omitted', async () => {
  const { gw, calls } = await activeGateway();
  const input = {
    text: 'Hello world',
    language_code: 'en-GB',
    voice_name: 'en-GB-Standard-A',
    gender: 'FEMALE',
    encoding: 'MP3',
    speaking_rate: 1.25,
    pitch: -2,
    volume_gain_db: 3,
    sample_rate_hertz: 24000,
  };
  const result = await run(gw, input);
  assert.equal(result.status, undefined);
  assert.deepEqual(calls[0].body, {
    input: { text: input.text },
    voice: { languageCode: 'en-GB', name: 'en-GB-Standard-A', ssmlGender: 'FEMALE' },
    audioConfig: {
      audioEncoding: 'MP3',
      speakingRate: 1.25,
      pitch: -2,
      volumeGainDb: 3,
      sampleRateHertz: 24000,
    },
  });
});

test('zero pitch and zero volume_gain_db are sent rather than treated as absent', async () => {
  const { gw, calls } = await activeGateway();
  const result = await run(gw, { ...VALID, pitch: 0, volume_gain_db: 0, encoding: 'LINEAR16' });
  assert.equal(result.status, undefined);
  assert.equal(calls[0].body.audioConfig.pitch, 0);
  assert.equal(calls[0].body.audioConfig.volumeGainDb, 0);
  assert.equal(calls[0].body.audioConfig.audioEncoding, 'LINEAR16');
});

test('text and ssml XOR and empty values are refused before the proxy', async () => {
  const { gw, fake } = await activeGateway();
  fake.auth.proxy = async () => assert.fail('invalid input reached the proxy');
  const neither = await run(gw, { language_code: 'en-US', encoding: 'MP3' });
  assert.equal(neither.status, 'invalid_arguments');
  assert.equal(neither.field, 'text');
  const both = await run(gw, { text: 'Hello', ssml: '<speak>Hello</speak>', language_code: 'en-US', encoding: 'MP3' });
  assert.equal(both.status, 'invalid_arguments');
  assert.equal(both.field, 'ssml');
  for (const text of ['', ' ', '\t', 1, null, true, {}]) {
    const result = await run(gw, { text, language_code: 'en-US', encoding: 'MP3' });
    assert.equal(result.status, 'invalid_arguments');
    assert.equal(result.field, 'text');
  }
  for (const ssml of ['', ' ', 1, null]) {
    const result = await run(gw, { ssml, language_code: 'en-US', encoding: 'MP3' });
    assert.equal(result.status, 'invalid_arguments');
    assert.equal(result.field, 'ssml');
  }
});

test('the 5000-byte input limit is measured in UTF-8 bytes and names the field', async () => {
  const { gw, fake, calls } = await activeGateway();
  const asciiOk = 'x'.repeat(5000);
  const asciiOver = 'x'.repeat(5001);
  const multiOk = 'é'.repeat(2500);
  const multiOver = 'é'.repeat(2501);
  assert.equal(Buffer.byteLength(asciiOk, 'utf8'), 5000);
  assert.equal(Buffer.byteLength(asciiOver, 'utf8'), 5001);
  assert.equal(Buffer.byteLength(multiOk, 'utf8'), 5000);
  assert.equal(Buffer.byteLength(multiOver, 'utf8'), 5002);
  assert.equal((await run(gw, { text: asciiOk, language_code: 'en-US', encoding: 'MP3' })).status, undefined);
  assert.equal((await run(gw, { ssml: multiOk, language_code: 'en-US', encoding: 'MP3' })).status, undefined);
  fake.auth.proxy = async () => assert.fail('oversized input reached the proxy');
  const tooLongText = await run(gw, { text: asciiOver, language_code: 'en-US', encoding: 'MP3' });
  assert.equal(tooLongText.status, 'invalid_arguments');
  assert.equal(tooLongText.field, 'text');
  const tooLongSsml = await run(gw, { ssml: multiOver, language_code: 'en-US', encoding: 'MP3' });
  assert.equal(tooLongSsml.status, 'invalid_arguments');
  assert.equal(tooLongSsml.field, 'ssml');
  const multiTextOver = await run(gw, { text: multiOver, language_code: 'en-US', encoding: 'MP3' });
  assert.equal(multiTextOver.status, 'invalid_arguments');
  assert.equal(multiTextOver.field, 'text');
  assert.equal(calls.length, 2);
});

test('language_code accepts well-formed tags and rejects malformed ones before transport', async () => {
  const { gw, calls } = await activeGateway();
  for (const language_code of ['en', 'en-US', 'zh-Hant-TW', 'es-419', 'de-CH-1901']) {
    const result = await run(gw, { ...VALID, language_code });
    assert.equal(result.status, undefined, `${language_code} should have reached the vendor`);
    assert.equal(calls.at(-1).body.voice.languageCode, language_code);
  }
  const before = calls.length;
  for (const language_code of ['a', 'en-a', 'en-USA', '123', '', 'en-', '-en', 'en--US', 'en_US', 1, null, true]) {
    const result = await run(gw, { ...VALID, language_code });
    assert.equal(result.status, 'invalid_arguments', `${JSON.stringify(language_code)} should have been refused`);
    assert.equal(result.field, 'language_code');
  }
  assert.equal(calls.length, before, 'no malformed language_code reached transport');
});

test('gender and encoding enum rejection never reaches transport', async () => {
  const { gw, fake, calls } = await activeGateway();
  for (const gender of ['SSML_VOICE_GENDER_UNSPECIFIED', 'MALE', 'FEMALE', 'NEUTRAL']) {
    const result = await run(gw, { ...VALID, gender });
    assert.equal(result.status, undefined);
    assert.equal(calls.at(-1).body.voice.ssmlGender, gender);
  }
  // The v1 discovery document, revision 20260827, carries PCM and M4A. The HTML enum
  // page for v1 does not and is stale against the running service.
  for (const encoding of ['MP3', 'LINEAR16', 'OGG_OPUS', 'MULAW', 'ALAW', 'PCM', 'M4A']) {
    const result = await run(gw, { ...VALID, encoding });
    assert.equal(result.status, undefined);
    assert.equal(calls.at(-1).body.audioConfig.audioEncoding, encoding);
  }
  fake.auth.proxy = async () => assert.fail('invalid enum reached the proxy');
  for (const gender of ['male', 'FEMALE ', 'OTHER', '', 1, null, true]) {
    const result = await run(gw, { ...VALID, gender });
    assert.equal(result.status, 'invalid_arguments');
    assert.equal(result.field, 'gender');
  }
  // `AUDIO_ENCODING_UNSPECIFIED` is in the enum and is documented as returning an
  // invalid-argument error, so it is refused here rather than spent on a round trip.
  for (const encoding of ['mp3', 'WAV', 'AUDIO_ENCODING_UNSPECIFIED', '', 1, null, true]) {
    const result = await run(gw, { ...VALID, encoding });
    assert.equal(result.status, 'invalid_arguments', JSON.stringify(encoding));
    assert.equal(result.field, 'encoding');
  }
});

test('encoding is required, because the vendor requires audioEncoding with no default', async () => {
  const { gw, fake } = await activeGateway();
  fake.auth.proxy = async () => assert.fail('a call with no encoding reached the proxy');
  const { encoding, ...withoutEncoding } = VALID;
  const result = await run(gw, withoutEncoding);
  assert.equal(result.status, 'invalid_arguments');
  assert.equal(result.field, 'encoding');
});

test('numeric ranges match the vendor and never reach transport when outside them', async () => {
  const { gw, fake, calls } = await activeGateway();
  const accepted = [
    { speaking_rate: 0.25 },
    { speaking_rate: 2.0 },
    { speaking_rate: 1 },
    { pitch: -20 },
    { pitch: 20 },
    { pitch: 0 },
    { volume_gain_db: -96 },
    { volume_gain_db: 16 },
    { sample_rate_hertz: 1 },
    { sample_rate_hertz: 24000 },
    // int32 max is on the wire type and accepted; one above it is not.
    { sample_rate_hertz: 2147483647 },
    // Zero is the vendor's own "use the default", per the v1 discovery document:
    // "If unset(0.0), defaults to the native 1.0 speed." Not a below-minimum value.
    { speaking_rate: 0 },
  ];
  for (const extra of accepted) {
    const result = await run(gw, { ...VALID, ...extra });
    assert.equal(result.status, undefined, JSON.stringify(extra));
  }
  fake.auth.proxy = async () => assert.fail('out of range value reached the proxy');
  const rejected = [
    ['speaking_rate', 0.24],
    ['speaking_rate', 2.01],
    ['speaking_rate', 4],
    ['speaking_rate', Number.POSITIVE_INFINITY],
    ['speaking_rate', Number.NaN],
    ['speaking_rate', '1'],
    ['speaking_rate', null],
    ['speaking_rate', true],
    ['pitch', -20.1],
    ['pitch', 20.1],
    ['pitch', Number.NEGATIVE_INFINITY],
    ['pitch', '0'],
    ['volume_gain_db', -96.1],
    ['volume_gain_db', 16.1],
    ['sample_rate_hertz', 0],
    ['sample_rate_hertz', -1],
    ['sample_rate_hertz', 1.5],
    ['sample_rate_hertz', Number.NaN],
    ['sample_rate_hertz', 2147483648],
    ['sample_rate_hertz', Number.MAX_SAFE_INTEGER + 1],
    ['sample_rate_hertz', '24000'],
    ['sample_rate_hertz', null],
    ['voice_name', ''],
    ['voice_name', ' '],
    ['voice_name', 1],
    ['voice_name', null],
  ];
  for (const [field, value] of rejected) {
    const result = await run(gw, { ...VALID, [field]: value });
    assert.equal(result.status, 'invalid_arguments', `${field}=${String(value)}`);
    assert.equal(result.field, field);
  }
  assert.equal(calls.length, accepted.length);
});

test('list_voices uses an absolute GET and omits languageCode when absent', async () => {
  const { gw, calls } = await activeGateway();
  const result = await list(gw, {});
  assert.deepEqual(result.voices, VOICES.voices);
  assert.equal(Object.hasOwn(result, 'data'), false);
  assert.equal(Object.hasOwn(result, 'headers'), false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].endpoint, VOICES_ENDPOINT);
});

test('list_voices sends language_code as the vendor query parameter', async () => {
  const { gw, calls } = await activeGateway();
  const result = await list(gw, { language_code: 'en-US' });
  assert.equal(result.status, undefined);
  const url = new URL(calls[0].endpoint);
  assert.equal(url.origin, 'https://texttospeech.googleapis.com');
  assert.equal(url.pathname, '/v1/voices');
  assert.equal(url.searchParams.get('languageCode'), 'en-US');
});

test('list_voices language_code uses the same BCP 47 rule', async () => {
  const { gw, calls } = await activeGateway();
  for (const language_code of ['en', 'en-US', 'zh-Hant-TW', 'es-419', 'de-CH-1901']) {
    const result = await list(gw, { language_code });
    assert.equal(result.status, undefined, language_code);
    assert.equal(new URL(calls.at(-1).endpoint).searchParams.get('languageCode'), language_code);
  }
  const before = calls.length;
  for (const language_code of ['a', 'en-a', 'en-USA', '123', '', 'en-', '-en', 'en--US', 'en_US', 1, null, true]) {
    const result = await list(gw, { language_code });
    assert.equal(result.status, 'invalid_arguments', JSON.stringify(language_code));
    assert.equal(result.field, 'language_code');
  }
  assert.equal(calls.length, before);
});

test('undeclared keys and non-object input never reach transport', async () => {
  const { gw, fake } = await activeGateway();
  fake.auth.proxy = async () => assert.fail('invalid arguments reached the proxy');
  for (const input of [
    { ...VALID, purpose: 'example' },
    { ...VALID, audioEncoding: 'MP3' },
    { ...VALID, name: 'en-US-Standard-A' },
  ]) {
    const result = await run(gw, input);
    assert.equal(result.status, 'invalid_arguments');
  }
  for (const input of [undefined, null, [], 'example', 1]) {
    assert.equal((await modules.voice.synthesize(input, { proxy: async () => assert.fail('reached proxy') })).status, 'invalid_arguments');
    assert.equal((await modules.voice.list_voices(input, { proxy: async () => assert.fail('reached proxy') })).status, 'invalid_arguments');
  }
  const extra = await list(gw, { language_code: 'en-US', extra: true });
  assert.equal(extra.status, 'invalid_arguments');
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
    assert.equal(await modules.voice.synthesize(VALID, { proxy: async () => result }), result);
    assert.equal(await modules.voice.list_voices({}, { proxy: async () => result }), result);
  }
});

test('an envelope synthesize cannot read is a vendor_error, never the body', async () => {
  const unreadable = [
    { error: { code: 403, message: 'synthetic-private-response', key: 'AIza-example' } },
    { data: { error: { code: 403, message: 'synthetic-private-response' } } },
    { audioContent: null },
    { audioContent: 1 },
    { audioContent: ['c3ludGhldGljLWF1ZGlv'] },
    // Right container, wrong content. A diagnostic string arriving under the field
    // name the reader recognises is the case a bare typeof check would have passed
    // straight through to the caller.
    { audioContent: 'synthetic-private-response' },
    { audioContent: 'synthetic private response' },
    { audioContent: 'not base64!!' },
    { audioContent: '' },
    { audioContent: 'c3ludGhldGljLWF1ZGlv=' },
    { data: {} },
    {},
    null,
    false,
    0,
    '',
    'synthetic-private-response',
    [{ audioContent: 'c3ludGhldGljLWF1ZGlv' }],
  ];
  for (const data of unreadable) {
    const result = await modules.voice.synthesize(VALID, {
      proxy: async () => ({ status: 200, data, headers: { 'x-example': 'secret' } }),
    });
    assert.equal(result.status, 'vendor_error', JSON.stringify(data));
    assert.equal(result.endpoint, SYNTHESIZE_ENDPOINT);
    assert.equal(result.method, 'POST');
    assert.equal(Object.hasOwn(result, 'data'), false);
    assert.equal(Object.hasOwn(result, 'headers'), false);
    const dumped = JSON.stringify(result);
    assert.equal(dumped.includes('synthetic-private-response'), false, JSON.stringify(data));
    assert.equal(dumped.includes('AIza-example'), false);
  }
});

// Regression test for a defect that shipped and was caught in review: validating
// audioContent with a repeated four-character regex group throws
// `RangeError: Maximum call stack size exceeded` on V8 at a few megabytes. Five
// megabytes is roughly 109 seconds of LINEAR16 at 24 kHz, well inside what 5000
// bytes of input text produces, so the validator destroyed the result of a
// synthesis the caller had already paid for. The fixtures here are deliberately
// larger than the threshold that used to throw.
test('a multi-megabyte audioContent is returned rather than thrown on', async () => {
  for (const megabytes of [1, 5, 8]) {
    const audioContent = Buffer.alloc(megabytes * 1024 * 1024, 0xab).toString('base64');
    assert.ok(audioContent.length > megabytes * 1_000_000, 'fixture is large enough to matter');
    const result = await modules.voice.synthesize(VALID, {
      proxy: async () => ({ status: 200, data: { audioContent }, headers: {} }),
    });
    assert.equal(result.status, undefined, `${megabytes} MB should have been returned`);
    assert.equal(result.audioContent, audioContent);
  }
});

test('both padding forms are accepted and a mispadded payload is not', async () => {
  const call = (audioContent) => modules.voice.synthesize(VALID, {
    proxy: async () => ({ status: 200, data: { audioContent }, headers: {} }),
  });
  // One, two and three trailing bytes give no padding, one '=' and two '=' in turn.
  for (const bytes of [3, 6, 9]) {
    const padded = Buffer.alloc(bytes, 0xab).toString('base64');
    assert.equal((await call(padded)).audioContent, padded, padded);
  }
  for (const bytes of [1, 2, 4, 5]) {
    const padded = Buffer.alloc(bytes, 0xab).toString('base64');
    assert.equal((await call(padded)).audioContent, padded, padded);
  }
  // Unpadded and URL-safe are not what ProtoJSON emits for a `format: "byte"` field,
  // and admitting them would let a hyphenated diagnostic string through on a length
  // that happens to be a multiple of four.
  for (const wrong of ['YQ', 'YWI', 'c3ludGhldGljLWF1ZGlv=', 'ab-_', '====']) {
    const result = await call(wrong);
    assert.equal(result.status, 'vendor_error', wrong);
  }
});

test('a readable synthesize envelope yields audioContent and nothing else', async () => {
  const result = await modules.voice.synthesize(VALID, {
    proxy: async () => ({
      status: 200,
      data: { audioContent: 'c3ludGhldGljLWF1ZGlv', quotaNote: 'synthetic-private-response' },
      headers: { 'x-example': 'secret' },
    }),
  });
  assert.deepEqual(Object.keys(result), ['audioContent']);
  assert.equal(result.audioContent, 'c3ludGhldGljLWF1ZGlv');
  assert.equal(JSON.stringify(result).includes('synthetic-private-response'), false);
});

test('an envelope list_voices cannot read is a vendor_error, never the body', async () => {
  const unreadable = [
    { error: { code: 403, message: 'synthetic-private-response', key: 'AIza-example' } },
    { voices: null },
    { voices: 'en-US-Standard-A' },
    { data: {} },
    {},
    null,
    false,
    0,
    '',
    'synthetic-private-response',
    [{ name: 'en-US-Standard-A' }],
  ];
  for (const data of unreadable) {
    const result = await modules.voice.list_voices({}, {
      proxy: async () => ({ status: 200, data, headers: { 'x-example': 'secret' } }),
    });
    assert.equal(result.status, 'vendor_error', JSON.stringify(data));
    assert.equal(result.endpoint, VOICES_ENDPOINT);
    assert.equal(result.method, 'GET');
    assert.equal(Object.hasOwn(result, 'data'), false);
    assert.equal(Object.hasOwn(result, 'headers'), false);
    const dumped = JSON.stringify(result);
    assert.equal(dumped.includes('synthetic-private-response'), false, JSON.stringify(data));
    assert.equal(dumped.includes('AIza-example'), false);
  }
});

test('an empty voices array is a success, not an unreadable envelope', async () => {
  const result = await modules.voice.list_voices({}, {
    proxy: async () => ({ status: 200, data: { voices: [] }, headers: {} }),
  });
  assert.deepEqual(result, { voices: [] });
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
