import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../../',import.meta.url));
const sourceRoot = process.env.WISER_TEST_SOURCE_ROOT || root;
test('self-contained HTML, SVG and Mermaid retain the baseline CLI image and JSON bytes', () => {
  const scratch=mkdtempSync(join(tmpdir(),'render-before-'));
  try {
    const scripts=join(scratch,'tools/render/scripts');mkdirSync(scripts,{recursive:true});
    const paths=execFileSync('git',['ls-tree','-r','--name-only','1f810776','--','tools/render/scripts'],{cwd:sourceRoot,encoding:'utf8'}).trim().split('\n').filter(path=>!path.includes('/__tests__/')&&!path.includes('/zArchive/'));
    for(const path of paths){const dest=join(scratch,path);mkdirSync(join(dest,'..'),{recursive:true});writeFileSync(dest,execFileSync('git',['show',`1f810776:${path}`],{cwd:sourceRoot}));}
    symlinkSync(join(sourceRoot,'tools/lib'),join(scratch,'tools/lib'),'dir');
    symlinkSync(join(sourceRoot,'tools/render/node_modules'),join(scratch,'tools/render/node_modules'),'dir');
    for(const [command,file,args,extension] of [['html','card.html',['--width','240','--height','100'],'png'],['html','card.html',['--width','240','--height','100'],'jpg'],['svg','picture.svg',[],'png'],['mermaid','graph.mmd',['--scale','1'],'png']]) {
      const source=join(scratch,file);writeFileSync(source,readFileSync(new URL(`./fixtures/shared/${file}`,import.meta.url)));
      const output=join(scratch,`out.${extension}`), flags=[command,command==='html'?'--input':'--file',source,'--output',output,'--overwrite',...args];
      const before=spawnSync(process.execPath,[join(scripts,'render.js'),...flags],{encoding:'utf8',timeout:65000,env:{...process.env,npm_config_offline:'true'}});
      assert.equal(before.status,0,before.stderr);const bytes=readFileSync(output);
      const after=spawnSync(process.execPath,[join(root,'tools/render/scripts/render.js'),...flags],{encoding:'utf8',timeout:65000,env:{...process.env,npm_config_offline:'true'}});
      assert.equal(after.status,0,after.stderr);assert.equal(after.stdout,before.stdout);assert.equal(after.stderr,before.stderr);assert.deepEqual(readFileSync(output),bytes);
    }
  } finally {rmSync(scratch,{recursive:true,force:true});}
});
