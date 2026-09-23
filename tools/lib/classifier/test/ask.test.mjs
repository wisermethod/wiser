import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { verify, writeSession } from '../../../../hooks/lib/binding.mjs';

const askPath = fileURLToPath(new URL('../ask.mjs', import.meta.url));
const askUrl = pathToFileURL(askPath).href;
const ACTION = 'wiser.recall.rank';
const CANON = '{"a":[{"a":1,"b":2}],"ok":true,"z":1}';
const INPUT = { z: 1, ok: true, a: [{ b: 2, a: 1 }] };
const HASH = createHash('sha256').update(CANON).digest('hex');

function tempDir() {
  return mkdtempSync(join(tmpdir(), 'wiser-ask-'));
}

function childEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  if (!Object.prototype.hasOwnProperty.call(extra, 'WISER_HOOK_STUB_FILE')) delete env.WISER_HOOK_STUB_FILE;
  if (!Object.prototype.hasOwnProperty.call(extra, 'WISER_HOOK_STUB_LOG')) delete env.WISER_HOOK_STUB_LOG;
  if (!Object.prototype.hasOwnProperty.call(extra, 'CLAUDE_PID')) delete env.CLAUDE_PID;
  if (!Object.prototype.hasOwnProperty.call(extra, 'CLAUDE_CODE_SESSION_ID')) delete env.CLAUDE_CODE_SESSION_ID;
  return env;
}

function bind(home, root, opts = {}) {
  const sessionId = opts.sessionId || 'ask-session-01';
  const recorded = writeSession({
    home,
    sessionId,
    harnessPid: opts.harnessPid || process.pid,
    cwd: opts.cwd || root,
    homeDir: opts.homeDir || home,
    harnessStartedReader: opts.harnessStartedReader,
    argsReader: opts.argsReader,
    now: opts.now,
    scanLimit: opts.scanLimit,
  });
  assert.equal(recorded && recorded.ok, true, JSON.stringify(recorded));
  return sessionId;
}

function sessionEnv(sessionId, extra = {}) {
  return {
    CLAUDE_PID: String(process.pid),
    CLAUDE_CODE_SESSION_ID: sessionId,
    ...extra,
  };
}

function askInChild(opts, extraEnv = {}) {
  const script = `
    import { ask } from ${JSON.stringify(askUrl)};
    const opts = JSON.parse(process.env.ASK_OPTS);
    ask(opts).then(
      (result) => { process.stdout.write(JSON.stringify({ ok: true, result })); },
      (error) => { process.stdout.write(JSON.stringify({ ok: false, message: String(error && error.message || error) })); },
    );
  `;
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8',
    env: { ...childEnv(extraEnv), ASK_OPTS: JSON.stringify(opts) },
  });
  let body = null;
  try { body = JSON.parse(run.stdout); } catch { /* child failed before printing */ }
  return { status: run.status, stdout: run.stdout, stderr: run.stderr, body };
}

function answered(opts, extraEnv) {
  const run = askInChild(opts, extraEnv);
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.ok(run.body && run.body.ok, run.stderr || JSON.stringify(run.body));
  return run.body.result;
}

function runCli(args, { input = '', env = {} } = {}) {
  return spawnSync(process.execPath, [askPath, ...args], {
    encoding: 'utf8',
    input,
    env: childEnv(env),
  });
}

function writeAgents(dir, text = '---\ntype: personal\n---\n\n# Root\n') {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'AGENTS.md'), text);
  return dir;
}

function materialFile(root, name = 'rows.txt') {
  const file = join(root, name);
  writeFileSync(file, 'rows');
  return file;
}

function presence(home, doc) {
  const dir = join(home, 'classifier-status');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'claude-code.json'), `${JSON.stringify(doc)}\n`);
}

function attached(home) {
  const dirs = join(home, 'classifier');
  mkdirSync(dirs, { recursive: true });
  presence(home, {
    attached: true,
    classifier_dirs: [dirs],
    pid: process.pid,
    started_at: '2026-09-23T00:00:00.000Z',
  });
  return dirs;
}

