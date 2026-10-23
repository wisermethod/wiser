import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { closeSync, copyFileSync, existsSync, ftruncateSync, linkSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT, 'scripts/contact-sheet.js');
const FIXTURES = join(ROOT, 'tests/fixtures');

function temp(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'contact-sheet-test-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function run(args, cwd = ROOT) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', cwd });
  assert.ifError(result.error);
  return result;
}

function success(result) {
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  const reply = JSON.parse(result.stdout);
  assert.equal(result.stdout.trim().split('\n').length, 1);
  return reply;
}

function refusal(result, pattern) {
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.stdout, '');
  const reply = JSON.parse(result.stderr);
  assert.deepEqual(Object.keys(reply), ['error']);
  assert.match(reply.error, pattern);
  return reply;
}

function minimal() {
  return { layout: 'pick', title: 'Options', items: [{ kind: 'text', label: 'One', text: 'A short passage.' }] };
}

function fixture(name) {
  const spec = JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));
  if (spec.layout === 'board') {
    for (const board of spec.boards) {
      for (const face of Object.values(board.type)) for (const file of face.files) file.path = join(FIXTURES, file.path);
      if (board.monogram.file) board.monogram.file = join(FIXTURES, board.monogram.file);
    }
    return spec;
  }
  for (const item of [...spec.items, ...(spec.typeSamples || [])]) {
    if (item.kind === 'image') item.file = join(FIXTURES, item.file);
    for (const key of ['heading', 'body']) {
      if (item[key]) item[key].file = join(FIXTURES, item[key].file);
    }
  }
  return spec;
}

function build(dir, spec, name = 'page.html') {
  const specPath = join(dir, 'spec.json');
  const output = join(dir, name);
  writeFileSync(specPath, JSON.stringify(spec));
  return { result: run(['build', '--spec', specPath, '--output', output]), output };
}

test('10. Identical inputs produce byte-identical HTML at different destinations and working directories', (t) => {
  const dir = temp(t);
  const spec = join(FIXTURES, 'pick.json');
  const first = success(run(['build', '--spec', spec, '--output', join(dir, 'one.html')]));
  const second = success(run(['build', '--spec', spec, '--output', join(dir, 'two.html')], dir));
  assert.deepEqual(readFileSync(first.output), readFileSync(second.output));
  assert.equal(first.bytes, statSync(first.output).size);
  assert.equal(first.bytes, second.bytes);
  assert.deepEqual(first.embedded, second.embedded);
});

