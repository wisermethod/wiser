import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createTestGateway, makeHome, putActive } from './fake-provider.js';

test('execute with no record returns needs_connect and starts nothing', async () => {
  const { gw, fake } = await createTestGateway();
  const initiated = fake.accounts.size;
  const result = await gw.execute({
    action: 'github.repos.get',
    input: { owner: 'example-org', repo: 'example-repo' },
  });
  assert.equal(result.status, 'needs_connect');
  assert.equal(result.service, 'github');
  assert.equal(result.module, 'repos');
  assert.equal(fake.accounts.size, initiated);
});

test('needs_confirmation carries the manifest description, or null when none is declared', async () => {
  const root = makeHome();
  const dir = join(root, 'example');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({
    id: 'example',
    service: 'example',
    modules: {
      items: {
        auth: { provider: 'catalog', toolkit: 'FAKE_KIT', scheme: 'OAUTH2', privilege: 'write' },
        unwrap_token: false,
        fallback: 'none',
        actions: {
          priced: {
            description: 'Example billed call at $0.01 per call',
            risk: 'medium',
            confirmation: 'always',
            execution: { prefer: 'proxy' },
            input: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
          },
          silent: {
            risk: 'medium',
            confirmation: 'always',
            execution: { prefer: 'proxy' },
            input: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
          },
        },
      },
    },
  }));
  writeFileSync(join(dir, 'index.js'), 'export const modules = { items: { priced: async () => ({ ok: true }), silent: async () => ({ ok: true }) } };\n');
  const { gw, store, fake } = await createTestGateway({ connectorDirs: [root] });
  await putActive(store, fake, { service: 'example', module: 'items', privilege: 'write' });

  const priced = await gw.execute({ action: 'example.items.priced', input: { id: 'item-1' } });
  assert.equal(priced.status, 'needs_confirmation');
  assert.equal(priced.description, 'Example billed call at $0.01 per call');
  assert.equal(
    priced.summary,
    'example.items.priced on example/items with id; risk medium; Example billed call at $0.01 per call',
  );

  const silent = await gw.execute({ action: 'example.items.silent', input: { id: 'item-1' } });
  assert.equal(silent.status, 'needs_confirmation');
  assert.equal(silent.description, null);
  assert.equal(silent.summary, 'example.items.silent on example/items with id; risk medium');
});

test('execute with confirmation always without confirm returns needs_confirmation; with confirm runs', async () => {
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'cloudflare', module: 'dns', privilege: 'write' });

  const denied = await gw.execute({
    action: 'cloudflare.dns.batch',
    input: { zone_id: 'zone-example', deletes: [], posts: [] },
  });
  assert.equal(denied.status, 'needs_confirmation');
  assert.equal(denied.action, 'cloudflare.dns.batch');

  const ran = await gw.execute({
    action: 'cloudflare.dns.batch',
    input: { zone_id: 'zone-example', deletes: [], posts: [] },
    confirm: true,
  });
  assert.notEqual(ran.status, 'needs_confirmation');
  assert.equal(ran.success, true);
  assert.equal(Object.hasOwn(ran, 'headers'), false);
});

test('policy readonly plus write is denied', async () => {
  const { gw, store, fake } = await createTestGateway({ role: 'readonly' });
  await putActive(store, fake, { service: 'github', module: 'repos', privilege: 'write' });
  const result = await gw.execute({
    action: 'github.repos.get',
    input: { owner: 'example-org', repo: 'example-repo' },
  });
  assert.equal(result.status, 'denied');
  assert.equal(result.rule.effect, 'deny');
});

test('audit line contains no input key', async () => {
  const { gw, store, fake, audit } = await createTestGateway();
  await putActive(store, fake, { service: 'github', module: 'repos', privilege: 'write' });
  await gw.execute({
    action: 'github.repos.get',
    input: { owner: 'example-org', repo: 'example-repo', token: 'should-not-be-logged' },
  });
  const raw = readFileSync(audit.file, 'utf8').trim();
  assert.ok(raw.length > 0);
  const line = JSON.parse(raw.split('\n').pop());
  assert.equal('input' in line, false);
  assert.equal('output' in line, false);
  assert.equal('headers' in line, false);
  assert.equal(line.op, 'execute');
  assert.equal(line.action, 'github.repos.get');
  assert.ok(line.cid);
});

test('execute without provider credential returns needs_provider', async () => {
  const { gw } = await createTestGateway({ authConfigured: false });
  const result = await gw.execute({
    action: 'github.repos.get',
    input: { owner: 'example-org', repo: 'example-repo' },
  });
  assert.equal(result.status, 'needs_provider');
  assert.equal(typeof result.setup, 'string');
});

test('an action with a mapping row but no manifest row never runs', async () => {
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'github', module: 'repos', privilege: 'write' });
  fake.catalog.setSlug('github.repos.delete', 'FAKE_REPOS_DELETE'); fake.catalog.setResult('FAKE_REPOS_DELETE', { deleted: true });
  const result = await gw.execute({ action: 'github.repos.delete', input: { owner: 'example-org', repo: 'example-repo' } });
  assert.equal(result.status, 'needs_connector');
});

test('bare server start serves rather than printing help', async () => {
  const { spawnSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const server = fileURLToPath(new URL('../server.js', import.meta.url));
  const { mkdtempSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const root = mkdtempSync(join(tmpdir(), 'wiser-gw-'));
  const home = join(root, 'state');
  const init = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } });
  const run = spawnSync(process.execPath, [server, '--home', home], {
    input: `${init}\n`,
    encoding: 'utf8',
    timeout: 10000,
    env: {
      ...process.env,
      HOME: root,
      USERPROFILE: root,
      APPDATA: join(root, 'AppData', 'Roaming'),
      XDG_CONFIG_HOME: join(root, '.config'),
    },
  });
  assert.ok(!run.stdout.includes('Usage:'), 'must not print usage');
  const first = JSON.parse(run.stdout.trim().split('\n')[0]);
  assert.equal(first.id, 1);
  assert.equal(first.result.serverInfo.name, 'wiser-gateway');
  const { existsSync: exists } = await import('node:fs');
  const { defaultProviderEnvPath } = await import('../src/paths.js');
  assert.equal(exists(defaultProviderEnvPath(process.platform, {
    APPDATA: join(root, 'AppData', 'Roaming'),
    XDG_CONFIG_HOME: join(root, '.config'),
  }, root)), true);
});
