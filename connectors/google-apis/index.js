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
  if (!isPlainObject(input)) return invalidArguments('input');
  const extra = Object.keys(input).find((key) => !allowed.includes(key));
  return extra === undefined ? null : invalidArguments(extra);
}

// A deliberate SUBSET of BCP 47, not the whole grammar: language, optional script,
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

function isAbsoluteHttpUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

const STRATEGIES = new Set(['mobile', 'desktop']);
const CATEGORIES = new Set(['performance', 'accessibility', 'best-practices', 'seo', 'pwa']);
const INSIGHTS_ENDPOINT = 'https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed';

function omitAudits(data) {
  if (!isPlainObject(data)) return data;
  const lighthouse = data.lighthouseResult;
  if (!isPlainObject(lighthouse)) return data;
  if (!Object.hasOwn(lighthouse, 'audits')) return data;
  const lighthouseResult = { ...lighthouse };
  delete lighthouseResult.audits;
  return { ...data, lighthouseResult };
}

// A runPagespeed success always carries `lighthouseResult`; field data under
// `loadingExperience` is absent for a URL with no CrUX history and is not the test.
function readInsights(payload, audits) {
  const body = isPlainObject(payload) && Object.hasOwn(payload, 'data') ? payload.data : payload;
  if (!isPlainObject(body) || !isPlainObject(body.lighthouseResult)) {
    return { status: 'vendor_error', endpoint: INSIGHTS_ENDPOINT, method: 'GET' };
  }
  return audits === true ? body : omitAudits(body);
}

const FORMATS = new Set(['text', 'html']);
const TRANSLATE_ENDPOINT = 'https://translation.googleapis.com/language/translate/v2';

function isTextList(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 128) return false;
  for (let i = 0; i < value.length; i += 1) {
    const item = value[i];
    if (typeof item !== 'string' || !item.trim()) return false;
  }
  return true;
}

// Both readers below follow one rule: each recognises exactly one success shape and
// refuses everything else rather than forwarding it. An unreadable envelope may be a
// vendor error body, and `standards/script-contract.md` Output forbids returning one;
// a vendor_error names the endpoint and the method and carries no body. Passing the
// value through instead would both leak that body and report a malformed payload as a
// success. The two modules answer this the same way on purpose: one hardened reader
// beside a passthrough one is the inconsistency a later reader trusts by mistake.
function readTranslations(payload) {
  const outer = isPlainObject(payload) && Object.hasOwn(payload, 'data') ? payload.data : payload;
  const body = isPlainObject(outer) && Object.hasOwn(outer, 'data') ? outer.data : outer;
  if (isPlainObject(body) && Array.isArray(body.translations)) {
    return { translations: body.translations };
  }
  return { status: 'vendor_error', endpoint: TRANSLATE_ENDPOINT, method: 'GET' };
}

export const modules = {
  insights: {
    // Contract from the approved plan dated 2026-09-19; live behavior unverified.
    async run(input, ctx) {
      const invalid = extraKey(input, ['url', 'strategy', 'category', 'locale', 'audits']);
      if (invalid) return invalid;
      if (!isAbsoluteHttpUrl(input.url)) return invalidArguments('url');
      if (input.strategy !== undefined && !STRATEGIES.has(input.strategy)) return invalidArguments('strategy');
      if (input.category !== undefined) {
        if (!Array.isArray(input.category) || !input.category.every((value) => CATEGORIES.has(value))) {
          return invalidArguments('category');
        }
      }
      if (input.locale !== undefined && !isBcp47(input.locale)) return invalidArguments('locale');
      if (input.audits !== undefined && typeof input.audits !== 'boolean') return invalidArguments('audits');
      const query = new URLSearchParams();
      query.set('url', input.url);
      if (input.strategy !== undefined) query.set('strategy', input.strategy);
      if (Array.isArray(input.category)) {
        for (const value of input.category) query.append('category', value);
      }
      if (input.locale !== undefined) query.set('locale', input.locale);
      const result = await ctx.proxy({ endpoint: `${INSIGHTS_ENDPOINT}?${query}`, method: 'GET' });
      return isStatusObject(result) ? result : readInsights(result, input.audits);
    },
  },
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
      const result = await ctx.proxy({ endpoint: `${TRANSLATE_ENDPOINT}?${query}`, method: 'GET' });
      return isStatusObject(result) ? result : readTranslations(result);
    },
  },
};
