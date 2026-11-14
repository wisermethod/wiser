// Generic policy proofs: synthetic identities/layouts only; all signatures use
// process-memory fixture keys and only temporary connector copies trust them.
import '../../../tools/lib/tests/isolated-home.js';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, cpSync, linkSync, mkdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  blockNetwork, connectorCopy, deployProxy, deploymentCalls,
  fixtureIdentity, formParts, makeRelease, publisherServer, syntheticContract, trustJson,
} from './pages-release-fixture.js';

const NETWORK = blockNetwork();
const PUB = fixtureIdentity();
const SECOND = fixtureIdentity();
const COPY = connectorCopy({ trust: trustJson({ 'fixture-pub': [PUB.key] }) });
const copies = [COPY];
const trees = [];
after(() => {
  for (const tree of trees) tree.cleanup();
  for (const copy of copies) copy.cleanup();
  assert.deepEqual(NETWORK, []);
});
const staticContract = () => syntheticContract({ worker: null, data: null, record: null });
const treeFor = (contract = staticContract(), opts = {}) => {
  const tree = makeRelease({ identity: PUB, contract, fn: false, omitBuild: true, ...opts });
  trees.push(tree);
  return tree;
};
async function run(tree, { copy = COPY, server, onCheck, input } = {}) {
  server ||= publisherServer({ 'fixture-pub': { identity: PUB } });
  const calls = [];
  const { modules } = await copy.load();
  const result = await modules.pages.deploy(input || tree.input(), {
    proxy: deployProxy(calls, { onCheck }), fetchRelease: server.fetchRelease,
  });
  return { result, calls, reads: server.requests };
}
function refused(out, reason, reads = 0) {
  assert.equal(out.result.status, 'invalid_arguments', JSON.stringify(out.result));
  assert.match(out.result.reason, reason);
  assert.equal(out.calls.length, 0, 'provider calls');
  assert.equal(out.reads.length, reads, 'publisher reads');
}
function replaceContract(tree, contract, resign = true) {
  const bytes = Buffer.from(JSON.stringify(contract));
  writeFileSync(tree.contractPath, bytes);
  if (resign) writeFileSync(tree.signaturePath, PUB.signPages(bytes));
}

test('static-only signed bytes deploy with null Function and no unused build/data/record artifacts', async () => {
  const tree = treeFor();
  const out = await run(tree);
  assert.equal(out.result.deployment?.id, 'dep-synthetic', JSON.stringify(out.result));
  assert.equal(out.result.function, null);
  assert.deepEqual(out.result.release, { publisher: 'fixture-pub', release: '7.3.1', key_id: PUB.id });
  assert.equal(out.reads.length, 2, 'publisher reads');
  const posted = deploymentCalls(out.calls);
  assert.equal(posted.length, 1, 'deployments');
  assert.deepEqual(formParts(posted[0].binary_body).map((part) => part.name), ['manifest']);
  assert.equal(tree.data, undefined);
  assert.equal(tree.record, undefined);
});

test('current object policy retains both its Function positive and optional absent Function', async () => {
  for (const fn of [true, false]) {
    const tree = treeFor(syntheticContract(), { fn, omitBuild: !fn });
    const out = await run(tree);
    assert.equal(out.result.deployment?.id, 'dep-synthetic', JSON.stringify(out.result));
    assert.equal(out.result.function === null, !fn);
    assert.equal(out.reads.length, 2);
    assert.equal(deploymentCalls(out.calls).length, 1);
  }
});

for (let bits = 1; bits < 7; bits += 1) {
  test(`mixed policy ${bits.toString(2).padStart(3, '0')} refuses with valid signature`, async () => {
    const contract = syntheticContract();
    ['worker', 'data', 'record'].forEach((key, i) => { if (bits & (1 << i)) contract[key] = null; });
    refused(await run(treeFor(contract)), /release contract is malformed/);
  });
}
for (const policy of ['static', 'object']) {
  for (const key of ['worker', 'data', 'record']) {
    for (const [label, value] of [['missing', undefined], ['false', false], ['array', []], ['empty', {}], ['string', 'null']]) {
      test(`${policy} policy ${key} ${label} refuses`, async () => {
        const contract = policy === 'static' ? staticContract() : syntheticContract();
        contract[key] = value;
        refused(await run(treeFor(contract)), /release contract is malformed/);
      });
    }
  }
}

