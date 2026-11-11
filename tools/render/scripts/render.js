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
import { createHash } from 'node:crypto';
import { accessSync, constants, existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import dns from 'node:dns';

import { INSTALL_HELP, installQuestion, formatInstallSize, INSTALL_BYTES, flagAuthorised, installAuthorised, parsedInstallFlag, writeConsent } from '../../lib/consent.js';
import { runtimeDir, activeRuntimeDir, personRuntimeDir, installBrowserRuntime } from '../../lib/browser-runtime/browser-runtime.js';

let install = false;

import {
  DEFAULT_SCALE as HTML_DEFAULT_SCALE,
  DEFAULT_TIMEOUT_MS as HTML_DEFAULT_TIMEOUT_MS,
  FORMATS,
} from './html-core.js';

import {
  DEFAULT_SCALE as SVG_DEFAULT_SCALE,
  DEFAULT_TIMEOUT_MS as SVG_DEFAULT_TIMEOUT_MS,
  isInsideDirectory,
} from './svg-core.js';

import {
  DEFAULTS as MERMAID_DEFAULTS,
  THEMES,
  UsageError,
  readOptions,
} from './mermaid-core.js';

import {
  DEFAULT_HEIGHT,
  DEFAULT_SCALE as URL_DEFAULT_SCALE,
  DEFAULT_TIMEOUT_MS as URL_DEFAULT_TIMEOUT_MS,
  DEFAULT_WIDTH,
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

const MERMAID_SCRIPT = join(TOOL_DIR, 'vendor', 'mermaid', 'mermaid.min.js');
const BROWSER_CHECK = 'npm run check:chromium';
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

  --install          ${INSTALL_HELP}
                     WISER_ALLOW_INSTALL=1 does the same for an unattended run.
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
  --input <path>   HTML file or ZIP to render, absolute. Required.
  --entry <name>   HTML path inside a ZIP when there is more than one page.
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
  --install          ${INSTALL_HELP}
                     WISER_ALLOW_INSTALL=1 does the same for an unattended run.
  --help           Print this message

Renders the file the caller names and writes the image the caller names. Needs
no credentials and no configuration file, so no command takes --env. The page is
loaded from upload bytes; include every referenced asset in the ZIP. Success
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
  --install          ${INSTALL_HELP}
                     WISER_ALLOW_INSTALL=1 does the same for an unattended run.
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
  --install          ${INSTALL_HELP}
                     WISER_ALLOW_INSTALL=1 does the same for an unattended run.
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
                   stop. Default ${URL_DEFAULT_TIMEOUT_MS}; minimum 1000, maximum 45000.
  --full-page      Capture the whole scrollable page instead of the viewport.
  --overwrite      Replace the file at --output when one is already there.
  --install          ${INSTALL_HELP}
                     WISER_ALLOW_INSTALL=1 does the same for an unattended run.
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
  --install          ${INSTALL_HELP}
                     WISER_ALLOW_INSTALL=1 does the same for an unattended run.
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

const BROWSER_SIZE = ' This run then fetches the Chromium build if it is missing, several hundred megabytes, from cdn.playwright.dev, or from playwright.download.prss.microsoft.com when Playwright falls back. That build does NOT land here: it goes wherever Playwright keeps browser builds on this machine, which tools/AGENTS.md names for each platform.';

function installPlan({ missingRuntime, missingBrowser }) {
  const fetches = [];
  if (missingRuntime) fetches.push(`playwright from registry.npmjs.org into ${personRuntimeDir()}`);
  return (fetches.length ? `Installing fetches ${fetches.join(' and ')}, and npm writes its own cache outside this plugin.` : '')
    + (missingRuntime || missingBrowser ? BROWSER_SIZE : '');
}

async function requireInstallConsent(what) {
  if (installAuthorised(HERE, install)) {
    writeConsent(HERE, 'render', install);
    return;
  }
  const missingRuntime = !activeRuntimeDir();
  // The same probe ensureChromium uses distinguishes absent artifacts from host
  // failures. With Playwright present, an absent build is a known part; a failure
  // ensureChromium still answers with an install, but that is not a known-absent
  // build, leaves the browser's need unknown, as it is before Playwright exists.
  const failure = what === 'browser' || missingRuntime || await chromiumLaunches() ? null : browserSurvey.failure;
  const missingBrowser = what === 'browser' || failure === 'artifact';
  const maybeBrowser = missingRuntime || (failure !== null && !['artifact', 'host', 'permission', 'crashed'].includes(failure));
  const parts = [];
  let bytes = 0;
  if (missingRuntime) { parts.push('the code that drives a browser'); bytes += INSTALL_BYTES.playwright; }
  if (missingBrowser) { parts.push('a private copy of the Chromium browser'); bytes += INSTALL_BYTES.chromium; }
  const named = parts.length < 3 ? parts.join(' and ') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
  const question = installQuestion(named + (maybeBrowser ? " (and a private copy of the Chromium browser, if you don't have it yet)" : ''),
    'turn web pages, drawings and diagrams into image files', maybeBrowser
      ? `${formatInstallSize(bytes)}, or about ${formatInstallSize(bytes + INSTALL_BYTES.chromium)} with the browser`
      : formatInstallSize(bytes));
  const details = installPlan({ missingRuntime, missingBrowser: missingBrowser || maybeBrowser });
  fail(`${question}\n\nDetails for the assistant: ${details} tools/AGENTS.md lists every write an install makes. Re-run the same command with --install to authorise it, or set WISER_ALLOW_INSTALL=1 for an unattended run. Nothing is read from stdin, so this is the only way to answer.`);
}

async function installRuntime() {
  process.stderr.write(`First run: installing dependencies in ${personRuntimeDir()}.\n`);
  try { await installBrowserRuntime(); }
  catch (error) { fail(`Error: ${error.message}`); }
}

async function ensurePlaywright() {
  if (Boolean(activeRuntimeDir())) return;
  await requireInstallConsent('packages');
  await installRuntime();
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

  await requireInstallConsent('browser');

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
    '--input', '--output', '--entry', '--width', '--height', '--scale', '--quality', '--timeout'
  ]);
  install = parsedInstallFlag(argv, VALUE_FLAGS);
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

  await ensurePlaywright();
  await ensureChromium();

  try {
    mkdirSync(dirname(outputPath), { recursive: true });
  } catch {
    fail(`Error: could not create the directory for ${outputPath}. Pass a work directory in the owning root that this process may write to.`);
  }

  await coreRun('renderHtml', { width, height, scale, quality, timeout, entry: flag('--entry') }, inputPath, outputPath);
}