function stubEnv(dir, answer) {
  const stub = join(dir, 'stub.json');
  const log = join(dir, 'calls.log');
  writeFileSync(stub, JSON.stringify({ [ACTION]: answer }));
  return {
    WISER_HOOK_STUB_FILE: stub,
    WISER_HOOK_STUB_LOG: log,
    log,
  };
}

function deadPid() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
    child.on('exit', () => {
      try {
        process.kill(child.pid, 0);
        reject(new Error('pid still alive'));
      } catch (err) {
        if (err && err.code === 'ESRCH') resolve(child.pid);
        else reject(err);
      }
    });
    child.kill('SIGKILL');
  });
}

test('a matching replay makes no call and reads no presence', () => {
  const dir = tempDir();
  const env = stubEnv(dir, { ranked: [{ id: 'from-stub', p: 1, calibrated: false }] });
  const record = {
    action: ACTION,
    input_sha256: HASH,
    input: INPUT,
    answer: { ranked: [{ id: 'kept', p: 0.25, calibrated: false }], calibrated: false },
    path: 'classifier',
    ms: 4,
    at: '2026-09-23T00:00:00.000Z',
  };
  const file = join(dir, 'record.json');
  writeFileSync(file, JSON.stringify(record));
  const fromObject = answered({
    action: ACTION,
    input: INPUT,
    owningRoot: 'not-absolute',
    gatewayHome: join(dir, 'missing-home'),
    replay: record,
  }, env);
  assert.equal(fromObject.path, 'replay');
  assert.equal(fromObject.reason, null);
  assert.deepEqual(fromObject.answer, record.answer);
  assert.deepEqual(fromObject.record, record);
  assert.equal(existsSync(env.log), false);

  const fromFile = answered({
    action: ACTION,
    input: INPUT,
    replay: file,
  }, env);
  assert.equal(fromFile.path, 'replay');
  assert.deepEqual(fromFile.answer, record.answer);
  assert.equal(existsSync(env.log), false);
});

test('a replay that does not match this judgment throws', () => {
  const dir = tempDir();
  const env = stubEnv(dir, { ranked: [] });
  const record = { action: ACTION, input_sha256: HASH, answer: { ranked: [] }, path: 'classifier' };
  const mismatched = askInChild({
    action: ACTION,
    input: { z: 2, ok: true, a: [{ b: 2, a: 1 }] },
    replay: record,
  }, env);
  assert.equal(mismatched.status, 0, mismatched.stderr);
  assert.equal(mismatched.body.ok, false);
  assert.match(mismatched.body.message, /does not match this judgment/);
  assert.equal(existsSync(env.log), false);

  const wrongAction = askInChild({ action: 'wiser.other', input: INPUT, replay: record }, env);
  assert.equal(wrongAction.body.ok, false);
  assert.match(wrongAction.body.message, /does not match this judgment/);

  const file = join(dir, 'record.json');
  writeFileSync(file, JSON.stringify(record));
  const cli = runCli([
    '--action', ACTION,
    '--replay', file,
    '--input', '-',
  ], { input: JSON.stringify({ z: 2 }), env });
  assert.equal(cli.status, 1);
  assert.equal(cli.stdout, '');
  assert.match(cli.stderr, /does not match this judgment/);
});

test('a missing session, an unbound root, and a relative owning root send nothing', () => {
  const dir = tempDir();
  const env = stubEnv(dir, { ranked: [{ id: 'x', p: 0.25, calibrated: false }] });
  const home = tempDir();
  attached(home);
  const root = writeAgents(join(dir, 'root'));
  const other = writeAgents(join(dir, 'other'));
  const sessionId = bind(home, root, { argsReader: () => `--add-dir ${other}` });
  const missing = answered({ action: ACTION, input: INPUT, gatewayHome: home }, env);
  assert.equal(missing.reason, 'no-session');
  const unnamed = answered({
    action: ACTION, input: INPUT, gatewayHome: home,
  }, sessionEnv(sessionId, env));
  assert.equal(unnamed.reason, 'no-owning-root');
  const namedAmong = answered({
    action: ACTION, input: INPUT, owningRoot: root, gatewayHome: home,
  }, sessionEnv(sessionId, env));
  assert.equal(namedAmong.reason, 'no-owning-root');
  const single = bind(home, root, { sessionId: 'ask-session-one' });
  for (const owningRoot of ['relative/root', 'root']) {
    const result = answered({
      action: ACTION, input: INPUT, owningRoot, gatewayHome: home,
    }, sessionEnv(single, env));
    assert.equal(result.path, 'builtin');
    assert.equal(result.reason, 'root-mismatch');
    assert.equal(result.answer, null);
    assert.equal(result.record, null);
  }
  assert.equal(existsSync(env.log), false);
});

