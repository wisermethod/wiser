import '../../lib/tests/isolated-home.js';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {z} from 'zod';
import {browserKit,onlyFonts} from './boards-harness.js';
import {lookForm,lookActions} from './board-fixtures.js';
import {checkForm,formJsonSchema} from '../scripts/format.js';
import {resolveBoards} from '../scripts/boards.js';
import {select} from '../../../skills/Build Brand/scripts/select.mjs';
import {buildOwnColours} from '../../../skills/Build Brand/scripts/own-colours.mjs';
import {bakery} from '../../../skills/Build Brand/tests/select-fixtures.mjs';
let kit;before(async()=>{kit=await browserKit();});after(async()=>{await kit?.browser.close();});
const ownColours=buildOwnColours('red white and blue');
function formFor(view){
 const a={...bakery(),ownColours},result=select(view==='look'?'looks':'round1',view==='look'?a:{...a,looksShown:[]},{check:true});
 const form=view==='look'?lookForm(a,result):result.form;
 if(view==='look'){form.questions[0].controls=result.controls;form.actions=lookActions();}return form;
}
test('own palette names and energy are validated in board references and step references',()=>{
 const f=formFor('look');assert.deepEqual(checkForm(f),{ok:true,problems:[]});
 assert.ok(z.fromJSONSchema(formJsonSchema()).safeParse(f).success);
 const o=f.questions[0].options[0];o.steps[0].palette=structuredClone(o.board.palette);
 assert.deepEqual(checkForm(f),{ok:true,problems:[]});
 for(const mutate of [p=>p.names=null,p=>p.names=[],p=>p.names={},p=>p.names=['bad red'],p=>p.names=['#fff '],p=>delete p.energy,p=>delete p.overrides]){
  const bad=structuredClone(f);mutate(bad.questions[0].options[0].board.palette);assert.equal(checkForm(bad).ok,false);
 }
 const bad=structuredClone(f);bad.questions[0].options[0].steps[0].palette.names=['bad red'];assert.equal(checkForm(bad).ok,false);
});
for(const view of ['look','board'])for(const width of [390,734])test(`own colours ${view} ${width}: member names, C3 energy, grey strength, both modes and payload`,async()=>{
 const f=formFor(view),q=f.questions[0],model=resolveBoards(f.brand,q.options,f.boardDefaults);
 for(const b of model.boards){
  assert.equal(b.energy,ownColours.lines[0]);
  for(const mode of ['light','dark'])for(const sw of b.modes[mode].swatches){
   const value=b.palette[mode][sw.key],member=ownColours.values.find(v=>v.value.toUpperCase()===value.toUpperCase());
   const expected=member?.name??value;assert.ok(sw.name===expected||sw.name.startsWith(expected+' '),sw.name);
  }
 }
 const h=await kit.open(f,width,'light');try{
  const muted=h.f.getByRole('button',{name:'More muted',exact:true}),bold=h.f.getByRole('button',{name:'More bold',exact:true});
  assert.equal(await muted.isDisabled(),true);assert.equal(await bold.isDisabled(),true);
  if(view==='board'){
   assert.equal(await h.f.locator('.board-zero').count(),0);
   const swatches=await h.f.locator('.boards-tiles .board-preview .colour-bar b').allTextContents();
   assert.ok(swatches.includes('red')&&swatches.includes('white')&&swatches.includes('blue'));
  }
  await h.f.locator('.looks-tile, .boards-tile:not(.looks-tile) .tile-input').first().click();
  const input=h.f.locator('.tile-input').first(),value=await input.inputValue();
  await h.frame.evaluate(()=>{window.ownDrawn=[];const original=WiserBoardView.draw;WiserBoardView.draw=(model,board,options)=>{ownDrawn.push(board.energy);return original(model,board,options);};});
  await h.f.getByRole('group',{name:'Light or dark',exact:true}).getByRole('button',{name:'Dark',exact:true}).click();
  if(view==='board')assert.deepEqual(await h.frame.evaluate(()=>ownDrawn),Array(12).fill(ownColours.lines[0]));
  assert.equal(await input.isChecked(),true);assert.equal(await input.inputValue(),value);
  assert.equal(await muted.isDisabled(),true);assert.equal(await bold.isDisabled(),true);
  await h.f.locator(`[data-action=${view==='look'?'one':'more'}]`).click();await h.f.locator('#status.ok').waitFor();
  const sent=await h.page.evaluate(()=>__log.filter(e=>e.kind==='context'||e.kind==='message'));
  assert.deepEqual(sent.map(e=>e.kind),['context','message']);assert.equal(sent[0].params.structuredContent.mode,'dark');
  assert.deepEqual(sent[0].params.structuredContent.answers[q.id],[value]);assert.ok(onlyFonts(h.requests));assert.deepEqual(h.errors,[]);
 }finally{await h.context.close();}
});
