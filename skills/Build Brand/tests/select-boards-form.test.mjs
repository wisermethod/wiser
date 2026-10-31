import '../../../tools/lib/tests/isolated-home.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {select} from '../scripts/select.mjs';
import {operator,firstStrategy} from './select-fixtures.mjs';
import {checkForm} from '../../../tools/Form/scripts/format.js';
import {BOARD_KEYS,resolveBoards} from '../../../tools/Form/scripts/boards.js';
const refs=['pairing','palette','graphicSet','container','primaryMode'];
function legacy(answers,result){
 const r=result.form,f=structuredClone(r);delete f.boardDefaults;
 f.questions[0].options=result.selection.boards.map(b=>({value:`board-${b.number}`,label:b.name,note:answers.words.map(w=>`${w.word}, not ${w.not}`).join('; '),...(b.recommendation?{recommendation:b.recommendation}:{}),board:Object.fromEntries(BOARD_KEYS.filter(k=>Object.hasOwn(b,k)).map(k=>[k,k==='content'?Object.fromEntries(Object.entries(b.content).filter(([key])=>!['brandName','sentence','body'].includes(key))):b[k]]))}));
 return f;
}
function assertForm(a,result,t){
 const f=result.form,before=structuredClone(result);assert.ok(f);
 assert.deepEqual(checkForm(f),{ok:true,problems:[]});assert.deepEqual(result,before);
 assert.equal(f.questions[0].options.length,12);assert.equal(f.questions[0].pick,3);
 for(const option of f.questions[0].options){
  assert.deepEqual(Object.keys(option).sort(),['value','label','board',...(option.recommendation?['recommendation']:[])].sort());
  assert.deepEqual(Object.keys(option.board).sort(),refs.sort());
 }
 const full=legacy(a,result);
 // Option notes drive only the tile; resolve without those notes for model equality.
 const expanded=structuredClone(full);for(const option of expanded.questions[0].options)delete option.note;
 assert.deepEqual(resolveBoards(f.brand,f.questions[0].options,f.boardDefaults),resolveBoards(expanded.brand,expanded.questions[0].options));
 const bytes={before:Buffer.byteLength(JSON.stringify(full)),after:Buffer.byteLength(JSON.stringify(f))};
 t.diagnostic(JSON.stringify({form:result.command,name:a.name,compactJsonBytes:bytes}));
 assert.ok(bytes.after<bytes.before*.3,JSON.stringify(bytes));
}
for(const [name,get] of Object.entries({operator,firstStrategy})){
 let round;
 test(`${name}: checked round1 returns a valid slim boards form as given`,t=>{
  const a=get();round=select('round1',a,{check:true});assertForm(a,round,t);
 });
 test(`${name}: checked three-pick variations returns a valid slim form as given`,t=>{
  const a=get();round??=select('round1',a,{check:true});
  const r=select('variations',{...a,picks:round.selection.boards.slice(0,3),shown:round.selection.boards,steer:{warmCool:0,quietBold:0,softStrong:0,classicContemporary:0}},{check:true});
  assertForm(a,r,t);
 });
}
test('variation parents keep differing copy on their own options and factor only common fields',()=>{
 const a=operator(),round=select('round1',a,{check:true}),picks=structuredClone(round.selection.boards.slice(0,3));
 for(const [i,b] of picks.entries()){b.content.smallPrint=`Parent ${i+1}`;b.items.primaryAction=`Action ${i+1}`;}
 const r=select('variations',{...a,picks,shown:round.selection.boards,steer:{}},{check:true});
 assert.deepEqual(checkForm(r.form),{ok:true,problems:[]});assert.equal(Object.hasOwn(r.form.boardDefaults,'content'),false);assert.equal(Object.hasOwn(r.form.boardDefaults,'items'),false);
 for(const [i,o] of r.form.questions[0].options.entries()){
  assert.equal(o.board.content.smallPrint,`Parent ${Math.floor(i/4)+1}`);assert.equal(o.board.items.primaryAction,`Action ${Math.floor(i/4)+1}`);
  assert.equal(Object.hasOwn(o.board,'sample'),false);
 }
});
test('a fresh variations page and unsteered round preserve slim forms; kept settings stay shared',()=>{
 const a={...operator(),kept:{buttonRadius:7}};
 for(const r of [select('round1',a,{check:true,unsteered:true}),select('variations',{...a,picks:[],shown:[],steer:{}},{check:true})]){
  assert.deepEqual(checkForm(r.form),{ok:true,problems:[]});assert.equal(r.form.questions[0].options[0].value,'board-0');
  assert.equal(r.form.boardDefaults.buttonRadius,7);
  assert.ok(r.selection.boards.every(b=>b.buttonRadius===7));
 }
});
test('disk-only kept fonts preserve assembly records and explain why Form is unavailable',()=>{
 const a={...operator(),kept:{headingFrom:{file:'kept.ttf',family:'Kept face',weight:700}}};
 const r=select('round1',a);assert.equal(r.form,null);assert.match(r.formUnavailable,/kept font files/);
 assert.ok(r.selection.boards.every(b=>b.pairing.headingFrom.file==='kept.ttf'));
});
