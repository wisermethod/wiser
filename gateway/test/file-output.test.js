import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { join, basename, dirname, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ConnectionGateway } from '../src/gateway.js';
import { cleanupOutputs } from '../src/file-output.js';
import { isStatusObject } from '../src/errors.js';
import { loadConnector } from '../src/manifest.js';
import { createTestGateway, createFakeProviders, makeHome, putActive } from './fake-provider.js';

const FIXTURE = fileURLToPath(new URL('./file-output-fixture', import.meta.url));
const SERVER = fileURLToPath(new URL('../server.js', import.meta.url));
const ACTION = 'file-output-fixture.audio.render';
const AUDIO = Buffer.from([0, 255, 19, 128, 67, 4, 0, 233, 71, 55, 182, 91, 33, 42, 17, 5]);
const OLD = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
const refusal = (detail, extra = {}) => ({ status: 'vendor_error', reason: 'output_refused', detail, ...extra });

async function setup(t, options = {}) {
  const home = makeHome();
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const outputsDir = join(home, 'outputs');
  const fake = createFakeProviders();
  const calls = { proxy: 0, execute: 0, listAccounts: 0 };
  fake.auth.proxy = async () => {
    calls.proxy += 1;
    return { status: 200, data: { audio: AUDIO.toString('base64'), timings: [{ start: 0, end: 1 }], ...options.envelope } };
  };
  fake.auth.listAccounts = async () => { calls.listAccounts += 1; return []; };
  fake.catalog.execute = async () => { calls.execute += 1; throw new Error('unexpected catalog call'); };
  const connector = await loadConnector(FIXTURE);
  if (options.confirmation) connector.manifest.modules.audio.actions.render.confirmation = options.confirmation;
  const state = await createTestGateway({
    home, fake, connectors: [connector], session: false,
    ...(options.armed === false ? {} : { outputsDir }),
    ...options.gateway,
  });
  if (options.active !== false) await putActive(state.store, fake, { service: 'file-output-fixture', module: 'audio' });
  return { ...state, outputsDir, calls };
}

function patchFs(t, method, replacement) {
  t.mock.method(fs, method, replacement);
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
}

for (const [detail, envelope] of [
  ['over_cap', { audio: Buffer.alloc(65, 23).toString('base64') }],
  ['undeclared_type', { media_type: 'audio/unknown' }],
  ['not_bytes', { not_bytes: true }],
  ['empty', { audio: '' }],
]) {
  test(`file output ${detail} is refused before any output disk access`, async (t) => {
    const state = await setup(t, { envelope });
    const lstat = fs.lstatSync;
    patchFs(t, 'lstatSync', (path, ...args) => {
      assert.notEqual(path, state.outputsDir, 'invalid slot touched the output directory');
      return lstat(path, ...args);
    });
    assert.deepEqual(await state.gw.execute({ action: ACTION }), refusal(detail));
    assert.equal(fs.existsSync(state.outputsDir), false);
    assert.deepEqual(fs.readdirSync(state.home).sort(), ['audit.jsonl', 'connections.json']);
  });
}

