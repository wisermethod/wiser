#!/usr/bin/env node
/**
 * svg-to-png - render an SVG file to a PNG file
 *
 * Usage:
 *   node scripts/render.js help
 *   node scripts/render.js render --file <path> --output <path> [--scale N]
 *                                 [--width N] [--timeout N] [--overwrite]
 *
 * Node built-ins only above the dependency check; nothing here imports from
 * outside this tool directory. The rules every shipped script follows are
 * stated once, in system/templates/Script Contract.md.
 */

import { execFileSync } from 'node:child_process';
import { accessSync, constants, existsSync, mkdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_SCALE, DEFAULT_TIMEOUT_MS, buildDocument, isInsideDirectory, readSvgSize, resolveOutputSize, withViewBox } from './render-core.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const TOOL_DIR = resolve(SCRIPT_DIR, '..');

// One installed package's own manifest. An interrupted install leaves
// node_modules/ behind with nothing in it, so the directory proves nothing.
const DEP_MARKER = join(TOOL_DIR, 'node_modules', 'playwright', 'package.json');

const BROWSER_CHECK = 'npm run check:chromium';
const COMMANDS = new Set(['render']);

// Fonts load asynchronously even after the network goes quiet; text rendered
// before they arrive falls back to a system face and changes the image.
const FONT_SETTLE_MS = 500;

const USAGE = `svg-to-png - render an SVG file to a PNG file

Usage:
  node scripts/render.js help
  node scripts/render.js render --file <path> --output <path> [--scale N]
                                [--width N] [--timeout N] [--overwrite]

Commands:
  render           Render the SVG and write the PNG
  help             Print this message

Options:
  --file <path>    SVG to render (absolute path). Required.
  --output <path>  PNG to write (absolute path, .png). Required. Must sit
                   outside this tool directory; missing parent folders are made.
  --scale N        Multiply the SVG's own dimensions by N (default: ${DEFAULT_SCALE}).
  --width N        Render at exactly N pixels wide, height following the aspect
                   ratio. Overrides --scale.
  --timeout N      Milliseconds the page may take to load whatever the SVG
                   references (default: ${DEFAULT_TIMEOUT_MS}).
  --overwrite      Replace an existing file at --output. Without it, a run that
                   would replace one refuses.
  --install Authorise the first-run install. Without it a tool that is
          not installed yet reports what it would fetch, and from
          where, and stops. WISER_ALLOW_INSTALL=1 does the same
          for an unattended run.
  --help           Print this message

Reads the one SVG the caller names and writes the one PNG the caller names.
Needs no credentials and no configuration file, so no command takes --env.
Success prints one JSON object to stdout; failures go to stderr with exit 1.`;

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

// Arguments. Parsed first so help costs nothing: no install, no file read.
const argv = process.argv.slice(2);
const command = argv[0] ?? 'help';

if (command === 'help' || argv.includes('--help') || argv.includes('-h')) {
  process.stdout.write(`${USAGE}\n`);
  process.exit(0);
}

if (!COMMANDS.has(command)) {
  fail(`Error: unknown command "${command}". Run "node scripts/render.js help" for usage.`);
}

const VALUE_FLAGS = new Set(['--file', '--output', '--scale', '--width', '--timeout']);
const BARE_FLAGS = new Set([
  '--install','--overwrite', '--help', '-h']);

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
    fail(`Error: unknown option "${option}". Run "node scripts/render.js help" for usage.`);
  }
}

function flag(name) {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    fail(`Error: ${name} needs a value. Run "node scripts/render.js help" for usage.`);
  }
  return value;
}

function positiveNumber(name, raw, { integer = false } = {}) {
  if (raw === undefined) return undefined;
  // The whole argument has to be the number: parseFloat alone reads "2px" as 2
  // and would render at a size the caller never asked for.
  const shape = integer ? /^\d+$/ : /^\d*\.?\d+$/;
  const value = integer ? Number.parseInt(raw, 10) : Number.parseFloat(raw);
  if (!shape.test(raw.trim()) || !Number.isFinite(value) || value <= 0) {
    fail(`Error: ${name} must be a positive ${integer ? 'whole number' : 'number'}; got "${raw}".`);
  }
  return value;
}

