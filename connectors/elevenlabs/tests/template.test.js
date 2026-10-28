import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { confirmCall, createTestGateway, makeHome, putActive } from '../../../gateway/test/fake-provider.js';
import { modules } from '../index.js';

const DIR = fileURLToPath(new URL('..', import.meta.url));
const MANIFEST = JSON.parse(fs.readFileSync(join(DIR, 'manifest.json'), 'utf8'));
const MODELS = MANIFEST.modules.speech.actions.synthesize.input.properties.model_id.enum;
const MP3 = Buffer.from('SUQzAQIDBA==', 'base64');
const speech = (text = 'Hi', model_id = 'eleven_v4') => ({ text, voice_id: 'voice_fake-1', model_id });
const align = (text) => ({ characters: Array.from(text), character_start_times_seconds: Array.from(text, (_, i) => i / 10), character_end_times_seconds: Array.from(text, (_, i) => (i + 1) / 10) });
const envelope = (text, extra = {}) => ({ audio_base64: MP3.toString('base64'), alignment: align(text), normalized_alignment: null, ...extra });
const action = (module, name) => `elevenlabs.${module}.${name}`;

beforeEach((t) => t.mock.method(globalThis, 'fetch', async () => { throw new Error('offline transport: network forbidden'); }));

async function setup(t, options = {}) {
  const home = fs.realpathSync(makeHome());
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const f = await createTestGateway({ home, outputsDir: join(home, 'outputs'), ...options });
  f.calls = [];
  for (const module of Object.keys(MANIFEST.modules)) await putActive(f.store, f.fake, { service: 'elevenlabs', module });
  f.reply = (req) => {
    if (req.endpoint.endsWith('/with-timestamps')) return envelope(req.body.text);
    if (req.endpoint === '/v1/voices/add') return { voice_id: 'clone_fake', requires_verification: false };
    if (req.method === 'DELETE') return { status: 'ok' };
    if (req.endpoint === '/v1/voices') return { voices: [] };
    if (req.endpoint === '/v1/models') return [];
    throw new Error('unexpected fake request');
  };
  f.fake.auth.proxy = async (req) => { f.calls.push(req); return { status: 200, data: await f.reply(req) }; };
  f.file = join(home, 'sample.mp3');
  fs.writeFileSync(f.file, MP3);
  return f;
}

async function run(f, module, name, input) {
  return confirmCall(f.gw, { action: action(module, name), input });
}

function noFile(value) {
  assert.equal(Object.hasOwn(value, 'file'), false);
  assert.equal(Object.hasOwn(value, 'output_file'), false);
  assert.equal(JSON.stringify(value).includes('audio_base64'), false);
}

