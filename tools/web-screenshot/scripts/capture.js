#!/usr/bin/env node
/**
 * web-screenshot - capture a PNG of a live web page
 *
 * Usage:
 *   node scripts/capture.js help
 *   node scripts/capture.js check
 *   node scripts/capture.js capture --url <address> --output <path>.png [--width 1280] [--height 720] [--scale 1] [--timeout 30000] [--full-page] [--overwrite]
 *
 * Node built-ins and this tool's own files only; nothing here imports from
 * outside this tool directory. The rules every shipped script follows are
 * stated once, in system/templates/Script Contract.md.
 */

import { execFileSync } from 'node:child_process';
import { accessSync, constants, existsSync, mkdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_HEIGHT,
  DEFAULT_SCALE,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_WIDTH,
  SETTLE_MS,
  classifyFailure,
  pngSizeFromHeader,
  validateHeight,
  validateOutput,
  validateOverwrite,
  validateScale,
  validateTimeout,
  validateUrl,
  validateWidth
} from './capture-core.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const TOOL_DIR = resolve(SCRIPT_DIR, '..');

// One installed package's own manifest. An interrupted install leaves
// node_modules/ behind with nothing in it, so the directory proves nothing.
const DEP_MARKER = join(TOOL_DIR, 'node_modules', 'playwright', 'package.json');

const COMMANDS = new Set(['capture', 'check']);

const USAGE = `web-screenshot - capture a PNG of a live web page

Usage:
  node scripts/capture.js help
  node scripts/capture.js check
  node scripts/capture.js capture --url <address> --output <path>.png
    [--width 1280] [--height 720] [--scale 1] [--timeout 30000] [--full-page] [--overwrite]

Commands:
  capture          Load the page and write a PNG of it
  check            Report whether the Chromium build this tool renders with is present
  help             Print this message

Options:
  --url <address>  Page to capture, http or https. Required.
  --output <path>  Absolute path of the .png to write, outside this tool
                   directory. Required; this tool has no default destination.
  --width <n>      Viewport width in pixels. Default ${DEFAULT_WIDTH}.
  --height <n>     Viewport height in pixels. Default ${DEFAULT_HEIGHT}.
  --scale <n>      Device scale factor: the image is this many pixels per
                   viewport pixel. Default ${DEFAULT_SCALE}.
  --timeout <n>    Milliseconds to wait for the page's network activity to
                   stop. Default ${DEFAULT_TIMEOUT_MS}; minimum 1000.
  --full-page      Capture the whole scrollable page instead of the viewport.
  --overwrite      Replace the file at --output when one is already there.
  --install Authorise the first-run install. Without it a tool that is
          not installed yet reports what it would fetch, and from
          where, and stops. WISER_ALLOW_INSTALL=1 does the same
          for an unattended run.
  --help           Print this message

Reaches the one address --url names and writes the one file --output names.
Needs no credentials and no configuration file, so no command takes --env.
Success prints one JSON object to stdout; anything else goes to stderr with
exit 1.`;

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

// Arguments. Parsed first so help costs nothing: no install, no browser, no
// network. help and --help are the only paths that print to stdout and exit 0
// without doing work.
const argv = process.argv.slice(2);
const command = argv[0] ?? 'help';

if (command === 'help' || argv.includes('--help') || argv.includes('-h')) {
  process.stdout.write(`${USAGE}\n`);
  process.exit(0);
}

if (!COMMANDS.has(command)) {
  fail(`Error: unknown command "${command}". Run "node scripts/capture.js help" for usage.`);
}

const VALUE_FLAGS = new Set(['--url', '--output', '--width', '--height', '--scale', '--timeout']);
const BARE_FLAGS = new Set([
  '--install','--full-page', '--overwrite', '--help', '-h']);

// The position after each value flag belongs to that flag.
const valuePositions = new Set();
for (let index = 1; index < argv.length; index += 1) {
  if (VALUE_FLAGS.has(argv[index])) valuePositions.add(index + 1);
}