// Exercise the complete layout schema even when Function metadata is unused.
// The signed bytes are swapped into an otherwise valid layout so malformed
// paths cannot fail only because the fixture could not be constructed.
const badLayouts = [];
function bad(label, change) { badLayouts.push([label, change]); }
for (const key of ['root_name', 'assets', 'identity', 'build', 'function']) {
  bad(`missing ${key}`, (l) => { delete l[key]; });
}
bad('extra layout key', (l) => { l.extra = true; });
for (const [key, fields] of [['identity', ['path', 'version']], ['build', ['path', 'time']], ['function', ['directory', 'worker', 'routes', 'data', 'record']]]) {
  for (const value of [null, false, [], 'x', {}]) bad(`${key} shape ${JSON.stringify(value)}`, (l) => { l[key] = value; });
  bad(`${key} extra`, (l) => { l[key].extra = 'x'; });
  for (const field of fields) bad(`${key} missing ${field}`, (l) => { delete l[key][field]; });
}
const invalidPaths = ['', '.', '..', '/absolute', 'a//b', 'a/./b', 'a/../b', 'a\\b', '.env', '.env.test', '.git/x', '.ssh/x', '.aws/x', '.gnupg/x', 'node_modules/x', 'memory/x', 'AGENTS.md', 'CLAUDE.md', 'zArchive/x', 'id_rsa', 'secret.pem', 'a'.repeat(65), Array(9).fill('a').join('/'), Array(5).fill('a'.repeat(64)).join('/'), 'unicode-é', false, []];
for (const value of invalidPaths) {
  for (const [role, field] of [['identity', 'path'], ['build', 'path'], ['function', 'directory']]) {
    bad(`${role}.${field} ${JSON.stringify(value)}`, (l) => { l[role][field] = value; });
  }
  bad(`assets ${JSON.stringify(value)}`, (l) => { l.assets = value; });
}
for (const value of ['a/b', '.hidden', '', 'secret.key', 'a'.repeat(65), false, []]) {
  bad(`root_name ${JSON.stringify(value)}`, (l) => { l.root_name = value; });
  for (const role of ['worker', 'routes', 'data', 'record']) bad(`Function ${role} ${JSON.stringify(value)}`, (l) => { l.function[role] = value; });
}
for (const [role, key] of [['identity', 'version'], ['build', 'time']]) {
  for (const value of ['', '__proto__', 'constructor', 'prototype', 'a'.repeat(65), 'a-b', null, []]) {
    bad(`${role}.${key} ${JSON.stringify(value)}`, (l) => { l[role][key] = value; });
  }
}
for (const [a, b] of [['assets', 'function'], ['assets', 'identity'], ['assets', 'build'], ['function', 'identity'], ['function', 'build'], ['identity', 'build']]) {
  for (const mode of ['equal', 'inside', 'parent', 'case']) {
    bad(`${a}/${b} overlap ${mode}`, (l) => {
      const get = (r) => r === 'assets' ? l.assets : r === 'function' ? l.function.directory : l[r].path;
      const value = mode === 'inside' ? `${get(a)}/child` : mode === 'parent' ? get(a).split('/')[0] : mode === 'case' ? get(a).toUpperCase() : get(a);
      if (b === 'function') l.function.directory = value; else l[b].path = value;
    });
  }
}
for (const a of ['worker', 'routes', 'data', 'record']) {
  for (const b of ['worker', 'routes', 'data', 'record']) {
    if (a !== b) bad(`duplicate ${a}/${b}`, (l) => { l.function[b] = l.function[a].toUpperCase(); });
  }
}
for (const [label, change] of badLayouts) {
  test(`static unused layout validates: ${label}`, async () => {
    const tree = treeFor();
    const contract = staticContract();
    change(contract.layout);
    replaceContract(tree, contract);
    refused(await run(tree), /release contract is malformed/);
  });
}

test('static policy accepts the valid path/field bounds including unused Function layout', async () => {
  const contract = staticContract();
  contract.layout.function.directory = Array(8).fill('edge').join('/');
  contract.layout.function.worker = 'w'.repeat(64);
  contract.layout.build.time = 't'.repeat(64);
  const out = await run(treeFor(contract));
  assert.equal(out.result.deployment?.id, 'dep-synthetic', JSON.stringify(out.result));
  assert.equal(out.result.function, null);
  assert.equal(out.reads.length, 2);
});

