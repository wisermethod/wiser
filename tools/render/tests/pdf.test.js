import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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
let browser, engine;

before(async () => {
  engine = await portable(new URL('../scripts/render-core.js', import.meta.url));
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

test('PDF prints CSS geometry over fallbacks and agrees byte-for-byte with the CLI on a later clock tick', async t => {
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
  assert.deepEqual(readFileSync(output), pdf);
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
  const { options, footerCss } = engine.pdfOptions(input);
  assert.equal(options.margin.left, '20mm');
  assert.equal(options.printBackground, false);
  assert.equal(options.displayHeaderFooter, undefined);
  assert.match(footerCss, /counter-increment: wiser-render-page 1;/);
  assert.match(footerCss, /@bottom-right \{ content: "Page " counter\(wiser-render-page\) " of " counter\(pages\); font: 12pt/);
  assert.match(footerCss, /@page :first \{ @bottom-right \{ content: none/);
});

test('PDF rejects bad options and treats footer format as text', () => {
  const { options } = engine.pdfOptions({ footerFormat: '<b>&lt;</b> {page}' });
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
  ]) assert.throws(() => engine.pdfOptions(input), error);
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
