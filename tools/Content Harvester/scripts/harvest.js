#!/usr/bin/env node
/**
 * Content Harvester - turns one harvest request into a candidate bundle.
 *
 * Usage:
 *   node scripts/harvest.js help
 *   node scripts/harvest.js sample
 *   node scripts/harvest.js validate --request <path>
 *   node scripts/harvest.js run --request <path> [--output <dir>] [--dry-run]
 *
 * The rules this file follows are stated once, in
 * system/templates/Script Contract.md.
 */

// Node built-ins, this tool's own files, and tools/lib/.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { accessSync, constants, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compiledEntry, isMain, packagesAvailable, packagesBundled } from '../../lib/one-file.js';

import { INSTALL_HELP, installQuestion, formatInstallSize, INSTALL_BYTES, installAuthorised, parsedInstallFlag, writeConsent } from '../../lib/consent.js';

const HERE = realpathSync(fileURLToPath(import.meta.url));
const SCRIPT_DIR = dirname(HERE);
const TOOL_DIR = resolve(SCRIPT_DIR, '..');

export async function main(argv = process.argv.slice(2)) {
// Installed packages' own manifests. An interrupted install leaves
// node_modules/ behind with nothing in it, so the directory proves nothing.
const XML_MARKER = join(TOOL_DIR, 'node_modules', 'fast-xml-parser', 'package.json');
const UNDICI_MARKER = join(TOOL_DIR, 'node_modules', 'undici', 'package.json');
const server = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy']
  .map(name => process.env[name]?.trim()).find(Boolean);
async function dependenciesAvailable() {
  if (!await packagesAvailable(XML_MARKER, () => import('./adapters/rss.js'), ['undici'])) return false;
  if (!server) return true;
  // undici is external even in a compiled file; check its real import.
  if (!existsSync(UNDICI_MARKER)) return false;
  try {
    const lock = JSON.parse(readFileSync(join(TOOL_DIR, 'package-lock.json')));
    if (JSON.parse(readFileSync(UNDICI_MARKER)).version !== lock.packages['node_modules/undici'].version) return false;
    await import('undici'); return true;
  } catch { return false; }
}

const COMMANDS = new Set(['run', 'validate', 'sample']);

const USAGE = `Content Harvester - turns one harvest request into a candidate bundle

Usage:
  node scripts/harvest.js help
  node scripts/harvest.js sample
  node scripts/harvest.js validate --request <path>
  node scripts/harvest.js run --request <path> [--output <dir>] [--dry-run]

Commands:
  run              Collect, rank, filter, deduplicate, and write the bundle
  validate         Check a request's structure; fetches nothing
  sample           Print a starter request to stdout
  help             Print this message

Options:
  --request <path> Harvest request JSON, absolute, outside this tool directory.
                   Required by run and validate.
  --output <dir>   Write the bundle here instead of the directory the request
                   names. Absolute, and must resolve outside this tool
                   directory.
  --dry-run        Validate and plan the run; fetch nothing, write nothing.
  --install          ${INSTALL_HELP}
                     WISER_ALLOW_INSTALL=1 does the same for an unattended run.
  --help, -h       Print this message

Success prints one JSON object to stdout. Errors go to stderr with exit 1.`;

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

// Arguments. Parsed first so help costs nothing: no install, no request file.
const command = argv[0] ?? 'help';

if (command === 'help' || argv.includes('--help') || argv.includes('-h')) {
  process.stdout.write(`${USAGE}\n`);
  process.exit(0);
}

if (command === 'run' && !argv.includes('--dry-run')) {
  const compiled = await compiledEntry(XML_MARKER, () => import('./adapters/rss.js'), import.meta.url, 'harvest', ['undici']);
  if (compiled) return (await import(compiled)).main(argv);
}

if (!COMMANDS.has(command)) {
  fail(`Error: unknown command "${command}". Run "node scripts/harvest.js help" for usage.`);
}

const VALUE_FLAGS = new Set(['--request', '--output']);
const BARE_FLAGS = new Set([
  '--install','--dry-run', '--help', '-h']);

// The position after each value flag belongs to that flag. A path that opens
// with a dash is a value, not a flag.
const valuePositions = new Set();
for (let index = 1; index < argv.length; index += 1) {
  if (VALUE_FLAGS.has(argv[index])) valuePositions.add(index + 1);
}

// An unrecognized flag is refused rather than ignored: a silently dropped
// option returns a bundle that looks finished and is not what was asked for.
for (let index = 1; index < argv.length; index += 1) {
  const option = argv[index];
  if (valuePositions.has(index)) continue;
  if (option.startsWith('-') && !VALUE_FLAGS.has(option) && !BARE_FLAGS.has(option)) {
    fail(`Error: unknown option "${option}". Run "node scripts/harvest.js help" for usage.`);
  }
}

const install = parsedInstallFlag(argv, VALUE_FLAGS);

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
    fail(`Error: ${name} was given more than once and takes one value. Run "node scripts/harvest.js help" for usage.`);
  }
  if (value === undefined || value.startsWith('--')) {
    fail(`Error: ${name} needs a value. Run "node scripts/harvest.js help" for usage.`);
  }
  return value;
}

