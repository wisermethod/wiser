import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { mainCli, offlineEnv } from '../../lib/tests/main-cli.js';
import { checkDashes, MAX_INPUT_BYTES } from '../scripts/dashes-core.js';
const fixtures=new URL('./fixtures/',import.meta.url);
const cases=JSON.parse(readFileSync(new URL('cases.json',fixtures)));
const cleanup=[];after(()=>cleanup.forEach(fn=>fn()));
const baseline=mainCli({after:fn=>cleanup.push(fn)},'copy-check');
const cli=fileURLToPath(new URL('../scripts/copy-check.js',import.meta.url));
for(const c of cases)test(`shared: ${c.name}`,async t=>{
 const dir=realpathSync(mkdtempSync(join(tmpdir(),'copy-shared-')));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const file=join(dir,'copy.md'),bytes=new Uint8Array(readFileSync(new URL(c.file,fixtures)));
 writeFileSync(file,bytes);
 const args=['dashes','--copy',file],options={encoding:'utf8',env:offlineEnv()};
 const old=spawnSync(process.execPath,[baseline,...args],options),run=spawnSync(process.execPath,[cli,...args],options);
 for(const key of ['status','stdout','stderr'])assert.equal(run[key],old[key],`main CLI ${key} bytes`);
 const expected=JSON.parse(readFileSync(new URL(c.expected,fixtures)));
 const files=[{name:'$FILE',mediaType:'text/markdown',bytes}];
 if(expected.error){
  await assert.rejects(checkDashes(c.input,files),{message:expected.error});
  assert.equal(run.status,1);assert.equal(run.stdout,'');assert.equal(run.stderr.trim().replaceAll(file,'$FILE'),expected.error);
 }else{
  assert.deepEqual(await checkDashes(c.input,files),expected);
  assert.equal(run.stdout,JSON.stringify(expected)+'\n');assert.equal(run.stderr,'');assert.equal(run.status,0);
 }
});
test('portable graph runs all saved cases without Node modules or globals',()=>{
 const script=`
 import assert from 'node:assert/strict';
 import { readFileSync } from 'node:fs';
 import { portableModule } from ${JSON.stringify(new URL('../../lib/tests/portable-module.js',import.meta.url).href)};
 const core=await portableModule(${JSON.stringify(fileURLToPath(new URL('../scripts/dashes-core.js',import.meta.url)))});
 const fixtures=new URL(${JSON.stringify(fixtures.href)});
 const cases=JSON.parse(readFileSync(new URL('cases.json',fixtures)));
 for(const c of cases){
  const expected=JSON.parse(readFileSync(new URL(c.expected,fixtures)));
  const files=[{name:'$FILE',mediaType:'text/markdown',bytes:new Uint8Array(readFileSync(new URL(c.file,fixtures)))}];
  if(expected.error)await assert.rejects(core.checkDashes(c.input,files),{message:expected.error});
  else assert.equal(JSON.stringify(await core.checkDashes(c.input,files)),JSON.stringify(expected));
 }
 console.log('portable: '+cases.length);`;
 const run=spawnSync(process.execPath,['--experimental-vm-modules','--input-type=module','-e',script],{encoding:'utf8',timeout:15000});
 assert.equal(run.status,0,run.stderr);assert.equal(run.stdout.trim(),`portable: ${cases.length}`);
});
test('file and answer caps refuse whole, including through the CLI',async t=>{
 const file=bytes=>[{name:'copy.md',mediaType:'text/markdown',bytes}];
 await assert.rejects(checkDashes({},[]),/exactly one file/);
 await assert.rejects(checkDashes({command:'overlap'},file(new Uint8Array())),/only dashes/);
 await assert.rejects(checkDashes({other:true},file(new Uint8Array())),/no other arguments/);
 await assert.rejects(checkDashes({},file(new Uint8Array(MAX_INPUT_BYTES+1))),/64 KiB/);
 const exact=new Uint8Array(MAX_INPUT_BYTES).fill(32);
 assert.equal((await checkDashes({},file(exact))).characters,MAX_INPUT_BYTES);
 const many=new TextEncoder().encode('—'.repeat(1000));
 await assert.rejects(checkDashes({},file(many)),/48,000/);
 const dir=mkdtempSync(join(tmpdir(),'copy-caps-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const input=join(dir,'copy.md');
 for(const [bytes,reason] of [[new Uint8Array(MAX_INPUT_BYTES+1),/64 KiB/],[many,/48,000/]]){
  writeFileSync(input,bytes);
  const run=spawnSync(process.execPath,[cli,'dashes','--copy',input],{encoding:'utf8',env:offlineEnv()});
  assert.equal(run.status,1);assert.equal(run.stdout,'');assert.match(run.stderr,reason);
 }
});
test('the capped parser finishes dense input within the declared budget',async()=>{
 // Unmatched curly openers exercise the parser's longest quotation search.
 const bytes=new TextEncoder().encode('“'.repeat(Math.floor(MAX_INPUT_BYTES/3)));
 const start=performance.now();
 const result=await checkDashes({},[{name:'dense.md',mediaType:'text/markdown',bytes}]);
 assert.equal(result.control.fired,true);assert.ok(performance.now()-start<15000);
});
