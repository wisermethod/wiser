#!/usr/bin/env node
// Offline maintainer evidence for whole looks; installs nothing and blocks external requests.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync,existsSync,realpathSync} from 'node:fs';
import {resolve,isAbsolute,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {browserKit,onlyFonts} from '../tests/boards-harness.js';
import {tapSets,lookForm} from '../tests/board-fixtures.js';
import {select} from '../../../skills/Build Brand/scripts/select.mjs';
import {canonical} from '../../../skills/Build Brand/scripts/assemble.mjs';
import {checkForm} from './format.js';
const tool=fileURLToPath(new URL('..',import.meta.url));
function screen(path) {
 if(!isAbsolute(path))throw Error('Use absolute paths.');
 const result=canonical(path);if(result.split(sep).some(p=>p==='memory'||/^\.env(?:\.|$)/i.test(p)))throw Error('Private paths are refused.');return result;
}
export async function run(output,prototype) {
 output=screen(output);prototype=screen(prototype);
 const local=relative(tool,output);
 if(local===''||(!isAbsolute(local)&&local!=='..'&&!local.startsWith(`..${sep}`))||existsSync(output))throw Error('Use a new output directory outside this tool.');
 const recorded=JSON.parse(readFileSync(screen(resolve(prototype,'looks/looks.json')),'utf8'));
 const sets=Object.entries(tapSets);
 if(!Array.isArray(recorded.brands)||recorded.brands.length!==sets.length)throw Error('The prototype must hold both recorded tap sets in fixture order.');
 mkdirSync(output,{recursive:true});
 const kit=await browserKit(),record={pageBytes:kit.pageBytes,forms:{},renders:[],comparisons:[],measurements:[],requests:[]};
 try {
  for(const [index,[fixture,get]]of sets.entries()) {
   const reference=recorded.brands[index],slug=reference.brand;
   if(typeof slug!=='string'||!/^[a-z0-9][a-z0-9-]{0,39}$/.test(slug))throw Error('Each prototype brand needs a plain filename slug.');
   const answers={...get(),name:reference.name},result=select('looks',answers,{check:true}),form=lookForm(answers,result);
   form.title=fixture==='operator'?'Step 3 of 6: how it should look':'Step 4 of 7: how it should look';
   assert.deepEqual(checkForm(form),{ok:true,problems:[]});
   const save=(file,data)=>writeFileSync(resolve(output,file),data,{flag:'wx'});
   save(`${slug}-form.json`,JSON.stringify(form,null,2)+'\n');
   record.forms[slug]={bytes:Buffer.byteLength(JSON.stringify(form)),options:form.questions[0].options.length,replacements:result.replacements,parts:result.positions};
   for(const width of [390,734])for(const theme of ['light','dark']) {
    const h=await kit.open(form,width,theme,{touch:true});
    try {
     for(const state of ['none-picked','two-picked','fourth-refused']) {
      if(state==='two-picked')for(const i of [0,1])await h.f.locator('.looks-tile').nth(i).tap();
      if(state==='fourth-refused')for(const i of [2,3])await h.f.locator('.looks-tile').nth(i).tap();
      assert.equal(await h.f.locator('.tile-input:checked').count(),state==='none-picked'?0:state==='two-picked'?2:3);
      assert.equal(await h.f.locator('#submit').isDisabled(),state==='none-picked');
      if(state==='fourth-refused')assert.equal(await h.f.locator('.board-limit').innerText(),'Pick up to three.');
      await h.f.locator('#board-grid-view').evaluate(n=>n.scrollTop=0);
      const prefix=`${slug}-${width}-${theme}-${state}`,card=prefix+'.png',content=prefix+'-content.png';
      await h.f.locator('#root').screenshot({path:resolve(output,card)});record.renders.push(card);
      const measured=await h.frame.evaluate(()=>({columns:getComputedStyle(document.querySelector('.looks-tiles')).gridTemplateColumns.split(' ').length,cardHeight:document.getElementById('root').getBoundingClientRect().height,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth}));
      assert.equal(measured.columns,width===734?4:2);assert.equal(measured.overflow,0);record.measurements.push({brand:slug,width,theme,state,...measured});
      // A second capture reveals every row while preserving the live card capture above.
      await h.frame.evaluate(()=>{for(const id of ['root','board-grid-view']){const n=document.getElementById(id);n.style.height='auto';n.style.overflow='visible';}});
      await h.page.locator('iframe').evaluate(n=>n.style.height='3000px');
      await h.f.locator('#root').screenshot({path:resolve(output,content)});record.renders.push(content);
      await h.frame.evaluate(()=>{for(const id of ['root','board-grid-view']){const n=document.getElementById(id);n.style.removeProperty('height');n.style.removeProperty('overflow');}});
     }
     assert.ok(onlyFonts(h.requests));assert.deepEqual(h.errors,[]);record.requests.push(...h.requests);
    } finally {await h.context.close();}
   }
   // Compare all eight vector drawings, at their native size, to the prototype PNGs.
   const h=await kit.open(form,734,'light');
   try {
    await h.frame.evaluate(()=>{
     const drawings=[...document.querySelectorAll('.look-art')];document.body.replaceChildren(...drawings);document.body.style.width='600px';
     for(const n of drawings){n.style.width='600px';n.style.height='360px';}WiserBoardView.fitLooks();
    });
    await h.page.locator('iframe').evaluate(n=>{n.style.width='600px';n.style.height='4000px';});
    const context=await kit.browser.newContext({viewport:{width:1200,height:400}});
    try {
     await context.route('**/*',route=>route.abort());const page=await context.newPage();
     for(let i=0;i<8;i++) {
      const actual=await h.f.locator('.look-art').nth(i).screenshot();
      const previous=readFileSync(screen(resolve(prototype,`looks/${slug}/look-${i+1}.png`)));
      await page.setContent('<!DOCTYPE html><style>body{margin:0;font:14px system-ui;background:white;color:#222}main{display:flex}figure{margin:0;width:600px}figcaption{height:32px;padding:6px}img{display:block;width:600px;height:360px}</style><main></main>');
      await page.evaluate(([previous,actual,number])=>{
       for(const [label,bytes]of [[`Prototype look ${number}`,previous],[`Form look ${number}`,actual]]){const figure=document.createElement('figure'),caption=document.createElement('figcaption'),img=document.createElement('img');caption.textContent=label;img.src='data:image/png;base64,'+bytes;figure.append(caption,img);document.querySelector('main').append(figure);}
      },[previous.toString('base64'),actual.toString('base64'),i+1]);
      await page.evaluate(()=>Promise.all([...document.images].map(img=>img.decode())));
      const file=`${slug}-look-${i+1}-comparison.png`;await page.locator('main').screenshot({path:resolve(output,file)});record.comparisons.push(file);
     }
    } finally {await context.close();}
    assert.ok(onlyFonts(h.requests));assert.deepEqual(h.errors,[]);record.requests.push(...h.requests);
   } finally {await h.context.close();}
  }
  record.requests=[...new Set(record.requests)];saveRecord();return record;
  function saveRecord(){writeFileSync(resolve(output,'record.json'),JSON.stringify(record,null,2)+'\n',{flag:'wx'});}
 } finally {await kit.browser.close();}
}
async function main() {
 try {
  const args=process.argv.slice(2),known=['--help','--output','--prototype'];
  for(const flag of args.filter(a=>a.startsWith('--')))if(!known.includes(flag))throw Error(`Unknown option ${flag}; use --help.`);
  if(!args.length||args.includes('--help')){process.stdout.write('Usage: node scripts/render-look-checks.mjs --output <new-absolute-directory> --prototype <absolute-prototype-directory>\nOffline whole-look evidence; requires existing development packages, browser and font pack. Installs nothing.\n');return;}
  if(args.length!==4||args[0]!=='--output'||args[2]!=='--prototype')throw Error('Use --output and --prototype; see --help.');
  const record=await run(args[1],args[3]);process.stdout.write(JSON.stringify({output:args[1],forms:record.forms,renders:record.renders.length,comparisons:record.comparisons.length})+'\n');
 } catch(e){process.stderr.write(JSON.stringify({error:e.message})+'\n');process.exitCode=1;}
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url))await main();
