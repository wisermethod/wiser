import '../../lib/tests/isolated-home.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {checkForm,checkTemplate,fillTemplate,FORM_LIMITS,FONT_HOSTS,SAMPLE_FORM} from '../scripts/format.js';
import {passing,refused,base,clone,set,template,mixedPictures} from './cases.js';
for(const [name,form] of passing)test(`accept: ${name}`,()=>assert.deepEqual(checkForm(form),{ok:true,problems:[]}));
for(const [name,path,form] of refused)test(`refuse: ${name}`,()=>{const r=checkForm(form);assert.equal(r.ok,false);assert.ok(r.problems.some(p=>p.path===path),JSON.stringify(r));});
test('never throws for arbitrary input, even hostile objects',()=>{
 const cycle={};cycle.self=cycle;
 for(const v of [null,undefined,1,true,'',[],new Date(),Symbol(),()=>{},cycle,new Proxy({}, {ownKeys(){throw Error('trap')}})]){let r;assert.doesNotThrow(()=>r=checkForm(v));assert.equal(r.ok,false);}
 const r=checkForm({title:1,extra:1,questions:[{id:1,type:'bad',label:null,unknown:true}]});assert.ok(r.problems.length>=5);
});
test('JSON byte limit counts UTF-8 and controls anywhere',()=>{
 const f={title:'😀'.repeat(80),intro:'😀'.repeat(300),questions:Array.from({length:12},(_,i)=>({id:`q-${i}`,label:'😀'.repeat(200),help:'😀'.repeat(300),type:'checkbox',options:Array.from({length:12},(_,j)=>({value:`v-${j}`,label:'😀'.repeat(60),note:'😀'.repeat(80)}))}))};
 assert.ok(Buffer.byteLength(JSON.stringify(f))>65536);assert.ok(checkForm(f).problems.some(p=>p.path===''&&/65536/.test(p.message)));
 f.questions[0].options[0]['bad\u0001']='x';assert.ok(checkForm(f).problems.some(p=>/Control/.test(p.message)));
 for(const c of ['\0','\n','\u007f','\u009f'])assert.equal(checkForm({...base(),intro:c}).ok,false);
});
test('portable module has no imports and sample has six questions',()=>{
 assert.doesNotMatch(readFileSync(new URL('../scripts/format.js',import.meta.url),'utf8'),/^import\b/m);
 assert.equal(SAMPLE_FORM.questions.length,6);assert.equal(FORM_LIMITS.answerMax,1000);assert.deepEqual(FONT_HOSTS,['https://fonts.gstatic.com','https://cdn.jsdelivr.net']);
});
const values={name:'Ada 😀',font:'Member Face'};
test('template fill changes only tokens, leaves inputs alone, drops slots',()=>{
 const t=template(),before=clone(t);assert.deepEqual(checkTemplate(t),{ok:true,problems:[]});
 const r=fillTemplate(t,values);assert.equal(r.ok,true,JSON.stringify(r));assert.deepEqual(t,before);
 function compare(a,b){if(typeof a==='string')assert.equal(b,a.replace(/\{\{([^{}]*)\}\}/g,(_,k)=>values[k]));else if(Array.isArray(a))a.forEach((v,i)=>compare(v,b[i]));else if(a&&typeof a==='object'){assert.deepEqual(Object.keys(a).filter(k=>k!=='slots'),Object.keys(b));for(const k of Object.keys(a))if(k!=='slots')compare(a[k],b[k]);}else assert.equal(a,b);}
 compare(t,r.form);assert.equal(checkForm(r.form).ok,true);
});
for(const path of ['title','intro','questions[0].label','questions[0].short','questions[0].help','questions[0].options[0].label','questions[0].options[0].note','questions[2].options[0].picture','questions[2].options[0].sample','questions[4].minLabel','questions[4].maxLabel','questions[5].placeholder','fonts[0].family','fonts[0].src'])test(`token allowed and deferred: ${path}`,()=>{
 const t=base();t.slots={slot:{about:'A part',max:300}};set(t,path,'{{slot}}');assert.equal(checkTemplate(t).ok,true,JSON.stringify(checkTemplate(t)));
});
for(const path of ['id','questions[0].id','questions[0].type','questions[0].options[0].value','questions[4].min','questions[4].max','questions[4].step','questions[4].value','slots.name.about','slots.name.max'])test(`token refused at ${path}`,()=>{const t=template();set(t,path,'{{name}}');assert.ok(checkTemplate(t).problems.some(p=>p.path===path));});
for(const [name,path,change] of [
 ['missing slots','slots',t=>delete t.slots],['empty slots','slots',t=>t.slots={}],['too many slots','slots',t=>t.slots=Object.fromEntries(Array.from({length:21},(_,i)=>[`s-${i}`,{about:'A',max:1}]))],
 ['bad name','slots.Bad',t=>t.slots.Bad={about:'A',max:1}],['long name','slots.'+'a'.repeat(31),t=>t.slots['a'.repeat(31)]={about:'A',max:1}],['unused','slots.unused',t=>t.slots.unused={about:'A',max:1}],
 ['unknown','title',t=>t.title='{{unknown}}'],['malformed','title',t=>t.title='{{name'],['bad slots type','slots',t=>t.slots=[]],['slot type','slots.name',t=>t.slots.name=1],
 ['about missing','slots.name.about',t=>delete t.slots.name.about],['about empty','slots.name.about',t=>t.slots.name.about=''],['about long','slots.name.about',t=>t.slots.name.about='x'.repeat(121)],['about type','slots.name.about',t=>t.slots.name.about=1],
 ['max missing','slots.name.max',t=>delete t.slots.name.max],['max low','slots.name.max',t=>t.slots.name.max=0],['max high','slots.name.max',t=>t.slots.name.max=301],['max fractional','slots.name.max',t=>t.slots.name.max=1.5],['max type','slots.name.max',t=>t.slots.name.max='2'],['slot unknown key','slots.name.extra',t=>t.slots.name.extra=1]
])test(`template refuses ${name}`,()=>{const t=template();change(t);const r=checkTemplate(t);assert.equal(r.ok,false);assert.ok(r.problems.some(p=>p.path===path),JSON.stringify(r));assert.equal(fillTemplate(t,values).ok,false);});
for(const [name,v,path] of [['missing',{name:'A'},'values.font'],['extra',{...values,extra:''},'values.extra'],['wrong type',{...values,name:1},'values.name'],['long',{...values,name:'😀'.repeat(81)},'values.name'],['open delimiters',{...values,name:'{{'},'values.name'],['close delimiters',{...values,name:'}}'},'values.name'],['control',{...values,name:'\u0080'},'values.name'],['not object',null,'values']])test(`fill refuses ${name}`,()=>{const r=fillTemplate(template(),v);assert.equal(r.ok,false);assert.ok(r.problems.some(p=>p.path===path));});
test('filled result rechecked, including URL, family, length, grammar and uniqueness',()=>{
 for(const [path,value]of [['title','x'.repeat(81)],['fonts[0].src','https://evil.test/a.ttf'],['fonts[0].family','serif'],['questions[2].options[0].picture','palette:#no']]){const t=base();t.slots={slot:{about:'Part',max:300}};set(t,path,'{{slot}}');const r=fillTemplate(t,{slot:value});assert.equal(r.ok,false);assert.ok(r.problems.some(p=>p.path===path),JSON.stringify(r));}
});
test('slot and value inclusive boundaries and empty replacement',()=>{
 const t=base();t.slots=Object.fromEntries(Array.from({length:20},(_,i)=>[`s-${i}`,{about:'😀'.repeat(120),max:i?300:1}]));t.intro=Object.keys(t.slots).map(k=>`{{${k}}}`).join('');
 assert.equal(checkTemplate(t).ok,true);const v=Object.fromEntries(Object.keys(t.slots).map(k=>[k,'']));assert.equal(fillTemplate(t,v).ok,true);
 v['s-0']='😀';v['s-1']='😀'.repeat(299);assert.equal(fillTemplate(t,v).ok,true);
});
test('sparse arrays and primitive field types are refused at their positions',()=>{
 for(const path of ['questions','fonts','questions[0].options']){const f=base();set(f,path,new Array(path.endsWith('options')?2:1));const r=checkForm(f);assert.equal(r.ok,false);assert.ok(r.problems.some(p=>p.path===`${path}[0]`));}
 const f=base();f.fonts[0].src=1;assert.ok(checkForm(f).problems.some(p=>p.path==='fonts[0].src'));
});
test('checkbox counts, fractional slider steps, finite numbers, and all missing option keys',()=>{
 for(const [i,min,max]of [[1,2,12],[3,2,8]])for(const n of [min-1,max+1]){const f=base();f.questions[i].options=Array.from({length:n},(_,j)=>({value:`v-${j}`,label:'O',...(i===3?{picture:'motif:dots'}:{})}));assert.ok(checkForm(f).problems.some(p=>p.path===`questions[${i}].options`));}
 const f=base();f.questions[4].step=.2;f.questions[4].value=.6000000000000001;assert.equal(checkForm(f).ok,true);
 for(const key of ['min','max','step','value'])for(const v of [Infinity,-Infinity,NaN]){const f=base();f.questions[4][key]=v;assert.ok(checkForm(f).problems.some(p=>p.path===`questions[4].${key}`));}
 const t=base();t.title='{{bad-key}}';assert.equal(checkForm(t).ok,true); // literal braces in ordinary copy are data
});
test('slot tokens in keys and unsupported locations are refused',()=>{
 const t=template();t.questions[0].options[0]['{{name}}']='A';assert.ok(checkTemplate(t).problems.some(p=>p.path==='questions[0].options[0].{{name}}'));
 t.slots.name.about='\u007f';assert.ok(checkTemplate(t).problems.some(p=>p.path==='slots.name.about'));
 for(const value of [null,undefined,'x',1])assert.equal(checkTemplate(value).ok,false);
 const f=base();f.questions[2].options[0].picture='type:serif';f.questions[2].options[0].sample='';assert.equal(checkForm(f).ok,true);
});
test('wrong non-JSON values keep their field paths; step rounding admits decimal boundaries only',()=>{
 for(const value of [1n,()=>{},Symbol('x')]){const f=base();f.questions[4].min=value;const r=checkForm(f);assert.equal(r.ok,false);assert.ok(r.problems.some(p=>p.path==='questions[4].min'),JSON.stringify(r));}
 const f=base();f.questions[4]={id:'range',type:'slider',label:'Range',min:.1,max:.4,step:.003};assert.equal(checkForm(f).ok,true);
 f.questions[4]={id:'range',type:'slider',label:'Range',min:0,max:1.000000005,step:1};assert.ok(checkForm(f).problems.some(p=>p.path==='questions[4].step'));
});
test('mixed picture templates keep word values and defer only tokenized picture rules',()=>{
 const t=mixedPictures();t.slots={label:{about:'Word answer',max:60},picture:{about:'Picture',max:300}};
 t.questions[0].options[0].label='{{label}}';t.questions[0].options[1].picture='{{picture}}';
 assert.deepEqual(checkTemplate(t),{ok:true,problems:[]});
 const filled=fillTemplate(t,{label:'Neither of these',picture:'type:serif'});
 assert.equal(filled.ok,true,JSON.stringify(filled));assert.equal(filled.form.questions[0].options[0].value,'neither');
 t.questions[0].options[0].sample='{{label}}';
 assert.ok(checkTemplate(t).problems.some(p=>p.path==='questions[0].options[0].sample'));
});
