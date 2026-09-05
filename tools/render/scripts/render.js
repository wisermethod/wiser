#!/usr/bin/env node
/**
 * render - render HTML, SVG, or Mermaid to a PNG, or capture a live page
 *
 * Usage:
 *   node scripts/render.js help
 *   node scripts/render.js html --input <path> --output <path>
 *   node scripts/render.js svg --file <path> --output <path>
 *   node scripts/render.js mermaid --file <path> --output <path>
 *   node scripts/render.js url --url <address> --output <path>.png
 *   node scripts/render.js check
 *
 * Node built-ins, this tool's own files, and tools/lib/. The rules every
 * shipped script follows are stated once, in system/templates/Script Contract.md.
 */

import { execFileSync } from 'node:child_process';
import { accessSync, constants, existsSync, mkdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { flagAuthorised, installAuthorised, writeConsent } from '../../lib/consent.js';

import {
  DEFAULT_SCALE as HTML_DEFAULT_SCALE,
  DEFAULT_TIMEOUT_MS as HTML_DEFAULT_TIMEOUT_MS,
  FIT_MARGIN_PX,
  FORMATS,
  SETTLE_MS as HTML_SETTLE_MS,
  imageSize
} from './html-core.js';

import {
  DEFAULT_SCALE as SVG_DEFAULT_SCALE,
  DEFAULT_TIMEOUT_MS as SVG_DEFAULT_TIMEOUT_MS,
  buildDocument,
  isInsideDirectory,
  readSvgSize,
  resolveOutputSize,
  withViewBox
} from './svg-core.js';

import {
  DEFAULTS as MERMAID_DEFAULTS,
  THEMES,
  UsageError,
  buildShell,
  fitDiagram,
  parseErrorLine,
  pngSize,
  readOptions,
  viewportWidth
} from './mermaid-core.js';

import {
  DEFAULT_HEIGHT,
  DEFAULT_SCALE as URL_DEFAULT_SCALE,
  DEFAULT_TIMEOUT_MS as URL_DEFAULT_TIMEOUT_MS,
  DEFAULT_WIDTH,
  SETTLE_MS as URL_SETTLE_MS,
  classifyFailure,
  pngSizeFromHeader,
  screenDestination,
  validateHeight,
  validateOutput,
  validateOverwrite,
  validateScale,
  validateTimeout,
  validateUrl,
  validateWidth
} from './url-core.js';

const HERE = fileURLToPath(import.meta.url);
const SCRIPT_DIR = dirname(HERE);
const TOOL_DIR = resolve(SCRIPT_DIR, '..');
const RUNTIME_DIR = resolve(SCRIPT_DIR, '..', '..', 'lib', 'browser-runtime');

const PLAYWRIGHT_MARKER = join(RUNTIME_DIR, 'node_modules', 'playwright', 'package.json');
const MERMAID_MARKER = join(TOOL_DIR, 'node_modules', 'mermaid', 'package.json');
const MERMAID_SCRIPT = join(TOOL_DIR, 'node_modules', 'mermaid', 'dist', 'mermaid.min.js');
const PLAYWRIGHT_CLI = join(RUNTIME_DIR, 'node_modules', 'playwright', 'cli.js');
const BROWSER_CHECK = 'npm run check:chromium';
const SVG_FONT_SETTLE_MS = 500;
const LAUNCH_OPTIONS = { headless: true };

const SUBCOMMANDS = new Set(['html', 'svg', 'mermaid', 'url', 'check']);

const USAGE = `render - render HTML, SVG, or Mermaid to a PNG, or capture a live page

Usage:
  node scripts/render.js help
  node scripts/render.js html --input <path> --output <path> [--width N] [--height N]
    [--scale N] [--quality N] [--timeout MS] [--overwrite]
  node scripts/render.js svg --file <path> --output <path> [--scale N]
    [--width N] [--timeout N] [--overwrite]
  node scripts/render.js mermaid --file <absolute path> --output <absolute path> [options]
  node scripts/render.js url --url <address> --output <path>.png
    [--width 1280] [--height 720] [--scale 1] [--timeout 30000] [--full-page] [--overwrite]
  node scripts/render.js check

Commands:
  html             Render one local HTML file to a PNG or JPEG image
  svg              Render an SVG file to a PNG
  mermaid          Render a Mermaid diagram file to a PNG
  url              Load the page and write a PNG of it
  check            Report whether the Chromium build this tool renders with is present.
                   Installs nothing and opens no connection; with --install it
                   installs first and then reports on what it installed
  help             Print this message

Run "node scripts/render.js <command> help" for that command's options.

  --install   Authorise the first install in this copy of the plugin.
              Without it, the first command that needs a package this
              copy has not installed reports what it would fetch, and
              from where, and stops. That answer covers every later
              tool in this copy. WISER_ALLOW_INSTALL=1 does the same
              for an unattended run.
  --help, -h       Print this message

Needs no credentials and no configuration file, so no command takes --env.
Success prints one JSON object to stdout; a usage mistake or a page that will
not render goes to stderr with exit 1.`;

const HTML_USAGE = `render html - render one local HTML file to a PNG or JPEG image

Usage:
  node scripts/render.js html help
  node scripts/render.js html --input <path> --output <path> [--width N] [--height N]
    [--scale N] [--quality N] [--timeout MS] [--overwrite]

Commands:
  html             Render the HTML file and write the image
  help             Print this message

Options:
  --input <path>   HTML file to render, absolute. Required.
  --output <path>  Image file to write, absolute, ending .png, .jpg, or .jpeg.
                   Required, and it may not sit inside this tool directory.
  --width N        Viewport width in pixels. Default 1200.
  --height N       Viewport height in pixels. Omit to fit the content instead.
  --scale N        Device scale factor; the image carries this many pixels per
                   CSS pixel. Default ${HTML_DEFAULT_SCALE}.
  --quality N      JPEG quality, 1 to 100. Default 90. Ignored for PNG.
  --timeout MS     Milliseconds the page gets to finish loading.
                   Default ${HTML_DEFAULT_TIMEOUT_MS}.
  --overwrite      Replace a file already at --output. Without it, a run that
                   would replace one refuses.
  --install Authorise the first install in this copy of the plugin.
          Without it, the first command that needs a package this
          copy has not installed reports what it would fetch, and
          from where, and stops. That answer covers every later
          tool in this copy. WISER_ALLOW_INSTALL=1 does the same
          for an unattended run.
  --help           Print this message

Renders the file the caller names and writes the image the caller names. Needs
no credentials and no configuration file, so no command takes --env. The page is
loaded from disk; anything it references is fetched, and nothing else is. Success
prints one JSON object to stdout; a usage mistake or a page that will not render
goes to stderr with exit 1.`;

const SVG_USAGE = `render svg - render an SVG file to a PNG file

Usage:
  node scripts/render.js svg help
  node scripts/render.js svg --file <path> --output <path> [--scale N]
                                [--width N] [--timeout N] [--overwrite]

Commands:
  svg              Render the SVG and write the PNG
  help             Print this message

Options:
  --file <path>    SVG to render (absolute path). Required.
  --output <path>  PNG to write (absolute path, .png). Required. Must sit
                   outside this tool directory; missing parent folders are made.
  --scale N        Multiply the SVG's own dimensions by N (default: ${SVG_DEFAULT_SCALE}).
  --width N        Render at exactly N pixels wide, height following the aspect
                   ratio. Overrides --scale.
  --timeout N      Milliseconds the page may take to load whatever the SVG
                   references (default: ${SVG_DEFAULT_TIMEOUT_MS}).
  --overwrite      Replace an existing file at --output. Without it, a run that
                   would replace one refuses.
  --install Authorise the first install in this copy of the plugin.
          Without it, the first command that needs a package this
          copy has not installed reports what it would fetch, and
          from where, and stops. That answer covers every later
          tool in this copy. WISER_ALLOW_INSTALL=1 does the same
          for an unattended run.
  --help           Print this message

Reads the one SVG the caller names and writes the one PNG the caller names.
Needs no credentials and no configuration file, so no command takes --env.
Success prints one JSON object to stdout; failures go to stderr with exit 1.`;

const MERMAID_USAGE = `render mermaid - Render a Mermaid diagram file to a PNG.

Usage:
  node scripts/render.js mermaid help
  node scripts/render.js mermaid --file <absolute path> --output <absolute path> [options]

Commands:
  mermaid          Render the diagram and write the PNG
  help             Print this message

Options:
  --file <path>    The Mermaid diagram to render, absolute. Required.
  --output <path>  Where to write the PNG, absolute, ending in .png. Required;
                   there is no default location. Must sit outside this tool
                   directory.
  --width N        Maximum diagram width in CSS pixels (default: ${MERMAID_DEFAULTS.width})
  --scale N        Device scale factor; the PNG is this many pixels per CSS
                   pixel (default: ${MERMAID_DEFAULTS.scale})
  --theme NAME     ${THEMES.join(', ')} (default: ${MERMAID_DEFAULTS.theme})
  --background C   Background color, or transparent for none
                   (default: ${MERMAID_DEFAULTS.background})
  --timeout MS     How long the diagram has to render before the run gives up
                   (default: ${MERMAID_DEFAULTS.timeout})
  --overwrite      Replace a file already at --output. Without it, an occupied
                   path is refused.
  --install Authorise the first install in this copy of the plugin.
          Without it, the first command that needs a package this
          copy has not installed reports what it would fetch, and
          from where, and stops. That answer covers every later
          tool in this copy. WISER_ALLOW_INSTALL=1 does the same
          for an unattended run.
  --help           Print this message

Success prints one JSON object to stdout. Errors go to stderr with exit 1.`;

const URL_USAGE = `render url - capture a PNG of a live web page

Usage:
  node scripts/render.js url help
  node scripts/render.js url --url <address> --output <path>.png
    [--width 1280] [--height 720] [--scale 1] [--timeout 30000] [--full-page] [--overwrite]

Commands:
  url              Load the page and write a PNG of it
  help             Print this message

Options:
  --url <address>  Page to capture, http or https. Required.
  --output <path>  Absolute path of the .png to write, outside this tool
                   directory. Required; this tool has no default destination.
  --width <n>      Viewport width in pixels. Default ${DEFAULT_WIDTH}.
  --height <n>     Viewport height in pixels. Default ${DEFAULT_HEIGHT}.
  --scale <n>      Device scale factor: the image is this many pixels per
                   viewport pixel. Default ${URL_DEFAULT_SCALE}.
  --timeout <n>    Milliseconds to wait for the page's network activity to
                   stop. Default ${URL_DEFAULT_TIMEOUT_MS}; minimum 1000.
  --full-page      Capture the whole scrollable page instead of the viewport.
  --overwrite      Replace the file at --output when one is already there.
  --install Authorise the first install in this copy of the plugin.
          Without it, the first command that needs a package this
          copy has not installed reports what it would fetch, and
          from where, and stops. That answer covers every later
          tool in this copy. WISER_ALLOW_INSTALL=1 does the same
          for an unattended run.
  --help           Print this message

Reaches the one address --url names and writes the one file --output names.
Needs no credentials and no configuration file, so no command takes --env.
Success prints one JSON object to stdout; anything else goes to stderr with
exit 1.`;

const CHECK_USAGE = `render check - report whether the Chromium build this tool renders with is present

Usage:
  node scripts/render.js check help
  node scripts/render.js check

Commands:
  check            Report whether the Chromium build this tool renders with is present.
                   Installs nothing and opens no connection; with --install it
                   installs first and then reports on what it installed
  help             Print this message

Options:
  --install Authorise the first install in this copy of the plugin.
          Without it, the first command that needs a package this
          copy has not installed reports what it would fetch, and
          from where, and stops. That answer covers every later
          tool in this copy. WISER_ALLOW_INSTALL=1 does the same
          for an unattended run.
  --help           Print this message

Installs nothing and opens no connection unless --install is passed. Success
prints one JSON object to stdout with the verdict in chromiumLaunch; the exit
code is 0 either way.`;

const SUB_USAGE = {
  html: HTML_USAGE,
  svg: SVG_USAGE,
  mermaid: MERMAID_USAGE,
  url: URL_USAGE,
  check: CHECK_USAGE
};

const URL_VALUE_FLAGS = new Set(['--url', '--output', '--width', '--height', '--scale', '--timeout']);
const URL_BARE_FLAGS = new Set(['--install', '--full-page', '--overwrite', '--help', '-h']);

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function canonical(name, candidate) {
  const absolute = resolve(candidate);
  const missing = [];
  let head = absolute;

  for (;;) {
    try {
      const real = realpathSync(head);
      return missing.length === 0 ? real : join(real, ...missing);
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') {
        fail(`Error: ${name} could not be resolved to a real path at ${head}. Confirm every folder on the way is readable by this account and that no symbolic link on it points at itself.`);
      }
      const parent = dirname(head);
      if (parent === head) return absolute;
      missing.unshift(basename(head));
      head = parent;
    }
  }
}

