import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const row = readFileSync(new URL('../auth.md', import.meta.url), 'utf8').split('\n')
  .find((line) => line.startsWith('| `workers` |'));
test('workers auth row names the permission for every action and cites bookmark Read', () => {
  const groups = [
    ['Content Read-Only for', ['workers_subdomain', 'get_worker', 'list_versions']],
    ['Admin for', ['deploy_worker_release', 'delete_worker', 'set_vars', 'add_custom_domain', 'remove_custom_domain', 'set_workers_dev', 'rollback']],
    ['Account / D1 / Edit', ['d1_migrate', 'd1_adopt', 'd1_restore']],
    ['Account / D1 / Read', ['d1_bookmark']],
  ];
  for (const [permission, actions] of groups) {
    const start = row.indexOf(permission);
    assert.ok(start >= 0, `missing permission: ${permission}`);
    const clause = row.slice(start).split(';')[0];
    for (const action of actions) assert.ok(clause.includes('`' + action + '`'), `${permission} must name ${action}`);
  }
  assert.match(row, /https:\/\/developers\.cloudflare\.com\/api\/resources\/d1\/subresources\/database\/subresources\/time_travel\/methods\/get_bookmark\//);
  assert.ok(!row.includes('does not execute migrations or create a database'));
  // The new Workers roles, with the legacy rows they replace still named.
  assert.ok(row.includes('Workers product scope') && row.includes('Account / Workers Scripts / Read and Edit'));
  assert.match(row, /https:\/\/developers\.cloudflare\.com\/workers\/authorization\/workers\//);
});

test('fix2 access auth row covers app read, three writes and organization read without service-token writes', () => {
  const guide = readFileSync(new URL('../auth.md', import.meta.url), 'utf8');
  const access = guide.split('\n').find((line) => line.startsWith('| `access` |'));
  assert.ok(access, 'access permission row must exist');
  assert.match(access, /`get_app` needs Account \/ Access: Apps and Policies \/ Read or Write/);
  for (const action of ['create_app', 'create_policy', 'set_staff']) assert.ok(access.includes('`' + action + '`'));
  assert.match(access, /`create_app`, `create_policy` and `set_staff` need Account \/ Access: Apps and Policies \/ Write/);
  assert.match(access, /Account \/ Access: Organizations, Identity Providers, and Groups \/ Read/);
  // The explicit exclusion is allowed; no affirmative permission clause may request it.
  assert.match(access, /No Service Tokens Write permission is needed/);
  assert.doesNotMatch(access.replace('No Service Tokens Write permission is needed', ''), /Service Tokens.*(?:Write|Edit)/i);
});
test('fix2 auth one-token paragraph names six modules including Access', () => {
  const guide = readFileSync(new URL('../auth.md', import.meta.url), 'utf8');
  const paragraph = guide.split('\n').find((line) => line.startsWith('**One token, pasted once'));
  assert.match(paragraph, /all six modules/); assert.match(paragraph, /other five/); assert.match(paragraph, /Access/);
});
test('fix2 auth gateway step names six modules including Access', () => {
  const guide = readFileSync(new URL('../auth.md', import.meta.url), 'utf8');
  const step = guide.split('## Through the gateway')[1].split('\n').find((line) => line.startsWith('1.'));
  assert.match(step, /six modules/); assert.match(step, /Connect Cloudflare Access/);
});