test('decoded proxy envelope reaches disk exactly, with metadata and the audit cid only', async (t) => {
  const state = await setup(t);
  const opened = [];
  const open = fs.openSync;
  const sync = fs.fsyncSync;
  const close = fs.closeSync;
  const rename = fs.renameSync;
  const events = [];
  let outputFd;
  patchFs(t, 'openSync', (path, flags, mode) => {
    const fd = open(path, flags, mode);
    if (dirname(path) === state.outputsDir && typeof flags === 'number') {
      opened.push({ path, flags, mode });
      outputFd = fd;
    }
    return fd;
  });
  patchFs(t, 'fsyncSync', (fd) => { if (fd === outputFd) events.push('fsync'); return sync(fd); });
  patchFs(t, 'closeSync', (fd) => {
    if (fd === outputFd) { events.push('close'); outputFd = undefined; }
    return close(fd);
  });
  patchFs(t, 'renameSync', (from, to) => { events.push('rename'); return rename(from, to); });
  const result = await state.gw.execute({ action: ACTION });
  const rawAudit = fs.readFileSync(state.audit.file, 'utf8');
  const line = JSON.parse(rawAudit.trim());
  const expected = Buffer.from(AUDIO.toString('base64'), 'base64');
  assert.deepEqual(fs.readFileSync(result.file.path), expected);
  assert.deepEqual(result, {
    timings: [{ start: 0, end: 1 }],
    file: {
      path: join(state.outputsDir, `${line.cid}.mp3`), bytes: expected.length,
      sha256: createHash('sha256').update(fs.readFileSync(result.file.path)).digest('hex'), media_type: 'audio/mpeg',
    },
  });
  assert.ok(isAbsolute(result.file.path));
  assert.equal(fs.lstatSync(state.outputsDir).mode & 0o777, 0o700);
  assert.equal(fs.lstatSync(result.file.path).mode & 0o777, 0o600);
  assert.deepEqual(opened, [{
    path: `${result.file.path}.partial`, mode: 0o600,
    flags: fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW,
  }]);
  assert.deepEqual(events, ['fsync', 'close', 'rename']);
  assert.equal(line.status, 'ok');
  assert.deepEqual(Object.keys(line).sort(), [
    'ts', 'harness', 'role', 'op', 'action', 'service', 'module', 'label', 'grant_id', 'privilege',
    'path', 'provider_account_id', 'status', 'model', 'calibrated_model_version', 'ms', 'cid',
  ].sort());
  const serialized = JSON.stringify(result) + rawAudit;
  for (const forbidden of [AUDIO.toString('base64'), AUDIO.toString('hex'), JSON.stringify([...AUDIO]), 'output_file']) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
  const second = await state.gw.execute({ action: ACTION });
  assert.notEqual(second.file.path, result.file.path);
  assert.deepEqual(fs.readFileSync(result.file.path), expected);
  assert.deepEqual(fs.readdirSync(state.outputsDir).sort(), [basename(result.file.path), basename(second.file.path)].sort());
  assert.equal(state.calls.proxy, 2);
});

test('Uint8Array view writes only its own bytes and tightens an existing directory mode', async (t) => {
  const state = await setup(t, { envelope: { uint8: true } });
  fs.mkdirSync(state.outputsDir, { mode: 0o755 });
  fs.chmodSync(state.outputsDir, 0o755);
  const result = await state.gw.execute({ action: ACTION });
  assert.deepEqual(fs.readFileSync(result.file.path), AUDIO);
  assert.equal(fs.statSync(state.outputsDir).mode & 0o777, 0o700);
});

test('a restrictive umask still yields directory 0700 and file 0600', async (t) => {
  const state = await setup(t);
  const previous = process.umask(0o777);
  let result;
  try { result = await state.gw.execute({ action: ACTION }); } finally { process.umask(previous); }
  assert.equal(fs.statSync(state.outputsDir).mode & 0o777, 0o700);
  assert.equal(fs.statSync(result.file.path).mode & 0o777, 0o600);
});

test('a slot exactly at its declared cap is accepted', async (t) => {
  const data = Buffer.alloc(64, 39);
  const state = await setup(t, { envelope: { audio: data.toString('base64') } });
  const result = await state.gw.execute({ action: ACTION });
  assert.equal(result.file.bytes, 64);
  assert.deepEqual(fs.readFileSync(result.file.path), data);
});

for (const envelope of [{ omit_slot: true }, { status: 'needs_connect' }]) {
  test(`file output ${envelope.status || 'without a slot'} passes through without a directory`, async (t) => {
    const state = await setup(t, { envelope });
    const result = await state.gw.execute({ action: ACTION });
    assert.deepEqual(result, envelope.status ? { status: 'needs_connect', action: ACTION } : { timings: [{ start: 0, end: 1 }] });
    assert.equal(fs.existsSync(state.outputsDir), false);
  });
}

