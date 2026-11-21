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
const PROBE_PREFIX_LIMIT = 64 * 1024;
const PROBE_BORDER = 32;
const PAINTED_BOX = /(?:^|\n)[\d. ]+ RG ([\d.]+) ([\d.]+) ([\d.]+) rg\n(?:\/\w+ gs\n)?(-?[\d.]+) -?[\d.]+ ([\d.]+) ([\d.]+) re\nf(?=\n)/g;
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
  const font = `${footerFontSize}pt ${footerSkipFirst ? 'serif' : FONT}`;
  if (footerSkipFirst) {
    // Chromium's native template is repeated on every page. Page margin boxes
    // can suppress :first. A separate page counter ignores author resets of page.
    const content = parts.map(part => part === '{page}' ? `counter(${PAGE_COUNTER})` :
      part === '{pages}' ? 'counter(pages)' : JSON.stringify(part)).join(' ');
    const box = `@bottom-${footerPosition}`;
    const footerCss = `@layer wiser-render-footer { @page { counter-increment: ${PAGE_COUNTER} 1; } }
@page { ${box} { all: initial; content: ${content}; font: ${font}; color: black; direction: ltr; vertical-align: bottom; padding-bottom: 0.2in; white-space: pre; } }
@page :first { ${box} { content: none !important; } }`;
    return { options, footer: { parts, font, padding: 0, skipFirst: true, css: footerCss, counter: PAGE_COUNTER } };
  }
  const escapeHtml = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fill = parts.map(part => part === '{page}' ? '<span class="pageNumber"></span>' :
    part === '{pages}' ? '<span class="totalPages"></span>' : escapeHtml(part)).join('');
  const footerTemplate = `<div style="width:100%;box-sizing:border-box;padding:0 ${NATIVE_FOOTER_PADDING}pt;font-size:${footerFontSize}pt;font-family:${FONT};text-align:${footerPosition};white-space:pre;">${fill}</div>`;
  return {
    options: { ...options, displayHeaderFooter: true, headerTemplate: '<div></div>', footerTemplate },
    footer: { parts, font, padding: NATIVE_FOOTER_PADDING, skipFirst: false }
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

function footerWidths({ parts, font, padding, pages }) {
  const canvas = document.createElement('canvas').getContext('2d');
  canvas.font = font;
  const total = String(pages);
  return Array.from({ length: pages }, (_, index) => {
    const text = parts.map(part => part === '{page}' ? String(index + 1) : part === '{pages}' ? total : part).join('');
    return canvas.measureText(text).width * 72 / 96 + padding * 2;
  });
}

function geometryStyle(css) {
  const style = document.createElement('style');
  style.textContent = css;
  (document.head ?? document.documentElement).prepend(style);
  if (style.sheet?.cssRules.length === 1) {
    globalThis.wiserGeometry = style.sheet;
    return;
  }
  // A caller's CSP can disallow inline elements. A constructed sheet still
  // lets Chromium resolve the probe against the document's print styles.
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  document.adoptedStyleSheets = [sheet, ...document.adoptedStyleSheets];
  globalThis.wiserGeometry = sheet;
}

function probeCss(colors) {
  // Two independently colored borders identify the probe in Skia's page
  // area without enabling print backgrounds or using the author's paint.
  return `@layer wiser-render-geometry-${colors.flat().join('-')} {
    @page {
      ${['top', 'bottom'].map((edge, index) => `
        @${edge}-left { content: none !important; }
        @${edge}-right { content: none !important; }
        @${edge}-center {
          all: initial !important;
          content: "" !important;
          width: 100% !important;
          height: 0 !important;
          border-${edge === 'top' ? 'bottom' : 'top'}: ${PROBE_BORDER}px solid rgb(${colors[index].join(' ')}) !important;
        }`).join('')}
    }
  }`;
}

export async function printPdf(page, context, options, footer) {
  if (!footer) return checkedPdf(await page.pdf(options));
  // Use Chromium's own paginated geometry, including named pages, pseudo
  // pages and stylesheet cascade. Keep the probe and final layout still.
  const session = await context.newCDPSession(page);
  const { frameTree } = await session.send('Page.getFrameTree');
  const { executionContextId } = await session.send('Page.createIsolatedWorld', {
    frameId: frameTree.frame.id, worldName: 'wiser-pdf-geometry'
  });
  const evaluate = async (fn, input) => {
    const { result, exceptionDetails } = await session.send('Runtime.evaluate', {
      contextId: executionContextId, expression: `(${fn})(${JSON.stringify(input)})`, returnByValue: true, awaitPromise: true
    });
    if (exceptionDetails) refuse('could not verify PDF footer geometry; check the shared Chromium runtime and retry.');
    return result.value;
  };
  // Give print preparation a single turn before taking the two snapshots.
  await evaluate(async () => {
    window.dispatchEvent(new Event('beforeprint'));
    await document.fonts.ready;
  });
  await session.send('Emulation.setScriptExecutionDisabled', { value: true });
  if (footer.css && !await evaluate(addFooterCss, footer)) {
    refuse('Chromium lacks CSS page margin boxes; use a current shared browser build.');
  }
  const zoom = await evaluate(() => document.documentElement.currentCSSZoom);
  const channel = () => 1 + Math.floor(Math.random() * 254);
  const colors = [[channel(), channel(), channel()], [channel(), channel(), channel()]];
  if (colors[0].every((value, index) => value === colors[1][index])) colors[1][0] = colors[0][0] % 254 + 1;
  await evaluate(geometryStyle, probeCss(colors));
  const probe = await page.pdf({ ...options, displayHeaderFooter: false });
  const { pages, geometry } = checkedPdf(probe, true);
  const blank = await context.newPage();
  const widths = await blank.evaluate(footerWidths, { ...footer, pages });
  const first = footer.skipFirst ? 1 : 0;
  for (let index = first; index < pages; index++) {
    const { width, height } = await pageGeometry(geometry[index], colors);
    // Root zoom also scales CSS margin-box text. A border records Chromium's
    // snapped scale in case print styling changes it in a page's viewport.
    let scale = 1;
    if (footer.skipFirst) scale = Math.abs(height - zoom * PROBE_BORDER) < 1 ? zoom : (height + 1) / PROBE_BORDER;
    if (widths[index] * scale > width) {
      refuse('the footer is too wide for the PDF page width inside its margins; shorten footerFormat or reduce footerFontSize.');
    }
  }
  await evaluate(() => globalThis.wiserGeometry.deleteRule(0));
  const printed = checkedPdf(await page.pdf(options));
  if (printed.pages !== pages) refuse('PDF pagination changed during footer verification; retry with static print styles.');
  return printed;
}

async function pageGeometry({ stream, compressed, width }, colors) {
  // The page margin boxes precede the page body in Skia's content stream.
  // Bound how much uncompressed browser output this probe can inspect.
  let prefix = stream.subarray(0, PROBE_PREFIX_LIMIT);
  if (compressed) {
    const input = new ReadableStream({ start(controller) {
      controller.enqueue(stream);
      controller.close();
    } });
    const reader = input.pipeThrough(new DecompressionStream('deflate')).getReader();
    const bytes = new Uint8Array(PROBE_PREFIX_LIMIT);
    let size = 0;
    try {
      while (size < bytes.length) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = value.subarray(0, bytes.length - size);
        bytes.set(chunk, size);
        size += chunk.length;
      }
    } finally {
      await reader.cancel();
    }
    prefix = bytes.subarray(0, size);
  }
  const boxes = [...new TextDecoder().decode(prefix).matchAll(PAINTED_BOX)];
  const pair = colors.map(color => boxes.filter(box =>
    color.every((channel, index) => Math.round(Number(box[index + 1]) * 255) === channel)));
  const [top, bottom] = pair.map(matches => matches[0]);
  if (pair.some(matches => matches.length !== 1) || top[4] !== bottom[4] || top[5] !== bottom[5] ||
      top[6] !== bottom[6] || !(Number(top[5]) > 0) || !(Number(top[6]) > 0)) {
    refuse('could not verify the PDF page width inside its margins; check the shared Chromium runtime and page styles.');
  }
  return { width: Math.min(width, Number(top[5]) * 72 / 96), height: Number(top[6]) };
}

