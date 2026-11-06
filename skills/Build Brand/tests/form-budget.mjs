import assert from 'node:assert/strict';
import {select} from '../scripts/select.mjs';
import {lookActions} from './select-fixtures.mjs';

// Count all array entries and own object members, including the show_form wrapper.
export function inputElements(value) {
  if(value===null||typeof value!=='object')return 0;
  const children=Array.isArray(value)?value:Object.values(value);
  return children.length+children.reduce((sum,child)=>sum+inputElements(child),0);
}
export function assertFormBudget(form) {
  assert.ok(form,'selection must supply a form');
  const count=inputElements({form});
  assert.ok(count<=800,`show_form arguments hold ${count} elements; budget is 800`);
  return count;
}
export function looksForm(a,result) {
  return {title:a.type==='org'?'Step 4 of 7: how it should look':'Step 3 of 6: how it should look',
    brand:{name:a.name,initials:result.selection.boards[0].initials,sentence:a.sentence,body:a.body,words:a.words},
    questions:[{id:'looks',type:'boards',view:'look',label:'Which of these feel like you? Pick up to three.',pick:3,min:2,controls:result.controls,options:result.options}],actions:lookActions()};
}
export function checkedForms(get,kept=false) {
  const a=get();
  if(kept)a.kept={palette:{id:'business-blue-bold',overrides:{light:{hairline:'#bbbbbb'},dark:{hairline:'#777777'}}}};
  const looks=select('looks',a,{check:true});
  const answers={...a,looks:looks.options.slice(0,3).map(o=>o.value),looksShown:looks.options};
  const round=select('round1',answers,{check:true});
  const forms=[{page:'looks',form:looksForm(a,looks)},{page:'round1',form:round.form}];
  for(const count of [1,2,3]) {
    const result=select('variations',{...answers,picks:round.selection.boards.filter(b=>!b.zero).slice(0,count),shown:round.selection.boards},{check:true});
    forms.push({page:`variations-${count}`,form:result.form});
  }
  return forms;
}
