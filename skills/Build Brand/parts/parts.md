# Brand parts

This is the bundled parts library for Build Brand. It provides text and note faces, complete size settings, palette recipes, placeholder containers and graphic sets for assembling brand boards. Font files come from the pinned `build-brand-fonts-1` release pack, downloaded once per copy of the plugin and checked against the pack and member hashes in `parts.json`. Each family's unchanged `OFL.txt` licence travels in the pack beside its files. A board uses installed local files or the person's own file.

Read `parts.json`, rank its `pairings` against the visual answers, and pass the chosen pairing's `type.heading` and `type.body` to the Contact Sheet board spec, through the assembly script below; where the person supplied the file for a typeface they keep, the selection names that file in place of the pairing's face, as Assembly says. Resolve each file path from this directory. Select at most one of the pairing's `handwriting` alternatives as `type.handwriting`, for margin notes and the card back only; never merge both alternatives into one board. A pairing has one or two text families.

## Pairings

The axis columns map directly to `tags.classicContemporary`, `quietBold`, `warmCool`, `playfulSerious`, `handGeometric` and the sixth tag, `softStrong` (`soft`, `either`, `strong`). `either` carries no preference on that axis. Pass only `typeLoudness` and `typeCut`, with the chosen palette's loudness, to the board's match check; the six ranking tags are library fields. All pairings, palettes and graphic sets carry them in `tags`. Unread axes on palettes and graphics are explicitly `either`; palettes also retain their recorded temperature as `warmCool`. This preserves the sparse library reading rather than inventing five new judgments for a graphic set. `softStrongReason` records each part's reading. Softness is independent of weight: chunky remains bold and soft.

| Id | Name | Heading | Body | Handwriting alternatives | Character | Loudness | Cut | Classic / contemporary | Quiet / bold | Warm / cool | Playful / serious | Hand / geometric | Soft / strong |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| soft-serif | Soft forms | Fraunces | Instrument Sans | Caveat, Kalam | Gentle serif curves bring a familiar structure into the present. | 1 | contemporary | either | quiet | warm | playful | hand | soft |
| newspaper | Quiet editorial | Newsreader | Hanken Grotesk | Covered By Your Grace, Caveat | A restrained reading serif sits above clear, unassuming supporting type. | 1 | period | classic | quiet | either | serious | either | soft |
| warm-grotesque | Warm shapes | Parkinsans | Parkinsans | Kalam, Caveat | A single rounded sans balances substance with a trace of the hand. | 2 | contemporary | contemporary | either | warm | playful | hand | soft |
| friendly-serif | Sturdy serif | Young Serif | Work Sans | Kalam, Nothing You Could Do | Broad old-style letters feel solid, generous and approachable. | 2 | period | classic | bold | warm | either | hand | strong |
| sharp-serif | Fine edges | Instrument Serif | Familjen Grotesk | Covered By Your Grace, Architects Daughter | Slender, incisive titles meet compact and practical reading text. | 2 | contemporary | contemporary | quiet | cool | serious | either | soft |
| chunky | Full shapes | Gabarito | Gabarito | Gochi Hand, Covered By Your Grace | Dense rounded geometry makes the whole page feel confident and buoyant. | 3 | contemporary | contemporary | bold | warm | playful | geometric | soft |
| marker | Drawn rhythm | Shantell Sans | Shantell Sans | Kalam, Covered By Your Grace | Bouncing pen strokes carry a loose and openly playful voice. | 3 | contemporary | contemporary | bold | warm | playful | hand | soft |
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

## Locking a board

`scripts/lock.mjs` writes the settled design, colour settings, lettering settings and brand direction from the assembled spec, without another choice or any network call. It follows `standards/script-contract.md`; Node built-ins are its only dependencies. The caller resolves the owning root's Provides `design` binding and the brand work directory first, then passes absolute paths:

```sh
node "/absolute/plugin/skills/Build Brand/scripts/lock.mjs" --spec "/absolute/work/board-spec.json" --answers "/absolute/work/lock-answers.json" --root "/absolute/member" --design "/absolute/member/design.md" --work "/absolute/member/work/brand"
```

