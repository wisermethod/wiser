import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { classifierNeedsSubscription } from '../src/gateway.js';
import { FIRST_PARTY_ACTIONS } from '../src/resolve.js';
import { buildRoster } from '../../hooks/lib/roster.mjs';
import { makeHome } from './fake-provider.js';

const SERVER = fileURLToPath(new URL('../server.js', import.meta.url));
const PLUGIN_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SIX = Object.keys(FIRST_PARTY_ACTIONS);
const KEY = 'presence-key-7f3a9c';
const ROWS = [{ family: 'skill', name: 'Deep Research/SKILL.md', description: 'research', body: 'Full body.\n' }];

function envFile(dir, keyLine) {
  const file = join(dir, 'auth-provider.env');
  writeFileSync(file, `WISER_AUTH_PROVIDER_KEY=\nWISER_USER_ID=\nWISER_CLASSIFIER_KEY=${keyLine}\n`);
  return file;
}

function honestClassifierSource() {
  return `import { createHash } from 'node:crypto';

export function createClassifier() {
  const stored = new Map();

  function canonical(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    const keys = Object.keys(value).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  }

  function holdRoster(rows) {
    const list = Array.isArray(rows) ? rows : [];
    const digest = createHash('sha256').update(canonical(list), 'utf8').digest('hex');
    stored.set(digest, list);
    return { roster_sha256: digest, accepted: list.length, rejected: 0 };
  }

  return {
    name: 'direct',
    actions: () => ${JSON.stringify(SIX)},
    describe: () => ({ request: {}, answer: {} }),
    roster(rows) {
      return holdRoster(rows);
    },
    async execute(req) {
      const actionId = req && req.actionId;
      const args = (req && req.arguments) || {};
      if (actionId === 'wiser.route.roster') return holdRoster(args.rows);
      if (actionId === 'wiser.route.ask') {
        const hash = args.roster_sha256;
        if (typeof hash !== 'string' || !stored.has(hash)) return { status: 'roster_unknown' };
        return { family: 'skill', target: 'example', confidence: 1, pass: true };
      }
      return { status: 'unavailable', reason: 'unknown action id' };
    },
  };
}
`;
}

function classifierDir() {
  const root = makeHome();
  const dir = join(root, 'direct');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.mjs'), honestClassifierSource());
  return dir;
}

function statusPath(home, harness = 'claude-code') {
  return join(home, 'classifier-status', `${harness}.json`);
}

function startServer(args) {
  const child = spawn(process.execPath, [SERVER, ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
  let err = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { err += chunk; });
  child.stdout.on('data', () => {});
  return { child, stderr: () => err };
}

async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode) return;
  child.kill('SIGTERM');
  await new Promise((resolve) => {
    const killer = setTimeout(() => child.kill('SIGKILL'), 500);
    child.once('exit', () => {
      clearTimeout(killer);
      resolve();
    });
  });
}

