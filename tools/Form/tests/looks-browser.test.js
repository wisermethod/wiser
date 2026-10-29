import '../../lib/tests/isolated-home.js';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {lookForm,boardForm,tapSets} from './board-fixtures.js';
import {browserKit,onlyFonts} from './boards-harness.js';
let kit;before(async()=>{kit=await browserKit();});after(async()=>{await kit?.browser.close();});
for(const [name,get]of Object.entries(tapSets))for(const width of [390,734])for(const theme of ['light','dark'])test(`looks ${name} ${width} ${theme}: structure, minimum, cap and delivery`,async()=>{
 const form=lookForm(get()),h=await kit.open(form,width,theme,{touch:true});
 try{
  const tiles=h.f.locator('.looks-tile'),send=h.f.locator('#submit'),minimum=h.f.locator('.board-minimum');
  assert.equal(await tiles.count(),8);assert.equal(await h.f.locator('h1.progress').innerText(),form.title);
  assert.equal(await h.f.locator('.see-board,.board-recommendation,.board-viewer,.brand-board').count(),0);
  assert.equal(await send.isDisabled(),true);assert.equal(await minimum.innerText(),'Pick at least two.');
  const geometry=await h.frame.evaluate(()=>({
   columns:getComputedStyle(document.querySelector('.looks-tiles')).gridTemplateColumns.split(' ').length,
   overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
   looks:[...document.querySelectorAll('.look-art')].map(n=>({box:n.getAttribute('viewBox'),ratio:n.getBoundingClientRect().width/n.getBoundingClientRect().height,name:[...n.querySelectorAll('.look-name text')].map(n=>n.textContent).join(' '),family:n.querySelector('.look-name').style.fontFamily,marks:n.querySelectorAll('.look-mark').length,patterns:n.querySelectorAll('.look-pattern').length})),
   marks:[...document.querySelectorAll('.looks-tile')].map(n=>n.querySelector('.mark').getBoundingClientRect().top>=n.querySelector('.look-art').getBoundingClientRect().bottom),
   captionHeights:[...document.querySelectorAll('.looks-tile .tile-label')].map(n=>n.getBoundingClientRect().height)
  }));
  assert.equal(geometry.columns,width>=734?4:2);assert.equal(geometry.overflow,0);
  assert.ok(geometry.looks.every(n=>n.box==='0 0 600 360'&&Math.abs(n.ratio-600/360)<.01&&n.name===form.brand.name&&n.family&&n.marks===1&&n.patterns===1));
  assert.ok(geometry.marks.every(Boolean));assert.ok(geometry.captionHeights.every(n=>n>=44));
  await tiles.nth(0).tap();assert.equal(await send.isDisabled(),true);
  await h.f.locator('form').evaluate(n=>n.requestSubmit());assert.equal((await h.page.evaluate(()=>window.__log.filter(e=>e.kind==='message'))).length,0);
  await tiles.nth(1).tap();assert.equal(await send.isDisabled(),false);assert.equal(await minimum.isVisible(),false);
  await tiles.nth(2).tap();await tiles.nth(3).tap();
  assert.deepEqual(await h.frame.evaluate(()=>WiserForm.readAnswers()[0].value),form.questions[0].options.slice(0,3).map(o=>o.value));
  assert.equal(await h.f.locator('.board-limit').innerText(),'Pick up to three.');
  await tiles.nth(2).tap();await tiles.nth(1).tap();assert.equal(await send.isDisabled(),true);assert.equal(await minimum.isVisible(),true);
  await tiles.nth(1).tap();await send.tap();await h.f.locator('#status.ok').waitFor();
  const sent=await h.page.evaluate(()=>window.__log.filter(e=>['context','message'].includes(e.kind)));
  assert.deepEqual(sent.map(e=>e.kind),['context','message']);assert.deepEqual(sent[0].params.structuredContent.answers.looks,form.questions[0].options.slice(0,2).map(o=>o.value));
  assert.ok(onlyFonts(h.requests));assert.deepEqual(h.errors,[]);
 }finally{await h.context.close();}
});
test('look captions default to Look n, retain supplied labels, and keyboard picks respect pick 2',async()=>{
 const form=lookForm();form.questions[0].pick=2;delete form.questions[0].options[0].label;form.questions[0].options[1].label='My second look';
 const h=await kit.open(form);try{
  assert.equal(await h.f.locator('.tile-label').first().innerText(),'Look 1');assert.equal(await h.f.locator('.tile-label').nth(1).innerText(),'My second look');
  for(const [i,key]of [[0,'Space'],[1,'Enter'],[2,'Space']]){await h.f.locator('.tile-input').nth(i).focus();await h.page.keyboard.press(key);}
  assert.equal(await h.f.locator('.board-limit').innerText(),'Pick up to 2.');
  assert.equal(await h.f.locator('.tile-input:checked').count(),2);
  assert.equal(await h.frame.evaluate(()=>WiserForm.readAnswers()[0].shown),'Look 1, My second look');
 }finally{await h.context.close();}
});
test('minimum applies to some action while any, none and one keep their meanings',async()=>{
 const form=lookForm();form.actions=[{value:'use',label:'Use these',needs:'some'},{value:'stop',label:'Stop for now',needs:'any'},{value:'empty',label:'Start again',needs:'none'}];
 const h=await kit.open(form);try{
  const use=h.f.locator('[data-action=use]'),stop=h.f.locator('[data-action=stop]'),empty=h.f.locator('[data-action=empty]');
  assert.equal(await use.isDisabled(),true);assert.equal(await stop.isDisabled(),false);assert.equal(await empty.isDisabled(),false);
  await h.f.locator('.looks-tile').nth(0).click();assert.equal(await use.isDisabled(),true);assert.equal(await empty.isDisabled(),true);
  await h.f.locator('.looks-tile').nth(1).click();assert.equal(await use.isDisabled(),false);
  await use.click();await h.f.locator('#status.ok').waitFor();
 }finally{await h.context.close();}
});
test('whole boards use a progress title and honour an explicit minimum too',async()=>{
 const form=boardForm();delete form.actions;form.questions[0].min=2;
 const h=await kit.open(form);try{
  assert.equal(await h.f.locator('h1.progress').innerText(),form.title);assert.equal(await h.f.locator('#submit').isDisabled(),true);
  await h.f.locator('.boards-tile').nth(0).click();assert.equal(await h.f.locator('#submit').isDisabled(),true);
  await h.f.locator('.boards-tile').nth(1).click();assert.equal(await h.f.locator('#submit').isDisabled(),false);
 }finally{await h.context.close();}
});
test('paged looks fit the name when their initially hidden question becomes visible',async()=>{
 const form=lookForm();form.paged=true;form.questions.unshift({id:'before',type:'radio',label:'Ready?',options:[{value:'yes',label:'Yes'},{value:'later',label:'Later'}]});
 const h=await kit.open(form,390);try{
  await h.f.locator('#next').click();
  const names=await h.frame.evaluate(()=>[...document.querySelectorAll('.look-name')].map(n=>{const box=n.getBBox();return {width:box.width,height:box.height,size:parseFloat(n.style.fontSize)};}));
  // The prototype's name field is 300px wide; glyph ink can extend beyond its 294px advance width.
  assert.ok(names.every(n=>n.size>10&&n.width>0&&n.width<=300&&n.height<=210));
  assert.match(await h.f.locator('h1.progress').innerText(),/2 of 2$/);assert.deepEqual(h.errors,[]);
 }finally{await h.context.close();}
});
