import './browser-home.mjs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { CHROME_BUILD, TOOL_DIR, ownPackage } from '../scripts/dependencies.mjs';
import { BROWSER_SWITCHES, NETWORK_GUARD, browserPath, childEnvironment, renderEnvironment, sequence, writeBrowserWrapper } from '../scripts/sequence.mjs';
import { BRIDGE, inspectProject, protectedPath, remoteReference } from '../scripts/project.mjs';
import { cacheKey, fileHash, readCache, writeCache } from '../scripts/cache.mjs';
import { renderCacheInputs } from '../scripts/render.mjs';

const cli = join(TOOL_DIR, 'scripts/video-render.js');
const fixture = fileURLToPath(new URL('./fixtures/steps/', import.meta.url));
const flags = (values) => Object.entries(values).flatMap(([key, value]) => [`--${key}`, String(value)]);
const values = (project, output) => ({ project, output, width: 32, height: 24, fps: 10, duration: 0.2, workers: 1 });
const data = (type, content, base64 = false) => `data:${type}${base64 ? ';base64' : ''},${base64 ? Buffer.from(content).toString('base64') : encodeURIComponent(content)}`;
const attr = (value) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
const image = (url) => `<img src="${attr(url)}">`;
async function scratch(t) {
  const path = await mkdtemp(join(tmpdir(), 'wiser-video-review-test-'));
  t.after(() => rm(path, { recursive: true, force: true }));
  return realpath(path);
}

// These traps run before the command's modules load. A refusal must name the
// offending input, rather than reaching any read, copy, runtime probe or process.
function guarded(args, readPath = null) {
  const script = `
    import fs from 'node:fs/promises';
    import child from 'node:child_process';
    import { syncBuiltinESMExports } from 'node:module';
    const originalRead = fs.readFile;
    fs.readFile = function (path, ...rest) {
      if (/(?:^|[/\\\\])(?:credentials(?:\\.json)?|\\.env(?:\\..*)?|[^/\\\\]+\\.env)$/i.test(String(path))) throw new Error('credential bytes were read');
      if (String(path).includes('/node_modules/hyperframes/package.json')) throw new Error('prepareRuntime started');
      return originalRead.call(this, path, ...rest);
    };
    fs.cp = fs.mkdtemp = async function () { throw new Error('temporary project started'); };
    child.spawn = child.spawnSync = child.execFile = function () { throw new Error('browser or process started'); };
    syncBuiltinESMExports();
    if (${JSON.stringify(readPath)}) {
      const { readFile } = await import('node:fs/promises');
      await readFile(${JSON.stringify(readPath)});
    }
    const { main } = await import(${JSON.stringify(pathToFileURL(cli).href)});
    await main(${JSON.stringify(args)});
  `;
  return spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8', timeout: 30_000, env: { ...process.env, WISER_ALLOW_INSTALL: '0' },
  });
}

