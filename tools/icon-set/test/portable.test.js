import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('search runs on raw package catalogs without Node imports or globals', () => {
  const out = spawnSync(process.execPath, ['--experimental-vm-modules', '--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { fileURLToPath } from 'node:url';
    import { readFileSync } from 'node:fs';
    import { portableModule } from ${JSON.stringify(new URL('../../lib/tests/portable-module.js', import.meta.url).href)};
    import { searchCatalog } from ${JSON.stringify(new URL('../scripts/lib/search-core.js', import.meta.url).href)};
    const search = await portableModule(fileURLToPath(${JSON.stringify(new URL('../scripts/lib/search-core.js', import.meta.url).href)}));
    const cases = JSON.parse(readFileSync(new URL(${JSON.stringify(new URL('./fixtures/cases.json', import.meta.url).href)})));
    for (const c of cases) {
      const set = c.set ?? 'phosphor';
      const base = new URL('../node_modules/' + search.SETS[set].package + '/', ${JSON.stringify(new URL('./', import.meta.url).href)});
      const catalog = set === 'health' ? JSON.parse(readFileSync(new URL(search.SETS[set].catalog, base))) : (await import(new URL(search.SETS[set].catalog, base))).icons;
      assert.equal(JSON.stringify(search.searchCatalog(set, catalog, c.query, c.limit)),
        JSON.stringify(searchCatalog(set, catalog, c.query, c.limit)));
    }
    console.log('portable: 9 icon queries');
  `], { encoding: 'utf8', timeout: 10000 });
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /portable: 9 icon queries/);
});
