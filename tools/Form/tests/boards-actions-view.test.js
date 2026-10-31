import '../../lib/tests/isolated-home.js';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {boardForm} from './board-fixtures.js';
import {browserKit} from './boards-harness.js';
let kit;before(async()=>{kit=await browserKit({nativeScrollbars:true});});after(async()=>{await kit?.browser.close();});
const countLines=['None of these work','Show me variations of this board','Show me variations of these boards','Show me variations of these boards'];
const geometry=h=>h.frame.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth,body:document.body.scrollWidth}));
for(const name of ['chatgpt','Claude'])for(const width of [734,390])for(const theme of ['light','dark'])test(`actions ${name} ${width} ${theme}: 0/1/2/3 picks, lines, layout, focus and refused submission`,async()=>{
 const h=await kit.open(boardForm(),width,theme,{name,autoSize:true,containerDimensions:name==='Claude'?{maxHeight:5000,width}:undefined});
 try{
  const more=h.f.locator('[data-action=more]'),lock=h.f.locator('[data-action=lock]');
  for(let count=0;count<=3;count++){
   if(count)await h.f.locator('.boards-tile').nth(count-1).click();
   assert.equal(await more.isVisible(),true);assert.equal(await more.locator('small').innerText(),countLines[count]);
   assert.equal(await lock.isVisible(),count===1);assert.equal(await lock.isDisabled(),false,'unmet actions are hidden, never greyed');
   if(count===1){
    assert.equal(await lock.locator('small').innerText(),'and finish my brand');
    const a=await more.boundingBox(),b=await lock.boundingBox();
    if(width>=560){assert.equal(a.y,b.y);assert.ok(a.x<b.x);}else assert.ok(b.y>=a.y+a.height);
   }else{
    assert.equal(await lock.evaluate(n=>n.getClientRects().length),0,'hidden action takes no space or accessibility-tree position');
    assert.doesNotMatch(await h.f.locator('.board-actions').ariaSnapshot(),/Lock this board in/);
    await more.focus();await h.page.keyboard.press('Tab');assert.equal(await lock.evaluate(n=>document.activeElement===n),false);
    await lock.evaluate(n=>n.form.requestSubmit(n));
    assert.equal((await h.page.evaluate(()=>window.__log.filter(e=>e.kind==='message'))).length,0);
    const a=await more.boundingBox(),row=await h.f.locator('.board-actions').boundingBox();assert.equal(a.width,row.width,'one action deliberately fills the row');
   }
   await more.focus();await h.page.keyboard.press('Shift+Tab');await h.page.keyboard.press('Tab');
   assert.equal(await more.evaluate(n=>getComputedStyle(n).outlineStyle),'solid');
   assert.ok((await more.boundingBox()).height>=44);
   const contrast=await more.locator('small').evaluate(n=>{
    const lum=s=>s.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
    const a=lum(getComputedStyle(n).color),b=lum(getComputedStyle(n.parentElement).backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
   });assert.ok(contrast>=4.5,String(contrast));
   const g=await geometry(h);assert.ok(g.scroll<=g.client&&g.body<=g.client,JSON.stringify(g));
  }
  assert.deepEqual(h.errors,[]);
 }finally{await h.context.close();}
});
for(const name of ['chatgpt','Claude'])for(const width of [734,390])for(const capped of [false,true])for(const row of [0,2])test(`viewer ${name} ${width} cap ${capped} row ${row+1}: all tiles step aside, one mode, scroll, mirrored picks and close`,async()=>{
 const form=boardForm(),h=await kit.open(form,width,capped?'dark':'light',{name,autoSize:true,containerDimensions:capped?{maxHeight:5000,width}:undefined});
 try{
  await h.frame.evaluate(()=>{
   window.__scrolls=[];const original=Element.prototype.scrollIntoView;
   Element.prototype.scrollIntoView=function(options){__scrolls.push({bar:this.classList.contains('board-viewer-bar'),tile:[...document.querySelectorAll('.board-option')].indexOf(this),options});return original.call(this,options);};
  });
  const index=row*(width>=560?2:1),full=h.f.locator('.see-board').nth(index),options=h.f.locator('.board-option');
  await h.f.locator('.boards-tile').nth(index).click();await full.click();
  assert.equal(await h.f.locator('.boards-tiles').evaluate(n=>n.firstElementChild.classList.contains('board-viewer')),true);
  assert.equal(await options.count(),12);assert.equal(await h.f.locator('.board-option:visible').count(),0);
  assert.equal(await options.evaluateAll(nodes=>nodes.every(n=>n.hidden)),true);
  assert.equal(await full.getAttribute('aria-expanded'),'true');
  assert.equal(await h.f.locator('.board-mode-switches').count(),1);
  const primary=form.questions[0].options[index].board.primaryMode,other=primary==='light'?'dark':'light';
  const shown=()=>h.frame.evaluate(()=>[...new Set([...document.querySelectorAll('.board-viewer .board-art>*')].filter(n=>n.getClientRects().length).map(n=>n.dataset.mode))]);
  assert.deepEqual(await shown(),[primary]);
  assert.equal(await h.f.locator('.board-mode-switch[aria-pressed=true]').getAttribute('data-mode'),primary);
  assert.ok((await h.frame.evaluate(()=>__scrolls)).some(s=>s.bar&&s.options.block==='start'));
  const top=await h.f.getByText('Close this board',{exact:true}).first().boundingBox();assert.ok(top.y>=0&&top.y+top.height<=900,JSON.stringify(top));
  await h.f.locator(`.board-mode-switch[data-mode=${other}]`).click();assert.deepEqual(await shown(),[other]);
  const mirrors=h.f.locator('.board-viewer input');assert.equal(await mirrors.count(),2);
  assert.equal(await mirrors.evaluateAll(nodes=>nodes.every(n=>n.checked&&!n.hasAttribute('name')&&!n.hasAttribute('value'))),true);
  await mirrors.first().uncheck();assert.equal(await mirrors.last().isChecked(),false);assert.equal(await h.f.locator('.tile-input').nth(index).isChecked(),false);
  await mirrors.last().check();assert.equal(await mirrors.first().isChecked(),true);
  assert.deepEqual(await h.frame.evaluate(()=>WiserForm.readAnswers()[0].value),[form.questions[0].options[index].value]);
  await h.f.getByText('Close this board',{exact:true})[row?'last':'first']().click();
  assert.equal(await h.f.locator('.board-viewer').count(),0);assert.equal(await h.f.locator('.board-option:visible').count(),12);
  assert.equal(await full.getAttribute('aria-expanded'),'false');assert.equal(await full.evaluate(n=>document.activeElement===n),true);
  assert.equal(await h.f.locator('.tile-input').nth(index).isChecked(),true);
  assert.ok((await h.frame.evaluate(()=>__scrolls)).some(s=>s.tile===index&&s.options.block==='nearest'));
  const tile=await options.nth(index).boundingBox();assert.ok(tile.y>=-1&&tile.y+tile.height<=901,JSON.stringify(tile));
  assert.deepEqual(h.errors,[]);
 }finally{await h.context.close();}
});
for(const name of ['chatgpt','Claude'])for(const width of [734,390])for(const theme of ['light','dark'])test(`sideways ${name} ${width} ${theme}: tiles, picks, viewer, modes, unguarded live resizing`,async()=>{
 const h=await kit.open(boardForm(),width,theme,{name,autoSize:true,containerDimensions:name==='Claude'?{maxHeight:5000,width}:undefined});
 try{
  // Force overflow visible so a future document guard cannot conceal a regression.
  await h.frame.evaluate(()=>{const style=document.createElement('style');style.textContent='html,body{overflow-x:visible!important}';document.head.append(style);window.__widths=[];const sample=()=>{__widths.push([document.documentElement.scrollWidth,document.documentElement.clientWidth]);requestAnimationFrame(sample);};sample();});
  for(let count=0;count<3;count++){await h.f.locator('.boards-tile').nth(count).click();const g=await geometry(h);assert.ok(g.scroll<=g.client,JSON.stringify(g));}
  await h.f.locator('.see-board').first().click();
  for(const mode of ['light','dark']){const button=h.f.locator(`.board-mode-switch[data-mode=${mode}]`);if(await button.count())await button.click();}
  for(const height of [900,5000,2000]){await h.page.locator('iframe').evaluate((n,height)=>n.style.height=height+'px',height);await h.frame.evaluate(()=>new Promise(requestAnimationFrame));const g=await geometry(h);assert.ok(g.scroll<=g.client,JSON.stringify(g));}
  await h.f.getByText('Close this board',{exact:true}).first().click();
  // A real scrollbar gutter reduces the available content width by 15px, unlike headless overlay scrollbars.
  await h.frame.evaluate(()=>document.documentElement.style.scrollbarGutter='stable');
  const g=await geometry(h);assert.ok(g.scroll<=g.client&&g.body<=g.client,JSON.stringify(g));
  assert.equal(await h.frame.evaluate(()=>__widths.some(([scroll,client])=>scroll>client)),false);
  assert.deepEqual(h.errors,[]);
 }finally{await h.context.close();}
});
test('action note fallback, empty override and labels never supply engine-owned copy',async()=>{
 const form=boardForm();form.actions=[{value:'more',label:'One more round',needs:'any',note:'Caller default',notes:{one:'',several:'Caller several'}},{value:'lock',label:'Lock it',needs:'one',note:'Caller lock'}];
 const h=await kit.open(form);try{
  const note=h.f.locator('[data-action=more] small');assert.equal(await note.innerText(),'Caller default');
  await h.f.locator('.boards-tile').nth(0).click();assert.equal(await note.isHidden(),true);assert.equal(await h.f.locator('[data-action=lock] small').innerText(),'Caller lock');
  await h.f.locator('.boards-tile').nth(1).click();assert.equal(await note.innerText(),'Caller several');
 }finally{await h.context.close();}
});
