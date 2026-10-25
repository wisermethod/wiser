import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { compositionHtml, inspectProject, openingTags, remoteReference } from '../scripts/project.mjs';
import { browserPath, canonical, checkRuntime, childEnvironment, hashFrames, hyperframesDuration, optionsForSequence, readRenderLog, renderArguments, TOOL_DIR } from '../scripts/sequence.mjs';
import { parseArguments } from '../scripts/video-render.mjs';

const cli = join(TOOL_DIR, 'scripts/video-render.mjs');
const fixture = fileURLToPath(new URL('./fixtures/steps/', import.meta.url));
async function scratch(t) {
  const path = await mkdtemp(join(tmpdir(), 'wiser-video-test-'));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}
const run = (args, script = cli, extra = {}) => spawnSync(process.execPath, [script, ...args], {
  encoding: 'utf8', timeout: 120_000, env: { ...process.env, WISER_ALLOW_INSTALL: '0' }, ...extra,
});
const input = (project, output) => ({ project, output, width: 640, height: 360, fps: 8, duration: 2, workers: 1 });

test('help works in an uninstalled copy and importing the command does no work', async (t) => {
  const path = await scratch(t);
  await cp(join(TOOL_DIR, 'scripts'), join(path, 'tools/video-render/scripts'), { recursive: true });
  await mkdir(join(path, 'tools/lib'), { recursive: true });
  await cp(join(TOOL_DIR, '../lib/consent.js'), join(path, 'tools/lib/consent.js'));
  const script = join(path, 'tools/video-render/scripts/video-render.mjs');
  for (const args of [['help'], ['--help'], ['sequence', '--help']]) {
    const result = run(args, script);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    for (const flag of ['project', 'output', 'width', 'height', 'fps', 'duration', 'workers', 'gpu', 'capture', 'help']) assert.match(result.stdout, new RegExp(`--${flag}`));
  }
  const work = await scratch(t);
  const result = run(['sequence', '--project', fixture, '--output', join(work, 'out'), '--width', '640', '--height', '360', '--fps', '8', '--duration', '2'], script);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /HyperFrames 0\.8\.134 is missing/);
});

test('unknown and duplicate flags are refused by name', () => {
  for (const args of [['sequence', '--mystery'], ['sequence', '--gpu', 'hardware', '--gpu', 'software']]) {
    const result = run(args);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, args.includes('--mystery') ? /Unknown flag --mystery/ : /Duplicate flag --gpu/);
  }
  assert.throws(() => parseArguments(['sequence', '--fps', '--unserved']), /--unserved/);
});

test('relative paths and existing or internal outputs are refused, including symlink parents', async (t) => {
  const path = await scratch(t);
  const result = run(['sequence', '--project', 'relative', '--output', join(path, 'out')]);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /--project must be an absolute path/);
  await assert.rejects(optionsForSequence(input(fixture, path)), /already exists/);
  await assert.rejects(optionsForSequence(input(fixture, join(TOOL_DIR, 'out'))), /inside the tool/);
  await symlink(TOOL_DIR, join(path, 'alias'));
  await assert.rejects(optionsForSequence(input(fixture, join(path, 'alias/new/out'))), /inside the tool/);
  await assert.rejects(canonical(join(path, 'memory/proj'), '--project'), /protected/);
});

test('remote loading references are refused before rendering', async (t) => {
  const path = await scratch(t);
  await writeFile(join(path, 'index.html'), '<main data-video-root>Zavvo</main>');
  await writeFile(join(path, 'zibble.css'), 'main { background: url(HTTPS://pluvo.invalid/asset) }');
  await assert.rejects(inspectProject(path), /zibble\.css references HTTPS:\/\/pluvo\.invalid\/asset in url\(\)/);
  const result = run(['sequence', '--project', path, '--output', join(dirname(path), `${path.split('/').at(-1)}-out`), '--width', '640', '--height', '360', '--fps', '8', '--duration', '2']);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /zibble\.css references HTTPS:/);
});

