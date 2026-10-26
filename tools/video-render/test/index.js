// Node's explicit directory argument resolves this entry point.
import './core.test.mjs';
import './clock.test.mjs';
import './once-clock.test.mjs';
import './dependencies.test.mjs';
import './review.test.mjs';

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, link, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { CHROME_BUILD, HYPERFRAMES_VERSION, TOOL_DIR, ffmpegSurvey, ownPackage } from '../scripts/dependencies.mjs';
import { checkMetadata, encodeArguments, hasEditList, optionsForRender, packetHasIDR, renderCacheInputs } from '../scripts/render.mjs';
import { RENDER_VERSION, cacheKey, canonicalJSON, readCache, writeCache } from '../scripts/cache.mjs';
import { inspectProject } from '../scripts/project.mjs';
import { optionsForFrames } from '../scripts/frames.mjs';
import { BROWSER_SWITCHES, browserPath, childEnvironment, writeBrowserWrapper } from '../scripts/sequence.mjs';

const cli = join(TOOL_DIR, 'scripts/video-render.js');
const fixture = fileURLToPath(new URL('./fixtures/steps/', import.meta.url));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const run = (args, extra = {}) => spawnSync(process.execPath, [cli, ...args], {
  encoding: 'utf8', timeout: 120_000, env: { ...process.env, WISER_ALLOW_INSTALL: '0' }, ...extra,
});
const values = (project, output) => ({ project, output, width: 320, height: 180, fps: 10, duration: 2.1, workers: 1 });
const flags = (options) => Object.entries(options).flatMap(([key, value]) => [`--${key}`, String(value)]);
async function scratch(t) {
  const path = await mkdtemp(join(tmpdir(), 'wiser-video-mp4-test-'));
  t.after(() => rm(path, { recursive: true, force: true }));
  return realpath(path);
}
function probe(args) {
  const result = spawnSync('ffprobe', args, { encoding: 'utf8', timeout: 30_000, maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr);
  return result;
}
async function temporaryRenders() {
  return (await readdir(tmpdir())).filter((name) => /^wiser-video-(?:render|encode|probe|frames)-/.test(name)).sort();
}

test('the static screen allows SVG namespaces, script URLs, comments and non-loading text', async (t) => {
  const path = await scratch(t);
  await writeFile(join(path, 'index.html'), `<main data-video-root>
    <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><path d="M0 0"/></svg>
    <span title="https://example.com/" data-note="https://example.com/">https://example.com/</span>
    <script src="library.js"></script>
    <script>const markup = '<img src="https://example.com/x.png">';</script>
    <!-- <img src="https://example.com/x.png"> -->
    <style>/* @import "https://example.com/"; */ p::after { content: 'url(https://example.com/)'; }</style>
  </main>`);
  await writeFile(join(path, 'library.js'), '// Licence: https://example.com/\nconst site = "https://example.com/";');
  await writeFile(join(path, 'icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  await writeFile(join(path, 'notes.txt'), 'https://example.com/');
  await writeFile(join(path, 'local.css'), '/* url(//example.com/x.png) */ @import "local.css"; a { background:url(local.png); content:"https://example.com/" }');
  assert.equal((await inspectProject(path)).files.length, 5);
});

test('the static screen permits local, data and blob references, including commas in srcset data URLs', async (t) => {
  const path = await scratch(t);
  await writeFile(join(path, 'index.html'), `<main data-video-root>
    <img src="data:image/png;base64,AAAA" srcset="data:image/png;base64,AAAA,https://example.com/ 1x, local.png 2x">
    <svg><use xlink:href="#local"/></svg><object data="blob:https://example.com/local"></object>
    <video poster="poster.png"></video><a href="./notes.html">Local</a>
    <div style="background:url('data:image/png;base64,AAAA')"></div>
    <style>@import "local.css"; main { background: url(blob:https://example.com/local) }</style>
  </main>`);
  await writeFile(join(path, 'local.css'), 'a { background:url("local/https://example.com/image.png") }');
  await inspectProject(path);
});

test('the static screen names each remote loading attribute or CSS rule and its value', async (t) => {
  const path = await scratch(t);
  const cases = [
    ['image.html', '<img src="https://example.com/x.png">', 'src', 'https://example.com/x.png'],
    ['source.html', '<img srcset="local.png 1x, https://example.com/x.png 2x">', 'srcset', 'https://example.com/x.png'],
    ['remote.css', '/* url(local.png) */ main { background: url(//example.com/x.png) }', 'url()', '//example.com/x.png'],
    ['import.css', '@import "https://example.com/remote.css";', '@import', 'https://example.com/remote.css'],
    ['inline.html', '<div style="background:url(https://example.com/x.png)"></div>', 'style url()', 'https://example.com/x.png'],
    ['style.html', '<style>main { background:url(https://example.com/x.png) }</style>', '<style> url()', 'https://example.com/x.png'],
    ['import.html', '<style>@import url("https://example.com/remote.css");</style>', '<style> @import', 'https://example.com/remote.css'],
    ['link.svg', '<svg><use xlink:href="https://example.com/icon.svg#x"/></svg>', 'xlink:href', 'https://example.com/icon.svg#x'],
    ['poster.html', '<video poster="//example.com/poster.png"></video>', 'poster', '//example.com/poster.png'],
    ['object.html', '<object data="ftp://example.com/asset"></object>', 'data', 'ftp://example.com/asset'],
    ['href.html', '<a href="file:///remote/file">Link</a>', 'href', 'file:///remote/file'],
    ['scheme.html', '<img SRC="  CuStOm+v1://example.com/x.png  ">', 'src', 'CuStOm+v1://example.com/x.png'],
    ['entity.html', '<img src="https&#58;//example.com/x.png">', 'src', 'https://example.com/x.png'],
    ['escaped.css', 'main { background:url(https\\3a //example.com/x.png) }', 'url()', 'https\\3a //example.com/x.png'],
  ];
  for (const [index, [name, contents, rule, value]] of cases.entries()) {
    const project = join(path, String(index));
    await mkdir(project);
    await writeFile(join(project, 'index.html'), '<main data-video-root>Local</main>');
    await writeFile(join(project, name), contents);
    await assert.rejects(inspectProject(project), (error) => {
      assert.ok(error.message.includes(`Project file ${name} references ${value} in ${rule};`), error.message);
      return true;
    });
  }
});

test('the Chrome wrapper preserves arguments and appends both network restrictions', async (t) => {
  const path = await scratch(t), executable = join(path, "pinned chrome's shell");
  await writeFile(executable, '#!/bin/sh\nprintf "%s\\n" "$@"\n', { mode: 0o700 });
  const wrapper = await writeBrowserWrapper(path, executable);
  assert.equal(wrapper, join(path, 'chrome-headless-shell'));
  const args = ['--headless', 'with spaces', "with'quotes", '$literal`command`', '*.png', '--proxy-server=earlier'];
  const result = spawnSync(wrapper, args, { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trimEnd().split('\n'), [...args, ...BROWSER_SWITCHES]);
  assert.equal(childEnvironment(path, wrapper).HYPERFRAMES_BROWSER_PATH, wrapper);
  await assert.rejects(writeBrowserWrapper(path, executable), { code: 'EEXIST' });
});

test('a real render shows that runtime fetch and image requests both fail behind the proxy', { timeout: 120_000 }, async (t) => {
  const path = await scratch(t), project = join(path, 'project'), output = join(path, 'frames');
  await mkdir(project);
  const html = (status, script = '') => `<!doctype html><html><head><style>
    * { box-sizing:border-box; text-rendering:geometricPrecision }
    html,body { margin:0; width:320px; height:180px; background:#111827 }
    main { width:320px; height:180px; padding:10px; display:grid; gap:10px; grid-template-rows:1fr 1fr; background:#111827 }
    main div { display:flex; align-items:center; justify-content:center; font:24px Arial,sans-serif; color:white; background:#a16207 }
    [data-status="failed"] { background:#15803d } [data-status="loaded"] { background:#b91c1c }
  </style></head><body><main data-video-root>
    <div id="fetch" data-status="${status}">fetch ${status}</div>
    <div id="image" data-status="${status}">image ${status}</div>
  </main>${script}</body></html>`;
  await writeFile(join(project, 'index.html'), html('pending', '<script src="requests.js"></script>'));
  await writeFile(join(project, 'requests.js'), `
    function result(kind, status) {
      const element = document.getElementById(kind);
      element.textContent = kind + ' ' + status;
      element.dataset.status = status;
    }
    fetch('https:' + '//example.com/', { mode: 'no-cors' }).then(
      () => result('fetch', 'loaded'), () => result('fetch', 'failed'));
    const image = new Image();
    image.onload = () => result('image', 'loaded');
    image.onerror = () => result('image', 'failed');
    image.src = 'https:' + '//example.com/x.png';
  `);
  await inspectProject(project);
  const before = await temporaryRenders();
  const result = run(['sequence', ...flags({ ...values(project, output), fps: 2, duration: 1.5 })]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  const report = JSON.parse(result.stdout);
  assert.equal(report.chromeBuild, CHROME_BUILD);
  assert.equal(report.frameCount, 3);
  const log = await readFile(report.logPath, 'utf8');
  assert.ok((log.match(/ERR_PROXY_CONNECTION_FAILED/g) ?? []).length >= 2, log);

  // Compare every decoded frame with the literal expected page, including its text.
  const { default: puppeteer } = await import('puppeteer-core');
  const { default: sharp } = await import('sharp');
  const home = join(path, 'home');
  await mkdir(home);
  const wrapper = await writeBrowserWrapper(home, await browserPath());
  const angle = { darwin: 'metal', win32: 'd3d11', linux: 'gl-egl' }[process.platform];
  const browser = await puppeteer.launch({ executablePath: wrapper, headless: true,
    env: childEnvironment(home, wrapper), userDataDir: join(home, 'profile'), defaultViewport: { width: 320, height: 180 },
    args: ['--disable-background-networking', '--force-device-scale-factor=1', '--font-render-hinting=none',
      '--force-color-profile=srgb', '--enable-gpu-rasterization', ...(angle ? ['--use-gl=angle', `--use-angle=${angle}`] : [])] });
  try {
    const page = await browser.newPage();
    await page.setContent(html('failed'));
    const expected = await sharp(await page.screenshot()).toColourspace('srgb').ensureAlpha().raw().toBuffer();
    const lines = (await readFile(report.hashesPath, 'utf8')).trim().split('\n');
    for (const line of lines) assert.equal(line.slice(0, 64), hash(expected), 'each frame must show fetch failed and image failed');
  } finally { await browser.close(); }
  assert.deepEqual(await temporaryRenders(), before);
  t.diagnostic(JSON.stringify({ chromeBuild: report.chromeBuild, frames: report.frameCount, fetch: 'failed', image: 'failed' }));
});

test('frames help works in an uninstalled copy and refuses unknown, duplicate and command-only flags', async (t) => {
  const path = await scratch(t), script = join(path, 'scripts/video-render.js');
  await cp(join(TOOL_DIR, 'scripts'), join(path, 'scripts'), { recursive: true });
  for (const args of [['frames', '--help'], ['frames', 'help'], ['help', 'frames']]) {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: { PATH: '' } });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    for (const flag of ['times', 'install', 'project', 'output', 'width', 'height', 'fps', 'duration', 'workers', 'gpu', 'capture']) assert.ok(result.stdout.includes(`--${flag}`));
    assert.match(result.stdout, /requestedTime, frame, time, file, sha256/);
  }
  for (const [args, pattern] of [
    [['frames', '--install', '--quality', 'high'], /Unknown flag --quality/],
    [['frames', '--profile', 'publish'], /Unknown flag --profile/],
    [['frames', '--frame-hashes', '/hashes'], /Unknown flag --frame-hashes/],
    [['frames', '--cache', '/cache'], /Unknown flag --cache/],
    [['frames', '--times', '0', '--times', '1'], /Duplicate flag --times/],
    [['frames', '--times'], /--times needs a value/],
    [['frames', '--times', '--install'], /--times needs a value/],
    [['frames', '--times', '--unserved'], /Unknown flag --unserved/],
    [['frames', '--help', '--install'], /Unknown flag --install for help/],
    ...['sequence', 'render', 'check'].map((command) => [[command, '--times', '0'], /Unknown flag --times/]),
  ]) {
    const result = run(args, { env: { PATH: '', WISER_ALLOW_INSTALL: '1' } });
    assert.equal(result.status, 1, JSON.stringify(args));
    assert.equal(result.stdout, '');
    assert.match(result.stderr, pattern);
  }
  assert.deepEqual(await readdir(path), ['scripts']);
});

test('frames refuses invalid times, arguments and unsafe destinations before dependency checks or writes', async (t) => {
  const path = await scratch(t), project = join(path, 'project');
  await cp(fixture, project, { recursive: true });
  await mkdir(join(path, 'existing'));
  await writeFile(join(path, 'existing/keep'), 'Zibble');
  await writeFile(join(path, 'existing-file'), 'Pluvo');
  await symlink(TOOL_DIR, join(path, 'tool-link'));
  await symlink(project, join(path, 'project-link'));
  await symlink(join(path, 'missing'), join(path, 'dangling'));
  const input = { ...values(project, join(path, 'new')), times: '0,0.56,3' };
  for (const missing of ['project', 'output', 'width', 'height', 'fps', 'duration', 'times']) {
    const options = { ...input };
    delete options[missing];
    const result = run(['frames', ...flags(options), '--install'], { env: { PATH: '' } });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, new RegExp(`--${missing}`));
  }
  for (const [change, pattern] of [
    ...['', ' ', ',', '0,', ',0', '0,,1', 'no', 'NaN', 'Infinity', '1e309', '-0.1', '0,-1'].map((times) => [{ times }, /--times/]),
    ...['0,0', '1,1.0', '1e0,1', '-0,0'].map((times) => [{ times }, /--times.*duplicate times/]),
    [{ times: Array.from({ length: 61 }, (_, i) => i).join(',') }, /--times.*at most 60/],
    [{ project: 'relative' }, /--project must be an absolute/],
    [{ output: 'relative' }, /--output must be an absolute/],
    [{ width: 0 }, /--width/], [{ height: 0.5 }, /--height/],
    [{ fps: 0 }, /--fps/], [{ duration: -1 }, /--duration/],
    [{ duration: 0.001 }, /round to at least one/],
    [{ workers: 0 }, /--workers/], [{ gpu: 'maybe' }, /--gpu/], [{ capture: 'maybe' }, /--capture/],
    [{ output: join(path, 'existing') }, /already exists/],
    [{ output: join(path, 'existing-file') }, /already exists/],
    [{ output: join(project, 'new') }, /inside --project/],
    [{ output: join(TOOL_DIR, 'new') }, /inside the tool/],
    [{ output: join(path, 'tool-link/missing/new') }, /inside the tool/],
    [{ output: join(path, 'project-link/missing/new') }, /inside --project/],
    [{ output: join(path, 'dangling/new') }, /canonicalized/],
    [{ output: join(path, 'memory/new') }, /protected/],
    [{ output: join(path, '.env') }, /protected/],
  ]) {
    const result = run(['frames', ...flags({ ...input, ...change }), '--install'], { env: { PATH: '' } });
    assert.equal(result.status, 1, JSON.stringify(change));
    assert.equal(result.stdout, '');
    assert.match(result.stderr, pattern);
  }
  assert.equal(await readFile(join(path, 'existing/keep'), 'utf8'), 'Zibble');
  assert.equal(await readFile(join(path, 'existing-file'), 'utf8'), 'Pluvo');
  assert.deepEqual((await readdir(path)).sort(), ['dangling', 'existing', 'existing-file', 'project', 'project-link', 'tool-link']);
});

test('frames maps zero-based times by floor, clamps to the last core frame and accepts distinct times sharing a frame', async (t) => {
  const path = await scratch(t), input = { ...values(fixture, join(path, 'new')), times: '0,0.56,1.25,2.1,3' };
  const options = await optionsForFrames(input);
  assert.deepEqual(options.frames, [
    { requestedTime: 0, frame: 0, time: 0, file: 'frame_000000.png' },
    { requestedTime: 0.56, frame: 5, time: 0.5, file: 'frame_000005.png' },
    { requestedTime: 1.25, frame: 12, time: 1.2, file: 'frame_000012.png' },
    { requestedTime: 2.1, frame: 20, time: 2, file: 'frame_000020.png' },
    { requestedTime: 3, frame: 20, time: 2, file: 'frame_000020.png' },
  ]);
  const sixty = await optionsForFrames({ ...input, times: Array.from({ length: 60 }, (_, i) => i / 1000).join(',') });
  assert.equal(sixty.frames.length, 60);
  assert.ok(sixty.frames.every((frame) => frame.frame === 0));
  for (const duration of [0.24, 0.26]) {
    const rounded = await optionsForFrames({ ...input, duration, times: `0.23,${duration},100,1e308`, workers: 'auto', gpu: 'software', capture: 'fast' });
    assert.ok(rounded.frames.every((frame) => frame.frame === Math.round(duration * 10) - 1));
    assert.equal(rounded.workers, 'auto'); assert.equal(rounded.gpu, 'software'); assert.equal(rounded.capture, 'fast');
  }
  assert.deepEqual(await readdir(path), []);
});

test('frames chooses by the renderer\'s own n / fps, and --select after names the first frame past each time', async (t) => {
  const path = await scratch(t), input = { ...values(fixture, join(path, 'new')), fps: 30, duration: 10 };
  const at = await optionsForFrames({ ...input, times: '4.1,8.2,0,0.5,9.95,9.97,100' });
  assert.equal(at.select, 'at');
  assert.deepEqual(at.frames.map((frame) => frame.frame), [123, 246, 0, 15, 298, 299, 299]);
  const after = await optionsForFrames({ ...input, times: '4.1,8.2,0,0.5,4.11,9.95', select: 'after' });
  assert.equal(after.select, 'after');
  assert.deepEqual(after.frames.map((frame) => frame.frame), [124, 247, 1, 16, 124, 299]);
  assert.deepEqual(after.frames[0], { requestedTime: 4.1, frame: 124, time: 124 / 30, file: 'frame_000124.png' });
  await assert.rejects(optionsForFrames({ ...input, times: '9.97', select: 'after' }), /no frame is drawn after 9\.97 s/);
  await assert.rejects(optionsForFrames({ ...input, times: '1', select: 'before' }), /--select must be at or after/);
  // A time a float step below a frame's own time, whose product floors onto that frame, names the frame before.
  for (const [fps, time, frame] of [[25, 0.19999999999999998, 4], [30, 0.7666666666666666, 22]]) {
    assert.deepEqual((await optionsForFrames({ ...input, fps, times: String(time) })).frames.map((f) => f.frame), [frame], `at ${time} s, ${fps} fps`);
    assert.deepEqual((await optionsForFrames({ ...input, fps, times: String(time), select: 'after' })).frames.map((f) => f.frame), [frame + 1], `after ${time} s, ${fps} fps`);
  }
  // Every frame's own time names that frame, and with after the next one, at the rates a video uses.
  for (const fps of [23.976, 24, 25, 29.97, 30, 50, 60]) {
    const last = Math.round(10 * fps) - 1;
    for (let start = 0; start <= last; start += 60) {
      const ns = Array.from({ length: Math.min(60, last + 1 - start) }, (_, i) => start + i);
      const times = ns.map((n) => String(n / fps)).join(',');
      assert.deepEqual((await optionsForFrames({ ...input, fps, times })).frames.map((frame) => frame.frame), ns, `at ${fps} fps from ${start}`);
      const before = ns.filter((n) => n < last);
      if (before.length) assert.deepEqual((await optionsForFrames({ ...input, fps, times: before.map((n) => String(n / fps)).join(','), select: 'after' }))
        .frames.map((frame) => frame.frame), before.map((n) => n + 1), `after at ${fps} fps from ${start}`);
    }
  }
  assert.deepEqual(await readdir(path), []);
});

test('real frames: the time a frame is drawn at names it, and --select after names the next, read from the page', { timeout: 120_000 }, async (t) => {
  const path = await scratch(t), project = join(path, 'project');
  await mkdir(project);
  await writeFile(join(project, 'index.html'), `<!doctype html><style>html,body{margin:0}main{width:4px;height:4px}</style>
    <main data-video-root></main><script>
    function paint(event) { const n = Math.round((event && event.detail ? event.detail.time : 0) * 30);
      document.querySelector('main').style.backgroundColor = \`rgb(\${n & 255},\${n >> 8},0)\`; }
    paint(); addEventListener('video-render:seek', paint);</script>`);
  const { default: sharp } = await ownPackage('sharp');
  const shown = async (select) => {
    const output = join(path, select);
    const result = run(['frames', ...flags({ project, output, width: 4, height: 4, fps: 30, duration: 8.3, workers: 1, times: '4.1,8.2', select })]);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.select, select);
    const drawn = [];
    for (const frame of report.frames) {
      const [r, g] = await sharp(join(output, frame.file)).extract({ left: 2, top: 2, width: 1, height: 1 }).removeAlpha().raw().toBuffer();
      drawn.push([frame.frame, r + 256 * g]);
    }
    return drawn;
  };
  assert.deepEqual(await shown('at'), [[123, 123], [246, 246]]);
  assert.deepEqual(await shown('after'), [[124, 124], [247, 247]]);
});

test('real frames match decoded sequence pixels and PNG bytes at five times, including between frames and past the end', { timeout: 120_000 }, async (t) => {
  const path = await scratch(t), project = join(path, 'project');
  await cp(fixture, project, { recursive: true });
  const source = await inspectProject(project), before = await temporaryRenders();
  const input = { ...values(project, join(path, 'stills')), width: 640, height: 360, gpu: 'hardware', capture: 'screenshot' };
  const result = run(['frames', ...flags({ ...input, times: '2.1,0,0.56,1.25,3' })]);
  assert.equal(result.status, 0, result.stderr); assert.equal(result.stderr, '');
  const report = JSON.parse(result.stdout);
  assert.deepEqual(await temporaryRenders(), before);
  assert.equal(report.output, input.output);
  assert.equal(report.frameCount, 21);
  assert.equal(report.logPath, null); assert.equal(report.hashesPath, null);
  assert.ok(Number.isFinite(report.seconds) && report.seconds >= 0);
  assert.deepEqual(report.frames, JSON.parse(await readFile(join(input.output, 'frames.json'), 'utf8')));
  assert.deepEqual(report.frames.map(({ requestedTime, frame, time, file }) => ({ requestedTime, frame, time, file })), [
    { requestedTime: 2.1, frame: 20, time: 2, file: 'frame_000020.png' },
    { requestedTime: 0, frame: 0, time: 0, file: 'frame_000000.png' },
    { requestedTime: 0.56, frame: 5, time: 0.5, file: 'frame_000005.png' },
    { requestedTime: 1.25, frame: 12, time: 1.2, file: 'frame_000012.png' },
    { requestedTime: 3, frame: 20, time: 2, file: 'frame_000020.png' },
  ]);
  assert.deepEqual((await readdir(input.output)).sort(), ['frame_000000.png', 'frame_000005.png', 'frame_000012.png', 'frame_000020.png', 'frames.json']);
  const sequence = run(['sequence', ...flags({ ...input, output: join(path, 'sequence') })]);
  assert.equal(sequence.status, 0, sequence.stderr); assert.equal(sequence.stderr, '');
  const reference = JSON.parse(sequence.stdout);
  for (const key of ['hyperframesVersion', 'chromeBuild', 'lintFindings', 'gpu', 'capture', 'frameCount', 'hashesSha256']) assert.deepEqual(report[key], reference[key], key);
  const { default: sharp } = await import('sharp');
  const decode = (path) => sharp(path).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (const frame of report.frames) {
    const still = join(input.output, frame.file);
    const original = join(path, 'sequence/frames', `frame_${String(frame.frame + 1).padStart(6, '0')}.png`);
    const decoded = await decode(still), expected = await decode(original);
    assert.equal(decoded.info.width, input.width); assert.equal(decoded.info.height, input.height); assert.equal(decoded.info.channels, 4);
    assert.deepEqual(decoded.data, expected.data, `decoded pixels at ${frame.requestedTime}s`);
    assert.equal(frame.sha256, hash(decoded.data));
    assert.deepEqual(await readFile(still), await readFile(original), `unchanged PNG bytes at ${frame.requestedTime}s`);
  }
  assert.equal(new Set(report.frames.map((frame) => frame.sha256)).size, 4, 'the selected frames must show motion');
  assert.deepEqual((await decode(join(input.output, 'frame_000020.png'))).data,
    (await decode(join(path, 'sequence/frames/frame_000017.png'))).data, 'the finished picture holds through the last frame');
  assert.deepEqual((await inspectProject(project)).files, source.files);
  assert.deepEqual(await temporaryRenders(), before);
  t.diagnostic(JSON.stringify({ frames: report.frames, sequenceFrames: report.frameCount, temporarySequencesRemoved: true }));
});

test('frames removes the complete temporary sequence after a real renderer failure and publishes no stills', {
  timeout: 120_000, skip: process.platform === 'win32' ? 'POSIX executable fixture' : false,
}, async (t) => {
  const path = await scratch(t), project = join(path, 'project'), bin = join(path, 'bin');
  await cp(fixture, project, { recursive: true });
  await mkdir(join(project, '.hyperframes/bin'), { recursive: true });
  await writeFile(join(project, '.hyperframes/bin/ffmpeg'), 'Zibble');
  await mkdir(bin);
  await writeFile(join(bin, 'ffmpeg'), '#!/bin/sh\nif [ ! -f "$0.checked" ]; then\n  : > "$0.checked"\n  printf "ffmpeg version test-fixture\\n"\n  exit 0\nfi\nexit 1\n', { mode: 0o755 });
  const before = await temporaryRenders();
  const result = run(['frames', ...flags({ ...values(project, join(path, 'stills')), times: '0' })], {
    env: { ...process.env, PATH: bin, LANG: 'C', WISER_ALLOW_INSTALL: '0' },
  });
  assert.equal(result.status, 1); assert.equal(result.stdout, '');
  assert.match(result.stderr, /HyperFrames render failed/);
  assert.deepEqual(await temporaryRenders(), before);
  assert.deepEqual((await readdir(path)).sort(), ['bin', 'project']);
});

test('render help works without dependencies, and command-only, unknown and duplicate flags are refused', async (t) => {
  for (const args of [['render', '--help'], ['render', 'help'], ['help', 'render']]) {
    const result = run(args, { env: { PATH: '' } });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    for (const flag of ['profile', 'frame-hashes', 'cache', 'install', 'project', 'output', 'width', 'height', 'fps', 'duration', 'workers', 'gpu', 'capture']) assert.ok(result.stdout.includes(`--${flag}`));
  }
  const path = await scratch(t);
  const before = await readdir(path);
  for (const [args, pattern] of [
    [['render', '--install', '--quality', 'high'], /Unknown flag --quality/],
    [['render', '--profile', 'publish', '--profile', 'intermediate'], /Duplicate flag --profile/],
    [['render', '--frame-hashes', 'a', '--frame-hashes', 'b'], /Duplicate flag --frame-hashes/],
    [['render', '--cache', 'a', '--cache', 'b'], /Duplicate flag --cache/],
    [['render', '--cache'], /--cache needs a value/],
    [['render', '--profile'], /--profile needs a value/],
    [['render', '--frame-hashes', '--install'], /--frame-hashes needs a value/],
    [['render', '--help', '--install'], /Unknown flag --install for help/],
    [['sequence', '--profile', 'publish'], /Unknown flag --profile/],
    [['sequence', '--cache', 'a'], /Unknown flag --cache/],
    [['check', '--cache', 'a'], /Unknown flag --cache/],
    [['check', '--frame-hashes', join(path, 'hashes')], /Unknown flag --frame-hashes/],
  ]) {
    const result = run(args, { env: { PATH: '', WISER_ALLOW_INSTALL: '1' } });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, pattern);
  }
  assert.deepEqual(await readdir(path), before);
});

