import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { loadConnector, loadConnectors, validationError } from '../src/manifest.js';
import { makeHome } from './fake-provider.js';

const SERVER = fileURLToPath(new URL('../server.js', import.meta.url));
const CONNECTORS = fileURLToPath(new URL('../../connectors', import.meta.url));

function writeConnector(dir, { id, actionsImpl, extraImplAction }) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({
    id,
    service: id,
    modules: {
      items: {
        auth: { provider: 'catalog', toolkit: 'FAKE_KIT', scheme: 'OAUTH2', privilege: 'read' },
        actions: {
          ping: { risk: 'low', confirmation: 'none', execution: { prefer: 'catalog' } },
        },
      },
    },
  }));
  const extra = extraImplAction
    ? `pong: async () => ({}),`
    : '';
  const ping = actionsImpl === 'missing'
    ? ''
    : 'ping: async () => ({}),';
  writeFileSync(join(dir, 'index.js'), `export const modules = { items: { ${ping} ${extra} } };\n`);
}

test('validator rejects an action missing in index.js', async () => {
  const root = makeHome();
  const dir = join(root, 'sample');
  writeConnector(dir, { id: 'sample', actionsImpl: 'missing' });
  await assert.rejects(
    () => loadConnector(dir),
    (err) => {
      assert.match(err.message, /index\.js/);
      assert.match(err.message, /ping/);
      return true;
    },
  );
});

test('validator rejects an extra action in index.js', async () => {
  const root = makeHome();
  const dir = join(root, 'sample');
  writeConnector(dir, { id: 'sample', extraImplAction: true });
  await assert.rejects(
    () => loadConnector(dir),
    (err) => {
      assert.match(err.message, /index\.js/);
      assert.match(err.message, /pong/);
      return true;
    },
  );
});

test('validator rejects id that does not match the directory name', async () => {
  const root = makeHome();
  const dir = join(root, 'sample');
  writeConnector(dir, { id: 'other' });
  await assert.rejects(
    () => loadConnector(dir),
    (err) => {
      assert.match(err.message, /manifest\.json/);
      assert.match(err.message, /id/);
      return true;
    },
  );
});

test('validationError names the file and the field', () => {
  const err = validationError('/tmp/manifest.json', 'modules.dns.auth.provider', 'must be catalog or local-file');
  assert.match(err.message, /manifest\.json/);
  assert.match(err.message, /modules\.dns\.auth\.provider/);
});

test('--check validates all shipped connectors and prints one JSON object', async () => {
  await loadConnectors([CONNECTORS]);
  const r = spawnSync(process.execPath, [SERVER, '--check', '--connectors', CONNECTORS], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const obj = JSON.parse(r.stdout);
  assert.equal(obj.ok, true);
  const ids = obj.connectors.map((c) => c.id).sort();
  assert.deepEqual(ids, ['clarity', 'cloudflare', 'courtlistener', 'figma', 'github', 'google', 'google-vision', 'hubspot', 'huggingface', 'linkedin', 'microsoft', 'monday', 'notion', 'replicate', 'stripe', 'supabase', 'tinyfish', 'usebouncer', 'vercel', 'zoho', 'zoom']);
  assert.ok(obj.actions.includes('tinyfish.web.search'));
  assert.ok(obj.actions.includes('tinyfish.web.fetch'));
  assert.ok(obj.actions.includes('github.repos.get'));
  assert.ok(obj.actions.includes('courtlistener.caselaw.search'));
  assert.ok(obj.actions.includes('courtlistener.caselaw.get_docket'));
  assert.ok(obj.actions.includes('courtlistener.caselaw.get_cluster'));
  assert.ok(obj.actions.includes('courtlistener.caselaw.list_courts'));
  assert.ok(obj.actions.includes('cloudflare.dns.export_zone'));
});


test('--check exits nonzero on a module and manifest mismatch', () => {
  const root = makeHome();
  writeConnector(join(root, 'sample'), { id: 'sample', extraImplAction: true });
  const result = spawnSync(process.execPath, [SERVER, '--check', '--connectors', root], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.ok((result.stderr + result.stdout).includes('not declared in manifest.json'));
});
