/**
 * Manifest-to-module agreement, asserted for every shipped connector action.
 *
 * The comparison itself lives in `agreement-harness.js`, with what it does and does not cover.
 * This file is the ratchet.
 *
 * ## It is a ratchet, not a pass
 *
 * The family has a backlog. A gate that fails on the day it lands gets skipped, so this one
 * ships with `agreement-baseline.json`, the divergences that existed when it was written. It
 * fails on two things and only two:
 *
 *   1. a divergence that is not in the baseline, which is a new one, and
 *   2. a baseline entry that no longer diverges, which is a fix whose row was not deleted.
 *
 * So the baseline can only shrink, every correction deletes its rows in the same commit, and
 * the file going empty is the class closing. **Do not add a row to make this pass.**
 */
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { call, collectDivergences, schemaViolation } from './agreement-harness.js';

const BASELINE = JSON.parse(readFileSync(new URL('./agreement-baseline.json', import.meta.url), 'utf8'));

test('agreement observes transport when a module sanitizes the sentinel exception', async () => {
  for (const transport of ['proxy', 'http', 'fetchRelease', 'catalog']) {
    const result = await call(async (input, ctx) => {
      try { await ctx[transport]({}); }
      catch { return { status: 'vendor_error' }; }
    }, {}, 'fixture', 'module', 'action');
    assert.deepEqual(result, { kind: 'reached' });
  }
});

test('agreement distinguishes a refusal before transport from a return or unexpected throw', async () => {
  assert.deepEqual(await call(() => ({ status: 'invalid_arguments', field: 'bookmark_time' }), {}),
    { kind: 'refused', field: 'bookmark_time' });
  assert.deepEqual(await call(() => ({}), {}), { kind: 'returned' });
  assert.deepEqual(await call(() => { throw new Error('fixture failure'); }, {}),
    { kind: 'threw', detail: 'fixture failure' });
});

test('every connector action agrees with its own published schema, in both directions', async () => {
  const { found, errors } = await collectDivergences();

  assert.deepEqual(errors, [], 'the harness could not judge some actions; fix the harness, do not baseline them');

  const baseline = new Set(BASELINE.divergences);
  const added = [...found].filter((d) => !baseline.has(d)).sort();
  const fixed = [...baseline].filter((d) => !found.has(d)).sort();

  assert.deepEqual(added, [],
    'new manifest-to-module divergences. Publish what the module enforces, or enforce what the manifest publishes. Do not add these to agreement-baseline.json.');

  assert.deepEqual(fixed, [],
    'these divergences are fixed. Delete their rows from agreement-baseline.json in the same commit; the baseline only ever shrinks.');
});

test('agreement reports unmodelled not under propertyNames just as under items', () => {
  for (const container of ['items', 'propertyNames']) {
    const schema = { type: 'object', properties: { vars: { [container]: { not: { pattern: 'SECRET' } } } } };
    assert.equal(schemaViolation(schema, { vars: {} }), `unmodelled:not (${container})`);
  }
});
test('agreement sees a vars propertyNames rule in its own fixture schema', () => {
  const schema = {
    type: 'object',
    properties: {
      vars: {
        type: 'object',
        propertyNames: { pattern: '^[A-Z][A-Z0-9_]*$', not: { pattern: 'SECRET' } },
        additionalProperties: { type: 'string' },
      },
    },
    required: ['vars'],
    additionalProperties: false,
  };
  for (const input of [{}, { vars: { ACCESS_AUD: 'fixture-audience' } }]) {
    assert.equal(schemaViolation(schema, input), 'unmodelled:not (propertyNames)');
  }
});

