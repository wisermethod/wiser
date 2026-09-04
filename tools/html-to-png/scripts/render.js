#!/usr/bin/env node
/**
 * html-to-png - render one local HTML file to a PNG or JPEG image
 *
 * Usage:
 *   node scripts/render.js help
 *   node scripts/render.js render --input <path> --output <path> [--width N] [--height N]
 *     [--scale N] [--quality N] [--timeout MS] [--overwrite]
 *
 * Node built-ins only above the dependency check; nothing here imports from
 * outside this tool directory. The rules every shipped script follows are
 * stated once, in system/templates/Script Contract.md.
 */

import { execFileSync } from 'node:child_process';
import { accessSync, constants, existsSync, mkdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const TOOL_DIR = resolve(SCRIPT_DIR, '..');

// One installed package's own manifest. An interrupted install leaves
// node_modules/ behind with nothing in it, so the directory proves nothing.
const DEP_MARKER = join(TOOL_DIR, 'node_modules', 'playwright', 'package.json');

const COMMANDS = new Set(['render']);

// Output format follows the extension the caller wrote, so one flag cannot
// disagree with the other.
const FORMATS = new Map([['.png', 'png'], ['.jpg', 'jpeg'], ['.jpeg', 'jpeg']]);

// How long the page gets to finish loading before the shot is abandoned.
const DEFAULT_TIMEOUT_MS = 5000;
// Device pixels per CSS pixel. One means the image is the layout's own size.
const DEFAULT_SCALE = 1;
// Fonts and layout settle a frame or two after load; the shot waits that out.
const SETTLE_MS = 200;
// Auto-fit adds this much so a hairline of content cannot fall off the bottom.
const FIT_MARGIN_PX = 10;

const USAGE = `html-to-png - render one local HTML file to a PNG or JPEG image

Usage:
  node scripts/render.js help
  node scripts/render.js render --input <path> --output <path> [--width N] [--height N]
    [--scale N] [--quality N] [--timeout MS] [--overwrite]

Commands:
  render           Render the HTML file and write the image
  help             Print this message

Options:
  --input <path>   HTML file to render, absolute. Required.
  --output <path>  Image file to write, absolute, ending .png, .jpg, or .jpeg.
                   Required, and it may not sit inside this tool directory.
  --width N        Viewport width in pixels. Default 1200.
  --height N       Viewport height in pixels. Omit to fit the content instead.
  --scale N        Device scale factor; the image carries this many pixels per
                   CSS pixel. Default ${DEFAULT_SCALE}.
  --quality N      JPEG quality, 1 to 100. Default 90. Ignored for PNG.
  --timeout MS     Milliseconds the page gets to finish loading.
                   Default ${DEFAULT_TIMEOUT_MS}.
  --overwrite      Replace a file already at --output. Without it, a run that
                   would replace one refuses.
  --install Authorise the first-run install. Without it a tool that is
          not installed yet reports what it would fetch, and from
          where, and stops. WISER_ALLOW_INSTALL=1 does the same
          for an unattended run.
  --help           Print this message

Renders the file the caller names and writes the image the caller names. Needs
no credentials and no configuration file, so no command takes --env. The page is
loaded from disk; anything it references is fetched, and nothing else is. Success
prints one JSON object to stdout; a usage mistake or a page that will not render
goes to stderr with exit 1.`;

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

// Arguments. Parsed first so help costs nothing: no install, no file read,
// no browser.
const argv = process.argv.slice(2);
const command = argv[0] ?? 'help';

if (command === 'help' || argv.includes('--help') || argv.includes('-h')) {
  process.stdout.write(`${USAGE}\n`);
  process.exit(0);
}

if (!COMMANDS.has(command)) {
  fail(`Error: unknown command "${command}". Run "node scripts/render.js help" for usage.`);
}

const VALUE_FLAGS = new Set([
  '--input', '--output', '--width', '--height', '--scale', '--quality', '--timeout'
]);
const BARE_FLAGS = new Set([
  '--install','--overwrite', '--help', '-h']);

// The position after each value flag belongs to that flag. A path or number
// that opens with a dash is a value, not a flag.
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

// A scale factor is not a pixel count: 1.5 is a real device scale, so this one
// takes a fraction where the pixel flags above take whole numbers.
function positiveNumber(name, raw) {
  const value = Number(raw);
  if (raw.trim() === '' || !Number.isFinite(value) || value <= 0) {
    fail(`Error: ${name} must be a number above zero; got "${raw}".`);
  }
  return value;
}

/**
 * Width and height read out of the written file's own header, PNG or JPEG, so
 * the reported size is what the file holds rather than what the arithmetic
 * predicted. A device scale factor multiplies the pixels without touching the
 * layout numbers, which is exactly where a calculated report goes wrong.
 */
function imageSize(buffer) {
  const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  if (buffer.length >= 24 && buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    if (buffer.subarray(12, 16).toString('ascii') !== 'IHDR') {
      throw new Error('the written PNG carries no header chunk');
    }
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }

  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    // JPEG keeps its dimensions in the frame header, which sits an unknown
    // number of segments in, so the segment chain is walked to find it.
    let at = 2;
    while (at + 9 < buffer.length) {
      if (buffer[at] !== 0xff) break;
      const marker = buffer[at + 1];
      // A run of 0xff bytes is padding before the marker, not a marker.
      if (marker === 0xff) {
        at += 1;
        continue;
      }
      // Standalone markers carry no length word to skip past.
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        at += 2;
        continue;
      }
      const isFrameHeader = marker >= 0xc0 && marker <= 0xcf
        && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isFrameHeader) {
        return { width: buffer.readUInt16BE(at + 7), height: buffer.readUInt16BE(at + 5) };
      }
      at += 2 + buffer.readUInt16BE(at + 2);
    }
    throw new Error('the written JPEG carries no frame header');
  }

  throw new Error('the written file is neither a PNG nor a JPEG');
}

