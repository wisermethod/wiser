import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { writeSession } from '../../hooks/lib/binding.mjs';
import { FIRST_PARTY_ACTIONS } from '../src/resolve.js';
import { SEARCH_PICK_BAND } from '../src/gateway.js';
import { bindTestSession, createTestGateway, makeHome } from './fake-provider.js';

const ASK = fileURLToPath(new URL('../../tools/lib/classifier/ask.mjs', import.meta.url));
const SEARCH_DESCRIPTION = 'Search action ids this gateway serves, with privilege, risk, and confirmation.';

const CONNECTOR = {
  id: 'acme',
  service: 'acme',
  manifest: {
    modules: {
      items: {
        auth: { privilege: 'read' },
        actions: {
          list: { description: 'List items', risk: 'low', confirmation: 'none' },
          get: { description: 'Get one item', risk: 'low', confirmation: 'none' },
          delete: { description: 'Delete an item', risk: 'high', confirmation: 'always' },
        },
      },
    },
  },
};

function createFakeClassifier(result) {
  const calls = [];
  const ids = Object.keys(FIRST_PARTY_ACTIONS);
  return {
    name: 'direct',
    calls,
    actions: () => ids.slice(),
    describe() {
      return { request: {}, answer: {} };
    },
    async execute(req) {
      calls.push(req);
      return typeof result === 'function' ? await result(req) : result;
    },
  };
}

function writeAgents(dir, text = '---\ntype: personal\n---\n\n# Root\n') {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'AGENTS.md'), text);
  return dir;
}

async function gateway(result, connectors = [CONNECTOR], options = {}) {
  const classifier = createFakeClassifier(result);
  const created = await createTestGateway({ classifier, connectors, ...options });
  return { ...created, classifier };
}

function startCaller() {
  const src = [
    "import { spawn } from 'node:child_process';",
    "import { createInterface } from 'node:readline';",
    "process.stdout.write(JSON.stringify({ ready: true, pid: process.pid }) + '\\n');",
    'const rl = createInterface({ input: process.stdin });',
    "rl.on('line', (line) => {",
    '  if (!line.trim()) return;',
    '  const job = JSON.parse(line);',
    '  const child = spawn(process.execPath, job.args, {',
    '    env: { ...process.env, ...(job.env || {}), CLAUDE_PID: String(process.pid) },',
    '  });',
    "  let out = '';",
    "  let err = '';",
    "  child.stdout.on('data', (d) => { out += d; });",
    "  child.stderr.on('data', (d) => { err += d; });",
    "  child.on('close', (code) => {",
    "    process.stdout.write(JSON.stringify({ code, out, err }) + '\\n');",
    '  });',
    '});',
    '',
  ].join('\n');
  const child = spawn(process.execPath, ['--input-type=module', '-e', src], { stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = [];
  const waiters = [];
  let buf = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buf += chunk;
    let nl = buf.indexOf('\n');
    while (nl >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (waiters.length > 0) waiters.shift()(line);
      else lines.push(line);
      nl = buf.indexOf('\n');
    }
  });
  const nextLine = () => {
    if (lines.length > 0) return Promise.resolve(lines.shift());
    return new Promise((resolve) => waiters.push(resolve));
  };
  return { child, nextLine };
}

test('an accepted search choice is listed first and marked, through the first-party execute path', async () => {
  const { gw, classifier, audit } = await gateway({
    choice: 'acme.items.get',
    confidence: 0.93,
    calibrated: false,
  });
  const noQuery = await gw.searchActions({});
  assert.equal(noQuery.classifier, undefined);
  assert.equal(classifier.calls.length, 0);

  const picked = await gw.searchActions({ query: 'item' });
  assert.equal(picked.actions[0].action, 'acme.items.get');
  assert.equal(picked.actions[0].classifier, true);
  assert.deepEqual(picked.actions.slice(1).map((row) => row.action), ['acme.items.list', 'acme.items.delete']);
  assert.equal(picked.actions.slice(1).some((row) => row.classifier), false);
  assert.deepEqual(picked.classifier, {
    path: 'classifier', reason: null, choice: 'acme.items.get', confidence: 0.93,
  });
  assert.equal(classifier.calls.length, 1);
  assert.equal(classifier.calls[0].actionId, 'wiser.decide.choice');
  assert.equal(classifier.calls[0].arguments.decision, 'item');
  assert.equal(classifier.calls[0].arguments.allow_uncalibrated, true);
  const ids = classifier.calls[0].arguments.options.map((opt) => opt.id);
  assert.equal(ids.some((id) => id.startsWith('wiser.')), false);
  assert.deepEqual(ids, ['acme.items.list', 'acme.items.get', 'acme.items.delete']);
  const line = JSON.parse(readFileSync(audit.file, 'utf8').trim().split('\n').pop());
  assert.equal(line.action, 'wiser.decide.choice');
  assert.equal(line.op, 'execute');

  const outside = await gw.searchActions({ query: 'delete', owning_root: '/not/a/root' });
  assert.equal(outside.actions[0].action, 'acme.items.get');
  assert.equal(outside.actions[0].classifier, true);
  assert.deepEqual(outside.actions.slice(1).map((row) => row.action), ['acme.items.delete']);
});

