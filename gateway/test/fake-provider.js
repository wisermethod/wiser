import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createAudit } from '../src/audit.js';
import { ConnectionGateway } from '../src/gateway.js';
import { loadConnectors } from '../src/manifest.js';
import { loadPolicy } from '../src/policy.js';
import { JsonFileStore } from '../src/store.js';

const DEFAULT_POLICY = fileURLToPath(new URL('../policy.default.json', import.meta.url));
const DEFAULT_CONNECTORS = fileURLToPath(new URL('../../connectors', import.meta.url));

const DEFAULT_SLUGS = {
  'github.repos.get': 'FAKE_REPOS_GET',
  'github.repos.list_for_user': 'FAKE_REPOS_LIST',
  'github.issues.list': 'FAKE_ISSUES_LIST',
  'github.issues.create': 'FAKE_ISSUES_CREATE',
  'github.users.me': 'FAKE_USERS_ME',
  'cloudflare.dns.list_records': 'FAKE_DNS_LIST',
  'cloudflare.dns.get_record': 'FAKE_DNS_GET',
  'cloudflare.dns.create_record': 'FAKE_DNS_CREATE',
  'cloudflare.dns.update_record': 'FAKE_DNS_UPDATE',
  'cloudflare.dns.delete_record': 'FAKE_DNS_DELETE',
  'fake.echo.run': 'FAKE_ECHO',
  'example.items.get': 'FAKE_ITEM_GET',
};

const DEFAULT_RESULTS = {
  FAKE_REPOS_GET: {
    id: 1,
    name: 'example-repo',
    owner: { login: 'example-org' },
    html_url: 'https://example.com/example-org/example-repo',
  },
  FAKE_REPOS_LIST: [{ name: 'example-repo', owner: { login: 'example-org' } }],
  FAKE_ISSUES_LIST: [],
  FAKE_ISSUES_CREATE: { id: 2, number: 1, title: 'Example', html_url: 'https://example.com/example-org/example-repo/issues/1' },
  FAKE_USERS_ME: { login: 'example-org' },
  FAKE_DNS_LIST: { result: [] },
  FAKE_DNS_GET: { result: { id: 'rec-1', name: 'www.example.com', type: 'A' } },
  FAKE_DNS_CREATE: { result: { id: 'rec-1' } },
  FAKE_DNS_UPDATE: { result: { id: 'rec-1' } },
  FAKE_DNS_DELETE: { result: { id: 'rec-1' } },
  FAKE_ECHO: { ok: true, echoed: true },
  FAKE_ITEM_GET: { id: 'item-1', name: 'example' },
};

/**
 * In-memory AuthProvider and CatalogProvider. Connections toggled by test code.
 * proxy and execute return canned results keyed by endpoint or FAKE_ slug.
 */
export function createFakeProviders() {
  /** @type {Map<string, string>} */
  const accounts = new Map();
  const slugs = { ...DEFAULT_SLUGS };
  const executeResults = { ...DEFAULT_RESULTS };
  const proxyRules = [
    {
      match: (endpoint) => typeof endpoint === 'string' && endpoint.includes('/dns_records/export'),
      result: { status: 200, data: ';; BIND dump for example.com\n', headers: {} },
    },
    {
      match: (endpoint) => typeof endpoint === 'string' && endpoint.includes('/dns_records/batch'),
      result: { status: 200, data: { success: true }, headers: {} },
    },
    {
      match: (endpoint) => typeof endpoint === 'string' && endpoint.includes('/dns_records/import'),
      result: { status: 200, data: { success: true }, headers: {} },
    },
    {
      match: (endpoint) => typeof endpoint === 'string' && endpoint.startsWith('/items/'),
      result: { status: 200, data: { ok: true }, headers: {} },
    },
  ];
  let nextId = 1;

  const auth = {
    name: 'fake',
    isConfigured() {
      return true;
    },
    setupText() {
      return 'Write WISER_AUTH_PROVIDER_KEY=... to the credential file and pass --env <abs file>.';
    },
    async initiate() {
      const id = `fake-acct-${nextId}`;
      nextId += 1;
      accounts.set(id, 'INITIATED');
      return { kind: 'link', url: 'https://example.com/connect', providerAccountId: id };
    },
    async status({ providerAccountId }) {
      return accounts.get(providerAccountId) || 'INACTIVE';
    },
    async proxy({ endpoint, method }) {
      for (const rule of proxyRules) {
        if (rule.match(endpoint, method)) {
          return typeof rule.result === 'function' ? rule.result({ endpoint, method }) : rule.result;
        }
      }
      return { status: 200, data: {}, headers: {} };
    },
    async unwrap() {
      return { supported: false };
    },
    async revoke({ providerAccountId }) {
      accounts.delete(providerAccountId);
      return { supported: true };
    },
    setStatus(providerAccountId, status) {
      accounts.set(providerAccountId, status);
    },
  };

  const catalog = {
    toSlug(actionId) {
      return slugs[actionId] ?? null;
    },
    fromSlug(slug) {
      for (const [id, s] of Object.entries(slugs)) {
        if (s === slug) return id;
      }
      return null;
    },
    async search({ query, service }) {
      const q = (query || '').toLowerCase();
      return Object.keys(slugs).filter((id) => {
        if (service && !id.startsWith(`${service}.`)) return false;
        return !q || id.toLowerCase().includes(q);
      });
    },
    async execute({ actionId, arguments: args }) {
      const slug = slugs[actionId];
      if (!slug) {
        return { status: 0, error: { code: 'vendor_error', endpoint: 'fake', method: 'POST' } };
      }
      const canned = executeResults[slug];
      if (typeof canned === 'function') return canned(args);
      return canned;
    },
    setSlug(actionId, slug) {
      slugs[actionId] = slug;
    },
    setResult(slug, result) {
      executeResults[slug] = result;
    },
  };

  return { auth, catalog, accounts };
}

export function makeHome() {
  return mkdtempSync(join(tmpdir(), 'wiser-gateway-'));
}

/**
 * @param {object} [options]
 */
export async function createTestGateway(options = {}) {
  const home = options.home || makeHome();
  const fake = options.fake || createFakeProviders();
  const store = options.store || new JsonFileStore(home);
  const policy = options.policy || loadPolicy({ home, defaultPath: DEFAULT_POLICY });
  const audit = options.audit || createAudit(home);
  const connectorDirs = options.connectorDirs !== undefined ? options.connectorDirs : [DEFAULT_CONNECTORS];
  const connectors = options.connectors || await loadConnectors(connectorDirs);
  const gw = new ConnectionGateway({
    home,
    role: options.role || 'runtime',
    harness: options.harness || 'test',
    store,
    policy,
    audit,
    authProvider: fake.auth,
    catalogProvider: fake.catalog,
    localFileProvider: options.localFileProvider || null,
    authConfigured: options.authConfigured !== false,
    connectors,
  });
  return { gw, home, store, fake, audit, connectors, policy };
}

export async function putActive(store, fake, { service, module, privilege = 'write', provider = 'catalog' }) {
  const id = `fake-acct-${service}-${module}`;
  fake.auth.setStatus(id, 'ACTIVE');
  return store.putConnection({
    id: `conn-${service}-${module}`,
    service,
    module,
    privilege,
    provider,
    provider_account_id: id,
    scopes: [],
    status: 'ACTIVE',
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  });
}

export { DEFAULT_POLICY, DEFAULT_CONNECTORS };
