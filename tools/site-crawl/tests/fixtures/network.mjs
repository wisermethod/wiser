export const FIXED_TIME = '2026-09-19T12:00:00.000Z';
export function fixtureNetwork(c) {
  const requests = [];
  const lookup = async host => c.dns?.[host] ?? ['93.184.216.34'];
  const fetch = async (url, init) => {
    if (init.redirect !== 'manual') throw new Error('Fixture requires manual redirects');
    requests.push(String(url));
    const response = c.responses[String(url)];
    if (!response) throw new Error('Unexpected fixture address');
    const bytes = response.bytes ? Uint8Array.from(response.bytes) : response.body ?? '';
    return new Response(bytes, { status: response.status ?? 200, headers: response.headers });
  };
  return { requests, lookup, fetch };
}
export function cliArgs(input, output) {
  const args = ['crawl', '--output', output];
  const flags = { start: '--start', maxPages: '--max-pages', maxDepth: '--max-depth', delayMs: '--delay-ms', userAgent: '--user-agent' };
  for (const [key, flag] of Object.entries(flags)) if (input[key] !== undefined) args.push(flag, String(input[key]));
  if (input.includeSubdomains) args.push('--include-subdomains');
  return args;
}
