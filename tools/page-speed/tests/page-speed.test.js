import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { classifyLiteral, destinationReason } from '../scripts/lib/destination.js';
import { runPageSpeed, UsageError } from '../scripts/page-speed-core.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT, 'scripts', 'page-speed.js');

const PUBLIC_LOOKUP = async () => [{ address: '93.184.216.34', family: 4 }];
const PRIVATE_LOOKUP = async () => [{ address: '10.0.0.1', family: 4 }];

function spawnCli(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: 'utf8',
    timeout: 15000,
    cwd: ROOT
  });
}

function lighthousePayload({ field = false, inp = false, audits = {} } = {}) {
  const payload = {
    id: 'https://example.com/pricing',
    lighthouseResult: {
      requestedUrl: 'https://example.com/pricing',
      finalUrl: 'https://example.com/pricing',
      lighthouseVersion: '12.0.0',
      categories: {
        performance: { score: 0.91 },
        seo: { score: 0.84 }
      },
      audits: {
        'first-contentful-paint': { numericValue: 1100 },
        'largest-contentful-paint': { numericValue: 1800 },
        'cumulative-layout-shift': { numericValue: 0.04 },
        'total-blocking-time': { numericValue: 80 },
        'speed-index': { numericValue: 1400 },
        interactive: { numericValue: 2100 },
        ...audits
      }
    }
  };

  if (field) {
    const metrics = {
      LARGEST_CONTENTFUL_PAINT_MS: { percentile: 1900, category: 'AVERAGE' },
      CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 4, category: 'FAST' },
      FIRST_CONTENTFUL_PAINT_MS: { percentile: 900, category: 'FAST' },
      EXPERIMENTAL_TIME_TO_FIRST_BYTE: { percentile: 400, category: 'FAST' }
    };
    if (inp) {
      metrics.INTERACTION_TO_NEXT_PAINT = { percentile: 160, category: 'FAST' };
    }
    payload.loadingExperience = {
      id: 'https://example.com/pricing',
      metrics,
      overall_category: 'AVERAGE'
    };
    payload.originLoadingExperience = {
      id: 'https://example.com',
      metrics,
      overall_category: 'AVERAGE'
    };
  }

  return payload;
}

function stubFetch(payload, { status = 200, onCall } = {}) {
  return async (url, options) => {
    if (onCall) onCall(String(url), options);
    return new Response(JSON.stringify(payload), {
      status,
      headers: { 'content-type': 'application/json' }
    });
  };
}

describe('help', () => {
  it('prints usage and exits 0', () => {
    const result = spawnCli(['help']);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /page-speed - PageSpeed Insights/);
    assert.match(result.stdout, /--strategy/);
    assert.equal(result.stderr, '');
  });

  it('answers --help before any other work', () => {
    const result = spawnCli(['run', '--help']);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Usage:/);
  });
});

describe('unknown flags and missing values', () => {
  it('refuses an unknown flag by name, stdout empty, before any request', () => {
    const result = spawnCli(['run', '--zzz', 'https://example.com/']);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /unknown option "--zzz"/);
  });

  it('refuses --install by name', () => {
    const result = spawnCli(['run', '--install', '--url', 'https://example.com/', '--strategy', 'mobile']);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /unknown option "--install"/);
  });

  it('refuses a missing --strategy', async () => {
    await assert.rejects(
      () => runPageSpeed(['run', '--url', 'https://example.com/'], { fetch: stubFetch({}), lookup: PUBLIC_LOOKUP }),
      (error) => error instanceof UsageError && /--strategy is required/.test(error.message)
    );
  });
});

describe('the address screen', () => {
  it('names a loopback literal', () => {
    assert.equal(classifyLiteral('127.0.0.1'), 'loopback');
  });

  it('refuses --url http://127.0.0.1/ by name, stdout empty', () => {
    const result = spawnCli(['run', '--url', 'http://127.0.0.1/', '--strategy', 'mobile']);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /points at a loopback address, which this tool does not fetch/);
    assert.doesNotMatch(result.stderr, /could not fetch/);
  });

  it('refuses a cloud metadata address by name', () => {
    const result = spawnCli(['run', '--url', 'https://169.254.169.254/', '--strategy', 'desktop']);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /cloud instance metadata address/);
  });

  it('refuses a hostname that resolves to a private address, with fetch never called', async () => {
    assert.equal(await destinationReason('intranet.example', PRIVATE_LOOKUP), 'private_range');
    let called = false;
    await assert.rejects(
      () => runPageSpeed(
        ['run', '--url', 'https://intranet.example/', '--strategy', 'mobile'],
        {
          fetch: async () => {
            called = true;
            throw new Error('network opened');
          },
          lookup: PRIVATE_LOOKUP
        }
      ),
      (error) => error instanceof UsageError && /private-range address/.test(error.message)
    );
    assert.equal(called, false);
  });
});