test('template-derived connector loads with exact manifest/export parity and no placeholders', async (t) => {
  const f = await setup(t);
  assert.deepEqual(Object.keys(modules), ['speech', 'voices', 'models']);
  let count = 0;
  for (const [module, md] of Object.entries(MANIFEST.modules)) {
    assert.deepEqual(Object.keys(modules[module]), Object.keys(md.actions));
    assert.deepEqual(md.auth, { provider: 'catalog', toolkit: 'ELEVENLABS', scheme: 'API_KEY', privilege: 'write' });
    assert.equal(md.unwrap_token, false);
    assert.equal(md.fallback, 'none');
    count += Object.keys(md.actions).length;
  }
  assert.equal(count, 5);
  assert.ok(f.connectors.some((row) => row.id === 'elevenlabs'));
  for (const name of ['CONNECTOR.md', 'auth.md', 'manifest.json', 'index.js', 'package.json']) {
    assert.doesNotMatch(fs.readFileSync(join(DIR, name), 'utf8'), /\{\{/);
  }
});

test('only synthesis declares the exact pay standing approval and keeps always confirmation', () => {
  const eligible = [];
  for (const [module, md] of Object.entries(MANIFEST.modules)) for (const [name, row] of Object.entries(md.actions)) {
    if (Object.hasOwn(row, 'standing_approval')) eligible.push(action(module, name));
  }
  assert.deepEqual(eligible, ['elevenlabs.speech.synthesize']);
  const synthesize = MANIFEST.modules.speech.actions.synthesize;
  assert.equal(synthesize.confirmation, 'always');
  assert.deepEqual(synthesize.standing_approval, {
    kind: 'pay',
    summary: 'synthesize ElevenLabs narration charged to your own ElevenLabs plan',
    caution: "Each call under this approval spends credits from your ElevenLabs plan, or money if pay-as-you-go or overage is on, without asking each time. The gateway does not know your account's maximum charge.",
  });
});

test('published schemas are applied at the gateway boundary for all five actions', async (t) => {
  const f = await setup(t);
  for (const [module, md] of Object.entries(MANIFEST.modules)) for (const [name, row] of Object.entries(md.actions)) {
    const base = module === 'speech' ? speech() : name === 'add' ? { name: 'Clone', path: f.file } : name === 'delete' ? { voice_id: 'voice_fake' } : {};
    // Keep the template schema-enforcement block: undeclared, mistyped, missing
    // required and non-object input must all stop at the gateway, before transport.
    const cases = [{ ...base, undeclared: 'example' }];
    for (const [key, schema] of Object.entries(row.input.properties)) {
      cases.push({ ...base, [key]: 12345 });
      if (schema.minLength) cases.push({ ...base, [key]: '' });
      if (schema.maxLength) cases.push({ ...base, [key]: 'a'.repeat(schema.maxLength + 1) });
      if (row.input.required.includes(key)) {
        const missing = { ...base }; delete missing[key]; cases.push(missing);
      }
    }
    if (Object.hasOwn(base, 'voice_id')) for (const id of ['', 'a/b', '../x', 'a'.repeat(129), 'not a voice']) cases.push({ ...base, voice_id: id });
    if (module === 'speech') for (const model of ['unknown', 'eleven_dialogue', '']) cases.push({ ...base, model_id: model });
    for (const input of cases) assert.equal((await f.gw.execute({ action: action(module, name), input })).status, 'invalid_arguments');
    for (const input of [null, [], 'example', 1]) assert.deepEqual(await f.gw.execute({ action: action(module, name), input }), { status: 'invalid_arguments', field: 'input' });
  }
  assert.equal(f.calls.length, 0);
});

test('code-point bounds are enforced by gateway and residual module checks without trimming', async (t) => {
  const f = await setup(t);
  for (const [module, name, input, key] of [
    ['speech', 'synthesize', speech('𐐀'.repeat(5001)), 'text'],
    ['voices', 'add', { name: '𐐀'.repeat(101), path: f.file }, 'name'],
    ['voices', 'add', { name: 'Clone', path: '/'.repeat(4097) }, 'path'],
  ]) {
    assert.equal((await run(f, module, name, input)).status, 'invalid_arguments');
    assert.deepEqual(await modules[module][name](input, { proxy() { assert.fail('over-bound transport'); } }), { status: 'invalid_arguments', field: key });
  }
  assert.equal(f.calls.length, 0);
  const got = await run(f, 'speech', 'synthesize', speech(' \n '));
  assert.equal(got.characters, 3);
  assert.equal(f.calls[0].body.text, ' \n ');
  const clone = await run(f, 'voices', 'add', { name: '𐐀'.repeat(100), path: f.file });
  assert.equal(clone.voice_id, 'clone_fake');
});

test('three varied scenes and all four models are forwarded whole once and written byte for byte', async (t) => {
  const f = await setup(t);
  const scenes = ['Short ASCII.', 'a'.repeat(2252), '𐐀'.repeat(5000), 'Fourth model'];
  for (let i = 0; i < scenes.length; i += 1) {
    const input = speech(scenes[i], MODELS[i]);
    const before = f.calls.length;
    const got = await run(f, 'speech', 'synthesize', input);
    assert.equal(f.calls.length, before + 1);
    const req = f.calls.at(-1);
    assert.deepEqual(req.body, { text: scenes[i], model_id: MODELS[i] });
    assert.equal(req.endpoint, '/v1/text-to-speech/voice_fake-1/with-timestamps');
    assert.equal(req.method, 'POST');
    assert.deepEqual(req.parameters, [{ name: 'output_format', value: 'mp3_44100_128', type: 'query' }]);
    assert.deepEqual(got.alignment, align(scenes[i]));
    assert.equal(got.characters, Array.from(scenes[i]).length);
    assert.equal(got.model_id, MODELS[i]);
    const independentlyDecoded = Buffer.from('SUQzAQIDBA==', 'base64');
    assert.deepEqual(fs.readFileSync(got.file.path), independentlyDecoded);
    assert.equal(got.file.sha256, createHash('sha256').update(independentlyDecoded).digest('hex'));
    assert.equal(got.file.bytes, independentlyDecoded.length);
    assert.equal(got.file.media_type, 'audio/mpeg');
    const serialized = JSON.stringify(got);
    for (const key of ['output_file', 'audio_base64', 'SUQzAQIDBA==', 'normalized_alignment']) assert.equal(serialized.includes(key), false);
  }
});

test('missing grants stop every action; file-output host refusal precedes grant/provider access', async (t) => {
  const f = await setup(t);
  const unbound = await createTestGateway({ home: join(f.home, 'unbound'), outputsDir: join(f.home, 'unbound', 'outputs') });
  for (const [module, name, input] of [['speech', 'synthesize', speech()], ['voices', 'list', {}], ['voices', 'add', { name: 'Clone', path: f.file }], ['voices', 'delete', { voice_id: 'x' }], ['models', 'list', {}]]) {
    assert.equal((await unbound.gw.execute({ action: action(module, name), input })).status, 'needs_connect');
  }
  const hosted = await createTestGateway({ home: join(f.home, 'shared'), outputsDir: undefined });
  hosted.store.getConnection = () => assert.fail('hosted speech read connection');
  hosted.fake.auth.proxy = () => assert.fail('hosted speech reached provider');
  assert.equal((await hosted.gw.execute({ action: action('speech', 'synthesize'), input: speech() })).status, 'local_only');
});

test('every write requires matched single-use approval, and lists run without one', async (t) => {
  const f = await setup(t);
  for (const [module, name, input, mutations] of [
    ['speech', 'synthesize', speech(), [{ text: 'Changed' }, { voice_id: 'other' }, { model_id: 'eleven_v3' }]],
    ['voices', 'add', { name: 'Clone', path: f.file }, [{ name: 'Other' }, { path: join(f.home, 'other.mp3') }]],
    ['voices', 'delete', { voice_id: 'fake_voice' }, [{ voice_id: 'other' }]],
  ]) {
    const call = { action: action(module, name), input };
    let before = f.calls.length;
    assert.equal((await f.gw.execute({ ...call, confirm: true })).status, 'needs_confirmation');
    assert.equal(f.calls.length, before);
    assert.equal((await f.gw.execute(call)).status, 'needs_confirmation');
    for (const mutation of mutations) {
      assert.equal((await f.gw.execute({ ...call, input: { ...input, ...mutation }, confirm: true })).status, 'needs_confirmation');
      assert.equal(f.calls.length, before);
    }
    await f.gw.execute(call);
    const got = await f.gw.execute({ ...call, confirm: true });
    assert.notEqual(got.status, 'needs_confirmation');
    assert.equal(f.calls.length, before + 1);
    assert.equal((await f.gw.execute({ ...call, confirm: true })).status, 'needs_confirmation');
    assert.equal(f.calls.length, before + 1);
    await f.gw.execute(call);
    const row = await f.store.getConnection({ service: 'elevenlabs', module });
    const rebound = `fake-rebound-${module}-${name}`;
    await f.store.putConnection({ ...row, provider_account_id: rebound });
    f.fake.auth.setStatus(rebound, 'ACTIVE');
    assert.equal((await f.gw.execute({ ...call, confirm: true })).status, 'needs_confirmation');
    assert.equal(f.calls.length, before + 1);
  }
  assert.deepEqual(await f.gw.execute({ action: action('voices', 'list'), input: {} }), { voices: [] });
  assert.deepEqual(await f.gw.execute({ action: action('models', 'list'), input: {} }), { models: [] });
});

test('speech rejects malformed envelopes and projects normalized alignment without vendor extras', async (t) => {
  const f = await setup(t);
  const mutations = [
    () => null, () => 'raw audio',
    (v) => { delete v.audio_base64; },
    ...['', 'Zg', ' Zg==', 'Zg==\n', 'Zg-_', 'Zg�=', 'Zg===', '=g==', 'Zh==', 'AAAA===='].map((s) => (v) => { v.audio_base64 = s; }),
    (v) => { delete v.alignment; }, (v) => { v.alignment = {}; },
    (v) => { v.alignment.characters = []; },
    (v) => { v.alignment.characters.pop(); },
    (v) => { v.alignment.characters[0] = 3; },
    (v) => { v.alignment.characters[0] = 'wrong'; },
    (v) => { v.alignment.character_start_times_seconds[0] = NaN; },
    (v) => { v.alignment.character_end_times_seconds[0] = Infinity; },
    (v) => { v.alignment.character_start_times_seconds[0] = -1; },
    (v) => { v.alignment.character_end_times_seconds[0] = -1; },
    (v) => { v.alignment.character_start_times_seconds[1] = -0.1; },
    (v) => { v.alignment.character_start_times_seconds[0] = 0.2; v.alignment.character_end_times_seconds[0] = 0.3; },
    (v) => { v.normalized_alignment = {}; },
    (v) => { v.normalized_alignment = { ...align('norm'), character_end_times_seconds: [] }; },
    (v) => { v.error = 'private raw vendor payload'; },
    (v) => { v.success = false; }, (v) => { v.successful = false; },
  ];
  for (const mutate of mutations) {
    let data = envelope('Hi');
    const alternative = mutate(data);
    if (alternative !== undefined) data = alternative;
    f.reply = () => data;
    const got = await run(f, 'speech', 'synthesize', speech());
    assert.equal(got.status, 'vendor_error');
    assert.equal(got.reason, 'unexpected answer');
    noFile(got);
    assert.equal(JSON.stringify(got).includes('private raw vendor payload'), false);
  }
  const normalized = align('different text');
  normalized.extra = 'drop';
  f.reply = () => envelope('Hi', { normalized_alignment: normalized, extra: 'drop' });
  const got = await run(f, 'speech', 'synthesize', speech());
  assert.deepEqual(got.normalized_alignment, align('different text'));
  assert.equal(Object.hasOwn(got, 'extra'), false);
  f.reply = () => { const v = envelope('Hi'); delete v.normalized_alignment; return v; };
  assert.equal(Object.hasOwn(await run(f, 'speech', 'synthesize', speech()), 'normalized_alignment'), false);
});

test('decoded audio cap admits exactly 16 MiB and rejects one more byte', async (t) => {
  const f = await setup(t);
  for (const size of [16777216, 16777217]) {
    const bytes = Buffer.alloc(size, 19);
    f.reply = () => envelope('Hi', { audio_base64: bytes.toString('base64') });
    const got = await run(f, 'speech', 'synthesize', speech());
    if (size === 16777216) {
      assert.equal(got.file.bytes, size);
      assert.equal(got.file.sha256, createHash('sha256').update(bytes).digest('hex'));
    } else { assert.equal(got.status, 'vendor_error'); noFile(got); }
  }
});

test('voice and model lists project only declared fields and accept empty arrays', async (t) => {
  const f = await setup(t);
  const voices = ['cloned', 'premade', 'professional'].map((category, i) => ({ voice_id: `v${i}`, name: 'Duplicate', category, samples: [MP3], preview_url: 'https://example.com/private', owner: 'private' }));
  f.reply = () => ({ voices, extra: 'drop' });
  assert.deepEqual(await run(f, 'voices', 'list', {}), { voices: voices.map(({ voice_id, name, category }) => ({ voice_id, name, category })) });
  const models = [true, false].map((can_do_text_to_speech, i) => ({ model_id: `model${i}`, name: 'Example', can_do_text_to_speech, maximum_text_length_per_request: 10000, model_rates: { character_cost_multiplier: 0, cost_discount_multiplier: 0.5, other: 'drop' }, extra: 'drop' }));
  f.reply = () => models;
  const got = await run(f, 'models', 'list', {});
  assert.equal(got.models[1].can_do_text_to_speech, false);
  assert.deepEqual(got.models[0].model_rates, { character_cost_multiplier: 0, cost_discount_multiplier: 0.5 });
  assert.equal(JSON.stringify(got).includes('drop'), false);
  for (const data of [null, {}, { voices: null }, { voices: [null] }, { voices: [{ voice_id: 'x', name: 'X' }] }, { voices: [{ voice_id: 1, name: 'X', category: 'cloned' }] }]) {
    f.reply = () => data;
    assert.equal((await run(f, 'voices', 'list', {})).status, 'vendor_error');
  }
  const base = { model_id: 'fake', name: 'Fake', can_do_text_to_speech: true };
  for (const data of [null, {}, [null], [{}], [{ ...base, can_do_text_to_speech: 'true' }], ...[0, -1, 1.5, null].map((v) => [{ ...base, maximum_text_length_per_request: v }]), ...[null, [], { character_cost_multiplier: -1 }, { cost_discount_multiplier: Infinity }, { character_cost_multiplier: '1' }].map((v) => [{ ...base, model_rates: v }])]) {
    f.reply = () => data;
    assert.equal((await run(f, 'models', 'list', {})).status, 'vendor_error');
  }
});

test('clone upload multipart independently parses to exact bytes, preserved name and fixed fields', async (t) => {
  const f = await setup(t);
  const name = 'Quotes " \\ and\r\nUnicode 𐐀';
  f.reply = () => ({ voice_id: 'clone_fake', requires_verification: true, extra: 'drop' });
  assert.deepEqual(await run(f, 'voices', 'add', { name, path: f.file }), { voice_id: 'clone_fake', requires_verification: true });
  const req = f.calls[0];
  assert.equal(req.body, undefined);
  const bytes = Buffer.from(req.binary_body.base64, 'base64');
  const form = await new Response(bytes, { headers: { 'content-type': req.binary_body.content_type } }).formData();
  assert.deepEqual([...form.keys()], ['name', 'files', 'remove_background_noise']);
  assert.equal(form.get('name'), name);
  assert.equal(form.get('remove_background_noise'), 'false');
  const file = form.get('files');
  assert.equal(file.name, 'sample.mp3');
  assert.equal(file.type, 'audio/mpeg');
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), MP3);
  assert.equal(bytes.includes(f.file), false);
});

