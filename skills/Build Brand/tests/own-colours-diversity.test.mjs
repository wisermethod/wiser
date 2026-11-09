import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildOwnColours} from '../scripts/own-colours.mjs';
import {select} from '../scripts/select.mjs';
import {LIBRARY} from '../scripts/assemble.mjs';
import {bakery,operator} from './select-fixtures.mjs';
import {looksForm,assertFormBudget} from './form-budget.mjs';

// Same invented politician and taps as the own-colours render proof.
export const politician=()=>({...operator(),name:'Dana Reyes for City Council',sentence:"I'm running for City Council so every street in our neighbourhood gets the care it's owed.",heroPhrase:'every street',words:[{word:'Steady',not:'stiff'},{word:'Local',not:'small'},{word:'Honest',not:'harsh'}],taps:{...operator().taps,mode:'light',feel:'suit-and-tie',history:'rooted',strength:'strong-solid',technology:'craftsman',style:'brooks-brothers',posture:'porsche',mood:'restoration-hardware',place:'hotel-lobby'}});
const lookKey=b=>`${b.pairing.id}/${b.graphicSet.id}`;
const boardKey=b=>`${lookKey(b)}/${b.container??''}`;
const distinct=(boards,key)=>assert.equal(new Set(boards.map(key)).size,boards.length,JSON.stringify(boards.map(key)));
const samples=[['red, white and blue',politician],['forest green and gold',bakery]];
const flow=(get,said)=>{
 const a={...get(),ownColours:buildOwnColours(said)},looks=select('looks',a,{check:true});
 const answers={...a,looks:looks.options.slice(0,2).map(o=>o.value),looksShown:looks.options};
 const round=select('round1',answers,{check:true});
 return {a,looks,answers,round};
};
for(const [said,get] of samples){
 test(`${said}: own-colour looks have distinct pairing and graphic sets, including later pages`,()=>{
  const a={...get(),ownColours:buildOwnColours(said)},first=select('looks',a,{check:true});
  const library=JSON.parse(readFileSync(LIBRARY));
  assert.equal(first.options.length,Math.min(12,library.styles.length));
  distinct(first.selection.boards,lookKey);
  const shown=first.options.slice(0,2),next=select('looks',{...a,shown},{check:true});
  distinct([...first.selection.boards.slice(0,2),...next.selection.boards],lookKey);
  assert.throws(()=>select('looks',{...a,shown:[...shown,...next.options]},{check:true}),/looks: library exhausted/);
  assertFormBudget(looksForm(a,first),1000);
 });
 test(`${said}: Round 1 has distinct visible pairing, graphic set and container`,()=>{
  const {round}=flow(get,said);
  assert.equal(round.selection.boards.length,12);
  distinct(round.selection.boards,boardKey);
  assertFormBudget(round.form,1000);
 });
 test(`${said}: variations never repeat a visible board from any pick or history`,()=>{
  const {answers,round}=flow(get,said);
  const variation=select('variations',{...answers,picks:round.selection.boards.slice(0,3),shown:round.selection.boards},{check:true});
  assert.equal(variation.selection.boards.length,12);
  distinct([...round.selection.boards,...variation.selection.boards],boardKey);
  assert.ok(variation.positions.every(p=>!p.changedParts.includes('palette')));
  assertFormBudget(variation.form,1000);
 });
}
// Every card on a page shares the page's Light / Dark switch, so a member's
// dark ground (navy for red, white and blue) shows by pressing Dark; the page
// does not mix grounds (session 3's call of 2026-11-06, Form's mode rule).
for(const [said,get] of [...samples,['just red',politician]])for(const command of ['looks','round1']){
 test(`${said}: ${command} leads with one ground the page switch can change`,()=>{
  const a={...get(),ownColours:buildOwnColours(said)},page=select(command,{...a,...(command==='round1'?{looksShown:[]}: {})},{check:true});
  assert.equal(new Set(page.selection.boards.map(b=>b.primaryMode)).size,1);
 });
}
test('own-colour looks return the available distinct styles when fewer than twelve exist',()=>{
 const library=JSON.parse(readFileSync(LIBRARY));library.styles=library.styles.slice(0,4);
 const a={...politician(),ownColours:buildOwnColours('red, white and blue')};
 const page=select('looks',a,{library,check:true});
 assert.equal(page.options.length,4);distinct(page.selection.boards,lookKey);
 assert.deepEqual(page.notes,[]);
});
