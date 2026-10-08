import { confirmCall } from '../../../gateway/test/fake-provider.js';
import { createHash } from 'node:crypto';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
const LIST_PATH = fileURLToPath(new URL('../kit-function.json', import.meta.url));
const WORKER_PATH = fileURLToPath(new URL('../../../skills/Site Author/kit/src/function/_worker.js', import.meta.url));
const WORKER = readFileSync(WORKER_PATH);
const WORKER_SHA = '93f432539b4a6a30f2ad5061e7081ee33f0ecd935049dc2b6e236fa3ff121f06';
const BUILD_TIME = '2026-10-08T15:04:05.000Z';

function sha(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function makeSchedule(extra = 0, header = { v: 1, marker: 'KITFN-SCHEDULE-MARKER-9f3a' }) {
  const head = Buffer.from(JSON.stringify(header), 'utf8');
  const out = Buffer.alloc(8 + head.length + extra);
  out.write('WKS1', 0, 4, 'latin1');
  out.writeUInt32BE(head.length, 4);
  head.copy(out, 8);
  return out;
}

function validPayload({
  worker = WORKER,
  routes,
  schedule,
  kitVersion = '0.5.0',
  buildTime = BUILD_TIME,
  carried = ['/articles/kitfn-due'],
  notCarried = ['/articles/kitfn-later'],
  recordOverrides = {},
} = {}) {
  const routeBytes = routes || Buffer.from(`${JSON.stringify({
    version: 1,
    include: ['/articles/kitfn-due*'],
    exclude: ['/pagefind/*'],
  })}\n`, 'utf8');
  const scheduleBytes = schedule || makeSchedule();
  const record = {
    kitVersion,
    buildTime,
    worker: sha(worker),
    routes: sha(routeBytes),
    schedule: sha(scheduleBytes),
    carried,
    notCarried,
    paths: 4,
    ...recordOverrides,
  };
  return {
    worker,
    routes: routeBytes,
    schedule: scheduleBytes,
    record: Buffer.from(`${JSON.stringify(record)}\n`, 'utf8'),
    carried,
    notCarried,
  };
}

function makeSite({
  payload = null,
  kitVersion = '0.5.0',
  buildTime = BUILD_TIME,
  omitBuild = false,
  distFiles = { 'index.html': '<h1>Hi</h1>\n', 'css/app.css': 'body{color:red}\n', '_routes.json': '{"decoy":true}\n' },
  functionFiles = null,
} = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'kit-fn-')));
  const site = join(root, 'site');
  const dist = join(site, 'dist');
  mkdirSync(dist, { recursive: true });
  writeFileSync(join(site, 'kit.json'), `${JSON.stringify({ kitVersion, domain: 'example.com' })}\n`);
  if (!omitBuild) {
    mkdirSync(join(site, '.astro'));
    writeFileSync(join(site, '.astro', 'kit-build.json'), `${JSON.stringify({ buildTime })}\n`);
  }
  for (const [rel, content] of Object.entries(distFiles)) {
    const path = join(dist, ...rel.split('/'));
    mkdirSync(dirnameOf(path), { recursive: true });
    writeFileSync(path, content);
  }
  const files = functionFiles || (payload && {
    '_worker.js': payload.worker,
    '_routes.json': payload.routes,
    'schedule.bin': payload.schedule,
    'function.json': payload.record,
  });
  if (files) {
    const fnDir = join(site, 'dist-function');
    mkdirSync(fnDir);
    for (const [name, content] of Object.entries(files)) writeFileSync(join(fnDir, name), content);
  }
  return {
    root,
    site,
    dist,
    payload,
    cleanup() { rmSync(root, { recursive: true, force: true }); },
  };
}

function dirnameOf(path) {
  return path.slice(0, path.lastIndexOf('/'));
}

