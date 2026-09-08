/**
 * Four-step resolution for an action id. The order is code, not configuration.
 *
 * 1. A connector module that declares the action
 * 2. A registered first-party MCP (v1 stub, always misses)
 * 3. The catalog provider, if it maps the id
 * 4. none -> needs_connector
 */

/**
 * @param {string} id
 * @returns {{ service: string, module: string, action: string } | null}
 */
export function parseActionId(id) {
  if (typeof id !== 'string' || !id) return null;
  const parts = id.split('.');
  if (parts.length < 3) return null;
  if (parts.some((p) => p.length === 0)) return null;
  return {
    service: parts[0],
    module: parts[1],
    action: parts.slice(2).join('.'),
  };
}

/**
 * v1 stub: a registered first-party MCP client is not implemented.
 * Always returns null so resolution falls through to the catalog.
 * @param {string} [_actionId]
 * @returns {null}
 */
export function resolveFirstPartyMcp(_actionId) {
  return null;
}

/**
 * @param {string} actionId
 * @param {object[]} connectors
 * @returns {object | null}
 */
export function resolveConnector(actionId, connectors) {
  const parsed = parseActionId(actionId);
  if (!parsed) return null;
  const list = Array.isArray(connectors) ? connectors : [];
  const connector = list.find((c) => c.id === parsed.service || c.service === parsed.service);
  if (!connector) return null;
  const mod = connector.manifest?.modules?.[parsed.module];
  if (!mod) return null;
  const def = mod.actions?.[parsed.action];
  if (!def) return null;
  const fn = connector.impl?.modules?.[parsed.module]?.[parsed.action];
  if (typeof fn !== 'function') return null;
  return {
    path: 'connector',
    actionId,
    parsed,
    connector,
    def,
    fn,
    auth: mod.auth,
    unwrapToken: Boolean(mod.unwrap_token),
    fallback: mod.fallback === 'none' ? 'none' : 'catalog',
  };
}

/**
 * @param {string} actionId
 * @param {{ toSlug?: (id: string) => string | null }} [catalogProvider]
 * @returns {object | null}
 */
export function resolveCatalog(actionId, catalogProvider) {
  if (!catalogProvider || typeof catalogProvider.toSlug !== 'function') return null;
  const slug = catalogProvider.toSlug(actionId);
  if (!slug) return null;
  return { path: 'catalog', actionId };
}

/**
 * @param {string} actionId
 * @param {{ connectors?: object[], catalogProvider?: { toSlug?: Function } }} deps
 * @returns {{ path: 'connector' | 'first_party_mcp' | 'catalog' | 'none', actionId: string, [k: string]: unknown }}
 */
export function resolveAction(actionId, { connectors = [], catalogProvider } = {}) {
  const connector = resolveConnector(actionId, connectors);
  if (connector) return connector;

  const mcp = resolveFirstPartyMcp(actionId);
  if (mcp) return { path: 'first_party_mcp', actionId, ...mcp };

  const catalog = resolveCatalog(actionId, catalogProvider);
  if (catalog) return catalog;

  return { path: 'none', actionId };
}
