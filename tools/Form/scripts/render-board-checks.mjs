#!/usr/bin/env node
// Offline maintainer evidence, using the installed browser and local font pack.
import {mkdirSync,writeFileSync,readFileSync,existsSync,realpathSync} from 'node:fs';
import {resolve,isAbsolute,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {browserKit,onlyFonts} from '../tests/boards-harness.js';
import {tapSets,formFromSelection} from '../tests/board-fixtures.js';
import {select} from '../../../skills/Build Brand/scripts/select.mjs';
import {assemble,canonical} from '../../../skills/Build Brand/scripts/assemble.mjs';
import {runContactSheet} from '../../Contact Sheet/scripts/contact-sheet.js';
import {checkForm} from './format.js';
export async function run(directory) {
 if(!isAbsolute(directory))throw Error('Use an absolute output directory.');
 directory=canonical(directory);
 const local=relative(fileURLToPath(new URL('..',import.meta.url)),directory);
 if((local===''||(!local.startsWith('../')&&local!=='..'))||directory.split('/').includes('memory')||/\.env(?:\.|$)/i.test(directory)||existsSync(directory))throw Error('Use a new absolute output directory outside private paths.');
 mkdirSync(directory,{recursive:true});
 const kit=await browserKit(),record={pageBytes:kit.pageBytes,forms:{},renders:[],requests:[]};
 try{
  for(const [name,get]of Object.entries(tapSets)){
   const answers=get(),round=select('round1',answers,{check:true}).selection;
   const blend=select('blend',{...answers,picks:round.boards.slice(0,3),steer:{warmCool:0,quietBold:0,softStrong:0,classicContemporary:0}},{check:true}).selection;
   const locked={...round,groups:round.groups.slice(0,1),boards:round.boards.slice(0,1)};
   const cases={round1:formFromSelection(answers,round),blend:formFromSelection(answers,blend,{pick:1}),lock:formFromSelection(answers,locked,{pick:0,actions:false})};
   record.forms[name]={};
   for(const [kind,form]of Object.entries(cases)){
    const check=checkForm(form);if(!check.ok)throw Error(JSON.stringify(check));
    const path=resolve(directory,`${name}-${kind}.json`);writeFileSync(path,JSON.stringify(form,null,2));record.forms[name][kind]={bytes:Buffer.byteLength(JSON.stringify(form)),boards:form.questions[0].options.length};
    const selection=structuredClone(kind==='round1'?round:kind==='blend'?blend:locked);
    for(const b of selection.boards)b.content.closing=null;
    const spec=resolve(directory,`${name}-${kind}-contact.json`),html=resolve(directory,`${name}-${kind}-contact.html`);
    writeFileSync(spec,JSON.stringify(assemble(selection,JSON.parse(readFileSync(new URL('../../../skills/Build Brand/parts/parts.json',import.meta.url))))));
    runContactSheet(['build','--spec',spec,'--output',html]);
   }
   for(const width of [390,734])for(const theme of ['light','dark']){
    const prefix=`${name}-${width}-${theme}`;
    for(const [kind,form]of Object.entries(cases)){
     const h=await kit.open(form,width,theme);
     try{
      if(kind==='round1'){await h.f.locator('.boards-tile').nth(0).click();await h.f.locator('.boards-tile').nth(1).click();await h.f.locator('#board-grid-view').evaluate(n=>n.scrollTop=0);}
      if(kind==='blend')await h.f.locator('.boards-tile').first().click();
      const save=async(state)=>{const file=`${prefix}-${state}.png`;await h.f.locator('#root').screenshot({path:resolve(directory,file)});record.renders.push(file);};
      await save(kind==='round1'?'tiles-two-picked':kind);
      if(kind==='round1'){
       // Also keep every tile below the first card viewport for inspection.
       const grid=await h.f.locator('#board-grid-view').evaluate(n=>({height:n.clientHeight,total:n.scrollHeight}));
       for(let top=grid.height,index=1;top<grid.total;top+=grid.height,index++){
        await h.f.locator('#board-grid-view').evaluate((n,top)=>n.scrollTop=top,top);await save(`tiles-scroll-${index}`);
       }
       await h.f.locator('.see-board').first().click();await save('whole');
       await h.frame.evaluate(()=>{for(const n of document.querySelectorAll('#root,.board-viewer,.board-viewer-scroll')){n.style.height='auto';n.style.overflow='visible';}});await h.page.locator('iframe').evaluate(n=>n.style.height='30000px');
       const file=`${prefix}-whole-content.png`;await h.f.locator('.board-viewer-scroll .board-art').screenshot({path:resolve(directory,file)});record.renders.push(file);
      }
      if(kind==='lock'){await h.frame.evaluate(()=>{for(const n of document.querySelectorAll('#root,#board-grid-view')){n.style.height='auto';n.style.overflow='visible';}});await h.page.locator('iframe').evaluate(n=>n.style.height='30000px');const file=`${prefix}-lock-content.png`;await h.f.locator('.q-boards .board-art').screenshot({path:resolve(directory,file)});record.renders.push(file);}
      if(!onlyFonts(h.requests)||h.errors.length)throw Error(JSON.stringify({requests:h.requests,errors:h.errors}));record.requests.push(...h.requests);
     }finally{await h.context.close();}
     const context=await kit.browser.newContext({viewport:{width,height:900},colorScheme:theme});
     try{
      const page=await context.newPage();await context.route('**/*',route=>route.request().url().startsWith('file:')?route.continue():route.abort());
      await page.goto('file://'+resolve(directory,`${name}-${kind}-contact.html`));await page.evaluate(()=>document.fonts.ready);
      if(kind==='round1'){
       const file=`${prefix}-contact-tiles.png`;await page.locator('.index-page').screenshot({path:resolve(directory,file)});record.renders.push(file);
       await page.evaluate(()=>location.hash='whole-1');
      }
      if(kind==='blend')await page.evaluate(()=>location.hash='whole-1');
      const file=`${prefix}-contact-${kind==='round1'?'whole':kind}.png`;await page.locator('.whole-view:visible .mode-sheet:visible').first().screenshot({path:resolve(directory,file)});record.renders.push(file);
     }finally{await context.close();}
    }
   }
  }
  record.requests=[...new Set(record.requests)];writeFileSync(resolve(directory,'record.json'),JSON.stringify(record,null,2));return record;
 }finally{await kit.browser.close();}
}
async function main(){
 try{
  const args=process.argv.slice(2);for(const flag of args.filter(x=>x.startsWith('--')))if(!['--help','--output'].includes(flag))throw Error(`Unknown option ${flag}; use --help.`);
  if(!args.length||args.includes('--help')){process.stdout.write('Usage: node scripts/render-board-checks.mjs --output <new-absolute-directory>\nOffline render evidence; requires existing development packages, browser and font pack. Installs nothing.\n');return;}
  if(args.length!==2||args[0]!=='--output')throw Error('Use --output <new-absolute-directory>; see --help.');
  const record=await run(args[1]);process.stdout.write(JSON.stringify({output:args[1],pageBytes:record.pageBytes,forms:record.forms,renders:record.renders.length})+'\n');
 }catch(e){process.stderr.write(JSON.stringify({error:e.message})+'\n');process.exitCode=1;}
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url))await main();
