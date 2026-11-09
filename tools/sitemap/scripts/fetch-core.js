/**
 * sitemap fetch - a deterministic snapshot of the URLs a site publishes in its sitemaps
 *
 * Invoked by scripts/sitemap.js after help is answered. One package, undici,
 * installed with npm ci on the run that authorises it with --install, into this
 * tool's own directory. No configuration file and no credentials. The rules
 * every shipped script follows are stated once, in
 * system/templates/Script Contract.md.
 */

import { execFileSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { accessSync, constants, existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { lookup } from './lib/destination.js';
import { createSnapshot, publicUrl, finishSnapshot, snapshotInputProblem, SnapshotInputError, domainFromUrls, recordUrlEntry, tagValues, entryBlocks, isIndex } from './snapshot-core.js';
import { INSTALL_HELP, installQuestion, formatInstallSize, INSTALL_BYTES, installAuthorised, writeConsent } from '../../lib/consent.js';

const HERE = fileURLToPath(import.meta.url);
const SCRIPT_DIR = dirname(HERE);
const TOOL_DIR = resolve(SCRIPT_DIR, '..');

const DEFAULT_MAX_URLS = 50000;

// Flags that take exactly one value. Declared HERE, with the other constants,
// rather than beside the function that reads it: `parseArgs` is called at the
// top of this file, above where a `const` further down has been initialized, so
// a declaration next to its use is a temporal dead zone and every run dies in
// the parser. That is the same shape as the round-8 regression -- a restructure
// that moved a binding out from under its caller -- and it was caught here by
// running a valid command before committing rather than by a gate round.
const SINGLETON_FLAGS = new Map([
  ['--domain', 'domain'], ['--max', 'max'], ['--date', 'date'], ['--output', 'output']
]);
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
// Whether THIS RUN will ask for a browser, which is what the consent report has
// to describe. A tool that CAN drive a browser is not the same as a run that
// WILL: `deck-export scaffold` and `web-screenshot check` are both commands of
// browser tools that fetch none.
const WILL_FETCH_BROWSER = false;

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
  const install = parsedArgs.install === true;
  if (installAuthorised(HERE, install)) {
    writeConsent(HERE, 'sitemap', install);
    return;
  }
  if (what === 'browser') {
    fail(
      `${installQuestion('a private copy of the Chromium browser', "read the list of pages a website publishes and spot what changed", formatInstallSize(INSTALL_BYTES.chromium))}\n\nDetails for the assistant: this tool's packages are installed but the Chromium build they drive is not, and this person has not authorised a Wiser install. Installing fetches that build from cdn.playwright.dev, or playwright.download.prss.microsoft.com when Playwright falls back, several hundred megabytes, into wherever Playwright keeps browser builds on this machine. No package is fetched and npm is not run. tools/AGENTS.md lists every write an install makes and names where the build lands. Re-run the same command with --install to authorise it, or set WISER_ALLOW_INSTALL=1 for an unattended run. Nothing is read from stdin, so this is the only way to answer.`
    );
  }
  const { list, hosts, size } = installPlan();
  fail(
    `${installQuestion("a small web-request library", "read the list of pages a website publishes and spot what changed", formatInstallSize(INSTALL_BYTES.request))}\n\nDetails for the assistant: this tool is not installed yet and this person has not authorised a Wiser install. Installing fetches ${list} from ${hosts} into ${TOOL_DIR}, and npm writes its own cache outside this plugin.${size} tools/AGENTS.md lists every write an install makes. Re-run the same command with --install to authorise it, or set WISER_ALLOW_INSTALL=1 for an unattended run. Nothing is read from stdin, so this is the only way to answer.`
  );
}

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
    return { problem: 'Error: fetch takes either network seeds (--domain / --url) or offline seeds (--file), not both. Run "node scripts/sitemap.js fetch help" for usage.' };
  }
  if (!offline && !network) {
    return { problem: 'Error: fetch needs --domain <host>, at least one --url <sitemap url>, or at least one --file <path>. Run "node scripts/sitemap.js fetch help" for usage.' };
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
  const problem = snapshotInputProblem(args);
  if (problem) return problem;
  for (const value of args.files) {
    if (!isAbsolute(value)) {
      return `Error: --file must be absolute; got "${value}", which would resolve against whatever directory the caller happened to be in.`;
    }
  }
  // --output, which round 9 found still below the install: the one caller-named
  // path of the four that was not hoisted with the rest of them.
  if (args.output !== null && !isAbsolute(args.output)) {
    return `Error: --output must be absolute; got "${args.output}", which would resolve against whatever directory the caller happened to be in.`;
  }
  return null;
}

