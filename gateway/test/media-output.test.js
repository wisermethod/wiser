import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { join, basename } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { test } from 'node:test';
import { PassThrough, Writable } from 'node:stream';
import { runStdio } from '../src/rpc.js';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeOutputFile, cleanupOutputs } from '../src/file-output.js';
import { loadConnector } from '../src/manifest.js';
import { StatusSignal, sanitizeError } from '../src/errors.js';
import { buildContext } from '../src/context.js';
import { createTestGateway, makeHome, putActive } from './fake-provider.js';
import { transport, HOST, URL_VALUE, SIGNATURE } from './media-transport.js';
import { wav, mp4 } from './media-fixtures.js';
const SERVER = fileURLToPath(new URL('../server.js', import.meta.url));
const ACTION = 'media-fixture.media.render';
const refused = (detail) => ({ status: 'vendor_error', reason: 'output_refused', detail });
function home(t) { const dir = makeHome(); t.after(() => fs.rmSync(dir, { force: true, recursive: true })); return dir; }

function fixture(root, extra = {}) {
  const dir = join(root, 'media-fixture'); fs.mkdirSync(dir);
  const base = { risk: 'low', confirmation: 'none', execution: { prefer: 'proxy' }, input: { type: 'object', properties: {}, additionalProperties: false } };
  fs.writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  fs.writeFileSync(join(dir, 'index.js'), 'export const modules = { media: { render: async () => ({}), plain: async () => ({}) } };');
  const manifest = { id: 'media-fixture', service: 'media-fixture', modules: { media: {
    auth: { provider: 'catalog', toolkit: 'FAKE_MEDIA', scheme: 'API_KEY', privilege: 'write' }, unwrap_token: false,
    actions: { render: { ...base, output_file: { media_types: ['audio/wav', 'video/mp4'], max_bytes: 52 }, download_media: { hosts: [HOST] }, ...extra }, plain: { ...base } },
  } } };
  const path = join(dir, 'manifest.json'); fs.writeFileSync(path, JSON.stringify(manifest));
  return { dir, path, manifest, action: manifest.modules.media.actions.render };
}
async function gateway(t, options = {}) {
  const root = home(t);
  const f = fixture(root, options.extra);
  const connector = await loadConnector(f.dir);
  const state = await createTestGateway({ home: root, connectors: [connector], session: false, ...(options.hosted ? {} : { outputsDir: join(root, 'outputs') }) });
  if (options.active !== false) await putActive(state.store, state.fake, { service: 'media-fixture', module: 'media' });
  return { ...state, ...f, connector, output: join(root, 'outputs') };
}

