import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AXES,LIBRARY} from '../scripts/assemble.mjs';

const library=JSON.parse(readFileSync(LIBRARY));
const source=readFileSync(new URL('../scripts/select.mjs',import.meta.url),'utf8');
const slice=(start,end)=>{
  const first=source.indexOf(start),last=source.indexOf(end,first);
  assert.ok(first>=0&&last>first,'production selection boundaries');
  return source.slice(first,last);
};
// Run the production algorithms and looks branch with a test-local accept.
// This exercises checked failures without changing the public selection API.
function harness() {
  return new Function('AXES',`
    ${slice('function fail(', '\nfunction object(')}
    const key=c=>[c.pairing.id,c.palette.id,c.graphicSet.id].join('/');
    const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
    const effective=c=>c;
    ${slice('function summary(c)', '\nfunction alignedWhy(')}
    ${slice("const LOOK_MARKS=", '\nfunction page(')}
    const greedy=chooseLooks,search=chooseFreshLooks,calls=[];
    chooseLooks=(...args)=>{calls.push(args[1]?'checked greedy':'unchecked greedy');return greedy(...args);};
    chooseFreshLooks=(...args)=>{calls.push('search');return search(...args);};
    return {greedy,summary,calls,page(pool,acceptLook,replacements=[]) {
      const a={},library={},chosen=[],spares=[];let groups,feasibilitySearch;
      const accept=(c,group,slot)=>acceptLook(c,slot);
      ${slice("      groups=[{id:'looks',label:'Whole looks'}];", '    } else if(roundPage)')}
      return {chosen,spares,replacements};
    }};
  `)(AXES);
}
function fixture() {
  const positions=Object.fromEntries(Object.entries(AXES).map(([axis,poles])=>[axis,poles[0]]));
  // Fictional palette families isolate feasibility from the real pool.
  const candidate=(palette,pairing=0,_graphic=0,changes={})=>({
    palette:{...library.palettes[palette],id:`fixture-${palette}-balanced`},pairing:library.pairings[pairing],graphicSet:library.graphics.find(g=>g.id===library.styles[pairing].graphicSet),
    style:library.styles[pairing],family:`fixture-${palette}`,depth:library.styles[pairing].depth,plain:library.styles[pairing].depth.background==='plain',
    positions:{...positions,...changes},partPositions:{},score:100-palette,order:palette
  });
  const refused=candidate(0),decoy=candidate(1,0,0,Object.fromEntries(
    ['warmCool','quietBold','softStrong','classicContemporary'].map(axis=>[axis,AXES[axis][1]]))),
    secondRefused=candidate(2),winner=candidate(3);
  const pool=[refused,decoy,secondRefused,winner,
    ...Array.from({length:5},(_,i)=>candidate(i+4,i+1,i+1)),
    ...Array.from({length:6},(_,i)=>candidate(i+9,i+4,0,{warmCool:AXES.warmCool[1]}))];
  return {pool,refused,decoy,secondRefused,winner};
}
function checks(h,rejected,replacements) {
  return (c,slot)=>{
    if(!rejected.has(c.palette.id)) return true;
    replacements.push({slot,group:'looks',refused:h.summary(c),reason:'Fixture check refused this palette',replacement:null});
    return false;
  };
}
test('a checked greedy dead end searches again and names replacements from the winning page',()=>{
  const h=harness(),f=fixture(),rejected=new Set([f.refused.palette.id,f.secondRefused.palette.id]);
  // Unchecked greedy accepts the first leader and completes twelve slots.
  // Checking refuses it, so greedy takes the decoy, whose four changed dials
  // leave no one- or two-dial contrasts. Search skips that prefix and takes winner.
  assert.equal(h.greedy(f.pool).chosen.length,12);
  assert.throws(()=>h.greedy(f.pool,checks(h,rejected,[])),{message:'looks: no passing one- or two-dial contrast remains. Correct the answers; see select.mjs help.'});
  const replacements=[],result=h.page(f.pool,checks(h,rejected,replacements),replacements);
  assert.deepEqual(h.calls,['checked greedy','search']);
  assert.equal(result.chosen.length,12);
  assert.equal(result.chosen[0].palette.id,f.winner.palette.id);
  assert.deepEqual(result.replacements.map(r=>r.refused.palette),[f.refused.palette.id,f.secondRefused.palette.id]);
  for(const r of result.replacements) {
    assert.equal(r.slot,1);
    assert.deepEqual(r.replacement,h.summary(result.chosen[r.slot-1]));
    assert.notEqual(r.replacement.palette,f.decoy.palette.id);
  }
  // A higher-ranked leader can consume the only family of another style.
  // The checked greedy pass exhausts leaders; search must try the next one.
  const leaders=harness(),leaderReplacements=[];
  const familyTrap=f.pool.map((c,i)=>{
    if(c===f.decoy) return {...c,palette:{...c.palette,id:'fixture-5-bold'},family:'fixture-5'};
    if(i<9) return c;
    // Three disjoint two-style/two-family components support a full spread.
    // The decoy crosses components and consumes a family another pair needs.
    const style=library.styles[(i-9)^1],family=`fixture-${i-6}`;
    return {...c,palette:{...c.palette,id:family+'-muted'},family,style,depth:style.depth,plain:style.depth.background==='plain'};
  });
  assert.throws(()=>leaders.greedy(familyTrap,checks(leaders,rejected,[])),/no passing distinct leader remains/);
  const recoveredLeaders=leaders.page(familyTrap,checks(leaders,rejected,leaderReplacements),leaderReplacements);
  assert.deepEqual(leaders.calls,['checked greedy','search']);
  assert.equal(recoveredLeaders.chosen[0].palette.id,f.winner.palette.id);
  for(const r of recoveredLeaders.replacements) assert.deepEqual(r.replacement,leaders.summary(recoveredLeaders.chosen[r.slot-1]));
  // A greedy page missing a required mark must also fall back. Its style
  // fixes the ground, so search must select a different approved card.
  const coverage=harness(),extra={...f.pool[8],palette:{...library.palettes[20],id:'fixture-20-balanced'},family:'fixture-20',style:library.styles[4],depth:library.styles[4].depth,plain:true};
  const withoutInitials=f.pool.map((c,i)=>{
    const replacement=c.style.id===library.styles[4].id?(i<9?6:1):c.style.id===library.styles[8].id?0:null;
    if(replacement===null) return c;
    const style=library.styles[replacement];return {...c,style,depth:style.depth,plain:style.depth.background==='plain'};
  });
  // Let the low-ranked initials card change one dial from the first look.
  extra.positions={...f.pool[0].positions,warmCool:AXES.warmCool[1]};
  const coveragePool=[...withoutInitials,extra];
  assert.throws(()=>coverage.greedy(coveragePool),/two plain grounds and all five marks/);
  const recovered=coverage.page(coveragePool,()=>true);
  assert.deepEqual(coverage.calls,['checked greedy','search']);
  assert.equal(recovered.chosen.length,12);
  assert.ok(recovered.chosen.some(c=>c.depth.mark==='initials'));
  assert.ok(recovered.chosen.filter(c=>c.plain).length>=2);
  // Other errors, including a near-match, must escape without a search.
  for(const message of ['looks: no passing distinct leader remains unexpectedly. Correct the answers; see select.mjs help.','Fixture check could not run']) {
    const other=harness(),error=Error(message);
    assert.throws(()=>other.page(f.pool,()=>{throw error;}),e=>e===error);
    assert.deepEqual(other.calls,['checked greedy']);
  }
});
test('a successful checked greedy page retains its score order, spares and complete replacements',()=>{
  const h=harness(),f=fixture(),rejected=new Set([f.refused.palette.id,f.decoy.palette.id,f.secondRefused.palette.id]);
  // Refuse the decoy too: greedy reaches winner directly, and its twelve
  // slots can complete. The pre-fallback greedy result is the exact oracle.
  const replacements=[],expected=h.greedy(f.pool,checks(h,rejected,replacements),(c,slot)=>{
    for(const r of replacements.filter(r=>r.slot===slot)) r.replacement=h.summary(c);
  });
  const actualReplacements=[],actual=h.page(f.pool,checks(h,rejected,actualReplacements),actualReplacements);
  assert.deepEqual(h.calls,['checked greedy']);
  assert.deepEqual(actual,{...expected,replacements});
  assert.equal(replacements.length,3);
  assert.ok(replacements.every(r=>r.reason&&r.replacement));
  assert.deepEqual(actual.chosen.map(c=>c.score),[97,96,95,94,93,92,91,90,89,88,87,86]);
});
