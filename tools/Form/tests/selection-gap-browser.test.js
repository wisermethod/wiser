import '../../lib/tests/isolated-home.js';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {browserKit,onlyFonts} from './boards-harness.js';
import {lookForm,lookActions} from './board-fixtures.js';
import {select} from '../../../skills/Build Brand/scripts/select.mjs';
import {operator} from '../../../skills/Build Brand/tests/select-fixtures.mjs';
import {balancedGapLibrary,gapFamily} from '../../../skills/Build Brand/tests/selection-gap-fixture.mjs';
import {checkForm} from '../scripts/format.js';

let kit;before(async()=>{kit=await browserKit();});after(async()=>{await kit?.browser.close();});
for(const view of ['look','board'])for(const width of [390,734])test(`balanced-only refusal ${view} ${width}: both strength buttons reach every listed step`,async()=>{
 const a={...operator(),mode:'light'},result=select(view==='look'?'looks':'round1',view==='look'?a:{...a,looksShown:[]},{library:balancedGapLibrary(),check:true});
 const form=view==='look'?lookForm(a,result):result.form;
 if(view==='look'){form.questions[0].controls=result.controls;form.actions=lookActions();}
 assert.deepEqual(checkForm(form),{ok:true,problems:[]});
 const q=form.questions[0],affected=q.options.filter(o=>o.board.palette.id.startsWith(gapFamily+'-'));
 assert.equal(affected.length,2);
 const h=await kit.open(form,width,'light');
 try {
  const reached=q.options.map(()=>new Set());
  const record=async()=>{
   const values=await h.f.locator('.tile-input').evaluateAll(ns=>ns.map(n=>n.value));
   values.forEach((value,i)=>{assert.ok(q.options[i].steps.some(s=>s.value===value));reached[i].add(value);});
  };
  await record();
  for(const direction of ['More muted','More bold','More muted']) {
   const button=h.f.getByRole('button',{name:direction,exact:true});let presses=0;
   while(!await button.isDisabled()) {
    assert.ok(presses++<2,'a three-position family reaches its end in at most two presses');
    await button.click();await record();
   }
   assert.ok(presses>0,'each direction is actually pressed');
  }
  for(const [i,o] of q.options.entries())assert.deepEqual(reached[i],new Set(o.steps.map(s=>s.value)),'every listed step is reachable with the page buttons');
  for(const o of affected)assert.deepEqual(o.steps.map(s=>s.value),[o.value],'no unreachable far step survives the gap');
  assert.ok(onlyFonts(h.requests));assert.deepEqual(h.errors,[]);
 } finally {await h.context.close();}
});
