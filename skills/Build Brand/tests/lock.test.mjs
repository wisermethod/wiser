import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, readdirSync, symlinkSync, linkSync, existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { run, HEADINGS, SCALE, sha256, designState } from '../scripts/lock.mjs';

const script = fileURLToPath(new URL('../scripts/lock.mjs', import.meta.url));
const parts = fileURLToPath(new URL('../parts/', import.meta.url));
const library = JSON.parse(readFileSync(join(parts, 'parts.json')));
// The script reports real paths; on macOS the default temporary directory is reached through a link.
const sandbox = realpathSync(mkdtempSync(join(tmpdir(), 'brand-lock-')));
test.after(() => rmSync(sandbox, { recursive: true, force: true }));
let serial = 0;
function fixture(type = 'personal') {
  const root = join(sandbox, String(++serial)); mkdirSync(root);
  const palette = library.palettes[0], pairing = library.pairings[0], graphics = library.graphics[0];
  const face = (role) => { const f = structuredClone(pairing.type[role]); f.files = f.files.map((file) => ({ ...file, path: resolve(parts, file.path) })); return f; };
  const spec = { layout: 'board', boards: [{ number: 1, name: 'Kept board', primaryMode: 'light', buttonRadius: 4, palette: structuredClone(Object.fromEntries(['light', 'dark', 'swatches'].map((k) => [k, palette[k]]))), type: { heading: face('heading'), body: face('body') }, graphics: structuredClone(graphics), content: { brandName: 'Test Person', sentence: 'I build useful things.', body: 'A supplied line.', photoRules: 'Show people using what they make.', never: ['posed stock photographs'] }, words: [{ word: 'Useful', not: 'ornamental' }, { word: 'Clear', not: 'academic' }], monogram: { initials: 'TP', container: '<svg/>' } }] };
  const answers = { type, name: 'Test Person', sentence: spec.boards[0].content.sentence, words: structuredClone(spec.boards[0].words), taps: { mode: 'light', feel: 'natural', history: 'established-current', strength: 'strong-solid', technology: 'craftsman', style: 'patagonia', posture: 'subaru', mood: 'ikea', place: 'workshop' }, readBack: { text: 'Natural and strong, like Patagonia.', confirmed: true }, off: [], looks: ['look:soft-serif/paper-orange/drawn'], rounds: [{ question: 'Round 1', steer: 'Warmer; as it is; stronger; more current' }], assets: [], lock: { confirmed: true, board: 1, question: 'F18', specSha256: '', contactSheetPassed: true } };
  if (type !== 'personal') Object.assign(answers, { audience: 'People who make things.', promise: 'Useful things that last.', finalSay: 'Me, and others should see it' });
  const specPath = join(root, 'board.json'), answersPath = join(root, 'answers.json'), design = join(root, 'design.md'), work = join(root, 'work/brand');
  function save() { const bytes = JSON.stringify(spec); writeFileSync(specPath, bytes); answers.lock.specSha256 = sha256(bytes); writeFileSync(answersPath, JSON.stringify(answers)); }
  save();
  const argv = ['--spec', specPath, '--answers', answersPath, '--root', root, '--design', design, '--work', work];
  return { root, spec, answers, save, specPath, answersPath, design, work, argv, result: () => run(argv), read: (file = design) => readFileSync(file, 'utf8') };
}

