import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { STATUS, StatusSignal, isStatusObject } from '../src/errors.js';
import { loadPolicy } from '../src/policy.js';
import { FIRST_PARTY_ACTIONS } from '../src/resolve.js';
import { createTestGateway, DEFAULT_POLICY, makeHome } from './fake-provider.js';

const SERVER = fileURLToPath(new URL('../server.js', import.meta.url));
const SIX = Object.keys(FIRST_PARTY_ACTIONS);
const ASK = { ask: 'what should I load', roster_sha256: 'abc' };
const ASK_OK = { family: 'skill', target: 'example', confidence: 1, pass: true };

function conformingAnswer(actionId) {
  if (actionId === 'wiser.route.roster') return { roster_sha256: 'abc', accepted: 1, rejected: 0 };
  if (actionId === 'wiser.gate.check') return { judgments: [] };
  if (actionId === 'wiser.decide.choice') return { choice: 'none', confidence: 1, calibrated: false };
  if (actionId === 'wiser.recall.rank') return { ranked: [], calibrated: false };
  if (actionId === 'wiser.browser.pick') return { index: null, verb: 'none', confidence: 1, calibrated: false };
  return { ...ASK_OK };
}
// A marker standing for whatever operator tree an adapter was loaded from. It is
// deliberately NOT the real build workspace's name: a shipped file may not spell a
// path under it, and spelling one in pieces to slip past that check is the defect
// this constant was written as. A unique marker asserts the same property and is a
// stricter needle, because nothing else in the tree can produce it by accident.
const OPERATOR_DIR = 'operator-tree-7f3a9c/private-adapter';

function createFakeClassifier(overrides = {}) {
  const ids = overrides.ids || SIX;
  const calls = [];
  return {
    name: 'direct',
    calls,
    actions: () => ids.slice(),
    describe(id) {
      if (!ids.includes(id)) return null;
      return { request: FIRST_PARTY_ACTIONS[id]?.input?.properties || {}, answer: { ok: true } };
    },
    roster(rows) {
      return { roster_sha256: 'deadbeef', accepted: Array.isArray(rows) ? rows.length : 0, rejected: 0 };
    },
    async execute(req) {
      calls.push(req);
      if (typeof overrides.execute === 'function') return overrides.execute(req);
      if (overrides.throw) throw overrides.throw;
      if (overrides.result !== undefined) {
        return typeof overrides.result === 'function' ? overrides.result(req) : overrides.result;
      }
      return { ok: true, actionId: req && req.actionId, ...conformingAnswer(req && req.actionId) };
    },
  };
}

function hold() {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  return { gate, release };
}

async function waitUntil(pred) {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > 2000) throw new Error('waitUntil timed out');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function withEnvSentinel(fn) {
  const sentinel = 'ENV-SENTINEL-MUST-NOT-CHANGE';
  const prevHad = Object.prototype.hasOwnProperty.call(process.env, 'WISER_CLASSIFIER_KEY');
  const prev = process.env['WISER_CLASSIFIER_KEY'];
  process.env['WISER_CLASSIFIER_KEY'] = sentinel;
  return Promise.resolve()
    .then(() => fn(sentinel))
    .finally(() => {
      if (prevHad) process.env['WISER_CLASSIFIER_KEY'] = prev;
      else delete process.env['WISER_CLASSIFIER_KEY'];
    });
}

function lastAuditLine(audit) {
  const raw = readFileSync(audit.file, 'utf8').trim();
  return { raw, line: JSON.parse(raw.split('\n').pop()) };
}

async function overlappingKeys(order) {
  return withEnvSentinel(async (sentinel) => {
    const homeA = makeHome();
    const homeB = makeHome();
    const envA = join(homeA, 'auth-provider.env');
    const envB = join(homeB, 'auth-provider.env');
    writeFileSync(envA, 'WISER_AUTH_PROVIDER_KEY=\nWISER_CLASSIFIER_KEY=key-A\n');
    writeFileSync(envB, 'WISER_AUTH_PROVIDER_KEY=\nWISER_CLASSIFIER_KEY=key-B\n');

    const holdA = hold();
    const holdB = hold();
    let seenA;
    let seenB;
    const envReads = [];
    let started = 0;

    const classifierA = createFakeClassifier({
      execute: async (req) => {
        seenA = req.key;
        envReads.push(process.env['WISER_CLASSIFIER_KEY']);
        started += 1;
        await holdA.gate;
        envReads.push(process.env['WISER_CLASSIFIER_KEY']);
        return { ok: true, who: 'A', key: req.key, ...conformingAnswer(req && req.actionId) };
      },
    });
    const classifierB = createFakeClassifier({
      execute: async (req) => {
        seenB = req.key;
        envReads.push(process.env['WISER_CLASSIFIER_KEY']);
        started += 1;
        await holdB.gate;
        envReads.push(process.env['WISER_CLASSIFIER_KEY']);
        return { ok: true, who: 'B', key: req.key, ...conformingAnswer(req && req.actionId) };
      },
    });

    const { gw: gwA } = await createTestGateway({
      classifier: classifierA,
      envPath: envA,
      connectors: [],
      home: homeA,
    });
    const { gw: gwB } = await createTestGateway({
      classifier: classifierB,
      envPath: envB,
      connectors: [],
      home: homeB,
    });

    const pA = gwA.execute({ action: 'wiser.route.ask', input: ASK });
    const pB = gwB.execute({ action: 'wiser.route.ask', input: ASK });
    await waitUntil(() => started === 2);
    if (order === 'A-first') {
      holdA.release();
      holdB.release();
    } else {
      holdB.release();
      holdA.release();
    }
    const [ra, rb] = await Promise.all([pA, pB]);
    assert.equal(seenA, 'key-A');
    assert.equal(seenB, 'key-B');
    assert.equal(ra.key, 'key-A');
    assert.equal(rb.key, 'key-B');
    assert.ok(envReads.every((v) => v === sentinel));
    assert.equal(process.env['WISER_CLASSIFIER_KEY'], sentinel);
  });
}

test('STATUS includes needs_subscription and nothing existing was renamed', () => {
  assert.equal(STATUS.NEEDS_SUBSCRIPTION, 'needs_subscription');
  assert.equal(STATUS.NEEDS_CONNECTOR, 'needs_connector');
  assert.equal(STATUS.NEEDS_CONFIRMATION, 'needs_confirmation');
  assert.equal(STATUS.TEARDOWN_INCOMPLETE, 'teardown_incomplete');
  assert.ok(Object.values(STATUS).includes('needs_subscription'));
  assert.equal(Object.values(STATUS).length, 10);
});

test('no classifier loaded: execute of a wiser id answers needs_subscription, not needs_connector', async () => {
  const { gw } = await createTestGateway({ connectors: [] });
  const result = await gw.execute({ action: 'wiser.route.ask', input: ASK });
  assert.equal(result.status, 'needs_subscription');
  assert.notEqual(result.status, 'needs_connector');
  assert.equal(typeof result.setup, 'string');
});

