/** Sitemap snapshot engine. No disk, process, package installation or Node imports.
 * Hosts supply fetch, an all-address DNS lookup and a gzip decoder.
 * Hosts may bound those capabilities without changing parsing or traversal.
 */
import { destinationReason, destinationReasonText } from '../../lib/destination-core.js';

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
export function snapshotInputProblem(args) {
  // A CALENDAR DATE, not a shape. Round 9: the regex accepted `2026-13-99`,
  // which then passed the install, passed main()'s identical test, and appeared
  // in a successful exit-0 JSON object. A pattern that only counts digits is
  // not a date check.
  if (args.date !== null) {
    if (!DATE_PATTERN.test(args.date)) {
      return `Error: --date must be YYYY-MM-DD; got "${args.date}".`;
    }
    const [y, m, d] = args.date.split('-').map(Number);
    const asDate = new Date(Date.UTC(y, m - 1, d));
    if (asDate.getUTCFullYear() !== y || asDate.getUTCMonth() !== m - 1 || asDate.getUTCDate() !== d) {
      return `Error: --date is not a real calendar date; got "${args.date}".`;
    }
  }
  // isSafeInteger, matching main() exactly. Round 9 found `isInteger` here and
  // `isSafeInteger` below -- drifted inside the function whose own comment says
  // the two cannot drift, which is the drift it was written to prevent.
  if (args.max !== DEFAULT_MAX_URLS) {
    const parsed = Number(args.max);
    if (!Number.isSafeInteger(parsed) || parsed < 1) {
      return `Error: --max must be a whole number of 1 or more; got "${args.max}".`;
    }
  }
  return null;
}

export class SnapshotInputError extends Error {}
function inputError(message) { throw new SnapshotInputError(message); }


/**
 * Host of the first parseable loc, or "local" when none carry one. Offline
 * snapshots have no discovery host to label them with.
 */
export function domainFromUrls(urls) {
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
export function recordUrlEntry(block, urlsByLoc, errors) {
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
export function publicUrl(value) {
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
async function screenTarget(value, base, lookup, requireResolved = false) {
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

  // The CLI keeps unresolved hosts as network failures. A hosted caller sets
  // requireResolved to refuse lookup failures before any target request.
  const destination = await destinationReason(parsed.hostname, lookup);

  if (destination && (requireResolved || destination !== 'unresolvable')) {
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
async function fetchText(url, fetch, screen, gunzip) {
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

      const screened = await screen(location, current.href);

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
      buffer = new Uint8Array(await response.arrayBuffer());
    } catch {
      return { reason: `HTTP ${response.status} but the body did not finish arriving` };
    }

    // Gzip by magic bytes or by extension, whatever the server labels it.
    if (buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
      try {
        return { text: await gunzip(buffer), url: current };
      } catch {
        return { reason: 'the body announced gzip but did not decompress' };
      }
    }

    if (current.pathname.endsWith('.gz')) {
      try {
        return { text: await gunzip(buffer), url: current };
      } catch {
        // A .gz name on a body that is not gzipped: read it as text.
      }
    }

    return { text: new TextDecoder().decode(buffer), url: current };
  }
}

export function tagValues(xml, tag) {
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
export function entryBlocks(xml, wrapper) {
  const pattern = new RegExp(`<${wrapper}(?:\\s[^>]*)?>([\\s\\S]*?)</${wrapper}\\s*>`, 'gi');
  const blocks = [];
  let match;

  while ((match = pattern.exec(xml)) !== null) blocks.push(match[1]);

  return blocks;
}

export function isIndex(xml) {
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
async function discoverSitemaps(robotsUrl, errors, fetch, screen, gunzip) {
  const declared = [];
  const robots = await fetchText(robotsUrl, fetch, screen, gunzip);

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
    const screened = await screen(candidate, robotsUrl.href);

    if (screened.reason) errors.push({ url: publicUrl(candidate), reason: `${screened.reason}; skipped` });
    else usable.set(screened.url.href, screened.url);
  }

  return [...usable.values()];
}

async function collect(seeds, max, fetch, screen, gunzip, check) {
  const urlsByLoc = new Map();
  const errors = [];
  const visited = new Set();
  const sitemaps = [];
  let truncated = false;

  async function walk(target, depth) {
    check();
    if (truncated || depth > MAX_INDEX_DEPTH) return;

    const href = target.href;
    if (visited.has(href)) return;
    visited.add(href);

    const result = await fetchText(target, fetch, screen, gunzip);

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
        check();
        if (truncated) break;
        const screened = await screen(child, href);

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
      check();
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


/** Network snapshot, with the same inputs and result as the CLI's fetch path. */
export async function createSnapshot({ domain = null, urls = [], max = DEFAULT_MAX_URLS, date = null } = {}, fetch, lookup, { gunzip, requireResolved = false, check = () => {} } = {}) {
  const screen = (value, base) => screenTarget(value, base, lookup, requireResolved);
  const args = { domain, urls, date, max };
  const problem = snapshotInputProblem(args);
  if (problem) inputError(problem);
  if (!domain && urls.length === 0) inputError('Error: fetch needs --domain <host>, at least one --url <sitemap url>, or at least one --file <path>. Run "node scripts/sitemap.js fetch help" for usage.');
  let errors, sitemaps, truncated, host, seedFallback;
  let collectedUrls;
  // An address the caller named is refused outright, because a run aimed
  // somewhere this tool will not go has no partial answer worth returning. An
  // address a fetched document names is skipped and recorded instead, which is
  // this tool's discipline for everything a site got wrong.
  const named = [];

  for (const value of args.urls) {
    const screened = await screen(value, null);
    if (screened.reason) inputError(`Error: --url ${printableUrl(value)} ${screened.reason}.`);
    named.push(screened.url);
  }

  host = args.domain ? hostFromDomain(args.domain) : named[0].host;

  if (!host) {
    inputError(`Error: --domain has no host in it; got "${args.domain}".`);
  }

  const discoveryErrors = [];
  let seeds = named;

  if (seeds.length === 0) {
    // Screened as the caller's own address, since discovery is the one path
    // that connects to the domain itself. Given --url, the domain only labels
    // the snapshot and nothing is requested from it.
    const screened = await screen(`https://${host}/robots.txt`, null);

    if (screened.reason) inputError(`Error: --domain "${args.domain}" ${screened.reason}.`);

    seeds = await discoverSitemaps(screened.url, discoveryErrors, fetch, screen, gunzip);
  }

  const collected = await collect(seeds, max, fetch, screen, gunzip, check);
  collectedUrls = collected.urls;
  errors = [...discoveryErrors, ...collected.errors];
  sitemaps = collected.sitemaps;
  truncated = collected.truncated;
  seedFallback = seeds.map((seed) => publicUrl(seed.href));

  // Stable ordering, so two runs of the same site diff cleanly.
  collectedUrls.sort((a, b) => (a.loc < b.loc ? -1 : a.loc > b.loc ? 1 : 0));
  return finishSnapshot({ host, date, urls: collectedUrls, errors, sitemaps, truncated, seedFallback });
}

export function finishSnapshot({ host, date, urls, errors, sitemaps, truncated, seedFallback, offline = false }) {
  const snapshot = {
    domain: host,
    fetchedAt: date || new Date().toISOString().slice(0, 10),
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

  return snapshot;
}
