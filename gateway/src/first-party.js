// First-party runs the classifier with its session binding, subscription checks and answer projection.
import { isAncestorPid, rescanRefusal, verify } from '../../hooks/lib/binding.mjs';
import { isRefused } from '../../hooks/lib/presence.mjs';
import { STATUS, statusObject, vendorErrorFrom } from './errors.js';
import { readClassifierKey } from './paths.js';
import { firstPartyDef, validateFirstPartyAnswer } from './resolve.js';

/** A version fact is a non-empty string. Longer than this is a payload, not a version. */
const VERSION_FACT_MAX = 128;

const BAR_PATHS = new Set(['routing.door_r2', 'routing.target_r2', 'gate.T_fail']);

/**
 * @param {unknown} result
 * @returns {Record<string, unknown> | null}
 */
function plainMeta(result) {
  const meta = result && typeof result === 'object' && !Array.isArray(result) ? result.meta : null;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null;
  return meta;
}

/**
 * A non-empty version string, or null. The string `unknown` is kept: the
 * adapter writes it when an envelope was read and its model was not one.
 * @param {unknown} value
 * @returns {string | null}
 */
function usableVersionString(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > VERSION_FACT_MAX) return null;
  return value;
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function usableBar(value) {
  return typeof value === 'string' && BAR_PATHS.has(value) ? value : null;
}

/**
 * The two version facts the audit line copies off `result.meta`. A fact is a
 * non-empty string of at most VERSION_FACT_MAX characters, or null. A
 * non-string, an empty string, and a longer string are null, so a nested
 * value cannot reach the audit file. Null and a missing key are both null:
 * this function never omits a key.
 * @param {unknown} result
 */
export function firstPartyVersionFacts(result) {
  const meta = plainMeta(result);
  if (!meta) return { model: null, calibrated_model_version: null };
  return {
    model: usableVersionString(meta.model),
    calibrated_model_version: usableVersionString(meta.calibrated_model_version),
  };
}

/**
 * Rebuild the adapter's result as inert data the gateway owns.
 *
 * **Round 2 of adversarial review found two ways round the first version of
 * this function and both are why it now copies rather than spreads.** It
 * spread the adapter's object, which carries an enumerable `toJSON` across
 * unchanged: the in-memory projection nulled the member and `JSON.stringify`
 * at the RPC layer then called the adapter's own serialiser and returned
 * whatever it liked. And it keyed on `Object.hasOwn(result, 'meta')` while
 * `plainMeta` reads `result.meta`, which walks the prototype, so a `meta`
 * inherited from a prototype was read for the audit line and returned to the
 * caller unprojected.
 *
 * So: own enumerable string keys only, no function values, no `__proto__`,
 * and `meta` is always the three contract members forced to their types or
 * absent. An adapter chooses the data and never the serialisation.
 * @param {unknown} result
 */
function projectFirstPartyResult(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return result;
  const meta = plainMeta(result);
  const out = {};
  for (const key of Object.keys(result)) {
    if (key === 'meta' || key === '__proto__') continue;
    const value = result[key];
    if (typeof value === 'function') continue;
    out[key] = value;
  }
  if (meta) {
    out.meta = {
      model: usableVersionString(meta.model),
      bar: usableBar(meta.bar),
      calibrated_model_version: usableVersionString(meta.calibrated_model_version),
    };
  }
  return out;
}

/**
 * Read the version facts onto the audit line before a conversion can drop
 * `meta`. `vendorErrorFrom` builds a fresh object; the stamp is what the
 * line keeps.
 * @param {Record<string, unknown>} line
 * @param {unknown} result
 */
function stampVersionFacts(line, result, key) {
  const facts = firstPartyVersionFacts(result);
  // A version fact is a short string and so is a credential. Length cannot
  // tell them apart, so the one credential this process holds is compared
  // directly and never logged, whatever the adapter called it. Round 2 of
  // adversarial review is why: the projection had stopped a nested payload
  // and a long one, and a key is neither.
  const notTheKey = (value) => (key && value === key ? null : value);
  line.model = notTheKey(facts.model);
  line.calibrated_model_version = notTheKey(facts.calibrated_model_version);
}

/**
 * A success object that failed its declared answer. The reason is fixed so the
 * adapter's own message, which can carry a credential or a vendor name, is
 * not the call's answer. `meta` is the three members only, each forced to its
 * contract type.
 * @param {unknown} result
 */
function malformedAnswer(result) {
  const out = { status: 'unavailable', reason: 'malformed answer' };
  if (!plainMeta(result)) return out;
  const projected = projectFirstPartyResult(result);
  if (projected && projected.meta) out.meta = projected.meta;
  return out;
}

