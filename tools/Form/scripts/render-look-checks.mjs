#!/usr/bin/env node
// Offline maintainer evidence for whole looks; installs nothing and blocks external requests.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,existsSync,realpathSync} from 'node:fs';
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
export async function run(output) {
 output=screen(output);
 const local=relative(tool,output);
 if(local===''||(!isAbsolute(local)&&local!=='..'&&!local.startsWith(`..${sep}`))||existsSync(output))throw Error('Use a new output directory outside this tool.');
 const sets=Object.entries(tapSets);
 mkdirSync(output,{recursive:true});
 const kit=await browserKit(),record={pageBytes:kit.pageBytes,forms:{},renders:[],looks:[],measurements:[],requests:[],prototypeComparison:{status:'dropped',reason:'The prototype has eight looks; the current twelve-look selection, including four plain grounds, has no matching prototype baseline.'}};
 try {
  for(const [fixture,get]of sets) {
   const slug=fixture==='firstStrategy'?'first-strategy':fixture;
   const answers=get(),result=select('looks',answers,{check:true}),form=lookForm(answers,result);
   form.title=fixture==='operator'?'Step 3 of 6: how it should look':'Step 4 of 7: how it should look';
   assert.deepEqual(checkForm(form),{ok:true,problems:[]});
   assert.equal(form.questions[0].options.length,12);
   const plain=[2,5,8,11];
   assert.deepEqual(result.selection.boards.flatMap((b,i)=>b.graphicSet.pattern?.strength.light===0&&b.graphicSet.pattern?.strength.dark===0?[i+1]:[]),plain);
   const save=(file,data)=>writeFileSync(resolve(output,file),data,{flag:'wx'});
   save(`${slug}-form.json`,JSON.stringify(form,null,2)+'\n');
   record.forms[slug]={bytes:Buffer.byteLength(JSON.stringify(form)),options:form.questions[0].options.length,replacements:result.replacements,parts:result.positions};
   for(const width of [390,734])for(const theme of ['light','dark']) {
    const h=await kit.open(form,width,theme,{touch:true});
    try {
     assert.equal(await h.f.locator('.look-art').count(),12);
     for(const number of plain)assert.equal(await h.f.locator('.look-art').nth(number-1).locator('.look-pattern').getAttribute('opacity'),'0');
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
   // Capture and check every current drawing at native size. The obsolete
   // eight-look prototype comparison is deliberately dropped, not re-baselined.
   const h=await kit.open(form,734,'light');
   try {
    await h.frame.evaluate(()=>{
     const drawings=[...document.querySelectorAll('.look-art')];document.body.replaceChildren(...drawings);document.body.style.width='600px';
     for(const n of drawings){n.style.width='600px';n.style.height='360px';}WiserBoardView.fitLooks();
    });
    await h.page.locator('iframe').evaluate(n=>{n.style.width='600px';n.style.height='5000px';});
    assert.equal(await h.f.locator('.look-art').count(),12);
    for(let i=0;i<12;i++) {
     const drawing=h.f.locator('.look-art').nth(i);
     const measured=await drawing.evaluate(n=>({width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height,patternOpacity:Number(n.querySelector('.look-pattern').getAttribute('opacity'))}));
     assert.equal(measured.width,600);assert.equal(measured.height,360);
     assert.equal(measured.patternOpacity===0,plain.includes(i+1));
     const file=`${slug}-look-${i+1}.png`;await drawing.screenshot({path:resolve(output,file)});record.renders.push(file);
     record.looks.push({brand:slug,number:i+1,file,plainGround:plain.includes(i+1),...measured});
    }
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
  if(!args.length||args.includes('--help')){process.stdout.write('Usage: node scripts/render-look-checks.mjs --output <new-absolute-directory>\nOffline evidence for all twelve looks and four plain grounds; the obsolete eight-look prototype comparison is dropped. Legacy --prototype <absolute-directory> is accepted but never read. Requires existing development packages, browser and font pack. Installs nothing.\n');return;}
  if(![2,4].includes(args.length)||args[0]!=='--output'||(args.length===4&&(args[2]!=='--prototype'||!isAbsolute(args[3]))))throw Error('Use --output <new-absolute-directory>; see --help.');
  const record=await run(args[1]);process.stdout.write(JSON.stringify({output:args[1],forms:record.forms,renders:record.renders.length,looks:record.looks.length,prototypeComparison:record.prototypeComparison})+'\n');
 } catch(e){process.stderr.write(JSON.stringify({error:e.message})+'\n');process.exitCode=1;}
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url))await main();
