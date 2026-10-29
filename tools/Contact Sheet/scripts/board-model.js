// A validated board becomes data here, before any HTML, font embedding or I/O.
// This module deliberately has no imports or runtime-specific globals.
export const FACE_ROLES = ['heading', 'body', 'handwriting'];
export const DEFAULT_MARK_CAPTION = 'These initials hold the place of a logo. Ask for a logo any time after you lock a board.';
export const BOARD_LABELS = {
  words: 'The words', photoRules: 'Photo rules', never: 'Never', share: 'Share of a typical page',
  card: 'Business card · front and back · 3.5 × 2 in',
  banner: 'Social banner · the left third stays clear for the profile picture.',
  markSizes: 'profile picture to browser tab', open: 'Open the whole board'
};
export const BOARD_LAYOUT = {
  card: { maxWidth: 900, width: 734, margin: 16, padding: 24, gap: 16,
    heroColumns: 1, typeColumns: 2, graphicColumns: 2, cardColumns: 2,
    headlineScale: .58, headlineMin: 32, bodySize: 20, otherHeadlineScale: .42,
    moves: ['hero and palette stack', 'faces share a row; words follow', 'sample and legend share a row', 'cards share a row; mark sizes follow', 'alternate panel stacks'] },
  phone: { maxWidth: 600, width: 390, margin: 12, padding: 20, gap: 16,
    heroColumns: 1, typeColumns: 1, graphicColumns: 1, cardColumns: 1,
    headlineScale: .48, headlineMin: 30, bodySize: 18, otherHeadlineScale: .42,
    moves: ['faces stack', 'sample and legend stack', 'cards stack', 'notes and chips wrap', 'rules stack'] },
  proportions: { businessCard: [3.5, 2], banner: [4, 1] }
};

const copy = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
// The library's original swatch names describe jobs, not everyday colours.
// Hide those too; never invent a colour name where the caller supplied none.
const DESIGNER_COLOUR_NAMES = new Set(['page base', 'inset field', 'reading ink', 'deep field', 'drawing ink', 'action fill', 'detail ink', 'title ink']);
export const oppositeMode = (mode) => mode === 'light' ? 'dark' : 'light';
export const heroRole = (b, mode) => typeof b.graphics.hero.role === 'object' ? b.graphics.hero.role[mode] : (b.graphics.hero.role || 'mark');

export function resolveDrawing(svg, colours, ink) {
  const namespaced = /\bxmlns\s*=/.test(svg) ? svg : svg.replace(/<svg\b/, '<svg xmlns="http://www.w3.org/2000/svg"');
  return namespaced.replace(/\{\{([A-Za-z]+)\}\}/g, (_, k) => colours[k]).replace(/currentColor/g, ink).replace(/<svg\b/, `<svg color="${ink}"${/\bfill\s*=/.test(svg.match(/<svg[^>]*>/)?.[0] || '') ? '' : ` fill="${ink}"`}`);
}

export function faceSetting(b, role, scale = 'small', size) {
  const face = b.type[role], v = face.sizes[scale];
  const variant = face.variants.find((f) => f.range[0] <= v.weight && f.range[1] >= v.weight);
  return { role, family: face.family, weight: v.weight, style: variant.style,
    size: size ?? v.size, lineHeight: v.lineHeight, letterSpacing: v.tracking,
    variations: copy(v.variations ?? face.variations) ?? null };
}