describe('lab and field interpretation', () => {
  it('reports field.page.available false when loadingExperience is absent', async () => {
    const result = await runPageSpeed(
      ['run', '--url', 'https://example.com/pricing', '--strategy', 'mobile'],
      { fetch: stubFetch(lighthousePayload({ field: false })), lookup: PUBLIC_LOOKUP }
    );
    assert.equal(result.field.page.available, false);
    assert.equal(result.field.page.reason, 'no field data for this page in the Chrome UX Report');
    assert.equal(result.field.origin.available, false);
    assert.equal(result.lab.firstContentfulPaintMs, 1100);
    assert.equal(result.strategy, 'mobile');
    assert.equal(result.categories.performance, 0.91);
    assert.equal(result.audits, undefined);
  });

  it('reports the INP percentile only when the vendor supplied INTERACTION_TO_NEXT_PAINT', async () => {
    const withInp = await runPageSpeed(
      ['run', '--url', 'https://example.com/pricing', '--strategy', 'desktop'],
      { fetch: stubFetch(lighthousePayload({ field: true, inp: true })), lookup: PUBLIC_LOOKUP }
    );
    assert.equal(withInp.field.page.available, true);
    assert.deepEqual(withInp.field.page.inpMs, { percentile: 160, category: 'FAST' });
    assert.equal(withInp.field.page.lcpMs.percentile, 1900);

    const withoutInp = await runPageSpeed(
      ['run', '--url', 'https://example.com/pricing', '--strategy', 'desktop'],
      { fetch: stubFetch(lighthousePayload({ field: true, inp: false })), lookup: PUBLIC_LOOKUP }
    );
    assert.equal(withoutInp.field.page.available, true);
    assert.equal(Object.hasOwn(withoutInp.field.page, 'inpMs'), false);
  });

  it('names missing lab metrics in labIssues and leaves them null', async () => {
    const payload = lighthousePayload();
    delete payload.lighthouseResult.audits['speed-index'];
    delete payload.lighthouseResult.categories.performance;
    const result = await runPageSpeed(
      ['run', '--url', 'https://example.com/pricing', '--strategy', 'mobile'],
      { fetch: stubFetch(payload), lookup: PUBLIC_LOOKUP }
    );
    assert.equal(result.lab.speedIndexMs, null);
    assert.equal(result.lab.performanceScore, null);
    assert.ok(result.labIssues.includes('speedIndexMs'));
    assert.ok(result.labIssues.includes('performanceScore'));
  });

  it('includes audits only with --audits', async () => {
    const result = await runPageSpeed(
      ['run', '--url', 'https://example.com/pricing', '--strategy', 'mobile', '--audits'],
      { fetch: stubFetch(lighthousePayload()), lookup: PUBLIC_LOOKUP }
    );
    assert.equal(typeof result.audits, 'object');
    assert.equal(result.audits['first-contentful-paint'].numericValue, 1100);
  });
});

describe('--env', () => {
  it('sends key= and never writes the key string to stdout, stderr, or the output file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'page-speed-env-'));
    const envFile = join(dir, 'pagespeed.env');
    const outputDir = join(dir, 'out');
    mkdirSync(outputDir);
    const key = 'secret-pagespeed-key-value-9f3a';
    writeFileSync(envFile, `PAGESPEED_API_KEY=${key}\n`);

    const calls = [];
    const result = await runPageSpeed(
      [
        'run',
        '--url', 'https://example.com/pricing',
        '--strategy', 'mobile',
        '--env', envFile,
        '--output', outputDir
      ],
      {
        fetch: stubFetch(lighthousePayload(), { onCall: (url) => calls.push(url) }),
        lookup: PUBLIC_LOOKUP,
        now: () => new Date('2026-09-19T12:00:00.000Z')
      }
    );

    assert.equal(calls.length, 1);
    assert.match(calls[0], /[?&]key=secret-pagespeed-key-value-9f3a/);
    assert.match(result.requestUrl, /key=REDACTED/);
    assert.doesNotMatch(result.requestUrl, new RegExp(key));

    const printed = JSON.stringify(result);
    assert.doesNotMatch(printed, new RegExp(key));
    const written = readFileSync(result.file, 'utf8');
    assert.doesNotMatch(written, new RegExp(key));
  });

  it('refuses --env naming a file that does not exist, using the contract wording', async () => {
    const missing = join(tmpdir(), 'page-speed-missing-env-does-not-exist.env');
    await assert.rejects(
      () => runPageSpeed(
        ['run', '--url', 'https://example.com/', '--strategy', 'mobile', '--env', missing],
        { fetch: stubFetch(lighthousePayload()), lookup: PUBLIC_LOOKUP }
      ),
      (error) => (
        error instanceof UsageError
        && /--env names a file that does not exist/.test(error.message)
        && /does not search for a configuration file/.test(error.message)
      )
    );
  });
});

