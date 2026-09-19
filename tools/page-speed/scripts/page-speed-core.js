/**
 * page-speed - PageSpeed Insights v5 readings for one URL and one strategy
 *
 * Node built-ins only; nothing here imports from outside this tool directory.
 * The rules every shipped script follows are stated once, in
 * system/templates/Script Contract.md.
 */

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { destinationReason, destinationReasonText } from './lib/destination.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const TOOL_DIR = resolve(SCRIPT_DIR, '..');

const ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
const TIMEOUT_MS = 20000;
const STRATEGIES = new Set(['mobile', 'desktop']);
const CATEGORIES = new Set(['performance', 'accessibility', 'best-practices', 'seo']);
const LAB_AUDITS = [
  ['firstContentfulPaintMs', 'first-contentful-paint'],
  ['largestContentfulPaintMs', 'largest-contentful-paint'],
  ['cumulativeLayoutShift', 'cumulative-layout-shift'],
  ['totalBlockingTimeMs', 'total-blocking-time'],
  ['speedIndexMs', 'speed-index'],
  ['interactiveMs', 'interactive']
];
const FIELD_METRICS = [
  ['lcpMs', ['LARGEST_CONTENTFUL_PAINT_MS']],
  ['inpMs', ['INTERACTION_TO_NEXT_PAINT']],
  ['cls', ['CUMULATIVE_LAYOUT_SHIFT_SCORE']],
  ['fcpMs', ['FIRST_CONTENTFUL_PAINT_MS']],
  ['ttfbMs', ['TIME_TO_FIRST_BYTE', 'EXPERIMENTAL_TIME_TO_FIRST_BYTE']]
];

export const USAGE = `page-speed - PageSpeed Insights v5 readings for one URL and one strategy

Usage:
  node scripts/page-speed.js help
  node scripts/page-speed.js run --url <http or https url> --strategy <mobile|desktop>
    [--category performance|accessibility|best-practices|seo]
    [--env <absolute file>] [--audits] [--output <absolute dir>]

Commands:
  run              Fetch PageSpeed Insights v5 for one URL and one strategy
  help             Print this message

Options:
  --url <url>      Page to measure. http or https only. Required.
  --strategy <s>   mobile or desktop. Required; there is no default.
  --category <c>   performance, accessibility, best-practices, or seo.
                   Repeatable. Default: performance.
  --env <path>     Absolute file holding PAGESPEED_API_KEY=. Optional.
                   Absent, the request is sent with no key. The key never
                   appears in stdout, stderr, or the output file.
  --audits         Include lighthouseResult.audits verbatim.
  --output <dir>   Also write the result into this directory, an absolute
                   path outside this tool directory.
  --help, -h       Print this message

Lab and field data are different measurements and are kept apart. Absent field
data is neither zero nor a pass. Needs no package. Success prints one JSON
object to stdout; a bad option or a vendor failure goes to stderr with exit 1.`;

export class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}

function fail(message) {
  throw new UsageError(message);
}

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

function screenPath(name, value, { mustExist = false, asFile = false } = {}) {
  if (!isAbsolute(value)) {
    fail(`Error: ${name} must be an absolute path; got "${value}", which would resolve against whatever directory the caller happened to be in.`);
  }

  const resolved = canonical(name, value);
  const toolReal = canonical('this tool directory', TOOL_DIR);

  if (resolved === toolReal || resolved.startsWith(`${toolReal}${sep}`) || descendsFrom(resolved, toolReal)) {
    fail(`Error: ${name} resolves inside this tool directory (${toolReal}). Pass a path in a work directory in the owning root.`);
  }

  if (mustExist && !existsSync(resolved)) {
    fail(`Error: ${name} names a file that does not exist at ${resolved}. Resolve the Provides binding and pass that absolute path; this tool does not search for a configuration file.`);
  }

  if (mustExist) {
    let info;
    try {
      info = statSync(resolved);
    } catch (error) {
      fail(`Error: ${name} names a file that does not exist at ${resolved}. Resolve the Provides binding and pass that absolute path; this tool does not search for a configuration file.`);
    }
    if (asFile && !info.isFile()) {
      fail(`Error: ${name} names a file that does not exist at ${resolved}. Resolve the Provides binding and pass that absolute path; this tool does not search for a configuration file.`);
    }
  }

  return resolved;
}

