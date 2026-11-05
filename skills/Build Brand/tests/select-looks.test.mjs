import '../../../tools/lib/tests/isolated-home.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {select,tapDials,run} from '../scripts/select.mjs';
import {boardRefusal} from '../scripts/refusals.mjs';
import {LIBRARY,AXES} from '../scripts/assemble.mjs';
import {checkForm} from '../../../tools/Form/scripts/format.js';
import {paletteFamily} from '../scripts/select.mjs';
import {assertPage as assertApprovedPage,assertCaps} from './m51c-checks.mjs';
import {operator,firstStrategy,lookActions} from './select-fixtures.mjs';

const library=JSON.parse(readFileSync(LIBRARY));
const data=JSON.parse(readFileSync(new URL('../parts/taps.json',import.meta.url)));
const hash=value=>createHash('sha256').update(value).digest('hex');
const identity=c=>`${c.pairing}/${c.palette}/${c.graphicSet}`;
// Pins cover approved palette/style cards, page mode, depth and pagination.
// Both normal and kept-asset pages pin the full JSON, including spares,
// checked refusals/replacements and abandoned-check attempt counts.
// Every pin also asserts the page shape, refusals, history and Form contract.
const fixtures=[
  ["operator",operator,["fe1ff7fb65fb49b3fa7fe9e4b21a83115a4b52d363348168aba816508f631089", "e53131559b86fb2e78f503a45a244e11ab35fd2a382d5edca73704f0567a8d10"],["9d1db47cfda0185a84e851328fa25e8e4a41a1b4a8c6e3fe78500b03a104a600", "9265789240f28e433167e3e8133c9440014e95965daf7686e5e1c5312b128983"]],
  ["First Strategy",firstStrategy,["ef7783413689c672fc9a3928dde19ea353572712b662201addfe0e56e581dd06", "b155e44ab8810963b730866deb0531d5ac3aaf5922c2fded19f64867ea302425"],["36d8cae01eef3ab2c0a70032df97d19721b468060d9f30d7957a03cd34d65dcd", "fa311d239364930a519893581738a0612289776b0c88ea1b895e0e6acfbb439e"]]
];

function assertPage(r,a,history=[]) {
  assert.equal(r.looks.length,12);assert.equal(r.options.length,12);
  assert.deepEqual(r.controls,{mode:r.selection.boards[0].primaryMode,...(a.kept?.palette?{}:{strength:true})});
  if(a.kept?.palette)assert.ok(r.options.every(o=>o.steps.length===1&&o.steps[0].value===o.value));
  assert.deepEqual(r.looks.map(l=>l.kind),[...Array(6).fill('top'),...Array(6).fill('contrast')]);
  const seen=new Set(history.map(l=>l.value)),parts=new Set(history.map(identity));
  for(const look of r.looks) {
    assert.ok(!seen.has(look.value),'look value already shown');seen.add(look.value);
    assert.ok(!parts.has(identity(look)),'three library ids already shown');parts.add(identity(look));
    assert.equal(look.value,'look-'+hash(identity(look)).slice(0,32));
  }
  assert.equal(new Set(r.looks.map(l=>l.palette)).size,12);
  assertCaps(r.looks);
  assert.equal(new Set(r.looks.slice(0,6).map(l=>l.style)).size,6);
  assert.equal(new Set(r.looks.slice(0,6).map(l=>paletteFamily(l.palette).family)).size,6);
  for(const l of r.looks.slice(6)) {
    const changed=Object.keys(AXES).filter(axis=>l.positions[axis]!==r.looks[0].positions[axis]);
    assert.ok(changed.length===1||changed.length===2);
    assert.equal(l.changedDial,changed[0]);assert.equal(l.changedDials,changed.length);
  }
  const plain=r.selection.boards.flatMap((b,i)=>b.depth.background==='plain'?[i+1]:[]);
  assert.ok(plain.length>=2);assert.equal(new Set(r.selection.boards.map(b=>b.depth.mark)).size,5);
  assert.deepEqual(r.looks.flatMap((l,i)=>l.plainGround?[i+1]:[]),plain);
  for(const [i,b] of r.selection.boards.entries()) {
    assert.equal(b.graphicSet.id,r.looks[i].graphicSet);
    assert.deepEqual(r.options[i].board.graphicSet,b.graphicSet);
  }
  for(const b of r.selection.boards) assert.equal(boardRefusal(library,b),null);
  if(r.checks.enabled) {
    const before=JSON.stringify(r.options);
    const form={title:'Step 3: how it should look',brand:{name:a.name,initials:r.selection.boards[0].initials,sentence:a.sentence,body:a.body,words:a.words},questions:[{id:'looks',type:'boards',view:'look',label:'Which of these feel like you? Pick up to three.',pick:3,min:2,options:r.options}],actions:lookActions()};
    assert.deepEqual(checkForm(form),{ok:true,problems:[]});
    assert.equal(JSON.stringify(r.options),before);
  }
}

