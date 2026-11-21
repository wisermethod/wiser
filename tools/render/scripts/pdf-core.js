/** Print options and checks for the PDF Chromium's Skia backend returns. */
import { OUTPUT_LIMIT, refuse, textBytes } from './browser-core.js';

const PAPER_SIZES = ['Letter', 'Legal', 'Tabloid', 'Ledger', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6'];
const SIDES = ['top', 'right', 'bottom', 'left'];
const POSITIONS = new Set(['left', 'center', 'right']);
const FONT = "'Times New Roman', serif";
const PAGE_COUNTER = 'wiser-render-page';
const NATIVE_FOOTER_PADDING = 16;
const PAGE_LIMIT = 200;
const PDF_DATE = "D:20000101000000+00'00'";
const INPUT_KEYS = new Set([
  'output', 'entry', 'timeout', 'paperSize', 'margin', 'printBackground',
  'footerFormat', 'footerPosition', 'footerFontSize', 'footerSkipFirst'
]);

function margins(value) {
  if (typeof value !== 'string') refuse('margin must be one to four CSS lengths, for example "1in 0.75in".');
  const parts = value.trim().split(/\s+/);
  if (parts.length > 4 || parts.some(part => !/^(?:0|(?:\d+(?:\.\d+)?|\.\d+)(?:in|cm|mm|px))$/.test(part))) {
    refuse('margin must be one to four nonnegative lengths in in, cm, mm or px. Use 0 for no margin.');
  }
  const [top, right = top, bottom = top, left = right] = parts;
  return Object.fromEntries([top, right, bottom, left].map((length, index) => [SIDES[index], length]));
}

export function pdfOptions(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) refuse('PDF options must be a JSON object.');
  if (Object.keys(input).some(key => !INPUT_KEYS.has(key))) refuse('unknown PDF option; use only the options listed in render TOOL.md.');
  const paperSize = input.paperSize ?? 'Letter';
  const format = typeof paperSize === 'string' && PAPER_SIZES.find(size => size.toLowerCase() === paperSize.toLowerCase());
  if (!format) refuse(`paperSize must be one of ${PAPER_SIZES.join(', ')}.`);
  const printBackground = input.printBackground ?? true;
  if (typeof printBackground !== 'boolean') refuse('printBackground must be a boolean.');
  const options = { format, margin: margins(input.margin ?? '1in'), printBackground, preferCSSPageSize: true };
  if (input.footerFormat == null) {
    if ([input.footerPosition, input.footerFontSize, input.footerSkipFirst].some(value => value != null)) {
      refuse('footer options require footerFormat, for example "Page {page} of {pages}".');
    }
    return { options };
  }

  const { footerFormat, footerPosition = 'center', footerFontSize = 10, footerSkipFirst = false } = input;
  if (typeof footerFormat !== 'string' || footerFormat.length > 160 || /[\x00-\x1f\x7f]/.test(footerFormat) ||
      !footerFormat.includes('{page}') || /[{}]/.test(footerFormat.replace(/\{pages?\}/g, ''))) {
    refuse('footerFormat must be at most 160 characters, with {page} and optionally {pages}. Use plain text outside the placeholders.');
  }
  if (!POSITIONS.has(footerPosition)) refuse('footerPosition must be left, center or right.');
  if (!Number.isFinite(footerFontSize) || footerFontSize < 1 || footerFontSize > 72) refuse('footerFontSize must be a number from 1 to 72 points.');
  if (typeof footerSkipFirst !== 'boolean') refuse('footerSkipFirst must be a boolean.');

  const parts = footerFormat.split(/(\{pages?\})/).filter(Boolean);
  if (footerSkipFirst) {
    // Chromium's native template is repeated on every page. Page margin boxes
    // can suppress :first. A separate page counter ignores author resets of page.
    const content = parts.map(part => part === '{page}' ? `counter(${PAGE_COUNTER})` :
      part === '{pages}' ? 'counter(pages)' : JSON.stringify(part)).join(' ');
    const box = `@bottom-${footerPosition}`;
    const footerCss = `@layer wiser-render-footer { @page { counter-increment: ${PAGE_COUNTER} 1; } }
@page { ${box} { content: ${content}; font: ${footerFontSize}pt ${FONT}; color: black; vertical-align: bottom; padding-bottom: 0.2in; white-space: pre; } }
@page :first { ${box} { content: none !important; } }`;
    return { options, footerCss, counter: PAGE_COUNTER };
  }
  const escapeHtml = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fill = parts.map(part => part === '{page}' ? '<span class="pageNumber"></span>' :
    part === '{pages}' ? '<span class="totalPages"></span>' : escapeHtml(part)).join('');
  const footerTemplate = `<div style="width:100%;box-sizing:border-box;padding:0 ${NATIVE_FOOTER_PADDING}pt;font-size:${footerFontSize}pt;font-family:${FONT};text-align:${footerPosition};white-space:pre;">${fill}</div>`;
  return {
    options: { ...options, displayHeaderFooter: true, headerTemplate: '<div></div>', footerTemplate },
    nativeFooter: { parts, font: `${footerFontSize}pt ${FONT}`, padding: NATIVE_FOOTER_PADDING }
  };
}

export function defaultPdfCharset(bytes) {
  const head = new TextDecoder().decode(bytes.subarray(0, 1024));
  if (/<meta\b[^>]*\bcharset\s*=/i.test(head)) return undefined;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return 'utf-8';
  } catch { return undefined; }
}

