#!/usr/bin/env node
// Built-ins only; standards/script-contract.md governs the command.
import { readFileSync, writeFileSync, realpathSync, lstatSync, statSync } from 'node:fs';
import { dirname, basename, extname, resolve, relative, isAbsolute, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkPack, INSTALL } from './fonts.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL = realpathSync(resolve(HERE, '..'));
export const LIBRARY = resolve(SKILL, 'parts/parts.json');
const ROLES = ['ground', 'panel', 'text', 'headline', 'smallPrint', 'deep', 'pop', 'onPop', 'mark', 'cardFront', 'cardFrontText', 'cardFrontSmallPrint', 'cardBack', 'cardBackText', 'cardBackMark', 'sub', 'note', 'panelSmallPrint', 'hairline'];
const MODES = ['light', 'dark'];
export const AXES = { classicContemporary: ['classic','contemporary'], quietBold: ['quiet','bold'], warmCool: ['warm','cool'], playfulSerious: ['playful','serious'], handGeometric: ['hand','geometric'], softStrong: ['soft','strong'] };
const HELP = `Assemble one Contact Sheet board spec from explicit library choices.
Usage: node assemble.mjs --selection <absolute.json> --output <absolute.json>
       node assemble.mjs help
Options:
  --selection <file>  Required selection JSON; asset paths are relative to it.
  --output <file>     Required new JSON file outside this skill; parent must exist.
  --library <file>    Optional absolute parts.json; defaults to the bundled library.
  --help, -h         Print help before opening any file.
No dependencies, installs, configuration, network, ranking or automatic repairs.
Unknown flags, ids and malformed fields are refused before writing anything.
Success: one JSON object on stdout, exit 0. Failure: JSON on stderr, exit 1.
Selection fields and an example are documented in parts/parts.md.`;
const fail = (at, cause) => { throw new Error(`${at}: ${cause}. Correct the selection; see assemble.mjs --help.`); };
const copy = (value) => structuredClone(value);
const has = (o, k) => Object.hasOwn(o, k);
function object(value, keys, at) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(at, 'expected an object');
  for (const k of Object.keys(value)) if (!keys.includes(k)) fail(`${at}.${k}`, 'unknown field');
}
function text(value, at, multiline = false) {
  if (typeof value !== 'string' || !value.trim() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value) || (!multiline && /[\r\n\u2028\u2029]/.test(value))) fail(at, 'expected non-empty text');
}
function list(value, at, allowEmpty = false) { if (!Array.isArray(value) || (!allowEmpty && !value.length)) fail(at, allowEmpty ? 'expected an array' : 'expected a non-empty array'); }
function num(value, min, max, at) { if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(at, `expected a number from ${min} to ${max}`); }
function strings(value, keys, at, multiline = []) {
  object(value, keys, at);
  for (const k of keys) text(value[k], `${at}.${k}`, multiline.includes(k));
}
const inside = (parent, path) => { const r = relative(parent, path); return r === '' || (!isAbsolute(r) && r !== '..' && !r.startsWith(`..${sep}`)); };
export function canonical(candidate) {
  let head = resolve(candidate); const tail = [];
  for (;;) {
    try { lstatSync(head); return join(realpathSync(head), ...tail); }
    catch (e) {
      if (e.code !== 'ENOENT') fail('path', 'cannot resolve path; repair broken links or permissions');
      // A dangling link is not a missing ancestor that can be rejoined.
      try { lstatSync(head); fail('path', 'broken symbolic link'); } catch (probe) { if (probe.code !== 'ENOENT') throw probe; }
      const parent = dirname(head); if (parent === head) fail('path', 'cannot canonicalize path');
      tail.unshift(basename(head)); head = parent;
    }
  }
}
function screened(candidate, at, destination = false) {
  if (typeof candidate !== 'string' || candidate.includes('\0')) fail(at, 'expected a local path');
  const path = canonical(candidate);
  if (path.split(sep).includes('memory') || /^\.env(?:\.|$)/i.test(basename(path))) fail(at, 'protected source or destination');
  if (destination && inside(SKILL, path)) fail(at, 'output resolves inside this skill; use a work directory');
  return path;
}
function source(candidate, at) {
  const path = screened(candidate, at);
  try { if (!statSync(path).isFile()) fail(at, 'expected a regular file'); }
  catch { fail(at, 'file is absent or unreadable'); }
  return path;
}
function lookup(library, kind, id, at) {
  text(id, at);
  const found = library[kind]?.filter((p) => p.id === id);
  if (found?.length !== 1) fail(at, `unknown or duplicate ${kind} id "${id}"`);
  if (['pairings','palettes','graphics'].includes(kind)) for (const [axis, poles] of Object.entries(AXES)) {
    if (![...poles, 'either'].includes(found[0].tags?.[axis])) fail(`${at}.tags.${axis}`, 'part needs a valid ranking position');
  }
  return found[0];
}
// Ranking provenance travels in the command's report, outside the deliberately
// closed Contact Sheet spec (which accepts only its three match-check tags).
export function partPositions(library, board) {
  return Object.fromEntries([['pairing','pairings',board.pairing.headingFrom && typeof board.pairing.headingFrom === 'string' ? board.pairing.headingFrom : board.pairing.id],['palette','palettes',board.palette.id],['graphicSet','graphics',board.graphicSet.id]].map(([role,kind,id]) => [role, Object.fromEntries(Object.keys(AXES).map(axis => [axis,lookup(library,kind,id,role).tags[axis]]))]));
}
function font(face, partsDir, at, library) {
  const metadata = library.fonts[face.family];
  if (!metadata) fail(at, `unknown library family ${face.family}`);
  const state = checkPack({ fonts: { [face.family]: metadata } }, resolve(partsDir, 'fonts'));
  if (!state.installed) fail(at, `library font ${face.family} is missing or changed; run ${INSTALL} from the Build Brand skill's directory`);
  const result = copy(face);
  result.files = result.files.map((f) => {
    const path = source(resolve(partsDir, f.path), `${at}.files`);
    if (!inside(realpathSync(resolve(partsDir, 'fonts')), path)) fail(`${at}.files`, 'font must resolve inside parts/fonts');
    return { ...f, path };
  });
  return result;
}
// Read the WOFF2 directory before trusting the compressed block's bounds.
function woff2Directory(data, bad) {
  let cursor = 48;
  const base128 = () => {
    let value = 0;
    for (let i = 0; i < 5; i += 1) {
      if (cursor >= data.length) bad();
      const byte = data[cursor++];
      if ((i === 0 && byte === 0x80) || value > 0x1ffffff) bad();
      value = value * 128 + (byte & 0x7f);
      if (!(byte & 0x80)) return value;
    }
    bad();
  };
  for (let i = 0; i < data.readUInt16BE(12); i += 1) {
    if (cursor >= data.length) bad();
    const flags = data[cursor++], index = flags & 0x3f, version = flags >>> 6;
    let outlines = index === 10 || index === 11; // Known glyf and loca tags.
    if (index === 63) {
      if (cursor + 4 > data.length) bad();
      const tag = data.toString('latin1', cursor, cursor + 4);
      cursor += 4;
      outlines = tag === 'glyf' || tag === 'loca';
    }
    base128(); // origLength
    if (outlines ? version === 0 : version !== 0) base128(); // transformLength
  }
  if (cursor + data.readUInt32BE(20) > data.length) bad();
}
function suppliedFont(choice, base, selectionDir, sample, at) {
  object(choice, ['file', 'family', 'weight'], at);
  text(choice.file, `${at}.file`); text(choice.family, `${at}.family`);
  num(choice.weight, 1, 1000, `${at}.weight`);
  const path = source(resolve(selectionDir, choice.file), `${at}.file`);
  const extension = extname(path).toLowerCase();
  const signatures = { '.ttf': ['00010000', '74727565'], '.otf': ['4f54544f'], '.woff': ['774f4646'], '.woff2': ['774f4632'] };
  if (!has(signatures, extension)) fail(`${at}.file`, 'use a local .ttf, .otf, .woff or .woff2 font');
  let data;
  try { data = readFileSync(path); } catch { fail(`${at}.file`, 'font file is unreadable'); }
  const bad = () => fail(`${at}.file`, 'invalid font container; supply a complete font file');
  if (!signatures[extension].includes(data.subarray(0, 4).toString('hex'))) bad();
  // Container bounds catch renamed non-fonts and incomplete files before a spec
  // is written. Contact Sheet still performs its own checks before embedding.
  if (extension === '.ttf' || extension === '.otf') {
    if (data.length < 12) bad();
    const count = data.readUInt16BE(4), end = 12 + count * 16, tags = new Set();
    if (!count || end > data.length) bad();
    for (let i = 0; i < count; i++) {
      const start = 12 + i * 16, tag = data.toString('ascii', start, start + 4);
      const offset = data.readUInt32BE(start + 8), length = data.readUInt32BE(start + 12);
      if (tags.has(tag) || offset < end || offset + length > data.length) bad();
      tags.add(tag);
    }
    if (!['head', 'hhea', 'maxp', 'hmtx', 'cmap'].every((tag) => tags.has(tag))) bad();
  } else {
    const header = extension === '.woff' ? 44 : 48;
    if (data.length < header || data.readUInt32BE(8) !== data.length || !data.readUInt16BE(12) || data.readUInt16BE(14) !== 0) bad();
    if (extension === '.woff') {
      const count = data.readUInt16BE(12), end = header + count * 20;
      if (end > data.length) bad();
      for (let i = 0; i < count; i++) {
        const start = header + i * 20, offset = data.readUInt32BE(start + 4), size = data.readUInt32BE(start + 8);
        if (offset < end || offset + size > data.length || size > data.readUInt32BE(start + 12)) bad();
      }
    } else woff2Directory(data, bad);
  }
  const result = copy(base);
  result.family = choice.family;
  result.description = 'A face supplied by the person.';
  result.sample = sample;
  result.licence = 'supplied by the person';
  result.files = [{ path, weight: choice.weight, style: 'normal' }];
  result.weights = [choice.weight];
  delete result.variations; delete result.stripLabel;
  for (const size of Object.values(result.sizes)) { size.weight = choice.weight; size.variations = null; }
  return result;
}

