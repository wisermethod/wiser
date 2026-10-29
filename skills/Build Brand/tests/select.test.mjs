import '../../../tools/lib/tests/isolated-home.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,realpathSync,symlinkSync,readdirSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {select,tapDials,ground,score,run,ENERGIES} from '../scripts/select.mjs';
import {assemble,LIBRARY,AXES} from '../scripts/assemble.mjs';
import {runContactSheet} from '../../../tools/Contact Sheet/scripts/contact-sheet.js';
import {operator,firstStrategy} from './select-fixtures.mjs';
const library=JSON.parse(readFileSync(LIBRARY)),data=JSON.parse(readFileSync(new URL('../parts/taps.json',import.meta.url)));
const work=mkdtempSync(join(tmpdir(),'brand-selection-tests-'));
const script=fileURLToPath(new URL('../scripts/select.mjs',import.meta.url));let count=0;
const path=label=>join(work,`${++count}-${label}`);
const palette=id=>library.palettes.find(p=>p.id===id);
test.after(()=>rmSync(work,{recursive:true,force:true}));
function assertRound(r,a) {
  const b=r.selection.boards;
  assert.ok(b.length>=10&&b.length<=12);
  assert.deepEqual(r.selection.groups.map(g=>g.id),['close','further','angle']);
  assert.deepEqual(new Set(b.map(b=>palette(b.palette.id).energy)),new Set(ENERGIES));
  const close=b.filter(b=>b.group==='close');
  assert.equal(close.length,4);assert.equal(new Set(close.map(b=>ground(palette(b.palette.id)[b.primaryMode].ground).family)).size,close.length);
  assert.ok(close.filter(b=>ground(palette(b.palette.id)[b.primaryMode].ground).dark).length<=2);
  assert.equal(close[0].primaryMode,'dark');assert.equal(close[1].primaryMode,'dark');
  const recommended=b.filter(b=>b.recommendation);assert.ok(recommended.length<=2);
  const tapped=data.questions.map(q=>q.options.find(o=>o.id===a.taps[q.id]).label);
  for(const b of recommended){const quotes=[...b.recommendation.matchAll(/“([^”]+)”/g)].map(m=>m[1]);assert.ok(quotes.length>0);for(const q of quotes)assert.ok(tapped.includes(q),q);assert.ok(!/[\r\n]/.test(b.recommendation));}
  for(const board of b){assert.equal(board.content.brandName,a.name);assert.equal(board.content.sentence,a.sentence);assert.deepEqual(board.words,a.words);}
  const strong=Object.keys(AXES).filter(axis=>Math.abs(r.dials[axis])>=2),first=r.positions[0];
  if(strong.length)for(const [i,board]of b.entries())if(board.group==='angle')assert.equal(strong.filter(k=>r.positions[i].positions[k]!=='either'&&first.positions[k]!=='either'&&r.positions[i].positions[k]!==first.positions[k]).length,1);
}
for(const [label,fixture]of [['operator',operator],['First Strategy',firstStrategy]]) {
  test(`${label} taps produce twelve boards with five energies, distinct close grounds, dark limits and sourced recommendations`,()=>assertRound(select('round1',fixture()),fixture()));
  test(`${label} checked Round 1 replaces refused combinations and the final whole page builds`,()=>{
    const a=fixture(),r=select('round1',a,{check:true});assertRound(r,a);
    assert.ok(r.replacements.length);assert.ok(r.checks.attempts>=12);
    for(const refusal of r.replacements){assert.ok(refusal.reason);assert.ok(refusal.replacement);assert.notDeepEqual([refusal.refused.pairing,refusal.refused.palette,refusal.refused.graphicSet],[refusal.replacement.pairing,refusal.replacement.palette,refusal.replacement.graphicSet]);}
    const spec=path('spec.json'),html=path('page.html');writeFileSync(spec,JSON.stringify(assemble(r.selection,library)));
    assert.equal(runContactSheet(['build','--spec',spec,'--output',html]).itemCount,12);
  });
  test(`${label} whole looks have four distinct leaders and four exact one-dial contrasts`,()=>{
    const a=fixture(),r=select('looks',a);assert.equal(r.looks.length,8);assert.equal(r.options.length,8);
    assert.equal(new Set(r.looks.map(l=>l.palette)).size,8);
    for(const field of ['pairing','graphicSet'])assert.equal(new Set(r.looks.slice(0,4).map(l=>l[field])).size,4);
    for(const look of r.looks.slice(4))assert.equal(Object.keys(AXES).filter(k=>look.positions[k]!==r.looks[0].positions[k]).length,1);
    for(const [i,option]of r.options.entries()){assert.equal(option.value,r.looks[i].value);assert.ok(option.label);assert.equal(option.picture.name,a.name);assert.equal(option.picture.pending,'whole-look grammar');assert.equal(Object.keys(option.picture.positions).length,6);}
    const picked=r.looks.slice(0,2),boosted=select('round1',{...a,looks:picked.map(l=>l.value)});
    for(const [axis,[neg,pos]]of Object.entries(AXES))assert.equal(boosted.dials[axis]-r.dials[axis],picked.reduce((n,l)=>n+(l.positions[axis]===pos?1:l.positions[axis]===neg?-1:0),0));
  });
}
test('operator and First Strategy dial arithmetic retains small nudges exactly',()=>{
  assert.deepEqual(tapDials(operator(),data).dials,{classicContemporary:1,quietBold:2,warmCool:2,playfulSerious:1,handGeometric:1,softStrong:1});
  assert.deepEqual(tapDials(firstStrategy(),data).dials,{classicContemporary:2,quietBold:-2,warmCool:2,playfulSerious:0,handGeometric:1,softStrong:-1});
  assert.equal(tapDials(operator(),data).darkLed,2.5);
});
test('read-back off option, pole, dial and dark-led part drop their contributions before ranking',()=>{
  const a=operator(),base=tapDials(a,data);
  const without=tapDials({...a,off:['mechanical']},data);assert.equal(without.dials.handGeometric,0);assert.equal(without.dials.warmCool,base.dials.warmCool-1);assert.equal(without.dials.playfulSerious,base.dials.playfulSerious-1);
  assert.equal(tapDials({...a,off:['quietBold']},data).dials.quietBold,0);
  assert.equal(tapDials({...a,off:['strong']},data).dials.softStrong,-1);
  assert.equal(select('round1',{...a,off:['darkLed']}).darkLed,0);
  assert.throws(()=>select('round1',{...a,off:['apple']}),/unselected/);
});
test('unsteered comparison zeros every dial, follows library order and has five energies without recommendations',()=>{
  const a=select('round1',operator(),{unsteered:true}),b=select('round1',firstStrategy(),{unsteered:true});
  assert.deepEqual(Object.values(a.dials),[0,0,0,0,0,0]);assert.equal(a.darkLed,0);
  assert.deepEqual(a.selection.groups.map(g=>g.label),['First set','Second set','Third set']);
  assert.ok(a.selection.boards.every(b=>!b.recommendation));assert.deepEqual(new Set(a.selection.boards.map(b=>b.energy)),new Set(ENERGIES));
  assert.deepEqual(a.selection.boards.map(b=>[b.palette.id,b.pairing.id,b.graphicSet.id]),b.selection.boards.map(b=>[b.palette.id,b.pairing.id,b.graphicSet.id]));
  assert.equal(a.selection.boards[0].pairing.id,library.pairings[0].id);assert.equal(a.selection.boards[0].palette.id,library.palettes[0].id);assert.equal(a.selection.boards[0].graphicSet.id,library.graphics[0].id);
});
test('same inputs produce byte-identical selection, spares and replacement report',()=>{
  assert.equal(JSON.stringify(select('round1',operator())),JSON.stringify(select('round1',operator())));
  const a=select('round1',operator(),{check:true}),b=select('round1',operator(),{check:true});assert.deepEqual(a,b);
});
test('a known contrast refusal is replaced by the next ranked spare without weakening its colours or pattern',()=>{
  const unchecked=select('round1',firstStrategy()),checked=select('round1',firstStrategy(),{check:true});
  assert.equal(unchecked.selection.boards[2].graphicSet.id,'stitch');
  const refusal=checked.replacements.find(r=>r.slot===3);assert.equal(refusal.refused.palette,'stone-cobalt');assert.equal(refusal.refused.graphicSet,'stitch');assert.match(refusal.reason,/WCAG/);
  assert.equal(checked.selection.boards[2].graphicSet.id,'drafting');assert.ok(!checked.selection.boards[2].palette.overrides);
});
test('checked whole-look ids remain valid boosts even if Contact Sheet replaced an unchecked leader',()=>{
  const a=firstStrategy(),looks=select('looks',a,{check:true});assert.ok(looks.replacements.every(r=>r.replacement));
  const r=select('round1',{...a,looks:looks.looks.slice(0,2).map(l=>l.value)});assert.ok(Object.values(r.wholeLookBoosts).some(n=>n!==0));
});
test('kept logo and font are absolute in output, fixed on every board, with board zero first and twelve total',()=>{
  const input=path('answers.json'),output=path('selection.json'),mark=path('mark.svg');
  writeFileSync(mark,'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="currentColor"/></svg>');
  const entry=library.fonts.Archivo.files[0];const face=resolve(dirname(LIBRARY),entry.path);
  const a={...operator(),kept:{markFile:mark,headingFrom:{file:face,family:'Kept face',weight:700}}};writeFileSync(input,JSON.stringify(a));
  const r=run(['round1','--answers',input,'--output',output,'--check']);assert.equal(r.selection.boards.length,12);assert.equal(r.selection.boards[0].number,0);assert.equal(r.selection.boards[0].zero,true);
  for(const b of r.selection.boards){assert.equal(b.markFile,realpathSync(mark));assert.ok(isAbsoluteForTest(b.pairing.headingFrom.file));assert.equal(b.pairing.headingFrom.family,'Kept face');assert.ok(!b.container);}
  assert.equal(JSON.stringify(JSON.parse(readFileSync(output))),JSON.stringify(r.selection));
  const spec=path('kept-spec.json'),html=path('kept-page.html');writeFileSync(spec,JSON.stringify(assemble(r.selection,library)));
  assert.equal(runContactSheet(['build','--spec',spec,'--output',html]).itemCount,12);
  const tuned=select('tune',{...a,picks:[r.selection.boards[1]],steer:{}},{check:true});assert.equal(tuned.selection.boards.length,1);assert.equal(tuned.selection.boards[0].markFile,mark);
});
function isAbsoluteForTest(path){return path.startsWith('/');}
test('kept colour role remains fixed, while energy labels still describe actual recipes',()=>{
  const r=select('round1',{...operator(),kept:{palette:{overrides:{light:{hairline:'#b9b9b9'},dark:{hairline:'#777777'}}}}});
  assert.equal(r.selection.boards[0].number,0);
  for(const b of r.selection.boards){assert.equal(b.palette.overrides.light.hairline,'#b9b9b9');assert.equal(b.palette.overrides.dark.hairline,'#777777');assert.equal(b.energy,palette(b.palette.id).energy);}
  const close=r.selection.boards.filter(b=>b.group==='close'&&!b.zero);assert.equal(new Set(close.map(b=>ground(palette(b.palette.id)[b.primaryMode].ground).family)).size,4);
});
test('fixed full palette states its unavoidable coverage exception instead of claiming five energies',()=>{
  const r=select('round1',{...operator(),kept:{palette:{id:'navy-gold'}}});
  assert.ok(r.selection.boards.every(b=>b.palette.id==='navy-gold'&&b.energy==='dark-first'));
  assert.ok(r.notes.some(n=>n.includes('takes precedence over five-energy coverage')));
});
for(const [label,fixture]of [['operator',operator],['First Strategy',firstStrategy]])test(`${label} blend and tune build, apply steer and return ranked spares`,()=>{
  const a=fixture(),picks=select('round1',a,{check:true}).selection.boards.slice(0,2);
  for(const command of ['blend','tune']) {
    const r=select(command,{...a,picks,steer:{warmCool:-1,quietBold:1,softStrong:1,classicContemporary:1}},{check:true});
    assert.equal(r.selection.boards.length,command==='tune'?1:3);assert.ok(r.spares.every(s=>s.ranked.length));
    assert.equal(r.dials.warmCool,tapDials(a,data).dials.warmCool-3);
    const spec=path('later.json'),html=path('later.html');writeFileSync(spec,JSON.stringify(assemble(r.selection,library)));assert.equal(runContactSheet(['build','--spec',spec,'--output',html]).itemCount,r.selection.boards.length);
  }
});
test('first unsteered blend carries first palette and graphic set with second pairing',()=>{
  const a=operator(),picks=select('round1',a).selection.boards.slice(0,2),b=select('blend',{...a,picks}).selection.boards[0];
  assert.equal(b.palette.id,picks[0].palette.id);assert.equal(b.pairing.id,picks[1].pairing.id);assert.equal(b.graphicSet.id,picks[0].graphicSet.id);
});
test('bolder tune takes next louder same-temperature palette, and ceiling is named',()=>{
  const a=firstStrategy(),pick=select('round1',a).selection.boards[0];
  const r=select('tune',{...a,picks:[pick],steer:{quietBold:1}}),p=palette(r.selection.boards[0].palette.id);
  assert.equal(p.temperature,palette(pick.palette.id).temperature);assert.equal(p.paletteLoudness,Math.min(3,palette(pick.palette.id).paletteLoudness+1));
  const loud=select('round1',operator()).selection.boards[0],ceiling=select('tune',{...operator(),picks:[loud],steer:{quietBold:1}});assert.ok(ceiling.notes.some(n=>n.includes('ceiling')));
});
test('taps data has all nine closed option sets, neutral options, Mechanical line and complete looks rule',()=>{
  assert.deepEqual(data.questions.map(q=>q.options.length),[3,5,4,4,5,5,5,5,6]);assert.equal(new Set(data.questions.flatMap(q=>q.options.map(o=>o.id))).size,42);
  assert.equal(data.questions[1].options[0].description,'Precise and engineered');assert.match(data.wholeLooks.rule,/exactly one aggregate position/);
  for(const q of data.questions)for(const option of q.options){assert.ok(option.id&&option.label);if(['Not sure','Either','Balanced','None of these','Light'].includes(option.label))assert.deepEqual(option.nudges,{});}
});
test('neutral and extreme valid tap patterns still yield complete pages',()=>{
  const patterns=[data.questions.map(q=>q.options.at(-1).id),data.questions.map(q=>q.options[0].id),['dark','natural','rooted','soft-graceful','kitchenaid','patagonia','subaru','anthropologie','spa']];
  for(const ids of patterns){const a=operator();a.taps=Object.fromEntries(data.questions.map((q,i)=>[q.id,ids[i]]));const r=select('round1',a);assert.equal(r.selection.boards.length,12);assert.deepEqual(new Set(r.selection.boards.map(b=>b.energy)),new Set(ENERGIES));}
});
test('help/import are inert, unknown flags fail with empty stdout before files are opened',()=>{
  for(const argv of [['help'],['round1','--help','--answers','/absent']]){const c=spawnSync(process.execPath,[script,...argv],{encoding:'utf8'});assert.equal(c.status,0);assert.match(c.stdout,/Usage:/);}
  const imported=spawnSync(process.execPath,['--input-type=module','-e',`import ${JSON.stringify(script)}`],{encoding:'utf8'});assert.equal(imported.status,0);assert.equal(imported.stdout,'');assert.equal(imported.stderr,'');
  for(const flag of ['--env','--install','--typo']){const c=spawnSync(process.execPath,[script,'round1',flag],{encoding:'utf8'});assert.equal(c.status,1);assert.equal(c.stdout,'');assert.match(c.stderr,new RegExp(flag));}
});
test('bad option ids, unknown fields, duplicate ids and invalid steers are refused',()=>{
  for(const change of [a=>a.taps.mode='night',a=>a.taps.extra='light',a=>a.extra=true,a=>a.looks=['missing'],a=>a.off=['strong','strong'],a=>a.kept.extra=true]){const a=operator();change(a);assert.throws(()=>select('round1',a));}
  const a=operator(),picks=select('round1',a).selection.boards.slice(0,1);
  assert.throws(()=>select('tune',{...a,picks,steer:{quietBold:2}}),/quietBold/);
  assert.throws(()=>select('tune',{...a,picks:[]}),/one to three/);
  assert.throws(()=>select('round1',a,{unsteered:false,library:{...library,pairings:library.pairings.map(p=>({...p,tags:{...p.tags,softStrong:'wrong'}}))}}),/softStrong/);
});
test('CLI paths refuse skill destinations, occupied outputs, linked protected sources and missing assets atomically',()=>{
  const input=path('input.json'),output=path('output.json');writeFileSync(input,JSON.stringify(operator()));
  assert.throws(()=>run(['round1','--answers',input,'--output',resolve(dirname(LIBRARY),'refused.json')]),/inside this skill/);
  writeFileSync(output,'keep');assert.throws(()=>run(['round1','--answers',input,'--output',output]),/already exists/);assert.equal(readFileSync(output,'utf8'),'keep');
  const alias=path('skill-link');symlinkSync(resolve(dirname(LIBRARY),'..'),alias,'dir');
  assert.throws(()=>run(['round1','--answers',input,'--output',join(alias,'new.json')]),/inside this skill/);
  const a=operator();a.kept={markFile:'absent.svg'};writeFileSync(input,JSON.stringify(a));const before=readdirSync(work);assert.throws(()=>run(['round1','--answers',input,'--output',path('new.json')]));assert.deepEqual(readdirSync(work),before);
});
test('scoring either and zero is neutral; blue grounds share family across navy and cobalt',()=>{
  assert.equal(score({softStrong:'soft'},{softStrong:3}),-3);assert.equal(score({softStrong:'either'},{softStrong:3}),0);
  assert.equal(ground('#141B3D').family,ground('#2947C7').family);
});

test('each this-or-that dial moves a neutral seed toward the requested aggregate position',()=>{
  const a=operator(),base=select('round1',a).selection.boards.find(b=>b.palette.id==='stone-cobalt');
  for(const [axis,poles]of Object.entries(AXES).filter(([axis])=>['warmCool','quietBold','softStrong','classicContemporary'].includes(axis)))for(const step of [-1,1]) {
    const r=select('tune',{...a,picks:[base],steer:{[axis]:step}});
    assert.equal(r.positions[0].positions[axis],poles[step>0?1:0],`${axis}/${step}`);
  }
});
