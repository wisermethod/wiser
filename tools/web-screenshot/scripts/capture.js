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

// Whether THIS run has already answered the consent question. Declared with the
// other constants, above every reader: placed next to its first use it sat
// BELOW `WILL_FETCH_BROWSER`, which reads it, and a `const` is not hoisted -- so
// every `check` run died in the temporal dead zone. That is the third time in
// one session that a restructure put a binding under its own caller, and it is
// why new constants go here.
const INSTALL_AUTHORISED = process.argv.includes('--install') || process.env.WISER_ALLOW_INSTALL === '1';

const COMMANDS = new Set(['capture', 'check']);

const USAGE = `web-screenshot - capture a PNG of a live web page

Usage:
  node scripts/capture.js help
  node scripts/capture.js check
  node scripts/capture.js capture --url <address> --output <path>.png
    [--width 1280] [--height 720] [--scale 1] [--timeout 30000] [--full-page] [--overwrite]

Commands:
  capture          Load the page and write a PNG of it
  check            Report whether the Chromium build this tool renders with is present.
                   Installs nothing and opens no connection; with --install it
                   installs first and then reports on what it installed
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
// Whether THIS RUN will ask for a browser, which is what the consent report has
// to describe. A tool that CAN drive a browser is not the same as a run that
// WILL: `deck-export scaffold` and `web-screenshot check` are both commands of
// browser tools that fetch none.
const WILL_FETCH_BROWSER = command !== 'check' || INSTALL_AUTHORISED;

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
    // KEYED ON THIS RUN, not on the tool. Round 8 found this promising a browser
    // download on `deck-export scaffold --install`, which makes none; round 9
    // found the hedge that replaced it naming "a survey" as an example of a
    // command that fetches no browser, which `check --install` had just
    // falsified in the same commit. `WILL_FETCH_BROWSER` is set by each entry
    // script from the command it is actually running, so the report describes
    // this run rather than the tool's general capabilities.
    size: browser && WILL_FETCH_BROWSER
      ? ' This run then fetches the Chromium build, several hundred megabytes, from cdn.playwright.dev, or from playwright.download.prss.microsoft.com when Playwright falls back. That build does NOT land here: it goes wherever Playwright keeps browser builds on this machine, which tools/AGENTS.md names for each platform.'
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

// THE ONLY QUESTION THAT MATTERS, ASKED THE ONLY WAY THAT ANSWERS IT.
//
// FOUR gate rounds found this file re-implementing Playwright's own idea of a
// finished install, and getting it wrong one layer deeper each time:
//
//   round 6  one artifact of three, via `chromium.executablePath()`
//   round 7  the artifact DIRECTORY, which Playwright creates before extracting
//   round 8  the INSTALLATION_COMPLETE marker, with the files since removed
//   round 9  the marker AND an executable -- Chrome for Testing, while a default
//            headless launch runs Chrome Headless Shell, a different artifact
//
// Every one of those findings is the same sentence: THE PROBE SAID INSTALLED
// AND THE LAUNCH FAILED. A fifth patch would find a fifth layer, because the
// completeness of a Playwright install is Playwright's business and this file
// kept trying to hold it.
//
// So the probe IS the launch. There is no artifact list here, no marker, no
// executable path, and no state to enumerate -- which is also why no check
// written against this can be fitted to a state somebody imagined, and two
// consecutive rounds found exactly that fitting in the checks that replaced the
// probes above. Measured: a trial launch through the shared runtime costs 0.31s
// with the browser present and 0.19s without it, against 0.20s for the
// `--dry-run` subprocess this replaces, and the survey it returns is the one
// the tool needed anyway.
// This tool renders headless, which is Playwright's default and runs Chrome
// Headless Shell. Stated rather than left implicit, because the trial launch
// must be the launch the work makes.
const LAUNCH_OPTIONS = { headless: true };

let runtime = null;
let browserSurvey = null;
async function chromiumLaunches() {
  // The dynamic import stays inside the function, never at the top of the file:
  // `help` must answer on a copy that has never been installed. The module is
  // kept because the work below launches through the same runtime that just
  // proved it can launch, rather than importing a second copy of it.
  //
  // LAUNCH_OPTIONS is what THIS tool is about to launch with. Round 10: this
  // trialled a default headless launch in every tool, which runs Chrome
  // Headless Shell, while `Browser Control` launches headful and runs Chrome
  // for Testing -- so a hollowed-out Chrome left the trial green and the tool
  // broken. A capability probe must probe the capability the caller will use.
  //
  // Nothing here throws. The import and the survey are both inside the try, and
  // a throw becomes a host failure with the reason in the remediation, because
  // round 10 measured a partial package install reaching the caller as seven
  // frames of Node internals with no cause and no next step.
  try {
    if (runtime === null) runtime = await import('./lib/browser-runtime.js');
    browserSurvey = await runtime.check(LAUNCH_OPTIONS);
  } catch (error) {
    const line = error && error.message ? String(error.message).split('\n')[0].trim() : 'the browser runtime could not be loaded';
    browserSurvey = {
      chromiumLaunch: false,
      failure: 'host',
      remediation: `dependency: the browser runtime in this tool; check: importing scripts/lib/browser-runtime.js. Next: ${line}`
    };
  }
  return browserSurvey.chromiumLaunch === true;
}

// WHERE PLAYWRIGHT WOULD PUT A BUILD, asked ONLY to tell one failure from
// another after an install has already failed. It decides nothing: an
// unwritable browsers root and a blocked network need different fixes, and the
// Script Contract's Output and errors clause requires telling them apart.
// Nothing above this line reads it, and nothing may: a completeness decision
// taken from a path is the defect this whole block exists to end.
function installDestinationForDiagnosis() {
  try {
    const report = execFileSync(process.execPath, [PLAYWRIGHT_CLI, 'install', 'chromium', '--dry-run'], {
      cwd: TOOL_DIR,
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
  if (await chromiumLaunches()) return;

  // WHAT KIND OF FAILURE. Round 10 found this treating every false the same and
  // answering all of them with an install and then a forced reinstall. A host
  // that lacks an OS library or a compiler, cannot write the shim directory, is
  // denied a temporary directory, or blocks the launch by policy is not a
  // browser that needs replacing: the install changes nothing, and the forced
  // reinstall then DELETES a complete artifact and leaves the caller worse off
  // than before, with a final error blaming the network for a state its own
  // deletion produced. All three reviewers measured that. So an install happens
  // only when the survey positively says the browser bytes are the problem.
  // A HOST failure is refused outright: installing the browser again cannot fix
  // a machine that cannot run the one it has, and the forced reinstall below
  // would delete a complete artifact on the way to not fixing it.
  //
  // An UNKNOWN failure is not refused, and is not forced either. A plain
  // install is non-destructive -- Playwright skips every artifact whose marker
  // is present and only replaces one it is actually downloading -- so it is
  // safe to attempt on a failure this script cannot name, and refusing there
  // would leave a repairable state uncompletable, which is the template's own
  // non-waivable class. Only a positively identified artifact failure earns the
  // escalation.
  if (browserSurvey.failure === 'host') {
    fail(`Error: Chromium cannot launch, and the reason is this machine rather than the browser build, so installing it again would not fix it. ${browserSurvey.remediation || 'The trial launch reported no reason.'} See the Dependencies section of TOOL.md.`);
  }

  requireInstallConsent('browser');

  // A PLAIN INSTALL FIRST, and --force ONLY IF THAT ONE SUCCEEDED. Round 9
  // measured, and round 10 measured again on three different states, that a
  // FAILED --force deletes a complete artifact directory: Playwright removes a
  // directory it could not re-download. So the escalation is gated on the plain
  // install having exited 0 -- which is the state where it had nothing to fetch
  // because every artifact was already marked, and a forced refetch is the only
  // remaining repair. A plain install that FAILED is precisely the state where
  // forcing destroys and cannot repair, and it no longer escalates there.
  process.stderr.write('Installing the Chromium build this tool drives.\n');
  let plainInstallSucceeded = true;
  try {
    // Playwright's own installer, run from this tool's own copy rather than a
    // global one, so the version matches the package the lockfile pinned.
    execFileSync(process.execPath, [PLAYWRIGHT_CLI, 'install', 'chromium'], {
      cwd: TOOL_DIR,
      stdio: ['ignore', 'ignore', 'inherit']
    });
  } catch {
    plainInstallSucceeded = false;
  }
  if (await chromiumLaunches()) return;

  if (plainInstallSucceeded && browserSurvey.failure === 'artifact') {
    process.stderr.write('Replacing the Chromium build this tool drives: the install had nothing to fetch and it still will not launch.\n');
    try {
      execFileSync(process.execPath, [PLAYWRIGHT_CLI, 'install', 'chromium', '--force'], {
        cwd: TOOL_DIR,
        stdio: ['ignore', 'ignore', 'inherit']
      });
    } catch {
      // Not a verdict; the launch below is.
    }
    if (await chromiumLaunches()) return;
  }

  // Two failures arrive here and they have different fixes, which is the same
  // Script Contract clause the npm block answers a few lines up. A browser
  // directory the caller cannot write is not a blocked network, and Playwright
  // prints nothing at all when the permission error throws before its first
  // request -- so naming the network there leaves the caller with no true text
  // and a remedy that reproduces the same silence.
  const browsersRoot = installDestinationForDiagnosis();
  if (browsersRoot && !isWritable(browsersRoot)) {
    fail(`Error: the Chromium build could not be installed because ${browsersRoot} is not writable. That is where Playwright puts browser builds on this machine, and PLAYWRIGHT_BROWSERS_PATH chooses it when that variable is set. Point it at a directory you own, or make this one writable, then run the command again. tools/AGENTS.md names every path Playwright may use.`);
  }
  fail(`Error: the Chromium build still cannot launch after an authorised install. ${(browserSurvey && browserSurvey.remediation) || 'The trial launch reported no reason.'} Playwright fetches the build from https://cdn.playwright.dev, falling back to playwright.download.prss.microsoft.com, so a network that blocks those hosts stops here even though npm succeeded. Run "node ${PLAYWRIGHT_CLI} install chromium" by hand to see Playwright's own message. tools/AGENTS.md names where the build lands.`);
}

