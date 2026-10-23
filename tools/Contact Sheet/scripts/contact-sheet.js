#!/usr/bin/env node
// Node built-ins only. See system/templates/Script Contract.md.
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, extname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { absolutePath, fail, outputFile, sourceFile } from './paths.js';
import { checkSvg } from './svg.js';
import { validateBrandBoards, brandBoardsHtml } from './brand-boards.js';

export const MAX_BYTES = 40_000_000;
const HELP = `Contact Sheet: write one self-contained HTML page. The person chooses.

Usage:
  node scripts/contact-sheet.js help
  node scripts/contact-sheet.js build --spec <spec.json> --output <page.html>
  node scripts/contact-sheet.js build --help

Options:
  --spec <file>     Required JSON spec. Absolute path.
  --output <file>   Required new .html file. Absolute path, outside this tool.
  --help, -h       Print usage without reading any spec or asset.

Spec paths resolve against the spec's own directory.
pick: title, items (image, text, palette, type), optional intro and closing;
at most two recommended items, each with reason.
board: person, two intro lines, ordered groups, footnote, whole brand boards;
light/dark roles, licensed faces, SVG graphic language and contrast checks.
See TOOL.md for every field, palette sample roles, and local font licences.

Writes only --output; never overwrites or creates directories. No PNG rendering,
image editing, model, network, or primitive calls. No configuration or installs:
--env and --install are unknown options. Embedded page limit: 40 MB (40000000 bytes).
Success: one JSON object on stdout, exit 0, with output, itemCount, bytes, embedded.
Failure: one JSON object with error on stderr, stdout empty, exit 1.
Resize oversized images with tools/image/ first.`;

function args(argv) {
  for (const token of argv) {
    if (token.startsWith('-') && !['--spec', '--output', '--help', '-h'].includes(token)) {
      fail(`Unknown option "${token}". Run "node scripts/contact-sheet.js help".`);
    }
  }
  const command = argv[0];
  const helpCommand = !command || ['help', '--help', '-h'].includes(command);
  if (!helpCommand && command !== 'build') fail(`Unknown command "${command}". Run "node scripts/contact-sheet.js help".`);
  const values = {};
  let help = helpCommand;
  for (let i = 1; i < argv.length; i += 1) {
    const token = argv[i];
    if (['--help', '-h', 'help'].includes(token)) { help = true; continue; }
    if (!['--spec', '--output'].includes(token) || helpCommand) {
      fail(`${token.startsWith('-') ? 'Unknown option' : 'Unexpected argument'} "${token}". Run "node scripts/contact-sheet.js help".`);
    }
    if (Object.hasOwn(values, token)) fail(`${token} was given more than once. Pass it once; see "node scripts/contact-sheet.js help".`);
    const value = argv[i + 1];
    if (!value || value.startsWith('-')) fail(`${token} needs a value. Run "node scripts/contact-sheet.js help".`);
    values[token] = value;
    i += 1;
  }
  if (help) return null;
  for (const flag of ['--spec', '--output']) {
    if (!values[flag]) fail(`${flag} is required. Run "node scripts/contact-sheet.js help".`);
  }
  return values;
}