function textStyles(b) {
  const face = (role, scale, size) => faceSetting(b, role, scale, size);
  const note = b.type.handwriting ? 'handwriting' : 'body';
  return {
    body: face('body', 'small'), person: face('heading', 'small', 30), tilePerson: face('heading', 'small', 16),
    headline: face('heading', 'display'), tileHeadline: face('heading', 'display', b.type.heading.sizes.display.size * .47),
    otherHeadline: face('heading', 'display', b.type.heading.sizes.display.size * .6), note: face(note, 'middle'),
    swatch: face('heading', 'small', 22), tileSwatch: face('body', 'small', 11),
    strip: Object.fromEntries(Object.keys(b.type).map((r) => [r, face(r, 'display', r === 'heading' ? 34 : 28)])),
    specimens: Object.fromEntries(['heading', 'body'].map((r) => [r, {
      name: face(r, 'small', r === 'heading' ? 22 : 20), aa: face(r, 'display', r === 'heading' ? 88 : 72), line: face(r, 'middle')
    }])),
    words: face('heading', 'middle', 30), sampleTitle: face('heading', 'middle', 30), sampleNote: face(note, 'small', 17),
    legendTitle: face('heading', 'small', 26), cardName: face('heading', 'small', 22), tileCardName: face('heading', 'small', 13),
    cardBack: face(b.type.handwriting ? 'handwriting' : 'heading', 'middle', 24),
    tileCardBack: face(b.type.handwriting ? 'handwriting' : 'heading', 'middle', 12),
    tileBannerName: face('heading', 'small', 10), tileBannerHeadline: face('heading', 'display', b.type.heading.sizes.display.size * .17),
    banner: face('heading', 'display'), contentCard: face('heading', 'middle', 32), ruleTitle: face('heading', 'small', 22),
    monograms: Object.fromEntries([15, 16, 20, 28, 32, 40, 56, 112].map((size) => [size, face('heading', 'small', size * .46)]))
  };
}

function drawings(b, mode) {
  const c = b.palette[mode], draw = (svg, ink) => resolveDrawing(svg, c, ink);
  const result = {
    hero: draw(b.graphics.hero.svg, c[heroRole(b, mode)]),
    pattern: draw(b.graphics.pattern.svg, c.mark), texture: draw(b.graphics.texture.svg, c.cardBackMark),
    arrow: draw(b.note.svg, c.mark),
    legend: b.graphics.legend.map((v) => ({ name: v.name, use: v.use, svg: draw(v.svg, c.mark) })),
    sample: Object.fromEntries(['rule', 'circle', 'path', 'closing'].map((k) => [k, draw(b.sample[k], c.mark)]))
  };
  if (!b.mark) result.monogram = Object.fromEntries([['ground', 'headline'], ['cardFront', 'cardFrontText'], ['cardBack', 'cardBackText'], ['banner', 'text']].map(([surface, key]) => {
    const v = b.monogram.surfaces?.[surface];
    return [surface, { svg: draw(b.monogram.container, c[v?.frame || key]), initials: b.monogram.initials,
      ink: c[v?.ink || key], background: v ? c[v.background] : null, radius: v?.radius ?? 0 }];
  }));
  return result;
}

function swatches(b, mode, chips = false) {
  const c = b.palette[mode], palette = b.palette.modeSwatches?.[mode] || b.palette.swatches;
  return ((chips && b.palette.chips?.[mode]) || palette).map((s) => {
    // A chip may carry a designer's role label. Prefer the palette's everyday
    // name, including aliases of the same resolved colour.
    const everyday = (v) => !DESIGNER_COLOUR_NAMES.has(v.name.trim().toLowerCase());
    const candidates = [...palette, ...b.palette.swatches].filter(everyday);
    const named = candidates.find((v) => v.key === s.key) || candidates.find((v) => c[v.key].toLowerCase() === c[s.key].toLowerCase());
    const name = b.showChecks ? s.name : (named?.name || (everyday(s) ? s.name : null));
    return { ...copy(s), name, value: c[s.key], ink: c[b.swatchInks[mode][s.key]] };
  });
}

