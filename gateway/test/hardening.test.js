import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
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

test('needs_confirmation carries the values of DECLARED fields, which is the 2026-09-20 change', async () => {
  // This test asserted the opposite until 2026-09-20: that no input value ever
  // appeared. That was the defect holding a public release, not a guarantee. A
  // person approving a deletion was told a record_id had been supplied and not
  // which record. The guarantee that survives is about UNDECLARED keys, below.
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'cloudflare', module: 'dns', privilege: 'write' });
  const r = await gw.execute({ action: 'cloudflare.dns.delete_record', input: { zone_id: 'z', record_id: 'rec-abc-123' } });
  assert.equal(r.status, 'needs_confirmation');
  assert.deepEqual(r.input_fields, ['zone_id', 'record_id']);
  assert.match(r.summary, /zone_id="z", record_id="rec-abc-123"/);
  assert.deepEqual(r.input_values, [
    { name: 'zone_id', value: '"z"', truncated: false },
    { name: 'record_id', value: '"rec-abc-123"', truncated: false },
  ]);
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

test('an undeclared key is refused before the confirmation stop, and never reaches the audit line', async () => {
  // Until 2026-09-20 this call reached the stop, which counted the undeclared key and
  // showed neither its name nor its value. The gateway now validates against the
  // published schema first, so the call is refused and the stop never happens. The
  // hardening property is unchanged and is what is asserted: a caller-chosen key name
  // and its value do not land in a log. `AUDIT_FIELDS` is a closed set of thirteen
  // names and `field` is not one of them.
  const { gw, store, fake, audit } = await createTestGateway();
  await putActive(store, fake, { service: 'cloudflare', module: 'dns', privilege: 'write' });
  // Every declared field supplied, so the refusal is about the undeclared one and not
  // about a missing required field the validator would have reached first.
  const r = await gw.execute({ action: 'cloudflare.dns.delete_record', input: { zone_id: 'z', record_id: 'r', 'leaked-secret-name': 'x' } });
  assert.deepEqual(r, { status: 'invalid_arguments', field: 'leaked-secret-name' });

  const raw = readFileSync(audit.file, 'utf8').trim();
  assert.ok(raw.length > 0, 'the refusal must have been audited at all');
  assert.equal(raw.includes('leaked-secret-name'), false, 'the undeclared key name reached audit.jsonl');
});

test('an input whose first bad key is the empty string is refused, not waved through', async () => {
  // **`validateInput` returns a field name, and `""` is falsy.** A caller writing
  // `if (field)` accepts this input and never reaches `record_id`. With
  // `additionalProperties: false` on every action an empty key is always the offending
  // one, so the bypass was one key away from any caller that got the comparison wrong.
  // Found by adversarial review 2026-09-20 in this validator's own first two callers.
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'cloudflare', module: 'zones', privilege: 'read' });
  fake.auth.proxy = async () => assert.fail('an unvalidated input reached transport');
  // `zones.list` requires nothing, so the empty key is the first and only fault and the
  // required loop cannot mask it. That is the shape of the bypass.
  assert.deepEqual(
    await gw.execute({ action: 'cloudflare.zones.list', input: { '': 0 } }),
    { status: 'invalid_arguments', field: '' });
  // And it must not stop the rest of the input being read: the mistyped `page` behind it
  // is what a truthiness test would have let through to transport.
  assert.equal(
    (await gw.execute({ action: 'cloudflare.zones.list', input: { '': 0, page: 'not-an-integer' } })).status,
    'invalid_arguments');
});

test('an integer enum is applied by the gateway, not only by the module', async () => {
  // `matches` returned early for `integer` and never reached the `enum` check, so two
  // shipped integer enums were published here and applied only in their modules. The
  // family agreed, because the modules do enforce them; what did not hold was the
  // agreement gate's enum probe, which mutated with a string and was answered by the
  // type check. Found by adversarial review 2026-09-20.
  // **Asserted on `matches` and not only through `execute`.** Both shipped integer enums
  // are also enforced by their own modules, so an end-to-end refusal is the same object
  // either way and proves nothing about which layer made it. The unit assertion is the
  // control: it fails on the early return and passes without it.
  const { matches } = await import('../src/input-schema.js');
  assert.equal(matches(2, { type: 'integer', enum: [0, 1, 3] }), false, 'an out-of-enum integer');
  assert.equal(matches(3, { type: 'integer', enum: [0, 1, 3] }), true, 'an in-enum integer');
  assert.equal(matches(1.5, { type: 'integer', enum: [0, 1, 3] }), false, 'a non-integer');
  assert.equal(matches('x', { type: 'array', enum: ['x'] }), false, 'an array type still wins');

  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'google-cloud', module: 'projects', privilege: 'read' });
  assert.deepEqual(
    await gw.execute({ action: 'google-cloud.projects.get_iam_policy', input: { project: 'wiser-method-prod', requested_policy_version: 2 } }),
    { status: 'invalid_arguments', field: 'requested_policy_version' });
  for (const requested_policy_version of [0, 1, 3]) {
    const ok = await gw.execute({ action: 'google-cloud.projects.get_iam_policy', input: { project: 'wiser-method-prod', requested_policy_version } });
    assert.notEqual(ok.status, 'invalid_arguments', String(requested_policy_version));
  }
});

test('confirmation echoes only declared field names and counts the rest', async () => {
  // The stop itself, reached with a call the schema accepts. `undeclared_fields` is
  // structurally 0 now; it is still asserted, because the field still ships and a
  // reader of the status object still has to know what it means.
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'cloudflare', module: 'dns', privilege: 'write' });
  const r = await gw.execute({ action: 'cloudflare.dns.delete_record', input: { zone_id: 'z', record_id: 'r' } });
  assert.equal(r.status, 'needs_confirmation');
  assert.deepEqual(r.input_fields, ['zone_id', 'record_id']);
  assert.equal(r.undeclared_fields, 0);
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
