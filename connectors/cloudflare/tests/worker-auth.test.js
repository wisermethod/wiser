import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const row = readFileSync(new URL('../auth.md', import.meta.url), 'utf8').split('\n')
  .find((line) => line.startsWith('| `workers` |'));
test('workers auth row names the permission for every action and cites bookmark Read', () => {
  const groups = [
    ['Account / Workers Scripts / Read', ['workers_subdomain', 'get_worker', 'list_versions']],
    ['Account / Workers Scripts / Edit', ['deploy_worker_release', 'delete_worker', 'set_vars', 'add_custom_domain', 'remove_custom_domain', 'set_workers_dev', 'rollback']],
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
});
