import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from '../../lib/browser-runtime/browser-runtime.js';
import { writeZip } from '../../lib/archive-core.js';
import { portable } from './portable-loader.js';

const cli = fileURLToPath(new URL('../scripts/render.js', import.meta.url));
const encoder = new TextEncoder();
const file = (name, text) => ({ name, bytes: encoder.encode(text) });
const pages = '<section>First page</section><section>Second page</section>';
const breaks = 'body{margin:0} section+section{break-before:page}';
const document = (style, body = pages) => `<!doctype html><title>Print sample</title><style>${style}</style>${body}`;
const footer = { footerFormat: 'Page {page} of {pages}' };
let browser, engine, pdfCore;

before(async () => {
  engine = await portable(new URL('../scripts/render-core.js', import.meta.url));
  pdfCore = await portable(new URL('../scripts/pdf-core.js', import.meta.url));
  browser = await launch();
});
after(async () => { await browser?.close(); });

function scratch(t) {
  const dir = mkdtempSync(join(tmpdir(), 'wiser-render-pdf-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function invoke(...args) {
  return spawnSync(process.execPath, [cli, 'pdf', ...args], {
    encoding: 'utf8', timeout: 65000, env: { ...process.env, npm_config_offline: 'true' }
  });
}

test('PDF prints CSS geometry over fallbacks and normalizes Info dates across a clock tick', async t => {
  const html = file('sample.html', document(`@page {size:letter; margin:1in} ${breaks}`));
  const rendered = await engine.renderPdf({ ...footer, paperSize: 'A4', margin: '2in', output: 'sample.pdf' }, [html], { browser });
  assert.deepEqual({ ...rendered.answer }, { output: 'sample.pdf', format: 'pdf', pages: 2 });
  assert.equal(rendered.files[0].mediaType, 'application/pdf');
  const pdf = Buffer.from(rendered.files[0].bytes);
  assert.equal([...pdf.toString('latin1').matchAll(/\/MediaBox \[0 0 612 792\]/g)].length, 2);
  assert.match(pdf.toString('latin1'), /\/CreationDate \(D:20000101000000\+00'00'\)/);
  assert.match(pdf.toString('latin1'), /\/ModDate \(D:20000101000000\+00'00'\)/);

  const dir = scratch(t);
  const input = join(dir, html.name), output = join(dir, 'sample.pdf');
  writeFileSync(input, html.bytes);
  await new Promise(resolve => setTimeout(resolve, 1100));
  const run = invoke('--input', input, '--output', output, '--paper-size', 'A4',
    '--margin', '2in', '--footer-format', footer.footerFormat);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stderr, '');
  assert.deepEqual(JSON.parse(run.stdout), { output: realpathSync(output), format: 'pdf', pages: 2 });
  const printed = readFileSync(output, 'latin1');
  assert.match(printed, /\/CreationDate \(D:20000101000000\+00'00'\)/);
  assert.match(printed, /\/ModDate \(D:20000101000000\+00'00'\)/);
  assert.equal([...printed.matchAll(/\/MediaBox \[0 0 612 792\]/g)].length, 2);
});

test('PDF accepts ZIP entry and print-only assets, uses fallback size, and omits the first footer', async () => {
  const zip = await writeZip([
    file('decoy.html', '<h1>Decoy</h1>'),
    file('report/main.html', `<link rel="stylesheet" media="print" href="print.css">${document('')}`),
    file('report/print.css', `@page :first {counter-reset:page 8} ${breaks}`)
  ], { maxBytes: 8 * 1024 * 1024 });
  const input = { ...footer, entry: 'report/main.html', paperSize: 'Legal', margin: '0.5in 20mm',
    printBackground: false, footerSkipFirst: true, footerPosition: 'right', footerFontSize: 12 };
  const rendered = await engine.renderPdf(input, [{ name: 'report.zip', bytes: zip }], { browser });
  assert.equal(rendered.answer.pages, 2);
  assert.equal([...Buffer.from(rendered.files[0].bytes).toString('latin1').matchAll(/\/MediaBox \[0 0 612 1008\]/g)].length, 2);
  const { options, footer: { css: footerCss } } = pdfCore.pdfOptions(input);
  assert.equal(options.margin.left, '20mm');
  assert.equal(options.printBackground, false);
  assert.equal(options.displayHeaderFooter, undefined);
  assert.match(footerCss, /counter-increment: wiser-render-page 1;/);
  assert.match(footerCss, /@bottom-right \{ all: initial; content: "Page " counter\(wiser-render-page\) " of " counter\(pages\); font: 12pt serif/);
  assert.match(footerCss, /@page :first \{ @bottom-right \{ content: none/);
});

test('PDF rejects bad options and treats footer format as text', () => {
  const { options } = pdfCore.pdfOptions({ footerFormat: '<b>&lt;</b> {page}' });
  assert.match(options.footerTemplate, /&lt;b&gt;&amp;lt;&lt;\/b&gt; <span class="pageNumber"><\/span>/);
  for (const [input, error] of [
    [{ typo: true }, /unknown PDF option/],
    [{ paperSize: 'unknown' }, /paperSize/],
    [{ margin: '50%' }, /margin/],
    [{ printBackground: 'true' }, /printBackground/],
    [{ footerPosition: 'left' }, /require footerFormat/],
    [{ footerFormat: 'Page {other} {page}' }, /footerFormat/],
    [{ ...footer, footerPosition: 'bottom' }, /footerPosition/],
    [{ ...footer, footerFontSize: 0 }, /footerFontSize/]
  ]) assert.throws(() => pdfCore.pdfOptions(input), error);
});

test('PDF refuses missing print assets, oversize input, and an export above the page cap', async () => {
  const missing = file('sample.html', '<link rel="stylesheet" media="print" href="https://missing.invalid/print.css">');
  await assert.rejects(engine.renderPdf({}, [missing], { browser }), /asset is missing/);
  await assert.rejects(engine.renderPdf({}, [{ name: 'large.html', bytes: new Uint8Array(8 * 1024 * 1024 + 1) }]), /exceeds 8 MiB/);
  await assert.rejects(engine.renderPdf({}, [{ name: 'large.html', bytes: new Uint8Array(8 * 1024 * 1024) }]), /options together exceed 8 MiB/);
  const long = file('sample.html', document(breaks, '<section>Sample</section>'.repeat(201)));
  await assert.rejects(engine.renderPdf({}, [long], { browser }), /exceeds 200 pages/);
  const wide = { footerFormat: 'Long '.repeat(10) + '{page}/{pages}', footerFontSize: 40 };
  await assert.rejects(engine.renderPdf(wide, [file('sample.html', document(breaks))], { browser }), /footer is too wide/);
});

test('PDF CLI refuses invalid and occupied destinations before publishing, and overwrites on request', t => {
  const dir = scratch(t);
  const input = join(dir, 'sample.html'), output = join(dir, 'sample.pdf');
  writeFileSync(input, document(breaks));
  writeFileSync(output, 'original');
  const toolAlias = join(dir, 'tool');
  symlinkSync(fileURLToPath(new URL('../', import.meta.url)), toolAlias, 'dir');
  for (const [args, message] of [
    [['--output', output], /already exists/],
    [['--output', join(toolAlias, 'out.pdf')], /inside this tool/],
    [['--output', join(dir, 'other.png')], /must resolve to a .pdf/],
    [['--output', output, '--overwrite', '--unexpected'], /unknown PDF option/]
  ]) {
    const run = invoke('--input', input, ...args);
    assert.equal(run.status, 1);
    assert.equal(run.stdout, '');
    assert.match(run.stderr, message);
  }
  assert.equal(readFileSync(output, 'utf8'), 'original');
  const written = invoke('--input', input, '--output', output, '--overwrite');
  assert.equal(written.status, 0, written.stderr);
  assert.match(readFileSync(output, 'latin1'), /^%PDF-/);
});


test('footer width uses resolved margins and ignores caller canvas changes in both modes', async t => {
  const dir = scratch(t);
  const input = join(dir, 'sample.html');
  const output = join(dir, 'sample.pdf');
  const footerFormat = 'W'.repeat(21) + ' {page}/{pages}';
  const canvasStub = '<script>CanvasRenderingContext2D.prototype.measureText = () => ({width:0});</script>';
  const style = `@page { size:letter; margin:1in } ${breaks}`;
  writeFileSync(input, document(style, canvasStub + pages));
  for (const skipFirst of [[], ['--footer-skip-first']]) {
    const run = invoke('--input', input, '--output', output, '--margin', '0', '--footer-format', footerFormat,
      '--footer-font-size', '24', ...skipFirst);
    assert.equal(run.status, 1, run.stderr);
    assert.match(run.stderr, /footer is too wide/);
    assert.equal(run.stdout, '');
    assert.equal(existsSync(output), false);
  }
  const wide = file('wide.html', document(`@page {size:letter; margin:1in 0.25in} ${breaks}`));
  for (const footerSkipFirst of [false, true]) {
    const rendered = await engine.renderPdf({ footerFormat, footerFontSize:24, footerSkipFirst, margin:'1in 2in' }, [wide], { browser });
    assert.equal(rendered.answer.pages, 2);
  }
});

test('footer validation uses each printed page and skips the first only when requested', async () => {
  const style = `@page { size:letter; margin:1in 0.25in }
    @media print { @page :first { margin-left: 2.5in !important; margin-right: 2in } } ${breaks}`;
  const source = file('mixed.html', document(style));
  const input = { footerFormat: 'W'.repeat(21) + ' {page}/{pages}', footerFontSize: 24 };
  await assert.rejects(engine.renderPdf(input, [source], { browser }), /footer is too wide/);
  const skipped = await engine.renderPdf({ ...input, footerSkipFirst: true }, [source], { browser });
  assert.equal(skipped.answer.pages, 2);

  const named = file('named.html', document(`@page {size:letter; margin:1in 0.25in}
    @page narrow {size:5in 6in; margin:1in} section+section{page:narrow}`));
  await assert.rejects(engine.renderPdf({ ...input, footerSkipFirst: true }, [named], { browser }), /footer is too wide/);
  const blank = file('blank.html', document('@page {size:letter; margin:1in 2.5in}', ''));
  await assert.rejects(engine.renderPdf(input, [blank], { browser }), /footer is too wide/);
});

test('author paint and root zoom cannot replace the width of the printed margin box', async () => {
  const style = `@page {size:letter; margin:1in} html{zoom:2}
    hr{zoom:.5;width:790px;height:1px;background:rgb(8 17 49);border:0;margin:0} ${breaks}`;
  const content = '<script>CanvasRenderingContext2D.prototype.measureText = () => ({width:0});' +
    'document.querySelectorAll("section").forEach(section => section.prepend(document.createElement("hr")));</script>';
  const source = file('zoomed.html', document(style, pages + content));
  for (const footerSkipFirst of [false, true]) {
    const input = { footerSkipFirst, footerFormat: 'W'.repeat(21) + ' {page}/{pages}', footerFontSize:24 };
    await assert.rejects(engine.renderPdf(input, [source], { browser }), /footer is too wide/);
    const fitting = await engine.renderPdf({ ...footer, footerSkipFirst }, [source], { browser });
    assert.equal(fitting.answer.pages, 2);
  }
});

test('PDF prepares the document before sizing the footer and keeps the prepared contents', async () => {
  const source = file('prepared.html', document(breaks, pages +
    '<script>addEventListener("beforeprint", () => {document.title = "Prepared contents";});</script>'));
  const result = await engine.renderPdf(footer, [source], { browser });
  assert.match(Buffer.from(result.files[0].bytes).toString('latin1'), /\/Title \(Prepared contents\)/);
});

test('footer geometry preserves the requested background policy', async () => {
  const blank = await browser.newPage();
  let bitmap;
  try {
    bitmap = await blank.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1280;
      const context = canvas.getContext('2d');
      const image = context.createImageData(canvas.width, canvas.height);
      let state = 1;
      for (let index = 0; index < image.data.length; index++) {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        image.data[index] = index % 4 === 3 ? 255 : state >>> 24;
      }
      context.putImageData(image, 0, 0);
      return canvas.toDataURL();
    });
  } finally {
    await blank.close();
  }
  assert.ok(bitmap.length > 6 * 1024 * 1024);
  const source = file('background.html', document(`body{background:url(${bitmap})} ${breaks}`));
  const result = await engine.renderPdf({ ...footer, printBackground:false }, [source], { browser });
  assert.equal(result.answer.pages, 2);
  assert.doesNotMatch(Buffer.from(result.files[0].bytes).toString('latin1'), /\/Subtype \/Image\b/);
});

test('the service render module set loads its existing actions without vendoring the PDF core', async t => {
  const dir = scratch(t);
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  const scripts = join(dir, 'tools', 'render', 'scripts');
  const lib = join(dir, 'tools', 'lib');
  mkdirSync(scripts, { recursive: true });
  mkdirSync(lib, { recursive: true });
  for (const name of ['render-core', 'browser-core', 'drawing-core', 'failure-core']) {
    cpSync(new URL(`../scripts/${name}.js`, import.meta.url), join(scripts, `${name}.js`));
  }
  for (const name of ['archive-core', 'destination-core']) {
    cpSync(new URL(`../../lib/${name}.js`, import.meta.url), join(lib, `${name}.js`));
  }
  const core = await import(join(scripts, 'render-core.js'));
  for (const name of ['renderHtml', 'renderSvg', 'renderMermaid', 'captureUrl']) assert.equal(typeof core[name], 'function');
  await assert.rejects(core.renderPdf(), { code: 'ERR_MODULE_NOT_FOUND' });
  cpSync(new URL('../scripts/pdf-core.js', import.meta.url), join(scripts, 'pdf-core.js'));
  await assert.rejects(core.renderPdf(), /supply one HTML or ZIP|upload|file/i);
});

test('the program guard runs through a preserved symlink and leaves ordinary imports quiet', t => {
  const dir = scratch(t);
  const tools = fileURLToPath(new URL('../../', import.meta.url));
  const alias = join(dir, 'tools');
  symlinkSync(tools, alias, 'dir');
  const help = spawnSync(process.execPath, ['--preserve-symlinks-main', join(alias, 'render/scripts/render.js'), 'help'], { encoding: 'utf8' });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /pdf/);
  const fileAlias = join(dir, 'render.js');
  symlinkSync(cli, fileAlias);
  const direct = spawnSync(process.execPath, [fileAlias, 'help'], { encoding: 'utf8' });
  assert.equal(direct.status, 0, direct.stderr);
  assert.equal(direct.stdout, help.stdout);
  const importer = join(dir, 'importer.mjs');
  writeFileSync(importer, `await import(${JSON.stringify(new URL('../scripts/render.js', import.meta.url).href)});`);
  const module = spawnSync(process.execPath, [importer], { encoding: 'utf8' });
  assert.equal(module.status, 0, module.stderr);
  assert.equal(module.stdout + module.stderr, '');
});

test('PDF normalization changes only the two Info dates and refuses unfamiliar date fields', () => {
  const date = "D:20261120010203+00'00'";
  const normalized = "D:20000101000000+00'00'";
  let source = '%PDF-1.4\n';
  const offsets = [];
  const add = (object) => {
    offsets.push(source.length);
    source += `${offsets.length} 0 obj\n<<${object}\nendobj\n`;
  };
  add('/Type /Catalog\n/Pages 2 0 R\n/Metadata 4 0 R>>');
  add('/Type /Pages\n/Count 1>>');
  add(`/Producer (Fixture)\n/CreationDate (${date})\n/ModDate (${date})>>`);
  add(`/Length ${date.length}>> stream\n${date}\nendstream`);
  const xref = source.length;
  source += `xref\n0 5\n0000000000 65535 f \n${offsets.map(offset => String(offset).padStart(10,'0') + ' 00000 n \n').join('')}trailer\n<</Root 1 0 R /Info 3 0 R /ID [<0102><0304>]>>\nstartxref\n${xref}\n%%EOF\n`;
  const expected = source.replace(`/CreationDate (${date})`, `/CreationDate (${normalized})`)
    .replace(`/ModDate (${date})`, `/ModDate (${normalized})`);
  assert.equal(Buffer.from(pdfCore.checkedPdf(encoder.encode(source)).bytes).toString('latin1'), expected);
  assert.throws(() => pdfCore.checkedPdf(encoder.encode(source.replace('/ModDate', '/Unknown'))), /unreadable PDF/);
  // Two copies of one field do not establish that both Info dates were normalized.
  assert.throws(() => pdfCore.checkedPdf(encoder.encode(source.replace('/ModDate ', '/CreationDate '))), /unreadable PDF/);
});
