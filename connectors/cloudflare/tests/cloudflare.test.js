import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { modules } from '../index.js';

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

function makeTree({ parentName = 'site', distName = 'dist', kit = true, files = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'pages-kit-'));
  const parent = join(root, parentName);
  const dist = join(parent, distName);
  mkdirSync(dist, { recursive: true });
  if (kit) writeFileSync(join(parent, 'kit.json'), '{}\n');
  for (const [rel, content] of Object.entries(files)) {
    const path = join(dist, ...rel.split('/'));
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, content);
  }
  return {
    root,
    dist,
    cleanup() { rmSync(root, { recursive: true, force: true }); },
  };
}

function formParts(binary) {
  const boundary = binary.content_type.split('boundary=')[1];
  const text = Buffer.from(binary.base64, 'base64').toString('utf8');
  const parts = [];
  for (const chunk of text.split(`--${boundary}`)) {
    const trimmed = chunk.replace(/^\r\n/, '');
    if (trimmed === '' || trimmed === '--\r\n' || trimmed === '--') continue;
    const splitAt = trimmed.indexOf('\r\n\r\n');
    if (splitAt < 0) continue;
    const head = trimmed.slice(0, splitAt);
    let value = trimmed.slice(splitAt + 4);
    if (value.endsWith('\r\n')) value = value.slice(0, -2);
    const name = /name="([^"]+)"/.exec(head)?.[1];
    parts.push({ name, value, head });
  }
  return { boundary, text, parts };
}

test('pages.create_project confirms every call, posts the body, and refuses a bad name', async () => {
  let calls = 0;
  const refuse = async (name) => modules.pages.create_project(
    { account_id: 'acct-1', name, production_branch: 'main' },
    { proxy() { calls += 1; throw new Error('proxy'); } },
  );
  for (const name of ['Bad_Name', '-kit', 'kit-', 'a'.repeat(59)]) {
    const refused = await refuse(name);
    assert.equal(refused.status, 'invalid_arguments', name);
    assert.equal(refused.field, 'name', name);
  }
  assert.equal(calls, 0);
  let posted = null;
  const accepted = await modules.pages.create_project(
    { account_id: 'acct-1', name: 'a'.repeat(58), production_branch: 'main' },
    { proxy: async (req) => { posted = req; return { data: { success: true, result: { name: req.body.name } } }; } },
  );
  assert.equal(accepted.result.name, 'a'.repeat(58));
  assert.deepEqual(posted.body, { name: 'a'.repeat(58), production_branch: 'main' });
  const digit = await modules.pages.create_project(
    { account_id: 'acct-1', name: '1site', production_branch: 'main' },
    { proxy: async (req) => ({ data: { success: true, result: { name: req.body.name } } }) },
  );
  assert.equal(digit.result.name, '1site');

  const { gw, store, fake } = await createTestGateway({ connectorDirs: [CONNECTORS] });
  await putActive(store, fake, { service: 'cloudflare', module: 'pages' });
  const requests = [];
  const original = fake.auth.proxy;
  fake.auth.proxy = async (request) => {
    requests.push(request);
    if (request.method === 'POST' && request.endpoint === '/accounts/acct-1/pages/projects') {
      return {
        status: 200,
        data: { success: true, result: { name: request.body.name, production_branch: request.body.production_branch }, errors: [], messages: [] },
        headers: {},
      };
    }
    return original(request);
  };
  for (const name of ['Bad_Name', 'a'.repeat(59)]) {
    const bad = await gw.execute({
      action: 'cloudflare.pages.create_project',
      input: { account_id: 'acct-1', name, production_branch: 'main' },
      confirm: true,
    });
    assert.equal(bad.status, 'invalid_arguments', name);
    assert.equal(bad.field, 'name', name);
  }
  assert.equal(requests.length, 0);
  const call = {
    action: 'cloudflare.pages.create_project',
    input: { account_id: 'acct-1', name: 'kit-site', production_branch: 'main' },
  };
  assert.equal((await gw.execute(call)).status, 'needs_confirmation');
  assert.equal(requests.length, 0);
  const created = await gw.execute({ ...call, confirm: true });
  assert.equal(created.result.name, 'kit-site');
  assert.equal(created.result.production_branch, 'main');
  assert.equal(requests[0].method, 'POST');
  assert.equal(requests[0].endpoint, '/accounts/acct-1/pages/projects');
  assert.deepEqual(requests[0].body, { name: 'kit-site', production_branch: 'main' });
  assert.equal(requests[0].parameters, undefined);
  // `always`, because the gateway keys a `once` approval by action id and a
  // different project would otherwise run unasked.
  const other = await gw.execute({ ...call, input: { ...call.input, name: 'other-site' } });
  assert.equal(other.status, 'needs_confirmation');
  assert.equal(requests.length, 1);
});