for (const kind of ['directory-link', 'directory-file', 'entry-link', 'entry-hardlink', 'entry-directory']) {
  test(`file output refuses ${kind} and leaves its target untouched`, async (t) => {
    const state = await setup(t);
    const outside = join(state.home, 'outside');
    fs.mkdirSync(outside);
    const target = join(outside, 'keep');
    fs.writeFileSync(target, 'invented sentinel');
    let entry = 'obstruction';
    if (kind === 'directory-link') {
      fs.symlinkSync(outside, state.outputsDir);
      entry = 'outputs';
    } else if (kind === 'directory-file') {
      fs.writeFileSync(state.outputsDir, 'invented sentinel');
      entry = 'outputs';
    } else {
      fs.mkdirSync(state.outputsDir);
      const obstruction = join(state.outputsDir, entry);
      if (kind === 'entry-link') fs.symlinkSync(target, obstruction);
      if (kind === 'entry-hardlink') fs.linkSync(target, obstruction);
      if (kind === 'entry-directory') fs.mkdirSync(obstruction);
    }
    assert.deepEqual(await state.gw.execute({ action: ACTION }), refusal('outputs_not_clean', { entry }));
    assert.equal(fs.readFileSync(target, 'utf8'), 'invented sentinel');
    assert.deepEqual(fs.readdirSync(outside), ['keep']);
    if (kind.startsWith('entry')) assert.deepEqual(fs.readdirSync(state.outputsDir), [entry]);
  });
}

function oldFile(dir, name, contents = 'invented old file') {
  const path = join(dir, name);
  fs.writeFileSync(path, contents);
  fs.utimesSync(path, OLD, OLD);
  return path;
}

test('cleanup unlinks only expired matching single-link files and never leaves outputs', (t) => {
  const home = makeHome();
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const outputs = join(home, 'outputs');
  fs.mkdirSync(outputs);
  const old = oldFile(outputs, `${randomUUID()}.mp3`);
  const partial = oldFile(outputs, `${randomUUID()}.mp3.partial`);
  const added = ['wav', 'mp4'].flatMap((ext) => ['', '.partial'].map((suffix) => oldFile(outputs, `${randomUUID()}.${ext}${suffix}`)));
  const keep = [];
  for (const name of ['unmatched.mp3', `${randomUUID()}.flac`, `${randomUUID()}.mp3.extra`, `prefix-${randomUUID()}.mp3`]) keep.push(oldFile(outputs, name));
  const recent = join(outputs, `${randomUUID()}.mp3`);
  fs.writeFileSync(recent, 'new');
  keep.push(recent);
  const outside = oldFile(home, `${randomUUID()}.mp3`);
  const link = join(outputs, `${randomUUID()}.mp3`);
  fs.symlinkSync(outside, link);
  fs.lutimesSync(link, OLD, OLD);
  keep.push(link);
  const hardlink = join(outputs, `${randomUUID()}.mp3`);
  fs.linkSync(outside, hardlink);
  keep.push(hardlink);
  const directory = join(outputs, `${randomUUID()}.mp3`);
  fs.mkdirSync(directory);
  fs.utimesSync(directory, OLD, OLD);
  keep.push(directory);
  const outsideFiles = ['connections.json', 'audit.jsonl', 'classifier-status', 'classifier-sessions'].map((name) => {
    if (name.includes('.')) return oldFile(home, name);
    const dir = join(home, name);
    fs.mkdirSync(dir);
    return oldFile(dir, `${randomUUID()}.mp3`);
  });
  cleanupOutputs(outputs);
  assert.equal(fs.existsSync(old), false);
  assert.equal(fs.existsSync(partial), false);
  for (const path of added) assert.equal(fs.existsSync(path), false);
  for (const path of [...keep, outside, ...outsideFiles]) assert.ok(fs.lstatSync(path), path);
  assert.equal(fs.readFileSync(outside, 'utf8'), 'invented old file');
});

test('cleanup before a write removes old files but preserves every outside sentinel', async (t) => {
  const state = await setup(t);
  fs.mkdirSync(state.outputsDir);
  const old = oldFile(state.outputsDir, `${randomUUID()}.mp3`);
  const partial = oldFile(state.outputsDir, `${randomUUID()}.mp3.partial`);
  const keep = oldFile(state.home, 'keep');
  const storeBefore = fs.readFileSync(join(state.home, 'connections.json'));
  const result = await state.gw.execute({ action: ACTION });
  assert.ok(result.file);
  assert.equal(fs.existsSync(old), false);
  assert.equal(fs.existsSync(partial), false);
  assert.equal(fs.readFileSync(keep, 'utf8'), 'invented old file');
  assert.deepEqual(fs.readFileSync(join(state.home, 'connections.json')), storeBefore);
});

