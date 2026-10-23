// Static brand-board views. Validation supplies fonts, role colours and every
// decision; fragment targets switch views without a script or external asset.
import { checkSvg } from './svg.js';
import { BRAND_BOARD_CSS } from './brand-board-style.js';
const FACES = ['heading', 'body', 'handwriting'];
const FORMAT = { '.ttf': 'truetype', '.otf': 'opentype', '.woff': 'woff', '.woff2': 'woff2' };
const esc = (s) => String(s).replace(/[&<>"':@(]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', ':': '&#58;', '@': '&#64;', '(': '&#40;' })[c]);
const opposite = (mode) => mode === 'light' ? 'dark' : 'light';
const heroRole = (b, mode) => typeof b.graphics.hero.role === 'object' ? b.graphics.hero.role[mode] : (b.graphics.hero.role || 'mark');
const settings = (v) => v ? Object.entries(v).map(([axis, n]) => `&quot;${axis}&quot; ${n}`).join(',') : 'normal';
function faceStyle(b, role, scale = 'small', size) {
  const f = b.type[role], v = f.sizes[scale];
  const file = f.files.find((f) => f.range[0] <= v.weight && f.range[1] >= v.weight);
  return `font-family:bb-${b.number}-${role};font-weight:${v.weight};font-style:${file.style};font-variation-settings:${settings(v.variations ?? f.variations)};font-size:${size ?? v.size}px;line-height:${v.lineHeight};letter-spacing:${v.tracking}em`;
}
function vars(b, mode) {
  return `${Object.entries(b.palette[mode]).map(([k, v]) => `--${k}:${v}`).join(';')};--radius:${b.buttonRadius}px;--display-size:${b.type.heading.sizes.display.size}px;${faceStyle(b, 'body')}`;
}
function uri(svg, c, ink) {
  const namespaced = /\bxmlns\s*=/.test(svg) ? svg : svg.replace(/<svg\b/, '<svg xmlns="http://www.w3.org/2000/svg"');
  const resolved = namespaced.replace(/\{\{([A-Za-z]+)\}\}/g, (_, k) => c[k]).replace(/currentColor/g, ink).replace(/<svg\b/, `<svg color="${ink}"${/\bfill\s*=/.test(svg.match(/<svg[^>]*>/)?.[0] || '') ? '' : ` fill="${ink}"`}`);
  checkSvg(Buffer.from(resolved));
  return `data:image/svg+xml;base64,${Buffer.from(resolved).toString('base64')}`;
}
const art = (svg, c, ink, cls = '', alt = '') => `<img class="${cls}" src="${uri(svg, c, ink)}" alt="${esc(alt)}">`;
function mark(b, mode, size, ink, surface = 'ground') {
  if (b.mark) return `<img class="own-mark" src="${b.mark.uri}" width="${size}" height="${size}" alt="${esc(b.content.brandName)} mark">`;
  const v = b.monogram.surfaces?.[surface], c = b.palette[mode];
  const frame = v ? c[v.frame] : ink;
  if (v) ink = c[v.ink];
  return `<span class="monogram" style="width:${size}px;height:${size}px;color:${ink};${v ? `background:${c[v.background]};border-radius:${v.radius}%;` : ''}${faceStyle(b, 'heading', 'small', size * .46)}" role="img" aria-label="${esc(b.monogram.initials)} placeholder monogram">${art(b.monogram.container, b.palette[mode], frame)}<span>${esc(b.monogram.initials)}</span></span>`;
}
function lockup(spec, b, mode, compact = false) {
  const c = b.palette[mode], logo = mark(b, mode, compact ? 28 : 56, c.headline);
  const icon = b.graphics.hero.placement === 'monogram' ? `<span class="hero-monogram">${logo}${art(b.graphics.hero.svg, c, c[heroRole(b, mode)], 'hero-frame')}</span>` : logo;
  return `<div class="lockup person" style="${faceStyle(b, 'heading', 'small', compact ? 16 : 30)}">${icon}<span>${esc(spec.person)}</span></div>`;
}
function phrase(text, selected, svg, c, ink, cls) {
  const start = text.indexOf(selected);
  return `${esc(text.slice(0, start))}<span class="${cls}">${esc(selected)}${art(svg, c, ink, 'phrase-ink')}</span>${esc(text.slice(start + selected.length))}`;
}
function headline(b, mode) {
  const h = b.graphics.hero;
  return h.placement === 'monogram' ? esc(b.content.sentence) : phrase(b.content.sentence, h.phrase || b.content.sentence, h.svg, b.palette[mode], b.palette[mode][heroRole(b, mode)], `hero-phrase ${h.shape || 'underline'}`);
}
function note(b, mode) {
  const c = b.palette[mode], role = b.type.handwriting ? 'handwriting' : 'body';
  return `<aside class="margin-note" style="${faceStyle(b, role, 'middle')}">${art(b.note.svg, c, c.mark, `note-arrow arrow-${b.note.direction}`)}<span>${esc(b.note.text)}</span></aside>`;
}
function swatches(b, mode, chips = false, compact = false) {
  const c = b.palette[mode], list = (chips && b.palette.chips?.[mode]) || b.palette.modeSwatches?.[mode] || b.palette.swatches;
  const bars = list.map((s) => `<div class="colour-bar" data-swatch="${esc(s.key)}" style="background:${c[s.key]};color:${c[b.swatchInks[mode][s.key]]}"><div><b style="${faceStyle(b, compact ? 'body' : 'heading', 'small', compact ? 11 : 22)}">${esc(s.name)}</b>${chips || compact ? '' : `<span>${esc(s.role)}${s.key === 'pop' ? ' · Pop colour' : ''}</span>`}</div>${compact ? '' : `<span class="value">${c[s.key]}${chips ? '' : `<br>${s.share}%`}</span>`}</div>`).join('');
  if (chips) return `<div class="named-chips" aria-label="${mode} palette">${bars}</div>`;
  return `<section class="palette" aria-label="Palette · ${mode}"><div class="swatches">${bars}</div>${compact ? '' : `<div class="share-strip" aria-label="Share of a typical page">${list.map((s) => `<i style="flex:${s.share};background:${c[s.key]}"></i>`).join('')}</div><p class="label">Share of a typical page</p>`}</section>`;
}
function types(b, compact) {
  if (compact) return `<section class="type-strip">${FACES.filter((r) => b.type[r] && (r !== 'handwriting' || ![b.type.heading.family, b.type.body.family].includes(b.type[r].family))).map((r) => `<span class="strip-aa strip-${r}" style="${faceStyle(b, r, 'display', r === 'heading' ? 34 : 28)}">Aa</span><span class="label">${esc(b.type[r].stripLabel || b.type[r].family)}</span>`).join('')}</section>`;
  return ['heading', 'body'].map((r) => `<section class="face-sample ${r}-face"><h3 style="${faceStyle(b, r, 'small', r === 'heading' ? 22 : 20)}">${esc(b.type[r].family)}</h3>${r === 'heading' ? `<p class="label">${esc(b.type[r].description)} Licence: ${esc(b.type[r].licence)}.</p>` : ''}<div class="aa" style="${faceStyle(b, r, 'display', r === 'heading' ? 88 : 72)}">Aa</div><p class="type-line" style="${faceStyle(b, r, 'middle')}">${esc(b.type[r].sample)}</p><p class="label">${r === 'body' ? `${esc(b.type[r].description)} Licence: ${esc(b.type[r].licence)}. ` : ''}Weights ${b.type[r].weights.join(', ')}${b.type[r].variations ? ` · Axes ${esc(JSON.stringify(b.type[r].variations))}` : ''}</p></section>`).join('') + (b.words?.length ? `<section class="words"><p class="label">The words</p><ul>${b.words.map((w) => `<li style="${faceStyle(b, 'heading', 'middle', 30)}">${esc(w.word)}, <i>not ${esc(w.not)}</i></li>`).join('')}</ul></section>` : '');
}
function sampleTitle(b, mode) {
  return phrase(b.sample.title, b.sample.phrase, b.sample.circle, b.palette[mode], b.palette[mode].mark, 'ring');
}
function graphicLanguage(b, mode) {
  const c = b.palette[mode];
  return `<section class="graphic-language" aria-label="Graphic language"><div class="sample-page">${art(b.sample.rule, c, c.mark, 'sample-rule')}<p class="sample-kicker">${esc(b.sample.kicker)}</p><h3 class="sample-title" style="${faceStyle(b, 'heading', 'middle', 30)}">${sampleTitle(b, mode)}</h3><div class="sample-body"><p>${esc(b.sample.body)}</p><aside style="${faceStyle(b, b.type.handwriting ? 'handwriting' : 'body', 'small', 17)}">${esc(b.sample.note)}</aside></div><div class="sample-steps">${art(b.sample.path, c, c.mark)}<div>${b.sample.steps.map((s) => `<span>${esc(s)}</span>`).join('')}</div></div>${art(b.sample.closing, c, c.mark, 'sample-close')}</div><div class="legend"><h3 style="${faceStyle(b, 'heading', 'small', 26)}">${esc(b.graphics.title)}</h3><p class="label">${esc(b.graphics.description)}</p><ul>${b.graphics.legend.map((m) => `<li>${art(m.svg, c, c.mark, 'legend-mark', m.name)}<span><b>${esc(m.name)}.</b> ${esc(m.use)}</span></li>`).join('')}</ul></div></section>`;
}
function front(b, mode, compact) {
  const c = b.palette[mode];
  return `<div class="business-card front"><div class="card-name"><b style="${faceStyle(b, 'heading', 'small', compact ? 13 : 22)}">${esc(b.content.brandName)}</b>${mark(b, mode, compact ? 20 : 40, c.cardFrontText, 'cardFront')}</div><span>${esc(b.items.cardLine)}</span><span class="contact">${esc(b.items.contact)}</span></div>`;
}
function back(b, mode, compact) {
  const c = b.palette[mode];
  return `<div class="business-card back"><div class="texture" aria-hidden="true" style="background-image:url('${uri(b.graphics.texture.svg, c, c.cardBackMark)}');opacity:${b.graphics.texture.strength[mode]}"></div>${mark(b, mode, compact ? 32 : 56, c.cardBackText, 'cardBack')}<b style="${faceStyle(b, b.type.handwriting ? 'handwriting' : 'heading', 'middle', compact ? 12 : 24)}">${esc(compact ? (b.items.cardBackShort || b.items.cardBack) : b.items.cardBack)}</b></div>`;
}
function markSizes(spec, b, mode) {
  const c = b.palette[mode];
  return `<section class="mark-sizes"><div class="size-row">${[112, 56, 28].map((size) => mark(b, mode, size, c.headline)).join('')}<div class="browser-tab"><span>${mark(b, mode, 16, c.headline)}${esc(spec.person)}</span></div></div><p class="label">${b.mark ? 'Your mark' : 'The monogram is a placeholder, not a logo. The real mark is drawn after a board is locked.'} · profile picture to browser tab${b.mark ? '' : ` · ${esc(b.type.heading.family)}`}.</p></section>`;
}
function tileBanner(spec, b, mode) {
  const m = opposite(mode), c = b.palette[m];
  return `<div class="tile-banner" style="${vars(b, m)}"><div class="lockup" style="${faceStyle(b, 'heading', 'small', 10)}">${mark(b, m, 15, c.headline)}<span>${esc(b.content.brandName)}</span></div><b style="${faceStyle(b, 'heading', 'display', b.type.heading.sizes.display.size * .17)}">${esc(b.items.tileBannerHeadline || b.items.bannerHeadline)}</b><span class="board-button">${esc(b.items.primaryAction)}</span></div>`;
}
function banner(b, mode) {
  const c = b.palette[mode];
  return `<section class="banner-section" aria-label="Social banner"><div class="social-banner">${art(b.sample.rule, c, c.mark, 'banner-rule')}<div class="banner-copy"><b style="${faceStyle(b, 'heading', 'display')}">${esc(b.items.bannerHeadline)}</b><p>${esc(b.items.bannerLine)}</p></div><span class="banner-contact">${esc(b.items.contact)}</span></div><p class="label">Social banner · the left third stays clear for the profile picture.</p></section>`;
}
function otherPanel(spec, b, mode) {
  const m = opposite(mode), c = b.palette[m];
  return `<section class="other-mode" data-other-mode="${m}" style="${vars(b, m)}" aria-label="${m} · the same board"><div class="other-left">${lockup(spec, b, m)}<h2 style="${faceStyle(b, 'heading', 'display', b.type.heading.sizes.display.size * .6)}">${esc(b.content.sentence)}</h2><p>${esc(b.content.body)}</p><div class="actions"><span class="board-button">${esc(b.items.primaryAction)}</span><span class="secondary-link">${esc(b.items.secondaryAction)}</span></div></div><div class="other-right"><div class="content-card"><p class="sample-kicker">${esc(b.sample.kicker)}</p><b style="${faceStyle(b, 'heading', 'middle', 32)}">${sampleTitle(b, m)}</b><span class="label">${esc(b.sample.meta)}</span></div>${swatches(b, m, true)}</div></section>`;
}
function rules(b) {
  const photo = b.content.photoRules ? `<div><h3 style="${faceStyle(b, 'heading', 'small', 22)}">Photo rules</h3><p>${esc(b.content.photoRules)}</p></div>` : '';
  const never = b.content.never?.length ? `<div><h3 style="${faceStyle(b, 'heading', 'small', 22)}">Never</h3><p>${b.content.never.map(esc).join(' ')}</p></div>` : '';
  return photo || never ? `<section class="rules">${photo}${never}</section>` : '';
}
function board(spec, b, mode, compact = false) {
  const c = b.palette[mode], h = b.type.heading.sizes.display;
  const hero = `<section class="brand-hero">${lockup(spec, b, mode, compact)}<h2 class="brand-headline" style="${faceStyle(b, 'heading', 'display', compact ? h.size * .47 : h.size)};max-width:min(${h.maxWidth || 12}em,100%)">${headline(b, mode)}${compact ? '' : note(b, mode)}</h2><p class="hero-body">${esc(b.content.body)}</p>${compact ? '' : `<p class="hero-small label">${esc(b.content.smallPrint)}</p>`}</section>`;
  return `<div class="brand-board${compact ? ' tile' : ''}" data-board="${b.number}" data-mode="${mode}" style="${vars(b, mode)}"><div class="page-pattern" aria-hidden="true" style="background-image:url('${uri(b.graphics.pattern.svg, c, c.mark)}');opacity:${b.graphics.pattern.strength[mode]};transform:rotate(${b.graphics.pattern.angle || 0}deg)"></div>${compact ? `<div class="tile-top">${hero}${swatches(b, mode, false, true)}</div>${types(b, true)}<section class="tile-items" aria-label="Business card · front and back and social banner">${front(b, mode, true)}${back(b, mode, true)}${tileBanner(spec, b, mode)}</section><div class="open-space"><a class="board-button" href="#whole-${b.number}">Open the whole board <span aria-hidden="true">→</span></a></div>` : `${hero}${swatches(b, mode)}${types(b, false)}${graphicLanguage(b, mode)}<section class="items" aria-label="Business card · front and back"><div class="card-pair">${front(b, mode, false)}${back(b, mode, false)}</div><p class="label">Business card · front and back · 3.5 × 2 in</p>${markSizes(spec, b, mode)}</section>${banner(b, mode)}${otherPanel(spec, b, mode)}${rules(b)}`}</div>`;
}
function metadata(b) {
  return `<div class="board-meta"><p class="energy">${esc(b.energy)}</p><h2>${b.number} · ${esc(b.name)}</h2>${b.zero ? '<p class="board-zero">Your brand as it is today · Board zero</p>' : ''}${b.recommendation ? `<p class="recommendation"><b>Recommended</b> · ${esc(b.recommendation)}</p>` : ''}<p>${esc(b.why)}</p></div>`;
}
function foot(b) {
  const colour = (v) => (v.length === 4 ? '#' + [...v.slice(1)].map((h) => h + h).join('') : v).toLowerCase();
  const min = Math.min(...b.checks.filter((p) => p.need != null).map((p) => p.wcag));
  const marks = b.checks.filter((p) => p.pairing.startsWith('marks-only ')).map((p) => {
    const swatches = b.palette.modeSwatches?.[p.mode] || b.palette.swatches;
    const name = swatches.find((s) => colour(b.palette[p.mode][s.key]) === colour(p.foregroundValue))?.name || p.foreground;
    return `${esc(name)} (${p.foregroundValue}, ${p.mode}) is for marks only, ${p.wcag.toFixed(2)}:1 on the ground.`;
  }).join(' ');
  return `<footer class="whole-foot"><p class="last-line">What would you keep, and what would you change?</p><p class="example-answers">${b.closingExamples.map((s) => `“${esc(s)}”`).join(', ')}.</p><p class="licences">${FACES.filter((r) => b.type[r]).map((r) => `${esc(b.type[r].family)} (${r}) · Licence: ${esc(b.type[r].licence)}`).join('; ')}. Contrast results: every text pairing passes WCAG 2; required pairings have a minimum of ${min.toFixed(2)}:1; button text passes 4.5:1 and APCA |Lc| 60 in both modes. ${marks}</p><details class="contrast-results"><summary>Every checked pairing</summary><ul>${b.checks.map((p) => `<li>${p.mode} · ${esc(p.pairing)}: WCAG ${p.wcag.toFixed(3)}:1 ${p.need == null ? '(decoration, reported only)' : `(needs ${p.need}:1)`}${p.apcaNeed ? ` · APCA Lc ${p.apcaLc.toFixed(3)} (needs |Lc| ${p.apcaNeed})` : ''}</li>`).join('')}</ul></details></footer>`;
}
export function renderBrandBoards(spec) {
  const fonts = spec.boards.flatMap((b) => FACES.filter((r) => b.type[r]).flatMap((r) => b.type[r].files.map((f) => `@font-face{font-family:bb-${b.number}-${r};src:url("${f.asset.uri}") format("${FORMAT[f.asset.extension]}");font-weight:${f.range[0] === f.range[1] ? f.range[0] : f.range.join(' ')};font-style:${f.style};font-display:block}`))).join('\n');
  const label = `{OvO} Wiser · Brand boards for ${esc(spec.person)}`;
  const zero = spec.boards.find((b) => b.zero), single = spec.boards.length === 1;
  const ordered = [...(zero ? [zero] : []), ...spec.groups.flatMap((g) => spec.boards.filter((b) => b.group === g.id && !b.zero))];
  const tile = (b) => `<article class="board-option">${metadata(b)}${board(spec, b, b.primaryMode, true)}</article>`;
  const intro = spec.intro.map((s) => `<p>${esc(s)}</p>`).join('');
  const index = single ? '' : `<div class="index-page"><header id="all-boards"><h1>${label}</h1>${intro}</header>${zero ? `<div class="boards-grid zero-first">${tile(zero)}</div>` : ''}${spec.groups.map((g) => `<section class="board-group"><h2 class="group-label">${esc(g.label)}</h2><div class="boards-grid">${spec.boards.filter((b) => b.group === g.id && !b.zero).map(tile).join('')}</div></section>`).join('')}<footer class="page-foot">${esc(spec.footnote)}</footer></div>`;
  const wholes = ordered.map((b, i) => `<section class="whole-view" id="whole-${b.number}" aria-label="${esc(b.name)} whole board">${[b.primaryMode, opposite(b.primaryMode)].map((mode) => `<div class="mode-sheet${mode === b.primaryMode ? ' primary' : ''}" id="whole-${b.number}-${mode}"><header class="sheet-head"${single && mode === b.primaryMode ? ' id="all-boards"' : ''}><div><p class="wiser-label">${label}</p>${single ? `<div class="sheet-intro">${intro}</div>` : ''}<p class="board-nav">${single ? '' : `<a href="#all-boards">← All ${ordered.length} boards</a> · Board ${i + 1} of ${ordered.length} · `}${mode} · <a href="#whole-${b.number}-${opposite(mode)}">See it in ${opposite(mode)}</a></p>${metadata(mode === b.primaryMode ? b : { ...b, recommendation: undefined })}</div></header>${board(spec, b, mode)}${foot(b)}</div>`).join('')}</section>`).join('\n');
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Brand boards for ${esc(spec.person)}</title><style>${BRAND_BOARD_CSS}\n${fonts}</style></head><body><main class="${single ? 'single-board' : 'board-collection'}">${index}${wholes}${single ? `<footer class="page-foot">${esc(spec.footnote)}</footer>` : ''}</main></body></html>\n`;
}
