import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestGateway, putActive } from '../../../gateway/test/fake-provider.js';

test('prediction creation requires confirmation and returns a canned id', async () => {
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'replicate', module: 'models', privilege: 'write' });
  const call = { action: 'replicate.models.create_prediction', input: { version: 'version-example', input: { prompt: 'Example' } } };
  assert.equal((await gw.execute(call)).status, 'needs_confirmation');
  assert.equal((await gw.execute({ ...call, confirm: true })).id, 'prediction-example');
});

test('collections and completed predictions return catalog objects and output URLs', async () => {
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'replicate', module: 'models', privilege: 'write' });
  const collections = await gw.execute({ action: 'replicate.models.list_collections', input: {} });
  assert.equal(collections.results[0].name, 'Example');
  const prediction = await gw.execute({ action: 'replicate.models.get_prediction', input: { prediction_id: 'prediction-example' } });
  assert.deepEqual(prediction.output, ['https://example.com/output.png']);
});