function object(value, keys, where) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${where} must be an object. See TOOL.md for the spec format.`);
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) fail(`${where} has unknown field "${key}". Remove it or use a documented field in TOOL.md.`);
  }
}

function text(value, where, singleLine = false) {
  if (typeof value !== 'string' || !value.trim() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
    || (singleLine && /[\r\n\u2028\u2029]/.test(value))) {
    fail(`${where} must be non-empty ${singleLine ? 'single-line ' : ''}text. Correct the spec.`);
  }
}

function optionalText(obj, key, where, singleLine = false) {
  if (Object.hasOwn(obj, key)) text(obj[key], `${where}.${key}`, singleLine);
}

function list(value, where) {
  if (!Array.isArray(value) || value.length === 0) fail(`${where} must be a non-empty array. Correct the spec.`);
}

function boolean(obj, key, where) {
  if (Object.hasOwn(obj, key) && typeof obj[key] !== 'boolean') fail(`${where}.${key} must be true or false. Correct the spec.`);
}

function color(value, where) {
  if (typeof value !== 'string') fail(`${where} must be a colour string. Use #RGB, #RRGGBB, or oklch(L C H).`);
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) return;
  const num = '[+-]?(?:[0-9]+(?:\\.[0-9]+)?|\\.[0-9]+)';
  const match = new RegExp(`^oklch\\((${num})(%)? +(${num}) +(${num})(?:deg)?\\)$`).exec(value);
  if (match && [match[1], match[3], match[4]].every((part) => Number.isFinite(Number(part)))
    && Number(match[1]) >= 0 && Number(match[1]) <= (match[2] ? 100 : 1) && Number(match[3]) >= 0) return;
  fail(`${where} is not a supported colour. Use #RGB, #RRGGBB, or oklch(L C H), with L from 0 to 1 or 0% to 100% and non-negative C.`);
}

function colors(value, where) {
  list(value, where);
  const names = new Set();
  let total = 0;
  value.forEach((entry, i) => {
    const at = `${where}[${i}]`;
    object(entry, ['name', 'value', 'role', 'share'], at);
    text(entry.name, `${at}.name`);
    text(entry.role, `${at}.role`);
    color(entry.value, `${at}.value`);
    if (names.has(entry.name)) fail(`${where} repeats a colour name. Use unique names so sample roles are unambiguous.`);
    names.add(entry.name);
    if (typeof entry.share !== 'number' || !Number.isFinite(entry.share) || entry.share <= 0 || entry.share > 100) {
      fail(`${at}.share must be a number above 0 and at most 100. Set the percentage of the design.`);
    }
    total += entry.share;
  });
  if (Math.abs(total - 100) > 0.01) fail(`${where} shares must total 100 percent. Correct the proportions.`);
}

function palette(value, where, withKind = false) {
  object(value, [...(withKind ? ['kind', 'label', 'note', 'recommended', 'reason', 'hero'] : []), 'colors', 'sample'], where);
  colors(value.colors, `${where}.colors`);
  const roles = ['background', 'text', 'accent', 'onAccent'];
  object(value.sample, roles, `${where}.sample`);
  for (const role of roles) {
    text(value.sample[role], `${where}.sample.${role}`);
    if (!value.colors.some((c) => c.name === value.sample[role])) {
      fail(`${where}.sample.${role} must name a colour in colors. Set every sample role explicitly.`);
    }
  }
}

const IMAGES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml' };
const FONTS = { '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf' };
const FONT_FORMATS = { '.woff2': 'woff2', '.woff': 'woff', '.ttf': 'truetype', '.otf': 'opentype' };

function registry(base) {
  const entries = [];
  const byPath = new Map();
  let embeddedSize = 0;
  function add(value, kind, where) {
    text(value, where, true);
    if (!isAbsolute(value) && /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) fail(`${where} must name a local file. Download nothing; supply a file path.`);
    const info = sourceFile(resolve(base, value));
    const extension = extname(info.path).toLowerCase();
    const mime = (kind === 'image' ? IMAGES : FONTS)[extension];
    if (!mime) fail(`${where} has an unsupported ${kind} extension. Use one listed in TOOL.md.`);
    let entry = byPath.get(info.path);
    if (!entry) {
      entry = { ...info, extension, mime, kind, id: entries.length + 1 };
      entries.push(entry);
      byPath.set(info.path, entry);
      embeddedSize += kind === 'font' ? 4 * Math.ceil(info.bytes / 3) : 0;
    }
    if (kind === 'image') embeddedSize += 4 * Math.ceil(info.bytes / 3);
    if (embeddedSize > MAX_BYTES) oversized();
    return entry;
  }
  return { add, entries };
}

function oversized() {
  fail('The self-contained page would exceed 40 MB (40000000 bytes). Use tools/image/ for resizing first, or split the spec. Nothing was written.');
}

