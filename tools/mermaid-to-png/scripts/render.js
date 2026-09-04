#!/usr/bin/env node
/**
 * mermaid-to-png - Render a Mermaid diagram file to a PNG.
 *
 * Usage:
 *   node scripts/render.js help
 *   node scripts/render.js render --file <absolute path> --output <absolute path> [options]
 *
 * The rules this file follows are stated once, in
 * system/templates/Script Contract.md.
 */

// Node built-ins only. Nothing here may import from outside this tool directory.
import { execFileSync } from 'node:child_process';
import { accessSync, constants, existsSync, mkdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULTS,
  THEMES,
  UsageError,
  buildShell,
  fitDiagram,
  parseErrorLine,
  pngSize,
  readOptions,
  viewportWidth
} from './render-core.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const TOOL_DIR = resolve(SCRIPT_DIR, '..');

// EVERY declared package's own manifest, not one of them. An interrupted
// install leaves node_modules/ behind with nothing in it, so the directory
// proves nothing -- and this tool declares TWO packages, so one manifest proves
// only half of it. Round 7: the marker was `playwright` alone, so a run with
// `playwright` present and `mermaid` absent skipped the package install and
// went on to ask for the BROWSER, whose consent message opens "this tool's
// packages are installed". Its three single-package siblings check all of
// theirs by checking one; this is the same rule, applied to two.
const DEP_MARKERS = [
  join(TOOL_DIR, 'node_modules', 'playwright', 'package.json'),
  join(TOOL_DIR, 'node_modules', 'mermaid', 'package.json')
];
const MERMAID_SCRIPT = join(TOOL_DIR, 'node_modules', 'mermaid', 'dist', 'mermaid.min.js');

const BROWSER_CHECK = 'npm run check:chromium';

const COMMANDS = new Set(['render']);

const USAGE = `mermaid-to-png - Render a Mermaid diagram file to a PNG.

Usage:
  node scripts/render.js help
  node scripts/render.js render --file <absolute path> --output <absolute path> [options]

Commands:
  render           Render the diagram and write the PNG
  help             Print this message

Options:
  --file <path>    The Mermaid diagram to render, absolute. Required.
  --output <path>  Where to write the PNG, absolute, ending in .png. Required;
                   there is no default location. Must sit outside this tool
                   directory.
  --width N        Maximum diagram width in CSS pixels (default: ${DEFAULTS.width})
  --scale N        Device scale factor; the PNG is this many pixels per CSS
                   pixel (default: ${DEFAULTS.scale})
  --theme NAME     ${THEMES.join(', ')} (default: ${DEFAULTS.theme})
  --background C   Background color, or transparent for none
                   (default: ${DEFAULTS.background})
  --timeout MS     How long the diagram has to render before the run gives up
                   (default: ${DEFAULTS.timeout})
  --overwrite      Replace a file already at --output. Without it, an occupied
                   path is refused.
  --install Authorise the first-run install. Without it a tool that is
          not installed yet reports what it would fetch, and from
          where, and stops. WISER_ALLOW_INSTALL=1 does the same
          for an unattended run.
  --help           Print this message

Success prints one JSON object to stdout. Errors go to stderr with exit 1.`;

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

// Arguments. Parsed first so help costs nothing: no install, no browser.
const argv = process.argv.slice(2);
const command = argv[0] ?? 'help';

if (command === 'help' || argv.includes('--help') || argv.includes('-h')) {
  process.stdout.write(`${USAGE}\n`);
  process.exit(0);
}

if (!COMMANDS.has(command)) {
  fail(`Error: unknown command "${command}". Run "node scripts/render.js help" for usage.`);
}