`--spec`, `--answers`, `--root`, `--design` and `--work` are required. `--replace` permits replacing a complete design. `help`, `--help` and `-h` open nothing; every other flag, including `--env` and `--install`, is refused. Destinations must resolve inside the owning root and outside this skill. Canonical paths, existing hard links, input/output aliases and protected `.env` paths are checked before publication. The command neither reads voice/about files nor writes an answers record: the caller supplies the confirmed results in its answers JSON.

### Lock answers

The overlap with `select.mjs` is **`name`, `sentence`, `words`, `taps`, `off` and `looks`**, with the same names and shapes. `taps` uses the question ids and option ids in `taps.json`, not displayed labels or numeric keys. Q1 to Q9 correspond to that file's ordered questions. `off` is the selection script's read-back corrections: selected option ids, axis ids or pole ids to drop, plus `darkLed` and `brightColour`; an empty array means nothing was dropped. `looks` is an array of the picked whole-look `value` strings returned by `select.mjs looks`. The full confirmed read-back sentence is lock-only `readBack.text`; the selector uses its corrections in `off`, not that prose. Pass the selector only its declared fields; enrich that record with the lock-only fields below after the lock. Lock reports any other top-level fields as `unusedAnswerFields` rather than pretending to apply selection instructions again.

```json
{
  "type": "personal",
  "name": "Example Person",
  "sentence": "I make useful things.",
  "words": [{"word": "Useful", "not": "ornamental"}],
  "taps": {
    "mode": "light", "feel": "natural", "history": "established-current",
    "strength": "strong-solid", "technology": "craftsman", "style": "patagonia",
    "posture": "subaru", "mood": "ikea", "place": "workshop"
  },
  "readBack": {"text": "Natural and strong, like Patagonia.", "confirmed": true},
  "off": [],
  "looks": [],
  "assets": [],
  "rounds": [{"question": "Round 1, questions 1 to 4", "steer": "Warmer; as it is; stronger; more current"}],
  "lock": {
    "confirmed": true, "board": 1, "question": "Lock, step 6",
    "contactSheetPassed": true,
    "specSha256": "replace with SHA-256 of the exact assembled spec file bytes"
  }
}
```

