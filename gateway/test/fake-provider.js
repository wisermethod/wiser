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
  'google.search-console.query': 'FAKE_GOOGLE_SEARCH_CONSOLE_QUERY',
  'google.search-console.sites': 'FAKE_GOOGLE_SEARCH_CONSOLE_SITES',
  'google.search-console.sitemaps': 'FAKE_GOOGLE_SEARCH_CONSOLE_SITEMAPS',
  'google.analytics.run_report': 'FAKE_GA_RUN_REPORT',
  'google.analytics.list_account_summaries': 'FAKE_GA_LIST_ACCOUNT_SUMMARIES',
  'google.analytics.get_property': 'FAKE_GA_GET_PROPERTY',
  'google.drive.find_file': 'FAKE_GOOGLE_DRIVE_FIND_FILE',
  'google.drive.get_file': 'FAKE_GOOGLE_DRIVE_GET_FILE',
  'google.calendar.list_events': 'FAKE_GOOGLE_CALENDAR_LIST_EVENTS',
  'google.calendar.get_event': 'FAKE_GOOGLE_CALENDAR_GET_EVENT',
  'google.gmail.list_messages': 'FAKE_GMAIL_LIST_MESSAGES',
  'google.gmail.get_message': 'FAKE_GMAIL_GET_MESSAGE',
  'google.sheets.search': 'FAKE_SHEETS_SEARCH',
  'google.sheets.get_values': 'FAKE_SHEETS_GET_VALUES',
  'google.docs.search': 'FAKE_DOCS_SEARCH',
  'google.docs.get': 'FAKE_DOCS_GET',
  'google.slides.get': 'FAKE_SLIDES_GET',
  'google.slides.get_page': 'FAKE_SLIDES_GET_PAGE',
  'clarity.analytics.export': 'FAKE_CLARITY_ANALYTICS_EXPORT',
  'replicate.models.list_collections': 'FAKE_REPLICATE_MODELS_LIST_COLLECTIONS',
  'replicate.models.create_prediction': 'FAKE_REPLICATE_MODELS_CREATE_PREDICTION',
  'replicate.models.get_prediction': 'FAKE_REPLICATE_MODELS_GET_PREDICTION',
  'google-vision.images.detect_faces': 'FAKE_GOOGLE_VISION_IMAGES_DETECT_FACES',
  'vercel.projects.list': 'FAKE_VERCEL_PROJECTS_LIST',
  'vercel.projects.get': 'FAKE_VERCEL_PROJECTS_GET',
  'vercel.deployments.list': 'FAKE_VERCEL_DEPLOYMENTS_LIST',
  'vercel.deployments.create': 'FAKE_VERCEL_DEPLOYMENTS_CREATE',

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
  'cloudflare.zones.delete': 'FAKE_ZONE_DELETE',
  'cloudflare.rulesets.create': 'FAKE_RULESET_CREATE',
  'cloudflare.rulesets.get': 'FAKE_RULESET_GET',
  'cloudflare.rulesets.delete': 'FAKE_RULESET_DELETE',
  'cloudflare.rulesets.add_rule': 'FAKE_RULESET_ADD',
  'cloudflare.rulesets.remove_rule': 'FAKE_RULESET_REMOVE',
  'fake.echo.run': 'FAKE_ECHO',
  'example.items.get': 'FAKE_ITEM_GET',
  'zoho.crm.get': 'FAKE_ZOHO_CRM_GET',
  'zoho.crm.search': 'FAKE_ZOHO_CRM_SEARCH',
  'zoho.crm.create': 'FAKE_ZOHO_CRM_CREATE',
  'hubspot.crm.get_contact': 'FAKE_HUBSPOT_CRM_GET_CONTACT',
  'hubspot.crm.search_contacts': 'FAKE_HUBSPOT_CRM_SEARCH_CONTACTS',
  'notion.pages.search': 'FAKE_NOTION_PAGES_SEARCH',
  'notion.pages.get': 'FAKE_NOTION_PAGES_GET',
  'stripe.billing.list_customers': 'FAKE_STRIPE_BILLING_LIST_CUSTOMERS',
  'stripe.billing.get_customer': 'FAKE_STRIPE_BILLING_GET_CUSTOMER',
  'stripe.billing.list_charges': 'FAKE_STRIPE_BILLING_LIST_CHARGES',
  'stripe.billing.get_charge': 'FAKE_STRIPE_BILLING_GET_CHARGE',
  'figma.files.get': 'FAKE_FIGMA_FILES_GET',
  'figma.files.list': 'FAKE_FIGMA_FILES_LIST',
  'zoom.meetings.list': 'FAKE_ZOOM_MEETINGS_LIST',
  'zoom.meetings.get': 'FAKE_ZOOM_MEETINGS_GET',
  'monday.boards.list': 'FAKE_M1_BOARD_LIST',
  'monday.boards.list_items': 'FAKE_M1_BOARD_ITEMS',
  'linkedin.profile.me': 'FAKE_LINKEDIN_PROFILE_ME',
  'linkedin.profile.get_post': 'FAKE_LINKEDIN_PROFILE_GET_POST',
  'huggingface.hub.get_model': 'FAKE_HUGGINGFACE_HUB_GET_MODEL',
  'huggingface.hub.list_datasets': 'FAKE_HUGGINGFACE_HUB_LIST_DATASETS',
  'supabase.projects.list': 'FAKE_SUPABASE_PROJECTS_LIST',
  'supabase.projects.get': 'FAKE_SUPABASE_PROJECTS_GET',
  'microsoft.outlook.list_messages': 'FAKE_M1_MAIL_LIST',
  'microsoft.outlook.get_message': 'FAKE_M1_MAIL_GET',
  'microsoft.calendar.list_events': 'FAKE_M1_MS_CALENDAR_LIST_EVENTS',
  'microsoft.calendar.get_event': 'FAKE_M1_MS_CALENDAR_GET_EVENT',
  'microsoft.onedrive.find': 'FAKE_M1_MS_ONEDRIVE_FIND',
  'microsoft.onedrive.get': 'FAKE_M1_MS_ONEDRIVE_GET',
  'microsoft.sharepoint.list': 'FAKE_FAMILY_MICROSOFT_SHAREPOINT_LIST',
  'microsoft.sharepoint.get': 'FAKE_FAMILY_MICROSOFT_SHAREPOINT_GET',
  'microsoft.excel.search': 'FAKE_M1_MS_EXCEL_SEARCH',
  'microsoft.excel.get_values': 'FAKE_M1_MS_EXCEL_GET_VALUES',
  'microsoft.teams.list': 'FAKE_FAMILY_MICROSOFT_TEAMS_LIST',
  'microsoft.teams.get': 'FAKE_FAMILY_MICROSOFT_TEAMS_GET',
  'zoho.mail.list': 'FAKE_M1_ZF_MAIL_LIST',
  'zoho.mail.get': 'FAKE_M1_ZF_MAIL_GET',
  'zoho.books.list': 'FAKE_FAMILY_ZOHO_BOOKS_LIST',
  'zoho.books.get': 'FAKE_FAMILY_ZOHO_BOOKS_GET',
  'zoho.desk.list': 'FAKE_FAMILY_ZOHO_DESK_LIST',
  'zoho.desk.get': 'FAKE_FAMILY_ZOHO_DESK_GET',
  'zoho.inventory.list': 'FAKE_FAMILY_ZOHO_INVENTORY_LIST',
  'zoho.inventory.get': 'FAKE_FAMILY_ZOHO_INVENTORY_GET',
  'zoho.invoice.list': 'FAKE_M1_ZF_INVOICE_LIST',
  'zoho.invoice.get': 'FAKE_M1_ZF_INVOICE_GET',
  'zoho.bigin.list': 'FAKE_FAMILY_ZOHO_BIGIN_LIST',
  'zoho.bigin.get': 'FAKE_M1_ZF_BIGIN_GET',
};