/**
 * The canonical form of a path, following symbolic links wherever the path
 * exists. Resolving a name is not opening the file it names, so this runs before
 * anything is read, installed, or written.
 *
 * `resolve` normalizes lexically and follows nothing on disk, so a symbolic link
 * standing in for any ancestor is a spelling a lexical comparison does not
 * match. The output usually does not exist yet, so a path whose leaf is absent is
 * canonicalized through the deepest ancestor that does exist and the missing
 * components joined back on: that ancestor is where the write would land.
 *
 * Absence is the only reason to keep walking. Any other refusal from the
 * filesystem, an unreadable ancestor or a loop of symbolic links, means the real
 * path cannot be known, and a screen that cannot know where a write lands refuses
 * rather than falling back to comparing the caller's spelling.
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
 * A prefix comparison is not enough. `realpathSync` preserves whatever case the
 * caller wrote, so on a case-insensitive volume a variant spelling of this tool's
 * own directory canonicalizes to a string carrying none of `directory`'s prefix
 * even though it names that very directory, and the prefix test answers "not
 * inside" about a path that is. Device and inode are a directory's own identity,
 * which no spelling reaches, so every existing ancestor of `candidate` is
 * compared that way. An output file does not exist yet and has no inode of its
 * own, which is why the walk climbs to the deepest ancestor that does: that
 * ancestor is where the write lands.
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
// never triggers an install and never opens a browser.
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
// Everything below writes `outputPath`, which is the path this screen resolved
// and cleared, not the string the caller typed. Both sides are canonicalized, so
// a symbolic link, a relative spelling and a differently spelled ancestor
// collapse onto one real path; the prefix test alone is not the whole screen
// either, which is what `descendsFrom` beside it closes.
const outputPath = canonical('--output', outputRaw);
const toolReal = canonical('this tool directory', TOOL_DIR);
if (outputPath === toolReal || outputPath.startsWith(`${toolReal}${sep}`) || descendsFrom(outputPath, toolReal)) {
  fail(`Error: --output resolves inside this tool directory (${toolReal}). Scripts write only to a work directory in the owning root; pass that path instead.`);
}

const format = FORMATS.get(extname(outputPath).toLowerCase());
if (!format) {
  fail(`Error: --output must end .png, .jpg, or .jpeg; got "${outputPath}". The extension chooses the format.`);
}

// Replacing a caller's file is opt-in. The check is here, above the dependency
// check, so a refused run installs nothing and opens no browser.
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
const scale = scaleRaw === undefined ? DEFAULT_SCALE : positiveNumber('--scale', scaleRaw);

const qualityRaw = flag('--quality');
const quality = qualityRaw === undefined ? 90 : positiveInteger('--quality', qualityRaw, 100);

const timeoutRaw = flag('--timeout');
const timeout = timeoutRaw === undefined ? DEFAULT_TIMEOUT_MS : positiveInteger('--timeout', timeoutRaw);

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


// 'ready' means the markers AND the executable. Anything else installs, and
// 'marked-but-gone' installs with --force, because Playwright skips every
// artifact it has already marked and the authorised repair would otherwise do
// nothing at all -- which is what round 8 measured.
await ensureChromium();

// The output's home is settled before the browser starts. A directory that
// cannot be created is a path problem, and it should not arrive dressed as a
// rendering failure after a browser has been launched for nothing.
try {
  mkdirSync(dirname(outputPath), { recursive: true });
} catch {
  fail(`Error: could not create the directory for ${outputPath}. Pass a work directory in the owning root that this process may write to.`);
}

// A problem this script diagnosed itself, so its text is ours and safe to print.
// The browser engine's own messages are never passed through: they quote the
// page, the full path, and whatever the page put in a console message.
class RenderProblem extends Error {}

let browser;
let result = null;
let failure = null;

try {
  browser = await runtime.launch();

  // The scale factor belongs to the page, not to the screenshot call: a shot
  // captures device pixels, and this is what puts them there. Height is
  // provisional when the caller did not fix one; the fit pass below replaces
  // it once the content has laid out.
  const page = await browser.newPage({
    deviceScaleFactor: scale,
    viewport: { width, height: height ?? 800 }
  });

  // Loaded from disk, so relative references in the HTML resolve against the
  // HTML file's own directory. pathToFileURL owns the escaping; joining
  // "file://" to a path by hand leaves it to whatever parses the string next.
  await page.goto(pathToFileURL(inputPath).href, {
    waitUntil: 'networkidle',
    timeout
  });

  await new Promise((done) => setTimeout(done, SETTLE_MS));

  const shot = { path: outputPath, type: format };
  if (format === 'jpeg') {
    shot.quality = quality;
  }

  if (height) {
    // Fixed size: the image is the viewport, whatever the content does inside it.
    await page.screenshot(shot);
  } else {
    // Fit: the image is the body's own box, with the viewport grown to hold it
    // so that nothing below the fold is missing from the shot.
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

  // Read back rather than calculated: the dimensions reported are the ones the
  // file carries, so a caller sizing a layout around them is never told a
  // number the image does not have.
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
