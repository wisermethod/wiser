import '../../../tools/lib/tests/isolated-home.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, readFileSync, writeFileSync, existsSync, mkdtempSync, mkdirSync, symlinkSync, linkSync, readdirSync, rmSync, realpathSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join, isAbsolute, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { assemble, run, LIBRARY } from '../scripts/assemble.mjs';
import { runContactSheet } from '../../../tools/Contact Sheet/scripts/contact-sheet.js';
import { board, selection, matchingPairing, energies } from './selections.mjs';
import { specimens } from './specimens.mjs';
import { checkPack, INSTALL } from '../scripts/fonts.mjs';

const library = JSON.parse(readFileSync(LIBRARY));
assert.ok(checkPack(library).installed, `Real-font board tests require the font pack: run ${INSTALL} from the Build Brand skill's directory`);
const script = fileURLToPath(new URL('../scripts/assemble.mjs', import.meta.url));
const work = mkdtempSync(join(tmpdir(), 'brand-parts-'));
let count = 0;
const path = (label, ext = 'json') => join(work, `${++count}-${label}.${ext}`);
const select = () => selection([board(library)],library);
function build(s) {
  const input=path('selection'), spec=path('spec'), output=path('page','html');
  writeFileSync(input,JSON.stringify(s));
  run(['--selection',input,'--output',spec]);
  const result=runContactSheet(['build','--spec',spec,'--output',output]);
  assert.ok(result.boards.length); assert.ok(readFileSync(output,'utf8').includes('Small things, made to last.'));
  assert.ok(result.boards.every((b) => b.checks.every((c) => (c.need == null || c.wcag >= c.need) && (!c.apcaNeed || Math.abs(c.apcaLc) >= c.apcaNeed))));
  return {spec:JSON.parse(readFileSync(spec)),result,output};
}
test.after(() => rmSync(work,{recursive:true,force:true}));

