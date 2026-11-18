// The publisher layout catalog: the signed, bounded list of release layouts the
// three Pages deploy routes read from each configured publisher before their
// first Cloudflare call. Every key here is an in-memory FIXTURE identity and
// every publisher download is served by a fake; the shipping trust file is never
// modified and no test reaches the network. A pass proves nothing about a
// production catalog, which is unsigned and unpublished until its own step.
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createTestGateway, confirmCall, putActive } from '../../../gateway/test/fake-provider.js';
import {
  ALTERNATE_LAYOUT, CATALOG_MAX_BYTES, LAYOUTS_DOMAIN, PAGES_DOMAIN, RELEASE_HOST, SYNTHETIC_LAYOUT,
  blockNetwork, catalogBytes, catalogUrls, connectorCopy, deployProxy, deploymentCalls, fixtureIdentity,
  makeRelease, publisherServer, syntheticContract, trustJson,
} from './pages-release-fixture.js';

const NETWORK = blockNetwork();
const SHIPPING_CONNECTORS = fileURLToPath(new URL('../..', import.meta.url));
const ACCOUNT = '0123456789abcdef0123456789abcdef';
const PROJECT = 'catalog-site';
const PAYLOAD = 'release payload: use cloudflare.pages.deploy';

const PUB = fixtureIdentity('fixture-pub');
const OTHER = fixtureIdentity('fixture-other');
const SECOND = fixtureIdentity('fixture-second');
const copies = [];
const scratches = [];
function copyWith(options) {
  const copy = connectorCopy(options);
  copies.push(copy);
  return copy;
}
const TRUSTED = copyWith({ trust: trustJson({ 'fixture-pub': [PUB.key] }, { 'fixture-pub': catalogBytes('fixture-pub', [SYNTHETIC_LAYOUT, ALTERNATE_LAYOUT]) }) });
const TWO = copyWith({ trust: trustJson({ 'fixture-pub': [PUB.key], 'fixture-second': [SECOND.key] }, { 'fixture-pub': catalogBytes('fixture-pub', [SYNTHETIC_LAYOUT]), 'fixture-second': catalogBytes('fixture-second', [ALTERNATE_LAYOUT]) }) });
after(() => {
  for (const copy of copies) copy.cleanup();
  for (const dir of scratches) rmSync(dir, { recursive: true, force: true });
  assert.deepEqual(NETWORK, [], 'no test may reach the network through a default fetch');
});

function scratch() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'pages-catalog-')));
  scratches.push(dir);
  return dir;
}
function html(dir) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), '<p>catalog fixture</p>\n');
  return dir;
}
function functionsBuild(base, assets) {
  const dir = join(base, `fb-${Math.abs(hashCode(assets))}`);
  mkdirSync(dir, { recursive: true });
  const b = 'CatalogBoundary';
  writeFileSync(join(dir, '_worker.bundle'), [
    `--${b}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n${JSON.stringify({ main_module: 'worker.js' })}\r\n`,
    `--${b}\r\nContent-Disposition: form-data; name="worker.js"; filename="worker.js"\r\nContent-Type: application/javascript+module\r\n\r\nexport default {}\r\n`,
    `--${b}--\r\n`,
  ].join(''));
  writeFileSync(join(dir, '_routes.json'), `${JSON.stringify({ version: 1, include: ['/api/*'], exclude: [] })}\n`);
  writeFileSync(join(dir, 'functions-filepath-routing-config.json'), `${JSON.stringify({ routes: [] })}\n`);
  writeFileSync(join(dir, 'build.json'), `${JSON.stringify({ assets, functions: join(base, 'functions-src'), sources: [{ path: 'api/x.js', sha256: 'b'.repeat(64) }] })}\n`);
  return dir;
}
function hashCode(text) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return h;
}

function serverFor(entries = { 'fixture-pub': { identity: PUB, layouts: [SYNTHETIC_LAYOUT, ALTERNATE_LAYOUT] } }) {
  return publisherServer(entries);
}

// A direct module call with a recording fake Cloudflare and a fake publisher.
// events orders publisher fetches against Cloudflare calls.
function directCtx(server, { fetchRelease = true } = {}) {
  const calls = [];
  const events = [];
  const proxy = deployProxy(calls);
  const ctx = {
    async proxy(request) { events.push('cloudflare'); return proxy(request); },
  };
  if (fetchRelease) ctx.fetchRelease = async (url, opts) => { events.push('publisher'); return server.fetchRelease(url, opts); };
  return { calls, events, ctx };
}

async function run(action, input, { copy = TRUSTED, server = serverFor(), fetchRelease = true } = {}) {
  const { modules } = await copy.load();
  const { calls, events, ctx } = directCtx(server, { fetchRelease });
  const result = await modules.pages[action](input, ctx);
  return { result, calls, events, fetched: server.urls(), server };
}

function staticInput(dir) {
  return { account_id: ACCOUNT, project_name: PROJECT, dir };
}
function functionsInput(base, dir) {
  return { account_id: ACCOUNT, project_name: PROJECT, dir, functions_build: functionsBuild(base, dir) };
}

