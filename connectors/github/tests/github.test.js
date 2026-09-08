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

test('github.repos.get returns the fake canned result', async () => {
  const { gw, store, fake } = await createTestGateway({ connectorDirs: [CONNECTORS] });
  await putActive(store, fake, { service: 'github', module: 'repos', privilege: 'write' });
  const result = await gw.execute({
    action: 'github.repos.get',
    input: { owner: 'example-org', repo: 'example-repo' },
  });
  assert.equal(result.name, 'example-repo');
  assert.equal(result.owner.login, 'example-org');
});

test('github.issues.create needs confirmation', async () => {
  const { gw, store, fake } = await createTestGateway({ connectorDirs: [CONNECTORS] });
  await putActive(store, fake, { service: 'github', module: 'issues', privilege: 'write' });
  const result = await gw.execute({
    action: 'github.issues.create',
    input: { owner: 'example-org', repo: 'example-repo', title: 'Example' },
  });
  assert.equal(result.status, 'needs_confirmation');
  assert.equal(result.action, 'github.issues.create');
});
