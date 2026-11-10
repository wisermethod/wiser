const API = 'https://api.x.com/2';
const ACCOUNT_ID = /^[0-9]{1,19}$/;
const USERNAME = /^[A-Za-z0-9_]{1,15}$/;
const PROBLEM = /^https:\/\/api\.(?:twitter|x)\.com\/2\/problems\/[a-z-]{1,64}$/;
// A scheme needs its "://" and a host's last label two letters, so "Pitch: Cut", "e.g." and "U.S." are not links.
const URL_IN_TEXT = /\b[a-z][a-z0-9+.-]*:\/\/|\bwww\.|\b(?:[a-z0-9-]+\.)+[a-z]{2,63}\b/i;

// Gateway stops pass through untouched, as in the Google Cloud connector.
function isStatusObject(value) {
  return Boolean(value) && typeof value === 'object' && typeof value.status === 'string';
}

function withQuery(endpoint, parameters) {
  return `${endpoint}?${new URLSearchParams(parameters)}`;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPost(value) {
  return isObject(value) && typeof value.id === 'string' && ACCOUNT_ID.test(value.id) && typeof value.text === 'string';
}

function responseError(reason, request) {
  return { status: 'vendor_error', reason, endpoint: request.endpoint.split('?')[0], method: request.method };
}

// ctx.proxy wraps the vendor body in data; X's body has its own data member.
function vendorData(result, request, check = () => true, project = (data) => data) {
  if (isStatusObject(result)) return result;
  const body = result?.data;
  if (body?.data === undefined) {
    const error = responseError('no_data', request);
    const problem = body?.errors?.[0]?.type;
    if (typeof problem === 'string' && PROBLEM.test(problem)) error.problem = problem;
    return error;
  }
  return check(body.data) ? project(body.data) : responseError('unexpected_response', request);
}

// This is the connector's conservative cap, not a measured copy of X's weighting.
function weight(text) {
  let total = 0;
  for (const character of text) {
    const point = character.codePointAt(0);
    total += point <= 4351 || (point >= 8192 && point <= 8205) ||
      (point >= 8208 && point <= 8223) || (point >= 8242 && point <= 8247) ? 1 : 2;
  }
  return total;
}

export const modules = {
  account: {
    async me(input, ctx) {
      const endpoint = withQuery(`${API}/users/me`, { 'user.fields': 'username' });
      const request = { endpoint, method: 'GET' };
      return vendorData(await ctx.proxy(request), request, (data) => isObject(data) &&
        typeof data.id === 'string' && ACCOUNT_ID.test(data.id) &&
        typeof data.username === 'string' && USERNAME.test(data.username) && typeof data.name === 'string');
    },
    async get_post(input, ctx) {
      const endpoint = withQuery(`${API}/tweets/${encodeURIComponent(input.post_id)}`, {
        'tweet.fields': 'created_at,author_id,conversation_id',
      });
      const request = { endpoint, method: 'GET' };
      return vendorData(await ctx.proxy(request), request, (data) =>
        isObject(data) && data.id === input.post_id && typeof data.text === 'string');
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
      if (me?.data?.data === undefined) return vendorData(me, { endpoint: meEndpoint, method: 'GET' });
      const id = me.data.data?.id;
      // This is solely the planned path-safety check before the second request.
      if (typeof id !== 'string' || !ACCOUNT_ID.test(id)) {
        return { status: 'vendor_error', endpoint: meEndpoint, method: 'GET' };
      }
      const endpoint = withQuery(`${API}/users/${encodeURIComponent(id)}/tweets`, {
        max_results: String(maxResults), 'tweet.fields': 'created_at',
      });
      const request = { endpoint, method: 'GET' };
      const result = await ctx.proxy(request);
      if (isStatusObject(result)) return result;
      // X documents an empty timeline with no data and meta.result_count=0; no capture exists for this case.
      if (result?.data?.data === undefined && result?.data?.meta?.result_count === 0) return [];
      return vendorData(result, request, (data) => Array.isArray(data) &&
        data.length <= maxResults && data.every(isPost));
    },
    async delete_post(input, ctx) {
      const endpoint = `${API}/tweets/${encodeURIComponent(input.post_id)}`;
      const request = { endpoint, method: 'DELETE' };
      return vendorData(await ctx.proxy(request), request,
        (data) => isObject(data) && typeof data.deleted === 'boolean', (data) => ({ deleted: data.deleted }));
    },
    async create_post(input, ctx) {
      if ([...input.text].length > 280 || weight(input.text) > 280) {
        return { status: 'invalid_arguments', field: 'text' };
      }
      if (URL_IN_TEXT.test(input.text) && input.allow_url !== true) {
        return { status: 'invalid_arguments', field: 'text', reason: 'url_requires_allow_url' };
      }
      const body = { text: input.text };
      if (input.reply_to !== undefined) body.reply = { in_reply_to_tweet_id: input.reply_to };
      const request = { endpoint: `${API}/tweets`, method: 'POST', body };
      // Step C adds the response check after a live create_post capture exists.
      return vendorData(await ctx.proxy(request), request);
    },
  },
};
