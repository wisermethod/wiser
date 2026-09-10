import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestGateway, putActive } from '../../../gateway/test/fake-provider.js';

test('export returns the fake metrics object and bounds the day window', async () => {
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'clarity', module: 'analytics', privilege: 'read' });
  const result = await gw.execute({ action: 'clarity.analytics.export', input: { numOfDays: 3 } });
  assert.equal(result.metrics[0].metricName, 'SessionsCount');
  const invalid = await gw.execute({ action: 'clarity.analytics.export', input: { numOfDays: 4 } });
  assert.equal(invalid.status, 'invalid_arguments');
});