async function waitForFile(file, child, stderr, ms = 4000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (existsSync(file)) return;
    if (child.exitCode !== null) {
      throw new Error(`server exited ${child.exitCode}: ${stderr()}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`presence file missing: ${stderr()}`);
}

test('classifierNeedsSubscription is no classifier, or a null key read', () => {
  const home = makeHome();
  const empty = envFile(home, '');
  const blank = envFile(makeHome(), '   ');
  const set = envFile(makeHome(), KEY);
  const classifier = { name: 'direct' };
  assert.equal(classifierNeedsSubscription(null, set), true);
  assert.equal(classifierNeedsSubscription([], set), true);
  assert.equal(classifierNeedsSubscription(classifier, empty), true);
  assert.equal(classifierNeedsSubscription(classifier, blank), true);
  assert.equal(classifierNeedsSubscription(classifier, join(home, 'missing.env')), true);
  assert.equal(classifierNeedsSubscription(classifier, set), false);
  assert.equal(classifierNeedsSubscription([classifier], set), false);
});

test('a normal start writes the presence file and never the key', async () => {
  const home = makeHome();
  const env = envFile(makeHome(), KEY);
  const dir = classifierDir();
  const { child, stderr } = startServer([
    '--home', home,
    '--env', env,
    '--harness', 'claude-code',
    '--classifier', dir,
  ]);
  try {
    const file = statusPath(home);
    await waitForFile(file, child, stderr);
    const text = readFileSync(file, 'utf8');
    const doc = JSON.parse(text);
    assert.equal(doc.attached, true);
    assert.deepEqual(doc.classifier_dirs, [resolve(dir)]);
    assert.equal(doc.pid, child.pid);
    assert.match(doc.started_at, /^\d{4}-\d{2}-\d{2}T/);
    assert.deepEqual(Object.keys(doc).sort(), ['attached', 'classifier_dirs', 'pid', 'started_at']);
    assert.equal(text.includes(KEY), false);
    assert.equal(text.includes('WISER_CLASSIFIER_KEY'), false);
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.equal(statSync(join(home, 'classifier-status')).mode & 0o777, 0o700);
    const names = readdirSync(join(home, 'classifier-status'));
    assert.deepEqual(names, ['claude-code.json']);
  } finally {
    await stop(child);
  }
});

test('an empty classifier key line writes attached false', async () => {
  const home = makeHome();
  const env = envFile(makeHome(), '');
  const dir = classifierDir();
  const { child, stderr } = startServer([
    '--home', home,
    '--env', env,
    '--harness', 'claude-code',
    '--classifier', dir,
  ]);
  try {
    const file = statusPath(home);
    await waitForFile(file, child, stderr);
    const doc = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(doc.attached, false);
    assert.deepEqual(doc.classifier_dirs, [resolve(dir)]);
    assert.equal(readFileSync(file, 'utf8').includes(KEY), false);
  } finally {
    await stop(child);
  }
});

test('no classifier writes attached false and an empty directory list', async () => {
  const home = makeHome();
  const env = envFile(makeHome(), KEY);
  const { child, stderr } = startServer([
    '--home', home,
    '--env', env,
    '--harness', 'claude-code',
  ]);
  try {
    const file = statusPath(home);
    await waitForFile(file, child, stderr);
    const text = readFileSync(file, 'utf8');
    const doc = JSON.parse(text);
    assert.equal(doc.attached, false);
    assert.deepEqual(doc.classifier_dirs, []);
    assert.equal(text.includes(KEY), false);
  } finally {
    await stop(child);
  }
});

test('--check does not write the presence file', () => {
  const home = makeHome();
  const env = envFile(makeHome(), KEY);
  const dir = classifierDir();
  const r = spawnSync(process.execPath, [
    SERVER, '--check', '--home', home, '--env', env, '--harness', 'claude-code', '--classifier', dir,
  ], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(existsSync(statusPath(home)), false);
});

test('a presence write failure does not stop the gateway', async () => {
  const home = makeHome();
  const env = envFile(makeHome(), KEY);
  writeFileSync(join(home, 'classifier-status'), 'not a directory\n');
  const { child, stderr } = startServer([
    '--home', home,
    '--env', env,
    '--harness', 'claude-code',
  ]);
  let line = '';
  try {
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' })}\n`);
    line = await new Promise((resolve, reject) => {
      let buf = '';
      const timer = setTimeout(() => reject(new Error(`no ping: ${stderr()} ${buf}`)), 4000);
      child.stdout.on('data', (chunk) => {
        buf += chunk;
        const nl = buf.indexOf('\n');
        if (nl !== -1) {
          clearTimeout(timer);
          resolve(buf.slice(0, nl));
        }
      });
    });
  } finally {
    await stop(child);
  }
  const msg = JSON.parse(line);
  assert.deepEqual(msg.result, {});
  assert.equal(statSync(join(home, 'classifier-status')).isFile(), true);
});

test('help names --call, --route, and --input', () => {
  const r = spawnSync(process.execPath, [SERVER, 'help'], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /--call <action id>/);
  assert.match(r.stdout, /--route/);
  assert.match(r.stdout, /wiser\.route\.roster/);
  assert.match(r.stdout, /wiser\.route\.ask/);
  assert.match(r.stdout, /--input <json>/);
});

