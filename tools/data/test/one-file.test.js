import { deliveryTests } from '../../lib/tests/one-file.js';
deliveryTests('data', new URL('../', import.meta.url));

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixture, successful } from '../../lib/build/install-free-fixture.mjs';

test('wrong-version installed csv parser falls back to compiled data', t => {
  const f = fixture(t, 'data');
  const args = ['parse','--file',f.write('input.csv','id,value\n1,10\n2,20\n')];
  const baseline = f.run(args, { compiled: true });
  successful(baseline);
  const pkg = join(f.target, 'node_modules/csv-parse'); mkdirSync(pkg, {recursive:true});
  writeFileSync(join(pkg,'package.json'), JSON.stringify({name:'csv-parse',version:'0.0.1',type:'module',exports:{'./browser/esm/sync':'./sync.js'}}));
  writeFileSync(join(pkg,'sync.js'), 'export function parse() { process.exit(77); }');
  const out = f.run(args);
  const locked = JSON.parse(readFileSync(join(f.target, 'package-lock.json'))).packages['node_modules/csv-parse'].version;
  assert.equal(out.status, 0, out.stderr);
  assert.equal(out.stderr, `Using compiled data: csv-parse installed version 0.0.1 differs from locked version ${locked}.\n`);
  assert.equal(out.stdout, baseline.stdout);
  const answer = JSON.parse(out.stdout);
  assert.equal(answer.rowCount, 2);
});
