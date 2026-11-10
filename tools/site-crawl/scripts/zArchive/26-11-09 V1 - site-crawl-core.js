/**
 * site-crawl - a bounded, polite crawl of one site
 *
 * Node built-ins only; nothing here imports from outside this tool directory.
 * The rules every shipped script follows are stated once, in
 * system/templates/Script Contract.md.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { destinationReason, destinationReasonText } from './lib/destination.js';
import { extractPage, hasNoindex } from './lib/html.js';
import { isDisallowed } from './lib/robots.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const TOOL_DIR = resolve(SCRIPT_DIR, '..');

const DEFAULT_MAX_PAGES = 200;
const DEFAULT_MAX_DEPTH = 5;
const DEFAULT_DELAY_MS = 250;
const MAX_PAGES_CEILING = 2000;
const MAX_DEPTH_CEILING = 20;
const TIMEOUT_MS = 15000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const DEFAULT_USER_AGENT = 'wiser-site-crawl/0.1.0 (+https://github.com/wisermethod/wiser)';
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const HTML_TYPES = /html|xhtml/i;

export const USAGE = `site-crawl - a bounded, polite crawl of one site

Usage:
  node scripts/site-crawl.js help
  node scripts/site-crawl.js crawl --start <http or https url> --output <absolute dir>
    [--max-pages N] [--max-depth N] [--delay-ms N]
    [--include-subdomains] [--sitemap <absolute snapshot json>]
    [--user-agent <string>]

Commands:
  crawl            Crawl from --start within the given bounds and write one JSON inventory
  help             Print this message

Options:
  --start <url>            First page. http or https only. Required.
  --output <dir>           Directory to write the inventory into, an absolute
                           path outside this tool directory. Required. The file
                           is named site-crawl-YYYY-MM-DD-<host>.json and is
                           refused if it already exists.
  --max-pages N            Stop after this many fetched pages. Whole number, 1 to 2000. Default 200.
  --max-depth N            Do not fetch pages deeper than this. Whole number, 0 to 20. Default 5.
  --delay-ms N             Sleep this many milliseconds between requests. Whole number, 0 or more. Default 250.
  --include-subdomains     Also follow hostnames that end in "." plus the start host.
  --sitemap <path>         Absolute path to a sitemap fetch snapshot JSON. Unreached
                           URLs are orphan candidates only.
  --user-agent <string>    User-Agent header. Default: ${DEFAULT_USER_AGENT}
  --help, -h               Print this message

Not a search-engine crawler: it follows links from one start URL within its
bounds, one request at a time. It never submits or mutates anything. A PDF is
inventoried unread. Success prints a summary JSON object to stdout; the full
object, including pages, is written to the output file.`;

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

  if (mustExist) {
    let info;
    try {
      info = statSync(resolved);
    } catch {
      fail(`Error: no file at ${resolved}. Pass an absolute path to a readable file.`);
    }
    if (asFile && !info.isFile()) {
      fail(`Error: ${name} ${resolved} is not a file.`);
    }
  }

  return resolved;
}

function integer(name, raw, fallback, { min, max } = {}) {
  if (raw === undefined) return fallback;
  if (!/^-?\d+$/.test(raw)) {
    fail(`Error: ${name} must be a whole number; got "${raw}".`);
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(parsed)) {
    fail(`Error: ${name} is too large to be exact; got "${raw}".`);
  }
  if (min !== undefined && parsed < min) {
    fail(`Error: ${name} must be ${min} or greater; got ${parsed}.`);
  }
  if (max !== undefined && parsed > max) {
    fail(`Error: ${name} must be ${max} or less; got ${parsed}.`);
  }
  return parsed;
}

function parseArgs(argv) {
  const command = argv[0] ?? 'help';

  if (command === 'help' || argv.includes('--help') || argv.includes('-h')) {
    return { help: true };
  }

  if (command !== 'crawl') {
    fail(`Error: unknown command "${command}". Run "node scripts/site-crawl.js help" for usage.`);
  }

  const VALUE_FLAGS = new Set([
    '--start', '--output', '--max-pages', '--max-depth', '--delay-ms',
    '--sitemap', '--user-agent'
  ]);
  const BARE_FLAGS = new Set(['--include-subdomains', '--help', '-h']);

  const valuePositions = new Set();
  for (let index = 1; index < argv.length; index += 1) {
    if (VALUE_FLAGS.has(argv[index])) valuePositions.add(index + 1);
  }

  for (let index = 1; index < argv.length; index += 1) {
    const option = argv[index];
    if (valuePositions.has(index)) continue;
    if (option.startsWith('-') && !VALUE_FLAGS.has(option) && !BARE_FLAGS.has(option)) {
      fail(`Error: unknown option "${option}". Run "node scripts/site-crawl.js help" for usage.`);
    }
  }

  for (let index = 1; index < argv.length; index += 1) {
    if (valuePositions.has(index)) continue;
    if (!argv[index].startsWith('-')) {
      fail(`Error: unexpected argument "${argv[index]}". Every value belongs to an option here. Run "node scripts/site-crawl.js help" for usage.`);
    }
  }

  function flag(name) {
    const indexes = [];
    for (let index = 1; index < argv.length; index += 1) {
      if (argv[index] === name) indexes.push(index);
    }
    if (indexes.length === 0) return undefined;
    if (indexes.length > 1) {
      fail(`Error: ${name} was given more than once and takes one value. Run "node scripts/site-crawl.js help" for usage.`);
    }
    const value = argv[indexes[0] + 1];
    if (value === undefined || value.startsWith('--')) {
      fail(`Error: ${name} needs a value. Run "node scripts/site-crawl.js help" for usage.`);
    }
    return value;
  }

  function switchOn(name) {
    const indexes = [];
    for (let index = 1; index < argv.length; index += 1) {
      if (argv[index] === name) indexes.push(index);
    }
    if (indexes.length === 0) return false;
    if (indexes.length > 1) {
      fail(`Error: ${name} was given more than once. It is a switch, so repeating it says nothing new; pass it once. Run "node scripts/site-crawl.js help" for usage.`);
    }
    return true;
  }

  const start = flag('--start');
  const outputDir = flag('--output');
  if (!start) fail('Error: --start is required. Run "node scripts/site-crawl.js help" for usage.');
  if (!outputDir) fail('Error: --output is required. Pass an absolute directory outside this tool directory.');

  return {
    help: false,
    start,
    outputDir,
    maxPages: integer('--max-pages', flag('--max-pages'), DEFAULT_MAX_PAGES, { min: 1, max: MAX_PAGES_CEILING }),
    maxDepth: integer('--max-depth', flag('--max-depth'), DEFAULT_MAX_DEPTH, { min: 0, max: MAX_DEPTH_CEILING }),
    delayMs: integer('--delay-ms', flag('--delay-ms'), DEFAULT_DELAY_MS, { min: 0 }),
    includeSubdomains: switchOn('--include-subdomains'),
    sitemapPath: flag('--sitemap'),
    userAgent: flag('--user-agent') ?? DEFAULT_USER_AGENT
  };
}

function resolveStart(raw) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    fail(`Error: --start is not a valid URL: "${raw}". Pass a page address such as https://example.com/.`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    fail(`Error: --start must be http or https; got "${parsed.protocol}". This tool fetches web pages only.`);
  }
  return parsed;
}

async function screenHref(value, base, lookup, flagName) {
  let parsed;
  try {
    parsed = base ? new URL(value, base) : new URL(value);
  } catch {
    return { reason: 'is not a URL this tool can resolve' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { url: parsed, reason: `uses ${parsed.protocol}//, and this tool reads http and https only` };
  }
  const destination = lookup
    ? await destinationReason(parsed.hostname, lookup)
    : await destinationReason(parsed.hostname);
  if (destination && destination !== 'unresolvable') {
    return {
      url: parsed,
      reason: `points at ${destinationReasonText(destination)}, which this tool does not fetch`
    };
  }
  return { url: parsed };
}

function normalizeUrl(href) {
  const parsed = new URL(href);
  parsed.hash = '';
  parsed.hostname = parsed.hostname.toLowerCase();
  if ((parsed.protocol === 'https:' && parsed.port === '443') || (parsed.protocol === 'http:' && parsed.port === '80')) {
    parsed.port = '';
  }
  return parsed.href;
}

function hostAllowed(hostname, startHost, includeSubdomains) {
  const host = String(hostname || '').toLowerCase();
  const origin = String(startHost || '').toLowerCase();
  if (host === origin) return true;
  if (!includeSubdomains) return false;
  return host.endsWith(`.${origin}`);
}

function headerValue(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === 'function') {
    const value = headers.get(name);
    return value == null ? null : value;
  }
  const direct = headers[name] ?? headers[name.toLowerCase()];
  return direct == null ? null : String(direct);
}

function isHtmlType(contentType) {
  if (!contentType || contentType.trim() === '') return true;
  return HTML_TYPES.test(contentType);
}

function isPdf(contentType, url) {
  if (contentType && /application\/pdf/i.test(contentType)) return true;
  try {
    return new URL(url).pathname.toLowerCase().endsWith('.pdf');
  } catch {
    return false;
  }
}

async function readCapped(response, maxBytes) {
  if (response.body && typeof response.body.getReader === 'function') {
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      if (received + chunk.byteLength > maxBytes) {
        chunks.push(chunk.subarray(0, maxBytes - received));
        received = maxBytes;
        try { await reader.cancel(); } catch { /* already capped */ }
        break;
      }
      chunks.push(chunk);
      received += chunk.byteLength;
    }
    return Buffer.concat(chunks, received);
  }

  const buf = Buffer.from(await response.arrayBuffer());
  return buf.byteLength > maxBytes ? buf.subarray(0, maxBytes) : buf;
}

