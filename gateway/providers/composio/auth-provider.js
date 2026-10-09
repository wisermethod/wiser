import { readFileSync } from 'node:fs';
import { createCustomToolkitBody, findCustomToolkit, registeredSlug } from './custom-toolkits.js';

export { createCustomToolkitBody } from './custom-toolkits.js';

const BASE = 'https://backend.composio.dev/api/v3.1';

/**
 * @param {string} text
 * @returns {Record<string, string>}
 */
function parseEnvText(text) {
  const map = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    map[line.slice(0, eq)] = line.slice(eq + 1);
  }
  return map;
}

/**
 * Read the key from the --env file. Held in a closure; never assigned to process.env.
 * @param {string | null} envPath
 * @returns {string | null}
 */
function readApiKey(envPath) {
  if (!envPath) return null;
  let text;
  try {
    text = readFileSync(envPath, 'utf8');
  } catch {
    return null;
  }
  const map = parseEnvText(text);
  return map.WISER_AUTH_PROVIDER_KEY || map.COMPOSIO_API_KEY || null;
}

/**
 * @param {string} apiKey
 * @param {string} method
 * @param {string} path
 * @param {object} [body]
 */
async function request(apiKey, method, path, body) {
  const url = `${BASE}${path}`;
  const headers = {
    'x-api-key': apiKey,
    accept: 'application/json',
  };
  if (body !== undefined) headers['content-type'] = 'application/json';
  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    // A rejected fetch is the network, not the provider and not the grant.
    return { ok: false, status: 0, data: null, malformed: true, endpoint: path, method };
  }
  const ok = res.status >= 200 && res.status < 300;
  let data = null;
  let malformed = false;
  let text = '';
  try {
    text = await res.text();
  } catch {
    // The connection broke while reading the body. The status line is known and is
    // truthful, so it is kept; the body is not, so this is malformed. It must not
    // throw: `revoke` reports what each of its steps did, and a throw here discarded
    // a completed first step along with the second.
    return { ok, status: res.status, data: null, malformed: true, endpoint: path, method };
  }
  if (text) {
    try { data = JSON.parse(text); } catch { data = null; malformed = true; }
  }
  return { ok, status: res.status, data, malformed, endpoint: path, method };
}

export function proxyRequestBody({ providerAccountId, endpoint, method, body, parameters, binary_body }) {
  const payload = { connected_account_id: providerAccountId, endpoint, method: method || 'GET' };
  if (body !== undefined) payload.body = body;
  if (binary_body !== undefined) payload.binary_body = binary_body;
  if (Array.isArray(parameters) && parameters.length > 0) payload.parameters = parameters;
  return payload;
}

/**
 * POST /auth_configs body. OAuth uses managed auth. API-key toolkits have no
 * managed app; empty credentials means the hosted connect page collects the key.
 * Never put a vendor token here.
 */
export function createAuthConfigBody(toolkit, scheme) {
  const oauth = String(scheme || '').toUpperCase() === 'OAUTH2';
  return {
    toolkit: { slug: toolkit },
    auth_config: oauth
      ? { type: 'use_composio_managed_auth', name: toolkit }
      : { type: 'use_custom_auth', authScheme: scheme, name: toolkit, credentials: {} },
  };
}

function vendorError(endpoint, method, status, codes) {
  const error = { code: 'vendor_error', endpoint, method };
  if (Array.isArray(codes) && codes.length > 0) error.provider_codes = codes;
  return { status, error };
}

const MAX_PROVIDER_CODES = 10;

/**
 * The vendor's own numeric error codes from a refused proxy answer, and nothing
 * else from its body: `errors[].code` where it is a safe integer, at most ten.
 * Cloudflare answers a disabled product and a missing permission with the same
 * HTTP 403 and tells them apart only by this code (9999 against 10000), so the
 * code is the one part of the body a caller needs. Messages, ids and every other
 * field stay here, as `vendorErrorFrom` requires.
 * @param {unknown} payload
 * @returns {number[]}
 */