test('upload cap accepts proof size and exact cap; larger sizes refuse before opening/transport', async (t) => {
  const f = await setup(t);
  for (const size of [2865600, 3000000]) {
    fs.writeFileSync(f.file, Buffer.alloc(size, 42));
    assert.equal((await run(f, 'voices', 'add', { name: 'Clone', path: f.file })).voice_id, 'clone_fake');
  }
  for (const size of [3000001, 3145728]) {
    fs.writeFileSync(f.file, Buffer.alloc(size, 42));
    const before = f.calls.length;
    const opened = t.mock.method(fs, 'openSync', () => assert.fail('oversize upload opened'));
    const got = await modules.voices.add({ name: 'Clone', path: f.file }, { proxy() { assert.fail('oversize transport'); } });
    assert.equal(opened.mock.callCount(), 0);
    opened.mock.restore();
    assert.equal(got.status, 'invalid_arguments');
    assert.match(got.reason, new RegExp(String(size)));
    assert.equal(f.calls.length, before);
  }
});

test('unsafe filesystem inputs never open protected paths or send a request', async (t) => {
  const f = await setup(t);
  const zero = join(f.home, 'zero.mp3'); fs.writeFileSync(zero, '');
  const wrong = join(f.home, 'wrong.wav'); fs.writeFileSync(wrong, 'invented');
  const link = join(f.home, 'link.mp3'); fs.symlinkSync(f.file, link);
  const parentLink = join(f.home, 'linked'); fs.symlinkSync(f.home, parentLink);
  const hard = join(f.home, 'hard.mp3'); fs.linkSync(f.file, hard);
  const fifo = join(f.home, 'pipe.mp3'); execFileSync('mkfifo', [fifo]);
  const config = process.platform === 'darwin' ? join(homedir(), 'Library', 'Application Support', 'wiser') : process.platform === 'win32' ? join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'wiser') : join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'wiser');
  // Protected names are real, readable, singly linked MP3s, so only the name check can refuse them.
  const envFile = join(f.home, '.env.mp3'); fs.writeFileSync(envFile, MP3);
  fs.mkdirSync(join(f.home, '.env')); const envNested = join(f.home, '.env', 'sample.mp3'); fs.writeFileSync(envNested, MP3);
  fs.mkdirSync(join(f.home, 'memory')); const memoryFile = join(f.home, 'memory', 'sample.mp3'); fs.writeFileSync(memoryFile, MP3);
  const paths = ['relative.mp3', 'https://example.com/a.mp3', join(f.home, 'missing.mp3'), zero, wrong, link, join(parentLink, 'sample.mp3'), hard, f.file, fifo, f.home, envFile, envNested, memoryFile, join(config, 'sample.mp3')];
  const opened = t.mock.method(fs, 'openSync', () => assert.fail('refused path opened'));
  // The credential directory is refused by name before anything inside it is inspected.
  const inspected = [];
  const realLstat = fs.lstatSync;
  const lstat = t.mock.method(fs, 'lstatSync', function(p, ...rest) { inspected.push(String(p)); return realLstat.call(fs, p, ...rest); });
  for (const path of paths) {
    const got = await modules.voices.add({ name: 'Clone', path }, { proxy() { assert.fail('unsafe transport'); } });
    assert.equal(got.status, 'invalid_arguments');
    assert.equal(got.field, 'path');
  }
  assert.equal(opened.mock.callCount(), 0);
  opened.mock.restore();
  lstat.mock.restore();
  assert.ok(!inspected.some((p) => p === config || p.startsWith(config + sep)), 'credential directory inspected');
  assert.equal(f.calls.length, 0);
});