test('selection assembles and Contact Sheet builds it, with absolute local fonts', () => {
  const {spec,result}=build(select());
  assert.equal(result.itemCount,1);
  for(const f of Object.values(spec.boards[0].type)) for(const file of f.files) { assert.ok(isAbsolute(file.path)); assert.ok(file.path.startsWith(resolve(dirname(LIBRARY),'fonts')+'/')); }
});
test('family: boards using only two families assemble after only those family assets are installed', () => {
  const root = mkdtempSync(join(work, 'two-families-')), plugin = join(root, 'plugin');
  const scripts = join(plugin, 'skills/Build Brand/scripts'), parts = join(root, 'parts'), assets = join(root, 'assets');
  for (const dir of [scripts, parts, assets, join(plugin, 'tools/lib')]) mkdirSync(dir, { recursive: true });
  copyFileSync(fileURLToPath(new URL('../scripts/fonts.mjs', import.meta.url)), join(scripts, 'fonts.mjs'));
  copyFileSync(fileURLToPath(new URL('../../../tools/lib/consent.js', import.meta.url)), join(plugin, 'tools/lib/consent.js'));
  copyFileSync(new URL('../../../tools/lib/user-config.js', import.meta.url), join(plugin, 'tools/lib/user-config.js'));
  writeFileSync(join(plugin, 'tools/AGENTS.md'), '# Isolated test plugin\n');
  const libraryPath = join(parts, 'parts.json'); writeFileSync(libraryPath, JSON.stringify(library));
  const families = ['Fraunces', 'Instrument Sans'];
  for (const name of families) {
    const metadata = library.fonts[name];
    for (const path of [...metadata.files.map(f => f.path), metadata.licenceFile]) {
      copyFileSync(resolve(dirname(LIBRARY), path), join(assets, path.slice(6).replaceAll('/', '--').replaceAll(' ', '_')));
    }
  }
  const child = spawnSync(process.execPath, [join(scripts, 'fonts.mjs'), 'check', '--install', '--library', libraryPath, '--from', assets, ...families.flatMap(name => ['--family', name])], { encoding: 'utf8', env: { ...process.env, WISER_ALLOW_INSTALL: '' } });
  assert.equal(child.status, 0, child.stderr); assert.equal(JSON.parse(child.stdout).installed, true);
  assert.deepEqual(readdirSync(join(parts, 'fonts')).sort(), [...families].sort());
  assert.equal(checkPack(library, join(parts, 'fonts')).installed, false, 'the full pack remains incomplete');
  const s = selection([board(library, { pairing: 'soft-serif' }), board(library, { number: 2, pairing: 'soft-serif' })], library);
  const input = join(root, 'selection.json'), output = join(root, 'spec.json'); writeFileSync(input, JSON.stringify(s));
  assert.equal(run(['--selection', input, '--library', libraryPath, '--output', output]).boards, 2);
  const spec = JSON.parse(readFileSync(output));
  for (const b of spec.boards) {
    assert.deepEqual(Object.values(b.type).map(f => f.family), families);
    for (const face of Object.values(b.type)) for (const f of face.files) assert.ok(f.path.startsWith(realpathSync(parts) + '/fonts/'));
  }
  const changed = join(parts, library.fonts.Fraunces.files[0].path); writeFileSync(changed, 'damaged');
  assert.throws(() => assemble(s, library, { partsDir: parts }), /Fraunces is missing or changed/);
});
for (const [field, key] of [['palette','palette'],['pairing','pairing'],['graphicSet','graphic set'],['container','container']]) {
  test(`unknown ${key} refuses atomically with board and field`, () => {
    const s=select(); if(field==='container') s.boards[0][field]='missing'; else s.boards[0][field].id='missing';
    const input=path('bad'), output=path('absent'); writeFileSync(input,JSON.stringify(s));
    const before=readdirSync(work);
    const child=spawnSync(process.execPath,[script,'--selection',input,'--output',output],{encoding:'utf8'});
    assert.equal(child.status,1); assert.equal(child.stdout,''); assert.match(JSON.parse(child.stderr).error,new RegExp(`Board 1 .*${field}`));
    assert.equal(existsSync(output),false); assert.deepEqual(readdirSync(work),before);
  });
}
test('a heading blend carries its face, weights and settings into another pairing', () => {
  const s=select(); s.boards[0].pairing.headingFrom='sharp-serif';
  const {spec}=build(s); const actual=spec.boards[0].type;
  assert.equal(actual.heading.family,library.pairings.find((p)=>p.id==='sharp-serif').type.heading.family);
  assert.deepEqual(actual.heading.sizes,library.pairings.find((p)=>p.id==='sharp-serif').type.heading.sizes);
  assert.equal(actual.body.family,library.pairings.find((p)=>p.id==='warm-grotesque').type.body.family);
});
for (const role of ['heading', 'body']) test(`a supplied ${role} file reaches the spec and builds without library face metadata`, () => {
  const s = select(), base = library.pairings.find((p) => p.id === s.boards[0].pairing.id).type[role];
  const supplied = path('supplied face', extname(base.files[0].path).slice(1));
  const bytes = readFileSync(resolve(dirname(LIBRARY), base.files[0].path));
  writeFileSync(supplied, bytes);
  s.boards[0].pairing[`${role}From`] = { file: basename(supplied), family: `Supplied ${role}`, weight: 400 };
  const { spec, output } = build(s), face = spec.boards[0].type[role];
  assert.equal(face.family, `Supplied ${role}`);
  assert.equal(face.licence, 'supplied by the person');
  assert.equal(face.sample, s.boards[0].content.sentence);
  assert.equal(face.description, 'A face supplied by the person.');
  assert.deepEqual(face.files, [{ path: realpathSync(supplied), weight: 400, style: 'normal' }]);
  assert.deepEqual(face.weights, [400]); assert.equal(Object.hasOwn(face, 'variations'), false);
  for (const [key, settings] of Object.entries(face.sizes)) {
    assert.deepEqual(settings, { ...base.sizes[key], weight: 400, variations: null });
  }
  assert.ok(readFileSync(output, 'utf8').includes(bytes.toString('base64')), 'the supplied bytes are embedded');
});
test('a supplied static heading and a library body blend build together', () => {
  const s = select(), entry = Object.values(library.fonts).flatMap((f) => f.files).find((f) => f.path.endsWith('.ttf'));
  const supplied = path('static', 'ttf');
  writeFileSync(supplied, readFileSync(resolve(dirname(LIBRARY), entry.path)));
  s.boards[0].pairing.headingFrom = { file: supplied, family: 'Supplied static heading', weight: 400 };
  s.boards[0].pairing.bodyFrom = 'quiet-sans';
  const { spec } = build(s);
  assert.equal(spec.boards[0].type.heading.files[0].path, realpathSync(supplied));
  assert.equal(spec.boards[0].type.body.family, library.pairings.find((p) => p.id === 'quiet-sans').type.body.family);
});
test('supplied heading and body work with no library fonts installed', () => {
  const s = select(), emptyParts = path('empty-parts'); mkdirSync(emptyParts);
  for (const role of ['heading', 'body']) {
    const file = library.pairings.find(p => p.id === s.boards[0].pairing.id).type[role].files[0].path;
    const supplied = path(`own-${role}`, extname(file).slice(1));
    writeFileSync(supplied, readFileSync(resolve(dirname(LIBRARY), file)));
    s.boards[0].pairing[`${role}From`] = { file: supplied, family: `Own ${role}`, weight: 400 };
  }
  const spec = assemble(s, library, { partsDir: emptyParts, selectionDir: work });
  assert.equal(spec.boards[0].type.heading.family, 'Own heading');
  assert.equal(spec.boards[0].type.body.family, 'Own body');
});
for (const role of ['heading', 'body']) test(`a missing supplied ${role} is refused atomically without a substitute`, () => {
  const s = select(), input = path('missing-font'), output = path('absent-spec');
  s.boards[0].pairing[`${role}From`] = { file: 'absent.woff2', family: 'Supplied face', weight: 400 };
  writeFileSync(input, JSON.stringify(s)); const before = readdirSync(work);
  assert.throws(() => run(['--selection', input, '--output', output]), new RegExp(`Board 1 .*pairing.${role}From.file.*absent or unreadable`));
  assert.equal(existsSync(output), false); assert.deepEqual(readdirSync(work), before);
});
for (const [label, extension, bytes] of [
  ['text renamed as font', 'woff2', Buffer.from('This is text, not a font.')],
  ['signature only', 'woff2', Buffer.from('wOF2')],
  ['truncated sfnt', 'ttf', Buffer.from([0, 1, 0, 0])],
  ['truncated opentype', 'otf', Buffer.from('OTTO')],
  ['truncated woff', 'woff', Buffer.from('wOFF')],
  ['unsupported extension', 'txt', Buffer.from('text')]
]) test(`a supplied ${label} is refused before writing`, () => {
  const s = select(), supplied = path('invalid-font', extension), input = path('invalid-font-selection'), output = path('no-spec');
  writeFileSync(supplied, bytes);
  s.boards[0].pairing.headingFrom = { file: supplied, family: 'Supplied face', weight: 400 };
  writeFileSync(input, JSON.stringify(s));
  assert.throws(() => run(['--selection', input, '--output', output]), /Board 1 .*pairing.headingFrom.file.*(?:font container|local .*font)/);
  assert.equal(existsSync(output), false);
});
test('an unreadable supplied font is refused before writing', (t) => {
  const base = library.pairings[0].type.heading.files[0], supplied = path('unreadable', extname(base.path).slice(1));
  writeFileSync(supplied, readFileSync(resolve(dirname(LIBRARY), base.path))); chmodSync(supplied, 0);
  try {
    try { readFileSync(supplied); t.skip('this user can read a mode-000 file'); return; } catch {}
    const s = select(), input = path('unreadable-selection'), output = path('no-unreadable-spec');
    s.boards[0].pairing.headingFrom = { file: supplied, family: 'Supplied face', weight: 400 };
    writeFileSync(input, JSON.stringify(s));
    assert.throws(() => run(['--selection', input, '--output', output]), /pairing.headingFrom.file.*unreadable/);
    assert.equal(existsSync(output), false);
  } finally { chmodSync(supplied, 0o600); }
});
for (const [field, value] of [['family', ''], ['weight', 0], ['weight', 1001], ['weight', '400'], ['file', ''], ['extra', true]]) {
  test(`invalid supplied face ${field} ${JSON.stringify(value)} is refused`, () => {
    const s = select(), face = { file: 'face.woff2', family: 'Supplied face', weight: 400, [field]: value };
    s.boards[0].pairing.bodyFrom = face;
    assert.throws(() => assemble(s, library), new RegExp(`pairing.bodyFrom.${field}`));
  });
}
for (const [field, value] of [['sentence', ''], ['photoRules', ''], ['never', ['']]]) test(`an empty board ${field} cannot be assembled`, () => {
  const s = select(); s.boards[0].content[field] = value;
  assert.throws(() => assemble(s, library), new RegExp(`content.${field}`));
});
test('an empty core word or boundary cannot be assembled', () => {
  for (const words of [[{ word: '', not: 'boundary' }], [{ word: 'word', not: '' }]]) {
    const s = select(); s.boards[0].words = words;
    assert.throws(() => assemble(s, library), /\.words/);
  }
});
test('optional selection fields survive assembly, omit their blocks, and reject malformed present values', () => {
  for (let mask = 0; mask < 8; mask++) for (const empty of [false, true]) {
    const s = select(), b = s.boards[0];
    if (!(mask & 1)) { if (empty) b.words = []; else delete b.words; }
    if (!(mask & 2)) delete b.content.photoRules;
    if (!(mask & 4)) { if (empty) b.content.never = []; else delete b.content.never; }
    const { spec, output } = build(s), actual = spec.boards[0], html = readFileSync(output, 'utf8');
    assert.equal(Object.hasOwn(actual, 'words'), Object.hasOwn(b, 'words'));
    if (Object.hasOwn(b, 'words')) assert.deepEqual(actual.words, b.words);
    assert.deepEqual(actual.content, b.content);
    assert.equal((html.match(/<section class="words">/g) || []).length, mask & 1 ? 2 : 0);
    assert.equal((html.match(/>Photo rules<\/h3>/g) || []).length, mask & 2 ? 2 : 0);
    assert.equal((html.match(/>Never<\/h3>/g) || []).length, mask & 4 ? 2 : 0);
    assert.equal((html.match(/<section class="rules">/g) || []).length, mask & 6 ? 2 : 0);
  }
  for (const [field, values] of [
    ['words', [null, {}, '', [{ word: '', not: 'vague' }], [{ word: 'clear' }], [{ word: 'clear', not: 'vague', extra: true }]]],
    ['photoRules', [null, [], '', '  ', 42]],
    ['never', [null, {}, '', [''], ['line\nbreak'], [42]]]
  ]) for (const value of values) {
    const s = select(), target = field === 'words' ? s.boards[0] : s.boards[0].content;
    target[field] = value;
    assert.throws(() => assemble(s, library), new RegExp(field));
  }
});
test('body blend, role and pattern overrides reach the built spec exactly', () => {
  const s=select(); Object.assign(s.boards[0].pairing,{bodyFrom:'quiet-sans'});
  s.boards[0].palette.overrides={light:{smallPrint:'#4B4037'},dark:{smallPrint:'#E5D4C2'}};
  s.boards[0].graphicSet.pattern={angle:-17,strength:{light:.03,dark:.12}};
  const {spec}=build(s), b=spec.boards[0];
  assert.equal(b.type.body.family,'Source Serif 4'); assert.equal(b.palette.light.smallPrint,'#4B4037'); assert.equal(b.palette.dark.smallPrint,'#E5D4C2');
  assert.equal(b.graphics.pattern.angle,-17); assert.deepEqual(b.graphics.pattern.strength,{light:.03,dark:.12});
});
test('same selection gives identical spec bytes on separate invocations', () => {
  const input=path('stable'), first=path('first'), second=path('second');writeFileSync(input,JSON.stringify(select()));
  for(const output of [first,second])run(['--selection',input,'--output',output]);
  assert.deepEqual(readFileSync(first),readFileSync(second));
});
for(const [field,value,fragment] of [
 ['palette',{id:'paper-orange',overrides:{light:{typo:'#fff'}}},'palette.overrides.light.typo'],
 ['palette',{id:'paper-orange',overrides:{light:{pop:'orange'}}},'palette.overrides.light.pop'],
 ['palette',{id:'paper-orange',overrides:{sepia:{pop:'#fff'}}},'palette.overrides.sepia'],
 ['pairing',{id:'warm-grotesque',headingFrom:'missing'},'pairing.headingFrom'],
 ['graphicSet',{id:'drawn',pattern:{angle:181}},'graphicSet.pattern.angle'],
 ['graphicSet',{id:'drawn',pattern:{strength:{dark:'strong'}}},'graphicSet.pattern.strength.dark'],
 ['graphicSet',{id:'drawn',texture:{strength:{light:-1}}},'graphicSet.texture.strength.light'],
 ['handwriting','missing','handwriting']
]) test(`malformed ${fragment} is refused before any output`, () => {
  const s=select();s.boards[0][field]=value;
  const input=path('malformed'),output=path('refused');writeFileSync(input,JSON.stringify(s));
  assert.throws(()=>run(['--selection',input,'--output',output]),(e)=>e.message.includes('Board 1')&&e.message.includes(fragment));
  assert.ok(!existsSync(output));
});
test('own mark resolves from selection location and replaces initials and container', () => {
  const mark=path('own','svg');writeFileSync(mark,'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="currentColor"/></svg>');
  const s=select();delete s.boards[0].container;delete s.boards[0].initials;s.boards[0].markFile=mark;
  const {spec}=build(s);assert.deepEqual(spec.boards[0].monogram,{file:realpathSync(mark)});
});
test('board zero and recommendations survive assembly', () => {
 const s=select();s.boards[0].number=0;s.boards[0].zero=true;s.boards[0].recommendation='A clear starting place.';
 s.boards.push(board(library, { number: 1 }));
 const {spec}=build(s);assert.equal(spec.boards[0].zero,true);assert.equal(spec.boards[0].recommendation,s.boards[0].recommendation);
});
test('help is configuration free and unknown options refuse with empty stdout', () => {
  const help=spawnSync(process.execPath,[script,'--help','--selection','/absent'],{encoding:'utf8'}); assert.equal(help.status,0);assert.match(help.stdout,/Usage:/);
  for(const flag of ['--env','--install','--typo']) { const c=spawnSync(process.execPath,[script,flag],{encoding:'utf8'});assert.equal(c.status,1);assert.equal(c.stdout,'');assert.ok(c.stderr.includes(flag)); }
});
test('outputs inside the skill, linked outputs and existing hard links are refused', () => {
 const input=path('paths');writeFileSync(input,JSON.stringify(select()));
 const alias=join(work,'skill-link');symlinkSync(resolve(dirname(LIBRARY),'..'),alias,'dir');
 for(const output of [resolve(dirname(LIBRARY),'refused.json'),join(alias,'refused.json')]) assert.throws(()=>run(['--selection',input,'--output',output]),/inside this skill/);
 const hard=path('hard');linkSync(input,hard);assert.throws(()=>run(['--selection',input,'--output',hard]),/already exists/);
 const broken=join(work,'broken');symlinkSync(join(work,'absent'),broken);assert.throws(()=>run(['--selection',input,'--output',join(broken,'out.json')]));
});
test('all palette energies, complete roles, shares and counts are present', () => {
 assert.equal(library.palettes.length,25);assert.equal(library.pairings.length,16);assert.equal(library.containers.length,8);assert.equal(library.graphics.length,8);
 const counts={'quiet':5,'white-and-one':4,'bright':5,'colour-ground':6,'dark-first':5};
 for(const energy of energies) assert.equal(library.palettes.filter((p)=>p.energy===energy).length,counts[energy],energy);
 const roles=Object.keys(library.palettes[0].light);
 for(const p of library.palettes){for(const mode of ['light','dark'])assert.deepEqual(Object.keys(p[mode]).sort(),[...roles].sort());assert.equal(p.swatches.reduce((n,s)=>n+s.share,0),100);}
});
// Isolate each recipe against the unchanged drawn set; graphics have their own
// default-strength builds below. Not every palette/set combination is valid.
for(const [i,p] of library.palettes.entries())test(`palette ${p.id} builds and passes both modes`,()=>build(selection([board(library,{palette:p.id,pairing:matchingPairing(library,p),graphic:'drawn',container:library.containers[i%8].id})],library)));
for(const p of library.pairings)for(const handwriting of [null,...p.handwriting.map((f)=>f.family)]) test(`pairing ${p.id}, notes ${handwriting ?? 'none'} builds`,()=>{
 const preferred=p.tags.typeLoudness===1?'stone-cobalt':p.tags.typeLoudness===2?'white-oxblood':p.tags.typeCut==='period'?'ink-amber':'navy-gold';
 const palette=library.palettes.find((c)=>c.id===preferred);
 return build(selection([board(library,{palette:palette.id,pairing:p.id,handwriting})],library));
});
for(const [i,set] of library.graphics.entries()) test(`graphic ${set.id} and container ${library.containers[i].id} build in both modes`,()=>build(selection([board(library,{palette:'green-black',pairing:'quiet-sans',graphic:set.id,container:library.containers[i].id})],library)));
test('a stronger pattern cannot bypass contrast checks on a locked recipe',()=>{
 assert.throws(()=>build(selection([board(library,{graphic:'editorial'})],library)),/smallPrint over pattern mark.*WCAG/);
});
test('negative contrast control proves Contact Sheet rejects a broken role',()=>{
 const s=select();s.boards[0].palette.overrides={light:{text:'#F9F7F4'}};
 assert.throws(()=>build(s),/WCAG/);
});

