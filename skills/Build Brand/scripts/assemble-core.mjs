// Pure library resolution and shape validation. File checks belong to assemble.mjs.
const ROLES = ['ground', 'panel', 'text', 'headline', 'smallPrint', 'deep', 'pop', 'onPop', 'mark', 'cardFront', 'cardFrontText', 'cardFrontSmallPrint', 'cardBack', 'cardBackText', 'cardBackMark', 'sub', 'note', 'panelSmallPrint', 'hairline'];
const MODES = ['light', 'dark'];
export const AXES = { classicContemporary: ['classic','contemporary'], quietBold: ['quiet','bold'], warmCool: ['warm','cool'], playfulSerious: ['playful','serious'], handGeometric: ['hand','geometric'], softStrong: ['soft','strong'] };
const fail = (at, cause) => { throw new Error(`${at}: ${cause}. Correct the selection; see assemble.mjs --help.`); };
const copy = (value) => structuredClone(value);
const has = (o, k) => Object.hasOwn(o, k);
function object(value, keys, at) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(at, 'expected an object');
  for (const k of Object.keys(value)) if (!keys.includes(k)) fail(`${at}.${k}`, 'unknown field');
}
function text(value, at, multiline = false) {
  if (typeof value !== 'string' || !value.trim() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value) || (!multiline && /[\r\n\u2028\u2029]/.test(value))) fail(at, 'expected non-empty text');
}
function list(value, at, allowEmpty = false) { if (!Array.isArray(value) || (!allowEmpty && !value.length)) fail(at, allowEmpty ? 'expected an array' : 'expected a non-empty array'); }
function num(value, min, max, at) { if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(at, `expected a number from ${min} to ${max}`); }
function strings(value, keys, at, multiline = []) {
  object(value, keys, at);
  for (const k of keys) text(value[k], `${at}.${k}`, multiline.includes(k));
}
function lookup(library, kind, id, at) {
  text(id, at);
  const found = library[kind]?.filter((p) => p.id === id);
  if (found?.length !== 1) fail(at, `unknown or duplicate ${kind} id "${id}"`);
  if (['pairings','palettes','graphics'].includes(kind)) for (const [axis, poles] of Object.entries(AXES)) {
    if (![...poles, 'either'].includes(found[0].tags?.[axis])) fail(`${at}.tags.${axis}`, 'part needs a valid ranking position');
  }
  return found[0];
}
// Ranking provenance travels in the command's report, outside the deliberately
// closed Contact Sheet spec (which accepts only its three match-check tags).
export function partPositions(library, board) {
  return Object.fromEntries([['pairing','pairings',board.pairing.headingFrom && typeof board.pairing.headingFrom === 'string' ? board.pairing.headingFrom : board.pairing.id],['palette','palettes',board.palette.id],['graphicSet','graphics',board.graphicSet.id]].map(([role,kind,id]) => [role, Object.fromEntries(Object.keys(AXES).map(axis => [axis,lookup(library,kind,id,role).tags[axis]]))]));
}
// This is resolution and shape validation, not a design decision or contrast repair.
// Contact Sheet remains the authority for the resulting board's rendering checks.
export function assembleCore(selection, library, { resolveFont = (face) => copy(face), resolveSuppliedFont = () => fail('pairing', 'supplied files need a file resolver'), resolveMark = (file) => file } = {}) {
  object(selection, ['person', 'intro', 'groups', 'footnote', 'boards'], 'selection');
  text(selection.person, 'person'); text(selection.footnote, 'footnote', true);
  if (!Array.isArray(selection.intro) || selection.intro.length !== 2) fail('intro', 'supply exactly two lines');
  selection.intro.forEach((s, i) => text(s, `intro[${i}]`));
  list(selection.groups, 'groups'); const groups = new Set();
  for (const g of selection.groups) { strings(g, ['id', 'label'], 'groups'); if (groups.has(g.id)) fail('groups', 'duplicate id'); groups.add(g.id); }
  list(selection.boards, 'boards'); const numbers = new Set(); let recommendations = 0;
  const boards = selection.boards.map((b, index) => {
    const at = `Board ${b?.number ?? index + 1} (${b?.name ?? 'unnamed'})`;
    object(b, ['number', 'name', 'group', 'energy', 'why', 'recommendation', 'zero', 'primaryMode', 'buttonRadius', 'palette', 'pairing', 'handwriting', 'graphicSet', 'container', 'markFile', 'content', 'initials', 'heroPhrase', 'note', 'words', 'sample', 'items', 'closingExamples'], at);
    for (const k of ['name', 'group', 'energy', 'why', 'primaryMode']) text(b[k], `${at}.${k}`);
    num(b.number, 0, Number.MAX_SAFE_INTEGER, `${at}.number`);
    if (!Number.isSafeInteger(b.number) || numbers.has(b.number)) fail(`${at}.number`, 'expected a unique safe integer'); numbers.add(b.number);
    if (has(b, 'zero') && typeof b.zero !== 'boolean') fail(`${at}.zero`, 'expected a boolean');
    if ((b.number === 0) !== (b.zero === true)) fail(`${at}.zero`, 'number 0 and zero true must occur together');
    if (!groups.has(b.group)) fail(`${at}.group`, 'unknown group');
    if (!MODES.includes(b.primaryMode)) fail(`${at}.primaryMode`, 'use light or dark');
    num(b.buttonRadius, 0, 100, `${at}.buttonRadius`);
    if (has(b, 'recommendation')) { text(b.recommendation, `${at}.recommendation`); if (++recommendations > 2) fail(`${at}.recommendation`, 'at most two recommendations'); }
    object(b.palette, ['id', 'overrides'], `${at}.palette`);
    const recipe = lookup(library, 'palettes', b.palette.id, `${at}.palette.id`);
    const palette = Object.fromEntries(['light', 'dark', 'swatches', 'modeSwatches', 'chips'].filter((k) => has(recipe, k)).map((k) => [k, copy(recipe[k])]));
    if (has(b.palette, 'overrides')) {
      object(b.palette.overrides, MODES, `${at}.palette.overrides`);
      for (const [mode, overrides] of Object.entries(b.palette.overrides)) {
        object(overrides, ROLES, `${at}.palette.overrides.${mode}`);
        for (const [role, value] of Object.entries(overrides)) {
          if (typeof value !== 'string' || !/^#(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(value)) fail(`${at}.palette.overrides.${mode}.${role}`, 'use opaque sRGB hex');
          palette[mode][role] = value;
        }
      }
    }
    object(b.pairing, ['id', 'headingFrom', 'bodyFrom'], `${at}.pairing`);
    const pairing = lookup(library, 'pairings', b.pairing.id, `${at}.pairing.id`);
    const donors = {}, type = {};
    for (const role of ['heading', 'body']) {
      const field = `${role}From`, where = `${at}.pairing.${field}`;
      const choice = has(b.pairing, field) ? b.pairing[field] : pairing.id;
      if (typeof choice === 'string') {
        donors[role] = lookup(library, 'pairings', choice, where);
        type[role] = resolveFont(donors[role].type[role], `${at}.type.${role}`, library);
      } else {
        donors[role] = pairing;
        type[role] = resolveSuppliedFont(choice, pairing.type[role], b.content?.sentence, where);
      }
    }
    const heading = donors.heading;
    if (!has(b, 'handwriting')) fail(`${at}.handwriting`, 'choose an offered family or null');
    if (b.handwriting !== null) {
      const choice = pairing.handwriting.find((f) => f.family === b.handwriting);
      if (!choice) fail(`${at}.handwriting`, 'choose a handwriting family offered by the base pairing, or null');
      type.handwriting = resolveFont(choice, `${at}.type.handwriting`, library);
    }
    object(b.graphicSet, ['id', 'pattern', 'texture'], `${at}.graphicSet`);
    const set = lookup(library, 'graphics', b.graphicSet.id, `${at}.graphicSet.id`);
    const graphics = Object.fromEntries(['hero', 'pattern', 'texture', 'legend', 'title', 'description'].map((k) => [k, copy(set[k])]));
    for (const kind of ['pattern', 'texture']) if (has(b.graphicSet, kind)) {
      const atOverride = `${at}.graphicSet.${kind}`;
      object(b.graphicSet[kind], kind === 'pattern' ? ['angle', 'strength'] : ['strength'], atOverride);
      if (has(b.graphicSet[kind], 'angle')) { num(b.graphicSet[kind].angle, -180, 180, `${atOverride}.angle`); graphics[kind].angle = b.graphicSet[kind].angle; }
      if (has(b.graphicSet[kind], 'strength')) {
        object(b.graphicSet[kind].strength, MODES, `${atOverride}.strength`);
        for (const [mode, value] of Object.entries(b.graphicSet[kind].strength)) { num(value, 0, 1, `${atOverride}.strength.${mode}`); graphics[kind].strength[mode] = value; }
      }
    }
    text(b.heroPhrase, `${at}.heroPhrase`); graphics.hero.phrase = b.heroPhrase;
    let monogram;
    if (has(b, 'markFile')) {
      if (has(b, 'container') || has(b, 'initials')) fail(`${at}.markFile`, 'a supplied mark replaces container and initials');
      text(b.markFile, `${at}.markFile`); monogram = { file: resolveMark(b.markFile, `${at}.markFile`) };
    } else {
      const container = lookup(library, 'containers', b.container, `${at}.container`);
      text(b.initials, `${at}.initials`); monogram = { initials: b.initials, container: container.svg };
      if (container.plate) monogram.surfaces = Object.fromEntries([['ground','headline'], ['cardFront','cardFrontText'], ['cardBack','cardBackText']].map(([surface, ink]) => [surface, { background: ink, ink: surface, frame: surface, radius: container.plate.radius }]));
    }
    object(b.content, ['brandName', 'sentence', 'body', 'smallPrint', 'photoRules', 'never', 'markCaption', 'closing'], `${at}.content`);
    for (const k of ['brandName', 'sentence', 'body', 'smallPrint']) text(b.content[k], `${at}.content.${k}`, k === 'body');
    if (has(b.content, 'markCaption')) text(b.content.markCaption, `${at}.content.markCaption`);
    if (has(b.content, 'closing') && b.content.closing !== null) text(b.content.closing, `${at}.content.closing`);
    if (has(b.content, 'photoRules')) text(b.content.photoRules, `${at}.content.photoRules`, true);
    if (has(b.content, 'never')) {
      list(b.content.never, `${at}.content.never`, true); b.content.never.forEach((s) => text(s, `${at}.content.never`));
    }
    if (!b.content.sentence.includes(b.heroPhrase)) fail(`${at}.heroPhrase`, 'must occur in content.sentence');
    strings(b.note, ['text', 'direction'], `${at}.note`);
    if (!['left','right','up','down'].includes(b.note.direction)) fail(`${at}.note.direction`, 'use left, right, up or down');
    if (has(b, 'words')) {
      list(b.words, `${at}.words`, true); b.words.forEach((w) => strings(w, ['word','not'], `${at}.words`));
    }
    object(b.sample, ['kicker','title','phrase','body','note','steps','meta'], `${at}.sample`);
    for (const k of ['kicker','title','phrase','body','note','meta']) text(b.sample[k], `${at}.sample.${k}`, k === 'body');
    if (!b.sample.title.includes(b.sample.phrase)) fail(`${at}.sample.phrase`, 'must occur in sample.title');
    list(b.sample.steps, `${at}.sample.steps`); b.sample.steps.forEach((s) => text(s, `${at}.sample.steps`));
    const itemKeys = ['cardLine','cardBack','bannerHeadline','bannerLine','contact','primaryAction','secondaryAction'];
    object(b.items, [...itemKeys,'cardBackShort','tileBannerHeadline'], `${at}.items`);
    for (const k of itemKeys) text(b.items[k], `${at}.items.${k}`, k === 'cardBack');
    for (const k of ['cardBackShort','tileBannerHeadline']) if (has(b.items,k)) text(b.items[k],`${at}.items.${k}`);
    list(b.closingExamples, `${at}.closingExamples`);
    if (![2,3].includes(b.closingExamples.length)) fail(`${at}.closingExamples`, 'supply two or three examples');
    b.closingExamples.forEach((s) => text(s, `${at}.closingExamples`));
    return { ...Object.fromEntries(['number','name','group','energy','why','recommendation','zero','primaryMode','buttonRadius'].filter((k) => has(b,k)).map((k) => [k,b[k]])), palette, type, tags: { paletteLoudness: recipe.paletteLoudness, typeLoudness: heading.tags.typeLoudness, typeCut: heading.tags.typeCut }, graphics, monogram, content: copy(b.content), ...(has(b, 'words') ? { words: copy(b.words) } : {}), note: {...b.note, svg: set.noteArrow}, sample: {...copy(b.sample), ...copy(set.sample), rule: set.bannerRule}, items: copy(b.items), closingExamples: copy(b.closingExamples) };
  });
  for (const g of groups) if (!boards.some((b) => b.group === g)) fail(`groups.${g}`, 'empty group');
  return { layout: 'board', person: selection.person, intro: copy(selection.intro), groups: copy(selection.groups), footnote: selection.footnote, boards };
}

export const assemblyHelpers = { fail, copy, has, object, text, num };
