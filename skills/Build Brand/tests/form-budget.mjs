import assert from 'node:assert/strict';
import {select} from '../scripts/select.mjs';
import {readFileSync} from 'node:fs';
import {LIBRARY} from '../scripts/assemble.mjs';
import {lookActions} from './select-fixtures.mjs';

// Count all array entries and own object members, including the show_form wrapper.
export function inputElements(value) {
  if(value===null||typeof value!=='object')return 0;
  const children=Array.isArray(value)?value:Object.values(value);
  return children.length+children.reduce((sum,child)=>sum+inputElements(child),0);
}
export function assertFormBudget(form,budget=800) {
  assert.ok(form,'selection must supply a form');
  const count=inputElements({form});
  assert.ok(count<=budget,`show_form arguments hold ${count} elements; budget is ${budget}`);
  return count;
}
export function looksForm(a,result) {
  return {title:a.type==='org'?'Step 4 of 7: how it should look':'Step 3 of 6: how it should look',
    brand:{name:a.name,initials:result.selection.boards[0].initials,sentence:a.sentence,body:a.body,words:a.words},
    questions:[{id:'looks',type:'boards',view:'look',label:'Which of these feel like you? Pick up to three.',pick:3,min:2,controls:result.controls,options:result.options}],actions:lookActions()};
}
// All 19 library roles, including defaults that still consume hosted members.
export function fullKeptPalette() {
  const palette=JSON.parse(readFileSync(LIBRARY)).palettes.find(p=>p.id==='business-blue-bold');
  const overrides=Object.fromEntries(['light','dark'].map(mode=>[mode,structuredClone(palette[mode])]));
  assert.equal(Object.keys(overrides.light).length,19);assert.equal(Object.keys(overrides.dark).length,19);
  return {id:palette.id,overrides};
}
export function checkedForms(get,kept=false) {
  const a=get();
  if(kept)a.kept={palette:fullKeptPalette()};
  const looks=select('looks',a,{check:true});
  const answers={...a,looks:looks.options.slice(0,3).map(o=>o.value),looksShown:looks.options};
  const round=select('round1',answers,{check:true});
  const forms=[{page:'looks',form:looksForm(a,looks)}];
  if(!kept) {
    const next=select('looks',{...a,shown:looks.options},{check:true});
    forms.push({page:'looks-2',form:looksForm(a,next)});
  }
  forms.push({page:'round1',form:round.form});
  for(const count of kept?[3]:[1,2,3]) {
    const result=select('variations',{...answers,picks:round.selection.boards.filter(b=>!b.zero).slice(0,count),shown:round.selection.boards},{check:true});
    forms.push({page:`variations-${count}`,form:result.form});
  }
  return forms;
}
