import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestGateway, makeHome, putActive } from '../../../gateway/test/fake-provider.js';

const BASE = { text: '[pause]Hi [breath]<emphasis>🌟 go</emphasis>!', voice_id: 'fakevoice123', language: 'en' };
const INPUTS = { synthesize: BASE, list_builtin_voices: {}, list_voice_clones: {} };
const AUDIO = 'AP8TgEMEAOlHN7ZbISoRBQ==';
const GRAPH_CHARS = Array.from(BASE.text);
const GRAPH_TIMES = GRAPH_CHARS.map((_, i) => [i / 10, (i + 1) / 10]);
const ENVELOPE = {
  audio: AUDIO, content_type: 'audio/mpeg', duration: 5,
  audio_timestamps: { graph_chars: GRAPH_CHARS, graph_times: GRAPH_TIMES },
  ignored: 'invented body field',
};
const WORDS = [
  { text: 'Hi', start: 0.7, end: 0.9 },
  { text: '🌟', start: 2.8, end: 2.9 },
  { text: 'go!', start: 3, end: 4.4 },
];

async function setup(t, { active = true, answer = ENVELOPE, outputs = true } = {}) {
  const home = makeHome();
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const outputsDir = join(home, 'outputs');
  const state = await createTestGateway({ home, outputsDir: outputs ? outputsDir : null, session: false });
  const calls = [];
  state.fake.auth.proxy = async (request) => {
    calls.push(request);
    return { status: 200, data: structuredClone(answer), headers: { ignored: 'invented header' } };
  };
  state.fake.catalog.execute = async () => assert.fail('proxy action reached catalog');
  if (active) await putActive(state.store, state.fake, { service: 'xai', module: 'speech', privilege: 'write' });
  return { ...state, calls, outputsDir };
}

function noAudio(result, state) {
  const serialized = JSON.stringify(result) + readFileSync(state.audit.file, 'utf8');
  for (const forbidden of [AUDIO, 'output_file', 'invented body field', 'invented header', '"type":"Buffer"']) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
  assert.equal(Object.hasOwn(result, 'audio'), false);
  assert.equal(Object.hasOwn(result, 'data'), false);
}

for (const [action, input] of Object.entries(INPUTS)) {
  test(`${action} needs the speech write grant before any transport`, async (t) => {
    const state = await setup(t, { active: false });
    const result = await state.gw.execute({ action: `xai.speech.${action}`, input });
    assert.equal(result.status, 'needs_connect');
    assert.equal(result.service, 'xai');
    assert.equal(result.module, 'speech');
    assert.equal(result.privilege, 'write');
    assert.equal(state.calls.length, 0);
    assert.equal(existsSync(state.outputsDir), false);
  });
}

test('list_builtin_voices projects built-in fields and preserves a pagination token', async (t) => {
  const state = await setup(t, { answer: {
    voices: [{ voice_id: 'builtin123', name: 'Example built-in', language: 'en', preview_url: 'https://example.invalid/audio' }],
    pagination_token: 'fake-next', ignored: 'invented body field',
  } });
  const result = await state.gw.execute({ action: 'xai.speech.list_builtin_voices', input: {} });
  assert.deepEqual(result, { voices: [{ voice_id: 'builtin123', name: 'Example built-in' }], pagination_token: 'fake-next' });
  assert.equal(state.calls.length, 1);
  assert.equal(state.calls[0].endpoint, '/v1/tts/voices');
  assert.equal(state.calls[0].method, 'GET');
  assert.equal(state.calls[0].body, undefined);
  assert.equal(existsSync(state.outputsDir), false);
});

