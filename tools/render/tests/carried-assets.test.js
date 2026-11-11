import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { toolCopy, assertPinnedCopy } from '../../lib/tests/carried-copy.js';
test('carried Mermaid renders a PNG without tool packages or consent, even with a proxy', t => {
  const f = toolCopy(t,'render'), input = join(f.root,'graph.mmd'), output = join(f.root,'graph.png');
  writeFileSync(input,'graph LR; A-->B');
  const out = f.run(['mermaid','--file',input,'--output',output,'--scale','1'], { imports:[f.preload], environment:{...f.env,HTTPS_PROXY:'http://proxy.test:8080'} });
  assert.equal(out.status,0,out.stderr); assert.equal(out.stderr,'');
  assert.equal(JSON.parse(out.stdout).path,output);
  assert.equal(readFileSync(output).subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  const manifest = JSON.parse(readFileSync(join(f.tool,'vendor/manifest.json')));
  const bytes = readFileSync(join(f.tool,'vendor/mermaid/mermaid.min.js'));
  assert.equal(manifest.version,'10.9.6');
  assert.equal(manifest.files.find(file=>file.path==='mermaid/mermaid.min.js').sha256,createHash('sha256').update(bytes).digest('hex'));
});
test('missing browser still asks only for browser code and Chromium, never Mermaid', t => {
  const f = toolCopy(t,'render'), input = join(f.root,'graph.mmd'); writeFileSync(input,'graph LR; A-->B');
  const out = f.run(['mermaid','--file',input,'--output',join(f.root,'out.png')], { environment:f.isolatedEnv });
  assert.equal(out.status,1); assert.equal(out.stdout,'');
  assert.match(out.stderr,/^This Wiser skill needs to download and install the code that drives a browser/);
  assert.doesNotMatch(out.stderr,/Mermaid diagram library|mermaid and its dependencies/);
});

test('altered carried Mermaid is refused before browser probing or output', t => {
  const f=toolCopy(t,'render'), input=join(f.root,'graph.mmd'), output=join(f.root,'out.png');
  writeFileSync(input,'graph LR; A-->B');
  const path=join(f.tool,'vendor/mermaid/mermaid.min.js');
  writeFileSync(path,readFileSync(path)+' ');
  const out=f.run(['mermaid','--file',input,'--output',output],{environment:f.isolatedEnv});
  assert.equal(out.status,1); assert.equal(out.stdout,'');
  assert.match(out.stderr,/Restore this plugin copy/);
  assert.throws(()=>readFileSync(output),{code:'ENOENT'});
});

test('paired carried and manifest edits are rejected by the pinned-package builder check', t => assertPinnedCopy(t, 'render'));
