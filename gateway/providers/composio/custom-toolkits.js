import { installToolkitSlug } from '../../src/installs.js';

/** Hosted custom toolkits. Keys are collected by hosted connect, never here. */
export const CUSTOM_TOOLKITS = [
  {
    service: 'courtlistener',
    slug: 'COURTLISTENER',
    name: 'CourtListener',
    app_url: 'https://www.courtlistener.com',
    auth_schemes: [{ mode: 'API_KEY', headers: { Authorization: 'Token {{generic_api_key}}' } }],
  },
  {
    service: 'tinyfish',
    slug: 'TINYFISH',
    name: 'TinyFish',
    app_url: 'https://tinyfish.ai',
    auth_schemes: [{ mode: 'API_KEY', headers: { 'X-API-Key': '{{generic_api_key}}' } }],
  },
  {
    service: 'google-apis',
    slug: 'GOOGLE_APIS',
    name: 'Google APIs',
    // app_url is cosmetic: every module uses an absolute URL, so this host is unused on the wire.
    app_url: 'https://pagespeedonline.googleapis.com',
    auth_schemes: [{ mode: 'API_KEY', headers: { 'X-Goog-Api-Key': '{{generic_api_key}}' } }],
  },
];

export function registeredSlug(row = CUSTOM_TOOLKITS[0]) {
  return `CUSTOM_${row.slug}`;
}

export function findCustomToolkit(toolkit) {
  return CUSTOM_TOOLKITS.find((row) =>
    toolkit === row.service || toolkit === row.slug || toolkit === registeredSlug(row)) ?? null;
}

export function installToolkitRow(origin) {
  return {
    slug: installToolkitSlug(origin),
    name: 'Wiser CRM',
    app_url: origin,
    auth_schemes: [{
      mode: 'API_KEY',
      headers: { 'CF-Access-Client-Id': '{{generic_id}}', 'CF-Access-Client-Secret': '{{generic_api_key}}' },
      api_key_field: { display_name: 'Client Secret', description: "The service token's Client Secret" },
      additional_fields: { generic_id: { display_name: 'Client ID', description: "The service token's Client ID, ending in .access" } },
    }],
  };
}

export function createCustomToolkitBody(row) {
  const { slug, name, app_url, auth_schemes } = row;
  return {
    slug,
    toolkit_config: {
      name,
      app_url,
      auth_schemes: structuredClone(auth_schemes),
    },
  };
}
