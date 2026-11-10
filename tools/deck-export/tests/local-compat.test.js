import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, symlinkSync, rmSync, readdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { revealAssets } from '../scripts/package-assets.js';
const root=fileURLToPath(new URL('../../../',import.meta.url));
test('local HTML adapter preserves baseline PNG, PDF page pixels, CLI JSON and progress',()=>{
  const scratch=mkdtempSync(join(tmpdir(),'deck-before-'));
  try{
    const scripts=join(scratch,'tools/deck-export/scripts');mkdirSync(scripts,{recursive:true});
    writeFileSync(join(scripts,'deck.js'),execFileSync('git',['show','1f810776:tools/deck-export/scripts/deck.js'],{cwd:root}));
    symlinkSync(join(root,'tools/lib'),join(scratch,'tools/lib'),'dir');
    symlinkSync(join(root,'tools/deck-export/node_modules'),join(scratch,'tools/deck-export/node_modules'),'dir');
    const project=join(scratch,'project');mkdirSync(join(project,'Deck Assets'),{recursive:true});
    const input=join(project,'Deck.html');
    writeFileSync(input,readFileSync(new URL('./fixtures/shared/deck.html',import.meta.url),'utf8').replace('width:320,height:180','width:640,height:360'));
    for(const [name,bytes] of Object.entries(revealAssets()))writeFileSync(join(project,'Deck Assets',name),bytes);
    for(const command of ['png','pdf']){
      const destination=join(scratch,command==='png'?'pictures':'deck.pdf');
      const flags=[command,'--input',input,'--output',destination,'--scale','1'];
      const before=spawnSync(process.execPath,[join(scripts,'deck.js'),...flags],{encoding:'utf8',timeout:65000,env:{...process.env,npm_config_offline:'true'}});
      assert.equal(before.status,0,before.stderr);
      let pictures;
      if(command==='png')pictures=readdirSync(destination).map(name=>readFileSync(join(destination,name)));
      else copyFileSync(destination,join(scratch,'before.pdf'));
      const after=spawnSync(process.execPath,[join(root,'tools/deck-export/scripts/deck.js'),...flags],{encoding:'utf8',timeout:65000,env:{...process.env,npm_config_offline:'true'}});
      assert.equal(after.status,0,after.stderr);assert.equal(after.stdout,before.stdout);assert.equal(after.stderr,before.stderr);
      if(command==='png')assert.ok(readdirSync(destination).every((name,i)=>readFileSync(join(destination,name)).equals(pictures[i])),'PNG bytes unchanged');
      else{
        const probe=spawnSync('pdftoppm',['-v'],{encoding:'utf8'});
        if(probe.error?.code==='ENOENT')assert.equal((readFileSync(destination,'latin1').match(/\/Type \/Page\b/g)||[]).length,3);
        else{
          execFileSync('pdftoppm',['-r','72',join(scratch,'before.pdf'),join(scratch,'before')]);
          execFileSync('pdftoppm',['-r','72',destination,join(scratch,'after')]);
          const pages=readdirSync(scratch).filter(name=>/^before-.*\.ppm$/.test(name));assert.equal(pages.length,3);
          for(const name of pages)assert.ok(readFileSync(join(scratch,name.replace('before-','after-'))).equals(readFileSync(join(scratch,name))),'PDF page pixels unchanged');
        }
      }
    }
  }finally{rmSync(scratch,{recursive:true,force:true});}
});
