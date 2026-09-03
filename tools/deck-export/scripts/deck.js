#!/usr/bin/env node
/**
 * deck-export - scaffold a reveal.js deck project, and render a finished deck
 * to a PDF or to one PNG per slide.
 *
 * Usage:
 *   node scripts/deck.js help
 *   node scripts/deck.js check
 *   node scripts/deck.js scaffold --output <dir> [--title <text>] [--template <path>]
 *   node scripts/deck.js pdf --input <path> --output <path>
 *   node scripts/deck.js png --input <path> --output <dir>
 *
 * Node built-ins only above the dependency check; nothing here imports from
 * outside this tool directory. The rules every shipped script follows are
 * stated once, in system/templates/Script Contract.md.
 */

import { execFileSync } from 'node:child_process';
import { accessSync, constants, cpSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const TOOL_DIR = resolve(SCRIPT_DIR, '..');
const TEMPLATES_DIR = join(TOOL_DIR, 'templates');
const REVEAL_DIR = join(TOOL_DIR, 'node_modules', 'reveal.js');

// One installed package's own manifest per package this tool imports. An
// interrupted install leaves node_modules/ behind with nothing in it, so the
// directory proves nothing.
const MARKERS = {
  playwright: join(TOOL_DIR, 'node_modules', 'playwright', 'package.json'),
  'reveal.js': join(REVEAL_DIR, 'package.json')
};

const COMMANDS = new Set(['scaffold', 'pdf', 'png', 'check']);

// How long a deck gets to load and initialize before the run is abandoned.
const DEFAULT_TIMEOUT_MS = 30000;
// Fonts, the print layout, and slide transitions settle after the page reports
// ready; each shot waits that out.
const PDF_SETTLE_MS = 2000;
const DECK_SETTLE_MS = 1000;
const SLIDE_SETTLE_MS = 500;

const RATIOS = new Map([
  ['16/9', { width: 1920, height: 1080 }],
  ['4/3', { width: 1024, height: 768 }],
  ['1/1', { width: 1024, height: 1024 }]
]);

const TRANSITIONS = new Set(['slide', 'fade', 'convex', 'concave', 'zoom', 'none']);

// The reveal.js files a self-contained deck needs beside its HTML.
const VENDOR_FILES = [
  { from: 'dist/reveal.js', to: 'reveal.js' },
  { from: 'dist/reset.css', to: 'reset.css' },
  { from: 'dist/reveal.css', to: 'reveal.css' },
  { from: 'plugin/highlight/highlight.js', to: 'highlight.js' },
  { from: 'plugin/highlight/monokai.css', to: 'monokai.css' },
  { from: 'plugin/notes/notes.js', to: 'notes.js' }
];

const USAGE = `deck-export - scaffold a reveal.js deck project, and render a finished deck to PDF or PNG

Usage:
  node scripts/deck.js help
  node scripts/deck.js check
  node scripts/deck.js scaffold --output <dir> [--title <text>] [--template <path>] [options]
  node scripts/deck.js pdf --input <deck.html> --output <file.pdf> [options]
  node scripts/deck.js png --input <deck.html> --output <dir> [options]

Commands:
  scaffold         Write a new deck project: one HTML file and one assets folder
  pdf              Render a finished deck to a single PDF
  png              Render a finished deck to one PNG per slide
  check            Report which dependencies are present; installs nothing.
                   With --install it installs first and then reports on what
                   it installed
  help             Print this message

Global options:
  --install        Authorise the first-run install. Without it a command that
                   needs a package this copy has not installed reports what it
                   would fetch, and from where, and stops. WISER_ALLOW_INSTALL=1
                   does the same for an unattended run.

Scaffold options:
  --output <dir>   Deck project directory, absolute. Required.
  --title <text>   Deck title; names the HTML file and the assets folder.
                   Default: the name of the --output directory.
  --template <path> A brand template deck to copy, absolute. With it, the
                   template and its "<name> Assets" folder are copied and
                   retitled. Without it, a starter deck is written with the
                   reveal.js runtime bundled beside it.
  --theme <name>   reveal.js theme for a starter deck. Default: white.
  --ratio <ratio>  16/9, 4/3, or 1/1 for a starter deck. Default: 16/9.
  --transition <t> slide, fade, convex, concave, zoom, or none. Default: slide.

Render options:
  --input <path>   Deck HTML file to render, absolute. Required.
  --output <path>  Where to write, absolute, and not inside this tool
                   directory. A .pdf file for pdf, a directory for png.
  --width N        Override the deck's own slide width in pixels.
  --height N       Override the deck's own slide height in pixels.
  --scale N        Pixel density for png, 1 to 4. Default 2.
  --timeout MS     How long the deck gets to load and initialize. Default ${DEFAULT_TIMEOUT_MS}.

Needs no credentials and no configuration file, so no command takes --env.
Success prints one JSON object to stdout. Errors go to stderr with exit 1.`;

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

// Progress goes to stderr; stdout carries only the final JSON object, so a
// caller can parse a run without stripping log lines.
function log(message) {
  process.stderr.write(`${message}\n`);
}

// Arguments. Parsed first so help costs nothing: no install, no file read,
// no browser.
const argv = process.argv.slice(2);
const command = argv[0] ?? 'help';

if (command === 'help' || argv.includes('--help') || argv.includes('-h')) {
  process.stdout.write(`${USAGE}\n`);
  process.exit(0);
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

if (!COMMANDS.has(command)) {
  fail(`Error: unknown command "${command}". Run "node scripts/deck.js help" for usage.`);
}

const VALUE_FLAGS = new Set([
  '--output', '--title', '--template', '--theme', '--ratio', '--transition',
  '--input', '--width', '--height', '--scale', '--timeout'
]);
const BARE_FLAGS = new Set([
  '--install','--help', '-h']);

// The position after each value flag belongs to that flag. A path or number
// that opens with a dash is a value, not a flag.
const valuePositions = new Set();
for (let index = 1; index < argv.length; index += 1) {
  if (VALUE_FLAGS.has(argv[index])) valuePositions.add(index + 1);
}

// An unrecognized flag is refused rather than ignored: a silently dropped
// option returns a deck that looks finished and is not what was asked for.
for (let index = 1; index < argv.length; index += 1) {
  const option = argv[index];
  if (valuePositions.has(index)) continue;
  if (option.startsWith('-') && !VALUE_FLAGS.has(option) && !BARE_FLAGS.has(option)) {
    fail(`Error: unknown option "${option}". Run "node scripts/deck.js help" for usage.`);
  }
}

function flag(name) {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    fail(`Error: ${name} needs a value. Run "node scripts/deck.js help" for usage.`);
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

/**
 * The canonical form of a path, following symbolic links wherever the path
 * exists. Resolving a name is not opening the file it names, so this runs
 * before anything is read, installed, or written.
 *
 * `resolve` normalizes lexically and follows nothing on disk, so a symbolic
 * link, a link in any parent component, and a relative spelling are three
 * strings a lexical comparison does not match. An output usually does not exist
 * yet, so a path whose leaf is absent is canonicalized through the deepest
 * ancestor that does exist and the missing components joined back on: a
 * symbolic link standing in for any ancestor cannot hide where the write lands.
 *
 * Absence is the only reason to keep walking. Any other refusal from the
 * filesystem, an unreadable ancestor or a loop of symbolic links, means the
 * real path cannot be known, and a screen that cannot know where a write lands
 * refuses rather than falling back to comparing the caller's spelling.
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

// Returns the canonical path, so what is opened, created, and rendered to below
// is the path that was checked rather than the spelling the caller used.
function absolutePath(name, raw) {
  if (!isAbsolute(raw)) {
    fail(`Error: ${name} must be absolute; got "${raw}". A relative path resolves against whichever directory the caller was in, which is not this tool's directory.`);
  }
  return canonical(name, raw);
}

/**
 * Refuse a path that names this tool's own directory or anything beneath it,
 * decided by identity rather than by spelling.
 *
 * `realpathSync` preserves whatever case the caller wrote, so on a
 * case-insensitive volume a variant spelling of this directory canonicalizes to
 * a string carrying none of its prefix even though it names that very
 * directory, and the name test alone let a deck project, a PDF, and a folder of
 * slide images be written into this directory. Device and inode are a
 * directory's own identity, which no spelling reaches, so every existing
 * ancestor of `path` is compared that way as well. An output that does not
 * exist yet has no inode of its own, which is why the walk climbs to the
 * deepest ancestor that does: that ancestor is where the write lands.
 */
function insideToolDirectory(target) {
  const root = canonical('this tool directory', TOOL_DIR);
  if (target === root || target.startsWith(root + sep)) return true;

  let rootId;
  try {
    rootId = statSync(root);
  } catch {
    return false;
  }

  let head = target;
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

function refuseInsideToolDir(name, path) {
  if (insideToolDirectory(path)) {
    fail(`Error: ${name} resolves inside this tool directory (${canonical('this tool directory', TOOL_DIR)}). Scripts write only to a work directory in the owning root; pass that path instead.`);
  }
}

// File and directory names must survive case-insensitive and drive-sync
// filesystems, per standards/conventions.md.
function safeName(text) {
  const cleaned = Array.from(text)
    .filter((character) => character.codePointAt(0) >= 32)
    .join('')
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .replace(/\.+$/, '')
    .trim();
  if (!cleaned) {
    fail('Error: --title leaves nothing usable as a filename once the characters a filesystem forbids are removed. Pass a title with letters or digits in it.');
  }
  return cleaned;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Chromium presence, asked of Playwright itself rather than guessed from a path
// this script builds: the location depends on the platform and on
// PLAYWRIGHT_BROWSERS_PATH, both of which Playwright already resolves.
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

/**
 * The Chromium build. `playwright` carries NO install script, so ensurePackage
 * fetches the package and no browser. Only the render commands need it, so it
 * is asked for here rather than beside the package, and under the same
 * authorisation: it is the same install, and the several hundred megabytes are
 * the part a person is actually being asked about.
 */
async function ensureChromium() {
  if (chromiumInstalled()) return;
  requireInstallConsent('browser');
  log('Installing the Chromium build this tool drives.');
  try {
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

// Dependencies. Runs before any package import, and only on a command that
// imports that package (Script Contract).
function ensurePackage(name) {
  if (existsSync(MARKERS[name])) return;
  requireInstallConsent('packages');
  log('First run: installing dependencies in this tool directory.');
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
    fail(`Error: npm ci failed in ${TOOL_DIR}. Confirm Node 18 or newer, then that package-lock.json is present and matches package.json, which is what npm ci requires and will not resolve around. Delete node_modules there and run "npm ci" by hand to see npm's own message. A lockfile that is missing or out of step with the manifest is a defect in this copy of the plugin, not something a re-run fixes. See SETUP.md.`);
  }
  if (!existsSync(MARKERS[name])) {
    fail(`Error: npm ci finished but ${MARKERS[name]} is still missing. Check that package.json lists every package this script imports.`);
  }
}

/** True when the process carries an HTTP(S) proxy for CDN-loaded decks. */
function processHasProxy() {
  const server =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    '';
  return typeof server === 'string' && server.trim() !== '';
}

/**
 * Launch failure text: prefer the shared runtime's remediation (dependency +
 * check + one step). Never pass through Playwright's root-only install-deps wall.
 */
function chromiumLaunchMessage(report, error) {
  // Prefer runtime remediation (already sanitized). Never prefer raw Playwright text.
  if (report && report.remediation) return report.remediation;
  const line = error && error.message ? String(error.message).split('\n')[0].trim() : '';
  if (/install-deps|missing dependencies to run browsers/i.test(line)) {
    return 'dependency: Chromium OS libraries; check: node scripts/deck.js check reports chromium:false. Next: provide a C compiler so userspace stubs can be built, or add the missing libraries to the base image.';
  }
  if (line) return line;
  return 'Chromium cannot launch';
}

// -- check ---------------------------------------------------------
// Reports what is present and installs nothing -- unless --install authorises
// one, in which case it repairs first and then reports. So a machine can be
// prepared before the first real run, or prepared BY this run. Chromium is
// proved by a trial launch via the shared browser-runtime (not a path on disk
// alone).

if (command === 'check') {
  // `check` installs nothing -- unless this run authorised an install, in which
  // case it repairs what it is about to report on rather than reporting a
  // failure the caller has already answered for. Round 7 found this shape in
  // web-screenshot, where `check --install` ran npm ci and fetched no browser
  // while the remediation it printed named `--install`; here it did nothing at
  // all. The same one line answers both, so the printed remedy is true on every
  // command of every browser tool rather than on all but the surveying one.
  if (process.argv.includes('--install') || process.env.WISER_ALLOW_INSTALL === '1') {
    ensurePackage('reveal.js');
    ensurePackage('playwright');
    await ensureChromium();
  }
  const result = {
    'reveal.js': existsSync(MARKERS['reveal.js']),
    playwright: existsSync(MARKERS.playwright),
    chromium: false
  };
  if (result.playwright) {
    try {
      // Dynamic import only on check: help already exited; never static-import.
      const runtime = await import('./lib/browser-runtime.js');
      const survey = await runtime.check();
      result.chromium = survey.chromiumLaunch === true;
      if (survey.remediation) result.remediation = survey.remediation;
      if (survey.hostClass) result.hostClass = survey.hostClass;
      if (survey.shimmed && survey.shimmed.length) result.shimmed = survey.shimmed;
    } catch {
      result.chromium = false;
    }
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exit(0);
}

// -- scaffold ------------------------------------------------------

if (command === 'scaffold') {
  const outputRaw = flag('--output');
  if (!outputRaw) {
    fail('Error: --output is required. This tool never picks a location: pass the absolute path of the deck project directory, in a work directory in the owning root.');
  }
  const projectDir = absolutePath('--output', outputRaw);
  refuseInsideToolDir('--output', projectDir);

  const title = flag('--title') ?? basename(projectDir);
  const deckName = safeName(title);
  const assetsName = `${deckName} Assets`;
  const deckPath = join(projectDir, `${deckName}.html`);
  const assetsPath = join(projectDir, assetsName);

  if (existsSync(deckPath)) {
    fail(`Error: a deck already exists at ${deckPath}. Scaffolding would overwrite it. Pass a different --output or --title, or move the existing deck aside.`);
  }
  if (existsSync(assetsPath)) {
    fail(`Error: an assets folder already exists at ${assetsPath}. Scaffolding would write into it. Pass a different --output or --title, or move it aside.`);
  }

  const templateRaw = flag('--template');
  let result;
  let fontsStripped = false;

  if (templateRaw) {
    // From a brand template: the template is itself a working deck, so what the
    // template shows is what the new deck gets. Copy it, then retitle.
    const templatePath = absolutePath('--template', templateRaw);
    if (!existsSync(templatePath)) {
      fail(`Error: no file at ${templatePath}. Check the path; an absolute one cannot be misread.`);
    }
    if (!statSync(templatePath).isFile()) {
      fail(`Error: ${templatePath} is not a file. Point --template at the template's HTML file, not at its directory.`);
    }

    const templateAssetsName = `${basename(templatePath, extname(templatePath))} Assets`;
    const templateAssetsPath = join(dirname(templatePath), templateAssetsName);
    if (!existsSync(templateAssetsPath) || !statSync(templateAssetsPath).isDirectory()) {
      fail(`Error: no assets folder at ${templateAssetsPath}. A brand template is an HTML file beside a folder named "<the HTML file's name> Assets" holding everything that file references.`);
    }

    mkdirSync(projectDir, { recursive: true });
    cpSync(templateAssetsPath, assetsPath, { recursive: true });

    let html = readFileSync(templatePath, 'utf8');
    html = html.replace(/\{\{TITLE\}\}/g, escapeHtml(title));
    html = html.replace(new RegExp(escapeRegExp(templateAssetsName), 'g'), assetsName);
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`);
    writeFileSync(deckPath, html);

    result = {
      deck: deckPath,
      assets: assetsPath,
      title,
      source: 'template',
      template: templatePath
    };
  } else {
    // A starter deck, with the reveal.js runtime copied in beside it so the
    // file presents with no network.

    // Ratio and transition are judged against the constants above, so they cost
    // nothing to check and are checked first: a typo here refuses on a copy that
    // has never installed anything, rather than paying for an install to be told.
    const ratio = flag('--ratio') ?? '16/9';
    if (!RATIOS.has(ratio)) {
      fail(`Error: --ratio "${ratio}" is not one of ${[...RATIOS.keys()].join(', ')}.`);
    }
    const { width, height } = RATIOS.get(ratio);

    const transition = flag('--transition') ?? 'slide';
    if (!TRANSITIONS.has(transition)) {
      fail(`Error: --transition "${transition}" is not one of ${[...TRANSITIONS].join(', ')}.`);
    }

    // The package holding the runtime is the one dependency this path needs.
    ensurePackage('reveal.js');

    const themeDir = join(REVEAL_DIR, 'dist', 'theme');
    if (!existsSync(join(REVEAL_DIR, 'dist', 'reveal.js')) || !existsSync(themeDir)) {
      fail(`Error: the reveal.js package in ${TOOL_DIR} is missing the distribution files a deck needs. Delete node_modules there and run "npm ci" by hand.`);
    }
    const themes = readdirSync(themeDir)
      .filter((file) => file.endsWith('.css'))
      .map((file) => basename(file, '.css'))
      .sort();

    // The real theme list lives in the installed package, so this one check
    // cannot precede the install; it still precedes any browser.
    const theme = flag('--theme') ?? 'white';
    if (!themes.includes(theme)) {
      fail(`Error: --theme "${theme}" is not one this reveal.js version ships. Available: ${themes.join(', ')}.`);
    }

    mkdirSync(assetsPath, { recursive: true });
    for (const { from, to } of VENDOR_FILES) {
      const source = join(REVEAL_DIR, from);
      if (!existsSync(source)) {
        fail(`Error: the reveal.js package in ${TOOL_DIR} is missing ${from}. Delete node_modules there and run "npm ci" by hand.`);
      }
      copyFileSync(source, join(assetsPath, to));
    }
    // The whole point of the bundled starter is a deck that presents with no
    // network, and eight of the fifteen themes reveal.js ships open with an
    // @import of a Google Fonts stylesheet. Copied verbatim, the "offline"
    // starter fetches a stylesheet on every load, and behind a captive portal a
    // render-blocking @import is the hang this tool's own SETUP.md warns about.
    // So the theme is copied with its remote @imports removed and the removal is
    // reported, rather than copied whole and quietly online. The theme's own
    // font-family declarations stay, so the faces fall back to the host's.
    const themeCss = readFileSync(join(themeDir, `${theme}.css`), 'utf8');
    const strippedTheme = themeCss.replace(
      /@import\s+url\(\s*['"]?https?:\/\/[^)]*\)\s*;?/gi,
      '',
    );
    fontsStripped = themeCss !== strippedTheme;
    writeFileSync(join(assetsPath, 'theme.css'), strippedTheme);

    const html = readFileSync(join(TEMPLATES_DIR, 'starter.html'), 'utf8')
      .replace(/\{\{TITLE\}\}/g, escapeHtml(title))
      .replace(/\{\{ASSETS\}\}/g, assetsName)
      .replace(/\{\{WIDTH\}\}/g, String(width))
      .replace(/\{\{HEIGHT\}\}/g, String(height))
      .replace(/\{\{TRANSITION\}\}/g, transition);
    writeFileSync(deckPath, html);

    result = {
      deck: deckPath,
      assets: assetsPath,
      title,
      source: 'starter',
      theme,
      fontsStripped,
      width,
      height,
      transition
    };
  }

  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exit(0);
}

// -- pdf and png ---------------------------------------------------

const inputRaw = flag('--input');
if (!inputRaw) {
  fail(`Error: --input is required. Pass the absolute path of the deck HTML file to render. Run "node scripts/deck.js help" for usage.`);
}
const inputPath = absolutePath('--input', inputRaw);
if (!existsSync(inputPath)) {
  fail(`Error: no file at ${inputPath}. Check the path; an absolute one cannot be misread.`);
}
if (!statSync(inputPath).isFile()) {
  fail(`Error: ${inputPath} is not a file. Point --input at the deck's HTML file, not at the directory holding it.`);
}

const outputRaw = flag('--output');
if (!outputRaw) {
  fail(`Error: --output is required. This tool never picks a location: pass ${command === 'pdf' ? 'the absolute path of the .pdf file to write' : 'the absolute path of the directory to write the slide images into'}, in a work directory in the owning root.`);
}
const outputPath = absolutePath('--output', outputRaw);
refuseInsideToolDir('--output', outputPath);

if (command === 'pdf' && extname(outputPath).toLowerCase() !== '.pdf') {
  fail(`Error: --output must end .pdf; got "${outputPath}".`);
}
if (command === 'png' && existsSync(outputPath) && !statSync(outputPath).isDirectory()) {
  fail(`Error: --output must be a directory for png; ${outputPath} is a file.`);
}

const widthRaw = flag('--width');
const heightRaw = flag('--height');
const askedWidth = widthRaw === undefined ? null : positiveInteger('--width', widthRaw);
const askedHeight = heightRaw === undefined ? null : positiveInteger('--height', heightRaw);

const scaleRaw = flag('--scale');
const scale = scaleRaw === undefined ? 2 : positiveInteger('--scale', scaleRaw, 4);

const timeoutRaw = flag('--timeout');
const timeout = timeoutRaw === undefined ? DEFAULT_TIMEOUT_MS : positiveInteger('--timeout', timeoutRaw);

ensurePackage('playwright');
await ensureChromium();

// Shared browser runtime: dynamic import only on commands that need Chromium.
// Never a top-level static import — help must work on a never-installed copy.
const runtime = await import('./lib/browser-runtime.js');
const browserSurvey = await runtime.check();
if (browserSurvey.chromiumLaunch !== true) {
  fail(
    `Error: Chromium cannot launch; check: node scripts/deck.js check. ${chromiumLaunchMessage(browserSurvey)} See the Dependencies section of TOOL.md.`
  );
}

// A problem this script diagnosed itself, so its text is ours and safe to print.
// Content/render engine messages are withheld: they quote the deck and the page
// console. Launch failures and network/navigation timeouts are environment
// failures and surface their own text so an operator can act on them.
class RenderProblem extends Error {}

const READY = 'typeof Reveal !== "undefined" && Reveal.isReady()';

function isTimeoutError(error) {
  if (!error) return false;
  if (error.name === 'TimeoutError') return true;
  const message = String(error.message || '');
  return /Timeout|timed out|timeout/i.test(message);
}

function isLaunchError(error) {
  if (!error) return false;
  const message = String(error.message || '');
  // Playwright launch failures name the binary, missing libs, or spawn failure;
  // they do not quote deck content.
  return (
    /Failed to launch|browserType\.launch|Executable doesn't exist|lib(nss|glib|dbus|atk|X11)|Target closed|Browser closed|spawn .* ENOENT/i.test(
      message
    ) || error.name === 'Error' && /launch/i.test(message)
  );
}

function engineText(error) {
  const message = error && error.message ? String(error.message).trim() : '';
  return message || 'no detail from the engine';
}

async function openDeck(context, query) {
  const page = await context.newPage();
  const href = `${pathToFileURL(inputPath).href}${query}`;
  try {
    await page.goto(href, { waitUntil: 'networkidle', timeout });
  } catch (error) {
    if (isTimeoutError(error)) {
      throw error;
    }
    // Navigation failures that are not timeouts can still name a network or
    // protocol problem without quoting deck content; surface them.
    throw error;
  }
  await waitForReveal(page);

  // The deck's own configuration is the size it was designed at. An override
  // wins; otherwise the deck decides, and 1920 by 1080 is the last resort for a
  // deck whose configuration sets a percentage rather than a pixel count.
  const config = await page.evaluate(() => {
    const { width, height } = Reveal.getConfig();
    return { width, height };
  });
  const size = {
    width: askedWidth ?? (Number.isFinite(config.width) ? config.width : 1920),
    height: askedHeight ?? (Number.isFinite(config.height) ? config.height : 1080)
  };

  const viewport = page.viewportSize();
  if (viewport.width !== size.width || viewport.height !== size.height) {
    // reveal.js lays out against the viewport it was initialized in, so a
    // resize only counts once the deck has initialized again inside it.
    await page.setViewportSize(size);
    try {
      await page.reload({ waitUntil: 'networkidle', timeout });
    } catch (error) {
      if (isTimeoutError(error)) throw error;
      throw error;
    }
    await waitForReveal(page);
  }

  return { page, size };
}

async function waitForReveal(page) {
  try {
    await page.waitForFunction(READY, null, { timeout });
  } catch (error) {
    if (isTimeoutError(error)) {
      // Re-throw so the outer classifier can surface timeout detail; the
      // RenderProblem below is the content-oriented fallback when the wait
      // failed for another reason.
      const proxyHint = processHasProxy()
        ? ' A proxy is configured for Chromium; confirm it can reach any CDN the deck loads.'
        : ' If this machine only reaches the network through a proxy, set HTTPS_PROXY or HTTP_PROXY so Chromium can fetch CDN assets.';
      const wrapped = new Error(
        `the deck did not initialize within ${timeout} ms. reveal.js never became ready: confirm ${inputPath} is a reveal.js deck, that every file it references sits beside it, and that a deck loading reveal.js from a CDN has network access.${proxyHint} Raise --timeout for a very large deck. Engine: ${engineText(error)}`
      );
      wrapped.name = 'TimeoutError';
      throw wrapped;
    }
    throw new RenderProblem(
      `the deck did not initialize within ${timeout} ms. reveal.js never became ready: confirm ${inputPath} is a reveal.js deck, that every file it references sits beside it, and that a deck loading reveal.js from a CDN has network access. Raise --timeout for a very large deck.`
    );
  }
}

async function renderPdf(browser) {
  const context = await browser.newContext({ viewport: { width: askedWidth ?? 1920, height: askedHeight ?? 1080 } });
  // The print-pdf query is what reveal.js reads to lay the deck out as pages
  // rather than as a running presentation.
  const { page, size } = await openDeck(context, '?print-pdf');
  await page.waitForTimeout(PDF_SETTLE_MS);

  const slides = await page.evaluate(() => {
    const pages = document.querySelectorAll('.pdf-page');
    return pages.length > 0 ? pages.length : Reveal.getTotalSlides();
  });

  mkdirSync(dirname(outputPath), { recursive: true });
  await page.pdf({
    path: outputPath,
    width: `${size.width}px`,
    height: `${size.height}px`,
    printBackground: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' }
  });
  await context.close();

  return { output: outputPath, format: 'pdf', width: size.width, height: size.height, slides };
}

async function renderPng(browser) {
  const context = await browser.newContext({
    viewport: { width: askedWidth ?? 1920, height: askedHeight ?? 1080 },
    deviceScaleFactor: scale
  });
  const { page, size } = await openDeck(context, '');
  await page.waitForTimeout(DECK_SETTLE_MS);

  // Every slide, vertical stacks included, in the order an audience sees them.
  const indices = await page.evaluate(() => {
    const found = [];
    document.querySelectorAll('.reveal .slides > section').forEach((horizontal, h) => {
      const vertical = horizontal.querySelectorAll('section');
      if (vertical.length > 0) {
        vertical.forEach((_, v) => found.push({ h, v }));
      } else {
        found.push({ h, v: 0 });
      }
    });
    return found;
  });

  if (indices.length === 0) {
    throw new RenderProblem(`no slides found in ${inputPath}. A reveal.js deck holds its slides as <section> elements inside a div with class "slides".`);
  }

  mkdirSync(outputPath, { recursive: true });
  const files = [];
  for (let i = 0; i < indices.length; i += 1) {
    const { h, v } = indices[i];
    await page.evaluate(([hh, vv]) => Reveal.slide(hh, vv), [h, v]);
    await page.waitForTimeout(SLIDE_SETTLE_MS);
    const file = join(outputPath, `slide-${String(i + 1).padStart(3, '0')}.png`);
    await page.screenshot({ path: file });
    files.push(file);
    log(`slide ${i + 1}/${indices.length}`);
  }
  await context.close();

  return {
    output: outputPath,
    format: 'png',
    width: size.width,
    height: size.height,
    scale,
    slides: files.length,
    files
  };
}

let browser;
let result = null;
let failure = null;

try {
  try {
    browser = await runtime.launch();
  } catch (error) {
    const report = await runtime.prepareBrowserRuntime();
    failure = `Error: Chromium cannot launch; check: node scripts/deck.js check. ${chromiumLaunchMessage(report, error)}. See the Dependencies section of TOOL.md.`;
    throw error;
  }
  result = command === 'pdf' ? await renderPdf(browser) : await renderPng(browser);
} catch (error) {
  if (failure) {
    // Launch failure already named.
  } else if (error instanceof RenderProblem) {
    failure = `Error: ${error.message}`;
  } else if (isTimeoutError(error)) {
    const detail = engineText(error);
    const proxyHint = processHasProxy()
      ? ' A proxy is configured for Chromium; confirm it can reach any CDN the deck loads.'
      : ' If this machine only reaches the network through a proxy, set HTTPS_PROXY or HTTP_PROXY so Chromium can fetch CDN assets.';
    failure =
      `Error: the deck did not finish loading within ${timeout} ms. Everything the HTML references is fetched before rendering: confirm each local file it names sits beside it, that a deck loading reveal.js from a CDN has network access, or raise --timeout.${proxyHint} Engine: ${detail}`;
  } else if (isLaunchError(error)) {
    const report = await runtime.prepareBrowserRuntime();
    failure = `Error: Chromium cannot launch; check: node scripts/deck.js check. ${chromiumLaunchMessage(report, error)}. See the Dependencies section of TOOL.md.`;
  } else {
    // Content/render failures can quote the deck; keep the engine text out.
    failure = `Error: the browser engine could not render ${inputPath}. Open that file in a browser to see what it does; the engine's own message is withheld because it quotes the deck.`;
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