function woff2Fixture(directory, { count = 1, compressed = 0, payload = [] } = {}) {
  const header = Buffer.alloc(48), bytes = Buffer.concat([header, Buffer.from(directory), Buffer.from(payload)]);
  bytes.write('wOF2'); bytes.writeUInt32BE(0x00010000, 4);
  bytes.writeUInt32BE(bytes.length, 8); bytes.writeUInt16BE(count, 12);
  bytes.writeUInt32BE(100, 16); bytes.writeUInt32BE(compressed, 20);
  return bytes;
}
function woff2Files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    return entry.isDirectory() ? woff2Files(file) : (entry.name.endsWith('.woff2') ? [file] : []);
  });
}
const woff2ValidDirectories = [
  [0, 1], [10, 1, 1], [11, 0, 0], [0x40, 1, 1],
  [0xca, 1], [0xcb, 0],
  [63, ...Buffer.from('glyf'), 1, 1], [63, ...Buffer.from('loca'), 0, 0],
  [63, ...Buffer.from('test'), 1], [0x7f, ...Buffer.from('test'), 1, 1],
  [0, 0x8f, 0xff, 0xff, 0xff, 0x7f]
];
const woff2InvalidDirectories = [
  ['header without a directory', []],
  ['truncated custom tag', [63, 0x61, 0x62]],
  ['missing original length', [0]],
  ['truncated original length', [0, 0x81]],
  ['leading-zero original length', [0, 0x80, 1]],
  ['six-byte original length', [0, 0x81, 0x80, 0x80, 0x80, 0x80, 0]],
  ['overflowing original length', [0, 0x90, 0x80, 0x80, 0x80, 0]],
  ['missing glyf transform length', [10, 1]],
  ['missing loca transform length', [11, 0]],
  ['missing other transform length', [0x40, 1]],
  ['missing custom glyf transform length', [63, ...Buffer.from('glyf'), 1]],
  ['missing custom loca transform length', [63, ...Buffer.from('loca'), 0]],
  ['missing custom other transform length', [0x7f, ...Buffer.from('test'), 1]],
  ['leading-zero transform length', [10, 1, 0x80, 0]],
  ['six-byte transform length', [10, 1, 0x81, 0x80, 0x80, 0x80, 0x80, 0]],
  ['overflowing transform length', [10, 1, 0x90, 0x80, 0x80, 0x80, 0]],
  ['too few directory entries', [0, 1], { count: 2 }],
  ['truncated compressed data', [0, 1], { compressed: 1 }]
];

