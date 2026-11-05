import '../../lib/tests/isolated-home.js';
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {serve,http,stop,wait,cleanupAndScan} from './local-harness.js';
import {select} from '../../../skills/Build Brand/scripts/select.mjs';
import {operator,firstStrategy,lookActions} from '../../../skills/Build Brand/tests/select-fixtures.mjs';
import {checkForm} from '../scripts/format.js';
after(cleanupAndScan);
function payload(form,values,mode,action) {
 const q=form.questions[0];return {form:form.title,answers:{[q.id]:values},mode,action,shown:[{id:q.id,question:q.label,shown:values.map(value=>q.options.flatMap(o=>o.steps).find(s=>s.value===value).label).join(', ')}]};
}
async function answer(form,values,mode,action) {
 assert.deepEqual(checkForm(form),{ok:true,problems:[]});const server=await serve(form);
 try {
  const p=payload(form,values,mode,action),missing={...p};delete missing.mode;
  assert.equal((await http(server,'answers',{method:'POST',body:missing})).status,400,'planted missing returned mode');
  assert.equal((await http(server,'answers',{method:'POST',body:{...p,answers:{[form.questions[0].id]:['not-supplied']}}})).status,400,'planted unsupplied step');
  assert.equal((await http(server,'answers',{method:'POST',body:p})).status,200);
  const result=await wait(server);assert.equal(result.mode,mode);return result;
 } finally {await stop(server);}
}
for(const get of [operator,firstStrategy])test(`${get.name}: selector steps and returned switch position survive looks, Round 1 and variations`,async()=>{
 const a=get(),looks=select('looks',a,{check:true});
 const form={title:'Choose looks',brand:{name:a.name,initials:looks.selection.boards[0].initials,sentence:a.sentence,body:a.body,words:a.words},questions:[{id:'looks',type:'boards',view:'look',label:'Choose looks',pick:3,min:2,controls:looks.controls,options:looks.options}],actions:lookActions()};
 const option=looks.options.find(o=>o.steps.length>1),lookStep=option.steps.find(s=>s.value!==option.value);
 const received=await answer(form,[lookStep.value],'light','one');
 const roundInput={...a,looks:received.answers.looks,looksShown:looks.options,mode:received.mode};
 const round=select('round1',roundInput,{check:true}),q=round.form.questions[0];
 assert.deepEqual(q.controls,{mode:'light',strength:true});assert.ok(round.selection.boards.every(b=>b.primaryMode==='light'));
 const board=q.options.find(o=>o.steps.length>1),step=board.steps.find(s=>s.value!==board.value);
 const picked=await answer(round.form,[step.value],'dark','more');
 assert.ok(picked.shown[0].shown.includes(step.label),'member saw the picked palette caption');
 const record=round.selection.boards.flatMap(b=>b.steps).find(s=>s.value===picked.answers.boards[0]);
 assert.equal(record.palette.id,step.palette.id);
 const input={...roundInput,picks:[record],shown:round.selection.boards,mode:picked.mode},before=structuredClone(input);
 const variations=select('variations',input,{check:true});
 assert.deepEqual(input,before,'picked step and first-shown history stay intact');
 assert.deepEqual(variations.form.questions[0].controls,{mode:'dark',strength:true});
 assert.ok(variations.selection.boards.every(b=>b.primaryMode==='dark'));
 assert.ok(variations.positions.every(c=>c.parent===record.number&&!c.changedParts.includes('primaryMode')));
});

for(const id of [undefined,'business-blue-bold'])test(`kept palette ${id??'roles only'}: listener returns looks and Round 1 values with the last mode`,async()=>{
 const a={...operator(),mode:'light',kept:{palette:{...(id?{id}:{}),overrides:{light:{hairline:'#bbbbbb'},dark:{hairline:'#777777'}}}}};
 const looks=select('looks',a,{check:true});assert.ok(looks.options,looks.formUnavailable);
 const form={title:'Choose looks',brand:{name:a.name,initials:looks.selection.boards[0].initials,sentence:a.sentence,body:a.body,words:a.words},questions:[{id:'looks',type:'boards',view:'look',label:'Choose looks',pick:3,min:2,controls:looks.controls,options:looks.options}],actions:lookActions()};
 const received=await answer(form,[looks.options[0].steps[0].value],'dark','one');
 const round=select('round1',{...a,looks:received.answers.looks,looksShown:looks.options,mode:received.mode},{check:true});
 assert.ok(round.form,round.formUnavailable);assert.deepEqual(round.form.questions[0].controls,{mode:'dark'});
 const own=round.form.questions[0].options[0].steps[0];
 const picked=await answer(round.form,[own.value],'light','more');
 assert.deepEqual(picked.answers.boards,[own.value]);assert.equal(picked.mode,'light');
 assert.ok(round.selection.boards.every(b=>b.steps.length===1&&b.steps[0].palette.overrides.light.hairline==='#bbbbbb'));
});