function followableHref(raw, pageUrl) {
  const href = String(raw ?? '').trim();
  if (href === '' || href.startsWith('#')) return null;
  const lower = href.toLowerCase();
  if (lower.startsWith('mailto:') || lower.startsWith('tel:') || lower.startsWith('javascript:') || lower.startsWith('data:')) {
    return null;
  }
  let parsed;
  try {
    parsed = new URL(href, pageUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  parsed.hash = '';
  return parsed;
}

function emptyHtmlFields() {
  return {
    title: null,
    h1Count: null,
    hasMetaDescription: null,
    canonical: null,
    canonicalMatches: null,
    robotsMeta: null,
    noindex: false,
    lang: null,
    internalLinks: 0
  };
}

function canonicalMatches(canonical, pageUrl) {
  if (!canonical) return null;
  try {
    const resolved = new URL(canonical, pageUrl);
    resolved.hash = '';
    const page = new URL(pageUrl);
    page.hash = '';
    resolved.hostname = resolved.hostname.toLowerCase();
    page.hostname = page.hostname.toLowerCase();
    return resolved.href === page.href;
  } catch {
    return false;
  }
}

function readSitemapSnapshot(path, io) {
  const resolved = screenPath('--sitemap', path, { mustExist: true, asFile: true });
  let text;
  try {
    text = io.readFileSync(resolved, 'utf8');
  } catch {
    fail(`Error: could not read --sitemap ${resolved}. Confirm it is a readable file.`);
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail(`Error: the sitemap snapshot ${resolved} is not valid JSON.`);
  }
  if (!parsed || !Array.isArray(parsed.urls)) {
    fail(`Error: the sitemap snapshot ${resolved} carries no urls array.`);
  }
  const locs = [];
  for (const entry of parsed.urls) {
    if (entry && typeof entry.loc === 'string' && entry.loc !== '') locs.push(entry.loc);
  }
  return { snapshotFile: resolved, locs };
}

function sleepFn(ms) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

/**
 * Run the crawl. `deps.fetch`, `deps.lookup`, and `deps.sleep` are injectable
 * so tests never open a network connection and never wait on the polite delay.
 */
export async function runSiteCrawl(argv, deps = {}) {
  const io = {
    fetch: deps.fetch ?? globalThis.fetch.bind(globalThis),
    lookup: deps.lookup,
    now: deps.now ?? (() => new Date()),
    sleep: deps.sleep ?? sleepFn,
    readFileSync: deps.readFileSync ?? readFileSync,
    writeFileSync: deps.writeFileSync ?? writeFileSync,
    mkdirSync: deps.mkdirSync ?? mkdirSync,
    existsSync: deps.existsSync ?? existsSync,
    statSync: deps.statSync ?? statSync
  };

  const args = parseArgs(argv);
  if (args.help) return USAGE;

  const start = resolveStart(args.start);
  const screenedStart = await screenHref(start.href, null, io.lookup, '--start');
  if (screenedStart.reason) {
    fail(`Error: --start ${start.href} ${screenedStart.reason}.`);
  }
  const startUrl = normalizeUrl(screenedStart.url.href);
  const startHost = screenedStart.url.hostname.toLowerCase();

  const outputDir = screenPath('--output', args.outputDir);
  const fetchedAtDate = io.now();
  const fetchedAt = fetchedAtDate.toISOString();
  const day = fetchedAt.slice(0, 10);
  const hostStem = startHost.replace(/[^A-Za-z0-9.-]/g, '-');
  const outputFile = join(outputDir, `site-crawl-${day}-${hostStem}.json`);
  if (io.existsSync(outputFile)) {
    fail(`Error: --output file already exists at ${outputFile}. This tool never overwrites; pass a different directory or remove the file.`);
  }

  const sitemap = args.sitemapPath ? readSitemapSnapshot(args.sitemapPath, io) : null;

  const errors = [];
  const robotsBlocked = [];
  const pages = [];
  const seen = new Set();
  const renderingSuspected = [];
  const robotsByOrigin = new Map();
  let hitMaxPages = false;
  let hitMaxDepth = false;
  let requestCount = 0;

  async function request(url) {
    if (requestCount > 0 && args.delayMs > 0) await io.sleep(args.delayMs);
    requestCount += 1;
    return io.fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': args.userAgent, Accept: 'text/html,application/xhtml+xml,*/*' }
    });
  }

  function originOf(href) {
    return new URL(href).origin;
  }

  async function loadRobots(originHref) {
    const origin = originOf(originHref);
    if (robotsByOrigin.has(origin)) return robotsByOrigin.get(origin);

    const robotsUrl = new URL('/robots.txt', origin).href;
    const screened = await screenHref(robotsUrl, null, io.lookup);
    if (screened.reason) {
      const record = { unreachable: true, text: '', url: robotsUrl };
      robotsByOrigin.set(origin, record);
      return record;
    }

    let current = screened.url.href;
    let hops = 0;
    let record;
    try {
      while (hops <= MAX_REDIRECTS) {
        const response = await request(current);
        if (REDIRECT_STATUSES.has(response.status)) {
          hops += 1;
          const location = headerValue(response.headers, 'location');
          if (!location || hops > MAX_REDIRECTS) {
            record = { unreachable: true, text: '', url: robotsUrl };
            break;
          }
          const hop = await screenHref(location, current, io.lookup);
          if (hop.reason) {
            record = { unreachable: true, text: '', url: robotsUrl };
            break;
          }
          current = hop.url.href;
          continue;
        }
        if (response.status === 404 || response.status === 410) {
          record = { unreachable: false, text: '', url: robotsUrl };
          break;
        }
        if (response.status >= 200 && response.status < 300) {
          const body = await readCapped(response, MAX_BODY_BYTES);
          record = { unreachable: false, text: body.toString('utf8'), url: robotsUrl };
          break;
        }
        record = { unreachable: true, text: '', url: robotsUrl };
        break;
      }
    } catch {
      record = { unreachable: true, text: '', url: robotsUrl };
    }

    if (!record) record = { unreachable: true, text: '', url: robotsUrl };
    robotsByOrigin.set(origin, record);
    return record;
  }

  async function robotsDecision(href) {
    const robots = await loadRobots(href);
    if (robots.unreachable) return { blocked: true, unreachable: true, url: robots.url };
    if (robots.text && isDisallowed(robots.text, href, args.userAgent)) {
      return { blocked: true, unreachable: false, url: robots.url };
    }
    return { blocked: false, unreachable: false, url: robots.url };
  }

  const startRobots = await loadRobots(startUrl);
  if (startRobots.unreachable) {
    fail(`Error: robots.txt at ${startRobots.url} is unreachable. RFC 9309 section 2.3.1.4: an unreachable robots file means complete disallow. This tool stops rather than crawling a site that has disallowed everything.`);
  }

  const queue = [{ url: startUrl, depth: 0, discoveredFrom: null }];
  seen.add(startUrl);

  async function fetchChain(firstUrl) {
    const chain = [];
    let current = firstUrl;
    let hops = 0;
    let lastResponse = null;

    while (hops <= MAX_REDIRECTS) {
      const screenedCurrent = await screenHref(current, null, io.lookup);
      if (screenedCurrent.reason) {
        return { error: screenedCurrent.reason, chain, finalUrl: current, response: lastResponse };
      }

      const decision = await robotsDecision(current);
      if (decision.blocked) {
        return {
          robotsBlocked: true,
          robotsUnreachable: decision.unreachable,
          blockedUrl: current,
          chain,
          finalUrl: current,
          response: lastResponse
        };
      }

      let response;
      try {
        response = await request(current);
      } catch {
        return { error: `no response within ${TIMEOUT_MS / 1000} seconds, or the connection failed`, chain, finalUrl: current, response: lastResponse };
      }
      lastResponse = response;

      if (!REDIRECT_STATUSES.has(response.status)) {
        return { response, chain, finalUrl: current };
      }

      const location = headerValue(response.headers, 'location');
      if (!location) {
        return { error: `HTTP ${response.status} with no Location header`, chain, finalUrl: current, response };
      }

      hops += 1;
      if (hops > MAX_REDIRECTS) {
        chain.push({ from: current, to: location, status: response.status });
        return { error: `redirected more than ${MAX_REDIRECTS} times`, chain, finalUrl: current, response };
      }

      const hop = await screenHref(location, current, io.lookup);
      if (hop.reason) {
        chain.push({ from: current, to: location, status: response.status });
        return { error: hop.reason, chain, finalUrl: current, response };
      }
      if (!hostAllowed(hop.url.hostname, startHost, args.includeSubdomains)) {
        chain.push({ from: current, to: hop.url.href, status: response.status });
        return { error: 'redirectOffHost', chain, finalUrl: current, response };
      }

      const next = normalizeUrl(hop.url.href);
      const destDecision = await robotsDecision(next);
      if (destDecision.blocked) {
        chain.push({ from: current, to: next, status: response.status });
        seen.add(next);
        return {
          robotsBlocked: true,
          robotsUnreachable: destDecision.unreachable,
          blockedUrl: next,
          chain,
          finalUrl: current,
          response
        };
      }
      chain.push({ from: current, to: next, status: response.status });
      seen.add(next);
      current = next;
    }

    return { error: `redirected more than ${MAX_REDIRECTS} times`, chain, finalUrl: current, response: lastResponse };
  }

  while (queue.length > 0) {
    const item = queue.shift();

    if (item.depth > args.maxDepth) {
      hitMaxDepth = true;
      continue;
    }

    const queuedDecision = await robotsDecision(item.url);
    if (queuedDecision.blocked) {
      robotsBlocked.push(item.url);
      if (queuedDecision.unreachable) {
        errors.push({ url: item.url, reason: 'robots unreachable' });
      }
      continue;
    }

    if (pages.length >= args.maxPages) {
      hitMaxPages = true;
      continue;
    }

    const fetched = await fetchChain(item.url);
    if (fetched.robotsBlocked) {
      const blockedUrl = fetched.blockedUrl || fetched.finalUrl || item.url;
      robotsBlocked.push(blockedUrl);
      if (fetched.robotsUnreachable) {
        errors.push({ url: blockedUrl, reason: 'robots unreachable' });
      }
      if (!fetched.response) continue;
    }
    if (fetched.error && !fetched.response) {
      errors.push({ url: item.url, reason: fetched.error });
      continue;
    }
    if (fetched.error && fetched.error === 'redirectOffHost') {
      errors.push({ url: item.url, reason: 'redirectOffHost' });
    } else if (fetched.error) {
      errors.push({ url: item.url, reason: fetched.error });
    }

    const response = fetched.response;
    const finalUrl = fetched.finalUrl;
    const contentType = response ? headerValue(response.headers, 'content-type') : null;
    const lengthHeader = response ? headerValue(response.headers, 'content-length') : null;
    const contentLength = lengthHeader && /^\d+$/.test(lengthHeader) ? Number(lengthHeader) : null;
    const status = response ? response.status : 0;
    const pdf = isPdf(contentType, finalUrl);
    const html = response && isHtmlType(contentType) && !pdf;
    const xRobotsTag = response ? headerValue(response.headers, 'x-robots-tag') : null;

    const page = {
      url: item.url,
      finalUrl,
      status,
      redirectChain: fetched.chain,
      contentType,
      contentLength,
      pdf,
      ...emptyHtmlFields(),
      xRobotsTag,
      depth: item.depth,
      discoveredFrom: item.discoveredFrom
    };
    page.noindex = hasNoindex(null, null, xRobotsTag);

    if (html) {
      let body;
      try {
        body = (await readCapped(response, MAX_BODY_BYTES)).toString('utf8');
      } catch {
        errors.push({ url: item.url, reason: 'the body did not finish arriving' });
        pages.push(page);
        continue;
      }
      let extracted;
      try {
        extracted = extractPage(body);
      } catch {
        errors.push({ url: item.url, reason: 'the page could not be parsed' });
        pages.push(page);
        continue;
      }
      page.title = extracted.title;
      page.h1Count = extracted.h1Count;
      page.hasMetaDescription = extracted.hasMetaDescription;
      page.canonical = extracted.canonical ? (() => {
        try { return new URL(extracted.canonical, finalUrl).href; } catch { return extracted.canonical; }
      })() : null;
      page.canonicalMatches = canonicalMatches(page.canonical, finalUrl);
      page.robotsMeta = extracted.robotsMeta;
      page.noindex = hasNoindex(extracted.robotsMeta, extracted.googlebotMeta, xRobotsTag);
      page.lang = extracted.lang;

      if (!extracted.hasAnchorHref) renderingSuspected.push(finalUrl);

      let internal = 0;
      for (const href of extracted.hrefs) {
        const resolvedHref = followableHref(href, finalUrl);
        if (!resolvedHref) continue;
        if (!hostAllowed(resolvedHref.hostname, startHost, args.includeSubdomains)) continue;
        internal += 1;
        const normalized = normalizeUrl(resolvedHref.href);
        if (seen.has(normalized)) continue;
        seen.add(normalized);
        const screened = await screenHref(resolvedHref.href, null, io.lookup);
        if (screened.reason) {
          errors.push({ url: normalized, reason: screened.reason });
          continue;
        }
        const linkDecision = await robotsDecision(normalized);
        if (linkDecision.blocked) {
          robotsBlocked.push(normalized);
          if (linkDecision.unreachable) {
            errors.push({ url: normalized, reason: 'robots unreachable' });
          }
          continue;
        }
        const nextDepth = item.depth + 1;
        if (nextDepth > args.maxDepth) {
          hitMaxDepth = true;
          continue;
        }
        queue.push({ url: normalized, depth: nextDepth, discoveredFrom: item.url });
      }
      page.internalLinks = internal;
    } else if (response) {
      try {
        await readCapped(response, MAX_BODY_BYTES);
      } catch {
        errors.push({ url: item.url, reason: 'the body did not finish arriving' });
      }
    }

    pages.push(page);
  }

  if (queue.length > 0) {
    for (const leftover of queue) {
      if (leftover.depth > args.maxDepth) hitMaxDepth = true;
      else hitMaxPages = true;
    }
  }

  const noindexPages = pages.filter((page) => page.noindex).map((page) => page.url);
  const canonicalElsewhere = pages
    .filter((page) => page.canonical && page.canonicalMatches === false)
    .map((page) => page.url);
  const redirectChains = pages
    .filter((page) => page.redirectChain.length > 1)
    .map((page) => ({ url: page.url, chain: page.redirectChain }));

  const titles = new Map();
  for (const page of pages) {
    if (!page.title) continue;
    const list = titles.get(page.title) ?? [];
    list.push(page.url);
    titles.set(page.title, list);
  }
  const duplicateTitles = {};
  for (const [title, urls] of titles) {
    if (urls.length > 1) duplicateTitles[title] = urls;
  }

  const fetchedUrls = new Set();
  for (const page of pages) {
    fetchedUrls.add(normalizeUrl(page.url));
    try { fetchedUrls.add(normalizeUrl(page.finalUrl)); } catch { /* keep the requested url */ }
  }

  let sitemapBlock = null;
  if (sitemap) {
    const reached = [];
    const unreached = [];
    for (const loc of sitemap.locs) {
      let normalized;
      try { normalized = normalizeUrl(loc); } catch { normalized = loc; }
      if (fetchedUrls.has(normalized)) reached.push(loc);
      else unreached.push(loc);
    }
    sitemapBlock = {
      snapshotFile: sitemap.snapshotFile,
      sitemapUrls: sitemap.locs.length,
      reached,
      unreached
    };
  }

  const result = {
    start: startUrl,
    host: startHost,
    fetchedAt,
    bounds: { maxPages: args.maxPages, maxDepth: args.maxDepth },
    stoppedByBound: hitMaxPages || hitMaxDepth,
    reason: hitMaxPages ? 'max-pages' : (hitMaxDepth ? 'max-depth' : null),
    counts: {
      fetched: pages.length,
      html: pages.filter((page) => isHtmlType(page.contentType) && !page.pdf).length,
      nonHtml: pages.filter((page) => page.pdf || (page.contentType && !isHtmlType(page.contentType))).length,
      pdf: pages.filter((page) => page.pdf).length,
      redirectChains: redirectChains.length,
      non200: pages.filter((page) => page.status !== 200).length,
      noindex: noindexPages.length,
      canonicalElsewhere: canonicalElsewhere.length,
      robotsBlocked: robotsBlocked.length
    },
    pages,
    redirectChains,
    duplicateTitles,
    noindexPages,
    canonicalElsewhere,
    robotsBlocked,
    errors,
    sitemap: sitemapBlock,
    renderingSuspected
  };

  io.mkdirSync(outputDir, { recursive: true });
  if (io.existsSync(outputFile)) {
    fail(`Error: --output file already exists at ${outputFile}. This tool never overwrites; pass a different directory or remove the file.`);
  }
  io.writeFileSync(outputFile, `${JSON.stringify(result, null, 2)}\n`);

  const summary = { ...result, file: outputFile };
  delete summary.pages;
  return summary;
}
