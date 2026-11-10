import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crawl, CrawlLimitError } from '../scripts/crawl-core.js';
import { hostedTransport } from '../scripts/lib/hosted.js';
const START = 'https://example.com/';
const LOOKUP = async () => ['93.184.216.34'];
const INPUT = { start: START, delayMs: 0 };
const NOW = { now: () => new Date('2026-09-19T12:00:00.000Z') };
const html = body => new Response(body, { headers: { 'content-type': 'text/html' } });
const simple = body => async url => url.endsWith('/robots.txt') ? new Response('', { status: 404 }) : html(body);
const refused = pattern => error => error instanceof CrawlLimitError && pattern.test(error.message);

test('hosted defaults return the whole ten-page inventory with its bound named', async () => {
  let gets = 0, lookups = 0;
  const fetch = async url => {
    gets++;
    if (url.endsWith('/robots.txt')) return new Response('', { status: 404 });
    const path = new URL(url).pathname;
    if (path === '/') return html('<title>Home</title>' + Array.from({ length: 12 }, (_, i) => `<a href="/p${i}">p</a>`).join(''));
    // 2,048-character titles exercise the headroom used to choose ten pages.
    return html(`<title>${'x'.repeat(2048)}</title><a href="/">home</a>`);
  };
  const result = await crawl(INPUT, [], fetch, async () => { lookups++; return LOOKUP(); }, NOW);
  assert.equal(result.pages.length, 10);
  assert.deepEqual(result.bounds, { maxPages: 10, maxDepth: 5 });
  assert.equal(result.stoppedByBound, true);
  assert.equal(result.reason, 'max-pages');
  assert.equal(result.file, undefined);
  assert.equal(result.files, undefined);
  assert.equal(result.sitemap, null);
  assert.ok(JSON.stringify(result).length < 48000);
  assert.equal(gets, 11, 'robots counts as an HTTP request');
  assert.ok(gets + lookups * 2 <= 48);
});

test('hosted JSON accepts exactly 2 KiB of UTF-8 and refuses one extra byte before network', async () => {
  const input = { ...INPUT, userAgent: 'é' };
  const length = new TextEncoder().encode(JSON.stringify(input)).byteLength;
  input.userAgent += 'x'.repeat(2048 - length);
  assert.equal(new TextEncoder().encode(JSON.stringify(input)).byteLength, 2048);
  const result = await crawl(input, [], simple('<title>Fits</title>'), LOOKUP, NOW);
  assert.equal(result.pages[0].title, 'Fits');
  input.userAgent += 'x';
  await assert.rejects(crawl(input, [], () => assert.fail('fetch'), () => assert.fail('DNS')), refused(/2 KiB/));
});

test('hosted rejects local paths, files, unknown fields and invalid bounded arguments', async t => {
  const cases = [
    [{ ...INPUT, output: '/work' }, [], /local-only/],
    [{ ...INPUT, outputDir: '/work' }, [], /local-only/],
    [{ ...INPUT, sitemap: '/snapshot.json' }, [], /local-only/],
    [{ ...INPUT, sitemapPath: '/snapshot.json' }, [], /local-only/],
    [INPUT, [{ name: 'map.json', mediaType: 'application/json', bytes: new Uint8Array() }], /no input files/],
    [{ ...INPUT, extra: true }, [], /unknown/],
    [{ ...INPUT, maxPages: 11 }, [], /maxPages/],
    [{ ...INPUT, maxPages: '3' }, [], /maxPages/],
    [{ ...INPUT, maxPages: 0 }, [], /maxPages/],
    [{ ...INPUT, maxDepth: 21 }, [], /maxDepth/],
    [{ ...INPUT, delayMs: 251 }, [], /delayMs/],
    [{ ...INPUT, includeSubdomains: 'true' }, [], /boolean/],
    [{ ...INPUT, userAgent: 'bad\r\nheader' }, [], /userAgent/],
    [{ ...INPUT, start: 'https://user:pass@example.com/' }, [], /username or password/],
    [{ ...INPUT, start: 'file:///tmp/page' }, [], /absolute http/],
    [{ ...INPUT, start: 'relative' }, [], /absolute http/],
    [null, [], /JSON object/]
  ];
  for (const [input, files, pattern] of cases) await t.test(pattern.source + ' ' + JSON.stringify(input), async () => {
    await assert.rejects(crawl(input, files, () => assert.fail('fetch'), () => assert.fail('DNS')), refused(pattern));
  });
});

test('hosted requires the host fetch and all-address DNS capabilities', async () => {
  await assert.rejects(crawl(INPUT), refused(/host must supply fetch/));
});

