import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { classifyLiteral, destinationReason } from '../scripts/lib/destination.js';
import { isDisallowed } from '../scripts/lib/robots.js';
import { runSiteCrawl, UsageError } from '../scripts/site-crawl-core.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT, 'scripts', 'site-crawl.js');

const PUBLIC_LOOKUP = async () => [{ address: '93.184.216.34', family: 4 }];
const PRIVATE_LOOKUP = async () => [{ address: '10.0.0.1', family: 4 }];
const NOW = () => new Date('2026-09-19T12:00:00.000Z');

function spawnCli(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: 'utf8',
    timeout: 15000,
    cwd: ROOT
  });
}

const HOME_HTML = `<!doctype html>
<html lang="en">
<head>
  <title>Home</title>
  <meta name="description" content="Example home">
  <meta name="robots" content="noindex, follow">
  <link rel="canonical" href="https://example.com/canonical-target">
</head>
<body>
  <h1>Home</h1>
  <a href="/redirect">redirect</a>
  <a href="/file.pdf">pdf</a>
  <a href="/secret">secret</a>
  <a href="/next">next</a>
</body>
</html>`;

const LAND_HTML = `<!doctype html>
<html lang="en">
<head><title>Landed</title></head>
<body>
  <h1>Landed</h1>
  <a href="/depth-two">deeper</a>
</body>
</html>`;

const SITE = {
  'https://example.com/robots.txt': {
    status: 200,
    headers: { 'content-type': 'text/plain' },
    body: 'User-agent: *\nDisallow: /secret\n'
  },
  'https://example.com/': {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: HOME_HTML
  },
  'https://example.com/redirect': {
    status: 302,
    headers: { location: 'https://example.com/redirect-2' },
    body: ''
  },
  'https://example.com/redirect-2': {
    status: 302,
    headers: { location: 'https://example.com/redirect-land' },
    body: ''
  },
  'https://example.com/redirect-land': {
    status: 200,
    headers: { 'content-type': 'text/html' },
    body: LAND_HTML
  },
  'https://example.com/file.pdf': {
    status: 200,
    headers: { 'content-type': 'application/pdf', 'content-length': '14' },
    body: '%PDF-1.4 fake\n'
  },
  'https://example.com/secret': {
    status: 200,
    headers: { 'content-type': 'text/html' },
    body: '<html><title>Secret</title><a href="/">home</a></html>'
  },
  'https://example.com/next': {
    status: 200,
    headers: { 'content-type': 'text/html' },
    body: '<html><title>Next</title><a href="/">home</a></html>'
  },
  'https://example.com/depth-two': {
    status: 200,
    headers: { 'content-type': 'text/html' },
    body: '<html><title>Too deep</title><a href="/">home</a></html>'
  },
  'https://example.com/orphan': {
    status: 200,
    headers: { 'content-type': 'text/html' },
    body: '<html><title>Orphan</title><a href="/">home</a></html>'
  },
  'https://example.com/canonical-target': {
    status: 200,
    headers: { 'content-type': 'text/html' },
    body: '<html><title>Canonical target</title><a href="/">home</a></html>'
  }
};

function makeFetch(site) {
  return async (url) => {
    const href = typeof url === 'string' ? url : url.href;
    const parsed = new URL(href);
    if (parsed.hostname !== 'example.com') {
      throw new Error(`test fetch opened a network target: ${href}`);
    }
    const page = site[href] ?? site[href.replace(/\/$/, '')] ?? site[`${href}/`];
    if (!page) {
      return new Response('', { status: 404, headers: { 'content-type': 'text/plain' } });
    }
    return new Response(page.body ?? '', {
      status: page.status,
      headers: page.headers
    });
  };
}

function sitemapSnapshot(dir) {
  const file = join(dir, 'sitemap-example.com-2026-09-19.json');
  const snapshot = {
    domain: 'example.com',
    fetchedAt: '2026-09-19',
    sitemaps: ['https://example.com/sitemap.xml'],
    urls: [
      { loc: 'https://example.com/', path: '/', slug: '', segment: '', lastmod: null },
      { loc: 'https://example.com/redirect-land', path: '/redirect-land', slug: 'redirect-land', segment: 'redirect-land', lastmod: null },
      { loc: 'https://example.com/orphan', path: '/orphan', slug: 'orphan', segment: 'orphan', lastmod: null }
    ],
    count: 3,
    truncated: false
  };
  writeFileSync(file, `${JSON.stringify(snapshot)}\n`);
  return file;
}

function workDir() {
  return mkdtempSync(join(tmpdir(), 'site-crawl-'));
}

