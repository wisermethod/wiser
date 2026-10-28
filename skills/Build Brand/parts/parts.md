# Brand parts

This is the bundled parts library for Build Brand. It provides text and note faces, complete size settings, palette recipes, placeholder containers and graphic sets for assembling brand boards. Font files come from the pinned `build-brand-fonts-1` release pack, downloaded once per copy of the plugin and checked against the pack and member hashes in `parts.json`. Each family's unchanged `OFL.txt` licence travels in the pack beside its files. A board uses installed local files or the person's own file.

Read `parts.json`, rank its `pairings` against the five visual answers, and pass the chosen pairing's `type.heading` and `type.body` to the Contact Sheet board spec, through the assembly script below; where the person supplied the file for a typeface they keep, the selection names that file in place of the pairing's face, as Assembly says. Resolve each file path from this directory. Select at most one of the pairing's `handwriting` alternatives as `type.handwriting`, for margin notes and the card back only; never merge both alternatives into one board. A pairing has one or two text families.

## Pairings

The axis columns map directly to `tags.classicContemporary`, `quietBold`, `warmCool`, `playfulSerious` and `handGeometric`. `either` carries no preference on that axis. Pass only `typeLoudness` and `typeCut`, with the chosen palette's loudness, to the board's match check; the five ranking tags are library fields.

| Id | Name | Heading | Body | Handwriting alternatives | Character | Loudness | Cut | Classic / contemporary | Quiet / bold | Warm / cool | Playful / serious | Hand / geometric |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| soft-serif | Soft forms | Fraunces | Instrument Sans | Caveat, Kalam | Gentle serif curves bring a familiar structure into the present. | 1 | contemporary | either | quiet | warm | playful | hand |
| newspaper | Quiet editorial | Newsreader | Hanken Grotesk | Covered By Your Grace, Caveat | A restrained reading serif sits above clear, unassuming supporting type. | 1 | period | classic | quiet | either | serious | either |
| warm-grotesque | Warm shapes | Parkinsans | Parkinsans | Kalam, Caveat | A single rounded sans balances substance with a trace of the hand. | 2 | contemporary | contemporary | either | warm | playful | hand |
| friendly-serif | Sturdy serif | Young Serif | Work Sans | Kalam, Nothing You Could Do | Broad old-style letters feel solid, generous and approachable. | 2 | period | classic | bold | warm | either | hand |
| sharp-serif | Fine edges | Instrument Serif | Familjen Grotesk | Covered By Your Grace, Architects Daughter | Slender, incisive titles meet compact and practical reading text. | 2 | contemporary | contemporary | quiet | cool | serious | either |
| chunky | Full shapes | Gabarito | Gabarito | Gochi Hand, Covered By Your Grace | Dense rounded geometry makes the whole page feel confident and buoyant. | 3 | contemporary | contemporary | bold | warm | playful | geometric |
| marker | Drawn rhythm | Shantell Sans | Shantell Sans | Kalam, Covered By Your Grace | Bouncing pen strokes carry a loose and openly playful voice. | 3 | contemporary | contemporary | bold | warm | playful | hand |
| poster | Wide impact | Archivo | Libre Caslon Text | Covered By Your Grace, Architects Daughter | An expanded heavy headline gives way to measured book proportions. | 3 | contemporary | either | bold | either | either | geometric |
| condensed | Tall structure | Big Shoulders | Host Grotesk | Architects Daughter, Caveat | Compressed upright titles bring a firm industrial pace to plain supporting text. | 3 | contemporary | contemporary | bold | cool | serious | geometric |
| humanist | Written forms | Alegreya | Alegreya Sans | Kalam, Nothing You Could Do | Related written proportions give serif titles and sans paragraphs a shared warmth. | 1 | period | classic | quiet | warm | either | hand |
| high-contrast | Poised contrast | Gloock | Albert Sans | Architects Daughter, Covered By Your Grace | Sculptural thick and thin strokes stand above clean, balanced reading text. | 2 | period | classic | either | cool | serious | geometric |
| expressive | Stretch and weight | Anybody | Rethink Sans | Gochi Hand, Covered By Your Grace | Wide, forceful titles create energy while an even sans steadies the page. | 3 | contemporary | contemporary | bold | either | playful | geometric |
| lively | Unexpected curves | Bricolage Grotesque | Figtree | Caveat, Gochi Hand | Small irregularities give a substantial contemporary sans a lively point of view. | 3 | contemporary | contemporary | bold | warm | playful | either |
| quiet-sans | Quiet sans | Work Sans | Source Serif 4 | Covered By Your Grace, Caveat | Light, open sans titles leave sustained reading to a warm text serif. | 1 | contemporary | contemporary | quiet | either | serious | either |
| display-serif | Warm reading serif | Literata | DM Sans | Kalam, Caveat | Warm text-serif proportions and a rounded sans make a generous reading page. | 2 | period | classic | either | warm | serious | hand |
| slab | Heavy serifs | Alfa Slab One | IBM Plex Sans | Architects Daughter, Covered By Your Grace | Block-like titles pair with precise reading text for a sturdy, practical voice. | 3 | contemporary | contemporary | bold | either | serious | geometric |