const originCases = [
  ['data CSS percent decoded', image(data('text/css', '@import "https://example.invalid/nested.css";')), 'src data:text/css @import'],
  ['data CSS base64 decoded', `<style>@import "${data('text/css', 'a{background:url(https://example.invalid/a)}', true)}";</style>`, 'data:text/css url()'],
  ['data HTML percent decoded', `<iframe src="${attr(data('text/html', image('https://example.invalid/a')))}"></iframe>`, 'data:text/html src'],
  ['data HTML base64 decoded', image(data('text/html', image('https://example.invalid/a'), true)), 'data:text/html src'],
  ['data HTML MIME whitespace', image(data(' text/html ; base64', Buffer.from(image('https://example.invalid/a')).toString('base64'))), 'data:text/html src'],
  ['data HTML UTF-16 decoded', image(`data:text/html;charset=utf-16le;base64,${Buffer.from(image('https://example.invalid/a'), 'utf16le').toString('base64')}`), 'data:text/html src'],
  ['data SVG percent decoded', image(data('image/svg+xml', '<svg><image href="https://example.invalid/a"/></svg>')), 'data:image/svg+xml href'],
  ['data SVG base64 decoded', `<style>a{background:url("${data('image/svg+xml', '<svg><image href="https://example.invalid/a"/></svg>', true)}")}</style>`, 'data:image/svg+xml href'],
  ['iframe srcdoc', `<iframe srcdoc="${attr(image('https://example.invalid/a'))}"></iframe>`, 'srcdoc src'],
  ['nested iframe srcdoc', `<iframe srcdoc="${attr(`<iframe srcdoc="${attr(image('https://example.invalid/a'))}"></iframe>`)}"></iframe>`, 'srcdoc srcdoc src'],
  ['meta refresh', '<meta content="0; URL=https://example.invalid/a" http-equiv="ReFrEsH">', 'meta refresh content'],
  ['meta refresh quoted URL', '<meta http-equiv="refresh" content="0;url=&#39;https://example.invalid/a&#39;">', 'meta refresh content'],
  ...['fill', 'filter', 'mask', 'clip-path', 'marker-start', 'data-note'].map((name) => [
    `attribute ${name}`, `<svg><path ${name}="url(https://example.invalid/a)"/></svg>`, `${name} url()`,
  ]),
  ...['action', 'formaction', 'background'].map((name) => [`attribute ${name}`, `<form ${name}="https://example.invalid/a"></form>`, name]),
  ['attribute ping list', '<a ping="local https://example.invalid/a next">Link</a>', 'ping'],
  ['CSS image-set string', '<style>a{background:image-set("local.png" 1x, "https://example.invalid/a" 2x)}</style>', 'image-set()'],
  ['CSS -webkit-image-set string', '<style>a{background:-webkit-image-set("https://example.invalid/a" 1x)}</style>', '-webkit-image-set()'],
  ['CSS image-set escaped string', '<style>a{background:image-set("https\\3a //example.invalid/a" 1x)}</style>', 'image-set()'],
  ['link imagesrcset', '<link rel="preload" as="image" href="local.png" imagesrcset="https://example.invalid/a.png 2x">', 'imagesrcset'],
  ['markup after an empty comment', '<!--><img src="https://example.invalid/a">', 'src'],
  ['markup after an empty comment with a dash', '<!---><img src="https://example.invalid/a">', 'src'],
  ['markup after a comment closed by --!>', '<!-- x --!><img src="https://example.invalid/a">', 'src'],
  ['CSS image-set nested data', `<style>a{background:image-set("${data('image/svg+xml', '<svg><image href="https://example.invalid/a"/></svg>', true)}" 1x)}</style>`, 'image-set() data:image/svg+xml href'],
];
let nested = '<main>Local</main>';
for (let i = 0; i < 4; i++) nested = `<iframe src="${attr(data('text/html', nested, true))}"></iframe>`;
originCases.push(['data URL nesting beyond three', nested, 'data URL nesting exceeds depth 3']);

for (const [name, content, rule] of originCases) test(`origin screen refuses ${name} before runtime, copies or browsers`, async (t) => {
  const path = await scratch(t), project = join(path, 'project');
  await mkdir(project);
  await writeFile(join(project, 'index.html'), `<main data-video-root>${content}</main>`);
  for (const command of ['sequence', 'render', 'frames']) {
    const options = values(project, join(path, command === 'render' ? 'out.mp4' : 'out'));
    if (command === 'frames') options.times = '0';
    const result = guarded([command, ...flags(options)]);
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stdout, '');
    assert.ok(result.stderr.includes('Project file index.html references '), result.stderr);
    assert.ok(result.stderr.includes(rule), result.stderr);
    assert.doesNotMatch(result.stderr, /prepareRuntime started|temporary project started|browser or process started/);
  }
  assert.deepEqual(await readdir(path), ['project']);
});

test('embedded local content at depth three, namespaces and script text remain allowed', async (t) => {
  const path = await scratch(t);
  let local = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><script>const site = "https://example.invalid/a";</script></svg>';
  for (let i = 0; i < 3; i++) local = image(data(i === 0 ? 'image/svg+xml' : 'text/html', local, i % 2 === 0));
  await writeFile(join(path, 'index.html'), `<main data-video-root>${local}<svg xmlns="http://www.w3.org/2000/svg"><script>const site = "https://example.invalid/a";</script></svg></main>`);
  await inspectProject(path);
  assert.equal(remoteReference('a{background:image-set("local.png" type("image/png") 1x);content:"image-set(https://example.invalid/a)"}', '.css'), null);
  assert.equal(remoteReference('<img src="data:image/png;base64,AAAA">', '.html'), null);
});

