// EPUB-only preparation, ported from the book's proved publishing workflow.
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { publicationMetadata, ncxIdentifier } from './epub-metadata.js';

// End offset of the copyright block that starts on the line holding `from`, as Pandoc's
// markdown reader reads the text. The block is the copyright page: it ends before the next
// heading, an ATX line (one to six # at the line's start, then a space, a tab or the line's
// end) or a setext line (text underlined by = or - at the line's start), each after a blank
// line as blank_before_header requires; or, earlier, after a line containing " is a trademark".
// Neither counts inside fenced code, which opens only after a blank line and only when a
// matching fence closes it.
function copyrightBlockEnd(content, from) {
  const firstEnd = content.indexOf('\n', from);
  if (content.substring(from, firstEnd === -1 ? content.length : firstEnd).includes(' is a trademark')) {
    return firstEnd === -1 ? content.length : firstEnd + 1;
  }
  if (firstEnd === -1) return content.length;
  const lines = content.substring(firstEnd + 1).split('\n');
  const starts = [];
  let offset = firstEnd + 1;
  for (const line of lines) { starts.push(offset); offset += line.length + 1; }
  const blank = (s) => s.trim() === '';
  const atx = /^#{1,6}(?:[ \t]|$)/;
  const opener = /^ {0,3}(`{3,}|~{3,})/;
  const closes = (line, fence) => {
    const m = /^ {0,3}([`~]{3,})[ \t]*$/.exec(line);
    return Boolean(m) && m[1][0] === fence[0] && m[1].length >= fence.length;
  };
  // Whether the line before line i ends a block, so a heading or a fence may start at i.
  let afterBlock = false; // the line before the first scanned line is copyright text
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const open = afterBlock ? opener.exec(line) : null;
    if (open) {
      const close = lines.findIndex((l, k) => k > i && closes(l, open[1]));
      if (close !== -1) { i = close; afterBlock = true; continue; }
    }
    if (line.includes(' is a trademark')) return Math.min(starts[i] + line.length + 1, content.length);
    if (afterBlock && atx.test(line)) return starts[i];
    const underline = lines[i + 1] !== undefined && /^(?:=+|-+)[ \t]*$/.test(lines[i + 1]);
    if (afterBlock && !blank(line) && underline) return starts[i];
    afterBlock = blank(line);
  }
  return content.length;
}

