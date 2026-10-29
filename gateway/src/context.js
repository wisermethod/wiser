import { STATUS, StatusSignal, statusSignal, vendorErrorFrom } from './errors.js';
import { pickResponseHeaders } from './response-headers.js';
import { isAbsolute } from 'node:path';
import { OUTPUT_EXTENSIONS } from './file-output.js';
import { createMediaDownload, isCanonicalMediaHost } from './media-download.js';

const RELEASE_REQUEST_TIMEOUT_MS = 60_000;
const MAX_RELEASE_BYTES = 33_554_432;
const RELEASE_REDIRECTS = new Set([301, 302, 303, 307, 308]);

function releaseFetcher(releaseHosts, fetchImpl) {
  // DENIED is a gateway policy refusal, not invalid_arguments: the connector,
  // rather than the caller, chooses the release URL and the download budget.
  const denied = (reason) => statusSignal(STATUS.DENIED, { reason });
  function checkedURL(url) {
    let parsed;
    try { if (typeof url === 'string') parsed = new URL(url); } catch { /* refused below */ }
    if (!parsed || parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) {
      throw denied('release URL requires HTTPS without userinfo or a non-default port');
    }
    if (!releaseHosts.includes(parsed.hostname)) throw denied('release host not in manifest release_hosts');
    return parsed;
  }
  return async function fetchRelease(url, { maxBytes } = {}) {
    if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_RELEASE_BYTES) {
      throw denied('release maxBytes must be an integer from 1 to 33554432');
    }
    let current = checkedURL(url);
    for (let redirects = 0; ; redirects += 1) {
      const controller = new AbortController();
      const endpoint = `${current.origin}${current.pathname}`;
      const failure = (reason, http_status = null) => statusSignal(STATUS.VENDOR_ERROR, {
        endpoint, method: 'GET', http_status, reason,
      });
      let timer;
      let reader;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(failure('release request timed out'));
        }, RELEASE_REQUEST_TIMEOUT_MS);
      });
      try {
        const result = await Promise.race([timeout, (async () => {
          const res = await fetchImpl(current.href, {
            method: 'GET', headers: { accept: 'application/octet-stream' },
            credentials: 'omit', redirect: 'manual', signal: controller.signal,
          });
          if (RELEASE_REDIRECTS.has(res.status)) {
            if (redirects >= 3) throw denied('release redirect limit exceeded');
            const location = res.headers.get('location');
            let next;
            try { if (location) next = new URL(location, current).href; } catch { /* refused by checkedURL */ }
            return { next: checkedURL(next) };
          }
          if (res.status < 200 || res.status >= 300) throw failure('release HTTP error', res.status);
          const length = res.headers.get('content-length');
          if (length !== null && /^[0-9]+$/.test(length) && BigInt(length) > BigInt(maxBytes)) {
            throw denied('release content-length exceeds maxBytes');
          }
          const chunks = [];
          let total = 0;
          if (res.body) {
            reader = res.body.getReader();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              total += value.byteLength;
              if (total > maxBytes) throw denied('release body exceeds maxBytes');
              chunks.push(value);
            }
          }
          const bytes = new Uint8Array(total);
          let offset = 0;
          for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
          return { status: res.status, bytes, content_type: res.headers.get('content-type') };
        })()]);
        if (!result.next) return result;
        current = result.next;
      } catch (err) {
        if (err instanceof StatusSignal) throw err;
        throw failure('release transport error');
      } finally {
        clearTimeout(timer);
        controller.abort();
        // Do not let a cancellation hook hold a refused or timed-out call open.
        if (reader) { void reader.cancel().catch(() => {}); }
      }
    }
  };
}

/**
 * Build the ctx a module action receives. The module never sees a credential,
 * a provider client, or a catalog slug.
 *
 * @param {object} opts
 * @param {string} opts.service
 * @param {string} opts.module
 * @param {string} opts.action
 * @param {object} opts.input
 * @param {boolean} opts.confirm
 * @param {object} [opts.record]
 * @param {object} opts.auth
 * @param {object} [opts.authProvider]
 * @param {object} [opts.catalogProvider]
 * @param {string[]} [opts.releaseHosts]
 * @param {typeof fetch} [opts.fetchImpl]
 * @param {object} [opts.unwrap]
 * @param {string[]} [opts.responseHeaders] The action's manifest declaration.
 * @param {object} [opts.responseHeaderGuard] Private call-scoped address tracker.
 * @param {number} [opts.proxyBodyMaxBytes] The action's private proxy body budget.
 * @param {object} [opts.downloadMedia] The action's download_media declaration.
 * @param {object} [opts.outputFile] The action's output_file declaration.
 * @param {string} [opts.outputsDir] Explicit local destination, never from input.
 * @param {AbortSignal} [opts.executionSignal] Aborted when the action ends.
 * @param {() => void} [opts.onAudit]
 */
