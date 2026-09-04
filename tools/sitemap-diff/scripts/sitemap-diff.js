#!/usr/bin/env node
/**
 * sitemap-diff - what changed between two sitemap snapshots of one site
 *
 * Usage:
 *   node scripts/sitemap-diff.js help
 *   node scripts/sitemap-diff.js diff --previous <path> --current <path> [--output <path>] [--pretty]
 *
 * Node built-ins only: no package import, no configuration file, no credential,
 * and no network call. The rules every shipped script follows are stated once,
 * in system/templates/Script Contract.md.
 */

import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const TOOL_DIR = resolve(SCRIPT_DIR, '..');

const COMMANDS = new Set(['diff']);

const USAGE = `sitemap-diff - what changed between two sitemap snapshots of one site

Usage:
  node scripts/sitemap-diff.js help
  node scripts/sitemap-diff.js diff --previous <path> --current <path> [--output <path>] [--pretty]

Commands:
  diff              Compare two snapshots and report added URLs, removed URLs,
                    lastmod changes, and path segments that are new
  help              Print this message

Options:
  --previous <path> The earlier snapshot, an absolute path. Required
  --current <path>  The later snapshot, an absolute path. Required
  --output <path>   Also write the result to this file, an absolute path
                    outside this tool directory
  --pretty          Indent the JSON
  --help, -h        Print this message

Each snapshot is a JSON object carrying a urls array whose entries each have a
loc string, and optionally lastmod and segment. Reads the two files named and
nothing else: no network call, no credential, no configuration file.

Success prints one JSON object to stdout. Errors go to stderr with exit 1.`;

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

// Arguments. Parsed first so help costs nothing: no file is opened to answer it.
const argv = process.argv.slice(2);
const command = argv[0] ?? 'help';

if (command === 'help' || argv.includes('--help') || argv.includes('-h')) {
  process.stdout.write(`${USAGE}\n`);
  process.exit(0);
}

if (!COMMANDS.has(command)) {
  fail(`Error: unknown command "${command}". Run "node scripts/sitemap-diff.js help" for usage.`);
}

const VALUE_FLAGS = new Set(['--previous', '--current', '--output']);
const BARE_FLAGS = new Set(['--pretty', '--help', '-h']);

// The position after each value flag belongs to that flag. A path that opens
// with a dash is a value, not a flag.
const valuePositions = new Set();
for (let index = 1; index < argv.length; index += 1) {
  if (VALUE_FLAGS.has(argv[index])) valuePositions.add(index + 1);
}

// An unrecognized flag is refused rather than ignored: a silently dropped
// option returns a diff that looks finished and is not what was asked for.
for (let index = 1; index < argv.length; index += 1) {
  const option = argv[index];
  if (valuePositions.has(index)) continue;
  if (option.startsWith('-') && !VALUE_FLAGS.has(option) && !BARE_FLAGS.has(option)) {
    fail(`Error: unknown option "${option}". Run "node scripts/sitemap-diff.js help" for usage.`);
  }
}

function flag(name) {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  // A SECOND OCCURRENCE IS A USAGE MISTAKE, NOT A PREFERENCE.
  //
  // First-wins silently discarded the rest. Round 12 drove two --file paths at
  // this tool and got a clean, confident, correct-looking object about ONE of
  // them, exit 0, with no signal that the other had been dropped -- which the
  // Script Contract forbids by name. Round 11 fixed this class in Browser
  // Control's switch reader; data-join, data-chart, tag-audit and video-edit
  // already refused. This is the same refusal, in the tools the fix missed.
  // Flags that are documented as repeatable are read somewhere other than here.
  if (argv.indexOf(name, index + 1) !== -1) {
    fail(`Error: ${name} was given more than once and takes one value. Run "node scripts/sitemap-diff.js help" for usage.`);
  }
  if (value === undefined || value.startsWith('--')) {
    fail(`Error: ${name} needs a value. Run "node scripts/sitemap-diff.js help" for usage.`);
  }
  return value;
}