test('a cleanup unlink failure leaves that file and does not stop a write', async (t) => {
  const state = await setup(t);
  fs.mkdirSync(state.outputsDir);
  const old = oldFile(state.outputsDir, `${randomUUID()}.mp3`);
  const other = oldFile(state.outputsDir, `${randomUUID()}.mp3.partial`);
  const unlink = fs.unlinkSync;
  patchFs(t, 'unlinkSync', (path) => { if (path === old) throw new Error('invented unlink failure'); return unlink(path); });
  assert.ok((await state.gw.execute({ action: ACTION })).file);
  assert.ok(fs.existsSync(old));
  assert.equal(fs.existsSync(other), false);
});

test('cleanup keeps a file exactly seven days old and removes an older file', (t) => {
  const home = makeHome();
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  const boundary = oldFile(home, `${randomUUID()}.mp3`);
  const older = oldFile(home, `${randomUUID()}.mp3`);
  // Use the filesystem's actual timestamp, including its precision, at the boundary.
  const now = fs.lstatSync(boundary).mtimeMs + sevenDays;
  fs.utimesSync(older, new Date(OLD.getTime() - 1000), new Date(OLD.getTime() - 1000));
  cleanupOutputs(home, now);
  assert.ok(fs.existsSync(boundary));
  assert.equal(fs.existsSync(older), false);
});

test('hosted constructor options with a home but no outputsDir withhold before store or provider access', async (t) => {
  const state = await setup(t, { armed: false, active: false, confirmation: 'always' });
  const gw = new ConnectionGateway({
    home: state.home, role: 'runtime', harness: 'hosted-fixture',
    store: { getConnection() { assert.fail('local_only must precede the store read'); } },
    policy: state.policy, audit: state.audit,
    authProvider: state.fake.auth, catalogProvider: state.fake.catalog,
    authConfigured: true, connectors: state.connectors,
    confirmedOnce: new Set(), pendingConfirmations: new Map(),
  });
  assert.deepEqual(await gw.execute({ action: ACTION, input: { invalid: true }, confirm: true }), {
    status: 'local_only', action: ACTION,
    reason: 'This action writes a file on your own computer, which only the local gateway can do.',
  });
  assert.ok(isStatusObject({ status: 'local_only' }));
  assert.equal(JSON.parse(fs.readFileSync(state.audit.file, 'utf8')).status, 'local_only');
  assert.deepEqual(state.calls, { proxy: 0, execute: 0, listAccounts: 0 });
  assert.deepEqual(fs.readdirSync(state.home), ['audit.jsonl']);
  assert.equal(gw.pendingConfirmations.size, 0);
});

test('an unarmed file output action still respects the policy deny first', async (t) => {
  const state = await setup(t, { armed: false, active: false, gateway: { role: 'readonly' } });
  assert.equal((await state.gw.execute({ action: ACTION })).status, 'denied');
  assert.deepEqual(state.calls, { proxy: 0, execute: 0, listAccounts: 0 });
});

test('outputsDir must be explicitly absolute, and null remains unarmed', () => {
  for (const outputsDir of ['', 'relative', 7, true, {}]) {
    assert.throws(() => new ConnectionGateway({ home: '/invented', outputsDir }), /outputsDir must be an absolute path/);
  }
  assert.equal(new ConnectionGateway({ home: '/invented', outputsDir: null }).outputsDir, null);
  assert.equal(new ConnectionGateway({ home: '/invented' }).outputsDir, null);
});

