import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import fs from 'node:fs';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { join, dirname } from 'node:path';
import { fixture } from './fixtures.js';

async function browserFixture(t, { rootName = 'browsers', inside = 'platform/browser' } = {}) {
  const f = fixture(t);
  const browsers = join(f.root, rootName);
  fs.mkdirSync(browsers);
  process.env.PLAYWRIGHT_BROWSERS_PATH = browsers;
  // fixture restores the complete environment, including any caller's GC setting.
  delete process.env.PLAYWRIGHT_SKIP_BROWSER_GC;
  const packageDir = join(f.runtime, 'node_modules/playwright');
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(join(packageDir, 'package.json'), JSON.stringify({ version: '1.62.0', main: 'index.js' }));
  fs.writeFileSync(join(packageDir, 'index.js'), `
const fs = require('node:fs'), path = require('node:path');
const root = ${JSON.stringify(browsers)};
const state = { calls: [], failures: {}, hang: false, pageHang: false, closeHang: false, pageFailure: null, closed: 0 };
const own = headless => path.join(root, (headless ? 'chromium_headless_shell' : 'chromium') + '-1234', ${JSON.stringify(inside)});
async function start(method, options) {
  state.calls.push({ method, options });
  const binary = options.executablePath || own(options.channel ? false : options.headless !== false);
  state.beforeLaunch?.(binary);
  if (state.failures[binary]) throw new Error(state.failures[binary]);
  if (!fs.existsSync(binary)) throw new Error("browserType." + method + ": Executable doesn't exist at " + binary);
  if (state.hang) return new Promise(() => {});
  return { newPage: async () => {
    if (state.pageFailure) throw new Error(state.pageFailure);
    if (state.pageHang) return new Promise(() => {});
    return { goto: async () => {}, close: async () => {} };
  },
  close: async () => { state.closed++; if (state.closeHang) return new Promise(() => {}); } };
}
module.exports = { state, chromium: {
  executablePath: () => own(false),
  launch: options => start('launch', options),
  launchPersistentContext: (profile, options) => start('launchPersistentContext', options)
} };
`);
  const runtime = await f.import('browser-runtime/browser-runtime.js');
  const loaded = await runtime.loadPlaywright();
  const state = (loaded.default || loaded).state;
  function build(revision, { artifact = 'chromium_headless_shell', complete = true, executable = true, directory = false } = {}) {
    const dir = join(browsers, `${artifact}-${revision}`), binary = join(dir, inside);
    fs.mkdirSync(dirname(binary), { recursive: true });
    if (directory) fs.mkdirSync(binary);
    else fs.writeFileSync(binary, '#!/bin/sh\nexit 0\n', { mode: executable ? 0o755 : 0o644 });
    if (complete) fs.writeFileSync(join(dir, 'INSTALLATION_COMPLETE'), '');
    return binary;
  }
  return { ...f, browsers, runtime, state, build,
    wanted: join(browsers, 'chromium_headless_shell-1234', inside) };
}

function watchScan(f) {
  const original = fs.readdirSync;
  return mock.method(fs, 'readdirSync', (path, ...args) => {
    assert.notEqual(path, f.browsers, 'a present or caller-selected build must not scan siblings');
    return original(path, ...args);
  });
}

