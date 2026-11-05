import '../../../tools/lib/tests/isolated-home.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {select,paletteFamily} from '../scripts/select.mjs';
import {operator,firstStrategy,bakery,lawFirm} from './select-fixtures.mjs';
import {library,approvedPool,assertPool,assertPage,assertCoverage,assertCaps,assertFallback,canCompleteContrasts,expectedMode,depth,parsePaletteId,passingCards} from './m51c-checks.mjs';

const taps=JSON.parse(readFileSync(new URL('../parts/taps.json',import.meta.url)));
const tapSets={operator,firstStrategy,bakery,lawFirm};
for(const [name,fixture] of Object.entries(tapSets)) for(const mode of [undefined,...taps.questions.find(q=>q.id==='mode').options.map(o=>o.id)]) {
  test(`${name} ${mode??'own mode'}: checked first page and every retry keep approved cards until exhaustion`,()=>{
    const a=fixture();if(mode!==undefined) a.taps.mode=mode;
    const shown=[];let pages=0;
    for(;;) {
      let r;
      try {r=select('looks',{...a,shown},{check:true});}
      catch(error) {assert.match(error.message,/library exhausted/);break;}
      assertPage(r,a,shown);assert.ok(r.checks.attempts>=12);
      // Both accepted history shapes carry depth/style and recover the same cards.
      shown.push(...(pages%2?r.options:r.looks));pages++;
      assert.ok(pages<=24,'a finite 289-card library');
    }
    assert.ok(pages>=3,'first page and multiple retry pages');
  });
}
test('family derivation refuses bad ids and each library family has exactly one of each step',()=>{
  const families=new Map();
  for(const p of library.palettes) {
    const {family,step}=paletteFamily(p.id);
    if(!families.has(family)) families.set(family,[]);
    families.get(family).push(step);
  }
  assert.equal(families.size,10);
  for(const steps of families.values()) assert.deepEqual(steps,['muted','balanced','bold']);
  for(const bad of ['bad','family-medium','-muted',null,42]) assert.throws(()=>paletteFamily(bad),/must end/);
  const bad=structuredClone(library);bad.palettes[0].id='bad';
  assert.throws(()=>select('looks',tapSets.operator(),{library:bad}),/must end/);
});
test('approved pool fixes style graphics and containers and excludes either withheld mode',()=>{
  const pool=approvedPool();assertPool(pool);
  const source=readFileSync(new URL('../scripts/select.mjs',import.meta.url),'utf8');
  const begin=source.indexOf('function lookCandidates('),end=source.indexOf('\nfunction shownLook(',begin);
  // Observe the production pool before selection, including its refusal hook.
  const production=new Function('part','paletteFamily','info','cardDepth','makeBoard',`${source.slice(begin,end)};return lookCandidates;`)(
    (l,k,id)=>l[k].find(p=>p.id===id),paletteFamily,(_l,palette,pairing,graphicSet,_d,order)=>({palette,pairing,graphicSet,order,score:0}),
    (l,p,s,m)=>depth(p.id,s,m),(_l,_a,c)=>c);
  const actual=production(library,{dials:{},darkLed:0,brightColour:0},{},()=>null);
  assertPool(actual.map(c=>({palette:c.palette.id,style:c.style.id,graphicSet:c.graphicSet.id,container:c.container})));
  const dark=production(library,{dials:{},darkLed:1,brightColour:0},{},()=>null);
  assert.equal(dark.length,289);assert.ok(dark.every(c=>c.mode==='dark'));
  assert.equal(production(library,{dials:{},darkLed:0,brightColour:0},{},c=>c.style.id==='industrial'?'planted refusal':null).some(c=>c.style.id==='industrial'),false);
  for(const field of ['palette','style','graphicSet','container']) {
    const bad=structuredClone(pool);bad[0][field]='absent';assert.throws(()=>assertPool(bad));
  }
  for(const mode of ['light','dark']) {
    const changed=structuredClone(library),card=pool[0];changed.withheld.push({palette:card.palette,style:card.style,mode});
    assert.ok(!production(changed,{dials:{},darkLed:0,brightColour:0},{},()=>null).some(c=>c.palette.id===card.palette&&c.style.id===card.style));
  }
  const withheld=library.withheld[0],bad=structuredClone(pool),s=library.styles.find(s=>s.id===withheld.style);
  bad[0]={palette:withheld.palette,style:s.id,graphicSet:s.graphicSet,container:s.container};assert.throws(()=>assertPool(bad),/withheld/);
  const duplicate=structuredClone(pool);duplicate[1]=duplicate[0];assert.throws(()=>assertPool(duplicate),/duplicate/);
});
test('steer, off and kept page modes retain the same approved-board contract',()=>{
  for(const fixture of Object.values(tapSets)) {
    const a=fixture(),shown=select('looks',a).options;
    for(const extra of [{shown,steer:{warmCool:1,quietBold:-1}}, {shown,off:['darkLed']}, {shown,off:[a.taps.mode]}, {kept:{primaryMode:'light'}}, {kept:{primaryMode:'dark',pairing:'industrial',palette:{id:'business-blue-bold'},buttonRadius:12}}]) {
      const answers={...a,...extra},r=select('looks',answers,{check:true});assertPage(r,answers,extra.shown??[]);
    }
  }
});
test('planted page controls are rejected by the same checker used on every generated page',()=>{
  const a=tapSets.operator(),page=select('looks',a),reject=edit=>{const bad=structuredClone(page);edit(bad);assert.throws(()=>assertPage(bad,a));};
  reject(r=>r.looks.pop());
  reject(r=>r.looks[0].kind='contrast');
  reject(r=>r.options[1].board.primaryMode='light');
  reject(r=>r.looks[1].palette=r.looks[0].palette);
  reject(r=>r.looks[1].palette=r.looks[0].palette.replace(/-(muted|balanced|bold)$/,r.looks[0].palette.endsWith('-muted')?'-balanced':'-muted'));
  reject(r=>r.looks[1].style=r.looks[0].style);
  reject(r=>{for(const c of r.looks) if(['crisp-modern','editorial','inscriptional'].includes(c.style)) c.style='industrial';});
  reject(r=>{for(const c of r.looks) if(['elegant-serif','heritage-slab'].includes(c.style)) c.style='industrial';});
  reject(r=>r.looks[6].positions={...r.looks[0].positions});
  reject(r=>r.looks[6].changedDials=0);
  reject(r=>r.looks[6].changedDial='absent');
  reject(r=>r.looks[0].graphicSet='drawn');
  reject(r=>r.looks[0].container='drawn-ring');
  reject(r=>r.looks[0].value='look-wrong');
  for(const field of ['pairing','palette','graphicSet','container','depth','handwriting','buttonRadius']) reject(r=>{delete r.options[0].board[field];});
  reject(r=>r.options[0].board.graphicSet.pattern={strength:{light:0,dark:0}});
  reject(r=>r.options[0].board.depth.block={inset:'lighter'});
  reject(r=>r.options[0].board.depth.ink='headline');
  reject(r=>r.options[0].board.depth.extra=true);
  reject(r=>r.options[0].board.extra=true);
  reject(r=>r.looks[0].primaryMode='light');
  reject(r=>r.looks[0].plainGround=!r.looks[0].plainGround);
  const w=library.withheld[0];reject(r=>{r.looks[0].palette=w.palette;r.looks[0].style=w.style;});
  assert.throws(()=>assertPage(page,a,[page.options[0]]),/unshown/);
});


