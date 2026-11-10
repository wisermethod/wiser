// Sitemap is source-only: packages are needed solely for network proxy setup.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { cpSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mainCli } from '../../lib/tests/main-cli.js';

const PROXIES = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy'];
function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'wiser-sitemap-source-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const tool = join(root, 'tools', 'sitemap');
  const filter = path => !path.split(/[\\/]/).some(part => part === 'node_modules' || part === '.env' || part.startsWith('.env.'));
  cpSync(fileURLToPath(new URL('../', import.meta.url)), tool, { recursive: true, filter });
  cpSync(fileURLToPath(new URL('../../lib/', import.meta.url)), join(root, 'tools', 'lib'), { recursive: true, filter });
  const home = join(root, 'home'); mkdirSync(home);
  const env = { ...process.env, HOME: home, USERPROFILE: home, APPDATA: home, XDG_CONFIG_HOME: home, npm_config_offline: 'true' };
  for (const name of [...PROXIES, 'WISER_ALLOW_INSTALL']) delete env[name];
  const cli = join(tool, 'scripts', 'sitemap.js');
  const input = join(root, 'map.xml');
  writeFileSync(input, '<urlset><url><loc>https://site.test/a</loc></url></urlset>');
  const preload = join(root, 'no-packages.mjs');
  writeFileSync(preload, `import fs from 'node:fs';
import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
const exists = fs.existsSync;
fs.existsSync = path => { if (/node_modules|wiser-consent/.test(String(path))) throw new Error('package or consent probe'); return exists(path); };
cp.execFileSync = () => { throw new Error('npm attempted'); };
syncBuiltinESMExports();
`);
  const run = (args, imports = [preload], entry = cli) => spawnSync(process.execPath, [...imports.flatMap(path => ['--import', path]), entry, ...args], { env, encoding: 'utf8', timeout: 15000 });
  return { root, tool, env, cli, input, preload, run };
}

// This fixture uses the same injected DNS/fetch boundary as cli-network.mjs.
// The screen sees a public test host; only the fetch adapter reaches loopback.
function localAdapter(f, port) {
  const file = join(f.root, 'local-network.mjs');
  writeFileSync(file, `import dns from 'node:dns';
const fetch = globalThis.fetch;
dns.promises.lookup = async host => {
  if (host !== 'delivery.test') throw new Error('unexpected DNS: ' + host);
  return [{ address: '93.184.216.34', family: 4 }];
};
globalThis.fetch = (url, options) => {
  if (String(url) !== 'http://delivery.test/map.xml') throw new Error('unexpected request: ' + url);
  return fetch('http://127.0.0.1:${port}/map.xml', options);
};
`);
  return file;
}
async function listen(t) {
  const requests = [];
  const server = createServer((request, response) => {
    requests.push(request.url);
    response.end('<urlset><url><loc>https://site.test/a</loc></url></urlset>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return { port: server.address().port, requests };
}
function runAsync(f, args, imports) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [...imports.flatMap(path => ['--import', path]), f.cli, ...args], { env: f.env });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    const timer = setTimeout(() => child.kill(), 15000);
    child.on('error', reject);
    child.on('close', status => { clearTimeout(timer); resolve({ status, stdout, stderr }); });
  });
}
function success(out) {
  assert.equal(out.status, 0, out.stderr); assert.equal(out.stderr, '');
}

