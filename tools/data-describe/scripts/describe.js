#!/usr/bin/env node
/**
 * data-describe - descriptive statistics for the numeric columns of a data file
 *
 * Usage:
 *   node scripts/describe.js help
 *   node scripts/describe.js describe --file <path> [--format csv|json|tsv] [--delimiter <char>] [--columns a,b]
 *
 * Node built-ins only above the dependency check; nothing here imports from
 * outside this tool directory. The rules every shipped script follows are
 * stated once, in system/templates/Script Contract.md.
 */

import { execFileSync } from 'node:child_process';
import { accessSync, constants, existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const TOOL_DIR = resolve(SCRIPT_DIR, '..');

// One installed package's own manifest. An interrupted install leaves
// node_modules/ behind with nothing in it, so the directory proves nothing.
const DEP_MARKER = join(TOOL_DIR, 'node_modules', 'csv-parse', 'package.json');

const FORMATS = new Set(['csv', 'json', 'tsv']);
const COMMANDS = new Set(['describe']);

const USAGE = `data-describe - descriptive statistics for the numeric columns of a data file

Usage:
  node scripts/describe.js help
  node scripts/describe.js describe --file <path> [--format csv|json|tsv] [--delimiter <char>] [--columns a,b]

Commands:
  describe         Compute count, mean, median, min, max, standard deviation,
                   p25, p75, and null count for each numeric column
  help             Print this message

Options:
  --file <path>    Data file to read (absolute path), outside this tool
                   directory. Required.
  --format <fmt>   Force csv, json, or tsv. Omit to auto-detect from the content.
  --delimiter <c>  Field delimiter for delimited text. Omit to auto-detect.
  --columns <list> Comma-separated column names to describe. Omit for every
                   numeric column.
  --install   Authorise the first-run install. Without it a tool that is
              not installed yet reports what it would fetch, and from
              where, and stops. WISER_ALLOW_INSTALL=1 does the same
              for an unattended run.
  --help, -h       Print this message

Reads one file the caller names and writes nothing. Needs no credentials and no
configuration file, so no command takes --env. The first row of a delimited file
is read as its header. Success prints one JSON object to stdout; a bad option or
a file that cannot be opened goes to stderr with exit 1. Anything that took
reading the file to discover, an unparseable file, a column that is not there, a
column that is not numeric, comes back inside the JSON as errors with exit 0.`;

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
  fail(`Error: unknown command "${command}". Run "node scripts/describe.js help" for usage.`);
}

const VALUE_FLAGS = new Set(['--file', '--format', '--delimiter', '--columns']);
const BARE_FLAGS = new Set([
  '--install','--help', '-h']);

// The position after each value flag belongs to that flag. A path that opens
// with a dash is a value, not a flag.
const valuePositions = new Set();
for (let index = 1; index < argv.length; index += 1) {
  if (VALUE_FLAGS.has(argv[index])) valuePositions.add(index + 1);
}

// An unrecognized flag is refused rather than ignored: a silently dropped
// option returns statistics that look finished and are not what was asked for.
for (let index = 1; index < argv.length; index += 1) {
  const option = argv[index];
  if (valuePositions.has(index)) continue;
  if (option.startsWith('-') && !VALUE_FLAGS.has(option) && !BARE_FLAGS.has(option)) {
    fail(`Error: unknown option "${option}". Run "node scripts/describe.js help" for usage.`);
  }
}

function flag(name) {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    fail(`Error: ${name} needs a value. Run "node scripts/describe.js help" for usage.`);
  }
  return value;
}

/**
 * The canonical form of a path, following symbolic links wherever the path
 * exists. Resolving a name is not opening the file it names, so this runs
 * before anything is read and before the dependency check.
 *
 * `resolve` normalizes lexically and follows nothing on disk, so a symbolic
 * link, a link in any parent component, and a relative spelling are three
 * strings a lexical comparison does not match. `realpathSync` resolves every
 * component against the filesystem, which turns the comparison below from a
 * string check into an identity check. A path whose leaf is absent is
 * canonicalized through the deepest ancestor that does exist and the missing
 * components joined back on, so a symbolic link standing in for any ancestor
 * cannot hide where the path lands.
 *
 * Absence is the only reason to keep walking. Any other refusal from the
 * filesystem, an unreadable ancestor or a loop of symbolic links, means the
 * real path cannot be known, and a screen that cannot know what it is looking
 * at refuses rather than falling back to the caller's spelling.
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
 *
 * `realpathSync` preserves whatever case the caller wrote, so on a
 * case-insensitive volume a variant spelling of this directory canonicalizes to
 * a string carrying none of its prefix even though it names that very
 * directory, and a name test alone lets the read through. Device and inode are
 * a directory's own identity, which no spelling reaches, so every existing
 * ancestor of `target` is compared that way as well.
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

/**
 * The one path this command reads, resolved once and returned, so that what is
 * opened below is the path this screen cleared rather than the spelling the
 * caller happened to use. Absolute because the help text says absolute: a
 * relative path resolves against whichever directory the caller was in, which
 * is not a location this tool can reason about. Outside this tool directory
 * because a tool reads the caller's data, never its own installation.
 */
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

