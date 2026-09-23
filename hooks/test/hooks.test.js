import { chmodSync, existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, realpathSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { Worker } from 'node:worker_threads';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  finishSession,
  isAncestorPid,
  pruneSessions,
  readBinding,
  sessionsDir,
  verify,
  writePendingSession,
  writeSession,
} from '../lib/binding.mjs';
import { createTestGateway } from '../../gateway/test/fake-provider.js';
import { buildRoster } from '../lib/roster.mjs';
import { classifierRefusalValue, isAttached, isRefused, pidAlive } from '../lib/presence.mjs';
import { formatRoute, isNamedAsk } from '../route.mjs';
import { owningRoot } from '../lib/presence.mjs';

const pluginRoot = fileURLToPath(new URL('../..', import.meta.url));
const SCRIPTS = {
  SessionStart: fileURLToPath(new URL('../session.mjs', import.meta.url)),
  UserPromptSubmit: fileURLToPath(new URL('../route.mjs', import.meta.url)),
};
const SKILL = join(pluginRoot, 'skills', 'Deep Research', 'SKILL.md');

function tempHome() {
  return mkdtempSync(join(tmpdir(), 'wiser-hooks-'));
}

/** A declared owning root at `dir`, unless one is already written there. */
function declareRoot(dir) {
  const file = join(dir, 'AGENTS.md');
  if (!existsSync(file)) writeFileSync(file, '---\nroot: test-root\ntype: personal\n---\n');
}

function gatewayDir(home) {
  return join(home, '.wiser', 'gateway');
}

function writeStatus(home, doc) {
  const dir = join(gatewayDir(home), 'classifier-status');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'claude-code.json'), `${JSON.stringify(doc)}\n`);
}

function attachedDoc(home, pid = process.pid) {
  return {
    attached: true,
    classifier_dirs: [join(home, 'classifier')],
    pid,
    started_at: new Date().toISOString(),
  };
}

function runHook(script, event, { home, cwd, stub, log, timeout = 8000, sessionId, projectDir } = {}) {
  const fromEvent = event && typeof event === 'object' && !Array.isArray(event) ? event.session_id : undefined;
  const sid = fromEvent || sessionId || 'hook-session-1';
  let payload = event;
  if (event && typeof event === 'object' && !Array.isArray(event)) {
    payload = { ...event, session_id: sid };
  }
  const env = { ...process.env, HOME: home, CLAUDE_PID: String(process.pid), CLAUDE_CODE_SESSION_ID: sid };
  delete env.WISER_HOOK_STUB_FILE;
  delete env.WISER_HOOK_STUB_LOG;
  delete env.WISER_CLASSIFIER_KEY;
  delete env.CLAUDE_PROJECT_DIR;
  if (projectDir) env.CLAUDE_PROJECT_DIR = projectDir;
  if (stub) env.WISER_HOOK_STUB_FILE = stub;
  if (log) env.WISER_HOOK_STUB_LOG = log;
  return spawnSync(process.execPath, [script], {
    input: payload === undefined ? '' : (typeof payload === 'string' ? payload : JSON.stringify(payload)),
    encoding: 'utf8',
    env,
    cwd: cwd || home,
    timeout,
  });
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

test('presence is absent, stale, attached, or refused by frontmatter', async () => {
  const home = tempHome();
  assert.equal(isAttached(null), false);
  assert.equal(pidAlive(process.pid), true);

  const stale = await deadPid();
  assert.equal(pidAlive(stale), false);
  assert.equal(isAttached({ attached: true, pid: stale }), false);
  assert.equal(isAttached({ attached: false, pid: process.pid }), false);
  assert.equal(isAttached({ attached: true, pid: process.pid }), true);

  const refused = join(home, 'refused');
  mkdirSync(refused);
  writeFileSync(join(refused, 'AGENTS.md'), '---\nclassifier_refusal: yes\n---\n\n# Root\n');
  assert.equal(isRefused(refused), true);

  const nested = join(home, 'parent', 'child');
  mkdirSync(nested, { recursive: true });
  writeFileSync(join(home, 'parent', 'AGENTS.md'), '---\nclassifier_refusal: yes\n---\n');
  assert.equal(isRefused(nested), true);

  const allowed = join(home, 'allowed');
  mkdirSync(allowed);
  writeFileSync(join(allowed, 'AGENTS.md'), '---\nclassifier_refusal: no\n---\n');
  assert.equal(isRefused(allowed), false);
  assert.equal(classifierRefusalValue('---\nroot: example\n---\n'), undefined);
  assert.equal(isRefused(join(home, 'empty-walk')), false);
});

test('roster rows come from the three family indexes', () => {
  const rows = buildRoster(pluginRoot);
  const families = new Set(rows.map((row) => row.family));
  assert.deepEqual([...families].sort(), ['expert', 'skill', 'tool']);
  assert.ok(rows.length >= 60, `row count ${rows.length}`);
  for (const row of rows) {
    assert.equal(typeof row.name, 'string');
    assert.equal(typeof row.description, 'string');
    assert.equal(row.description.length > 0, true, row.name);
    assert.equal(row.body.length > 0, true, row.name);
    assert.equal(row.body.includes('\n') || row.body.length > 20, true, row.name);
  }
  assert.ok(rows.some((row) => row.family === 'skill' && row.name === 'Deep Research'));
  assert.ok(rows.some((row) => row.family === 'expert' && row.name.length > 0 && !row.name.includes('/')));
  assert.ok(rows.some((row) => row.family === 'tool' && row.name.length > 0 && !row.name.includes('/')));
});

test('hooks.json registers SessionStart and the route hook', () => {
  const doc = JSON.parse(readFileSync(join(pluginRoot, 'hooks', 'hooks.json'), 'utf8'));
  assert.equal(typeof doc.description, 'string');
  assert.deepEqual(Object.keys(doc.hooks).sort(), ['SessionStart', 'UserPromptSubmit']);
  assert.equal(doc.hooks.SessionStart[0].matcher, undefined);
  assert.equal(doc.hooks.SessionStart[0].hooks.length, 1);
  assert.equal(doc.hooks.SessionStart[0].hooks[0].command, 'node "${CLAUDE_PLUGIN_ROOT}/hooks/session.mjs"');
  assert.equal(doc.hooks.SessionStart[0].hooks[0].timeout, 5);
  assert.equal(doc.hooks.UserPromptSubmit[0].hooks.length, 1);
  assert.equal(doc.hooks.UserPromptSubmit[0].hooks[0].command, 'node "${CLAUDE_PLUGIN_ROOT}/hooks/route.mjs"');
  assert.equal(doc.hooks.UserPromptSubmit[0].hooks[0].timeout, 5);
});
test('the route hook prints nothing when the classifier is absent', () => {
  const home = tempHome();
  const cwd = join(home, 'work');
  mkdirSync(cwd);
  declareRoot(cwd);
  const events = {
    UserPromptSubmit: { cwd, prompt: 'draft a research brief' },
  };
  for (const [name, event] of Object.entries(events)) {
    const log = join(home, `${name}.log`);
    const r = runHook(SCRIPTS[name], event, { home, cwd, log, stub: join(home, 'missing-stub.json') });
    assert.equal(r.status, 0, `${name} ${r.stderr}`);
    assert.equal(r.stdout, '', name);
    assert.equal(existsSync(log), false, name);
  }
});

test('a stale pid prints nothing', async () => {
  const home = tempHome();
  const cwd = join(home, 'work');
  mkdirSync(cwd);
  declareRoot(cwd);
  writeStatus(home, attachedDoc(home, await deadPid()));
  const r = runHook(SCRIPTS.UserPromptSubmit, { cwd, prompt: 'draft a research brief' }, { home, cwd });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '');
});

