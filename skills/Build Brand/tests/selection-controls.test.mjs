import '../../../tools/lib/tests/isolated-home.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,extname} from 'node:path';
import {createHash} from 'node:crypto';
import {select,selectionForAssembly,run} from '../scripts/select.mjs';
import {assemble,LIBRARY,AXES,partPositions} from '../scripts/assemble.mjs';
import {boardRefusal} from '../scripts/refusals.mjs';
import {checkForm} from '../../../tools/Form/scripts/format.js';
import {resolveBoards} from '../../../tools/Form/scripts/boards.js';
import {validateBrandBoards} from '../../../tools/Contact Sheet/scripts/brand-boards.js';
import {operator,firstStrategy,bakery,lawFirm,lookActions} from './select-fixtures.mjs';
import {expectedMode} from './m51c-checks.mjs';
const library=JSON.parse(readFileSync(LIBRARY));
const taps=JSON.parse(readFileSync(new URL('../parts/taps.json',import.meta.url)));
const copy=structuredClone,modes=['light','dark'];
const family=id=>id.replace(/-(muted|balanced|bold)$/,'');
const lookValue=(pairing,palette,graphic)=>'look-'+createHash('sha256').update(`${pairing}/${palette}/${graphic}`).digest('hex').slice(0,32);
const p=(kind,id)=>library[kind].find(p=>p.id===id);
const lookForm=(a,r)=>({title:'Choose looks',brand:{name:a.name,initials:r.selection.boards[0].initials,sentence:a.sentence,body:a.body,words:a.words},questions:[{id:'looks',type:'boards',view:'look',label:'Choose looks',pick:3,min:2,controls:r.controls,options:r.options}],actions:lookActions()});
function passes(selection,b,l=library) {
 // Board zero is a reference; Contact Sheet also needs an alternative in its group.
 const boards=b.zero?[b,selection.boards.find(other=>!other.zero&&other.group===b.group)]:[b];
 const groups=selection.groups.filter(g=>g.id===b.group);
 const spec=assemble(selectionForAssembly({...selection,groups,boards}),l);
 validateBrandBoards(spec,{add(path){return {extension:extname(path),uri:'data:application/octet-stream;base64,'+readFileSync(path).toString('base64')};}},()=>{});
 assert.equal(boardRefusal(l,b),null);
}
function assertLooks(a,r) {
 const before=copy(r),form=lookForm(a,r);
 assert.deepEqual(r.controls,{mode:expectedMode(a),strength:true});
 assert.deepEqual(checkForm(form),{ok:true,problems:[]});
 const values=new Set();
 for(const [i,o] of r.options.entries()) {
  const style=p('styles',r.looks[i].style);
  assert.ok(o.steps.length>=1&&o.steps.length<=3);
  assert.equal(o.steps.filter(s=>s.value===o.value).length,1);
  assert.deepEqual(o.steps.map(s=>p('palettes',s.palette.id).paletteLoudness),o.steps.map(s=>p('palettes',s.palette.id).paletteLoudness).sort());
  for(const step of o.steps) {
   assert.equal(family(step.palette.id),family(o.board.palette.id));
   assert.equal(library.withheld.some(w=>w.palette===step.palette.id&&w.style===style.id),false);
   assert.equal(step.value,lookValue(style.id,step.palette.id,style.graphicSet));
   assert.equal(values.has(step.value),false);values.add(step.value);
   assert.equal(step.label,[p('pairings',o.board.pairing.id).name,p('palettes',step.palette.id).name,p('graphics',o.board.graphicSet.id).name].join(', '));
   for(const mode of modes) {
    const expected={...style.depth,...library.cardDepth.find(d=>d.palette===step.palette.id&&d.style===style.id&&d.mode===mode)?.depth};
    assert.deepEqual({...o.board.depth,...step.depth?.[mode]},expected);
    if(r.checks.enabled)passes(r.selection,{...r.selection.boards[i],palette:step.palette,primaryMode:mode,depth:{...o.board.depth,...step.depth?.[mode]}});
   }
  }
 }
 assert.deepEqual(r,before,'checks leave options unchanged');
}
function assertBoards(a,r) {
 assert.ok(r.form,r.formUnavailable);
 const q=r.form.questions[0],before=copy(r);
 assert.deepEqual(q.controls,{mode:expectedMode(a),strength:true});
 assert.deepEqual(checkForm(r.form),{ok:true,problems:[]});
 assert.equal(q.options.length,r.selection.boards.length);
 const values=new Set();
 for(const [i,b] of r.selection.boards.entries()) {
  assert.equal(b.primaryMode,q.controls.mode);
  assert.equal(q.options[i].value,b.value);
  assert.equal(b.steps.filter(s=>s.value===b.value).length,1);
  assert.deepEqual(q.options[i].steps,b.steps.map(s=>({value:s.value,label:s.name,palette:{id:s.palette.id}})));
  for(const step of b.steps) {
   assert.equal(step.primaryMode,q.controls.mode);
   assert.equal(family(step.palette.id),family(b.palette.id));
   assert.equal(values.has(step.value),false);values.add(step.value);
   const own=selectionForAssembly({...r.selection,boards:[b]}).boards[0];
   const expected={...own,palette:step.palette,energy:step.energy,name:step.name};
   assert.deepEqual(selectionForAssembly({...r.selection,boards:[step]}).boards[0],expected,'only colour, energy and caption change');
   assert.equal(step.energy,p('palettes',step.palette.id).energy);
   if(step.palette.id!==b.palette.id)assert.ok(step.name.includes(p('palettes',step.palette.id).name));
   if(r.checks.enabled)for(const primaryMode of modes)passes(r.selection,{...step,primaryMode});
  }
 }
 assert.deepEqual(r,before);
}
for(const get of [operator,firstStrategy,bakery,lawFirm]) for(const tapMode of [undefined,...taps.questions.find(q=>q.id==='mode').options.map(o=>o.id)]) {
 const answers=()=>{const a=get();if(tapMode!==undefined) a.taps.mode=tapMode;return a;};
 const label=`${get.name} ${tapMode??'own mode'}`;
 test(`${label}: checked looks controls and exact approved card-mode steps pass Form unchanged`,()=>{
  const a=answers(),r=select('looks',a,{check:true});assertLooks(a,r);
 });
 test(`${label}: checked Round 1 and variations share page mode and complete checked steps`,()=>{
  const a={...answers(),looksShown:[],mode:'light'},r=select('round1',a,{check:true});assertBoards(a,r);
  const step=r.selection.boards.flatMap(b=>b.steps).find(s=>!r.selection.boards.some(b=>b.value===s.value));assert.ok(step);
  const input={...a,mode:'dark',picks:[copy(step)],shown:copy(r.selection.boards)};
  const before=copy(input),v=select('variations',input,{check:true});assertBoards(input,v);assert.deepEqual(input,before);
  assert.ok(v.positions.every(c=>!c.changedParts.includes('primaryMode')));
  assert.ok(v.selection.boards.every(b=>b.content.sentence===step.content.sentence));
  assert.ok(v.selection.boards.every(b=>JSON.stringify([b.pairing,b.palette,b.graphicSet,b.container])!==JSON.stringify([step.pairing,step.palette,step.graphicSet,step.container])));
 });
 test(`${label}: first page's first two looks make checked Round 1 boards and complete steps`,()=>{
  const a=answers(),first=select('looks',a,{check:true}),picked=first.looks.slice(0,2);
  const input={...a,looks:picked.map(l=>l.value),looksShown:first.options},before=copy(input);
  const round=select('round1',input,{check:true});assertBoards(input,round);assert.deepEqual(input,before);
  for(const [axis,[neg,pos]] of Object.entries(AXES)) {
   const boost=picked.reduce((n,l)=>n+(l.positions[axis]===pos?1:l.positions[axis]===neg?-1:0),0);
   assert.equal(round.wholeLookBoosts[axis],boost);
   assert.equal(round.dials[axis]-first.dials[axis],boost);
  }
 });
 test(`${label}: any picked look step resolves and boosts its own card in Round 1`,()=>{
  const a=answers(),r=select('looks',a),option=r.options.find(o=>o.steps.length>1),step=option.steps.find(s=>s.value!==option.value);
  const input={...a,looks:[step.value],looksShown:r.options,mode:'light'},before=copy(input),round=select('round1',input);
  assert.deepEqual(input,before);assertBoards(input,round);
  const tags=partPositions(library,{...option.board,palette:step.palette});
  for(const [axis,[neg,pos]] of Object.entries(AXES)) {
   const n=Object.values(tags).reduce((n,t)=>n+(t[axis]===pos?1:t[axis]===neg?-1:0),0);
   assert.equal(round.wholeLookBoosts[axis],Math.sign(n));
  }
  const bad=copy(input);bad.looks=[step.value.replace(/.$/,'z')];assert.throws(()=>select('round1',bad),/looksShown/);
 });
 test(`${label}: retry history counts only own cards, with steps retained as unshown choices`,()=>{
  const a=answers(),first=select('looks',a),own=first.options.map(({steps,...o})=>o);
  const nextLooks=select('looks',{...a,shown:first.options});
  assert.deepEqual(nextLooks,select('looks',{...a,shown:own}));
  const expandedLooks=first.looks.flatMap(look=>look.steps.map(step=>({...look,value:step.value,palette:step.palette.id})));
  assert.notDeepEqual(nextLooks.looks,select('looks',{...a,shown:expandedLooks}).looks,'planted step history changes retry exclusions and part-use ranking');
  assert.deepEqual(select('round1',{...a,looksShown:first.options}),select('round1',{...a,looksShown:own}),'only own cards count as passed over');
  const r=select('round1',{...a,looksShown:[]}),withoutSteps=r.selection.boards.map(({value,steps,...b})=>b);
  const input={...a,looksShown:[],picks:[],shown:r.selection.boards,steer:{}};
  assert.deepEqual(select('variations',input),select('variations',{...input,shown:withoutSteps}));
  // A planted history of the next page's own cards must change that page.
  // This guards the exclusion check independently of whether its spare steps
  // happen to rank on the immediately following page.
  const next=select('variations',input);
  assert.notDeepEqual(next.selection,select('variations',{...input,shown:[...input.shown,...next.selection.boards]}).selection,'planted own-card history excludes the next page');
 });
}
test('returned mode wins over taps and kept mode, survives a retry and carries to the next page',()=>{
 const a={...operator(),kept:{primaryMode:'dark'},mode:'light'};
 const looks=select('looks',a);assertLooks(a,looks);
 const retry=select('looks',{...a,shown:looks.options,mode:'dark'});assert.equal(retry.controls.mode,'dark');
 const round=select('round1',{...a,mode:'light',looksShown:[...looks.options,...retry.options]});assertBoards(a,round);
 const v=select('variations',{...a,mode:'dark',looksShown:looks.options,picks:[],shown:round.selection.boards});
 assert.equal(v.form.questions[0].controls.mode,'dark');assert.ok(v.selection.boards.every(b=>b.primaryMode==='dark'));
 for(const mode of [null,'sepia',false,0])assert.throws(()=>select('looks',{...operator(),mode}),/mode.*light or dark/);
});
test('a withheld sibling or a Contact Sheet refusal omits that step without moving its card',()=>{
 const a=operator(),r=select('looks',a),o=r.options.find(o=>o.steps.length===3),sibling=o.steps.find(s=>s.value!==o.value);
 const withheld=copy(library);withheld.withheld.push({style:o.board.pairing.id,palette:sibling.palette.id,mode:'dark',reason:'planted control'});
 const w=select('looks',a,{library:withheld});
 assert.equal(w.options.find(x=>x.value===o.value).steps.some(s=>s.value===sibling.value),false);
 const bad=copy(library),palette=bad.palettes.find(p=>p.id===sibling.palette.id);palette.light.onPop=palette.light.pop;
 const checked=select('looks',a,{library:bad,check:true});
 assert.ok(checked.options.every(o=>o.steps.every(s=>s.palette.id!==palette.id)));
 const round=select('round1',{...a,looksShown:[]},{library:bad,check:true});
 assert.ok(round.selection.boards.every(b=>b.steps.every(s=>s.palette.id!==palette.id)));
 assert.deepEqual(checkForm(round.form),{ok:true,problems:[]});
});
test('planted output controls catch missing controls, wrong mode, wrong step depth, captions and picked records',()=>{
 const a=operator(),r=select('looks',a),plant=edit=>{const bad=copy(r);edit(bad);assert.throws(()=>assertLooks(a,bad));};
 plant(r=>delete r.controls);plant(r=>r.controls.mode='light');plant(r=>delete r.options[0].steps);
 plant(r=>r.options[0].steps[0].depth={dark:{ink:'wrong'}});
 plant(r=>r.options[0].steps[0].label='Wrong palette');
 plant(r=>r.options[0].steps[0].palette.id='absent-bold');
 const boardAnswers={...a,looksShown:[]},b=select('round1',boardAnswers),boardPlant=edit=>{const bad=copy(b);edit(bad);assert.throws(()=>assertBoards(boardAnswers,bad));};
 boardPlant(r=>delete r.form.questions[0].controls);boardPlant(r=>r.selection.boards[0].primaryMode='light');
 boardPlant(r=>r.selection.boards[0].steps[0].content.sentence='Changed copy');
 boardPlant(r=>r.form.questions[0].options[0].steps[0].label='Wrong caption');
 boardPlant(r=>r.selection.boards[0].steps[0].value='board-wrong');
});
test('CLI metadata stays in the returned selection and picked records, while --output remains Assembly input',()=>{
 const work=mkdtempSync(join(tmpdir(),'selection-controls-'));
 try {
  const input=join(work,'answers.json'),output=join(work,'selection.json');writeFileSync(input,JSON.stringify({...operator(),looksShown:[]}));
  const r=run(['round1','--answers',input,'--output',output]);
  assert.ok(r.selection.boards.every(b=>b.value&&b.steps.length));
  const disk=JSON.parse(readFileSync(output));assert.deepEqual(disk,selectionForAssembly(r.selection));
  assert.equal(assemble(disk,library).boards.length,12);
  const picked=r.selection.boards[0].steps.at(-1);passes(r.selection,picked);
 } finally {rmSync(work,{recursive:true,force:true});}
});
for(const id of [undefined,'business-blue-bold'])test(`kept palette ${id??'roles only'}: one fixed step, both modes and card handoff retain overrides`,()=>{
 const overrides={light:{hairline:'#bbbbbb'},dark:{hairline:'#777777'}};
 const a={...operator(),kept:{palette:{...(id?{id}:{}),overrides}}},before=copy(a);
 const looks=select('looks',a,{check:true});assert.ok(looks.options,looks.formUnavailable);
 assert.deepEqual(looks.controls,{mode:'dark'});assert.equal(looks.formUnavailable,undefined);
 const form=lookForm(a,looks);assert.deepEqual(checkForm(form),{ok:true,problems:[]});
 for(const [i,o] of looks.options.entries()){
  assert.equal(o.steps.length,1);const step=o.steps[0];
  assert.equal(step.value,o.value);assert.equal(step.label,o.label);assert.deepEqual(step.palette,o.board.palette);
  assert.deepEqual(step.palette.overrides,overrides);
  if(id)assert.equal(step.palette.id,id);
  for(const mode of modes){
   const style=p('styles',looks.looks[i].style),palette=p('palettes',looks.looks[i].palette);
   assert.deepEqual({...o.board.depth,...step.depth?.[mode]},{...style.depth,...library.cardDepth.find(d=>d.palette===palette.id&&d.style===style.id&&d.mode===mode)?.depth});
   passes(looks.selection,{...looks.selection.boards[i],palette:step.palette,primaryMode:mode,depth:{...o.board.depth,...step.depth?.[mode]}});
  }
 }
 const round=select('round1',{...a,looks:[looks.options[0].steps[0].value],looksShown:looks.options,mode:'light'},{check:true});
 assert.ok(round.form,round.formUnavailable);assert.equal(round.formUnavailable,undefined);
 assert.deepEqual(round.form.questions[0].controls,{mode:'light'});
 assert.deepEqual(checkForm(round.form),{ok:true,problems:[]});
 for(const [i,b] of round.selection.boards.entries()){
  const option=round.form.questions[0].options[i];
  assert.equal(b.steps.length,1);assert.equal(option.steps.length,1);
  assert.equal(option.steps[0].value,b.value);assert.deepEqual(option.steps[0].palette,b.palette);
  assert.deepEqual(b.palette.overrides,overrides);assert.deepEqual(b.steps[0].palette,b.palette);
  for(const primaryMode of modes)passes(round.selection,{...b.steps[0],primaryMode});
 }
 const variations=select('variations',{...a,looksShown:looks.options,picks:[round.selection.boards[1].steps[0]],shown:round.selection.boards,mode:'dark'},{check:true});
 assert.ok(variations.form,variations.formUnavailable);assert.deepEqual(variations.form.questions[0].controls,{mode:'dark'});
 assert.ok(variations.form.questions[0].options.every(o=>o.steps.length===1&&o.steps[0].palette.overrides.light.hairline==='#bbbbbb'));
 assert.deepEqual(a,before);
});

