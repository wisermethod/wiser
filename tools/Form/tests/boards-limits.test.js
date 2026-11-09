import '../../lib/tests/isolated-home.js';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {boardForm,lookForm,lookActions} from './board-fixtures.js';
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

for(const name of ['chatgpt','Claude'])for(const theme of ['light','dark'])for(const source of ['pointer','keyboard','top','bottom'])test(`extra ticks ${name} ${theme} through ${source}: fourth and fifth, guarded action, restored line`,async()=>{
 const h=await kit.open(boardForm(),734,theme,{name,autoSize:true,containerDimensions:name==='Claude'?{maxHeight:5000,width:734}:undefined});
 try{
  const more=h.f.locator('[data-action=more]'),lock=h.f.locator('[data-action=lock]');
  for(let i=0;i<3;i++)await h.f.locator('.looks-tile, .boards-tile:not(.looks-tile) .tile-input').nth(i).click();
  for(let i=3;i<5;i++){
   if(source==='pointer')await h.f.locator('.looks-tile, .boards-tile:not(.looks-tile) .tile-input').nth(i).click();
   else if(source==='keyboard')await h.f.locator('.tile-input').nth(i).press('Space');
   else{
    await h.f.locator('.board-thumbnail').nth(i).click();
    const mirrors=h.f.locator('.board-viewer input');await mirrors.nth(source==='top'?0:1).check();
    assert.deepEqual(await mirrors.evaluateAll(nodes=>nodes.map(n=>n.checked)),[true,true]);
   }
   assert.equal(await h.f.locator('.tile-input:checked').count(),i+1);
   assert.equal(await more.isVisible(),true);assert.equal(await more.isDisabled(),true);
   assert.equal(await more.locator('small').innerText(),`You picked ${i+1} boards. Pick up to three to go on.`);
   assert.equal(await h.f.getByText(`You picked ${i+1} boards. Pick up to three to go on.`,{exact:true}).count(),2);
   assert.equal(await h.f.locator('#send-limit').getAttribute('class'),'send-limit help visually-hidden');
   assert.equal(await lock.isHidden(),true);assert.equal(await h.f.locator('.board-limit').count(),0);
   await cannotSubmit(h,more);
   if(source==='top'||source==='bottom')await h.f.getByText('Close this board',{exact:true}).first().click();
  }
  // Untick with the same control that accepted the extra choices.
  for(let i=4;i>=3;i--){
   if(source==='pointer')await h.f.locator('.looks-tile, .boards-tile:not(.looks-tile) .tile-input').nth(i).click();
   else if(source==='keyboard')await h.f.locator('.tile-input').nth(i).press('Space');
   else{
    await h.f.locator('.board-thumbnail').nth(i).click();
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
  for(let i=0;i<=pick;i++)await h.f.locator('.looks-tile, .boards-tile:not(.looks-tile) .tile-input').nth(i).click();
  assert.equal(await send.isDisabled(),true);assert.equal(await send.getAttribute('class'),'over-limit');
  assert.equal(await line.innerText(),`You picked ${pick+1} ${view==='look'?'looks':'boards'}. Pick up to ${['','one','two','three'][pick]} to go on.`);
  assert.equal(await send.innerText(),original);await cannotSubmit(h,send);
  await h.f.locator('.looks-tile, .boards-tile:not(.looks-tile) .tile-input').nth(pick).click();assert.equal(await send.isDisabled(),false);assert.equal(await line.isHidden(),true);
  await send.click();await h.f.locator('#status.ok').waitFor();assert.equal((await deliveries(h)).length,2);assert.deepEqual(h.errors,[]);
 }finally{await h.context.close();}
});

for(const name of ['chatgpt','Claude'])for(const theme of ['light','dark'])for(const width of [390,734])test(`full-size thumbnail ${name} ${theme} ${width}: 44px target above the tick, outside any label`,async()=>{
 const h=await kit.open(boardForm(),width,theme,{name});try{
  const thumbnails=await h.f.locator('.board-thumbnail').evaluateAll(nodes=>nodes.map(n=>({height:n.getBoundingClientRect().height,bottom:n.getBoundingClientRect().bottom,tick:n.parentElement.querySelector('.tile-input').getBoundingClientRect().top,insideLabel:Boolean(n.closest('label')),hasArt:Boolean(n.querySelector('.brand-board'))})));
  assert.equal(thumbnails.length,12);
  for(const n of thumbnails){assert.ok(n.height>=44);assert.ok(n.tick>=n.bottom);assert.equal(n.insideLabel,false);assert.ok(n.hasArt);}
  assert.equal(await h.f.locator('.board-option>.board-thumbnail').count(),0);
  await h.f.locator('.board-thumbnail').first().click();assert.equal(await h.f.locator('.tile-input:checked').count(),0);assert.deepEqual(h.errors,[]);
 }finally{await h.context.close();}
});

test('every matching action greys above pick; other needs hide and caller notes return',async()=>{
 const form=boardForm();form.actions=[
  {value:'any',label:'Another round',needs:'any',notes:{several:''}},
  {value:'some',label:'Use them',needs:'some',note:'Caller line'},
  {value:'one',label:'Keep one',needs:'one',note:'Caller single'}
 ];
 const h=await kit.open(form);try{
  for(let i=0;i<4;i++)await h.f.locator('.looks-tile, .boards-tile:not(.looks-tile) .tile-input').nth(i).click();
  assert.equal(await h.f.locator('.board-actions button:visible').count(),2);
  for(const value of ['any','some']){
   const button=h.f.locator(`[data-action=${value}]`);assert.equal(await button.isDisabled(),true);
   assert.equal(await button.locator('small').innerText(),'You picked 4 boards. Pick up to three to go on.');
  }
  assert.equal(await h.f.locator('[data-action=one]').isHidden(),true);
  await h.f.locator('.looks-tile, .boards-tile:not(.looks-tile) .tile-input').nth(3).click();
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

const noneAndOne=()=>[
 {value:'none',label:'None fit',needs:'none',note:'Try another set'},
 {value:'one',label:'Keep this one',needs:'one',note:'Use my pick'}
];
for(const name of ['chatgpt','Claude'])for(const view of ['board','look'])for(const pick of [1,3])test(`only none and one ${name} ${view} pick ${pick}: visible limit, refused delivery and restored caller lines`,async()=>{
 const form=view==='look'?lookForm():boardForm();form.actions=noneAndOne();form.questions[0].pick=pick;delete form.questions[0].min;
 const h=await kit.open(form,734,'light',{name});try{
  const line=h.f.locator('#send-limit'),none=h.f.locator('[data-action=none]'),one=h.f.locator('[data-action=one]');
  for(let i=0;i<=pick;i++)await h.f.locator('.looks-tile, .boards-tile:not(.looks-tile) .tile-input').nth(i).click();
  assert.equal(await h.f.locator('.board-actions button:visible').count(),0);
  assert.equal(await line.count(),1);assert.equal(await line.isVisible(),true);assert.equal(await line.getAttribute('role'),'status');
  assert.equal(await line.evaluate(n=>n.classList.contains('visually-hidden')),false);
  assert.equal(await line.innerText(),`You picked ${pick+1} ${view==='look'?'looks':'boards'}. Pick up to ${pick===1?'one':'three'} to go on.`);
  assert.equal(await h.f.locator('#submit:visible').count(),0);
  for(const action of [none,one])await action.evaluate(n=>n.form.requestSubmit(n));
  await h.f.locator('#form').evaluate(n=>n.requestSubmit());assert.deepEqual(await deliveries(h),[]);
  await h.f.locator('.looks-tile, .boards-tile:not(.looks-tile) .tile-input').nth(pick).click();assert.equal(await line.evaluate(n=>n.classList.contains('visually-hidden')),true);assert.equal(await line.textContent(),'');
  for(let i=pick-1;i>=1;i--)await h.f.locator('.looks-tile, .boards-tile:not(.looks-tile) .tile-input').nth(i).click();
  assert.equal(await one.isVisible(),true);assert.equal(await one.isDisabled(),false);assert.equal(await one.locator('small').innerText(),'Use my pick');
  assert.equal(await none.isHidden(),true);
  await h.f.locator('.looks-tile, .boards-tile:not(.looks-tile) .tile-input').first().click();
  assert.equal(await none.isVisible(),true);assert.equal(await none.isDisabled(),false);assert.equal(await none.locator('small').innerText(),'Try another set');
  assert.equal(await one.isHidden(),true);assert.deepEqual(await deliveries(h),[]);assert.deepEqual(h.errors,[]);
 }finally{await h.context.close();}
});

for(const name of ['chatgpt','Claude'])for(const view of ['board','look'])for(const theme of ['light','dark'])test(`action limit status ${name} ${view} ${theme}: one live update per changed line, visually hidden beside greyed button`,async()=>{
 const form=view==='look'?lookForm():boardForm();if(view==='look')form.actions=lookActions();
 const h=await kit.open(form,734,theme,{name});try{
  const line=h.f.locator('#send-limit');assert.equal(await line.count(),1);assert.equal(await line.getAttribute('hidden'),null);
  await line.evaluate(n=>{
   window.__limitUpdates=[];
   new MutationObserver(records=>records.forEach(()=>__limitUpdates.push(n.textContent))).observe(n,{childList:true,characterData:true,subtree:true});
  });
  const warning=count=>`You picked ${count} ${view==='look'?'looks':'boards'}. Pick up to three to go on.`;
  for(let i=0;i<4;i++)await h.f.locator('.looks-tile, .boards-tile:not(.looks-tile) .tile-input').nth(i).click();
  assert.equal(await line.textContent(),warning(4));assert.equal(await line.getAttribute('role'),'status');
  assert.equal(await line.getAttribute('hidden'),null);assert.equal(await line.getAttribute('aria-hidden'),null);
  const style=await line.evaluate(n=>{const s=getComputedStyle(n);return {position:s.position,width:s.width,height:s.height,overflow:s.overflow,clipPath:s.clipPath};});
  assert.deepEqual(style,{position:'absolute',width:'1px',height:'1px',overflow:'hidden',clipPath:'inset(50%)'});
  assert.ok((await line.ariaSnapshot()).includes(warning(4)),'the clipped status remains in the accessibility tree');
  const live=h.f.locator('.board-actions button:visible:disabled');assert.equal(await live.count(),1);
  assert.equal(await live.locator('small').innerText(),warning(4));
  assert.equal(await h.f.locator('[role=status]').evaluateAll(nodes=>nodes.filter(n=>n.textContent.startsWith('You picked ')).length),1);
  await h.f.locator('#form').evaluate(n=>{n.dispatchEvent(new Event('boardpicks'));n.dispatchEvent(new Event('boardpicks'));});
  assert.deepEqual(await h.frame.evaluate(()=>__limitUpdates),[warning(4)]);
  await h.f.locator('.looks-tile, .boards-tile:not(.looks-tile) .tile-input').nth(4).click();assert.equal(await line.textContent(),warning(5));
  await h.f.locator('.looks-tile, .boards-tile:not(.looks-tile) .tile-input').nth(4).click();assert.equal(await line.textContent(),warning(4));
  await h.f.locator('.looks-tile, .boards-tile:not(.looks-tile) .tile-input').nth(3).click();assert.equal(await line.evaluate(n=>n.classList.contains('visually-hidden')),true);assert.equal(await line.textContent(),'');
  assert.deepEqual(await h.frame.evaluate(()=>__limitUpdates),[warning(4),warning(5),warning(4),'']);
  assert.equal(await live.count(),0);assert.deepEqual(await deliveries(h),[]);assert.deepEqual(h.errors,[]);
 }finally{await h.context.close();}
});

for(const name of ['chatgpt','Claude'])for(const pick of [1,3])for(const source of ['tile','top','bottom'])test(`over-limit Enter ${name} pick ${pick} ${source}: hidden first none action never delivers`,async()=>{
 const form=boardForm();form.actions=noneAndOne();form.questions[0].pick=pick;
 const h=await kit.open(form,734,'light',{name});try{
  for(let i=0;i<=pick;i++)await h.f.locator('.looks-tile, .boards-tile:not(.looks-tile) .tile-input').nth(i).click();
  const none=h.f.locator('[data-action=none]');assert.equal(await none.isHidden(),true);assert.equal(await none.isDisabled(),false);
  let input=h.f.locator('.tile-input').nth(pick+1);
  if(source!=='tile'){
   await h.f.locator('.board-thumbnail').first().click();
   input=h.f.locator('.board-viewer input').nth(source==='top'?0:1);
  }
  await input.focus();assert.equal(await input.evaluate(n=>document.activeElement===n),true);
  await input.press('Enter');
  assert.equal(await h.f.locator('.tile-input:checked').count(),pick+(source==='tile'?2:1));
  assert.deepEqual(await deliveries(h),[]);assert.deepEqual(h.errors,[]);
 }finally{await h.context.close();}
});
