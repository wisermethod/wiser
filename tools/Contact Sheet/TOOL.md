---
name: Contact Sheet
type: tool
category: media
description: Write one self-contained HTML page of numbered options to pick from or whole brand boards, from local assets and licensed fonts
version: 0.1.0
---

# Contact Sheet

One HTML page of numbered options to pick from, or whole brand boards to react to, blend and tune.

## Context

Use for Build Brand's brand boards, Illustrator's page of options when a requester asks to choose, and Brand Mark's marks. The calling skill supplies the options, proportions, graphic language and recommendations. Contact Sheet never chooses for the person, calls a model, makes a network request, or invokes any primitive.

It does not render a PNG; the calling skill runs `tools/render/` `html` on the resulting page itself. It does not edit or resize an image, which belongs to `tools/image/`, or generate one, which belongs to `skills/Media Generator/`.

Classifier seam: none.

## Quick Start

From this tool's directory:

```bash
node scripts/contact-sheet.js help
```

Full example: save this UTF-8 JSON as `/path/to/work/options.json`, in an existing work directory outside the tool:

```json
{
  "layout": "pick",
  "title": "Two directions",
  "intro": "Read these as starting points.",
  "items": [
    {
      "kind": "text",
      "label": "Quiet and precise",
      "text": "Room for the work to speak.",
      "recommended": true,
      "reason": "Reflects your request for a quieter expression."
    },
    {
      "kind": "text",
      "label": "Open and warm",
      "text": "A welcome before the detail.",
      "note": "A more conversational direction."
    }
  ],
  "closing": "Which ones are you leaning towards? We can refine from there."
}
```

```bash
node scripts/contact-sheet.js build --spec /path/to/work/options.json --output /path/to/work/options.html
```

For brand boards, `tests/fixtures/brand-boards.json` is a complete three-board example for Sample Person, using the local fixture font and mark. From this tool's directory, replace the first path with this directory's absolute path:

```bash
node scripts/contact-sheet.js build --spec "/absolute/path/to/Contact Sheet/tests/fixtures/brand-boards.json" --output /path/to/work/brand-boards.html
```

One JSON object on stdout; one HTML file at `--output`. The output path must be new. Anything else, see Troubleshooting.

## Usage

| Command | Purpose | Writes a file |
|---------|---------|---------------|
| `node scripts/contact-sheet.js help` | Print usage | No |
| `node scripts/contact-sheet.js build --spec <file> --output <page.html>` | Build the page | Only `--output` |
| `node scripts/contact-sheet.js build --spec /path/to/work/brand-boards.json --output /path/to/work/brand-boards.html` | Build brand boards from the board spec below | Only `--output` |

| Option | Effect | Default |
|--------|--------|---------|
| `--spec <file>` | Absolute path to the JSON spec | Required |
| `--output <file>` | Absolute path to a new `.html` file, outside this tool | Required |
| `--help`, `-h` | Print usage without reading the spec or assets | Off |

`build help`, `build --help`, and `--help` print usage too. Unknown options, including `--env` and `--install`, repeated value flags, unexpected arguments and missing flag values are refused before any file is read. This tool installs nothing and takes no configuration.

Command paths are absolute. Paths inside the spec can be absolute or relative to the spec file's own directory, after resolving any symlink to that spec. All paths are canonicalized before use, including missing destination tails. Assets must be readable local files. Output inside the tool, including through a symlink, is refused. Existing destinations, including hard links, are refused; there is no overwrite flag. The tool creates no directories.

## Spec format

The root is one JSON object. Fields are case-sensitive. Unknown fields, duplicate object keys, empty required strings, wrong types and unused reason fields are refused. Optional fields may be omitted; `null` is not an omitted field. Text is plain text, never HTML or Markdown. Line breaks are allowed except where a field is explicitly single-line.

### pick

| Field | Format |
|-------|--------|
| `layout` | Required string: `pick` |
| `title` | Required non-empty string |
| `items` | Required non-empty array of the item objects below, in numbering order |
| `intro` | Optional single-line paragraph before the options |
| `closing` | Optional single-line invitation after the grid |

Every pick item carries:

