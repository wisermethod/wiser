import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeSession } from '../../../../hooks/lib/binding.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'data.js');
const ACTION = 'wiser.decide.batch';
const CSV = 'id,year,revenue,note\n10,2020,5,a\n20,2021,15,b\n30,2022,25,c\n';

function tempDir() {
  return mkdtempSync(join(tmpdir(), 'wiser-roles-'));
}

function childEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  if (!Object.prototype.hasOwnProperty.call(extra, 'WISER_HOOK_STUB_FILE')) delete env.WISER_HOOK_STUB_FILE;
  if (!Object.prototype.hasOwnProperty.call(extra, 'WISER_HOOK_STUB_LOG')) delete env.WISER_HOOK_STUB_LOG;
  if (!Object.prototype.hasOwnProperty.call(extra, 'CLAUDE_PID')) delete env.CLAUDE_PID;
  if (!Object.prototype.hasOwnProperty.call(extra, 'CLAUDE_CODE_SESSION_ID')) delete env.CLAUDE_CODE_SESSION_ID;
  return env;
}

function bind(home, root, sessionId = 'roles-session-01') {
  const recorded = writeSession({
    home,
    sessionId,
    harnessPid: process.pid,
    cwd: root,
    homeDir: home,
  });
  assert.equal(recorded && recorded.ok, true, JSON.stringify(recorded));
  return sessionId;
}

function sessionEnv(sessionId, extra = {}) {
  return {
    ...extra,
    CLAUDE_PID: String(process.pid),
    CLAUDE_CODE_SESSION_ID: sessionId,
  };
}

function writeAgents(dir, text = '---\ntype: personal\n---\n\n# Root\n') {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'AGENTS.md'), text);
  return dir;
}

function attached(home) {
  const dirs = join(home, 'classifier');
  mkdirSync(dirs, { recursive: true });
  const status = join(home, 'classifier-status');
  mkdirSync(status, { recursive: true });
  writeFileSync(join(status, 'claude-code.json'), `${JSON.stringify({
    attached: true,
    classifier_dirs: [dirs],
    pid: process.pid,
    started_at: '2026-09-23T00:00:00.000Z',
  })}\n`);
}

function stubEnv(dir, answer, name = 'calls') {
  const stub = join(dir, `${name}.json`);
  const log = join(dir, `${name}.log`);
  writeFileSync(stub, JSON.stringify({ [ACTION]: answer }));
  return { WISER_HOOK_STUB_FILE: stub, WISER_HOOK_STUB_LOG: log, log };
}

function writeCsv(dir, text = CSV) {
  const file = join(dir, 'rows.csv');
  writeFileSync(file, text);
  return file;
}

function run(args, env = {}) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', env: childEnv(env) });
}

