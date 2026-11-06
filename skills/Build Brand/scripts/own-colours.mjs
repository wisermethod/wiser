#!/usr/bin/env node
// Standalone port of the card matrix derivation and reading checks (2026-11-06).
// Built-ins only. No network, installs, configuration, stdin or writes.
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const HELP = `Build a member's own colours at one strength, in both modes.
Usage: node own-colours.mjs --colours 'red, white and blue'
       node own-colours.mjs help
  --colours <text>  Their exact words or opaque sRGB #RGB / #RRGGBB / #RRGGBBFF codes.
  --help, -h       Help without reading files.
Success: one JSON object on stdout, exit 0: status, said, values, moves,
checks, lines (C3/C4 or C5), and kept.palette.overrides (all 19 roles).
Unknown names: status unknown, unknown names and C5; no palette, exit 0.
Failure: one JSON error on stderr, empty stdout, exit 1.
Lightness moves keep OKLCH hue/chroma, searched at 0.0001 L then refined;
where none passes, chroma softens by the smallest 1% step that lets one pass,
hue kept (the operator's choice of 2026-11-06), recorded with the move.
No files are written. Save the result with the brand work; see parts/parts.md.
Unknown/duplicate flags, --env and --install are refused.`;
const table = () => JSON.parse(readFileSync(new URL('../parts/colour-names.json', import.meta.url), 'utf8'));
const rgb = h => (h.length === 4 ? [...h.slice(1)].map(c=>c+c).join('') : h.slice(1)).match(/../g).map(v=>parseInt(v,16)/255);
const hex = c => '#'+c.map(v=>Math.round(Math.max(0,Math.min(1,v))*255).toString(16).padStart(2,'0')).join('').toUpperCase();
const lin = v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4;
const mix = (a,b,t) => hex(rgb(a).map((v,i)=>v+(rgb(b)[i]-v)*t));
export function oklch(h) {
  const [r,g,b]=rgb(h).map(lin);
  const l=Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b), m=Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b), s=Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);
  const L=.2104542553*l+.793617785*m-.0040720468*s, A=1.9779984951*l-2.428592205*m+.4505937099*s, B=.0259040371*l+.7827717662*m-.808675766*s;
  const C=Math.hypot(A,B);
  // Matrix roundoff is not saturation: keep equal-channel neutrals tied.
  return {L,C:C<1e-7?0:C,H:C<1e-7?0:(Math.atan2(B,A)*180/Math.PI+360)%360};
}
export function fromOklch({L,C,H}) {
  if(C===0) {
    const v=L**3,encoded=v<=.0031308?12.92*v:1.055*v**(1/2.4)-.055;
    return hex([encoded,encoded,encoded]);
  }
  const a=C*Math.cos(H*Math.PI/180),b=C*Math.sin(H*Math.PI/180);
  const l=(L+.3963377774*a+.2158037573*b)**3,m=(L-.1055613458*a-.0638541728*b)**3,s=(L-.0894841775*a-1.291485548*b)**3;
  const c=[4.0767416621*l-3.3077115913*m+.2309699292*s,-1.2684380046*l+2.6097574011*m-.3413193965*s,-.0041960863*l-.7034186147*m+1.707614701*s];
  // Same half-millilinear-channel tolerance as the matrix, for 8-bit rounding.
  if(c.some(v=>v<-.0005||v>1.0005)) return null;
  return hex(c.map(v=>v<=.0031308?12.92*v:1.055*v**(1/2.4)-.055));
}
export function wcag(a,b) {
  const lum=h=>rgb(h).map(lin).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
  return (Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
}
export function apca(a,b) {
  const lum=h=>{const y=rgb(h).reduce((n,v,i)=>n+v**2.4*[.2126729,.7151522,.0721750][i],0);return y<.022?y+(.022-y)**1.414:y;};
  const t=lum(a),s=lum(b); if(Math.abs(s-t)<.0005)return 0;
  const raw=s>t?(s**.56-t**.57)*1.14:(s**.65-t**.62)*1.14;
  return s>t?(raw<.1?0:(raw-.027)*100):(raw>-.1?0:(raw+.027)*100);
}
// Kept in sync with Contact Sheet by own-colours-flow.test.mjs.
export const PAIRS = [
  ['body and small face samples','text','ground',4.5],
  ['headline and person name','headline','ground',3],
  ['tile person name','headline','ground',4.5],
  ['small print, swatch labels and rules','smallPrint','ground',4.5],
  ['panel body and face descriptions','text','panel',4.5],
  ['panel face names and sample headlines','headline','panel',4.5],
  ['panel small print','panelSmallPrint','panel',4.5],
  ['hero and graphic marks','mark','ground',null],
  ['profile, tab and hero monogram','headline','ground',3],
  ['card front name and copy','cardFrontText','cardFront',4.5],
  ['card front small print','cardFrontSmallPrint','cardFront',4.5],
  ['card front monogram','cardFrontText','cardFront',3],
  ['card back sentence and note','cardBackText','cardBack',4.5],
  ['card back monogram','cardBackText','cardBack',3],
  ['card back graphic','cardBackMark','cardBack',null],
  ['social banner headline','headline','panel',3],
  ['social banner copy','text','panel',4.5],
  ['social banner small print','panelSmallPrint','panel',4.5],
  ['social banner monogram','text','panel',3],
  ['button text (open link and sample)','onPop','pop',4.5,60]
];
export const EXTRA_PAIRS = [['sub on ground','sub','ground',4.5],['note on ground','note','ground',4.5]];
const graphics=()=>JSON.parse(readFileSync(new URL('../parts/parts.json',import.meta.url),'utf8')).graphics;
let graphicCache;
function compositePairs(c,mode) {
  graphicCache??=graphics();
  return graphicCache.flatMap(g=>[
    ['pattern','ground',['text','headline','smallPrint','sub','note'],'mark'],
    ['texture','cardBack',['cardBackText'],'cardBackMark']
  ].flatMap(([kind,bg,fgs,fallback])=>{
    const graphic=g[kind],keys=new Set([...graphic.svg.matchAll(/\{\{(\w+)\}\}/g)].map(m=>m[1]));
    if(/currentColor/.test(graphic.svg))keys.add(fallback);
    return [...keys].flatMap(ink=>fgs.map(fg=>({fg,bg,label:`${fg} over ${g.id} ${kind}`,value:mix(c[bg],c[ink],graphic.strength[mode])})));
  }));
}
export const LIMITS = Object.freeze({P1:45,P2:.13,P3:.10,P4:60,P5:.45,P8:.004});
export function full(c,mode) {
  const r={...c};
  r.smallPrint=mix(c.text,c.ground,mode==='light'?.16:.14);
  r.sub=mix(c.text,c.ground,.12);
  r.note=c.deep===c.ground?c.text:(mode==='light'?c.deep:mix(c.text,c.pop,.25));
  r.panelSmallPrint=mix(c.text,c.panel,mode==='light'?.16:.14);
  r.hairline=mix(c.ground,c.text,.14);
  r.cardFront=mode==='light'?c.ground:c.text;
  r.cardFrontText=mode==='light'?c.text:c.deep;
  r.cardFrontSmallPrint=mix(r.cardFrontText,r.cardFront,.28);
  r.cardBack=c.deep;
  r.cardBackText=mode==='light'?c.ground:c.text;
  r.cardBackMark=c.mark;
  return r;
}
export function checkPalette(palette) {
  const result={problems:[]};
  for(const mode of ['light','dark']) {
    const c=palette[mode],o=Object.fromEntries(Object.entries(c).map(([k,v])=>[k,oklch(v)]));
    const pairs=[...PAIRS,...EXTRA_PAIRS].map(([label,fg,bg,need,lc])=>({label,fg,bg,wcag:wcag(c[fg],c[bg]),apca:Math.abs(apca(c[fg],c[bg])),need,lc:lc??null}));
    const problems=pairs.filter(p=>(p.need!=null&&p.wcag<p.need)||(p.lc&&p.apca<p.lc)).map(p=>`${mode} PAIRS ${p.label}`);
    for(const p of compositePairs(c,mode))if(wcag(c[p.fg],p.value)<4.5)problems.push(`${mode} ${p.label}`);
    const buttonPair=pairs.find(p=>p.fg==='onPop');
    const principles={P1:Math.abs(apca(c.pop,c.ground)),P2:o.pop.C,P3:Math.max(...['ground','panel','deep','pop'].map(k=>o[k].C))-Math.min(...['ground','panel','deep','pop'].map(k=>o[k].C)),P4:Math.abs(apca(c.headline,c.ground)),P5:Math.abs(o.ground.L-o.deep.L),P6:buttonPair.wcag>=4.5&&buttonPair.apca>=60,P7:!problems.length,P8:Math.min(...Object.values(o).map(v=>v.C))};
    if(principles.P4<LIMITS.P4)problems.push(`${mode} P4 headline on ground`);
    // P1-3/P5 are matrix measurements (round 2); the operator's own-colour
    // decision exempts P8's neutral/dated-cluster preferences, not reading.
    result[mode]={pairs,principles,limits:LIMITS,measuredOnly:['P1','P2','P3','P5'],exempt:['P8'],problems};
    result.problems.push(...problems);
  }
  return result;
}
export function minimumLightnessMove(value,passes,{soften=false}={}) {
  const original=oklch(value);
  if(passes(value)) return {value,L:original.L,delta:0};
  // Search both directions in increasing distance: no presumption that a
  // darker shade is the nearer one. Refine the first passing quantized colour.
  const atChroma=C=>{
    const base={...original,C};
    for(let n=1;n<=10000;n++) {
      const found=[];
      for(const sign of [-1,1]) {
        const distance=n/10000,L=original.L+sign*distance;
        if(L<0||L>1)continue;
        const v=fromOklch({...base,L});
        if(!v||!passes(v))continue;
        let lo=(n-1)/10000,hi=distance;
        for(let j=0;j<30;j++) {
          const mid=(lo+hi)/2,h=fromOklch({...base,L:original.L+sign*mid});
          if(h&&passes(h))hi=mid;else lo=mid;
        }
        const next=original.L+sign*hi;
        found.push({value:fromOklch({...base,L:next}),L:next,delta:sign*hi});
      }
      if(found.length) return found.sort((a,b)=>Math.abs(a.delta)-Math.abs(b.delta))[0];
    }
    return null;
  };
  const kept=atChroma(original.C);
  if(kept) return kept;
  if(!soften) throw Error(`No readable sRGB lightness move keeps hue and chroma for ${value}`);
  // The operator's choice of 2026-11-06, "Tone it a touch": where no lightness
  // move keeps hue and chroma, as for pure screen red, soften chroma by the
  // smallest 1% step that lets a lightness move pass. Hue is always kept.
  for(let k=1;k<=100;k++) {
    const C=original.C*(1-k/100),found=atChroma(C);
    if(found) return {...found,C,chromaDelta:C-original.C};
  }
  throw Error(`No readable sRGB colour keeps the hue of ${value}`);
}
const colourKey=value=>hex(rgb(value));
function readColours(said) {
  if(typeof said!=='string'||!said.trim()||said.length>2000||/[\x00-\x1f\u2028\u2029]/.test(said))throw Error('colours: supply non-empty single-line text up to 2000 characters');
  const {colours,modifiers}=table(),values=[],unknown=[];
  const chunks=said.trim().replace(/^(?:just\s+|a\s+|an\s+)/i,'').split(/\s*(?:,|;|\band\b|&)\s*/i).filter(Boolean);
  // Split whitespace only if the entire chunk is a run of recognised colours.
  // Longest names win; an unknown prose chunk stays intact for C5.
  const known=phrase=>{
    if(/^#(?:[a-f\d]{3}|[a-f\d]{6}|[a-f\d]{6}ff)$/i.test(phrase))return true;
    let word=phrase.toLowerCase().replace(/-/g,' ');
    while(!Object.hasOwn(colours,word)) {
      const [first,...rest]=word.split(/\s+/);
      if(!Object.hasOwn(modifiers,first)||!rest.length)return false;
      word=rest.join(' ');
    }
    return true;
  };
  const split=chunk=>{
    const words=chunk.trim().split(/\s+/);
    const run=start=>{
      if(start===words.length)return [];
      for(let end=words.length;end>start;end--) {
        const phrase=words.slice(start,end).join(' ');
        if(known(phrase)) {const rest=run(end);if(rest)return [phrase,...rest];}
      }
      return null;
    };
    return run(0)??[chunk];
  };
  for(const name of chunks.flatMap(split)) {
    let word=name.trim().toLowerCase().replace(/-/g,' '),value,mods=[];
    if(/^#(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(name))value=name;
    else if(/^#[a-f\d]{6}ff$/i.test(name))value=name.slice(0,7);
    else {
      while(!Object.hasOwn(colours,word)) {
        const [first,...rest]=word.split(/\s+/);
        if(!Object.hasOwn(modifiers,first)||!rest.length)break;
        mods.push(modifiers[first]);word=rest.join(' ');
      }
      if(Object.hasOwn(colours,word)) {
        value=colours[word];
        if(mods.length) {
          const c=oklch(value);
          for(const m of mods){c.L=Math.max(0,Math.min(1,c.L+m.L));c.C=Math.max(0,c.C+m.C);}
          // Modifier creation may reach the gamut edge; report its actual
          // chosen value. Reading repair keeps hue and files any chroma softening.
          while(!(value=fromOklch(c))&&c.C>0)c.C=Math.max(0,c.C-.001);
          if(!value)throw Error(`Cannot represent modified colour ${name}`);
        }
      }
    }
    if(value)values.push({name,value});else unknown.push(name);
  }
  return {values,unknown};
}
export function buildOwnColours(said) {
  const {values,unknown}=readColours(said);
  if(unknown.length)return {status:'unknown',said,unknown,lines:unknown.map(word=>`I don't know the colour "${word}". Could you say it another way, or type its code?`)};
  if(!values.length)throw Error('colours: name at least one colour');
  const unique=[...new Map(values.map(v=>[colourKey(v.value),v])).values()];
  const ordered=[...unique].sort((a,b)=>oklch(a.value).L-oklch(b.value).L);
  const light=unique.length>1&&oklch(ordered.at(-1).value).L>.9?ordered.at(-1):{name:'white',value:'#FFFFFF'};
  const dark=unique.length===1?{name:'near-black',value:'#181A1B'}:ordered[0];
  const accent=[...unique].sort((a,b)=>oklch(b.value).C-oklch(a.value).C)[0];
  const moves=[];
  const move=(value,passes,colour,role,mode,soften=false)=>{
    const next=minimumLightnessMove(value,passes,{soften});
    if(colourKey(next.value)!==colourKey(value))moves.push({colour:values.find(v=>colourKey(v.value)===colourKey(value))?.name??null,role,mode,from:value,to:next.value,direction:oklch(next.value).L<oklch(value).L?'deepened':'lightened',fromL:oklch(value).L,toL:next.L,deltaL:next.delta,...(next.chromaDelta?{fromC:oklch(value).C,toC:next.C,chromaDelta:next.chromaDelta}:{})});
    return next.value;
  };
  const readable=(fg,bg,lc=0)=>wcag(fg,bg)>=4.5&&Math.abs(apca(fg,bg))>=lc;
  const deep=move(dark.value,v=>readable(v,light.value,60)&&readable(light.value,v,60),dark.name,'deep','both');
  // Prefer the light words on the button in both modes. If that repair is
  // outside sRGB at fixed C/H, use the existing dark words (yellow, for
  // example) before declaring a physically impossible reading repair.
  const lightAccent=unique.length===1&&oklch(accent.value).L>.9;
  const button=lightAccent?{value:deep,name:dark.name}:accent;
  let pop,onPop=light.value;
  try {pop=move(button.value,v=>readable(onPop,v,60),button.name,'pop','both');}
  catch {
    try {onPop=deep;pop=move(button.value,v=>readable(onPop,v,60),button.name,'pop','both');}
    // Last, the operator's "Tone it a touch": light words again, chroma softened.
    catch {onPop=light.value;pop=move(button.value,v=>readable(onPop,v,60),button.name,'pop','both',true);}
  }
  const palette={};
  for(const mode of ['light','dark']) {
    const ground=mode==='light'?light.value:deep,text=mode==='light'?deep:light.value;
    const extra=lightAccent?accent:unique.find(v=>![light,dark,accent].includes(v));
    const visible=v=>wcag(v,ground)>=1.5;
    // A role collision is an assignment choice, not a shade move. Try the
    // remaining member colours, then the other ink, without filing a C4.
    const alternatives=[...unique.map(v=>v.value),text,deep,light.value];
    // A single near-white belongs on the panel or mark in either mode.
    // Keep white's allowed ink inversion; other near-whites cannot be buttons.
    const popAlternatives=lightAccent?alternatives.filter(v=>colourKey(v)!==colourKey(accent.value)||colourKey(v)==='#FFFFFF'):alternatives;
    const modePop=visible(pop)?pop:popAlternatives.find(v=>visible(v)&&(readable(light.value,v,60)||readable(deep,v,60)));
    const modeInk=modePop===pop?onPop:readable(light.value,modePop,60)?light.value:deep;
    const mark=extra?.value??pop;
    let c=full({ground,panel:lightAccent&&mode==='light'&&colourKey(accent.value)!=='#FFFFFF'?accent.value:mix(ground,extra?.value??text,.04),text,headline:text,deep,pop:modePop,onPop:modeInk,mark:visible(mark)?mark:alternatives.find(visible)},mode);
    const repair=foregrounds=>{for(const fg of foregrounds) {
      const pairs=[...PAIRS,...EXTRA_PAIRS].filter(p=>p[1]===fg&&p[3]!=null);
      if(fg==='headline')pairs.push(['P4','headline','ground',4.5,60]);
      const originalL=oklch(c[fg]).L;
      const passes=v=>pairs.every(([, ,bg,need,lc])=>
        (originalL-oklch(c[bg]).L)*(oklch(v).L-oklch(c[bg]).L)>=0&&
        wcag(v,c[bg])>=need&&(!lc||Math.abs(apca(v,c[bg]))>=lc))&&compositePairs(c,mode).filter(p=>p.fg===fg).every(p=>wcag(v,p.value)>=4.5);
      const colour=fg.startsWith('cardFront')?dark.name:fg==='cardBackText'||fg==='onPop'?light.name:mode==='light'?dark.name:light.name;
      try {c[fg]=move(c[fg],passes,colour,fg,mode);}
      catch(error) {
        // White is already an endpoint. If its supporting surface is too
        // light, repair that failing surface instead of changing hue/chroma.
        const failing=pairs.filter(([, ,bg,need,lc])=>wcag(c[fg],c[bg])<need||lc&&Math.abs(apca(c[fg],c[bg]))<lc).map(p=>p[2]);
        failing.push(...compositePairs(c,mode).filter(p=>p.fg===fg&&wcag(c[fg],p.value)<4.5).map(p=>p.bg));
        for(const bg of new Set(failing)) {
          const requirements=pairs.filter(p=>p[2]===bg);
          const onSurface=v=>requirements.every(([, , ,need,lc])=>wcag(c[fg],v)>=need&&(!lc||Math.abs(apca(c[fg],v))>=lc))&&
            compositePairs({...c,[bg]:v},mode).filter(p=>p.fg===fg&&p.bg===bg).every(p=>wcag(c[fg],p.value)>=4.5);
          c[bg]=move(c[bg],onSurface,mode==='dark'?dark.name:light.name,bg,mode,true);
        }
        if(!passes(c[fg]))c[fg]=move(c[fg],passes,colour,fg,mode,true);
      }
    }};
    repair(['text','headline','onPop']);
    c=full(c,mode);
    repair(new Set([...PAIRS,...EXTRA_PAIRS].filter(p=>p[3]!=null).map(p=>p[1])));
    palette[mode]=c;
  }
  const checks=checkPalette(palette);
  if(checks.problems.length)throw Error(`Own colours fail reading: ${checks.problems.join('; ')}`);
  const disclosed=new Set();
  const disclosures=moves.filter(m=>{
    if(!m.colour||disclosed.has(colourKey(m.from)))return false;
    disclosed.add(colourKey(m.from));return true;
  }).map(m=>`I ${m.direction} your ${m.colour} a little, so words on it stay easy to read.`);
  return {status:'ready',said,values,moves,checks,strength:'one',kept:{palette:{overrides:palette}},lines:[`These use your colours: ${said}.`,...disclosures]};
}
// An entire known colour phrase, optionally after a use request, answers C2.
// Colour words under less, more, too, not or without stay steer and off.
// The sitting passes the whole comment so extracting a word cannot lose intent.
export function coloursFromComment(comment) {
  const phrase=typeof comment==='string'?comment.replace(/\r\n?|\n|\u2028|\u2029/g,' ').trim().replace(/[.!?]+$/,'').trim():comment;
  const parsed=readColours(phrase);
  if(/\b(?:less|more|too|not|without)\b/i.test(phrase))return {status:'steer',said:comment};
  if(!parsed.unknown.length)return buildOwnColours(phrase);
  const request=phrase.match(/^(?:(?:please\s+)?use|(?:I|we)\s+(?:want|would\s+like)(?:\s+to\s+use)?)\s+(.+)$/i);
  return request&&!readColours(request[1]).unknown.length?buildOwnColours(request[1]):{status:'steer',said:comment};
}
export function validateOwnColours(record) {
  const built=buildOwnColours(record?.said);
  if(built.status!=='ready'||!isDeepStrictEqual(record,built))throw Error('ownColours: use the unchanged ready result from own-colours.mjs');
  return built;
}
export function run(argv=process.argv.slice(2)) {
  const known=['--colours','--help','-h'];
  for(const v of argv)if(v.startsWith('-')&&!known.includes(v))throw Error(`${v}: unknown option`);
  if(!argv.length||argv.includes('--help')||argv.includes('-h')||argv.length===1&&argv[0]==='help')return HELP;
  if(argv.length!==2||argv[0]!=='--colours')throw Error('Use --colours once with the member\'s text; see --help');
  return buildOwnColours(argv[1]);
}
if(process.argv[1]&&process.argv[1]!=='-'&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)) {
  try{const result=run();process.stdout.write((typeof result==='string'?result:JSON.stringify(result))+'\n');}
  catch(error){process.stderr.write(JSON.stringify({error:error.message})+'\n');process.exitCode=1;}
}
