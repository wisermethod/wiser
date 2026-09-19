import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestGateway, putActive } from '../../../gateway/test/fake-provider.js';

const OLD_QUERY = {
  site_url: 'https://example.com/',
  start_date: '2026-09-01',
  end_date: '2026-09-07',
  dimensions: ['query'],
  row_limit: 10,
};

async function granted() {
  const ctx = await createTestGateway();
  await putActive(ctx.store, ctx.fake, { service: 'google', module: 'search-console', privilege: 'read' });
  ctx.fake.auth.proxy = async () => assert.fail('catalog action used proxy');
  return ctx;
}

test('inspect and get_sitemap reach the fake catalog', async () => {
  const { gw, store, fake } = await createTestGateway();
  assert.equal((await gw.execute({
    action: 'google.search-console.inspect',
    input: { site_url: 'https://example.com/', inspection_url: 'https://example.com/page' },
  })).status, 'needs_connect');
  await putActive(store, fake, { service: 'google', module: 'search-console', privilege: 'read' });
  const inspected = await gw.execute({
    action: 'google.search-console.inspect',
    input: { site_url: 'https://example.com/', inspection_url: 'https://example.com/page' },
  });
  assert.equal(inspected.inspectionResult.indexStatusResult.verdict, 'PASS');
  const sitemap = await gw.execute({
    action: 'google.search-console.get_sitemap',
    input: { site_url: 'https://example.com/', feedpath: 'https://example.com/sitemap.xml' },
  });
  assert.equal(sitemap.path, 'https://example.com/sitemap.xml');
});

test('query with only the old five fields still passes unchanged', async () => {
  const { gw, fake } = await granted();
  fake.catalog.setResult(fake.catalog.toSlug('google.search-console.query'), (args) => {
    assert.deepEqual(args, OLD_QUERY);
    return { rows: [{ keys: ['example'], clicks: 1, impressions: 2 }] };
  });
  const result = await gw.execute({ action: 'google.search-console.query', input: OLD_QUERY });
  assert.equal(result.rows[0].clicks, 1);
});

test('query start_row at 0 and at a large value, row_limit at 1 and 25000', async () => {
  const { gw } = await granted();
  for (const input of [
    { ...OLD_QUERY, start_row: 0 },
    { ...OLD_QUERY, start_row: 100000 },
    { ...OLD_QUERY, row_limit: 1 },
    { ...OLD_QUERY, row_limit: 25000 },
  ]) {
    const result = await gw.execute({ action: 'google.search-console.query', input });
    assert.ok(Object.hasOwn(result, 'rows'), JSON.stringify(input));
  }
});

test('search-console validation refuses enums, bounds, shapes, and URLs before the catalog', async () => {
  const { gw, fake } = await granted();
  fake.catalog.execute = async () => assert.fail('invalid arguments reached the catalog');
  const cases = [
    ['query', { ...OLD_QUERY, row_limit: 0 }, 'row_limit'],
    ['query', { ...OLD_QUERY, row_limit: 25001 }, 'row_limit'],
    ['query', { ...OLD_QUERY, start_row: -1 }, 'start_row'],
    ['query', { ...OLD_QUERY, start_date: '2026-09-07', end_date: '2026-09-01' }, 'start_date'],
    ['query', { ...OLD_QUERY, start_date: '09-01-2026' }, 'start_date'],
    ['query', { ...OLD_QUERY, dimensions: ['clicks'] }, 'dimensions'],
    ['query', { ...OLD_QUERY, search_type: 'shopping' }, 'search_type'],
    ['query', { ...OLD_QUERY, aggregation_type: 'byQuery' }, 'aggregation_type'],
    ['query', { ...OLD_QUERY, data_state: 'fresh' }, 'data_state'],
    ['query', { ...OLD_QUERY, dimension_filter_groups: 'query' }, 'dimension_filter_groups'],
    ['query', { ...OLD_QUERY, dimension_filter_groups: [{ filters: [{ dimension: 'clicks', operator: 'equals', expression: 'US' }] }] }, 'dimension_filter_groups'],
    ['query', { ...OLD_QUERY, dimension_filter_groups: [{ filters: [{ dimension: 'country', operator: 'gt', expression: 'US' }] }] }, 'dimension_filter_groups'],
    ['query', { ...OLD_QUERY, dimension_filter_groups: [{ filters: [{ dimension: 'country', operator: 'equals' }] }] }, 'dimension_filter_groups'],
    ['query', { ...OLD_QUERY, dimension_filter_groups: [{ notFilters: [] }] }, 'dimension_filter_groups'],
    ['inspect', { site_url: 'example.com', inspection_url: 'https://example.com/page' }, 'site_url'],
    ['inspect', { site_url: 'https://example.com/', inspection_url: '/page' }, 'inspection_url'],
    ['inspect', { site_url: 'https://example.com/' }, 'inspection_url'],
    ['get_sitemap', { site_url: 'https://example.com/', feedpath: 'sitemap.xml' }, 'feedpath'],
    ['get_sitemap', { site_url: 'https://example.com/' }, 'feedpath'],
  ];
  for (const [action, input, field] of cases) {
    const result = await gw.execute({ action: `google.search-console.${action}`, input });
    assert.equal(result.status, 'invalid_arguments', `${action} ${field}`);
    assert.equal(result.field, field, `${action} ${field}`);
  }
});

test('query accepts documented enums and a well-formed dimension_filter_groups', async () => {
  const { gw, fake } = await granted();
  const input = {
    ...OLD_QUERY,
    start_row: 0,
    search_type: 'web',
    aggregation_type: 'byPage',
    data_state: 'final',
    dimension_filter_groups: [{
      filters: [{ dimension: 'country', operator: 'equals', expression: 'usa' }],
    }],
  };
  fake.catalog.setResult(fake.catalog.toSlug('google.search-console.query'), (args) => {
    assert.deepEqual(args.dimension_filter_groups, input.dimension_filter_groups);
    assert.equal(args.search_type, 'web');
    return { rows: [] };
  });
  const result = await gw.execute({ action: 'google.search-console.query', input });
  assert.ok(Object.hasOwn(result, 'rows'));
});
