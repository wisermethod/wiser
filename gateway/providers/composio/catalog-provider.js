import { readFileSync } from 'node:fs';
import { fromSlug, toSlug, toolkitsFor } from './mapping.js';

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
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch { data = null; malformed = true; }
  }
  return { ok, status: res.status, data, malformed, endpoint: path, method };
}

function vendorError(endpoint, method, status) {
  return { status, error: { code: 'vendor_error', endpoint, method } };
}

/**
 * A 2xx transport can still carry a failed execution. Composio uses
 * `successful: false` and `error`; Cloudflare's catalog payload uses
 * `success: false` on the inner object. Confirmed 2026-09-08: GitHub
 * catalog execute returns the vendor object; Cloudflare nested
 * `{ success: false }` must not leave this adapter.
 * @param {object|null} data
 * @param {boolean} [malformed]
 * @returns {{ failed: boolean, httpStatus: number|null }}
 */
export function providerExecuteFailed(data, malformed = false) {
  if (malformed) return { failed: true, httpStatus: 0 };
  if (!data || typeof data !== 'object') return { failed: false, httpStatus: null };
  const inner = Number(data.status);
  if (data.successful === false || data.success === false || data.error
      || (Number.isFinite(inner) && inner >= 400)) {
    return { failed: true, httpStatus: Number.isFinite(inner) && inner >= 400 ? inner : 400 };
  }
  const payload = data.data ?? data.response;
  if (payload && typeof payload === 'object'
      && (payload.success === false || payload.successful === false)) {
    const nested = Number(payload.status);
    return { failed: true, httpStatus: Number.isFinite(nested) && nested >= 400 ? nested : 400 };
  }
  return { failed: false, httpStatus: null };
}

/** Search all toolkits of a facade, or just the requested module's toolkit. */
export async function searchMappedActions({ service, module, query }, requestTools) {
  const toolkits = service ? toolkitsFor(service, module) : [null];
  const actions = new Set();
  for (const toolkit of toolkits) {
    const params = new URLSearchParams();
    if (toolkit) params.set('toolkit_slug', toolkit);
    if (query) params.set('query', query);
    const qs = params.toString();
    const res = await requestTools(`/tools${qs ? `?${qs}` : ''}`);
    if (!res.ok) continue;
    const items = res.data?.items || res.data?.tools || res.data?.data || [];
    for (const item of Array.isArray(items) ? items : []) {
      const slug = item.slug || item.tool_slug || item.name;
      const actionId = slug ? fromSlug(slug) : null;
      if (!actionId) continue;
      const [foundService, foundModule] = actionId.split('.');
      if (service && service !== foundService) continue;
      if (module && module !== foundModule) continue;
      actions.add(actionId);
    }
  }
  return [...actions];
}

/**
 * @param {{ envPath?: string | null }} opts
 */
export function createCatalogProvider({ envPath } = {}) {
  const apiKey = readApiKey(envPath || null);

  return {
    toSlug,
    fromSlug,
    isConfigured() {
      return Boolean(apiKey);
    },
    async search({ service, module, query }) {
      if (!apiKey) return [];
      return searchMappedActions({ service, module, query },
        (path) => request(apiKey, 'GET', path));
    },
    async execute({ actionId, userId, providerAccountId, arguments: args }) {
      if (!apiKey) return vendorError('/tools/execute', 'POST', 0);
      const slug = toSlug(actionId);
      if (!slug) return vendorError('/tools/execute', 'POST', 0);
      const path = `/tools/execute/${encodeURIComponent(slug)}`;
      // Confirmed 2026-09-08: POST /tools/execute/:slug with user_id,
      // connected_account_id, arguments. GitHub returns the vendor object.
      const res = await request(apiKey, 'POST', path, {
        user_id: userId,
        connected_account_id: providerAccountId,
        arguments: args ?? {},
      });
      if (!res.ok) return vendorError(path, 'POST', res.status);
      const data = res.data || {};
      const failed = providerExecuteFailed(data, res.malformed);
      if (failed.failed) {
        return vendorError(path, 'POST', failed.httpStatus ?? res.status);
      }
      return data.data ?? data.response ?? data;
    },
  };
}
