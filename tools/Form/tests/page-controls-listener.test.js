import '../../lib/tests/isolated-home.js';
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {serve,http,stop,wait,cleanupAndScan} from './local-harness.js';
import {lookActions} from './board-fixtures.js';
import {controlsForm,startAt} from './page-controls-fixtures.js';
after(cleanupAndScan);
function payload(form,values,extra={}){
 const q=form.questions[0];return {form:form.title,answers:{[q.id]:values},shown:[{id:q.id,question:q.label,shown:'Selected looks'}],...extra};
}
test('listener requires page mode, allows light/dark, and refuses missing, invalid or additional data',async()=>{
 for(const mode of ['light','dark']){
  const form=startAt(controlsForm()),q=form.questions[0],s=await serve(form);
  try{
   const values=q.options.slice(0,2).map(o=>o.steps[2].value);
   for(const extra of [{},{mode:'sepia'},{mode:null},{mode:true},{mode,extra:1}])assert.equal((await http(s,'answers',{method:'POST',body:payload(form,values,extra)})).status,400);
   assert.equal((await http(s,'answers',{method:'POST',body:payload(form,values,{mode})})).status,200);
   const answer=await wait(s);assert.equal(answer.mode,mode);assert.deepEqual(answer.answers.looks,values);
  }finally{await stop(s);}
 }
});
test('listener refuses mode without controls.mode, with or without strength and steps',async()=>{
 for(const strength of [false,true]){
  const form=controlsForm(),q=form.questions[0];delete q.controls.mode;
  if(!strength){delete q.controls;for(const o of q.options)delete o.steps;}
  const values=q.options.slice(0,2).map(o=>o.value),s=await serve(form);
  try{
   assert.equal((await http(s,'answers',{method:'POST',body:payload(form,values,{mode:'light'})})).status,400);
   assert.equal((await http(s,'answers',{method:'POST',body:payload(form,values)})).status,200);
  }finally{await stop(s);}
 }
});
test('listener accepts only this question\'s values, at most one per option, and keeps cap and minimum',async()=>{
 const form=startAt(controlsForm()),q=form.questions[0],other=q.options.pop(),s=await serve(form);
 const post=values=>http(s,'answers',{method:'POST',body:payload(form,values,{mode:'dark'})});
 try{
  const [a,b]=q.options;
  for(const values of [[a.value],[a.value,a.steps[0].value],[a.steps[0].value,a.steps[2].value],[a.value,other.steps[0].value],[a.value,'not-supplied'],q.options.slice(0,4).map(o=>o.value)])assert.equal((await post(values)).status,400,JSON.stringify(values));
  const values=[a.steps[0].value,b.steps[2].value];assert.equal((await post(values)).status,200);assert.deepEqual((await wait(s)).answers.looks,values);
 }finally{await stop(s);}
});

for(const mode of ['light','dark'])for(const count of [0,1,2,3])test(`listener looks actions with ${mode} mode and ${count} picks`,async()=>{
 const form=startAt(controlsForm());form.actions=lookActions();const q=form.questions[0],s=await serve(form);
 const values=q.options.slice(0,count).map(o=>o.steps[2].value),action=count===0?'none':count===1?'one':'use';
 const post=extra=>http(s,'answers',{method:'POST',body:payload(form,values,extra)});
 try{
  for(const extra of [{mode},{action},{mode:'sepia',action},{mode,action:'unknown'},...form.actions.filter(a=>a.value!==action).map(a=>({mode,action:a.value}))])assert.equal((await post(extra)).status,400,JSON.stringify(extra));
  const over=q.options.slice(0,4).map(o=>o.steps[2].value);
  assert.equal((await http(s,'answers',{method:'POST',body:payload(form,over,{mode,action:'use'})})).status,400);
  assert.equal((await post({mode,action})).status,200);
  const answer=await wait(s);assert.equal(answer.mode,mode);assert.equal(answer.action,action);assert.deepEqual(answer.answers.looks,values);
 }finally{await stop(s);}
});
