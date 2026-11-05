import '../../lib/tests/isolated-home.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {z} from 'zod';
import {checkForm,formJsonSchema} from '../scripts/format.js';
import {BOARD_KEYS,BOARD_DEFAULT_KEYS,resolveBoards} from '../scripts/boards.js';
import {depthOptions,depthSchema} from '../../Contact Sheet/scripts/board-depth.js';
import {depthSchema as bundledDepthSchema} from '../engine/boards-lib.js';
import {acceptedDepths,styleDepths} from '../../Contact Sheet/tests/depth-cases.js';
import {boardForm} from './board-fixtures.js';
const depth=()=>({background:'gradient',groundTo:'ground',groundThird:'ground',gradient:'radial',angle:92,
 texture:'grain',block:{corner:'pill',gradient:true,inset:'darker'},popTo:'pop',card:{corner:28},
 band:'six',mark:'stack',stack:{on:'ground'},seal:{on:'block'},ink:'headline',allowHueShift:false});
function form(view='board') {
 const f=boardForm();f.questions[0].options.length=2;f.questions[0].view=view;
 if(view==='look')for(const o of f.questions[0].options)delete o.recommendation;
 return f;
}
for(const view of ['board','look'])test(`M5.1a: option depth passes ${view} form checks and reaches a detached model`,()=>{
 const f=form(view),options=f.questions[0].options,plain=resolveBoards(f.brand,options);
 options[1].board.depth=depth();const before=structuredClone(f);
 assert.deepEqual(checkForm(f),{ok:true,problems:[]});
 const model=resolveBoards(f.brand,options);
 assert.deepEqual(model.boards[1].depth,options[1].board.depth);
 assert.deepEqual(model.boards[0],plain.boards[0]);
 assert.equal(Object.hasOwn(model.boards[0],'depth'),false);
 assert.deepEqual(f,before);
 assert.notEqual(model.boards[1].depth,options[1].board.depth);
 assert.notEqual(model.boards[1].depth.block,options[1].board.depth.block);
 model.boards[1].depth.block.corner=0;assert.deepEqual(f,before);
});
for(const [label,bad]of [['unknown key',{unexpected:true}],['null field',{band:null}]])test(`M5.1a: ${label} reports the validator's depth message at that option's board`,()=>{
 const f=form(),options=f.questions[0].options;
 const b=resolveBoards(f.brand,options).boards[1];
 let message;try{depthOptions({...b,depth:bad});assert.fail('Expected invalid depth');}catch(e){message=e.message;}
 assert.match(message,/depth\./);assert.match(message,/Correct depth in TOOL\.md/);
 options[1].board.depth=bad;
 const result=checkForm(f);assert.equal(result.ok,false);
 assert.deepEqual(result.problems.map(p=>p.path),['questions[0].options[1].board']);
 assert.ok(result.problems[0].message.includes(message),JSON.stringify(result.problems));
 assert.throws(()=>resolveBoards(f.brand,options),e=>e.message.includes(message));
});
test('M5.1a: depth belongs to each option and is refused in boardDefaults',()=>{
 const f=form(),options=f.questions[0].options;options[1].board.depth=depth();
 assert.deepEqual(checkForm(f),{ok:true,problems:[]});
 assert.ok(BOARD_KEYS.includes('depth'));assert.ok(!BOARD_DEFAULT_KEYS.includes('depth'));
 f.boardDefaults={depth:options[1].board.depth};delete options[1].board.depth;
 assert.ok(checkForm(f).problems.some(p=>p.path==='boardDefaults.depth'&&/Unknown key/.test(p.message)));
 assert.throws(()=>resolveBoards(f.brand,options,f.boardDefaults),/Unknown boardDefaults field depth/);
 assert.equal(z.fromJSONSchema(formJsonSchema()).safeParse(f).success,false);
});
test('M5.1a: the option schema describes depth by its authoritative table',()=>{
 const schema=formJsonSchema(),board=schema.properties.questions.items.properties.options.items.properties.board;
 assert.equal(board.properties.depth?.type,'object');
 assert.match(board.properties.depth.description,/Contact Sheet.*closed depth schema/);
 assert.match(board.properties.depth.description,/depth table.*tools\/Form\/TOOL\.md/);
 assert.equal(Object.hasOwn(schema.properties.boardDefaults.properties,'depth'),false);
 const f=form();f.questions[0].options[1].board.depth=depth();
 assert.equal(z.fromJSONSchema(schema).safeParse(f).success,true);
});