function typeItem(value, where, assets, withKind = false) {
  object(value, [...(withKind ? ['kind', 'label', 'note', 'recommended', 'reason', 'hero'] : []), 'heading', 'body', 'sentence', 'palette'], where);
  text(value.sentence, `${where}.sentence`);
  const result = { ...value };
  for (const role of ['heading', 'body']) {
    const face = value[role];
    object(face, ['family', 'file', 'licence'], `${where}.${role}`);
    text(face.family, `${where}.${role}.family`);
    text(face.licence, `${where}.${role}.licence`);
    result[role] = { ...face, asset: assets.add(face.file, 'font', `${where}.${role}.file`) };
  }
  if (Object.hasOwn(value, 'palette')) palette(value.palette, `${where}.palette`);
  return result;
}

function validate(spec, assets) {
  object(spec, spec?.layout === 'board' ? ['layout', 'title', 'direction', 'coreWords', 'items', 'swatches', 'typeSamples'] : ['layout', 'title', 'intro', 'items', 'closing'], 'spec');
  if (!['pick', 'board'].includes(spec.layout)) fail('spec.layout must be pick or board. Correct the spec.');
  text(spec.title, 'spec.title');
  list(spec.items, 'spec.items');
  const board = spec.layout === 'board';
  if (board) {
    text(spec.direction, 'spec.direction', true);
    list(spec.coreWords, 'spec.coreWords');
    spec.coreWords.forEach((word, i) => text(word, `spec.coreWords[${i}]`, true));
  } else {
    optionalText(spec, 'intro', 'spec', true);
    optionalText(spec, 'closing', 'spec', true);
  }
  const common = ['kind', 'label', 'note', ...(board ? ['hero'] : ['recommended', 'reason'])];
  let recommended = 0;
  let heroes = 0;
  const items = spec.items.map((item, i) => {
    const where = `spec.items[${i}]`;
    const kindKeys = { image: ['file', 'alt', 'source'], text: ['text'], palette: ['colors', 'sample'], type: ['heading', 'body', 'sentence', 'palette'] };
    object(item, [...common, ...(Object.hasOwn(kindKeys, item?.kind) ? kindKeys[item.kind] : [])], where);
    if (!Object.hasOwn(kindKeys, item.kind)) fail(`${where}.kind must be image, text, palette, or type. Correct the spec.`);
    text(item.label, `${where}.label`);
    if (board) { text(item.note, `${where}.note`); boolean(item, 'hero', where); heroes += item.hero === true ? 1 : 0; }
    else {
      optionalText(item, 'note', where);
      boolean(item, 'recommended', where);
      if (item.recommended) { text(item.reason, `${where}.reason`, true); recommended += 1; }
      else if (Object.hasOwn(item, 'reason')) fail(`${where}.reason needs recommended: true. Remove the reason or mark the item recommended.`);
    }
    if (recommended > 2) fail('At most two items may be recommended so the page leaves the choice open. Remove the extra recommendation marks.');
    if (item.kind === 'image') {
      text(item.alt, `${where}.alt`);
      optionalText(item, 'source', where);
      return { ...item, asset: assets.add(item.file, 'image', `${where}.file`), number: i + 1 };
    }
    if (item.kind === 'text') text(item.text, `${where}.text`);
    if (item.kind === 'palette') palette(item, where, true);
    const result = item.kind === 'type' ? typeItem(item, where, assets, true) : item;
    return { ...result, number: i + 1 };
  });
  if (board && (heroes < 1 || heroes > 2)) fail('A board needs one or two hero items. Mark one or two items hero: true.');
  if (Object.hasOwn(spec, 'swatches')) colors(spec.swatches, 'spec.swatches');
  let typeSamples;
  if (Object.hasOwn(spec, 'typeSamples')) {
    list(spec.typeSamples, 'spec.typeSamples');
    typeSamples = spec.typeSamples.map((sample, i) => typeItem(sample, `spec.typeSamples[${i}]`, assets));
  }
  return { ...spec, items, typeSamples };
}

