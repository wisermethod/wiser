import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
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
  assert.deepEqual(ids, ['bing', 'clarity', 'cloudflare', 'courtlistener', 'dataforseo', 'elevenlabs', 'figma', 'github', 'google', 'google-apis', 'google-cloud', 'google-vision', 'heygen', 'hubspot', 'huggingface', 'linkedin', 'microsoft', 'monday', 'notion', 'replicate', 'stripe', 'supabase', 'tinyfish', 'twenty', 'usebouncer', 'vercel', 'vm', 'xai', 'youtube', 'zoho', 'zoom']);
  assert.ok(obj.actions.includes('youtube.videos.upload'));
  assert.ok(obj.actions.includes('xai.speech.synthesize'));
  assert.ok(obj.actions.includes('xai.speech.list_builtin_voices'));
  assert.ok(obj.actions.includes('xai.speech.list_voice_clones'));
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

for (const [name, standing, confirmation = 'always'] of [
  ['unknown kind', { kind: 'run', summary: 'change things' }],
  ['missing summary', { kind: 'change' }],
  ['extra member', { kind: 'change', summary: 'change things', days: 7 }],
  ['no confirmation stop', { kind: 'change', summary: 'change things' }, 'none'],
  ['absent confirmation', { kind: 'change', summary: 'change things' }, null],
  ['null', null], ['array', []], ['string', 'change'],
  ['empty summary', { kind: 'change', summary: '' }],
  ['numeric summary', { kind: 'change', summary: '123' }],
  ['long summary', { kind: 'change', summary: 'a'.repeat(81) }],
  ['control in summary', { kind: 'change', summary: 'change\nthings' }],
  ['invisible in summary', { kind: 'change', summary: 'change\u2060things' }],
  ['punctuation in summary', { kind: 'change', summary: 'change things.' }],
]) {
  test(`validator rejects standing_approval with ${name}`, async (t) => {
    const root = makeHome();
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const dir = join(root, 'sample');
    writeConnector(dir, { id: 'sample' });
    const file = join(dir, 'manifest.json');
    const manifest = JSON.parse(readFileSync(file, 'utf8'));
    const action = manifest.modules.items.actions.ping;
    action.standing_approval = standing;
    if (confirmation === null) delete action.confirmation;
    else action.confirmation = confirmation;
    writeFileSync(file, JSON.stringify(manifest));
    await assert.rejects(() => loadConnector(dir), /modules\.items\.actions\.ping\.(standing_approval|confirmation)/);
  });
}

test('validator accepts every standing approval kind on an action with a stop', async (t) => {
  const root = makeHome();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dir = join(root, 'sample');
  writeConnector(dir, { id: 'sample' });
  const file = join(dir, 'manifest.json');
  const manifest = JSON.parse(readFileSync(file, 'utf8'));
  for (const kind of ['change', 'delete', 'send', 'pay', 'publish', 'grant_access']) {
    const standing = { kind, summary: 'change things' };
    manifest.modules.items.actions.ping.confirmation = 'once';
    manifest.modules.items.actions.ping.standing_approval = standing;
    writeFileSync(file, JSON.stringify(manifest));
    assert.deepEqual((await loadConnector(dir)).manifest.modules.items.actions.ping.standing_approval, standing);
  }
});

test('validator accepts safe standing approval cautions and rejects invalid values at caution', async (t) => {
  const root = makeHome();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dir = join(root, 'sample');
  writeConnector(dir, { id: 'sample' });
  const file = join(dir, 'manifest.json');
  const manifest = JSON.parse(readFileSync(file, 'utf8'));
  const action = manifest.modules.items.actions.ping;
  action.confirmation = 'always';
  action.standing_approval = { kind: 'change', summary: 'change things' };
  for (const caution of ['.', 'This may trigger workflows.', `${'a'.repeat(239)}.`]) {
    action.standing_approval.caution = caution;
    writeFileSync(file, JSON.stringify(manifest));
    assert.equal((await loadConnector(dir)).manifest.modules.items.actions.ping.standing_approval.caution, caution);
  }
  for (const caution of ['', `${'a'.repeat(240)}.`, 'No final period', 'Trailing period. ', null, 1,
    'Unsafe\n.', 'Unsafe\u2060.', 'Unsafe\ud800.', 'Unsafe\u2028.', 'Unsafe\u2029.', 'Unsafe\ufe0f.']) {
    action.standing_approval.caution = caution;
    writeFileSync(file, JSON.stringify(manifest));
    await assert.rejects(() => loadConnector(dir), (err) => {
      assert.equal(err.field, 'modules.items.actions.ping.standing_approval.caution');
      return true;
    });
  }
});

test('Twenty marks exactly records.create and records.update for standing approvals', async () => {
  const connector = await loadConnector(join(CONNECTORS, 'twenty'));
  const marked = [];
  for (const [module, definition] of Object.entries(connector.manifest.modules)) {
    for (const [action, row] of Object.entries(definition.actions)) {
      if (row.standing_approval) marked.push([`${module}.${action}`, row.standing_approval]);
    }
  }
  assert.deepEqual(marked, [
    ['records.create', { kind: 'change', summary: 'create records in Twenty', caution: "Creating or changing a Twenty record can start your workspace's own workflows, and a workflow may send email from a connected mailbox, so under this approval nobody looks at the record before that happens." }],
    ['records.update', { kind: 'change', summary: 'change fields on existing Twenty records', caution: "Creating or changing a Twenty record can start your workspace's own workflows, and a workflow may send email from a connected mailbox, so under this approval nobody looks at the record before that happens." }],
  ]);
});

