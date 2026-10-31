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
for(const theme of ['light','dark'])test(`viewer picks update action lines, boxes and submission guards immediately, ${theme}`,async()=>{
 const h=await kit.open(boardForm(),734,theme,{autoSize:true});
 try{
  await h.f.locator('.boards-tile').nth(5).click();await h.f.locator('.see-board').nth(5).click();
  const more=h.f.locator('[data-action=more]'),lock=h.f.locator('[data-action=lock]'),pick=h.f.locator('.board-viewer input').first();
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
for(const name of ['chatgpt','Claude'])test(`full viewer keeps its mode, picks and focus through resize, fonts, host caps and hidden pages in ${name}`,async()=>{
 const form=boardForm();form.paged=true;form.questions.push({id:'notes',type:'text',label:'Anything else?'});
 const h=await kit.open(form,734,'light',{name,deferFonts:true,autoSize:true});
 try{
  await h.f.locator('.boards-tile').nth(5).click();await h.f.locator('.see-board').nth(5).click();
  await h.f.locator('.board-mode-switch[data-mode=dark]').click();
  const stable=async()=>{
   assert.equal(await h.f.locator('.board-option:visible').count(),0);
   assert.equal(await h.f.locator('.boards-tiles').evaluate(n=>n.firstElementChild.classList.contains('board-viewer')),true);
   assert.equal(await h.f.locator('.board-mode-switches').count(),1);
   assert.equal(await h.f.locator('.board-mode-switch[aria-pressed=true]').getAttribute('data-mode'),'dark');
   assert.deepEqual(await h.frame.evaluate(()=>WiserForm.readAnswers()[0].value),['board-6']);
  };
  for(const width of [390,734]){await resizeFrame(h,width);await stable();}
  for(const maxHeight of [5000,20000,undefined]){
   await h.page.evaluate(maxHeight=>window.__bridge.setHostContext({containerDimensions:{maxHeight,width:734}}),maxHeight);
   await settle(h);await stable();
   assert.equal(await h.f.locator('.board-mode-switch[data-mode=dark]').evaluate(n=>n===document.activeElement),true);
  }
  await h.releaseFonts();await stable();
  await h.f.locator('#next').click();await resizeFrame(h,390);await h.f.locator('#back').click();await stable();
  assert.equal(await h.f.locator('.board-viewer .locked-name').innerText(),form.questions[0].options[5].label);
  await h.f.getByText('Close this board',{exact:true}).first().click();
  assert.equal(await h.f.locator('.board-option:visible').count(),12);
  assert.equal(await h.f.locator('.see-board').nth(5).evaluate(n=>n===document.activeElement),true);
  assert.deepEqual(h.errors,[]);
 }finally{await h.releaseFonts();await h.context.close();}
});