function fileIdentity(path, io) {
  try {
    const info = io.statSync(path);
    return { dev: info.dev, ino: info.ino };
  } catch {
    return null;
  }
}

function sameIdentity(left, right) {
  return Boolean(left && right && left.dev === right.dev && left.ino === right.ino);
}

function pathSlug(pathname) {
  const raw = pathname === '' || pathname === '/'
    ? 'root'
    : pathname.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const slug = raw === '' ? 'root' : raw;
  return slug.slice(0, 60);
}

function outputFileName(target, strategy, day) {
  const host = target.hostname.replace(/[^A-Za-z0-9.-]/g, '-');
  return `page-speed-${host}-${pathSlug(target.pathname)}-${strategy}-${day}.json`;
}

function screenOutputFile(name, destPath, envPath, io) {
  const resolved = canonical(name, destPath);
  const toolReal = canonical('this tool directory', TOOL_DIR);

  if (resolved === toolReal || resolved.startsWith(`${toolReal}${sep}`) || descendsFrom(resolved, toolReal)) {
    fail(`Error: ${name} resolves inside this tool directory (${toolReal}). Pass a path in a work directory in the owning root.`);
  }

  const destId = fileIdentity(resolved, io);
  const refused = [];

  if (envPath) {
    const envResolved = canonical('--env', envPath);
    const envDir = dirname(envResolved);
    refused.push(fileIdentity(envResolved, io));
    const parentId = fileIdentity(dirname(resolved), io);
    const envDirId = fileIdentity(envDir, io);
    if (resolved === envResolved || sameIdentity(parentId, envDirId)) {
      fail(`Error: ${name} resolves to the --env file or a file in the directory that holds it. Pass a work directory in the owning root.`);
    }
    let names = [];
    try {
      names = io.readdirSync(envDir);
    } catch {
      names = [];
    }
    for (const entry of names) {
      refused.push(fileIdentity(join(envDir, entry), io));
    }
  }

  if (destId && refused.some((id) => sameIdentity(destId, id))) {
    fail(`Error: ${name} resolves to the --env file or a file in the directory that holds it. Pass a work directory in the owning root.`);
  }

  try {
    io.lstatSync(resolved);
    fail(`Error: --output file already exists at ${resolved}. This tool never overwrites; pass a different directory or remove the file.`);
  } catch (error) {
    if (error instanceof UsageError) throw error;
  }

  return resolved;
}