test('a pick below the confidence band is not acted on, and today\'s results stand', async () => {
  assert.equal(SEARCH_PICK_BAND, 0.51);
  for (const [confidence, reason] of [[0.5, 'below-band'], [0.42, 'below-band'], [0, 'below-band']]) {
    const { gw, classifier } = await gateway({ choice: 'acme.items.get', confidence, calibrated: false });
    const after = await gw.searchActions({ query: 'item' });
    assert.equal(classifier.calls.length, 1);
    assert.deepEqual(after.actions.map((row) => row.action), ['acme.items.list', 'acme.items.get', 'acme.items.delete']);
    assert.equal(after.actions.some((row) => row.classifier), false);
    assert.deepEqual(after.classifier, { path: 'builtin', reason, choice: 'acme.items.get', confidence });
  }
  const { gw } = await gateway({ choice: 'acme.items.get', confidence: 0.51, calibrated: false });
  const at = await gw.searchActions({ query: 'item' });
  assert.equal(at.actions[0].action, 'acme.items.get');
  assert.equal(at.classifier.path, 'classifier');
});

test('an unaccepted choice leaves today\'s results byte-identical', async () => {
  const { gw } = await gateway({ choice: 'none', confidence: 0.42, calibrated: false });
  const after = await gw.searchActions({ query: 'item' });
  assert.deepEqual(after.actions.map((row) => row.action), [
    'acme.items.list', 'acme.items.get', 'acme.items.delete',
  ]);
  assert.deepEqual(after.classifier, {
    path: 'builtin', reason: 'not-accepted', choice: 'none', confidence: 0.42,
  });
});

test('no query, no classifier, an unbound session, and a refusal send nothing', async () => {
  const { gw, classifier } = await gateway({ choice: 'acme.items.list', confidence: 1, calibrated: false });
  const noQuery = await gw.searchActions({});
  assert.equal(noQuery.classifier, undefined);
  assert.equal(classifier.calls.length, 0);

  const { gw: loose, classifier: looseCalls } = await gateway(
    { choice: 'acme.items.list', confidence: 1, calibrated: false },
    [CONNECTOR],
    { session: false },
  );
  const plain = await loose.searchActions({ query: 'item' });
  const ignored = await loose.callTool('search_actions', { query: 'item', owning_root: 'relative/root' });
  assert.equal(JSON.stringify(ignored.actions), JSON.stringify(plain.actions));
  assert.equal(ignored.classifier.path, 'builtin');
  assert.equal(typeof ignored.classifier.reason, 'string');
  assert.equal(looseCalls.calls.length, 0);
  assert.equal(ignored.status, undefined);

  const home = makeHome();
  const refused = writeAgents(join(home, 'refused'), '---\ntype: personal\nclassifier_refusal: yes\n---\n\n# Root\n');
  bindTestSession(home, { root: refused, cwd: refused });
  const { gw: refusedGw, classifier: quiet, audit } = await gateway(
    { choice: 'acme.items.list', confidence: 1, calibrated: false },
    [CONNECTOR],
    {
      home,
      session: false,
      classifierIdentity: () => ({ harnessPid: process.pid, sessionId: null }),
    },
  );
  const refusedRun = await refusedGw.searchActions({ query: 'item' });
  assert.deepEqual(refusedRun.classifier, { path: 'builtin', reason: 'refused' });
  assert.equal(quiet.calls.length, 0);
  const direct = await refusedGw.execute({
    action: 'wiser.decide.choice',
    input: { decision: 'item', options: ['keep'], allow_uncalibrated: true },
  });
  assert.equal(direct.status, 'classifier_unbound');
  assert.equal(direct.reason, 'refused');
  const line = JSON.parse(readFileSync(audit.file, 'utf8').trim().split('\n').pop());
  assert.equal(line.op, 'execute');
  assert.equal(line.action, 'wiser.decide.choice');
  assert.equal(line.status, 'classifier_unbound');
  assert.equal(quiet.calls.length, 0);

  const { gw: bare, classifier: unloadedCalls } = await gateway(
    { choice: 'acme.items.list', confidence: 1, calibrated: false },
    [CONNECTOR],
  );
  bare.classifier = null;
  const unloaded = await bare.searchActions({ query: 'item' });
  assert.equal(unloaded.classifier, undefined);
  assert.equal(unloadedCalls.calls.length, 0);
  assert.deepEqual(unloaded.actions.map((row) => row.action), [
    'acme.items.list', 'acme.items.get', 'acme.items.delete',
  ]);
});

