import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('./browser.js', import.meta.url));
const ACTION = 'wiser.browser.pick';

function tempDir() {
  return mkdtempSync(join(tmpdir(), 'wiser-pick-'));
}

function childEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  if (!Object.prototype.hasOwnProperty.call(extra, 'WISER_HOOK_STUB_FILE')) delete env.WISER_HOOK_STUB_FILE;
  if (!Object.prototype.hasOwnProperty.call(extra, 'WISER_HOOK_STUB_LOG')) delete env.WISER_HOOK_STUB_LOG;
  return env;
}

function writeAgents(dir, text = '---\ntype: personal\n---\n\n# Root\n') {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'AGENTS.md'), text);
  return dir;
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

function stubEnv(dir, answer, name = 'calls') {
  const stub = join(dir, `${name}.json`);
  const log = join(dir, `${name}.log`);
  writeFileSync(stub, JSON.stringify({ [ACTION]: answer }));
  return { WISER_HOOK_STUB_FILE: stub, WISER_HOOK_STUB_LOG: log, log };
}

function snapshotFile(dir, content, elementCount) {
  const file = join(dir, 'snapshot.json');
  const count = elementCount ?? (typeof content === 'string' ? content.split('\n').length : 0);
  writeFileSync(file, JSON.stringify({
    url: 'https://example.test/form',
    title: 'Form',
    format: 'interactive',
    elementCount: count,
    content,
  }));
  return file;
}

function line(index, tag, type, description) {
  const typePart = type ? ` (${type})` : '';
  return `[${index}] <${tag}>${typePart} ${description}`;
}

function runPick(args, env) {
  return spawnSync(process.execPath, [SCRIPT, 'pick', ...args], {
    encoding: 'utf8',
    env: childEnv(env),
  });
}

function okPick(args, env) {
  const run = runPick(args, env);
  assert.equal(run.status, 0, run.stderr || run.stdout);
  return JSON.parse(run.stdout);
}

test('a classifier answer is recorded and the lowest accepted snapshot number wins', () => {
  const dir = tempDir();
  const home = tempDir();
  const owning = writeAgents(join(dir, 'root'));
  attached(home);
  const content = [
    line(5, 'button', '', 'Save'),
    line(6, 'input', 'email', '[email] Address'),
    line(7, 'a', '', 'Cancel'),
  ].join('\n');
  const file = snapshotFile(dir, content, 3);
  const env = stubEnv(dir, { index: 1, verb: 'type', confidence: 0.42, calibrated: false });
  const result = okPick([
    '--goal', 'fill the address',
    '--owning-root', owning,
    '--gateway-home', home,
    '--snapshot-file', file,
  ], env);
  assert.equal(result.goal, 'fill the address');
  assert.equal(result.elementCount, 3);
  assert.deepEqual(result.pick, { index: 6, verb: 'type' });
  assert.equal(result.classifier.path, 'classifier');
  assert.equal(result.classifier.reason, null);
  assert.equal(result.classifier.batches, 1);
  assert.equal(result.classifier.records[0].answer.confidence, 0.42);
  assert.equal(result.classifier.records[0].input.elements[1].name.includes('[email] Address'), true);
  assert.equal(existsSync(env.log), true);
  assert.match(readFileSync(env.log, 'utf8'), new RegExp(ACTION));
});

test('verbs follow the record tag, and a newline in a label stays inside that record', () => {
  const dir = tempDir();
  const home = tempDir();
  const owning = writeAgents(join(dir, 'root'));
  attached(home);
  const content = [
    line(0, 'button', '', 'Go'),
    line(1, 'input', 'email', '[email] Address'),
    line(2, 'textarea', 'textarea', 'Notes'),
    line(3, 'select', 'select-one', 'Country'),
    line(4, 'div', '', 'contenteditable Notes'),
    line(5, 'input', 'checkbox', '[checkbox] Agree'),
  ].join('\n');
  const file = snapshotFile(dir, content, 6);
  const env = stubEnv(dir, { index: null, verb: 'none', confidence: 1, calibrated: false });
  const result = okPick([
    '--goal', 'inspect',
    '--owning-root', owning,
    '--gateway-home', home,
    '--snapshot-file', file,
  ], env);
  assert.deepEqual(result.classifier.records[0].input.elements.map((el) => el.verb), [
    'click', 'type', 'type', 'click', 'type', 'click',
  ]);
  assert.equal(result.pick, null);
  assert.equal(result.classifier.path, 'builtin');
  assert.equal(result.classifier.reason, 'not-accepted');
});

