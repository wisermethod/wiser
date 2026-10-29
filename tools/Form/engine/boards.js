// Board DOM view: one renderer for chat and local pages, using the shared model.
(() => {
const lib=globalThis.WiserBoards;
const el=(tag,cls,text,...children)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined&&text!==null)n.textContent=text;n.append(...children.filter(Boolean));return n;};
const serif=new Set(['Fraunces','Newsreader','Young Serif','Instrument Serif','Libre Caslon Text','Alegreya','Gloock','Source Serif 4','Literata','Alfa Slab One']);
const fallback=family=>serif.has(family)?'serif':'sans-serif';
function type(node,v) {
  Object.assign(node.style,{fontFamily:`${JSON.stringify(v.family)}, ${fallback(v.family)}`,fontWeight:v.weight,fontStyle:v.style,fontSize:`${v.size}px`,lineHeight:v.lineHeight,letterSpacing:`${v.letterSpacing}em`,fontVariationSettings:v.variations?Object.entries(v.variations).map(([k,v])=>`"${k}" ${v}`).join(','):'normal'});return node;
}
let drawingId=0;
function art(text,cls) {
  // Validated standalone SVG, parsed as XML; never a document or an external image.
  const doc=new DOMParser().parseFromString(text,'image/svg+xml');
  const root=document.importNode(doc.documentElement,true);
  // Local ids are unique per drawing instance, so a kept logo can appear repeatedly.
  const ids=new Map([...root.querySelectorAll('[id]')].map(n=>[n.id,`drawing-${++drawingId}-${n.id}`]));
  if(root.id)ids.set(root.id,`drawing-${++drawingId}-${root.id}`);
  for(const n of [root,...root.querySelectorAll('*')])for(const a of [...n.attributes]) {
    if(a.name==='id')n.setAttribute(a.name,ids.get(a.value));
    else if(a.value.startsWith('#')&&ids.has(a.value.slice(1)))n.setAttribute(a.name,`#${ids.get(a.value.slice(1))}`);
    else if(a.value.includes('url('))n.setAttribute(a.name,a.value.replace(/#([A-Za-z_][\w.-]*)/g,(_,id)=>`#${ids.get(id)??id}`));
  }
  if(cls){root.setAttribute('class',cls);if(/phrase-ink|rule|arrow|legend|sample/.test(cls))root.setAttribute('preserveAspectRatio','none');}root.setAttribute('aria-hidden','true');return root;
}
function repeatArt(text) {
  const tile=art(text),ns="http://www.w3.org/2000/svg",root=document.createElementNS(ns,"svg"),defs=document.createElementNS(ns,"defs"),pattern=document.createElementNS(ns,"pattern"),rect=document.createElementNS(ns,"rect");
  const box=tile.getAttribute("viewBox").split(/[ ,]+/).map(Number),id=`repeat-${++drawingId}`;
  pattern.setAttribute("id",id);pattern.setAttribute("patternUnits","userSpaceOnUse");pattern.setAttribute("width",tile.getAttribute("width")||box[2]);pattern.setAttribute("height",tile.getAttribute("height")||box[3]);pattern.setAttribute("viewBox",box.join(' '));
  pattern.append(...tile.childNodes);defs.append(pattern);rect.setAttribute("width","100%");rect.setAttribute("height","100%");rect.setAttribute("fill",`url(#${id})`);root.append(defs,rect);return root;
}
function vars(node,b,mode) {
  for(const [k,v]of Object.entries(b.palette[mode]))node.style.setProperty(`--${k}`,v);
  node.style.setProperty('--radius',`${b.buttonRadius}px`);node.style.setProperty('--display-size',`${b.type.heading.sizes.display.size}px`);
  type(node,b.textStyles.body);return node;
}
function mark(b,mode,size,surface='ground',logo) {
  if(logo){const n=el('span','own-mark');n.style.width=`${size}px`;n.style.height=`${size}px`;n.append(art(logo));return n;}
  const v=b.modes[mode].drawings.monogram[surface],n=type(el('span','monogram'),b.textStyles.monograms[size]);
  Object.assign(n.style,{width:`${size}px`,height:`${size}px`,color:v.ink,background:v.background??'transparent',borderRadius:`${v.radius}%`});
  n.append(art(v.svg),el('span',null,b.monogram.initials));return n;
}
function lockup(model,b,mode,compact,logo) {
  let m=mark(b,mode,compact?28:56,'ground',logo);
  if(b.graphics.hero.placement==='monogram')m=el('span','hero-monogram',null,m,art(b.modes[mode].drawings.hero,'hero-frame'));
  return type(el('div','lockup person',null,m,el('span',null,model.person)),compact?b.textStyles.tilePerson:b.textStyles.person);
}
function phrase(text,selected,drawing,cls) {
  const n=document.createDocumentFragment(),i=text.indexOf(selected);
  n.append(document.createTextNode(text.slice(0,i)),el('span',cls,selected,art(drawing,'phrase-ink')),document.createTextNode(text.slice(i+selected.length)));return n;
}
function swatches(b,mode,compact=false,chips=false) {
  const list=b.modes[mode][chips?'chips':'swatches'],n=el(chips?'div':'section',chips?'named-chips':'palette'),bars=chips?n:el('div','swatches');
  for(const s of list){const bar=el('div','colour-bar',null,el('div',null,null,type(el('b',null,s.name||s.value),compact?b.textStyles.tileSwatch:b.textStyles.swatch)));
    bar.style.background=s.value;bar.style.color=s.ink;
    if(!compact)bar.append(el('span','value',s.value));bars.append(bar);
  }
  if(!chips){n.append(bars);if(!compact){const strip=el('div','share-strip');strip.setAttribute('aria-hidden','true');for(const s of list){const i=el('i');i.style.flex=s.share;i.style.background=s.value;strip.append(i);}n.append(strip);}}
  return n;
}
function types(b,compact) {
  const n=document.createDocumentFragment();
  if(compact){const strip=el('section','type-strip');for(const [r,f]of Object.entries(b.type))if(r!=='handwriting'||![b.type.heading.family,b.type.body.family].includes(f.family))strip.append(type(el('span',`strip-aa strip-${r}`,'Aa'),b.textStyles.strip[r]),el('span','label',f.stripLabel||f.family));return strip;}
  for(const r of ['heading','body']){const f=b.type[r],v=b.textStyles.specimens[r];n.append(el('section',`face-sample ${r}-face`,null,
    type(el('h3',null,f.family),v.name),el('p','label',`${f.description} ${f.licence}`),type(el('div','aa','Aa'),v.aa),type(el('p','type-line',f.sample),v.line)));}
  if(b.words?.length){const ul=el('ul');for(const w of b.words)ul.append(type(el('li',null,w.word+', ',el('i',null,globalThis.WiserForm.WORDS.boardNot.replace('{word}',w.not))),b.textStyles.words));n.append(el('section','words',null,el('p','label',b.labels.words),ul));}
  return n;
}
function graphic(b,mode) {
  const d=b.modes[mode].drawings.sample,v=b.textStyles;
  const steps=el('div');for(const s of b.sample.steps)steps.append(el('span',null,s));
  const page=el('div','sample-page',null,art(d.rule,'sample-rule'),el('p','sample-kicker',b.sample.kicker),type(el('h3','sample-title',null,phrase(b.sample.title,b.sample.phrase,d.circle,'ring')),v.sampleTitle),
    el('div','sample-body',null,el('p',null,b.sample.body),type(el('aside',null,b.sample.note),v.sampleNote)),el('div','sample-steps',null,art(d.path),steps),art(d.closing,'sample-close'));
  const ul=el('ul');for(const m of b.modes[mode].drawings.legend)ul.append(el('li',null,null,art(m.svg,'legend-mark'),el('span',null,null,el('b',null,m.name+'. '),document.createTextNode(m.use))));
  return el('section','graphic-language',null,page,el('div','legend',null,type(el('h3',null,b.graphics.title),v.legendTitle),el('p','label',b.graphics.description),ul));
}
function cards(model,b,mode,compact,logo) {
  const v=b.textStyles;
  const front=el('div','business-card front',null,el('div','card-name',null,type(el('b',null,b.content.brandName),compact?v.tileCardName:v.cardName),mark(b,mode,compact?20:40,'cardFront',logo)),el('span',null,b.items.cardLine),el('span','contact',b.items.contact));
  const texture=el('div','texture',null,repeatArt(b.modes[mode].drawings.texture));texture.style.opacity=b.graphics.texture.strength[mode];
  const back=el('div','business-card back',null,texture,mark(b,mode,compact?32:56,'cardBack',logo),type(el('b',null,compact?(b.items.cardBackShort||b.items.cardBack):b.items.cardBack),compact?v.tileCardBack:v.cardBack));
  if(compact){const n=document.createDocumentFragment();n.append(front,back);return n;}
  const row=el('div','size-row');for(const size of [112,56,28])row.append(mark(b,mode,size,'ground',logo));
  row.append(el('div','browser-tab',null,el('span',null,null,mark(b,mode,16,'ground',logo),document.createTextNode(model.person))));
  return el('section','items',null,el('div','card-pair',null,front,back),el('p','label',b.labels.card),el('section','mark-sizes',null,row,el('p','label',b.markCaption+' · '+b.labels.markSizes)));
}
function other(model,b,mode,logo) {
  const m=mode==='light'?'dark':'light',v=b.textStyles;
  return vars(el('section','other-mode',null,el('div','other-left',null,lockup(model,b,m,false,logo),type(el('h2',null,b.content.sentence),v.otherHeadline),el('p',null,b.content.body),el('div','actions',null,el('span','board-button',b.items.primaryAction),el('span','secondary-link',b.items.secondaryAction))),
    el('div','other-right',null,el('div','content-card',null,el('p','sample-kicker',b.sample.kicker),type(el('b',null,null,phrase(b.sample.title,b.sample.phrase,b.modes[m].drawings.sample.circle,'ring')),v.contentCard),el('span','label',b.sample.meta)),swatches(b,m,false,true))),b,m);
}
function board(model,b,mode,compact,logo) {
  const n=vars(el('div',`brand-board${compact?' board-preview':''}`),b,mode);n.dataset.mode=mode;n.dataset.board=b.number;
  const pattern=el('div','page-pattern',null,repeatArt(b.modes[mode].drawings.pattern));pattern.style.opacity=b.graphics.pattern.strength[mode];pattern.style.transform=`rotate(${b.graphics.pattern.angle||0}deg)`;n.append(pattern);
  const block=v=>{
    switch(v.kind){
      case 'hero':{const h=type(el('h2','brand-headline'),compact?b.textStyles.tileHeadline:b.textStyles.headline);
        h.style.maxWidth=`min(${b.type.heading.sizes.display.maxWidth||12}em,100%)`;
        h.append(b.graphics.hero.placement==='monogram'?document.createTextNode(b.content.sentence):phrase(b.content.sentence,b.graphics.hero.phrase||b.content.sentence,b.modes[mode].drawings.hero,`hero-phrase ${b.graphics.hero.shape||'underline'}`));
        if(!compact)h.append(type(el('aside','margin-note',null,art(b.modes[mode].drawings.arrow,`note-arrow arrow-${b.note.direction}`),el('span',null,b.note.text)),b.textStyles.note));
        return el('section','brand-hero',null,lockup(model,b,mode,compact,logo),h,el('p','hero-body',b.content.body),compact?null:el('p','hero-small label',b.content.smallPrint));}
      case 'palette':return swatches(b,mode,compact);
      case 'type':return types(b,compact);
      case 'tileTop':return el('div','tile-top',null,...v.blocks.map(block));
      case 'tileItems':return el('section','tile-items',null,...v.blocks.map(block));
      case 'tileBanner':return vars(el('div','tile-banner',null,type(el('div','lockup',b.content.brandName),b.textStyles.tileBannerName),type(el('b',null,b.items.tileBannerHeadline||b.items.bannerHeadline),b.textStyles.tileBannerHeadline),el('span','board-button',b.items.primaryAction)),b,mode==='light'?'dark':'light');
      case 'cards':return cards(model,b,mode,compact,logo);
      case 'graphicLanguage':return graphic(b,mode);
      case 'banner':return el('section','banner-section',null,el('div','social-banner',null,art(b.modes[mode].drawings.sample.rule,'banner-rule'),el('div','banner-copy',null,type(el('b',null,b.items.bannerHeadline),b.textStyles.banner),el('p',null,b.items.bannerLine)),el('span','banner-contact',b.items.contact)),el('p','label',b.labels.banner));
      case 'otherMode':return other(model,b,mode,logo);
      case 'rules':{const r=el('section','rules');if(v.photoRules)r.append(el('div',null,null,type(el('h3',null,b.labels.photoRules),b.textStyles.ruleTitle),el('p',null,v.photoRules)));if(v.never.length)r.append(el('div',null,null,type(el('h3',null,b.labels.never),b.textStyles.ruleTitle),el('p',null,v.never.join(' '))));return r;}
      case 'open':return null;
      default:throw Error('Unknown board block '+v.kind);
    }
  };
  n.append(...b.modes[mode][compact?'tile':'blocks'].map(block).filter(Boolean));return n;
}
function draw(model,b,{compact=false,logo}={}) {
  const n=el('div','board-art');
  for(const mode of compact?[b.primaryMode]:[b.primaryMode,b.primaryMode==='light'?'dark':'light']) {
    if(!compact)n.append(el('h2','board-mode',globalThis.WiserForm.WORDS[mode]));
    n.append(board(model,b,mode,compact,logo));
    if(!compact){const foot=el('footer','whole-foot');if(b.footer.closing)foot.append(el('p','last-line',b.footer.closing),el('p','example-answers',b.footer.examples.join('; ')));foot.append(el('p','licences',b.footer.licences.map(f=>`${f.family} (${f.role}) · ${globalThis.WiserForm.WORDS.licence}: ${f.licence}`).join('; ')));n.append(foot);}
  }
  return n;
}
function loadFonts(model,hosts) {
  const used=new Set();
  for(const b of model.boards)for(const face of Object.values(b.type))for(const f of lib.PUBLIC_FONT_FILES[face.family]||[]) {
    if(used.has(f.url))continue;used.add(f.url);
    const u=new URL(f.url);if(!hosts.includes(u.origin)||u.protocol!=='https:')continue;
    try{const ff=new FontFace(face.family,`url(${JSON.stringify(u.href)})`,{weight:Array.isArray(f.weight)?f.weight.join(' '):String(f.weight),style:f.style});document.fonts.add(ff);ff.load().catch(()=>{});}catch{/* Keep the generic of the same kind. */}
  }
}
globalThis.WiserBoardView={draw,loadFonts};
})();