function ok(args, env) {
  const result = run(args, env);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

const ANSWER = {
  answers: [
    { id: 'id', choice: 'identifier', confidence: 0.91 },
    { id: 'year', choice: 'none', confidence: 0.2 },
    { id: 'revenue', choice: 'quantity', confidence: 0.8 },
  ],
  calibrated: false,
};

describe('roles', () => {
  it('records a classifier judgment and leaves parse unchanged', () => {
    const dir = tempDir();
    const home = tempDir();
    const owning = writeAgents(join(dir, 'root'));
    attached(home);
    const file = writeCsv(owning);
    const env = stubEnv(dir, ANSWER);
    const sessionId = bind(home, owning);
    const parsed = ok(['parse', '--file', file]);
    const judged = ok([
      'roles', '--file', file, '--owning-root', owning, '--gateway-home', home,
    ], sessionEnv(sessionId, env));
    const { roles, ...rest } = judged;
    assert.deepEqual(rest, parsed);
    assert.equal(roles.path, 'classifier');
    assert.equal(roles.reason, null);
    assert.deepEqual(roles.columns, { id: 'identifier', year: null, revenue: 'quantity' });
    assert.equal(roles.record.answer.answers[2].confidence, 0.8);
    const decision = roles.record.input.decisions.find((item) => item.id === 'revenue');
    assert.match(decision.question, /revenue/);
    assert.match(decision.question, /5/);
    assert.match(decision.question, /id/);
    assert.match(decision.question, /note/);
    assert.equal(roles.record.input.state.request, JSON.stringify(parsed));
    assert.equal(roles.record.input.allow_uncalibrated, true);
    assert.match(readFileSync(env.log, 'utf8'), new RegExp(ACTION));
  });

  it('takes the builtin path when there is no owning root, a refusal, no classifier, or no accepted role', () => {
    const dir = tempDir();
    const home = tempDir();
    const owning = writeAgents(join(dir, 'root'));
    const refused = writeAgents(join(dir, 'refused'), '---\ntype: personal\nclassifier_refusal: yes\n---\n\n# Root\n');
    const file = writeCsv(dir);
    const env = stubEnv(dir, ANSWER);

    const noRoot = ok(['roles', '--file', file, '--gateway-home', home], env);
    assert.equal(noRoot.roles.path, 'builtin');
    assert.equal(noRoot.roles.reason, 'no-session');
    assert.deepEqual(noRoot.roles.columns, { id: null, year: null, revenue: null });
    assert.equal(noRoot.roles.record, null);
    assert.equal(existsSync(env.log), false);

    const other = writeAgents(join(dir, 'other'));
    const manyId = bind(home, owning, 'roles-session-many');
    writeSession({
      home,
      sessionId: manyId,
      harnessPid: process.pid,
      cwd: owning,
      homeDir: home,
      argsReader: () => `--add-dir ${other}`,
    });
    const unnamed = ok(['roles', '--file', file, '--gateway-home', home], sessionEnv(manyId, env));
    assert.equal(unnamed.roles.reason, 'no-owning-root');

    const refusedId = bind(home, refused, 'roles-session-nope');
    const refusedRun = ok([
      'roles', '--file', file, '--owning-root', refused, '--gateway-home', home,
    ], sessionEnv(refusedId, env));
    assert.equal(refusedRun.roles.reason, 'refused');
    assert.equal(existsSync(env.log), false);

    const quiet = tempDir();
    const inside = writeCsv(owning, CSV);
    const openId = bind(quiet, owning, 'roles-session-open');
    const missing = ok([
      'roles', '--file', inside, '--owning-root', owning, '--gateway-home', quiet,
    ], sessionEnv(openId, env));
    assert.equal(missing.roles.reason, 'no-classifier');
    assert.equal(existsSync(env.log), false);

    attached(home);
    const goodId = bind(home, owning, 'roles-session-good');
    const bad = stubEnv(dir, {
      answers: [{ id: 'id', choice: 'nope', confidence: 0.4 }, { id: 'year', status: 'unavailable', reason: 'choice outside the roster' }, { id: 'revenue', choice: 'none', confidence: 0.1 }],
      calibrated: false,
    }, 'bad');
    const failed = ok([
      'roles', '--file', inside, '--owning-root', owning, '--gateway-home', home,
    ], sessionEnv(goodId, bad));
    assert.equal(failed.roles.path, 'builtin');
    assert.equal(failed.roles.reason, 'not-accepted');
    assert.deepEqual(failed.roles.columns, { id: null, year: null, revenue: null });
    assert.equal(existsSync(bad.log), true);
  });

  it('replays a record and makes no call', () => {
    const dir = tempDir();
    const home = tempDir();
    const owning = writeAgents(join(dir, 'root'));
    attached(home);
    const file = writeCsv(owning);
    const env = stubEnv(dir, ANSWER);
    const sessionId = bind(home, owning, 'roles-session-replay');
    const first = ok([
      'roles', '--file', file, '--owning-root', owning, '--gateway-home', home,
    ], sessionEnv(sessionId, env));
    const record = join(dir, 'record.json');
    writeFileSync(record, JSON.stringify(first.roles.record));
    const replayEnv = stubEnv(dir, {
      answers: [{ id: 'revenue', choice: 'flag', confidence: 0.99 }],
      calibrated: false,
    }, 'replay');
    const replayed = ok([
      'roles', '--file', file, '--owning-root', owning, '--gateway-home', home,
      '--classifier-record', record,
    ], replayEnv);
    assert.equal(replayed.roles.path, 'replay');
    assert.deepEqual(replayed.roles.columns, first.roles.columns);
    assert.equal(replayed.roles.record.answer.answers[2].confidence, 0.8);
    assert.equal(existsSync(replayEnv.log), false);

    const other = writeCsv(dir, 'id,revenue\n1,9\n');
    const mismatched = run([
      'roles', '--file', other, '--owning-root', owning, '--gateway-home', home,
      '--classifier-record', record,
    ], replayEnv);
    assert.equal(mismatched.status, 1);
    assert.equal(mismatched.stdout, '');
    assert.match(mismatched.stderr, /does not match this judgment/);
    assert.equal(existsSync(replayEnv.log), false);
  });
});

describe('describe --quantities', () => {
  it('gives each described column figures byte-identical to describe --columns', () => {
    const dir = tempDir();
    const home = tempDir();
    const owning = writeAgents(join(dir, 'root'));
    attached(home);
    const file = writeCsv(owning);
    const env = stubEnv(dir, ANSWER);
    const sessionId = bind(home, owning, 'roles-session-cols');
    const judged = ok([
      'describe', '--file', file, '--quantities', '--owning-root', owning, '--gateway-home', home,
    ], sessionEnv(sessionId, env));
    const names = judged.columns.map((column) => column.name);
    assert.deepEqual(names, ['year', 'revenue']);
    assert.equal(judged.quantities.path, 'classifier');
    assert.equal(judged.quantities.columns.revenue, 'classifier');
    assert.equal(judged.quantities.columns.year, 'builtin');
    assert.equal(judged.quantities.record.answer.answers[2].confidence, 0.8);
    for (const column of judged.columns) {
      const alone = ok(['describe', '--file', file, '--columns', column.name]);
      assert.equal(alone.columns.length, 1);
      assert.equal(JSON.stringify(column), JSON.stringify(alone.columns[0]));
    }
  });

  it('describes every numeric column as today when the classifier does not answer', () => {
    const dir = tempDir();
    const home = tempDir();
    const owning = writeAgents(join(dir, 'root'));
    const file = writeCsv(owning);
    const env = stubEnv(dir, ANSWER);
    const sessionId = bind(home, owning, 'roles-session-quiet');
    const judged = ok([
      'describe', '--file', file, '--quantities', '--owning-root', owning, '--gateway-home', home,
    ], sessionEnv(sessionId, env));
    const plain = ok(['describe', '--file', file]);
    assert.equal(judged.quantities.path, 'builtin');
    assert.equal(judged.quantities.reason, 'no-classifier');
    assert.equal(JSON.stringify(judged.columns), JSON.stringify(plain.columns));
    for (const name of Object.keys(judged.quantities.columns)) {
      assert.equal(judged.quantities.columns[name], 'builtin');
    }
    assert.equal(existsSync(env.log), false);
  });

  it('accepts --quantities without --owning-root, and refuses --columns beside it', () => {
    const dir = tempDir();
    const file = writeCsv(dir);
    const missing = run(['describe', '--file', file, '--quantities']);
    assert.equal(missing.status, 0, missing.stderr);
    assert.equal(JSON.parse(missing.stdout).quantities.reason, 'no-session');
    const both = run([
      'describe', '--file', file, '--quantities', '--owning-root', dir, '--columns', 'revenue',
    ]);
    assert.equal(both.status, 1);
    assert.match(both.stderr, /--columns is not valid with --quantities/);
    const stray = run(['describe', '--file', file, '--owning-root', dir]);
    assert.equal(stray.status, 1);
    assert.match(stray.stderr, /--owning-root is valid only with --quantities/);
  });
});
