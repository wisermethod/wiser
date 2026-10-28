import '../../lib/tests/isolated-home.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync,symlinkSync,mkdirSync,readFileSync,cpSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {SAMPLE_FORM} from '../scripts/format.js';
import {template} from './cases.js';
const script=fileURLToPath(new URL('../scripts/form.js',import.meta.url));
const run=args=>spawnSync(process.execPath,[script,...args],{encoding:'utf8'});
const okay=args=>{const r=run(args);assert.equal(r.status,0,r.stderr);assert.equal(r.stderr,'');return JSON.parse(r.stdout);};
const refuse=(args,pattern)=>{const r=run(args);assert.equal(r.status,1);assert.equal(r.stdout,'');assert.match(r.stderr,pattern);};
function temp(fn){const d=mkdtempSync(join(tmpdir(),'wiser-form-'));try{return fn(d);}finally{rmSync(d,{recursive:true,force:true});}}
test('help without packages and imports have no side effects',()=>temp(d=>{
 cpSync(new URL('../scripts/',import.meta.url),join(d,'scripts'),{recursive:true});writeFileSync(join(d,'package.json'),'{"type":"module"}');
 for(const arg of ['help','--help']){const r=spawnSync(process.execPath,[join(d,'scripts/form.js'),arg],{encoding:'utf8'});assert.equal(r.status,0);for(const flag of ['--help','--form','--template','--values'])assert.ok(r.stdout.includes(flag));assert.equal(r.stderr,'');}
 for(const command of ['sample','schema']){const r=spawnSync(process.execPath,[join(d,'scripts/form.js'),command],{encoding:'utf8'});assert.equal(r.status,0);assert.ok(JSON.parse(r.stdout));}
 const f=join(d,'form.json'),t=join(d,'template.json'),v=join(d,'values.json');writeFileSync(f,JSON.stringify(SAMPLE_FORM));writeFileSync(t,JSON.stringify(template()));writeFileSync(v,JSON.stringify({name:'Ada',font:'Member Face'}));
 for(const args of [['check','--form',f],['fill','--template',t,'--values',v]]){const r=spawnSync(process.execPath,[join(d,'scripts/form.js'),...args],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).ok,true);}
 const r=spawnSync(process.execPath,['--input-type=module','-e',`await import(${JSON.stringify(new URL('../scripts/form.js',import.meta.url).href)}); console.log('import survived')`],{encoding:'utf8'});assert.equal(r.status,0);assert.equal(r.stdout,'import survived\n');
}));
for(const flag of ['--unknown','--install','--env','--form=x'])test(`unknown flag ${flag} before help or IO`,()=>refuse(['check','--form','/absent',flag,'--help'],new RegExp(flag.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'.*help')));
for(const args of [['check'],['fill','--template','/absent'],['check','--form'],['check','--form','-x'],['check','--form','/a','--form','/b'],['sample','--form','/a'],['wat'],['sample','extra']])test(`refused arguments ${args.join(' ')}`,()=>refuse(args,/help/));
test('command sample and schema are one JSON object',()=>{assert.deepEqual(okay(['sample']),{form:SAMPLE_FORM});const r=okay(['schema']);assert.equal(r.schema.type,'object');assert.equal(r.limits.formBytesMax,65536);assert.equal(r.fontHosts.length,2);});
test('check and fill outputs, failures, canonical paths and input ceiling',()=>temp(d=>{
 const f=join(d,'form.json'),t=join(d,'template.json'),v=join(d,'values.json');
 writeFileSync(f,JSON.stringify(SAMPLE_FORM));writeFileSync(t,JSON.stringify(template()));writeFileSync(v,JSON.stringify({name:'Ada',font:'Member Face'}));
 assert.deepEqual(okay(['check','--form',f]),{ok:true,problems:[],kind:'form'});assert.deepEqual(okay(['check','--form',t]),{ok:true,problems:[],kind:'template'});
 const filled=okay(['fill','--template',t,'--values',v]);assert.equal(filled.ok,true);assert.equal(filled.form.title,'For Ada');assert.equal(filled.form.slots,undefined);
 writeFileSync(f,'{"title":5,"questions":[]}');const checked=okay(['check','--form',f]);assert.equal(checked.ok,false);assert.ok(checked.problems.some(p=>p.path==='title'));assert.ok(checked.problems.some(p=>p.path==='questions'));
 writeFileSync(v,'{}');refuse(['fill','--template',t,'--values',v],/values.name:[\s\S]*values.font:/);
 refuse(['check','--form','relative.json'],/--form.*absolute/);refuse(['check','--form',join(d,'missing')],/missing file/);
 writeFileSync(f,'bad');refuse(['check','--form',f],/not JSON/);refuse(['check','--form',d],/not a file/);
 writeFileSync(f,' '.repeat(262145));refuse(['check','--form',f],/262144/);
 writeFileSync(f,JSON.stringify(SAMPLE_FORM)+' '.repeat(262144-Buffer.byteLength(JSON.stringify(SAMPLE_FORM))));assert.equal(okay(['check','--form',f]).ok,true);
 symlinkSync(f,join(d,'link'));assert.equal(okay(['check','--form',join(d,'link')]).ok,true);
 mkdirSync(join(d,'memory'));writeFileSync(join(d,'memory','private.json'),'{}');symlinkSync(join(d,'memory','private.json'),join(d,'private-link'));refuse(['check','--form',join(d,'private-link')],/private input path/);
 writeFileSync(join(d,'.env'),'{}');refuse(['check','--form',join(d,'.env')],/private input path/);
}));