test('own build present: no substitute lookup or report, and launch options are preserved', async t => {
  const f = await browserFixture(t);
  f.build(1234); f.build(1243);
  const scan = watchScan(f);
  syncBuiltinESMExports();
  try {
    const report = await f.runtime.check({ args: ['--fixture'], proxy: { server: 'http://fixture' } });
    assert.equal(report.chromiumLaunch, true);
    assert.equal(report.preinstalledBuild, undefined);
    assert.equal(f.state.calls.length, 1);
    const options = f.state.calls[0].options;
    assert.equal(options.executablePath, undefined);
    assert.deepEqual(options.args, ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--fixture']);
    assert.deepEqual(options.proxy, { server: 'http://fixture' });
    assert.equal(options.timeout, 180000);
  } finally { scan.mock.restore(); syncBuiltinESMExports(); }
});

test('absent own build uses a complete sibling, reports it, and both real launch methods reuse it', async t => {
  const f = await browserFixture(t), binary = f.build(1243);
  const before = fs.readdirSync(f.browsers);
  const report = await f.runtime.check();
  assert.equal(report.chromiumLaunch, true);
  assert.equal(report.failure, null);
  assert.equal(report.remediation, null);
  assert.deepEqual(report.preinstalledBuild, { path: binary, revision: 1243, wanted: 1234 });
  assert.equal(report.chromiumBinary, true, 'preparation inspected the substitute');
  const scan = watchScan(f);
  syncBuiltinESMExports();
  try {
    await (await f.runtime.launch()).close();
    await (await f.runtime.launchPersistentContext(join(f.root, 'profile'))).close();
  } finally { scan.mock.restore(); syncBuiltinESMExports(); }
  assert.deepEqual(f.state.calls.map(c => c.options.executablePath), [undefined, binary, binary, binary]);
  assert.deepEqual(fs.readdirSync(f.browsers), before);
  assert.equal(fs.existsSync(f.wanted), false);
  assert.equal(process.env.PLAYWRIGHT_BROWSERS_PATH, f.browsers);
});

for (const [label, properties] of [
  ['missing completion marker', { complete: false }],
  ['lost execute bit', { executable: false }],
  ['directory instead of executable', { directory: true }],
  ['different artifact', { artifact: 'chromium' }]
]) test(`ignores sibling with ${label}`, async t => {
  const f = await browserFixture(t);
  f.build(1243, properties);
  const report = await f.runtime.check();
  assert.equal(report.chromiumLaunch, false);
  assert.equal(report.failure, 'artifact');
  assert.equal(report.preinstalledBuild, undefined);
  assert.equal(f.state.calls.length, 1);
  assert.doesNotMatch(report.remediation, /was tried/);
});

test('highest numeric complete revision wins; incomplete newer siblings and other artifacts do not', async t => {
  const f = await browserFixture(t);
  f.build(999); f.build(1242);
  const binary = f.build(1243);
  f.build(1244, { complete: false }); f.build(2000, { artifact: 'chromium' });
  const report = await f.runtime.check();
  assert.deepEqual(report.preinstalledBuild, { path: binary, revision: 1243, wanted: 1234 });
  assert.equal(f.state.calls.length, 2);
});

test('a complete older revision is eligible too', async t => {
  const f = await browserFixture(t), binary = f.build(1233);
  assert.equal((await f.runtime.check()).preinstalledBuild.path, binary);
});

for (const error of ['an unfamiliar launch failure', 'Target page, context or browser has been closed', 'spawn BINARY ENOEXEC']) {
test(`failed substitute keeps original artifact verdict: ${error}`, async t => {
  const f = await browserFixture(t);
  const original = await f.runtime.check();
  f.build(1242);
  const binary = f.build(1243);
  f.state.calls.length = 0;
  const line = error.replace('BINARY', binary);
  f.state.failures[binary] = `${line}\nprivate second line`;
  const report = await f.runtime.check();
  assert.equal(report.chromiumLaunch, false);
  assert.equal(report.failure, original.failure);
  assert.ok(report.remediation.startsWith(original.remediation));
  assert.ok(report.remediation.includes(binary));
  assert.ok(report.remediation.includes(line));
  assert.doesNotMatch(report.remediation, /private second line/);
  assert.equal(report.preinstalledBuild, undefined);
  assert.equal(f.state.calls.length, 2, 'never try a second candidate');
});
}

for (const options of [{ executablePath: '/caller/browser' }, { channel: 'chrome' }]) {
  test(`caller ${Object.keys(options)[0]} prevents substitution even after another shape was cached`, async t => {
    const f = await browserFixture(t);
    f.build(1243);
    assert.equal((await f.runtime.check()).chromiumLaunch, true);
    f.state.calls.length = 0;
    const scan = watchScan(f);
    syncBuiltinESMExports();
    try { assert.equal((await f.runtime.check(options)).chromiumLaunch, false); }
    finally { scan.mock.restore(); syncBuiltinESMExports(); }
    assert.equal(f.state.calls.length, 1);
    assert.equal(f.state.calls[0].options.executablePath, options.executablePath);
  });
}

for (const channel of ['chromium', 'chrome-for-testing']) {
  test(`restart preflight channel ${channel} uses chromium, isolated from a cached headless shell`, async t => {
    const f = await browserFixture(t);
    const shell = f.build(1243), chrome = f.build(1243, { artifact: 'chromium' });
    assert.equal((await f.runtime.check()).preinstalledBuild.path, shell);
    f.state.calls.length = 0;
    await (await f.runtime.launchPersistentContext(join(f.root, 'replacement-profile'), { headless: true, channel })).close();
    assert.deepEqual(f.state.calls.map(c => c.options.executablePath), [undefined, chrome]);
    f.state.calls.length = 0;
    // A headful launch resolves the same artifact and can reuse that selection.
    await (await f.runtime.launch({ headless: false })).close();
    await (await f.runtime.launch()).close();
    assert.deepEqual(f.state.calls.map(c => c.options.executablePath), [chrome, shell]);
  });
}

test('cached chromium substitute is never reused for a headless-shell launch', async t => {
  const f = await browserFixture(t), chrome = f.build(1243, { artifact: 'chromium' });
  assert.equal((await f.runtime.check({ headless: true, channel: 'chromium' })).preinstalledBuild.path, chrome);
  f.state.calls.length = 0;
  const report = await f.runtime.check();
  assert.equal(report.failure, 'artifact');
  assert.deepEqual(f.state.calls.map(c => c.options.executablePath), [undefined]);
});

for (const kind of ['success', 'failure', 'no sibling']) {
  test(`browser GC protection: ${kind}`, async t => {
    const f = await browserFixture(t);
    if (kind !== 'no sibling') {
      const binary = f.build(1243);
      if (kind === 'failure') f.state.failures[binary] = 'unfamiliar failure';
    }
    assert.equal(process.env.PLAYWRIGHT_SKIP_BROWSER_GC, undefined);
    await f.runtime.check();
    assert.equal(process.env.PLAYWRIGHT_SKIP_BROWSER_GC, kind === 'no sibling' ? undefined : '1');
  });
}

test('after a failed substitute trial a newly installed wanted build is used without an override', async t => {
  const f = await browserFixture(t), binary = f.build(1243);
  f.state.failures[binary] = 'Target closed';
  assert.equal((await f.runtime.check()).failure, 'artifact');
  f.build(1234);
  f.state.calls.length = 0;
  const report = await f.runtime.check();
  assert.equal(report.chromiumLaunch, true);
  assert.equal(report.preinstalledBuild, undefined);
  assert.deepEqual(f.state.calls.map(c => c.options.executablePath), [undefined]);
});

for (const layout of [
  { inside: 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' },
  { rootName: 'name-123' }
]) test(`installed-build layout ${JSON.stringify(layout)}`, async t => {
  const f = await browserFixture(t, layout), binary = f.build(1243, { artifact: 'chromium' });
  const report = await f.runtime.check({ headless: false });
  assert.equal(report.chromiumLaunch, true);
  assert.deepEqual(report.preinstalledBuild, { path: binary, revision: 1243, wanted: 1234 });
});

for (const code of ['EPERM', 'EACCES']) {
  test(`substitute spawn ${code} preserves host or lost-mode evidence`, async t => {
    const f = await browserFixture(t), binary = f.build(1243);
    f.state.beforeLaunch = path => {
      if (path === binary && code === 'EACCES') fs.chmodSync(binary, 0o644);
    };
    f.state.failures[binary] = `browserType.launch: spawn ${binary} ${code}`;
    const report = await f.runtime.check();
    assert.equal(report.failure, code === 'EPERM' ? 'host' : 'permission');
    assert.equal(report.unrunnablePath, code === 'EACCES' ? binary : null);
    assert.ok(report.remediation.includes(code));
    assert.doesNotMatch(report.remediation, /--install|cdn\.playwright|install chromium/);
    assert.equal(f.state.calls.length, 2);
  });
}

test('direct persistent and ordinary launches discover once per headful or headless shape', async t => {
  const f = await browserFixture(t);
  const shell = f.build(1243), chrome = f.build(1244, { artifact: 'chromium' });
  await (await f.runtime.launchPersistentContext(join(f.root, 'profile'), { headless: false })).close();
  await (await f.runtime.launch({ headless: false })).close();
  await (await f.runtime.launch()).close();
  await (await f.runtime.launch()).close();
  assert.deepEqual(f.state.calls.map(c => c.options.executablePath), [undefined, chrome, chrome, undefined, shell, shell]);
  const report = await f.runtime.check({ headless: false });
  assert.deepEqual(report.preinstalledBuild, { path: chrome, revision: 1244, wanted: 1234 });
});

for (const kind of ['present', 'unsearchable']) test(`missing sentence with ${kind} file is never enough`, async t => {
  const f = await browserFixture(t);
  f.build(1243);
  if (kind === 'present') f.build(1234);
  f.state.failures[f.wanted] = `browserType.launch: Executable doesn't exist at ${f.wanted}`;
  const original = fs.statSync;
  const stat = mock.method(fs, 'statSync', (path, ...args) => {
    if (kind === 'unsearchable' && path === f.wanted) throw Object.assign(new Error('unsearchable'), { code: 'EACCES' });
    return original(path, ...args);
  });
  const scan = watchScan(f);
  syncBuiltinESMExports();
  try {
    const report = await f.runtime.check();
    assert.equal(report.failure, kind === 'present' ? 'host' : 'unknown');
    assert.equal(f.state.calls.length, 1);
  } finally { stat.mock.restore(); scan.mock.restore(); syncBuiltinESMExports(); }
});

test('library check and shim preparation inspect the substitute binary', async t => {
  const f = await browserFixture(t), binary = f.build(1243);
  const inspected = [], original = childProcess.execFileSync;
  const exec = mock.method(childProcess, 'execFileSync', (command, args, ...rest) => {
    if (command === 'ldd') { inspected.push(args[0]); return 'libXdamage.so.1 => not found\n'; }
    if (command === 'cc') return '';
    return original(command, args, ...rest);
  });
  syncBuiltinESMExports();
  try {
    const report = await f.runtime.check();
    assert.equal(report.chromiumLaunch, true);
    assert.deepEqual(inspected, [binary]);
    assert.deepEqual(report.shimmed, ['libXdamage.so.1']);
  } finally { exec.mock.restore(); syncBuiltinESMExports(); }
});

for (const [line, expected, executable] of [
  ['spawn BINARY EACCES', 'permission', false],
  ['spawn BINARY EPERM', 'host', true],
  ['spawn BINARY EAGAIN', 'host', true],
  ['Target page, context or browser has been closed', 'crashed', true],
  ['an unfamiliar launch failure', 'unknown', true],
  ["a different first line\nExecutable doesn't exist at BINARY", 'unknown', true]
]) test(`non-absence launch failure stays ${expected}: ${line.split('\n')[0]}`, async t => {
  const f = await browserFixture(t);
  f.build(1234, { executable }); f.build(1243);
  f.state.failures[f.wanted] = line.replaceAll('BINARY', f.wanted);
  const scan = watchScan(f);
  syncBuiltinESMExports();
  try {
    const report = await f.runtime.check();
    assert.equal(report.failure, expected);
    assert.equal(f.state.calls.length, 1);
  } finally { scan.mock.restore(); syncBuiltinESMExports(); }
});

for (const library of ['libBlocked.so.1', 'libXdamage.so.1']) {
test(`substitute preparation reports host dependency ${library}, never an install`, async t => {
  const f = await browserFixture(t), binary = f.build(1243);
  const original = childProcess.execFileSync;
  const exec = mock.method(childProcess, 'execFileSync', (command, args, ...rest) => {
    if (command === 'ldd') return `${library} => not found\n`;
    if (command === 'cc' || command === 'gcc') throw new Error('no compiler');
    return original(command, args, ...rest);
  });
  syncBuiltinESMExports();
  try {
    const report = await f.runtime.check();
    assert.equal(report.failure, 'host');
    assert.deepEqual(report.missingLibs, [library]);
    assert.ok(report.remediation.includes(binary));
    assert.ok(report.remediation.includes(library));
    assert.doesNotMatch(report.remediation, /--install|cdn\.playwright|install chromium/);
    assert.equal(f.state.calls.length, 1, 'preparation refuses before the candidate launch');
  } finally { exec.mock.restore(); syncBuiltinESMExports(); }
});
}

test('a shimmed library does not turn a crashed substitute into a host refusal', async t => {
  const f = await browserFixture(t), binary = f.build(1243);
  f.state.failures[binary] = 'Target page, context or browser has been closed';
  const original = childProcess.execFileSync;
  const exec = mock.method(childProcess, 'execFileSync', (command, args, ...rest) => {
    if (command === 'ldd') return 'libXdamage.so.1 => not found\n';
    if (command === 'cc') return '';
    return original(command, args, ...rest);
  });
  syncBuiltinESMExports();
  try {
    const report = await f.runtime.check();
    assert.deepEqual(report.shimmed, ['libXdamage.so.1']);
    assert.equal(report.failure, 'artifact', 'the stub resolved the library, so the version-matched install stays available');
    assert.ok(report.remediation.includes(binary));
    assert.match(report.remediation, /Target page, context or browser has been closed/);
  } finally { exec.mock.restore(); syncBuiltinESMExports(); }
});

test('substitute page failure preserves the absent-build verdict and closes its browser', async t => {
  const f = await browserFixture(t), binary = f.build(1243);
  f.state.pageFailure = 'page did not answer';
  const report = await f.runtime.check();
  assert.equal(report.failure, 'artifact');
  assert.ok(report.remediation.includes(binary));
  assert.match(report.remediation, /page did not answer/);
  assert.equal(f.state.closed, 1);
});

test('runtime-owned timer settles an abandoned substitute launch and is cleared', async t => {
  const f = await browserFixture(t);
  f.build(1243); f.state.hang = true;
  const timer = globalThis.setTimeout, clear = globalThis.clearTimeout;
  let scheduled = 0, cleared = 0;
  const watch = mock.method(globalThis, 'setTimeout', (callback, ms) => {
    assert.equal(ms, 180000); scheduled++;
    return timer(callback, 20);
  });
  const cleanup = mock.method(globalThis, 'clearTimeout', id => { cleared++; return clear(id); });
  try {
    const report = await f.runtime.check();
    assert.equal(report.failure, 'artifact');
    assert.match(report.remediation, /did not settle within 180000ms/);
    assert.equal(scheduled, 1); assert.equal(cleared, 1);
  } finally { watch.mock.restore(); cleanup.mock.restore(); }
});

for (const kind of ['own teardown', 'substitute teardown', 'substitute error cleanup']) {
  test(`runtime-owned deadline also bounds abandoned ${kind}`, async t => {
    const f = await browserFixture(t);
    f.build(kind.startsWith('own') ? 1234 : 1243);
    f.state.closeHang = true;
    if (kind.endsWith('cleanup')) f.state.pageFailure = 'page refused';
    const timer = globalThis.setTimeout, clear = globalThis.clearTimeout;
    let scheduled = 0, cleared = 0;
    const watch = mock.method(globalThis, 'setTimeout', (callback, ms) => {
      assert.equal(ms, 180000); scheduled++;
      return timer(callback, 20);
    });
    const cleanup = mock.method(globalThis, 'clearTimeout', id => { cleared++; return clear(id); });
    try {
      const report = await f.runtime.check();
      assert.equal(report.failure, kind.startsWith('own') ? 'crashed' : 'artifact');
      assert.equal(report.chromiumLaunch, false);
      assert.ok(f.state.closed > 0);
      assert.equal(scheduled, 1); assert.equal(cleared, 1);
    } finally { watch.mock.restore(); cleanup.mock.restore(); }
  });
}

test('executablePath instrument counts the preinstalled-build path decision explicitly', () => {
  const source = fs.readFileSync(new URL('../browser-runtime/browser-runtime.js', import.meta.url), 'utf8');
  // Carry forward the 2026-08-29 browser-tool gate's outside-comments line
  // instrument. Six duplicated preflights became one shared runtime; that one
  // line is now joined by the caller override guard and installed-build choice.
  const lines = source.split('\n').filter(line => /^[^/]*executablePath/.test(line) && !/^\s*\*/.test(line));
  assert.equal(lines.length, 3, 'preflight + caller override guard + preinstalled-build executablePath');
});
