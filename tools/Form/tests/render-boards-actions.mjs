// Offline viewport evidence for the shared full view and the looks' action buttons.
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,readFileSync,realpathSync,statSync,writeFileSync} from 'node:fs';
import {basename,dirname,isAbsolute,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {checkForm,FORM_LIMITS} from '../scripts/format.js';

function checkedPath(path){
 if(typeof path!=='string'||!isAbsolute(path))throw Error('Use absolute paths.');
 let parent=path;const tail=[];
 while(!existsSync(parent)){tail.unshift(basename(parent));parent=dirname(parent);}
 const result=resolve(realpathSync(parent),...tail);
 if(result.split(sep).some(p=>p==='memory'||/^\.env(?:\.|$)/i.test(p)))throw Error('Private paths are refused.');
 return result;
}
function readForm(path){
 path=checkedPath(path);
 if(!statSync(path).isFile()||statSync(path).size>FORM_LIMITS.inputFileBytesMax)throw Error('Use a form file under 262144 bytes.');
 const form=JSON.parse(readFileSync(path,'utf8'));assert.deepEqual(checkForm(form),{ok:true,problems:[]});return form;
}
export async function capture(boardsPath,looksPath,output){
 const boards=readForm(boardsPath),looks=readForm(looksPath);output=checkedPath(output);
 const root=realpathSync(fileURLToPath(new URL('../../../',import.meta.url)));
 if(output===root||output.startsWith(root+sep)||existsSync(output))throw Error('Use a new output directory outside the worktree.');
 assert.equal(boards.questions[0].type,'boards');assert.notEqual(boards.questions[0].view,'look');assert.ok(boards.questions[0].options.length>=6);
 assert.equal(looks.questions[0].view,'look');assert.equal(looks.questions[0].min,2);assert.ok(looks.actions);
 mkdirSync(output,{recursive:true});
 const {browserKit,onlyFonts}=await import('./boards-harness.js');
 const kit=await browserKit(),record={pageBytes:kit.pageBytes,boardsBytes:Buffer.byteLength(JSON.stringify(boards)),looksBytes:Buffer.byteLength(JSON.stringify(looks)),renders:[]};
 try{
  for(const name of ['chatgpt','Claude'])for(const theme of ['light','dark'])for(const state of ['third-row-open','looks-0','looks-1','looks-2']){
   const board=state==='third-row-open',form=board?boards:looks,width=734;
   const h=await kit.open(form,width,theme,{name,autoSize:true,containerDimensions:name==='Claude'?{maxHeight:5000,width}:undefined});
   try{
    await h.frame.evaluate(()=>{
     window.__scrolls=[];const original=Element.prototype.scrollIntoView;
     Element.prototype.scrollIntoView=function(options){__scrolls.push({bar:this.classList.contains('board-viewer-bar'),block:options?.block});return original.call(this,options);};
    });
    if(board){await h.f.locator('.boards-tile').nth(5).click();await h.f.locator('.see-board').nth(5).click();}
    else for(let i=0;i<Number(state.at(-1));i++)await h.f.locator('.looks-tile').nth(i).click();
    await h.frame.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const measured=await h.frame.evaluate(()=>({
     height:document.getElementById('root').getBoundingClientRect().height,
     scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,
     visibleTiles:[...document.querySelectorAll('.board-option')].filter(n=>n.getClientRects().length).length,
     viewerFirst:document.querySelector('.boards-tiles')?.firstElementChild.classList.contains('board-viewer'),
     modes:[...new Set([...document.querySelectorAll('.board-viewer .board-art>*')].filter(n=>n.getClientRects().length).map(n=>n.dataset.mode))],
     actions:[...document.querySelectorAll('.board-actions button')].filter(n=>n.getClientRects().length).map(n=>n.innerText),
     minimum:document.querySelector('.board-minimum:not([hidden])')?.textContent??null,
     scrolls:__scrolls
    }));
    assert.ok(measured.scrollWidth<=measured.clientWidth);
    if(board){
     assert.equal(measured.visibleTiles,0);assert.equal(measured.viewerFirst,true);assert.equal(measured.modes.length,1);
     assert.ok(measured.scrolls.some(s=>s.bar&&s.block==='start'));
     const bar=await h.f.locator('.board-viewer-bar').first().boundingBox();assert.ok(bar.y>=-1&&bar.y+bar.height<=900,JSON.stringify(bar));
    }else assert.deepEqual(measured.actions,state==='looks-0'?['None of these work\nShow me different looks']:state==='looks-2'?['Use these\nand make my boards']:[]);
    const file=`${name.toLowerCase()}-734-${theme}-${state}.png`;
    // Capture the outer viewport where the card's scroll request left it.
    await h.page.screenshot({path:resolve(output,file)});
    assert.ok(onlyFonts(h.requests));assert.deepEqual(h.errors,[]);
    record.renders.push({file,name,theme,state,width,outerScrollY:await h.page.evaluate(()=>scrollY),...measured});
   }finally{await h.context.close();}
  }
  writeFileSync(resolve(output,'record.json'),JSON.stringify(record,null,2)+'\n',{flag:'wx'});return record;
 }finally{await kit.browser.close();}
}
if(!process.env.NODE_TEST_CONTEXT&&process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args=process.argv.slice(2),usage='Usage: node tests/render-boards-actions.mjs --boards <absolute-boards.json> --looks <absolute-looks.json> --output <new-absolute-directory>';
  if(!args.length||args.length===1&&args[0]==='--help')process.stdout.write(usage+'\nOffline viewport captures using existing development packages, browser and local fonts. Installs nothing.\n');
  else{
   if(args.length!==6||args[0]!=='--boards'||args[2]!=='--looks'||args[4]!=='--output')throw Error(usage);
   const result=await capture(args[1],args[3],args[5]);process.stdout.write(JSON.stringify({pageBytes:result.pageBytes,renders:result.renders.length})+'\n');
  }
 }catch(error){process.stderr.write(error.message+'\n');process.exitCode=1;}
}
