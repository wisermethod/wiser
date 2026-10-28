import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, realpathSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConnector } from '../src/manifest.js';
import { createTestGateway, makeHome, putActive } from './fake-provider.js';

const ELEVENLABS = fileURLToPath(new URL('../../connectors/elevenlabs', import.meta.url));
const NOW = Date.parse('2026-10-27T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const ACTION = 'elevenlabs.speech.synthesize';
const SCOPE = { module: 'elevenlabs.speech', root: 'narration-project' };
const SUMMARY = 'synthesize ElevenLabs narration charged to your own ElevenLabs plan';
const CAUTION = "Each call under this approval spends credits from your ElevenLabs plan, or money if pay-as-you-go or overage is on, without asking each time. The gateway does not know your account's maximum charge.";
const WARNING = `This standing approval lets your assistant ${SUMMARY} on your connection with no label without asking you first, for work done from the root "narration-project". For 7 days, until 2026-11-03, every call that matches runs straight away, with no approval step for you to see or refuse. Anything outside it still asks you, as today. ${CAUTION} Some of these actions spend money. Under this approval nobody looks at each one before it happens, and once done it cannot be called back. It lasts at most 7 days. You can end it at any time: ask your assistant to revoke it, or remove it on your Wiser account page. Answer yes to grant it, or no to leave things as they are.`;
const MP3 = Buffer.from([0x49, 0x44, 0x33, 1, 2, 3]);

async function fixture(t) {
  t.mock.method(globalThis, 'fetch', async () => { assert.fail('offline test attempted network access'); });
  const home = realpathSync(makeHome());
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const f = await createTestGateway({
    home, session: false, now: () => NOW, outputsDir: join(home, 'outputs'),
    connectors: [await loadConnector(ELEVENLABS)],
  });
  await putActive(f.store, f.fake, { service: 'elevenlabs', module: 'speech' });
  f.calls = [];
  // Exercise the shipped connector through a fake authenticated transport.
  f.fake.auth.proxy = async (req) => {
    f.calls.push(req);
    assert.equal(req.endpoint, '/v1/text-to-speech/voice_fake/with-timestamps');
    assert.equal(req.method, 'POST');
    const characters = Array.from(req.body.text);
    return { status: 200, data: {
      audio_base64: MP3.toString('base64'),
      alignment: {
        characters,
        character_start_times_seconds: characters.map((_, i) => i / 10),
        character_end_times_seconds: characters.map((_, i) => (i + 1) / 10),
      },
    } };
  };
  return f;
}

const tool = (f, args) => f.gw.callTool('standing_approvals', args);

test('ElevenLabs speech proposal renders the exact heightened pay warning and seven-day expiry', async (t) => {
  const f = await fixture(t);
  const proposal = await tool(f, { ...SCOPE, mode: 'propose' });
  assert.equal(proposal.status, 'standing_approval_proposed');
  assert.equal(proposal.warning, WARNING);
  assert.equal(proposal.warning.includes(SUMMARY), true);
  assert.equal(proposal.warning.split(CAUTION).length - 1, 1);
  assert.equal(proposal.heightened, true);
  assert.deepEqual(proposal.kinds, ['pay']);
  assert.deepEqual(proposal.scope.actions, [ACTION]);
  assert.equal(proposal.scope.module_wide, true);
  assert.equal(proposal.scope.days, 7);
  assert.equal(proposal.expires_on, '2026-11-03');
  assert.deepEqual(await f.gw.standingApprovals.list(), []);
  assert.equal(f.calls.length, 0);
});

test('ElevenLabs speech refuses an approval lasting more than seven days', async (t) => {
  const f = await fixture(t);
  for (const mode of ['propose', 'grant']) {
    const refused = await tool(f, {
      ...SCOPE, mode, days: 8, ...(mode === 'grant' ? { confirmed: true } : {}),
    });
    assert.deepEqual(refused, { status: 'invalid_arguments', field: 'days', reason: 'max' });
  }
  assert.equal(f.gw.pendingConfirmations.size, 0);
  assert.deepEqual(await f.gw.standingApprovals.list(), []);
  assert.equal(f.calls.length, 0);
});

test('a granted ElevenLabs speech approval runs root-scoped scenes without a stop; no root still stops', async (t) => {
  const f = await fixture(t);
  assert.equal((await tool(f, { ...SCOPE, mode: 'propose' })).status, 'standing_approval_proposed');
  const answer = await tool(f, { ...SCOPE, mode: 'grant', confirmed: true });
  assert.equal(answer.status, 'ok');
  const saved = answer.standing_approval;
  assert.equal(saved.heightened, true);
  assert.deepEqual(saved.kinds, ['pay']);
  assert.deepEqual(saved.summaries, [SUMMARY]);
  assert.deepEqual(saved.cautions, [CAUTION]);
  assert.equal(Date.parse(saved.expires_at) - NOW, 7 * DAY);
  assert.equal(saved.root, SCOPE.root);
  assert.deepEqual(saved.actions, [ACTION]);

  const scenes = ['A short line.', 'a'.repeat(2252), '𐐀'.repeat(5000)];
  for (const text of scenes) {
    const result = await f.gw.callTool('execute', {
      action: ACTION, root: saved.root, input: { text, voice_id: 'voice_fake', model_id: 'eleven_v4' },
    });
    assert.equal(result.status, undefined);
    assert.equal(result.characters, Array.from(text).length);
    assert.deepEqual(result.standing_approval, { id: saved.id, expires_at: saved.expires_at });
    assert.deepEqual(readFileSync(result.file.path), MP3);
    assert.equal(f.gw.pendingConfirmations.size, 0);
    assert.equal(f.gw.confirmedOnce.size, 0);
  }
  assert.equal(f.calls.length, scenes.length);
  const stop = await f.gw.callTool('execute', {
    action: ACTION, input: { text: scenes.at(-1), voice_id: 'voice_fake', model_id: 'eleven_v4' },
  });
  assert.equal(stop.status, 'needs_confirmation');
  assert.equal(Object.hasOwn(stop, 'standing_approval'), false);
  assert.equal(f.calls.length, scenes.length);
  const executes = readFileSync(f.audit.file, 'utf8').trim().split('\n').map(JSON.parse)
    .filter((line) => line.op === 'execute');
  assert.deepEqual(executes.map((line) => line.grant_id), [saved.id, saved.id, saved.id, null]);
});
