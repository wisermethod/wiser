// Named response headers, the cases adversarial review round 1 of wiser 8aaf01a found
// open (Grok run 20261021-035240): a thrown message that is not a string, the scan
// reading escaped JSON, an empty or non-string location, a later catalog call carrying
// the address out, a file output beside declared headers, and a provider that returns
// more than was declared. Written apart from the implementation. Invented data only.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { createAudit } from '../src/audit.js';
import { ConnectionGateway } from '../src/gateway.js';
import { loadConnectors } from '../src/manifest.js';
import { loadPolicy } from '../src/policy.js';
import { createRpcHandler } from '../src/rpc.js';
import { JsonFileStore } from '../src/store.js';

const DEFAULT_POLICY = fileURLToPath(new URL('../policy.default.json', import.meta.url));
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const UPLOAD_ID = Array.from(randomBytes(64), (b) => ALPHABET[b % 64]).join('');
const START = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status';
const LOCATION = `https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status&upload_id=${UPLOAD_ID}`;
// An id with a quotation mark every eight characters, so every 16-character run of it is
// escaped in JSON; and an address carrying it.
const QUOTED_ID = Array.from({ length: 64 }, (_, i) => (i % 8 === 3 ? '"' : ALPHABET[(i * 7) % 64])).join('');
const QUOTED_LOCATION = `https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=${encodeURIComponent(QUOTED_ID).replace(/%22/g, '"')}`;

function holdsRun(text, id, run = 16) {
  for (let i = 0; i + run <= id.length; i += 1) if (text.includes(id.slice(i, i + run))) return true;
  return false;
}

function fixtureConnectors({ withFileOutput = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'rh-r1-connectors-'));
  const dir = join(root, 'tube');
  mkdirSync(dir);
  const action = (extra = {}) => ({
    description: 'invented', risk: 'low', confirmation: 'none', execution: { prefer: 'proxy' },
    input: { type: 'object', properties: {}, additionalProperties: false }, ...extra,
  });
  const loc = { response_headers: ['location'] };
  const actions = {
    undeclared: action(),
    declared: action(loc),
    throw_array: action(loc),
    throw_object: action(loc),
    throw_boxed: action(loc),
    plain_failure: action(loc),
    leak_quoted_id: action(loc),
    leak_buffer: action(loc),
    leak_bigint: action(loc),
    leak_circular: action(loc),
    legit_null: action(loc),
    catalog_leak: action(loc),
  };
  if (withFileOutput) actions.both = action({ ...loc, output_file: { media_types: ['audio/mpeg'], max_bytes: 1024 } });
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({
    id: 'tube', service: 'tube',
    modules: { up: { auth: { provider: 'catalog', toolkit: 'FAKE_TUBE', scheme: 'OAUTH2', privilege: 'write' }, actions, unwrap_token: false, fallback: 'none' } },
  }));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'tube-r1-fixture', private: true, type: 'module' }));
  writeFileSync(join(dir, 'index.js'), `
const START = ${JSON.stringify(START)};
async function start(ctx) { return ctx.proxy({ endpoint: START, method: 'POST', body: {} }); }
function loc(res) { return res && res.headers ? res.headers.location : undefined; }
export const modules = {
  up: {
    async undeclared(_i, ctx) { const res = await start(ctx); return { has_headers_key: Object.hasOwn(res, 'headers') }; },
    async declared(_i, ctx) { const res = await start(ctx); return { keys: Object.keys(res.headers || {}).sort(), location_type: typeof loc(res) }; },
    async throw_array(_i, ctx) { const l = loc(await start(ctx)); throw Object.assign(new Error('upload failed'), { message: [l] }); },
    async throw_object(_i, ctx) { const l = loc(await start(ctx)); throw Object.assign(new Error('upload failed'), { message: { url: l } }); },
    async throw_boxed(_i, ctx) { const l = loc(await start(ctx)); throw Object.assign(new Error('upload failed'), { message: new String(l) }); },
    async plain_failure(_i, ctx) { await start(ctx); throw new Error('plain failure'); },
    async leak_quoted_id(_i, ctx) { const l = loc(await start(ctx)); return { id: new URL(l).searchParams.get('upload_id') }; },
    async leak_buffer(_i, ctx) { const l = loc(await start(ctx)); return { bytes: Buffer.from(l) }; },
    async leak_bigint(_i, ctx) { const l = loc(await start(ctx)); return { big: 1n, addr: l }; },
    async leak_circular(_i, ctx) { const l = loc(await start(ctx)); const o = { addr: l }; o.self = o; return o; },
    async legit_null(_i, ctx) { await start(ctx); return { id: 'video', description: null, count: 0 }; },
    async catalog_leak(_i, ctx) { const l = loc(await start(ctx)); await ctx.catalog('tube.up.declared', { url: l }); return { sent: true }; },
    ${withFileOutput ? "async both(_i, ctx) { const l = loc(await start(ctx)); return { output_file: { media_type: 'audio/mpeg', data: Buffer.from(String(l)) } }; }," : ''}
  },
};
`);
  return root;
}

// A provider that returns whatever headers it is configured with, declared or not, so what
// reaches the module shows what the gateway itself lets through.
function fakeProvider(headers) {
  const calls = { proxy: [], catalog: [] };
  const auth = {
    isConfigured: () => true,
    async proxy(req) {
      calls.proxy.push({ endpoint: req.endpoint, response_headers: req.response_headers });
      return { status: 200, data: {}, headers: { ...headers } };
    },
    async status() { return 'ACTIVE'; },
    async listAccounts() { return []; },
    async initiate() { return { status: 'link', url: 'https://example.invalid/link' }; },
    async unwrap() { return { supported: false }; },
  };
  const catalog = { async execute(args) { calls.catalog.push(args); return { data: {} }; } };
  return { auth, catalog, calls };
}

