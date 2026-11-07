import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, linkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { CURATED } from './curated.js';
import { canonicalJson, findDrift, listTools, main } from './curated-drift.mjs';

const SCRIPT = new URL('./curated-drift.mjs', import.meta.url);
const KEY = 'fixture-provider-key';
const ROW = CURATED.find((row) => row.id === 'google.gmail.list_labels');

/** Synthetic provider listing: reconstruct optional fields only to test narrowing. */
function listing() {
  return CURATED.map((row) => {
    const input_parameters = structuredClone(row.input_schema);
    for (const field of row.narrowed) input_parameters.properties[field] = { type: 'string' };
    return { slug: row.tool, input_parameters, tags: [...row.hint] };
  });
}

function files(tools = listing()) {
  const home = mkdtempSync(join(tmpdir(), 'curated-drift-'));
  const file = join(home, 'listing.json');
  writeFileSync(file, JSON.stringify({ items: tools }));
  return { home, file };
}

async function run(args, fetchImpl = () => assert.fail('offline check reached network')) {
  let stdout = '';
  let stderr = '';
  const code = await main(args, {
    fetchImpl, stdout: { write: (value) => { stdout += value; } },
    stderr: { write: (value) => { stderr += value; } },
  });
  return { code, stdout, stderr };
}

test('canonical schema comparison sorts all object keys and retains array order', () => {
  assert.equal(canonicalJson({ b: [{ y: 2, x: 1 }], a: true }), canonicalJson({ a: true, b: [{ x: 1, y: 2 }] }));
  assert.notEqual(canonicalJson(['a', 'b']), canonicalJson(['b', 'a']));
});

test('matching fixture passes for all 48 rows without a key or network', async () => {
  const { file } = files();
  const result = await run(['--fixture', file]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(result.stdout), { ok: true, rows: CURATED.map((row) => row.id), source: 'fixture' });
});

for (const [name, mutate, reason] of [
  ['changed schema', (tools) => { tools[0].input_parameters.properties.planted = { type: 'string' }; }, 'input_schema'],
  ['missing slug', (tools) => { tools.shift(); }, 'missing_slug'],
  ['changed hint', (tools) => { tools[0].tags = ['updateHint']; }, 'hints'],
  ['duplicate slug', (tools) => { tools.push(structuredClone(tools[0])); }, 'duplicate_slug'],
  ['changed annotation', (tools) => { tools[0].input_parameters.title = 'Changed'; }, 'input_schema'],
  ['narrowed field now required', (tools) => { tools[0].input_parameters.required = [...(tools[0].input_parameters.required ?? []), 'user_id']; }, 'narrowed_required'],
]) test(`fixture drift fails naming the row: ${name}`, async () => {
  const tools = listing();
  mutate(tools);
  const { file } = files(tools);
  const result = await run(['--fixture', file]);
  assert.equal(result.code, 1);
  assert.equal(result.stdout, '');
  assert.ok(result.stderr.includes(`${ROW.id}: ${reason}`), result.stderr);
});

test('hint order and unrelated hints do not change read/write semantics', () => {
  const tools = listing();
  for (const tool of tools) tool.tags = ['idempotentHint', ...tool.tags].reverse();
  assert.deepEqual(findDrift(CURATED, tools), []);
});

test('one report names each changed row and every kind of drift', async () => {
  const tools = listing();
  tools[0].tags = ['destructiveHint'];
  tools[1].input_parameters.title = 'Changed';
  tools.splice(2, 1);
  const { file } = files(tools);
  const result = await run(['--fixture', file]);
  for (const row of CURATED.slice(0, 3)) assert.ok(result.stderr.includes(row.id));
  assert.equal(result.code, 1);
});

test('narrowing never hides a newly required field even when the filtered schemas match', () => {
  const row = { ...ROW, input_schema: { ...ROW.input_schema, required: [] } };
  const tool = {
    slug: row.tool,
    input_parameters: { ...structuredClone(row.input_schema), required: ['user_id'] },
    tags: row.hint,
  };
  tool.input_parameters.properties.user_id = { type: 'string' };
  assert.deepEqual(findDrift([row], [tool]), [{ id: row.id, reason: 'narrowed_required', field: 'user_id' }]);
});

for (const args of [[], ['--unknown'], ['--install'], ['--fixture'], ['--env', 'relative'], ['--fixture', 'missing-file'], ['--fixture', 'a', '--fixture', 'b']]) {
  test(`usage errors exit 2 before network: ${JSON.stringify(args)}`, async () => {
    const result = await run(args);
    assert.equal(result.code, 2);
    assert.equal(result.stdout, '');
    assert.ok(result.stderr.includes('--help'));
  });
}

for (const args of [['help'], ['--help'], ['--env', '/file/that/does/not/exist', '--help']]) {
  test(`help precedes configuration: ${args.join(' ')}`, async () => {
    const result = await run(args);
    assert.equal(result.code, 0);
    assert.ok(result.stdout.startsWith('Usage:'));
    assert.equal(result.stderr, '');
  });
}

test('unknown options are still refused when help is requested', async () => {
  assert.equal((await run(['--help', '--unknown'])).code, 2);
});