function blocks(b, mode, person, compact) {
  const other = oppositeMode(mode);
  const block = (kind, content) => ({ kind, ...content });
  const hero = block('hero', { person, mark: b.mark || b.monogram, content: b.content, note: compact ? null : b.note });
  const palette = block('palette', { swatches: b.modes[mode].swatches, showLabels: b.showChecks });
  const faces = block('type', { faces: b.type, words: compact ? [] : (b.words || []), label: b.labels.words });
  const cards = block('cards', { front: { name: b.content.brandName, line: b.items.cardLine, contact: b.items.contact },
    back: compact ? (b.items.cardBackShort || b.items.cardBack) : b.items.cardBack, caption: b.markCaption,
    sizes: compact ? [] : [112, 56, 28, 16], label: b.labels.card });
  if (compact) return [block('tileTop', { blocks: [hero, palette] }), faces, block('tileItems', { blocks: [cards,
    block('tileBanner', { mode: other, headline: b.items.tileBannerHeadline || b.items.bannerHeadline, action: b.items.primaryAction })] }),
  block('open', { text: b.labels.open, target: `whole-${b.number}` })];
  return [hero, palette, faces,
    block('graphicLanguage', { title: b.graphics.title, description: b.graphics.description, sample: b.sample, legend: b.modes[mode].drawings.legend }), cards,
    block('banner', { headline: b.items.bannerHeadline, line: b.items.bannerLine, contact: b.items.contact, label: b.labels.banner }),
    block('otherMode', { mode: other, person, content: b.content, sample: b.sample, items: b.items, chips: b.modes[other].chips }),
    ...(b.content.photoRules || b.content.never?.length ? [block('rules', { photoRules: b.content.photoRules || null, never: b.content.never || [], labels: [b.labels.photoRules, b.labels.never] })] : [])];
}

function footer(b) {
  const colour = (v) => (v.length === 4 ? '#' + [...v.slice(1)].map((h) => h + h).join('') : v).toLowerCase();
  const minimum = Math.min(...b.checks.filter((p) => p.need != null).map((p) => p.wcag));
  const marks = b.checks.filter((p) => p.pairing.startsWith('marks-only ')).map((p) => {
    const swatches = b.palette.modeSwatches?.[p.mode] || b.palette.swatches;
    const name = swatches.find((s) => colour(b.palette[p.mode][s.key]) === colour(p.foregroundValue))?.name || p.foreground;
    return { name, value: p.foregroundValue, mode: p.mode, ratio: p.wcag };
  });
  return { closing: b.closing, examples: b.closing ? copy(b.closingExamples) : [],
    licences: FACE_ROLES.filter((r) => b.type[r]).map((r) => ({ family: b.type[r].family, role: r, licence: b.type[r].licence })),
    contrast: b.showChecks ? { minimum, marks, checks: copy(b.checks) } : null };
}

export function createBoardModel(spec) {
  const model = { version: 1, layout: copy(BOARD_LAYOUT), person: spec.person, intro: copy(spec.intro),
    groups: copy(spec.groups), footnote: spec.footnote, showChecks: spec.showChecks === true, boards: [] };
  model.boards = spec.boards.map((source) => {
    const b = Object.fromEntries(['number', 'name', 'group', 'energy', 'why', 'recommendation', 'zero', 'primaryMode', 'buttonRadius',
      'palette', 'graphics', 'content', 'words', 'note', 'sample', 'items', 'closingExamples', 'swatchInks', 'checks'].filter((k) => source[k] !== undefined).map((k) => [k, copy(source[k])]));
    b.showChecks = model.showChecks;
    b.labels = copy(BOARD_LABELS);
    b.why = source.recommendation === source.why ? null : source.why;
    b.mark = source.mark ? { supplied: true } : null;
    b.monogram = source.mark ? null : copy(source.monogram);
    b.markCaption = source.mark ? 'Your mark' : (source.content.markCaption ?? DEFAULT_MARK_CAPTION);
    b.closing = source.content.closing ?? null;
    b.type = Object.fromEntries(FACE_ROLES.filter((r) => source.type[r]).map((r) => {
      const { files, ...face } = source.type[r];
      return [r, { ...copy(face), variants: files.map((f) => ({ range: copy(f.range), style: f.style })) }];
    }));
    for (const role of Object.keys(b.type)) b.type[role].settings = Object.fromEntries(['display', 'middle', 'small'].map((scale) => [scale, faceSetting(b, role, scale)]));
    b.textStyles = textStyles(b);
    b.footer = footer(b);
    b.modes = Object.fromEntries(['light', 'dark'].map((mode) => [mode, { roles: copy(b.palette[mode]), drawings: drawings(b, mode),
      swatches: swatches(b, mode), chips: swatches(b, mode, true) }]));
    for (const mode of ['light', 'dark']) {
      b.modes[mode].blocks = blocks(b, mode, model.person, false);
      b.modes[mode].tile = blocks(b, mode, model.person, true);
    }
    return b;
  });
  return model;
}