/**
 * The canonical form of a path, following symbolic links wherever the path
 * exists. Resolving a name is not opening the file it names, so this runs before
 * anything is read, installed, or written.
 *
 * `isInsideDirectory` normalizes lexically and follows nothing on disk, so a
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
 * Filesystem work only, so `render-core.js` stays free of it and its rules stay
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
 * `isInsideDirectory` compares names, and a name is not enough here.
 * `realpathSync` preserves whatever case the caller wrote, so on a
 * case-insensitive volume a variant spelling of this tool's own directory
 * canonicalizes to a string carrying none of `directory`'s prefix even though it
 * names that very directory, and the name test alone lets the write through.
 * Device and inode are a directory's own identity, which no spelling reaches, so
 * every existing ancestor of `candidate` is compared that way. An output file
 * does not exist yet and has no inode, which is why the walk climbs to the
 * deepest ancestor that does: that ancestor is where the write lands.
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
// never triggers an install and never starts a browser.
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
// Everything below writes `outputPath`, which is the path this screen resolved
// and cleared, not the string the caller typed. Keeping the caller's spelling
// past the screen would leave the two equal only for as long as nothing moved
// between the check and the write. Both sides are canonicalized, so a symbolic
// link, a relative spelling and a differently spelled ancestor collapse onto one
// real path; the name test alone is not the whole screen either, which is what
// `descendsFrom` beside it closes.
const outputPath = canonical('--output', outputRaw);
const toolReal = canonical('this tool directory', TOOL_DIR);
if (isInsideDirectory(outputPath, toolReal) || descendsFrom(outputPath, toolReal)) {
  fail(`Error: --output resolves inside this tool directory (${toolReal}). Scripts write only to a work directory in the owning root; pass that path instead.`);
}
// Replacing a file is opt-in, and the check runs here so a refused run costs no
// install and starts no browser. A render is cheap to repeat; the file already
// at that path may be the only copy of something that was not.
if (existsSync(outputPath) && !argv.includes('--overwrite')) {
  fail(`Error: ${outputPath} already exists. Pass --overwrite to replace it, or name a path that is free.`);
}

const scale = positiveNumber('--scale', flag('--scale')) ?? DEFAULT_SCALE;
const targetWidth = positiveNumber('--width', flag('--width'), { integer: true }) ?? null;
const timeoutMs = positiveNumber('--timeout', flag('--timeout'), { integer: true }) ?? DEFAULT_TIMEOUT_MS;

let svgContent;
try {
  svgContent = readFileSync(filePath, 'utf8');
} catch {
  // The runtime's own message is withheld; it can echo the path or file bytes.
  fail(`Error: could not read ${filePath}. Confirm it is a readable file, not a directory.`);
}

if (!/<svg\b/i.test(svgContent)) {
  fail(`Error: ${filePath} holds no <svg> element. Pass an SVG file; a renamed PNG belongs to image-edit and an HTML page to html-to-png.`);
}

const svgSize = readSvgSize(svgContent);
const output = resolveOutputSize({
  svgWidth: svgSize.width,
  svgHeight: svgSize.height,
  scale,
  targetWidth
});

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
  // A browser tool's authorised run makes TWO fetches, to two different places,
  // and this report used to fold them into one clause that was wrong about both
  // halves: `from registry.npmjs.org and cdn.playwright.dev into <TOOL_DIR>`
  // read as though the Chromium build landed in this directory, which it does
  // not, and it omitted the Microsoft fallback host that the browser message a
  // few lines down gets right. An egress allowlist built from that sentence is
  // short by a host and a disk-space estimate built from it looks in the wrong
  // place. So `hosts` is now only what NPM contacts -- which is the whole truth
  // for the clause it sits in -- and the browser fetch is a sentence of its own
  // with its own hosts and its own destination.
  return {
    list: names.length ? names.join(', ') : 'the packages package.json declares',
    hosts: 'registry.npmjs.org',
    size: browser
      ? ' This run then fetches the Chromium build that package drives, several hundred megabytes, from cdn.playwright.dev, or from playwright.download.prss.microsoft.com when Playwright falls back. That build does NOT land here: it goes wherever Playwright keeps browser builds on this machine, which tools/AGENTS.md names for each platform.'
      : ''
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
// asked -- no package yet, a CLI that does not answer it, or one that does not
// answer inside the timeout, which is there so an unanswerable question cannot
// hang the tool. `chromiumInstalled` reads a null plan as NOT installed.
function chromiumPlan() {
  try {
    const report = execFileSync(process.execPath, [PLAYWRIGHT_CLI, 'install', 'chromium', '--dry-run'], {
      cwd: TOOL_DIR,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 120000
    });
    const locations = [...report.matchAll(/^\s*Install location:\s*(\S.*)$/gm)].map((m) => m[1].trim());
    return locations.length ? locations : null;
  } catch {
    return null;
  }
}

// EVERY artifact, and PLAYWRIGHT'S OWN CRITERION for each one.
//
// `install chromium` fetches three artifacts -- Chrome for Testing, FFmpeg and
// Chrome Headless Shell -- one after another, and a default headless launch
// uses the headless shell rather than Chrome. Round 6 found this probe asking
// `chromium.executablePath()` alone, so a download that died after the first
// artifact left it satisfied for good. Round 7 found ITS REPLACEMENT asking
// `existsSync(location)`, one layer further in and wrong for the same reason:
// `Install location:` names a DIRECTORY, and Playwright removes and recreates
// that directory before it extracts into it. Three EMPTY directories satisfied
// that probe, and --install could not repair them either.
//
// The criterion is the marker file Playwright writes INSIDE the directory once
// the extract has finished, and it is Playwright's own rather than one invented
// here: in playwright-core, `downloadBrowserWithProgressBar` returns early for
// an artifact if and only if `INSTALLATION_COMPLETE` is present in its
// directory, downloads otherwise, and reads that same file's absence afterwards
// as the download having failed. Matching the installer exactly is the whole of
// why --install can repair the state: a probe STRICTER than the installer asks
// for a repair the installer then declines to make, and a probe LOOSER than the
// installer never asks for one at all. This build has now shipped the loose
// form twice.
//
// A null plan is NOT installed, and there is no second route to an answer. The
// fallback that stood here -- `chromium.executablePath()` whenever the plan
// could not be read -- silently restored the round-6 defect: one artifact of
// three, taken whenever the CLI was missing, exited non-zero, or printed a
// label this parser does not know. Not being able to ask a question is not an
// answer to it, and answering it wrongly in silence is worse than failing where
// the installer can name its own reason.
function chromiumInstalled() {
  const planned = chromiumPlan();
  if (!planned) return false;
  return planned.every((location) => existsSync(join(location, 'INSTALLATION_COMPLETE')));
}

if (!chromiumInstalled()) {
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
  if (!chromiumInstalled()) {
    fail(`Error: the Chromium install reported success but the browser is still incomplete. "install chromium" fetches several artifacts in sequence and this run left at least one of them without the INSTALLATION_COMPLETE marker Playwright writes once an artifact has finished extracting. Run "node ${PLAYWRIGHT_CLI} install chromium --dry-run" to see what it expects and where, then "node ${PLAYWRIGHT_CLI} install chromium" by hand to see Playwright's own message.`);
  }
}

// Shared browser runtime: dynamic import only on the command that needs Chromium.
// Never a top-level static import — help must work on a never-installed copy.
const runtime = await import('./lib/browser-runtime.js');
const browserSurvey = await runtime.check();
if (browserSurvey.chromiumLaunch !== true) {
  fail(
    `Error: Chromium cannot launch; check: ${BROWSER_CHECK}. ${browserSurvey.remediation || 'chromiumLaunch:false'}. See the Dependencies section of TOOL.md.`
  );
}

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
  await page.waitForTimeout(FONT_SETTLE_MS);

  await page.screenshot({
    path: outputPath,
    type: 'png',
    clip: { x: 0, y: 0, width: output.width, height: output.height }
  });
} catch (error) {
  // Playwright's own message is withheld: it can quote the markup it was given.
  // Only the error's class name is read, and that carries none of the markup.
  failure = error?.name === 'TimeoutError'
    ? `Error: ${filePath} did not finish loading within ${timeoutMs} ms. Everything the SVG references is fetched before the screenshot: confirm each remote font or image it names is reachable, embed them in the file, or raise --timeout.`
    : `Error: could not render ${filePath} at ${output.width}x${output.height}. See Troubleshooting in TOOL.md; an unreachable reference inside the SVG and an output size past what the browser will allocate are the two usual causes.`;
}

// Closed before reporting either way, so no failure path leaves a browser running.
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
