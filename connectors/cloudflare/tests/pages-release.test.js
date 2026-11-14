// pages.deploy with a signed generic release contract. Every key here is an
// in-memory FIXTURE identity; the shipping trust file is never modified, and a
// passing case proves nothing about a production release, whose contract must
// be signed and installed by its own approved step.
import { confirmCall } from '../../../gateway/test/fake-provider.js';
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  linkSync, mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { existsSync as __exists } from 'node:fs';
import { dirname as __dirname_, join as __join } from 'node:path';
import { fileURLToPath as __toPath, pathToFileURL as __toUrl } from 'node:url';
import {
  BUILD_TIME, PAGES_DOMAIN, SYNTHETIC_LAYOUT, SYNTHETIC_WORKER, blockNetwork, bundleParts, connectorCopy, deployProxy,
  deploymentCalls, fixtureIdentity, formParts, makeData, makeRelease, publisherServer, sha, syntheticContract, trustJson,
} from './pages-release-fixture.js';

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

const SHIPPING_CONNECTORS = __toPath(new URL('../..', import.meta.url));
const PUB = fixtureIdentity('fixture-pub');
const OTHER = fixtureIdentity('fixture-other');
const SECOND = fixtureIdentity('fixture-second');
const TRUSTED = connectorCopy({ trust: trustJson({ 'fixture-pub': [PUB.key] }) });
const copies = [TRUSTED];
// Every publisher read is served by this fake; the process's own fetch is blocked.
const NETWORK = blockNetwork();
const CATALOGS = () => publisherServer({
  'fixture-pub': { identity: PUB, layouts: [SYNTHETIC_LAYOUT] },
  'second-pub': { identity: SECOND, layouts: [SYNTHETIC_LAYOUT] },
});
after(() => {
  for (const copy of copies) copy.cleanup();
  assert.deepEqual(NETWORK, [], 'no test may reach the network through a default fetch');
});

function copyWith(options) {
  const copy = connectorCopy(options);
  copies.push(copy);
  return copy;
}

async function gatewayFor(connectors, proxyOpts) {
  const { gw, store, fake } = await createTestGateway({ connectorDirs: [connectors], fetchImpl: CATALOGS().fetchImpl });
  await putActive(store, fake, { service: 'cloudflare', module: 'pages' });
  const calls = [];
  fake.auth.proxy = deployProxy(calls, proxyOpts);
  return { gw, calls };
}

async function deploy(tree, { copy = TRUSTED, connectors, input, proxy } = {}) {
  const { gw, calls } = await gatewayFor(connectors || copy.connectors, proxy);
  const result = await confirmCall(gw, { action: 'cloudflare.pages.deploy', input: input || tree.input(), confirm: true });
  return { result, calls };
}

function refusedBeforeCall({ result, calls }, field, reason, label = '') {
  assert.equal(result.status, 'invalid_arguments', `${label} ${JSON.stringify(result)}`);
  if (field) assert.equal(result.field, field, label);
  if (reason instanceof RegExp) assert.match(result.reason, reason, label);
  else if (reason) assert.equal(result.reason, reason, label);
  assert.equal(calls.length, 0, `${label}: provider calls`);
}

async function withTree(opts, body) {
  const tree = makeRelease({ identity: PUB, ...opts });
  try {
    return await body(tree);
  } finally {
    tree.cleanup();
  }
}

