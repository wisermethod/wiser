#!/usr/bin/env node
// Developer build only. Packages and the pinned compiler stay outside the plugin.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMain } from '../one-file.js';

export const TOOLS = ['data'];
export const ESBUILD_VERSION = '0.25.10';
export const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const CACHE = join(homedir(), '.cache', 'wiser-connector-launch');
let compilerPromise;

export function compiler() {
  return compilerPromise ??= (async () => {
    const lockBytes = readFileSync(new URL('./compiler-package-lock.json', import.meta.url));
    const lock = JSON.parse(lockBytes);
    if (lock.packages['node_modules/esbuild'].version !== ESBUILD_VERSION) throw new Error('Compiler lockfile does not pin esbuild ' + ESBUILD_VERSION);
    mkdirSync(CACHE, { recursive: true });
    // A fresh, process-owned install never trusts an old cache's version field.
    // npm's download cache is shared; the compiler tree is not.
    const compilerHome = mkdtempSync(join(CACHE, `esbuild-${ESBUILD_VERSION}-`));
    process.once('exit', () => rmSync(compilerHome, { recursive: true, force: true }));
    writeFileSync(join(compilerHome, 'package.json'), JSON.stringify({ private: true, ...lock.packages[''] }) + '\n');
    writeFileSync(join(compilerHome, 'package-lock.json'), lockBytes);
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const options = { cwd: compilerHome, stdio: ['ignore', 'ignore', 'inherit'] };
    // The carried lock pins esbuild and every optional platform package's integrity.
    // No install script or ESBUILD_BINARY_PATH override can replace that binary.
    execFileSync(npm, ['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--cache', join(CACHE, 'npm')], options);
    if (process.env.ESBUILD_BINARY_PATH) throw new Error('Unset ESBUILD_BINARY_PATH to use the locked compiler');
    return import(pathToFileURL(join(compilerHome, 'node_modules', 'esbuild', 'lib', 'main.js')).href);
  })();
}

function checkPackages(tool, root) {
  const lock = JSON.parse(readFileSync(join(root, 'tools', tool, 'package-lock.json')));
  const toolDir = join(root, 'tools', tool);
  function check(path) {
    const name = path.slice('node_modules/'.length);
    const expected = lock.packages[path];
    if (!expected?.version) throw new Error(`${tool}: ${name} has no version in the lockfile; run npm ci in tools/${tool}`);
    let actual;
    try { actual = JSON.parse(readFileSync(join(toolDir, path, 'package.json'))).version; }
    catch { throw new Error(`${tool}: ${name} is missing; run npm ci in tools/${tool}`); }
    if (actual !== expected.version) throw new Error(`${tool}: ${name} installed version ${actual} differs from lockfile version ${expected.version}; run npm ci in tools/${tool}`);
  }
  for (const path of Object.keys(lock.packages)) if (path.startsWith('node_modules/')) check(path);
  // Also reject any package reached by the graph but absent from the lock.
  // onLoad runs before esbuild reads and compiles each package input.
  return { name: 'locked-package-versions', setup(build) {
    const checked = new Set();
    build.onLoad({ filter: /[/\\]node_modules[/\\]/ }, ({ path }) => {
      let dir = dirname(path);
      while (!existsSync(join(dir, 'package.json'))) {
        const parent = dirname(dir);
        if (parent === dir) throw new Error(`${tool}: no package manifest for ${path}`);
        dir = parent;
      }
      if (!checked.has(dir)) { check(relative(toolDir, dir).split(sep).join('/')); checked.add(dir); }
    });
  } };
}

const posix = path => path.split(sep).join('/');
export function coreModules(tool, root = ROOT) {
  return readdirSync(join(root, 'tools', tool, 'scripts')).filter(name => name.endsWith('-core.js')).sort();
}
export const namespace = name => name.replace(/[^A-Za-z0-9_]/g, '_');

