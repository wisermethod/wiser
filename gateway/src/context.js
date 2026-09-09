import { STATUS, statusSignal, vendorErrorFrom } from './errors.js';

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
 * @param {object} [opts.unwrap]
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
  onAudit,
}) {
  const toolkit = auth?.toolkit;
  const providerAccountId = record?.provider_account_id ?? null;

  async function proxy(req = {}) {
    if (!authProvider || typeof authProvider.proxy !== 'function') {
      throw statusSignal(STATUS.NEEDS_PROVIDER_CAPABILITY);
    }
    const res = await authProvider.proxy({
      providerAccountId,
      toolkit,
      endpoint: req.endpoint,
      method: req.method || 'GET',
      body: req.body,
      binary_body: req.binary_body,
      parameters: req.parameters,
    });
    if (res && res.supported === false) {
      throw statusSignal(STATUS.NEEDS_PROVIDER_CAPABILITY);
    }
    if (res && res.error && res.error.code === 'vendor_error') {
      throw statusSignal(STATUS.VENDOR_ERROR, vendorErrorFrom(res));
    }
    return res;
  }

  async function http(req = {}) {
    if (!unwrap || unwrap.supported !== true || !unwrap.header) {
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
    if (auth?.provider !== 'catalog' || !catalogProvider || typeof catalogProvider.execute !== 'function') {
      throw statusSignal(STATUS.NEEDS_PROVIDER_CAPABILITY);
    }
    const res = await catalogProvider.execute({
      actionId,
      userId: undefined,
      providerAccountId,
      arguments: catalogInput ?? input ?? {},
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

  return {
    service,
    module,
    action,
    input,
    confirm: Boolean(confirm),
    proxy,
    http,
    catalog,
    audit,
  };
}