test('file replacement, unreadability and concurrent same-size changes are refused', async (t) => {
  const f = await setup(t);
  const add = () => modules.voices.add({ name: 'Clone', path: f.file }, { proxy() { assert.fail('changed file transported'); } });
  const originalOpen = fs.openSync;
  const unreadable = t.mock.method(fs, 'openSync', () => { throw Object.assign(new Error('private path'), { code: 'EACCES' }); });
  assert.equal((await add()).status, 'invalid_arguments');
  unreadable.mock.restore();
  const replaced = t.mock.method(fs, 'openSync', function(path, flags) {
    fs.unlinkSync(f.file); fs.writeFileSync(f.file, MP3);
    return originalOpen(path, flags);
  });
  assert.equal((await add()).status, 'invalid_arguments');
  replaced.mock.restore();
  const originalRead = fs.readSync;
  let changed = false;
  const changing = t.mock.method(fs, 'readSync', function(...args) {
    const n = originalRead(...args);
    if (!changed) { changed = true; fs.writeFileSync(f.file, Buffer.alloc(MP3.length, 0)); }
    return n;
  });
  assert.equal((await add()).status, 'invalid_arguments');
  changing.mock.restore();
});

test('upload and delete never claim success for malformed 2xx answers', async (t) => {
  const f = await setup(t);
  for (const data of [{}, { voice_id: '', requires_verification: false }, { voice_id: 'x' }, { voice_id: 'x', requires_verification: 1 }, { voice_id: 'x', requires_verification: false, error: 'private' }]) {
    f.reply = () => data;
    assert.equal((await run(f, 'voices', 'add', { name: 'Clone', path: f.file })).status, 'vendor_error');
  }
  for (const data of [{}, null, { status: 'error' }, { status: 'ok', error: 'private' }, { status: 'ok', success: false }, { status: 'ok', successful: false }]) {
    f.reply = () => data;
    const got = await run(f, 'voices', 'delete', { voice_id: 'fake_voice' });
    assert.equal(got.status, 'vendor_error'); assert.equal(got.deleted, undefined);
  }
  f.reply = () => ({ status: 'ok', extra: 'drop' });
  assert.deepEqual(await run(f, 'voices', 'delete', { voice_id: 'fake_voice' }), { deleted: true, voice_id: 'fake_voice' });
});

