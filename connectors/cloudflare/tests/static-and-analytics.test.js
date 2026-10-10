import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { modules } from '../index.js';

import { existsSync as __exists } from 'node:fs';
import { dirname as __dirname_, join as __join } from 'node:path';
import { fileURLToPath as __toPath, pathToFileURL as __toUrl } from 'node:url';
function __findGateway() {
  let dir = __toPath(new URL('.', import.meta.url));
  for (let i = 0; i < 8; i += 1) {
    const candidate = __join(dir, 'gateway', 'test', 'fake-provider.js');
    if (__exists(candidate)) return __toUrl(candidate).href;
    const parent = __dirname_(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('gateway/test/fake-provider.js not found above this test');
}
const { createTestGateway, putActive } = await import(__findGateway());

const CONNECTORS = fileURLToPath(new URL('../..', import.meta.url));
const ACCOUNT = '0123456789abcdef0123456789abcdef';
const PROJECT = 'wiser-site';
const SITE = 'fedcba9876543210fedcba9876543210';
const OTHER = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const TOKEN = 'PLANTED_SITE_TOKEN_9f3c2a';
const SNIPPET = 'PLANTED_SNIPPET_9f3c2b';
const JWT = 'static-upload-jwt';

function scratch() {
  return realpathSync(mkdtempSync(join(tmpdir(), 'cf-static-')));
}

function cleanup(root) {
  rmSync(root, { recursive: true, force: true });
}

function envelope(result, extra = {}) {
  return { status: 200, data: { success: true, errors: [], messages: [], result, ...extra }, headers: {} };
}

function site(root, ...parts) {
  const dir = join(root, ...parts);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), '<p>hi</p>\n');
  return dir;
}

function formParts(binary) {
  const boundary = binary.content_type.split('boundary=')[1];
  const text = Buffer.from(binary.base64, 'base64');
  const raw = text.toString('latin1');
  const parts = [];
  for (const chunk of raw.split(`--${boundary}`)) {
    const trimmed = chunk.replace(/^\r\n/, '');
    if (trimmed === '' || trimmed === '--\r\n' || trimmed === '--') continue;
    const splitAt = trimmed.indexOf('\r\n\r\n');
    if (splitAt < 0) continue;
    const head = trimmed.slice(0, splitAt);
    let value = trimmed.slice(splitAt + 4);
    if (value.endsWith('\r\n')) value = value.slice(0, -2);
    const name = /name="([^"]+)"/.exec(head)?.[1];
    parts.push({ name, value, head });
  }
  return { boundary, parts };
}

async function granted() {
  const { gw, store, fake } = await createTestGateway({ connectorDirs: [CONNECTORS] });
  await putActive(store, fake, { service: 'cloudflare', module: 'pages' });
  return { gw, fake };
}

function deployCtx(onProxy) {
  const calls = [];
  const ctx = {
    async proxy(req) {
      calls.push(req);
      if (onProxy) return onProxy(req, calls);
      if (req.method === 'GET' && String(req.endpoint).endsWith('/upload-token')) return envelope({ jwt: JWT });
      if (req.endpoint === '/pages/assets/check-missing') return envelope(req.body.hashes);
      if (req.endpoint === '/pages/assets/upload' || req.endpoint === '/pages/assets/upsert-hashes') return envelope(null);
      if (req.method === 'POST' && String(req.endpoint).endsWith('/deployments')) {
        return envelope({ id: 'dep-static', url: 'https://wiser-site.pages.dev' });
      }
      return envelope({});
    },
  };
  return { calls, ctx };
}

async function deploy(dir, onProxy) {
  const { calls, ctx } = deployCtx(onProxy);
  const result = await modules.pages.deploy_static({
    account_id: ACCOUNT, project_name: PROJECT, dir,
  }, ctx);
  return { result, calls };
}

function callNames(calls) {
  return calls.map((req) => {
    if (String(req.endpoint).endsWith('/upload-token')) return 'upload-token';
    if (req.endpoint === '/pages/assets/check-missing') return 'check-missing';
    if (req.endpoint === '/pages/assets/upload') return 'upload';
    if (req.endpoint === '/pages/assets/upsert-hashes') return 'upsert-hashes';
    if (String(req.endpoint).endsWith('/deployments')) return 'deployments';
    return `${req.method} ${req.endpoint}`;
  });
}

test('deploy_static uploads both files and sends no function parts', async () => {
  const root = scratch();
  try {
    const dir = site(root, 'out');
    mkdirSync(join(dir, 'about'));
    writeFileSync(join(dir, 'about', 'index.html'), '<p>about</p>\n');
    const { result, calls } = await deploy(dir);
    assert.deepEqual(callNames(calls), ['upload-token', 'check-missing', 'upload', 'upsert-hashes', 'deployments']);
    assert.equal(calls[0].endpoint, `/accounts/${ACCOUNT}/pages/projects/${PROJECT}/upload-token`);
    const form = formParts(calls[4].binary_body);
    const names = form.parts.map((part) => part.name);
    assert.deepEqual(names, ['manifest']);
    const manifest = JSON.parse(form.parts[0].value);
    assert.deepEqual(Object.keys(manifest).sort(), ['/about/index.html', '/index.html']);
    for (const banned of ['_worker.bundle', '_routes.json', 'functions-filepath-routing-config.json']) {
      assert.equal(form.parts.some((part) => part.name === banned), false, banned);
      assert.equal(Object.hasOwn(manifest, `/${banned}`), false, banned);
    }
    assert.equal(result.files, 2);
    assert.deepEqual([...result.manifest].sort(), ['/about/index.html', '/index.html']);
    assert.equal(result.deployment.id, 'dep-static');
    assert.equal(JSON.stringify(result).includes(JWT), false);
  } finally {
    cleanup(root);
  }
});

