import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { cp, lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BRIDGE, compositionHtml, inspectProject, protectedPath } from './project.mjs';
import { TOOL_DIR, HYPERFRAMES_VERSION, CHROME_BUILD, childEnvironment, ownPackage, prepareRuntime } from './dependencies.mjs';

export { TOOL_DIR, HYPERFRAMES_VERSION, CHROME_BUILD, browserPath, checkRuntime, childEnvironment } from './dependencies.mjs';

export const BROWSER_SWITCHES = Object.freeze([
  '--proxy-server=http://127.0.0.1:9',
  '--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE localhost , EXCLUDE 127.0.0.1',
  '--force-prefers-no-reduced-motion',
  // Neither the proxy nor the resolver rule sees UDP to a literal address: a page's WebRTC sent STUN requests to one
  // until these two switches were added (measured on Chrome 152).
  '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
  '--disable-quic',
  // Raster on the CPU, every changed tile in full. Measured on Chrome 152, a counted figure at 1,280x720: with neither
  // switch its frames differed between one worker and two, and between one and four; with the CPU raster alone, the
  // first frame a worker drew mid-count differed; with partial redraws off alone, nothing changed on the GPU; with both,
  // every split drew the same frames.
  '--disable-gpu-rasterization',
  '--disable-partial-raster',
]);

async function exists(path) {
  try { await lstat(path); return true; } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

export async function canonical(path, name) {
  if (typeof path !== 'string' || !isAbsolute(path)) throw new Error(`${name} must be an absolute path; see video-render.js help.`);
  if (protectedPath(path)) throw new Error(`${name} names a protected memory or credential path: ${path}; choose a project or output directory.`);
  const missing = [];
  let head = path;
  for (;;) {
    try {
      const resolved = join(await realpath(head), ...missing);
      if (protectedPath(resolved)) throw new Error(`${name} resolves to a protected memory or credential path: ${resolved}; choose another directory.`);
      return resolved;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      // A dangling symlink is not a missing path that has been cleared.
      if (await exists(head)) throw new Error(`${name} cannot be canonicalized at ${head}; repair the symbolic link.`);
      const parent = dirname(head);
      if (parent === head) throw new Error(`${name} cannot be canonicalized; choose a readable absolute directory.`);
      missing.unshift(basename(head));
      head = parent;
    }
  }
}

export async function inside(candidate, directory) {
  const root = await stat(directory);
  for (let head = candidate;; head = dirname(head)) {
    try {
      const id = await stat(head);
      if (id.dev === root.dev && id.ino === root.ino) return true;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (dirname(head) === head) return false;
  }
}

function number(value, name, integer = false) {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(n) || n <= 0 || (integer && !Number.isSafeInteger(n))) {
    throw new Error(`${name} must be a positive ${integer ? 'integer' : 'number'}; see video-render.js help.`);
  }
  return n;
}

// HyperFrames 0.8.134 renders Math.max(1, Math.ceil(duration × fps)) frames (dist/chunk-K2FTXJYH.js lines 6144
// and 6548), so a duration that is not a whole number of frames gains one. It is handed a duration half a frame
// short of the count this tool promises, round(duration × fps), so its ceil lands on that count exactly.
export function hyperframesDuration(frames, fps) {
  return (frames - 0.5) / fps;
}

export async function optionsForSequence(input) {
  const project = await canonical(input.project, '--project');
  const output = await canonical(input.output, '--output');
  const tool = await realpath(TOOL_DIR);
  if (await inside(output, tool)) throw new Error(`--output resolves inside the tool directory ${tool}; choose a work directory.`);
  if (await exists(output)) throw new Error(`--output already exists: ${output}; choose a new directory.`);
  const rel = relative(project, output);
  if (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel)) throw new Error('--output is inside --project; choose a separate output directory.');
  if (!(await stat(project)).isDirectory()) throw new Error(`--project is not a directory: ${project}; provide a project with index.html.`);
  const width = number(input.width, '--width', true);
  const height = number(input.height, '--height', true);
  const fps = number(input.fps, '--fps');
  const duration = number(input.duration, '--duration');
  const expectedFrames = Math.round(duration * fps);
  if (!Number.isSafeInteger(expectedFrames) || expectedFrames < 1) throw new Error('--duration times --fps must round to at least one frame and be a safe integer.');
  const workers = input.workers === undefined || input.workers === 'auto' ? 'auto' : number(input.workers, '--workers', true);
  const gpu = input.gpu ?? 'hardware';
  const capture = input.capture ?? 'screenshot';
  if (!['hardware', 'software'].includes(gpu)) throw new Error('--gpu must be hardware or software; see video-render.js help.');
  if (!['screenshot', 'fast'].includes(capture)) throw new Error('--capture must be screenshot or fast; see video-render.js help.');
  return { project, output, width, height, fps, duration, expectedFrames, workers, gpu, capture };
}

// HyperFrames' Node process runs with network-guard.mjs loaded, so it reaches no host but this machine.
export const NETWORK_GUARD = join(TOOL_DIR, 'scripts', 'network-guard.mjs');
export function renderEnvironment(home, browser) {
  return { ...childEnvironment(home, browser), NODE_OPTIONS: `--import=${pathToFileURL(NETWORK_GUARD).href}` };
}