function requireAbsolute(name, value) {
  if (!isAbsolute(value)) {
    fail(`Error: ${name} must be an absolute path; "${value}" would resolve against whatever directory the caller happened to be in.`);
  }
}

// A path argument can be pointed at any file on the machine, so every failure
// below names the path and the reason and never repeats a byte of what it read.
function readText(label, path) {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    const code = error && error.code;
    const reason = code === 'ENOENT'
      ? 'no file at that path'
      : code === 'EACCES'
        ? 'the file is not readable'
        : code === 'EISDIR'
          ? 'that path is a directory'
          : 'the file could not be read';
    fail(`Error: could not read the ${label} snapshot ${path}: ${reason}.`);
  }
}

function loadSnapshot(label, path) {
  const text = readText(label, path);

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    // The parser's own message quotes bytes of the file, which is why the
    // message below is ours and says only which file failed to parse.
    fail(`Error: the ${label} snapshot ${path} is not valid JSON. Pass a snapshot file written by the sitemap-fetch tool.`);
  }

  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.urls)) {
    fail(`Error: the ${label} snapshot ${path} carries no urls array, so it is not a sitemap snapshot. Pass a snapshot file written by the sitemap-fetch tool.`);
  }

  // Indexed by loc: the comparison is over URLs, so a snapshot that repeats one
  // contributes it once and the totals count what was actually compared.
  const byLoc = new Map();
  let unusable = 0;

  for (const entry of parsed.urls) {
    if (!entry || typeof entry !== 'object' || typeof entry.loc !== 'string' || entry.loc === '') {
      unusable += 1;
      continue;
    }
    byLoc.set(entry.loc, {
      loc: entry.loc,
      lastmod: typeof entry.lastmod === 'string' ? entry.lastmod : null,
      segment: typeof entry.segment === 'string' ? entry.segment : ''
    });
  }

  if (unusable > 0) {
    fail(`Error: the ${label} snapshot ${path} has ${unusable} url ${unusable === 1 ? 'entry' : 'entries'} with no loc string. Diffing a partial snapshot would report the missing URLs as removed; re-fetch it instead.`);
  }

  // A snapshot can be honestly partial: sitemap-fetch exits 0 on a walk a cap
  // stopped or a child sitemap failed, and says so in these two fields. The
  // vocabulary is fixed and pushed in sorted order, so the result stays stable.
  const incomplete = [];
  if (Array.isArray(parsed.errors) && parsed.errors.length > 0) incomplete.push('errors');
  if (parsed.truncated === true) incomplete.push('truncated');

  return {
    domain: typeof parsed.domain === 'string' ? parsed.domain : null,
    fetchedAt: typeof parsed.fetchedAt === 'string' ? parsed.fetchedAt : null,
    incomplete,
    byLoc
  };
}

