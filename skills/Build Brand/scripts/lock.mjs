#!/usr/bin/env node
// Built-ins only. standards/script-contract.md governs this command.
import { readFileSync, writeFileSync, realpathSync, lstatSync, statSync, readdirSync, mkdirSync, renameSync, unlinkSync } from 'node:fs';
import { dirname, basename, resolve, relative, isAbsolute, join, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

const SKILL = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const TAPS = join(SKILL, 'parts/taps.json');
export const HEADINGS = ['Color', 'Typography', 'Layout Habits', 'Source Assets and Templates', 'Prohibitions', 'Foundation', 'Words', 'Visual Personality', 'Brand Board', 'Mark', 'Imagery and Illustration', 'Icons and Graphic Elements'];
const ROLES = { ground: 'Main page', panel: 'Supporting surfaces', text: 'Paragraphs and names', headline: 'Headlines', smallPrint: 'Small print on ground', deep: 'Retained deep role', pop: 'Primary action surface (pop colour)', onPop: 'Text on primary action', mark: 'Graphic accent', cardFront: 'Card front', cardFrontText: 'Card front text', cardFrontSmallPrint: 'Card front small print', cardBack: 'Card back', cardBackText: 'Card back text', cardBackMark: 'Card back graphic accent', sub: 'Secondary text', note: 'Notes', panelSmallPrint: 'Small print on supporting surfaces', hairline: 'Decorative hairline' };
export const SCALE = Object.freeze({ base: 16, ratio: 1.25, levels: { caption: -1, body: 0, subheading: 1, heading: 2, display: 3 }, lines: { caption: 1.4, body: 1.5, subheading: 1.35, heading: 1.2, display: 1.1 } });
const HELP = `Write the four settled brand outputs from one assembled, locked board.
Usage: node lock.mjs --spec <absolute.json> --answers <absolute.json>
                     --root <absolute directory> --design <absolute.md>
                     --work <absolute directory> [--replace]
       node lock.mjs help
Options:
  --spec       assemble.mjs's board JSON (not a selection).
  --answers    Answers JSON, including lock.confirmed, board, question,
               specSha256 and contactSheetPassed; schema in parts/parts.md.
  --root       Existing owning root. All destinations must stay inside it.
  --design     The root's resolved Provides design binding; no guessed path.
  --work       Brand work directory, beside the boards. Writes palette.css,
               typography.css and brand-direction.html here.
  --replace    Permit replacing a complete design; archive originals first.
  --help, -h   Show usage without reading files.
Also updates existing AGENTS.md Onboarding design state, and existing
work/onboarding/{verification,run-record}.md design records only.
Archives: beside each replaced file in zArchive/YY-MM-DD Vn - original,
or answers.paths.archive when the root declares a different archive home.
No packages, configuration, installs, stdin or network. Unknown flags fail.
Success: one JSON object (files, headings, readBack, elapsedMs), exit 0.
Failure: JSON on stderr only, exit 1. All inputs are validated before writing.`;
const fail = (at, why) => { throw new Error(`${at}: ${why}. Correct the input; see lock.mjs --help.`); };
const own = (o, k) => Object.hasOwn(o, k);
const inside = (a, b) => { const r = relative(a, b); return !r || (!isAbsolute(r) && r !== '..' && !r.startsWith(`..${sep}`)); };
function str(v, at) { if (typeof v !== 'string' || !v.trim() || /[\x00-\x1f\u2028\u2029]/.test(v)) fail(at, 'expected non-empty single-line text'); return v; }
function obj(v, at) { if (!v || typeof v !== 'object' || Array.isArray(v)) fail(at, 'expected an object'); return v; }
function closed(v, keys, at) { obj(v, at); for (const key of Object.keys(v)) if (!keys.includes(key)) fail(`${at}.${key}`, 'unknown field'); return v; }
function arr(v, at) { if (!Array.isArray(v)) fail(at, 'expected an array (empty when none)'); return v; }
function num(v, at, min = 0, max = 1000) { if (!Number.isFinite(v) || v < min || v > max) fail(at, `expected a number from ${min} to ${max}`); return v; }
const md = (s) => String(s).replace(/[\\`*_{}\[\]<>|#]/g, '\\$&');
const html = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const comment = (s) => String(s).replace(/\*\//g, '* /').replace(/[\r\n]/g, ' ');
const cssString = (s) => JSON.stringify(s).replace(/</g, '\\3c ');
export const sha256 = (s) => createHash('sha256').update(s).digest('hex');

// Resolve even nonexistent descendants; a dangling symlink never earns clearance.
export function canonical(candidate) {
  if (typeof candidate !== 'string' || !isAbsolute(candidate) || candidate.includes('\0')) fail('path', 'supply an absolute local path');
  let head = resolve(candidate); const tail = [];
  for (;;) {
    try {
      lstatSync(head);
      try { return join(realpathSync(head), ...tail); } catch { fail('path', 'broken symbolic link or unreadable ancestor'); }
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      const parent = dirname(head); if (parent === head) fail('path', 'cannot canonicalize');
      tail.unshift(basename(head)); head = parent;
    }
  }
}
function screen(p, destination = false) {
  const result = canonical(p);
  if (result.split(sep).some((part) => /^\.env(?:\.|$)/i.test(part))) fail('path', 'protected .env path');
  if (destination && inside(SKILL, result)) fail('path', 'destination is inside this skill; choose the owning root');
  return result;
}
function read(p) { try { if (!statSync(p).isFile()) fail('path', 'expected regular file'); return readFileSync(p, 'utf8'); } catch (e) { if (e.message?.includes('--help')) throw e; fail('path', 'file is absent or unreadable'); } }
function existing(p) { try { return statSync(p); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } }
function json(bytes, at) { try { return JSON.parse(bytes); } catch { fail(at, 'invalid JSON'); } }
function valueAt(input, field) { return field.split('.').reduce((v, k) => v?.[k], input); }
function options(argv) {
  const flags = ['--spec', '--answers', '--root', '--design', '--work'];
  for (const v of argv) if (v.startsWith('-') && ![...flags, '--replace', '--help', '-h'].includes(v)) fail(v, 'unknown option');
  if (!argv.length || argv.includes('--help') || argv.includes('-h') || (argv.length === 1 && argv[0] === 'help')) return null;
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]; if (![...flags, '--replace'].includes(flag)) fail(flag, 'unexpected argument');
    if (own(out, flag)) fail(flag, 'duplicate option');
    out[flag] = flag === '--replace' ? true : str(argv[++i], flag);
  }
  for (const flag of flags) if (!out[flag]) fail(flag, 'required option');
  return out;
}

export function designState(bytes) {
  if (bytes == null) return 'absent';
  if (/^(?:state:\s*)?provisional\b/im.test(bytes)) return 'incomplete';
  const sections = [...bytes.matchAll(/^## (.+)\r?\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm)];
  const full = HEADINGS.every((h) => {
    const matches = sections.filter((s) => s[1] === h);
    return matches.length === 1 && matches[0][2].trim() && !/^\*[^*].*\*\s*$/m.test(matches[0][2]);
  });
  const answered = sections.some((s) => s[2].replace(/\[(?:Not available|Unverified|Estimated|Verified)[^\]]*\]/g, '').trim());
  return full && answered ? 'complete' : 'incomplete';
}

function validate(spec, a, bytes, tapData) {
  obj(spec, 'spec'); obj(a, 'answers');
  if (spec.layout !== 'board' || !Array.isArray(spec.boards)) fail('spec', 'unassembled spec; run assemble.mjs first');
  const lock = closed(a.lock, ['confirmed', 'contactSheetPassed', 'specSha256', 'board', 'question'], 'lock');
  if (lock.confirmed !== true || lock.contactSheetPassed !== true) fail('lock', 'unlocked or unchecked board; record the member lock and passed Contact Sheet checks');
  if (lock.specSha256 !== sha256(bytes)) fail('lock.specSha256', 'lock does not identify these exact spec bytes');
  str(lock.question, 'lock.question');
  const matches = spec.boards.filter((b) => b.number === lock.board);
  if (matches.length !== 1) fail('lock.board', 'must identify exactly one board');
  const b = matches[0]; const index = spec.boards.indexOf(b);
  for (const k of ['name', 'sentence']) str(a[k], k);
  if (!['personal', 'org', 'client', 'department'].includes(a.type)) fail('type', 'use personal, org, client or department');
  if (a.provenance) { closed(a.provenance, ['register', 'by'], 'provenance'); if (!['Firsthand', 'Secondhand', 'Public statement'].includes(a.provenance.register)) fail('provenance.register', 'unknown sourcing register'); str(a.provenance.by, 'provenance.by'); }
  if (a.paths) closed(a.paths, ['archive'], 'paths');
  arr(a.words, 'words'); if (!a.words.length) fail('words', 'supply the chosen words');
  a.words.forEach((w, i) => { closed(w, ['word', 'not'], `words.${i}`); str(w.word, `words.${i}.word`); str(w.not, `words.${i}.not`); });
  obj(a.taps, 'taps');
  for (const q of tapData.questions) if (!q.options.some((v) => v.id === a.taps[q.id])) fail(`taps.${q.id}`, 'use an option id from parts/taps.json');
  for (const k of Object.keys(a.taps)) if (!tapData.questions.some((q) => q.id === k)) fail(`taps.${k}`, 'unknown question');
  const offParts = [...Object.keys(tapData.axes), ...Object.values(tapData.axes).flat(), 'darkLed', 'brightColour', ...Object.values(a.taps)];
  arr(a.off ?? [], 'off').forEach((v) => { if (!offParts.includes(v)) fail('off', 'use a selected option id, axis or pole from taps.json'); });
  if (new Set(a.off ?? []).size !== (a.off ?? []).length) fail('off', 'duplicate read-back part');
  const unavailable = closed(a.unavailable || {}, ['readBack', 'looks', 'rounds', 'photoRules'], 'unavailable');
  for (const k of ['readBack', 'looks', 'rounds']) {
    if (a[k] == null) str(unavailable[k], `unavailable.${k}`);
    else if (k === 'readBack') { closed(a[k], ['text', 'confirmed'], k); str(a[k].text, 'readBack.text'); if (a[k].confirmed !== true) fail(k, 'read-back must be confirmed'); }
    else arr(a[k], k);
  }
  if (a.looks) { a.looks.forEach((look, i) => str(look, `looks.${i}`)); if (new Set(a.looks).size !== a.looks.length) fail('looks', 'duplicate whole look'); }
  if (a.rounds) a.rounds.forEach((r, i) => { closed(r, ['question', 'steer'], `rounds.${i}`); str(r.question, `rounds.${i}.question`); str(r.steer, `rounds.${i}.steer`); });
  if (a.type !== 'personal') for (const k of ['audience', 'promise', 'finalSay']) str(a[k], k);
  if (a.type === 'personal') for (const k of ['audience', 'promise']) if (a[k] != null) str(a[k], k);
  arr(a.assets, 'assets').forEach((asset, i) => { closed(asset, ['path', 'governs', 'kind'], `assets.${i}`); for (const k of ['path', 'governs', 'kind']) str(asset[k], `assets.${i}.${k}`); });
  str(b.name, 'board.name'); num(b.buttonRadius, 'buttonRadius', 0, 100);
  if (!['light', 'dark'].includes(b.primaryMode)) fail('primaryMode', 'use light or dark');
  obj(b.palette, 'palette');
  for (const mode of ['light', 'dark']) {
    obj(b.palette[mode], `palette.${mode}`);
    for (const role of Object.keys(ROLES)) if (!/^#(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(b.palette[mode][role])) fail(`palette.${mode}.${role}`, 'missing assembled opaque sRGB role');
    for (const role of Object.keys(b.palette[mode])) if (!own(ROLES, role)) fail(`palette.${mode}.${role}`, 'unknown colour role');
  }
  arr(b.palette.swatches, 'palette.swatches').forEach((s) => { str(s.name, 'swatch.name'); str(s.role, 'swatch.role'); if (!own(ROLES, s.key)) fail('swatch.key', 'unknown role'); num(s.share, 'swatch.share', 0, 100); });
  for (const mode of ['light', 'dark']) if (b.palette.modeSwatches?.[mode]) arr(b.palette.modeSwatches[mode], `modeSwatches.${mode}`).forEach((s) => { str(s.name, 'swatch.name'); str(s.role, 'swatch.role'); if (!own(ROLES, s.key)) fail('swatch.key', 'unknown role'); num(s.share, 'swatch.share', 0, 100); });
  closed(b.type, ['heading', 'body', 'handwriting'], 'type');
  for (const role of ['heading', 'body', ...(own(b.type, 'handwriting') ? ['handwriting'] : [])]) {
    const f = obj(b.type[role], `type.${role}`);
    for (const k of ['family', 'licence', 'description', 'sample']) str(f[k], `type.${role}.${k}`);
    arr(f.files, `type.${role}.files`); if (!f.files.length) fail(`type.${role}.files`, 'missing assembled font files');
    for (const file of f.files) { str(file.path, 'font.path'); if (!isAbsolute(file.path)) fail('font.path', 'unassembled relative font path'); if (file.style !== 'normal') fail('font.style', 'only normal supported'); if (Array.isArray(file.weight)) { if (file.weight.length !== 2 || file.weight[0] > file.weight[1]) fail('font.weight', 'expected ordered bounds'); file.weight.forEach((w) => num(w, 'font.weight', 1)); } else num(file.weight, 'font.weight', 1); }
    for (const size of ['display', 'middle', 'small']) { obj(f.sizes?.[size], `type.${role}.sizes.${size}`); num(f.sizes[size].weight, 'font size weight', 1); }
  }
  if (new Set([b.type.heading.family, b.type.body.family]).size > 2) fail('type', 'at most two primary families');
  obj(b.graphics, 'graphics'); str(b.graphics.title, 'graphics.title'); str(b.graphics.description, 'graphics.description'); str(b.graphics.hero?.shape, 'graphics.hero.shape');
  arr(b.graphics.legend, 'graphics.legend').forEach((s) => { str(s.name, 'legend.name'); str(s.use, 'legend.use'); });
  for (const k of ['pattern', 'texture']) { obj(b.graphics[k], `graphics.${k}`); for (const mode of ['light', 'dark']) num(b.graphics[k].strength?.[mode], `${k}.strength.${mode}`, 0, 1); }
  num(b.graphics.pattern.angle, 'pattern.angle', -180, 180);
  obj(b.content, 'content');
  if (b.content.brandName !== a.name) fail('name', 'answer differs from locked board content.brandName');
  // Board headlines may split the adopted sentence over headline and body.
  if (![b.content.sentence, `${b.content.sentence}, ${b.content.body}`.replace(/, And /, ', and ')].includes(a.sentence)) fail('sentence', 'answer differs from locked board sentence/body');
  if (!Array.isArray(b.words) || a.words.length !== b.words.length || a.words.some((w, i) => w.word !== b.words[i]?.word || w.not !== b.words[i]?.not)) fail('words', 'answers differ from locked board words');
  if (!b.content.photoRules) str(unavailable.photoRules, 'unavailable.photoRules'); else str(b.content.photoRules, 'content.photoRules');
  if (b.content.never) arr(b.content.never, 'content.never').forEach((v) => str(v, 'content.never'));
  obj(b.monogram, 'monogram');
  return { b, index };
}

function paletteCSS(b, ref) {
  const rows = [`/* Settled locked roles. Values unchanged. Source: ${comment(ref)}. */`, ':root {'];
  for (const mode of ['light', 'dark']) for (const role of Object.keys(ROLES)) rows.push(`  --locked-${mode}-${kebab(role)}: ${b.palette[mode][role]}; /* ${ROLES[role]}; ${comment(ref)}.palette.${mode}.${role} */`);
  rows.push('}');
  const aliases = (mode, selector) => `${selector} {\n${Object.keys(ROLES).map((role) => `  --brand-${kebab(role)}: var(--locked-${mode}-${kebab(role)}); /* ${ROLES[role]} */`).join('\n')}\n}`;
  rows.push(aliases(b.primaryMode, ':root'), '@media (prefers-color-scheme: dark) {', aliases('dark', '  :root:not([data-theme="light"])'), '}', aliases('light', '[data-theme="light"]'), aliases('dark', '[data-theme="dark"]'));
  return rows.join('\n') + '\n';
}
function typographyCSS(b, ref) {
  const rows = [`/* Working need: lock.mjs SCALE, 16px base x 1.25^step; five fixed levels.`, `   Sizes above body use equal-bound rem clamps; no unchosen responsive ratio.`, `   Line heights add .05 in dark. Families/weights/licences: ${comment(ref)}.type. */`];
  for (const [role, f] of Object.entries(b.type)) {
    if (!['heading', 'body', 'handwriting'].includes(role)) continue;
    rows.push(`/* ${role}: ${comment(f.licence)}; ${comment(ref)}.type.${role}.licence */`);
    for (const file of f.files) rows.push(`@font-face { font-family: ${cssString(f.family)}; src: url(${cssString(pathToFileURL(file.path).href)}); font-weight: ${Array.isArray(file.weight) ? file.weight.join(' ') : file.weight}; font-style: normal; font-display: swap; }`);
  }
  rows.push(':root {');
  for (const role of ['heading', 'body', ...(b.type.handwriting ? ['handwriting'] : [])]) rows.push(`  --font-${role}: ${cssString(b.type[role].family)}; /* ${comment(ref)}.type.${role}.family */`);
  for (const [name, step] of Object.entries(SCALE.levels)) {
    const size = SCALE.ratio ** step, rem = `${size}rem`;
    rows.push(`  --text-${name}: ${step > 0 ? `clamp(${rem}, ${rem}, ${rem})` : rem}; /* Working need: SCALE step ${step} */`);
    for (const [mode, extra] of [['light', 0], ['dark', .05]]) rows.push(`  --type-line-${name}-${mode}: ${(SCALE.lines[name] + extra).toFixed(2)}; /* Working need: SCALE.lines.${name} */`);
  }
  for (const [key, role, size] of [['body', 'body', 'middle'], ['strong', 'body', 'display'], ['heading', 'heading', 'middle'], ['display-light', 'heading', 'display'], ['display-dark', 'heading', 'display']]) rows.push(`  --weight-${key}: ${b.type[role].sizes[size].weight}; /* ${comment(ref)}.type.${role}.sizes.${size}.weight */`);
  rows.push('  --text-ui: 1rem; /* Working need: essential controls stay at 16px */', '  --tracking-body: 0; /* Working need: reading text */', '  --tracking-heading: -0.01em; /* Working need: heading hierarchy */', '  --tracking-caption: 0.05em; /* Working need: optional metadata */', '  --measure-body: 65ch; /* Working need: readable line length */', '  --measure-heading: 18ch; /* Working need: short headings */', '  --rhythm-base: calc(var(--text-body) * var(--line-body)); /* Working need: body line */', ...[2, 3, 4].map((n) => `  --rhythm-${n}: calc(var(--rhythm-base) * ${n}); /* Working need: body rhythm */`), '}');
  const aliases = (mode, selector) => `${selector} {\n${Object.keys(SCALE.levels).map((n) => `  --line-${n}: var(--type-line-${n}-${mode});`).join('\n')}\n  --weight-display: var(--weight-display-${mode});\n  --rhythm-base: calc(var(--text-body) * var(--line-body));\n${[2, 3, 4].map((n) => `  --rhythm-${n}: calc(var(--rhythm-base) * ${n});`).join('\n')}\n}`;
  rows.push(aliases(b.primaryMode, ':root'), '@media (prefers-color-scheme: dark) {', aliases('dark', '  :root:not([data-theme="light"])'), '}', aliases('light', '[data-theme="light"]'), aliases('dark', '[data-theme="dark"], .type-on-dark'));
  return rows.join('\n') + '\n';
}

function makeDocuments(spec, a, index, paths, tapData) {
  const b = spec.boards[index], prefix = `boards.${index}`, claims = [];
  const S = (field) => ({ source: 'spec', field: `${prefix}.${field}` });
  const A = (field) => ({ source: 'answers', field });
  const ref = (r) => r.source === 'script' ? 'lock.mjs#SCALE' : `${r.source === 'spec' ? paths.spec : paths.answers}#${r.field}`;
  const tap = (n) => { const q = tapData.questions[n - 1]; return { id: q.id, value: a.taps[q.id], label: q.options.find((o) => o.id === a.taps[q.id]).label }; };
  const register = a.provenance ? `${a.provenance.register}: ${a.provenance.by}` : `Firsthand: ${a.name}`;
  const sections = Object.fromEntries(HEADINGS.map((h) => [h, []]));
  const add = (heading, text, refs, inference = false) => {
    const source = refs.map(ref).join('; ');
    const citation = inference ? `Research inference: ${source}` : `${register}; ${source}`;
    const claim = { heading, text, refs, citation }; claims.push(claim); sections[heading].push(claim);
  };
  const label = (heading, reason) => sections[heading].push({ label: `[Not available: ${reason}]` });
  const status = { heading: 'Lock', text: `Complete at the lock. Colour and lettering are settled. Lock: ${a.lock.question}.`, refs: [A('lock.question')], citation: `${register}; ${ref(A('lock.question'))}` };
  claims.push(status);
  for (const mode of ['light', 'dark']) for (const [role, description] of Object.entries(ROLES)) add('Color', `${mode} ${role}: ${b.palette[mode][role]}. ${description}.`, [S(`palette.${mode}.${role}`)]);
  add('Color', `Use ${b.primaryMode} first; both modes are settled. Colour settings: ${paths.palette}.`, [S('primaryMode')]);
  for (const [i, sw] of b.palette.swatches.entries()) add('Color', `${sw.name}: ${sw.role}, ${sw.share}% of page weight.`, [S(`palette.swatches.${i}.name`), S(`palette.swatches.${i}.role`), S(`palette.swatches.${i}.share`)]);
  for (const role of ['heading', 'body', ...(b.type.handwriting ? ['handwriting'] : [])]) {
    const f = b.type[role]; add('Typography', `${role}: ${f.family}. ${f.description} Licence: ${f.licence}.`, [S(`type.${role}.family`), S(`type.${role}.description`), S(`type.${role}.licence`)]);
  }
  for (const [level, step] of Object.entries(SCALE.levels)) add('Typography', `${level}: ${SCALE.base * SCALE.ratio ** step}px; line height ${SCALE.lines[level]} light, ${(SCALE.lines[level] + .05).toFixed(2)} dark.`, [{ source: 'script', field: 'SCALE' }], true);
  add('Typography', `Use the settled faces and scale in ${paths.typography}. Sizes serve a working need; they are not additional member choices.`, [{ source: 'script', field: 'SCALE' }], true);
  add('Layout Habits', `${b.graphics.description} Use ${b.buttonRadius}px button corners.`, [S('graphics.description'), S('buttonRadius')]);
  for (let n = 1; n <= 4; n++) { const t = tap(n); add('Layout Habits', `Visual choice Q${n}: ${t.label} (${t.value}).`, [A(`taps.${t.id}`)]); }
  if (a.rounds) a.rounds.forEach((r, i) => add('Layout Habits', `${r.question}: ${r.steer}.`, [A(`rounds.${i}.question`), A(`rounds.${i}.steer`)])); else label('Layout Habits', a.unavailable.rounds);
  add('Source Assets and Templates', `Locked board: ${paths.spec}, board ${b.number}, ${b.name}; governs the whole look.`, [S('number'), S('name')]);
  for (const [i, asset] of a.assets.entries()) add('Source Assets and Templates', `${asset.path}: ${asset.governs}.`, [A(`assets.${i}.path`), A(`assets.${i}.governs`)]);
  if (!a.assets.length) label('Source Assets and Templates', 'no kept assets supplied');
  for (const [i, w] of a.words.entries()) {
    add('Prohibitions', `Keep ${w.word}; do not make the brand ${w.not}.`, [A(`words.${i}.word`), A(`words.${i}.not`)]);
    add('Words', `${w.word}, not ${w.not}.`, [A(`words.${i}.word`), A(`words.${i}.not`)]);
  }
  add('Words', a.sentence, [A('sentence')]);
  if (a.audience) add('Foundation', `For: ${a.audience}`, [A('audience')]);
  else add('Foundation', `Who it is for is stated in the chosen sentence: ${a.sentence}`, [A('sentence')], true);
  if (a.promise) add('Foundation', `Promise: ${a.promise}`, [A('promise')]);
  else add('Foundation', `The promise is the chosen sentence: ${a.sentence}`, [A('sentence')], true);
  if (a.finalSay) add('Foundation', `Final say: ${a.finalSay}`, [A('finalSay')]);
  for (const gap of ['Alternatives', 'Open space', 'Success measures']) sections.Foundation.push({ label: `${gap}: [Not available: not asked]` });
  for (let n = 1; n <= 9; n++) { const t = tap(n); add('Visual Personality', `Q${n}: ${t.label} (${t.value})`, [A(`taps.${t.id}`)]); }
  if (a.readBack) { add('Visual Personality', a.readBack.text, [A('readBack.text')]); if (a.off?.length) add('Visual Personality', `Dropped from the steer: ${a.off.join(', ')}.`, a.off.map((_, i) => A(`off.${i}`))); }
  else label('Visual Personality', a.unavailable.readBack);
  if (a.looks) a.looks.forEach((look, i) => add('Visual Personality', `Whole look picked: ${look}.`, [A(`looks.${i}`)])); else label('Visual Personality', a.unavailable.looks);
  add('Brand Board', `${b.name}, board ${b.number}, ${b.primaryMode} first: ${paths.spec}. Colours: ${b.palette.light.ground} / ${b.palette.dark.ground}, pop ${b.palette.light.pop} / ${b.palette.dark.pop}. Faces: ${b.type.heading.family} and ${b.type.body.family}. ${b.graphics.description}`, [S('name'), S('number'), S('primaryMode'), S('palette.light.ground'), S('palette.dark.ground'), S('palette.light.pop'), S('palette.dark.pop'), S('type.heading.family'), S('type.body.family'), S('graphics.description')]);
  if (b.content.photoRules) { add('Imagery and Illustration', b.content.photoRules, [S('content.photoRules')]); add('Brand Board', b.content.photoRules, [S('content.photoRules')]); }
  else { label('Imagery and Illustration', a.unavailable.photoRules); label('Brand Board', a.unavailable.photoRules); }
  if (b.content.never?.length) add('Imagery and Illustration', `Never: ${b.content.never.join(', ')}.`, b.content.never.map((_, i) => S(`content.never.${i}`)));
  if (b.monogram.file) add('Mark', `Keep the supplied logo ${b.monogram.file}.`, [S('monogram.file')]); else label('Mark', 'a logo is offered after the lock');
  add('Icons and Graphic Elements', `${b.graphics.title} ${b.graphics.description} Hero emphasis: ${b.graphics.hero.shape}.`, [S('graphics.title'), S('graphics.description'), S('graphics.hero.shape')]);
  b.graphics.legend.forEach((g, i) => add('Icons and Graphic Elements', `${g.name}: ${g.use}`, [S(`graphics.legend.${i}.name`), S(`graphics.legend.${i}.use`)]));
  add('Icons and Graphic Elements', `Pattern angle ${b.graphics.pattern.angle}; strength light ${b.graphics.pattern.strength.light}, dark ${b.graphics.pattern.strength.dark}. Texture strength light ${b.graphics.texture.strength.light}, dark ${b.graphics.texture.strength.dark}.`, [S('graphics.pattern.angle'), S('graphics.pattern.strength.light'), S('graphics.pattern.strength.dark'), S('graphics.texture.strength.light'), S('graphics.texture.strength.dark')]);
  label('Icons and Graphic Elements', 'an icon family was not asked for or drawn at the lock');
  // A distinct read-back traverses source fields rather than trusting rendered citations.
  for (const c of claims) for (const r of c.refs) {
    if (r.source === 'script') continue;
    const v = valueAt(r.source === 'spec' ? spec : a, r.field);
    if (v == null || !c.text.includes(String(v))) fail('read-back', `claim does not match ${r.source}#${r.field}`);
  }
  return { sections, claims, b, ref, S, A, tap, status };
}

function direction(doc, a) {
  const { b, ref, S } = doc;
  const p = (s) => `<p>${html(s)}</p>`;
  const section = (title, content) => `<section><h2>${title}</h2>${content}</section>`;
  const rows = [];
  for (const mode of ['light', 'dark']) for (const role of Object.keys(ROLES)) {
    const swatches = b.palette.modeSwatches?.[mode] || b.palette.swatches, sw = swatches.find((s) => s.key === role);
    rows.push(`<tr><td>${mode}</td><td>${html(sw?.name || role)}</td><td>${html(b.palette[mode][role])}</td><td>${html(sw?.role || ROLES[role])}</td><td>${sw ? `${sw.share}%` : ''}</td>${b.palette.temperature ? `<td>${html(b.palette.temperature)}</td>` : ''}</tr>`);
  }
  const sections = [section('What the brand is', p(a.sentence) + (a.promise ? p(a.promise) : '') + (a.audience ? p(a.audience) : '')), section('Core words', a.words.map((w) => p(`${w.word}, not ${w.not}.`)).join(''))];
  const looks = a.readBack ? [p(a.readBack.text)] : [];
  for (let n = 1; n <= 9; n++) looks.push(p(`Q${n}: ${doc.tap(n).label}`));
  if (a.looks) looks.push(...a.looks.map((l) => p(l)));
  sections.push(section('How it looks', looks.join('')), section('Colour', `<div class="table"><table><thead><tr><th>Mode</th><th>Name</th><th>Value</th><th>Role</th><th>Page share</th>${b.palette.temperature ? '<th>Temperature</th>' : ''}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`));
  sections.push(section('Type', ['heading', 'body', ...(b.type.handwriting ? ['handwriting'] : [])].map((role) => `<div class="face" style="font-family:var(--font-${role})"><h3>${html(b.type[role].family)}</h3><p>${html(role)}: ${html(b.type[role].description)}</p><p>Weights: ${[...new Set(Object.values(b.type[role].sizes).map((s) => s.weight))].join(', ')}.</p><p>${html(b.type[role].sample)}</p></div>`).join('')));
  sections.push(section('Marks, pattern and texture', (b.monogram.file ? p('Use the kept logo.') : '') + p(b.graphics.description) + b.graphics.legend.map((g) => p(`${g.name}: ${g.use}`)).join('') + p(`Pattern strength: ${b.graphics.pattern.strength.light} light, ${b.graphics.pattern.strength.dark} dark; angle ${b.graphics.pattern.angle}. Texture: ${b.graphics.texture.strength.light} light, ${b.graphics.texture.strength.dark} dark.`)));
  if (b.content.photoRules) sections.push(section('Pictures', p(b.content.photoRules) + (b.content.never?.length ? p(`Never: ${b.content.never.join(', ')}.`) : '')));
  const provenance = doc.claims.filter((c) => ['Color', 'Visual Personality', 'Words', 'Mark', 'Icons and Graphic Elements', 'Imagery and Illustration'].includes(c.heading) || (c.heading === 'Typography' && c.refs.some((r) => r.field.endsWith('.family'))));
  sections.push(section('Where each choice comes from', `<p>Board choices are the pick at ${html(a.lock.question)}.</p><table><thead><tr><th>Choice</th><th>Source</th></tr></thead><tbody>${provenance.map((c) => `<tr><td>${html(c.text.replace(/ Licence:.*$/, ''))}</td><td>${html(c.citation)}</td></tr>`).join('')}</tbody></table>`));
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${html(a.name)}: brand direction</title><link rel="stylesheet" href="typography.css"><style>body{margin:0 auto;padding:clamp(16px,4vw,48px);max-width:960px;font:var(--text-body)/var(--line-body) var(--font-body)}h1,h2,h3{font-family:var(--font-heading);line-height:var(--line-heading)}h1{font-size:var(--text-display)}h2{font-size:var(--text-heading)}section{margin-block:2rem}.table{overflow:auto}table{border-collapse:collapse;font-size:var(--text-caption);width:100%}td,th{text-align:left;padding:.5rem;border-bottom:1px solid #aaa;overflow-wrap:anywhere}.face{margin-block:1rem}</style></head><body><h1>${html(a.name)}</h1>${sections.join('\n')}</body></html>\n`;
}

function updateState(bytes, section, key) {
  const re = new RegExp(`(^## ${section}\\r?\\n)([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'm');
  if (!re.test(bytes)) return bytes;
  return bytes.replace(re, (whole, h, body) => h + body.replace(new RegExp(`^(\\s*(?:-\\s+)?${key}:)[^\\r\\n]*$`, 'gm'), '$1 complete'));
}
function verifyDocument(doc, verification, designPath) {
  if (verification == null) return null;
  if (!/^## Claims\s*$/m.test(verification) || !/\|\s*Row\s*\|\s*Key\s*\|\s*Class\s*\|/.test(verification)) fail('verification', 'missing Claims table; repair the onboarding record');
  let next = Math.max(0, ...[...verification.matchAll(/\bV(\d+)\b/g)].map((m) => Number(m[1]))) + 1;
  const rows = [];
  for (const c of doc.claims) {
    c.anchor = `V${next++}`;
    const cites = c.refs.map((r) => r.source === 'script' ? 'lock.mjs SCALE' : doc.ref(r)).join('; ');
    rows.push(`| ${c.anchor} | design | ${c.heading === 'Lock' ? 'design-source' : 'other'} | ${md(c.text)} | [${c.anchor}] | ${md(designPath)} | ${md(cites)} | source field traversal | yes | rendered value read-back | located | Verified | - |`);
  }
  return verification.replace(/(^## Claims\s*\n)([\s\S]*?)(?=^## |$(?![\s\S]))/m, (_, h, body) => `${h}${body.trimEnd()}\n${rows.join('\n')}\n\n`);
}

// Publication is rollback-capable, with complete old bytes archived before replacement.
function publish(entries, archiveHome) {
  const staged = [], published = [], archived = [];
  try {
    for (const e of entries) {
      mkdirSync(dirname(e.path), { recursive: true });
      const temp = screen(join(dirname(e.path), `.lock-${randomUUID()}.tmp`), true);
      staged.push({ ...e, temp }); writeFileSync(temp, e.bytes, { flag: 'wx' });
    }
    for (const e of staged) {
      if (existing(e.path)) {
        const folder = screen(archiveHome || join(dirname(e.path), 'zArchive'), true); mkdirSync(folder, { recursive: true });
        const day = new Date().toISOString().slice(2, 10); let n = 1, archive;
        do { archive = screen(join(folder, `${day} V${n++} - ${basename(e.path)}`), true); } while (existing(archive));
        // Exclusive creation prevents colliding sessions from overwriting an archive.
        writeFileSync(archive, readFileSync(e.path), { flag: 'wx' }); archived.push({ path: e.path, archive });
      }
      renameSync(e.temp, e.path); published.push(e);
    }
  } catch (e) {
    for (const item of published.reverse()) {
      const saved = archived.find((a) => a.path === item.path);
      if (saved) writeFileSync(item.path, readFileSync(saved.archive)); else unlinkSync(item.path);
    }
    throw e;
  } finally { for (const e of staged) if (existing(e.temp)) unlinkSync(e.temp); }
  return archived;
}

export function run(argv) {
  const started = performance.now(), o = options(argv); if (!o) return HELP;
  const root = screen(o['--root'], true), design = screen(o['--design'], true), work = screen(o['--work'], true);
  if (!existing(root)?.isDirectory()) fail('--root', 'owning root must exist');
  for (const p of [design, work]) if (!inside(root, p) || p === root) fail('path', 'destination must be inside the owning root');
  if (!design.endsWith('.md')) fail('--design', 'use the resolved .md binding');
  const specPath = screen(o['--spec']), answersPath = screen(o['--answers']);
  const specBytes = read(specPath), answersBytes = read(answersPath), spec = json(specBytes, 'spec'), a = json(answersBytes, 'answers');
  const tapData = json(read(TAPS), 'taps library');
  const { index, b } = validate(spec, a, specBytes, tapData);
  for (const face of Object.values(b.type)) for (const file of face.files || []) {
    file.path = screen(file.path);
    if (!existing(file.path)?.isFile()) fail('font.path', 'locked font is absent; restore the checked board font');
  }
  const assetFiles = a.assets.map((asset) => screen(resolve(root, asset.path)));
  const brandFolder = screen(join(root, 'sources/brand'));
  // The caller inventories originals; never silently omit an asset from that folder.
  for (let i = 0; i < a.assets.length; i++) {
    if (!inside(brandFolder, assetFiles[i])) fail(`assets.${i}.path`, 'kept originals must be inside sources/brand');
    if (!existing(assetFiles[i])?.isFile()) fail(`assets.${i}.path`, 'kept asset is absent');
  }
  const inventoried = new Set(assetFiles), visited = new Set();
  const inventory = (folder) => {
    const real = screen(folder); if (!inside(brandFolder, real)) fail('sources/brand', 'source link leaves the classified folder');
    if (visited.has(real)) return; visited.add(real);
    for (const entry of readdirSync(real, { withFileTypes: true })) {
      if (entry.name === 'memory') fail('sources/brand', 'a memory directory is not a classified brand original');
      const path = screen(join(real, entry.name));
      if (statSync(path).isDirectory()) inventory(path);
      else if (!inventoried.has(path)) fail('assets', 'an original in sources/brand is not inventoried; list every file and what it governs');
    }
  };
  if (existing(brandFolder)) inventory(brandFolder);
  if (b.monogram.file) {
    const mark = screen(b.monogram.file);
    if (!a.assets.some((asset, i) => asset.kind === 'logo' && assetFiles[i] === mark)) fail('monogram.file', 'kept logo must be listed in assets');
  }
  const paths = { spec: specPath, answers: answersPath, palette: screen(join(work, 'palette.css'), true), typography: screen(join(work, 'typography.css'), true), direction: screen(join(work, 'brand-direction.html'), true) };
  const ag = screen(join(root, 'AGENTS.md'), true), verification = screen(join(root, 'work/onboarding/verification.md'), true), record = screen(join(root, 'work/onboarding/run-record.md'), true);
  for (const p of [ag, verification, record]) if (!inside(root, p)) fail('path', 'onboarding record resolves outside root');
  const oldDesign = existing(design) ? read(design) : null, state = designState(oldDesign);
  if (state === 'complete' && !o['--replace']) fail('--design', 'complete design already exists; use --replace to archive and replace it');
  const doc = makeDocuments(spec, a, index, paths, tapData);
  const oldVerification = existing(verification) ? read(verification) : null;
  const checked = verifyDocument(doc, oldVerification, relative(root, design).split(sep).join('/'));
  const headingReport = HEADINGS.map((heading) => ({ heading, state: doc.sections[heading].some((c) => !c.label) ? (doc.sections[heading].some((c) => c.label) ? 'filled-and-labelled' : 'filled') : 'labelled' }));
  // G5a splits at '. ': every sentence, including source-register prose,
  // carries the row for the complete rule it belongs to.
  const renderClaim = (c) => {
    if (c.label) return c.label;
    const line = `${md(c.text)} (${md(c.citation)})`;
    return c.anchor ? line.replace(/\. /g, ` [${c.anchor}]. `) + ` [${c.anchor}]` : line;
  };
  const designBytes = `# Design of ${md(a.name)}\n\n<!-- provenance-preamble -->\nMarkers delimit this preamble for the gate harness; keep both.\n\nLabels and registers are \`standards/conventions.md\`'s. Replace each whole-line prompt with sourced content or its evidence label under \`skills/Onboard Root/\`. Full-path verification anchors follow that skill's \`full-path.md\`, The written form of each record.\n<!-- /provenance-preamble -->\n\n${renderClaim(doc.status)}\n\n${HEADINGS.map((h) => `## ${h}\n\n${doc.sections[h].map(renderClaim).join('\n\n')}`).join('\n\n')}\n`;
  if (designState(designBytes) !== 'complete') fail('design', 'generated file failed completeness read-back');
  // Read sources again, then check the actual escaped document separately from
  // composition. A changed source invalidates the lock rather than mixing runs.
  if (read(specPath) !== specBytes || read(answersPath) !== answersBytes) fail('read-back', 'a source changed during the run; lock the current record');
  const sourceAgain = { spec: json(read(specPath), 'read-back spec'), answers: json(read(answersPath), 'read-back answers') };
  const unanchored = designBytes.replace(/ \[V\d+\]/g, '');
  for (const claim of doc.claims) {
    if (!unanchored.includes(md(claim.text)) || !unanchored.includes(md(claim.citation))) fail('read-back', 'a claim or citation is missing from rendered design');
    for (const r of claim.refs) if (r.source !== 'script' && !claim.text.includes(String(valueAt(sourceAgain[r.source], r.field)))) fail('read-back', `rendered claim differs from ${r.source}#${r.field}`);
  }
  const entries = [{ path: design, bytes: designBytes }, { path: paths.palette, bytes: paletteCSS(b, `${specPath}#boards.${index}`) }, { path: paths.typography, bytes: typographyCSS(b, `${specPath}#boards.${index}`) }, { path: paths.direction, bytes: direction(doc, a) }];
  if (checked != null) entries.push({ path: verification, bytes: checked });
  if (existing(ag)) { const before = read(ag), after = updateState(before, 'Onboarding', 'design'); if (before !== after) entries.push({ path: ag, bytes: after }); }
  if (existing(record)) { const before = read(record), after = updateState(before, 'Per-key close', 'design'); if (before !== after) entries.push({ path: record, bytes: after }); }
  const archiveHome = a.paths?.archive ? screen(resolve(root, a.paths.archive), true) : null;
  if (archiveHome && !inside(root, archiveHome)) fail('archive', 'archive home must stay inside root');
  if (archiveHome && (!existing(ag) || !read(ag).includes(a.paths.archive))) fail('archive', 'custom archive home is not named by the root AGENTS.md');
  const inputs = [specPath, answersPath, ...assetFiles];
  const identities = new Set();
  for (const e of entries) {
    if (!inside(root, e.path) || inside(SKILL, e.path)) fail('path', 'destination escapes owning root or enters skill');
    const st = existing(e.path); if (st && !st.isFile()) fail('path', 'destination is not a regular file');
    const id = st ? `${st.dev}:${st.ino}` : e.path;
    if (identities.has(id)) fail('path', 'output paths alias each other'); identities.add(id);
    for (const input of inputs) { const source = existing(input); if (input === e.path || (source && st && source.dev === st.dev && source.ino === st.ino)) fail('path', 'output aliases an input'); }
  }
  const archives = publish(entries, archiveHome);
  return { state: 'complete', files: entries.map((e) => ({ path: e.path, bytes: Buffer.byteLength(e.bytes) })), headings: headingReport, archives, readBack: { claims: doc.claims.length, outcome: 'passed' }, unusedAnswerFields: Object.keys(a).filter((k) => !['name', 'sentence', 'words', 'taps', 'off', 'readBack', 'looks', 'rounds', 'type', 'assets', 'audience', 'promise', 'finalSay', 'lock', 'unavailable', 'provenance', 'paths'].includes(k)), elapsedMs: Number((performance.now() - started).toFixed(3)) };
}
export function main(argv = process.argv.slice(2)) {
  try { const result = run(argv); process.stdout.write((typeof result === 'string' ? result : JSON.stringify(result)) + '\n'); }
  catch (e) { process.stderr.write(JSON.stringify({ error: e.message }) + '\n'); process.exitCode = 1; }
}
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main();
