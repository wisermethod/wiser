#!/usr/bin/env node
/**
 * sitemap-fetch - a deterministic snapshot of the URLs a site publishes in its sitemaps
 *
 * Usage:
 *   node scripts/sitemap-fetch.js help
 *   node scripts/sitemap-fetch.js fetch --domain <host> [--max n] [--date YYYY-MM-DD] [--output <dir>]
 *   node scripts/sitemap-fetch.js fetch --url <sitemap url> [--url ...] [--max n] [--date YYYY-MM-DD] [--output <dir>]
 *   node scripts/sitemap-fetch.js fetch --file <path> [--file ...] [--max n] [--date YYYY-MM-DD] [--output <dir>]
 *
 * One package, undici, installed with npm ci on the run that authorises it with
 * --install, into this tool's own
 * directory. No configuration file and no credentials.
 * The rules every shipped script follows are stated once, in
 * system/templates/Script Contract.md.
 */

import { execFileSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { accessSync, constants, existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { destinationReason, destinationReasonText } from './lib/destination.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const TOOL_DIR = resolve(SCRIPT_DIR, '..');

// Names this tool and nothing about who is running it.
const USER_AGENT = 'sitemap-fetch/0.1.1 (sitemap snapshot)';
const TIMEOUT_MS = 20000;
const MAX_INDEX_DEPTH = 5;
const MAX_REDIRECTS = 5;
const DEFAULT_MAX_URLS = 50000;
// The sitemap protocol's own ceiling on a <loc>. An address past it is recorded
// as an error naming its length, never cut down into the snapshot.
const MAX_LOC_LENGTH = 2048;
// How much of an address a message prints. Records are never bounded this way.
const PRINTED_URL_LIMIT = 500;
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const COMMANDS = new Set(['fetch']);

const USAGE = `sitemap-fetch - a deterministic snapshot of the URLs a site publishes in its sitemaps

Usage:
  node scripts/sitemap-fetch.js help
  node scripts/sitemap-fetch.js fetch --domain <host> [options]
  node scripts/sitemap-fetch.js fetch --url <sitemap url> [--url ...] [options]
  node scripts/sitemap-fetch.js fetch --file <path> [--file ...] [options]

Commands:
  fetch            Collect the site's sitemaps into one snapshot object
  help             Print this message

Options:
  --domain <host>  Discover sitemaps from the host's robots.txt, then from
                   /sitemap.xml and /sitemap_index.xml
  --url <url>      An http or https sitemap or sitemap-index URL. Repeatable.
                   Given, it replaces discovery
  --file <path>    A local sitemap or sitemap-index XML file, absolute path.
                   Repeatable. Offline mode: no network. Mutually exclusive
                   with --domain and --url
  --max <n>        Stop after this many URLs and set "truncated" (default ${DEFAULT_MAX_URLS})
  --date <date>    YYYY-MM-DD stamped as "fetchedAt" (default: today)
  --output <dir>   Also write the snapshot to a file in this directory, an
                   absolute path that must sit outside this tool directory
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

/**
 * The canonical form of a path, following symbolic links wherever the path
 * exists. Resolving a name is not opening the file it names, so this runs before
 * anything is written and before the first request goes out.
 *
 * `resolve` normalizes lexically and follows nothing on disk, so a symbolic link
 * standing in for any ancestor is a spelling a lexical comparison does not
 * match. The output directory usually does not exist yet, so a path whose leaf is
 * absent is canonicalized through the deepest ancestor that does exist and the
 * missing components joined back on: that ancestor is where the write would land.
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
 * compared that way. A destination that does not exist yet has no inode of its
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

// Arguments. Parsed first so help costs nothing.
const argv = process.argv.slice(2);
const command = argv[0] ?? 'help';

if (command === 'help' || argv.includes('--help') || argv.includes('-h')) {
  process.stdout.write(`${USAGE}\n`);
  process.exit(0);
}

if (!COMMANDS.has(command)) {
  fail(`Error: unknown command "${command}". Run "node scripts/sitemap-fetch.js help" for usage.`);
}

// After help: install undici when needed and honor HTTPS_PROXY for Node fetch.
const UNDICI_MARKER = join(TOOL_DIR, 'node_modules', 'undici', 'package.json');
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
      ? ' A command that drives a browser then fetches the Chromium build, several hundred megabytes, from cdn.playwright.dev, or from playwright.download.prss.microsoft.com when Playwright falls back; a command that does not, such as a scaffold or a survey, fetches no browser. That build does NOT land here: it goes wherever Playwright keeps browser builds on this machine, which tools/AGENTS.md names for each platform.'
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

// Arguments are parsed here, ABOVE the install. The Script Contract requires an
// option this script does not name to be refused "before any work, any
// dependency install, and any network request", and round 5 found this script
// installing first and refusing after -- which is also what made a misplaced
// --install cost a full npm fetch before the parser ever saw it. parseArgs is a
// function declaration and imports nothing, so it runs before the packages do.
const parsedArgs = parseArgs(argv.slice(1));

// The REQUIRED arguments, checked here too, above the install, for the same
// reason the unknown-flag refusal is. The Script Contract's clause is "before
// any work, any dependency install, and any network request", and round 7 found
// this half still open: `fetch --install` with no seed installed the packages
// and THEN said it needed one, so a run that named nothing to fetch cost the
// whole fetch. The check is free here -- parsedArgs is already computed, and
// this is the same pair of conditions main() applies, stated once as a function
// so the two cannot drift apart.
// Returns { offline } on a valid pair of seeds, or { problem } on a bad one.
// It returns the MODE rather than only the verdict, because round 8 found the
// first version of this extraction had moved `offline` and `network` into the
// new function and left main()'s two readers of `offline` behind: every valid
// `fetch` died with `offline is not defined`, and every executed gate row was
// an invalid-argument case that stopped above them. One definition, handed to
// the caller, is what makes that impossible rather than merely fixed.
function seedMode(args) {
  const offline = args.files.length > 0;
  const network = args.domain !== null || args.urls.length > 0;
  if (offline && network) {
    return { problem: 'Error: fetch takes either network seeds (--domain / --url) or offline seeds (--file), not both. Run "node scripts/sitemap-fetch.js help" for usage.' };
  }
  if (!offline && !network) {
    return { problem: 'Error: fetch needs --domain <host>, at least one --url <sitemap url>, or at least one --file <path>. Run "node scripts/sitemap-fetch.js help" for usage.' };
  }
  return { offline };
}

// The rest of the usage checks, hoisted for the same reason and refusing at the
// same point. Round 8: the first hoist refused a MISSING argument above the
// install and left a MALFORMED one buying it -- fitted to the four forms round 7
// happened to write down, in the only two tools of eighteen whose siblings all
// refuse a bad value before installing. These are the same tests main() applies,
// stated once so the two cannot drift.
function valueProblem(args) {
  if (args.date !== null && !DATE_PATTERN.test(args.date)) {
    return `Error: --date must be YYYY-MM-DD; got "${args.date}".`;
  }
  if (args.max !== DEFAULT_MAX_URLS) {
    const parsed = Number(args.max);
    if (!Number.isInteger(parsed) || parsed < 1) {
      return `Error: --max must be a whole number of 1 or more; got "${args.max}".`;
    }
  }
  for (const value of args.files) {
    if (!isAbsolute(value)) {
      return `Error: --file must be absolute; got "${value}", which would resolve against whatever directory the caller happened to be in.`;
    }
  }
  return null;
}
{
  const seeds = seedMode(parsedArgs);
  if (seeds.problem) fail(seeds.problem);
  const bad = valueProblem(parsedArgs);
  if (bad) fail(bad);
}

if (!existsSync(UNDICI_MARKER)) {
  requireInstallConsent('packages');
  process.stderr.write('First run: installing dependencies in this tool directory.\n');
  try {
    execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci'], {
      cwd: TOOL_DIR,
      stdio: ['ignore', 'ignore', 'inherit']
    });
  } catch {
    // Two different failures arrive here and they have different fixes, so the
    // Script Contract's Output and errors clause requires telling them apart:
    // an unwritable tool directory is not a broken install, and telling someone
    // to run "npm ci" by hand where they cannot write cannot succeed.
    if (!isWritable(TOOL_DIR)) {
      fail(`Error: cannot install dependencies because ${TOOL_DIR} is not writable. This tool installs its dependencies into its own directory on the run that authorises it with --install, so that directory has to be writable. Install this plugin somewhere you own, or make that directory writable, then run the command again.`);
    }
    fail(`Error: npm ci failed in ${TOOL_DIR}. Confirm Node 18 or newer, then that package-lock.json is present and matches package.json, which is what npm ci requires. A lockfile missing or out of step with the manifest is a defect in this copy of the plugin, not something a re-run fixes.`);
  }
}
{
  const server =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    '';
  if (typeof server === 'string' && server.trim() !== '') {
    const undici = await import('undici');
    if (typeof undici.setGlobalDispatcher === 'function' && undici.ProxyAgent) {
      undici.setGlobalDispatcher(new undici.ProxyAgent(server.trim()));
    }
  }
}

function parseArgs(rest) {
  const args = { urls: [], files: [], domain: null, max: DEFAULT_MAX_URLS, date: null, output: null };

  for (let index = 0; index < rest.length; index++) {
    const flag = rest[index];
    const value = rest[index + 1];

    if (!flag.startsWith('--')) {
      fail(`Error: unexpected argument "${flag}". Run "node scripts/sitemap-fetch.js help" for usage.`);
    }

    if (
      flag !== '--url' &&
      flag !== '--file' &&
      flag !== '--domain' &&
      flag !== '--max' &&
      flag !== '--date' &&
      flag !== '--output' &&
      flag !== '--install'
    ) {
      fail(`Error: unknown option "${flag}". Run "node scripts/sitemap-fetch.js help" for usage.`);
    }

    // `--install` is a bare flag: the entry script reads it from raw process.argv
    // above, so here it neither takes a value nor consumes the next word. Round 5
    // found it named in the allowlist above with no branch here, so it fell into
    // the value-taking refusal below; round 6 found the branch written with an
    // `index++` that the `for` already performs, which skipped whatever followed
    // the flag. `continue` alone is the whole of it: the loop's own increment
    // moves to the next word, and the next word is not this flag's value.
    if (flag === '--install') {
      continue;
    }

    if (value === undefined || value.startsWith('--')) {
      fail(`Error: ${flag} needs a value. Run "node scripts/sitemap-fetch.js help" for usage.`);
    }

    if (flag === '--url') args.urls.push(value);
    else if (flag === '--file') args.files.push(value);
    else if (flag === '--domain') args.domain = value;
    else if (flag === '--max') args.max = value;
    else if (flag === '--date') args.date = value;
    else if (flag === '--output') args.output = value;

    index++;
  }

  return args;
}

/**
 * A caller-named source path, screened per Script Contract: absolute, real, and
 * outside this tool directory. The returned path is what every open and read uses.
 */
function screenSourceFile(value) {
  if (!isAbsolute(value)) {
    fail(`Error: --file must be absolute; got "${value}", which would resolve against whatever directory the caller happened to be in.`);
  }

  const resolved = canonical('--file', value);
  const toolReal = canonical('this tool directory', TOOL_DIR);

  if (resolved === toolReal || resolved.startsWith(`${toolReal}${sep}`) || descendsFrom(resolved, toolReal)) {
    fail(`Error: --file resolves inside this tool directory (${toolReal}). Scripts read only from a work directory in the owning root; pass that path instead.`);
  }

  let info;
  try {
    info = statSync(resolved);
  } catch (error) {
    fail(`Error: --file ${resolved} could not be read (${error.code}).`);
  }

  if (!info.isFile()) {
    fail(`Error: --file ${resolved} is not a file.`);
  }

  return resolved;
}

/**
 * Bytes of a local sitemap, gunzipped when the magic or a .gz name says so.
 * A failure is a value, matching fetchText.
 */
function readLocalSitemap(filePath) {
  let buffer;

  try {
    buffer = readFileSync(filePath);
  } catch (error) {
    return { reason: `could not read the file (${error.code})` };
  }

  if (buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
    try {
      return { text: gunzipSync(buffer).toString('utf8') };
    } catch {
      return { reason: 'the body announced gzip but did not decompress' };
    }
  }

  if (filePath.endsWith('.gz')) {
    try {
      return { text: gunzipSync(buffer).toString('utf8') };
    } catch {
      // A .gz name on a body that is not gzipped: read it as text.
    }
  }

  return { text: buffer.toString('utf8') };
}

/**
 * Host of the first parseable loc, or "local" when none carry one. Offline
 * snapshots have no discovery host to label them with.
 */
function domainFromUrls(urls) {
  for (const entry of urls) {
    try {
      const host = new URL(entry.loc).host;
      if (host) return host;
    } catch {
      // Keep looking; a bad loc is already filtered or recorded elsewhere.
    }
  }
  return 'local';
}

/**
 * One entry from a url block, or null when the block contributes nothing new.
 * Shared by the network walk and the offline file path so the two shapes stay
 * one shape.
 */
function recordUrlEntry(block, urlsByLoc, errors) {
  const raw = tagValues(block, 'loc')[0];
  if (!raw) return null;

  const loc = publicUrl(raw);

  if (loc.length > MAX_LOC_LENGTH) {
    errors.push({
      url: printableUrl(raw),
      reason: `is ${loc.length} characters, past the ${MAX_LOC_LENGTH} a sitemap URL may be; not recorded`
    });
    return null;
  }

  if (urlsByLoc.has(loc)) return null;

  const lastmod = tagValues(block, 'lastmod')[0];
  const entry = { ...normalizeUrl(loc), lastmod: lastmod ? lastmod.slice(0, 10) : null };
  urlsByLoc.set(loc, entry);
  return entry;
}

/**
 * Query parameter names that authorize rather than describe. A sitemap URL can
 * carry one, and a snapshot is a file that outlives the run, so the request is
 * made with the parameter and the record is written without it (the
 * constitution's Irreversibles).
 */
const CREDENTIAL_SUBSTRINGS = [
  'token', 'secret', 'signature', 'apikey', 'api_key', 'password', 'passwd',
  'credential', 'sessionid', 'accesskey', 'authorization', 'jwt'
];

const CREDENTIAL_WORDS = /(?:^|[^a-z0-9])(?:key|keys|sid|sig|auth|session|access|refresh|pass|pwd|otp|oauth|bearer|sso|ticket|private)(?:[^a-z0-9]|$)/;

function isCredentialParam(name) {
  const normalized = String(name).toLowerCase();
  return CREDENTIAL_SUBSTRINGS.some((needle) => normalized.includes(needle)) || CREDENTIAL_WORDS.test(normalized);
}

/** The form of a URL this tool is willing to write into a snapshot or a message. */
function publicUrl(value) {
  const raw = String(value);
  let parsed;

  try {
    parsed = new URL(raw);
  } catch {
    return raw;
  }

  parsed.username = '';
  parsed.password = '';

  for (const key of [...parsed.searchParams.keys()]) {
    if (isCredentialParam(key)) parsed.searchParams.set(key, 'redacted');
  }

  return parsed.href;
}

/**
 * The form a message prints. A message is read by a person and an address has
 * no length limit, so what is printed is bounded and names the length it cut.
 * Nothing recorded is bounded this way: a cut address is a different address,
 * and two addresses cut at the same point become one.
 */
function printableUrl(value) {
  const url = publicUrl(value);

  if (url.length <= PRINTED_URL_LIMIT) return url;

  return `${url.slice(0, PRINTED_URL_LIMIT)}... (${url.length} characters)`;
}

/**
 * A URL this tool will request, or the reason it will not. `base` is the
 * document that named this one, absent when the caller named it. Every address
 * this tool would open a connection to comes through here first: the caller's
 * own targets, every sitemap a fetched robots.txt or index names, and every
 * redirect a response points at.
 *
 * The reasons read as predicates of the address, so one vocabulary carries into
 * a caller's refusal, a skipped entry in `errors`, and a refused redirect.
 * `url` is returned beside a reason whenever the address parsed, which is what
 * lets a refused redirect name where it was pointing.
 */
async function screenTarget(value, base) {
  let parsed;

  try {
    parsed = base ? new URL(value, base) : new URL(value);
  } catch {
    return { reason: 'is not a URL this tool can resolve' };
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return { url: parsed, reason: `uses ${parsed.protocol}//, and this tool reads http and https sitemaps only` };
  }

  if (parsed.username || parsed.password) {
    return { url: parsed, reason: 'carries an embedded username and password, and this tool sends no credentials' };
  }

  // A hostname that resolves nowhere is not refused here: it is a network
  // condition rather than a destination this tool declines, and the fetch that
  // follows records its own failure in `errors` the way every other dead host
  // does. Everything the screen does refuse is refused before a connection.
  const destination = await destinationReason(parsed.hostname);

  if (destination && destination !== 'unresolvable') {
    return { url: parsed, reason: `points at ${destinationReasonText(destination)}, which this tool does not fetch` };
  }

  return { url: parsed };
}