for (const name of ['credentials.json', 'production.env']) test(`project refuses ${name} before its bytes are read or copied`, async (t) => {
  const path = await scratch(t), project = join(path, 'project');
  await mkdir(project);
  await writeFile(join(project, 'index.html'), '<main data-video-root>Local</main>');
  await writeFile(join(project, name), '');
  const readControl = guarded([], join(project, name));
  assert.equal(readControl.status, 1);
  assert.match(readControl.stderr, /credential bytes were read/);
  for (const command of ['sequence', 'render', 'frames']) {
    const options = values(project, join(path, command === 'render' ? 'out.mp4' : 'out'));
    if (command === 'frames') options.times = '0';
    const result = guarded([command, ...flags(options)]);
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stdout, '');
    assert.ok(result.stderr.includes(`Project file ${name} is a protected`), result.stderr);
    assert.doesNotMatch(result.stderr, /credential bytes were read|prepareRuntime started|temporary project started|browser or process started/);
  }
  assert.deepEqual(await readdir(path), ['project']);
});

test('every caller path uses the same protected component check, including canonical aliases', async (t) => {
  const path = await scratch(t), project = join(path, 'project');
  await mkdir(project);
  await writeFile(join(project, 'index.html'), '<main data-video-root>Local</main>');
  for (const name of ['memory', '.env', '.env.local', 'production.env', 'credentials.json', 'credentials']) {
    assert.equal(protectedPath(join(path, name, 'child')), true);
    for (const flag of ['project', 'output', 'frame-hashes', 'cache']) {
      const result = guarded(['render', ...flags({ ...values(project, join(path, 'out.mp4')), [flag]: join(path, name) })]);
      assert.equal(result.status, 1, result.stderr);
      assert.ok(result.stderr.includes(`--${flag} names a protected`), result.stderr);
    }
  }
  await mkdir(join(path, 'production.env'));
  await symlink(join(path, 'production.env'), join(path, 'alias'));
  const result = guarded(['render', ...flags({ ...values(project, join(path, 'out.mp4')), cache: join(path, 'alias/cache') })]);
  assert.match(result.stderr, /--cache resolves to a protected/);
});

test('refusal instrumentation detects a valid project reaching a dependency process', async (t) => {
  const path = await scratch(t), project = join(path, 'project');
  await mkdir(project);
  await writeFile(join(project, 'index.html'), '<main data-video-root>Local</main>');
  const result = guarded(['sequence', ...flags(values(project, join(path, 'out')))]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /browser or process started/);
});

test('Chrome 152 render forces reduced motion false, with an opposite-switch true control', { timeout: 120_000 }, async (t) => {
  const path = await scratch(t), project = join(path, 'project');
  await mkdir(project);
  await writeFile(join(project, 'index.html'), `<!doctype html><style>html,body{margin:0}main{width:32px;height:24px}</style>
    <main data-video-root></main><script>
    function paint() { const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      document.querySelector('main').style.backgroundColor = reduced ? 'rgb(255,0,0)' : 'rgb(0,255,0)'; }
    paint(); addEventListener('video-render:seek', paint);</script>`);
  const { default: sharp } = await ownPackage('sharp');
  const render = async (output, runtime) => {
    const report = await sequence(values(project, output), { runtime });
    assert.equal(report.chromeBuild, CHROME_BUILD);
    assert.equal(report.frameCount, 2);
    const pixels = [];
    for (const file of (await readdir(join(output, 'frames'))).filter((name) => name.endsWith('.png'))) {
      const pixel = await sharp(join(output, 'frames', file)).extract({ left: 16, top: 12, width: 1, height: 1 }).removeAlpha().raw().toBuffer();
      pixels.push([...pixel]);
    }
    return pixels;
  };
  assert.deepEqual(await render(join(path, 'normal')), [[0, 255, 0], [0, 255, 0]]);
  // Each switch alone, in the pinned Chrome launched directly, never appended to the production list: the reduce
  // switch must turn the feature on, so the pair shows the switch family is read; and the production switch must
  // be compiled into the pinned binary by its exact name.
  const { default: puppeteer } = await ownPackage('puppeteer-core');
  const alone = async (flag) => {
    const browser = await puppeteer.launch({ executablePath: await browserPath(), headless: true,
      args: ['--no-sandbox', flag], userDataDir: join(path, `profile${flag}`) });
    try {
      const page = await browser.newPage();
      await page.setContent('<p>x</p>');
      return await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
    } finally { await browser.close(); }
  };
  assert.equal(await alone('--force-prefers-reduced-motion'), true);
  assert.equal(await alone('--force-prefers-no-reduced-motion'), false);
  const binary = await readFile(await browserPath());
  assert.ok(binary.includes(Buffer.from('force-prefers-no-reduced-motion')), 'the production switch is compiled into the pinned Chrome');
  assert.ok(BROWSER_SWITCHES.includes('--force-prefers-no-reduced-motion'));
  t.diagnostic(`Chrome ${CHROME_BUILD}: alone, --force-prefers-reduced-motion => true and --force-prefers-no-reduced-motion => false; the production render => false (green).`);
});