test('11. Pick contains only embedded resource references and no active markup', (t) => {
  const dir = temp(t);
  for (const layout of ['pick']) {
    const reply = success(run(['build', '--spec', join(FIXTURES, `${layout}.json`), '--output', join(dir, `${layout}.html`)]));
    const html = readFileSync(reply.output, 'utf8');
    assert.doesNotMatch(html, /https?:\/\/|<script|<link|@import/i);
    assert.doesNotMatch(html.replace(/url\("data:[^"]+"\)/g, ''), /url\(/i);
    for (const match of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) assert.match(match[1], /^data:/);
    assert.doesNotMatch(html, /\bhref=/);
    assert.match(html, /default-src 'none'/);
    assert.match(html, /https&#58;\/\/example.invalid\/reference/);
    const uris = [...html.matchAll(/data:([^;]+);base64,([A-Za-z0-9+/=]+)/g)];
    assert.ok(uris.length >= 3);
    const font = uris.find((m) => m[1] === 'font/ttf');
    assert.deepEqual(Buffer.from(font[2], 'base64'), readFileSync(join(FIXTURES, 'fixture.ttf')));
  }
});

test('12. Labels holding <b> and & appear escaped, including hostile closing tags', (t) => {
  const dir = temp(t);
  const spec = minimal();
  spec.title = 'Title <b> & more';
  spec.items[0].label = '<b> & "label" </style><script>alert(1)</script>';
  spec.items[0].note = '<img src="https://example.invalid/x"> @import url(x)';
  const reply = success(build(dir, spec).result);
  const html = readFileSync(reply.output, 'utf8');
  assert.match(html, /&lt;b&gt; &amp; &quot;label&quot;/);
  assert.match(html, /&lt;\/style&gt;&lt;script&gt;/);
  assert.match(html, /Title &lt;b&gt; &amp; more/);
  assert.doesNotMatch(html, /<b>|<script|<img|https:\/\/|@import|url\(x\)/i);
});

test('13. Three recommendations are refused with a JSON error and no output', (t) => {
  const dir = temp(t);
  const spec = minimal();
  spec.items = Array.from({ length: 3 }, (_, i) => ({ kind: 'text', label: `Option ${i}`, text: 'Words.', recommended: true, reason: 'Fits your stated direction.' }));
  const { result, output } = build(dir, spec);
  refusal(result, /at most two.*choice open/i);
  assert.equal(existsSync(output), false);
});

test('14. A missing image is refused without creating output', (t) => {
  const dir = temp(t);
  const spec = minimal();
  spec.items = [{ kind: 'image', label: 'Missing', file: 'absent.png', alt: 'Missing image' }];
  const { result, output } = build(dir, spec);
  refusal(result, /No readable file.*absent.png/);
  assert.equal(existsSync(output), false);
});

test('15. A 200-character label with an unbroken run has wrapping CSS and responsive grid tracks', (t) => {
  const dir = temp(t);
  const spec = minimal();
  spec.items[0].label = 'x'.repeat(200);
  spec.items[0].note = 'y'.repeat(200);
  const reply = success(build(dir, spec).result);
  const html = readFileSync(reply.output, 'utf8');
  assert.match(html, /class="card"/);
  assert.match(html, /\.card\{[^}]*min-width:0[^}]*overflow-wrap:anywhere/);
  assert.match(html, /\.card h2,\.card p,\.card small\{[^}]*overflow-wrap:anywhere/);
  assert.match(html, /@media\(max-width:560px\)[^\n]*grid-template-columns:minmax\(0,1fr\)/);
  assert.ok(html.includes('x'.repeat(200)));
  assert.ok(html.includes('y'.repeat(200)));
});

test('16. Each pick kind builds from the licensed image/font fixtures', (t) => {
  const dir = temp(t);
  for (const layout of ['pick']) {
    const reply = success(run(['build', '--spec', join(FIXTURES, `${layout}.json`), '--output', join(dir, `${layout}.html`)]));
    assert.equal(reply.itemCount, 6);
    assert.equal(reply.bytes, readFileSync(reply.output).length);
    assert.deepEqual(reply.embedded, ['tiny.png', 'tiny.svg', 'fixture.ttf'].map((name) => ({ path: realpathSync(join(FIXTURES, name)), bytes: statSync(join(FIXTURES, name)).size })));
    const html = readFileSync(reply.output, 'utf8');
    for (let i = 1; i <= 6; i += 1) assert.ok(html.includes(`id="item-${i}"`));
    for (const kind of ['image/png', 'image/svg+xml', 'font/ttf']) assert.ok(html.includes(`data:${kind};base64,`));
    assert.match(html, /A heading in use/);
    assert.match(html, /class="button-sample"/);
    assert.match(html, /font-family:cs-font-3/);
    assert.match(html, /Licence: CC0/);
    assert.match(html, /The work speaks clearly\./);
    assert.doesNotMatch(html, /selected|checked|tabindex|<input|<button/i);
    if (layout === 'pick') {
      assert.equal((html.match(/class="card"/g) || []).length, 6);
      assert.equal((html.match(/<strong>Recommended<\/strong>/g) || []).length, 1);
      assert.match(html, /Reflects your quiet direction/);
      assert.ok(html.indexOf('class="closing"') > html.indexOf('id="item-6"'));
    }
  }
});

test('17. Help needs no configuration; unknown flags, repeated flags and missing values are refused', () => {
  for (const args of [[], ['help'], ['--help'], ['build', '--help'], ['build', 'help']]) {
    const result = run(args);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /--spec/);
    assert.match(result.stdout, /--output/);
    assert.equal(result.stderr, '');
  }
  for (const args of [['help', '--surprise'], ['build', '--help', '--surprise'], ['build', '--install'], ['build', '--env', '/missing'], ['dance'], ['build', '--spec'], ['build', '--output', '-x'], ['build', '--spec', '/x', '--spec', '/y'], ['build', 'extra'], ['build']]) {
    refusal(run(args), /help/);
  }
  refusal(run(['build', '--spec', '--unknown']), /Unknown option "--unknown"/);
  refusal(run(['--install']), /Unknown option "--install"/);
  assert.equal(existsSync(join(ROOT, 'node_modules')), false);
});

test('18. Importing the entry point does not invoke main or print anything', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(pathToFileURL(SCRIPT).href)})`], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});

test('19. Invalid JSON, duplicate keys, unused fields and invalid layout/item types are refused', (t) => {
  const dir = temp(t);
  for (const contents of ['{', '{"layout":"pick","layout":"board"}', '{"layout":"pick","title":"x","items":[{"kind":"text","kind":"image"}]}']) {
    const path = join(dir, 'bad.json');
    writeFileSync(path, contents);
    refusal(run(['build', '--spec', path, '--output', join(dir, 'page.html')]), /JSON|repeats field/);
  }
  for (const mutate of [
    (s) => { s.extra = true; }, (s) => { s.layout = 'other'; }, (s) => { s.items = []; },
    (s) => { s.items[0].kind = 'constructor'; }, (s) => { s.items[0].text = null; },
    (s) => { s.items[0].recommended = 'true'; }, (s) => { s.items[0].reason = 'Unused'; },
    (s) => { s.items[0].recommended = true; }, (s) => { s.intro = 'Two\nparagraphs'; }
  ]) {
    const spec = minimal(); mutate(spec);
    const { result, output } = build(dir, spec);
    refusal(result, /spec|reason|field/);
    assert.equal(existsSync(output), false);
  }
});

test('20. Sources resolve against the real spec directory, including through a spec symlink', (t) => {
  const dir = temp(t);
  mkdirSync(join(dir, 'assets'));
  copyFileSync(join(FIXTURES, 'tiny.png'), join(dir, 'assets', 'tiny.png'));
  const spec = minimal();
  spec.items = [{ kind: 'image', label: 'Relative', file: 'tiny.png', alt: 'Tiny colours' }];
  writeFileSync(join(dir, 'assets', 'spec.json'), JSON.stringify(spec));
  symlinkSync(join(dir, 'assets', 'spec.json'), join(dir, 'linked.json'));
  const reply = success(run(['build', '--spec', join(dir, 'linked.json'), '--output', join(dir, 'page.html')]));
  assert.equal(reply.embedded[0].path, join(dir, 'assets', 'tiny.png'));
});

test('21. Output screening refuses tool paths, links into the tool and occupied hard links', (t) => {
  const dir = temp(t);
  const spec = join(dir, 'spec.json');
  writeFileSync(spec, JSON.stringify(minimal()));
  symlinkSync(ROOT, join(dir, 'tool-link'));
  for (const output of [join(ROOT, 'forbidden.html'), join(dir, 'tool-link', 'new-folder', 'forbidden.html')]) {
    refusal(run(['build', '--spec', spec, '--output', output]), /inside this tool/);
    assert.equal(existsSync(output), false);
  }
  const occupied = join(dir, 'occupied.html');
  linkSync(spec, occupied);
  refusal(run(['build', '--spec', spec, '--output', occupied]), /already exists/);
  assert.equal(readFileSync(occupied, 'utf8'), JSON.stringify(minimal()));
  symlinkSync(join(dir, 'missing'), join(dir, 'broken'));
  refusal(run(['build', '--spec', spec, '--output', join(dir, 'broken', 'page.html')]), /broken.*symbolic link/);
});

test('22. Oversized embedding is refused before output, including base64 expansion and repeated images', (t) => {
  const dir = temp(t);
  const large = join(dir, 'large.png');
  const fd = openSync(large, 'wx');
  ftruncateSync(fd, 16 * 1024 * 1024); closeSync(fd);
  const spec = minimal();
  spec.items = Array.from({ length: 2 }, () => ({ kind: 'image', file: large, label: 'Large', alt: 'A large image' }));
  const { result, output } = build(dir, spec);
  refusal(result, /40 MB.*tools\/image\//);
  assert.equal(existsSync(output), false);
  // Exactly 40,000,000 base64 bytes still need space for HTML and data prefixes.
  // The format signature is valid so this reaches the final page-size check.
  const boundary = join(dir, 'boundary.png');
  const boundaryFd = openSync(boundary, 'wx');
  writeSync(boundaryFd, readFileSync(join(FIXTURES, 'tiny.png')));
  ftruncateSync(boundaryFd, 30_000_000); closeSync(boundaryFd);
  spec.items = [{ kind: 'image', file: boundary, label: 'At the boundary', alt: 'Boundary image' }];
  refusal(build(dir, spec).result, /40 MB.*tools\/image\//);
  assert.equal(existsSync(output), false);
});

test('23. Markup alone over the limit is refused before output', (t) => {
  const dir = temp(t);
  const spec = minimal();
  spec.items[0].text = 'x'.repeat(40 * 1024 * 1024);
  const { result, output } = build(dir, spec);
  refusal(result, /40 MB.*tools\/image\//);
  assert.equal(existsSync(output), false);
});

test('24. SVG active content, external resources and obfuscated references are refused', (t) => {
  const dir = temp(t);
  const bad = [
    '<script>alert(1)</script>', '<style>@import "https://example.invalid/x";</style>',
    '<use href="relative.svg#x"/>', '<use href="https&#58;//example.invalid/x"/>',
    '<rect style="fill:red"/>', '<rect onload="alert(1)"/>', '<foreignObject/>',
    '<rect fill="url(https://example.invalid/x)"/>', '<rect fill="u\\72l(x)"/>',
    '<animate attributeName="href" values="x"/>', '<image href="data:image/png;base64,AAAA"/>'
  ];
  for (const content of bad) {
    writeFileSync(join(dir, 'unsafe.svg'), `<svg xmlns="http://www.w3.org/2000/svg">${content}</svg>`);
    const spec = minimal();
    spec.items = [{ kind: 'image', label: 'Unsafe', file: 'unsafe.svg', alt: 'Unsafe SVG' }];
    const { result, output } = build(dir, spec);
    refusal(result, /SVG/);
    assert.equal(existsSync(output), false);
  }
});

test('25. Invalid colours, absent sample roles, licence gaps and absent alt text are refused', (t) => {
  const dir = temp(t);
  for (const mutate of [
    (s) => { s.items[0].alt = ''; }, (s) => { delete s.items[5].heading.licence; },
    (s) => { s.items[3].colors[0].value = '#fff; background:url(x)'; },
    (s) => { s.items[3].colors[0].share = 10; },
    (s) => { s.items[3].sample.accent = 'Absent'; },
    (s) => { s.items[3].colors[1].name = s.items[3].colors[0].name; }
  ]) {
    const spec = fixture('pick.json'); mutate(spec);
    const { result, output } = build(dir, spec);
    refusal(result, /alt|licence|colour|share|percent|sample/);
    assert.equal(existsSync(output), false);
  }
});

test('27. A third varied input builds a minimal text-only pick without inferred recommendations', (t) => {
  const dir = temp(t);
  const reply = success(build(dir, minimal()).result);
  assert.equal(reply.itemCount, 1);
  assert.deepEqual(reply.embedded, []);
  const html = readFileSync(reply.output, 'utf8');
  assert.doesNotMatch(html, /<strong>Recommended/);
  assert.match(html, /A short passage\./);
});

function brandFixture() { return fixture('brand-boards.json'); }
function brandRefusal(t, mutate, pattern) {
  const dir = temp(t), spec = brandFixture();
  mutate(spec, dir);
  const { result, output } = build(dir, spec);
  const error = refusal(result, pattern);
  assert.equal(existsSync(output), false);
  return error.error;
}

test('28. Brand boards render names before tiles, ordered groups, whole links and both complete modes', (t) => {
  const dir = temp(t), spec = brandFixture();
  const reply = success(build(dir, spec).result);
  assert.equal(reply.itemCount, 3);
  assert.equal(reply.boards.length, 3);
  assert.equal(reply.bytes, statSync(reply.output).size);
  const html = readFileSync(reply.output, 'utf8');
  assert.match(html, /\{OvO\} Wiser · Brand boards for Sample Person/);
  assert.ok(html.indexOf('Familiar starting points') < html.indexOf('A different setting'));
  assert.match(html, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(html, /@media\(max-width:900px\)\{\.boards-grid\{grid-template-columns:minmax\(0,1fr\)/);
  assert.equal((html.match(/<footer class="page-foot">/g) || []).length, 1);
  assert.equal((html.match(/<b>Recommended<\/b>/g) || []).length, 2); // tile and its whole-view metadata
  const openLinks = [...html.matchAll(/class="board-button" href="#(whole-\d+)"/g)];
  assert.equal(openLinks.length, 3);
  for (const [i, b] of spec.boards.entries()) {
    const tile = html.indexOf(`data-board="${b.number}"`);
    assert.ok(html.indexOf(b.name) < tile);
    assert.ok(html.indexOf(b.energy) < tile);
    assert.ok(html.indexOf(b.why) < tile);
    assert.match(html, new RegExp(`id="${openLinks[i][1]}"`));
    const whole = html.slice(html.indexOf(`id="whole-${b.number}"`), i < 2 ? html.indexOf(`id="whole-${b.number + 1}"`) : undefined);
    assert.match(whole, /href="#all-boards"/);
    for (const mode of ['light', 'dark']) assert.ok(whole.includes(`data-board="${b.number}" data-mode="${mode}"`));
    assert.ok(whole.indexOf(`data-mode="${b.primaryMode}"`) < whole.indexOf(`data-mode="${b.primaryMode === 'light' ? 'dark' : 'light'}"`));
    for (const words of ['Social banner', 'Business card · front and back', 'Graphic language', 'Photo rules', 'Never', 'profile picture to browser tab', 'Licence: CC0', 'Contrast results', 'What would you keep, and what would you change?']) assert.ok(whole.includes(words), words);
    const reports = reply.boards[i].checks;
    assert.ok(reports.length >= 40);
    for (const check of reports) {
      assert.ok(Number.isFinite(check.wcag));
      if (Object.hasOwn(check, 'need')) assert.ok(check.wcag >= check.need);
      if (check.pairing.startsWith('button')) {
        assert.equal(check.need, 4.5); assert.equal(check.apcaNeed, 60);
        assert.ok(Math.abs(check.apcaLc) >= check.apcaNeed);
      }
    }
  }
  const ownMark = html.slice(html.indexOf('id="whole-2"'), html.indexOf('id="whole-3"'));
  assert.doesNotMatch(ownMark, /class="monogram"|The monogram is a placeholder/);
  assert.match(ownMark, /class="own-mark"/);
  assert.match(html, /The monogram is a placeholder, not a logo/);
  assert.equal(reply.embedded.length, 2);
});

test('29. Brand boards are byte-identical at another destination and working directory', (t) => {
  const dir = temp(t), spec = join(FIXTURES, 'brand-boards.json');
  const first = success(run(['build', '--spec', spec, '--output', join(dir, 'one.html')]));
  const second = success(run(['build', '--spec', spec, '--output', join(dir, 'two.html')], dir));
  assert.deepEqual(readFileSync(first.output), readFileSync(second.output));
  assert.deepEqual(first.boards, second.boards);
  assert.deepEqual(first.embedded, second.embedded);
});

test('30. Brand output embeds fonts and SVGs with no scripts, handlers or outward references', (t) => {
  const dir = temp(t), spec = brandFixture();
  spec.boards[0].content.body = '<script onload="evil()"> https://example.invalid @import';
  const reply = success(build(dir, spec).result), html = readFileSync(reply.output, 'utf8');
  assert.doesNotMatch(html, /<script|<link|@import|https?:\/\//i);
  assert.doesNotMatch(html, /<[a-z][^>]*\son[a-z]+\s*=/i);
  for (const m of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) assert.match(m[1], /^(?:data:|#)/);
  assert.doesNotMatch(html.replace(/url\(["']data:[^"']+["']\)/g, ''), /url\(/i);
  const uris = [...html.matchAll(/data:([^;]+);base64,([A-Za-z0-9+/=]+)/g)];
  assert.ok(uris.length > 10);
  for (const uri of uris.filter((m) => m[1] === 'image/svg+xml')) {
    const svg = Buffer.from(uri[2], 'base64').toString();
    assert.doesNotMatch(svg, /<script|\son[a-z]+\s*=|href=["'](?!#)|\{\{|currentColor/i);
  }
  const font = uris.find((m) => m[1] === 'font/ttf');
  assert.deepEqual(Buffer.from(font[2], 'base64'), readFileSync(join(FIXTURES, 'fixture.ttf')));
  assert.match(html, /default-src 'none'/);
});

test('31. Type-to-colour mismatches refuse the whole page and identify every failing board', (t) => {
  const error = brandRefusal(t, (s) => {
    s.boards[0].tags = { paletteLoudness: 3, typeLoudness: 1, typeCut: 'contemporary' };
    s.boards[1].tags = { paletteLoudness: 3, typeLoudness: 2, typeCut: 'period' };
    s.boards[2].palette.dark.smallPrint = s.boards[2].palette.dark.ground;
  }, /type-to-colour mismatch/);
  for (const name of ['Useful Objects', 'Daily Practice', 'Late Edition']) assert.ok(error.includes(name));
  assert.match(error, /dark small print/);
});

test('32. A text pairing below 4.5 is refused in either mode, including card surfaces', (t) => {
  for (const mode of ['light', 'dark']) for (const [foreground, background] of [['text', 'ground'], ['smallPrint', 'panel'], ['cardFrontText', 'cardFront'], ['cardFrontSmallPrint', 'cardFront'], ['cardBackText', 'cardBack']]) {
    brandRefusal(t, (s) => { s.boards[0].palette[mode][foreground] = s.boards[0].palette[mode][background]; }, /WCAG.*< 4.5/);
  }
});

test('33. A button passing WCAG but failing APCA is refused', async (t) => {
  const { wcag, apca } = await import('../scripts/brand-boards.js');
  const fg = '#101010', bg = '#ee8422';
  assert.ok(wcag(fg, bg) > 4.5); assert.ok(Math.abs(apca(fg, bg)) < 60);
  const error = brandRefusal(t, (s) => { Object.assign(s.boards[0].palette.light, { onPop: fg, pop: bg }); }, /APCA.*< 60/);
  assert.doesNotMatch(error, /button text.*WCAG/);
});

test('34. A button passing APCA but failing WCAG is refused', async (t) => {
  const { wcag, apca } = await import('../scripts/brand-boards.js');
  const fg = '#fafafa', bg = '#da6464';
  assert.ok(Math.abs(apca(fg, bg)) > 60); assert.ok(wcag(fg, bg) < 4.5);
  const error = brandRefusal(t, (s) => { Object.assign(s.boards[1].palette.dark, { onPop: fg, pop: bg }); }, /button text.*WCAG.*< 4.5/);
  assert.doesNotMatch(error, /button text.*APCA/);
});

test('35. Every font file and every face licence are checked before writing', (t) => {
  const error = brandRefusal(t, (s, dir) => {
    s.boards[0].type.heading.files[0].path = join(dir, 'absent.ttf');
    delete s.boards[1].type.body.licence;
    const bad = join(dir, 'not-font.ttf'); writeFileSync(bad, 'Not a font file.');
    s.boards[2].type.heading.files[0].path = bad;
  }, /absent.ttf/);
  assert.match(error, /Daily Practice.*licence/);
  assert.match(error, /Late Edition.*signature/);
});

test('36. Supplied SVG script, handler and outward references are refused in every drawing slot', (t) => {
  for (const slot of ['hero', 'pattern', 'texture', 'container', 'file']) {
    for (const hostile of ['<script>bad()</script>', '<path onload="bad()"/>', '<use href="other.svg#item"/>']) {
      brandRefusal(t, (s, dir) => {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg">${hostile}</svg>`;
        if (slot === 'container') s.boards[0].monogram.container = svg;
        else if (slot === 'file') { const path = join(dir, 'unsafe.svg'); writeFileSync(path, svg); s.boards[1].monogram.file = path; }
        else s.boards[0].graphics[slot].svg = svg;
      }, /SVG/);
    }
  }
});

