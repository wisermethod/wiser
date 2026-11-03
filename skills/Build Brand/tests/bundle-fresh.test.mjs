import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// The Form card carries a generated copy of the parts library and board styles.
// A change here or in Contact Sheet leaves it stale until bundle-boards.mjs runs.
const bundler=fileURLToPath(new URL('../../../tools/Form/scripts/bundle-boards.mjs',import.meta.url));

test('the Form card bundle matches the library and board styles it is generated from',()=>{
  const r=spawnSync(process.execPath,[bundler,'--check'],{encoding:'utf8'});
  assert.equal(r.status,0,`run node tools/Form/scripts/bundle-boards.mjs to regenerate engine/boards-lib.js\n${r.stdout}${r.stderr}`);
});