for (const [label, directory, options] of woff2InvalidDirectories) test('WOFF2 regression: supplied ' + label + ' is refused', (t) => {
  const s = select(), supplied = path('directory-font', 'woff2'), input = path('directory-selection'), output = path('no-directory-spec');
  s.boards[0].pairing.headingFrom = { file: supplied, family: 'Supplied face', weight: 400 };
  if (label === 'header without a directory') {
    for (const entry of woff2ValidDirectories) {
      writeFileSync(supplied, woff2Fixture(entry, { compressed: 1, payload: [0] }));
      assert.equal(assemble(s, library).boards[0].type.heading.family, 'Supplied face');
    }
    const fonts = woff2Files(resolve(dirname(LIBRARY), 'fonts'));
    assert.ok(fonts.length > 0, 'the installed font pack is required');
    for (const font of fonts) {
      s.boards[0].pairing.headingFrom.file = font;
      assert.equal(assemble(s, library).boards[0].type.heading.files[0].path, realpathSync(font));
    }
    s.boards[0].pairing.headingFrom.file = supplied;
    t.diagnostic('Accepted all ' + fonts.length + ' real WOFF2 files and all bounded directory forms.');
  }
  writeFileSync(supplied, woff2Fixture(directory, options));
  writeFileSync(input, JSON.stringify(s));
  assert.throws(() => run(['--selection', input, '--output', output]), /pairing.headingFrom.file.*invalid font container/);
  assert.equal(existsSync(output), false);
});

