#!/usr/bin/env node
// Built-ins and this skill only. standards/script-contract.md governs the CLI.
import { readFileSync, writeFileSync, realpathSync, statSync, lstatSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, basename, resolve, join, isAbsolute, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { assemble, canonical, LIBRARY, AXES, partPositions } from './assemble.mjs';

const SKILL = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const TAPS = join(SKILL, 'parts/taps.json');
const CONTACT = resolve(SKILL, '../../tools/Contact Sheet/scripts/contact-sheet.js');
export const ENERGIES = ['quiet','white-and-one','bright','colour-ground','dark-first'];
const CONTAINERS = { drawn:'drawn-ring', drafting:'drafting-box', marker:'marker-swash', riso:'double-ring', geometric:'filled-square', editorial:'rule-box', stitch:'oval', stamp:'double-ring' };
const GROUPS = [{id:'close',label:'Close to the answers'},{id:'further',label:'Further'},{id:'angle',label:'From another angle'}];
const STEER = ['warmCool','quietBold','softStrong','classicContemporary'];
const HELP = `Select Build Brand looks, Round 1, blends or a tuned board.
Usage: node select.mjs <looks|round1|blend|tune> --answers <absolute.json> [options]
       node select.mjs help
Options:
  --answers <file>  Required answers JSON; see parts/parts.md. Asset paths resolve here.
  --output <file>   Optional new selection JSON outside this skill (existing parent).
                    The file is exactly assemble.mjs --selection input.
  --check           Assemble each choice and build it with Contact Sheet's board
                    layout in a temporary directory; replace refusals from ranked
                    spares and report them. Fixed assets are never relaxed.
  --unsteered       Round 1 only: every dial and promotion zero, library order,
                    First/Second/Third set, no recommendations.
  --help, -h        Help before reading files or checking fonts.
Built-ins only. No network, configuration or installs; --env/--install refused.
Success: one JSON object with selection, ranked spares, positions, replacements,
checks and (for looks) Form options with pending whole-look picture descriptors.
Failure: JSON on stderr only, exit 1. No existing output is overwritten.
All fields, pick records, off parts, kept assets and steer values: parts/parts.md.`;
const copy = value => structuredClone(value);
const own = (obj,key) => Object.hasOwn(obj,key);
function fail(at, message) { throw Error(`${at}: ${message}. Correct the answers; see select.mjs help.`); }
function object(value, keys, at) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(at,'expected an object');
  for (const k of Object.keys(value)) if (!keys.includes(k)) fail(`${at}.${k}`,'unknown field');
}
function text(value, at) { if (typeof value !== 'string' || !value.trim() || /[\x00-\x1f\u2028\u2029]/.test(value)) fail(at,'expected non-empty single-line text'); }
function array(value, at) { if (!Array.isArray(value)) fail(at,'expected an array'); }
function unique(value, at) { array(value,at); if (new Set(value).size !== value.length) fail(at,'duplicate values'); }
const blank = () => Object.fromEntries(Object.keys(AXES).map(k=>[k,0]));
const load = path => { try { return JSON.parse(readFileSync(path,'utf8')); } catch { fail(basename(path),'unreadable or invalid JSON'); } };
function screen(path, destination = false) {
  if (typeof path !== 'string' || !isAbsolute(path) || path.includes('\0')) fail('path','use an absolute local path');
  const result = canonical(path);
  if (result.split(sep).includes('memory') || /^\.env(?:\.|$)/i.test(basename(result))) fail('path','protected source or destination');
  const rel = relative(SKILL,result);
  if (destination && (rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`)))) fail('output','resolves inside this skill; use a work directory');
  return result;
}
function file(path) { const result=screen(path); if (!statSync(result).isFile()) fail('path','expected a regular file'); return result; }
function outputPath(path) {
  const result=screen(path,true);
  if (!result.endsWith('.json')) fail('--output','use a .json filename');
  try { lstatSync(result); fail('--output','already exists; choose a new path'); } catch(e) { if(e.code !== 'ENOENT') throw e; }
  if (!statSync(dirname(result)).isDirectory()) fail('--output','create its parent directory first');
  return result;
}
function part(library, kind, id) {
  const found=library[kind].filter(p=>p.id===id);
  if(found.length!==1) fail(kind,`unknown or duplicate id ${id}`);
  return found[0];
}
export function validateAnswers(a, data, library, command) {
  object(a,['name','sentence','words','taps','off','looks','kept','body','photoRules','heroPhrase','picks','steer'],'answers');
  text(a.name,'name'); text(a.sentence,'sentence');
  array(a.words,'words');
  for(const w of a.words) { object(w,['word','not'],'words'); text(w.word,'words.word');text(w.not,'words.not'); }
  object(a.taps,data.questions.map(q=>q.id),'taps');
  for(const q of data.questions) if(!q.options.some(o=>o.id===a.taps[q.id])) fail(`taps.${q.id}`,'choose an option id from taps.json');
  for(const k of ['body','photoRules','heroPhrase']) if(own(a,k)) text(a[k],k);
  if(a.heroPhrase && !a.sentence.includes(a.heroPhrase)) fail('heroPhrase','must occur in sentence');
  for(const k of ['off','looks']) { unique(a[k]??[],k); for(const v of a[k]??[]) text(v,k); }
  if((a.looks??[]).length>3) fail('looks','pick at most three whole looks');
  const selected=data.questions.map(q=>q.options.find(o=>o.id===a.taps[q.id]));
  const allowedOff=[...Object.keys(AXES),...Object.values(AXES).flat(),'darkLed','brightColour',...selected.map(o=>o.id)];
  for(const id of a.off??[]) if(!allowedOff.includes(id)) fail('off',`unknown or unselected read-back part ${id}`);
  const kept=a.kept??{};
  object(kept,['palette','pairing','headingFrom','bodyFrom','markFile','primaryMode','buttonRadius'],'kept');
  if(kept.palette) {
    object(kept.palette,['id','overrides'],'kept.palette');
    if(own(kept.palette,'id')) part(library,'palettes',kept.palette.id);
    if(!own(kept.palette,'id')&&!own(kept.palette,'overrides'))fail('kept.palette','supply an id or role overrides');
    if(own(kept.palette,'overrides')) {
      object(kept.palette.overrides,['light','dark'],'kept.palette.overrides');
      for(const [mode,roles] of Object.entries(kept.palette.overrides)) {
        object(roles,Object.keys(library.palettes[0][mode]),`kept.palette.overrides.${mode}`);
        for(const value of Object.values(roles)) if(typeof value!=='string'||!/^#(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(value)) fail('kept.palette.overrides','use opaque sRGB hex');
      }
    }
  }
  if(kept.pairing) part(library,'pairings',kept.pairing);
  for(const role of ['headingFrom','bodyFrom']) if(own(kept,role)) {
    const value=kept[role];
    if(typeof value==='string') part(library,'pairings',value);
    else { object(value,['file','family','weight'],`kept.${role}`);text(value.file,`kept.${role}.file`);text(value.family,`kept.${role}.family`);if(!Number.isFinite(value.weight)||value.weight<1||value.weight>1000)fail(`kept.${role}.weight`,'use a number from 1 to 1000'); }
  }
  if(own(kept,'markFile')) text(kept.markFile,'kept.markFile');
  if(own(kept,'primaryMode')&&!['light','dark'].includes(kept.primaryMode)) fail('kept.primaryMode','use light or dark');
  if(own(kept,'buttonRadius')&&(!Number.isFinite(kept.buttonRadius)||kept.buttonRadius<0||kept.buttonRadius>100)) fail('kept.buttonRadius','use a number from 0 to 100');
  object(a.steer??{},STEER,'steer');
  for(const [axis,value] of Object.entries(a.steer??{})) if(![-1,0,1].includes(value)) fail(`steer.${axis}`,'use -1, 0 or 1');
  if(['looks','round1'].includes(command) && (own(a,'picks') || own(a,'steer'))) fail(command,'picks and steer belong to blend or tune');
  if(['blend','tune'].includes(command)) {
    array(a.picks,'picks'); if(!a.picks.length||a.picks.length>3) fail('picks','supply one to three previously picked selection boards');
    unique(a.picks.map(p=>p.number),'picks.number');
    for(const b of a.picks) {
      part(library,'pairings',b.pairing?.id);part(library,'palettes',b.palette?.id);part(library,'graphics',b.graphicSet?.id);
    }
  }
  return a;
}
export function tapDials(a, data) {
  const dials=blank(), off=new Set(a.off??[]), labels=[], ignored=[];
  let darkLed=0,brightColour=0;
  for(const q of data.questions) {
    const option=q.options.find(o=>o.id===a.taps[q.id]);
    if(off.has(option.id)) continue;
    if(Object.keys(option.nudges).length) labels.push(option.label);
    for(const [pole,n] of Object.entries(option.nudges)) {
      if(off.has(pole)) continue;
      const axis=Object.keys(AXES).find(k=>AXES[k].includes(pole));
      if(axis) { if(!off.has(axis)) dials[axis]+=AXES[axis][1]===pole?n:-n; }
      else if(pole==='darkLed') darkLed+=n;
      else if(pole==='brightColour') brightColour+=n;
      else ignored.push({option:option.id,nudge:pole});
    }
  }
  return {dials,darkLed,brightColour,labels,ignored};
}
export function score(tags,dials) { return Object.entries(AXES).reduce((sum,[k,[neg,pos]])=>sum+(tags[k]===pos?dials[k]:tags[k]===neg?-dials[k]:0),0); }
function positions(parts) {
  return Object.fromEntries(Object.entries(AXES).map(([axis,[neg,pos]])=>{
    const n=Object.values(parts).reduce((sum,p)=>sum+(p[axis]===pos?1:p[axis]===neg?-1:0),0);
    return [axis,n>0?pos:n<0?neg:'either'];
  }));
}
export function ground(color) {
  if(color.length===4) color='#'+[...color.slice(1)].map(c=>c+c).join('');
  const rgb=color.slice(1).match(/../g).map(v=>parseInt(v,16)/255);
  const linear=rgb.map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  const luminance=linear[0]*.2126+linear[1]*.7152+linear[2]*.0722;
  const max=Math.max(...rgb),min=Math.min(...rgb),delta=max-min;
  let hue=delta===0?0:max===rgb[0]?60*((rgb[1]-rgb[2])/delta%6):max===rgb[1]?60*((rgb[2]-rgb[0])/delta+2):60*((rgb[0]-rgb[1])/delta+4);
  hue=(hue+360)%360;
  const family=min>.82&&delta<.16?'pale neutral':delta<.035?'neutral':hue>=185&&hue<270?'blue':hue>=60&&hue<185?'green':hue>=270&&hue<350?'rose and plum':hue>=20&&hue<60?'ochre and orange':'red';
  return {color,family,dark:luminance<.18,luminance};
}
function info(library,palette,pairing,graphicSet,dials,order=0) {
  const parts=partPositions(library,{palette:{id:palette.id},pairing:{id:pairing.id},graphicSet:{id:graphicSet.id}});
  return {palette,pairing,graphicSet,order,positions:positions(parts),partPositions:parts,score:Object.values(parts).reduce((sum,t)=>sum+score(t,dials),0)};
}
function candidates(library,state) {
  const result=[]; let order=0;
  for(const pairing of library.pairings) for(const palette of library.palettes) for(const graphicSet of library.graphics) {
    const n=order++;
    if(Math.abs(pairing.tags.typeLoudness-palette.paletteLoudness)>1 || (palette.paletteLoudness===3&&(pairing.tags.typeCut!=='contemporary'||pairing.tags.typeLoudness<2))) continue;
    const c=info(library,palette,pairing,graphicSet,state.dials,n);
    c.score+=palette.energy==='bright'?state.brightColour:0;
    result.push(c);
  }
  return result.sort((a,b)=>b.score-a.score || (state.darkLed?Number(b.palette.energy==='dark-first')-Number(a.palette.energy==='dark-first'):0) || a.order-b.order);
}
const key=c=>`${c.pairing.id}/${c.palette.id}/${c.graphicSet.id}`;
const lookId=c=>'look:'+key(c);
function chooseLooks(pool, accept=()=>true, onChoose=()=>{}) {
  const chosen=[],palettes=new Set(),pairings=new Set(),graphics=new Set(),axes=new Set(),targets=new Set(),spares=[];
  for(let i=0;i<4;i++) {
    const ranked=pool.filter(c=>!palettes.has(c.palette.id)&&!pairings.has(c.pairing.id)&&!graphics.has(c.graphicSet.id));
    const next=ranked.find(c=>accept(c,i+1)); if(!next) fail('looks','no passing distinct leader remains');
    onChoose(next,i+1);
    chosen.push({...next,kind:'top'});spares.push(ranked.slice(ranked.indexOf(next)+1,ranked.indexOf(next)+17));
    palettes.add(next.palette.id);pairings.add(next.pairing.id);graphics.add(next.graphicSet.id);
  }
  const first=chosen[0];
  for(let i=4;i<8;i++) {
    const ranked=pool.map(c=>({...c,changed:Object.keys(AXES).filter(k=>c.positions[k]!==first.positions[k])}))
      .filter(c=>c.changed.length===1&&!palettes.has(c.palette.id))
      .sort((a,b)=>Number(axes.has(a.changed[0]))-Number(axes.has(b.changed[0])) || Number(targets.has(a.changed[0]+'/'+a.positions[a.changed[0]]))-Number(targets.has(b.changed[0]+'/'+b.positions[b.changed[0]])));
    // Stable sort preserves the original score/library order when spread ties.
    const next=ranked.find(c=>accept(c,i+1));if(!next) fail('looks','no passing one-dial contrast remains');
    onChoose(next,i+1);
    chosen.push({...next,kind:'contrast',changedDial:next.changed[0]});spares.push(ranked.slice(ranked.indexOf(next)+1,ranked.indexOf(next)+17));
    palettes.add(next.palette.id);axes.add(next.changed[0]);targets.add(next.changed[0]+'/'+next.positions[next.changed[0]]);
  }
  return {chosen,spares};
}
function page(a,boards,groups) {
  return { person:a.name,intro:[`Brands made for ${a.name}. Each one is a whole look: colours, lettering and shapes together.`,'Look for the ones that feel like you.'],groups:copy(groups),footnote:'These initials hold the place of a logo. Ask for a logo any time after you lock a board.',boards };
}
function makeBoard(a,c,number,group,base) {
  const b=base?copy(base):{
    content:{brandName:a.name,sentence:a.sentence,body:a.body??a.sentence,smallPrint:'Sample: A first look for discussion.',...(a.photoRules?{photoRules:a.photoRules}:{}),never:a.words.map(w=>w.not)},
    words:copy(a.words),heroPhrase:a.heroPhrase??a.sentence.split(/\s+/).slice(-2).join(' '),
    note:{text:'Sample: Start here.',direction:'left'},
    sample:{kicker:'Sample: At work',title:'Sample: One useful step',phrase:'One useful step',body:'Sample: Choose a task. Try a small change. Keep what helps.',note:'Sample: Make it clear.',steps:['Sample: Choose','Sample: Try','Sample: Keep'],meta:'Sample: A working note'},
    items:{cardLine:'Sample: At work',cardBack:'Sample: Build one useful thing.',cardBackShort:'Sample: Useful work.',bannerHeadline:'Sample: Useful work.',tileBannerHeadline:'Sample: Useful work.',bannerLine:'Sample: Start with the work.',contact:'Sample: hello@example.com',primaryAction:'Sample: Talk',secondaryAction:'Sample: Read'},
    closingExamples:['Keep the colours and try different lettering.','Keep the shapes and try a softer ground.']
  };
  delete b.recommendation; delete b.zero;
  Object.assign(b,{number,name:`${c.pairing.name} / ${(c.actualPalette??c.palette).name} / ${c.graphicSet.name}`,group,energy:(c.actualPalette??c.palette).energy,why:'A whole look from your chosen direction.',primaryMode:c.mode??(c.palette.energy==='dark-first'?'dark':'light'),buttonRadius:4,palette:{id:c.palette.id},pairing:{id:c.pairing.id},handwriting:null,graphicSet:{id:c.graphicSet.id}});
  if(number===0)b.zero=true;
  const kept=a.kept??{};
  if(kept.palette) b.palette={...b.palette,...copy(kept.palette)};
  if(kept.pairing) b.pairing.id=kept.pairing;
  for(const role of ['headingFrom','bodyFrom']) if(own(kept,role)) b.pairing[role]=copy(kept[role]);
  if(kept.primaryMode) b.primaryMode=kept.primaryMode;
  if(own(kept,'buttonRadius')) b.buttonRadius=kept.buttonRadius;
  if(kept.markFile) { b.markFile=kept.markFile;delete b.initials;delete b.container; }
  else { delete b.markFile;b.container=CONTAINERS[c.graphicSet.id]??'drafting-box';b.initials=a.name.split(/\s+/).slice(0,2).map(w=>Array.from(w)[0]).join('').toUpperCase(); }
  return b;
}
function effective(c,a,library) {
  const kept=a.kept??{};
  const mode=kept.primaryMode??c.mode??(c.palette.energy==='dark-first'?'dark':'light');
  const palette=kept.palette?.id?part(library,'palettes',kept.palette.id):c.palette;
  return {...c,actualPalette:palette,mode,ground:ground(kept.palette?.overrides?.[mode]?.ground??palette[mode].ground)};
}
function summary(c) { return {pairing:c.pairing.id,palette:c.palette.id,graphicSet:c.graphicSet.id,positions:c.positions,partPositions:c.partPositions,score:c.score,libraryOrder:c.order,...(c.mode?{primaryMode:c.mode,ground:c.ground}:{}),...(c.changedDial?{changedDial:c.changedDial}:{})}; }
function alignedWhy(c,a,data) {
  const off=new Set(a.off??[]),labels=[];
  for(const q of data.questions) {
    const option=q.options.find(o=>o.id===a.taps[q.id]);if(off.has(option.id))continue;
    const contribution=Object.entries(option.nudges).reduce((sum,[pole,n])=>{
      if(off.has(pole))return sum;
      if(pole==='darkLed')return sum+(c.mode==='dark'?n:0);
      if(pole==='brightColour')return sum+(c.palette.energy==='bright'?n:0);
      const axis=Object.keys(AXES).find(axis=>AXES[axis].includes(pole));
      if(!axis||off.has(axis)||c.positions[axis]==='either')return sum;
      return sum+(c.positions[axis]===pole?n:-n);
    },0);
    if(contribution>0) labels.push(option.label);
  }
  return labels.length?`Your ${labels.slice(0,3).map(s=>'“'+s+'”').join(', ')} ${labels.length===1?'tap points':'taps point'} toward this look.`:null;
}
function checkFactory(a,library,selectionDir,replacements) {
  const directory=mkdtempSync(join(tmpdir(),'build-brand-select-')),cache=new Map();let attempt=0;
  return {
    accept(c,group,number,base) {
      const b=makeBoard(a,c,number,group,base),cacheKey=JSON.stringify({...b,number:1,group:'probe'});
      if(cache.has(cacheKey)) return cache.get(cacheKey);
      // Board zero lives beside alternatives in a populated group. Contact
      // Sheet deliberately refuses a group populated only by a zero board.
      const probe=number===0?[b,{...copy(b),number:1,zero:false}]:[b];
      const stem=join(directory,String(++attempt)),spec=assemble(page(a,probe,[{id:group,label:group}]),library,{selectionDir});
      writeFileSync(stem+'.json',JSON.stringify(spec),{flag:'wx'});
      const child=spawnSync(process.execPath,[CONTACT,'build','--spec',stem+'.json','--output',stem+'.html'],{encoding:'utf8',maxBuffer:2_000_000});
      if(child.error || child.signal || (child.status!==0 && child.status!==1)) fail('--check','Contact Sheet could not run; repair the local Node/tool installation');
      if(child.status===0) { cache.set(cacheKey,true);return true; }
      let reason;try { reason=JSON.parse(child.stderr).error; } catch { fail('--check','Contact Sheet returned no structured refusal'); }
      replacements.push({slot:number,group,refused:summary(c),reason,replacement:null});cache.set(cacheKey,false);return false;
    },
    close() { rmSync(directory,{recursive:true,force:true}); },
    get attempts() { return attempt; }
  };
}
// All choices, including spares, obey the prefix's constraints. Refusals never
// reserve a palette or consume an energy. Subsequent slots see the replacement.
export function select(command, answers, {library=load(LIBRARY),data=load(TAPS),check=false,selectionDir=process.cwd(),unsteered=false}={}) {
  const a=validateAnswers(copy(answers),data,library,command);
  if(!['looks','round1','blend','tune'].includes(command)) fail(command,'unknown command');
  if(unsteered&&command!=='round1') fail('--unsteered','only applies to round1');
  const state=tapDials(a,data),replacements=[],notes=[];
  if(unsteered) Object.assign(state,{dials:blank(),darkLed:0,brightColour:0,labels:[]});
  // Picks are full records: validate all fields through the existing assembler,
  // before any ranking or check. Kept assets remain fixed in later rounds.
  if(a.picks) for(const b of a.picks) assemble(page(a,[b],[{id:b.group,label:b.group}]),library,{selectionDir});
  let pool=candidates(library,state);
  const boosts=blank();
  for(const id of a.looks??[]) {
    const look=pool.find(c=>lookId(c)===id); if(!look) fail('looks',`unknown whole look ${id}; use a value from the looks output`);
    if(!unsteered) for(const [axis,[neg,pos]] of Object.entries(AXES)) boosts[axis]+=look.positions[axis]===pos?1:look.positions[axis]===neg?-1:0;
  }
  if(command==='looks'&&(a.looks??[]).length) fail('looks','picks belong to round1, not the initial looks command');
  if(command!=='looks') for(const axis of Object.keys(AXES)) state.dials[axis]+=boosts[axis];
  if(['blend','tune'].includes(command)) for(const [axis,value] of Object.entries(a.steer??{})) state.dials[axis]+=value*3;
  pool=candidates(library,state);
  const checker=check?checkFactory(a,library,selectionDir,replacements):null;
  const chosen=[],spares=[]; let groups=copy(GROUPS);
  const accept=(c,group,number,base)=>!checker||checker.accept(c,group,number,base);
  const finishReplacement=(start,c)=>{ for(const r of replacements.slice(start)) r.replacement=summary(c); };
  try {
    if(command==='looks') {
      groups=[{id:'looks',label:'Whole looks'}];
      const found=chooseLooks(pool,(c,slot)=>accept(effective(c,a,library),'looks',slot),(c,slot)=>{for(const r of replacements.filter(r=>r.slot===slot))r.replacement=summary(c);});
      chosen.push(...found.chosen.map(c=>effective(c,a,library)));spares.push(...found.spares);
    } else if(command==='round1') {
      if(unsteered) groups.forEach((g,i)=>g.label=['First set','Second set','Third set'][i]);
      const palettes=new Set(),pairings=new Set(),groundFamilies=new Set();let darks=0;
      const total=Object.keys(a.kept??{}).length?11:12;
      const fixedGround=!!a.kept?.palette?.id || ['light','dark'].some(mode=>own(a.kept?.palette?.overrides?.[mode]??{},'ground'));
      const strongest=Object.keys(AXES).filter(k=>Math.abs(state.dials[k])>=2);
      for(const group of groups) {
        const graphics=new Set();
        for(let slot=0;slot<(group.id==='angle'?total-8:4);slot++) {
          const missing=ENERGIES.filter(e=>!chosen.some(c=>c.palette.energy===e)), remaining=total-chosen.length;
          const ranked=pool.map(c=>effective({...c,mode:state.darkLed&&group.id==='close'&&slot<2?'dark':c.palette.energy==='dark-first'?'dark':'light'},a,library)).filter(c=>{
            if(palettes.has(c.palette.id)||graphics.has(c.graphicSet.id)) return false;
            if((missing.length>=remaining||(group.id==='angle'&&missing.length))&&!missing.includes(c.palette.energy))return false;
            if(group.id==='close'&&!fixedGround&& (groundFamilies.has(c.ground.family)||darks+Number(c.ground.dark)>2))return false;
            if(group.id==='angle'&&!unsteered&&strongest.length && strongest.filter(k=>c.positions[k]!=='either'&&chosen[0].positions[k]!=='either'&&c.positions[k]!==chosen[0].positions[k]).length!==1)return false;
            return true;
          });
          const preferred=ranked.filter(c=>!pairings.has(c.pairing.id));
          const fallback=ranked.filter(c=>pairings.has(c.pairing.id)&&!chosen.some(x=>x.group===group.id&&x.pairing.id===c.pairing.id));
          const eligible=[...preferred,...fallback],start=replacements.length;
          const next=eligible.find(c=>accept(c,group.id,chosen.length+1));
          if(!next) fail(`round1.${group.id}.${slot+1}`,'no passing board meets the diversity, energy and one-strong-dial constraints');
          finishReplacement(start,next);chosen.push({...next,group:group.id});
          spares.push(eligible.slice(eligible.indexOf(next)+1,eligible.indexOf(next)+17));
          if(pairings.has(next.pairing.id)) notes.push(`Board ${chosen.length} reuses an earlier pairing to keep colour and graphic variety.`);
          palettes.add(next.palette.id);pairings.add(next.pairing.id);graphics.add(next.graphicSet.id);
          if(group.id==='close') {groundFamilies.add(next.ground.family);darks+=Number(next.ground.dark);}
        }
      }
      if(a.kept?.palette?.id) notes.push('A fixed complete palette takes precedence over five-energy coverage and ground-family variety; every board names its actual fixed palette energy.');
      else if(fixedGround) notes.push('Kept ground roles take precedence over ground-family variety; the page still covers five recipe energies.');
    } else {
      groups=[{id:command,label:command==='blend'?'Blends of your picks':'One tuned look'}];
      const picks=a.picks.map((b,i)=>({...info(library,part(library,'palettes',b.palette.id),part(library,'pairings',b.pairing.id),part(library,'graphics',b.graphicSet.id),state.dials,i),mode:b.primaryMode,base:b}));
      const combinations=[];
      if(command==='blend') {
        for(const palette of picks) for(const pairing of picks) for(const graphic of picks) {
          const c=info(library,palette.palette,pairing.pairing,graphic.graphicSet,state.dials,combinations.length);
          combinations.push({...c,mode:palette.mode,base:palette.base});
        }
      } else combinations.push(...picks);
      // The first blend is the prototype: first palette/graphics, second type.
      const seeds=command==='tune'?[...picks].sort((a,b)=>b.score-a.score||a.order-b.order):picks.length>1?[{...info(library,picks[0].palette,picks[1].pairing,picks[0].graphicSet,state.dials),mode:picks[0].mode,base:picks[0].base},...combinations]:combinations;
      const used=new Set(), count=command==='tune'?1:Math.min(4,Math.max(3,picks.length+1));
      for(let slot=0;slot<count;slot++) {
        const seed=seeds[slot%seeds.length],steer=a.steer??{};
        const ranked=pool.map(c=>{
          let distance=0;
          for(const [kind,field] of [['pairings','pairing'],['palettes','palette'],['graphics','graphicSet']]) {
            if(c[field].id!==seed[field].id) distance+=1;
            for(const [axis,step] of Object.entries(steer)) if(step) {
              const desired=AXES[axis][step>0?1:0];
              if(c[field].tags[axis]!==desired) distance+=3;
            }
          }
          const loud=steer.quietBold;
          if(loud) {
            const target=Math.max(1,Math.min(3,seed.palette.paletteLoudness+loud));
            distance+=Math.abs(c.palette.paletteLoudness-target)*5;
            // A bolder/quieter tune keeps temperature unless separately steered.
            if(!steer.warmCool&&c.palette.temperature!==seed.palette.temperature) distance+=8;
            const typeTarget=Math.max(1,Math.min(3,seed.pairing.tags.typeLoudness+loud));
            distance+=Math.abs(c.pairing.tags.typeLoudness-typeTarget)*5;
          }
          return {...effective({...c,mode:seed.mode},a,library),distance,base:seed.base};
        }).filter(c=>!used.has(key(c))).sort((a,b)=>a.distance-b.distance||b.score-a.score||a.order-b.order);
        const start=replacements.length,next=ranked.find(c=>accept(c,command,slot+1,c.base));
        if(!next) fail(command,'no passing blend or tune remains with the fixed assets');
        finishReplacement(start,next);chosen.push({...next,group:command});spares.push(ranked.slice(ranked.indexOf(next)+1,ranked.indexOf(next)+17));used.add(key(next));
      }
      if(command==='tune'&&a.steer?.quietBold===1&&picks[0].palette.paletteLoudness===3&&picks[0].pairing.tags.typeLoudness===3) notes.push('The picked board is already at the loudness ceiling; no louder library step exists.');
    }
    let boards=chosen.map((c,i)=>makeBoard(a,c,i+1,c.group??groups[0].id,c.base));
    if(command==='round1') {
      for(let i=0;i<boards.length;i++) {
        const why=unsteered?'A whole look in library order.':alignedWhy(chosen[i],a,data);
        boards[i].why=why??'Another angle on your chosen direction.';
        if(!unsteered&&i<2&&why) boards[i].recommendation=why;
      }
    }
    const kept=a.kept??{};
    if(Object.keys(kept).length&&command==='round1') {
      const zero=makeBoard(a,chosen[0],0,groups[0].id);zero.zero=true;zero.name='What you are keeping';zero.why='Your kept assets, held on every board.';
      if(checker&&!accept(chosen[0],groups[0].id,0)) fail('board zero','kept assets cannot build; supply usable assets rather than relaxing them');
      boards.unshift(zero);
      notes.push('Board zero shows the supplied assets on the closest library setting; unprovided parts of an existing brand are not reconstructed.');
    }
    const selection=page(a,boards,groups);
    const result={command,selection,dials:state.dials,wholeLookBoosts:boosts,darkLed:state.darkLed,brightColour:state.brightColour,ignoredNudges:state.ignored,positions:chosen.map(summary),spares:spares.map((list,i)=>({slot:i+1,ranked:list.map(summary)})),replacements,checks:{enabled:check,attempts:checker?.attempts??0},notes};
    if(command==='looks') {
      result.looks=chosen.map((c,i)=>({value:lookId(c),label:`${c.pairing.name} / ${c.palette.name} / ${c.graphicSet.name}`,kind:c.kind,...summary(c)}));
      result.options=result.looks.map((look,i)=>({value:look.value,label:look.label,picture:{pending:'whole-look grammar',name:a.name,pairing:look.pairing,palette:look.palette,graphicSet:look.graphicSet,primaryMode:chosen[i].mode,positions:look.positions}}));
      result.notes.push('picture is a descriptor for the whole-look grammar, not yet a supported Form picture. Its renderer needs the name, three part ids, primary mode and six positions.');
      // Associate every rejected look with the actual passing choice for its slot.
    }
    return result;
  } finally { checker?.close(); }
}
function args(argv) {
  const known=['--answers','--output','--check','--unsteered','--help','-h'];
  for(const token of argv) if(token.startsWith('-')&&!known.includes(token)) fail(token,'unknown option');
  if(!argv.length||argv.includes('--help')||argv.includes('-h')||argv[0]==='help')return null;
  const command=argv[0];if(!['looks','round1','blend','tune'].includes(command))fail(command,'unknown command');
  const options={};
  for(let i=1;i<argv.length;i++) {
    const flag=argv[i];if(!known.includes(flag))fail(flag,'unexpected argument');if(own(options,flag))fail(flag,'duplicate option');
    if(['--check','--unsteered'].includes(flag))options[flag]=true;
    else { const value=argv[++i];if(!value||!isAbsolute(value))fail(flag,'supply an absolute path');options[flag]=value; }
  }
  if(!options['--answers'])fail('--answers','required option');
  return {command,options};
}
export function run(argv) {
  const parsed=args(argv);if(!parsed)return HELP;
  const {command,options}=parsed, answersPath=file(options['--answers']),output=options['--output']?outputPath(options['--output']):null;
  const answers=load(answersPath);
  // Canonical local asset paths survive writing the selection elsewhere.
  for(const role of ['headingFrom','bodyFrom']) if(answers.kept?.[role]&&typeof answers.kept[role]==='object') answers.kept[role].file=file(resolve(dirname(answersPath),answers.kept[role].file));
  if(answers.kept?.markFile)answers.kept.markFile=file(resolve(dirname(answersPath),answers.kept.markFile));
  const result=select(command,answers,{check:!!options['--check'],selectionDir:dirname(answersPath),unsteered:!!options['--unsteered']});
  // Even without --check, malformed fixed assets and selections cannot succeed.
  assemble(result.selection,load(LIBRARY),{selectionDir:dirname(answersPath)});
  if(output) { writeFileSync(output,JSON.stringify(result.selection,null,2)+'\n',{flag:'wx'});result.output=output; }
  return result;
}
export function main(argv=process.argv.slice(2)) {
  try { const result=run(argv);process.stdout.write((typeof result==='string'?result:JSON.stringify(result))+'\n'); }
  catch(error) { process.stderr.write(JSON.stringify({error:error.message})+'\n');process.exitCode=1; }
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url))main();