export function providerCodes(payload) {
  const errors = payload && typeof payload === 'object' && Array.isArray(payload.errors) ? payload.errors : [];
  const codes = [];
  for (const entry of errors) {
    if (codes.length >= MAX_PROVIDER_CODES) break;
    const code = entry && typeof entry === 'object' ? entry.code : undefined;
    if (Number.isSafeInteger(code)) codes.push(code);
  }
  return codes;
}

/**
 * BIND exports and other file bodies arrive as binary_data.url, not JSON.
 * Fetch that HTTPS URL in-process and return the text. Redirects are refused.
 * @param {object} data
 * @param {typeof fetch} [fetchImpl]
 */
export async function resolveProxyPayload(data, fetchImpl = fetch) {
  const binary = data?.binary_data;
  if (binary && typeof binary.url === 'string') {
    let parsed;
    try { parsed = new URL(binary.url); } catch { parsed = null; }
    if (parsed && parsed.protocol === 'https:') {
      const res = await fetchImpl(parsed.toString(), { redirect: 'manual' });
      if (res.ok && !(res.status >= 300 && res.status < 400)) return await res.text();
    }
  }
  if (typeof data?.data === 'string') return data.data;
  const payload = data?.data ?? data;
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return Object.fromEntries(Object.entries(payload).filter(([key]) =>
      !['headers', 'set-cookie'].includes(key.toLowerCase())));
  }
  return payload;
}

/**
 * Only a recognised provider status is authoritative. Anything else is null, and the
 * caller treats null as "could not tell" rather than as a revoked grant.
 */
function mapStatus(raw) {
  const value = String(raw || '').toUpperCase();
  if (value === 'PENDING') return 'INITIATED';
  if (value === 'ACTIVE' || value === 'INITIATED' || value === 'EXPIRED' || value === 'FAILED' || value === 'INACTIVE') {
    return value;
  }
  return null;
}

/** One message for every listing refusal. Never the provider's body. */
const LISTING_FAILED = 'could not list connected accounts';
const LISTING_PAGE_SIZE = 100;
const LISTING_MAX_PAGES = 100;

function failListing() {
  throw new Error(LISTING_FAILED);
}

/**
 * `toolkit.slug`, else `toolkit_slug`, else null. An empty string is not a slug.
 * @param {object} item
 * @returns {string | null}
 */
function accountToolkit(item) {
  const nested = item.toolkit;
  const slug = nested && typeof nested === 'object' && !Array.isArray(nested) ? nested.slug : undefined;
  if (typeof slug === 'string' && slug.length > 0) return slug;
  if (typeof item.toolkit_slug === 'string' && item.toolkit_slug.length > 0) return item.toolkit_slug;
  return null;
}

/**
 * ACTIVE listings keep only ACTIVE. `all` keeps mapStatus where it knows the
 * word, and otherwise the provider's own word uppercased, so a state mapStatus
 * does not name is still returned.
 * @param {unknown} raw
 * @param {boolean} keepAll
 * @returns {string | null}
 */
function listedStatus(raw, keepAll) {
  const mapped = mapStatus(raw);
  if (!keepAll) return mapped === 'ACTIVE' ? mapped : null;
  if (mapped) return mapped;
  if (typeof raw === 'string') return raw.toUpperCase();
  return '';
}

/**
 * @param {string | undefined} userId
 * @param {string[]} statuses Empty sends no status filter.
 * @param {string} cursor
 * @param {string | undefined} accountType Omitted on the default listing, which is PRIVATE only.
 */
function listingParams(userId, statuses, cursor, accountType) {
  const params = new URLSearchParams();
  if (userId) params.append('user_ids', userId);
  for (const status of statuses) params.append('statuses', status);
  // `ALL` is PRIVATE and SHARED. The parameter is absent unless this call asked for both.
  if (accountType) params.set('account_type', accountType);
  params.set('limit', String(LISTING_PAGE_SIZE));
  if (cursor) params.append('cursor', cursor);
  return params;
}