test('deploy_static deploys one 170 KB file', async () => {
  const root = scratch();
  try {
    const dir = join(root, 'out');
    mkdirSync(dir);
    writeFileSync(join(dir, 'index.html'), Buffer.alloc(170 * 1024, 0x61));
    const { result, calls } = await deploy(dir);
    assert.equal(result.files, 1);
    assert.deepEqual(callNames(calls), ['upload-token', 'check-missing', 'upload', 'upsert-hashes', 'deployments']);
  } finally {
    cleanup(root);
  }
});

test('deploy_static sends _headers and _redirects as form parts and not as assets', async () => {
  const root = scratch();
  try {
    const dir = site(root, 'out');
    const headers = '/*\n  X-Frame-Options: DENY\n';
    const redirects = '/old /new 301\n';
    writeFileSync(join(dir, '_headers'), headers);
    writeFileSync(join(dir, '_redirects'), redirects);
    const { result, calls } = await deploy(dir);
    const form = formParts(calls.find((req) => String(req.endpoint).endsWith('/deployments')).binary_body);
    assert.deepEqual(form.parts.map((part) => part.name), ['manifest', '_headers', '_redirects']);
    assert.equal(form.parts.find((part) => part.name === '_headers').value, headers);
    assert.equal(form.parts.find((part) => part.name === '_redirects').value, redirects);
    const manifest = JSON.parse(form.parts[0].value);
    assert.deepEqual(Object.keys(manifest), ['/index.html']);
    assert.equal(result.manifest.includes('/_headers'), false);
    assert.equal(result.manifest.includes('/_redirects'), false);
  } finally {
    cleanup(root);
  }
});

function refuse(label, reason, arrange) {
  test(`deploy_static refuses ${label}`, async () => {
    const root = scratch();
    let undo = () => {};
    try {
      const built = arrange(root);
      const dir = built && typeof built === 'object' && Object.hasOwn(built, 'dir') ? built.dir : built;
      if (built && typeof built === 'object' && built.undo) undo = built.undo;
      const { result, calls } = await deploy(dir);
      assert.equal(calls.length, 0, label);
      assert.equal(result.status, 'invalid_arguments', label);
      assert.equal(result.field, 'dir', label);
      assert.equal(result.reason, reason, label);
    } finally {
      try { undo(); } catch { /* the refusal path may not have created the file */ }
      cleanup(root);
    }
  });
}

refuse('a kit site/dist', 'kit payload: use cloudflare.pages.deploy', (root) => {
  const dir = site(root, 'site', 'dist');
  writeFileSync(join(root, 'site', 'kit.json'), '{}\n');
  return dir;
});

refuse('a directory inside a kit dist', 'kit payload: use cloudflare.pages.deploy', (root) => {
  const dir = site(root, 'site', 'dist', 'public');
  writeFileSync(join(root, 'site', 'kit.json'), '{}\n');
  return dir;
});

refuse('a directory whose parent holds kit.json', 'kit payload: use cloudflare.pages.deploy', (root) => {
  const dir = site(root, 'holder', 'out');
  writeFileSync(join(root, 'holder', 'kit.json'), '{}\n');
  return dir;
});

refuse('_worker.js at the root', 'server code: _worker.js; use cloudflare.pages.deploy_with_functions', (root) => {
  const dir = site(root, 'out');
  writeFileSync(join(dir, '_worker.js'), 'export default {}\n');
  return dir;
});

refuse('_worker.js nested', 'server code: assets/_worker.js; use cloudflare.pages.deploy_with_functions', (root) => {
  const dir = site(root, 'out');
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'assets', '_worker.js'), 'export default {}\n');
  return dir;
});

refuse('_worker.bundle nested', 'server code: assets/_worker.bundle; use cloudflare.pages.deploy_with_functions', (root) => {
  const dir = site(root, 'out');
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'assets', '_worker.bundle'), 'nope\n');
  return dir;
});

refuse('functions-filepath-routing-config.json nested', 'server code: assets/functions-filepath-routing-config.json; use cloudflare.pages.deploy_with_functions', (root) => {
  const dir = site(root, 'out');
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'assets', 'functions-filepath-routing-config.json'), '{}\n');
  return dir;
});

refuse('functions/ at the root', 'server code: functions; use cloudflare.pages.deploy_with_functions', (root) => {
  const dir = site(root, 'out');
  mkdirSync(join(dir, 'functions'));
  writeFileSync(join(dir, 'functions', 'api.js'), 'export {}\n');
  return dir;
});

refuse('Functions/ nested', 'server code: pkg/Functions; use cloudflare.pages.deploy_with_functions', (root) => {
  const dir = site(root, 'out');
  mkdirSync(join(dir, 'pkg', 'Functions'), { recursive: true });
  writeFileSync(join(dir, 'pkg', 'Functions', 'api.js'), 'export {}\n');
  return dir;
});