test('pages.add_domain confirms every call and posts the domain name', async () => {
  const { gw, store, fake } = await createTestGateway({ connectorDirs: [CONNECTORS] });
  await putActive(store, fake, { service: 'cloudflare', module: 'pages' });
  const requests = [];
  const original = fake.auth.proxy;
  fake.auth.proxy = async (request) => {
    requests.push(request);
    if (request.method === 'POST' && request.endpoint === '/accounts/acct-1/pages/projects/kit-site/domains') {
      return {
        status: 200,
        data: { success: true, result: { name: request.body.name, status: 'pending' }, errors: [], messages: [] },
        headers: {},
      };
    }
    return original(request);
  };
  const call = {
    action: 'cloudflare.pages.add_domain',
    input: { account_id: 'acct-1', project_name: 'kit-site', domain: 'www.example.com' },
  };
  assert.equal((await gw.execute(call)).status, 'needs_confirmation');
  assert.equal(requests.length, 0);
  const added = await gw.execute({ ...call, confirm: true });
  assert.equal(added.result.name, 'www.example.com');
  assert.equal(requests[0].endpoint, '/accounts/acct-1/pages/projects/kit-site/domains');
  assert.equal(requests[0].method, 'POST');
  assert.deepEqual(requests[0].body, { name: 'www.example.com' });
  assert.equal(requests[0].parameters, undefined);
  const other = await gw.execute({ ...call, input: { ...call.input, domain: 'evil.example.net' } });
  assert.equal(other.status, 'needs_confirmation');
  assert.equal(requests.length, 1);
});

async function pagesGateway() {
  const { gw, store, fake } = await createTestGateway({ connectorDirs: [CONNECTORS] });
  await putActive(store, fake, { service: 'cloudflare', module: 'pages' });
  const requests = [];
  const original = fake.auth.proxy;
  fake.auth.proxy = async (request) => {
    requests.push(request);
    return original(request);
  };
  return { gw, requests };
}

test('pages.deploy refuses a dir that is not site/dist', async () => {
  const { gw, requests } = await pagesGateway();
  const tree = makeTree({ parentName: 'site', distName: 'public', kit: true, files: { 'index.html': '<h1>Hi</h1>' } });
  try {
    const result = await gw.execute({
      action: 'cloudflare.pages.deploy',
      input: { account_id: 'acct-1', project_name: 'kit-site', dir: tree.dist },
      confirm: true,
    });
    assert.equal(result.status, 'invalid_arguments');
    assert.equal(result.field, 'dir');
    assert.equal(result.reason, 'basename is not dist');
    assert.equal(requests.length, 0);
  } finally {
    tree.cleanup();
  }
});

test('pages.deploy refuses site/dist without site/kit.json', async () => {
  const { gw, requests } = await pagesGateway();
  const tree = makeTree({ kit: false, files: { 'index.html': '<h1>Hi</h1>' } });
  try {
    const result = await gw.execute({
      action: 'cloudflare.pages.deploy',
      input: { account_id: 'acct-1', project_name: 'kit-site', dir: tree.dist },
      confirm: true,
    });
    assert.equal(result.status, 'invalid_arguments');
    assert.equal(result.field, 'dir');
    assert.equal(result.reason, 'kit.json missing');
    assert.equal(requests.length, 0);
  } finally {
    tree.cleanup();
  }
});