async function build(headers = { location: LOCATION }) {
  const home = mkdtempSync(join(tmpdir(), 'rh-r1-home-'));
  const connectors = await loadConnectors([fixtureConnectors()]);
  const fake = fakeProvider(headers);
  const store = new JsonFileStore(home);
  store.putConnection({
    id: 'conn-tube-up', service: 'tube', module: 'up', privilege: 'write', provider: 'catalog',
    provider_account_id: 'fake-acct-tube', scopes: [], status: 'ACTIVE',
    created: new Date().toISOString(), updated: new Date().toISOString(),
  });
  const gw = new ConnectionGateway({
    home, role: 'runtime', harness: 'rh-r1', store,
    policy: loadPolicy({ home, defaultPath: DEFAULT_POLICY }),
    audit: createAudit(home),
    authProvider: fake.auth, catalogProvider: fake.catalog, localFileProvider: null,
    authConfigured: true, connectors, envPath: null, classifier: null,
  });
  return { gw, home, fake, rpc: createRpcHandler({ gateway: gw, version: 'r1' }) };
}

async function toolText(rpc, action) {
  const line = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'execute', arguments: { action, input: {} } } });
  return (await rpc(line)).result.content[0].text;
}

function auditText(home) {
  const p = join(home, 'audit.jsonl');
  return existsSync(p) ? readFileSync(p, 'utf8') : '';
}

function clean(text, label, id = UPLOAD_ID, address = LOCATION) {
  assert.equal(text.includes(address), false, `${label}: the address leaked`);
  assert.equal(holdsRun(text, id), false, `${label}: a run of the upload id leaked`);
}

test('B8: the gateway itself drops headers an action did not declare, and names it did not', async () => {
  const { gw } = await build({ location: LOCATION, 'set-cookie': 'sid=invented', range: 'bytes=0-1', authorization: 'Bearer invented' });
  assert.deepEqual(await gw.execute({ action: 'tube.up.undeclared', input: {} }), { has_headers_key: false });
  assert.deepEqual(await gw.execute({ action: 'tube.up.declared', input: {} }), { keys: ['location'], location_type: 'string' });
});

test('B8: a location over the cap from the provider is not delivered', async () => {
  const { gw } = await build({ location: `${LOCATION}&pad=${'x'.repeat(9000)}` });
  const result = await gw.execute({ action: 'tube.up.declared', input: {} });
  assert.equal(result.location_type, 'undefined');
});

for (const action of ['throw_array', 'throw_object', 'throw_boxed']) {
  test(`B1: ${action}, a thrown message that is not a string, reaches the tool result as internal error`, async () => {
    const { home, rpc } = await build();
    const text = await toolText(rpc, `tube.up.${action}`);
    clean(text, action);
    assert.match(text, /internal error/);
    clean(auditText(home), `${action} audit`);
  });
}

test('B3: an ordinary failure message is kept while a location was delivered', async () => {
  const { rpc } = await build();
  assert.match(await toolText(rpc, 'tube.up.plain_failure'), /plain failure/);
});

for (const value of ['', null, 42, { href: LOCATION }]) {
  test(`B3: a location of ${JSON.stringify(value)} is not delivered and makes no needle`, async () => {
    const { gw, rpc } = await build({ location: value });
    const result = await gw.execute({ action: 'tube.up.legit_null', input: {} });
    assert.deepEqual(result, { id: 'video', description: null, count: 0 });
    assert.match(await toolText(rpc, 'tube.up.plain_failure'), /plain failure/);
  });
}

test('B2: an upload id whose every run JSON escapes is still refused', async () => {
  const { gw, rpc } = await build({ location: QUOTED_LOCATION });
  const result = await gw.execute({ action: 'tube.up.leak_quoted_id', input: {} });
  assert.equal(result.status, 'vendor_error', JSON.stringify(result).slice(0, 200));
  assert.equal(result.detail, 'response_header');
  const text = await toolText(rpc, 'tube.up.leak_quoted_id');
  assert.equal(text.includes(JSON.stringify(QUOTED_ID).slice(1, -1).slice(0, 20)), false, 'the escaped id leaked');
});

for (const action of ['leak_buffer', 'leak_bigint', 'leak_circular']) {
  test(`B5 and B6: ${action} is refused, not thrown, and nothing of the address reaches the tool result`, async () => {
    const { gw, home, rpc } = await build();
    const result = await gw.execute({ action: `tube.up.${action}`, input: {} });
    assert.equal(result.status, 'vendor_error', JSON.stringify(result, (k, v) => (typeof v === 'bigint' ? String(v) : v)).slice(0, 200));
    assert.equal(result.reason, 'output_refused');
    assert.equal(result.detail, 'response_header');
    const text = await toolText(rpc, `tube.up.${action}`);
    clean(text, action);
    clean(Buffer.from(text).toString(), `${action} bytes`);
    assert.equal(/104,116,116,112,115/.test(text), false, `${action}: the address as byte values`);
    clean(auditText(home), `${action} audit`);
  });
}

test('B4: a catalog call carrying the address is refused before the catalog runs', async () => {
  const { gw, fake, rpc } = await build();
  const result = await gw.execute({ action: 'tube.up.catalog_leak', input: {} });
  assert.notEqual(result.sent, true, 'the module went on as if the call had run');
  assert.equal(fake.calls.catalog.length, 0, 'the catalog received the address');
  clean(await toolText(rpc, 'tube.up.catalog_leak'), 'catalog tool result');
  assert.equal(fake.calls.catalog.length, 0, 'the catalog received the address');
});

test('B7: an action may not declare both a file output and response headers', async () => {
  await assert.rejects(loadConnectors([fixtureConnectors({ withFileOutput: true })]));
});
