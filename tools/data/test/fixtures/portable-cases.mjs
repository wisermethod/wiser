import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadPortable } from './portable.mjs';
const core=await loadPortable(new URL('../../scripts/data-core.js',import.meta.url));
const fixtures=new URL('./',import.meta.url);
const cases=JSON.parse(readFileSync(new URL('cases.json',fixtures)));
for(const c of cases){
 const expected=JSON.parse(readFileSync(new URL(c.expected,fixtures)));
 const files=[{name:c.file,mediaType:'text/plain',bytes:new Uint8Array(readFileSync(new URL(c.file,fixtures)))}];
 if(c.change && expected.error)await assert.rejects(core.runData(c.input,files),{message:expected.error});
 else{
  const result=await core.runData(c.input,files);
  assert.equal(JSON.stringify(c.output?result.answer:result),JSON.stringify(expected));
  if(c.output)assert.deepEqual(result.files[0].bytes,new Uint8Array(readFileSync(new URL(c.output,fixtures))));
 }
}
console.log(`portable: ${cases.length}`);
