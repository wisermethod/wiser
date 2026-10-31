import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConnectionGateway, confirmationDigest, PENDING_CONFIRMATION_MAX, PENDING_CONFIRMATION_TTL_MS, matchStandingApproval } from '../src/gateway.js';
import { loadConnector } from '../src/manifest.js';
import { buildContext } from '../src/context.js';
import { defaultProviderEnvPath } from '../src/paths.js';
import { containsUnsafeCodePoint, renderValue } from '../src/disclosure.js';
import { createTestGateway, putActive } from './fake-provider.js';
import { observations } from './file-input-fixture/index.js';

const FIXTURE = fileURLToPath(new URL('./file-input-fixture', import.meta.url));
const SERVER = fileURLToPath(new URL('../server.js', import.meta.url));
const ACTION = 'file-input-fixture.mail.create_draft';
const SEND = 'file-input-fixture.mail.send_message';
const NOW = Date.parse('2026-10-30T12:00:00Z');
const MARKER = 'invented-private-attachment-content';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const allow = { roles: ['runtime'], default_role: 'runtime', rules: [{ role: '*', effect: 'allow' }] };

async function fixture(t, options = {}) {
  const root = fs.mkdtempSync(join(fs.realpathSync(tmpdir()), 'wiser-input-gateway-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (name, data = MARKER) => {
    const path = join(root, name);
    fs.mkdirSync(dirname(path), { recursive: true });
    fs.writeFileSync(path, data);
    return path;
  };
  const home = join(root, 'gateway');
  fs.mkdirSync(home);
  const access = { enabled: true, envPath: write('config/invented-config', ''),
    secretFiles: { sample: write('credentials/invented-key', '') }, secretsDir: join(root, 'secrets') };
  fs.mkdirSync(access.secretsDir);
  const connector = await loadConnector(FIXTURE);
  // Loading imports the module once; each gateway owns its manifest snapshot.
  connector.manifest = structuredClone(connector.manifest);
  let now = NOW;
  const f = await createTestGateway({ home, connectors: [connector], session: false, policy: options.policy ?? allow,
    ...(options.armed === false ? {} : { inputFileAccess: access }), now: () => now,
    ...options.gateway });
  const calls = { proxy: 0, catalog: 0, hydration: 0 };
  f.fake.auth.proxy = async () => { calls.proxy += 1; return { status: 200, data: { ok: true } }; };
  f.fake.catalog.execute = async () => { calls.catalog += 1; throw new Error('unexpected catalog'); };
  f.fake.auth.listAccounts = async () => { calls.hydration += 1; return []; };
  const active = options.active === false ? null : await putActive(f.store, f.fake, { service: 'file-input-fixture', module: 'mail' });
  observations.length = 0;
  return { ...f, root, write, access, calls, active, actions: connector.manifest.modules.mail.actions,
    tick: (delta) => { now += delta; }, run: (input, extra = {}) => f.gw.execute({ action: ACTION, input, ...extra }) };
}

function patchFs(t, method, replacement) {
  t.mock.method(fs, method, replacement);
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
}
function noFileWork(t, auditFile) {
  for (const name of ['lstatSync', 'statSync', 'realpathSync', 'accessSync', 'openSync', 'readSync', 'readFileSync']) {
    const original = fs[name];
    patchFs(t, name, (...args) => {
      if (name === 'lstatSync' && [auditFile, dirname(auditFile)].includes(args[0])) return original(...args);
      assert.fail(`unexpected ${name}`);
    });
  }
}
function pending(gw) { return [...gw.pendingConfirmations.keys()]; }
function bytesAbsent(value, bytes = Buffer.from(MARKER)) {
  const text = JSON.stringify(value);
  for (const marker of [bytes.toString(), bytes.toString('base64'), sha(bytes)]) assert.equal(text.includes(marker), false);
}

for (const armed of [false, true]) {
  for (const input of [null, 'invented input', []]) {
    test(`F09 non-object input ${JSON.stringify(input)} is validated with access ${armed}`, async (t) => {
      const f = await fixture(t, { armed });
      // Isolate input-file work from the existing connection-store read.
      t.mock.method(f.store, 'getConnection', () => f.active);
      noFileWork(t, f.audit.file);
      assert.deepEqual(await f.run(input), { status: 'invalid_arguments', field: 'input' });
      assert.deepEqual(f.calls, { proxy: 0, catalog: 0, hydration: 0 });
      assert.equal(observations.length, 0);
    });
  }
}
for (const value of ['file', [], null, {}, 3]) {
  test(`F09 owning the field without permission refuses before hydration: ${JSON.stringify(value)}`, async (t) => {
    const f = await fixture(t, { armed: false, active: false });
    const path = f.write('files/exists.txt');
    f.gw.outputsDir = join(f.home, 'outputs');
    t.mock.method(f.store, 'getConnection', () => assert.fail('connection lookup before local_only'));
    noFileWork(t, f.audit.file);
    assert.equal((await f.run({ attachments: value === 'file' ? [path] : value })).status, 'local_only');
    assert.deepEqual(f.calls, { proxy: 0, catalog: 0, hydration: 0 });
    assert.equal(observations.length, 0);
  });
}
test('F09 policy denial wins over local_only and all file work', async (t) => {
  const f = await fixture(t, { armed: false, active: false,
    policy: { ...allow, rules: [{ role: '*', effect: 'deny' }] } });
  noFileWork(t, f.audit.file);
  assert.equal((await f.run({ attachments: [] })).status, 'denied');
  assert.deepEqual(f.calls, { proxy: 0, catalog: 0, hydration: 0 });
});
for (const armed of [false, true]) {
  for (const action of [ACTION, SEND]) {
    test(`F09 omission keeps the original key and normal flow: ${armed} ${action}`, async (t) => {
      const f = await fixture(t, { armed });
      const input = { subject: 'Project Cedar' };
      const key = confirmationDigest(['execute', action, input, f.active.provider_account_id]);
      const stop = await f.run(input, { action });
      assert.equal(stop.status, 'needs_confirmation');
      assert.deepEqual(pending(f.gw), [key]);
      assert.equal(Object.hasOwn(stop, 'attachment_files'), false);
      assert.equal((await f.run(input, { action, confirm: true })).ok, true);
      assert.deepEqual(observations[0].files, []);
      assert.equal(f.calls.proxy, 1);
      assert.equal(f.calls.catalog, 0);
    });
  }
}
test('F09 constructor copies permission paths privately and validates explicit opt-in', async (t) => {
  const f = await fixture(t);
  assert.equal(Object.hasOwn(f.gw, 'inputFileAccess'), false);
  f.access.secretFiles.sample = f.write('files/changed-binding');
  const protectedPath = f.write('credentials/sibling');
  assert.equal((await f.run({ attachments: [protectedPath] })).reason, 'input_file_refused');
  for (const inputFileAccess of [false, {}, { enabled: false }, { enabled: true, envPath: 'relative' },
    { enabled: true, envPath: f.access.envPath, secretFiles: { sample: 'relative' } },
    { enabled: true, envPath: f.access.envPath, secretsDir: 'relative' }]) {
    assert.throws(() => new ConnectionGateway({ home: f.home, inputFileAccess }), /inputFileAccess/);
  }
});
test('F09 describe_action publishes per-input locality, cap and conservative link refusal', async (t) => {
  const f = await fixture(t, { armed: false });
  const description = f.gw.describeAction(ACTION);
  assert.deepEqual(description.input_files, { field: 'attachments', max_bytes: 2097152 });
  assert.equal(Object.hasOwn(description, 'local_only'), false);
  assert.match(description.description, /Calls naming attachments run only on local stdio/);
  assert.match(description.description, /2097152/);
  assert.match(description.description, /multiply linked/);
  assert.match(description.description, /real path/);
});

test('F02 exact private records in order, no context I/O, copies and expiry', async (t) => {
  const f = await fixture(t);
  const data = Buffer.from([0, 255, 19, 128, 4, 0]);
  const paths = [f.write('files/report.PDF', data), f.write('files/unknown.xyz', Buffer.alloc(0))];
  const input = { attachments: [paths[0], paths[1], paths[0]] };
  await f.run(input);
  let opens = 0;
  const open = fs.openSync;
  patchFs(t, 'openSync', (...args) => { opens += 1; return open(...args); });
  const result = await f.run(input, { confirm: true });
  assert.deepEqual(result, { ok: true, count: 3 });
  assert.equal(opens, 3);
  const { ctx, files } = observations[0];
  assert.deepEqual(files, [
    { data, name: 'report.PDF', media_type: 'application/pdf', size: data.length, sha256: sha(data) },
    { data: Buffer.alloc(0), name: 'unknown.xyz', media_type: 'application/octet-stream', size: 0, sha256: sha(Buffer.alloc(0)) },
    { data, name: 'report.PDF', media_type: 'application/pdf', size: data.length, sha256: sha(data) },
  ]);
  assert.throws(() => ctx.inputFiles('attachments'), (err) => err.object.reason === 'input_file_refused');
  assert.equal(opens, 3);
  assert.equal(f.calls.proxy, 1);
  assert.equal(f.calls.catalog, 0);
});
test('F02 inputFiles returns independent byte copies and fails closed without preparation', async (t) => {
  const f = await fixture(t);
  const path = f.write('files/copies.txt');
  await f.run({ attachments: [path] });
  f.fake.auth.proxy = async () => {
    const { ctx, files } = observations[0];
    files[0].data.fill(0);
    files[0].name = 'changed';
    noFileWork(t, f.audit.file);
    assert.equal(ctx.inputFiles('attachments')[0].data.toString(), MARKER);
    assert.equal(ctx.inputFiles('attachments')[0].name, 'copies.txt');
    assert.throws(() => ctx.inputFiles('wrong'), (err) => err.object.reason === 'input_file_refused');
    return { status: 200, data: {} };
  };
  assert.equal((await f.run({ attachments: [path] }, { confirm: true })).ok, true);
  for (const opts of [{}, { inputFileDeclaration: { field: 'attachments' } }, { preparedInputFiles: [] }]) {
    const ctx = buildContext({ input: {}, auth: {}, executionSignal: new AbortController().signal, ...opts });
    assert.throws(() => ctx.inputFiles('attachments'), (err) => err.object.reason === 'input_file_refused');
  }
});

test('F07 all attachment display metadata is escaped and budgeted, with no content in stop/audit/result', async (t) => {
  const f = await fixture(t);
  const longDir = 'a'.repeat(100);
  const names = ['quote"line\n.txt', 'Unicode\u202e-😀.pdf', `${'n'.repeat(150)}.txt`,
    ...Array.from({ length: 7 }, (_, i) => `report-${i}.pdf`)];
  const paths = names.map((name) => f.write(`files/${longDir}/${name}`));
  const stop = await f.run({ attachments: paths, subject: 's'.repeat(20000) });
  assert.equal(stop.status, 'needs_confirmation');
  assert.equal(stop.attachment_files.length, 10);
  assert.ok(stop.summary.length <= 2000);
  assert.match(stop.summary, /attachment_files/);
  assert.ok(stop.input_values.some((entry) => entry.name === 'attachments'));
  for (let i = 0; i < paths.length; i += 1) {
    const file = stop.attachment_files[i];
    for (const [key, raw] of [['name', names[i]], ['path', paths[i]]]) {
      const rendered = renderValue(raw);
      assert.equal(file[key].value, rendered.text);
      assert.equal(file[key].truncated, rendered.truncated);
      assert.equal(file[key].full, rendered.full);
    }
    assert.equal(file.size, Buffer.byteLength(MARKER));
    assert.equal(Number.isInteger(file.size), true);
  }
  assert.equal(containsUnsafeCodePoint(JSON.stringify(stop)), false);
  assert.equal(containsUnsafeCodePoint(stop.summary), false);
  bytesAbsent(stop);
  bytesAbsent(fs.readFileSync(f.audit.file, 'utf8'));
  const result = await f.run({ attachments: paths, subject: 's'.repeat(20000) }, { confirm: true });
  assert.equal(result.ok, true);
  bytesAbsent(result);
  const audit = fs.readFileSync(f.audit.file, 'utf8');
  bytesAbsent(audit);
  assert.equal(audit.includes('invented-private-audit-note'), false);
  assert.equal(audit.includes(paths[0]), false);
});

for (const mutation of ['byte', 'size', 'inode', 'delete', 'rename', 'extension', 'link', 'unreadable']) {
  test(`F08 pending snapshot refuses ${mutation} and consumes its old digest`, async (t) => {
    const f = await fixture(t);
    const path = f.write('files/report.txt');
    const input = { attachments: [path] };
    await f.run(input);
    const [old] = pending(f.gw);
    if (mutation === 'byte') fs.writeFileSync(path, 'X' + MARKER.slice(1));
    if (mutation === 'size') fs.writeFileSync(path, MARKER + 'x');
    if (mutation === 'inode') { fs.renameSync(path, path + '.previous'); fs.writeFileSync(path, MARKER); }
    if (mutation === 'delete') fs.unlinkSync(path);
    if (mutation === 'rename' || mutation === 'extension') fs.renameSync(path, path + (mutation === 'extension' ? '.pdf' : '.renamed'));
    if (mutation === 'link') { fs.renameSync(path, path + '.previous'); fs.symlinkSync(path + '.previous', path); }
    if (mutation === 'unreadable') { fs.chmodSync(path, 0); t.after(() => { if (fs.existsSync(path)) fs.chmodSync(path, 0o600); }); }
    const result = await f.run(input, { confirm: true });
    assert.equal(result.status, 'invalid_arguments');
    assert.ok(['input_file_changed', 'input_file_refused', 'input_file_unreadable'].includes(result.reason));
    if (['byte', 'size', 'inode'].includes(mutation)) assert.equal(result.reason, 'input_file_changed');
    assert.equal(f.gw.pendingConfirmations.has(old), false);
    assert.equal(observations.length, 0);
    assert.deepEqual(f.calls, { proxy: 0, catalog: 0, hydration: 0 });
  });
}
test('F08 two stops replace the sole record, and restoring first bytes cannot use it', async (t) => {
  const f = await fixture(t);
  const path = f.write('files/one-slot.txt');
  const input = { attachments: [path] };
  await f.run(input);
  const [first] = pending(f.gw);
  fs.writeFileSync(path, 'X' + MARKER.slice(1));
  await f.run(input);
  const [second] = pending(f.gw);
  assert.notEqual(first, second);
  assert.equal(f.gw.pendingConfirmations.size, 1);
  assert.equal(f.gw.pendingConfirmations.has(first), false);
  fs.writeFileSync(path, MARKER);
  assert.equal((await f.run(input, { confirm: true })).reason, 'input_file_changed');
  assert.equal(f.gw.pendingConfirmations.size, 0);
  assert.equal(f.calls.proxy, 0);
  assert.equal(observations.length, 0);
});
for (const loss of ['expiry', 'restart', 'eviction', 'consumed']) {
  test(`F08 ${loss} requires a fresh stop, with no reuse of an old approval`, async (t) => {
    let f = await fixture(t);
    const path = f.write('files/approval.txt');
    const input = { attachments: [path] };
    await f.run(input);
    const [old] = pending(f.gw);
    if (loss === 'expiry') f.tick(PENDING_CONFIRMATION_TTL_MS + 1);
    if (loss === 'eviction') {
      for (let i = 0; i < PENDING_CONFIRMATION_MAX; i += 1) f.gw.recordPendingConfirmation(`invented-${i}`);
      assert.equal(f.gw.pendingConfirmations.has(old), false);
    }
    if (loss === 'restart') {
      const next = await createTestGateway({ home: f.home, fake: f.fake, store: f.store, audit: f.audit,
        connectors: f.connectors, session: false, policy: allow, inputFileAccess: f.access, now: () => NOW,
        pendingConfirmations: f.gw.pendingConfirmations });
      // Even a host hydrating the numeric map has no private attachment snapshot.
      f = { ...f, gw: next.gw, run: (input, extra) => next.gw.execute({ action: ACTION, input, ...extra }) };
    }
    if (loss === 'consumed') assert.equal((await f.run(input, { confirm: true })).ok, true);
    const before = f.calls.proxy;
    const result = await f.run(input, { confirm: true });
    assert.equal(result.status, 'needs_confirmation');
    assert.equal(result.reason, 'unmatched_confirm');
    assert.equal(f.calls.proxy, before);
    assert.equal(f.calls.catalog, 0);
  });
}
test('F08 concurrent confirms consume a pending approval at most once', async (t) => {
  const f = await fixture(t);
  const input = { attachments: [f.write('files/concurrent.txt')] };
  await f.run(input);
  const results = await Promise.all([f.run(input, { confirm: true }), f.run(input, { confirm: true })]);
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(results.filter((result) => result.reason === 'unmatched_confirm').length, 1);
  assert.equal(f.calls.proxy, 1);
  assert.equal(observations.length, 1);
});
test('F08 mutation after the confirm read cannot change bytes handed to the module', async (t) => {
  const f = await fixture(t);
  const path = f.write('files/read-once.txt');
  const input = { attachments: [path, path] };
  await f.run(input);
  const open = fs.openSync;
  let opens = 0;
  patchFs(t, 'openSync', (...args) => { opens += 1; assert.equal(args[0], path); return open(...args); });
  f.fake.auth.proxy = async () => {
    fs.writeFileSync(path, 'replaced after read');
    const { ctx } = observations[0];
    assert.equal(ctx.inputFiles('attachments')[0].data.toString(), MARKER);
    f.calls.proxy += 1;
    return { status: 200, data: {} };
  };
  assert.equal((await f.run(input, { confirm: true })).ok, true);
  assert.equal(opens, 2);
  assert.equal(f.calls.proxy, 1);
});
test('F08 a stop during another confirm read cannot rebind that confirm', async (t) => {
  const f = await fixture(t);
  const path = f.write('files/interleaved.txt');
  const input = { attachments: [path] };
  await f.run(input);
  const [old] = pending(f.gw);
  const read = fs.readSync;
  let nested;
  let latest;
  let injected = false;
  fs.writeFileSync(path, 'X' + MARKER.slice(1));
  patchFs(t, 'readSync', (...args) => {
    if (!injected) {
      injected = true;
      nested = f.run(input);
      [latest] = pending(f.gw);
    }
    return read(...args);
  });
  const result = await f.run(input, { confirm: true });
  assert.equal((await nested).status, 'needs_confirmation');
  assert.notEqual(latest, old);
  assert.equal(result.status, 'invalid_arguments');
  assert.equal(result.reason, 'input_file_changed');
  assert.deepEqual(pending(f.gw), [latest]);
  assert.equal(f.calls.proxy, 0);
  assert.equal(observations.length, 0);
});
test('F08 a digest evicted during a confirm read is never taken or re-recorded as a copied approval', async (t) => {
  const f = await fixture(t);
  const path = f.write('files/evicted-read.txt');
  const input = { attachments: [path] };
  await f.run(input);
  const [old] = pending(f.gw);
  const read = fs.readSync;
  let injected = false;
  patchFs(t, 'readSync', (...args) => {
    if (!injected) {
      injected = true;
      f.gw.pendingConfirmations.delete(old);
    }
    return read(...args);
  });
  const stops = [];
  const record = f.gw.recordPendingConfirmation.bind(f.gw);
  t.mock.method(f.gw, 'recordPendingConfirmation', (key) => { stops.push(key); record(key); });
  const result = await f.run(input, { confirm: true });
  assert.equal(result.reason, 'unmatched_confirm');
  assert.equal(f.calls.proxy, 0);
  assert.equal(observations.length, 0);
  assert.equal(stops.length, 1, 'exactly one new stop, no second recording on a failed take');
});

function sendGrant(f) {
  return { id: 'invented-grant', actions: [SEND], kinds: ['send'], summaries: ['send invented messages'],
    cautions: ['Local attachments always require confirmation.'], heightened: true,
    label: null, provider_account_id: f.active.provider_account_id, root: 'invented-root', playbook: null, where: null,
    created_at: new Date(NOW - 1000).toISOString(), expires_at: new Date(NOW + 86400000).toISOString(), revoked_at: null };
}
test('F10 standing matcher and gateway exclude owned file fields under an otherwise matching grant', async (t) => {
  const f = await fixture(t);
  const grant = sendGrant(f);
  f.gw.standingApprovals = { list: async () => [grant] };
  const call = { action: SEND, manifestAction: f.actions.send_message, providerAccountId: f.active.provider_account_id,
    root: 'invented-root', now: NOW };
  assert.equal(matchStandingApproval([grant], { ...call, input: {} }).id, grant.id);
  for (const attachments of [[], null, {}, 'bad', [f.write('files/grant.txt')]]) {
    assert.equal(matchStandingApproval([grant], { ...call, input: { attachments } }), null);
  }
  assert.equal((await f.run({}, { action: SEND, root: call.root })).standing_approval.id, grant.id);
  observations.length = 0;
  f.calls.proxy = 0;
  const input = { attachments: [f.write('files/stop.txt')] };
  assert.equal((await f.run(input, { action: SEND, root: call.root })).status, 'needs_confirmation');
  assert.equal(f.calls.proxy, 0);
  assert.equal(observations.length, 0);
  assert.equal((await f.run({ attachments: [] }, { action: SEND, root: call.root })).status, 'invalid_arguments');
});
for (const name of ['once', 'none']) {
  test(`F10 attachments force a stop even for ${name} after an earlier confirmed call`, async (t) => {
    const f = await fixture(t);
    const action = `file-input-fixture.mail.${name}`;
    if (name === 'once') { await f.run({}, { action }); await f.run({}, { action, confirm: true }); }
    else await f.run({}, { action });
    const before = f.calls.proxy;
    const input = { attachments: [f.write('files/forced.txt')] };
    assert.equal((await f.run(input, { action })).status, 'needs_confirmation');
    assert.equal(f.calls.proxy, before);
    assert.equal((await f.run(input, { action, confirm: true })).ok, true);
    assert.equal((await f.run(input, { action })).status, 'needs_confirmation');
    assert.equal(f.calls.proxy, before + 1);
  });
}

test('F09 server stdio supplies independent input permission, actual default env and every secret flag; one-shots do not', async (t) => {
  const f = await fixture(t);
  const loader = f.write('constructor-loader.mjs', `export async function load(url, context, next) {
    const loaded = await next(url, context);
    if (url !== ${JSON.stringify(new URL('../src/gateway.js', import.meta.url).href)}) return loaded;
    return { ...loaded, source: String(loaded.source).replace('constructor(opts) {',
      'constructor(opts) { process.stderr.write(JSON.stringify({inputConstruction: true, home: opts.home, access: opts.inputFileAccess ?? null}) + "\\\\n");') };
  }`);
  for (const explicit of [true, false]) {
    for (const mode of ['stdio', '--route', '--call', '--check']) {
      const home = join(f.root, `${mode.replace('--', '')}-${explicit}`);
      const configHome = join(f.root, `config-home-${mode}-${explicit}`);
      fs.mkdirSync(configHome);
      const flags = mode === 'stdio' ? [] : mode === '--check' ? ['--check'] : mode === '--route'
        ? ['--route', '--input', '{"rows":[],"ask":"invented"}']
        : ['--call', 'wiser.route.ask', '--input', '{"ask":"invented"}'];
      const run = spawnSync(process.execPath, ['--experimental-loader', pathToFileURL(loader).href, SERVER,
        '--home', home, '--provider', 'local-file', '--secret', `sample=${f.access.secretFiles.sample}`,
        '--secrets', f.access.secretsDir, ...(explicit ? ['--env', f.access.envPath] : []), ...flags], {
        encoding: 'utf8', timeout: 10000, input: '',
        env: { ...process.env, HOME: configHome, XDG_CONFIG_HOME: configHome, APPDATA: configHome },
      });
      assert.equal(run.status, 0, run.stderr);
      const constructions = run.stderr.split('\n').filter((line) => line.startsWith('{"inputConstruction"')).map((line) => JSON.parse(line));
      if (mode === '--check') { assert.deepEqual(constructions, []); continue; }
      assert.equal(constructions.length, 1);
      const [construction] = constructions;
      if (mode !== 'stdio') { assert.equal(construction.access, null); continue; }
      assert.equal(construction.home, home);
      assert.equal(construction.access.enabled, true);
      assert.equal(construction.access.envPath, explicit ? f.access.envPath : defaultProviderEnvPath(process.platform, { XDG_CONFIG_HOME: configHome, APPDATA: configHome }, configHome));
      assert.deepEqual(construction.access.secretFiles, f.access.secretFiles);
      assert.equal(construction.access.secretsDir, f.access.secretsDir);
    }
  }
  const refused = spawnSync(process.execPath, [SERVER, '--call', ACTION, '--input', '{}'], { encoding: 'utf8' });
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, /not a first-party wiser action/);
});