test('no classifier loaded: describe_action on a wiser id answers needs_subscription, not needs_connector', async () => {
  const { gw } = await createTestGateway({ connectors: [] });
  const result = gw.describeAction('wiser.route.ask');
  assert.equal(result.status, 'needs_subscription');
  assert.notEqual(result.status, 'needs_connector');
});

test('with a classifier loaded, search_actions lists all six first-party ids', async () => {
  const { gw } = await createTestGateway({ classifier: createFakeClassifier(), connectors: [] });
  const { actions } = gw.searchActions({});
  const ids = actions.map((a) => a.action);
  for (const id of SIX) assert.ok(ids.includes(id), id);
  const row = actions.find((a) => a.action === 'wiser.route.ask');
  assert.equal(row.privilege, 'read');
  assert.equal(row.risk, 'low');
  assert.equal(row.confirmation, 'none');
});

test('with a classifier loaded, describe_action answers each first-party id with its input shape', async () => {
  const { gw } = await createTestGateway({ classifier: createFakeClassifier(), connectors: [] });
  for (const id of SIX) {
    const row = gw.describeAction(id);
    assert.equal(row.status, undefined, id);
    assert.equal(row.action, id);
    assert.equal(row.source, 'first_party_mcp');
    assert.equal(row.privilege, 'read');
    assert.ok(row.input && typeof row.input === 'object', id);
  }
});

test('a first-party call runs with no manifest row and a thrown adapter is returned as unavailable', async () => {
  const classifier = createFakeClassifier();
  const { gw } = await createTestGateway({
    classifier,
    connectors: [],
    authConfigured: false,
  });
  let threw = null;
  let result;
  try {
    result = await gw.execute({ action: 'wiser.route.ask', input: ASK });
  } catch (err) {
    threw = err;
  }
  assert.equal(threw, null);
  assert.equal(typeof result, 'object');
  assert.ok(result);
  assert.notEqual(result.status, 'needs_provider');
  assert.notEqual(result.status, 'needs_connect');
  assert.notEqual(result.status, 'needs_connector');
  assert.equal(result.ok, true);
  assert.equal(result.actionId, 'wiser.route.ask');
  assert.equal(classifier.calls.length, 1);

  const throwing = createFakeClassifier({ throw: new Error('boom') });
  const { gw: gwThrow } = await createTestGateway({
    classifier: throwing,
    connectors: [],
    authConfigured: false,
  });
  let throwErr = null;
  let throwResult;
  try {
    throwResult = await gwThrow.execute({ action: 'wiser.route.ask', input: ASK });
  } catch (err) {
    throwErr = err;
  }
  assert.equal(throwErr, null);
  assert.equal(throwResult.status, 'unavailable');
  assert.equal(throwResult.reason, 'adapter_error');
});

test('removing the named wiser rule still allows a first-party call via the trailing wildcard', async () => {
  const base = loadPolicy({ home: null, defaultPath: DEFAULT_POLICY });
  const withoutNamed = { ...base, rules: base.rules.filter((r) => r.service !== 'wiser') };

  const { gw: withNamedGw } = await createTestGateway({
    classifier: createFakeClassifier(),
    policy: base,
    connectors: [],
  });
  const { gw: withoutNamedGw } = await createTestGateway({
    classifier: createFakeClassifier(),
    policy: withoutNamed,
    connectors: [],
  });

  const withNamed = await withNamedGw.execute({ action: 'wiser.route.ask', input: ASK });
  const without = await withoutNamedGw.execute({ action: 'wiser.route.ask', input: ASK });
  assert.equal(withNamed.ok, true);
  assert.equal(without.ok, true);
  assert.notEqual(withNamed.status, 'denied');
  assert.notEqual(without.status, 'denied');
});

test('keeping the named wiser rule allows a first-party execute when the trailing wildcard denies', async () => {
  const base = loadPolicy({ home: null, defaultPath: DEFAULT_POLICY });
  const wildcardDenied = {
    ...base,
    rules: base.rules.map((rule) => (
      rule.role === '*' && rule.effect === 'allow' && rule.service === undefined
        ? { ...rule, effect: 'deny' }
        : rule
    )),
  };
  const { gw } = await createTestGateway({
    classifier: createFakeClassifier(),
    policy: wildcardDenied,
    connectors: [],
  });
  const result = await gw.execute({ action: 'wiser.route.ask', input: ASK });
  assert.equal(result.ok, true);
  assert.notEqual(result.status, 'denied');
});

test('a policy rule demanding confirmation for a classifier call produces needs_confirmation and calls no adapter', async () => {
  const classifier = createFakeClassifier();
  const policy = {
    roles: ['runtime', 'readonly'],
    default_role: 'runtime',
    rules: [
      { role: '*', service: 'wiser', effect: 'confirm' },
      { role: '*', effect: 'allow' },
    ],
  };
  const { gw } = await createTestGateway({ classifier, policy, connectors: [] });
  const stopped = await gw.execute({ action: 'wiser.route.ask', input: ASK });
  assert.equal(stopped.status, 'needs_confirmation');
  assert.match(stopped.summary, /wiser\.route\.ask/);
  assert.match(stopped.summary, /risk low/);
  assert.equal(classifier.calls.length, 0);

  const ran = await gw.execute({ action: 'wiser.route.ask', input: ASK, confirm: true });
  assert.equal(classifier.calls.length, 1);
  assert.equal(ran.ok, true);
});

test('empty classifier key line answers needs_subscription', async () => {
  await withEnvSentinel(async (sentinel) => {
    const home = makeHome();
    const envPath = join(home, 'auth-provider.env');
    writeFileSync(envPath, 'WISER_AUTH_PROVIDER_KEY=\nWISER_USER_ID=\nWISER_CLASSIFIER_KEY=\n');
    const classifier = createFakeClassifier({
      execute: async (req) => {
        const v = req && req.key;
        if (typeof v !== 'string' || !v.trim()) {
          return { status: 'needs_subscription', setup: 'set the key' };
        }
        return { ok: true, ...conformingAnswer(req && req.actionId) };
      },
    });
    const { gw } = await createTestGateway({ classifier, envPath, connectors: [], home });
    const result = await gw.execute({ action: 'wiser.route.ask', input: ASK });
    assert.equal(result.status, 'needs_subscription');
    assert.ok(isStatusObject(result));
    assert.equal(process.env['WISER_CLASSIFIER_KEY'], sentinel);
  });
});

