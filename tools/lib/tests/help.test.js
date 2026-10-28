import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, readdirSync, rmSync, chmodSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fixture } from './fixtures.js';

for (const [tool, script] of [['Browser Control','browser.js'],['render','render.js'],['deck-export','deck.js']]) {
  test(`${tool} help on a package-free copy reads nothing in HOME`, t => {
    const f = fixture(t);
    cpSync(new URL(`../../${tool}/scripts/`,import.meta.url),join(f.copy,'tools',tool,'scripts'),{recursive:true});
    const guard = join(f.root,'guard.mjs');
    writeFileSync(guard, `import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {fileURLToPath} from 'node:url';
let reads = 0;
for (const key of ['existsSync','statSync','lstatSync','readFileSync','readdirSync','openSync','accessSync','mkdirSync','writeFileSync']) {
 const original = fs[key];
 fs[key] = function(path,...args) {
  const name = path instanceof URL ? fileURLToPath(path) : String(path);
  if (name.startsWith(process.env.HOME)) {reads++; throw new Error('help accessed HOME: '+name);}
  return original.call(this,path,...args);
 };
}
syncBuiltinESMExports();
process.on('exit',()=>{if(reads){process.stderr.write('HOME accesses: '+reads);process.exitCode=99;}});
`);
    for (const args of [['help'],['--help'], ...(tool === 'Browser Control' ? [['session','start','--help']] : tool === 'render' ? [['check','help']] : [['check','--help']])]) {
      const r = spawnSync(process.execPath,['--import',pathToFileURL(guard).href,join(f.copy,'tools',tool,'scripts',script),...args],{env:process.env,encoding:'utf8'});
      assert.equal(r.status,0,r.stderr); assert.equal(r.stderr,''); assert.match(r.stdout,/--install/);
    }
    assert.deepEqual(readdirSync(f.home),[]);
    assert.equal(existsSync(join(f.runtime,'node_modules')),false);
  });
}


test('Browser Control status, stop and unknown command need neither lockfile nor HOME', t => {
  const f = fixture(t);
  cpSync(new URL('../../Browser Control/scripts/',import.meta.url),join(f.copy,'tools/Browser Control/scripts'),{recursive:true});
  rmSync(join(f.runtime,'package-lock.json'));
  const guard = join(f.root,'no-home.mjs');
  writeFileSync(guard, `import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
let reads=0;
for (const key of ['existsSync','statSync','lstatSync','readFileSync','readdirSync','openSync','accessSync']) {
 const original=fs[key];
 fs[key]=function(path,...args){if(String(path).startsWith(process.env.HOME)){reads++;throw Error('HOME read');}return original.call(this,path,...args);};
}
syncBuiltinESMExports();
process.on('exit',()=>{if(reads){process.stderr.write('HOME reads: '+reads);process.exitCode=99;}});
`);
  const script=join(f.copy,'tools/Browser Control/scripts/browser.js');
  for(const args of [['session','status','--port','1'],['session','stop','--port','1'],['unknown'],['help']]){
    const result=spawnSync(process.execPath,['--import',pathToFileURL(guard).href,script,...args],{env:process.env,encoding:'utf8'});
    assert.equal(result.status,args[0]==='unknown'?1:0,result.stderr);
    if(args[0]==='unknown')assert.match(result.stderr,/^Error: unknown command/);
    else assert.equal(result.stderr,'');
    assert.doesNotMatch(result.stderr,/\n\s+at |HOME reads/);
  }
  for(const args of [['session','start','--profile',join(f.root,'profile'),'--port','1']]){
    const result=spawnSync(process.execPath,[script,...args],{env:process.env,encoding:'utf8'});
    assert.equal(result.status,1);assert.match(result.stderr,/^Error: cannot read browser runtime lockfile/);
    assert.doesNotMatch(result.stderr,/\n\s+at /);assert.equal(result.stdout,'');
  }
  assert.deepEqual(readdirSync(f.home),[]);
});


test('Browser Control launch with an unreadable lockfile gives one Error line', t => {
  const f=fixture(t);
  cpSync(new URL('../../Browser Control/scripts/',import.meta.url),join(f.copy,'tools/Browser Control/scripts'),{recursive:true});
  const guard=join(f.root,'unreadable-lock.mjs');
  writeFileSync(guard, `import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';
const read=fs.readFileSync;fs.readFileSync=function(path,...args){if(String(path).endsWith('/browser-runtime/package-lock.json')){throw Object.assign(Error('synthetic unreadable lockfile'),{code:'EACCES'});}return read.call(this,path,...args);};syncBuiltinESMExports();`);
  const result=spawnSync(process.execPath,['--import',pathToFileURL(guard).href,join(f.copy,'tools/Browser Control/scripts/browser.js'),'session','start','--profile',join(f.root,'profile'),'--port','1'],{env:process.env,encoding:'utf8'});
  assert.equal(result.status,1);assert.equal(result.stdout,'');
  assert.match(result.stderr,/^Error: cannot read browser runtime lockfile .*synthetic unreadable lockfile[^\n]*\n$/);
  assert.doesNotMatch(result.stderr,/\n\s+at /);
  assert.deepEqual(readdirSync(f.home),[]);
});
