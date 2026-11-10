/** Hosted-only input and transport budgets. Web APIs only.
 * Host fetch returns normal Fetch responses (already decoded by Fetch when
 * applicable). Charge delivered bytes conservatively even for compressed HTTP.
 * Host lookup returns all A/AAAA answers and performs at most two DNS requests.
 * Two slots are reserved per lookup, and its returned address data is charged
 * to the same byte budgets. No DNS result authorizes a later HTTP connection:
 * every GET, including robots and redirects, resolves and screens again.
 */
import { destinationReason, destinationReasonText } from '../../../lib/destination-core.js';

export const HOSTED_CAPS = Object.freeze({
  inputBytes: 2048, maxPages: 10, maxDelayMs: 250, requests: 48,
  receivedBytes: 1024 * 1024, decodedBytes: 4 * 1024 * 1024,
  milliseconds: 15000, answerCharacters: 48000
});
export class CrawlLimitError extends Error {
  constructor(message) { super(message); this.name = 'UsageError'; }
}
const refuse = reason => { throw new CrawlLimitError(`Hosted crawl refused: ${reason}.`); };
const encoder = new TextEncoder();
const DEFAULT_USER_AGENT = 'wiser-site-crawl/0.1.0 (+https://github.com/wisermethod/wiser)';

export function validateHostedInput(input, files) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) refuse('arguments must be a JSON object');
  let serialized;
  try { serialized = JSON.stringify(input); } catch { refuse('arguments must be serializable JSON'); }
  if (encoder.encode(serialized).byteLength > HOSTED_CAPS.inputBytes) refuse('JSON arguments exceed 2 KiB');
  if (!Array.isArray(files) || files.length !== 0) refuse('crawl accepts no input files; sitemap files stay local');
  const allowed = new Set(['start', 'maxPages', 'maxDepth', 'delayMs', 'includeSubdomains', 'userAgent']);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) {
      if (['output', 'outputDir', 'sitemap', 'sitemapPath', '--output', '--sitemap'].includes(key)) {
        refuse('output paths and sitemap paths are local-only inputs');
      }
      refuse('unknown JSON argument');
    }
  }
  if (typeof input.start !== 'string' || !input.start) refuse('start must be an absolute http or https URL');
  let start;
  try { start = new URL(input.start); } catch { refuse('start must be an absolute http or https URL'); }
  if (!['http:', 'https:'].includes(start.protocol)) refuse('start must be an absolute http or https URL');
  if (start.username || start.password) refuse('URLs with an embedded username or password are not accepted');
  const number = (key, fallback, min, max) => {
    const value = input[key] === undefined ? fallback : input[key];
    if (!Number.isSafeInteger(value) || value < min || value > max) refuse(`${key} must be a whole number from ${min} to ${max}`);
    return value;
  };
  if (input.includeSubdomains !== undefined && typeof input.includeSubdomains !== 'boolean') refuse('includeSubdomains must be a boolean');
  if (input.userAgent !== undefined && (typeof input.userAgent !== 'string' || !input.userAgent.trim() || /[\x00-\x1f\x7f]/.test(input.userAgent))) {
    refuse('userAgent must be a nonempty HTTP header value');
  }
  return {
    start: input.start, maxPages: number('maxPages', HOSTED_CAPS.maxPages, 1, HOSTED_CAPS.maxPages),
    maxDepth: number('maxDepth', 5, 0, 20), delayMs: number('delayMs', 250, 0, HOSTED_CAPS.maxDelayMs),
    includeSubdomains: input.includeSubdomains ?? false, userAgent: input.userAgent ?? DEFAULT_USER_AGENT
  };
}