test('list_voice_clones projects string language/creation fields and sends query parameters', async (t) => {
  const state = await setup(t, { answer: {
    voices: [{ voice_id: 'custom123abc', name: 'Example custom', language: 'en', language_code: 'en-US',
      created_at: '2026-10-20T00:00:00Z', createdAt: '2026-10-20T00:00:00Z', creation_time: 'invented-time',
      languages: ['en'], language_details: { code: 'en' }, created_count: 2, preview_url: 'https://example.invalid/audio' }],
    pagination_token: 'next-example', total_count: 1, cap: 10,
  } });
  const pagination_token = 'fake+cursor & limit=9/?';
  const result = await state.gw.execute({ action: 'xai.speech.list_voice_clones', input: { limit: 2, pagination_token } });
  assert.deepEqual(result, { voices: [{ voice_id: 'custom123abc', name: 'Example custom', language: 'en', language_code: 'en-US',
    created_at: '2026-10-20T00:00:00Z', createdAt: '2026-10-20T00:00:00Z', creation_time: 'invented-time' }], pagination_token: 'next-example' });
  assert.equal(state.calls[0].endpoint, '/v1/custom-voices');
  assert.equal(state.calls[0].method, 'GET');
  assert.equal(state.calls[0].body, undefined);
  assert.deepEqual(state.calls[0].parameters, [
    { name: 'limit', value: '2', type: 'query' },
    { name: 'pagination_token', value: pagination_token, type: 'query' },
  ]);
  // The parameter route leaves encoding to the proxy, preserving the whole value.
  const query = new URLSearchParams(state.calls[0].parameters.map(({ name, value }) => [name, value]));
  assert.equal(query.get('pagination_token'), pagination_token);
});

test('custom list has no implicit query defaults and accepts both limit boundaries', async (t) => {
  const state = await setup(t, { answer: { voices: [] } });
  for (const input of [{}, { limit: 1 }, { limit: 1000 }]) {
    assert.deepEqual(await state.gw.execute({ action: 'xai.speech.list_voice_clones', input }), { voices: [] });
  }
  assert.deepEqual(state.calls.map(({ parameters }) => parameters), [[],
    [{ name: 'limit', value: '1', type: 'query' }], [{ name: 'limit', value: '1000', type: 'query' }],
  ]);
});

test('synthesize writes an independent decode, applies defaults and drops tags from word timings', async (t) => {
  const state = await setup(t);
  const result = await state.gw.execute({ action: 'xai.speech.synthesize', input: BASE });
  assert.equal(state.calls.length, 1);
  const request = state.calls[0];
  assert.equal(request.endpoint, '/v1/tts');
  assert.equal(request.method, 'POST');
  assert.equal(request.toolkit, 'GROK');
  assert.equal(request.providerAccountId, 'fake-acct-xai-speech');
  assert.deepEqual(request.body, {
    text: BASE.text, voice_id: BASE.voice_id, language: 'en',
    output_format: { codec: 'mp3', sample_rate: 48000, bit_rate: 192000 }, with_timestamps: true,
  });
  // Independently decode the invented vendor envelope, without any module helper.
  const independent = Buffer.from(ENVELOPE.audio, 'base64');
  assert.deepEqual(readFileSync(result.file.path), independent);
  assert.deepEqual(result, {
    duration: 5, content_type: 'audio/mpeg', voice_id: BASE.voice_id, characters: GRAPH_CHARS.length,
    timings: WORDS,
    file: { path: result.file.path, bytes: independent.length, sha256: createHash('sha256').update(independent).digest('hex'), media_type: 'audio/mpeg' },
  });
  assert.equal(dirname(result.file.path), state.outputsDir);
  assert.equal(readdirSync(state.outputsDir).length, 1);
  noAudio(result, state);
});

for (const timings of ['words', 'characters', 'none']) {
  test(`synthesize timings ${timings} has exactly the declared projection`, async (t) => {
    const state = await setup(t);
    const result = await state.gw.execute({ action: 'xai.speech.synthesize', input: { ...BASE, timings } });
    if (timings === 'words') assert.deepEqual(result.timings, WORDS);
    if (timings === 'characters') assert.deepEqual(result.timings, ENVELOPE.audio_timestamps);
    if (timings === 'none') assert.equal(Object.hasOwn(result, 'timings'), false);
    assert.equal(state.calls[0].body.with_timestamps, true);
    assert.equal(Object.hasOwn(state.calls[0].body, 'timings'), false);
    assert.deepEqual(readFileSync(result.file.path), Buffer.from(ENVELOPE.audio, 'base64'));
    noAudio(result, state);
  });
}