function descendsFrom(candidate, directory) {
  let rootId;
  try {
    rootId = statSync(directory);
  } catch {
    return false;
  }

  let head = candidate;
  for (;;) {
    try {
      const id = statSync(head);
      if (id.dev === rootId.dev && id.ino === rootId.ino) return true;
    } catch {
      // Absent, so it carries no identity of its own; its parent still decides.
    }
    const parent = dirname(head);
    if (parent === head) return false;
    head = parent;
  }
}

function isWritable(dir) {
  try { accessSync(dir, constants.W_OK); return true; } catch { return false; }
}

function refuseUnknown(argv, valueFlags, bareFlags, usageCmd) {
  const valuePositions = new Set();
  for (let index = 1; index < argv.length; index += 1) {
    if (valueFlags.has(argv[index])) valuePositions.add(index + 1);
  }
  for (let index = 1; index < argv.length; index += 1) {
    const option = argv[index];
    if (valuePositions.has(index)) continue;
    if (option.startsWith('-') && !valueFlags.has(option) && !bareFlags.has(option)) {
      fail(`Error: unknown option "${option}". Run "${usageCmd}" for usage.`);
    }
  }
}

function flagFrom(argv, name, usageCmd) {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (argv.indexOf(name, index + 1) !== -1) {
    fail(`Error: ${name} was given more than once and takes one value. Run "${usageCmd}" for usage.`);
  }
  if (value === undefined || value.startsWith('--')) {
    fail(`Error: ${name} needs a value. Run "${usageCmd}" for usage.`);
  }
  return value;
}