const dryRun = argv.includes('--dry-run');

/**
 * The canonical form of a path, following symbolic links wherever the path
 * exists. Resolving a name is not opening the file it names, so this runs
 * before anything is read, installed, fetched, or written.
 *
 * `resolve` normalizes lexically and follows nothing on disk, so a symbolic
 * link, a link in any parent component, and a relative spelling are three
 * strings a lexical comparison does not match. The output directory does not
 * exist yet, so a path whose leaf is absent is canonicalized through the
 * deepest ancestor that does exist and the missing components joined back on: a
 * symbolic link standing in for any ancestor cannot hide where the bundle
 * lands.
 *
 * Absence is the only reason to keep walking. Any other refusal from the
 * filesystem, an unreadable ancestor or a loop of symbolic links, means the
 * real path cannot be known, and a screen that cannot know where a write lands
 * refuses rather than falling back to comparing the caller's spelling.
 */
function canonical(label, candidate) {
  const absolute = resolve(candidate);
  const missing = [];
  let head = absolute;

  for (;;) {
    try {
      const real = realpathSync(head);
      return missing.length === 0 ? real : join(real, ...missing);
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') {
        fail(`Error: ${label} could not be resolved to a real path at ${head}. Confirm every folder on the way is readable by this account and that no symbolic link on it points at itself.`);
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
 * directory, and the name test alone let a whole bundle be written into this
 * directory. Device and inode are a directory's own identity, which no spelling
 * reaches, so every existing ancestor of `target` is compared that way as well.
 * A directory that does not exist yet has no inode of its own, which is why the
 * walk climbs to the deepest ancestor that does: that ancestor is where the
 * write lands.
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

// A path the caller named on the command line, resolved once and returned, so
// that what is opened or written below is the path this cleared rather than the
// spelling the caller used.
function callerPath(name, value) {
  if (!isAbsolute(value)) {
    fail(`Error: ${name} must be absolute; got "${value}". A relative path resolves against whichever directory the caller happened to be in.`);
  }
  const target = canonical(name, value);
  if (insideToolDirectory(target)) {
    fail(`Error: ${name} resolves inside this tool directory (${canonical('this tool directory', TOOL_DIR)}). Scripts read and write only in a work directory in the owning root; pass that path instead.`);
  }
  return target;
}

// request.js imports Node built-ins and nothing else, so it loads above the
// dependency check. That ordering is the point: every path screen below has to
// run before the first-run install, or a caller who names this tool's own
// directory pays for an install and only then gets refused. It is dynamic for
// symmetry with the imports below, which cannot be static.
const { sampleRequest, validateRequest } = await import('./lib/request.js');
const { loadRequest } = await import('./lib/request-cli.js');

if (command === 'sample') {
  process.stdout.write(`${JSON.stringify(sampleRequest(), null, 2)}\n`);
  process.exit(0);
}

const requestPathArg = flag('--request');

if (!requestPathArg) {
  fail(`Error: --request is required for ${command}. Run "node scripts/harvest.js help" for usage.`);
}

// Screened before the file is opened, and loadRequest is handed the screened
// path rather than the caller's spelling.
const { request, requestPath } = loadRequest(callerPath('--request', requestPathArg), fail);
const problems = validateRequest(request);

if (problems.length > 0) {
  fail(`Error: ${requestPath} is not a valid harvest request:\n- ${problems.join('\n- ')}`);
}

if (command === 'validate') {
  process.stdout.write(`${JSON.stringify({ ok: true, name: request.name, sources: activeSources(request).length })}\n`);
  process.exit(0);
}

// run.
const startedAt = new Date();
const runId = startedAt.toISOString().replace(/[:.]/g, '-');
// Canonicalized, and this value is what writeArtifacts is handed below, so the
// directory that gets created is the one this screen cleared. Comparing
// resolved strings alone refused only the direct spelling, which left a case
// variant and a symlinked ancestor writing the bundle into the very directory
// the refusal names.
const outputDirectory = canonical('the output directory', join(resolveOutputBase(), runId));

if (insideToolDirectory(outputDirectory)) {
  fail(`Error: the output directory resolves inside this tool directory (${canonical('this tool directory', TOOL_DIR)}). Scripts write only to a work directory in the owning root; pass that path as --output, or set output.directory in the request to a path outside this directory.`);
}

// A dry run fetches nothing and writes nothing, so it answers here, above the
// install, on a copy that has never had one.
if (dryRun) {
  process.stdout.write(`${JSON.stringify({
    ok: true,
    dry_run: true,
    request: request.name,
    sources_requested: activeSources(request).length,
    output_directory: outputDirectory
  })}\n`);
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
// Whether THIS RUN will ask for a browser, which is what the consent report has
// to describe. A tool that CAN drive a browser is not the same as a run that
// WILL: `deck-export scaffold` and `web-screenshot check` are both commands of
// browser tools that fetch none.
const WILL_FETCH_BROWSER = false;

const proxyOnly = packagesBundled() || await packagesAvailable(XML_MARKER, () => import('./adapters/rss.js'), ['undici']);

function installPlan() {
  let names = [];
  try {
    names = Object.keys(JSON.parse(readFileSync(join(TOOL_DIR, 'package.json'), 'utf8')).dependencies || {});
  } catch { /* the report degrades to a generic list; the refusal still stands */ }
  if (proxyOnly) names = ['undici'];
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
  if (installAuthorised(HERE, install)) {
    writeConsent(HERE, 'Content Harvester', install);
    return;
  }
  if (what === 'browser') {
    fail(
      `${installQuestion('a private copy of the Chromium browser', "gather and rank sources from the feeds and pages you name", formatInstallSize(INSTALL_BYTES.chromium))}\n\nDetails for the assistant: this tool's packages are installed but the Chromium build they drive is not, and this person has not authorised a Wiser install. Installing fetches that build from cdn.playwright.dev, or playwright.download.prss.microsoft.com when Playwright falls back, several hundred megabytes, into wherever Playwright keeps browser builds on this machine. No package is fetched and npm is not run. tools/AGENTS.md lists every write an install makes and names where the build lands. Re-run the same command with --install to authorise it, or set WISER_ALLOW_INSTALL=1 for an unattended run. Nothing is read from stdin, so this is the only way to answer.`
    );
  }
  const { list, hosts, size } = installPlan();
  fail(
    `${installQuestion(proxyOnly ? "undici" : "a feed reader and a small web-request library", proxyOnly ? "use the selected proxy" : "gather and rank sources from the feeds and pages you name", formatInstallSize(proxyOnly ? INSTALL_BYTES.request : INSTALL_BYTES.harvester))}\n\nDetails for the assistant: this tool is not installed yet and this person has not authorised a Wiser install. Installing fetches ${list} from ${hosts} into ${TOOL_DIR}, and npm writes its own cache outside this plugin.${size} tools/AGENTS.md lists every write an install makes. Re-run the same command with --install to authorise it, or set WISER_ALLOW_INSTALL=1 for an unattended run. Nothing is read from stdin, so this is the only way to answer.`
  );
}

// The compiled parser needs only the external proxy package. A reduced lockfile
// keeps npm ci's integrity checks without fetching the already-bundled parser or
// changing this tool's shipped manifest and lockfile.
function installProxy(npm) {
  const lock = JSON.parse(readFileSync(join(TOOL_DIR, 'package-lock.json')));
  const locked = lock.packages['node_modules/undici'];
  if (!locked?.version || !locked.integrity || Object.keys(locked.dependencies || {}).length) {
    throw new Error('The proxy package lock must pin undici with no dependencies.');
  }
  const scratch = mkdtempSync(join(tmpdir(), 'wiser-harvester-proxy-'));
  try {
    const manifest = { name: 'wiser-harvester-proxy', version: '1.0.0', private: true, dependencies: { undici: locked.version } };
    writeFileSync(join(scratch, 'package.json'), JSON.stringify(manifest));
    writeFileSync(join(scratch, 'package-lock.json'), JSON.stringify({ name: manifest.name, version: manifest.version, lockfileVersion: 3, requires: true, packages: { '': manifest, 'node_modules/undici': locked } }));
    execFileSync(npm, ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: scratch, stdio: ['ignore', 'ignore', 'inherit'] });
    mkdirSync(join(TOOL_DIR, 'node_modules'), { recursive: true });
    rmSync(join(TOOL_DIR, 'node_modules/undici'), { recursive: true, force: true });
    cpSync(join(scratch, 'node_modules/undici'), join(TOOL_DIR, 'node_modules/undici'), { recursive: true });
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}

// Dependencies. Runs after every path screen above, so a run this tool must
// refuse is refused without an install, and before every package import below.

if (!await dependenciesAvailable()) {
  requireInstallConsent('packages');
  process.stderr.write(proxyOnly
    ? 'First run: installing dependencies in a temporary directory; copying undici into this tool directory.\n'
    : 'First run: installing dependencies in this tool directory.\n');
  try {
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    // stderr only: npm output on stdout would break the empty-stdout-on-failure rule.
    if (proxyOnly) installProxy(npm);
    else execFileSync(npm, ['ci'], { cwd: TOOL_DIR, stdio: ['ignore', 'ignore', 'inherit'] });
  } catch (error) {
    if (proxyOnly) {
      // npm inherits stderr above, so its own error precedes this explanation.
      fail(`Error: the temporary undici install failed: ${error.message}. This tool's package.json and package-lock.json were left unchanged. Fix the reported cause and retry the same command.`);
    }
    // Two different failures arrive here and they have different fixes, so the
    // Script Contract's Output and errors clause requires telling them apart:
    // an unwritable tool directory is not a broken install, and telling someone
    // to run "npm ci" by hand where they cannot write cannot succeed.
    if (!isWritable(TOOL_DIR)) {
      fail(`Error: cannot install dependencies because ${TOOL_DIR} is not writable. This tool installs its dependencies into its own directory on the run that authorises it with --install, so that directory has to be writable. Install this plugin somewhere you own, or make that directory writable, then run the command again.`);
    }
    fail(`Error: npm ci failed in ${TOOL_DIR}. Confirm Node 18 or newer, then that package-lock.json is present and matches package.json, which is what npm ci requires and will not resolve around. Delete node_modules there and run "npm ci" by hand to see npm's own message. A lockfile that is missing or out of step with the manifest is a defect in this copy of the plugin, not something a re-run fixes.`);
  }
  if (!await dependenciesAvailable()) {
    fail('Error: npm ci finished but the required packages do not load. Restore this plugin copy and run again.');
  }
}

// Node fetch needs an external dispatcher only for the selected proxy.
if (server) {
  const undici = await import('undici');
  if (typeof undici.setGlobalDispatcher !== 'function' || typeof undici.ProxyAgent !== 'function') {
    fail('Error: the installed undici cannot configure the selected proxy. Restore this tool’s dependencies with npm ci.');
  }
  try { undici.setGlobalDispatcher(new undici.ProxyAgent(server)); }
  catch { fail('Error: the installed undici cannot configure the selected proxy. Restore this tool’s dependencies with npm ci.'); }
}

try {
  const { harvest } = await import('./harvest-core.js');
  const { readZip } = await import('../../lib/archive-core.js');
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const dns = await import('node:dns');
  const result = await harvest({command:'run', request, outputDirectory}, [], globalThis.fetch,
    host => dns.promises.lookup(host, {all:true, verbatim:true}), {
      startedAt, hashId:value => createHash('sha256').update(value).digest('hex').slice(0, 16)
    });
  const files = await readZip(result.files[0].bytes, {maxBytes:4 * 1024 * 1024});
  mkdirSync(outputDirectory, {recursive:true});
  for (const file of files) writeFileSync(join(outputDirectory, file.name), file.bytes);
  process.stdout.write(`${JSON.stringify(result.answer)}\n`);
} catch (error) {
  fail(error.fatal || error.message.startsWith('ZIP refused:') ? error.message : `Error: could not write the bundle to ${outputDirectory}: ${error.code || 'write failed'}. Pass a writable work directory as --output.`);
}

function activeSources(harvestRequest) { return (harvestRequest.sources || []).filter(source => source.enabled !== false); }
function resolveOutputBase() {
  // A flag the caller typed, so it is held to the same absoluteness the help
  // text states and screened before it is joined with anything.
  const override = flag('--output');
  if (override) return callerPath('--output', override);

  // output.directory is a field in the caller's own request file and is
  // documented as relative to it, so it resolves against the request's
  // canonical directory rather than against the current one. The joined result
  // is screened by the caller of this function.
  const declared = request.output?.directory;
  if (!declared) return join(dirname(requestPath), 'generated_output', request.name);

  return resolve(dirname(requestPath), declared);
}

}

if (isMain(import.meta.url)) {
  if (HERE !== fileURLToPath(import.meta.url)) await import(pathToFileURL(HERE).href);
  else await main();
}
