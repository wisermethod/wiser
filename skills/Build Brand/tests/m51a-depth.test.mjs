import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assembleCore} from '../scripts/assemble-core.mjs';
import {board,selection} from './selections.mjs';
const library=JSON.parse(readFileSync(new URL('../parts/parts.json',import.meta.url)));
const input=()=>selection([board(library)],library);
test('M5.1a: assembly copies optional depth unchanged and omits it when absent',()=>{
 const s=input(),plain=assembleCore(s,library);assert.equal(Object.hasOwn(plain.boards[0],'depth'),false);
 s.boards[0].depth={background:'texture',texture:'grain',block:{corner:24,inset:'lighter'},card:{corner:16},stack:{on:'ground'}};
 const before=structuredClone(s),out=assembleCore(s,library);
 assert.deepEqual(out.boards[0].depth,s.boards[0].depth);assert.deepEqual(s,before);
 for(const key of ['block','card','stack'])assert.notEqual(out.boards[0].depth[key],s.boards[0].depth[key]);
 out.boards[0].depth.block.corner=0;assert.deepEqual(s,before);
 delete out.boards[0].depth;assert.equal(JSON.stringify(out),JSON.stringify(plain));
 delete s.boards[0].depth;assert.equal(JSON.stringify(assembleCore(s,library)),JSON.stringify(plain));
});
test('M5.1a: assembly leaves depth validation to Contact Sheet',()=>{
 for(const depth of [null,{unexpected:true},{band:null}]){
  const s=input();s.boards[0].depth=depth;const before=structuredClone(s);
  const out=assembleCore(s,library);assert.deepEqual(out.boards[0].depth,depth);assert.deepEqual(s,before);
 }
});
