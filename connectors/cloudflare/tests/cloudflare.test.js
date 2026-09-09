import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

// The gateway is found by walking up from this file, so the test runs at the
// template's depth and at a connector's depth after it is copied.
import { existsSync as __exists } from 'node:fs';
import { dirname as __dirname_, join as __join } from 'node:path';
import { fileURLToPath as __toPath, pathToFileURL as __toUrl } from 'node:url';
function __findGateway() {
  let dir = __toPath(new URL('.', import.meta.url));
  for (let i = 0; i < 8; i += 1) {
    const candidate = __join(dir, 'gateway', 'test', 'fake-provider.js');
    if (__exists(candidate)) return __toUrl(candidate).href;
    const parent = __dirname_(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('gateway/test/fake-provider.js not found above this test');
}
const { createTestGateway, putActive } = await import(__findGateway());

const CONNECTORS = fileURLToPath(new URL('../..', import.meta.url));

test('export_zone goes through proxy on the fake and returns zone_file', async () => {
  const { gw, store, fake } = await createTestGateway({ connectorDirs: [CONNECTORS] });
  await putActive(store, fake, { service: 'cloudflare', module: 'dns', privilege: 'write' });
  const result = await gw.execute({
    action: 'cloudflare.dns.export_zone',
    input: { zone_id: 'zone-example' },
  });
  assert.equal(typeof result.zone_file, 'string');
  assert.match(result.zone_file, /example\.com/);
});

test('batch without confirm returns needs_confirmation', async () => {
  const { gw, store, fake } = await createTestGateway({ connectorDirs: [CONNECTORS] });
  await putActive(store, fake, { service: 'cloudflare', module: 'dns', privilege: 'write' });
  const result = await gw.execute({
    action: 'cloudflare.dns.batch',
    input: { zone_id: 'zone-example', deletes: [], posts: [] },
  });
  assert.equal(result.status, 'needs_confirmation');
  assert.equal(result.action, 'cloudflare.dns.batch');
});

test('zones.list needs_connect until that module is granted', async () => {
  const { gw, store, fake } = await createTestGateway({ connectorDirs: [CONNECTORS] });
  await putActive(store, fake, { service: 'cloudflare', module: 'dns', privilege: 'write' });
  const denied = await gw.execute({ action: 'cloudflare.zones.list', input: {} });
  assert.equal(denied.status, 'needs_connect');
  assert.equal(denied.module, 'zones');
  await putActive(store, fake, { service: 'cloudflare', module: 'zones', privilege: 'write' });
  const listed = await gw.execute({ action: 'cloudflare.zones.list', input: {} });
  assert.equal(listed.status, undefined);
  assert.equal(listed.success, true);
  assert.ok(Array.isArray(listed.result) && listed.result.length >= 1);
  assert.equal(listed.result[0].name, 'example.com');
});

test('pages.list_projects needs its own grant', async () => {
  const { gw, store, fake } = await createTestGateway({ connectorDirs: [CONNECTORS] });
  await putActive(store, fake, { service: 'cloudflare', module: 'dns', privilege: 'write' });
  const denied = await gw.execute({
    action: 'cloudflare.pages.list_projects',
    input: { account_id: 'acct-1' },
  });
  assert.equal(denied.status, 'needs_connect');
  await putActive(store, fake, { service: 'cloudflare', module: 'pages', privilege: 'write' });
  const listed = await gw.execute({
    action: 'cloudflare.pages.list_projects',
    input: { account_id: 'acct-1' },
  });
  assert.equal(listed.success, true);
  assert.equal(listed.result[0].name, 'example-site');
});

test('dns.list_records goes through proxy', async () => {
  const { gw, store, fake } = await createTestGateway({ connectorDirs: [CONNECTORS] });
  await putActive(store, fake, { service: 'cloudflare', module: 'dns', privilege: 'write' });
  const result = await gw.execute({
    action: 'cloudflare.dns.list_records',
    input: { zone_id: 'zone-example' },
  });
  assert.equal(result.success, true);
  assert.equal(result.result_info.total_count, 1);
});

test('get_record uses the proxy object envelope', async () => {
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'cloudflare', module: 'dns' });
  const result = await gw.execute({ action: 'cloudflare.dns.get_record', input: { zone_id: 'zone-example', record_id: 'rec-1' } });
  assert.equal(result.success, true);
  assert.equal(result.result.id, 'rec-1');
  assert.equal(Object.hasOwn(result, 'headers'), false);
});