// An unrecognized flag is refused rather than ignored: a silently dropped
// option returns a file that looks finished and is not what was asked for.
for (let index = 1; index < argv.length; index += 1) {
  const option = argv[index];
  if (valuePositions.has(index)) continue;
  if (option.startsWith('-') && !VALUE_FLAGS.has(option) && !BARE_FLAGS.has(option)) {
    fail(`Error: unknown option "${option}". Run "node scripts/capture.js help" for usage.`);
  }
}

function flag(name) {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    fail(`Error: ${name} needs a value. Run "node scripts/capture.js help" for usage.`);
  }
  return value;
}

/**
 * The canonical form of a path, following symbolic links wherever the path
 * exists. Resolving a name is not opening the file it names, so this runs before
 * anything is installed, fetched, or written.
 *
 * `validateOutput` normalizes lexically and follows nothing on disk, so a
 * symbolic link standing in for any ancestor is a spelling it does not match. The
 * output usually does not exist yet, so a path whose leaf is absent is
 * canonicalized through the deepest ancestor that does exist and the missing
 * components joined back on: that ancestor is where the write would land.
 *
 * Absence is the only reason to keep walking. Any other refusal from the
 * filesystem, an unreadable ancestor or a loop of symbolic links, means the real
 * path cannot be known, and a screen that cannot know where a write lands refuses
 * rather than falling back to comparing the caller's spelling.
 *
 * Filesystem work only, so `capture-core.js` stays free of it and its rules stay
 * testable on a copy with nothing installed.
 */
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

/**
 * True when `candidate` names `directory` itself or something beneath it,
 * decided by identity rather than by spelling.
 *
 * `validateOutput` compares names, and a name is not enough here. `realpathSync`
 * preserves whatever case the caller wrote, so on a case-insensitive volume a
 * variant spelling of this tool's own directory canonicalizes to a string
 * carrying none of `directory`'s prefix even though it names that very
 * directory, and the name test alone lets the capture through. Device and inode
 * are a directory's own identity, which no spelling reaches, so every existing
 * ancestor of `candidate` is compared that way. An output file does not exist yet
 * and has no inode, which is why the walk climbs to the deepest ancestor that
 * does: that ancestor is where the write lands.
 */
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

// Built-in-only validation, before the dependency check, so a usage mistake
// never triggers an install and never opens a connection.
let url;
let outputPath;
let width;
let height;
let scale;
let timeoutMs;
let fullPage = false;

if (command === 'capture') {
  const checkedUrl = validateUrl(flag('--url'));
  if (!checkedUrl.ok) fail(checkedUrl.message);
  url = checkedUrl.value;

  const checkedOutput = validateOutput(flag('--output'), TOOL_DIR);
  if (!checkedOutput.ok) fail(checkedOutput.message);
  // The screen's decision has to be made about the path the write will use, so
  // the lexically cleared value is canonicalized and the containment rule is put
  // to it again: a symbolic link, a relative spelling and a differently spelled
  // ancestor all collapse onto one real path here. The name test alone is not
  // the whole screen either, which is what `descendsFrom` beside it closes, and
  // everything below writes this value rather than the caller's spelling.
  outputPath = canonical('--output', checkedOutput.value);
  const toolReal = canonical('this tool directory', TOOL_DIR);
  if (outputPath === toolReal || outputPath.startsWith(`${toolReal}${sep}`) || descendsFrom(outputPath, toolReal)) {
    fail(`Error: --output resolves inside this tool directory (${toolReal}). Pass a work directory in the owning root instead.`);
  }

  const checkedWidth = validateWidth(flag('--width'));
  if (!checkedWidth.ok) fail(checkedWidth.message);
  width = checkedWidth.value;

  const checkedHeight = validateHeight(flag('--height'));
  if (!checkedHeight.ok) fail(checkedHeight.message);
  height = checkedHeight.value;

  const checkedScale = validateScale(flag('--scale'));
  if (!checkedScale.ok) fail(checkedScale.message);
  scale = checkedScale.value;

  const checkedTimeout = validateTimeout(flag('--timeout'));
  if (!checkedTimeout.ok) fail(checkedTimeout.message);
  timeoutMs = checkedTimeout.value;

  fullPage = argv.includes('--full-page');

  // Last of the refusals, and the only one that reads the disk: a file already
  // at --output is the caller's earlier work, and a capture replaces it whole.
  const checkedOverwrite = validateOverwrite(outputPath, { overwrite: argv.includes('--overwrite') });
  if (!checkedOverwrite.ok) fail(checkedOverwrite.message);
}