test('an unreadable AGENTS.md takes the builtin path and sends nothing', () => {
  const dir = tempDir();
  const root = writeAgents(join(dir, 'root'));
  const agents = join(root, 'AGENTS.md');
  try {
    const env = stubEnv(dir, { ranked: [{ id: 'x', p: 0.25, calibrated: false }] });
    const home = tempDir();
    attached(home);
    const sessionId = bind(home, root);
    chmodSync(agents, 0o000);
    const result = answered({
      action: ACTION, input: INPUT, owningRoot: root, material: [join(root, 'rows.txt')], gatewayHome: home,
    }, sessionEnv(sessionId, env));
    assert.equal(result.path, 'builtin');
    assert.equal(result.reason, 'unreadable-root');
    assert.equal(result.answer, null);
    assert.equal(result.record, null);
    assert.equal(existsSync(env.log), false);
  } finally {
    chmodSync(agents, 0o644);
  }
});

test('a refusal in a parent folder takes the builtin path and sends nothing', () => {
  const dir = tempDir();
  writeAgents(dir, '---\nclassifier_refusal: yes\n---\n');
  const child = writeAgents(join(dir, 'child'));
  const env = stubEnv(dir, { ranked: [{ id: 'x', p: 0.25, calibrated: false }] });
  const home = tempDir();
  attached(home);
  const sessionId = bind(home, child);
  const result = answered({ action: ACTION, input: INPUT, owningRoot: child, gatewayHome: home }, sessionEnv(sessionId, env));
  assert.equal(result.path, 'builtin');
  assert.equal(result.reason, 'refused');
  assert.equal(result.answer, null);
  assert.equal(result.record, null);
  assert.equal(existsSync(env.log), false);
});

test('no presence file takes the builtin path and sends nothing', () => {
  const dir = tempDir();
  const root = writeAgents(join(dir, 'root'));
  const env = stubEnv(dir, { ranked: [{ id: 'x', p: 0.25, calibrated: false }] });
  const home = join(dir, 'empty-home');
  const sessionId = bind(home, root);
  const result = answered({
    action: ACTION,
    input: INPUT,
    owningRoot: root,
    material: [materialFile(root)],
    gatewayHome: home,
  }, sessionEnv(sessionId, env));
  assert.equal(result.path, 'builtin');
  assert.equal(result.reason, 'no-classifier');
  assert.equal(result.answer, null);
  assert.equal(result.record, null);
  assert.equal(existsSync(env.log), false);
});

test('a presence file whose pid is dead takes the builtin path and sends nothing', async () => {
  const dir = tempDir();
  const root = writeAgents(join(dir, 'root'));
  const home = tempDir();
  const dirs = join(home, 'classifier');
  mkdirSync(dirs, { recursive: true });
  presence(home, {
    attached: true,
    classifier_dirs: [dirs],
    pid: await deadPid(),
    started_at: '2026-09-23T00:00:00.000Z',
  });
  const env = stubEnv(dir, { ranked: [{ id: 'x', p: 0.25, calibrated: false }] });
  const sessionId = bind(home, root);
  const result = answered({
    action: ACTION, input: INPUT, owningRoot: root, material: [materialFile(root)], gatewayHome: home,
  }, sessionEnv(sessionId, env));
  assert.equal(result.path, 'builtin');
  assert.equal(result.reason, 'no-classifier');
  assert.equal(result.answer, null);
  assert.equal(result.record, null);
  assert.equal(existsSync(env.log), false);
});