export function addFooterCss({ css, counter }) {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  if (sheet.cssRules.length !== 3 || !Array.from(sheet.cssRules).every(rule => rule.cssRules?.length === 1)) return false;
  // Each page rule takes one counter-increment declaration. Chromium honors
  // the authored page increment when that counter follows our own in the list.
  const visited = new Set();
  function amend(styleSheet) {
    if (visited.has(styleSheet)) return;
    visited.add(styleSheet);
    try { visit(styleSheet.cssRules); }
    catch (error) { if (error.name !== 'SecurityError') throw error; }
  }
  function visit(rules) {
    for (const rule of rules) {
      if (rule instanceof CSSPageRule) {
        const value = rule.style.getPropertyValue('counter-increment');
        if (value && !/^(?:inherit|initial|revert(?:-layer)?|unset)$/i.test(value)) {
          rule.style.setProperty('counter-increment', `${counter} 1${value === 'none' ? '' : ' ' + value}`, rule.style.getPropertyPriority('counter-increment'));
        }
      } else if (rule.styleSheet) amend(rule.styleSheet);
      else if (rule.cssRules) visit(rule.cssRules);
    }
  }
  let layerReserved = false;
  for (const author of [...document.styleSheets, ...document.adoptedStyleSheets]) {
    amend(author);
    if (!layerReserved && !author.disabled && matchMedia(author.media.mediaText || 'all').matches) {
      // Keep the fallback with the author styles to preserve Chromium's page
      // counter cascade. Reserve its layer before the author's own layers.
      try {
        author.insertRule(`@layer ${sheet.cssRules[0].name};`, 0);
        author.insertRule(sheet.cssRules[0].cssText, author.cssRules.length);
        layerReserved = true;
      } catch (error) {
        if (!['SecurityError', 'HierarchyRequestError'].includes(error.name)) throw error;
      }
    }
  }
  if (layerReserved) sheet.deleteRule(0);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  return true;
}

export function nativeFooterWidth({ parts, font, padding, pages }) {
  const canvas = document.createElement('canvas').getContext('2d');
  canvas.font = font;
  const total = String(pages);
  let width = 0;
  for (let page = 1; page <= pages; page++) {
    const text = parts.map(part => part === '{page}' ? String(page) : part === '{pages}' ? total : part).join('');
    width = Math.max(width, canvas.measureText(text).width * 72 / 96);
  }
  return width + padding * 2;
}

export function checkedPdf(raw, needWidth = false) {
  const bytes = new Uint8Array(raw);
  if (bytes.length >= OUTPUT_LIMIT) refuse('output files reach the 4 MiB limit; nothing was returned.');
  // Skia's xref offsets are byte offsets. Map each byte to one code unit
  // without relying on the host's support for legacy TextDecoder encodings.
  const chunks = [];
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
  }
  const source = chunks.join('');
  const invalid = () => refuse('browser returned an unreadable PDF; check that the shared Chromium runtime is current and retry.');
  const end = /\nstartxref\n(\d+)\n%%EOF\s*$/.exec(source);
  if (!source.startsWith('%PDF-') || !end) invalid();
  const xref = Number(end[1]);
  const table = /^xref\n0 (\d+)\n/.exec(source.slice(xref, xref + 40));
  if (!table) invalid();
  const rows = xref + table[0].length;
  const count = Number(table[1]);
  const trailer = source.slice(rows + 20 * count, end.index);
  if (!trailer.startsWith('trailer\n')) invalid();
  function object(id) {
    if (!(id > 0 && id < count)) invalid();
    const row = /^(\d{10}) 00000 n \n$/.exec(source.slice(rows + 20 * id, rows + 20 * (id + 1)));
    if (!row) invalid();
    const offset = Number(row[1]);
    const close = source.indexOf('\nendobj\n', offset);
    if (close < 0 || close >= xref || !source.startsWith(`${id} 0 obj\n<<`, offset)) invalid();
    return { offset, text: source.slice(offset, close) };
  }
  function field(dictionary, key) {
    return object(Number(new RegExp(`/${key} (\\d+) 0 R\\b`).exec(dictionary)?.[1]));
  }
  const catalog = field(trailer, 'Root');
  const tree = field(catalog.text, 'Pages');
  const pages = Number(/\n\/Count (\d+)\b/.exec(tree.text)?.[1]);
  if (!Number.isSafeInteger(pages) || pages < 1) invalid();
  if (pages > PAGE_LIMIT) refuse(`PDF exceeds ${PAGE_LIMIT} pages; split the document and retry.`);

  // Rewrite only the two timestamp strings in the Info object. Preserving
  // their lengths preserves the cross-reference table and every stream.
  const info = field(trailer, 'Info');
  const dates = [...info.text.matchAll(/\n\/(?:CreationDate|ModDate) \((D:\d{14}[+-]\d{2}'\d{2}')\)/g)];
  if (dates.length !== 2) invalid();
  for (const date of dates) {
    const start = info.offset + date.index + date[0].indexOf(date[1]);
    bytes.set(textBytes(PDF_DATE), start);
  }
  let minWidth;
  if (needWidth) {
    minWidth = Infinity;
    let leaves = 0;
    const pending = [tree.text];
    const seen = new Set();
    while (pending.length) {
      const page = pending.pop();
      const kids = /\/Kids \[([^\]]+)\]/.exec(page);
      if (!kids) {
        const width = Number(/\/MediaBox \[0 0 (\d+(?:\.\d+)?) [\d.]+\]/.exec(page)?.[1]);
        if (!(width > 0)) invalid();
        minWidth = Math.min(minWidth, width);
        leaves++;
        continue;
      }
      for (const child of kids[1].matchAll(/(\d+) 0 R\b/g)) {
        if (seen.has(child[1]) || seen.size >= count) invalid();
        seen.add(child[1]);
        pending.push(object(Number(child[1])).text);
      }
    }
    if (leaves !== pages) invalid();
  }
  return { bytes, pages, minWidth };
}
