# Brand part catalogue

This is the bundled parts library for Build Brand. It provides text and note faces, complete size settings, palette recipes, placeholder containers and graphic sets for assembling brand boards. Font files come from the pinned `build-brand-fonts-1` release pack, downloaded once per copy of the plugin and checked against the pack and member hashes in `parts.json`. Each family's unchanged `OFL.txt` licence travels in the pack beside its files. A board uses installed local files or the person's own file.

Read `parts.json`, rank its `pairings` against the visual answers, and pass the chosen pairing's `type.heading` and `type.body` to the Contact Sheet board spec, through `parts.md` Assembly; where the person supplied the file for a typeface they keep, the selection names that file in place of the pairing's face, as `parts.md` Assembly says. Resolve each file path from this directory. Select at most one of the pairing's `handwriting` alternatives as `type.handwriting`, for margin notes and the card back only; never merge both alternatives into one board. A pairing has one or two text families.

## Pairings

The axis columns map directly to `tags.classicContemporary`, `quietBold`, `warmCool`, `playfulSerious`, `handGeometric` and the sixth tag, `softStrong` (`soft`, `either`, `strong`). `either` carries no preference on that axis. Pass only `typeLoudness` and `typeCut`, with the chosen palette's loudness, to the board's match check; the six ranking tags are library fields. All pairings, palettes and graphic sets carry them in `tags`. Unread axes on palettes and graphics are explicitly `either`; palettes also retain their recorded temperature as `warmCool`. This preserves the sparse library reading rather than inventing five new judgments for a graphic set. `softStrongReason` records each part's reading. Softness is independent of weight: chunky remains bold and soft. The marker pairing is retired from selection (`selectable: false`); its former Shantell Sans heading is retained only as a margin-note alternative, with Instrument Sans in both text roles. The selector reads the dated `refusedClusters` list in `parts.json` before ranking: ground RGB distance, accent HSL bands and a pairing's `displayStyle` determine refusals in both modes, including kept overrides and donor faces. The list cites Creative Director's dated whole-layout taxonomy and is expected to age; change the cluster rules there only.

| Id | Name | Heading | Body | Handwriting alternatives | Character | Loudness | Cut | Classic / contemporary | Quiet / bold | Warm / cool | Playful / serious | Hand / geometric | Soft / strong |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| soft-serif | Soft forms | Fraunces | Instrument Sans | Caveat, Kalam | Gentle serif curves bring a familiar structure into the present. | 1 | contemporary | either | quiet | warm | playful | hand | soft |
| newspaper | Quiet editorial | Newsreader | Hanken Grotesk | Covered By Your Grace, Caveat | A restrained reading serif sits above clear, unassuming supporting type. | 1 | period | classic | quiet | either | serious | either | soft |
| warm-grotesque | Warm shapes | Parkinsans | Parkinsans | Kalam, Caveat | A single rounded sans balances substance with a trace of the hand. | 2 | contemporary | contemporary | either | warm | playful | hand | soft |
| friendly-serif | Sturdy serif | Young Serif | Work Sans | Kalam, Nothing You Could Do | Broad old-style letters feel solid, generous and approachable. | 2 | period | classic | bold | warm | either | hand | strong |
| sharp-serif | Fine edges | Instrument Serif | Familjen Grotesk | Covered By Your Grace, Architects Daughter | Slender, incisive titles meet compact and practical reading text. | 2 | contemporary | contemporary | quiet | cool | serious | either | soft |
| chunky | Full shapes | Gabarito | Gabarito | Gochi Hand, Covered By Your Grace | Dense rounded geometry makes the whole page feel confident and buoyant. | 3 | contemporary | contemporary | bold | warm | playful | geometric | soft |
| marker | Drawn rhythm | Instrument Sans | Instrument Sans | Shantell Sans, Kalam | Bouncing pen strokes carry a loose and openly playful voice. | 3 | contemporary | contemporary | bold | warm | playful | hand | soft |
| poster | Wide impact | Archivo | Libre Caslon Text | Covered By Your Grace, Architects Daughter | An expanded heavy headline gives way to measured book proportions. | 3 | contemporary | either | bold | either | either | geometric | strong |
| condensed | Tall structure | Big Shoulders | Host Grotesk | Architects Daughter, Caveat | Compressed upright titles bring a firm industrial pace to plain supporting text. | 3 | contemporary | contemporary | bold | cool | serious | geometric | strong |
| humanist | Written forms | Alegreya | Alegreya Sans | Kalam, Nothing You Could Do | Related written proportions give serif titles and sans paragraphs a shared warmth. | 1 | period | classic | quiet | warm | either | hand | soft |
| high-contrast | Poised contrast | Gloock | Albert Sans | Architects Daughter, Covered By Your Grace | Sculptural thick and thin strokes stand above clean, balanced reading text. | 2 | period | classic | either | cool | serious | geometric | soft |
| expressive | Stretch and weight | Anybody | Rethink Sans | Gochi Hand, Covered By Your Grace | Wide, forceful titles create energy while an even sans steadies the page. | 3 | contemporary | contemporary | bold | either | playful | geometric | strong |
| lively | Unexpected curves | Bricolage Grotesque | Figtree | Caveat, Gochi Hand | Small irregularities give a substantial contemporary sans a lively point of view. | 3 | contemporary | contemporary | bold | warm | playful | either | either |
| quiet-sans | Quiet sans | Work Sans | Source Serif 4 | Covered By Your Grace, Caveat | Light, open sans titles leave sustained reading to a warm text serif. | 1 | contemporary | contemporary | quiet | either | serious | either | soft |
| display-serif | Warm reading serif | Literata | DM Sans | Kalam, Caveat | Warm text-serif proportions and a rounded sans make a generous reading page. | 2 | period | classic | either | warm | serious | hand | soft |
| slab | Heavy serifs | Alfa Slab One | IBM Plex Sans | Architects Daughter, Covered By Your Grace | Block-like titles pair with precise reading text for a sturdy, practical voice. | 3 | contemporary | contemporary | bold | either | serious | geometric | strong |