// Encoding punctuation also keeps a source URL visible as text without putting
// a literal external address (or a CSS token such as @import) in the HTML.
export function escapeHtml(value) {
  const replacements = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', ':': '&#58;', '@': '&#64;', '(': '&#40;' };
  return value.replace(/[&<>"':@(]/g, (c) => replacements[c]);
}

const CSS = `*{box-sizing:border-box}
html{color-scheme:light;background:#eee;color:#222;font:16px/1.5 system-ui,sans-serif}
body{margin:0}main{max-width:1400px;margin:auto;padding:40px 32px}
h1,h2,h3,p,figure{margin:0}h1{font-size:clamp(1.8rem,4vw,3rem);line-height:1.15}
h2{font-size:1.15rem;line-height:1.35}header{max-width:75ch;margin-bottom:28px}
header p{margin-top:14px}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:22px}
.card{min-width:0;overflow-wrap:anywhere;word-break:normal;background:#fff;border:1px solid #ccc;padding:18px;display:flex;flex-direction:column;gap:14px}
.card h2,.card p,.card small{overflow-wrap:anywhere;min-width:0}.number,.meta,.source{color:#555;font-size:.85rem}
.visual{min-width:0;min-height:240px}.image{display:flex;align-items:center;justify-content:center;background:#f5f5f5}
.image img{display:block;width:100%;height:240px;object-fit:contain}.passage{white-space:pre-wrap;font-size:1.25rem;padding:22px;background:#f5f5f5}
.recommendation{font-size:.9rem;border-top:1px solid #ddd;padding-top:10px}.recommendation strong{display:block}
.swatch-strip{display:flex;width:100%;height:56px;border:1px solid #ddd}.swatch{min-width:0}
.color-list{list-style:none;padding:0;margin:10px 0;display:grid;gap:4px;font-size:.8rem}
.sample{padding:22px;overflow-wrap:anywhere}.sample h3{font-size:1.6rem;line-height:1.2;margin-bottom:14px}
.sample p{margin-bottom:16px}.button-sample{display:inline-block;padding:9px 16px;border-radius:3px}
.type-sample small{display:block;font-size:.8rem;line-height:1.5}.type-meta{font-size:.8rem;margin-top:12px}
.core-words{display:flex;flex-wrap:wrap;gap:8px;list-style:none;padding:0;margin:18px 0 0}
.core-words li{border:1px solid #bbb;padding:4px 10px}.heroes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px;margin-bottom:22px}
.heroes.single{grid-template-columns:minmax(0,1fr)}.hero .image img{height:380px}.hero .visual{min-height:320px}
.board-grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.board-grid .card{padding:14px}
.board-grid .visual{min-height:180px}.board-grid .image img{height:180px}.board-extras{margin-top:28px}
.board-extras>h2{margin-bottom:12px}.closing{margin-top:28px}body,header,.closing,.type-meta,.color-list{overflow-wrap:anywhere}
@media(max-width:1000px){.grid,.board-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:560px){main{padding:24px 16px}.grid,.board-grid,.heroes{grid-template-columns:minmax(0,1fr)}.hero .image img{height:280px}}
`;

function strip(entries) {
  return `<div class="swatch-strip" aria-label="Colour proportions">${entries.map((c) => `<span class="swatch" style="background:${c.value};flex:${c.share}" aria-label="${escapeHtml(`${c.name}: ${c.share}%`)}"></span>`).join('')}</div>
<ul class="color-list">${entries.map((c) => `<li>${escapeHtml(`${c.name} / ${c.value} / ${c.role} / ${c.share}%`)}</li>`).join('')}</ul>`;
}

function sampleStyle(paletteValue) {
  if (!paletteValue) return 'background:#f5f5f5;color:#222';
  const get = (role) => paletteValue.colors.find((c) => c.name === paletteValue.sample[role]).value;
  return `background:${get('background')};color:${get('text')};--accent:${get('accent')};--on-accent:${get('onAccent')}`;
}

function typeVisual(item) {
  const family = (role) => `cs-font-${item[role].asset.id}`;
  return `<div class="sample type-sample" style="${sampleStyle(item.palette)}">
<h3 style="font-family:${family('heading')}">${escapeHtml(item.sentence)}</h3>
<p style="font-family:${family('body')}">${escapeHtml(item.sentence)}</p>
<small style="font-family:${family('body')}">${escapeHtml(item.sentence)}</small></div>
<div class="type-meta">${['heading', 'body'].map((role) => `<p>${role === 'heading' ? 'Heading' : 'Body'}: ${escapeHtml(item[role].family)} / Licence: ${escapeHtml(item[role].licence)}</p>`).join('')}</div>
${item.palette ? strip(item.palette.colors) : ''}`;
}

function itemVisual(item) {
  if (item.kind === 'image') return `<figure class="visual image"><img src="${item.asset.uri}" alt="${escapeHtml(item.alt)}"></figure>${item.source ? `<p class="source">Source: ${escapeHtml(item.source)}</p>` : ''}`;
  if (item.kind === 'text') return `<div class="visual passage">${escapeHtml(item.text)}</div>`;
  if (item.kind === 'type') return `<div class="visual">${typeVisual(item)}</div>`;
  return `<div class="visual">${strip(item.colors)}<div class="sample" style="${sampleStyle(item)}"><h3>A heading in use</h3><p>A line of body text in this palette.</p><span class="button-sample" style="background:var(--accent);color:var(--on-accent)">An action</span></div></div>`;
}

function card(item, board) {
  return `<article id="item-${item.number}" class="card${board && item.hero ? ' hero' : ''}" aria-labelledby="label-${item.number}">
${itemVisual(item)}
<div><span class="number">${item.number}</span><h2 id="label-${item.number}">${escapeHtml(item.label)}</h2></div>
${item.note ? `<p class="note">${escapeHtml(item.note)}</p>` : ''}
${item.recommended ? `<p class="recommendation"><strong>Recommended</strong>${escapeHtml(item.reason)}</p>` : ''}</article>`;
}

function html(spec, assets) {
  const board = spec.layout === 'board';
  const faces = assets.filter((a) => a.kind === 'font').map((a) => `@font-face{font-family:cs-font-${a.id};src:url("${a.uri}") format("${FONT_FORMATS[a.extension]}");font-weight:400;font-style:normal;font-display:block}`).join('\n');
  const heroes = spec.items.filter((item) => item.hero);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>${escapeHtml(spec.title)}</title><style>${CSS}${faces}</style></head>
<body><main class="${spec.layout}"><header><h1>${escapeHtml(spec.title)}</h1>
${board ? `<p>${escapeHtml(spec.direction)}</p><ul class="core-words">${spec.coreWords.map((word) => `<li>${escapeHtml(word)}</li>`).join('')}</ul>` : spec.intro ? `<p>${escapeHtml(spec.intro)}</p>` : ''}</header>
${board ? `<div class="heroes${heroes.length === 1 ? ' single' : ''}">${heroes.map((item) => card(item, true)).join('\n')}</div>` : ''}
<div class="grid${board ? ' board-grid' : ''}">${spec.items.filter((item) => !board || !item.hero).map((item) => card(item, board)).join('\n')}</div>
${spec.swatches ? `<section class="board-extras"><h2>Swatches</h2>${strip(spec.swatches)}</section>` : ''}
${spec.typeSamples ? `<section class="board-extras"><h2>Type samples</h2><div class="grid">${spec.typeSamples.map((sample) => `<div class="card">${typeVisual(sample)}</div>`).join('\n')}</div></section>` : ''}
${spec.closing ? `<p class="closing">${escapeHtml(spec.closing)}</p>` : ''}
</main></body></html>
`;
}

function parseJson(buffer) {
  let value;
  let json;
  try { json = new TextDecoder('utf-8', { fatal: true }).decode(buffer); value = JSON.parse(json); } catch {
    fail('--spec is not valid UTF-8 JSON. Correct it using the format in TOOL.md.');
  }
  // JSON.parse would silently keep the last duplicate object field.
  const stack = [];
  // Scan strings iteratively: a regex repeating an alternative over a large
  // text item can exhaust the engine's stack before the size check runs.
  for (let i = 0; i < json.length; i += 1) {
    const token = json[i];
    if (token === '{') stack.push(new Set());
    else if (token === '[') stack.push(null);
    else if (token === '}' || token === ']') stack.pop();
    else if (token === '"') {
      const start = i++;
      while (i < json.length && json[i] !== '"') i += json[i] === '\\' ? 2 : 1;
      let next = i + 1;
      while (next < json.length && /\s/.test(json[next])) next += 1;
      if (json[next] === ':') {
        const key = JSON.parse(json.slice(start, i + 1));
        const keys = stack[stack.length - 1];
        if (keys.has(key)) fail(`--spec repeats field "${key}". Keep each object field once.`);
        keys.add(key);
      }
    }
  }
  return value;
}

function readAsset(entry) {
  let buffer;
  try { buffer = readFileSync(entry.path); } catch { fail(`Cannot read ${entry.path}. Supply a readable local asset.`); }
  if (buffer.length !== entry.bytes) fail(`Asset changed during the build: ${entry.path}. Run again with stable input files.`);
  const sig = buffer.subarray(0, 12);
  const valid = {
    '.png': () => sig.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    '.jpg': () => sig[0] === 255 && sig[1] === 216 && sig[2] === 255,
    '.jpeg': () => sig[0] === 255 && sig[1] === 216 && sig[2] === 255,
    '.gif': () => ['GIF87a', 'GIF89a'].includes(sig.subarray(0, 6).toString()),
    '.webp': () => sig.subarray(0, 4).toString() === 'RIFF' && sig.subarray(8, 12).toString() === 'WEBP',
    '.woff': () => sig.subarray(0, 4).toString() === 'wOFF',
    '.woff2': () => sig.subarray(0, 4).toString() === 'wOF2',
    '.ttf': () => sig.readUInt32BE(0) === 0x00010000 || sig.subarray(0, 4).toString() === 'true',
    '.otf': () => sig.subarray(0, 4).toString() === 'OTTO'
  };
  if (entry.extension === '.svg') checkSvg(buffer);
  else if (sig.length < 4 || !valid[entry.extension]()) fail(`Asset signature does not match its extension: ${entry.path}. Supply the correct file format.`);
  entry.uri = `data:${entry.mime};base64,${buffer.toString('base64')}`;
}

export function runContactSheet(argv) {
  const options = args(argv);
  if (!options) return HELP;
  const specPath = sourceFile(absolutePath('--spec', options['--spec'])).path;
  const output = outputFile(options['--output']);
  let buffer;
  try { buffer = readFileSync(specPath); } catch { fail('--spec could not be read. Supply a readable JSON file.'); }
  const assets = registry(dirname(specPath));
  const input = parseJson(buffer);
  const board = input?.layout === 'board';
  const spec = board ? validateBrandBoards(input, assets, readAsset) : validate(input, assets);
  if (!board) assets.entries.forEach(readAsset);
  const page = board ? brandBoardsHtml(spec) : html(spec, assets.entries);
  const bytes = Buffer.byteLength(page);
  if (bytes > MAX_BYTES) oversized();
  try { writeFileSync(output, page, { encoding: 'utf8', flag: 'wx' }); } catch {
    fail(`Cannot create --output at ${output}. Choose a new path in a writable work directory.`);
  }
  return { output, itemCount: board ? spec.boards.length : spec.items.length, ...(board ? { boards: spec.boards.map(({ number, name, checks }) => ({ number, name, checks })) } : {}), bytes, embedded: assets.entries.map(({ path, bytes: size }) => ({ path, bytes: size })) };
}

export function main(argv = process.argv.slice(2)) {
  try {
    const result = runContactSheet(argv);
    process.stdout.write(`${typeof result === 'string' ? result : JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ error: error instanceof Error ? error.message : 'Contact Sheet failed. Check the spec and output path.' })}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main();
