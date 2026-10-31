import '../../lib/tests/isolated-home.js';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {boardForm} from './board-fixtures.js';
import {browserKit} from './boards-harness.js';
let kit;before(async()=>{kit=await browserKit();});after(async()=>{await kit?.browser.close();});

// A paged boards form keeps its over-limit status out of the paging row: hidden but present
// while the action row is off screen, and after the action row when it shows.
const paged=actions=>{const form=boardForm();form.paged=true;form.questions.push({id:'notes',type:'text',label:'Anything else?'});if(actions)form.actions=actions;return form;};
const line='You picked 4 boards. Pick up to three to go on.';
const placement=h=>h.f.locator('#send-limit').evaluate(n=>({hidden:n.classList.contains('visually-hidden'),inPaging:Boolean(n.closest('.page-actions')),afterActions:n.previousElementSibling?.classList.contains('board-actions')??false,text:n.textContent}));

test('paged boards form with the shipped actions: the warning never takes the paging row',async()=>{
 const h=await kit.open(paged(),734,'light',{name:'Claude',autoSize:true});
 try{
  for(let i=0;i<4;i++)await h.f.locator('.boards-tile').nth(i).click();
  let p=await placement(h);
  assert.equal(p.inPaging,false);assert.equal(p.hidden,true);assert.equal(p.text,line);
  await h.f.getByRole('button',{name:'Next'}).click();
  p=await placement(h);
  assert.equal(p.hidden,true,'the greyed button carries the one visible copy');
  assert.equal(await h.f.locator('[data-action=more]').isDisabled(),true);
  assert.equal(await h.f.locator('[data-action=more] small').innerText(),line);
  await h.f.getByRole('button',{name:'Back'}).click();
  p=await placement(h);
  assert.equal(p.hidden,true);assert.equal(p.inPaging,false);
 }finally{await h.context.close();}
});

test('paged boards form with only none and one: the visible line follows the action row on the last page alone',async()=>{
 const h=await kit.open(paged([{value:'none',label:'None of these work',needs:'none'},{value:'one',label:'Only this one',needs:'one'}]),734,'light',{name:'Claude',autoSize:true});
 try{
  for(let i=0;i<4;i++)await h.f.locator('.boards-tile').nth(i).click();
  let p=await placement(h);
  assert.equal(p.hidden,true,'off the action page the line stays out of view');assert.equal(p.inPaging,false);
  await h.f.getByRole('button',{name:'Next'}).click();
  p=await placement(h);
  assert.equal(p.hidden,false);assert.equal(p.afterActions,true);assert.equal(p.inPaging,false);assert.equal(p.text,line);
  await h.f.getByRole('button',{name:'Back'}).click();
  p=await placement(h);
  assert.equal(p.hidden,true);
 }finally{await h.context.close();}
});