## Settings and use

Each face carries its description, sample, licence, local files, weights and `display`, `middle` and `small` settings. Each size states pixels, unitless line height, em tracking, weight and explicit variation settings or `null`. A file's weight is its actual static weight or inclusive variable range. Body specimens use 700, except quiet-sans uses 650 for its reading serif; reading text uses 400, so both declared cuts have an explicit setting. Keep the two static reading cuts at their declared weights rather than inventing intermediate cuts. A variable face without a weight axis in `variations` uses the size's weight through normal CSS weight selection. All other intended axes are explicit; the files retain the complete original axis ranges.

The first twelve heading families retain the approved trial's display sizes, line heights, tracking, width bounds, weights and size-specific axes. The trial's regular and strong weights become middle and small weights; its explicit word size, or its 30px default, becomes the middle size. Middle line height and tracking and the small setting complete the trial values to the board schema. Existing handwriting scales are retained. Reading and note settings that the trial did not supply are curated completions, recorded in `settingsProvenance`; they are not claimed as approved trial settings.

Trial loudness is unchanged. Its `classic` cut label is translated to the board schema's `period`; this is a vocabulary mapping rather than a changed judgment. The four additional heading pairings are curated extensions: the lively sans is loud and contemporary; quiet-sans is a light contemporary Work Sans heading over Source Serif 4 reading text; display-serif is a warm, medium Literata reading face with DM Sans; and the slab is loud and contemporary. Literata uses reading optical sizes even in its large headline, keeping the sharp display role with high-contrast. The slab's regular file is intrinsically heavy, and its contemporary tags let it accompany a loud palette.

A note face is optional. The default is the first listed alternative; choose the second only when its character suits the board better. Handwriting never increases the limit of two text families and appears nowhere as a primary. No primary uses a family barred by the Creative Director's typography defaults. Test boards are built from the local fixture, with both note alternatives checked separately.

## Font files

From this skill's directory, run `node scripts/fonts.mjs check` to survey without writing, and `node scripts/fonts.mjs check --install` to install. Before the first install, say that it fetches about 4.5 MB of open-licence fonts from `github.com` and its release download host, once per plugin copy, into `parts/fonts/`. Follow the plugin's ask-once rule in `tools/RUNNING.md`, with one exception: on the simple path, `SKILL.md` fetches only its chosen families with `--install --family` and asks nothing, the person's answer authorising it by the operator's decision of 2026-10-23, and that family fetch authorises itself alone, recording no install consent, since the person was asked nothing; `WISER_ALLOW_INSTALL=1` or the consent in `tools/RUNNING.md` also authorizes an install requested with `--from`. `check` alone never installs, even with that consent. `help`, `--help`, `-h` and `check help` need nothing installed.

To fetch only the families a board uses, add repeatable `--family <name>` options, each naming a key of `parts.json` `fonts`, for example `check --install --family "Fraunces" --family "Instrument Sans"`. This checks and installs only those families' font and licence files; other families are untouched. Each member comes from the directory of `fontPack.url` on the same release, under its asset name: drop `fonts/`, replace `/` with `--` and each space with `_`. Thus `fonts/Instrument Sans/InstrumentSans-Latin.woff2` becomes `Instrument_Sans--InstrumentSans-Latin.woff2`. Every member must pass its pinned byte count and sha256 before any requested font is written; downloads are bounded by that count, and each complete family is staged in a sibling directory before it is moved into place. An install failure removes staged and newly published entries and restores the prior family directories, including when several families were requested. A linked install destination or ancestor is refused. `node scripts/fonts.mjs assets` prints the complete ordered JSON array of `{ "asset", "path", "sha256", "bytes" }` entries without writing or reading consent.

For offline installation, add `--from <absolute pack.tar>` to the full-pack install command; the same size, sha256 and tar-member checks apply. With `--family`, `--from <absolute directory>` instead reads the individual asset-named files from that directory, under the same authorization. `--library <absolute parts.json>` and `--directory <absolute directory>` select an isolated library and install destination for tests; defaults are this library and its `fonts/` directory. `assets` accepts `--library` only. Unknown families, unknown flags and duplicate options other than repeatable `--family` are refused before an install; repeated family names are checked once. A survey returns one JSON object with `installed`, `missing` and `changed`, limited to the named `families` when supplied, exit 0 either way; an install refusal leaves stdout empty, names the cause and fix on stderr, and exits 1. The assembler checks only the families its boards use, so a complete pack is not required. The command follows `system/templates/Script Contract.md`, which points to `standards/script-contract.md`.

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