function assertFirstPage(a,expected) {
  const steer={warmCool:1,quietBold:-1,softStrong:1,classicContemporary:-1};
  for(const check of [false,true]) {
    const page=select('looks',a,{check});assertPage(page,a);
    const first=JSON.stringify(page);
    assert.equal(hash(first),expected[Number(check)]);
    for(const history of [{},{shown:[]}]) for(const direction of [{},{steer:{}},{steer}]) {
      assert.equal(JSON.stringify(select('looks',{...a,...history,...direction},{check})),first,
        `check=${check}, history=${JSON.stringify(history)}, direction=${JSON.stringify(direction)}`);
    }
  }
}
for(const [label,fixture,expected,keptExpected] of fixtures) {
  test(`${label}: first looks page stays byte-identical with absent or empty history, checked and unchecked`,()=>{
    assertFirstPage(fixture(),expected);
  });
  test(`${label}: kept pairing and palette retain first-page bytes with any steer and no history`,()=>{
    assertFirstPage({...fixture(),kept:{pairing:'industrial',palette:{id:'business-blue-bold'}}},keptExpected);
  });
  test(`${label}: a single duplicate history look leaves the entire next page unchanged`,()=>{
    const a=fixture(),one=select('looks',a),expected=JSON.stringify(select('looks',{...a,shown:one.looks}));
    // Repeat just one item, rather than scaling every part's use count equally.
    for(const [i,look] of one.looks.entries()) for(const duplicate of [look,one.options[i]]) {
      assert.equal(JSON.stringify(select('looks',{...a,shown:[...one.looks,duplicate]})),expected,`duplicate look ${i+1}`);
    }
  });
  test(`${label}: three checked looks pages exclude all history, keep the page shape and pass Form unchanged`,()=>{
    const a=fixture(),one=select('looks',a,{check:true});assertPage(one,a);
    const input={...a,shown:one.looks},before=structuredClone(input);
    const two=select('looks',input,{check:true});assert.deepEqual(input,before);assertPage(two,a,one.looks);
    const three=select('looks',{...a,shown:[...one.options,...two.looks]},{check:true});assertPage(three,a,[...one.looks,...two.looks]);
    for(const r of [two,three]) {
      assert.ok(r.checks.attempts>=12);
      assert.ok(r.replacements.every(refusal=>refusal.reason&&refusal.replacement));
      const boosted=select('round1',{...a,looks:r.looks.slice(0,2).map(l=>l.value),looksShown:[...one.looks,...two.looks,...three.looks]});
      for(const [axis,[neg,pos]] of Object.entries(AXES)) assert.equal(boosted.wholeLookBoosts[axis],r.looks.slice(0,2).reduce((n,l)=>n+(l.positions[axis]===pos?1:l.positions[axis]===neg?-1:0),0));
    }
  });
  test(`${label}: each this-or-that steer moves the second-page ranking and adds the same three ticks as variations`,()=>{
    const a=fixture(),shown=select('looks',a).looks;
    for(const axis of ['warmCool','quietBold','softStrong','classicContemporary']) {
      const pages=[-1,1].map(step=>select('looks',{...a,shown,steer:{[axis]:step}},{check:true}));
      assert.notDeepEqual(pages[0].looks.map(l=>l.value),pages[1].looks.map(l=>l.value),axis);
      // Fixed approved combinations and freshness can reverse a count of
      // aggregate leader poles. Each card still gets the exact steered score
      // of its three parts, the quantity the selector actually ranks.
      for(const r of pages) for(const l of r.looks) {
        const expected=Object.values(l.partPositions).reduce((sum,tags)=>sum+Object.entries(AXES).reduce((n,[k,[negative,positive]])=>n+(tags[k]===positive?r.dials[k]:tags[k]===negative?-r.dials[k]:0),0),0)+(library.palettes.find(p=>p.id===l.palette).energy==='bright'?r.brightColour:0);
        assert.equal(l.score,expected,axis);
      }
      for(const [i,r] of pages.entries()) {
        assert.equal(r.dials[axis],tapDials(a,data).dials[axis]+(i?3:-3));
        assertPage(r,a,shown);
      }
    }
  });
  test(`${label}: fresh looks respect off options, poles, dials and promotions before explicit steer`,()=>{
    const a=fixture(),shown=select('looks',a).options;
    const off=[a.taps.feel,'warm','quietBold','darkLed'],steer={quietBold:1,softStrong:-1};
    const r=select('looks',{...a,shown,off,steer}),state=tapDials({...a,off},data);
    const expected={...state.dials,quietBold:3,softStrong:state.dials.softStrong-3};
    assert.deepEqual(r.dials,expected);assert.equal(r.darkLed,0);
    assert.equal(r.brightColour,state.brightColour);assert.deepEqual(r.ignoredNudges,state.ignored);
    const unchanged=select('looks',{...a,shown,steer});assert.notDeepEqual(r.looks,unchanged.looks);
  });
}