// This is resolution and shape validation, not a design decision or contrast repair.
// Contact Sheet remains the authority for the resulting board's rendering checks.
export function assemble(selection, library, { partsDir = dirname(LIBRARY), selectionDir = process.cwd() } = {}) {
  object(selection, ['person', 'intro', 'groups', 'footnote', 'boards'], 'selection');
  text(selection.person, 'person'); text(selection.footnote, 'footnote', true);
  if (!Array.isArray(selection.intro) || selection.intro.length !== 2) fail('intro', 'supply exactly two lines');
  selection.intro.forEach((s, i) => text(s, `intro[${i}]`));
  list(selection.groups, 'groups'); const groups = new Set();
  for (const g of selection.groups) { strings(g, ['id', 'label'], 'groups'); if (groups.has(g.id)) fail('groups', 'duplicate id'); groups.add(g.id); }
  list(selection.boards, 'boards'); const numbers = new Set(); let recommendations = 0;
  const boards = selection.boards.map((b, index) => {
    const at = `Board ${b?.number ?? index + 1} (${b?.name ?? 'unnamed'})`;
    object(b, ['number', 'name', 'group', 'energy', 'why', 'recommendation', 'zero', 'primaryMode', 'buttonRadius', 'palette', 'pairing', 'handwriting', 'graphicSet', 'container', 'markFile', 'content', 'initials', 'heroPhrase', 'note', 'words', 'sample', 'items', 'closingExamples'], at);
    for (const k of ['name', 'group', 'energy', 'why', 'primaryMode']) text(b[k], `${at}.${k}`);
    num(b.number, 0, Number.MAX_SAFE_INTEGER, `${at}.number`);
    if (!Number.isSafeInteger(b.number) || numbers.has(b.number)) fail(`${at}.number`, 'expected a unique safe integer'); numbers.add(b.number);
    if (has(b, 'zero') && typeof b.zero !== 'boolean') fail(`${at}.zero`, 'expected a boolean');
    if ((b.number === 0) !== (b.zero === true)) fail(`${at}.zero`, 'number 0 and zero true must occur together');
    if (!groups.has(b.group)) fail(`${at}.group`, 'unknown group');
    if (!MODES.includes(b.primaryMode)) fail(`${at}.primaryMode`, 'use light or dark');
    num(b.buttonRadius, 0, 100, `${at}.buttonRadius`);
    if (has(b, 'recommendation')) { text(b.recommendation, `${at}.recommendation`); if (++recommendations > 2) fail(`${at}.recommendation`, 'at most two recommendations'); }
    object(b.palette, ['id', 'overrides'], `${at}.palette`);
    const recipe = lookup(library, 'palettes', b.palette.id, `${at}.palette.id`);
    const palette = Object.fromEntries(['light', 'dark', 'swatches', 'modeSwatches', 'chips'].filter((k) => has(recipe, k)).map((k) => [k, copy(recipe[k])]));
    if (has(b.palette, 'overrides')) {
      object(b.palette.overrides, MODES, `${at}.palette.overrides`);
      for (const [mode, overrides] of Object.entries(b.palette.overrides)) {
        object(overrides, ROLES, `${at}.palette.overrides.${mode}`);
        for (const [role, value] of Object.entries(overrides)) {
          if (typeof value !== 'string' || !/^#(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(value)) fail(`${at}.palette.overrides.${mode}.${role}`, 'use opaque sRGB hex');
          palette[mode][role] = value;
        }
      }
    }
    object(b.pairing, ['id', 'headingFrom', 'bodyFrom'], `${at}.pairing`);
    const pairing = lookup(library, 'pairings', b.pairing.id, `${at}.pairing.id`);
    const donors = {}, type = {};
    for (const role of ['heading', 'body']) {
      const field = `${role}From`, where = `${at}.pairing.${field}`;
      const choice = has(b.pairing, field) ? b.pairing[field] : pairing.id;
      if (typeof choice === 'string') {
        donors[role] = lookup(library, 'pairings', choice, where);
        type[role] = font(donors[role].type[role], partsDir, `${at}.type.${role}`, library);
      } else {
        donors[role] = pairing;
        type[role] = suppliedFont(choice, pairing.type[role], selectionDir, b.content?.sentence, where);
      }
    }
    const heading = donors.heading;
    if (!has(b, 'handwriting')) fail(`${at}.handwriting`, 'choose an offered family or null');
    if (b.handwriting !== null) {
      const choice = pairing.handwriting.find((f) => f.family === b.handwriting);
      if (!choice) fail(`${at}.handwriting`, 'choose a handwriting family offered by the base pairing, or null');
      type.handwriting = font(choice, partsDir, `${at}.type.handwriting`, library);
    }
    object(b.graphicSet, ['id', 'pattern', 'texture'], `${at}.graphicSet`);
    const set = lookup(library, 'graphics', b.graphicSet.id, `${at}.graphicSet.id`);
    const graphics = Object.fromEntries(['hero', 'pattern', 'texture', 'legend', 'title', 'description'].map((k) => [k, copy(set[k])]));
    for (const kind of ['pattern', 'texture']) if (has(b.graphicSet, kind)) {
      const atOverride = `${at}.graphicSet.${kind}`;
      object(b.graphicSet[kind], kind === 'pattern' ? ['angle', 'strength'] : ['strength'], atOverride);
      if (has(b.graphicSet[kind], 'angle')) { num(b.graphicSet[kind].angle, -180, 180, `${atOverride}.angle`); graphics[kind].angle = b.graphicSet[kind].angle; }
      if (has(b.graphicSet[kind], 'strength')) {
        object(b.graphicSet[kind].strength, MODES, `${atOverride}.strength`);
        for (const [mode, value] of Object.entries(b.graphicSet[kind].strength)) { num(value, 0, 1, `${atOverride}.strength.${mode}`); graphics[kind].strength[mode] = value; }
      }
    }
    text(b.heroPhrase, `${at}.heroPhrase`); graphics.hero.phrase = b.heroPhrase;
    let monogram;
    if (has(b, 'markFile')) {
      if (has(b, 'container') || has(b, 'initials')) fail(`${at}.markFile`, 'a supplied mark replaces container and initials');
      text(b.markFile, `${at}.markFile`); monogram = { file: source(resolve(selectionDir, b.markFile), `${at}.markFile`) };
    } else {
      const container = lookup(library, 'containers', b.container, `${at}.container`);
      text(b.initials, `${at}.initials`); monogram = { initials: b.initials, container: container.svg };
      if (container.plate) monogram.surfaces = Object.fromEntries([['ground','headline'], ['cardFront','cardFrontText'], ['cardBack','cardBackText']].map(([surface, ink]) => [surface, { background: ink, ink: surface, frame: surface, radius: container.plate.radius }]));
    }
    object(b.content, ['brandName', 'sentence', 'body', 'smallPrint', 'photoRules', 'never'], `${at}.content`);
    for (const k of ['brandName', 'sentence', 'body', 'smallPrint']) text(b.content[k], `${at}.content.${k}`, k === 'body');
    if (has(b.content, 'photoRules')) text(b.content.photoRules, `${at}.content.photoRules`, true);
    if (has(b.content, 'never')) {
      list(b.content.never, `${at}.content.never`, true); b.content.never.forEach((s) => text(s, `${at}.content.never`));
    }
    if (!b.content.sentence.includes(b.heroPhrase)) fail(`${at}.heroPhrase`, 'must occur in content.sentence');
    strings(b.note, ['text', 'direction'], `${at}.note`);
    if (!['left','right','up','down'].includes(b.note.direction)) fail(`${at}.note.direction`, 'use left, right, up or down');
    if (has(b, 'words')) {
      list(b.words, `${at}.words`, true); b.words.forEach((w) => strings(w, ['word','not'], `${at}.words`));
    }
    object(b.sample, ['kicker','title','phrase','body','note','steps','meta'], `${at}.sample`);
    for (const k of ['kicker','title','phrase','body','note','meta']) text(b.sample[k], `${at}.sample.${k}`, k === 'body');
    if (!b.sample.title.includes(b.sample.phrase)) fail(`${at}.sample.phrase`, 'must occur in sample.title');
    list(b.sample.steps, `${at}.sample.steps`); b.sample.steps.forEach((s) => text(s, `${at}.sample.steps`));
    const itemKeys = ['cardLine','cardBack','bannerHeadline','bannerLine','contact','primaryAction','secondaryAction'];
    object(b.items, [...itemKeys,'cardBackShort','tileBannerHeadline'], `${at}.items`);
    for (const k of itemKeys) text(b.items[k], `${at}.items.${k}`, k === 'cardBack');
    for (const k of ['cardBackShort','tileBannerHeadline']) if (has(b.items,k)) text(b.items[k],`${at}.items.${k}`);
    list(b.closingExamples, `${at}.closingExamples`);
    if (![2,3].includes(b.closingExamples.length)) fail(`${at}.closingExamples`, 'supply two or three examples');
    b.closingExamples.forEach((s) => text(s, `${at}.closingExamples`));
    return { ...Object.fromEntries(['number','name','group','energy','why','recommendation','zero','primaryMode','buttonRadius'].filter((k) => has(b,k)).map((k) => [k,b[k]])), palette, type, tags: { paletteLoudness: recipe.paletteLoudness, typeLoudness: heading.tags.typeLoudness, typeCut: heading.tags.typeCut }, graphics, monogram, content: copy(b.content), ...(has(b, 'words') ? { words: copy(b.words) } : {}), note: {...b.note, svg: set.noteArrow}, sample: {...copy(b.sample), ...copy(set.sample), rule: set.bannerRule}, items: copy(b.items), closingExamples: copy(b.closingExamples) };
  });
  for (const g of groups) if (!boards.some((b) => b.group === g)) fail(`groups.${g}`, 'empty group');
  return { layout: 'board', person: selection.person, intro: copy(selection.intro), groups: copy(selection.groups), footnote: selection.footnote, boards };
}
function args(argv) {
  const flags = ['--selection','--output','--library'];
  for (const arg of argv) if (arg.startsWith('-') && ![...flags,'--help','-h'].includes(arg)) fail(arg,'unknown option');
  if (!argv.length || argv.includes('--help') || argv.includes('-h') || (argv.length === 1 && argv[0] === 'help')) return null;
  const values = {};
  for (let i=0; i<argv.length; i++) {
    const flag = argv[i]; if (!flags.includes(flag)) fail(flag,'unexpected argument');
    if (has(values,flag)) fail(flag,'duplicate option');
    const value=argv[++i]; if (!value || value.startsWith('-') || !isAbsolute(value)) fail(flag,'supply an absolute path'); values[flag]=value;
  }
  for (const flag of ['--selection','--output']) if (!values[flag]) fail(flag,'required option');
  return values;
}
export function run(argv) {
  const options = args(argv); if (!options) return HELP;
  const selectionPath = source(options['--selection'],'--selection');
  const libraryPath = source(options['--library'] || LIBRARY,'--library');
  const output = screened(options['--output'],'--output',true);
  if (!/\.json$/i.test(output)) fail('--output','use a .json filename');
  try { lstatSync(output); fail('--output','file already exists; choose a new path'); } catch(e) { if(e.code !== 'ENOENT') throw e; }
  try { if (!statSync(dirname(output)).isDirectory()) fail('--output','parent is not a directory; choose a work directory'); }
  catch { fail('--output','create a readable output parent directory first'); }
  let selection, library;
  try { selection=JSON.parse(readFileSync(selectionPath,'utf8')); } catch { fail('--selection','invalid or unreadable JSON'); }
  try { library=JSON.parse(readFileSync(libraryPath,'utf8')); } catch { fail('--library','invalid or unreadable JSON'); }
  const spec=assemble(selection,library,{partsDir:dirname(libraryPath),selectionDir:dirname(selectionPath)});
  const bytes=JSON.stringify(spec,null,2)+'\n';
  try { writeFileSync(output,bytes,{flag:'wx'}); }
  catch { fail('--output','cannot create the file; choose a new path in a writable work directory'); }
  return {output,boards:spec.boards.length,bytes:Buffer.byteLength(bytes),positions:selection.boards.map(b => ({number:b.number,parts:partPositions(library,b)}))};
}
export function main(argv=process.argv.slice(2)) {
  try { const result=run(argv); process.stdout.write((typeof result==='string'?result:JSON.stringify(result))+'\n'); }
  catch(error) { process.stderr.write(JSON.stringify({error:error.message})+'\n'); process.exitCode=1; }
}
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main();