test('pages.deploy refuses _worker.js and a functions directory at the dist root', async () => {
  const worker = makeTree({ files: { 'index.html': '<h1>Hi</h1>', '_worker.js': 'export default {}\n' } });
  const functions = makeTree({ files: { 'index.html': '<h1>Hi</h1>', 'functions/api.js': 'export function onRequest() {}\n' } });
  try {
    for (const tree of [worker, functions]) {
      const { gw, requests } = await pagesGateway();
      const result = await gw.execute({
        action: 'cloudflare.pages.deploy',
        input: { account_id: 'acct-1', project_name: 'kit-site', dir: tree.dist },
        confirm: true,
      });
      assert.equal(result.status, 'invalid_arguments');
      assert.equal(result.field, 'dir');
      assert.equal(result.reason, 'static kit output only');
      assert.equal(requests.length, 0);
    }
  } finally {
    worker.cleanup();
    functions.cleanup();
  }
});

test('pages.deploy confirms on every call and uploads only missing assets', async () => {
  const jwt = 'pages-upload-jwt-test-value';
  const headers = 'X-Frame-Options: DENY\n';
  const redirects = '/old /new 301\n';
  const tree = makeTree({
    files: {
      'index.html': '<h1>Hi</h1>\n',
      'css/app.css': 'body{color:red}\n',
      '_headers': headers,
      '_redirects': redirects,
      '_routes.json': '{}\n',
      '.DS_Store': 'not-a-store',
      '.dev.vars': 'SECRET=1\n',
      'deploy.key': 'key\n',
      '.well-known/security.txt': 'Contact: mailto:security@example.com\n',
    },
  });
  const { gw, store, fake } = await createTestGateway({ connectorDirs: [CONNECTORS] });
  await putActive(store, fake, { service: 'cloudflare', module: 'pages' });
  const calls = [];
  fake.auth.proxy = async (request) => {
    calls.push(request);
    const endpoint = request.endpoint;
    if (request.method === 'GET' && endpoint.endsWith('/upload-token')) {
      return { status: 200, data: { success: true, result: { jwt }, errors: [], messages: [] }, headers: {} };
    }
    if (endpoint === '/pages/assets/check-missing') {
      return { status: 200, data: { success: true, result: [request.body.hashes[0]], errors: [], messages: [] }, headers: {} };
    }
    if (endpoint === '/pages/assets/upload' || endpoint === '/pages/assets/upsert-hashes') {
      return { status: 200, data: { success: true, result: null, errors: [], messages: [] }, headers: {} };
    }
    if (request.method === 'POST' && endpoint.endsWith('/deployments')) {
      return {
        status: 200,
        data: {
          success: true,
          result: { id: 'dep-1', url: 'https://kit-site.pages.dev', environment: 'production', latest_stage: { name: 'deploy', status: 'success' } },
          errors: [],
          messages: [],
        },
        headers: {},
      };
    }
    return { status: 200, data: {}, headers: {} };
  };
  const call = {
    action: 'cloudflare.pages.deploy',
    input: { account_id: 'acct-1', project_name: 'kit-site', dir: tree.dist },
  };
  try {
    assert.equal((await gw.execute(call)).status, 'needs_confirmation');
    assert.equal(calls.length, 0);
    const result = await gw.execute({ ...call, confirm: true });
    assert.equal((await gw.execute(call)).status, 'needs_confirmation');
    assert.deepEqual(calls.map((item) => `${item.method} ${item.endpoint}`), [
      'GET /accounts/acct-1/pages/projects/kit-site/upload-token',
      'POST /pages/assets/check-missing',
      'POST /pages/assets/upload',
      'POST /pages/assets/upsert-hashes',
      'POST /accounts/acct-1/pages/projects/kit-site/deployments',
    ]);
    for (const item of calls) {
      const asset = item.endpoint.startsWith('/pages/assets/');
      if (asset) {
        assert.deepEqual(item.parameters, [{ name: 'Authorization', value: `Bearer ${jwt}`, type: 'header' }]);
      } else {
        assert.equal(item.parameters, undefined);
      }
    }
    const missing = calls[1].body.hashes[0];
    assert.equal(calls[2].body.length, 1);
    assert.equal(calls[2].body[0].key, missing);
    assert.equal(calls[2].body[0].base64, true);
    assert.equal(typeof calls[2].body[0].metadata.contentType, 'string');
    for (const hash of calls[1].body.hashes) {
      if (hash !== missing) assert.equal(calls[2].body.some((item) => item.key === hash), false);
    }
    assert.deepEqual(calls[3].body, { hashes: calls[1].body.hashes });
    const form = formParts(calls[4].binary_body);
    assert.equal(form.text.includes('name="branch"'), false);
    const manifest = JSON.parse(form.parts.find((part) => part.name === 'manifest').value);
    assert.deepEqual(Object.keys(manifest).sort(), ['/.well-known/security.txt', '/css/app.css', '/index.html']);
    // Pinned so a change to the hash input or digest is a visible break.
    assert.equal(manifest['/index.html'], '9c5ae14be9221748624434e4324f86c3');
    assert.deepEqual(Object.values(manifest).sort(), [...calls[1].body.hashes].sort());
    assert.equal(form.parts.find((part) => part.name === '_headers').value, headers);
    assert.equal(form.parts.find((part) => part.name === '_redirects').value, redirects);
    assert.equal(result.deployment.id, 'dep-1');
    assert.equal(result.deployment.url, 'https://kit-site.pages.dev');
    assert.equal(result.deployment.environment, 'production');
    assert.equal(result.files, 3);
    assert.equal(result.uploaded, 1);
    assert.equal(result.already_present, 2);
    assert.deepEqual(result.manifest.sort(), Object.keys(manifest).sort());
    assert.ok(result.dir.endsWith(join('site', 'dist')));
    assert.ok(result.skipped.some((item) => item.file === '.DS_Store' && item.reason === 'hidden'));
    assert.ok(result.skipped.some((item) => item.file === '.dev.vars' && item.reason === 'hidden'));
    assert.ok(result.skipped.some((item) => item.file === 'deploy.key' && item.reason === 'credential'));
    assert.ok(result.skipped.some((item) => item.file === '_routes.json' && item.reason === 'not an asset'));
    assert.equal(JSON.stringify(result).includes(jwt), false);
  } finally {
    tree.cleanup();
  }
});

