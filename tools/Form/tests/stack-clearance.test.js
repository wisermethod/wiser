import '../../lib/tests/isolated-home.js';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {launch} from '../../lib/browser-runtime/browser-runtime.js';
import {resolveBoards} from '../scripts/boards.js';

const parts=JSON.parse(readFileSync(new URL('../../../skills/Build Brand/parts/parts.json',import.meta.url)));
const styles=parts.styles.filter(s=>s.depth.mark==='stack');
const headings=parts.pairings.map(p=>p.type.heading);
const packFonts=headings.map(h=>{
 const f=parts.fonts[h.family].files.find(f=>{const r=Array.isArray(f.weight)?f.weight:[f.weight,f.weight];return f.style==='normal'&&r[0]<=h.sizes.display.weight&&r[1]>=h.sizes.display.weight;});
 assert.ok(f,`installed heading face for ${h.family}`);
 return {family:h.family,weight:f.weight,style:f.style,data:readFileSync(new URL('../../../skills/Build Brand/parts/'+f.path,import.meta.url)).toString('base64')};
});
const brand={name:'Jade Kim Yoga',initials:'JK',sentence:'Make room for good work.',body:'Careful work for people.',words:[{word:'warm',not:'cold'}]};
const cards=styles.flatMap(style=>parts.palettes.filter(p=>!parts.withheld.some(w=>w.style===style.id&&w.palette===p.id)).flatMap(p=>['light','dark'].map(mode=>{
 const depth={...structuredClone(style.depth),...parts.cardDepth.find(d=>d.palette===p.id&&d.style===style.id&&d.mode===mode)?.depth};
 const option={value:'stack',label:style.name,board:{pairing:{id:style.id},palette:{id:p.id},graphicSet:{id:style.graphicSet},container:style.container,primaryMode:mode,depth}};
 return {style:style.id,column:style.column,palette:p.id,mode,model:resolveBoards(brand,[option])};
})));
let browser,page;const requests=[];
before(async()=>{
 const bundle=await build({entryPoints:[fileURLToPath(new URL('../engine/boards-lib.js',import.meta.url))],bundle:true,format:'iife',globalName:'WiserBoards',write:false});
 browser=await launch({headless:true,timeout:30000});page=await browser.newPage({viewport:{width:600,height:360},deviceScaleFactor:1,serviceWorkers:'block'});
 await page.route('**/*',route=>{requests.push(route.request().url());return route.abort();});
 await page.setContent('<!doctype html><style>body{margin:0}.look-art{display:block;width:600px;height:360px}</style><div id="stage"></div>');
 await page.addScriptTag({content:bundle.outputFiles[0].text});
 await page.addScriptTag({content:readFileSync(new URL('../engine/boards.js',import.meta.url),'utf8')});
 await page.evaluate(async fonts=>{
  for(const f of fonts){const face=new FontFace(f.family,`url(data:font/woff2;base64,${f.data})`,{weight:Array.isArray(f.weight)?f.weight.join(' '):String(f.weight),style:f.style});document.fonts.add(face);await face.load();}
  await document.fonts.ready;
  globalThis.stackInk=line=>{
   const s=getComputedStyle(line),canvas=document.createElement('canvas');
   canvas.hidden=true;canvas.style.fontVariationSettings=s.fontVariationSettings;document.body.append(canvas);
   const ctx=canvas.getContext('2d');ctx.font=`${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
   const m=ctx.measureText(line.textContent),em=line.getBBox();
   // The central baseline puts the alphabetic baseline this far down the em box.
   const baseline=em.y+m.fontBoundingBoxAscent;
   const ink=text=>{const m=ctx.measureText(text);return [m.width,m.actualBoundingBoxLeft,m.actualBoundingBoxRight,m.actualBoundingBoxAscent,m.actualBoundingBoxDescent];};
   const result={top:baseline-m.actualBoundingBoxAscent,bottom:baseline+m.actualBoundingBoxDescent,y:Number(line.getAttribute('y')),letters:[...line.textContent].map(ink),missing:ink('\u0378'),loaded:document.fonts.check(`${s.fontWeight} ${s.fontSize} ${s.fontFamily}`)};
   canvas.remove();return result;
  };
  globalThis.fitWithoutStackMoves=()=>{
   const set=SVGElement.prototype.setAttribute;
   SVGElement.prototype.setAttribute=function(name,value){if(name==='y'&&this.matches('.look-stack-1,.look-stack-2'))return;return set.call(this,name,value);};
   try{WiserBoardView.fitLooks();}finally{SVGElement.prototype.setAttribute=set;}
  };
  globalThis.drawStack=(model,initials,heading)=>{
   const b=structuredClone(model.boards[0]);b.monogram.initials=initials;
   if(heading){const v=heading.sizes.display;b.textStyles.headline={...b.textStyles.headline,family:heading.family,weight:v.weight,style:'normal',variations:v.variations};}
   const svg=WiserBoardView.look(model,b);document.getElementById('stage').replaceChildren(svg);return svg;
  };
 },packFonts);
});
after(async()=>{await browser?.close();assert.deepEqual(requests,[]);});

for(const initials of ['JK','QA','RF','HBL'])test(`stack ${initials}: every library stack card clears its rule in both modes`,async t=>{
 const rows=await page.evaluate(({cards,initials})=>cards.map(card=>{
  const svg=drawStack(card.model,initials);fitWithoutStackMoves();
  const first=svg.querySelector('.look-stack-1'),second=svg.querySelector('.look-stack-2'),rule=svg.querySelector('.look-stack-rule').getBBox().y;
  const before={first:stackInk(first),second:stackInk(second)},without=svg.outerHTML;
  WiserBoardView.fitLooks();const after={first:stackInk(first),second:stackInk(second)},withFix=svg.outerHTML;
  WiserBoardView.fitLooks();const repeat=svg.outerHTML;
  first.setAttribute('y',before.first.y);second.setAttribute('y',before.second.y);
  return {style:card.style,column:card.column,palette:card.palette,mode:card.mode,rule,before,after,identical:without===withFix,idempotent:repeat===withFix,onlyY:svg.outerHTML===without};
 }),{cards,initials});
 assert.deepEqual(new Set(rows.map(r=>r.column)),new Set(styles.map(s=>s.column)));
 assert.deepEqual(new Set(rows.map(r=>r.mode)),new Set(['light','dark']));
 for(const r of rows){
  const label=JSON.stringify({initials,style:r.style,palette:r.palette,mode:r.mode,after:r.after});
  for(const line of Object.values(r.after)){assert.equal(line.loaded,true,label);for(const ink of line.letters)assert.notDeepEqual(ink,line.missing,label);}
  assert.ok(r.after.first.bottom<=r.rule-6+.0001,label);
  assert.ok(r.after.second.top>=r.rule+6-.0001,label);
  assert.ok(Math.abs(r.after.first.y-(r.before.first.y-Math.max(0,r.before.first.bottom-(r.rule-6))))<.0001,label);
  assert.ok(Math.abs(r.after.second.y-(r.before.second.y+Math.max(0,r.rule+6-r.before.second.top)))<.0001,label);
  assert.equal(r.onlyY,true,label);assert.equal(r.idempotent,true,label);
  if(initials==='RF'||initials==='HBL')assert.equal(r.identical,true,label);
 }
 t.diagnostic(JSON.stringify({initials,cards:rows.length,firstMoved:rows.filter(r=>r.after.first.y!==r.before.first.y).length,secondMoved:rows.filter(r=>r.after.second.y!==r.before.second.y).length}));
});

test('planted control: disabling stack moves makes JK fail clearance in both modes',async t=>{
 const rows=await page.evaluate(cards=>cards.map(card=>{
  const svg=drawStack(card.model,'JK');fitWithoutStackMoves();
  return {style:card.style,palette:card.palette,mode:card.mode,gap:svg.querySelector('.look-stack-rule').getBBox().y-stackInk(svg.querySelector('.look-stack-1')).bottom};
 }),cards);
 for(const mode of ['light','dark'])assert.ok(rows.some(r=>r.mode===mode&&r.gap<6),`disabled JK must fail in ${mode}`);
 const failures=rows.filter(r=>r.gap<6);t.diagnostic(JSON.stringify({disabledJKFailures:failures.length,minimumGap:Math.min(...rows.map(r=>r.gap))}));
});

test('heading capitals: lower stack lines clear the rule, moving only when their ink needs it',async t=>{
 // The installed pack is Latin-subset WOFF2: include its accented capitals too.
 const capitals=Array.from({length:224},(_,i)=>String.fromCodePoint(i+32)).filter(c=>/\p{Lu}/u.test(c));
 const rows=await page.evaluate(({models,headings,capitals})=>models.flatMap(model=>headings.flatMap(heading=>capitals.map(capital=>{
  const svg=drawStack(model,'R'+capital,heading);fitWithoutStackMoves();
  const line=svg.querySelector('.look-stack-2'),before=stackInk(line),rule=svg.querySelector('.look-stack-rule').getBBox().y;
  WiserBoardView.fitLooks();const after=stackInk(line);
  return {family:heading.family,capital,mode:model.boards[0].primaryMode,before,after,rule};
 }))),{models:['light','dark'].map(mode=>cards.find(c=>c.mode===mode).model),headings,capitals});
 const moved={};
 for(const r of rows){
  const label=JSON.stringify(r);assert.equal(r.after.loaded,true,label);
  assert.notDeepEqual(r.after.letters[1],r.after.missing,label);
  assert.ok(r.after.top>=r.rule+6-.0001,label);
  const needed=Math.max(0,r.rule+6-r.before.top);
  assert.ok(Math.abs(r.after.y-(207+needed))<.0001,label);
  if(needed>0)(moved[r.family]??=new Set()).add(r.capital);
 }
 t.diagnostic(JSON.stringify({headingFamilies:headings.length,capitalsPerFace:capitals.length,measurements:rows.length,secondLineMoves:Object.fromEntries(Object.entries(moved).map(([family,letters])=>[family,[...letters].join('')]))}));
});


test('refitting after a face changes restores an already clear initial to its drawn position',async()=>{
 const result=await page.evaluate(model=>{
  const svg=drawStack(model,'JK'),line=svg.querySelector('.look-stack-1');
  fitWithoutStackMoves();const original=svg.outerHTML,originalFamily=line.style.fontFamily;
  line.style.fontFamily='Marcellus, serif';WiserBoardView.fitLooks();const moved=stackInk(line);
  line.style.fontFamily='Fraunces, serif';WiserBoardView.fitLooks();const restored=stackInk(line);
  // Restore the exact authored family string before comparing all SVG bytes.
  line.style.fontFamily=originalFamily;
  return {moved,restored,identical:original===svg.outerHTML};
 },cards.find(c=>c.style==='hand-made').model);
 assert.ok(result.moved.y<116);assert.ok(result.moved.bottom<=155+.0001);
 assert.equal(result.restored.y,116);assert.ok(result.restored.bottom<=155+.0001);
 assert.equal(result.identical,true);
});

// Measure the rendered lower-line pixels, independently of fitLooks/TextMetrics.
// Four pixels per SVG unit bound raster rounding to one quarter of a unit.
async function lowerStackPixels(card,move) {
 const geometry=await page.evaluate(({model,move})=>{
  const svg=drawStack(model,'RÅ');
  if(move)WiserBoardView.fitLooks();else fitWithoutStackMoves();
  const lower=svg.querySelector('.look-stack-2'),rule=svg.querySelector('.look-stack-rule').getBBox().y;
  svg.querySelector('.look-grain')?.remove();
  svg.style.width='2400px';svg.style.height='1440px';svg.style.background='#000';
  for(const n of svg.querySelector('.look-surface').querySelectorAll('*'))n.style.visibility='hidden';
  lower.style.visibility='visible';lower.setAttribute('fill','#fff');
  // Freeze this drawing so a screenshot viewport resize cannot refit the control.
  svg.classList.remove('look-art');
  return {rule,y:Number(lower.getAttribute('y'))};
 },{model:card.model,move});
 const png=await page.locator('#stage > svg').screenshot();
 const pixels=await page.evaluate(async png=>{
  const image=new Image();image.src='data:image/png;base64,'+png;await image.decode();
  const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
  const context=canvas.getContext('2d');context.drawImage(image,0,0);
  const pixels=context.getImageData(0,0,image.width,image.height).data;
  let first=-1,count=0;
  for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++) {
   const i=(y*image.width+x)*4;
   if(pixels[i]||pixels[i+1]||pixels[i+2]){if(first<0)first=y;count++;}
  }
  return {firstInkRow:first,inkPixels:count,scale:image.width/600};
 },png.toString('base64'));
 assert.ok(pixels.inkPixels>0,'lower-line ink is visible in the raster');
 return {style:card.style,mode:card.mode,...geometry,...pixels,gap:pixels.firstInkRow/pixels.scale-geometry.rule};
}
const rasterCards=styles.flatMap(style=>['light','dark'].map(mode=>cards.find(c=>c.style===style.id&&c.mode===mode&&c.palette==='business-blue-balanced')));

test('lower stacked Å clears the rule by six units measured from rendered pixels in both styles and modes',async t=>{
 for(const card of rasterCards) {
  const row=await lowerStackPixels(card,true),label=JSON.stringify(row);
  assert.ok(row.y>207,'accented lower initial needs a move: '+label);
  assert.ok(row.gap>=6-1/row.scale,label);
  assert.ok(row.gap<=6+2/row.scale,'move leaves only the necessary raster clearance: '+label);
  t.diagnostic(label);
 }
});

test('planted pixel control: disabling the lower-stack move makes Å fail six-unit clearance',async t=>{
 for(const card of rasterCards) {
  const row=await lowerStackPixels(card,false),label=JSON.stringify(row);
  assert.equal(row.y,207,label);
  assert.ok(row.gap<6,'disabled move must fail the pixel clearance check: '+label);
  t.diagnostic(label);
 }
});