async function crawl(dir, extra = []) {
  const snapshot = sitemapSnapshot(dir);
  const summary = await runSiteCrawl(
    [
      'crawl',
      '--start', 'https://example.com/',
      '--output', dir,
      '--max-pages', '3',
      '--delay-ms', '0',
      '--sitemap', snapshot,
      ...extra
    ],
    {
      fetch: makeFetch(SITE),
      lookup: PUBLIC_LOOKUP,
      sleep: async () => {},
      now: NOW
    }
  );
  const full = JSON.parse(readFileSync(summary.file, 'utf8'));
  return { summary, full, snapshot };
}

describe('help', () => {
  it('prints usage and exits 0', () => {
    const result = spawnCli(['help']);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /site-crawl - a bounded, polite crawl/);
    assert.match(result.stdout, /--start/);
    assert.match(result.stdout, /--max-pages/);
    assert.equal(result.stderr, '');
  });
});

describe('unknown flags', () => {
  it('refuses an unknown flag by name, stdout empty, before any request', () => {
    const result = spawnCli(['crawl', '--zzz', 'https://example.com/']);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /unknown option "--zzz"/);
  });

  it('refuses --install by name', () => {
    const result = spawnCli(['crawl', '--install', '--start', 'https://example.com/', '--output', tmpdir()]);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /unknown option "--install"/);
  });
});

describe('the address screen', () => {
  it('names a loopback literal', () => {
    assert.equal(classifyLiteral('127.0.0.1'), 'loopback');
  });

  it('refuses --start https://169.254.169.254/ by name, stdout empty', () => {
    const result = spawnCli(['crawl', '--start', 'https://169.254.169.254/', '--output', tmpdir()]);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /cloud instance metadata address/);
  });

  it('refuses --start http://127.0.0.1/ by name', () => {
    const result = spawnCli(['crawl', '--start', 'http://127.0.0.1/', '--output', tmpdir()]);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /loopback address/);
  });

  it('refuses a hostname that resolves to a private address, with fetch never called', async () => {
    assert.equal(await destinationReason('intranet.example', PRIVATE_LOOKUP), 'private_range');
    let called = false;
    await assert.rejects(
      () => runSiteCrawl(
        ['crawl', '--start', 'https://intranet.example/', '--output', workDir()],
        {
          fetch: async () => {
            called = true;
            throw new Error('network opened');
          },
          lookup: PRIVATE_LOOKUP,
          sleep: async () => {},
          now: NOW
        }
      ),
      (error) => error instanceof UsageError && /private-range address/.test(error.message)
    );
    assert.equal(called, false);
  });
});

describe('bounded crawl against the in-memory fixture', () => {
  it('stops at max-pages 3 and records redirect, noindex, canonical, pdf, robots, and sitemap unreached', async () => {
    const dir = workDir();
    const { summary, full } = await crawl(dir);

    assert.equal(summary.stoppedByBound, true);
    assert.equal(summary.reason, 'max-pages');
    assert.equal(summary.counts.fetched, 3);
    assert.equal(summary.pages, undefined);
    assert.ok(summary.file.endsWith('site-crawl-2026-09-19-example.com.json'));

    assert.equal(full.pages.length, 3);

    const byUrl = new Map(full.pages.map((page) => [page.url, page]));
    const home = byUrl.get('https://example.com/');
    assert.ok(home);
    assert.equal(home.noindex, true);
    assert.equal(home.canonicalMatches, false);
    assert.equal(home.canonical, 'https://example.com/canonical-target');
    assert.equal(home.title, 'Home');
    assert.equal(home.h1Count, 1);
    assert.equal(home.hasMetaDescription, true);
    assert.equal(home.lang, 'en');

    const redirected = byUrl.get('https://example.com/redirect');
    assert.ok(redirected);
    assert.equal(redirected.finalUrl, 'https://example.com/redirect-land');
    assert.equal(redirected.redirectChain.length, 2);
    assert.equal(redirected.redirectChain[0].to, 'https://example.com/redirect-2');
    assert.equal(redirected.redirectChain[1].to, 'https://example.com/redirect-land');
    assert.ok(full.redirectChains.length >= 1);

    const pdf = byUrl.get('https://example.com/file.pdf');
    assert.ok(pdf);
    assert.equal(pdf.pdf, true);
    assert.equal(pdf.title, null);
    assert.match(pdf.contentType, /pdf/i);

    assert.ok(full.noindexPages.includes('https://example.com/'));
    assert.ok(full.canonicalElsewhere.includes('https://example.com/'));
    assert.ok(full.robotsBlocked.includes('https://example.com/secret'));
    assert.equal(byUrl.has('https://example.com/secret'), false);

    assert.ok(full.sitemap);
    assert.ok(full.sitemap.unreached.includes('https://example.com/orphan'));
    assert.ok(full.sitemap.reached.includes('https://example.com/'));

    const fetchedUrls = full.pages.map((page) => page.url);
    assert.equal(fetchedUrls.includes('https://example.com/depth-two'), false);
    assert.equal(fetchedUrls.includes('https://example.com/next'), false);
    assert.equal(fetchedUrls.includes('https://example.com/orphan'), false);
  });

  it('does not fetch a page past --max-depth', async () => {
    const dir = workDir();
    const { full } = await crawl(dir, ['--max-depth', '1']);
    const fetched = new Set(full.pages.map((page) => page.url));
    assert.equal(fetched.has('https://example.com/depth-two'), false);
    assert.ok(full.stoppedByBound);
  });
});

