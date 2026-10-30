// EPUB-only preparation, ported from the book's proved publishing workflow.
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateRawSync, inflateRawSync } from 'node:zlib';

export function cleanMarkdownForEpub(content, config) {
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

    // End at a line containing the convention " is a trademark"
    const trademark = /[^\n]* is a trademark[^\n]*/.exec(content.substring(copyrightPos));
    const trademarkPos = trademark ? copyrightPos + trademark.index : -1;
    let blockEnd;
    if (trademarkPos !== -1) {
      blockEnd = content.indexOf('\n', trademarkPos);
      if (blockEnd === -1) blockEnd = content.length;
      blockEnd += 1; // include the newline
    } else {
      // Fallback: end at the next ## heading
      blockEnd = content.indexOf('\n## ', copyrightPos);
      if (blockEnd === -1) blockEnd = content.length;
    }

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

  const title = escapeRegex(config.title);
  const transforms = new Map([
    ['EPUB/nav.xhtml', (text) => {
      const wrapper = new RegExp(`<ol class="toc"><li id="toc-li-1"><a[^>]+>${title}</a>`);
      if (wrapper.test(text)) {
        text = text.replace(wrapper, '');
        text = text.replace(/<\/ol><\/li><\/ol>(<\/nav>)/, '</ol>$1');
      }
      return text.replace(/ id="toc-li-\d+"/g, '')
        .replace(/<h1 id="toc-title">Contents<\/h1>/, '');
    }],
    ['EPUB/toc.ncx', (text) => {
      const wrapper = new RegExp(`<navPoint[^>]*>\\s*<navLabel>\\s*<text>${title}</text>\\s*</navLabel>\\s*<content[^>]*>`);
      return wrapper.test(text)
        ? text.replace(wrapper, '').replace(/<\/navPoint>\s*(<\/navMap>)/, '$1')
        : text;
    }],
    ['EPUB/text/ch001.xhtml', (text) => {
      const wrapper = new RegExp(`<section id="[^"]+"[^>]*>\\s*<h1[^>]*>${title}</h1>`);
      if (wrapper.test(text)) {
        text = text.replace(wrapper, '').replace(/<\/section>\s*<\/body>/, '</body>');
      }
      return text.replace(/<figcaption[^>]*>What You Get<\/figcaption>\n?/, '');
    }],
    ['EPUB/styles/stylesheet1.css', (text) => text.replace(/#TOC/g, '#toc')],
    ['EPUB/content.opf', (text) => text.replace(
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
    let compressed = archive.subarray(localOffset + headerLength,
      localOffset + headerLength + central.readUInt32LE(20));
    const method = central.readUInt16LE(10);
    if ((central.readUInt16LE(8) & 1) || ![0, 8].includes(method)) {
      throw new Error('Unsupported EPUB ZIP compression or encryption');
    }
    if (transforms.has(name)) {
      // Only a handful of small text entries need decompression.
      const original = (method === 0 ? compressed : inflateRawSync(compressed)).toString('utf8');
      const changed = transforms.get(name)(original);
      if (changed !== original) {
        const bytes = Buffer.from(changed);
        compressed = method === 0 ? bytes : deflateRawSync(bytes);
        central.writeUInt32LE(crc32(bytes), 16);
        central.writeUInt32LE(compressed.length, 20);
        central.writeUInt32LE(bytes.length, 24);
      }
    }
    // Supply sizes directly, dropping any original trailing data descriptor.
    const flags = central.readUInt16LE(8) & ~8;
    central.writeUInt16LE(flags, 8);
    local.writeUInt16LE(flags, 6);
    central.copy(local, 14, 16, 28);
    entries.push({ name, central, local, compressed });
    cursor += recordLength;
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
