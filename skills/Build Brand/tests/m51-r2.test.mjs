import '../../../tools/lib/tests/isolated-home.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {select} from '../scripts/select.mjs';
import {assemble,LIBRARY} from '../scripts/assemble.mjs';
import {operator,harbor} from './select-fixtures.mjs';
import {boardRefusal} from '../scripts/refusals.mjs';
import {board,selection} from './selections.mjs';
const library=JSON.parse(readFileSync(LIBRARY));

for(const [name,ground,accent,pairing] of [
  ['cream, high-contrast serif and terracotta','#F4F1EA','#C65D3B','high-contrast'],
  ['near-black and acid green','#171B18','#BCF427','warm-grotesque'],
  ['near-black and vermilion','#201B1A','#EE4828','warm-grotesque']
]) test(`selector refuses ${name} before checks, including fixed roles`,()=>{
  const a={...operator(),kept:{pairing,palette:{overrides:Object.fromEntries(['light','dark'].map(m=>[m,{ground,pop:accent,mark:accent}]))}}};
  for(const command of ['looks','round1']) assert.throws(()=>select(command,a),/no passing|exhausted|refused/);
  // Removing only the dated refusal data restores these same candidates.
  const allowed=select('round1',a,{library:{...library,refusedClusters:[]}});
  assert.equal(allowed.selection.boards.length,12);
});

test('all selected roles avoid handwriting, including donors and variations',()=>{
  const handwritten=new Set(['Shantell Sans',...library.pairings.flatMap(p=>p.handwriting.map(f=>f.family))]);
  const a=operator();
  const round=select('round1',a);
  const pages=[select('looks',a),round,select('variations',{...a,picks:round.selection.boards.slice(0,3),shown:round.selection.boards})];
  for(const page of pages) for(const b of assemble(page.selection,library).boards) for(const role of ['heading','body']) assert.ok(!handwritten.has(b.type[role].family),`${role}: ${b.type[role].family}`);
  for(const role of ['headingFrom','bodyFrom']) {
    const changed=structuredClone(library);changed.pairings.find(p=>p.id==='condensed').type[role==='headingFrom'?'heading':'body']=structuredClone(library.pairings[0].handwriting[0]);
    assert.throws(()=>select('round1',{...a,kept:{[role]:'condensed'}},{library:changed}),/no passing|exhausted|refused/);
  }
});

test('look labels name the actual lettering, colours and shapes without altering their cards',()=>{
  const r=select('looks',operator());
  for(const [i,option] of r.options.entries()) {
    const b=r.selection.boards[i];
    for(const [kind,id] of [['pairings',b.pairing.id],['palettes',b.palette.id],['graphics',b.graphicSet.id]]) assert.ok(option.label.includes(library[kind].find(p=>p.id===id).name),option.label);
    assert.deepEqual(option.board.pairing,b.pairing);assert.deepEqual(option.board.palette,b.palette);assert.deepEqual(option.board.graphicSet,b.graphicSet);
  }
});

test('simple assembly marks inherited face specimens as samples and preserves source content',()=>{
  const s=selection([board(library)],library),sentence=s.boards[0].content.sentence;
  const b=assemble(s,library).boards[0];
  for(const role of ['heading','body']) assert.match(b.type[role].sample,/^Sample: /);
  assert.equal(b.content.sentence,sentence);
  const path=readFileSync(new URL('../paths/simple.md',import.meta.url),'utf8');
  assert.match(path,/face (?:samples|specimens)[^\n]*Sample:/i);
});


test('run 4 warm/natural taps fill checked looks and Round 1 without a cluster or handwriting primary',()=>{
  const a=harbor(),looks=select('looks',a,{check:true});
  const round=select('round1',{...a,looks:looks.looks.slice(0,3).map(l=>l.value)},{check:true});
  const noteFaces=new Set(library.pairings.flatMap(p=>p.handwriting.map(f=>f.family)));
  for(const page of [looks,round]) {
    assert.equal(page.selection.boards.length,12);assert.ok(page.checks.attempts>=12);
    for(const b of page.selection.boards) assert.equal(boardRefusal(library,b),null);
    for(const b of assemble(page.selection,library).boards) for(const role of ['heading','body']) assert.ok(!noteFaces.has(b.type[role].family));
  }
  assert.ok(round.form);
});

test('cluster rules are dated part values and distinguish a second accent and an ordinary serif',()=>{
  for(const cluster of library.refusedClusters) {
    assert.equal(cluster.source.file,'experts/Creative Director/EXPERT.md');
    assert.equal(cluster.source.recorded,'2026-07-27');assert.equal(cluster.source.expectedToAge,true);
  }
  const b=board(library,{pairing:'high-contrast'});
  b.palette.overrides={dark:{ground:'#507060'}}; // Isolate the light cream cluster from the dark specimen.
  assert.match(boardRefusal(library,b),/cream-serif-terracotta/);
  b.pairing.id='friendly-serif';assert.equal(boardRefusal(library,b),null);
  b.palette.overrides={dark:{ground:'#171B18',pop:'#BCF427',mark:'#EE4828'}};
  assert.equal(boardRefusal(library,b),null,'two different accent hues are not a single-accent cluster');
  b.palette.overrides.dark.mark='#BCF427';assert.match(boardRefusal(library,b),/near-black-single-acid-or-vermilion/);
  b.palette.overrides.dark.ground='#507060';assert.equal(boardRefusal(library,b),null);
});
