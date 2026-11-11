// Runtime regression fixtures never install or reach an external service.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, entryName } from './one-file.mjs';
import { assertNoPackages, copyTree } from './test-one-file.mjs';

export function fixture(t, tool) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'wiser-install-free-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const target = join(root, 'tools', tool);
  copyTree(join(ROOT, 'tools', tool), target);
  copyTree(join(ROOT, 'tools/lib'), join(root, 'tools/lib'));
  assertNoPackages(root);
  const env = { ...process.env, HOME: root, XDG_CONFIG_HOME: join(root, 'config'), APPDATA: join(root, 'config'), npm_config_offline: 'true' };
  for (const key of ['NODE_OPTIONS', 'NODE_PATH', 'WISER_ALLOW_INSTALL', 'HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy']) delete env[key];
  const deny = join(root, 'deny.mjs');
  writeFileSync(deny, `import http from 'node:http'; import https from 'node:https'; import net from 'node:net'; import tls from 'node:tls'; import dns from 'node:dns'; import cp from 'node:child_process'; import { syncBuiltinESMExports } from 'node:module';
const refuse = () => { throw new Error('test refused real network or installer'); };
globalThis.fetch = refuse; dns.lookup = refuse; dns.promises.lookup = refuse;
http.request = https.request = http.get = https.get = net.connect = net.createConnection = tls.connect = refuse;
for (const api of [dns, dns.promises]) for (const key of Object.keys(api)) if (/^(lookup|resolve|reverse)/.test(key)) api[key] = refuse;
net.Socket.prototype.connect = refuse;
if (process.env.WISER_TEST_OFFLINE_INSTALL !== '1') cp.execFileSync = refuse;
cp.execFile = cp.spawn = cp.spawnSync = cp.exec = cp.execSync = cp.fork = refuse; syncBuiltinESMExports();\n`);
  const run = (args, { compiled = false, preload, extra = {}, offlineInstall = false } = {}) => spawnSync(process.execPath,
    ['--import', deny, ...(preload ? ['--import', preload] : []), join(target, compiled ? 'dist' : 'scripts', `${entryName(tool)}.${compiled ? 'mjs' : 'js'}`), ...args],
    { encoding: 'utf8', env: { ...env, ...extra, WISER_TEST_OFFLINE_INSTALL: offlineInstall ? '1' : '0', npm_config_offline: 'true' }, timeout: 15000 });
  const write = (name, content) => { const path = join(root, name); writeFileSync(path, content); return path; };
  return { root, target, env, run, write, assertClean: () => assertNoPackages(root) };
}

export function successful(out) {
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.stderr, '');
  return JSON.parse(out.stdout);
}
