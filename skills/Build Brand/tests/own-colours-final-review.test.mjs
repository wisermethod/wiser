import test from 'node:test';
import assert from 'node:assert/strict';
import {buildOwnColours,coloursFromComment,wcag,apca} from '../scripts/own-colours.mjs';
import {select} from '../scripts/select.mjs';
import {bakery} from './select-fixtures.mjs';

const answers=()=>({...bakery(),ownColours:buildOwnColours('red, white and blue')});
test('saved look records retain their palette metadata and replay as shown',()=>{
 const a=answers(),first=select('looks',a,{check:true});
 for(const look of first.looks){
  assert.ok(look.steps[0].palette.names.length);
  assert.equal(look.steps[0].palette.energy,a.ownColours.lines[0]);
 }
 const shown=first.looks.slice(0,2),next=select('looks',{...a,shown},{check:true});
 const options=select('looks',{...a,shown:first.options.slice(0,2)},{check:true});
 assert.deepEqual(next.options,options.options);
 assert.ok(next.looks.length>0);
 for(const look of next.looks)assert.ok(!shown.some(old=>old.pairing===look.pairing&&old.graphicSet===look.graphicSet));
});
test('saved look records replay as Round 1 looksShown, including picked steps',()=>{
 const a=answers(),first=select('looks',a,{check:true}),looks=first.looks.slice(0,2).map(l=>l.steps[0].value);
 const round=select('round1',{...a,looks,looksShown:first.looks},{check:true});
 const options=select('round1',{...a,looks,looksShown:first.options},{check:true});
 assert.equal(round.selection.boards.length,12);
 assert.deepEqual(round.selection,options.selection);
});

for(const [comment,names] of [
 ['red, white and blue.',['red','white','blue']],
 ['navy and gold?',['navy','gold']],
 ['teal.',['teal']],
 ['red, white\nand blue!',['red','white','blue']],
 ['forest green\r\nand gold?!',['forest green','gold']]
])test(`colour comment normalises sentence punctuation and line breaks: ${JSON.stringify(comment)}`,()=>{
 const result=coloursFromComment(comment);
 assert.equal(result.status,'ready');assert.deepEqual(result.values.map(v=>v.name),names);
 // The saved ready result remains usable by select's unchanged-record check.
 assert.deepEqual(buildOwnColours(result.said),result);
});
test('punctuation and line breaks leave unknown comment text as steer',()=>{
 for(const comment of ['red, white and blurple.','navy and gold please?','teal\nwith sparkle.','less red.']){
  assert.deepEqual(coloursFromComment(comment),{status:'steer',said:comment});
 }
});
test('request prefixes build only an entirely known colour remainder',()=>{
 for(const comment of ['I want it warmer','I want something bolder','We would like a serif','I would like warmer colours.','Please use something bolder?']){
  assert.deepEqual(coloursFromComment(comment),{status:'steer',said:comment});
 }
 for(const [comment,names] of [['I want red',['red']],['Please use forest green and gold',['forest green','gold']],['I would like navy and gold?',['navy','gold']],['We want teal.',['teal']]]){
  const result=coloursFromComment(comment);
  assert.equal(result.status,'ready',comment);assert.deepEqual(result.values.map(v=>v.name),names);
 }
});
test('None of these work refuses with library exhaustion after every own-colour look was shown',()=>{
 const a=answers(),first=select('looks',a,{check:true});
 assert.ok(first.looks.length>0&&first.looks.length<12);
 for(const shown of [first.looks,first.options]){
  assert.throws(()=>select('looks',{...a,shown},{check:true}),/looks: library exhausted/);
 }
});

for(const said of ['cream','ivory','snow','chalk'])test(`single near-white stays off the button in both modes: ${said}`,()=>{
 const result=buildOwnColours(said),member=result.values[0].value.toUpperCase();
 for(const [mode,c] of Object.entries(result.kept.palette.overrides)){
  assert.notEqual(c.pop.toUpperCase(),member,`${mode} pop`);
  assert.ok([c.panel,c.mark].map(v=>v.toUpperCase()).includes(member),`${mode} keeps the member colour`);
  for(const role of ['pop','mark'])assert.ok(wcag(c[role],c.ground)>=1.5,`${mode} ${role} on ground`);
  assert.ok(wcag(c.onPop,c.pop)>=4.5&&Math.abs(apca(c.onPop,c.pop))>=60,`${mode} button words`);
 }
 assert.deepEqual(result.checks.problems,[]);
});
test('navy and blue has visible dark pop and mark with readable button words',()=>{
 const result=buildOwnColours('navy and blue'),c=result.kept.palette.overrides.dark;
 for(const role of ['pop','mark']){
  assert.notEqual(c[role].toUpperCase(),c.ground.toUpperCase(),role);
  assert.ok(wcag(c[role],c.ground)>=1.5,role);
 }
 assert.ok(wcag(c.onPop,c.pop)>=4.5&&Math.abs(apca(c.onPop,c.pop))>=60);
 assert.deepEqual(result.checks.problems,[]);
});
