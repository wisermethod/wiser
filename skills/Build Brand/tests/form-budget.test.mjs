import '../../../tools/lib/tests/isolated-home.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {checkForm} from '../../../tools/Form/scripts/format.js';
import {operator,firstStrategy,bakery,lawFirm} from './select-fixtures.mjs';
import {inputElements,assertFormBudget,checkedForms} from './form-budget.mjs';

for(const get of [operator,firstStrategy,bakery,lawFirm])for(const kept of [false,true])test(`${get.name}, kept palette ${kept}: checked looks, Round 1 and variations with one, two and three picks fit 800 elements`,()=>{
  for(const {page,form}of checkedForms(get,kept)) {
    assert.ok(form,`${page} must be available`);
    assert.deepEqual(checkForm(form),{ok:true,problems:[]},page);
    assertFormBudget(form);
  }
});
test('size budget includes wrapper, every array entry and every nested object member',()=>{
  assert.equal(inputElements({form:{a:[{},null,{b:[1,2]}]}}),8);
  assert.equal(inputElements({form:{}}),1);
});
test('planted size control: the budget accepts 800 and refuses 801 elements',()=>{
  // Plant extra members in a synthetic payload to exercise the same budget guard.
  const form={title:'Boundary',questions:[{id:'words',label:'Your words',type:'text'}]};
  assert.equal(inputElements({form}),7);
  const planted={...form,extra:Array(792).fill(null)};
  assert.equal(assertFormBudget(planted),800);
  planted.extra.push(null);
  assert.throws(()=>assertFormBudget(planted),/801 elements; budget is 800/);
});
