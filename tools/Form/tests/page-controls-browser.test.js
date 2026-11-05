import '../../lib/tests/isolated-home.js';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {browserKit,onlyFonts} from './boards-harness.js';
import {lookForm} from './board-fixtures.js';
import {controlsForm,startAt,withStepLabels} from './page-controls-fixtures.js';
let kit;before(async()=>{kit=await browserKit();});after(async()=>{await kit?.browser.close();});
const buttons=h=>({light:h.f.getByRole('group',{name:'Light or dark',exact:true}).getByRole('button',{name:'Light',exact:true}),dark:h.f.getByRole('group',{name:'Light or dark',exact:true}).getByRole('button',{name:'Dark',exact:true}),muted:h.f.getByRole('button',{name:'More muted',exact:true}),bold:h.f.getByRole('button',{name:'More bold',exact:true})});
async function pictures(h,view){return h.frame.evaluate(view=>[...document.querySelectorAll(view==='look'?'.boards-tiles .look-art':'.boards-tiles .board-preview')].map(n=>({mode:n.dataset.mode,colours:view==='look'?[...n.querySelectorAll('[fill],[stop-color]')].map(n=>n.getAttribute('stop-color')??n.getAttribute('fill')).filter(v=>!v.startsWith('url(')):['ground','panel','pop','deep','mark'].map(k=>n.style.getPropertyValue(`--${k}`))})),view);}