function parseArgs(argv) {
  const command = argv[0] ?? 'help';

  if (command === 'help' || argv.includes('--help') || argv.includes('-h')) {
    return { help: true };
  }

  if (command !== 'run') {
    fail(`Error: unknown command "${command}". Run "node scripts/page-speed.js help" for usage.`);
  }

  const VALUE_FLAGS = new Set(['--url', '--strategy', '--category', '--env', '--output']);
  const BARE_FLAGS = new Set(['--audits', '--help', '-h']);

  const valuePositions = new Set();
  for (let index = 1; index < argv.length; index += 1) {
    if (VALUE_FLAGS.has(argv[index])) valuePositions.add(index + 1);
  }

  for (let index = 1; index < argv.length; index += 1) {
    const option = argv[index];
    if (valuePositions.has(index)) continue;
    if (option.startsWith('-') && !VALUE_FLAGS.has(option) && !BARE_FLAGS.has(option)) {
      fail(`Error: unknown option "${option}". Run "node scripts/page-speed.js help" for usage.`);
    }
  }

  for (let index = 1; index < argv.length; index += 1) {
    if (valuePositions.has(index)) continue;
    if (!argv[index].startsWith('-')) {
      fail(`Error: unexpected argument "${argv[index]}". Every value belongs to an option here. Run "node scripts/page-speed.js help" for usage.`);
    }
  }

  function flag(name, { repeatable = false } = {}) {
    const indexes = [];
    for (let index = 1; index < argv.length; index += 1) {
      if (argv[index] === name) indexes.push(index);
    }
    if (indexes.length === 0) return undefined;
    if (!repeatable && indexes.length > 1) {
      fail(`Error: ${name} was given more than once and takes one value. Run "node scripts/page-speed.js help" for usage.`);
    }
    const values = [];
    for (const index of indexes) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) {
        fail(`Error: ${name} needs a value. Run "node scripts/page-speed.js help" for usage.`);
      }
      values.push(value);
    }
    return repeatable ? values : values[0];
  }

  function switchOn(name) {
    const indexes = [];
    for (let index = 1; index < argv.length; index += 1) {
      if (argv[index] === name) indexes.push(index);
    }
    if (indexes.length === 0) return false;
    if (indexes.length > 1) {
      fail(`Error: ${name} was given more than once. It is a switch, so repeating it says nothing new; pass it once. Run "node scripts/page-speed.js help" for usage.`);
    }
    return true;
  }

  const url = flag('--url');
  const strategy = flag('--strategy');
  const categories = flag('--category', { repeatable: true }) ?? ['performance'];
  const envPath = flag('--env');
  const outputDir = flag('--output');
  const audits = switchOn('--audits');

  if (!url) {
    fail('Error: --url is required. Run "node scripts/page-speed.js help" for usage.');
  }
  if (!strategy) {
    fail('Error: --strategy is required. Pass --strategy mobile or --strategy desktop; there is no default because they are different measurements.');
  }
  if (!STRATEGIES.has(strategy)) {
    fail(`Error: --strategy must be mobile or desktop; got "${strategy}".`);
  }
  for (const category of categories) {
    if (!CATEGORIES.has(category)) {
      fail(`Error: --category must be performance, accessibility, best-practices, or seo; got "${category}".`);
    }
  }

  return { help: false, url, strategy, categories, envPath, outputDir, audits };
}

function resolveTarget(raw) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    fail(`Error: --url is not a valid URL: "${raw}". Pass a page address such as https://example.com/pricing.`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    fail(`Error: --url must be http or https; got "${parsed.protocol}". This tool fetches web pages only.`);
  }
  return parsed;
}

async function screenUrl(target, lookup) {
  const destination = lookup
    ? await destinationReason(target.hostname, lookup)
    : await destinationReason(target.hostname);
  if (destination && destination !== 'unresolvable') {
    fail(`Error: --url ${target.href} points at ${destinationReasonText(destination)}, which this tool does not fetch.`);
  }
  return target;
}

function readApiKey(envPath, io) {
  const resolved = screenPath('--env', envPath, { mustExist: true, asFile: true });
  let text;
  try {
    text = io.readFileSync(resolved, 'utf8');
  } catch {
    fail(`Error: --env names a file that does not exist at ${resolved}. Resolve the Provides binding and pass that absolute path; this tool does not search for a configuration file.`);
  }

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^PAGESPEED_API_KEY\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[1];
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    if (value === '') {
      fail('Error: --env file does not set PAGESPEED_API_KEY. Add PAGESPEED_API_KEY=<value> to the file the Provides binding names.');
    }
    return value;
  }

  fail('Error: --env file does not set PAGESPEED_API_KEY. Add PAGESPEED_API_KEY=<value> to the file the Provides binding names.');
}

function buildRequestUrl(pageUrl, strategy, categories, apiKey) {
  const request = new URL(ENDPOINT);
  request.searchParams.set('url', pageUrl);
  request.searchParams.set('strategy', strategy);
  for (const category of categories) {
    request.searchParams.append('category', category);
  }
  if (apiKey) request.searchParams.set('key', apiKey);
  return request;
}

