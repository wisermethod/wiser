// The Pages trust file is read afresh, within a bound, on every Pages deploy
// action, so a module that once loaded a valid pages-trust.json does not keep
// trusting it after the file is deleted, corrupted, narrowed or replaced. Every
// case below reuses one loaded connector module (the same index.js and
// pages-release.js instances), so a cached trust would show up as a deploy.
//
// Every key is an in-memory FIXTURE identity; every trust file is written into a
// byte-identical connector copy in the default temporary directory, so the
// shipping pages-trust.json is never modified; every publisher download is a
// fake and no test reaches the network. A pass proves nothing about the
// production catalog or contract, which stay unsigned and unpublished.
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ALTERNATE_LAYOUT, SYNTHETIC_LAYOUT, blockNetwork, connectorCopy, deployProxy, deploymentCalls,
  fixtureIdentity, makeRelease, publisherServer, trustJson,
} from './pages-release-fixture.js';

const NETWORK = blockNetwork();
const SHIPPING_TRUST = fileURLToPath(new URL('../pages-trust.json', import.meta.url));
const SHIPPING_BYTES = readFileSync(SHIPPING_TRUST);
const ACCOUNT = '0123456789abcdef0123456789abcdef';
const PROJECT = 'reload-site';
// The bound the connector holds pages-trust.json to; one byte more is refused.
const TRUST_MAX_BYTES = 64 * 1024;

const PUB = fixtureIdentity('fixture-pub');
const ROTATED = fixtureIdentity('fixture-rotated');

const copies = [];
const scratches = [];
after(() => {
  for (const copy of copies) copy.cleanup();
  for (const dir of scratches) rmSync(dir, { recursive: true, force: true });
  assert.deepEqual(NETWORK, [], 'no test may reach the network through a default fetch');
  assert.ok(readFileSync(SHIPPING_TRUST).equals(SHIPPING_BYTES), 'the shipping pages-trust.json is unchanged');
});

