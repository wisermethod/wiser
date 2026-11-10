/** Portable crawl engine. No Node imports, packages, disk or process access.
 * crawl(input, files, fetch, lookup) returns the complete hosted inventory.
 * The CLI supplies local options after its existing path and argument checks.
 */
import { destinationReason, destinationReasonText } from '../../lib/destination-core.js';
import { extractPage, hasNoindex } from './lib/html.js';
import { isDisallowed } from './lib/robots.js';
import { CrawlLimitError, HOSTED_CAPS, hostedTransport, validateHostedInput } from './lib/hosted.js';
export { CrawlLimitError } from './lib/hosted.js';

const TIMEOUT_MS = 15000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const HTML_TYPES = /html|xhtml/i;

export class UsageError extends Error {
  constructor(message) { super(message); this.name = 'UsageError'; }
}
function fail(message) { throw new UsageError(message); }
// Buffer.toString('utf8') preserves a leading BOM; keep the CLI's bytes.
const decodeBody = bytes => new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
export function resolveStart(raw) {
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

export async function screenHref(value, base, lookup) {
  let parsed;
  try {
    parsed = base ? new URL(value, base) : new URL(value);
  } catch {
    return { reason: 'is not a URL this tool can resolve' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { url: parsed, reason: `uses ${parsed.protocol}//, and this tool reads http and https only` };
  }
  if (lookup?.requireResolved && (parsed.username || parsed.password)) {
    throw new CrawlLimitError('Hosted crawl refused: URLs with an embedded username or password are not accepted.');
  }
  const destination = await destinationReason(parsed.hostname, lookup);
  lookup?.check?.();
  if (destination && (lookup?.requireResolved || destination !== 'unresolvable')) {
    return {
      url: parsed,
      reason: `points at ${destinationReasonText(destination)}, which this tool does not fetch`
    };
  }
  return { url: parsed };
}

export function normalizeUrl(href) {
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
  if (response.bodyBytes) return response.bodyBytes;
  if (response.body && typeof response.body.getReader === 'function') {
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = new Uint8Array(value);
      if (received + chunk.byteLength > maxBytes) {
        chunks.push(chunk.subarray(0, maxBytes - received));
        received = maxBytes;
        try { await reader.cancel(); } catch { /* already capped */ }
        break;
      }
      chunks.push(chunk);
      received += chunk.byteLength;
    }
    const bytes = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  }

  const buf = new Uint8Array(await response.arrayBuffer());
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

async function inventory(args, io, { startUrl, startHost, fetchedAt, sitemap }) {
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
      signal: io.signal ?? AbortSignal.timeout(TIMEOUT_MS),
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
          record = { unreachable: false, text: decodeBody(body), url: robotsUrl };
          break;
        }
        record = { unreachable: true, text: '', url: robotsUrl };
        break;
      }
    } catch (error) {
      if (error instanceof CrawlLimitError) throw error;
      record = { unreachable: true, text: '', url: robotsUrl };
    }

    if (!record) record = { unreachable: true, text: '', url: robotsUrl };
    robotsByOrigin.set(origin, record);
    return record;
  }

  async function robotsDecision(href) {
    const robots = await loadRobots(href);
    if (robots.unreachable) return { blocked: true, unreachable: true, url: robots.url };
    if (robots.text && isDisallowed(robots.text, href, args.userAgent, io.checkRobots)) {
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
      } catch (error) {
        if (error instanceof CrawlLimitError) throw error;
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
    io.check();
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
        body = decodeBody(await readCapped(response, MAX_BODY_BYTES));
      } catch (error) {
        if (error instanceof CrawlLimitError) throw error;
        errors.push({ url: item.url, reason: 'the body did not finish arriving' });
        pages.push(page);
        continue;
      }
      let extracted;
      try {
        extracted = extractPage(body);
      } catch (error) {
        if (error instanceof CrawlLimitError) throw error;
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
        io.check();
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
      } catch (error) {
        if (error instanceof CrawlLimitError) throw error;
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

  io.check();
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

  return result;
}

/** files is empty: sitemap paths and disk outputs belong to the CLI only.
 * lookup returns all A/AAAA answers, using at most two DNS requests per call.
 * The host remains responsible for the network connection's DNS rebinding gap.
 */
export async function crawl(input, files = [], fetch, lookup, options = {}) {
  const local = options.local === true;
  const transport = local ? null : hostedTransport(fetch, lookup, options);
  const io = {
    signal: transport?.signal,
    checkRobots: transport?.check,
    fetch: local ? fetch : transport.fetch,
    lookup: local ? lookup : transport.lookup,
    sleep: local ? options.sleep : transport.sleep,
    check: local ? () => {} : transport.check
  };
  try {
    const args = local ? input : validateHostedInput(input, files);
    io.check();
    let prepared = local ? options.prepared : null;
    if (!prepared) {
      const start = resolveStart(args.start);
      const screened = await screenHref(start.href, null, io.lookup);
      if (screened.reason) fail(`Error: --start ${start.href} ${screened.reason}.`);
      prepared = {
        startUrl: normalizeUrl(screened.url.href), startHost: screened.url.hostname.toLowerCase(),
        fetchedAt: (options.now ?? (() => new Date()))().toISOString(), sitemap: null
      };
    }
    const result = await inventory(args, io, prepared);
    io.check();
    if (!local && JSON.stringify(result).length >= HOSTED_CAPS.answerCharacters) {
      throw new CrawlLimitError('Hosted crawl refused: the complete answer must be under 48,000 serialized characters.');
    }
    io.check();
    return result;
  } finally { transport?.close(); }
}