test('coverage controls isolate plain grounds and each of the five marks',()=>{
  const page=select('looks',tapSets.operator());assertCoverage(page.looks);
  const styles=['elegant-serif','friendly-rounded','crisp-modern','hand-made','editorial'];
  assertCoverage(styles.map(style=>({style})));
  for(const mark of ['seal','badge','letter','stack','initials']) {
    const bad=page.looks.map(c=>({...c,style:library.styles.find(s=>s.id===c.style).depth.mark===mark?'industrial':c.style}));
    // Letter's replacement must have a different mark.
    if(mark==='letter') for(const c of bad) if(c.style==='industrial') c.style='hand-made';
    assert.throws(()=>assertCoverage(bad),/all five marks/);
  }
  const bad=page.looks.map(c=>({...c,style:['crisp-modern','editorial','inscriptional'].includes(c.style)?'industrial':c.style}));
  assert.throws(()=>assertCoverage(bad),/two plain-ground/);
});
test('contrast ordering prefers unused dials, destinations and families before score order',()=>{
  const source=readFileSync(new URL('../scripts/select.mjs',import.meta.url),'utf8');
  const start=source.indexOf('function rankContrasts('),end=source.indexOf('\nfunction chooseLooks(',start);
  const rank=new Function(`${source.slice(start,end)};return rankContrasts;`)();
  const row=(id,axis,target,family)=>({palette:{id},changed:[axis],positions:{[axis]:target},family});
  const pool=[{...row('two-dial','playfulSerious','serious','new'),changed:['playfulSerious','handGeometric']},row('used-dial','warmCool','warm','new'),row('used-destination','softStrong','soft','new'),row('used-family','softStrong','strong','old'),row('fresh-first','softStrong','strong','new'),row('fresh-second','softStrong','strong','new')];
  const ranked=rank(pool,new Set(),new Set(['old']),new Set(['warmCool']),new Set(['softStrong/soft']));
  assert.deepEqual(ranked.map(c=>c.palette.id),['fresh-first','fresh-second','used-family','used-destination','used-dial','two-dial']);
  const assertRanking=rows=>assert.deepEqual(rows.map(c=>c.palette.id),ranked.map(c=>c.palette.id));
  for(const [i,j] of [[0,1],[1,2],[2,3],[3,4]]) {const bad=[...ranked];[bad[i],bad[j]]=[bad[j],bad[i]];assert.throws(()=>assertRanking(bad));}
});
test('board forms keep optional depth on each option even when all depths match',()=>{
  const a={...tapSets.operator(),looksShown:[]},base=select('round1',a).selection.boards[0];
  const picked={...base,depth:{band:'six'}};
  const r=select('variations',{...a,picks:[picked],shown:[picked]});
  assert.ok(r.form);assert.equal(Object.hasOwn(r.form.boardDefaults,'depth'),false);
  assert.ok(r.form.questions[0].options.every(o=>JSON.stringify(o.board.depth)===JSON.stringify(picked.depth)));
});


