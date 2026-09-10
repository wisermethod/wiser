#!/usr/bin/env node
/**
 * data - parse, describe, aggregate, join, chart, and compute over data files
 *
 * Usage:
 *   node scripts/data.js help
 *   node scripts/data.js parse --file <path>
 *   node scripts/data.js describe --file <path>
 *   node scripts/data.js aggregate --file <path> --group-by <column> --metric <column>:<function>
 *   node scripts/data.js join --left <path> --right <path> --on <column>
 *   node scripts/data.js chart --file <path> --x <column> --y <column> --output <path.html>
 *   node scripts/data.js compute --file <path> --op <percentage|difference|rate> --a <field> --b <field>
 *
 * Node built-ins, this tool's own files, and tools/lib/. The rules every
 * shipped script follows are stated once, in system/templates/Script Contract.md.
 */

import { execFileSync } from 'node:child_process';
import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { installAuthorised, writeConsent } from '../../lib/consent.js';

const HERE = fileURLToPath(import.meta.url);
const SCRIPT_DIR = dirname(HERE);
const TOOL_DIR = resolve(SCRIPT_DIR, '..');

// One installed package's own manifest. An interrupted install leaves
// node_modules/ behind with nothing in it, so the directory proves nothing.
const DEP_MARKER = join(TOOL_DIR, 'node_modules', 'csv-parse', 'package.json');

const FORMATS = new Set(['csv', 'json', 'tsv']);
const SUBCOMMANDS = new Set(['parse', 'describe', 'aggregate', 'join', 'chart', 'compute']);
const FUNCTIONS = new Set(['sum', 'mean', 'median', 'min', 'max', 'count']);
const HOW = new Set(['inner', 'left']);
const TYPES = new Set(['bar', 'line']);
const OPS = new Set(['percentage', 'difference', 'rate']);

const USAGE = `data - parse, describe, aggregate, join, chart, and compute over data files

Usage:
  node scripts/data.js help
  node scripts/data.js parse --file <path> [--format csv|json|tsv] [--delimiter <char>] [--no-header]
  node scripts/data.js describe --file <path> [--format csv|json|tsv] [--delimiter <char>] [--columns a,b]
  node scripts/data.js aggregate --file <path> --group-by <column> --metric <column>:<function>
                                 [--group-by <column> ...] [--metric <column>:<function> ...]
                                 [--format csv|json|tsv] [--delimiter <char>]
  node scripts/data.js join --left <path> --right <path> --on <column>
                            [--how inner|left] [--format csv|json|tsv] [--delimiter <char>]
  node scripts/data.js chart --file <path> --x <column> --y <column> --output <path.html>
                             [--type bar|line] [--title <text>] [--format csv|json|tsv]
                             [--delimiter <char>] [--overwrite]
  node scripts/data.js compute --file <path> --op <percentage|difference|rate> --a <field> --b <field>
                               [--digits <n>] [--format <fmt>] [--delimiter <char>]

Commands:
  parse            Read a file and report its columns, types, and row count
  describe         Compute count, mean, median, min, max, standard deviation,
                   p25, p75, and null count for each numeric column
  aggregate        Group a file's rows and compute each metric over each group
  join             Join two files on a named key column
  chart            Read a file, build the chart HTML, write it to --output
  compute          Compute a percentage, difference, or rate from two numeric fields
  help             Print this message

Run "node scripts/data.js <command> help" for that command's options.

  --install   Authorise the first install in this copy of the plugin.
              Without it, the first command that needs a package this
              copy has not installed reports what it would fetch, and
              from where, and stops. That answer covers every later
              tool in this copy. WISER_ALLOW_INSTALL=1 does the same
              for an unattended run.
  --help, -h       Print this message

Reads the files the caller names. chart writes one HTML file; the others write
nothing. Needs no credentials and no configuration file, so no command takes --env.
Success prints one JSON object to stdout; a file it cannot read or a bad option go
to stderr with exit 1.`;

