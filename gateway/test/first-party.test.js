import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { STATUS, isStatusObject } from '../src/errors.js';
import { loadPolicy } from '../src/policy.js';
import { FIRST_PARTY_ACTIONS } from '../src/resolve.js';
import { createTestGateway, DEFAULT_POLICY, makeHome } from './fake-provider.js';

const SERVER = fileURLToPath(new URL('../server.js', import.meta.url));
const SIX = Object.keys(FIRST_PARTY_ACTIONS);
const ASK = { ask: 'what should I load', roster_sha256: 'abc' };
const OPERATOR_DIR = ['z', 'Builds', 'playbooks', 'gates', 'classifier'].join('/');

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
      return { ok: true, actionId: req && req.actionId };
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
        return { ok: true, who: 'A', key: req.key };
      },
    });
    const classifierB = createFakeClassifier({
      execute: async (req) => {
        seenB = req.key;
        envReads.push(process.env['WISER_CLASSIFIER_KEY']);
        started += 1;
        await holdB.gate;
        envReads.push(process.env['WISER_CLASSIFIER_KEY']);
        return { ok: true, who: 'B', key: req.key };
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
        return { ok: true };
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
        return { ok: true, key_present: true };
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
    'TypeSafeAI',
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
  const vendor = 'TypeSafeAI';
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