function hostFromDomain(domain) {
  return domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\/$/, '');
}

function decodeEntities(text) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x2F;/gi, '/')
    .replace(/&amp;/g, '&');
}

/**
 * The one place this tool reaches the network. A failure here is a value, not a
 * throw: the caller records it and keeps walking. No message repeats the
 * runtime's own text, which can quote the whole request URL. A success carries
 * the address that answered beside the body, because after a redirect that is
 * the sitemap that was read.
 *
 * A redirect is a new destination, and a redirect target is named by the server
 * rather than by the caller, so the chain is followed one hop at a time and
 * every hop is screened before it is requested. A chain that turns toward this
 * machine's own network or a cloud metadata service stops at the hop that
 * turns, and that hop is never sent. Each hop gets its own timeout.
 */
async function fetchText(url) {
  let current = url;
  let hops = 0;

  while (true) {
    let response;

    try {
      response = await fetch(current, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/xml,text/xml,*/*' },
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
    } catch {
      return { reason: `no response within ${TIMEOUT_MS}ms, or the connection failed` };
    }

    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get('location');

      if (!location) return { reason: `HTTP ${response.status} with no Location header` };

      if (hops >= MAX_REDIRECTS) {
        return { reason: `redirected more than ${MAX_REDIRECTS} times without reaching a sitemap` };
      }

      const screened = await screenTarget(location, current.href);

      if (screened.reason) {
        return {
          reason: screened.url
            ? `the redirect to ${printableUrl(screened.url.href)} was not followed: it ${screened.reason}`
            : `the redirect was not followed: its Location ${screened.reason}`
        };
      }

      current = screened.url;
      hops++;
      continue;
    }

    if (!response.ok) return { reason: `HTTP ${response.status}` };

    let buffer;

    try {
      buffer = Buffer.from(await response.arrayBuffer());
    } catch {
      return { reason: `HTTP ${response.status} but the body did not finish arriving` };
    }

    // Gzip by magic bytes or by extension, whatever the server labels it.
    if (buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
      try {
        return { text: gunzipSync(buffer).toString('utf8'), url: current };
      } catch {
        return { reason: 'the body announced gzip but did not decompress' };
      }
    }

    if (current.pathname.endsWith('.gz')) {
      try {
        return { text: gunzipSync(buffer).toString('utf8'), url: current };
      } catch {
        // A .gz name on a body that is not gzipped: read it as text.
      }
    }

    return { text: buffer.toString('utf8'), url: current };
  }
}

function tagValues(xml, tag) {
  const pattern = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}\\s*>`, 'gi');
  const values = [];
  let match;

  while ((match = pattern.exec(xml)) !== null) {
    const value = match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
    values.push(decodeEntities(value));
  }

  return values;
}

/**
 * One block per entry, so a loc and its lastmod stay paired. The tag name is
 * matched as a whole element name: `<url` alone would also match `<urlset>`.
 */
function entryBlocks(xml, wrapper) {
  const pattern = new RegExp(`<${wrapper}(?:\\s[^>]*)?>([\\s\\S]*?)</${wrapper}\\s*>`, 'gi');
  const blocks = [];
  let match;

  while ((match = pattern.exec(xml)) !== null) blocks.push(match[1]);

  return blocks;
}

function isIndex(xml) {
  return /<sitemapindex[\s>]/i.test(xml);
}

function normalizeUrl(loc) {
  try {
    const parsed = new URL(loc);
    const path = parsed.pathname || '/';
    const segments = path.split('/').filter(Boolean);
    return { loc, path, slug: segments[segments.length - 1] || '', segment: segments[0] || '' };
  } catch {
    return { loc, path: loc, slug: '', segment: '' };
  }
}

/**
 * robots.txt is the site's own declaration of where its sitemaps are. Its
 * address is the caller's own domain, screened before this runs; the addresses
 * it declares are the site's, so each is screened here and a refused one is
 * recorded and skipped rather than raised.
 */
async function discoverSitemaps(robotsUrl, errors) {
  const declared = [];
  const robots = await fetchText(robotsUrl);

  if (robots.text) {
    for (const line of robots.text.split(/\r?\n/)) {
      const match = line.match(/^\s*sitemap:\s*(\S+)/i);
      if (match) declared.push(match[1].trim());
    }
  }

  if (declared.length === 0) {
    // A missing or silent robots.txt is not an error; the conventional
    // locations are tried next and their own failures are recorded. They sit on
    // the caller's own host, which the screen has already passed.
    return [new URL('/sitemap.xml', robotsUrl), new URL('/sitemap_index.xml', robotsUrl)];
  }

  const usable = new Map();

  for (const candidate of declared) {
    const screened = await screenTarget(candidate, robotsUrl.href);

    if (screened.reason) errors.push({ url: publicUrl(candidate), reason: `${screened.reason}; skipped` });
    else usable.set(screened.url.href, screened.url);
  }

  return [...usable.values()];
}

async function collect(seeds, max) {
  const urlsByLoc = new Map();
  const errors = [];
  const visited = new Set();
  const sitemaps = [];
  let truncated = false;

  async function walk(target, depth) {
    if (truncated || depth > MAX_INDEX_DEPTH) return;

    const href = target.href;
    if (visited.has(href)) return;
    visited.add(href);

    const result = await fetchText(target);

    if (result.reason) {
      errors.push({ url: publicUrl(href), reason: result.reason });
      return;
    }

    // A redirect can land two seeds on one document, so the address that
    // answered is what marks a sitemap read and what the snapshot records.
    const readHref = result.url.href;

    if (readHref !== href) {
      if (visited.has(readHref)) return;
      visited.add(readHref);
    }

    const xml = result.text;

    if (isIndex(xml)) {
      const children = entryBlocks(xml, 'sitemap').flatMap((block) => tagValues(block, 'loc'));

      for (const child of children) {
        if (truncated) break;
        const screened = await screenTarget(child, href);

        if (screened.reason) {
          errors.push({ url: publicUrl(child), reason: `${screened.reason}; skipped` });
          continue;
        }

        await walk(screened.url, depth + 1);
      }

      return;
    }

    sitemaps.push(publicUrl(readHref));

    for (const block of entryBlocks(xml, 'url')) {
      if (urlsByLoc.size >= max) {
        truncated = true;
        break;
      }

      // Recorded whole or not at all. A loc cut to fit is a different address,
      // and two cut at the same point would collapse into one entry.
      recordUrlEntry(block, urlsByLoc, errors);
    }
  }

  for (const seed of seeds) {
    if (truncated) break;
    await walk(seed, 0);
  }

  return { urls: [...urlsByLoc.values()], errors, sitemaps, truncated };
}

/**
 * Offline path: each --file is a seed already on disk. No network, no robots
 * discovery, no following of child locs named by an index (pass each child as
 * its own --file). Same urlset parsing and same snapshot shape as collect.
 */
function collectFromFiles(paths, max) {
  const urlsByLoc = new Map();
  const errors = [];
  const sitemaps = [];
  let truncated = false;

  for (const filePath of paths) {
    if (truncated) break;

    const result = readLocalSitemap(filePath);

    if (result.reason) {
      errors.push({ url: filePath, reason: result.reason });
      continue;
    }

    const xml = result.text;

    if (isIndex(xml)) {
      const children = entryBlocks(xml, 'sitemap').flatMap((block) => tagValues(block, 'loc'));

      if (children.length === 0) {
        errors.push({
          url: filePath,
          reason: 'is a sitemap index with no child locs; offline mode does not discover children'
        });
        continue;
      }

      for (const child of children) {
        errors.push({
          url: publicUrl(child),
          reason: 'named by a local sitemap index; offline mode does not fetch child sitemaps, pass each file with --file'
        });
      }
      continue;
    }

    sitemaps.push(filePath);

    for (const block of entryBlocks(xml, 'url')) {
      if (urlsByLoc.size >= max) {
        truncated = true;
        break;
      }
      recordUrlEntry(block, urlsByLoc, errors);
    }
  }

  return { urls: [...urlsByLoc.values()], errors, sitemaps, truncated };
}

async function main() {
  const args = parsedArgs;

  // Already refused above the install; called again so main() stands on its own
  // and the two can never disagree, because both read the one function -- and
  // this is where the operating mode comes from, so there is one definition of
  // it rather than a copy the next refactor can leave behind.
  const seeds = seedMode(args);
  if (seeds.problem) fail(seeds.problem);
  const badValue = valueProblem(args);
  if (badValue) fail(badValue);
  const { offline } = seeds;

  const max = Number(args.max);

  // valueProblem above already refused a non-integer or sub-1 --max; this is
  // the same test in its own terms, kept because main() must not depend on
  // something upstream having run.
  if (!Number.isSafeInteger(max) || max < 1) {
    fail(`Error: --max must be a whole number of 1 or more; got "${args.max}".`);
  }

  // Checked here, before the first request or read: a run that cannot write
  // where it was told to write should cost nobody a fetch.
  let outputDir = null;

  if (args.output) {
    // The help text has always promised an absolute path. Accepting a relative
    // one resolved it against whatever directory the caller happened to be in,
    // so the same argument named a different destination from one shell to the
    // next; the promise is now what the code enforces.
    if (!isAbsolute(args.output)) {
      fail(`Error: --output must be absolute; got "${args.output}", which would resolve against whatever directory the caller happened to be in.`);
    }

    // The path this screen resolves is the path mkdirSync and writeFileSync
    // below are given. A screen that resolves one path and lets the write take
    // the caller's original spelling has only checked a string.
    outputDir = canonical('--output', args.output);
    const toolReal = canonical('this tool directory', TOOL_DIR);

    if (outputDir === toolReal || outputDir.startsWith(`${toolReal}${sep}`) || descendsFrom(outputDir, toolReal)) {
      fail(`Error: --output resolves inside this tool directory (${toolReal}). Scripts write only to a work directory in the owning root; pass that path instead.`);
    }
  }

  let urls;
  let errors;
  let sitemaps;
  let truncated;
  let host;
  let seedFallback;

  if (offline) {
    const paths = args.files.map((value) => screenSourceFile(value));
    ({ urls, errors, sitemaps, truncated } = collectFromFiles(paths, max));
    // Stable ordering, so two runs of the same input diff cleanly.
    urls.sort((a, b) => (a.loc < b.loc ? -1 : a.loc > b.loc ? 1 : 0));
    host = domainFromUrls(urls);
    seedFallback = paths;
  } else {
    // An address the caller named is refused outright, because a run aimed
    // somewhere this tool will not go has no partial answer worth returning. An
    // address a fetched document names is skipped and recorded instead, which is
    // this tool's discipline for everything a site got wrong.
    const named = [];

    for (const value of args.urls) {
      const screened = await screenTarget(value, null);
      if (screened.reason) fail(`Error: --url ${printableUrl(value)} ${screened.reason}.`);
      named.push(screened.url);
    }

    host = args.domain ? hostFromDomain(args.domain) : named[0].host;

    if (!host) {
      fail(`Error: --domain has no host in it; got "${args.domain}".`);
    }

    const discoveryErrors = [];
    let seeds = named;

    if (seeds.length === 0) {
      // Screened as the caller's own address, since discovery is the one path
      // that connects to the domain itself. Given --url, the domain only labels
      // the snapshot and nothing is requested from it.
      const screened = await screenTarget(`https://${host}/robots.txt`, null);

      if (screened.reason) fail(`Error: --domain "${args.domain}" ${screened.reason}.`);

      seeds = await discoverSitemaps(screened.url, discoveryErrors);
    }

    const collected = await collect(seeds, max);
    urls = collected.urls;
    errors = [...discoveryErrors, ...collected.errors];
    sitemaps = collected.sitemaps;
    truncated = collected.truncated;
    seedFallback = seeds.map((seed) => publicUrl(seed.href));

    // Stable ordering, so two runs of the same site diff cleanly.
    urls.sort((a, b) => (a.loc < b.loc ? -1 : a.loc > b.loc ? 1 : 0));
  }

  const snapshot = {
    domain: host,
    fetchedAt: args.date || new Date().toISOString().slice(0, 10),
    sitemaps: sitemaps.length > 0 ? sitemaps : seedFallback,
    urls,
    count: urls.length,
    truncated
  };

  if (errors.length > 0) snapshot.errors = errors;

  if (urls.length === 0) {
    snapshot.note = offline
      ? 'N/A: no URLs parsed. The file may be empty, a sitemap index without child files passed, or in a form this reader does not recognize.'
      : 'N/A: no URLs parsed. The sitemap may be missing, blocked, or in a form this reader does not recognize.';
  }

  if (outputDir) {
    mkdirSync(outputDir, { recursive: true });
    const stem = snapshot.domain.replace(/[^A-Za-z0-9.-]/g, '-');
    const file = join(outputDir, `sitemap-${stem}-${snapshot.fetchedAt}.json`);
    writeFileSync(file, `${JSON.stringify(snapshot, null, 2)}\n`);
    snapshot.file = file;
  }

  process.stdout.write(`${JSON.stringify(snapshot)}\n`);
}

// No swallowed failure: a snapshot on stdout means the walk ran.
main().catch((error) => {
  fail(`Error: fetch failed: ${error.message}`);
});
