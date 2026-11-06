import '../../lib/tests/isolated-home.js';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {resolveBoards} from '../scripts/boards.js';
import {checkForm} from '../scripts/format.js';
import {lookForm} from './board-fixtures.js';
import {composePage} from '../scripts/page.js';
import {launch} from '../../lib/browser-runtime/browser-runtime.js';
import {validateBrandBoards,createBoardModel} from '../engine/boards-lib.js';
import {acceptedDepths,rejectedDepths,gradientCases,styleDepths,nullDepths,hueTieStops,exactHueTieSource} from '../../Contact Sheet/tests/depth-cases.js';
const spec=JSON.parse(readFileSync(new URL('../../Contact Sheet/tests/fixtures/brand-boards.json',import.meta.url)));
spec.boards=spec.boards.slice(0,1);spec.groups=spec.groups.filter(g=>g.id===spec.boards[0].group);
const valid=validateBrandBoards(spec,{add(path){return {path};}},()=>{}),model=createBoardModel(valid);
const parts=JSON.parse(readFileSync(new URL('../../../skills/Build Brand/parts/parts.json',import.meta.url)));
const headings=['Instrument Serif','Bricolage Grotesque'].map(family=>parts.pairings.find(p=>p.type.heading.family===family).type.heading);
// Match boards-harness: select a pack file that covers the approved style weight.
const packFonts=headings.map(heading=>{
 const weight=heading.sizes.display.weight;
 const local=parts.fonts[heading.family].files.find(f=>{const r=Array.isArray(f.weight)?f.weight:[f.weight,f.weight];return r[0]<=weight&&r[1]>=weight;});
 return {family:heading.family,weight:local.weight,style:local.style,data:readFileSync(new URL('../../../skills/Build Brand/parts/'+local.path,import.meta.url)).toString('base64')};
});
let browser,page;const requests=[];
before(async()=>{
 const bundled=await build({entryPoints:[fileURLToPath(new URL('../engine/boards-lib.js',import.meta.url))],bundle:true,format:'iife',globalName:'WiserBoards',write:false});
 browser=await launch({headless:true,timeout:30000});page=await browser.newPage({viewport:{width:600,height:360},deviceScaleFactor:1,serviceWorkers:'block'});
 await page.route('**/*',route=>{requests.push(route.request().url());return route.abort();});
 await page.setContent('<!doctype html><style>body{margin:0}.look-art{display:block;width:600px;height:360px;overflow:visible}</style><div id="stage"></div>');
 await page.addScriptTag({content:bundled.outputFiles[0].text});await page.addScriptTag({content:readFileSync(new URL('../engine/boards.js',import.meta.url),'utf8')});

 await page.evaluate(async({model,packFonts})=>{
  globalThis.depthModel=model;
  for(const f of packFonts){const face=new FontFace(f.family,`url(data:font/woff2;base64,${f.data})`,{weight:Array.isArray(f.weight)?f.weight.join(' '):String(f.weight),style:f.style});document.fonts.add(face);await face.load();}await document.fonts.ready;
  globalThis.drawDepth=(depth,edit={})=>{const b=structuredClone(depthModel.boards[0]);b.depth=depth;Object.assign(b,edit);return WiserBoardView.look(depthModel,b);};
 },{model,packFonts});
});
after(async()=>{await browser?.close();assert.deepEqual(requests,[]);});
test('direct look shares the complete closed depth schema with validation',async()=>{
 const cases=rejectedDepths.map(([depth,error])=>({depth,error:error.source}));
 const results=await page.evaluate(({accepted,cases})=>{
  const results=[];
  for(const depth of accepted){try{const n=drawDepth(depth);results.push({ok:n.hasAttribute('data-depth'),depth});}catch(e){results.push({ok:false,error:e.message,depth});}}
  for(const {depth,error} of cases){let message='';try{drawDepth(depth);}catch(e){message=e.message;}results.push({ok:new RegExp(error).test(message),depth,message,error});}
  return results;
 },{accepted:acceptedDepths,cases});
 assert.deepEqual(results.filter(r=>!r.ok),[]);
});
test('direct look checks purple-to-blue, tonal and near-neutral pairs on every gradient surface',async()=>{
 const results=await page.evaluate(cases=>cases.flatMap(([from,to,allowHueShift,error])=>['ground','block','third'].map(surface=>{
  const b=structuredClone(depthModel.boards[0]),mode=b.primaryMode;
  b.palette[mode][surface==='block'?'pop':'ground']=from;
  b.depth=surface==='block'?{block:{gradient:true},popTo:to,allowHueShift}:{background:'gradient',groundTo:surface==='third'?'ground':to,...(surface==='third'?{groundThird:to}:{}),allowHueShift};
  let message='',svg;try{svg=WiserBoardView.look(depthModel,b);}catch(e){message=e.message;}
  return {from,to,surface,message,ok:error?new RegExp(error).test(message):!message&&!!svg.querySelector('linearGradient')};
 })),gradientCases.map(([a,b,c,e])=>[a,b,c,e?.source]));
 assert.deepEqual(results.filter(r=>!r.ok),[]);
 const message=await page.evaluate(()=>{const b=structuredClone(depthModel.boards[0]);b.depth={};b.palette[b.primaryMode].headline='url(#ink)';try{WiserBoardView.look(depthModel,b);}catch(e){return e.message;}});
 assert.match(message,/gradient text is forbidden/);
});
test('five marks use their specified surface and solid ink roles, including every ground ink choice',async()=>{
 const rows=await page.evaluate(()=>{
  const rows=[],c=depthModel.boards[0].palette[depthModel.boards[0].primaryMode];
  for(const ink of ['pop','mark','deep','text','headline'])for(const [mark,on] of [['badge','block'],['letter','block'],['initials','ground'],['seal','ground'],['seal','block'],['stack','ground'],['stack','block']]) {
   const n=drawDepth({mark,ink,...(mark==='seal'?{seal:{on}}:mark==='stack'?{stack:{on}}:{})});
   rows.push({mark,on,ink,kind:n.dataset.mark,block:!!n.querySelector('.look-block'),fills:[...n.querySelectorAll('.look-mark-text')].map(t=>t.getAttribute('fill')),expected:on==='block'?c.onPop:c[ink],rule:n.querySelector('.look-stack-rule')?.getAttribute('stroke'),ring:n.querySelector('.look-seal-ring')?.getAttribute('stroke')});
  }
  return rows;
 });
 for(const row of rows){assert.equal(row.kind,row.mark);assert.equal(row.block,row.on==='block');assert.ok(row.fills.length>0);assert.ok(row.fills.every(fill=>fill===row.expected));if(row.rule)assert.equal(row.rule,row.expected);if(row.ring)assert.equal(row.ring,row.expected);}
});
test('six band retains exact geometry, order, inside hairline and placement behind all marks',async()=>{
 const rows=await page.evaluate(()=>['badge','initials','seal','letter','stack'].map(mark=>{
  const n=drawDepth({mark,band:'six'}),surface=n.querySelector('.look-surface'),rule=n.querySelector('.look-band-rule');
  return {bands:[...n.querySelectorAll('.look-band')].map(t=>Object.fromEntries(['data-role','x','y','width','height','fill'].map(k=>[k,t.getAttribute(k)]))),rule:rule&&Object.fromEntries(['x','y','width','height','fill'].map(k=>[k,rule.getAttribute(k)])),behind:rule&&[...surface.children].indexOf(rule)<[...surface.children].indexOf(n.querySelector('.look-name'))};
 }));
 const c=model.boards[0].palette[model.boards[0].primaryMode];
 for(const row of rows){assert.deepEqual(row.bands,['ground','panel','text','pop','deep','mark'].map((role,i)=>({'data-role':role,x:String(i*100),y:'302',width:'100',height:'58',fill:c[role]})));assert.deepEqual(row.rule,{x:'0',y:'302',width:'600',height:'1',fill:c.hairline});assert.equal(row.behind,true);}
});
test('depth geometry retains two-unit badge overlap, unique ids, clipping, textures and user-space gradients',async()=>{
 const r=await page.evaluate(()=>{
  const host=document.getElementById('stage');host.replaceChildren();
  const badge=drawDepth({background:'gradient',groundTo:'panel',groundThird:'ground',gradient:'radial',block:{corner:'pill',inset:'darker'},card:{corner:28}},{monogram:{...depthModel.boards[0].monogram,surfaces:{ground:{radius:0}}}});
  host.append(badge,drawDepth({mark:'seal',seal:{on:'block'},card:{corner:16}}),drawDepth({mark:'letter',block:{corner:12}}),drawDepth({mark:'stack'}));
  const plate=badge.querySelector('.look-plate'),ids=[...host.querySelectorAll('[id]')].map(n=>n.id),linear=drawDepth({background:'gradient',groundTo:'panel',angle:120}).querySelector('linearGradient');
  const dx=Number(linear?.getAttribute('x2'))-Number(linear?.getAttribute('x1')),dy=Number(linear?.getAttribute('y2'))-Number(linear?.getAttribute('y1'));
  return {depth:badge.dataset.depth,plate:plate&&['x','y','width','height'].map(k=>plate.getAttribute(k)),ids,stops:[...badge.querySelectorAll('radialGradient stop')].map(n=>n.getAttribute('offset')),cardClip:badge.querySelector('.look-surface').getAttribute('clip-path'),clips:host.querySelectorAll('.look-mark-clip').length,angle:(Math.atan2(dx,-dy)*180/Math.PI+360)%360,inset:badge.querySelector('.look-inset')?.getAttribute('fill'),plain:drawDepth({}).querySelectorAll('.look-pattern,.look-grain').length,grain:drawDepth({background:'texture',texture:'grain'}).querySelector('feTurbulence')?.getAttribute('seed'),pattern:drawDepth({background:'texture'}).querySelectorAll('.look-pattern').length};
 });
 assert.equal(r.depth,'gradient');assert.deepEqual(r.plate,['416','103','116','116']);assert.equal(new Set(r.ids).size,r.ids.length);assert.deepEqual(r.stops,['0','0.65','1']);assert.match(r.cardClip,/url\(#depth-clip-/);assert.equal(r.clips,2);assert.ok(Math.abs(r.angle-120)<.001);assert.match(r.inset,/^#[A-F\d]{6}$/);assert.equal(r.plain,0);assert.equal(r.grain,'17');assert.equal(r.pattern,1);
});
test('whole RF and HBL ink fits the loaded face on every band and card corner without scaling or clipping',async()=>{
 const rows=[];
 for(const heading of headings)for(const initials of ['RF','HBL'])for(const band of ['six','three','strip','none'])for(const corner of [0,16,28]) {
  const row=await page.evaluate(({heading,initials,band,corner})=>{
   const b=structuredClone(depthModel.boards[0]);b.monogram.initials=initials;b.depth={mark:'initials',band,card:{corner}};
   const style=heading.sizes.display;b.textStyles.headline={...b.textStyles.headline,family:heading.family,weight:style.weight,variations:style.variations};
   const svg=WiserBoardView.look(depthModel,b);document.getElementById('stage').replaceChildren(svg);WiserBoardView.fitLooks();
   const glyph=svg.querySelector('.look-large-initials');if(!glyph)return {initials,band,corner,missing:true};
   // Rasterize the live SVG with its loaded document font; SVG images have an isolated font set.
   svg.style.background='#000';for(const n of svg.querySelector('.look-surface').querySelectorAll('*'))n.style.visibility='hidden';
   glyph.style.visibility='visible';glyph.setAttribute('fill','#fff');
   const face=getComputedStyle(glyph),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
   ctx.font=`${face.fontStyle} ${face.fontWeight} 100px ${face.fontFamily}`;
   const ink=letter=>{const m=ctx.measureText(letter);return [m.width,m.actualBoundingBoxLeft,m.actualBoundingBoxRight,m.actualBoundingBoxAscent,m.actualBoundingBoxDescent];};
   const missingInk=ink('\u0378'),letters=Object.fromEntries([...new Set('RFHBL')].map(letter=>[letter,ink(letter)]));
   return {family:heading.family,loaded:document.fonts.check(`${face.fontWeight} 100px ${JSON.stringify(heading.family)}`),letters,missingInk,initials,band,corner,bottom:band==='six'||band==='three'?302:band==='strip'?352:332,text:glyph.textContent,textLength:glyph.getAttribute('textLength'),lengthAdjust:glyph.getAttribute('lengthAdjust'),transform:glyph.getAttribute('transform')};
  },{heading,initials,band,corner});
  if(!row.missing){
   const png=(await page.locator('#stage > svg').screenshot()).toString('base64');
   Object.assign(row,await page.evaluate(async({png,bottom})=>{
    const img=new Image();img.src='data:image/png;base64,'+png;await img.decode();
    const canvas=document.createElement('canvas');canvas.width=600;canvas.height=360;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);
    const pixels=ctx.getImageData(0,0,600,360).data;let minX=600,maxX=-1,maxY=-1,outside=0,count=0;
    for(let y=0;y<360;y++)for(let x=0;x<600;x++){const i=(y*600+x)*4;if(pixels[i]||pixels[i+1]||pixels[i+2]){count++;minX=Math.min(minX,x);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);if(x<360||x>=572||y>=bottom)outside++;}}
    return {count,minX,maxX,maxY,outside};
   },{png,bottom:row.bottom}));
  }
  rows.push(row);
 }
 assert.equal(rows.length,48);
 for(const r of rows){assert.equal(r.missing,undefined,JSON.stringify(r));assert.equal(r.loaded,true);for(const [letter,ink] of Object.entries(r.letters))assert.notDeepEqual(ink,r.missingInk,`${r.family} ${letter} is the missing-glyph box`);assert.equal(r.text,r.initials);assert.ok(r.count>0,JSON.stringify(r));assert.equal(r.outside,0,JSON.stringify(r));assert.ok(Math.abs(r.maxY+1-r.bottom)<=1,JSON.stringify(r));assert.equal(r.textLength,null);assert.equal(r.lengthAdjust,null);assert.equal(r.transform,null);}
});
test('ten approved depth recipes validate, survive modelling and draw without post-model overlays',async()=>{
 const results=await page.evaluate(({spec,recipes})=>recipes.map(depth=>{
  const input=structuredClone(spec);input.boards[0].depth=depth;
  const checked=WiserBoards.validateBrandBoards(input,{add(path){return {path};}},()=>{}),m=WiserBoards.createBoardModel(checked),svg=WiserBoardView.look(m,m.boards[0]);
  return {depth:m.boards[0].depth,mark:svg.dataset.mark,background:svg.dataset.depth,bands:svg.querySelectorAll('.look-band').length};
 }),{spec,recipes:styleDepths});
 for(const [i,r] of results.entries()){assert.deepEqual(r.depth,styleDepths[i]);assert.equal(r.mark,styleDepths[i].mark);assert.equal(r.background,styleDepths[i].background);assert.equal(r.bands,6);}
});