test('37. A single brand board is whole without a tile and board zero is first', (t) => {
  const dir = temp(t), single = brandFixture();
  single.boards = [single.boards[2]]; single.groups = [single.groups[1]];
  const one = success(build(dir, single, 'single.html').result), html = readFileSync(one.output, 'utf8');
  assert.doesNotMatch(html, /class="brand-board tile"|Open the whole board/);
  assert.equal((html.match(/class="whole-view"/g) || []).length, 1);
  assert.equal((html.match(/data-mode="(?:light|dark)"/g) || []).length, 2);
  const many = brandFixture(); many.boards[2].number = 0; many.boards[2].zero = true;
  many.boards[2].group = many.groups[0].id; many.groups = [many.groups[0]];
  const two = success(build(dir, many, 'zero.html').result), page = readFileSync(two.output, 'utf8');
  assert.ok(page.indexOf('data-board="0"') < page.indexOf('data-board="1"'));
  assert.match(page, /Your brand as it is today · Board zero/);
});

test('38. Brand schema rejects silent drops, invalid shares, missing roles and unsafe drawing ink', (t) => {
  for (const mutate of [
    (s) => { s.extra = true; }, (s) => { s.intro.pop(); },
    (s) => { s.boards[0].extra = true; }, (s) => { s.boards[0].palette.swatches[0].share = 1; },
    (s) => { delete s.boards[0].palette.dark.onPop; }, (s) => { s.boards[0].buttonRadius = '7; url(x)'; },
    (s) => { s.boards[0].type.heading.variations = { 'evil"': 20 }; },
    (s) => { s.boards[0].monogram.file = join(FIXTURES, 'tiny.svg'); },
    (s) => { s.boards[0].graphics.hero.phrase = 'absent'; },
    (s) => { s.boards[0].graphics.hero.svg = '<svg><rect fill="red"/></svg>'; }
  ]) brandRefusal(t, mutate, /field|intro|share|colour|number|axis|replaces|phrase|SVG/);
});