test('word timings preserve punctuation, whitespace boundaries and a tag inside a word', async (t) => {
  const text = '\tHi<emphasis>there</emphasis>,\n[breath]world! [pause]';
  const chars = Array.from(text);
  const times = chars.map((_, i) => [i, i + 1]);
  const answer = { ...ENVELOPE, audio_timestamps: { graph_chars: chars, graph_times: times } };
  const state = await setup(t, { answer });
  const result = await state.gw.execute({ action: 'xai.speech.synthesize', input: { ...BASE, text } });
  assert.deepEqual(result.timings, [
    { text: 'Hithere,', start: 1, end: text.indexOf(',') + 1 },
    { text: 'world!', start: text.indexOf('world'), end: text.indexOf('!') + 1 },
  ]);
});

test('explicit options are forwarded, including false normalization and speed boundaries', async (t) => {
  const state = await setup(t);
  for (const speed of [0.7, 1.5]) {
    for (const sample_rate of [22050, 24000, 44100, 48000]) {
      for (const bit_rate of [64000, 96000, 128000, 192000]) {
        const input = { ...BASE, speed, sample_rate, bit_rate, text_normalization: false, timings: 'none' };
        const result = await state.gw.execute({ action: 'xai.speech.synthesize', input });
        assert.ok(result.file);
        assert.deepEqual(state.calls.at(-1).body, {
          text: BASE.text, voice_id: BASE.voice_id, language: BASE.language, speed, text_normalization: false,
          with_timestamps: true, output_format: { codec: 'mp3', sample_rate, bit_rate },
        });
      }
    }
  }
  await state.gw.execute({ action: 'xai.speech.synthesize', input: { ...BASE, text_normalization: true } });
  assert.equal(state.calls.at(-1).body.text_normalization, true);
});

test('5000 non-BMP code points are accepted without a UTF-16-unit limit', async (t) => {
  const state = await setup(t);
  const text = '🌟'.repeat(5000);
  assert.equal(text.length, 10000);
  const result = await state.gw.execute({ action: 'xai.speech.synthesize', input: { ...BASE, text } });
  assert.equal(result.characters, 5000);
  assert.ok(result.file);
  assert.equal(state.calls[0].body.text, text);
});

for (const [name, extra, field] of [
  ['5001 code points', { text: '🌟'.repeat(5001) }, 'text'],
  ['5001 ASCII characters', { text: 'x'.repeat(5001) }, 'text'],
  ['upper-case voice id', { voice_id: 'Voice123' }, 'voice_id'],
  ['65-character voice id', { voice_id: 'v'.repeat(65) }, 'voice_id'],
  ['sample rate 16000', { sample_rate: 16000 }, 'sample_rate'],
  ['bit rate 32000', { bit_rate: 32000 }, 'bit_rate'],
  ['speed 0.6', { speed: 0.6 }, 'speed'],
  ['speed 1.6', { speed: 1.6 }, 'speed'],
  ['undeclared key', { replace: true }, 'replace'],
  ['empty text', { text: '' }, 'text'],
  ['invalid language', { language: 'en-?' }, 'language'],
  ['non-boolean normalization', { text_normalization: 'false' }, 'text_normalization'],
  ['undeclared timings mode', { timings: 'sentences' }, 'timings'],
]) {
  test(`synthesize refuses ${name} before transport`, async (t) => {
    const state = await setup(t);
    const result = await state.gw.execute({ action: 'xai.speech.synthesize', input: { ...BASE, ...extra } });
    assert.equal(result.status, 'invalid_arguments');
    assert.equal(result.field, field);
    assert.equal(state.calls.length, 0);
    assert.equal(existsSync(state.outputsDir), false);
  });
}

test('synthesize refuses a missing language before transport', async (t) => {
  const state = await setup(t);
  const { language: _language, ...input } = BASE;
  assert.deepEqual(await state.gw.execute({ action: 'xai.speech.synthesize', input }), { status: 'invalid_arguments', field: 'language' });
  assert.equal(state.calls.length, 0);
});

for (const input of [{ limit: 0 }, { limit: 1001 }, { limit: 1.5 }, { limit: '2' }, { pagination_token: '' }, { other: 'invented' }]) {
  test(`custom list refuses ${JSON.stringify(input)} before transport`, async (t) => {
    const state = await setup(t);
    assert.equal((await state.gw.execute({ action: 'xai.speech.list_voice_clones', input })).status, 'invalid_arguments');
    assert.equal(state.calls.length, 0);
  });
}

