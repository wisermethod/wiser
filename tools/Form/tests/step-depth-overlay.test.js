import test from 'node:test';
import assert from 'node:assert/strict';
import {z} from 'zod';
import {checkForm,formJsonSchema} from '../scripts/format.js';
import {resolveBoards,stepBoard} from '../scripts/boards.js';
import {depthSchema} from '../engine/boards-lib.js';
import {controlsForm} from './page-controls-fixtures.js';
const copy=structuredClone;
function fixture() {
  const form=controlsForm(),q=form.questions[0];
  q.options=q.options.slice(0,1);q.pick=1;delete q.min;
  const o=q.options[0];o.steps=o.steps.filter(s=>s.value===o.value);
  o.board.depth={background:'plain',block:{corner:12,inset:true},card:{corner:16},mark:'badge',band:'six',ink:'pop'};
  delete o.steps[0].depth;
  return form;
}
const option=f=>f.questions[0].options[0];
const step=f=>option(f).steps[0];
const resolved=f=>resolveBoards(f.brand,f.questions[0].options,{},'look');
test('look steps inherit absent depth and modes, overlay partial fields and replace nested fields whole',()=>{
  for(const depth of [undefined,{}, {dark:{}}, {dark:{block:{corner:24},band:'strip'}}]) {
    const f=fixture(),o=option(f),s=step(f);
    if(depth!==undefined)s.depth=copy(depth);
    const before=copy(f);
    assert.deepEqual(checkForm(f),{ok:true,problems:[]});
    assert.equal(z.fromJSONSchema(formJsonSchema()).safeParse(f).success,true);
    const model=resolved(f);
    assert.deepEqual(model.steps[0][0].boards.light.depth,o.board.depth);
    assert.deepEqual(model.steps[0][0].boards.dark.depth,{...o.board.depth,...depth?.dark});
    if(depth?.dark?.block)assert.deepEqual(model.steps[0][0].boards.dark.depth.block,{corner:24});
    assert.deepEqual(f,before);
  }
  const f=fixture();delete option(f).board.depth;
  assert.equal(checkForm(f).ok,true);assert.deepEqual(resolved(f).steps[0][0].boards.dark.depth,{});
});
test('overlay fields equal to board.depth are refused, including reordered nested objects',()=>{
  for(const [field,value]of Object.entries(option(fixture()).board.depth)) {
    const f=fixture();step(f).depth={dark:{[field]:value&&typeof value==='object'?Object.fromEntries(Object.entries(value).reverse()):value}};
    const result=checkForm(f);
    assert.equal(result.ok,false,field);assert.ok(result.problems.some(p=>/redundant/.test(p.message)),JSON.stringify(result));
    assert.throws(()=>resolved(f),/redundant/);
  }
});
test('partial overlays retain whole-depth closure, values, endpoints, colours and matching-card checks',()=>{
  for(const depth of [null,[],{sepia:{}},{dark:null},{dark:[]},{dark:{unknown:true}},{dark:{ink:'wrong'}},{dark:{block:{corner:99}}},{dark:{background:'gradient'}},{dark:{groundTo:'not-a-colour'}},{light:{band:'none'}}]) {
    const f=fixture();step(f).depth=depth;
    const result=checkForm(f);
    assert.equal(result.ok,false,JSON.stringify(depth));assert.ok(result.problems.some(p=>p.path.startsWith('questions[0].options[0].steps[0]')),JSON.stringify(result));
  }
  for(const field of Object.keys(depthSchema.properties)) {
    const f=fixture();step(f).depth={dark:{[field]:null}};
    assert.equal(checkForm(f).ok,false,field);
    assert.throws(()=>resolved(f),/depth/);
  }
});
test('schema describes optional closed overlays; board view continues to refuse depth',()=>{
  const q=formJsonSchema().properties.questions.items.properties;
  const s=q.options.items.properties.steps.items;
  assert.ok(!s.required.includes('depth'));
  assert.deepEqual(s.properties.depth.required,[]);
  assert.deepEqual(s.properties.depth.properties.light,depthSchema);
  assert.deepEqual(s.properties.depth.properties.dark,depthSchema);
  assert.match(s.properties.depth.description,/replacing each listed field whole/);
  const f=fixture(),o=option(f);f.questions[0].view='board';step(f).depth={};
  assert.equal(checkForm(f).ok,false);
  assert.throws(()=>stepBoard(o,step(f),'board'),/only in look view/);
});