test('render refuses invalid arguments and unsafe destinations before dependency checks or writes', async (t) => {
  const path = await scratch(t), project = join(path, 'project');
  await cp(fixture, project, { recursive: true });
  const output = join(path, 'new.mp4'), input = values(project, output);
  for (const missing of ['project', 'output', 'width', 'height', 'fps', 'duration']) {
    const options = { ...input };
    delete options[missing];
    const result = run(['render', ...flags(options), '--install'], { env: { PATH: '' } });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, new RegExp(`--${missing}`));
  }
  for (const [change, pattern] of [
    [{ project: 'relative' }, /--project must be an absolute/],
    [{ output: 'relative.mp4' }, /--output must be an absolute/],
    [{ output: join(path, 'new.mov') }, /--output.*\.mp4/],
    [{ width: 319 }, /--width and --height must be even/],
    [{ height: 179 }, /--width and --height must be even/],
    [{ width: 'NaN' }, /--width/], [{ height: 0 }, /--height/],
    [{ fps: 0 }, /--fps/], [{ fps: 0.5, duration: 10 }, /--fps.*round/],
    [{ duration: -1 }, /--duration/], [{ duration: 0.001 }, /round to at least one/],
    [{ workers: 0 }, /--workers/], [{ workers: 'many' }, /--workers/],
    [{ gpu: 'maybe' }, /--gpu/], [{ capture: 'maybe' }, /--capture/],
    [{ profile: 'lossless' }, /--profile/],
    [{ output: join(project, 'inside.mp4') }, /inside --project/],
    [{ output: join(TOOL_DIR, 'new.mp4') }, /inside the tool/],
    [{ 'frame-hashes': 'relative.sha256' }, /--frame-hashes must be an absolute/],
    [{ 'frame-hashes': output }, /--frame-hashes must differ/],
    [{ 'frame-hashes': join(output, 'hashes') }, /cannot contain each other/],
    [{ output: join(path, 'hashes/out.mp4'), 'frame-hashes': join(path, 'hashes') }, /cannot contain each other/],
    [{ 'frame-hashes': join(project, 'hashes') }, /--frame-hashes is inside --project/],
    [{ 'frame-hashes': join(TOOL_DIR, 'hashes') }, /--frame-hashes resolves inside the tool/],
    [{ output: join(path, 'memory/out.mp4') }, /protected/],
    [{ 'frame-hashes': join(path, '.env') }, /protected/],
  ]) {
    const result = run(['render', ...flags({ ...input, ...change }), '--install'], { env: { PATH: '' } });
    assert.equal(result.status, 1, JSON.stringify(change));
    assert.equal(result.stdout, '');
    assert.match(result.stderr, pattern);
  }
  await writeFile(join(path, 'existing.mp4'), 'Zibble');
  await assert.rejects(optionsForRender({ ...input, output: join(path, 'existing.mp4') }), /already exists/);
  await assert.rejects(optionsForRender({ ...input, 'frame-hashes': join(path, 'existing.mp4') }), /--frame-hashes already exists/);
  await symlink(TOOL_DIR, join(path, 'tool-link'));
  await symlink(project, join(path, 'project-link'));
  await assert.rejects(optionsForRender({ ...input, output: join(path, 'tool-link/new/out.mp4') }), /inside the tool/);
  await assert.rejects(optionsForRender({ ...input, 'frame-hashes': join(path, 'project-link/new/hash') }), /inside --project/);
  const missingProbe = run(['render', ...flags(input), '--install'], { env: { PATH: '' } });
  assert.equal(missingProbe.status, 1);
  assert.equal(missingProbe.stdout, '');
  assert.match(missingProbe.stderr, /ffprobe.*ffprobe -version/);
  assert.equal(await readFile(join(path, 'existing.mp4'), 'utf8'), 'Zibble');
  assert.deepEqual((await readdir(path)).sort(), ['existing.mp4', 'project', 'project-link', 'tool-link']);
});