test('protocol-relative references include HTML attributes, SVG and CSS, but script comments are allowed', () => {
  for (const [text, ext] of [
    ['<img src="//pluvo.invalid/a">', '.html'], ['<use href=//pluvo.invalid/a>', '.svg'],
    ['<img srcset="local.png 1x, //pluvo.invalid/a 2x">', '.html'],
    ['a { background: url( "//pluvo.invalid/a" ) }', '.css'], ['@import "//pluvo.invalid/a";', '.css'],
    ['<style>a { background: url(//pluvo.invalid/a) }</style>', '.html'],
    ['<div style="background:url(//pluvo.invalid/a)">', '.html'],
    ['<path style="fill:url(//pluvo.invalid/a)">', '.svg'],
  ]) assert.match(remoteReference(text, ext), /^\/\/pluvo\.invalid/);
  assert.equal(remoteReference('// zibble', '.js'), null);
  assert.equal(remoteReference('<script>// src="//pluvo.invalid"\nconst zibble = "//pluvo.invalid";</script>', '.html'), null);
});

test('project root is a real tag, and composition attributes are set only on the copy', async (t) => {
  const path = await scratch(t);
  const html = '<!-- <div data-video-root> --><script>const zibble = "<div data-video-root>";</script><main data-video-root data-width="9" data-duration="8">Zavvo</main>';
  await writeFile(join(path, 'index.html'), html);
  const inspected = await inspectProject(path);
  const copy = compositionHtml(inspected, input(path, path), 'zibble.js');
  const root = openingTags(copy).find((tag) => tag.attrs.some((a) => a.name === 'data-video-root'));
  for (const [name, value] of [['data-width', '640'], ['data-height', '360'], ['data-duration', '2'], ['data-start', '0'], ['data-no-timeline', '']]) {
    assert.deepEqual(root.attrs.filter((a) => a.name === name).map((a) => a.value), [value]);
  }
  assert.equal(await readFile(join(path, 'index.html'), 'utf8'), html);
  await writeFile(join(path, 'index.html'), '<main data-video-root></main><aside data-video-root></aside>');
  await assert.rejects(inspectProject(path), /2 data-video-root/);
});

test('Node and wrong HyperFrames versions are refused by name', async (t) => {
  const path = await scratch(t);
  await assert.rejects(checkRuntime(path, '20.0.0'), /Node 20\.0\.0.*Node >=22/);
  await mkdir(join(path, 'node_modules/hyperframes'), { recursive: true });
  await writeFile(join(path, 'node_modules/hyperframes/package.json'), '{"version":"0.8.133"}');
  await assert.rejects(checkRuntime(path), /HyperFrames 0\.8\.133.*0\.8\.134/);
});

test('child environment is closed, and every rendering mode is explicit', () => {
  const env = childEnvironment('/zibble', '/pluvo', { PATH: '/nembi', LANG: 'C', TMPDIR: '/troff', ZIBBLE_TOKEN: 'zavvo', NODE_OPTIONS: '--zibble' });
  assert.equal(env.ZIBBLE_TOKEN, undefined);
  assert.equal(env.NODE_OPTIONS, undefined);
  assert.deepEqual(Object.keys(env).sort(), ['PATH', 'LANG', 'TMPDIR', 'HOME', 'HYPERFRAMES_BROWSER_PATH', 'HYPERFRAMES_NO_TELEMETRY', 'DO_NOT_TRACK', 'HYPERFRAMES_NO_UPDATE_CHECK', 'HYPERFRAMES_NO_AUTO_INSTALL', 'HYPERFRAMES_SKIP_SKILLS', 'NO_COLOR'].sort());
  for (const [gpu, capture, workers] of [['hardware', 'screenshot', 1], ['software', 'fast', 'auto']]) {
    const args = renderArguments('/zibble', '/pluvo', { gpu, capture, workers, fps: 8 });
    assert.ok(args.includes(gpu === 'hardware' ? '--browser-gpu' : '--no-browser-gpu'));
    assert.ok(args.includes(capture === 'fast' ? '--experimental-fast-capture' : '--experimental-fast-capture=false'));
    assert.equal(args[args.indexOf('--workers') + 1], String(workers));
    assert.equal(args[args.indexOf('--frames-cache-dir') + 1], 'off');
    assert.ok(!args.includes('--strict-all'));
  }
});

