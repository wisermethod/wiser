async function proxyData(ctx, endpoint) {
  const res = await ctx.proxy({ endpoint, method: 'GET' });
  return res && typeof res === 'object' && Object.hasOwn(res, 'data') ? res.data : res;
}

function invalidArguments(field) {
  return { status: 'invalid_arguments', field };
}

function extraKey(input, allowed) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalidArguments('input');
  const extra = Object.keys(input).find((key) => !allowed.includes(key));
  return extra === undefined ? null : invalidArguments(extra);
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
// Well-formed BCP 47: language, optional script, optional region, optional variants.
// The loose form accepted single-character subtags such as "a" and "en-a", which are not tags.
// Grandfathered and private-use tags are deliberately not accepted; no caller needs one.
const BCP47 = /^[A-Za-z]{2,8}(-[A-Za-z]{4})?(-([A-Za-z]{2}|[0-9]{3}))?(-([A-Za-z0-9]{5,8}|[0-9][A-Za-z0-9]{3}))*$/;

function omitAudits(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const lighthouse = data.lighthouseResult;
  if (!lighthouse || typeof lighthouse !== 'object' || Array.isArray(lighthouse)) return data;
  if (!Object.hasOwn(lighthouse, 'audits')) return data;
  const lighthouseResult = { ...lighthouse };
  delete lighthouseResult.audits;
  return { ...data, lighthouseResult };
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
      if (input.locale !== undefined && (typeof input.locale !== 'string' || !BCP47.test(input.locale))) {
        return invalidArguments('locale');
      }
      if (input.audits !== undefined && typeof input.audits !== 'boolean') return invalidArguments('audits');
      const query = new URLSearchParams();
      query.set('url', input.url);
      if (input.strategy !== undefined) query.set('strategy', input.strategy);
      if (Array.isArray(input.category)) {
        for (const value of input.category) query.append('category', value);
      }
      if (input.locale !== undefined) query.set('locale', input.locale);
      const data = await proxyData(ctx, `/pagespeedonline/v5/runPagespeed?${query}`);
      return input.audits === true ? data : omitAudits(data);
    },
  },
};
