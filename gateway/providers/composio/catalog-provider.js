import { readFileSync } from 'node:fs';
import { fromSlug, toSlug, toolkitFor } from './mapping.js';

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
    async search({ service, query }) {
      if (!apiKey) return [];
      const params = new URLSearchParams();
      const toolkit = service ? toolkitFor(service) : null;
      if (toolkit) params.set('toolkit_slug', toolkit);
      if (query) params.set('query', query);
      const qs = params.toString();
      const res = await request(apiKey, 'GET', `/tools${qs ? `?${qs}` : ''}`);
      if (!res.ok) return [];
      const items = res.data?.items || res.data?.tools || res.data?.data || [];
      const actions = [];
      for (const item of Array.isArray(items) ? items : []) {
        const slug = item.slug || item.tool_slug || item.name;
        const actionId = slug ? fromSlug(slug) : null;
        if (actionId) actions.push(actionId);
      }
      return actions;
    },
    async execute({ actionId, userId, providerAccountId, arguments: args }) {
      if (!apiKey) return vendorError('/tools/execute', 'POST', 0);
      const slug = toSlug(actionId);
      if (!slug) return vendorError('/tools/execute', 'POST', 0);
      const path = `/tools/execute/${encodeURIComponent(slug)}`;
      // UNVERIFIED against live API on 2026-09-05; Solve confirms
      const res = await request(apiKey, 'POST', path, {
        user_id: userId,
        connected_account_id: providerAccountId,
        arguments: args ?? {},
      });
      if (!res.ok) return vendorError(path, 'POST', res.status);
      const data = res.data || {};
      // UNVERIFIED against live API on 2026-09-05; Solve confirms the envelope shape.
      // A 2xx transport with `successful: false` or an `error` field is a failed
      // execution, and its body stays here.
      const inner = Number(data.status);
      if (res.malformed || data.successful === false || data.error || (Number.isFinite(inner) && inner >= 400)) {
        return vendorError(path, 'POST', Number.isFinite(inner) && inner >= 400 ? inner : res.status);
      }
      return data.data ?? data.response ?? data;
    },
  };
}