// Built-in-only validation, before the dependency check, so a usage mistake
// never triggers an install. csv-parse is not needed to know that a path is
// missing, or that it is a directory rather than a readable file.
const fileArgument = flag('--file');
if (!fileArgument) {
  fail('Error: --file is required. Pass the absolute path to a CSV, JSON, or TSV file. Run "node scripts/describe.js help" for usage.');
}
// Screened before the stat, so a path this tool must not read is refused
// without the tool ever asking the filesystem about it. Everything below uses
// the value this returns, never `fileArgument`.
const filePath = screenedInputPath('--file', fileArgument);
// Every way the path is not a readable file answers here. The runtime's own
// message is withheld throughout; it can echo the path or file bytes.
function failUnreadable() {
  fail(`Error: could not read ${filePath}. Confirm it is a readable file, not a directory.`);
}

let fileStats;
try {
  fileStats = statSync(filePath, { throwIfNoEntry: false });
} catch {
  failUnreadable();
}
if (fileStats === undefined) {
  fail(`Error: no file at ${filePath}. Pass the absolute path to the data file.`);
}
if (!fileStats.isFile()) {
  failUnreadable();
}

const format = flag('--format');
if (format !== undefined && !FORMATS.has(format)) {
  fail(`Error: --format must be one of csv, json, tsv; got "${format}". Omit it to auto-detect from the content.`);
}

const delimiter = flag('--delimiter');

const columnsArg = flag('--columns');
let columns;
if (columnsArg !== undefined) {
  columns = columnsArg.split(',').map((name) => name.trim()).filter((name) => name !== '');
  if (columns.length === 0) {
    fail('Error: --columns needs at least one column name. Omit it to describe every numeric column.');
  }
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

function requireInstallConsent() {
  if (process.argv.includes('--install') || process.env.WISER_ALLOW_INSTALL === '1') return;
  const { list, hosts, size } = installPlan();
  fail(
    `Error: this tool is not installed yet and this run did not authorise an install. Installing fetches ${list} from ${hosts} into ${TOOL_DIR}, and npm writes its own cache outside this plugin.${size} tools/AGENTS.md lists every write an install makes. Re-run the same command with --install to authorise it, or set WISER_ALLOW_INSTALL=1 for an unattended run. Nothing is read from stdin, so this is the only way to answer.`
  );
}

// Dependencies. Runs before any package import; keep it above the dynamic import.
if (!existsSync(DEP_MARKER)) {
  requireInstallConsent();
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
      fail(`Error: cannot install dependencies because ${TOOL_DIR} is not writable. This tool installs its dependencies into its own directory the first time it runs, so that directory has to be writable. Install this plugin somewhere you own, or make that directory writable, then run the command again.`);
    }
    fail(`Error: npm ci failed in ${TOOL_DIR}. Confirm Node 18 or newer, then that package-lock.json is present and matches package.json, which is what npm ci requires and will not resolve around. Delete node_modules there and run "npm ci" by hand to see npm's own message. A lockfile that is missing or out of step with the manifest is a defect in this copy of the plugin, not something a re-run fixes.`);
  }
  if (!existsSync(DEP_MARKER)) {
    fail(`Error: npm ci finished but ${DEP_MARKER} is still missing. Check that package.json lists every package this script imports.`);
  }
}

// Packages import only below this line, and only dynamically. A static import
// would run before the check above and crash instead of installing.
const { executeDescribe } = await import('./describe-core.js');

let content;
try {
  content = readFileSync(filePath, 'utf8');
} catch {
  failUnreadable();
}

const result = executeDescribe({ content, format, delimiter, columns });

process.stdout.write(`${JSON.stringify(result)}\n`);
