import '../../../tools/lib/tests/isolated-home.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {select} from '../scripts/select.mjs';
import {AXES,LIBRARY,partPositions} from '../scripts/assemble.mjs';
import {checkForm} from '../../../tools/Form/scripts/format.js';
import {operator,harbor} from './select-fixtures.mjs';
import {balancedGapLibrary,gapFamily} from './selection-gap-fixture.mjs';

const copy=structuredClone;
const library=JSON.parse(readFileSync(LIBRARY));
const triple=b=>[b.pairing.id,b.palette.id,b.graphicSet.id].join('/');
const levels=['muted','balanced','bold'];
for(const mode of ['light','dark'])test(`sibling look pick ${mode}: own card stays passed over and boost follows the step`,()=>{
 const a=harbor(),looks=select('looks',a);
 const option=looks.options.find(o=>o.board.palette.id==='hot-pink-muted'&&o.board.pairing.id==='hand-made');
 assert.ok(option);
 const step=option.steps.find(s=>s.palette.id==='hot-pink-balanced');assert.ok(step);
 const input={...a,mode,looks:[step.value],looksShown:looks.options},before=copy(input);
 const round=select('round1',input,{check:true}),own=triple(option.board);
 for(const b of round.selection.boards.filter(b=>b.group==='close'))assert.notEqual(triple(b),own,'passed-over own triple cannot return in Close');
 for(const b of round.selection.boards.filter(b=>b.recommendation))assert.notEqual(triple(b),own,'passed-over own triple cannot be recommended');
 const tags=partPositions(library,{...option.board,palette:step.palette});
 for(const [axis,[neg,pos]] of Object.entries(AXES)) {
  const n=Object.values(tags).reduce((n,t)=>n+(t[axis]===pos?1:t[axis]===neg?-1:0),0);
  assert.equal(round.wholeLookBoosts[axis],Math.sign(n));
 }
 assert.deepEqual(input,before);
 assert.deepEqual(checkForm(round.form),{ok:true,problems:[]});
});

for(const command of ['looks','round1'])test(`${command}: balanced-only refusal keeps the unbroken run containing the own step`,()=>{
 const a=command==='looks'?operator():{...operator(),looksShown:[]};
 const before=select(command,a,{check:true}),result=select(command,a,{library:balancedGapLibrary(),check:true});
 const options=command==='looks'?result.options:result.form.questions[0].options;
 const original=command==='looks'?before.options:before.form.questions[0].options;
 const affected=options.filter(o=>o.board.palette.id.startsWith(gapFamily+'-'));
 const controls=original.filter(o=>o.board.palette.id.startsWith(gapFamily+'-'));
 assert.ok(controls.length>0&&controls.every(o=>o.steps.length===3),'control family has all three passing steps before the planted refusal');
 assert.deepEqual(new Set(affected.map(o=>o.board.palette.id)),new Set([`${gapFamily}-muted`,`${gapFamily}-bold`]),'both passing endpoints still have their cards');
 for(const o of affected) {
  assert.deepEqual(o.steps.map(s=>s.value),[o.value],'the far endpoint must be dropped across the missing balanced step');
 }
 for(const o of options) {
  assert.ok(o.steps.some(s=>s.value===o.value));
  assert.ok(o.steps.every(s=>s.palette.id!==`${gapFamily}-balanced`));
  const positions=o.steps.map(s=>levels.indexOf(s.palette.id.split('-').at(-1)));
  assert.ok(positions.every((p,i)=>i===0||p===positions[i-1]+1),'every listed step is adjacent');
 }
 if(command==='round1')assert.deepEqual(checkForm(result.form),{ok:true,problems:[]});
});

// Normalize only the documented retry exceptions, including those on each
// complete step. Everything else, including values and full palettes, is bytes.
function retainedBytes(board) {
 const b=copy(board),close=b.group==='close';
 for(const record of [b,...b.steps]) {
  delete record.primaryMode;delete record.name;
  if(close)delete record.recommendation;
 }
 return JSON.stringify(b);
}
for(const command of ['round1','variations'])test(`${command}: flipped-mode displayed retry replaces one slot and preserves all other bytes`,()=>{
 const a={...operator(),looksShown:[],mode:'dark'},seed=select('round1',a,{check:true});
 const input=command==='round1'?a:{...a,picks:[seed.selection.boards[0].steps[0]],shown:seed.selection.boards};
 const displayed=select(command,input,{check:true}),blocked=displayed.selection.boards[0];
 const answers={...input,mode:'light',pageDisplayed:true,displayedBoards:displayed.selection.boards,avoid:[blocked]},before=copy(answers);
 const resumed=select(command,answers,{check:true});
 assert.deepEqual(answers,before,'saved inputs and histories stay unchanged');
 assert.deepEqual(checkForm(resumed.form),{ok:true,problems:[]});
 assert.deepEqual(resumed.replacements.filter(r=>r.reason==='Blocked by Review').map(r=>r.slot),[blocked.number]);
 assert.deepEqual(resumed.form.questions[0].controls,{mode:'light',strength:true});
 for(const [i,b] of resumed.selection.boards.entries()) {
  const old=displayed.selection.boards[i];
  assert.equal(b.primaryMode,'light');assert.ok(b.name.endsWith(' / light'));
  assert.ok(b.steps.every(s=>s.primaryMode==='light'&&s.name.endsWith(' / light')));
  if(b.number===blocked.number)assert.notEqual(b.value,old.value,'avoided slot gets a replacement in the new mode');
  else {
   assert.equal(b.value,old.value);assert.deepEqual(b.palette,old.palette);
   assert.equal(retainedBytes(b),retainedBytes(old),'unblocked records retain every non-exempt byte');
  }
 }
});
