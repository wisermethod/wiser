// Board DOM view: one renderer for chat and local pages, using the shared model.
(() => {
const lib=globalThis.WiserBoards;
const el=(tag,cls,text,...children)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined&&text!==null)n.textContent=text;n.append(...children.filter(Boolean));return n;};
const serif=new Set(['Fraunces','Newsreader','Young Serif','Instrument Serif','Libre Caslon Text','Alegreya','Gloock','Source Serif 4','Literata','Alfa Slab One','Bodoni Moda','Zilla Slab','EB Garamond','Marcellus']);
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
  const thumbnail=compact;
  // Thumbnail rows contain the complete board, with its full type and sections.
  compact=false;
  const n=vars(el('div',`brand-board${thumbnail?' board-preview':''}`),b,mode);n.dataset.mode=mode;n.dataset.board=b.number;
  if(thumbnail)n.style.setProperty('--thumbnail-note-size',`${b.textStyles.note.size}px`);
  const pattern=el('div','page-pattern',null,repeatArt(b.modes[mode].drawings.pattern));pattern.style.opacity=b.graphics.pattern.strength[mode];pattern.style.transform=`rotate(${b.graphics.pattern.angle||0}deg)`;n.append(pattern);
  const block=v=>{
    switch(v.kind){
      case 'row':return el('div','board-row',null,...v.blocks.map(block));
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
  const rows=b.modes[mode][thumbnail?'tile':'blocks'].map(block).filter(Boolean);
  if(thumbnail){rows.push(footer(b));const split=model.layout.thumbnail.splitAfter;n.append(el('div','thumbnail-column',null,...rows.slice(0,split)),el('div','thumbnail-column',null,...rows.slice(split)));}
  else n.append(...rows);
  return n;
}
function footer(b) {
  const foot=el('footer','whole-foot');
  if(b.footer.closing)foot.append(el('p','last-line',b.footer.closing),el('p','example-answers',b.footer.examples.join('; ')));
  foot.append(el('p','licences',b.footer.licences.map(f=>`${f.family} (${f.role}) · ${globalThis.WiserForm.WORDS.licence}: ${f.licence}`).join('; ')));
  return foot;
}
function draw(model,b,{compact=false,logo,mode:showMode}={}) {
  const n=el('div','board-art');
  for(const mode of showMode?[showMode]:compact?[b.primaryMode]:[b.primaryMode,b.primaryMode==='light'?'dark':'light']) {
    const start=n.children.length;
    if(!compact)n.append(el('h2','board-mode',globalThis.WiserForm.WORDS[mode]));
    const drawing=board(model,b,mode,compact,logo);
    if(compact){
      const strip=el('div','thumbnail-swatches');
      for(const key of model.layout.thumbnail.swatches){const s=el('span','thumbnail-swatch');s.dataset.swatch=key;s.dataset.colour=b.palette[mode][key];s.style.background=b.palette[mode][key];strip.append(s);}
      n.append(el('div','thumbnail-surface',null,drawing,el('div','thumbnail-patch',null,strip)));
    }else n.append(drawing);
    if(!compact)n.append(footer(b));
    for(const part of [...n.children].slice(start))part.dataset.mode=mode;
  }
  return n;
}
const ns='http://www.w3.org/2000/svg';
function shape(tag,attrs={}) {
  const n=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);return n;
}
const stackPositions=new WeakMap();
function fitLooks() {
  lib.fitBoardThumbnails();
  for(const n of document.querySelectorAll('svg.look-art')) {
    // A look on a hidden page is fitted when its page is shown; measuring it undrawn can throw.
    if(!n.getClientRects().length)continue;
    const name=n.querySelector('.look-name'),lines=[...name.children],height=Number(name.dataset.lineHeight);
    name.style.fontSize='90px';
    const widest=Math.max(...lines.map(t=>t.getComputedTextLength()),1);
    let size=Math.min(90*294/widest,190/(height*lines.length));
    name.style.fontSize=`${size}px`;
    lines.forEach((t,i)=>t.setAttribute('y',i*size*height));
    // Advance width and line height do not bound the ink of every offered face.
    // Small SVG tiles can round glyph metrics at each size; remeasure the ink after shrinking.
    for(let pass=0;pass<4;pass++){
      const ink=name.getBBox(),scale=Math.min(1,294/Math.max(1,ink.width),190/Math.max(1,ink.height));
      if(scale===1)break;
      size*=scale*.99;name.style.fontSize=`${size}px`;
      lines.forEach((t,i)=>t.setAttribute('y',i*size*height));
    }
    const box=name.getBBox();name.setAttribute('transform',`translate(42 ${57+(210-box.height)/2-box.y})`);
    const initials=n.querySelector('.look-initials');
    if(initials){initials.style.fontSize=`${Math.min(36,size*.6)}px`;const width=initials.getComputedTextLength();if(width>100)initials.style.fontSize=`${parseFloat(initials.style.fontSize)*100/width}px`;}
    for(const [selector,above] of [['.look-stack-1',true],['.look-stack-2',false]]) {
      const line=n.querySelector(selector);if(!line)continue;
      const style=getComputedStyle(line),canvas=document.createElement('canvas');
      // An attached canvas carries the face's variation axes into TextMetrics.
      canvas.hidden=true;canvas.style.fontVariationSettings=style.fontVariationSettings;document.body.append(canvas);
      const context=canvas.getContext('2d');
      context.font=`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const ink=context.measureText(line.textContent);canvas.remove();
      const current=Number(line.getAttribute('y')),original=stackPositions.get(line)??current;
      stackPositions.set(line,original);
      // SVG's central baseline centres its em box, not the visible letter.
      // Refit from the drawn position when a loaded face replaces the fallback.
      const baseline=line.getBBox().y+ink.fontBoundingBoxAscent+original-current,rule=n.querySelector('.look-stack-rule').getBBox().y;
      const overlap=above?baseline+ink.actualBoundingBoxDescent-(rule-6):(rule+6)-(baseline-ink.actualBoundingBoxAscent);
      const fitted=original+(above?-1:1)*Math.max(0,overlap);
      if(fitted!==current)line.setAttribute('y',fitted);
    }
    const whole=n.querySelector('.look-large-initials');
    if(whole) {
      // TextMetrics measures glyph ink in the loaded face, rather than SVG's
      // em-height box. Font size is the only scale; keep natural proportions.
      // Half a unit of raster clearance keeps antialias fringes inside the field.
      const bottom=Number(whole.dataset.bottom),context=document.createElement('canvas').getContext('2d');
      const measure=fontSize=>{
        whole.style.fontSize=`${fontSize}px`;
        const style=getComputedStyle(whole);
        context.font=`${style.fontStyle} ${style.fontWeight} ${fontSize}px ${style.fontFamily}`;
        context.fontKerning=style.fontKerning;
        return context.measureText(whole.textContent);
      };
      let fontSize=100,ink=measure(fontSize);
      fontSize*=Math.min(211/(ink.actualBoundingBoxLeft+ink.actualBoundingBoxRight),(bottom-29)/(ink.actualBoundingBoxAscent+ink.actualBoundingBoxDescent));
      // Browser hinting can round the ink at each size. Remeasure after fitting.
      for(let pass=0;pass<4;pass++) {
        ink=measure(fontSize);
        const scale=Math.min(1,211/(ink.actualBoundingBoxLeft+ink.actualBoundingBoxRight),(bottom-29)/(ink.actualBoundingBoxAscent+ink.actualBoundingBoxDescent));
        if(scale===1)break;
        fontSize*=scale;
      }
      ink=measure(fontSize);
      whole.setAttribute('x',571.5-ink.actualBoundingBoxRight);
      whole.setAttribute('y',bottom-.5-ink.actualBoundingBoxDescent);
    }
  }
}
// Depth cards use a closed set of drawing effects.
// The closed schema keeps depth from adding effects the taxonomy refuses.
const {depthOptions,depthColour,depthInset}=globalThis.WiserBoardDepth;
function depthGradient(defs,stops,kind,angle,box) {
  const id=`depth-gradient-${++drawingId}`;
  let gradient;
  if(kind==='radial')gradient=shape('radialGradient',{id,gradientUnits:'userSpaceOnUse',cx:box.x+box.width*.3,cy:box.y+box.height*.25,r:Math.hypot(box.width*.7,box.height*.75)});
  else {
    // CSS-like angle: 0 is up, 90 is right. User-space endpoints keep the
    // requested angle on rectangular cards rather than stretching a unit box.
    const radians=angle*Math.PI/180,dx=Math.sin(radians),dy=-Math.cos(radians),half=(Math.abs(box.width*dx)+Math.abs(box.height*dy))/2;
    const cx=box.x+box.width/2,cy=box.y+box.height/2;
    gradient=shape('linearGradient',{id,gradientUnits:'userSpaceOnUse',x1:cx-dx*half,y1:cy-dy*half,x2:cx+dx*half,y2:cy+dy*half});
  }
  gradient.setAttribute('color-interpolation','sRGB');
  stops.forEach((colour,i)=>gradient.append(shape('stop',{offset:stops.length===3?[0,.65,1][i]:i,'stop-color':colour})));
  defs.append(gradient);return `url(#${id})`;
}
function lookDepth(model,b,{logo}={}) {
  const d=depthOptions(b),mode=b.primaryMode,c=b.palette[mode];
  const n=shape('svg',{viewBox:'0 0 600 360',class:'look-art','aria-hidden':'true','data-mode':mode,'data-depth':d.background,'data-mark':d.mark}),defs=shape('defs'),surface=shape('g',{class:'look-surface'});
  n.append(defs,surface);
  if(d.cardCorner) {
    const id=`depth-clip-${++drawingId}`,clip=shape('clipPath',{id,clipPathUnits:'userSpaceOnUse'});
    clip.append(shape('rect',{width:600,height:360,rx:d.cardCorner}));defs.append(clip);surface.setAttribute('clip-path',`url(#${id})`);
  }
  const groundFill=d.background==='gradient'?depthGradient(defs,d.groundStops,d.kind,d.angle,{x:0,y:0,width:600,height:360}):c.ground;
  surface.append(shape('rect',{class:'look-ground',width:600,height:360,fill:groundFill}));
  if(d.background==='texture'&&d.texture==='pattern') {
    const pattern=repeatArt(b.modes[mode].drawings.pattern);
    for(const [k,v]of Object.entries({class:'look-pattern',width:600,height:360,opacity:b.graphics.pattern.strength[mode],transform:`rotate(${b.graphics.pattern.angle||0} 300 180)`}))pattern.setAttribute(k,v);
    surface.append(pattern);
  }else if(d.background==='texture') {
    const id=`depth-grain-${++drawingId}`,filter=shape('filter',{id,x:0,y:0,width:'100%',height:'100%','color-interpolation-filters':'sRGB'});
    filter.append(shape('feTurbulence',{type:'fractalNoise',baseFrequency:.75,numOctaves:3,seed:17,stitchTiles:'stitch'}),shape('feColorMatrix',{type:'saturate',values:0}));defs.append(filter);
    surface.append(shape('rect',{class:'look-grain',width:600,height:360,filter:`url(#${id})`,opacity:.07}));
  }
  const name=type(shape('g',{class:'look-name',fill:c.headline}),b.textStyles.headline);
  name.dataset.lineHeight=Math.max(1,b.textStyles.headline.lineHeight);
  for(const word of model.person.split(/\s+/).filter(Boolean)){const line=shape('text',{x:0,y:0});line.textContent=word;name.append(line);}
  // Bands sit behind marks; oversized initials stop at the band's top edge.
  if(d.band==='three')for(const [x,width,role]of [[0,300,'panel'],[300,200,'pop'],[500,100,'deep']])surface.append(shape('rect',{class:'look-band',x,y:302,width,height:58,fill:c[role]}));
  else if(d.band==='six') {
    ['ground','panel','text','pop','deep','mark'].forEach((role,i)=>surface.append(shape('rect',{class:'look-band','data-role':role,x:i*100,y:302,width:100,height:58,fill:c[role]})));
    surface.append(shape('rect',{class:'look-band-rule',x:0,y:302,width:600,height:1,fill:c.hairline}));
  }
  else if(d.band==='strip')surface.append(shape('rect',{class:'look-band',x:0,y:352,width:600,height:8,fill:c.pop}));
  surface.append(name);
  const hasBlock=!!logo||d.mark==='badge'||d.mark==='letter'||(d.mark==='seal'&&d.sealOn==='block')||(d.mark==='stack'&&d.stackOn==='block');
  const rx=d.corner==='pill'?84:d.corner,block=shape('rect',{class:'look-block',x:390,y:61,width:168,height:200,rx});
  if(hasBlock) {
    block.setAttribute('fill',d.popStops.length>1?depthGradient(defs,d.popStops,'linear',d.angle,{x:390,y:61,width:168,height:200}):c.pop);
    surface.append(block);
    // Opaque shapes overlap throughout: block under inset, inset under plate.
    if(d.inset)surface.append(shape('rect',{class:'look-inset',x:402,y:77,width:144,height:168,rx:d.corner==='pill'?72:Math.max(0,rx-8),fill:depthInset(depthColour('pop',c,'pop'),d.inset)}));
  }
  const heading={...b.textStyles.headline,letterSpacing:0};
  const text=(target,value,attrs,size,style=heading)=>{
    const node=type(shape('text',{class:`look-mark-text look-${target}`,fill:hasBlock?c.onPop:c[d.ink],...attrs}),{...style,size});
    node.dataset.target=target;node.textContent=value;return node;
  };
  const clipToBlock=()=>{
    const id=`depth-block-clip-${++drawingId}`,clip=shape('clipPath',{id,clipPathUnits:'userSpaceOnUse'}),outline=block.cloneNode();
    outline.removeAttribute('class');outline.removeAttribute('fill');clip.append(outline);defs.append(clip);
    const group=shape('g',{'clip-path':`url(#${id})`,class:'look-mark-clip'});surface.append(group);return group;
  };
  if(logo){const drawing=art(logo,'look-mark');for(const [k,v]of Object.entries({x:414,y:101,width:120,height:120}))drawing.setAttribute(k,v);surface.append(drawing);}
  else if(d.mark==='badge') {
    const plate=b.monogram.surfaces?.ground,ink=plate?c.pop:c.onPop;
    // The old 120px plate shared the frame's outer edge. Its antialiasing
    // leaked a pale hairline. A 2-unit inset leaves >=1 unit of opaque overlap
    // under the frame's inner edge without exposing the plate at its outside.
    if(plate)surface.append(shape('rect',{class:'look-plate',x:416,y:103,width:116,height:116,rx:116*plate.radius/100,fill:c.onPop}));
    const drawing=art(b.monogram.container.replace(/currentColor/g,ink).replace(/\{\{([A-Za-z]+)\}\}/g,(_,role)=>c[role]),'look-mark');
    for(const [k,v]of Object.entries({x:414,y:101,width:120,height:120}))drawing.setAttribute(k,v);surface.append(drawing);
    const initials=type(shape('text',{class:'look-initials look-mark-text',x:474,y:161,'text-anchor':'middle','dominant-baseline':'central',fill:ink}),{...b.textStyles.person,weight:b.type.heading.sizes.small.weight,letterSpacing:0});
    initials.dataset.target='initials';initials.textContent=b.monogram.initials;surface.append(initials);
  }else if(d.mark==='initials') {
    // Fitted after attachment and font loading, like the name. The whole mark
    // stays on the ground, between x360 and x572, standing on the band.
    const bottom=d.band==='six'||d.band==='three'?302:d.band==='strip'?352:332;
    surface.append(text('large-initials',b.monogram.initials,{x:360,y:bottom,'data-bottom':bottom},100));
  }else if(d.mark==='letter') {
    clipToBlock().append(text('letter',[...b.monogram.initials][0],{x:377,y:284,textLength:195,lengthAdjust:'spacingAndGlyphs'},290));
  }else if(d.mark==='stack') {
    const group=hasBlock?clipToBlock():surface,letters=[...b.monogram.initials];
    // Single-letter initials remain single; longer initials share the second line.
    const lines=letters.length>1?[letters[0],letters.slice(1).join('')]:letters;
    lines.forEach((value,i)=>group.append(text(`stack-${i+1}`,value,{x:474,y:lines.length===1?161:116+i*91,'text-anchor':'middle','dominant-baseline':'central',textLength:value.length>1?100:64,lengthAdjust:'spacingAndGlyphs'},88)));
    group.append(shape('path',{class:'look-stack-rule',d:'M430 161 H518',fill:'none',stroke:hasBlock?c.onPop:c[d.ink],'stroke-width':1}));
  }else if(d.mark==='seal') {
    const ink=hasBlock?c.onPop:c[d.ink],container=new DOMParser().parseFromString(b.monogram.container,'image/svg+xml');
    // Stroke containers carry their line weight literally. Filled containers
    // use a 7/100 silhouette weight instead.
    const weights=[...container.querySelectorAll('[stroke-width]')].map(n=>Number(n.getAttribute('stroke-width'))).filter(Number.isFinite),weight=(weights.length?Math.max(...weights):7)*1.2;
    const seal=shape('g',{class:'look-seal'});surface.append(seal);
    seal.append(shape('circle',{class:'look-seal-ring',cx:474,cy:161,r:76,fill:'none',stroke:ink,'stroke-width':weight}));
    const id=`depth-seal-path-${++drawingId}`,radius=59;
    defs.append(shape('path',{id,d:`M474 102 A${radius} ${radius} 0 1 1 473.99 102`}));
    const ring=text('seal-text','',{fill:ink},12,{...b.textStyles.body,weight:b.type.body.sizes.small.weight,letterSpacing:.12});
    const path=shape('textPath',{href:`#${id}`,startOffset:'2%',textLength:2*Math.PI*radius*.96,lengthAdjust:'spacingAndGlyphs'});
    path.textContent=`${b.content.brandName.toUpperCase()} · ${b.content.brandName.toUpperCase()} · `;ring.append(path);seal.append(ring);
    seal.append(text('seal-initials',b.monogram.initials,{x:474,y:161,'text-anchor':'middle','dominant-baseline':'central',fill:ink,textLength:90,lengthAdjust:'spacingAndGlyphs'},58));
  }
  return n;
}
function look(model,b,{logo}={}) {
  if(b.depth!==undefined)return lookDepth(model,b,{logo});
  const mode=b.primaryMode,c=b.palette[mode],n=shape('svg',{viewBox:'0 0 600 360',class:'look-art','aria-hidden':'true','data-mode':mode});
  n.append(shape('rect',{width:600,height:360,fill:c.ground}));
  const pattern=repeatArt(b.modes[mode].drawings.pattern);
  for(const [k,v]of Object.entries({class:'look-pattern',width:600,height:360,opacity:b.graphics.pattern.strength[mode],transform:`rotate(${b.graphics.pattern.angle||0} 300 180)`}))pattern.setAttribute(k,v);
  n.append(pattern);
  const name=type(shape('g',{class:'look-name',fill:c.headline}),b.textStyles.headline);
  name.dataset.lineHeight=Math.max(1,b.textStyles.headline.lineHeight);
  for(const word of model.person.split(/\s+/).filter(Boolean)){const line=shape('text',{x:0,y:0});line.textContent=word;name.append(line);}
  n.append(name,shape('rect',{x:390,y:61,width:168,height:200,fill:c.pop}));
  if(logo){const drawing=art(logo,'look-mark');for(const [k,v]of Object.entries({x:414,y:101,width:120,height:120}))drawing.setAttribute(k,v);n.append(drawing);}
  else {
    const plate=b.monogram.surfaces?.ground,ink=plate?c.pop:c.onPop;
    if(plate)n.append(shape('rect',{x:414,y:101,width:120,height:120,rx:120*plate.radius/100,fill:c.onPop}));
    const drawing=art(b.monogram.container.replace(/currentColor/g,ink).replace(/\{\{([A-Za-z]+)\}\}/g,(_,role)=>c[role]),'look-mark');
    for(const [k,v]of Object.entries({x:414,y:101,width:120,height:120}))drawing.setAttribute(k,v);n.append(drawing);
    const initials=type(shape('text',{class:'look-initials',x:474,y:161,'text-anchor':'middle','dominant-baseline':'central',fill:ink}),{...b.textStyles.person,weight:b.type.heading.sizes.small.weight,letterSpacing:0});
    initials.textContent=b.monogram.initials;n.append(initials);
  }
  for(const [x,width,role]of [[0,300,'panel'],[300,200,'pop'],[500,100,'deep']])n.append(shape('rect',{x,y:302,width,height:58,fill:c[role]}));
  return n;
}
document.fonts.addEventListener('loadingdone',fitLooks);
window.addEventListener('resize',fitLooks);
function loadFonts(model,hosts) {
  const used=new Set();
  for(const b of model.boards)for(const face of Object.values(b.type))for(const f of lib.PUBLIC_FONT_FILES[face.family]||[]) {
    if(used.has(f.url))continue;used.add(f.url);
    const u=new URL(f.url);if(!hosts.includes(u.origin)||u.protocol!=='https:')continue;
    try{const ff=new FontFace(face.family,`url(${JSON.stringify(u.href)})`,{weight:Array.isArray(f.weight)?f.weight.join(' '):String(f.weight),style:f.style});document.fonts.add(ff);ff.load().catch(()=>{});}catch{/* Keep the generic of the same kind. */}
  }
}
globalThis.WiserBoardView={draw,look,fitLooks,loadFonts};
})();