test('metadata checks reject each broken guarantee, and AVC parsing distinguishes IDR from I slices', () => {
  const options = { ...values('/project', '/out.mp4'), profile: 'publish', expectedFrames: 21, gop: 5 };
  const good = { streams: [{ codec_type: 'video', codec_name: 'h264', pix_fmt: 'yuv420p', color_primaries: 'bt709',
    color_transfer: 'bt709', color_space: 'bt709', color_range: 'tv', sample_aspect_ratio: '1:1',
    nb_read_frames: '21', width: 320, height: 180 }],
  frames: Array.from({ length: 21 }, (_, i) => ({ key_frame: i % 5 === 0 ? 1 : 0 })) };
  for (const [change, check] of [
    [(p) => p.streams.push({ codec_type: 'audio' }), 'videoOnly'],
    [(p) => p.streams[0].nb_read_frames = '22', 'frameCount'],
    [(p) => p.frames.pop(), 'frameCount'],
    [(p) => p.streams[0].codec_name = 'hevc', 'h264'],
    [(p) => p.streams[0].pix_fmt = 'yuv444p', 'yuv420p'],
    ...['color_primaries', 'color_transfer', 'color_space', 'color_range'].map((key) => [(p) => p.streams[0][key] = 'unknown', 'bt709TV']),
    [(p) => p.streams[0].sample_aspect_ratio = '2:1', 'squarePixels'],
    [(p) => p.streams[0].width = 640, 'dimensions'],
    [(p) => p.frames[0].key_frame = 0, 'firstFrameKeyframe'],
    [(p) => p.frames[5].key_frame = 0, 'keyframeSpacing'],
    [(p) => p.frames[20].key_frame = 0, 'lastGroup'],
  ]) {
    const broken = structuredClone(good);
    change(broken);
    assert.throws(() => checkMetadata(broken, options), new RegExp(`MP4 check ${check} failed`));
  }
  assert.equal(packetHasIDR(Buffer.from('000000026580', 'hex'), 4), true);
  assert.equal(packetHasIDR(Buffer.from('000000026180', 'hex'), 4), false);
  assert.throws(() => packetHasIDR(Buffer.from('000000056580', 'hex'), 4), /keyframesIDR.*truncated/);
});

