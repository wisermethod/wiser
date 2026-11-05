import '../../../tools/lib/tests/isolated-home.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { LIBRARY } from '../scripts/assemble.mjs';
import { paletteFamily } from '../scripts/select.mjs';
import { depthOptions } from '../../../tools/Contact Sheet/scripts/board-depth.js';
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

test('approved visual parts retain their exact colours, settings, geometry and font pins', () => {
  const omit = (part, keys) => Object.fromEntries(Object.entries(part).filter(([key]) => !keys.includes(key)));
  const visual = {
    pairings: library.pairings.map(p => omit(p, ['settingsProvenance'])),
    palettes: library.palettes.map(p => omit(p, ['description','adjustments','softStrongReason'])),
    graphics: library.graphics.map(p => omit(p, ['adjustments'])),
    styles: library.styles.map(p => omit(p, ['graphicSet','container'])), fonts: library.fonts, containers: library.containers, refusedClusters: library.refusedClusters
  };
  assert.equal(hash(JSON.stringify(visual)), 'a613742d276b37514b91acae7ec38cc9aba386f398fa8367a607738cda9cca0a');
});

test('ten colour families each provide muted, balanced and bold palettes with complete names', () => {
  assert.equal(library.palettes.length, 30);
  const families = new Map();
  for (const p of library.palettes) {
    const {family,step} = paletteFamily(p.id);
    if (!families.has(family)) families.set(family, []);
    families.get(family).push(step);
    assert.equal(Object.hasOwn(p,'draft'), false); assert.equal(Object.hasOwn(p,'draftFields'), false);
    assert.ok(p.description.trim());
    assert.deepEqual(p.swatches,p.modeSwatches.light);
    for (const mode of ['light','dark']) {
      assert.equal(p.modeSwatches[mode].reduce((n,s)=>n+s.share,0),100);
      assert.equal(new Set(p.modeSwatches[mode].map(s=>s.name)).size,p.modeSwatches[mode].length);
      assert.ok(p.modeSwatches[mode].every(s=>s.name.trim() && p[mode][s.key]));
    }
    assert.equal(p.paletteLoudness,{muted:1,balanced:2,bold:3}[step]);
    assert.equal(p.tags.quietBold,{muted:'quiet',balanced:'either',bold:'bold'}[step]);
    assert.equal(p.tags.softStrong,{muted:'soft',balanced:'either',bold:'strong'}[step]);
  }
  assert.equal(families.size,10);
  for (const steps of families.values()) assert.deepEqual(steps,['muted','balanced','bold']);
});

