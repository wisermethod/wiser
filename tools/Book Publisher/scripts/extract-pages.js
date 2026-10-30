/**
 * Extract first-pass PDF/LaTeX page numbers into a caller's merged manuscript.
 * Source chapters stay page-agnostic. All book paths and extractor settings are
 * supplied by publish.js, which checks install consent before calling this.
 */
import fs from 'node:fs';

export async function extractPages({ pdfPath, auxPath, mergedPath, extractor = {}, log }) {
  if (!pdfPath || !auxPath || !mergedPath) {
    throw new Error('page extraction requires PDF, AUX, and merged manuscript paths');
  }
  const EXTRACTOR = extractor;
  const INDEX_HEADING     = EXTRACTOR.indexHeading     ?? 'Appendix C: Index';
  const GLOSSARY_HEADING  = EXTRACTOR.glossaryHeading  ?? 'Appendix D: Glossary';
  const FRONT_MATTER_PAGES= EXTRACTOR.frontMatterPages ?? 5;
  const INDEX_FALLBACK    = EXTRACTOR.indexFallbackFromEnd ?? 10;
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');


  // pdfjs-dist 6.x ships this Node-compatible entry and the getDocument,
  // PDFDocumentProxy.getPage, and PDFPageProxy.getTextContent APIs used below.
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

  /**
   * Parse the LaTeX aux file to extract page numbers for labels
   * Returns a map of label -> page number
   */
  function parseAuxFile(auxPath) {
    log(`Reading aux file: ${auxPath}`);
  
    if (!fs.existsSync(auxPath)) {
      log('  Aux file not found, will use PDF search instead');
      return null;
    }
  
    const content = fs.readFileSync(auxPath, 'utf-8');
    const pageMap = {};
  
    // Match \newlabel{label-name}{{section}{page}{title}...}
    const labelPattern = /\\newlabel\{([^}]+)\}\{\{[^}]*\}\{(\d+)\}/g;
    let match;
  
    while ((match = labelPattern.exec(content)) !== null) {
      const label = match[1];
      const page = parseInt(match[2]);
      pageMap[label] = page;
    }
  
    log(`  Found ${Object.keys(pageMap).length} labels\n`);
    return pageMap;
  }

  /**
   * Convert a title to its expected label format
   * "Chapter 1: The Jungle" -> "chapter-1-the-jungle"
   */
  function titleToLabel(title) {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special chars except hyphens
      .replace(/\s+/g, '-')          // Spaces to hyphens
      .replace(/-+/g, '-')           // Multiple hyphens to single
      .replace(/^-|-$/g, '');        // Trim leading/trailing hyphens
  }

  /**
   * Extract text from PDF with page boundaries using pdfjs-dist
   */
  async function extractPdfPages(pdfPath) {
    log(`Reading PDF: ${pdfPath}`);
  
    if (!fs.existsSync(pdfPath)) {
      throw new Error(`PDF not found: ${pdfPath}\nRun the build first to generate the PDF.`);
    }
  
    const dataBuffer = new Uint8Array(fs.readFileSync(pdfPath));
  
    // Load the PDF document
    const loadingTask = pdfjsLib.getDocument({ data: dataBuffer });
    const pdfDocument = await loadingTask.promise;
  
    const pages = [];
    const numPages = pdfDocument.numPages;
  
    // Extract text from each page
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum);
      const textContent = await page.getTextContent();
    
      let pageText = '';
      for (const item of textContent.items) {
        pageText += item.str + ' ';
      }
    
      pages.push({
        pageNum: pageNum,
        text: pageText.trim()
      });
    }
  
    log(`  Extracted ${pages.length} pages\n`);
    await loadingTask.destroy();
    return pages;
  }

  /**
   * Normalize text for searching (handle curly quotes, apostrophes, etc.)
   */
  function normalizeText(text) {
    return text
      .toLowerCase()
      // Normalize various apostrophe/quote characters to straight apostrophe
      .replace(/[\u2018\u2019\u201B\u0060\u00B4]/g, "'")  // ', ', ‛, `, ´ -> '
      .replace(/[\u201C\u201D\u201F]/g, '"')              // ", ", ‟ -> "
      .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015]/g, '-'); // Various dashes -> -
  }

  /**
   * Search for a term in the PDF pages
   * Returns array of page numbers where term appears
   */
  function findTermPages(pages, term, firstOnly = false, skipPages = 0, isHeading = false) {
    const results = [];
    const searchTerm = normalizeText(term);
  
    for (const page of pages) {
      // Skip front matter pages
      if (page.pageNum <= skipPages) continue;
    
      const pageText = normalizeText(page.text);
    
      if (isHeading) {
        // For chapter/part headings, look for term near the start of page text
        const firstChunk = pageText.substring(0, 500);
        if (firstChunk.includes(searchTerm)) {
          results.push(page.pageNum);
          if (firstOnly) break;
        }
      } else {
        // Regular search anywhere on page
        if (pageText.includes(searchTerm)) {
          results.push(page.pageNum);
          if (firstOnly) break;
        }
      }
    }
  
    return results;
  }

  /**
   * Parse TOC entries from merged markdown
   * Handles both formats:
   * - With page number: <!-- toc-entry: Chapter 1: The Jungle, 6 -->
   * - Without page number: <!-- toc-entry: Chapter 1: The Jungle -->
   */
  function parseTocEntries(content) {
    const entries = [];
    const lines = content.split('\n');
  
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
    
      // Match toc-part with optional page number
      const partMatch = line.match(/<!--\s*toc-part:\s*([^,>]+?)(?:,\s*(\d+))?\s*-->/);
      const entryMatch = line.match(/<!--\s*toc-entry:\s*([^,>]+?)(?:,\s*(\d+))?\s*-->/);
    
      if (partMatch) {
        entries.push({
          type: 'part',
          title: partMatch[1].trim(),
          currentPage: partMatch[2] ? parseInt(partMatch[2]) : null,
          lineIndex: i,
          line: line
        });
      } else if (entryMatch) {
        entries.push({
          type: 'entry',
          title: entryMatch[1].trim(),
          currentPage: entryMatch[2] ? parseInt(entryMatch[2]) : null,
          lineIndex: i,
          line: line
        });
      }
    }
  
    return entries;
  }

  /**
   * Parse Index terms from merged markdown
   * Source format (no page numbers): Term Name<!-- br -->
   * After extraction: Term Name, page1, page2, page3<!-- br -->
   * 
   * Per TOC structure: Appendix C is the Index
   */
  function parseIndexTerms(content) {
    const terms = [];
    const lines = content.split('\n');
  
    // Find the index section - look for Appendix C: Index (per TOC)
    let inIndex = false;
    let foundIndexHeader = false;
  
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
    
      // Detect start of index - specifically Appendix C: Index
      // Handles both ## and ** formats
      if (!inIndex && new RegExp('^(\\*\\*|##)\\s*' + escapeRe(INDEX_HEADING).replace(/:\s\*/,':\\\\s*') + '\\s*(\\*\\*)?$').test(line.trim())) {
        foundIndexHeader = true;
        log(`  Found Index header at line ${i + 1}`);
        continue;
      }
    
      // After finding header, start collecting terms once we see <!-- br --> lines
      if (foundIndexHeader && line.includes('<!-- br -->')) {
        inIndex = true;
      }
    
      // Stop at end of index (Appendix D: Glossary or end of format block)
      if (inIndex && (new RegExp('^(\\*\\*|##)\\s*' + escapeRe(GLOSSARY_HEADING).replace(/:\s\*/,':\\\\s*')).test(line.trim()) || line.trim() === '<!-- /format -->')) {
        log(`  Index section ends at line ${i + 1}`);
        break;
      }
    
      if (!inIndex) continue;
    
      // Skip format comments, empty lines, and letter headers (e.g., **A**<!-- br -->)
      if (line.startsWith('<!--') || line.trim() === '' || /^\*\*[A-Z]\*\*<!-- br -->/.test(line)) {
        continue;
      }
    
      // Must have <!-- br --> to be an index entry
      if (!line.includes('<!-- br -->')) continue;
    
      // Extract term (before any comma if page numbers exist from previous run)
      let term = line.replace(/<!--\s*br\s*-->/, '').trim();
      // Strip only a trailing page-number list left by a previous run, such as
      // "Term, 42" or "Term, 42, 43". Truncating at the first comma instead would
      // silently shorten a term that legitimately contains one, like "Doe, Jane".
      term = term.replace(/,\s*\d+(\s*,\s*\d+)*\s*$/, '').trim();
    
      if (term && term.length > 1) {
        terms.push({
          term: term,
          lineIndex: i,
          line: line
        });
      }
    }
  
    return terms;
  }

  /**
   * Update TOC in merged file with page numbers
   */
  function updateTocInMerged(lines, entries, auxLabels, pages) {
    log('Updating Table of Contents in merged file...');
  
    let updated = 0;
    const SKIP_FRONT_MATTER = FRONT_MATTER_PAGES;
  
    for (const entry of entries) {
      let newPage = null;
    
      // First, try to find page number from aux file labels
      if (auxLabels) {
        const label = titleToLabel(entry.title);
        if (auxLabels[label]) {
          newPage = auxLabels[label];
        }
      }
    
      // If not found in aux, fall back to PDF text search
      if (newPage === null && pages) {
        const foundPages = findTermPages(pages, entry.title, true, SKIP_FRONT_MATTER, true);
        if (foundPages.length > 0) {
          newPage = foundPages[0];
        }
      }
    
      if (newPage !== null) {
        // Create the new line with page number
        const newLine = entry.type === 'part'
          ? `<!-- toc-part: ${entry.title}, ${newPage} -->`
          : `<!-- toc-entry: ${entry.title}, ${newPage} -->`;
      
        if (lines[entry.lineIndex] !== newLine) {
          lines[entry.lineIndex] = newLine;
          log(`  ${entry.title}: ${entry.currentPage || 'none'} -> ${newPage}`);
          updated++;
        } else {
          log(`  ${entry.title}: ${newPage} (unchanged)`);
        }
      } else {
        log(`  WARNING: "${entry.title}" not found`);
      }
    }
  
    log(`  Updated ${updated} TOC entries\n`);
    return updated;
  }

  /**
   * Find the index start page from aux labels or PDF search
   * Per TOC: Appendix C is the Index
   */
  function findIndexStartPage(auxLabels, pages, totalPages) {
    // First try aux labels
    if (auxLabels) {
      for (const label of Object.keys(auxLabels)) {
        // Specifically look for appendix-c (the index per TOC)
        if (label.includes('appendix-c') && label.includes('index')) {
          log(`  Found index at page ${auxLabels[label]} (label: ${label})`);
          return auxLabels[label];
        }
      }
      // Fallback to any index label
      for (const label of Object.keys(auxLabels)) {
        if (label.includes('index')) {
          log(`  Found index at page ${auxLabels[label]} (label: ${label})`);
          return auxLabels[label];
        }
      }
    }
  
    // Search PDF for "Appendix C: Index" heading
    if (pages) {
      const indexPages = findTermPages(pages, INDEX_HEADING, true, 0, true);
      if (indexPages.length > 0) {
        log(`  Found index at page ${indexPages[0]} (from PDF search)`);
        return indexPages[0];
      }
    }
  
    log(`  Index page not found, using fallback: ${totalPages - INDEX_FALLBACK}`);
    return totalPages - INDEX_FALLBACK;
  }

  /**
   * Update Index in merged file with page numbers
   */
  function updateIndexInMerged(lines, terms, pages, auxLabels) {
    log('Updating Index in merged file...');
  
    let updated = 0;
    let notFound = 0;
    const SKIP_FRONT_MATTER = FRONT_MATTER_PAGES;
    const totalPages = pages.length;
    const INDEX_START_PAGE = findIndexStartPage(auxLabels, pages, totalPages);
  
    for (const termEntry of terms) {
      // Strip common suffixes for searching
      let searchTerm = termEntry.term
        .replace(/\s*\(principle\)\s*$/i, '')
        .replace(/\s*\(human capability\)\s*$/i, '')
        .trim();
    
      // Search for term
      let foundPages = findTermPages(pages, searchTerm, false, SKIP_FRONT_MATTER, false);
    
      // Filter out index pages
      foundPages = foundPages.filter(p => p < INDEX_START_PAGE);
    
      // Build the new line
      let newLine;
      if (foundPages.length > 0) {
        const pageList = foundPages.slice(0, 20).join(', ');
        const suffix = foundPages.length > 20 ? ', ...' : '';
        newLine = `${termEntry.term}, ${pageList}${suffix}<!-- br -->`;
      } else {
        newLine = `${termEntry.term}<!-- br -->`;
        notFound++;
      }
    
      if (lines[termEntry.lineIndex] !== newLine) {
        lines[termEntry.lineIndex] = newLine;
        updated++;
      }
    }
  
    log(`  Updated ${updated} index terms (excluding pages ${INDEX_START_PAGE}+)`);
    if (notFound > 0) {
      log(`  ${notFound} terms appear only in glossary/index`);
    }
    log('');
    return updated;
  }


  if (!fs.existsSync(mergedPath)) {
    throw new Error(`Merged file not found: ${mergedPath}`);
  }
  const auxLabels = parseAuxFile(auxPath);
  const pages = await extractPdfPages(pdfPath);
  log(`Reading merged file: ${mergedPath}`);
  const content = fs.readFileSync(mergedPath, 'utf8');
  const lines = content.split('\n');
  const tocEntries = parseTocEntries(content);
  log(`Found ${tocEntries.length} TOC entries`);
  const tocUpdated = updateTocInMerged(lines, tocEntries, auxLabels, pages);
  const indexTerms = parseIndexTerms(content);
  log(`Found ${indexTerms.length} index terms`);
  const indexUpdated = updateIndexInMerged(lines, indexTerms, pages, auxLabels);
  fs.writeFileSync(mergedPath, lines.join('\n'), 'utf8');
  log(`Updated: ${mergedPath}`);
  return { pages: pages.length, tocUpdated, indexUpdated };
}
