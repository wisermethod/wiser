// Static brand-board views. Validation supplies fonts, role colours and every
// decision; fragment targets switch views without a script or external asset.
import { checkSvg } from './svg.js';
import { BRAND_BOARD_CSS } from './brand-board-style.js';
import { createBoardModel, oppositeMode as opposite } from './board-model.js';
const FACES = ['heading', 'body', 'handwriting'];
const FORMAT = { '.ttf': 'truetype', '.otf': 'opentype', '.woff': 'woff', '.woff2': 'woff2' };
const esc = (s) => String(s).replace(/[&<>"':@(]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', ':': '&#58;', '@': '&#64;', '(': '&#40;' })[c]);
const settings = (v) => v ? Object.entries(v).map(([axis, n]) => `&quot;${axis}&quot; ${n}`).join(',') : 'normal';
function faceStyle(b, v) {
  return `font-family:bb-${b.number}-${v.role};font-weight:${v.weight};font-style:${v.style};font-variation-settings:${settings(v.variations)};font-size:${v.size}px;line-height:${v.lineHeight};letter-spacing:${v.letterSpacing}em`;
}
function vars(b, mode) {
  return `${Object.entries(b.palette[mode]).map(([k, v]) => `--${k}:${v}`).join(';')};--radius:${b.buttonRadius}px;--display-size:${b.type.heading.sizes.display.size}px;${faceStyle(b, b.textStyles.body)}`;
}
function uri(resolved) {
  checkSvg(Buffer.from(resolved));
  return `data:image/svg+xml;base64,${Buffer.from(resolved).toString('base64')}`;
}
const art = (svg, cls = '', alt = '') => `<img class="${cls}" src="${uri(svg)}" alt="${esc(alt)}">`;
function mark(b, mode, size, ink, surface = 'ground') {
  if (b.mark) return `<img class="own-mark" src="${b.mark.uri}" width="${size}" height="${size}" alt="${esc(b.content.brandName)} mark">`;
  const v = b.monogram.surfaces?.[surface], c = b.palette[mode];
  if (v) ink = c[v.ink];
  return `<span class="monogram" style="width:${size}px;height:${size}px;color:${ink};${v ? `background:${c[v.background]};border-radius:${v.radius}%;` : ''}${faceStyle(b, b.textStyles.monograms[size])}" role="img" aria-label="${esc(b.monogram.initials)} placeholder monogram">${art(b.modes[mode].drawings.monogram[surface].svg)}<span>${esc(b.monogram.initials)}</span></span>`;
}
function lockup(spec, b, mode, compact = false) {
  const c = b.palette[mode], logo = mark(b, mode, compact ? 28 : 56, c.headline);
  const icon = b.graphics.hero.placement === 'monogram' ? `<span class="hero-monogram">${logo}${art(b.modes[mode].drawings.hero, 'hero-frame')}</span>` : logo;
  return `<div class="lockup person" style="${faceStyle(b, compact ? b.textStyles.tilePerson : b.textStyles.person)}">${icon}<span>${esc(spec.person)}</span></div>`;
}
function phrase(text, selected, svg, cls) {
  const start = text.indexOf(selected);
  return `${esc(text.slice(0, start))}<span class="${cls}">${esc(selected)}${art(svg, 'phrase-ink')}</span>${esc(text.slice(start + selected.length))}`;
}
function headline(b, mode) {
  const h = b.graphics.hero;
  return h.placement === 'monogram' ? esc(b.content.sentence) : phrase(b.content.sentence, h.phrase || b.content.sentence, b.modes[mode].drawings.hero, `hero-phrase ${h.shape || 'underline'}`);
}
function note(b, mode) {
  const c = b.palette[mode];
  return `<aside class="margin-note" style="${faceStyle(b, b.textStyles.note)}">${art(b.modes[mode].drawings.arrow, `note-arrow arrow-${b.note.direction}`)}<span>${esc(b.note.text)}</span></aside>`;
}
function swatches(b, mode, chips = false, compact = false) {
  const c = b.palette[mode], list = b.modes[mode][chips ? 'chips' : 'swatches'];
  const bars = list.map((s) => `<div class="colour-bar" data-swatch="${esc(s.key)}" style="background:${c[s.key]};color:${c[b.swatchInks[mode][s.key]]}"><div><b style="${faceStyle(b, compact ? b.textStyles.tileSwatch : b.textStyles.swatch)}">${esc(s.name || s.value)}</b>${chips || compact || !b.showChecks ? '' : `<span>${esc(s.role)}${s.key === 'pop' ? ' · Pop colour' : ''}</span>`}</div>${compact || !s.name ? '' : `<span class="value">${c[s.key]}${chips || !b.showChecks ? '' : `<br>${s.share}%`}</span>`}</div>`).join('');
  if (chips) return `<div class="named-chips" aria-label="${mode} palette">${bars}</div>`;
  return `<section class="palette" aria-label="Palette · ${mode}"><div class="swatches">${bars}</div>${compact ? '' : `<div class="share-strip" ${b.showChecks ? 'aria-label="Share of a typical page"' : 'aria-hidden="true"'}>${list.map((s) => `<i style="flex:${s.share};background:${c[s.key]}"></i>`).join('')}</div>${b.showChecks ? '<p class="label">Share of a typical page</p>' : ''}`}</section>`;
}
function types(b, compact) {
  if (compact) return `<section class="type-strip">${FACES.filter((r) => b.type[r] && (r !== 'handwriting' || ![b.type.heading.family, b.type.body.family].includes(b.type[r].family))).map((r) => `<span class="strip-aa strip-${r}" style="${faceStyle(b, b.textStyles.strip[r])}">Aa</span><span class="label">${esc(b.type[r].stripLabel || b.type[r].family)}</span>`).join('')}</section>`;
  return ['heading', 'body'].map((r) => `<section class="face-sample ${r}-face"><h3 style="${faceStyle(b, b.textStyles.specimens[r].name)}">${esc(b.type[r].family)}</h3>${r === 'heading' ? `<p class="label">${esc(b.type[r].description)} Licence: ${esc(b.type[r].licence)}.</p>` : ''}<div class="aa" style="${faceStyle(b, b.textStyles.specimens[r].aa)}">Aa</div><p class="type-line" style="${faceStyle(b, b.textStyles.specimens[r].line)}">${esc(b.type[r].sample)}</p><p class="label">${r === 'body' ? `${esc(b.type[r].description)} Licence: ${esc(b.type[r].licence)}. ` : ''}Weights ${b.type[r].weights.join(', ')}${b.type[r].variations ? ` · Axes ${esc(JSON.stringify(b.type[r].variations))}` : ''}</p></section>`).join('') + (b.words?.length ? `<section class="words"><p class="label">${esc(b.labels.words)}</p><ul>${b.words.map((w) => `<li style="${faceStyle(b, b.textStyles.words)}">${esc(w.word)}, <i>not ${esc(w.not)}</i></li>`).join('')}</ul></section>` : '');
}
function sampleTitle(b, mode) {
  return phrase(b.sample.title, b.sample.phrase, b.modes[mode].drawings.sample.circle, 'ring');
}
function graphicLanguage(b, mode) {
  const c = b.palette[mode];
  return `<section class="graphic-language" aria-label="Graphic language"><div class="sample-page">${art(b.modes[mode].drawings.sample.rule, 'sample-rule')}<p class="sample-kicker">${esc(b.sample.kicker)}</p><h3 class="sample-title" style="${faceStyle(b, b.textStyles.sampleTitle)}">${sampleTitle(b, mode)}</h3><div class="sample-body"><p>${esc(b.sample.body)}</p><aside style="${faceStyle(b, b.textStyles.sampleNote)}">${esc(b.sample.note)}</aside></div><div class="sample-steps">${art(b.modes[mode].drawings.sample.path)}<div>${b.sample.steps.map((s) => `<span>${esc(s)}</span>`).join('')}</div></div>${art(b.modes[mode].drawings.sample.closing, 'sample-close')}</div><div class="legend"><h3 style="${faceStyle(b, b.textStyles.legendTitle)}">${esc(b.graphics.title)}</h3><p class="label">${esc(b.graphics.description)}</p><ul>${b.modes[mode].drawings.legend.map((m) => `<li>${art(m.svg, 'legend-mark', m.name)}<span><b>${esc(m.name)}.</b> ${esc(m.use)}</span></li>`).join('')}</ul></div></section>`;
}
function front(b, mode, compact) {
  const c = b.palette[mode];
  return `<div class="business-card front"><div class="card-name"><b style="${faceStyle(b, compact ? b.textStyles.tileCardName : b.textStyles.cardName)}">${esc(b.content.brandName)}</b>${mark(b, mode, compact ? 20 : 40, c.cardFrontText, 'cardFront')}</div><span>${esc(b.items.cardLine)}</span><span class="contact">${esc(b.items.contact)}</span></div>`;
}
function back(b, mode, compact) {
  const c = b.palette[mode];
  return `<div class="business-card back"><div class="texture" aria-hidden="true" style="background-image:url('${uri(b.modes[mode].drawings.texture)}');opacity:${b.graphics.texture.strength[mode]}"></div>${mark(b, mode, compact ? 32 : 56, c.cardBackText, 'cardBack')}<b style="${faceStyle(b, compact ? b.textStyles.tileCardBack : b.textStyles.cardBack)}">${esc(compact ? (b.items.cardBackShort || b.items.cardBack) : b.items.cardBack)}</b></div>`;
}
function markSizes(spec, b, mode) {
  const c = b.palette[mode];
  return `<section class="mark-sizes"><div class="size-row">${[112, 56, 28].map((size) => mark(b, mode, size, c.headline)).join('')}<div class="browser-tab"><span>${mark(b, mode, 16, c.headline)}${esc(spec.person)}</span></div></div><p class="label">${esc(b.markCaption)} · ${esc(b.labels.markSizes)}${b.mark ? '' : ` · ${esc(b.type.heading.family)}`}.</p></section>`;
}
function tileBanner(spec, b, mode) {
  const m = opposite(mode), c = b.palette[m];
  return `<div class="tile-banner" style="${vars(b, m)}"><div class="lockup" style="${faceStyle(b, b.textStyles.tileBannerName)}">${mark(b, m, 15, c.headline)}<span>${esc(b.content.brandName)}</span></div><b style="${faceStyle(b, b.textStyles.tileBannerHeadline)}">${esc(b.items.tileBannerHeadline || b.items.bannerHeadline)}</b><span class="board-button">${esc(b.items.primaryAction)}</span></div>`;
}
function banner(b, mode) {
  const c = b.palette[mode];
  return `<section class="banner-section" aria-label="Social banner"><div class="social-banner">${art(b.modes[mode].drawings.sample.rule, 'banner-rule')}<div class="banner-copy"><b style="${faceStyle(b, b.textStyles.banner)}">${esc(b.items.bannerHeadline)}</b><p>${esc(b.items.bannerLine)}</p></div><span class="banner-contact">${esc(b.items.contact)}</span></div><p class="label">${esc(b.labels.banner)}</p></section>`;
}
function otherPanel(spec, b, mode) {
  const m = opposite(mode), c = b.palette[m];
  return `<section class="other-mode" data-other-mode="${m}" style="${vars(b, m)}" aria-label="${m} · the same board"><div class="other-left">${lockup(spec, b, m)}<h2 style="${faceStyle(b, b.textStyles.otherHeadline)}">${esc(b.content.sentence)}</h2><p>${esc(b.content.body)}</p><div class="actions"><span class="board-button">${esc(b.items.primaryAction)}</span><span class="secondary-link">${esc(b.items.secondaryAction)}</span></div></div><div class="other-right"><div class="content-card"><p class="sample-kicker">${esc(b.sample.kicker)}</p><b style="${faceStyle(b, b.textStyles.contentCard)}">${sampleTitle(b, m)}</b><span class="label">${esc(b.sample.meta)}</span></div>${swatches(b, m, true)}</div></section>`;
}
function rules(b) {
  const photo = b.content.photoRules ? `<div><h3 style="${faceStyle(b, b.textStyles.ruleTitle)}">${esc(b.labels.photoRules)}</h3><p>${esc(b.content.photoRules)}</p></div>` : '';
  const never = b.content.never?.length ? `<div><h3 style="${faceStyle(b, b.textStyles.ruleTitle)}">${esc(b.labels.never)}</h3><p>${b.content.never.map(esc).join(' ')}</p></div>` : '';
  return photo || never ? `<section class="rules">${photo}${never}</section>` : '';
}
function board(spec, b, mode, compact = false) {
  const c = b.palette[mode], h = b.type.heading.sizes.display;
  const hero = `<section class="brand-hero">${lockup(spec, b, mode, compact)}<h2 class="brand-headline" style="${faceStyle(b, compact ? b.textStyles.tileHeadline : b.textStyles.headline)};max-width:min(${h.maxWidth || 12}em,100%)">${headline(b, mode)}${compact ? '' : note(b, mode)}</h2><p class="hero-body">${esc(b.content.body)}</p>${compact ? '' : `<p class="hero-small label">${esc(b.content.smallPrint)}</p>`}</section>`;
  const renderBlock = (block) => {
    switch (block.kind) {
      case 'hero': return hero;
      case 'palette': return swatches(b, mode, false, compact);
      case 'type': return types(b, compact);
      case 'tileTop': return `<div class="tile-top">${block.blocks.map(renderBlock).join('')}</div>`;
      case 'tileItems': return `<section class="tile-items" aria-label="Business card · front and back and social banner">${block.blocks.map(renderBlock).join('')}</section>`;
      case 'tileBanner': return tileBanner(spec, b, mode);
      case 'open': return `<div class="open-space"><a class="board-button" href="#${block.target}">${esc(block.text)} <span aria-hidden="true">→</span></a></div>`;
      case 'graphicLanguage': return graphicLanguage(b, mode);
      case 'cards': return compact ? front(b, mode, true) + back(b, mode, true) : `<section class="items" aria-label="Business card · front and back"><div class="card-pair">${front(b, mode, false)}${back(b, mode, false)}</div><p class="label">${esc(b.labels.card)}</p>${markSizes(spec, b, mode)}</section>`;
      case 'banner': return banner(b, mode);
      case 'otherMode': return otherPanel(spec, b, mode);
      case 'rules': return rules(b);
      default: throw new Error(`Unknown board block: ${block.kind}`);
    }
  };
  return `<div class="brand-board${compact ? ' tile' : ''}" data-board="${b.number}" data-mode="${mode}" style="${vars(b, mode)}"><div class="page-pattern" aria-hidden="true" style="background-image:url('${uri(b.modes[mode].drawings.pattern)}');opacity:${b.graphics.pattern.strength[mode]};transform:rotate(${b.graphics.pattern.angle || 0}deg)"></div>${b.modes[mode][compact ? 'tile' : 'blocks'].map(renderBlock).join('')}</div>`;
}
function metadata(b) {
  return `<div class="board-meta"><p class="energy">${esc(b.energy)}</p><h2>${b.number} · ${esc(b.name)}</h2>${b.zero ? '<p class="board-zero">Your brand as it is today · Board zero</p>' : ''}${b.recommendation ? `<p class="recommendation"><b>Recommended</b> · ${esc(b.recommendation)}</p>` : ''}${b.why ? `<p>${esc(b.why)}</p>` : ''}</div>`;
}
function foot(b) {
  const v = b.footer, min = v.contrast?.minimum;
  const marks = v.contrast?.marks.map((p) => `${esc(p.name)} (${p.value}, ${p.mode}) is for marks only, ${p.ratio.toFixed(2)}:1 on the ground.`).join(' ');
  return `<footer class="whole-foot">${b.closing ? `<p class="last-line">${esc(b.closing)}</p><p class="example-answers">${b.closingExamples.map((s) => `“${esc(s)}”`).join(', ')}.</p>` : ''}<p class="licences">${v.licences.map((f) => `${esc(f.family)} (${f.role}) · Licence: ${esc(f.licence)}`).join('; ')}.${b.showChecks ? ` Contrast results: every text pairing passes WCAG 2; required pairings have a minimum of ${min.toFixed(2)}:1; button text passes 4.5:1 and APCA |Lc| 60 in both modes. ${marks}` : ''}</p>${b.showChecks ? `<details class="contrast-results"><summary>Every checked pairing</summary><ul>${b.checks.map((p) => `<li>${p.mode} · ${esc(p.pairing)}: WCAG ${p.wcag.toFixed(3)}:1 ${p.need == null ? '(decoration, reported only)' : `(needs ${p.need}:1)`}${p.apcaNeed ? ` · APCA Lc ${p.apcaLc.toFixed(3)} (needs |Lc| ${p.apcaNeed})` : ''}</li>`).join('')}</ul></details>` : ''}</footer>`;
}
export function renderBrandBoards(validatedSpec) {
  const spec = createBoardModel(validatedSpec);
  // File bytes stay exclusively in this Node page writer, outside the model.
  for (const b of spec.boards) if (b.mark) b.mark = validatedSpec.boards.find((v) => v.number === b.number).mark;
  const fonts = validatedSpec.boards.flatMap((b) => FACES.filter((r) => b.type[r]).flatMap((r) => b.type[r].files.map((f) => `@font-face{font-family:bb-${b.number}-${r};src:url("${f.asset.uri}") format("${FORMAT[f.asset.extension]}");font-weight:${f.range[0] === f.range[1] ? f.range[0] : f.range.join(' ')};font-style:${f.style};font-display:block}`))).join('\n');
  const label = `{OvO} Wiser · Brand boards for ${esc(spec.person)}`;
  const zero = spec.boards.find((b) => b.zero), single = spec.boards.length === 1;
  const ordered = [...(zero ? [zero] : []), ...spec.groups.flatMap((g) => spec.boards.filter((b) => b.group === g.id && !b.zero))];
  const tile = (b) => `<article class="board-option">${metadata(b)}${board(spec, b, b.primaryMode, true)}</article>`;
  const intro = spec.intro.map((s) => `<p>${esc(s)}</p>`).join('');
  const index = single ? '' : `<div class="index-page"><header id="all-boards"><h1>${label}</h1>${intro}</header>${zero ? `<div class="boards-grid zero-first">${tile(zero)}</div>` : ''}${spec.groups.map((g) => `<section class="board-group"><h2 class="group-label">${esc(g.label)}</h2><div class="boards-grid">${spec.boards.filter((b) => b.group === g.id && !b.zero).map(tile).join('')}</div></section>`).join('')}<footer class="page-foot">${esc(spec.footnote)}</footer></div>`;
  const wholes = ordered.map((b, i) => `<section class="whole-view" id="whole-${b.number}" aria-label="${esc(b.name)} whole board">${[b.primaryMode, opposite(b.primaryMode)].map((mode) => `<div class="mode-sheet${mode === b.primaryMode ? ' primary' : ''}" id="whole-${b.number}-${mode}"><header class="sheet-head"${single && mode === b.primaryMode ? ' id="all-boards"' : ''}><div><p class="wiser-label">${label}</p>${single ? `<div class="sheet-intro">${intro}</div>` : ''}<p class="board-nav">${single ? '' : `<a href="#all-boards">← All ${ordered.length} boards</a> · Board ${i + 1} of ${ordered.length} · `}${mode} · <a href="#whole-${b.number}-${opposite(mode)}">See it in ${opposite(mode)}</a></p>${metadata(mode === b.primaryMode ? b : { ...b, recommendation: undefined })}</div></header>${board(spec, b, mode)}${foot(b)}</div>`).join('')}</section>`).join('\n');
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Brand boards for ${esc(spec.person)}</title><style>${BRAND_BOARD_CSS}\n${fonts}</style></head><body><main class="${single ? 'single-board' : 'board-collection'}">${index}${wholes}${single ? `<footer class="page-foot">${esc(spec.footnote)}</footer>` : ''}</main></body></html>\n`;
}
