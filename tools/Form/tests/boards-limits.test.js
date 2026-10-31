import '../../lib/tests/isolated-home.js';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {boardForm,lookForm} from './board-fixtures.js';
import {browserKit} from './boards-harness.js';
let kit;before(async()=>{kit=await browserKit();});after(async()=>{await kit?.browser.close();});
const deliveries=h=>h.page.evaluate(()=>__log.filter(e=>e.kind==='context'||e.kind==='message'));

async function cannotSubmit(h,button){
 await button.evaluate(n=>{
  const root=document.getElementById('root');root.tabIndex=-1;root.focus();n.focus();n.click();n.form.requestSubmit(n);
 });
 assert.equal(await button.evaluate(n=>document.activeElement===n),false,'disabled submit cannot receive focus');
 await h.page.keyboard.press('Enter');await h.page.keyboard.press('Space');
 // Bypass disabled too: the submit handler must read the actual count.
 await button.evaluate(n=>{n.disabled=false;n.form.requestSubmit(n);n.disabled=true;});
 await h.f.locator('#form').evaluate(n=>n.requestSubmit());
 assert.deepEqual(await deliveries(h),[]);
}

for(const name of ['chatgpt','Claude'])for(const theme of ['light','dark'])for(const source of ['tile','box','top','bottom'])test(`extra ticks ${name} ${theme} through ${source}: fourth and fifth, guarded action, restored line`,async()=>{
 const h=await kit.open(boardForm(),734,theme,{name,autoSize:true,containerDimensions:name==='Claude'?{maxHeight:5000,width:734}:undefined});
 try{
  const more=h.f.locator('[data-action=more]'),lock=h.f.locator('[data-action=lock]');
  for(let i=0;i<3;i++)await h.f.locator('.boards-tile').nth(i).click();
  for(let i=3;i<5;i++){
   if(source==='tile')await h.f.locator('.boards-tile').nth(i).click();
   else if(source==='box')await h.f.locator('.boards-tile .mark').nth(i).click();
   else{
    await h.f.locator('.see-board').nth(i).click();
    const mirrors=h.f.locator('.board-viewer input');await mirrors.nth(source==='top'?0:1).check();
    assert.deepEqual(await mirrors.evaluateAll(nodes=>nodes.map(n=>n.checked)),[true,true]);
   }
   assert.equal(await h.f.locator('.tile-input:checked').count(),i+1);
   assert.equal(await more.isVisible(),true);assert.equal(await more.isDisabled(),true);
   assert.equal(await more.locator('small').innerText(),`You picked ${i+1} boards. Pick up to three to go on.`);
   assert.equal(await h.f.getByText(`You picked ${i+1} boards. Pick up to three to go on.`,{exact:true}).count(),1);
   assert.equal(await lock.isHidden(),true);assert.equal(await h.f.locator('.board-limit').count(),0);
   await cannotSubmit(h,more);
   if(source==='top'||source==='bottom')await h.f.getByText('Close this board',{exact:true}).first().click();
  }
  // Untick with the same control that accepted the extra choices.
  for(let i=4;i>=3;i--){
   if(source==='tile')await h.f.locator('.boards-tile').nth(i).click();
   else if(source==='box')await h.f.locator('.boards-tile .mark').nth(i).click();
   else{
    await h.f.locator('.see-board').nth(i).click();
    const mirrors=h.f.locator('.board-viewer input');await mirrors.nth(source==='top'?0:1).uncheck();
    assert.deepEqual(await mirrors.evaluateAll(nodes=>nodes.map(n=>n.checked)),[false,false]);
    await h.f.getByText('Close this board',{exact:true}).first().click();
   }
  }
  assert.equal(await more.isDisabled(),false);assert.equal(await more.locator('small').innerText(),'Show me variations of these boards');
  assert.equal(await more.evaluate(n=>n.classList.contains('over-limit')),false);
  await more.click();await h.f.locator('#status.ok').waitFor();
  const sent=await deliveries(h);assert.deepEqual(sent.map(e=>e.kind),['context','message']);
  assert.deepEqual(sent[0].params.structuredContent.answers.boards,['board-1','board-2','board-3']);assert.deepEqual(h.errors,[]);
 }finally{await h.context.close();}
});

