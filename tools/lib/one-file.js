/** Package availability and one-file dispatch for data and future tools. */
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Defined only by the build. Source copies keep the existing install contract.
export function packagesBundled() {
  return typeof WISER_PACKAGES_BUNDLED !== 'undefined' && WISER_PACKAGES_BUNDLED === true;
}

export async function packagesAvailable(marker, loadPackages, external = []) {
  return (await packageAvailability(marker, loadPackages, external)).available;
}

async function packageAvailability(marker, loadPackages, external) {
  if (packagesBundled()) return { available: true };
  const unavailable = { available: false };
  if (!existsSync(marker)) return unavailable;
  // Actually load the command's imports, including their transitive files.
  // Resolution alone can return a URL for a missing file on newer Node versions.
  try {
    let dir = dirname(marker);
    while (dirname(dir) !== dir && basename(dir) !== 'node_modules') dir = dirname(dir);
    if (basename(dir) !== 'node_modules') return unavailable;
    dir = dirname(dir);
    const lock = JSON.parse(readFileSync(join(dir, 'package-lock.json')));
    const requested = relative(dir, dirname(marker)).split(sep).join('/');
    if (!lock.packages[requested]?.version) return unavailable;
    let incomplete = false;
    for (const [path, expected] of Object.entries(lock.packages)) {
      if (!path.startsWith('node_modules/') || external.includes(path.slice('node_modules/'.length))) continue;
      let installed;
      try { installed = JSON.parse(readFileSync(join(dir, path, 'package.json'))).version; }
      catch { incomplete = true; continue; }
      if (!expected.version || !installed) { incomplete = true; continue; }
      if (installed !== expected.version) return {
        available: false, mismatch: { package: path.slice('node_modules/'.length), installed, locked: expected.version }
      };
    }
    if (incomplete) return unavailable;
    await loadPackages(); return { available: true };
  }
  catch { return unavailable; }
}

export async function compiledEntry(marker, loadPackages, entryUrl, name, external = []) {
  const state = await packageAvailability(marker, loadPackages, external);
  if (state.available) return null;
  const url = pathToFileURL(resolve(dirname(realpathSync(fileURLToPath(entryUrl))), '..', 'dist', `${name}.mjs`));
  if (!existsSync(url)) return null;
  if (state.mismatch) {
    const { package: pkg, installed, locked } = state.mismatch;
    process.stderr.write(`Using compiled ${name}: ${pkg} installed version ${installed} differs from locked version ${locked}.\n`);
  }
  return url.href;
}

// One file can be spelled two ways that realpath leaves different: a Windows drive
// letter in either case, or a hard link. Device and inode say whether it is one file.
function sameFile(a, b) {
  if (process.platform === 'win32' && a.toLowerCase() === b.toLowerCase()) return true;
  const x = statSync(a, { bigint: true }), y = statSync(b, { bigint: true });
  return x.ino !== 0n && x.dev === y.dev && x.ino === y.ino;
}

// URL conversion handles spaces and Windows drive letters; realpath handles links.
export function isMain(url) {
  const file = fileURLToPath(url);
  try {
    if (!process.argv[1]) throw new Error('process.argv[1] is missing');
    const a = realpathSync(file), b = realpathSync(process.argv[1]);
    return a === b || sameFile(a, b);
  } catch (error) {
    if (process.argv[1] && resolve(file) === resolve(process.argv[1])) return true;
    const cause = String(error.message).replace(/[\r\n]+/g, ' ');
    process.stderr.write(`Cannot determine whether ${file} is the program: ${cause}. Run this file directly with node.\n`);
    process.exitCode = 1;
    return false;
  }
}
