async function proxyData(ctx, endpoint) {
  const res = await ctx.proxy({ endpoint, method: 'GET' });
  return res && typeof res === 'object' && Object.hasOwn(res, 'data') ? res.data : res;
}

function invalidArguments(field) {
  return { status: 'invalid_arguments', field };
}

function getById(resource, input, ctx) {
  if (typeof input?.id !== 'string' || !/^[0-9]+$/.test(input.id)) return invalidArguments('id');
  return proxyData(ctx, `/api/rest/v4/${resource}/${input.id}/`);
}

export const modules = {
  caselaw: {
    // grant ACTIVE 2026-09-08; Token header injection confirmed. search/list_courts
    // { count, next, previous, results }. get_cluster/get_docket object with id.
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
  },
};
