async function proxyData(ctx, request) {
  const res = await ctx.proxy(request);
  return res && typeof res === 'object' && Object.hasOwn(res, 'data') ? res.data : res;
}

function invalidArguments(field) {
  return { status: 'invalid_arguments', field };
}

function invalidInput(input, allowed) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalidArguments('input');
  const extra = Object.keys(input).find((key) => !allowed.includes(key));
  return extra === undefined ? null : invalidArguments(extra);
}

function isHttpsUrl(value) {
  if (typeof value !== 'string' || !/^https:\/\//i.test(value)) return false;
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}

const SEARCH_STRINGS = ['location', 'language', 'include_domains', 'exclude_domains'];

export const modules = {
  web: {
    // Contract from the approved plan dated 2026-09-09; live behavior unverified.
    async search(input, ctx) {
      const invalid = invalidInput(input, ['query', ...SEARCH_STRINGS, 'domain_type', 'page']);
      if (invalid) return invalid;
      if (typeof input.query !== 'string' || !input.query.trim()) return invalidArguments('query');
      for (const field of SEARCH_STRINGS) {
        if (input[field] !== undefined && typeof input[field] !== 'string') return invalidArguments(field);
      }
      if (input.domain_type !== undefined && !['web', 'news', 'research_paper'].includes(input.domain_type)) return invalidArguments('domain_type');
      if (input.page !== undefined && (!Number.isInteger(input.page) || input.page < 0 || input.page > 10)) return invalidArguments('page');
      const query = new URLSearchParams({ query: input.query });
      for (const field of [...SEARCH_STRINGS, 'domain_type', 'page']) {
        if (input[field] !== undefined) query.set(field, input[field]);
      }
      return proxyData(ctx, { endpoint: `https://api.search.tinyfish.ai?${query}`, method: 'GET' });
    },
    async fetch(input, ctx) {
      const invalid = invalidInput(input, ['urls', 'format']);
      if (invalid) return invalid;
      if (!Array.isArray(input.urls) || input.urls.length < 1 || input.urls.length > 10 || !Array.from(input.urls).every(isHttpsUrl)) return invalidArguments('urls');
      if (input.format !== undefined && !['markdown', 'html', 'json'].includes(input.format)) return invalidArguments('format');
      const body = { urls: input.urls };
      if (input.format !== undefined) body.format = input.format;
      return proxyData(ctx, { endpoint: 'https://api.fetch.tinyfish.ai', method: 'POST', body });
    },
  },
};
