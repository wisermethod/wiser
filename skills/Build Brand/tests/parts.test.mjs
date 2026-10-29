import '../../../tools/lib/tests/isolated-home.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { LIBRARY } from '../scripts/assemble.mjs';
import { wcag } from '../../../tools/Contact Sheet/scripts/brand-boards.js';
import { checkPack, INSTALL } from '../scripts/fonts.mjs';

const library = JSON.parse(readFileSync(LIBRARY));
assert.ok(checkPack(library).installed, `Real-font parts tests require the font pack: run ${INSTALL} from the Build Brand skill's directory`);
const parts = dirname(LIBRARY);
const palette = id => library.palettes.find(p => p.id === id);
const pairing = id => library.pairings.find(p => p.id === id);
const graphic = id => library.graphics.find(p => p.id === id);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const rgb = hex => hex.slice(1).match(/../g).map(n => parseInt(n, 16));

test('locked paper-orange recipe and drawn graphic set retain their exact content', () => {
  // Ranking metadata was added; the approved colours and geometry stay exact.
  const visual = part => { const { tags, softStrongReason, ...unchanged } = part; return unchanged; };
  assert.equal(hash(JSON.stringify(visual(palette('paper-orange')))), '28cc8b687dc826f7514c6081857aa2dff2a104b82e28f51bcbc8a74a003a215b');
  assert.equal(hash(JSON.stringify(visual(graphic('drawn')))), '3f4b50e46afe24f602a523468a4310d17c315ba33153761793a6d399811f0c13');
});

test('white-blue and white-green are visibly tinted white sheets with hue-tinted small print', () => {
  for (const [id, channel] of [['white-blue',2], ['white-green',1]]) {
    const p = palette(id).light;
    const ground = rgb(p.ground), ink = rgb(p.smallPrint);
    assert.ok(Math.min(...ground) >= 235 && Math.max(...ground) <= 252);
    assert.ok(ground[channel] - Math.min(...ground) >= 6);
    for (const role of ['smallPrint','cardFrontSmallPrint','panelSmallPrint']) {
      const ink = rgb(p[role]);
      assert.ok(ink[channel] - Math.min(...ink) >= 20, `${id}.${role} has a hue`);
    }
    assert.ok(wcag(p.smallPrint,p.ground) >= 4.5);
    assert.equal(p.cardFront,p.ground);
  }
});

test('print-pink uses blue panel reading ink and muted yellow card-back ink', () => {
  const p = palette('print-pink'), ink = rgb(p.light.panelSmallPrint);
  assert.ok(ink[2] - ink[0] >= 30);
  assert.equal(p.dark.cardBackMark,p.dark.mark);
  assert.notEqual(p.dark.cardBackMark,'#FFE800');
});

test('olive is a mid-olive field with cream words, separate from the pale sage sheet', () => {
  const p = palette('olive-paper').light, ground = rgb(p.ground), ink = rgb(p.text);
  assert.ok(Math.max(...ground) < 150 && ground[1] > ground[0] && ground[0] > ground[2]);
  assert.ok(Math.min(...ink) > 225 && ink[0] > ink[2]);
  assert.ok(wcag(p.text,p.ground) >= 4.5);
  assert.ok(Math.min(...rgb(palette('sage-brass').light.ground)) > 200);
});

test('plum-peach light mode carries plum surfaces and draws in its plum ink', () => {
  const p = palette('plum-peach').light;
  for (const role of ['ground','panel','cardFront','cardBack']) {
    const [r,g,b] = rgb(p[role]);assert.ok(r > g && b > g,role);
  }
  assert.equal(p.mark,p.text);assert.equal(p.cardBackMark,p.text);
});

test('citrus marks use the strong blue reading ink on orange', () => {
  const p = palette('citrus-blue').light;
  assert.equal(p.mark,p.text);assert.ok(wcag(p.mark,p.ground) >= 4.5);
});

test('white-oxblood retires emerald and gives deep warm red a large field', () => {
  assert.ok(!palette('white-emerald'));
  const p=palette('white-oxblood');assert.equal(p.energy,'white-and-one');assert.equal(p.temperature,'warm');
  assert.ok(Math.min(...rgb(p.light.ground)) >= 240);
  for(const role of ['headline','pop','mark','cardBack']) {
    const [r,g,b]=rgb(p.light[role]);assert.ok(r>g*2 && r>b && r<150,role);
  }
});