test('provider failures and thrown errors are sanitized, preserved and never retried', async (t) => {
  const f = await setup(t);
  for (const code of [401, 403, 413, 422, 429, 500, 503]) {
    const before = f.calls.length;
    f.fake.auth.proxy = async (req) => { f.calls.push(req); return { status: code, error: { code: 'vendor_error', endpoint: req.endpoint, method: req.method }, data: 'private raw body', headers: { key: 'private' } }; };
    const got = await run(f, 'speech', 'synthesize', speech());
    assert.equal(got.status, 'vendor_error'); assert.equal(got.http_status, code);
    assert.equal(f.calls.length, before + 1);
    assert.equal(JSON.stringify(got).includes('private'), false); noFile(got);
  }
  f.fake.auth.proxy = async () => { throw new Error('private audio and vendor credentials'); };
  const got = await run(f, 'speech', 'synthesize', speech());
  assert.equal(got.status, 'vendor_error');
  assert.equal(JSON.stringify(got).includes('private'), false); noFile(got);
  delete f.fake.auth.proxy;
  assert.equal((await run(f, 'speech', 'synthesize', speech())).status, 'needs_provider_capability');
});

test('multipart boundary collisions regenerate without changing the sample', async (t) => {
  const crypto = (await import('node:crypto')).default;
  const f = await setup(t);
  const collided = `wiser-${Buffer.alloc(24, 1).toString('hex')}`;
  const bytes = Buffer.from(`invented ${collided} audio`);
  fs.writeFileSync(f.file, bytes);
  let count = 0;
  const mock = t.mock.method(crypto, 'randomBytes', () => Buffer.alloc(24, ++count));
  const got = await run(f, 'voices', 'add', { name: 'Collision', path: f.file });
  mock.mock.restore();
  assert.equal(got.voice_id, 'clone_fake');
  assert.equal(count, 2);
  const req = f.calls.at(-1);
  assert.equal(req.binary_body.content_type.includes(collided), false);
  const form = await new Response(Buffer.from(req.binary_body.base64, 'base64'), { headers: { 'content-type': req.binary_body.content_type } }).formData();
  assert.deepEqual(Buffer.from(await form.get('files').arrayBuffer()), bytes);
});