test('a refusing frontmatter prints nothing', () => {
  const home = tempHome();
  const cwd = join(home, 'work');
  mkdirSync(cwd, { recursive: true });
  declareRoot(cwd);
  writeFileSync(join(cwd, 'AGENTS.md'), '---\nroot: test-root\ntype: personal\nclassifier_refusal: yes\n---\n');
  writeStatus(home, { attached: true, classifier_dirs: [join(home, 'classifier')], pid: process.pid, started_at: '2026-09-22T00:00:00.000Z' });
  for (const script of Object.values(SCRIPTS)) {
    const r = runHook(script, {
      cwd,
      prompt: 'draft a research brief',
      tool_input: { file_path: SKILL },
    }, { home, cwd });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, '', script);
  }
});

test('route prints one line for a confident answer and nothing otherwise', () => {
  const home = tempHome();
  const cwd = join(home, 'work');
  mkdirSync(cwd);
  declareRoot(cwd);
  const stub = join(home, 'stub.json');
  const log = join(home, 'calls.log');
  writeFileSync(stub, `${JSON.stringify({
    'wiser.route.roster': { roster_sha256: 'digest-1', accepted: 1, rejected: 0 },
    'wiser.route.ask': { family: 'skill', target: 'Deep Research', confidence: 0.91, pass: true },
  })}\n`);
  writeStatus(home, { attached: true, classifier_dirs: [join(home, 'classifier')], pid: process.pid, started_at: '2026-09-22T00:00:00.000Z' });

  const r = runHook(SCRIPTS.UserPromptSubmit, { cwd, prompt: 'draft a research brief' }, { home, cwd, stub, log });
  assert.equal(r.status, 0, r.stderr);
  const doc = JSON.parse(r.stdout);
  assert.equal(doc.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.equal(
    doc.hookSpecificOutput.additionalContext,
    'WISER routing (classifier): skills/Deep Research/SKILL.md, p=0.91. Load that file unless the request names another, or names an output that file does not yield.',
  );
  const calls = readFileSync(log, 'utf8').trim().split('\n');
  assert.match(calls[0], /^wiser\.route\.roster \d+$/);
  assert.ok(Number(calls[0].split(' ')[1]) >= 60);
  assert.equal(calls[1], 'wiser.route.ask');

  const log2 = join(home, 'calls-2.log');
  const again = runHook(SCRIPTS.UserPromptSubmit, { cwd, user_input: 'map the sources' }, { home, cwd, stub, log: log2 });
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, /p=0\.91/);
  const againCalls = readFileSync(log2, 'utf8').trim().split('\n');
  assert.match(againCalls[0], /^wiser\.route\.roster \d+$/);
  assert.equal(againCalls[1], 'wiser.route.ask');

  const slash = runHook(SCRIPTS.UserPromptSubmit, { cwd, prompt: '/help' }, { home, cwd, stub, log: join(home, 'slash.log') });
  assert.equal(slash.stdout, '');
  assert.equal(slash.status, 0);

  writeFileSync(stub, `${JSON.stringify({
    'wiser.route.roster': { roster_sha256: 'digest-2', accepted: 1, rejected: 0 },
    'wiser.route.ask': { status: 'below_threshold', target: 'Deep Research', p: 0.1 },
  })}\n`);
  const quietLog = join(home, 'quiet.log');
  const quiet = runHook(SCRIPTS.UserPromptSubmit, { cwd, prompt: 'something new' }, {
    home,
    cwd,
    stub,
    log: quietLog,
  });
  assert.equal(quiet.status, 0, quiet.stderr);
  assert.equal(quiet.stdout, '');
  const quietCalls = readFileSync(quietLog, 'utf8').trim().split('\n');
  assert.match(quietCalls[0], /^wiser\.route\.roster \d+$/);
  assert.equal(quietCalls[1], 'wiser.route.ask');
});

test('route stays quiet for a refusal status and does not retry roster_unknown', () => {
  const home = tempHome();
  const cwd = join(home, 'work');
  mkdirSync(cwd);
  declareRoot(cwd);
  writeStatus(home, { attached: true, classifier_dirs: [join(home, 'no-such-classifier')], pid: process.pid, started_at: '2026-09-22T00:00:00.000Z' });
  const stub = join(home, 'stub.json');
  const log = join(home, 'calls.log');
  writeFileSync(stub, `${JSON.stringify({
    'wiser.route.roster': { roster_sha256: 'digest-1', accepted: 1, rejected: 0 },
    'wiser.route.ask': { status: 'needs_subscription' },
  })}\n`);
  const quiet = runHook(SCRIPTS.UserPromptSubmit, { cwd, prompt: 'draft a research brief' }, { home, cwd, stub, log });
  assert.equal(quiet.status, 0, quiet.stderr);
  assert.equal(quiet.stdout, '');

  const home2 = tempHome();
  const cwd2 = join(home2, 'work');
  mkdirSync(cwd2);
  declareRoot(cwd2);
  writeStatus(home2, { attached: true, classifier_dirs: [join(home2, 'no-such-classifier')], pid: process.pid, started_at: '2026-09-22T00:00:00.000Z' });
  const stub2 = join(home2, 'stub.json');
  const log2 = join(home2, 'calls.log');
  writeFileSync(stub2, `${JSON.stringify({
    'wiser.route.roster': { roster_sha256: 'one', accepted: 1, rejected: 0 },
    'wiser.route.ask': { status: 'roster_unknown' },
  })}\n`);
  const retried = runHook(SCRIPTS.UserPromptSubmit, { cwd: cwd2, prompt: 'draft a research brief' }, {
    home: home2,
    cwd: cwd2,
    stub: stub2,
    log: log2,
  });
  assert.equal(retried.status, 0, retried.stderr);
  assert.equal(retried.stdout, '');
  const calls = readFileSync(log2, 'utf8').trim().split('\n').map((line) => line.split(' ')[0]);
  assert.deepEqual(calls, ['wiser.route.roster', 'wiser.route.ask']);
});

test('unexpected input exits 0 with no output', () => {
  const home = tempHome();
  writeStatus(home, { attached: true, classifier_dirs: [join(home, 'classifier')], pid: process.pid, started_at: '2026-09-22T00:00:00.000Z' });
  for (const script of Object.values(SCRIPTS)) {
    const bad = runHook(script, 'not json', { home });
    assert.equal(bad.status, 0, bad.stderr);
    assert.equal(bad.stdout, '');
    const empty = runHook(script, '', { home });
    assert.equal(empty.status, 0);
    assert.equal(empty.stdout, '');
  }
});