test('MP4 box inspection detects nested edit lists without matching compressed payload bytes', async (t) => {
  const path = await scratch(t);
  const box = (type, payload = Buffer.alloc(0)) => {
    const header = Buffer.alloc(8);
    header.writeUInt32BE(8 + payload.length); header.write(type, 4);
    return Buffer.concat([header, payload]);
  };
  for (const [name, data, expected] of [
    ['no.mp4', box('mdat', Buffer.from('elst')), false],
    ['yes.mp4', box('moov', box('trak', box('edts', box('elst')))), true],
  ]) { const file = join(path, name); await writeFile(file, data); assert.equal(await hasEditList(file), expected); }
  const bad = join(path, 'bad.mp4'); await writeFile(bad, Buffer.from([0, 0, 0, 99, 109, 111, 111, 118]));
  await assert.rejects(hasEditList(bad), /noEditList.*invalid box/);
});

test('real render for each profile passes independent ffprobe checks and cleans up its sequence', { timeout: 120_000 }, async (t) => {
  const path = await scratch(t), project = join(path, 'project');
  await cp(fixture, project, { recursive: true });
  // Keep all four steps in the smaller viewport, using the fixture's own responsive stage.
  const css = join(project, 'piece.css');
  await writeFile(css, `${await readFile(css, 'utf8')}\n[data-video-root] { width: 320px; height: 180px; }\n`);
  const source = await readFile(join(project, 'index.html'));
  const before = await temporaryRenders();
  for (const profile of ['publish', 'intermediate']) {
    const output = join(path, `${profile}.mp4`), hashes = join(path, 'decoded.sha256');
    const input = { ...values(project, output), gpu: 'hardware', capture: 'screenshot' };
    // Exercise the default publish profile and explicit intermediate profile.
    if (profile === 'intermediate') input.profile = profile;
    else input['frame-hashes'] = hashes;
    const result = run(['render', ...flags(input)]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    const report = JSON.parse(result.stdout);
    assert.equal(report.profile, profile);
    assert.equal(report.cache, 'off');
    assert.equal(report.key, null);
    assert.equal(report.output, output);
    assert.equal(report.frameCount, 21);
    assert.equal(report.bytes, (await stat(output)).size);
    assert.equal(report.sha256, hash(await readFile(output)));
    assert.equal(report.hyperframesVersion, '0.8.134');
    assert.equal(report.chromeBuild, '152.0.7977.30');
    assert.equal(report.logPath, null);
    assert.equal(report.gpu, 'hardware');
    assert.equal(report.capture, 'screenshot');
    assert.match(report.sequenceHashesSha256, /^[0-9a-f]{64}$/);

    // Independent decoder and packet inspection: do not call the renderer's verification functions.
    const decoded = JSON.parse(probe(['-v', 'error', '-count_frames', '-show_streams', '-show_frames', '-of', 'json', output]).stdout);
    assert.equal(decoded.streams.length, 1);
    const stream = decoded.streams[0];
    assert.equal(stream.codec_type, 'video');
    assert.equal(stream.codec_name, 'h264');
    assert.equal(stream.pix_fmt, 'yuv420p');
    assert.equal(Number(stream.nb_read_frames), 21);
    assert.equal(decoded.frames.length, 21);
    assert.equal(stream.sample_aspect_ratio, '1:1');
    assert.equal(stream.width, 320); assert.equal(stream.height, 180);
    for (const key of ['color_primaries', 'color_transfer', 'color_space']) assert.equal(stream[key], 'bt709');
    assert.equal(stream.color_range, 'tv');
    const trace = probe(['-v', 'trace', '-show_streams', '-of', 'json', output]).stderr;
    assert.doesNotMatch(trace, /type:'elst'/);
    assert.match(trace, /type:'moov'/, 'trace must actually enumerate MP4 boxes');
    for (const check of ['videoOnly', 'frameCount', 'h264', 'yuv420p', 'bt709TV', 'squarePixels', 'dimensions', 'noEditList']) assert.equal(report.checks[check], true);
    if (profile === 'publish') {
      assert.equal(stream.profile, 'High');
      const keys = decoded.frames.flatMap((frame, index) => frame.key_frame ? [index] : []);
      assert.deepEqual(keys, [0, 5, 10, 15, 20]);
      assert.ok(decoded.frames.length - keys.at(-1) <= 5);
      const packets = JSON.parse(probe(['-v', 'error', '-select_streams', 'v:0', '-show_packets', '-show_data', '-of', 'json', output]).stdout).packets;
      assert.equal(packets.length, 21);
      let idrs = 0;
      for (const packet of packets) {
        const bytes = Buffer.from(packet.data.split('\n').filter((line) => /^[0-9a-f]+:/i.test(line))
          .map((line) => line.split(': ')[1].split('  ')[0].replaceAll(' ', '')).join(''), 'hex');
        let idr = false;
        for (let offset = 0; offset < bytes.length;) {
          const length = bytes.readUIntBE(offset, Number(stream.nal_length_size));
          offset += Number(stream.nal_length_size);
          assert.ok(length > 0 && offset + length <= bytes.length);
          if ((bytes[offset] & 31) === 5) idr = true;
          offset += length;
        }
        const frame = decoded.frames.find((frame) => frame.pkt_pos === packet.pos);
        assert.ok(frame);
        assert.equal(idr, frame.key_frame === 1);
        assert.equal(idr, packet.flags.includes('K'));
        if (idr) idrs++;
      }
      assert.equal(idrs, keys.length);
      for (const check of ['firstFrameKeyframe', 'keyframeSpacing', 'lastGroup', 'keyframesIDR', 'decodedFrameHashes']) assert.equal(report.checks[check], true);
      assert.equal(report.hashesPath, hashes);
      const manifest = await readFile(hashes, 'utf8');
      assert.equal(report.hashesSha256, hash(manifest));
      const reference = spawnSync('ffmpeg', ['-v', 'error', '-i', output, '-map', '0:v:0', '-an', '-pix_fmt', 'yuv420p',
        '-fps_mode', 'passthrough', '-f', 'framehash', '-hash', 'sha256', '-'], { encoding: 'utf8', timeout: 30_000 });
      assert.equal(reference.status, 0, reference.stderr);
      assert.equal(manifest, reference.stdout);
    } else {
      assert.equal(report.checks.keyframesIDR, undefined);
      assert.equal(report.hashesPath, null);
      assert.equal(report.hashesSha256, null);
    }
    t.diagnostic(JSON.stringify({ profile, frames: report.frameCount, bytes: report.bytes, sha256: report.sha256, checks: report.checks }));
  }
  assert.deepEqual(await readFile(join(project, 'index.html')), source);
  assert.deepEqual(await temporaryRenders(), before);
  assert.deepEqual((await readdir(path)).sort(), ['decoded.sha256', 'intermediate.mp4', 'project', 'publish.mp4']);
});

test('encode uses the image demuxer, fixed count, required color conversion and separate profiles', () => {
  for (const profile of ['publish', 'intermediate']) {
    const args = encodeArguments('/frames', '/pending.mp4', { fps: 10, expectedFrames: 21, profile, gop: 5 });
    const value = (key) => args[args.indexOf(key) + 1];
    assert.equal(value('-framerate'), '10'); assert.equal(value('-start_number'), '1');
    assert.equal(value('-i'), '/frames/frame_%06d.png'); assert.equal(value('-frames:v'), '21');
    assert.equal(value('-vf'), 'format=rgb24,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv,setsar=1');
    assert.equal(value('-c:v'), 'libx264'); assert.equal(value('-preset'), 'medium');
    assert.equal(value('-movflags'), '+faststart'); assert.equal(value('-use_editlist'), '0');
    assert.equal(value('-fflags'), '+bitexact'); assert.equal(value('-flags:v'), '+bitexact');
    assert.ok(args.includes('-an')); assert.ok(!args.includes('concat')); assert.ok(!args.includes('--quality'));
    if (profile === 'publish') {
      assert.equal(value('-threads'), '4');
      assert.equal(value('-crf'), '16'); assert.equal(value('-g'), '5'); assert.equal(value('-keyint_min'), '5');
      assert.equal(value('-bf'), '2'); assert.equal(value('-sc_threshold'), '0');
      assert.match(value('-x264-params'), /open-gop=0:b-adapt=0:cabac=1/);
    } else {
      assert.equal(value('-crf'), '0'); assert.equal(value('-threads'), '1');
      assert.equal(value('-pix_fmt'), 'yuv420p');
      assert.equal(value('-bsf:v'), 'h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1:video_full_range_flag=0');
      assert.ok(!args.includes('-g')); assert.ok(!args.includes('-keyint_min')); assert.ok(!args.includes('-bf'));
    }
  }
});

test('failed MP4 readback names the check and removes the staged video, sequence and optional hashes', {
  timeout: 120_000, skip: process.platform === 'win32' ? 'POSIX executable fixture' : false,
}, async (t) => {
  const path = await scratch(t), bin = join(path, 'bin');
  await mkdir(bin);
  const binary = spawnSync('/bin/sh', ['-c', 'command -v ffmpeg'], { encoding: 'utf8' });
  assert.equal(binary.status, 0, binary.stderr);
  // Corrupt an actual encode's SAR, leaving the renderer and its validator untouched.
  await writeFile(join(bin, 'ffmpeg'), `#!${process.execPath}\nimport { spawnSync } from 'node:child_process';
const args = process.argv.slice(2);
const filter = args.indexOf('-vf');
if (filter >= 0) args[filter + 1] = args[filter + 1].replace('setsar=1', 'setsar=2');
const child = spawnSync(${JSON.stringify(binary.stdout.trim())}, args, { stdio: 'inherit' });
process.exit(child.status ?? 1);\n`, { mode: 0o755 });
  const before = await temporaryRenders();
  const result = run(['render', ...flags({ ...values(fixture, join(path, 'bad.mp4')), duration: 0.1,
    'frame-hashes': join(path, 'bad.sha256') })], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, WISER_ALLOW_INSTALL: '0' } });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /MP4 check squarePixels failed/);
  assert.deepEqual(await temporaryRenders(), before);
  assert.deepEqual(await readdir(path), ['bin']);
});

