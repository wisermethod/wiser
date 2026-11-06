import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { assembleCore } from '../../../skills/Build Brand/scripts/assemble-core.mjs';
import { board, selection, matchingPairing } from '../../../skills/Build Brand/tests/selections.mjs';
import { validateBrandBoards, wcag } from '../scripts/brand-boards.js';
import { renderBrandBoards } from '../scripts/brand-board-view.js';
import { loadPlaywright } from '../../lib/browser-runtime/browser-runtime.js';

const library = JSON.parse(readFileSync(new URL('../../../skills/Build Brand/parts/parts.json', import.meta.url)));
test('all library palette labels and hex values fit their chips with 4.5:1 contrast in both modes', async t => {
  assert.equal(library.palettes.length,30);
  const runtime = await loadPlaywright(), browser = await (runtime.chromium || runtime.default.chromium).launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route('**/*', route => route.abort());
  let checked = 0;
  for (const palette of library.palettes) {
    const input = selection([board(library, { palette: palette.id, pairing: matchingPairing(library, palette) })], library);
    input.boards[0].graphicSet.pattern = { strength: { light: 0, dark: 0 } };
    input.boards[0].graphicSet.texture = { strength: { light: 0, dark: 0 } };
    const spec = assembleCore(input, library); spec.layout = 'board'; spec.showChecks = false;
    const valid = validateBrandBoards(spec, { add(path) { return { extension: extname(path), uri: 'data:font/' + extname(path).slice(1) + ';base64,' + readFileSync(new URL('../../../skills/Build Brand/parts/' + path, import.meta.url)).toString('base64') }; } }, () => {});
    await page.setContent(renderBrandBoards(valid));
    await page.evaluate(()=>document.fonts.ready);
    for (const width of [390, 734, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const mode of ['light', 'dark']) {
        await page.evaluate(mode => { location.hash = `whole-1-${mode}`; }, mode);
        const labels = await page.evaluate(() => [...document.querySelectorAll('.mode-sheet')].filter(s => getComputedStyle(s).display !== 'none').flatMap(s => [...s.querySelectorAll('.colour-bar')].filter(bar => bar.getBoundingClientRect().width).flatMap(bar => [...bar.querySelectorAll('b,.value')].map(label => {
          const rect = label.getBoundingClientRect(), chip = bar.getBoundingClientRect();
          return { color: getComputedStyle(label).color, background: getComputedStyle(bar).backgroundColor, fits: rect.top >= chip.top - 1 && rect.bottom <= chip.bottom + 1 && rect.right <= chip.right + 1, text: label.textContent };
        }))));
        assert.ok(labels.length, `${palette.id}/${mode}/${width}`);
        const hex = css => '#' + css.match(/\d+/g).slice(0,3).map(v => Number(v).toString(16).padStart(2,'0')).join('');
        for (const label of labels) {
          const at = `${palette.id}/${mode}/${width}: ${label.text}`;
          assert.ok(wcag(hex(label.color), hex(label.background)) >= 4.5, at + ' contrast');
          assert.ok(label.fits, at + ' fits'); checked++;
        }
      }
    }
  }
  t.diagnostic(`${checked} rendered labels checked`);
});