test('one hook process routes through the gateway the classifier is holding', () => {
  const home = tempHome();
  const cwd = join(home, 'work');
  mkdirSync(cwd);
  declareRoot(cwd);
  const dir = join(home, 'classifier');
  mkdirSync(dir);
  writeFileSync(join(dir, 'index.mjs'), `
export function createClassifier() {
  const stored = new Map();
  return {
    name: 'direct',
    actions: () => ['wiser.route.roster', 'wiser.route.ask'],
    describe: () => ({ request: {}, answer: {} }),
    async execute(req) {
      const actionId = req && req.actionId;
      const args = (req && req.arguments) || {};
      if (actionId === 'wiser.route.roster') {
        const rows = Array.isArray(args.rows) ? args.rows : [];
        const digest = 'held-' + rows.length;
        stored.set(digest, rows);
        return { roster_sha256: digest, accepted: rows.length, rejected: 0 };
      }
      if (actionId === 'wiser.route.ask') {
        if (!stored.has(args.roster_sha256)) return { status: 'roster_unknown' };
        return { family: 'skill', target: 'Deep Research', confidence: 1, pass: true };
      }
      return { status: 'unavailable', reason: 'unknown action id' };
    },
  };
}
`);
  writeStatus(home, attachedDoc(home));
  const r = runHook(SCRIPTS.UserPromptSubmit, { cwd, prompt: 'draft a research brief' }, { home, cwd, timeout: 20000 });
  assert.equal(r.status, 0, r.stderr);
  const doc = JSON.parse(r.stdout);
  assert.equal(
    doc.hookSpecificOutput.additionalContext,
    'WISER routing (classifier): skills/Deep Research/SKILL.md, p=1. Load that file unless the request names another, or names an output that file does not yield.',
  );
  const audit = readFileSync(join(gatewayDir(home), 'audit.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(audit.map((line) => line.action), ['wiser.route.roster', 'wiser.route.ask']);
  assert.equal(audit[1].status, 'ok');
  const presence = JSON.parse(readFileSync(join(gatewayDir(home), 'classifier-status', 'claude-code.json'), 'utf8'));
  assert.equal(presence.pid, process.pid);
});

test('formatRoute keeps a target without a status and drops a refusal', () => {
  assert.equal(
    formatRoute({ family: 'skill', target: 'Deep Research', confidence: 0.91, pass: true }),
    'WISER routing (classifier): skills/Deep Research/SKILL.md, p=0.91. Load that file unless the request names another, or names an output that file does not yield.',
  );
  assert.equal(formatRoute({ status: 'below_threshold', target: 'Deep Research', confidence: 0.1 }), null);
  assert.equal(formatRoute({ target: null, confidence: null, pass: false }), null);
  assert.equal(formatRoute({ status: 'needs_subscription' }), null);
});

test('owning root: the nearest declared root, or none', () => {
  const home = tempHome();
  const ws = join(home, 'workspace');
  const child = join(ws, 'client-a', 'work', 'job');
  mkdirSync(child, { recursive: true });
  writeFileSync(join(ws, 'client-a', 'AGENTS.md'), '---\nroot: client-a\ntype: client\nclassifier_refusal: no\n---\n');
  assert.equal(owningRoot(child), realpathSync(join(ws, 'client-a')));
  assert.equal(owningRoot(ws), null);
  writeFileSync(join(ws, 'AGENTS.md'), '# A workspace router with no frontmatter\n');
  assert.equal(owningRoot(ws), null);
});

test('route sends nothing from a parent workspace, where the owning root is unknown', () => {
  const home = tempHome();
  const ws = join(home, 'workspace');
  mkdirSync(join(ws, 'refusing-root'), { recursive: true });
  writeFileSync(join(ws, 'refusing-root', 'AGENTS.md'), '---\nroot: refusing-root\ntype: client\nclassifier_refusal: yes\n---\n');
  const stub = join(home, 'stub.json');
  const log = join(home, 'calls.log');
  writeFileSync(stub, `${JSON.stringify({
    'wiser.route.roster': { roster_sha256: 'd', accepted: 1, rejected: 0 },
    'wiser.route.ask': { family: 'skill', target: 'Deep Research', confidence: 0.91, pass: true },
  })}\n`);
  writeStatus(home, { attached: true, classifier_dirs: [join(home, 'classifier')], pid: process.pid, started_at: '2026-09-23T00:00:00.000Z' });
  const r = runHook(SCRIPTS.UserPromptSubmit, { cwd: ws, prompt: 'draft a research brief for refusing-root' }, { home, cwd: ws, stub, log });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '');
  assert.equal(existsSync(log), false);
});

test('formatRoute drops an answer that is not a confident, roster-valid route', () => {
  const rows = [{ family: 'skill', name: 'Deep Research' }];
  assert.match(formatRoute({ family: 'skill', target: 'Deep Research', confidence: 0.91, pass: true }, rows), /Deep Research/);
  assert.equal(formatRoute({ family: 'skill', target: 'Deep Research', confidence: 0.91, pass: false }, rows), null);
  assert.equal(formatRoute({ family: 'skill', target: 'Deep Research', confidence: 0.91 }, rows), null);
  assert.equal(formatRoute({ family: 'skill', target: 'Deep Research', confidence: 0, pass: true }, rows), null);
  assert.equal(formatRoute({ family: 'skill', target: 'Not A Skill', confidence: 0.91, pass: true }, rows), null);
  assert.equal(formatRoute({ family: 'widget', target: 'Deep Research', confidence: 0.91, pass: true }), null);
});

test('round 2: a container declaring root:, a symlink to a refusing root, a blank type, and the plugin itself own nothing or refuse', () => {
  const home = tempHome();
  const ws = join(home, 'container');
  mkdirSync(join(ws, 'child'), { recursive: true });
  writeFileSync(join(ws, 'AGENTS.md'), '---\nroot: container\n---\n');
  writeFileSync(join(ws, 'child', 'AGENTS.md'), '---\nroot: child\ntype: client\nclassifier_refusal: yes\n---\n');
  assert.equal(owningRoot(ws), null);

  const link = join(home, 'link-to-child');
  symlinkSync(join(ws, 'child'), link);
  const stub = join(home, 'stub.json');
  writeFileSync(stub, `${JSON.stringify({
    'wiser.route.roster': { roster_sha256: 'd', accepted: 1, rejected: 0 },
    'wiser.route.ask': { family: 'skill', target: 'Deep Research', confidence: 0.91, pass: true },
  })}\n`);
  writeStatus(home, { attached: true, classifier_dirs: [join(home, 'classifier')], pid: process.pid, started_at: '2026-09-23T00:00:00.000Z' });
  for (const cwd of [ws, link]) {
    const log = join(home, `calls-${cwd === ws ? 'ws' : 'link'}.log`);
    const r = runHook(SCRIPTS.UserPromptSubmit, { cwd, prompt: 'draft a research brief' }, { home, cwd, stub, log });
    assert.equal(r.stdout, '', cwd);
    assert.equal(existsSync(log), false, cwd);
  }

  const blank = join(home, 'blank');
  mkdirSync(blank);
  writeFileSync(join(blank, 'AGENTS.md'), '---\nroot: blank\ntype: "   "\n---\n');
  assert.equal(owningRoot(blank), null);
  assert.equal(owningRoot(pluginRoot), null);
});

test('named asks are not sent, and a tool answer is not a route', () => {
  for (const ask of ['update root', 'Update this root.', 'wrap up', 'set up connectors', 'install connectors', '"check root"']) {
    assert.equal(isNamedAsk(ask), true, ask);
  }
  assert.equal(isNamedAsk('update the root page copy for the launch'), false);
  assert.equal(isNamedAsk('Update root for this client'), true);
  assert.equal(isNamedAsk('set up connectors on this machine'), true);
  assert.equal(isNamedAsk('wrap-up notes for the board'), false);
  const home = tempHome();
  const cwd = join(home, 'work');
  mkdirSync(cwd);
  declareRoot(cwd);
  const stub = join(home, 'stub.json');
  const log = join(home, 'calls.log');
  writeFileSync(stub, `${JSON.stringify({
    'wiser.route.roster': { roster_sha256: 'd', accepted: 1, rejected: 0 },
    'wiser.route.ask': { family: 'skill', target: 'Housekeeping', confidence: 1, pass: true },
  })}\n`);
  writeStatus(home, attachedDoc(home));
  const r = runHook(SCRIPTS.UserPromptSubmit, { cwd, prompt: 'update root' }, { home, cwd, stub, log });
  assert.equal(r.stdout, '');
  assert.equal(existsSync(log), false);
  const rows = [{ family: 'tool', name: 'data' }];
  assert.equal(formatRoute({ family: 'tool', target: 'data', confidence: 0.95, pass: true }, rows), null);
});

function sessionNames(home) {
  const dir = join(gatewayDir(home), 'classifier-sessions');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => !name.startsWith('.'));
}

