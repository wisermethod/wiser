import '../../lib/tests/isolated-home.js';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {browserKit} from './boards-harness.js';
import {wholeBoardForms} from './whole-board-fixtures.js';
import {resolveBoards} from '../scripts/boards.js';
let kit;before(async()=>{kit=await browserKit();});after(async()=>{await kit?.browser.close();});

test('thumbnail split is the closest intact section boundary, with left-then-right reading order',async()=>{
 const h=await kit.open(wholeBoardForms('bakery').round1,390);
 try{
  const boards=await h.f.locator('.board-thumbnail').evaluateAll(nodes=>nodes.map(n=>{
   const cols=[...n.querySelectorAll('.thumbnail-column')],rows=cols.flatMap(c=>[...c.children]);
   return {columns:cols.length,heights:rows.map(r=>r.getBoundingClientRect().height),gap:cols.length?parseFloat(getComputedStyle(cols[0]).gap)*parseFloat(getComputedStyle(n.querySelector('.brand-board')).zoom):0,
    split:cols[0]?.children.length,order:rows.map(r=>r.classList.contains('whole-foot')?'footer':[...r.children].map(n=>n.className).join(','))};
  }));
  for(const b of boards){
   assert.equal(b.columns,2);
   const height=(from,to)=>b.heights.slice(from,to).reduce((s,h)=>s+h,0)+b.gap*Math.max(0,to-from-1);
   const differences=b.heights.slice(1).map((_,i)=>Math.abs(height(0,i+1)-height(i+1,b.heights.length)));
   const actual=Math.abs(height(0,b.split)-height(b.split,b.heights.length));
   assert.ok(actual<=Math.min(...differences)+.5,JSON.stringify(b));
   assert.ok(actual<=Math.max(...b.heights)+b.gap+.5);
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

test('patch fit gives the badge priority, keeps the reason in the caption, fits only an ordered swatch prefix, and restores the badge when too small',async()=>{
 const form=wholeBoardForms('bakery').round1,h=await kit.open(form,390);
 try{
  const result=await h.frame.evaluate(()=>{
   const tile=[...document.querySelectorAll('.board-option')].find(n=>n.querySelector('.board-recommendation'));
   const surface=tile.querySelector('.thumbnail-surface');
   if(!surface)return null;
   const board=surface.querySelector('.brand-board'),cols=[...board.querySelectorAll('.thumbnail-column')],rows=cols.flatMap(c=>[...c.children]);
   // Three equal-width sections make the optimum split's remaining height exact.
   rows.slice(3).forEach(n=>n.remove());
   rows.slice(0,3).forEach(n=>{n.replaceChildren();n.style.height='100px';});
   const out=[];
   const fit=(pixels,width)=>{
    surface.style.width=width+'px';
    const currentScale=parseFloat(getComputedStyle(board).zoom);
    rows[2].style.height=(224+pixels/currentScale)+'px';
    WiserBoardView.fitLooks();
    const patch=surface.querySelector('.thumbnail-patch'),badge=tile.querySelector('.thumbnail-badge');
    out.push({pixels,badge:patch.contains(badge),caption:!!tile.querySelector('.board-recommendation b'),reason:tile.querySelector('.recommendation-reason').textContent,
     swatches:[...patch.querySelectorAll('.thumbnail-swatch')].filter(n=>!n.hidden).map(n=>n.dataset.swatch),height:surface.getBoundingClientRect().height,
     patch:patch.getBoundingClientRect().toJSON(),badgeBox:badge.getBoundingClientRect().toJSON()});
   };
   fit(100,350);fit(40,350);fit(10,350);fit(100,120);fit(100,350);
   fit(30,350);fit(32,350);fit(56,350);fit(58,350);fit(100,180);
   return out;
  });
  assert.ok(result,'thumbnail has a real-size patch');
  const [room,badgeOnly,tiny,narrow,restored]=result;
  assert.ok(room.badge&&!room.caption);assert.deepEqual(room.swatches,['panel','pop','deep']);
  assert.ok(room.reason.includes(form.questions[0].options.find(o=>o.recommendation).recommendation));
  assert.ok(badgeOnly.badge&&!badgeOnly.caption);assert.deepEqual(badgeOnly.swatches,[]);
  assert.ok(!tiny.badge&&tiny.caption);assert.deepEqual(tiny.swatches,[]);
  assert.ok(!narrow.badge&&narrow.caption);assert.deepEqual(narrow.swatches,['panel']);
  assert.ok(restored.badge&&!restored.caption);assert.equal(restored.reason,room.reason);
  assert.ok(!result[5].badge&&result[5].caption,'below measured badge height');
  assert.ok(result[6].badge&&!result[6].caption,'above measured badge height');
  assert.deepEqual(result[7].swatches,[],'below badge plus gap plus chip height');
  assert.deepEqual(result[8].swatches,['panel','pop','deep'],'above badge plus gap plus chip height');
  assert.deepEqual(result[9].swatches,['panel','pop'],'two-chip width keeps the prefix');
  for(const r of [room,badgeOnly,restored])assert.ok(r.badgeBox.left>=r.patch.left&&r.badgeBox.right<=r.patch.right+.1&&r.badgeBox.top>=r.patch.top&&r.badgeBox.bottom<=r.patch.bottom+.1);
  assert.deepEqual(h.errors,[]);
 }finally{await h.context.close();}
});
