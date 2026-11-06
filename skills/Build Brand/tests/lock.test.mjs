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
test('own colours lock names the member words, used values and shade moves, citing J1c for colour claims', async () => {
  const {buildOwnColours}=await import('../scripts/own-colours.mjs');
  const f=fixture(),ownColours=buildOwnColours('green and gold');
  f.answers.ownColours=ownColours;
  Object.assign(f.spec.boards[0].palette,ownColours.kept.palette.overrides);
  f.save();const result=f.result(),design=f.read(),color=design.split('## Color\n')[1].split('\n## ')[0];
  assert.ok(color.includes('green and gold'));
  assert.ok(color.split('\n').filter(line=>line.startsWith('- ')).every(line=>line.includes('J1c')));
  for(const v of ownColours.values)assert.ok(color.includes(v.value));
  for(const move of ownColours.moves){assert.ok(color.includes(move.from));assert.ok(color.includes(move.to));assert.ok(color.includes(move.direction));}
  assert.ok(!result.unusedAnswerFields.includes('ownColours'));
});
test('own colours lock refuses a changed palette or fabricated derivation before writes', async () => {
  const {buildOwnColours}=await import('../scripts/own-colours.mjs');
  for(const tamper of [false,true]) {
    const f=fixture();f.answers.ownColours=buildOwnColours('red, white and blue');
    if(tamper){Object.assign(f.spec.boards[0].palette,f.answers.ownColours.kept.palette.overrides);f.answers.ownColours.values[0].value='#FF0000';}
    f.save();assert.throws(f.result,/ownColours/);assert.equal(existsSync(f.design),false);
  }
});
test('own colours end to end: checked twelve looks and Round 1 assemble into a J1c-cited design', async () => {
  const {buildOwnColours}=await import('../scripts/own-colours.mjs');
  const {select,selectionForAssembly}=await import('../scripts/select.mjs');
  const {assemble}=await import('../scripts/assemble.mjs');
  const f=fixture(),ownColours=buildOwnColours('red, white and blue');
  const a={...Object.fromEntries(['type','name','sentence','words','taps','off'].map(k=>[k,f.answers[k]])),looks:[],ownColours,photoRules:f.spec.boards[0].content.photoRules};
  const looks=select('looks',a,{check:true,selectionDir:f.root});assert.equal(looks.options.length,12);
  const picks=looks.options.slice(0,3).map(o=>o.value);
  const round=select('round1',{...a,looks:picks,looksShown:looks.options},{check:true,selectionDir:f.root});
  Object.assign(f.spec,assemble(selectionForAssembly(round.selection),library,{selectionDir:f.root}));
  f.answers.ownColours=ownColours;f.answers.looks=picks;f.answers.answerNumbers.looks=['L1','L1','L1'];
  f.answers.lock.board=1;f.save();const result=f.result();
  assert.equal(result.state,'complete');
  const color=f.read().split('## Color\n')[1].split('\n## ')[0];
  assert.match(color,/red, white and blue/);assert.match(color,/J1c/);
  for(const mode of ['light','dark'])for(const value of Object.values(ownColours.kept.palette.overrides[mode]))assert.ok(color.includes(value));
});
function fixture(type = 'personal') {
  const root = join(sandbox, String(++serial)); mkdirSync(root);
  const palette = library.palettes[0], pairing = library.pairings[0], graphics = library.graphics[0];
  const face = (role) => { const f = structuredClone(pairing.type[role]); f.files = f.files.map((file) => ({ ...file, path: resolve(parts, file.path) })); return f; };
  const spec = { layout: 'board', boards: [{ number: 1, name: 'Kept board', primaryMode: 'light', buttonRadius: 4, palette: structuredClone(Object.fromEntries(['light', 'dark', 'swatches'].map((k) => [k, palette[k]]))), type: { heading: face('heading'), body: face('body') }, graphics: structuredClone(graphics), content: { brandName: 'Test Person', sentence: 'I build useful things.', body: 'A supplied line.', photoRules: 'Show people using what they make.', never: ['posed stock photographs'] }, words: [{ word: 'Useful', not: 'ornamental' }, { word: 'Clear', not: 'academic' }], monogram: { initials: 'TP', container: '<svg/>' } }] };
  const answers = { type, name: 'Test Person', sentence: spec.boards[0].content.sentence, words: structuredClone(spec.boards[0].words), taps: { mode: 'light', feel: 'natural', history: 'established-current', strength: 'strong-solid', technology: 'craftsman', style: 'patagonia', posture: 'toyota', mood: 'ikea', place: 'design-workshop' }, readBack: { text: 'Natural and strong, like Patagonia.', confirmed: true }, off: [], looks: ['look:elegant-serif/tangerine-and-sky-muted/drawn'], rounds: [{ question: 'Round 1', steer: 'Warmer; as it is; stronger; more current' }], assets: [], lock: { confirmed: true, board: 1, question: 'F18', specSha256: '', contactSheetPassed: true } };
  answers.answerNumbers = { file: '2026-11-02 V2 design answers.md', looks: ['L4'], rounds: ['C6'], board: 'C6' };
  if (type !== 'personal') Object.assign(answers, { audience: 'People who make things.', promise: 'Useful things that last.', finalSay: 'Me, and others should see it', provenance: { register: 'Firsthand', by: 'Test Respondent' } });
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
    assert.match(line, /\(Working need:|\(Firsthand:|\(Research inference:|\[Not available:|\(Source:/, line);
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
  const design = f.read();
  assert.equal((design.match(/Working need: lock.mjs SCALE/g) || []).length, 6);
  assert.doesNotMatch(design, /Research inference: lock\.mjs/);
  for (let n = 1; n <= 9; n++) assert.ok(design.includes(`T${n}:`));
  assert.doesNotMatch(design, /\bQ[1-9]:/);
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
  f.answers.looks = ['look-' + sha256('hand-made/tangerine-and-sky-muted/drawn').slice(0,32)];
  const shared = Object.fromEntries(['name', 'sentence', 'words', 'taps', 'off', 'looks'].map((k) => [k, f.answers[k]]));
  shared.looksShown = [{value:f.answers.looks[0],pairing:'hand-made',palette:'tangerine-and-sky-muted',graphicSet:'drawn'}];
  assert.deepEqual(validateAnswers(structuredClone(shared), taps, library, 'round1'), shared);
  f.save(); f.result(); const out = f.read(); assert.match(out, /Marked off by the member: soft or strong \(softStrong\), warm, Natural \(natural\)\./); assert.match(out, /Taste description as shown, before the parts marked off below: /); assert.doesNotMatch(out, /Dropped from the steer/);
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
  const f = fixture(); for (const k of ['readBack', 'rounds', 'looks']) delete f.answers[k]; f.answers.answerNumbers.looks = []; f.answers.answerNumbers.rounds = []; delete f.spec.boards[0].content.photoRules;
  f.answers.unavailable = { readBack: 'read-back not supplied', rounds: 'round answers not supplied', looks: 'whole looks not supplied', photoRules: 'the supplied locked board states no picture rule' };
  f.save(); f.result(); for (const reason of Object.values(f.answers.unavailable)) assert.ok(f.read().includes(reason));
  assert.doesNotMatch(f.read(join(f.work, 'brand-direction.html')), /<h2>Pictures<\/h2>/);
});
test('answers differing from the board are refused instead of silently selected', () => {
  for (const k of ['name', 'sentence', 'words']) { const f = fixture(); if (k === 'words') f.answers.words[0].not = 'different'; else f.answers[k] += ' changed'; f.save(); assert.throws(f.result, new RegExp(k)); assert.equal(existsSync(f.design), false); }
});
for (const [name, mutate, pattern] of [
  ['unassembled selection', (f) => { f.spec.layout = 'selection'; }, /unassembled/],
  ['unassembled palette', (f) => { f.spec.boards[0].palette = { id: 'tangerine-and-sky-muted' }; }, /palette.light/],
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
test('a place carried from the voice coach cites P12 and its file, and refuses a malformed carry', () => {
  const f = fixture(); f.answers.taps.place = 'coffee-shop'; f.answers.carried = { place: { file: '2026-11-02 V2 voice answers.md', question: 'P12' } }; f.save(); f.result();
  assert.ok(f.read().includes("Place, from the voice coach's P12 in `memory/answers/2026-11-02 V2 voice answers.md`: A coffee shop (coffee-shop)"));
  assert.ok(!f.read().includes('T9: A coffee shop'));
  const direction = f.read(join(f.work, 'brand-direction.html'));
  assert.match(direction, /P12 in `memory\/answers\/2026-11-02 V2 voice answers\.md`: A coffee shop<\/p>/);
  assert.doesNotMatch(direction, /T9: A coffee shop/);
  const engineered = fixture(); engineered.answers.taps.feel = 'engineered'; engineered.save(); engineered.result(); assert.ok(engineered.read().includes('T2: Engineered: Precise and industrial (engineered)')); assert.match(engineered.read(join(engineered.work, 'brand-direction.html')), /T2: Engineered: Precise and industrial</);
  const workshop = fixture(); workshop.answers.taps.place = 'design-workshop'; workshop.answers.carried = { place: { file: '2026-11-03 voice answers.md', question: 'P12' } }; workshop.save(); workshop.result(); assert.ok(workshop.read().includes("Place, from the voice coach's P12 in `memory/answers/2026-11-03 voice answers.md`: A design workshop (design-workshop)"));
  const plain = fixture(); plain.answers.taps.place = 'coffee-shop'; plain.save(); plain.result(); assert.ok(!plain.read().includes('from the voice coach')); assert.match(plain.read(join(plain.work, 'brand-direction.html')), /T9: A coffee shop/);
  for (const type of ['org', 'client', 'department']) { const o = fixture(type); o.answers.taps.place = 'spa'; o.answers.carried = { place: { file: '2026-11-02 voice answers.md', question: 'P12' } }; o.save(); assert.throws(o.result, /carried.*only a personal brand/); assert.equal(existsSync(o.design), false); }
  for (const [mutate, pattern] of [
    [(a) => { a.carried.place.file = 'voice answers.md'; }, /carried\.place\.file/],
    [(a) => { a.carried.place.file = '2026-11-02 design answers.md'; }, /carried\.place\.file/],
    [(a) => { a.carried.place.question = 'T9'; }, /carried\.place\.question/],
    [(a) => { a.taps.place = 'place-none'; }, /taps\.place/],
    [(a) => { a.taps.place = 'design-studio'; }, /taps\.place/],
    [(a) => { a.taps.place = 'place-none'; a.carried.place.question = 'P12'; }, /taps\.place.*places P12 shares/],
    [(a) => { a.carried.place.row = 'answered'; }, /carried\.place\.row.*unknown field/],
    [(a) => { a.carried = {}; }, /carried\.place/],
  ]) { const g = fixture(); g.answers.taps.place = 'spa'; g.answers.carried = { place: { file: '2026-11-02 voice answers.md', question: 'P12' } }; mutate(g.answers); g.save(); assert.throws(g.result, pattern); assert.equal(existsSync(g.design), false); }
});
test('non-personal locks require the named respondent before publication', () => {
  for (const type of ['org', 'client', 'department']) {
    const f = fixture(type); delete f.answers.provenance; f.save();
    assert.throws(f.result, /provenance.*person who answered/); assert.equal(existsSync(f.design), false);
    f.answers.provenance = { register: 'Firsthand', by: 'Named Respondent' }; f.save(); f.result();
    assert.match(f.read(), /Firsthand: Named Respondent/); assert.doesNotMatch(f.read(), /Firsthand: Test Person/);
  }
});
for (const type of ['org', 'client', 'department']) test(`${type}: the respondent cannot be the brand's own name`, () => {
  for (const by of ['Harbor Lane Dental', '  hArBoR LaNe DeNtAl  ']) {
    const f = fixture(type); f.answers.name = f.spec.boards[0].content.brandName = ' Harbor Lane Dental ';
    f.answers.provenance.by = by; f.save();
    assert.throws(f.result, /provenance\.by.*person who answered/);
    assert.equal(existsSync(f.design), false);
  }
});
test('the brand direction sets each face name in its own face and lists Foundation with its answer numbers', () => {
  const f = fixture('org'); f.result();
  const direction = f.read(join(f.work, 'brand-direction.html'));
  for (const role of ['heading', 'body']) assert.match(direction, new RegExp(`<h3 style="font-family:var\\(--font-${role}\\)">`));
  const table = direction.split('Where each choice comes from')[1];
  for (const id of ['O1', 'O2', 'O3']) assert.match(table, new RegExp(`\\b${id}\\b`), id);
});
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
for (const caller of [true, false]) test(`${caller ? '--caller preserves' : 'direct lock completes'} existing onboarding design state lines`, () => {
  const f = fixture('org'); mkdirSync(join(f.root, 'work/onboarding'), { recursive: true });
  const ag = join(f.root, 'AGENTS.md'), record = join(f.root, 'work/onboarding/run-record.md'), verification = join(f.root, 'work/onboarding/verification.md');
  const agentsBefore = '## Provides\n- design: design.md\n\n## Onboarding\nNot onboarded.\n- about: blocked\n- design: blocked (person: Test Person; waits on onboarding)\n\n## Other\n- design: untouched\n';
  const recordBefore = '## Per-key close\n- voice: blocked\n- design: provisional\n\n## Other\n- design: unchanged\n';
  writeFileSync(ag, agentsBefore); writeFileSync(record, recordBefore);
  writeFileSync(verification, '## Claims\n\n| Row | Key | Class | Claim | Anchor | Bound file | Cites | Mechanism | Exactness | Second mechanism | Outcome | Label | Search |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|\n');
  const result = run([...(caller ? ['--caller'] : []), ...f.argv]);
  assert.equal(f.read(ag), caller ? agentsBefore : agentsBefore.replace('- design: blocked (person: Test Person; waits on onboarding)', '- design: complete'));
  assert.equal(f.read(record), caller ? recordBefore : recordBefore.replace('- design: provisional', '- design: complete'));
  for (const path of [ag, record]) assert.equal(result.files.some((file) => file.path === path), !caller);
  assert.equal(result.state, 'complete'); assert.equal(designState(f.read()), 'complete');
  for (const name of ['palette.css', 'typography.css', 'brand-direction.html']) assert.ok(existsSync(join(f.work, name)));
  assert.match(f.read(verification), /\| design \| design-source \|/);
  for (const [, anchor] of f.read().matchAll(/\[(V\d+)\]/g)) assert.ok(f.read(verification).includes(`| ${anchor} | design |`));
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
  assert.match(child.stdout, /--caller/);
  assert.throws(() => run([...f.argv, '--caller', '--caller']), /duplicate/);
  assert.equal(readdirSync(f.root).includes('design.md'), false);
});
function pathToImport(file) { return new URL('file://' + file.replaceAll(' ', '%20')).href; }

test('onboarding G10/G19 accept the lock fixture with its bound shelf relocated, and reject old scale citations', () => {
  const f = fixture();
  // This run may not open a memory directory. The existing fixture keeps its
  // design at root. Run the original CLI first, then relocate only MEM in an
  // in-memory harness copy: the G10/G19 gate bodies remain byte-for-byte intact.
  writeFileSync(join(f.root, 'AGENTS.md'), '---\nroot: Test Person\ntype: personal\n---\n');
  Object.assign(f.answers, { audience: 'People making useful things.', promise: 'Useful things that last.' });
  Object.assign(f.answers.answerNumbers, { audience: 'J2b', promise: 'J2b' });
  f.answers.carried = { place: { file: '2026-11-02 V2 voice answers.md', question: 'P12' } };
  f.save(); f.result();
  const gates = process.env.BUILD_BRAND_GATES || resolve(dirname(script), '../../Onboard Root/gates.sh');
  const source = readFileSync(gates, 'utf8');
  assert.equal(source.split('MEM="$ROOT/memory"').length, 2);
  const relocated = source.replace('MEM="$ROOT/memory"', 'MEM="$ROOT"');
  for (const gate of ['G10', 'G19']) {
    const original = spawnSync('bash', [gates, '--gate', gate, f.root], { encoding: 'utf8' });
    assert.equal(original.status, 1, original.stderr);
    assert.match(original.stdout, new RegExp(`SKIP +${gate}`));
  }
  const missing = spawnSync('bash', ['-s', '--', '--gate', 'G19', f.root], { input: relocated, encoding: 'utf8' });
  assert.equal(missing.status, 1, missing.stdout + missing.stderr);
  assert.match(missing.stdout, /memory\/answers\/2026-11-02 V2 voice answers\.md.*does not resolve/);
  // Supply the cited answer outside memory; the link is only resolved for
  // existence by G19. The relocated shelf never opens a file through it.
  mkdirSync(join(f.root, 'answers'));
  writeFileSync(join(f.root, 'answers', f.answers.carried.place.file), '| P12 | A design workshop |\n');
  writeFileSync(join(f.root, 'answers', f.answers.answerNumbers.file), '| J2b | Recorded sentence and words |\n');
  symlinkSync('.', join(f.root, 'memory'));
  for (const gate of ['G10', 'G19']) {
    const checked = spawnSync('bash', ['-s', '--', '--gate', gate, f.root], { input: relocated, encoding: 'utf8' });
    assert.equal(checked.status, 0, checked.stdout + checked.stderr);
    assert.match(checked.stdout, new RegExp(`PASS +${gate}`));
  }
  const good = f.read();
  writeFileSync(f.design, good.replaceAll('Working need: lock.mjs SCALE', 'Research inference: lock.mjs SCALE'));
  const negative = spawnSync('bash', ['-s', '--', '--gate', 'G10', f.root], { input: relocated, encoding: 'utf8' });
  assert.equal(negative.status, 1);assert.equal((negative.stdout.match(/names no E<n> evidence row/g) || []).length, 6);
  writeFileSync(f.design, good);
});

test('a personal lock derives Foundation from the recorded J2b sentence and passes G10', () => {
  const f=fixture();
  writeFileSync(join(f.root,'AGENTS.md'),'---\nroot: Test Person\ntype: personal\n---\n');
  mkdirSync(join(f.root,'answers'));
  writeFileSync(join(f.root,'answers',f.answers.answerNumbers.file),`| Number | Answer |\n|---|---|\n| J2b | ${f.answers.sentence} |\n`);
  f.result();
  assert.equal(f.answers.audience,undefined);assert.equal(f.answers.promise,undefined);
  assert.equal((f.read().match(/Research inference: J2b;/g)||[]).length,2);
  const gates=process.env.BUILD_BRAND_GATES||resolve(dirname(script),'../../Onboard Root/gates.sh');
  const harness=readFileSync(gates,'utf8').replace('MEM="$ROOT/memory"','MEM="$ROOT"');
  const check=()=>spawnSync('bash',['-s','--','--gate','G10',f.root],{input:harness,encoding:'utf8'});
  const good=check();assert.equal(good.status,0,good.stdout+good.stderr);assert.match(good.stdout,/PASS +G10/);
  writeFileSync(join(f.root,'answers',f.answers.answerNumbers.file),'| Number | Answer |\n|---|---|\n| J2a | Other answer |\n');
  const missing=check();assert.equal(missing.status,1);assert.match(missing.stdout,/J2b that no file in memory\/answers\/ records/);
});

test('M5.4 item 12: personal answerNumbers reject organisation-only O1 and O2 before publication', () => {
  for (const field of ['audience', 'promise']) for (const id of ['O1', 'O2']) {
    const f = fixture(); f.answers[field] = 'A sourced personal statement.';
    f.answers.answerNumbers[field] = id; f.save();
    assert.throws(f.result, /answerNumbers.*O1 and O2.*personal/);
    assert.equal(existsSync(f.design), false);
  }
  const f = fixture(); f.answers.audience = 'A sourced personal statement.';
  f.answers.answerNumbers.audience = 'J2b'; f.save();
  assert.equal(f.result().state, 'complete');
  assert.match(f.read(), /J2b/);
});

test('M5.4 item 14: G16 accepts actual lock output and a caller relock preserves both dispute records', () => {
  const f = fixture('org');
  writeFileSync(join(f.root, 'AGENTS.md'), '---\nroot: Test Organisation\ntype: org\n---\n\n## Provides\n- design: design.md\n');
  f.result(); const prior = f.read();
  const onboarding = join(f.root, 'work/onboarding'); mkdirSync(onboarding);
  const audit = '# Audit\n\n## Findings\n\n| Finding | Disposition | Deciding check | Where checker looked | Bound file entry |\n|---|---|---|---|---|\n| A4 | disputed | Both searches disagree | Words | design.md |\n\n(Disputed: audit.md A4; producer and auditor searches disagree about Words.)\n';
  const operating = '# Open items\n\n(Disputed: audit.md A4; design.md Words; owner: Dana Reyes; status: needed.)\n';
  writeFileSync(join(onboarding, 'audit.md'), audit); writeFileSync(join(onboarding, 'operating-file.md'), operating);
  const gates = process.env.BUILD_BRAND_GATES || resolve(dirname(script), '../../Onboard Root/gates.sh');
  const harness = readFileSync(gates, 'utf8').replace('MEM="$ROOT/memory"', 'MEM="$ROOT"');
  const check = () => {
    const r = spawnSync('bash', ['-s', '--', '--gate', 'G16', f.root], { input: harness, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr); assert.match(r.stdout, /PASS +G16/);
  };
  check();
  const result = run([...f.argv, '--replace', '--caller']);
  assert.equal(f.read(result.archives.find(a => a.path === f.design).archive), prior);
  assert.equal(f.read(join(onboarding, 'audit.md')), audit);
  assert.equal(f.read(join(onboarding, 'operating-file.md')), operating);
  assert.doesNotMatch(f.read(), /\(Disputed:/);
  check();
});

test('the documented provisional state line permits locking a fully populated provisional file without --replace', () => {
  const writing=readFileSync(new URL('../writing.md',import.meta.url),'utf8');
  const sitting=readFileSync(new URL('../paths/sitting.md',import.meta.url),'utf8');
  const line=writing.match(/`(State: provisional)`/)?.[1];
  assert.ok(line,'writing must give the exact state line');assert.ok(sitting.includes('`'+line+'`'));
  const f=fixture();f.result();const provisional=f.read().replace(/^#.*\n/,`# Provisional design\n\n${line}\n`);
  writeFileSync(f.design,provisional);assert.equal(designState(provisional),'incomplete');
  assert.equal(f.result().state,'complete');
});


test('m51-r3: lock retains every role and size axis, fallback and optical sizing with source read-back', () => {
  const f = fixture(), b = f.spec.boards[0];
  b.type.heading = structuredClone(library.pairings.find(p => p.id === 'hand-made').type.heading);
  b.type.heading.files = b.type.heading.files.map(file => ({ ...file, path: resolve(parts, file.path) }));
  Object.assign(b.type.heading.sizes.display,{size:96,variations:{SOFT:100,WONK:1,opsz:144}});
  Object.assign(b.type.heading.sizes.middle,{size:30,variations:{SOFT:100,WONK:1,opsz:72}});
  Object.assign(b.type.heading.sizes.small,{size:22,variations:{SOFT:100,WONK:0,opsz:36}});
  b.type.heading.opticalSizing = 'auto';
  b.type.heading.sizes.display.opticalSizing = 'none';
  b.type.body.variations = { wght: 411, opsz: 18 };
  for (const size of Object.values(b.type.body.sizes)) size.variations = null;
  b.type.body.sizes.display.variations = { wght: 711, opsz: 32 };
  b.type.handwriting = structuredClone(b.type.body);
  b.type.handwriting.variations = { slnt: -8.5 };
  f.save(); const result = f.result();
  assert.equal(result.readBack.outcome, 'passed');
  const css = f.read(join(f.work, 'typography.css')), direction = f.read(join(f.work, 'brand-direction.html')), design = f.read();
  for (const [role, face] of Object.entries(b.type)) {
    for (const [size, settings] of Object.entries({ default: face, ...face.sizes })) {
      const axes = settings.variations ?? face.variations;
      const optical = settings.opticalSizing ?? face.opticalSizing;
      const field = `boards.0.type.${role}${size === 'default' ? '' : `.sizes.${size}`}`;
      const selector = `.type-${role}-${size}`;
      for (const output of [css, direction]) {
        const start = output.indexOf(`${selector} {`);
        assert.ok(start >= 0, selector);
        const rule = output.slice(start, output.indexOf('}', start));
        for (const [axis, value] of Object.entries(axes || {})) assert.ok(rule.includes(`"${axis}" ${value}`), `${selector}: ${axis} ${value}`);
        if (optical) assert.ok(rule.includes(`font-optical-sizing: ${optical};`), selector);
      }
      for (const [axis, value] of Object.entries(settings.variations || {})) {
        for (const output of [css, direction, design]) assert.ok(output.includes(`${field}.variations.${axis}`), `${field}.${axis}`);
        assert.ok(design.includes(`"${axis}" ${value}`));
      }
      if (settings.opticalSizing) for (const output of [css, direction, design]) assert.ok(output.includes(`${field}.opticalSizing`));
      if (size !== 'default') assert.ok(direction.includes(`class="type-${role}-${size}"`), selector);
    }
  }
  assert.match(direction, /body\{[^}]*font-variation-settings:[^}]*"wght" 411/);
  assert.match(direction, /h1\{[^}]*font-variation-settings:[^}]*"opsz" 72/);
  assert.doesNotMatch(direction.match(/h1\{[^}]*\}/)[0], /"opsz" 144/);
  assert.match(direction, /h2\{[^}]*font-variation-settings:[^}]*"opsz" 36/);
  assert.match(direction, /h3\{[^}]*font-variation-settings:[^}]*"WONK" 0/);
});

test('m51-r3: malformed axes and optical sizing fail before lock publication', () => {
  for (const [change, reason] of [
    [b => { b.type.heading.variations = { bad: 1 }; }, /variations/],
    [b => { b.type.body.sizes.small.variations = { opsz: '18' }; }, /variations/],
    [b => { b.type.heading.opticalSizing = 'none; color:red'; }, /opticalSizing/],
    [b => { b.type.heading.sizes.middle.opticalSizing = 'invalid'; }, /opticalSizing/],
  ]) {
    const f = fixture(); change(f.spec.boards[0]); f.save();
    assert.throws(f.result, reason); assert.equal(existsSync(f.design), false);
  }
});


test('direction maps each working size to the nearest locked cut for its own role', () => {
  const f = fixture(), b = f.spec.boards[0];
  for (const [role, sizes] of Object.entries({ heading: [32, 20, 25], body: [17, 40, 10] })) {
    for (const [i, size] of ['display', 'middle', 'small'].entries()) {
      b.type[role].sizes[size].size = sizes[i];
      b.type[role].sizes[size].variations = { opsz: sizes[i], wght: 400 + i };
    }
  }
  f.save(); f.result();
  const direction = f.read(join(f.work, 'brand-direction.html'));
  for (const [tag, level, role, expected] of [['h1', 'display', 'heading', 32], ['h2', 'heading', 'heading', 25], ['h3', 'subheading', 'heading', 20], ['body', 'body', 'body', 17]]) {
    const rule = direction.match(new RegExp(`(?:^|[}>;])${tag}\\{([^}]*)\\}`))[1];
    assert.match(rule, new RegExp(`"opsz" ${expected}(?:;|,)`));
    assert.ok(rule.includes(`var(--text-${level})`));
    const working = SCALE.base * SCALE.ratio ** SCALE.levels[level];
    assert.equal(Math.abs(expected - working), Math.min(...Object.values(b.type[role].sizes).map(s => Math.abs(s.size - working))));
  }
});

for (const custom of [false, true]) test(`relock relocates only moved verification anchors, preserving outcomes (custom archive: ${custom})`, () => {
  const f = fixture('org'); mkdirSync(join(f.root, 'work/onboarding'), { recursive: true });
  const verification = join(f.root, 'work/onboarding/verification.md');
  const old = '| V4 | about | other | An old claim | [V4] | about.md | old | read | no | - | located | Verified | - |';
  const negative = '## Negative claims\n\n| V9 | Earlier absence | - | old | yes | reader | located |\n';
  writeFileSync(verification, '## Claims\n\n| Row | Key | Class | Claim | Anchor | Bound file | Cites | Mechanism | Exactness | Second mechanism | Outcome | Label | Search |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|\n' + old + '\n\n' + negative);
  if (custom) {
    writeFileSync(join(f.root, 'AGENTS.md'), 'Archive home: archives/brand\n');
    f.answers.paths = { archive: 'archives/brand' }; f.save();
  }
  f.result();
  const before = f.read(verification), designBefore = f.read();
  const result = run([...f.argv, '--replace']);
  const archive = result.archives.find(a => a.path === f.design).archive.slice(f.root.length + 1);
  const rows = text => text.split('\n').filter(l => /^\| V\d+ \| design \|/.test(l));
  const after = f.read(verification);
  for (const row of rows(before)) {
    const anchor = row.split('|')[5].trim(); assert.ok(designBefore.includes(anchor));
    assert.ok(after.includes(row.replace('| design.md |', '| ' + archive + ' |')), anchor + ' must resolve to archive with every other cell unchanged');
  }
  assert.ok(after.includes(old)); assert.ok(after.includes(negative));
  assert.ok(rows(after).some(r => r.includes('| design.md |')));
  run([...f.argv, '--replace']);
  for (const row of rows(before)) assert.ok(f.read(verification).includes(row.replace('| design.md |', '| ' + archive + ' |')));
});

for (const type of ['personal', 'org', 'client', 'department']) test(`${type}: every lock claim cites its recorded answer as well as its source field`, () => {
  const f = fixture(type); f.answers.off = ['natural']; f.save();
  const result = f.result(), design = f.read();
  const citation = (text, id, field) => {
    const line = design.split('\n').find(l => l.startsWith(text));
    assert.ok(line, text);
    assert.ok(line.includes(`memory/answers/${f.answers.answerNumbers.file}`), line);
    assert.ok(line.includes(`; ${id};`) || line.includes(`: ${id};`), line);
    assert.ok(line.includes(field), line);
  };
  citation('I build useful things', 'J2b', '#sentence');
  citation('Useful, not ornamental', 'J2b', '#words.0.word');
  citation('Keep Useful', 'J2b', '#words.0.not');
  const ids = ['mode','feel','history','strength','technology','style','posture','mood','place'];
  ids.forEach((id, i) => citation(`T${i+1}:`, `T${i+1}`, `#taps.${id}`));
  citation('Taste description as shown, before the parts marked off below: Natural and strong', 'J3a', '#readBack.text');
  citation('Marked off by the member:', 'J3b', '#off.0');
  citation('Whole look picked:', 'L4', '#looks.0');
  citation('Round 1:', 'C6', '#rounds.0.steer');
  citation('Complete at the lock.', 'K1', '#lock.question');
  citation('light ground:', 'C6', '#boards.0.palette.light.ground');
  citation('light ground:', 'K1', '#boards.0.palette.light.ground');
  if (type !== 'personal') for (const [prefix, id, field] of [['For:', 'O1', 'audience'], ['Promise:', 'O2', 'promise'], ['Final say:', 'O3', 'finalSay']]) citation(prefix, id, `#${field}`);
  const rules = design.split('\n').filter(l => /\((?:Firsthand|Research inference):/.test(l));
  for (const line of rules) assert.match(line, /(?:;|:) [A-Z][0-9][a-z0-9]*;.*memory\/answers\/[^;]+design answers\.md/, line);
  assert.ok(result.readBack.claims > 90); assert.ok(!result.unusedAnswerFields.includes('answerNumbers'));
  const direction = f.read(join(f.work, 'brand-direction.html'));
  assert.ok(direction.includes(`L4; memory/answers/${f.answers.answerNumbers.file}`));
});

test('carried place cites only P12 and its dated voice record, never T9', () => {
  const f = fixture(); f.answers.carried = { place: { file: '2026-11-01 V3 voice answers.md', question: 'P12' } }; f.save(); f.result();
  const line = f.read().split('\n').find(l => l.startsWith("Place, from the voice coach's"));
  assert.ok(line.includes('; P12; memory/answers/2026-11-01 V3 voice answers.md'), line);
  assert.ok(line.includes('#taps.place'), line); assert.doesNotMatch(line, /T9/);
});

test('recorded look and board numbers come from the saved map, with same-page picks retained', () => {
  const f = fixture(); f.answers.looks.push('look:friendly-rounded/sunflower-and-espresso-muted/stitch', 'look:playful-display/pastel-sorbet-bold/riso');
  f.answers.answerNumbers.looks = ['L4', 'L4', 'L9'];
  f.answers.rounds.push({ question: 'Later board page', steer: 'Keep it quiet' });
  f.answers.answerNumbers.rounds = ['C6', 'C11']; f.answers.answerNumbers.board = 'C11'; f.save(); f.result();
  const lines = f.read().split('\n').filter(l => l.startsWith('Whole look picked:'));
  for (const [i, id] of ['L4', 'L4', 'L9'].entries()) assert.ok(lines[i].includes(`; ${id}; memory/answers/${f.answers.answerNumbers.file}`));
  assert.match(f.read().split('\n').find(l => l.startsWith('Later board page:')), /; C11;/);
  assert.match(f.read().split('\n').find(l => l.startsWith('light ground:')), /; C11;/);
});

test('lock refuses missing, malformed or incomplete answer maps before writing', () => {
  for (const mutate of [
    a => { delete a.answerNumbers; },
    a => { a.answerNumbers.file = 'design answers.md'; },
    a => { a.answerNumbers.file = '../2026-11-02 design answers.md'; },
    a => { a.answerNumbers.board = 'C0'; },
    a => { a.answerNumbers.looks = []; },
    a => { a.answerNumbers.looks = ['C4']; },
    a => { a.answerNumbers.rounds = ['C6', 'C7']; },
    a => { a.answerNumbers.rounds = ['Round 1']; },
    a => { a.answerNumbers.extra = 'L1'; },
  ]) {
    const f = fixture(); mutate(f.answers); f.save();
    assert.throws(f.result, /answerNumbers/); assert.equal(existsSync(f.design), false);
  }
});
test('legacy layout explicitly records the absence of an authorised numbered record', () => {
  const f = fixture(); f.answers.answerNumbers = null; f.save();
  const result = f.result(); assert.equal(result.state, 'complete');
  assert.doesNotMatch(f.read(), /memory\/answers\//); assert.match(f.read(), /Firsthand: Test Person/);
  assert.ok(f.read().includes('#sentence')); assert.ok(!result.unusedAnswerFields.includes('answerNumbers'));
});
for (const type of ['org', 'client', 'department']) test(`${type}: numbered lock citations retain a passing G10`, () => {
  const f = fixture(type);
  writeFileSync(join(f.root, 'AGENTS.md'), `---\nroot: Test Brand\ntype: ${type}\n---\n\n## Provides\n- design: design.md\n`);
  mkdirSync(join(f.root, 'work/onboarding'), { recursive: true });
  writeFileSync(join(f.root, 'work/onboarding/run-record.md'), '### Who confirms and on what basis\nname: Test Respondent\n');
  mkdirSync(join(f.root, 'answers'));
  writeFileSync(join(f.root, 'answers', f.answers.answerNumbers.file), '| J2b | Sentence and words |\n| O1 | Audience |\n| O2 | Promise |\n| O3 | Final say |\n| C6 | Board page |\n| L4 | Looks page |\n| K1 | Lock |\n');
  f.result();
  const gates = process.env.BUILD_BRAND_GATES || resolve(dirname(script), '../../Onboard Root/gates.sh');
  const harness = readFileSync(gates, 'utf8').replace('MEM="$ROOT/memory"', 'MEM="$ROOT"');
  const checked = spawnSync('bash', ['-s', '--', '--gate', 'G10', f.root], { input: harness, encoding: 'utf8' });
  assert.equal(checked.status, 0, checked.stdout + checked.stderr); assert.match(checked.stdout, /PASS +G10/);
});