test('39. Brand markup over 40 MB is refused before opening the output', (t) => {
  brandRefusal(t, (s) => { s.boards[0].content.body = 'q'.repeat(9_000_000); }, /40 MB.*tools\/image\//);
});

test('40. A small-text pairing between 3 and 4.5 still fails the 4.5 requirement', async (t) => {
  const { wcag } = await import('../scripts/brand-boards.js');
  const ratio = wcag('#777779', '#fdfcff');
  assert.ok(ratio > 3 && ratio < 4.5);
  brandRefusal(t, (s) => { s.boards[0].palette.light.smallPrint = '#777779'; }, /light small print.*WCAG.*< 4.5/);
});

test('41. Hero placement and role ink, margin notes, weights and axis settings reach the page', (t) => {
  const dir = temp(t), spec = brandFixture(), board = spec.boards[0];
  board.graphics.hero = { placement: 'monogram', svg: '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="none" stroke="{{mark}}" stroke-width="2"/></svg>' };
  board.type.heading.variations = { wght: 400 };
  board.type.heading.files[0].weight = [400, 700];
  board.type.heading.weights = [400, 700];
  const reply = success(build(dir, spec).result), html = readFileSync(reply.output, 'utf8');
  assert.match(html, /class="hero-monogram"/);
  assert.match(html, /class="hero-frame"/);
  assert.match(html, /class="margin-note"[^>]*font-family:bb-1-handwriting/);
  assert.match(html, /font-weight:400 700/);
  assert.match(html, /font-variation-settings:&quot;wght&quot; 400/);
  assert.match(html, /Weights 400, 700/);
  assert.ok(reply.boards[0].checks.some((c) => c.pairing === 'hero role mark'));
});

test('42. A font signature alone cannot masquerade as a complete font file', (t) => {
  for (const [ext, signature] of [['ttf', Buffer.from([0, 1, 0, 0])], ['otf', Buffer.from('OTTO')], ['woff', Buffer.from('wOFF')], ['woff2', Buffer.from('wOF2')]]) {
    brandRefusal(t, (s, dir) => {
      const path = join(dir, `truncated.${ext}`); writeFileSync(path, signature);
      s.boards[0].type.heading.files[0].path = path;
    }, /invalid font container/);
  }
});

test('43. Display, middle and small settings retain each face size, weight, tracking and axes', (t) => {
  const dir = temp(t), spec = brandFixture(), b = spec.boards[0];
  b.type.heading.weights = [400, 620, 730];
  b.type.heading.files[0].weight = [400, 800];
  Object.assign(b.type.heading.sizes.display, { size: 112, weight: 730, lineHeight: .93, tracking: -.041, variations: { wght: 730 } });
  Object.assign(b.type.heading.sizes.middle, { size: 31, weight: 620, variations: { wght: 620 } });
  const html = readFileSync(success(build(dir, spec).result).output, 'utf8');
  assert.match(html, /class="brand-headline" style="font-family:bb-1-heading;font-weight:730;[^"\n]*font-variation-settings:&quot;wght&quot; 730;font-size:112px;line-height:0\.93;letter-spacing:-0\.041em/);
  assert.match(html, /class="brand-headline" style="font-family:bb-1-heading;font-weight:730;[^"\n]*font-size:52\.64px/);
  assert.match(html, /class="type-line" style="font-family:bb-1-heading;font-weight:620;[^"\n]*font-size:31px/);
  assert.match(html, /font-family:bb-1-heading;font-weight:400;[^"\n]*font-size:30px/);
});