test('pages.deploy refuses a symbolic link at site or at dist', async () => {
  const real = makeTree({ files: { 'index.html': '<h1>Real</h1>' } });
  const holder = mkdtempSync(join(tmpdir(), 'pages-link-'));
  try {
    // dist is a link to another kit's dist.
    mkdirSync(join(holder, 'a', 'site'), { recursive: true });
    writeFileSync(join(holder, 'a', 'site', 'kit.json'), '{}\n');
    symlinkSync(real.dist, join(holder, 'a', 'site', 'dist'));
    // site is a link to another kit's site.
    mkdirSync(join(holder, 'b'), { recursive: true });
    symlinkSync(join(real.root, 'site'), join(holder, 'b', 'site'));
    for (const dir of [join(holder, 'a', 'site', 'dist'), join(holder, 'b', 'site', 'dist')]) {
      const { gw, requests } = await pagesGateway();
      const result = await gw.execute({
        action: 'cloudflare.pages.deploy',
        input: { account_id: 'acct-1', project_name: 'kit-site', dir },
        confirm: true,
      });
      assert.equal(result.status, 'invalid_arguments', dir);
      assert.equal(result.reason, 'site or dist is a symbolic link', dir);
      assert.equal(requests.length, 0);
    }
  } finally {
    real.cleanup();
    rmSync(holder, { recursive: true, force: true });
  }
});

