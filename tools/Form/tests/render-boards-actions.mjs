// Offline evidence for extra picks, the one-look action and the full-size link.
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
  for(const name of ['chatgpt','Claude'])for(const theme of ['light','dark'])for(const state of ['boards-4','looks-1','looks-4','tile-row']){
   const board=state==='boards-4'||state==='tile-row',form=board?boards:looks,width=734;
   const h=await kit.open(form,width,theme,{name,autoSize:true,containerDimensions:name==='Claude'?{maxHeight:5000,width}:undefined});
   try{
    await h.frame.evaluate(()=>{
     window.__scrolls=[];const original=Element.prototype.scrollIntoView;
     Element.prototype.scrollIntoView=function(options){__scrolls.push({bar:this.classList.contains('board-viewer-bar'),block:options?.block});return original.call(this,options);};
    });
    const count=state==='tile-row'?0:Number(state.at(-1));
    for(let i=0;i<count;i++)await h.f.locator('.looks-tile, .boards-tile:not(.looks-tile) .tile-input').nth(i).click();
    await h.frame.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const measured=await h.frame.evaluate(()=>({
     height:document.getElementById('root').getBoundingClientRect().height,
     scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,
     visibleTiles:[...document.querySelectorAll('.board-option')].filter(n=>n.getClientRects().length).length,
     viewerFirst:document.querySelector('.boards-tiles')?.firstElementChild.classList.contains('board-viewer'),
     modes:[...new Set([...document.querySelectorAll('.board-viewer .board-art>*')].filter(n=>n.getClientRects().length).map(n=>n.dataset.mode))],
     actions:[...document.querySelectorAll('.board-actions button')].filter(n=>n.getClientRects().length).map(n=>n.innerText),
     disabledActions:[...document.querySelectorAll('.board-actions button')].filter(n=>n.getClientRects().length).map(n=>n.disabled),
     picks:document.querySelectorAll('.tile-input:checked').length,
     thumbnails:[...document.querySelectorAll('.board-thumbnail')].map(n=>{
      const box=n.getBoundingClientRect(),tick=n.parentElement.querySelector('.tile-input').getBoundingClientRect();
      return {gap:tick.top-box.bottom,height:box.height};
     }),
     minimum:document.querySelector('.board-minimum:not([hidden])')?.textContent??null,
     scrolls:__scrolls
    }));
    assert.ok(measured.scrollWidth<=measured.clientWidth);
    assert.equal(measured.picks,count);
    if(board){
     assert.equal(measured.visibleTiles,12);assert.ok(measured.thumbnails.every(n=>n.gap>=0&&n.gap<=8&&n.height>=44));
     assert.deepEqual(measured.actions,state==='boards-4'?['Show me more\nYou picked 4 boards. Pick up to three to go on.']:['Show me more\nNone of these work']);
    }else assert.deepEqual(measured.actions,state==='looks-1'?['Only this one works for me\nand make my boards']:['Use these\nYou picked 4 looks. Pick up to three to go on.']);
    assert.deepEqual(measured.disabledActions,[count===4]);assert.equal(measured.minimum,null);
    const file=`${name.toLowerCase()}-734-${theme}-${state}.png`;
    // A whole-card capture shows all four ticks and the action together; the row stays at normal size.
    await h.page.screenshot({path:resolve(output,file),fullPage:state==='boards-4'});
    assert.ok(onlyFonts(h.requests));assert.deepEqual(h.errors,[]);
    record.renders.push({file,name,theme,state,width,outerScrollY:await h.page.evaluate(()=>scrollY),...measured});
    if(state==='boards-4'){
     await h.f.locator('[data-action=more]').evaluate(n=>n.scrollIntoView({block:'end'}));
     await h.frame.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
     const footer=file.replace('.png','-footer.png');await h.page.screenshot({path:resolve(output,footer)});
     record.renders.push({file:footer,name,theme,state:'boards-4-footer',width,outerScrollY:await h.page.evaluate(()=>scrollY),...measured});
    }
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