function scratch() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'pages-trust-reload-')));
  scratches.push(dir);
  return dir;
}
function html(dir) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), '<p>reload fixture</p>\n');
  return dir;
}
function functionsBuild(base, assets) {
  const dir = join(base, 'functions-build');
  mkdirSync(dir, { recursive: true });
  const b = 'ReloadBoundary';
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

// One connector copy, loaded once, with the three Pages deploy routes ready:
// unrelated static output on the two foreign routes, and two signed releases
// (one by the first fixture key, one by the rotated key) on pages.deploy.
async function harness() {
  const copy = connectorCopy({ trust: trustJson({ 'fixture-pub': [PUB.key] }) });
  copies.push(copy);
  const trustPath = join(copy.dir, 'pages-trust.json');
  const mod = await copy.load();
  const base = scratch();
  const dir = html(join(base, 'plain', 'out'));
  const release = makeRelease({ identity: PUB });
  const rotatedRelease = makeRelease({ identity: ROTATED });
  scratches.push(release.base, rotatedRelease.base);
  const inputs = {
    deploy_static: { account_id: ACCOUNT, project_name: PROJECT, dir },
    deploy_with_functions: { account_id: ACCOUNT, project_name: PROJECT, dir, functions_build: functionsBuild(base, dir) },
    deploy: release.input(),
  };
  // The same loaded module every time: a cached trust would survive here.
  async function run(action, { signer = PUB, input = inputs[action] } = {}) {
    const again = await copy.load();
    assert.equal(again, mod, 'the connector module is the one loaded first');
    const server = publisherServer({ 'fixture-pub': { identity: signer, layouts: [SYNTHETIC_LAYOUT, ALTERNATE_LAYOUT] } });
    const calls = [];
    const proxy = deployProxy(calls);
    const ctx = {
      async proxy(request) { return proxy(request); },
      async fetchRelease(url, opts) { return server.fetchRelease(url, opts); },
    };
    const result = await mod.modules.pages[action](input, ctx);
    return { result, calls, fetched: server.urls() };
  }
  return { copy, trustPath, run, inputs, rotatedInput: rotatedRelease.input(), base };
}

const ACTIONS = ['deploy_static', 'deploy_with_functions', 'deploy'];

function deployed(out, label) {
  assert.equal(out.result.status, undefined, `${label}: ${JSON.stringify(out.result)}`);
  assert.equal(deploymentCalls(out.calls).length, 1, `${label}: one deployment`);
}
// A trust-state refusal: before any publisher fetch and any Cloudflare call.
function trustRefused(out, action, state, label) {
  assert.equal(out.result.status, 'invalid_arguments', `${label} ${action}: ${JSON.stringify(out.result)}`);
  if (action === 'deploy') {
    assert.equal(out.result.field, 'release_signature', `${label} ${action}`);
    assert.equal(out.result.reason, `pages-trust.json is ${state}; refusing every signed release`, `${label} ${action}`);
  } else {
    assert.equal(out.result.field, 'dir', `${label} ${action}`);
    assert.equal(out.result.reason, `pages-trust.json is ${state}; refusing every Pages deploy`, `${label} ${action}`);
  }
  assert.deepEqual(out.fetched, [], `${label} ${action}: publisher fetches`);
  assert.equal(out.calls.length, 0, `${label} ${action}: Cloudflare calls`);
}

async function allDeploy(run, label) {
  for (const action of ACTIONS) deployed(await run(action), `${label} ${action}`);
}
async function allRefused(run, state, label) {
  for (const action of ACTIONS) trustRefused(await run(action), action, state, label);
}

const posix = process.platform !== 'win32';

describe('Pages trust is read afresh on every deploy action', { concurrency: false }, () => {
  test('deleting pages-trust.json after a successful load refuses all three routes, and restoring it deploys again', async () => {
    const { trustPath, run } = await harness();
    await allDeploy(run, 'initial');
    const good = readFileSync(trustPath);
    unlinkSync(trustPath);
    await allRefused(run, 'missing', 'after deletion');
    writeFileSync(trustPath, good);
    await allDeploy(run, 'after restore');
  });

  test('corrupting pages-trust.json after a successful load refuses all three routes', async () => {
    const { trustPath, run } = await harness();
    await allDeploy(run, 'initial');
    const good = JSON.parse(readFileSync(trustPath, 'utf8'));
    const variants = {
      'truncated JSON': '{"format": 1, "purpose": ',
      'empty file': '',
      'not UTF-8': Buffer.from([0x7b, 0xff, 0x7d]),
      'an array': JSON.stringify([good]),
      'an extra top-level key': JSON.stringify({ ...good, cache: true }),
      'no publishers': JSON.stringify({ ...good, publishers: {} }),
      'an http catalog URL': JSON.stringify({
        ...good,
        publishers: { 'fixture-pub': { ...good.publishers['fixture-pub'], catalog: good.publishers['fixture-pub'].catalog.replace('https:', 'http:') } },
      }),
    };
    for (const [label, text] of Object.entries(variants)) {
      writeFileSync(trustPath, text);
      await allRefused(run, 'malformed', label);
    }
  });

  test('removing the trusted key after a successful load refuses every route before any Cloudflare call', async () => {
    const { trustPath, run } = await harness();
    await allDeploy(run, 'initial');
    // The fixture publisher now trusts only the rotated key: the first key is revoked.
    writeFileSync(trustPath, trustJson({ 'fixture-pub': [ROTATED.key] }));
    const signed = await run('deploy');
    assert.equal(signed.result.status, 'invalid_arguments', JSON.stringify(signed.result));
    assert.equal(signed.result.reason, 'release signature is not from a trusted Pages publisher');
    assert.deepEqual(signed.fetched, [], 'a revoked signer is refused before any publisher fetch');
    assert.equal(signed.calls.length, 0);
    for (const action of ['deploy_static', 'deploy_with_functions']) {
      // The catalog is still signed by the revoked key.
      const out = await run(action);
      assert.equal(out.result.status, 'invalid_arguments', `${action}: ${JSON.stringify(out.result)}`);
      assert.equal(out.result.reason, 'publisher layout catalog is not signed by its publisher: fixture-pub', action);
      assert.equal(out.calls.length, 0, `${action}: Cloudflare calls`);
    }
  });

  test('a fresh valid replacement is honoured on the next call: the rotated key deploys, the old one does not', async () => {
    const { trustPath, run, rotatedInput } = await harness();
    await allDeploy(run, 'initial');
    writeFileSync(trustPath, trustJson({ 'fixture-pub': [ROTATED.key] }));
    for (const action of ['deploy_static', 'deploy_with_functions']) {
      deployed(await run(action, { signer: ROTATED }), `rotated ${action}`);
    }
    deployed(await run('deploy', { signer: ROTATED, input: rotatedInput }), 'rotated deploy');
    const old = await run('deploy', { signer: ROTATED });
    assert.equal(old.result.reason, 'release signature is not from a trusted Pages publisher');
    assert.equal(old.calls.length, 0);
    // Both keys, then back to the first key alone.
    writeFileSync(trustPath, trustJson({ 'fixture-pub': [PUB.key, ROTATED.key] }));
    deployed(await run('deploy'), 'both keys: first signer');
    deployed(await run('deploy', { signer: ROTATED, input: rotatedInput }), 'both keys: rotated signer');
    writeFileSync(trustPath, trustJson({ 'fixture-pub': [PUB.key] }));
    await allDeploy(run, 'first key again');
    const rotatedOnce = await run('deploy', { signer: PUB, input: rotatedInput });
    assert.equal(rotatedOnce.result.reason, 'release signature is not from a trusted Pages publisher');
    assert.equal(rotatedOnce.calls.length, 0);
  });

  test('an oversized pages-trust.json is refused unparsed, even when it is otherwise valid JSON', async () => {
    const { trustPath, run } = await harness();
    await allDeploy(run, 'initial');
    const good = trustJson({ 'fixture-pub': [PUB.key] });
    // At the bound exactly, padded with JSON whitespace: still valid and read.
    writeFileSync(trustPath, good + ' '.repeat(TRUST_MAX_BYTES - Buffer.byteLength(good)));
    assert.equal(readFileSync(trustPath).length, TRUST_MAX_BYTES);
    await allDeploy(run, 'at the bound');
    // One byte over the bound.
    writeFileSync(trustPath, good + ' '.repeat(TRUST_MAX_BYTES - Buffer.byteLength(good) + 1));
    await allRefused(run, 'too large', 'one byte over');
    // Far over the bound.
    writeFileSync(trustPath, good + ' '.repeat(4 * 1024 * 1024));
    await allRefused(run, 'too large', 'four MiB over');
  });

  test('a pages-trust.json that is a symbolic link is refused, even to a valid trust file', { skip: !posix }, async () => {
    const { trustPath, run, base } = await harness();
    await allDeploy(run, 'initial');
    const elsewhere = join(base, 'linked-trust.json');
    writeFileSync(elsewhere, trustJson({ 'fixture-pub': [PUB.key] }));
    unlinkSync(trustPath);
    symlinkSync(elsewhere, trustPath);
    await allRefused(run, 'a symbolic link', 'link to a valid file');
    unlinkSync(trustPath);
    symlinkSync(join(base, 'no-such-trust.json'), trustPath);
    await allRefused(run, 'a symbolic link', 'dangling link');
  });

  test('a pages-trust.json that is a directory or a FIFO is refused without blocking', { skip: !posix, timeout: 20000 }, async () => {
    const { trustPath, run } = await harness();
    await allDeploy(run, 'initial');
    unlinkSync(trustPath);
    mkdirSync(trustPath);
    writeFileSync(join(trustPath, 'index.json'), trustJson({ 'fixture-pub': [PUB.key] }));
    await allRefused(run, 'not a regular file', 'directory');
    rmSync(trustPath, { recursive: true, force: true });
    // A FIFO with no writer: opening it for a blocking read would hang.
    execFileSync('mkfifo', [trustPath]);
    await allRefused(run, 'not a regular file', 'FIFO');
    unlinkSync(trustPath);
    writeFileSync(trustPath, trustJson({ 'fixture-pub': [PUB.key] }));
    await allDeploy(run, 'regular file again');
  });

  test('the first read of a fresh copy refuses an oversized or linked trust file too', { skip: !posix }, async () => {
    const good = trustJson({ 'fixture-pub': [PUB.key] });
    const big = connectorCopy({ trust: good + ' '.repeat(TRUST_MAX_BYTES) });
    const linked = connectorCopy({ trust: null });
    copies.push(big, linked);
    const elsewhere = join(scratch(), 'trust.json');
    writeFileSync(elsewhere, good);
    symlinkSync(elsewhere, join(linked.dir, 'pages-trust.json'));
    const dir = html(join(scratch(), 'plain', 'out'));
    for (const [copy, state] of [[big, 'too large'], [linked, 'a symbolic link']]) {
      const { modules } = await copy.load();
      const server = publisherServer({ 'fixture-pub': { identity: PUB, layouts: [SYNTHETIC_LAYOUT] } });
      const calls = [];
      const out = await modules.pages.deploy_static(
        { account_id: ACCOUNT, project_name: PROJECT, dir },
        { proxy: deployProxy(calls), fetchRelease: (url, opts) => server.fetchRelease(url, opts) },
      );
      assert.equal(out.reason, `pages-trust.json is ${state}; refusing every Pages deploy`, JSON.stringify(out));
      assert.deepEqual(server.urls(), []);
      assert.equal(calls.length, 0);
    }
  });
});
