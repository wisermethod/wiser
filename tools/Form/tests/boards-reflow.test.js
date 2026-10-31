import '../../lib/tests/isolated-home.js';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {boardForm,lookForm,tapSets} from './board-fixtures.js';
import {browserKit} from './boards-harness.js';
let kit;before(async()=>{kit=await browserKit({nativeScrollbars:true});});after(async()=>{await kit?.browser.close();});
const settle=h=>h.frame.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
async function resizeFrame(h,width){
 await h.page.setViewportSize({width:width+15,height:900});
 await h.page.locator('iframe').evaluate((n,width)=>n.style.width=`${width}px`,width);
 await settle(h);assert.equal(await h.frame.evaluate(()=>innerWidth),width);
}
const topology=h=>h.frame.evaluate(()=>({
 top:document.querySelector('.board-viewer').getBoundingClientRect().top+scrollY,
 visible:[...document.querySelectorAll('.board-option')].flatMap((n,i)=>n.getClientRects().length?[i]:[])
}));
async function expectRow(h,top,count){
 const actual=await topology(h);assert.ok(Math.abs(actual.top-top)<1,JSON.stringify({actual,top}));
 assert.deepEqual(actual.visible,Array.from({length:count},(_,i)=>i));
}
async function expectCloseOnScreen(h){
 await settle(h);
 const box=await h.f.getByText('Close this board',{exact:true}).first().boundingBox();
 assert.ok(box&&box.y>=0&&box.y+box.height<=900,JSON.stringify(box));
}
const sendCap=(h,maxHeight)=>h.page.evaluate(maxHeight=>{
 document.querySelector('iframe').style.maxHeight=maxHeight>0?`${maxHeight}px`:'';
 window.__bridge.setHostContext({containerDimensions:{maxHeight,width:734}});
},maxHeight);
for(const theme of ['light','dark'])test(`open right-hand tile reflows 734 to 390 and back, ${theme}`,async()=>{
 const h=await kit.open(boardForm(),734,theme,{autoSize:true});
 try{
  const tops={};
  for(const width of [734,390,734]){
   await resizeFrame(h,width);
   tops[width]=await h.f.locator('.board-option').nth(width===734?4:5).evaluate(n=>n.getBoundingClientRect().top+scrollY);
  }
  await h.f.locator('.see-board').nth(5).click();
  for(const width of [734,390,734]){
   await resizeFrame(h,width);
   await expectRow(h,tops[width],width===734?4:5);
   assert.equal(await h.f.locator('.board-focus').count(),0);
   assert.equal(await h.f.getByText('Close this board',{exact:true}).first().evaluate(n=>n===document.activeElement),true);
  }
  await h.f.getByText('Close this board',{exact:true}).first().click();
  assert.equal(await h.f.locator('.board-option:visible').count(),12);assert.deepEqual(h.errors,[]);
 }finally{await h.context.close();}
});
for(const theme of ['light','dark'])test(`row three under the 5000px cap brings the close button into the outer viewport, ${theme}`,async()=>{
 const h=await kit.open(boardForm(),734,theme,{name:'Claude',autoSize:true,containerDimensions:{maxHeight:5000,width:734}});
 try{
  await h.f.locator('.see-board').nth(5).click();
  assert.equal(await h.f.locator('.board-focus').count(),1);
  assert.equal(await h.f.locator('.board-option:visible').count(),0);
  assert.equal(await h.f.locator('.board-mode-switches').count(),1);
  await expectCloseOnScreen(h);assert.deepEqual(h.errors,[]);
 }finally{await h.context.close();}
});
for(const theme of ['light','dark'])test(`viewer picks update action lines, boxes and submission guards immediately, ${theme}`,async()=>{
 const h=await kit.open(boardForm(),734,theme,{autoSize:true});
 try{
  await h.f.locator('.boards-tile').nth(5).click();await h.f.locator('.see-board').nth(5).click();
  const more=h.f.locator('[data-action=more]'),lock=h.f.locator('[data-action=lock]'),pick=h.f.locator('.board-viewer input');
  for(const wanted of [false,true]){
   // Check requestSubmit in the same event turn as unpicking, before a stale action could submit.
   await pick.evaluate((n,wanted)=>{n.checked=wanted;n.dispatchEvent(new Event('change',{bubbles:true}));if(!wanted)document.querySelector('[data-action=lock]').form.requestSubmit(document.querySelector('[data-action=lock]'));},wanted);
   assert.equal(await more.locator('small').innerText(),wanted?'Show me variations of this board':'None of these work');
   assert.equal(await lock.evaluate(n=>n.getClientRects().length>0),wanted);
   assert.equal(await more.evaluate(n=>n.getClientRects().length>0),true);
   assert.equal((await h.page.evaluate(()=>window.__log.filter(e=>e.kind==='message'))).length,0);
  }
  assert.deepEqual(await h.frame.evaluate(()=>WiserForm.readAnswers()[0].value),['board-6']);
  assert.equal(await h.f.locator('.board-viewer').isVisible(),true);assert.deepEqual(h.errors,[]);
 }finally{await h.context.close();}
});
for(const theme of ['light','dark'])test(`one-word look names grow beyond 90px and keep their ink inside 294 by 190, ${theme}`,async()=>{
 const h=await kit.open(lookForm({...tapSets.operator(),name:'Al'}),734,theme);
 try{
  for(const width of [734,390,734]){
   await resizeFrame(h,width);
   const names=await h.frame.evaluate(()=>[...document.querySelectorAll('.look-name')].map(n=>{const box=n.getBBox();return {size:parseFloat(n.style.fontSize),width:box.width,height:box.height};}));
   assert.equal(names.length,12);assert.ok(names.every(n=>n.size>90&&n.width>0&&n.width<=294.01&&n.height>0&&n.height<=190.01),JSON.stringify(names));
  }
  assert.deepEqual(h.errors,[]);
 }finally{await h.context.close();}
});
test('a late cap switches an open board to fallback, scrolls it into view, and a raised or removed cap restores its row',async()=>{
 const h=await kit.open(boardForm(),734,'light',{name:'Claude',autoSize:true});
 try{
  const rowTop=await h.f.locator('.board-option').nth(4).evaluate(n=>n.getBoundingClientRect().top+scrollY);
  await h.f.locator('.see-board').nth(5).click();await expectRow(h,rowTop,4);
  for(const cap of [5000,20000,5000,undefined]){
   await sendCap(h,cap);await settle(h);
   if(cap===5000){assert.equal(await h.f.locator('.board-focus').count(),1);await expectCloseOnScreen(h);}
   else{assert.equal(await h.f.locator('.board-mode-switches').count(),0);await expectRow(h,rowTop,4);}
  }
  assert.deepEqual(h.errors,[]);
 }finally{await h.context.close();}
});
test('a host size update recomputes the current row even without a window resize',async()=>{
 const h=await kit.open(boardForm(),734,'dark',{autoSize:true});
 try{
  const top=await h.f.locator('.board-option').nth(4).evaluate(n=>n.getBoundingClientRect().top+scrollY);
  await h.f.locator('.see-board').nth(5).click();
  // Model a layout change before its host-context notification, without a window resize.
  await h.frame.evaluate(()=>document.querySelector('.boards-tiles').style.gridTemplateColumns='minmax(0,1fr)');
  const previous=await h.f.locator('.board-option').nth(3).evaluate(n=>n.getBoundingClientRect().bottom+scrollY+20);
  await h.page.evaluate(()=>window.__bridge.setHostContext({containerDimensions:{width:390,maxHeight:20000}}));await settle(h);
  const actual=await topology(h);assert.deepEqual(actual.visible,[0,1,2,3,4]);assert.ok(actual.top>previous&&actual.top>top);assert.deepEqual(h.errors,[]);
 }finally{await h.context.close();}
});
test('finishing deferred fonts recomputes the current row',async()=>{
 const h=await kit.open(boardForm(),734,'light',{deferFonts:true});
 try{
  await h.f.locator('.see-board').nth(5).click();
  await h.frame.evaluate(()=>document.querySelector('.boards-tiles').style.gridTemplateColumns='minmax(0,1fr)');
  await h.releaseFonts();await settle(h);
  assert.deepEqual((await topology(h)).visible,[0,1,2,3,4]);assert.deepEqual(h.errors,[]);
 }finally{await h.releaseFonts();await h.context.close();}
});
test('finishing deferred fonts revisits the cap and brings the fallback bar into view',async()=>{
 const h=await kit.open(boardForm(),734,'dark',{deferFonts:true,autoSize:true,containerDimensions:{maxHeight:20000,width:734}});
 try{
  await h.f.locator('.see-board').nth(5).click();
  const height=await h.f.locator('#root').evaluate(n=>Math.ceil(n.getBoundingClientRect().height));
  await sendCap(h,height+100);await settle(h);assert.equal(await h.f.locator('.board-focus').count(),0);
  // Deterministic extra font-metric height; only the real loadingdone event triggers the cap recheck.
  await h.frame.evaluate(()=>{const art=document.querySelector('.board-viewer .board-art');art.style.minHeight=`${art.getBoundingClientRect().height+1000}px`;});
  await h.releaseFonts();await settle(h);
  assert.equal(await h.f.locator('.board-focus').count(),1);await expectCloseOnScreen(h);assert.deepEqual(h.errors,[]);
 }finally{await h.releaseFonts();await h.context.close();}
});
test('an open board on a hidden page keeps its option and recomputes the row when shown again',async()=>{
 const form=boardForm();form.paged=true;form.questions.push({id:'notes',type:'text',label:'Anything else?'});
 const h=await kit.open(form,734,'light',{autoSize:true});
 try{
  await resizeFrame(h,734);await h.f.locator('.see-board').nth(5).click();
  await h.f.locator('#next').click();await resizeFrame(h,390);
  await sendCap(h,20000);await settle(h);
  await h.f.locator('#back').click();await settle(h);
  assert.deepEqual((await topology(h)).visible,[0,1,2,3,4]);
  assert.equal(await h.f.locator('.board-viewer .locked-name').innerText(),form.questions[0].options[5].label);
  assert.deepEqual(h.errors,[]);
 }finally{await h.context.close();}
});