test('F08 confirm copies its snapshot before an awaited provider status can record a new stop', async (t) => {
  const f = await fixture(t);
  const path = f.write('files/before-await.txt');
  const input = { attachments: [path] };
  f.connectors[0].manifest.modules.mail.auth.provider = 'local-file';
  f.gw.localFileProvider = { status: async () => 'ACTIVE' };
  await f.run(input);
  const [old] = pending(f.gw);
  let injected = false;
  let latest;
  f.gw.localFileProvider.status = async () => {
    if (!injected) {
      injected = true;
      fs.writeFileSync(path, 'X' + MARKER.slice(1));
      assert.equal((await f.run(input)).status, 'needs_confirmation');
      [latest] = pending(f.gw);
    }
    return 'ACTIVE';
  };
  assert.equal((await f.run(input, { confirm: true })).reason, 'input_file_changed');
  assert.notEqual(latest, old);
  assert.deepEqual(pending(f.gw), [latest]);
  assert.equal(observations.length, 0);
  assert.deepEqual(f.calls, { proxy: 0, catalog: 0, hydration: 0 });
});
test('F01 input declaration and field bounds are snapshotted before an await', async (t) => {
  const f = await fixture(t);
  const path = f.write('files/cap.txt', '12345');
  f.connectors[0].manifest.modules.mail.auth.provider = 'local-file';
  f.actions.create_draft.input_files.max_bytes = 4;
  f.gw.localFileProvider = { status: async () => {
    f.actions.create_draft.input_files.max_bytes = 2097152;
    f.actions.create_draft.input.properties.attachments.maxItems = 100;
    return 'ACTIVE';
  } };
  const open = fs.openSync;
  let opens = 0;
  patchFs(t, 'openSync', (...args) => { opens += 1; return open(...args); });
  assert.equal((await f.run({ attachments: [path] })).reason, 'input_file_too_large');
  assert.equal(opens, 0);
  assert.equal(observations.length, 0);
  assert.equal(f.calls.proxy, 0);
});
test('F08 the full digest appends ordered descriptors and keeps numeric expiries private of bytes', async (t) => {
  const f = await fixture(t);
  const path = f.write('files/digest.txt');
  const input = { attachments: [path, path] };
  const st = fs.statSync(path);
  const descriptors = [0, 1].map((index) => ({ field: 'attachments', index, path, dev: st.dev, ino: st.ino,
    name: basename(path), media_type: 'text/plain', size: Buffer.byteLength(MARKER), sha256: sha(Buffer.from(MARKER)) }));
  const base = ['execute', ACTION, input, f.active.provider_account_id];
  await f.run(input);
  assert.deepEqual(pending(f.gw), [confirmationDigest([...base, descriptors])]);
  assert.equal(f.gw.pendingConfirmations.has(confirmationDigest(base)), false);
  assert.equal(typeof [...f.gw.pendingConfirmations.values()][0], 'number');
  bytesAbsent([...f.gw.pendingConfirmations]);
});
test('F02 an undeclared executing action receives only a fail-closed inputFiles helper', async (t) => {
  const f = await fixture(t);
  await f.run({}, { action: 'file-input-fixture.mail.undeclared' });
  assert.equal(observations[0].undeclaredRefusal.reason, 'input_file_refused');
  const ctx = observations[0].ctx;
  noFileWork(t, f.audit.file);
  assert.throws(() => ctx.inputFiles('attachments'), (err) => err.object.reason === 'input_file_refused');
});

