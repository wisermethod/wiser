# Brand part catalogue

The bundled Build Brand library contains 30 palettes, ten pairings, 19 font families, eight containers and eight graphic sets. It replaces the former set. Font files come from the pinned `build-brand-fonts-2` release pack, about 2.5 MB, checked against the pack and member hashes in `parts.json`. Each family's unchanged `OFL.txt` licence travels beside its files.

For the simple choice follow `../paths/simple.md`; for selection follow `parts.md` Selection from answers. Pass chosen parts through Assembly. Each pairing has heading and body faces and one optional Caveat note face. Handwriting is for margin notes and the card back only.

## Pairings

The six ranking axes are `classicContemporary`, `quietBold`, `warmCool`, `playfulSerious`, `handGeometric` and `softStrong`; `either` carries no preference. All pairings, palettes and graphic sets carry them in `tags`. Assembly also writes descriptive `paletteLoudness`, `typeLoudness` and `typeCut` tags. Loudness continues to guide bolder/quieter steers. `softStrongReason` records each part’s reading. The selector reads the dated `refusedClusters` in `parts.json` before ranking, including kept overrides and donor faces. Change those cluster rules in that one list.

| Id | Name | Heading | Body | Handwriting | Loudness | Cut | Soft / strong |
|---|---|---|---|---|---|---|---|
| elegant-serif | Elegant serif | Bodoni Moda | Instrument Sans | Caveat | 1 | period | strong |
| friendly-rounded | Friendly rounded | Fredoka | Figtree | Caveat | 2 | contemporary | soft |
| crisp-modern | Crisp modern | Manrope | Source Serif 4 | Caveat | 1 | contemporary | strong |
| hand-made | Hand-made | Fraunces | Alegreya Sans | Caveat | 1 | contemporary | soft |
| editorial | Editorial | Instrument Serif | Libre Franklin | Caveat | 1 | period | soft |
| industrial | Industrial | Big Shoulders | Barlow | Caveat | 2 | contemporary | strong |
| heritage-slab | Heritage slab | Zilla Slab | IBM Plex Sans | Caveat | 2 | period | strong |
| old-style | Old-style warmth | EB Garamond | Work Sans | Caveat | 1 | period | soft |
| playful-display | Playful display | Bricolage Grotesque | Figtree | Caveat | 2 | contemporary | either |
| inscriptional | Inscriptional capitals | Marcellus | Manrope | Caveat | 1 | period | either |

## Settings and use

Each face carries its description, sample, licence, local files, weights and display, middle and small settings. Each size states pixels, unitless line height, em tracking, weight and variation settings or null. File weights state the actual static weight or inclusive variable range; use those cuts. Size-specific axes replace face-level axes when non-null. `settingsProvenance` records curated completions. Preserve the delivered settings, including Fraunces SOFT 100 and WONK 1 and Marcellus capitals.

## Font licences and provenance

All families are from pinned source revisions recorded in `parts.json`. Every licence is SIL Open Font License 1.1. A Reserved Font Name keeps its source file unchanged; other files are Latin WOFF2 subsets preserving layout features, name records and variation axes. The pack contains 43 files, including all 19 unchanged licences.

| Family | Licence | Reserved Font Name | Font bytes |
|---|---|---|---|
| Bodoni Moda | SIL Open Font License 1.1 | None declared | 46248 |
| Instrument Sans | SIL Open Font License 1.1 | None declared | 87672 |
| Fredoka | SIL Open Font License 1.1 | None declared | 67952 |
| Figtree | SIL Open Font License 1.1 | None declared | 25864 |
| Manrope | SIL Open Font License 1.1 | None declared | 24436 |
| Source Serif 4 | SIL Open Font License 1.1 | None declared | 410968 |
| Fraunces | SIL Open Font License 1.1 | None declared | 166792 |
| Alegreya Sans | SIL Open Font License 1.1 | None declared | 165156 |
| Instrument Serif | SIL Open Font License 1.1 | None declared | 26396 |
| Libre Franklin | SIL Open Font License 1.1 | None declared | 29336 |
| Big Shoulders | SIL Open Font License 1.1 | None declared | 112588 |
| Barlow | SIL Open Font License 1.1 | None declared | 31400 |
| Zilla Slab | SIL Open Font License 1.1 | None declared | 68380 |
| IBM Plex Sans | SIL Open Font License 1.1 | Plex | 537244 |
| EB Garamond | SIL Open Font License 1.1 | None declared | 44172 |
| Work Sans | SIL Open Font License 1.1 | None declared | 122260 |
| Bricolage Grotesque | SIL Open Font License 1.1 | None declared | 194592 |
| Marcellus | SIL Open Font License 1.1 | Marcellus | 14272 |
| Caveat | SIL Open Font License 1.1 | None declared | 157928 |

