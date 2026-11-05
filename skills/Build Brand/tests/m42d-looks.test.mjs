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
    ${slice('function chooseLooks(', '\nfunction page(')}
    const greedy=chooseLooks,search=chooseFreshLooks,calls=[];
    chooseLooks=(...args)=>{calls.push(args[1]?'checked greedy':'unchecked greedy');return greedy(...args);};
    chooseFreshLooks=(...args)=>{calls.push('search');return search(...args);};
    return {greedy,summary,calls,page(pool,acceptLook,replacements=[]) {
      const a={},library={},chosen=[],spares=[];let groups;
      const accept=(c,group,slot)=>acceptLook(c,slot);
      ${slice("      groups=[{id:'looks',label:'Whole looks'}];", '    } else if(roundPage)')}
      return {chosen,spares,replacements};
    }};
  `)(AXES);
}
function fixture() {
  const positions=Object.fromEntries(Object.entries(AXES).map(([axis,poles])=>[axis,poles[0]]));
  const candidate=(palette,pairing=0,graphic=0,changes={})=>({
    palette:library.palettes[palette],pairing:library.pairings[pairing],graphicSet:library.graphics[graphic],
    positions:{...positions,...changes},partPositions:{},score:100-palette,order:palette
  });
  const refused=candidate(0),decoy=candidate(1,0,0,Object.fromEntries(
    ['warmCool','quietBold','softStrong'].map(axis=>[axis,AXES[axis][1]]))),
    secondRefused=candidate(2),winner=candidate(3);
  const pool=[refused,decoy,secondRefused,winner,
    ...Array.from({length:5},(_,i)=>candidate(i+4,i+1,i+1)),
    ...Array.from({length:6},(_,i)=>candidate(i+9,0,0,{warmCool:AXES.warmCool[1]}))];
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
  // Checking refuses it, so greedy takes the decoy, whose three changed dials
  // leave no one-dial contrasts. Search skips that prefix and takes winner.
  assert.equal(h.greedy(f.pool).chosen.length,12);
  assert.throws(()=>h.greedy(f.pool,checks(h,rejected,[])),{message:'looks: no passing one-dial contrast remains. Correct the answers; see select.mjs help.'});
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
  // A graphic that only passes on plain ground exhausts greedy's sixth
  // leader. Search can move it into a plain slot and complete the same pool.
  const leaders=harness(),leaderReplacements=[];
  const leaderCheck=(records)=>(c,slot)=>{
    if(!new Set([f.refused.palette.id,f.decoy.palette.id,f.secondRefused.palette.id]).has(c.palette.id)&&
      (c.graphicSet.id!==library.graphics[5].id||c.plain)) return true;
    records.push({slot,group:'looks',refused:leaders.summary(c),reason:'Fixture check needs another leader',replacement:null});
    return false;
  };
  assert.throws(()=>leaders.greedy(f.pool,leaderCheck([])),{message:'looks: no passing distinct leader remains. Correct the answers; see select.mjs help.'});
  const recovered=leaders.page(f.pool,leaderCheck(leaderReplacements),leaderReplacements);
  assert.deepEqual(leaders.calls,['checked greedy','search']);
  assert.equal(recovered.chosen.length,12);
  assert.ok(recovered.chosen.slice(0,6).some(c=>c.graphicSet.id===library.graphics[5].id&&c.plain));
  for(const r of recovered.replacements) assert.deepEqual(r.replacement,leaders.summary(recovered.chosen[r.slot-1]));
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
