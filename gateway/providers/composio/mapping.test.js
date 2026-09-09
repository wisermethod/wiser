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
  assert.equal(toolkitsFor('google').length, 6);
  assert.deepEqual(toolkitsFor('google', 'unknown'), []);
});

test('search iterates the six Google toolkits and can restrict one module', async () => {
  const seen = [];
  const ids = ['google.search-console.query', 'google.analytics.run_report', 'google.drive.find_file', 'google.calendar.list_events', 'google.gmail.list_messages', 'google.sheets.search'];
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