test('a populated classifier key line is handed to the adapter at call time, not via process.env', async () => {
  await withEnvSentinel(async (sentinel) => {
    const home = makeHome();
    const envPath = join(home, 'auth-provider.env');
    writeFileSync(envPath, 'WISER_AUTH_PROVIDER_KEY=\nWISER_CLASSIFIER_KEY=from-file\n');
    let seen = null;
    const classifier = createFakeClassifier({
      execute: async (req) => {
        seen = req.key;
        return { ok: true, key_present: true, ...conformingAnswer(req && req.actionId) };
      },
    });
    const { gw } = await createTestGateway({ classifier, envPath, connectors: [], home });
    const result = await gw.execute({ action: 'wiser.route.ask', input: ASK });
    assert.equal(result.ok, true);
    assert.equal(seen, 'from-file');
    assert.equal(process.env['WISER_CLASSIFIER_KEY'], sentinel);
    assert.equal(classifier.calls[0].key, 'from-file');
  });
});

test('overlapping execute calls keep their own keys when A finishes first', async () => {
  await overlappingKeys('A-first');
});

test('overlapping execute calls keep their own keys when B finishes first', async () => {
  await overlappingKeys('B-first');
});

test('an adapter that throws answers unavailable with a fixed reason and does not propagate', async () => {
  const classifier = createFakeClassifier({ throw: new Error('boom') });
  const { gw } = await createTestGateway({ classifier, connectors: [] });
  let threw = null;
  let result;
  try {
    result = await gw.execute({ action: 'wiser.route.ask', input: ASK });
  } catch (err) {
    threw = err;
  }
  assert.equal(threw, null);
  assert.equal(result.status, 'unavailable');
  assert.equal(result.reason, 'adapter_error');
});

test('an adapter throw never discloses a credential, a vendor name, or an operator-tree path', async () => {
  const cases = [
    'sk-live-credential-9f3a',
    'ExampleVendorAI',
    `failed at /private/${OPERATOR_DIR}/direct/index.mjs`,
  ];
  for (const message of cases) {
    const { gw, audit } = await createTestGateway({
      classifier: createFakeClassifier({ throw: new Error(message) }),
      connectors: [],
    });
    const result = await gw.execute({ action: 'wiser.route.ask', input: ASK });
    assert.equal(result.status, 'unavailable');
    assert.equal(result.reason, 'adapter_error');
    const dumped = JSON.stringify(result);
    assert.equal(dumped.includes(message), false, message);
    const { raw, line } = lastAuditLine(audit);
    assert.equal(raw.includes(message), false, message);
    assert.equal(line.status, 'unavailable');
  }
});

test('an adapter that answers malformed yields unavailable, never a coerced value', async () => {
  const classifier = createFakeClassifier({ result: 'not-an-object' });
  const { gw } = await createTestGateway({ classifier, connectors: [] });
  const result = await gw.execute({ action: 'wiser.route.ask', input: ASK });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.reason, 'malformed answer');
});

test('adapter needs_subscription is passed through as a status object', async () => {
  const classifier = createFakeClassifier({
    result: { status: 'needs_subscription', setup: 'paste the key' },
  });
  const { gw } = await createTestGateway({ classifier, connectors: [] });
  const result = await gw.execute({ action: 'wiser.route.ask', input: ASK });
  assert.equal(result.status, 'needs_subscription');
  assert.ok(isStatusObject(result));
  assert.equal(result.setup, 'paste the key');
});

test('audit line for a first-party call carries action and status and never state', async () => {
  const { gw, audit } = await createTestGateway({
    classifier: createFakeClassifier(),
    connectors: [],
  });
  await gw.execute({ action: 'wiser.route.ask', input: ASK });
  const { line } = lastAuditLine(audit);
  assert.equal(line.op, 'execute');
  assert.equal(line.action, 'wiser.route.ask');
  assert.equal(line.service, 'wiser');
  assert.equal(line.module, 'route');
  assert.equal(line.path, 'first_party_mcp');
  assert.equal(line.privilege, 'read');
  assert.equal(line.status, 'ok');
  assert.equal('state' in line, false);
  assert.equal('input' in line, false);
  assert.equal('output' in line, false);
});

test('classifier unavailable, below_threshold and roster_unknown are audited as themselves, not ok', async () => {
  for (const status of ['unavailable', 'below_threshold', 'roster_unknown']) {
    const { gw, audit } = await createTestGateway({
      classifier: createFakeClassifier({ result: { status } }),
      connectors: [],
    });
    await gw.execute({ action: 'wiser.route.ask', input: ASK });
    const { line } = lastAuditLine(audit);
    assert.equal(line.status, status, status);
    assert.notEqual(line.status, 'ok', status);
  }
});

test('a thrown adapter is audited as unavailable, not ok', async () => {
  const { gw, audit } = await createTestGateway({
    classifier: createFakeClassifier({ throw: new Error('boom') }),
    connectors: [],
  });
  await gw.execute({ action: 'wiser.route.ask', input: ASK });
  const { line } = lastAuditLine(audit);
  assert.equal(line.status, 'unavailable');
});

test('an unrecognised adapter status is audited as classifier_other, not the string', async () => {
  const mystery = 'vendor_mystery_status';
  const { gw, audit } = await createTestGateway({
    classifier: createFakeClassifier({ result: { status: mystery } }),
    connectors: [],
  });
  await gw.execute({ action: 'wiser.route.ask', input: ASK });
  const { raw, line } = lastAuditLine(audit);
  assert.equal(line.status, 'classifier_other');
  assert.equal(raw.includes(mystery), false);
});

test('invalid first-party input is refused before the adapter is called', async () => {
  const classifier = createFakeClassifier();
  const { gw } = await createTestGateway({ classifier, connectors: [] });
  const result = await gw.execute({ action: 'wiser.route.ask', input: { ask: 'only' } });
  assert.equal(result.status, 'invalid_arguments');
  assert.equal(result.field, 'roster_sha256');
  assert.equal(classifier.calls.length, 0);
});

test('an adapter advertising an undeclared wiser id is refused and is not invented as read', async () => {
  const extra = 'wiser.secret.write';
  const classifier = createFakeClassifier({ ids: [...SIX, extra] });
  const { gw } = await createTestGateway({ classifier, connectors: [], role: 'readonly' });
  const result = await gw.execute({ action: extra, input: {} });
  assert.equal(result.status, 'needs_connector');
  assert.equal(result.reason, 'undeclared');
  assert.equal(classifier.calls.length, 0);
  assert.notEqual(result.privilege, 'read');

  const { actions } = gw.searchActions({});
  assert.equal(actions.some((a) => a.action === extra), false);
  for (const id of SIX) assert.ok(actions.some((a) => a.action === id), id);

  const described = gw.describeAction(extra);
  assert.equal(described.status, 'needs_connector');
  assert.equal(described.reason, 'undeclared');
  assert.notEqual(described.privilege, 'read');
  assert.notEqual(described.source, 'first_party_mcp');

  const declared = gw.describeAction('wiser.route.ask');
  assert.equal(declared.source, 'first_party_mcp');
  assert.equal(declared.privilege, 'read');
});