test('--call runs one first-party action, writes one audit line, and no presence file', () => {
  const home = makeHome();
  const env = envFile(makeHome(), KEY);
  const dir = classifierDir();
  const r = spawnSync(process.execPath, [
    SERVER,
    '--home', home,
    '--env', env,
    '--harness', 'claude-code',
    '--classifier', dir,
    '--call', 'wiser.route.roster',
    '--input', JSON.stringify({ rows: ROWS }),
  ], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.includes(KEY), false);
  const lines = r.stdout.trim().split('\n');
  assert.equal(lines.length, 1);
  const result = JSON.parse(lines[0]);
  assert.match(result.roster_sha256, /^[a-f0-9]{64}$/);
  assert.equal(result.accepted, 1);
  assert.equal(result.rejected, 0);
  assert.equal(result.status, undefined);
  const audit = readFileSync(join(home, 'audit.jsonl'), 'utf8').trim().split('\n');
  assert.equal(audit.length, 1);
  const line = JSON.parse(audit[0]);
  assert.equal(line.harness, 'claude-code');
  assert.equal(line.op, 'execute');
  assert.equal(line.action, 'wiser.route.roster');
  assert.equal(line.harness, 'claude-code');
  assert.equal(audit[0].includes(KEY), false);
  assert.equal(existsSync(statusPath(home)), false);
});

test('--call reads JSON from stdin when --input is -', () => {
  const home = makeHome();
  const env = envFile(makeHome(), KEY);
  const dir = classifierDir();
  const r = spawnSync(process.execPath, [
    SERVER,
    '--home', home,
    '--env', env,
    '--harness', 'claude-code',
    '--classifier', dir,
    '--call', 'wiser.route.roster',
    '--input', '-',
  ], { encoding: 'utf8', input: JSON.stringify({ rows: ROWS }) });
  assert.equal(r.status, 0, r.stderr);
  const result = JSON.parse(r.stdout);
  assert.match(result.roster_sha256, /^[a-f0-9]{64}$/);
  assert.equal(existsSync(statusPath(home)), false);
});

test('--call refuses a connector id and does not call', () => {
  const home = makeHome();
  const env = envFile(makeHome(), KEY);
  const dir = makeHome();
  writeFileSync(join(dir, 'index.mjs'), 'throw new Error("should-not-load");\n');
  const r = spawnSync(process.execPath, [
    SERVER,
    '--home', home,
    '--env', env,
    '--harness', 'claude-code',
    '--classifier', dir,
    '--call', 'github.repos.get',
    '--input', '{}',
  ], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /refuses/);
  assert.equal(r.stderr.includes('should-not-load'), false);
  assert.equal(existsSync(join(home, 'audit.jsonl')), false);
  assert.equal(existsSync(statusPath(home)), false);
});

function routeArgs(home, env, dir) {
  return [
    SERVER,
    '--home', home,
    '--env', env,
    '--harness', 'claude-code',
    '--classifier', dir,
  ];
}

