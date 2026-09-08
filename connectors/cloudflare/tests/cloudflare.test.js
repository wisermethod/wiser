import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

// The gateway is found by walking up from this file, so the test runs at the
// template's depth and at a connector's depth after it is copied.
import { existsSync as __exists } from 'node:fs';
import { dirname as __dirname_, join as __join } from 'node:path';
import { fileURLToPath as __toPath, pathToFileURL as __toUrl } from 'node:url';
function __findGateway() {
  let dir = __toPath(new URL('.', import.meta.url));
  for (let i = 0; i < 8; i += 1) {
    const candidate = __join(dir, 'gateway', 'test', 'fake-provider.js');
    if (__exists(candidate)) return __toUrl(candidate).href;
    const parent = __dirname_(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('gateway/test/fake-provider.js not found above this test');
}
const { createTestGateway, putActive } = await import(__findGateway());

const CONNECTORS = fileURLToPath(new URL('../..', import.meta.url));

test('export_zone goes through proxy on the fake and returns zone_file', async () => {
  const { gw, store, fake } = await createTestGateway({ connectorDirs: [CONNECTORS] });
  await putActive(store, fake, { service: 'cloudflare', module: 'dns', privilege: 'write' });
  const result = await gw.execute({
    action: 'cloudflare.dns.export_zone',
    input: { zone_id: 'zone-example' },
  });
  assert.equal(typeof result.zone_file, 'string');
  assert.match(result.zone_file, /example\.com/);
});

test('batch without confirm returns needs_confirmation', async () => {
  const { gw, store, fake } = await createTestGateway({ connectorDirs: [CONNECTORS] });
  await putActive(store, fake, { service: 'cloudflare', module: 'dns', privilege: 'write' });
  const result = await gw.execute({
    action: 'cloudflare.dns.batch',
    input: { zone_id: 'zone-example', deletes: [], posts: [] },
  });
  assert.equal(result.status, 'needs_confirmation');
  assert.equal(result.action, 'cloudflare.dns.batch');
});
