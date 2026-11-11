import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { copiedAssets, refresh, ROOT, SPECS } from './copy-assets.mjs';

for (const tool of Object.keys(SPECS)) {
  test(`${tool}: copied bytes reproduce and every file hash and size matches`, () => {
    const a = copiedAssets(tool), b = copiedAssets(tool);
    assert.deepEqual(a,b);
    const record = JSON.parse(a.get('manifest.json'));
    for (const row of record.files) {
      assert.equal(a.get(row.path).length,row.bytes);
      assert.equal(createHash('sha256').update(a.get(row.path)).digest('hex'),row.sha256);
    }
    assert.equal(record.bytes,record.files.reduce((n,row)=>n+row.bytes,0));
    for (const notice of SPECS[tool].notices) {
      const path = `${SPECS[tool].name}/${notice.path}`;
      assert.deepEqual(a.get(path),readFileSync(join(ROOT,'tools',tool,notice.input)));
      assert.deepEqual(record.files.find(row=>row.path===path),{
        path, bytes:notice.bytes, sha256:notice.sha256, source:notice.source
      });
    }
    assert.equal(refresh(tool,{check:true}).status,'current');
  });
  test(`${tool}: check refuses stale, missing, extra and altered upstream bytes and wrong versions`, t => {
    const scratch = mkdtempSync(join(tmpdir(),'wiser-copies-build-'));
    t.after(()=>rmSync(scratch,{recursive:true,force:true}));
    const target = join(scratch,'tools',tool), original = join(ROOT,'tools',tool);
    cpSync(original,target,{recursive:true,filter:path=>!path.split(/[\\/]/).includes('node_modules')});
    mkdirSync(join(target,'node_modules'),{recursive:true});
    cpSync(join(original,'node_modules',SPECS[tool].name),join(target,'node_modules',SPECS[tool].name),{recursive:true});
    const check = () => refresh(tool,{root:scratch,check:true});
    assert.equal(check().status,'current');
    const first = [...copiedAssets(tool).keys()][0], path = join(target,'vendor',first), bytes = readFileSync(path);
    appendFileSync(path,' '); assert.throws(check,/missing, stale or unexpected/); writeFileSync(path,bytes);
    rmSync(path); assert.throws(check,/missing, stale or unexpected/); writeFileSync(path,bytes);
    const empty=join(target,'vendor','unexpected-empty');mkdirSync(empty);assert.throws(check,/unexpected directory/);rmSync(empty,{recursive:true});
    const extra = join(target,'vendor','unexpected.txt'); writeFileSync(extra,'x'); assert.throws(check,/unexpected file/); rmSync(extra);
    const metadata = join(target,'vendor','manifest.json'), metadataBytes = readFileSync(metadata);
    appendFileSync(metadata,' '); assert.throws(check,/manifest.json/); writeFileSync(metadata,metadataBytes);
    const source = join(target,'node_modules',SPECS[tool].name,Object.keys(SPECS[tool].files)[0]), sourceBytes = readFileSync(source);
    appendFileSync(source,' '); assert.throws(check,/integrity|locked package/); writeFileSync(source,sourceBytes);
    const notice = SPECS[tool].notices[0];
    const carriedNotice = join(target,'vendor',SPECS[tool].name,notice.path), carriedBytes = readFileSync(carriedNotice);
    appendFileSync(carriedNotice,' '); assert.throws(check,/missing, stale or unexpected/); writeFileSync(carriedNotice,carriedBytes);
    const noticeInput = join(target,notice.input), noticeBytes = readFileSync(noticeInput);
    const alteredNotice = Buffer.from(noticeBytes); alteredNotice[0] ^= 1;
    writeFileSync(noticeInput,alteredNotice);
    assert.throws(check,/licence input .* differs from its pinned/);
    assert.throws(()=>refresh(tool,{root:scratch}),/licence input .* differs from its pinned/);
    writeFileSync(noticeInput,noticeBytes);
    appendFileSync(noticeInput,' ');
    assert.throws(check,/licence input .* differs from its pinned/);
    assert.throws(()=>refresh(tool,{root:scratch}),/licence input .* differs from its pinned/);
    writeFileSync(noticeInput,noticeBytes);
    rmSync(noticeInput); assert.throws(check,/ENOENT/); writeFileSync(noticeInput,noticeBytes);
    assert.equal(check().status,'current');
    const pkg = join(target,'node_modules',SPECS[tool].name,'package.json');
    writeFileSync(pkg,JSON.stringify({...JSON.parse(readFileSync(pkg)),version:'0.0.0'}));
    assert.throws(check,/differs from pinned/);
    assert.throws(()=>refresh(tool,{root:scratch}),/differs from pinned/);
  });
}