test('the sitting saves showing step records and applies the returned mode when assembling a lock',()=>{
 const sitting=readFileSync(new URL('../paths/sitting.md',import.meta.url),'utf8');
 assert.match(sitting,/For Assembly or lock[^.]*returned `mode` as its `primaryMode`/);
 for(const heading of ['Step 3: Whole looks','Step 4: Make and show the boards','Step 5: Blend and tune']) {
  const section=sitting.split('## '+heading+'\n')[1].split('\n## ')[0];
  assert.match(section,/`controls`[^.]*unchanged|unchanged[^.]*`controls`/);
  assert.match(section,/returned `mode`|returned switch position/);
  assert.match(section,/step it showed/);
 }
});

for(const command of ['round1','variations'])test(`${command}: a displayed-page resume takes the last returned mode without mutating saved history`,()=>{
 const a={...operator(),looksShown:[],mode:'dark'},seed=select('round1',a);
 const input=command==='round1'?a:{...a,picks:[seed.selection.boards[0].steps[0]],shown:seed.selection.boards};
 const displayed=select(command,input),answers={...input,mode:'light',pageDisplayed:true,displayedBoards:displayed.selection.boards},before=copy(answers);
 const resumed=select(command,answers,{check:true});assertBoards(answers,resumed);assert.deepEqual(answers,before);
 for(const [i,b] of resumed.selection.boards.entries()) {
  const old=displayed.selection.boards[i];
  for(const field of ['pairing','palette','graphicSet','container'])assert.deepEqual(b[field],old[field]);
  assert.equal(b.value,old.value);assert.ok(b.name.endsWith(' / light'));
  assert.ok(b.steps.every(step=>step.primaryMode==='light'&&step.name.endsWith(' / light')));
 }
});
