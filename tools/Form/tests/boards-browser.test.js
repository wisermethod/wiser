import '../../lib/tests/isolated-home.js';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {boardForm} from './board-fixtures.js';
import {browserKit,onlyFonts} from './boards-harness.js';
let kit;before(async()=>{kit=await browserKit();});after(async()=>{await kit?.browser.close();});
const picks=h=>h.frame.evaluate(()=>WiserForm.readAnswers()[0].value);
for(const width of [390,734])for(const theme of ['light','dark'])test(`boards ${width} ${theme}: tap, cap, action, viewer height, picks and transport`,async()=>{
 const form=boardForm(),h=await kit.open(form,width,theme,{touch:true});
 try{
  assert.equal(await h.f.locator('button[data-action=lock]').isDisabled(),true);
  assert.match(await h.f.locator('button[data-action=round]').innerText(),/None of these: try another angle/);
  const tiles=h.f.locator('.boards-tile');await tiles.nth(0).tap();assert.deepEqual(await picks(h),['board-1']);
  assert.equal(await h.f.locator('button[data-action=lock]').isDisabled(),false);
  await tiles.nth(1).tap();await tiles.nth(2).tap();await tiles.nth(3).tap();assert.deepEqual(await picks(h),['board-1','board-2','board-3']);
  assert.equal(await h.f.locator('.board-limit').innerText(),'Pick up to three.');assert.equal(await h.f.locator('button[data-action=lock]').isDisabled(),true);
  const height=await h.f.locator('#root').evaluate(n=>n.getBoundingClientRect().height);
  assert.ok(height<=675,'card within three quarters of screen');
  await h.f.locator('.see-board').nth(1).tap();
  assert.equal(await h.f.locator('.board-viewer').isVisible(),true);
  assert.equal(await h.f.locator('#root').evaluate(n=>n.getBoundingClientRect().height),height);
  assert.equal(await h.f.locator('.board-viewer input').isChecked(),true);
  const scroll=h.f.locator('.board-viewer-scroll');assert.ok(await scroll.evaluate(n=>n.scrollHeight>n.clientHeight));
  await scroll.evaluate(n=>n.scrollTop=1000);await h.f.locator('.board-viewer input').uncheck();
  await h.f.getByText('Back to the boards',{exact:true}).tap();assert.deepEqual(await picks(h),['board-1','board-3']);
  assert.equal(await h.f.locator('#root').evaluate(n=>n.getBoundingClientRect().height),height);
  await tiles.nth(2).tap();assert.equal(await h.f.locator('button[data-action=lock]').isDisabled(),false);
  await h.f.locator('button[data-action=lock]').tap();await h.f.locator('#status.ok').waitFor();
  const log=await h.page.evaluate(()=>window.__log),sent=log.filter(e=>['context','message'].includes(e.kind));
  assert.deepEqual(sent.map(e=>e.kind),['context','message']);assert.deepEqual(sent[0].params.structuredContent.answers,{boards:['board-1']});assert.equal(sent[0].params.structuredContent.action,'lock');assert.match(sent[1].params.content[0].text,/What next: Lock it/);
  assert.ok(onlyFonts(h.requests));assert.ok(h.requests.length);assert.deepEqual(h.errors,[]);
  assert.equal(log.some(e=>e.kind.toLowerCase().includes('display')),false);
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
