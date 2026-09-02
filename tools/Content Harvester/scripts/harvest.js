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

// Node built-ins only. Nothing here may import from outside this tool directory.
import { execFileSync } from 'node:child_process';
import { accessSync, constants, existsSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const TOOL_DIR = resolve(SCRIPT_DIR, '..');

// Installed packages' own manifests. An interrupted install leaves
// node_modules/ behind with nothing in it, so the directory proves nothing.
const DEP_MARKERS = [
  join(TOOL_DIR, 'node_modules', 'fast-xml-parser', 'package.json'),
  join(TOOL_DIR, 'node_modules', 'undici', 'package.json')
];

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
  --help           Print this message

Success prints one JSON object to stdout. Errors go to stderr with exit 1.`;

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

// Arguments. Parsed first so help costs nothing: no install, no request file.
const argv = process.argv.slice(2);
const command = argv[0] ?? 'help';

if (command === 'help' || argv.includes('--help') || argv.includes('-h')) {
  process.stdout.write(`${USAGE}\n`);
  process.exit(0);
}

if (!COMMANDS.has(command)) {
  fail(`Error: unknown command "${command}". Run "node scripts/harvest.js help" for usage.`);
}

const VALUE_FLAGS = new Set(['--request', '--output']);
const BARE_FLAGS = new Set(['--dry-run', '--help', '-h']);

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

function flag(name) {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  const value = argv[index + 1];
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
const { loadRequest, sampleRequest, validateRequest } = await import('./lib/request.js');

const FEED_TYPES = new Set(['rss', 'substack_rss', 'reddit_rss']);
const DEFAULT_USER_AGENT = 'Content Harvester/0.1.0';
const DEFAULT_TIMEOUT_MS = 15000;

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

// Dependencies. Runs after every path screen above, so a run this tool must
// refuse is refused without an install, and before every package import below.
if (DEP_MARKERS.some((marker) => !existsSync(marker))) {
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
  const stillMissing = DEP_MARKERS.find((marker) => !existsSync(marker));
  if (stillMissing) {
    fail(`Error: npm ci finished but ${stillMissing} is still missing. Check that package.json lists every package this script imports.`);
  }
  fail('Dependencies installed. Re-run the command.');
}

// Proxy-mediated sandboxes set HTTPS_PROXY; Node fetch does not honor it alone.
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

// The packages import only below this line, and only dynamically. A static
// import would reach fast-xml-parser before the check above and crash instead
// of installing.
const { collectFeed } = await import('./adapters/rss.js');
const { collectManualUrls, collectUrl } = await import('./adapters/urls.js');
const { clusterCandidates, dedupeCandidates } = await import('./lib/dedupe.js');
const { filterCandidates } = await import('./lib/filter.js');
const { rankCandidates } = await import('./lib/rank.js');
const { writeArtifacts } = await import('./lib/render.js');

const context = {
  requestTopics: request.topics || [],
  discoveredAt: startedAt.toISOString(),
  userAgent: request.user_agent || DEFAULT_USER_AGENT,
  timeoutMs: Number(request.timeout_ms || DEFAULT_TIMEOUT_MS)
};

const collected = await collectSources(request, context);
const ranked = rankCandidates(collected.candidates, request);
const filtered = filterCandidates(ranked, request);
const clusters = clusterCandidates(filtered.accepted);
const deduped = dedupeCandidates(filtered.accepted);
const finishedAt = new Date();

const bundle = {
  schema_version: 1,
  run: {
    id: runId,
    name: request.name,
    consumer: request.consumer,
    timebox: request.timebox,
    topics: request.topics || []
  },
  candidates: deduped.accepted,
  clusters,
  rejected: [...collected.rejected, ...filtered.rejected, ...deduped.rejected],
  errors: collected.errors
};

const status = {
  ok: true,
  reason: 'completed',
  started_at: startedAt.toISOString(),
  finished_at: finishedAt.toISOString(),
  sources_requested: activeSources(request).length,
  sources_completed: collected.sourcesCompleted,
  sources_failed: collected.sourcesFailed,
  candidate_count: bundle.candidates.length,
  rejected_count: bundle.rejected.length,
  error_count: bundle.errors.length,
  output_directory: outputDirectory
};

let writtenDir;

try {
  writtenDir = writeArtifacts(bundle, status, outputDirectory, request.output || {});
} catch (error) {
  fail(`Error: could not write the bundle to ${outputDirectory}: ${error.code || 'write failed'}. Pass a writable work directory as --output.`);
}

process.stdout.write(`${JSON.stringify({
  ok: true,
  candidate_count: bundle.candidates.length,
  rejected_count: bundle.rejected.length,
  error_count: bundle.errors.length,
  output_directory: writtenDir
})}\n`);

async function collectSources(harvestRequest, runContext) {
  const candidates = [];
  const rejected = [];
  const errors = [];
  let sourcesCompleted = 0;
  let sourcesFailed = 0;

  for (const source of activeSources(harvestRequest)) {
    try {
      if (FEED_TYPES.has(source.type)) {
        candidates.push(...await collectFeed(source, runContext));
      } else if (source.type === 'url') {
        candidates.push(...await collectUrl(source, runContext));
      } else if (source.type === 'manual_urls') {
        const result = await collectManualUrls(source, runContext);
        candidates.push(...result.candidates);
        errors.push(...result.errors);
      } else {
        rejected.push({
          reason: 'unsupported_adapter_type',
          source: sourceLabel(source),
          adapter_type: source.type
        });
      }
      sourcesCompleted++;
    } catch (error) {
      sourcesFailed++;
      errors.push({
        source: sourceLabel(source),
        adapter_type: source.type,
        message: error.message,
        retryable: Boolean(error.retryable),
        ...(error.reason ? { reason: error.reason } : {})
      });
    }
  }

  return { candidates, rejected, errors, sourcesCompleted, sourcesFailed };
}

function activeSources(harvestRequest) {
  return (harvestRequest.sources || []).filter((source) => source.enabled !== false);
}

function sourceLabel(source) {
  return source.source || source.name || 'Unnamed source';
}

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