| Field | Format |
|-------|--------|
| `kind` | Required string: `image`, `text`, `palette` or `type` |
| `label` | Required non-empty string |
| `note` | Optional non-empty string |
| `recommended` | Optional boolean; omitted means false. At most two items may be true |
| `reason` | Required single-line string when `recommended` is true; otherwise refused. The caller ties it to the person's answers |

`pick` gives every item the same card styling and grid track. Only the recommendation text distinguishes a recommended item. It has no selection controls or pre-selected option. Its four item kinds follow; the brand-board spec is after them.

### image

| Field | Format |
|-------|--------|
| `file` | Required local PNG, JPEG (`.jpg` or `.jpeg`), WEBP, GIF or SVG file |
| `alt` | Required non-empty description |
| `source` | Optional non-empty source name or address, shown only as text, never linked or fetched |

Images are embedded unchanged as base64 data URIs and fit within their cards without cropping. SVG must be UTF-8 standalone SVG using static drawing elements and presentation attributes. Filters (including `fe` primitives), masks, gradients and opacity are accepted. `url(#id)`, `href="#id"` and `xlink:href="#id"` must resolve to unique ids inside the same SVG; no reference may leave it. Scripts, style elements or attributes, event handlers, external references, foreign markup, animation, entity declarations and processing instructions other than the initial XML declaration are refused. Export such SVGs as standalone art first. Raster and font files are checked for the format's signature; this is not a full decoder or a font licence verifier.

### text

`text` is a required non-empty short passage, displayed as escaped text with its line breaks preserved.

### palette

`colors` is a required non-empty array. Each colour has exactly:

| Field | Format |
|-------|--------|
| `name` | Non-empty string, unique within this palette |
| `value` | `#RGB`, `#RRGGBB` or `oklch(L C H)`. L is 0 to 1 or 0% to 100%, C is non-negative, H is numeric with optional `deg`. Space-separated, no alpha |
| `role` | Non-empty description of its design role, displayed verbatim |
| `share` | Number greater than 0 and at most 100, representing percent of the design. Shares total 100, within 0.01 percentage point |

`sample` is required. Its four fields, `background`, `text`, `accent` and `onAccent`, each name a colour in `colors`. These explicit assignments set the sample's background, heading/body text, button-like block and that block's text; Contact Sheet infers no palette roles or contrast choices. One colour may serve several sample roles. Every colour is also displayed in the proportional swatch strip and the list of names, values, roles and shares. The pick layout measures no contrast. The board layout checks every pairing it sets, as below.

```json
{
  "kind": "palette",
  "label": "Paper and ink",
  "colors": [
    {"name":"Paper", "value":"#fafafa", "role":"Canvas", "share":70},
    {"name":"Ink", "value":"#222222", "role":"Copy and actions", "share":30}
  ],
  "sample": {"background":"Paper", "text":"Ink", "accent":"Ink", "onAccent":"Paper"}
}
```

### type

| Field | Format |
|-------|--------|
| `heading` | Required face object |
| `body` | Required face object |
| `sentence` | Required non-empty sample sentence; the same supplied text appears as heading, body paragraph and small print |
| `palette` | Optional object with `colors` and `sample` in the palette format. Omitted means neutral sample colours |

A face object has exactly `family`, the non-empty display family name; `file`, a local `.woff2`, `.woff`, `.ttf` or `.otf` file; and `licence`, non-empty licence text displayed with that face. The caller supplies a font it may embed. Font data is embedded with `@font-face`, using private family identifiers in first-use order. A face is shown at its file's normal weight and style. No system font lookup substitutes for a supplied file; unsupported or corrupt files need replacing by the caller. Both faces' family names and licences are visible, even when they share a file.

### board

The calling skill supplies a whole brand per board. Contact Sheet sets those parts without choosing palettes, faces, wording, order, recommendations or replacements. Every field below is required unless marked optional. All strings are non-empty; single-line means no line break. No board inherits another board's fields.

