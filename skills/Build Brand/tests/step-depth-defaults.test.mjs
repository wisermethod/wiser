import '../../../tools/lib/tests/isolated-home.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {select} from '../scripts/select.mjs';
import {LIBRARY} from '../scripts/assemble.mjs';
import {resolveBoards} from '../../../tools/Form/scripts/boards.js';
import {operator,firstStrategy,bakery,lawFirm} from './select-fixtures.mjs';

const library=JSON.parse(readFileSync(LIBRARY));
const styles=new Map(library.styles.map(s=>[s.id,s]));
// The approved card-mode depth, read from the library itself: the style's depth with its cardDepth record laid over it.
const approved=(palette,style,mode)=>({...styles.get(style).depth,...(library.cardDepth.find(d=>d.palette===palette&&d.style===style&&d.mode===mode)?.depth??{})});
// allowHueShift false is its documented default, so a stated false and an absent field are the same depth.
const normal=d=>Object.fromEntries(Object.entries(d).filter(([k,v])=>!(k==='allowHueShift'&&v===false)).sort(([a],[b])=>a<b?-1:1));
const brandOf=a=>({name:a.name,initials:a.name.split(/\s+/).slice(0,2).map(w=>[...w][0]).join('').toUpperCase(),sentence:a.sentence,body:a.body??a.sentence,words:a.words});

function* pages(answers) {
  const shown=[];
  for(let n=0;n<40;n++) {
    let r;try{r=select('looks',shown.length?{...answers,shown}:answers);}catch(e){if(/library exhausted/.test(e.message))return;throw e;}
    yield r;shown.push(...r.options);
  }
}

for(const [name,fixture] of Object.entries({operator,firstStrategy,bakery,lawFirm}))for(const mode of ['light','dark'])
  test(`${name} ${mode}: every looks step, merged over its option's depth, is equivalent to its approved card-mode depth, allowHueShift: false read as absent, in both modes`,()=>{
    const a={...fixture(),taps:{...fixture().taps,mode}};let steps=0;
    for(const r of pages(a))for(const o of r.options) {
      const model=resolveBoards(brandOf(a),[o],{},'look');
      for(const [k,st] of o.steps.entries())for(const m of ['light','dark']) {
        const expected=normal(approved(st.palette.id,o.board.pairing.id,m));
        assert.deepEqual(normal({...o.board.depth,...(st.depth?.[m]??{})}),expected,`${st.palette.id} ${o.board.pairing.id} ${m}: the overlay`);
        assert.deepEqual(normal(model.steps[0][k].boards[m].depth),expected,`${st.palette.id} ${o.board.pairing.id} ${m}: Form's resolved model`);
        steps++;
      }
    }
    assert.ok(steps>100,`checked ${steps} step-modes`);
  });

test('a sibling is equivalent to its approved card-mode depth, allowHueShift: false read as absent, by stating a missing field at its default',()=>{
  const a={...operator(),taps:{...operator().taps,mode:'light'}};let found=0;
  for(const r of pages(a))for(const o of r.options)if(o.board.depth.allowHueShift===true)for(const st of o.steps)for(const m of ['light','dark']) {
    const own=approved(st.palette.id,o.board.pairing.id,m);
    if(own.allowHueShift!==true){assert.equal(st.depth?.[m]?.allowHueShift,false,`${st.palette.id} ${m}`);found++;}
  }
  assert.ok(found>0,'the recorded tap set reaches a card carrying the allowance');
});

test('a missing depth field with no stated default omits the step and leaves the checked looks page available',()=>{
 const a=operator(),first=select('looks',a,{check:true});
 const o=first.options.find(o=>o.steps.length===3&&!Object.hasOwn(o.board.depth,'groundThird'));
 assert.ok(o,'a full family without an endpoint is available');
 const libraryWithEndpoint=structuredClone(library),style=o.board.pairing.id,palette=o.board.palette.id;
 // A valid endpoint is present on every mode of the own card, but absent on siblings.
 for(const mode of ['light','dark']) {
  let record=libraryWithEndpoint.cardDepth.find(d=>d.palette===palette&&d.style===style&&d.mode===mode);
  if(!record){record={palette,style,mode,depth:{}};libraryWithEndpoint.cardDepth.push(record);}
  record.depth.groundThird='ground';
 }
 const result=select('looks',a,{library:libraryWithEndpoint,check:true});
 assert.equal(result.options.length,12);
 const own=result.options.find(option=>option.value===o.value);assert.ok(own);
 assert.deepEqual(own.steps.map(s=>s.value),[own.value]);
 assert.equal(own.board.depth.groundThird,'ground');
});