/**
 * The canonical form of a path, following symbolic links wherever the path
 * exists. Resolving a name is not opening the file it names, so this runs before
 * anything is read or written.
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

// The path this returns is the path the write uses. A screen that resolves a
// path and then lets the write take the caller's original spelling has only
// checked a string, and the two agree for exactly as long as nothing moves
// between the check and the open.
function resolveOutput(value) {
  requireAbsolute('--output', value);
  const resolved = canonical('--output', value);
  const toolReal = canonical('this tool directory', TOOL_DIR);

  if (resolved === toolReal || resolved.startsWith(`${toolReal}${sep}`) || descendsFrom(resolved, toolReal)) {
    fail(`Error: --output resolves inside this tool directory (${toolReal}). Pass a path in a work directory in the owning root.`);
  }

  const parent = dirname(resolved);
  if (!existsSync(parent)) {
    fail(`Error: --output names a directory that does not exist: ${parent}. Pass a path in a work directory that exists.`);
  }

  return resolved;
}

// Reported rather than refused: the diff over a partial snapshot is still the
// diff the caller asked for, and whether the gap invalidates it is their call.
// Null when both snapshots are whole, which keeps the key out of that result.
function describeIncomplete(previousReasons, currentReasons) {
  const previousPartial = previousReasons.length > 0;
  const currentPartial = currentReasons.length > 0;

  if (!previousPartial && !currentPartial) return null;

  const detail = {
    side: previousPartial && currentPartial ? 'both' : previousPartial ? 'previous' : 'current'
  };
  if (previousPartial) detail.previous = previousReasons;
  if (currentPartial) detail.current = currentReasons;

  return detail;
}

function main() {
  const previousPath = flag('--previous');
  const currentPath = flag('--current');
  const outputValue = flag('--output');
  const pretty = argv.includes('--pretty');

  if (!previousPath) {
    fail('Error: --previous is required. Pass the earlier snapshot, then the later one as --current.');
  }
  if (!currentPath) {
    fail('Error: --current is required. Pass the later snapshot, and the earlier one as --previous.');
  }

  requireAbsolute('--previous', previousPath);
  requireAbsolute('--current', currentPath);

  // The output target is judged before any file is read, so a run that cannot
  // land its result fails before it does the work.
  const output = outputValue === undefined ? null : resolveOutput(outputValue);

  const previous = loadSnapshot('previous', previousPath);
  const current = loadSnapshot('current', currentPath);

  const domainMismatch = previous.domain && current.domain && previous.domain !== current.domain
    ? { previous: previous.domain, current: current.domain }
    : null;

  const sourceIncomplete = describeIncomplete(previous.incomplete, current.incomplete);

  const previousSegments = new Set(
    [...previous.byLoc.values()].map((entry) => entry.segment).filter(Boolean)
  );

  const addedUrls = [];
  const changedLastmod = [];
  const newSegments = new Set();

  for (const entry of current.byLoc.values()) {
    const before = previous.byLoc.get(entry.loc);
    if (!before) {
      addedUrls.push(entry.loc);
      if (entry.segment && !previousSegments.has(entry.segment)) newSegments.add(entry.segment);
    } else if (before.lastmod && entry.lastmod && before.lastmod !== entry.lastmod) {
      // Both sides must carry a lastmod: a sitemap that starts or stops
      // publishing the field would otherwise read as a site-wide edit.
      changedLastmod.push({ loc: entry.loc, from: before.lastmod, to: entry.lastmod });
    }
  }

  const removedUrls = [];
  for (const loc of previous.byLoc.keys()) {
    if (!current.byLoc.has(loc)) removedUrls.push(loc);
  }

  // Sorted so two runs over the same pair produce the same bytes.
  addedUrls.sort();
  removedUrls.sort();
  changedLastmod.sort((a, b) => (a.loc < b.loc ? -1 : a.loc > b.loc ? 1 : 0));
  const newPathSegments = [...newSegments].sort();

  const result = {
    domain: current.domain ?? previous.domain ?? null,
    previousDate: previous.fetchedAt,
    currentDate: current.fetchedAt,
    domainMismatch,
    ...(sourceIncomplete ? { sourceIncomplete } : {}),
    addedUrls,
    removedUrls,
    changedLastmod,
    newPathSegments,
    counts: {
      previousTotal: previous.byLoc.size,
      currentTotal: current.byLoc.size,
      added: addedUrls.length,
      removed: removedUrls.length,
      lastmodChanged: changedLastmod.length,
      newSegments: newPathSegments.length
    },
    outputPath: output
  };

  const json = JSON.stringify(result, null, pretty ? 2 : 0);

  if (output) {
    try {
      writeFileSync(output, `${json}\n`);
    } catch (error) {
      const code = error && error.code;
      const reason = code === 'EACCES' || code === 'EPERM'
        ? 'the directory is not writable'
        : code === 'EISDIR'
          ? 'that path is a directory'
          : 'the file could not be written';
      fail(`Error: could not write ${output}: ${reason}.`);
    }
  }

  process.stdout.write(`${json}\n`);
}

try {
  main();
} catch (error) {
  // This message is ours; every read and write path reports its own cause above.
  fail(`Error: the diff failed unexpectedly: ${error && error.message ? error.message : 'no detail available'}`);
}
