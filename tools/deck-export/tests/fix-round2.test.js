import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { portable } from './portable-loader.js';
import { strictRoute } from '../../render/tests/fixtures/strict-route.mjs';
import { writeZip } from '../../lib/archive-core.js';
import { launch } from '../../lib/browser-runtime/browser-runtime.js';
import { revealAssets } from '../scripts/package-assets.js';

const cli = fileURLToPath(new URL('../scripts/deck.js', import.meta.url));
function run(...args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', timeout: 65000, env: { ...process.env, npm_config_offline: 'true' } });
}

test('default scaffold exports PDF and PNG and contains the theme fonts', { timeout: 120000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'deck-starter-'));
  try {
    const scaffold = run('scaffold', '--output', join(dir, 'starter'), '--title', 'Starter');
    assert.equal(scaffold.status, 0, scaffold.stderr);
    const answer = JSON.parse(scaffold.stdout);
    assert.equal(answer.theme, 'white');
    // Exercise export first so the unfixed starter demonstrates the user failure.
    const pdf = run('pdf', '--input', answer.deck, '--output', join(dir, 'starter.pdf'));
    assert.equal(pdf.status, 0, pdf.stderr);
    assert.equal(readFileSync(join(dir, 'starter.pdf')).subarray(0, 5).toString(), '%PDF-');
    assert.equal(JSON.parse(pdf.stdout).slides, 3);
    const png = run('png', '--input', answer.deck, '--output', join(dir, 'slides'), '--scale', '1');
    assert.equal(png.status, 0, png.stderr);
    assert.equal(JSON.parse(png.stdout).slides, 3);
    assert.equal(readdirSync(join(dir, 'slides')).length, 3);
    for (const file of readdirSync(join(dir, 'slides'))) assert.equal(readFileSync(join(dir, 'slides', file)).subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.ok(existsSync(join(answer.assets, 'fonts/source-sans-pro/source-sans-pro.css')));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('every theme using local fonts scaffolds the complete fonts tree beside theme.css', () => {
  const dir = mkdtempSync(join(tmpdir(), 'deck-themes-'));
  const themes = fileURLToPath(new URL('../vendor/reveal.js/dist/theme/', import.meta.url));
  try {
    let checked = 0;
    for (const name of readdirSync(themes).filter(name => name.endsWith('.css'))) {
      if (!readFileSync(join(themes, name), 'utf8').includes('./fonts/')) continue;
      const output = run('scaffold', '--output', join(dir, name), '--theme', name.slice(0, -4));
      assert.equal(output.status, 0, output.stderr);
      const { assets } = JSON.parse(output.stdout);
      const compare = (source, target) => {
        assert.deepEqual(readdirSync(target).sort(), readdirSync(source).sort());
        for (const entry of readdirSync(source, { withFileTypes: true })) {
          if (entry.isDirectory()) compare(join(source, entry.name), join(target, entry.name));
          else assert.deepEqual(readFileSync(join(target, entry.name)), readFileSync(join(source, entry.name)));
        }
      };
      compare(join(themes, 'fonts'), join(assets, 'fonts'));
      checked++;
    }
    assert.ok(checked >= 8, `themes checked: ${checked}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('missing relative CSS imports and font URLs fall back in real PDF and PNG exports', { timeout: 30000 }, async () => {
  const core = await portable(new URL('../scripts/export-core.js', import.meta.url));
  const browser = await launch();
  try {
    const html = '<link rel="stylesheet" href="theme.css"><link rel="stylesheet" href="reveal.css"><div class="reveal"><div class="slides"><section>Fallback font</section></div></div><script src="reveal.js"></script><script>Reveal.initialize({width:320,height:180});</script>';
    const css = '@import url(./fonts/missing.css); @import "./other-missing.css"; @font-face {font-family:Absent;src:url(./fonts/missing.woff2)} section{font-family:Absent,sans-serif}';
    const file = { name: 'deck.zip', bytes: await writeZip([{ name: 'index.html', bytes: new TextEncoder().encode(html) }, { name: 'theme.css', bytes: new TextEncoder().encode(css) }], { maxBytes: 8388608 }) };
    for (const exportDeck of [core.exportPdf, core.exportPng]) {
      const output = await exportDeck({ scale: 1 }, [file], { browser, revealAssets: revealAssets(), responseBody: bytes => Buffer.from(bytes) });
      assert.equal(output.answer.slides, 1);
      assert.ok(output.files[0].bytes.length > 100);
    }
  } finally { await browser.close(); }
});

test('missing font imports are optional while unrelated missing assets and non-GET stay fatal', async () => {
  const core = await portable(new URL('../scripts/browser-core.js', import.meta.url));
  for (const [name, type, method, optional] of [
    ['fonts/missing.css', 'stylesheet', 'GET', true], ['root-fonts.css', 'stylesheet', 'GET', true], ['missing.woff2', 'font', 'GET', true],
    ['font-without-extension', 'font', 'GET', true], ['missing.css', 'stylesheet', 'GET', false],
    ['missing.png', 'image', 'GET', false], ['fonts/missing.css', 'stylesheet', 'POST', false]
  ]) {
    let handle;
    const check = await core.uploadRoutes({ route: async (_, fn) => { handle = fn; } }, new Map([['theme.css', { bytes: core.textBytes('@import url(./fonts/missing.css); @import "/root-fonts.css";') }]]));
    const route = strictRoute(core.href(name), type, method);
    await handle(route);
    assert.equal(route.aborted, true);
    if (optional) check(); else assert.throws(check);
  }
  for (const [url, type, optional] of [['https://fonts.example/missing.woff2', 'font', true], ['https://fonts.example/missing.css', 'stylesheet', false]]) {
    let handle;
    const check = await core.uploadRoutes({ route: async (_, fn) => { handle = fn; } }, new Map());
    const route = strictRoute(url, type);
    await handle(route);
    assert.equal(route.aborted, true);
    if (optional) check(); else assert.throws(check);
  }
});

test('deck fulfill converts bytes and catches a host that forgets', async () => {
  const core = await portable(new URL('../scripts/browser-core.js', import.meta.url));
  for (const bad of [false, true]) {
    let handle;
    const bytes = new Uint8Array([137, 80, 78, 71]);
    const check = await core.uploadRoutes({ route: async (_, fn) => { handle = fn; } }, new Map([['asset.png', { bytes }]]), {}, bad ? value => value : value => Buffer.from(value));
    const route = strictRoute(core.href('asset.png'));
    await handle(route);
    if (bad) { assert.throws(check, /uploaded asset/); assert.equal(route.aborted, true); assert.equal(route.bodies.length, 0); }
    else { check(); assert.deepEqual(route.bodies, [Buffer.from(bytes)]); }
  }
});
