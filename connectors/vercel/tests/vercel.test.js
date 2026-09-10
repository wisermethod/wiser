import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestGateway, putActive } from '../../../gateway/test/fake-provider.js';

test('deployment creation requires confirmation on every call and runs only on the fake', async () => {
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'vercel', module: 'deployments', privilege: 'write' });
  const call = { action: 'vercel.deployments.create', input: { name: 'example-site', files: [] } };
  assert.equal((await gw.execute(call)).status, 'needs_confirmation');
  assert.equal((await gw.execute({ ...call, confirm: true })).id, 'deployment-example');
  assert.equal((await gw.execute(call)).status, 'needs_confirmation');
  const deployments = await gw.execute({ action: 'vercel.deployments.list', input: {} });
  assert.equal(deployments.deployments[0].uid, 'deployment-example');
  assert.equal((await gw.execute({ action: 'vercel.projects.list', input: {} })).status, 'needs_connect');
});

test('project reads use their own catalog grant', async () => {
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'vercel', module: 'projects', privilege: 'write' });
  assert.equal((await gw.execute({ action: 'vercel.projects.list', input: {} })).projects[0].id, 'project-example');
  assert.equal((await gw.execute({ action: 'vercel.projects.get', input: { id_or_name: 'project-example' } })).id, 'project-example');
});

test('Vercel maps project and deployment inputs to documented field names', async () => {
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'vercel', module: 'projects', privilege: 'write' });
  await putActive(store, fake, { service: 'vercel', module: 'deployments', privilege: 'write' });
  for (const [action, input, expected] of [
    ['vercel.projects.get', { id_or_name: 'project-example', team_id: 'team-example' }, { idOrName: 'project-example', teamId: 'team-example' }],
    ['vercel.deployments.create', { name: 'example', git_source: { type: 'github', ref: 'main' } }, { name: 'example', gitSource: { type: 'github', ref: 'main' } }],
  ]) {
    fake.catalog.setResult(fake.catalog.toSlug(action), (args) => { assert.deepEqual(args, expected); return { checked: true }; });
    assert.equal((await gw.execute({ action, input, confirm: true })).checked, true);
  }
});
