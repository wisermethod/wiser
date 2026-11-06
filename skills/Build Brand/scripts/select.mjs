#!/usr/bin/env node
// Built-ins and local skill/Form modules only; no packages. standards/script-contract.md governs the CLI.
import { readFileSync, writeFileSync, realpathSync, statSync, lstatSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, basename, resolve, join, isAbsolute, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { assemble, canonical, LIBRARY, AXES, partPositions } from './assemble.mjs';
import { boardRefusal } from './refusals.mjs';
import { validateOwnColours } from './own-colours.mjs';
import { checkForm } from '../../../tools/Form/scripts/format.js';
import { runContactSheet } from '../../../tools/Contact Sheet/scripts/contact-sheet.js';

const SKILL = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const TAPS = join(SKILL, 'parts/taps.json');
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
                    The file omits selector value/steps for assemble.mjs --selection.
  --check           Assemble each choice and build it with Contact Sheet's board
                    layout in a temporary directory; replace refusals from ranked
                    spares and report them. Fixed assets are never relaxed.
  --unsteered       Round 1 only: every dial and promotion zero, library order,
                    First/Second/Third set, no recommendations.
  --help, -h        Help before reading files or checking fonts.
Built-ins only. No network, configuration or installs; --env/--install refused.
Success: one JSON object with selection, ranked spares, positions, replacements,
checks, ready-to-use boards form (round1/variations), and whole-look options
(looks). Looks always returns options, never options: null. Disk-only kept fonts
or boards outside Form's contract report form: null and formUnavailable;
selection is preserved for local assembly with selectionForAssembly() or the
--output file.
Failure: JSON on stderr only, exit 1. No existing output is overwritten.
The answers file carries the returned page switch position as optional mode,
light or dark.
looks answers: optional shown (all looks records or Form options already shown
in this sitting), steer and off. Empty/absent shown keeps the first page;
otherwise return twelve unshown looks, preferring less-shown parts.
variations answers: picks (0 to 3 complete step records the member sent), shown
(all boards as first shown in this sitting), steer (warmCool, quietBold, softStrong,
classicContemporary: -1, 0 or 1), and off as for round1.
round1/variations: looksShown is required: all displayed whole-look records
or Form options, separate from board shown; empty only if none was displayed.
Passed-over triples stay out of Close; the first Close boards sharing two of a
picked look's three parts carry up to two recommendations. With picks but no
such Close board, notes explain why no recommendation is available.
Optional avoid holds full blocked board records. pageDisplayed defaults to
false: exclude every avoid key and build one fresh page with avoid empty.
For a displayed page, save pageDisplayed: true and its complete selection.boards
as displayedBoards in the answers file before waiting; resume retains both.
Only avoided keys on that saved page select slots for ranked replacements;
unblocked displayed boards retain every byte except the page mode, board and
step captions, steps beyond a refused middle step, and Close recommendation
flags reset in page order after replacement. Accumulate older blocked
records in avoid, never in shown. An exhausted displayed slot or an unfillable
unseen rebuild reports its own failure. Board zero keeps its fixed assets. Four new boards per
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
  object(a,['type','name','sentence','words','taps','off','looks','kept','ownColours','body','photoRules','heroPhrase','picks','steer','shown','avoid','looksShown','pageDisplayed','displayedBoards','mode'],'answers');
  if(own(a,'ownColours')) {
    const built=validateOwnColours(a.ownColours);
    if(a.kept?.palette?.overrides&&JSON.stringify(stable(a.kept.palette.overrides))!==JSON.stringify(stable(built.kept.palette.overrides))) fail('kept.palette','conflicts with ownColours');
    a.kept={...a.kept,palette:{...a.kept?.palette,...copy(built.kept.palette)}};
  }
  if(own(a,'type')&&!['personal','org','client','department'].includes(a.type)) fail('type','use personal, org, client or department');
  text(a.name,'name'); text(a.sentence,'sentence');
  if(own(a,'mode')&&!['light','dark'].includes(a.mode)) fail('mode','use light or dark');
  array(a.words,'words');
  if(!a.words.length) fail('words','supply at least one chosen word/boundary pair');
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
  if(command!=='looks'&&!own(a,'looksShown')) fail('looksShown','required; supply every displayed whole look, or an empty array when none was displayed');
  if(own(a,'looksShown')) {
    if(command==='looks') fail('looksShown','use shown for whole-look pages');
    array(a.looksShown,'looksShown');
    for(const look of a.looksShown) shownLook(look,library,a.kept);
    for(const id of a.looks??[]) if(!a.looksShown.some(look=>lookValues(look).includes(id))) fail('looksShown','must include every picked look');
  }
  if(own(a,'pageDisplayed')&&typeof a.pageDisplayed!=='boolean') fail('pageDisplayed','use true or false');
  if(a.pageDisplayed||own(a,'displayedBoards')) {
    if(command==='looks') fail('displayedBoards','only board pages support displayed-page retries');
    if(!a.pageDisplayed) fail('displayedBoards','requires pageDisplayed: true');
    array(a.displayedBoards,'displayedBoards');
    const roundPage=command==='round1'||!a.picks?.length,zero=roundPage&&!a.ownColours&&Object.keys(kept).length?1:0;
    const count=roundPage?12:(a.picks?.length??0)*4;
    if(a.displayedBoards.length!==count) fail('displayedBoards','supply the complete displayed selection.boards');
    for(const [i,b] of a.displayedBoards.entries()) {
      object(b,Object.keys(b??{}),'displayedBoards');
      const number=i+1-zero,group=roundPage?GROUPS[Math.min(2,Math.floor((number-1)/4))]?.id:`pick-${Math.floor(i/4)+1}`;
      if(b.number!==number||b.group!==(number===0?'close':group)||!!b.zero!==(number===0)) fail('displayedBoards','keep the displayed board numbers, groups and zero record unchanged');
    }
  }
  if(own(a,'avoid')) {
    if(command==='looks') fail('avoid','only board pages support Review replacements');
    array(a.avoid,'avoid'); unique(a.avoid.map(b=>JSON.stringify(stable(b))),'avoid');
    for(const b of a.avoid) { object(b,Object.keys(b??{}),'avoid'); if(!Number.isInteger(b.number)) fail('avoid','supply full returned board records'); }
  }
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
function candidates(library,state,a,refused) {
  const result=[],reasons=new Set(); let order=0;
  for(const pairing of library.pairings) for(const palette of library.palettes) for(const graphicSet of library.graphics) {
    const n=order++;
    if(pairing.selectable===false) continue;
    const c=info(library,palette,pairing,graphicSet,state.dials,n);
    const reason=refused(makeBoard(library,a,c,1,'probe'));
    if(reason) { reasons.add(reason); continue; }
    c.score+=palette.energy==='bright'?state.brightColour:0;
    result.push(c);
  }
  if(!result.length&&reasons.size) fail('candidates',`rule refusal prevents a complete page: ${[...reasons].join('; ')}`);
  return result.sort((a,b)=>b.score-a.score || (state.darkLed?Number(b.palette.energy==='dark-first')-Number(a.palette.energy==='dark-first'):0) || a.order-b.order);
}
const key=c=>`${c.pairing.id}/${c.palette.id}/${c.graphicSet.id}`;
const lookId=c=>'look-'+createHash('sha256').update(key(c)).digest('hex').slice(0,32);
// A palette belongs to exactly one colour family and one of its three steps.
export function paletteFamily(id) {
  const match=typeof id==='string'&&id.match(/^(.+)-(muted|balanced|bold)$/);
  if(!match) fail('palette.id','must end in -muted, -balanced or -bold');
  return {family:match[1],step:match[2]};
}
// Form moves by adjacent family positions. Keep the passing run around the
// own card, so no listed step is stranded beyond a refused middle position.
// The defaults of the depth fields a card-mode may carry beyond its style (cardDepth): ink and allowHueShift.
const STEP_DEPTH_DEFAULTS=Object.freeze({allowHueShift:false,ink:'pop'});
function contiguousSteps(steps,value) {
  const position=s=>['muted','balanced','bold'].indexOf(paletteFamily(s.palette.id).step);
  steps=[...steps].sort((x,y)=>position(x)-position(y));
  let first=steps.findIndex(s=>s.value===value),last=first;
  while(first>0&&position(steps[first-1])===position(steps[first])-1) first--;
  while(last+1<steps.length&&position(steps[last+1])===position(steps[last])+1) last++;
  return steps.slice(first,last+1);
}
function cardDepth(library,palette,style,mode) {
  const overlay=library.cardDepth.find(d=>d.palette===palette.id&&d.style===style.id&&d.mode===mode);
  return copy({...style.depth,...overlay?.depth});
}
function lookCandidates(library,state,a,refused) {
  const result=[],reasons=new Set(),withheld=new Set(library.withheld.map(w=>`${w.palette}/${w.style}`));
  const off=new Set(a.off??[]),answer=a.taps?.mode;
  const mode=a.mode??a.kept?.primaryMode??(off.has('darkLed')?'light':
    answer==='dark'&&!off.has('dark')?'dark':
    answer==='light'&&!off.has('light')?'light':state.darkLed>0?'dark':'light');
  let order=0;
  for(const style of library.styles) for(const palette of library.palettes) {
    const n=order++,family=paletteFamily(palette.id).family;
    if(withheld.has(`${palette.id}/${style.id}`)) continue;
    const pairing=part(library,'pairings',style.id),graphicSet=part(library,'graphics',style.graphicSet);
    if(pairing.selectable===false) continue;
    const c={...info(library,palette,pairing,graphicSet,state.dials,n),style,family,mode,
      container:style.container,depth:cardDepth(library,palette,style,mode),plain:style.depth.background==='plain'};
    const reason=refused(makeBoard(library,a,c,1,'looks'));
    if(reason) {reasons.add(reason);continue;}
    c.score+=palette.energy==='bright'?state.brightColour:0;
    result.push(c);
  }
  if(!result.length&&reasons.size) fail('candidates',`rule refusal prevents a complete page: ${[...reasons].join('; ')}`);
  return result.sort((a,b)=>b.score-a.score||a.order-b.order);
}
function shownLook(look,library,kept={}) {
  const option=own(look??{},'board');
  object(look,option?['value','label','board','steps']:['value','label','steps','kind','style','pairing','palette','graphicSet','positions','partPositions','score','libraryOrder','primaryMode','ground','plainGround','container','parent','changedParts','changedDial','changedDials'],'shown');
  if(option) object(look.board,['pairing','palette','graphicSet','primaryMode','container','depth','handwriting','buttonRadius'],'shown.board');
  const refs=option?look.board:look;
  const c=Object.fromEntries([['pairing','pairings'],['palette','palettes'],['graphicSet','graphics']].map(([field,kind])=>[field,part(library,kind,option?refs[field]?.id:refs[field])]));
  if(own(look,'steps')) {
    array(look.steps,'shown.steps');
    if(!look.steps.length||look.steps.length>3) fail('shown.steps','supply one to three steps');
    for(const step of look.steps) {
      object(step,['value','label','palette','depth'],'shown.steps');
      text(step.value,'shown.steps.value');
      if(!own(step,'palette')&&option&&step.value===look.value) continue;
      object(step.palette,['id','overrides'],'shown.steps.palette');
      text(step.palette.id,'shown.steps.palette.id');
    }
  }
  // Rebuild from library references, never saved depth or ranking fields.
  // Keep older triple histories valid for Round 1. New pages themselves come
  // only from the approved-card pool. Kept assets can hide the backing ids.
  const rebuild=backing=>{
    const style=part(library,'styles',backing.pairing.id);
    if(look.style!==undefined&&(look.style!==style.id||style.graphicSet!==backing.graphicSet.id)) fail('shown.style','must match the library card');
    return {...backing,style,family:paletteFamily(backing.palette.id).family};
  };
  if(option&&look.value!==lookId(c)&&(!kept.pairing||c.pairing.id===kept.pairing)&&(!kept.palette?.id||c.palette.id===kept.palette.id)) {
    for(const pairing of kept.pairing?library.pairings:[c.pairing]) for(const palette of kept.palette?.id?library.palettes:[c.palette]) {
      const backing={...c,pairing,palette};
      if(look.value===lookId(backing)) return rebuild(backing);
    }
  }
  if(look.value!==lookId(c)) fail('shown.value','must match the three library ids from the looks output');
  return rebuild(c);
}
function freshLooks(pool,shown,library,kept) {
  const history=new Map(shown.map(look=>{const c=shownLook(look,library,kept);return [key(c),c];})),seen=new Set(history.keys());
  const fields=['family','palette','style'],id=(c,field)=>field==='family'?c.family:c[field].id;
  const uses=Object.fromEntries(fields.map(field=>[field,new Map()]));
  for(const c of history.values()) for(const field of fields) uses[field].set(id(c,field),(uses[field].get(id(c,field))??0)+1);
  return pool.filter(c=>!seen.has(key(c))).map(c=>{
    const counts=fields.map(field=>uses[field].get(id(c,field))??0);
    return {c,used:counts.filter(Boolean).length,uses:counts.reduce((a,b)=>a+b,0)};
  }).sort((a,b)=>a.used-b.used||a.uses-b.uses).map(({c})=>c);
  // Stable sort retains the steered score and library order.
}
const LOOK_MARKS=['seal','badge','letter','stack','initials'];
const markBits=c=>1<<LOOK_MARKS.indexOf(c.depth.mark);
const lookCoverage=chosen=>chosen.filter(c=>c.plain).length>=2&&LOOK_MARKS.every(mark=>chosen.some(c=>c.depth.mark===mark));
// Every page cap applies to leaders and contrasts, including search prefixes.
function fitsLook(chosen,c) {
  return !chosen.some(p=>p.palette.id===c.palette.id||p.family===c.family&&p.style.id===c.style.id)&&
    chosen.filter(p=>p.style.id===c.style.id).length<2&&chosen.filter(p=>p.family===c.family).length<2;
}
const contrastsFrom=(pool,first)=>pool.map(c=>({...c,changed:Object.keys(AXES).filter(k=>c.positions[k]!==first.positions[k])})).filter(c=>c.changed.length>=1&&c.changed.length<=2);
function rankContrasts(pool,palettes,families,axes,targets) {
  return pool.filter(c=>!palettes.has(c.palette.id)).sort((a,b)=>
    a.changed.length-b.changed.length||
    Number(axes.has(a.changed[0]))-Number(axes.has(b.changed[0]))||
    Number(targets.has(a.changed[0]+'/'+a.positions[a.changed[0]]))-Number(targets.has(b.changed[0]+'/'+b.positions[b.changed[0]]))||
    Number(families.has(a.family))-Number(families.has(b.family)));
}
function chooseLooks(pool, accept=()=>true, onChoose=()=>{}) {
  const chosen=[],palettes=new Set(),families=new Set(),styles=new Set(),axes=new Set(),targets=new Set(),spares=[];
  for(let i=0;i<6;i++) {
    const ranked=pool.filter(c=>!families.has(c.family)&&!styles.has(c.style.id));
    const next=ranked.find(c=>accept(c,i+1)); if(!next) fail('looks','no passing distinct leader remains');
    onChoose(next,i+1);
    chosen.push({...next,kind:'top'});spares.push(ranked.slice(ranked.indexOf(next)+1,ranked.indexOf(next)+17));
    palettes.add(next.palette.id);families.add(next.family);styles.add(next.style.id);
  }
  const contrasts=contrastsFrom(pool,chosen[0]);
  for(let i=6;i<12;i++) {
    const ranked=rankContrasts(contrasts,palettes,families,axes,targets).filter(c=>fitsLook(chosen,c));
    const next=ranked.find(c=>accept(c,i+1));if(!next) fail('looks','no passing one- or two-dial contrast remains');
    onChoose(next,i+1);
    chosen.push({...next,kind:'contrast',changedDial:next.changed[0],changedDials:next.changed.length});spares.push(ranked.slice(ranked.indexOf(next)+1,ranked.indexOf(next)+17));
    palettes.add(next.palette.id);families.add(next.family);axes.add(next.changed[0]);targets.add(next.changed[0]+'/'+next.positions[next.changed[0]]);
  }
  if(!lookCoverage(chosen)) fail('looks','no passing page covers two plain grounds and all five marks');
  return {chosen,spares};
}
function chooseFreshLooks(pool,accept,replacements) {
  if(pool.length<12) fail('looks',`library exhausted: only ${pool.length} unshown looks remain; twelve are required`);
  const paletteCount=new Set(pool.map(c=>c.palette.id)).size;
  if(paletteCount<12) fail('looks',`library exhausted for a twelve-look page: only ${paletteCount} unshown palette recipes remain; twelve distinct palettes are required`);
  const failed=new Set(),contrastCache=new Map(),checked=new Map();
  const positionKey=c=>JSON.stringify(c.positions);
  const possible=c=>checked.get(key(c))!==false;
  function passes(c,slot) {
    if(!checked.has(key(c))) checked.set(key(c),accept(c,slot));
    return checked.get(key(c));
  }
  function canMatch(candidates,left,right,needed) {
    const edges=new Map(),matched=new Map();
    for(const c of candidates) {
      const id=left(c);
      if(!edges.has(id)) edges.set(id,new Set());
      edges.get(id).add(right(c));
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
    return needed===0;
  }
  function coverageFits(chosen,available,slots) {
    for(const field of ['family','style']) {
      const id=c=>field==='family'?c.family:c.style.id,uses=new Map(),remaining=new Map();
      for(const c of chosen) uses.set(id(c),(uses.get(id(c))??0)+1);
      for(const c of available) {
        if(!remaining.has(id(c))) remaining.set(id(c),new Set());
        remaining.get(id(c)).add(c.palette.id);
      }
      if([...remaining].reduce((n,[key,palettes])=>n+Math.min(2-(uses.get(key)??0),palettes.size),0)<slots) return false;
    }
    const missing=LOOK_MARKS.filter(mark=>!chosen.some(c=>c.depth.mark===mark));
    const plain=Math.max(0,2-chosen.filter(c=>c.plain).length);
    return missing.length<=slots&&plain<=slots&&
      new Set(available.filter(c=>c.plain).map(c=>c.palette.id)).size>=plain&&
      canMatch(available.filter(c=>missing.includes(c.depth.mark)),c=>c.depth.mark,c=>c.palette.id,missing.length);
  }
  // A small capacity network rules out impossible spreads before enumerating
  // leader orders. Each path reserves a mark, style, family/style pair,
  // palette and family. Rewards cover missing marks first, then plain grounds.
  function spreadFits(chosen,candidates,slots,coverage=true) {
    const available=candidates.filter(c=>fitsLook(chosen,c)&&possible(c));
    const graph=new Map(),edge=(a,b,capacity,cost=0)=>{
      if(!graph.has(a)) graph.set(a,[]);
      if(!graph.has(b)) graph.set(b,[]);
      const forward={to:b,capacity,cost},back={to:a,capacity:0,cost:-cost};
      forward.reverse=back;back.reverse=forward;
      graph.get(a).push(forward);graph.get(b).push(back);
    };
    const styles=new Map(),palettes=new Map(),pairs=new Set(),families=new Set();
    for(const c of available) {
      styles.set(c.style.id,c);palettes.set(c.palette.id,c.family);
      const pair=c.style.id+'/'+c.family;
      if(!pairs.has(pair)) {edge('s/'+c.style.id,'p/'+pair,1);pairs.add(pair);}
      edge('p/'+pair,'c/'+c.palette.id,1);families.add(c.family);
    }
    const missing=coverage?LOOK_MARKS.filter(mark=>!chosen.some(c=>c.depth.mark===mark)):[];
    const reward=13;
    for(const mark of LOOK_MARKS) {
      if(missing.includes(mark)) edge('source','m/'+mark,1,-reward);
      edge('source','m/'+mark,slots);
    }
    for(const [id,c] of styles) edge('m/'+c.depth.mark,'s/'+id,2-chosen.filter(p=>p.style.id===id).length,c.plain?-1:0);
    for(const [id,family] of palettes) edge('c/'+id,'f/'+family,1);
    for(const family of families) edge('f/'+family,'sink',2-chosen.filter(c=>c.family===family).length);
    let cost=0;
    for(let flow=0;flow<slots;flow++) {
      const distances=new Map([['source',0]]),previous=new Map(),queue=['source'],queued=new Set(queue);
      for(let i=0;i<queue.length;i++) {
        const from=queue[i];queued.delete(from);
        for(const e of graph.get(from)??[]) if(e.capacity>0&&(!distances.has(e.to)||distances.get(e.to)>distances.get(from)+e.cost)) {
          distances.set(e.to,distances.get(from)+e.cost);previous.set(e.to,{from,edge:e});
          if(!queued.has(e.to)) {queue.push(e.to);queued.add(e.to);}
        }
      }
      if(!previous.has('sink')) return false;
      cost+=distances.get('sink');
      for(let to='sink';to!=='source';) {
        const p=previous.get(to);p.edge.capacity--;p.edge.reverse.capacity++;to=p.from;
      }
    }
    const plain=coverage?Math.max(0,2-chosen.filter(c=>c.plain).length):0;
    return cost<=-reward*missing.length-plain;
  }
  function leadersFit(candidates,needed,contrastPalettes) {
    if(!needed) return true;
    const eligible=candidates.filter(c=>possible(c)&&contrastPalettes.size-Number(contrastPalettes.has(c.palette.id))>=6);
    if(new Set([...contrastPalettes,...eligible.map(c=>c.palette.id)]).size<6+needed||
      !canMatch(eligible,c=>c.style.id,c=>c.family,needed)) return false;
    // Feasibility can try the most constrained style before display order.
    const groups=new Map();
    for(const c of eligible) {
      if(!groups.has(c.style.id)) groups.set(c.style.id,[]);
      groups.get(c.style.id).push(c);
    }
    const [id,choices]=[...groups].sort((a,b)=>a[1].length-b[1].length)[0];
    const rest=eligible.filter(c=>c.style.id!==id);
    for(const c of choices) {
      const reserved=new Set(contrastPalettes);reserved.delete(c.palette.id);
      if(leadersFit(rest.filter(p=>p.family!==c.family),needed-1,reserved)) return true;
    }
    return groups.size>needed&&leadersFit(rest,needed,contrastPalettes);
  }
  function search(chosen,palettes,families,leaderFamilies,styles,axes,targets,spares,contrasts=[]) {
    const slot=chosen.length,refusalStart=replacements.length;
    if(slot===12) return lookCoverage(chosen)?{chosen,spares}:null;
    const marks=chosen.reduce((n,c)=>n|markBits(c),0),plains=Math.min(2,chosen.filter(c=>c.plain).length);
    // Dial/destination history changes ranking, never feasibility.
    const state=JSON.stringify([slot,slot?positionKey(chosen[0]):null,[...palettes].sort(),chosen.map(c=>c.family+'/'+c.style.id).sort(),marks,plains]);
    if(failed.has(state)) return null;
    let ranked;
    if(slot<6) {
      ranked=pool.filter(c=>!leaderFamilies.has(c.family)&&!styles.has(c.style.id)&&possible(c));
      if(slot) {
        const available=contrasts.filter(c=>fitsLook(chosen,c)&&possible(c));
        const reserved=new Set(available.map(c=>c.palette.id));
        if(!spreadFits(chosen,available,6,false)||!leadersFit(ranked,6-slot,reserved)||!coverageFits(chosen,[...ranked,...available],12-slot)||!spreadFits(chosen,[...ranked,...available],12-slot)) {failed.add(state);return null;}
      }
    } else {
      // Try every one-dial completion before allowing a two-dial card.
      ranked=rankContrasts(contrasts,palettes,families,axes,targets).filter(c=>fitsLook(chosen,c)&&possible(c));
      if(new Set(ranked.map(c=>c.palette.id)).size<12-slot||!coverageFits(chosen,ranked,12-slot)||!spreadFits(chosen,ranked,12-slot)) {failed.add(state);return null;}
    }
    for(const [index,c] of ranked.entries()) {
      if(!possible(c)) continue;
      const nextPalettes=new Set([...palettes,c.palette.id]);
      let nextContrasts=contrasts;
      if(slot===0) {
        const first=positionKey(c);
        if(!contrastCache.has(first)) contrastCache.set(first,contrastsFrom(pool,c));
        nextContrasts=contrastCache.get(first);
      }
      if(slot<6&&new Set(nextContrasts.filter(p=>!nextPalettes.has(p.palette.id)&&possible(p)).map(p=>p.palette.id)).size<6) continue;
      if(!passes(c,slot+1)) continue;
      const contrast=slot>=6;
      const next=search([...chosen,{...c,kind:contrast?'contrast':'top',...(contrast?{changedDial:c.changed[0],changedDials:c.changed.length}:{})}],nextPalettes,new Set([...families,c.family]),
        contrast?leaderFamilies:new Set([...leaderFamilies,c.family]),contrast?styles:new Set([...styles,c.style.id]),
        contrast?new Set([...axes,c.changed[0]]):axes,contrast?new Set([...targets,c.changed[0]+'/'+c.positions[c.changed[0]]]):targets,
        [...spares,ranked.slice(index+1,index+17)],nextContrasts);
      if(next) return next;
    }
    replacements.length=refusalStart;
    failed.add(state);return null;
  }
  const found=search([],new Set(),new Set(),new Set(),new Set(),new Set(),new Set(),[]);
  if(!found) fail('looks',`library exhausted for a twelve-look page: ${pool.length} unshown looks cannot supply six passing distinct leaders and six one- or two-dial contrasts with page caps, two plain grounds and all five marks`);
  return found;
}
function page(a,boards,groups) {
  return { person:a.name,intro:[`Brands made for ${a.name}. Each one is a whole look: colours, lettering and shapes together.`,'Look for the ones that feel like you.'],groups:copy(groups),footnote:'These initials hold the place of a logo. Ask for a logo any time after you lock a board.',boards };
}
function makeBoard(library,a,c,number,group,base) {
  const b=base?assemblyBoard(base):{
    content:{brandName:a.name,sentence:a.sentence,body:a.body??a.sentence,smallPrint:'Sample: A first look for discussion.',...(a.photoRules?{photoRules:a.photoRules}:{}),never:a.words.map(w=>w.not)},
    words:copy(a.words),heroPhrase:a.heroPhrase??a.sentence.split(/\s+/).slice(-2).join(' '),
    note:{text:'Sample: Start here.',direction:'left'},
    sample:{kicker:'Sample: At work',title:'Sample: One useful step',phrase:'One useful step',body:'Sample: Choose a task. Try a small change. Keep what helps.',note:'Sample: Make it clear.',steps:['Sample: Choose','Sample: Try','Sample: Keep'],meta:'Sample: A working note'},
    items:{cardLine:'Sample: At work',cardBack:'Sample: Build one useful thing.',cardBackShort:'Sample: Useful work.',bannerHeadline:'Sample: Useful work.',tileBannerHeadline:'Sample: Useful work.',bannerLine:'Sample: Start with the work.',contact:'Sample: hello@example.com',primaryAction:'Sample: Talk',secondaryAction:'Sample: Read'},
    closingExamples:['Keep the colours and try different lettering.','Keep the shapes and try a softer ground.']
  };
  delete b.recommendation; delete b.zero;
  Object.assign(b,{number,name:`${c.pairing.name} / ${(c.actualPalette??c.palette).name} / ${c.graphicSet.name}`,group,energy:(c.actualPalette??c.palette).energy,why:'A whole look from your chosen direction.',primaryMode:a.mode??c.mode??(c.palette.energy==='dark-first'?'dark':'light'),buttonRadius:base?.buttonRadius??4,palette:base?.palette.id===c.palette.id?copy(base.palette):{id:c.palette.id},pairing:base?.pairing.id===c.pairing.id?copy(base.pairing):{id:c.pairing.id},handwriting:base?.pairing.id===c.pairing.id?base.handwriting??null:null,graphicSet:base?.graphicSet.id===c.graphicSet.id?copy(base.graphicSet):{id:c.graphicSet.id}});
  if(group==='looks') b.depth=copy(c.depth);
  if(number===0)b.zero=true;
  const kept=a.kept??{};
  if(kept.palette) b.palette={...b.palette,...copy(kept.palette)};
  if(a.ownColours) {b.palette.names=a.ownColours.values.map(v=>`${v.value} ${v.name}`);b.palette.energy=a.ownColours.lines[0];b.energy=b.palette.energy;}
  if(kept.pairing) b.pairing.id=kept.pairing;
  for(const role of ['headingFrom','bodyFrom']) if(own(kept,role)) b.pairing[role]=copy(kept[role]);
  if(kept.primaryMode&&!a.mode) b.primaryMode=kept.primaryMode;
  if(own(kept,'buttonRadius')) b.buttonRadius=kept.buttonRadius;
  if(kept.markFile||base?.markFile) { b.markFile=kept.markFile??base.markFile;delete b.initials;delete b.container; }
  else { delete b.markFile;b.container=c.container??base?.container??CONTAINERS[c.graphicSet.id]??'drafting-box';b.initials=a.name.split(/\s+/).slice(0,2).map(w=>Array.from(w)[0]).join('').toUpperCase(); }
  if(group!=='looks') {
    const names=[part(library,'pairings',b.pairing.id).name,...(a.ownColours?[]:[part(library,'palettes',b.palette.id).name]),part(library,'graphics',b.graphicSet.id).name];
    if(b.container) names.push(part(library,'containers',b.container).name);
    names.push(b.primaryMode);
    b.name=names.join(' / ');
  }
  if(a.ownColours)b.name=boardLabel(library,b);
  return b;
}
function effective(c,a,library) {
  const kept=a.kept??{};
  const mode=a.mode??kept.primaryMode??c.mode??(c.palette.energy==='dark-first'?'dark':'light');
  const palette=kept.palette?.id?part(library,'palettes',kept.palette.id):c.palette;
  return {...c,actualPalette:palette,mode,ground:ground(kept.palette?.overrides?.[mode]?.ground??palette[mode].ground)};
}
function summary(c) { return {...(c.style?{style:c.style.id}:{}),pairing:c.pairing.id,palette:c.palette.id,graphicSet:c.graphicSet.id,positions:c.positions,partPositions:c.partPositions,score:c.score,libraryOrder:c.order,...(c.mode?{primaryMode:c.mode,ground:c.ground}:{}),...(own(c,'plain')?{plainGround:c.plain}:{}),...(c.container?{container:c.container}:{}),...(c.parent!==undefined?{parent:c.parent,changedParts:c.changedParts}:{}),...(c.changedDial?{changedDial:c.changedDial,changedDials:c.changedDials}:{})}; }
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
const VARIED_PARTS=BOARD_PARTS.filter(field=>field!=='primaryMode');
function assemblyBoard({value,steps,...board}) { return copy(board); }
export function selectionForAssembly(selection) {
  return {...copy(selection),boards:selection.boards.map(assemblyBoard)};
}
const lookValues=look=>[look.value,...(look.steps??[]).map(step=>step.value)];
function pickedLook(look,value,library,kept) {
  const c=shownLook(look,library,kept);
  if(value===look.value) return c;
  const step=look.steps?.find(step=>step.value===value);
  if(!step) fail('looks','pick a step of a shown option');
  const palette=part(library,'palettes',step.palette.id);
  if(paletteFamily(palette.id).family!==c.family||library.withheld.some(w=>w.palette===palette.id&&w.style===c.style.id)) fail('looks','step is not an approved card in this family and style');
  const picked={...c,palette};
  if(value!==lookId(picked)) fail('looks','step value must match its own three library ids');
  return picked;
}
function boardLabel(library,b) {
  return [part(library,'pairings',b.pairing.id).name,...(b.palette.names?[]:[part(library,'palettes',b.palette.id).name]),part(library,'graphics',b.graphicSet.id).name,...(b.container?[part(library,'containers',b.container).name]:[]),b.primaryMode].join(' / ');
}
const boardValue=(owner,b)=>'board-'+createHash('sha256').update(JSON.stringify(stable([owner.number,boardKey(owner),b.palette]))).digest('hex').slice(0,32);
const FORM_COPY=['depth','handwriting','buttonRadius','heroPhrase','content','note','sample','items','closingExamples'];
// SVG text made single-line by the rules a renderer applies, so the card's
// mark draws as the file does. Inside a tag, XML turns each newline (a CRLF
// counting once) or tab in an attribute value into one space. In text under
// the default xml:space, SVG drops each newline and turns each tab into a
// space. xml:space="preserve" keeps each as its own space; rather than track
// its scope, such a mark is not shown in the card.
export function formLogo(svg) {
  if(/xml:space\s*=\s*["']preserve["']/.test(svg)) return null;
  return svg.replace(/(<[^>]*>)|([^<]+)/g,(m,tag,text)=>tag
    ? tag.replace(/\r\n/g,' ').replace(/[\r\n\t]/g,' ')
    : text.replace(/\r\n|\r|\n/g,'').replace(/\t/g,' '));
}
const pageControls=a=>({mode:a.mode,...(a.ownColours||!a.kept?.palette?{strength:true}:{})});
function boardsForm(a,selection,selectionDir,command) {
  const boards=selection.boards;
  // A disk font has no public reference in Form. Preserve the selection for
  // local assembly rather than substituting a different typeface in the card.
  if(boards.some(b=>['headingFrom','bodyFrom'].some(role=>b.pairing[role]&&typeof b.pairing[role]==='object')))
    return {form:null,formUnavailable:'Form cannot transmit kept font files; use the unchanged selection with assemble.mjs.'};
  const brand={name:a.name,initials:boards[0].initials??a.name.split(/\s+/).slice(0,2).map(w=>Array.from(w)[0]).join('').toUpperCase(),sentence:a.sentence,body:a.body??a.sentence,words:copy(a.words)};
  // A single-line logo that draws as the file does. checkForm below owns the
  // byte cap, remaining controls and SVG check.
  if(boards[0].markFile){
    const logo=formLogo(readFileSync(file(resolve(selectionDir,boards[0].markFile)),'utf8'));
    if(logo===null) return {form:null,formUnavailable:'Form cannot show a kept mark that sets xml:space="preserve"; use the unchanged selection with assemble.mjs.'};
    brand.logo=logo;
  }
  const options=boards.map(b=>({value:b.value,label:b.name,...(a.ownColours?{steps:[{value:b.value}]}:a.kept?.palette?{}:{steps:b.steps.map(step=>({value:step.value,label:step.name,palette:copy(step.palette)}))}),...(b.recommendation?{recommendation:b.recommendation}:{}),
    board:Object.fromEntries([...BOARD_PARTS,...FORM_COPY].filter(k=>own(b,k)).map(k=>[k,k==='content'?Object.fromEntries(Object.entries(b.content).filter(([key])=>!['brandName','sentence','body'].includes(key))):copy(b[k])]))}));
  const boardDefaults={};
  for(const k of FORM_COPY) if(k!=='depth'&&own(options[0].board,k)&&options.every(o=>own(o.board,k)&&partKey(o.board,k)===partKey(options[0].board,k))) {
    boardDefaults[k]=options[0].board[k];
    for(const o of options) delete o.board[k];
  }
  const variation=command==='variations',extra=['org','client','department'].includes(a.type)?1:0;
  const form={title:`Step ${(variation?5:4)+extra} of ${6+extra}: ${variation?'blend and tune':'your boards'}`,brand,boardDefaults,
    questions:[{id:'boards',type:'boards',label:'Select the board(s) that feel most like you',help:'To lock a board in, leave just that one ticked.',pick:3,controls:pageControls(a),options}],
    actions:[{value:'more',label:'Show me more',needs:'any',notes:{none:'None of these work',one:'Show me variations of this board',several:'Show me variations of these boards'}},{value:'lock',label:'Lock this board in',note:'and finish my brand',needs:'one'}]};
  const checked=checkForm(form);
  if(!checked.ok) {
    const {path,message}=checked.problems[0];
    return {form:null,formUnavailable:`Form cannot display ${path||'these boards'}: ${message} Use the unchanged selection with assemble.mjs.`};
  }
  return {form};
}

function stable(value) {
  if(Array.isArray(value)) return value.map(stable);
  return value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])):value;
}
const partKey=(b,field)=>JSON.stringify(stable(b[field]??null));
const boardKey=b=>JSON.stringify(VARIED_PARTS.map(field=>partKey(b,field)));
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
  function checkBoard(b) {
    const cacheKey=JSON.stringify({...b,number:1,group:'probe'});
    if(cache.has(cacheKey)) return cache.get(cacheKey);
    // Board zero needs a numbered neighbour in its Contact Sheet probe.
    const probe=b.number===0?[b,{...copy(b),number:1,zero:false}]:[b];
    const stem=join(directory,String(++attempt)),spec=assemble(page(a,probe,[{id:b.group,label:b.group}]),library,{selectionDir});
    writeFileSync(stem+'.json',JSON.stringify(spec),{flag:'wx'});
    // Use the tool's own build entry point for every probe, including file,
    // font, SVG, contrast and complete-page byte checks, without a new Node
    // process per strength step. The temporary spec and page are unchanged.
    let reason=null;
    try { runContactSheet(['build','--spec',stem+'.json','--output',stem+'.html']); }
    catch(error) { reason=error.message; }
    cache.set(cacheKey,reason);return reason;
  }
  return {
    accept(c,group,number,base) {
      const b=makeBoard(library,a,c,number,group,base);
      for(const mode of ['light','dark']) {
        const board={...b,primaryMode:mode,...(group==='looks'?{depth:cardDepth(library,c.palette,c.style,mode)}:{})};
        const reason=checkBoard(board);
        if(reason) {replacements.push({slot:number,group,refused:summary(c),reason,replacement:null});return false;}
      }
      return true;
    },
    acceptBoard(b) { return !checkBoard(b); },
    close() { rmSync(directory,{recursive:true,force:true}); },
    get attempts() { return attempt; }
  };
}
// All choices, including spares, obey the prefix's constraints. Refusals never
// reserve a palette or consume an energy. Subsequent slots see the replacement.
function selectPage(command, answers, {library=load(LIBRARY),data=load(TAPS),check=false,selectionDir=process.cwd(),unsteered=false}={},refusal=boardRefusal) {
  const a=validateAnswers(copy(answers),data,library,command);
  const unseenRetry=!a.pageDisplayed&&!!a.avoid?.length;
  const excluded=new Set(unseenRetry?a.avoid.map(boardKey):[]);
  const blockedRecords=a.avoid??[];
  if(unseenRetry) a.avoid=[];
  const refused=board=>refusal(library,board,{ownColours:!!a.ownColours});
  if(!['looks','round1','variations'].includes(command)) fail(command,'unknown command');
  if(unsteered&&command!=='round1') fail('--unsteered','only applies to round1');
  const state=tapDials(a,data),replacements=[],notes=[];
  const off=new Set(a.off??[]);
  a.mode=a.mode??a.kept?.primaryMode??(off.has('darkLed')?'light':a.taps.mode==='dark'&&!off.has('dark')?'dark':a.taps.mode==='light'&&!off.has('light')?'light':state.darkLed>0?'dark':'light');
  // A resumed displayed page keeps its parts while the last returned switch
  // position supplies its new initial mode. History remains in answers' copy.
  if(a.pageDisplayed) for(const b of a.displayedBoards) if(b.primaryMode!==a.mode) {
    b.primaryMode=a.mode;
    if(!b.zero) b.name=boardLabel(library,b);
  }
  const energies=a.ownColours?[]:ENERGIES.filter(energy=>library.palettes.some(p=>p.energy===energy));
  if(unsteered) Object.assign(state,{dials:blank(),darkLed:0,brightColour:0,labels:[]});
  // Picks are full records: validate all fields through the existing assembler,
  // before any ranking or check. Kept assets remain fixed in later rounds.
  if(command==='variations') for(const b of [...a.picks,...a.shown]) assemble(selectionForAssembly(page(a,[b],[{id:b.group,label:b.group}])),library,{selectionDir});
  if(a.pageDisplayed) assemble(selectionForAssembly(page(a,a.displayedBoards,command==='round1'||!a.picks.length?GROUPS:a.picks.map((b,i)=>({id:`pick-${i+1}`,label:`Variations of board ${b.number}`})))),library,{selectionDir});
  const candidatePool=()=>command==='looks'?lookCandidates(library,state,a,refused):candidates(library,state,a,refused);
  let pool=candidatePool();
  const boosts=blank(),pickedLooks=[];
  for(const id of a.looks??[]) {
    const shown=a.looksShown?.find(look=>lookValues(look).includes(id));
    const resolved=shown?pickedLook(shown,id,library,a.kept):null;
    const look=pool.find(c=>lookId(c)===id&&(!resolved||key(c)===key(resolved))); if(!look) fail('looks',`unknown whole look ${id}; use a value from the looks output`);
    pickedLooks.push(look);
    if(!unsteered) for(const [axis,[neg,pos]] of Object.entries(AXES)) boosts[axis]+=look.positions[axis]===pos?1:look.positions[axis]===neg?-1:0;
  }
  if(command==='looks'&&(a.looks??[]).length) fail('looks','picks belong to round1, not the initial looks command');
  if(command!=='looks') for(const axis of Object.keys(AXES)) state.dials[axis]+=boosts[axis];
  if(command==='variations'||(command==='looks'&&a.shown?.length)) for(const [axis,value] of Object.entries(a.steer??{})) state.dials[axis]+=value*3;
  pool=candidatePool();
  const triple=b=>[b.pairing.id,b.palette.id,b.graphicSet.id].join('/');
  const pickedParts=new Set(pickedLooks.map(c=>triple(makeBoard(library,a,c,1,'close'))));
  // A Close board is near a picked look when it shares at least two of its three parts; only those are recommended.
  const pickedTriples=pickedLooks.map(c=>{const x=makeBoard(library,a,c,1,'close');return [x.pairing.id,x.palette.id,x.graphicSet.id];});
  const nearPicked=b=>{const t=[b.pairing.id,b.palette.id,b.graphicSet.id];return pickedTriples.some(p=>p.filter((v,i)=>v===t[i]).length>=2);};
  const passedOver=new Set((a.looksShown??[]).filter(look=>!(a.looks??[]).includes(look.value)).map(look=>triple(makeBoard(library,a,shownLook(look,library,a.kept),1,'close'))).filter(id=>!pickedParts.has(id)));
  const checker=check?checkFactory(a,library,selectionDir,replacements):null;
  const displayedKeys=new Set((a.displayedBoards??[]).map(boardKey));
  const chosen=[],spares=[],seen=new Set([...(a.shown??[]),...(a.picks??[])].map(boardKey).filter(key=>!a.pageDisplayed||!displayedKeys.has(key)));
  const roundPage=command==='round1'||(command==='variations'&&!a.picks.length);
  let groups=copy(GROUPS),feasibilitySearch=false;
  const accept=(c,group,number,base)=>!excluded.has(boardKey(makeBoard(library,a,c,number,group,base)))&&!refused(makeBoard(library,a,c,number,group,base))&&(!checker||checker.accept(c,group,number,base));
  const finishReplacement=(start,c)=>{ for(const r of replacements.slice(start)) r.replacement=summary(c); };
  const rankedSpares=(eligible,next)=>{
    const index=a.pageDisplayed?eligible.findIndex(c=>c.identity===next.identity):eligible.indexOf(next);
    const remaining=eligible.slice(index+1);
    if(!a.pageDisplayed) return remaining.slice(0,16);
    const unique=new Set();
    return remaining.filter(c=>{if(unique.has(c.identity))return false;unique.add(c.identity);return true;}).slice(0,16);
  };
  const displayedCandidate=number=>{
    const b=a.displayedBoards.find(b=>b.number===number);
    const c=effective({...info(library,part(library,'palettes',b.palette.id),part(library,'pairings',b.pairing.id),part(library,'graphics',b.graphicSet.id),state.dials),mode:b.primaryMode,container:b.container,base:b,group:b.group},a,library);
    c.partPositions=partPositions(library,b);c.positions=positions(c.partPositions);
    c.identity=boardKey(b);
    c.ground=ground(b.palette.overrides?.[b.primaryMode]?.ground??c.actualPalette[b.primaryMode].ground);
    if(!roundPage) {
      const parent=a.picks[Number(b.group.slice(5))-1];
      c.parent=parent.number;c.changedParts=VARIED_PARTS.filter(field=>partKey(b,field)!==partKey(parent,field));
    }
    return c;
  };
  try {
    if(command==='looks') {
      groups=[{id:'looks',label:'Whole looks'}];
      // Keep all historical records, but a new colour answer has not yet
      // shown those styles in this set. Only equal overrides exclude a look.
      const history=a.ownColours?(a.shown??[]).filter(look=>{
        const palette=look.board?.palette??look.steps?.find(step=>step.value===look.value)?.palette;
        return JSON.stringify(stable(palette?.overrides))===JSON.stringify(stable(a.kept.palette.overrides));
      }):a.shown??[];
      const fresh=!!history.length,lookPool=fresh?freshLooks(pool,history,library,a.kept):pool;
      const checkLook=(c,slot)=>accept(effective(c,a,library),'looks',slot);
      // Keep the checked greedy page and its replacements when it succeeds.
      // Incomplete leaders, contrasts or coverage trigger the feasibility
      // search; discard refusals from the abandoned greedy attempt first.
      let search=fresh,found;
      if(!search) {
        const start=replacements.length;
        try { found=chooseLooks(lookPool,checkLook,(c,slot)=>{for(const r of replacements.filter(r=>r.slot===slot))r.replacement=summary(effective(c,a,library));}); }
        catch(error) {
          if(error.message!=='looks: no passing distinct leader remains. Correct the answers; see select.mjs help.'&&error.message!=='looks: no passing one- or two-dial contrast remains. Correct the answers; see select.mjs help.'&&error.message!=='looks: no passing page covers two plain grounds and all five marks. Correct the answers; see select.mjs help.') throw error;
          replacements.length=start;
          search=true;
        }
      }
      feasibilitySearch=search;
      if(search) found=chooseFreshLooks(lookPool,checkLook,replacements);
      if(search) for(const r of replacements) r.replacement=summary(effective(found.chosen[r.slot-1],a,library));
      chosen.push(...found.chosen.map(c=>effective(c,a,library)));spares.push(...found.spares);
    } else if(roundPage) {
      if(unsteered) groups.forEach((g,i)=>g.label=['First set','Second set','Third set'][i]);
      const palettes=new Set(),pairings=new Set(),groundFamilies=new Set();let darks=0;
      const total=!a.ownColours&&Object.keys(a.kept??{}).length?11:12;
      const fixedGround=!!a.kept?.palette?.id || ['light','dark'].some(mode=>own(a.kept?.palette?.overrides?.[mode]??{},'ground'));
      const strongest=Object.keys(AXES).filter(k=>Math.abs(state.dials[k])>=2);
      const pagePool=()=>pool.map(c=>{
        const candidate=effective({...c,mode:a.mode},a,library);
        candidate.identity=boardKey(makeBoard(library,a,candidate,1,'angle'));
        return candidate;
      });
      const nativePool=pagePool();
      for(const group of groups) {
        const graphics=new Set();
        for(let slot=0;slot<(group.id==='angle'?total-8:4);slot++) {
          const missing=energies.filter(e=>!chosen.some(c=>c.palette.energy===e)), remaining=total-chosen.length;
          // Cover energies that cannot occur on the opposite strong dial
          // before reaching the angle group (for example bright/classic).
          const beforeAngle=8-chosen.length;
          const freshNative=nativePool.filter(c=>!seen.has(c.identity)&&!excluded.has(c.identity));
          const available=nativePool.filter(c=>!seen.has(c.identity)&&!excluded.has(c.identity)&&(group.id!=='close'||!passedOver.has(triple(makeBoard(library,a,c,1,'close')))));
          const remainingEnergies=new Set([...freshNative,...available].map(c=>c.palette.energy));
          const exhausted=missing.filter(e=>!remainingEnergies.has(e));
          if(exhausted.length&&!a.pageDisplayed) fail('round1',`energy ${exhausted.join(', ')} is exhausted: no unshown board remains`);
          const angleEnergies=new Set(freshNative.filter(c=>!strongest.length||!chosen.length||strongest.filter(k=>c.positions[k]!=='either'&&chosen[0].positions[k]!=='either'&&c.positions[k]!==chosen[0].positions[k]).length===1).map(c=>c.palette.energy));
          const early=missing.filter(e=>!angleEnergies.has(e));
          const ranked=available.filter(c=>{
            if(palettes.has(c.palette.id)||graphics.has(c.graphicSet.id)) return false;
            if(group.id!=='angle'&&early.length>=beforeAngle&&!early.includes(c.palette.energy)) return false;
            if((missing.length>=remaining||(group.id==='angle'&&missing.length))&&!missing.includes(c.palette.energy))return false;
            if(group.id==='close'&&!fixedGround&& (groundFamilies.has(c.ground.family)||a.mode==='light'&&darks+Number(c.ground.dark)>2))return false;
            if(group.id==='angle'&&!unsteered&&strongest.length && strongest.filter(k=>c.positions[k]!=='either'&&chosen[0].positions[k]!=='either'&&c.positions[k]!==chosen[0].positions[k]).length!==1)return false;
            return true;
          });
          const preferred=ranked.filter(c=>!pairings.has(c.pairing.id));
          const fallback=ranked.filter(c=>pairings.has(c.pairing.id)&&!chosen.some(x=>x.group===group.id&&x.pairing.id===c.pairing.id));
          const eligible=[...preferred,...fallback],start=replacements.length;
          const next=a.pageDisplayed?displayedCandidate(chosen.length+1):eligible.find(c=>accept(c,group.id,chosen.length+1));
          if(!next) fail(`round1.${group.id}.${slot+1}`,'no passing board meets the diversity, energy and one-strong-dial constraints');
          finishReplacement(start,next);chosen.push({...next,group:group.id});
          seen.add(next.identity);
          spares.push(rankedSpares(eligible,next));
          if(pairings.has(next.pairing.id)) notes.push(`Board ${chosen.length} reuses an earlier pairing to keep colour and graphic variety.`);
          palettes.add(next.palette.id);pairings.add(next.pairing.id);graphics.add(next.graphicSet.id);
          if(group.id==='close') {groundFamilies.add(next.ground.family);darks+=Number(next.ground.dark);}
        }
      }
      if(a.ownColours)notes.push("Every board uses the member's single colour set; distinct recipe energies are not chased.");
      else if(a.kept?.palette?.id) notes.push('A fixed complete palette takes precedence over available-energy coverage and ground-family variety; every board names its actual fixed palette energy.');
      else if(fixedGround) notes.push('Kept ground roles take precedence over ground-family variety; the page still covers the available recipe energies.');
    } else {
      groups=a.picks.map((b,i)=>({id:`pick-${i+1}`,label:`Variations of board ${b.number}`}));
      for(const [pickIndex,saved] of a.picks.entries()) {
        const base={...assemblyBoard(saved),primaryMode:a.mode};
        const seed=info(library,part(library,'palettes',base.palette.id),part(library,'pairings',base.pairing.id),part(library,'graphics',base.graphicSet.id),state.dials);
        seed.typeLoudness=typeLoudness(base,library);
        const headingFrom=a.kept?.headingFrom??base.pairing.headingFrom;
        // A fixed heading is not a new type choice just because the backing
        // pairing id changes. Keep its pairing, body and donor reference intact.
        const fixedPairing=a.kept?.pairing??(headingFrom?base.pairing.id:null);
        const fixedPalette=a.kept?.palette?.id??(a.ownColours?base.palette.id:null);
        const ranked=[],modes=[a.mode];
        const containers=base.markFile||a.kept?.markFile?[undefined]:library.containers.map(c=>c.id);
        for(const c of pool) {
          if((fixedPairing&&c.pairing.id!==fixedPairing)||(fixedPalette&&c.palette.id!==fixedPalette)) continue;
          // Prune before cloning full board records. Kept parts cannot move.
          const partChanges=Number((a.kept?.pairing??c.pairing.id)!==base.pairing.id)+Number((fixedPalette??c.palette.id)!==base.palette.id)+Number(c.graphicSet.id!==base.graphicSet.id);
          if(partChanges>2) continue;
          for(const mode of modes) for(const container of containers) {
            if(partChanges+Number(mode!==base.primaryMode)+Number(container!==base.container)>2) continue;
            const candidate=effective({...c,mode,container,base,parent:base.number},a,library);
            const board=makeBoard(library,a,candidate,1,groups[pickIndex].id,base);
            if(refused(board)) continue;
            candidate.changedParts=VARIED_PARTS.filter(field=>partKey(board,field)!==partKey(base,field));
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
          const next=a.pageDisplayed?displayedCandidate(number):eligible.find(c=>accept(c,groups[pickIndex].id,number,base));
          if(!next) fail('variations',`no passing new one-or-two-part variation remains for pick ${pickIndex+1}`);
          finishReplacement(start,next);chosen.push({...next,group:groups[pickIndex].id});
          spares.push(rankedSpares(eligible,next));seen.add(next.identity);
        }
        if(a.steer?.quietBold===1&&seed.palette.paletteLoudness===3&&seed.typeLoudness===3) notes.push(`Picked board ${base.number} is already at the loudness ceiling; no louder library step exists.`);
      }
    }
    let boards=[];
    const slotBoard=(c,i)=>{
      const b=makeBoard(library,a,c,i+1,c.group??groups[0].id,c.base);
      if(roundPage) {
        const why=unsteered?'A whole look in library order.':alignedWhy(c,a,data);
        b.why=why??'Another angle on your chosen direction.';
        const earlier=chosen.slice(0,i).filter(c=>c.group==='close'&&nearPicked(makeBoard(library,a,c,1,'close',c.base))).length;
        const recommended=a.pageDisplayed?boards.filter(b=>b.number!==i+1&&b.recommendation).length:earlier;
        if(!unsteered&&b.group==='close'&&recommended<2&&nearPicked(b)) b.recommendation=b.why;
      }
      return b;
    };
    boards=a.pageDisplayed?copy(a.displayedBoards):chosen.map(slotBoard);
    const kept=a.kept??{};
    const zeroBoard=c=>{const b=makeBoard(library,a,c,0,groups[0].id);b.zero=true;b.name='What you are keeping';b.why='Your kept assets, held on every board.';return b;};
    if(!a.ownColours&&Object.keys(kept).length&&roundPage&&!a.pageDisplayed) {
      const zero=zeroBoard(chosen[0]);
      if(checker&&!accept(chosen[0],groups[0].id,0)) fail('board zero','kept assets cannot build; supply usable assets rather than relaxing them');
      boards.unshift(zero);
      notes.push('Board zero shows the supplied assets on the closest library setting; unprovided parts of an existing brand are not reconstructed.');
    }
    // A displayed page starts with its saved records. Only an avoided key
    // on that page can select a slot; accumulated older refusals just exclude.
    if(a.pageDisplayed&&a.avoid?.length) {
      const blocked=new Set(a.avoid.map(boardKey));
      const avoided=b=>a.avoid.some(old=>old.number===b.number&&boardKey(old)===boardKey(b));
      const zeroCandidate=boards[0].zero?displayedCandidate(0):null,zeroSpares=[...spares[0]];
      const fits=(c,i)=>{
        const b=slotBoard(c,i);
        if(blocked.has(boardKey(b))||[...(a.shown??[]),...(a.picks??[]),...boards.filter(x=>x.number!==b.number)].some(x=>boardKey(x)===boardKey(b))) return false;
        if(!roundPage) return true;
        const proposed=chosen.map((old,j)=>j===i?c:old);
        if(!kept.palette?.id&&new Set(proposed.map(x=>x.palette.id)).size!==proposed.length) return false;
        for(const g of groups) {
          const members=proposed.filter(x=>x.group===g.id);
          if(new Set(members.map(x=>x.graphicSet.id)).size!==members.length||(!kept.pairing&&new Set(members.map(x=>x.pairing.id)).size!==members.length)) return false;
        }
        if(!kept.palette?.id&&energies.some(e=>!proposed.some(x=>x.palette.energy===e))) return false;
        const fixedGround=!!kept.palette?.id||['light','dark'].some(mode=>own(kept.palette?.overrides?.[mode]??{},'ground'));
        const close=proposed.filter(x=>x.group==='close');
        if(!fixedGround&&(new Set(close.map(x=>x.ground.family)).size!==close.length||a.mode==='light'&&close.filter(x=>x.ground.dark).length>2)) return false;
        const strong=Object.keys(AXES).filter(k=>Math.abs(state.dials[k])>=2);
        return unsteered||!strong.length||proposed.filter(x=>x.group==='angle').every(x=>strong.filter(k=>x.positions[k]!=='either'&&proposed[0].positions[k]!=='either'&&x.positions[k]!==proposed[0].positions[k]).length===1);
      };
      for(let i=0;i<chosen.length;i++) {
        if(!avoided(boards.find(b=>b.number===i+1))) continue;
        const previous=chosen[i],start=replacements.length;
        const next=spares[i].map(c=>({...c,...(roundPage?{container:CONTAINERS[c.graphicSet.id]}:{}),group:previous.group,base:previous.base})).find(c=>fits(c,i)&&accept(c,c.group,i+1,c.base));
        if(!next) fail(`avoid.${i+1}`,`slot ${i+1} exhausted: no passing unblocked ranked spare preserves the rest of this page`);
        finishReplacement(start,next);
        replacements.push({slot:i+1,group:previous.group,refused:summary(previous),reason:'Blocked by Review',replacement:summary(next)});
        chosen[i]=next;boards[boards.findIndex(b=>b.number===i+1)]=slotBoard(next,i);
        spares[i]=spares[i].filter(c=>{const b=slotBoard({...c,group:previous.group,base:previous.base},i);return !blocked.has(boardKey(b))&&boardKey(b)!==boardKey(boards.find(b=>b.number===i+1));});
      }
      if(zeroCandidate&&avoided(boards[0])) {
        const start=replacements.length;
        const next=zeroSpares.find(c=>{
          const key=boardKey(zeroBoard(c));
          return !blocked.has(key)&&!boards.some(b=>b.number!==0&&boardKey(b)===key)&&accept(c,groups[0].id,0);
        });
        if(!next) fail('avoid.0','slot 0 exhausted: no passing unblocked ranked spare retains the fixed assets');
        finishReplacement(start,next);boards[0]=zeroBoard(next);
        replacements.push({slot:0,group:groups[0].id,refused:summary(zeroCandidate),reason:'Blocked by Review',replacement:summary(next)});
      }
    }
    // Replacement order must not decide the stars. Recompute them in the
    // displayed page's order after every replaced slot has its final parts.
    // All other bytes of unblocked records stay as they were saved.
    if(a.pageDisplayed&&a.avoid?.length&&roundPage) {
      for(const b of boards) if(b.group==='close') delete b.recommendation;
      if(!unsteered) for(const b of boards.filter(b=>!b.zero&&b.group==='close'&&nearPicked(b)).slice(0,2)) b.recommendation=b.why;
    }
    if(roundPage&&!unsteered&&pickedLooks.length&&!boards.some(b=>b.recommendation)) notes.push('No Close board shares two parts with a picked look; no recommendation is available.');
    if(unseenRetry) {
      notes.unshift('Unseen page rebuilt; all blocked boards excluded. Review the rebuilt page before showing.');
      replacements.unshift(...blockedRecords.map(b=>({slot:b.number,group:b.group,refused:{pairing:b.pairing.id,palette:b.palette.id,graphicSet:b.graphicSet.id},reason:'Blocked by Review; unseen page rebuilt',replacement:null})));
    }
    const selection=page(a,boards,groups);
    const result={command,selection,dials:state.dials,wholeLookBoosts:boosts,darkLed:state.darkLed,brightColour:state.brightColour,ignoredNudges:state.ignored,positions:chosen.map(summary),spares:spares.map((list,i)=>({slot:i+1,ranked:list.map(summary)})),replacements,checks:{enabled:check,attempts:checker?.attempts??0},notes};
    if(command==='looks') {
      result.checks.feasibilitySearch=feasibilitySearch;
      result.looks=chosen.map((c,i)=>({value:lookId(c),label:a.ownColours?boards[i].name:`${c.pairing.name} / ${c.palette.name} / ${c.graphicSet.name}`,kind:c.kind,...summary(c)}));
      result.controls=pageControls(a);
      result.options=result.looks.map((look,i)=>{
        const b=boards[i];
        const names=[part(library,'pairings',b.pairing.id).name,...(a.ownColours?[]:[part(library,'palettes',b.palette.id).name]),part(library,'graphics',b.graphicSet.id).name];
        let steps=(a.kept?.palette?[chosen[i]]:pool.filter(step=>step.style.id===chosen[i].style.id&&step.family===chosen[i].family)).sort((x,y)=>['muted','balanced','bold'].indexOf(paletteFamily(x.palette.id).step)-['muted','balanced','bold'].indexOf(paletteFamily(y.palette.id).step)).flatMap(step=>{
          const candidate=effective(step,a,library),board=makeBoard(library,a,candidate,i+1,'looks');
          const depth=Object.fromEntries(['light','dark'].map(mode=>[mode,cardDepth(library,step.palette,step.style,mode)]));
          if(['light','dark'].some(mode=>refused({...board,primaryMode:mode,depth:depth[mode]})||checker&&!checker.acceptBoard({...board,primaryMode:mode,depth:depth[mode]}))) return [];
          const label=[part(library,'pairings',board.pairing.id).name,...(a.ownColours?[]:[part(library,'palettes',board.palette.id).name]),part(library,'graphics',board.graphicSet.id).name].join(', ');
          // An overlay can only replace fields, so a field the option's own depth carries and this
          // step's lacks is stated at its default (Form's depth table); omit a step without one.
          if(Object.values(depth).some(fields=>Object.keys(b.depth??{}).some(key=>!Object.hasOwn(fields,key)&&!Object.hasOwn(STEP_DEPTH_DEFAULTS,key)))) return [];
          const overlay=Object.fromEntries(Object.entries(depth).map(([mode,fields])=>{
            const own=Object.fromEntries(Object.entries(fields).filter(([key,value])=>JSON.stringify(stable(value))!==JSON.stringify(stable(b.depth?.[key]))));
            for(const key of Object.keys(b.depth??{})) if(!Object.hasOwn(fields,key)) {
              if(JSON.stringify(b.depth[key])!==JSON.stringify(STEP_DEPTH_DEFAULTS[key])) own[key]=STEP_DEPTH_DEFAULTS[key];
            }
            return [mode,own];
          }).filter(([,fields])=>Object.keys(fields).length));
          return [{value:lookId(step),label,palette:copy(board.palette),...(Object.keys(overlay).length?{depth:overlay}:{})}];
        });
        if(!steps.some(step=>step.value===look.value)) fail('steps','look has no passing own step in both modes');
        steps=contiguousSteps(steps,look.value);
        look.steps=copy(steps);
        if(a.kept?.palette)steps=steps.map(({palette,...step})=>step);
        return {value:look.value,label:names.join(', '),steps,board:{pairing:copy(b.pairing),palette:copy(b.palette),graphicSet:copy(b.graphicSet),primaryMode:b.primaryMode,...(b.container?{container:b.container}:{}),depth:copy(b.depth),handwriting:b.handwriting,buttonRadius:b.buttonRadius}};
      });
      // Associate every rejected look with the actual passing choice for its slot.
    }
    if(command!=='looks') {
      for(const b of boards) {
        const owner=assemblyBoard(b);
        b.value=boardValue(owner,owner);
        b.steps=library.palettes.filter(p=>a.kept?.palette?p.id===owner.palette.id:paletteFamily(p.id).family===paletteFamily(owner.palette.id).family).flatMap(p=>{
          const step={...copy(owner),palette:{...copy(owner.palette),id:p.id},energy:a.ownColours?owner.energy:p.energy};
          step.name=p.id===owner.palette.id?owner.name:boardLabel(library,step);
          if(['light','dark'].some(mode=>refused({...step,primaryMode:mode})||checker&&!checker.acceptBoard({...step,primaryMode:mode}))) return [];
          return [{value:boardValue(owner,step),...step}];
        });
        if(!b.steps.some(step=>step.value===b.value)) fail('steps',`board ${b.number} has no passing own step in both modes`);
        b.steps=contiguousSteps(b.steps,b.value);
      }
      Object.assign(result,boardsForm(a,selection,selectionDir,command));
    }
    result.checks.attempts=checker?.attempts??0;
    return result;
  } catch(error) {
    if(unseenRetry) throw Error(`avoid: unseen page rebuilt, but cannot fill a complete page: ${error.message}`);
    throw error;
  } finally { checker?.close(); }
}
export function select(command,answers,options={}) {
  try { return selectPage(command,answers,options); }
  catch(error) {
    if(error.message.includes('unseen page rebuilt')) throw error;
    if(!/no passing|library exhausted|no unshown board remains|slot \d+ exhausted|kept assets cannot build/.test(error.message)) throw error;
    // If clearing history restores a legal page, history is exhausted. The
    // ordinary library refusals must not disguise that as a new rule failure.
    if(answers.shown?.length) {
      let fresh=false;
      try { selectPage(command,{...answers,shown:[]},options);fresh=true; } catch {}
      if(fresh) throw error;
    }
    // Diagnose causality only after failure. This private replay never returns
    // a page to the caller: the production page always enforces every rule.
    // Retired pairings stay ineligible, and only the replay's chosen boards
    // can explain which rules prevented the page, never incidental probes.
    let replay;
    try { replay=selectPage(command,answers,options,()=>null); } catch {}
    if(replay) {
      const library=options.library??load(LIBRARY);
      const reasons=new Set(replay.selection.boards.map(board=>boardRefusal(library,board,{ownColours:!!answers.ownColours})).filter(Boolean));
      if(reasons.size) fail(command,`rule refusal prevents a complete page: ${[...reasons].join('; ')}`);
    }
    throw error;
  }
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
  const assembly=selectionForAssembly(result.selection);
  assemble(assembly,load(LIBRARY),{selectionDir:dirname(answersPath)});
  if(output) { writeFileSync(output,JSON.stringify(assembly,null,2)+'\n',{flag:'wx'});result.output=output; }
  return result;
}
export function main(argv=process.argv.slice(2)) {
  try { const result=run(argv);process.stdout.write((typeof result==='string'?result:JSON.stringify(result))+'\n'); }
  catch(error) { process.stderr.write(JSON.stringify({error:error.message})+'\n');process.exitCode=1; }
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url))main();
