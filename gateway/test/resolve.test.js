import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseActionId, resolveAction, resolveFirstPartyMcp } from '../src/resolve.js';
import { createTestGateway, putActive } from './fake-provider.js';

test('parseActionId splits service.module.action', () => {
  assert.deepEqual(parseActionId('github.repos.get'), { service: 'github', module: 'repos', action: 'get' });
  assert.equal(parseActionId('nope'), null);
});

test('resolveFirstPartyMcp is a stub that always returns null', () => {
  assert.equal(resolveFirstPartyMcp('github.repos.get'), null);
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
