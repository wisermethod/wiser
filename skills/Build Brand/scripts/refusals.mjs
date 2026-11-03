// Selector policy over resolved part values, before ranking or check spares.
// The dated cluster definitions live only in parts.json's refusedClusters.
const rgb = hex => {
  const value=hex.length===4?[...hex.slice(1)].map(c=>c+c).join(''):hex.slice(1);
  return value.match(/../g).map(c=>parseInt(c,16));
};
const distance=(a,b)=>Math.hypot(...rgb(a).map((v,i)=>v-rgb(b)[i]));
function hsl(hex) {
  const [r,g,b]=rgb(hex).map(v=>v/255),max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;
  const lightness=(max+min)/2;
  const hue=delta===0?0:((max===r?(g-b)/delta:max===g?(b-r)/delta+2:(r-g)/delta+4)*60+360)%360;
  return {hue,saturation:delta===0?0:delta/(1-Math.abs(2*lightness-1)),lightness};
}
const between=(value,[min,max])=>value>=min&&value<=max;
const inBand=(color,band)=>Object.entries(band).every(([key,range])=>between(hsl(color)[key],range));
export function boardRefusal(library,board) {
  const pairing=library.pairings.find(p=>p.id===board.pairing.id);
  if(pairing.selectable===false) return `pairing ${pairing.id} is retired from selection`;
  const noteFaces=new Set(library.pairings.flatMap(p=>p.handwriting.map(f=>f.family)));
  const faces={};
  for(const role of ['heading','body']) {
    const donor=board.pairing[`${role}From`];
    const source=typeof donor==='string'?library.pairings.find(p=>p.id===donor):pairing;
    faces[role]=donor&&typeof donor==='object'?donor.family:source.type[role].family;
    if(library.fonts[faces[role]]?.role==='handwriting'||noteFaces.has(faces[role])) return `handwriting ${faces[role]} cannot set ${role}`;
  }
  const displayStyle=library.pairings.find(p=>p.type.heading.family===faces.heading)?.displayStyle;
  const palette=library.palettes.find(p=>p.id===board.palette.id);
  // Both modes appear on a board, including the alternate-mode specimen.
  for(const mode of ['light','dark']) {
    const roles={...palette[mode],...board.palette.overrides?.[mode]};
    for(const cluster of library.refusedClusters??[]) {
      if(distance(roles.ground,cluster.ground.near)>cluster.ground.maxRgbDistance) continue;
      if(cluster.displayStyle&&cluster.displayStyle!==displayStyle) continue;
      const accents=cluster.accents,colors=accents.roles.map(role=>roles[role]);
      const matches=accents.bands.some(band=>accents.match==='all'?colors.every(color=>inBand(color,band)):colors.some(color=>inBand(color,band)));
      if(!matches) continue;
      if(accents.maxRgbDistance!==undefined&&colors.some(color=>distance(color,colors[0])>accents.maxRgbDistance)) continue;
      return `refused cluster ${cluster.id} (${mode})`;
    }
  }
  return null;
}