const PARSE_USAGE = `data parse - parse a CSV, JSON, or TSV file into a column profile

Usage:
  node scripts/data.js parse help
  node scripts/data.js parse --file <path> [--format csv|json|tsv] [--delimiter <char>] [--no-header]

Commands:
  parse            Read the file and report its columns, types, and row count
  help             Print this message

Options:
  --file <path>    Data file to parse (absolute path), outside this tool
                   directory. Required.
  --format <fmt>   Force csv, json, or tsv. Omit to auto-detect from the content.
  --delimiter <c>  Field delimiter for delimited text. Omit to auto-detect.
  --no-header      Treat the first row as data; columns are named column_1, column_2, ...
  --install   Authorise the first install in this copy of the plugin.
              Without it, the first command that needs a package this
              copy has not installed reports what it would fetch, and
              from where, and stops. That answer covers every later
              tool in this copy. WISER_ALLOW_INSTALL=1 does the same
              for an unattended run.
  --help, -h       Print this message

Reads one file the caller names and writes nothing. Needs no credentials and no
configuration file, so no command takes --env. Success prints one JSON object to
stdout; a file it cannot read or a bad option go to stderr with exit 1. Malformed
data is not a failure: it comes back inside the JSON as parseErrors with exit 0.`;

const DESCRIBE_USAGE = `data describe - descriptive statistics for the numeric columns of a data file

Usage:
  node scripts/data.js describe help
  node scripts/data.js describe --file <path> [--format csv|json|tsv] [--delimiter <char>] [--columns a,b]

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
  --install   Authorise the first install in this copy of the plugin.
              Without it, the first command that needs a package this
              copy has not installed reports what it would fetch, and
              from where, and stops. That answer covers every later
              tool in this copy. WISER_ALLOW_INSTALL=1 does the same
              for an unattended run.
  --help, -h       Print this message

Reads one file the caller names and writes nothing. Needs no credentials and no
configuration file, so no command takes --env. The first row of a delimited file
is read as its header. Success prints one JSON object to stdout; a bad option or
a file that cannot be opened goes to stderr with exit 1. Anything that took
reading the file to discover, an unparseable file, a column that is not there, a
column that is not numeric, comes back inside the JSON as errors with exit 0.`;

const AGGREGATE_USAGE = `data aggregate - group a CSV, JSON, or TSV file's rows and aggregate them

Usage:
  node scripts/data.js aggregate help
  node scripts/data.js aggregate --file <path> --group-by <column> --metric <column>:<function>
                                 [--group-by <column> ...] [--metric <column>:<function> ...]
                                 [--format csv|json|tsv] [--delimiter <char>]

Commands:
  aggregate        Group the file's rows and compute each metric over each group
  help             Print this message

Options:
  --file <path>    Data file to read (absolute path), outside this tool
                   directory. Required.
  --group-by <col> Column whose values form the groups. Required, repeatable;
                   repeat it to group by a tuple, in the order given.
  --metric <spec>  Column and function to compute, as <column>:<function>.
                   Required, repeatable. Functions: sum, mean, median, min, max, count.
                   The column name is everything before the last colon.
  --format <fmt>   Force csv, json, or tsv. Omit to auto-detect from the content.
  --delimiter <c>  Field delimiter for delimited text. Omit to auto-detect.
  --install   Authorise the first install in this copy of the plugin.
              Without it, the first command that needs a package this
              copy has not installed reports what it would fetch, and
              from where, and stops. That answer covers every later
              tool in this copy. WISER_ALLOW_INSTALL=1 does the same
              for an unattended run.
  --help, -h       Print this message

Reads one file the caller names and writes nothing. Needs no credentials and no
configuration file, so no command takes --env. Success prints one JSON object to
stdout; a file it cannot read or a bad option go to stderr with exit 1. A column
that is missing or not numeric is not a failure: it comes back inside the JSON as
errors, with an empty group list and exit 0.`;

const JOIN_USAGE = `data join - join two CSV, JSON, or TSV files on a shared key column

Usage:
  node scripts/data.js join help
  node scripts/data.js join --left <path> --right <path> --on <column>
                            [--how inner|left] [--format csv|json|tsv] [--delimiter <char>]

Commands:
  join             Join the two files on the named key column
  help             Print this message

Options:
  --left <path>    Left data file (absolute path), outside this tool directory. Required.
  --right <path>   Right data file (absolute path), outside this tool directory. Required.
  --on <column>    Key column present on both sides. Required.
  --how <mode>     inner (default) or left.
  --format <fmt>   Force csv, json, or tsv on both sides. Omit to auto-detect each side.
  --delimiter <c>  Field delimiter for delimited text on both sides. Omit to auto-detect.
  --install   Authorise the first install in this copy of the plugin.
              Without it, the first command that needs a package this
              copy has not installed reports what it would fetch, and
              from where, and stops. That answer covers every later
              tool in this copy. WISER_ALLOW_INSTALL=1 does the same
              for an unattended run.
  --help, -h       Print this message

Reads the two files the caller names and writes nothing. Needs no credentials and
no configuration file, so no command takes --env. Success prints one JSON object
to stdout; a file it cannot read or a bad option go to stderr with exit 1. A key
column that is missing is not a failure: it comes back inside the JSON as errors,
with an empty row list and exit 0.`;

