import './browser-home.mjs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { CHROME_BUILD, HYPERFRAMES_VERSION, INSTALL_SIZE, TOOL_DIR, chromeSurvey, launchFailure, ownPackage, prepareRuntime } from '../scripts/dependencies.mjs';

async function scratch(t) {
  const path = await mkdtemp(join(tmpdir(), 'wiser-video-dependencies-'));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}

async function copyTool(t) {
  const path = await scratch(t);
  const tool = join(path, 'tools/video-render');
  await cp(join(TOOL_DIR, 'scripts'), join(tool, 'scripts'), { recursive: true });
  await mkdir(join(path, 'tools/lib'), { recursive: true });
  await cp(join(TOOL_DIR, '../lib/consent.js'), join(path, 'tools/lib/consent.js'));
  await cp(join(TOOL_DIR, '../lib/user-config.js'), join(path, 'tools/lib/user-config.js'));
  // An empty node_modules must not masquerade as the named package's marker.
  await mkdir(join(tool, 'node_modules'));
  const project = join(path, 'project');
  await mkdir(project);
  await writeFile(join(project, 'index.html'), '<main data-video-root>Zibble</main>');
  const bin = join(path, 'bin');
  await mkdir(bin);
  await writeFile(join(bin, 'ffmpeg'), '#!/bin/sh\nprintf "ffmpeg version test-fixture\\n"\n', { mode: 0o755 });
  const env = { ...process.env, PATH: bin, WISER_ALLOW_INSTALL: '0' };
  const script = join(tool, 'scripts/video-render.js');
  const args = ['sequence', '--project', project, '--output', join(path, 'output'), '--width', '32', '--height', '24', '--fps', '1', '--duration', '1'];
  return { path, tool, env, script, args };
}

const run = (copy, args, options = {}) => spawnSync(process.execPath, [copy.script, ...args], {
  encoding: 'utf8', timeout: 60_000, env: copy.env, ...options,
});

async function snapshot(path) {
  const records = [];
  async function walk(path, name) {
    const info = await lstat(path);
    records.push([name, info.mode, info.size, info.mtimeMs, info.isFile()
      ? createHash('sha256').update(await readFile(path)).digest('hex') : null]);
    if (info.isDirectory()) for (const entry of (await readdir(path)).sort()) await walk(join(path, entry), `${name}/${entry}`);
  }
  await walk(path, '');
  return records;
}

test('all help forms work without packages and reject install and unknown flags before work', async (t) => {
  const copy = await copyTool(t);
  const before = await snapshot(copy.path);
  for (const args of [[], ['help'], ['--help'], ['sequence', 'help'], ['sequence', '--help'], ['help', 'sequence'], ['check', 'help'], ['check', '--help'], ['help', 'check']]) {
    const result = run(copy, args, { env: { ...copy.env, PATH: '' } });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    assert.match(result.stdout, /--help/);
    assert.match(result.stdout, /--install/);
    if (!args.includes('check')) for (const flag of ['project', 'output', 'width', 'height', 'fps', 'duration', 'workers', 'gpu', 'capture']) assert.ok(result.stdout.includes(`--${flag}`));
  }
  for (const args of [['help', '--install'], ['--help', '--install'], ['sequence', '--help', '--install'], ['check', 'help', '--install'],
    ['check', '--install', '--zibble'], ['sequence', '--install', '--zibble'], ['help', '--zibble'], ['check', '--help', '--zibble'], ['check', '--install=1']]) {
    const result = run(copy, args, { env: { ...copy.env, WISER_ALLOW_INSTALL: '1' } });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /Unknown flag --(?:install|zibble)/);
    assert.match(result.stderr, /help/);
  }
  assert.deepEqual(await snapshot(copy.path), before);
});