`type` is `personal`, `org`, `client` or `department`; an industry has no unified brand to lock. `name`, `sentence`, nonempty `words` with `word` and `not`, and all nine taps are required. The name and words must match the locked board; the sentence matches `content.sentence`, or its headline/body split joined by a comma (the legacy board's initial “And” becomes “and”). Each tap is recorded with its question number, displayed label and option id. `readBack` requires the confirmed verbatim `text` and `confirmed: true`. `looks`, `assets` and `rounds` are arrays, empty when none were picked, supplied or run. A round has a question identifier and its verbatim `steer`; the script records it, never interprets a new visual choice from it.

For an organisation, client or department, also require `audience`, `promise` and `finalSay`, each the confirmed single-line wording. For a person, `audience` and `promise` may carry sourced statements the caller already has; otherwise Foundation points to the chosen sentence as its source and labels that derivation. Alternatives, open space and success measures remain `[Not available: not asked]`. The caller must not invent personal facts to fill these fields.

Each kept asset has `path` (absolute or relative to the root), `kind` (for example `logo`, `font` or `guide`) and `governs` (what that file settles). Every original in `sources/brand/`, including nested files, must be inventoried; an unlisted file refuses the run. The spec's kept `monogram.file` must identify an inventoried logo. With a logo, Mark names the file; otherwise Mark is exactly `[Not available: a logo is offered after the lock]`. Placeholder initials never become a logo.

`lock.confirmed: true` records the member's actual lock, not a script choice. `board` identifies exactly one board number. `specSha256` binds that lock to the exact assembled JSON bytes and `contactSheetPassed: true` records the caller's passed Contact Sheet check. The command requires resolved colour roles, font metadata, graphics and layout fields, refusing a selection or incomplete assembly. It does not repeat the Contact Sheet's checks or claim to have performed them. Every board colour is retained byte for byte; no scale adjustment is made.

For a legacy record that genuinely lacks a read-back, whole looks, rounds or picture rule, omit the absent field and supply a specific reason at `unavailable.readBack`, `unavailable.looks`, `unavailable.rounds` or `unavailable.photoRules`. This explicitly labels that absence; silent omission refuses the run. Missing picture rules are labelled in design and omitted from the brand direction. This allowance does not cover missing names, words, taps or organisation answers. Where the caller is relaying a record, optional `provenance: {"register":"Secondhand","by":"the named source or relay"}` preserves its register; `Firsthand` and `Public statement` are also accepted. Otherwise answers are sourced as `Firsthand` with the member's name. The JSON file and field remain cited in place. A supplied `unavailable` reason is evidence of absence in this input, not a claim that a member answered that question.

### Lock outputs and read-back

The four outputs are the resolved `--design` path, and `palette.css`, `typography.css`, `brand-direction.html` under `--work`, beside the boards as Build Brand keeps its direction and the colour/type skills keep their work. No new root shelf or design-system file is created. Settings can be filed elsewhere only by resolving a different declared brand work directory before the call.

- Design has the twelve headings in the template's order, its provenance preamble, and complete state at the lock. Each rule cites the answers JSON and question/field, or the assembled spec's board field. Inferences cite their derivation; gaps use `standards/conventions.md` labels. A separate source-field traversal checks every rendered claim before publication. On an existing full-onboarding root, every claim, including the lock state, receives an unused `[V<n>]` anchor and a located row in the existing Claims table; the lock supplies `design-source`. Old verification and negative-claim rows are preserved. This is deterministic field/value checking, not a claim of independent human or model review.
- Colour settings retain `--locked-light-<role>` and `--locked-dark-<role>`, with camelCase roles converted to kebab-case as in the existing colour output. Every declaration names its job and source field. `--brand-<role>` aliases select the primary mode, explicit `[data-theme="light"]` or `[data-theme="dark"]`, and system dark mode. `--brand-pop` is the pop colour. No inferred OKLCH scales, semantic statuses or additional colours are produced.
- Lettering settings retain `--font-heading`, `--font-body`, `--text-caption`, `--text-body`, `--text-subheading`, `--text-heading`, `--text-display`, weights, line heights and rhythm names from the existing type output. Font files are referenced locally with `@font-face`, not fetched or copied; licences and source fields are comments. Optional handwriting is notes-only. Restore a missing locked font before locking. The single fixed scale is 16px × 1.25^step: caption 12.8px, body 16px, subheading 20px, heading 25px, display 31.25px. Above-body sizes use equal-bound rem `clamp()` values, so the scale remains fixed and respects the reader's root font size. Light line heights are 1.4, 1.5, 1.35, 1.2, 1.1 respectively; dark adds 0.05. Weights come from the board's size records. The ratio and rhythm are labelled working needs, not member choices. Use `.type-on-dark` for light text on a dark or saturated field even in light mode; essential UI stays at 1rem. A fuller responsive system is built when work first needs one.
- The brand direction is responsive HTML in Build Brand's section order, with each face's name set in that face, the adopted sentence and promise unchanged, exact look answers, colour names/roles/shares where present, and a closing provenance table. Unrecorded temperature descriptions, invented tensions, and unsupported picture sections are omitted. Licence and file mechanics belong in the settings/design, not the direction's designer-facing sections.

Existing `AGENTS.md` Onboarding and `work/onboarding/run-record.md` Per-key close design lines are set to `complete`; Provides bindings and every other line remain unchanged. An absent section or record is not created. The four outputs and any existing records are preflighted together. A complete design refuses without `--replace`; an incomplete file may be filled, but every replaced file is archived first. Archives follow `standards/conventions.md` Archives, beside the original in `zArchive/YY-MM-DD Vn - original.ext`. Optional `paths.archive` names a different root-declared archive home (relative to the root or absolute); it must be named in that root's AGENTS.md and remain inside the root. Publication stages files, archives originals, then renames; an ordinary write failure rolls published files back. A process kill or simultaneous writer is outside that transaction's guarantee, so the caller serializes writes to one root.

Success prints one JSON object with each file's path and byte count, each heading's `filled`, `labelled` or `filled-and-labelled` state, archives, read-back claim count, unused answer fields and `elapsedMs`. Identical inputs at identical paths produce identical four output bytes; elapsed time and archive version numbers are intentionally variable. No output is written on validation failure. The command's performance check is under five seconds including process startup.

## Assembly

The skill writes a selection JSON with `person`, two `intro` lines, ordered `groups` with id and label, `footnote`, and `boards`. Each board supplies `number`, `name`, `group`, `energy`, `why`, optional `recommendation` and `zero`, `primaryMode`, and `buttonRadius`. Its `palette` has an `id` and optional `overrides` keyed by light or dark and then by role. Its `pairing` has an `id` and optional `headingFrom` or `bodyFrom`, each either a pairing id or a supplied face object. Blended heading settings and loudness tags come from the heading donor. Its `handwriting` is one of the base pairing's offered family names or explicit null.

A supplied face object has exactly `file`, a local `.ttf`, `.otf`, `.woff` or `.woff2` path relative to the selection or absolute; `family`, the font's family name as supplied by the person; and `weight`, a number from 1 to 1000. It replaces that role's library face. The base pairing supplies size, line-height, tracking and match tags, so the selected base must fit the supplied face; every size uses the supplied weight with no inherited variation axes. Its sample is the saved brand sentence, its style is normal, and its licence reads "supplied by the person". The file is screened and read, its font signature and container bounds checked, and its resolved absolute path emitted; a missing, unreadable or non-font file is refused before any output, with no library substitution. Contact Sheet embeds that file and runs its own checks.

`graphicSet` has `id` and optional `pattern` with `angle` and per-mode `strength`, and optional `texture` with per-mode `strength`. A `container` id and `initials` supply the placeholder, or `markFile` replaces both; mark paths resolve beside the selection. A `heroPhrase` names a substring of the sentence. `content` requires `brandName`, `sentence`, `body` and `smallPrint`, with optional non-empty `photoRules` text and an optional `never` array of non-empty single-line strings; `note` supplies text and direction. Optional `words` contains objects with required non-empty single-line `word` and `not` text. Omitted `photoRules`, and omitted or empty `words` and `never` arrays, leave out their respective panels or blocks and headings in both board modes. Present fields retain their validation; null is not omission. `sample` supplies kicker, title, phrase, body, note, steps and meta. `items` supplies cardLine, cardBack, bannerHeadline, bannerLine, contact, primaryAction and secondaryAction, with optional cardBackShort and tileBannerHeadline. `closingExamples` holds two or three examples. Nothing is silently inherited from another board.

Run from any directory, replacing the absolute paths:

```sh
node "/absolute/plugin/skills/Build Brand/scripts/assemble.mjs" --selection "/absolute/work/selection.json" --output "/absolute/work/board-spec.json"
```

`--library` optionally selects an absolute library JSON beside its fonts; `help`, `--help` and `-h` open no files. There are no other flags, installs, configuration or network calls. The output parent must exist, the destination must be new and outside this skill, and paths are canonicalized before opening them. Unknown ids, unknown fields and malformed overrides name the board and field and write nothing. Library font files become absolute paths inside the selected parts/fonts directory; supplied faces use their screened local paths. Stable selections and library bytes give stable output bytes. Assembly resolves choices; Contact Sheet then checks the spec and refuses contrast or type mismatches. Parts are curated choices, not a promise that every combination passes: the strongest editorial pattern fails on the locked paper-orange recipe, whose approved values stay unchanged. Use a suited recipe or explicitly tune a selection and run the checks again. Palette tests isolate recipes with the unchanged drawn set; graphic tests build every set at its own default strengths on green-black, and the specimens check the chosen combinations. The loud slab now has contemporary tags and can use loudness-three palettes under that match rule. `tests/selections.mjs` contains a complete invented-content selection factory used by the integration tests and specimens.


## Opening taps as data

`taps.json` version 1 holds the nine questions in screen order, each question's `id` and `question`, and its ordered `options`. Each option has a globally unique `id`, its member-facing `label`, optional `description`, and `nudges`. Mechanical's description is "Precise and engineered". Labels are shown as written; reference brands are names only, never copied logos. The sets use United States names; alternate regional names are not supplied here.

Nudges are counts toward named poles. One ordinary nudge is 1; Dark's small contemporary tick is 0.5; Established, but current adds 1 classic and 0.5 contemporary; Tesla's small dark-led tick is 0.5. `hand` encodes hand-made. `darkLed` and `brightColour` promote dark-led choices and bright recipes separately from the six dials. `natural`, `polished` and `casual` retain the complete tap reading but are not dials and are reported as ignored nudges. Neutral options carry an empty object. A positive dial score points to the second pole of `axes`; a negative score points to the first. Each part adds that score when it matches, subtracts it when it opposes, and adds zero for `either`.

`wholeLooks.rule` contains the whole-look rule: twelve looks, six constrained score leaders with distinct palettes, pairings and graphic sets, followed by six looks each changing exactly one aggregate position from look 1 (including either). Prefer an unused dial, then an unused destination on that dial, then score and library order. Palettes never repeat. Six contrasts spread across as many available dials and destinations as the library permits. Looks 2, 5, 8 and 11 use a plain ground: their graphic set has pattern strength 0 in both light and dark, with the other drawings retained. This spreads two plain grounds among the leaders and two among the contrasts. Every look remains distinct, with a different palette. A whole look's six positions are the unweighted majority of its pairing, palette and graphic set; either contributes zero. The screen shows the looks once. Every picked look adds one tick toward each of its non-either positions, so shared positions receive more weight. These ticks are selection steer, never adopted design rules.

## Selection from answers

`scripts/select.mjs` uses only Node built-ins and this skill's modules. It invokes the local Contact Sheet command for `--check`; it never installs or uses the network. Its consumers are Build Brand's board-making step, `assemble.mjs`, and the Form whole-look picture renderer. `parts.json` and `taps.json` are its bundled data. It follows `standards/script-contract.md`.

The answers JSON is one object with these closed fields:

| Field | Format |
|---|---|
| `name` | Required member or organisation name, single line |
| `sentence` | Required member-approved sentence, single line, copied exactly |
| `words` | Required array of `{word, not}` objects, both non-empty single lines; an empty array omits the panel |
| `taps` | Required object with exactly the nine question ids below, each naming one option id |
| `off` | Optional unique array of read-back parts marked off, default empty |
| `looks` | Optional unique array of up to three whole-look option values from `looks`, default empty |
| `kept` | Optional fixed-assets object, default empty, described below |
| `body`, `photoRules` | Optional single-line member text; body defaults to the exact sentence, absent photo rules are omitted |
| `heroPhrase` | Optional exact substring of the sentence; defaults to its last two words |
| `picks` | `variations` only, required: zero to three full board records copied from the previous selection, with unique board numbers; an empty array asks for another angle |
| `shown` | `variations` only, required: all full board records shown so far in this sitting, across all pages; page numbers may repeat |
| `steer` | `variations` only, optional: object with any of `warmCool`, `quietBold`, `softStrong`, `classicContemporary`; each is -1, 0 or 1 |

The nine `taps` keys are `mode`, `feel`, `history`, `strength`, `technology`, `style`, `posture`, `mood`, and `place`. Example with invented member text:

```json
{
  "name": "Sample Person",
  "sentence": "I help small teams make useful things",
  "words": [{"word": "Useful", "not": "busy"}],
  "taps": {
    "mode": "dark", "feel": "mechanical",
    "history": "established-current", "strength": "strong-solid",
    "technology": "craftsman", "style": "lululemon",
    "posture": "tesla", "mood": "restoration-hardware",
    "place": "design-studio"
  },
  "off": [], "looks": [], "kept": {}
}
```

`off` accepts a selected option id to drop all of that tap's contributions; an axis name to drop that entire dial; a pole name such as `warm` to drop only nudges toward that pole; or `darkLed` / `brightColour` to drop that promotion. An unselected option id is refused. Thus a read-back word can be removed without silently removing unrelated parts of a tap. Whole looks picked afterward add their own positions. The script reports nudges it ignores; it never invents a tap for a recommendation.

`kept` accepts `markFile`; `pairing`, a base library pairing id; `headingFrom` and `bodyFrom`, either a donor pairing id or the supplied `{file, family, weight}` object Assembly defines; `palette`, with an optional library `id` and/or per-mode role `overrides`; `primaryMode`, light or dark; and `buttonRadius`, 0 to 100. Asset paths resolve beside the answers file and the CLI makes them canonical absolute paths before writing a selection elsewhere. Supplied files are screened and validated by Assembly, and Contact Sheet checks the result when `--check` is given. No kept asset is relaxed to pass a check. Supply `kept` again in later rounds. A supplied face uses the selected base pairing's match tags, so choose a suitable base when the supplied face's character requires one.

Any kept asset adds board zero first, making Round 1 eleven alternatives plus zero, twelve boards total. Zero shows the supplied assets on the closest available library setting; it does not claim to reconstruct unprovided parts of an existing brand. Kept roles appear on every board. A fixed complete palette necessarily prevents five distinct colour energies and distinct close grounds; the script names this exception in `notes` and labels each board with its actual fixed energy. Fixed individual colour roles retain the five recipe energies; fixed grounds take precedence over the ground-family rule. Without a fixed palette, the rule applies even with a kept mark or face.

Commands, from any directory, with absolute work paths:

```sh
node "/absolute/plugin/skills/Build Brand/scripts/select.mjs" looks --answers "/absolute/work/answers.json" --check
node "/absolute/plugin/skills/Build Brand/scripts/select.mjs" round1 --answers "/absolute/work/answers.json" --output "/absolute/work/round1.selection.json" --check
node "/absolute/plugin/skills/Build Brand/scripts/select.mjs" round1 --answers "/absolute/work/answers.json" --unsteered
node "/absolute/plugin/skills/Build Brand/scripts/select.mjs" variations --answers "/absolute/work/round-answers.json" --check
```

`--answers` is required. `--output` is optional and writes only the selection, in exactly the format Assembly accepts. Its parent must exist; the destination must be new, end in `.json`, and resolve outside the skill, including through links. Protected sources and destinations are refused before opening. `--check` and Round 1's `--unsteered` are bare flags. `help`, `--help` and `-h` open no data or font files. There are no other flags; `--env`, `--install`, unknown and duplicate options are refused. Success is one JSON object on stdout, failure one error object on stderr with stdout empty and exit 1. Importing the module runs no command.

The success object contains `selection`, `dials`, `wholeLookBoosts`, `darkLed`, `brightColour`, `ignoredNudges`, `positions`, `spares`, `replacements`, `checks` and `notes`, plus the command and optional output path. `positions` holds each alternative's six aggregate positions, all three parts' positions, score and library order; board zero is the first alternative with kept assets applied. `spares` gives up to sixteen remaining candidates in rank order for each slot. Ranking ties retain pairing, palette, graphic-set library order. With `--check`, refused candidates do not reserve a palette, graphic or energy. Each refusal names its slot, cause, rejected parts and actual passing replacement. Completed checks are reused across slots only for identical board content and choices. Temporary specs and pages are removed on success and failure. Missing assets or tool failures stop the command rather than masquerading as a contrast refusal.

Round 1 has four close, four further and four other-angle boards (three other-angle boards with zero), distinct palette recipes across the alternatives and distinct graphic sets within each group. Pairings are distinct across the page where possible; a reused pairing is named in `notes` and remains distinct within its group. Five energies are reserved before slots run out. The other-angle group differs from the first board on exactly one strong dial (absolute score at least 2, excluding either), bringing in missing energies first. If no dial is strong, ranking and coverage choose that group. Close grounds are classified from their actual primary colour: pale sheets count together; navy and cobalt count as blue; dark means linear luminance below 0.18. No two close boards share a family, and no more than two have dark grounds. Dark-led taps put the first two close boards in dark mode; later boards use recipe-native mode. Dark-first wins equal scores for dark-led taps. At most two close boards have recommendations, each naming supporting tap labels in the member's own words.

`--unsteered` zeroes the six dials and both promotions, ignores picked-look boosts explicitly for the comparison, retains the same library and coverage constraints, uses "First set", "Second set", "Third set", and recommends none. It is the reproducible comparison with no taste steer.

`variations` replaces the former `blend` and `tune` commands. It makes four new boards from each picked board: one pick gives four, two give eight, three give twelve. Each pick's four stay together, in pick order, in their own group. Each variant changes one or two parts from its parent, counting pairing, palette, graphic set, container and primary mode separately. Unmoved references, role overrides, copy and kept assets remain on the board. With a kept heading or a parent `headingFrom` donor, the base pairing stays fixed too: a hidden pairing-id swap does not count as a type change, and the body and donor reference remain intact. All-zero or absent steer still produces four distinct changes. The report's `positions` and ranked spares name the `parent` board number and `changedParts` for each variant, along with its mode and container.

The four steer values add three ticks toward their chosen pole to the taps' scores. For ranking variations, a requested aggregate position that is missed costs 12, a mismatching part position costs 3, and each changed part costs 1. Bolder/quieter also targets one loudness step for palette and type, bounded at 1 and 3, costing 5 per missed step. Type loudness and palette compatibility use the heading face the board actually shows, including a string donor; supplied font files retain their base pairing's match tags as in Assembly. Temperature is retained unless separately steered, with a change costing 8. Ties use steered score, then library order. An already loudest pick reports its ceiling using that actual heading's loudness. Contact Sheet remains the final authority with `--check`; the next ranked eligible spare replaces a refusal without changing the parent's one-or-two-part limit.

Every variant excludes all boards in `shown`, the picks themselves and the variants already selected for this page. Identity compares the full pairing, palette and graphic-set references (including their overrides), container and primary mode; page numbers and labels do not make an old board new. The caller appends each displayed page's full `selection.boards` records to `shown` before asking for the next round. Board numbers may repeat across historical pages. Keep the picked records as returned rather than rebuilding them from ids.

To ask for another angle with nothing picked, run the same `variations` command with `picks: []`, the complete `shown`, and any `steer` and `off`. It uses Round 1's twelve-board selection, coverage, groups and checks, excluding every board already shown. Energies whose other-angle boards have all been shown are covered in the first eight, just like energies that cannot occur in that group, so a strong-dial contrast cannot strand a missing energy. If no unshown board of a needed energy remains anywhere, the error names the exhausted energy. Round 1 and fresh pages also exclude each alternative as it is selected, so even a fixed full palette cannot repeat an alternative's five-part identity on the same page. Kept assets retain Round 1's board-zero treatment and stated coverage exceptions; zero is a reference to the first alternative's kept assets, not an additional distinct alternative.

After the four this-or-that taps, offer the optional comment box, “Anything you'd change about the ones you picked?”, or “What's missing from these?” with nothing picked. The session reads it into the existing `steer` positions and `off` entries for a named wrong read-back part; free-text comments never reach this script. `off` removes the same tap contributions as before; an explicit new steer supplies the current requested direction. Send no `comment` field.

`looks` returns twelve `looks` records and ready-to-use Form `options`, each with `value`, `label` and `board`. Values are stable `look-` hashes of the three library ids. Pass the options unchanged into a question with `type: "boards"`, `view: "look"`, `pick: 3` and `min: 2`, with form-level shared `brand` words. Each board carries the pairing, palette, graphic set (including the plain-ground overrides), primary mode, container, handwriting and button radius. The Form tool draws them directly; no picture descriptor or conversion is needed. Values from checked looks remain valid even when Contact Sheet replaced an unchecked leader.

Assembly validates all six positions on every selected part and heading/body donor. Its successful CLI report includes `positions`, an array of `{number, parts}` with six positions for pairing, palette and graphic set. Ranking metadata is kept outside the Contact Sheet JSON, whose closed `tags` schema accepts only `paletteLoudness`, `typeLoudness` and `typeCut`; the board spec remains directly buildable. This is the same distinction as the original five ranking tags.

The font verifier permits a linked pack root for read-only hash verification. Links within the pack remain refused; all install requests still refuse linked destinations and ancestors before any writes. No pack is installed by selection or assembly.
