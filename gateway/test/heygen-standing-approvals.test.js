import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setup, videoInput } from '../../connectors/heygen/tests/fixtures.js';

const NOW = Date.parse('2026-10-28T12:00:00.000Z');
const DAY = 86400000;
const ACTION = 'heygen.videos.create';
const SCOPE = { module: 'heygen.videos', root: 'narration-project', playbook: 'avatar-production' };
const SUMMARY = 'create HeyGen avatar video charged to your HeyGen API wallet';
const CAUTION = "Each covered call spends wallet dollars with no stop per call. Avatar IV rates read 2026-10-28: $0.0805 a second for a custom video or studio avatar; $0.0385 for a photo avatar. The wallet's own balance is the only ceiling HeyGen applies.";
const WARNING = `This standing approval lets your assistant ${SUMMARY} on your connection with no label without asking you first, for work done from the root "narration-project", in the Playbook "avatar-production". For 7 days, until 2026-11-04, every call that matches runs straight away, with no approval step for you to see or refuse. Anything outside it still asks you, as today. ${CAUTION} Some of these actions spend money. Under this approval nobody looks at each one before it happens, and once done it cannot be called back. It lasts at most 7 days. You can end it at any time: ask your assistant to revoke it, or remove it on your Wiser account page. Answer yes to grant it, or no to leave things as they are.`;
const tool = (f, args) => f.gw.callTool('standing_approvals', args);

test('HeyGen video proposal renders exact heightened pay warning and seven-day expiry, only create eligible', async (t) => {
  const f = await setup(t, { now: () => NOW });
  const proposal = await tool(f, { ...SCOPE, mode: 'propose' });
  assert.equal(proposal.status, 'standing_approval_proposed'); assert.equal(proposal.warning, WARNING);
  assert.equal(proposal.warning.split(CAUTION).length - 1, 1);
  assert.equal(proposal.heightened, true); assert.deepEqual(proposal.kinds, ['pay']);
  assert.deepEqual(proposal.scope.actions, [ACTION]); assert.equal(proposal.scope.module_wide, true);
  assert.equal(proposal.scope.days, 7); assert.equal(proposal.expires_on, '2026-11-04');
  assert.deepEqual(await f.gw.standingApprovals.list(), []); assert.equal(f.calls.length, 0);
  const c = f.connectors.find((v) => v.id === 'heygen');
  for (const [mod, row] of Object.entries(c.manifest.modules)) for (const [act, definition] of Object.entries(row.actions))
    assert.equal(Boolean(definition.standing_approval), `heygen.${mod}.${act}` === ACTION);
});

test('HeyGen video refuses standing approvals lasting over seven days', async (t) => {
  const f = await setup(t, { now: () => NOW });
  for (const mode of ['propose', 'grant']) assert.deepEqual(await tool(f, { ...SCOPE, mode, days: 8, ...(mode === 'grant' ? { confirmed: true } : {}) }), { status: 'invalid_arguments', field: 'days', reason: 'max' });
  assert.equal(f.gw.pendingConfirmations.size, 0); assert.deepEqual(await f.gw.standingApprovals.list(), []); assert.equal(f.calls.length, 0);
});

test('HeyGen grant runs rooted production calls; no root or different production stops without transport', async (t) => {
  const f = await setup(t, { now: () => NOW });
  assert.equal((await tool(f, { ...SCOPE, mode: 'propose' })).status, 'standing_approval_proposed');
  const answer = await tool(f, { ...SCOPE, mode: 'grant', confirmed: true }); assert.equal(answer.status, 'ok');
  const saved = answer.standing_approval;
  assert.equal(saved.heightened, true); assert.deepEqual(saved.kinds, ['pay']); assert.deepEqual(saved.actions, [ACTION]);
  assert.deepEqual(saved.summaries, [SUMMARY]); assert.deepEqual(saved.cautions, [CAUTION]);
  assert.equal(Date.parse(saved.expires_at) - NOW, 7 * DAY);
  const result = await f.gw.callTool('execute', { action: ACTION, root: SCOPE.root, playbook: SCOPE.playbook, input: videoInput() });
  assert.equal(result.video_id, 'video_fake-1'); assert.equal(result.status, undefined);
  assert.deepEqual(result.standing_approval, { id: saved.id, expires_at: saved.expires_at });
  assert.equal(f.gw.pendingConfirmations.size, 0); assert.equal(f.gw.confirmedOnce.size, 0);
  const count = f.calls.length;
  for (const scope of [{ playbook: SCOPE.playbook }, { root: SCOPE.root, playbook: 'different-production' }]) {
    const stop = await f.gw.callTool('execute', { action: ACTION, ...scope, input: videoInput() });
    assert.equal(stop.status, 'needs_confirmation'); assert.equal(stop.standing_approval, undefined); assert.equal(f.calls.length, count);
  }
  const executes = readFileSync(f.audit.file, 'utf8').trim().split('\n').map(JSON.parse).filter((line) => line.op === 'execute');
  assert.deepEqual(executes.map((line) => line.grant_id), [saved.id, null, null]);
});

test('control: removed standing declaration fails the proposal assertion and ends grant matching', async (t) => {
  const f = await setup(t, { now: () => NOW });
  await tool(f, { ...SCOPE, mode: 'propose' }); await tool(f, { ...SCOPE, mode: 'grant', confirmed: true });
  f.gw.connectors = f.connectors.map((c) => {
    if (c.id !== 'heygen') return c;
    const manifest = structuredClone(c.manifest); delete manifest.modules.videos.actions.create.standing_approval;
    return { ...c, manifest };
  });
  const proposal = await tool(f, { ...SCOPE, mode: 'propose' });
  assert.throws(() => assert.equal(proposal.status, 'standing_approval_proposed'), assert.AssertionError);
  const stopped = await f.gw.callTool('execute', { action: ACTION, root: SCOPE.root, playbook: SCOPE.playbook, input: videoInput() });
  assert.throws(() => assert.equal(stopped.video_id, 'video_fake-1'), assert.AssertionError);
  assert.equal(stopped.status, 'needs_confirmation'); assert.equal(f.calls.length, 0);
});
