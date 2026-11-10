import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { auditPage, resolveTarget, screenDestination } from '../scripts/audit-core.js';
import { MockAgent, fetch as undiciFetch } from 'undici';
import { mainCli, offlineEnv } from '../../lib/tests/main-cli.js';
import { fixtureNetwork } from './fixtures/network.mjs';
import cases from './fixtures/cases.json' with { type: 'json' };
const cli = fileURLToPath(new URL('../scripts/tag-audit.js', import.meta.url));
const preload = fileURLToPath(new URL('./fixtures/cli-network.mjs', import.meta.url));
let baseline;
const cleanup = [];
before(() => { baseline = mainCli({ after: fn => cleanup.push(fn) }, 'tag-audit'); });
after(() => cleanup.forEach(fn => fn()));
const bytes = ({ status, stdout, stderr }) => ({ status, stdout, stderr });
// v2026.11.08.2 (b11bd900) intentionally screens every redirect and local-use
// NAT64 address; TOOL.md documents the named refusals. main records that released
// CLI, while fetch retains the independent Fetch-follow oracle where it differs.
for (const c of cases) test(c.name, async () => {
  const run = (script, main = false) => spawnSync(process.execPath,
    ['--import', preload, script, 'audit', '--url', c.url], {
      env: offlineEnv({ TAG_AUDIT_CASE: c.name, TAG_AUDIT_MAIN: main ? '1' : '' }), encoding: 'utf8', timeout: 10000
    });
  const old = run(baseline, true), current = run(cli);
  assert.deepEqual(bytes(old), c.main, 'main still matches the recorded bytes');
  const expected = c.change ? { status: 1, stdout: '', stderr: c.error + '\n' } : c.main;
  assert.deepEqual(bytes(current), expected, c.change ?? 'CLI byte compatibility');
  const network = fixtureNetwork(c);
  if (expected.status) {
    await assert.rejects(auditPage({ url: c.url }, network.fetch, network.lookup), { message: expected.stderr.trim() });
  } else {
    const result = await auditPage({ url: c.url }, network.fetch, network.lookup);
    assert.equal(JSON.stringify(result) + '\n', current.stdout);
    if (c.options) {
      const cappedNetwork = fixtureNetwork(c);
      const capped = await auditPage({ url: c.url }, cappedNetwork.fetch, cappedNetwork.lookup, c.options);
      const absent = JSON.parse(cases[0].main.stdout);
      assert.deepEqual(capped, { ...absent, html_bytes: 13, body_truncated: true });
    }
  }
  assert.deepEqual(network.requests, c.requests, 'refused hops are never requested');
  for (const options of network.options) {
    assert.equal(options.redirect, 'manual');
    assert.equal(options.headers['User-Agent'], 'Mozilla/5.0 (compatible; tag-audit; instrumentation audit)');
  }
});

test('host resolution rule refuses empty, malformed and failed DNS before fetch', async () => {
  for (const addresses of [[], ['not-an-address'], ['93.184.216.34', 'not-an-address']]) {
    let fetched = false;
    await assert.rejects(auditPage({ url: 'https://page.test/' }, async () => { fetched = true; }, async () => addresses,
      { requireResolved: true }), /a hostname that does not resolve/);
    assert.equal(fetched, false);
  }
  await assert.rejects(auditPage({ url: 'https://page.test/' }, () => assert.fail('fetch'), () => { throw new Error('DNS'); },
    { requireResolved: true }), /a hostname that does not resolve/);
});

test('DNS and embedded private redirect targets are screened, including reserved NAT64', async () => {
  for (const target of ['http://[::ffff:127.0.0.1]/', 'http://[64:ff9b:1:abcd::1]/', 'http://inside.test/']) {
    const c = { responses: { 'https://page.test/': { status: 308, headers: { location: target } } }, dns: { 'inside.test': ['10.0.0.1'] } };
    const network = fixtureNetwork(c);
    await assert.rejects(auditPage({ url: 'https://page.test/' }, network.fetch, network.lookup), /the redirect .* was not followed/);
    assert.deepEqual(network.requests, ['https://page.test/']);
  }
});

test('the redirect limit is 20 by default and configurable by the host', async () => {
  const responses = {};
  for (let i = 0; i <= 21; i++) responses[`https://page.test/${i}`] = i === 21
    ? { body: 'done' } : { status: 302, headers: { location: `/${i + 1}` } };
  const c = { responses };
  let network = fixtureNetwork(c);
  await assert.rejects(auditPage({ url: 'https://page.test/0' }, network.fetch, network.lookup), /the request did not complete/);
  assert.equal(network.requests.length, 21);
  network = fixtureNetwork(c);
  assert.equal((await auditPage({ url: 'https://page.test/1' }, network.fetch, network.lookup)).final_url, 'https://page.test/21');
  network = fixtureNetwork(c);
  await assert.rejects(auditPage({ url: 'https://page.test/0' }, network.fetch, network.lookup, { maxRedirects: 2 }), /the request did not complete/);
  assert.equal(network.requests.length, 3);
});