| Page field | Type and use |
|------------|--------------|
| `layout` | String `board` |
| `person` | Single-line string; person's name in the page label and each board's heading-face lockup |
| `intro` | Array of exactly two single-line strings; the only two lines before the boards, verbatim |
| `groups` | Non-empty array of `{id, label}` objects; both required single-line strings, ids unique. Labels appear in this order; each board's `group` names an id. Empty groups are refused |
| `footnote` | String; said once at the page's foot |
| `boards` | Non-empty array of board objects; spec order within each group, with board zero first |
| `showChecks` | Optional boolean, default false. `true` enables the designer view: palette role names, shares and their label, contrast summary and every checked pairing. Validation and JSON checks always run in either view |

| Board field | Type and use |
|-------------|--------------|
| `number` | Unique non-negative safe integer; visible number and stable local link target. Zero requires `zero: true` |
| `name` | Single-line string; board name above its tile and whole view |
| `group` | Single-line string naming a declared group id |
| `energy` | Single-line string; colour energy above its board |
| `why` | Single-line string; why this board is offered, above its board |
| `recommendation` | Optional single-line string; marks Recommended and says why there. At most two boards may carry it |
| `zero` | Optional boolean, default false. One board at most; with `number: 0`, labels the person's brand as it is today and places it before the groups |
| `primaryMode` | String `light` or `dark`; the tile's mode and first whole mode |
| `buttonRadius` | Number from 0 to 100, in pixels; the open link and button sample's corner radius |
| `palette` | Object in the palette table below; light and dark role values and swatch lists |
| `type` | Object with required `heading`, `body`, optional `handwriting` face objects below |
| `tags` | Object with required integer `paletteLoudness`, integer `typeLoudness`, each 1–3, and `typeCut`, string `contemporary` or `period`; used only for the match check |
| `graphics` | Object with required `hero`, `pattern`, `texture`, `title`, `description`, `legend` fields below |
| `monogram` | Object with either required `initials` and `container`, or required `file`, never both. `initials` is a single-line string typeset in the heading face; `container` is SVG markup in currentColor. `file` is a local image path, replacing the monogram everywhere |
| `content` | Object with the fields below; supplied words for the brand in use |
| `words` | Optional array of `{word, not}` objects, each required single-line text; each core word appears beside “not” and its opposing word in the heading face. Omitted or empty means no words panel or heading |
| `note` | Object with required single-line `text`, `direction` (`left`, `right`, `up`, `down`), and `svg`, a left-pointing arrow drawing. The layout rotates that drawing to the requested direction beside the headline note |
| `sample` | Object in the sample-page table below; a content fragment that demonstrates this board's marks |
| `items` | Object in the item-text table below; text for the card, banner and alternate-mode actions |
| `closingExamples` | Array of two or three single-line strings; example answers beside the closing question |

`palette` has required `light`, `dark`, and `swatches`, and optional `modeSwatches` and `chips`. Each mode is an object with every role below required, an opaque sRGB `#RGB` or `#RRGGBB` string. The same role key can have a different value in each mode; roles may share values. Board colours use sRGB so the checks and browser use the same values.

| Mode role | Where set |
|-----------|-----------|
| `ground` | Page ground, hero, rules, sample page and mark-size ground |
| `panel` | Type samples and social banner |
| `text` | Body face specimens, core words, legend names, rules and secondary actions |
| `headline` | Person's name, headline, face names and monogram on ground |
| `smallPrint` | Small print on ground and `content.body` in the alternate-mode panel |
| `deep` | Deep colour, available to swatches and SVG role ink |
| `pop` | Button fill; explicitly marked in the swatch list |
| `onPop` | Button text |
| `mark` | Hero drawing and pattern ink |
| `cardFront` | Business card front ground |
| `cardFrontText` | Card front name and monogram |
| `cardFrontSmallPrint` | Card front `items.cardLine` and `items.contact`, on `cardFront` |
| `cardBack` | Business card back ground |
| `cardBackText` | Card back sentence and monogram |
| `cardBackMark` | Card back texture ink |
| `sub` | Optional hero and sample body colour; defaults to `text` |
| `note` | Optional margin-note colour; defaults to `smallPrint` |
| `panelSmallPrint` | Optional small print on panels, including `items.bannerLine` on the social banner's `panel` ground; defaults to `smallPrint` |
| `hairline` | Optional fine outline for the card front; defaults to `panel` |