describe('output file', () => {
  it('refuses to overwrite an existing inventory file', async () => {
    const dir = workDir();
    const first = await crawl(dir);
    const before = readFileSync(first.summary.file, 'utf8');
    assert.equal(existsSync(first.summary.file), true);

    await assert.rejects(
      () => runSiteCrawl(
        [
          'crawl',
          '--start', 'https://example.com/',
          '--output', dir,
          '--max-pages', '3',
          '--delay-ms', '0'
        ],
        {
          fetch: makeFetch(SITE),
          lookup: PUBLIC_LOOKUP,
          sleep: async () => {},
          now: NOW
        }
      ),
      (error) => error instanceof UsageError && /already exists/.test(error.message)
    );

    assert.equal(readFileSync(first.summary.file, 'utf8'), before);
  });
});

describe('numeric bounds', () => {
  it('refuses --max-pages outside 1 to 2000 by name', async () => {
    await assert.rejects(
      () => runSiteCrawl(
        ['crawl', '--start', 'https://example.com/', '--output', workDir(), '--max-pages', '0'],
        { fetch: makeFetch(SITE), lookup: PUBLIC_LOOKUP, sleep: async () => {}, now: NOW }
      ),
      (error) => error instanceof UsageError && /--max-pages must be 1 or greater/.test(error.message)
    );
  });
});

function serve(site) {
  return async (url) => {
    const href = typeof url === 'string' ? url : url.href;
    const page = site[href] ?? site[href.replace(/\/$/, '')] ?? site[`${href}/`];
    if (!page) {
      return new Response('', { status: 404, headers: { 'content-type': 'text/plain' } });
    }
    return new Response(page.body ?? '', { status: page.status, headers: page.headers });
  };
}

describe('robots pattern matching', () => {
  it('treats * as any-sequence and $ as end-anchor, and lets equal-length Allow win', () => {
    assert.equal(
      isDisallowed('User-agent: *\nDisallow: /*?\n', 'https://example.com/page?x=1', 'wiser-site-crawl'),
      true
    );
    assert.equal(
      isDisallowed('User-agent: *\nDisallow: /private$\n', 'https://example.com/private', 'wiser-site-crawl'),
      true
    );
    assert.equal(
      isDisallowed('User-agent: *\nDisallow: /private$\n', 'https://example.com/private/x', 'wiser-site-crawl'),
      false
    );
    assert.equal(
      isDisallowed(
        'User-agent: *\nDisallow: /public\nAllow: /public\n',
        'https://example.com/public',
        'wiser-site-crawl'
      ),
      false
    );
  });
});