function plant(opts = {}) {
  const payload = validPayload(opts);
  return makeSite({
    payload,
    kitVersion: opts.kitVersionOnDisk ?? '0.5.0',
    buildTime: opts.buildTimeOnDisk ?? opts.buildTime ?? BUILD_TIME,
    omitBuild: opts.omitBuild,
    distFiles: opts.distFiles,
    functionFiles: opts.functionFiles,
  });
}

async function pagesGateway(proxy) {
  const { gw, store, fake } = await createTestGateway({ connectorDirs: [CONNECTORS] });
  await putActive(store, fake, { service: 'cloudflare', module: 'pages' });
  const calls = [];
  fake.auth.proxy = proxy(calls);
  return { gw, calls };
}

function deployProxy(calls, { onCheck } = {}) {
  return async (request) => {
    calls.push(request);
    const ok = (result) => ({ status: 200, data: { success: true, result, errors: [], messages: [] }, headers: {} });
    if (request.method === 'GET' && request.endpoint.endsWith('/upload-token')) return ok({ jwt: 'kit-fn-jwt' });
    if (request.endpoint === '/pages/assets/check-missing') {
      if (onCheck) onCheck();
      return ok(request.body.hashes);
    }
    if (request.endpoint === '/pages/assets/upload' || request.endpoint === '/pages/assets/upsert-hashes') return ok(null);
    if (request.method === 'POST' && request.endpoint.endsWith('/deployments')) {
      return ok({ id: 'dep-fn', url: 'https://kit-site.pages.dev', environment: 'production' });
    }
    return ok(null);
  };
}

async function deploy(tree, proxyOpts) {
  const { gw, calls } = await pagesGateway((recorded) => deployProxy(recorded, proxyOpts));
  const result = await confirmCall(gw, {
    action: 'cloudflare.pages.deploy',
    input: { account_id: 'acct-1', project_name: 'kit-site', dir: tree.dist },
    confirm: true,
  });
  return { result, calls };
}

function formParts(binary) {
  const boundary = binary.content_type.split('boundary=')[1];
  const raw = Buffer.from(binary.base64, 'base64').toString('latin1');
  const parts = [];
  for (const piece of raw.split(`--${boundary}`)) {
    const part = piece.replace(/^\r\n/, '');
    if (part === '' || part === '--\r\n' || part === '--') continue;
    const splitAt = part.indexOf('\r\n\r\n');
    if (splitAt < 0) continue;
    const head = part.slice(0, splitAt);
    let valueLatin = part.slice(splitAt + 4);
    if (valueLatin.endsWith('\r\n')) valueLatin = valueLatin.slice(0, -2);
    parts.push({
      name: /name="([^"]*)"/.exec(head)?.[1],
      filename: /filename="([^"]*)"/.exec(head)?.[1],
      contentType: /Content-Type: ([^\r\n]+)/i.exec(head)?.[1],
      value: Buffer.from(valueLatin, 'latin1'),
      head,
    });
  }
  return parts;
}

function deployments(calls) {
  return calls.filter((call) => call.method === 'POST' && call.endpoint.endsWith('/deployments'));
}

