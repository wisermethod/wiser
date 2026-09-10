import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ConnectionGateway } from '../src/gateway.js';
import { readProviderUserId } from '../src/paths.js';
import { JsonFileStore } from '../src/store.js';

function makeHome() {
  return mkdtempSync(join(tmpdir(), 'wiser-uid-'));
}

function gateway(home, envPath) {
  return new ConnectionGateway({
    home,
    store: new JsonFileStore(home),
    policy: { roles: ['runtime'], default_role: 'runtime', rules: [{ role: '*', effect: 'allow' }] },
    audit: { record() {} },
    authConfigured: true,
    envPath,
  });
}

test('resolveUserId copies a store id into an empty env line', () => {
  const home = makeHome();
  const env = join(home, 'auth-provider.env');
  writeFileSync(env, 'WISER_AUTH_PROVIDER_KEY=already\nWISER_USER_ID=\n', { mode: 0o600 });
  const store = new JsonFileStore(home);
  const id = store.getUserId();
  const gw = gateway(home, env);
  assert.equal(gw.resolveUserId(), id);
  assert.equal(readProviderUserId(env), id);
});

test('resolveUserId prefers env over a different store id', () => {
  const home = makeHome();
  const env = join(home, 'auth-provider.env');
  const envId = 'wiser-11111111-2222-3333-4444-555555555555';
  writeFileSync(env, `WISER_AUTH_PROVIDER_KEY=already\nWISER_USER_ID=${envId}\n`, { mode: 0o600 });
  const store = new JsonFileStore(home);
  store.getUserId();
  const gw = new ConnectionGateway({
    home,
    store,
    policy: { roles: ['runtime'], default_role: 'runtime', rules: [{ role: '*', effect: 'allow' }] },
    audit: { record() {} },
    authConfigured: true,
    envPath: env,
  });
  assert.equal(gw.resolveUserId(), envId);
  assert.equal(store.read().userId, envId);
});