export function checkedPdf(raw, needGeometry = false) {
  const bytes = new Uint8Array(raw);
  if (needGeometry && bytes.length >= 2 * OUTPUT_LIMIT) refuse('PDF footer geometry exceeded its print budget; split the document and retry.');
  if (!needGeometry && bytes.length >= OUTPUT_LIMIT) refuse('output files reach the 4 MiB limit; nothing was returned.');
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
  const dates = [...info.text.matchAll(/\n\/(CreationDate|ModDate)\b([^\n]*)/g)];
  if (dates.length !== 2 || dates[0][1] === dates[1][1]) invalid();
  for (const date of dates) {
    const literal = /^ \((D:\d{14}[+-]\d{2}'\d{2}')\)(?:>>)?$/.exec(date[2]);
    if (!literal) invalid();
    const start = info.offset + date.index + date[0].indexOf(literal[1]);
    bytes.set(textBytes(PDF_DATE), start);
  }
  const geometry = [];
  if (needGeometry) {
    const pending = [tree.text];
    const seen = new Set();
    while (pending.length) {
      const page = pending.pop();
      const kids = /\/Kids \[([^\]]+)\]/.exec(page);
      if (!kids) {
        const width = Number(/\/MediaBox \[0 0 (\d+(?:\.\d+)?) [\d.]+\]/.exec(page)?.[1]);
        if (!(width > 0)) invalid();
        const content = field(page, 'Contents');
        const header = /^(\d+ 0 obj\n<<(?:\/Filter \/FlateDecode\n)?\/Length (\d+)>> stream\n)/.exec(content.text);
        if (!header) invalid();
        const start = content.offset + header[1].length;
        const end = start + Number(header[2]);
        if (end > xref || !source.startsWith('\nendstream', end)) invalid();
        geometry.push({ width, stream: bytes.subarray(start, end), compressed: header[1].includes('/FlateDecode') });
        continue;
      }
      const branches = [];
      for (const child of kids[1].matchAll(/(\d+) 0 R\b/g)) {
        if (seen.has(child[1]) || seen.size >= count) invalid();
        seen.add(child[1]);
        branches.push(object(Number(child[1])).text);
      }
      pending.push(...branches.reverse());
    }
    if (geometry.length !== pages) invalid();
  }
  return { bytes, pages, geometry };
}
