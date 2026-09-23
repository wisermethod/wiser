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
  // Added 2026-09-20 with the teardown. A revoke that ran and did not end in the
  // credential being gone is not a missing capability and not a vendor refusal; it is
  // a destructive operation that stopped partway, and a caller needs to act on it
  // differently from either. Added, never renamed: nothing above changes meaning.
  TEARDOWN_INCOMPLETE: 'teardown_incomplete',
  // Added 2026-09-21 with the first-party classifier path. An adapter failure has no
  // status of its own among the nine above; nothing said "you have no subscription".
  // Added, never renamed: nothing above changes meaning.
  NEEDS_SUBSCRIPTION: 'needs_subscription',
  // Added with the session binding. A first-party call was not sent because
  // the binding did not verify, was refused, or named no root. Added, never
  // renamed: nothing above changes meaning.
  CLASSIFIER_UNBOUND: 'classifier_unbound',
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

/**
 * Adapter-level answers that are not gateway STATUS values, by design.
 * withAudit recognises this allowlist; any other adapter status string is
 * recorded as `classifier_other` rather than copied into the log.
 */
export const CLASSIFIER_RESULT_STATUSES = Object.freeze([
  'unavailable',
  'below_threshold',
  'roster_unknown',
]);

/**
 * @param {unknown} status
 * @returns {'unavailable' | 'below_threshold' | 'roster_unknown' | 'classifier_other'}
 */
export function classifierAuditStatus(status) {
  if (typeof status === 'string' && CLASSIFIER_RESULT_STATUSES.includes(status)) {
    return status;
  }
  return 'classifier_other';
}