// Every command but `check` needs a browser to do its work, and asks for one
// here. `check` reports on what is there instead and installs nothing -- unless
// this run authorised an install, in which case it repairs what it is about to
// report on.
//
// Both halves are round findings and they pull in opposite directions. Round 6
// found a gate above the dispatch, so `check` REFUSED in the one state it
// exists to report, which is the state TOOL.md's troubleshooting row for a
// missing binary sends the reader to it in. Round 7 found the exemption that
// fixed that had made `check --install` a no-op for the browser: it ran npm ci,
// fetched no browser, and printed the same remediation again -- while the
// remediation names `--install` and the row names `check`. A reader who follows
// the printed remedy the obvious way got nothing, twice, and TOOL.md's Usage
// row said `check` reaches no network while it was running npm ci.
//
// So: no flag, no install and no network, exactly as the survey promises. With
// the flag, the survey installs first and then reports on what it installed.
// There is now no reading of the printed remedy that quietly does nothing.
if (command !== 'check' || INSTALL_AUTHORISED) await ensureChromium();

// Shared browser runtime: dynamic import only on commands that need Chromium.
// Never a top-level static import — help must work on a never-installed copy.
// The survey the gate above already took, rather than a second trial launch of
// the same browser: `chromiumLaunches()` keeps it. Only a command that skipped
// the gate -- `check` without `--install`, which surveys and installs nothing --
// arrives here without one, and that command is exactly the one whose job is to
// take it.
if (browserSurvey === null) await chromiumLaunches();

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