function refused(out, { field = 'dir', reason, status = 'invalid_arguments', fetched } = {}, label = '') {
  assert.equal(out.result.status, status, `${label} ${JSON.stringify(out.result)}`);
  if (field) assert.equal(out.result.field, field, label);
  if (reason instanceof RegExp) assert.match(out.result.reason, reason, label);
  else if (reason) assert.equal(out.result.reason, reason, label);
  assert.equal(out.calls.length, 0, `${label}: Cloudflare calls`);
  if (fetched !== undefined) assert.deepEqual(out.fetched, fetched, `${label}: publisher fetches`);
}
function deployed(out, label = '') {
  assert.equal(out.result.status, undefined, `${label} ${JSON.stringify(out.result)}`);
  assert.equal(deploymentCalls(out.calls).length, 1, label);
  // Every publisher read precedes the first Cloudflare call.
  const first = out.events.indexOf('cloudflare');
  assert.ok(first > 0 && out.events.slice(first).every((event) => event === 'cloudflare'), `${label}: ${out.events}`);
}

const PUB_URLS = catalogUrls('fixture-pub');
const SECOND_URLS = catalogUrls('fixture-second');

describe('layout catalog: foreign routes classify every signed layout', { concurrency: false }, () => {
  test('the catalog domain is its own NUL-terminated prefix, distinct from the contract domain', () => {
    assert.equal(LAYOUTS_DOMAIN.toString('latin1'), 'wiser.pages-layouts.v1\u0000');
    assert.equal(LAYOUTS_DOMAIN.length, 23);
    assert.notDeepEqual(LAYOUTS_DOMAIN, PAGES_DOMAIN);
  });

  for (const action of ['deploy_static', 'deploy_with_functions']) {
    test(`${action}: unrelated static output still deploys, after reading the catalog once`, async () => {
      const base = scratch();
      const dir = html(join(base, 'plain', 'out'));
      const input = action === 'deploy_static' ? staticInput(dir) : functionsInput(base, dir);
      const out = await run(action, input);
      deployed(out, action);
      assert.deepEqual(out.fetched, [PUB_URLS.catalog, PUB_URLS.catalog_signature]);
      assert.deepEqual(out.server.requests.map((r) => r.maxBytes), [CATALOG_MAX_BYTES, 64]);
    });

    for (const [label, parts] of [
      ['the signed assets directory, with no marker and no identity file', ['holder', 'bundle-root', 'out', 'public']],
      ['a directory below the signed assets', ['holder', 'bundle-root', 'out', 'public', 'deep', 'er']],
      ['a letter-case alias of the signed assets', ['holder', 'Bundle-Root', 'OUT', 'Public']],
      ['the second listed layout', ['x', 'pkg-alpha', 'build', 'web', 'static']],
      ['a layout nested anywhere in the path', ['a', 'bundle-root', 'b', 'bundle-root', 'out', 'public']],
    ]) {
      test(`${action}: refuses ${label} with zero Cloudflare calls`, async () => {
        const base = scratch();
        const dir = html(join(base, ...parts));
        const input = action === 'deploy_static' ? staticInput(dir) : functionsInput(base, dir);
        refused(await run(action, input), { reason: PAYLOAD, fetched: [PUB_URLS.catalog, PUB_URLS.catalog_signature] }, label);
      });
    }

    test(`${action}: refuses a signed custom-identity release's assets (identity is not kit.json)`, async () => {
      const tree = makeRelease({ identity: PUB });
      try {
        const base = scratch();
        const input = action === 'deploy_static' ? staticInput(tree.dist) : functionsInput(base, tree.dist);
        refused(await run(action, input), { reason: PAYLOAD }, 'custom identity');
      } finally {
        tree.cleanup();
      }
    });

    test(`${action}: siblings and partial matches of a layout are not classified`, async () => {
      for (const parts of [
        ['holder', 'bundle-root', 'out', 'other'],
        ['holder', 'bundle-root-2', 'out', 'public'],
        ['holder', 'out', 'public'],
        ['holder', 'pkg-alpha', 'build', 'webs', 'static'],
      ]) {
        const base = scratch();
        const dir = html(join(base, ...parts));
        const input = action === 'deploy_static' ? staticInput(dir) : functionsInput(base, dir);
        deployed(await run(action, input), parts.join('/'));
      }
    });

    test(`${action}: the kit.json marker still refuses before any publisher fetch`, async () => {
      const base = scratch();
      const dir = html(join(base, 'holder', 'out'));
      writeFileSync(join(base, 'holder', 'kit.json'), '{}\n');
      const input = action === 'deploy_static' ? staticInput(dir) : functionsInput(base, dir);
      refused(await run(action, input), { reason: PAYLOAD, fetched: [] });
    });

    test(`${action}: local path refusals come before any publisher fetch`, async () => {
      const base = scratch();
      const real = html(join(base, 'holder', 'bundle-root', 'out', 'public'));
      symlinkSync(join(base, 'holder'), join(base, 'alias'));
      for (const [dir, reason] of [
        ['relative/out', 'path must be absolute'],
        [join(base, 'alias', 'bundle-root', 'out', 'public'), 'symbolic link in path'],
        [`${real}/../public`, 'path is not in normal form'],
        [join(base, 'missing'), 'not found'],
        ['/', 'filesystem root'],
      ]) {
        const input = action === 'deploy_static' ? staticInput(dir) : { ...functionsInput(base, real), dir };
        refused(await run(action, input), { reason, fetched: [] }, dir);
      }
    });
  }
});

