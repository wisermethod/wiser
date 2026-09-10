import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

// The gateway is found by walking up from this file, so the test runs at the
// template's depth and at a connector's depth after it is copied.
import { existsSync as __exists } from 'node:fs';
import { dirname as __dirname_, join as __join } from 'node:path';
import { fileURLToPath as __toPath, pathToFileURL as __toUrl } from 'node:url';
function __findGateway() {
  // A connector copied into an owning root that has no gateway above it names the
  // gateway explicitly: WISER_GATEWAY_DIR=/abs/path/to/wiser/gateway node --test ...
  if (process.env.WISER_GATEWAY_DIR) {
    return __toUrl(__join(process.env.WISER_GATEWAY_DIR, 'test', 'fake-provider.js')).href;
  }
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
const { createTestGateway, makeHome, putActive } = await import(__findGateway());

const TEMPLATE_DIR = fileURLToPath(new URL('..', import.meta.url));

const SUBSTITUTIONS = {
  '{{SERVICE}}': 'example',
  '{{MODULE}}': 'items',
  '{{TOOLKIT}}': 'FAKE_KIT',
  '{{SCHEME}}': 'OAUTH2',
  '{{PRIVILEGE}}': 'write',
  '{{SERVICE_TITLE}}': 'Example',
  '{{CATEGORY}}': 'development',
  '{{AUTH_PROVIDER}}': 'catalog',
};

function substitute(text) {
  let out = text;
  for (const [from, to] of Object.entries(SUBSTITUTIONS)) {
    out = out.split(from).join(to);
  }
  return out;
}

test('template loads through the gateway after substituting placeholders in memory', async () => {
  const manifestSrc = substitute(readFileSync(join(TEMPLATE_DIR, 'manifest.json'), 'utf8'));
  const indexSrc = substitute(readFileSync(join(TEMPLATE_DIR, 'index.js'), 'utf8'));
  const typedSrc = substitute(readFileSync(join(TEMPLATE_DIR, 'CONNECTOR.md'), 'utf8'));
  const authSrc = substitute(readFileSync(join(TEMPLATE_DIR, 'auth.md'), 'utf8'));
  const leftover = /\{\{[A-Z_]+\}\}/;
  assert.equal(leftover.test(manifestSrc), false);
  assert.equal(leftover.test(indexSrc), false);
  assert.equal(leftover.test(typedSrc), false);
  assert.equal(leftover.test(authSrc), false);

  // The fixture's ids come from the manifest itself, so this test still holds after
  // the placeholders are substituted with a real service and module.
  const manifest = JSON.parse(manifestSrc);
  const service = manifest.id;
  const module = Object.keys(manifest.modules)[0];
  const privilege = manifest.modules[module].auth.privilege;

  const root = makeHome();
  const dir = join(root, service);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  writeFileSync(join(dir, 'manifest.json'), manifestSrc);
  writeFileSync(join(dir, 'index.js'), indexSrc);

  const { gw, store, fake } = await createTestGateway({ connectorDirs: [root] });
  await putActive(store, fake, { service, module, privilege });
  fake.catalog.setSlug(`${service}.${module}.get`, 'FAKE_ITEM_GET');

  const got = await gw.execute({ action: `${service}.${module}.get`, input: { id: 'item-1' } });
  assert.equal(got.id, 'item-1');

  const needs = await gw.execute({
    action: `${service}.${module}.update`,
    input: { id: 'item-1', name: 'renamed' },
  });
  assert.equal(needs.status, 'needs_confirmation');

  const ran = await gw.execute({
    action: `${service}.${module}.update`,
    input: { id: 'item-1', name: 'renamed' },
    confirm: true,
  });
  assert.equal(ran.status, 200);
});

test('every placeholder in the template is named', () => {
  const files = ['CONNECTOR.md', 'auth.md', 'manifest.json', 'index.js', 'package.json'];
  const found = new Set();
  for (const name of files) {
    const text = readFileSync(join(TEMPLATE_DIR, name), 'utf8');
    for (const m of text.matchAll(/\{\{([A-Z_]+)\}\}/g)) found.add(`{{${m[1]}}}`);
  }
  const named = new Set(Object.keys(SUBSTITUTIONS));
  for (const token of found) {
    assert.ok(named.has(token), `unnamed placeholder ${token}`);
  }
  const table = readFileSync(join(TEMPLATE_DIR, 'CONNECTOR.md'), 'utf8');
  for (const token of named) {
    assert.ok(table.includes(`\`${token}\``), `placeholder ${token} missing from the named table`);
  }
});