test('fresh looks prefer previously unseen families, palettes and styles',()=>{
  const a=operator(),shown=select('looks',a).looks.slice(0,1);
  const fresh=select('looks',{...a,shown});
  for(const field of ['style','palette']) assert.notEqual(fresh.looks[0][field],shown[0][field]);
  assert.notEqual(paletteFamily(fresh.looks[0].palette).family,paletteFamily(shown[0].palette).family);
});
test('history options and records exclude the same identities, including a prior plain-ground look',()=>{
  const a=operator(),first=select('looks',a),one=select('looks',{...a,shown:first.looks}),two=select('looks',{...a,shown:first.options});
  assert.equal(JSON.stringify(one),JSON.stringify(two));
  const repeated=select('looks',{...a,shown:[...first.looks,...first.options]});
  assert.deepEqual(repeated.looks.map(l=>l.value),one.looks.map(l=>l.value));
  const kept={...a,kept:{pairing:'industrial',palette:{id:'business-blue-bold'}}},fixed=select('looks',kept);
  assert.equal(JSON.stringify(select('looks',{...kept,shown:fixed.looks})),JSON.stringify(select('looks',{...kept,shown:fixed.options})));
});
test('later pages keep six contrasts available when another first look is needed',()=>{
  const a=operator(),shown=[];
  let pages=0;
  for(;;) {
    let r;try {r=select('looks',{...a,shown});} catch(error) {assert.match(error.message,/library exhausted/);break;}
    assertPage(r,a,shown);shown.push(...r.looks);assert.ok(++pages<=24);
  }
  assert.ok(pages>=3);
});
test('page 2 checks refuse a style with an unreadable pattern without changing its approved ground',()=>{
  const a={...operator(),taps:{...operator().taps,feel:'suit-and-tie',mood:'2modern'}},patterned=structuredClone(library),drawn=patterned.graphics.find(g=>g.id==='drawn');
  drawn.pattern={...drawn.pattern,
    svg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 5H10" stroke="{{text}}"/></svg>',
    strength:{light:1,dark:1}};
  const one=select('looks',a,{library:patterned,check:true});
  const two=select('looks',{...a,shown:one.looks},{library:patterned,check:true});
  assertPage(two,a,one.looks);assertApprovedPage(two,a,one.looks,patterned);
  assert.ok(two.replacements.length>0);
  assert.ok(two.checks.attempts>=12+two.replacements.length);
  const shown=new Set(one.looks.map(identity));
  for(const r of two.replacements) {
    assert.ok(r.reason);
    assert.equal(r.group,'looks');
    assert.ok(!shown.has(identity(r.refused)));
    assert.ok(!shown.has(identity(r.replacement)));
    for(const [field,value] of Object.entries(r.replacement)) assert.deepEqual(two.looks[r.slot-1][field],value);
  }
  // A fixed style cannot be rescued by erasing its pattern in another slot.
  assert.ok(two.looks.every(l=>l.graphicSet!=='drawn'));
  assert.ok(two.selection.boards.every(b=>!b.graphicSet.pattern));
});