for (const [mediaType, ext, generate] of [['audio/wav', 'wav', wav], ['video/mp4', 'mp4', mp4]]) {
  const CAP = generate().length;
  test(`${ext} valid generated container reaches disk at cap with independent digest`, async (t) => {
    const bytes = generate();
    const net = transport(t, { chunks: [bytes.subarray(0, 15), bytes.subarray(15)] });
    const s = await gateway(t);
    s.connector.manifest.modules.media.actions.render.output_file.max_bytes = CAP;
    s.connector.impl.modules.media.render = async (_input, ctx) => ({ output_file: { media_type: mediaType, data: await ctx.downloadMedia({ url: URL_VALUE, media_type: mediaType }) } });
    const answer = await s.gw.callTool('execute', { action: ACTION });
    assert.equal(answer.file.bytes, bytes.length); assert.equal(answer.file.media_type, mediaType);
    assert.equal(answer.file.sha256, createHash('sha256').update(bytes).digest('hex'));
    assert.deepEqual(fs.readFileSync(answer.file.path), bytes);
    assert.match(basename(answer.file.path), new RegExp(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.${ext}$`));
    assert.equal(fs.statSync(s.output).mode & 0o777, 0o700); assert.equal(fs.statSync(answer.file.path).mode & 0o777, 0o600);
    assert.equal(net.options.length, 1); assert.equal(JSON.stringify(answer).includes('output_file'), false);
  });
  test(`${ext} one byte over downloaded cap never writes a file`, async (t) => {
    transport(t, { chunks: [generate(CAP + 1)] });
    const s = await gateway(t);
    s.connector.manifest.modules.media.actions.render.output_file.max_bytes = CAP;
    s.connector.impl.modules.media.render = async (_input, ctx) => ({ output_file: { media_type: mediaType, data: await ctx.downloadMedia({ url: URL_VALUE, media_type: mediaType }) } });
    assert.equal((await s.gw.execute({ action: ACTION })).detail, 'over_cap'); assert.equal(fs.existsSync(s.output), false);
  });
  test(`${ext} writer enforces cap, Uint8Array view, metadata snapshot and complete short writes`, (t) => {
    const dir = join(home(t), 'outputs'); const data = generate(); const backing = new Uint8Array(data.length + 8); backing.set(data, 4);
    const view = backing.subarray(4, 4 + data.length); const cid = randomUUID(); const out = { media_types: [mediaType], max_bytes: data.length };
    assert.deepEqual(writeOutputFile({ ...out, max_bytes: data.length - 1 }, { output_file: { media_type: mediaType, data } }, dir, cid), refused('over_cap'));
    assert.equal(fs.existsSync(dir), false);
    const original = fs.writeSync; let writes = 0;
    t.mock.method(fs, 'writeSync', (fd, b, offset, n) => { writes++; return original(fd, b, offset, Math.min(7, n)); }); syncBuiltinESMExports();
    t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
    const answer = writeOutputFile(out, { output_file: { media_type: mediaType, data: view } }, dir, cid); backing.fill(0);
    assert.ok(writes > 1); assert.deepEqual(fs.readFileSync(answer.file.path), data);
    assert.deepEqual(answer.file, { path: join(dir, `${cid}.${ext}`), bytes: data.length, sha256: createHash('sha256').update(data).digest('hex'), media_type: mediaType });
  });
  for (const kind of ['directory-link', 'directory-file', 'link', 'hardlink', 'directory']) test(`${ext} refuses ${kind} without touching target`, (t) => {
    const root = home(t); const outputs = join(root, 'outputs'); const target = join(root, 'sentinel'); fs.writeFileSync(target, 'keep');
    if (kind === 'directory-link') fs.symlinkSync(root, outputs);
    else if (kind === 'directory-file') fs.writeFileSync(outputs, 'keep');
    else { fs.mkdirSync(outputs); const entry = join(outputs, randomUUID() + '.' + ext);
      if (kind === 'link') fs.symlinkSync(target, entry); if (kind === 'hardlink') fs.linkSync(target, entry); if (kind === 'directory') fs.mkdirSync(entry); }
    const answer = writeOutputFile({ media_types: [mediaType], max_bytes: CAP }, { output_file: { media_type: mediaType, data: generate() } }, outputs, randomUUID());
    assert.equal(answer.detail, 'outputs_not_clean'); assert.equal(fs.readFileSync(target, 'utf8'), 'keep');
  });
  for (const suffix of ['', '.partial']) test(`${ext} ${suffix || 'final'} collision preserves previous file`, (t) => {
    const outputs = join(home(t), 'outputs'); fs.mkdirSync(outputs); const cid = randomUUID(); const path = join(outputs, `${cid}.${ext}${suffix}`); fs.writeFileSync(path, 'keep');
    assert.deepEqual(writeOutputFile({ media_types: [mediaType], max_bytes: CAP }, { output_file: { media_type: mediaType, data: generate() } }, outputs, cid), refused('write_failed'));
    assert.equal(fs.readFileSync(path, 'utf8'), 'keep'); assert.deepEqual(fs.readdirSync(outputs), [basename(path)]);
  });
  for (const method of ['writeSync', 'fsyncSync', 'closeSync', 'renameSync']) test(`${ext} ${method} failure cleans partial`, (t) => {
    const outputs = join(home(t), 'outputs'); const original = fs[method]; let injected = false;
    t.mock.method(fs, method, (...args) => { if (!injected) { injected = true; throw new Error('invented'); } return original(...args); }); syncBuiltinESMExports();
    t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
    assert.deepEqual(writeOutputFile({ media_types: [mediaType], max_bytes: CAP }, { output_file: { media_type: mediaType, data: generate() } }, outputs, randomUUID()), refused('write_failed'));
    assert.deepEqual(fs.readdirSync(outputs), []);
  });
  for (const thrown of [false, true]) test(`${ext} ${thrown ? 'thrown' : 'returned'} status loses its byte slot`, async (t) => {
    const s = await gateway(t); s.connector.impl.modules.media.render = async () => {
      const status = { status: 'vendor_error', reason: 'invented', output_file: { media_type: mediaType, data: generate() } };
      if (thrown) throw new StatusSignal(status); return status;
    };
    assert.deepEqual(await s.gw.execute({ action: ACTION }), { status: 'vendor_error', reason: 'invented' }); assert.equal(fs.existsSync(s.output), false);
  });
  test(`${ext} retention removes expired final/partial, keeps boundary and unsupported extension`, (t) => {
    const outputs = home(t); const now = Date.now(); const seven = 7 * 86400000;
    const paths = ['', '.partial', '.flac'].map((suffix) => join(outputs, randomUUID() + (suffix === '.flac' ? suffix : '.' + ext + suffix)));
    for (const path of paths) { fs.writeFileSync(path, 'old'); fs.utimesSync(path, new Date(now - seven - 10000), new Date(now - seven - 10000)); }
    const boundary = join(outputs, randomUUID() + '.' + ext); fs.writeFileSync(boundary, 'boundary');
    const cutoff = fs.statSync(boundary).mtimeMs + seven; cleanupOutputs(outputs, cutoff);
    for (const path of paths.slice(0, 2)) assert.equal(fs.existsSync(path), false);
    assert.ok(fs.existsSync(paths[2])); assert.ok(fs.existsSync(boundary));
  });
}

test('download permission is snapshotted and unavailable to later/plain calls or saved contexts', async (t) => {
  const net = transport(t); const s = await gateway(t); let saved;
  s.connector.impl.modules.media.render = async (_input, ctx) => {
    saved = ctx.downloadMedia;
    const act = s.connector.manifest.modules.media.actions.render;
    act.download_media.hosts.push('other.invented.test'); act.output_file.media_types.push('audio/mpeg'); act.output_file.max_bytes = 999;
    await assert.rejects(ctx.downloadMedia({ url: 'https://other.invented.test/', media_type: 'audio/wav' }), (e) => e.object.detail === 'host_refused');
    await assert.rejects(ctx.downloadMedia({ url: URL_VALUE, media_type: 'audio/mpeg' }), (e) => e.object.detail === 'media_type_refused');
    return {};
  };
  await s.gw.execute({ action: ACTION });
  await assert.rejects(saved({ url: URL_VALUE, media_type: 'audio/wav' }), (e) => e.object.detail === 'inactive');
  s.connector.impl.modules.media.plain = async (_i, ctx) => ({ permitted: typeof ctx.downloadMedia === 'function' });
  assert.deepEqual(await s.gw.execute({ action: 'media-fixture.media.plain' }), { permitted: false }); assert.equal(net.options.length, 0);
});

test('writer shares the initial declaration snapshot even if module mutates manifest', async (t) => {
  const s = await gateway(t); s.connector.impl.modules.media.render = async () => {
    s.connector.manifest.modules.media.actions.render.output_file.max_bytes = 999;
    return { output_file: { media_type: 'audio/wav', data: wav(53) } };
  };
  assert.deepEqual(await s.gw.execute({ action: ACTION }), refused('over_cap')); assert.equal(fs.existsSync(s.output), false);
});

test('direct contexts do not manufacture permission without a live local execution', () => {
  const options = { downloadMedia: { hosts: [HOST] }, outputFile: { media_types: ['audio/wav'], max_bytes: 4 } };
  for (const extra of [{}, { outputsDir: 'relative', executionSignal: new AbortController().signal }, { outputsDir: '/invented' }, { outputsDir: '/invented', executionSignal: new AbortController().signal, downloadMedia: { hosts: ['*.test'] } }]) {
    assert.equal(buildContext({ ...options, ...extra }).downloadMedia, undefined);
  }
});

for (const status of [401, 403]) test(`media HTTP ${status} never probes or changes provider grant`, async (t) => {
  transport(t, { status }); const s = await gateway(t); let probes = 0; const before = fs.readFileSync(s.store.file ?? join(s.home, 'connections.json'));
  s.fake.auth.status = async () => { probes++; return 'EXPIRED'; };
  s.connector.impl.modules.media.render = async (_i, ctx) => ctx.downloadMedia({ url: URL_VALUE, media_type: 'audio/wav' });
  assert.deepEqual(await s.gw.execute({ action: ACTION }), { status: 'vendor_error', reason: 'media_download_failed', detail: 'http_refused', http_status: status });
  assert.equal(probes, 0); assert.deepEqual(fs.readFileSync(join(s.home, 'connections.json')), before);
});

for (const [query, content] of [['v=1', '1'], ['X-Amz-SignedHeaders=host', 'host']]) {
  test(`short query ${query} permits ordinary bytes and result strings`, async (t) => {
    const data = Buffer.from(content);
    transport(t, { chunks: [data] });
    const s = await gateway(t);
    s.connector.impl.modules.media.render = async (_i, ctx) => ({
      voice: 'voice 1', duration: '1 second',
      output_file: { media_type: 'audio/wav', data: await ctx.downloadMedia({ url: `https://${HOST}/take.wav?${query}`, media_type: 'audio/wav' }) },
    });
    const answer = await s.gw.callTool('execute', { action: ACTION });
    assert.ok(answer.file, 'short query values must not refuse a good file');
    assert.deepEqual(fs.readFileSync(answer.file.path), data);
    assert.equal(answer.voice, 'voice 1', 'digit 1 in a result must be published');
    assert.equal(answer.duration, '1 second');
  });
}