// Identify the actual saved step model handed to the renderer, by its palette id.
async function trackPalettes(h,view,q){
 await h.frame.evaluate(({view,ids})=>{
  window.drawnPalettes=[];const method=view==='look'?'look':'draw',original=WiserBoardView[method];
  WiserBoardView[method]=(model,board,options)=>{
   const i=board.number-1,k=model.steps[i].findIndex(step=>Object.values(step.boards).includes(board));
   drawnPalettes.push(ids[i][k]);return original(model,board,options);
  };
 },{view,ids:q.options.map(o=>o.steps.map(step=>step.palette.id))});
}
async function capture(h,name){
 if(!process.env.WISER_FORM_CONTROLS_CAPTURES)return;
 await mkdir(process.env.WISER_FORM_CONTROLS_CAPTURES,{recursive:true});
 await h.frame.evaluate(()=>{document.querySelector('#root').scrollIntoView({block:'start'});WiserBoardView.fitLooks();});
 await h.page.screenshot({path:join(process.env.WISER_FORM_CONTROLS_CAPTURES,name+'.png'),fullPage:true});
}
for(const view of ['look','board'])for(const width of [390,734])for(const mode of ['light','dark'])test(`page controls ${view} ${width} ${mode}: every picture, picks, ends, summary and payload`,async()=>{
 const form=startAt(withStepLabels(controlsForm(view,mode))),q=form.questions[0],h=await kit.open(form,width,mode,{autoSize:true});
 try{
  const b=buttons(h),tiles=h.f.locator('.boards-tile'),inputs=h.f.locator('.tile-input');
  assert.equal(await tiles.count(),q.options.length);assert.equal(await h.f.locator('.board-controls').count(),1);
  assert.equal(await b[mode].getAttribute('aria-pressed'),'true');assert.equal(await b.muted.isDisabled(),false);assert.equal(await b.bold.isDisabled(),false);
  const layout=await h.frame.evaluate(()=>{const bar=document.querySelector('.board-controls').getBoundingClientRect(),tiles=document.querySelector('.boards-tiles').getBoundingClientRect();return {above:bar.bottom<=tiles.top,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,targets:[...document.querySelectorAll('.board-controls button')].map(n=>n.getBoundingClientRect().height)};});
  assert.equal(layout.above,true);assert.equal(layout.overflow,0);assert.ok(layout.targets.every(n=>n>=44));
  await tiles.nth(0).click();await tiles.nth(1).click();const notes=await h.f.locator('.tile-label small').allTextContents();
  await trackPalettes(h,view,q);
  await h.frame.evaluate(()=>{window.savedInputs=[...document.querySelectorAll('.tile-input')];window.resolutions=0;const original=WiserBoards.resolveBoards;WiserBoards.resolveBoards=(...args)=>{window.resolutions++;return original(...args);};});
  const initial=await pictures(h,view);await capture(h,`${view}-${width}-${mode}-before`);
  await b.bold.click();const bold=await pictures(h,view);await capture(h,`${view}-${width}-${mode}-after-bold`);
  assert.ok(bold.every((p,i)=>p.mode===mode&&JSON.stringify(p.colours)!==JSON.stringify(initial[i].colours)),'every tile changes its palette');
  assert.deepEqual(await h.frame.evaluate(()=>drawnPalettes),q.options.map(o=>o.steps[2].palette.id));
  assert.deepEqual(await h.f.locator('.tile-label>span:first-child').allTextContents(),q.options.map(o=>o.steps[2].label));
  assert.equal(await b.bold.isDisabled(),true);assert.equal(await b.muted.isDisabled(),false);
  assert.equal(await h.f.locator('.tile-input:checked').count(),2);assert.equal(await h.f.locator('fieldset').getAttribute('data-picks'),'2');
  assert.deepEqual(await inputs.evaluateAll(ns=>ns.map(n=>n.value)),q.options.map(o=>o.steps[2].value));
  await b.muted.click();await b.muted.click();assert.equal(await b.muted.isDisabled(),true);assert.equal(await b.bold.isDisabled(),false);
  assert.ok(await b.muted.evaluate(n=>parseFloat(getComputedStyle(n).opacity)<1));await b.bold.click();
  const opposite=mode==='light'?'dark':'light';await b[opposite].click();const switched=await pictures(h,view);
  assert.ok(switched.every(p=>p.mode===opposite));assert.ok(switched.every((p,i)=>JSON.stringify(p.colours)!==JSON.stringify(initial[i].colours)));
  assert.equal(await b[opposite].getAttribute('aria-pressed'),'true');assert.equal(await b[mode].getAttribute('aria-pressed'),'false');
  assert.deepEqual(await h.f.locator('.tile-label>span:first-child').allTextContents(),q.options.map(o=>o.steps[1].label));
  assert.deepEqual(await h.f.locator('.tile-label small').allTextContents(),notes);
  assert.deepEqual(await h.frame.evaluate(()=>({sameInputs:savedInputs.every((n,i)=>n===document.querySelectorAll('.tile-input')[i]),resolutions})),{sameInputs:true,resolutions:0});
  await inputs.first().focus();await b.bold.evaluate(n=>n.click());assert.equal(await inputs.first().evaluate(n=>document.activeElement===n),true);
  assert.equal((await h.page.evaluate(()=>__log.filter(e=>e.kind==='context'||e.kind==='message'))).length,0,'control buttons never submit');
  await h.f.locator('#submit').click();await h.f.locator('#status.ok').waitFor();
  const sent=await h.page.evaluate(()=>__log.filter(e=>e.kind==='context'||e.kind==='message')),payload=sent[0].params.structuredContent;
  assert.deepEqual(sent.map(e=>e.kind),['context','message']);assert.equal(payload.mode,opposite);
  assert.deepEqual(payload.answers.looks,q.options.slice(0,2).map(o=>o.steps[2].value));
  const shown=q.options.slice(0,2).map(o=>o.steps[2].label).join(', ');assert.equal(payload.shown[0].shown,shown);
  assert.ok(sent[1].params.content[0].text.includes(`- Light or dark: ${opposite==='light'?'Light':'Dark'}`));assert.ok(sent[1].params.content[0].text.includes(shown));
  assert.ok(onlyFonts(h.requests));assert.deepEqual(h.errors,[]);
 }finally{await h.context.close();}
});
for(const width of [390,734])test(`page controls ${width}: full-size board follows both controls and keeps mirrors`,async()=>{
 const form=startAt(withStepLabels(controlsForm('board'))),h=await kit.open(form,width,'light',{autoSize:true});
 try{
  const b=buttons(h);await h.f.locator('.boards-tile').first().click();await h.f.locator('.see-board').first().click();
  assert.equal(await h.f.locator('.board-viewer .board-mode-switches').count(),0);assert.equal(await h.f.locator('.board-viewer .brand-board').getAttribute('data-mode'),'light');
  assert.equal(await h.f.locator('.board-viewer .locked-name').textContent(),form.questions[0].options[0].steps[1].label);
  const pop=await h.f.locator('.board-viewer .brand-board').evaluate(n=>n.style.getPropertyValue('--pop'));
  await b.bold.click();assert.notEqual(await h.f.locator('.board-viewer .brand-board').evaluate(n=>n.style.getPropertyValue('--pop')),pop);
  assert.equal(await h.f.locator('.board-viewer .locked-name').textContent(),form.questions[0].options[0].steps[2].label);
  await b.dark.click();assert.equal(await h.f.locator('.board-viewer .brand-board').getAttribute('data-mode'),'dark');
  assert.equal(await h.f.locator('.board-viewer input:checked').count(),2);assert.equal(await h.f.locator('.tile-input:checked').count(),1);
  await h.f.getByRole('button',{name:'Close this board',exact:true}).first().click();
  assert.equal(await h.f.locator('.tile-input').first().inputValue(),form.questions[0].options[0].steps[2].value);assert.equal(await h.f.locator('.tile-input').first().isChecked(),true);
  assert.equal(await h.f.locator('.see-board').first().evaluate(n=>n===document.activeElement),true);assert.deepEqual(h.errors,[]);
 }finally{await h.context.close();}
});
test('strength only retains the full-size board mode switch and its chosen mode',async()=>{
 const form=startAt(controlsForm('board'));delete form.questions[0].controls.mode;
 const h=await kit.open(form);try{
  await h.f.locator('.see-board').first().click();await h.f.locator('.board-viewer [data-mode=dark].board-mode-switch').click();
  await h.f.getByRole('button',{name:'More bold',exact:true}).click();
  assert.equal(await h.f.locator('.board-viewer .brand-board[data-mode=dark]').isVisible(),true);assert.equal(await h.f.locator('.board-viewer .brand-board[data-mode=light]').isHidden(),true);
  assert.equal(await h.f.locator('.board-controls .board-mode-switches').count(),0);assert.deepEqual(h.errors,[]);
 }finally{await h.context.close();}
});
test('missing adjacent steps and endpoints stay put; strength greys when the whole page cannot move',async()=>{
 const form=startAt(controlsForm()),q=form.questions[0];q.options=q.options.slice(0,3);
 q.options[0].steps=q.options[0].steps.slice(1);q.options[1].steps=q.options[1].steps.slice(0,2);
 const o=q.options[2];o.value=o.steps[0].value;o.board.palette=o.steps[0].palette;o.board.depth=o.steps[0].depth.light;o.steps=[o.steps[0],o.steps[2]];
 const h=await kit.open(form);try{
  const b=buttons(h),inputs=h.f.locator('.tile-input'),before=await inputs.evaluateAll(ns=>ns.map(n=>n.value));
  await b.bold.click();const after=await inputs.evaluateAll(ns=>ns.map(n=>n.value));
  assert.notEqual(after[0],before[0]);assert.equal(after[1],before[1]);assert.equal(after[2],before[2]);assert.equal(await b.bold.isDisabled(),true);
  await b.muted.click();assert.equal(await b.muted.isDisabled(),true);assert.deepEqual(h.errors,[]);
 }finally{await h.context.close();}
});
test('mode only works on a single whole board without steps',async()=>{
 const form=controlsForm('board','dark'),q=form.questions[0];q.options.length=1;q.pick=1;delete q.min;delete q.controls.strength;delete q.options[0].steps;
 const h=await kit.open(form,390,'dark',{containerDimensions:{maxHeight:5000}});try{
  assert.equal(await h.f.locator('.board-mode-switches').count(),1);assert.equal(await h.f.locator('fieldset>.board-art .brand-board').getAttribute('data-mode'),'dark');
  await buttons(h).light.click();assert.equal(await h.f.locator('fieldset>.board-art .brand-board').getAttribute('data-mode'),'light');assert.equal(await h.f.locator('fieldset').getAttribute('data-picks'),'1');
  await h.f.locator('#submit').click();await h.f.locator('#status.ok').waitFor();
  const payload=await h.page.evaluate(()=>__log.find(e=>e.kind==='context').params.structuredContent);
  assert.equal(payload.mode,'light');assert.deepEqual(payload.answers.looks,[q.options[0].value]);assert.deepEqual(h.errors,[]);
 }finally{await h.context.close();}
});
test('one supplied step disables both strength directions and keeps default look labels on delivery',async()=>{
 const form=controlsForm(),q=form.questions[0];
 for(const o of q.options){o.steps=o.steps.filter(s=>s.value===o.value);delete o.label;}
 const h=await kit.open(form);try{
  const b=buttons(h);assert.equal(await b.muted.isDisabled(),true);assert.equal(await b.bold.isDisabled(),true);
  await h.f.locator('.boards-tile').nth(0).click();await h.f.locator('.boards-tile').nth(1).click();await b.dark.click();
  assert.equal(await h.frame.evaluate(()=>WiserForm.readAnswers()[0].shown),'Look 1, Look 2');
  await h.f.locator('#submit').click();await h.f.locator('#status.ok').waitFor();
  const payload=await h.page.evaluate(()=>__log.find(e=>e.kind==='context').params.structuredContent);
  assert.equal(payload.mode,'dark');assert.equal(payload.shown[0].shown,'Look 1, Look 2');assert.deepEqual(payload.answers.looks,q.options.slice(0,2).map(o=>o.value));assert.deepEqual(h.errors,[]);
 }finally{await h.context.close();}
});
// Compare actual serialized tiles to the committed renderer preceding this change.
const baselineView=execFileSync('git',['show','05cb8f27:tools/Form/engine/boards.js'],{encoding:'utf8'});
const baselineEngine=execFileSync('git',['show','05cb8f27:tools/Form/engine/engine.js'],{encoding:'utf8'});
for(const view of ['look','board'])for(const width of [390,734])for(const theme of ['light','dark'])test(`without controls or steps ${view} ${width} ${theme}: byte-identical tiles to preceding tree`,async()=>{
 const form=lookForm();for(const option of form.questions[0].options)delete option.steps;form.questions[0].view=view;if(view==='board')for(const o of form.questions[0].options)delete o.board.depth;
 const h=await kit.open(form,width,theme);try{
  const tiles=()=>h.f.locator('.boards-tile').evaluateAll(ns=>ns.map(n=>n.outerHTML));const after=await tiles();assert.equal(await h.f.locator('.board-controls').count(),0);
  await h.frame.addScriptTag({content:baselineView+'\n'+baselineEngine});await h.frame.evaluate(form=>WiserForm.render(form,{onSubmit:async()=>({sent:true})}),form);
  await h.frame.evaluate(async()=>{await document.fonts.ready;WiserBoardView.fitLooks();});assert.deepEqual(await tiles(),after);assert.deepEqual(h.errors,[]);
 }finally{await h.context.close();}
});