refuse('package.json at the root', 'not build output: package.json', (root) => {
  const dir = site(root, 'out');
  writeFileSync(join(dir, 'package.json'), '{}\n');
  return dir;
});

refuse('wrangler.toml at the root', 'not build output: wrangler.toml', (root) => {
  const dir = site(root, 'out');
  writeFileSync(join(dir, 'wrangler.toml'), 'name = "x"\n');
  return dir;
});

for (const name of ['AGENTS.md', 'agents.md', 'CLAUDE.md']) {
  refuse(`${name} at the root`, `working folder: ${name}`, (root) => {
    const dir = site(root, 'out');
    writeFileSync(join(dir, name), '# notes\n');
    return dir;
  });
  refuse(`${name} nested`, `working folder: docs/${name}`, (root) => {
    const dir = site(root, 'out');
    mkdirSync(join(dir, 'docs'));
    writeFileSync(join(dir, 'docs', name), '# notes\n');
    return dir;
  });
}

refuse('.git directory at the root', 'working folder: .git', (root) => {
  const dir = site(root, 'out');
  mkdirSync(join(dir, '.git'));
  writeFileSync(join(dir, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  return dir;
});

refuse('.git file nested', 'working folder: sub/.git', (root) => {
  const dir = site(root, 'out');
  mkdirSync(join(dir, 'sub'));
  writeFileSync(join(dir, 'sub', '.git'), 'gitdir: /nowhere\n');
  return dir;
});

refuse('memory/ at the root', 'working folder: memory', (root) => {
  const dir = site(root, 'out');
  mkdirSync(join(dir, 'memory'));
  writeFileSync(join(dir, 'memory', 'note.txt'), 'secret\n');
  return dir;
});

refuse('.env at the root', 'working folder: .env', (root) => {
  const dir = site(root, 'out');
  writeFileSync(join(dir, '.env'), 'TOKEN=1\n');
  return dir;
});

refuse('.env.local at the root', 'working folder: .env.local', (root) => {
  const dir = site(root, 'out');
  writeFileSync(join(dir, '.env.local'), 'TOKEN=1\n');
  return dir;
});

refuse('.env nested', 'working folder: config/.env', (root) => {
  const dir = site(root, 'out');
  mkdirSync(join(dir, 'config'));
  writeFileSync(join(dir, 'config', '.env'), 'TOKEN=1\n');
  return dir;
});

// The One Reach dashboard's own folder holds its build script, a report and a
// zArchive/ beside the publish/ folder; zArchive is what marks it a working folder.
refuse('zArchive/ at the root', 'working folder: zArchive', (root) => {
  const dir = site(root, 'out');
  mkdirSync(join(dir, 'zArchive'));
  writeFileSync(join(dir, 'zArchive', '26-10-10 V1 - build.py'), 'print(1)\n');
  return dir;
});

refuse('ZARCHIVE nested', 'working folder: docs/ZARCHIVE', (root) => {
  const dir = site(root, 'out');
  mkdirSync(join(dir, 'docs', 'ZARCHIVE'), { recursive: true });
  writeFileSync(join(dir, 'docs', 'ZARCHIVE', 'old.html'), '<p>old</p>\n');
  return dir;
});

refuse('dir that is a declared root', 'working folder: dir is a declared root', (root) => {
  const dir = site(root, 'out');
  writeFileSync(join(dir, 'AGENTS.md'), '---\nroot: wiser\n---\n');
  return dir;
});

refuse('dir whose parent is a declared root', 'working folder: dir is at the top level of a declared root', (root) => {
  const dir = site(root, 'parent', 'out');
  writeFileSync(join(root, 'parent', 'AGENTS.md'), '---\ntype: client\n---\n');
  return dir;
});

refuse('an unreadable AGENTS.md in the parent', 'working folder: unreadable AGENTS.md', (root) => {
  const dir = site(root, 'parent', 'out');
  const agents = join(root, 'parent', 'AGENTS.md');
  writeFileSync(agents, '---\nroot: wiser\n---\n');
  chmodSync(agents, 0);
  return { dir, undo: () => chmodSync(agents, 0o644) };
});

refuse('a relative path', 'path must be absolute', () => 'relative/out');

refuse('a path with ..', 'path is not in normal form', (root) => `${root}/nested/../out`);

refuse('a path through a symbolic link', 'symbolic link in path', (root) => {
  const real = site(root, 'real', 'sub');
  symlinkSync(join(root, 'real'), join(root, 'link'));
  return join(root, 'link', 'sub') === real ? join(root, 'link', 'sub') : join(root, 'link', 'sub');
});

refuse('the filesystem root', 'filesystem root', () => '/');

refuse('a path that does not exist', 'not found', (root) => join(root, 'missing'));

test('deploy_static accepts a directory two levels below a declared root', async () => {
  const root = scratch();
  try {
    writeFileSync(join(root, 'AGENTS.md'), '---\nroot: wiser\n---\n');
    const dir = join(root, 'programs', 'x', 'publish');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(root, 'programs', 'AGENTS.md'), '# program\n');
    writeFileSync(join(dir, 'index.html'), 'ok\n');
    const { result, calls } = await deploy(dir);
    assert.equal(result.files, 1);
    assert.equal(result.deployment.id, 'dep-static');
    assert.equal(calls.length > 0, true);
  } finally {
    cleanup(root);
  }
});

test('deploy_static accepts a parent AGENTS.md with no frontmatter', async () => {
  const root = scratch();
  try {
    const dir = site(root, 'parent', 'out');
    writeFileSync(join(root, 'parent', 'AGENTS.md'), '# notes\n');
    const { result } = await deploy(dir);
    assert.equal(result.files, 1);
    assert.equal(result.deployment.id, 'dep-static');
  } finally {
    cleanup(root);
  }
});

test('deploy_static accepts a parent AGENTS.md whose frontmatter carries neither key', async () => {
  const root = scratch();
  try {
    const dir = site(root, 'parent', 'out');
    writeFileSync(join(root, 'parent', 'AGENTS.md'), '---\nname: client\n---\n');
    const { result } = await deploy(dir);
    assert.equal(result.files, 1);
    assert.equal(result.deployment.id, 'dep-static');
  } finally {
    cleanup(root);
  }
});

test('deploy_static uploads a memory directory below the root', async () => {
  const root = scratch();
  try {
    const dir = site(root, 'out');
    mkdirSync(join(dir, 'assets', 'memory'), { recursive: true });
    writeFileSync(join(dir, 'assets', 'memory', 'note.txt'), 'kept\n');
    const { result } = await deploy(dir);
    assert.equal(result.files, 2, JSON.stringify(result));
    assert.ok(result.manifest.includes('/assets/memory/note.txt'));
    assert.equal(result.skipped.some((item) => String(item.file).includes('memory')), false);
  } finally {
    cleanup(root);
  }
});

test('deploy_static lists source files, node_modules, hidden names, and credentials as skips', async () => {
  const root = scratch();
  try {
    const dir = site(root, 'out');
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'package.json'), '{}\n');
    mkdirSync(join(dir, 'node_modules'));
    writeFileSync(join(dir, 'node_modules', 'left.js'), 'nope\n');
    writeFileSync(join(dir, '.DS_Store'), 'nope\n');
    writeFileSync(join(dir, 'id_rsa'), 'nope\n');
    const { result, calls } = await deploy(dir);
    assert.equal(result.deployment.id, 'dep-static');
    assert.deepEqual(result.manifest, ['/index.html']);
    assert.ok(result.skipped.some((item) => item.file === 'src/package.json' && item.reason === 'source file'));
    assert.ok(result.skipped.some((item) => item.file === 'node_modules' && item.reason === 'skipped name'));
    assert.ok(result.skipped.some((item) => item.file === '.DS_Store' && item.reason === 'hidden'));
    assert.ok(result.skipped.some((item) => item.file === 'id_rsa' && item.reason === 'credential'));
    assert.equal(result.manifest.some((file) => file.includes('node_modules')), false);
    assert.equal(calls.some((req) => String(req.endpoint).endsWith('/deployments')), true);
  } finally {
    cleanup(root);
  }
});