describe('pages.deploy signed release: valid synthetic payloads', { concurrency: false }, () => {
  test('the Pages signature domain is the NUL-terminated prefix', () => {
    assert.equal(PAGES_DOMAIN.length, 23);
    assert.equal(PAGES_DOMAIN.toString('latin1', 0, 22), 'wiser.pages-release.v1');
    assert.equal(PAGES_DOMAIN[22], 0);
    assert.equal(PAGES_DOMAIN.includes(Buffer.from('\\0')), false);
  });

  test('a signed release with its Function reaches the provider with the canonical bundle and no release file as an asset', async () => {
    await withTree({}, async (tree) => {
      const { result, calls } = await deploy(tree);
      assert.equal(result.deployment.id, 'dep-synthetic', JSON.stringify(result));
      assert.equal(result.files, 2);
      assert.deepEqual(result.release, { publisher: 'fixture-pub', release: '7.3.1', key_id: PUB.id });
      assert.deepEqual(result.function, {
        release: '7.3.1',
        worker_sha256: sha(SYNTHETIC_WORKER),
        module_name: 'main.mjs',
        data_bytes: tree.data.length,
        routes: { include: 1, exclude: 1 },
        carried: ['/synthetic/due-one'],
        not_carried: ['/synthetic/later-one'],
      });
      assert.equal(JSON.stringify(result).includes('synthetic-jwt-value'), false);
      assert.ok(result.skipped.some((item) => item.file === '_routes.json' && item.reason === 'not an asset'));
      const posted = deploymentCalls(calls);
      assert.equal(posted.length, 1);
      const parts = formParts(posted[0].binary_body);
      assert.deepEqual(parts.map((part) => part.name), ['manifest', '_worker.bundle', '_routes.json']);
      const bundlePart = parts.find((part) => part.name === '_worker.bundle');
      assert.equal(bundlePart.filename, '_worker.bundle');
      assert.equal(bundlePart.contentType, 'application/octet-stream');
      const bundle = bundleParts(bundlePart.value);
      assert.deepEqual(bundle.map((part) => part.name), ['metadata', 'main.mjs', 'table.dat']);
      assert.deepEqual(JSON.parse(bundle[0].value.toString('utf8')), { main_module: 'main.mjs' });
      assert.equal(bundle[0].filename, undefined);
      assert.equal(bundle[1].filename, 'main.mjs');
      assert.equal(bundle[1].contentType, 'application/javascript+module');
      assert.ok(bundle[1].value.equals(SYNTHETIC_WORKER));
      assert.equal(bundle[2].filename, 'table.dat');
      assert.equal(bundle[2].contentType, 'application/octet-stream');
      assert.ok(bundle[2].value.equals(tree.data));
      const routesPart = parts.find((part) => part.name === '_routes.json');
      assert.ok(routesPart.value.equals(tree.routes));
      const manifest = JSON.parse(parts[0].value.toString('utf8'));
      assert.deepEqual(Object.keys(manifest).sort(), ['/css/site.css', '/index.html']);
      const forbidden = [SYNTHETIC_WORKER, tree.routes, tree.data, tree.record, tree.contractBytes,
        readFileSync(tree.signaturePath), readFileSync(join(tree.root, 'release-id.json'))];
      for (const bytes of forbidden) assert.equal(parts[0].value.includes(bytes), false);
      const uploads = calls.filter((call) => call.endpoint === '/pages/assets/upload');
      assert.ok(uploads.length >= 1);
      for (const upload of uploads) {
        for (const item of upload.body) {
          const raw = Buffer.from(item.value, 'base64');
          for (const bytes of forbidden) assert.equal(raw.includes(bytes), false);
        }
      }
    });
  });

  test('a signed release with no Function directory deploys static only and reports function null', async () => {
    await withTree({ fn: false }, async (tree) => {
      const { result, calls } = await deploy(tree);
      assert.equal(result.deployment?.id, 'dep-synthetic', JSON.stringify(result));
      assert.equal(result.function, null);
      assert.deepEqual(result.release, { publisher: 'fixture-pub', release: '7.3.1', key_id: PUB.id });
      const posted = deploymentCalls(calls);
      assert.equal(posted.length, 1);
      assert.deepEqual(formParts(posted[0].binary_body).map((part) => part.name), ['manifest']);
    });
  });

  test('confirmation stays always: every call stops for confirmation and nothing is called before it', async () => {
    await withTree({}, async (tree) => {
      const { gw, calls } = await gatewayFor(TRUSTED.connectors);
      const call = { action: 'cloudflare.pages.deploy', input: tree.input() };
      assert.equal((await gw.execute(call)).status, 'needs_confirmation');
      assert.equal(calls.length, 0);
      const done = await confirmCall(gw, { ...call, confirm: true });
      assert.equal(done.deployment.id, 'dep-synthetic');
      assert.equal((await gw.execute(call)).status, 'needs_confirmation');
    });
  });
});

