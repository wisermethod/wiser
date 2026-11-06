import '../../lib/tests/isolated-home.js';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {lookForm} from './board-fixtures.js';
import {browserKit} from './boards-harness.js';
import {checkForm} from '../scripts/format.js';
let kit;
before(async()=>{kit=await browserKit();});
after(async()=>{await kit?.browser.close();});
const baselineView=execFileSync('git',['show','05cb8f27:tools/Form/engine/boards.js'],{encoding:'utf8'});
const baselineEngine=execFileSync('git',['show','05cb8f27:tools/Form/engine/engine.js'],{encoding:'utf8'});
for(const view of ['look'])for(const width of [390,734])for(const theme of ['light','dark'])test(`selector legacy fixture without steps: ${view} ${width} ${theme} stays byte-identical`,async()=>{
 const form=lookForm(),q=form.questions[0];q.view=view;delete q.controls;
 for(const o of q.options){delete o.steps;if(view==='board')delete o.board.depth;}
 assert.deepEqual(checkForm(form),{ok:true,problems:[]});
 const h=await kit.open(form,width,theme);
 try {
  const tiles=()=>h.f.locator('.boards-tile').evaluateAll(nodes=>nodes.map(n=>n.outerHTML));
  const actual=await tiles();assert.equal(await h.f.locator('.board-controls').count(),0);
  await h.frame.addScriptTag({content:baselineView+'\n'+baselineEngine});
  await h.frame.evaluate(form=>WiserForm.render(form,{onSubmit:async()=>({sent:true})}),form);
  await h.frame.evaluate(async()=>{await document.fonts.ready;WiserBoardView.fitLooks();});
  assert.deepEqual(await tiles(),actual);assert.deepEqual(h.errors,[]);
 } finally {await h.context.close();}
});
test('a selector step owns its caption; a legacy card without steps uses the default caption',async()=>{
 const form=lookForm(),q=form.questions[0];delete q.options[0].label;
 const own=q.options[0].steps.find(s=>s.value===q.options[0].value);
 const current=await kit.open(form);
 try {assert.equal(await current.f.locator('.tile-label').first().innerText(),own.label);}
 finally {await current.context.close();}
 for(const o of q.options)delete o.steps;
 const legacy=await kit.open(form);
 try {assert.equal(await legacy.f.locator('.tile-label').first().innerText(),'Look 1');}
 finally {await legacy.context.close();}
});
