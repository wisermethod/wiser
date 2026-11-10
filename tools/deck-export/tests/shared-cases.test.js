import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { launch } from '../../lib/browser-runtime/browser-runtime.js';
import { readZip } from '../../lib/archive-core.js';
import { revealAssets } from '../scripts/package-assets.js';
import { upload } from './fixtures/upload.mjs';
import { portable } from './portable-loader.js';
const fixtures=new URL('./fixtures/shared/',import.meta.url);
const cases=JSON.parse(readFileSync(new URL('cases.json',fixtures)));
let browser,core;
before(async()=>{browser=await launch();core=await portable(new URL('../scripts/export-core.js',import.meta.url));});
after(async()=>{await browser?.close();});
for(const c of cases)test(c.name,async()=>{
  const scratch=mkdtempSync(join(tmpdir(),'deck-shared-'));
  try{
    const expected=JSON.parse(readFileSync(new URL(c.expected,fixtures))),file=await upload(c);
    const run=c.command==='pdf'?core.exportPdf:core.exportPng;
    let output;
    const start=performance.now();
    if(expected.error)await assert.rejects(run(c.input,[file],{browser,revealAssets:revealAssets(),responseBody:bytes=>Buffer.from(bytes)}),{message:expected.error});
    else{
      output=await run(c.input,[file],{browser,revealAssets:revealAssets(),responseBody:bytes=>Buffer.from(bytes)});
      assert.deepEqual(JSON.parse(JSON.stringify(output.answer)),expected);
      assert.ok(output.files[0].bytes.length<4194304);
      if(c.command==='pdf')assert.equal(new TextDecoder().decode(output.files[0].bytes.subarray(0,5)),'%PDF-');
      else {const pictures=await readZip(output.files[0].bytes,{maxBytes:4194304});assert.equal(pictures.length,expected.slides);}
    }
    const coreMs=performance.now()-start;
    const input=join(scratch,'deck.zip'),destination=join(scratch,c.command==='pdf'?'deck.pdf':'slides.zip');writeFileSync(input,file.bytes);
    const args=[fileURLToPath(new URL('../scripts/deck.js',import.meta.url)),c.command,'--input',input,'--output',destination];
    for(const [key,value]of Object.entries(c.input))args.push('--'+key,String(value));
    const cliStart=performance.now();
    const cli=spawnSync(process.execPath,args,{encoding:'utf8',timeout:65000,env:{...process.env,npm_config_offline:'true'}});
    assert.equal(cli.status,expected.error?1:0,cli.stderr);
    if(expected.error){assert.equal(cli.stdout,'');assert.equal(cli.stderr.trim(),expected.error);assert.equal(existsSync(destination),false);}
    else{
      assert.equal(cli.stderr,'');const answer=JSON.parse(cli.stdout);answer.output=c.command==='pdf'?'deck.pdf':'slides.zip';assert.deepEqual(answer,expected);
      if(c.command==='png')assert.ok(Buffer.from(output.files[0].bytes).equals(readFileSync(destination)),'ZIP and PNG bytes identical through both hosts');
      else assert.equal((readFileSync(destination,'latin1').match(/\/Type \/Page\b/g)||[]).length,expected.slides);
    }
    if(c.slides===24)console.log(JSON.stringify({case:c.name,coreMs:Math.round(coreMs),cliMs:Math.round(performance.now()-cliStart),outputBytes:output.files[0].bytes.length}));
  }finally{rmSync(scratch,{recursive:true,force:true});}
});