describe('pages.deploy signed release: trust and signatures', { concurrency: false }, () => {
  test('the shipping connector does not trust a fixture signer', async () => {
    await withTree({}, async (tree) => {
      refusedBeforeCall(await deploy(tree, { connectors: SHIPPING_CONNECTORS }), 'release_signature',
        'release signature is not from a trusted Pages publisher');
    });
  });

  test('an untrusted signer, a zero signature and a flipped signature refuse before any call', async () => {
    const cases = [
      ['untrusted', (tree) => writeFileSync(tree.signaturePath, OTHER.signPages(tree.contractBytes))],
      ['zero', (tree) => writeFileSync(tree.signaturePath, Buffer.alloc(64))],
      ['flipped', (tree) => { const sig = readFileSync(tree.signaturePath); sig[10] ^= 1; writeFileSync(tree.signaturePath, sig); }],
    ];
    for (const [label, mutate] of cases) {
      await withTree({}, async (tree) => {
        mutate(tree);
        refusedBeforeCall(await deploy(tree), 'release_signature', 'release signature is not from a trusted Pages publisher', label);
      });
    }
  });

  test('a signature that is not 64 bytes, or absent, refuses before any call', async () => {
    await withTree({}, async (tree) => {
      writeFileSync(tree.signaturePath, PUB.signPages(tree.contractBytes).subarray(0, 63));
      refusedBeforeCall(await deploy(tree), 'release_signature', 'release signature is not 64 bytes');
    });
    await withTree({}, async (tree) => {
      writeFileSync(tree.signaturePath, Buffer.concat([PUB.signPages(tree.contractBytes), Buffer.from([0])]));
      refusedBeforeCall(await deploy(tree), 'release_signature', 'release signature is not 64 bytes');
    });
    await withTree({ signature: null }, async (tree) => {
      refusedBeforeCall(await deploy(tree), 'release_signature', 'not found');
    });
  });

  test('an unsigned legacy input with only dir is refused by the published schema', async () => {
    await withTree({}, async (tree) => {
      const { release_contract: _c, release_signature: _s, ...legacy } = tree.input();
      const out = await deploy(tree, { input: legacy });
      assert.equal(out.result.status, 'invalid_arguments');
      assert.ok(['release_contract', 'release_signature'].includes(out.result.field), JSON.stringify(out.result));
      assert.equal(out.calls.length, 0);
    });
  });

  test('missing trust refuses every deploy, static only included', async () => {
    const none = copyWith({ trust: null });
    for (const fn of [true, false]) {
      await withTree({ fn }, async (tree) => {
        refusedBeforeCall(await deploy(tree, { copy: none }), 'release_signature',
          'pages-trust.json is missing; refusing every signed release', `fn=${fn}`);
      });
    }
  });

  test('malformed trust refuses before any call', async () => {
    const good = JSON.parse(trustJson({ 'fixture-pub': [PUB.key] }));
    // Each shape keeps the publisher's valid catalog URLs, so only the named defect refuses.
    const entry = good.publishers['fixture-pub'];
    const shapes = {
      'not JSON': '{',
      'extra top key': JSON.stringify({ ...good, apps: {} }),
      'wrong purpose': JSON.stringify({ ...good, purpose: 'cloudflare.workers.deploy' }),
      'short key': JSON.stringify({ ...good, publishers: { 'fixture-pub': { ...entry, keys: [{ id: PUB.id, ed25519: 'AAAA' }] } } }),
      'duplicate id': JSON.stringify({ ...good, publishers: { 'fixture-pub': { ...entry, keys: [PUB.key, { ...SECOND.key, id: PUB.id }] } } }),
      'no publishers': JSON.stringify({ ...good, publishers: {} }),
      'extra key field': JSON.stringify({ ...good, publishers: { 'fixture-pub': { ...entry, keys: [{ ...PUB.key, sha256: 'x' }] } } }),
    };
    // The same valid shape is accepted, so the refusals above are not the shape's own.
    assert.equal(JSON.stringify(good), JSON.stringify(JSON.parse(trustJson({ 'fixture-pub': [PUB.key] }))));
    for (const [label, text] of Object.entries(shapes)) {
      const copy = copyWith({ trust: text });
      await withTree({}, async (tree) => {
        refusedBeforeCall(await deploy(tree, { copy }), 'release_signature',
          'pages-trust.json is malformed; refusing every signed release', label);
      });
    }
  });

  test('a key trusted only for a Workers app is not a Pages key', async () => {
    const release = JSON.stringify({ format: 1, base: 'https://releases.wisermemory.com/', apps: { 'wiser-crm': { keys: [PUB.key] } } });
    const copy = copyWith({ trust: trustJson({ 'fixture-pub': [SECOND.key] }), release });
    await withTree({}, async (tree) => {
      refusedBeforeCall(await deploy(tree, { copy }), 'release_signature', 'release signature is not from a trusted Pages publisher');
    });
  });

  test('a raw signature without the Pages domain does not verify as a Pages signature', async () => {
    await withTree({}, async (tree) => {
      writeFileSync(tree.signaturePath, PUB.signRaw(tree.contractBytes));
      refusedBeforeCall(await deploy(tree), 'release_signature', 'release signature is not from a trusted Pages publisher');
    });
  });

  test('changed contract bytes refuse even when the JSON means the same', async () => {
    await withTree({}, async (tree) => {
      writeFileSync(tree.contractPath, Buffer.concat([tree.contractBytes, Buffer.from(' ')]));
      refusedBeforeCall(await deploy(tree), 'release_signature', 'release signature is not from a trusted Pages publisher', 'whitespace');
    });
    await withTree({}, async (tree) => {
      const compact = Buffer.from(JSON.stringify(JSON.parse(tree.contractBytes)), 'utf8');
      writeFileSync(tree.contractPath, compact);
      refusedBeforeCall(await deploy(tree), 'release_signature', 'release signature is not from a trusted Pages publisher', 'reserialized');
    });
    await withTree({}, async (tree) => {
      const changed = JSON.parse(tree.contractBytes);
      changed.worker.sha256 = sha(Buffer.from('another worker'));
      writeFileSync(tree.contractPath, `${JSON.stringify(changed, null, 2)}\n`);
      refusedBeforeCall(await deploy(tree), 'release_signature', 'release signature is not from a trusted Pages publisher', 'field');
    });
  });

  test('a payload-supplied key or trust file is not trust', async () => {
    // An attacker-signed contract carrying its own key, and a planted trust file in the release root.
    const contract = { ...syntheticContract(), public_key: OTHER.ed25519 };
    await withTree({ contract, identity: OTHER }, async (tree) => {
      writeFileSync(join(tree.root, 'pages-trust.json'), trustJson({ 'fixture-pub': [OTHER.key] }));
      refusedBeforeCall(await deploy(tree), 'release_signature', 'release signature is not from a trusted Pages publisher');
    });
    // Signed by the trusted key, an extra key is still a closed-schema refusal.
    await withTree({ contract }, async (tree) => {
      refusedBeforeCall(await deploy(tree), 'release_contract', /^release contract is malformed/);
    });
  });

  test('a contract naming another configured publisher than its signer refuses', async () => {
    const copy = copyWith({ trust: trustJson({ 'fixture-pub': [PUB.key], 'second-pub': [SECOND.key] }) });
    await withTree({ identity: SECOND }, async (tree) => {
      refusedBeforeCall(await deploy(tree, { copy }), 'release_contract', 'release contract names another publisher');
    });
  });
});