function allLooks() {
  const result=[];
  for(const s of library.styles) for(const c of library.palettes) {
    if(library.withheld.some(w=>w.style===s.id&&w.palette===c.id)) continue;
    if(boardRefusal(library,{pairing:{id:s.id},palette:{id:c.id}})) continue;
    const look={style:s.id,pairing:s.id,palette:c.id,graphicSet:s.graphicSet};
    result.push({...look,value:'look-'+hash(identity(look)).slice(0,32)});
  }
  return result;
}
test('exhaustion plainly names the library and remaining unshown count rather than returning repeats',()=>{
  const a=operator(),all=allLooks();
  assert.throws(()=>select('looks',{...a,shown:all}),/looks: library exhausted: only 0 unshown looks remain; twelve are required/);
  assert.throws(()=>select('looks',{...a,shown:all.slice(11)}),/library exhausted: only 11 unshown looks remain/);
  const remaining=new Set([...new Set(all.map(l=>l.palette))].slice(0,11));
  assert.equal(remaining.size,11);
  assert.throws(()=>select('looks',{...a,shown:all.filter(l=>!remaining.has(l.palette))}),/library exhausted.*11 unshown palette recipes.*twelve distinct palettes/);
  // Many unshown approved cards remain, but one graphic supplies too few
  // styles for six distinct leaders. This also exercises constraint exhaustion.
  assert.throws(()=>select('looks',{...a,shown:all.filter(l=>l.graphicSet!==library.graphics[0].id)}),/library exhausted.*six passing distinct leaders and six one- or two-dial contrasts/);
});
test('checked exhaustion accounts for fixed plain-ground styles whose depth cannot pass',()=>{
  const limited=structuredClone(library);
  limited.styles=limited.styles.slice(0,6).map(s=>({...s,depth:{...s.depth,...(['C','E'].includes(s.column)?{background:null}:{})}}));
  assert.equal(limited.palettes.length,30,'fixture retains all permitted palette recipes before check exhaustion');
  const s=limited.styles[0],look={style:s.id,pairing:s.id,palette:limited.palettes[0].id,graphicSet:s.graphicSet};
  const shown=[{...look,value:'look-'+hash(identity(look)).slice(0,32)}];
  // Two of the six available styles fail the shared depth check. Search must
  // never invent plain slots or return a page with fewer than six styles.
  assert.throws(()=>select('looks',{...operator(),shown},{library:limited,check:true}),/library exhausted.*six passing distinct leaders/);
});
test('looks history rejects malformed references, mismatched values and fields belonging to variations',()=>{
  const a=operator(),first=select('looks',a),look=first.looks[0],option=first.options[0];
  for(const shown of [null,{},[null],[{...look,pairing:'absent'}],[{...look,value:'look-wrong'}],[{...option,board:null}],[{...option,board:{...option.board,graphicSet:{id:'absent'}}}],[{...option,typo:true}]]) assert.throws(()=>select('looks',{...a,shown}));
  assert.throws(()=>select('looks',{...a,shown:first.looks,picks:[]}),/picks/);
  assert.throws(()=>select('looks',{...a,shown:first.looks,steer:{quietBold:2}}),/quietBold/);
  assert.throws(()=>select('looks',{...a,shown:first.looks,comment:'warmer'}),/comment/);
  assert.throws(()=>select('round1',{...a,shown:first.looks}),/shown/);
  assert.throws(()=>select('looks',{...a,off:['apple']}),/unselected/);
});
test('looks help documents optional history, records/options and a fresh twelve-look page',()=>{
  const help=run(['looks','--help']);
  for(const text of ['looks answers: optional shown','looks records or Form options','twelve unshown looks','steer and off']) assert.ok(help.includes(text),text);
});