test('deploy_static stops when a file changes between the walk and the upload', async () => {
  const root = scratch();
  try {
    const dir = site(root, 'out');
    const file = join(dir, 'index.html');
    const { result, calls } = await deploy(dir, (req) => {
      if (req.endpoint === '/pages/assets/check-missing') writeFileSync(file, '<p>changed</p>\n');
      if (req.method === 'GET' && String(req.endpoint).endsWith('/upload-token')) return envelope({ jwt: JWT });
      if (req.endpoint === '/pages/assets/check-missing') return envelope(req.body.hashes);
      return envelope(null);
    });
    assert.equal(result.status, 'invalid_arguments');
    assert.equal(result.field, 'dir');
    assert.equal(result.reason, 'file changed during deploy: index.html');
    assert.deepEqual(callNames(calls), ['upload-token', 'check-missing']);
  } finally {
    cleanup(root);
  }
});

test('deploy_static refuses an asset whose upload entry exceeds 3 MiB before any call', async () => {
  const root = scratch();
  try {
    const dir = join(root, 'out');
    mkdirSync(dir);
    writeFileSync(join(dir, 'index.html'), Buffer.alloc(2400000, 0x61));
    const { result, calls } = await deploy(dir);
    assert.equal(calls.length, 0);
    assert.equal(result.status, 'invalid_arguments');
    assert.equal(result.field, 'dir');
    assert.equal(result.reason, 'file over the 3 MiB upload request limit: index.html');
  } finally {
    cleanup(root);
  }
});

test('deploy_static is confirmation always and the gateway stops', async () => {
  const manifest = JSON.parse(readFileSync(fileURLToPath(new URL('../manifest.json', import.meta.url)), 'utf8'));
  assert.equal(manifest.modules.pages.actions.deploy_static.confirmation, 'always');
  assert.equal(manifest.modules.pages.actions.deploy_static.risk, 'high');
  assert.equal(manifest.modules.pages.actions.deploy_static.execution.prefer, 'proxy');
  const { gw, fake } = await granted();
  const calls = [];
  fake.auth.proxy = async (req) => {
    calls.push(req);
    return envelope({});
  };
  const stopped = await gw.execute({
    action: 'cloudflare.pages.deploy_static',
    input: { account_id: ACCOUNT, project_name: PROJECT, dir: '/tmp/static-confirm' },
  });
  assert.equal(stopped.status, 'needs_confirmation');
  assert.equal(calls.length, 0);
});