async function cacheFixture(t) {
  const path = await scratch(t), project = join(path, 'project'), cache = join(path, 'cache');
  await mkdir(project);
  await writeFile(join(project, 'index.html'), '<main data-video-root style="width:32px;height:24px;background:#123456">Zibble</main>');
  await writeFile(join(project, 'asset.bin'), Buffer.from([0, 255, 1]));
  const options = await optionsForRender({ ...values(project, join(path, 'new.mp4')), width: 32, height: 24, duration: 0.2, cache });
  const versions = { toolVersion: RENDER_VERSION, hyperframesVersion: HYPERFRAMES_VERSION,
    chromeBuild: CHROME_BUILD, ffmpegVersion: 'ffmpeg version cache-test' };
  const inputs = renderCacheInputs(options, versions, (await inspectProject(project)).files);
  const key = cacheKey(inputs), source = join(path, 'lookup-fixture');
  // Unit tests exercise storage and lookup without pretending this fixture is a render.
  const bytes = Buffer.from('Cache lookup fixture, never published as a rendered video.');
  await writeFile(source, bytes);
  const record = { key, inputs, bytes: bytes.length, sha256: hash(bytes),
    frameHashes: Array.from({ length: inputs.frameCount }, (_, i) => `0, ${i}, ${i}, 1, 1152, ${hash(String(i))}\n`).join(''),
    sequenceHashesSha256: hash('sequence'), lintFindings: [], checks: { decodedFrameHashes: true } };
  await writeCache(cache, record, source);
  return { path, project, cache, options, versions, inputs, key, record, source };
}