test('update_record remaps the identifier and executes the catalog after confirmation', async () => {
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'cloudflare', module: 'dns' });
  const action = 'cloudflare.dns.update_record';
  fake.catalog.setResult(fake.catalog.toSlug(action), (args) => {
    assert.equal(args.dns_record_id, 'rec-1');
    assert.equal(Object.hasOwn(args, 'record_id'), false);
    assert.equal(args.ttl, 300);
    return { success: true, result: { id: 'rec-1', ttl: 300 }, errors: [], messages: [] };
  });
  const result = await gw.execute({ action, input: { zone_id: 'zone-example', record_id: 'rec-1', ttl: 300 }, confirm: true });
  assert.equal(result.result.ttl, 300);
});

test('delete_record needs confirmation on every call and reaches the fake catalog only', async () => {
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'cloudflare', module: 'dns' });
  const action = 'cloudflare.dns.delete_record';
  let calls = 0;
  fake.catalog.setResult(fake.catalog.toSlug(action), (args) => {
    calls += 1;
    assert.equal(args.dns_record_id, 'rec-1');
    assert.equal(Object.hasOwn(args, 'record_id'), false);
    return { success: true, result: { id: 'rec-1' } };
  });
  const call = { action, input: { zone_id: 'zone-example', record_id: 'rec-1' } };
  assert.equal((await gw.execute(call)).status, 'needs_confirmation');
  assert.equal(calls, 0);
  assert.equal((await gw.execute({ ...call, confirm: true })).result.id, 'rec-1');
  assert.equal((await gw.execute(call)).status, 'needs_confirmation');
  assert.equal(calls, 1);
});

test('import needs confirmation and forwards multipart bytes through the import rule without headers', async () => {
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'cloudflare', module: 'dns' });
  const original = fake.auth.proxy;
  const requests = [];
  fake.auth.proxy = async (request) => {
    requests.push(request);
    const result = await original(request);
    return { ...result, headers: {}, 'set-cookie': [] };
  };
  const zone_file = 'example.com. 300 IN TXT "example"\n';
  const call = { action: 'cloudflare.dns.import_zone', input: { zone_id: 'zone-example', zone_file, proxied: false } };
  assert.equal((await gw.execute(call)).status, 'needs_confirmation');
  assert.equal(requests.length, 0);
  const result = await gw.execute({ ...call, confirm: true });
  assert.equal(result.result.recs_added, 1);
  assert.equal(Object.hasOwn(result, 'headers'), false);
  assert.equal(Object.hasOwn(result, 'set-cookie'), false);
  const request = requests[0];
  assert.equal(request.endpoint, '/zones/zone-example/dns_records/import');
  assert.equal(request.method, 'POST');
  assert.equal(request.body, undefined);
  const boundary = request.binary_body.content_type.split('boundary=')[1];
  assert.ok(boundary);
  const body = Buffer.from(request.binary_body.base64, 'base64').toString('utf8');
  assert.ok(body.startsWith(`--${boundary}\r\n`));
  assert.ok(body.includes('name="file"; filename="zone.txt"'));
  assert.ok(body.includes(`\r\n\r\n${zone_file}\r\n`));
  assert.ok(body.includes('name="proxied"\r\n\r\nfalse\r\n'));
  assert.ok(body.endsWith(`--${boundary}--\r\n`));
  await gw.execute({ ...call, input: { zone_id: 'zone-example', zone_file }, confirm: true });
  const withoutProxied = Buffer.from(requests[1].binary_body.base64, 'base64').toString('utf8');
  assert.equal(withoutProxied.includes('name="proxied"'), false);
});

test('confirmed batch reaches the batch rule and returns data only', async () => {
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'cloudflare', module: 'dns' });
  const result = await gw.execute({ action: 'cloudflare.dns.batch', input: { zone_id: 'zone-example', posts: [{ type: 'TXT', name: 'example.com', content: 'example' }] }, confirm: true });
  assert.equal(result.success, true);
  assert.equal(result.result.batch, true);
  assert.equal(Object.hasOwn(result, 'headers'), false);
});


test('create_record confirms a proxy write and returns one record rather than a list', async () => {
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'cloudflare', module: 'dns' });
  const call = { action: 'cloudflare.dns.create_record', input: { zone_id: 'zone-example', type: 'TXT', name: 'example.com', content: 'example', ttl: 300 } };
  assert.equal((await gw.execute(call)).status, 'needs_confirmation');
  const result = await gw.execute({ ...call, confirm: true });
  assert.equal(result.success, true);
  assert.equal(result.result.type, 'TXT');
  assert.equal(result.result.ttl, 300);
  assert.equal(Object.hasOwn(result, 'headers'), false);
});