test('changing only the wrapper switch list causes a cache miss', async (t) => {
  const path = await scratch(t), cache = join(path, 'cache'), source = join(path, 'fixture');
  const inputs = renderCacheInputs({ ...values('/project', '/out.mp4'), expectedFrames: 2, profile: 'publish', gop: 5, gpu: 'hardware', capture: 'screenshot' },
    { hyperframesVersion: '0.8.134', chromeBuild: CHROME_BUILD, ffmpegVersion: 'fixture' }, []);
  assert.deepEqual(inputs.browserSwitches, BROWSER_SWITCHES);
  const key = cacheKey(inputs);
  await writeFile(source, 'cache lookup fixture');
  const sha256 = await fileHash(source);
  await writeCache(cache, { key, inputs, bytes: Buffer.byteLength('cache lookup fixture'), sha256,
    frameHashes: `0, 0, 0, 1, 1152, ${sha256}\n0, 1, 1, 1, 1152, ${sha256}\n`,
    sequenceHashesSha256: sha256, lintFindings: [], checks: {} }, source);
  assert.ok((await readCache(cache, key, inputs, [])).record);
  const changed = { ...inputs, browserSwitches: inputs.browserSwitches.map((flag) => flag.replace('--force-prefers-no-reduced-motion', '--force-prefers-reduced-motion')) };
  assert.notEqual(cacheKey(changed), key);
  assert.deepEqual(await readCache(cache, cacheKey(changed), changed, []), { record: null, reason: null });
  assert.deepEqual((await readdir(cache)).sort(), [`${key}.json`, `${key}.mp4`]);
});

test('check names missing ffprobe and reports unready even with FFmpeg, packages and Chrome', { timeout: 60_000 }, async (t) => {
  const path = await scratch(t), bin = join(path, 'bin');
  await mkdir(bin);
  await writeFile(join(bin, 'ffmpeg'), '#!/bin/sh\nprintf "ffmpeg version fixture\\n"\n', { mode: 0o755 });
  const result = spawnSync(process.execPath, [cli, 'check'], { encoding: 'utf8', timeout: 60_000, env: { ...process.env, PATH: bin, WISER_ALLOW_INSTALL: '0' } });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  const report = JSON.parse(result.stdout);
  assert.equal(report.ffmpeg.present, true);
  assert.equal(report.hyperframes.ok, true);
  assert.equal(report.chrome.launches, true, JSON.stringify(report.chrome));
  assert.deepEqual(report.ffprobe, { present: false, version: null, check: 'ffprobe -version' });
  assert.equal(report.ready, false);
});

test('bridge forwards seeks without hiding animations or replacing Element.animate', async () => {
  const { runInNewContext } = await import('node:vm');
  const listeners = new Map(), forwarded = [];
  const getAnimations = () => ['live animation'];
  const patchedAnimate = () => 'adapter';
  const Element = function () {};
  Element.prototype.animate = patchedAnimate;
  Element.prototype.__hfOriginalAnimate = () => 'original';
  const document = { readyState: 'complete', getAnimations };
  const window = { Element, addEventListener: (name, fn) => listeners.set(name, fn), dispatchEvent: (event) => forwarded.push(event) };
  runInNewContext(BRIDGE, { window, document, Element, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } } });
  listeners.get('hf-seek')({ detail: { time: 0.75 } });
  assert.equal(document.getAnimations, getAnimations);
  assert.equal(Element.prototype.animate, patchedAnimate);
  assert.deepEqual(forwarded.map((event) => [event.type, event.detail.time]), [['video-render:seek', 0], ['video-render:seek', 0.75]]);
});