function redactedRequestUrl(request, apiKey) {
  const copy = new URL(request.href);
  if (apiKey) copy.searchParams.set('key', 'REDACTED');
  return copy.href;
}

function numericOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function interpretLab(lighthouse) {
  const lab = {
    performanceScore: null,
    firstContentfulPaintMs: null,
    largestContentfulPaintMs: null,
    cumulativeLayoutShift: null,
    totalBlockingTimeMs: null,
    speedIndexMs: null,
    interactiveMs: null
  };
  const labIssues = [];

  const performanceScore = numericOrNull(lighthouse?.categories?.performance?.score);
  lab.performanceScore = performanceScore;
  if (performanceScore === null) labIssues.push('performanceScore');

  const audits = lighthouse?.audits && typeof lighthouse.audits === 'object' ? lighthouse.audits : {};
  for (const [field, auditId] of LAB_AUDITS) {
    const value = numericOrNull(audits[auditId]?.numericValue);
    lab[field] = value;
    if (value === null) labIssues.push(field);
  }

  return { lab, labIssues };
}

function fieldPair(metrics, names) {
  for (const name of names) {
    const entry = metrics[name];
    if (!entry || typeof entry !== 'object') continue;
    const percentile = numericOrNull(entry.percentile);
    const category = typeof entry.category === 'string' ? entry.category : null;
    if (percentile === null && category === null) continue;
    return { percentile, category };
  }
  return null;
}

function interpretExperience(experience, missingReason) {
  const metrics = experience && typeof experience === 'object' ? experience.metrics : null;
  if (!metrics || typeof metrics !== 'object' || Object.keys(metrics).length === 0) {
    return { available: false, reason: missingReason };
  }

  const block = { available: true };
  const overall = experience.overall_category ?? experience.overallCategory;
  if (typeof overall === 'string') block.overallCategory = overall;

  for (const [field, names] of FIELD_METRICS) {
    const pair = fieldPair(metrics, names);
    if (pair) block[field] = pair;
  }

  return block;
}

function interpretCategories(lighthouse, requested) {
  const scores = {};
  const vendor = lighthouse?.categories && typeof lighthouse.categories === 'object'
    ? lighthouse.categories
    : {};
  for (const name of requested) {
    scores[name] = numericOrNull(vendor[name]?.score);
  }
  return scores;
}

function interpretResponse(payload, { url, strategy, categories, audits, requestUrl, fetchedAt }) {
  const lighthouse = payload && typeof payload === 'object' ? payload.lighthouseResult : null;
  if (!lighthouse || typeof lighthouse !== 'object') {
    fail(`Error: PageSpeed Insights returned HTTP 200 from ${ENDPOINT} without a lighthouseResult. Confirm the URL is publicly reachable, then re-run.`);
  }

  const { lab, labIssues } = interpretLab(lighthouse);
  const result = {
    url,
    finalUrl: typeof lighthouse.finalUrl === 'string'
      ? lighthouse.finalUrl
      : (typeof payload.id === 'string' ? payload.id : url),
    strategy,
    fetchedAt,
    lighthouseVersion: typeof lighthouse.lighthouseVersion === 'string' ? lighthouse.lighthouseVersion : null,
    requestUrl,
    lab,
    labIssues,
    field: {
      page: interpretExperience(
        payload.loadingExperience,
        'no field data for this page in the Chrome UX Report'
      ),
      origin: interpretExperience(
        payload.originLoadingExperience,
        'no field data for this origin in the Chrome UX Report'
      )
    },
    categories: interpretCategories(lighthouse, categories)
  };

  if (audits) {
    result.audits = lighthouse.audits && typeof lighthouse.audits === 'object' ? lighthouse.audits : {};
  }

  return result;
}