/**
 * The canonical form of a path, following symbolic links wherever the path
 * exists. Resolving a name is not opening the file it names, so this runs before
 * anything is read, installed, or written.
 *
 * `readOutputPath` normalizes lexically and follows nothing on disk, so a
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
 * `readOutputPath` compares names, and a name is not enough here. `realpathSync`
 * preserves whatever case the caller wrote, so on a case-insensitive volume a
 * variant spelling of this tool's own directory canonicalizes to a string
 * carrying none of `directory`'s prefix even though it names that very
 * directory, and the name test alone lets the render through. Device and inode
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

let options;

try {
  options = readOptions(argv.slice(1), TOOL_DIR);
} catch (error) {
  if (error instanceof UsageError) {
    fail(`Error: ${error.message}. Run "node scripts/render.js help" for usage.`);
  }
  throw error;
}

// The screen's decision has to be made about the path the write will use, so the
// lexically cleared value is canonicalized and the containment rule is put to it
// again: a symbolic link, a relative spelling and a differently spelled ancestor
// all collapse onto one real path here. The name test alone is not the whole
// screen either, which is what `descendsFrom` beside it closes. `options` carries
// the canonical value from here on, so the overwrite check, `mkdirSync`, the
// screenshot and the size read all use the path that was cleared.
options.outputPath = canonical('--output', options.outputPath);
const toolReal = canonical('this tool directory', TOOL_DIR);
if (
  options.outputPath === toolReal ||
  options.outputPath.startsWith(`${toolReal}${sep}`) ||
  descendsFrom(options.outputPath, toolReal)
) {
  fail(`Error: --output resolves inside this tool directory (${toolReal}). Scripts write only to a work directory in the owning root; pass that path instead. Run "node scripts/render.js help" for usage.`);
}

// The input, read before anything is installed: a path mistake should cost
// nothing and a first-run install is not nothing.
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

// Replacing a file is opted into, never assumed. The check sits here, beside
// the input's, so a refusal costs nothing: no install, no browser, and no
// render whose only result would have been thrown away.
if (!options.overwrite && existsSync(options.outputPath)) {
  fail(`Error: ${options.outputPath} already exists. Pass --overwrite to replace it, or name a path nothing holds yet.`);
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
const WILL_FETCH_BROWSER = command === 'render';

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

// Dependencies. Runs before any package import; keep it at the top of every entry script.
if (!DEP_MARKERS.every((m) => existsSync(m))) {
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
  const stillMissing = DEP_MARKERS.filter((m) => !existsSync(m));
  if (stillMissing.length) {
    fail(`Error: npm ci finished but ${stillMissing.join(' and ')} is still missing. Check that package.json lists every package this script imports.`);
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

  // THE PROCESS STARTED AND THEN ENDED, AND NOTHING HERE CAN SAY WHY.
  //
  // Round 12 measured a forced repair on exactly this signature deleting a
  // COMPLETE, WORKING browser -- a real 356MB Chrome for Testing, removed by
  // the command the documentation gives first -- because a machine that kills
  // Chromium and a damaged build produce the same sentence. Three reviewers
  // reproduced it. So this branch does not replace anything. It says what is
  // ambiguous and names the one scoped command that repairs it, for a reader
  // who has ruled the machine out. Making someone type one command is a much
  // smaller cost than destroying a browser they did not break.
  if (browserSurvey.failure === 'crashed') {
    const crashedForce = runtime.forceInstallArgs(LAUNCH_OPTIONS).join(' ');
    fail(`Error: Chromium started and then stopped before it was ready, and this message cannot say whether the cause was this machine -- no display for a window, a security tool, an out-of-memory kill -- or a damaged browser build. ${browserSurvey.remediation || 'The trial launch reported no reason.'} Nothing has been replaced: replacing the build deletes the copy you already have, which is the wrong move when the machine is the cause. If you have ruled the machine out, replace just this build with: node ${PLAYWRIGHT_CLI} ${crashedForce}`);
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
    // SCOPED TO THE LAUNCH THAT FAILED, and that scoping is the whole point.
    //
    // `install chromium --force` removes ALL THREE artifacts before it
    // refetches. Round 11 measured the cost on a healthy machine: repairing a
    // corrupted headless shell deleted a COMPLETE 356MB Chrome for Testing,
    // failed to refetch it, and aborted before it reached the shell it was
    // sent to fix -- the artifact that worked was gone, the broken one was
    // untouched, and with no PLAYWRIGHT_BROWSERS_PATH set that is the
    // machine's SHARED cache, so every other browser tool broke too. Three
    // reviewers reproduced it independently. The gate above ("the plain
    // install exited 0") does not help, because exit 0 means every marker was
    // present, which is exactly when --force has the most to delete.
    //
    // So the forced replacement names the one target this tool's launch needs.
    const forceArgs = runtime.forceInstallArgs(LAUNCH_OPTIONS);
    process.stderr.write('Replacing the Chromium build this tool drives: the install had nothing to fetch and it still will not launch.\n');
    try {
      execFileSync(process.execPath, [PLAYWRIGHT_CLI, ...forceArgs], {
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


// There are no marker states here any more. The tool tries the launch it is
// about to make; what happens next depends on WHY that launch failed, and a
// forced replacement is scoped to the artifact that failed. This comment
// described 'ready' and 'marked-but-gone' states that round 10 deleted, in
// four of the six entry scripts but not the other two -- so the six had
// drifted from each other while the registers were correct. Round 11 found it.
await ensureChromium();

// Shared browser runtime: dynamic import only on the command that needs Chromium.
// Never a top-level static import — help must work on a never-installed copy.
// The survey the gate above already took, rather than a second trial launch of
// the same browser: `chromiumLaunches()` keeps it. Only a command that skipped
// the gate -- `check` without `--install`, which surveys and installs nothing --
// arrives here without one, and that command is exactly the one whose job is to
// take it.
if (browserSurvey === null) await chromiumLaunches();
if (browserSurvey.chromiumLaunch !== true) {
  fail(
    `Error: Chromium cannot launch; check: ${BROWSER_CHECK}. ${browserSurvey.remediation || 'chromiumLaunch:false'}. See the Dependencies section of TOOL.md.`
  );
}

// The output's home is settled before the browser starts: a directory that
// cannot be created is a path problem, and it should not arrive dressed as a
// rendering failure after a browser has been launched for nothing.
try {
  mkdirSync(dirname(options.outputPath), { recursive: true });
} catch {
  fail(`Error: could not create the directory for ${options.outputPath}. Pass a work directory in the owning root that this process may write to.`);
}

async function render() {
  const browser = await runtime.launch();

  try {
    const page = await browser.newPage({
      // The scale factor belongs to the page, not to the screenshot: a
      // screenshot captures device pixels, so this is what puts them there.
      deviceScaleFactor: options.scale,
      viewport: { width: viewportWidth(options.width), height: 800 }
    });

    await page.setContent(buildShell(options));

    // The diagram crosses as text through the DOM, never as markup: a caller's
    // file cannot close an element or open a script this way.
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
        // The message stays in the page; only its shape crosses back out.
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

    // The render budget, named so a caller who runs out of it knows which
    // number to raise rather than reading it as a broken diagram.
    try {
      await page.waitForSelector('.mermaid svg', { timeout: options.timeout });
    } catch {
      throw new UsageError(`the diagram parsed but did not finish rendering within ${options.timeout} ms. Raise --timeout for a very large diagram; if a Mermaid preview draws it at once, re-run the Dependencies check`);
    }

    // Fonts and the final layout pass settle after the SVG appears, so the
    // measurement below has to wait for them.
    await page.waitForTimeout(500);

    const fitted = await page.evaluate(fitDiagram, options.width);

    if (!fitted) {
      throw new Error('the rendered diagram reported no size to capture');
    }

    const element = await page.$('#container');

    if (!element) {
      throw new Error('the rendered diagram left no element to capture');
    }

    // Capture and write are one call, so the write is given its own report:
    // by this point the diagram has rendered, and what is left to go wrong is
    // the caller's path.
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
  // The engine's own message can name cache paths and machine details, so the
  // failure is reported as this tool's, naming the stage that failed.
  fail(`Error: rendering ${options.inputPath} failed in the browser. Confirm the diagram renders in a Mermaid preview, then re-run; if it does, the browser install is the next thing to check with: ${BROWSER_CHECK}`);
}

// Read back rather than calculated: the dimensions reported are the ones the
// file carries, so a caller sizing a layout around them is never told a number
// the PNG does not have.
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