describe('robots per origin and redirects', () => {
  it('does not fetch a redirect destination that robots.txt Disallow covers', async () => {
    const dir = workDir();
    const site = {
      'https://example.com/robots.txt': {
        status: 200,
        headers: { 'content-type': 'text/plain' },
        body: 'User-agent: *\nDisallow: /private\n'
      },
      'https://example.com/': {
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: '<html><title>Home</title><a href="/go">go</a></html>'
      },
      'https://example.com/go': {
        status: 302,
        headers: { location: 'https://example.com/private' },
        body: ''
      },
      'https://example.com/private': {
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: '<html><title>Secret</title></html>'
      }
    };
    const fetched = [];
    const fetch = async (url) => {
      const href = typeof url === 'string' ? url : url.href;
      fetched.push(href);
      return serve(site)(url);
    };
    const summary = await runSiteCrawl(
      ['crawl', '--start', 'https://example.com/', '--output', dir, '--delay-ms', '0'],
      { fetch, lookup: PUBLIC_LOOKUP, sleep: async () => {}, now: NOW }
    );
    const full = JSON.parse(readFileSync(summary.file, 'utf8'));
    assert.equal(fetched.includes('https://example.com/private'), false);
    assert.ok(full.robotsBlocked.includes('https://example.com/private'));
  });

  it('stops the run when the start origin robots.txt is unreachable', async () => {
    const dir = workDir();
    const site = {
      'https://example.com/robots.txt': { status: 503, headers: { 'content-type': 'text/plain' }, body: '' },
      'https://example.com/': {
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: '<html><title>Home</title></html>'
      }
    };
    await assert.rejects(
      () => runSiteCrawl(
        ['crawl', '--start', 'https://example.com/', '--output', dir, '--delay-ms', '0'],
        { fetch: serve(site), lookup: PUBLIC_LOOKUP, sleep: async () => {}, now: NOW }
      ),
      (error) => (
        error instanceof UsageError
        && /robots\.txt at https:\/\/example.com\/robots\.txt is unreachable/.test(error.message)
        && /RFC 9309 section 2.3.1.4/.test(error.message)
      )
    );
    assert.equal(existsSync(join(dir, 'site-crawl-2026-09-19-example.com.json')), false);
  });

  it('treats a 404 robots.txt as allow-all', async () => {
    const dir = workDir();
    const site = {
      'https://example.com/robots.txt': { status: 404, headers: { 'content-type': 'text/plain' }, body: '' },
      'https://example.com/': {
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: '<html><title>Home</title><a href="/secret">s</a></html>'
      },
      'https://example.com/secret': {
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: '<html><title>Secret</title></html>'
      }
    };
    const summary = await runSiteCrawl(
      ['crawl', '--start', 'https://example.com/', '--output', dir, '--delay-ms', '0'],
      { fetch: serve(site), lookup: PUBLIC_LOOKUP, sleep: async () => {}, now: NOW }
    );
    const full = JSON.parse(readFileSync(summary.file, 'utf8'));
    assert.equal(full.robotsBlocked.length, 0);
    assert.ok(full.pages.some((page) => page.url === 'https://example.com/secret'));
  });

  it('marks another origin robotsBlocked with reason robots unreachable rather than fetching it', async () => {
    const dir = workDir();
    const site = {
      'https://example.com/robots.txt': {
        status: 200,
        headers: { 'content-type': 'text/plain' },
        body: 'User-agent: *\nDisallow:\n'
      },
      'https://example.com/': {
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: '<html><title>Home</title><a href="https://www.example.com/page">sub</a></html>'
      },
      'https://www.example.com/robots.txt': { status: 503, headers: { 'content-type': 'text/plain' }, body: '' },
      'https://www.example.com/page': {
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: '<html><title>Sub</title></html>'
      }
    };
    const fetched = [];
    const fetch = async (url) => {
      const href = typeof url === 'string' ? url : url.href;
      fetched.push(href);
      return serve(site)(url);
    };
    const summary = await runSiteCrawl(
      [
        'crawl',
        '--start', 'https://example.com/',
        '--output', dir,
        '--delay-ms', '0',
        '--include-subdomains'
      ],
      { fetch, lookup: PUBLIC_LOOKUP, sleep: async () => {}, now: NOW }
    );
    const full = JSON.parse(readFileSync(summary.file, 'utf8'));
    assert.equal(fetched.includes('https://www.example.com/page'), false);
    assert.ok(full.robotsBlocked.includes('https://www.example.com/page'));
    assert.ok(full.errors.some((entry) => entry.url === 'https://www.example.com/page' && entry.reason === 'robots unreachable'));
  });
});

describe('--include-subdomains', () => {
  it('follows hostnames that end in . plus the start host, and not sibling tenants', async () => {
    const dir = workDir();
    const site = {
      'https://example.com/robots.txt': {
        status: 200,
        headers: { 'content-type': 'text/plain' },
        body: 'User-agent: *\nDisallow:\n'
      },
      'https://example.com/': {
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: '<html><title>Home</title><a href="https://www.example.com/">www</a><a href="https://other.example.net/">other</a></html>'
      },
      'https://www.example.com/robots.txt': {
        status: 200,
        headers: { 'content-type': 'text/plain' },
        body: 'User-agent: *\nDisallow:\n'
      },
      'https://www.example.com/': {
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: '<html><title>WWW</title></html>'
      },
      'https://other.example.net/robots.txt': {
        status: 200,
        headers: { 'content-type': 'text/plain' },
        body: 'User-agent: *\nDisallow:\n'
      },
      'https://other.example.net/': {
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: '<html><title>Other</title></html>'
      }
    };
    const fetched = [];
    const fetch = async (url) => {
      const href = typeof url === 'string' ? url : url.href;
      fetched.push(href);
      return serve(site)(url);
    };
    const summary = await runSiteCrawl(
      [
        'crawl',
        '--start', 'https://example.com/',
        '--output', dir,
        '--delay-ms', '0',
        '--include-subdomains'
      ],
      { fetch, lookup: PUBLIC_LOOKUP, sleep: async () => {}, now: NOW }
    );
    const full = JSON.parse(readFileSync(summary.file, 'utf8'));
    assert.ok(full.pages.some((page) => page.url === 'https://www.example.com/'));
    assert.equal(full.pages.some((page) => page.url === 'https://other.example.net/'), false);
    assert.equal(fetched.includes('https://other.example.net/'), false);
  });
});

