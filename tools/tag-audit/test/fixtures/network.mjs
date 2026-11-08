// One in-memory network for the portable host and both CLI versions. The follow
// arm independently models Fetch, checked against offline undici MockAgent tests.
import { Buffer } from 'node:buffer';

export function fixtureNetwork(c) {
  const requests = [], options = [], cancelled = [];
  const lookup = async host => c.dns?.[host] ?? ['93.184.216.34'];
  const fetch = async (url, init = {}) => {
    let current = new URL(url).href;
    for (let hop = 0; ; hop++) {
      requests.push(current);
      options.push(init);
      const responseUrl = new URL(current);
      responseUrl.hash = ''; // Response.url, like the HTTP request path, omits fragments.
      const data = c.responses[current] ?? c.responses[responseUrl.href];
      if (!data) throw new Error(`Unexpected fixture request: ${current}`);
      if (data.error) throw Object.assign(new Error('fixture failure'), { name: data.error });
      const status = data.status ?? 200;
      const headers = new Headers(data.headers);
      let location = headers.get('location');
      if (init.redirect === 'follow' && [301, 302, 303, 307, 308].includes(status) && location !== null) {
        if (hop >= 20) throw new Error('Redirect limit');
        if ([...location].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) > 126)) {
          location = Buffer.from(location, 'binary').toString('utf8');
        }
        const next = new URL(location, responseUrl);
        // Match the installed Fetch implementation's empty-hash fallback too.
        if (!next.hash) next.hash = new URL(current).hash;
        if (!/^https?:$/.test(next.protocol)) throw new Error('Non-HTTP redirect');
        if (next.username || next.password) throw new Error('Credential-bearing redirect');
        current = next.href;
        continue;
      }
      const body = data.chunks ? new ReadableStream({
        start(controller) { for (const chunk of data.chunks) controller.enqueue(new TextEncoder().encode(chunk)); },
        cancel() { cancelled.push(current); }
      }) : data.body ?? '';
      const response = new Response(body, { status, headers: data.headers });
      Object.defineProperty(response, 'url', { value: responseUrl.href });
      return response;
    }
  };
  return { requests, options, cancelled, fetch, lookup };
}