// Whether this process can create files in a directory. Used only to tell an
// unwritable install location apart from a failed install, per Output and errors.
function isWritable(dir) {
  try { accessSync(dir, constants.W_OK); return true; } catch { return false; }
}

// Consent before an install, per the Script Contract's Dependencies clause.
//
// A tool used to install its packages on its own account the first time it was
// called, then tell the caller to run the command again. That is two problems:
// several hundred megabytes could arrive on a machine without anyone agreeing
// to it, and the work then took two runs to do once.
//
// A script cannot ask. Nothing here reads stdin, deliberately, so a run with
// nobody watching fails rather than waiting forever for an answer. So the
// script reports and stops, and whoever is driving it does the asking: the
// report names the packages, the hosts they come from, and the size where it is
// large enough to matter, which is what a person needs in order to answer.
// `--install` on the same command authorises it and the run then COMPLETES
// rather than demanding a re-run. WISER_ALLOW_INSTALL=1 authorises it for an
// unattended run, so automation does not acquire a new way to fail.
function installPlan() {
  let names = [];
  try {
    names = Object.keys(JSON.parse(readFileSync(join(TOOL_DIR, 'package.json'), 'utf8')).dependencies || {});
  } catch { /* the report degrades to a generic list; the refusal still stands */ }
  const browser = names.includes('playwright');
  return {
    list: names.length ? names.join(', ') : 'the packages package.json declares',
    hosts: browser ? 'registry.npmjs.org and cdn.playwright.dev' : 'registry.npmjs.org',
    size: browser ? ' The Chromium build alone is several hundred megabytes.' : ''
  };
}

// `what` is 'packages' or 'browser'. Round 6 found the browser case reported the
// package case: a tool whose packages are installed and whose browser build is
// not is a real state -- every machine that ran a browser tool before the
// installer existed is in it -- and the report a person answers must not open
// "this tool is not installed yet", nor name a registry fetch and an npm cache
// write that this install will not make.
function requireInstallConsent(what) {
  if (process.argv.includes('--install') || process.env.WISER_ALLOW_INSTALL === '1') return;
  if (what === 'browser') {
    fail(
      `Error: this tool's packages are installed but the Chromium build they drive is not, and this run did not authorise an install. Installing fetches that build from cdn.playwright.dev, or playwright.download.prss.microsoft.com when Playwright falls back, several hundred megabytes, into wherever Playwright keeps browser builds on this machine. No package is fetched and npm is not run. tools/AGENTS.md lists every write an install makes and names where the build lands. Re-run the same command with --install to authorise it, or set WISER_ALLOW_INSTALL=1 for an unattended run. Nothing is read from stdin, so this is the only way to answer.`
    );
  }
  const { list, hosts, size } = installPlan();
  fail(
    `Error: this tool is not installed yet and this run did not authorise an install. Installing fetches ${list} from ${hosts} into ${TOOL_DIR}, and npm writes its own cache outside this plugin.${size} tools/AGENTS.md lists every write an install makes. Re-run the same command with --install to authorise it, or set WISER_ALLOW_INSTALL=1 for an unattended run. Nothing is read from stdin, so this is the only way to answer.`
  );
}