test('a stub answer returns classifier, the answer unchanged, and a full record', () => {
  const dir = tempDir();
  const root = writeAgents(join(dir, 'root'));
  const home = tempDir();
  attached(home);
  const answer = {
    ranked: [
      { id: 'p1', p: 0.25, calibrated: false },
      { id: 'p2', p: 0.125, calibrated: false },
    ],
    calibrated: false,
  };
  const env = stubEnv(dir, answer);
  const file = materialFile(root);
  const sessionId = bind(home, root);
  const result = answered({
    action: ACTION, input: INPUT, owningRoot: root, material: [file], gatewayHome: home,
  }, sessionEnv(sessionId, env));
  assert.equal(result.path, 'classifier');
  assert.equal(result.reason, null);
  assert.deepEqual(result.answer, answer);
  assert.equal(result.answer.ranked[0].p, 0.25);
  assert.equal(result.answer.ranked[1].p, 0.125);
  assert.equal(result.record.action, ACTION);
  assert.equal(result.record.input_sha256, HASH);
  assert.deepEqual(result.record.input, INPUT);
  assert.deepEqual(result.record.answer, answer);
  assert.equal(result.record.path, 'classifier');
  assert.equal(typeof result.record.ms, 'number');
  assert.ok(result.record.ms >= 0);
  assert.match(result.record.at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.equal(readFileSync(env.log, 'utf8'), `${ACTION}\n`);
});

test('a stub answer with a status returns builtin with that reason', () => {
  const dir = tempDir();
  const root = writeAgents(join(dir, 'root'));
  const home = tempDir();
  attached(home);
  const env = stubEnv(dir, {
    status: 'needs_subscription',
    ranked: [{ id: 'p1', p: 0.25, calibrated: false }],
    p: 0.25,
  });
  const sessionId = bind(home, root);
  const result = answered({
    action: ACTION, input: INPUT, owningRoot: root, material: [materialFile(root)], gatewayHome: home,
  }, sessionEnv(sessionId, env));
  assert.deepEqual(result, {
    path: 'builtin',
    reason: 'needs_subscription',
    answer: null,
    record: null,
  });
});

test('callOnce returning null returns unavailable', () => {
  const dir = tempDir();
  const root = writeAgents(join(dir, 'root'));
  const home = tempDir();
  attached(home);
  const env = stubEnv(dir, null);
  const sessionId = bind(home, root);
  const result = answered({
    action: ACTION, input: INPUT, owningRoot: root, material: [materialFile(root)], gatewayHome: home,
  }, sessionEnv(sessionId, env));
  assert.deepEqual(result, { path: 'builtin', reason: 'unavailable', answer: null, record: null });
  assert.equal(readFileSync(env.log, 'utf8'), `${ACTION}\n`);
});

test('the CLI refuses an unknown flag by name', () => {
  const run = runCli(['--action', ACTION, '--input', '-', '--not-a-flag']);
  assert.equal(run.status, 1);
  assert.equal(run.stdout, '');
  assert.match(run.stderr, /--not-a-flag/);
});

test('help exits 0 and a missing --action or --input exits 1', () => {
  const help = runCli(['help']);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /--action/);
  assert.match(help.stdout, /--material/);
  assert.match(help.stdout, /session binding/);
  assert.equal(help.stderr, '');
  const dashed = runCli(['--help']);
  assert.equal(dashed.status, 0);
  assert.match(dashed.stdout, /--replay/);

  const missingAction = runCli(['--input', '-'], { input: '{}' });
  assert.equal(missingAction.status, 1);
  assert.equal(missingAction.stdout, '');
  assert.match(missingAction.stderr, /--action/);

  const missingInput = runCli(['--action', ACTION]);
  assert.equal(missingInput.status, 1);
  assert.equal(missingInput.stdout, '');
  assert.match(missingInput.stderr, /--input/);

  const bad = runCli(['--action', ACTION, '--input', '-'], { input: '{' });
  assert.equal(bad.status, 1);
  assert.equal(bad.stdout, '');
  assert.match(bad.stderr, /unparseable input/);
});