test('missing package report discloses both measured installs, exits 1, and changes no files', async (t) => {
  const copy = await copyTool(t);
  const before = await snapshot(copy.path);
  const result = run(copy, copy.args);
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.stdout, '');
  for (const text of [`HyperFrames ${HYPERFRAMES_VERSION} is missing`, 'registry.npmjs.org', 'tools/video-render/node_modules/',
    'chrome-headless-shell', CHROME_BUILD, 'storage.googleapis.com/chrome-for-testing-public', '~/.cache/hyperframes/chrome/',
    String(INSTALL_SIZE.packages), String(INSTALL_SIZE.chrome), INSTALL_SIZE.date, '--install', 'WISER_ALLOW_INSTALL=1']) assert.ok(result.stderr.includes(text), text);
  assert.deepEqual(await snapshot(copy.path), before);
});

test('plain check ignores environment consent, writes no files and exits 0 with an unready JSON verdict', async (t) => {
  const copy = await copyTool(t);
  const before = await snapshot(copy.path);
  const result = run(copy, ['check'], { env: { ...copy.env, WISER_ALLOW_INSTALL: '1' } });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  const report = JSON.parse(result.stdout);
  assert.equal(report.node.version, process.versions.node);
  assert.equal(report.node.ok, true);
  assert.equal(report.ffmpeg.present, true);
  assert.equal(report.ffmpeg.version, 'ffmpeg version test-fixture');
  assert.equal(report.hyperframes.present, false);
  assert.equal(report.hyperframes.ok, false);
  assert.equal(report.chrome.launches, false);
  assert.equal(report.chrome.expectedBuild, CHROME_BUILD);
  assert.equal(report.ready, false);
  assert.deepEqual(await snapshot(copy.path), before);
});

test('package resolution refuses dependencies inherited from an ancestor directory', async (t) => {
  const copy = await copyTool(t);
  await symlink(join(TOOL_DIR, 'node_modules'), join(copy.path, 'tools/node_modules'), 'dir');
  await assert.rejects(ownPackage('puppeteer-core', copy.tool), /did not resolve inside.*node_modules/);
});

test('old Node and missing FFmpeg name their check commands before any install', async (t) => {
  const copy = await copyTool(t);
  const before = await snapshot(copy.path);
  const old = spawnSync(process.execPath, ['--import', 'data:text/javascript,Object.defineProperty(process.versions,"node",{value:"20.0.0"})', copy.script, ...copy.args, '--install'], {
    encoding: 'utf8', timeout: 60_000, env: copy.env,
  });
  assert.equal(old.status, 1);
  assert.equal(old.stdout, '');
  assert.match(old.stderr, /Node 20\.0\.0.*Node >=22.*node --version/);
  const missing = run(copy, [...copy.args, '--install'], { env: { ...copy.env, PATH: '' } });
  assert.equal(missing.status, 1);
  assert.equal(missing.stdout, '');
  assert.match(missing.stderr, /FFmpeg.*ffmpeg -version/);
  const survey = run(copy, ['check', '--install'], { env: { ...copy.env, PATH: '' } });
  assert.equal(survey.status, 0, survey.stderr);
  assert.equal(JSON.parse(survey.stdout).ready, false);
  assert.match(JSON.parse(survey.stdout).error, /FFmpeg.*ffmpeg -version/);
  assert.deepEqual(await snapshot(copy.path), before);
});

function mockRuntime({ installed = false, browser = false, authorised = true, failure = 'missing' } = {}) {
  const calls = [];
  const consent = {
    installAuthorised(file, install) { calls.push(['authorise', install]); return authorised; },
    writeConsent(file, tool, install) { calls.push(['consent', tool, install]); },
  };
  const operations = { tool: '/zibble/video-render', home: '/zibble/real-home', nodeVersion: '22.0.0', consent,
    async packages() { return { present: installed, version: installed ? HYPERFRAMES_VERSION : null, ok: installed }; },
    async probe() { calls.push(['probe']); return { build: browser ? CHROME_BUILD : null, launches: browser, failure, remediation: 'Zibble launch failed; preserve the current browser.' }; },
    run(executable, args, options) {
      calls.push(['run', executable, args, options]);
      if (args[0] === '-version') return { status: 0, stdout: `${executable} version fixture\n` };
      if (args[0] === 'ci') installed = true;
      else { assert.deepEqual(args.slice(1), ['browser', 'ensure']); browser = true; }
      return { status: 0, stdout: '', stderr: '' };
    },
  };
  return { calls, operations };
}

