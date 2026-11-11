// Runtime fixtures share no installed tool packages with their source tree.
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
export const PROXIES = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy'];
export function assertNoPackages(root) {
  for (let path = root;; path = dirname(path)) {
    assert.equal(existsSync(join(path, 'node_modules')), false, `package ancestor: ${path}`);
    if (path === dirname(path)) break;
  }
  function walk(path) { for (const item of readdirSync(path, { withFileTypes: true })) {
    assert.notEqual(item.name, 'node_modules'); assert.equal(item.isSymbolicLink(), false);
    if (item.isDirectory()) walk(join(path,item.name));
  } }
  walk(root);
}
export function toolCopy(t, name) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'wiser-carried-')));
  t.after(() => { try { assertNoPackages(root); } finally { rmSync(root, { recursive: true, force: true }); } });
  const filter = path => !path.split(/[\\/]/).some(part => part === 'node_modules' || part === '.env' || part.startsWith('.env.'));
  const tool = join(root, 'tools', name);
  cpSync(fileURLToPath(new URL(`../../${name}/`, import.meta.url)), tool, { recursive: true, filter });
  cpSync(fileURLToPath(new URL('../', import.meta.url)), join(root, 'tools', 'lib'), { recursive: true, filter });
  const home = join(root, 'profile'); mkdirSync(home);
  const env = { ...process.env, npm_config_offline: 'true' };
  for (const key of [...PROXIES, 'WISER_ALLOW_INSTALL']) delete env[key];
  const isolatedEnv = { ...env, HOME: home, USERPROFILE: home, APPDATA: home, XDG_CONFIG_HOME: home };
  const cli = join(tool, 'scripts', name === 'deck-export' ? 'deck.js' : `${name}.js`);
  const run = (args, { imports = [], environment = env } = {}) => spawnSync(process.execPath, [...imports.flatMap(path => ['--import',path]), cli, ...args], { env: environment, encoding: 'utf8', timeout: 65000 });
  const preload = join(root, 'no-install.mjs');
  writeFileSync(preload, `import fs from 'node:fs';
import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
const exists = fs.existsSync;
fs.existsSync = path => { if (String(path).includes(${JSON.stringify(join(tool,'node_modules'))}) || /wiser-consent/.test(String(path))) throw new Error('unexpected package or consent probe'); return exists(path); };
cp.execFileSync = () => { throw new Error('unexpected installer'); };
syncBuiltinESMExports();\n`);
  assertNoPackages(root);
  return { root, tool, home, cli, env, isolatedEnv, run, preload };
}

export async function assertPinnedCopy(t, name) {
  const f = toolCopy(t, name);
  const source = process.env.WISER_TEST_SOURCE_ROOT || fileURLToPath(new URL('../../../', import.meta.url));
  const packageName = name === 'render' ? 'mermaid' : 'reveal.js';
  const packageSource = join(source, 'tools', name, 'node_modules', packageName);
  assert.ok(existsSync(packageSource), 'builder proof requires the installed source package; set WISER_TEST_SOURCE_ROOT for an isolated runtime copy');
  mkdirSync(join(f.tool, 'node_modules'));
  cpSync(packageSource, join(f.tool, 'node_modules', packageName), { recursive: true });
  try {
    const { refresh } = await import('../build/copy-assets.mjs');
    // Establish a current manifest before the coordinated edit, including this
    // builder's hash. Only the authenticated package comparison can refuse it.
    refresh(name, { root: f.root });
    const target = join(f.tool, 'vendor', packageName, name === 'render' ? 'mermaid.min.js' : 'dist/reveal.js');
    const bytes = Buffer.concat([readFileSync(target), Buffer.from(' ')]);
    writeFileSync(target, bytes);
    const manifestPath = join(f.tool, 'vendor/manifest.json'), manifest = JSON.parse(readFileSync(manifestPath));
    const row = manifest.files.find(row => row.path === `${packageName}/${name === 'render' ? 'mermaid.min.js' : 'dist/reveal.js'}`);
    row.bytes = bytes.length; row.sha256 = createHash('sha256').update(bytes).digest('hex'); manifest.bytes++;
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2)+'\n');
    const installed = join(f.tool, 'node_modules', packageName, name === 'render' ? 'dist/mermaid.min.js' : 'dist/reveal.js');
    writeFileSync(installed, bytes);
    assert.throws(() => refresh(name, { root:f.root, check:true }), /integrity|locked package/);
  } finally { rmSync(join(f.tool,'node_modules'), {recursive:true,force:true}); }
}
