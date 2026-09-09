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
  ['sheets', 'search', 'read', { query: 'Example' }, 'spreadsheets'],
  ['sheets', 'get_values', 'read', { spreadsheet_id: 'sheet-example', ranges: ['Sheet1!A1:B1'] }, 'valueRanges'],
  ['docs', 'search', 'read', { query: 'Example' }, 'documents'],
  ['docs', 'get', 'read', { document_id: 'doc-example' }, 'documentId'],
  ['slides', 'get', 'read', { presentation_id: 'slides-example' }, 'presentationId'],
  ['slides', 'get_page', 'read', { presentation_id: 'slides-example', page_object_id: 'page-example' }, 'objectId'],
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
  for (const action of ['google.analytics.list_account_summaries', 'google.drive.find_file', 'google.calendar.list_events', 'google.gmail.list_messages', 'google.sheets.search', 'google.docs.search', 'google.slides.get']) {
    assert.equal((await gw.execute({ action, input: {} })).status, 'needs_connect');
  }
});

test('Gmail does not unlock Search Console, Drive, Calendar, Analytics, Sheets, Docs, or Slides', async () => {
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'google', module: 'gmail', privilege: 'read' });
  for (const action of ['google.search-console.sites', 'google.analytics.list_account_summaries', 'google.drive.find_file', 'google.calendar.list_events', 'google.sheets.search', 'google.docs.search', 'google.slides.get']) {
    assert.equal((await gw.execute({ action, input: {} })).status, 'needs_connect');
  }
});

test('Sheets does not unlock Gmail, Drive, Calendar, Analytics, Search Console, Docs, or Slides', async () => {
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'google', module: 'sheets', privilege: 'read' });
  for (const action of ['google.search-console.sites', 'google.analytics.list_account_summaries', 'google.drive.find_file', 'google.calendar.list_events', 'google.gmail.list_messages', 'google.docs.search', 'google.slides.get']) {
    assert.equal((await gw.execute({ action, input: {} })).status, 'needs_connect');
  }
});

test('Docs does not unlock Sheets, Gmail, Drive, Calendar, Analytics, Search Console, or Slides', async () => {
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'google', module: 'docs', privilege: 'read' });
  for (const action of ['google.search-console.sites', 'google.analytics.list_account_summaries', 'google.drive.find_file', 'google.calendar.list_events', 'google.gmail.list_messages', 'google.sheets.search', 'google.slides.get']) {
    assert.equal((await gw.execute({ action, input: {} })).status, 'needs_connect');
  }
});

test('Slides does not unlock Docs, Sheets, Gmail, Drive, Calendar, Analytics, or Search Console', async () => {
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'google', module: 'slides', privilege: 'read' });
  for (const action of ['google.search-console.sites', 'google.analytics.list_account_summaries', 'google.drive.find_file', 'google.calendar.list_events', 'google.gmail.list_messages', 'google.sheets.search', 'google.docs.search']) {
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
    ['sheets', 'get_values', 'read', { spreadsheet_id: 'sheet-example', major_dimension: 'ROWS' }, 'major_dimension', 'majorDimension'],
    ['docs', 'get', 'read', { document_id: 'doc-example' }, 'document_id', 'id'],
    ['slides', 'get', 'read', { presentation_id: 'slides-example' }, 'presentation_id', 'presentationId'],
    ['slides', 'get_page', 'read', { presentation_id: 'slides-example', page_object_id: 'page-example' }, 'page_object_id', 'pageObjectId'],
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