// Each case is its own test, and uses the same pure function the real renderer uses.
for (const [name, change] of [
  ['project file bytes', async (f) => writeFile(join(f.project, 'asset.bin'), Buffer.from([0, 255, 2]))],
  ['file added', async (f) => writeFile(join(f.project, 'new.bin'), Buffer.from([0, 255, 1]))],
  ['file renamed', async (f) => rename(join(f.project, 'asset.bin'), join(f.project, 'renamed.bin'))],
  ['width', async (f) => { f.options.width += 2; }],
  ['height', async (f) => { f.options.height += 2; }],
  ['fps', async (f) => { f.options.fps += 1; }],
  ['duration', async (f) => { f.options.duration += 0.1; }],
  ['profile', async (f) => { f.options.profile = 'intermediate'; }],
  ['GPU mode', async (f) => { f.options.gpu = 'software'; }],
  ['capture mode', async (f) => { f.options.capture = 'fast'; }],
  ['tool version constant', async (f) => { f.versions.toolVersion = `${RENDER_VERSION}-changed`; }],
  ['FFmpeg version line', async (f) => { f.versions.ffmpegVersion = 'ffmpeg version changed'; }],
  ['HyperFrames version', async (f) => { f.versions.hyperframesVersion = '0.8.135'; }],
  ['Chrome build', async (f) => { f.versions.chromeBuild = '152.0.7977.31'; }],
]) test(`cache misses when only ${name} changes`, async (t) => {
  const f = await cacheFixture(t);
  assert.ok((await readCache(f.cache, f.key, f.inputs, ['decodedFrameHashes'])).record);
  await change(f);
  f.options.expectedFrames = Math.round(f.options.duration * f.options.fps);
  f.options.gop = Math.round(f.options.fps / 2);
  const changed = renderCacheInputs(f.options, f.versions, (await inspectProject(f.project)).files);
  const key = cacheKey(changed);
  assert.notEqual(key, f.key);
  assert.deepEqual(await readCache(f.cache, key, changed, ['decodedFrameHashes']), { record: null, reason: null });
  assert.ok((await readCache(f.cache, f.key, f.inputs, ['decodedFrameHashes'])).record, 'the old entry is retained for its original inputs');
});