test('byte caps distinguish exact, short and excess bodies and handle split UTF-8', async () => {
  const run = async (body, maxBytes) => auditPage({ url: 'https://page.test/' }, async () => new Response(body), async () => ['93.184.216.34'], { maxBytes });
  assert.equal((await run('short', 10)).body_truncated, false);
  const exact = await run('exact', 5);
  assert.equal(exact.body_truncated, false);
  assert.equal(exact.html_bytes, 5);
  assert.equal((await run(null, 5)).body_truncated, false);
  const bytes = new TextEncoder().encode('é🙂end');
  let cancelled = false;
  const stream = new ReadableStream({ start(controller) {
    controller.enqueue(bytes.slice(0, 1)); controller.enqueue(bytes.slice(1, 4)); controller.enqueue(bytes.slice(4));
  }, cancel() { cancelled = true; } });
  const result = await run(stream, 6);
  assert.equal(result.html_bytes, 3); // é + one surrogate pair, exactly six UTF-8 bytes
  assert.equal(result.body_truncated, true);
  assert.equal(cancelled, true);
  const cancelFailure = new ReadableStream({ start(controller) { controller.enqueue(bytes); },
    cancel() { throw new Error('upstream cancel failed'); } });
  assert.equal((await run(cancelFailure, 6)).body_truncated, true);
  assert.equal((await run(bytes, 3)).html_bytes, 2); // incomplete code point becomes U+FFFD
});

test('host signal and fetch failures retain the CLI failure sentences', async () => {
  const signal = new AbortController().signal;
  await assert.rejects(auditPage({ url: 'https://page.test/' }, async (_, init) => {
    assert.equal(init.signal, signal); throw Object.assign(new Error('private runtime detail'), { name: 'TimeoutError' });
  }, async () => ['93.184.216.34'], { signal }), /no response within 20 seconds/);
  await assert.rejects(auditPage({ url: 'https://page.test/' }, async () => { throw new Error('private runtime detail'); },
    async () => ['93.184.216.34']), /the request did not complete/);
});

test('both Fetch implementations agree with the fixture on redirect URL rules offline', async () => {
  for (const name of ['redirect inherits request fragment', 'redirect replaces request fragment',
    'redirect repairs binary UTF-8 Location', 'protocol-relative public redirect', 'protocol-relative loopback redirect refused',
    'redirect userinfo refused']) {
    const c = cases.find(c => c.name === name);
    for (const fetch of [globalThis.fetch, undiciFetch]) {
      const dispatcher = new MockAgent();
      dispatcher.disableNetConnect();
      try {
        for (const [href, data] of Object.entries(c.responses)) {
          const url = new URL(href);
          dispatcher.get(url.origin).intercept({ path: url.pathname + url.search })
            .reply(data.status ?? 200, data.body ?? '', { headers: Object.fromEntries(
              Object.entries(data.headers ?? {}).map(([name, value]) => [name, Buffer.from(value, 'latin1')])) });
        }
        const native = () => fetch(c.url, { redirect: 'follow', dispatcher });
        const fixture = fixtureNetwork(c);
        const expectedFetch = c.fetch ?? c.main;
        if (expectedFetch.status) {
          await assert.rejects(native(), /fetch failed/);
          await assert.rejects(fixture.fetch(c.url, { redirect: 'follow' }), /Credential-bearing redirect/);
        } else {
          const actual = await native();
          const expected = await fixture.fetch(c.url, { redirect: 'follow' });
          assert.equal(actual.url, expected.url);
          assert.equal(await actual.text(), await expected.text());
          assert.equal(actual.url, JSON.parse(expectedFetch.stdout).final_url);
        }
        dispatcher.assertNoPendingInterceptors();
        assert.deepEqual(fixture.requests, c.fetchRequests ?? c.requests);
      } finally { await dispatcher.close(); }
    }
  }
});

test('redirect resolution uses the answering URL and an explicit empty fragment clears inheritance', async () => {
  const requests = [];
  const fetch = async url => {
    requests.push(url);
    const response = requests.length === 1
      ? new Response('', { status: 302, headers: { location: 'land#' } }) : new Response('ok');
    Object.defineProperty(response, 'url', { value: requests.length === 1
      ? 'https://other.test/base/start' : 'https://other.test/base/land' });
    return response;
  };
  const result = await auditPage({ url: 'https://page.test/start#old' }, fetch, async () => ['93.184.216.34']);
  assert.deepEqual(requests, ['https://page.test/start#old', 'https://other.test/base/land#']);
  assert.equal(result.final_url, 'https://other.test/base/land');
});