test('pages.deploy stops at the first envelope that says success: false', async () => {
  const steps = ['/upload-token', '/pages/assets/check-missing', '/pages/assets/upload', '/pages/assets/upsert-hashes', '/deployments'];
  for (const failing of steps) {
    const tree = makeTree({ files: { 'index.html': '<h1>Hi</h1>\n' } });
    const { gw, store, fake } = await createTestGateway({ connectorDirs: [CONNECTORS] });
    await putActive(store, fake, { service: 'cloudflare', module: 'pages' });
    const seen = [];
    fake.auth.proxy = async (request) => {
      seen.push(request.endpoint);
      const envelope = (result) => ({
        status: 200,
        data: request.endpoint.endsWith(failing)
          ? { success: false, result: null, errors: [{ code: 1, message: 'no' }], messages: [] }
          : { success: true, result, errors: [], messages: [] },
        headers: {},
      });
      if (request.endpoint.endsWith('/upload-token')) return envelope({ jwt: 'jwt-value-for-failure-test' });
      if (request.endpoint === '/pages/assets/check-missing') return envelope(request.body.hashes);
      if (request.endpoint.endsWith('/deployments')) return envelope({ id: 'dep-x' });
      return envelope(null);
    };
    try {
      const result = await gw.execute({
        action: 'cloudflare.pages.deploy',
        input: { account_id: 'acct-1', project_name: 'kit-site', dir: tree.dist },
        confirm: true,
      });
      assert.equal(result.status, 'vendor_error', failing);
      assert.ok(seen[seen.length - 1].endsWith(failing), `${failing} was the last call`);
      assert.equal(JSON.stringify(result).includes('jwt-value-for-failure-test'), false);
    } finally {
      tree.cleanup();
    }
  }
});

test('pages.deploy stops when a file changes mid-deploy, even one already present', async () => {
  for (const target of ['index.html', '_headers']) {
    const tree = makeTree({ files: { 'index.html': '<h1>Hi</h1>\n', '_headers': '/*\n  X-Frame-Options: DENY\n' } });
    const { gw, store, fake } = await createTestGateway({ connectorDirs: [CONNECTORS] });
    await putActive(store, fake, { service: 'cloudflare', module: 'pages' });
    const seen = [];
    fake.auth.proxy = async (request) => {
      seen.push(request.endpoint);
      const ok = (result) => ({ status: 200, data: { success: true, result, errors: [], messages: [] }, headers: {} });
      if (request.endpoint.endsWith('/upload-token')) return ok({ jwt: 'jwt-mutation-test' });
      if (request.endpoint === '/pages/assets/check-missing') {
        // Everything reported present, and the file edited while the call is out.
        writeFileSync(join(tree.dist, target), 'changed\n');
        return ok([]);
      }
      return ok({ id: 'dep-should-not-exist' });
    };
    try {
      const result = await gw.execute({
        action: 'cloudflare.pages.deploy',
        input: { account_id: 'acct-1', project_name: 'kit-site', dir: tree.dist },
        confirm: true,
      });
      assert.equal(result.status, 'invalid_arguments', target);
      assert.equal(result.reason, `file changed during deploy: ${target}`);
      assert.equal(seen.some((endpoint) => endpoint.endsWith('/deployments')), false, target);
    } finally {
      tree.cleanup();
    }
  }
});

test('pages.remove_domain confirms every call and sends DELETE to the domain', async () => {
  const { gw, requests } = await pagesGateway();
  const call = {
    action: 'cloudflare.pages.remove_domain',
    input: { account_id: 'acct-1', project_name: 'kit-site', domain: 'www.example.com' },
  };
  assert.equal((await gw.execute(call)).status, 'needs_confirmation');
  assert.equal(requests.length, 0);
  await gw.execute({ ...call, confirm: true });
  assert.equal(requests[0].method, 'DELETE');
  assert.equal(requests[0].endpoint, '/accounts/acct-1/pages/projects/kit-site/domains/www.example.com');
  assert.equal((await gw.execute(call)).status, 'needs_confirmation');
  assert.equal(requests.length, 1);
});

