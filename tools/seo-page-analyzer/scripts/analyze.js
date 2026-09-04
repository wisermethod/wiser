#!/usr/bin/env node
/**
 * seo-page-analyzer - report one page's on-page SEO elements from its HTML
 *
 * Usage:
 *   node scripts/analyze.js help
 *   node scripts/analyze.js analyze --html <path> --page-url <url> [--keyword "<text>"]
 *
 * Node built-ins only, no packages, so there is nothing to install and nothing
 * to check before the work runs. Nothing here imports from outside this tool
 * directory, opens a connection, or reads standard input. The rules every
 * shipped script follows are stated once, in system/templates/Script Contract.md.
 */

import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { analyzePage } from './analyze-core.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const TOOL_DIR = resolve(SCRIPT_DIR, '..');

const COMMANDS = new Set(['analyze']);

// Query and fragment parameter names that authorize rather than describe. The
// page URL is echoed into a report that is written into other files, so a
// caller who analyzes a page it reached with a signed address does not publish
// the signature by naming the address it fetched.
const CREDENTIAL_SUBSTRINGS = [
  'token', 'secret', 'signature', 'apikey', 'api_key', 'password', 'passwd',
  'credential', 'sessionid', 'accesskey', 'authorization', 'jwt'
];

const CREDENTIAL_WORDS = /(?:^|[^a-z0-9])(?:key|keys|sid|sig|auth|session|access|refresh|pass|pwd|otp|oauth|bearer|sso|ticket|private)(?:[^a-z0-9]|$)/;

const USAGE = `seo-page-analyzer - report one page's on-page SEO elements from its HTML

Usage:
  node scripts/analyze.js help
  node scripts/analyze.js analyze --html <path> --page-url <url> [--keyword "<text>"]

Commands:
  analyze            Read the HTML file and report the page's on-page elements
  help               Print this message

Options:
  --html <path>      File holding the page's HTML (absolute path), outside this
                     tool directory. Required.
  --page-url <url>   The http or https address this HTML came from, used to tell
                     the page's own links from links off it, and echoed in the
                     report. Never requested. Required.
  --keyword "<text>" Target keyword to check the page against. Omit it and every
                     keyword field reports null. Optional.
  --help, -h         Print this message

Reads one file the caller names and writes nothing. Opens no connection, holds no
credential, and takes no --env. Success prints one JSON object to stdout; a bad
option or an unreadable file goes to stderr with exit 1. HTML that parses to
nothing is not a failure: it comes back as a report of absences with exit 0.`;

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

// Arguments. Parsed first so help costs nothing: no file read, no analysis.
const argv = process.argv.slice(2);
const command = argv[0] ?? 'help';

if (command === 'help' || argv.includes('--help') || argv.includes('-h')) {
  process.stdout.write(`${USAGE}\n`);
  process.exit(0);
}

if (!COMMANDS.has(command)) {
  fail(`Error: unknown command "${command}". Run "node scripts/analyze.js help" for usage.`);
}

const VALUE_FLAGS = new Set(['--html', '--page-url', '--keyword']);
const BARE_FLAGS = new Set(['--help', '-h']);

// The position after each value flag belongs to that flag. A path that opens
// with a dash is a value, not a flag.
const valuePositions = new Set();
for (let index = 1; index < argv.length; index += 1) {
  if (VALUE_FLAGS.has(argv[index])) valuePositions.add(index + 1);
}

// An unrecognized flag is refused rather than ignored: a silently dropped
// option returns a report that looks finished and is not what was asked for.
for (let index = 1; index < argv.length; index += 1) {
  const option = argv[index];
  if (valuePositions.has(index)) continue;
  if (option.startsWith('-') && !VALUE_FLAGS.has(option) && !BARE_FLAGS.has(option)) {
    fail(`Error: unknown option "${option}". Run "node scripts/analyze.js help" for usage.`);
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
    fail(`Error: ${name} was given more than once and takes one value. Run "node scripts/analyze.js help" for usage.`);
  }
  if (value === undefined || value.startsWith('--')) {
    fail(`Error: ${name} needs a value. Run "node scripts/analyze.js help" for usage.`);
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

const htmlArgument = flag('--html');
if (!htmlArgument) {
  fail('Error: --html is required. Pass the absolute path to a file holding the page HTML. Run "node scripts/analyze.js help" for usage.');
}
// Screened before the existence check, so a path this tool must not read is
// refused without the tool ever asking the filesystem about it. Everything
// below uses the value this returns, never `htmlArgument`.
const htmlPath = screenedInputPath('--html', htmlArgument);
if (!existsSync(htmlPath)) {
  fail(`Error: no file at ${htmlPath}. Pass the absolute path to the saved HTML.`);
}

const pageUrlValue = flag('--page-url');
if (!pageUrlValue) {
  fail('Error: --page-url is required. Pass the http or https address this HTML came from; it is never requested.');
}

let pageUrl;
try {
  pageUrl = new URL(pageUrlValue);
} catch {
  fail('Error: --page-url is not a URL. Pass an absolute http or https address, such as https://example.com/pricing.');
}

if (pageUrl.protocol !== 'http:' && pageUrl.protocol !== 'https:') {
  fail(`Error: --page-url must be http or https; got ${pageUrl.protocol}//. Pass the address the page is served at.`);
}

const keyword = flag('--keyword');

let html;
try {
  html = readFileSync(htmlPath, 'utf8');
} catch {
  // The runtime's own message is withheld; it can echo the path or file bytes.
  fail(`Error: could not read ${htmlPath}. Confirm it is a readable file, not a directory.`);
}

const report = analyzePage({
  html,
  url: recordedUrl(pageUrl),
  keyword,
  analyzedAt: new Date().toISOString()
});

process.stdout.write(`${JSON.stringify(report)}\n`);

/**
 * The form of the page address this tool is willing to write down: no embedded
 * username or password, no fragment, which names a place inside a page rather
 * than a page, and no query parameter that carries authorization. Everything
 * else is left alone, so the address stays a usable reference to the page.
 */
function recordedUrl(url) {
  const clean = new URL(url.href);
  clean.username = '';
  clean.password = '';
  clean.hash = '';

  for (const name of [...clean.searchParams.keys()]) {
    if (isCredentialParam(name)) clean.searchParams.delete(name);
  }

  return clean.href;
}

function isCredentialParam(name) {
  const normalized = String(name).toLowerCase();
  return CREDENTIAL_SUBSTRINGS.some((needle) => normalized.includes(needle)) || CREDENTIAL_WORDS.test(normalized);
}