test('API auth refusal still probes provider and can stop the grant', async (t) => {
  const s = await gateway(t); let probes = 0;
  s.fake.auth.status = async () => { probes++; return 'EXPIRED'; };
  s.fake.auth.proxy = async () => ({ status: 401, error: { code: 'vendor_error', endpoint: '/invented', method: 'GET' } });
  s.connector.impl.modules.media.render = async (_i, ctx) => ctx.proxy({ endpoint: '/invented' });
  assert.equal((await s.gw.execute({ action: ACTION })).status, 'needs_connect'); assert.equal(probes, 1);
});

for (const [name, options, expected] of [
  ['hosted', { hosted: true, active: false }, 'local_only'],
  ['missing grant', { active: false }, 'needs_connect'],
  ['confirmation', { extra: { confirmation: 'always' } }, 'needs_confirmation'],
]) test(`download ordering preserves ${name} stop`, async (t) => {
  const net = transport(t); const s = await gateway(t, options); let called = 0;
  s.connector.impl.modules.media.render = async () => { called++; return {}; };
  if (options.hosted) s.store.getConnection = () => assert.fail('hosted must not read the store');
  const answer = await s.gw.execute({ action: ACTION }); assert.equal(answer.status, expected); assert.equal(called, 0); assert.equal(net.options.length, 0);
  const serialized = JSON.stringify(answer) + fs.readFileSync(s.audit.file, 'utf8'); assert.equal(serialized.includes(SIGNATURE), false);
});