`swatches` is a non-empty array, in display order. Each entry has required `name` (unique single-line string), `role` (single-line role in words), `share` (number above zero, at most 100, percent of a page), and `key` (string naming a mode role). Shares total 100 within 0.01 point; at least one entry names `pop`. The palette is one stacked column: each filled bar shows its everyday name and value, with the proportional share strip beneath. The member view hides role names, percentages and “Share of a typical page”. `showChecks: true` adds them for a designer. Names that merely describe a colour’s job (“Page base”, “Inset field”, “Reading ink”, “Deep field”, “Drawing ink”, “Action fill”, “Detail ink”, “Title ink”) are hidden too. If no everyday name is supplied, the value appears alone; the tool invents none. Alternate chips use an everyday swatch name for the same role or resolved colour where one exists; designer chips retain their supplied labels. Tiles use the names only. Alternate-mode panels use named chips. For each bar and chip the layout selects the palette role with the greatest WCAG ratio on that fill, ties resolved in the role-table order. That exact pairing must pass 4.5:1 and is listed in the checks; no outside colour is substituted. Optional `modeSwatches` is an object with required `light` and `dark` lists in this same format. When supplied these replace `swatches` in their respective modes, allowing different names, roles and proportions. Both lists are validated, including the pop role and total shares. Optional `chips` has required `light` and `dark` non-empty arrays of `{name, key}` entries (single-line name and palette role key), replacing only the alternate panel’s strip; their inks are selected and checked the same way as bars.

Each face has:

| Face field | Type and use |
|------------|--------------|
| `family` | Required single-line string; visible name, set in the face |
| `description` | Required single-line string; explains the face in words |
| `weights` | Required non-empty array of unique numbers from 1 to 1000; weights used by the three explicit size settings. Every weight needs a covering file |
| `variations` | Optional non-empty object of four-letter axis keys to finite numbers from -1000000 to 1000000; emitted as font-variation-settings. Omit for a static face; supply every axis setting the caller intends |
| `licence` | Required single-line licence name, named in the whole board's foot; the caller establishes embedding rights |
| `stripLabel` | Optional single-line label for the tile face strip, default the family name. A handwriting face sharing either text family is omitted from the strip |
| `sample` | Required single-line sample text; the line set in the face on its whole-board specimen |
| `sizes` | Required object with `display`, `middle` and `small`, each a size object below. Display drives the headline and large specimen, middle the sample title and specimen line, small the name and supporting face settings |
| `files` | Required non-empty array of `{path, weight, style}` objects. `path` is a local `.ttf`, `.otf`, `.woff` or `.woff2` path; `weight` is a number 1–1000 or ordered two-number inclusive range `[min,max]` for a variable file; `style` is `normal`, `italic` or `oblique`. Duplicate range/style declarations are refused |

Each size object has required numeric `size` (8–240 pixels), `lineHeight` (0.7–3, unitless), `tracking` (-0.15–0.5 em), and `weight` (1–1000, also declared in `weights`). Required `variations` is a non-empty object of four-letter axes to finite numbers -1000000–1000000, or `null` to use the face-level settings, normal when those are absent. Optional numeric `maxWidth` (2–100 em) bounds the display headline; omitted means 12 em. Values are emitted per face, rather than sharing one headline style. The tile headline is 0.47 of display size (0.36 on a narrow screen); its wide full-board counterpart uses display size directly. At card widths it uses 0.58 with a 32px floor, and at phone widths 0.48 with a 30px floor. Other-mode headlines use 0.6 of display. Supporting applications scale the supplied settings to their physical size.

Every file is read, signature-checked and checked for a complete font-container header and table bounds, then embedded as base64 with its weight and style. Private family identifiers avoid system font lookup. Heading and body are the two text faces; handwriting, if supplied, appears in the tile strip, supplied margin notes and the card back. Each face supplies its own sample line. Heading and body cards show a large Aa, the sample, description, weights and licence. The handwriting face is named in the tile strip and licensed in the foot; it supplies notes and the card back. No font is fetched or licence guessed. Container checking is not a full font decoder or an embedding-rights audit.