export function buildContext({
  service,
  module,
  action,
  input,
  confirm,
  record,
  auth,
  authProvider,
  catalogProvider,
  unwrap,
  responseHeaders,
  responseHeaderGuard,
  onAudit,
  releaseHosts,
  fetchImpl = globalThis.fetch,
  downloadMedia, outputFile, outputsDir, executionSignal, proxyBodyMaxBytes,
}) {
  const toolkit = auth?.toolkit;
  const providerAccountId = record?.provider_account_id ?? null;
  const declared = responseHeaders === undefined ? undefined : [...responseHeaders];

  function refuseAddress(value) {
    if (responseHeaderGuard?.holdsValue(value)) {
      throw statusSignal(STATUS.VENDOR_ERROR, { reason: 'output_refused', detail: responseHeaderGuard.detail });
    }
  }

  // Project only module request fields; neither identity nor the private budget
  // can be replaced by a field supplied by the module.
  function proxyRequest(req) {
    return {
      providerAccountId,
      toolkit,
      endpoint: req.endpoint,
      method: req.method || 'GET',
      body: req.body,
      binary_body: req.binary_body,
      parameters: req.parameters,
      ...(declared === undefined ? {} : { response_headers: [...declared] }),
    };
  }

  async function measureRequest(request) {
    try {
      const count = await authProvider.measureProxyBody(request);
      if (Number.isSafeInteger(count) && count >= 0) return count;
    } catch { /* Provider error text and request contents never escape. */ }
    throw statusSignal(STATUS.NEEDS_PROVIDER_CAPABILITY);
  }

  async function measureProxyBody(req = {}) {
    try {
      return await measureRequest(proxyRequest(req));
    } catch {
      throw statusSignal(STATUS.NEEDS_PROVIDER_CAPABILITY);
    }
  }

  async function proxy(req = {}) {
    if (!authProvider || typeof authProvider.proxy !== 'function') {
      throw statusSignal(STATUS.NEEDS_PROVIDER_CAPABILITY);
    }
    let request;
    try { request = proxyRequest(req); } catch (err) {
      if (proxyBodyMaxBytes !== undefined) throw statusSignal(STATUS.NEEDS_PROVIDER_CAPABILITY);
      throw err;
    }
    let res;
    if (proxyBodyMaxBytes === undefined) {
      res = await authProvider.proxy(request);
    } else {
      if (!Number.isSafeInteger(proxyBodyMaxBytes) || proxyBodyMaxBytes <= 0) {
        throw statusSignal(STATUS.NEEDS_PROVIDER_CAPABILITY);
      }
      const count = await measureRequest(request);
      if (count > proxyBodyMaxBytes) {
        throw statusSignal(STATUS.VENDOR_ERROR, { reason: 'proxy_body_too_large' });
      }
      res = await authProvider.proxy(request, { proxyBodyMaxBytes });
    }
    if (res && res.supported === false) {
      throw statusSignal(STATUS.NEEDS_PROVIDER_CAPABILITY);
    }
    if (res && res.error && res.error.code === 'vendor_error') {
      if (responseHeaderGuard?.holds(req.endpoint)) {
        // The request used an upload credential. Report only its URL path.
        let path;
        try { path = new URL(req.endpoint).pathname; } catch { path = String(req.endpoint).split(/[?#]/)[0]; }
        throw statusSignal(STATUS.VENDOR_ERROR, vendorErrorFrom({ ...res, error: { ...res.error, endpoint: path } }));
      }
      throw statusSignal(STATUS.VENDOR_ERROR, vendorErrorFrom(res));
    }
    if (res && typeof res === 'object') {
      const { headers, ...rest } = res;
      res = { ...rest, ...(declared === undefined ? {} : { headers: pickResponseHeaders(headers, declared) }) };
    }
    responseHeaderGuard?.remember(res?.headers);
    return res;
  }

  async function http(req = {}) {
    refuseAddress({ url: req.url, headers: req.headers, body: req.body });
    if (!unwrap || unwrap.supported !== true || !unwrap.header) {
      if (auth?.provider === 'local-file') {
        throw statusSignal(STATUS.NEEDS_CONNECT, {
          service,
          module,
          privilege: auth.privilege ?? null,
        });
      }
      throw statusSignal(STATUS.NEEDS_PROVIDER_CAPABILITY);
    }
    // The credential is attached here and nowhere else, so where it may travel is
    // decided here: HTTPS only, to a host the module's manifest allowlisted, and never
    // across a redirect the module did not ask for.
    let parsed;
    try { parsed = new URL(String(req.url)); } catch { parsed = null; }
    if (!parsed || parsed.protocol !== 'https:') {
      throw statusSignal(STATUS.DENIED, { rule: { effect: 'deny', reason: 'unwrap requires https' } });
    }
    const hosts = Array.isArray(auth?.hosts) ? auth.hosts : [];
    if (!hosts.includes(parsed.hostname)) {
      throw statusSignal(STATUS.DENIED, { rule: { effect: 'deny', reason: 'host not in manifest auth.hosts', host: parsed.hostname } });
    }
    const headers = { ...(req.headers || {}) };
    headers[unwrap.header] = unwrap.value;
    const method = req.method || 'GET';
    const url = parsed.toString();
    let body = req.body;
    const fetchHeaders = { ...headers };
    if (body != null && typeof body === 'object' && !Buffer.isBuffer(body) && !(body instanceof Uint8Array)) {
      if (!fetchHeaders['content-type'] && !fetchHeaders['Content-Type']) {
        fetchHeaders['content-type'] = 'application/json';
      }
      body = JSON.stringify(body);
    }
    const res = await fetch(url, { method, headers: fetchHeaders, body, redirect: 'manual' });
    if (res.status >= 300 && res.status < 400) {
      throw statusSignal(STATUS.VENDOR_ERROR, { http_status: res.status, endpoint: url, method, reason: 'redirect not followed' });
    }
    if (!res.ok) {
      throw statusSignal(STATUS.VENDOR_ERROR, {
        http_status: res.status,
        endpoint: url,
        method,
      });
    }
    const text = await res.text();
    let data = text;
    try { data = text ? JSON.parse(text) : null; } catch { /* keep text */ }
    return { status: res.status, data };
  }

  async function catalog(actionId, catalogInput) {
    const args = catalogInput ?? input ?? {};
    refuseAddress({ actionId, arguments: args });
    if (auth?.provider !== 'catalog' || !catalogProvider || typeof catalogProvider.execute !== 'function') {
      throw statusSignal(STATUS.NEEDS_PROVIDER_CAPABILITY);
    }
    const res = await catalogProvider.execute({
      actionId,
      userId: undefined,
      providerAccountId,
      arguments: args,
    });
    if (res && res.error && res.error.code === 'vendor_error') {
      throw statusSignal(STATUS.VENDOR_ERROR, vendorErrorFrom(res));
    }
    return res;
  }

  function audit(_note) {
    // The audit line is a closed field set (no input, output, header, or free text
    // a module might fill with a secret). The call is accepted and discarded.
    if (typeof onAudit === 'function') onAudit();
  }

  const canDownload = responseHeaders === undefined && typeof responseHeaderGuard?.rememberMediaUrl === 'function' &&
    typeof outputsDir === 'string' && isAbsolute(outputsDir) && executionSignal &&
    downloadMedia && Object.keys(downloadMedia).length === 1 && Array.isArray(downloadMedia.hosts) &&
    downloadMedia.hosts.length > 0 && downloadMedia.hosts.every(isCanonicalMediaHost) &&
    new Set(downloadMedia.hosts).size === downloadMedia.hosts.length &&
    outputFile && Object.keys(outputFile).length === 2 &&
    Object.keys(outputFile).every((key) => key === 'media_types' || key === 'max_bytes') && Array.isArray(outputFile.media_types) && outputFile.media_types.length > 0 &&
    outputFile.media_types.every((type) => Object.hasOwn(OUTPUT_EXTENSIONS, type)) &&
    new Set(outputFile.media_types).size === outputFile.media_types.length &&
    Number.isSafeInteger(outputFile.max_bytes) && outputFile.max_bytes > 0;
  return {
    service,
    module,
    action,
    input,
    confirm: Boolean(confirm),
    proxy,
    measureProxyBody,
    http,
    catalog,
    audit,
    ...(releaseHosts ? { fetchRelease: releaseFetcher([...releaseHosts], fetchImpl) } : {}),
    ...(canDownload ? { downloadMedia: createMediaDownload({
      hosts: [...downloadMedia.hosts], mediaTypes: [...outputFile.media_types], maxBytes: outputFile.max_bytes,
      signal: executionSignal, remember: (url) => responseHeaderGuard?.rememberMediaUrl(url),
    }) } : {}),
  };
}