// Dependencies. Runs before any package import; keep it above the dynamic import.
if (!existsSync(DEP_MARKER)) {
  requireInstallConsent('packages');
  process.stderr.write('First run: installing dependencies in this tool directory.\n');
  try {
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    // stderr only: npm output on stdout would break the empty-stdout-on-failure rule.
    execFileSync(npm, ['ci'], { cwd: TOOL_DIR, stdio: ['ignore', 'ignore', 'inherit'] });
  } catch {
    // Two different failures arrive here and they have different fixes, so the
    // Script Contract's Output and errors clause requires telling them apart:
    // an unwritable tool directory is not a broken install, and telling someone
    // to run "npm ci" by hand where they cannot write cannot succeed.
    if (!isWritable(TOOL_DIR)) {
      fail(`Error: cannot install dependencies because ${TOOL_DIR} is not writable. This tool installs its dependencies into its own directory on the run that authorises it with --install, so that directory has to be writable. Install this plugin somewhere you own, or make that directory writable, then run the command again.`);
    }
    fail(`Error: npm ci failed in ${TOOL_DIR}. Confirm Node 18 or newer, then that package-lock.json is present and matches package.json, which is what npm ci requires and will not resolve around. Delete node_modules there and run "npm ci" by hand to see npm's own message. A lockfile that is missing or out of step with the manifest is a defect in this copy of the plugin, not something a re-run fixes.`);
  }
  if (!existsSync(DEP_MARKER)) {
    fail(`Error: npm ci finished but ${DEP_MARKER} is still missing. Check that package.json lists every package this script imports.`);
  }
}

// The Chromium build. `playwright` carries NO install script, so `npm ci`
// installs the package and fetches no browser at all. Until this ran, an
// authorised install ended at `chromiumLaunch:false` with no step in this
// repository that would have fixed it, while the consent report above had
// already named the download and its size. The report is the promise; this is
// what keeps it. Same authorisation, because it is the same install: the
// several hundred megabytes are the part a person is actually being asked about.
const PLAYWRIGHT_CLI = join(TOOL_DIR, 'node_modules', 'playwright', 'cli.js');

// What `install chromium` puts on disk, asked of Playwright's own installer
// rather than guessed from a path this script builds: `--dry-run` names every
// artifact and the directory it lands in, so a Playwright release that adds one
// is covered without editing this file. Null means the question could not be
// asked -- no package yet, or a CLI that does not answer it.
function chromiumPlan() {
  try {
    const report = execFileSync(process.execPath, [PLAYWRIGHT_CLI, 'install', 'chromium', '--dry-run'], {
      cwd: TOOL_DIR,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    });
    const locations = [...report.matchAll(/^\s*Install location:\s*(\S.*)$/gm)].map((m) => m[1].trim());
    return locations.length ? locations : null;
  } catch {
    return null;
  }
}

// EVERY artifact, not just the one `chromium.executablePath()` names. `install
// chromium` fetches three -- Chrome for Testing, FFmpeg and Chrome Headless
// Shell -- one after another, and a default headless launch uses the headless
// shell rather than Chrome. Round 6 measured what the old probe did with a
// download that died after the first: Chrome was present, the probe was
// satisfied, the installer was never run again, and --install could not repair
// the state it exists to repair.
async function chromiumInstalled() {
  const planned = chromiumPlan();
  if (planned) return planned.every((location) => existsSync(location));
  try {
    const { chromium } = await import('playwright');
    const binary = chromium.executablePath();
    return typeof binary === 'string' && binary.length > 0 && existsSync(binary);
  } catch {
    // No package, no registry entry, or a build this Playwright does not know.
    return false;
  }
}

/**
 * The Chromium build, asked for on the commands that need one. `check` is not
 * one of them: it is this tool's own survey of whether the browser is present,
 * TOOL.md's troubleshooting row for a missing binary sends the reader to it,
 * and its Usage row says it reaches no network. Round 6 measured what a
 * top-level gate did to it -- the documented remedy for a missing browser
 * answered "authorise an install first", so the one command that reports the
 * state could not run in it.
 */