test("all four specimen selections build with the complete library",()=>{
 const output=join(work,"specimens");mkdirSync(output);const result=specimens(["--output-dir",output]);
 assert.equal(result.boards,66);for(const name of result.pages)assert.ok(existsSync(join(output,name+".html")));
 const pages=Object.fromEntries(result.pages.map(name=>[name,JSON.parse(readFileSync(join(output,name+'.selection.json')))]));
 assert.deepEqual(pages.palettes.boards.map(b=>b.palette.id),library.palettes.map(p=>p.id));
 assert.deepEqual(pages.pairings.boards.map(b=>b.pairing.id),library.pairings.map(p=>p.id));
 for(const p of library.pairings)assert.equal(pages.pairings.boards.find(b=>b.pairing.id===p.id).handwriting,p.handwriting[0].family);
 for(const g of library.graphics)assert.deepEqual(pages.graphics.boards.filter(b=>b.graphicSet.id===g.id).map(b=>b.primaryMode),['light','dark']);
 for(const c of library.containers)assert.ok(pages.graphics.boards.some(b=>b.container===c.id));
 for(const id of ['editorial','marker','geometric','stitch','stamp'])assert.ok(pages.whole.boards.some(b=>b.graphicSet.id===id && b.primaryMode==='dark' && library.palettes.find(p=>p.id===b.palette.id).energy==='dark-first'));
 for(const energy of energies)assert.ok(pages.whole.boards.some(b=>b.group===energy));
 for(const name of result.pages){
   const html=readFileSync(join(output,name+'.html'),'utf8');assert.ok(/placeholder monogram/.test(html),name+' initials label');assert.ok(/monograms are placeholders/i.test(html),name+' placeholder notice');
 }
});