describe('pages.deploy signed release: Pages and Workers signatures do not replay', { concurrency: false }, () => {
  test('a Pages-signed contract served as a Workers release manifest is refused before upload', async () => {
    const contractBytes = Buffer.from(`${JSON.stringify(syntheticContract(), null, 2)}\n`, 'utf8');
    const pagesSig = PUB.signPages(contractBytes);
    const release = JSON.stringify({ format: 1, base: 'https://releases.example.test/', apps: { 'wiser-crm': { keys: [PUB.key] } } });
    const copy = copyWith({ trust: trustJson({ 'fixture-pub': [PUB.key] }), release });
    const manifestPath = join(copy.dir, 'manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.modules.workers.release_hosts = ['releases.example.test'];
    writeFileSync(manifestPath, JSON.stringify(manifest));
    const served = [
      ['same bytes, Pages signature', contractBytes, pagesSig, /release signature invalid/],
      ['prefixed bytes, Pages signature', Buffer.concat([PAGES_DOMAIN, contractBytes]), pagesSig, /release manifest malformed/],
    ];
    for (const [label, raw, sig, reason] of served) {
      const fetchImpl = async (url) => {
        if (url.endsWith('/manifest.json')) return new Response(raw, { status: 200 });
        if (url.endsWith('/manifest.sig')) return new Response(sig, { status: 200 });
        return new Response('missing', { status: 404 });
      };
      const { gw, store, fake } = await createTestGateway({ connectorDirs: [copy.connectors], fetchImpl });
      await putActive(store, fake, { service: 'cloudflare', module: 'workers' });
      const calls = [];
      fake.auth.proxy = async (request) => { calls.push(request); return { status: 200, data: { success: true, result: {} } }; };
      const result = await confirmCall(gw, {
        action: 'cloudflare.workers.deploy_worker_release',
        input: {
          account_id: '0123456789abcdef0123456789abcdef', script_name: 'proof-worker', app: 'wiser-crm', version: '1.0.0',
          database_id: '01234567-89ab-cdef-0123-456789abcdef', vars: {},
        },
        confirm: true,
      });
      assert.equal(result.status, 'invalid_arguments', label);
      assert.equal(result.stage, 'before upload', label);
      assert.match(result.reason, reason, label);
      assert.equal(calls.length, 0, label);
    }
  });
});

describe('pages.deploy signed release: closed contract schema', { concurrency: false }, () => {
  const malformed = {
    'format 2': { format: 2 },
    'other purpose': { purpose: 'cloudflare.workers.deploy' },
    'other container': { data: { container: 'u16le-json' } },
    'bad release': { release: 'v7' },
    'bad publisher': { publisher: 'Fixture Pub' },
    'traversal assets': { layout: { assets: '../out' } },
    'dot segment': { layout: { assets: 'out/./public' } },
    'absolute path': { layout: { assets: '/out/public' } },
    'repeated separator': { layout: { assets: 'out//public' } },
    'backslash': { layout: { assets: 'out\\public' } },
    'credential identity': { layout: { identity: { path: '.env' } } },
    'git build record': { layout: { build: { path: '.git/stamp.json' } } },
    'key-shaped Function file': { layout: { function: { record: 'id_rsa' } } },
    'hidden Function file': { layout: { function: { data: '.table.dat' } } },
    'root name with a separator': { layout: { root_name: 'a/b' } },
    'duplicate Function roles': { layout: { function: { routes: 'entry.mjs' } } },
    'case-alias Function roles': { layout: { function: { routes: 'ENTRY.mjs' } } },
    'Function inside assets': { layout: { function: { directory: 'out/public/edge' } } },
    'assets inside Function': { layout: { function: { directory: 'out' } } },
    'identity inside assets': { layout: { identity: { path: 'out/public/release-id.json' } } },
    'build record equals identity': { layout: { build: { path: 'release-id.json' } } },
    'identity inside Function': { layout: { identity: { path: 'edge/release-id.json' } } },
    'bad worker hash': { worker: { sha256: 'ABC' } },
    'module named metadata': { worker: { module_name: 'metadata' } },
    'module equals data part': { worker: { module_name: 'table.dat' } },
    'non-canonical magic': { data: { magic: 'U1lOOQ' } },
    'empty magic': { data: { magic: '' } },
    'record field reused': { record: { time: 'rel' } },
    'record field __proto__': { record: { carried: '__proto__' } },
    'version not integer': { data: { version: 1.5 } },
    'missing layout key': { layout: { build: { path: 'meta/stamp.json', time: undefined } } },
  };
  for (const [label, patch] of Object.entries(malformed)) {
    test(`a signed contract with ${label} refuses before any call`, async () => {
      const contract = JSON.parse(JSON.stringify(syntheticContract(patch)));
      await withTree({ contract, fn: false }, async (tree) => {
        refusedBeforeCall(await deploy(tree), 'release_contract', /^release contract is malformed/, label);
      });
    });
  }

  test('a signed contract with an extra key in a nested shape refuses', async () => {
    const contract = syntheticContract();
    contract.layout.function.extra = 'x.bin';
    await withTree({ contract, fn: false }, async (tree) => {
      refusedBeforeCall(await deploy(tree), 'release_contract', /^release contract is malformed/);
    });
  });

  test('a contract over 16 KiB refuses before its signature is checked', async () => {
    const contract = syntheticContract();
    const padded = Buffer.from(`${JSON.stringify(contract)}${' '.repeat(17 * 1024)}`, 'utf8');
    await withTree({ contract, contractBytes: padded }, async (tree) => {
      refusedBeforeCall(await deploy(tree), 'release_contract', 'release contract over 16 KiB');
    });
  });

  test('a signed contract that is not JSON refuses', async () => {
    await withTree({ contractBytes: Buffer.from('not json\n') }, async (tree) => {
      refusedBeforeCall(await deploy(tree), 'release_contract', 'release contract is not JSON');
    });
  });
});

describe('pages.deploy signed release: binding the request to the signed layout', { concurrency: false }, () => {
  test('dir must be exactly the signed assets directory', async () => {
    await withTree({}, async (tree) => {
      mkdirSync(join(tree.dist, 'nested'));
      writeFileSync(join(tree.dist, 'nested', 'x.html'), 'x\n');
      mkdirSync(join(tree.root, 'out', 'other'));
      writeFileSync(join(tree.root, 'out', 'other', 'x.html'), 'x\n');
      for (const dir of [join(tree.root, 'out'), join(tree.dist, 'nested'), join(tree.root, 'out', 'other'), tree.root]) {
        refusedBeforeCall(await deploy(tree, { input: tree.input({ dir }) }), 'dir', 'dir is not the signed assets directory', dir);
      }
    });
  });

  test('a contract replayed into a differently named root refuses', async () => {
    await withTree({ rootName: 'another-root' }, async (tree) => {
      refusedBeforeCall(await deploy(tree), 'release_contract', 'release root name does not match the contract');
    });
  });

  test('an identity or Function record naming another release refuses', async () => {
    await withTree({ identityVersion: '7.3.0' }, async (tree) => {
      refusedBeforeCall(await deploy(tree), 'dir', 'release version mismatch', 'identity');
    });
    await withTree({ identityVersion: '7.3.0', fn: false }, async (tree) => {
      refusedBeforeCall(await deploy(tree), 'dir', 'release version mismatch', 'identity, static only');
    });
    await withTree({ recordOverrides: { rel: '7.3.0' } }, async (tree) => {
      refusedBeforeCall(await deploy(tree), 'dir', 'release version mismatch', 'record');
    });
  });

  test('a missing, linked or unreadable identity file refuses', async () => {
    await withTree({}, async (tree) => {
      rmSync(join(tree.root, 'release-id.json'));
      refusedBeforeCall(await deploy(tree), 'dir', 'release identity missing', 'missing');
    });
    await withTree({}, async (tree) => {
      const real = join(tree.base, 'id-elsewhere.json');
      renameSync(join(tree.root, 'release-id.json'), real);
      symlinkSync(real, join(tree.root, 'release-id.json'));
      refusedBeforeCall(await deploy(tree), 'dir', 'release identity missing', 'link');
    });
    await withTree({}, async (tree) => {
      writeFileSync(join(tree.root, 'release-id.json'), 'not json');
      refusedBeforeCall(await deploy(tree), 'dir', 'release identity unreadable', 'not json');
    });
    await withTree({}, async (tree) => {
      writeFileSync(join(tree.root, 'release-id.json'), `{"releaseTag":"7.3.1","pad":"${'x'.repeat(300 * 1024)}"}`);
      refusedBeforeCall(await deploy(tree), 'dir', 'release identity unreadable', 'oversize');
    });
  });

  test('relative, non-normal and linked input paths refuse before any call', async () => {
    await withTree({}, async (tree) => {
      const cases = [
        [{ dir: 'out/public' }, 'dir', 'path must be absolute'],
        [{ dir: `${tree.root}/out/../out/public` }, 'dir', 'path is not in normal form'],
        [{ release_contract: 'release.contract.json' }, 'release_contract', 'path must be absolute'],
        [{ release_contract: `${tree.root}//release.contract.json` }, 'release_contract', 'path is not in normal form'],
        [{ release_signature: `${tree.root}/./release.contract.sig` }, 'release_signature', 'path is not in normal form'],
      ];
      for (const [patch, field, reason] of cases) {
        refusedBeforeCall(await deploy(tree, { input: tree.input(patch) }), field, reason, JSON.stringify(patch));
      }
    });
    // A link at the root, in the assets path, at the contract and at the signature.
    await withTree({}, async (tree) => {
      const alias = join(tree.base, 'alias-root');
      mkdirSync(alias);
      symlinkSync(tree.root, join(alias, 'bundle-root'));
      const viaLink = join(alias, 'bundle-root');
      refusedBeforeCall(await deploy(tree, { input: tree.input({
        dir: join(viaLink, 'out', 'public'),
        release_contract: join(viaLink, 'release.contract.json'),
        release_signature: join(viaLink, 'release.contract.sig'),
      }) }), 'dir', 'symbolic link in path', 'root link');
    });
    await withTree({}, async (tree) => {
      const real = join(tree.base, 'public-elsewhere');
      renameSync(tree.dist, real);
      symlinkSync(real, tree.dist);
      refusedBeforeCall(await deploy(tree), 'dir', 'symbolic link in path', 'assets link');
    });
    await withTree({}, async (tree) => {
      const real = join(tree.base, 'contract-elsewhere.json');
      renameSync(tree.contractPath, real);
      symlinkSync(real, tree.contractPath);
      refusedBeforeCall(await deploy(tree), 'release_contract', 'symbolic link in path', 'contract link');
    });
    await withTree({}, async (tree) => {
      const real = join(tree.base, 'sig-elsewhere');
      renameSync(tree.signaturePath, real);
      symlinkSync(real, tree.signaturePath);
      refusedBeforeCall(await deploy(tree), 'release_signature', 'symbolic link in path', 'signature link');
    });
  });

  test('a signature inside the assets or Function directory refuses', async () => {
    await withTree({}, async (tree) => {
      const inside = join(tree.dist, 'release.sig');
      writeFileSync(inside, readFileSync(tree.signaturePath));
      refusedBeforeCall(await deploy(tree, { input: tree.input({ release_signature: inside }) }), 'release_signature',
        'release signature inside the payload', 'assets');
    });
    await withTree({}, async (tree) => {
      const inside = join(tree.fnDir, 'release.sig');
      writeFileSync(inside, readFileSync(tree.signaturePath));
      refusedBeforeCall(await deploy(tree, { input: tree.input({ release_signature: inside }) }), 'release_signature',
        'release signature inside the payload', 'Function');
    });
  });

  test('a contract whose file aliases a signed role refuses', async () => {
    await withTree({}, async (tree) => {
      // The contract placed at the identity role's own name.
      const aliased = join(tree.root, 'release-id.json');
      writeFileSync(aliased, tree.contractBytes);
      refusedBeforeCall(await deploy(tree, { input: tree.input({ release_contract: aliased }) }), 'release_contract',
        'release contract aliases a signed role');
    });
  });

  test('a working folder or declared root payload refuses', async () => {
    await withTree({}, async (tree) => {
      writeFileSync(join(tree.dist, 'AGENTS.md'), '# not build output\n');
      refusedBeforeCall(await deploy(tree), 'dir', 'working folder: AGENTS.md', 'AGENTS.md in assets');
    });
    await withTree({}, async (tree) => {
      mkdirSync(join(tree.dist, '.git'));
      refusedBeforeCall(await deploy(tree), 'dir', 'working folder: .git', '.git in assets');
    });
    await withTree({}, async (tree) => {
      writeFileSync(join(tree.root, 'AGENTS.md'), '---\nroot: synthetic\n---\n# Root\n');
      refusedBeforeCall(await deploy(tree), 'dir', /^working folder: /, 'declared release root');
    });
  });

  test('_worker.js or a functions directory at the assets root refuses', async () => {
    await withTree({ assets: { 'index.html': 'x\n', '_worker.js': 'export default {}\n' } }, async (tree) => {
      refusedBeforeCall(await deploy(tree), 'dir', 'static release output only', '_worker.js');
    });
    await withTree({ assets: { 'index.html': 'x\n', 'functions/api.js': 'export {}\n' } }, async (tree) => {
      refusedBeforeCall(await deploy(tree), 'dir', 'static release output only', 'functions');
    });
  });

  test('a hard link of a release file inside the assets refuses', async () => {
    await withTree({}, async (tree) => {
      linkSync(join(tree.fnDir, 'entry.mjs'), join(tree.dist, 'copy.mjs'));
      refusedBeforeCall(await deploy(tree), 'dir', 'release file in dir: copy.mjs');
    });
  });
});

describe('pages.deploy signed release: the Function payload', { concurrency: false }, () => {
  test('a self-consistent changed worker refuses on the signed fingerprint', async () => {
    const worker = Buffer.from('export default { fetch() { return new Response("other"); } };\n', 'utf8');
    await withTree({ worker }, async (tree) => {
      refusedBeforeCall(await deploy(tree), 'dir', 'unapproved worker fingerprint');
    });
  });

  test('a fifth file, a hidden file, a folder, or a link refuses and names the entry', async () => {
    const cases = [
      ['fifth', (tree) => writeFileSync(join(tree.fnDir, 'note.txt'), 'x\n'), 'unexpected entry: note.txt'],
      ['hidden', (tree) => writeFileSync(join(tree.fnDir, '.hidden'), 'x\n'), 'unexpected entry: .hidden'],
      ['folder', (tree) => mkdirSync(join(tree.fnDir, 'extra')), 'not a regular file: extra'],
      ['link', (tree) => {
        const real = join(tree.base, 'linked-paths.json');
        renameSync(join(tree.fnDir, 'paths.json'), real);
        symlinkSync(real, join(tree.fnDir, 'paths.json'));
      }, 'symbolic link: paths.json'],
      ['missing', (tree) => rmSync(join(tree.fnDir, 'table.dat')), 'missing table.dat'],
    ];
    for (const [label, mutate, reason] of cases) {
      await withTree({}, async (tree) => {
        mutate(tree);
        refusedBeforeCall(await deploy(tree), 'dir', reason, label);
      });
    }
  });

  test('a Function directory that is a link, or a file, refuses', async () => {
    await withTree({}, async (tree) => {
      const real = join(tree.base, 'edge-elsewhere');
      renameSync(tree.fnDir, real);
      symlinkSync(real, tree.fnDir);
      refusedBeforeCall(await deploy(tree), 'dir', 'Function directory is a symbolic link');
    });
    await withTree({ fn: false }, async (tree) => {
      writeFileSync(tree.fnDir, 'not a directory\n');
      refusedBeforeCall(await deploy(tree), 'dir', 'Function directory is not a directory');
    });
  });

  test('a record hash mismatch refuses for each of the three hashes', async () => {
    for (const [field, which] of [['h_entry', 'worker'], ['h_paths', 'routes'], ['h_table', 'data']]) {
      await withTree({ recordOverrides: { [field]: '0'.repeat(64) } }, async (tree) => {
        refusedBeforeCall(await deploy(tree), 'dir', `edge-record.json hash mismatch: ${which}`, which);
      });
    }
  });

  test('a malformed Function record refuses', async () => {
    const cases = [
      [{ extra: 1 }, 'edge-record.json is not the signed record'],
      [{ inc: 'not-an-array' }, 'edge-record.json inc is not an array of strings'],
      [{ exc: [7] }, 'edge-record.json exc is not an array of strings'],
      [{ n: -1 }, 'edge-record.json n is not a count'],
      [{ at: 5 }, 'edge-record.json at is not a string'],
    ];
    for (const [overrides, reason] of cases) {
      await withTree({ recordOverrides: overrides }, async (tree) => {
        refusedBeforeCall(await deploy(tree), 'dir', reason, JSON.stringify(overrides));
      });
    }
    await withTree({ record: Buffer.from('not json') }, async (tree) => {
      refusedBeforeCall(await deploy(tree), 'dir', 'edge-record.json is not JSON');
    });
  });

  test('a build time mismatch, a missing build record, or an unreadable one refuses', async () => {
    await withTree({ recordTime: '2031-01-01T00:00:00.000Z' }, async (tree) => {
      refusedBeforeCall(await deploy(tree), 'dir', 'build time mismatch');
    });
    await withTree({ omitBuild: true }, async (tree) => {
      refusedBeforeCall(await deploy(tree), 'dir', 'missing build record');
    });
    await withTree({}, async (tree) => {
      const real = join(tree.base, 'stamp-elsewhere.json');
      renameSync(join(tree.root, 'meta', 'stamp.json'), real);
      symlinkSync(real, join(tree.root, 'meta', 'stamp.json'));
      refusedBeforeCall(await deploy(tree), 'dir', 'build record unreadable', 'link');
    });
    await withTree({}, async (tree) => {
      writeFileSync(join(tree.root, 'meta', 'stamp.json'), '{"stampedAt":12}\n');
      refusedBeforeCall(await deploy(tree), 'dir', 'build record unreadable', 'non-string');
    });
  });

  test('malformed routes, too many rules, and a 101-character rule refuse', async () => {
    const long = `/${'a'.repeat(100)}`;
    const cases = [
      [Buffer.from('not-json', 'utf8'), 'paths.json is not JSON'],
      [Buffer.from(JSON.stringify({ version: 1, include: ['/a'], exclude: [], extra: true }), 'utf8'), 'paths.json has an unexpected key: extra'],
      [Buffer.from(JSON.stringify({ version: 1, include: Array.from({ length: 101 }, (_, i) => `/p${i}`), exclude: [] }), 'utf8'), 'paths.json has more than 100 rules'],
      [Buffer.from(JSON.stringify({ version: 1, include: [long], exclude: [] }), 'utf8'), 'paths.json rule is longer than 100 characters'],
      [Buffer.from(JSON.stringify({ version: 2, include: ['/a'], exclude: [] }), 'utf8'), 'paths.json version is not 1'],
    ];
    for (const [routes, reason] of cases) {
      await withTree({ routes }, async (tree) => {
        refusedBeforeCall(await deploy(tree), 'dir', reason);
      });
    }
  });

  test('data without the signed magic, with a broken header, or another version refuses', async () => {
    const contract = syntheticContract();
    const cases = [
      [Buffer.from('not a table', 'utf8'), 'table.dat does not start with the signed magic'],
      [makeData(contract, { magic: Buffer.from('QRZ4', 'latin1') }), 'table.dat does not start with the signed magic'],
      [Buffer.concat([Buffer.from('SYN9', 'latin1'), Buffer.from([0, 0, 0, 50]), Buffer.from('{}')]), 'table.dat header does not parse'],
      [makeData(contract, { header: { fmt: 1 } }), 'table.dat header fmt is not 3'],
      [makeData(contract, { header: { v: 3 } }), 'table.dat header fmt is not 3'],
    ];
    for (const [data, reason] of cases) {
      await withTree({ data }, async (tree) => {
        refusedBeforeCall(await deploy(tree), 'dir', reason);
      });
    }
  });

  test('an oversize deployment refuses before any call and names how many entries were carried', async () => {
    const contract = syntheticContract();
    await withTree({
      data: makeData(contract, { extra: 1_800_000 }),
      carried: ['/synthetic/one', '/synthetic/two'],
      assets: { 'index.html': 'x\n', '_headers': 'h'.repeat(800_000) },
    }, async (tree) => {
      const out = await deploy(tree);
      refusedBeforeCall(out, 'dir', 'deployment request over the 3 MiB limit; the Function record carries 2 entries');
      assert.equal(out.result.carried_entries, 2);
      assert.ok(out.result.bytes > 3 * 1024 * 1024);
      assert.match(out.result.fallback, /wrangler pages deploy/);
    });
  });

  test('a bundle over 2 MiB refuses before any call', async () => {
    const contract = syntheticContract();
    await withTree({ data: makeData(contract, { extra: 2_200_000 }) }, async (tree) => {
      refusedBeforeCall(await deploy(tree), 'dir', 'bundle over 2 MiB');
    });
  });
});

describe('pages.deploy signed release: changes after screening', { concurrency: false }, () => {
  const targets = [
    ['Function worker', (tree) => join(tree.fnDir, 'entry.mjs'), 'file changed during deploy: edge/entry.mjs'],
    ['Function record', (tree) => join(tree.fnDir, 'edge-record.json'), 'file changed during deploy: edge/edge-record.json'],
    ['contract', (tree) => tree.contractPath, 'file changed during deploy: release.contract.json'],
    ['signature', (tree) => tree.signaturePath, 'file changed during deploy: release.contract.sig'],
    ['identity', (tree) => join(tree.root, 'release-id.json'), 'file changed during deploy: release-id.json'],
    ['build record', (tree) => join(tree.root, 'meta', 'stamp.json'), 'file changed during deploy: meta/stamp.json'],
    ['asset', (tree) => join(tree.dist, 'index.html'), 'file changed during deploy: index.html'],
  ];
  for (const [label, target, reason] of targets) {
    test(`a ${label} changed between screening and the deployment makes no deployment call`, async () => {
      await withTree({}, async (tree) => {
        const { result, calls } = await deploy(tree, {
          proxy: { onCheck() { writeFileSync(target(tree), 'changed\n'); } },
        });
        assert.equal(result.status, 'invalid_arguments', JSON.stringify(result));
        assert.equal(result.reason, reason);
        assert.equal(deploymentCalls(calls).length, 0);
      });
    });
  }
});

test('the build time the fixtures use is the one the record carries', () => {
  assert.equal(typeof BUILD_TIME, 'string');
});
