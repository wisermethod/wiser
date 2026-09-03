#!/usr/bin/env node
/**
 * data-chart - build a self-contained HTML SVG bar or line chart from a data file
 *
 * Usage:
 *   node scripts/chart.js help
 *   node scripts/chart.js chart --file <path> --x <column> --y <column> --output <path.html>
 *
 * Node built-ins only above the dependency check; nothing here imports from
 * outside this tool directory. The rules every shipped script follows are
 * stated once, in system/templates/Script Contract.md.
 */

import { execFileSync } from 'node:child_process';
import { accessSync, constants, existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const TOOL_DIR = resolve(SCRIPT_DIR, '..');

// One installed package's own manifest. An interrupted install leaves
// node_modules/ behind with nothing in it, so the directory proves nothing.
const DEP_MARKER = join(TOOL_DIR, 'node_modules', 'csv-parse', 'package.json');

const FORMATS = new Set(['csv', 'json', 'tsv']);
const COMMANDS = new Set(['chart']);
const TYPES = new Set(['bar', 'line']);

const USAGE = `data-chart - build a self-contained HTML SVG bar or line chart from a data file

Usage:
  node scripts/chart.js help
  node scripts/chart.js chart --file <path> --x <column> --y <column> --output <path.html>
                              [--type bar|line] [--title <text>] [--format csv|json|tsv]
                              [--delimiter <char>] [--overwrite]

Commands:
  chart            Read the file, build the chart HTML, write it to --output
  help             Print this message

Options:
  --file <path>    Data file to read (absolute path), outside this tool directory. Required.
  --x <column>     Category (label) column. Required.
  --y <column>     Numeric value column. Required.
  --output <path>  HTML file to write, absolute, ending .html, outside this tool
                   directory. Required. Missing folders on the way are created.
  --type <kind>    bar (default) or line.
  --title <text>   Optional chart title drawn above the plot.
  --format <fmt>   Force csv, json, or tsv. Omit to auto-detect from the content.
  --delimiter <c>  Field delimiter for delimited text. Omit to auto-detect.
  --overwrite      Replace a file already at --output. Without it, an occupied
                   path is refused and nothing is written.
  --install   Authorise the first-run install. Without it a tool that is
              not installed yet reports what it would fetch, and from
              where, and stops. WISER_ALLOW_INSTALL=1 does the same
              for an unattended run.
  --help, -h       Print this message

Reads one file and writes one HTML file. The HTML is self-contained: inline SVG,
no network, no external scripts. Needs no credentials and no configuration file,
so no command takes --env. Success prints one JSON object to stdout; failures go
to stderr with exit 1.`;

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
  fail(`Error: unknown command "${command}". Run "node scripts/chart.js help" for usage.`);
}

const VALUE_FLAGS = new Set([
  '--file',
  '--x',
  '--y',
  '--output',
  '--type',
  '--title',
  '--format',
  '--delimiter',
]);
const BARE_FLAGS = new Set([
  '--install','--overwrite', '--help', '-h']);

// The position after each value flag belongs to that flag. A path that opens
// with a dash is a value, not a flag.
const valuePositions = new Set();
for (let index = 1; index < argv.length; index += 1) {
  if (VALUE_FLAGS.has(argv[index])) valuePositions.add(index + 1);
}

// An unrecognized flag is refused rather than ignored: a silently dropped
// option returns a chart that looks finished and is not what was asked for.
for (let index = 1; index < argv.length; index += 1) {
  const option = argv[index];
  if (valuePositions.has(index)) continue;
  if (option.startsWith('-') && !VALUE_FLAGS.has(option) && !BARE_FLAGS.has(option)) {
    fail(`Error: unknown option "${option}". Run "node scripts/chart.js help" for usage.`);
  }
}

function flag(name) {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    fail(`Error: ${name} needs a value. Run "node scripts/chart.js help" for usage.`);
  }
  if (argv.indexOf(name, index + 1) !== -1) {
    fail(`Error: ${name} was given more than once and takes one value. Run "node scripts/chart.js help" for usage.`);
  }
  return value;
}

