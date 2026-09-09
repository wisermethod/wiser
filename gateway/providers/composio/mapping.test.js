import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toSlug, fromSlug, toolkitFor, toolkitsFor } from './mapping.js';
import { searchMappedActions } from './catalog-provider.js';
import { proxyRequestBody, resolveProxyPayload } from './auth-provider.js';
import { loadConnectors } from '../../src/manifest.js';
import { fileURLToPath } from 'node:url';

test('all catalog actions have round-trip mappings and the module toolkit', async () => {
  const connectors = await loadConnectors([fileURLToPath(new URL('../../../connectors', import.meta.url))]);
  for (const connector of connectors) {
    for (const [module, definition] of Object.entries(connector.manifest.modules)) {
      if (definition.auth.provider !== 'catalog') continue;
      assert.equal(toolkitFor(connector.id, module), definition.auth.toolkit);
      for (const [action, row] of Object.entries(definition.actions)) {
        if (row.execution.prefer !== 'catalog') continue;
        const id = `${connector.id}.${module}.${action}`;
        assert.ok(toSlug(id), id);
        assert.equal(fromSlug(toSlug(id)), id);
      }
    }
  }
  assert.equal(toolkitFor('github'), toolkitFor('github', 'repos'));
  assert.equal(toolkitFor('google'), null);
  assert.equal(toolkitsFor('google').length, 8);
  assert.deepEqual(toolkitsFor('google', 'unknown'), []);
  assert.equal(toolkitFor('microsoft'), null);
  assert.equal(toolkitsFor('microsoft').length, 5);
  assert.equal(toolkitFor('zoho'), null);
  assert.equal(toolkitsFor('zoho').length, 7);
  assert.deepEqual(toolkitsFor('zoho', 'unknown'), []);
  assert.deepEqual(toolkitsFor('microsoft', 'unknown'), []);
});

test('search iterates the eight Google toolkits and can restrict one module', async () => {
  const seen = [];
  const ids = ['google.search-console.query', 'google.analytics.run_report', 'google.drive.find_file', 'google.calendar.list_events', 'google.gmail.list_messages', 'google.sheets.search', 'google.docs.search', 'google.slides.get'];
  const request = async (path) => {
    seen.push(new URL(path, 'https://example.com').searchParams.get('toolkit_slug'));
    return { ok: true, data: { items: ids.map((id) => ({ slug: toSlug(id) })) } };
  };
  assert.deepEqual(await searchMappedActions({ service: 'google' }, request), ids);
  assert.deepEqual(seen, toolkitsFor('google'));
  seen.length = 0;
  assert.deepEqual(await searchMappedActions({ service: 'google', module: 'drive' }, request), ['google.drive.find_file']);
  assert.deepEqual(seen, [toolkitFor('google', 'drive')]);
});

test('search iterates the five unique Microsoft toolkits and can restrict outlook or calendar', async () => {
  const seen = [];
  const ids = ["microsoft.outlook.list_messages", "microsoft.outlook.get_message", "microsoft.calendar.list_events", "microsoft.calendar.get_event", "microsoft.onedrive.find", "microsoft.onedrive.get", "microsoft.sharepoint.list", "microsoft.sharepoint.get", "microsoft.excel.search", "microsoft.excel.get_values", "microsoft.teams.list", "microsoft.teams.get"];
  const request = async (path) => {
    seen.push(new URL(path, 'https://example.com').searchParams.get('toolkit_slug'));
    return { ok: true, data: { items: [...ids, 'google.gmail.list_messages'].map((id) => ({ slug: toSlug(id) })) } };
  };
  assert.deepEqual(await searchMappedActions({ service: 'microsoft' }, request), ids);
  assert.deepEqual(seen, toolkitsFor('microsoft'));
  seen.length = 0;
  assert.deepEqual(await searchMappedActions({ service: 'microsoft', module: 'outlook' }, request), ids.filter((id) => id.startsWith('microsoft.outlook.')));
  assert.deepEqual(seen, [toolkitFor('microsoft', 'outlook')]);
  seen.length = 0;
  assert.deepEqual(await searchMappedActions({ service: 'microsoft', module: 'calendar' }, request), ['microsoft.calendar.list_events', 'microsoft.calendar.get_event']);
  assert.deepEqual(seen, [toolkitFor('microsoft', 'calendar')]);
  assert.equal(toolkitFor('microsoft', 'calendar'), toolkitFor('microsoft', 'outlook'));
  seen.length = 0;
  assert.deepEqual(await searchMappedActions({ service: 'microsoft', module: 'unknown' }, request), []);
  assert.deepEqual(seen, []);
});

test('proxy request forwards binary_body and parameters without a JSON body', () => {
  const binary_body = { base64: 'ZXhhbXBsZQ==', content_type: 'multipart/form-data; boundary=example' };
  const parameters = [{ name: 'example', value: 'example', in: 'query' }];
  const result = proxyRequestBody({ providerAccountId: 'fake-account', endpoint: '/example/import', method: 'POST', binary_body, parameters });
  assert.deepEqual(result.binary_body, binary_body);
  assert.deepEqual(result.parameters, parameters);
  assert.equal(Object.hasOwn(result, 'body'), false);
});

test('proxy payload drops headers even without a data wrapper', async () => {
  const result = await resolveProxyPayload({ success: true, result: {}, headers: {}, 'set-cookie': [] });
  assert.deepEqual(result, { success: true, result: {} });
});

test('search iterates the seven Zoho toolkits and can restrict crm or another module', async () => {
  const seen = [];
  const ids = ["zoho.crm.get", "zoho.crm.search", "zoho.crm.create", "zoho.mail.list", "zoho.mail.get", "zoho.books.list", "zoho.books.get", "zoho.desk.list", "zoho.desk.get", "zoho.inventory.list", "zoho.inventory.get", "zoho.invoice.list", "zoho.invoice.get", "zoho.bigin.list", "zoho.bigin.get"];
  const request = async (path) => {
    seen.push(new URL(path, 'https://example.com').searchParams.get('toolkit_slug'));
    return { ok: true, data: { items: [...ids, 'microsoft.outlook.list_messages'].map((id) => ({ slug: toSlug(id) })) } };
  };
  assert.deepEqual(await searchMappedActions({ service: 'zoho' }, request), ids);
  assert.deepEqual(seen, toolkitsFor('zoho'));
  for (const module of ['crm', 'mail', 'books', 'desk', 'inventory', 'invoice', 'bigin']) {
    seen.length = 0;
    assert.deepEqual(await searchMappedActions({ service: 'zoho', module }, request), ids.filter((id) => id.split('.')[1] === module));
    assert.deepEqual(seen, [toolkitFor('zoho', module)]);
  }
  seen.length = 0;
  assert.deepEqual(await searchMappedActions({ service: 'zoho', module: 'unknown' }, request), []);
  assert.deepEqual(seen, []);
});