## Settings and use

Each face carries its description, sample, licence, local files, weights and `display`, `middle` and `small` settings. Each size states pixels, unitless line height, em tracking, weight and explicit variation settings or `null`. A file's weight is its actual static weight or inclusive variable range. Body specimens use 700, except quiet-sans uses 650 for its reading serif; reading text uses 400, so both declared cuts have an explicit setting. Keep the two static reading cuts at their declared weights rather than inventing intermediate cuts. A variable face without a weight axis in `variations` uses the size's weight through normal CSS weight selection. All other intended axes are explicit; the files retain the complete original axis ranges.

The first twelve heading families retain the approved trial's display sizes, line heights, tracking, width bounds, weights and size-specific axes. The trial's regular and strong weights become middle and small weights; its explicit word size, or its 30px default, becomes the middle size. Middle line height and tracking and the small setting complete the trial values to the board schema. Existing handwriting scales are retained. Reading and note settings that the trial did not supply are curated completions, recorded in `settingsProvenance`; they are not claimed as approved trial settings.

Trial loudness is unchanged. Its `classic` cut label is translated to the board schema's `period`; this is a vocabulary mapping rather than a changed judgment. The four additional heading pairings are curated extensions: the lively sans is loud and contemporary; quiet-sans is a light contemporary Work Sans heading over Source Serif 4 reading text; display-serif is a warm, medium Literata reading face with DM Sans; and the slab is loud and contemporary. Literata uses reading optical sizes even in its large headline, keeping the sharp display role with high-contrast. The slab's regular file is intrinsically heavy, and its contemporary tags let it accompany a loud palette.

A note face is optional. The default is the first listed alternative; choose the second only when its character suits the board better. Handwriting never increases the limit of two text families and appears nowhere as a primary. No primary uses a family barred by the Creative Director's typography defaults. Test boards are built from the local fixture, with both note alternatives checked separately.

## Font licences and provenance

All families are from one pinned source revision, recorded for each family and file in `parts.json`. Every licence is SIL Open Font License 1.1. A declared Reserved Font Name means the selected source file is shipped byte-for-byte unchanged; only its local filename may be made portable. The other files are Latin WOFF2 subsets, one per selected source file, preserving all layout features, name records and variation axes.

The subset request is `U+0020-007E,U+00A0-00FF,U+2010-2027,U+2190-2193,U+2212`. It retains the source's coverage within those ranges and the glyphs needed by layout features; it does not manufacture glyphs the source lacks. `OFL.txt` in each family folder is copied unchanged. Static families include only the upright weights used here.

