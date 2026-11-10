import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { mainCli, offlineEnv } from '../../lib/tests/main-cli.js';
import { analyzeHtml, MAX_INPUT_BYTES, MAX_MARKUP_OPENERS } from '../scripts/analyze-core.js';
const fixtures=new URL('./fixtures/',import.meta.url);
const cases=JSON.parse(readFileSync(new URL('cases.json',fixtures)));
const cleanup=[];after(()=>cleanup.forEach(fn=>fn()));
const baseline=join(dirname(mainCli({after:fn=>cleanup.push(fn)},'seo-page-analyzer')),'analyze.js');
const cli=fileURLToPath(new URL('../scripts/analyze.js',import.meta.url));
const clock=fileURLToPath(new URL('./fixtures/clock.mjs',import.meta.url));
for(const c of cases)test(`shared: ${c.name}`,async t=>{
 const dir=realpathSync(mkdtempSync(join(tmpdir(),'seo-shared-')));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const file=join(dir,'page.html'),bytes=new Uint8Array(readFileSync(new URL(c.file,fixtures)));
 writeFileSync(file,bytes);
 const args=['analyze','--html',file,'--page-url',c.input.url,...(c.input.keyword?['--keyword',c.input.keyword]:[])];
 const options={encoding:'utf8',env:offlineEnv()};
 const old=spawnSync(process.execPath,['--import',clock,baseline,...args],options);
 const run=spawnSync(process.execPath,['--import',clock,cli,...args],options);
 for(const key of ['status','stdout','stderr'])assert.equal(run[key],old[key],`main CLI ${key} bytes`);
 const expected=JSON.parse(readFileSync(new URL(c.expected,fixtures)));
 const files=[{name:c.file,mediaType:'text/html',bytes}];
 if(expected.error){
  await assert.rejects(analyzeHtml(c.input,files),{message:expected.error});
  assert.equal(run.status,1);assert.equal(run.stdout,'');assert.equal(run.stderr,expected.error+'\n');
 }else{
  assert.deepEqual(await analyzeHtml(c.input,files),expected);
  assert.equal(run.status,0);assert.equal(run.stderr,'');assert.equal(run.stdout,JSON.stringify(expected)+'\n');
 }
});
test('portable graph runs every saved case without Node modules or globals',()=>{
 const script=`
 import assert from 'node:assert/strict';
 import { readFileSync } from 'node:fs';
 import { portableModule } from ${JSON.stringify(new URL('../../lib/tests/portable-module.js',import.meta.url).href)};
 const core=await portableModule(${JSON.stringify(fileURLToPath(new URL('../scripts/analyze-core.js',import.meta.url)))});
 const fixtures=new URL(${JSON.stringify(fixtures.href)});
 const cases=JSON.parse(readFileSync(new URL('cases.json',fixtures)));
 for(const c of cases){
  const expected=JSON.parse(readFileSync(new URL(c.expected,fixtures)));
  const files=[{name:c.file,mediaType:'text/html',bytes:new Uint8Array(readFileSync(new URL(c.file,fixtures)))}];
  if(expected.error)await assert.rejects(core.analyzeHtml(c.input,files),{message:expected.error});
  else assert.equal(JSON.stringify(await core.analyzeHtml(c.input,files)),JSON.stringify(expected));
 }
 console.log('portable: '+cases.length);`;
 const run=spawnSync(process.execPath,['--experimental-vm-modules','--input-type=module','-e',script],{encoding:'utf8',timeout:15000});
 assert.equal(run.status,0,run.stderr);assert.equal(run.stdout.trim(),`portable: ${cases.length}`);
});
test('file, complexity and result caps refuse whole through core and CLI',async t=>{
 const input={url:'https://example.com/'},file=bytes=>[{name:'page.html',mediaType:'text/html',bytes}];
 await assert.rejects(analyzeHtml(input,file(new Uint8Array(MAX_INPUT_BYTES+1))),/1 MiB/);
 const exact=new Uint8Array(MAX_INPUT_BYTES).fill(32);
 assert.equal((await analyzeHtml(input,file(exact))).content.wordCount,0);
 assert.equal((await analyzeHtml(input,file(new TextEncoder().encode('<br>'.repeat(MAX_MARKUP_OPENERS))))).content.wordCount,0);
 const complex=new TextEncoder().encode('<'.repeat(MAX_MARKUP_OPENERS+1));
 await assert.rejects(analyzeHtml(input,file(complex)),/4,096/);
 const large=new TextEncoder().encode('<title>'+'a'.repeat(48000)+'</title>');
 await assert.rejects(analyzeHtml(input,file(large)),/48,000/);
 const dir=mkdtempSync(join(tmpdir(),'seo-caps-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const path=join(dir,'page.html');
 for(const [bytes,reason] of [[new Uint8Array(MAX_INPUT_BYTES+1),/1 MiB/],[complex,/4,096/],[large,/48,000/]]){
  writeFileSync(path,bytes);
  const run=spawnSync(process.execPath,[cli,'analyze','--html',path,'--page-url',input.url],{encoding:'utf8',env:offlineEnv()});
  assert.equal(run.status,1);assert.equal(run.stdout,'');assert.match(run.stderr,reason);
 }
});
test('malformed envelopes and arguments have plain refusals',async()=>{
 const file=[{name:'page.html',mediaType:'text/html',bytes:new Uint8Array()}],input={url:'https://example.com/'};
 for(const files of [[],[...file,...file],[{...file[0],bytes:'text'}]])await assert.rejects(analyzeHtml(input,files),/exactly one HTML file/);
 for(const fields of [{url:42},{keyword:42},{command:'fetch'},{analyzedAt:'invalid'},{other:true}])await assert.rejects(analyzeHtml({...input,...fields},file),/analyze needs/);
 await assert.rejects(analyzeHtml({},file),/--page-url is required/);
});
test('CLI path and usage refusals stay byte-identical',t=>{
 const dir=realpathSync(mkdtempSync(join(tmpdir(),'seo-local-')));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const file=join(dir,'page.html');writeFileSync(file,'<title>Page</title>');
 for(const args of [[],['help'],['bad'],['analyze'],['analyze','--html',file],['analyze','--html',file,'--page-url','https://example.com/','--bad'],['analyze','--html',dir,'--page-url','https://example.com/'],['analyze','--html','relative.html','--page-url','https://example.com/'],['analyze','--html',join(dir,'missing'),'--page-url','https://example.com/'],['analyze','--html',file,'--html',file,'--page-url','https://example.com/']]){
  const options={encoding:'utf8',env:offlineEnv()};
  const old=spawnSync(process.execPath,[baseline,...args],options),run=spawnSync(process.execPath,[cli,...args],options);
  for(const key of ['status','stdout','stderr'])assert.equal(run[key],old[key],`main CLI ${key} bytes`);
 }
});
test('capped malformed markup completes within the declared budget',async()=>{
 const html='<h1>'.repeat(MAX_MARKUP_OPENERS)+'a'.repeat(MAX_INPUT_BYTES-4*MAX_MARKUP_OPENERS);
 const bytes=new TextEncoder().encode(html),start=performance.now();
 const result=await analyzeHtml({url:'https://example.com/'},[{name:'malformed.html',mediaType:'text/html',bytes}]);
 assert.equal(result.headings.h1Count,0);assert.ok(performance.now()-start<15000);
});