export function renderArguments(copy, frames, options) {
  return [join(TOOL_DIR, 'node_modules/hyperframes/bin/hyperframes.mjs'), 'render', copy,
    '--format', 'png-sequence', '-o', frames, '--fps', String(options.fps),
    '--workers', String(options.workers), options.gpu === 'hardware' ? '--browser-gpu' : '--no-browser-gpu',
    options.capture === 'screenshot' ? '--experimental-fast-capture=false' : '--experimental-fast-capture',
    '--frames-cache-dir', 'off', '--lint-verbose'];
}

export async function writeBrowserWrapper(temporary, executable) {
  // HyperFrames identifies the headless shell by this basename. Keep all caller
  // arguments, then append the network and motion policy so earlier flags cannot override it.
  const wrapper = join(temporary, 'chrome-headless-shell');
  const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
  await writeFile(wrapper, `#!/bin/sh\nexec ${quote(executable)} "$@" ${BROWSER_SWITCHES.map(quote).join(' ')}\n`, { flag: 'wx', mode: 0o700 });
  return wrapper;
}

async function renderChild(args, cwd, env, logPath) {
  const log = await open(logPath, 'wx');
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, args, { cwd, env, stdio: ['ignore', log.fd, log.fd] });
      child.once('error', reject);
      child.once('close', (code, signal) => {
        if (code === 0) resolve();
        else reject(new Error(`HyperFrames render failed (${signal ? `signal ${signal}` : `exit ${code}`}); inspect ${logPath}, fix the reported cause and use a new output directory.`));
      });
    });
  } finally { await log.close(); }
}

export function readRenderLog(log) {
  const text = log.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
  const builds = [...text.matchAll(/\[BrowserManager\] Browser launched \((?:HeadlessChrome|Chrome|Chromium)\/(\d+\.\d+\.\d+\.\d+)/g)].map((m) => m[1]);
  if (!builds.length) throw new Error('HyperFrames log contains no launched Chrome build; inspect render.log before trusting the frames.');
  if (builds.some((v) => v !== CHROME_BUILD)) throw new Error(`HyperFrames log reports Chrome ${[...new Set(builds)].join(', ')}; require ${CHROME_BUILD}.`);
  const lintFindings = text.split(/\r?\n/).filter((line) => /^\s*[\u2717\u26a0\u2139]\s+/.test(line) || /^\s*Lint:/i.test(line)).map((line) => line.trim());
  return { chromeBuild: builds[0], lintFindings };
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export async function hashFrames(framesDir, expected, width, height) {
  const files = (await readdir(framesDir)).filter((name) => /\.png$/i.test(name)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  if (files.length !== expected) throw new Error(`HyperFrames wrote ${files.length} frames; expected round(duration × fps) = ${expected}. Inspect render.log and use a new output directory.`);
  const { default: sharp } = await ownPackage('sharp');
  const lines = [];
  for (const name of files) {
    if (!/\d+\.png$/i.test(name)) throw new Error(`HyperFrames frame ${name} is not numbered; inspect render.log.`);
    const { data, info } = await sharp(join(framesDir, name)).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (info.width !== width || info.height !== height || info.channels !== 4) throw new Error(`Frame ${name} decoded as ${info.width}×${info.height}×${info.channels}; expected ${width}×${height} RGBA.`);
    lines.push(`${sha256(data)}  ${name}\n`);
  }
  const manifest = Buffer.from(lines.join(''));
  const hashesPath = join(framesDir, 'frames.sha256');
  await writeFile(hashesPath, manifest, { flag: 'wx' });
  return { frameCount: files.length, hashesPath, hashesSha256: sha256(manifest) };
}

export async function sequence(input, { install = false, runtime: preparedRuntime } = {}) {
  const started = performance.now();
  const options = await optionsForSequence(input);
  const project = await inspectProject(options.project);
  const runtime = preparedRuntime ?? await prepareRuntime({ install, gpu: options.gpu });
  const temporary = await mkdtemp(join(tmpdir(), 'wiser-video-render-'));
  let logPath;
  try {
    const browser = await writeBrowserWrapper(temporary, runtime.chrome.executablePath);
    const copy = join(temporary, 'project');
    const home = join(temporary, 'home');
    await mkdir(home);
    await cp(options.project, copy, { recursive: true, force: false, errorOnExist: true });
    const bridge = `video-render-bridge-${randomUUID()}.js`;
    await writeFile(join(copy, 'index.html'), compositionHtml(project, { ...options, duration: hyperframesDuration(options.expectedFrames, options.fps) }, bridge));
    await writeFile(join(copy, bridge), BRIDGE, { flag: 'wx' });
    await mkdir(dirname(options.output), { recursive: true });
    // Claim it exclusively before launching; never merge a sequence into an old directory.
    await mkdir(options.output);
    logPath = join(options.output, 'render.log');
    const framesDir = join(options.output, 'frames');
    await renderChild(renderArguments(copy, framesDir, options), copy, renderEnvironment(home, browser), logPath);
    const log = readRenderLog(await readFile(logPath, 'utf8'));
    const hashes = await hashFrames(framesDir, options.expectedFrames, options.width, options.height);
    return { hyperframesVersion: HYPERFRAMES_VERSION, ...log, gpu: options.gpu, capture: options.capture,
      ...hashes, logPath, seconds: Math.round((performance.now() - started) / 10) / 100 };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
