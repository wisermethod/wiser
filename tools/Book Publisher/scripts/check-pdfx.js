// Structural checks for Ghostscript's classic PDF output, not PDF/X certification.
// Parse objects via the cross-reference table: compressed pixels, strings and
// comments must never masquerade as a color name or a font descriptor.
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

class Name { constructor(value) { this.value = value; } }
class Ref { constructor(id, generation) { this.key = `${id} ${generation}`; } }
const named = (value, name) => value instanceof Name && value.value === name;

function parser(text, start = 0) {
  let pos = start;
  function space() {
    for (;;) {
      while (/[\0\t\n\f\r ]/.test(text[pos] ?? '\uffff')) pos += 1;
      if (text[pos] !== '%') return;
      while (pos < text.length && !/[\r\n]/.test(text[pos])) pos += 1;
    }
  }
  function word() {
    const begin = pos;
    while (pos < text.length && !/[\0\t\n\f\r ()<>\[\]{}/%]/.test(text[pos])) pos += 1;
    if (begin === pos) throw new Error(`unsupported PDF token at byte ${pos}`);
    return text.slice(begin, pos);
  }
  function value() {
    space();
    if (pos >= text.length) throw new Error('unexpected end of PDF object');
    if (text.startsWith('<<', pos)) {
      pos += 2;
      const dict = new Map();
      for (;;) {
        space();
        if (text.startsWith('>>', pos)) { pos += 2; return dict; }
        const key = value();
        if (!(key instanceof Name)) throw new Error('invalid PDF dictionary key');
        dict.set(key.value, value());
      }
    }
    if (text[pos] === '[') {
      pos += 1;
      const array = [];
      for (;;) {
        space();
        if (text[pos] === ']') { pos += 1; return array; }
        array.push(value());
      }
    }
    if (text[pos] === '/') {
      pos += 1;
      return new Name(word().replace(/#([\da-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16))));
    }
    if (text[pos] === '(') {
      let depth = 1;
      pos += 1;
      while (pos < text.length && depth) {
        const char = text[pos++];
        if (char === '\\') pos += 1;
        else if (char === '(') depth += 1;
        else if (char === ')') depth -= 1;
      }
      if (depth) throw new Error('unterminated PDF string');
      return null; // String contents are data, never names or operators.
    }
    if (text[pos] === '<') {
      const end = text.indexOf('>', pos + 1);
      if (end < 0) throw new Error('unterminated PDF hex string');
      pos = end + 1;
      return null;
    }
    const token = word();
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(token)) return token;
    const number = Number(token);
    const after = pos;
    if (Number.isInteger(number)) {
      space();
      const reference = /^(\d+)\s+R\b/.exec(text.slice(pos));
      if (reference) { pos += reference[0].length; return new Ref(number, Number(reference[1])); }
      pos = after;
    }
    return number;
  }
  return { value, space, word, get pos() { return pos; } };
}

function readObjects(bytes) {
  const text = bytes.toString('latin1');
  const end = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(text);
  if (!end) throw new Error('PDF has no complete cross-reference trailer');
  const entries = new Map();
  const visited = new Set();
  let offset = Number(end[1]);
  let root;
  while (offset !== undefined) {
    if (visited.has(offset)) throw new Error('cyclic PDF cross-reference chain');
    visited.add(offset);
    const p = parser(text, offset);
    if (p.word() !== 'xref') throw new Error('structural check requires classic PDF cross-references; rebuild as PDF 1.3');
    for (;;) {
      p.space();
      if (text.startsWith('trailer', p.pos)) { p.word(); break; }
      const first = p.value();
      const count = p.value();
      if (!Number.isInteger(first) || !Number.isInteger(count) || first < 0 || count < 0 || count > bytes.length) throw new Error('invalid PDF cross-reference section');
      for (let i = 0; i < count; i += 1) {
        const location = p.value();
        const generation = p.value();
        const state = p.value();
        // Newest entry wins, including a deletion in an incremental update.
        if (!entries.has(first + i)) entries.set(first + i, { location, generation, state });
      }
    }
    const trailer = p.value();
    if (!(trailer instanceof Map)) throw new Error('invalid PDF trailer');
    if (trailer.has('Encrypt')) throw new Error('encrypted PDF cannot be structurally checked');
    root ??= trailer.get('Root');
    offset = trailer.get('Prev');
  }
  const objects = new Map();
  for (const [id, entry] of entries) {
    if (entry.state !== 'n') continue;
    const p = parser(text, entry.location);
    if (p.value() !== id || p.value() !== entry.generation || p.value() !== 'obj') throw new Error('invalid PDF object offset');
    const value = p.value();
    p.space();
    objects.set(`${id} ${entry.generation}`, { value, streamStart: text.startsWith('stream', p.pos)
      ? p.pos + /^stream(?:\r\n|\n|\r)/.exec(text.slice(p.pos))?.[0].length : undefined });
  }
  function deref(value) {
    const seen = new Set();
    while (value instanceof Ref) {
      if (seen.has(value.key) || !objects.has(value.key)) throw new Error('broken or cyclic PDF reference');
      seen.add(value.key);
      value = objects.get(value.key).value;
    }
    return value;
  }
  function stream(ref) {
    const obj = objects.get(ref?.key);
    if (!obj || !Number.isInteger(obj.streamStart)) throw new Error('missing PDF stream');
    const length = deref(obj.value.get('Length'));
    if (!Number.isInteger(length) || length <= 0 || obj.streamStart + length > bytes.length) throw new Error('invalid PDF stream length');
    let data = bytes.subarray(obj.streamStart, obj.streamStart + length);
    const filters = deref(obj.value.get('Filter'));
    for (const filter of Array.isArray(filters) ? filters : filters ? [filters] : []) {
      if (!named(filter, 'FlateDecode')) throw new Error('unsupported PDF content filter; rebuild with Ghostscript');
      data = inflateSync(data);
    }
    return data;
  }
  return { objects, deref, stream, root };
}

export function checkPdfX(path, { bleed = false, trim } = {}) {
  if (!Number.isFinite(trim?.width) || !Number.isFinite(trim?.height) || trim.width <= 0 || trim.height <= 0) {
    throw new Error('PDF/X page boxes: expected configured trim.width and trim.height in inches');
  }
  const bytes = readFileSync(path);
  const headerVersion = /^%PDF-(\d+\.\d+)/.exec(bytes.toString('latin1', 0, 16))?.[1] ?? null;
  const { objects, deref, stream, root } = readObjects(bytes);
  const catalog = deref(root);
  if (!(catalog instanceof Map) || !named(catalog.get('Type'), 'Catalog')) throw new Error('PDF catalog missing');
  const override = catalog.get('Version');
  const version = override instanceof Name && Number(override.value) > Number(headerVersion) ? override.value : headerVersion;
  const intents = deref(catalog.get('OutputIntents'));
  const outputIntentProfile = Array.isArray(intents) && intents.some((intent) => {
    const dict = deref(intent);
    const profile = dict instanceof Map && named(dict.get('Type'), 'OutputIntent') && dict.get('DestOutputProfile');
    if (!(profile instanceof Ref)) return false;
    const obj = objects.get(profile.key);
    return obj?.value instanceof Map && Number.isInteger(obj.streamStart) && deref(obj.value.get('Length')) > 0;
  });
  const names = new Set();
  const contentStreams = new Set();
  const fonts = [];
  function inspect(value) {
    if (value instanceof Name) names.add(value.value);
    else if (Array.isArray(value)) value.forEach(inspect);
    else if (value instanceof Map) for (const child of value.values()) inspect(child);
  }
  function addContent(value) {
    if (value instanceof Ref && Number.isInteger(objects.get(value.key)?.streamStart)) contentStreams.add(value.key);
    else if (value instanceof Ref) addContent(deref(value));
    else if (Array.isArray(value)) value.forEach(addContent);
  }
  for (const [key, obj] of objects) {
    inspect(obj.value);
    const dict = obj.value;
    if (!(dict instanceof Map)) continue;
    if (named(dict.get('Type'), 'Font') && !named(dict.get('Subtype'), 'Type0')) fonts.push(dict);
    if (named(dict.get('Type'), 'Page')) addContent(dict.get('Contents'));
    if (named(dict.get('Subtype'), 'Form') || dict.get('PatternType') === 1) contentStreams.add(key);
    if (named(dict.get('Subtype'), 'Type3')) {
      const chars = deref(dict.get('CharProcs'));
      if (chars instanceof Map) for (const ref of chars.values()) addContent(ref);
    }
  }
  let rgbOperators = false;
  for (const key of contentStreams) {
    const ref = Object.assign(Object.create(Ref.prototype), { key });
    const content = stream(ref).toString('latin1');
    const p = parser(content);
    while (p.pos < content.length) {
      p.space();
      if (p.pos === content.length) break;
      const token = p.value();
      // Inline image bytes need a separate binary parser; refuse instead of
      // reporting a pass over content that was not inspected.
      if (token === 'BI') throw new Error('inline images cannot be structurally checked; rebuild with Ghostscript image XObjects');
      inspect(token);
      if (token === 'rg' || token === 'RG') rgbOperators = true;
    }
  }
  const rgb = names.has('DeviceRGB') || names.has('RGB') || names.has('CalRGB') || rgbOperators;
  // DeviceGray is permitted for monochrome images and masks, as in PDF/X-1a.
  const otherColor = ['CalRGB', 'Lab', 'ICCBased', 'Separation', 'DeviceN'].filter((name) => names.has(name));
  const cmykOnly = !rgb && otherColor.length === 0;
  const embedded = fonts.filter((font) => {
    if (named(font.get('Subtype'), 'Type3')) return deref(font.get('CharProcs')) instanceof Map;
    const descriptor = deref(font.get('FontDescriptor'));
    return descriptor instanceof Map && ['FontFile', 'FontFile2', 'FontFile3'].some((key) => {
      const ref = descriptor.get(key);
      const obj = ref instanceof Ref && objects.get(ref.key);
      return Number.isInteger(obj?.streamStart) && deref(obj.value.get('Length')) > 0;
    });
  }).length;
  const expectedTrim = trim;
  const seenPages = new Set();
  const boxSets = new Map();
  let physical = 0;
  const boxErrors = [];
  const close = (a, b) => Math.abs(a - b) <= 0.02;
  const validBox = (box) => Array.isArray(box) && box.length === 4 && box.every(Number.isFinite) && box[2] > box[0] && box[3] > box[1];
  const inside = (a, b) => a[0] >= b[0] - 0.02 && a[1] >= b[1] - 0.02 && a[2] <= b[2] + 0.02 && a[3] <= b[3] + 0.02;
  function pages(value, inheritedMedia) {
    if (!(value instanceof Ref) || seenPages.has(value.key)) throw new Error('invalid PDF page tree');
    seenPages.add(value.key);
    const dict = deref(value);
    if (!(dict instanceof Map)) throw new Error('missing PDF page dictionary');
    const media = deref(dict.get('MediaBox')) ?? inheritedMedia;
    if (named(dict.get('Type'), 'Page')) {
      // TrimBox and BleedBox are not inheritable page-tree attributes.
      const trim = deref(dict.get('TrimBox'));
      const bleedBox = deref(dict.get('BleedBox'));
      physical += 1;
      const boxes = { media, bleed: bleedBox, trim };
      const key = JSON.stringify(boxes);
      if (!boxSets.has(key)) boxSets.set(key, { ...boxes, pages: 0 });
      boxSets.get(key).pages += 1;
      if (![media, bleedBox, trim].every(validBox) || !inside(trim, bleedBox) || !inside(bleedBox, media)) {
        boxErrors.push(`page ${physical}: missing, invalid or non-nested TrimBox/BleedBox/MediaBox`);
      } else {
        const offset = bleed ? 9 : 0;
        const width = expectedTrim.width * 72;
        const height = expectedTrim.height * 72;
        const expectedMedia = [0, 0, width + offset, height + 2 * offset];
        const left = physical % 2 ? 0 : offset;
        const expectedBox = [left, offset, left + width, offset + height];
        const equal = (box, expected) => box.every((n, i) => close(n, expected[i]));
        if (!equal(media, expectedMedia) || !equal(bleedBox, expectedMedia) || !equal(trim, expectedBox)) {
          boxErrors.push(`page ${physical}: expected MediaBox = BleedBox [${expectedMedia.join(' ')}], TrimBox [${expectedBox.join(' ')}] for configured trim and bleed=${bleed}`);
        }
      }
      return 1;
    }
    const kids = deref(dict.get('Kids'));
    if (!named(dict.get('Type'), 'Pages') || !Array.isArray(kids)) throw new Error('invalid PDF page tree node');
    return kids.reduce((total, kid) => total + pages(kid, media), 0);
  }
  const pageCount = pages(catalog.get('Pages'));
  const checks = { pageBoxes: boxErrors.length === 0 && pageCount > 0, outputIntentProfile, cmykOnly, pdf13: version === '1.3', fontsEmbedded: embedded === fonts.length, evenPageCount: pageCount > 0 && pageCount % 2 === 0 };
  const failures = [];
  if (!checks.pageBoxes) failures.push(`page boxes: ${boxErrors.join('; ')}`);
  if (!checks.outputIntentProfile) failures.push('missing OutputIntent /DestOutputProfile stream');
  if (!checks.cmykOnly) failures.push(rgb ? 'DeviceRGB/RGB color found' : `non-DeviceCMYK color space found (${otherColor.join(', ')})`);
  if (!checks.pdf13) failures.push(`PDF version ${version ?? 'unknown'}; expected 1.3`);
  if (!checks.fontsEmbedded) failures.push(`unembedded fonts (${embedded}/${fonts.length} embedded)`);
  if (!checks.evenPageCount) failures.push(`odd or empty page count (${pageCount})`);
  const result = { checks, pageBoxes: { sets: [...boxSets.values()], errors: boxErrors }, bleed, version, fonts: { embedded, total: fonts.length }, pages: pageCount, certified: false, scope: 'Structural checks only; not PDF/X-1a conformance certification.' };
  if (failures.length) throw new Error(`PDF/X structural checks failed: ${failures.join('; ')}. Correct the print inputs and rebuild.`);
  return result;
}