/**
 * Null means the listing ended. A cursor that is not a string is not a page
 * boundary we can follow, and stopping there would hide every later account.
 * @param {object} data
 * @returns {string | null}
 */
function nextCursor(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Object.hasOwn(data, 'next_cursor')) {
    return null;
  }
  const next = data.next_cursor;
  if (next == null || next === '') return null;
  if (typeof next !== 'string') failListing();
  return next;
}

/**
 * A count key the provider included. Absent is null. Present and not a finite
 * number rejects, on this page and on every page: Composio documents both
 * counts as numbers, and a string, null, or anything else is not a boundary
 * this listing can trust.
 * @param {object} data
 * @param {string} key
 * @returns {number | null}
 */
function pageCount(data, key) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Object.hasOwn(data, key)) {
    return null;
  }
  const value = data[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) failListing();
  return value;
}

/**
 * The cursor has ended. `total_pages` above the pages actually read means a
 * page was withheld. `current_page` below `total_pages` is the same claim
 * when both counts are present. A missing count is not that claim.
 * @param {number | null} current
 * @param {number | null} total
 * @param {number} pagesRead
 * @returns {boolean}
 */
function endedListingWithheld(current, total, pagesRead) {
  if (total !== null && total > pagesRead) return true;
  if (current !== null && total !== null && current < total) return true;
  return false;
}

/**
 * @param {{ envPath?: string | null }} opts
 */
