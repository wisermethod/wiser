#!/usr/bin/env node
// Copy a tool and tools/lib to system temporary storage, with no package tree.
// CLI tests use the shipped dist; unit imports use namespaces from that same file.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compiler, coreModules, namespace, ROOT, TOOLS } from './one-file.mjs';
import { isMain } from '../one-file.js';

export function copyTree(source, target) {
  cpSync(source, target, { recursive: true, filter: path => !path.split(/[\\/]/).some(part => part === 'node_modules' || part === '.git' || part === '.env' || part.startsWith('.env.')) });
}
export function assertNoPackages(root) {
  for (let dir = root;; dir = dirname(dir)) {
    assert.equal(existsSync(join(dir, 'node_modules')), false, `package tree above copy: ${dir}`);
    if (dirname(dir) === dir) break;
  }
  function walk(dir) {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      assert.notEqual(item.name, 'node_modules', `package tree inside copy: ${dir}`);
      assert.equal(item.isSymbolicLink(), false, `link could hide packages: ${dir}/${item.name}`);
      if (item.isDirectory()) walk(join(dir, item.name));
    }
  }
  walk(root);
}

export async function main(argv = process.argv.slice(2)) {
  if (argv.length !== 1 || !TOOLS.includes(argv[0])) throw new Error(`Usage: node tools/lib/build/test-one-file.mjs ${TOOLS.join('|')}`);
  const tool = argv[0];
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), `wiser-one-file-${tool}-`)));
  try {
    const target = join(scratch, 'tools', tool);
    mkdirSync(dirname(target), { recursive: true });
    copyTree(join(ROOT, 'tools', tool), target);
    copyTree(join(ROOT, 'tools', 'lib'), join(scratch, 'tools', 'lib'));
    const bundle = pathToFileURL(join(target, 'dist', `${tool}.mjs`)).href;
    const exports = await import(bundle);
    const mapping = {};
    for (const name of coreModules(tool)) {
      const space = namespace(name);
      const adapter = join(scratch, space + '.mjs');
      writeFileSync(adapter, `import { ${space} as core } from ${JSON.stringify(bundle)};\n` + Object.keys(exports[space]).map(key => `export const ${key} = core.${key};`).join('\n'));
      mapping[pathToFileURL(join(target, 'scripts', name)).href] = pathToFileURL(adapter).href;
    }
    const loader = join(scratch, 'loader.mjs');
    writeFileSync(loader, `const mapping = ${JSON.stringify(mapping)};\nexport async function resolve(specifier, context, next) {\n  const resolved = await next(specifier, context);\n  return mapping[resolved.url] ? { url: mapping[resolved.url], shortCircuit: true } : resolved;\n}\n`);
    const register = join(scratch, 'register.mjs');
    writeFileSync(register, `import { register } from 'node:module';\nregister(${JSON.stringify(pathToFileURL(loader).href)}, import.meta.url);\n`);
    const env = { ...process.env, WISER_TEST_SOURCE_ROOT: ROOT, NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --import=${pathToFileURL(register).href}` };
    if (tool === 'data') {
      // The restricted VM still rejects every Node import/global. Compile the
      // same installed browser parser to a temporary ESM fixture, no packages.
      const esbuild = await compiler();
      const portable = join(scratch, 'portable-csv.mjs');
      const result = await esbuild.build({ absWorkingDir: ROOT, entryPoints: ['tools/data/node_modules/csv-parse/dist/esm/sync.js'], bundle: true, platform: 'neutral', format: 'esm', target: 'node18', write: false, legalComments: 'inline' });
      writeFileSync(portable, result.outputFiles[0].contents);
      env.WISER_TEST_PORTABLE_CSV = pathToFileURL(portable).href;
    }
    assertNoPackages(scratch);
    console.log(`${tool}: isolated copy has no node_modules above or inside it`);
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    // The suite's own npm test; its node and subprocesses use this exact runtime.
    env.npm_config_cache = join(homedir(), '.cache', 'wiser-connector-launch', 'npm');
    env.PATH = dirname(process.execPath) + (process.platform === 'win32' ? ';' : ':') + env.PATH;
    const run = spawnSync(npm, ['test'], { cwd: target, env, stdio: 'inherit' });
    if (run.error) throw run.error;
    assertNoPackages(scratch);
    process.exitCode = run.status ?? 1;
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}
if (isMain(import.meta.url)) await main().catch(error => { console.error(error.stack); process.exitCode = 1; });
