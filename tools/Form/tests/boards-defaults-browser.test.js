import '../../lib/tests/isolated-home.js';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {browserKit,onlyFonts} from './boards-harness.js';
import {boardForm,lookForm} from './board-fixtures.js';
let kit;before(async()=>{kit=await browserKit();});after(async()=>{await kit?.browser.close();});
for(const name of ['chatgpt','Claude'])test(`${name}: board tiles draw brand words when note is absent; explicit and empty notes win`,async()=>{
 const form=boardForm(),options=form.questions[0].options;
 for(const o of options)delete o.note;
 options[1].note='Only this note';options[2].note='';
 form.boardDefaults={content:{smallPrint:'Shared drawing text'}};
 for(const o of options)delete o.board.content;
 options[1].board.content={smallPrint:'Specific drawing text'};
 const h=await kit.open(form,390,'dark',{name});
 try{
  const expected=form.brand.words.map(w=>`${w.word}, not ${w.not}`).join('; ');
  const inputs=h.f.locator('.tile-input');
  const noteId=await inputs.nth(0).getAttribute('aria-describedby');
  assert.ok(noteId);assert.equal(await h.f.locator(`[id="${noteId}"]`).innerText(),expected);
  const second=await inputs.nth(1).getAttribute('aria-describedby');assert.equal(await h.f.locator(`[id="${second}"]`).innerText(),'Only this note');
  assert.equal(await inputs.nth(2).getAttribute('aria-describedby'),null);
  await h.f.locator('.tile-input').first().click();assert.deepEqual(await h.frame.evaluate(()=>WiserForm.readAnswers()[0].value),['board-1']);
  await h.f.locator('.board-thumbnail').first().click();
  assert.ok(await h.f.locator('.board-viewer').getByText('Shared drawing text',{exact:true}).count()>0);
  assert.equal(await h.f.locator('.board-viewer').getByText('Specific drawing text',{exact:true}).count(),0);
  await h.f.getByText('Close this board',{exact:true}).first().click();
  await h.f.locator('.board-thumbnail').nth(1).click();
  assert.ok(await h.f.locator('.board-viewer').getByText('Specific drawing text',{exact:true}).count()>0);
  assert.equal(await h.f.locator('.board-viewer').getByText('Shared drawing text',{exact:true}).count(),0);
  assert.ok(onlyFonts(h.requests));assert.deepEqual(h.errors,[]);
 }finally{await h.context.close();}
});
test('empty brand words draw no note and look view retains its captions',async()=>{
 for(const form of [boardForm(),lookForm()]){
  const look=form.questions[0].view==='look';
  if(!look)form.brand.words=[];
  for(const o of form.questions[0].options)delete o.note;
  const h=await kit.open(form);
  try{assert.equal(await h.f.locator('.tile-input[aria-describedby]').count(),0);assert.deepEqual(h.errors,[]);}
  finally{await h.context.close();}
 }
});
