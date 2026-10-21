import { types } from 'node:util';

/** The only response header names an action may request from a provider. */
export const RESPONSE_HEADER_NAMES = Object.freeze(['location', 'range']);
export const RESPONSE_HEADER_VALUE_CAP = 8192;

function isHttpsUrl(value) {
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}

/** Pick declared headers from the provider's envelope, never its payload. */
export function pickResponseHeaders(raw, declared) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Array.isArray(declared)) return out;
  for (const [rawName, rawValue] of Object.entries(raw)) {
    const name = rawName.toLowerCase();
    if (!RESPONSE_HEADER_NAMES.includes(name) || !declared.includes(name)) continue;
    if (Array.isArray(rawValue) && rawValue.length === 0) continue;
    const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    if (typeof value !== 'string' || value.length === 0 ||
        value.length > RESPONSE_HEADER_VALUE_CAP || /[\u0000-\u001f\u007f]/.test(value)) continue;
    // A location is delivered only when the guard below would remember it: an
    // https URL. Anything else would reach the module unguarded.
    if (name === 'location' && !isHttpsUrl(value)) continue;
    out[name] = value;
  }
  return out;
}

/**
 * Private to one execute call. A delivered upload address is a credential for
 * that upload, including its canonical URL and partial or complete upload id.
 * Neither the tracker nor its contents is exposed on the module's context.
 */
export function createResponseHeaderGuard() {
  const addresses = new Set();
  const fragments = new Set();
  function holds(text) {
    if (addresses.size === 0 || typeof text !== 'string') return false;
    if (text.includes('upload_id=')) return true;
    for (const address of addresses) {
      if (text.includes(address)) return true;
    }
    for (let i = 0; i <= text.length - 16; i += 1) {
      if (fragments.has(text.slice(i, i + 16))) return true;
    }
    return false;
  }

  // Inspect raw values before any JSON conversion can escape strings, hide
  // bytes, or throw on a cycle or BigInt. An unreadable value fails closed.
  function holdsValue(value) {
    if (addresses.size === 0) return false;
    const seen = new Set();
    function walk(value, depth) {
      if (depth > 64) return true;
      if (typeof value === 'string') return holds(value);
      if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return false;
      if (types.isProxy(value)) return true;
      if (seen.has(value)) return false;
      seen.add(value);
      if (Buffer.isBuffer(value) || types.isUint8Array(value) || types.isArrayBuffer(value)) {
        const bytes = types.isArrayBuffer(value)
          ? Buffer.from(value) : Buffer.from(value.buffer, value.byteOffset, value.byteLength);
        if (holds(bytes.toString('utf8')) || holds(bytes.toString('latin1'))) return true;
      } else if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype &&
          Object.getPrototypeOf(value) !== null) {
        return true;
      }
      for (const key of Reflect.ownKeys(value)) {
        if (typeof key === 'string' && holds(key)) return true;
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        // An accessor can throw or change between this scan and serialization.
        if (!descriptor || !Object.hasOwn(descriptor, 'value')) return true;
        if (walk(descriptor.value, depth + 1)) return true;
      }
      return false;
    }
    try { return walk(value, 0); } catch { return true; }
  }

  // Errors are not plain result objects. Check their message and own string
  // fields, plus one cause's string fields, without following a cause chain.
  function holdsError(err) {
    if (addresses.size === 0) return false;
    function stringFields(value) {
      if (typeof value === 'string') return holds(value);
      if (!value || (typeof value !== 'object' && typeof value !== 'function')) return false;
      if (types.isProxy(value)) return true;
      return Reflect.ownKeys(value).some((key) => {
        const field = value[key];
        return typeof field === 'string' && holds(field);
      });
    }
    try {
      if (types.isProxy(err) || typeof err?.message !== 'string' || holds(err.message)) return true;
      return stringFields(err) || stringFields(err.cause);
    } catch { return true; }
  }

  return {
    remember(headers) {
      const value = headers?.location;
      if (typeof value !== 'string' || value.length === 0) return;
      let url;
      try { url = new URL(value); } catch { return; }
      if (url.protocol !== 'https:') return;
      addresses.add(value);
      addresses.add(url.href);
      for (const id of url.searchParams.getAll('upload_id')) {
        if (id.length === 0) continue;
        addresses.add(id);
        if (id.length >= 16) {
          for (let i = 0; i <= id.length - 16; i += 1) fragments.add(id.slice(i, i + 16));
        }
      }
    },
    get active() { return addresses.size > 0; },
    holds,
    holdsValue,
    holdsError,
  };
}
