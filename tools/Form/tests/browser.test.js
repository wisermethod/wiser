import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {composePage} from '../scripts/page.js';
import {SAMPLE_FORM,checkForm} from '../scripts/format.js';
const missing=[];
for(const name of ['@modelcontextprotocol/ext-apps','@modelcontextprotocol/client','@modelcontextprotocol/core','zod','esbuild'])if(!existsSync(new URL(`../node_modules/${name}/package.json`,import.meta.url)))missing.push(name);
if(!existsSync(new URL('../../lib/browser-runtime/browser-runtime.js',import.meta.url))||!existsSync(new URL('../../lib/browser-runtime/node_modules/playwright/package.json',import.meta.url)))missing.push('tools/lib/browser-runtime Playwright');
const skip=missing.length?`Not installed: ${missing.join(', ')}`:false;
let browser,html,hostScript;
before(async()=>{
 if(skip)return;
 const {build}=await import('esbuild');const {launch}=await import('../../lib/browser-runtime/browser-runtime.js');
 const options={bundle:true,format:'iife',target:'es2022',minify:true,write:false,legalComments:'none'};
 const chat=await build({...options,entryPoints:[fileURLToPath(new URL('../engine/chat.js',import.meta.url))]});
 const host=await build({...options,entryPoints:[fileURLToPath(new URL('./host-harness.js',import.meta.url))]});
 html=composePage({script:chat.outputFiles[0].text});hostScript=host.outputFiles[0].text;
 browser=await launch({headless:true,timeout:30000});
});
after(async()=>{await browser?.close();});
const tailored=structuredClone(SAMPLE_FORM);tailored.id='tailored';tailored.title='For the bakery';tailored.questions[0].options[0].picture='type:serif+monospace:#000,#fff';tailored.questions[0].options[0].sample='Bake';tailored.questions[1].options.push({value:'triangles',label:'Triangles',picture:'motif:triangles'},{value:'blob',label:'Blob',picture:'motif:blob'});
async function open(form,width=390,options={}){
 const context=await browser.newContext({viewport:{width,height:900},colorScheme:options.preference??'light'});
 const requests=[],errors=[];
 await context.route('**/*',async route=>{
  requests.push(route.request().url());
  if(route.request().url()==='https://fonts.gstatic.com/fixture.ttf' && options.font)await route.fulfill({body:readFileSync(new URL('./fixtures/fixture.ttf',import.meta.url)),contentType:'font/ttf',headers:{'access-control-allow-origin':'*'}});
  else await route.abort();
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 let content=html;
 if(options.direct){const direct=`window.openai={toolOutput:${JSON.stringify({form:options.directForm??form})},sendFollowUpMessage:async p=>{parent.postMessage({fallback:p},'*');${options.fallbackFails?"throw Error('test fallback refusal');":"return {};"}}};`;content=content.replace('<script>',`<script>${direct}`);}
 await page.setContent(`<!DOCTYPE html><html><body style="margin:0"><script>${hostScript}</script></body></html>`);
 await page.evaluate(()=>{window.__fallback=[];window.addEventListener('message',e=>{if(e.data?.fallback)window.__fallback.push(e.data.fallback);});});
 const args=options.resultOnly?{}:form===undefined?{}:{form};
 const result={structuredContent:options.resultForm===undefined?{}:{form:options.resultForm}};
 await page.evaluate(([content,args,result,options])=>window.startHost(content,args,result,options),[content,args,result,options]);
 const frame=page.frames().find(f=>f!==page.mainFrame());const f=page.frameLocator('iframe');
 return {context,page,frame,f,requests,errors};
}
async function ready(h){await h.f.locator('form#form').waitFor();}
async function tabTo(h,id){
 for(let i=0;i<75;i++){
  const current=await h.frame.evaluate(()=>document.activeElement?.id);
  if(current===id)return;
  await h.page.keyboard.press('Tab');
 }
 assert.fail(`Tab did not reach ${id}`);
}
async function focusRing(h){
 const result=await h.frame.evaluate(()=>{
  const e=document.activeElement;const label=e.closest('label')??document.querySelector(`label[for="${e.id}"]`);const target=label??e;const c=getComputedStyle(target);
  return {outline:c.outlineStyle,width:parseFloat(c.outlineWidth)};
 });assert.ok(result.outline!=='none'&&result.width>=2,JSON.stringify(result));
}
async function interact(h,keyboard){
 if(keyboard){
  await tabTo(h,'q-0-0');await focusRing(h);await h.page.keyboard.press('Space');await h.page.keyboard.press('ArrowRight');await h.page.keyboard.press('ArrowRight');
  await tabTo(h,'q-1-0');await focusRing(h);await h.page.keyboard.press('Space');await tabTo(h,'q-1-2');await h.page.keyboard.press('Space');
  await tabTo(h,'q-2-0');await focusRing(h);await h.page.keyboard.press('Space');await h.page.keyboard.press('ArrowRight');
  await tabTo(h,'q-3-0');await focusRing(h);await h.page.keyboard.press('Space');await tabTo(h,'q-3-2');await h.page.keyboard.press('Space');
  await tabTo(h,'q-4');await focusRing(h);await h.page.keyboard.press('ArrowRight');await h.page.keyboard.press('ArrowRight');await h.page.keyboard.press('ArrowRight');
  await tabTo(h,'q-5');await focusRing(h);await h.page.keyboard.type('  corporate  ');
  await tabTo(h,'submit');await focusRing(h);await h.page.keyboard.press('Enter');
 }else{
  for(const [selector,word]of [['label.tile','Bright'],['label.tile','Dots'],['label.tile','Waves'],['label.choice','Contemporary'],['label.choice','Website'],['label.choice','Slides']])await h.f.locator(selector).filter({hasText:new RegExp(`^${word}`)}).click();
  const range=h.f.locator('input[type=range]');const bounds=await range.boundingBox();await range.click({position:{x:bounds.width*.8,y:bounds.height/2}});
  await h.f.locator('textarea').click();await h.page.keyboard.type('  corporate  ');await h.f.locator('#submit').click();
 }
 await h.f.locator('#status.ok').waitFor();
}
async function delivery(h,form,keyboard){
 const log=await h.page.evaluate(()=>window.__log);const context=log.find(e=>e.kind==='context');const message=log.find(e=>e.kind==='message');
 assert.ok(context,'context was sent');assert.ok(message,'message was sent');
 const a=context.params.structuredContent.answers;
 assert.deepEqual(a,{mood:'bright',shapes:['dots','waves'],era:'contemporary',places:['website','slides'],loudness:8,never:'corporate'});
 assert.equal(a.loudness,8,`slider ${keyboard?'keyboard':'mouse'} value`);
 assert.deepEqual(context.params.structuredContent,{form:form.title,...(form.id?{id:form.id}:{}),answers:a});
 assert.equal(message.params.role,'user');assert.equal(message.params.content[0].text,'Here are my answers:\n- Colour mood: Bright\n- Shapes: Dots, Waves\n- Classic or contemporary: Contemporary\n- Seen most on: Website, Slides\n- Quiet to bold (0 to 10): 8\n- Must never feel like: corporate');
 assert.ok(log.indexOf(context)<log.indexOf(message),'context first');assert.ok(log.some(e=>e.kind==='size'));
 assert.deepEqual(h.requests,[]);assert.deepEqual(h.errors,[]);
}
for(const [name,form]of [['sample',SAMPLE_FORM],['tailored',tailored]])for(const width of [360,390,720])for(const keyboard of [false,true])test(`${name} at ${width}px by ${keyboard?'keyboard':'mouse'} sends every answer in order`,{skip},async()=>{
 const h=await open(form,width,{name:'chatgpt',theme:'light'});
 try{await ready(h);assert.equal(await h.f.locator('fieldset').count(),6);assert.equal(await h.f.locator('#submit').innerText(),'Send my answers');await interact(h,keyboard);await delivery(h,form,keyboard);assert.equal(await h.f.locator('#status').innerText(),'Sent to the chat.');assert.equal(await h.f.locator('#submit').innerText(),'Send again');assert.equal(await h.f.locator('#status').getAttribute('data-host'),'chatgpt');assert.equal(await h.f.locator('#root').getAttribute('data-source'),'tool-call');const overflow=await h.frame.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);assert.equal(overflow,0);const marks=await h.f.locator('.tile:has(input:checked) .mark').count();assert.equal(marks,3);}
 finally{await h.context.close();}
});
function longest(){const f=structuredClone(SAMPLE_FORM);f.title='T'.repeat(80);f.intro='I'.repeat(300);f.questions.forEach(q=>{q.label='Q'.repeat(200);q.short='S'.repeat(40);q.help='H'.repeat(300);q.options?.forEach(o=>{o.label='O'.repeat(60);o.note='N'.repeat(80);});if(q.type==='slider'){q.minLabel='L'.repeat(24);q.maxLabel='R'.repeat(24);}if(q.type==='text')q.placeholder='P'.repeat(120);});return f;}
async function checkLook(h){
 const readings=await h.frame.evaluate(()=>{
  function rgb(s){return(s.match(/[\d.]+/g)||[]).slice(0,3).map(Number);}
  function lum(c){return rgb(c).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);}
  const ratio=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
  const bg=e=>{for(let p=e;p;p=p.parentElement){const c=getComputedStyle(p).backgroundColor;if(c!=='rgba(0, 0, 0, 0)'&&c!=='transparent')return c;}return getComputedStyle(document.body).backgroundColor;};
  const text=[...document.querySelectorAll('*')].filter(e=>[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())&&e.getClientRects().length&&e.tagName!=='SCRIPT'&&e.tagName!=='STYLE').map(e=>({tag:e.tagName,text:e.textContent.slice(0,30),ratio:ratio(getComputedStyle(e).color,bg(e))}));
  const textarea=document.querySelector('textarea');text.push({tag:'placeholder',ratio:ratio(getComputedStyle(textarea,'::placeholder').color,bg(textarea))});
  const targets=[...document.querySelectorAll('label.choice,label.tile,input[type=range],textarea,button')].map(e=>({tag:e.tagName,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}));
  const tile=document.querySelector('.tile:has(input:checked)'),mark=tile.querySelector('.mark'),button=document.querySelector('button');
  const accent=getComputedStyle(tile).borderColor;
  const controls=[{kind:'tile outer',ratio:ratio(accent,bg(tile.parentElement))},{kind:'tile inner',ratio:ratio(accent,bg(tile))},{kind:'mark',ratio:ratio(getComputedStyle(mark).backgroundColor,bg(tile))},{kind:'mark glyph',ratio:ratio(getComputedStyle(mark,'::after').backgroundColor,getComputedStyle(mark).backgroundColor)}];
  if(getComputedStyle(button).outlineStyle!=='none')controls.push({kind:'focus',ratio:ratio(getComputedStyle(button).outlineColor,bg(button.parentElement))});
  for(const mark of document.querySelectorAll('.tile:has(input:checked) .mark')) {
    const pseudo=getComputedStyle(mark,'::after');const colour=mark.classList.contains('check')?pseudo.borderTopColor:pseudo.backgroundColor;
    controls.push({kind:'picked glyph',ratio:ratio(colour,getComputedStyle(mark).backgroundColor)});
  }
  return {text,targets,controls,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth};
 });
 assert.equal(readings.overflow,0,'no sideways scroll');for(const r of readings.targets)assert.ok(r.width>=44&&r.height>=44,JSON.stringify(r));
 for(const r of readings.text)assert.ok(r.ratio>=4.5,JSON.stringify(r));for(const r of readings.controls)assert.ok(r.ratio>=3,JSON.stringify(r));
}
for(const width of [360,390,720])for(const theme of ['light','dark'])test(`look: longest labels, targets and computed contrast ${width}px ${theme}`,{skip},async()=>{
 const form=longest();assert.equal(checkForm(form).ok,true);const h=await open(form,width,{theme,preference:theme==='dark'?'light':'dark'});
 try{await ready(h);assert.equal(await h.frame.evaluate(()=>document.documentElement.dataset.theme),theme);await h.f.locator('label.tile').first().click();await h.f.locator('label.choice').first().click();await h.f.locator('fieldset[data-type=image-checkbox] label.tile').first().click();await tabTo(h,'submit');await focusRing(h);await checkLook(h);
 await h.page.evaluate(theme=>window.__bridge.setHostContext({theme}),theme==='dark'?'light':'dark');await h.f.locator(`html[data-theme=${theme==='dark'?'light':'dark'}]`).waitFor();await checkLook(h);
 await h.f.locator('#submit').click();await h.f.locator('#status.ok').waitFor();await checkLook(h);
 await h.page.evaluate(()=>{window.__bridge.onmessage=async()=>({isError:true});});await h.f.locator('#submit').click();await h.f.locator('#status.bad').waitFor();await checkLook(h);
 }finally{await h.context.close();}
});
for(const preference of ['light','dark'])test(`theme falls back to prefers-color-scheme ${preference}`,{skip},async()=>{const h=await open(SAMPLE_FORM,390,{preference});try{await ready(h);assert.equal(await h.frame.evaluate(()=>document.documentElement.hasAttribute('data-theme')),false);assert.equal(await h.frame.evaluate(()=>getComputedStyle(document.body).backgroundColor),preference==='light'?'rgb(250, 250, 249)':'rgb(28, 25, 23)');}finally{await h.context.close();}});
test('Claude drafts, and result source wins when it arrives first',{skip},async()=>{const h=await open(SAMPLE_FORM,390,{name:'Claude',resultFirst:true,resultForm:tailored});try{await ready(h);assert.equal(await h.f.locator('h1').innerText(),tailored.title);assert.equal(await h.f.locator('#root').getAttribute('data-source'),'tool-result');assert.equal(await h.f.locator('#submit').innerText(),'Add my answers to the chat');await h.f.locator('#submit').click();await h.f.locator('#status.ok').waitFor();assert.equal(await h.f.locator('#status').innerText(),"Your answers are in the message box. Press Send when you're ready.");const a=(await h.page.evaluate(()=>window.__log.find(e=>e.kind==='context'))).params.structuredContent.answers;assert.deepEqual(a,{mood:null,shapes:[],era:null,places:[],loudness:5,never:''});}finally{await h.context.close();}});
test('tool result alone is accepted',{skip},async()=>{const h=await open(undefined,390,{resultOnly:true,resultForm:tailored});try{await ready(h);assert.equal(await h.f.locator('h1').innerText(),tailored.title);}finally{await h.context.close();}});
test('refused form draws no controls, first source remains authoritative',{skip},async()=>{const h=await open({...SAMPLE_FORM,submitLabel:'Bad'},390,{resultForm:SAMPLE_FORM});try{await h.f.locator('h1').waitFor();assert.equal(await h.f.locator('h1').innerText(),"This form couldn't be shown");assert.equal(await h.f.locator('form,fieldset,input,textarea,button').count(),0);assert.equal(await h.f.locator('.intro').innerText(),"Something in it was set up wrong. Ask in the chat to try again.");assert.deepEqual(h.requests,[]);}finally{await h.context.close();}});
test('a connected app that has not sent the call yet is waited for, as Cowork asks the member first',{skip},async()=>{const h=await open(undefined,390,{hold:true});try{await h.page.waitForTimeout(4500);assert.equal(await h.f.locator('h1',{hasText:'No form arrived'}).count(),0);await h.page.evaluate(form=>window.__bridge.sendToolInput({arguments:{form}}),tailored);await ready(h);assert.equal(await h.f.locator('h1').innerText(),'For the bakery');assert.deepEqual(h.errors,[]);}finally{await h.context.close();}});
test('a cancelled call says no form arrived',{skip},async()=>{const h=await open(undefined,390,{cancel:true});try{await h.f.locator('h1').waitFor({timeout:6000});assert.equal(await h.f.locator('h1').innerText(),'No form arrived');assert.equal(await h.f.locator('form').count(),0);}finally{await h.context.close();}});
test('a page no app answers says no form arrived after three seconds',{skip},async()=>{const context=await browser.newContext({viewport:{width:390,height:900}});try{await context.route('**/*',route=>route.abort());const page=await context.newPage();const start=Date.now();await page.setContent(html);await page.locator('h1').waitFor({timeout:6000});assert.ok(Date.now()-start>=2900);assert.equal(await page.locator('h1').innerText(),'No form arrived');}finally{await context.close();}});
test('no form shows the prescribed words after three seconds',{skip},async()=>{const start=Date.now(),h=await open();try{await h.f.locator('h1').waitFor({timeout:6000});assert.ok(Date.now()-start>=2900);assert.equal(await h.f.locator('h1').innerText(),'No form arrived');assert.equal(await h.f.locator('.intro').innerText(),"This page didn't receive a form. Ask in the chat to show it again.");assert.equal(await h.f.locator('form').count(),0);assert.deepEqual(h.requests,[]);}finally{await h.context.close();}});
for(const mode of ['success','declined','throws','fallback','fallback-fails'])test(`delivery: ${mode}, retry and direct fallback rules`,{skip},async()=>{
 const direct=mode.startsWith('fallback')||mode==='success';const h=await open(SAMPLE_FORM,390,{name:'Claude',direct,messageFails:mode!=='success'&&mode!=='throws',messageThrows:mode==='throws',fallbackFails:mode==='fallback-fails',contextFails:mode==='declined'});
 try{await ready(h);await h.f.locator('#submit').click();const success=mode==='success'||mode==='fallback';await h.f.locator(success?'#status.ok':'#status.bad').waitFor();const fallback=await h.page.evaluate(()=>window.__fallback);assert.equal(fallback.length,mode.startsWith('fallback')?1:0);assert.equal(await h.f.locator('#status').innerText(),success?'Sent to the chat.':'Not sent. Press the button again, or copy the answers below into the chat.');assert.equal((await h.f.locator('#copy').innerText()).startsWith('Here are my answers:'),!success);assert.equal(await h.f.locator('#submit').innerText(),'Send again');await h.f.locator('#submit').click();await h.page.waitForFunction(()=>window.__log.filter(e=>e.kind==='message').length===2);assert.deepEqual(h.requests,[]);assert.deepEqual(h.errors,[]);}finally{await h.context.close();}
});
for(const font of [true,false])test(`type font ${font?'loads and is used':'failure falls back'}, only its request is made`,{skip},async()=>{
 const form=structuredClone(tailored);form.fonts=[{family:'Member Face',src:'https://fonts.gstatic.com/fixture.ttf'}];form.questions[0].options[0].picture='type:Member Face+serif:#fff,#fff';
 const h=await open(form,390,{font});try{await ready(h);const result=await h.frame.evaluate(async()=>{await document.fonts.ready;const e=document.querySelector('svg text');return {face:getComputedStyle(e).fontFamily,loaded:[...document.fonts].map(f=>({family:f.family,status:f.status})),sample:e.textContent,fill:e.getAttribute('fill')};});assert.equal(result.sample,'Bake');assert.ok(result.face.includes('Member Face')&&result.face.includes('sans-serif'),JSON.stringify(result));assert.equal(result.loaded.length,1);assert.equal(result.loaded[0].status,font?'loaded':'error');assert.equal(result.fill,'#000');assert.deepEqual(h.requests,['https://fonts.gstatic.com/fixture.ttf']);assert.deepEqual(h.errors,[]);}finally{await h.context.close();}
});
test('text is trimmed and capped in code points; defaults are step-aligned; reads use position',{skip},async()=>{
 const form={title:'Defaults',questions:[{id:'a',type:'text',label:'A'},{id:'b',type:'slider',label:'B',min:1,max:2,step:.2},{id:'c',type:'radio',label:'C',options:[{value:'x',label:'X'},{value:'y',label:'Y'}]}]};const h=await open(form);try{await ready(h);await h.f.locator('textarea').fill('😀'.repeat(1001));assert.equal(await h.f.locator('textarea').inputValue(),'😀'.repeat(1000));await h.frame.evaluate(()=>{const boxes=document.querySelectorAll('fieldset');boxes[1].dataset.id='a';document.querySelector('textarea').value='  x  ';});await h.f.locator('#submit').click();await h.f.locator('#status.ok').waitFor();const payload=await h.page.evaluate(()=>window.__log.find(e=>e.kind==='context').params.structuredContent);assert.deepEqual(payload.answers,{a:'x',b:1.6,c:null});const msg=await h.page.evaluate(()=>window.__log.find(e=>e.kind==='message').params.content[0].text);assert.equal(msg,'Here are my answers:\n- A: x\n- B: 1.6\n- C: (none)');}finally{await h.context.close();}
});
test('a type sample wider than its card is set smaller until it fits',{skip},async()=>{
 const form={title:'Fit',fonts:[{family:'Member Face',src:'https://fonts.gstatic.com/fixture.ttf'}],questions:[{id:'t',type:'image-radio',label:'T',options:[{value:'a',label:'A',picture:'type:Member Face+monospace',sample:'THE WORK SPEAKS CLEARLY'},{value:'b',label:'B',picture:'type:serif',sample:'Aa'}]}]};
 const h=await open(form,360,{font:true});
 try{await ready(h);await h.frame.evaluate(()=>document.fonts.ready);await h.page.waitForTimeout(100);
  const boxes=await h.frame.evaluate(()=>[...document.querySelectorAll('svg text')].map(t=>{const b=t.getBBox();return {text:t.textContent,left:b.x,right:b.x+b.width,size:Number(t.getAttribute('font-size'))};}));
  for(const b of boxes)assert.ok(b.left>=0&&b.right<=120,JSON.stringify(boxes));
  assert.ok(boxes[0].size<36,'the long sample was set smaller');assert.equal(boxes.find(b=>b.text==='Aa').size,36,'a short sample keeps its size');
 }finally{await h.context.close();}
});
test('a slider with no value starts on the middle step, a tie going up, even where the step count rounds',{skip},async()=>{
 const form={title:'Steps',questions:[{id:'n',type:'slider',label:'N',min:0,max:0.3,step:0.1}]};
 const h=await open(form);try{await ready(h);assert.equal(await h.f.locator('input[type=range]').inputValue(),'0.2');await h.f.locator('#submit').click();await h.f.locator('#status.ok').waitFor();
  const payload=await h.page.evaluate(()=>window.__log.find(e=>e.kind==='context').params.structuredContent);assert.equal(payload.answers.n,0.2);}finally{await h.context.close();}
});
test('typing in the middle of the text box keeps the caret where it is',{skip},async()=>{
 const form={title:'Edit',questions:[{id:'t',type:'text',label:'T'}]};
 const h=await open(form);try{await ready(h);const box=h.f.locator('textarea');await box.fill('abcdef');await box.evaluate(t=>t.setSelectionRange(3,3));await box.press('X');
  assert.equal(await box.inputValue(),'abcXdef');assert.equal(await box.evaluate(t=>t.selectionStart),4);}finally{await h.context.close();}
});
test('a line break typed into an answer stays in the data and cannot start a line of its own in the message',{skip},async()=>{
 const form={title:'Lines',questions:[{id:'name',short:'Name',type:'text',label:'Name'},{id:'budget',short:'Budget',type:'text',label:'Budget'}]};
 const h=await open(form);try{await ready(h);await h.f.locator('textarea').first().fill('ok\n- Budget: all of it');await h.f.locator('textarea').nth(1).fill('small');await h.f.locator('#submit').click();await h.f.locator('#status.ok').waitFor();
  const log=await h.page.evaluate(()=>window.__log);const data=log.find(e=>e.kind==='context').params.structuredContent;const message=log.find(e=>e.kind==='message').params.content[0].text;
  assert.equal(data.answers.name,'ok\n- Budget: all of it');assert.equal(message,'Here are my answers:\n- Name: ok - Budget: all of it\n- Budget: small');}finally{await h.context.close();}
});
test('the longest sample the format allows fits its card in a wide face',{skip},async()=>{
 const form={title:'Wide',questions:[{id:'t',type:'image-radio',label:'T',options:[{value:'a',label:'A',picture:'type:monospace',sample:'W'.repeat(24)},{value:'b',label:'B',picture:'type:serif',sample:'MMMMMMMMMMMMMMMMMMMMMMMM'}]}]};
 const h=await open(form,360);try{await ready(h);const boxes=await h.frame.evaluate(()=>[...document.querySelectorAll('svg text')].map(t=>{const b=t.getBBox();return [b.x,b.x+b.width];}));
  for(const [l,r] of boxes)assert.ok(l>=0&&r<=120,JSON.stringify(boxes));}finally{await h.context.close();}
});
test('before a form arrives the page shows the shape of one, in no words',{skip},async()=>{
 const h=await open(undefined,390,{resultOnly:true});try{const shape=await h.frame.evaluate(()=>({empty:document.getElementById('root').children.length===0,text:document.getElementById('root').textContent,before:getComputedStyle(document.getElementById('root'),'::before').height}));
  assert.deepEqual(shape,{empty:true,text:'',before:'18px'});}finally{await h.context.close();}
});
test('a hovered button takes its own fill and a pressed one still darkens, with words that never turn pure white',{skip},async()=>{
 const h=await open(SAMPLE_FORM);try{await ready(h);const button=h.f.locator('#submit');const resting=await button.evaluate(b=>getComputedStyle(b).backgroundColor);
  await button.hover();const hovered=await button.evaluate(b=>({bg:getComputedStyle(b).backgroundColor,color:getComputedStyle(b).color,filter:getComputedStyle(b).filter}));
  assert.notEqual(hovered.bg,resting);assert.equal(hovered.filter,'none');assert.notEqual(hovered.color,'rgb(255, 255, 255)');
  await h.page.mouse.down();const pressed=await button.evaluate(b=>getComputedStyle(b).filter);await h.page.mouse.up();assert.equal(pressed,'brightness(0.9)');
 }finally{await h.context.close();}
});