| Graphic field | Type and use |
|---------------|--------------|
| `hero` | Required object with `svg`, required SVG string, `placement`, optional string `headline` (default) or `monogram`; and `phrase`, optional single-line substring of `content.sentence`. For headline placement the drawing sits immediately under that phrase, or the whole headline when omitted. Monogram placement encloses the name-lockup mark and refuses an unused phrase. Optional `shape` is `underline` (default), `surround` or `highlight`; a surround fills the phrase box rather than sitting below it. A highlight stretches the supplied SVG as a band behind the phrase, with the headline text over it, and requires headline placement. Optional `role` names the hero drawing ink, default `mark`, so a highlight may use another named role. Supply either one role key for both modes, or `{light: "pop", dark: "deep"}` with a role key for each mode. Phrase text keeps the headline ink, checked on both its normal ground and the band. Use a filled rectangle with `fill="currentColor"` for a solid band. Its text pairing is checked against every declared band ink at the headline need (3:1, or 4.5:1 when the smallest rendered headline is below 24px); failure refuses the spec. Use `preserveAspectRatio="none"` on an underline or highlight SVG when it should stretch to the phrase |
| `pattern` | Required object with `svg`, required SVG string; `strength`, required `{light, dark}` object of numbers 0–1; and `angle`, optional number -180–180 degrees, default 0. Repeats over page ground behind its content |
| `texture` | Required object with `svg`, required SVG string, and `strength`, required `{light, dark}` object of numbers 0–1. Repeats behind the card-back content at its mode's strength |

`graphics.title` and `graphics.description` are required single-line strings introducing the legend. `graphics.legend` is a required non-empty array; each entry has required single-line `name` and `use`, and required drawing `svg`. Every entry is drawn and named beside the sample page, in order; no fixed mark count or vocabulary is imposed.

| Sample-page field | Type and use |
|-------------------|--------------|
| `kicker`, `title` | Required single-line strings for the small content page and alternate-mode content card |
| `phrase` | Required non-empty single-line substring of `title`; the circle surrounds this phrase |
| `body` | Required text paragraph in the sample page |
| `note` | Required single-line margin note in the handwriting face, or body when absent |
| `steps` | Required non-empty array of single-line labels; arranged beneath the supplied path |
| `rule`, `circle`, `path`, `closing` | Required static SVG strings: opening rule, phrase surround, step path and closing mark. These also supply the banner rule and alternate content-card circle |
| `meta` | Required single-line supporting text for the alternate content card |

| Item-text field | Type and use |
|-----------------|--------------|
| `cardLine` | Required single-line description on the card front |
| `cardBackShort` | Optional single-line card-back text for the tile, default `cardBack` |
| `tileBannerHeadline` | Optional single-line headline for the tile’s alternate-mode banner, default `bannerHeadline` |
| `cardBack` | Required text on the card back; line breaks preserved |
| `bannerHeadline`, `bannerLine` | Required single-line headline and supporting text on the social banner; the headline also appears on the tile's alternate-mode banner |
| `contact` | Required single-line domain or contact text on the card and banner; never linked or fetched |
| `primaryAction`, `secondaryAction` | Required single-line primary button and secondary link-style sample labels in the alternate panel; static samples, with no action |

Each SVG string is a complete standalone static SVG using the image rules above. Ink is `currentColor`, `none`, `{{roleKey}}`, or an internal `url(#id)` referencing a gradient or other paint server whose ink uses those values, for example `stroke="{{mark}}"`. The layout resolves ink for each mode and embeds the result as a data URI. Decorative SVG may use filters, the `fe` filter primitives, masks, gradients, opacity and local references to ids in that same SVG. SVG text elements, supplied colour overrides, style, script, handlers, `foreignObject` and outward references are refused. Unspecified root fill takes the assigned ink.

A monogram container accepts currentColor or role ink, checked on each surface where it is drawn. Optional `monogram.surfaces` has any of `ground`, `cardFront`, `cardBack`, each an object with required role keys `background`, `ink`, `frame`, and numeric `radius` (0–50 percent). These set the monogram ground, initials, container ink and corner radius on that surface. Omitted surfaces use transparent ground, the assigned text colour and the same container ink. Explicit monogram text and frame pairings are checked on their supplied ground at 3:1. The identifying container stays opaque, without filters, masks or opacity, so its ink can be checked. A supplied `file` refuses these unused fields.

