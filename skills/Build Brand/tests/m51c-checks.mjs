import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {AXES,LIBRARY,assemble} from '../scripts/assemble.mjs';
import {boardRefusal} from '../scripts/refusals.mjs';
import {depthOptions} from '../../../tools/Contact Sheet/scripts/board-depth.js';
import {extname} from 'node:path';
import {validateBrandBoards} from '../../../tools/Contact Sheet/scripts/brand-boards.js';
import {checkForm} from '../../../tools/Form/scripts/format.js';

export const library=JSON.parse(readFileSync(LIBRARY));
const taps=JSON.parse(readFileSync(new URL('../parts/taps.json',import.meta.url)));
export const marks=['seal','badge','letter','stack','initials'];
// Parse the final step independently of the selector's family helper.
const parsedPalettes=new Map();
export function parsePaletteId(id) {
  if(parsedPalettes.has(id)) return parsedPalettes.get(id);
  assert.equal(typeof id,'string','palette id is text');
  const split=id.lastIndexOf('-'),family=id.slice(0,split),step=id.slice(split+1);
  assert.ok(split>0&&['muted','balanced','bold'].includes(step),'palette id has a family and step');
  const parsed={family,step};parsedPalettes.set(id,parsed);return parsed;
}
export function darkLedSum(a) {
  const off=new Set(a.off??[]);
  if(off.has('darkLed')) return 0;
  let sum=0;
  for(const question of taps.questions) {
    const answer=question.options.find(option=>option.id===a.taps[question.id]);
    if(answer&&!off.has(answer.id)) sum+=answer.nudges.darkLed??0;
  }
  return sum;
}
export const id=c=>`look-${createHash('sha256').update(`${c.style}/${c.palette}/${c.graphicSet}`).digest('hex').slice(0,32)}`;
export const depth=(palette,style,mode)=>structuredClone({...style.depth,...library.cardDepth.find(d=>d.palette===palette&&d.style===style.id&&d.mode===mode)?.depth});
export function approvedPool() {
  return library.styles.flatMap(s=>library.palettes.filter(p=>!library.withheld.some(w=>w.palette===p.id&&w.style===s.id)).map(p=>({palette:p.id,style:s.id,graphicSet:s.graphicSet,container:s.container})));
}
export function assertPool(pool) {
  assert.equal(pool.length,289,'pool size');
  const seen=new Set();
  for(const c of pool) {
    const s=library.styles.find(s=>s.id===c.style);assert.ok(s,'approved style');
    assert.ok(library.palettes.some(p=>p.id===c.palette),'approved palette');
    assert.equal(c.graphicSet,s.graphicSet,'style graphic set');assert.equal(c.container,s.container,'style container');
    assert.ok(!library.withheld.some(w=>w.palette===c.palette&&w.style===c.style),'withheld version');
    assert.ok(!seen.has(id(c)),'duplicate card');seen.add(id(c));
  }
}
export function assertCoverage(looks) {
  const plain=looks.filter(c=>library.styles.find(s=>s.id===c.style)?.depth.background==='plain');
  assert.ok(plain.length>=2,'two plain-ground styles');
  assert.deepEqual(new Set(looks.map(c=>library.styles.find(s=>s.id===c.style)?.depth.mark)),new Set(marks),'all five marks');
}
export function expectedMode(a) {
  if(a.mode) return a.mode;
  if(a.kept?.primaryMode) return a.kept.primaryMode;
  if(a.off?.includes('darkLed')) return 'light';
  if(a.taps.mode==='dark'&&!a.off?.includes('dark')) return 'dark';
  if(a.taps.mode==='light'&&!a.off?.includes('light')) return 'light';
  return darkLedSum(a)>0?'dark':'light';
}
export function assertCaps(looks) {
  const pairs=looks.map(c=>`${parsePaletteId(c.palette).family}/${c.style}`);
  assert.equal(new Set(pairs).size,looks.length,'unique family/style pairs');
  for(const [field,values] of [['style',looks.map(c=>c.style)],['family',looks.map(c=>parsePaletteId(c.palette).family)]]) {
    for(const value of new Set(values)) assert.ok(values.filter(v=>v===value).length<=2,`at most two per ${field}`);
  }
}
const cardPositions=(l,p,s)=>Object.fromEntries(Object.entries(AXES).map(([axis,[negative,positive]])=>{
  const n=[l.pairings.find(p=>p.id===s.id),p,l.graphics.find(g=>g.id===s.graphicSet)].reduce((sum,p)=>sum+(p.tags[axis]===positive?1:p.tags[axis]===negative?-1:0),0);
  return [axis,n>0?positive:n<0?negative:'either'];
}));
const candidateCache=new WeakMap(),assets=new Map();
export function passingCards(r,a,l=library) {
  if(!candidateCache.has(l)) candidateCache.set(l,new Map());
  const cache=candidateCache.get(l),base=r.selection.boards[0],cacheKey=JSON.stringify([!!r.checks.enabled,a.kept,base.primaryMode,a.name,a.sentence]);
  if(cache.has(cacheKey)) return cache.get(cacheKey);
  const result=[];
  for(const s of l.styles) for(const p of l.palettes) {
    if(l.withheld.some(w=>w.palette===p.id&&w.style===s.id)) continue;
    const b={...structuredClone(base),pairing:{id:s.id},palette:{id:p.id},graphicSet:{id:s.graphicSet},container:s.container,
      depth:structuredClone({...s.depth,...l.cardDepth.find(d=>d.palette===p.id&&d.style===s.id&&d.mode===base.primaryMode)?.depth})};
    const kept=a.kept??{};
    if(kept.pairing) b.pairing.id=kept.pairing;
    if(kept.palette) Object.assign(b.palette,structuredClone(kept.palette));
    for(const role of ['headingFrom','bodyFrom']) if(Object.hasOwn(kept,role)) b.pairing[role]=kept[role];
    if(kept.markFile) delete b.container;
    if(boardRefusal(l,b)) continue;
    if(r.checks.enabled) try {
     for(const mode of ['light','dark']) {
      b.primaryMode=mode;b.depth=depth(p.id,s,mode);
      const spec=assemble({...r.selection,boards:[b]},l);
      validateBrandBoards(spec,{add(path) {
        if(!assets.has(path)) assets.set(path,{extension:extname(path),uri:'data:application/octet-stream;base64,'+readFileSync(path).toString('base64')});
        return assets.get(path);
      }},()=>{});
     }
    } catch {continue;}
    const c={palette:p.id,style:s.id,graphicSet:s.graphicSet,positions:cardPositions(l,p,s),plain:s.depth.background==='plain',mark:s.depth.mark};
    result.push({...c,value:id(c)});
  }
  cache.set(cacheKey,result);return result;
}
// Independent unordered backtracking for the current contrast slot: keep the
// chosen prefix and ask whether a forced one-dial card can finish the page.
// Later slots may use one or two dials; this does not minimise a page-wide count.
export function canCompleteContrasts(prefix,pool) {
  const failed=new Set();
  function visit(chosen) {
    const slots=12-chosen.length;
    const missing=marks.filter(mark=>!chosen.some(c=>c.mark===mark));
    const plain=Math.max(0,2-chosen.filter(c=>c.plain).length);
    if(!slots) return !missing.length&&!plain;
    const state=chosen.map(c=>c.value).sort().join('/');
    if(failed.has(state)) return false;
    const available=pool.filter(c=>!chosen.some(p=>p.palette===c.palette||p.style===c.style&&parsePaletteId(p.palette).family===parsePaletteId(c.palette).family)&&
      chosen.filter(p=>p.style===c.style).length<2&&chosen.filter(p=>parsePaletteId(p.palette).family===parsePaletteId(c.palette).family).length<2);
    if(missing.length>slots||plain>slots||new Set(available.map(c=>c.palette)).size<slots) return false;
    for(const field of ['style','family']) {
      const value=c=>field==='style'?c.style:parsePaletteId(c.palette).family;
      const capacity=[...new Set(available.map(value))].reduce((sum,v)=>sum+Math.min(2-chosen.filter(c=>value(c)===v).length,new Set(available.filter(c=>value(c)===v).map(c=>c.palette)).size),0);
      if(capacity<slots) return false;
    }
    const required=missing.map(mark=>available.filter(c=>c.mark===mark));
    if(plain) required.push(available.filter(c=>c.plain));
    const choices=required.length?required.sort((a,b)=>a.length-b.length)[0]:available;
    for(const c of choices) if(visit([...chosen,c])) return true;
    failed.add(state);return false;
  }
  return visit(prefix);
}
export function assertFallback(r,a,history=[],l=library) {
  if(!r.looks.some(c=>c.changedDials===2)) return;
  const shown=new Set(history.map(c=>c.value));
  const pool=passingCards(r,a,l).filter(c=>!shown.has(c.value)).map(c=>({...c,changed:Object.keys(AXES).filter(axis=>c.positions[axis]!==r.looks[0].positions[axis])})).filter(c=>c.changed.length>=1&&c.changed.length<=2);
  const prefix=[];
  for(const [i,c] of r.looks.entries()) {
    if(c.changedDials===2) {
      const one=pool.filter(p=>p.changed.length===1);
      // Test only this slot against the prefix already chosen, including its caps.
      for(const candidate of one) {
        try {assertCaps([...prefix,candidate]);} catch {continue;}
        if(prefix.some(p=>p.palette===candidate.palette)) continue;
        assert.equal(canCompleteContrasts([...prefix,candidate],pool),false,`slot ${i+1}: one-dial completion available`);
      }
    }
    const s=l.styles.find(s=>s.id===c.style);
    prefix.push({...c,plain:s.depth.background==='plain',mark:s.depth.mark});
  }
}
export function assertPage(r,a,history=[],candidateLibrary=library) {
  assert.equal(r.looks.length,12,'twelve looks');assert.equal(r.options.length,12,'twelve options');
  assert.equal(r.selection.boards.length,12,'twelve selection boards');
  assert.deepEqual(r.looks.map(l=>l.kind),[...Array(6).fill('top'),...Array(6).fill('contrast')],'six leaders then contrasts');
  const mode=expectedMode(a);
  assert.ok(r.options.every(o=>o.board.primaryMode===mode),'one page mode');
  assert.equal(new Set(r.looks.map(c=>c.palette)).size,12,'no repeated palette');
  assert.equal(new Set(r.looks.slice(0,6).map(c=>parsePaletteId(c.palette).family)).size,6,'six leader families');
  assert.equal(new Set(r.looks.slice(0,6).map(c=>c.style)).size,6,'six leader styles');
  assertCoverage(r.looks);assertCaps(r.looks);
  const seen=new Set(history.map(c=>c.value));
  for(const [i,c] of r.looks.entries()) {
    const s=library.styles.find(s=>s.id===c.style),p=library.palettes.find(p=>p.id===c.palette);
    assert.ok(s&&p,'approved card');
    assert.ok(!library.withheld.some(w=>w.style===s.id&&w.palette===p.id),'withheld version');
    assert.equal(c.pairing,s.id,'style pairing');assert.equal(c.graphicSet,s.graphicSet,'style graphic set');
    assert.equal(c.container,s.container,'style container');assert.equal(c.value,id(c),'stable value');
    assert.ok(!seen.has(c.value),'unshown card');seen.add(c.value);
    assert.equal(c.primaryMode,mode,'look record mode');assert.equal(c.plainGround,s.depth.background==='plain','style ground');
    // Recompute the unweighted majority independently of selector summaries.
    const parts=[library.pairings.find(p=>p.id===s.id),p,library.graphics.find(g=>g.id===s.graphicSet)];
    const expected=Object.fromEntries(Object.entries(AXES).map(([axis,[negative,positive]])=>{
      const n=parts.reduce((sum,p)=>sum+(p.tags[axis]===positive?1:p.tags[axis]===negative?-1:0),0);
      return [axis,n>0?positive:n<0?negative:'either'];
    }));
    assert.deepEqual(c.positions,expected,'unweighted positions');
    if(i>=6) {
      const changed=Object.keys(AXES).filter(axis=>c.positions[axis]!==r.looks[0].positions[axis]);
      assert.ok(changed.length===1||changed.length===2,'one- or two-dial contrast');
      assert.equal(c.changedDial,changed[0],'first changed dial');
      assert.equal(c.changedDials,changed.length,'changed dial count');
    }
    const expectedBoard={pairing:{id:s.id},palette:{id:p.id},graphicSet:{id:s.graphicSet},container:s.container,primaryMode:mode,depth:depth(p.id,s,mode),handwriting:null,buttonRadius:4};
    const kept=a.kept??{};
    if(kept.palette) Object.assign(expectedBoard.palette,structuredClone(kept.palette));
    if(kept.pairing) expectedBoard.pairing.id=kept.pairing;
    for(const role of ['headingFrom','bodyFrom']) if(Object.hasOwn(kept,role)) expectedBoard.pairing[role]=structuredClone(kept[role]);
    if(Object.hasOwn(kept,'buttonRadius')) expectedBoard.buttonRadius=kept.buttonRadius;
    if(kept.markFile) delete expectedBoard.container;
    assert.deepEqual(r.options[i].board,expectedBoard,'exact option board');
    assert.equal(r.options[i].value,c.value,'option value');
    const b=r.selection.boards[i];
    for(const [field,value] of Object.entries(expectedBoard)) assert.deepEqual(b[field],value,`selection ${field}`);
    assert.equal(boardRefusal(library,b),null,'refused clusters');
    const palette=library.palettes.find(p=>p.id===b.palette.id);
    const actual={light:{...palette.light,...b.palette.overrides?.light},dark:{...palette.dark,...b.palette.overrides?.dark}};
    assert.doesNotThrow(()=>depthOptions({palette:actual,primaryMode:mode,depth:b.depth}),'Contact Sheet depth check');
  }
  assertFallback(r,a,history,candidateLibrary);
  if(!a.kept?.markFile&&!['headingFrom','bodyFrom'].some(role=>typeof a.kept?.[role]==='object')) {
    const form={title:'Choose looks',brand:{name:a.name,initials:r.selection.boards[0].initials,sentence:a.sentence,body:a.body??a.sentence,words:a.words},questions:[{id:'looks',type:'boards',view:'look',label:'Choose up to three',pick:3,min:2,options:r.options}]};
    assert.deepEqual(checkForm(form),{ok:true,problems:[]},'unchanged Form options');
  }
}
