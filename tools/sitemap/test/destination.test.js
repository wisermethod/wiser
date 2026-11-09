import { test } from 'node:test';
import assert from 'node:assert/strict';
import { destinationReason } from '../../lib/destination-core.js';
import { createSnapshot } from '../scripts/snapshot-core.js';

test('a blocked DNS literal wins over a malformed entry before sitemap fetch', async () => {
  const lookup = async () => ['not-an-address', '10.0.0.1'];
  assert.equal(await destinationReason('site.test', lookup), 'private_range');
  for (const requireResolved of [false, true]) {
    let fetched = false;
    await assert.rejects(createSnapshot({ urls: ['https://site.test/map.xml'], date: '2026-11-07' },
      async () => { fetched = true; }, lookup, { requireResolved }), /a private-range address/);
    assert.equal(fetched, false);
  }
});

test('malformed DNS stays unresolved when every literal is public, in either order', async () => {
  for (const addresses of [['not-an-address', '93.184.216.34'], ['93.184.216.34', 'not-an-address']]) {
    assert.equal(await destinationReason('site.test', async () => addresses), 'unresolvable');
  }
  for (const addresses of [['not-an-address', '127.0.0.1'], ['127.0.0.1', 'not-an-address']]) {
    assert.equal(await destinationReason('site.test', async () => addresses), 'loopback');
  }
});
