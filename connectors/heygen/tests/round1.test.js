import fs from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { homedir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { modules } from '../index.js';
import { setup, run, scene, voice, page, speechAddress, videoAddress, videoAnswer, wav, mp4, hash, noPrivate, SIGNATURE } from './fixtures.js';

const VOICE_ID = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const VIDEO_ID = 'f0e1d2c3b4a5968778695a4b3c2d1e0f';
const FILE_REASON = 'requires an unchanged, readable regular MP3 or WAV, without links or protected path components';
const UNKNOWN_CODE = `https://files2.heygen.ai/invented-failure-code?sig=${SIGNATURE}`;
const indexSource = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const audioSource = fs.readFileSync(new URL('../audio.js', import.meta.url), 'utf8');
let sequence = 0;
const asModule = (code) => `data:text/javascript;base64,${Buffer.from(code + `\n// round 1 control ${sequence++}`).toString('base64')}`;
function replace(code, pairs) {
  for (const [from, to] of pairs) {
    assert.ok(code.includes(from), 'control still names its protection');
    code = code.replace(from, to);
  }
  return code;
}
async function variant({ index = [], audio } = {}) {
  const audioUrl = audio ? asModule(replace(audioSource, audio)) : new URL('../audio.js', import.meta.url).href;
  const code = replace(indexSource, index).replace("'./audio.js'", JSON.stringify(audioUrl))
    .replace("'./video.js'", JSON.stringify(new URL('../video.js', import.meta.url).href));
  return import(asModule(code));
}
function install(f, impl) {
  f.gw.connectors = f.connectors.map((c) => c.id === 'heygen' ? { ...c, impl } : c);
}
const requestPath = (address) => { const url = new URL(address); return url.pathname + url.search; };
const noFiles = (f) => assert.deepEqual(fs.existsSync(join(f.home, 'outputs')) ? fs.readdirSync(join(f.home, 'outputs')) : [], []);

async function downloadResult(f, kind) {
  const speech = kind === 'speech';
  return f.gw.callTool('execute', { action: speech ? 'heygen.speech.synthesize' : 'heygen.videos.download',
    input: speech ? { ...scene(), voice_id: VOICE_ID } : { video_id: VIDEO_ID } });
}
for (const kind of ['speech', 'video']) {
  test(`${kind}: own 32-character id in private media path publishes through real gateway guard`, async (t) => {
    const f = await setup(t, { video: kind === 'video', voiceId: VOICE_ID });
    const got = await downloadResult(f, kind);
    assert.equal(got.status, undefined); assert.equal(got.voice_id, undefined); assert.equal(got.video_id, undefined);
    const bytes = kind === 'speech' ? wav() : mp4();
    assert.equal(got.file.sha256, hash(bytes)); assert.deepEqual(fs.readFileSync(got.file.path), bytes);
    const address = kind === 'speech' ? speechAddress(VOICE_ID) : videoAddress(VIDEO_ID);
    assert.ok(new URL(address).pathname.includes(kind === 'speech' ? VOICE_ID : VIDEO_ID));
    assert.equal(f.media.options.length, 1); assert.equal(f.media.options[0].path, requestPath(address));
    if (kind === 'video') {
      const v = videoAnswer({ id: VIDEO_ID });
      assert.equal(new Set([v.video_url, v.thumbnail_url, v.gif_url, v.video_page_url].map(requestPath)).size, 4);
      assert.ok(f.calls.every((r) => r.method === 'GET'));
    }
    noPrivate(got); noPrivate(fs.readFileSync(f.audit.file, 'utf8'));
  });
  test(`control: restoring ${kind} caller id makes the active address guard refuse publication`, async (t) => {
    const f = await setup(t, { video: kind === 'video', voiceId: VOICE_ID });
    install(f, await variant({ index: kind === 'speech'
      ? [['return { model: input.model, characters,', 'return { voice_id: input.voice_id, model: input.model, characters,']]
      : [['delete got.video_id;', '']] }));
    const got = await downloadResult(f, kind);
    assert.throws(() => assert.equal(got.status, undefined), assert.AssertionError);
    assert.deepEqual(got, { status: 'vendor_error', reason: 'output_refused', detail: 'private_address' });
    noFiles(f); noPrivate(got);
  });
}
for (const field of ['thumbnail_url', 'gif_url', 'video_page_url']) {
  test(`control: downloading ${field} fails exact video_url transport-path assertion`, async (t) => {
    const f = await setup(t, { video: true });
    install(f, await variant({ index: [['url: res.data.video_url,', `url: res.data.${field},`]] }));
    const got = await downloadResult(f, 'video');
    assert.ok(got.file, 'fake bytes alone cannot distinguish the wrong media path');
    assert.throws(() => assert.equal(f.media.options[0].path, requestPath(videoAddress(VIDEO_ID))), assert.AssertionError);
  });
}

test('Turbo Free UTC cutoff: last millisecond sends unchanged free model; expiry sends no request or substitute', async (t) => {
  let now = Date.parse('2026-11-30T23:59:59.999Z');
  const f = await setup(t, { now: () => now });
  const input = scene('whole scene'); const original = structuredClone(input);
  const before = await run(f, 'speech.synthesize', input);
  assert.ok(before.file); assert.equal(before.model, input.model);
  assert.equal(f.calls.filter((r) => r.method === 'POST').length, 1);
  assert.equal(f.calls.at(-1).body.model, 'heygen-voice-1-turbo-free');
  assert.equal(f.calls.some((r) => r.endpoint.endsWith('/v3/users/me')), false);
  for (const date of ['2026-12-01T00:00:00.000Z', '2027-01-15T12:00:00.000Z']) {
    now = Date.parse(date);
    const calls = f.calls.length, measurements = f.measurements.length, downloads = f.media.requests.length;
    assert.deepEqual(await run(f, 'speech.synthesize', input), { status: 'invalid_arguments', field: 'model', reason: 'turbo_free_offer_ended' });
    assert.equal(f.calls.length, calls); assert.equal(f.measurements.length, measurements); assert.equal(f.media.requests.length, downloads);
    assert.deepEqual(input, original);
  }
  for (const model of ['heygen-voice-1', 'heygen-voice-1-turbo']) {
    assert.ok((await run(f, 'speech.synthesize', scene('whole scene', model))).file);
    assert.equal(f.calls.at(-1).body.model, model);
  }
});
test('control: removing the free-offer cutoff fails the no-request assertion after expiry', async (t) => {
  const f = await setup(t, { now: () => Date.parse('2026-12-01T00:00:00.000Z') });
  install(f, await variant({ index: [["input.model === 'heygen-voice-1-turbo-free' && Date.now() >= TURBO_FREE_END", 'false']] }));
  await run(f, 'speech.synthesize', scene());
  assert.throws(() => assert.equal(f.calls.length, 0), assert.AssertionError);
  assert.equal(f.calls.at(-1).body.model, 'heygen-voice-1-turbo-free');
});

async function privatePreflight(f, action) {
  f.reply = (req) => new URL(req.endpoint).pathname === '/v3/models/audio/voices'
    ? { status: 200, data: req.parameters.some((p) => p.name === 'token') ? page([voice()])
      : page([voice({ id: 'other-private-voice' })], { has_more: true, next_token: 'second-private-page' }) }
    : f.defaultReply(req);
  const result = await run(f, action, action === 'speech.synthesize' ? scene() : { voice_id: 'voice_fake-1' });
  assert.equal(result.status, undefined);
  const lists = f.calls.filter((r) => new URL(r.endpoint).pathname === '/v3/models/audio/voices');
  assert.equal(lists.length, 2);
  for (const req of lists) assert.deepEqual(req.parameters.filter((p) => p.name === 'type'), [{ name: 'type', value: 'private', type: 'query' }]);
}
for (const action of ['speech.synthesize', 'voices.delete']) {
  test(`${action}: every private preflight page explicitly sends type=private`, async (t) => {
    await privatePreflight(await setup(t), action);
  });
  for (const changed of ["type: 'public', ", '']) test(`control: ${action} ${changed ? 'public' : 'omitted'} type fails private-page assertion`, async (t) => {
    const f = await setup(t);
    install(f, await variant({ index: [["type: 'private', limit: 100", `${changed}limit: 100`]] }));
    await assert.rejects(() => privatePreflight(f, action), assert.AssertionError);
  });
}

// All protected metadata is invented and redirects only to safe test metadata.
// Even a planted failure never opens a real credential or memory file.
function uploadPaths(t, f) {
  const parent = join(f.home, 'physical'); fs.mkdirSync(parent);
  const target = join(parent, 'single.mp3'); fs.copyFileSync(f.file, target);
  assert.equal(fs.statSync(target).nlink, 1); assert.equal(fs.statSync(f.file).nlink, 1);
  const link = join(f.home, 'linked.mp3'), ancestor = join(f.home, 'linked-parent');
  fs.symlinkSync(target, link); fs.symlinkSync(parent, ancestor);
  const credential = process.platform === 'darwin' ? join(homedir(), 'Library', 'Application Support', 'wiser')
    : process.platform === 'win32' ? join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'wiser')
      : join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'wiser');
  const memory = join(f.home, 'memory'), env = join(f.home, '.env');
  const files = [join(credential, 'sample.mp3'), join(memory, 'sample.mp3'), join(env, 'sample.mp3')];
  const lstat = fs.lstatSync, realpath = fs.realpathSync;
  t.mock.method(fs, 'lstatSync', (path, ...args) => {
    if (files.includes(path)) return lstat(f.file, ...args);
    if ([credential, memory, env].includes(path)) return lstat(f.home, ...args);
    return lstat(path, ...args);
  });
  t.mock.method(fs, 'realpathSync', (path, ...args) => [credential, memory, env, ...files].includes(path) ? path : realpath(path, ...args));
  const relativePath = relative(process.cwd(), f.file); assert.ok(fs.existsSync(relativePath));
  // Do not use join for link/../file: it would erase the very component being tested.
  const traversal = `${ancestor}${sep}..${sep}sample.mp3`; assert.ok(fs.existsSync(traversal));
  return { link, ancestor: join(ancestor, 'single.mp3'), traversal, relative: relativePath, credential: files[0], memory: files[1], env: files[2] };
}
async function upload(impl, action, path) {
  const input = { path, idempotency_key: 'invented-key-123', ...(action === 'voices' ? { name: 'Invented' } : {}) };
  return impl.modules[action][action === 'voices' ? 'add' : 'upload_audio'](input, {});
}
for (const action of ['voices', 'assets']) {
  test(`${action}: existing relative, singly linked symlink, link/../file and mocked protected paths never open`, async (t) => {
    const f = await setup(t), paths = uploadPaths(t, f);
    const opened = t.mock.method(fs, 'openSync', () => { throw new Error(SIGNATURE); });
    for (const path of Object.values(paths)) {
      const got = await upload({ modules }, action, path);
      assert.deepEqual(got, { status: 'invalid_arguments', field: 'path', reason: FILE_REASON }); noPrivate(got);
      assert.equal(opened.mock.callCount(), 0);
    }
    assert.equal(f.calls.length, 0);
  });
}
const protections = [
  ['symlink', [['if (stats.isSymbolicLink())', 'if (false)']], ['link', 'ancestor', 'traversal']],
  ['absolute', [['!isAbsolute(path) || ', '']], ['relative']],
  ['credential', [['inside(here, credential) || inside(here, protectedDir)', 'false'], [' || inside(canonical, protectedDir)', '']], ['credential']],
  ['memory', [['/^memory$/i.test(name) || ', '']], ['memory']],
  ['env', [['/^\\.env(?:\\.|$)/i.test(name)', 'false']], ['env']],
];
for (const [name, audio, keys] of protections) test(`control: removing ${name} screen fails no-open for each viable path`, async (t) => {
  const f = await setup(t), paths = uploadPaths(t, f), impl = await variant({ audio });
  const opened = t.mock.method(fs, 'openSync', () => { throw new Error(SIGNATURE); });
  for (const action of ['voices', 'assets']) for (const key of keys) {
    opened.mock.resetCalls(); await upload(impl, action, paths[key]);
    assert.throws(() => assert.equal(opened.mock.callCount(), 0), assert.AssertionError);
    assert.equal(opened.mock.callCount(), 1);
  }
});