async function runSvg(argv) {
  const usageCmd = 'node scripts/render.js help';
  const VALUE_FLAGS = new Set(['--file', '--output', '--scale', '--width', '--timeout']);
  install = parsedInstallFlag(argv, VALUE_FLAGS);
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

  if (statSync(filePath).size > 8 * 1024 * 1024) fail('Error: input file exceeds 8 MiB.');
  let svgContent;
  try {
    svgContent = readFileSync(filePath, 'utf8');
  } catch {
    fail(`Error: could not read ${filePath}. Confirm it is a readable file, not a directory.`);
  }

  if (!/<svg\b/i.test(svgContent)) {
    fail(`Error: ${filePath} holds no <svg> element. Pass an SVG file; a renamed PNG belongs to the image tool and an HTML page to the html subcommand.`);
  }

  await ensurePlaywright();
  await ensureChromium();

  try {
    mkdirSync(dirname(outputPath), { recursive: true });
  } catch {
    fail(`Error: could not create the folder for ${outputPath}. Confirm the parent path is writable by this account.`);
  }

  await coreRun('renderSvg', { scale, width: targetWidth, timeout: timeoutMs }, filePath, outputPath);
}

async function runMermaid(argv) {
  install = parsedInstallFlag(argv, new Set([
    '--file', '--output', '--width', '--scale', '--theme', '--background', '--timeout',
  ]));
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

  if (statSync(options.inputPath).size > 8 * 1024 * 1024) fail('Error: input file exceeds 8 MiB.');
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

  let mermaidScript;
  try {
    const manifest = JSON.parse(readFileSync(join(TOOL_DIR, 'vendor', 'manifest.json')));
    const row = manifest.files.find(file => file.path === 'mermaid/mermaid.min.js');
    mermaidScript = readFileSync(MERMAID_SCRIPT);
    if (!row || mermaidScript.length !== row.bytes || createHash('sha256').update(mermaidScript).digest('hex') !== row.sha256) throw new Error('altered carried file');
  } catch {
    fail('Error: the carried Mermaid browser file is missing or altered. Restore this plugin copy; see TOOL.md Dependencies.');
  }
  await ensurePlaywright();
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

  await coreRun('renderMermaid', { width: options.width, scale: options.scale, theme: options.theme, background: options.background, timeout: options.timeout }, options.inputPath, options.outputPath, { mermaidScript: new Uint8Array(mermaidScript) });
}

