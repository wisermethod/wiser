import '../../lib/tests/isolated-home.js';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {browserKit} from './boards-harness.js';
import {wholeBoardForms} from './whole-board-fixtures.js';
import {measureWholeBoard} from './whole-board-measure.js';
let kit;before(async()=>{kit=await browserKit();});after(async()=>{await kit?.browser.close();});
for(const business of ['bakery','politician'])for(const kept of [false,true]){
 let forms;
 for(const page of ['round1','variations'])for(const theme of ['light','dark'])for(const width of [734,390])test(`whole-board height ${business} ${page} ${kept?'kept':'plain'} ${theme} ${width}: under 5000px and unchanged input under 1000`,async t=>{
  forms??=wholeBoardForms(business,kept);
  const form=structuredClone(forms[page]);
  const h=await kit.open(form,width,theme);
  try{
   const m=await measureWholeBoard(h,form,theme);t.diagnostic(JSON.stringify(m));
   assert.equal(m.thumbnails,12);assert.ok(m.height<5000,JSON.stringify(m));
   assert.ok(m.unchanged);assert.equal(m.elementsBefore,m.inputElements);assert.equal(m.elementsAfter,m.inputElements);assert.ok(m.inputElements<1000);
   assert.equal(m.domInputs,12);assert.equal(m.overflow,false);assert.deepEqual(h.errors,[]);
   assert.ok(m.patches.every(p=>p.overlayOnly),'patch adds no height to the drawing');
   assert.deepEqual(m.clippedText,[]);
  }finally{await h.context.close();}
 });
}
