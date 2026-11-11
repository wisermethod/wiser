#!/usr/bin/env node
// Developer-only refresh. Member commands never install or invoke this builder.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from '../one-file.js';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const SPECS = {
  render: { name: 'mermaid', version: '10.9.6', files: { 'dist/mermaid.min.js': 'mermaid.min.js' }, notices: [{
    input: 'build/mermaid-10.9.6-LICENSE.txt', path: 'LICENSE',
    source: 'https://raw.githubusercontent.com/mermaid-js/mermaid/v10.9.6/LICENSE',
    bytes: 1089, sha256: 'ec9fb67dcb25eccc416ed56e1aab819222c805a2a4bfe4cb19e7556bf2ffde80'
  }] },
  'deck-export': { name: 'reveal.js', version: '5.2.1', files: Object.fromEntries([
    'LICENSE', 'dist/reveal.js', 'dist/reset.css', 'dist/reveal.css',
    'plugin/highlight/highlight.js', 'plugin/highlight/monokai.css', 'plugin/notes/notes.js'
  ].map(name => [name, name])), trees: ['dist/theme'], notices: [{
    input: 'build/highlightjs-11.9.0-LICENSE.txt', path: 'plugin/highlight/LICENSE',
    source: 'https://raw.githubusercontent.com/highlightjs/highlight.js/11.9.0/LICENSE',
    bytes: 1514, sha256: '6c081431591d9df696c82dc598fe1423765b8a299b200ed00b281afd0f64c490'
  }, {
    input: 'build/league-gothic-OFL.md', path: 'dist/theme/fonts/league-gothic/OFL.md',
    source: 'https://raw.githubusercontent.com/theleagueof/league-gothic/master/OFL.md',
    bytes: 4546, sha256: '6fa7527b6f9894e0dd8d5ae0050b51d37de15bcf7e6269d8dd690eb9df59aa40'
  }] }
};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function walk(folder, prefix = '', directories = false) {
  return readdirSync(folder, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name, 'en')).flatMap(item => {
    const name = prefix + item.name;
    if (item.isSymbolicLink()) throw new Error(`Refusing linked build input: ${name}`);
    return item.isDirectory() ? [...(directories ? [name + '/'] : []), ...walk(join(folder, item.name), name + '/', directories)] : [name];
  });
}