test('the composed Form page exposes the shared depth rules to its actual look renderer',async()=>{
 const actual=await browser.newPage();try{
  await actual.route('**/*',route=>route.abort());await actual.setContent(composePage({script:''}));
  const result=await actual.evaluate(model=>{
   const b=structuredClone(model.boards[0]);b.depth={mark:'stack',stack:{on:'ground'},band:'six'};
   const svg=WiserBoardView.look(model,b);return {mark:svg.dataset.mark,bands:svg.querySelectorAll('.look-band').length};
  },model);
  assert.deepEqual(result,{mark:'stack',bands:6});
 }finally{await actual.close();}
});

test('direct look refuses null in every depth field with the validator message',async()=>{
 const results=await page.evaluate(cases=>cases.map(([depth,error])=>{
  let message='';try{drawDepth(depth);}catch(e){message=e.message;}
  return {depth,error,message,ok:new RegExp(error).test(message)};
 }),nullDepths.map(([depth,error])=>[depth,error.source]));
 assert.deepEqual(results.filter(r=>!r.ok),[]);
});
test('undefined depth is absent to both validation and direct look',async()=>{
 const result=await page.evaluate(spec=>{
  const input=structuredClone(spec);input.boards[0].depth=undefined;
  const checked=WiserBoards.validateBrandBoards(input,{add(path){return {path};}},()=>{}),m=WiserBoards.createBoardModel(checked);
  const b=m.boards[0],modelHasDepth=Object.hasOwn(b,'depth'),absent=WiserBoardView.look(m,b);b.depth=undefined;const present=WiserBoardView.look(m,b);
  const summary=n=>({depth:n.hasAttribute('data-depth'),mark:n.hasAttribute('data-mark'),initials:n.querySelector('.look-initials')?.textContent,patterns:n.querySelectorAll('.look-pattern').length});
  return {modelHasDepth,absent:summary(absent),present:summary(present)};
 },spec);
 // The model omitted depth before the direct-call fixture deliberately supplied undefined.
 assert.equal(result.modelHasDepth,false);assert.deepEqual(result.absent,result.present);assert.equal(result.present.depth,false);assert.equal(result.present.mark,false);
});
test('badge ground plate fills onPop and its whole initials use pop',async()=>{
 const container=parts.containers.find(c=>c.id==='filled-square');
 const result=await page.evaluate(({container,spec})=>{
  const input=structuredClone(spec),b=input.boards[0];b.depth={mark:'badge'};
  b.monogram.container=container.svg;b.monogram.surfaces={ground:{background:'ground',ink:'headline',frame:'headline',radius:container.plate.radius}};
  const checked=WiserBoards.validateBrandBoards(input,{add(path){return {path};}},()=>{}),m=WiserBoards.createBoardModel(checked),board=m.boards[0],c=board.palette[board.primaryMode],svg=WiserBoardView.look(m,board);
  return {plate:svg.querySelector('.look-plate')?.getAttribute('fill'),ink:svg.querySelector('.look-initials')?.getAttribute('fill'),initials:svg.querySelector('.look-initials')?.textContent,expected:{onPop:c.onPop,pop:c.pop,initials:board.monogram.initials}};
 },{container,spec});
 assert.equal(result.plate,result.expected.onPop);assert.equal(result.ink,result.expected.pop);assert.equal(result.initials,result.expected.initials);assert.notEqual(result.plate,result.ink);
});
test('exact 180-degree hue tie checks both arcs in direct ground and block drawing',async()=>{
 const boundary=await browser.newPage();try{
  const source=exactHueTieSource(readFileSync(new URL('../engine/boards-lib.js',import.meta.url),'utf8'));
  await boundary.addScriptTag({content:source.replace(/\bexport /g,'')+';globalThis.WiserBoards={depthLch};'});
  await boundary.addScriptTag({content:readFileSync(new URL('../engine/boards.js',import.meta.url),'utf8')});
  const result=await boundary.evaluate(({model,stops})=>{
   const measured=stops.map(WiserBoards.depthLch),results=[];
   for(const surface of ['ground','block'])for(const pair of [stops,[...stops].reverse()]){
    const b=structuredClone(model.boards[0]);b.palette[b.primaryMode][surface==='ground'?'ground':'pop']=pair[0];
    b.depth=surface==='ground'?{background:'gradient',groundTo:pair[1],allowHueShift:true}:{block:{gradient:true},popTo:pair[1],allowHueShift:true};
    let message='';try{WiserBoardView.look(model,b);}catch(e){message=e.message;}results.push({surface,pair,message});
   }
   return {measured,results};
  },{model,stops:hueTieStops});
  assert.deepEqual(result.measured.map(c=>c.H),[70,250]);assert.equal(result.measured[1].H-result.measured[0].H,180);assert.ok(result.measured.every(c=>c.C>=.025));
  for(const r of result.results)assert.match(r.message,/purple-to-blue.*60.0 degrees/,JSON.stringify(r));
 }finally{await boundary.close();}
});