test('authorised first run installs pinned packages, then Chrome, and becomes ready in the same call', async () => {
  for (const survey of [false, true]) {
    const { calls, operations } = mockRuntime();
    const report = await prepareRuntime({ install: true, survey }, operations);
    assert.equal(report.ready, true);
    const installs = calls.filter((call) => call[0] === 'run' && call[2][0] !== '-version');
    assert.equal(installs.length, 2);
    assert.deepEqual(installs[0].slice(1, 3), [process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci']]);
    assert.deepEqual(installs[1].slice(1, 3), [process.execPath, ['/zibble/video-render/node_modules/hyperframes/bin/hyperframes.mjs', 'browser', 'ensure']]);
    for (const [, , , options] of installs) {
      assert.equal(options.cwd, operations.tool);
      assert.equal(options.env.HOME, operations.home);
      assert.equal(options.env.HYPERFRAMES_BROWSER_PATH, undefined);
      for (const name of ['HYPERFRAMES_NO_TELEMETRY', 'DO_NOT_TRACK', 'HYPERFRAMES_NO_UPDATE_CHECK', 'HYPERFRAMES_NO_AUTO_INSTALL', 'HYPERFRAMES_SKIP_SKILLS']) assert.equal(options.env[name], '1');
    }
    assert.equal(calls.filter((call) => call[0] === 'probe').length, 2);
    assert.ok(calls.some((call) => call[0] === 'consent' && call[1] === 'video-render' && call[2] === true));
  }
});

test('plain survey never installs, and work accepts existing consent without the flag', async () => {
  const plain = mockRuntime();
  assert.equal((await prepareRuntime({ survey: true }, plain.operations)).ready, false);
  assert.ok(!plain.calls.some((call) => call[0] === 'authorise' || call[0] === 'consent'));
  const existing = mockRuntime();
  assert.equal((await prepareRuntime({}, existing.operations)).ready, true);
  assert.ok(existing.calls.some((call) => call[0] === 'authorise' && call[1] === false));
});

test('working Chrome and non-artifact launch failures never trigger a browser install', async () => {
  const ready = mockRuntime({ installed: true, browser: true });
  assert.equal((await prepareRuntime({ install: true }, ready.operations)).ready, true);
  assert.ok(!ready.calls.some((call) => call[0] === 'consent'));
  for (const failure of ['host', 'permission', 'launch', 'protocol', 'version']) {
    const fixture = mockRuntime({ installed: true, failure });
    await assert.rejects(prepareRuntime({ install: true }, fixture.operations), /preserve the current browser/);
    assert.equal(fixture.calls.filter((call) => call[0] === 'run').length, 2);
    assert.ok(!fixture.calls.some((call) => call[0] === 'consent'));
  }
  const refused = mockRuntime({ authorised: false });
  await assert.rejects(prepareRuntime({}, refused.operations), /--install/);
  assert.equal(refused.calls.filter((call) => call[0] === 'run').length, 2);
});

test('failure diagnosis distinguishes missing executable from permissions, host libraries and ambiguous crashes', () => {
  for (const [message, phase, expected] of [
    ['Browser was not found at the configured executablePath (/zibble)', 'launch', 'missing'],
    ['spawn /zibble EACCES', 'launch', 'permission'], ['spawn /zibble ENOENT', 'launch', 'launch'],
    ['error while loading shared libraries: libzibble.so', 'launch', 'host'],
    ['No usable sandbox!', 'launch', 'host'], ['Failed to launch the browser process: signal 9', 'launch', 'launch'],
    ['Target closed', 'protocol', 'protocol'],
  ]) assert.equal(launchFailure(new Error(message), phase), expected);
});

test('real pinned Chrome trial uses a disposable profile and leaves no probe directories', { timeout: 60_000 }, async (t) => {
  const temporary = await scratch(t), previous = process.env.TMPDIR;
  let report;
  process.env.TMPDIR = temporary;
  try { report = await chromeSurvey(); }
  finally {
    if (previous === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = previous;
  }
  assert.equal(report.launches, true, report.remediation);
  assert.equal(report.build, CHROME_BUILD);
  assert.deepEqual(await readdir(temporary), []);
});