export function hostedTransport(fetch, lookup, { signal: parentSignal, clock = () => performance.now() } = {}) {
  if (typeof fetch !== 'function' || typeof lookup !== 'function') refuse('the host must supply fetch and an all-address DNS lookup');
  const started = clock();
  const controller = new AbortController();
  let fatal, requests = 0, received = 0, decoded = 0;
  const fail = reason => {
    fatal ??= new CrawlLimitError(`Hosted crawl refused: ${reason}.`);
    controller.abort(fatal);
    throw fatal;
  };
  const timeout = () => {
    fatal ??= new CrawlLimitError('Hosted crawl refused: the whole invocation exceeded 15 seconds.');
    controller.abort(fatal);
  };
  const onParentAbort = () => {
    fatal ??= new CrawlLimitError('Hosted crawl refused: the invocation was cancelled.');
    controller.abort(fatal);
  };
  const timer = setTimeout(timeout, HOSTED_CAPS.milliseconds);
  if (parentSignal?.aborted) onParentAbort();
  else parentSignal?.addEventListener('abort', onParentAbort, { once: true });
  function check() {
    if (fatal) throw fatal;
    if (clock() - started >= HOSTED_CAPS.milliseconds) { timeout(); throw fatal; }
  }
  // Race DNS, fetch, stream reads, cancellation and delays even if the host's
  // implementation ignores AbortSignal. Late fetch responses are cancelled.
  async function wait(operation) {
    check();
    const signal = controller.signal;
    let onAbort;
    try {
      return await new Promise((resolve, reject) => {
        onAbort = () => reject(fatal);
        signal.addEventListener('abort', onAbort, { once: true });
        Promise.resolve().then(() => { check(); return operation(); }).then(value => {
          if (signal.aborted) { Promise.resolve(value?.body?.cancel()).catch(() => {}); reject(fatal); }
          else { try { check(); resolve(value); } catch (error) { reject(error); } }
        }, reject);
      });
    } finally { signal.removeEventListener('abort', onAbort); }
  }
  function chargeRequests(count) {
    check();
    if (requests + count > HOSTED_CAPS.requests) fail('the 48-request budget, including DNS, robots.txt and redirects, would be exceeded');
    requests += count;
  }
  function chargeBytes(wire, expanded) {
    check();
    received += wire;
    decoded += expanded;
    if (received > HOSTED_CAPS.receivedBytes) fail('the invocation exceeded 1 MiB received');
    if (decoded > HOSTED_CAPS.decodedBytes) fail('the invocation exceeded 4 MiB decoded');
  }
  async function resolve(hostname) {
    chargeRequests(2); // All-address resolver: at most one A and one AAAA request.
    const addresses = await wait(() => lookup(hostname, { signal: controller.signal }));
    const bytes = encoder.encode(JSON.stringify(addresses) ?? 'null').byteLength;
    chargeBytes(bytes, bytes);
    return addresses;
  }
  const cached = new Map();
  const cachedLookup = async hostname => {
    check();
    if (!cached.has(hostname)) cached.set(hostname, await resolve(hostname));
    return cached.get(hostname);
  };
  cachedLookup.check = check;
  cachedLookup.requireResolved = true;
  async function screen(url) {
    if (!['http:', 'https:'].includes(url.protocol)) fail('only http and https destinations are accepted');
    if (url.username || url.password) fail('URLs with an embedded username or password are not accepted');
    const reason = await destinationReason(url.hostname, async hostname => {
      const addresses = await resolve(hostname);
      cached.set(hostname, addresses);
      return addresses;
    });
    check(); // The shared screen deliberately catches resolver errors.
    if (reason) fail(`a destination points at ${destinationReasonText(reason)}, which this tool does not fetch`);
  }
  async function bodyBytes(response) {
    const chunks = [];
    let total = 0;
    // A normal Fetch body is a stream. Refuse an opaque arrayBuffer-only host
    // adapter: it cannot enforce a streaming byte cap before allocating it.
    if (response.body === undefined) fail('the host must supply a streaming Fetch response');
    if (response.body === null) return new Uint8Array();
    if (typeof response.body.getReader !== 'function') fail('the host must supply a streaming Fetch response');
    const reader = response.body.getReader();
    let finished = false;
    try {
      for (;;) {
        const { done, value } = await wait(() => reader.read());
        if (done) { finished = true; break; }
        if (!(value instanceof Uint8Array)) fail('the host must supply byte streams');
        chargeBytes(value.byteLength, value.byteLength);
        chunks.push(value);
        total += value.byteLength;
      }
    } finally {
      if (!finished) Promise.resolve(reader.cancel()).catch(() => {});
      // A pending host read may still hold the lock after cancellation.
      try { reader.releaseLock(); } catch {}
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    // Charge text expansion too, including UTF-8 replacement characters. Raw
    // Fetch bytes already count toward decoded bytes, so charge only expansion.
    const textBytes = encoder.encode(new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes)).byteLength;
    chargeBytes(0, Math.max(0, textBytes - total));
    return bytes;
  }
  return {
    check, signal: controller.signal, lookup: cachedLookup,
    async sleep(ms) {
      let delay, onAbort;
      try {
        await wait(() => new Promise(resolveSleep => {
          delay = setTimeout(resolveSleep, ms);
          onAbort = () => { clearTimeout(delay); resolveSleep(); };
          controller.signal.addEventListener('abort', onAbort, { once: true });
        }));
      } finally {
        clearTimeout(delay);
        if (onAbort) controller.signal.removeEventListener('abort', onAbort);
      }
    },
    fetch: async (url, init) => {
      check();
      await screen(new URL(url));
      chargeRequests(1);
      const response = await wait(() => fetch(url, { ...init, signal: controller.signal, redirect: 'manual' }));
      // A host that auto-followed would bypass hop screening.
      if (response.redirected) { Promise.resolve(response.body?.cancel()).catch(() => {}); fail('the host fetch followed a redirect automatically'); }
      const length = response.headers?.get('content-length');
      if (length && /^\d+$/.test(length) && Number(length) > HOSTED_CAPS.receivedBytes - received) {
        Promise.resolve(response.body?.cancel()).catch(() => {});
        fail('the response Content-Length exceeds the remaining 1 MiB received budget');
      }
      const bytes = await bodyBytes(response);
      // Fetch may have decoded a compressed response. Count a larger declared
      // wire body as well; never use a small or dishonest length to discount it.
      if (length && /^\d+$/.test(length)) chargeBytes(Math.max(0, Number(length) - bytes.byteLength), 0);
      return { status: response.status, headers: response.headers, bodyBytes: bytes };
    },
    close() {
      clearTimeout(timer);
      parentSignal?.removeEventListener('abort', onParentAbort);
    }
  };
}