| Id | Name | Energy | Loudness | Temperature | Description |
|---|---|---|---|---|---|
| paper-orange | Paper and orange | quiet | 2 | warm | Soft paper and brown fields carry a crisp orange gesture. |
| draft-paper | Pale drafting paper | quiet | 1 | warm | A pale mineral sheet leaves yellow as a small working signal. |
| plaster-red | Plaster and red | quiet | 2 | warm | Pink plaster and deep cherry give rounded lettering a grounded warmth. |
| tan-blue | Tan and blue | colour-ground | 2 | warm | A tan page holds dark brown text and a firm blue stroke. |
| white-blue | White and blue | white-and-one | 3 | cool | A blue-tinted white sheet gives ultramarine the largest colour field. |
| gold-pink | Gold and pink | bright | 3 | warm | Golden yellow, deep plum and saturated pink share the page. |
| red-sky | Red and sky | bright | 3 | warm | A tomato field sets navy lettering against a clear sky-blue counterpoint. |
| print-pink | Print pink | bright | 3 | cool | Blue lettering, pink ink and a pale yellow sheet recall two-colour printing. |
| white-green | White and green | white-and-one | 3 | cool | A green-tinted white sheet holds upright dark lettering and a large fresh green field. |
| olive-paper | Olive and cream | colour-ground | 1 | warm | A mid-olive field carries cream words and a small golden signal. |
| plum-peach | Plum and peach | dark-first | 1 | warm | A muted plum room has a plum-tinted light counterpart and a soft peach signal. |
| navy-gold | Navy and gold | dark-first | 3 | cool | Deep navy and warm yellow give heavy lettering a clear night setting. |
| stone-cobalt | Stone and cobalt | quiet | 1 | cool | Cool stone and blue ink keep the page quiet and precise. |
| sage-brass | Sage and brass | quiet | 1 | warm | Pale sage, forest ink and a brass stroke make a calm natural sheet. |
| white-oxblood | White with oxblood | white-and-one | 2 | warm | A warm white sheet gives one deep oxblood red a large, confident field. |
| white-vermilion | White and vermilion | white-and-one | 2 | warm | A near-white page and a deep red-orange field make a direct statement. |
| lime-teal | Lime and teal | bright | 3 | cool | A clear lime sheet, teal fields and blue-black words feel sharp and open. |
| citrus-blue | Citrus and blue | bright | 3 | warm | Orange and yellow fields meet firm blue lettering and buttons. |
| cobalt-yellow | Cobalt and yellow | colour-ground | 3 | cool | Cobalt carries pale lettering with one warm yellow accent. |
| forest-coral | Forest and coral | colour-ground | 2 | warm | A forest field carries cream words and a soft coral stroke. |
| ink-amber | Ink and amber | dark-first | 2 | warm | Brown-black ink and muted amber put pale words first. |
| navy-coral | Navy and coral | dark-first | 2 | cool | Smoky navy and soft coral keep the dark field warm enough to read. |
| rose-ink | Rose and ink | colour-ground | 2 | warm | A full rose field holds burgundy words, with pale rose in the inset spaces. |
| yellow-ink | Yellow and ink | colour-ground | 3 | warm | A broad yellow field and brown-black letters give the page a sunny, practical force. |
| green-black | Green-black and chalk | dark-first | 1 | cool | Green-black fields and soft chalk words hold a muted sage signal. |

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

| Id | Name | Description | Legend title |
|---|---|---|---|
| drawn | Drawn lines | Loose pen strokes lead the eye across turned graph paper. | A line guides the eye. |
| drafting | Measured lines | Fine rules, overshooting ticks and centre marks keep a measured pace. | Every line locates something. |
| marker | Marker strokes | Broad marker loops, blunt ticks and a scatter of thick strokes keep the hand visible. | Mark the useful detail. |
| riso | Offset print | Shifted dots and double impressions make the printing visible. | Two impressions, one rhythm. |
| geometric | Solid geometry | Bars, circles and half-circles give the page a firm modular rhythm. | Simple shapes carry the structure. |
| editorial | Editorial marks | Fine rules, paragraph signs and a distinct foot mark organise a reading page. | Give the reader a place. |
| stitch | Stitched lines | Dashed seams and generous cross-stitches join the page together. | Join each part with care. |
| stamp | Stamped marks | Broken inked rings, rough-edged seals and repeating tallies leave a firm impression. | Leave a clear impression. |