function typedRoot(dir, extra = '') {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'AGENTS.md'), `---\ntype: personal\n${extra}---\n\n# Root\n`);
  return dir;
}

const ASK = fileURLToPath(new URL('../../tools/lib/classifier/ask.mjs', import.meta.url));

function askAt(home, sessionId, { log, material } = {}) {
  const env = { ...process.env, HOME: home };
  delete env.WISER_HOOK_STUB_FILE;
  delete env.WISER_HOOK_STUB_LOG;
  delete env.CLAUDE_PID;
  delete env.CLAUDE_CODE_SESSION_ID;
  delete env.CLAUDE_PROJECT_DIR;
  const stub = join(home, 'ask-stub.json');
  if (!existsSync(stub)) {
    writeFileSync(stub, JSON.stringify({ 'wiser.recall.rank': { ranked: [{ id: 'p', p: 0.5, calibrated: false }], calibrated: false } }));
  }
  env.WISER_HOOK_STUB_FILE = stub;
  if (log) env.WISER_HOOK_STUB_LOG = log;
  if (sessionId) {
    env.CLAUDE_PID = String(process.pid);
    env.CLAUDE_CODE_SESSION_ID = sessionId;
  }
  const args = [ASK, '--action', 'wiser.recall.rank', '--gateway-home', gatewayDir(home), '--input', '{}'];
  if (material) args.push('--material', material);
  const run = spawnSync(process.execPath, args, { encoding: 'utf8', env });
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout);
}

test('no presence file: neither hook writes under classifier-sessions', () => {
  const home = tempHome();
  const cwd = join(home, 'work');
  typedRoot(cwd);
  for (const script of Object.values(SCRIPTS)) {
    const r = runHook(script, { cwd, prompt: 'draft a research brief', session_id: 'session-nopresence', source: 'startup' }, { home, cwd });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, '');
  }
  assert.deepEqual(sessionNames(home), []);
});

test('a presence file is enough to write the binding and then the pointer', () => {
  const home = tempHome();
  const cwd = join(home, 'work');
  typedRoot(cwd);
  writeStatus(home, { attached: false, classifier_dirs: [], pid: process.pid, started_at: '2026-09-23T00:00:00.000Z' });
  const r = runHook(SCRIPTS.SessionStart, {
    cwd, session_id: 'session-unattached', source: 'startup', hook_event_name: 'SessionStart',
  }, { home, cwd });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '');
  const names = sessionNames(home);
  assert.ok(names.includes('session-unattached.json'), names.join(','));
  assert.ok(names.includes(`current-${process.pid}.json`), names.join(','));
  const binding = readBinding(gatewayDir(home), 'session-unattached');
  assert.equal(binding.refused, false);
  assert.equal(binding.owning_root, realpathSync(cwd));
  const verified = verify({ home: gatewayDir(home), harnessPid: process.pid, sessionId: 'session-unattached' });
  assert.equal(verified.ok, true);
  const route = runHook(SCRIPTS.UserPromptSubmit, { cwd, prompt: 'draft a research brief' }, {
    home, cwd, sessionId: 'session-unattached', stub: join(home, 'absent-stub.json'), log: join(home, 'absent.log'),
  });
  assert.equal(route.stdout, '');
  assert.equal(existsSync(join(home, 'absent.log')), false);
});

test('a refusing descendant two levels down refuses the binding, and a dot directory does not', () => {
  const home = tempHome();
  const root = typedRoot(join(home, 'root'));
  mkdirSync(join(root, 'a', 'b'), { recursive: true });
  writeFileSync(join(root, 'a', 'b', 'AGENTS.md'), '---\nclassifier_refusal: yes\n---\n');
  mkdirSync(join(root, '.hidden'));
  writeFileSync(join(root, '.hidden', 'AGENTS.md'), '---\nclassifier_refusal: yes\n---\n');
  writeStatus(home, attachedDoc(home));
  const stub = join(home, 'stub.json');
  const log = join(home, 'calls.log');
  writeFileSync(stub, '{"wiser.route.ask":{"family":"skill","target":"Deep Research","confidence":1,"pass":true}}\n');
  writeFileSync(log, '');
  const r = runHook(SCRIPTS.UserPromptSubmit, { cwd: root, prompt: 'draft a research brief', session_id: 'session-descendant' }, {
    home, cwd: root, stub, log,
  });
  assert.equal(r.stdout, '');
  const calls = readFileSync(log, 'utf8').split('\n').filter((line) => line.trim().length > 0);
  assert.equal(calls.length, 0);
  const binding = readBinding(gatewayDir(home), 'session-descendant');
  assert.equal(binding.refused, true);
  assert.equal(binding.refused_by, 'descendant');

  const onlyDot = typedRoot(join(home, 'dots'));
  mkdirSync(join(onlyDot, '.hidden'));
  writeFileSync(join(onlyDot, '.hidden', 'AGENTS.md'), '---\nclassifier_refusal: yes\n---\n');
  const hidden = writeSession({
    home: gatewayDir(home),
    sessionId: 'session-dotskip1',
    harnessPid: process.pid,
    cwd: onlyDot,
    homeDir: home,
    argsReader: () => '',
  });
  assert.equal(hidden.binding.refused, false);
});

