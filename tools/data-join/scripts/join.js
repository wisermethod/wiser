#!/usr/bin/env node
/**
 * data-join - join two CSV, JSON, or TSV files on a shared key column
 *
 * Usage:
 *   node scripts/join.js help
 *   node scripts/join.js join --left <path> --right <path> --on <column> [--how inner|left]
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
const COMMANDS = new Set(['join']);
// Restated here so a bad --how never reaches an install. The core rejects the
// same list again for callers that skip this file.
const HOW = new Set(['inner', 'left']);

const USAGE = `data-join - join two CSV, JSON, or TSV files on a shared key column

Usage:
  node scripts/join.js help
  node scripts/join.js join --left <path> --right <path> --on <column>
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
  --help, -h       Print this message

Reads the two files the caller names and writes nothing. Needs no credentials and
no configuration file, so no command takes --env. Success prints one JSON object
to stdout; a file it cannot read or a bad option go to stderr with exit 1. A key
column that is missing is not a failure: it comes back inside the JSON as errors,
with an empty row list and exit 0.`;

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
  fail(`Error: unknown command "${command}". Run "node scripts/join.js help" for usage.`);
}

const VALUE_FLAGS = new Set(['--left', '--right', '--on', '--how', '--format', '--delimiter']);
const BARE_FLAGS = new Set(['--help', '-h']);

// The position after each value flag belongs to that flag. A path that opens
// with a dash is a value, not a flag.
const valuePositions = new Set();
for (let index = 1; index < argv.length; index += 1) {
  if (VALUE_FLAGS.has(argv[index])) valuePositions.add(index + 1);
}

// An unrecognized flag is refused rather than ignored: a silently dropped
// option returns a join that looks finished and is not what was asked for.
for (let index = 1; index < argv.length; index += 1) {
  const option = argv[index];
  if (valuePositions.has(index)) continue;
  if (option.startsWith('-') && !VALUE_FLAGS.has(option) && !BARE_FLAGS.has(option)) {
    fail(`Error: unknown option "${option}". Run "node scripts/join.js help" for usage.`);
  }
}

function flag(name) {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    fail(`Error: ${name} needs a value. Run "node scripts/join.js help" for usage.`);
  }
  // A second occurrence is a usage mistake: first-wins would silently drop it.
  if (argv.indexOf(name, index + 1) !== -1) {
    fail(`Error: ${name} was given more than once and takes one value. Run "node scripts/join.js help" for usage.`);
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
 * One path this command reads, resolved once and returned, so that what is
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

function requireReadableFile(name, value) {
  if (!value) {
    fail(`Error: ${name} is required. Pass the absolute path to a CSV, JSON, or TSV file. Run "node scripts/join.js help" for usage.`);
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

// Built-in-only validation, before the dependency check, so a usage mistake
// never triggers an install.
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

// Whether this process can create files in a directory. Used only to tell an
// unwritable install location apart from a failed install, per Output and errors.
function isWritable(dir) {
  try { accessSync(dir, constants.W_OK); return true; } catch { return false; }
}

// Dependencies. Runs before any package import; keep it above the dynamic import.
if (!existsSync(DEP_MARKER)) {
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
    fail(`Error: npm ci failed in ${TOOL_DIR}. Delete node_modules there, confirm Node 18 or newer, then run "npm ci" by hand.`);
  }
  if (!existsSync(DEP_MARKER)) {
    fail(`Error: npm ci finished but ${DEP_MARKER} is still missing. Check that package.json lists every package this script imports.`);
  }
  fail('Dependencies installed. Re-run the command.');
}

// Packages import only below this line, and only dynamically. A static import
// would run before the check above and crash instead of installing.
const { executeJoin } = await import('./join-core.js');

function readContent(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    // The runtime's own message is withheld; it can echo the path or file bytes.
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