test('Chrome and lint results come from the actual launch log', () => {
  assert.deepEqual(readRenderLog('[BrowserManager] Browser launched (HeadlessChrome/152.0.7977.30, screenshot)\n  \u26a0 css_transition_used: Zibble\n    Fix: Pluvo'), { chromeBuild: '152.0.7977.30', lintFindings: ['\u26a0 css_transition_used: Zibble'] });
  assert.throws(() => readRenderLog('zibble'), /no launched Chrome build/);
  assert.throws(() => readRenderLog('[BrowserManager] Browser launched (Chrome/151.0.0.0, screenshot)'), /require 152/);
});

test('RGBA hashes ignore PNG encoding differences and frame count is enforced', async (t) => {
  await checkRuntime();
  const path = await scratch(t);
  const { default: sharp } = await import('sharp');
  for (const [name, compressionLevel] of [['frame_00000.png', 0], ['frame_00001.png', 9]]) {
    await sharp({ create: { width: 2, height: 2, channels: 4, background: '#123456' } }).png({ compressionLevel }).toFile(join(path, name));
  }
  const result = await hashFrames(path, 2, 2, 2);
  const text = await readFile(result.hashesPath, 'utf8');
  const lines = text.trim().split('\n');
  assert.equal(lines[0].slice(0, 64), lines[1].slice(0, 64));
  assert.equal(result.hashesSha256, createHash('sha256').update(text).digest('hex'));
  assert.notDeepEqual(await readFile(join(path, 'frame_00000.png')), await readFile(join(path, 'frame_00001.png')));
  await assert.rejects(hashFrames(path, 3, 2, 2), /wrote 2 frames.*expected.*3/);
});

test('real HyperFrames sequence has sixteen frames, stable pixels across workers, a retained log and unchanged source', { timeout: 120_000 }, async (t) => {
  await checkRuntime();
  await browserPath();
  const path = await scratch(t);
  const output = join(path, 'frames');
  const source = await readFile(join(fixture, 'index.html'));
  const before = new Set((await readdir(tmpdir())).filter((name) => name.startsWith('wiser-video-render-')));
  const result = run(['sequence', '--project', fixture, '--output', output, '--width', '640', '--height', '360', '--fps', '8', '--duration', '2', '--workers', '1', '--gpu', 'hardware', '--capture', 'screenshot']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  const report = JSON.parse(result.stdout);
  assert.equal(report.hyperframesVersion, '0.8.134');
  assert.equal(report.chromeBuild, '152.0.7977.30');
  assert.equal(report.frameCount, 16);
  assert.equal(report.gpu, 'hardware');
  assert.equal(report.capture, 'screenshot');
  const frameLines = (await readFile(report.hashesPath, 'utf8')).trim().split('\n');
  assert.equal(frameLines.length, 16);
  assert.ok(new Set(frameLines.map((line) => line.slice(0, 64))).size > 5, 'the render must contain motion');
  assert.match(await readFile(report.logPath, 'utf8'), /Browser launched/);
  assert.deepEqual(await readFile(join(fixture, 'index.html')), source);
  const parallel = run(['sequence', '--project', fixture, '--output', join(path, 'parallel'), '--width', '640', '--height', '360', '--fps', '8', '--duration', '2', '--workers', '2', '--gpu', 'hardware', '--capture', 'screenshot']);
  assert.equal(parallel.status, 0, parallel.stderr);
  const other = JSON.parse(parallel.stdout);
  assert.equal(other.frameCount, 16);
  assert.equal(other.hashesSha256, report.hashesSha256);
  const { default: puppeteer } = await import('puppeteer-core');
  const { default: sharp } = await import('sharp');
  const home = join(path, 'home');
  await mkdir(home);
  // Match HyperFrames 0.8.134's text shaping, device scale and hardware rasterizer.
  const angle = { darwin: 'metal', win32: 'd3d11', linux: 'gl-egl' }[process.platform];
  const referenceArgs = ['--disable-background-networking', '--force-device-scale-factor=1', '--font-render-hinting=none',
    '--enable-gpu-rasterization', ...(angle ? ['--use-gl=angle', `--use-angle=${angle}`] : [])];
  const browser = await puppeteer.launch({ executablePath: await browserPath(), headless: true,
    env: childEnvironment(home, await browserPath()), userDataDir: join(home, 'profile'),
    defaultViewport: { width: 640, height: 360 }, args: referenceArgs });
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(join(fixture, 'index.html')).href);
    await page.addStyleTag({ content: 'html,body,*{text-rendering:geometricPrecision}' });
    for (const frame of [0, 4, 7, 10, 15]) {
      await page.evaluate((time) => window.dispatchEvent(new CustomEvent('video-render:seek', { detail: { time } })), frame / 8);
      const rgba = await sharp(await page.screenshot()).toColourspace('srgb').ensureAlpha().raw().toBuffer();
      assert.equal(frameLines[frame].slice(0, 64), createHash('sha256').update(rgba).digest('hex'), `rendered frame ${frame} must match a direct engine seek`);
    }
  } finally { await browser.close(); }
  const after = (await readdir(tmpdir())).filter((name) => name.startsWith('wiser-video-render-') && !before.has(name));
  assert.deepEqual(after, []);
  t.diagnostic(JSON.stringify(report));
});

