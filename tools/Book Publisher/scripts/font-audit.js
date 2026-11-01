// Inspect text actually painted in the interior, rather than a TeX font request
// or an inventory of unused PDF resources. pdfjs-dist is already a dependency.
import { readFileSync } from 'node:fs';

export async function auditPrintFonts(pdf, config, latexLog, log) {
  try {
    return await inspectPrintFonts(pdf, config, latexLog, log);
  } catch (error) {
    const message = String(error.message ?? error).replace(/[\r\n]+/g, ' ');
    log(`  Warning: print font audit failed: ${message}`);
    return { error: message };
  }
}

async function inspectPrintFonts(pdf, config, latexLog, log) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({ data: new Uint8Array(readFileSync(pdf)), disableFontFace: true, fontExtraProperties: true, verbosity: 0 });
  const family = config.typography?.font_family;
  const expected = family === 'libertinus'
    ? /^(?:Libertinus|LibertineMath|NewTX|ntx|tx)/i
    : family === 'source-serif' ? /^(?:SourceSerifPro|CMMI|CMMIB|CMSY|CMBSY|CMEX|CMR|CMBX|CMTI|CMSS|CMTT|SFTT)/i : /^(?:LMRoman|LMSans|LMMono|LMMath|LatinModern)/i;
  const faces = new Set();
  const unexpected = new Map();
  try {
    const document = await task.promise;
    for (let number = 1; number <= document.numPages; number += 1) {
      const page = await document.getPage(number);
      // Font objects are delivered with the operator list, not text extraction.
      await page.getOperatorList();
      const content = await page.getTextContent();
      for (const item of content.items) {
        if (!item.str?.trim() || !item.fontName) continue;
        const font = page.commonObjs.get(item.fontName);
        const face = font.name.replace(/^[A-Z]{6}\+/, '');
        faces.add(face);
        // The template explicitly uses this family for tabs and optional quotes.
        if (expected.test(face) || /^(?:SourceSansPro|MSAM|MSBM)/i.test(face)) continue;
        if (!unexpected.has(face)) unexpected.set(face, new Map());
        const pages = unexpected.get(face);
        if (!pages.has(number)) pages.set(number, new Set());
        pages.get(number).add(item.str);
      }
      page.cleanup();
    }
  } finally { await task.destroy(); }
  const result = {
    faces: [...faces].sort(),
    unexpected: [...unexpected].map(([face, pages]) => ({ face,
      pages: [...pages].map(([page, text]) => ({ page, text: [...text].join(' ') })) })),
    missingCharacters: [...new Set(latexLog.match(/Missing character:[^\r\n]*|LaTeX Error: Unicode character[^\r\n]*(?:\r?\n[^\r\n]*\(U\+[0-9A-F]+\))?/g) ?? [])]
  };
  for (const entry of result.unexpected) {
    for (const hit of entry.pages) log(`  Warning: unexpected print text face ${entry.face}, PDF page ${hit.page}: ${JSON.stringify(hit.text)}`);
  }
  for (const message of result.missingCharacters) log(`  Warning: ${message}`);
  return result;
}
