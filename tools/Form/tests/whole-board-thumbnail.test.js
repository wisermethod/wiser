import '../../lib/tests/isolated-home.js';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {boardForm} from './board-fixtures.js';
import {browserKit} from './boards-harness.js';
let kit;before(async()=>{kit=await browserKit();});after(async()=>{await kit?.browser.close();});
test('whole-board thumbnail: one copy of all sections, balanced two-column flow, no clipping',async()=>{
 const h=await kit.open(boardForm(),390);
 try{
  const result=await h.f.locator('.board-thumbnail').first().evaluate(n=>{
   const board=n.querySelector('.brand-board'),r=n.getBoundingClientRect();
   return {columns:getComputedStyle(board).columnCount,sections:[...board.querySelectorAll('section')].map(n=>n.className),
    rows:[...board.querySelectorAll('.board-row')].map(n=>{const b=n.getBoundingClientRect();return {x:b.x-r.x,y:b.y-r.y,right:b.right-r.x,bottom:b.bottom-r.y};}),width:r.width,height:r.height,
    sample:board.querySelector('.hero-body').textContent,boards:n.querySelectorAll('.brand-board').length};
  });
  assert.equal(result.boards,1);assert.equal(result.columns,'2');
  for(const section of ['brand-hero','palette','face-sample heading-face','face-sample body-face','words','graphic-language','items','banner-section','other-mode','rules'])assert.equal(result.sections.filter(s=>s===section).length,1,section);
  assert.match(result.sample,/Sample:/);
  assert.ok(result.rows.some(r=>r.x>result.width/2));
  assert.ok(result.rows.every(r=>r.x>=0&&r.y>=0&&r.right<=result.width+1&&r.bottom<=result.height+1),JSON.stringify(result));
  assert.deepEqual(h.errors,[]);
 }finally{await h.context.close();}
});
test('thumbnail opens without selecting; only its checkbox selects; caption and old link do neither; native keyboard and focus',async()=>{
 const form=boardForm(),h=await kit.open(form,390,'light',{touch:true});
 try{
  const full=h.f.getByRole('button',{name:`See it full size: ${form.questions[0].options[0].label}`,exact:true}),input=h.f.locator('.tile-input').first();
  const picks=()=>h.frame.evaluate(()=>WiserForm.readAnswers()[0].value);
  assert.equal(await h.f.locator('.board-option>.see-board,.board-option>a').count(),0);
  await h.f.locator('.tile-label>span').first().tap();assert.deepEqual(await picks(),[]);assert.equal(await h.f.locator('.board-viewer').count(),0);
  await full.tap();assert.equal(await h.f.locator('.board-viewer').isVisible(),true);assert.deepEqual(await picks(),[]);
  await h.f.getByText('Close this board',{exact:true}).first().click();
  for(const key of ['Enter','Space']){
   await h.page.keyboard.press('Tab');
   await full.focus();assert.equal(await full.evaluate(n=>getComputedStyle(n).outlineStyle),'solid');
   await full.press(key);assert.equal(await h.f.locator('.board-viewer').isVisible(),true);assert.deepEqual(await picks(),[]);
   await h.f.getByText('Close this board',{exact:true}).last().click();
   assert.equal(await full.evaluate(n=>n===document.activeElement),true);
  }
  await input.tap();assert.deepEqual(await picks(),['board-1']);assert.equal(await h.f.locator('.board-viewer').count(),0);
  await h.page.keyboard.press('Tab');await input.focus();await input.press('Space');assert.deepEqual(await picks(),[]);
  assert.equal(await h.f.locator('.boards-tile').first().evaluate(n=>getComputedStyle(n).outlineStyle),'solid');
  assert.deepEqual(h.errors,[]);
 }finally{await h.context.close();}
});