test('pages.delete_project reads first, refuses with a custom domain, and deletes otherwise', async () => {
  for (const [domains, expectDelete, blocked] of [
    [['kit-site.pages.dev', 'www.example.com'], false, ['www.example.com']],
    [['kit-site.pages.dev', 'other.pages.dev'], false, ['other.pages.dev']],
    [['KIT-SITE.pages.dev.'], true],
    [[], true],
  ]) {
    const { gw, store, fake } = await createTestGateway({ connectorDirs: [CONNECTORS] });
    await putActive(store, fake, { service: 'cloudflare', module: 'pages' });
    const requests = [];
    fake.auth.proxy = async (request) => {
      requests.push(request);
      const result = request.method === 'GET' ? { name: 'kit-site', subdomain: 'kit-site.pages.dev', domains } : null;
      return { status: 200, data: { success: true, result, errors: [], messages: [] }, headers: {} };
    };
    const call = { action: 'cloudflare.pages.delete_project', input: { account_id: 'acct-1', project_name: 'kit-site' } };
    assert.equal((await gw.execute(call)).status, 'needs_confirmation');
    assert.equal(requests.length, 0);
    const result = await gw.execute({ ...call, confirm: true });
    assert.equal(requests[0].method, 'GET');
    assert.equal(requests[0].endpoint, '/accounts/acct-1/pages/projects/kit-site');
    if (expectDelete) {
      assert.equal(requests.length, 2);
      assert.equal(requests[1].method, 'DELETE');
      assert.equal(requests[1].endpoint, '/accounts/acct-1/pages/projects/kit-site');
      assert.equal(result.success, true);
    } else {
      assert.equal(requests.length, 1);
      assert.equal(result.status, 'invalid_arguments');
      assert.equal(result.reason, 'custom domain still attached');
      assert.deepEqual(result.domains, blocked);
    }
  }
});

test('pages.delete_project fails closed on a read without a domain list', async () => {
  for (const domains of [undefined, null, {}, ['kit-site.pages.dev', 7]]) {
    const { gw, store, fake } = await createTestGateway({ connectorDirs: [CONNECTORS] });
    await putActive(store, fake, { service: 'cloudflare', module: 'pages' });
    const requests = [];
    fake.auth.proxy = async (request) => {
      requests.push(request);
      const result = { name: 'kit-site' };
      if (domains !== undefined) result.domains = domains;
      return { status: 200, data: { success: true, result, errors: [], messages: [] }, headers: {} };
    };
    const result = await gw.execute({
      action: 'cloudflare.pages.delete_project',
      input: { account_id: 'acct-1', project_name: 'kit-site' },
      confirm: true,
    });
    assert.equal(result.status, 'vendor_error', JSON.stringify(domains));
    assert.equal(requests.some((request) => request.method === 'DELETE'), false);
  }
});

test('pages.remove_domain and delete_project refuse dot segments before any call', async () => {
  const { gw, requests } = await pagesGateway();
  for (const [action, input, field] of [
    ['cloudflare.pages.remove_domain', { account_id: 'acct-1', project_name: 'kit-site', domain: '..' }, 'domain'],
    ['cloudflare.pages.remove_domain', { account_id: 'acct-1', project_name: 'kit-site', domain: '.' }, 'domain'],
    ['cloudflare.pages.remove_domain', { account_id: 'acct-1', project_name: '..', domain: 'www.example.com' }, 'project_name'],
    ['cloudflare.pages.delete_project', { account_id: 'acct-1', project_name: '..' }, 'project_name'],
  ]) {
    const result = await gw.execute({ action, input, confirm: true });
    assert.equal(result.status, 'invalid_arguments', JSON.stringify(input));
    assert.equal(result.field, field);
  }
  assert.equal(requests.length, 0);
});
