import '../../../tools/lib/tests/isolated-home.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {select,tapDials,run} from '../scripts/select.mjs';
import {LIBRARY,AXES} from '../scripts/assemble.mjs';
import {checkForm} from '../../../tools/Form/scripts/format.js';
import {operator,firstStrategy} from './select-fixtures.mjs';

const library=JSON.parse(readFileSync(LIBRARY));
const data=JSON.parse(readFileSync(new URL('../parts/taps.json',import.meta.url)));
const hash=value=>createHash('sha256').update(value).digest('hex');
const identity=c=>`${c.pairing}/${c.palette}/${c.graphicSet}`;
// Original hashes predate pagination; kept-asset hashes predate the steer fix.
// Both cover full JSON, including spares and checked refusals/replacements.
const fixtures=[
  ['operator',operator,['93197fc7b74344e09018236ae728cb104f662e650a3b88ea73d636cff41ef237','709376501cec216be8a949be7e4634bb4df60dfeddafcccd5b59e310d437dc03'],
    ['10a10abb60c227c5e52f920c9deffe59f5e5a6dc08e705a0026f61854fc5fa6d','1df9d791d532b01adc7f4f2197b6e268f418f21ce178b29e42a6ea056d8addf9']],
  ['First Strategy',firstStrategy,['97651205c79f7da23b957117293281b903a6af43a4b3ee1f134e569db0fe06a6','599bf8758711b52245f3b4142dbf969ed62f93d5ca98935d750372a0fb3b6d93'],
    ['cf965863d4e039053ff84ce94eda18a9e7efe9e5e37471c0f5688ddb6af2d4dc','7f6da8a95e96f56014919d318d5b143153b3ed06b5b11fd156a3355a4734d703']]
];
function assertPage(r,a,history=[]) {
  assert.equal(r.looks.length,12);assert.equal(r.options.length,12);
  assert.deepEqual(r.looks.map(l=>l.kind),[...Array(6).fill('top'),...Array(6).fill('contrast')]);
  const seen=new Set(history.map(l=>l.value)),parts=new Set(history.map(identity));
  for(const look of r.looks) {
    assert.ok(!seen.has(look.value),'look value already shown');seen.add(look.value);
    assert.ok(!parts.has(identity(look)),'three library ids already shown');parts.add(identity(look));
    assert.equal(look.value,'look-'+hash(identity(look)).slice(0,32));
  }
  assert.equal(new Set(r.looks.map(l=>l.palette)).size,12);
  for(const field of ['pairing','graphicSet']) assert.equal(new Set(r.looks.slice(0,6).map(l=>l[field])).size,6);
  for(const l of r.looks.slice(6)) {
    const changed=Object.keys(AXES).filter(axis=>l.positions[axis]!==r.looks[0].positions[axis]);
    assert.deepEqual(changed,[l.changedDial]);
  }
  const plain=r.selection.boards.flatMap((b,i)=>b.graphicSet.pattern?.strength.light===0&&b.graphicSet.pattern?.strength.dark===0?[i+1]:[]);
  assert.deepEqual(plain,[2,5,8,11]);
  assert.deepEqual(r.looks.flatMap((l,i)=>l.plainGround?[i+1]:[]),plain);
  for(const [i,b] of r.selection.boards.entries()) {
    assert.equal(b.graphicSet.id,r.looks[i].graphicSet);
    assert.deepEqual(r.options[i].board.graphicSet,b.graphicSet);
  }
  if(r.checks.enabled) {
    const before=JSON.stringify(r.options);
    const form={title:'Step 3: how it should look',brand:{name:a.name,initials:r.selection.boards[0].initials,sentence:a.sentence,body:a.body,words:a.words},questions:[{id:'looks',type:'boards',view:'look',label:'Which of these feel like you? Pick two or three.',pick:3,min:2,options:r.options}]};
    assert.deepEqual(checkForm(form),{ok:true,problems:[]});
    assert.equal(JSON.stringify(r.options),before);
  }
}