test('44. Every caller-supplied legend mark is drawn, named and explained, without a fixed count', (t) => {
  const dir = temp(t), spec = brandFixture(), b = spec.boards[0];
  b.graphics.legend = Array.from({ length: 9 }, (_, i) => ({ name: `Gesture ${i + 1}`, use: `Points to detail ${i + 1}.`, svg: `<svg viewBox="0 0 44 22"><path d="M${i} 2 L40 20" stroke="currentColor"/></svg>` }));
  const html = readFileSync(success(build(dir, spec).result).output, 'utf8');
  const whole = html.slice(html.indexOf('id="whole-1"'), html.indexOf('id="whole-2"'));
  assert.equal((whole.match(/class="legend-mark"/g) || []).length, 18);
  for (const m of b.graphics.legend) {
    assert.ok(whole.includes(`alt="${m.name}"`));
    assert.ok(whole.includes(`<b>${m.name}.</b> ${m.use}`));
  }
});

test('45. Every core word retains its own opposing word in the board heading face', (t) => {
  const dir = temp(t), spec = brandFixture();
  spec.boards[0].words = [{ word: 'Patient', not: 'slow' }, { word: 'Generous', not: 'wasteful' }];
  const html = readFileSync(success(build(dir, spec).result).output, 'utf8');
  assert.match(html, /font-family:bb-1-heading[^>]+>Patient, <i>not slow<\/i>/);
  assert.match(html, /font-family:bb-1-heading[^>]+>Generous, <i>not wasteful<\/i>/);
  brandRefusal(t, (s) => { delete s.boards[0].words[0].not; }, /words.not/);
});

test('46. Bar and chip inks are board colours, share the measured pairings, and never need an outside fallback', (t) => {
  const dir = temp(t), spec = brandFixture(), reply = success(build(dir, spec).result);
  const html = readFileSync(reply.output, 'utf8');
  for (const [i, b] of spec.boards.entries()) for (const mode of ['light', 'dark']) {
    for (const sw of b.palette.swatches) {
      const pair = reply.boards[i].checks.find((p) => p.mode === mode && p.pairing === `palette bar and chip ${sw.name}`);
      assert.ok(pair); assert.ok(pair.wcag >= 4.5);
      assert.ok(Object.values(b.palette[mode]).includes(pair.foregroundValue));
      assert.ok(html.includes(`data-swatch="${sw.key}" style="background:${pair.backgroundValue};color:${pair.foregroundValue}"`));
    }
  }
  brandRefusal(t, (s) => { for (const r of Object.keys(s.boards[0].palette.light)) s.boards[0].palette.light[r] = '#888888'; }, /palette bar and chip.*WCAG/);
});

test('47. Both primary modes include composed alternate panels and local links to complete modes', (t) => {
  const dir = temp(t), reply = success(build(dir, brandFixture()).result), html = readFileSync(reply.output, 'utf8');
  for (const n of [1, 2, 3]) for (const m of ['light', 'dark']) {
    assert.ok(html.includes(`href="#whole-${n}-${m}"`));
    assert.ok(html.includes(`id="whole-${n}-${m}"`));
  }
  for (const text of ['data-other-mode="light"', 'data-other-mode="dark"', 'class="content-card"', 'class="secondary-link"', 'class="named-chips"', 'Board 3 of 3', 'See it in light', 'See it in dark']) assert.ok(html.includes(text), text);
  assert.match(html, /\.whole-view>\.mode-sheet:target\{display:block\}/);
});