for (const [name, answer] of [
  ['string', 'invented response'],
  ['null', null],
  ['array', []],
  ['missing audio', { ...ENVELOPE, audio: undefined }],
  ['non-base64 audio', { ...ENVELOPE, audio: 'bad!' }],
  ['URL-safe audio', { ...ENVELOPE, audio: '_w==' }],
  ['noncanonical padding bits', { ...ENVELOPE, audio: 'Zh==' }],
  ['base64 with whitespace', { ...ENVELOPE, audio: AUDIO + '\n' }],
  ['unpadded base64', { ...ENVELOPE, audio: 'Zg' }],
  ['interior padding', { ...ENVELOPE, audio: 'Z=g=' }],
  ['empty audio', { ...ENVELOPE, audio: '' }],
  ['wrong content type', { ...ENVELOPE, content_type: 'audio/wav' }],
  ['zero duration', { ...ENVELOPE, duration: 0 }],
  ['negative duration', { ...ENVELOPE, duration: -1 }],
  ['string duration', { ...ENVELOPE, duration: '5' }],
  ['infinite duration', { ...ENVELOPE, duration: Infinity }],
  ['missing timestamps', { ...ENVELOPE, audio_timestamps: undefined }],
  ['unequal timing arrays', { ...ENVELOPE, audio_timestamps: { graph_chars: ['a'], graph_times: [] } }],
  ['non-array characters', { ...ENVELOPE, audio_timestamps: { graph_chars: 'a', graph_times: [[0, 1]] } }],
  ['non-string character', { ...ENVELOPE, audio_timestamps: { graph_chars: [1], graph_times: [[0, 1]] } }],
  ['malformed timing pair', { ...ENVELOPE, audio_timestamps: { graph_chars: ['a'], graph_times: [[0]] } }],
  ['nonfinite timing', { ...ENVELOPE, audio_timestamps: { graph_chars: ['a'], graph_times: [[0, NaN]] } }],
  // xAI's reference describes {start, end} objects; the live answer carries [start, end] pairs.
  // The object form stays refused, so a change toward the reference cannot start writing audio.
  ['timing objects instead of pairs', { ...ENVELOPE, audio_timestamps: { graph_chars: ['a'], graph_times: [{ start: 0, end: 1 }] } }],
]) {
  test(`synthesize rejects ${name} with no file or vendor body`, async (t) => {
    const state = await setup(t, { answer });
    const result = await state.gw.execute({ action: 'xai.speech.synthesize', input: BASE });
    assert.deepEqual(result, { status: 'vendor_error', endpoint: '/v1/tts', method: 'POST', reason: 'unexpected answer' });
    assert.equal(state.calls.length, 1);
    assert.equal(existsSync(state.outputsDir), false);
    noAudio(result, state);
  });
}

for (const [action, endpoint] of [['list_builtin_voices', '/v1/tts/voices'], ['list_voice_clones', '/v1/custom-voices']]) {
  test(`${action} refuses malformed answers without vendor data`, async (t) => {
    for (const answer of ['invented response', null, [], {}, { voices: [null] }, { voices: [{ voice_id: 1, name: 'invented' }] }]) {
      const state = await setup(t, { answer });
      assert.deepEqual(await state.gw.execute({ action: `xai.speech.${action}`, input: {} }), {
        status: 'vendor_error', endpoint, method: 'GET', reason: 'unexpected answer',
      });
      assert.equal(existsSync(state.outputsDir), false);
    }
  });
}