const BROWSER_SIZE = ' This run then fetches the Chromium build, several hundred megabytes, from cdn.playwright.dev, or from playwright.download.prss.microsoft.com when Playwright falls back. That build does NOT land here: it goes wherever Playwright keeps browser builds on this machine, which tools/AGENTS.md names for each platform.';

function installPlan(needsMermaid) {
  if (needsMermaid) {
    let names = [];
    try {
      names = Object.keys(JSON.parse(readFileSync(join(TOOL_DIR, 'package.json'), 'utf8')).dependencies || {});
    } catch { /* the report degrades to a generic list; the refusal still stands */ }
    const packages = names.length
      ? `Installing fetches ${names.join(', ')} from registry.npmjs.org into ${TOOL_DIR}, and playwright from registry.npmjs.org into ${RUNTIME_DIR}`
      : `Installing fetches playwright from registry.npmjs.org into ${RUNTIME_DIR}`;
    return { packages, size: BROWSER_SIZE };
  }
  return {
    packages: `Installing fetches playwright from registry.npmjs.org into ${RUNTIME_DIR}`,
    size: BROWSER_SIZE
  };
}

function requireInstallConsent(what, { needsMermaid = false } = {}) {
  if (installAuthorised(HERE)) return;
  if (what === 'browser') {
    fail(
      `Error: this tool's packages are installed but the Chromium build they drive is not, and this copy of the plugin has not authorised an install. The plugin asks once, on the first install in this copy. Installing fetches that build from cdn.playwright.dev, or playwright.download.prss.microsoft.com when Playwright falls back, several hundred megabytes, into wherever Playwright keeps browser builds on this machine. No package is fetched and npm is not run. tools/AGENTS.md lists every write an install makes and names where the build lands. Re-run the same command with --install to authorise it, or set WISER_ALLOW_INSTALL=1 for an unattended run. Nothing is read from stdin, so this is the only way to answer.`
    );
  }
  const { packages, size } = installPlan(needsMermaid);
  fail(
    `Error: this tool is not installed yet and this copy of the plugin has not authorised an install. The plugin asks once, on the first install in this copy. ${packages}, and npm writes its own cache outside this plugin.${size} tools/AGENTS.md lists every write an install makes. Re-run the same command with --install to authorise it, or set WISER_ALLOW_INSTALL=1 for an unattended run. Nothing is read from stdin, so this is the only way to answer.`
  );
}

function npmCi(dir, marker, { unwritable, missing }) {
  process.stderr.write(`First run: installing dependencies in ${dir}.\n`);
  try {
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    execFileSync(npm, ['ci'], { cwd: dir, stdio: ['ignore', 'ignore', 'inherit'] });
  } catch {
    if (!isWritable(dir)) fail(unwritable);
    fail(`Error: npm ci failed in ${dir}. Confirm Node 18 or newer, then that package-lock.json is present and matches package.json, which is what npm ci requires and will not resolve around. Delete node_modules there and run "npm ci" by hand to see npm's own message. A lockfile that is missing or out of step with the manifest is a defect in this copy of the plugin, not something a re-run fixes.`);
  }
  if (!existsSync(marker)) fail(missing);
}

