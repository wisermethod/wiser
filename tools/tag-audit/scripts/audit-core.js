/** Served-HTML audit engine. Hosts supply fetch and an all-address DNS lookup.
 * No Node imports, installation, environment or disk access.
 *
 * auditPage({ url }, fetch, lookup, options) screens the caller and every redirect.
 * requireResolved defaults to false for CLI compatibility; hosted callers can
 * require a usable public DNS answer. maxRedirects defaults to fetch's 20 hops.
 * The host owns deadlines through signal (the CLI supplies one 20-second signal).
 * maxBytes is null (uncapped) by default. With a positive integer byte cap, read
 * at most that many response-body bytes, probing once more on an exact fit.
 * Retain at most the capped prefix plus one chunk the host already produced;
 * the host's own stream queues are outside this bound. Cancel on excess and
 * append body_truncated: true only when bytes remain beyond the cap. Detection
 * and html_bytes then describe only that prefix; html_bytes keeps the CLI's
 * historical UTF-16 string length. Uncapped results have no extra field.
 */
import { destinationReason, destinationReasonText } from '../../lib/destination-core.js';

export class AuditError extends Error {}
const USER_AGENT = 'Mozilla/5.0 (compatible; tag-audit; instrumentation audit)';
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

// Detection patterns. Each tag is present when any of its patterns matches the
// served HTML; the first capturing match supplies the id, where one exists.
const DETECTORS = [
  {
    key: 'clarity',
    label: 'Microsoft Clarity',
    patterns: [
      /clarity\.ms\/tag\/([a-z0-9]+)/i,
      /["']clarity["']\s*,\s*["']script["']\s*,\s*["']([a-z0-9]+)["']/i
    ]
  },
  {
    key: 'ga4',
    label: 'Google Analytics 4',
    patterns: [
      /gtag\/js\?id=(G-[A-Z0-9]+)/i,
      /gtag\(\s*["']config["']\s*,\s*["'](G-[A-Z0-9]+)["']/i
    ]
  },
  {
    key: 'gtm',
    label: 'Google Tag Manager',
    patterns: [
      /gtm\.js\?id=(GTM-[A-Z0-9]+)/i,
      /(GTM-[A-Z0-9]+)/
    ]
  },
  {
    key: 'hotjar',
    label: 'Hotjar',
    patterns: [/hjid\s*[:=]\s*(\d+)/i, /static\.hotjar\.com/i]
  },
  {
    key: 'plausible',
    label: 'Plausible',
    patterns: [/plausible\.io\/js\/[^"']*/i]
  },
  {
    key: 'metaPixel',
    label: 'Meta Pixel',
    patterns: [/fbq\(\s*["']init["']\s*,\s*["'](\d+)["']/i, /connect\.facebook\.net\/[^"']*fbevents\.js/i]
  },
  {
    key: 'segment',
    label: 'Segment',
    patterns: [/cdn\.segment\.com\/analytics\.js\/v1\/([a-z0-9]+)/i, /cdn\.segment\.com/i]
  }
];

function detect(html) {
  const found = {};
  for (const detector of DETECTORS) {
    let present = false;
    let id = null;
    for (const pattern of detector.patterns) {
      const match = html.match(pattern);
      if (match) {
        present = true;
        if (match[1] && !id) id = match[1];
      }
    }
    found[detector.key] = { label: detector.label, present, id };
  }
  return found;
}


export function resolveTarget(raw) {
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  let parsed;
  try { parsed = new URL(candidate); }
  catch { throw new AuditError(`Error: --url is not a valid URL: "${raw}". Pass a page address such as https://example.com/pricing.`); }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new AuditError(`Error: --url must be http or https; got "${parsed.protocol}". This tool fetches web pages only.`);
  }
  return parsed;
}

function requestFailure(target, error, signal) {
  if (error instanceof AuditError) return error;
  const timedOut = signal?.aborted || error?.name === 'TimeoutError' || error?.name === 'AbortError';
  const reason = timedOut ? 'no response within 20 seconds' : 'the request did not complete';
  return new AuditError(`Error: could not fetch ${target.href}: ${reason}. Confirm the host is reachable from this machine, then re-run.`);
}

// DNS adapters need not support cancellation. Stop awaiting them on the run's
// one signal, and remove the listener even when a lookup never settles.
async function withSignal(operation, signal) {
  if (!signal) return operation();
  const aborted = () => signal.reason ?? Object.assign(new Error('Aborted'), { name: 'AbortError' });
  if (signal.aborted) throw aborted();
  let onAbort;
  try {
    return await new Promise((resolve, reject) => {
      onAbort = () => reject(aborted());
      signal.addEventListener('abort', onAbort, { once: true });
      Promise.resolve().then(operation).then(resolve, reject);
    });
  } finally { signal.removeEventListener('abort', onAbort); }
}

export async function screenDestination(target, lookup, requireResolved = false, signal) {
  let reason;
  try { reason = await withSignal(() => destinationReason(target.hostname, lookup), signal); }
  catch (error) { throw requestFailure(target, error, signal); }
  if (reason && (requireResolved || reason !== 'unresolvable')) {
    throw new AuditError(`Error: --url ${target.href} points at ${destinationReasonText(reason)}, which this tool does not fetch.`);
  }
  return target;
}

async function readHtml(response, maxBytes) {
  if (maxBytes === null) return { html: await response.text() };
  if (!response.body) return { html: '', body_truncated: false };
  const reader = response.body.getReader();
  // Fetch's response.text() always uses UTF-8 (including BOM removal and
  // replacement characters), regardless of the Content-Type charset.
  const decoder = new TextDecoder('utf-8');
  let html = '', bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return { html: html + decoder.decode(), body_truncated: false };
      const remaining = maxBytes - bytes;
      // An exact fit needs this next read: done means the whole body fit.
      // Otherwise the host has already produced one excess chunk; discard it.
      if (remaining === 0 || value.byteLength > remaining) {
        html += decoder.decode(value.subarray(0, remaining), { stream: true });
        try { await reader.cancel(); } catch {}
        return { html: html + decoder.decode(), body_truncated: true };
      }
      const chunk = value;
      bytes += chunk.byteLength;
      html += decoder.decode(chunk, { stream: true });
    }
  } finally { reader.releaseLock(); }
}

export async function auditPage({ url }, fetch, lookup, { requireResolved = false, maxRedirects = 20, maxBytes = null, signal } = {}) {
  if (!Number.isSafeInteger(maxRedirects) || maxRedirects < 0) throw new AuditError('Error: maxRedirects must be a non-negative safe integer.');
  if (maxBytes !== null && (!Number.isSafeInteger(maxBytes) || maxBytes < 1)) throw new AuditError('Error: maxBytes must be a positive safe integer or null.');
  const target = resolveTarget(url);
  let current = target, hops = 0, response, page;
  try {
    await screenDestination(target, lookup, requireResolved, signal);
    while (true) {
      response = await fetch(current.href, {
        redirect: 'manual', signal, headers: { 'User-Agent': USER_AGENT }
      });
      let location = REDIRECT_STATUSES.has(response.status) ? response.headers.get('location') : null;
      if (location === null) break;
      await response.body?.cancel();
      // Fetch follows at most 20 redirects. Keep its failure sentence at the
      // CLI boundary when the caller's limit is exceeded or Location is invalid.
      if (hops >= maxRedirects) throw new Error('Redirect limit');
      // Fetch repairs a non-encoded binary header as UTF-8 before URL parsing.
      // Uint8Array performs Buffer's binary-string low-byte conversion portably.
      if (/[^\x20-\x7e]/.test(location)) {
        location = new TextDecoder('utf-8', { ignoreBOM: true }).decode(
          Uint8Array.from({ length: location.length }, (_, index) => location.charCodeAt(index)));
      }
      const next = new URL(location, response.url || current.href);
      if (!location.includes('#')) next.hash = current.hash;
      if (next.protocol !== 'http:' && next.protocol !== 'https:') {
        throw new AuditError(`Error: the redirect to ${next.href} was not followed: it uses ${next.protocol}//, and this tool fetches http and https web pages only.`);
      }
      if (next.username || next.password) {
        // The address is printed with its credentials removed, so the refusal never writes them out.
        const shown = new URL(next.href);
        shown.username = '';
        shown.password = '';
        throw new AuditError(`Error: the redirect to ${shown.href} was not followed: it carries an embedded username or password, and this tool sends no credentials.`);
      }
      const reason = await withSignal(() => destinationReason(next.hostname, lookup), signal);
      if (reason && (requireResolved || reason !== 'unresolvable')) {
        throw new AuditError(`Error: the redirect to ${next.href} was not followed: it points at ${destinationReasonText(reason)}, which this tool does not fetch.`);
      }
      current = next;
      hops++;
    }
    page = await readHtml(response, maxBytes);
  } catch (error) {
    throw requestFailure(target, error, signal);
  }
  const finalUrl = response.url || current.href;
  if (response.status < 200 || response.status >= 300) {
    throw new AuditError(`Error: ${target.href} returned HTTP ${response.status} (landed on ${finalUrl}). Auditing an error page would report every tag absent, so this is a failure rather than a result.`);
  }
  const tags = detect(page.html);
  const entries = Object.values(tags);
  const present = entries.filter(tag => tag.present).map(tag => tag.label);
  const missing = entries.filter(tag => !tag.present).map(tag => tag.label);
  return {
    url: target.href,
    final_url: finalUrl,
    http_status: response.status,
    method: 'served-html',
    html_bytes: page.html.length,
    tags,
    summary: { present },
    missing_note: missing.length
      ? `Not detected in served HTML: ${missing.join(', ')}. A loader injected only after hydration will not appear here; confirm with a browser-driving tool before concluding one is absent.`
      : null,
    ...(maxBytes === null ? {} : { body_truncated: page.body_truncated })
  };
}