test('maximum path spelling and whitespace-only clone names have no unpublished restriction', async (t) => {
  const f = await setup(t);
  const path = f.file.replace('/', '/'.repeat(4096 - Array.from(f.file).length + 1));
  assert.equal(Array.from(path).length, 4096);
  assert.equal((await run(f, 'voices', 'add', { name: ' \n ', path })).voice_id, 'clone_fake');
});

test('sole toolkit adoption and multiple/labelled exclusions hold', async (t) => {
  const f = await setup(t);
  const clear = () => {
    for (const row of f.store.listConnections()) f.store.deleteConnection({ providerAccountId: row.provider_account_id });
  };
  const a = { id: 'fake-shared', toolkit: 'ELEVENLABS', status: 'ACTIVE' };
  for (const [accounts, labelled, expected] of [
    [[a], null, 3],
    [[a, { ...a, id: 'fake-second' }], null, 0],
    [[a], { service: 'elevenlabs', module: 'voices', label: 'named', provider_account_id: a.id }, 0],
    [[a], { service: 'xai', module: 'speech', label: 'other', provider_account_id: a.id }, 0],
  ]) {
    clear();
    if (labelled) f.store.putConnection({ ...labelled, provider: 'catalog', privilege: 'write', status: 'ACTIVE' });
    f.fake.auth.listAccounts = async () => accounts;
    await f.gw.hydrateFromProvider();
    const adopted = f.store.listConnections().filter((r) => r.service === 'elevenlabs' && r.label === undefined);
    assert.equal(adopted.length, expected);
    if (expected) for (const row of adopted) {
      assert.equal(row.privilege, 'write'); assert.equal(row.provider_account_id, a.id);
    }
  }
});