for (const kind of ['empty directory', 'unreadable directory', 'file', 'fifo', 'link', 'dangling link', 'populated self-consistent Function']) {
  test(`static policy forbids ${kind} before contents, publisher and provider reads`, async () => {
    const tree = treeFor();
    let target;
    if (kind === 'empty directory' || kind === 'unreadable directory') {
      mkdirSync(tree.fnDir);
      if (kind === 'unreadable directory') chmodSync(tree.fnDir, 0);
    } else if (kind === 'file') writeFileSync(tree.fnDir, 'not a directory');
    else if (kind === 'fifo') execFileSync('mkfifo', [tree.fnDir]);
    else if (kind === 'populated self-consistent Function') {
      const object = treeFor(syntheticContract(), { fn: true, omitBuild: false });
      const { cpSync } = await import('node:fs');
      cpSync(object.fnDir, tree.fnDir, { recursive: true });
    } else {
      target = kind === 'link' ? tree.dist : join(tree.base, 'absent-target');
      symlinkSync(target, tree.fnDir, 'dir');
    }
    try { refused(await run(tree), /static-only release forbids the Function directory/); }
    finally { if (kind === 'unreadable directory') chmodSync(tree.fnDir, 0o700); }
  });
}

test('static policy refuses unreadable/non-directory or linked ancestors of the forbidden directory', async () => {
  for (const kind of ['file', 'link']) {
    const contract = staticContract();
    contract.layout.function.directory = 'reserved/edge';
    const tree = treeFor(contract);
    if (kind === 'file') writeFileSync(join(tree.root, 'reserved'), 'x');
    else symlinkSync(tree.dist, join(tree.root, 'reserved'), 'dir');
    refused(await run(tree), /static-only release forbids the Function directory/);
  }
});

test('policy binding: changing static approval to object policy with its old signature refuses', async () => {
  const tree = treeFor();
  replaceContract(tree, syntheticContract(), false);
  refused(await run(tree), /release signature is not from a trusted Pages publisher/);
});
test('policy binding: changing object approval to static policy with its old signature refuses', async () => {
  const tree = treeFor(syntheticContract());
  replaceContract(tree, staticContract(), false);
  refused(await run(tree), /release signature is not from a trusted Pages publisher/);
});

test('static policy binds exact release and identity and root', async () => {
  for (const opts of [{ identityVersion: '7.3.0' }, { identityVersion: 'v7.3.1' }, { rootName: 'other-root' }]) {
    refused(await run(treeFor(staticContract(), opts)), /release version mismatch|release root name does not match/);
  }
  const tree = treeFor();
  writeFileSync(join(tree.root, 'release-id.json'), '{"wrong":"7.3.1"}');
  refused(await run(tree), /release identity unreadable/);
});

