/**
 * Our action id <-> this provider's tool slug, both directions.
 * A slug appears in this file and in a manifest's auth.toolkit, nowhere else.
 */

// cloudflare.dns.get_record: confirmed proxy execute 2026-09-08; no catalog row.
// Envelope: { success, result: { id, name, type, content, ttl, ... }, errors, messages }.
// cloudflare.dns.list_records: confirmed proxy execute 2026-09-08; result array plus result_info.
// cloudflare.dns.create_record: confirmed proxy execute 2026-09-08; single-record result.
// cloudflare.dns.export_zone: confirmed proxy execute; { zone_file } BIND text.
// cloudflare.dns.batch: confirmed proxy execute 2026-09-08; return data only.
// cloudflare.dns.import_zone: JSON HTTP 400 on 2026-09-08; multipart via binary_body confirmed live 2026-09-08, recs_added 1, no headers.
const ROWS = [
  ['github.repos.get', 'GITHUB_GET_A_REPOSITORY'], // confirmed 2026-09-08 catalog execute, wisermethod/wiser
  ['github.repos.list_for_user', 'GITHUB_LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER'], // confirmed catalog execute 2026-09-08; { repositories }, items: id, name, full_name, owner.login, private
  ['github.issues.list', 'GITHUB_LIST_REPOSITORY_ISSUES'], // confirmed catalog execute 2026-09-08; { issues }, wisermethod/wiser open was empty
  ['github.issues.create', 'GITHUB_CREATE_AN_ISSUE'], // confirmed catalog execute 2026-09-09; vendor issue object with id, number, title, html_url, state; needs_confirmation without confirm; confirm: true on wisermethod/wiser
  ['github.users.me', 'GITHUB_GET_THE_AUTHENTICATED_USER'], // read from the docs on 2026-09-05
  ['cloudflare.dns.create_record', 'CLOUDFLARE_API_KEY_CREATE_DNS_RECORD'],
  ['cloudflare.dns.update_record', 'CLOUDFLARE_API_KEY_OVERWRITE_DNS_RECORD'], // confirmed catalog execute 2026-09-08
  ['cloudflare.dns.delete_record', 'CLOUDFLARE_API_KEY_DELETE_DNS_RECORD'],
  ['cloudflare.zones.delete', 'CLOUDFLARE_API_KEY_DELETE_ZONE'],
  ['cloudflare.rulesets.create', 'CLOUDFLARE_API_KEY_CREATE_RULESET'], // grant ACTIVE 2026-09-08; not run (confirmation: once)
  ['cloudflare.rulesets.get', 'CLOUDFLARE_API_KEY_GET_RULESET'], // grant ACTIVE 2026-09-08; invented id catalog HTTP 400; live envelope UNVERIFIED
  ['cloudflare.rulesets.delete', 'CLOUDFLARE_API_KEY_DELETE_RULESET'],
  ['cloudflare.rulesets.add_rule', 'CLOUDFLARE_API_KEY_CREATE_RULE_IN_RULESET'],
  ['cloudflare.rulesets.remove_rule', 'CLOUDFLARE_API_KEY_DELETE_RULE_FROM_RULESET'],
  // Toolkit pages checked 2026-09-08. New catalog envelopes unverified until each human connect.
  ['google.search-console.query', 'GOOGLE_SEARCH_CONSOLE_SEARCH_ANALYTICS_QUERY'], // confirmed catalog 2026-09-08; { responseAggregationType }, rows omitted when the window is empty
  ['google.search-console.sites', 'GOOGLE_SEARCH_CONSOLE_LIST_SITES'], // confirmed catalog 2026-09-08; { siteEntry }, items: siteUrl, permissionLevel
  ['google.search-console.sitemaps', 'GOOGLE_SEARCH_CONSOLE_LIST_SITEMAPS'], // confirmed catalog 2026-09-08; { sitemap } array
  ['google.analytics.run_report', 'GOOGLE_ANALYTICS_RUN_REPORT'], // confirmed catalog 2026-09-08; rows, rowCount, dimensionHeaders, metricHeaders, metadata, kind
  ['google.analytics.list_account_summaries', 'GOOGLE_ANALYTICS_LIST_ACCOUNT_SUMMARIES'], // confirmed catalog 2026-09-08; { accountSummaries }, nested propertySummaries
  ['google.analytics.get_property', 'GOOGLE_ANALYTICS_GET_PROPERTY'], // confirmed catalog 2026-09-08; name, displayName, propertyType, timeZone, currencyCode
  ['google.drive.find_file', 'GOOGLEDRIVE_FIND_FILE'], // confirmed catalog 2026-09-08; { files, nextPageToken, incompleteSearch, kind, composio_execution_message }, items: id, name, mimeType, webViewLink, display_url
  ['google.drive.get_file', 'GOOGLEDRIVE_GET_FILE_METADATA'], // confirmed catalog 2026-09-08; display_url, id, kind, link_label, mimeType, name
  ['google.calendar.list_events', 'GOOGLECALENDAR_EVENTS_LIST'], // confirmed catalog 2026-09-08; { items, nextPageToken, kind, accessRole, timeZone }, items: id, status, start, end, htmlLink, display_url
  ['google.calendar.get_event', 'GOOGLECALENDAR_EVENTS_GET'], // confirmed catalog 2026-09-08; id, status, start, end, htmlLink, display_url, kind
  ['google.gmail.list_messages', 'GMAIL_FETCH_EMAILS'], // catalog docs 2026-09-09; live envelope UNVERIFIED
  ['google.gmail.get_message', 'GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID'], // catalog docs 2026-09-09; live envelope UNVERIFIED
  ['google.sheets.search', 'GOOGLESHEETS_SEARCH_SPREADSHEETS'], // catalog docs 2026-09-09; live envelope UNVERIFIED
  ['google.sheets.get_values', 'GOOGLESHEETS_BATCH_GET'], // catalog docs 2026-09-09; live envelope UNVERIFIED
  ['google.docs.search', 'GOOGLEDOCS_SEARCH_DOCUMENTS'], // catalog docs 2026-09-09; live envelope UNVERIFIED
  ['google.docs.get', 'GOOGLEDOCS_GET_DOCUMENT_BY_ID'], // catalog docs 2026-09-09; live envelope UNVERIFIED
  ['google.slides.get', 'GOOGLESLIDES_PRESENTATIONS_GET'], // catalog docs 2026-09-09; live envelope UNVERIFIED
  ['google.slides.get_page', 'GOOGLESLIDES_PRESENTATIONS_PAGES_GET'], // catalog docs 2026-09-09; live envelope UNVERIFIED
  ['clarity.analytics.export', 'MICROSOFT_CLARITY_DATA_EXPORT'],
  ['replicate.models.list_collections', 'REPLICATE_COLLECTIONS_LIST'], // confirmed catalog 2026-09-08; { results, next, previous }, items: name, slug, description
  ['replicate.models.create_prediction', 'REPLICATE_PREDICTIONS_CREATE'],
  ['replicate.models.get_prediction', 'REPLICATE_GET_PREDICTION'],
  ['google-vision.images.detect_faces', 'GOOGLE_CLOUD_VISION_ANNOTATE_IMAGES'], // grant ACTIVE 2026-09-08; live envelope UNVERIFIED until a billed detect with an operator-supplied image
  ['vercel.projects.list', 'VERCEL_GET_PROJECTS'], // confirmed catalog 2026-09-08; { projects, pagination }
  ['vercel.projects.get', 'VERCEL_GET_PROJECT2'],
  ['vercel.deployments.list', 'VERCEL_GET_DEPLOYMENTS'], // confirmed catalog 2026-09-08; { deployments, pagination }
  ['vercel.deployments.create', 'VERCEL_CREATE_NEW_DEPLOYMENT'],
  ['zoho.crm.get', 'ZOHO_GET_ZOHO_RECORDS'], // catalog docs 2026-09-09; live envelope UNVERIFIED
  ['zoho.crm.search', 'ZOHO_SEARCH_LEADS'], // catalog docs 2026-09-09; live envelope UNVERIFIED
  ['zoho.crm.create', 'ZOHO_CREATE_LEAD'], // catalog docs 2026-09-09; live envelope UNVERIFIED
  ['hubspot.crm.get_contact', 'HUBSPOT_READ_CONTACT'], // catalog docs 2026-09-09; live envelope UNVERIFIED
  ['hubspot.crm.search_contacts', 'HUBSPOT_SEARCH_CONTACTS_BY_CRITERIA'], // catalog docs 2026-09-09; live envelope UNVERIFIED
  ['notion.pages.search', 'NOTION_SEARCH_NOTION_PAGE'], // catalog docs 2026-09-09; live envelope UNVERIFIED
  ['notion.pages.get', 'NOTION_RETRIEVE_PAGE'], // catalog docs 2026-09-09; live envelope UNVERIFIED
  ['stripe.billing.list_customers', 'STRIPE_LIST_CUSTOMERS'], // catalog docs 2026-09-09; live envelope UNVERIFIED
  ['stripe.billing.get_customer', 'STRIPE_RETRIEVE_CUSTOMER'], // catalog docs 2026-09-09; live envelope UNVERIFIED
  ['stripe.billing.list_charges', 'STRIPE_LIST_CHARGES'], // catalog docs 2026-09-09; live envelope UNVERIFIED
  ['stripe.billing.get_charge', 'STRIPE_RETRIEVE_CHARGE'], // catalog docs 2026-09-09; live envelope UNVERIFIED
  ['figma.files.get', 'FIGMA_GET_FILE_METADATA'], // catalog docs 2026-09-09; live envelope UNVERIFIED
  ['figma.files.list', 'FIGMA_GET_FILES_IN_A_PROJECT'], // catalog docs 2026-09-09; live envelope UNVERIFIED
  ['zoom.meetings.list', 'ZOOM_LIST_MEETINGS'], // catalog docs 2026-09-09; live envelope UNVERIFIED
  ['zoom.meetings.get', 'ZOOM_GET_A_MEETING'], // catalog docs 2026-09-09; live envelope UNVERIFIED
  ['monday.boards.list', 'MONDAY_BOARDS'], // catalog docs 2026-09-09; live envelope UNVERIFIED
  ['monday.boards.list_items', 'MONDAY_ITEMS_PAGE'], // catalog docs 2026-09-09; live envelope UNVERIFIED
  ['linkedin.profile.me', 'LINKEDIN_GET_MY_INFO'], // catalog docs 2026-09-09; live envelope UNVERIFIED
  ['linkedin.profile.get_post', 'LINKEDIN_GET_POST_CONTENT'], // catalog docs 2026-09-09; live envelope UNVERIFIED
  ['huggingface.hub.get_model', 'HUGGING_FACE_GET_MODEL_INFO'], // catalog docs 2026-09-09; live envelope UNVERIFIED
  ['huggingface.hub.list_datasets', 'HUGGING_FACE_LIST_DATASETS'], // catalog docs 2026-09-09; live envelope UNVERIFIED
  ['supabase.projects.list', 'SUPABASE_LIST_ALL_PROJECTS'], // catalog docs 2026-09-09; live envelope UNVERIFIED
  ['supabase.projects.get', 'SUPABASE_GET_PROJECT'], // catalog docs 2026-09-09; live envelope UNVERIFIED
  ['microsoft.outlook.list_messages', 'OUTLOOK_LIST_MESSAGES'], // catalog docs 2026-09-09; live envelope UNVERIFIED
  ['microsoft.outlook.get_message', 'OUTLOOK_GET_MESSAGE'], // catalog docs 2026-09-09; live envelope UNVERIFIED
];

