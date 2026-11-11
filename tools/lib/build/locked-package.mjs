// Offline authentication of installed build inputs against npm's locked archive.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
export function verifyInstalled(tool, dir, pkgDir, locked) {
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