test('revocation names and ends all shared bindings while deleting a voice keeps the grant', async (t) => {
  const f = await setup(t);
  const id = 'fake-shared-revocation';
  for (const module of Object.keys(MANIFEST.modules)) {
    const row = f.store.getConnection({ service: 'elevenlabs', module });
    f.store.putConnection({ ...row, provider_account_id: id });
  }
  f.fake.auth.setStatus(id, 'ACTIVE');
  assert.equal((await run(f, 'voices', 'delete', { voice_id: 'disposable_fake' })).deleted, true);
  assert.equal(f.store.listConnections().filter((r) => r.provider_account_id === id).length, 3);
  const stop = await f.gw.disconnect({ service: 'elevenlabs', module: 'voices' });
  assert.equal(stop.status, 'needs_confirmation');
  assert.equal(stop.modules_ending.length, 3);
  const got = await confirmCall(f.gw, { service: 'elevenlabs', module: 'voices', provider_account_id: id });
  assert.equal(got.status, 'disconnected');
  assert.equal(f.store.listConnections().filter((r) => r.provider_account_id === id).length, 0);
});

test('built-in ElevenLabs bindings adopt a sole account under the normalized custom-toolkit name', async (t) => {
  const f = await setup(t);
  for (const row of f.store.listConnections()) f.store.deleteConnection({ providerAccountId: row.provider_account_id });
  f.fake.auth.listAccounts = async () => [{ id: 'fake-custom-only', toolkit: 'CUSTOM_ELEVENLABS', status: 'ACTIVE' }];
  await f.gw.hydrateFromProvider();
  const adopted = f.store.listConnections().filter((r) => r.service === 'elevenlabs');
  assert.deepEqual(adopted.map((row) => row.module).sort(), ['models', 'speech', 'voices']);
  for (const row of adopted) {
    assert.equal(row.provider_account_id, 'fake-custom-only');
    assert.equal(row.status, 'ACTIVE');
    assert.equal(row.privilege, 'write');
  }
});