test('cache inputs are canonical, complete, pure and exclude workers, destinations and environment', async (t) => {
  const f = await cacheFixture(t), files = (await inspectProject(f.project)).files;
  const before = structuredClone({ options: f.options, versions: f.versions, files });
  const inputs = renderCacheInputs(f.options, f.versions, files);
  assert.deepEqual({ options: f.options, versions: f.versions, files }, before);
  assert.deepEqual(Object.keys(inputs).sort(), ['toolVersion', 'hyperframesVersion', 'chromeBuild', 'ffmpegVersion',
    'gpu', 'capture', 'width', 'height', 'fps', 'duration', 'frameCount', 'profile', 'bridgeSha256', 'browserSwitches', 'encoderArguments', 'files'].sort());
  assert.deepEqual(inputs.encoderArguments, encodeArguments('<frames>', '<output>.mp4', f.options));
  assert.deepEqual(inputs.browserSwitches, BROWSER_SWITCHES);
  const reordered = Object.fromEntries(Object.entries(inputs).reverse());
  assert.equal(canonicalJSON(inputs), canonicalJSON(reordered));
  assert.equal(f.key, hash(canonicalJSON(inputs)));
  for (const workers of [2, 'auto']) {
    const same = renderCacheInputs({ ...f.options, workers, output: '/different.mp4', project: '/different',
      cache: '/another-cache', frameHashes: '/hashes', arbitraryEnvironment: 'ignored' }, f.versions, files.toReversed());
    assert.equal(cacheKey(same), f.key);
    assert.ok((await readCache(f.cache, cacheKey(same), same, ['decodedFrameHashes'])).record);
  }
  const changedFrameCount = { ...inputs, frameCount: inputs.frameCount + 1 };
  assert.notEqual(cacheKey(changedFrameCount), f.key);
  const changedEncoder = { ...inputs, encoderArguments: [...inputs.encoderArguments, '-extra-test-argument'] };
  assert.notEqual(cacheKey(changedEncoder), f.key);
  assert.equal(renderCacheInputs(f.options, { ...f.versions, toolVersion: undefined }, files).toolVersion, RENDER_VERSION);
  assert.deepEqual(inputs.files, [
    { path: 'asset.bin', sha256: hash(Buffer.from([0, 255, 1])) },
    { path: 'index.html', sha256: hash(await readFile(join(f.project, 'index.html'))) },
  ]);
  const firstLine = 'ffmpeg version key-input';
  assert.equal(ffmpegSurvey(() => ({ status: 0, stdout: `${firstLine}\nbuild details\n` })).version, firstLine);
  assert.equal(ffmpegSurvey(() => ({ status: 0, stdout: `unexpected preamble\n${firstLine}\n` })).present, false);
});