function assertKeyAbsent(apiKey, ...texts) {
  if (!apiKey) return;
  for (const text of texts) {
    if (typeof text === 'string' && text.includes(apiKey)) {
      fail('Error: refused to emit a result that contained the PageSpeed API key. The key never appears in stdout, stderr, or the output file.');
    }
  }
}

/**
 * Run the command. `deps.fetch` and `deps.lookup` are injectable so tests never
 * open a network connection. Help returns the usage string; a successful run
 * returns one JSON-serializable object; a usage or vendor failure throws
 * UsageError.
 */
export async function runPageSpeed(argv, deps = {}) {
  const io = {
    fetch: deps.fetch ?? globalThis.fetch.bind(globalThis),
    lookup: deps.lookup,
    now: deps.now ?? (() => new Date()),
    readFileSync: deps.readFileSync ?? readFileSync,
    writeFileSync: deps.writeFileSync ?? writeFileSync,
    mkdirSync: deps.mkdirSync ?? mkdirSync,
    existsSync: deps.existsSync ?? existsSync,
    statSync: deps.statSync ?? statSync,
    lstatSync: deps.lstatSync ?? lstatSync,
    readdirSync: deps.readdirSync ?? readdirSync
  };

  const args = parseArgs(argv);
  if (args.help) return USAGE;

  const target = await screenUrl(resolveTarget(args.url), io.lookup);
  const apiKey = args.envPath ? readApiKey(args.envPath, io) : null;
  const request = buildRequestUrl(target.href, args.strategy, args.categories, apiKey);
  const recorded = redactedRequestUrl(request, apiKey);
  const fetchedAt = io.now().toISOString();

  let outputFile = null;
  if (args.outputDir) {
    const outputDir = screenPath('--output', args.outputDir);
    const day = fetchedAt.slice(0, 10);
    outputFile = screenOutputFile(
      '--output',
      join(outputDir, outputFileName(target, args.strategy, day)),
      args.envPath,
      io
    );
  }

  let response;
  try {
    response = await io.fetch(request.href, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: 'application/json' }
    });
  } catch (error) {
    const reason = error && error.name === 'TimeoutError'
      ? `no response within ${TIMEOUT_MS / 1000} seconds`
      : 'the request did not complete';
    fail(`Error: could not fetch PageSpeed Insights for ${target.href}: ${reason}. Confirm this machine can reach ${ENDPOINT}, then re-run.`);
  }

  if (response.status === 429 || response.status === 403) {
    fail(`Error: PageSpeed Insights returned HTTP ${response.status} from ${ENDPOINT}. Pass --env with a PageSpeed API key.`);
  }
  if (!response.ok) {
    fail(`Error: PageSpeed Insights returned HTTP ${response.status} from ${ENDPOINT}. Confirm the URL is publicly reachable, then re-run.`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    fail(`Error: PageSpeed Insights returned HTTP ${response.status} from ${ENDPOINT} with a body that was not JSON. Confirm the URL is publicly reachable, then re-run.`);
  }

  const result = interpretResponse(payload, {
    url: target.href,
    strategy: args.strategy,
    categories: args.categories,
    audits: args.audits,
    requestUrl: recorded,
    fetchedAt
  });

  if (outputFile) {
    io.mkdirSync(dirname(outputFile), { recursive: true });
    try {
      io.lstatSync(outputFile);
      fail(`Error: --output file already exists at ${outputFile}. This tool never overwrites; pass a different directory or remove the file.`);
    } catch (error) {
      if (error instanceof UsageError) throw error;
    }
    const serialized = `${JSON.stringify(result, null, 2)}\n`;
    assertKeyAbsent(apiKey, serialized, recorded);
    io.writeFileSync(outputFile, serialized);
    result.file = outputFile;
  }

  const stdout = JSON.stringify(result);
  assertKeyAbsent(apiKey, stdout, recorded, result.file ?? '');
  return result;
}
