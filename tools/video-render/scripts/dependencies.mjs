import { INSTALL_SCOPE } from '../../lib/consent.js';
import { spawnSync } from 'node:child_process';
import { readFile, mkdtemp, realpath, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { isAbsolute, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const TOOL_DIR = fileURLToPath(new URL('../', import.meta.url));
export const HYPERFRAMES_VERSION = '0.8.134';
export const CHROME_BUILD = '152.0.7977.30';
const HERE = fileURLToPath(import.meta.url);

// Measured locally with du -sk on each installed tree, multiplied by 1024.
// These are allocated bytes on macOS ARM64, not download sizes or cross-platform promises.
export const INSTALL_SIZE = Object.freeze({
  date: '2026-10-25', platform: 'macOS ARM64', packages: 137646080, chrome: 202039296,
});

export function installPlan(tool = TOOL_DIR) {
  return `${INSTALL_SCOPE} Installing fetches HyperFrames ${HYPERFRAMES_VERSION} and its dependencies from registry.npmjs.org into ${join(tool, 'node_modules')}/ (tools/video-render/node_modules/), measured ${INSTALL_SIZE.packages} bytes on disk on ${INSTALL_SIZE.date} (${INSTALL_SIZE.platform}). A first render also needs HyperFrames' pinned chrome-headless-shell ${CHROME_BUILD}, from Google's Chrome for Testing storage (storage.googleapis.com/chrome-for-testing-public), into ~/.cache/hyperframes/chrome/, measured ${INSTALL_SIZE.chrome} bytes on disk on ${INSTALL_SIZE.date} (${INSTALL_SIZE.platform}). npm also writes its configured download cache and logs outside the plugin. Re-run the same command with --install to authorise and finish it, or set WISER_ALLOW_INSTALL=1 for an unattended run. Nothing is read from stdin.`;
}

export function nodeSurvey(version = process.versions.node) {
  return { version, ok: Number.parseInt(version, 10) >= 22, check: 'node --version' };
}

export function ffmpegSurvey(run = spawnSync) {
  const result = run('ffmpeg', ['-version'], { encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'] });
  const firstLine = result.stdout?.split(/\r?\n/)[0];
  const version = /^ffmpeg version\s/i.test(firstLine ?? '') ? firstLine : null;
  return { present: result.status === 0 && version !== null, version, check: 'ffmpeg -version' };
}

export function ffprobeSurvey(run = spawnSync) {
  const result = run('ffprobe', ['-version'], { encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'] });
  const firstLine = result.stdout?.split(/\r?\n/)[0];
  const version = /^ffprobe version\s/i.test(firstLine ?? '') ? firstLine : null;
  return { present: result.status === 0 && version !== null, version, check: 'ffprobe -version' };
}

export async function packageSurvey(tool = TOOL_DIR) {
  const marker = join(tool, 'node_modules/hyperframes/package.json');
  try {
    const pkg = JSON.parse(await readFile(marker, 'utf8'));
    return { present: true, version: pkg.version ?? null, ok: pkg.version === HYPERFRAMES_VERSION };
  } catch (error) {
    return { present: error.code !== 'ENOENT', version: null, ok: false,
      error: error.code === 'ENOENT' ? `HyperFrames ${HYPERFRAMES_VERSION} is missing at ${marker}.`
        : `Cannot read HyperFrames package version at ${marker}; restore this tool's pinned install.` };
  }
}

export function requireNode(version = process.versions.node) {
  if (!nodeSurvey(version).ok) throw new Error(`Node ${version} is too old; video-render requires Node >=22. Check: node --version.`);
}

export async function checkRuntime(tool = TOOL_DIR, nodeVersion = process.versions.node) {
  requireNode(nodeVersion);
  const pkg = await packageSurvey(tool);
  if (!pkg.ok) throw new Error(pkg.error ? `${pkg.error} ${installPlan(tool)}`
    : `HyperFrames ${pkg.version} is installed; exactly ${HYPERFRAMES_VERSION} is required. Restore the pinned install with --install.`);
  return pkg.version;
}

export async function ownPackage(name, tool = TOOL_DIR) {
  const require = createRequire(join(tool, 'package.json'));
  const resolved = require.resolve(name);
  const local = relative(await realpath(join(tool, 'node_modules')), resolved);
  if (local === '..' || local.startsWith(`..${sep}`) || isAbsolute(local)) {
    throw new Error(`${name} did not resolve inside ${join(tool, 'node_modules')}; restore this tool's pinned packages.`);
  }
  return import(pathToFileURL(resolved).href);
}

// The package computes its artifact filename; this function makes no on-disk usability claim.
export async function browserPath(realHome = homedir(), tool = TOOL_DIR) {
  const { computeExecutablePath, Browser } = await ownPackage('@puppeteer/browsers', tool);
  return computeExecutablePath({
    cacheDir: join(realHome, '.cache/hyperframes/chrome'), browser: Browser.CHROMEHEADLESSSHELL, buildId: CHROME_BUILD,
  });
}

export function childEnvironment(home, browser, caller = process.env) {
  const env = {};
  for (const name of ['PATH', 'LANG', 'TMPDIR']) if (caller[name] !== undefined) env[name] = caller[name];
  if (browser !== undefined) env.HYPERFRAMES_BROWSER_PATH = browser;
  return Object.assign(env, {
    HOME: home, HYPERFRAMES_NO_TELEMETRY: '1', DO_NOT_TRACK: '1', HYPERFRAMES_NO_UPDATE_CHECK: '1',
    HYPERFRAMES_NO_AUTO_INSTALL: '1', HYPERFRAMES_SKIP_SKILLS: '1', NO_COLOR: '1',
  });
}

export function launchFailure(error, phase) {
  const message = String(error.message ?? error);
  // Puppeteer's own pre-launch refusal names the configured executable. A generic ENOENT
  // could instead be a missing loader or profile directory, and never earns a download.
  if (phase === 'launch' && /^Browser was not found at the configured executablePath \(/i.test(message)) return 'missing';
  if (/\bEACCES\b|\bEPERM\b|permission denied/i.test(message)) return 'permission';
  if (/error while loading shared libraries|library not loaded|no usable sandbox|sandbox.*(?:denied|failed)/i.test(message)) return 'host';
  return phase === 'launch' ? 'launch' : 'protocol';
}

export async function chromeSurvey({ tool = TOOL_DIR, home = homedir(), gpu = 'hardware' } = {}) {
  const report = { expectedBuild: CHROME_BUILD, build: null, launches: false };
  let temporary, browser, phase = 'resolve';
  try {
    report.executablePath = await browserPath(home, tool);
    const { default: puppeteer } = await ownPackage('puppeteer-core', tool);
    temporary = await mkdtemp(join(tmpdir(), 'wiser-video-probe-'));
    const angle = { darwin: 'metal', win32: 'd3d11', linux: 'gl-egl' }[process.platform];
    const gpuArgs = gpu === 'software' ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-compositing']
      : ['--enable-gpu-rasterization', ...(angle ? ['--use-gl=angle', `--use-angle=${angle}`] : []),
        ...(process.platform === 'linux' ? ['--disable-software-rasterizer'] : [])];
    phase = 'launch';
    browser = await puppeteer.launch({ executablePath: report.executablePath, headless: true,
      env: childEnvironment(temporary, report.executablePath), userDataDir: join(temporary, 'profile'),
      defaultViewport: null, timeout: 30_000, protocolTimeout: 30_000,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-background-networking',
        '--disable-component-update', '--disable-sync', '--no-pings', '--enable-features=CanvasDrawElement',
        '--enable-webgl', '--ignore-gpu-blocklist', '--font-render-hinting=none', '--force-color-profile=srgb',
        '--force-device-scale-factor=1', ...gpuArgs] });
    phase = 'protocol';
    report.build = /(?:HeadlessChrome|Chrome|Chromium)\/(\d+\.\d+\.\d+\.\d+)/.exec(await browser.version())?.[1] ?? null;
    if (report.build !== CHROME_BUILD) {
      report.failure = 'version';
      report.remediation = `Chrome reported ${report.build ?? 'no build'}; exactly ${CHROME_BUILD} is required. Inspect the pinned cache; nothing has been replaced.`;
    } else report.launches = true;
  } catch (error) {
    report.failure = launchFailure(error, phase);
    report.remediation = `chrome-headless-shell ${CHROME_BUILD} failed during ${phase}: ${error.message}. ${report.failure === 'missing'
      ? 'The package installer can fetch the missing artifact with --install.'
      : 'Resolve the reported launch cause and run check again; downloading a replacement is not justified by this failure.'}`;
  } finally {
    try { await browser?.close(); } finally {
      if (temporary) await rm(temporary, { recursive: true, force: true });
    }
  }
  return report;
}

function requireSystems(report) {
  requireNode(report.node.version);
  if (!report.ffmpeg.present) throw new Error('FFmpeg is missing or cannot run. Check: ffmpeg -version.');
}

function runInstaller(run, executable, args, tool, home, label) {
  const result = run(executable, args, { cwd: tool, env: childEnvironment(home), encoding: 'utf8',
    timeout: 600_000, stdio: ['ignore', 'pipe', 'pipe'] });
  // Installer chatter belongs on stderr; stdout remains one result object.
  if (result.stdout) process.stderr.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error(`${label} failed in ${tool}${result.error ? `: ${result.error.message}` : ` (exit ${result.status})`}. ${label === 'npm ci'
    ? 'Check that this directory is writable and package-lock.json is present and matches package.json; restore the pinned files before retrying with --install.'
    : 'Read the installer failure above, resolve that cause and retry with --install; no working browser was removed by this tool.'}`);
}

// Operations are injectable so install ordering and refusal paths can be tested without downloads.
export async function prepareRuntime({ install = false, survey = false, gpu = 'hardware' } = {}, operations = {}) {
  const { tool = TOOL_DIR, home = homedir(), run = spawnSync, probe = chromeSurvey,
    packages = packageSurvey, nodeVersion = process.versions.node } = operations;
  const report = { node: nodeSurvey(nodeVersion), ffmpeg: ffmpegSurvey(run), ffprobe: ffprobeSurvey(run), hyperframes: await packages(tool),
    chrome: { expectedBuild: CHROME_BUILD, build: null, launches: false, failure: 'packages' }, ready: false };
  try {
    if (!survey || install) requireSystems(report);
    // A plain check ignores even environment/marker consent: it only surveys.
    const mayInstall = !survey || install;
    let consent;
    async function authorise() {
      consent ??= operations.consent ?? await import('../../lib/consent.js');
      if (!consent.installAuthorised(HERE, install)) throw new Error(installPlan(tool));
      consent.writeConsent(HERE, 'video-render', install);
    }
    if (!report.hyperframes.ok && mayInstall) {
      try { await authorise(); } catch (error) {
        throw new Error(`${report.hyperframes.error ?? `HyperFrames ${report.hyperframes.version} is installed; exactly ${HYPERFRAMES_VERSION} is required.`} ${error.message}`);
      }
      process.stderr.write(`First run: installing dependencies in ${tool}.\n`);
      runInstaller(run, process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci'], tool, home, 'npm ci');
      report.hyperframes = await packages(tool);
      if (!report.hyperframes.ok) throw new Error(`npm ci finished but HyperFrames ${HYPERFRAMES_VERSION} could not be verified at ${join(tool, 'node_modules/hyperframes/package.json')}; restore the pinned install.`);
    }
    if (report.hyperframes.ok) {
      report.chrome = await probe({ tool, home, gpu });
      if (!report.chrome.launches && mayInstall) {
        if (report.chrome.failure !== 'missing') throw new Error(report.chrome.remediation);
        // HyperFrames otherwise tries a system package install on Linux ARM64.
        if (process.platform === 'linux' && process.arch === 'arm64') throw new Error(`Pinned chrome-headless-shell ${CHROME_BUILD} is unavailable on Linux ARM64; no system dependency was installed.`);
        await authorise();
        process.stderr.write(`First run: installing chrome-headless-shell ${CHROME_BUILD} in ${join(home, '.cache/hyperframes/chrome')}.\n`);
        runInstaller(run, process.execPath, [join(tool, 'node_modules/hyperframes/bin/hyperframes.mjs'), 'browser', 'ensure'], tool, home, 'HyperFrames browser ensure');
        report.chrome = await probe({ tool, home, gpu });
        if (!report.chrome.launches) throw new Error(report.chrome.remediation);
      }
    }
    report.ready = report.node.ok && report.ffmpeg.present && report.ffprobe.present && report.hyperframes.ok && report.chrome.launches;
  } catch (error) {
    if (!survey) throw error;
    report.error = error.message;
  }
  return report;
}
