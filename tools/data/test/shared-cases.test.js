import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mainCli, offlineEnv } from '../../lib/tests/main-cli.js';
import { runData, checkDataOutput, MAX_INPUT_BYTES, MAX_OUTPUT_BYTES } from '../scripts/data-core.js';
const fixtures = new URL('./fixtures/', import.meta.url);
const cases = JSON.parse(readFileSync(new URL('cases.json', fixtures)));
const cleanup=[]; after(()=>cleanup.forEach(fn=>fn()));
const baseline=mainCli({after:fn=>cleanup.push(fn)},'data');
const cli=fileURLToPath(new URL('../scripts/data.js',import.meta.url));
for(const c of cases) test(`shared: ${c.name}`,async t=>{
  const dir=mkdtempSync(join(tmpdir(),'data-shared-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const file=join(dir,'input.txt'),output=join(dir,'chart.html');
  const bytes=new Uint8Array(readFileSync(new URL(c.file,fixtures)));
  writeFileSync(file,bytes);
  const args=[c.input.command,'--file',file,...c.args,...(c.output?['--output',output,'--overwrite']:[])];
  const options={encoding:'utf8',env:offlineEnv()};
  const run=spawnSync(process.execPath,[cli,...args],options);
  if(!c.change){
    const old=spawnSync(process.execPath,[baseline,...args],options);
    for(const key of ['status','stdout','stderr'])assert.equal(run[key],old[key],`main CLI ${key} bytes`);
  }
  const expected=JSON.parse(readFileSync(new URL(c.expected,fixtures)));
  if(c.change && expected.error){
    await assert.rejects(runData(c.input,[{name:c.file,mediaType:'text/plain',bytes}]),{message:expected.error});
    assert.equal(run.status,1);assert.equal(run.stdout,'');assert.equal(run.stderr,expected.error+'\n');
    return;
  }
  assert.equal(run.status,0,run.stderr);
  const result=await runData(c.input,[{name:c.file,mediaType:'text/plain',bytes}]);
  const answer=c.output?result.answer:result;
  assert.deepEqual(answer,expected);
  const local=JSON.parse(run.stdout);if(c.output)local.output='chart.html';
  assert.deepEqual(local,expected);
  if(c.output){
    const html=readFileSync(new URL(c.output,fixtures));
    assert.deepEqual(readFileSync(output),html);
    assert.deepEqual(result.files[0].bytes,new Uint8Array(html));
  }
});
test('portable graph: all shared cases without Node imports or globals',()=>{
  const run=spawnSync(process.execPath,['--experimental-vm-modules',fileURLToPath(new URL('./fixtures/portable-cases.mjs',import.meta.url))],{encoding:'utf8',timeout:15000});
  assert.equal(run.status,0,run.stderr);assert.equal(run.stdout.trim(),`portable: ${cases.length}`);
});
test('caps and malformed envelopes refuse whole; exact boundaries fit',async t=>{
  const file=bytes=>[{name:'input.json',mediaType:'application/json',bytes}];
  await assert.rejects(runData({command:'parse'},[]),/exactly one file/);
  await assert.rejects(runData({command:'parse'},file('text')),/Uint8Array/);
  await assert.rejects(runData({command:'join'},[]),/hosted data command/);
  await assert.rejects(runData({command:'compute',op:'rate',aField:'a',bField:'b',digits:21},[]),/digits/);
  await assert.rejects(runData({command:'parse'},file(new Uint8Array(MAX_INPUT_BYTES+1))),/exceeds 8 MiB/);
  const exact=new Uint8Array(MAX_INPUT_BYTES).fill(32);
  assert.equal((await runData({command:'parse'},file(exact))).rowCount,0);
  assert.equal(checkDataOutput('a'.repeat(47998)).length,47998);
  assert.throws(()=>checkDataOutput('a'.repeat(47999)),/48,000/);
  assert.equal(checkDataOutput({answer:{},files:[{bytes:new Uint8Array(MAX_OUTPUT_BYTES)}]}).files.length,1);
  assert.throws(()=>checkDataOutput({answer:{},files:[{bytes:new Uint8Array(MAX_OUTPUT_BYTES)},{bytes:new Uint8Array(1)}]}),/4 MiB/);
  const wide='n\n'+'x'.repeat(48000)+'\n';
  await assert.rejects(runData({command:'parse'},file(new TextEncoder().encode(wide))),/48,000/);
  const dir=mkdtempSync(join(tmpdir(),'data-caps-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const input=join(dir,'input.csv'),output=join(dir,'chart.html');writeFileSync(input,exact);
  writeFileSync(input,new Uint8Array(MAX_INPUT_BYTES+1));
  const run=spawnSync(process.execPath,[cli,'chart','--file',input,'--x','x','--y','y','--output',output],{encoding:'utf8',env:offlineEnv()});
  assert.equal(run.status,1);assert.match(run.stderr,/exceeds 8 MiB/);assert.equal(run.stdout,'');assert.equal(existsSync(output),false);
});
test('real oversized answers and chart files publish no partial output',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'data-output-cap-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const input=join(dir,'input.csv'),output=join(dir,'chart.html');
  const content='x,y\n'+'a,1\n'.repeat(30000);
  const bytes=new TextEncoder().encode(content);
  await assert.rejects(runData({command:'chart',x:'x',y:'y'},[{name:'input.csv',mediaType:'text/csv',bytes}]),/4 MiB/);
  writeFileSync(input,content);
  const run=spawnSync(process.execPath,[cli,'chart','--file',input,'--x','x','--y','y','--output',output],{encoding:'utf8',env:offlineEnv()});
  assert.equal(run.status,1);assert.match(run.stderr,/4 MiB/);assert.equal(run.stdout,'');assert.equal(existsSync(output),false);
  writeFileSync(input,'x\n'+'a'.repeat(48000)+'\n');
  const profile=spawnSync(process.execPath,[cli,'parse','--file',input],{encoding:'utf8',env:offlineEnv()});
  assert.equal(profile.status,1);assert.match(profile.stderr,/48,000/);assert.equal(profile.stdout,'');
});
test('the row-by-column budget accepts its boundary and caps sparse JSON quickly',async()=>{
  const bytes=new TextEncoder().encode('a,b,c,d,e\n'+'1,2,3,4,5\n'.repeat(50000));
  for(const input of [{command:'parse'},{command:'describe'},{command:'aggregate',groupBy:['a'],metrics:[{column:'b',function:'sum'}]}]){
    const start=performance.now();
    const answer=await runData(input,[{name:'boundary.csv',mediaType:'text/csv',bytes}]);
    assert.ok(performance.now()-start<15000);assert.equal(answer.totalRows??answer.rowCount,50000);
  }
  const sparse=new TextEncoder().encode(JSON.stringify(Array.from({length:20000},(_,i)=>({['n'+i]:i}))));
  const start=performance.now();
  await assert.rejects(runData({command:'describe'},[{name:'sparse.json',mediaType:'application/json',bytes:sparse}]),/250,000/);
  assert.ok(performance.now()-start<15000);
});
test('CLI passes original bytes when replacement decoding expands invalid UTF-8',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'data-byte-parity-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const bytes=new Uint8Array(3*1024*1024).fill(0xff);bytes.set(new TextEncoder().encode('x\n1,'));
  const file=join(dir,'invalid.csv');writeFileSync(file,bytes);
  const args=['parse','--file',file],options={encoding:'utf8',env:offlineEnv()};
  const old=spawnSync(process.execPath,[baseline,...args],options),run=spawnSync(process.execPath,[cli,...args],options);
  for(const key of ['status','stdout','stderr'])assert.equal(run[key],old[key],`main CLI ${key} bytes`);
  assert.equal(run.status,0,run.stderr);
  assert.equal(JSON.stringify(await runData({command:'parse'},[{name:'invalid.csv',mediaType:'text/csv',bytes}]))+'\n',run.stdout);
});