test('48. New required fields and every new SVG slot reject omissions, invalid values and active content', (t) => {
  for (const mutate of [
    (s) => { delete s.boards[0].type.heading.sizes; },
    (s) => { s.boards[0].type.body.sizes.small.tracking = '0;url(x)'; },
    (s) => { s.boards[0].type.heading.sizes.display.variations = { bad: 12 }; },
    (s) => { s.boards[0].type.heading.sizes.display.weight = 900; },
    (s) => { s.boards[0].sample.phrase = 'absent'; },
    (s) => { s.boards[0].note.direction = 'sideways'; },
    (s) => { delete s.boards[0].items.contact; },
    (s) => { s.boards[0].closingExamples = ['Only one']; },
    (s) => { s.boards[0].palette.modeSwatches = { light: [], dark: [] }; }
  ]) brandRefusal(t, mutate, /sizes|number|axis|weight|phrase|direction|contact|closingExamples|modeSwatches/);
  for (const slot of ['rule', 'circle', 'path', 'closing', 'legend', 'arrow']) for (const hostile of ['<script/>', '<path onload="bad()"/>', '<use href="https://example.invalid/a.svg"/>']) {
    brandRefusal(t, (s) => {
      const svg = `<svg>${hostile}</svg>`;
      if (slot === 'legend') s.boards[0].graphics.legend[0].svg = svg;
      else if (slot === 'arrow') s.boards[0].note.svg = svg;
      else s.boards[0].sample[slot] = svg;
    }, /SVG/);
  }
});

test('49. Pattern and texture composites are checked where they underlie text', (t) => {
  brandRefusal(t, (s) => { s.boards[0].graphics.texture.strength.dark = 1; }, /over texture/);
  brandRefusal(t, (s) => { s.boards[0].graphics.pattern.strength.light = 1; s.boards[0].graphics.pattern.svg = '<svg><rect width="100" height="100" fill="{{text}}"/></svg>'; }, /over pattern/);
  const dir = temp(t), reply = success(build(dir, brandFixture()).result);
  assert.ok(reply.boards[0].checks.some((p) => p.pairing === 'text over pattern mark'));
  assert.ok(reply.boards[0].checks.some((p) => p.pairing === 'cardBackText over texture cardBackMark'));
});