test('an added directory that refuses, several roots, and the scan cap', () => {
  const home = tempHome();
  const gw = gatewayDir(home);
  const good = typedRoot(join(home, 'good'));
  const other = typedRoot(join(home, 'other'));
  const refused = typedRoot(join(home, 'refused'), 'classifier_refusal: yes\n');
  const several = writeSession({
    home: gw,
    sessionId: 'session-several',
    harnessPid: process.pid,
    cwd: good,
    homeDir: home,
    argsReader: () => `node --add-dir ${other}`,
  });
  assert.equal(several.ok, true);
  assert.equal(several.binding.owning_root, null);
  assert.equal(several.binding.refused, false);
  assert.deepEqual(several.binding.roots, [realpathSync(good), realpathSync(other)].sort());

  const added = writeSession({
    home: gw,
    sessionId: 'session-added',
    harnessPid: process.pid,
    cwd: good,
    homeDir: home,
    argsReader: () => `node --add-dir=${refused}`,
  });
  assert.equal(added.binding.refused, true);
  assert.equal(added.binding.refused_by, 'at-or-above');

  mkdirSync(join(good, 'child'));
  const capped = writeSession({
    home: gw,
    sessionId: 'session-capped1',
    harnessPid: process.pid,
    cwd: good,
    homeDir: home,
    argsReader: () => '',
    scanLimit: 1,
  });
  assert.equal(capped.binding.refused, true);
  assert.equal(capped.binding.refused_by, 'scan-cap');
});

test('a pointer whose start time is not the live reading does not verify', () => {
  const home = tempHome();
  const root = typedRoot(join(home, 'root'));
  const recorded = writeSession({
    home: gatewayDir(home),
    sessionId: 'session-reusedpid',
    harnessPid: process.pid,
    cwd: root,
    homeDir: home,
    harnessStartedReader: () => 'not-the-live-start',
  });
  assert.equal(recorded.ok, true);
  const checked = verify({ home: gatewayDir(home), harnessPid: process.pid, sessionId: 'session-reusedpid' });
  assert.equal(checked.ok, false);
  assert.ok(checked.reason === 'stale-session' || checked.reason === 'unverifiable', checked.reason);
});

test('a mismatched CLAUDE_PID writes nothing', () => {
  const home = tempHome();
  const cwd = join(home, 'work');
  typedRoot(cwd);
  writeStatus(home, attachedDoc(home));
  const env = { ...process.env, HOME: home, CLAUDE_PID: '999999', CLAUDE_CODE_SESSION_ID: 'session-mismatch' };
  const r = spawnSync(process.execPath, [SCRIPTS.SessionStart], {
    input: JSON.stringify({ cwd, session_id: 'session-mismatch', source: 'startup' }),
    encoding: 'utf8',
    env,
  });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(sessionNames(home), []);
});

test('prune drops a dead harness and a binding older than seven days', async () => {
  const home = tempHome();
  const root = typedRoot(join(home, 'root'));
  const gw = gatewayDir(home);
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  await new Promise((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', reject);
  });
  writeSession({
    home: gw,
    sessionId: 'session-deadpid1',
    harnessPid: child.pid,
    cwd: root,
    homeDir: home,
  });
  child.kill('SIGKILL');
  await new Promise((resolve) => child.once('exit', resolve));
  const old = writeSession({
    home: gw,
    sessionId: 'session-oldbind1',
    harnessPid: process.pid,
    cwd: root,
    homeDir: home,
  });
  assert.equal(old.ok, true);
  const file = join(sessionsDir(gw), 'session-oldbind1.json');
  const doc = JSON.parse(readFileSync(file, 'utf8'));
  doc.written_at = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
  writeFileSync(file, `${JSON.stringify(doc)}\n`);
  pruneSessions(gw);
  assert.equal(readBinding(gw, 'session-deadpid1'), null);
  assert.equal(existsSync(join(sessionsDir(gw), `current-${child.pid}.json`)), false);
  assert.equal(readBinding(gw, 'session-oldbind1'), null);
  assert.equal(existsSync(join(sessionsDir(gw), `current-${process.pid}.json`)), true);
});

test('/clear moves the pointer, and the other direction sends only after it', async () => {
  const home = tempHome();
  const open = typedRoot(join(home, 'open'));
  const shut = typedRoot(join(home, 'shut'), 'classifier_refusal: yes\n');
  writeStatus(home, attachedDoc(home));
  const stub = join(home, 'ask-stub.json');
  writeFileSync(stub, JSON.stringify({
    'wiser.recall.rank': { ranked: [{ id: 'p', p: 0.5, calibrated: false }], calibrated: false },
  }));

  const note = join(open, 'note.txt');
  writeFileSync(note, 'n');
  const started = runHook(SCRIPTS.SessionStart, {
    cwd: open, session_id: 'session-s1-clear', source: 'startup',
  }, { home, cwd: open });
  assert.equal(started.status, 0, started.stderr);
  const before = askAt(home, 'session-s1-clear', { log: join(home, 'before.log'), material: note });
  assert.equal(before.path, 'classifier');

  const cleared = runHook(SCRIPTS.SessionStart, {
    cwd: shut, session_id: 'session-s3-clear', source: 'clear',
  }, { home, cwd: shut, sessionId: 'session-s3-clear' });
  assert.equal(cleared.status, 0, cleared.stderr);
  const pointer = JSON.parse(readFileSync(join(sessionsDir(gatewayDir(home)), `current-${process.pid}.json`), 'utf8'));
  assert.equal(pointer.session_id, 'session-s3-clear');
  assert.equal(readBinding(gatewayDir(home), 'session-s3-clear').refused_by, 'at-or-above');

  const stale = askAt(home, 'session-s1-clear', { log: join(home, 'stale.log') });
  assert.equal(stale.reason, 'stale-session');
  const none = askAt(home, null, { log: join(home, 'none.log') });
  assert.equal(none.reason, 'no-session');
  const refused = askAt(home, 'session-s3-clear', { log: join(home, 'refused.log') });
  assert.equal(refused.reason, 'refused');
  assert.equal(existsSync(join(home, 'stale.log')), false);
  assert.equal(existsSync(join(home, 'refused.log')), false);

  const calls = [];
  const { gw } = await createTestGateway({
    home: gatewayDir(home),
    connectors: [],
    session: false,
    classifierIdentity: () => ({ harnessPid: process.pid, sessionId: null }),
    classifier: {
      name: 'direct',
      actions: () => ['wiser.decide.choice'],
      describe() { return {}; },
      async execute(req) { calls.push(req); return { choice: 'x', confidence: 1, calibrated: false }; },
    },
  });
  const searched = await gw.searchActions({ query: 'item' });
  assert.equal(searched.classifier.reason, 'refused');
  const executed = await gw.execute({
    action: 'wiser.decide.choice',
    input: { decision: 'item', options: ['x'], allow_uncalibrated: true },
  });
  assert.equal(executed.status, 'classifier_unbound');
  assert.equal(executed.reason, 'refused');
  assert.equal(calls.length, 0);

  const home2 = tempHome();
  const open2 = typedRoot(join(home2, 'open'));
  const shut2 = typedRoot(join(home2, 'shut'), 'classifier_refusal: yes\n');
  writeStatus(home2, attachedDoc(home2));
  runHook(SCRIPTS.SessionStart, { cwd: shut2, session_id: 'session-s1-other', source: 'startup' }, { home: home2, cwd: shut2 });
  const early = askAt(home2, 'session-s1-other', { log: join(home2, 'early.log') });
  assert.equal(early.reason, 'refused');
  const calls2 = [];
  const { gw: gw2 } = await createTestGateway({
    home: gatewayDir(home2),
    connectors: [],
    session: false,
    classifierIdentity: () => ({ harnessPid: process.pid, sessionId: null }),
    classifier: {
      name: 'direct',
      actions: () => ['wiser.decide.choice'],
      describe() { return {}; },
      async execute(req) { calls2.push(req); return { choice: 'x', confidence: 1, calibrated: false }; },
    },
  });
  const blocked = await gw2.execute({
    action: 'wiser.decide.choice',
    input: { decision: 'item', options: ['x'], allow_uncalibrated: true },
  });
  assert.equal(blocked.status, 'classifier_unbound');
  assert.equal(calls2.length, 0);

  const note2 = join(open2, 'note.txt');
  writeFileSync(note2, 'n');
  runHook(SCRIPTS.SessionStart, {
    cwd: open2, session_id: 'session-s3-other', source: 'clear',
  }, { home: home2, cwd: open2, sessionId: 'session-s3-other' });
  const later = askAt(home2, 'session-s3-other', { log: join(home2, 'later.log'), material: note2 });
  assert.equal(later.path, 'classifier');
  assert.equal(readFileSync(join(home2, 'later.log'), 'utf8').trim(), 'wiser.recall.rank');
  const sent = await gw2.execute({
    action: 'wiser.decide.choice',
    input: { decision: 'item', options: ['x'], allow_uncalibrated: true },
  });
  assert.equal(sent.status, undefined);
  assert.equal(calls2.length, 1);
});

