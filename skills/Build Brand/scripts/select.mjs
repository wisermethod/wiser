#!/usr/bin/env node
// Built-ins and this skill only. standards/script-contract.md governs the CLI.
import { readFileSync, writeFileSync, realpathSync, statSync, lstatSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, basename, resolve, join, isAbsolute, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { assemble, canonical, LIBRARY, AXES, partPositions } from './assemble.mjs';

const SKILL = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const TAPS = join(SKILL, 'parts/taps.json');
const CONTACT = resolve(SKILL, '../../tools/Contact Sheet/scripts/contact-sheet.js');
export const ENERGIES = ['quiet','white-and-one','bright','colour-ground','dark-first'];
const CONTAINERS = { drawn:'drawn-ring', drafting:'drafting-box', marker:'marker-swash', riso:'double-ring', geometric:'filled-square', editorial:'rule-box', stitch:'oval', stamp:'double-ring' };
const GROUPS = [{id:'close',label:'Close to the answers'},{id:'further',label:'Further'},{id:'angle',label:'From another angle'}];
const STEER = ['warmCool','quietBold','softStrong','classicContemporary'];
const HELP = `Select twelve Build Brand looks, Round 1, or four variations per pick.
Usage: node select.mjs <looks|round1|variations> --answers <absolute.json> [options]
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
checks and (for looks) ready-to-use Form boards options for view: "look".
Failure: JSON on stderr only, exit 1. No existing output is overwritten.
looks answers: optional shown (all looks records or Form options already shown
in this sitting), steer and off. Empty/absent shown keeps the first page;
otherwise return twelve unshown looks, preferring less-shown parts.
variations answers: picks (0 to 3 full board records), shown (all boards already
shown in this sitting), steer (warmCool, quietBold, softStrong,
classicContemporary: -1, 0 or 1), and off as for round1. Four new boards per
pick, together in pick order. picks: [] requests a fresh Round 1 page with
shown excluded and the steer applied. Comments are read by the session into
steer/off; free text is not accepted. All answers fields: parts/parts.md.`;
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
  object(a,['name','sentence','words','taps','off','looks','kept','body','photoRules','heroPhrase','picks','steer','shown'],'answers');
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
  if(command==='round1' && ['picks','steer','shown'].some(k=>own(a,k))) fail(command,'picks, steer and shown belong to looks or variations');
  if(command==='looks') {
    if(own(a,'picks')) fail('picks','belongs to variations');
    const shown=own(a,'shown')?a.shown:[];
    array(shown,'shown');
    for(const look of shown) shownLook(look,library,a.kept);
  }
  if(command==='variations') {
    array(a.picks,'picks'); if(a.picks.length>3) fail('picks','supply zero to three previously picked selection boards');
    unique(a.picks.map(p=>p?.number),'picks.number');
    array(a.shown,'shown');
    for(const [field,boards] of [['picks',a.picks],['shown',a.shown]]) for(const b of boards) {
      object(b,Object.keys(b??{}),field);
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
function candidates(library,state,headingFrom) {
  const result=[]; let order=0;
  const donor=typeof headingFrom==='string'?part(library,'pairings',headingFrom):null;
  for(const pairing of library.pairings) for(const palette of library.palettes) for(const graphicSet of library.graphics) {
    const n=order++;
    const heading=donor??pairing;
    if(Math.abs(heading.tags.typeLoudness-palette.paletteLoudness)>1 || (palette.paletteLoudness===3&&(heading.tags.typeCut!=='contemporary'||heading.tags.typeLoudness<2))) continue;
    const c=info(library,palette,pairing,graphicSet,state.dials,n);
    c.score+=palette.energy==='bright'?state.brightColour:0;
    result.push(c);
  }
  return result.sort((a,b)=>b.score-a.score || (state.darkLed?Number(b.palette.energy==='dark-first')-Number(a.palette.energy==='dark-first'):0) || a.order-b.order);
}
const key=c=>`${c.pairing.id}/${c.palette.id}/${c.graphicSet.id}`;
const lookId=c=>'look-'+createHash('sha256').update(key(c)).digest('hex').slice(0,32);
function shownLook(look,library,kept={}) {
  const option=own(look??{},'board');
  object(look,option?['value','label','board']:['value','label','kind','pairing','palette','graphicSet','positions','partPositions','score','libraryOrder','primaryMode','ground','plainGround','container','parent','changedParts','changedDial'],'shown');
  if(option) object(look.board,['pairing','palette','graphicSet','primaryMode','container','handwriting','buttonRadius'],'shown.board');
  const refs=option?look.board:look;
  const c=Object.fromEntries([['pairing','pairings'],['palette','palettes'],['graphicSet','graphics']].map(([field,kind])=>[field,part(library,kind,option?refs[field]?.id:refs[field])]));
  // Option boards carry fixed assets; their values still identify the backing
  // library triple. Recover it when a kept pairing or palette replaced an id.
  if(option&&look.value!==lookId(c)&&(!kept.pairing||c.pairing.id===kept.pairing)&&(!kept.palette?.id||c.palette.id===kept.palette.id)) {
    for(const pairing of kept.pairing?library.pairings:[c.pairing]) for(const palette of kept.palette?.id?library.palettes:[c.palette]) {
      const backing={...c,pairing,palette};
      if(look.value===lookId(backing)) return backing;
    }
  }
  if(look.value!==lookId(c)) fail('shown.value','must match the three library ids from the looks output');
  return c;
}
function freshLooks(pool,shown,library,kept) {
  const history=new Map(shown.map(look=>{const c=shownLook(look,library,kept);return [key(c),c];})),seen=new Set(history.keys());
  const fields=['palette','pairing','graphicSet'];
  const uses=Object.fromEntries(fields.map(field=>[field,new Map()]));
  for(const c of history.values()) for(const field of fields) uses[field].set(c[field].id,(uses[field].get(c[field].id)??0)+1);
  return pool.filter(c=>!seen.has(key(c))).map(c=>{
    const counts=fields.map(field=>uses[field].get(c[field].id)??0);
    return {c,used:counts.filter(Boolean).length,uses:counts.reduce((a,b)=>a+b,0)};
  }).sort((a,b)=>a.used-b.used||a.uses-b.uses).map(({c})=>c);
  // Stable sort retains the steered score, dark promotion and library order.
}
function chooseLooks(pool, accept=()=>true, onChoose=()=>{}) {
  const chosen=[],palettes=new Set(),pairings=new Set(),graphics=new Set(),axes=new Set(),targets=new Set(),spares=[];
  for(let i=0;i<6;i++) {
    const ranked=pool.filter(c=>!palettes.has(c.palette.id)&&!pairings.has(c.pairing.id)&&!graphics.has(c.graphicSet.id)).map(c=>({...c,plain:(i+1)%3===2}));
    const next=ranked.find(c=>accept(c,i+1)); if(!next) fail('looks','no passing distinct leader remains');
    onChoose(next,i+1);
    chosen.push({...next,kind:'top'});spares.push(ranked.slice(ranked.indexOf(next)+1,ranked.indexOf(next)+17));
    palettes.add(next.palette.id);pairings.add(next.pairing.id);graphics.add(next.graphicSet.id);
  }
  const first=chosen[0];
  for(let i=6;i<12;i++) {
    const ranked=pool.map(c=>({...c,plain:(i+1)%3===2,changed:Object.keys(AXES).filter(k=>c.positions[k]!==first.positions[k])}))
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
function chooseFreshLooks(pool,accept,replacements) {
  if(pool.length<12) fail('looks',`library exhausted: only ${pool.length} unshown looks remain; twelve are required`);
  const paletteCount=new Set(pool.map(c=>c.palette.id)).size;
  if(paletteCount<12) fail('looks',`library exhausted for a twelve-look page: only ${paletteCount} unshown palette recipes remain; twelve distinct palettes are required`);
  const failed=new Set(),contrastCache=new Map(),checked=new Map();
  const positionKey=c=>JSON.stringify(c.positions);
  const possible=(c,plain)=>checked.get(key(c)+'/'+plain)!==false;
  function passes(c,slot) {
    const id=key(c)+'/'+c.plain;
    if(!checked.has(id)) checked.set(id,accept(c,slot));
    return checked.get(id);
  }
  const plainSlots=(start,end)=>Array.from({length:end-start},(_,i)=>(start+i+1)%3===2).filter(Boolean).length;
  function contrastsFit(contrasts,patterns,plains) {
    const patterned=new Set(contrasts.filter(c=>possible(c,false)).map(c=>c.palette.id));
    const plain=new Set(contrasts.filter(c=>possible(c,true)).map(c=>c.palette.id));
    return patterned.size>=patterns&&plain.size>=plains&&new Set([...patterned,...plain]).size>=patterns+plains;
  }
  function canMatch(candidates,left,right,needed) {
    const edges=new Map(),matched=new Map();
    for(const c of candidates) {
      const id=c[left].id;
      if(!edges.has(id)) edges.set(id,new Set());
      edges.get(id).add(c[right].id);
    }
    function augment(id,seen) {
      for(const to of edges.get(id)) if(!seen.has(to)) {
        seen.add(to);
        if(!matched.has(to)||augment(matched.get(to),seen)) {matched.set(to,id);return true;}
      }
      return false;
    }
    let count=0;
    for(const id of edges.keys()) if(augment(id,new Set())&&++count>=needed) return true;
    return false;
  }
  function leadersFit(candidates,needed,contrastPalettes,patterns,plains) {
    if(!needed) return true;
    const groups=new Map();
    for(const c of candidates) {
      if(contrastPalettes.size-Number(contrastPalettes.has(c.palette.id))<6) continue;
      if(!(patterns&&possible(c,false))&&!(plains&&possible(c,true))) continue;
      if(!groups.has(c.graphicSet.id)) groups.set(c.graphicSet.id,[]);
      groups.get(c.graphicSet.id).push(c);
    }
    if(groups.size<needed) return false;
    const eligible=[...groups.values()].flat();
    if(new Set([...contrastPalettes,...eligible.map(c=>c.palette.id)]).size<6+needed||
      !canMatch(eligible,'graphicSet','pairing',needed)||!canMatch(eligible,'graphicSet','palette',needed)||!canMatch(eligible,'pairing','palette',needed)) return false;
    // Feasibility need not follow display order. Try the most constrained
    // graphic first to avoid enumerating permutations of impossible leaders.
    const [id,choices]=[...groups].sort((a,b)=>a[1].length-b[1].length)[0];
    const rest=eligible.filter(c=>c.graphicSet.id!==id);
    for(const c of choices) {
      const available=rest.filter(p=>p.pairing.id!==c.pairing.id&&p.palette.id!==c.palette.id);
      const reserved=new Set(contrastPalettes);reserved.delete(c.palette.id);
      for(const plain of [false,true]) if((plain?plains:patterns)&&possible(c,plain)&&leadersFit(available,needed-1,reserved,patterns-Number(!plain),plains-Number(plain))) return true;
    }
    return groups.size>needed&&leadersFit(rest,needed,contrastPalettes,patterns,plains);
  }
  function search(chosen,palettes,pairings,graphics,axes,targets,spares,contrasts=[]) {
    const slot=chosen.length,refusalStart=replacements.length;
    if(slot===12) return {chosen,spares};
    // Failed states depend on feasibility, not on the order of the prefix.
    const state=JSON.stringify([slot,chosen.length?positionKey(chosen[0]):null,...[palettes,pairings,graphics].map(set=>[...set].sort())]);
    if(failed.has(state)) return null;
    let ranked;
    if(slot<6) {
      ranked=pool.filter(c=>!palettes.has(c.palette.id)&&!pairings.has(c.pairing.id)&&!graphics.has(c.graphicSet.id));
      const remaining=6-slot;
      const contrastPalettes=new Set(contrasts.filter(c=>!palettes.has(c.palette.id)).map(c=>c.palette.id));
      if(slot) ranked=ranked.filter(c=>contrastPalettes.size-Number(contrastPalettes.has(c.palette.id))>=6);
      if(['palette','pairing','graphicSet'].some(field=>new Set(ranked.map(c=>c[field].id)).size<remaining)) {failed.add(state);return null;}
    } else {
      ranked=contrasts.filter(c=>!palettes.has(c.palette.id)).sort((a,b)=>Number(axes.has(a.changed[0]))-Number(axes.has(b.changed[0])) || Number(targets.has(a.changed[0]+'/'+a.positions[a.changed[0]]))-Number(targets.has(b.changed[0]+'/'+b.positions[b.changed[0]])));
      if(new Set(ranked.map(c=>c.palette.id)).size<12-slot) {failed.add(state);return null;}
    }
    ranked=ranked.map(c=>({...c,plain:(slot+1)%3===2}));
    for(const [index,c] of ranked.entries()) {
      // Checks learned while exploring a prefix also constrain every remaining
      // slot. Pattern refusals may still pass in one of the four plain slots.
      if(slot&&slot<6) {
        const remaining=6-slot,plains=plainSlots(slot,6);
        const available=contrasts.filter(p=>!palettes.has(p.palette.id));
        if(!contrastsFit(available,4,2)||!leadersFit(ranked,remaining,new Set(available.map(p=>p.palette.id)),remaining-plains,plains)) break;
      } else if(slot>=6) {
        const plains=plainSlots(slot,12);
        if(!contrastsFit(ranked,12-slot-plains,plains)) break;
      }
      if(!possible(c,c.plain)) continue;
      const nextPalettes=new Set([...palettes,c.palette.id]);
      let nextContrasts=contrasts;
      if(slot===0) {
        const first=positionKey(c);
        if(!contrastCache.has(first)) contrastCache.set(first,pool.map(p=>({...p,changed:Object.keys(AXES).filter(axis=>p.positions[axis]!==c.positions[axis])})).filter(p=>p.changed.length===1));
        nextContrasts=contrastCache.get(first);
      }
      // Reserve six contrast palettes before the leaders can consume them.
      if(slot<6&&!contrastsFit(nextContrasts.filter(p=>!nextPalettes.has(p.palette.id)),4,2)) continue;
      if(!passes(c,slot+1)) continue;
      const contrast=slot>=6;
      const next=search([...chosen,{...c,kind:contrast?'contrast':'top',...(contrast?{changedDial:c.changed[0]}:{})}],nextPalettes,
        contrast?pairings:new Set([...pairings,c.pairing.id]),contrast?graphics:new Set([...graphics,c.graphicSet.id]),
        contrast?new Set([...axes,c.changed[0]]):axes,contrast?new Set([...targets,c.changed[0]+'/'+c.positions[c.changed[0]]]):targets,
        [...spares,ranked.slice(index+1,index+17)],nextContrasts);
      if(next) return next;
    }
    // Keep learned check results, but omit refusals from an abandoned prefix.
    // Only the winning prefix can name its slot's actual passing replacement.
    replacements.length=refusalStart;
    failed.add(state);return null;
  }
  const found=search([],new Set(),new Set(),new Set(),new Set(),new Set(),[]);
  if(!found) fail('looks',`library exhausted for a twelve-look page: ${pool.length} unshown looks cannot supply six passing distinct leaders and six one-dial contrasts`);
  return found;
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
  Object.assign(b,{number,name:`${c.pairing.name} / ${(c.actualPalette??c.palette).name} / ${c.graphicSet.name}`,group,energy:(c.actualPalette??c.palette).energy,why:'A whole look from your chosen direction.',primaryMode:c.mode??(c.palette.energy==='dark-first'?'dark':'light'),buttonRadius:base?.buttonRadius??4,palette:base?.palette.id===c.palette.id?copy(base.palette):{id:c.palette.id},pairing:base?.pairing.id===c.pairing.id?copy(base.pairing):{id:c.pairing.id},handwriting:base?.pairing.id===c.pairing.id?base.handwriting??null:null,graphicSet:base?.graphicSet.id===c.graphicSet.id?copy(base.graphicSet):{id:c.graphicSet.id}});
  if(c.plain) b.graphicSet.pattern={...b.graphicSet.pattern,strength:{light:0,dark:0}};
  if(number===0)b.zero=true;
  const kept=a.kept??{};
  if(kept.palette) b.palette={...b.palette,...copy(kept.palette)};
  if(kept.pairing) b.pairing.id=kept.pairing;
  for(const role of ['headingFrom','bodyFrom']) if(own(kept,role)) b.pairing[role]=copy(kept[role]);
  if(kept.primaryMode) b.primaryMode=kept.primaryMode;
  if(own(kept,'buttonRadius')) b.buttonRadius=kept.buttonRadius;
  if(kept.markFile||base?.markFile) { b.markFile=kept.markFile??base.markFile;delete b.initials;delete b.container; }
  else { delete b.markFile;b.container=c.container??base?.container??CONTAINERS[c.graphicSet.id]??'drafting-box';b.initials=a.name.split(/\s+/).slice(0,2).map(w=>Array.from(w)[0]).join('').toUpperCase(); }
  return b;
}
function effective(c,a,library) {
  const kept=a.kept??{};
  const mode=kept.primaryMode??c.mode??(c.palette.energy==='dark-first'?'dark':'light');
  const palette=kept.palette?.id?part(library,'palettes',kept.palette.id):c.palette;
  return {...c,actualPalette:palette,mode,ground:ground(kept.palette?.overrides?.[mode]?.ground??palette[mode].ground)};
}
function summary(c) { return {pairing:c.pairing.id,palette:c.palette.id,graphicSet:c.graphicSet.id,positions:c.positions,partPositions:c.partPositions,score:c.score,libraryOrder:c.order,...(c.mode?{primaryMode:c.mode,ground:c.ground}:{}),...(own(c,'plain')?{plainGround:c.plain}:{}),...(c.container?{container:c.container}:{}),...(c.parent!==undefined?{parent:c.parent,changedParts:c.changedParts}:{}),...(c.changedDial?{changedDial:c.changedDial}:{})}; }
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
const BOARD_PARTS=['pairing','palette','graphicSet','container','primaryMode'];
function stable(value) {
  if(Array.isArray(value)) return value.map(stable);
  return value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])):value;
}
const partKey=(b,field)=>JSON.stringify(stable(b[field]??null));
const boardKey=b=>JSON.stringify(BOARD_PARTS.map(field=>partKey(b,field)));
function typeLoudness(board,library) {
  const donor=board.pairing.headingFrom;
  return part(library,'pairings',typeof donor==='string'?donor:board.pairing.id).tags.typeLoudness;
}
function variationRank(c,seed,steer) {
  let distance=c.changedParts.length;
  for(const [axis,step] of Object.entries(steer)) if(step) {
    const desired=AXES[axis][step>0?1:0];
    if(c.positions[axis]!==desired) distance+=12;
    for(const field of ['pairing','palette','graphicSet']) if(c.partPositions[field][axis]!==desired) distance+=3;
  }
  if(steer.quietBold) {
    const loud=steer.quietBold;
    distance+=Math.abs(c.palette.paletteLoudness-Math.max(1,Math.min(3,seed.palette.paletteLoudness+loud)))*5;
    distance+=Math.abs(c.typeLoudness-Math.max(1,Math.min(3,seed.typeLoudness+loud)))*5;
    if(!steer.warmCool&&c.palette.temperature!==seed.palette.temperature) distance+=8;
  }
  return distance;
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
  if(!['looks','round1','variations'].includes(command)) fail(command,'unknown command');
  if(unsteered&&command!=='round1') fail('--unsteered','only applies to round1');
  const state=tapDials(a,data),replacements=[],notes=[];
  if(unsteered) Object.assign(state,{dials:blank(),darkLed:0,brightColour:0,labels:[]});
  // Picks are full records: validate all fields through the existing assembler,
  // before any ranking or check. Kept assets remain fixed in later rounds.
  if(command==='variations') for(const b of [...a.picks,...a.shown]) assemble(page(a,[b],[{id:b.group,label:b.group}]),library,{selectionDir});
  let pool=candidates(library,state);
  const boosts=blank();
  for(const id of a.looks??[]) {
    const look=pool.find(c=>lookId(c)===id); if(!look) fail('looks',`unknown whole look ${id}; use a value from the looks output`);
    if(!unsteered) for(const [axis,[neg,pos]] of Object.entries(AXES)) boosts[axis]+=look.positions[axis]===pos?1:look.positions[axis]===neg?-1:0;
  }
  if(command==='looks'&&(a.looks??[]).length) fail('looks','picks belong to round1, not the initial looks command');
  if(command!=='looks') for(const axis of Object.keys(AXES)) state.dials[axis]+=boosts[axis];
  if(command==='variations'||(command==='looks'&&a.shown?.length)) for(const [axis,value] of Object.entries(a.steer??{})) state.dials[axis]+=value*3;
  pool=candidates(library,state);
  const checker=check?checkFactory(a,library,selectionDir,replacements):null;
  const chosen=[],spares=[],seen=new Set([...(a.shown??[]),...(a.picks??[])].map(boardKey));
  const roundPage=command==='round1'||(command==='variations'&&!a.picks.length);
  let groups=copy(GROUPS);
  const accept=(c,group,number,base)=>!checker||checker.accept(c,group,number,base);
  const finishReplacement=(start,c)=>{ for(const r of replacements.slice(start)) r.replacement=summary(c); };
  try {
    if(command==='looks') {
      groups=[{id:'looks',label:'Whole looks'}];
      const fresh=!!a.shown?.length,lookPool=fresh?freshLooks(pool,a.shown,library,a.kept):pool;
      const checkLook=(c,slot)=>accept(effective(c,a,library),'looks',slot);
      const found=fresh?chooseFreshLooks(lookPool,checkLook,replacements):chooseLooks(lookPool,checkLook,(c,slot)=>{for(const r of replacements.filter(r=>r.slot===slot))r.replacement=summary(c);});
      if(fresh) for(const r of replacements) r.replacement=summary(found.chosen[r.slot-1]);
      chosen.push(...found.chosen.map(c=>effective(c,a,library)));spares.push(...found.spares);
    } else if(roundPage) {
      if(unsteered) groups.forEach((g,i)=>g.label=['First set','Second set','Third set'][i]);
      const palettes=new Set(),pairings=new Set(),groundFamilies=new Set();let darks=0;
      const total=Object.keys(a.kept??{}).length?11:12;
      const fixedGround=!!a.kept?.palette?.id || ['light','dark'].some(mode=>own(a.kept?.palette?.overrides?.[mode]??{},'ground'));
      const strongest=Object.keys(AXES).filter(k=>Math.abs(state.dials[k])>=2);
      const pagePool=mode=>pool.map(c=>{
        const candidate=effective({...c,mode:mode??(c.palette.energy==='dark-first'?'dark':'light')},a,library);
        candidate.identity=boardKey(makeBoard(a,candidate,1,'angle'));
        return candidate;
      });
      const nativePool=pagePool(),darkPool=state.darkLed?pagePool('dark'):nativePool;
      for(const group of groups) {
        const graphics=new Set();
        for(let slot=0;slot<(group.id==='angle'?total-8:4);slot++) {
          const missing=ENERGIES.filter(e=>!chosen.some(c=>c.palette.energy===e)), remaining=total-chosen.length;
          // Cover energies that cannot occur on the opposite strong dial
          // before reaching the angle group (for example bright/classic).
          const beforeAngle=8-chosen.length;
          const freshNative=nativePool.filter(c=>!seen.has(c.identity));
          const available=(state.darkLed&&group.id==='close'&&slot<2?darkPool:nativePool).filter(c=>!seen.has(c.identity));
          const remainingEnergies=new Set([...freshNative,...available].map(c=>c.palette.energy));
          const exhausted=missing.filter(e=>!remainingEnergies.has(e));
          if(exhausted.length) fail('round1',`energy ${exhausted.join(', ')} is exhausted: no unshown board remains`);
          const angleEnergies=new Set(freshNative.filter(c=>!strongest.length||!chosen.length||strongest.filter(k=>c.positions[k]!=='either'&&chosen[0].positions[k]!=='either'&&c.positions[k]!==chosen[0].positions[k]).length===1).map(c=>c.palette.energy));
          const early=missing.filter(e=>!angleEnergies.has(e));
          const ranked=available.filter(c=>{
            if(palettes.has(c.palette.id)||graphics.has(c.graphicSet.id)) return false;
            if(group.id!=='angle'&&early.length>=beforeAngle&&!early.includes(c.palette.energy)) return false;
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
          seen.add(next.identity);
          spares.push(eligible.slice(eligible.indexOf(next)+1,eligible.indexOf(next)+17));
          if(pairings.has(next.pairing.id)) notes.push(`Board ${chosen.length} reuses an earlier pairing to keep colour and graphic variety.`);
          palettes.add(next.palette.id);pairings.add(next.pairing.id);graphics.add(next.graphicSet.id);
          if(group.id==='close') {groundFamilies.add(next.ground.family);darks+=Number(next.ground.dark);}
        }
      }
      if(a.kept?.palette?.id) notes.push('A fixed complete palette takes precedence over five-energy coverage and ground-family variety; every board names its actual fixed palette energy.');
      else if(fixedGround) notes.push('Kept ground roles take precedence over ground-family variety; the page still covers five recipe energies.');
    } else {
      groups=a.picks.map((b,i)=>({id:`pick-${i+1}`,label:`Variations of board ${b.number}`}));
      for(const [pickIndex,base] of a.picks.entries()) {
        const seed=info(library,part(library,'palettes',base.palette.id),part(library,'pairings',base.pairing.id),part(library,'graphics',base.graphicSet.id),state.dials);
        seed.typeLoudness=typeLoudness(base,library);
        const headingFrom=a.kept?.headingFrom??base.pairing.headingFrom;
        // A fixed heading is not a new type choice just because the backing
        // pairing id changes. Keep its pairing, body and donor reference intact.
        const fixedPairing=a.kept?.pairing??(headingFrom?base.pairing.id:null);
        const variationPool=headingFrom?candidates(library,state,headingFrom):pool;
        const ranked=[],modes=a.kept?.primaryMode?[a.kept.primaryMode]:['light','dark'];
        const containers=base.markFile||a.kept?.markFile?[undefined]:library.containers.map(c=>c.id);
        for(const c of variationPool) {
          if((fixedPairing&&c.pairing.id!==fixedPairing)||(a.kept?.palette?.id&&c.palette.id!==a.kept.palette.id)) continue;
          // Prune before cloning full board records. Kept parts cannot move.
          const partChanges=Number((a.kept?.pairing??c.pairing.id)!==base.pairing.id)+Number((a.kept?.palette?.id??c.palette.id)!==base.palette.id)+Number(c.graphicSet.id!==base.graphicSet.id);
          if(partChanges>2) continue;
          for(const mode of modes) for(const container of containers) {
            if(partChanges+Number(mode!==base.primaryMode)+Number(container!==base.container)>2) continue;
            const candidate=effective({...c,mode,container,base,parent:base.number},a,library);
            const board=makeBoard(a,candidate,1,groups[pickIndex].id,base);
            candidate.changedParts=BOARD_PARTS.filter(field=>partKey(board,field)!==partKey(base,field));
            if(!candidate.changedParts.length||candidate.changedParts.length>2) continue;
            candidate.identity=boardKey(board);
            if(seen.has(candidate.identity)) continue;
            // Donor and kept positions are the actual board's positions.
            candidate.partPositions=partPositions(library,board);
            candidate.positions=positions(candidate.partPositions);
            candidate.typeLoudness=typeLoudness(board,library);
            candidate.score=Object.values(candidate.partPositions).reduce((sum,t)=>sum+score(t,state.dials),0)+(candidate.palette.energy==='bright'?state.brightColour:0);
            candidate.distance=variationRank(candidate,seed,a.steer??{});
            ranked.push(candidate);
          }
        }
        ranked.sort((a,b)=>a.distance-b.distance||b.score-a.score||a.order-b.order);
        for(let slot=0;slot<4;slot++) {
          const eligible=ranked.filter(c=>!seen.has(c.identity)),start=replacements.length,number=chosen.length+1;
          const next=eligible.find(c=>accept(c,groups[pickIndex].id,number,base));
          if(!next) fail('variations',`no passing new one-or-two-part variation remains for pick ${pickIndex+1}`);
          finishReplacement(start,next);chosen.push({...next,group:groups[pickIndex].id});
          spares.push(eligible.slice(eligible.indexOf(next)+1,eligible.indexOf(next)+17));seen.add(next.identity);
        }
        if(a.steer?.quietBold===1&&seed.palette.paletteLoudness===3&&seed.typeLoudness===3) notes.push(`Picked board ${base.number} is already at the loudness ceiling; no louder library step exists.`);
      }
    }
    let boards=chosen.map((c,i)=>makeBoard(a,c,i+1,c.group??groups[0].id,c.base));
    if(roundPage) {
      for(let i=0;i<boards.length;i++) {
        const why=unsteered?'A whole look in library order.':alignedWhy(chosen[i],a,data);
        boards[i].why=why??'Another angle on your chosen direction.';
        if(!unsteered&&i<2&&why) boards[i].recommendation=why;
      }
    }
    const kept=a.kept??{};
    if(Object.keys(kept).length&&roundPage) {
      const zero=makeBoard(a,chosen[0],0,groups[0].id);zero.zero=true;zero.name='What you are keeping';zero.why='Your kept assets, held on every board.';
      if(checker&&!accept(chosen[0],groups[0].id,0)) fail('board zero','kept assets cannot build; supply usable assets rather than relaxing them');
      boards.unshift(zero);
      notes.push('Board zero shows the supplied assets on the closest library setting; unprovided parts of an existing brand are not reconstructed.');
    }
    const selection=page(a,boards,groups);
    const result={command,selection,dials:state.dials,wholeLookBoosts:boosts,darkLed:state.darkLed,brightColour:state.brightColour,ignoredNudges:state.ignored,positions:chosen.map(summary),spares:spares.map((list,i)=>({slot:i+1,ranked:list.map(summary)})),replacements,checks:{enabled:check,attempts:checker?.attempts??0},notes};
    if(command==='looks') {
      result.looks=chosen.map((c,i)=>({value:lookId(c),label:`${c.pairing.name} / ${c.palette.name} / ${c.graphicSet.name}`,kind:c.kind,...summary(c)}));
      result.options=result.looks.map((look,i)=>{
        const b=boards[i];
        return {value:look.value,label:`Look ${i+1}`,board:{pairing:copy(b.pairing),palette:copy(b.palette),graphicSet:copy(b.graphicSet),primaryMode:b.primaryMode,...(b.container?{container:b.container}:{}),handwriting:b.handwriting,buttonRadius:b.buttonRadius}};
      });
      // Associate every rejected look with the actual passing choice for its slot.
    }
    return result;
  } finally { checker?.close(); }
}
function args(argv) {
  const known=['--answers','--output','--check','--unsteered','--help','-h'];
  for(const token of argv) if(token.startsWith('-')&&!known.includes(token)) fail(token,'unknown option');
  if(!argv.length||argv.includes('--help')||argv.includes('-h')||argv[0]==='help')return null;
  const command=argv[0];if(!['looks','round1','variations'].includes(command))fail(command,'unknown command');
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