const DEFAULT_RESULTS = {
  FAKE_GOOGLE_SEARCH_CONSOLE_QUERY: {"rows": [{"keys": ["example"], "clicks": 1, "impressions": 2}]},
  FAKE_GOOGLE_SEARCH_CONSOLE_SITES: {"siteEntry": [{"siteUrl": "https://example.com/", "permissionLevel": "siteOwner"}]},
  FAKE_GOOGLE_SEARCH_CONSOLE_SITEMAPS: {"sitemap": []},
  FAKE_GA_RUN_REPORT: {"rows": [{"metricValues": [{"value": "1"}]}]},
  FAKE_GA_LIST_ACCOUNT_SUMMARIES: {"accountSummaries": []},
  FAKE_GA_GET_PROPERTY: {"name": "properties/1", "displayName": "Example"},
  FAKE_GOOGLE_DRIVE_FIND_FILE: {"files": [{"id": "file-example", "name": "Example", "mimeType": "text/plain", "webViewLink": "https://example.com/file", "display_url": "https://example.com/file"}], "nextPageToken": "token-example", "incompleteSearch": false, "kind": "drive#fileList"},
  FAKE_GOOGLE_DRIVE_GET_FILE: {"display_url": "https://example.com/file", "id": "file-example", "kind": "drive#file", "link_label": "Open", "mimeType": "text/plain", "name": "Example"},
  FAKE_GOOGLE_CALENDAR_LIST_EVENTS: {"items": [{"id": "event-example", "summary": "Example", "status": "confirmed", "htmlLink": "https://example.com/event", "display_url": "https://example.com/event", "start": {"dateTime": "2026-09-08T12:00:00Z"}, "end": {"dateTime": "2026-09-08T13:00:00Z"}}], "nextPageToken": "token-example", "kind": "calendar#events", "accessRole": "owner", "timeZone": "UTC"},
  FAKE_GOOGLE_CALENDAR_GET_EVENT: {"id": "event-example", "summary": "Example", "status": "confirmed", "kind": "calendar#event", "htmlLink": "https://example.com/event", "display_url": "https://example.com/event", "start": {"dateTime": "2026-09-08T12:00:00Z"}, "end": {"dateTime": "2026-09-08T13:00:00Z"}},
  FAKE_GMAIL_LIST_MESSAGES: {"messages": [{"id": "msg-example", "threadId": "thread-example"}], "nextPageToken": "token-example"},
  FAKE_GMAIL_GET_MESSAGE: {"id": "msg-example", "threadId": "thread-example", "labelIds": ["INBOX"]},
  FAKE_SHEETS_SEARCH: {"spreadsheets": [{"id": "sheet-example", "name": "Example"}]},
  FAKE_SHEETS_GET_VALUES: {"valueRanges": [{"range": "Sheet1!A1:B1", "values": [["Example"]]}]},
  FAKE_DOCS_SEARCH: {"documents": [{"id": "doc-example", "name": "Example"}]},
  FAKE_DOCS_GET: {"documentId": "doc-example", "title": "Example"},
  FAKE_SLIDES_GET: {"presentationId": "slides-example", "title": "Example"},
  FAKE_SLIDES_GET_PAGE: {"objectId": "page-example", "pageType": "SLIDE"},
  FAKE_CLARITY_ANALYTICS_EXPORT: {"metrics": [{"metricName": "SessionsCount", "information": [{"sessionsCount": "1"}]}]},
  FAKE_REPLICATE_MODELS_LIST_COLLECTIONS: {"results": [{"name": "Example", "slug": "example"}]},
  FAKE_REPLICATE_MODELS_CREATE_PREDICTION: {"id": "prediction-example", "status": "starting"},
  FAKE_REPLICATE_MODELS_GET_PREDICTION: {"id": "prediction-example", "status": "succeeded", "output": ["https://example.com/output.png"]},
  FAKE_GOOGLE_VISION_IMAGES_DETECT_FACES: {"responses": [{"faceAnnotations": [{"detectionConfidence": 0.98, "landmarks": [{"type": "LEFT_EYE", "position": {"x": 10, "y": 20}}, {"type": "RIGHT_EYE", "position": {"x": 30, "y": 20}}]}]}]},
  FAKE_VERCEL_PROJECTS_LIST: {"projects": [{"id": "project-example", "name": "Example"}]},
  FAKE_VERCEL_PROJECTS_GET: {"id": "project-example", "name": "Example"},
  FAKE_VERCEL_DEPLOYMENTS_LIST: {"deployments": [{"uid": "deployment-example", "name": "Example"}]},
  FAKE_VERCEL_DEPLOYMENTS_CREATE: {"id": "deployment-example", "readyState": "QUEUED"},

  FAKE_REPOS_GET: {
    id: 1,
    name: 'example-repo',
    owner: { login: 'example-org' },
    html_url: 'https://example.com/example-org/example-repo',
  },
  FAKE_REPOS_LIST: { repositories: [{ id: 1, name: 'example-repo', full_name: 'example-org/example-repo', owner: { login: 'example-org' }, private: false }] },
  FAKE_ISSUES_LIST: { issues: [{ number: 1, title: 'Example' }] },
  FAKE_ISSUES_CREATE: { id: 2, number: 1, title: 'Example', html_url: 'https://example.com/example-org/example-repo/issues/1' },
  FAKE_USERS_ME: { login: 'example-org' },
  FAKE_DNS_LIST: { result: [] },
  FAKE_DNS_GET: { result: { id: 'rec-1', name: 'www.example.com', type: 'A' } },
  FAKE_DNS_CREATE: { result: { id: 'rec-1' } },
  FAKE_DNS_UPDATE: { success: true, result: { id: 'rec-1', ttl: 300 }, errors: [], messages: [] },
  FAKE_DNS_DELETE: { success: true, result: { id: 'rec-1' }, errors: [], messages: [] },
  FAKE_ZONE_DELETE: { result: { id: 'zone-example' } },
  FAKE_RULESET_CREATE: { result: { id: 'rs-1' } },
  FAKE_RULESET_GET: { result: { id: 'rs-1' } },
  FAKE_RULESET_DELETE: { result: { id: 'rs-1' } },
  FAKE_RULESET_ADD: { result: { id: 'rule-1' } },
  FAKE_RULESET_REMOVE: { result: { id: 'rule-1' } },
  FAKE_ECHO: { ok: true, echoed: true },
  FAKE_ITEM_GET: { id: 'item-1', name: 'example' },
  FAKE_ZOHO_CRM_GET: {"data": [{"id": "lead-example"}]},
  FAKE_ZOHO_CRM_SEARCH: {"data": [{"id": "lead-example"}]},
  FAKE_ZOHO_CRM_CREATE: {"data": [{"id": "lead-example", "status": "success"}]},
  FAKE_HUBSPOT_CRM_GET_CONTACT: {"id": "contact-example"},
  FAKE_HUBSPOT_CRM_SEARCH_CONTACTS: {"results": [{"id": "contact-example"}]},
  FAKE_NOTION_PAGES_SEARCH: {"results": [{"id": "page-example"}]},
  FAKE_NOTION_PAGES_GET: {"id": "page-example"},
  FAKE_STRIPE_BILLING_LIST_CUSTOMERS: {"data": [{"id": "cus_example"}]},
  FAKE_STRIPE_BILLING_GET_CUSTOMER: {"id": "cus_example"},
  FAKE_STRIPE_BILLING_LIST_CHARGES: {"data": [{"id": "ch_example"}]},
  FAKE_STRIPE_BILLING_GET_CHARGE: {"id": "ch_example"},
  FAKE_FIGMA_FILES_GET: {"name": "Example"},
  FAKE_FIGMA_FILES_LIST: {"files": [{"key": "file-example", "name": "Example"}]},
  FAKE_ZOOM_MEETINGS_LIST: {"meetings": [{"id": "meeting-example"}]},
  FAKE_ZOOM_MEETINGS_GET: {"id": "meeting-example"},
  FAKE_M1_BOARD_LIST: {"boards": [{"id": "board-example", "name": "Example"}]},
  FAKE_M1_BOARD_ITEMS: {"items": [{"id": "item-example", "name": "Example"}]},
  FAKE_LINKEDIN_PROFILE_ME: {"id": "person-example"},
  FAKE_LINKEDIN_PROFILE_GET_POST: {"id": "post-example"},
  FAKE_HUGGINGFACE_HUB_GET_MODEL: {"id": "example/example-model"},
  FAKE_HUGGINGFACE_HUB_LIST_DATASETS: {"datasets": [{"id": "example/example-dataset"}]},
  FAKE_SUPABASE_PROJECTS_LIST: {"projects": [{"id": "project-example", "name": "Example"}]},
  FAKE_SUPABASE_PROJECTS_GET: {"id": "project-example", "name": "Example"},
  FAKE_M1_MAIL_LIST: {"value": [{"id": "msg-example"}]},
  FAKE_M1_MAIL_GET: {"id": "msg-example"},
  FAKE_M1_MS_CALENDAR_LIST_EVENTS: {"value": [{"id": "event-example"}]},
  FAKE_M1_MS_CALENDAR_GET_EVENT: {"id": "event-example"},
  FAKE_M1_MS_ONEDRIVE_FIND: {"value": [{"id": "item-example", "name": "Example"}]},
  FAKE_M1_MS_ONEDRIVE_GET: {"id": "item-example", "name": "Example"},
  FAKE_FAMILY_MICROSOFT_SHAREPOINT_LIST: {"value": [{"id": "list-example"}]},
  FAKE_FAMILY_MICROSOFT_SHAREPOINT_GET: {"id": "list-example"},
  FAKE_M1_MS_EXCEL_SEARCH: {"value": [{"id": "file-example", "name": "Example.xlsx"}]},
  FAKE_M1_MS_EXCEL_GET_VALUES: {"id": "range-example", "values": [["Example"]]},
  FAKE_FAMILY_MICROSOFT_TEAMS_LIST: {"value": [{"id": "team-example"}]},
  FAKE_FAMILY_MICROSOFT_TEAMS_GET: {"id": "team-example"},
  FAKE_M1_ZF_MAIL_LIST: {"data": [{"id": "message-example"}]},
  FAKE_M1_ZF_MAIL_GET: {"data": {"id": "message-example"}},
  FAKE_FAMILY_ZOHO_BOOKS_LIST: {"data": [{"id": "invoice-example"}]},
  FAKE_FAMILY_ZOHO_BOOKS_GET: {"data": {"id": "invoice-example"}},
  FAKE_FAMILY_ZOHO_DESK_LIST: {"data": [{"id": "ticket-example"}]},
  FAKE_FAMILY_ZOHO_DESK_GET: {"data": {"id": "ticket-example"}},
  FAKE_FAMILY_ZOHO_INVENTORY_LIST: {"data": [{"id": "contact-example"}]},
  FAKE_FAMILY_ZOHO_INVENTORY_GET: {"data": {"id": "contact-example"}},
  FAKE_M1_ZF_INVOICE_LIST: {"data": [{"id": "invoice-example"}]},
  FAKE_M1_ZF_INVOICE_GET: {"data": {"id": "invoice-example"}},
  FAKE_FAMILY_ZOHO_BIGIN_LIST: {"data": [{"id": "contact-example"}]},
  FAKE_M1_ZF_BIGIN_GET: {"data": {"id": "contact-example"}},
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
      match: (endpoint, method) => method === 'GET' && typeof endpoint === 'string' && endpoint.startsWith('https://api.search.tinyfish.ai?'),
      result: { status: 200, data: { query: 'example', results: [{ position: 1, site_name: 'Example', title: 'Example', snippet: 'Example content', url: 'https://example.com/' }], total_results: 1, page: 0 }, headers: {} },
    },
    {
      match: (endpoint, method) => method === 'POST' && endpoint === 'https://api.fetch.tinyfish.ai',
      result: { status: 200, data: { results: [{ url: 'https://example.com/', content: 'Example content' }], errors: [] }, headers: {} },
    },
    {
      match: (endpoint, method) => method === 'GET' && typeof endpoint === 'string' && endpoint.startsWith('/api/rest/v4/search/'),
      result: { status: 200, data: { count: 1, next: null, previous: null, results: [{ id: 1, cluster_id: 1, docket_id: 1 }] }, headers: {} },
    },
    {
      match: (endpoint, method) => method === 'GET' && /^\/api\/rest\/v4\/(dockets|clusters)\/[0-9]+\/$/.test(endpoint),
      result: { status: 200, data: { id: 1 }, headers: {} },
    },
    {
      match: (endpoint, method) => method === 'GET' && endpoint === '/api/rest/v4/courts/',
      result: { status: 200, data: { count: 1, next: null, previous: null, results: [{ id: 'example' }] }, headers: {} },
    },
    {
      match: (endpoint) => typeof endpoint === 'string' && endpoint.includes('/dns_records/export'),
      result: { status: 200, data: ';; BIND dump for example.com\n', headers: {} },
    },
    {
      match: (endpoint) => typeof endpoint === 'string' && /\/dns_records\/[^/]+$/.test(endpoint) && !/\/(export|import|batch)(\?|$)/.test(endpoint),
      result: { status: 200, data: { success: true, result: { id: 'rec-1', name: 'www.example.com', type: 'A', content: '192.0.2.1', ttl: 300 }, errors: [], messages: [] }, headers: {} },
    },
    {
      match: (endpoint, method) => method === 'POST' && typeof endpoint === 'string' && endpoint.split('?')[0].endsWith('/dns_records'),
      result: { status: 200, data: { success: true, result: { id: 'rec-1', name: 'example.com', type: 'TXT', content: 'example', ttl: 300 }, errors: [], messages: [] }, headers: {} },
    },
    {
      match: (endpoint) => typeof endpoint === 'string' && endpoint.split('?')[0].endsWith('/dns_records'),
      result: { status: 200, data: { success: true, result: [{ id: 'rec-1', name: 'www.example.com', type: 'A' }], result_info: { count: 1, total_count: 1 } }, headers: {} },
    },
    {
      match: (endpoint) => typeof endpoint === 'string' && endpoint.includes('/pages/projects'),
      result: { status: 200, data: { success: true, result: [{ name: 'example-site' }] }, headers: {} },
    },
    {
      match: (endpoint) => endpoint === '/accounts' || (typeof endpoint === 'string' && endpoint.startsWith('/accounts')),
      result: { status: 200, data: { success: true, result: [{ id: 'acct-1', name: 'Example' }] }, headers: {} },
    },
    {
      match: (endpoint) => typeof endpoint === 'string' && /^\/zones(\/|\?|$)/.test(endpoint) && !endpoint.includes('dns_records'),
      result: { status: 200, data: { success: true, result: [{ id: 'zone-example', name: 'example.com' }] }, headers: {} },
    },
    {
      match: (endpoint) => typeof endpoint === 'string' && endpoint.includes('/dns_records/batch'),
      result: { status: 200, data: { success: true, result: { batch: true }, errors: [], messages: [] }, headers: {} },
    },
    {
      match: (endpoint) => typeof endpoint === 'string' && endpoint.includes('/dns_records/import'),
      result: { status: 200, data: { success: true, result: { recs_added: 1 }, errors: [], messages: [] }, headers: {} },
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