const TO_SLUG = new Map(ROWS);
const FROM_SLUG = new Map(ROWS.map(([id, slug]) => [slug, id]));

const TOOLKITS = {
  tinyfish: 'CUSTOM_TINYFISH',
  courtlistener: 'CUSTOM_COURTLISTENER',
  github: 'GITHUB',
  cloudflare: 'CLOUDFLARE_API_KEY',
  google: {
    'search-console': 'GOOGLE_SEARCH_CONSOLE',
    analytics: 'GOOGLE_ANALYTICS',
    drive: 'GOOGLEDRIVE',
    calendar: 'GOOGLECALENDAR',
    gmail: 'GMAIL',
    sheets: 'GOOGLESHEETS',
    docs: 'GOOGLEDOCS',
    slides: 'GOOGLESLIDES',
  },
  clarity: 'MICROSOFT_CLARITY',
  replicate: 'REPLICATE',
  'google-vision': 'GOOGLE_CLOUD_VISION',
  vercel: 'VERCEL',
  zoho: 'ZOHO',
  hubspot: 'HUBSPOT',
  notion: 'NOTION',
  stripe: 'STRIPE',
  figma: 'FIGMA',
  zoom: 'ZOOM',
  monday: 'MONDAY',
  linkedin: 'LINKEDIN',
  huggingface: 'HUGGING_FACE',
  supabase: 'SUPABASE',
  microsoft: {
    outlook: 'OUTLOOK',
  },
};