## Extension seam

The library contains `fonts`, `fontPack`, `pairings`, `palettes`, `containers`, `graphics`, `refusedClusters`, `styles` and `withheld`. Keep ids stable unless a replacement is explicitly approved. `styles` holds ten `{id, column, name, depth}` records, with ids matching the pairings and columns A to J. Their depth follows the table under look view in `tools/Form/TOOL.md`. `withheld` holds eleven `{palette, style, mode, reason}` records; do not draw those approved card-modes. The reason names the failed check.

## Palettes

Ten colour families each have muted, balanced and bold steps. Each recipe declares both modes, complete board roles and mode-specific swatch names. Shares total 100. `adjustments` records the mode, role, before/after values and reason; board-only ink adjustments preserve the approved card colours. Energy labels are quiet (10), white-and-one (8), bright (1) and colour-ground (11). Every recipe has a dark mode; none is categorised dark-first.

| Id | Name | Energy | Loudness | Temperature | Description | Soft / strong |
|---|---|---|---|---|---|---|
| acid-lime-muted | Acid lime, muted | quiet | 1 | cool | A lemon-cream page and olive-black type let a small acid-lime signal do the talking. | soft |
| acid-lime-balanced | Acid lime, balanced | white-and-one | 2 | cool | A misty white page with green-black type, lit by bright green and a touch of orchid. | either |
| acid-lime-bold | Acid lime, bold | colour-ground | 3 | cool | A full acid-lime field with green-black type, loud and fresh. | strong |
| hot-pink-muted | Hot pink, muted | quiet | 1 | warm | A blush page and near-black type keep a hot-pink accent quiet and sure. | soft |
| hot-pink-balanced | Hot pink, balanced | white-and-one | 2 | warm | A shell-white page where hot pink and a bright blue trade small sparks. | either |
| hot-pink-bold | Hot pink, bold | colour-ground | 3 | warm | A hot-pink field with sunflower and tangerine flashes, made to be noticed. | strong |
| tangerine-and-sky-muted | Tangerine and sky, muted | quiet | 1 | warm | A sky-white page with deep navy type and one bright tangerine note. | soft |
| tangerine-and-sky-balanced | Tangerine and sky, balanced | colour-ground | 2 | warm | A warm apricot page with deep teal held against it, sunny but grounded. | either |
| tangerine-and-sky-bold | Tangerine and sky, bold | colour-ground | 3 | warm | A tangerine field struck with bright blue and flame, at full volume. | strong |
| sunflower-and-espresso-muted | Sunflower and espresso, muted | quiet | 1 | warm | An oat page with espresso type and a mustard note, warm and unhurried. | soft |
| sunflower-and-espresso-balanced | Sunflower and espresso, balanced | white-and-one | 2 | warm | A cream page with espresso type, where sunflower yellow does the cheering. | either |
| sunflower-and-espresso-bold | Sunflower and espresso, bold | colour-ground | 3 | warm | A sunflower field with espresso type, bright and generous. | strong |
| signal-red-muted | Signal red, muted | quiet | 1 | warm | A paper-white page in near-black and grey, with one signal-red mark. | soft |
| signal-red-balanced | Signal red, balanced | white-and-one | 2 | warm | A clean paper page where signal red carries every call to act. | either |
| signal-red-bold | Signal red, bold | colour-ground | 3 | warm | A signal-red field with white and near-black type, impossible to miss. | strong |
| pastel-sorbet-muted | Pastel sorbet, muted | quiet | 1 | warm | A pink-white page with aubergine type, and lavender and baby blue in soft support. | soft |
| pastel-sorbet-balanced | Pastel sorbet, balanced | white-and-one | 2 | warm | A peach page with terracotta and pear, sweet without going soft. | either |
| pastel-sorbet-bold | Pastel sorbet, bold | colour-ground | 3 | warm | Lemon, mint and bubblegum together, a sweet-shop set with deep wine type. | strong |
| sage-mist-and-green-muted | Sage, mist and green, muted | quiet | 1 | cool | A misty page with forest type and sage grey, calm and outdoorsy. | soft |
| sage-mist-and-green-balanced | Sage, mist and green, balanced | colour-ground | 2 | cool | A sage-green page with forest type and a clay accent, settled and natural. | either |
| sage-mist-and-green-bold | Sage, mist and green, bold | colour-ground | 3 | cool | A leaf-green field with bark brown and sunflower, lively and outdoors. | strong |
| ink-and-paper-muted | Ink and paper, muted | quiet | 1 | cool | Paper white and ink black, with slate and clay for quiet emphasis. | soft |
| ink-and-paper-balanced | Ink and paper, balanced | white-and-one | 2 | cool | A paper page in ink black, with one clear ink-blue line. | either |
| ink-and-paper-bold | Ink and paper, bold | bright | 3 | warm | Paper and ink with vermilion, marigold and ink blue, like a printer's proof. | strong |
| business-blue-muted | Business blue, muted | quiet | 1 | cool | A cloud-white page in navy and steel blue, steady and trusted. | soft |
| business-blue-balanced | Business blue, balanced | white-and-one | 2 | cool | A clear white page with navy type, where bright blue and cyan lead the eye. | either |
| business-blue-bold | Business blue, bold | colour-ground | 3 | cool | A royal-blue field with white type and a gold flash, confident and direct. | strong |
| orchid-and-plum-muted | Orchid and plum, muted | quiet | 1 | warm | A lilac-white page with deep plum type, an orchid accent and a spark of tangerine. | soft |
| orchid-and-plum-balanced | Orchid and plum, balanced | white-and-one | 2 | warm | A pale orchid page with deep plum type and rose in support, rich and romantic. | either |
| orchid-and-plum-bold | Orchid and plum, bold | colour-ground | 3 | warm | A magenta field with white type and soft rose, bold and theatrical. | strong |

