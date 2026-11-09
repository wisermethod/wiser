// Both hosts read cases.json; unexpected requests fail the case instead of using the web.
export function fixtureNetwork(testCase) {
  const requests = [];
  const dnsRequests = [];
  return {
    requests, dnsRequests,
    lookup: async (host) => testCase.dns?.[host] ?? ['93.184.216.34'],
    fetch: async (url) => {
      const href = String(url);
      const target = new URL(href);
      if (target.origin === 'https://cloudflare-dns.com' && target.pathname === '/dns-query') {
        dnsRequests.push(href);
        const host = target.searchParams.get('name');
        const type = target.searchParams.get('type') === 'AAAA' ? 28 : 1;
        const addresses = (testCase.dns?.[host] ?? ['93.184.216.34']).filter((address) => address.includes(':') === (type === 28));
        return Response.json({ Status: 0, TC: false, RD: true, RA: true, AD: false, CD: false, Question: [{ name: host + '.', type }], Answer: addresses.map((data) => ({ name: host, type, TTL: 60, data })) });
      }
      requests.push(href);
      const response = testCase.responses[href];
      if (!response) throw new Error(`Unexpected fixture request: ${href}`);
      const bytes = response.base64 ? Uint8Array.from(atob(response.base64), (c) => c.charCodeAt(0)) : response.body ?? '';
      return new Response(bytes, { status: response.status ?? 200, headers: response.headers });
    },
  };
}