test('an empty classifier key sends nothing and search returns today\'s results', async () => {
  const home = makeHome();
  const envPath = join(home, 'auth-provider.env');
  writeFileSync(envPath, 'WISER_AUTH_PROVIDER_KEY=\nWISER_USER_ID=\nWISER_CLASSIFIER_KEY=\n');
  const { gw, classifier } = await gateway(
    { choice: 'acme.items.get', confidence: 0.99, calibrated: false },
    [CONNECTOR],
    { home, envPath },
  );
  const today = gw.listActions({ query: 'item' });
  const searched = await gw.searchActions({ query: 'item' });
  assert.equal(classifier.calls.length, 0);
  assert.equal(searched.classifier, undefined);
  assert.deepEqual(searched.actions, today);
  const direct = await gw.execute({
    action: 'wiser.decide.choice',
    input: {
      decision: 'item',
      options: [{ id: 'acme.items.get', label: 'Get one item' }],
      allow_uncalibrated: true,
    },
  });
  assert.equal(direct.status, 'needs_subscription');
  assert.equal(classifier.calls.length, 0);
});

test('search_actions publishes today\'s description and no owning_root', async () => {
  const { gw } = await createTestGateway({ connectors: [], session: false });
  const bare = gw.listTools().find((tool) => tool.name === 'search_actions');
  assert.equal(bare.description, SEARCH_DESCRIPTION);
  assert.equal(bare.inputSchema.properties.owning_root, undefined);

  const { gw: loaded } = await createTestGateway({
    classifier: createFakeClassifier({ choice: 'none', confidence: 1, calibrated: false }),
    connectors: [],
  });
  const marked = loaded.listTools().find((tool) => tool.name === 'search_actions');
  assert.equal(marked.inputSchema.properties.owning_root, undefined);
  assert.equal(marked.description.startsWith(`${SEARCH_DESCRIPTION} `), true);
  const sentence = marked.description.slice(SEARCH_DESCRIPTION.length).trim();
  assert.ok(sentence.length > 0 && sentence.length <= 120, sentence);
  assert.match(sentence, /listed first/);
  assert.match(sentence, /marked/);
});

