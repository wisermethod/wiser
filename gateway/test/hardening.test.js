import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createTestGateway, putActive, makeHome } from './fake-provider.js';
import { validateArgs } from '../src/gateway.js';
import { loadConnector } from '../src/manifest.js';
import { buildContext } from '../src/context.js';

const SERVER = fileURLToPath(new URL('../server.js', import.meta.url));
const GATEWAY_DIR = dirname(SERVER);

test('tool arguments that are not identifiers are refused before audit', async () => {
  const { gw, audit } = await createTestGateway();
  const r1 = await gw.callTool('start_connect', { service: { api_key: 'x' }, module: 'dns' });
  assert.equal(r1.status, 'invalid_arguments');
  assert.equal(r1.field, 'service');
  const r2 = await gw.callTool('execute', { action: 'github.repos.get', input: 'not-an-object' });
  assert.equal(r2.status, 'invalid_arguments');
  const r3 = await gw.callTool('execute', { action: 'GITHUB.REPOS.GET' });
  assert.equal(r3.status, 'invalid_arguments');
  const { existsSync, readFileSync } = await import('node:fs');
  assert.ok(!existsSync(audit.file) || readFileSync(audit.file, 'utf8').trim() === '');
  assert.equal(validateArgs('describe_action', { action: 'a.b.c' }), null);
});

test('needs_confirmation carries field names and a summary, never the input values', async () => {
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'cloudflare', module: 'dns', privilege: 'write' });
  const r = await gw.execute({ action: 'cloudflare.dns.delete_record', input: { zone_id: 'z', record_id: 'secret-value-123' } });
  assert.equal(r.status, 'needs_confirmation');
  assert.deepEqual(r.input_fields, ['zone_id', 'record_id']);
  assert.equal(JSON.stringify(r).includes('secret-value-123'), false);
});

test('ctx.http refuses plain http and hosts outside the manifest allowlist', async () => {
  const ctx = buildContext({
    service: 's', module: 'm', action: 'a', input: {}, confirm: false,
    auth: { provider: 'local-file', hosts: ['api.example.com'] },
    unwrap: { supported: true, header: 'Authorization', value: 'Bearer fake' },
  });
  await assert.rejects(() => ctx.http({ url: 'http://api.example.com/x' }), (e) => e.object.status === 'denied');
  await assert.rejects(() => ctx.http({ url: 'https://evil.example.net/x' }), (e) => e.object.status === 'denied' && e.object.rule.host === 'evil.example.net');
});

test('a manifest with unwrap_token must list auth.hosts', async () => {
  const dir = join(makeHome(), 'u');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  writeFileSync(join(dir, 'index.js'), 'export const modules = { m: { a: async () => ({}) } };');
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({
    id: 'u', service: 'u',
    modules: { m: { auth: { provider: 'local-file', file: 'u.env', scheme: 'API_KEY', privilege: 'read' }, unwrap_token: true,
      actions: { a: { risk: 'low', confirmation: 'none', execution: { prefer: 'local_http' } } } } },
  }));
  await assert.rejects(() => loadConnector(dir), /auth\.hosts/);
});

test('a provider transport failure on status leaves the record untouched', async () => {
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'github', module: 'repos', privilege: 'write' });
  const before = store.getConnection({ service: 'github', module: 'repos' });
  fake.auth.status = async () => ({ status: 503, error: { code: 'vendor_error', endpoint: '/x', method: 'GET' } });
  const r = await gw.connectStatus({ service: 'github', module: 'repos' });
  assert.equal(r.status, 'vendor_error');
  const after = store.getConnection({ service: 'github', module: 'repos' });
  assert.equal(after.status, before.status);
});

test('--home inside the plugin or beside a credential file is refused', () => {
  const inside = spawnSync(process.execPath, [SERVER, '--home', join(GATEWAY_DIR, 'state')], { encoding: 'utf8' });
  assert.equal(inside.status, 1);
  assert.match(inside.stderr, /outside this plugin/);
  const dir = mkdtempSync(join(tmpdir(), 'wiser-sec-'));
  const env = join(dir, 'auth-provider.env');
  writeFileSync(env, 'WISER_AUTH_PROVIDER_KEY=fake\n');
  const beside = spawnSync(process.execPath, [SERVER, '--env', env, '--home', join(dir, 'home')], { encoding: 'utf8' });
  assert.equal(beside.status, 1);
  assert.match(beside.stderr, /credential file/);
});

test('confirmation echoes only declared field names and counts the rest', async () => {
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'cloudflare', module: 'dns', privilege: 'write' });
  const r = await gw.execute({ action: 'cloudflare.dns.delete_record', input: { zone_id: 'z', 'leaked-secret-name': 'x' } });
  assert.equal(r.status, 'needs_confirmation');
  assert.deepEqual(r.input_fields, ['zone_id']);
  assert.equal(r.undeclared_fields, 1);
  assert.equal(JSON.stringify(r).includes('leaked-secret-name'), false);
});

test('a symlinked --home is refused before it is resolved', async () => {
  const { symlinkSync } = await import('node:fs');
  const dir = mkdtempSync(join(tmpdir(), 'wiser-link-'));
  const target = join(dir, 'real'); mkdirSync(target);
  const link = join(dir, 'link'); symlinkSync(target, link);
  const run = spawnSync(process.execPath, [SERVER, '--home', link], { encoding: 'utf8' });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /symbolic link/);
});
