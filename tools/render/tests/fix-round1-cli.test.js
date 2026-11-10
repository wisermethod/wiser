import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const cli=fileURLToPath(new URL('../scripts/render.js',import.meta.url));
for(const [code,text] of [['ENOTFOUND','the host in --url did not resolve'],['ECONNREFUSED','the host refused the connection'],['CERT_HAS_EXPIRED','the TLS certificate was rejected']]) test(`URL CLI restores ${code} diagnosis without engine text`,()=>{
  const dir=mkdtempSync(join(tmpdir(),'render-errors-'));
  try {
    const output=join(dir,'out.png');
    const run=spawnSync(process.execPath,['--import',fileURLToPath(new URL('./fixtures/failure-cli.mjs',import.meta.url)),cli,'url','--url','https://public.example','--output',output],{encoding:'utf8',timeout:15000,env:{...process.env,RENDER_FAILURE:code,npm_config_offline:'true'}});
    assert.equal(run.status,1);assert.equal(run.stdout,'');assert.ok(run.stderr.includes(text),run.stderr);assert.equal(run.stderr.includes('private engine text'),false);assert.equal(existsSync(output),false);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
test('URL CLI enforces and documents the 45000 ms cap',()=>{
  const dir=mkdtempSync(join(tmpdir(),'render-timeout-'));
  try {
    const run=spawnSync(process.execPath,['--import',fileURLToPath(new URL('./fixtures/failure-cli.mjs',import.meta.url)),cli,'url','--url','https://public.example','--output',join(dir,'out.png'),'--timeout','60000'],{encoding:'utf8',timeout:15000,env:{...process.env,npm_config_offline:'true'}});
    assert.equal(run.status,1);assert.match(run.stderr,/--timeout.*45000/);
    const doc=readFileSync(new URL('../TOOL.md',import.meta.url),'utf8').split('## url\n')[1].split('\n## ')[0];
    assert.match(doc,/45000/);assert.match(doc,/Set-Cookie/);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
test('CLI destination screening uses the shared implementation',()=>{
  const source=readFileSync(new URL('../scripts/url-core.js',import.meta.url),'utf8');
  assert.match(source,/\.\.\/\.\.\/lib\/destination-core\.js/);
  assert.equal(existsSync(new URL('../scripts/lib/destination.js',import.meta.url)),false);
});
