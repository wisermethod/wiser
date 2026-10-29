import '../../lib/tests/isolated-home.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {z} from 'zod';
import {checkForm,fillTemplate,formJsonSchema} from '../scripts/format.js';
import {actionAllowed,resolveBoards} from '../scripts/boards.js';
import {generateBoardsLibrary} from '../scripts/bundle-boards.mjs';
import {boardForm,formFromSelection,lookForm,tapSets} from './board-fixtures.js';
import {select} from '../../../skills/Build Brand/scripts/select.mjs';
const copy=structuredClone;
test('generated board library is current and portable without Node, DOM or imports',()=>{
 const source=readFileSync(new URL('../engine/boards-lib.js',import.meta.url),'utf8');assert.equal(source,generateBoardsLibrary());
 assert.doesNotMatch(source,/^import |\b(?:Buffer|process|require)\b/m);
 const context=vm.createContext({TextEncoder,TextDecoder,URL,structuredClone});
 assert.doesNotThrow(()=>vm.runInContext(source.replace(/\bexport /g,''),context));
});
for(const [name,get]of Object.entries(tapSets))test(`twelve-board ${name}: checked Round 1 fits and is admitted by the schema`,()=>{
 const a=get(),f=formFromSelection(a,select('round1',a,{check:true}).selection),before=copy(f);
 assert.equal(f.questions[0].options.length,12);assert.deepEqual(checkForm(f),{ok:true,problems:[]});assert.deepEqual(f,before);
 const bytes=Buffer.byteLength(JSON.stringify(f));assert.ok(bytes<65536,String(bytes));
 assert.equal(z.fromJSONSchema(formJsonSchema()).safeParse(f).success,true);
});
test('boards accept pick 0, 1, 2, 3, one to twelve choices and a shared checked SVG',()=>{
 for(const pick of [0,1,2,3])for(const count of [1,12]){const f=boardForm();f.questions[0].pick=pick;f.questions[0].options.length=count;if(pick===0)delete f.actions;assert.equal(checkForm(f).ok,true,JSON.stringify(checkForm(f)));}
 const f=boardForm();f.brand.logo='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><defs><path id="a" d="M1 1h18v18H1z"/></defs><use href="#a" fill="#234"/></svg>';
 for(const o of f.questions[0].options)delete o.board.container;
 assert.deepEqual(checkForm(f),{ok:true,problems:[]});assert.ok(resolveBoards(f.brand,f.questions[0].options).boards.every(b=>b.mark.supplied));
});
const changes=[
 ['pick missing',f=>delete f.questions[0].pick],['pick 4',f=>f.questions[0].pick=4],['pick string',f=>f.questions[0].pick='3'],
 ['view unknown',f=>f.questions[0].view='picture'],['view null',f=>f.questions[0].view=null],['view numeric',f=>f.questions[0].view=2],
 ['min zero',f=>f.questions[0].min=0],['min above pick',f=>f.questions[0].min=4],['min fractional',f=>f.questions[0].min=1.5],['min string',f=>f.questions[0].min='2'],['min null',f=>f.questions[0].min=null],['min display',f=>{delete f.actions;f.questions[0].pick=0;f.questions[0].min=1;}],
 ['no boards',f=>f.questions[0].options=[]],['13 boards',f=>f.questions[0].options.push(copy(f.questions[0].options[0]))],
 ['brand missing',f=>delete f.brand],['brand unknown',f=>f.brand.extra=true],['brand words missing',f=>delete f.brand.words],['name empty',f=>f.brand.name=''],['initials long',f=>f.brand.initials='x'.repeat(13)],['sentence long',f=>f.brand.sentence='x'.repeat(301)],['body long',f=>f.brand.body='x'.repeat(501)],['word unknown',f=>f.brand.words[0].extra=true],
 ['option value repeated',f=>f.questions[0].options[1].value=f.questions[0].options[0].value],['too many recommended',f=>f.questions[0].options[2].recommendation='Another'],
 ['null board content',f=>f.questions[0].options[0].board.content=null],['unknown board field',f=>f.questions[0].options[0].board.font='remote'],['unknown pairing',f=>f.questions[0].options[0].board.pairing.id='missing'],['unknown palette',f=>f.questions[0].options[0].board.palette.id='missing'],['unknown graphics',f=>f.questions[0].options[0].board.graphicSet.id='missing'],['unknown container',f=>f.questions[0].options[0].board.container='missing'],['unknown donor',f=>f.questions[0].options[0].board.pairing.headingFrom='missing'],['disk font refused',f=>f.questions[0].options[0].board.pairing.bodyFrom={file:'remote',family:'A',weight:400}],
 ['bad mode',f=>f.questions[0].options[0].board.primaryMode='sepia'],['contrast failure',f=>f.questions[0].options[0].board.palette.overrides={light:{text:'#fff',ground:'#fff'}}],['duplicate shared copy',f=>f.questions[0].options[0].board.content.sentence='other'],
 ['action count 1',f=>f.actions.length=1],['action count 4',f=>f.actions.push(copy(f.actions[0]))],['needs absent',f=>delete f.actions[0].needs],['needs bad',f=>f.actions[0].needs='three'],['action duplicated',f=>f.actions[1].value=f.actions[0].value],['action unknown',f=>f.actions[0].href='url'],['lock with actions',f=>f.questions[0].pick=0],
 ['logo active',f=>f.brand.logo='<svg onload="evil()"></svg>'],['logo external',f=>f.brand.logo='<svg><use href="https://example.com/x"/></svg>'],['logo bad reference',f=>f.brand.logo='<svg><use href="#missing"/></svg>'],['logo too big',f=>f.brand.logo='<svg>'+ ' '.repeat(8192)+'</svg>']
];
for(const [name,change]of changes)test(`boards refusal: ${name}`,()=>{const f=boardForm();change(f);assert.equal(checkForm(f).ok,false,JSON.stringify(checkForm(f)));});
test('action needs are exact and published; empty picks allow another angle and stopping',()=>{
 for(const [needs,wanted]of [['one',[false,true,false,false]],['some',[false,true,true,true]],['any',[true,true,true,true]],['none',[true,false,false,false]]]){
  assert.deepEqual([0,1,2,3].map(n=>actionAllowed(needs,n)),wanted);
  const f=boardForm();f.actions[0].needs=needs;assert.equal(checkForm(f).ok,true);
 }
 assert.deepEqual(formJsonSchema().properties.actions.items.properties.needs.enum,['one','some','any','none']);
 assert.deepEqual([0,1,2,3].map(n=>actionAllowed('some',n,2)),[false,false,true,true]);
 assert.equal(actionAllowed('one',1,2),true);assert.equal(actionAllowed('any',0,2),true);assert.equal(actionAllowed('none',0,2),true);
});
for(const [name,get]of Object.entries(tapSets))test(`${name} looks options pass unchanged through form and schema`,()=>{
 const a=get(),r=select('looks',a,{check:true}),f=lookForm(a,r),before=copy(r.options);
 assert.equal(f.questions[0].options,r.options);assert.equal(r.options.length,8);
 assert.deepEqual(checkForm(f),{ok:true,problems:[]});assert.deepEqual(r.options,before);
 assert.equal(z.fromJSONSchema(formJsonSchema()).safeParse(f).success,true);
 for(const option of r.options){assert.deepEqual(Object.keys(option),['value','label','board']);assert.match(option.value,/^[a-z0-9][a-z0-9-]{0,39}$/);}
});
test('boards view defaults to board; looks allow numbered captions and refuse recommendations',()=>{
 const f=boardForm();f.questions[0].view='board';assert.equal(checkForm(f).ok,true);
 delete f.questions[0].options[0].label;assert.equal(checkForm(f).ok,false);
 f.questions[0].view='look';for(const o of f.questions[0].options)delete o.recommendation;
 assert.deepEqual(checkForm(f),{ok:true,problems:[]});
 f.questions[0].options[0].recommendation='A suggestion';assert.ok(checkForm(f).problems.some(p=>p.path.endsWith('.recommendation')));
});
test('boards minimum accepts each bound up to pick and survives template filling',()=>{
 for(const pick of [1,2,3])for(let min=1;min<=pick;min++){
  const f=boardForm();Object.assign(f.questions[0],{pick,min});assert.equal(checkForm(f).ok,true);
  assert.equal(z.fromJSONSchema(formJsonSchema()).safeParse(f).success,true);
 }
 const f=boardForm();f.questions[0].min=2;f.title='{{title}}';
 const filled=fillTemplate({...f,slots:{title:{about:'Progress line',max:80}}},{title:'Your looks'});
 assert.equal(filled.ok,true,JSON.stringify(filled));assert.equal(filled.form.questions[0].min,2);
});
test('board form size limit is still 65536 UTF-8 bytes',()=>{
 const f=boardForm();for(const o of f.questions[0].options)o.board.items.cardBack='😀'.repeat(1500);
 assert.ok(Buffer.byteLength(JSON.stringify(f))>65536);assert.ok(checkForm(f).problems.some(p=>p.path===''&&/65536/.test(p.message)));
});

test('schema admits long optional board copy that fits the form byte ceiling',()=>{
 const f=boardForm();f.questions[0].options.length=1;f.questions[0].options[0].board.content.markCaption='x'.repeat(1200);f.questions[0].options[0].board.content.never=Array.from({length:25},()=> 'A boundary.');
 assert.equal(checkForm(f).ok,true);assert.equal(z.fromJSONSchema(formJsonSchema()).safeParse(f).success,true);
});
test('min is refused above the number of boards',()=>{
 const a=tapSets[Object.keys(tapSets)[0]](),r=select('looks',a,{check:true}),f=lookForm(a,r);
 f.questions[0].options=f.questions[0].options.slice(0,1);f.questions[0].pick=3;f.questions[0].min=3;
 const result=checkForm(f);assert.equal(result.ok,false);
 assert.ok(result.problems.some(p=>p.path==='questions[0].min'&&/number of boards/.test(p.message)),JSON.stringify(result.problems));
});
