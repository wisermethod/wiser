/** Portable render commands. The host supplies browser and pinned Mermaid bytes. */
import { INPUT_LIMIT, RenderError, refuse, positive, pixels, result, fileInput, upload, href, textOf, withPage, uploadRoutes, addressRoutes, textBytes } from './browser-core.js';
import { imageSize, readSvgSize, resolveOutputSize, withViewBox, buildDocument, buildShell, fitDiagram, viewportWidth, parseErrorLine } from './drawing-core.js';
export const MERMAID_VERSION = '10.9.6';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function name(input, fallback, extensions) {
  const value = input.output ?? fallback;
  if (typeof value !== 'string' || !/^[^/\\\x00-\x1f]+$/.test(value) || !extensions.test(value)) refuse('output must be a simple filename with the command\'s image extension.');
  return value;
}
function timeout(input, fallback) { return positive(input.timeout, fallback, 'timeout', 45000); }
async function safe(work) {
  try { return await work(); }
  catch (error) {
    if (error instanceof RenderError || error.message?.startsWith('ZIP refused:')) throw error;
    if (error.name === 'TimeoutError') refuse('the page did not finish loading within the requested timeout.');
    refuse('the browser could not render this input; engine text is withheld because it can quote the page.');
  }
}
export async function renderHtml(input = {}, files = [], { browser, responseBody } = {}) {
  const pageInput = await upload(input, files);
  const output = name(input, 'render.png', /\.(png|jpe?g)$/i);
  const format = /\.png$/i.test(output) ? 'png' : 'jpeg';
  const width = positive(input.width, 1200, 'width', 8192);
  const height = input.height == null ? null : positive(input.height, 800, 'height', 8192);
  const scale = positive(input.scale, 1, 'scale', 4, false);
  const quality = positive(input.quality, 90, 'quality', 100);
  const ms = timeout(input, 5000);
  pixels(width, height ?? 800, scale);
  return safe(() => withPage(browser, { viewport: { width, height: height ?? 800 }, deviceScaleFactor: scale }, async (page, context) => {
    const check = await uploadRoutes(context, pageInput.entries, {}, responseBody);
    try { await page.goto(href(pageInput.entry), { waitUntil: 'networkidle', timeout: ms }); }
    finally { check(); }
    await pause(200);
    const options = { type: format, ...(format === 'jpeg' ? { quality } : {}) };
    let bytes;
    if (height) bytes = await page.screenshot(options);
    else {
      const body = await page.$('body'), box = await body?.boundingBox();
      if (!box || box.width < 1 || box.height < 1) refuse('the page rendered nothing with a size to capture.');
      pixels(Math.max(width, Math.ceil(box.width)), Math.ceil(box.height) + 10, scale);
      await page.setViewportSize({ width: Math.max(width, Math.ceil(box.width)), height: Math.ceil(box.height) + 10 });
      bytes = await body.screenshot(options);
    }
    check();
    return result({ output, format, ...imageSize(bytes), scale }, [{ name: output, mediaType: format === 'png' ? 'image/png' : 'image/jpeg', bytes: new Uint8Array(bytes) }]);
  }));
}
export async function renderSvg(input = {}, files = [], { browser, responseBody } = {}) {
  const file = fileInput(input, files), source = textOf(file.bytes);
  if (!/<svg\b/i.test(source)) refuse('input holds no <svg> element.');
  const output = name(input, 'render.png', /\.png$/i);
  const scale = positive(input.scale, 2, 'scale', 4, false);
  const width = input.width == null ? null : positive(input.width, 800, 'width', 8192);
  const natural = readSvgSize(source), size = resolveOutputSize({ svgWidth: natural.width, svgHeight: natural.height, scale, targetWidth: width });
  pixels(size.width, size.height);
  const ms = timeout(input, 30000);
  return safe(() => withPage(browser, { viewport: { width: size.width, height: size.height } }, async (page, context) => {
    const check = await uploadRoutes(context, new Map(), {}, responseBody);
    try { await page.setContent(buildDocument(withViewBox(source, natural), size.width, size.height), { waitUntil: 'networkidle', timeout: ms }); }
    finally { check(); }
    await pause(500);
    const bytes = new Uint8Array(await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: size.width, height: size.height } }));
    check();
    return result({ output, width: size.width, height: size.height, scale: size.scale, sizedFrom: natural.sizedFrom }, [{ name: output, mediaType: 'image/png', bytes }]);
  }));
}
export async function renderMermaid(input = {}, files = [], { browser, mermaidScript, responseBody } = {}) {
  const file = fileInput(input, files), source = textOf(file.bytes).trim();
  if (!source) refuse('the diagram is empty.');
  if (!(mermaidScript instanceof Uint8Array) || !mermaidScript.length) refuse(`host must supply the pinned Mermaid ${MERMAID_VERSION} dist/mermaid.min.js bytes.`);
  const output = name(input, 'render.png', /\.png$/i);
  const width = positive(input.width, 800, 'width', 8192), scale = positive(input.scale, 2, 'scale', 4, false);
  const theme = input.theme ?? 'neutral', background = input.background ?? 'white', ms = timeout(input, 10000);
  if (!['default', 'neutral', 'dark', 'forest'].includes(theme)) refuse('theme must be default, neutral, dark or forest.');
  if (typeof background !== 'string' || !/^(?:[a-z]+|#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8}))$/i.test(background)) refuse('background must be a color word or hex value.');
  pixels(viewportWidth(width), 800, scale);
  return safe(() => withPage(browser, { viewport: { width: viewportWidth(width), height: 800 }, deviceScaleFactor: scale }, async (page, context) => {
    const check = await uploadRoutes(context, new Map(), {}, responseBody);
    await page.setContent(buildShell({ width, background }), { timeout: ms });
    await page.$eval('.mermaid', (node, text) => { node.textContent = text; }, source);
    await page.addScriptTag({ content: textOf(mermaidScript) });
    const parsed = await page.evaluate(async theme => {
      try { window.mermaid.initialize({ startOnLoad: false, theme, flowchart: { useMaxWidth: true, htmlLabels: true } }); await window.mermaid.run({ querySelector: '.mermaid' }); return { ok: true }; }
      catch (error) { return { ok: false, message: String(error?.message) }; }
    }, theme);
    if (!parsed.ok) {
      const line = parseErrorLine(parsed.message);
      refuse(line == null ? 'the diagram did not parse.' : `the diagram did not parse; the renderer stopped at line ${line}.`);
    }
    await page.waitForSelector('.mermaid svg', { timeout: ms });
    await pause(500);
    const fitted = await page.evaluate(fitDiagram, width);
    if (!fitted) refuse('the rendered diagram reported no size to capture.');
    pixels(fitted.drawWidth, fitted.drawHeight, scale);
    const element = await page.$('#container');
    const bytes = new Uint8Array(await element.screenshot({ type: 'png', omitBackground: background === 'transparent' }));
    check();
    return result({ path: output, ...imageSize(bytes), scale, maxWidth: width, theme, background }, [{ name: output, mediaType: 'image/png', bytes }]);
  }));
}
export async function captureUrl(input = {}, files = [], { browser, fetch, lookup, responseBody } = {}) {
  if (!Array.isArray(files) || files.length) refuse('address capture accepts no uploaded file.');
  if (textBytes(JSON.stringify(input)).length > INPUT_LIMIT) refuse('JSON input exceeds 8 MiB.');
  let url;
  try { url = new URL(input.url).href; } catch { refuse('url must be a full public http or https address.'); }
  const output = name(input, 'capture.png', /\.png$/i);
  const width = positive(input.width, 1280, 'width', 8192), height = positive(input.height, 720, 'height', 8192), scale = positive(input.scale, 1, 'scale', 4, false);
  const ms = timeout(input, 30000), fullPage = input.fullPage ?? false;
  if (typeof fullPage !== 'boolean') refuse('fullPage must be a boolean.');
  pixels(width, height, scale);
  return safe(() => withPage(browser, { viewport: { width, height }, deviceScaleFactor: scale }, async (page, context, signal) => {
    const network = await addressRoutes(context, url, { fetch, lookup, responseBody }, signal);
    let response;
    try { response = await page.goto(network.url, { waitUntil: 'networkidle', timeout: ms }); }
    finally { network.check(); }
    await pause(1000);
    if (fullPage) {
      const size = await page.evaluate(() => ({ width: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0), height: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0) }));
      pixels(Math.max(width, size.width), Math.max(height, size.height), scale);
    }
    const bytes = new Uint8Array(await page.screenshot({ type: 'png', fullPage }));
    network.check();
    return result({ output, url, finalUrl: network.finalUrl(), status: response ? response.status() : null, ...imageSize(bytes), scale, fullPage }, [{ name: output, mediaType: 'image/png', bytes }]);
  }));
}