test('DNS and redirects share the 48-request budget; its refusal is never a partial answer', async () => {
  let gets = 0, lookups = 0;
  const fetch = async url => {
    gets++;
    const path = new URL(url).pathname;
    if (path === '/robots.txt') return new Response('', { status: 404 });
    if (path === '/') return html(Array.from({ length: 9 }, (_, i) => `<a href="/p${i}">p</a>`).join(''));
    if (!path.endsWith('/land')) return new Response('', { status: 302, headers: { location: path + '/land' } });
    return html('<title>Land</title>');
  };
  await assert.rejects(crawl(INPUT, [], fetch, async () => { lookups++; return LOOKUP(); }), refused(/48-request budget/));
  assert.ok(gets + lookups * 2 <= 48);
  assert.ok(gets > 10, 'redirect hops consume budget');
});

test('the exact 48-request boundary fits and the 49th GET is never sent', async () => {
  let gets = 0;
  const transport = hostedTransport(async () => { gets++; return new Response(''); }, LOOKUP);
  try {
    for (let i = 0; i < 48; i++) await transport.fetch('https://93.184.216.34/', {});
    await assert.rejects(transport.fetch('https://93.184.216.34/', {}), refused(/48-request budget/));
    assert.equal(gets, 48);
  } finally { transport.close(); }
});

test('bytes accumulate across robots and pages rather than resetting for each body', async () => {
  const fetch = async url => {
    if (url.endsWith('/robots.txt')) return new Response(' '.repeat(400000));
    if (url === START) return html('<a href="/next">n</a>' + ' '.repeat(400000));
    return html(' '.repeat(400000));
  };
  await assert.rejects(crawl(INPUT, [], fetch, LOOKUP), refused(/1 MiB received/));
});

for (const kind of ['robots', 'redirect', 'html', 'pdf', 'non-html', 'error']) test(`oversized ${kind} body is refused whole`, async () => {
  let cancelled = false;
  const stream = () => new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(1024 * 1024 + 1)); },
    cancel() { cancelled = true; }
  });
  const fetch = async url => {
    if (url.endsWith('/robots.txt') && kind !== 'robots') return new Response('', { status: 404 });
    const headers = { 'content-type': kind === 'pdf' ? 'application/pdf' : kind === 'non-html' ? 'image/png' : 'text/html' };
    if (kind === 'redirect') headers.location = '/land';
    return new Response(stream(), { status: kind === 'redirect' ? 302 : kind === 'error' ? 500 : 200, headers });
  };
  await assert.rejects(crawl(INPUT, [], fetch, LOOKUP), refused(/1 MiB received/));
  assert.equal(cancelled, true);
});

test('oversized declared Content-Length is refused and cancelled without reading', async () => {
  let cancelled = false;
  const fetch = async () => new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { 'content-length': '1048577' } });
  await assert.rejects(crawl(INPUT, [], fetch, LOOKUP), refused(/Content-Length/));
  assert.equal(cancelled, true);
});

test('small compressed length never discounts a large decoded Fetch stream', async () => {
  const fetch = async () => new Response('x'.repeat(1048577), { headers: { 'content-encoding': 'gzip', 'content-length': '12' } });
  await assert.rejects(crawl(INPUT, [], fetch, LOOKUP), refused(/1 MiB received/));
});

test('DNS answer bytes count toward the byte budget', async () => {
  const lookup = async () => Array.from({ length: 150000 }, () => '93.184.216.34');
  await assert.rejects(crawl(INPUT, [], () => assert.fail('fetch'), lookup), refused(/1 MiB received/));
});

test('hosted refuses unresolved and malformed DNS, including redirect targets, before their GET', async () => {
  for (const addresses of [[], ['not-an-address'], ['93.184.216.34', '10.0.0.1']]) {
    await assert.rejects(crawl(INPUT, [], () => assert.fail('fetch'), async () => addresses), /does not resolve|private-range/);
  }
  const requests = [];
  const fetch = async url => {
    requests.push(url);
    if (url.endsWith('/robots.txt')) return new Response('', { status: 404 });
    return new Response('', { status: 302, headers: { location: 'https://missing.example.com/' } });
  };
  const result = await crawl({ ...INPUT, includeSubdomains: true }, [], fetch, async host => host.startsWith('missing') ? [] : LOOKUP(), NOW);
  assert.deepEqual(requests, [START + 'robots.txt', START]);
  assert.match(result.errors[0].reason, /does not resolve/);
});

test('every robots redirect hop is screened and a public chain still works', async () => {
  const gets = [], lookups = [];
  const fetch = async url => {
    gets.push(url);
    if (url.endsWith('/robots.txt')) return new Response('', { status: 302, headers: { location: 'https://robots.example.net/rules' } });
    if (url === 'https://robots.example.net/rules') return new Response('User-agent: *\nDisallow:\n');
    return html('<title>Home</title>');
  };
  const result = await crawl(INPUT, [], fetch, async host => { lookups.push(host); return LOOKUP(); }, NOW);
  assert.equal(result.pages.length, 1);
  assert.deepEqual(gets, [START + 'robots.txt', 'https://robots.example.net/rules', START]);
  assert.ok(lookups.filter(host => host === 'robots.example.net').length >= 2);
});