## Containers

| Id | Name | Description |
|---|---|---|
| drawn-ring | Drawn ring | An open, uneven pen loop holds the initials. |
| drafting-box | Drafting box | A measured square extends beyond its four corners. |
| double-ring | Double ring | An off-centre inner circle makes a small printed seal around the initials. |
| filled-square | Filled square | A square plate reverses the initials through a clear central window. |
| filled-circle | Filled circle | A circular plate reverses the initials through a clear central window. |
| marker-swash | Marker swash | A rising marker stroke gives the initials a baseline. |
| oval | Oval | A flattened left edge and an open upper gap frame the initials. |
| rule-box | Rule box | An open right edge and a thick baseline anchor the initials. |

All drawings use currentColor and contain no text, filter or translucency. Filled plates combine the SVG's opaque outer shape and clear central window with `monogram.surfaces`: the surface supplies the solid plate and the initials reverse out of it. The same construction works on the page and both card faces without hiding the initials behind an opaque drawing. The off-centre seal, flattened open oval and three-sided rule frame still surround typeset initials; they remain placeholders, labelled as such on the specimen page and whole boards. The drafting box keeps its corner overshoots inside the SVG view box so the renderer cannot clip them.

## Graphic sets

| Id | Name | Description | Legend title | Soft / strong |
|---|---|---|---|---|
| drawn | Drawn lines | Loose pen strokes lead the eye across turned graph paper. | A line guides the eye. | soft |
| drafting | Measured lines | Fine rules, overshooting ticks and centre marks keep a measured pace. | Every line locates something. | either |
| marker | Marker strokes | Broad marker loops, blunt ticks and a scatter of thick strokes keep the hand visible. | Mark the useful detail. | strong |
| riso | Offset print | Shifted dots and double impressions make the printing visible. | Two impressions, one rhythm. | either |
| geometric | Solid geometry | Bars, circles and half-circles give the page a firm modular rhythm. | Simple shapes carry the structure. | strong |
| editorial | Editorial marks | Fine rules, paragraph signs and a distinct foot mark organise a reading page. | Give the reader a place. | soft |
| stitch | Stitched lines | Dashed seams and generous cross-stitches join the page together. | Join each part with care. | soft |
| stamp | Stamped marks | Broken inked rings, rough-edged seals and repeating tallies leave a firm impression. | Leave a clear impression. | strong |

Each set supplies its hero shape and drawing, note arrow, named legend and uses, four sample-page marks, banner rule, page pattern and card-back texture. No geometry is shared between sets; reuse within one set is intentional. Pattern and texture each carry independent strengths for light and dark. Pattern strengths are reduced where needed for readable text, recorded in each set's `adjustments`: drawn light is 0.01, editorial and stitch dark are 0.32, and stamp light is 0.07. The drawn graph paper starts at a 22-degree angle; the caller can change it. No picture is fetched; fonts use only the checked pack or the person's own file.
