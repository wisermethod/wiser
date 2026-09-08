/**
 * Status objects an agent can act on, and sanitised internal errors.
 * A status object is a result, not an exception, unless a helper throws it
 * to unwind ctx.http / ctx.proxy.
 */

export const STATUS = {
  NEEDS_PROVIDER: 'needs_provider',
  NEEDS_CONNECT: 'needs_connect',
  NEEDS_CONFIRMATION: 'needs_confirmation',
  DENIED: 'denied',
  NEEDS_CONNECTOR: 'needs_connector',
  VENDOR_ERROR: 'vendor_error',
  NEEDS_PROVIDER_CAPABILITY: 'needs_provider_capability',
  INVALID_ARGUMENTS: 'invalid_arguments',
};

/**
 * @param {string} status
 * @param {Record<string, unknown>} [extra]
 */
export function statusObject(status, extra = {}) {
  return { status, ...extra };
}

/**
 * An unwind for ctx helpers. execute() catches this and returns `.object`.
 */
export class StatusSignal extends Error {
  /**
   * @param {Record<string, unknown>} object
   */
  constructor(object) {
    super(String(object.status || 'status'));
    this.name = 'StatusSignal';
    this.object = object;
  }
}

/**
 * @param {string} status
 * @param {Record<string, unknown>} [extra]
 */
export function statusSignal(status, extra = {}) {
  return new StatusSignal(statusObject(status, extra));
}

/**
 * Never return a raw provider body, stack, or header. Name the cause class only.
 * @param {unknown} err
 * @returns {string}
 */
export function sanitizeError(err) {
  if (err instanceof StatusSignal) {
    return String(err.object.status || 'internal error');
  }
  if (err && typeof err === 'object' && 'code' in err && typeof err.code === 'string') {
    if (err.code === 'not_implemented') return 'not_implemented';
    if (err.code === 'ENOENT') return 'file not found';
    if (err.code === 'EACCES') return 'permission denied';
  }
  if (err instanceof Error) {
    const msg = err.message || err.name || 'internal error';
    if (/token|secret|api[_-]?key|bearer|authorization/i.test(msg)) {
      return 'internal error';
    }
    if (msg.length > 200) return 'internal error';
    return msg;
  }
  return 'internal error';
}

/**
 * Map a provider/proxy failure into the agent-facing status. Never include `data`.
 * @param {{ status?: number, error?: { code?: string, endpoint?: string, method?: string } }} res
 */
export function vendorErrorFrom(res) {
  return statusObject(STATUS.VENDOR_ERROR, {
    http_status: res.status ?? null,
    endpoint: res.error?.endpoint ?? null,
    method: res.error?.method ?? null,
  });
}

/**
 * True when a module or catalog result is already an agent-facing status object.
 * @param {unknown} value
 */
export function isStatusObject(value) {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'status' in value &&
      typeof value.status === 'string' &&
      Object.values(STATUS).includes(value.status)
  );
}
