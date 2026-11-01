// Run the suite without writing scratch outside this skill or changing its scripts.
// The scripts correctly refuse outputs inside their own skill, so test an exact
// disposable copy whose outputs can sit beside that copy, still under tests/.
import {copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const here=dirname(fileURLToPath(import.meta.url)), skill=resolve(here,'..'), plugin=resolve(skill,'../..');
const scratch=mkdtempSync(join(here,'verification-')), copied=join(scratch,'plugin/skills/Build Brand');
const copyDirectory=(from,to,filter=()=>true)=>{
  mkdirSync(to,{recursive:true});
  for(const entry of readdirSync(from,{withFileTypes:true})){
    if(!filter(entry))continue;
    const source=join(from,entry.name), target=join(to,entry.name);
    if(entry.isDirectory())copyDirectory(source,target,filter);
    else if(entry.isFile())copyFileSync(source,target);
  }
};
try{
  mkdirSync(copied,{recursive:true});
  for(const entry of readdirSync(skill,{withFileTypes:true}))if(entry.isFile()&&entry.name.endsWith('.md'))copyFileSync(join(skill,entry.name),join(copied,entry.name));
  for(const dir of ['scripts','paths'])if(existsSync(join(skill,dir)))copyDirectory(join(skill,dir),join(copied,dir));
  copyDirectory(here,join(copied,'tests'),e=>e.isFile()&&e.name.endsWith('.mjs'));
  copyDirectory(join(skill,'parts'),join(copied,'parts'),e=>e.isFile());
  copyDirectory(join(skill,'parts/fonts'),join(copied,'parts/fonts'));
  symlinkSync(join(plugin,'tools'),join(scratch,'plugin/tools'),'dir');
  copyFileSync(join(plugin,'skills/AGENTS.md'),join(scratch,'plugin/skills/AGENTS.md'));
  if(process.argv.includes('--baseline'))copyFileSync(join(skill,'parts/zArchive/26-10-31 V1 - parts.md'),join(copied,'parts/parts.md'));
  const tmp=join(scratch,'tmp');mkdirSync(tmp);
  const journey=process.env.BUILD_BRAND_JOURNEY||resolve(plugin,'../journey.md');
  const env={...process.env,TMPDIR:tmp,BUILD_BRAND_JOURNEY:journey,npm_config_offline:'true',PIP_NO_INDEX:'1'};
  const files=readdirSync(join(copied,'tests')).filter(f=>f.endsWith('.test.mjs')&&(!process.argv.includes('--baseline')||f!=='flow.test.mjs')).sort().map(f=>join(copied,'tests',f));
  const child=spawnSync(process.execPath,['--test','--test-reporter=tap',...files],{env,encoding:'utf8',maxBuffer:16*1024*1024});
  const output=(child.stdout||'')+(child.stderr||'');
  // Keep all failures and final TAP totals, without printing fixture contents.
  const lines=output.split('\n'), failed=[];
  for(let i=0;i<lines.length;i++)if(/^not ok /.test(lines[i])){
    let end=i+1;while(end<lines.length&&!/^(?:# Subtest:|(?:not )?ok |1\.\.)/.test(lines[end]))end++;
    failed.push(lines.slice(i,end).join('\n'));
  }
  for(const failure of failed)process.stdout.write(failure+'\n');
  process.stdout.write(lines.filter(line=>/^# (?:tests|suites|pass|fail|cancelled|skipped|todo|duration_ms)\b|^1\.\./.test(line)).join('\n')+'\n');
  if(!lines.some(line=>/^# tests /.test(line)))process.stderr.write(output.slice(0,8000)+'\n');
  if(child.error)process.stderr.write(child.error.message+'\n');
  process.exitCode=child.status??1;
}finally{
  rmSync(scratch,{recursive:true,force:true});
}