test('F08 the copied approval still binds non-file input changed during an await', async (t) => {
  const f = await fixture(t);
  const input = { attachments: [f.write('files/input-binding.txt')], subject: 'Project Cedar' };
  f.connectors[0].manifest.modules.mail.auth.provider = 'local-file';
  f.gw.localFileProvider = { status: async () => 'ACTIVE' };
  await f.run(input);
  f.gw.localFileProvider.status = async () => { input.subject = 'Different project'; return 'ACTIVE'; };
  const result = await f.run(input, { confirm: true });
  assert.equal(result.reason, 'unmatched_confirm');
  assert.equal(observations.length, 0);
  assert.deepEqual(f.calls, { proxy: 0, catalog: 0, hydration: 0 });
});

test('F09 a denied call never probes ownership of the attachment field', async (t) => {
  const f = await fixture(t, { armed: false, active: false,
    policy: { ...allow, rules: [{ role: '*', effect: 'deny' }] } });
  const input = new Proxy({}, { getOwnPropertyDescriptor() { assert.fail('input probed before policy denial'); } });
  t.mock.method(f.store, 'getConnection', () => assert.fail('connection lookup before denial'));
  noFileWork(t, f.audit.file);
  assert.equal((await f.run(input)).status, 'denied');
  assert.equal(observations.length, 0);
  assert.deepEqual(f.calls, { proxy: 0, catalog: 0, hydration: 0 });
});