const publishedDepth=()=>formJsonSchema().properties.questions.items.properties.options.items.properties.board.properties.depth;
function fields(value,path=[],result=new Map()) {
 for(const [key,child] of Object.entries(value)) {
  const parts=[...path,key],name=parts.join('.');
  if(!result.has(name))result.set(name,[]);
  if(child!==undefined)result.get(name).push(child);
  if(child&&typeof child==='object'&&!Array.isArray(child))fields(child,parts,result);
 }
 return result;
}
function schemaFields(schema,path=[],result=new Map()) {
 for(const [key,child] of Object.entries(schema.properties)) {
  const parts=[...path,key];result.set(parts.join('.'),child);
  if(child.type==='object')schemaFields(child,parts,result);
 }
 return result;
}
function atDepth(value,path,choice) {
 const copy=structuredClone(value),parts=path.split('.'),last=parts.pop();
 const parent=parts.reduce((o,k)=>o[k],copy);parent[last]=choice;return copy;
}
test('M5.1b: the published closed depth schema comes from the frozen bundled validator schema',()=>{
 const {description,...schema}=publishedDepth();
 assert.deepEqual(schema,depthSchema);
 assert.deepEqual(bundledDepthSchema,depthSchema);
 assert.match(description,/colour, gradient and contrast rules/);
 function optionalClosed(s) {
  assert.equal(s.additionalProperties,false);assert.deepEqual(s.required,[]);
  for(const child of Object.values(s.properties))if(child.type==='object')optionalClosed(child);
 }
 optionalClosed(schema);
 // Form callers get a detached mutable copy, including nested enums and objects.
 schema.properties.block.properties.corner.enum.push('other');
 schema.properties.seal.properties.on.enum[0]='other';
 schema.properties.band.enum.push('other');schema.properties.other={type:'string'};
 assert.deepEqual((({description,...s})=>s)(publishedDepth()),depthSchema);
});
test('M5.1b: every accepted depth key and enum value matches the published schema in both directions',()=>{
 const schema=publishedDepth(),published=schemaFields(schema),accepted=new Map();
 for(const value of acceptedDepths)fields(value,[],accepted);
 assert.deepEqual([...published.keys()].sort(),[...accepted.keys()].sort());
 const validator=z.fromJSONSchema(schema),formValidator=z.fromJSONSchema(formJsonSchema());
 const f=form(),b=resolveBoards(f.brand,f.questions[0].options).boards[1];
 const choices=values=>[...new Set(values.map(v=>JSON.stringify(v)))].sort();
 for(const [path,field] of published) {
  if(!field.enum)continue;
  assert.deepEqual(choices(field.enum),choices(accepted.get(path)),path);
  for(const choice of field.enum) {
   // All active gradient endpoints resolve to their starting palette role.
   const d=atDepth(depth(),path,choice);b.depth=d;
   assert.doesNotThrow(()=>depthOptions(b),`${path}=${JSON.stringify(choice)}`);
   assert.equal(validator.safeParse(d).success,true,path);
   f.questions[0].options[1].board.depth=d;
   assert.deepEqual(checkForm(f),{ok:true,problems:[]},path);
   assert.equal(formValidator.safeParse(f).success,true,path);
  }
  const first=field.enum[0],off=typeof first==='number'?first+1:String(first)+'-other';
  assert.ok(!field.enum.includes(off));
  const bad=atDepth(depth(),path,off);b.depth=bad;
  assert.throws(()=>depthOptions(b),e=>e.message.startsWith(`depth.${path} must be `),path);
  assert.equal(validator.safeParse(bad).success,false,path);
 }
 // Removing a key from the schema or admitting another at any level is caught.
 for(const [path,field] of [['',schema],...published].filter(([,s])=>s.type==='object')) {
  const unknown=path?atDepth(depth(),path,{unsupported:true}):{...depth(),unsupported:true};b.depth=unknown;
  assert.throws(()=>depthOptions(b),/unsupported is not supported/,path);
  assert.equal(validator.safeParse(unknown).success,false,path);
  const empty=path?atDepth({},path,{}):{};b.depth=empty;
  assert.doesNotThrow(()=>depthOptions(b),path);assert.equal(validator.safeParse(empty).success,true,path);
  assert.deepEqual(field.required,[]);
 }
});
test('M5.1b: non-enum depth fields publish their accepted types and refuse wrong types',()=>{
 const schema=publishedDepth(),published=schemaFields(schema),validator=z.fromJSONSchema(schema);
 const expected={angle:'number',allowHueShift:'boolean','block.gradient':'boolean',groundTo:'string',groundThird:'string',popTo:'string'};
 assert.deepEqual(Object.fromEntries([...published].filter(([,s])=>s.type&&s.type!=='object').map(([k,s])=>[k,s.type])),expected);
 const f=form(),b=resolveBoards(f.brand,f.questions[0].options).boards[1];
 for(const [path,type] of Object.entries(expected)) {
  const values=type==='number'?[-720,-0.5,0,360,720]:type==='boolean'?[false,true]:['#abc','#AABBCC','ground','pop','panel','headline'];
  for(const value of values) {
   const d=atDepth(depth(),path,value);d.background='plain';d.block.gradient=false;
   if(path==='block.gradient'){d.popTo='pop';d.block.gradient=value;}
   b.depth=d;assert.doesNotThrow(()=>depthOptions(b),path);assert.equal(validator.safeParse(d).success,true,path);
  }
  for(const value of [null,{},[],...(type==='number'?['1',NaN,Infinity,-Infinity]:type==='boolean'?['true',1]:[1,false])]) {
   const bad=atDepth(depth(),path,value);b.depth=bad;
   assert.throws(()=>depthOptions(b),e=>e.message.startsWith(`depth.${path} must `),path);
   assert.equal(validator.safeParse(bad).success,false,path);
  }
 }
});
test('M5.1b: zod accepts forms carrying every existing style depth and accepted contract case',()=>{
 const validator=z.fromJSONSchema(formJsonSchema()),f=form();
 for(const d of [...acceptedDepths,...styleDepths]) {
  // Undefined is an absent validator field; Form carries only JSON data.
  f.questions[0].options[1].board.depth=JSON.parse(JSON.stringify(d));
  assert.deepEqual(checkForm(f),{ok:true,problems:[]},JSON.stringify(d));
  assert.equal(validator.safeParse(f).success,true,JSON.stringify(d));
 }
});
