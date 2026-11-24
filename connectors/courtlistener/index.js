async function proxyData(ctx, endpoint, method = 'GET', body) {
  const res = await ctx.proxy({ endpoint, method, ...(body === undefined ? {} : { body }) });
  return res && typeof res === 'object' && Object.hasOwn(res, 'data') ? res.data : res;
}

function invalidArguments(field) {
  return { status: 'invalid_arguments', field };
}

function getById(resource, input, ctx) {
  if (typeof input?.id !== 'string' || !/^[0-9]+$/.test(input.id)) return invalidArguments('id');
  return proxyData(ctx, `/api/rest/v4/${resource}/${input.id}/`);
}

// The four GET response shapes were proved live on 2026-09-08.
// The lookup shape comes from the vendor documentation and source. A live lookup remains unverified.
export const modules = {
  caselaw: {
    async search(input, ctx) {
      if (typeof input?.q !== 'string' || !input.q.trim()) return invalidArguments('q');
      if (input.type !== undefined && !['o', 'r', 'oa', 'p'].includes(input.type)) return invalidArguments('type');
      const query = new URLSearchParams({ q: input.q });
      if (input.type !== undefined) query.set('type', input.type);
      return proxyData(ctx, `/api/rest/v4/search/?${query}`);
    },
    async get_docket(input, ctx) {
      return getById('dockets', input, ctx);
    },
    async get_cluster(input, ctx) {
      return getById('clusters', input, ctx);
    },
    async list_courts(input, ctx) {
      return proxyData(ctx, '/api/rest/v4/courts/');
    },
    async lookup_citation(input, ctx) {
      const { text, volume, reporter, page } = input;
      let body;
      if (Object.hasOwn(input, 'text')) {
        for (const field of ['volume', 'reporter', 'page']) {
          if (Object.hasOwn(input, field)) return invalidArguments(field);
        }
        if (typeof text !== 'string' || !text.trim() || [...text].length > 64000) return invalidArguments('text');
        body = { text };
      } else {
        for (const field of ['volume', 'reporter', 'page']) {
          if (!Object.hasOwn(input, field)) return invalidArguments(field);
        }
        if (typeof volume !== 'string' || !/^[0-9]+$/.test(volume)) return invalidArguments('volume');
        if (typeof reporter !== 'string' || !reporter.trim() || [...reporter].length > 100) return invalidArguments('reporter');
        if (typeof page !== 'string' || !/^[0-9]+$/.test(page)) return invalidArguments('page');
        body = { volume, reporter, page };
      }
      const results = await proxyData(ctx, '/api/rest/v4/citation-lookup/', 'POST', body);
      return Array.isArray(results) ? { results } : { status: 'vendor_error', reason: 'unexpected_response' };
    },
  },
};