test('isAncestorPid walks parents, stops at pid 1, and caps the walk', () => {
  const parents = new Map([[10, 9], [9, 8], [8, 1]]);
  const reader = (pid) => (parents.has(pid) ? parents.get(pid) : null);
  assert.equal(isAncestorPid(10, { start: 10, reader }), true);
  assert.equal(isAncestorPid(8, { start: 10, reader }), true);
  assert.equal(isAncestorPid(1, { start: 10, reader }), true);
  assert.equal(isAncestorPid(7, { start: 10, reader }), false);
  const chain = new Map();
  for (let i = 2; i <= 40; i += 1) chain.set(i, i - 1);
  assert.equal(isAncestorPid(1, { start: 40, reader: (pid) => chain.get(pid) ?? null }), false);
});

test('a pending binding leaves ask and the gateway silent', async () => {
  const home = tempHome();
  const root = typedRoot(join(home, 'root'));
  const note = join(root, 'note.txt');
  writeFileSync(note, 'n');
  const gwHome = gatewayDir(home);
  writeStatus(home, attachedDoc(home));
  const pending = writePendingSession({
    home: gwHome,
    sessionId: 'session-pending1',
    harnessPid: process.pid,
    cwd: root,
    homeDir: home,
  });
  assert.equal(pending.ok, true, JSON.stringify(pending));
  const verified = verify({ home: gwHome, harnessPid: process.pid, sessionId: 'session-pending1' });
  assert.equal(verified.reason, 'pending');
  const asked = askAt(home, 'session-pending1', { log: join(home, 'pending.log'), material: note });
  assert.equal(asked.reason, 'pending');
  assert.equal(existsSync(join(home, 'pending.log')), false);

  const calls = [];
  const { gw } = await createTestGateway({
    home: gwHome,
    connectors: [],
    session: false,
    classifierIdentity: () => ({ harnessPid: process.pid, sessionId: null }),
    classifier: {
      name: 'direct',
      actions: () => ['wiser.decide.choice'],
      describe() { return {}; },
      async execute(req) { calls.push(req); return { choice: 'x', confidence: 1, calibrated: false }; },
    },
  });
  const searched = await gw.searchActions({ query: 'item' });
  assert.equal(searched.classifier.reason, 'pending');
  const executed = await gw.execute({
    action: 'wiser.decide.choice',
    input: { decision: 'item', options: ['x'], allow_uncalibrated: true },
  });
  assert.equal(executed.status, 'classifier_unbound');
  assert.equal(executed.reason, 'pending');
  assert.equal(calls.length, 0);
});

test('an older hook does not move the pointer, and a stale final write does not either', () => {
  const home = tempHome();
  const root = typedRoot(join(home, 'root'));
  const gw = gatewayDir(home);
  const newer = writeSession({
    home: gw,
    sessionId: 'session-newer01',
    harnessPid: process.pid,
    cwd: root,
    homeDir: home,
    hookStartedMs: 5000,
    argsReader: () => '',
  });
  assert.equal(newer.ok, true, JSON.stringify(newer));
  const older = writeSession({
    home: gw,
    sessionId: 'session-older001',
    harnessPid: process.pid,
    cwd: root,
    homeDir: home,
    hookStartedMs: 1000,
    argsReader: () => '',
  });
  assert.equal(older.lost, true);
  const pointer = JSON.parse(readFileSync(join(sessionsDir(gw), `current-${process.pid}.json`), 'utf8'));
  assert.equal(pointer.session_id, 'session-newer01');
  assert.equal(pointer.hook_started_ms, 5000);

  const begun = writePendingSession({
    home: gw,
    sessionId: 'session-stale001',
    harnessPid: process.pid,
    cwd: root,
    homeDir: home,
    hookStartedMs: 1500,
  });
  assert.equal(begun.lost, true);
  const still = JSON.parse(readFileSync(join(sessionsDir(gw), `current-${process.pid}.json`), 'utf8'));
  assert.equal(still.session_id, 'session-newer01');

  const freshHome = tempHome();
  const freshRoot = typedRoot(join(freshHome, 'root'));
  const freshGw = gatewayDir(freshHome);
  const started = writePendingSession({
    home: freshGw,
    sessionId: 'session-stale001',
    harnessPid: process.pid,
    cwd: freshRoot,
    homeDir: freshHome,
    hookStartedMs: 1000,
  });
  assert.equal(started.ok, true, JSON.stringify(started));
  const fresh = writeSession({
    home: freshGw,
    sessionId: 'session-fresh001',
    harnessPid: process.pid,
    cwd: freshRoot,
    homeDir: freshHome,
    hookStartedMs: 4000,
    argsReader: () => '',
  });
  assert.equal(fresh.ok, true, JSON.stringify(fresh));
  const finished = finishSession({
    home: freshGw,
    sessionId: 'session-stale001',
    harnessPid: process.pid,
    cwd: freshRoot,
    homeDir: freshHome,
    hookStartedMs: 1000,
    previous: started.previous,
    argsReader: () => '',
  });
  assert.equal(finished.lost, true);
  const after = JSON.parse(readFileSync(join(sessionsDir(freshGw), `current-${process.pid}.json`), 'utf8'));
  assert.equal(after.session_id, 'session-fresh001');
  assert.equal(after.hook_started_ms, 4000);
  assert.equal(readBinding(freshGw, 'session-stale001').pending, true);
});

