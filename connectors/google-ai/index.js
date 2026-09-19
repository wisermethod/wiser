function invalidArguments(field) {
  return { status: 'invalid_arguments', field };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// A gateway stop carries a string status and is returned to the caller untouched.
function isStatusObject(value) {
  return isPlainObject(value) && typeof value.status === 'string';
}

function extraKey(input, allowed) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalidArguments('input');
  const extra = Object.keys(input).find((key) => !allowed.includes(key));
  return extra === undefined ? null : invalidArguments(extra);
}

const FORMATS = new Set(['text', 'html']);
const ENDPOINT = 'https://translation.googleapis.com/language/translate/v2';
// A deliberate SUBSET of BCP 47, not the whole grammar, and the same expression
// `connectors/pagespeed/` uses so the two do not drift: language, optional script,
// optional region, optional variants. The loose form accepted single-character
// subtags such as "a" and "en-a", which are not tags.
//
// Outside the subset, each excluded on purpose because no translation caller needs it:
// grandfathered and private-use tags; extlang, so "zh-cmn" is refused where "cmn" is
// taken; and extension sequences such as "en-US-u-ca-gregory", which select a calendar
// and mean nothing to a translator. One malformed shape is inside it: a repeated
// variant like "de-DE-1901-1901", which RFC 5646 section 2.2.5 forbids and this
// expression admits. It reaches the vendor and the vendor refuses it, which is a
// vendor_error naming the endpoint rather than a wrong translation.
const BCP47 = /^[A-Za-z]{2,8}(-[A-Za-z]{4})?(-([A-Za-z]{2}|[0-9]{3}))?(-([A-Za-z0-9]{5,8}|[0-9][A-Za-z0-9]{3}))*$/;

function isBcp47(value) {
  return typeof value === 'string' && BCP47.test(value);
}

function isTextList(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 128) return false;
  for (let i = 0; i < value.length; i += 1) {
    const item = value[i];
    if (typeof item !== 'string' || !item.trim()) return false;
  }
  return true;
}

// The only success this module recognises is a translations array, and anything else
// is refused rather than forwarded. An unreadable envelope may be a vendor error body,
// and `standards/script-contract.md` Output forbids returning one; a vendor_error names
// the endpoint and the method and carries no body. Passing the value through instead
// would both leak that body and report a malformed payload as a successful translation.
function readTranslations(payload) {
  const outer = isPlainObject(payload) && Object.hasOwn(payload, 'data') ? payload.data : payload;
  const body = isPlainObject(outer) && Object.hasOwn(outer, 'data') ? outer.data : outer;
  if (isPlainObject(body) && Array.isArray(body.translations)) {
    return { translations: body.translations };
  }
  return { status: 'vendor_error', endpoint: ENDPOINT, method: 'GET' };
}

export const modules = {
  translate: {
    // Contract from the approved plan dated 2026-09-19; live behavior unverified.
    async text(input, ctx) {
      const invalid = extraKey(input, ['text', 'target', 'source', 'format']);
      if (invalid) return invalid;
      if (!isTextList(input.text)) return invalidArguments('text');
      if (!isBcp47(input.target)) return invalidArguments('target');
      if (input.source !== undefined && !isBcp47(input.source)) return invalidArguments('source');
      if (input.format !== undefined && !FORMATS.has(input.format)) return invalidArguments('format');
      const query = new URLSearchParams();
      for (const value of input.text) query.append('q', value);
      query.set('target', input.target);
      if (input.source !== undefined) query.set('source', input.source);
      if (input.format !== undefined) query.set('format', input.format);
      const result = await ctx.proxy({ endpoint: `${ENDPOINT}?${query}`, method: 'GET' });
      return isStatusObject(result) ? result : readTranslations(result);
    },
  },
};