/**
 * @param {string} actionId
 * @returns {string | null}
 */
export function toSlug(actionId) {
  return TO_SLUG.get(actionId) ?? null;
}

/**
 * @param {string} slug
 * @returns {string | null}
 */
export function fromSlug(slug) {
  return FROM_SLUG.get(slug) ?? null;
}

/**
 * @param {string} service
 * @returns {string | null}
 */
export function toolkitFor(service, module) {
  const toolkit = TOOLKITS[service];
  if (typeof toolkit === 'string') return toolkit;
  return toolkit?.[module] ?? null;
}

export function toolkitsFor(service, module) {
  const toolkit = toolkitFor(service, module);
  if (toolkit) return [toolkit];
  if (module) return [];
  const modules = TOOLKITS[service];
  return modules && typeof modules === 'object' ? [...new Set(Object.values(modules))] : [];
}

// Documentation checked 2026-09-08, no live account access in the builder:
// https://docs.composio.dev/toolkits/google_search_console
// https://docs.composio.dev/toolkits/google_analytics
// https://docs.composio.dev/toolkits/googledrive
// https://docs.composio.dev/toolkits/googlecalendar
// https://docs.composio.dev/toolkits/gmail
// https://docs.composio.dev/toolkits/googlesheets
// https://docs.composio.dev/toolkits/googledocs
// https://docs.composio.dev/toolkits/googleslides
// https://docs.composio.dev/toolkits/microsoft_clarity
// https://docs.composio.dev/toolkits/replicate
// https://docs.composio.dev/toolkits/google_cloud_vision
// https://docs.composio.dev/toolkits/vercel
// https://docs.composio.dev/toolkits/zoho
// https://docs.composio.dev/toolkits/hubspot
// https://docs.composio.dev/toolkits/notion
// https://docs.composio.dev/toolkits/stripe
// https://docs.composio.dev/toolkits/figma
// https://docs.composio.dev/toolkits/zoom
// https://docs.composio.dev/toolkits/monday
// https://docs.composio.dev/toolkits/linkedin
// https://docs.composio.dev/toolkits/hugging_face
// https://docs.composio.dev/toolkits/supabase
// https://docs.composio.dev/toolkits/outlook