function ensurePlaywright() {
  if (existsSync(PLAYWRIGHT_MARKER)) return;
  requireInstallConsent('packages', { needsMermaid: false });
  npmCi(RUNTIME_DIR, PLAYWRIGHT_MARKER, {
    unwritable: `Error: cannot install dependencies because ${RUNTIME_DIR} is not writable. This tool installs Playwright into the shared browser runtime on the run that authorises it with --install, so that directory has to be writable. Install this plugin somewhere you own, or make that directory writable, then run the command again.`,
    missing: `Error: npm ci finished but ${PLAYWRIGHT_MARKER} is still missing. Check that the shared runtime's package.json lists playwright.`
  });
}

function ensureMermaidPackages() {
  const needPlaywright = !existsSync(PLAYWRIGHT_MARKER);
  const needMermaid = !existsSync(MERMAID_MARKER);
  if (!(needPlaywright || needMermaid)) return;
  requireInstallConsent('packages', { needsMermaid: true });
  if (needPlaywright) {
    npmCi(RUNTIME_DIR, PLAYWRIGHT_MARKER, {
      unwritable: `Error: cannot install dependencies because ${RUNTIME_DIR} is not writable. This tool installs its dependencies into ${RUNTIME_DIR} on the run that authorises it with --install, so that directory has to be writable. Install this plugin somewhere you own, or make that directory writable, then run the command again.`,
      missing: `Error: npm ci finished but ${PLAYWRIGHT_MARKER} is still missing. Check that package.json lists every package this script imports.`
    });
  }
  if (needMermaid) {
    npmCi(TOOL_DIR, MERMAID_MARKER, {
      unwritable: `Error: cannot install dependencies because ${TOOL_DIR} is not writable. This tool installs its dependencies into ${TOOL_DIR} on the run that authorises it with --install, so that directory has to be writable. Install this plugin somewhere you own, or make that directory writable, then run the command again.`,
      missing: `Error: npm ci finished but ${MERMAID_MARKER} is still missing. Check that package.json lists every package this script imports.`
    });
  }
}

let runtime = null;
let browserSurvey = null;

async function chromiumLaunches() {
  try {
    if (runtime === null) runtime = await import(new URL('../../lib/browser-runtime/browser-runtime.js', import.meta.url));
    browserSurvey = await runtime.check(LAUNCH_OPTIONS);
  } catch (error) {
    const line = error && error.message ? String(error.message).split('\n')[0].trim() : 'the browser runtime could not be loaded';
    browserSurvey = {
      chromiumLaunch: false,
      failure: 'host',
      remediation: `dependency: the shared browser runtime; check: importing tools/lib/browser-runtime/browser-runtime.js. Next: ${line}`
    };
  }
  return browserSurvey.chromiumLaunch === true;
}

function installDestinationForDiagnosis() {
  try {
    const report = execFileSync(process.execPath, [PLAYWRIGHT_CLI, 'install', 'chromium', '--dry-run'], {
      cwd: RUNTIME_DIR,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 120000
    });
    const first = [...report.matchAll(/^\s*Install location:\s*(\S.*)$/gm)].map((m) => m[1].trim())[0];
    return first ? dirname(first) : null;
  } catch {
    return null;
  }
}

async function ensureChromium() {
  if (await chromiumLaunches()) return;

  if (browserSurvey.failure === 'host') {
    fail(`Error: Chromium cannot launch, and the reason is this machine rather than the browser build, so installing it again would not fix it. ${browserSurvey.remediation || 'The trial launch reported no reason.'} See the Dependencies section of TOOL.md.`);
  }

  if (browserSurvey.failure === 'permission') {
    const target = browserSurvey.unrunnablePath || 'the Chromium binary named above';
    fail(`Error: the Chromium build is present and complete, but this account may not run it: its file has lost its execute permission. Nothing is wrong with the build, and nothing has been replaced. ${browserSurvey.remediation || ''} Restore the permission and run the command again: chmod +x '${target}'`);
  }

  if (browserSurvey.failure === 'crashed') {
    const crashedForce = runtime.forceInstallArgs(LAUNCH_OPTIONS).join(' ');
    const crashedWhat = browserSurvey.launchPhase && browserSurvey.launchPhase !== 'launch'
      ? 'Chromium started and then stopped answering'
      : 'Chromium started and then stopped before it was ready';
    fail(`Error: ${crashedWhat}, and this message cannot say whether the cause was this machine -- a security tool, an out-of-memory kill, a sandbox policy, or a display a visible window needed and could not get -- or a damaged browser build. ${browserSurvey.remediation || 'The trial launch reported no reason.'} Nothing has been replaced: replacing the build deletes the copy you already have, which is the wrong move when the machine is the cause. If you have ruled the machine out, and accepting that a download which then fails leaves you with neither, replace just this build with: node '${PLAYWRIGHT_CLI}' ${crashedForce}`);
  }

  requireInstallConsent('browser');

  process.stderr.write('Installing the Chromium build this tool drives.\n');
  let plainInstallSucceeded = true;
  try {
    execFileSync(process.execPath, [PLAYWRIGHT_CLI, 'install', 'chromium'], {
      cwd: RUNTIME_DIR,
      stdio: ['ignore', 'ignore', 'inherit']
    });
  } catch {
    plainInstallSucceeded = false;
  }
  if (await chromiumLaunches()) return;

  if (plainInstallSucceeded && browserSurvey.failure === 'artifact') {
    const forceArgs = runtime.forceInstallArgs(LAUNCH_OPTIONS);
    process.stderr.write('Replacing the Chromium build this tool drives: the install had nothing to fetch and it still will not launch.\n');
    try {
      execFileSync(process.execPath, [PLAYWRIGHT_CLI, ...forceArgs], {
        cwd: RUNTIME_DIR,
        stdio: ['ignore', 'ignore', 'inherit']
      });
    } catch {
      // Not a verdict; the launch below is.
    }
    if (await chromiumLaunches()) return;
  }

  const browsersRoot = installDestinationForDiagnosis();
  if (browsersRoot && !isWritable(browsersRoot)) {
    fail(`Error: the Chromium build could not be installed because ${browsersRoot} is not writable. That is where Playwright puts browser builds on this machine, and PLAYWRIGHT_BROWSERS_PATH chooses it when that variable is set. Point it at a directory you own, or make this one writable, then run the command again. tools/AGENTS.md names every path Playwright may use.`);
  }
  fail(`Error: the Chromium build still cannot launch after an authorised install. ${(browserSurvey && browserSurvey.remediation) || 'The trial launch reported no reason.'} Playwright fetches the build from https://cdn.playwright.dev, falling back to playwright.download.prss.microsoft.com, so a network that blocks those hosts stops here even though npm succeeded. Run this by hand: node '${PLAYWRIGHT_CLI}' install chromium to see Playwright's own message. tools/AGENTS.md names where the build lands.`);
}

