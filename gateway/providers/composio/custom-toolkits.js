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
];

export function registeredSlug(row = CUSTOM_TOOLKITS[0]) {
  return `CUSTOM_${row.slug}`;
}

export function findCustomToolkit(toolkit) {
  return CUSTOM_TOOLKITS.find((row) =>
    toolkit === row.service || toolkit === row.slug || toolkit === registeredSlug(row)) ?? null;
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