test('a failed renderer keeps its log and removes the temporary project and home', { timeout: 120_000 }, async (t) => {
  const path = await scratch(t);
  const output = join(path, 'failed');
  const project = join(path, 'project');
  await cp(fixture, project, { recursive: true });
  // The pinned renderer checks a project-local FFmpeg before common system directories.
  // An unusable local binary forces a real child failure without changing the installation.
  await mkdir(join(project, '.hyperframes/bin'), { recursive: true });
  await writeFile(join(project, '.hyperframes/bin', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'), 'Zibble');
  const before = new Set((await readdir(tmpdir())).filter((name) => name.startsWith('wiser-video-render-')));
  // Satisfy the entry-point system check, then exercise the renderer's separate local-binary failure.
  const bin = join(path, 'bin');
  await mkdir(bin);
  await writeFile(join(bin, 'ffmpeg'), '#!/bin/sh\nif [ ! -f "$0.checked" ]; then\n  : > "$0.checked"\n  printf "ffmpeg version test-fixture\\n"\n  exit 0\nfi\nexit 1\n', { mode: 0o755 });
  const result = run(['sequence', '--project', project, '--output', output, '--width', '640', '--height', '360', '--fps', '8', '--duration', '2', '--workers', '1'], cli, { env: { PATH: bin, LANG: 'C', HOME: process.env.HOME } });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /HyperFrames render failed/);
  assert.match(await readFile(join(output, 'render.log'), 'utf8'), /FFmpeg|FFprobe/);
  const after = (await readdir(tmpdir())).filter((name) => name.startsWith('wiser-video-render-') && !before.has(name));
  assert.deepEqual(after, []);
});

test('HyperFrames is handed a duration whose ceil is exactly round(duration × fps) frames', () => {
  for (const [duration, fps] of [[6.003, 30], [7, 30], [10.1, 30], [1 / 30 + 0.0001, 30], [2, 8], [11, 30000 / 1001], [0.5, 24]]) {
    const frames = Math.round(duration * fps);
    assert.equal(Math.max(1, Math.ceil(hyperframesDuration(frames, fps) * fps)), frames, `${duration} s at ${fps} fps`);
  }
});