test('cached discovery DNS never authorizes a GET after the host rebinds', async () => {
  let count = 0;
  const lookup = async () => ++count === 1 ? ['93.184.216.34'] : ['10.0.0.1'];
  await assert.rejects(crawl(INPUT, [], () => assert.fail('fetch'), lookup), refused(/private-range/));
});

test('a redirect to embedded credentials is refused without echoing them', async () => {
  const fetch = async url => url.endsWith('/robots.txt') ? new Response('', { status: 404 }) : new Response('', { status: 302, headers: { location: 'https://user:fixture-only@example.com/land' } });
  await assert.rejects(crawl(INPUT, [], fetch, LOOKUP), error => {
    assert.ok(error instanceof CrawlLimitError);
    assert.match(error.message, /username or password/);
    assert.doesNotMatch(error.message, /fixture-only/);
    return true;
  });
});

test('an automatically followed response is refused before its body is read', async () => {
  const response = new Response('');
  Object.defineProperty(response, 'redirected', { value: true });
  await assert.rejects(crawl(INPUT, [], async () => response, LOOKUP), refused(/automatically/));
});

test('47,999 serialized answer characters fit; 48,000 are refused whole', async () => {
  const base = await crawl(INPUT, [], simple('<title>x</title>'), LOOKUP, NOW);
  const baseLength = JSON.stringify(base).length;
  const titleLength = 48000 - baseLength + 1;
  const fits = await crawl(INPUT, [], simple(`<title>${'x'.repeat(titleLength - 1)}</title>`), LOOKUP, NOW);
  assert.equal(JSON.stringify(fits).length, 47999);
  await assert.rejects(crawl(INPUT, [], simple(`<title>${'x'.repeat(titleLength)}</title>`), LOOKUP, NOW), refused(/48,000 serialized/));
});

test('a global deadline spans several successful requests', async () => {
  let elapsed = 0, gets = 0;
  const fetch = async url => { gets++; elapsed += 8000; return url.endsWith('/robots.txt') ? new Response('', { status: 404 }) : html('<title>Late</title>'); };
  await assert.rejects(crawl(INPUT, [], fetch, LOOKUP, { clock: () => elapsed }), refused(/whole invocation exceeded 15 seconds/));
  assert.equal(gets, 2);
});

test('DNS elapsed time belongs to the global deadline', async () => {
  let elapsed = 0;
  await assert.rejects(crawl(INPUT, [], () => assert.fail('fetch'), async () => { elapsed = 15000; return LOOKUP(); }, { clock: () => elapsed }), refused(/15 seconds/));
});

for (const stage of ['DNS', 'fetch', 'body', 'delay']) test(`cancellation stops a pending ${stage} even if the host ignores its signal`, async () => {
  const controller = new AbortController();
  const never = () => new Promise(() => {});
  let cancelled = false;
  const fetch = async url => {
    if (stage === 'fetch') return never();
    if (stage === 'body') return new Response(new ReadableStream({ cancel() { cancelled = true; } }));
    if (url.endsWith('/robots.txt')) { setTimeout(() => controller.abort(), 5); return new Response('', { status: 404 }); }
    return html('<title>Home</title>');
  };
  const timer = setTimeout(() => controller.abort(), 20);
  try {
    await assert.rejects(crawl({ ...INPUT, delayMs: stage === 'delay' ? 250 : 0 }, [], fetch, stage === 'DNS' ? never : LOOKUP, { signal: controller.signal }), refused(/cancelled/));
    if (stage === 'body') assert.equal(cancelled, true);
  } finally { clearTimeout(timer); }
});

test('the real invocation timer stops a DNS lookup that never settles', { timeout: 18000 }, async () => {
  const start = performance.now();
  await assert.rejects(crawl(INPUT, [], () => assert.fail('fetch'), () => new Promise(() => {})), refused(/whole invocation exceeded 15 seconds/));
  assert.ok(performance.now() - start < 17000);
});


test('opaque arrayBuffer-only responses are refused instead of silently treated as empty', async () => {
  const response = { status: 200, headers: new Headers(), arrayBuffer: async () => new ArrayBuffer(1) };
  await assert.rejects(crawl(INPUT, [], async () => response, LOOKUP), refused(/streaming Fetch response/));
});

test('hosted robots wildcard matching can enforce the deadline during expensive patterns', async () => {
  let elapsed = 0;
  const path = 'a'.repeat(900);
  const input = { start: START + path, delayMs: 0 };
  const fetch = async url => {
    assert.ok(url.endsWith('/robots.txt'), 'disallowed work must finish before any page fetch');
    return new Response('User-agent: *\nDisallow: /*' + 'a'.repeat(800) + 'b$\n');
  };
  await assert.rejects(crawl(input, [], fetch, LOOKUP, { clock: () => { elapsed += 200; return elapsed; } }), refused(/15 seconds/));
});