function positiveInteger(name, raw, max) {
  if (!/^[0-9]+$/.test(raw) || Number(raw) < 1) {
    fail(`Error: ${name} must be a whole number of 1 or more; got "${raw}".`);
  }
  const value = Number(raw);
  if (max !== undefined && value > max) {
    fail(`Error: ${name} must be ${max} or less; got "${raw}".`);
  }
  return value;
}

function htmlPositiveNumber(name, raw) {
  const value = Number(raw);
  if (raw.trim() === '' || !Number.isFinite(value) || value <= 0) {
    fail(`Error: ${name} must be a number above zero; got "${raw}".`);
  }
  return value;
}

function svgPositiveNumber(name, raw, { integer = false } = {}) {
  if (raw === undefined) return undefined;
  const shape = integer ? /^\d+$/ : /^\d*\.?\d+$/;
  const value = integer ? Number.parseInt(raw, 10) : Number.parseFloat(raw);
  if (!shape.test(raw.trim()) || !Number.isFinite(value) || value <= 0) {
    fail(`Error: ${name} must be a positive ${integer ? 'whole number' : 'number'}; got "${raw}".`);
  }
  return value;
}

async function runHtml(argv) {
  const usageCmd = 'node scripts/render.js help';
  const VALUE_FLAGS = new Set([
    '--input', '--output', '--width', '--height', '--scale', '--quality', '--timeout'
  ]);
  const BARE_FLAGS = new Set(['--install', '--overwrite', '--help', '-h']);
  refuseUnknown(argv, VALUE_FLAGS, BARE_FLAGS, usageCmd);
  const flag = (name) => flagFrom(argv, name, usageCmd);

  const inputRaw = flag('--input');
  if (!inputRaw) {
    fail('Error: --input is required. Pass the absolute path of the HTML file to render. Run "node scripts/render.js help" for usage.');
  }
  if (!isAbsolute(inputRaw)) {
    fail(`Error: --input must be absolute; got "${inputRaw}". A relative path resolves against whichever directory the caller was in, which is not this tool's directory.`);
  }
  const inputPath = resolve(inputRaw);
  if (!existsSync(inputPath)) {
    fail(`Error: no file at ${inputPath}. Check the path; an absolute one cannot be misread.`);
  }
  if (!statSync(inputPath).isFile()) {
    fail(`Error: ${inputPath} is not a file. Point --input at the HTML file itself, not at a directory.`);
  }

  const outputRaw = flag('--output');
  if (!outputRaw) {
    fail('Error: --output is required. This tool never picks a location: pass the absolute path of the image to write, in a work directory in the owning root.');
  }
  if (!isAbsolute(outputRaw)) {
    fail(`Error: --output must be absolute; got "${outputRaw}". Pass a resolved path in a work directory in the owning root.`);
  }
  const outputPath = canonical('--output', outputRaw);
  const toolReal = canonical('this tool directory', TOOL_DIR);
  if (outputPath === toolReal || outputPath.startsWith(`${toolReal}${sep}`) || descendsFrom(outputPath, toolReal)) {
    fail(`Error: --output resolves inside this tool directory (${toolReal}). Scripts write only to a work directory in the owning root; pass that path instead.`);
  }

  const format = FORMATS.get(extname(outputPath).toLowerCase());
  if (!format) {
    fail(`Error: --output must end .png, .jpg, or .jpeg; got "${outputPath}". The extension chooses the format.`);
  }

  const overwrite = argv.includes('--overwrite');
  if (existsSync(outputPath)) {
    if (statSync(outputPath).isDirectory()) {
      fail(`Error: ${outputPath} is a directory. --output names the image file to write, not the folder to write it into.`);
    }
    if (!overwrite) {
      fail(`Error: a file already exists at ${outputPath}. Pass --overwrite to replace it, or name a path that is free.`);
    }
  }

  const widthRaw = flag('--width');
  const width = widthRaw === undefined ? 1200 : positiveInteger('--width', widthRaw);

  const heightRaw = flag('--height');
  const height = heightRaw === undefined ? null : positiveInteger('--height', heightRaw);

  const scaleRaw = flag('--scale');
  const scale = scaleRaw === undefined ? HTML_DEFAULT_SCALE : htmlPositiveNumber('--scale', scaleRaw);

  const qualityRaw = flag('--quality');
  const quality = qualityRaw === undefined ? 90 : positiveInteger('--quality', qualityRaw, 100);

  const timeoutRaw = flag('--timeout');
  const timeout = timeoutRaw === undefined ? HTML_DEFAULT_TIMEOUT_MS : positiveInteger('--timeout', timeoutRaw);

  ensurePlaywright();
  await ensureChromium();

  try {
    mkdirSync(dirname(outputPath), { recursive: true });
  } catch {
    fail(`Error: could not create the directory for ${outputPath}. Pass a work directory in the owning root that this process may write to.`);
  }

  class RenderProblem extends Error {}

  let browser;
  let result = null;
  let failure = null;

  try {
    browser = await runtime.launch();

    const page = await browser.newPage({
      deviceScaleFactor: scale,
      viewport: { width, height: height ?? 800 }
    });

    await page.goto(pathToFileURL(inputPath).href, {
      waitUntil: 'networkidle',
      timeout
    });

    await new Promise((done) => setTimeout(done, HTML_SETTLE_MS));

    const shot = { path: outputPath, type: format };
    if (format === 'jpeg') {
      shot.quality = quality;
    }

    if (height) {
      await page.screenshot(shot);
    } else {
      const body = await page.$('body');
      const box = body === null ? null : await body.boundingBox();
      if (box === null || box.width < 1 || box.height < 1) {
        throw new RenderProblem('the page rendered nothing with a size to capture. Give the HTML visible content, or pass --height to shoot a fixed viewport instead.');
      }

      await page.setViewportSize({
        width: Math.max(width, Math.ceil(box.width)),
        height: Math.ceil(box.height) + FIT_MARGIN_PX
      });

      await body.screenshot(shot);
    }

    let size;
    try {
      size = imageSize(readFileSync(outputPath));
    } catch (problem) {
      throw new RenderProblem(`the render finished but ${outputPath} could not be measured: ${problem.message}. Re-run; if it repeats, the page produced nothing drawable.`);
    }

    result = { output: outputPath, format, width: size.width, height: size.height, scale };
  } catch (error) {
    if (error instanceof RenderProblem) {
      failure = `Error: ${error.message}`;
    } else if (error && error.name === 'TimeoutError') {
      failure = `Error: the page did not finish loading within ${timeout} ms. Something the page references is hanging rather than answering: inline the remote references or keep them beside the HTML, or raise --timeout if the asset is slow rather than unresponsive.`;
    } else {
      failure = `Error: the browser engine could not render ${inputPath}. Open that file in a browser to see what it does; the engine's own message is withheld because it quotes the page.`;
    }
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // Closing is cleanup. A failure here must not replace the real outcome.
      }
    }
  }

  if (failure) {
    fail(failure);
  }

  process.stdout.write(`${JSON.stringify(result)}\n`);
}

