import '../../lib/tests/isolated-home.js';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {browserKit,onlyFonts} from './boards-harness.js';
import {lookForm,lookActions} from './board-fixtures.js';
import {select} from '../../../skills/Build Brand/scripts/select.mjs';
import {operator} from '../../../skills/Build Brand/tests/select-fixtures.mjs';
import {checkForm} from '../scripts/format.js';
let kit;before(async()=>{kit=await browserKit();});after(async()=>{await kit?.browser.close();});
for(const id of [undefined,'business-blue-bold'])for(const view of ['look','board'])for(const width of [390,734])test(`kept palette ${id??'roles only'} ${view} ${width}: card, mode switch, fixed colour and sent values`,async()=>{
 const a={...operator(),mode:'light',kept:{palette:{...(id?{id}:{}),overrides:{light:{hairline:'#bbbbbb'},dark:{hairline:'#777777'}}}}};
 const result=select(view==='look'?'looks':'round1',view==='look'?a:{...a,looksShown:[]},{check:true});
 const form=view==='look'?lookForm(a,result):result.form;
 if(view==='look'){form.questions[0].controls=result.controls;form.actions=lookActions();}
 assert.ok(form,result.formUnavailable);assert.deepEqual(checkForm(form),{ok:true,problems:[]});
 const q=form.questions[0];assert.deepEqual(q.controls,{mode:'light'});
 assert.ok(q.options.every(o=>o.steps.length===1&&o.steps[0].value===o.value));
 const h=await kit.open(form,width,'light');
 try {
  const art=view==='look'?'.look-art':'.board-preview';
  assert.equal(await h.f.locator(`.boards-tiles ${art}`).count(),12);
  assert.equal(await h.f.locator(`.boards-tiles ${art}`).first().isVisible(),true);
  assert.equal(await h.f.getByRole('button',{name:'More muted',exact:true}).count(),0);
  assert.equal(await h.f.getByRole('button',{name:'More bold',exact:true}).count(),0);
  await h.f.locator('.boards-tile').first().click();
  const input=h.f.locator('.tile-input').first(),value=await input.inputValue();
  assert.equal(value,q.options[0].steps[0].value);
  await h.frame.evaluate(view=>{
   window.drawn=[];const method=view==='look'?'look':'draw',original=WiserBoardView[method];
   WiserBoardView[method]=(model,board,options)=>{drawn.push({light:board.palette.light.hairline,dark:board.palette.dark.hairline});return original(model,board,options);};
  },view);
  const group=h.f.getByRole('group',{name:'Light or dark',exact:true});
  for(const mode of ['dark','light','dark']){
   await group.getByRole('button',{name:mode==='light'?'Light':'Dark',exact:true}).click();
   assert.equal(await h.f.locator('fieldset').getAttribute('data-mode'),mode);
   assert.equal(await group.getByRole('button',{name:mode==='light'?'Light':'Dark',exact:true}).getAttribute('aria-pressed'),'true');
   assert.deepEqual(await h.f.locator(`.boards-tiles ${art}`).evaluateAll(ns=>ns.map(n=>n.dataset.mode)),Array(12).fill(mode));
   assert.equal(await input.isChecked(),true);assert.equal(await input.inputValue(),value);
  }
  const drawn=await h.frame.evaluate(()=>drawn);assert.equal(drawn.length,36);
  assert.ok(drawn.every(p=>p.light==='#bbbbbb'&&p.dark==='#777777'));
  assert.equal((await h.page.evaluate(()=>__log.filter(e=>e.kind==='context'||e.kind==='message'))).length,0);
  await h.f.locator(`[data-action=${view==='look'?'one':'more'}]`).click();await h.f.locator('#status.ok').waitFor();
  const sent=await h.page.evaluate(()=>__log.filter(e=>e.kind==='context'||e.kind==='message'));
  assert.deepEqual(sent.map(e=>e.kind),['context','message']);
  const payload=sent[0].params.structuredContent;
  assert.equal(payload.mode,'dark');assert.deepEqual(payload.answers[q.id],[value]);
  assert.equal(payload.shown[0].shown,q.options[0].steps[0].label);
  assert.ok(onlyFonts(h.requests));assert.deepEqual(h.errors,[]);
 }finally{await h.context.close();}
});
