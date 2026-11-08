import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { searchCatalog, SETS } from '../scripts/lib/search-core.js';
import { mainCli, offlineEnv } from '../../lib/tests/main-cli.js';
import cases from './fixtures/cases.json' with { type: 'json' };
const cli = fileURLToPath(new URL('../scripts/icon-set.js', import.meta.url));
const cleanup = [];
let baseline;
before(() => { baseline = mainCli({ after: fn => cleanup.push(fn) }, 'icon-set'); });
after(() => cleanup.forEach(fn => fn()));
for (const c of cases) test(c.name, async () => {
  const set = c.set ?? 'phosphor';
  const args = ['search', '--query', c.query,
    ...(c.set ? ['--set', c.set] : []), ...(c.limit ? ['--limit', String(c.limit)] : [])];
  const run = script => {
    const { status, stdout, stderr } = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: offlineEnv(), timeout: 10000 });
    return { status, stdout, stderr };
  };
  const old = run(baseline), current = run(cli);
  assert.equal(old.status, 0, old.stderr);
  assert.equal(old.stderr, '');
  assert.deepEqual(current, old, 'CLI byte compatibility with main');
  const base = new URL(`../node_modules/${SETS[set].package}/`, import.meta.url);
  const catalog = set === 'health' ? JSON.parse(readFileSync(new URL(SETS[set].catalog, base)))
    : (await import(new URL(SETS[set].catalog, base))).icons;
  const licence = readFileSync(new URL('LICENSE', base), 'utf8');
  assert.equal(JSON.stringify(searchCatalog(set, catalog, c.query, c.limit, licence)) + '\n', current.stdout);
  assert.equal(JSON.stringify(searchCatalog(set, catalog, c.query, c.limit)) + '\n', current.stdout, 'four-argument pinned-catalog API');
});
