const BASE = 'https://api.usebouncer.com/v1.1';

async function data(ctx, request) {
  const result = await ctx.http(request);
  return result.data;
}

function validId(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]+$/.test(id);
}

export const modules = {
  verify: {
    async credits(_input, ctx) {
      return data(ctx, { url: `${BASE}/credits`, method: 'GET' });
    },
    async single(input, ctx) {
      if (typeof input.email !== 'string' || !input.email.trim()) {
        return { status: 'invalid_arguments', field: 'email' };
      }
      const url = new URL(`${BASE}/email/verify`);
      url.searchParams.set('email', input.email);
      return data(ctx, { url: url.toString(), method: 'GET' });
    },
    async bulk(input, ctx) {
      if (!Array.isArray(input.emails) || input.emails.length === 0
          || input.emails.some((row) => typeof row?.email !== 'string' || !row.email.trim())) {
        return { status: 'invalid_arguments', field: 'emails' };
      }
      return data(ctx, {
        url: `${BASE}/email/verify/batch`,
        method: 'POST',
        body: input.emails.map(({ email }) => ({ email })),
      });
    },
    async status(input, ctx) {
      if (!validId(input.id)) return { status: 'invalid_arguments', field: 'id' };
      return data(ctx, { url: `${BASE}/email/verify/batch/${encodeURIComponent(input.id)}`, method: 'GET' });
    },
    async download(input, ctx) {
      if (!validId(input.id)) return { status: 'invalid_arguments', field: 'id' };
      return data(ctx, { url: `${BASE}/email/verify/batch/${encodeURIComponent(input.id)}/download?download=all`, method: 'GET' });
    },
  },
};