// npm ci keeps each downloaded archive in its content-addressed cache. Verify
// that archive's locked digest, then compare the entire installed package to it.
// No registry fallback is permitted; an absent archive calls for npm ci.
function verifyInstalled(tool, dir, pkgDir, locked) {
  const repair = `${tool}: installed package differs from lockfile integrity; run npm ci in tools/${tool}`;
  const match = /^(sha512|sha384|sha256|sha1)-([A-Za-z0-9+/]+={0,2})$/.exec(locked.integrity || '');
  if (!match) throw new Error(`${tool}: unsupported or missing lockfile integrity`);
  const [algorithm, digest] = match.slice(1), hex = Buffer.from(digest, 'base64').toString('hex');
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const cache = execFileSync(npm, ['config', 'get', 'cache'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  const archive = join(cache, '_cacache', 'content-v2', algorithm, hex.slice(0,2), hex.slice(2,4), hex.slice(4));
  let bytes;
  try { bytes = readFileSync(archive); }
  catch { throw new Error(`${tool}: locked package archive is absent from npm cache; run npm ci in tools/${tool}`); }
  if (createHash(algorithm).update(bytes).digest('base64') !== digest) throw new Error(repair);
  const scratch = mkdtempSync(join(tmpdir(), 'wiser-locked-package-'));
  try {
    // Only the already-authenticated package archive is extracted.
    const authenticated = join(scratch, 'package.tgz');
    writeFileSync(authenticated, bytes);
    execFileSync('tar', ['-xzf', authenticated, '-C', scratch], { stdio: ['ignore', 'ignore', 'pipe'] });
    const clean = join(scratch, 'package'), expected = walk(clean), actual = walk(pkgDir);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(repair);
    for (const path of expected) if (!readFileSync(join(clean,path)).equals(readFileSync(join(pkgDir,path)))) throw new Error(`${repair}: ${path}`);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}

export function copiedAssets(tool, { root = ROOT } = {}) {
  const spec = SPECS[tool];
  if (!spec) throw new Error(`Unknown tool: ${tool}`);
  const dir = join(root, 'tools', tool), pkgDir = join(dir, 'node_modules', spec.name);
  const lockBytes = readFileSync(join(dir, 'package-lock.json'));
  const locked = JSON.parse(lockBytes).packages[`node_modules/${spec.name}`];
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json')));
  if (locked?.version !== spec.version || manifest.dependencies?.[spec.name] !== spec.version)
    throw new Error(`${tool}: manifest and lockfile must pin ${spec.name} ${spec.version}`);
  let pkg;
  try { pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'))); }
  catch { throw new Error(`${tool}: missing ${spec.name}; run npm ci in tools/${tool} before refreshing copies`); }
  if (pkg.version !== spec.version) throw new Error(`${tool}: installed ${spec.name} ${pkg.version} differs from pinned ${spec.version}; run npm ci in tools/${tool}`);
  verifyInstalled(tool, dir, pkgDir, locked);
  const inputs = { ...spec.files };
  for (const tree of spec.trees || []) for (const path of walk(join(pkgDir, tree))) inputs[tree+'/'+path] = tree+'/'+path;
  const files = new Map();
  for (const [source, dest] of Object.entries(inputs)) files.set(`${spec.name}/${dest}`, readFileSync(join(pkgDir, source)));
  const legal = join(dir, 'build', 'THIRD-PARTY-NOTICES.txt');
  files.set(`${spec.name}/THIRD-PARTY-NOTICES.txt`, readFileSync(legal));
  // Upstream licence texts supplied separately from the npm archives are pinned
  // repository inputs. Refresh and check read them locally and never fetch them.
  const noticeSources = new Map();
  for (const notice of spec.notices) {
    const bytes = readFileSync(join(dir, notice.input));
    if (bytes.length !== notice.bytes || hash(bytes) !== notice.sha256)
      throw new Error(`${tool}: licence input ${notice.input} differs from its pinned bytes and SHA-256; restore the recorded upstream text`);
    const path = `${spec.name}/${notice.path}`;
    files.set(path, bytes);
    noticeSources.set(path, notice.source);
  }
  const rows = [...files].sort(([a],[b]) => a.localeCompare(b, 'en')).map(([path,bytes]) => ({
    path, bytes: bytes.length, sha256: hash(bytes),
    ...(noticeSources.has(path) ? { source: noticeSources.get(path) } : {})
  }));
  const record = {
    package: spec.name, version: spec.version, license: pkg.license,
    resolved: locked.resolved, integrity: locked.integrity,
    sourceLockSha256: hash(lockBytes), builderSha256: hash(readFileSync(fileURLToPath(import.meta.url))),
    bytes: rows.reduce((n,row) => n + row.bytes, 0), files: rows
  };
  files.set('manifest.json', Buffer.from(JSON.stringify(record, null, 2)+'\n'));
  return files;
}

export function refresh(tool, { root = ROOT, check = false } = {}) {
  const files = copiedAssets(tool, { root });
  const destination = join(root, 'tools', tool, 'vendor');
  const scratch = check ? mkdtempSync(join(tmpdir(), 'wiser-copy-check-')) : destination;
  const stale = [];
  try {
    for (const [path, bytes] of files) {
      const fresh = join(scratch, path); mkdirSync(dirname(fresh), { recursive: true }); writeFileSync(fresh, bytes);
      if (check && (!existsSync(join(destination,path)) || !readFileSync(join(destination,path)).equals(readFileSync(fresh)))) stale.push(path);
    }
    const directories = new Set();
    for (const path of files.keys()) {
      let parent = dirname(path);
      while (parent !== '.') { directories.add(parent + '/'); parent = dirname(parent); }
    }
    if (existsSync(destination)) for (const path of walk(destination, '', true)) {
      if (path.endsWith('/') ? !directories.has(path) : !files.has(path)) stale.push(path + (path.endsWith('/') ? ' (unexpected directory)' : ' (unexpected file)'));
    }
    if (stale.length) throw new Error(`${tool}: missing, stale or unexpected carried files: ${stale.join(', ')}. Refresh with node tools/lib/build/copy-assets.mjs ${tool}`);
    return { tool, status: check ? 'current' : 'copied', files: files.size, bytes: [...files.values()].reduce((n,b) => n+b.length,0) };
  } finally { if (check) rmSync(scratch, { recursive: true, force: true }); }
}
export function main(argv = process.argv.slice(2)) {
  if (argv[0] === 'help' || argv.includes('--help')) {
    console.log('Usage: node tools/lib/build/copy-assets.mjs [render|deck-export] [--check]\nDeveloper only: first run npm ci in the tool. Copies the pinned package browser files, licences and notices into vendor/. --check verifies the installed package against the lockfile-integrity archive in npm cache, then compares every carried byte, hash, file and directory name in temporary storage. No package is downloaded by this script.'); return;
  }
  const names = argv.filter(arg => arg !== '--check');
  if (names.length > 1 || names.some(name => !Object.hasOwn(SPECS,name)) || argv.filter(arg => arg === '--check').length > 1) throw new Error('Expected render, deck-export or --check. Run with --help for usage.');
  for (const name of names.length ? names : Object.keys(SPECS)) console.log(JSON.stringify(refresh(name, { check: argv.includes('--check') })));
}
if (isMain(import.meta.url)) { try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; } }
