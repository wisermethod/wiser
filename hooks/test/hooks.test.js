import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { buildRoster } from '../lib/roster.mjs';
import { classifierRefusalValue, isAttached, isRefused, pidAlive } from '../lib/presence.mjs';
import { formatRoute, isNamedAsk } from '../route.mjs';
import { owningRoot } from '../lib/presence.mjs';

const pluginRoot = fileURLToPath(new URL('../..', import.meta.url));
const SCRIPTS = {
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

function runHook(script, event, { home, cwd, stub, log, timeout = 8000 } = {}) {
  const env = { ...process.env, HOME: home };
  delete env.WISER_HOOK_STUB_FILE;
  delete env.WISER_HOOK_STUB_LOG;
  delete env.WISER_CLASSIFIER_KEY;
  if (stub) env.WISER_HOOK_STUB_FILE = stub;
  if (log) env.WISER_HOOK_STUB_LOG = log;
  return spawnSync(process.execPath, [script], {
    input: event === undefined ? '' : (typeof event === 'string' ? event : JSON.stringify(event)),
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

test('hooks.json registers the route hook and nothing else', () => {
  const doc = JSON.parse(readFileSync(join(pluginRoot, 'hooks', 'hooks.json'), 'utf8'));
  assert.equal(typeof doc.description, 'string');
  assert.deepEqual(Object.keys(doc.hooks), ['UserPromptSubmit']);
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