| Family | Licence | Reserved Font Name | Shipped form | Font bytes |
|---|---|---|---|---|
| Fraunces | SIL Open Font License 1.1 | None declared | Latin WOFF2 subset | 166792 |
| Instrument Sans | SIL Open Font License 1.1 | None declared | Latin WOFF2 subset | 87672 |
| Newsreader | SIL Open Font License 1.1 | None declared | Latin WOFF2 subset | 213204 |
| Hanken Grotesk | SIL Open Font License 1.1 | None declared | Latin WOFF2 subset | 51468 |
| Parkinsans | SIL Open Font License 1.1 | None declared | Latin WOFF2 subset | 36708 |
| Young Serif | SIL Open Font License 1.1 | None declared | Latin WOFF2 subset | 34832 |
| Work Sans | SIL Open Font License 1.1 | None declared | Latin WOFF2 subset | 122260 |
| Instrument Serif | SIL Open Font License 1.1 | None declared | Latin WOFF2 subset | 26396 |
| Familjen Grotesk | SIL Open Font License 1.1 | None declared | Latin WOFF2 subset | 29124 |
| Gabarito | SIL Open Font License 1.1 | None declared | Latin WOFF2 subset | 55052 |
| Shantell Sans | SIL Open Font License 1.1 | None declared | Latin WOFF2 subset | 412684 |
| Archivo | SIL Open Font License 1.1 | None declared | Latin WOFF2 subset | 174688 |
| Libre Caslon Text | SIL Open Font License 1.1 | None declared | Latin WOFF2 subset | 55548 |
| Big Shoulders | SIL Open Font License 1.1 | None declared | Latin WOFF2 subset | 112588 |
| Host Grotesk | SIL Open Font License 1.1 | None declared | Latin WOFF2 subset | 28832 |
| Alegreya | SIL Open Font License 1.1 | None declared | Latin WOFF2 subset | 153592 |
| Alegreya Sans | SIL Open Font License 1.1 | None declared | Latin WOFF2 subset; regular 400 and bold 700 | 165156 |
| Gloock | SIL Open Font License 1.1 | None declared | Latin WOFF2 subset | 38116 |
| Albert Sans | SIL Open Font License 1.1 | None declared | Latin WOFF2 subset | 47308 |
| Anybody | SIL Open Font License 1.1 | None declared | Latin WOFF2 subset | 86416 |
| Rethink Sans | SIL Open Font License 1.1 | None declared | Latin WOFF2 subset | 45296 |
| Bricolage Grotesque | SIL Open Font License 1.1 | None declared | Latin WOFF2 subset | 194592 |
| Figtree | SIL Open Font License 1.1 | None declared | Latin WOFF2 subset | 25864 |
| Source Serif 4 | SIL Open Font License 1.1 | None declared | Latin WOFF2 subset | 410968 |
| Schibsted Grotesk | SIL Open Font License 1.1 | None declared | Latin WOFF2 subset | 75824 |
| Literata | SIL Open Font License 1.1 | None declared | Latin WOFF2 subset | 383680 |
| DM Sans | SIL Open Font License 1.1 | None declared | Latin WOFF2 subset | 83552 |
| Alfa Slab One | SIL Open Font License 1.1 | Alfa Slab | Unmodified source TTF | 97376 |
| IBM Plex Sans | SIL Open Font License 1.1 | Plex | Unmodified source TTF | 537244 |
| Kalam | SIL Open Font License 1.1 | None declared | Latin WOFF2 subset | 136920 |
| Architects Daughter | SIL Open Font License 1.1 | None declared | Latin WOFF2 subset | 15920 |
| Nothing You Could Do | SIL Open Font License 1.1 | None declared | Latin WOFF2 subset | 17672 |
| Gochi Hand | SIL Open Font License 1.1 | Gochi, Gochi Hand | Unmodified source TTF | 37352 |
| Covered By Your Grace | SIL Open Font License 1.1 | None declared | Latin WOFF2 subset | 19460 |
| Caveat | SIL Open Font License 1.1 | None declared | Latin WOFF2 subset | 157928 |

## Extension seam

The version-one object contains `fonts`, `pairings`, `palettes`, `containers` and `graphics`. Extend these populated arrays in place, keeping existing ids except where an explicitly replaced part is retired. The former book and emerald choices have been replaced by quiet-sans and white-oxblood.

## Palettes

The library carries twenty-five complete palette recipes, eight containers and eight graphic sets. Each palette declares both modes, including the optional reading and rule roles, and a swatch list whose shares total 100. Dark-first recipes use the actual dark colours in `dark`; their lighter counterparts are in `light`. `adjustments` records every change to a seed value, its role, mode and reason.