const CHART_USAGE = `data chart - build a self-contained HTML SVG bar or line chart from a data file

Usage:
  node scripts/data.js chart help
  node scripts/data.js chart --file <path> --x <column> --y <column> --output <path.html>
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
  --install   Authorise the first install in this copy of the plugin.
              Without it, the first command that needs a package this
              copy has not installed reports what it would fetch, and
              from where, and stops. That answer covers every later
              tool in this copy. WISER_ALLOW_INSTALL=1 does the same
              for an unattended run.
  --help, -h       Print this message

Reads one file and writes one HTML file. The HTML is self-contained: inline SVG,
no network, no external scripts. Needs no credentials and no configuration file,
so no command takes --env. Success prints one JSON object to stdout; failures go
to stderr with exit 1.`;

const COMPUTE_USAGE = `data compute - compute a percentage, difference, or rate from two numeric fields

Usage:
  node scripts/data.js compute help
  node scripts/data.js compute --file <path> --op <percentage|difference|rate> --a <field> --b <field>
                               [--digits <n>] [--format <fmt>] [--delimiter <char>]

Commands:
  compute          Compute a percentage, difference, or rate from two numeric fields
  help             Print this message

Options:
  --file <path>    JSON file to read (absolute path), outside this tool
                   directory. One object, such as the output of aggregate or
                   describe, or an object with a top-level rows array. Required.
  --op <op>        percentage (a / b * 100), difference (a - b), or rate (a / b). Required.
  --a <field>      Numeric field for a, a dotted path where nested. Required.
  --b <field>      Numeric field for b, a dotted path where nested. Required.
  --digits <n>     Round the result to this many decimal places. Omit to leave
                   the JavaScript double unrounded.
  --format <fmt>   Force json. Omit to read the file as JSON.
  --delimiter <c>  Accepted; compute reads JSON, so the delimiter is unused.
  --install   Authorise the first install in this copy of the plugin.
              Without it, the first command that needs a package this
              copy has not installed reports what it would fetch, and
              from where, and stops. That answer covers every later
              tool in this copy. WISER_ALLOW_INSTALL=1 does the same
              for an unattended run.
  --help, -h       Print this message

Reads one JSON object the caller names and writes nothing. Needs no credentials
and no configuration file, so no command takes --env. Success prints one JSON
object to stdout; a missing or non-numeric field, a file it cannot read, or a
bad option go to stderr with exit 1. A zero b for percentage or rate is not a
failure: it comes back on stdout as error "b is zero" with exit 0.`;

