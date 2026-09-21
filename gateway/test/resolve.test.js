import { test } from 'node:test';
import assert from 'node:assert/strict';

import { firstPartyDef, parseActionId, resolveAction, resolveFirstPartyMcp } from '../src/resolve.js';
import { createTestGateway, putActive } from './fake-provider.js';

test('parseActionId splits service.module.action', () => {
  assert.deepEqual(parseActionId('github.repos.get'), { service: 'github', module: 'repos', action: 'get' });
  assert.equal(parseActionId('nope'), null);
});

test('resolveFirstPartyMcp misses without a classifier and on a non-wiser id', () => {
  assert.equal(resolveFirstPartyMcp('github.repos.get'), null);
  assert.equal(resolveFirstPartyMcp('wiser.route.ask'), null);
  assert.equal(resolveFirstPartyMcp('wiser.route.ask', { actions: () => ['wiser.gate.check'] }), null);
  // Positive control: a stub that always returns null fails here.
  const hit = resolveFirstPartyMcp('wiser.route.ask', { actions: () => ['wiser.route.ask'] });
  assert.equal(hit.parsed.service, 'wiser');
  assert.equal(typeof hit.fn, 'function');
});

test('firstPartyDef returns a declaration only for a named first-party id', () => {
  assert.equal(firstPartyDef('wiser.route.ask').privilege, 'read');
  assert.equal(firstPartyDef('wiser.secret.write'), null);
  assert.equal(firstPartyDef('github.repos.get'), null);
});

test('resolveFirstPartyMcp resolves a wiser id against a loaded classifier', () => {
  const classifier = {
    name: 'direct',
    actions: () => ['wiser.route.ask'],
    describe: () => ({ request: { ask: 'string' }, answer: {} }),
    execute: async () => ({ ok: true }),
  };
  const hit = resolveFirstPartyMcp('wiser.route.ask', classifier);
  assert.equal(typeof hit.fn, 'function');
  assert.equal(hit.def.privilege, 'read');
  assert.equal(hit.def.risk, 'low');
  assert.equal(hit.parsed.service, 'wiser');
  const resolved = resolveAction('wiser.route.ask', { connectors: [], classifier });
  assert.equal(resolved.path, 'first_party_mcp');
  assert.equal(typeof resolved.fn, 'function');
});

test('resolution falls from connector to catalog to needs_connector', async () => {
  const { gw, store, fake, connectors } = await createTestGateway();
  await putActive(store, fake, { service: 'github', module: 'repos' });

  const connectorHit = resolveAction('github.repos.get', {
    connectors,
    catalogProvider: fake.catalog,
  });
  assert.equal(connectorHit.path, 'connector');

  const catalogHit = resolveAction('fake.echo.run', {
    connectors,
    catalogProvider: fake.catalog,
  });
  assert.equal(catalogHit.path, 'catalog');

  const none = resolveAction('nope.gone.missing', {
    connectors,
    catalogProvider: fake.catalog,
  });
  assert.equal(none.path, 'none');

  // Resolution finds the catalog row, but execute refuses an action no manifest
  // declares: it has no privilege, risk or confirmation, so it never runs.
  const catalogRun = await gw.execute({
    action: 'fake.echo.run',
    input: { ping: true },
  });
  assert.equal(catalogRun.status, 'needs_connector');
  assert.equal(catalogRun.reason, 'undeclared');

  await putActive(store, fake, { service: 'fake', module: 'echo', privilege: 'read' });
  const stillRefused = await gw.execute({ action: 'fake.echo.run', input: { ping: true } });
  assert.equal(stillRefused.status, 'needs_connector');

  const missing = await gw.execute({ action: 'nope.gone.missing' });
  assert.equal(missing.status, 'needs_connector');
});