| Id | Name | Energy | Loudness | Temperature | Description | Soft / strong |
|---|---|---|---|---|---|---|
| paper-orange | Paper and orange | quiet | 2 | warm | Soft paper and brown fields carry a crisp orange gesture. | soft |
| draft-paper | Pale drafting paper | quiet | 1 | warm | A pale mineral sheet leaves yellow as a small working signal. | soft |
| plaster-red | Plaster and red | quiet | 2 | warm | Pink plaster and deep cherry give rounded lettering a grounded warmth. | soft |
| tan-blue | Tan and blue | colour-ground | 2 | warm | A tan page holds dark brown text and a firm blue stroke. | strong |
| white-blue | White and blue | white-and-one | 3 | cool | A blue-tinted white sheet gives ultramarine the largest colour field. | strong |
| gold-pink | Gold and pink | bright | 3 | warm | Golden yellow, deep plum and saturated pink share the page. | strong |
| red-sky | Red and sky | bright | 3 | warm | A tomato field sets navy lettering against a clear sky-blue counterpoint. | strong |
| print-pink | Print pink | bright | 3 | cool | Blue lettering, pink ink and a pale yellow sheet recall two-colour printing. | either |
| white-green | White and green | white-and-one | 3 | cool | A green-tinted white sheet holds upright dark lettering and a large fresh green field. | strong |
| olive-paper | Olive and cream | colour-ground | 1 | warm | A mid-olive field carries cream words and a small golden signal. | soft |
| plum-peach | Plum and peach | dark-first | 1 | warm | A muted plum room has a plum-tinted light counterpart and a soft peach signal. | soft |
| navy-gold | Navy and gold | dark-first | 3 | cool | Deep navy and warm yellow give heavy lettering a clear night setting. | strong |
| stone-cobalt | Stone and cobalt | quiet | 1 | cool | Cool stone and blue ink keep the page quiet and precise. | soft |
| sage-brass | Sage and brass | quiet | 1 | warm | Pale sage, forest ink and a brass stroke make a calm natural sheet. | soft |
| white-oxblood | White with oxblood | white-and-one | 2 | warm | A warm white sheet gives one deep oxblood red a large, confident field. | strong |
| white-vermilion | White and vermilion | white-and-one | 2 | warm | A near-white page and a deep red-orange field make a direct statement. | strong |
| lime-teal | Lime and teal | bright | 3 | cool | A clear lime sheet, teal fields and blue-black words feel sharp and open. | strong |
| citrus-blue | Citrus and blue | bright | 3 | warm | Orange and yellow fields meet firm blue lettering and buttons. | strong |
| cobalt-yellow | Cobalt and yellow | colour-ground | 3 | cool | Cobalt carries pale lettering with one warm yellow accent. | strong |
| forest-coral | Forest and coral | colour-ground | 2 | warm | A forest field carries cream words and a soft coral stroke. | soft |
| ink-amber | Ink and amber | dark-first | 2 | warm | Brown-black ink and muted amber put pale words first. | either |
| navy-coral | Navy and coral | dark-first | 2 | cool | Smoky navy and soft coral keep the dark field warm enough to read. | soft |
| rose-ink | Rose and ink | colour-ground | 2 | warm | A full rose field holds burgundy words, with pale rose in the inset spaces. | soft |
| yellow-ink | Yellow and ink | colour-ground | 3 | warm | A broad yellow field and brown-black letters give the page a sunny, practical force. | strong |
| green-black | Green-black and chalk | dark-first | 1 | cool | Green-black fields and soft chalk words hold a muted sage signal. | soft |

Quiet has five recipes, white-and-one four, bright five, colour-ground six and dark-first five. The warm paper and orange recipe is intended for the warm sans pairing. It keeps a brighter drawing ink apart from the deeper button fill. White with oxblood supplies the deep warm red in white-and-one; white-green supplies its one green. Olive is a mid-olive field with cream words, distinct from pale sage. Rose and yellow add two colour grounds, and green-black adds a muted dark-first direction. The white-blue and white-green sheets and small print are tinted toward their colour; plum-peach keeps plum surfaces and peach marks even in light. Citrus uses blue drawing ink on its orange field, and print-pink uses blue-tinted panel small print and muted yellow on its dark card back. Never combine warm cream, a high-contrast serif and a terracotta accent. The night palettes have muted or warm accents; no neon or purple-to-blue gradient is supplied. Reading inks are tinted to their surfaces or to the palette's dark ink, rather than neutral grey on colour. The green recipe's alternate mode deliberately keeps a large green field, as a white-and-one direction can.

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

Each set supplies its hero shape and drawing, note arrow, named legend and uses, four sample-page marks, banner rule, page pattern and card-back texture. The locked drawn set is unchanged. Drafting uses ruled datum and centre marks; marker uses broad loops, blunt ticks and its own stroke scatter; stamp uses a broken uneven ring, a rough inked underline and repeating tallies, with its own kraft flecks. Riso uses two shifted ellipses for its sample ring, distinct from the drawn open loop. Editorial has a foot mark separate from its asterisk. No geometry is shared between sets, including legend, sample, hero and pattern drawings; reuse within one set is intentional. Pattern and texture each carry independent strengths for light and dark. The drawn set's graph paper starts at a 22-degree angle; the caller can change it. The banner rule uses the Contact Sheet schema's `sample.rule` slot. Dark patterns are deliberately visible: editorial repeats short rules at strength 0.45, marker scatters broad strokes at 0.28, geometric uses radius-four dots at 0.2, stitch uses larger crosses at 0.4, and stamp repeats tallies at 0.28. Supporting inks in olive, oxblood, rose, green-black and navy-coral are lifted where needed for the stronger repeats; every changed value is recorded in the recipe's adjustments. The specimens show each on a dark tile and a complete dark-first board. No picture is fetched; fonts use only the checked pack installed above or the person's own file.