async function ensureChromium() {
  if (await chromiumInstalled()) return;
  requireInstallConsent('browser');
  process.stderr.write('Installing the Chromium build this tool drives.\n');
  try {
    // Playwright's own installer, run from this tool's own copy rather than a
    // global one, so the version matches the package the lockfile pinned.
    execFileSync(process.execPath, [PLAYWRIGHT_CLI, 'install', 'chromium'], {
      cwd: TOOL_DIR,
      stdio: ['ignore', 'ignore', 'inherit']
    });
  } catch {
    // Two failures arrive here and they have different fixes, which is the same
    // Script Contract clause the npm block answers a few lines up. A browser
    // directory the caller cannot write is not a blocked network, and Playwright
    // prints nothing at all when the permission error throws before its first
    // request -- so naming the network there leaves the caller with no true text
    // at all and a remedy that reproduces the same silence.
    const destination = (chromiumPlan() || [])[0];
    const browsersRoot = destination ? dirname(destination) : null;
    if (browsersRoot && !isWritable(browsersRoot)) {
      fail(`Error: the Chromium build could not be installed because ${browsersRoot} is not writable. That is where Playwright puts browser builds on this machine, and PLAYWRIGHT_BROWSERS_PATH chooses it when that variable is set. Point it at a directory you own, or make this one writable, then run the command again. tools/AGENTS.md names every path Playwright may use.`);
    }
    fail(`Error: the Chromium build could not be installed. Playwright fetches it from https://cdn.playwright.dev, falling back to playwright.download.prss.microsoft.com, so a network that blocks those hosts will stop here even though npm succeeded. Run "node ${PLAYWRIGHT_CLI} install chromium" by hand to see Playwright's own message. tools/AGENTS.md names where the build lands.`);
  }
  if (!(await chromiumInstalled())) {
    fail(`Error: the Chromium install reported success but the browser is still incomplete. "install chromium" fetches several artifacts in sequence and this run left at least one of them absent. Run "node ${PLAYWRIGHT_CLI} install chromium --dry-run" to see what it expects and where, then "node ${PLAYWRIGHT_CLI} install chromium" by hand to see Playwright's own message.`);
  }
}

// Every command but `check` needs a browser to do its work, and asks for one
// here. `check` reports on what is there instead, and installs nothing.
if (command !== 'check') await ensureChromium();

// Shared browser runtime: dynamic import only on commands that need Chromium.
// Never a top-level static import — help must work on a never-installed copy.
const runtime = await import('./lib/browser-runtime.js');
const browserSurvey = await runtime.check();

if (command === 'check') {
  if (browserSurvey.chromiumLaunch === true) {
    process.stdout.write(`${JSON.stringify(browserSurvey)}\n`);
    process.exit(0);
  }
  fail(
    `Error: Chromium cannot launch; check: node scripts/capture.js check. ${browserSurvey.remediation || 'chromiumLaunch:false'}. See the Dependencies section of TOOL.md.`
  );
}

if (browserSurvey.chromiumLaunch !== true) {
  fail(
    `Error: Chromium cannot launch; check: node scripts/capture.js check. ${browserSurvey.remediation || 'chromiumLaunch:false'}. See the Dependencies section of TOOL.md.`
  );
}

// Work. One page, one navigation, one file.
let browser;
let result;
let failure;

try {
  browser = await runtime.launch();
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });

  const response = await page.goto(url, { waitUntil: 'networkidle', timeout: timeoutMs });

  // Settle: a page that finished loading may still be animating in its content.
  await page.waitForTimeout(SETTLE_MS);

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
  // The browser's own message classifies the failure and is never repeated:
  // this tool owns every sentence it prints.
  failure = classifyFailure(error && error.message, { url, timeoutMs }).message;
} finally {
  // Closed on both paths, and before the exit below: process.exit would skip it.
  if (browser) await browser.close();
}

if (failure) fail(failure);

process.stdout.write(`${JSON.stringify(result)}\n`);
