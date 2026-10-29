import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { validateBrandBoards } from '../scripts/brand-boards.js';
import { renderBrandBoards } from '../scripts/brand-board-view.js';
import { BOARD_LAYOUT, createBoardModel, DEFAULT_MARK_CAPTION, PUBLIC_FONT_FILES } from '../scripts/board-model.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const fixture = () => JSON.parse(readFileSync(new URL('fixtures/brand-boards.json', import.meta.url)));
function validate(spec) {
  return validateBrandBoards(spec, { add(path) {
    path = resolve(ROOT, 'tests/fixtures', path);
    return { extension: extname(path), uri: 'data:application/octet-stream;base64,' + readFileSync(path).toString('base64') };
  } }, () => {});
}
const escape = (s) => String(s).replace(/[&<>"':@(]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', ':': '&#58;', '@': '&#64;', '(': '&#40;' })[c]);

test('Model is detached, JSON data with every fixture block, face setting and resolved drawing', () => {
  const valid = validate(fixture()), before = JSON.stringify(valid), model = createBoardModel(valid);
  assert.equal(JSON.stringify(valid), before);
  assert.deepEqual(JSON.parse(JSON.stringify(model)), model);
  for (const b of model.boards) {
    assert.doesNotMatch(JSON.stringify(b), /"(?:files|asset|uri)":|data:font/);
    for (const mode of ['light', 'dark']) {
      const m = b.modes[mode];
      assert.deepEqual(m.roles, b.palette[mode]);
      assert.deepEqual(m.blocks.map((v) => v.kind), ['hero', 'palette', 'type', 'graphicLanguage', 'cards', 'banner', 'otherMode', 'rules']);
      assert.deepEqual(m.tile.map((v) => v.kind), ['tileTop', 'type', 'tileItems', 'open']);
      assert.match(m.drawings.hero, /xmlns="http:\/\/www.w3.org\/2000\/svg"/);
      assert.doesNotMatch(JSON.stringify(m.drawings), /currentColor|\{\{/);
      for (const [role, face] of Object.entries(b.type)) for (const scale of ['display', 'middle', 'small']) {
        const v = face.settings[scale];
        assert.equal(v.family, valid.boards.find((v) => v.number === b.number).type[role].family);
        assert.equal(v.size, face.sizes[scale].size);
        assert.equal(v.lineHeight, face.sizes[scale].lineHeight);
        assert.equal(v.letterSpacing, face.sizes[scale].tracking);
        assert.equal(v.weight, face.sizes[scale].weight);
      }
    }
  }
  model.boards[0].content.body = 'Changed by consumer';
  assert.equal(JSON.stringify(valid), before);
});

test('Model imports and executes in a realm denying every import and all Node globals', () => {
  const source = readFileSync(new URL('../scripts/board-model.js', import.meta.url), 'utf8');
  const program = `import vm from 'node:vm';
    const context = vm.createContext({});
    const module = new vm.SourceTextModule(${JSON.stringify(source)}, { context });
    await module.link((name) => { throw new Error('Denied import: ' + name); });
    await module.evaluate();
    const model = module.namespace.createBoardModel(${JSON.stringify(validate(fixture()))});
    if (model.boards.length !== 3 || vm.runInContext('typeof Buffer + typeof process + typeof require + typeof fetch', context) !== 'undefinedundefinedundefinedundefined') throw Error('not isolated');`;
  const r = spawnSync(process.execPath, ['--experimental-vm-modules', '--input-type=module', '-e', program], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '');
});

test('Every font-pack family and used weight has a public upright WOFF2 reference', () => {
  const library = JSON.parse(readFileSync(new URL('../../../skills/Build Brand/parts/parts.json', import.meta.url)));
  assert.deepEqual(Object.keys(PUBLIC_FONT_FILES).sort(), Object.keys(library.fonts).sort());
  for (const [family, meta] of Object.entries(library.fonts)) {
    const files = PUBLIC_FONT_FILES[family];
    assert.ok(files.length, family);
    for (const f of files) {
      assert.match(f.url, /^https:\/\/(fonts\.gstatic\.com|cdn\.jsdelivr\.net)\/\S+\.woff2$/);
      assert.equal(f.style, 'normal');
      assert.equal(f.verified, '2026-10-29');
    }
    const used = [...library.pairings.flatMap((p) => [p.type.heading, p.type.body, ...p.handwriting])].filter((v) => v.family === family).flatMap((v) => v.weights);
    for (const weight of used) assert.ok(files.some((f) => Array.isArray(f.weight) ? weight >= f.weight[0] && weight <= f.weight[1] : weight === f.weight), `${family} ${weight}`);
    assert.ok(meta.licence);
  }
});

test('Member words default to the initials caption, no closing or designer labels', () => {
  const valid = validate(fixture()), model = createBoardModel(valid), html = renderBrandBoards(valid);
  assert.equal(model.boards[0].markCaption, DEFAULT_MARK_CAPTION);
  assert.ok(html.includes(DEFAULT_MARK_CAPTION));
  assert.doesNotMatch(html, /Share of a typical page|Contrast results:|APCA|Every checked pairing|class="last-line"|class="example-answers"/);
  for (const b of valid.boards) for (const swatch of b.palette.swatches) {
    assert.ok(html.includes(escape(swatch.name)));
    assert.ok(!html.includes(`<span>${escape(swatch.role)}`));
  }
});

test('Caption and closing are caller text; null closing omits question and examples; designer view is explicit', () => {
  const spec = fixture(); spec.showChecks = true;
  spec.boards[0].content.markCaption = '<Initials> & yours.';
  spec.boards[0].content.closing = 'Keep <this>?';
  let html = renderBrandBoards(validate(spec));
  assert.match(html, /&lt;Initials&gt; &amp; yours\./);
  assert.match(html, /Keep &lt;this&gt;\?/);
  assert.match(html, /Share of a typical page|APCA/);
  assert.match(html, /class="contrast-results"/);
  spec.boards[0].content.closing = null;
  html = renderBrandBoards(validate(spec));
  assert.doesNotMatch(html, /class="last-line"|class="example-answers"/);
  for (const [field, value] of [['markCaption', null], ['markCaption', ''], ['closing', false], ['closing', '']]) {
    const bad = fixture(); bad.boards[0].content[field] = value;
    assert.throws(() => validate(bad), new RegExp(field));
  }
  spec.showChecks = 'yes'; assert.throws(() => validate(spec), /showChecks/);
});

test('Role names in swatch names are hidden too; chips use supplied everyday names or values alone', () => {
  const spec = fixture(), b = spec.boards[0];
  b.palette.swatches.forEach((s, i) => { s.name = ['Page base', 'Inset field', 'Reading ink', 'Action fill'][i]; });
  b.palette.chips = { light: [{ name: 'Action fill', key: 'pop' }], dark: [{ name: 'Action fill', key: 'pop' }] };
  let valid = validate(spec), model = createBoardModel(valid), html = renderBrandBoards(valid);
  // The other fixture boards retain their everyday names, so inspect board 1.
  const whole = html.slice(html.indexOf('id="whole-1"'), html.indexOf('id="whole-2"'));
  assert.doesNotMatch(whole, /Page base|Inset field|Reading ink|Action fill/);
  assert.ok(model.boards[0].modes.light.swatches.every((v) => v.name === null));
  assert.ok(whole.includes('#164fb8'));
  b.palette.swatches.find((v) => v.key === 'pop').name = 'Ocean blue';
  valid = validate(spec); model = createBoardModel(valid);
  assert.equal(model.boards[0].modes.light.chips[0].name, 'Ocean blue');
  spec.showChecks = true;
  assert.equal(createBoardModel(validate(spec)).boards[0].modes.light.chips[0].name, 'Action fill');
});

test('Hiding labels leaves every check and every WCAG/APCA refusal active', () => {
  const spec = fixture(), hidden = validate(spec);
  spec.showChecks = true;
  assert.deepEqual(validate(spec).boards.map((v) => v.checks), hidden.boards.map((v) => v.checks));
  spec.showChecks = false;
  spec.boards[0].palette.light.cardFrontSmallPrint = spec.boards[0].palette.light.cardFront;
  assert.throws(() => validate(spec), /card front small print: WCAG/);
  const apca = fixture(); apca.boards[0].palette.light.pop = '#765d42'; apca.boards[0].palette.light.onPop = '#000000';
  assert.throws(() => validate(apca), /button text.*APCA/);
});

test('Recommended line replaces an identical why in all three presentations', () => {
  const spec = fixture(), b = spec.boards[0];
  b.why = b.recommendation = 'The same reason exactly once.';
  const model = createBoardModel(validate(spec)), html = renderBrandBoards(validate(spec));
  assert.equal(model.boards[0].why, null);
  for (const metadata of html.matchAll(/<div class="board-meta">([\s\S]*?)<\/div>/g)) {
    assert.ok(metadata[1].split(b.why).length - 1 <= 1);
  }
  assert.equal(html.split(b.why).length - 1, 2); // tile and primary whole; alternate has no recommendation
});

test('Existing fixture page bytes survive model extraction, apart from approved words and responsive CSS', () => {
  const spec = fixture(); spec.showChecks = true;
  for (const b of spec.boards) {
    b.content.markCaption = 'The monogram is a placeholder, not a logo. The real mark is drawn after a board is locked.';
    b.content.closing = 'What would you keep, and what would you change?';
  }
  // Recorded from the pre-extraction page writer. Restore the old words above;
  // exclude only the stylesheet, whose card geometry is intentionally changing.
  const html = renderBrandBoards(validate(spec)).replace(/<style>[\s\S]*?<\/style>/, '<style></style>');
  assert.equal(createHash('sha256').update(html).digest('hex'), '28021cd00f21d4c903f46f490c3f7bbedb14f07885166d71bac4fa4c0130c356');
});

test('Rendered fixtures agree with the model, without overflow at card and phone widths in both modes', async (t) => {
  const { loadPlaywright } = await import('../../lib/browser-runtime/browser-runtime.js');
  const runtime = await loadPlaywright(), chromium = runtime.chromium || runtime.default.chromium;
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const valid = validate(fixture()), model = createBoardModel(valid), page = await browser.newPage();
  await page.route('**/*', (route) => route.abort()); // embedded resources only
  for (const width of [734, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.setContent(renderBrandBoards(valid));
    await page.evaluate(() => document.fonts.ready);
    for (const b of model.boards) for (const mode of ['light', 'dark']) {
      await page.evaluate((id) => { location.hash = id; }, `whole-${b.number}-${mode}`);
      const result = await page.evaluate(({ number, mode }) => {
        const sheet = document.querySelector(`#whole-${number}-${mode}`), board = sheet.querySelector('.brand-board'), style = getComputedStyle(board);
        const box = (selector) => board.querySelector(selector).getBoundingClientRect().toJSON();
        const images = [...board.querySelectorAll('img')].map((v) => v.getAttribute('src'));
        const drawUrls = [...images, ...[...board.querySelectorAll('[style]')].flatMap((v) => [...v.getAttribute('style').matchAll(/url\('([^']+)'\)/g)].map((v) => v[1]))];
        return { width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth,
          text: board.textContent, roles: Object.fromEntries(['ground', 'panel', 'text', 'headline', 'pop', 'onPop'].map((k) => [k, style.getPropertyValue('--' + k).trim()])),
          svgs: drawUrls.filter((v) => v.startsWith('data:image/svg+xml')).map((v) => atob(v.split(',')[1])),
          front: box('.business-card.front'), banner: box('.social-banner'), headline: parseFloat(getComputedStyle(board.querySelector('.brand-headline')).fontSize),
          faces: ['heading', 'body'].map((role) => ({ role, family: board.querySelector(`.${role}-face h3`).style.fontFamily,
            weight: board.querySelector(`.${role}-face .type-line`).style.fontWeight, size: board.querySelector(`.${role}-face .type-line`).style.fontSize })),
          overflows: [...board.querySelectorAll('p,b,h2,h3,.colour-bar,.business-card,.content-card')].filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.className || el.tagName) };
      }, { number: b.number, mode });
      assert.ok(result.scroll <= result.width, `${b.number} ${mode} ${width}: ${JSON.stringify(result)}`);
      assert.deepEqual(result.overflows, [], `${b.number} ${mode} ${width}`);
      for (const [key, value] of Object.entries(result.roles)) assert.equal(value, b.modes[mode].roles[key]);
      for (const text of [model.person, b.content.sentence, b.content.body, b.content.smallPrint, b.sample.title, b.sample.body, ...b.sample.steps, b.items.cardLine, b.items.cardBack, b.items.bannerHeadline]) assert.ok(result.text.includes(text), text);
      for (const svg of [b.modes[mode].drawings.hero, b.modes[mode].drawings.pattern, b.modes[mode].drawings.texture, b.modes[mode].drawings.arrow, ...Object.values(b.modes[mode].drawings.sample), ...b.modes[mode].drawings.legend.map((v) => v.svg)]) assert.ok(result.svgs.includes(svg), svg);
      for (const face of result.faces) {
        assert.equal(face.family, `bb-${b.number}-${face.role}`);
        assert.equal(Number(face.weight), b.type[face.role].settings.middle.weight);
        assert.equal(face.size, `${b.type[face.role].settings.middle.size}px`);
      }
      assert.ok(Math.abs(result.front.width / result.front.height - 1.75) < .02);
      assert.ok(Math.abs(result.banner.width / result.banner.height - 4) < .02);
      assert.ok(result.headline >= (width === 390 ? BOARD_LAYOUT.phone.headlineMin : BOARD_LAYOUT.card.headlineMin));
    }
  }
});
