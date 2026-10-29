import { SAMPLE_FORM } from '../scripts/format.js';
export const clone = v => structuredClone(v);
export const base = () => ({id:'form-one',title:'Title',intro:'Intro',fonts:[{family:'Fixture',src:'https://fonts.gstatic.com/fixture.ttf'}],questions:[
  {id:'single',type:'radio',label:'Single',short:'Pick',help:'Help',options:[{value:'a',label:'A',note:'Note'},{value:'b',label:'B'}]},
  {id:'multi',type:'checkbox',label:'Multi',options:[{value:'a',label:'A'},{value:'b',label:'B'}]},
  {id:'image',type:'image-radio',label:'Image',options:[{value:'a',label:'A',picture:'type:serif+monospace:#123,#fff',sample:'Type'},{value:'b',label:'B',picture:'palette:#abc,#123456'}]},
  {id:'images',type:'image-checkbox',label:'Images',options:[{value:'a',label:'A',picture:'motif:triangles'},{value:'b',label:'B',picture:'motif:blob:#fff,#123'}]},
  {id:'range',type:'slider',label:'Range',min:-1,max:1,step:.2,value:.2,minLabel:'Low',maxLabel:'High'},
  {id:'text',type:'text',label:'Text',placeholder:'Say something'}
]});
export function set(v,path,value,drop=false) {
  const keys = path.replace(/\[(\d+)\]/g,'.$1').split('.'); const last=keys.pop();
  let o=v; for(const k of keys) o=o[k];
  if(drop) delete o[last]; else o[last]=value;
  return v;
}
export const passing = [['sample',clone(SAMPLE_FORM)],['all fields',base()]];
passing.push(['paged sample',{...clone(SAMPLE_FORM),paged:true}]);
export const refused = [];
const bad=(name,path,value,drop=false)=>refused.push([name,path,set(base(),path,value,drop)]);
const good=(name,path,value,drop=false)=>passing.push([name,set(base(),path,value,drop)]);
for(const value of [true,false])good(`paged ${value}`,'paged',value);
for(const value of [null,0,1,'true',[],{}])bad(`paged wrong type ${JSON.stringify(value)}`,'paged',value);
for(const value of [true,false]) {
  const f=base();f.paged=value;f.questions.length=1;
  refused.push([`paged ${value} with one question`,'paged',f]);
}
for(const [path,min,max] of [
  ['title',1,80],['intro',0,300],['questions[0].label',1,200],['questions[0].short',0,40],['questions[0].help',0,300],
  ['questions[0].options[0].label',1,60],['questions[0].options[0].note',0,80],['questions[2].options[0].sample',0,24],
  ['questions[4].minLabel',0,24],['questions[4].maxLabel',0,24],['questions[5].placeholder',0,120]
]) {
  good(`${path} minimum`,path,'x'.repeat(min)); good(`${path} codepoint maximum`,path,'😀'.repeat(max));
  bad(`${path} too long`,path,'😀'.repeat(max+1)); bad(`${path} wrong type`,path,42); bad(`${path} control`,path,'\u0085');
  if(min) bad(`${path} too short`,path,'');
}
for(const [path,valid,invalid] of [
  ['id','a'+'1'.repeat(39),'A'],['questions[0].id','a'+'1'.repeat(39),'1bad'],
  ['questions[0].options[0].value','0'+'a'.repeat(39),'Bad'],['fonts[0].family','A'+'b'.repeat(39),'A-B']
]) {
 good(`${path} spelling boundary`,path,valid);bad(`${path} spelling`,path,invalid);bad(`${path} length`,path,'a'.repeat(41));bad(`${path} number`,path,1);
}
// Picture is now optional per option; the question-level picture minimum is checked below.
for(const path of ['title','questions','questions[0].id','questions[0].type','questions[0].label','questions[0].options','questions[0].options[0].value','questions[0].options[0].label','questions[4].min','questions[4].max','fonts[0].family','fonts[0].src']) bad(`${path} required`,path,undefined,true);
for(const path of ['submitLabel','extra','questions[0].extra','questions[0].placeholder','questions[4].options','questions[5].min','questions[0].options[0].extra','questions[0].options[0].picture','questions[0].options[0].sample','fonts[0].extra']) bad(`${path} unknown`,path,'x');
for(const path of ['questions','fonts','questions[0].options']) bad(`${path} array type`,path,{});
for(const path of ['questions[0]','fonts[0]','questions[0].options[0]']) bad(`${path} object type`,path,[]);
for(const path of ['questions[0].type','questions[4].min','questions[4].max','questions[4].step','questions[4].value']) bad(`${path} bad type`,path,'bad');
bad('duplicate id','questions[1].id','single');bad('duplicate value','questions[0].options[1].value','a');
for(const type of ['colour',null,1]) bad(`type ${type}`,'questions[0].type',type);
for(const [path,min,max,make] of [
 ['questions',1,12,i=>({id:`q-${i}`,type:'text',label:'Q'})],
 ['fonts',1,6,i=>({family:`Font ${i}`,src:'https://fonts.gstatic.com/a.woff2'})],
 ['questions[0].options',2,12,i=>({value:`o-${i}`,label:'O'})],
 ['questions[2].options',2,8,i=>({value:`o-${i}`,label:'O',picture:'motif:dots'})]
]) {
 for(const n of [min,max])good(`${path} count ${n}`,path,Array.from({length:n},(_,i)=>make(i)));
 for(const n of [min-1,max+1])bad(`${path} count ${n}`,path,Array.from({length:n},(_,i)=>make(i)));
}
for(const family of ['serif','sans-serif','monospace','system-ui','Serif'])bad(`generic ${family}`,'fonts[0].family',family);
// Names CSS would read as a keyword or respell: every generic and CSS-wide keyword in any case, a leading digit, and stray spaces.
for(const family of ['cursive','Fantasy','emoji','math','fangsong','inherit','INITIAL','unset','revert','default','1Font','A ',' A','Two  Space'])bad(`family ${JSON.stringify(family)}`,'fonts[0].family',family);
const caseTwin=base();caseTwin.fonts.push({family:'FIXTURE',src:'https://fonts.gstatic.com/b.woff2'});refused.push(['font family repeated in another case','fonts[1].family',caseTwin]);
const duplicate=base();duplicate.fonts.push(clone(duplicate.fonts[0]));refused.push(['duplicate font','fonts[1].family',duplicate]);
for(const src of ['http://fonts.gstatic.com/a.ttf','https://evil.test/a.ttf','https://fonts.gstatic.com/a.ttf?q=1','https://fonts.gstatic.com/a.ttf#f','https://u:p@fonts.gstatic.com/a.ttf','https://fonts.gstatic.com/a.svg','https://fonts.gstatic.com/a.ttf?','https://fonts.gstatic.com/a.ttf#','bad','https://fonts.gstatic.com/'+'x'.repeat(300)+'.ttf'])bad(`font URL ${src.slice(0,45)}`,'fonts[0].src',src);
for(const ext of ['woff2','woff','ttf','otf'])for(const host of ['fonts.gstatic.com','cdn.jsdelivr.net'])good(`font ${host}/${ext}`,'fonts[0].src',`https://${host}/a.${ext}`);
for(const picture of ['palette:#abc','palette:'+Array(8).fill('#123456').join(','),...['dots','grid','waves','arcs','stripes','rings','triangles','blob'].flatMap(n=>[`motif:${n}`,`motif:${n}:#abc,#123456`]),...['serif','sans-serif','monospace','system-ui','Fixture+monospace'].flatMap(n=>[`type:${n}`,`type:${n}:#abc,#123456`])]) {
  const f=set(base(),'questions[2].options[0].picture',picture);
  if(!picture.startsWith('type:'))delete f.questions[2].options[0].sample;
  passing.push([`picture ${picture}`,f]);
}
for(const picture of ['palette:','palette','palette:#abcd','palette:#12345678','palette:'+Array(9).fill('#abc').join(','),'palette:#abc:#123','motif:unknown','motif:dots:#fff','motif:dots:#fff,#000,#123','motif:dots:', 'type:Unknown','type:serif+sans-serif+monospace','type:serif:#1234,#fff','type:serif:#fff','http://x',''])bad(`bad picture ${picture}`,'questions[2].options[0].picture',picture);
bad('sample without type','questions[2].options[0].picture','motif:dots');refused.at(-1)[1]='questions[2].options[0].sample';
for(const [field,val,path] of [['min',1,'max'],['max',-1,'max'],['step',0,'step'],['step',-.1,'step'],['step',.3,'step'],['step',.001,'step'],['value',2,'value'],['value',.1,'value'],['min',Infinity,'min'],['max',NaN,'max']])bad(`slider ${field} ${val}`,`questions[4].${field}`,val),refused.at(-1)[1]=`questions[4].${path}`;
for(const step of [2,.02]){const f=base();f.questions[4].step=step;delete f.questions[4].value;passing.push([`slider steps ${2/step}`,f]);}
good('slider defaults','questions[4].step',undefined,true);delete passing.at(-1)[1].questions[4].value;
for(const path of ['id','intro','fonts','questions[0].short','questions[0].help','questions[0].options[0].note','questions[2].options[0].sample','questions[4].value','questions[4].minLabel','questions[4].maxLabel','questions[5].placeholder'])good(`${path} optional`,path,undefined,true);
export function template() {const f=base();f.slots={name:{about:'Member name',max:80},font:{about:'Font family',max:40}};f.title='For {{name}}';f.intro='{{name}} and {{name}}';f.fonts[0].family='{{font}}';f.questions[2].options[0].picture='type:{{font}}+serif';return f;}
// A line or paragraph separator breaks a line in the message as a newline does.
for(const sep of ['\u2028','\u2029'])for(const path of ['questions[0].short','questions[0].label','title'])bad(`separator ${sep.charCodeAt(0).toString(16)} in ${path}`,path,`Name${sep}- Budget`);
// Far from zero a small step vanishes in rounding: 2^53 + 1 is 2^53.
{const f=base();f.questions[4]={id:'range',type:'slider',label:'Range',min:9007199254740992,max:9007199254740994,step:1};refused.push(['slider steps that round together','questions[4].step',f]);}
// Change 2: picture questions can mix tiles and words, but still need two pictures.
export function mixedPictures(type='image-radio') {
  return {title:'Pictures and words',questions:[{id:'look',type,label:'Which look?',options:[
    {value:'neither',label:'Neither',note:'Use words instead'},
    {value:'a',label:'A',picture:'motif:dots'},
    {value:'b',label:'B',picture:'motif:grid'},
    {value:'c',label:'C',picture:'motif:waves'}
  ]}]};
}
for(const type of ['image-radio','image-checkbox']) {
  passing.push([`${type} three pictures and one word`,mixedPictures(type)]);
  const maximum=mixedPictures(type);maximum.questions[0].options.splice(3,1);
  for(let i=0;i<5;i++)maximum.questions[0].options.push({value:`word-${i}`,label:'A word'});
  passing.push([`${type} two pictures and six words`,maximum]);
  for(const count of [0,1]) {
    const f=mixedPictures(type);f.questions[0].options.forEach((o,i)=>{if(i>count)delete o.picture;});
    refused.push([`${type} ${count} pictures`,'questions[0].options',f]);
  }
  const sample=mixedPictures(type);sample.questions[0].options[0].sample='Words';
  refused.push([`${type} sample without picture`,'questions[0].options[0].sample',sample]);
}
