import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { access, cp, lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BRIDGE, compositionHtml, inspectProject, protectedPath } from './project.mjs';

export const TOOL_DIR = fileURLToPath(new URL('../', import.meta.url));
export const HYPERFRAMES_VERSION = '0.8.134';
export const CHROME_BUILD = '152.0.7977.30';

async function exists(path) {
  try { await lstat(path); return true; } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

export async function canonical(path, name) {
  if (typeof path !== 'string' || !isAbsolute(path)) throw new Error(`${name} must be an absolute path; see video-render.mjs help.`);
  if (protectedPath(path)) throw new Error(`${name} names a protected memory or .env path; choose a project or output directory.`);
  const missing = [];
  let head = path;
  for (;;) {
    try {
      const resolved = join(await realpath(head), ...missing);
      if (protectedPath(resolved)) throw new Error(`${name} resolves to a protected memory or .env path; choose another directory.`);
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

async function inside(candidate, directory) {
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
    throw new Error(`${name} must be a positive ${integer ? 'integer' : 'number'}; see video-render.mjs help.`);
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
  if (!['hardware', 'software'].includes(gpu)) throw new Error('--gpu must be hardware or software; see video-render.mjs help.');
  if (!['screenshot', 'fast'].includes(capture)) throw new Error('--capture must be screenshot or fast; see video-render.mjs help.');
  return { project, output, width, height, fps, duration, expectedFrames, workers, gpu, capture };
}

export async function checkRuntime(tool = TOOL_DIR, nodeVersion = process.versions.node) {
  if (Number(nodeVersion.split('.')[0]) < 22) throw new Error(`Node ${nodeVersion} is too old; video-render requires Node >=22.`);
  const marker = join(tool, 'node_modules/hyperframes/package.json');
  let pkg;
  try { pkg = JSON.parse(await readFile(marker, 'utf8')); } catch (error) {
    if (error.code !== 'ENOENT') throw new Error(`Cannot read HyperFrames package version at ${marker}; restore this tool's pinned install.`);
    throw new Error(`HyperFrames ${HYPERFRAMES_VERSION} is missing at ${marker}. Installing would fetch hyperframes and its dependencies from registry.npmjs.org into ${join(tool, 'node_modules')}; this core installs nothing. Provision the pinned packages before rendering.`);
  }
  if (pkg.version !== HYPERFRAMES_VERSION) throw new Error(`HyperFrames ${pkg.version} is installed; exactly ${HYPERFRAMES_VERSION} is required. Restore the pinned install.`);
  return pkg.version;
}

async function ownPackage(name) {
  const require = createRequire(join(TOOL_DIR, 'package.json'));
  return import(pathToFileURL(require.resolve(name)).href);
}

export async function browserPath(realHome = homedir()) {
  const { computeExecutablePath, Browser } = await ownPackage('@puppeteer/browsers');
  const path = computeExecutablePath({
    cacheDir: join(realHome, '.cache/hyperframes/chrome'), browser: Browser.CHROMEHEADLESSSHELL, buildId: CHROME_BUILD,
  });
  try { await access(path, constants.X_OK); } catch {
    throw new Error(`Pinned chrome-headless-shell ${CHROME_BUILD} is missing or not executable at ${path}; provision that build in HyperFrames' browser cache.`);
  }
  return path;
}

export function childEnvironment(home, browser, caller = process.env) {
  const env = {};
  for (const name of ['PATH', 'LANG', 'TMPDIR']) if (caller[name] !== undefined) env[name] = caller[name];
  return Object.assign(env, {
    HOME: home, HYPERFRAMES_BROWSER_PATH: browser,
    HYPERFRAMES_NO_TELEMETRY: '1', DO_NOT_TRACK: '1', HYPERFRAMES_NO_UPDATE_CHECK: '1',
    HYPERFRAMES_NO_AUTO_INSTALL: '1', HYPERFRAMES_SKIP_SKILLS: '1', NO_COLOR: '1',
  });
}

export function renderArguments(copy, frames, options) {
  return [join(TOOL_DIR, 'node_modules/hyperframes/bin/hyperframes.mjs'), 'render', copy,
    '--format', 'png-sequence', '-o', frames, '--fps', String(options.fps),
    '--workers', String(options.workers), options.gpu === 'hardware' ? '--browser-gpu' : '--no-browser-gpu',
    options.capture === 'screenshot' ? '--experimental-fast-capture=false' : '--experimental-fast-capture',
    '--frames-cache-dir', 'off', '--lint-verbose'];
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

export async function sequence(input) {
  const started = performance.now();
  const options = await optionsForSequence(input);
  await checkRuntime();
  const project = await inspectProject(options.project);
  const browser = await browserPath();
  const temporary = await mkdtemp(join(tmpdir(), 'wiser-video-render-'));
  let logPath;
  try {
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
    await renderChild(renderArguments(copy, framesDir, options), copy, childEnvironment(home, browser), logPath);
    const log = readRenderLog(await readFile(logPath, 'utf8'));
    const hashes = await hashFrames(framesDir, options.expectedFrames, options.width, options.height);
    return { hyperframesVersion: HYPERFRAMES_VERSION, ...log, gpu: options.gpu, capture: options.capture,
      ...hashes, logPath, seconds: Math.round((performance.now() - started) / 10) / 100 };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