describe('kit function on pages.deploy', { concurrency: false }, () => {
  test('the shipped kit Function is a listed fingerprint', () => {
    const list = JSON.parse(readFileSync(LIST_PATH, 'utf8'));
    const hash = sha(readFileSync(WORKER_PATH));
    assert.equal(hash, WORKER_SHA);
    assert.ok(list.fingerprints.some((entry) => entry.sha256 === hash && entry.kitVersion === '0.5.0'));
  });

  test('a kit deploy with no dist-function reports function null and sends no bundle', async () => {
    const tree = makeSite();
    try {
      const { result, calls } = await deploy(tree);
      assert.equal(result.function, null);
      assert.equal(result.deployment.id, 'dep-fn');
      const posted = deployments(calls);
      assert.equal(posted.length, 1);
      const names = formParts(posted[0].binary_body).map((part) => part.name);
      assert.deepEqual(names, ['manifest']);
    } finally {
      tree.cleanup();
    }
  });

  test('a kit deploy carries the fingerprinted Function and none of its bytes as an asset', async () => {
    const tree = plant();
    try {
      const { result, calls } = await deploy(tree);
      assert.equal(result.deployment.id, 'dep-fn');
      assert.equal(result.files, 2);
      assert.deepEqual(result.function, {
        kit_version: '0.5.0',
        worker_sha256: WORKER_SHA,
        schedule_bytes: tree.payload.schedule.length,
        routes: { include: 1, exclude: 1 },
        carried: ['/articles/kitfn-due'],
        not_carried: ['/articles/kitfn-later'],
      });
      assert.equal(JSON.stringify(result).includes('kit-fn-jwt'), false);
      assert.ok(result.skipped.some((item) => item.file === '_routes.json' && item.reason === 'not an asset'));
      const posted = deployments(calls);
      assert.equal(posted.length, 1);
      const parts = formParts(posted[0].binary_body);
      assert.deepEqual(parts.map((part) => part.name), ['manifest', '_worker.bundle', '_routes.json']);
      assert.equal(parts.some((part) => part.name === 'functions-filepath-routing-config.json'), false);
      const bundlePart = parts.find((part) => part.name === '_worker.bundle');
      assert.equal(bundlePart.filename, '_worker.bundle');
      assert.equal(bundlePart.contentType, 'application/octet-stream');
      const bundle = formParts({ content_type: `multipart/form-data; boundary=${bundleBoundary(bundlePart.value)}`, base64: bundlePart.value.toString('base64') });
      assert.deepEqual(bundle.map((part) => part.name), ['metadata', '_worker.js', 'schedule.bin']);
      const metadata = JSON.parse(bundle[0].value.toString('utf8'));
      assert.deepEqual(metadata, { main_module: '_worker.js' });
      assert.equal(Object.hasOwn(metadata, 'bindings'), false);
      assert.equal(bundle[0].filename, undefined);
      assert.equal(bundle[1].filename, '_worker.js');
      assert.equal(bundle[1].contentType, 'application/javascript+module');
      assert.ok(bundle[1].value.equals(tree.payload.worker));
      assert.equal(bundle[2].filename, 'schedule.bin');
      assert.equal(bundle[2].contentType, 'application/octet-stream');
      assert.ok(bundle[2].value.equals(tree.payload.schedule));
      const routesPart = parts.find((part) => part.name === '_routes.json');
      assert.equal(routesPart.filename, '_routes.json');
      assert.ok(routesPart.value.equals(tree.payload.routes));
      assert.equal(routesPart.value.includes(Buffer.from('decoy')), false);
      const manifest = JSON.parse(parts[0].value.toString('utf8'));
      assert.deepEqual(Object.keys(manifest).sort(), ['/css/app.css', '/index.html']);
      const forbidden = [tree.payload.worker, tree.payload.routes, tree.payload.schedule, tree.payload.record];
      for (const bytes of forbidden) assert.equal(parts[0].value.includes(bytes), false, 'manifest carries a Function file');
      const uploads = calls.filter((call) => call.endpoint === '/pages/assets/upload');
      assert.ok(uploads.length >= 1);
      for (const upload of uploads) {
        for (const item of upload.body) {
          const raw = Buffer.from(item.value, 'base64');
          for (const bytes of forbidden) assert.equal(raw.includes(bytes), false);
        }
      }
    } finally {
      tree.cleanup();
    }
  });

  test('an unlisted fingerprint refuses before any call', async () => {
    const tree = plant({ worker: Buffer.from('export default { scheduled: false }\n', 'utf8') });
    try {
      const { result, calls } = await deploy(tree);
      assert.equal(result.status, 'invalid_arguments');
      assert.equal(result.field, 'dir');
      assert.equal(result.reason, 'unlisted fingerprint');
      assert.equal(calls.length, 0);
    } finally {
      tree.cleanup();
    }
  });

  test('a fifth file, a hidden file, a folder, or a link refuses before any call and names the entry', async () => {
    const cases = [
      ['fifth', (tree) => writeFileSync(join(tree.site, 'dist-function', 'note.txt'), 'x\n'), 'unexpected entry: note.txt'],
      ['hidden', (tree) => writeFileSync(join(tree.site, 'dist-function', '.hidden'), 'x\n'), 'unexpected entry: .hidden'],
      ['folder', (tree) => mkdirSync(join(tree.site, 'dist-function', 'extra')), 'not a regular file: extra'],
      ['link', (tree) => {
        const real = join(tree.root, 'linked-routes.json');
        renameSync(join(tree.site, 'dist-function', '_routes.json'), real);
        symlinkSync(real, join(tree.site, 'dist-function', '_routes.json'));
      }, 'symbolic link: _routes.json'],
    ];
    for (const [label, mutate, reason] of cases) {
      const tree = plant();
      try {
        mutate(tree);
        const { result, calls } = await deploy(tree);
        assert.equal(result.status, 'invalid_arguments', label);
        assert.equal(result.field, 'dir', label);
        assert.equal(result.reason, reason, label);
        assert.equal(calls.length, 0, label);
      } finally {
        tree.cleanup();
      }
    }
  });

  test('a symbolic link in place of dist-function refuses before any call', async () => {
    const tree = plant();
    try {
      const real = join(tree.root, 'elsewhere');
      renameSync(join(tree.site, 'dist-function'), real);
      symlinkSync(real, join(tree.site, 'dist-function'));
      const { result, calls } = await deploy(tree);
      assert.equal(result.status, 'invalid_arguments');
      assert.equal(result.field, 'dir');
      assert.equal(result.reason, 'dist-function is a symbolic link');
      assert.equal(calls.length, 0);
    } finally {
      tree.cleanup();
    }
  });

  test('a mismatched hash in function.json refuses before any call', async () => {
    const tree = plant({ recordOverrides: { worker: '0'.repeat(64) } });
    try {
      const { result, calls } = await deploy(tree);
      assert.equal(result.reason, 'function.json hash mismatch: worker');
      assert.equal(calls.length, 0);
    } finally {
      tree.cleanup();
    }
  });

  test('a kitVersion mismatch refuses before any call', async () => {
    const tree = plant({ kitVersionOnDisk: '0.4.3' });
    try {
      const { result, calls } = await deploy(tree);
      assert.equal(result.reason, 'kitVersion mismatch');
      assert.equal(calls.length, 0);
    } finally {
      tree.cleanup();
    }
  });

  test('a buildTime mismatch refuses before any call', async () => {
    const tree = plant({ buildTimeOnDisk: '2026-10-01T00:00:00.000Z' });
    try {
      const { result, calls } = await deploy(tree);
      assert.equal(result.reason, 'buildTime mismatch');
      assert.equal(calls.length, 0);
    } finally {
      tree.cleanup();
    }
  });

  test('a missing build record refuses before any call', async () => {
    const tree = plant({ omitBuild: true });
    try {
      const { result, calls } = await deploy(tree);
      assert.equal(result.reason, 'missing build record');
      assert.equal(calls.length, 0);
    } finally {
      tree.cleanup();
    }
  });

  test('malformed routes, too many rules, and a 101-character rule refuse before any call', async () => {
    const long = `/${'a'.repeat(100)}`;
    assert.equal([...long].length, 101);
    const cases = [
      [Buffer.from('not-json', 'utf8'), '_routes.json is not JSON'],
      [Buffer.from(JSON.stringify({ version: 1, include: ['/a'], exclude: [], extra: true }), 'utf8'), '_routes.json has an unexpected key: extra'],
      [Buffer.from(JSON.stringify({ version: 1, include: Array.from({ length: 101 }, (_, i) => `/p${i}`), exclude: [] }), 'utf8'), '_routes.json has more than 100 rules'],
      [Buffer.from(JSON.stringify({ version: 1, include: [long], exclude: [] }), 'utf8'), '_routes.json rule is longer than 100 characters'],
    ];
    for (const [routes, reason] of cases) {
      const tree = plant({ routes });
      try {
        const { result, calls } = await deploy(tree);
        assert.equal(result.reason, reason);
        assert.equal(calls.length, 0);
      } finally {
        tree.cleanup();
      }
    }
  });

  test('a schedule.bin without WKS1 refuses before any call', async () => {
    const tree = plant({ schedule: Buffer.from('not a schedule', 'utf8') });
    try {
      const { result, calls } = await deploy(tree);
      assert.equal(result.reason, 'schedule.bin does not start with WKS1');
      assert.equal(calls.length, 0);
    } finally {
      tree.cleanup();
    }
  });

  test('an oversize deployment refuses before any call and names how many pages were carried', async () => {
    const tree = plant({
      schedule: makeSchedule(1_800_000),
      carried: ['/articles/one', '/articles/two'],
      distFiles: { 'index.html': '<h1>Hi</h1>\n', '_headers': 'h'.repeat(800_000) },
    });
    try {
      const { result, calls } = await deploy(tree);
      assert.equal(result.status, 'invalid_arguments');
      assert.equal(result.field, 'dir');
      assert.equal(result.reason, 'deployment request over the 3 MiB limit; the kit Function carries 2 scheduled instants');
      assert.equal(result.scheduled_instants, 2);
      assert.equal(typeof result.bytes, 'number');
      assert.ok(result.bytes > 3 * 1024 * 1024);
      assert.match(result.fallback, /wrangler pages deploy/);
      assert.equal(calls.length, 0);
    } finally {
      tree.cleanup();
    }
  });

  test('a bundle over 2 MiB refuses before any call', async () => {
    const tree = plant({ schedule: makeSchedule(2_200_000) });
    try {
      const { result, calls } = await deploy(tree);
      assert.equal(result.reason, 'bundle over 2 MiB');
      assert.equal(calls.length, 0);
    } finally {
      tree.cleanup();
    }
  });

  test('a function file changed between read and post makes no deployment call', async () => {
    const tree = plant();
    try {
      const { result, calls } = await deploy(tree, {
        onCheck() {
          writeFileSync(join(tree.site, 'dist-function', '_worker.js'), 'changed\n');
        },
      });
      assert.equal(result.status, 'invalid_arguments');
      assert.equal(result.reason, 'file changed during deploy: _worker.js');
      assert.equal(deployments(calls).length, 0);
    } finally {
      tree.cleanup();
    }
  });

  test('a missing or malformed kit-function.json refuses the kit Function and says so', async () => {
    const saved = readFileSync(LIST_PATH);
    try {
      rmSync(LIST_PATH);
      const missing = plant();
      try {
        const { result, calls } = await deploy(missing);
        assert.equal(result.reason, 'kit-function.json is missing; refusing the kit Function');
        assert.equal(calls.length, 0);
      } finally {
        missing.cleanup();
      }
      const plain = makeSite();
      try {
        const { result, calls } = await deploy(plain);
        assert.equal(result.function, null);
        assert.equal(result.deployment.id, 'dep-fn');
        assert.equal(deployments(calls).length, 1);
      } finally {
        plain.cleanup();
      }
      writeFileSync(LIST_PATH, '{"fingerprints":[]}\n');
      const malformed = plant();
      try {
        const { result, calls } = await deploy(malformed);
        assert.equal(result.reason, 'kit-function.json is malformed; refusing the kit Function');
        assert.equal(calls.length, 0);
      } finally {
        malformed.cleanup();
      }
    } finally {
      writeFileSync(LIST_PATH, saved);
    }
  });
});

function bundleBoundary(bytes) {
  const line = bytes.toString('latin1').split('\r\n', 1)[0];
  assert.ok(line.startsWith('--'));
  return line.slice(2);
}
