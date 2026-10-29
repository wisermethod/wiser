#!/usr/bin/env node
// Built-ins only; standards/script-contract.md governs the command.
import { readFileSync, writeFileSync, realpathSync, lstatSync, statSync } from 'node:fs';
import { dirname, basename, extname, resolve, relative, isAbsolute, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkPack, INSTALL } from './fonts.mjs';
import { assembleCore, AXES, partPositions, assemblyHelpers } from './assemble-core.mjs';
export { AXES, partPositions };
const { fail, copy, has, object, text, num } = assemblyHelpers;

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL = realpathSync(resolve(HERE, '..'));
export const LIBRARY = resolve(SKILL, 'parts/parts.json');
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

export function assemble(selection, library, { partsDir = dirname(LIBRARY), selectionDir = process.cwd() } = {}) {
  return assembleCore(selection, library, {
    resolveFont: (face, at) => font(face, partsDir, at, library),
    resolveSuppliedFont: (choice, base, sample, at) => suppliedFont(choice, base, selectionDir, sample, at),
    resolveMark: (file, at) => source(resolve(selectionDir, file), at)
  });
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