describe('HTML extraction failures and X-Robots-Tag', () => {
  it('writes the inventory when a title contains an out-of-range entity', async () => {
    const dir = workDir();
    const site = {
      'https://example.com/robots.txt': {
        status: 200,
        headers: { 'content-type': 'text/plain' },
        body: 'User-agent: *\nDisallow:\n'
      },
      'https://example.com/': {
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: '<html><title>Bad &#x110000; title</title><a href="/next">n</a></html>'
      },
      'https://example.com/next': {
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: '<html><title>Next</title></html>'
      }
    };
    const summary = await runSiteCrawl(
      ['crawl', '--start', 'https://example.com/', '--output', dir, '--delay-ms', '0'],
      { fetch: serve(site), lookup: PUBLIC_LOOKUP, sleep: async () => {}, now: NOW }
    );
    const full = JSON.parse(readFileSync(summary.file, 'utf8'));
    assert.ok(existsSync(summary.file));
    assert.ok(full.pages.some((page) => page.url === 'https://example.com/'));
    assert.ok(full.pages.some((page) => page.url === 'https://example.com/next'));
  });

  it('lists a PDF with X-Robots-Tag noindex in noindexPages', async () => {
    const dir = workDir();
    const site = {
      'https://example.com/robots.txt': {
        status: 200,
        headers: { 'content-type': 'text/plain' },
        body: 'User-agent: *\nDisallow:\n'
      },
      'https://example.com/': {
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: '<html><title>Home</title><a href="/file.pdf">pdf</a></html>'
      },
      'https://example.com/file.pdf': {
        status: 200,
        headers: { 'content-type': 'application/pdf', 'x-robots-tag': 'noindex' },
        body: '%PDF-1.4 fake\n'
      }
    };
    const summary = await runSiteCrawl(
      ['crawl', '--start', 'https://example.com/', '--output', dir, '--delay-ms', '0'],
      { fetch: serve(site), lookup: PUBLIC_LOOKUP, sleep: async () => {}, now: NOW }
    );
    const full = JSON.parse(readFileSync(summary.file, 'utf8'));
    const pdf = full.pages.find((page) => page.url === 'https://example.com/file.pdf');
    assert.ok(pdf);
    assert.equal(pdf.pdf, true);
    assert.equal(pdf.noindex, true);
    assert.ok(full.noindexPages.includes('https://example.com/file.pdf'));
  });
});

describe('same-host link screening', () => {
  it('screens same-host discovered links before fetching them', async () => {
    const dir = workDir();
    const site = {
      'https://example.com/robots.txt': {
        status: 200,
        headers: { 'content-type': 'text/plain' },
        body: 'User-agent: *\nDisallow:\n'
      },
      'https://example.com/': {
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: '<html><title>Home</title><a href="/next">n</a></html>'
      },
      'https://example.com/next': {
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: '<html><title>Next</title></html>'
      }
    };
    const lookedUp = [];
    const lookup = async (hostname) => {
      lookedUp.push(hostname);
      return [{ address: '93.184.216.34', family: 4 }];
    };
    await runSiteCrawl(
      ['crawl', '--start', 'https://example.com/', '--output', dir, '--delay-ms', '0'],
      { fetch: serve(site), lookup, sleep: async () => {}, now: NOW }
    );
    assert.ok(lookedUp.length >= 3);
  });
});

it('robots matching decodes percent-encoded unreserved ASCII on both sides', () => {
  const rules = 'User-agent: *\nDisallow: /private\n';
  assert.equal(isDisallowed(rules, 'https://example.com/%70rivate', 'wiser-site-crawl/0.1.0'), true);
  assert.equal(isDisallowed('User-agent: *\nDisallow: /%70rivate\n', 'https://example.com/private/x', 'wiser-site-crawl/0.1.0'), true);
  assert.equal(isDisallowed(rules, 'https://example.com/public', 'wiser-site-crawl/0.1.0'), false);
});