for (const tool of Object.keys(SPECS)) test(`${tool}: builder rejects paired carried/manifest edits even with same-version installed bytes edited too`, t=>{
  const scratch=mkdtempSync(join(tmpdir(),'wiser-paired-copy-'));t.after(()=>rmSync(scratch,{recursive:true,force:true}));
  const target=join(scratch,'tools',tool),original=join(ROOT,'tools',tool);
  cpSync(original,target,{recursive:true,filter:path=>!path.split(/[\\/]/).includes('node_modules')});
  mkdirSync(join(target,'node_modules'),{recursive:true});
  cpSync(join(original,'node_modules',SPECS[tool].name),join(target,'node_modules',SPECS[tool].name),{recursive:true});
  const [source,dest]=Object.entries(SPECS[tool].files)[0];
  const carried=join(target,'vendor',SPECS[tool].name,dest), installed=join(target,'node_modules',SPECS[tool].name,source);
  appendFileSync(carried,' ');const bytes=readFileSync(carried),manifestPath=join(target,'vendor/manifest.json');
  const manifest=JSON.parse(readFileSync(manifestPath));
  const row=manifest.files.find(row=>row.path===`${SPECS[tool].name}/${dest}`);
  row.bytes=bytes.length;row.sha256=createHash('sha256').update(bytes).digest('hex');manifest.bytes++;
  writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
  assert.throws(()=>refresh(tool,{root:scratch,check:true}),/missing, stale or unexpected/);
  appendFileSync(installed,' ');
  // Reconstructing from that dirty package would now match both carried files
  // and manifest. The locked archive must still reject it before comparison.
  assert.throws(()=>refresh(tool,{root:scratch,check:true}),/integrity|locked package/);
});

test('copy check authenticates cached archive before trusting installed bytes',t=>{
  const scratch=mkdtempSync(join(tmpdir(),'wiser-corrupt-archive-'));t.after(()=>rmSync(scratch,{recursive:true,force:true}));
  const integrity=JSON.parse(readFileSync(join(ROOT,'tools/render/package-lock.json'))).packages['node_modules/mermaid'].integrity;
  const [algorithm,digest]=integrity.split('-'),hex=Buffer.from(digest,'base64').toString('hex');
  const archive=join(scratch,'_cacache/content-v2',algorithm,hex.slice(0,2),hex.slice(2,4),hex.slice(4));
  mkdirSync(join(archive,'..'),{recursive:true});writeFileSync(archive,'not the authenticated package archive');
  const saved=process.env.npm_config_cache;process.env.npm_config_cache=scratch;
  try { assert.throws(()=>refresh('render',{check:true}),/differs from lockfile integrity/); }
  finally { if(saved===undefined)delete process.env.npm_config_cache;else process.env.npm_config_cache=saved; }
});
for (const name of ['render','deck-export']) test(`${name}: tool page names supplied licence texts without an unresolved licence claim`,()=>{
  const page=readFileSync(join(ROOT,'tools',name,'TOOL.md'),'utf8');
  assert.doesNotMatch(page,/unresolved source|unresolved in `NOTICE\.md`/);assert.match(page,/MIT/);
});
test('tag-audit page states trim-before-selection and documents proxy exclusions',()=>{
  const page=readFileSync(join(ROOT,'tools/tag-audit/TOOL.md'),'utf8');
  assert.match(page,/Each proxy name is trimmed in order/);assert.match(page,/first non-blank wins/);assert.match(page,/NO_PROXY/);
  assert.doesNotMatch(page,/first truthy value/);
});

test('carried-copy instructions name hook bypass and uninstalled-clone limits', () => {
  const instructions = readFileSync(new URL('./COPIES.md', import.meta.url), 'utf8');
  assert.match(instructions, /git commit --no-verify/);
  assert.match(instructions, /clone that has not installed the hook/);
});