async function runSvg(argv) {
  const usageCmd = 'node scripts/render.js help';
  const VALUE_FLAGS = new Set(['--file', '--output', '--scale', '--width', '--timeout']);
  const BARE_FLAGS = new Set(['--install', '--overwrite', '--help', '-h']);
  refuseUnknown(argv, VALUE_FLAGS, BARE_FLAGS, usageCmd);
  const flag = (name) => flagFrom(argv, name, usageCmd);

  const filePath = flag('--file');
  if (!filePath) {
    fail('Error: --file is required. Pass the absolute path to the SVG to render. Run "node scripts/render.js help" for usage.');
  }
  if (!isAbsolute(filePath)) {
    fail(`Error: --file must be absolute; got "${filePath}". A relative path resolves against whichever directory the caller happened to be in.`);
  }
  if (!existsSync(filePath)) {
    fail(`Error: no file at ${filePath}. Pass the absolute path to the SVG.`);
  }

  const outputRaw = flag('--output');
  if (!outputRaw) {
    fail('Error: --output is required. Pass the absolute path of the PNG to write, in a work directory in the owning root.');
  }
  if (!isAbsolute(outputRaw)) {
    fail(`Error: --output must be absolute; got "${outputRaw}". A relative path resolves against whichever directory the caller happened to be in.`);
  }
  if (!/\.png$/i.test(outputRaw)) {
    fail(`Error: --output must end in .png; got "${outputRaw}". This tool writes PNG bytes and will not put them behind another extension.`);
  }
  const outputPath = canonical('--output', outputRaw);
  const toolReal = canonical('this tool directory', TOOL_DIR);
  if (isInsideDirectory(outputPath, toolReal) || descendsFrom(outputPath, toolReal)) {
    fail(`Error: --output resolves inside this tool directory (${toolReal}). Scripts write only to a work directory in the owning root; pass that path instead.`);
  }
  if (existsSync(outputPath) && !argv.includes('--overwrite')) {
    fail(`Error: ${outputPath} already exists. Pass --overwrite to replace it, or name a path that is free.`);
  }

  const scale = svgPositiveNumber('--scale', flag('--scale')) ?? SVG_DEFAULT_SCALE;
  const targetWidth = svgPositiveNumber('--width', flag('--width'), { integer: true }) ?? null;
  const timeoutMs = svgPositiveNumber('--timeout', flag('--timeout'), { integer: true }) ?? SVG_DEFAULT_TIMEOUT_MS;

  let svgContent;
  try {
    svgContent = readFileSync(filePath, 'utf8');
  } catch {
    fail(`Error: could not read ${filePath}. Confirm it is a readable file, not a directory.`);
  }

  if (!/<svg\b/i.test(svgContent)) {
    fail(`Error: ${filePath} holds no <svg> element. Pass an SVG file; a renamed PNG belongs to the image tool and an HTML page to the html subcommand.`);
  }

  const svgSize = readSvgSize(svgContent);
  const output = resolveOutputSize({
    svgWidth: svgSize.width,
    svgHeight: svgSize.height,
    scale,
    targetWidth
  });

  ensurePlaywright();
  await ensureChromium();

  try {
    mkdirSync(dirname(outputPath), { recursive: true });
  } catch {
    fail(`Error: could not create the folder for ${outputPath}. Confirm the parent path is writable by this account.`);
  }

  let browser;
  try {
    browser = await runtime.launch();
  } catch (error) {
    const report = await runtime.prepareBrowserRuntime();
    let detail = report.remediation || '';
    if (!detail) {
      const line = String(error.message || '').split('\n')[0];
      if (/install-deps|missing dependencies to run browsers/i.test(line)) {
        detail =
          'dependency: Chromium OS libraries; check: npm run check:chromium. Next: provide a C compiler so userspace stubs can be built, or add the missing libraries to the base image.';
      } else {
        detail = line || 'chromiumLaunch:false';
      }
    }
    fail(`Error: Chromium cannot launch; check: ${BROWSER_CHECK}. ${detail}. See the Dependencies section of TOOL.md.`);
  }

  let failure = null;
  try {
    const page = await browser.newPage();
    await page.setViewportSize({ width: output.width, height: output.height });
    const markup = withViewBox(svgContent, svgSize);
    await page.setContent(buildDocument(markup, output.width, output.height), {
      waitUntil: 'networkidle',
      timeout: timeoutMs
    });
    await page.waitForTimeout(SVG_FONT_SETTLE_MS);

    await page.screenshot({
      path: outputPath,
      type: 'png',
      clip: { x: 0, y: 0, width: output.width, height: output.height }
    });
  } catch (error) {
    failure = error?.name === 'TimeoutError'
      ? `Error: ${filePath} did not finish loading within ${timeoutMs} ms. Everything the SVG references is fetched before the screenshot: confirm each remote font or image it names is reachable, embed them in the file, or raise --timeout.`
      : `Error: could not render ${filePath} at ${output.width}x${output.height}. See Troubleshooting in TOOL.md; an unreachable reference inside the SVG and an output size past what the browser will allocate are the two usual causes.`;
  }

  await browser.close();

  if (failure) {
    fail(failure);
  }

  process.stdout.write(`${JSON.stringify({
    output: outputPath,
    width: output.width,
    height: output.height,
    scale: output.scale,
    sizedFrom: svgSize.sizedFrom
  })}\n`);
}

