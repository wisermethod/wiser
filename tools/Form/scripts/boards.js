// Portable board adapter. The generated sources own assembly and validation.
import { BOARD_PARTS, PUBLIC_FONT_FILES, assembleCore, validateBrandBoards, createBoardModel, checkSvg, DEFAULT_MARK_CAPTION, depthSchema } from '../engine/boards-lib.js';
export const BOARD_LIMITS = Object.freeze({logoBytes:8192,name:80,initials:12,sentence:300,body:500,words:5,word:60,label:120,note:300,recommendation:200});
export function minimumPicks(question) { return question.min ?? (question.pick === 1 ? 1 : 0); }
export function actionAllowed(needs,count,min=1) {
  return needs === 'one' ? count === 1 : needs === 'some' ? count >= Math.max(1,min) : needs === 'none' ? count === 0 : needs === 'any';
}
export function displayOnly(form) { return form.questions.length === 1 && form.questions[0].type === 'boards' && form.questions[0].pick === 0; }
export function checkLogo(logo) {
  if(typeof logo !== 'string' || new TextEncoder().encode(logo).length > BOARD_LIMITS.logoBytes) throw Error('Logo must be SVG text, at most 8192 UTF-8 bytes.');
  checkSvg(new TextEncoder().encode(logo));
}
export const BOARD_KEYS = ['pairing','palette','graphicSet','container','primaryMode','depth','handwriting','buttonRadius','heroPhrase','content','note','sample','items','closingExamples'];
export const BOARD_DEFAULT_KEYS = BOARD_KEYS.filter(k=>!['pairing','palette','graphicSet','container','primaryMode','depth'].includes(k));
// Palette ids carry the colour family's ordered three steps.
export function palettePosition(id) {
  const match=typeof id==='string'&&id.match(/^(.+)-(muted|balanced|bold)$/);
  return match?{family:match[1],index:['muted','balanced','bold'].indexOf(match[2])}:null;
}
export function stepBoard(option,step,view,mode=option.board.primaryMode) {
  const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  const equal=(a,b)=>a===b||object(a)&&object(b)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.hasOwn(b,k)&&equal(a[k],b[k]));
  if(Object.hasOwn(step,'depth')) {
    if(view!=='look')throw Error('Step depth is allowed only in look view.');
    if(!object(step.depth))throw Error('Step depth must be an object.');
    for(const [key,overlay]of Object.entries(step.depth)) {
      if(!['light','dark'].includes(key))throw Error(`Unknown step depth mode ${key}.`);
      if(!object(overlay))throw Error(`Step depth.${key} must be an object.`);
      for(const [field,value]of Object.entries(overlay)) {
        if(!Object.hasOwn(depthSchema.properties,field))throw Error(`Unknown step depth field ${field}.`);
        if(equal(value,option.board.depth?.[field]))throw Error(`Step depth.${key}.${field} equals board.depth; omit the redundant field.`);
      }
    }
  }
  // A listed depth field replaces the entire field, including nested objects.
  return {...option.board,palette:step.palette,primaryMode:mode,...(view==='look'?{depth:{...option.board.depth,...step.depth?.[mode]}}:{})};
}
export function resolveBoards(brand,options,boardDefaults={},view) {
  // Resolve each supplied step once at load, with the same single-board checks
  // used by the format checker. Drawing only selects from these saved models.
  if(view && options.some(o=>Array.isArray(o.steps))) {
    const model=resolveBoards(brand,options,boardDefaults);
    const steps=options.map((o,i)=>{
      if(!o.steps)return [{value:o.value,boards:{light:model.boards[i],dark:model.boards[i]}}];
      return o.steps.map(step=>{
        const boards={};
        for(const mode of view==='look'?['light','dark']:[o.board.primaryMode]) {
          const variant={...o,label:step.label??o.label??`Look ${i+1}`,board:stepBoard(o,step,view,mode)};
          const b=resolveBoards(brand,[variant],boardDefaults).boards[0];b.number=i+1;
          boards[mode]=b;
        }
        if(view!=='look')boards.light=boards.dark=Object.values(boards)[0];
        return {value:step.value,boards};
      });
    });
    return {...model,boards:steps.map((row,i)=>row.find(s=>s.value===options[i].value).boards[options[i].board.primaryMode]),steps};
  }
  if(!boardDefaults || typeof boardDefaults !== 'object' || Array.isArray(boardDefaults)) throw Error('boardDefaults must be an object.');
  for(const k of Object.keys(boardDefaults)) if(!BOARD_DEFAULT_KEYS.includes(k)) throw Error(`Unknown boardDefaults field ${k}.`);
  const boards=options.map((o,i) => {
    const supplied=o.board;
    if(!supplied || typeof supplied !== 'object' || Array.isArray(supplied)) throw Error('board must be an object.');
    const v={...boardDefaults,...supplied};
    for(const k of Object.keys(v)) if(!BOARD_KEYS.includes(k)) throw Error(`Unknown board field ${k}.`);
    for(const k of ['pairing','palette','graphicSet','primaryMode']) if(!Object.hasOwn(v,k)) throw Error(`Missing board field ${k}.`);
    if(brand.logo) { if(Object.hasOwn(v,'container')) throw Error('A kept logo replaces the container.'); }
    else if(!Object.hasOwn(v,'container')) throw Error('Missing board field container.');
    if(Object.hasOwn(v,'content')&&(!v.content||typeof v.content!=='object'||Array.isArray(v.content)))throw Error('Board content must be an object.');
    const content=v.content??{};
    for(const k of Object.keys(content)) if(!['smallPrint','photoRules','never','markCaption','closing'].includes(k)) throw Error(`Unknown board content field ${k}.`);
    const label=o.label??`Look ${i+1}`;
    const b={number:i+1,name:label,group:'boards',energy:BOARD_PARTS.palettes.find(p=>p.id===v.palette?.id)?.energy,
      why:o.note||label,...(o.recommendation?{recommendation:o.recommendation}:{}),buttonRadius:4,handwriting:null,
      initials:brand.initials,heroPhrase:brand.sentence,
      note:{text:brand.words[0]?.word??brand.name,direction:'left'},
      sample:{kicker:brand.name,title:brand.sentence,phrase:brand.sentence,body:brand.body,note:brand.words[0]?.word??brand.name,steps:brand.words.length?brand.words.map(w=>w.word):[brand.name],meta:brand.name},
      items:{cardLine:brand.body,cardBack:brand.sentence,bannerHeadline:brand.sentence,bannerLine:brand.body,contact:brand.name,primaryAction:brand.words[0]?.word??brand.name,secondaryAction:brand.words[1]?.word??brand.name},
      closingExamples:[brand.sentence,brand.body],...v,
      content:{brandName:brand.name,sentence:brand.sentence,body:brand.body,smallPrint:brand.body,never:brand.words.map(w=>w.not),markCaption:DEFAULT_MARK_CAPTION,closing:null,...content},words:brand.words};
    if(brand.logo) { delete b.initials;delete b.container;b.markFile='kept-logo'; }
    return b;
  });
  const spec=assembleCore({person:brand.name,intro:[brand.name,brand.sentence],groups:[{id:'boards',label:brand.name}],footnote:brand.body,boards},BOARD_PARTS,{
    resolveFont(face) {
      const files=PUBLIC_FONT_FILES[face.family];
      if(!files) throw Error(`No public files for ${face.family}.`);
      return {...face,files:files.map(f=>({path:f.url,weight:f.weight,style:f.style}))};
    }
  });
  const publicUrls=new Set(Object.values(PUBLIC_FONT_FILES).flat().map(f=>f.url));
  const assets={add(path,kind) {
    if(kind==='font' && publicUrls.has(path)) return {path};
    if(kind==='image' && path==='kept-logo' && brand.logo) { checkLogo(brand.logo);return {supplied:true}; }
    throw Error('Only bundled public fonts and the kept SVG logo are allowed.');
  }};
  return createBoardModel(validateBrandBoards(spec,assets,()=>{}));
}