test('invalid JSON and a partial fixture are usage errors without printing the content', async () => {
  const { file } = files();
  for (const text of [`invalid-${KEY}`, JSON.stringify({ items: listing(), next_cursor: KEY })]) {
    writeFileSync(file, text);
    const result = await run(['--fixture', file]);
    assert.equal(result.code, 2);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr.includes(KEY), false);
  }
});

test('fixture path screening rejects credential files, aliases and the credential directory', async () => {
  const { home, file } = files();
  const secrets = join(home, 'keys');
  mkdirSync(secrets);
  const env = join(secrets, 'key.txt');
  writeFileSync(env, `WISER_AUTH_PROVIDER_KEY=${KEY}\n`);
  const hard = join(home, 'hard.json');
  const sibling = join(secrets, 'other-key.txt');
  writeFileSync(sibling, 'another fixture key');
  const siblingHard = join(home, 'sibling-hard.json');
  linkSync(sibling, siblingHard);
  const link = join(home, 'link.json');
  linkSync(env, hard);
  symlinkSync(env, link);
  const inside = join(secrets, 'listing.json');
  writeFileSync(inside, JSON.stringify(listing()));
  for (const path of [env, hard, link, inside, siblingHard]) {
    const result = await run(['--env', env, '--fixture', path]);
    assert.equal(result.code, 2);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr.includes(KEY), false);
  }
  assert.equal((await run(['--env', env, '--fixture', file])).code, 0);
});

test('an empty provider key is a key error, without a network call', async () => {
  const { home } = files();
  const env = join(home, 'empty-key.txt');
  writeFileSync(env, 'WISER_AUTH_PROVIDER_KEY=\n');
  const result = await run(['--env', env]);
  assert.equal(result.code, 2);
  assert.equal(result.stdout, '');
});

test('network listing follows every cursor and preserves toolkit, limit and private key header', async () => {
  const calls = [];
  const expected = [{ slug: 'first' }, { slug: 'second' }, { slug: 'third' }];
  const tools = await listTools('GMAIL', KEY, async (url, options) => {
    const query = new URL(url).searchParams;
    assert.equal(query.get('toolkit_slug'), 'GMAIL');
    assert.equal(query.get('limit'), '1000');
    assert.equal(options.headers['x-api-key'], KEY);
    assert.equal(options.redirect, 'error');
    calls.push(query.get('cursor'));
    const index = calls.length - 1;
    return { ok: true, json: async () => ({ items: [expected[index]], next_cursor: index === 2 ? null : `page-${index + 1}` }) };
  });
  assert.deepEqual(calls, [null, 'page-1', 'page-2']);
  assert.deepEqual(tools, expected);
});

test('provider mode loads the same key names as catalog-provider and lists each toolkit once', async () => {
  for (const keyName of ['WISER_AUTH_PROVIDER_KEY', 'COMPOSIO_API_KEY']) {
    const { home } = files();
    const env = join(home, 'provider-key.txt');
    writeFileSync(env, `${keyName}=${KEY}\n`);
    const seen = [];
    const result = await run(['--env', env], async (url, options) => {
      assert.equal(options.headers['x-api-key'], KEY);
      const toolkit = new URL(url).searchParams.get('toolkit_slug');
      seen.push(toolkit);
      return { ok: true, json: async () => ({ items: listing().filter((tool) => CURATED.find((row) => row.tool === tool.slug).toolkit === toolkit) }) };
    });
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(seen, [...new Set(CURATED.map((row) => row.toolkit))]);
    assert.equal(result.stdout.includes(KEY), false);
  }
});

for (const [name, fetchImpl, code] of [
  ['transport failure', async () => { throw new Error(KEY); }, 1],
  ['HTTP failure', async () => ({ ok: false, status: 500, json: () => assert.fail('must not read error body') }), 1],
  ['key refusal', async () => ({ ok: false, status: 401 }), 2],
  ['bad JSON', async () => ({ ok: true, json: () => { throw new Error(KEY); } }), 1],
  ['bad items', async () => ({ ok: true, json: () => ({ items: null }) }), 1],
  ['bad cursor', async () => ({ ok: true, json: () => ({ items: [], next_cursor: {} }) }), 1],
  ['repeated cursor', async () => ({ ok: true, json: () => ({ items: [], next_cursor: KEY }) }), 1],
]) test(`listing errors are complete refusals without provider detail: ${name}`, async () => {
  const { home } = files();
  const env = join(home, 'provider-key.txt');
  writeFileSync(env, `WISER_AUTH_PROVIDER_KEY=${KEY}\n`);
  const result = await run(['--env', env], fetchImpl);
  assert.equal(result.code, code);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr.includes(KEY), false);
  assert.ok(result.stderr.includes('GET https://backend.composio.dev/api/v3.1/tools'));
});

test('the script imports without executing main, and the fixture CLI exits cleanly', () => {
  const imported = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(SCRIPT.href)})`], { encoding: 'utf8' });
  assert.equal(imported.status, 0, imported.stderr);
  assert.equal(imported.stdout, '');
  assert.equal(imported.stderr, '');
  const { file } = files();
  const cli = spawnSync(process.execPath, [fileURLToPath(SCRIPT), '--fixture', file], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(JSON.parse(cli.stdout).ok, true);
  assert.equal(cli.stderr, '');
});