test('username-only and password-only redirects are refused before a permissive host fetch', async () => {
  for (const target of ['https://user@public.test/a', 'https://:pass@public.test/a']) {
    const network = fixtureNetwork({ responses: { 'https://page.test/': { status: 302, headers: { location: target } } } });
    await assert.rejects(auditPage({ url: 'https://page.test/' }, network.fetch, network.lookup), /embedded username or password/);
    assert.deepEqual(network.requests, ['https://page.test/']);
  }
});

test('capped prefixes use response.text UTF-8 rules regardless of charset headers', async () => {
  for (const charset of ['windows-1252', 'utf-16le']) {
    for (const bytes of [Uint8Array.of(0xe9, 0, 65), Uint8Array.of(0xef, 0xbb, 0xbf, 65),
      new TextEncoder().encode('<script src="https://www.clarity.ms/tag/abc"></script>é🙂')]) {
      for (const cap of [1, 3, bytes.length, bytes.length + 1]) {
        const headers = { 'content-type': `text/html; charset=${charset}` };
        const expected = await new Response(bytes.subarray(0, cap), { headers }).text();
        const result = await auditPage({ url: 'https://page.test/' }, async () => new Response(bytes, { headers }),
          async () => ['93.184.216.34'], { maxBytes: cap });
        const prefix = await auditPage({ url: 'https://page.test/' }, async () => new Response(expected), async () => ['93.184.216.34']);
        assert.equal(result.html_bytes, expected.length);
        assert.deepEqual(result.tags, prefix.tags);
        assert.equal(result.body_truncated, bytes.length > cap);
      }
    }
  }
});

test('a cap retains only the prefix and probes just once on an exact fit', async () => {
  for (const chunks of [[Uint8Array.of(65, 66, 67)], [Uint8Array.of(65, 66), Uint8Array.of(67)], [Uint8Array.of(65, 66)]]) {
    let reads = 0, cancelled = false, released = false;
    const response = { status: 200, headers: new Headers(), body: { getReader: () => ({
      async read() { const value = chunks[reads++]; return value ? { value, done: false } : { done: true }; },
      async cancel() { cancelled = true; }, releaseLock() { released = true; }
    }) } };
    const result = await auditPage({ url: 'https://page.test/' }, async () => response, async () => ['93.184.216.34'], { maxBytes: 2 });
    assert.equal(result.html_bytes, 2);
    assert.equal(result.body_truncated, chunks.length === 2 || chunks[0].length > 2);
    assert.equal(reads, chunks[0].length > 2 ? 1 : 2);
    assert.equal(cancelled, result.body_truncated);
    assert.equal(released, true);
  }
});

test('one deadline interrupts caller, preflight and redirect lookups that never settle', async () => {
  const url = 'https://page.test/';
  const message = `Error: could not fetch ${url}: no response within 20 seconds. Confirm the host is reachable from this machine, then re-run.`;
  for (const phase of ['caller', 'preflight', 'redirect']) {
    const signal = AbortSignal.timeout(25);
    const keepAlive = setInterval(() => {}, 1000); // AbortSignal.timeout's timer is unref'd in Node.
    let watchdog;
    const network = fixtureNetwork({ responses: { [url]: { status: 302, headers: { location: 'https://other.test/' } } } });
    const lookup = host => phase === 'redirect' && host === 'page.test' ? ['93.184.216.34'] : new Promise(() => {});
    try {
      const operation = phase === 'preflight' ? screenDestination(resolveTarget(url), lookup, false, signal)
        : auditPage({ url }, network.fetch, lookup, { signal });
      await assert.rejects(Promise.race([operation, new Promise((_, reject) => {
        watchdog = setTimeout(() => reject(new Error('lookup exceeded its test deadline')), 1000);
      })]), { message });
      assert.equal(signal.aborted, true);
      assert.deepEqual(network.requests, phase === 'redirect' ? [url] : []);
    } finally { clearInterval(keepAlive); clearTimeout(watchdog); }
  }
});

test('a blocked DNS literal wins over a malformed entry for caller and redirect lookups', async () => {
  for (const requireResolved of [false, true]) {
    for (const redirect of [false, true]) {
      const network = fixtureNetwork({ dns: { 'inside.test': ['not-an-address', '10.0.0.1'] },
        responses: { 'https://page.test/': { status: 302, headers: { location: 'https://inside.test/' } } } });
      await assert.rejects(auditPage({ url: redirect ? 'https://page.test/' : 'https://inside.test/' },
        network.fetch, network.lookup, { requireResolved }), /a private-range address/);
      assert.deepEqual(network.requests, redirect ? ['https://page.test/'] : []);
    }
  }
});