// Arguments are parsed here, ABOVE the install. The Script Contract requires an
// option this script does not name to be refused "before any work, any
// dependency install, and any network request", and round 5 found this script
// installing first and refusing after -- which is also what made a misplaced
// --install cost a full npm fetch before the parser ever saw it. parseArgs is a
// function declaration and imports nothing, so it runs before the packages do.
let parsedArgs;

export async function runFetch(argv) {
  parsedArgs = parseArgs(argv.slice(1));

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

  // No swallowed failure: a snapshot on stdout means the walk ran.
  await main().catch((error) => {
    fail(error instanceof SnapshotInputError ? error.message : `Error: fetch failed: ${error.message}`);
  });
}

function parseArgs(rest) {
  const args = { urls: [], files: [], domain: null, max: DEFAULT_MAX_URLS, date: null, output: null, install: false };
  const seenSingletons = new Set();

  for (let index = 0; index < rest.length; index++) {
    const flag = rest[index];
    const value = rest[index + 1];

    if (!flag.startsWith('--')) {
      fail(`Error: unexpected argument "${flag}". Run "node scripts/sitemap.js fetch help" for usage.`);
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
      fail(`Error: unknown option "${flag}". Run "node scripts/sitemap.js fetch help" for usage.`);
    }

    // `--install` is a bare flag. It neither takes a value nor consumes the next
    // word, and the boolean it sets is what consent receives. Round 5
    // found it named in the allowlist above with no branch here, so it fell into
    // the value-taking refusal below; round 6 found the branch written with an
    // `index++` that the `for` already performs, which skipped whatever followed
    // the flag. `continue` alone is the whole of it: the loop's own increment
    // moves to the next word, and the next word is not this flag's value.
    if (flag === '--install') {
      args.install = true;
      continue;
    }

    if (value === undefined || value.startsWith('--')) {
      fail(`Error: ${flag} needs a value. Run "node scripts/sitemap.js fetch help" for usage.`);
    }

    // SINGLETON FLAGS ARE REFUSED WHEN REPEATED, not silently last-won. Round 9,
    // Codex: `--date notadate --date 2026-09-03` exited 0 and the first value
    // vanished without a word, which is the Script Contract's own rule against
    // undisclosed dropped input. `--url` and `--file` are repeatable by design
    // and say so in the help; the other four are not.
    if (flag === '--url') args.urls.push(value);
    else if (flag === '--file') args.files.push(value);
    else if (SINGLETON_FLAGS.has(flag)) {
      const key = SINGLETON_FLAGS.get(flag);
      if (seenSingletons.has(flag)) {
        fail(`Error: ${flag} was given more than once. It takes a single value; passing two silently discards one. Run "node scripts/sitemap.js fetch help" for usage.`);
      }
      seenSingletons.add(flag);
      args[key] = value;
    }

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

  let snapshot;
  if (offline) {
    const paths = args.files.map((value) => screenSourceFile(value));
    const collected = collectFromFiles(paths, max);
    collected.urls.sort((a, b) => (a.loc < b.loc ? -1 : a.loc > b.loc ? 1 : 0));
    snapshot = finishSnapshot({ ...collected, host: domainFromUrls(collected.urls), date: args.date, seedFallback: paths, offline: true });
  } else {
    snapshot = await createSnapshot({ ...args, max }, globalThis.fetch, lookup, { gunzip: (bytes) => gunzipSync(bytes).toString('utf8') });
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