test('cache path screening precedes dependency checks and resolves aliases and missing parents', async (t) => {
  const path = await scratch(t), project = join(path, 'project'), credentials = join(path, 'credentials');
  await mkdir(project); await mkdir(credentials);
  // Empty credential-name fixtures are never opened by the path screen.
  await writeFile(join(credentials, '.env.test'), '');
  await mkdir(join(path, 'memory'));
  await symlink(TOOL_DIR, join(path, 'tool-link'));
  await symlink(project, join(path, 'project-link'));
  await symlink(credentials, join(path, 'credential-link'));
  await symlink(join(path, 'memory'), join(path, 'memory-link'));
  await symlink(join(path, 'absent'), join(path, 'dangling'));
  await writeFile(join(path, 'not-a-directory'), 'Zibble');
  const input = values(project, join(path, 'out.mp4'));
  for (const [cache, pattern] of [
    ['relative', /--cache must be an absolute/],
    [join(TOOL_DIR, 'new-cache'), /--cache.*inside the tool/],
    [join(path, 'tool-link/missing/cache'), /--cache.*inside the tool/],
    [join(project, 'new-cache'), /--cache.*inside --project/],
    [join(path, 'project-link/missing/cache'), /--cache.*inside --project/],
    [credentials, /--cache.*credential/],
    [join(path, 'credential-link/missing/cache'), /--cache.*credential/],
    [join(path, 'memory/cache'), /--cache.*protected/],
    [join(path, 'memory-link/cache'), /--cache.*protected/],
    [join(path, '.env.cache'), /--cache.*protected/],
    [join(path, 'dangling/cache'), /--cache.*canonicalized/],
    [join(path, 'not-a-directory'), /--cache must name a directory/],
    [join(path, 'out.mp4/child'), /cannot contain each other/],
    [path, /cannot contain each other/],
  ]) {
    const result = run(['render', ...flags({ ...input, cache }), '--install'], { env: { PATH: '' } });
    assert.equal(result.status, 1, cache); assert.equal(result.stdout, ''); assert.match(result.stderr, pattern);
  }
  await symlink(path, join(path, 'work-link'));
  assert.equal((await optionsForRender({ ...input, cache: join(path, 'work-link/new/cache') })).cache, join(path, 'new/cache'));
  await mkdir(join(path, 'cache'));
  assert.equal((await optionsForRender({ ...input, cache: join(path, 'cache') })).cache, join(path, 'cache'));
});

for (const [name, corrupt, pattern] of [
  ['unreadable JSON', async (f) => writeFile(join(f.cache, `${f.key}.json`), '{'), /record cannot be read/],
  ['incomplete pair', async (f) => rm(join(f.cache, `${f.key}.json`)), /incomplete/],
  ['altered MP4 of the same length', async (f) => {
    const file = join(f.cache, `${f.key}.mp4`), bytes = await readFile(file); bytes[0] ^= 1; await writeFile(file, bytes);
  }, /SHA-256/],
  ['missing frame hash list', async (f) => {
    delete f.record.frameHashes; await writeFile(join(f.cache, `${f.key}.json`), JSON.stringify(f.record));
  }, /invalid or incomplete/],
  ['wrong input record', async (f) => {
    f.record.inputs.width += 2; await writeFile(join(f.cache, `${f.key}.json`), JSON.stringify(f.record));
  }, /invalid or incomplete/],
  ['symbolic link', async (f) => {
    await rm(join(f.cache, `${f.key}.mp4`)); await symlink(f.source, join(f.cache, `${f.key}.mp4`));
  }, /link or non-regular/],
  ['hard link', async (f) => {
    await rm(join(f.cache, `${f.key}.mp4`)); await link(f.source, join(f.cache, `${f.key}.mp4`));
  }, /link or non-regular/],
]) test(`cache removes a bad entry with ${name} and reports a miss reason`, async (t) => {
  const f = await cacheFixture(t), original = structuredClone(f.inputs);
  await writeFile(join(f.cache, 'unrelated'), 'Zibble');
  await corrupt(f);
  const result = await readCache(f.cache, f.key, original, ['decodedFrameHashes']);
  assert.equal(result.record, null); assert.match(result.reason, pattern);
  assert.deepEqual(await readdir(f.cache), ['unrelated']);
  assert.equal(hash(await readFile(f.source)), hash('Cache lookup fixture, never published as a rendered video.'));
});

test('real cache hit copies identical bytes and hashes; workers alone hit; corruption misses and is replaced', { timeout: 120_000 }, async (t) => {
  const path = await scratch(t), project = join(path, 'project'), cache = join(path, 'cache');
  await mkdir(project);
  await writeFile(join(project, 'index.html'), '<main data-video-root style="width:32px;height:24px;background:#123456"></main>');
  const input = { ...values(project, join(path, 'first.mp4')), cache, width: 32, height: 24, duration: 0.2 };
  const before = await temporaryRenders();
  const execute = (options) => {
    const result = run(['render', ...flags(options)]);
    assert.equal(result.status, 0, result.stderr); assert.equal(result.stderr, '');
    return JSON.parse(result.stdout);
  };
  // No hash output requested on the miss: the entry must still retain the decoded list.
  const first = execute(input);
  assert.equal(first.cache, 'miss'); assert.match(first.key, /^[0-9a-f]{64}$/); assert.equal(first.cacheReason, undefined);
  const cached = JSON.parse(await readFile(join(cache, `${first.key}.json`), 'utf8'));
  assert.equal(cached.key, first.key); assert.equal(cacheKey(cached.inputs), first.key);
  assert.equal(cached.inputs.hyperframesVersion, HYPERFRAMES_VERSION); assert.equal(cached.inputs.chromeBuild, CHROME_BUILD);
  assert.equal(cached.inputs.toolVersion, RENDER_VERSION);
  const ffmpeg = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
  assert.equal(cached.inputs.ffmpegVersion, ffmpeg.stdout.split(/\r?\n/)[0]);
  assert.equal(cached.bytes, first.bytes); assert.equal(cached.sha256, first.sha256);
  const second = execute({ ...input, output: join(path, 'second.mp4'), 'frame-hashes': join(path, 'decoded.sha256') });
  assert.equal(second.cache, 'hit'); assert.equal(second.key, first.key); assert.equal(second.sha256, first.sha256);
  assert.deepEqual(await readFile(second.output), await readFile(first.output));
  assert.equal(await readFile(second.hashesPath, 'utf8'), cached.frameHashes);
  const reference = spawnSync('ffmpeg', ['-v', 'error', '-i', second.output, '-map', '0:v:0', '-an', '-pix_fmt', 'yuv420p',
    '-fps_mode', 'passthrough', '-f', 'framehash', '-hash', 'sha256', '-'], { encoding: 'utf8' });
  assert.equal(reference.status, 0, reference.stderr); assert.equal(cached.frameHashes, reference.stdout);
  assert.equal(second.hashesSha256, hash(reference.stdout));
  const workers = execute({ ...input, output: join(path, 'workers.mp4'), workers: 2 });
  assert.equal(workers.cache, 'hit'); assert.equal(workers.key, first.key);
  assert.deepEqual(await readFile(workers.output), await readFile(first.output));
  const corrupt = await readFile(join(cache, `${first.key}.mp4`)); corrupt[corrupt.length - 1] ^= 1;
  await writeFile(join(cache, `${first.key}.mp4`), corrupt);
  const replaced = execute({ ...input, output: join(path, 'replaced.mp4') });
  assert.equal(replaced.cache, 'miss'); assert.equal(replaced.key, first.key); assert.match(replaced.cacheReason, /SHA-256/);
  const replacement = JSON.parse(await readFile(join(cache, `${first.key}.json`), 'utf8'));
  assert.equal(replacement.sha256, hash(await readFile(join(cache, `${first.key}.mp4`))));
  assert.deepEqual(await readFile(replaced.output), await readFile(join(cache, `${first.key}.mp4`)));
  const last = execute({ ...input, output: join(path, 'last.mp4') });
  assert.equal(last.cache, 'hit'); assert.equal(last.cacheReason, undefined);
  assert.deepEqual((await readdir(cache)).sort(), [`${first.key}.json`, `${first.key}.mp4`]);
  assert.deepEqual(await temporaryRenders(), before);
  t.diagnostic(JSON.stringify({ first: first.cache, second: second.cache, workers: workers.cache,
    replaced: replaced.cache, reason: replaced.cacheReason, last: last.cache, frames: first.frameCount }));
});