describe('output file', () => {
  it('refuses a symlink at the generated filename before any request', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'page-speed-symlink-'));
    const real = join(dir, 'real.json');
    const target = join(dir, 'page-speed-example.com-root-mobile-2026-09-19.json');
    writeFileSync(real, 'keep\n');
    symlinkSync(real, target);
    let called = false;
    await assert.rejects(
      () => runPageSpeed(
        ['run', '--url', 'https://example.com/', '--strategy', 'mobile', '--output', dir],
        {
          fetch: async () => {
            called = true;
            throw new Error('network opened');
          },
          lookup: PUBLIC_LOOKUP,
          now: () => new Date('2026-09-19T12:00:00.000Z')
        }
      ),
      (error) => error instanceof UsageError && /already exists/.test(error.message)
    );
    assert.equal(called, false);
    assert.equal(readFileSync(real, 'utf8'), 'keep\n');
  });

  it('refuses an existing file and leaves it unchanged', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'page-speed-exists-'));
    const target = join(dir, 'page-speed-example.com-root-mobile-2026-09-19.json');
    writeFileSync(target, 'original\n');
    let called = false;
    await assert.rejects(
      () => runPageSpeed(
        ['run', '--url', 'https://example.com/', '--strategy', 'mobile', '--output', dir],
        {
          fetch: async () => {
            called = true;
            throw new Error('network opened');
          },
          lookup: PUBLIC_LOOKUP,
          now: () => new Date('2026-09-19T12:00:00.000Z')
        }
      ),
      (error) => error instanceof UsageError && /already exists/.test(error.message)
    );
    assert.equal(called, false);
    assert.equal(readFileSync(target, 'utf8'), 'original\n');
  });

  it('refuses when the generated filename is the --env file, before any request', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'page-speed-env-target-'));
    const envFile = join(dir, 'page-speed-example.com-root-mobile-2026-09-19.json');
    writeFileSync(envFile, 'PAGESPEED_API_KEY=secret-pagespeed-key-value-9f3a\n');
    let called = false;
    await assert.rejects(
      () => runPageSpeed(
        [
          'run',
          '--url', 'https://example.com/',
          '--strategy', 'mobile',
          '--env', envFile,
          '--output', dir
        ],
        {
          fetch: async () => {
            called = true;
            throw new Error('network opened');
          },
          lookup: PUBLIC_LOOKUP,
          now: () => new Date('2026-09-19T12:00:00.000Z')
        }
      ),
      (error) => (
        error instanceof UsageError
        && (/--env file/.test(error.message) || /already exists/.test(error.message))
      )
    );
    assert.equal(called, false);
    assert.match(readFileSync(envFile, 'utf8'), /PAGESPEED_API_KEY=/);
  });

  it('gives two URLs on one host two filenames', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'page-speed-names-'));
    const first = await runPageSpeed(
      ['run', '--url', 'https://example.com/pricing', '--strategy', 'mobile', '--output', dir],
      {
        fetch: stubFetch(lighthousePayload()),
        lookup: PUBLIC_LOOKUP,
        now: () => new Date('2026-09-19T12:00:00.000Z')
      }
    );
    const second = await runPageSpeed(
      ['run', '--url', 'https://example.com/about', '--strategy', 'mobile', '--output', dir],
      {
        fetch: stubFetch(lighthousePayload()),
        lookup: PUBLIC_LOOKUP,
        now: () => new Date('2026-09-19T12:00:00.000Z')
      }
    );
    assert.notEqual(first.file, second.file);
    assert.match(first.file, /page-speed-example.com-pricing-mobile-2026-09-19\.json$/);
    assert.match(second.file, /page-speed-example.com-about-mobile-2026-09-19\.json$/);
  });
});

describe('vendor errors', () => {
  it('reports a 429 as the status and endpoint, never the vendor body', async () => {
    await assert.rejects(
      () => runPageSpeed(
        ['run', '--url', 'https://example.com/pricing', '--strategy', 'mobile'],
        {
          fetch: stubFetch({ error: { message: 'quota exceeded for this credential' } }, { status: 429 }),
          lookup: PUBLIC_LOOKUP
        }
      ),
      (error) => (
        error instanceof UsageError
        && /HTTP 429/.test(error.message)
        && /pagespeedonline\/v5\/runPagespeed/.test(error.message)
        && /pass --env with a PageSpeed API key/i.test(error.message)
        && !/quota exceeded/.test(error.message)
        && !/credential/.test(error.message)
      )
    );
  });
});
