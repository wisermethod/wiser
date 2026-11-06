// Offline maintainer capture. Uses the hosted browserKit, with intercepted local
// fonts only. Usage: node tests/render-whole-board.mjs /absolute/output
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,isAbsolute} from 'node:path';
import {browserKit,onlyFonts} from './boards-harness.js';
import {wholeBoardForms} from './whole-board-fixtures.js';
import {measureWholeBoard} from './whole-board-measure.js';
const output=process.argv[2];
assert.ok(output&&isAbsolute(output),'Supply an absolute output directory.');
assert.ok(!resolve(output).split(/[\\/]/).some(p=>p==='memory'||/^\.env(?:\.|$)/i.test(p)),'Private paths are refused.');
mkdirSync(output,{recursive:true});
const kit=await browserKit(),measurements=[];
try{
 for(const business of ['bakery','politician'])for(const kept of [false,true]){
  const forms=wholeBoardForms(business,kept);
  for(const page of ['round1','variations'])for(const theme of ['light','dark'])for(const width of [734,390]){
   const form=forms[page],h=await kit.open(form,width,theme);
   try{
    const measured=await measureWholeBoard(h,form,theme);
    assert.ok(measured.height<5000);assert.equal(measured.thumbnails,12);
    assert.ok(measured.unchanged&&measured.inputElements<1000);assert.equal(measured.elementsBefore,measured.elementsAfter);
    assert.deepEqual(measured.clippedText,[]);
    const name=`${business}-${page}-${kept?'kept':'plain'}-${theme}-${width}`;
    await h.page.locator('iframe').evaluate((n,height)=>n.style.height=height+'px',measured.height+2);
    await h.f.locator('#root').screenshot({path:resolve(output,name+'.png')});
    if(business==='bakery'&&!kept&&page==='round1'&&theme==='light'&&width===390){
     await h.f.locator('.boards-tile').first().screenshot({path:resolve(output,'bakery-thumbnail.png')});
     await h.f.locator('.board-thumbnail:has(.thumbnail-patch .thumbnail-badge)').first().screenshot({path:resolve(output,'bakery-recommended-thumbnail.png')});
     await h.f.locator('.boards-tile:not(:has(.thumbnail-badge)) .board-thumbnail').first().screenshot({path:resolve(output,'bakery-other-thumbnail.png')});
     await h.f.locator('.board-thumbnail').first().click();
     const height=await h.f.locator('#root').evaluate(n=>Math.ceil(n.getBoundingClientRect().height));
     await h.page.locator('iframe').evaluate((n,height)=>n.style.height=height+'px',height+2);
     await h.f.locator('#root').screenshot({path:resolve(output,'bakery-full-size-from-thumbnail.png')});
    }
    assert.ok(onlyFonts(h.requests));assert.deepEqual(h.errors,[]);
    measurements.push({business,page,kept,theme,width,...measured,render:name+'.png'});
   }finally{await h.context.close();}
  }
 }
 const json=JSON.stringify({heightLimit:5000,inputElementLimit:1000,measurements},null,2)+'\n';
 writeFileSync(resolve(output,'measurements.json'),json);
 writeFileSync(new URL('whole-board-measurements.json',import.meta.url),json);
 console.log(JSON.stringify({pages:measurements.length,pngs:measurements.length+4,maxHeight:Math.max(...measurements.map(m=>m.height)),output}));
}finally{await kit.browser.close();}
