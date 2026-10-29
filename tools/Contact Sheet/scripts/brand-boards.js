// Brand-board composition only. The caller supplies every choice; no inference,
// primitive, model, network, clock or script in the generated page.
import { fail } from './paths.js';
import { checkSvg } from './svg.js';
import { renderBrandBoards } from './brand-board-view.js';

const REQUIRED_ROLES = ['ground', 'panel', 'text', 'headline', 'smallPrint', 'deep', 'pop', 'onPop', 'mark',
  'cardFront', 'cardFrontText', 'cardFrontSmallPrint', 'cardBack', 'cardBackText', 'cardBackMark'];
export const ROLES = [...REQUIRED_ROLES, 'sub', 'note', 'panelSmallPrint', 'hairline'];
const MODES = ['light', 'dark'];
const FACE_ROLES = ['heading', 'body', 'handwriting'];
const FORMATS = { '.ttf': 'truetype', '.otf': 'opentype', '.woff': 'woff', '.woff2': 'woff2' };
const own = (o, k) => Object.hasOwn(o, k);
const esc = (s) => String(s).replace(/[&<>"':@(]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', ':': '&#58;', '@': '&#64;', '(': '&#40;' })[c]);
function object(o, keys, at) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) fail(`${at} must be an object. Correct the spec in TOOL.md.`);
  for (const k of Object.keys(o)) if (!keys.includes(k)) fail(`${at} has unknown field "${k}". Use TOOL.md.`);
}
function text(s, at, line = true) {
  if (typeof s !== 'string' || !s.trim() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s) || (line && /[\r\n\u2028\u2029]/.test(s))) fail(`${at} must be non-empty ${line ? 'single-line ' : ''}text. Correct the spec.`);
}
function list(a, at, allowEmpty = false) { if (!Array.isArray(a) || (!allowEmpty && !a.length)) fail(`${at} must be ${allowEmpty ? 'an array' : 'a non-empty array'}. Correct the spec.`); }
function number(n, min, max, at) { if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) fail(`${at} must be a number from ${min} to ${max}. Correct the spec.`); }
function hex(c, at) { if (typeof c !== 'string' || !/^#(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(c)) fail(`${at} must be opaque sRGB #RGB or #RRGGBB. Correct the colour.`); }
function rgb(c) { const h = c.slice(1); return (h.length === 3 ? [...h].map((x) => x + x).join('') : h).match(/../g).map((x) => parseInt(x, 16) / 255); }
export function wcag(foreground, background) {
  const luminance = (c) => rgb(c).reduce((sum, x, i) => sum + [0.2126, 0.7152, 0.0722][i] * (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4), 0);
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
export function apca(foreground, background) {
  // Published APCA-W3 0.1.9, SAPC constants 0.0.98G-4g (sRGB, signed Lc).
  // These are formula constants, not copied implementation code.
  const luminance = (c) => {
    const y = rgb(c).reduce((sum, x, i) => sum + [0.2126729, 0.7151522, 0.0721750][i] * x ** 2.4, 0);
    return y < 0.022 ? y + (0.022 - y) ** 1.414 : y;
  };
  const t = luminance(foreground), b = luminance(background);
  if (Math.abs(b - t) < 0.0005) return 0;
  const positive = b > t;
  const raw = positive ? (b ** 0.56 - t ** 0.57) * 1.14 : (b ** 0.65 - t ** 0.62) * 1.14;
  return positive ? (raw < 0.1 ? 0 : (raw - 0.027) * 100) : (raw > -0.1 ? 0 : (raw + 0.027) * 100);
}

// The renderer uses precisely these foreground/surface assignments. Swatch
// labels and pattern composites are added for each board below.
const PAIRS = [
  ['body and small face samples', 'text', 'ground', 4.5],
  ['headline and person name', 'headline', 'ground', 3],
  ['tile person name', 'headline', 'ground', 4.5],
  ['small print, swatch labels and rules', 'smallPrint', 'ground', 4.5],
  ['panel body and face descriptions', 'text', 'panel', 4.5],
  ['panel face names and sample headlines', 'headline', 'panel', 4.5],
  ['panel small print', 'panelSmallPrint', 'panel', 4.5],
  ['hero and graphic marks', 'mark', 'ground', null],
  ['profile, tab and hero monogram', 'headline', 'ground', 3],
  ['card front name and copy', 'cardFrontText', 'cardFront', 4.5],
  ['card front small print', 'cardFrontSmallPrint', 'cardFront', 4.5],
  ['card front monogram', 'cardFrontText', 'cardFront', 3],
  ['card back sentence and note', 'cardBackText', 'cardBack', 4.5],
  ['card back monogram', 'cardBackText', 'cardBack', 3],
  ['card back graphic', 'cardBackMark', 'cardBack', null],
  ['social banner headline', 'headline', 'panel', 3],
  ['social banner copy', 'text', 'panel', 4.5],
  ['social banner small print', 'panelSmallPrint', 'panel', 4.5],
  ['social banner monogram', 'text', 'panel', 3],
  ['button text (open link and sample)', 'onPop', 'pop', 4.5, 60]
];

// Brand SVG is a drawing only: all ink is currentColor or {{roleKey}}.
// Keep supplied art in image data URIs so its ids cannot collide with the page.
function drawing(svg, at, opaque = false) {
  text(svg, at, false);
  checkSvg(Buffer.from(svg));
  if (/<\/?(?:text|tspan)\b|\scolor\s*=/i.test(svg)) fail(`${at}: SVG must contain drawing shapes without text or a colour override. Use role ink.`);
  if (opaque && (/<\/?(?:filter|fe\w+)\b|\b(?:filter|mask|opacity|fill-opacity|stroke-opacity)\s*=/i.test(svg))) fail(`${at}: monogram SVG must be opaque, without filters, masks or opacity, so its identifying ink can be checked.`);
  for (const m of svg.matchAll(/\{\{([^}]+)\}\}/g)) if (!ROLES.includes(m[1])) fail(`${at}: SVG has unknown role ${m[1]}. Use a palette role key.`);
  for (const m of svg.matchAll(/\b(?:fill|stroke|stop-color|flood-color|lighting-color)\s*=\s*(["'])(.*?)\1/gi)) {
    if (!/^(?:none|currentColor|\{\{[A-Za-z]+\}\}|url\(\s*(['"]?)#[A-Za-z_][\w.-]*\1\s*\))$/.test(m[2])) fail(`${at}: SVG ink must be currentColor, none, {{roleKey}} or a local url(#id). Correct the drawing.`);
  }
  if (svg.replace(/\{\{[A-Za-z]+\}\}/g, '').includes('{{')) fail(`${at}: SVG contains an invalid role placeholder. Correct the drawing.`);
}
function graphic(o, at, withAngle = false) {
  object(o, ['svg', 'strength', ...(withAngle ? ['angle'] : [])], at);
  drawing(o.svg, `${at}.svg`);
  object(o.strength, MODES, `${at}.strength`);
  MODES.forEach((m) => number(o.strength[m], 0, 1, `${at}.strength.${m}`));
  if (own(o, 'angle')) number(o.angle, -180, 180, `${at}.angle`);
}
// Read the WOFF2 directory before trusting the compressed block's bounds.
function woff2Directory(data, bad) {
  let cursor = 48;
  const base128 = () => {
    let value = 0;
    for (let i = 0; i < 5; i += 1) {
      if (cursor >= data.length) bad();
      const byte = data[cursor++];
      if ((i === 0 && byte === 0x80) || value > 0x1ffffff) bad();
      value = value * 128 + (byte & 0x7f);
      if (!(byte & 0x80)) return value;
    }
    bad();
  };
  for (let i = 0; i < data.readUInt16BE(12); i += 1) {
    if (cursor >= data.length) bad();
    const flags = data[cursor++], index = flags & 0x3f, version = flags >>> 6;
    let outlines = index === 10 || index === 11; // Known glyf and loca tags.
    if (index === 63) {
      if (cursor + 4 > data.length) bad();
      const tag = data.toString('latin1', cursor, cursor + 4);
      cursor += 4;
      outlines = tag === 'glyf' || tag === 'loca';
    }
    base128(); // origLength
    if (outlines ? version === 0 : version !== 0) base128(); // transformLength
  }
  if (cursor + data.readUInt32BE(20) > data.length) bad();
}
function fontContainer(asset, at) {
  const data = Buffer.from(asset.uri.slice(asset.uri.indexOf(',') + 1), 'base64');
  const bad = () => fail(`${at}: invalid font container. Supply a complete font file, not only its signature.`);
  if (['.ttf', '.otf'].includes(asset.extension)) {
    if (data.length < 12) bad();
    const count = data.readUInt16BE(4);
    if (!count || 12 + count * 16 > data.length) bad();
    const tags = new Set();
    for (let i = 0; i < count; i += 1) {
      const base = 12 + i * 16, tag = data.toString('ascii', base, base + 4);
      const offset = data.readUInt32BE(base + 8), length = data.readUInt32BE(base + 12);
      if (tags.has(tag) || offset < 12 + count * 16 || offset + length > data.length) bad();
      tags.add(tag);
    }
    if (!['head', 'hhea', 'maxp', 'hmtx', 'cmap'].every((tag) => tags.has(tag))) bad();
  } else {
    const header = asset.extension === '.woff' ? 44 : 48;
    if (data.length < header || data.readUInt32BE(8) !== data.length || !data.readUInt16BE(12) || data.readUInt16BE(14) !== 0) bad();
    if (asset.extension === '.woff') {
      const count = data.readUInt16BE(12);
      if (header + count * 20 > data.length) bad();
      for (let i = 0; i < count; i += 1) {
        const base = header + i * 20, offset = data.readUInt32BE(base + 4), size = data.readUInt32BE(base + 8);
        if (offset < header + count * 20 || offset + size > data.length || size > data.readUInt32BE(base + 12)) bad();
      }
    } else woff2Directory(data, bad);
  }
}
function face(value, at, assets, readAsset, attempt) {
  object(value, ['family', 'description', 'weights', 'variations', 'licence', 'files', 'sizes', 'sample', 'stripLabel'], at);
  for (const k of ['family', 'description', 'licence']) attempt(() => text(value[k], `${at}.${k}`));
  list(value.weights, `${at}.weights`);
  value.weights.forEach((w) => number(w, 1, 1000, `${at}.weights`));
  if (new Set(value.weights).size !== value.weights.length) fail(`${at}.weights repeats a weight. Use unique weights.`);
  if (own(value, 'variations')) {
    if (!value.variations || typeof value.variations !== 'object' || Array.isArray(value.variations) || !Object.keys(value.variations).length) fail(`${at}.variations must be a non-empty axis/value object. Omit it for a static face.`);
    for (const [axis, n] of Object.entries(value.variations)) {
      if (!/^[A-Za-z]{4}$/.test(axis)) fail(`${at}.variations axis must be four letters. Correct the axis.`);
      number(n, -1e6, 1e6, `${at}.variations.${axis}`);
    }
  }
  text(value.sample, `${at}.sample`);
  if (own(value, 'stripLabel')) text(value.stripLabel, `${at}.stripLabel`);
  object(value.sizes, ['display', 'middle', 'small'], `${at}.sizes`);
  for (const scale of ['display', 'middle', 'small']) {
    const v = value.sizes[scale], where = `${at}.sizes.${scale}`;
    object(v, ['size', 'lineHeight', 'tracking', 'weight', 'variations', 'maxWidth'], where);
    number(v.size, 8, 240, `${where}.size`);
    number(v.lineHeight, 0.7, 3, `${where}.lineHeight`);
    number(v.tracking, -0.15, 0.5, `${where}.tracking`);
    number(v.weight, 1, 1000, `${where}.weight`);
    if (!value.weights.includes(v.weight)) fail(`${where}.weight must appear in weights. Declare every used weight.`);
    if (own(v, 'maxWidth')) number(v.maxWidth, 2, 100, `${where}.maxWidth`);
    axes(v.variations, `${where}.variations`);
  }
  list(value.files, `${at}.files`);
  const seen = new Set();
  const files = value.files.map((f, i) => {
    let result;
    attempt(() => {
      object(f, ['path', 'weight', 'style'], `${at}.files[${i}]`);
      const range = Array.isArray(f.weight) ? f.weight : [f.weight, f.weight];
      if (range.length !== 2) fail(`${at}.files[${i}].weight must be a number or [min,max].`);
      range.forEach((n) => number(n, 1, 1000, `${at}.files[${i}].weight`));
      if (range[0] > range[1]) fail(`${at}.files[${i}] weight range is reversed. Correct it.`);
      if (!['normal', 'italic', 'oblique'].includes(f.style)) fail(`${at}.files[${i}].style must be normal, italic or oblique.`);
      const signature = `${range.join('-')}/${f.style}`;
      if (seen.has(signature)) fail(`${at}.files repeats weight/style ${signature}. Supply one file for each.`);
      seen.add(signature);
      const asset = assets.add(f.path, 'font', `${at}.files[${i}].path`);
      readAsset(asset); fontContainer(asset, `${at}.files[${i}]`);
      result = { ...f, range, asset };
    });
    return result;
  }).filter(Boolean);
  for (const w of value.weights) if (!files.some((f) => f.range[0] <= w && f.range[1] >= w)) attempt(() => fail(`${at}.weights ${w} has no font file covering it. Supply the file.`));
  return { ...value, files };
}

function axes(value, at) {
  if (value === null) return; // explicit normal settings, including a static face
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.keys(value).length) fail(`${at} must be null or a non-empty axis object.`);
  for (const [axis, n] of Object.entries(value)) {
    if (!/^[A-Za-z]{4}$/.test(axis)) fail(`${at} axis must be four letters.`);
    number(n, -1e6, 1e6, `${at}.${axis}`);
  }
}
function swatchList(value, at) {
  list(value, at);
  const names = new Set(); let total = 0;
  for (const s of value) {
    object(s, ['name', 'role', 'share', 'key'], at);
    text(s.name, `${at}.name`); text(s.role, `${at}.role`);
    if (names.has(s.name)) fail(`${at} names must be unique.`);
    names.add(s.name);
    if (!ROLES.includes(s.key)) fail(`${at}.key must name a palette role.`);
    number(s.share, Number.MIN_VALUE, 100, `${at}.share`); total += s.share;
  }
  if (Math.abs(total - 100) > 0.01) fail(`${at} shares must total 100 percent.`);
  if (!value.some((s) => s.key === 'pop')) fail(`${at} must include the pop role.`);
}
function blend(fg, bg, alpha) {
  return '#' + rgb(fg).map((v, i) => Math.round((v * alpha + rgb(bg)[i] * (1 - alpha)) * 255).toString(16).padStart(2, '0')).join('');
}
function inks(svg, fallback) {
  return [...new Set([fallback, ...[...(typeof svg === 'string' ? svg : '').matchAll(/\{\{([A-Za-z]+)\}\}/g)].map((m) => m[1])])].filter((k) => ROLES.includes(k));
}

export function validateBrandBoards(spec, assets, readAsset) {
  object(spec, ['layout', 'person', 'intro', 'groups', 'footnote', 'boards', 'showChecks'], 'spec');
  text(spec.person, 'spec.person');
  if (own(spec, 'showChecks') && typeof spec.showChecks !== 'boolean') fail('spec.showChecks must be boolean. Use true for designer labels.');
  if (!Array.isArray(spec.intro) || spec.intro.length !== 2) fail('spec.intro needs exactly two single-line strings. Correct the two lines before the boards.');
  spec.intro.forEach((s, i) => text(s, `spec.intro[${i}]`));
  text(spec.footnote, 'spec.footnote', false);
  list(spec.groups, 'spec.groups');
  const groups = new Set();
  spec.groups.forEach((g, i) => {
    object(g, ['id', 'label'], `spec.groups[${i}]`);
    text(g.id, 'group.id'); text(g.label, 'group.label');
    if (groups.has(g.id)) fail('spec.groups repeats an id. Give each group a unique id.');
    groups.add(g.id);
  });
  list(spec.boards, 'spec.boards');
  const errors = [], numbers = new Set();
  let zeros = 0, recommended = 0;
  const boards = spec.boards.map((b, index) => {
    const label = `Board ${b?.number ?? index + 1} (${typeof b?.name === 'string' ? b.name : 'unnamed'})`;
    const attempt = (fn) => { try { return fn(); } catch (e) { errors.push(`${label}: ${e.message}`); return undefined; } };
    const result = { ...b, checks: [] };
    attempt(() => object(b, ['number', 'name', 'group', 'energy', 'why', 'recommendation', 'zero', 'primaryMode', 'palette', 'type', 'tags', 'graphics', 'monogram', 'content', 'buttonRadius', 'words', 'sample', 'items', 'closingExamples', 'note'], label));
    if (!b || typeof b !== 'object') return result;
    attempt(() => {
      number(b.number, 0, Number.MAX_SAFE_INTEGER, 'number');
      if (!Number.isInteger(b.number) || numbers.has(b.number)) fail('number must be a unique integer. Correct the board numbering.');
      numbers.add(b.number);
    });
    for (const k of ['name', 'group', 'energy', 'why']) attempt(() => text(b[k], k));
    attempt(() => { if (!groups.has(b.group)) fail('group must name a declared group id. Correct the group.'); });
    attempt(() => {
      if (own(b, 'zero') && typeof b.zero !== 'boolean') fail('zero must be boolean. Correct it.');
      if ((b.number === 0) !== (b.zero === true)) fail('Board zero needs number: 0 and zero: true together. Correct both.');
      if (b.zero && ++zeros > 1) fail('Only one board zero is allowed. Retain the current brand once.');
    });
    if (own(b, 'recommendation')) attempt(() => {
      text(b.recommendation, 'recommendation');
      if (++recommended > 2) fail('At most two boards may carry a recommendation. Leave the choice open.');
    });
    attempt(() => { if (!MODES.includes(b.primaryMode)) fail('primaryMode must be light or dark. Correct it.'); });
    attempt(() => number(b.buttonRadius, 0, 100, 'buttonRadius'));
    const validPalette = attempt(() => {
      object(b.palette, [...MODES, 'swatches', 'modeSwatches', 'chips'], 'palette');
      for (const m of MODES) {
        object(b.palette[m], ROLES, `palette.${m}`);
        REQUIRED_ROLES.forEach((r) => hex(b.palette[m][r], `palette.${m}.${r}`));
        for (const r of ROLES.filter((r) => own(b.palette[m], r))) hex(b.palette[m][r], `palette.${m}.${r}`);
      }
      return true;
    });
    result.palette = b.palette ? { ...b.palette } : {};
    if (validPalette) for (const m of MODES) result.palette[m] = { sub: b.palette[m].text, note: b.palette[m].smallPrint, panelSmallPrint: b.palette[m].smallPrint, hairline: b.palette[m].panel, ...b.palette[m] };
    attempt(() => {
      swatchList(b.palette?.swatches, 'palette.swatches');
      if (own(b.palette, 'chips')) {
        object(b.palette.chips, MODES, 'palette.chips');
        for (const m of MODES) {
          list(b.palette.chips[m], `palette.chips.${m}`);
          for (const chip of b.palette.chips[m]) {
            object(chip, ['name', 'key'], 'chip'); text(chip.name, 'chip.name');
            if (!ROLES.includes(chip.key)) fail('chip.key must name a palette role.');
          }
        }
      }
      if (own(b.palette, 'modeSwatches')) {
        object(b.palette.modeSwatches, MODES, 'palette.modeSwatches');
        for (const mode of MODES) swatchList(b.palette.modeSwatches[mode], `palette.modeSwatches.${mode}`);
      }
    });
    attempt(() => {
      object(b.tags, ['paletteLoudness', 'typeLoudness', 'typeCut'], 'tags');
      for (const k of ['paletteLoudness', 'typeLoudness']) if (![1, 2, 3].includes(b.tags[k])) fail(`tags.${k} must be 1, 2 or 3.`);
      if (!['contemporary', 'period'].includes(b.tags.typeCut)) fail('tags.typeCut must be contemporary or period.');
      const { paletteLoudness: p, typeLoudness: t, typeCut: cut } = b.tags;
      if (Math.abs(p - t) > 1 || (p === 3 && (t < 2 || cut !== 'contemporary'))) fail('type-to-colour mismatch: loudness differs by more than one, or loud colour needs contemporary type of loudness at least 2. Replace this board.');
    });
    result.type = {};
    attempt(() => object(b.type, FACE_ROLES, 'type'));
    for (const r of FACE_ROLES) if (r !== 'handwriting' || own(b.type || {}, r)) {
      result.type[r] = attempt(() => face(b.type?.[r], `type.${r}`, assets, readAsset, attempt));
    }
    attempt(() => {
      object(b.graphics, ['hero', 'pattern', 'texture', 'legend', 'title', 'description'], 'graphics');
    });
    attempt(() => {
      object(b.graphics?.hero, ['svg', 'phrase', 'placement', 'shape', 'role'], 'graphics.hero');
      if (own(b.graphics.hero, 'placement') && !['headline', 'monogram'].includes(b.graphics.hero.placement)) fail('graphics.hero.placement must be headline or monogram. Correct it.');
      if (b.graphics.hero.placement === 'monogram' && own(b.graphics.hero, 'phrase')) fail('graphics.hero.phrase needs headline placement. Remove the unused phrase.');
      drawing(b.graphics.hero.svg, 'graphics.hero.svg');
      if (own(b.graphics.hero, 'shape') && !['underline', 'surround', 'highlight'].includes(b.graphics.hero.shape)) fail('graphics.hero.shape must be underline, surround or highlight.');
      if (own(b.graphics.hero, 'role')) {
        const role = b.graphics.hero.role;
        if (typeof role === 'string') { if (!ROLES.includes(role)) fail('graphics.hero.role must name a palette role.'); }
        else {
          object(role, MODES, 'graphics.hero.role');
          for (const mode of MODES) if (!ROLES.includes(role[mode])) fail(`graphics.hero.role.${mode} must name a palette role.`);
        }
      }
      if (b.graphics.hero.shape === 'highlight' && b.graphics.hero.placement === 'monogram') fail('graphics.hero.shape highlight needs headline placement.');
      if (own(b.graphics.hero, 'phrase')) {
        text(b.graphics.hero.phrase, 'graphics.hero.phrase');
        if (!b.content?.sentence?.includes(b.graphics.hero.phrase)) fail('graphics.hero.phrase must occur in content.sentence. Correct the phrase.');
      }
    });
    for (const r of ['pattern', 'texture']) attempt(() => graphic(b.graphics?.[r], `graphics.${r}`, r === 'pattern'));
    attempt(() => {
      object(b.monogram, ['initials', 'container', 'file', 'surfaces'], 'monogram');
      if (own(b.monogram, 'file')) {
        if (own(b.monogram, 'initials') || own(b.monogram, 'container') || own(b.monogram, 'surfaces')) fail('monogram.file replaces initials and container. Supply only the existing mark.');
        result.mark = assets.add(b.monogram.file, 'image', 'monogram.file'); readAsset(result.mark);
      } else {
        text(b.monogram.initials, 'monogram.initials');
        drawing(b.monogram.container, 'monogram.container', true);
        if (own(b.monogram, 'surfaces')) {
          object(b.monogram.surfaces, ['ground', 'cardFront', 'cardBack'], 'monogram.surfaces');
          for (const [surface, v] of Object.entries(b.monogram.surfaces)) {
            object(v, ['background', 'ink', 'frame', 'radius'], `monogram.surfaces.${surface}`);
            for (const k of ['background', 'ink', 'frame']) if (!ROLES.includes(v[k])) fail(`monogram.surfaces.${surface}.${k} must name a role.`);
            number(v.radius, 0, 50, `monogram.surfaces.${surface}.radius`);
          }
        }
      }
    });
    attempt(() => {
      object(b.content, ['brandName', 'sentence', 'body', 'smallPrint', 'photoRules', 'never', 'markCaption', 'closing'], 'content');
      for (const k of ['brandName', 'sentence', 'smallPrint']) text(b.content[k], `content.${k}`);
      text(b.content.body, 'content.body', false);
      if (own(b.content, 'markCaption')) text(b.content.markCaption, 'content.markCaption');
      if (own(b.content, 'closing') && b.content.closing !== null) text(b.content.closing, 'content.closing');
      if (own(b.content, 'photoRules')) text(b.content.photoRules, 'content.photoRules', false);
      if (own(b.content, 'never')) {
        list(b.content.never, 'content.never', true); b.content.never.forEach((s) => text(s, 'content.never entry'));
      }
    });
    attempt(() => {
      text(b.graphics.title, 'graphics.title'); text(b.graphics.description, 'graphics.description');
      list(b.graphics.legend, 'graphics.legend');
      for (const [i, mark] of b.graphics.legend.entries()) {
        object(mark, ['name', 'use', 'svg'], `graphics.legend[${i}]`);
        text(mark.name, 'legend.name'); text(mark.use, 'legend.use'); drawing(mark.svg, 'legend.svg');
      }
    });
    attempt(() => {
      if (own(b, 'words')) {
        list(b.words, 'words', true);
        for (const w of b.words) { object(w, ['word', 'not'], 'words entry'); text(w.word, 'words.word'); text(w.not, 'words.not'); }
      }
      list(b.closingExamples, 'closingExamples');
      if (b.closingExamples.length < 2 || b.closingExamples.length > 3) fail('closingExamples needs two or three example answers.');
      b.closingExamples.forEach((v) => text(v, 'closingExamples entry'));
    });
    attempt(() => {
      object(b.note, ['text', 'direction', 'svg'], 'note');
      text(b.note.text, 'note.text');
      if (!['left', 'right', 'up', 'down'].includes(b.note.direction)) fail('note.direction must be left, right, up or down.');
      drawing(b.note.svg, 'note.svg');
    });
    attempt(() => {
      object(b.sample, ['kicker', 'title', 'phrase', 'body', 'note', 'steps', 'rule', 'circle', 'path', 'closing', 'meta'], 'sample');
      for (const k of ['kicker', 'title', 'phrase', 'note', 'meta']) text(b.sample[k], `sample.${k}`);
      text(b.sample.body, 'sample.body', false);
      if (!b.sample.title.includes(b.sample.phrase)) fail('sample.phrase must occur in sample.title.');
      list(b.sample.steps, 'sample.steps'); b.sample.steps.forEach((v) => text(v, 'sample.steps entry'));
      for (const k of ['rule', 'circle', 'path', 'closing']) drawing(b.sample[k], `sample.${k}`);
    });
    attempt(() => {
      object(b.items, ['cardLine', 'cardBack', 'bannerHeadline', 'bannerLine', 'contact', 'primaryAction', 'secondaryAction', 'cardBackShort', 'tileBannerHeadline'], 'items');
      for (const k of ['cardLine', 'bannerHeadline', 'bannerLine', 'contact', 'primaryAction', 'secondaryAction']) text(b.items[k], `items.${k}`);
      text(b.items.cardBack, 'items.cardBack', false);
      for (const k of ['cardBackShort', 'tileBannerHeadline']) if (own(b.items, k)) text(b.items[k], `items.${k}`);
    });
    result.swatchInks = {};
    if (validPalette) for (const mode of MODES) {
      const c = result.palette[mode];
      const record = (pairing, foreground, background, need = 4.5, lcNeed, backgroundValue = c[background]) => {
        const ratio = wcag(c[foreground], backgroundValue);
        const lc = lcNeed ? apca(c[foreground], backgroundValue) : undefined;
        result.checks.push({ mode, pairing, foreground, background, foregroundValue: c[foreground], backgroundValue, wcag: ratio, ...(need == null ? {} : { need }), ...(lcNeed ? { apcaLc: lc, apcaNeed: lcNeed } : {}) });
        if (need != null && ratio < need) errors.push(`${label}: ${mode} ${pairing}: WCAG ${ratio.toFixed(3)} < ${need}:1. Replace the failing colour pairing.`);
        if (lcNeed && Math.abs(lc) < lcNeed) errors.push(`${label}: ${mode} ${pairing}: APCA |Lc| ${Math.abs(lc).toFixed(3)} < ${lcNeed}. Replace the button colours.`);
      };
      for (const [pairing, foreground, background, need, lcNeed] of PAIRS) record(pairing, foreground, background, need, lcNeed);
      for (const [fg, bg] of [['sub', 'ground'], ['note', 'ground'], ['text', 'ground'], ['headline', 'ground'], ['smallPrint', 'ground'], ['text', 'panel'], ['headline', 'panel'], ['panelSmallPrint', 'panel'], ['mark', 'panel']]) record(`${fg} on ${bg}`, fg, bg, fg === 'mark' ? null : 4.5);
      // The maximum pattern/texture alpha is also tested under every text role.
      // Rounding to opaque sRGB matches the composited browser colour to a byte.
      for (const [graphic, bg, fgs, ink] of [
        [b.graphics?.pattern, 'ground', ['text', 'headline', 'smallPrint', 'sub', 'note', 'mark'], 'mark'],
        [b.graphics?.texture, 'cardBack', ['cardBackText'], 'cardBackMark']
      ]) if (graphic?.strength && typeof graphic.svg === 'string') {
        for (const key of inks(graphic.svg, ink)) for (const fg of fgs) record(`${fg} over ${ink === 'mark' ? 'pattern' : 'texture'} ${key}`, fg, bg, fg === 'mark' ? null : 4.5, undefined, blend(c[key], c[bg], graphic.strength[mode]));
      }
      const drawn = (svg, ink, bg, label, need = null) => {
        for (const key of inks(svg, ink)) record(`${label} role ${key}`, key, bg, need);
      };
      const hero = b.graphics?.hero, role = typeof hero?.role === 'object' ? hero.role?.[mode] : hero?.role;
      const heroInk = ROLES.includes(role) ? role : 'mark';
      drawn(hero?.svg, heroInk, 'ground', 'hero');
      if (hero?.shape === 'highlight') {
        // Use the smallest rendered headline (including the narrow tile).
        const need = b.type?.heading?.sizes?.display?.size * (spec.boards.length > 1 ? .36 : .58) < 24 ? 4.5 : 3;
        for (const key of inks(hero.svg, heroInk)) record(`headline on highlight ${key}`, 'headline', key, need);
      }
      drawn(b.graphics?.pattern?.svg, 'mark', 'ground', 'pattern');
      drawn(b.graphics?.texture?.svg, 'cardBackMark', 'cardBack', 'texture');
      drawn(b.note?.svg, 'mark', 'ground', 'note arrow');
      if (!result.mark) for (const [surface, fallback] of [['ground', 'headline'], ['cardFront', 'cardFrontText'], ['cardBack', 'cardBackText']]) {
        const v = b.monogram?.surfaces?.[surface];
        if (v && [v.ink, v.background, v.frame].every((k) => ROLES.includes(k))) { record(`monogram on ${surface}`, v.ink, v.background, 3); record(`monogram frame on ${surface}`, v.frame, v.background, 3); }
        drawn(b.monogram?.container, ROLES.includes(v?.frame) ? v.frame : fallback, ROLES.includes(v?.background) ? v.background : surface, `monogram container on ${surface}`, 3);
      }
      for (const v of Array.isArray(b.graphics?.legend) ? b.graphics.legend : []) drawn(v.svg, 'mark', 'panel', 'legend');
      for (const k of ['rule', 'circle', 'path', 'closing']) drawn(b.sample?.[k], 'mark', 'ground', `sample ${k}`);
      drawn(b.sample?.circle, 'mark', 'panel', 'other sample circle');
      drawn(b.sample?.rule, 'mark', 'panel', 'banner rule');
      const swatchInput = b.palette.modeSwatches?.[mode] || b.palette.swatches;
      const swatches = Array.isArray(swatchInput) ? swatchInput : [];
      result.swatchInks[mode] = {};
      for (const sw of [...swatches, ...(Array.isArray(b.palette.chips?.[mode]) ? b.palette.chips[mode] : [])]) {
        if (!sw || !ROLES.includes(sw.key)) continue;
        // Stable maximum ratio, ties follow the documented role order. No
        // colour outside the caller's palette can be introduced by this choice.
        const fg = ROLES.reduce((best, r) => wcag(c[r], c[sw.key]) > wcag(c[best], c[sw.key]) ? r : best, ROLES[0]);
        result.swatchInks[mode][sw.key] = fg;
        record(`palette bar and chip ${sw.name}`, fg, sw.key);
      }
      // Colour use is classified by resolved value, not by role name. Swatch
      // demonstrations do not turn a drawing colour into running text ink.
      const checks = result.checks.filter((p) => p.mode === mode);
      const functional = new Set(checks.filter((p) => p.need != null && !p.pairing.startsWith('palette bar and chip ')).flatMap((p) => [p.foregroundValue, ...(p.pairing.startsWith('headline on highlight ') ? [] : [p.backgroundValue])]).map((v) => rgb(v).join(',')));
      const reported = new Set();
      for (const p of checks.filter((p) => p.need == null)) {
        const value = rgb(p.foregroundValue).join(',');
        if (!functional.has(value) && !reported.has(value)) { record(`marks-only ${p.foreground} on ground`, p.foreground, 'ground', null); reported.add(value); }
      }
    }
    result.checks.push({ mode: 'page', pairing: 'page header, metadata, links and foot', foreground: 'pageChromeText', background: 'pageChromeGround', foregroundValue: '#242832', backgroundValue: '#e7e5e2', wcag: wcag('#242832', '#e7e5e2'), need: 4.5 });
    result.checks.push({ mode: 'page', pairing: 'board energy label', foreground: 'pageChromeText', background: 'pageChromeEnergy', foregroundValue: '#242832', backgroundValue: '#d9d7d2', wcag: wcag('#242832', '#d9d7d2'), need: 4.5 });
    return result;
  });
  for (const g of spec.groups) if (!boards.some((b) => b.group === g.id && !b.zero)) errors.push(`Group ${g.label}: no boards. Remove the empty group or supply its boards.`);
  if (errors.length) fail(`${errors.join('\n')}\nNothing was written. Correct every listed board and run again.`);
  return { ...spec, boards };
}

export const brandBoardsHtml = renderBrandBoards;