function notices(inputs, root) {
  const packages = new Map();
  for (const input of inputs) {
    if (!input.includes('node_modules/')) continue;
    let dir = dirname(resolve(root, input));
    while (!existsSync(join(dir, 'package.json'))) {
      const parent = dirname(dir);
      if (parent === dir) throw new Error(`No package manifest for ${input}`);
      dir = parent;
    }
    packages.set(posix(relative(root, dir)), dir);
  }
  let result = '# Third-party notices\n\nGenerated from the packages compiled into this tool. Licence files below are copied verbatim.\n';
  for (const [path, dir] of [...packages].sort(([a], [b]) => a.localeCompare(b))) {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json')));
    result += `\n## ${pkg.name} ${pkg.version}\n\nLicence: ${pkg.license}\n`;
    const files = [];
    function walk(folder) {
      for (const item of readdirSync(folder, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        if (item.name === 'node_modules') continue;
        const file = join(folder, item.name);
        if (item.isDirectory()) walk(file);
        else if (/^(licen[sc]e|copying)(\.|-|$)/i.test(item.name)) files.push(file);
      }
    }
    walk(dir);
    if (!files.length) throw new Error(`No licence file for ${pkg.name}`);
    for (const file of files) {
      result += `\n### ${path.slice(path.lastIndexOf('node_modules/') + 13)}/${posix(relative(dir, file))}\n\n`;
      const licence = readFileSync(file, 'utf8');
      result += licence + (licence.endsWith('\n') ? '' : '\n');
    }
  }
  return result;
}

export async function compile(tool, { root = ROOT } = {}) {
  if (!TOOLS.includes(tool)) throw new Error(`Unknown tool: ${tool}`);
  const lockedPackages = checkPackages(tool, root);
  const esbuild = await compiler();
  // Exports let the tool's existing unit suites exercise the very same compiled cores.
  const entry = `export * from './tools/${tool}/scripts/${tool}.js';\n` + coreModules(tool, root)
    .map(name => `export * as ${namespace(name)} from './tools/${tool}/scripts/${name}';`).join('\n');
  const result = await esbuild.build({
    absWorkingDir: root, stdin: { contents: entry, resolveDir: root, sourcefile: 'one-file-entry.mjs' },
    bundle: true, platform: 'node', format: 'esm', target: 'node18', write: false, metafile: true,
    define: { WISER_PACKAGES_BUNDLED: 'true' }, legalComments: 'inline', charset: 'utf8',
    plugins: [lockedPackages],
    banner: { js: 'import { createRequire as wiserCreateRequire } from "node:module";\nconst require = wiserCreateRequire(import.meta.url);' },
  });
  const inputs = Object.keys(result.metafile.inputs).filter(path => path !== 'one-file-entry.mjs').sort();
  // Include input bytes, so even a comment edit in the build graph is stale.
  const hash = createHash('sha256');
  for (const path of [...new Set([...inputs, 'tools/lib/build/one-file.mjs', 'tools/lib/build/compiler-package-lock.json', `tools/${tool}/package.json`, `tools/${tool}/package-lock.json`])].sort()) {
    hash.update(path + '\0').update(readFileSync(resolve(root, path))).update('\0');
  }
  return { code: result.outputFiles[0].text + `\n// Source SHA-256: ${hash.digest('hex')}\n`, notice: notices(inputs, root) };
}

export async function main(argv = process.argv.slice(2)) {
  if (argv.includes('--help') || argv[0] === 'help') {
    console.log(`Usage: node tools/lib/build/one-file.mjs [${TOOLS.join('|')}] [--check]\nNo tool name builds the declared list. --check rebuilds in system temporary storage and refuses missing or stale bundles and notices.\nBuild-only esbuild 0.25.10 is installed from the carried lock outside the plugin. Tool packages must already be installed with npm ci.`);
    return;
  }
  const check = argv.includes('--check');
  const names = argv.filter(arg => arg !== '--check');
  if (names.length > 1 || names.some(name => !TOOLS.includes(name))) throw new Error(`Expected one of ${TOOLS.join(', ')}, or --check. Run with --help for usage.`);
  const temporary = check ? mkdtempSync(join(tmpdir(), 'wiser-one-file-check-')) : null;
  let stale = false;
  try {
    for (const tool of names.length ? names : TOOLS) {
      const built = await compile(tool);
      for (const [path, content] of [[`tools/${tool}/dist/${tool}.mjs`, built.code], [`tools/${tool}/NOTICE.md`, built.notice]]) {
        const destination = join(ROOT, path);
        if (check) {
          const fresh = join(temporary, path);
          mkdirSync(dirname(fresh), { recursive: true }); writeFileSync(fresh, content);
          if (!existsSync(destination) || !readFileSync(destination).equals(readFileSync(fresh))) {
            process.stderr.write(`${tool}: missing or stale ${path}; rebuild with node tools/lib/build/one-file.mjs ${tool}\n`);
            stale = true;
          }
        } else { mkdirSync(dirname(destination), { recursive: true }); writeFileSync(destination, content); }
      }
      if (!stale) console.log(`${tool}: ${check ? 'current' : 'built'}`);
    }
  } finally { if (temporary) rmSync(temporary, { recursive: true, force: true }); }
  if (stale) process.exitCode = 1;
}

if (isMain(import.meta.url)) await main().catch(error => { console.error(error.message); process.exitCode = 1; });