Hero, arrow, legend, sample and banner marks, patterns and textures have their declared ink ratios reported on their actual surfaces, without a `need`; decorative contrast never refuses a board. Patterns and textures can sit behind text. Text checks retain their needs on both the base surface and the maximum-strength composited surface for every declared ink, with sRGB rounding matching browser bytes. When filters or opacity make the actual ink uncertain, these checks use the declared ink at the declared mode strength; they do not claim to measure filtered pixels. Opaque type and sample panels retain their own measured grounds. The foot names each colour used only for marks, its mode and its ratio on the ground, saying "for marks only". Colours also used as text, monogram ink or functional surfaces are excluded; palette demonstrations do not count as functional use.

| Content field | Type and use |
|---------------|--------------|
| `brandName` | Required single-line string; business card name, button sample and mark description |
| `sentence` | Required single-line brand sentence; hero and alternate-mode headline |
| `body` | Required string; hero and alternate-mode body paragraphs |
| `smallPrint` | Required single-line string; small print beneath the whole-board hero |
| `photoRules` | Optional non-empty string; photography rules in words, with no photographs. Omitted means no photo-rules block or heading |
| `never` | Optional array of non-empty single-line strings; visible never list. Omitted or empty means no never block or heading |
| `markCaption` | Optional single-line initials caption. Default: “These initials hold the place of a logo. Ask for a logo any time after you lock a board.” A supplied mark uses “Your mark” |
| `closing` | Optional single-line closing question, followed by `closingExamples`. Absent or `null` omits both the question and examples; there is no default question |

The page header is "{OvO} Wiser · Brand boards for" the person. Two-across tiles become one across on a narrow screen. Name, energy, why and any recommendation sit above each tile. When `why` equals `recommendation`, only the recommendation line is shown. Its bottom-right button uses its pop, onPop, radius and body face and says "Open the whole board". Local fragment links reach labelled whole-view sections in this same file, each with a link back to all boards. No script or separate board file is needed. A one-board page shows the whole board directly, with no tile.

The tile places the headline and palette column in one row, a face strip below, then card front, card back and a banner in one row, with space before the bottom-right open button. The whole board places the heading and body specimens beside the core words when supplied, then a drawn sample page and legend beside the cards and four mark sizes, followed by a full-width banner and alternate panel. The card back is slightly turned, carrying its texture.

Each whole view contains both complete modes, primary first in the file, with one visible at a time through local fragment targets. The slim bar names the person, links to all N boards, says Board n of N and the visible mode, and links to the other complete mode. Each complete board also includes a composed panel in its other mode: name, headline, body, primary button, secondary link, content card and named palette chips. This works for dark-first boards too. The complete board shows: the name and monogram or supplied mark; headline, body, small print; palette; every face and sample; graphic language; social banner and business card front/back; marks from profile picture down to browser tab; photo rules and never list when supplied. These optional blocks are omitted in both modes, with no empty headings. Its closing question carries the supplied example answers; its foot names every face's licence and summarizes contrast results in a sentence, with a disclosure listing every pairing. Without a supplied mark it says the monogram is a placeholder, not a logo, and the real mark is drawn after a board is locked. The closing question is "What would you keep, and what would you change?"

Before writing anything, every board is checked. Palette and type loudness may differ by at most one; loudness-3 palettes need contemporary type of loudness at least 2. Every text foreground/surface pairing in both modes meets WCAG 2: 4.5:1 below 24px, 3:1 for large headlines and monograms. Decorative marks are measured and reported with no required ratio; they cannot cause a contrast refusal. Text over a highlight, pattern or texture retains its required ratio. Tile names and all face names use the stricter 4.5:1 because they are smaller. Button text meets both 4.5:1 and APCA absolute Lc 60, using APCA-W3 0.1.9 / SAPC constants 0.0.98G-4g. File existence, signatures and licence names are checked for every face. Any failure refuses the whole spec; it is never overridden or silently repaired.

## Board model and card geometry