test('four-step fixture at 0.33 seconds and 10 fps renders exactly three frames', { timeout: 120_000 }, async (t) => {
  const path = await scratch(t), project = join(path, 'project'), output = join(path, 'out.mp4');
  await cp(fixture, project, { recursive: true });
  const result = spawnSync(process.execPath, [cli, 'render', ...flags({ ...values(project, output), width: 640, height: 360, duration: 0.33 })],
    { encoding: 'utf8', timeout: 120_000, env: { ...process.env, WISER_ALLOW_INSTALL: '0' } });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.equal(JSON.parse(result.stdout).frameCount, 3);
  const decoded = spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-show_entries', 'stream=nb_read_frames', '-of', 'json', output], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(decoded.status, 0, decoded.stderr);
  assert.equal(Number(JSON.parse(decoded.stdout).streams[0].nb_read_frames), 3);
  t.diagnostic('0.33 s x 10 fps: renderer reports 3 frames; independent ffprobe decodes 3 frames.');
});

test('the bridge script is a cache key input, so a change to it alone is a miss', async () => {
  const { createHash } = await import('node:crypto');
  const options = { width: 2, height: 2, fps: 1, duration: 1, expectedFrames: 1, profile: 'publish', gop: 1, gpu: 'hardware', capture: 'screenshot' };
  const versions = { hyperframesVersion: '0.8.134', chromeBuild: CHROME_BUILD, ffmpegVersion: 'fixture' };
  const inputs = renderCacheInputs(options, versions, []);
  assert.equal(inputs.bridgeSha256, createHash('sha256').update(BRIDGE).digest('hex'));
  const changed = { ...inputs, bridgeSha256: createHash('sha256').update(BRIDGE + ' ').digest('hex') };
  assert.notEqual(cacheKey(changed), cacheKey(inputs));
});

test('a project holding a credential file deep in its tree is refused before any of its files is read', async (t) => {
  const path = await scratch(t), project = join(path, 'project');
  await mkdir(join(project, 'z', 'deeper'), { recursive: true });
  await writeFile(join(project, 'index.html'), '<main data-video-root>Local</main>');
  // A file listed first whose read would fail: any read before the refusal surfaces as EACCES instead.
  await writeFile(join(project, 'a.html'), '<p>unreadable</p>');
  await chmod(join(project, 'a.html'), 0o000);
  t.after(() => chmod(join(project, 'a.html'), 0o600).catch(() => {}));
  for (const name of ['credentials.json', 'production.env', '.env.local']) {
    const file = join(project, 'z', 'deeper', name);
    await writeFile(file, 'secret');
    await assert.rejects(inspectProject(project), (error) => /deeper.*is a protected memory or credential path/.test(error.message) && !/EACCES/.test(error.message));
    await rm(file);
  }
  await assert.rejects(inspectProject(project), /EACCES/, 'the control: with no credential file, the unreadable file is read');
});

test('the render browser rasterizes on the CPU and redraws every changed tile in full', () => {
  assert.ok(BROWSER_SWITCHES.includes('--disable-gpu-rasterization'));
  assert.ok(BROWSER_SWITCHES.includes('--disable-partial-raster'));
});

test('a counted figure draws the same frames at one worker and four', { timeout: 240_000 }, async (t) => {
  // A worker opens the page fresh at its own first frame. On Chrome 152 the GPU raster and partial tile redraws each
  // made that history show in the pixels: this figure differed on 119 of 150 frames with neither switch, and on one,
  // the first a worker drew mid-count, with only the CPU raster.
  const path = await scratch(t), project = join(path, 'project');
  await cp(fileURLToPath(new URL('./fixtures/counted/', import.meta.url)), project, { recursive: true });
  const once = fileURLToPath(new URL('../../../skills/Animated Explainer/starters/once/', import.meta.url));
  for (const file of ['once.js', 'once.css']) await cp(join(once, file), join(project, file));
  const hashes = async (workers) => {
    const report = await sequence({ project, output: join(path, `w${workers}`), width: 1280, height: 720, fps: 25, duration: 6, workers });
    assert.equal(report.frameCount, 150);
    return (await readFile(report.hashesPath, 'utf8')).trim().split('\n').map((line) => line.slice(0, 64));
  };
  const one = await hashes(1), four = await hashes(4);
  const differing = one.map((hash, i) => (hash === four[i] ? null : i)).filter((i) => i !== null);
  assert.deepEqual(differing, [], `frames differing between one worker and four: ${differing.join(', ')}`);
  assert.ok(new Set(one).size > 10, 'the figure must move');
});

