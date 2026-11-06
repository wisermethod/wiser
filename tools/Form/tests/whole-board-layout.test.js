import '../../lib/tests/isolated-home.js';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {browserKit} from './boards-harness.js';
import {wholeBoardForms} from './whole-board-fixtures.js';
import {boardForm} from './board-fixtures.js';
let kit;before(async()=>{kit=await browserKit();});after(async()=>{await kit?.browser.close();});

for(const business of ['bakery','politician'])test(`one fixed row split across ${business}'s twelve boards, modes and page widths`,async()=>{
 const h=await kit.open(wholeBoardForms(business).round1,734);
 try{
  for(const width of [734,390])for(const mode of ['light','dark']){
   await h.page.setViewportSize({width,height:900});
   await h.f.locator(`.board-controls [data-mode="${mode}"]`).click();
   const splits=await h.f.locator('.board-thumbnail').evaluateAll(ns=>ns.map(n=>[...n.querySelectorAll('.thumbnail-column')].map(c=>[...c.children].map(r=>r.classList.contains('whole-foot')?'footer':[...r.children].map(s=>s.className).join(',')))));
   assert.equal(splits.length,12);
   for(const columns of splits)assert.deepEqual(columns,[['brand-hero,palette','face-sample heading-face,face-sample body-face,words'],['graphic-language,items','banner-section','other-mode','rules','footer']]);
  }
 }finally{await h.context.close();}
});

test('recommended badges stay at the real-size top right on every ground and never on other boards',async()=>{
 const form=wholeBoardForms('bakery').round1,h=await kit.open(form,390);
 try{
  for(const width of [390,734])for(const mode of ['light','dark']){
   await h.page.setViewportSize({width,height:900});await h.f.locator(`.board-controls [data-mode="${mode}"]`).click();
   const tiles=await h.f.locator('.boards-tile').evaluateAll(ns=>ns.map(n=>{
    const s=n.querySelector('.thumbnail-surface'),b=n.querySelector('.thumbnail-badge');if(!b)return null;
    const r=s.getBoundingClientRect(),v=b.getBoundingClientRect(),css=getComputedStyle(b);
    return {right:r.right-v.right,top:v.top-r.top,height:v.height,font:css.fontSize,background:css.backgroundColor,colour:css.color,inPatch:!!b.closest('.thumbnail-patch')};
   }));
   for(const [i,b]of tiles.entries()){
    assert.equal(!!b,!!form.questions[0].options[i].recommendation);
    if(b){assert.ok(Math.abs(b.right-8)<.5&&Math.abs(b.top-8)<.5,JSON.stringify(b));assert.equal(b.inPatch,false);assert.equal(b.font,'13px');assert.equal(b.height,23);assert.equal(b.background,'rgb(36, 40, 50)');assert.equal(b.colour,'rgb(255, 255, 255)');}
   }
  }
 }finally{await h.context.close();}
});

test('phone thumbnails retain the banner sentence and the same drawing typography as desktop',async()=>{
 const h=await kit.open(wholeBoardForms('bakery').round1,734);
 try{
  const drawing=()=>h.f.locator('.board-thumbnail').evaluateAll(ns=>ns.map(n=>({sentence:n.querySelector('.banner-copy>p').getClientRects().length,words:getComputedStyle(n.querySelector('.words li')).fontSize,chips:getComputedStyle(n.querySelector('.named-chips')).gridTemplateColumns.split(' ').length})));
  const desktop=await drawing();await h.page.setViewportSize({width:390,height:900});
  const phone=await drawing();assert.ok(phone.every(b=>b.sentence>0));assert.deepEqual(phone,desktop);
 }finally{await h.context.close();}
});

for(const reasonOnly of [false,true])test(`tap at the right end of the ${reasonOnly?'reason':'note'} cannot select a board with a one-line name`,async()=>{
 const form=boardForm(),o=form.questions[0].options[0];o.label='Steady';if(reasonOnly){o.note='';o.recommendation=wholeBoardForms('bakery').round1.questions[0].options.find(o=>o.recommendation).recommendation;}
 const h=await kit.open(form,390,'light',{touch:true});
 try{
  const caption=h.f.locator('.boards-tile .tile-label').first(),small=caption.locator(reasonOnly?'.recommendation-reason':'small').first();
  const before=await h.frame.evaluate(()=>WiserForm.readAnswers());
  const box=await small.boundingBox();await h.page.touchscreen.tap(box.x+box.width-2,box.y+2);
  assert.deepEqual(await h.frame.evaluate(()=>WiserForm.readAnswers()),before);
  const geometry=await caption.evaluate(n=>{const i=n.querySelector('input').getBoundingClientRect();return {width:i.width,height:i.height,overlap:[...n.querySelectorAll('small')].some(s=>{const r=s.getBoundingClientRect();return r.left<i.right&&r.right>i.left&&r.top<i.bottom&&r.bottom>i.top;})};});
  assert.equal(geometry.width,44);assert.equal(geometry.height,44);assert.equal(geometry.overlap,false);
 }finally{await h.context.close();}
});

test('recommended caption stays exposed and the tick box announces Recommended after redraw',async()=>{
 const h=await kit.open(wholeBoardForms('bakery').round1,390);
 try{
  for(const mode of ['light','dark']){
   await h.f.locator(`.board-controls [data-mode="${mode}"]`).click();
   const captions=h.f.locator('.board-recommendation');assert.ok(await captions.count());
   for(const caption of await captions.all()){
    const word=caption.getByText('Recommended',{exact:true});assert.equal(await word.count(),1);
    assert.equal(await word.evaluate(n=>!!n.closest('[aria-hidden="true"],[inert],[hidden]')),false);
   }
   assert.equal(await h.f.getByRole('checkbox',{name:/Recommended/}).count(),await captions.count());
   assert.match(await h.f.locator('form').ariaSnapshot(),/Recommended/);
  }
 }finally{await h.context.close();}
});
