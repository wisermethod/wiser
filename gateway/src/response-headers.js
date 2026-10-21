/** The only response header names an action may request from a provider. */
export const RESPONSE_HEADER_NAMES = Object.freeze(['location', 'range']);
export const RESPONSE_HEADER_VALUE_CAP = 8192;

/** Pick declared headers from the provider's envelope, never its payload. */
export function pickResponseHeaders(raw, declared) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Array.isArray(declared)) return out;
  for (const [rawName, rawValue] of Object.entries(raw)) {
    const name = rawName.toLowerCase();
    if (!RESPONSE_HEADER_NAMES.includes(name) || !declared.includes(name)) continue;
    if (Array.isArray(rawValue) && rawValue.length === 0) continue;
    const value = String(Array.isArray(rawValue) ? rawValue[0] : rawValue);
    if (value.length > RESPONSE_HEADER_VALUE_CAP || /[\u0000-\u001f\u007f]/.test(value)) continue;
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
  return {
    remember(headers) {
      const value = headers?.location;
      if (typeof value !== 'string') return;
      addresses.add(value);
      let url;
      try { url = new URL(value); } catch { return; }
      addresses.add(url.href);
      for (const id of url.searchParams.getAll('upload_id')) {
        addresses.add(id);
        if (id.length >= 16) {
          for (let i = 0; i <= id.length - 16; i += 1) fragments.add(id.slice(i, i + 16));
        }
      }
    },
    get active() { return addresses.size > 0; },
    holds(text) {
      if (addresses.size === 0 || typeof text !== 'string') return false;
      if (text.includes('upload_id=')) return true;
      for (const address of addresses) {
        if (text.includes(address)) return true;
      }
      for (let i = 0; i <= text.length - 16; i += 1) {
        if (fragments.has(text.slice(i, i + 16))) return true;
      }
      return false;
    },
  };
}
