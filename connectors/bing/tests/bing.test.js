import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestGateway, putActive } from '../../../gateway/test/fake-provider.js';
import { loadConnectors } from '../../../gateway/src/manifest.js';
import { modules } from '../index.js';

const DIR = fileURLToPath(new URL('..', import.meta.url));
const CONNECTORS = fileURLToPath(new URL('../..', import.meta.url));
const MANIFEST = JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf8'));

const CASES = [
  ['list_sites', {}, (result) => {
    assert.equal(result[0].Url, 'https://example.com/');
    assert.equal(result[0].IsVerified, true);
  }],
  ['search_performance', { site_url: 'https://example.com/', report: 'daily_totals' }, (result) => {
    assert.equal(result[0].Date, '2026-09-01');
    assert.equal(result[0].Impressions, 10);
    assert.equal(result[0].Clicks, 2);
  }],
  ['query_performance', { site_url: 'https://example.com/', query: 'example', report: 'daily' }, (result) => {
    assert.equal(result[0].Query, 'example');
    assert.equal(result[0].Impressions, 5);
    assert.equal(result[0].Clicks, 1);
  }],
  ['page_performance', { site_url: 'https://example.com/', page_url: 'https://example.com/page', report: 'summary' }, (result) => {
    assert.equal(result.PageUrl, 'https://example.com/page');
    assert.equal(result.Clicks, 3);
    assert.equal(result.Impressions, 12);
  }],
  ['crawl_diagnostics', { site_url: 'https://example.com/', report: 'issues' }, (result) => {
    assert.equal(result[0].IssueType, 'BlockedByRobotsTxt');
    assert.equal(result[0].Urls, 1);
  }],
  ['inspect_url', { site_url: 'https://example.com/', url: 'https://example.com/page' }, (result) => {
    assert.equal(result.Url, 'https://example.com/page');
    assert.equal(result.IndexStatus, 'Indexed');
  }],
  ['feeds', { site_url: 'https://example.com/' }, (result) => {
    assert.equal(result[0].Url, 'https://example.com/sitemap.xml');
    assert.equal(result[0].Status, 'Success');
  }],
  ['inbound_links', { site_url: 'https://example.com/' }, (result) => {
    assert.equal(result[0].SourceUrl, 'https://referrer.example/');
    assert.equal(result[0].AnchorText, 'example');
  }],
  ['research_keywords', {
    query: 'example',
    country: 'US',
    language: 'en',
    report: 'impressions',
    start_date: '2026-09-01',
    end_date: '2026-09-07',
  }, (result) => {
    assert.equal(result[0].Query, 'example');
    assert.equal(result[0].Impressions, 100);
  }],
];

const SLUGS = {
  list_sites: 'FAKE_BING_WEBMASTER_LIST_SITES',
  search_performance: 'FAKE_BING_WEBMASTER_SEARCH_PERFORMANCE',
  query_performance: 'FAKE_BING_WEBMASTER_QUERY_PERFORMANCE',
  page_performance: 'FAKE_BING_WEBMASTER_PAGE_PERFORMANCE',
  crawl_diagnostics: 'FAKE_BING_WEBMASTER_CRAWL_DIAGNOSTICS',
  inspect_url: 'FAKE_BING_WEBMASTER_INSPECT_URL',
  feeds: 'FAKE_BING_WEBMASTER_GET_FEEDS',
  inbound_links: 'FAKE_BING_WEBMASTER_INBOUND_LINKS',
  research_keywords: 'FAKE_BING_WEBMASTER_RESEARCH_KEYWORDS',
};

test('every action needs_connect until the webmaster grant is active', async () => {
  const { gw, fake } = await createTestGateway();
  for (const [action, input] of CASES) {
    const result = await gw.execute({ action: `bing.webmaster.${action}`, input });
    assert.equal(result.status, 'needs_connect');
    assert.equal(result.module, 'webmaster');
  }
  assert.equal(fake.accounts.size, 0);
});