function inputFileAction() {
  return {
    risk: 'medium', confirmation: 'always', execution: { prefer: 'proxy' },
    input_files: { field: 'attachments', max_bytes: 2097152 },
    input: { type: 'object', additionalProperties: false, properties: {
      attachments: { type: 'array', minItems: 1, maxItems: 10,
        items: { type: 'string', minLength: 1, maxLength: 4096, pattern: '^/[^\\u0000]*$' } },
    } },
  };
}

function inputFileManifest(t, action) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'wiser-input-manifest-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dir = join(root, 'sample');
  writeConnector(dir, { id: 'sample' });
  const file = join(dir, 'manifest.json');
  const manifest = JSON.parse(readFileSync(file, 'utf8'));
  manifest.modules.items.actions.ping = action;
  writeFileSync(file, JSON.stringify(manifest));
  return { root, dir };
}

const badInputFiles = [
  ...[null, [], '', 1, true, {}].map((value) => [String(JSON.stringify(value)), (a) => { a.input_files = value; }]),
  ['unknown member', (a) => { a.input_files.path = '/invented'; }],
  ['missing field', (a) => { delete a.input_files.field; }],
  ['missing cap', (a) => { delete a.input_files.max_bytes; }],
  ...['', null, 1, true, 'a.b', 'a/b', 'a-b', 'a b', '1a', 'a'.repeat(65), '\u00e9', 'attachments\n', 'attachments\u2028'].map((value) =>
    [`field ${JSON.stringify(value)}`, (a) => { a.input_files.field = value; }]),
  ...[0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '64', true, null].map((value) =>
    [`cap ${JSON.stringify(value)}`, (a) => { a.input_files.max_bytes = value; }]),
  ['nonexistent property', (a) => { a.input_files.field = 'missing'; }],
  ['inherited property', (a) => { a.input_files.field = 'toString'; }],
  ['absent input', (a) => { delete a.input; }],
  ['absent input type', (a) => { delete a.input.type; }],
  ['array input', (a) => { a.input.type = 'array'; }],
  ['union input', (a) => { a.input.type = ['object']; }],
  ['open input', (a) => { a.input.additionalProperties = true; }],
  ['absent additionalProperties', (a) => { delete a.input.additionalProperties; }],
  ['missing properties', (a) => { delete a.input.properties; }],
  ['array properties', (a) => { a.input.properties = []; }],
  ['null target', (a) => { a.input.properties.attachments = null; }],
  ['string target', (a) => { a.input.properties.attachments.type = 'string'; }],
  ['missing target type', (a) => { delete a.input.properties.attachments.type; }],
  ['missing items', (a) => { delete a.input.properties.attachments.items; }],
  ['tuple items', (a) => { a.input.properties.attachments.items = [{ type: 'string' }]; }],
  ['null items', (a) => { a.input.properties.attachments.items = null; }],
  ['wrong item type', (a) => { a.input.properties.attachments.items.type = 'number'; }],
  ['missing item type', (a) => { delete a.input.properties.attachments.items.type; }],
  ['union item type', (a) => { a.input.properties.attachments.items.type = ['string']; }],
  ['reversed counts', (a) => { a.input.properties.attachments.minItems = 11; }],
  ['reversed lengths', (a) => { a.input.properties.attachments.items.minLength = 4097; }],
  ['bad regex', (a) => { a.input.properties.attachments.items.pattern = '['; }],
  ['non-string regex', (a) => { a.input.properties.attachments.items.pattern = 1; }],
];
for (const bound of ['minItems', 'maxItems', 'minLength', 'maxLength']) {
  for (const value of [undefined, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '1', null, true]) {
    badInputFiles.push([`${bound} ${String(value)}`, (a) => {
      const target = a.input.properties.attachments;
      const schema = bound.endsWith('Length') ? target.items : target;
      if (value === undefined) delete schema[bound];
      else schema[bound] = value;
    }]);
  }
}

for (const [name, mutate] of badInputFiles) {
  test(`F01 input_files refuses ${name} at load and --check`, async (t) => {
    const action = inputFileAction();
    mutate(action);
    const { root, dir } = inputFileManifest(t, action);
    await assert.rejects(() => loadConnector(dir), /modules\.items\.actions\.ping\.(input_files|input)/);
    const result = spawnSync(process.execPath, [SERVER, '--check', '--connectors', root], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr + result.stdout, /modules\.items\.actions\.ping\.(input_files|input)/);
  });
}

test('F01 input_files accepts optional bounded input, inclusive bounds and independent output_file', async (t) => {
  for (const field of ['attachments', '_', 'a'.repeat(64), '__proto__']) {
    for (const max_bytes of [1, 2097152, Number.MAX_SAFE_INTEGER]) {
      const action = inputFileAction();
      const target = action.input.properties.attachments;
      target.minItems = target.maxItems = 1;
      target.items.minLength = target.items.maxLength = 1;
      delete target.items.pattern;
      action.input_files = { field, max_bytes };
      action.input.properties = Object.fromEntries([[field, target]]);
      action.output_file = { media_types: ['audio/mpeg'], max_bytes: 64 };
      const { root, dir } = inputFileManifest(t, action);
      const loaded = await loadConnector(dir);
      assert.deepEqual(loaded.manifest.modules.items.actions.ping, action);
      const result = spawnSync(process.execPath, [SERVER, '--check', '--connectors', root], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(JSON.parse(result.stdout).ok, true);
    }
  }
});