async function runMermaid(argv) {
  let options;

  try {
    options = readOptions(argv.slice(1), TOOL_DIR);
  } catch (error) {
    if (error instanceof UsageError) {
      fail(`Error: ${error.message}. Run "node scripts/render.js help" for usage.`);
    }
    throw error;
  }

  options.outputPath = canonical('--output', options.outputPath);
  const toolReal = canonical('this tool directory', TOOL_DIR);
  if (
    options.outputPath === toolReal ||
    options.outputPath.startsWith(`${toolReal}${sep}`) ||
    descendsFrom(options.outputPath, toolReal)
  ) {
    fail(`Error: --output resolves inside this tool directory (${toolReal}). Scripts write only to a work directory in the owning root; pass that path instead. Run "node scripts/render.js help" for usage.`);
  }

  if (!existsSync(options.inputPath)) {
    fail(`Error: no file at ${options.inputPath}. Check the path; an absolute one cannot be misread.`);
  }

  let diagram;

  try {
    diagram = readFileSync(options.inputPath, 'utf8').trim();
  } catch {
    fail(`Error: could not read ${options.inputPath}. Point --file at a readable text file holding Mermaid source.`);
  }

  if (!diagram) {
    fail(`Error: ${options.inputPath} is empty. A Mermaid file opens with its diagram type, such as a graph or sequence declaration.`);
  }

  if (!options.overwrite && existsSync(options.outputPath)) {
    fail(`Error: ${options.outputPath} already exists. Pass --overwrite to replace it, or name a path nothing holds yet.`);
  }

  ensureMermaidPackages();
  await ensureChromium();

  if (browserSurvey === null) await chromiumLaunches();
  if (browserSurvey.chromiumLaunch !== true) {
    fail(
      `Error: Chromium cannot launch; check: ${BROWSER_CHECK}. ${browserSurvey.remediation || 'chromiumLaunch:false'}. See the Dependencies section of TOOL.md.`
    );
  }

  try {
    mkdirSync(dirname(options.outputPath), { recursive: true });
  } catch {
    fail(`Error: could not create the directory for ${options.outputPath}. Pass a work directory in the owning root that this process may write to.`);
  }

  async function render() {
    const browser = await runtime.launch();

    try {
      const page = await browser.newPage({
        deviceScaleFactor: options.scale,
        viewport: { width: viewportWidth(options.width), height: 800 }
      });

      await page.setContent(buildShell(options));

      await page.$eval('.mermaid', (node, source) => {
        node.textContent = source;
      }, diagram);

      await page.addScriptTag({ path: MERMAID_SCRIPT });

      const rendered = await page.evaluate(async (theme) => {
        try {
          window.mermaid.initialize({
            startOnLoad: false,
            theme,
            flowchart: { useMaxWidth: true, htmlLabels: true }
          });
          await window.mermaid.run({ querySelector: '.mermaid' });
          return { ok: true };
        } catch (error) {
          return { ok: false, message: String(error && error.message) };
        }
      }, options.theme);

      if (!rendered.ok) {
        const line = parseErrorLine(rendered.message);
        throw new UsageError(
          line === null
            ? 'the diagram did not parse. Check its syntax, starting with the diagram type on the first line'
            : `the diagram did not parse; the renderer stopped at line ${line}`
        );
      }

      try {
        await page.waitForSelector('.mermaid svg', { timeout: options.timeout });
      } catch {
        throw new UsageError(`the diagram parsed but did not finish rendering within ${options.timeout} ms. Raise --timeout for a very large diagram; if a Mermaid preview draws it at once, re-run the Dependencies check`);
      }

      await page.waitForTimeout(500);

      const fitted = await page.evaluate(fitDiagram, options.width);

      if (!fitted) {
        throw new Error('the rendered diagram reported no size to capture');
      }

      const element = await page.$('#container');

      if (!element) {
        throw new Error('the rendered diagram left no element to capture');
      }

      try {
        await element.screenshot({
          path: options.outputPath,
          type: 'png',
          omitBackground: options.background === 'transparent'
        });
      } catch {
        throw new UsageError(`the diagram rendered but ${options.outputPath} could not be written. Check that this process may write there, and pass a work directory in the owning root`);
      }
    } finally {
      await browser.close();
    }
  }

  try {
    await render();
  } catch (error) {
    if (error instanceof UsageError) {
      fail(`Error: ${error.message}.`);
    }
    fail(`Error: rendering ${options.inputPath} failed in the browser. Confirm the diagram renders in a Mermaid preview, then re-run; if it does, the browser install is the next thing to check with: ${BROWSER_CHECK}`);
  }

  let size;

  try {
    size = pngSize(readFileSync(options.outputPath));
  } catch (error) {
    fail(`Error: the render finished but ${options.outputPath} could not be measured: ${error.message}. Re-run; if it repeats, the diagram produced no drawable output.`);
  }

  process.stdout.write(`${JSON.stringify({
    path: options.outputPath,
    width: size.width,
    height: size.height,
    scale: options.scale,
    maxWidth: options.width,
    theme: options.theme,
    background: options.background
  })}\n`);
}

