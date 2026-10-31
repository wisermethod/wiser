import '../../../tools/lib/tests/isolated-home.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {select,formLogo} from '../scripts/select.mjs';
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

const multilineLogo='<svg\r\nxmlns="http://www.w3.org/2000/svg"\nviewBox="0 0 20 20">\n\t<circle\ncx="10"\tcy="10"\rr="8" fill="currentColor"/>\n</svg>\n';
function withLogo(svg,check){
 const work=mkdtempSync(join(tmpdir(),'brand-form-logo-')),markFile=join(work,'kept.svg');
 try { writeFileSync(markFile,svg);check(markFile);assert.equal(readFileSync(markFile,'utf8'),svg); }
 finally { rmSync(work,{recursive:true,force:true}); }
}
function formPage(command,a,options={}){
 return select(command,command==='variations'?{...a,picks:[],shown:[],steer:{}}:a,options);
}
for(const command of ['round1','variations'])for(const bytes of [8191,8192,8193])test(`${command}: a kept multiline SVG at ${bytes} UTF-8 bytes preserves its selection and obeys Form's logo cap`,()=>{
 const normalized=formLogo(multilineLogo),padding=bytes-Buffer.byteLength(normalized)-7;
 // Multibyte comment text keeps the character count below the byte cap even
 // in the oversized case. Size is measured after whitespace normalization.
 const svg=multilineLogo.replace('</svg>',`<!--${'é'.repeat(Math.floor(padding/2))}${' '.repeat(padding%2)}--></svg>`);
 assert.equal(Buffer.byteLength(formLogo(svg)),bytes);
 withLogo(svg,markFile=>{
  const a={...operator(),kept:{markFile}},before=structuredClone(a),r=formPage(command,a,{check:true});
  assert.deepEqual(a,before);assert.ok(r.selection.boards.every(b=>b.markFile===markFile));
  assert.ok(r.selection.boards.every(b=>!Object.hasOwn(b,'container')));
  if(bytes<=8192){
   assert.ok(r.form);assert.equal(r.form.brand.logo,formLogo(svg));
   assert.doesNotMatch(r.form.brand.logo,/[\n\r\t]/);assert.match(r.form.brand.logo,/<svg xmlns=/);
   assert.deepEqual(checkForm(r.form),{ok:true,problems:[]});
  }else{ assert.equal(r.form,null);assert.match(r.formUnavailable,/brand\.logo.*8192/); }
 });
});
for(const [label,svg,reason] of [
 ['active SVG','<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>',/brand\.logo.*SVG/],
 ['external SVG reference','<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.invalid/logo.png"/></svg>',/brand\.logo.*SVG/],
 ['malformed SVG','<svg><g></svg>',/brand\.logo.*SVG/],
 ...['\u0000','\u007f','\u0085','\u2028','\u2029'].map(control=>[`control U+${control.codePointAt(0).toString(16)}`,`<svg><!--${control}--></svg>`,/brand\.logo.*Control/])
])test(`a kept logo with ${label} makes Form unavailable without losing the mark`,()=>{
 withLogo(svg,markFile=>{
  const r=select('round1',{...operator(),kept:{markFile}});
  assert.equal(r.form,null);assert.match(r.formUnavailable,reason);
  assert.ok(r.selection.boards.every(b=>b.markFile===markFile));
 });
});

