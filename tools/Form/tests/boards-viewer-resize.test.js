import '../../lib/tests/isolated-home.js';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {boardForm} from './board-fixtures.js';
import {browserKit} from './boards-harness.js';
let kit;before(async()=>{kit=await browserKit({nativeScrollbars:true});});after(async()=>{await kit?.browser.close();});
const settle=h=>h.frame.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const reports=h=>h.page.evaluate(()=>__log.filter(e=>e.kind==='size').length);
async function sized(h,since=0,cap=Infinity){
 const height=await h.frame.evaluate(()=>Math.ceil(document.body.getBoundingClientRect().height));
 await h.page.waitForFunction(({since,height,cap})=>{
  const sizes=__log.filter(e=>e.kind==='size');
  return sizes.length>since&&sizes.at(-1).params.height===height&&document.querySelector('iframe').clientHeight===Math.min(height,cap);
 },{since,height,cap});
 // The size message changes the iframe first; its resize event follows that layout.
 await settle(h);
}
async function insideViewport(h,control){
 const box=await control.boundingBox();assert.ok(box&&box.y>=-1&&box.y+box.height<=901,JSON.stringify(box));
 assert.equal(await control.evaluate(n=>{const r=n.getBoundingClientRect();return r.top>=-1&&r.bottom<=innerHeight+1;}),true,'also inside the frame viewport');
}
async function capture(h,state){
 if(!process.env.FORM_REVIEW_EVIDENCE)return;
 await h.page.screenshot({path:join(process.env.FORM_REVIEW_EVIDENCE,state+'.png')});
 const frame=await h.frame.evaluate(()=>({height:innerHeight,scrollY,focused:document.activeElement?.outerHTML,limit:document.querySelector('.board-limit:not([hidden])')?.textContent}));
 const host=await h.page.evaluate(()=>({scrollY,sizes:__log.filter(e=>e.kind==='size')}));
 writeFileSync(join(process.env.FORM_REVIEW_EVIDENCE,state+'.json'),JSON.stringify({frame,host},null,2)+'\n',{flag:'wx'});
}
for(const name of ['chatgpt','Claude'])test(`last tile ${name} 390: open and close remain visible after the latest host size report`,async()=>{
 const cap=name==='Claude'?5000:Infinity;
 const h=await kit.open(boardForm(),390,'light',{name,autoSize:true,containerDimensions:name==='Claude'?{maxHeight:cap,width:390}:undefined});
 try{
  await sized(h,0,cap);
  const full=h.f.locator('.see-board').last();let since=await reports(h);
  await full.click();await sized(h,since,cap);
  const close=h.f.getByText('Close this board',{exact:true}).first();
  assert.equal(await close.evaluate(n=>document.activeElement===n),true);await insideViewport(h,close);
  await capture(h,name.toLowerCase()+'-390-open');
  since=await reports(h);
  await h.f.getByText('Close this board',{exact:true}).last().click();await sized(h,since,cap);
  assert.equal(await full.evaluate(n=>document.activeElement===n),true);await insideViewport(h,full);
  await capture(h,name.toLowerCase()+'-390-closed');assert.deepEqual(h.errors,[]);
 }finally{await h.context.close();}
});
for(const name of ['chatgpt','Claude'])test(`lower mirror ${name} 390: refused fourth pick explains the limit in view; next board starts in its primary mode`,async()=>{
 const form=boardForm(),cap=name==='Claude'?5000:Infinity;
 const h=await kit.open(form,390,'light',{name,autoSize:true,containerDimensions:name==='Claude'?{maxHeight:cap,width:390}:undefined});
 try{
  await sized(h,0,cap);
  for(let i=0;i<3;i++)await h.f.locator('.boards-tile').nth(i).click();
  let since=await reports(h);await h.f.locator('.see-board').nth(3).click();await sized(h,since,cap);
  const primary=form.questions[0].options[3].board.primaryMode;
  await h.f.locator(`.board-mode-switch[data-mode=${primary==='light'?'dark':'light'}]`).click();
  await settle(h);
  // The line may fit the existing bar without changing the card height.
  await h.f.locator('.board-viewer-end input').click();await sized(h,0,cap);
  const limit=h.f.locator('.board-limit');assert.equal(await limit.innerText(),'Pick up to three.');
  assert.equal(await limit.evaluate(n=>n.parentElement.classList.contains('board-viewer-end')),true);await insideViewport(h,limit);
  assert.equal(await h.f.locator('.board-viewer input:checked').count(),0);
  assert.deepEqual(await h.frame.evaluate(()=>WiserForm.readAnswers()[0].value),form.questions[0].options.slice(0,3).map(o=>o.value));
  await capture(h,name.toLowerCase()+'-390-lower-limit');
  // The same status follows the upper mirror when it is the one just used.
  await h.f.locator('.board-viewer-bar input').first().click();await settle(h);
  assert.equal(await limit.evaluate(n=>n.parentElement===document.querySelector('.board-viewer-bar')),true);await insideViewport(h,limit);
  since=await reports(h);await h.f.getByText('Close this board',{exact:true}).first().click();await sized(h,since,cap);
  since=await reports(h);await h.f.locator('.see-board').nth(4).click();await sized(h,since,cap);
  const nextPrimary=form.questions[0].options[4].board.primaryMode;
  assert.equal(await h.f.locator('.board-mode-switch[aria-pressed=true]').getAttribute('data-mode'),nextPrimary);
  assert.deepEqual(await h.frame.evaluate(()=>[...new Set([...document.querySelectorAll('.board-viewer .board-art>*')].filter(n=>n.getClientRects().length).map(n=>n.dataset.mode))]),[nextPrimary]);
  assert.equal(await limit.isHidden(),true);assert.deepEqual(h.errors,[]);
 }finally{await h.context.close();}
});
async function trackScrolls(h){
 await h.frame.evaluate(()=>{
  window.__scrolls=[];const original=Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView=function(options){__scrolls.push({bar:this.classList.contains('board-viewer-bar'),tile:[...document.querySelectorAll('.board-option')].indexOf(this),block:options?.block});return original.call(this,options);};
 });
}
test('pending scroll repeats: a later open or close cancels the old target, and only a height change repeats once',async()=>{
 const h=await kit.open(boardForm(),390);
 try{
  await trackScrolls(h);
  for(const sequence of ['open-close','close-open','open-open']){
   await h.frame.evaluate(sequence=>{
    const full=document.querySelectorAll('.see-board'),close=()=>document.querySelector('.board-viewer button').click();
    if(sequence==='close-open'){full[11].click();close();full[10].click();}
    else if(sequence==='open-open'){full[11].click();full[10].click();}
    else{full[11].click();close();}
    __scrolls=[];
   },sequence);
   await h.frame.evaluate(()=>dispatchEvent(new Event('resize')));await settle(h);
   assert.deepEqual(await h.frame.evaluate(()=>__scrolls),[],'same-height events leave the repeat pending');
   await h.page.locator('iframe').evaluate(n=>n.style.height=(n.clientHeight-100)+'px');await settle(h);
   const expected=sequence==='open-close'?{bar:false,tile:11,block:'nearest'}:{bar:true,tile:-1,block:'start'};
   assert.deepEqual(await h.frame.evaluate(()=>__scrolls),[expected]);
   await h.page.locator('iframe').evaluate(n=>n.style.height=(n.clientHeight-100)+'px');await settle(h);
   assert.deepEqual(await h.frame.evaluate(()=>__scrolls),[expected],'the repeat is one-shot');
  }
  assert.deepEqual(h.errors,[]);
 }finally{await h.context.close();}
});
test('pending scroll repeat expires when the host never resizes',async()=>{
 const h=await kit.open(boardForm(),390);
 try{
  await trackScrolls(h);await h.f.locator('.see-board').last().click();
  await h.frame.evaluate(()=>{__scrolls=[];return new Promise(resolve=>setTimeout(resolve,1700));});
  await h.page.locator('iframe').evaluate(n=>n.style.height='3000px');await settle(h);
  assert.deepEqual(await h.frame.evaluate(()=>__scrolls),[]);assert.deepEqual(h.errors,[]);
 }finally{await h.context.close();}
});