async function runUrl(argv) {
  const usageCmd = 'node scripts/render.js help';
  refuseUnknown(argv, URL_VALUE_FLAGS, URL_BARE_FLAGS, usageCmd);
  const flag = (name) => flagFrom(argv, name, usageCmd);

  const checkedUrl = validateUrl(flag('--url'));
  if (!checkedUrl.ok) fail(checkedUrl.message);
  const url = checkedUrl.value;

  const checkedDestination = await screenDestination(url);
  if (!checkedDestination.ok) fail(checkedDestination.message);

  const checkedOutput = validateOutput(flag('--output'), TOOL_DIR);
  if (!checkedOutput.ok) fail(checkedOutput.message);
  const outputPath = canonical('--output', checkedOutput.value);
  const toolReal = canonical('this tool directory', TOOL_DIR);
  if (outputPath === toolReal || outputPath.startsWith(`${toolReal}${sep}`) || descendsFrom(outputPath, toolReal)) {
    fail(`Error: --output resolves inside this tool directory (${toolReal}). Pass a work directory in the owning root instead.`);
  }

  const checkedWidth = validateWidth(flag('--width'));
  if (!checkedWidth.ok) fail(checkedWidth.message);
  const width = checkedWidth.value;

  const checkedHeight = validateHeight(flag('--height'));
  if (!checkedHeight.ok) fail(checkedHeight.message);
  const height = checkedHeight.value;

  const checkedScale = validateScale(flag('--scale'));
  if (!checkedScale.ok) fail(checkedScale.message);
  const scale = checkedScale.value;

  const checkedTimeout = validateTimeout(flag('--timeout'));
  if (!checkedTimeout.ok) fail(checkedTimeout.message);
  const timeoutMs = checkedTimeout.value;

  const fullPage = argv.includes('--full-page');

  const checkedOverwrite = validateOverwrite(outputPath, { overwrite: argv.includes('--overwrite') });
  if (!checkedOverwrite.ok) fail(checkedOverwrite.message);

  ensurePlaywright();
  await ensureChromium();

  if (browserSurvey.chromiumLaunch !== true) {
    fail(
      `Error: Chromium cannot launch; check: node scripts/render.js check. ${browserSurvey.remediation || 'chromiumLaunch:false'}. See the Dependencies section of TOOL.md.`
    );
  }

  let browser;
  let result;
  let failure;

  try {
    browser = await runtime.launch();
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });

    const response = await page.goto(url, { waitUntil: 'networkidle', timeout: timeoutMs });

    await page.waitForTimeout(URL_SETTLE_MS);

    const parent = dirname(outputPath);
    if (!existsSync(parent)) mkdirSync(parent, { recursive: true });

    const image = await page.screenshot({ path: outputPath, type: 'png', fullPage });
    const size = pngSizeFromHeader(image);

    result = {
      output: outputPath,
      url,
      finalUrl: page.url(),
      status: response ? response.status() : null,
      width: size ? size.width : null,
      height: size ? size.height : null,
      scale,
      fullPage
    };
  } catch (error) {
    failure = classifyFailure(error && error.message, { url, timeoutMs }).message;
  } finally {
    if (browser) await browser.close();
  }

  if (failure) fail(failure);

  process.stdout.write(`${JSON.stringify(result)}\n`);
}

async function runCheck(argv) {
  const usageCmd = 'node scripts/render.js help';
  refuseUnknown(argv, URL_VALUE_FLAGS, URL_BARE_FLAGS, usageCmd);

  if (!existsSync(PLAYWRIGHT_MARKER) && flagAuthorised()) {
    ensurePlaywright();
  }

  if (flagAuthorised()) await ensureChromium();

  if (browserSurvey === null && !existsSync(PLAYWRIGHT_MARKER)) {
    browserSurvey = {
      playwright: false, chromiumBinary: false, chromiumLaunch: false,
      failure: 'artifact',
      remediation: 'dependency: playwright in the shared browser runtime; check: node_modules/playwright/package.json inside tools/lib/browser-runtime/. Next: run node scripts/render.js check --install to install the packages and the Chromium build in one authorised run, then report on them.'
    };
  }
  if (browserSurvey === null) await chromiumLaunches();

  process.stdout.write(`${JSON.stringify({ packages: existsSync(PLAYWRIGHT_MARKER), ...browserSurvey })}\n`);
  process.exit(0);
}

const argv = process.argv.slice(2);
const command = argv[0] ?? 'help';

if (command === 'help' || command === '--help' || command === '-h') {
  process.stdout.write(`${USAGE}\n`);
  process.exit(0);
}

if (!SUBCOMMANDS.has(command)) {
  fail(`Error: unknown command "${command}". Run "node scripts/render.js help" for usage.`);
}

if (argv[1] === 'help' || argv.includes('--help') || argv.includes('-h')) {
  process.stdout.write(`${SUB_USAGE[command]}\n`);
  process.exit(0);
}

if (command !== 'check') writeConsent(HERE, 'render');

if (command === 'html') await runHtml(argv);
else if (command === 'svg') await runSvg(argv);
else if (command === 'mermaid') await runMermaid(argv);
else if (command === 'url') await runUrl(argv);
else if (command === 'check') await runCheck(argv);