test('static policy requires its own publisher catalog listing and reads every publisher separately', async () => {
  const copy = connectorCopy({ trust: trustJson({ 'fixture-pub': [PUB.key], 'second-pub': [SECOND.key] }) });
  copies.push(copy);
  const server = publisherServer({ 'fixture-pub': { identity: PUB }, 'second-pub': { identity: SECOND } });
  const out = await run(treeFor(), { copy, server });
  assert.equal(out.result.deployment?.id, 'dep-synthetic', JSON.stringify(out.result));
  assert.equal(out.reads.length, 4);
  const omitted = publisherServer({ 'fixture-pub': { identity: PUB, layouts: [{ root_name: 'other', assets: 'public' }] } });
  refused(await run(treeFor(), { server: omitted }), /release layout is not in its publisher's layout catalog/, 2);
  const unavailable = publisherServer({ 'fixture-pub': { identity: PUB } });
  const refusedOut = await run(treeFor(), { copy, server: unavailable });
  assert.equal(refusedOut.result.status, 'vendor_error');
  assert.equal(refusedOut.calls.length, 0);
  assert.equal(refusedOut.reads.length, 3);
});

for (const changed of ['asset', 'contract', 'signature', 'identity', 'Function added']) {
  test(`static changed-file refusal before deployment: ${changed}`, async () => {
    const tree = treeFor();
    const out = await run(tree, { onCheck() {
      if (changed === 'asset') writeFileSync(join(tree.dist, 'index.html'), '<p>changed</p>');
      if (changed === 'contract') writeFileSync(tree.contractPath, Buffer.concat([tree.contractBytes, Buffer.from(' ')]));
      if (changed === 'signature') writeFileSync(tree.signaturePath, Buffer.alloc(64));
      if (changed === 'identity') writeFileSync(join(tree.root, 'release-id.json'), '{"releaseTag":"changed"}');
      if (changed === 'Function added') mkdirSync(tree.fnDir);
    } });
    assert.equal(out.result.status, 'invalid_arguments', JSON.stringify(out.result));
    assert.match(out.result.reason, /file changed during deploy|static-only release forbids/);
    assert.equal(deploymentCalls(out.calls).length, 0);
    assert.ok(out.calls.length > 0, 'mutation happens inside fake provider');
    assert.equal(out.reads.length, 2);
  });
}

test('shipping trust refuses static fixture signatures before publisher and provider reads', async () => {
  const copy = connectorCopy({ trust: readFileSync(new URL('../pages-trust.json', import.meta.url), 'utf8') });
  copies.push(copy);
  refused(await run(treeFor(), { copy }), /release signature is not from a trusted Pages publisher/);
});


test('static policy never opens the unused build record even when it is a FIFO', async () => {
  const tree = treeFor();
  const build = join(tree.root, staticContract().layout.build.path);
  mkdirSync(dirname(build), { recursive: true });
  execFileSync('mkfifo', [build]);
  const out = await run(tree);
  assert.equal(out.result.deployment?.id, 'dep-synthetic', JSON.stringify(out.result));
  assert.equal(out.result.function, null);
  assert.equal(out.reads.length, 2);
  assert.equal(deploymentCalls(out.calls).length, 1);
});

test('static policy retains absolute/normal input paths, exact assets and signature location screens', async () => {
  const tree = treeFor();
  const inside = join(tree.dist, 'approval.sig');
  writeFileSync(inside, readFileSync(tree.signaturePath));
  for (const [input, reason] of [
    [{ dir: 'relative/public' }, /path must be absolute/],
    [{ dir: `${tree.root}/out/../out/public` }, /path is not in normal form/],
    [{ dir: join(tree.root, 'out') }, /dir is not the signed assets directory/],
    [{ release_contract: 'relative.json' }, /path must be absolute/],
    [{ release_signature: `${tree.root}/./release.contract.sig` }, /path is not in normal form/],
    [{ release_signature: inside }, /release signature inside the payload/],
  ]) refused(await run(tree, { input: tree.input(input) }), reason);
});

test('static policy retains declared-root and working marker refusals', async () => {
  for (const location of ['root', 'assets']) {
    const tree = treeFor();
    writeFileSync(join(location === 'root' ? tree.root : tree.dist, 'AGENTS.md'), '---\nroot: synthetic\n---\n');
    refused(await run(tree), /working folder:/);
  }
});

test('static policy retains raw Function source refusal in assets and asset upload budget', async () => {
  for (const [assets, reason] of [
    [{ 'index.html': 'x', '_worker.js': 'export default {}' }, /static release output only/],
    [{ 'index.html': 'x', 'functions/api.js': 'export {}' }, /static release output only/],
    [{ 'index.html': 'x', 'large.dat': Buffer.alloc(3 * 1024 * 1024, 0x41) }, /file over the 3 MiB upload request limit/],
  ]) refused(await run(treeFor(staticContract(), { assets })), reason);
});

test('static policy refuses identity hardlinks in assets and skips synthetic credential-shaped assets', async () => {
  const linked = treeFor();
  linkSync(join(linked.root, 'release-id.json'), join(linked.dist, 'copy.json'));
  refused(await run(linked), /release file in dir: copy.json/);
  const skipped = treeFor();
  writeFileSync(join(skipped.dist, 'example.key'), 'synthetic non-secret text');
  const out = await run(skipped);
  assert.equal(out.result.deployment?.id, 'dep-synthetic', JSON.stringify(out.result));
  assert.equal(out.result.manifest.includes('/example.key'), false);
  assert.ok(out.result.skipped.some((item) => item.file === 'example.key' && item.reason === 'credential'));
  assert.equal(out.reads.length, 2);
});

test('static policy retains credential-directory refusal in an isolated home', async () => {
  const home = realpathSync(homedir());
  assert.match(home, /wiser-suite-home-/);
  const config = process.platform === 'darwin' ? join(home, 'Library', 'Application Support', 'wiser')
    : process.platform === 'win32' ? join(home, 'AppData', 'Roaming', 'wiser') : join(home, '.config', 'wiser');
  const tree = treeFor();
  const root = join(config, 'holder', 'bundle-root');
  mkdirSync(root, { recursive: true });
  cpSync(tree.root, root, { recursive: true });
  refused(await run(tree, { input: tree.input({ dir: join(root, 'out', 'public'),
    release_contract: join(root, 'release.contract.json'), release_signature: join(root, 'release.contract.sig') }) }), /credential directory/);
});
