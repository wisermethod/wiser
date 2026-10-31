#!/usr/bin/env node
// Offline maintainer captures; existing packages, browser and local font pack only.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync,realpathSync,existsSync,statSync} from 'node:fs';
import {resolve,dirname,basename,isAbsolute,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {checkForm,FORM_LIMITS} from './format.js';
const tool=fileURLToPath(new URL('..',import.meta.url));
function screen(path){
 if(!isAbsolute(path))throw Error('Use absolute paths; see --help.');
 let parent=path,tail=[];
 while(!existsSync(parent)){tail.unshift(basename(parent));const next=dirname(parent);if(next===parent)throw Error('Cannot resolve path.');parent=next;}
 const result=resolve(realpathSync(parent),...tail);
 if(result.split(sep).some(p=>p==='memory'||/^\.env(?:\.|$)/i.test(p)))throw Error('Private paths are refused.');return result;
}
export async function run(formPath,output){
 formPath=screen(formPath);output=screen(output);
 const local=relative(tool,output);
 if(local===''||(!isAbsolute(local)&&local!=='..'&&!local.startsWith(`..${sep}`))||existsSync(output))throw Error('Use a new output directory outside this tool.');
 if(!statSync(formPath).isFile()||statSync(formPath).size>FORM_LIMITS.inputFileBytesMax)throw Error('Use a form file under 262144 bytes.');
 const form=JSON.parse(readFileSync(formPath,'utf8'));assert.deepEqual(checkForm(form),{ok:true,problems:[]});
 const {browserKit,onlyFonts}=await import('../tests/boards-harness.js');
 const kit=await browserKit();mkdirSync(output,{recursive:true});
 const record={pageBytes:kit.pageBytes,formBytes:statSync(formPath).size,compactFormBytes:Buffer.byteLength(JSON.stringify(form)),renders:[],requests:[]};
 try{
  for(const name of ['chatgpt','Claude'])for(const width of [734,390])for(const theme of ['light','dark'])for(const state of ['none-picked','one-picked','two-picked','first-row-open','third-row-open','cap5000-fallback']){
   const capped=state==='cap5000-fallback',cap=capped?5000:name==='Claude'?20000:undefined;
   const h=await kit.open(form,width,theme,{name,autoSize:true,containerDimensions:cap?{maxHeight:cap,width}:undefined});
   try{
    if(state!=='none-picked')await h.f.locator('.boards-tile').first().click();
    if(state==='two-picked')await h.f.locator('.boards-tile').nth(1).click();
    let formerTop;
    if(state.endsWith('-open')||capped){
     const index=state==='third-row-open'?(width===734?4:2):0;
     formerTop=await h.f.locator('.board-option').nth(index).evaluate(n=>n.getBoundingClientRect().top+scrollY);
     await h.f.locator('.see-board').nth(index).click();
    }
    const measured=await h.frame.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,height:document.getElementById('root').getBoundingClientRect().height,viewerTop:(()=>{const n=document.querySelector('.board-viewer');return n?n.getBoundingClientRect().top+scrollY:null;})(),fallback:Boolean(document.querySelector('.board-focus')),actions:[...document.querySelectorAll('.board-actions button')].filter(n=>n.getClientRects().length).map(n=>n.innerText)}));
    assert.ok(measured.scrollWidth<=measured.clientWidth,JSON.stringify(measured));
    if(formerTop!==undefined&&!capped)assert.ok(Math.abs(formerTop-measured.viewerTop)<1);
    if(capped)assert.equal(measured.fallback,true);
    // Full-content evidence also includes the foot of a narrow card taller than the host cap.
    await h.page.locator('iframe').evaluate((n,height)=>n.style.height=`${Math.ceil(height)+1}px`,measured.height);
    await h.frame.evaluate(()=>scrollTo(0,0));
    const prefix=`${name.toLowerCase()}-${width}-${theme}-${state}`,full=prefix+'.png',actions=prefix+'-actions.png';
    await h.f.locator('#root').screenshot({path:resolve(output,full)});
    await h.f.locator('.board-actions').screenshot({path:resolve(output,actions)});
    let top;
    if(formerTop!==undefined){top=prefix+'-viewer-top.png';await h.page.evaluate(()=>scrollTo(0,0));await h.frame.evaluate(()=>scrollTo(0,0));const box=await h.f.locator('.board-viewer').boundingBox();await h.page.screenshot({path:resolve(output,top),fullPage:true,clip:{x:box.x,y:box.y,width:box.width,height:Math.min(720,box.height)}});}
    assert.ok(onlyFonts(h.requests));assert.deepEqual(h.errors,[]);
    record.renders.push({name,width,theme,state,cap,full,actionsFile:actions,top,formerTop,...measured});record.requests.push(...h.requests);
   }finally{await h.context.close();}
  }
  record.requests=[...new Set(record.requests)];writeFileSync(resolve(output,'record.json'),JSON.stringify(record,null,2)+'\n',{flag:'wx'});return record;
 }finally{await kit.browser.close();}
}
async function main(){
 try{
  const args=process.argv.slice(2);for(const a of args.filter(a=>a.startsWith('-')))if(!['--help','--form','--output'].includes(a))throw Error(`Unknown option ${a}; see --help.`);
  if(!args.length||args.includes('--help')){process.stdout.write('Usage: node scripts/render-boards-actions-checks.mjs --form <absolute-form.json> --output <new-absolute-directory>\nOffline boards actions and viewer evidence. Uses existing development packages, browser and local fonts. Installs nothing.\n');return;}
  if(args.length!==4||args[0]!=='--form'||args[2]!=='--output')throw Error('Use --form and --output; see --help.');
  const r=await run(args[1],args[3]);process.stdout.write(JSON.stringify({output:args[3],pageBytes:r.pageBytes,formBytes:r.formBytes,renders:r.renders.length})+'\n');
 }catch(e){process.stderr.write(JSON.stringify({error:e.message})+'\n');process.exitCode=1;}
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url))await main();