test('a relative add-dir is composed, a missing one refuses, and project settings apply above a nested cwd', () => {
  const home = tempHome();
  const gw = gatewayDir(home);
  const good = typedRoot(join(home, 'good'));
  const extra = typedRoot(join(good, 'extra'));
  const spaced = typedRoot(join(good, 'my extra'));
  const relative = writeSession({
    home: gw,
    sessionId: 'session-reladd01',
    harnessPid: process.pid,
    cwd: good,
    homeDir: home,
    argsReader: () => 'node --add-dir extra',
  });
  assert.equal(relative.ok, true, JSON.stringify(relative));
  assert.ok(relative.binding.roots.includes(realpathSync(extra)), relative.binding.roots.join(','));
  assert.equal(relative.binding.refused, false);

  const withSpace = writeSession({
    home: gw,
    sessionId: 'session-spaceadd',
    harnessPid: process.pid,
    cwd: good,
    homeDir: home,
    argsReader: () => 'node --add-dir my extra',
  });
  assert.equal(withSpace.ok, true, JSON.stringify(withSpace));
  assert.ok(withSpace.binding.roots.includes(realpathSync(spaced)), withSpace.binding.roots.join(','));

  const missing = writeSession({
    home: gw,
    sessionId: 'session-missadd1',
    harnessPid: process.pid,
    cwd: good,
    homeDir: home,
    argsReader: () => 'node --add-dir no-such-dir',
  });
  assert.equal(missing.ok, true, JSON.stringify(missing));
  assert.equal(missing.binding.refused, true);
  assert.equal(missing.binding.refused_by, 'unresolved-add-dir');

  const absent = join(home, 'nowhere');
  const absolute = writeSession({
    home: gw,
    sessionId: 'session-absmiss1',
    harnessPid: process.pid,
    cwd: good,
    homeDir: home,
    argsReader: () => `node --add-dir ${absent}`,
  });
  assert.equal(absolute.binding.refused, true);
  assert.equal(absolute.binding.refused_by, 'unresolved-add-dir');

  const project = typedRoot(join(home, 'project'));
  const nested = join(project, 'src', 'app');
  mkdirSync(nested, { recursive: true });
  const other = typedRoot(join(home, 'other-root'));
  mkdirSync(join(project, '.claude'), { recursive: true });
  writeFileSync(join(project, '.claude', 'settings.json'), `${JSON.stringify({
    permissions: { additionalDirectories: [other] },
  })}\n`);
  writeStatus(home, attachedDoc(home));
  const hooked = runHook(SCRIPTS.SessionStart, {
    cwd: nested, session_id: 'session-projhook', source: 'startup',
  }, { home, cwd: nested, projectDir: project });
  assert.equal(hooked.status, 0, hooked.stderr);
  const binding = readBinding(gw, 'session-projhook');
  assert.ok(binding, 'project-dir hook wrote no binding');
  assert.ok(binding.roots.includes(realpathSync(project)), binding.roots.join(','));
  assert.ok(binding.roots.includes(realpathSync(other)), binding.roots.join(','));
});

test('a stale harness lock is removed and the removal is reported', () => {
  const home = tempHome();
  const root = typedRoot(join(home, 'root'));
  const gw = gatewayDir(home);
  const lock = join(sessionsDir(gw), `lock-${process.pid}`);
  mkdirSync(lock, { recursive: true });
  const past = new Date(Date.now() - 11_000);
  utimesSync(lock, past, past);
  const recorded = writeSession({
    home: gw,
    sessionId: 'session-stalelock',
    harnessPid: process.pid,
    cwd: root,
    homeDir: home,
    argsReader: () => '',
  });
  assert.equal(recorded.ok, true, JSON.stringify(recorded));
  assert.equal(recorded.staleLockRemoved, true);
  assert.equal(existsSync(lock), false);
});

test('the pending pointer is written before ps, and a stop on either side of that write fails closed', () => {
  const home = tempHome();
  const root = typedRoot(join(home, 'root'));
  const gw = gatewayDir(home);
  const kept = writeSession({
    home: gw,
    sessionId: 'session-kept0001',
    harnessPid: process.pid,
    cwd: root,
    homeDir: home,
    hookStartedMs: 1000,
    argsReader: () => '',
  });
  assert.equal(kept.ok, true, JSON.stringify(kept));
  assert.throws(() => writePendingSession({
    home: gw,
    sessionId: 'session-stopbef',
    harnessPid: process.pid,
    cwd: root,
    hookStartedMs: 2000,
    beforeWrite() { throw new Error('stop before the pointer'); },
  }), /stop before/);
  const untouched = JSON.parse(readFileSync(join(sessionsDir(gw), `current-${process.pid}.json`), 'utf8'));
  assert.equal(untouched.session_id, 'session-kept0001');
  assert.equal(untouched.pending, false);
  assert.equal(verify({ home: gw, harnessPid: process.pid, sessionId: 'session-kept0001' }).ok, true);

  assert.throws(() => writePendingSession({
    home: gw,
    sessionId: 'session-stopaft',
    harnessPid: process.pid,
    cwd: root,
    hookStartedMs: 3000,
    whileLocked() { throw new Error('stop after the pointer'); },
  }), /stop after/);
  const parked = JSON.parse(readFileSync(join(sessionsDir(gw), `current-${process.pid}.json`), 'utf8'));
  assert.equal(parked.session_id, 'session-stopaft');
  assert.equal(parked.pending, true);
  assert.equal(parked.harness_started, undefined);
  assert.equal(verify({ home: gw, harnessPid: process.pid, sessionId: 'session-stopaft' }).reason, 'pending');
  assert.equal(verify({ home: gw, harnessPid: process.pid, sessionId: 'session-kept0001' }).reason, 'stale-session');

  let sawPending = false;
  let startedReads = 0;
  const finished = writeSession({
    home: gw,
    sessionId: 'session-pslater1',
    harnessPid: process.pid,
    cwd: root,
    homeDir: home,
    hookStartedMs: 4000,
    argsReader: () => '',
    harnessStartedReader() {
      startedReads += 1;
      if (startedReads === 1) {
        const pointer = JSON.parse(readFileSync(join(sessionsDir(gw), `current-${process.pid}.json`), 'utf8'));
        assert.equal(pointer.pending, true);
        assert.equal(pointer.session_id, 'session-pslater1');
        assert.equal(pointer.harness_started, undefined);
        sawPending = true;
      }
      return 'ps-after-pending';
    },
  });
  assert.equal(sawPending, true);
  assert.equal(finished.ok, true, JSON.stringify(finished));
  assert.equal(finished.binding.pending, false);
  assert.equal(finished.binding.harness_started, 'ps-after-pending');
  const finalPointer = JSON.parse(readFileSync(join(sessionsDir(gw), `current-${process.pid}.json`), 'utf8'));
  assert.equal(finalPointer.generation, finished.binding.generation);
  assert.equal(finalPointer.hook_started_ms, finished.binding.hook_started_ms);
});