test('50. Standalone SVGs without a namespace become browser-readable embedded drawings', (t) => {
  const dir = temp(t), spec = brandFixture();
  spec.boards[0].graphics.hero.svg = '<svg viewBox="0 0 100 12"><path d="M1 6 H99" stroke="currentColor"/></svg>';
  const html = readFileSync(success(build(dir, spec).result).output, 'utf8');
  for (const m of html.matchAll(/data:image\/svg\+xml;base64,([A-Za-z0-9+/=]+)/g)) {
    assert.match(Buffer.from(m[1], 'base64').toString(), /xmlns=["']http:\/\/www.w3.org\/2000\/svg["']/);
  }
});

test('51. Mode-specific swatches, chip names and item texts are caller-owned and checked', (t) => {
  const dir = temp(t), spec = brandFixture(), b = spec.boards[0];
  b.palette.modeSwatches = { light: b.palette.swatches, dark: b.palette.swatches.map((s) => ({ ...s, name: `Night ${s.name}` })) };
  b.palette.chips = { light: [{ name: 'Reading ground', key: 'ground' }], dark: [{ name: 'Night field', key: 'deep' }] };
  b.items.cardBackShort = 'Keep this detail.';
  b.items.tileBannerHeadline = 'An everyday ritual.';
  b.type.body.stripLabel = 'Reading face';
  const reply = success(build(dir, spec).result), html = readFileSync(reply.output, 'utf8');
  for (const s of ['Night Blank sheet', 'Reading ground', 'Night field', 'Keep this detail.', 'An everyday ritual.', 'Reading face']) assert.ok(html.includes(s), s);
  assert.ok(reply.boards[0].checks.some((p) => p.mode === 'dark' && p.pairing === 'palette bar and chip Night field'));
  brandRefusal(t, (s) => { s.boards[0].palette.chips = { light: [{ name: 'Absent', key: 'missing' }], dark: [] }; }, /chip.key/);
});

test('52. Monogram surface styles render and refuse illegible initials before writing', (t) => {
  const dir = temp(t), spec = brandFixture();
  spec.boards[0].monogram.surfaces = { ground: { background: 'pop', ink: 'onPop', frame: 'onPop', radius: 50 } };
  const reply = success(build(dir, spec).result), html = readFileSync(reply.output, 'utf8');
  assert.ok(html.includes('background:#164fb8;border-radius:50%'));
  assert.ok(reply.boards[0].checks.some((p) => p.pairing === 'monogram on ground' && p.background === 'pop'));
  brandRefusal(t, (s) => { s.boards[0].monogram.surfaces = { ground: { background: 'pop', ink: 'pop', frame: 'onPop', radius: 50 } }; }, /monogram on ground.*WCAG/);
});

test('53. Every decorative slot reports low contrast without a need, including the marks-only foot', (t) => {
  const dir = temp(t), spec = brandFixture(), b = spec.boards[0];
  b.graphics.hero.shape = 'underline'; delete b.graphics.hero.role;
  b.palette.light.mark = '#dddddd'; b.palette.light.cardBackMark = '#19243d';
  b.palette.swatches[0].share -= 1;
  b.palette.swatches.push({ name: 'Pale chalk', role: 'Drawn details', share: 1, key: 'mark' });
  const reply = success(build(dir, spec).result), html = readFileSync(reply.output, 'utf8');
  const checks = reply.boards[0].checks.filter((p) => p.mode === 'light');
  for (const name of ['hero role mark', 'note arrow role mark', 'legend role mark', 'sample rule role mark', 'sample circle role mark', 'sample path role mark', 'sample closing role mark', 'banner rule role mark', 'pattern role mark', 'texture role cardBackMark', 'card back graphic']) {
    const p = checks.find((p) => p.pairing === name);
    assert.ok(p, name); assert.ok(p.wcag < 3, name); assert.equal(Object.hasOwn(p, 'need'), false, name);
  }
  for (const p of checks.filter((p) => /^(?:text|headline|smallPrint|sub|note) over pattern|^cardBackText over texture/.test(p.pairing))) {
    assert.equal(p.need, 4.5); assert.ok(p.wcag >= p.need);
  }
  assert.match(html, /Pale chalk \(#dddddd, light\) is for marks only, [\d.]+:1 on the ground/);
  assert.match(html, /cardBackMark \(#19243d, light\) is for marks only, [\d.]+:1 on the ground/);
  assert.match(html, /decoration, reported only/);
  assert.doesNotMatch(html, /needs undefined|including marks/);
  // The same resolved colour used as text is no longer marks-only.
  assert.doesNotMatch(html, /#164fb8, light\) is for marks only/);
  b.palette.light.mark = '#000'; b.palette.light.text = '#000000';
  const aliases = success(build(dir, spec, 'aliases.html').result);
  assert.ok(!aliases.boards[0].checks.some((p) => p.mode === 'light' && p.pairing === 'marks-only mark on ground'));
});

test('54. Identifying monogram ink and its container still need 3 to 1', (t) => {
  for (const part of ['ink', 'frame']) brandRefusal(t, (s) => {
    const b = s.boards[0]; b.palette.light.mark = '#dddddd';
    b.monogram.surfaces = { ground: { background: 'ground', ink: 'headline', frame: 'headline', radius: 0, [part]: 'mark' } };
  }, /monogram.*WCAG.*< 3:1/);
  brandRefusal(t, (s) => {
    s.boards[0].palette.light.mark = '#dddddd';
    s.boards[0].monogram.container = '<svg><rect width="100" height="100" fill="{{mark}}"/></svg>';
  }, /monogram container.*WCAG.*< 3:1/);
});

test('55. Decorative filters, gradients, masks, opacity and internal references embed unchanged', (t) => {
  const dir = temp(t), spec = brandFixture(), b = spec.boards[0];
  const svg = '<svg viewBox="0 0 100 100"><defs><filter id="grain"><feTurbulence baseFrequency=".8" seed="7"/><feComposite in="SourceGraphic" operator="in"/></filter><linearGradient id="ink"><stop stop-color="currentColor"/><stop offset="1" stop-color="{{mark}}" stop-opacity=".5"/></linearGradient><mask id="cut"><rect width="100" height="100" fill="currentColor"/></mask><g id="shape"><rect width="100" height="100" fill="url(#ink)"/></g></defs><use href="#shape" filter="url(#grain)" mask="url(#cut)" opacity=".4"/></svg>';
  b.graphics.hero = { svg, shape: 'underline', phrase: b.graphics.hero.phrase };
  for (const slot of ['pattern', 'texture']) b.graphics[slot].svg = svg;
  b.note.svg = svg; b.graphics.legend[0].svg = svg;
  for (const slot of ['rule', 'circle', 'path', 'closing']) b.sample[slot] = svg;
  const html = readFileSync(success(build(dir, spec).result).output, 'utf8');
  const svgs = [...html.matchAll(/data:image\/svg\+xml;base64,([A-Za-z0-9+/=]+)/g)].map((m) => Buffer.from(m[1], 'base64').toString());
  assert.ok(svgs.some((s) => /feTurbulence/.test(s) && /filter="url\(#grain\)"/.test(s) && /href="#shape"/.test(s) && /opacity=".4"/.test(s)));
  // Uncertain filter ink retains the declared-ink, declared-strength check.
  brandRefusal(t, (s) => {
    s.boards[0].graphics.pattern.svg = svg.replaceAll('{{mark}}', '{{text}}');
    s.boards[0].graphics.pattern.strength.light = 1;
  }, /text over pattern text.*WCAG/);
});

test('56. Expanded SVG vocabulary still refuses active, outward and missing references', (t) => {
  for (const content of ['<script/>', '<foreignObject/>', '<text>Unmeasured</text>', '<tspan>Unmeasured</tspan>', '<rect onclick="bad()"/>', '<rect filter="url(other.svg#filter)"/>', '<feImage href="https://example.invalid/a.svg"/>', '<use href="#missing"/>', '<rect fill="url(#missing)"/>', '<defs><filter id="a"/><filter id="a"/></defs>']) {
    brandRefusal(t, (s) => { s.boards[0].graphics.texture.svg = `<svg>${content}</svg>`; }, /SVG/);
  }
});

test('57. Highlight band sits behind the phrase and checks default and named role ink', (t) => {
  const dir = temp(t), spec = brandFixture(), b = spec.boards[0];
  b.graphics.hero = { phrase: 'made to last', shape: 'highlight', svg: '<svg viewBox="0 0 100 20" preserveAspectRatio="none"><rect width="100" height="20" fill="currentColor"/></svg>' };
  b.palette.light.mark = '#94b6fa'; b.palette.dark.mark = '#164fb8';
  const reply = success(build(dir, spec).result), html = readFileSync(reply.output, 'utf8');
  assert.match(html, /class="hero-phrase highlight">made to last<img class="phrase-ink"/);
  assert.match(html, /\.highlight\{display:inline;isolation:isolate\}\.highlight>\.phrase-ink\{max-width:none;z-index:-1;[^}]*top:56%/);
  for (const mode of ['light', 'dark']) {
    const p = reply.boards[0].checks.find((p) => p.mode === mode && p.pairing === 'headline on highlight mark');
    assert.equal(p.need, 3); assert.equal(p.backgroundValue, b.palette[mode].mark); assert.ok(p.wcag >= p.need);
  }
  b.graphics.hero.role = 'panel';
  const named = success(build(dir, spec, 'named.html').result);
  assert.ok(named.boards[0].checks.some((p) => p.pairing === 'headline on highlight panel' && p.need === 3));
  b.graphics.hero.role = { light: 'panel', dark: 'ground' };
  const modes = success(build(dir, spec, 'modes.html').result);
  assert.ok(modes.boards[0].checks.some((p) => p.mode === 'light' && p.pairing === 'headline on highlight panel' && p.foreground === 'headline'));
  assert.ok(modes.boards[0].checks.some((p) => p.mode === 'dark' && p.pairing === 'headline on highlight ground' && p.backgroundValue === b.palette.dark.ground));
});

test('58. Highlight refuses unreadable text, small text at 4.5, and invalid roles or placement', (t) => {
  brandRefusal(t, (s) => { Object.assign(s.boards[0].graphics.hero, { shape: 'highlight', role: 'headline' }); }, /headline on highlight headline.*WCAG.*< 3:1/);
  brandRefusal(t, (s) => {
    const b = s.boards[0]; b.type.heading.sizes.display.size = 40;
    Object.assign(b.graphics.hero, { shape: 'highlight', role: 'mark' });
    b.palette.light.mark = '#777777';
  }, /headline on highlight mark.*WCAG.*< 4.5:1/);
  brandRefusal(t, (s) => { s.boards[0].graphics.hero.role = 'unknown'; }, /graphics.hero.role/);
  brandRefusal(t, (s) => { s.boards[0].graphics.hero.role = { light: 'panel' }; }, /graphics.hero.role.dark/);
  brandRefusal(t, (s) => { s.boards[0].graphics.hero.role = { light: 'panel', dark: 'unknown' }; }, /graphics.hero.role.dark/);
  brandRefusal(t, (s) => { s.boards[0].graphics.hero = { shape: 'highlight', placement: 'monogram', svg: '<svg/>' }; }, /highlight needs headline placement/);
});

test('Single-board regression: both escaped intro lines are visible in each sheet head', (t) => {
  const dir = temp(t), spec = brandFixture();
  spec.boards = [spec.boards[0]]; spec.groups = [spec.groups[0]];
  spec.intro = ['Keep <this> & "that".', "Choose <one> & 'two'."];
  const html = readFileSync(success(build(dir, spec).result).output, 'utf8');
  const heads = [...html.matchAll(/<header class="sheet-head"[^>]*>([\s\S]*?)<\/header>/g)];
  assert.equal(heads.length, 2);
  for (const [, head] of heads) {
    assert.ok(head.includes('<p>Keep &lt;this&gt; &amp; &quot;that&quot;.</p>'));
    assert.ok(head.includes('<p>Choose &lt;one&gt; &amp; &#39;two&#39;.</p>'));
    assert.doesNotMatch(head, /\bhidden\b|display\s*:\s*none|class="index-page"/);
  }
  assert.equal((html.match(/id="all-boards"/g) || []).length, 1);
  assert.doesNotMatch(html, /class="boards-grid|class="brand-board tile"/);
  const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  for (const [, selectors, declarations] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (selectors.split(',').some((selector) => /(?:^|\s)\.(?:sheet-head|sheet-intro)(?:\s+p(?:\+p)?)?$/.test(selector.trim()))) {
      assert.doesNotMatch(declarations, /display\s*:\s*none/);
    }
  }
});

test('Role regression: the three small-print lines match CSS, checks and TOOL.md in both modes', (t) => {
  const dir = temp(t), spec = brandFixture(), reply = success(build(dir, spec).result);
  const html = readFileSync(reply.output, 'utf8'), doc = readFileSync(join(ROOT, 'TOOL.md'), 'utf8');
  const roles = [
    ['.front>span', 'items.cardLine', 'cardFrontSmallPrint', 'cardFront'],
    ['.banner-copy>p', 'items.bannerLine', 'panelSmallPrint', 'panel'],
    ['.other-left>p', 'content.body', 'smallPrint', 'ground']
  ];
  const energy = reply.boards[0].checks.find((p) => p.mode === 'page' && p.backgroundValue === '#d9d7d2' && p.foregroundValue === '#242832');
  assert.equal(energy?.need, 4.5); assert.ok(energy.wcag >= energy.need);
  for (const [selector, field, foreground, background] of roles) {
    const rule = html.slice(html.indexOf(selector + '{')).split('}')[0];
    assert.ok(rule.includes('color:var(--' + foreground + ')'), field);
    for (const mode of ['light', 'dark']) {
      assert.ok(reply.boards[0].checks.some((p) => p.mode === mode && p.foreground === foreground && p.background === background && p.need === 4.5), field);
      brandRefusal(t, (s) => { s.boards[0].palette[mode][foreground] = s.boards[0].palette[mode][background]; }, /WCAG.*< 4.5/);
    }
  }
  for (const [, field, foreground] of roles) {
    const row = doc.split('\n').find((line) => line.startsWith('| `' + foreground + '` |'));
    assert.ok(row?.includes('`' + field + '`'), field + ' must name its painted role in TOOL.md');
  }
});

test('Group regression: board zero cannot populate an otherwise empty group', (t) => {
  brandRefusal(t, (s) => { s.boards[2].number = 0; s.boards[2].zero = true; }, /Group A different setting: no boards\. Remove the empty group or supply its boards\./);
});

function woff2Fixture(directory, { count = 1, compressed = 0, payload = [] } = {}) {
  const header = Buffer.alloc(48), bytes = Buffer.concat([header, Buffer.from(directory), Buffer.from(payload)]);
  bytes.write('wOF2'); bytes.writeUInt32BE(0x00010000, 4);
  bytes.writeUInt32BE(bytes.length, 8); bytes.writeUInt16BE(count, 12);
  bytes.writeUInt32BE(100, 16); bytes.writeUInt32BE(compressed, 20);
  return bytes;
}
function woff2Files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    return entry.isDirectory() ? woff2Files(file) : (entry.name.endsWith('.woff2') ? [file] : []);
  });
}
const woff2ValidDirectories = [
  [0, 1], [10, 1, 1], [11, 0, 0], [0x40, 1, 1],
  [0xca, 1], [0xcb, 0],
  [63, ...Buffer.from('glyf'), 1, 1], [63, ...Buffer.from('loca'), 0, 0],
  [63, ...Buffer.from('test'), 1], [0x7f, ...Buffer.from('test'), 1, 1],
  [0, 0x8f, 0xff, 0xff, 0xff, 0x7f]
];
const woff2InvalidDirectories = [
  ['header without a directory', []],
  ['truncated custom tag', [63, 0x61, 0x62]],
  ['missing original length', [0]],
  ['truncated original length', [0, 0x81]],
  ['leading-zero original length', [0, 0x80, 1]],
  ['six-byte original length', [0, 0x81, 0x80, 0x80, 0x80, 0x80, 0]],
  ['overflowing original length', [0, 0x90, 0x80, 0x80, 0x80, 0]],
  ['missing glyf transform length', [10, 1]],
  ['missing loca transform length', [11, 0]],
  ['missing other transform length', [0x40, 1]],
  ['missing custom glyf transform length', [63, ...Buffer.from('glyf'), 1]],
  ['missing custom loca transform length', [63, ...Buffer.from('loca'), 0]],
  ['missing custom other transform length', [0x7f, ...Buffer.from('test'), 1]],
  ['leading-zero transform length', [10, 1, 0x80, 0]],
  ['six-byte transform length', [10, 1, 0x81, 0x80, 0x80, 0x80, 0x80, 0]],
  ['overflowing transform length', [10, 1, 0x90, 0x80, 0x80, 0x80, 0]],
  ['too few directory entries', [0, 1], { count: 2 }],
  ['truncated compressed data', [0, 1], { compressed: 1 }]
];

for (const [label, directory, options] of woff2InvalidDirectories) test('WOFF2 regression: ' + label + ' is refused', (t) => {
  if (label === 'header without a directory') {
    const dir = temp(t), spec = brandFixture();
    spec.boards = [spec.boards[0]]; spec.groups = [spec.groups[0]];
    const file = join(dir, 'bounded.woff2');
    for (const [i, entry] of woff2ValidDirectories.entries()) {
      writeFileSync(file, woff2Fixture(entry, { compressed: 1, payload: [0] }));
      spec.boards[0].type.heading.files[0].path = file;
      success(build(dir, spec, 'bounded-' + i + '.html').result);
    }
    const fonts = woff2Files(resolve(ROOT, '../../skills/Build Brand/parts/fonts'));
    assert.ok(fonts.length > 0, 'the installed font pack is required');
    for (const [i, font] of fonts.entries()) {
      spec.boards[0].type.heading.files[0].path = font;
      success(build(dir, spec, 'real-' + i + '.html').result);
    }
    t.diagnostic('Accepted all ' + fonts.length + ' real WOFF2 files and all bounded directory forms.');
  }
  brandRefusal(t, (s, dir) => {
    const file = join(dir, 'invalid.woff2');
    writeFileSync(file, woff2Fixture(directory, options));
    s.boards[0].type.heading.files[0].path = file;
  }, /invalid font container/);
});