`scripts/board-model.js` exports `createBoardModel(validatedSpec)`, `BOARD_LAYOUT`, `BOARD_LABELS`, `DEFAULT_MARK_CAPTION`, `FACE_ROLES`, `PUBLIC_FONT_FILES`, `faceSetting`, `resolveDrawing`, `heroRole` and `oppositeMode`. It has no imports, Node built-ins, `Buffer`, file access, network access or side effects. Pass the successful result of `validateBrandBoards`, not an unchecked spec. It returns detached JSON data:

- Page identity, intro, groups, footnote, display option and the shared layout description.
- Each board’s metadata, supplied text, palette, face descriptions and `display`, `middle`, `small` settings. Resolved face settings name family, weight, style, size in pixels, line height, letter spacing in em and variation axes. `textStyles` supplies the exact settings for each application (hero, face specimens, cards, banner, notes and every mark size); `variants` describe weight/style coverage; no font path or font bytes enter the model.
- `modes.light` and `modes.dark`: role colours, named swatches/chips and their measured inks, every drawing as resolved standalone SVG text, and ordered `blocks` for the whole board and `tile` for its preview. The blocks describe hero, palette, faces/words, graphic language, cards/mark sizes, banner, alternate panel, optional rules and tile navigation. A supplied mark is only `{supplied: true}`; its asset remains the caller’s responsibility.
- Complete contrast checks, independent of label visibility. `markCaption`, `closing` and the deduplicated `why` are the resolved display words; `footer` describes the closing/examples, licences and optional designer contrast notes.

`brand-board-view.js` writes the HTML from this description and embeds local font/mark assets separately. `brand-board-style.js` reads the same `BOARD_LAYOUT` geometry. The model supplies no HTML page, image bytes or font files; a browser or Worker can consume it without filesystem access. This seam does not validate untrusted input or grant permission to transmit a member’s record.

`PUBLIC_FONT_FILES` maps every font-pack family to upright Latin WOFF2 entries `{url, weight, style, verified}`. Weight is a number or inclusive two-number range. All 35 families are covered by 37 files at `fonts.gstatic.com`; each address answered HTTP 200 with `font/woff2` on 2026-10-29. Families without a public file: none. These are references, never fetched by Contact Sheet. Public Latin files follow the provider’s coverage and may differ from the bundled subset; for example Libre Caslon Text uses separate 400 and 700 files. The standalone page continues to embed the caller’s validated local files. The map is kept in JavaScript so the same module imports unchanged in Node, a browser and a Worker.

| Width | Whole-board layout |
|-------|--------------------|
| Above 900px | Existing twelve-column page layout and supplied display sizes |
| 734px target, at most 900px | 16px outer margins, 24px padding; hero then palette; two face columns then words; sample and legend alongside; two business cards alongside with mark sizes below; alternate panel stacks. Hero body is 20px |
| 390px target, at most 600px | 12px outer margins, 20px padding; faces, sample/legend, cards and rules stack; notes and chips wrap. Hero body is 18px |

Business cards retain 3.5:2 and the banner 4:1 in both widths. The banner’s headline has an 18px floor on phones. No viewport scaling shrinks the whole wide page into the card.

## Script Contract

Every script follows `system/templates/Script Contract.md`; running a tool is described in `tools/RUNNING.md`. Node built-ins cover this tool. No dependency install, system dependency or `--env` is needed. `tools/AGENTS.md` inventories tool writes; this tool writes only its caller-named deliverable, outside its own directory.

## Output

Success prints one JSON object to stdout and exits 0:

```json
{"output":"/path/to/work/options.html","itemCount":2,"bytes":5000,"embedded":[]}
```

The byte figure above illustrates the shape; the real reply measures the complete UTF-8 HTML file.

| Field | Carries |
|-------|---------|
| `output` | Canonical absolute path written |
| `itemCount` | Number of pick items or brand boards |
| `boards` | Board layout only: array of `{number, name, checks}`. Each check names `mode`, `pairing`, `foreground`, `background`, the resolved `foregroundValue` and `backgroundValue`, measured `wcag` ratio and, for required pairings, `need`. Decorative pairings omit `need` and are reported without a refusal threshold. Fixed page-chrome pairings, on the page ground and energy-label background, are listed with mode `page`. Buttons also carry signed `apcaLc` and `apcaNeed`; absolute Lc meets that need. All pairings are listed, not only the lowest |
| `bytes` | Complete HTML size in bytes, including base64 expansion, markup and fonts |
| `embedded` | Every embedded file once, in first-use order, as `{ "path": "canonical absolute path", "bytes": originalFileSize }`. Repeated uses share this record; their actual HTML bytes still count toward the limit |

