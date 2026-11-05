// Closed depth schema and colour rules for board validation and look drawing.
function freezeDepthSchema(value) {
  for(const child of Object.values(value))if(child&&typeof child==='object')freezeDepthSchema(child);
  return Object.freeze(value);
}
export const depthSchema=freezeDepthSchema({type:'object',additionalProperties:false,required:[],properties:{
  background:{enum:['plain','gradient','texture']},
  groundTo:{type:'string',description:'An opaque hex colour or a palette role on this board.'},
  groundThird:{type:'string',description:'An opaque hex colour or a palette role on this board.'},
  gradient:{enum:['linear','radial']},
  angle:{type:'number',description:'Finite degrees.'},
  texture:{enum:['pattern','grain']},
  block:{type:'object',additionalProperties:false,required:[],properties:{
    corner:{enum:[0,12,24,'pill']},gradient:{type:'boolean'},inset:{enum:[false,true,'lighter','darker']}
  }},
  popTo:{type:'string',description:'An opaque hex colour or a palette role on this board.'},
  card:{type:'object',additionalProperties:false,required:[],properties:{corner:{enum:[0,16,28]}}},
  band:{enum:['three','none','strip','six']},
  allowHueShift:{type:'boolean'},
  mark:{enum:['badge','initials','seal','letter','stack']},
  seal:{type:'object',additionalProperties:false,required:[],properties:{on:{enum:['ground','block']}}},
  stack:{type:'object',additionalProperties:false,required:[],properties:{on:{enum:['block','ground']}}},
  ink:{enum:['pop','mark','deep','text','headline']}
}});
const depthFail=message=>{throw Error(`${message}. Correct depth in TOOL.md.`);};
function depthObject(value,keys,at) {
  if(!value||typeof value!=='object'||Array.isArray(value))depthFail(`${at} must be an object`);
  for(const key of Object.keys(value)) {
    const flat=key.replace(/[^a-z]/gi,'').toLowerCase();
    if(/blur|glass|glow|shadow/.test(flat))depthFail(`${at}.${key}: blur, glass, glow and all shadows are forbidden`);
    if(/text|headline|initials/.test(flat)&&/gradient/.test(flat))depthFail(`${at}.${key}: gradient text is forbidden; text uses solid palette ink`);
    if(!keys.includes(key))depthFail(`${at}.${key} is not supported (arbitrary effects and text fills are forbidden)`);
  }
}
function depthChoice(value,values,at) {
  if(!values.includes(value))depthFail(`${at} must be ${values.map(String).join(' | ')}`);
  return value;
}
export function depthColour(value,c,at) {
  if(typeof value!=='string')depthFail(`${at} must list an opaque hex colour or a palette role on this board`);
  const colour=Object.hasOwn(c,value)?c[value]:value;
  if(typeof colour!=='string'||!/^#(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(colour))depthFail(`${at} must list an opaque hex colour or a palette role on this board`);
  return (colour.length===4?'#'+[...colour.slice(1)].map(x=>x+x).join(''):colour).toUpperCase();
}
// OKLab conversion, D65 sRGB. Achromatic stops have no meaningful hue.
export function depthLch(hex) {
  const [r,g,b]=hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
  const l=Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b),m=Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b),s=Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);
  const L=.2104542553*l+.793617785*m-.0040720468*s,A=1.9779984951*l-2.428592205*m+.4505937099*s,B=.0259040371*l+.7827717662*m-.808675766*s;
  return {L,C:Math.hypot(A,B),H:(Math.atan2(B,A)*180/Math.PI+360)%360};
}
function depthStops(stops,allowHueShift,at) {
  const hues=stops.map(depthLch);
  for(let i=0;i<hues.length;i++)for(let j=i+1;j<hues.length;j++) {
    const a=hues[i],b=hues[j],distance=Math.min(Math.abs(a.H-b.H),360-Math.abs(a.H-b.H));
    // Purple to blue: the shorter hue arc between the stops covers 15 degrees or more of
    // OKLCH 260 to 320, including gradients with a stop outside that window.
    // A single blue hue stays tonal. Both hue rules apply only to visible chroma.
    const lo=Math.min(a.H,b.H),hi=Math.max(a.H,b.H),direct=[[lo,hi]],wrapped=[[hi,360],[0,lo]];
    // At 180 degrees both arcs are shortest, so either can trigger the refusal.
    const arcs=hi-lo<180?[direct]:hi-lo>180?[wrapped]:[direct,wrapped];
    const purpleArc=Math.max(...arcs.map(arc=>arc.reduce((sum,[x,y])=>sum+Math.max(0,Math.min(y,320)-Math.max(x,260)),0)));
    if(a.C>=.025&&b.C>=.025&&purpleArc>=15)depthFail(`${at}: purple-to-blue gradient stops (the hue arc covers ${purpleArc.toFixed(1)} degrees of OKLCH 260 to 320) are forbidden, even with allowHueShift`);
    if(a.C>=.025&&b.C>=.025&&distance>40&&!allowHueShift)depthFail(`${at}: gradient must be tonal (OKLCH hue distance ${distance.toFixed(1)} > 40 degrees); allowHueShift requires explicit board stops`);
  }
}
export function depthInset(pop,direction) {
  // One small tonal step in OKLCH lightness, with chroma reduced only for gamut.
  const {L,C,H}=depthLch(pop),light=Math.min(.98,Math.max(.02,L+(direction==='darker'?-.055:.055)));
  for(let chroma=C;chroma>=0;chroma=Math.max(0,chroma-.002)) {
    const a=chroma*Math.cos(H*Math.PI/180),b=chroma*Math.sin(H*Math.PI/180);
    const l=(light+.3963377774*a+.2158037573*b)**3,m=(light-.1055613458*a-.0638541728*b)**3,s=(light-.0894841775*a-1.291485548*b)**3;
    const rgb=[4.0767416621*l-3.3077115913*m+.2309699292*s,-1.2684380046*l+2.6097574011*m-.3413193965*s,-.0041960863*l-.7034186147*m+1.707614701*s];
    if(rgb.every(x=>x>=0&&x<=1))return '#'+rgb.map(x=>Math.round(255*(x<=.0031308?12.92*x:1.055*x**(1/2.4)-.055)).toString(16).padStart(2,'0')).join('').toUpperCase();
    if(chroma===0)break;
  }
  depthFail('could not form an in-gamut tonal inset');
}
export function depthOptions(b) {
  const d=b.depth,c=b.palette[b.primaryMode],orDefault=(value,fallback)=>value===undefined?fallback:value;
  const fields=depthSchema.properties;
  depthObject(d,Object.keys(fields),'depth');
  const ink=depthChoice(orDefault(d.ink,'pop'),fields.ink.enum,'depth.ink');
  depthColour(ink,c,'depth.ink');
  const mark=depthChoice(orDefault(d.mark,'badge'),fields.mark.enum,'depth.mark');
  const seal=orDefault(d.seal,{}),stack=orDefault(d.stack,{});
  depthObject(seal,Object.keys(fields.seal.properties),'depth.seal');depthObject(stack,Object.keys(fields.stack.properties),'depth.stack');
  const sealOn=depthChoice(orDefault(seal.on,'ground'),fields.seal.properties.on.enum,'depth.seal.on'),stackOn=depthChoice(orDefault(stack.on,'block'),fields.stack.properties.on.enum,'depth.stack.on');
  const background=depthChoice(orDefault(d.background,'plain'),fields.background.enum,'depth.background');
  const kind=depthChoice(orDefault(d.gradient,'linear'),fields.gradient.enum,'depth.gradient');
  if(d.angle!==undefined&&(typeof d.angle!=='number'||!Number.isFinite(d.angle)))depthFail('depth.angle must be finite degrees');
  if(d.allowHueShift!==undefined&&typeof d.allowHueShift!=='boolean')depthFail('depth.allowHueShift must be boolean');
  const texture=depthChoice(orDefault(d.texture,'pattern'),fields.texture.enum,'depth.texture');
  const block=orDefault(d.block,{}),card=orDefault(d.card,{});
  depthObject(block,Object.keys(fields.block.properties),'depth.block');depthObject(card,Object.keys(fields.card.properties),'depth.card');
  const corner=depthChoice(orDefault(block.corner,0),fields.block.properties.corner.enum,'depth.block.corner'),cardCorner=depthChoice(orDefault(card.corner,0),fields.card.properties.corner.enum,'depth.card.corner');
  if(block.gradient!==undefined&&typeof block.gradient!=='boolean')depthFail('depth.block.gradient must be boolean');
  const inset=depthChoice(orDefault(block.inset,false),fields.block.properties.inset.enum,'depth.block.inset');
  const band=depthChoice(orDefault(d.band,'three'),fields.band.enum,'depth.band');
  // No inferred endpoint: each gradient stop is literally listed in depth or
  // resolves to a role in this board. The exception never invents a colour.
  const ground=depthColour('ground',c,'ground'),pop=depthColour('pop',c,'pop');
  for(const role of ['headline','onPop'])depthColour(role,c,`solid text ${role} (gradient text is forbidden)`);
  const groundStops=[ground],popStops=[pop];
  for(const [key,field] of Object.entries(fields))if(field.type==='string'&&d[key]!==undefined)depthColour(d[key],c,`depth.${key}`);
  if(background==='gradient') {
    groundStops.push(depthColour(d.groundTo,c,'depth.groundTo'));
    if(d.groundThird!==undefined)groundStops.push(depthColour(d.groundThird,c,'depth.groundThird'));
    depthStops(groundStops,d.allowHueShift,'ground');
  }
  if(block.gradient){popStops.push(depthColour(d.popTo,c,'depth.popTo'));depthStops(popStops,d.allowHueShift,'block');}
  return {ink,mark,sealOn,stackOn,background,kind,angle:orDefault(d.angle,135),texture,corner,cardCorner,inset,band,groundStops,popStops};
}