test('a symlink to the bound root is sent, and a start time that is not the live one is not', () => {
  const dir = tempDir();
  const root = writeAgents(join(dir, 'root'));
  const home = tempDir();
  attached(home);
  const link = join(dir, 'link-root');
  symlinkSync(root, link);
  const sessionId = bind(home, root);
  const env = stubEnv(dir, { ranked: [{ id: 'p', p: 0.5, calibrated: false }] });
  const sent = answered({
    action: ACTION, input: INPUT, owningRoot: link, material: [materialFile(root)], gatewayHome: home,
  }, sessionEnv(sessionId, env));
  assert.equal(sent.path, 'classifier');
  assert.equal(readFileSync(env.log, 'utf8'), `${ACTION}\n`);

  const staleHome = tempDir();
  attached(staleHome);
  const staleId = bind(staleHome, root, { sessionId: 'ask-session-stale', harnessStartedReader: () => 'not-the-live-start' });
  const quiet = stubEnv(tempDir(), { ranked: [{ id: 'p', p: 0.5, calibrated: false }] });
  const missed = answered({
    action: ACTION, input: INPUT, owningRoot: root, gatewayHome: staleHome,
  }, sessionEnv(staleId, quiet));
  assert.equal(missed.path, 'builtin');
  assert.ok(missed.reason === 'stale-session' || missed.reason === 'unverifiable', missed.reason);
  assert.equal(existsSync(quiet.log), false);
  const checked = verify({ home: staleHome, harnessPid: process.pid, sessionId: staleId });
  assert.equal(checked.ok, false);
  assert.ok(checked.reason === 'stale-session' || checked.reason === 'unverifiable');
});

test('material outside the roots, or inside a refusing folder the scan does not reach, sends nothing', () => {
  const dir = tempDir();
  const root = writeAgents(join(dir, 'root'));
  const outside = join(dir, 'outside.txt');
  writeFileSync(outside, 'x');
  let deep = root;
  for (let i = 1; i <= 7; i += 1) {
    deep = join(deep, `d${i}`);
    mkdirSync(deep);
  }
  writeFileSync(join(deep, 'AGENTS.md'), '---\nclassifier_refusal: yes\n---\n');
  const buried = join(deep, 'note.txt');
  writeFileSync(buried, 'note');
  const inside = join(root, 'rows.txt');
  writeFileSync(inside, 'rows');
  const home = tempDir();
  attached(home);
  const sessionId = bind(home, root);
  const env = stubEnv(dir, { ranked: [{ id: 'p', p: 0.5, calibrated: false }] });
  const bound = readSession(home, sessionId);
  assert.equal(bound.binding.refused, false);

  const out = answered({
    action: ACTION, input: INPUT, owningRoot: root, material: [outside], gatewayHome: home,
  }, sessionEnv(sessionId, env));
  assert.equal(out.reason, 'material-outside-root');
  const refused = answered({
    action: ACTION, input: INPUT, owningRoot: root, material: [buried], gatewayHome: home,
  }, sessionEnv(sessionId, env));
  assert.equal(refused.reason, 'refused');
  const kept = answered({
    action: ACTION, input: INPUT, owningRoot: root, material: [inside, realpathSync(inside)], gatewayHome: home,
  }, sessionEnv(sessionId, env));
  assert.equal(kept.path, 'classifier');
  assert.equal(existsSync(env.log), true);
});

function readSession(home, sessionId) {
  return verify({ home, harnessPid: process.pid, sessionId });
}

test('a named root among several sends nothing, and none named does not either', () => {
  const dir = tempDir();
  const root = writeAgents(join(dir, 'root'));
  const other = writeAgents(join(dir, 'other'));
  const file = join(root, 'rows.txt');
  writeFileSync(file, 'rows');
  const home = tempDir();
  attached(home);
  const sessionId = bind(home, root, { sessionId: 'ask-session-many', argsReader: () => `--add-dir ${other}` });
  const checked = verify({ home, harnessPid: process.pid, sessionId });
  assert.equal(checked.binding.owning_root, null);
  assert.equal(checked.binding.refused, false);
  const env = stubEnv(dir, { ranked: [{ id: 'p', p: 0.5, calibrated: false }] });
  const unnamed = answered({
    action: ACTION, input: INPUT, material: [file], gatewayHome: home,
  }, sessionEnv(sessionId, env));
  assert.equal(unnamed.reason, 'no-owning-root');
  assert.equal(existsSync(env.log), false);
  const named = answered({
    action: ACTION, input: INPUT, owningRoot: root, material: [file], gatewayHome: home,
  }, sessionEnv(sessionId, env));
  assert.equal(named.path, 'builtin');
  assert.equal(named.reason, 'no-owning-root');
  assert.equal(named.answer, null);
  assert.equal(existsSync(env.log), false);
});