test('policy deny precedes local-only, input validation precedes confirmation', async (t) => {
  const net = transport(t); const s = await gateway(t, { hosted: true }); s.gw.role = 'readonly';
  assert.equal((await s.gw.execute({ action: ACTION })).status, 'denied');
  s.gw.outputsDir = s.output; s.gw.role = 'runtime'; s.connector.manifest.modules.media.actions.render.confirmation = 'always';
  assert.equal((await s.gw.execute({ action: ACTION, input: { unexpected: 'value' } })).status, 'invalid_arguments'); assert.equal(s.gw.pendingConfirmations.size, 0); assert.equal(net.options.length, 0);
});

for (const canary of [URL_VALUE, SIGNATURE, SIGNATURE.slice(4, 22), '?sig=' + SIGNATURE, '/private/take.wav']) {
  // Partial signatures are string-only windows. Whole needles still screen
  // file bytes; response-media-guard.test.js proves bytes do not use windows.
  const shapes = ['extra', 'headers', 'returned', 'thrown-status', 'error', 'cause', ...(canary === SIGNATURE.slice(4, 22) ? [] : ['bytes'])];
  for (const shape of shapes) test(`call-private canary ${[URL_VALUE, SIGNATURE, SIGNATURE.slice(4, 22), '?sig=' + SIGNATURE, '/private/take.wav'].indexOf(canary)} in ${shape} cannot escape or publish a file`, async (t) => {
    transport(t, { chunks: [wav()] }); const s = await gateway(t);
    s.connector.impl.modules.media.render = async (_i, ctx) => {
      const bytes = await ctx.downloadMedia({ url: URL_VALUE, media_type: 'audio/wav' }); ctx.audit({ note: canary });
      const slot = { media_type: 'audio/wav', data: bytes };
      if (shape === 'error') throw new Error(canary);
      if (shape === 'cause') throw new Error('ordinary failure', { cause: new Error(canary) });
      if (shape === 'returned') return { status: 'vendor_error', endpoint: canary, output_file: slot };
      if (shape === 'thrown-status') throw new StatusSignal({ status: 'vendor_error', extra: { private: canary }, output_file: slot });
      if (shape === 'headers') return { headers: { Location: canary }, output_file: slot };
      if (shape === 'bytes') return { output_file: { media_type: 'audio/wav', data: Buffer.from(canary) } };
      return { extra: { field: canary }, output_file: slot };
    };
    let result;
    try { result = await s.gw.callTool('execute', { action: ACTION }); } catch (err) { result = { error: sanitizeError(err) }; }
    assert.equal(fs.existsSync(s.output), false, 'leak was checked after file publication');
    const evidence = JSON.stringify({ jsonrpc: '2.0', id: 1, result }) + fs.readFileSync(s.audit.file, 'utf8');
    for (const secret of [URL_VALUE, SIGNATURE, canary]) assert.equal(evidence.includes(secret), false);
    if (shape !== 'error' && shape !== 'cause') assert.deepEqual(result, refused('private_address')); else assert.deepEqual(result, { error: 'internal error' });
  });
}

