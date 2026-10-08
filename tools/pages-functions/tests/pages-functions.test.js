import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../scripts/pages-functions.js', import.meta.url));
const TOOL = fileURLToPath(new URL('..', import.meta.url));
const CONSENT = fileURLToPath(new URL('../../lib/consent.js', import.meta.url));

function scratch() {
  return realpathSync(mkdtempSync(join(tmpdir(), 'pf-test-')));
}

function run(args, env = process.env) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', env });
}

function pair() {
  const root = scratch();
  const functionsDir = join(root, 'functions');
  const assets = join(root, 'assets');
  mkdirSync(functionsDir);
  mkdirSync(assets);
  return { root, functionsDir, assets };
}

test('help prints usage and does not need node_modules', () => {
  const result = run(['help']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /pages-functions/);
  assert.match(result.stdout, /--functions/);
  assert.match(result.stdout, /--install/);
  assert.equal(result.stderr, '');
  const dashed = run(['--help']);
  assert.equal(dashed.status, 0);
  assert.match(dashed.stdout, /--out/);
});

test('an unknown flag is refused by name', () => {
  const result = run(['build', '--nope']);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /unknown flag: --nope/);
});

test('a missing flag is refused by name', () => {
  const result = run(['build', '--functions', '/tmp/functions-only']);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /missing --assets/);
});

test('a relative path is refused', () => {
  const result = run(['build', '--functions', 'functions', '--assets', '/tmp/assets', '--out', '/tmp/out']);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /path must be absolute: --functions/);
});

test('--out inside the tool directory is refused', () => {
  const dirs = pair();
  const out = join(TOOL, 'not-created-out');
  try {
    const result = run(['build', '--functions', dirs.functionsDir, '--assets', dirs.assets, '--out', out]);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /--out resolves inside this tool/);
    assert.equal(existsSync(out), false);
  } finally {
    rmSync(dirs.root, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
  }
});

test('a non-empty --out is refused', () => {
  const dirs = pair();
  const out = join(dirs.root, 'out');
  mkdirSync(out);
  writeFileSync(join(out, 'already.txt'), 'x\n');
  try {
    const result = run(['build', '--functions', dirs.functionsDir, '--assets', dirs.assets, '--out', out]);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /--out is not empty/);
  } finally {
    rmSync(dirs.root, { recursive: true, force: true });
  }
});

test('--out inside --functions is refused', () => {
  const dirs = pair();
  const out = join(dirs.functionsDir, 'nested-out');
  try {
    const result = run(['build', '--functions', dirs.functionsDir, '--assets', dirs.assets, '--out', out]);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /--out resolves inside --functions/);
    assert.equal(existsSync(out), false);
  } finally {
    rmSync(dirs.root, { recursive: true, force: true });
  }
});

test('a missing install stops without reading or writing the real consent marker', () => {
  const plugin = scratch();
  const scriptDir = join(plugin, 'tools', 'pages-functions', 'scripts');
  mkdirSync(scriptDir, { recursive: true });
  mkdirSync(join(plugin, 'tools', 'lib'), { recursive: true });
  writeFileSync(join(plugin, 'tools', 'AGENTS.md'), '# tools\n');
  cpSync(SCRIPT, join(scriptDir, 'pages-functions.js'));
  cpSync(CONSENT, join(plugin, 'tools', 'lib', 'consent.js'));
  const functionsDir = join(plugin, 'work', 'functions');
  const assets = join(plugin, 'work', 'assets');
  const out = join(plugin, 'work', 'out');
  mkdirSync(functionsDir, { recursive: true });
  mkdirSync(assets);
  const env = { ...process.env };
  delete env.WISER_ALLOW_INSTALL;
  try {
    const result = spawnSync(process.execPath, [
      join(scriptDir, 'pages-functions.js'),
      'build',
      '--functions', functionsDir,
      '--assets', assets,
      '--out', out,
    ], { encoding: 'utf8', env });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /wrangler 4\.136\.3/);
    assert.match(result.stderr, /registry\.npmjs\.org/);
    assert.match(result.stderr, /210 MB/);
    assert.match(result.stderr, /dependencies/);
    assert.equal(existsSync(join(plugin, '.wiser-consent')), false);
    assert.equal(existsSync(out), false);
  } finally {
    rmSync(plugin, { recursive: true, force: true });
  }
});

const wranglerInstalled = existsSync(join(TOOL, 'node_modules', 'wrangler', 'package.json'));

test('builds two routes when wrangler is installed', { skip: wranglerInstalled ? false : 'wrangler is not installed' }, () => {
  const dirs = pair();
  mkdirSync(join(dirs.functionsDir, 'api'), { recursive: true });
  writeFileSync(join(dirs.functionsDir, 'api', 'hello.js'), 'export function onRequest() {\n  return new Response("hello");\n}\n');
  writeFileSync(join(dirs.functionsDir, 'api', 'other.js'), 'export function onRequest() {\n  return new Response("other");\n}\n');
  writeFileSync(join(dirs.assets, 'index.html'), '<!doctype html>\n');
  const out = join(dirs.root, 'out');
  try {
    const result = run(['build', '--functions', dirs.functionsDir, '--assets', dirs.assets, '--out', out]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    const summary = JSON.parse(result.stdout);
    assert.equal(summary.ok, true);
    assert.equal(summary.sources, 2);
    const names = summary.files.map((file) => file.name).sort();
    assert.deepEqual(names, ['_routes.json', '_worker.bundle', 'build.json', 'functions-filepath-routing-config.json']);
    for (const name of names) assert.equal(existsSync(join(out, name)), true, name);
    const routes = JSON.parse(readFileSync(join(out, '_routes.json'), 'utf8'));
    assert.equal(routes.version, 1);
    assert.equal(routes.include.length, 2);
    const bundle = readFileSync(join(out, '_worker.bundle'));
    const raw = bundle.toString('latin1');
    const first = raw.split('\r\n', 1)[0];
    assert.ok(first.startsWith('--'));
    const boundary = first.slice(2);
    const pieces = raw.slice(boundary.length + 4).split(`\r\n--${boundary}`);
    const metadata = pieces[0].split('\r\n\r\n')[1];
    const parsed = JSON.parse(metadata.trim());
    assert.equal(Array.isArray(parsed.bindings) ? parsed.bindings.length : 0, 0);
    const build = JSON.parse(readFileSync(join(out, 'build.json'), 'utf8'));
    assert.equal(build.tool, 'pages-functions');
    assert.equal(build.tool_version, '0.1.0');
    assert.equal(build.sources.length, 2);
  } finally {
    rmSync(dirs.root, { recursive: true, force: true });
  }
});