test('describe_action publishes the output declaration and the local write explanation', async (t) => {
  const { gw } = await setup(t, { armed: false });
  const result = await gw.callTool('describe_action', { action: ACTION });
  assert.deepEqual(result.output_file, { media_types: ['audio/mpeg'], max_bytes: 64 });
  assert.equal(result.local_only, true);
  assert.match(result.description, /writes a file into the gateway's outputs\/ directory/);
  assert.match(result.description, /runs on the local gateway only/);
});

for (const stage of ['write', 'fsync', 'close', 'rename']) {
  test(`a ${stage} failure removes the partial file and returns no bytes`, async (t) => {
    const state = await setup(t);
    const method = { write: 'writeSync', fsync: 'fsyncSync', close: 'closeSync', rename: 'renameSync' }[stage];
    const original = fs[method];
    let injected = false;
    patchFs(t, method, (...args) => {
      if (!injected) {
        injected = true;
        if (stage === 'write') original(args[0], args[1], 0, 3);
        throw new Error('invented partial failure');
      }
      return original(...args);
    });
    assert.deepEqual(await state.gw.execute({ action: ACTION }), refusal('write_failed'));
    assert.equal(injected, true);
    assert.deepEqual(fs.readdirSync(state.outputsDir), []);
    assert.equal(fs.readFileSync(state.audit.file, 'utf8').includes('output_file'), false);
  });
}

test('short writes are completed before fsync and rename', async (t) => {
  const state = await setup(t);
  const write = fs.writeSync;
  let writes = 0;
  patchFs(t, 'writeSync', (fd, data, offset, length) => {
    writes += 1;
    return write(fd, data, offset, Math.min(length, 3));
  });
  const result = await state.gw.execute({ action: ACTION });
  assert.ok(writes > 1);
  assert.deepEqual(fs.readFileSync(result.file.path), AUDIO);
});

for (const suffix of ['', '.partial']) {
  test(`an existing ${suffix || 'final'} name is never overwritten or unlinked`, async (t) => {
    const state = await setup(t);
    fs.mkdirSync(state.outputsDir);
    const cid = randomUUID();
    const originalAudit = state.gw.withAudit.bind(state.gw);
    state.gw.withAudit = (op, fields, fn) => originalAudit(op, { ...fields, cid }, fn);
    const existing = join(state.outputsDir, `${cid}.mp3${suffix}`);
    fs.writeFileSync(existing, 'invented previous output');
    assert.deepEqual(await state.gw.execute({ action: ACTION }), refusal('write_failed'));
    assert.equal(fs.readFileSync(existing, 'utf8'), 'invented previous output');
    assert.deepEqual(fs.readdirSync(state.outputsDir), [basename(existing)]);
  });
}

test('stdio arms outputs and cleans at start; route and call are unarmed; check constructs no gateway', (t) => {
  const root = makeHome();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  // Instrument only the constructor boundary in a child process, so the flags
  // exercise server.js itself without any provider call or real credential.
  const loader = join(root, 'constructor-loader.mjs');
  const gatewayUrl = new URL('../src/gateway.js', import.meta.url).href;
  fs.writeFileSync(loader, `export async function load(url, context, next) {
    const loaded = await next(url, context);
    if (url !== ${JSON.stringify(gatewayUrl)}) return loaded;
    return { ...loaded, source: String(loaded.source).replace('constructor(opts) {',
      'constructor(opts) { process.stderr.write(JSON.stringify({fileOutputConstruction: true, outputsDir: opts.outputsDir ?? null}) + "\\\\n");') };
  }\n`);
  fs.mkdirSync(join(root, 'credentials'));
  const envFile = join(root, 'credentials', 'fixture');
  fs.writeFileSync(envFile, 'WISER_AUTH_PROVIDER_KEY=\nWISER_USER_ID=\nWISER_CLASSIFIER_KEY=\n');
  for (const mode of ['--check', '--route', '--call', 'stdio']) {
    const home = join(root, mode.replace('--', ''));
    const outputs = join(home, 'outputs');
    fs.mkdirSync(outputs, { recursive: true });
    const old = oldFile(outputs, `${randomUUID()}.mp3`);
    const flags = mode === 'stdio' ? [] : mode === '--check' ? ['--check']
      : mode === '--route' ? ['--route', '--input', '{"rows":[],"ask":"invented"}']
        : ['--call', 'wiser.route.ask', '--input', '{"ask":"invented"}'];
    const run = spawnSync(process.execPath, [
      '--experimental-loader', pathToFileURL(loader).href, SERVER,
      '--env', envFile, '--home', home, '--provider', 'local-file', ...flags,
    ], {
      encoding: 'utf8', timeout: 10000,
      input: mode === 'stdio' ? '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n' : undefined,
    });
    assert.equal(run.status, 0, run.stderr);
    const constructions = run.stderr.split('\n').filter((line) => line.startsWith('{"fileOutputConstruction"')).map((line) => JSON.parse(line));
    assert.deepEqual(constructions, mode === '--check' ? [] : [{ fileOutputConstruction: true, outputsDir: mode === 'stdio' ? fs.realpathSync(outputs) : null }]);
    assert.equal(fs.existsSync(old), mode !== 'stdio', `${mode} startup cleanup`);
  }
});