test('a snapshot over 255 elements is batched by number, and a newline in a label does not shift the index', () => {
  const dir = tempDir();
  const home = tempDir();
  const owning = writeAgents(join(dir, 'root'));
  attached(home);
  const parts = [];
  for (let i = 0; i < 256; i += 1) {
    if (i === 3) parts.push(line(3, 'button', '', 'before\nafter'));
    else if (i === 10) parts.push(line(10, 'button', '', 'Keep'));
    else if (i === 255) parts.push(line(255, 'a', '', 'Last'));
    else parts.push(line(i, 'button', '', `Item ${i}`));
  }
  const content = parts.join('\n');
  assert.ok(content.split('\n').length > 256);
  const file = snapshotFile(dir, content, 256);
  const env = stubEnv(dir, [
    { index: 10, verb: 'click', confidence: 0.2, calibrated: false },
    { index: 0, verb: 'click', confidence: 0.9, calibrated: false },
  ]);
  const result = okPick([
    '--goal', 'the later control',
    '--owning-root', owning,
    '--gateway-home', home,
    '--snapshot-file', file,
  ], env);
  assert.equal(result.elementCount, 256);
  assert.equal(result.classifier.batches, 2);
  assert.equal(result.classifier.records.length, 2);
  assert.equal(result.classifier.records[0].input.elements.length, 255);
  assert.equal(result.classifier.records[0].input.elements[3].name.includes('before\nafter'), true);
  assert.equal(result.classifier.records[1].input.elements.length, 1);
  assert.equal(result.classifier.records[1].input.elements[0].name.includes('Last'), true);
  assert.deepEqual(result.pick, { index: 10, verb: 'click' });
  assert.equal(readFileSync(env.log, 'utf8').trim().split('\n').length, 2);

  const onlyLater = stubEnv(dir, [
    { index: 10, verb: 'type', confidence: 0.2, calibrated: false },
    { index: 0, verb: 'click', confidence: 0.9, calibrated: false },
  ], 'later');
  const mapped = okPick([
    '--goal', 'the later control',
    '--owning-root', owning,
    '--gateway-home', home,
    '--snapshot-file', file,
  ], onlyLater);
  assert.deepEqual(mapped.pick, { index: 255, verb: 'click' });
  assert.equal(mapped.classifier.path, 'classifier');
});

test('builtin when there is no owning root, a refusal, no classifier, or an answer that fails acceptance', () => {
  const dir = tempDir();
  const home = tempDir();
  const owning = writeAgents(join(dir, 'root'));
  const refused = writeAgents(join(dir, 'refused'), '---\ntype: personal\nclassifier_refusal: yes\n---\n\n# Root\n');
  const file = snapshotFile(dir, line(0, 'button', '', 'Go'), 1);
  const env = stubEnv(dir, { index: 0, verb: 'click', confidence: 0.5, calibrated: false });

  const noRoot = okPick(['--goal', 'go', '--gateway-home', home, '--snapshot-file', file], env);
  assert.equal(noRoot.pick, null);
  assert.equal(noRoot.classifier.path, 'builtin');
  assert.equal(noRoot.classifier.reason, 'no-owning-root');
  assert.equal(existsSync(env.log), false);

  const refusedRun = okPick([
    '--goal', 'go', '--owning-root', refused, '--gateway-home', home, '--snapshot-file', file,
  ], env);
  assert.equal(refusedRun.pick, null);
  assert.equal(refusedRun.classifier.reason, 'refused');
  assert.equal(existsSync(env.log), false);

  const quietHome = tempDir();
  const noClassifier = okPick([
    '--goal', 'go', '--owning-root', owning, '--gateway-home', quietHome, '--snapshot-file', file,
  ], env);
  assert.equal(noClassifier.pick, null);
  assert.equal(noClassifier.classifier.reason, 'no-classifier');
  assert.equal(existsSync(env.log), false);

  attached(home);
  const bad = stubEnv(dir, { index: 0, verb: 'type', confidence: 0.5, calibrated: false }, 'bad');
  const failed = okPick([
    '--goal', 'go', '--owning-root', owning, '--gateway-home', home, '--snapshot-file', file,
  ], bad);
  assert.equal(failed.pick, null);
  assert.equal(failed.classifier.path, 'builtin');
  assert.equal(failed.classifier.reason, 'not-accepted');
  assert.equal(existsSync(bad.log), true);
});

test('replay makes no call and settles the same pick', () => {
  const dir = tempDir();
  const home = tempDir();
  const owning = writeAgents(join(dir, 'root'));
  attached(home);
  const file = snapshotFile(dir, [line(0, 'button', '', 'Go'), line(1, 'button', '', 'Stay')].join('\n'), 2);
  const env = stubEnv(dir, { index: 1, verb: 'click', confidence: 0.7, calibrated: false });
  const first = okPick([
    '--goal', 'stay', '--owning-root', owning, '--gateway-home', home, '--snapshot-file', file,
  ], env);
  assert.deepEqual(first.pick, { index: 1, verb: 'click' });
  const record = join(dir, 'records.json');
  writeFileSync(record, JSON.stringify(first.classifier.records));
  const replayEnv = stubEnv(dir, { index: 0, verb: 'click', confidence: 0.1, calibrated: false }, 'replay');
  const replayed = okPick([
    '--goal', 'stay',
    '--owning-root', owning,
    '--gateway-home', home,
    '--snapshot-file', file,
    '--classifier-record', record,
  ], replayEnv);
  assert.equal(replayed.classifier.path, 'replay');
  assert.deepEqual(replayed.pick, first.pick);
  assert.equal(replayed.classifier.records[0].answer.confidence, 0.7);
  assert.equal(existsSync(replayEnv.log), false);

  const other = snapshotFile(dir, line(0, 'button', '', 'Different'), 1);
  const mismatched = runPick([
    '--goal', 'stay',
    '--owning-root', owning,
    '--gateway-home', home,
    '--snapshot-file', other,
    '--classifier-record', record,
  ], replayEnv);
  assert.equal(mismatched.status, 1);
  assert.equal(mismatched.stdout, '');
  assert.match(mismatched.stderr, /does not match this judgment/);
  assert.equal(existsSync(replayEnv.log), false);
});