test('both readUpload consumers expose only fixed refusal when open error contains private data', async (t) => {
  const f = await setup(t);
  t.mock.method(fs, 'openSync', () => { throw new Error(UNKNOWN_CODE, { cause: new Error(SIGNATURE) }); });
  for (const action of ['voices', 'assets']) {
    const got = await upload({ modules }, action, f.file);
    assert.deepEqual(got, { status: 'invalid_arguments', field: 'path', reason: FILE_REASON }); noPrivate(got);
  }
});
test('control: copying readUpload error message fails noPrivate and fixed-reason assertions', async (t) => {
  const f = await setup(t);
  const impl = await variant({ audio: [[`  } catch {\n    return invalid('path', '${FILE_REASON}');`, "  } catch (error) {\n    return invalid('path', error.message);"]] });
  t.mock.method(fs, 'openSync', () => { throw new Error(UNKNOWN_CODE); });
  for (const action of ['voices', 'assets']) {
    const got = await upload(impl, action, f.file);
    assert.throws(() => noPrivate(got), /private field escaped/);
    assert.throws(() => assert.equal(got.reason, FILE_REASON), assert.AssertionError);
  }
});

async function unknownFailure(f, action) {
  f.reply = (req) => {
    const path = new URL(req.endpoint).pathname;
    if (path === '/v3/models/audio/voices') return { status: 200, data: page([voice({ failure_code: UNKNOWN_CODE })]) };
    return { status: 200, data: { data: req.method === 'DELETE' ? { status: 'ok', failure_code: UNKNOWN_CODE } : voice({ failure_code: UNKNOWN_CODE }) } };
  };
  const got = await run(f, `voices.${action}`, action === 'list' ? {} : { voice_id: 'voice_fake-1' });
  assert.equal(got.status, undefined);
  if (action === 'delete') assert.equal(got.deleted, true);
  const projected = action === 'list' ? got.voices[0] : action === 'get' ? got.voice : got;
  assert.equal(Object.hasOwn(projected, 'failure_code'), false); noPrivate(got);
}
for (const action of ['list', 'get', 'delete']) {
  test(`voices.${action}: signed-address-shaped unknown failure_code is absent`, async (t) => {
    await unknownFailure(await setup(t), action);
  });
  test(`control: forwarding unknown failure_code fails voices.${action} omission assertion`, async (t) => {
    const f = await setup(t);
    install(f, await variant({ index: action === 'delete'
      ? [["{ deleted: true, voice_id: input.voice_id }", "{ ...res.data, deleted: true, voice_id: input.voice_id }"]]
      : [['FAILURE_CODES.has(v.failure_code)', "typeof v.failure_code === 'string'"]] }));
    await assert.rejects(() => unknownFailure(f, action), assert.AssertionError);
  });
}
