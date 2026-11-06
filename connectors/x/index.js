const API = 'https://api.x.com/2';
const ACCOUNT_ID = /^[0-9]{1,19}$/;

// Gateway stops pass through untouched, as in the Google Cloud connector.
function isStatusObject(value) {
  return Boolean(value) && typeof value === 'object' && typeof value.status === 'string';
}

function withQuery(endpoint, parameters) {
  return `${endpoint}?${new URLSearchParams(parameters)}`;
}

// ctx.proxy wraps the vendor body in data; X's body has its own data member.
// Invented fakes only: no vendor fields are validated until live captures exist.
function vendorData(result) {
  return result?.data?.data;
}

export const modules = {
  account: {
    async me(input, ctx) {
      const endpoint = withQuery(`${API}/users/me`, { 'user.fields': 'username' });
      const result = await ctx.proxy({ endpoint, method: 'GET' });
      return isStatusObject(result) ? result : vendorData(result);
    },
    async get_post(input, ctx) {
      const endpoint = withQuery(`${API}/tweets/${encodeURIComponent(input.post_id)}`, {
        'tweet.fields': 'created_at,author_id,conversation_id',
      });
      const result = await ctx.proxy({ endpoint, method: 'GET' });
      return isStatusObject(result) ? result : vendorData(result);
    },
    async recent_posts(input, ctx) {
      // The gateway checks integer type, but applies neither these bounds nor a default.
      const maxResults = input.max_results === undefined ? 5 : input.max_results;
      if (maxResults < 5 || maxResults > 10) {
        return { status: 'invalid_arguments', field: 'max_results' };
      }
      const meEndpoint = `${API}/users/me`;
      const me = await ctx.proxy({ endpoint: meEndpoint, method: 'GET' });
      if (isStatusObject(me)) return me;
      const id = vendorData(me)?.id;
      // This is solely the planned path-safety check before the second request.
      if (typeof id !== 'string' || !ACCOUNT_ID.test(id)) {
        return { status: 'vendor_error', endpoint: meEndpoint, method: 'GET' };
      }
      const endpoint = withQuery(`${API}/users/${encodeURIComponent(id)}/tweets`, {
        max_results: String(maxResults), 'tweet.fields': 'created_at',
      });
      const result = await ctx.proxy({ endpoint, method: 'GET' });
      return isStatusObject(result) ? result : vendorData(result);
    },
    async delete_post(input, ctx) {
      const endpoint = `${API}/tweets/${encodeURIComponent(input.post_id)}`;
      const result = await ctx.proxy({ endpoint, method: 'DELETE' });
      return isStatusObject(result) ? result : vendorData(result);
    },
  },
};