test('help names --classifier as an absolute directory, modelled on --connectors', () => {
  const r = spawnSync(process.execPath, [SERVER, 'help'], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /--classifier <abs dir>/);
  assert.match(r.stdout, /--connectors <abs dir>/);
});

test('--classifier must be an absolute path', () => {
  const r = spawnSync(process.execPath, [SERVER, '--classifier', 'relative/dir', '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /absolute/);
  assert.equal(r.stdout, '');
});

test('--check with --classifier lists the loaded first-party actions', () => {
  const root = makeHome();
  const dir = join(root, 'direct');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.mjs'), `
export function createClassifier() {
  return {
    name: 'direct',
    actions: () => ${JSON.stringify(SIX)},
    describe: (id) => ({ request: {}, answer: {} }),
    execute: async () => ({ ok: true }),
  };
}
`);
  const r = spawnSync(process.execPath, [SERVER, '--check', '--classifier', dir], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const obj = JSON.parse(r.stdout);
  assert.equal(obj.ok, true);
  assert.deepEqual(obj.classifier, SIX);
});

test('--check without --classifier still succeeds and reports no classifier actions', () => {
  const r = spawnSync(process.execPath, [SERVER, '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const obj = JSON.parse(r.stdout);
  assert.equal(obj.ok, true);
  assert.deepEqual(obj.classifier, []);
});

test('a classifier import error does not include the exception message', () => {
  const root = makeHome();
  const dir = join(root, 'direct');
  mkdirSync(dir, { recursive: true });
  const secret = 'sk-live-credential-9f3a';
  const vendor = 'ExampleVendorAI';
  writeFileSync(
    join(dir, 'index.mjs'),
    `throw new Error(${JSON.stringify(`${secret} ${vendor} ${OPERATOR_DIR}`)});\n`,
  );
  const r = spawnSync(process.execPath, [SERVER, '--check', '--classifier', dir], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /could not be loaded/);
  assert.equal(r.stderr.includes(secret), false);
  assert.equal(r.stderr.includes(vendor), false);
  assert.equal(r.stderr.includes(OPERATOR_DIR), false);
});

test('an async classifier factory that rejects is the fixed loader error', () => {
  const root = makeHome();
  const dir = join(root, 'direct');
  mkdirSync(dir, { recursive: true });
  const marker = 'async-factory-reject-marker-9f3a';
  writeFileSync(join(dir, 'index.mjs'), `export async function createClassifier() {
  throw new Error(${JSON.stringify(marker)});
}
`);
  const r = spawnSync(process.execPath, [SERVER, '--check', '--classifier', dir], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /could not be loaded/);
  assert.equal(r.stdout, '');
  assert.equal(r.stderr.includes(marker), false);
});

function assertVersionsNull(line) {
  assert.equal('model' in line, true);
  assert.equal(line.model, null);
  assert.equal('calibrated_model_version' in line, true);
  assert.equal(line.calibrated_model_version, null);
}

const GATE_BAR = Object.freeze({
  path: 'gate.T_fail',
  value: 0.49,
  calibrated_model_version: 'jev-1.13.0',
  strict_version_matching: true,
});

const ROUTING_TARGET_BAR = Object.freeze({
  path: 'routing.target_r2',
  calibrated_model_version: null,
  strict_version_matching: false,
});

function modelOf(envelope) {
  const model = envelope && typeof envelope === 'object' ? envelope.model : undefined;
  return typeof model === 'string' && model ? model : 'unknown';
}

function versionRefusal(bar, data) {
  if (!bar || bar.strict_version_matching !== true) return null;
  const want = bar.calibrated_model_version;
  if (typeof want !== 'string' || !want) return null;
  const got = data && typeof data.model === 'string' && data.model ? data.model : null;
  if (got === want) return null;
  return {
    status: 'unavailable',
    reason: 'model_version_mismatch',
    calibrated_on: want,
    answered_by: got || 'unknown',
  };
}

function withTrace(result, trace) {
  const bar = trace.bar || null;
  let calibrated = null;
  if (bar === GATE_BAR.path) calibrated = GATE_BAR.calibrated_model_version;
  else if (bar === ROUTING_TARGET_BAR.path) calibrated = ROUTING_TARGET_BAR.calibrated_model_version;
  return {
    ...result,
    meta: {
      model: trace.read ? modelOf(trace.envelope) : null,
      bar,
      calibrated_model_version: calibrated,
    },
  };
}

async function pullEnvelope() {
  const res = await fetch('https://classifier.invalid/v1');
  if (!res || res.ok !== true) return { ok: false, data: null };
  return { ok: true, data: await res.json() };
}

/**
 * Self-contained stand-in for the version-matching behaviour the first-party
 * suite has to observe: `wiser.gate.check` compares an envelope against
 * `gate.T_fail`, and a roster alias can name `routing.target_r2` without a post.
 */
function createContractClassifier() {
  const stored = new Map();
  let rosterSeq = 0;
  return {
    name: 'contract',
    actions: () => SIX.slice(),
    describe(id) {
      if (!SIX.includes(id)) return null;
      return { request: FIRST_PARTY_ACTIONS[id]?.input?.properties || {}, answer: { ok: true } };
    },
    async execute(req) {
      const actionId = req && req.actionId;
      const args = (req && req.arguments) || {};
      const trace = { read: false, envelope: null, bar: null };
      if (actionId === 'wiser.route.roster') {
        rosterSeq += 1;
        const rows = Array.isArray(args.rows) ? args.rows : [];
        const digest = `roster-${rosterSeq}`;
        stored.set(digest, rows);
        return withTrace(
          { roster_sha256: digest, accepted: rows.length, rejected: 0 },
          trace,
        );
      }
      if (actionId === 'wiser.route.ask') {
        const held = stored.get(args.roster_sha256);
        if (!held) return withTrace({ status: 'roster_unknown' }, trace);
        const alias = args.ask === 'update root'
          && held.some((row) => row && row.family === 'skill' && row.name === 'Housekeeping');
        if (alias) {
          trace.bar = ROUTING_TARGET_BAR.path;
          return withTrace(
            { family: 'skill', target: 'Housekeeping', confidence: 1, pass: true },
            trace,
          );
        }
        const first = await pullEnvelope();
        if (!first.ok) return withTrace({ status: 'unavailable', reason: 'malformed answer' }, trace);
        trace.read = true;
        trace.envelope = first.data;
        const answers = first.data && first.data.answers;
        if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
          return withTrace({ status: 'unavailable', reason: 'malformed answer' }, trace);
        }
        const second = await pullEnvelope();
        if (!second.ok) return withTrace({ status: 'unavailable', reason: 'malformed answer' }, trace);
        trace.envelope = second.data;
        return withTrace({ family: 'none', target: null, confidence: null, pass: false }, trace);
      }
      if (actionId === 'wiser.gate.check') {
        const pulled = await pullEnvelope();
        if (!pulled.ok) return withTrace({ status: 'unavailable', reason: 'malformed answer' }, trace);
        trace.read = true;
        trace.envelope = pulled.data;
        const refusal = versionRefusal(GATE_BAR, pulled.data);
        if (refusal) {
          trace.bar = GATE_BAR.path;
          return withTrace(refusal, trace);
        }
        const answers = pulled.data && pulled.data.answers;
        if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
          return withTrace({ status: 'unavailable', reason: 'malformed answer' }, trace);
        }
        const judgments = [];
        for (const [key, row] of Object.entries(answers)) {
          const p = row && row.noul;
          if (typeof p !== 'number') {
            return withTrace({ status: 'unavailable', reason: 'malformed answer' }, trace);
          }
          trace.bar = GATE_BAR.path;
          judgments.push({
            index: key.startsWith('L') ? Number(key.slice(1)) : judgments.length,
            verdict: p < GATE_BAR.value ? 'fail' : 'below_threshold',
            p,
          });
        }
        return withTrace({ judgments }, trace);
      }
      return { status: 'unavailable', reason: 'unknown action id' };
    },
  };
}

async function contractGateway() {
  const home = makeHome();
  const envPath = join(home, 'auth-provider.env');
  writeFileSync(envPath, 'WISER_AUTH_PROVIDER_KEY=\nWISER_CLASSIFIER_KEY=test-key\n');
  return createTestGateway({
    classifier: createContractClassifier(),
    envPath,
    connectors: [],
    home,
    authConfigured: false,
  });
}

function okJson(body) {
  return { ok: true, status: 200, json: async () => body };
}

async function withFetch(impl, fn) {
  const prev = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    return await fn();
  } finally {
    globalThis.fetch = prev;
  }
}

const GATE = {
  kind: 'expert',
  criteria: [{ index: 0, text: 'a line' }],
  deliverable: 'the deliverable',
};

function gateBody(model) {
  const body = { answers: { L0: { noul: 0.1 } } };
  if (model !== undefined) body.model = model;
  return body;
}

test('a first-party call that never reaches the adapter writes both version keys as null', async () => {
  const { gw, audit } = await createTestGateway({ connectors: [] });
  const missing = await gw.execute({ action: 'wiser.route.ask', input: ASK });
  assert.equal(missing.status, 'needs_subscription');
  assertVersionsNull(lastAuditLine(audit).line);

  const classifier = createFakeClassifier();
  const { gw: gwInput, audit: auditInput } = await createTestGateway({ classifier, connectors: [] });
  const invalid = await gwInput.execute({ action: 'wiser.route.ask', input: { ask: 'only' } });
  assert.equal(invalid.status, 'invalid_arguments');
  assert.equal(classifier.calls.length, 0);
  assertVersionsNull(lastAuditLine(auditInput).line);

  const confirming = createFakeClassifier();
  const { gw: gwStop, audit: auditStop } = await createTestGateway({
    classifier: confirming,
    connectors: [],
    policy: {
      roles: ['runtime', 'readonly'],
      default_role: 'runtime',
      rules: [
        { role: '*', service: 'wiser', effect: 'confirm' },
        { role: '*', effect: 'allow' },
      ],
    },
  });
  const stopped = await gwStop.execute({ action: 'wiser.route.ask', input: ASK });
  assert.equal(stopped.status, 'needs_confirmation');
  assert.equal(confirming.calls.length, 0);
  assertVersionsNull(lastAuditLine(auditStop).line);

  const { gw: gwDeny, audit: auditDeny } = await createTestGateway({
    classifier: createFakeClassifier(),
    connectors: [],
    policy: {
      roles: ['runtime', 'readonly'],
      default_role: 'runtime',
      rules: [{ role: '*', service: 'wiser', effect: 'deny' }],
    },
  });
  const denied = await gwDeny.execute({ action: 'wiser.route.ask', input: ASK });
  assert.equal(denied.status, 'denied');
  assertVersionsNull(lastAuditLine(auditDeny).line);

  const extra = 'wiser.secret.write';
  const undeclared = createFakeClassifier({ ids: [...SIX, extra] });
  const { gw: gwExtra, audit: auditExtra } = await createTestGateway({
    classifier: undeclared,
    connectors: [],
  });
  const refused = await gwExtra.execute({ action: extra, input: {} });
  assert.equal(refused.status, 'needs_connector');
  assert.equal(refused.reason, 'undeclared');
  assert.equal(undeclared.calls.length, 0);
  assertVersionsNull(lastAuditLine(auditExtra).line);
});

test('a missing confidence is unavailable and is not filled in', async () => {
  const secret = 'sk-live-credential-9f3a';
  const { gw, audit } = await createTestGateway({
    classifier: createFakeClassifier({
      result: {
        family: 'skill',
        target: 'example',
        pass: true,
        note: secret,
        meta: { model: 'jev-1.13.0', bar: null, calibrated_model_version: null, leak: secret },
      },
    }),
    connectors: [],
  });
  const result = await gw.execute({ action: 'wiser.route.ask', input: ASK });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.reason, 'malformed answer');
  assert.equal('confidence' in result, false);
  assert.equal(result.pass, undefined);
  assert.equal(result.family, undefined);
  assert.equal(JSON.stringify(result).includes(secret), false);
  const { raw, line } = lastAuditLine(audit);
  assert.equal(raw.includes(secret), false);
  assert.equal(line.model, 'jev-1.13.0');
  assert.equal(line.calibrated_model_version, null);
  assert.equal('calibrated_model_version' in line, true);

  const { gw: gwNull } = await createTestGateway({
    classifier: createFakeClassifier({
      result: { family: 'none', target: null, confidence: null, pass: false },
    }),
    connectors: [],
  });
  const abstained = await gwNull.execute({ action: 'wiser.route.ask', input: ASK });
  assert.equal(abstained.confidence, null);
  assert.equal(abstained.pass, false);
  assert.equal(abstained.status, undefined);

  const { gw: gwKept } = await createTestGateway({
    classifier: createFakeClassifier({
      result: { ...ASK_OK, confidence: 0.42 },
    }),
    connectors: [],
  });
  const kept = await gwKept.execute({ action: 'wiser.route.ask', input: ASK });
  assert.equal(kept.confidence, 0.42);
  assert.equal(kept.status, undefined);
});

test('a choice outside the roster sent with the call is unavailable and is not replaced', async () => {
  const input = { decision: 'ship it', options: ['keep', 'drop'], allow_uncalibrated: true };
  const { gw } = await createTestGateway({
    classifier: createFakeClassifier({
      result: { choice: 'destroy', confidence: 0.8, calibrated: false },
    }),
    connectors: [],
  });
  const result = await gw.execute({ action: 'wiser.decide.choice', input });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.reason, 'malformed answer');
  assert.equal(result.choice, undefined);
  assert.equal(JSON.stringify(result).includes('destroy'), false);
  assert.equal(JSON.stringify(result).includes('keep'), false);

  const { gw: gwOk } = await createTestGateway({
    classifier: createFakeClassifier({
      result: { choice: 'keep', confidence: 0.8, calibrated: false },
    }),
    connectors: [],
  });
  const kept = await gwOk.execute({ action: 'wiser.decide.choice', input });
  assert.equal(kept.choice, 'keep');
  assert.equal(kept.confidence, 0.8);
  assert.equal(kept.status, undefined);

  const rankInput = { question: 'which', candidates: [{ id: 'a', text: 'alpha' }], allow_uncalibrated: true };
  const { gw: gwRank } = await createTestGateway({
    classifier: createFakeClassifier({
      result: { ranked: [{ id: 'nope', p: 0.4, calibrated: false }], calibrated: false },
    }),
    connectors: [],
  });
  const ranked = await gwRank.execute({ action: 'wiser.recall.rank', input: rankInput });
  assert.equal(ranked.status, 'unavailable');
  assert.equal(ranked.reason, 'malformed answer');
  assert.equal(ranked.ranked, undefined);

  const gateInput = { kind: 'expert', criteria: [{ index: 0, text: 'a line' }], deliverable: 'd' };
  const { gw: gwGate } = await createTestGateway({
    classifier: createFakeClassifier({
      result: { judgments: [{ index: 99, verdict: 'fail', p: 0.1 }] },
    }),
    connectors: [],
  });
  const judged = await gwGate.execute({ action: 'wiser.gate.check', input: gateInput });
  assert.equal(judged.status, 'unavailable');
  assert.equal(judged.reason, 'malformed answer');
  assert.equal(judged.judgments, undefined);
});

test('a non-numeric probability is unavailable and is not coerced', async () => {
  const input = { decision: 'ship it', options: ['keep'], allow_uncalibrated: true };
  const { gw } = await createTestGateway({
    classifier: createFakeClassifier({
      result: { choice: 'keep', confidence: '0.8', calibrated: false },
    }),
    connectors: [],
  });
  const result = await gw.execute({ action: 'wiser.decide.choice', input });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.reason, 'malformed answer');
  assert.equal(result.confidence, undefined);
  assert.equal(JSON.stringify(result).includes('0.8'), false);

  const { gw: gwWide } = await createTestGateway({
    classifier: createFakeClassifier({
      result: { choice: 'keep', confidence: 1.5, calibrated: false },
    }),
    connectors: [],
  });
  const wide = await gwWide.execute({ action: 'wiser.decide.choice', input });
  assert.equal(wide.status, 'unavailable');
  assert.equal(wide.reason, 'malformed answer');
  assert.notEqual(wide.confidence, 1);

  const { gw: gwBelow } = await createTestGateway({
    classifier: createFakeClassifier({
      result: { status: 'below_threshold', p: '0.4' },
    }),
    connectors: [],
  });
  const below = await gwBelow.execute({ action: 'wiser.route.ask', input: ASK });
  assert.equal(below.status, 'unavailable');
  assert.equal(below.reason, 'malformed answer');
  assert.notEqual(below.p, 0.4);

  const { gw: gwUnit } = await createTestGateway({
    classifier: createFakeClassifier({
      result: { status: 'below_threshold', p: 0.4 },
    }),
    connectors: [],
  });
  const unit = await gwUnit.execute({ action: 'wiser.route.ask', input: ASK });
  assert.equal(unit.status, 'below_threshold');
  assert.equal(unit.p, 0.4);

  const { gw: gwGate } = await createTestGateway({
    classifier: createFakeClassifier({
      result: { judgments: [{ index: 0, verdict: 'fail', p: '0.1' }] },
    }),
    connectors: [],
  });
  const judged = await gwGate.execute({
    action: 'wiser.gate.check',
    input: { kind: 'expert', criteria: ['a line'], deliverable: 'd' },
  });
  assert.equal(judged.status, 'unavailable');
  assert.equal(judged.reason, 'malformed answer');
  assert.equal(judged.judgments, undefined);
});

test('browser pick keeps a non-string verb', async () => {
  const { gw } = await createTestGateway({
    classifier: createFakeClassifier({
      result: { index: 0, verb: 7, confidence: 0.5, calibrated: false },
    }),
    connectors: [],
  });
  const result = await gw.execute({
    action: 'wiser.browser.pick',
    input: { goal: 'go', elements: [{ verb: 7 }], allow_uncalibrated: true },
  });
  assert.equal(result.verb, 7);
  assert.equal(result.index, 0);
  assert.equal(result.confidence, 0.5);
  assert.equal(result.status, undefined);
});

test('an unexpected model version is a mismatch and not a scored judgment', async () => {
  const { gw, audit } = await contractGateway();
  const result = await withFetch(
    async () => okJson(gateBody('jev-9.99.9')),
    () => gw.execute({ action: 'wiser.gate.check', input: GATE }),
  );
  assert.equal(result.status, 'unavailable');
  assert.equal(result.reason, 'model_version_mismatch');
  assert.equal(result.calibrated_on, 'jev-1.13.0');
  assert.equal(result.answered_by, 'jev-9.99.9');
  assert.equal(result.judgments, undefined);
  assert.equal(result.meta.model, 'jev-9.99.9');
  assert.equal(result.meta.bar, 'gate.T_fail');
  assert.equal(result.meta.calibrated_model_version, 'jev-1.13.0');
  const { raw, line } = lastAuditLine(audit);
  assert.equal(line.status, 'unavailable');
  assert.equal(line.model, 'jev-9.99.9');
  assert.equal(line.calibrated_model_version, 'jev-1.13.0');
  assert.equal('reason' in line, false);
  assert.equal('calibrated_on' in line, false);
  assert.equal('answered_by' in line, false);
  assert.equal(raw.includes('model_version_mismatch'), false);
  assert.equal(raw.includes('answered_by'), false);
  assert.equal(raw.includes('calibrated_on'), false);
});

test('the expected model version passes and is scored against the bar', async () => {
  const { gw, audit } = await contractGateway();
  const result = await withFetch(
    async () => okJson(gateBody('jev-1.13.0')),
    () => gw.execute({ action: 'wiser.gate.check', input: GATE }),
  );
  assert.equal(result.status, undefined);
  assert.equal(result.reason, undefined);
  assert.equal(result.judgments.length, 1);
  assert.equal(result.judgments[0].verdict, 'fail');
  assert.equal(result.judgments[0].p, 0.1);
  assert.equal(result.meta.model, 'jev-1.13.0');
  assert.equal(result.meta.bar, 'gate.T_fail');
  assert.equal(result.meta.calibrated_model_version, 'jev-1.13.0');
  const { line } = lastAuditLine(audit);
  assert.equal(line.status, 'ok');
  assert.equal(line.model, 'jev-1.13.0');
  assert.equal(line.calibrated_model_version, 'jev-1.13.0');
});

test('an envelope with no model version is a mismatch and not a pass', async () => {
  const { gw, audit } = await contractGateway();
  const absent = await withFetch(
    async () => okJson(gateBody()),
    () => gw.execute({ action: 'wiser.gate.check', input: GATE }),
  );
  assert.equal(absent.status, 'unavailable');
  assert.equal(absent.reason, 'model_version_mismatch');
  assert.equal(absent.answered_by, 'unknown');
  assert.equal(absent.judgments, undefined);
  assert.equal(absent.meta.model, 'unknown');
  assert.equal(absent.meta.bar, 'gate.T_fail');
  assert.equal(absent.meta.calibrated_model_version, 'jev-1.13.0');
  const absentLine = lastAuditLine(audit).line;
  assert.equal(absentLine.status, 'unavailable');
  assert.equal(absentLine.model, 'unknown');
  assert.equal(absentLine.calibrated_model_version, 'jev-1.13.0');

  const { gw: gwEmpty, audit: auditEmpty } = await contractGateway();
  const empty = await withFetch(
    async () => okJson(gateBody('')),
    () => gwEmpty.execute({ action: 'wiser.gate.check', input: GATE }),
  );
  assert.equal(empty.status, 'unavailable');
  assert.equal(empty.reason, 'model_version_mismatch');
  assert.equal(empty.answered_by, 'unknown');
  assert.equal(empty.judgments, undefined);
  assert.equal(empty.meta.model, 'unknown');
  assert.equal(lastAuditLine(auditEmpty).line.model, 'unknown');
  assert.notEqual(lastAuditLine(auditEmpty).line.status, 'ok');
});

test('an alias compares a bar without posting, and a bad envelope is read without a bar', async () => {
  const { gw, audit } = await contractGateway();
  const held = await gw.execute({
    action: 'wiser.route.roster',
    input: {
      rows: [{
        family: 'skill',
        name: 'Housekeeping',
        description: 'root hygiene',
        body: 'Housekeeping keeps a root current.\n',
      }],
    },
  });
  assert.equal(typeof held.roster_sha256, 'string');
  assert.deepEqual(Object.keys(held.meta).sort(), ['bar', 'calibrated_model_version', 'model']);
  assert.equal(held.meta.model, null);
  assert.equal(held.meta.bar, null);
  assert.equal(held.meta.calibrated_model_version, null);
  assertVersionsNull(lastAuditLine(audit).line);

  let fetched = 0;
  const aliased = await withFetch(async () => {
    fetched += 1;
    return { ok: false, status: 400, json: async () => ({}) };
  }, () => gw.execute({
    action: 'wiser.route.ask',
    input: { ask: 'update root', roster_sha256: held.roster_sha256 },
  }));
  assert.equal(fetched, 0);
  assert.equal(aliased.family, 'skill');
  assert.equal(aliased.target, 'Housekeeping');
  assert.equal(aliased.confidence, 1);
  assert.equal(aliased.pass, true);
  assert.equal(aliased.meta.model, null);
  assert.equal(aliased.meta.bar, 'routing.target_r2');
  assert.equal(aliased.meta.calibrated_model_version, null);

  const malformed = await withFetch(
    async () => okJson({ model: 'jev-1.13.0', answers: null }),
    () => gw.execute({
      action: 'wiser.route.ask',
      input: { ask: 'not an alias phrase', roster_sha256: held.roster_sha256 },
    }),
  );
  assert.equal(malformed.status, 'unavailable');
  assert.equal(malformed.reason, 'malformed answer');
  assert.equal(malformed.family, undefined);
  assert.equal(malformed.meta.model, 'jev-1.13.0');
  assert.equal(malformed.meta.bar, null);
  assert.equal(malformed.meta.calibrated_model_version, null);
});

test('routing names the later envelope it read', async () => {
  const { gw } = await contractGateway();
  const held = await gw.execute({
    action: 'wiser.route.roster',
    input: {
      rows: [{
        family: 'skill',
        name: 'Housekeeping',
        description: 'root hygiene',
        body: 'Housekeeping keeps a root current.\n',
      }],
    },
  });
  const choice = { choice: 'none', confidence: 0.9 };
  const bodies = [
    {
      model: 'jev-pass-1',
      answers: {
        skill: choice,
        expert: choice,
        tool: choice,
        named_output: { noul: 0.1 },
        prose_suffices: { noul: 0.1 },
        host_native: { noul: 0.1 },
      },
    },
    {
      model: 'jev-pass-2',
      answers: { names_set: { noul: 0.2 } },
    },
  ];
  let n = 0;
  const result = await withFetch(async () => okJson(bodies[n++]), () => gw.execute({
    action: 'wiser.route.ask',
    input: { ask: 'not an alias phrase', roster_sha256: held.roster_sha256 },
  }));
  assert.equal(n, 2);
  assert.equal(result.family, 'none');
  assert.equal(result.target, null);
  assert.equal(result.confidence, null);
  assert.equal(result.pass, false);
  assert.equal(result.meta.model, 'jev-pass-2');
  assert.equal(result.meta.bar, null);
  assert.equal(result.meta.calibrated_model_version, null);
});

test('a nested or overlong meta member reaches neither the caller nor the audit line', async () => {
  const marker = 'meta-marker-9f3a';
  const nested = { key: marker };
  const long = marker + 'x'.repeat(400);
  const plants = [
    { model: nested, bar: long, calibrated_model_version: nested },
    { model: long, bar: nested, calibrated_model_version: long },
  ];
  for (const meta of plants) {
    const { gw, audit } = await createTestGateway({
      classifier: createFakeClassifier({
        result: { family: 'skill', target: 'example', pass: true, meta },
      }),
      connectors: [],
    });
    const malformed = await gw.execute({ action: 'wiser.route.ask', input: ASK });
    assert.equal(malformed.status, 'unavailable');
    assert.equal(malformed.reason, 'malformed answer');
    assert.equal(malformed.meta.model, null);
    assert.equal(malformed.meta.bar, null);
    assert.equal(malformed.meta.calibrated_model_version, null);
    assert.equal(JSON.stringify(malformed).includes(marker), false);
    const malformedAudit = lastAuditLine(audit);
    assert.equal(malformedAudit.raw.includes(marker), false);
    assert.equal(malformedAudit.line.model, null);
    assert.equal(malformedAudit.line.calibrated_model_version, null);

    const { gw: gwOk, audit: auditOk } = await createTestGateway({
      classifier: createFakeClassifier({
        result: { ...ASK_OK, meta },
      }),
      connectors: [],
    });
    const ok = await gwOk.execute({ action: 'wiser.route.ask', input: ASK });
    assert.equal(ok.status, undefined);
    assert.equal(ok.family, 'skill');
    assert.equal(ok.meta.model, null);
    assert.equal(ok.meta.bar, null);
    assert.equal(ok.meta.calibrated_model_version, null);
    assert.equal(JSON.stringify(ok).includes(marker), false);
    assert.equal(lastAuditLine(auditOk).raw.includes(marker), false);

    const { gw: gwStatus, audit: auditStatus } = await createTestGateway({
      classifier: createFakeClassifier({
        result: { status: 'unavailable', reason: 'model_version_mismatch', meta },
      }),
      connectors: [],
    });
    const status = await gwStatus.execute({ action: 'wiser.route.ask', input: ASK });
    assert.equal(status.status, 'unavailable');
    assert.equal(status.meta.model, null);
    assert.equal(status.meta.bar, null);
    assert.equal(status.meta.calibrated_model_version, null);
    assert.equal(JSON.stringify(status).includes(marker), false);
    assert.equal(lastAuditLine(auditStatus).raw.includes(marker), false);
  }
});

test('a thrown StatusSignal is adapter_error and its marker reaches neither the answer nor the audit line', async () => {
  const marker = 'status-signal-marker-9f3a';
  const { gw, audit } = await createTestGateway({
    classifier: createFakeClassifier({
      throw: new StatusSignal({ status: 'unavailable', reason: marker, note: marker }),
    }),
    connectors: [],
  });
  let threw = null;
  let result;
  try {
    result = await gw.execute({ action: 'wiser.route.ask', input: ASK });
  } catch (err) {
    threw = err;
  }
  assert.equal(threw, null);
  assert.equal(result.status, 'unavailable');
  assert.equal(result.reason, 'adapter_error');
  assert.equal(JSON.stringify(result).includes(marker), false);
  const { raw, line } = lastAuditLine(audit);
  assert.equal(raw.includes(marker), false);
  assert.equal(line.status, 'unavailable');
  assert.equal('reason' in line, false);
});

test('a vendor_error conversion keeps the model the adapter supplied on the audit line', async () => {
  const { gw, audit } = await createTestGateway({
    classifier: createFakeClassifier({
      result: {
        status: 502,
        error: { code: 'vendor_error', endpoint: '/classify', method: 'POST' },
        meta: { model: 'jev-1.13.0', bar: 'gate.T_fail', calibrated_model_version: 'jev-1.13.0' },
      },
    }),
    connectors: [],
  });
  const result = await gw.execute({ action: 'wiser.route.ask', input: ASK });
  assert.equal(result.status, 'vendor_error');
  assert.equal(result.http_status, 502);
  assert.equal(result.endpoint, '/classify');
  assert.equal(result.method, 'POST');
  const line = lastAuditLine(audit).line;
  assert.equal(line.model, 'jev-1.13.0');
  assert.equal(line.calibrated_model_version, 'jev-1.13.0');
  assert.equal(line.status, 'vendor_error');
});

// ------------------------------------------- round 2: the ways round the projection

test('an adapter toJSON does not choose what the caller is sent', async () => {
  // Round 2 of adversarial review. The projection nulled `meta.model` in
  // memory while the adapter's own `toJSON` survived the spread, so the RPC
  // layer's JSON.stringify called it and returned the payload anyway. The
  // projection owns the serialisation now, so the assertion is on the
  // serialised form and not on the live object.
  const MARKER = 'tojson-marker-4b81e2';
  const { gw, audit } = await createTestGateway({
    classifier: createFakeClassifier({
      result: {
        status: 'unavailable',
        meta: { model: { secret: MARKER }, bar: null, calibrated_model_version: null },
        toJSON() { return { meta: { model: { secret: MARKER } } }; },
      },
    }),
    connectors: [],
  });
  const result = await gw.execute({ action: 'wiser.route.ask', input: ASK });
  assert.equal(JSON.stringify(result).includes(MARKER), false);
  assert.equal(typeof result.toJSON, 'undefined');
  assert.equal(result.meta.model, null);
  const { raw } = lastAuditLine(audit);
  assert.equal(raw.includes(MARKER), false);
});

test('an inherited meta is projected, not returned whole', async () => {
  // Round 2. `plainMeta` reads `result.meta`, which walks the prototype, but
  // the projection keyed on Object.hasOwn, so an inherited meta was read for
  // the audit line and handed to the caller unprojected.
  const MARKER = 'inherited-marker-9d27fa';
  const proto = { meta: { model: { secret: MARKER }, bar: null, calibrated_model_version: null } };
  const { gw, audit } = await createTestGateway({
    classifier: createFakeClassifier({
      result: Object.assign(Object.create(proto), { status: 'unavailable' }),
    }),
    connectors: [],
  });
  const result = await gw.execute({ action: 'wiser.route.ask', input: ASK });
  assert.equal(JSON.stringify(result).includes(MARKER), false);
  assert.equal(result.meta.model, null);
  const { raw } = lastAuditLine(audit);
  assert.equal(raw.includes(MARKER), false);
});

test('a projected result cannot set a prototype through __proto__', async () => {
  const { gw } = await createTestGateway({
    classifier: createFakeClassifier({
      result: JSON.parse('{"status":"unavailable","__proto__":{"polluted":true}}'),
    }),
    connectors: [],
  });
  const result = await gw.execute({ action: 'wiser.route.ask', input: ASK });
  assert.equal(result.status, 'unavailable');
  assert.equal({}.polluted, undefined);
  assert.equal(Object.hasOwn(result, '__proto__'), false);
});

test('the classifier key is never logged as a version fact, whatever the adapter calls it', async () => {
  // Round 2. The projection stopped a nested payload and an oversized one. A
  // credential is neither: it is a short string, and length cannot tell it
  // from a version. The one key this process holds is compared directly.
  const home = makeHome();
  const envPath = join(home, 'auth-provider.env');
  const KEY = 'sk-live-classifier-3e91c7';
  writeFileSync(envPath, `WISER_AUTH_PROVIDER_KEY=\nWISER_CLASSIFIER_KEY=${KEY}\n`);
  const { gw, audit } = await createTestGateway({
    classifier: createFakeClassifier({
      result: { status: 'unavailable', meta: { model: KEY, bar: null, calibrated_model_version: KEY } },
    }),
    connectors: [],
    envPath,
    home,
    authConfigured: false,
  });
  const result = await gw.execute({ action: 'wiser.route.ask', input: ASK });
  assert.equal(result.status, 'unavailable');
  const { raw, line } = lastAuditLine(audit);
  assert.equal(raw.includes(KEY), false);
  assert.equal(line.model, null);
  assert.equal(line.calibrated_model_version, null);
  assert.equal('model' in line, true);
  assert.equal('calibrated_model_version' in line, true);
});