const SUB_USAGE = {
  parse: PARSE_USAGE,
  describe: DESCRIBE_USAGE,
  aggregate: AGGREGATE_USAGE,
  join: JOIN_USAGE,
  chart: CHART_USAGE,
  compute: COMPUTE_USAGE,
};

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function helpRef(command) {
  return `node scripts/data.js ${command} help`;
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

function isWritable(dir) {
  try { accessSync(dir, constants.W_OK); return true; } catch { return false; }
}

const WILL_FETCH_BROWSER = false;

function installPlan() {
  let names = [];
  try {
    names = Object.keys(JSON.parse(readFileSync(join(TOOL_DIR, 'package.json'), 'utf8')).dependencies || {});
  } catch { /* the report degrades to a generic list; the refusal still stands */ }
  const browser = names.includes('playwright');
  return {
    list: names.length ? names.join(', ') : 'the packages package.json declares',
    hosts: 'registry.npmjs.org',
    size: browser && WILL_FETCH_BROWSER
      ? ' This run then fetches the Chromium build, several hundred megabytes, from cdn.playwright.dev, or from playwright.download.prss.microsoft.com when Playwright falls back. That build does NOT land here: it goes wherever Playwright keeps browser builds on this machine, which tools/AGENTS.md names for each platform.'
      : ''
  };
}

function requireInstallConsent(what) {
  if (installAuthorised(HERE)) {
    writeConsent(HERE, 'data');
    return;
  }
  if (what === 'browser') {
    fail(
      `Error: this tool's packages are installed but the Chromium build they drive is not, and this copy of the plugin has not authorised an install. The plugin asks once, on the first install in this copy. Installing fetches that build from cdn.playwright.dev, or playwright.download.prss.microsoft.com when Playwright falls back, several hundred megabytes, into wherever Playwright keeps browser builds on this machine. No package is fetched and npm is not run. tools/AGENTS.md lists every write an install makes and names where the build lands. Re-run the same command with --install to authorise it, or set WISER_ALLOW_INSTALL=1 for an unattended run. Nothing is read from stdin, so this is the only way to answer.`
    );
  }
  const { list, hosts, size } = installPlan();
  fail(
    `Error: this tool is not installed yet and this copy of the plugin has not authorised an install. The plugin asks once, on the first install in this copy. Installing fetches ${list} from ${hosts} into ${TOOL_DIR}, and npm writes its own cache outside this plugin.${size} tools/AGENTS.md lists every write an install makes. Re-run the same command with --install to authorise it, or set WISER_ALLOW_INSTALL=1 for an unattended run. Nothing is read from stdin, so this is the only way to answer.`
  );
}

function ensureDependencies() {
  if (existsSync(DEP_MARKER)) return;
  requireInstallConsent('packages');
  process.stderr.write('First run: installing dependencies in this tool directory.\n');
  try {
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    execFileSync(npm, ['ci'], { cwd: TOOL_DIR, stdio: ['ignore', 'ignore', 'inherit'] });
  } catch {
    if (!isWritable(TOOL_DIR)) {
      fail(`Error: cannot install dependencies because ${TOOL_DIR} is not writable. This tool installs its dependencies into its own directory on the run that authorises it with --install, so that directory has to be writable. Install this plugin somewhere you own, or make that directory writable, then run the command again.`);
    }
    fail(`Error: npm ci failed in ${TOOL_DIR}. Confirm Node 18 or newer, then that package-lock.json is present and matches package.json, which is what npm ci requires and will not resolve around. Delete node_modules there and run "npm ci" by hand to see npm's own message. A lockfile that is missing or out of step with the manifest is a defect in this copy of the plugin, not something a re-run fixes.`);
  }
  if (!existsSync(DEP_MARKER)) {
    fail(`Error: npm ci finished but ${DEP_MARKER} is still missing. Check that package.json lists every package this script imports.`);
  }
}

async function runParse(argv) {
  const usageCmd = helpRef('parse');
  const VALUE_FLAGS = new Set(['--file', '--format', '--delimiter']);
  const BARE_FLAGS = new Set(['--install', '--no-header', '--help', '-h']);
  refuseUnknown(argv, VALUE_FLAGS, BARE_FLAGS, usageCmd);

  function flag(name) {
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

  const fileArgument = flag('--file');
  if (!fileArgument) {
    fail(`Error: --file is required. Pass the absolute path to a CSV, JSON, or TSV file. Run "${usageCmd}" for usage.`);
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

  const format = flag('--format');
  if (format !== undefined && !FORMATS.has(format)) {
    fail(`Error: --format must be one of csv, json, tsv; got "${format}". Omit it to auto-detect from the content.`);
  }

  const delimiter = flag('--delimiter');
  const hasHeader = !argv.includes('--no-header');

  ensureDependencies();
  const { executeParse } = await import('./parse-core.js');

  let content;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch {
    fail(`Error: could not read ${filePath}. Confirm it is a readable file, not a directory.`);
  }

  const result = executeParse({ content, format, delimiter, hasHeader });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

async function runDescribe(argv) {
  const usageCmd = helpRef('describe');
  const VALUE_FLAGS = new Set(['--file', '--format', '--delimiter', '--columns']);
  const BARE_FLAGS = new Set(['--install', '--help', '-h']);
  refuseUnknown(argv, VALUE_FLAGS, BARE_FLAGS, usageCmd);

  function flag(name) {
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

  const fileArgument = flag('--file');
  if (!fileArgument) {
    fail(`Error: --file is required. Pass the absolute path to a CSV, JSON, or TSV file. Run "${usageCmd}" for usage.`);
  }
  const filePath = screenedInputPath('--file', fileArgument);
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

  ensureDependencies();
  const { executeDescribe } = await import('./describe-core.js');

  let content;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch {
    failUnreadable();
  }

  const result = executeDescribe({ content, format, delimiter, columns });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

async function runAggregate(argv) {
  const usageCmd = helpRef('aggregate');
  const VALUE_FLAGS = new Set(['--file', '--group-by', '--metric', '--format', '--delimiter']);
  const BARE_FLAGS = new Set(['--install', '--help', '-h']);
  refuseUnknown(argv, VALUE_FLAGS, BARE_FLAGS, usageCmd);

  function flagValues(name) {
    const found = [];
    for (let i = 0; i < argv.length; i += 1) {
      if (argv[i] !== name) continue;
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        fail(`Error: ${name} needs a value. Run "${usageCmd}" for usage.`);
      }
      found.push(value);
    }
    return found;
  }

  function flag(name) {
    const found = flagValues(name);
    if (found.length > 1) {
      fail(`Error: ${name} was given ${found.length} times and takes one value. Run "${usageCmd}" for usage.`);
    }
    return found[0];
  }

  const fileArgument = flag('--file');
  if (!fileArgument) {
    fail(`Error: --file is required. Pass the absolute path to a CSV, JSON, or TSV file. Run "${usageCmd}" for usage.`);
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

  const groupBy = flagValues('--group-by');
  if (groupBy.length === 0) {
    fail('Error: --group-by is required. Name the column whose values form the groups; repeat it to group by a tuple.');
  }

  const metricSpecs = flagValues('--metric');
  if (metricSpecs.length === 0) {
    fail(`Error: --metric is required, as <column>:<function>. Functions: ${[...FUNCTIONS].join(', ')}.`);
  }

  const metrics = metricSpecs.map((spec) => {
    const cut = spec.lastIndexOf(':');
    if (cut <= 0 || cut === spec.length - 1) {
      fail(`Error: --metric "${spec}" is not in the form <column>:<function>. The function follows the last colon.`);
    }
    const fn = spec.slice(cut + 1);
    if (!FUNCTIONS.has(fn)) {
      fail(`Error: --metric "${spec}" names function "${fn}"; use one of ${[...FUNCTIONS].join(', ')}.`);
    }
    return { column: spec.slice(0, cut), function: fn };
  });

  const format = flag('--format');
  if (format !== undefined && !FORMATS.has(format)) {
    fail(`Error: --format must be one of csv, json, tsv; got "${format}". Omit it to auto-detect from the content.`);
  }

  const delimiter = flag('--delimiter');

  ensureDependencies();
  const { executeAggregate } = await import('./aggregate-core.js');

  let content;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch {
    fail(`Error: could not read ${filePath}. Confirm it is a readable file, not a directory.`);
  }

  const result = executeAggregate({ content, format, delimiter, groupBy, metrics });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

async function runJoin(argv) {
  const usageCmd = helpRef('join');
  const VALUE_FLAGS = new Set(['--left', '--right', '--on', '--how', '--format', '--delimiter']);
  const BARE_FLAGS = new Set(['--install', '--help', '-h']);
  refuseUnknown(argv, VALUE_FLAGS, BARE_FLAGS, usageCmd);

  function flag(name) {
    const index = argv.indexOf(name);
    if (index === -1) return undefined;
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      fail(`Error: ${name} needs a value. Run "${usageCmd}" for usage.`);
    }
    if (argv.indexOf(name, index + 1) !== -1) {
      fail(`Error: ${name} was given more than once and takes one value. Run "${usageCmd}" for usage.`);
    }
    return value;
  }

  function requireReadableFile(name, value) {
    if (!value) {
      fail(`Error: ${name} is required. Pass the absolute path to a CSV, JSON, or TSV file. Run "${usageCmd}" for usage.`);
    }
    const filePath = screenedInputPath(name, value);
    let fileStat;
    try {
      fileStat = statSync(filePath);
    } catch {
      fail(`Error: no file at ${filePath}. Pass the absolute path to the data file.`);
    }
    if (!fileStat.isFile()) {
      fail(`Error: could not read ${filePath}. Confirm it is a readable file, not a directory.`);
    }
    return filePath;
  }

  const leftPath = requireReadableFile('--left', flag('--left'));
  const rightPath = requireReadableFile('--right', flag('--right'));

  const on = flag('--on');
  if (!on) {
    fail('Error: --on is required. Name the key column present on both sides.');
  }

  const how = flag('--how') ?? 'inner';
  if (!HOW.has(how)) {
    fail(`Error: --how must be one of inner, left; got "${how}".`);
  }

  const format = flag('--format');
  if (format !== undefined && !FORMATS.has(format)) {
    fail(`Error: --format must be one of csv, json, tsv; got "${format}". Omit it to auto-detect from the content.`);
  }

  const delimiter = flag('--delimiter');

  ensureDependencies();
  const { executeJoin } = await import('./join-core.js');

  function readContent(path) {
    try {
      return readFileSync(path, 'utf8');
    } catch {
      fail(`Error: could not read ${path}. Confirm it is a readable file, not a directory.`);
    }
  }

  const result = executeJoin({
    leftContent: readContent(leftPath),
    rightContent: readContent(rightPath),
    on,
    how,
    format,
    delimiter,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

async function runChart(argv) {
  const usageCmd = helpRef('chart');
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
  const BARE_FLAGS = new Set(['--install', '--overwrite', '--help', '-h']);
  refuseUnknown(argv, VALUE_FLAGS, BARE_FLAGS, usageCmd);

  function flag(name) {
    const index = argv.indexOf(name);
    if (index === -1) return undefined;
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      fail(`Error: ${name} needs a value. Run "${usageCmd}" for usage.`);
    }
    if (argv.indexOf(name, index + 1) !== -1) {
      fail(`Error: ${name} was given more than once and takes one value. Run "${usageCmd}" for usage.`);
    }
    return value;
  }

  const fileArgument = flag('--file');
  if (!fileArgument) {
    fail(`Error: --file is required. Pass the absolute path to a CSV, JSON, or TSV file. Run "${usageCmd}" for usage.`);
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

  ensureDependencies();
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
}

async function runCompute(argv) {
  const usageCmd = helpRef('compute');
  const VALUE_FLAGS = new Set(['--file', '--op', '--a', '--b', '--digits', '--format', '--delimiter']);
  const BARE_FLAGS = new Set(['--install', '--help', '-h']);
  refuseUnknown(argv, VALUE_FLAGS, BARE_FLAGS, usageCmd);

  function flag(name) {
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

  const fileArgument = flag('--file');
  if (!fileArgument) {
    fail(`Error: --file is required. Pass the absolute path to a JSON object. Run "${usageCmd}" for usage.`);
  }

  const op = flag('--op');
  if (!op) {
    fail(`Error: --op is required. Use one of percentage, difference, rate. Run "${usageCmd}" for usage.`);
  }
  if (!OPS.has(op)) {
    fail(`Error: --op must be one of percentage, difference, rate; got "${op}".`);
  }

  const aField = flag('--a');
  if (!aField) {
    fail(`Error: --a is required. Name the numeric field for a. Run "${usageCmd}" for usage.`);
  }

  const bField = flag('--b');
  if (!bField) {
    fail(`Error: --b is required. Name the numeric field for b. Run "${usageCmd}" for usage.`);
  }

  const digitsArg = flag('--digits');
  let digits;
  if (digitsArg !== undefined) {
    if (!/^\d+$/.test(digitsArg) || Number(digitsArg) > 20) {
      fail(`Error: --digits must be an integer from 0 to 20; got "${digitsArg}".`);
    }
    digits = Number(digitsArg);
  }

  const format = flag('--format');
  if (format !== undefined && format !== 'json') {
    fail(`Error: --format must be json; got "${format}". compute reads a JSON object.`);
  }

  flag('--delimiter');

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

  const { executeCompute } = await import('./compute-core.js');

  let content;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch {
    fail(`Error: could not read ${filePath}. Confirm it is a readable file, not a directory.`);
  }

  let data;
  try {
    data = JSON.parse(content);
  } catch {
    fail(`Error: ${filePath} is not valid JSON. Pass a file holding one JSON object, such as a saved aggregate or describe result.`);
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    fail(`Error: ${filePath} does not hold one JSON object. Pass a file holding one JSON object, such as a saved aggregate or describe result.`);
  }

  const computed = executeCompute({ data, op, aField, bField, digits });
  if (!computed.ok) {
    fail(`Error: field ${computed.field} is missing or not a number in ${filePath}`);
  }

  process.stdout.write(`${JSON.stringify(computed.result)}\n`);
}

const argv = process.argv.slice(2);
const command = argv[0] ?? 'help';

if (command === 'help' || command === '--help' || command === '-h') {
  process.stdout.write(`${USAGE}\n`);
  process.exit(0);
}

if (!SUBCOMMANDS.has(command)) {
  fail(`Error: unknown command "${command}". Run "node scripts/data.js help" for usage.`);
}

if (argv[1] === 'help' || argv.includes('--help') || argv.includes('-h')) {
  process.stdout.write(`${SUB_USAGE[command]}\n`);
  process.exit(0);
}


if (command === 'parse') await runParse(argv);
else if (command === 'describe') await runDescribe(argv);
else if (command === 'aggregate') await runAggregate(argv);
else if (command === 'join') await runJoin(argv);
else if (command === 'chart') await runChart(argv);
else if (command === 'compute') await runCompute(argv);