for (const [action, input, check] of CASES) {
  test(`${action} reaches the fake catalog with its mapped slug and canned fields`, async () => {
    const { gw, store, fake } = await createTestGateway();
    await putActive(store, fake, { service: 'bing', module: 'webmaster', privilege: 'write' });
    assert.equal(fake.catalog.toSlug(`bing.webmaster.${action}`), SLUGS[action]);
    const catalogCalls = [];
    const execute = fake.catalog.execute;
    fake.catalog.execute = async (request) => {
      catalogCalls.push(request);
      return execute(request);
    };
    fake.auth.proxy = async () => assert.fail('catalog action used proxy');
    const result = await gw.execute({ action: `bing.webmaster.${action}`, input });
    check(result);
    assert.equal(catalogCalls.length, 1);
    assert.equal(catalogCalls[0].actionId, `bing.webmaster.${action}`);
  });
}

test('invalid enums, required fields, and conditionals are refused before the catalog', async () => {
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'bing', module: 'webmaster', privilege: 'write' });
  fake.catalog.execute = async () => assert.fail('invalid arguments reached the catalog');
  fake.auth.proxy = async () => assert.fail('catalog action used proxy');
  const cases = [
    ['search_performance', { site_url: 'https://example.com/', report: 'weekly' }, 'report'],
    ['search_performance', { report: 'daily_totals' }, 'site_url'],
    ['search_performance', { site_url: 'example.com', report: 'daily_totals' }, 'site_url'],
    ['query_performance', { site_url: 'https://example.com/', query: 'example', report: 'pages' }, 'page_url'],
    ['query_performance', { site_url: 'https://example.com/', query: 'example', report: 'page_daily' }, 'page_url'],
    ['query_performance', { site_url: 'https://example.com/', query: '', report: 'daily' }, 'query'],
    ['page_performance', {
      site_url: 'https://example.com/',
      page_url: 'https://example.com/page',
      report: 'summary',
      page_number: 1,
    }, 'page_number'],
    ['page_performance', {
      site_url: 'https://example.com/',
      page_url: 'https://example.com/page',
      report: 'children',
      page_number: 0,
    }, 'page_number'],
    ['crawl_diagnostics', { site_url: 'https://example.com/', report: 'errors' }, 'report'],
    ['inspect_url', { site_url: 'https://example.com/' }, 'url'],
    ['research_keywords', { query: 'example', country: 'US', language: 'en', report: 'impressions' }, 'start_date'],
    ['research_keywords', {
      query: 'example',
      country: 'US',
      language: 'en',
      report: 'history',
      start_date: '2026-09-07',
    }, 'end_date'],
    ['research_keywords', {
      query: 'example',
      country: 'US',
      language: 'en',
      report: 'related',
      start_date: '2026-09-01',
      end_date: '2026-09-07',
    }, 'start_date'],
    ['research_keywords', {
      query: 'example',
      country: 'US',
      language: 'en',
      report: 'impressions',
      start_date: '2026-09-07',
      end_date: '2026-09-01',
    }, 'start_date'],
    ['search_performance', { site_url: 'https://example.com/', report: 'daily_totals', extra: true }, 'extra'],
    ['list_sites', { extra: true }, 'extra'],
  ];
  for (const [action, input, field] of cases) {
    const result = await gw.execute({ action: `bing.webmaster.${action}`, input });
    assert.equal(result.status, 'invalid_arguments', `${action} ${field}`);
    assert.equal(result.field, field, `${action} ${field}`);
  }
});

test('no action calls the proxy', async () => {
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'bing', module: 'webmaster', privilege: 'write' });
  fake.auth.proxy = async () => assert.fail('catalog action used proxy');
  for (const [action, input] of CASES) {
    const result = await gw.execute({ action: `bing.webmaster.${action}`, input });
    assert.notEqual(result.status, 'needs_connect', action);
    assert.notEqual(result.status, 'invalid_arguments', action);
  }
});

test('connector loads under loadConnectors with manifest/export parity and no placeholders', async () => {
  const loaded = await loadConnectors([CONNECTORS]);
  const connector = loaded.find((row) => row.id === 'bing');
  assert.ok(connector);
  for (const [modName, modDef] of Object.entries(MANIFEST.modules)) {
    for (const actName of Object.keys(modDef.actions)) {
      assert.equal(typeof modules[modName][actName], 'function', `${modName}.${actName}`);
    }
    for (const actName of Object.keys(modules[modName])) {
      if (typeof modules[modName][actName] !== 'function') continue;
      assert.ok(modDef.actions[actName], `extra export ${modName}.${actName}`);
    }
  }
  const leftover = ['{', '{'].join('');
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else assert.equal(readFileSync(path, 'utf8').includes(leftover), false, path);
    }
  };
  walk(DIR);
});