describe('layout catalog: every configured publisher, no caller subset', { concurrency: false }, () => {
  test('every configured publisher catalog is read, in label order, before the first call', async () => {
    const base = scratch();
    const dir = html(join(base, 'plain', 'out'));
    const server = serverFor({
      'fixture-pub': { identity: PUB, layouts: [SYNTHETIC_LAYOUT] },
      'fixture-second': { identity: SECOND, layouts: [ALTERNATE_LAYOUT] },
    });
    const out = await run('deploy_static', staticInput(dir), { copy: TWO, server });
    deployed(out);
    assert.deepEqual(out.fetched, [PUB_URLS.catalog, PUB_URLS.catalog_signature, SECOND_URLS.catalog, SECOND_URLS.catalog_signature]);
  });

  test('a layout listed only by the second publisher is refused on both foreign routes', async () => {
    const server = () => serverFor({
      'fixture-pub': { identity: PUB, layouts: [SYNTHETIC_LAYOUT] },
      'fixture-second': { identity: SECOND, layouts: [ALTERNATE_LAYOUT] },
    });
    const base = scratch();
    const dir = html(join(base, 'pkg-alpha', 'build', 'web', 'static'));
    refused(await run('deploy_static', staticInput(dir), { copy: TWO, server: server() }), { reason: PAYLOAD });
    refused(await run('deploy_with_functions', functionsInput(base, dir), { copy: TWO, server: server() }), { reason: PAYLOAD });
  });

  test('one unavailable publisher catalog refuses every route, even for unrelated output', async () => {
    const base = scratch();
    const dir = html(join(base, 'plain', 'out'));
    const server = () => serverFor({
      'fixture-pub': { identity: PUB, layouts: [SYNTHETIC_LAYOUT] },
      'fixture-second': { identity: SECOND, layouts: [ALTERNATE_LAYOUT], status: 404 },
    });
    refused(await run('deploy_static', staticInput(dir), { copy: TWO, server: server() }),
      { status: 'vendor_error', reason: 'publisher layout catalog unavailable: fixture-second' });
    refused(await run('deploy_with_functions', functionsInput(base, dir), { copy: TWO, server: server() }),
      { status: 'vendor_error', reason: 'publisher layout catalog unavailable: fixture-second' });
  });

  test('a catalog signed by another configured publisher is not that publisher\'s catalog', async () => {
    const base = scratch();
    const dir = html(join(base, 'plain', 'out'));
    const bytes = catalogBytes('fixture-second', [ALTERNATE_LAYOUT]);
    const server = serverFor({
      'fixture-pub': { identity: PUB, layouts: [SYNTHETIC_LAYOUT] },
      'fixture-second': { identity: SECOND, bytes, signature: PUB.signLayouts(bytes) },
    });
    refused(await run('deploy_static', staticInput(dir), { copy: TWO, server }),
      { reason: 'publisher layout catalog is not signed by its publisher: fixture-second' });
  });

  test('caller input chooses no URL, trust, catalog or publisher', async () => {
    const base = scratch();
    const dir = html(join(base, 'holder', 'bundle-root', 'out', 'public'));
    // A direct module call ignores keys the gateway would refuse; the trusted URLs are still the only reads.
    const extras = {
      catalog: 'https://evil.example/layouts.json', catalog_signature: 'https://evil.example/layouts.sig', catalog_sha256: 'a'.repeat(64),
      publisher: 'fixture-second', publishers: ['fixture-second'], trust: { keys: [OTHER.key] }, layouts: [],
    };
    refused(await run('deploy_static', { ...staticInput(dir), ...extras }),
      { reason: PAYLOAD, fetched: [PUB_URLS.catalog, PUB_URLS.catalog_signature] });
    // At the gateway the published schema refuses every such key before the module runs.
    const server = serverFor();
    const { gw, store, fake } = await createTestGateway({ connectorDirs: [TRUSTED.connectors], fetchImpl: server.fetchImpl });
    await putActive(store, fake, { service: 'cloudflare', module: 'pages' });
    const calls = [];
    fake.auth.proxy = deployProxy(calls);
    const tree = makeRelease({ identity: PUB });
    try {
      for (const [action, input] of [['deploy_static', staticInput(dir)], ['deploy_with_functions', functionsInput(base, dir)], ['deploy', tree.input()]]) {
        for (const [key, value] of Object.entries(extras)) {
          const result = await gw.execute({ action: `cloudflare.pages.${action}`, input: { ...input, [key]: value }, confirm: true });
          assert.equal(result.status, 'invalid_arguments', `${action} ${key}`);
        }
      }
    } finally {
      tree.cleanup();
    }
    assert.deepEqual(server.requests, []);
    assert.equal(calls.length, 0);
  });

  test('there is no cache: each deploy reads the catalog again and a later bad one refuses', async () => {
    const base = scratch();
    const dir = html(join(base, 'plain', 'out'));
    const server = serverFor();
    deployed(await run('deploy_static', staticInput(dir), { server }), 'first');
    server.served.set(PUB_URLS.catalog_signature, { bytes: OTHER.signLayouts(server.served.get(PUB_URLS.catalog).bytes), status: 200 });
    const second = await run('deploy_static', staticInput(dir), { server });
    refused(second, { reason: 'publisher layout catalog is not signed by its publisher: fixture-pub' });
    assert.equal(server.requests.length, 4);
  });
});