// Latin upright public files. Each URL answered HEAD 200, font/woff2, on
// 2026-10-29. These references never trigger a fetch from this module.
export const PUBLIC_FONT_FILES = {
  "Fraunces": [
    {
      "url": "https://fonts.gstatic.com/s/fraunces/v38/6NUV8FyLNQOQZAnv9ZwIlOkuy91B.woff2",
      "weight": [
        100,
        900
      ],
      "style": "normal",
      "verified": "2026-10-29"
    }
  ],
  "Instrument Sans": [
    {
      "url": "https://fonts.gstatic.com/s/instrumentsans/v4/pxicypc9vsFDm051Uf6KVwgkfoSbT2lBgGygpg.woff2",
      "weight": [
        400,
        700
      ],
      "style": "normal",
      "verified": "2026-10-29"
    }
  ],
  "Newsreader": [
    {
      "url": "https://fonts.gstatic.com/s/newsreader/v26/cY9AfjOCX1hbuyalUrK4397yjIJFJpc.woff2",
      "weight": [
        200,
        800
      ],
      "style": "normal",
      "verified": "2026-10-29"
    }
  ],
  "Hanken Grotesk": [
    {
      "url": "https://fonts.gstatic.com/s/hankengrotesk/v12/ieVn2YZDLWuGJpnzaiwFXS9tYtpd59CxCis4.woff2",
      "weight": [
        100,
        900
      ],
      "style": "normal",
      "verified": "2026-10-29"
    }
  ],
  "Parkinsans": [
    {
      "url": "https://fonts.gstatic.com/s/parkinsans/v3/-W_7XJXvQyPb1QfpBpRrfkQLfr8nfiI.woff2",
      "weight": [
        300,
        800
      ],
      "style": "normal",
      "verified": "2026-10-29"
    }
  ],
  "Young Serif": [
    {
      "url": "https://fonts.gstatic.com/s/youngserif/v2/3qTpojO2nS2VtkB3KtkQZ1t93kY6ah7E.woff2",
      "weight": 400,
      "style": "normal",
      "verified": "2026-10-29"
    }
  ],
  "Work Sans": [
    {
      "url": "https://fonts.gstatic.com/s/worksans/v24/QGYsz_wNahGAdqQ43Rh_fKDptfpA4Q.woff2",
      "weight": [
        100,
        900
      ],
      "style": "normal",
      "verified": "2026-10-29"
    }
  ],
  "Instrument Serif": [
    {
      "url": "https://fonts.gstatic.com/s/instrumentserif/v5/jizBRFtNs2ka5fXjeivQ4LroWlx-6zUTjnTLgNs.woff2",
      "weight": 400,
      "style": "normal",
      "verified": "2026-10-29"
    }
  ],
  "Familjen Grotesk": [
    {
      "url": "https://fonts.gstatic.com/s/familjengrotesk/v11/Qw3GZR9ZHiDnImG6-NEMQ41wby8WbHoEj7E49PA.woff2",
      "weight": [
        400,
        700
      ],
      "style": "normal",
      "verified": "2026-10-29"
    }
  ],
  "Gabarito": [
    {
      "url": "https://fonts.gstatic.com/s/gabarito/v9/QGYtz_0dZAGKJJ4t3HtoW4XGnfBI.woff2",
      "weight": [
        400,
        900
      ],
      "style": "normal",
      "verified": "2026-10-29"
    }
  ],
  "Shantell Sans": [
    {
      "url": "https://fonts.gstatic.com/s/shantellsans/v13/FeVWS0pCoLIo-lcdY7kjvNoQg2l-x-YtPFk.woff2",
      "weight": [
        300,
        800
      ],
      "style": "normal",
      "verified": "2026-10-29"
    }
  ],
  "Archivo": [
    {
      "url": "https://fonts.gstatic.com/s/archivo/v25/k3kQo8UDI-1M0wlSfdnoLmvDIaI.woff2",
      "weight": [
        100,
        900
      ],
      "style": "normal",
      "verified": "2026-10-29"
    }
  ],
  "Libre Caslon Text": [
    {
      "url": "https://fonts.gstatic.com/s/librecaslontext/v5/DdT878IGsGw1aF1JU10PUbTvNNaDMfq41-JJHRO0.woff2",
      "weight": 400,
      "style": "normal",
      "verified": "2026-10-29"
    },
    {
      "url": "https://fonts.gstatic.com/s/librecaslontext/v5/DdT578IGsGw1aF1JU10PUbTvNNaDMfID8vdkPx6esdPs.woff2",
      "weight": 700,
      "style": "normal",
      "verified": "2026-10-29"
    }
  ],
  "Big Shoulders": [
    {
      "url": "https://fonts.gstatic.com/s/bigshoulders/v4/qFdC35CPh40oITJ69S3GFqy50hgojnA4PLA.woff2",
      "weight": [
        100,
        900
      ],
      "style": "normal",
      "verified": "2026-10-29"
    }
  ],
  "Host Grotesk": [
    {
      "url": "https://fonts.gstatic.com/s/hostgrotesk/v5/co3BmWBnlCJ3U42vbbfdwMjZpFjmw07Arg.woff2",
      "weight": [
        300,
        800
      ],
      "style": "normal",
      "verified": "2026-10-29"
    }
  ],
  "Alegreya": [
    {
      "url": "https://fonts.gstatic.com/s/alegreya/v41/4UaBrEBBsBhlBjvfkSLhx6jj4JN0.woff2",
      "weight": [
        400,
        900
      ],
      "style": "normal",
      "verified": "2026-10-29"
    }
  ],
  "Alegreya Sans": [
    {
      "url": "https://fonts.gstatic.com/s/alegreyasans/v28/5aUz9_-1phKLFgshYDvh6Vwt7VptvWdUhm8.woff2",
      "weight": 400,
      "style": "normal",
      "verified": "2026-10-29"
    },
    {
      "url": "https://fonts.gstatic.com/s/alegreyasans/v28/5aUu9_-1phKLFgshYDvh6Vwt5eFIqEp2i0VBuxM.woff2",
      "weight": 700,
      "style": "normal",
      "verified": "2026-10-29"
    }
  ],
  "Gloock": [
    {
      "url": "https://fonts.gstatic.com/s/gloock/v8/Iurb6YFw84WUY4NJiBakJLRBjA.woff2",
      "weight": 400,
      "style": "normal",
      "verified": "2026-10-29"
    }
  ],
  "Albert Sans": [
    {
      "url": "https://fonts.gstatic.com/s/albertsans/v4/i7dOIFdwYjGaAMFtZd_QA1ZbYFeQGQyU.woff2",
      "weight": [
        100,
        900
      ],
      "style": "normal",
      "verified": "2026-10-29"
    }
  ],
  "Anybody": [
    {
      "url": "https://fonts.gstatic.com/s/anybody/v13/VuJxdNvK2Ib2ppdWSKHdOaNkaRs.woff2",
      "weight": [
        100,
        900
      ],
      "style": "normal",
      "verified": "2026-10-29"
    }
  ],
  "Rethink Sans": [
    {
      "url": "https://fonts.gstatic.com/s/rethinksans/v7/AMOWz4SDuXOMCPfdoglY9JQEVFi34dpL4w.woff2",
      "weight": [
        400,
        800
      ],
      "style": "normal",
      "verified": "2026-10-29"
    }
  ],
  "Bricolage Grotesque": [
    {
      "url": "https://fonts.gstatic.com/s/bricolagegrotesque/v9/3y996as8bTXq_nANBjzKo3IeZx8z6up5L-iNGfyOPPs.woff2",
      "weight": [
        200,
        800
      ],
      "style": "normal",
      "verified": "2026-10-29"
    }
  ],
  "Figtree": [
    {
      "url": "https://fonts.gstatic.com/s/figtree/v9/_Xms-HUzqDCFdgfMm4S9DaRvzig.woff2",
      "weight": [
        300,
        900
      ],
      "style": "normal",
      "verified": "2026-10-29"
    }
  ],
  "Source Serif 4": [
    {
      "url": "https://fonts.gstatic.com/s/sourceserif4/v15/vEFI2_tTDB4M7-auWDN0ahZJW1gb8te1Xb7G.woff2",
      "weight": [
        200,
        900
      ],
      "style": "normal",
      "verified": "2026-10-29"
    }
  ],
  "Schibsted Grotesk": [
    {
      "url": "https://fonts.gstatic.com/s/schibstedgrotesk/v7/Jqz55SSPQuCQF3t8uOwiUL-taUTtap9GayojdSFO.woff2",
      "weight": [
        400,
        900
      ],
      "style": "normal",
      "verified": "2026-10-29"
    }
  ],
  "DM Sans": [
    {
      "url": "https://fonts.gstatic.com/s/dmsans/v17/rP2Hp2ywxg089UriCZOIHTWEBlw.woff2",
      "weight": [
        100,
        1000
      ],
      "style": "normal",
      "verified": "2026-10-29"
    }
  ],
  "Alfa Slab One": [
    {
      "url": "https://fonts.gstatic.com/s/alfaslabone/v21/6NUQ8FmMKwSEKjnm5-4v-4Jh2dJhe_escmA.woff2",
      "weight": 400,
      "style": "normal",
      "verified": "2026-10-29"
    }
  ],
  "IBM Plex Sans": [
    {
      "url": "https://fonts.gstatic.com/s/ibmplexsans/v23/zYXgKVElMYYaJe8bpLHnCwDKhdHeFaxOedc.woff2",
      "weight": [
        100,
        700
      ],
      "style": "normal",
      "verified": "2026-10-29"
    }
  ],
  "Kalam": [
    {
      "url": "https://fonts.gstatic.com/s/kalam/v18/YA9dr0Wd4kDdMthROCfhsCkA.woff2",
      "weight": 400,
      "style": "normal",
      "verified": "2026-10-29"
    }
  ],
  "Architects Daughter": [
    {
      "url": "https://fonts.gstatic.com/s/architectsdaughter/v20/KtkxAKiDZI_td1Lkx62xHZHDtgO_Y-bvTYlg4-7jA-U.woff2",
      "weight": 400,
      "style": "normal",
      "verified": "2026-10-29"
    }
  ],
  "Nothing You Could Do": [
    {
      "url": "https://fonts.gstatic.com/s/nothingyoucoulddo/v21/oY1B8fbBpaP5OX3DtrRYf_Q2BPB1SnfZb3OOnVsH2pmp.woff2",
      "weight": 400,
      "style": "normal",
      "verified": "2026-10-29"
    }
  ],
  "Gochi Hand": [
    {
      "url": "https://fonts.gstatic.com/s/gochihand/v27/hES06XlsOjtJsgCkx1Pkfon_-18kTWE.woff2",
      "weight": 400,
      "style": "normal",
      "verified": "2026-10-29"
    }
  ],
  "Covered By Your Grace": [
    {
      "url": "https://fonts.gstatic.com/s/coveredbyyourgrace/v17/QGYwz-AZahWOJJI9kykWW9mD6opopoqXSOSEEQgsiaXVIw.woff2",
      "weight": 400,
      "style": "normal",
      "verified": "2026-10-29"
    }
  ],
  "Caveat": [
    {
      "url": "https://fonts.gstatic.com/s/caveat/v23/Wnz6HAc5bAfYB2Q7ZjYYiAzcPA.woff2",
      "weight": [
        400,
        700
      ],
      "style": "normal",
      "verified": "2026-10-29"
    }
  ],
  "Literata": [
    {
      "url": "https://fonts.gstatic.com/s/literata/v40/or3hQ6P12-iJxAIgLYTwJrUXnTPm.woff2",
      "weight": [
        200,
        900
      ],
      "style": "normal",
      "verified": "2026-10-29"
    }
  ]
};
