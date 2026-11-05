import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
const cli = fileURLToPath(new URL('../scripts/sitemap.js', import.meta.url));
const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });

test('help, closed flags and calendar validation retain the CLI contract', () => {
  for (const args of [['help'], ['fetch', 'help'], ['diff', '--help']]) {
    const out = run(...args); assert.equal(out.status, 0); assert.match(out.stdout, /Usage:/); assert.equal(out.stderr, '');
  }
  for (const [args, pattern] of [
    [['fetch', '--unknown'], /unknown option "--unknown"/],
    [['fetch', '--domain', 'site.test', '--date', '2026-13-01'], /not a real calendar date/],
    [['fetch', '--domain', 'site.test', '--max', '0'], /--max must be a whole number/],
    [['fetch', '--domain', 'site.test', '--domain', 'other.test'], /--domain was given more than once/],
    [['fetch', '--file', 'relative.xml'], /--file must be absolute/],
    [['fetch', '--domain', 'site.test', '--file', '/tmp/map.xml'], /either network seeds/],
  ]) {
    const out = run(...args); assert.equal(out.status, 1); assert.equal(out.stdout, ''); assert.match(out.stderr, pattern);
  }
});
test('offline gzip, output file and diff keep their original result shapes', () => {
  // The tool reports real paths; macOS links /var to /private/var, so compare real to real.
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'sitemap-contract-')));
  try {
    const input = join(scratch, 'map.xml.gz');
    writeFileSync(input, gzipSync('<urlset><url><loc>https://site.test/a</loc><lastmod>2026-11-01</lastmod></url></urlset>'));
    const out = run('fetch', '--file', input, '--date', '2026-11-04', '--output', scratch);
    assert.equal(out.status, 0, out.stderr); assert.equal(out.stderr, '');
    const snapshot = JSON.parse(out.stdout); const { file, ...saved } = snapshot;
    assert.deepEqual(JSON.parse(readFileSync(file)), saved);
    assert.deepEqual(saved, { domain: 'site.test', fetchedAt: '2026-11-04', sitemaps: [input], urls: [{ loc: 'https://site.test/a', path: '/a', slug: 'a', segment: 'a', lastmod: '2026-11-01' }], count: 1, truncated: false });
    const diff = run('diff', '--previous', file, '--current', file);
    assert.equal(diff.status, 0, diff.stderr);
    assert.deepEqual(JSON.parse(diff.stdout), { domain: 'site.test', previousDate: '2026-11-04', currentDate: '2026-11-04', domainMismatch: null, addedUrls: [], removedUrls: [], changedLastmod: [], newPathSegments: [], counts: { previousTotal: 1, currentTotal: 1, added: 0, removed: 0, lastmodChanged: 0, newSegments: 0 }, outputPath: null });
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});