test('new rose, yellow and green-black recipes fill three distinct colour roles', () => {
  const rose=palette('rose-ink'),yellow=palette('yellow-ink'),green=palette('green-black');
  assert.equal(rose.energy,'colour-ground');assert.equal(yellow.energy,'colour-ground');assert.equal(green.energy,'dark-first');
  const [r,g,b]=rgb(rose.light.ground);assert.ok(r>b && b>g && g<180);
  const [yr,yg,yb]=rgb(yellow.light.ground);assert.ok(yr>230 && yg>190 && yb<130);
  const [gr,gg,gb]=rgb(green.dark.ground);assert.ok(gg>gr && gg>gb && gg<50);
  for(const p of [rose,yellow,green])for(const mode of ['light','dark'])for(const [role,value]of Object.entries(p[mode])) {
    assert.ok(p.adjustments.some(a=>a.mode===mode && a.roles.includes(role) && a.fromValue===null),`${p.id}.${mode}.${role} initial value`);
  }
});

test('adjustment history ends at every changed role value and contains concrete before/after values', () => {
  for(const p of library.palettes) {
    const latest=new Map();
    for(const a of p.adjustments) {
      assert.ok(['light','dark'].includes(a.mode));assert.match(a.toValue,/^#[\da-f]{6}$/i);assert.ok(a.reason);
      assert.ok(a.fromValue===null || /^#[\da-f]{6}$/i.test(a.fromValue));
      for(const role of a.roles) latest.set(`${a.mode}.${role}`,a);
    }
    for(const [key,a]of latest){const [mode,role]=key.split('.');assert.equal(p[mode][role],a.toValue,`${p.id}.${key}`);}
  }
  for(const [id,mode,role,before]of [
    ['white-blue','light','ground','#FEFEFD'],['white-green','light','ground','#FEFEFD'],
    ['print-pink','light','panelSmallPrint','#4A4A5A'],['print-pink','dark','cardBackMark','#FFE800'],
    ['olive-paper','light','ground','#E7E8DB'],['plum-peach','light','ground','#F6EEE7'],
    ['plum-peach','light','mark','#FFB38A'],['plum-peach','light','cardBackMark','#FFB38A'],['citrus-blue','light','mark','#D45920'],
    ['white-oxblood','light','pop','#08744F']]) {
    assert.ok(palette(id).adjustments.some(a=>a.mode===mode&&a.roles.includes(role)&&a.fromValue===before&&a.toValue===palette(id)[mode][role]),`${id}.${role}`);
  }
});

const noteOrder = {
  newspaper:['Covered By Your Grace','Caveat'], 'friendly-serif':['Kalam','Nothing You Could Do'],
  'sharp-serif':['Covered By Your Grace','Architects Daughter'], marker:['Kalam','Covered By Your Grace'],
  humanist:['Kalam','Nothing You Could Do'], 'high-contrast':['Architects Daughter','Covered By Your Grace'],
  expressive:['Gochi Hand','Covered By Your Grace']
};
for(const [id,expected] of Object.entries(noteOrder))test(`${id} notes have the reviewed default and alternative`,()=>assert.deepEqual(pairing(id).handwriting.map(f=>f.family),expected));

test('quiet-sans is light contemporary sans over the Source Serif 4 reading face',()=>{
  assert.ok(!pairing('book'));const p=pairing('quiet-sans');
  assert.equal(p.type.heading.family,'Work Sans');assert.equal(p.type.body.family,'Source Serif 4');
  assert.equal(p.tags.typeLoudness,1);assert.equal(p.tags.typeCut,'contemporary');assert.equal(p.tags.classicContemporary,'contemporary');
  assert.ok(p.type.heading.sizes.display.weight<=400);assert.equal(p.handwriting[0].family,'Covered By Your Grace');
  assert.ok(p.type.body.sizes.middle.size>=16 && p.type.body.sizes.middle.lineHeight>=1.5);
});

test('display-serif uses Literata at warm reading optical sizes; DM Serif Display is retired',()=>{
  const p=pairing('display-serif');assert.equal(p.type.heading.family,'Literata');
  assert.equal(p.tags.warmCool,'warm');
  for(const size of Object.values(p.type.heading.sizes))assert.ok(size.variations.opsz<=16);
  assert.ok(!library.fonts['DM Serif Display']);assert.ok(!existsSync(resolve(parts,'fonts/DM Serif Display')));
});
test('the replacement text faces request only axes the bundled files actually carry',()=>{
  for(const id of ['quiet-sans','display-serif'])for(const face of Object.values(pairing(id).type)) {
    const axes=library.fonts[face.family].files[0].axes;
    for(const settings of [face.variations,...Object.values(face.sizes).map(s=>s.variations)])for(const [key,value] of Object.entries(settings||{})) {
      assert.ok(axes[key],`${id} ${face.family} has no ${key} axis`);assert.ok(value>=axes[key].min && value<=axes[key].max);
    }
  }
});
test('the loud poster slab has contemporary match and ranking tags',()=>{
  const p=pairing('slab');assert.equal(p.tags.typeLoudness,3);assert.equal(p.tags.typeCut,'contemporary');assert.equal(p.tags.classicContemporary,'contemporary');
});

test('every declared font and unchanged licence exists and every font hash and size agrees',()=>{
  for(const font of Object.values(library.fonts)) {
    assert.ok(existsSync(resolve(parts,font.licenceFile)));
    for(const f of font.files) {const file=resolve(parts,f.path);assert.equal(statSync(file).size,f.bytes);assert.equal(hash(readFileSync(file)),f.sha256);}
  }
  const f=library.fonts.Literata;
  assert.equal(f.commit,'45e3d5269e4a17d823f6d84470bc084dc5ae46f6');assert.equal(f.sourcePath,'ofl/literata');
  assert.equal(f.shippedForm,'latin-subset-woff2');assert.equal(f.reservedFontName,false);assert.deepEqual(f.reservedFontNames,[]);
  assert.equal(hash(readFileSync(resolve(parts,f.licenceFile))),f.licenceSha256);
  assert.match(readFileSync(resolve(parts,f.licenceFile),'utf8'),/SIL OPEN FONT LICENSE Version 1\.1/);
  assert.deepEqual(readdirSync(resolve(parts,f.folder)).sort(),['Literata-Latin.woff2','OFL.txt']);
});

test('three refined containers keep initials framed with intentional asymmetry and openings',()=>{
  const c=id=>library.containers.find(c=>c.id===id).svg;
  const circles=[...c('double-ring').matchAll(/<circle\b([^>]+)/g)].map(m=>Object.fromEntries([...m[1].matchAll(/(\w+)="([^"]+)"/g)].map(m=>[m[1],m[2]])));
  assert.equal(circles.length,2);assert.notEqual(circles[0].cx,circles[1].cx);assert.notEqual(circles[0].cy,circles[1].cy);
  assert.ok(!c('oval').includes('<ellipse'));assert.match(c('oval'),/L10 37/);assert.ok(!/\sZ["\s]/i.test(c('oval')));
  assert.ok(!c('rule-box').includes('<rect'));assert.match(c('rule-box'),/stroke-width="6"/);
  for(const id of ['double-ring','oval','rule-box']){assert.match(c(id),/currentColor/);assert.ok(!/<text|opacity=|filter=/i.test(c(id)));}
});

// Compare geometry, not SVG wrappers or stroke widths: a copied mark must fail
// even when its presentation is changed. Intra-set reuse is intentional.
const tokens=value=>(value.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/g)||[]).map(t=>Number.isFinite(Number(t))?String(Number(t)):t).join(' ');
function shapes(svg) {
  return [...svg.matchAll(/<(path|circle|ellipse|rect|line|polyline|polygon)\b([^>]*)/g)].map(([,tag,attrs])=>{
    const a=Object.fromEntries([...attrs.matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));
    const geometry={path:['d'],circle:['cx','cy','r'],ellipse:['cx','cy','rx','ry'],rect:['x','y','width','height','rx','ry'],line:['x1','y1','x2','y2'],polyline:['points'],polygon:['points']}[tag];
    return tag+':'+geometry.map(k=>`${k}=${tokens(a[k]||'0')}`).join(';');
  });
}
function uniqueSets(sets) {
  const seen=new Map();
  for(const set of sets) {
    const drawings=[set.hero.svg,set.pattern.svg,set.texture.svg,set.noteArrow,set.bannerRule,...set.legend.map(m=>m.svg),...Object.values(set.sample)];
    for(const svg of drawings)for(const shape of shapes(svg)){
      assert.ok(!seen.has(shape)||seen.get(shape)===set.id,`${seen.get(shape)} and ${set.id} share ${shape}`);seen.set(shape,set.id);
    }
  }
}
test('no two graphic sets share legend, sample, hero, pattern, arrow or texture geometry',()=>uniqueSets(library.graphics));
for(const field of ['legend','sample','hero','pattern'])test(`copied ${field} geometry is detected despite changed wrapper and stroke width`,()=>{
  const sets=structuredClone(library.graphics);
  const copied=sets[0].legend[1].svg.replace('stroke-width="2"','stroke-width="7"').replace('<svg ','<svg preserveAspectRatio="none" ');
  if(field==='legend')sets[1].legend[0].svg=copied;
  else if(field==='sample')sets[1].sample.circle=copied;
  else sets[1][field].svg=copied;
  assert.throws(()=>uniqueSets(sets),/drawn and drafting share/);
});

test('editorial foot mark differs from its asterisk and closes its sample',()=>{
  const g=graphic('editorial'),foot=g.legend.find(m=>m.name==='Foot mark').svg;
  assert.notDeepEqual(shapes(foot),shapes(g.legend.find(m=>m.name==='Asterisk').svg));assert.equal(g.sample.closing,foot);
});
test('riso sample ring uses two shifted ellipses distinct from the drawn curve',()=>{
  const shapesInRing=shapes(graphic('riso').sample.circle);
  assert.equal(shapesInRing.length,2);assert.ok(shapesInRing.every(s=>s.startsWith('ellipse:')));assert.notEqual(shapesInRing[0],shapesInRing[1]);
});
test('reviewed dark patterns have substantial cells and explicit visible strengths',()=>{
  assert.equal(graphic('editorial').pattern.strength.dark,.45);
  assert.match(graphic('editorial').pattern.svg,/M8 12 H27/);
  assert.ok(graphic('marker').pattern.strength.dark>=.28);assert.match(graphic('marker').pattern.svg,/stroke-width="4"/);
  assert.match(graphic('geometric').pattern.svg,/r="4"/);
  assert.equal(graphic('stitch').pattern.strength.dark,.4);assert.match(graphic('stitch').pattern.svg,/L20 20/);
  assert.ok(graphic('stamp').pattern.strength.dark>=.28);assert.match(graphic('stamp').pattern.svg,/L36 11/);
  assert.equal(graphic('stamp').hero.shape,'underline');assert.match(graphic('stamp').hero.svg,/ Z" fill="currentColor"/);
});

test('parts index documents every current id, the new face, and no stale recipe or pairing',()=>{
  const doc=readFileSync(resolve(parts,'parts.md'),'utf8');
  for(const key of ['palettes','pairings','graphics','containers'])for(const p of library[key])assert.ok(doc.includes(`| ${p.id} |`),p.id);
  assert.ok(doc.includes('| Literata |'));assert.ok(!/\| (?:book|white-emerald|DM Serif Display) \|/.test(doc));
  assert.ok(!/#[a-f\d]{6}\b/i.test(doc));
});

test('all 49 ranked parts carry six closed positions and a soft-to-strong reason',()=>{
  const axes={classicContemporary:['classic','contemporary'],quietBold:['quiet','bold'],warmCool:['warm','cool'],playfulSerious:['playful','serious'],handGeometric:['hand','geometric'],softStrong:['soft','strong']};
  let count=0;
  for(const kind of ['pairings','palettes','graphics'])for(const p of library[kind]) {
    count++;
    for(const [axis,poles]of Object.entries(axes))assert.ok([...poles,'either'].includes(p.tags[axis]),`${kind}/${p.id}/${axis}`);
    assert.ok(p.softStrongReason.trim());
  }
  assert.equal(count,49);assert.equal(pairing('chunky').tags.softStrong,'soft');
  for(const p of library.palettes)assert.equal(p.tags.warmCool,p.temperature);
});
