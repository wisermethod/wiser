import '../../lib/tests/isolated-home.js';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {browserKit} from './boards-harness.js';
import {wholeBoardForms} from './whole-board-fixtures.js';
import {resolveBoards} from '../scripts/boards.js';
let kit;before(async()=>{kit=await browserKit();});after(async()=>{await kit?.browser.close();});

test('thumbnail split uses the shared row boundary, with left-then-right reading order',async()=>{
 const h=await kit.open(wholeBoardForms('bakery').round1,390);
 try{
  const boards=await h.f.locator('.board-thumbnail').evaluateAll(nodes=>nodes.map(n=>{
   const cols=[...n.querySelectorAll('.thumbnail-column')],rows=cols.flatMap(c=>[...c.children]);
   return {columns:cols.length,heights:rows.map(r=>r.getBoundingClientRect().height),gap:cols.length?parseFloat(getComputedStyle(cols[0]).gap)*parseFloat(getComputedStyle(n.querySelector('.brand-board')).zoom):0,
    split:cols[0]?.children.length,order:rows.map(r=>r.classList.contains('whole-foot')?'footer':[...r.children].map(n=>n.className).join(','))};
  }));
  for(const b of boards){
   assert.equal(b.columns,2);
   assert.equal(b.split,2);
   // Every section still occurs once; the source reading order is unchanged.
   assert.ok(b.split>0&&b.split<b.heights.length);
   assert.deepEqual(b.order,['brand-hero,palette','face-sample heading-face,face-sample body-face,words','graphic-language,items','banner-section','other-mode','rules','footer']);
  }
 }finally{await h.context.close();}
});

for(const kept of [false,true])test(`patch swatches on every board use the looks strip order and follow mode/strength${kept?' with kept palette':''}`,async()=>{
 const form=wholeBoardForms('bakery',kept).round1,h=await kit.open(form,390);
 try{
  const q=form.questions[0],model=resolveBoards(form.brand,q.options,form.boardDefaults,q.view??'board');
  let step=q.options.map(o=>o.steps?.findIndex(s=>s.value===o.value)??0);
  for(const mode of ['light','dark']){
   await h.f.locator(`.board-controls [data-mode="${mode}"]`).click();
   for(const strength of ['initial','More bold','More muted']){
    if(strength!=='initial'){
     const button=h.f.getByRole('button',{name:strength,exact:true});
     if(!await button.count()||await button.isDisabled())continue;
     const delta=strength==='More bold'?1:-1;
     step=step.map((i,k)=>Math.max(0,Math.min((q.options[k].steps?.length??1)-1,i+delta)));
     await button.click();
    }
    const actual=await h.f.locator('.board-thumbnail').evaluateAll(nodes=>nodes.map(n=>[...n.querySelectorAll('.thumbnail-swatch')].map(s=>({key:s.dataset.swatch,value:s.dataset.colour,shown:!s.hidden,width:s.getBoundingClientRect().width,height:s.getBoundingClientRect().height}))));
    assert.equal(await h.f.locator('.board-option .thumbnail-badge').count(),q.options.filter(o=>o.recommendation).length,'redrawing preserves each existing badge');
    assert.deepEqual(await h.f.locator('.recommendation-reason').allTextContents(),q.options.filter(o=>o.recommendation).map(o=>o.recommendation));
    assert.equal(actual.length,12);
    for(const [i,list]of actual.entries()){
     const b=model.steps?.[i]?.[step[i]]?.boards[mode]??model.boards[i];
     assert.deepEqual(list.map(s=>s.key),['panel','pop','deep']);
     assert.deepEqual(list.map(s=>s.value),['panel','pop','deep'].map(k=>b.palette[mode][k]));
     const shown=list.filter(s=>s.shown);assert.deepEqual(shown,list.slice(0,shown.length));
     assert.ok(shown.every(s=>s.width>=24&&s.height>=20));
    }
   }
  }
  assert.deepEqual(h.errors,[]);
 }finally{await h.context.close();}
});

test('swatch fit keeps the top-right badge independent of patch height and retains only an ordered prefix',async()=>{
 const form=wholeBoardForms('bakery').round1,h=await kit.open(form,390);
 try{
  const result=await h.frame.evaluate(()=>{
   const tile=[...document.querySelectorAll('.board-option')].find(n=>n.querySelector('.board-recommendation'));
   const surface=tile.querySelector('.thumbnail-surface');
   if(!surface)return null;
   const board=surface.querySelector('.brand-board'),cols=[...board.querySelectorAll('.thumbnail-column')],rows=cols.flatMap(c=>[...c.children]);
   // Keep the fixed split after row two and set an exact leftover height.
   rows.slice(3).forEach(n=>n.remove());
   rows.slice(0,3).forEach(n=>{n.replaceChildren();n.style.height='100px';});
   const out=[];
   const fit=(pixels,width)=>{
    surface.style.width=width+'px';
    const currentScale=parseFloat(getComputedStyle(board).zoom);
    rows[2].style.height=(224+pixels/currentScale)+'px';
    WiserBoardView.fitLooks();
    const patch=surface.querySelector('.thumbnail-patch'),badge=tile.querySelector('.thumbnail-badge');
    out.push({pixels,badge:patch.contains(badge),caption:!!tile.querySelector('.board-recommendation b'),topRight:badge.parentElement===surface,reason:tile.querySelector('.recommendation-reason').textContent,
     swatches:[...patch.querySelectorAll('.thumbnail-swatch')].filter(n=>!n.hidden).map(n=>n.dataset.swatch),height:surface.getBoundingClientRect().height,
     patch:patch.getBoundingClientRect().toJSON(),badgeBox:badge.getBoundingClientRect().toJSON()});
   };
   fit(100,350);fit(40,350);fit(10,350);fit(100,120);fit(100,350);
   fit(30,350);fit(32,350);fit(56,350);fit(58,350);fit(100,180);
   return out;
  });
  assert.ok(result,'thumbnail has a real-size patch');
  const expected=[3,3,0,1,3,3,3,3,3,2];
  for(const [i,r]of result.entries()){
   assert.ok(!r.badge&&!r.caption&&r.topRight);
   assert.deepEqual(r.swatches,['panel','pop','deep'].slice(0,expected[i]));
   assert.equal(r.reason,form.questions[0].options.find(o=>o.recommendation).recommendation);
  }
  assert.deepEqual(h.errors,[]);
 }finally{await h.context.close();}
});
