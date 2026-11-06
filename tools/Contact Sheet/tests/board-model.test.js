import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { wcag, validateBrandBoards } from '../scripts/brand-boards.js';
import { BRAND_BOARD_CSS } from '../scripts/brand-board-style.js';
import { renderBrandBoards } from '../scripts/brand-board-view.js';
import { BOARD_LAYOUT, createBoardModel, DEFAULT_MARK_CAPTION, PUBLIC_FONT_FILES } from '../scripts/board-model.js';
import { fitBoardThumbnails } from '../scripts/board-thumbnail.js';

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
      assert.ok(m.tile.every(v=>v.kind==='row'));
      assert.deepEqual(m.tile.flatMap(v=>v.blocks),m.blocks);
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
  assert.equal(Object.keys(library.fonts).length,19);
  for(const family of Object.keys(library.fonts))assert.ok(PUBLIC_FONT_FILES[family],family);
  for (const [family, meta] of Object.entries(library.fonts)) {
    const files = PUBLIC_FONT_FILES[family];
    assert.ok(files.length, family);
    for (const f of files) {
      assert.match(f.url, /^https:\/\/(fonts\.gstatic\.com|cdn\.jsdelivr\.net)\/\S+\.woff2$/);
      assert.equal(f.style, 'normal');
      // Each URL answered HEAD 200, font/woff2, on its verified date; the second
      // date's entries are the library's own public references for its files.
      assert.ok(['2026-10-29', '2026-11-05'].includes(f.verified), `${family} ${f.url}`);
      if (f.verified === '2026-11-05') assert.ok(meta.files.some((file) => file.gstaticUrl === f.url), f.url);
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

test('Existing full-view bytes survive the thumbnail change', () => {
  const spec = fixture(); spec.showChecks = true;
  for (const b of spec.boards) {
    b.content.markCaption = 'The monogram is a placeholder, not a logo. The real mark is drawn after a board is locked.';
    b.content.closing = 'What would you keep, and what would you change?';
  }
  // Recorded from the pre-extraction page writer. Restore the old words above;
  // exclude only the stylesheet, whose card geometry is intentionally changing.
  const html = renderBrandBoards(validate(spec));
  const wholes = html.slice(html.indexOf('<section class="whole-view"'));
  assert.equal(createHash('sha256').update(wholes).digest('hex'), '25031fb4fff5586db080fa0917caa740ca70fe3ac6b8a4a139212f3b7c22ce35');
});

test('Own-page thumbnails contain every full section once in two balanced columns without clipping, in either mode and width',async t=>{
  const {launch}=await import('../../lib/browser-runtime/browser-runtime.js');
  const browser=await launch({headless:true});t.after(()=>browser.close());
  const page=await browser.newPage();await page.route('**/*',route=>route.abort());
  for(const width of [734,390])for(const mode of ['light','dark']){
    const spec=fixture();for(const b of spec.boards)b.primaryMode=mode;
    await page.evaluate(()=>{location.hash='';});
    await page.setViewportSize({width,height:900});await page.setContent(renderBrandBoards(validate(spec)));
    await page.evaluate(()=>document.fonts.ready);
    const thumbs=await page.locator('.board-thumbnail').evaluateAll(nodes=>nodes.map(n=>{
      const b=n.querySelector('.brand-board'),r=n.getBoundingClientRect();
      const rows=[...b.querySelectorAll('.board-row')].map(s=>{const box=s.getBoundingClientRect();return {x:box.x-r.x,y:box.y-r.y,right:box.right-r.x,bottom:box.bottom-r.y};});
      const walker=document.createTreeWalker(b,NodeFilter.SHOW_TEXT),clipped=[];
      while(walker.nextNode()){
        const text=walker.currentNode;if(!text.textContent.trim())continue;
        const range=document.createRange();range.selectNode(text);
        if([...range.getClientRects()].some(box=>box.left<r.left-.5||box.right>r.right+.5||box.top<r.top-.5||box.bottom>r.bottom+.5))clipped.push(text.textContent.slice(0,60));
      }
      return {columns:b.querySelectorAll('.thumbnail-column').length,mode:b.dataset.mode,boards:n.querySelectorAll('.brand-board').length,
        sections:[...b.querySelectorAll('section')].map(n=>n.className),rows,clipped,width:r.width,height:r.height,href:n.getAttribute('href'),name:n.getAttribute('aria-label')};
    }));
    assert.equal(thumbs.length,spec.boards.length);
    for(const b of thumbs){
      assert.equal(b.columns,2);assert.equal(b.mode,mode);assert.equal(b.boards,1);
      for(const name of ['brand-hero','palette','face-sample heading-face','face-sample body-face','graphic-language','items','banner-section','other-mode','rules'])assert.equal(b.sections.filter(s=>s===name).length,1,name);
      assert.ok(b.rows.some(r=>r.x>b.width/2),JSON.stringify(b));
      assert.ok(b.rows.every(r=>r.x>=0&&r.y>=0&&r.right<=b.width+1&&r.bottom<=b.height+1),JSON.stringify(b));
      assert.deepEqual(b.clipped,[]);
      assert.match(b.name,/Open the whole board:/);assert.match(b.href,/^#whole-/);
    }
    await page.locator('.board-thumbnail').first().click();
    assert.equal(await page.locator('.whole-view:visible').count(),1);
  }
});

test('Own-page patches share optimal section splits, badge priority and ordered real-size colours in both modes',async t=>{
  const {launch}=await import('../../lib/browser-runtime/browser-runtime.js');
  const browser=await launch({headless:true});t.after(()=>browser.close());
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>route.abort());
  for(const width of [734,390])for(const mode of ['light','dark']){
    const spec=fixture();for(const b of spec.boards)b.primaryMode=mode;
    await page.setViewportSize({width,height:900});await page.setContent(renderBrandBoards(validate(spec)));
    await page.evaluate(()=>document.fonts.ready);
    const boards=await page.locator('.board-option').evaluateAll(nodes=>nodes.map(n=>{
      const surface=n.querySelector('.thumbnail-surface');if(!surface)return null;
      const board=surface.querySelector('.brand-board'),columns=[...board.querySelectorAll('.thumbnail-column')],rows=columns.flatMap(c=>[...c.children]);
      const scale=board.getBoundingClientRect().width/board.offsetWidth,gap=parseFloat(getComputedStyle(columns[0]).gap)*scale;
      const patch=surface.querySelector('.thumbnail-patch'),badge=n.querySelector('.thumbnail-badge'),box=patch.getBoundingClientRect();
      return {heights:rows.map(n=>n.getBoundingClientRect().height),gap,split:columns[0].children.length,
        height:surface.getBoundingClientRect().height,boardHeight:board.getBoundingClientRect().height,
        swatches:[...patch.querySelectorAll('.thumbnail-swatch')].map(s=>({key:s.dataset.swatch,value:s.dataset.colour,shown:!s.hidden,width:s.getBoundingClientRect().width,height:s.getBoundingClientRect().height})),
        badge:badge?{inPatch:patch.contains(badge),inCaption:!!n.querySelector('.board-meta .recommendation b'),width:badge.getBoundingClientRect().width,height:badge.getBoundingClientRect().height}:null,
        patch:{width:box.width,height:box.height},reason:n.querySelector('.recommendation-reason')?.textContent};
    }));
    for(const [i,b]of boards.entries()){
      assert.ok(b,'own-page has the same patch');assert.equal(b.height,b.boardHeight);
      const height=(from,to)=>b.heights.slice(from,to).reduce((s,h)=>s+h,0)+b.gap*Math.max(0,to-from-1);
      const differences=b.heights.slice(1).map((_,i)=>Math.abs(height(0,i+1)-height(i+1,b.heights.length)));
      assert.ok(Math.abs(height(0,b.split)-height(b.split,b.heights.length))<=Math.min(...differences)+.5);
      assert.deepEqual(b.swatches.map(s=>s.key),['panel','pop','deep']);
      assert.deepEqual(b.swatches.map(s=>s.value),['panel','pop','deep'].map(k=>spec.boards[i].palette[mode][k]));
      const shown=b.swatches.filter(s=>s.shown);assert.deepEqual(shown,b.swatches.slice(0,shown.length));
      assert.ok(shown.every(s=>s.width===24&&s.height===20));
      if(b.badge){assert.equal(b.reason,spec.boards[i].recommendation);assert.equal(b.badge.inCaption,!b.badge.inPatch);
        if(b.patch.width>=b.badge.width&&b.patch.height>=b.badge.height)assert.ok(b.badge.inPatch);
      }
    }
  }
  assert.deepEqual(errors,[]);
});

test('Own-page small patches return the badge to metadata and retain only the swatch prefix that fits',async t=>{
  const {launch}=await import('../../lib/browser-runtime/browser-runtime.js');
  const browser=await launch({headless:true});t.after(()=>browser.close());
  const page=await browser.newPage();await page.route('**/*',route=>route.abort());
  const spec=fixture();spec.boards[0].recommendation='Existing recommendation reason.';
  await page.setContent(renderBrandBoards(validate(spec)));await page.evaluate(()=>document.fonts.ready);
  for(const [pixels,width,badge,swatches]of [[100,350,true,3],[40,350,true,0],[10,350,false,0],[100,120,false,1],[100,180,false,2],[100,350,true,3]]){
    await page.locator('.board-option').first().evaluate((n,{pixels,width})=>{
      const surface=n.querySelector('.thumbnail-surface'),board=surface.querySelector('.brand-board'),cols=[...board.querySelectorAll('.thumbnail-column')],rows=cols.flatMap(c=>[...c.children]);
      rows.slice(3).forEach(n=>n.remove());rows.slice(0,3).forEach(n=>{n.replaceChildren();n.style.height='100px';});
      surface.style.width=width+'px';const scale=board.getBoundingClientRect().width/board.offsetWidth;
      rows[2].style.height=(224+pixels/scale)+'px';
    },{pixels,width});
    await page.evaluate(fitBoardThumbnails);
    const tile=page.locator('.board-option').first();
    assert.equal(await tile.locator('.thumbnail-patch .thumbnail-badge').count(),Number(badge));
    assert.equal(await tile.locator('.board-meta .recommendation b').count(),Number(!badge));
    assert.equal(await tile.locator('.recommendation-reason').textContent(),spec.boards[0].recommendation);
    assert.deepEqual(await tile.locator('.thumbnail-swatch:not([hidden])').evaluateAll(ns=>ns.map(n=>n.dataset.swatch)),['panel','pop','deep'].slice(0,swatches));
  }
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

test('Board link focus uses reading ink with at least 3:1 against the ground in both modes',()=>{
  assert.match(BRAND_BOARD_CSS,/\.board-button:focus-visible\{outline:3px solid var\(--text\);outline-offset:4px\}/);
  const library=JSON.parse(readFileSync(new URL('../../../skills/Build Brand/parts/parts.json',import.meta.url)));
  let oldFailures=0;
  for(const palette of library.palettes) for(const mode of ['light','dark']) {
    const c=palette[mode];if(wcag(c.onPop,c.ground)<3)oldFailures++;
    assert.ok(wcag(c.text,c.ground)>=3,`${palette.id}/${mode}`);
  }
  assert.ok(oldFailures>0,'the original currentColor outline must fail on these grounds');
});
test('Simple caption is rendered in both modes and ordinary boards keep the lock caption',()=>{
  const spec=fixture(),caption='These initials hold the place of a logo. Ask for a logo any time.';
  spec.boards[0].content.markCaption=caption;
  const valid=validate(spec),model=createBoardModel(valid),html=renderBrandBoards(valid);
  assert.equal(model.boards[0].markCaption,caption);assert.ok(html.split(caption).length>=3);
  assert.equal(createBoardModel(validate(fixture())).boards[0].markCaption,DEFAULT_MARK_CAPTION);assert.ok(html.includes(DEFAULT_MARK_CAPTION));
});
