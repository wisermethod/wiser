import { readFileSync } from 'node:fs';

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
    async initiate({ userId, toolkit, scheme, callbackUrl }) {
      if (!apiKey) return { status: 0, error: { code: 'vendor_error', endpoint: '/auth_configs', method: 'GET' } };
      const list = await request(apiKey, 'GET', `/auth_configs?toolkit_slug=${encodeURIComponent(toolkit || '')}`);
      if (!list.ok) return vendorError('/auth_configs', 'GET', list.status);
      const items = list.data?.items || list.data?.auth_configs || list.data?.data || [];
      let authConfigId = null;
      if (Array.isArray(items) && items.length > 0) {
        authConfigId = items[0].id || items[0].auth_config_id || items[0].uuid || null;
      }
      if (!authConfigId) {
        // UNVERIFIED against live API on 2026-09-05; Solve confirms
        const created = await request(apiKey, 'POST', '/auth_configs', {
          toolkit: { slug: toolkit },
          auth_scheme: scheme,
          use_composio_managed_auth: true,
        });
        if (!created.ok) return vendorError('/auth_configs', 'POST', created.status);
        authConfigId = created.data?.id || created.data?.auth_config_id || created.data?.data?.id || null;
      }
      // UNVERIFIED against live API on 2026-09-05; Solve confirms
      const linkBody = {
        auth_config_id: authConfigId,
        user_id: userId,
      };
      if (callbackUrl) linkBody.callback_url = callbackUrl;
      const linked = await request(apiKey, 'POST', '/connected_accounts/link', linkBody);
      if (!linked.ok) return vendorError('/connected_accounts/link', 'POST', linked.status);
      const data = linked.data || {};
      const url = data.redirect_url || data.url || data.link?.redirect_url || data.redirectUrl || null;
      const providerAccountId = data.connected_account_id || data.id || data.connectedAccountId || data.data?.id || null;
      return { kind: 'link', url, providerAccountId };
    },
    async status({ providerAccountId }) {
      if (!apiKey) return 'INACTIVE';
      const path = `/connected_accounts/${encodeURIComponent(providerAccountId || '')}`;
      const res = await request(apiKey, 'GET', path);
      if (res.status === 404) return 'INACTIVE';
      // Any other failure, a malformed body, an error field, or a status word the
      // provider never documented is the transport or the provider, not the grant.
      // Return an error object so the gateway leaves the record alone.
      if (!res.ok || res.malformed || !res.data || res.data.error) return vendorError(path, 'GET', res.status);
      const mapped = mapStatus(res.data?.status || res.data?.state || res.data?.data?.status);
      if (!mapped) return vendorError(path, 'GET', res.status);
      return mapped;
    },
    async proxy({ providerAccountId, endpoint, method, body, parameters }) {
      if (!apiKey) return vendorError('/tools/execute/proxy', 'POST', 0);
      // Confirmed 2026-09-08: POST /tools/execute/proxy with
      // connected_account_id, endpoint, method. Inner status 400 is wrapped;
      // the vendor body stays here.
      const res = await request(apiKey, 'POST', '/tools/execute/proxy', {
        connected_account_id: providerAccountId,
        endpoint,
        method: method || 'GET',
        body,
        parameters,
      });
      if (!res.ok) return vendorError(endpoint || '/tools/execute/proxy', method || 'POST', res.status);
      const data = res.data || {};
      const inner = Number(data.status);
      const payload = data.data && typeof data.data === 'object' ? data.data : null;
      if (data.error || data.successful === false || data.success === false
          || (Number.isFinite(inner) && inner >= 400)
          || (payload && (payload.success === false || payload.successful === false))) {
        return vendorError(
          endpoint || '/tools/execute/proxy',
          method || 'POST',
          Number.isFinite(inner) && inner >= 400 ? inner : 400,
        );
      }
      return {
        status: Number.isFinite(inner) ? inner : res.status,
        data: data.data ?? data,
        headers: data.headers ?? {},
      };
    },
    async unwrap() {
      return { supported: false };
    },
    async revoke({ providerAccountId }) {
      if (!apiKey) return { supported: false, how: 'not configured' };
      const id = encodeURIComponent(providerAccountId || '');
      await request(apiKey, 'POST', `/connected_accounts/${id}/revoke`);
      const del = await request(apiKey, 'DELETE', `/connected_accounts/${id}`);
      if (!del.ok) return vendorError(`/connected_accounts/${providerAccountId}`, 'DELETE', del.status);
      return { supported: true };
    },
  };
}