function isUnitProbability(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

const CLASSIFIER_SETUP = 'Open the credential file the gateway created, paste the classifier key after WISER_CLASSIFIER_KEY=, save, and restart. Do not paste the key into chat.';
const CLASSIFIER_SETUP_MISSING = 'Pass --classifier with an absolute path to a classifier directory, set WISER_CLASSIFIER_KEY in the credential file, and restart. Do not paste the key into chat.';

/**
 * True when a first-party call would answer needs_subscription.
 *
 * No classifier loaded is the `resolved.path === 'none'` branch in `execute`.
 * An empty key line is `readClassifierKey` returning null, the same read
 * `executeFirstParty` passes as `key`. That null is what the contract answers
 * as needs_subscription. This does not call the adapter.
 *
 * @param {object | object[] | null | undefined} classifier
 * @param {string | null | undefined} envPath
 * @returns {boolean}
 */
export function classifierNeedsSubscription(classifier, envPath) {
  const list = Array.isArray(classifier) ? classifier : (classifier ? [classifier] : []);
  if (list.length === 0) return true;
  return readClassifierKey(envPath) == null;
}

/**
 * Long-running MCP server. The env session id is the one from startup and is
 * stale after /clear, so the pointer for the parent process is the session.
 * @returns {{ harnessPid: number, sessionId: null }}
 */
export function mcpClassifierIdentity() {
  return { harnessPid: process.ppid, sessionId: null };
}

/**
 * One-shot `--call` / `--route`. Both values are required; neither is optional.
 * `CLAUDE_PID` is accepted only when it is an ancestor of this process.
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ ancestorReader?: (pid: number) => number | null, ancestorStart?: number }} [opts]
 * @returns {{ harnessPid: number, sessionId: string } | { ok: false, reason: string }}
 */
export function oneShotClassifierIdentity(env = process.env, opts = {}) {
  const raw = env.CLAUDE_PID;
  const sessionId = env.CLAUDE_CODE_SESSION_ID;
  const harnessPid = typeof raw === 'string' && /^[0-9]+$/.test(raw) ? Number(raw) : Number.NaN;
  if (!Number.isInteger(harnessPid) || harnessPid <= 0) return { ok: false, reason: 'no-harness' };
  if (typeof sessionId !== 'string' || sessionId.length === 0) return { ok: false, reason: 'no-session' };
  if (!isAncestorPid(harnessPid, { reader: opts.ancestorReader, start: opts.ancestorStart })) {
    return { ok: false, reason: 'not-ancestor' };
  }
  return { harnessPid, sessionId };
}

export function classifierSession(gateway) {
  const ident = gateway.classifierIdentity();
  if (!ident || ident.ok === false) {
    return { ok: false, reason: (ident && ident.reason) || 'no-harness' };
  }
  const verified = verify({
    home: gateway.home,
    harnessPid: ident.harnessPid,
    sessionId: ident.sessionId ?? null,
  });
  if (!verified.ok) return verified;
  if (verified.binding.refused === true) return { ok: false, reason: 'refused' };
  const owning = verified.binding.owning_root;
  if (typeof owning !== 'string' || owning.length === 0) {
    return { ok: false, reason: 'no-owning-root' };
  }
  if (isRefused(owning)) return { ok: false, reason: 'refused' };
  if (rescanRefusal(verified.binding)) return { ok: false, reason: 'refused' };
  return verified;
}

export function classifiers(gateway) {
  if (!gateway.classifier) return [];
  return Array.isArray(gateway.classifier) ? gateway.classifier : [gateway.classifier];
}

export function needsSubscriptionResult(gateway, kind) {
  return statusObject(STATUS.NEEDS_SUBSCRIPTION, {
    setup: kind === 'missing' ? CLASSIFIER_SETUP_MISSING : CLASSIFIER_SETUP,
  });
}

export async function executeFirstParty(gateway, { action, input, confirm, label, parsed, decision, resolved, line }, { prepareUnboundAction, projectStatus }) {
  const session = gateway.classifierSession();
  if (!session.ok) return statusObject(STATUS.CLASSIFIER_UNBOUND, { reason: session.reason });

  const def = resolved.def || firstPartyDef(action) || {};
  line.privilege = def.privilege ?? line.privilege ?? null;

  const refusal = prepareUnboundAction({ action, input, confirm, label, parsed, decision, def });
  if (refusal) return refusal;

  try {
    const key = readClassifierKey(gateway.envPath);
    if (key == null) return gateway.needsSubscriptionResult();
    if (typeof resolved.fn !== 'function') {
      return { status: 'unavailable', reason: 'unknown action id' };
    }
    const raw = await resolved.fn(input ?? {}, key);
    if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
      return { status: 'unavailable', reason: 'malformed answer' };
    }
    stampVersionFacts(line, raw, key);
    const result = projectFirstPartyResult(raw);
    if (result.status === STATUS.NEEDS_CONNECT && label !== undefined) result.label = label;
    const projectedStatus = projectStatus(result);
    if (projectedStatus !== null) return projectedStatus;
    if (result.error && result.error.code === 'vendor_error') return vendorErrorFrom(result);
    // An adapter status is not re-parsed as a success answer. A
    // below_threshold that names `p` still has to name a probability: a
    // string there is not left for a caller to coerce, and a missing `p`
    // stays the object the adapter returned.
    if (typeof result.status === 'string' && result.status) {
      if (result.status === 'below_threshold' && Object.hasOwn(result, 'p') && !isUnitProbability(result.p)) {
        return malformedAnswer(result);
      }
      return result;
    }
    if (!validateFirstPartyAnswer(action, input ?? {}, result)) return malformedAnswer(result);
    return result;
  } catch {
    // The adapter is not trusted, including with this process's own
    // StatusSignal. Every throw is the fixed adapter error.
    return { status: 'unavailable', reason: 'adapter_error' };
  }
}
