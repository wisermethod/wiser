import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadPolicy } from '../src/policy.js';
import { createFakeProviders, createTestGateway, DEFAULT_POLICY, makeHome, putActive } from './fake-provider.js';

const REPOS = { service: 'github', module: 'repos' };
const LINK = { status: 'link', url: 'https://example.com/connect', next: 'connectStatus' };

function hostedRoute({ service, module }) {
  return {
    status: 'denied',
    reason: 'hosted_route',
    service,
    module,
    message: `This local gateway does not make this connection. ${service} is connected on the Wiser endpoint, the server that also offers whoami: call start_connect there. The local gateway connects a service only after the person lists it under local_connect in their own policy.json, which is for when they asked for the local gateway by name, or when the Wiser endpoint answered needs_provider_capability or local_only for it. Only the person writes that file.`,
  };
}

function temporaryHome(t) {
  const home = makeHome();
  t.after(() => rmSync(home, { recursive: true, force: true }));
  return home;
}

async function fixture(t, { home = temporaryHome(t), ...options } = {}) {
  const fake = createFakeProviders();
  const initiate = t.mock.method(fake.auth, 'initiate');
  const { gw, store } = await createTestGateway({ home, fake, session: false, ...options });
  const start = (args = REPOS) => gw.callTool('start_connect', args);
  return { gw, store, fake, initiate, start, home };
}

function policyWithListing(local_connect) {
  return { ...loadPolicy({ defaultPath: DEFAULT_POLICY }), local_connect };
}

test('hosted-first refuses a new unlisted provider connection before initiation', async (t) => {
  const { start, initiate, store, home } = await fixture(t, { hostedFirst: true });
  assert.deepEqual(await start(), hostedRoute(REPOS));
  assert.equal(initiate.mock.callCount(), 0);
  assert.deepEqual(store.listConnections(), []);
  const audit = JSON.parse(readFileSync(join(home, 'audit.jsonl'), 'utf8'));
  assert.equal(audit.status, 'denied');
  assert.equal(audit.op, 'startConnect');
  assert.equal(Object.hasOwn(audit, 'reason'), false);
});

test('hosted-first allows a service listed in local_connect', async (t) => {
  const { start, initiate } = await fixture(t, { hostedFirst: true, policy: policyWithListing(['github']) });
  assert.deepEqual(await start(), LINK);
  assert.equal(initiate.mock.callCount(), 1);
});

test('hosted-first allows a listed module and refuses its unlisted sibling', async (t) => {
  const { start, initiate } = await fixture(t, { hostedFirst: true, policy: policyWithListing(['github.repos']) });
  const issues = { service: 'github', module: 'issues' };
  assert.deepEqual(await start(), LINK);
  assert.deepEqual(await start(issues), hostedRoute(issues));
  assert.equal(initiate.mock.callCount(), 1);
});

test('hosted-first allows an unlisted local-file module', async (t) => {
  const localFileProvider = {
    async initiate({ variables }) {
      return { kind: 'file', path: '/fixture/usebouncer.env', variables };
    },
  };
  const initiate = t.mock.method(localFileProvider, 'initiate');
  const { start } = await fixture(t, { hostedFirst: true, localFileProvider });
  assert.deepEqual(await start({ service: 'usebouncer', module: 'verify' }), {
    status: 'file', path: '/fixture/usebouncer.env', variables: ['API_KEY'], next: 'connectStatus',
  });
  assert.equal(initiate.mock.callCount(), 1);
});

test('a gateway without hosted-first allows a new unlisted connection', async (t) => {
  const { start, initiate } = await fixture(t);
  assert.deepEqual(await start(), LINK);
  assert.equal(initiate.mock.callCount(), 1);
});

test('malformed local_connect values and inexact strings do not list a module', async (t) => {
  const { gw, start, initiate } = await fixture(t, { hostedFirst: true });
  for (const listing of ['github', { github: true }, [null, 1, ['github'], { service: 'github' }],
    ['GitHub', 'github.*', 'github.repos ']]) {
    gw.policy = policyWithListing(listing);
    assert.deepEqual(await start(), hostedRoute(REPOS));
  }
  assert.equal(initiate.mock.callCount(), 0);
});

test('a policy denial takes precedence over hosted-first', async (t) => {
  const rule = { op: 'startConnect', service: 'github', effect: 'deny' };
  const { start, initiate } = await fixture(t, { hostedFirst: true, policy: { rules: [rule] } });
  assert.deepEqual(await start(), { status: 'denied', rule });
  assert.equal(initiate.mock.callCount(), 0);
});

test('hosted-first allows execution on an existing unlisted connection', async (t) => {
  const { gw, store, fake, initiate } = await fixture(t, { hostedFirst: true });
  await putActive(store, fake, REPOS);
  const execute = t.mock.method(fake.catalog, 'execute');
  const result = await gw.callTool('execute', {
    action: 'github.repos.get', input: { owner: 'example-org', repo: 'example-repo' },
  });
  assert.equal(result.name, 'example-repo');
  assert.equal(execute.mock.callCount(), 1);
  assert.equal(initiate.mock.callCount(), 0);
});

test('hosted-first refuses an unlisted per-install service before asking for a label', async (t) => {
  const { start, initiate } = await fixture(t, { hostedFirst: true });
  const args = { service: 'wiser-crm', module: 'records' };
  assert.deepEqual(await start(args), hostedRoute(args));
  assert.equal(initiate.mock.callCount(), 0);
});

test('a policy.json overlay replaces rules and preserves local_connect', async (t) => {
  const home = temporaryHome(t);
  const rules = [{ op: 'startConnect', service: 'github', effect: 'allow' }];
  const local_connect = ['github'];
  writeFileSync(join(home, 'policy.json'), JSON.stringify({ rules, local_connect }));
  const policy = loadPolicy({ home, defaultPath: DEFAULT_POLICY });
  assert.deepEqual(policy.rules, rules);
  assert.deepEqual(policy.local_connect, local_connect);
  const { start, initiate } = await fixture(t, { home, hostedFirst: true, policy });
  assert.deepEqual(await start(), LINK);
  assert.equal(initiate.mock.callCount(), 1);
});

test('the local stdio server enables hosted-first', (t) => {
  const root = temporaryHome(t);
  const home = join(root, 'state');
  const credentials = join(root, 'credentials');
  mkdirSync(credentials);
  const envFile = join(credentials, 'provider-fixture');
  writeFileSync(envFile, '');
  const server = fileURLToPath(new URL('../server.js', import.meta.url));
  const messages = [
    { id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
    { method: 'notifications/initialized' },
    { id: 2, method: 'tools/call', params: { name: 'start_connect', arguments: REPOS } },
  ];
  const run = spawnSync(process.execPath, [server, '--home', home, '--env', envFile, '--provider', 'local-file'], {
    input: messages.map((message) => JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n').join(''),
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.equal(run.status, 0, run.error?.message ?? run.stderr);
  const responses = run.stdout.trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(responses.find(({ id }) => id === 1)?.result.serverInfo.name, 'wiser-gateway');
  assert.deepEqual(responses.find(({ id }) => id === 2), {
    jsonrpc: '2.0', id: 2, result: { content: [{ type: 'text', text: JSON.stringify(hostedRoute(REPOS)) }], isError: false },
  });
});