// Filesystem state is not expressible in JSON Schema. Keep an independent real
// MP3 fixture here for the new connector without filtering the family findings,
// growing its baseline, replacing the module, or weakening its assertions.
test('ElevenLabs schema-valid fixtures exercise all five actions at the gateway boundary', async (t) => {
  const fs = await import('node:fs');
  const { join } = await import('node:path');
  const { createTestGateway, makeHome, putActive, confirmCall } = await import('./fake-provider.js');
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('offline transport'); });
  const home = fs.realpathSync(makeHome());
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const f = await createTestGateway({ home, outputsDir: join(home, 'outputs') });
  for (const module of ['speech', 'voices', 'models']) await putActive(f.store, f.fake, { service: 'elevenlabs', module });
  const path = join(home, 'agreement-sample.mp3');
  fs.writeFileSync(path, Buffer.from('invented MP3 bytes'));
  let calls = 0;
  f.fake.auth.proxy = async (req) => {
    calls += 1;
    let data;
    if (req.endpoint.endsWith('/with-timestamps')) data = { audio_base64: 'SUQz', alignment: { characters: ['a'], character_start_times_seconds: [0], character_end_times_seconds: [1] } };
    else if (req.endpoint === '/v1/voices/add') data = { voice_id: 'invented_clone', requires_verification: false };
    else if (req.method === 'DELETE') data = { status: 'ok' };
    else data = req.endpoint === '/v1/models' ? [] : { voices: [] };
    return { status: 200, data };
  };
  const fixtures = [
    ['speech.synthesize', { text: 'a', voice_id: 'fake_voice', model_id: 'eleven_v4' }],
    ['voices.list', {}], ['voices.add', { name: 'Clone', path }],
    ['voices.delete', { voice_id: 'fake_voice' }], ['models.list', {}],
  ];
  for (const [id, input] of fixtures) {
    const action = `elevenlabs.${id}`;
    const before = calls;
    const got = await confirmCall(f.gw, { action, input });
    assert.equal(calls, before + 1, `${id} reaches the fake transport`);
    assert.notEqual(got.status, 'invalid_arguments');
    const refused = await f.gw.execute({ action, input: { ...input, undeclared: 'x' } });
    assert.equal(refused.status, 'invalid_arguments');
    assert.equal(calls, before + 1);
  }
});

test('HeyGen schema-valid physical audio fixture exercises all thirteen actions at the gateway', async (t) => {
  const { setup, run, scene, videoInput, noPrivate } = await import('../../connectors/heygen/tests/fixtures.js');
  const f = await setup(t);
  const cases = [ ['speech.synthesize', scene()], ['voices.list', {}], ['voices.get', { voice_id: 'voice_fake-1' }],
    ['voices.add', { name: 'Invented clone', path: f.file, idempotency_key: 'invented-key-123' }],
    ['voices.delete', { voice_id: 'voice_fake-1' }], ['avatars.list', {}], ['avatars.list_looks', {}], ['assets.upload_audio', { path: f.file, idempotency_key: 'invented-key-123' }], ['videos.create', videoInput()], ['videos.get', { video_id: 'video_fake-1' }], ['videos.download', { video_id: 'video_fake-1' }], ['account.wallet', {}], ['account.permissions', {}] ];
  for (const [id, input] of cases) {
    const before = f.calls.length;
    const got = await run(f, id, input);
    assert.ok(f.calls.length > before, `${id} reaches fake transport`);
    assert.equal(got.status, undefined, `${id} accepts the independent valid state`);
    noPrivate(got);
    const calls = f.calls.length;
    assert.equal((await f.gw.execute({ action: `heygen.${id}`, input: { ...input, undeclared: 'x' } })).status, 'invalid_arguments');
    assert.equal(f.calls.length, calls);
  }
});