test('agreement harness still detects hidden bounds, missing enforcement and transport-free errors', async (t) => {
  const { collectDivergences } = await import('../../../gateway/test/agreement-harness.js');
  const hiddenBound = (module, name, field, max) => {
    const original = modules[module][name];
    return async (input, ctx) => Array.from(input[field]).length > max
      ? { status: 'invalid_arguments', field }
      : original(input, ctx);
  };
  const sanitizedTransport = async (_input, ctx) => {
    try { await ctx.proxy({ endpoint: '/invented', method: 'POST' }); }
    catch { return { status: 'vendor_error' }; }
  };
  for (const [module, name, implementation, expected] of [
    ['speech', 'synthesize', hiddenBound('speech', 'synthesize', 'text', 0),
      ['A elevenlabs speech.synthesize text']],
    ['voices', 'add', hiddenBound('voices', 'add', 'name', 0),
      ['A elevenlabs voices.add name']],
    ['voices', 'add', hiddenBound('voices', 'add', 'path', 1),
      ['A elevenlabs voices.add path']],
    ['speech', 'synthesize', sanitizedTransport, ['B elevenlabs speech.synthesize text maxLength']],
    ['voices', 'add', sanitizedTransport,
      ['B elevenlabs voices.add name maxLength', 'B elevenlabs voices.add path maxLength']],
    ['speech', 'synthesize', async () => ({ status: 'vendor_error' }),
      ['F elevenlabs speech.synthesize no-accepted-baseline']],
  ]) {
    const mock = t.mock.method(modules[module], name, implementation);
    try {
      const { found, errors } = await collectDivergences();
      assert.deepEqual(errors, []);
      for (const key of expected) assert.ok(found.has(key), `gate missed ${key}`);
    } finally {
      mock.mock.restore();
    }
  }
});