describe('layout catalog: fail closed', { concurrency: false }, () => {
  const routes = (base) => {
    const dir = html(join(base, 'plain', 'out'));
    const tree = makeRelease({ identity: PUB });
    return {
      tree,
      cases: [
        ['deploy_static', staticInput(dir), 'dir'],
        ['deploy_with_functions', functionsInput(base, dir), 'dir'],
        ['deploy', tree.input(), 'release_contract'],
      ],
    };
  };

  test('no release fetch in the context refuses all three routes before any call', async () => {
    const base = scratch();
    const { tree, cases } = routes(base);
    try {
      for (const [action, input, field] of cases) {
        refused(await run(action, input, { fetchRelease: false }), { field, reason: 'publisher layout catalogs cannot be fetched here' }, action);
      }
    } finally {
      tree.cleanup();
    }
  });

  test('missing or malformed Pages trust refuses all three routes before any fetch', async () => {
    const good = JSON.parse(trustJson({ 'fixture-pub': [PUB.key] }));
    const entry = good.publishers['fixture-pub'];
    const shape = (publisher) => JSON.stringify({ ...good, publishers: { 'fixture-pub': publisher } });
    const variants = {
      missing: null,
      'no digest pin': shape({ keys: entry.keys, catalog: entry.catalog, catalog_signature: entry.catalog_signature }),
      ...Object.fromEntries([null, 7, '', 'a'.repeat(63), 'a'.repeat(65), 'A'.repeat(64), 'g'.repeat(64)].map((pin, i) => [`bad pin ${i}`, shape({ ...entry, catalog_sha256: pin })])),
      'no catalog URL': shape({ keys: entry.keys, catalog_signature: entry.catalog_signature, catalog_sha256: entry.catalog_sha256 }),
      'no signature URL': shape({ keys: entry.keys, catalog: entry.catalog, catalog_sha256: entry.catalog_sha256 }),
      'extra publisher key': shape({ ...entry, cache: true }),
      'http catalog': shape({ ...entry, catalog: entry.catalog.replace('https:', 'http:') }),
      'unlisted host': shape({ ...entry, catalog: entry.catalog.replace(RELEASE_HOST, 'releases.example.test') }),
      'port': shape({ ...entry, catalog: entry.catalog.replace(RELEASE_HOST, `${RELEASE_HOST}:8443`) }),
      'userinfo': shape({ ...entry, catalog: entry.catalog.replace('https://', 'https://user@') }),
      'query': shape({ ...entry, catalog: `${entry.catalog}?v=1` }),
      'fragment': shape({ ...entry, catalog: `${entry.catalog}#x` }),
      'non-canonical host case': shape({ ...entry, catalog: entry.catalog.replace(RELEASE_HOST, 'Releases.WiserMemory.com') }),
      'dot segment': shape({ ...entry, catalog: `https://${RELEASE_HOST}/pages/./fixture-pub/layouts.json` }),
      'trailing slash': shape({ ...entry, catalog: `https://${RELEASE_HOST}/pages/fixture-pub/` }),
      'same URL twice': shape({ ...entry, catalog_signature: entry.catalog }),
      'not a string': shape({ ...entry, catalog: 7 }),
      'shared across publishers': JSON.stringify({ ...good, publishers: { 'fixture-pub': entry, 'fixture-second': { keys: [SECOND.key], catalog: entry.catalog, catalog_signature: SECOND_URLS.catalog_signature, catalog_sha256: entry.catalog_sha256 } } }),
    };
    for (const [label, text] of Object.entries(variants)) {
      const copy = copyWith({ trust: text });
      const base = scratch();
      const { tree, cases } = routes(base);
      try {
        for (const [action, input] of cases) {
          const state = label === 'missing' ? 'missing' : 'malformed';
          const out = await run(action, input, { copy });
          if (action === 'deploy') {
            refused(out, { field: 'release_signature', reason: `pages-trust.json is ${state}; refusing every signed release`, fetched: [] }, `${label} ${action}`);
          } else {
            refused(out, { reason: `pages-trust.json is ${state}; refusing every Pages deploy`, fetched: [] }, `${label} ${action}`);
          }
        }
      } finally {
        tree.cleanup();
      }
    }
  });

  test('the catalog URL host is checked against the Pages module\'s own release_hosts', async () => {
    const swapped = copyWith({
      trust: trustJson({ 'fixture-pub': [PUB.key] }),
      manifest: (m) => { m.modules.pages.release_hosts = ['releases.example.test']; },
    });
    const absent = copyWith({
      trust: trustJson({ 'fixture-pub': [PUB.key] }),
      manifest: (m) => { delete m.modules.pages.release_hosts; },
    });
    for (const copy of [swapped, absent]) {
      const base = scratch();
      const dir = html(join(base, 'plain', 'out'));
      refused(await run('deploy_static', staticInput(dir), { copy }), { reason: 'pages-trust.json is malformed; refusing every Pages deploy', fetched: [] });
    }
  });

  const contentCases = () => {
    const ok = [SYNTHETIC_LAYOUT];
    const malformed = (label, value, what) => [label, Buffer.from(typeof value === 'string' ? value : `${JSON.stringify(value)}\n`), what];
    const base = { format: 1, purpose: 'cloudflare.pages.layouts', publisher: 'fixture-pub', layouts: ok };
    return [
      malformed('not JSON', '{', 'not JSON'),
      ['not UTF-8', Buffer.from([0x7b, 0xff, 0x7d]), 'not JSON'],
      malformed('an array', [base], 'fields'),
      malformed('an extra top-level key', { ...base, worker: { sha256: 'a'.repeat(64) } }, 'fields'),
      malformed('a missing key', { format: 1, purpose: base.purpose, publisher: base.publisher }, 'fields'),
      malformed('format 2', { ...base, format: 2 }, 'format'),
      malformed('the contract purpose', { ...base, purpose: 'cloudflare.pages.deploy' }, 'purpose'),
      malformed('another publisher', { ...base, publisher: 'fixture-second' }, 'publisher'),
      malformed('layouts not an array', { ...base, layouts: {} }, 'layouts'),
      malformed('no layouts', { ...base, layouts: [] }, 'layouts'),
      malformed('129 layouts', { ...base, layouts: Array.from({ length: 129 }, (_, i) => ({ root_name: `r${i}`, assets: 'webout' })) }, 'layouts'),
      malformed('a layout with an executable hash', { ...base, layouts: [{ ...SYNTHETIC_LAYOUT, worker_sha256: 'a'.repeat(64) }] }, 'layouts[0]'),
      malformed('a layout missing assets', { ...base, layouts: [{ root_name: 'bundle-root' }] }, 'layouts[0]'),
      ...[['a/b', 'root_name'], ['..', 'root_name'], ['.env', 'root_name'], ['.hidden', 'root_name'], ['memory', 'root_name'], ['', 'root_name'], [7, 'root_name']]
        .map(([value]) => malformed(`root_name ${JSON.stringify(value)}`, { ...base, layouts: [{ root_name: value, assets: 'webout' }] }, 'layouts[0].root_name')),
      ...['/webout', 'a/../b', 'a//b', 'a\\b', './webout', 'webout/', 'a/b/c/d/e/f/g/h/i', '.git/x', 'node_modules', 'x'.repeat(65)]
        .map((value) => malformed(`assets ${JSON.stringify(value)}`, { ...base, layouts: [{ root_name: 'bundle-root', assets: value }] }, 'layouts[0].assets')),
      malformed('a duplicate layout', { ...base, layouts: [SYNTHETIC_LAYOUT, SYNTHETIC_LAYOUT] }, 'layouts repeat or overlap'),
      malformed('a letter-case duplicate', { ...base, layouts: [SYNTHETIC_LAYOUT, { root_name: 'Bundle-Root', assets: 'OUT/public' }] }, 'layouts repeat or overlap'),
      malformed('an overlapping layout', { ...base, layouts: [SYNTHETIC_LAYOUT, { root_name: 'bundle-root', assets: 'out/public/inner' }] }, 'layouts repeat or overlap'),
    ];
  };

  test('a malformed signed catalog refuses all three routes before any call', async () => {
    for (const [label, bytes, what] of contentCases()) {
      const base = scratch();
      const { tree, cases } = routes(base);
      try {
        for (const [action, input, field] of cases) {
          const copy = copyWith({ trust: trustJson({ 'fixture-pub': [PUB.key] }, { 'fixture-pub': bytes }) });
          const server = serverFor({ 'fixture-pub': { identity: PUB, bytes } });
          refused(await run(action, input, { server, copy }), { field, reason: `publisher layout catalog is malformed: fixture-pub: ${what}` }, `${label} ${action}`);
        }
      } finally {
        tree.cleanup();
      }
    }
  });

  test('an oversized catalog, a wrong-size signature, an untrusted or replayed signature refuse', async () => {
    const bytes = catalogBytes('fixture-pub', [SYNTHETIC_LAYOUT]);
    const big = catalogBytes('fixture-pub', [SYNTHETIC_LAYOUT], {});
    const oversized = Buffer.concat([big.subarray(0, big.length - 2), Buffer.alloc(CATALOG_MAX_BYTES, 0x20), Buffer.from('}\n')]);
    const cases = [
      ['over 64 KiB', { bytes: oversized }, 'publisher layout catalog over 64 KiB: fixture-pub'],
      ['63-byte signature', { bytes, signature: PUB.signLayouts(bytes).subarray(0, 63) }, 'publisher layout catalog signature is not 64 bytes: fixture-pub'],
      ['65-byte signature', { bytes, signature: Buffer.concat([PUB.signLayouts(bytes), Buffer.from([0])]) }, 'publisher layout catalog signature is not 64 bytes: fixture-pub'],
      ['empty signature', { bytes, signature: Buffer.alloc(0) }, 'publisher layout catalog signature is not 64 bytes: fixture-pub'],
      ['untrusted signer', { bytes, signature: OTHER.signLayouts(bytes) }, 'publisher layout catalog is not signed by its publisher: fixture-pub'],
      ['zero signature', { bytes, signature: Buffer.alloc(64) }, 'publisher layout catalog is not signed by its publisher: fixture-pub'],
      ['contract-domain signature', { bytes, signature: PUB.signPages(bytes) }, 'publisher layout catalog is not signed by its publisher: fixture-pub'],
      ['Workers raw signature', { bytes, signature: PUB.signRaw(bytes) }, 'publisher layout catalog is not signed by its publisher: fixture-pub'],
      ['changed byte', { bytes: Buffer.concat([bytes, Buffer.from(' ')]), signature: PUB.signLayouts(bytes) }, 'publisher layout catalog is not signed by its publisher: fixture-pub'],
      ['catalog unavailable', { status: 404 }, 'publisher layout catalog unavailable: fixture-pub', 'vendor_error'],
      ['catalog server error', { status: 503 }, 'publisher layout catalog unavailable: fixture-pub', 'vendor_error'],
      ['signature unavailable', { sigStatus: 404 }, 'publisher layout catalog unavailable: fixture-pub', 'vendor_error'],
    ];
    for (const [label, entry, reason, status = 'invalid_arguments'] of cases) {
      const base = scratch();
      const { tree, cases: routeCases } = routes(base);
      try {
        for (const [action, input, field] of routeCases) {
          const server = serverFor({ 'fixture-pub': { identity: PUB, layouts: [SYNTHETIC_LAYOUT, ALTERNATE_LAYOUT], ...entry } });
          refused(await run(action, input, { server }), { field, reason, status }, `${label} ${action}`);
        }
      } finally {
        tree.cleanup();
      }
    }
  });

  test('a catalog signature is not a contract signature, and a contract signature is not a catalog\'s', async () => {
    const tree = makeRelease({ identity: PUB });
    try {
      writeFileSync(tree.signaturePath, PUB.signLayouts(tree.contractBytes));
      refused(await run('deploy', tree.input()), { field: 'release_signature', reason: 'release signature is not from a trusted Pages publisher', fetched: [] });
    } finally {
      tree.cleanup();
    }
    const tree2 = makeRelease({ identity: PUB });
    try {
      // The contract's own valid Pages signature, served as the catalog signature over the contract bytes.
      const server = serverFor({ 'fixture-pub': { identity: PUB, bytes: tree2.contractBytes, signature: PUB.signPages(tree2.contractBytes) } });
      refused(await run('deploy', tree2.input(), { server }), { field: 'release_contract', reason: 'publisher layout catalog is not signed by its publisher: fixture-pub' });
    } finally {
      tree2.cleanup();
    }
  });

  test('a layout catalog and its signature served as a Workers release are refused before upload', async () => {
    const bytes = catalogBytes('fixture-pub', [SYNTHETIC_LAYOUT]);
    const release = JSON.stringify({ format: 1, base: 'https://releases.example.test/', apps: { 'wiser-crm': { keys: [PUB.key] } } });
    const copy = copyWith({
      trust: trustJson({ 'fixture-pub': [PUB.key] }),
      release,
      manifest: (m) => { m.modules.workers.release_hosts = ['releases.example.test']; },
    });
    for (const [label, raw] of [['same bytes', bytes], ['prefixed bytes', Buffer.concat([LAYOUTS_DOMAIN, bytes])]]) {
      const fetches = [];
      const fetchImpl = async (url) => {
        fetches.push(url);
        if (url.endsWith('/manifest.json')) return new Response(raw, { status: 200 });
        if (url.endsWith('/manifest.sig')) return new Response(PUB.signLayouts(bytes), { status: 200 });
        return new Response('missing', { status: 404 });
      };
      const { gw, store, fake } = await createTestGateway({ connectorDirs: [copy.connectors], fetchImpl });
      await putActive(store, fake, { service: 'cloudflare', module: 'workers' });
      const calls = [];
      fake.auth.proxy = async (request) => { calls.push(request); return { status: 200, data: { success: true, result: {} } }; };
      const result = await confirmCall(gw, {
        action: 'cloudflare.workers.deploy_worker_release',
        input: {
          account_id: ACCOUNT, script_name: 'proof-worker', app: 'wiser-crm', version: '1.0.0',
          database_id: '01234567-89ab-cdef-0123-456789abcdef', vars: {},
        },
        confirm: true,
      });
      assert.equal(result.status, 'invalid_arguments', label);
      assert.equal(result.stage, 'before upload', label);
      assert.match(result.reason, /release signature invalid|release manifest malformed/, label);
      assert.equal(calls.length, 0, label);
      assert.ok(fetches.every((url) => url.startsWith('https://releases.example.test/wiser-crm/')), label);
    }
  });
});