export function cleanMarkdownForEpub(content, config) {
  // Pandoc reads a carriage return as a line end; so does every phase below.
  content = content.replace(/\r\n?/g, '\n');

  // ==========================================================================
  // PHASE 1: Convert line break markers before stripping all comments
  // ==========================================================================
  content = content.replace(/<!--\s*br\s*-->/g, '\n');

  // ==========================================================================
  // PHASE 2: Remove all print-specific comments and markup
  // ==========================================================================

  // Page breaks (EPUB uses CSS page-break + file splitting per chapter)
  content = content.replace(/<!--\s*pagebreak\s*-->/g, '');
  content = content.replace(/<!--\s*cleardoublepage\s*-->/g, '');

  // LaTeX format directives and closing tags
  content = content.replace(/<!--\s*format:[^>]*-->/g, '');
  content = content.replace(/<!--\s*\/format\s*-->/g, '');

  // EPUB cover tag (handled separately by pandoc --epub-cover-image)
  content = content.replace(/<!--\s*epub-cover:[^>]*-->/g, '');

  // Thumb-tab navigation markers (print-only feature)
  content = content.replace(/<!--\s*thumb-tab-[^>]*-->/g, '');

  // TOC placeholder comments (EPUB generates native navigation)
  content = content.replace(/<!--\s*toc-[^>]*-->/g, '');

  // Catch-all: remove any remaining HTML comments
  content = content.replace(/<!--[\s\S]*?-->/g, '');

  // ==========================================================================
  // PHASE 3: Remove print-only content sections
  // ==========================================================================

  // Standalone "Contents" heading (EPUB has native TOC navigation)
  content = content.replace(/\*\*Contents\*\*\s*\n/g, '');

  // ==========================================================================
  // PHASE 4: Strip index page numbers (meaningless in reflowable ePub)
  // Page numbers are injected by extract-pages.js for print; EPUB keeps
  // the term list as a concept reference without page references.
  // ==========================================================================
  const indexMarker = config.index?.extractor?.indexHeading;
  const indexStart = indexMarker ? content.indexOf(indexMarker) : -1;
  if (indexStart !== -1) {
    const glossaryMarker = config.index?.extractor?.glossaryHeading;
    const afterIndex = glossaryMarker ? content.indexOf(glossaryMarker, indexStart) : -1;
    const endPos = afterIndex !== -1 ? afterIndex : content.length;

    const before = content.substring(0, indexStart);
    const indexSection = content.substring(indexStart, endPos);
    const after = content.substring(endPos);

    // "Term Name, 24, 26, 89" -> "Term Name"
    // "Term Name, 6, 13, 27, ..." -> "Term Name"
    const cleanedIndex = indexSection.replace(/^(.+?),\s+\d[\d, .]*$/gm, '$1');
    content = before + cleanedIndex + after;
  }

  // ==========================================================================
  // PHASE 5: Clean up whitespace and artifacts
  // ==========================================================================

  // Remove horizontal rules between blank lines (page separator artifacts)
  content = content.replace(/\n\n+---\n\n+/g, '\n\n\n');

  // Collapse excessive blank lines (max 2 consecutive)
  content = content.replace(/\n{4,}/g, '\n\n\n');

  // ==========================================================================
  // PHASE 6: Wrap front matter sections for EPUB styling
  // The copyright/legal block needs smaller font in EPUB since the print
  // version uses LaTeX format directives (stripped in Phase 2).
  // Uses Pandoc fenced divs (:::) so markdown inside is still parsed.
  // ==========================================================================

  const copyrightMarker = 'All rights reserved.';
  const copyrightPos = content.indexOf(copyrightMarker);
  if (copyrightPos !== -1) {
    // Find the start: back up to "Copyright 20" line
    const yearPos = content.lastIndexOf('Copyright 20', copyrightPos);
    let blockStart = yearPos > 0
      ? content.lastIndexOf('\n\n', yearPos)
      : yearPos;
    if (blockStart < 0) blockStart = 0;

    // The block is the copyright page, so it never takes in a chapter; the convention
    // " is a trademark" on that page ends it earlier.
    const blockEnd = copyrightBlockEnd(content, copyrightPos);

    const before = content.substring(0, blockStart);
    const copyrightBlock = content.substring(blockStart, blockEnd).trim();
    const after = content.substring(blockEnd);

    content = before + '\n\n::: {.copyright .newpage}\n' + copyrightBlock + '\n:::\n\n' + after;
  }

  // ==========================================================================
  // PHASE 7: Add page breaks between front matter sections
  // In EPUB, front matter pages (What You Get, Author's Note, Title Page,
  // Copyright) need explicit page breaks since they lack heading-level markers.
  // Each section is wrapped in a Pandoc fenced div with .newpage class.
  // The Copyright section already has .newpage from Phase 6.
  // ==========================================================================

  const authorNoteMarker = "**Author's Note**";
  const titlePageMarker = `**${config.title.replace(/^The\s+/i, '')}**`;
  const copyrightDivMarker = '::: {.copyright';

  const authorPos = content.indexOf(authorNoteMarker);
  const titlePos = content.indexOf(titlePageMarker);
  const copyrightDivPos = content.indexOf(copyrightDivMarker);

  if (authorPos !== -1 && titlePos !== -1 && copyrightDivPos !== -1
      && authorPos < titlePos && titlePos < copyrightDivPos) {

    // Section 1: Everything before Author's Note (What You Get image)
    const sec1 = content.substring(0, authorPos).trim();

    // Section 2: Author's Note (from marker to before title page)
    const sec2 = content.substring(authorPos, titlePos).trim();

    // Section 3: Title page (from marker to before copyright div)
    const sec3 = content.substring(titlePos, copyrightDivPos).trim();

    // Rest: Copyright div (already wrapped with .newpage) + book content
    const rest = content.substring(copyrightDivPos);

    content = sec1 + '\n\n'
      + '::: {.newpage}\n' + sec2 + '\n:::\n\n'
      + '::: {.newpage}\n' + sec3 + '\n:::\n\n'
      + rest;
  }

  // Trim leading/trailing whitespace
  content = content.trim() + '\n';

  return content;
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Locate a matching close in Pandoc's XML without reserializing the document.
// Counting nested elements keeps a title's front-matter branch separate from
// later Parts and retains the existing bytes everywhere outside the wrapper.
function elementBounds(text, start, name) {
  const tags = new RegExp(`<(/?)${name}(?=[\\s/>])(?:[^"'>]|"[^"]*"|'[^']*')*>`, 'g');
  tags.lastIndex = start;
  let depth = 0;
  let openEnd;
  for (let tag; (tag = tags.exec(text));) {
    if (openEnd === undefined) {
      if (tag.index !== start || tag[1]) return null;
      openEnd = tags.lastIndex;
    }
    if (tag[1]) depth -= 1;
    else if (!tag[0].endsWith('/>')) depth += 1;
    if (depth === 0) return { start, openEnd, closeStart: tag.index, end: tags.lastIndex };
  }
  return null;
}

// Pandoc writes an ordinary (non-ZIP64) EPUB ZIP. Retain every entry's metadata
// and compressed bytes unless its text changes, and rebuild offsets and CRCs.
// This needs only Node built-ins, with no zip/unzip runtime or new package.
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function postProcessEpub(epubPath, config) {
  const archive = readFileSync(epubPath);
  let end = archive.length - 22;
  const earliest = Math.max(0, end - 0xffff);
  while (end >= earliest && (archive.readUInt32LE(end) !== 0x06054b50 ||
      end + 22 + archive.readUInt16LE(end + 20) !== archive.length)) end -= 1;
  if (end < earliest) throw new Error('EPUB has no ZIP directory');
  const count = archive.readUInt16LE(end + 10);
  let cursor = archive.readUInt32LE(end + 16);
  if (count === 0xffff || cursor === 0xffffffff || archive.readUInt32LE(end + 4) !== 0) {
    throw new Error('EPUB post-processing requires a single-volume, non-ZIP64 archive');
  }

  const title = escapeRegex(config.title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
  // A first title wrapping the whole navigation is removed. Pandoc's synthetic
  // title can also wrap just front matter, including an authored title sharing
  // its target. Unwrap that duplicate at its own matching boundaries, too.
  const navWrapper = new RegExp(`<ol class="toc"><li id="toc-li-1"><a[^>]+>${title}</a>(?=<ol)`);
  let wrapped = false;
  let keepTitleTarget = false;
  let navigation;
  const transforms = new Map([
    ['EPUB/nav.xhtml', () => {
      return navigation.replace(/ id="toc-li-\d+"/g, '')
        .replace(/<h1 id="toc-title">Contents<\/h1>/, '');
    }],
    ['EPUB/toc.ncx', (text, wrapped) => {
      text = ncxIdentifier(text, config);
      const wrapper = new RegExp(`<navPoint[^>]*>\\s*<navLabel>\\s*<text>${title}</text>\\s*</navLabel>\\s*<content[^>]*>`);
      const match = wrapped ? wrapper.exec(text) : null;
      const map = /<navMap>\s*/.exec(text);
      const point = match && map && match.index === map.index + map[0].length
        ? elementBounds(text, match.index, 'navPoint') : null;
      return point
        ? text.slice(0, match.index) + text.slice(match.index + match[0].length, point.closeStart)
          + text.slice(point.end).replace(/^\s*/, '')
        : text;
    }],
    ['EPUB/text/ch001.xhtml', (text, wrapped) => {
      const wrapper = new RegExp(`<section id="[^"]+"[^>]*>\\s*<h1[^>]*>${title}</h1>`);
      const match = wrapped && !keepTitleTarget ? wrapper.exec(text) : null;
      const section = match ? elementBounds(text, match.index, 'section') : null;
      if (section) {
        text = text.slice(0, match.index) + text.slice(match.index + match[0].length, section.closeStart)
          + text.slice(section.end).replace(/^\s*(?=<\/body>)/, '');
      }
      return text.replace(/<figcaption[^>]*>What You Get<\/figcaption>\n?/, '');
    }],
    ['EPUB/styles/stylesheet1.css', (text) => text.replace(/#TOC/g, '#toc')],
    ['EPUB/content.opf', (text) => publicationMetadata(text, config).replace(
      /(<itemref idref="nav" \/>)\s*(<itemref idref="ch001_xhtml" \/>)/,
      '$2\n    $1')]
  ]);
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    if (archive.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Invalid EPUB ZIP directory');
    const nameLength = archive.readUInt16LE(cursor + 28);
    const recordLength = 46 + nameLength + archive.readUInt16LE(cursor + 30) + archive.readUInt16LE(cursor + 32);
    const central = Buffer.from(archive.subarray(cursor, cursor + recordLength));
    const name = central.subarray(46, 46 + nameLength).toString('utf8');
    const localOffset = central.readUInt32LE(42);
    if (archive.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('Invalid EPUB ZIP entry');
    const headerLength = 30 + archive.readUInt16LE(localOffset + 26) + archive.readUInt16LE(localOffset + 28);
    const local = Buffer.from(archive.subarray(localOffset, localOffset + headerLength));
    const compressed = archive.subarray(localOffset + headerLength,
      localOffset + headerLength + central.readUInt32LE(20));
    const method = central.readUInt16LE(10);
    if ((central.readUInt16LE(8) & 1) || ![0, 8].includes(method)) {
      throw new Error('Unsupported EPUB ZIP compression or encryption');
    }
    entries.push({ name, central, local, compressed, method });
    cursor += recordLength;
  }
  // Only a handful of small text entries need decompression.
  const text = (entry) => (entry.method === 0 ? entry.compressed : inflateRawSync(entry.compressed)).toString('utf8');
  const nav = entries.find((entry) => entry.name === 'EPUB/nav.xhtml');
  const navText = nav ? text(nav) : '';
  navigation = navText;
  const match = navWrapper.exec(navText);
  if (match) {
    const root = elementBounds(navText, match.index, 'ol');
    const item = elementBounds(navText, match.index + match[0].indexOf('<li'), 'li');
    const list = elementBounds(navText, match.index + match[0].length, 'ol');
    if (root && item && list && /^\s*$/.test(navText.slice(list.end, item.closeStart))) {
      const unwrapped = navText.slice(0, item.start) + navText.slice(list.openEnd, list.closeStart) + navText.slice(item.end);
      // Pandoc can give an authored lower-level title the synthetic title's
      // target. Keep that opening heading when a surviving entry still uses it.
      const target = /href="([^"]+)"/.exec(match[0])?.[1];
      keepTitleTarget = target !== undefined && new RegExp(`<a\\b[^>]*href="${escapeRegex(target)}"`).test(unwrapped);
      wrapped = keepTitleTarget || /^\s*$/.test(navText.slice(item.end, root.closeStart));
      if (wrapped) navigation = unwrapped;
    }
  }
  for (const entry of entries) {
    const { central, local } = entry;
    if (transforms.has(entry.name)) {
      const original = text(entry);
      const changed = transforms.get(entry.name)(original, wrapped);
      if (changed !== original) {
        const bytes = Buffer.from(changed);
        entry.compressed = entry.method === 0 ? bytes : deflateRawSync(bytes);
        central.writeUInt32LE(crc32(bytes), 16);
        central.writeUInt32LE(entry.compressed.length, 20);
        central.writeUInt32LE(bytes.length, 24);
      }
    }
    // Supply sizes directly, dropping any original trailing data descriptor.
    const flags = central.readUInt16LE(8) & ~8;
    central.writeUInt16LE(flags, 8);
    local.writeUInt16LE(flags, 6);
    central.copy(local, 14, 16, 28);
  }
  if (entries[0]?.name !== 'mimetype' || entries[0].central.readUInt16LE(10) !== 0) {
    throw new Error('EPUB mimetype must be first and uncompressed');
  }
  let offset = 0;
  const files = [];
  for (const entry of entries) {
    entry.central.writeUInt32LE(offset, 42);
    files.push(entry.local, entry.compressed);
    offset += entry.local.length + entry.compressed.length;
  }
  const directory = Buffer.concat(entries.map((entry) => entry.central));
  const trailer = Buffer.from(archive.subarray(end));
  trailer.writeUInt32LE(directory.length, 12);
  trailer.writeUInt32LE(offset, 16);
  writeFileSync(epubPath, Buffer.concat([...files, directory, trailer]));
}