test('address is guarded even when invalid request is refused before DNS', async (t) => {
  const net = transport(t); const s = await gateway(t);
  s.connector.impl.modules.media.render = async (_i, ctx) => { try { await ctx.downloadMedia({ url: URL_VALUE, media_type: 'audio/wav', headers: {} }); } catch { return { extra: SIGNATURE }; } };
  assert.deepEqual(await s.gw.execute({ action: ACTION }), refused('private_address')); assert.equal(net.options.length, 0);
});

for (const [name, value] of [['null', null], ['array', []], ['empty', {}], ['unknown', { hosts: [HOST], timeout: 1 }], ['empty hosts', { hosts: [] }], ['string hosts', { hosts: HOST }], ['duplicate', { hosts: [HOST, HOST] }],
  ...['*.test', 'https://a.test', 'a.test:443', 'a.test/x', 'A.test', 'a.test.', 'localhost', '127.0.0.1', '0x7f000001', '::1', '', 'a..test'].map((h, i) => ['invalid host ' + i, { hosts: [h] }])]) {
  test(`manifest and --check reject download_media ${name}`, async (t) => {
    const root = home(t); const f = fixture(root, { download_media: value });
    await assert.rejects(loadConnector(f.dir), /download_media/);
    const run = spawnSync(process.execPath, [SERVER, '--check', '--connectors', root], { encoding: 'utf8' }); assert.notEqual(run.status, 0); assert.match(run.stderr + run.stdout, /download_media/);
  });
}

test('load and --check accept WAV/MP4 download; reject absent or invalid same-action output and response headers', async (t) => {
  const root = home(t); const f = fixture(root); await loadConnector(f.dir);
  let run = spawnSync(process.execPath, [SERVER, '--check', '--connectors', root], { encoding: 'utf8' }); assert.equal(run.status, 0, run.stderr);
  for (const change of [() => delete f.action.output_file, () => { f.action.output_file = { media_types: ['audio/wav'], max_bytes: 0 }; },
    () => { f.action.output_file = { media_types: ['audio/unknown'], max_bytes: 52 }; },
    () => { f.action.output_file = { media_types: ['video/mp4'], max_bytes: 52, path: '/invented' }; },
    () => { f.action.output_file = { media_types: ['audio/wav'], max_bytes: 52 }; f.action.response_headers = ['location']; }]) {
    change(); fs.writeFileSync(f.path, JSON.stringify(f.manifest)); await assert.rejects(loadConnector(f.dir), /output_file|download_media/);
  }
});