Each set supplies its hero shape and drawing, note arrow, named legend and uses, four sample-page marks, banner rule, page pattern and card-back texture. The locked drawn set is unchanged. Drafting uses ruled datum and centre marks; marker uses broad loops, blunt ticks and its own stroke scatter; stamp uses a broken uneven ring, a rough inked underline and repeating tallies, with its own kraft flecks. Riso uses two shifted ellipses for its sample ring, distinct from the drawn open loop. Editorial has a foot mark separate from its asterisk. No geometry is shared between sets, including legend, sample, hero and pattern drawings; reuse within one set is intentional. Pattern and texture each carry independent strengths for light and dark. The drawn set's graph paper starts at a 22-degree angle; the caller can change it. The banner rule uses the Contact Sheet schema's `sample.rule` slot. Dark patterns are deliberately visible: editorial repeats short rules at strength 0.45, marker scatters broad strokes at 0.28, geometric uses radius-four dots at 0.2, stitch uses larger crosses at 0.4, and stamp repeats tallies at 0.28. Supporting inks in olive, oxblood, rose, green-black and navy-coral are lifted where needed for the stronger repeats; every changed value is recorded in the recipe's adjustments. The specimens show each on a dark tile and a complete dark-first board. No picture is fetched; fonts use only the checked pack installed above or the person's own file.

## Assembly

The skill writes a selection JSON with `person`, two `intro` lines, ordered `groups` with id and label, `footnote`, and `boards`. Each board supplies `number`, `name`, `group`, `energy`, `why`, optional `recommendation` and `zero`, `primaryMode`, and `buttonRadius`. Its `palette` has an `id` and optional `overrides` keyed by light or dark and then by role. Its `pairing` has an `id` and optional `headingFrom` or `bodyFrom`, each either a pairing id or a supplied face object. Blended heading settings and loudness tags come from the heading donor. Its `handwriting` is one of the base pairing's offered family names or explicit null.

A supplied face object has exactly `file`, a local `.ttf`, `.otf`, `.woff` or `.woff2` path relative to the selection or absolute; `family`, the font's family name as supplied by the person; and `weight`, a number from 1 to 1000. It replaces that role's library face. The base pairing supplies size, line-height, tracking and match tags, so the selected base must fit the supplied face; every size uses the supplied weight with no inherited variation axes. Its sample is the saved brand sentence, its style is normal, and its licence reads "supplied by the person". The file is screened and read, its font signature and container bounds checked, and its resolved absolute path emitted; a missing, unreadable or non-font file is refused before any output, with no library substitution. Contact Sheet embeds that file and runs its own checks.

`graphicSet` has `id` and optional `pattern` with `angle` and per-mode `strength`, and optional `texture` with per-mode `strength`. A `container` id and `initials` supply the placeholder, or `markFile` replaces both; mark paths resolve beside the selection. A `heroPhrase` names a substring of the sentence. `content` requires `brandName`, `sentence`, `body` and `smallPrint`, with optional non-empty `photoRules` text and an optional `never` array of non-empty single-line strings; `note` supplies text and direction. Optional `words` contains objects with required non-empty single-line `word` and `not` text. Omitted `photoRules`, and omitted or empty `words` and `never` arrays, leave out their respective panels or blocks and headings in both board modes. Present fields retain their validation; null is not omission. `sample` supplies kicker, title, phrase, body, note, steps and meta. `items` supplies cardLine, cardBack, bannerHeadline, bannerLine, contact, primaryAction and secondaryAction, with optional cardBackShort and tileBannerHeadline. `closingExamples` holds two or three examples. Nothing is silently inherited from another board.

Run from any directory, replacing the absolute paths:

```sh
node "/absolute/plugin/skills/Build Brand/scripts/assemble.mjs" --selection "/absolute/work/selection.json" --output "/absolute/work/board-spec.json"
```

`--library` optionally selects an absolute library JSON beside its fonts; `help`, `--help` and `-h` open no files. There are no other flags, installs, configuration or network calls. The output parent must exist, the destination must be new and outside this skill, and paths are canonicalized before opening them. Unknown ids, unknown fields and malformed overrides name the board and field and write nothing. Library font files become absolute paths inside the selected parts/fonts directory; supplied faces use their screened local paths. Stable selections and library bytes give stable output bytes. Assembly resolves choices; Contact Sheet then checks the spec and refuses contrast or type mismatches. Parts are curated choices, not a promise that every combination passes: the strongest editorial pattern fails on the locked paper-orange recipe, whose approved values stay unchanged. Use a suited recipe or explicitly tune a selection and run the checks again. Palette tests isolate recipes with the unchanged drawn set; graphic tests build every set at its own default strengths on green-black, and the specimens check the chosen combinations. The loud slab now has contemporary tags and can use loudness-three palettes under that match rule. `tests/selections.mjs` contains a complete invented-content selection factory used by the integration tests and specimens.
