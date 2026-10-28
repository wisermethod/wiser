import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixture } from './fixtures.js';
import { wiserUserConfigDir } from '../user-config.js';

async function setup(t) {
  const f = fixture(t), c = await f.import('consent.js');
  const dir = wiserUserConfigDir(), marker = join(dir, '.wiser-consent');
  const script = join(f.copy, 'tools/fake/scripts/run.js');
  return { ...f, c, dir, marker, script };
}
const valid = {scope:'person', date:'2026-10-27', tool:'fixture'};
function person(f, value = valid, mode = 0o600) {
  mkdirSync(f.dir, {recursive:true});
  writeFileSync(f.marker, typeof value === 'string' ? value : JSON.stringify(value));
  chmodSync(f.marker, mode);
}

test('person consent: absent, malformed and incomplete markers do not authorise; valid does', async t => {
  const f = await setup(t);
  assert.equal(f.c.installAuthorised(f.script, false), false);
  for (const value of ['not json', {}, {...valid,scope:'copy'}, {...valid,tool:''}, {...valid,date:'wrong'}, {...valid,date:'2026-02-31'}, {...valid,date:'0000-01-01'}]) {
    person(f, value); assert.equal(f.c.installAuthorised(f.script, false), false, JSON.stringify(value));
  }
  person(f); assert.equal(f.c.installAuthorised(f.script, false), true);
  assert.equal(f.c.installAuthorised(join(f.root,'another-copy/script.js'), false), true);
});

test('person consent: wrong modes, owner, symbolic link and directory are ignored', async t => {
  const f = await setup(t);
  for (const mode of [0o620,0o602,0o666]) {
    person(f, valid, mode); assert.equal(f.c.installAuthorised(f.script, false), false);
  }
  person(f);
  const uid = process.getuid();
  const mocked = mock.method(process, 'getuid', () => uid + 1);
  try { assert.equal(f.c.installAuthorised(f.script, false), false); } finally { mocked.mock.restore(); }
  rmSync(f.marker);
  writeFileSync(join(f.root,'linked'),JSON.stringify(valid), {mode:0o600});
  symlinkSync(join(f.root,'linked'),f.marker);
  assert.equal(f.c.installAuthorised(f.script, false), false);
  rmSync(f.marker); mkdirSync(f.marker);
  assert.equal(f.c.installAuthorised(f.script, false), false);
});

test('copy consent: matching realpath counts; mismatch and malformed do not', async t => {
  const f = await setup(t), marker = join(f.copy,'.wiser-consent');
  for (const value of ['{',JSON.stringify({realpath:join(f.root,'other')})]) {
    writeFileSync(marker,value); assert.equal(f.c.installAuthorised(f.script,false),false);
  }
  writeFileSync(marker,JSON.stringify({realpath:realpathSync(f.copy)}));
  assert.equal(f.c.installAuthorised(f.script,false),true);
  person(f); writeFileSync(marker,JSON.stringify({realpath:join(f.root,'other')}));
  assert.equal(f.c.installAuthorised(f.script,false),true);
});

test('explicit consent writes person and copy owner-only; survey and valued flag do not', async t => {
  const f = await setup(t);
  f.c.writeConsent(f.script,'fixture',false);
  assert.equal(existsSync(f.dir),false); assert.equal(existsSync(join(f.copy,'.wiser-consent')),false);
  assert.equal(f.c.parsedInstallFlag(['--path','--install'],new Set(['--path'])),false);
  assert.equal(f.c.installAuthorised(f.script,true),true);
  f.c.writeConsent(f.script,'fixture',true);
  assert.equal(statSync(f.dir).mode & 0o777,0o700);
  for (const marker of [f.marker,join(f.copy,'.wiser-consent')]) {
    assert.equal(statSync(marker).mode & 0o777,0o600);
    const data = JSON.parse(readFileSync(marker,'utf8'));
    assert.equal(data.tool,'fixture'); assert.match(data.date,/^\d{4}-\d{2}-\d{2}$/);
  }
  assert.equal(JSON.parse(readFileSync(f.marker,'utf8')).scope,'person');
  assert.equal(JSON.parse(readFileSync(join(f.copy,'.wiser-consent'),'utf8')).realpath,realpathSync(f.copy));
  rmSync(f.marker); process.env.WISER_ALLOW_INSTALL='1';
  assert.equal(f.c.installAuthorised(f.script,false),true);
  f.c.writeConsent(f.script,'environment',false);
  assert.equal(JSON.parse(readFileSync(f.marker,'utf8')).tool,'environment');
});


for (const kind of ['symlink','group-writable','other-owned']) test(`user-config directory ${kind}: neither trusted nor written through; copy grant remains`, async t => {
  const f = await setup(t);
  person(f);
  const before=readFileSync(f.marker);
  let owner;
  if(kind==='symlink'){
    const actual=join(f.root,'actual-config');
    const {renameSync}=await import('node:fs');renameSync(f.dir,actual);symlinkSync(actual,f.dir);
  } else if(kind==='group-writable') chmodSync(f.dir,0o770);
  else {const uid=process.getuid();owner=mock.method(process,'getuid',()=>uid+1);}
  let stderr='';const output=mock.method(process.stderr,'write',s=>{stderr+=s;return true;});
  try {
    assert.equal(f.c.installAuthorised(f.script,false),false);
    f.c.writeConsent(f.script,'test',true);
    assert.deepEqual(readFileSync(f.marker),before);
    assert.equal(f.c.installAuthorised(f.script,false),true,'matching copy consent still works');
    assert.match(stderr,/^Wiser will install this, but it can only remember your yes until the next Wiser update, so you may be asked again then. Reason: .+\.\n$/);
    assert.match(stderr,kind==='symlink'?/real directory/:kind==='group-writable'?/writable by group/:/owned by another/);
  } finally {output.mock.restore();owner?.mock.restore();}
});

test('person marker symlink is replaced atomically without touching its target', async t => {
  const f=await setup(t);mkdirSync(f.dir,{recursive:true,mode:0o700});
  const target=join(f.root,'leave-alone');writeFileSync(target,'untouched',{mode:0o644});
  symlinkSync(target,f.marker);
  assert.equal(f.c.installAuthorised(f.script,false),false);
  f.c.writeConsent(f.script,'test',true);
  assert.equal(readFileSync(target,'utf8'),'untouched');
  assert.equal(lstatSync(f.marker).isSymbolicLink(),false);
  assert.equal(f.c.installAuthorised(f.script,false),true);
});