function auditLines(home) {
  return readFileSync(join(home, 'audit.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
}

test('a roster and an ask in two processes answer roster_unknown', () => {
  const home = makeHome();
  const env = envFile(makeHome(), KEY);
  const dir = classifierDir();
  const base = routeArgs(home, env, dir);
  const roster = spawnSync(process.execPath, [
    ...base,
    '--call', 'wiser.route.roster',
    '--input', JSON.stringify({ rows: ROWS }),
  ], { encoding: 'utf8' });
  assert.equal(roster.status, 0, roster.stderr);
  const held = JSON.parse(roster.stdout);
  assert.match(held.roster_sha256, /^[a-f0-9]{64}$/);
  const ask = spawnSync(process.execPath, [
    ...base,
    '--call', 'wiser.route.ask',
    '--input', JSON.stringify({ ask: 'what should I load', roster_sha256: held.roster_sha256 }),
  ], { encoding: 'utf8' });
  assert.equal(ask.status, 0, ask.stderr);
  const missed = JSON.parse(ask.stdout);
  assert.equal(missed.status, 'roster_unknown');
  assert.equal(missed.target, undefined);
  const audit = auditLines(home);
  assert.equal(audit.length, 2);
  assert.equal(audit[0].action, 'wiser.route.roster');
  assert.equal(audit[0].status, 'ok');
  assert.equal(audit[1].action, 'wiser.route.ask');
  assert.equal(audit[1].status, 'roster_unknown');
  assert.equal(existsSync(statusPath(home)), false);
});

test('--route holds the roster and asks in one process', () => {
  const home = makeHome();
  const env = envFile(makeHome(), KEY);
  const dir = classifierDir();
  const r = spawnSync(process.execPath, [
    ...routeArgs(home, env, dir),
    '--route',
    '--input', '-',
  ], { encoding: 'utf8', input: JSON.stringify({ rows: ROWS, ask: 'what should I load' }) });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.includes(KEY), false);
  const lines = r.stdout.trim().split('\n');
  assert.equal(lines.length, 1);
  const result = JSON.parse(lines[0]);
  assert.equal(result.family, 'skill');
  assert.equal(result.target, 'example');
  assert.equal(result.confidence, 1);
  assert.equal(result.pass, true);
  assert.equal(result.status, undefined);
  const audit = auditLines(home);
  assert.equal(audit.length, 2);
  assert.equal(audit[0].action, 'wiser.route.roster');
  assert.equal(audit[0].status, 'ok');
  assert.equal(audit[1].action, 'wiser.route.ask');
  assert.equal(audit[1].status, 'ok');
  assert.equal(existsSync(statusPath(home)), false);
});

test('--route prints a roster result with no digest and does not ask', () => {
  const home = makeHome();
  const env = envFile(makeHome(), KEY);
  const dir = join(makeHome(), 'direct');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.mjs'), `
export function createClassifier() {
  return {
    name: 'direct',
    actions: () => ${JSON.stringify(SIX)},
    describe: () => ({ request: {}, answer: {} }),
    async execute(req) {
      if (req && req.actionId === 'wiser.route.roster') {
        return { roster_sha256: '', accepted: 1, rejected: 0 };
      }
      return { family: 'skill', target: 'should-not-run', confidence: 1, pass: true };
    },
  };
}
`);
  const r = spawnSync(process.execPath, [
    ...routeArgs(home, env, dir),
    '--route',
    '--input', JSON.stringify({ rows: ROWS, ask: 'what should I load' }),
  ], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const result = JSON.parse(r.stdout);
  assert.equal(result.roster_sha256, '');
  assert.equal(result.accepted, 1);
  assert.equal(result.target, undefined);
  const audit = auditLines(home);
  assert.equal(audit.length, 1);
  assert.equal(audit[0].action, 'wiser.route.roster');
  assert.equal(existsSync(statusPath(home)), false);
});

test('--route wall time with the plugin roster and an instant classifier', { timeout: 120000 }, (t) => {
  const builtAt = performance.now();
  const rows = buildRoster(PLUGIN_ROOT);
  const buildMs = Math.round(performance.now() - builtAt);
  assert.ok(rows.length >= 60, `row count ${rows.length}`);
  const home = makeHome();
  const env = envFile(makeHome(), KEY);
  const dir = classifierDir();
  const started = performance.now();
  const r = spawnSync(process.execPath, [
    ...routeArgs(home, env, dir),
    '--route',
    '--input', '-',
  ], {
    encoding: 'utf8',
    input: JSON.stringify({ rows, ask: 'draft a research brief' }),
    timeout: 60000,
    maxBuffer: 16 * 1024 * 1024,
  });
  const wallMs = Math.round(performance.now() - started);
  assert.equal(r.status, 0, r.stderr);
  const result = JSON.parse(r.stdout);
  assert.equal(result.target, 'example');
  assert.equal(result.status, undefined);
  const audit = auditLines(home);
  assert.deepEqual(audit.map((line) => line.action), ['wiser.route.roster', 'wiser.route.ask']);
  assert.equal(audit[1].status, 'ok');
  const line = `ROUTE_WALL_MS ${wallMs} ROSTER_BUILD_MS ${buildMs} ROWS ${rows.length}`;
  t.diagnostic(line);
  console.log(line);
});
