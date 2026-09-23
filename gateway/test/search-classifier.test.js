import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FIRST_PARTY_ACTIONS, validateFirstPartyAnswer } from '../src/resolve.js';
import { createTestGateway, makeHome } from './fake-provider.js';

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

async function gateway(result, connectors = [CONNECTOR]) {
  const classifier = createFakeClassifier(result);
  const created = await createTestGateway({ classifier, connectors });
  return { ...created, classifier };
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
  const home = makeHome();
  const owning = writeAgents(join(home, 'root'));
  const { gw, classifier, audit } = await gateway({
    choice: 'acme.items.get',
    confidence: 0.42,
    calibrated: false,
  });
  const plain = gw.searchActions({ query: 'item' });
  assert.deepEqual(plain.actions.map((row) => row.action), [
    'acme.items.list', 'acme.items.get', 'acme.items.delete',
  ]);
  assert.equal(classifier.calls.length, 0);

  const picked = await gw.searchActions({ query: 'item', owning_root: owning });
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

  const outside = await gw.searchActions({ query: 'delete', owning_root: owning });
  assert.equal(outside.actions[0].action, 'acme.items.get');
  assert.equal(outside.actions[0].classifier, true);
  assert.deepEqual(outside.actions.slice(1).map((row) => row.action), ['acme.items.delete']);
});

test('an unaccepted choice leaves today\'s results byte-identical', async () => {
  const home = makeHome();
  const owning = writeAgents(join(home, 'root'));
  const { gw } = await gateway({ choice: 'none', confidence: 0.42, calibrated: false });
  const before = JSON.stringify(gw.searchActions({ query: 'item' }).actions);
  const after = await gw.searchActions({ query: 'item', owning_root: owning });
  assert.equal(JSON.stringify(after.actions), before);
  assert.deepEqual(after.classifier, {
    path: 'builtin', reason: 'not-accepted', choice: 'none', confidence: 0.42,
  });
});

test('no owning_root, no query, no classifier, and a refusal send nothing', async () => {
  const home = makeHome();
  const owning = writeAgents(join(home, 'root'));
  const refused = writeAgents(join(home, 'refused'), '---\ntype: personal\nclassifier_refusal: yes\n---\n\n# Root\n');
  const { gw, classifier } = await gateway({ choice: 'acme.items.list', confidence: 1, calibrated: false });
  const plain = gw.searchActions({ query: 'item' });

  const noRoot = await gw.searchActions({ query: 'item' });
  assert.deepEqual(noRoot, plain);
  assert.equal(classifier.calls.length, 0);

  const relative = await gw.searchActions({ query: 'item', owning_root: 'relative/root' });
  assert.deepEqual(relative, plain);
  assert.equal(classifier.calls.length, 0);

  const noQuery = await gw.searchActions({ owning_root: owning });
  assert.equal(classifier.calls.length, 0);
  assert.equal(noQuery.classifier, undefined);

  const refusedRun = await gw.searchActions({ query: 'item', owning_root: refused });
  assert.equal(JSON.stringify(refusedRun.actions), JSON.stringify(plain.actions));
  assert.deepEqual(refusedRun.classifier, {
    path: 'builtin', reason: 'refused', choice: null, confidence: null,
  });
  assert.equal(classifier.calls.length, 0);

  const { gw: bare, classifier: quiet } = await gateway(
    { choice: 'acme.items.list', confidence: 1, calibrated: false },
    [CONNECTOR],
  );
  bare.classifier = null;
  const unloaded = await bare.searchActions({ query: 'item', owning_root: owning });
  assert.equal(unloaded.classifier, undefined);
  assert.equal(quiet.calls.length, 0);
  assert.deepEqual(unloaded.actions.map((row) => row.action), [
    'acme.items.list', 'acme.items.get', 'acme.items.delete',
  ]);
});
