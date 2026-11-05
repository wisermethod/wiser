import {selectionForAssembly} from '../scripts/select.mjs';
import '../../../tools/lib/tests/isolated-home.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {select} from '../scripts/select.mjs';
import {assemble as assembleRaw,LIBRARY} from '../scripts/assemble.mjs';
import {boardOperator as operator,boardHarbor as harbor, looksAnswers} from './select-fixtures.mjs';
import {boardRefusal} from '../scripts/refusals.mjs';
import {board,selection} from './selections.mjs';
const assemble=(selection,library,...rest)=>assembleRaw(selectionForAssembly(selection),library,...rest);
const library=JSON.parse(readFileSync(LIBRARY));

for(const [name,ground,accent,pairing] of [
  ['cream, high-contrast serif and terracotta','#F4F1EA','#C65D3B','elegant-serif'],
  ['near-black and acid green','#171B18','#BCF427','friendly-rounded'],
  ['near-black and vermilion','#201B1A','#EE4828','friendly-rounded']
]) test(`selector refuses ${name} before checks, including fixed roles`,()=>{
  const a={...operator(),kept:{pairing,palette:{overrides:Object.fromEntries(['light','dark'].map(m=>[m,{ground,pop:accent,mark:accent}]))}}};
  const cluster=pairing==='elegant-serif'?'cream-serif-terracotta':'near-black-single-acid-or-vermilion';
  for(const command of ['looks','round1']) for(const check of [false,true]) assert.throws(()=>select(command,command==='looks'?looksAnswers(a):a,{check}),new RegExp(`rule refusal.*refused cluster ${cluster}`));
  // Removing only the dated refusal data restores these same candidates.
  const allowed=select('round1',a,{library:{...library,refusedClusters:[]}});
  assert.equal(allowed.selection.boards.length,12);
});

test('all selected roles avoid handwriting, including donors and variations',()=>{
  const handwritten=new Set(['Shantell Sans',...library.pairings.flatMap(p=>p.handwriting.map(f=>f.family))]);
  const a=operator();
  const round=select('round1',a);
  const pages=[select('looks',looksAnswers(a)),round,select('variations',{...a,picks:round.selection.boards.slice(0,3),shown:round.selection.boards})];
  for(const page of pages) for(const b of assemble(page.selection,library).boards) for(const role of ['heading','body']) assert.ok(!handwritten.has(b.type[role].family),`${role}: ${b.type[role].family}`);
  for(const role of ['headingFrom','bodyFrom']) {
    const changed=structuredClone(library);changed.pairings.find(p=>p.id==='industrial').type[role==='headingFrom'?'heading':'body']=structuredClone(library.pairings[0].handwriting[0]);
    assert.throws(()=>select('round1',{...a,kept:{[role]:'industrial'}},{library:changed}),new RegExp(`rule refusal.*handwriting .* cannot set ${role==='headingFrom'?'heading':'body'}`));
  }
});

test('tangerine and sky with an ordinary pairing remains available outside the near-black cluster',()=>{
  assert.equal(library.pairings.find(p=>p.id==='friendly-rounded').displayStyle,undefined);
  assert.equal(boardRefusal(library,board(library)),null);
});

test('every library palette is audited against each cluster in both modes and every selectable pairing',()=>{
  assert.equal(library.palettes.length,30);
  const hits={};
  for(const cluster of library.refusedClusters) {
    hits[cluster.id]=[];
    for(const palette of library.palettes) for(const pairing of library.pairings.filter(p=>p.selectable!==false)) for(const mode of ['light','dark']) {
      const b={palette:{id:palette.id,overrides:{[mode==='light'?'dark':'light']:{ground:'#808080'}}},pairing:{id:pairing.id}};
      const reason=boardRefusal({...library,refusedClusters:[cluster]},b);
      if(reason) {
        assert.equal(reason,`refused cluster ${cluster.id} (${mode})`);
        hits[cluster.id].push(`${palette.id}/${pairing.id}/${mode}`);
      }
    }
  }
  assert.deepEqual(hits,{
    'cream-serif-terracotta':[],
    'near-black-single-acid-or-vermilion':[]
  });
});

test('a short unshown looks page names the rule that removed its twelfth palette',()=>{
  const a=operator(),first=select('looks',looksAnswers(a),{library:{...library,refusedClusters:[]}});
  const ids=new Set(first.selection.boards.map(b=>b.palette.id));
  const limited=structuredClone(library);
  limited.palettes=limited.palettes.filter(p=>ids.has(p.id));
  limited.palettes[0].dark={...limited.palettes[0].dark,ground:'#201B1A',pop:'#EE4828',mark:'#EE4828'};
  for(const shown of [[],first.looks.slice(0,1)]) {
    assert.equal(select('looks',looksAnswers({...a,shown}),{library:{...limited,refusedClusters:[]}}).looks.length,12);
    assert.throws(()=>select('looks',looksAnswers({...a,shown}),{library:limited}),/rule refusal.*near-black-single-acid-or-vermilion/);
  }
});

test('rule refusals are routed separately from both history exhaustion messages',()=>{
  const path=readFileSync(new URL('../paths/sitting.md',import.meta.url),'utf8');
  assert.match(path,/rule refusal[^\n]*cluster[^\n]*handwriting[^\n]*every-look[^\n]*every-direction/);
});

test('look labels name the actual lettering, colours and shapes without altering their cards',()=>{
  const r=select('looks',looksAnswers(operator()));
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
  const a=harbor(),looks=select('looks',looksAnswers(a),{check:true});
  const round=select('round1',{...a,looks:looks.looks.slice(0,3).map(l=>l.value),looksShown:looks.looks},{check:true});
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
  const b=board(library,{pairing:'elegant-serif'});
  b.palette.overrides={light:{ground:'#F4F1EA',pop:'#C65D3B',mark:'#C65D3B'},dark:{ground:'#507060'}}; // Isolate the light cream cluster from the dark specimen.
  assert.match(boardRefusal(library,b),/cream-serif-terracotta/);
  b.pairing.id='heritage-slab';assert.equal(boardRefusal(library,b),null);
  b.palette.overrides={dark:{ground:'#171B18',pop:'#BCF427',mark:'#EE4828'}};
  assert.equal(boardRefusal(library,b),null,'two different accent hues are not a single-accent cluster');
  b.palette.overrides.dark.mark='#BCF427';assert.match(boardRefusal(library,b),/near-black-single-acid-or-vermilion/);
  b.palette.overrides.dark.ground='#507060';assert.equal(boardRefusal(library,b),null);
});