for(const width of [390,734])test(`sole strength-only board ${width}: cap switch rebinds, fits and sends showing step`,async()=>{
 const form=startAt(withStepLabels(controlsForm('board'))),q=form.questions[0];q.options.length=1;q.pick=1;delete q.min;delete q.controls.mode;
 // Keep one mode within the cap even at 390; both modes exceed it.
 form.brand.sentence='Care in every detail.';form.brand.body='Good work, made clear.';form.brand.words=[];
 const h=await kit.open(form,width,'light',{containerDimensions:{maxHeight:5000,width},autoSize:true});
 try{
  const shown=()=>h.frame.evaluate(()=>[...new Set([...document.querySelectorAll('fieldset>.board-art>*')].filter(n=>n.getClientRects().length).map(n=>n.dataset.mode))]);
  const fits=async()=>assert.ok(await h.f.locator('#root').evaluate(n=>Math.ceil(n.getBoundingClientRect().bottom+window.scrollY))<=5000,'card fits the host cap');
  const cap=h.f.locator('fieldset>.board-mode-switches');assert.equal(await cap.count(),1);assert.deepEqual(await shown(),['light']);await fits();
  await cap.getByRole('button',{name:'Dark',exact:true}).click();
  await h.f.getByRole('button',{name:'More bold',exact:true}).click();
  assert.deepEqual(await shown(),['dark']);assert.equal(await cap.locator('[data-mode=dark]').getAttribute('aria-pressed'),'true');
  assert.equal(await cap.locator('[data-mode=light]').getAttribute('aria-pressed'),'false');await fits();
  assert.equal(await h.f.locator('fieldset>.locked-name').textContent(),q.options[0].steps[2].label);
  await cap.getByRole('button',{name:'Light',exact:true}).click();assert.deepEqual(await shown(),['light']);
  assert.equal(await cap.locator('[data-mode=light]').getAttribute('aria-pressed'),'true');assert.equal(await cap.locator('[data-mode=dark]').getAttribute('aria-pressed'),'false');await fits();
  await h.f.getByRole('button',{name:'More muted',exact:true}).click();assert.deepEqual(await shown(),['light']);await fits();
  await h.f.getByRole('button',{name:'More bold',exact:true}).click();assert.deepEqual(await shown(),['light']);await fits();
  await h.f.locator('#submit').click();await h.f.locator('#status.ok').waitFor();
  const sent=await h.page.evaluate(()=>__log.filter(e=>['context','message'].includes(e.kind))),payload=sent[0].params.structuredContent;
  assert.deepEqual(payload.answers.looks,[q.options[0].steps[2].value]);assert.equal(Object.hasOwn(payload,'mode'),false);
  assert.equal(payload.shown[0].shown,q.options[0].steps[2].label);assert.ok(sent[1].params.content[0].text.includes(q.options[0].steps[2].label));
  assert.ok(onlyFonts(h.requests));assert.deepEqual(h.errors,[]);
 }finally{await h.context.close();}
});
test('unlabelled steps return to the option caption or the default look caption',async()=>{
 const form=startAt(withStepLabels(controlsForm())),q=form.questions[0];
 for(const o of q.options)delete o.steps[0].label;delete q.options[0].label;
 const h=await kit.open(form);try{
  await h.f.locator('.boards-tile').nth(0).click();await h.f.locator('.boards-tile').nth(1).click();
  await h.f.getByRole('button',{name:'More muted',exact:true}).click();
  assert.deepEqual(await h.f.locator('.tile-label>span:first-child').allTextContents(),q.options.map((o,i)=>o.label??`Look ${i+1}`));
  assert.equal(await h.frame.evaluate(()=>WiserForm.readAnswers()[0].shown),`Look 1, ${q.options[1].label}`);
  await h.f.getByRole('button',{name:'More bold',exact:true}).click();
  assert.equal(await h.frame.evaluate(()=>WiserForm.readAnswers()[0].shown),q.options.slice(0,2).map(o=>o.steps[1].label).join(', '));
  assert.deepEqual(h.errors,[]);
 }finally{await h.context.close();}
});