test('each new cap has a planted control independent of the other caps',()=>{
  const card=(family,step,style)=>({palette:`${family}-${step}`,style});
  const valid=[card('one','muted','A'),card('one','balanced','B'),card('two','muted','A'),card('two','balanced','C')];
  assertCaps(valid);
  assert.throws(()=>assertCaps([card('one','muted','A'),card('one','balanced','A')]),/unique family\/style/);
  assert.throws(()=>assertCaps([card('one','muted','A'),card('two','muted','A'),card('three','muted','A')]),/at most two per style/);
  assert.throws(()=>assertCaps([card('one','muted','A'),card('one','balanced','B'),card('one','bold','C')]),/at most two per family/);
});
test('member mode wins over Tesla, with kept, dropped and neutral branches in order',()=>{
  for(const fixture of [operator,firstStrategy]) {
    const cases=[
      ['light',[],{},'light'],['dark',[],{},'dark'],['mode-either',[],{},'dark'],
      ['mode-either',['darkLed'],{},'light'],['mode-either',['tesla'],{},'dark'],['mode-either',['tesla','restoration-hardware'],{},'light'],['mode-either',['mode-either'],{},'dark'],
      ['dark',['darkLed'],{},'light'],['light',['light'],{},'dark'],
      ['dark',['dark','tesla','restoration-hardware'],{},'light'],['dark',['dark'],{},'dark'],
      ['light',['darkLed'],{primaryMode:'dark'},'dark'],['dark',[],{primaryMode:'light'},'light']
    ];
    for(const [mode,off,kept,expected] of cases) {
      const a=fixture();Object.assign(a,{off,kept});a.taps.mode=mode;
      assert.equal(expectedMode(a),expected);
      const r=select('looks',a,{check:true});assertPage(r,a);
      assert.ok(r.options.every(o=>o.board.primaryMode===expected),`${mode} off=${off} kept=${JSON.stringify(kept)}`);
    }
  }
});
test('current-slot two-dial control fails when a one-dial completion from the chosen prefix is available',()=>{
  const a=tapSets.operator(),r=select('looks',a),bad=structuredClone(r);
  // Pretend this slot used two dials. Keeping every earlier choice, the oracle
  // must find the genuine one-dial completion and reject this slot's claim.
  const index=bad.looks.findIndex(c=>c.kind==='contrast'&&c.changedDials===1);
  assert.ok(index>=6);bad.looks[index].changedDials=2;
  assert.throws(()=>assertFallback(bad,a),/one-dial completion available/);
});


test('independent family parsing catches a planted wrong parse in the selector helper',()=>{
  const check=parse=>{
    for(const p of library.palettes) assert.deepEqual(parse(p.id),parsePaletteId(p.id),'independent family and step');
  };
  check(paletteFamily);
  const source=readFileSync(new URL('../scripts/select.mjs',import.meta.url),'utf8');
  const start=source.indexOf('export function paletteFamily('),end=source.indexOf('\nfunction cardDepth(',start);
  assert.ok(start>=0&&end>start);
  const implementation=source.slice(start,end).replace('export ','');
  const planted=implementation.replace('family:match[1]','family:id');
  assert.notEqual(planted,implementation,'control changes the production parse');
  const wrong=new Function('fail',`${planted};return paletteFamily;`)((_at,message)=>{throw Error(message);});
  assert.throws(()=>check(wrong),/independent family and step/);
});

test('fallback pool uses full board validation only for checked runs, with separate cached pools',()=>{
  const a=tapSets.operator(),r=select('looks',a),l=structuredClone(library),chosen=r.looks[0];
  // This palette still passes selector policy but fails full contrast validation.
  const palette=l.palettes.find(p=>p.id===chosen.palette);
  palette.light.onPop=palette.light.pop;palette.dark.onPop=palette.dark.pop;
  const card=c=>c.palette===chosen.palette&&c.style===chosen.style;
  assert.equal(passingCards({...r,checks:{enabled:true}},a,l).some(card),false,'checked run refuses the card');
  assert.equal(passingCards(r,a,l).some(card),true,'unchecked run keeps the policy-passing card');
  assert.equal(passingCards({...r,checks:{enabled:true}},a,l).some(card),false,'unchecked cache cannot widen a checked pool');
});

test('whole-look data carries the same rule as its documented contract',()=>{
  const contract=readFileSync(new URL('../parts/parts.md',import.meta.url),'utf8');
  const prefix='`wholeLooks.rule` contains the whole-look rule: ';
  const paragraph=contract.split('\n').find(line=>line.startsWith(prefix));
  assert.ok(paragraph);
  assert.equal(taps.wholeLooks.rule,paragraph.slice(prefix.length));
});