async function runUrl(argv) {
  install = parsedInstallFlag(argv, URL_VALUE_FLAGS);
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

  await ensurePlaywright();
  await ensureChromium();

  if (browserSurvey.chromiumLaunch !== true) {
    fail(
      `Error: Chromium cannot launch; check: node scripts/render.js check. ${browserSurvey.remediation || 'chromiumLaunch:false'}. See the Dependencies section of TOOL.md.`
    );
  }

  await coreRun('captureUrl', { url, width, height, scale, timeout: timeoutMs, fullPage }, null, outputPath);
}

async function coreRun(core, input, inputPath, outputPath, assets = {}) {
  let browser;
  let failure;
  try {
    if (inputPath && statSync(inputPath).size > 8 * 1024 * 1024) throw new Error('Error: input file exceeds 8 MiB.');
    const files = inputPath ? [{ name: basename(inputPath), mediaType: /\.zip$/i.test(inputPath) ? 'application/zip' : 'application/octet-stream', bytes: new Uint8Array(readFileSync(inputPath)) }] : [];
    browser = await runtime.launch();
    const engine = await import('./render-core.js');
    const output = await engine[core]({ ...input, output: basename(outputPath) }, files, {
      browser, fetch: globalThis.fetch, responseBody: bytes => Buffer.from(bytes),
      lookup: host => dns.promises.lookup(host, { all: true, verbatim: true }), ...assets
    });
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, output.files[0].bytes);
    const answer = { ...output.answer };
    answer[core === 'renderMermaid' ? 'path' : 'output'] = outputPath;
    process.stdout.write(`${JSON.stringify(answer)}\n`);
  } catch (error) {
    failure = error.message?.startsWith('Error:') || error.message?.startsWith('ZIP refused:') ? error.message : 'Error: browser rendering failed; engine text is withheld because it can quote the page.';
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  if (failure) fail(failure);
}

async function runCheck(argv) {
  install = parsedInstallFlag(argv, URL_VALUE_FLAGS);
  const usageCmd = 'node scripts/render.js help';
  refuseUnknown(argv, URL_VALUE_FLAGS, URL_BARE_FLAGS, usageCmd);

  if (!Boolean(activeRuntimeDir()) && flagAuthorised(install)) {
    await ensurePlaywright();
  }

  if (flagAuthorised(install)) await ensureChromium();

  if (browserSurvey === null && !Boolean(activeRuntimeDir())) {
    browserSurvey = {
      playwright: false, chromiumBinary: false, chromiumLaunch: false,
      failure: 'artifact',
      remediation: 'dependency: playwright in the shared browser runtime; check: node_modules/playwright/package.json inside the active browser runtime (tools/AGENTS.md). Next: run node scripts/render.js check --install to install the packages and the Chromium build in one authorised run, then report on them.'
    };
  }
  if (browserSurvey === null) await chromiumLaunches();

  process.stdout.write(`${JSON.stringify({ packages: Boolean(activeRuntimeDir()), ...browserSurvey })}\n`);
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

let RUNTIME_DIR;
try { RUNTIME_DIR = runtimeDir(); } catch (error) { fail(`Error: ${String(error.message).split('\n')[0]}`); }
const PLAYWRIGHT_MARKER = join(RUNTIME_DIR, 'node_modules', 'playwright', 'package.json');
const PLAYWRIGHT_CLI = join(RUNTIME_DIR, 'node_modules', 'playwright', 'cli.js');


if (command === 'html') await runHtml(argv);
else if (command === 'svg') await runSvg(argv);
else if (command === 'mermaid') await runMermaid(argv);
else if (command === 'url') await runUrl(argv);
else if (command === 'check') await runCheck(argv);
