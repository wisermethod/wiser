import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestGateway, putActive } from '../../../gateway/test/fake-provider.js';

const cases = [
  ['search-console', 'query', 'read', { site_url: 'https://example.com/', start_date: '2026-09-01', end_date: '2026-09-07' }, 'rows'],
  ['search-console', 'sites', 'read', {}, 'siteEntry'],
  ['search-console', 'sitemaps', 'read', { site_url: 'https://example.com/' }, 'sitemap'],
  ['analytics', 'run_report', 'read', { property: 'properties/1', date_ranges: [], metrics: [] }, 'rows'],
  ['analytics', 'list_account_summaries', 'read', {}, 'accountSummaries'],
  ['analytics', 'get_property', 'read', { name: 'properties/1' }, 'name'],
  ['drive', 'find_file', 'write', { q: "name = 'Example'" }, 'files'],
  ['drive', 'get_file', 'write', { file_id: 'file-example' }, 'id'],
  ['calendar', 'list_events', 'write', { calendar_id: 'primary' }, 'items'],
  ['calendar', 'get_event', 'write', { calendar_id: 'primary', event_id: 'event-example' }, 'id'],
  ['gmail', 'list_messages', 'read', { query: 'from:example@example.com' }, 'messages'],
  ['gmail', 'get_message', 'read', { message_id: 'msg-example' }, 'id'],
];
for (const [module, action, privilege, input, field] of cases) {
  test(`google.${module}.${action} reaches the fake catalog with its own grant`, async () => {
    const { gw, store, fake } = await createTestGateway();
    const id = `google.${module}.${action}`;
    assert.equal((await gw.execute({ action: id, input })).status, 'needs_connect');
    await putActive(store, fake, { service: 'google', module, privilege });
    const result = await gw.execute({ action: id, input });
    assert.ok(Object.hasOwn(result, field));
  });
}

test('Search Console does not unlock the other Google modules', async () => {
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'google', module: 'search-console', privilege: 'read' });
  for (const action of ['google.analytics.list_account_summaries', 'google.drive.find_file', 'google.calendar.list_events', 'google.gmail.list_messages']) {
    assert.equal((await gw.execute({ action, input: {} })).status, 'needs_connect');
  }
});

test('Gmail does not unlock Search Console, Drive, Calendar, or Analytics', async () => {
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'google', module: 'gmail', privilege: 'read' });
  for (const action of ['google.search-console.sites', 'google.analytics.list_account_summaries', 'google.drive.find_file', 'google.calendar.list_events']) {
    assert.equal((await gw.execute({ action, input: {} })).status, 'needs_connect');
  }
});

test('Google facade remaps public inputs to documented catalog fields', async () => {
  const { gw, store, fake } = await createTestGateway();
  const examples = [
    ['analytics', 'run_report', 'read', { property: 'properties/1', date_ranges: [{ startDate: '2026-09-01', endDate: '2026-09-07' }], metrics: [{ name: 'sessions' }] }, 'date_ranges', 'dateRanges'],
    ['analytics', 'list_account_summaries', 'read', { page_size: 10 }, 'page_size', 'pageSize'],
    ['drive', 'find_file', 'write', { page_token: 'page-example' }, 'page_token', 'pageToken'],
    ['drive', 'get_file', 'write', { file_id: 'file-example' }, 'file_id', 'fileId'],
    ['calendar', 'list_events', 'write', { calendar_id: 'primary' }, 'calendar_id', 'calendarId'],
    ['calendar', 'get_event', 'write', { calendar_id: 'primary', event_id: 'event-example' }, 'event_id', 'eventId'],
  ];
  for (const [module, action, privilege, input, from, to] of examples) {
    await putActive(store, fake, { service: 'google', module, privilege });
    const id = `google.${module}.${action}`;
    fake.catalog.setResult(fake.catalog.toSlug(id), (args) => {
      assert.deepEqual(args[to], input[from]);
      assert.equal(Object.hasOwn(args, from), false);
      return { checked: true };
    });
    assert.equal((await gw.execute({ action: id, input })).checked, true);
  }
});
