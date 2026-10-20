import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  assert.deepEqual(ids, ['bing', 'clarity', 'cloudflare', 'courtlistener', 'dataforseo', 'figma', 'github', 'google', 'google-apis', 'google-cloud', 'google-vision', 'hubspot', 'huggingface', 'linkedin', 'microsoft', 'monday', 'notion', 'replicate', 'stripe', 'supabase', 'tinyfish', 'twenty', 'usebouncer', 'vercel', 'vm', 'xai', 'zoho', 'zoom']);
  assert.ok(obj.actions.includes('xai.voice.synthesize'));
  assert.ok(obj.actions.includes('xai.voice.list_voices'));
  assert.ok(obj.actions.includes('xai.voice.list_custom_voices'));
  assert.ok(obj.actions.includes('tinyfish.web.search'));
  assert.ok(obj.actions.includes('tinyfish.web.fetch'));
  assert.ok(obj.actions.includes('github.repos.get'));
  assert.ok(obj.actions.includes('courtlistener.caselaw.search'));
  assert.ok(obj.actions.includes('courtlistener.caselaw.get_docket'));
  assert.ok(obj.actions.includes('courtlistener.caselaw.get_cluster'));
  assert.ok(obj.actions.includes('courtlistener.caselaw.list_courts'));
  assert.ok(obj.actions.includes('cloudflare.dns.export_zone'));
  assert.ok(obj.actions.includes('google-apis.insights.run'));
  assert.ok(obj.actions.includes('google-apis.translate.text'));
  assert.ok(obj.actions.includes('google-cloud.projects.get'));
  assert.ok(obj.actions.includes('google-cloud.services.enable'));
  assert.ok(obj.actions.includes('google-cloud.keys.create'));
  assert.ok(obj.actions.includes('vm.inventory.health'));
  assert.ok(obj.actions.includes('vm.inventory.list_hosts'));
  assert.ok(obj.actions.includes('vm.command.run'));
  assert.ok(obj.actions.includes('vm.files.write_file'));
  assert.ok(obj.actions.includes('vm.units.service'));
  assert.ok(obj.actions.includes('twenty.records.list'));
  assert.ok(obj.actions.includes('twenty.records.count'));
  assert.ok(obj.actions.includes('twenty.records.workspace'));
  assert.ok(obj.actions.includes('twenty.metadata.workspace'));
  assert.ok(obj.actions.includes('twenty.records.create'));
  assert.ok(obj.actions.includes('twenty.metadata.list_objects'));
  assert.ok(obj.actions.includes('twenty.metadata.create_object'));
  assert.ok(obj.actions.includes('twenty.metadata.create_field'));
  assert.ok(obj.actions.includes('twenty.metadata.add_field_options'));
});


test('--check exits nonzero on a module and manifest mismatch', () => {
  const root = makeHome();
  writeConnector(join(root, 'sample'), { id: 'sample', extraImplAction: true });
  const result = spawnSync(process.execPath, [SERVER, '--check', '--connectors', root], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.ok((result.stderr + result.stdout).includes('not declared in manifest.json'));
});

for (const [name, output] of [
  ['null', null], ['array', []], ['string', 'audio/mpeg'], ['number', 1],
  ['empty object', {}],
  ['unknown member', { media_types: ['audio/mpeg'], max_bytes: 64, path: '/invented' }],
  ['missing media types', { max_bytes: 64 }],
  ['non-array media types', { media_types: 'audio/mpeg', max_bytes: 64 }],
  ['empty media types', { media_types: [], max_bytes: 64 }],
  ['duplicate media types', { media_types: ['audio/mpeg', 'audio/mpeg'], max_bytes: 64 }],
  ['unknown media type', { media_types: ['audio/unknown'], max_bytes: 64 }],
  ['prototype member as media type', { media_types: ['__proto__'], max_bytes: 64 }],
  ['non-string media type', { media_types: [5], max_bytes: 64 }],
  ['null media type', { media_types: [null], max_bytes: 64 }],
  ['missing cap', { media_types: ['audio/mpeg'] }],
  ['zero cap', { media_types: ['audio/mpeg'], max_bytes: 0 }],
  ['negative cap', { media_types: ['audio/mpeg'], max_bytes: -1 }],
  ['fractional cap', { media_types: ['audio/mpeg'], max_bytes: 1.5 }],
  ['unsafe cap', { media_types: ['audio/mpeg'], max_bytes: Number.MAX_SAFE_INTEGER + 1 }],
  ['string cap', { media_types: ['audio/mpeg'], max_bytes: '64' }],
  ['boolean cap', { media_types: ['audio/mpeg'], max_bytes: true }],
  ['null cap', { media_types: ['audio/mpeg'], max_bytes: null }],
]) {
  test(`validator rejects output_file with ${name}`, async (t) => {
    const root = makeHome();
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const dir = join(root, 'sample');
    writeConnector(dir, { id: 'sample' });
    const file = join(dir, 'manifest.json');
    const manifest = JSON.parse(readFileSync(file, 'utf8'));
    manifest.modules.items.actions.ping.output_file = output;
    writeFileSync(file, JSON.stringify(manifest));
    await assert.rejects(() => loadConnector(dir), /modules\.items\.actions\.ping\.output_file/);
  });
}

test('validator accepts a declared file output with any positive safe integer cap', async (t) => {
  const root = makeHome();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dir = join(root, 'sample');
  writeConnector(dir, { id: 'sample' });
  const file = join(dir, 'manifest.json');
  const manifest = JSON.parse(readFileSync(file, 'utf8'));
  for (const max_bytes of [1, 16777216, Number.MAX_SAFE_INTEGER]) {
    const output = { media_types: ['audio/mpeg'], max_bytes };
    manifest.modules.items.actions.ping.output_file = output;
    writeFileSync(file, JSON.stringify(manifest));
    assert.deepEqual((await loadConnector(dir)).manifest.modules.items.actions.ping.output_file, output);
  }
});
