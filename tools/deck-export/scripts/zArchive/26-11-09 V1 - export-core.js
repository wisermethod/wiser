/** Portable deck export. No browser package or disk imports. */
import { writeZip } from '../../lib/archive-core.js';
import { OUTPUT_LIMIT, ExportError, refuse, positive, pixels, result, upload, href, textOf, withPage, uploadRoutes } from './browser-core.js';
export const REVEAL_VERSION = '5.2.1';
export const SLIDE_LIMIT = 24;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const READY = 'typeof Reveal !== "undefined" && Reveal.isReady()';
function pinnedAssets(assets) {
  for (const name of ['reveal.js','reveal.css','reset.css']) {
    if (!(assets?.[name] instanceof Uint8Array) || !assets[name].length) refuse(`host must supply pinned reveal.js ${REVEAL_VERSION} package assets.`);
  }
  return Object.fromEntries(Object.entries(assets).map(([name,bytes]) => [name,{bytes}]));
}
function outputName(input, mode) {
  const name = input.output ?? (mode === 'pdf' ? 'deck.pdf' : 'slides.zip');
  if (typeof name !== 'string' || !/^[^/\\\x00-\x1f]+$/.test(name) || !(mode === 'pdf' ? /\.pdf$/i : /\.zip$/i).test(name)) refuse('output must be a simple .pdf or .zip filename for this command.');
  return name;
}
async function exportDeck(mode, input, files, { browser, revealAssets, responseBody } = {}) {
  if (!Array.isArray(files) || files.length !== 1 || !/\.zip$/i.test(files[0].name)) refuse('supply one ZIP containing the deck HTML and its assets.');
  const source = await upload(input, files);
  const assets = pinnedAssets(revealAssets), output = outputName(input, mode);
  const width = input.width == null ? null : positive(input.width, 1920, 'width', 8192);
  const height = input.height == null ? null : positive(input.height, 1080, 'height', 8192);
  const scale = positive(input.scale, 2, 'scale', 4);
  const timeout = positive(input.timeout, 30000, 'timeout', 45000);
  pixels(width ?? 1920, height ?? 1080, mode === 'png' ? scale : 1);
  try {
    return await withPage(browser, { viewport: { width: width ?? 1920, height: height ?? 1080 }, deviceScaleFactor: mode === 'png' ? scale : 1 }, async (page, context) => {
      // Seed and retain the host's pinned runtime before any uploaded script.
      // A deck may bundle another UMD copy inline; its global assignment cannot
      // replace the pinned constructor used by its subsequent initialize call.
      await page.addInitScript({ content: textOf(revealAssets['reveal.js']) + '\n;(() => { const pinned = window.Reveal; Object.defineProperty(window, \'Reveal\', { get: () => pinned, set: () => {}, configurable: false }); })();' });
      const check = await uploadRoutes(context, source.entries, assets, responseBody);
      const url = href(source.entry) + (mode === 'pdf' ? '?print-pdf' : '?export=png');
      async function load() {
        try {
          await page.goto(url, { waitUntil: 'networkidle', timeout });
          await page.waitForFunction(READY, null, { timeout });
        } finally { check(); }
      }
      await load();
      const config = await page.evaluate(() => { const { width, height } = Reveal.getConfig(); return { width, height }; });
      const size = { width: width ?? (Number.isFinite(config.width) ? config.width : 1920), height: height ?? (Number.isFinite(config.height) ? config.height : 1080) };
      positive(size.width, 1920, 'deck width', 8192); positive(size.height, 1080, 'deck height', 8192);
      pixels(size.width, size.height, mode === 'png' ? scale : 1);
      if (page.viewportSize().width !== size.width || page.viewportSize().height !== size.height) {
        await page.setViewportSize(size); await load();
      }
      if (mode === 'png') await page.evaluate(() => { Reveal.configure({ view: 'slide', scrollActivationWidth: 0 }); Reveal.toggleScrollView(false); });
      const slideCount = await page.evaluate(() => Reveal.getTotalSlides());
      if (!Number.isSafeInteger(slideCount) || slideCount < 1 || slideCount > SLIDE_LIMIT) refuse('deck must contain 1 to 24 slides.');
      if (mode === 'pdf') {
        await pause(2000);
        const slides = await page.evaluate(() => document.querySelectorAll('.pdf-page').length || Reveal.getTotalSlides());
        if (slides > SLIDE_LIMIT) refuse('PDF expands to more than 24 pages; disable separate fragments or reduce the deck.');
        const bytes = new Uint8Array(await page.pdf({ width: `${size.width}px`, height: `${size.height}px`, printBackground: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } }));
        check();
        return result({ output, format: 'pdf', ...size, slides }, [{ name: output, mediaType: 'application/pdf', bytes }]);
      }
      await page.evaluate(() => {
        Reveal.configure({ transition: 'none', backgroundTransition: 'none' });
        document.querySelectorAll('[data-transition], [data-transition-speed], [data-background-transition]').forEach(el => { el.removeAttribute('data-transition'); el.removeAttribute('data-transition-speed'); el.removeAttribute('data-background-transition'); });
      });
      await page.addStyleTag({ content: '.reveal .slides section, .reveal .backgrounds .slide-background { transition: none !important; }' });
      await pause(1000);
      const indices = await page.evaluate(() => {
        const found = [];
        document.querySelectorAll('.reveal .slides > section').forEach((horizontal, h) => {
          const vertical = horizontal.querySelectorAll('section');
          if (vertical.length) vertical.forEach((_,v) => found.push({h,v})); else found.push({h,v:0});
        });
        return found;
      });
      if (!indices.length || indices.length > SLIDE_LIMIT) refuse('deck must contain 1 to 24 slides.');
      const pictures = [];
      let total = 0;
      for (const {h,v} of indices) {
        await page.evaluate(([h,v]) => Reveal.slide(h,v), [h,v]);
        await pause(500);
        const bytes = new Uint8Array(await page.screenshot({ type: 'png' }));
        total += bytes.length;
        if (total >= OUTPUT_LIMIT) refuse('output files reach the 4 MiB limit; nothing was returned.');
        pictures.push({ name: `slide-${String(pictures.length+1).padStart(3,'0')}.png`, bytes });
      }
      check();
      // ZIP framing counts toward the output cap, not only the pictures inside.
      const bytes = await writeZip(pictures, { maxBytes: OUTPUT_LIMIT - 1 });
      return result({ output, format: 'png', ...size, scale, slides: pictures.length, files: pictures.map(file => file.name) }, [{ name: output, mediaType: 'application/zip', bytes }]);
    });
  } catch (error) {
    if (error instanceof ExportError || error.message?.startsWith('ZIP refused:')) throw error;
    if (error.name === 'TimeoutError') refuse('the deck did not initialize within the requested timeout; include its assets in the ZIP.');
    refuse('the browser could not export this deck; engine text is withheld because it can quote the page.');
  }
}
export async function exportPdf(input = {}, files = [], capabilities = {}) { return exportDeck('pdf', input, files, capabilities); }
export async function exportPng(input = {}, files = [], capabilities = {}) { return exportDeck('png', input, files, capabilities); }
