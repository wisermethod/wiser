// Portable board adapter. The generated sources own assembly and validation.
import { BOARD_PARTS, PUBLIC_FONT_FILES, assembleCore, validateBrandBoards, createBoardModel, checkSvg, DEFAULT_MARK_CAPTION } from '../engine/boards-lib.js';
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
export const BOARD_KEYS = ['pairing','palette','graphicSet','container','primaryMode','handwriting','buttonRadius','heroPhrase','content','note','sample','items','closingExamples'];
export function resolveBoards(brand,options) {
  const boards=options.map((o,i) => {
    const v=o.board;
    if(!v || typeof v !== 'object' || Array.isArray(v)) throw Error('board must be an object.');
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