describe('layout catalog: pages.deploy requires its own layout listed by its own publisher', { concurrency: false }, () => {
  test('a contract whose layout its publisher lists deploys', async () => {
    const tree = makeRelease({ identity: PUB });
    try {
      const out = await run('deploy', tree.input(), { server: serverFor({ 'fixture-pub': { identity: PUB, layouts: [SYNTHETIC_LAYOUT, ALTERNATE_LAYOUT] } }) });
      deployed(out);
      assert.deepEqual(out.fetched, [PUB_URLS.catalog, PUB_URLS.catalog_signature]);
    } finally {
      tree.cleanup();
    }
  });

  for (const [label, entries] of [
    ['an omitted layout', { 'fixture-pub': { identity: PUB, layouts: [ALTERNATE_LAYOUT] } }],
    ['a layout listed only with its assets changed', { 'fixture-pub': { identity: PUB, layouts: [{ root_name: 'bundle-root', assets: 'out' }] } }],
    ['a letter-case variant of the layout', { 'fixture-pub': { identity: PUB, layouts: [{ root_name: 'Bundle-Root', assets: 'out/public' }] } }],
    ['the layout listed only by another configured publisher', {
      'fixture-pub': { identity: PUB, layouts: [ALTERNATE_LAYOUT] },
      'fixture-second': { identity: SECOND, layouts: [SYNTHETIC_LAYOUT] },
    }],
  ]) {
    test(`${label} refuses before any Cloudflare call`, async () => {
      const tree = makeRelease({ identity: PUB });
      try {
        const declaredKeys = Object.fromEntries(Object.entries(entries).map(([label, entry]) => [label, [entry.identity.key]]));
        const declaredCatalogs = Object.fromEntries(Object.entries(entries).map(([label, entry]) => [label, catalogBytes(label, entry.layouts)]));
        const pinned = copyWith({ trust: trustJson(declaredKeys, declaredCatalogs) });
        refused(await run('deploy', tree.input(), { copy: pinned, server: serverFor(entries) }),
          { field: 'release_contract', reason: 'release layout is not in its publisher\'s layout catalog' }, label);
      } finally {
        tree.cleanup();
      }
    });
  }

  test('a planted catalog or trust file in the release root is not read', async () => {
    const tree = makeRelease({ identity: PUB });
    try {
      const planted = catalogBytes('fixture-pub', [SYNTHETIC_LAYOUT]);
      writeFileSync(join(tree.root, 'layouts.json'), planted);
      writeFileSync(join(tree.root, 'layouts.sig'), PUB.signLayouts(planted));
      writeFileSync(join(tree.root, 'pages-trust.json'), trustJson({ 'fixture-pub': [PUB.key] }));
      refused(await run('deploy', tree.input(), { server: serverFor({ 'fixture-pub': { identity: PUB, layouts: [ALTERNATE_LAYOUT] } }) }),
        { field: 'release_contract', reason: 'publisher layout catalog SHA-256 does not match trusted pin: fixture-pub', fetched: [PUB_URLS.catalog, PUB_URLS.catalog_signature] });
    } finally {
      tree.cleanup();
    }
  });

  test('local release refusals come before any publisher fetch', async () => {
    const tree = makeRelease({ identity: PUB });
    try {
      writeFileSync(tree.signaturePath, OTHER.signPages(tree.contractBytes));
      refused(await run('deploy', tree.input()), { field: 'release_signature', fetched: [] });
    } finally {
      tree.cleanup();
    }
  });

  test('a contract changed after the catalog check makes no deployment call', async () => {
    const tree = makeRelease({ identity: PUB });
    try {
      const { modules } = await TRUSTED.load();
      const server = serverFor({ 'fixture-pub': { identity: PUB, layouts: [SYNTHETIC_LAYOUT, ALTERNATE_LAYOUT] } });
      const calls = [];
      const ctx = {
        fetchRelease: (url, opts) => server.fetchRelease(url, opts),
        proxy: deployProxy(calls, { onCheck: () => writeFileSync(tree.contractPath, Buffer.concat([tree.contractBytes, Buffer.from(' ')])) }),
      };
      const result = await modules.pages.deploy(tree.input(), ctx);
      assert.equal(result.status, 'invalid_arguments', JSON.stringify(result));
      assert.match(result.reason, /^file changed during deploy/);
      assert.equal(deploymentCalls(calls).length, 0);
      assert.equal(server.requests.length, 2);
    } finally {
      tree.cleanup();
    }
  });
});