test('look steps without board depth or step depth keep the option legacy drawing in both modes',async()=>{
 for(const depth of [undefined,{}, {dark:{}}]) {
  const form=lookForm(),q=form.questions[0];q.options=q.options.slice(0,1);q.pick=1;delete q.min;q.controls={mode:q.options[0].board.primaryMode};
  const o=q.options[0];delete o.board.depth;o.steps=[{value:o.value,palette:structuredClone(o.board.palette),...(depth===undefined?{}:{depth})}];
  assert.deepEqual(checkForm(form),{ok:true,problems:[]});
  const model=resolveBoards(form.brand,[o],{},'look');
  for(const mode of ['light','dark']) {
   const step=model.steps[0][0].boards[mode];assert.equal(Object.hasOwn(step,'depth'),false);
   const legacy=resolveBoards(form.brand,[{...o,board:{...o.board,primaryMode:mode}}]).boards[0];
   const drawings=await page.evaluate(({model,step,legacy})=>{
    // Instance ids vary with each draw; normalize only those generated ids.
    const draw=b=>WiserBoardView.look(model,b).outerHTML.replace(/repeat-\d+/g,'repeat-ID').replace(/drawing-\d+-/g,'drawing-ID-');
    return [draw(step),draw(legacy)];
   },{model,step,legacy});
   assert.equal(drawings[0],drawings[1]);
  }
 }
});