for(const command of ['round1','variations'])for(const [label,overrides,reason] of [
 ['an 81-character name',{name:'N'.repeat(81)},/brand\.name.*80/],
 ['a 301-character sentence',{sentence:'S'.repeat(301),heroPhrase:'S'},/brand\.sentence.*300/],
 ['a 501-character body',{body:'B'.repeat(501)},/brand\.body.*500/],
 ['six word pairs',{words:Array.from({length:6},()=>({word:'Useful',not:'busy'}))},/brand\.words.*5/],
 ['a 61-character word',{words:[{word:'W'.repeat(61),not:'busy'}]},/brand\.words\[0\]\.word.*60/],
 ['a 61-character not',{words:[{word:'Useful',not:'N'.repeat(61)}]},/brand\.words\[0\]\.not.*60/]
])test(`${command}: ${label} makes Form unavailable and preserves all supplied brand text`,()=>{
 const a={...operator(),...overrides},before=structuredClone(a),r=formPage(command,a);
 assert.equal(r.form,null);assert.match(r.formUnavailable,reason);assert.deepEqual(a,before);
 for(const b of r.selection.boards){
  assert.equal(b.content.brandName,a.name);assert.equal(b.content.sentence,a.sentence);
  assert.equal(b.content.body,a.body);assert.deepEqual(b.words,a.words);
 }
});
test('Form accepts its exact brand limits measured in code points, including five full word pairs',()=>{
 const a={...operator(),name:'𠮷'.repeat(80),sentence:'𠮷'.repeat(300),heroPhrase:'𠮷',body:'𠮷'.repeat(500),words:Array.from({length:5},()=>({word:'𠮷'.repeat(60),not:'𠮷'.repeat(60)}))};
 const r=select('round1',a,{check:true});assert.ok(r.form);assert.deepEqual(checkForm(r.form),{ok:true,problems:[]});
 assert.equal(r.form.brand.name,a.name);assert.equal(r.form.brand.sentence,a.sentence);
 assert.equal(r.form.brand.body,a.body);assert.deepEqual(r.form.brand.words,a.words);
});
test('the complete form is checked for the 65536-byte limit without truncating the selection',()=>{
 const a={...operator(),photoRules:'P'.repeat(65536)},r=select('round1',a,{check:true});
 assert.equal(r.form,null);assert.match(r.formUnavailable,/65536 UTF-8 bytes/);
 assert.ok(r.selection.boards.every(b=>b.content.photoRules===a.photoRules));
});
for(const type of [undefined,'personal','org','client','department'])test(`${type??'default personal'}: Round 1 and both variations paths use their journey progress lines`,()=>{
 const a={...operator(),...(type?{type}:{})},org=['org','client','department'].includes(type);
 const r=select('round1',a,{check:true});
 assert.equal(r.form.title,org?'Step 5 of 7: your boards':'Step 4 of 6: your boards');
 const before=structuredClone(r.selection);
 for(const picks of [[r.selection.boards[0]],[]]){
  const v=select('variations',{...a,picks,shown:r.selection.boards,steer:{}},{check:true});
  assert.equal(v.form.title,org?'Step 6 of 7: blend and tune':'Step 5 of 6: blend and tune');
  assert.deepEqual(checkForm(v.form),{ok:true,problems:[]});
 }
 assert.deepEqual(r.selection,before);
 assert.deepEqual(r.selection,select('round1',operator(),{check:true}).selection);
});
test('an unknown root type is refused rather than receiving a personal progress line',()=>{
 assert.throws(()=>select('round1',{...operator(),type:'company'}),/type.*personal.*org.*client.*department/);
});

// The card's mark draws the characters the file draws (review 20261031-165721).
test('a kept logo keeps its text as SVG renders it: newlines in text dropped, tabs a space, attribute whitespace one space each',()=>{
 assert.equal(formLogo('<svg><text>\nHello\nWorld\n</text></svg>'),'<svg><text>HelloWorld</text></svg>');
 assert.equal(formLogo('<svg><text>Hello\r\nWorld\tAgain</text></svg>'),'<svg><text>HelloWorld Again</text></svg>');
 assert.equal(formLogo('<svg\r\nviewBox="0 0\n20\t20"><g/>\n\t<g/></svg>'),'<svg viewBox="0 0 20 20"><g/> <g/></svg>');
 assert.equal(formLogo('<svg><text>A&#10;B</text></svg>'),'<svg><text>A&#10;B</text></svg>','character references are left alone');
});
for(const command of ['round1','variations'])test(`${command}: a kept mark with xml:space="preserve" makes Form unavailable without losing the mark`,()=>{
 withLogo('<svg xmlns="http://www.w3.org/2000/svg"><text xml:space="preserve">Hello\n\nWorld</text></svg>',markFile=>{
  const a={...operator(),kept:{markFile}},r=formPage(command,a);
  assert.equal(r.form,null);assert.match(r.formUnavailable,/xml:space/);
  assert.ok(r.selection.boards.every(b=>b.markFile===markFile));
 });
});
for(const command of ['round1','variations'])test(`${command}: a kept mark with a two-line text gives a valid form whose text matches the file`,()=>{
 withLogo('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20">\n <text x="2" y="14">\n  AF\n </text>\n</svg>\n',markFile=>{
  // --check, as the skill runs it, replaces a board the card's own checks refuse.
  const r=formPage(command,{...operator(),kept:{markFile}},{check:true});
  assert.ok(r.form,r.formUnavailable);assert.match(r.form.brand.logo,/<text x="2" y="14">  AF <\/text>/);
  assert.deepEqual(checkForm(r.form),{ok:true,problems:[]});
 });
});
