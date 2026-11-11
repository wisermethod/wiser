// Test-only archives. Fixture locks authenticate these locally packed bytes;
// production locks and the developer's caches are never changed.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { ROOT } from './one-file.mjs';

function archivePath(cache, integrity) {
  const [algorithm, digest] = integrity.split('-');
  const hex = Buffer.from(digest, 'base64').toString('hex');
  return join(cache, '_cacache/content-v2', algorithm, hex.slice(0, 2), hex.slice(2, 4), hex.slice(4));
}

export function packInstalledPackage(packageDir, cache) {
  const scratch = mkdtempSync(join(tmpdir(), 'wiser-test-package-'));
  try {
    cpSync(packageDir, join(scratch, 'package'), { recursive: true });
    const archive = join(scratch, 'package.tgz');
    execFileSync('tar', ['-czf', archive, '-C', scratch, 'package'], { stdio: 'pipe', env: { ...process.env, COPYFILE_DISABLE: '1' } });
    const bytes = readFileSync(archive);
    const integrity = 'sha512-' + createHash('sha512').update(bytes).digest('base64');
    const destination = archivePath(cache, integrity);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, bytes);
    return integrity;
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}

export function installedRequirement(tool, paths, root = ROOT) {
  for (const path of paths) {
    if (!existsSync(join(root, 'tools', tool, path, 'package.json')))
      return `Installed ${tool} inputs are missing; run npm ci --prefix ${JSON.stringify('tools/' + tool)}`;
  }
}

export function installFixturePackages(root, tool, cache, paths, sourceRoot = ROOT) {
  const source = join(sourceRoot, 'tools', tool), target = join(root, 'tools', tool);
  const lock = JSON.parse(readFileSync(join(target, 'package-lock.json')));
  paths ??= Object.keys(lock.packages).filter(path => path.startsWith('node_modules/'));
  for (const path of paths) {
    const destination = join(target, path);
    cpSync(join(source, path), destination, { recursive: true });
    lock.packages[path].integrity = packInstalledPackage(destination, cache);
  }
  writeFileSync(join(target, 'package-lock.json'), JSON.stringify(lock, null, 2) + '\n');
}

// npm ci in the tools cannot supply the build-only compiler. Check that explicit
// prerequisite and copy only its authenticated archives into the private cache.
// If neither documented cache holds them, callers skip with this one command.
export function seedCompilerCache(cache) {
  const lock = JSON.parse(readFileSync(new URL('./compiler-package-lock.json', import.meta.url)));
  const platform = Object.entries(lock.packages).find(([path, pkg]) => path.startsWith('node_modules/@esbuild/') && pkg.os.includes(process.platform) && pkg.cpu.includes(process.arch));
  if (!platform) return `No locked esbuild binary supports ${process.platform}/${process.arch}`;
  const packages = [['node_modules/esbuild', lock.packages['node_modules/esbuild']], platform];
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const defaultCache = execFileSync(npm, ['config', 'get', 'cache'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const caches = [defaultCache, join(homedir(), '.cache/wiser-connector-launch/npm')];
  for (const [, pkg] of packages) {
    let bytes;
    for (const candidate of caches) {
      try {
        const found = readFileSync(archivePath(candidate, pkg.integrity));
        if ('sha512-' + createHash('sha512').update(found).digest('base64') === pkg.integrity) { bytes = found; break; }
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    if (!bytes) return 'Pinned compiler archives are missing; run npm cache add ' + packages.map(([path, row]) => path.slice('node_modules/'.length) + '@' + row.version).join(' ') + ' --cache "$HOME/.cache/wiser-connector-launch/npm"';
    const destination = archivePath(cache, pkg.integrity);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, bytes);
  }
}
