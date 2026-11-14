// Home and credential-directory refusals on the three Pages deploy routes, run
// in a child process that loads the documented isolated-home fixture
// (tools/lib/tests/isolated-home.js) first, so HOME and the platform user-config
// directory are disposable and nothing is written in a real user root. The
// child uses a FIXTURE-trusted connector copy and a fake publisher; every case
// must refuse before any publisher fetch and before any Cloudflare call.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ISOLATED_HOME = new URL('../../../tools/lib/tests/isolated-home.js', import.meta.url).href;
const FIXTURE = new URL('./pages-release-fixture.js', import.meta.url).href;

const CHILD = `
import ${JSON.stringify(ISOLATED_HOME)};
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
const f = await import(${JSON.stringify(FIXTURE)});
const home = realpathSync(homedir());
const config = process.platform === 'darwin' ? join(home, 'Library', 'Application Support', 'wiser')
  : process.platform === 'win32' ? join(home, 'AppData', 'Roaming', 'wiser') : join(home, '.config', 'wiser');
mkdirSync(config, { recursive: true });
const pub = f.fixtureIdentity('fixture-pub');
const copy = f.connectorCopy({ trust: f.trustJson({ 'fixture-pub': [pub.key] }) });
const { modules } = await copy.load();
const server = f.publisherServer({ 'fixture-pub': { identity: pub, layouts: [f.SYNTHETIC_LAYOUT] } });
const html = (dir) => { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, 'index.html'), '<p>x</p>\\n'); return dir; };
const fb = (dir, assets) => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, '_worker.bundle'), '--B\\r\\nContent-Disposition: form-data; name="metadata"\\r\\n\\r\\n{"main_module":"w.js"}\\r\\n--B\\r\\nContent-Disposition: form-data; name="w.js"; filename="w.js"\\r\\nContent-Type: application/javascript+module\\r\\n\\r\\nexport default {}\\r\\n--B--\\r\\n');
  writeFileSync(join(dir, '_routes.json'), '{"version":1,"include":["/api/*"],"exclude":[]}\\n');
  writeFileSync(join(dir, 'functions-filepath-routing-config.json'), '{"routes":[]}\\n');
  writeFileSync(join(dir, 'build.json'), JSON.stringify({ assets, functions: join(home, 'fsrc'), sources: [{ sha256: 'c'.repeat(64) }] }));
  return dir;
};
const acct = { account_id: '0123456789abcdef0123456789abcdef', project_name: 'home-site' };
const out = [];
async function run(label, action, input) {
  const calls = [];
  const before = server.requests.length;
  const result = await modules.pages[action](input, { proxy: f.deployProxy(calls), fetchRelease: server.fetchRelease });
  out.push({ label, action, status: result.status ?? null, field: result.field ?? null, reason: result.reason ?? null,
    cloudflare: calls.length, publisher: server.requests.length - before });
}
const credOut = html(join(config, 'holder', 'out'));
const parent = join(config, '..');
for (const action of ['deploy_static', 'deploy_with_functions']) {
  const extra = (dir) => action === 'deploy_with_functions' ? { functions_build: fb(join(home, 'fb-' + out.length), dir) } : {};
  await run('home', action, { ...acct, dir: home, ...extra(home) });
  await run('inside credential directory', action, { ...acct, dir: credOut, ...extra(credOut) });
  await run('credential directory itself', action, { ...acct, dir: config, ...extra(config) });
  await run('ancestor of the credential directory', action, { ...acct, dir: realpathSync(parent), ...extra(realpathSync(parent)) });
}
// pages.deploy: a release inside the credential directory.
{
  const contract = f.syntheticContract();
  const bytes = Buffer.from(JSON.stringify(contract));
  const root = join(config, 'holder2', contract.layout.root_name);
  const assets = html(join(root, 'out', 'public'));
  writeFileSync(join(root, 'release-id.json'), JSON.stringify({ releaseTag: contract.release }));
  writeFileSync(join(root, 'release.contract.json'), bytes);
  writeFileSync(join(root, 'release.contract.sig'), pub.signPages(bytes));
  await run('release inside credential directory', 'deploy', { ...acct, dir: assets,
    release_contract: join(root, 'release.contract.json'), release_signature: join(root, 'release.contract.sig') });
}
// pages.deploy: the release root is the home directory itself.
{
  const contract = f.syntheticContract({ layout: { root_name: basename(home) } });
  const bytes = Buffer.from(JSON.stringify(contract));
  const assets = html(join(home, 'out', 'public'));
  writeFileSync(join(home, 'release-id.json'), JSON.stringify({ releaseTag: contract.release }));
  writeFileSync(join(home, 'release.contract.json'), bytes);
  writeFileSync(join(home, 'release.contract.sig'), pub.signPages(bytes));
  await run('release root is home', 'deploy', { ...acct, dir: assets,
    release_contract: join(home, 'release.contract.json'), release_signature: join(home, 'release.contract.sig') });
  // The same release with its signature filed in the credential directory.
  writeFileSync(join(config, 'release.contract.sig'), pub.signPages(bytes));
  await run('signature in credential directory', 'deploy', { ...acct, dir: assets,
    release_contract: join(home, 'release.contract.json'), release_signature: join(config, 'release.contract.sig') });
}
copy.cleanup();
process.stdout.write(JSON.stringify({ home, config, out }));
`;

test('home and credential-directory payloads refuse on every Pages route before any fetch or call (isolated home)', () => {
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', CHILD], {
    encoding: 'utf8', timeout: 60000, cwd: fileURLToPath(new URL('.', import.meta.url)),
  });
  assert.equal(child.status, 0, child.stderr);
  const { home, config, out } = JSON.parse(child.stdout);
  // The child's home is the fixture's disposable one, never this process's.
  assert.match(home, /wiser-suite-home-/);
  assert.ok(config.startsWith(home));
  assert.notEqual(home, process.env.HOME);
  // The platform credential directory sits inside the home directory by
  // default, so the earlier credential check is what refuses home itself; the
  // separate 'home directory' wording is reached only when that directory is
  // configured outside home, which this fixture does not do.
  const expected = {
    home: ['dir', 'credential directory'],
    'inside credential directory': ['dir', 'credential directory'],
    'credential directory itself': ['dir', 'credential directory'],
    'ancestor of the credential directory': ['dir', 'credential directory'],
    'release inside credential directory': ['dir', 'credential directory'],
    'release root is home': ['release_contract', 'release root is a credential directory'],
    'signature in credential directory': ['release_signature', 'credential'],
  };
  assert.equal(out.length, 11);
  for (const row of out) {
    const [field, reason] = expected[row.label];
    assert.equal(row.status, 'invalid_arguments', JSON.stringify(row));
    assert.equal(row.field, field, JSON.stringify(row));
    assert.equal(row.reason, reason, JSON.stringify(row));
    assert.equal(row.cloudflare, 0, JSON.stringify(row));
    assert.equal(row.publisher, 0, JSON.stringify(row));
  }
});
