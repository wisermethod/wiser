import { browserSecurityCases } from '../../render/tests/browser-security-cases.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeZip } from '../../lib/archive-core.js';
browserSecurityCases(new URL('../scripts/browser-core.js', import.meta.url));
test('a launch throw after a passing survey names sanitized runtime remediation',()=>{
  const dir=mkdtempSync(join(tmpdir(),'deck-launch-'));
  try {
    const output=join(dir,'out.pdf');
    const run=spawnSync(process.execPath,['--import',fileURLToPath(new URL('../../render/tests/fixtures/failure-cli.mjs',import.meta.url)),fileURLToPath(new URL('../scripts/deck.js',import.meta.url)),'pdf','--input',fileURLToPath(new URL('./fixtures/shared/deck.zip',import.meta.url)),'--output',output],{encoding:'utf8',timeout:15000,env:{...process.env,RENDER_FAILURE:'launch',npm_config_offline:'true'}});
    assert.equal(run.status,1);assert.equal(run.stdout,'');assert.match(run.stderr,/Chromium cannot launch; check: node scripts\/deck.js check/);assert.equal(run.stderr.includes('private launch details'),false);assert.equal(existsSync(output),false);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
test('deck documentation describes the upload network boundary and current errors',()=>{
  const doc=readFileSync(new URL('../TOOL.md',import.meta.url),'utf8');
  assert.equal(doc.includes('Uploaded pages make no external requests.'),false);
  assert.equal(doc.includes('rendering needs network access'),false);
  assert.ok(doc.includes('deck must contain 1 to 24 slides.'));
  assert.ok(doc.includes('the browser could not export this deck'));
  assert.equal(doc.includes('no slides found in <path>'),false);
});
test('a CLI deck without sections prints the documented slide-count refusal',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'deck-empty-'));
  try {
    const input=join(dir,'deck.zip'),output=join(dir,'out.pdf');
    const html='<html><link rel="stylesheet" href="reveal.css"><div class="reveal"><div class="slides"></div></div><script src="reveal.js"></script><script>Reveal.initialize({width:320,height:180});</script></html>';
    writeFileSync(input,await writeZip([{name:'index.html',bytes:new TextEncoder().encode(html)}],{maxBytes:8388608}));
    const run=spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/deck.js',import.meta.url)),'pdf','--input',input,'--output',output],{encoding:'utf8',timeout:15000,env:{...process.env,npm_config_offline:'true'}});
    assert.equal(run.status,1);assert.equal(run.stdout,'');assert.equal(run.stderr.trim(),'Error: deck must contain 1 to 24 slides.');assert.equal(existsSync(output),false);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
