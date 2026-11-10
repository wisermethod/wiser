export const fixedTime = '2026-07-08T12:00:00.000Z';
export function fixtureNetwork(c) {
  const requests = [];
  return { requests, lookup: async host => c.dns?.[host] || ['93.184.216.34'], fetch: async (url, options) => {
    requests.push(String(url));
    if (options.redirect !== 'manual') throw Error('redirects must be manual');
    const response = c.responses[String(url)];
    if (!response) throw Error('No fixture response');
    return new Response(response.body || '', { status: response.status || 200, headers: response.headers });
  } };
}