function analyticsCtx(handler) {
  const calls = [];
  const ctx = {
    async proxy(req) {
      calls.push(req);
      return handler(req, calls);
    },
  };
  return { calls, ctx };
}

async function analytics(action, input, handler) {
  const { calls, ctx } = analyticsCtx(handler);
  const result = await modules.pages[action](input, ctx);
  return { result, calls };
}

function project(build = {}, extra = {}) {
  return envelope({ name: PROJECT, subdomain: 'wiser-site.pages.dev', build_config: build, ...extra });
}

function siteInfo(overrides = {}) {
  return envelope({
    site_tag: SITE,
    site_token: TOKEN,
    snippet: SNIPPET,
    host: 'www.example.com',
    ...overrides,
  });
}

test('list_web_analytics_sites joins pages and drops the token and the snippet', async () => {
  const first = {
    site_tag: SITE,
    site_token: TOKEN,
    snippet: SNIPPET,
    host: 'www.example.com',
    auto_install: false,
    created: '2026-01-02T00:00:00Z',
    zone_tag: 'should-not-win',
    rules: [
      { host: 'www.example.com' },
      { host: 'www.example.com' },
      { host: 3 },
    ],
    ruleset: {
      zone_tag: 'zone123',
      zone_name: 'example.com',
      enabled: true,
      rules: [
        { host: 'example.com' },
        { host: 'www.example.com' },
      ],
    },
  };
  const second = { site_tag: OTHER, site_token: TOKEN, snippet: SNIPPET, zone_tag: 'fallback-zone' };
  const { result, calls } = await analytics('list_web_analytics_sites', { account_id: ACCOUNT }, (req) => {
    const page = new URL(req.endpoint, 'https://api.cloudflare.com').searchParams.get('page');
    if (page === '1') return envelope([first], { result_info: { total_pages: 2 } });
    if (page === '2') return envelope([second], { result_info: { total_pages: 2 } });
    throw new Error(`unexpected ${req.endpoint}`);
  });
  assert.deepEqual(calls.map((req) => req.endpoint), [
    `/accounts/${ACCOUNT}/rum/site_info/list?page=1&per_page=100`,
    `/accounts/${ACCOUNT}/rum/site_info/list?page=2&per_page=100`,
  ]);
  assert.equal(result.success, true);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.messages, []);
  assert.deepEqual(result.result_info, { count: 2, total_count: 2 });
  assert.deepEqual(result.result[0], {
    site_tag: SITE,
    host: 'www.example.com',
    auto_install: false,
    enabled: true,
    zone_tag: 'zone123',
    zone_name: 'example.com',
    rule_hosts: ['www.example.com', 'example.com'],
    created: '2026-01-02T00:00:00Z',
  });
  assert.deepEqual(result.result[1], {
    site_tag: OTHER,
    host: null,
    auto_install: null,
    enabled: null,
    zone_tag: 'fallback-zone',
    zone_name: null,
    rule_hosts: [],
    created: null,
  });
  const body = JSON.stringify(result);
  assert.equal(body.includes(TOKEN), false);
  assert.equal(body.includes(SNIPPET), false);
});

test('list_web_analytics_sites returns vendor_error when a page says success false', async () => {
  const { result, calls } = await analytics('list_web_analytics_sites', { account_id: ACCOUNT }, () => ({
    status: 200,
    data: { success: false, errors: [{ message: 'no' }], result: [], messages: [] },
    headers: {},
  }));
  assert.equal(calls.length, 1);
  assert.equal(result.status, 'vendor_error');
  assert.equal(result.method, 'GET');
  assert.equal(result.endpoint, `/accounts/${ACCOUNT}/rum/site_info/list?page=1&per_page=100`);
});

test('list_web_analytics_sites reads one page when total_pages is absent', async () => {
  const { result, calls } = await analytics('list_web_analytics_sites', { account_id: ACCOUNT }, () => envelope([{
    site_tag: SITE, site_token: TOKEN, snippet: SNIPPET, host: 'example.com',
  }]));
  assert.equal(calls.length, 1);
  assert.equal(result.result.length, 1);
  assert.equal(result.result_info.count, 1);
  assert.equal(JSON.stringify(result).includes(TOKEN), false);
});

test('enable_web_analytics attaches a site and does not return its token', async () => {
  const { result, calls } = await analytics('enable_web_analytics', {
    account_id: ACCOUNT, project_name: PROJECT, site_tag: SITE,
  }, (req) => {
    if (req.method === 'GET' && req.endpoint.endsWith(`/pages/projects/${PROJECT}`)) return project();
    if (req.method === 'GET' && req.endpoint.endsWith(`/rum/site_info/${SITE}`)) return siteInfo();
    if (req.method === 'PATCH') return envelope({ build_config: { web_analytics_tag: SITE, web_analytics_token: TOKEN } });
    throw new Error(`${req.method} ${req.endpoint}`);
  });
  assert.deepEqual(calls.map((req) => `${req.method} ${req.endpoint}`), [
    `GET /accounts/${ACCOUNT}/pages/projects/${PROJECT}`,
    `GET /accounts/${ACCOUNT}/rum/site_info/${SITE}`,
    `PATCH /accounts/${ACCOUNT}/pages/projects/${PROJECT}`,
  ]);
  assert.deepEqual(calls[2].body, { build_config: { web_analytics_tag: SITE, web_analytics_token: TOKEN } });
  assert.equal(Object.keys(calls[2].body.build_config).length, 2);
  assert.equal(result.action, 'attached');
  assert.equal(result.site_tag, SITE);
  assert.equal(result.host, 'www.example.com');
  assert.equal(result.before_site_tag, null);
  assert.equal(result.applies_from, 'next deployment');
  assert.deepEqual(result.collateral_changes, []);
  const body = JSON.stringify(result);
  assert.equal(body.includes(TOKEN), false);
  assert.equal(body.includes(SNIPPET), false);
});