test('two concurrent sessions send only for the root that does not refuse', async () => {
  const callerA = startCaller();
  const callerB = startCaller();
  const homeA = makeHome();
  const homeB = makeHome();
  try {
    const readyA = JSON.parse(await callerA.nextLine());
    const readyB = JSON.parse(await callerB.nextLine());
    const rootA = writeAgents(join(homeA, 'open'));
    const rootB = writeAgents(join(homeB, 'shut'), '---\ntype: personal\nclassifier_refusal: yes\n---\n\n# Root\n');
    const noteA = join(rootA, 'note.txt');
    writeFileSync(noteA, 'n');
    const boundA = writeSession({
      home: homeA, sessionId: 'session-s1-live', harnessPid: readyA.pid, cwd: rootA, homeDir: homeA,
    });
    const boundB = writeSession({
      home: homeB, sessionId: 'session-s2-live', harnessPid: readyB.pid, cwd: rootB, homeDir: homeB,
    });
    assert.equal(boundA.ok, true, JSON.stringify(boundA));
    assert.equal(boundB.binding.refused, true);
    for (const home of [homeA, homeB]) {
      mkdirSync(join(home, 'classifier-status'), { recursive: true });
      mkdirSync(join(home, 'classifier'));
      writeFileSync(join(home, 'classifier-status', 'claude-code.json'), `${JSON.stringify({
        attached: true,
        classifier_dirs: [join(home, 'classifier')],
        pid: process.pid,
        started_at: '2026-09-23T00:00:00.000Z',
      })}\n`);
      writeFileSync(join(home, 'stub.json'), JSON.stringify({
        'wiser.recall.rank': { ranked: [{ id: 'p', p: 0.5, calibrated: false }], calibrated: false },
      }));
    }
    const answer = { choice: 'acme.items.get', confidence: 0.9, calibrated: false };
    const identity = (pid) => () => ({ harnessPid: pid, sessionId: null });
    const { gw: gwA, classifier: classA } = await gateway(answer, [CONNECTOR], {
      home: homeA, session: false, classifierIdentity: identity(readyA.pid),
    });
    const { gw: gwB, classifier: classB } = await gateway(answer, [CONNECTOR], {
      home: homeB, session: false, classifierIdentity: identity(readyB.pid),
    });
    const choice = { decision: 'item', options: ['acme.items.get'], allow_uncalibrated: true };
    const askFrom = (caller, home, sessionId, logName) => {
      caller.child.stdin.write(`${JSON.stringify({
        args: [ASK, '--action', 'wiser.recall.rank', '--gateway-home', home, '--material', noteA, '--input', '{}'],
        env: {
          CLAUDE_CODE_SESSION_ID: sessionId,
          WISER_HOOK_STUB_FILE: join(home, 'stub.json'),
          WISER_HOOK_STUB_LOG: join(home, logName),
        },
      })}\n`);
      return caller.nextLine().then((line) => JSON.parse(line));
    };
    const spoof = () => new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [
        ASK, '--action', 'wiser.recall.rank', '--gateway-home', homeA, '--material', noteA, '--input', '{}',
      ], {
        env: {
          ...process.env,
          CLAUDE_PID: String(readyA.pid),
          CLAUDE_CODE_SESSION_ID: 'session-s1-live',
          WISER_HOOK_STUB_FILE: join(homeA, 'stub.json'),
          WISER_HOOK_STUB_LOG: join(homeA, 'spoof.log'),
        },
      });
      let out = '';
      let err = '';
      child.stdout.on('data', (chunk) => { out += chunk; });
      child.stderr.on('data', (chunk) => { err += chunk; });
      child.on('error', reject);
      child.on('close', (code) => resolve({ code, out, err }));
    });
    const [askA, askB, spoofed, searchA, searchB, execA, execB] = await Promise.all([
      askFrom(callerA, homeA, 'session-s1-live', 'calls.log'),
      askFrom(callerB, homeB, 'session-s2-live', 'calls.log'),
      spoof(),
      gwA.searchActions({ query: 'item' }),
      gwB.searchActions({ query: 'item' }),
      gwA.execute({ action: 'wiser.decide.choice', input: choice }),
      gwB.execute({ action: 'wiser.decide.choice', input: choice }),
    ]);
    assert.equal(askA.code, 0, askA.err || askA.out);
    assert.equal(JSON.parse(askA.out).path, 'classifier');
    assert.equal(readFileSync(join(homeA, 'calls.log'), 'utf8').trim(), 'wiser.recall.rank');
    assert.equal(askB.code, 0, askB.err || askB.out);
    assert.equal(JSON.parse(askB.out).reason, 'refused');
    assert.equal(existsSync(join(homeB, 'calls.log')), false);
    assert.equal(spoofed.code, 0, spoofed.err);
    assert.equal(JSON.parse(spoofed.out).reason, 'not-ancestor');
    assert.equal(existsSync(join(homeA, 'spoof.log')), false);
    assert.equal(searchA.classifier.path, 'classifier');
    assert.equal(searchB.classifier.reason, 'refused');
    assert.equal(execA.choice, 'acme.items.get');
    assert.equal(execB.status, 'classifier_unbound');
    assert.equal(execB.reason, 'refused');
    assert.equal(classA.calls.length, 2);
    assert.equal(classB.calls.length, 0);
  } finally {
    callerA.child.kill('SIGKILL');
    callerB.child.kill('SIGKILL');
  }
});

test('a refusal added at the owning root after a clean binding stops the gateway at once', async () => {
  const home = makeHome();
  const root = writeAgents(join(home, 'open'));
  bindTestSession(home, { root, cwd: root });
  const { gw, classifier } = await gateway(
    { choice: 'acme.items.list', confidence: 1, calibrated: false },
    [CONNECTOR],
    {
      home,
      session: false,
      classifierIdentity: () => ({ harnessPid: process.pid, sessionId: null }),
    },
  );
  writeFileSync(join(root, 'AGENTS.md'), '---\ntype: personal\nclassifier_refusal: yes\n---\n\n# Root\n');
  const searched = await gw.searchActions({ query: 'item' });
  assert.deepEqual(searched.classifier, { path: 'builtin', reason: 'refused' });
  const executed = await gw.execute({
    action: 'wiser.decide.choice',
    input: { decision: 'item', options: ['keep'], allow_uncalibrated: true },
  });
  assert.equal(executed.status, 'classifier_unbound');
  assert.equal(executed.reason, 'refused');
  assert.equal(classifier.calls.length, 0);
});