describe('layout catalog: through the gateway\'s own release fetcher', { concurrency: false }, () => {
  async function gatewayRun(action, input, { copy = TRUSTED, server = serverFor() } = {}) {
    const { gw, store, fake } = await createTestGateway({ connectorDirs: [copy.connectors], fetchImpl: server.fetchImpl });
    await putActive(store, fake, { service: 'cloudflare', module: 'pages' });
    const calls = [];
    fake.auth.proxy = deployProxy(calls);
    const result = await confirmCall(gw, { action: `cloudflare.pages.${action}`, input, confirm: true });
    return { result, calls, fetched: server.urls(), server };
  }

  test('the Pages module declares exactly the existing publisher host, and Workers keeps its own', () => {
    const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
    assert.deepEqual(manifest.modules.pages.release_hosts, [RELEASE_HOST]);
    assert.deepEqual(manifest.modules.workers.release_hosts, [RELEASE_HOST]);
  });

  test('each catalog read is an unauthenticated GET of the exact trusted URL with no credentials', async () => {
    const base = scratch();
    const dir = html(join(base, 'plain', 'out'));
    const out = await gatewayRun('deploy_static', staticInput(dir));
    assert.equal(out.result.status, undefined, JSON.stringify(out.result));
    assert.equal(deploymentCalls(out.calls).length, 1);
    assert.deepEqual(out.fetched, [PUB_URLS.catalog, PUB_URLS.catalog_signature]);
    for (const request of out.server.requests) {
      assert.equal(request.method, 'GET');
      assert.deepEqual(request.headers, { accept: 'application/octet-stream' });
      assert.equal(request.credentials, 'omit');
      assert.equal(request.redirect, 'manual');
    }
  });

  test('the gateway\'s byte limits refuse an oversized catalog or signature with no Cloudflare call', async () => {
    const bytes = catalogBytes('fixture-pub', [SYNTHETIC_LAYOUT]);
    const base = scratch();
    const dir = html(join(base, 'plain', 'out'));
    for (const [label, entry, reason] of [
      ['body over 64 KiB', { bytes: Buffer.alloc(CATALOG_MAX_BYTES + 1, 0x20), signature: Buffer.alloc(64) }, 'publisher layout catalog over 64 KiB: fixture-pub'],
      ['content-length over 64 KiB', { bytes, headers: { 'content-length': String(CATALOG_MAX_BYTES + 1) } }, 'publisher layout catalog over 64 KiB: fixture-pub'],
      ['signature over 64 bytes', { bytes, signature: Buffer.alloc(65) }, 'publisher layout catalog signature is not 64 bytes: fixture-pub'],
    ]) {
      const out = await gatewayRun('deploy_static', staticInput(dir), { server: serverFor({ 'fixture-pub': { identity: PUB, ...entry } }) });
      assert.equal(out.result.status, 'invalid_arguments', `${label} ${JSON.stringify(out.result)}`);
      assert.equal(out.result.reason, reason, label);
      assert.equal(out.calls.length, 0, label);
    }
  });

  test('a redirect off the publisher host is refused with no Cloudflare call', async () => {
    const base = scratch();
    const dir = html(join(base, 'plain', 'out'));
    const server = serverFor();
    server.served.set(PUB_URLS.catalog, { bytes: Buffer.alloc(0), status: 302, headers: { location: 'https://evil.example/layouts.json' } });
    const out = await gatewayRun('deploy_static', staticInput(dir), { server });
    assert.equal(out.result.status, 'vendor_error', JSON.stringify(out.result));
    assert.equal(out.result.reason, 'publisher layout catalog unavailable: fixture-pub');
    assert.equal(out.calls.length, 0);
    assert.deepEqual(out.fetched, [PUB_URLS.catalog]);
  });

  test('the shipping trust reads only its own trusted URLs and refuses a fixture-signed catalog', async () => {
    const shipping = JSON.parse(readFileSync(new URL('../pages-trust.json', import.meta.url), 'utf8'));
    const labels = Object.keys(shipping.publishers);
    assert.deepEqual(labels, ['wiser']);
    const urls = { catalog: shipping.publishers.wiser.catalog, catalog_signature: shipping.publishers.wiser.catalog_signature };
    assert.deepEqual(urls, catalogUrls('wiser'));
    const server = publisherServer({ wiser: { identity: PUB, layouts: [SYNTHETIC_LAYOUT, ALTERNATE_LAYOUT] } });
    const base = scratch();
    const dir = html(join(base, 'plain', 'out'));
    for (const [action, input] of [['deploy_static', staticInput(dir)], ['deploy_with_functions', functionsInput(base, dir)]]) {
      const { gw, store, fake } = await createTestGateway({ connectorDirs: [SHIPPING_CONNECTORS], fetchImpl: server.fetchImpl });
      await putActive(store, fake, { service: 'cloudflare', module: 'pages' });
      const calls = [];
      fake.auth.proxy = deployProxy(calls);
      const result = await confirmCall(gw, { action: `cloudflare.pages.${action}`, input, confirm: true });
      assert.equal(result.status, 'invalid_arguments', JSON.stringify(result));
      assert.equal(result.reason, 'publisher layout catalog is not signed by its publisher: wiser');
      assert.equal(calls.length, 0);
    }
    assert.deepEqual(server.urls(), [urls.catalog, urls.catalog_signature, urls.catalog, urls.catalog_signature]);
  });

  test('a gateway with no explicit fetch reaches no network: the default fetch is blocked here', async () => {
    const base = scratch();
    const dir = html(join(base, 'plain', 'out'));
    const { gw, store, fake } = await createTestGateway({ connectorDirs: [TRUSTED.connectors] });
    await putActive(store, fake, { service: 'cloudflare', module: 'pages' });
    const calls = [];
    fake.auth.proxy = deployProxy(calls);
    const before = NETWORK.length;
    const result = await confirmCall(gw, { action: 'cloudflare.pages.deploy_static', input: staticInput(dir), confirm: true });
    assert.equal(result.status, 'vendor_error', JSON.stringify(result));
    assert.equal(calls.length, 0);
    // The blocker saw the attempt; clear it so the file's own guard checks only unintended ones.
    assert.deepEqual(NETWORK.splice(before), [PUB_URLS.catalog]);
  });
});