test('enable_web_analytics redacts a token echoed in the site host', async () => {
  const { result } = await analytics('enable_web_analytics', {
    account_id: ACCOUNT, project_name: PROJECT, site_tag: SITE,
  }, (req) => {
    if (req.method === 'GET' && req.endpoint.includes('/pages/projects/')) return project();
    if (req.method === 'GET' && req.endpoint.includes('/rum/site_info/')) return siteInfo({ host: TOKEN });
    if (req.method === 'PATCH') return envelope({ build_config: { web_analytics_tag: SITE } });
    throw new Error(`${req.method} ${req.endpoint}`);
  });
  assert.equal(result.action, 'attached');
  assert.equal(result.host, '[redacted]');
  assert.equal(JSON.stringify(result).includes(TOKEN), false);
  assert.equal(JSON.stringify(result).includes(SNIPPET), false);
});

test('enable_web_analytics creates a site for the pages.dev host', async () => {
  const { result, calls } = await analytics('enable_web_analytics', {
    account_id: ACCOUNT, project_name: PROJECT,
  }, (req) => {
    if (req.method === 'GET') return project();
    if (req.method === 'POST') return siteInfo({ host: 'wiser-site.pages.dev' });
    if (req.method === 'PATCH') return envelope({ build_config: { web_analytics_tag: SITE, web_analytics_token: TOKEN } });
    throw new Error(`${req.method} ${req.endpoint}`);
  });
  assert.deepEqual(calls.map((req) => req.method), ['GET', 'POST', 'PATCH']);
  assert.equal(calls[1].endpoint, `/accounts/${ACCOUNT}/rum/site_info`);
  assert.deepEqual(calls[1].body, { host: 'wiser-site.pages.dev', auto_install: false });
  assert.deepEqual(calls[2].body, { build_config: { web_analytics_tag: SITE, web_analytics_token: TOKEN } });
  assert.equal(result.action, 'created');
  assert.equal(result.host, 'wiser-site.pages.dev');
  assert.equal(result.site_tag, SITE);
  assert.equal(JSON.stringify(result).includes(TOKEN), false);
});

test('enable_web_analytics reports already_on for the same tag and for no tag, and writes nothing', async () => {
  const handler = (req) => {
    if (req.method !== 'GET') throw new Error(`write ${req.method}`);
    return project({ web_analytics_tag: SITE });
  };
  const same = await analytics('enable_web_analytics', {
    account_id: ACCOUNT, project_name: PROJECT, site_tag: SITE,
  }, handler);
  assert.equal(same.calls.length, 1);
  assert.equal(same.result.action, 'already_on');
  assert.equal(same.result.site_tag, SITE);
  assert.equal(same.result.before_site_tag, SITE);
  assert.deepEqual(same.result.collateral_changes, []);
  const omitted = await analytics('enable_web_analytics', {
    account_id: ACCOUNT, project_name: PROJECT,
  }, handler);
  assert.equal(omitted.calls.length, 1);
  assert.equal(omitted.result.action, 'already_on');
  assert.equal(omitted.calls[0].method, 'GET');
});

