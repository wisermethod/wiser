import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateBrandBoards} from '../scripts/brand-boards.js';
import {createBoardModel} from '../scripts/board-model.js';
import {acceptedDepths,rejectedDepths,gradientCases,styleDepths} from './depth-cases.js';
const fixtures=fileURLToPath(new URL('fixtures/',import.meta.url));
const fixture=()=>JSON.parse(readFileSync(resolve(fixtures,'brand-boards.json')));
function validate(spec) {
 return validateBrandBoards(spec,{add(path){const full=resolve(fixtures,path);return {extension:extname(full),uri:'data:font/ttf;base64,'+readFileSync(full).toString('base64')};}},()=>{});
}
function withDepth(depth) {const spec=fixture();spec.boards=spec.boards.slice(0,1);spec.groups=spec.groups.filter(g=>g.id===spec.boards[0].group);spec.boards[0].depth=structuredClone(depth);return spec;}
test('depth closed schema accepts every choice and rejects every unsupported key, value and effect',()=>{
 for(const depth of acceptedDepths)assert.deepEqual(validate(withDepth(depth)).boards[0].depth,depth);
 for(const [depth,error] of rejectedDepths)assert.throws(()=>validate(withDepth(depth)),error,JSON.stringify(depth));
 for(const depth of styleDepths)assert.deepEqual(validate(withDepth(depth)).boards[0].depth,depth);
});
test('depth checks all listed colours and pairwise ground/block gradient rules without changing other checks',()=>{
 for(const [from,to,allowHueShift,error] of gradientCases)for(const surface of ['ground','block','third']) {
  // Supply independent listed stops, without changing the board's contrast-tested palette.
  const depth=surface==='block'?{block:{gradient:true},popTo:to,allowHueShift}:{background:'gradient',groundTo:surface==='third'?'ground':to,...(surface==='third'?{groundThird:to}:{}),allowHueShift};
  const spec=withDepth(depth),mode=spec.boards[0].primaryMode;
  const role=surface==='block'?'pop':'ground';
  // Only the depth check is expected to diagnose these palette changes; other failures remain visible.
  spec.boards[0].palette[mode][role]=from;
  if(error)assert.throws(()=>validate(spec),error);
  else {try{validate(spec);}catch(e){assert.doesNotMatch(e.message,/depth|purple-to-blue|must be tonal/);}}
 }
 const invalid=withDepth({});invalid.boards[0].tags={paletteLoudness:3,typeLoudness:1,typeCut:'period'};
 assert.throws(()=>validate(invalid),/type-to-colour mismatch/);
 const gradientText=withDepth({});gradientText.boards[0].palette.light.headline='url(#text)';
 assert.throws(()=>validate(gradientText),/opaque sRGB/);
});
test('model carries detached depth unchanged, omits absent depth and drops no other model data',()=>{
 const spec=fixture(),base=createBoardModel(validate(spec));
 const depth={...styleDepths[1],ink:'deep',groundThird:'#fff',allowHueShift:true};spec.boards[0].depth=depth;
 const valid=validate(spec),model=createBoardModel(valid);
 assert.deepEqual(model.boards[0].depth,depth);assert.notEqual(model.boards[0].depth,depth);
 assert.equal(Object.hasOwn(model.boards[1],'depth'),false);
 delete model.boards[0].depth;assert.deepEqual(model,base);
 const copy=createBoardModel(valid);copy.boards[0].depth.block.corner=0;
 assert.equal(valid.boards[0].depth.block.corner,'pill');assert.equal(depth.block.corner,'pill');
});
