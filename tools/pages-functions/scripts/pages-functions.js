#!/usr/bin/env node
/**
 * pages-functions: compile a site's functions folder into the three files
 * Cloudflare Pages takes. Node built-ins, this tool's own files, and tools/lib/.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { installAuthorised, parsedInstallFlag, writeConsent } from '../../lib/consent.js';

const HERE = fileURLToPath(new URL(import.meta.url));
const TOOL_DIR = dirname(dirname(HERE));
const TOOL_VERSION = '0.1.0';
const WRANGLER_SPEC = '4.136.3';
const VALUE_FLAGS = new Set(['--functions', '--assets', '--out']);

const USAGE = `pages-functions: compile a site's functions folder into the three files Cloudflare Pages takes

Usage:
  node scripts/pages-functions.js help
  node scripts/pages-functions.js build --functions <abs dir> --assets <abs dir> --out <abs dir> [--install]

Commands:
  build            Compile functions/ with Wrangler, offline, with no Cloudflare sign-in
  help             Print this message

Options:
  --functions <dir>  The functions folder. Absolute path of an existing directory
  --assets <dir>     The static assets the functions sit beside. Absolute path of an existing directory
  --out <dir>        Where the three build files and build.json are written. Absolute path.
                     Must not exist, or must be an empty directory, and must not resolve
                     inside this tool, inside --functions, or inside --assets
  --install          Authorise the first install in this copy of the plugin.
                     Without it, a missing Wrangler install reports what it would fetch
                     and stops. WISER_ALLOW_INSTALL=1 does the same for an unattended run
  --help, -h         Print this message

The install is about 210 MB. Wrangler loads its workerd runtime even to build.
Success prints one JSON object to stdout. Errors go to stderr with exit 1.
`;

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function canonicalize(input) {
  let head = resolve(String(input));
  const below = [];
  for (;;) {
    try {
      return below.length === 0 ? realpathSync(head) : join(realpathSync(head), ...[...below].reverse());
    } catch {
      const parent = dirname(head);
      if (parent === head) return null;
      below.push(basename(head));
      head = parent;
    }
  }
}

function isInside(child, parent) {
  const prefix = parent.endsWith(sep) ? parent : parent + sep;
  return child === parent || child.startsWith(prefix);
}

function printHelp() {
  process.stdout.write(USAGE);
  process.exit(0);
}

function nodeMajor() {
  const major = Number(String(process.versions.node).split('.')[0]);
  return Number.isFinite(major) ? major : 0;
}

function parseBuild(argv) {
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') printHelp();
    if (token === '--install') {
      flags.install = true;
      continue;
    }
    if (VALUE_FLAGS.has(token)) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('-')) fail(`missing value for ${token}`);
      flags[token.slice(2)] = value;
      index += 1;
      continue;
    }
    if (token.startsWith('-')) fail(`unknown flag: ${token}`);
    fail(`unknown argument: ${token}`);
  }
  return flags;
}

function requireAbsolute(name, value) {
  if (!isAbsolute(value)) fail(`path must be absolute: --${name}`);
  const canonical = canonicalize(value);
  if (!canonical) fail(`unresolvable path: --${name}`);
  return canonical;
}

function existingDirectory(name, canonical) {
  let stats;
  try {
    stats = statSync(canonical);
  } catch {
    fail(`not found: --${name}`);
  }
  if (!stats.isDirectory()) fail(`not a directory: --${name}`);
}

function screenOut(out, functionsDir, assetsDir, toolDir) {
  if (existsSync(out)) {
    let stats;
    try {
      stats = statSync(out);
    } catch {
      fail('not found: --out');
    }
    if (!stats.isDirectory()) fail('--out is not a directory');
    const entries = readdirSync(out);
    if (entries.length > 0) fail('--out is not empty');
  }
  if (isInside(out, toolDir)) fail('--out resolves inside this tool');
  if (isInside(out, functionsDir)) fail('--out resolves inside --functions');
  if (isInside(out, assetsDir)) fail('--out resolves inside --assets');
  if (isInside(functionsDir, out)) fail('--functions resolves inside --out');
  if (isInside(assetsDir, out)) fail('--assets resolves inside --out');
}

function consentStop() {
  fail(
    `Error: this tool is not installed yet and this copy of the plugin has not authorised an install. The plugin asks once, on the first install in this copy. Installing fetches wrangler ${WRANGLER_SPEC} and its dependencies from registry.npmjs.org into ${TOOL_DIR}, about 210 MB, and npm writes its own cache outside this plugin. tools/AGENTS.md lists every write an install makes. Re-run the same command with --install to authorise it, or set WISER_ALLOW_INSTALL=1 for an unattended run. Nothing is read from stdin, so this is the only way to answer.`
  );
}

function ensureWrangler(installFlag) {
  const pkg = join(TOOL_DIR, 'node_modules', 'wrangler', 'package.json');
  if (existsSync(pkg)) return;
  if (!installAuthorised(HERE, installFlag === true)) consentStop();
  writeConsent(HERE, 'pages-functions', installFlag === true);
  const npm = spawnSync('npm', ['ci'], {
    cwd: TOOL_DIR,
    encoding: 'utf8',
  });
  if (npm.status !== 0 || !existsSync(pkg)) {
    const detail = `${npm.stderr || ''}${npm.stdout || ''}`.trim();
    fail(`npm ci exited ${npm.status ?? 'null'}${detail ? `\n${detail}` : ''}`);
  }
}

function walkSources(root) {
  const found = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      const path = relative(root, full).split(sep).join('/');
      const sha256 = createHash('sha256').update(readFileSync(full)).digest('hex');
      found.push({ path, sha256 });
    }
  }
  found.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return found;
}

function wranglerEnv(tmp) {
  const home = join(tmp, 'home');
  const xdg = join(tmp, 'xdg');
  const logs = join(tmp, 'logs');
  mkdirSync(home);
  mkdirSync(xdg);
  mkdirSync(logs);
  // WRANGLER_HIDE_BANNER=true skips the banner, which is the success-path caller
  // of the npm update check. update-check itself has no off switch.
  const env = {
    PATH: process.env.PATH || '',
    HOME: home,
    XDG_CONFIG_HOME: xdg,
    WRANGLER_LOG_PATH: logs,
    WRANGLER_SEND_METRICS: 'false',
    WRANGLER_SEND_ERROR_REPORTS: 'false',
    WRANGLER_HIDE_BANNER: 'true',
    NO_COLOR: '1',
    CI: '1',
  };
  if (process.env.TMPDIR) env.TMPDIR = process.env.TMPDIR;
  return env;
}

function compile(functionsDir, assetsDir) {
  const tmp = mkdtempSync(join(tmpdir(), 'wiser-pages-functions-'));
  let failed = null;
  let produced = null;
  try {
    writeFileSync(join(tmp, 'package.json'), '{}\n');
    const compiled = join(tmp, 'out');
    mkdirSync(compiled);
    const wranglerBin = join(TOOL_DIR, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
    const result = spawnSync(process.execPath, [
      wranglerBin,
      'pages', 'functions', 'build',
      functionsDir,
      '--outfile', join(compiled, '_worker.bundle'),
      '--output-config-path', join(compiled, 'functions-filepath-routing-config.json'),
      '--output-routes-path', join(compiled, '_routes.json'),
      '--build-output-directory', assetsDir,
    ], {
      cwd: tmp,
      env: wranglerEnv(tmp),
      encoding: 'utf8',
    });
    if (result.error || result.status !== 0) {
      const lines = `${result.stderr || ''}\n${result.stdout || ''}`.split('\n').map((line) => line.trimEnd()).filter(Boolean);
      failed = [`wrangler exited ${result.status ?? 'null'}`, ...lines].join('\n');
    } else {
      produced = {
        bundle: readFileSync(join(compiled, '_worker.bundle')),
        routes: readFileSync(join(compiled, '_routes.json')),
        routing: readFileSync(join(compiled, 'functions-filepath-routing-config.json')),
      };
    }
  } catch (err) {
    failed = `wrangler exited null\n${err && err.message ? err.message : 'build failed'}`;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  if (failed) fail(failed);
  return produced;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === 'help' || argv[0] === '--help' || argv[0] === '-h') printHelp();
  if (argv[0] !== 'build') fail(`unknown command: ${argv[0]}`);
  const install = parsedInstallFlag(argv, VALUE_FLAGS);
  const flags = parseBuild(argv.slice(1));
  if (nodeMajor() < 22) fail('Node.js 22 or newer is required');
  for (const name of ['functions', 'assets', 'out']) {
    if (typeof flags[name] !== 'string') fail(`missing --${name}`);
  }
  const functionsDir = requireAbsolute('functions', flags.functions);
  const assetsDir = requireAbsolute('assets', flags.assets);
  const out = requireAbsolute('out', flags.out);
  existingDirectory('functions', functionsDir);
  existingDirectory('assets', assetsDir);
  let toolDir;
  try {
    toolDir = realpathSync(TOOL_DIR);
  } catch {
    fail('unresolvable path: tool directory');
  }
  screenOut(out, functionsDir, assetsDir, toolDir);
  ensureWrangler(install);
  const produced = compile(functionsDir, assetsDir);
  if (!existsSync(out)) mkdirSync(out, { recursive: true });
  const files = [
    ['_worker.bundle', produced.bundle],
    ['_routes.json', produced.routes],
    ['functions-filepath-routing-config.json', produced.routing],
  ];
  for (const [name, bytes] of files) writeFileSync(join(out, name), bytes);
  const routes = JSON.parse(produced.routes.toString('utf8'));
  const wrangler = JSON.parse(readFileSync(join(TOOL_DIR, 'node_modules', 'wrangler', 'package.json'), 'utf8')).version;
  const sources = walkSources(functionsDir);
  const build = {
    tool: 'pages-functions',
    tool_version: TOOL_VERSION,
    wrangler,
    functions: functionsDir,
    assets: assetsDir,
    sources,
    built_at: new Date().toISOString(),
  };
  const buildBytes = Buffer.from(`${JSON.stringify(build, null, 2)}\n`, 'utf8');
  writeFileSync(join(out, 'build.json'), buildBytes);
  const written = [
    ...files.map(([name, bytes]) => ({ name, bytes: bytes.length })),
    { name: 'build.json', bytes: buildBytes.length },
  ];
  process.stdout.write(`${JSON.stringify({
    ok: true,
    out,
    files: written,
    routes: {
      include: Array.isArray(routes.include) ? routes.include : [],
      exclude: Array.isArray(routes.exclude) ? routes.exclude : [],
    },
    wrangler,
    sources: sources.length,
  })}\n`);
}

main();