test('enable_web_analytics refuses a different site when analytics is already on', async () => {
  const { result, calls } = await analytics('enable_web_analytics', {
    account_id: ACCOUNT, project_name: PROJECT, site_tag: OTHER,
  }, (req) => {
    if (req.method !== 'GET') throw new Error(`write ${req.method}`);
    return project({ web_analytics_tag: SITE });
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'GET');
  assert.equal(result.status, 'invalid_arguments');
  assert.equal(result.field, 'site_tag');
  assert.equal(result.reason, 'project already sends to another Web Analytics site');
  assert.equal(result.current_site_tag, SITE);
});

test('enable_web_analytics refuses a missing site and does not patch', async () => {
  const { result, calls } = await analytics('enable_web_analytics', {
    account_id: ACCOUNT, project_name: PROJECT, site_tag: SITE,
  }, (req) => {
    if (req.method === 'GET' && req.endpoint.includes('/pages/projects/')) return project();
    if (req.method === 'GET') {
      const err = new Error('missing');
      err.object = { status: 'vendor_error', http_status: 404, endpoint: req.endpoint, method: 'GET' };
      throw err;
    }
    throw new Error(`unexpected ${req.method}`);
  });
  assert.equal(calls.length, 2);
  assert.equal(calls.some((req) => req.method === 'PATCH'), false);
  assert.equal(result.status, 'invalid_arguments');
  assert.equal(result.field, 'site_tag');
  assert.equal(result.reason, 'no such Web Analytics site');
});

test('enable_web_analytics reports analytics not applied, and names a site it created', async () => {
  const missed = await analytics('enable_web_analytics', {
    account_id: ACCOUNT, project_name: PROJECT, site_tag: SITE,
  }, (req) => {
    if (req.method === 'GET' && req.endpoint.includes('/pages/projects/')) return project();
    if (req.method === 'GET') return siteInfo();
    return envelope({ build_config: {} });
  });
  assert.equal(missed.result.status, 'vendor_error');
  assert.equal(missed.result.method, 'PATCH');
  assert.equal(missed.result.reason, 'analytics not applied');
  assert.equal(Object.hasOwn(missed.result, 'created_site_tag'), false);
  assert.equal(JSON.stringify(missed.result).includes(TOKEN), false);
  const created = await analytics('enable_web_analytics', {
    account_id: ACCOUNT, project_name: PROJECT,
  }, (req) => {
    if (req.method === 'GET') return project();
    if (req.method === 'POST') return siteInfo();
    return envelope({ build_config: { web_analytics_token: TOKEN } });
  });
  assert.equal(created.result.reason, 'analytics not applied');
  assert.equal(created.result.created_site_tag, SITE);
  assert.equal(JSON.stringify(created.result).includes(TOKEN), false);
  assert.equal(created.calls.some((req) => req.method === 'DELETE'), false);
});

test('enable_web_analytics names a site it created when the PATCH is refused, and rethrows on attach', async () => {
  const refusePatch = (req) => {
    const err = new Error('refused');
    err.object = { status: 'vendor_error', http_status: 403, endpoint: req.endpoint, method: 'PATCH' };
    throw err;
  };
  const created = await analytics('enable_web_analytics', {
    account_id: ACCOUNT, project_name: PROJECT,
  }, (req) => {
    if (req.method === 'GET') return project();
    if (req.method === 'POST') return siteInfo();
    return refusePatch(req);
  });
  assert.equal(created.result.status, 'vendor_error');
  assert.equal(created.result.method, 'PATCH');
  assert.equal(created.result.http_status, 403);
  assert.equal(created.result.reason, 'analytics not applied');
  assert.equal(created.result.created_site_tag, SITE);
  assert.equal(JSON.stringify(created.result).includes(TOKEN), false);
  await assert.rejects(analytics('enable_web_analytics', {
    account_id: ACCOUNT, project_name: PROJECT, site_tag: SITE,
  }, (req) => {
    if (req.method === 'GET' && req.endpoint.includes('/pages/projects/')) return project();
    if (req.method === 'GET') return siteInfo();
    return refusePatch(req);
  }), /refused/);
});

test('enable_web_analytics reports a changed build_command as collateral', async () => {
  const { result } = await analytics('enable_web_analytics', {
    account_id: ACCOUNT, project_name: PROJECT, site_tag: SITE,
  }, (req) => {
    if (req.method === 'GET' && req.endpoint.includes('/pages/projects/')) {
      return project({ build_command: 'astro build' }, { deployment_configs: { production: { fail_open: true } } });
    }
    if (req.method === 'GET') return siteInfo();
    return envelope({
      build_config: { web_analytics_tag: SITE, web_analytics_token: TOKEN, build_command: 'next build' },
      deployment_configs: { production: { fail_open: true } },
    });
  });
  assert.equal(result.action, 'attached');
  assert.deepEqual(result.collateral_changes, ['build_config.build_command']);
  assert.equal(JSON.stringify(result).includes('next build'), false);
  assert.equal(JSON.stringify(result).includes(TOKEN), false);
});

test('a malformed site_tag is refused by the module and by the gateway schema', async () => {
  const { result, calls } = await analytics('enable_web_analytics', {
    account_id: ACCOUNT, project_name: PROJECT, site_tag: 'not-a-tag',
  }, () => {
    throw new Error('should not be called');
  });
  assert.equal(calls.length, 0);
  assert.equal(result.status, 'invalid_arguments');
  assert.equal(result.field, 'site_tag');
  const { gw, fake } = await granted();
  const seen = [];
  fake.auth.proxy = async (req) => {
    seen.push(req);
    return envelope({});
  };
  const stopped = await gw.execute({
    action: 'cloudflare.pages.enable_web_analytics',
    input: { account_id: ACCOUNT, project_name: PROJECT, site_tag: 'not-a-tag' },
  });
  assert.equal(stopped.status, 'invalid_arguments');
  assert.equal(stopped.field, 'site_tag');
  assert.equal(seen.length, 0);
});

test('delete_web_analytics_site refuses a tag named by a project on page 2 and does not delete', async () => {
  const { result, calls } = await analytics('delete_web_analytics_site', {
    account_id: ACCOUNT, site_tag: SITE,
  }, (req) => {
    if (req.method === 'DELETE') throw new Error('deleted');
    if (req.endpoint.includes('/rum/site_info/')) {
      return envelope({
        site_tag: SITE, site_token: TOKEN, snippet: SNIPPET, host: 'www.example.com',
        ruleset: { zone_name: 'example.com' },
      });
    }
    const page = new URL(req.endpoint, 'https://api.cloudflare.com').searchParams.get('page');
    if (page === '1') {
      return envelope(
        [{ name: 'other', build_config: {} }],
        { result_info: { total_pages: 2 } },
      );
    }
    return envelope(
      [{ name: 'live-site', build_config: { web_analytics_tag: SITE } }],
      { result_info: { total_pages: 2 } },
    );
  });
  assert.deepEqual(calls.map((req) => req.endpoint), [
    `/accounts/${ACCOUNT}/rum/site_info/${SITE}`,
    `/accounts/${ACCOUNT}/pages/projects?page=1&per_page=10`,
    `/accounts/${ACCOUNT}/pages/projects?page=2&per_page=10`,
  ]);
  assert.equal(calls.some((req) => req.method === 'DELETE'), false);
  assert.equal(result.status, 'invalid_arguments');
  assert.equal(result.field, 'site_tag');
  assert.equal(result.reason, 'in use by a Pages project');
  assert.deepEqual(result.projects, ['live-site']);
});

test('delete_web_analytics_site deletes a site no project names', async () => {
  const { result, calls } = await analytics('delete_web_analytics_site', {
    account_id: ACCOUNT, site_tag: SITE,
  }, (req) => {
    if (req.method === 'DELETE') return envelope({ site_tag: SITE });
    if (req.endpoint.includes('/rum/site_info/')) {
      return envelope({
        site_tag: SITE, site_token: TOKEN, snippet: SNIPPET, host: 'www.example.com',
        ruleset: { zone_name: 'example.com', enabled: true },
      });
    }
    return envelope([{ name: 'other', build_config: { web_analytics_tag: OTHER } }], { result_info: { total_pages: 1 } });
  });
  assert.equal(calls.filter((req) => req.method === 'DELETE').length, 1);
  assert.equal(calls.find((req) => req.method === 'DELETE').endpoint, `/accounts/${ACCOUNT}/rum/site_info/${SITE}`);
  assert.deepEqual(result, { success: true, deleted: SITE, host: 'www.example.com', zone_name: 'example.com' });
  assert.equal(JSON.stringify(result).includes(TOKEN), false);
  assert.equal(JSON.stringify(result).includes(SNIPPET), false);
});

test('delete_web_analytics_site refuses an unknown site', async () => {
  const { result, calls } = await analytics('delete_web_analytics_site', {
    account_id: ACCOUNT, site_tag: SITE,
  }, (req) => {
    const err = new Error('missing');
    err.object = { status: 'vendor_error', http_status: 404, endpoint: req.endpoint, method: 'GET' };
    throw err;
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'GET');
  assert.equal(result.status, 'invalid_arguments');
  assert.equal(result.field, 'site_tag');
  assert.equal(result.reason, 'no such Web Analytics site');
});

test('delete_web_analytics_site returns vendor_error when the project list fails and does not delete', async () => {
  const { result, calls } = await analytics('delete_web_analytics_site', {
    account_id: ACCOUNT, site_tag: SITE,
  }, (req) => {
    if (req.method === 'DELETE') throw new Error('deleted');
    if (req.endpoint.includes('/rum/site_info/')) return envelope({ site_tag: SITE, host: 'www.example.com', site_token: TOKEN });
    return { status: 200, data: { success: false, result: [], errors: [{}], messages: [] }, headers: {} };
  });
  assert.equal(calls.some((req) => req.method === 'DELETE'), false);
  assert.equal(result.status, 'vendor_error');
  assert.equal(result.method, 'GET');
  assert.match(result.endpoint, /\/pages\/projects\?page=1&per_page=10$/);
});

test('web analytics confirmation matches the manifest', async () => {
  const manifest = JSON.parse(readFileSync(fileURLToPath(new URL('../manifest.json', import.meta.url)), 'utf8'));
  const actions = manifest.modules.pages.actions;
  assert.equal(actions.enable_web_analytics.confirmation, 'always');
  assert.equal(actions.enable_web_analytics.risk, 'high');
  assert.equal(actions.delete_web_analytics_site.confirmation, 'always');
  assert.equal(actions.delete_web_analytics_site.risk, 'high');
  assert.equal(actions.list_web_analytics_sites.confirmation, 'none');
  assert.equal(actions.list_web_analytics_sites.risk, 'low');
  assert.equal(actions.list_web_analytics_sites.execution.prefer, 'proxy');
  const { gw, fake } = await granted();
  const calls = [];
  fake.auth.proxy = async (req) => {
    calls.push(req);
    return envelope([]);
  };
  const enable = await gw.execute({
    action: 'cloudflare.pages.enable_web_analytics',
    input: { account_id: ACCOUNT, project_name: PROJECT },
  });
  const remove = await gw.execute({
    action: 'cloudflare.pages.delete_web_analytics_site',
    input: { account_id: ACCOUNT, site_tag: SITE },
  });
  assert.equal(enable.status, 'needs_confirmation');
  assert.equal(remove.status, 'needs_confirmation');
  assert.equal(calls.length, 0);
  const listed = await gw.execute({
    action: 'cloudflare.pages.list_web_analytics_sites',
    input: { account_id: ACCOUNT },
  });
  assert.notEqual(listed.status, 'needs_confirmation');
  assert.equal(listed.success, true);
  assert.equal(calls.length, 1);
});