function assertFirstPage(a,expected) {
  const steer={warmCool:1,quietBold:-1,softStrong:1,classicContemporary:-1};
  for(const check of [false,true]) {
    const first=JSON.stringify(select('looks',a,{check}));
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
    assertFirstPage({...fixture(),kept:{pairing:'condensed',palette:{id:'navy-gold'}}},keptExpected);
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
      const boosted=select('round1',{...a,looks:r.looks.slice(0,2).map(l=>l.value)});
      for(const [axis,[neg,pos]] of Object.entries(AXES)) assert.equal(boosted.wholeLookBoosts[axis],r.looks.slice(0,2).reduce((n,l)=>n+(l.positions[axis]===pos?1:l.positions[axis]===neg?-1:0),0));
    }
  });
  test(`${label}: each this-or-that steer moves the second-page ranking and adds the same three ticks as variations`,()=>{
    const a=fixture(),shown=select('looks',a).looks;
    for(const axis of ['warmCool','quietBold','softStrong','classicContemporary']) {
      const pages=[-1,1].map(step=>select('looks',{...a,shown,steer:{[axis]:step}},{check:true}));
      assert.notDeepEqual(pages[0].looks.map(l=>l.value),pages[1].looks.map(l=>l.value),axis);
      const alignment=r=>r.looks.slice(0,6).reduce((n,l)=>n+(l.positions[axis]===AXES[axis][1]?1:l.positions[axis]===AXES[axis][0]?-1:0),0);
      assert.ok(alignment(pages[0])<=alignment(pages[1]),axis);
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

test('fresh looks prefer previously unseen palettes, pairings and graphics',()=>{
  const a=operator(),shown=select('looks',a).looks.slice(0,1);
  const fresh=select('looks',{...a,shown});
  for(const field of ['pairing','palette','graphicSet']) assert.notEqual(fresh.looks[0][field],shown[0][field]);
});
test('history options and records exclude the same identities, including a prior plain-ground look',()=>{
  const a=operator(),first=select('looks',a),one=select('looks',{...a,shown:first.looks}),two=select('looks',{...a,shown:first.options});
  assert.equal(JSON.stringify(one),JSON.stringify(two));
  const repeated=select('looks',{...a,shown:[...first.looks,...first.options]});
  assert.deepEqual(repeated.looks.map(l=>l.value),one.looks.map(l=>l.value));
  const kept={...a,kept:{pairing:'condensed',palette:{id:'navy-gold'}}},fixed=select('looks',kept);
  assert.equal(JSON.stringify(select('looks',{...kept,shown:fixed.looks})),JSON.stringify(select('looks',{...kept,shown:fixed.options})));
});
test('later pages keep six contrasts available when another first look is needed',()=>{
  const a=operator(),shown=[];
  for(let page=0;page<21;page++) {const r=select('looks',{...a,shown});assertPage(r,a,shown);shown.push(...r.looks);}
});
test('page 2 checks report only winning-prefix refusals and their exact replacements, including a pattern-only refusal',()=>{
  const a=operator(),patterned=structuredClone(library),drawn=patterned.graphics.find(g=>g.id==='drawn');
  drawn.pattern={...drawn.pattern,
    svg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 5H10" stroke="{{text}}"/></svg>',
    strength:{light:1,dark:1}};
  const one=select('looks',a,{library:patterned,check:true});
  const two=select('looks',{...a,shown:one.looks},{library:patterned,check:true});
  assertPage(two,a,one.looks);
  // These refusals occurred under the winning prefix. Earlier prefixes hit
  // another 43 refusals before backtracking; none belongs in this report.
  assert.deepEqual(two.replacements.map(r=>[r.slot,identity(r.refused),identity(r.replacement)]),[
    ...['newspaper','warm-grotesque','display-serif','soft-serif','humanist'].map(pairing=>
      [6,`${pairing}/forest-coral/editorial`,'newspaper/plum-peach/geometric']),
    [9,'humanist/stone-cobalt/stitch','friendly-serif/stone-cobalt/drafting'],
    [9,'friendly-serif/stone-cobalt/stamp','friendly-serif/stone-cobalt/drafting']
  ]);
  assert.ok(two.checks.attempts>12+two.replacements.length,'fixture must explore abandoned prefixes');
  const shown=new Set(one.looks.map(identity));
  for(const r of two.replacements) {
    assert.ok(r.reason);
    assert.equal(r.group,'looks');
    assert.ok(!shown.has(identity(r.refused)));
    assert.ok(!shown.has(identity(r.replacement)));
    for(const [field,value] of Object.entries(r.replacement)) assert.deepEqual(two.looks[r.slot-1][field],value);
  }
  // The graphic that fails with its pattern is still legal in a plain slot.
  // Do not treat a pattern failure as exhaustion of that graphic in every slot.
  assert.equal(two.looks[4].graphicSet,'drawn');assert.equal(two.looks[4].plainGround,true);
});

function allLooks() {
  const result=[];
  for(const p of library.pairings) for(const c of library.palettes) for(const g of library.graphics) {
    if(Math.abs(p.tags.typeLoudness-c.paletteLoudness)>1||(c.paletteLoudness===3&&(p.tags.typeCut!=='contemporary'||p.tags.typeLoudness<2))) continue;
    const look={pairing:p.id,palette:c.id,graphicSet:g.id};
    result.push({...look,value:'look-'+hash(identity(look)).slice(0,32)});
  }
  return result;
}
test('exhaustion plainly names the library and remaining unshown count rather than returning repeats',()=>{
  const a=operator(),all=allLooks();
  assert.throws(()=>select('looks',{...a,shown:all}),/looks: library exhausted: only 0 unshown looks remain; twelve are required/);
  assert.throws(()=>select('looks',{...a,shown:all.slice(11)}),/library exhausted: only 11 unshown looks remain/);
  const remaining=new Set(library.palettes.slice(0,11).map(p=>p.id));
  assert.throws(()=>select('looks',{...a,shown:all.filter(l=>!remaining.has(l.palette))}),/library exhausted.*11 unshown palette recipes.*twelve distinct palettes/);
  // Many unshown triples and palettes remain, but one graphic cannot supply
  // the six distinct leaders. This exercises constraint exhaustion as well.
  assert.throws(()=>select('looks',{...a,shown:all.filter(l=>l.graphicSet!==library.graphics[0].id)}),/library exhausted.*six passing distinct leaders and six one-dial contrasts/);
});
test('checked exhaustion accounts for leaders that can only pass in plain-ground slots',()=>{
  const tags=Object.fromEntries(Object.keys(AXES).map(axis=>[axis,'either']));
  const limited={...library,
    pairings:library.pairings.slice(0,6).map(p=>({...p,tags:{...p.tags,...tags,typeLoudness:2,typeCut:'contemporary'}})),
    palettes:library.palettes.slice(0,12).map((p,i)=>({...p,tags:{...p.tags,...tags,softStrong:i<6?'soft':'strong'}})),
    graphics:library.graphics.slice(0,6).map((g,i)=>({...g,tags:{...g.tags,...tags},pattern:{...g.pattern,
      svg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 5H10" stroke="{{text}}"/></svg>',
      strength:{light:i<3?1:0,dark:i<3?1:0}}}))
  };
  const look={pairing:limited.pairings[0].id,palette:limited.palettes[0].id,graphicSet:limited.graphics[0].id};
  const shown=[{...look,value:'look-'+hash(identity(look)).slice(0,32)}];
  // Three required graphic sets cannot put text over their full-strength
  // text-coloured patterns; six distinct leaders have only two plain slots.
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
