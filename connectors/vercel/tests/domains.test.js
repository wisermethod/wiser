import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { modules } from '../index.js';

const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));

function recording(responder) {
  const calls = [];
  const ctx = {
    async proxy(req) {
      calls.push(req);
      return responder(req, calls.length);
    },
  };
  return { calls, ctx };
}

function refused(result, field) {
  assert.equal(result.status, 'invalid_arguments');
  assert.equal(result.field, field);
}

test('manifest declares project domain actions', () => {
  const list = manifest.modules.projects.actions.list_domains;
  const remove = manifest.modules.projects.actions.remove_domain;
  assert.equal(list.risk, 'low');
  assert.equal(list.confirmation, 'none');
  assert.equal(list.execution.prefer, 'proxy');
  assert.equal(remove.risk, 'destructive');
  assert.equal(remove.confirmation, 'always');
  assert.equal(remove.execution.prefer, 'proxy');
  assert.equal(list.input.additionalProperties, false);
  assert.equal(remove.input.additionalProperties, false);
  assert.equal(list.input.properties.id_or_name.pattern, '^[A-Za-z0-9_-][A-Za-z0-9._-]{0,99}$');
  assert.equal(remove.input.properties.id_or_name.pattern, '^[A-Za-z0-9_-][A-Za-z0-9._-]{0,99}$');
});

test('list_domains and remove_domain proxy to the project domain routes', async () => {
  const listed = recording(async () => ({ data: { domains: [{ name: 'www.example.com' }] } }));
  const domains = await modules.projects.list_domains({ id_or_name: 'effectivesc', team_id: 'team-1' }, listed.ctx);
  assert.deepEqual(domains, { domains: [{ name: 'www.example.com' }] });
  assert.equal(listed.calls[0].method, 'GET');
  assert.equal(listed.calls[0].endpoint, '/v9/projects/effectivesc/domains?teamId=team-1');
  assert.equal(Object.hasOwn(listed.calls[0], 'body'), false);

  const bare = recording(async () => ({ data: { domains: [] } }));
  await modules.projects.list_domains({ id_or_name: 'effectivesc' }, bare.ctx);
  assert.equal(bare.calls[0].endpoint, '/v9/projects/effectivesc/domains');

  const dotted = recording(async (req) => {
    assert.equal(req.endpoint, '/v9/projects/my.project/domains');
    return { data: { domains: [] } };
  });
  await modules.projects.list_domains({ id_or_name: 'my.project' }, dotted.ctx);

  const removed = recording(async () => ({ data: { name: 'www.example.com' } }));
  const gone = await modules.projects.remove_domain({
    id_or_name: 'effectivesc',
    domain: 'www.example.com',
    team_id: 'team-1',
  }, removed.ctx);
  assert.deepEqual(gone, { name: 'www.example.com' });
  assert.equal(removed.calls[0].method, 'DELETE');
  assert.equal(removed.calls[0].endpoint, '/v9/projects/effectivesc/domains/www.example.com?teamId=team-1');
  assert.equal(Object.hasOwn(removed.calls[0], 'body'), false);

  const { calls, ctx } = recording(async () => { throw new Error('called'); });
  refused(await modules.projects.list_domains({ id_or_name: 'has space' }, ctx), 'id_or_name');
  refused(await modules.projects.list_domains({ id_or_name: 'a/b' }, ctx), 'id_or_name');
  refused(await modules.projects.list_domains({ id_or_name: '' }, ctx), 'id_or_name');
  refused(await modules.projects.list_domains({ id_or_name: 'a'.repeat(101) }, ctx), 'id_or_name');
  refused(await modules.projects.list_domains({ id_or_name: '.' }, ctx), 'id_or_name');
  refused(await modules.projects.list_domains({ id_or_name: '..' }, ctx), 'id_or_name');
  refused(await modules.projects.list_domains({ id_or_name: '.hidden' }, ctx), 'id_or_name');
  refused(await modules.projects.remove_domain({ id_or_name: '.', domain: 'www.example.com' }, ctx), 'id_or_name');
  refused(await modules.projects.remove_domain({ id_or_name: '..', domain: 'www.example.com' }, ctx), 'id_or_name');
  refused(await modules.projects.remove_domain({ id_or_name: '.hidden', domain: 'www.example.com' }, ctx), 'id_or_name');
  refused(await modules.projects.list_domains({ id_or_name: 'effectivesc', team_id: 12 }, ctx), 'team_id');
  refused(await modules.projects.remove_domain({ id_or_name: 'effectivesc', domain: 'localhost' }, ctx), 'domain');
  refused(await modules.projects.remove_domain({ id_or_name: 'effectivesc', domain: '..' }, ctx), 'domain');
  assert.equal(calls.length, 0);
});