describe('layout catalog: independent exact byte pin prevents signed rollback', { concurrency: false }, () => {
  const newer = catalogBytes('fixture-pub', [SYNTHETIC_LAYOUT, ALTERNATE_LAYOUT]);
  const older = catalogBytes('fixture-pub', [SYNTHETIC_LAYOUT]);
  for (const action of ['deploy_static', 'deploy_with_functions', 'deploy']) {
    for (const [label, bytes] of [
      ['a validly signed older narrower catalog', older],
      ['a validly signed byte change (whitespace)', Buffer.concat([newer, Buffer.from(' ')])],
    ]) {
      test(`${action}: newer independent trust rejects ${label} before any provider call`, async () => {
        const base = scratch();
        // No kit marker: the narrower catalog would omit this protected layout.
        const dir = html(join(base, 'pkg-alpha', 'build', 'web', 'static'));
        const tree = makeRelease({ identity: PUB });
        try {
          const input = action === 'deploy' ? tree.input() : action === 'deploy_static' ? staticInput(dir) : functionsInput(base, dir);
          const server = serverFor({ 'fixture-pub': { identity: PUB, bytes } });
          refused(await run(action, input, { server }), {
            field: action === 'deploy' ? 'release_contract' : 'dir',
            reason: 'publisher layout catalog SHA-256 does not match trusted pin: fixture-pub',
          });
        } finally { tree.cleanup(); }
      });
    }

    test(`${action}: exact new pinned catalog works and still needs its signature`, async () => {
      const base = scratch();
      const dir = html(join(base, 'ordinary', 'out'));
      const tree = makeRelease({ identity: PUB });
      try {
        const input = action === 'deploy' ? tree.input() : action === 'deploy_static' ? staticInput(dir) : functionsInput(base, dir);
        deployed(await run(action, input, { server: serverFor({ 'fixture-pub': { identity: PUB, bytes: newer } }) }));
        const server = serverFor({ 'fixture-pub': { identity: PUB, bytes: newer, signature: OTHER.signLayouts(newer) } });
        refused(await run(action, input, { server }), {
          field: action === 'deploy' ? 'release_contract' : 'dir',
          reason: 'publisher layout catalog is not signed by its publisher: fixture-pub',
        });
      } finally { tree.cleanup(); }
    });

    test(`${action}: a second publisher's pin mismatch refuses despite the first matching`, async () => {
      const base = scratch();
      const dir = html(join(base, 'ordinary', 'out'));
      const tree = makeRelease({ identity: PUB });
      try {
        const input = action === 'deploy' ? tree.input() : action === 'deploy_static' ? staticInput(dir) : functionsInput(base, dir);
        const server = serverFor({
          'fixture-pub': { identity: PUB, layouts: [SYNTHETIC_LAYOUT] },
          'fixture-second': { identity: SECOND, layouts: [SYNTHETIC_LAYOUT] },
        });
        refused(await run(action, input, { copy: TWO, server }), {
          field: action === 'deploy' ? 'release_contract' : 'dir',
          reason: 'publisher layout catalog SHA-256 does not match trusted pin: fixture-second',
        });
      } finally { tree.cleanup(); }
    });
  }
});