test('adjustment history ends at each changed role and records readable before/after values', () => {
  for (const p of library.palettes) {
    const latest = new Map();
    for (const a of p.adjustments) {
      assert.ok(['light','dark'].includes(a.mode)); assert.match(a.toValue,/^#[a-f\d]{6}$/i);
      assert.ok(a.fromValue===null || /^#[a-f\d]{6}$/i.test(a.fromValue));
      assert.ok(a.reason.trim());
      for (const role of a.roles) latest.set(`${a.mode}.${role}`,a.toValue);
    }
    for (const [key,value] of latest) { const [mode,role]=key.split('.'); assert.equal(p[mode][role],value,`${p.id}.${key}`); }
  }
  for (const g of library.graphics) for (const a of g.adjustments??[]) {
    assert.equal(g.pattern.strength[a.mode],a.toValue);
    assert.ok(a.toValue<a.fromValue); assert.ok(a.reason.trim());
  }
});

test('the second pack pins all 19 families and 43 local files with unchanged licences', () => {
  assert.deepEqual(library.fontPack, {
    name:'build-brand-fonts-2',
    url:'https://github.com/wisermethod/wiser/releases/download/build-brand-fonts-2/build-brand-fonts-2.tar',
    sha256:'aea8a37f7252460119bb2fbdf93082eef95be7471bcf1af0589cd73e1106da4f',bytes:2457600
  });
  assert.equal(Object.keys(library.fonts).length,19);
  let files=0;
  for (const f of Object.values(library.fonts)) {
    assert.equal(f.licence,'SIL Open Font License 1.1');
    assert.equal(hash(readFileSync(resolve(parts,f.licenceFile))),f.licenceSha256); files++;
    for (const file of f.files) {
      const bytes=readFileSync(resolve(parts,file.path));
      assert.equal(bytes.length,file.bytes); assert.equal(hash(bytes),file.sha256); files++;
    }
  }
  assert.equal(files,43);
  for (const p of library.pairings) {
    assert.deepEqual(p.handwriting.map(f=>f.family),['Caveat']);
    for (const f of [p.type.heading,p.type.body,...p.handwriting]) assert.ok(library.fonts[f.family]);
  }
});

test('ten styles preserve their pairing ids and closed depth recipes; eleven modes stay withheld', () => {
  assert.deepEqual(library.styles.map(s=>s.id),library.pairings.map(p=>p.id));
  assert.deepEqual(library.styles.map(s=>s.column),Array.from('ABCDEFGHIJ'));
  assert.deepEqual(library.styles.map(s=>[s.graphicSet,s.container]),[
    ['editorial','double-ring'],['geometric','filled-circle'],['drafting','rule-box'],['drawn','drawn-ring'],['riso','oval'],
    ['stamp','filled-square'],['stitch','oval'],['editorial','oval'],['marker','marker-swash'],['drafting','double-ring']
  ]);
  for (const style of library.styles) {
    assert.deepEqual(Object.keys(style),['id','column','name','graphicSet','container','depth']);
    assert.equal(style.depth.band,'six');
    assert.ok(graphic(style.graphicSet));
    assert.ok(library.containers.some(c=>c.id===style.container));
  }
  assert.equal(library.withheld.length,11);
  assert.equal(new Set(library.withheld.map(w=>`${w.palette}/${w.style}/${w.mode}`)).size,11);
  assert.equal(Object.hasOwn(library,'approval'),false);
  for (const w of library.withheld) {
    assert.deepEqual(Object.keys(w),['palette','style','mode','reason']);
    assert.ok(palette(w.palette)); assert.ok(pairing(w.style)); assert.equal(w.mode,'light');
    assert.match(w.reason,/mark:|P4-T8:/); assert.doesNotMatch(w.reason,/[\r\n]/);
  }
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
  assert.equal(graphic('editorial').pattern.strength.dark,.32);
  assert.match(graphic('editorial').pattern.svg,/M8 12 H27/);
  assert.ok(graphic('marker').pattern.strength.dark>=.28);assert.match(graphic('marker').pattern.svg,/stroke-width="4"/);
  assert.match(graphic('geometric').pattern.svg,/r="4"/);
  assert.equal(graphic('stitch').pattern.strength.dark,.32);assert.match(graphic('stitch').pattern.svg,/L20 20/);
  assert.ok(graphic('stamp').pattern.strength.dark>=.28);assert.match(graphic('stamp').pattern.svg,/L36 11/);
  assert.equal(graphic('stamp').hero.shape,'underline');assert.match(graphic('stamp').hero.svg,/ Z" fill="currentColor"/);
});

test('parts index documents every current id, the new face, and no stale recipe or pairing',()=>{
  const doc=readFileSync(resolve(parts,'catalogue.md'),'utf8');
  for(const key of ['palettes','pairings','graphics','containers'])for(const p of library[key])assert.ok(doc.includes(`| ${p.id} |`),p.id);
  for(const family of Object.keys(library.fonts))assert.ok(doc.includes(`| ${family} |`));assert.ok(!/\| (?:book|white-emerald|DM Serif Display) \|/.test(doc));
  assert.ok(!/#[a-f\d]{6}\b/i.test(doc));
});

test('all 48 ranked parts carry six closed positions and a soft-to-strong reason',()=>{
  const axes={classicContemporary:['classic','contemporary'],quietBold:['quiet','bold'],warmCool:['warm','cool'],playfulSerious:['playful','serious'],handGeometric:['hand','geometric'],softStrong:['soft','strong']};
  let count=0;
  for(const kind of ['pairings','palettes','graphics'])for(const p of library[kind]) {
    count++;
    for(const [axis,poles]of Object.entries(axes))assert.ok([...poles,'either'].includes(p.tags[axis]),`${kind}/${p.id}/${axis}`);
    assert.ok(p.softStrongReason.trim());
  }
  assert.equal(count,48);assert.equal(pairing('friendly-rounded').tags.softStrong,'soft');
  for(const p of library.palettes)assert.equal(p.tags.warmCool,p.temperature);
});

test('Caveat is notes-only and every approved text pairing remains selectable',()=>{
  assert.equal(library.fonts.Caveat.role,'handwriting');
  assert.equal(library.pairings.length,10);
  for(const p of library.pairings) {
    assert.notEqual(p.selectable,false);
    assert.notEqual(p.type.heading.family,'Caveat'); assert.notEqual(p.type.body.family,'Caveat');
    assert.deepEqual(p.handwriting.map(f=>f.family),['Caveat']);
  }
});


test('card-mode depth overlays name unique available cards and every shown mode passes the shared depth check',()=>{
  assert.equal(library.cardDepth.length,255);
  assert.equal(hash(JSON.stringify(library.cardDepth)), '9a8ef270287a320fbac6d82751921840efff5c9d525c227eacf0c2e89a7dfe07');
  const seen=new Set(),withheld=new Set(library.withheld.map(w=>`${w.palette}/${w.style}/${w.mode}`));
  for(const d of library.cardDepth) {
    assert.deepEqual(Object.keys(d),['palette','style','mode','depth']);
    assert.ok(palette(d.palette));assert.ok(library.styles.some(s=>s.id===d.style));assert.ok(['light','dark'].includes(d.mode));
    const id=`${d.palette}/${d.style}/${d.mode}`;
    assert.ok(!seen.has(id),id);seen.add(id);assert.ok(!withheld.has(id),id);
  }
  let shown=0;
  for(const p of library.palettes) for(const s of library.styles) for(const mode of ['light','dark']) {
    if(withheld.has(`${p.id}/${s.id}/${mode}`)) continue;
    const overlay=library.cardDepth.find(d=>d.palette===p.id&&d.style===s.id&&d.mode===mode);
    assert.doesNotThrow(()=>depthOptions({palette:p,primaryMode:mode,depth:{...s.depth,...overlay?.depth}}),`${p.id}/${s.id}/${mode}`);
    shown++;
  }
  assert.equal(shown,589);
});
