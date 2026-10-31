import '../../lib/tests/isolated-home.js';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {boardForm} from './board-fixtures.js';
import {browserKit,onlyFonts} from './boards-harness.js';
let kit;before(async()=>{kit=await browserKit();});after(async()=>{await kit?.browser.close();});
const picks=h=>h.frame.evaluate(()=>WiserForm.readAnswers()[0].value);
// No part of the card scrolls on its own: the card is as tall as what it shows, and the host grows it.
const ownScroll=h=>h.frame.evaluate(()=>[...document.querySelectorAll('#root,#root *')].filter(n=>/auto|scroll/.test(getComputedStyle(n).overflowY)&&n.scrollHeight>n.clientHeight+1).length);
const rootHeight=h=>h.f.locator('#root').evaluate(n=>n.getBoundingClientRect().height);
const reported=h=>h.page.evaluate(()=>window.__log.filter(e=>e.kind==='size').at(-1)?.params.height);
for(const width of [390,734])for(const theme of ['light','dark'])test(`boards ${width} ${theme}: tap, cap, action, full viewer, one scroll, picks and transport`,async()=>{
 const form=boardForm(),h=await kit.open(form,width,theme,{touch:true});
 try{
  assert.equal(await h.f.locator('button[data-action=lock]').isHidden(),true);
  assert.match(await h.f.locator('button[data-action=more]').innerText(),/None of these work/);
  const tiles=h.f.locator('.boards-tile');await tiles.nth(0).tap();assert.deepEqual(await picks(h),['board-1']);
  assert.equal(await h.f.locator('button[data-action=lock]').isDisabled(),false);
  await tiles.nth(1).tap();await tiles.nth(2).tap();await tiles.nth(3).tap();assert.deepEqual(await picks(h),['board-1','board-2','board-3']);
  assert.equal(await h.f.locator('.board-limit').innerText(),'Pick up to three.');assert.equal(await h.f.locator('button[data-action=lock]').isHidden(),true);
  const height=await rootHeight(h),gridHeight=()=>h.f.locator('.boards-tiles').evaluate(n=>n.getBoundingClientRect().height),closed=await gridHeight();
  assert.equal(await ownScroll(h),0,'twelve boards and the actions sit in the card with no scroll of their own');
  assert.ok(height>1500,'the card is as tall as its twelve boards');
  await h.page.waitForFunction(min=>window.__log.some(e=>e.kind==='size'&&e.params.height>=min),Math.floor(height));
  await h.f.locator('.see-board').nth(1).tap();
  assert.equal(await h.f.locator('.board-viewer').isVisible(),true);
  assert.equal(await h.f.locator('.see-board').nth(1).getAttribute('aria-expanded'),'true');
  assert.equal(await h.f.locator('.boards-tile').nth(1).isHidden(),true,'every tile steps aside');
  const open=await rootHeight(h);assert.ok(open>500,'the open board determines card height');
  assert.equal(await ownScroll(h),0,'the open board has no scroll of its own');
  await h.page.waitForFunction(min=>window.__log.filter(e=>e.kind==='size').at(-1)?.params.height>=min,Math.floor(open));
  assert.equal(await h.f.locator('.board-viewer input').first().isChecked(),true);
  await h.f.locator('.board-viewer input').first().uncheck();
  await h.f.locator('.board-viewer-end').getByText('Close this board',{exact:true}).tap();assert.deepEqual(await picks(h),['board-1','board-3']);
  assert.equal(await h.f.locator('.board-viewer').count(),0);
  assert.equal(await h.f.locator('.see-board').nth(1).getAttribute('aria-expanded'),'false');
  assert.equal(await gridHeight(),closed,'closing gives the grid back its own height');
  await tiles.nth(2).tap();assert.equal(await h.f.locator('button[data-action=lock]').isDisabled(),false);
  await h.f.locator('button[data-action=lock]').tap();await h.f.locator('#status.ok').waitFor();
  const log=await h.page.evaluate(()=>window.__log),sent=log.filter(e=>['context','message'].includes(e.kind));
  assert.deepEqual(sent.map(e=>e.kind),['context','message']);assert.deepEqual(sent[0].params.structuredContent.answers,{boards:['board-1']});assert.equal(sent[0].params.structuredContent.action,'lock');assert.match(sent[1].params.content[0].text,/What next: Lock this board in/);
  assert.ok(onlyFonts(h.requests));assert.ok(h.requests.length);assert.deepEqual(h.errors,[]);
  assert.equal(log.some(e=>e.kind.toLowerCase().includes('display')),false);
 }finally{await h.context.close();}
});
test('a whole board under a host height cap shows one mode at a time; without one, both and no controls',async()=>{
 for(const shape of ['display','single']){
  const form=boardForm();form.questions[0].options.length=1;
  if(shape==='display'){form.questions[0].pick=0;delete form.actions;}else form.questions[0].pick=1;
  const h=await kit.open(form,734,'light',{touch:true,containerDimensions:{maxHeight:5000,width:734}});
  try{
   assert.equal(await h.f.locator('.board-mode-switches').count(),1,shape);
   assert.ok(await rootHeight(h)<=5000,`${shape} fits under the cap`);
   const shown=()=>h.frame.evaluate(()=>[...new Set([...document.querySelectorAll('fieldset>.board-art>*')].filter(n=>n.getClientRects().length).map(n=>n.dataset.mode))]);
   const [primary]=await shown();assert.equal((await shown()).length,1);
   const other=primary==='light'?'dark':'light';
   await h.f.locator(`.board-mode-switch[data-mode=${other}]`).tap();assert.deepEqual(await shown(),[other]);
   assert.equal((await h.page.evaluate(()=>window.__log.filter(e=>['context','message'].includes(e.kind)))).length,0,'the switch sends nothing');
   if(shape==='single')assert.deepEqual(await picks(h),['board-1']);
   assert.deepEqual(h.errors,[]);
  }finally{await h.context.close();}
 }
});
test('the open board\'s mirrored pick is never read as an answer, even beside an option valued on',async()=>{
 const form=boardForm();form.questions[0].options[2].value='on';
 const h=await kit.open(form,734,'light',{touch:true});
 try{
  await h.f.locator('.boards-tile').nth(0).tap();await h.f.locator('.see-board').nth(0).tap();
  assert.equal(await h.f.locator('.board-viewer input').first().isChecked(),true);
  assert.deepEqual(await picks(h),['board-1']);
  assert.equal(await h.f.locator('button[data-action=lock]').isDisabled(),false,'one real pick: Lock it is open');
 }finally{await h.context.close();}
});
test('one-pick round refuses a second pick; sole tuned board starts picked',async()=>{
 const form=boardForm();form.questions[0].pick=1;form.questions[0].options.length=3;
 const h=await kit.open(form);try{await h.f.locator('.boards-tile').nth(0).click();await h.f.locator('.boards-tile').nth(1).click();assert.deepEqual(await picks(h),['board-1']);assert.equal(await h.f.locator('.board-limit').innerText(),'Pick up to 1.');}finally{await h.context.close();}
 form.questions[0].options.length=1;const single=await kit.open(form);try{assert.deepEqual(await picks(single),['board-1']);assert.equal(await single.f.locator('legend').isVisible(),false);assert.equal(await single.f.locator('.brand-board').count(),2);assert.equal(await single.f.locator('button[data-action=lock]').isDisabled(),false);}finally{await single.context.close();}
});
test('pick 0 is whole and display-only; it sends nothing, including implicit form submit',async()=>{
 const form=boardForm();form.questions[0].pick=0;form.questions[0].options.length=1;delete form.actions;
 const h=await kit.open(form);try{
  assert.equal(await h.f.locator('input,button').count(),0);assert.equal(await h.f.locator('.brand-board').count(),2);
  assert.equal(await h.f.locator('legend').isVisible(),false);
  await h.f.locator('form').evaluate(n=>n.requestSubmit());
  assert.equal((await h.page.evaluate(()=>window.__log.filter(e=>['context','message'].includes(e.kind)))).length,0);assert.ok(onlyFonts(h.requests));assert.deepEqual(h.errors,[]);
 }finally{await h.context.close();}
});
test('failed fonts leave the board in a generic face of the same kind, with no other fetch',async()=>{
 const form=boardForm(),h=await kit.open(form,390,'dark',{failFonts:true});try{
  assert.ok(onlyFonts(h.requests));assert.ok(h.requests.length);assert.ok(await h.f.locator('.brand-headline').first().evaluate(n=>/serif/.test(getComputedStyle(n).fontFamily)));assert.deepEqual(h.errors,[]);
 }finally{await h.context.close();}
});
test('board controls have 44px targets, caption marks, focus and 4.5:1 chrome in both themes',async()=>{
 for(const theme of ['light','dark']){const h=await kit.open(boardForm(),734,theme);try{
  const r=await h.frame.evaluate(()=>{
   const lum=s=>s.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
   const bg=e=>{for(let p=e;p;p=p.parentElement){const c=getComputedStyle(p).backgroundColor;if(c!=='rgba(0, 0, 0, 0)'&&c!=='transparent')return c;}return getComputedStyle(document.body).backgroundColor;};
   return {overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,heights:[...document.querySelectorAll('button,.boards-tile')].filter(n=>n.getClientRects().length).map(n=>n.getBoundingClientRect().height),contrast:[...document.querySelectorAll('h1,legend,.tile-label *,.board-actions *,.see-board')].filter(n=>n.getClientRects().length&&n.textContent.trim()).map(n=>{const a=lum(getComputedStyle(n).color),b=lum(bg(n));return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);}),marks:[...document.querySelectorAll('.boards-tile')].map(n=>({picture:n.querySelector('.board-crop').getBoundingClientRect().bottom,mark:n.querySelector('.mark').getBoundingClientRect().top}))};
  });assert.equal(r.overflow,0);assert.ok(r.heights.every(h=>h>=44));assert.ok(r.contrast.every(c=>c>=4.5),JSON.stringify(r));assert.ok(r.marks.every(m=>m.mark>=m.picture+2));
  await h.f.locator('.tile-input').first().focus();await h.page.keyboard.press('Space');assert.deepEqual(await picks(h),['board-1']);
  assert.equal(await h.f.locator('.boards-tile').first().evaluate(n=>getComputedStyle(n).outlineStyle),'solid');
 }finally{await h.context.close();}}
});
test('page safety and inline-only host: no display-mode request exists in shipped board scripts',()=>{
 for(const path of ['../engine/engine.js','../engine/boards.js','../engine/chat.js'])assert.doesNotMatch(readFileSync(new URL(path,import.meta.url),'utf8'),/requestDisplayMode/);
 assert.ok(kit.pageBytes<2000000);assert.doesNotMatch(kit.html,/innerHTML|outerHTML|insertAdjacentHTML|\b(?:src|href)\s*=/);
});
