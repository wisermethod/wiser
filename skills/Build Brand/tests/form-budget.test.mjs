import '../../../tools/lib/tests/isolated-home.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {checkForm} from '../../../tools/Form/scripts/format.js';
import {operator,firstStrategy,bakery,lawFirm} from './select-fixtures.mjs';
import {inputElements,assertFormBudget,checkedForms} from './form-budget.mjs';

for(const get of [operator,firstStrategy,bakery,lawFirm])for(const kept of [false,true])test(`${get.name}: ${kept?'full kept palette (19 roles in both modes), checked first looks, Round 1 and variations with three picks fit 1000 elements':'library-only, checked first and second looks, Round 1 and variations with one, two and three picks fit 800 elements'}`,t=>{
  for(const {page,form}of checkedForms(get,kept)) {
    assert.ok(form,`${page} must be available`);
    assert.deepEqual(checkForm(form),{ok:true,problems:[]},page);
    const elements=assertFormBudget(form,kept?1000:800);
    t.diagnostic(`${page}: ${elements} elements, ${Buffer.byteLength(JSON.stringify({form}))} bytes`);
  }
});
test('size budget includes wrapper, every array entry and every nested object member',()=>{
  assert.equal(inputElements({form:{a:[{},null,{b:[1,2]}]}}),8);
  assert.equal(inputElements({form:{}}),1);
});
for(const budget of [800,1000])test(`planted size control: the budget accepts ${budget} and refuses ${budget+1} elements`,()=>{
  // Plant extra members in a synthetic payload to exercise the same budget guard.
  const form={title:'Boundary',questions:[{id:'words',label:'Your words',type:'text'}]};
  assert.equal(inputElements({form}),7);
  const planted={...form,extra:Array(budget-8).fill(null)};
  assert.equal(assertFormBudget(planted,budget),budget);
  planted.extra.push(null);
  assert.throws(()=>assertFormBudget(planted,budget),new RegExp(`${budget+1} elements; budget is ${budget}`));
});