// Physical Gmail attachments are measured through the real gateway, separately
// from the generic sampler. Every path and byte is invented under a real temp root.
async function gmailFiles(t, armed = true) {
  const fs = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const { loadConnector } = await import('../src/manifest.js');
  const { createTestGateway, putActive } = await import('./fake-provider.js');
  t.mock.method(globalThis, 'fetch', () => assert.fail('agreement must stay offline'));
  const root = fs.mkdtempSync(join(fs.realpathSync(tmpdir()), 'wiser-agreement-gmail-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = join(root, 'gateway');
  const config = join(root, 'config');
  fs.mkdirSync(home);
  fs.mkdirSync(config);
  const envPath = join(config, 'invented-config');
  fs.writeFileSync(envPath, '');
  const connector = await loadConnector(fileURLToPath(new URL('../../connectors/google', import.meta.url)));
  const f = await createTestGateway({ home, session: false, envPath, connectors: [connector],
    ...(armed ? { inputFileAccess: { enabled: true, envPath, secretFiles: {} } } : {}) });
  await putActive(f.store, f.fake, { service: 'google', module: 'gmail' });
  const calls = [];
  const message = { id: 'message-example', threadId: 'thread-example_1', labelIds: ['SENT'] };
  const draft = { id: 'r-example-17', message };
  f.fake.auth.proxy = async (request) => {
    calls.push(request);
    return { status: 200, data: request.endpoint.endsWith('/drafts') ? draft : message };
  };
  f.fake.catalog.execute = () => assert.fail('Gmail must use its declared proxy route');
  return { ...f, root, calls, message, draft, actions: connector.manifest.modules.gmail.actions,
    write(name, data) { const path = join(root, name); fs.writeFileSync(path, data); return path; } };
}

const GMAIL_BASE = { to: ['casey@example.test'], subject: 'Project Cedar', body: 'Invented body' };

async function acceptGmailFiles(f, action, paths, expected) {
  const input = { ...GMAIL_BASE, attachments: paths };
  assert.equal(schemaViolation(f.actions[action].input, input), null);
  const before = f.calls.length;
  const args = { action: `google.gmail.${action}`, input };
  const stop = await f.gw.execute(args);
  assert.equal(stop.status, 'needs_confirmation');
  assert.equal(f.calls.length, before);
  assert.deepEqual(stop.attachment_files.map((entry) => entry.size), expected.map((bytes) => bytes.length));
  const answer = await f.gw.execute({ ...args, confirm: true });
  assert.deepEqual(answer, action === 'create_draft' ? f.draft : f.message);
  assert.equal(f.calls.length, before + 1);
  const request = f.calls.at(-1);
  assert.equal(request.endpoint, `https://gmail.googleapis.com/gmail/v1/users/me/${action === 'create_draft' ? 'drafts' : 'messages/send'}`);
  const raw = action === 'create_draft' ? request.body.message.raw : request.body.raw;
  const wire = Buffer.from(raw, 'base64url').toString('utf8');
  const boundary = wire.match(/Content-Type: multipart\/mixed;\s+boundary=([^\r\n ]+)/)?.[1];
  assert.ok(boundary);
  const attachments = wire.split(`--${boundary}`).slice(1, -1).filter((part) => part.includes('Content-Disposition: attachment;'));
  assert.equal(attachments.length, expected.length);
  for (let i = 0; i < attachments.length; i += 1) {
    const at = attachments[i].indexOf('\r\n\r\n');
    assert.ok(at > 0);
    assert.deepEqual(Buffer.from(attachments[i].slice(at + 4).replace(/\s/g, ''), 'base64'), expected[i]);
    assert.equal(wire.includes(paths[i]), false, 'local path never enters MIME');
  }
}

for (const action of ['create_draft', 'send_message']) {
  test(`F19 gmail.${action} physical files accept 1/10 items and refuse 0/11`, async (t) => {
    const f = await gmailFiles(t);
    const bytes = [Buffer.from('invented PDF bytes'), Buffer.from([0, 255, 19, 128]), Buffer.alloc(0)];
    const paths = bytes.map((data, index) => f.write(`part-${index}.pdf`, data));
    await acceptGmailFiles(f, action, [paths[0]], [bytes[0]]);
    const ten = Array.from({ length: 10 }, (_, index) => index % bytes.length);
    await acceptGmailFiles(f, action, ten.map((index) => paths[index]), ten.map((index) => bytes[index]));
    for (const attachments of [[], Array(11).fill(paths[0])]) {
      const before = f.calls.length;
      const input = { ...GMAIL_BASE, attachments };
      assert.equal(schemaViolation(f.actions[action].input, input), `${attachments.length ? 'maxItems' : 'minItems'}:attachments`);
      const refused = await f.gw.execute({ action: `google.gmail.${action}`, input });
      assert.equal(refused.status, 'invalid_arguments');
      assert.equal(refused.field, 'attachments');
      assert.equal(f.calls.length, before);
    }
  });

  test(`F19 gmail.${action} real preparation enforces its aggregate byte capability`, async (t) => {
    const f = await gmailFiles(t);
    const cap = f.actions[action].input_files.max_bytes;
    assert.equal(cap, 2097152);
    const exact = Buffer.alloc(cap, 29);
    const full = f.write('exact.bin', exact);
    const extra = f.write('one.bin', Buffer.from([17]));
    const over = f.write('over.bin', Buffer.alloc(cap + 1, 31));
    await acceptGmailFiles(f, action, [full], [exact]);
    for (const attachments of [[over], [full, extra], [full, full]]) {
      const before = f.calls.length;
      const input = { ...GMAIL_BASE, attachments };
      assert.equal(schemaViolation(f.actions[action].input, input), null, 'file state is separate from schema validity');
      const refused = await f.gw.execute({ action: `google.gmail.${action}`, input });
      assert.equal(refused.status, 'invalid_arguments');
      assert.equal(refused.field, 'attachments');
      assert.equal(refused.reason, 'input_file_too_large');
      assert.equal(f.calls.length, before);
    }
  });

  test(`F19 gmail.${action} independently checks attachment item lengths 1/4096 and malformed items`, async (t) => {
    const f = await gmailFiles(t);
    const { basename, dirname } = await import('node:path');
    const path = f.write('face-\u{1f642}.txt', Buffer.from('invented Unicode file'));
    // Redundant separators retain the same physical file while exercising the
    // published spelling length without relying on the OS's canonical path limit.
    const padding = 4096 - [...path].length;
    assert.ok(padding > 0);
    const long = `${dirname(path)}/${'/'.repeat(padding)}${basename(path)}`;
    assert.equal([...long].length, 4096);
    assert.equal(long.length, 4097, 'astral filename exercises code-point counting');
    await acceptGmailFiles(f, action, [long], [Buffer.from('invented Unicode file')]);
    // '/' is the only one-code-point POSIX absolute path: its schema is valid,
    // but real preparation must refuse it because a directory is not a file.
    assert.equal(schemaViolation(f.actions[action].input, { ...GMAIL_BASE, attachments: ['/'] }), null);
    const cases = [
      ['/', null], ['', 'items.pattern:attachments'], [`${long}/`, 'items.maxLength:attachments'],
      [5, 'items.type:attachments'], ['relative.txt', 'items.pattern:attachments'],
      [`${path}\u0000`, 'items.pattern:attachments'], [`${path}\ud800`, null],
    ];
    for (const [item, violation] of cases) {
      const before = f.calls.length;
      const input = { ...GMAIL_BASE, attachments: [item] };
      assert.equal(schemaViolation(f.actions[action].input, input), violation);
      const refused = await f.gw.execute({ action: `google.gmail.${action}`, input });
      assert.equal(refused.status, 'invalid_arguments');
      assert.equal(refused.field, 'attachments');
      assert.equal(f.calls.length, before);
    }
    // Isolate minLength from the absolute-path pattern using a checker fixture.
    const lengthOnly = structuredClone(f.actions[action].input);
    delete lengthOnly.properties.attachments.items.pattern;
    assert.equal(schemaViolation(lengthOnly, { ...GMAIL_BASE, attachments: [''] }), 'items.minLength:attachments');
  });

  test(`F19 gmail.${action} physical file access is a separate local capability`, async (t) => {
    const f = await gmailFiles(t, false);
    const path = f.write('invented.txt', Buffer.from('invented bytes'));
    const args = { action: `google.gmail.${action}`, input: GMAIL_BASE };
    assert.equal((await f.gw.execute(args)).status, 'needs_confirmation');
    assert.deepEqual(await f.gw.execute({ ...args, confirm: true }), action === 'create_draft' ? f.draft : f.message);
    const before = f.calls.length;
    assert.equal((await f.gw.execute({ ...args, input: { ...GMAIL_BASE, attachments: [path] } })).status, 'local_only');
    assert.equal(f.calls.length, before);
  });
}