export function createAuthProvider({ envPath } = {}) {
  const apiKey = readApiKey(envPath || null);

  return {
    name: 'composio',
    isConfigured() {
      return Boolean(apiKey);
    },
    setupText() {
      const file = envPath || 'the credential file the gateway created';
      return [
        'Create a free account at composio.dev and sign in.',
        'Open Settings, Project Settings, API Keys, and create a full-access project API key, not an organisation key.',
        `Open ${file} and paste the key after WISER_AUTH_PROVIDER_KEY=.`,
        'Save. Do not paste the key into chat.',
        'Then open Platform, Auth Configs, Create Auth Config.',
        'Add GitHub as OAuth2 with Composio managed auth.',
        'Add Cloudflare as API Key and do not paste a Cloudflare token there.',
        'Do not click Connect Account on those configs; connecting is through the gateway later.',
        'Restart the harness.',
      ].join(' ');
    },
    /**
     * Every account for this user, or a rejection. An empty array means the
     * provider holds none, so a missing key, a failed page, a page that is not
     * a list, a repeated cursor, a present page count that is not a finite
     * number, a cursor that ended while total_pages is above the pages read
     * or current_page is below total_pages, or a listing that does not end
     * within LISTING_MAX_PAGES rejects instead of returning the pages already
     * read. `states` omitted asks for ACTIVE only and drops anything else the
     * provider sends. `states: 'all'` sends no status filter, sends
     * account_type=ALL so PRIVATE and SHARED both come back, and keeps each
     * account.
     */
    async listAccounts({ userId, states } = {}) {
      if (states !== undefined && states !== 'all') failListing();
      if (!apiKey) failListing();
      const keepAll = states === 'all';
      // No statuses parameter: the provider then returns every state.
      // account_type stays omitted on the default listing, which is PRIVATE only.
      const statuses = keepAll ? [] : ['ACTIVE'];
      const accountType = keepAll ? 'ALL' : undefined;
      const followed = new Set();
      const out = [];
      let cursor = '';
      for (let page = 0; page < LISTING_MAX_PAGES; page += 1) {
        const params = listingParams(userId, statuses, cursor, accountType);
        const res = await request(apiKey, 'GET', `/connected_accounts?${params}`);
        if (!res.ok || res.malformed) failListing();
        const items = res.data && typeof res.data === 'object' ? res.data.items : undefined;
        if (!Array.isArray(items)) failListing();
        for (const item of items) {
          // A broken item is a broken page. Skipping it would return a partial list.
          if (!item || typeof item !== 'object' || Array.isArray(item)) failListing();
          if (typeof item.id !== 'string' || item.id.length === 0) failListing();
          const status = listedStatus(item.status, keepAll);
          if (status === null) continue;
          out.push({ id: item.id, toolkit: accountToolkit(item), status });
        }
        // Checked on every page, including one whose cursor continues.
        const pagesRead = page + 1;
        const current = pageCount(res.data, 'current_page');
        const total = pageCount(res.data, 'total_pages');
        const next = nextCursor(res.data);
        if (next === null) {
          if (endedListingWithheld(current, total, pagesRead)) failListing();
          return out;
        }
        if (followed.has(next)) failListing();
        followed.add(next);
        cursor = next;
      }
      failListing();
    },
    async initiate({ userId, toolkit, scheme, callbackUrl }) {
      if (!apiKey) return { status: 0, error: { code: 'vendor_error', endpoint: '/auth_configs', method: 'GET' } };
      const custom = findCustomToolkit(toolkit);
      if (custom) {
        const path = '/custom/toolkits/upsert';
        const upserted = await request(apiKey, 'POST', path, createCustomToolkitBody(custom));
        // A 409 is a frozen-config conflict. Never delete or replace the toolkit.
        if (upserted.status !== 200) return vendorError(path, 'POST', upserted.status);
        toolkit = registeredSlug(custom);
      }
      const list = await request(apiKey, 'GET', `/auth_configs?toolkit_slug=${encodeURIComponent(toolkit || '')}`);
      // 404 means no blueprint for this toolkit yet, not a dead grant.
      if (!list.ok && list.status !== 404) return vendorError('/auth_configs', 'GET', list.status);
      // A body this adapter could not read is not an empty list. Treating it as one
      // would skip the two-config refusal below and create a third config. `status` and
      // `proxy` already refuse a malformed body and `listAccounts` rejects by its own
      // contract; `initiate` is the consumer that needs the DATA rather than the
      // status line, and it was left behind when `request` stopped throwing on an
      // unreadable body. Found by adversarial review 2026-09-20.
      if (list.ok && list.malformed) return vendorError('/auth_configs', 'GET', list.status);
      const items = list.ok ? (list.data?.items || list.data?.auth_configs || list.data?.data || []) : [];
      let authConfigId = null;
      if (Array.isArray(items) && items.length > 1) {
        // Two configs for one toolkit is not a default. Refuse rather than bind the wrong grant.
        // Status is null, not list.status: the read succeeded and the vendor did nothing wrong,
        // so reporting its 200 here would say the vendor refused when the refusal is ours.
        return { ...vendorError('/auth_configs', 'GET', null), toolkit, configs: items.length };
      }
      if (Array.isArray(items) && items.length > 0) {
        authConfigId = items[0].id || items[0].auth_config_id || items[0].uuid || null;
      }
      if (!authConfigId) {
        const created = await request(apiKey, 'POST', '/auth_configs', createAuthConfigBody(toolkit, scheme));
        if (!created.ok || created.malformed) return vendorError('/auth_configs', 'POST', created.status);
        authConfigId = created.data?.auth_config?.id
          || created.data?.id
          || created.data?.auth_config_id
          || created.data?.data?.id
          || null;
      }
      // A config was asked for and none came back. Continuing would link against null.
      if (!authConfigId) return vendorError('/auth_configs', 'POST', null);
      // UNVERIFIED against live API on 2026-09-05; Solve confirms
      const linkBody = {
        auth_config_id: authConfigId,
        user_id: userId,
      };
      if (callbackUrl) linkBody.callback_url = callbackUrl;
      const linked = await request(apiKey, 'POST', '/connected_accounts/link', linkBody);
      if (!linked.ok || linked.malformed) return vendorError('/connected_accounts/link', 'POST', linked.status);
      const data = linked.data || {};
      const url = data.redirect_url || data.url || data.link?.redirect_url || data.redirectUrl || null;
      const providerAccountId = data.connected_account_id || data.id || data.connectedAccountId || data.data?.id || null;
      // A link with no url is not a link. Returning one made startConnect write an
      // INITIATED row against a null account that no later call could ever resolve.
      if (!url) return vendorError('/connected_accounts/link', 'POST', linked.status);
      return { kind: 'link', url, providerAccountId };
    },
    async status({ providerAccountId }) {
      if (!apiKey) return 'INACTIVE';
      const path = `/connected_accounts/${encodeURIComponent(providerAccountId || '')}`;
      const res = await request(apiKey, 'GET', path);
      // ABSENT, not INACTIVE. A 404 means this account does not exist at the provider;
      // INACTIVE means it exists and is switched off. Both returned the same word until
      // 2026-09-20, so no caller could tell a deleted grant from a suspended one, and a
      // teardown that removed the local row on "not ACTIVE" would also have removed the
      // row for a grant that was coming back.
      if (res.status === 404) return 'ABSENT';
      // Any other failure, a malformed body, an error field, or a status word the
      // provider never documented is the transport or the provider, not the grant.
      // Return an error object so the gateway leaves the record alone.
      if (!res.ok || res.malformed || !res.data || res.data.error) return vendorError(path, 'GET', res.status);
      const mapped = mapStatus(res.data?.status || res.data?.state || res.data?.data?.status);
      if (!mapped) return vendorError(path, 'GET', res.status);
      return mapped;
    },
    async proxy({ providerAccountId, endpoint, method, body, parameters, binary_body }) {
      if (!apiKey) return vendorError('/tools/execute/proxy', 'POST', 0);
      // Confirmed 2026-09-08: POST /tools/execute/proxy with
      // connected_account_id, endpoint, method. Inner status 400 is wrapped;
      // the vendor body stays here.
      const proxyBody = proxyRequestBody({ providerAccountId, endpoint, method, body, parameters, binary_body });
      const res = await request(apiKey, 'POST', '/tools/execute/proxy', proxyBody);
      if (!res.ok) return vendorError(endpoint || '/tools/execute/proxy', method || 'POST', res.status);
      if (res.malformed || res.data == null || typeof res.data !== 'object') {
        return vendorError(endpoint || '/tools/execute/proxy', method || 'POST', 502);
      }
      const data = res.data;
      const inner = Number(data.status);
      const payload = data.data && typeof data.data === 'object' ? data.data : null;
      if (data.error || data.successful === false || data.success === false
          || (Number.isFinite(inner) && inner >= 400)
          || (payload && (payload.success === false || payload.successful === false))) {
        return vendorError(
          endpoint || '/tools/execute/proxy',
          method || 'POST',
          Number.isFinite(inner) && inner >= 400 ? inner : 400,
          providerCodes(payload),
        );
      }
      return {
        status: Number.isFinite(inner) ? inner : res.status,
        data: await resolveProxyPayload(data),
      };
    },
    async unwrap() {
      return { supported: false };
    },
    async revoke({ providerAccountId }) {
      if (!apiKey) return { supported: false, how: 'not configured', steps: [] };
      const id = encodeURIComponent(providerAccountId || '');
      // Both steps are reported, because both can fail independently and the first one
      // failing is not the same as the operation failing. Measured at the vendor on
      // 2026-09-19: a custom API_KEY toolkit answers the POST with 400 and "does not
      // support programmatic credential revocation", and the DELETE then does the work.
      // Until 2026-09-20 this function awaited that POST and discarded it, so the fact
      // was invisible to every caller.
      const steps = [];
      const revoked = await request(apiKey, 'POST', `/connected_accounts/${id}/revoke`);
      steps.push({ step: 'revoke', status: revoked.status ?? null, ok: Boolean(revoked.ok) });
      const del = await request(apiKey, 'DELETE', `/connected_accounts/${id}`);
      steps.push({ step: 'delete', status: del.status ?? null, ok: Boolean(del.ok) });
      // The step list carries a status code and a step name and never a vendor body,
      // per standards/script-contract.md.
      if (!del.ok) {
        return { ...vendorError(`/connected_accounts/${id}`, 'DELETE', del.status), supported: true, steps };
      }
      return { supported: true, steps };
    },
  };
}
