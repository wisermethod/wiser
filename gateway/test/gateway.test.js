import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createTestGateway, putActive } from './fake-provider.js';

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
  assert.equal(ran.status, 200);
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
  const home = (await import('node:fs')).mkdtempSync((await import('node:path')).join((await import('node:os')).tmpdir(), 'wiser-gw-'));
  const init = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } });
  const run = spawnSync(process.execPath, [server, '--home', home], { input: `${init}\n`, encoding: 'utf8', timeout: 10000 });
  assert.ok(!run.stdout.includes('Usage:'), 'must not print usage');
  const first = JSON.parse(run.stdout.trim().split('\n')[0]);
  assert.equal(first.id, 1);
  assert.equal(first.result.serverInfo.name, 'wiser-gateway');
});
