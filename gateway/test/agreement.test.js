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

import { collectDivergences } from './agreement-harness.js';

const BASELINE = JSON.parse(readFileSync(new URL('./agreement-baseline.json', import.meta.url), 'utf8'));

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

test('HeyGen schema-valid physical audio fixture exercises all nine part 1 actions at the gateway', async (t) => {
  const { setup, run, scene, noPrivate } = await import('../../connectors/heygen/tests/fixtures.js');
  const f = await setup(t);
  const cases = [ ['speech.synthesize', scene()], ['voices.list', {}], ['voices.get', { voice_id: 'voice_fake-1' }],
    ['voices.add', { name: 'Invented clone', path: f.file, idempotency_key: 'invented-key-123' }],
    ['voices.delete', { voice_id: 'voice_fake-1' }], ['avatars.list', {}], ['avatars.list_looks', {}], ['account.wallet', {}], ['account.permissions', {}] ];
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