for (const type of ['personal', 'org', 'client', 'department']) test(`${type}: all twelve headings complete and every value has provenance`, () => {
  const f = fixture(type), result = f.result(), design = f.read();
  assert.equal(result.state, 'complete'); assert.equal(result.headings.length, 12);
  assert.deepEqual([...design.matchAll(/^## (.+)$/gm)].map((m) => m[1]), HEADINGS);
  assert.equal(designState(design), 'complete');
  for (const h of HEADINGS) assert.ok(result.headings.find((r) => r.heading === h));
  for (const line of design.split('\n').filter((l) => l && !l.startsWith('#') && !l.startsWith('<!--') && !l.startsWith('Markers ') && !l.startsWith('Labels '))) {
    assert.match(line, /\(Firsthand:|\(Research inference:|\[Not available:|\(Source:/, line);
  }
  for (const key of Object.keys(f.answers.taps)) assert.ok(design.includes(`#taps.${key}`));
  assert.match(design, /\[Not available: not asked\]/);
  assert.match(design, /<!-- provenance-preamble -->/);
  if (type !== 'personal') for (const k of ['audience', 'promise', 'finalSay']) assert.ok(design.includes(f.answers[k]));
  assert.match(f.read(join(f.work, 'brand-direction.html')), /What the brand is[\s\S]*Core words[\s\S]*How it looks[\s\S]*Colour[\s\S]*Type[\s\S]*Marks, pattern and texture[\s\S]*Pictures[\s\S]*Where each choice comes from/);
});

test('all locked light and dark values are unmoved, role named and pop preserved', () => {
  const f = fixture(); f.result(); const css = f.read(join(f.work, 'palette.css'));
  for (const mode of ['light', 'dark']) for (const [role, value] of Object.entries(f.spec.boards[0].palette[mode])) {
    const key = role.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
    assert.ok(css.includes(`--locked-${mode}-${key}: ${value};`));
    assert.ok(css.includes(`.palette.${mode}.${role}`)); assert.ok(f.read().includes(value));
  }
  assert.match(css, /--brand-pop: var\(--locked-light-pop\)/);
  assert.match(css, /--brand-pop: var\(--locked-dark-pop\)/);
  assert.match(css, /\[data-theme="light"\]/); assert.match(css, /\[data-theme="dark"\]/);
});
test('fixed modular scale, weights, line heights, families and licences', () => {
  const f = fixture(); f.result(); const css = f.read(join(f.work, 'typography.css'));
  assert.equal(SCALE.base, 16); assert.equal(SCALE.ratio, 1.25);
  for (const [name, step] of Object.entries(SCALE.levels)) {
    assert.ok(css.includes(`${SCALE.ratio ** step}rem`)); assert.ok(css.includes(`--type-line-${name}-dark: ${(SCALE.lines[name] + .05).toFixed(2)}`));
  }
  for (const role of ['heading', 'body']) { assert.ok(css.includes(f.spec.boards[0].type[role].family)); assert.ok(css.includes(f.spec.boards[0].type[role].licence)); }
  assert.match(css, /@font-face/); assert.match(css, /--weight-heading:/);
  assert.match(css, /\.type-on-dark\s*\{[^}]*--rhythm-base: calc\(var\(--text-body\) \* var\(--line-body\)\)/);
});
test('the shared answers projection is accepted by selection with identical field names and correction ids', async () => {
  const { validateAnswers } = await import('../scripts/select.mjs');
  const taps = JSON.parse(readFileSync(join(parts, 'taps.json'))), f = fixture();
  f.answers.off = ['softStrong', 'warm', 'natural'];
  const shared = Object.fromEntries(['name', 'sentence', 'words', 'taps', 'off', 'looks'].map((k) => [k, f.answers[k]]));
  assert.deepEqual(validateAnswers(structuredClone(shared), taps, library, 'round1'), shared);
  f.save(); f.result(); assert.match(f.read(), /Dropped from the steer: softStrong, warm, natural/);
});
test('unlisted originals, missing fonts and unknown nested answers refuse before publication', () => {
  const unlisted = fixture(); mkdirSync(join(unlisted.root, 'sources/brand'), { recursive: true }); writeFileSync(join(unlisted.root, 'sources/brand/guide.txt'), 'Original guide'); assert.throws(unlisted.result, /not inventoried/);
  const absent = fixture(); absent.spec.boards[0].type.body.files[0].path = join(absent.root, 'absent.woff2'); absent.save(); assert.throws(absent.result, /locked font is absent/);
  const extra = fixture(); extra.answers.readBack.dropped = []; extra.save(); assert.throws(extra.result, /readBack.dropped.*unknown field/);
  for (const f of [unlisted, absent, extra]) assert.equal(existsSync(f.design), false);
});
test('a kept logo fills Mark and all listed assets are recorded', () => {
  const f = fixture(); mkdirSync(join(f.root, 'sources/brand'), { recursive: true });
  const logo = join(f.root, 'sources/brand/logo.svg'); writeFileSync(logo, '<svg/>');
  f.spec.boards[0].monogram = { file: logo };
  f.answers.assets = [{ path: 'sources/brand/logo.svg', kind: 'logo', governs: 'The kept logo' }]; f.save(); f.result();
  assert.match(f.read(), /Keep the supplied logo/); assert.ok(f.read().includes('sources/brand/logo.svg')); assert.doesNotMatch(f.read(), /a logo is offered after the lock/);
});
test('placeholder initials never become a mark', () => {
  const f = fixture(); f.result(); assert.match(f.read(), /## Mark\n\n\[Not available: a logo is offered after the lock\]/);
});
test('explicit legacy labels permit absent records; direction omits unsupported Pictures', () => {
  const f = fixture(); for (const k of ['readBack', 'rounds', 'looks']) delete f.answers[k]; delete f.spec.boards[0].content.photoRules;
  f.answers.unavailable = { readBack: 'read-back not supplied', rounds: 'round answers not supplied', looks: 'whole looks not supplied', photoRules: 'the supplied locked board states no picture rule' };
  f.save(); f.result(); for (const reason of Object.values(f.answers.unavailable)) assert.ok(f.read().includes(reason));
  assert.doesNotMatch(f.read(join(f.work, 'brand-direction.html')), /<h2>Pictures<\/h2>/);
});
test('answers differing from the board are refused instead of silently selected', () => {
  for (const k of ['name', 'sentence', 'words']) { const f = fixture(); if (k === 'words') f.answers.words[0].not = 'different'; else f.answers[k] += ' changed'; f.save(); assert.throws(f.result, new RegExp(k)); assert.equal(existsSync(f.design), false); }
});
for (const [name, mutate, pattern] of [
  ['unassembled selection', (f) => { f.spec.layout = 'selection'; }, /unassembled/],
  ['unassembled palette', (f) => { f.spec.boards[0].palette = { id: 'paper-orange' }; }, /palette.light/],
  ['unlocked', (f) => { f.answers.lock.confirmed = false; }, /unlocked/],
  ['unchecked', (f) => { f.answers.lock.contactSheetPassed = false; }, /unchecked/],
  ['unknown board', (f) => { f.answers.lock.board = 100; }, /lock.board/],
  ['missing name', (f) => { delete f.answers.name; }, /name/],
  ['missing words', (f) => { f.answers.words = []; }, /words/],
  ['missing boundary', (f) => { delete f.answers.words[0].not; }, /words.0.not/],
  ['missing tap', (f) => { delete f.answers.taps.strength; }, /taps.strength/],
  ['missing read-back', (f) => { delete f.answers.readBack; }, /unavailable.readBack/],
  ['unconfirmed read-back', (f) => { f.answers.readBack.confirmed = false; }, /read-back/],
  ['missing looks', (f) => { delete f.answers.looks; }, /unavailable.looks/],
  ['missing rounds', (f) => { delete f.answers.rounds; }, /unavailable.rounds/],
  ['missing picture rule', (f) => { delete f.spec.boards[0].content.photoRules; }, /unavailable.photoRules/],
  ['missing dark', (f) => { delete f.spec.boards[0].palette.dark; }, /palette.dark/],
  ['missing licence', (f) => { delete f.spec.boards[0].type.body.licence; }, /licence/],
  ['relative font', (f) => { f.spec.boards[0].type.body.files[0].path = 'font.woff2'; }, /unassembled/],
  ['unknown type', (f) => { f.answers.type = 'industry'; }, /type/],
]) test(`refuses ${name} before any output`, () => { const f = fixture(); mutate(f); f.save(); assert.throws(f.result, pattern); assert.equal(existsSync(f.design), false); assert.equal(existsSync(f.work), false); });
test('lock hash binds the exact supplied spec bytes', () => { const f = fixture(); writeFileSync(f.specPath, f.read(f.specPath) + '\n'); assert.throws(f.result, /specSha256/); });
test('organisation requires audience, promise and final say', () => { for (const k of ['audience', 'promise', 'finalSay']) { const f = fixture('org'); delete f.answers[k]; f.save(); assert.throws(f.result, new RegExp(k)); } });
test('complete existing design refuses; --replace archives bytes and numbers versions', () => {
  const f = fixture(); f.result(); const first = f.read(); assert.throws(f.result, /complete design already exists/);
  const replaced = run([...f.argv, '--replace']); const old = replaced.archives.find((a) => a.path === f.design);
  assert.match(old.archive, /zArchive\/\d{2}-\d{2}-\d{2} V1 - design.md$/); assert.equal(f.read(old.archive), first);
  const again = run([...f.argv, '--replace']); assert.match(again.archives.find((a) => a.path === f.design).archive, /V2 - design.md$/);
});
test('incomplete design is archived, state probe distinguishes absent/incomplete/complete', () => {
  assert.equal(designState(null), 'absent'); assert.equal(designState('## Color\n*Colour prompt*'), 'incomplete');
  const f = fixture(); writeFileSync(f.design, '## Color\n[Not available: not supplied]\n'); const result = f.result();
  assert.equal(result.archives.length, 1); assert.match(f.read(result.archives[0].archive), /not supplied/);
});
test('a publication failure restores old outputs and cleans staged files', () => {
  const f = fixture(); const initial = f.result(), before = initial.files.map((e) => readFileSync(e.path));
  writeFileSync(join(f.work, 'zArchive'), 'A file blocks the archive directory.');
  f.spec.boards[0].buttonRadius = 8; f.save();
  assert.throws(() => run([...f.argv, '--replace']));
  initial.files.forEach((e, i) => assert.deepEqual(readFileSync(e.path), before[i]));
  for (const dir of [f.root, f.work]) assert.equal(readdirSync(dir).some((p) => p.endsWith('.tmp')), false);
});
test('a different archive home is used only when the root names it', () => {
  const f = fixture(); f.result(); f.answers.paths = { archive: 'work/recovery' }; f.save();
  assert.throws(() => run([...f.argv, '--replace']), /not named by the root/);
  writeFileSync(join(f.root, 'AGENTS.md'), '# Root\nArchive home: work/recovery\n');
  const result = run([...f.argv, '--replace']); assert.ok(result.archives.length >= 4);
  for (const item of result.archives) assert.ok(item.archive.startsWith(join(f.root, 'work/recovery') + '/'));
});
test('state updates only Onboarding and Per-key close; verification preserves old rows and anchors every claim', () => {
  const f = fixture('org'); mkdirSync(join(f.root, 'work/onboarding'), { recursive: true });
  const ag = join(f.root, 'AGENTS.md'), record = join(f.root, 'work/onboarding/run-record.md'), verification = join(f.root, 'work/onboarding/verification.md');
  writeFileSync(ag, '## Provides\ndesign: design.md\n\n## Onboarding\nabout: complete\ndesign: provisional (waiting)\n\n## Other\ndesign: unchanged\n');
  writeFileSync(record, '## Per-key close\nvoice: complete\ndesign: provisional\n\n## Other\ndesign: untouched\n');
  const old = '| V4 | about | other | An old claim | [V4] | about.md | old | read | no | - | located | Verified | - |';
  writeFileSync(verification, '# Verification\n\n## Claims\n\n| Row | Key | Class | Claim | Anchor | Bound file | Cites | Mechanism | Exactness | Second mechanism | Outcome | Label | Search |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|\n' + old + '\n\n## Negative claims\n\n| V9 | Earlier absence | - | old | yes | reader | located |\n');
  const result = f.result(); assert.match(f.read(ag), /## Provides\ndesign: design.md/); assert.match(f.read(ag), /## Onboarding\nabout: complete\ndesign: complete/); assert.match(f.read(ag), /design: unchanged/);
  assert.match(f.read(record), /design: complete/); assert.match(f.read(record), /design: untouched/);
  const v = f.read(verification); assert.ok(v.includes(old)); assert.match(v, /\| V10 \| design/); assert.match(v, /\| design-source \|/);
  const anchors = [...f.read().matchAll(/\[(V\d+)\]/g)].map((m) => m[1]); assert.ok(anchors.length >= result.readBack.claims); assert.equal(new Set(anchors).size, result.readBack.claims);
  for (const anchor of anchors) assert.ok(v.includes(`| ${anchor} | design |`));
  const body = f.read().split('<!-- /provenance-preamble -->')[1];
  for (const line of body.split('\n').filter((s) => s && !s.startsWith('#') && !s.includes('[Not available:'))) {
    for (const sentence of line.split(/\. /)) assert.match(sentence, /\[V\d+\]/, sentence);
  }
});
test('output paths, symlinks, hardlinks and broken links cannot bypass the screen', () => {
  const f = fixture(), outside = join(sandbox, 'outside'); mkdirSync(outside);
  symlinkSync(outside, join(f.root, 'escaped'), 'dir');
  for (const path of [join(f.root, 'escaped/out.md'), join(parts, 'out.md'), join(f.root, '.env')]) { const argv = [...f.argv]; argv[7] = path; assert.throws(() => run(argv)); }
  const hard = join(f.root, 'hard.md'); linkSync(f.answersPath, hard); const argv = [...f.argv]; argv[7] = hard; assert.throws(() => run(argv), /aliases an input/);
  symlinkSync(join(f.root, 'absent'), join(f.root, 'broken')); const broken = [...f.argv]; broken[7] = join(f.root, 'broken/design.md'); assert.throws(() => run(broken), /broken symbolic link/);
  assert.equal(existsSync(f.design), false);
});
test('invalid verification fails without replacing any outputs', () => { const f = fixture(); mkdirSync(join(f.root, 'work/onboarding'), { recursive: true }); writeFileSync(join(f.root, 'work/onboarding/verification.md'), 'bad record'); assert.throws(f.result, /verification/); assert.equal(existsSync(f.design), false); });
test('deterministic bytes and under five seconds including process launch', () => {
  const f = fixture(), start = performance.now(), child = spawnSync(process.execPath, [script, ...f.argv], { encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr); assert.ok(performance.now() - start < 5000); assert.ok(JSON.parse(child.stdout).elapsedMs < 5000);
  const paths = JSON.parse(child.stdout).files.map((e) => e.path), first = paths.map((p) => readFileSync(p));
  run([...f.argv, '--replace']); paths.forEach((p, i) => assert.deepEqual(readFileSync(p), first[i]));
});
test('help before file access, import has no effects, closed flags and duplicate options', () => {
  const child = spawnSync(process.execPath, [script, '--help', '--spec', '/absent'], { encoding: 'utf8' }); assert.equal(child.status, 0); assert.match(child.stdout, /Usage:/);
  for (const flag of ['--env', '--install', '--typo']) { const c = spawnSync(process.execPath, [script, flag], { encoding: 'utf8' }); assert.equal(c.status, 1); assert.equal(c.stdout, ''); assert.ok(c.stderr.includes(flag)); }
  const imported = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(pathToImport(script))})`], { encoding: 'utf8' }); assert.equal(imported.status, 0); assert.equal(imported.stdout, '');
  const f = fixture(); assert.throws(() => run([...f.argv, '--work', f.work]), /duplicate/);
  assert.equal(readdirSync(f.root).includes('design.md'), false);
});
function pathToImport(file) { return new URL('file://' + file.replaceAll(' ', '%20')).href; }
