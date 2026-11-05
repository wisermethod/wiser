import test from 'node:test';
import assert from 'node:assert/strict';
import {z} from 'zod';
import {checkForm,formJsonSchema} from '../scripts/format.js';
import {resolveBoards,stepBoard} from '../scripts/boards.js';
import {controlsForm,startAt} from './page-controls-fixtures.js';
const copy=structuredClone;
for(const view of ['look','board'])for(const mode of ['light','dark'])test(`page controls ${view} ${mode}: current selection, schema, resolved steps and unchanged input`,()=>{
 const form=controlsForm(view,mode),before=copy(form),q=form.questions[0];
 assert.deepEqual(checkForm(form),{ok:true,problems:[]});assert.equal(z.fromJSONSchema(formJsonSchema()).safeParse(form).success,true);
 const model=resolveBoards(form.brand,q.options,form.boardDefaults,view);
 assert.equal(model.steps.length,q.options.length);
 for(const [i,o]of q.options.entries())for(const [k,s]of o.steps.entries())for(const m of ['light','dark']){
  const b=model.steps[i][k].boards[m];
  assert.equal(b.number,i+1);assert.deepEqual(b.palette.light,resolveBoards(form.brand,[{...o,board:stepBoard(o,s,view,m)}]).boards[0].palette.light);
  if(view==='look'){assert.deepEqual(b.depth,s.depth[m]);assert.equal(b.primaryMode,m);}
 }
 assert.deepEqual(form,before);
});
test('page controls accept either control alone, optional steps, partial ranges and each pick bound',()=>{
 for(const view of ['look','board'])for(const controls of [{mode:'light'},{strength:true}])for(const pick of [1,2,3]){
  const f=controlsForm(view),q=f.questions[0];q.controls=controls;q.pick=pick;delete q.min;
  if(view==='board'&&!controls.strength)for(const o of q.options)delete o.steps;
  assert.deepEqual(checkForm(f),{ok:true,problems:[]});
 }
 for(const count of [1,2,3]){
  const f=controlsForm();delete f.questions[0].controls;
  for(const o of f.questions[0].options)o.steps=o.steps.filter(s=>s.value===o.value||s.palette.id.endsWith('-muted')).slice(-count);
  assert.equal(checkForm(f).ok,true,JSON.stringify(checkForm(f)));
 }
 const f=controlsForm(),o=f.questions[0].options[0],own=o.steps.find(s=>s.value===o.value);
 own.depth.light=Object.fromEntries(Object.entries(own.depth.light).reverse());
 assert.equal(checkForm(f).ok,true,'deep equality ignores object key order');
});
const refusals=[
 ['empty controls',q=>q.controls={},'controls'],['null controls',q=>q.controls=null,'controls'],['array controls',q=>q.controls=[],'controls'],
 ['unknown control',q=>q.controls.extra=true,'controls.extra'],['mode invalid',q=>q.controls.mode='sepia','controls.mode'],['mode null',q=>q.controls.mode=null,'controls.mode'],
 ['false strength',q=>q.controls.strength=false,'controls.strength'],['nonboolean strength',q=>q.controls.strength=1,'controls.strength'],['null strength',q=>q.controls.strength=null,'controls.strength'],
 ['pick zero',q=>{q.pick=0;delete q.min;},'controls'],['mismatched mode',q=>q.options[0].board.primaryMode='dark','options[0].board.primaryMode'],
 ['strength needs steps',q=>delete q.options[0].steps,'options[0].steps'],['look mode needs steps',q=>{delete q.controls.strength;delete q.options[0].steps;},'options[0].steps'],
 ['steps empty',q=>q.options[0].steps=[],'options[0].steps'],['steps null',q=>q.options[0].steps=null,'options[0].steps'],['steps too many',q=>q.options[0].steps.push(copy(q.options[0].steps[0])),'options[0].steps'],
 ['null step',q=>q.options[0].steps[0]=null,'options[0].steps[0]'],['unknown step field',q=>q.options[0].steps[0].label='Extra','options[0].steps[0].label'],
 ['step value missing',q=>delete q.options[0].steps[0].value,'options[0].steps[0].value'],['bad value grammar',q=>q.options[0].steps[0].value='UPPER','options[0].steps[0].value'],
 ['step equals another option',q=>q.options[0].steps[0].value=q.options[1].value,'options[0].steps[0].value'],
 ['step equals another step',q=>q.options[1].steps[0].value=q.options[0].steps[0].value,'options[1].steps[0].value'],
 ['step repeated',q=>q.options[0].steps[1].value=q.options[0].steps[0].value,'options[0].steps[1].value'],
 ['no matching value',q=>q.options[0].value='unmatched','options[0].steps'],['no matching palette',q=>q.options[0].board.palette.id='business-blue-muted','options[0].steps'],
 ['matching twice',q=>{q.options[0].steps[0]=copy(q.options[0].steps[2]);},'options[0].steps'],
 ['palette missing',q=>delete q.options[0].steps[0].palette,'options[0].steps[0].palette'],['palette id missing',q=>q.options[0].steps[0].palette={},'options[0].steps[0].palette.id'],
 ['palette overrides refused',q=>q.options[0].steps[0].palette.overrides={},'options[0].steps[0].palette.overrides'],
 ['palette unknown',q=>q.options[0].steps[0].palette.id='absent-muted','options[0].steps[0]'],
 ['palette family changed',q=>q.options[0].steps[0].palette.id=q.options[1].steps[0].palette.id,'options[0].steps[0].palette'],
 ['steps reversed',q=>q.options[0].steps.reverse(),'options[0].steps[1].palette'],
 ['depth missing',q=>delete q.options[0].steps[0].depth,'options[0].steps[0].depth'],['depth mode missing',q=>delete q.options[0].steps[0].depth.dark,'options[0].steps[0].depth.dark'],
 ['depth unknown mode',q=>q.options[0].steps[0].depth.extra={},'options[0].steps[0].depth.extra'],
 ['bad step depth at step path',q=>q.options[0].steps[0].depth.dark.extra=true,'options[0].steps[0]'],
 ['null step depth at step path',q=>q.options[0].steps[0].depth.dark.block=null,'options[0].steps[0]'],
 ['matching depth differs',q=>q.options[0].steps[2].depth.light.band='none','options[0].steps[2].depth'],
];
for(const [name,change,path]of refusals)test(`page controls refusal: ${name}`,()=>{
 const f=controlsForm();change(f.questions[0]);const result=checkForm(f);
 assert.equal(result.ok,false);assert.ok(result.problems.some(p=>p.path===`questions[0].${path}`),JSON.stringify(result));
});
test('steps and controls stay off boardDefaults and other question types; board steps refuse depth',()=>{
 for(const key of ['controls','steps']){
  const f=controlsForm('board');f.boardDefaults={[key]:key==='controls'?{mode:'light'}:[]};
  assert.ok(checkForm(f).problems.some(p=>p.path===`boardDefaults.${key}`));assert.equal(z.fromJSONSchema(formJsonSchema()).safeParse(f).success,false);
 }
 const f=controlsForm('board');f.questions[0].options[0].steps[0].depth={light:{},dark:{}};
 assert.ok(checkForm(f).problems.some(p=>p.path==='questions[0].options[0].steps[0].depth'));
 const g={title:'Other',questions:[{id:'other',type:'checkbox',label:'Other',controls:{mode:'light'},options:[{value:'a',label:'A',steps:[]},{value:'b',label:'B'}]}]};
 assert.ok(checkForm(g).problems.some(p=>p.path==='questions[0].controls'));assert.ok(checkForm(g).problems.some(p=>p.path==='questions[0].options[0].steps'));
});
test('schema publishes closed controls, steps, palette and per-mode depths',()=>{
 const schema=formJsonSchema(),q=schema.properties.questions.items.properties,step=q.options.items.properties.steps;
 for(const obj of [q.controls,step.items,step.items.properties.palette,step.items.properties.depth,...Object.values(step.items.properties.depth.properties)])assert.equal(obj.additionalProperties,false);
 assert.deepEqual(q.controls.properties.mode.enum,['light','dark']);assert.deepEqual(q.controls.properties.strength.enum,[true]);assert.deepEqual(q.controls.required,[]);
 assert.equal(step.minItems,1);assert.equal(step.maxItems,3);assert.deepEqual(step.items.required,['value','palette']);assert.deepEqual(step.items.properties.depth.required,['light','dark']);
 assert.match(q.controls.description,/mode or strength/);assert.match(step.description,/look-view controls.mode/);
 const validator=z.fromJSONSchema(schema);
 for(const mutate of [q=>q.controls.extra=1,q=>q.controls.strength=false,q=>q.options[0].steps[0].extra=1,q=>q.options[0].steps[0].palette.extra=1,q=>q.options[0].steps[0].depth.extra={},q=>q.options[0].steps[0].depth.dark.extra=1,q=>q.options[0].steps[0].value='BAD',q=>q.options[0].steps=[]]){
  const f=controlsForm();mutate(f.questions[0]);assert.equal(validator.safeParse(f).success,false);
 }
});