for(const view of ['board','look'])for(const pick of [1,2,3])test(`Send ${view} pick ${pick}: extra ticks grey Send and restore it below the limit`,async()=>{
 const form=view==='look'?lookForm():boardForm();delete form.actions;
 form.questions[0].pick=pick;delete form.questions[0].min;
 const h=await kit.open(form);try{
  const send=h.f.locator('#submit'),line=h.f.locator('#send-limit');
  const original=await send.innerText();
  for(let i=0;i<=pick;i++)await h.f.locator('.boards-tile').nth(i).click();
  assert.equal(await send.isDisabled(),true);assert.equal(await send.getAttribute('class'),'over-limit');
  assert.equal(await line.innerText(),`You picked ${pick+1} ${view==='look'?'looks':'boards'}. Pick up to ${['','one','two','three'][pick]} to go on.`);
  assert.equal(await send.innerText(),original);await cannotSubmit(h,send);
  await h.f.locator('.boards-tile').nth(pick).click();assert.equal(await send.isDisabled(),false);assert.equal(await line.isHidden(),true);
  await send.click();await h.f.locator('#status.ok').waitFor();assert.equal((await deliveries(h)).length,2);assert.deepEqual(h.errors,[]);
 }finally{await h.context.close();}
});

for(const name of ['chatgpt','Claude'])for(const theme of ['light','dark'])test(`full-size link ${name} ${theme}: close text, 44px target, outside picking label`,async()=>{
 const h=await kit.open(boardForm(),734,theme,{name});try{
  const links=await h.f.locator('.see-board').evaluateAll(nodes=>nodes.map(n=>{
   const range=document.createRange();range.selectNodeContents(n);
   return {gap:range.getBoundingClientRect().top-n.previousElementSibling.getBoundingClientRect().bottom,height:n.getBoundingClientRect().height,insideLabel:Boolean(n.closest('label'))};
  }));
  assert.equal(links.length,12);for(const link of links){assert.ok(link.gap>=0&&link.gap<=8,JSON.stringify(link));assert.ok(link.height>=44);assert.equal(link.insideLabel,false);}
  await h.f.locator('.see-board').first().click();assert.equal(await h.f.locator('.tile-input:checked').count(),0);assert.deepEqual(h.errors,[]);
 }finally{await h.context.close();}
});

test('every matching action greys above pick; other needs hide and caller notes return',async()=>{
 const form=boardForm();form.actions=[
  {value:'any',label:'Another round',needs:'any',notes:{several:''}},
  {value:'some',label:'Use them',needs:'some',note:'Caller line'},
  {value:'one',label:'Keep one',needs:'one',note:'Caller single'}
 ];
 const h=await kit.open(form);try{
  for(let i=0;i<4;i++)await h.f.locator('.boards-tile').nth(i).click();
  assert.equal(await h.f.locator('.board-actions button:visible').count(),2);
  for(const value of ['any','some']){
   const button=h.f.locator(`[data-action=${value}]`);assert.equal(await button.isDisabled(),true);
   assert.equal(await button.locator('small').innerText(),'You picked 4 boards. Pick up to three to go on.');
  }
  assert.equal(await h.f.locator('[data-action=one]').isHidden(),true);
  await h.f.locator('.boards-tile').nth(3).click();
  assert.equal(await h.f.locator('[data-action=any] small').isHidden(),true);
  assert.equal(await h.f.locator('[data-action=some] small').innerText(),'Caller line');
  assert.equal(await h.f.locator('.board-actions button:visible:disabled').count(),0);assert.deepEqual(h.errors,[]);
 }finally{await h.context.close();}
});

test('paged Send shows its limit line only with Send and keeps it through Back',async()=>{
 const form=lookForm();form.paged=true;form.questions.push({id:'comment',type:'text',label:'Anything else?'});
 const h=await kit.open(form);try{
  for(let i=0;i<4;i++)await h.f.locator('.looks-tile').nth(i).click();
  const send=h.f.locator('#submit'),line=h.f.locator('#send-limit');assert.equal(await line.isHidden(),true);
  await h.f.locator('#next').click();assert.equal(await send.isVisible(),true);assert.equal(await send.isDisabled(),true);
  assert.equal(await line.innerText(),'You picked 4 looks. Pick up to three to go on.');
  await h.f.locator('#back').click();assert.equal(await line.isHidden(),true);
  await h.f.locator('.looks-tile').nth(3).click();await h.f.locator('#next').click();
  assert.equal(await send.isDisabled(),false);assert.equal(await line.isHidden(),true);assert.deepEqual(h.errors,[]);
 }finally{await h.context.close();}
});