test('the CLI repeats --material', () => {
  const dir = tempDir();
  const root = writeAgents(join(dir, 'root'));
  const file = join(root, 'rows.txt');
  writeFileSync(file, 'rows');
  const home = tempDir();
  attached(home);
  const sessionId = bind(home, root, { sessionId: 'ask-session-cli' });
  const env = stubEnv(dir, { ranked: [{ id: 'p', p: 0.5, calibrated: false }] });
  const run = runCli([
    '--action', ACTION,
    '--owning-root', root,
    '--gateway-home', home,
    '--material', file,
    '--material', file,
    '--input', JSON.stringify(INPUT),
  ], { env: sessionEnv(sessionId, env) });
  assert.equal(run.status, 0, run.stderr);
  const result = JSON.parse(run.stdout);
  assert.equal(result.path, 'classifier');
});

test('no material sends nothing', () => {
  const dir = tempDir();
  const root = writeAgents(join(dir, 'root'));
  const home = tempDir();
  attached(home);
  const sessionId = bind(home, root, { sessionId: 'ask-session-nomaterial' });
  const env = stubEnv(dir, { ranked: [{ id: 'p', p: 0.5, calibrated: false }] });
  const result = answered({
    action: ACTION, input: INPUT, owningRoot: root, gatewayHome: home,
  }, sessionEnv(sessionId, env));
  assert.equal(result.path, 'builtin');
  assert.equal(result.reason, 'no-material');
  assert.equal(result.answer, null);
  assert.equal(existsSync(env.log), false);
});

test('a live session that is not an ancestor sends nothing, and this process still does', async () => {
  const dir = tempDir();
  const root = writeAgents(join(dir, 'root'));
  const file = materialFile(root);
  const home = tempDir();
  attached(home);
  const sleeper = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  await new Promise((resolve, reject) => {
    sleeper.once('spawn', resolve);
    sleeper.once('error', reject);
  });
  try {
    const foreign = 'ask-session-foreign';
    const bound = writeSession({
      home, sessionId: foreign, harnessPid: sleeper.pid, cwd: root, homeDir: home,
    });
    assert.equal(bound.ok, true, JSON.stringify(bound));
    const env = stubEnv(dir, { ranked: [{ id: 'p', p: 0.5, calibrated: false }] });
    const spoofed = answered({
      action: ACTION, input: INPUT, material: [file], gatewayHome: home,
    }, { ...env, CLAUDE_PID: String(sleeper.pid), CLAUDE_CODE_SESSION_ID: foreign });
    assert.equal(spoofed.path, 'builtin');
    assert.equal(spoofed.reason, 'not-ancestor');
    assert.equal(existsSync(env.log), false);

    const sessionId = bind(home, root, { sessionId: 'ask-session-parent' });
    const sent = answered({
      action: ACTION, input: INPUT, material: [file], gatewayHome: home,
    }, sessionEnv(sessionId, env));
    assert.equal(sent.path, 'classifier');
    assert.equal(readFileSync(env.log, 'utf8').trim(), ACTION);
  } finally {
    sleeper.kill('SIGKILL');
  }
});

test('a refusal added at the root after a clean binding stops the call at once', () => {
  const dir = tempDir();
  const root = writeAgents(join(dir, 'root'));
  const file = materialFile(root);
  const home = tempDir();
  attached(home);
  const sessionId = bind(home, root, { sessionId: 'ask-session-later' });
  writeFileSync(join(root, 'AGENTS.md'), '---\ntype: personal\nclassifier_refusal: yes\n---\n\n# Root\n');
  const env = stubEnv(dir, { ranked: [{ id: 'p', p: 0.5, calibrated: false }] });
  const result = answered({
    action: ACTION, input: INPUT, material: [file], gatewayHome: home,
  }, sessionEnv(sessionId, env));
  assert.equal(result.reason, 'refused');
  assert.equal(existsSync(env.log), false);
});