test('template schema-enforcement block is kept at the gateway boundary', async (t) => {
  const { gw, calls } = await setup(t);
  // **Keep this block when you copy the template.** The 2026-09-20 connector audit found
  // that the eleven connectors agreeing with their own manifests were the eleven that had
  // copied a validator and its tests together, and that twelve of the fourteen without it
  // asserted nothing of the kind and held every divergence. The validator now lives in the
  // gateway and no connector carries one, so what a connector still has to carry is this:
  // proof that its published schema is the one being applied to its own actions.
  for (const input of [
    { ...BASE, undeclared: 'example' },
    { ...BASE, voice_id: 12345 },
    {},
  ]) {
    const refused = await gw.execute({ action: 'xai.speech.synthesize', input });
    assert.equal(refused.status, 'invalid_arguments', JSON.stringify(input));
  }
  for (const input of [null, [], 'example', 1]) {
    assert.deepEqual(
      await gw.execute({ action: 'xai.speech.synthesize', input }),
      { status: 'invalid_arguments', field: 'input' });
  }
  assert.equal(calls.length, 0);
});

test('hosted synthesis is local_only before transport while lists still work', async (t) => {
  const state = await setup(t, { outputs: false, answer: { voices: [] } });
  assert.equal((await state.gw.execute({ action: 'xai.speech.synthesize', input: BASE })).status, 'local_only');
  assert.equal(state.calls.length, 0);
  for (const action of ['list_builtin_voices', 'list_voice_clones']) {
    assert.deepEqual(await state.gw.execute({ action: `xai.speech.${action}`, input: {} }), { voices: [] });
  }
  assert.equal(existsSync(state.outputsDir), false);
});

test('gateway preserves proxy capability and vendor failure stops for each action', async (t) => {
  const state = await setup(t);
  for (const [action, input] of Object.entries(INPUTS)) {
    state.fake.auth.proxy = async () => ({ supported: false });
    assert.equal((await state.gw.execute({ action: `xai.speech.${action}`, input })).status, 'needs_provider_capability');
    state.fake.auth.proxy = async ({ endpoint, method }) => ({ status: 429, error: { code: 'vendor_error', endpoint, method } });
    const result = await state.gw.execute({ action: `xai.speech.${action}`, input });
    assert.equal(result.status, 'vendor_error');
    assert.equal(result.http_status, 429);
    assert.equal(Object.hasOwn(result, 'output_file'), false);
  }
  assert.equal(existsSync(state.outputsDir), false);
});

test('a multi-megabyte envelope is decoded without recursive-regex overflow and never returned', async (t) => {
  const audio = Buffer.alloc(7200000, 39).toString('base64');
  const state = await setup(t, { answer: { ...ENVELOPE, audio } });
  const result = await state.gw.execute({ action: 'xai.speech.synthesize', input: { ...BASE, text: '🌟'.repeat(5000), timings: 'none' } });
  assert.equal(result.characters, 5000);
  assert.deepEqual(readFileSync(result.file.path), Buffer.from(audio, 'base64'));
  assert.equal(JSON.stringify(result).includes(audio), false);
});

test('gateway enforces this connector\'s declared 16 MiB output cap', async (t) => {
  const audio = Buffer.alloc(16777217, 39).toString('base64');
  const state = await setup(t, { answer: { ...ENVELOPE, audio } });
  const result = await state.gw.execute({ action: 'xai.speech.synthesize', input: BASE });
  assert.deepEqual(result, { status: 'vendor_error', reason: 'output_refused', detail: 'over_cap' });
  assert.equal(existsSync(state.outputsDir), false);
  assert.equal(JSON.stringify(result).includes(audio), false);
});

test('the manifest declares exactly the approved module, actions and file output', () => {
  const manifest = JSON.parse(readFileSync(fileURLToPath(new URL('../manifest.json', import.meta.url)), 'utf8'));
  assert.deepEqual(Object.keys(manifest.modules), ['speech']);
  const speech = manifest.modules.speech;
  assert.deepEqual(speech.auth, { provider: 'catalog', toolkit: 'GROK', scheme: 'API_KEY', privilege: 'write' });
  assert.equal(speech.unwrap_token, false);
  assert.equal(speech.fallback, 'none');
  assert.deepEqual(Object.keys(speech.actions).sort(), Object.keys(INPUTS).sort());
  for (const action of Object.values(speech.actions)) {
    assert.equal(action.confirmation, 'none');
    assert.equal(action.execution.prefer, 'proxy');
    assert.equal(action.input.additionalProperties, false);
  }
  assert.deepEqual(speech.actions.synthesize.output_file, { media_types: ['audio/mpeg'], max_bytes: 16777216 });
});