for (const outcome of ['success', 'returned-status', 'thrown-status', 'error', 'error-slice-15', 'error-slice-8', 'cause', 'tls-error']) test(`real stdio/RPC ${outcome} keeps canaries out of stdout, stderr and audit`, async (t) => {
  transport(t, { chunks: [wav()], ...(outcome === 'tls-error' ? { tlsError: true } : {}) });
  const s = await gateway(t);
  s.connector.impl.modules.media.render = async (_i, ctx) => {
    const data = await ctx.downloadMedia({ url: URL_VALUE, media_type: 'audio/wav' }); ctx.audit(SIGNATURE);
    if (outcome === 'returned-status') return { status: 'vendor_error', detail: SIGNATURE };
    if (outcome === 'thrown-status') throw new StatusSignal({ status: 'vendor_error', detail: URL_VALUE });
    if (outcome === 'error') throw new Error(SIGNATURE);
    if (outcome === 'error-slice-15') throw new Error(SIGNATURE.slice(4, 19));
    if (outcome === 'error-slice-8') throw new Error(SIGNATURE.slice(20, 28));
    if (outcome === 'cause') throw new Error('ordinary', { cause: new Error(SIGNATURE) });
    return { output_file: { media_type: 'audio/wav', data } };
  };
  const stdin = new PassThrough(); let output = ''; let errors = '';
  let received;
  const done = new Promise((resolve) => { received = resolve; });
  const stdout = new Writable({ write(chunk, _encoding, cb) { output += chunk; cb(); received(); } });
  const stderr = new Writable({ write(chunk, _encoding, cb) { errors += chunk; cb(); } });
  const reader = runStdio({ gateway: s.gw, version: 'test', stdin, stdout, stderr });
  stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'execute', arguments: { action: ACTION } } }) + '\n');
  await done; reader.close(); stdin.destroy(); stdout.end(); stderr.end();
  const rpc = JSON.parse(output); const answer = JSON.parse(rpc.result.content[0].text);
  assert.equal(rpc.id, 1); if (outcome === 'success') assert.ok(answer.file); else assert.equal(fs.existsSync(s.output), false);
  const evidence = JSON.stringify({ rpc, output, errors, audit: fs.readFileSync(s.audit.file, 'utf8') });
  for (const canary of [URL_VALUE, SIGNATURE, SIGNATURE.slice(4, 22), SIGNATURE.slice(4, 19), SIGNATURE.slice(20, 28)]) assert.equal(evidence.includes(canary), false, 'private signature slice escaped RPC or stderr');
  if (outcome.startsWith('error')) assert.deepEqual(answer, { error: 'internal error' });
});

test('large guarded file output scans bytes without a decoded copy or typed-array key enumeration', async (t) => {
  const bytes = wav(4 * 1024 * 1024); transport(t, { chunks: [bytes] });
  const s = await gateway(t); const action = s.connector.manifest.modules.media.actions.render; action.output_file.max_bytes = bytes.length;
  s.connector.impl.modules.media.render = async (_i, ctx) => ({ output_file: { media_type: 'audio/wav', data: await ctx.downloadMedia({ url: URL_VALUE, media_type: 'audio/wav' }) } });
  const ownKeys = Reflect.ownKeys; const toString = Buffer.prototype.toString;
  t.mock.method(Reflect, 'ownKeys', (value) => { assert.equal(value instanceof Uint8Array, false, 'enumerated a media buffer'); return ownKeys(value); });
  t.mock.method(Buffer.prototype, 'toString', function (...args) { assert.ok(this.length < 100000, 'decoded the media buffer'); return toString.apply(this, args); });
  const answer = await s.gw.execute({ action: ACTION }); assert.equal(answer.file.bytes, bytes.length);
  assert.equal(answer.file.sha256, createHash('sha256').update(bytes).digest('hex'));
});