test('source-only: every help form answers without packages, consent or npm', t => {
  const f = fixture(t);
  for (const args of [['help'], ['fetch', 'help'], ['diff', '--help']]) {
    const out = f.run(args); success(out); assert.match(out.stdout, /Usage:/);
  }
});
test('source-only: offline fetch needs no packages, including with a proxy set', t => {
  const f = fixture(t);
  for (const proxy of [undefined, 'http://proxy.test:8080']) {
    if (proxy) f.env.HTTPS_PROXY = proxy;
    const out = f.run(['fetch', '--file', f.input, '--date', '2026-11-10']);
    success(out); assert.equal(JSON.parse(out.stdout).count, 1);
  }
});
test('source-only: diff needs no packages, consent or npm', t => {
  const f = fixture(t);
  const previous = join(f.root, 'previous.json'), current = join(f.root, 'current.json');
  writeFileSync(previous, '{"urls":[]}');
  writeFileSync(current, '{"urls":[{"loc":"https://site.test/a"}]}');
  const out = f.run(['diff', '--previous', previous, '--current', current]);
  success(out); assert.deepEqual(JSON.parse(out.stdout).addedUrls, ['https://site.test/a']);
});
test('source-only: no proxy or blank proxies reach a local listener without package probes or npm', async t => {
  const f = fixture(t), server = await listen(t);
  const adapter = localAdapter(f, server.port);
  for (const blank of [undefined, ' \t ']) {
    if (blank) for (const name of PROXIES) f.env[name] = blank;
    const out = await runAsync(f, ['fetch', '--url', 'http://delivery.test/map.xml', '--date', '2026-11-10'], [f.preload, adapter]);
    success(out); assert.equal(JSON.parse(out.stdout).count, 1);
  }
  assert.deepEqual(server.requests, ['/map.xml', '/map.xml']);
  assert.equal(existsSync(join(f.tool, 'node_modules')), false);
});
for (const proxy of PROXIES) test(`source-only: ${proxy} retains f8211bef's entire install question and exit`, t => {
  const f = fixture(t);
  f.env[proxy] = ' http://proxy.test:8080 ';
  const baseline = mainCli(t, 'sitemap');
  rmSync(join(dirname(dirname(baseline)), 'node_modules'), { recursive: true, force: true });
  const args = ['fetch', '--url', 'http://delivery.test/map.xml'];
  const before = f.run(args, [], baseline), after = f.run(args, []);
  assert.equal(before.status, 1); assert.equal(after.status, 1); assert.equal(after.stdout, '');
  assert.equal(after.stderr, before.stderr.replaceAll(dirname(dirname(baseline)), f.tool));
  assert.match(after.stderr, /^This Wiser skill needs to download and install a small web-request library/);
  assert.equal(existsSync(join(f.tool, 'node_modules')), false);
});
test('source-only: a blank higher-priority proxy does not hide a non-blank lower-priority proxy', t => {
  const f = fixture(t); f.env.HTTPS_PROXY = ' '; f.env.http_proxy = 'http://proxy.test:8080';
  const out = f.run(['fetch', '--url', 'http://delivery.test/map.xml'], []);
  assert.equal(out.status, 1); assert.match(out.stderr, /^This Wiser skill needs to download/);
});
test('source-only: --install installs once and completes proxy fetch in the same run', async t => {
  const f = fixture(t), server = await listen(t);
  f.env.HTTPS_PROXY = ' http://proxy.test:8080 ';
  const install = join(f.root, 'install.mjs');
  writeFileSync(install, `import cp from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
cp.execFileSync = (command, args, options) => {
  assert.equal(command, process.platform === 'win32' ? 'npm.cmd' : 'npm');
  assert.deepEqual(args, ['ci']); assert.equal(options.cwd, ${JSON.stringify(f.tool)});
  const dir = join(options.cwd, 'node_modules', 'undici');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'module', main: 'index.js' }));
  fs.writeFileSync(join(dir, 'index.js'), "export class ProxyAgent { constructor(server) { if (server !== 'http://proxy.test:8080') throw new Error('wrong proxy'); } }\\nexport function setGlobalDispatcher() {}\\n");
};
syncBuiltinESMExports();
`);
  const adapter = localAdapter(f, server.port);
  const args = ['fetch', '--url', 'http://delivery.test/map.xml', '--install', '--date', '2026-11-10'];
  const out = await runAsync(f, args, [install, adapter]);
  assert.equal(out.status, 0, out.stderr); assert.equal(out.stderr, 'First run: installing dependencies in this tool directory.\n');
  assert.equal(JSON.parse(out.stdout).count, 1); assert.deepEqual(server.requests, ['/map.xml']);
  assert.equal(existsSync(join(f.tool, 'node_modules', 'undici', 'package.json')), true);
});
