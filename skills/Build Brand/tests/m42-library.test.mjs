import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LIBRARY} from '../scripts/assemble.mjs';
import {select} from '../scripts/select.mjs';
import {operator} from './select-fixtures.mjs';
const library=JSON.parse(readFileSync(LIBRARY));
test('looks offer a bold palette with type loudness one',()=>{
  const result=select('looks',operator());
  assert.ok(result.looks.some(look=>
    library.palettes.find(p=>p.id===look.palette).paletteLoudness===3 &&
    library.pairings.find(p=>p.id===look.pairing).tags.typeLoudness===1));
});
test('round one covers every energy in the replaced library without inventing a dark-first recipe',()=>{
  const result=select('round1',{...operator(),looksShown:[]});
  assert.equal(result.selection.boards.length,12);
  assert.deepEqual(new Set(result.selection.boards.map(b=>b.energy)),new Set(library.palettes.map(p=>p.energy)));
  assert.equal(library.palettes.some(p=>p.energy==='dark-first'),false);
  assert.ok(result.selection.boards.some(b=>b.primaryMode==='dark'));
});