test('the network guard refuses every host but this machine inside a Node process, before any lookup', async () => {
  // The child serves itself on loopback: spawnSync holds this process, so a server here could not answer.
  const script = `
    const { createServer } = await import('node:http');
    const server = createServer((request, response) => response.end('local'));
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const out = {};
    for (const url of ['https://example.invalid/', 'http://203.0.113.9/', 'https://fonts.googleapis.com/css2?family=Inter']) {
      try { await fetch(url); out[url] = 'reached'; } catch (error) { out[url] = String(error.cause?.message ?? error.message); }
    }
    const dns = await import('node:dns');
    for (const [name, query] of [['lookup', () => dns.promises.lookup('example.com')], ['resolve4', () => new dns.promises.Resolver().resolve4('example.com')],
      ['callback', () => new Promise((resolve, reject) => new dns.Resolver().resolve6('example.com', (error, value) => (error ? reject(error) : resolve(value))))]]) {
      try { await query(); out[name] = 'resolved'; } catch (error) { out[name] = error.message; }
    }
    out.localLookup = (await dns.promises.lookup('localhost')).address;
    out.local = await (await fetch('http://127.0.0.1:' + server.address().port + '/')).text();
    server.close();
    console.log(JSON.stringify(out));`;
  const guarded = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 30_000,
    env: { ...process.env, NODE_OPTIONS: `--import=${pathToFileURL(NETWORK_GUARD).href}` } });
  assert.equal(guarded.status, 0, guarded.stderr);
  const out = JSON.parse(guarded.stdout);
  for (const url of ['https://example.invalid/', 'http://203.0.113.9/', 'https://fonts.googleapis.com/css2?family=Inter']) {
    assert.match(out[url], /video-render refused a connection to /, url);
  }
  for (const name of ['lookup', 'resolve4', 'callback']) assert.match(out[name], /video-render refused a lookup of example\.com/, name);
  assert.match(out.localLookup, /^(127\.0\.0\.1|::1)$/);
  assert.equal(out.local, 'local');
  assert.match(guarded.stderr, /video-render: refused a connection to fonts\.googleapis\.com:443/);
  // Only a render carries it: the installer's environment does not.
  assert.match(renderEnvironment('/home', '/browser').NODE_OPTIONS, /network-guard\.mjs$/);
  assert.equal(childEnvironment('/home', '/browser').NODE_OPTIONS, undefined);
});

test('a font named in a style element reaches no font service during a render', { timeout: 120_000 }, async (t) => {
  const path = await scratch(t), project = join(path, 'project');
  await mkdir(project);
  await writeFile(join(project, 'index.html'), `<!doctype html><html><head><style>html,body{margin:0}
    main{width:64px;height:32px;font-family:system-ui,sans-serif}</style></head><body><main data-video-root>Aa</main></body></html>`);
  const report = await sequence({ project, output: join(path, 'out'), width: 64, height: 32, fps: 2, duration: 1, workers: 1 });
  const log = await readFile(report.logPath, 'utf8');
  assert.doesNotMatch(log, /from Google Fonts/);
  assert.match(log, /video-render: refused a connection to fonts\.googleapis\.com:443/);
});

test('a page in the render browser gathers no UDP route off this machine', { timeout: 60_000 }, async (t) => {
  // WebRTC's STUN requests are UDP to the address given, which neither the proxy nor the resolver rule sees.
  const path = await scratch(t);
  const { default: puppeteer } = await ownPackage('puppeteer-core');
  const browser = await puppeteer.launch({ executablePath: await browserPath(), headless: true,
    args: ['--no-sandbox', ...BROWSER_SWITCHES], userDataDir: join(path, 'profile') });
  try {
    const page = await browser.newPage();
    await page.setContent('<p>x</p>');
    const seen = await page.evaluate(() => new Promise((resolve) => {
      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:203.0.113.9:3478' }] });
      const found = [];
      pc.onicecandidate = (event) => { if (event.candidate) found.push(`${event.candidate.protocol} ${event.candidate.type}`); };
      pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') resolve(found); };
      pc.createDataChannel('x');
      pc.createOffer().then((offer) => pc.setLocalDescription(offer));
      setTimeout(() => resolve([...found, 'gathering still running']), 15_000);
    }));
    assert.deepEqual(seen, []);
  } finally { await browser.close(); }
  assert.ok(BROWSER_SWITCHES.includes('--disable-quic'));
});
