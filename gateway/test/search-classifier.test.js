import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { writeSession } from '../../hooks/lib/binding.mjs';
import { FIRST_PARTY_ACTIONS, validateFirstPartyAnswer } from '../src/resolve.js';
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

function liveChild() {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  return new Promise((resolve, reject) => {
    child.once('spawn', () => resolve(child));
    child.once('error', reject);
  });
}

test('wiser.decide.batch is declared, and a malformed answer is refused', async () => {
  const def = FIRST_PARTY_ACTIONS['wiser.decide.batch'];
  assert.equal(def.privilege, 'read');
  assert.equal(def.risk, 'low');
  assert.equal(def.confirmation, 'none');
  assert.equal(def.input.properties.state.properties.request.type, 'string');
  assert.equal(def.input.properties.decisions.type, 'array');
  assert.equal(def.input.properties.allow_uncalibrated.type, 'boolean');
  assert.equal(def.input.required.includes('state'), true);
  assert.equal(def.input.required.includes('decisions'), true);
  assert.deepEqual(def.answer, { answers: { type: 'array' }, calibrated: { const: false } });

  const input = {
    state: { request: '{"columns":[]}' },
    decisions: [
      { id: 'revenue', question: 'Which role?', options: ['quantity', 'identifier', 'year', 'code', 'flag'] },
    ],
    allow_uncalibrated: true,
  };
  const good = {
    answers: [{ id: 'revenue', choice: 'quantity', confidence: 0.125 }],
    calibrated: false,
  };
  assert.equal(validateFirstPartyAnswer('wiser.decide.batch', input, good), true);
  assert.equal(validateFirstPartyAnswer('wiser.decide.batch', input, {
    answers: [{ id: 'revenue', choice: 'quantity' }],
    calibrated: false,
  }), false);
  assert.equal(validateFirstPartyAnswer('wiser.decide.batch', input, {
    answers: [{ id: 'revenue', choice: 'destroy', confidence: 0.5 }],
    calibrated: false,
  }), false);
  assert.equal(validateFirstPartyAnswer('wiser.decide.batch', input, {
    answers: [{ id: 'revenue', choice: 'quantity', confidence: 0.5 }],
    calibrated: true,
  }), false);

  const { gw, classifier } = await gateway(good);
  const kept = await gw.execute({ action: 'wiser.decide.batch', input });
  assert.equal(kept.status, undefined);
  assert.equal(kept.answers[0].confidence, 0.125);
  assert.equal(classifier.calls.length, 1);

  const { gw: gwBad } = await gateway({
    answers: [{ id: 'revenue', choice: 'quantity' }],
    calibrated: false,
  });
  const refused = await gwBad.execute({ action: 'wiser.decide.batch', input });
  assert.equal(refused.status, 'unavailable');
  assert.equal(refused.reason, 'malformed answer');
  assert.equal(refused.answers, undefined);
});

test('an accepted search choice is listed first and marked, through the first-party execute path', async () => {
  const { gw, classifier, audit } = await gateway({
    choice: 'acme.items.get',
    confidence: 0.42,
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
    path: 'classifier', reason: null, choice: 'acme.items.get', confidence: 0.42,
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
  const childA = await liveChild();
  const childB = await liveChild();
  const homeA = makeHome();
  const homeB = makeHome();
  try {
    const rootA = writeAgents(join(homeA, 'open'));
    const rootB = writeAgents(join(homeB, 'shut'), '---\ntype: personal\nclassifier_refusal: yes\n---\n\n# Root\n');
    const boundA = writeSession({
      home: homeA, sessionId: 'session-s1-live', harnessPid: childA.pid, cwd: rootA, homeDir: homeA,
    });
    const boundB = writeSession({
      home: homeB, sessionId: 'session-s2-live', harnessPid: childB.pid, cwd: rootB, homeDir: homeB,
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
    const answer = { choice: 'acme.items.get', confidence: 0.5, calibrated: false };
    const identity = (pid) => () => ({ harnessPid: pid, sessionId: null });
    const { gw: gwA, classifier: classA } = await gateway(answer, [CONNECTOR], {
      home: homeA, session: false, classifierIdentity: identity(childA.pid),
    });
    const { gw: gwB, classifier: classB } = await gateway(answer, [CONNECTOR], {
      home: homeB, session: false, classifierIdentity: identity(childB.pid),
    });
    const choice = { decision: 'item', options: ['acme.items.get'], allow_uncalibrated: true };
    const ask = (home, pid, sessionId) => new Promise((resolve, reject) => {
      const env = {
        ...process.env,
        CLAUDE_PID: String(pid),
        CLAUDE_CODE_SESSION_ID: sessionId,
        WISER_HOOK_STUB_FILE: join(home, 'stub.json'),
        WISER_HOOK_STUB_LOG: join(home, 'calls.log'),
      };
      const child = spawn(process.execPath, [
        ASK, '--action', 'wiser.recall.rank', '--gateway-home', home, '--input', '{}',
      ], { env });
      let out = '';
      let err = '';
      child.stdout.on('data', (chunk) => { out += chunk; });
      child.stderr.on('data', (chunk) => { err += chunk; });
      child.on('error', reject);
      child.on('close', (code) => resolve({ code, out, err }));
    });
    const [askA, askB, searchA, searchB, execA, execB] = await Promise.all([
      ask(homeA, childA.pid, 'session-s1-live'),
      ask(homeB, childB.pid, 'session-s2-live'),
      gwA.searchActions({ query: 'item' }),
      gwB.searchActions({ query: 'item' }),
      gwA.execute({ action: 'wiser.decide.choice', input: choice }),
      gwB.execute({ action: 'wiser.decide.choice', input: choice }),
    ]);
    assert.equal(askA.code, 0, askA.err);
    assert.equal(JSON.parse(askA.out).path, 'classifier');
    assert.equal(readFileSync(join(homeA, 'calls.log'), 'utf8').trim(), 'wiser.recall.rank');
    assert.equal(askB.code, 0, askB.err);
    assert.equal(JSON.parse(askB.out).reason, 'refused');
    assert.equal(existsSync(join(homeB, 'calls.log')), false);
    assert.equal(searchA.classifier.path, 'classifier');
    assert.equal(searchB.classifier.reason, 'refused');
    assert.equal(execA.choice, 'acme.items.get');
    assert.equal(execB.status, 'classifier_unbound');
    assert.equal(execB.reason, 'refused');
    assert.equal(classA.calls.length, 2);
    assert.equal(classB.calls.length, 0);
  } finally {
    childA.kill('SIGKILL');
    childB.kill('SIGKILL');
  }
});