Help prints usage text to stdout and exits 0. Failure prints one JSON object, `{"error":"cause and fix"}`, to stderr, leaves stdout empty and exits 1. Every board failure is named by board number and name, with each failing pairing and need; independent board, font and contrast failures are collected on stderr. Validation and missing-asset failures write nothing. The whole page is built and its size checked before the output is opened exclusively.

The limit is 40 MB, 40,000,000 bytes. Embedded sizes are checked before assets are read, then the complete page is measured before writing. An oversized page is refused with a message naming `tools/image/` for resizing first. There is no clock, random value or filesystem-order walk in the output. Identical spec bytes and asset bytes produce identical HTML bytes, independent of destination or current directory.

The file contains inline styles and embedded image/font data only. All supplied text is escaped, including source addresses; addresses display as text using HTML entities. A restrictive content security policy permits only inline styles and image/font data. The neutral page chrome, wrapping text and responsive grid support wide pages and the 734px card and 390px phone widths below. A PNG, if wanted, is produced by the caller's separate `tools/render/` `html` run.

## Troubleshooting

| What you see | What to do |
|--------------|------------|
| Unknown option or missing flag | Run `node scripts/contact-sheet.js help`; use `--spec` and `--output` with absolute paths |
| Unknown field or repeated field | Correct the JSON against Spec format; unsupported input is never silently dropped |
| More than two recommendations | Keep at most two, with a single-line reason for each |
| Type-to-colour mismatch | Replace the board with compatible palette/type tags; never override the check |
| WCAG pairing failure | Replace the named foreground/surface in the named mode; small text needs 4.5:1 |
| APCA button failure | Replace pop/onPop so button text meets both WCAG 4.5:1 and absolute Lc 60 |
| Font file or licence failure | Supply every local font file with a matching font signature and give every face its licence name |
| Board role, group or SVG ink error | Follow the board tables; supply all mode roles and static role-coloured drawing shapes |
| Missing file or unsupported extension | Correct the path relative to the spec, or supply a listed local format |
| SVG active or external markup | Supply a standalone static SVG with presentation attributes and local fragment references |
| Colour/sample error | Use the documented colour notation, unique names and explicit sample assignments; total shares to 100 |
| Output exists, is inside tool, or parent is missing | Choose a fresh `.html` path in an existing work directory outside the tool |
| Page exceeds 40 MB | Resize with `tools/image/` first or split the options across pages |

## Verification

From this tool’s directory, run the complete suite with the installed shared browser runtime and Chromium:

```sh
PLAYWRIGHT_BROWSERS_PATH="$HOME/Library/Caches/ms-playwright" npm test
```

The suite installs nothing. Its browser check requires the existing runtime (`tools/render/` `check` surveys it); without one, the browser test fails explicitly. It verifies fixtures against the model in both modes at 734px and 390px, horizontal overflow, card/banner proportions, the isolated import with all module imports and Node globals denied, complete font-pack coverage, caller-owned words, hidden labels with unchanged refusal checks, recommendation deduplication, and a recorded pre-extraction page hash with only the intended wording and responsive CSS excluded. The other tests cover the complete pick and board contracts, including font containers and unsafe SVG refusals. Public font reachability was checked once when constructing the map; the offline suite checks its coverage, weights and URL format without fetching anything.

## Success

- Help is available on Node 18 or later with nothing installed or configured.
- Pick builds all four kinds; board composes whole brands in both modes, each in the same self-contained HTML file with measured bytes and the complete asset inventory in JSON.
- Pick cards retain spec numbering, equal styling, escaped labels and at most two explicit recommendation reasons; board names, energy, why and recommendations sit above their boards.
- Missing assets or licences, invalid fields, unsafe SVG, mismatched type/colour, failing contrast, an occupied destination or oversized output stop with exit 1 and a JSON error, with stdout empty.
- The same inputs give byte-identical HTML; long labels wrap and the grid reflows on narrow screens.