/**
 * The canonical form of a path, following symbolic links wherever the path
 * exists. Resolving a name is not opening the file it names, so this runs
 * before anything is read, installed, or written.
 *
 * The output usually does not exist yet, so a path whose leaf is absent is
 * canonicalized through the deepest ancestor that does exist and the missing
 * components joined back on: a symbolic link standing in for any ancestor
 * cannot hide where the write lands.
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

/**
 * True when `target` names this tool's own directory or something beneath it,
 * decided by identity rather than by spelling.
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

function screenedInputPath(name, value) {
  if (!isAbsolute(value)) {
    fail(`Error: ${name} must be absolute; got "${value}". A relative path resolves against whichever directory the caller happened to be in.`);
  }
  const target = canonical(name, value);
  if (insideToolDirectory(target)) {
    fail(`Error: ${name} resolves inside this tool directory (${canonical('this tool directory', TOOL_DIR)}). This tool reads the caller's data; pass a path in a work directory in the owning root.`);
  }
  return target;
}

function screenedOutputPath(name, value) {
  if (!isAbsolute(value)) {
    fail(`Error: ${name} must be absolute; got "${value}". A relative path resolves against whichever directory the caller happened to be in.`);
  }
  const target = canonical(name, value);
  if (insideToolDirectory(target)) {
    fail(`Error: ${name} resolves inside this tool directory (${canonical('this tool directory', TOOL_DIR)}). Scripts write only to a work directory in the owning root; pass that path instead.`);
  }
  return target;
}

// Built-in-only validation, before the dependency check, so a usage mistake
// never triggers an install and never writes a file.
const fileArgument = flag('--file');
if (!fileArgument) {
  fail('Error: --file is required. Pass the absolute path to a CSV, JSON, or TSV file. Run "node scripts/chart.js help" for usage.');
}
const filePath = screenedInputPath('--file', fileArgument);
let fileStat;
try {
  fileStat = statSync(filePath);
} catch {
  fail(`Error: no file at ${filePath}. Pass the absolute path to the data file.`);
}
if (!fileStat.isFile()) {
  fail(`Error: could not read ${filePath}. Confirm it is a readable file, not a directory.`);
}

const x = flag('--x');
if (!x) {
  fail('Error: --x is required. Name the category (label) column.');
}

const y = flag('--y');
if (!y) {
  fail('Error: --y is required. Name the numeric value column.');
}

const outputArgument = flag('--output');
if (!outputArgument) {
  fail('Error: --output is required. Pass the absolute path of the .html file to write, in a work directory in the owning root.');
}
const outputPath = screenedOutputPath('--output', outputArgument);
if (!/\.html$/i.test(outputPath)) {
  fail(`Error: --output must end in .html; got "${outputPath}".`);
}

// The overwrite gate. Built-ins only and ahead of the dependency check, so a
// run that would have destroyed a file installs nothing and writes nothing.
let existing;
try {
  existing = statSync(outputPath, { throwIfNoEntry: false });
} catch {
  existing = undefined;
}
if (existing?.isDirectory()) {
  fail(`Error: --output names an existing directory (${outputPath}). Pass the path of the HTML file to write, not the folder to write it into.`);
}
if (existing && !argv.includes('--overwrite')) {
  fail(`Error: a file already exists at ${outputPath}. Pass --overwrite to replace it, or name a path that is free.`);
}

const type = flag('--type') ?? 'bar';
if (!TYPES.has(type)) {
  fail(`Error: --type must be one of bar, line; got "${type}".`);
}

const title = flag('--title') ?? '';

const format = flag('--format');
if (format !== undefined && !FORMATS.has(format)) {
  fail(`Error: --format must be one of csv, json, tsv; got "${format}". Omit it to auto-detect from the content.`);
}

const delimiter = flag('--delimiter');

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

// Packages import only below this line, and only dynamically.
const { buildChart } = await import('./chart-core.js');

let content;
try {
  content = readFileSync(filePath, 'utf8');
} catch {
  fail(`Error: could not read ${filePath}. Confirm it is a readable file, not a directory.`);
}

const built = buildChart({ content, x, y, type, title, format, delimiter });
if (!built.ok) {
  fail(`Error: ${built.errors.join('; ')}`);
}

const outputDir = dirname(outputPath);
try {
  mkdirSync(outputDir, { recursive: true });
} catch {
  fail(`Error: could not create the folder for ${outputPath}. Confirm the parent path is writable.`);
}

try {
  writeFileSync(outputPath, built.html, 'utf8');
} catch {
  fail(`Error: could not write ${outputPath}. Confirm the path is writable and not a directory.`);
}

process.stdout.write(
  `${JSON.stringify({
    output: outputPath,
    type: built.type,
    points: built.points,
    width: built.width,
    height: built.height,
    skipped: built.skipped,
    notes: built.notes,
  })}\n`
);