test('equal timestamps with different sessions fail closed, and the same session does not', () => {
  const home = tempHome();
  const root = typedRoot(join(home, 'root'));
  const gw = gatewayDir(home);
  const first = writePendingSession({
    home: gw,
    sessionId: 'session-sametie1',
    harnessPid: process.pid,
    cwd: root,
    hookStartedMs: 3000,
  });
  assert.equal(first.ok, true, JSON.stringify(first));
  const again = writePendingSession({
    home: gw,
    sessionId: 'session-sametie1',
    harnessPid: process.pid,
    cwd: root,
    hookStartedMs: 3000,
  });
  assert.equal(again.ok, true, JSON.stringify(again));
  assert.equal(again.generation, first.generation + 1);

  const other = writePendingSession({
    home: gw,
    sessionId: 'session-othertie',
    harnessPid: process.pid,
    cwd: root,
    hookStartedMs: 3000,
  });
  assert.equal(other.ok, false, JSON.stringify(other));
  assert.equal(other.reason, 'tie');
  const pointer = JSON.parse(readFileSync(join(sessionsDir(gw), `current-${process.pid}.json`), 'utf8'));
  assert.equal(pointer.pending, true);
  assert.equal(pointer.session_id, 'session-othertie');
  assert.equal(pointer.hook_started_ms, 3000);
  assert.equal(verify({ home: gw, harnessPid: process.pid, sessionId: 'session-sametie1' }).reason, 'stale-session');
  assert.equal(verify({ home: gw, harnessPid: process.pid, sessionId: 'session-othertie' }).reason, 'pending');
});

test('a backward clock step does not replace a newer pointer', () => {
  const home = tempHome();
  const root = typedRoot(join(home, 'root'));
  const gw = gatewayDir(home);
  const forward = writeSession({
    home: gw,
    sessionId: 'session-clocknew',
    harnessPid: process.pid,
    cwd: root,
    homeDir: home,
    hookStartedMs: 8000,
    argsReader: () => '',
  });
  assert.equal(forward.ok, true, JSON.stringify(forward));
  const back = writeSession({
    home: gw,
    sessionId: 'session-clockold',
    harnessPid: process.pid,
    cwd: root,
    homeDir: home,
    hookStartedMs: 1000,
    argsReader: () => '',
  });
  assert.equal(back.lost, true);
  const pointer = JSON.parse(readFileSync(join(sessionsDir(gw), `current-${process.pid}.json`), 'utf8'));
  assert.equal(pointer.session_id, 'session-clocknew');
  assert.equal(pointer.hook_started_ms, 8000);
  assert.equal(verify({ home: gw, harnessPid: process.pid, sessionId: 'session-clocknew' }).ok, true);
  assert.equal(verify({ home: gw, harnessPid: process.pid, sessionId: 'session-clockold' }).reason, 'stale-session');
});

test('a pointer moved between verify reads is stale', () => {
  const home = tempHome();
  const root = typedRoot(join(home, 'root'));
  const gw = gatewayDir(home);
  const recorded = writeSession({
    home: gw,
    sessionId: 'session-movedsrc',
    harnessPid: process.pid,
    cwd: root,
    homeDir: home,
    argsReader: () => '',
  });
  assert.equal(recorded.ok, true, JSON.stringify(recorded));
  const file = join(sessionsDir(gw), `current-${process.pid}.json`);
  const moved = verify({
    home: gw,
    harnessPid: process.pid,
    sessionId: 'session-movedsrc',
    betweenReads() {
      const doc = JSON.parse(readFileSync(file, 'utf8'));
      doc.generation += 1;
      doc.session_id = 'session-moveddst';
      writeFileSync(file, `${JSON.stringify(doc)}\n`);
    },
  });
  assert.equal(moved.ok, false);
  assert.equal(moved.reason, 'stale-session');
});

test('two writers for one harness meet at the lock, and the older one does not replace the pointer', async () => {
  const home = tempHome();
  const root = typedRoot(join(home, 'root'));
  const gw = gatewayDir(home);
  const waitFile = join(home, 'lock-wait');
  const bindingUrl = pathToFileURL(fileURLToPath(new URL('../lib/binding.mjs', import.meta.url))).href;
  const workerFile = join(home, 'lock-worker.mjs');
  writeFileSync(workerFile, `import { writeSession } from ${JSON.stringify(bindingUrl)};
import { parentPort, workerData } from 'node:worker_threads';
const result = writeSession(workerData);
parentPort.postMessage(result);
`);
  const reader = () => 'lock-boundary-start';
  let worker;
  const parent = writeSession({
    home: gw,
    sessionId: 'session-lock-new',
    harnessPid: process.pid,
    cwd: root,
    homeDir: home,
    hookStartedMs: 5000,
    argsReader: () => '',
    harnessStartedReader: reader,
    whileLocked() {
      worker = new Worker(workerFile, {
        workerData: {
          home: gw,
          sessionId: 'session-lock-old',
          harnessPid: process.pid,
          cwd: root,
          homeDir: home,
          hookStartedMs: 1000,
        },
        env: { ...process.env, WISER_BINDING_LOCK_WAIT_FILE: waitFile },
      });
      const deadline = Date.now() + 10000;
      while (!existsSync(waitFile)) {
        if (Date.now() > deadline) throw new Error('the second writer did not reach the lock');
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
      }
    },
  });
  const child = await new Promise((resolve, reject) => {
    worker.on('message', resolve);
    worker.on('error', reject);
  });
  assert.equal(parent.ok, true, JSON.stringify(parent));
  assert.equal(child.lost, true);
  const pointer = JSON.parse(readFileSync(join(sessionsDir(gw), `current-${process.pid}.json`), 'utf8'));
  assert.equal(pointer.session_id, 'session-lock-new');
  assert.equal(pointer.hook_started_ms, 5000);
  assert.equal(pointer.pending, false);
  const checked = verify({
    home: gw, harnessPid: process.pid, sessionId: 'session-lock-new', harnessStartedReader: reader,
  });
  assert.equal(checked.ok, true, JSON.stringify(checked));
  await worker.terminate();
});

test('an unreadable ancestor AGENTS.md fails the gateway closed', async () => {
  const home = tempHome();
  const parent = join(home, 'parent');
  mkdirSync(parent, { recursive: true });
  const agents = join(parent, 'AGENTS.md');
  writeFileSync(agents, '---\nroot: container\n---\n');
  const root = typedRoot(join(parent, 'work'));
  const gwHome = gatewayDir(home);
  writeStatus(home, attachedDoc(home));
  const recorded = writeSession({
    home: gwHome,
    sessionId: 'session-unread01',
    harnessPid: process.pid,
    cwd: root,
    homeDir: home,
    argsReader: () => '',
  });
  assert.equal(recorded.ok, true, JSON.stringify(recorded));
  assert.equal(recorded.binding.refused, false);
  chmodSync(agents, 0o000);
  try {
    const calls = [];
    const { gw } = await createTestGateway({
      home: gwHome,
      connectors: [],
      session: false,
      classifierIdentity: () => ({ harnessPid: process.pid, sessionId: null }),
      classifier: {
        name: 'direct',
        actions: () => ['wiser.decide.choice'],
        describe() { return {}; },
        async execute(req) { calls.push(req); return { choice: 'x', confidence: 1, calibrated: false }; },
      },
    });
    const executed = await gw.execute({
      action: 'wiser.decide.choice',
      input: { decision: 'item', options: ['x'], allow_uncalibrated: true },
    });
    assert.equal(executed.status, 'classifier_unbound');
    assert.equal(executed.reason, 'refused');
    assert.equal(calls.length, 0);
  } finally {
    chmodSync(agents, 0o644);
  }
});