test('a refusal added two levels below a clean scan is honoured when the material sits under it', () => {
  const dir = tempDir();
  const root = writeAgents(join(dir, 'root'));
  const home = tempDir();
  attached(home);
  const sessionId = bind(home, root, { sessionId: 'ask-session-below' });
  const before = verify({ home, harnessPid: process.pid, sessionId });
  assert.equal(before.binding.refused, false);
  const nest = join(root, 'a', 'b');
  mkdirSync(nest, { recursive: true });
  writeFileSync(join(nest, 'AGENTS.md'), '---\nclassifier_refusal: yes\n---\n');
  const buried = join(nest, 'note.txt');
  writeFileSync(buried, 'note');
  const env = stubEnv(dir, { ranked: [{ id: 'p', p: 0.5, calibrated: false }] });
  const result = answered({
    action: ACTION, input: INPUT, material: [buried], gatewayHome: home,
  }, sessionEnv(sessionId, env));
  assert.equal(result.reason, 'refused');
  assert.equal(existsSync(env.log), false);
  const after = verify({ home, harnessPid: process.pid, sessionId });
  assert.equal(after.ok, true);
  assert.equal(after.binding.refused, false);
});

test('a replay whose stored input does not hash to its input_sha256 is refused', () => {
  const dir = tempDir();
  const env = stubEnv(dir, { ranked: [] });
  const record = {
    action: ACTION,
    input_sha256: HASH,
    input: { z: 9, ok: true, a: [{ b: 2, a: 1 }] },
    answer: { ranked: [] },
    path: 'classifier',
  };
  const tampered = askInChild({ action: ACTION, input: INPUT, replay: record }, env);
  assert.equal(tampered.status, 0, tampered.stderr);
  assert.equal(tampered.body.ok, false);
  assert.match(tampered.body.message, /does not match this judgment/);
  assert.equal(existsSync(env.log), false);
});

test('an unreadable ancestor AGENTS.md refuses and sends nothing', () => {
  const dir = tempDir();
  const agents = join(dir, 'AGENTS.md');
  writeFileSync(agents, '---\nroot: container\n---\n');
  const root = writeAgents(join(dir, 'child'));
  const home = tempDir();
  attached(home);
  const sessionId = bind(home, root, { sessionId: 'ask-session-ancestor' });
  const before = verify({ home, harnessPid: process.pid, sessionId });
  assert.equal(before.ok, true, JSON.stringify(before));
  assert.equal(before.binding.refused, false);
  const env = stubEnv(dir, { ranked: [{ id: 'x', p: 0.25, calibrated: false }] });
  chmodSync(agents, 0o000);
  try {
    const result = answered({
      action: ACTION, input: INPUT, owningRoot: root, material: [materialFile(root)], gatewayHome: home,
    }, sessionEnv(sessionId, env));
    assert.equal(result.path, 'builtin');
    assert.equal(result.reason, 'refused');
    assert.equal(result.answer, null);
    assert.equal(result.record, null);
    assert.equal(existsSync(env.log), false);
  } finally {
    chmodSync(agents, 0o644);
  }
});

test('an unreadable AGENTS.md at the material location refuses and sends nothing', () => {
  const dir = tempDir();
  const root = writeAgents(join(dir, 'root'));
  const nest = join(root, 'nested');
  mkdirSync(nest);
  const agents = join(nest, 'AGENTS.md');
  writeFileSync(agents, '---\ntype: personal\n---\n');
  const file = join(nest, 'rows.txt');
  writeFileSync(file, 'rows');
  const home = tempDir();
  attached(home);
  const sessionId = bind(home, root, { sessionId: 'ask-session-material' });
  const before = verify({ home, harnessPid: process.pid, sessionId });
  assert.equal(before.ok, true, JSON.stringify(before));
  assert.equal(before.binding.refused, false);
  chmodSync(agents, 0o000);
  try {
    const env = stubEnv(dir, { ranked: [{ id: 'x', p: 0.25, calibrated: false }] });
    const result = answered({
      action: ACTION, input: INPUT, owningRoot: root, material: [file], gatewayHome: home,
    }, sessionEnv(sessionId, env));
    assert.equal(result.path, 'builtin');
    assert.equal(result.reason, 'refused');
    assert.equal(result.answer, null);
    assert.equal(existsSync(env.log), false);
  } finally {
    chmodSync(agents, 0o644);
  }
});
