---
name: Book Publisher
type: tool
category: documents
description: Builds a typeset print interior, a structurally checked PDF/X variant, and an EPUB from ordered Markdown chapters and a YAML config
version: 0.1.0
---

# Book Publisher

## Context

Use this tool to turn a book project into a print interior and a reflowable EPUB 3, with an optional back-of-book index. It merges and typesets the manuscript; editorial decisions belong to the caller. Use a document or presentation renderer for a short document or a slide deck instead.

This plugin's 0.1.0 tool was migrated from an earlier generation numbered 0.1.2. It holds no credentials. Package installation reaches the npm registry; the publishing pipeline reads local files.

Classifier seam: none.

## Script Contract

The entry point follows `system/templates/Script Contract.md`. Shared run behavior and install recovery are in `tools/RUNNING.md`. Run the commands below from this tool's directory.

## Dependencies

| Dependency | Needed for | Presence check |
|------------|------------|----------------|
| Node 22.13 or newer and npm | Every command; `pdfjs-dist` 6 requires this Node minimum | `node --version` reports at least 22.13.0 |
| pandoc | Every build, including EPUB-only | `pandoc --version` |
| pdflatex | Print typesetting | `pdflatex --version` |
| kpsewhich | `check --config` when `output.print` is set | `kpsewhich --version` |
| TeX packages and font files | The print template for the selected typography | `kpsewhich <filename>` returns a path for each required file, listed below |
| makeindex | Print indexing with `index.enabled: true`, except under `--draft` | `printf '' \| makeindex -q` exits 0 |
| Ghostscript | Print conversion and page counting | `gs --version` |

The print template requires `book.cls`; the `geometry`, `fontenc`, `ulem`, `microtype`, `inputenc`, `babel`, `amssymb`, `xcolor`, `graphicx`, `float`, `placeins`, `caption`, `longtable`, `booktabs`, `array`, `calc`, `enumitem`, `needspace`, `fancyhdr`, `titlesec`, `setspace`, `csquotes`, `listings`, `fancyvrb`, `makeidx`, `eso-pic`, `tikz`, `url` and `hyperref` packages (each checked as `<name>.sty`); and `t1enc.def`, `utf8.def` and `english.ldf`. The selected `typography.font_family` additionally requires `libertinus.sty`, `libertinus-type1.sty` and `newtxmath.sty` for `libertinus` under pdflatex, `sourceserifpro.sty` for `source-serif`, or `lmodern.sty` for Latin Modern. An omitted family, `lmodern`, or any unrecognized value retains the existing Latin Modern rendering. The existing thumb-tab face uses `T1SourceSansPro-TLF.fd`, `SourceSansPro-Bold-tlf-t1.tfm`, `SourceSansPro-Bold.pfb` and `a_emkxm5.enc` directly, without loading the Source Sans package.

Under pdflatex, `libertinus.sty` and `libertinus-type1.sty` additionally load `iftex.sty`, `ifxetex.sty`, `ifluatex.sty`, `xkeyval.sty`, `textcomp.sty` and `fontaxes.sty`, and `newtxmath.sty` loads `amsmath.sty`, `ifthen.sty`, `etoolbox.sty`, `centernot.sty` and `binhex.tex`; `check --config` checks these too. Only the exact strings `libertinus` and `source-serif` select those families.

`typography.quote_font: sans` additionally requires `sourcesanspro.sty`, its pdflatex dependencies `ly1enc.def`, `ot1enc.def`, `ifxetex.sty`, `ifluatex.sty`, `xkeyval.sty` (also `mweights.sty` on a LaTeX kernel that has not incorporated it), plus `SourceSansPro-{Regular,It,BoldIt}-tlf-t1.tfm` and `SourceSansPro-{Regular,It,BoldIt}.pfb`. In particular, the package requests LY1 even with T1 output. `check --config` fails on a missing TeX file with its name and `kpsewhich` command; run it before typesetting. EPUB-only builds and configs with only `output.epub` do not need TeX.

A nonempty `boxes` mapping additionally requires `mdframed.sty` with its default renderer `md-frame-0.mdf`, and the packages `kvoptions`, `xparse`, `etoolbox`, `zref-abspage`, `zref-base`, `color`, `keyval`, `ltxcmds`, `kvsetkeys`, `infwarerr`, `kvdefinekeys`, `pdftexcmds`, `etexcmds`, `auxhook` and `expl3` (checked as `.sty` files). `check --config` verifies these files only when print output and at least one boxed class are configured.

`typography.url_font: sans` uses the existing T1 Source Sans Pro family directly and additionally checks its Regular, Italic and Bold Italic `.tfm` and `.pfb` files. URL breaking uses the `url` package already loaded by `hyperref`, including stretch between URL characters and a URL-only microtype context without protrusion; it adds no package.

Generated print contents additionally requires `etoolbox.sty`, checked when `contents.enabled: true`, to remove titlesec's chapter before-skip without moving the contents locator. Its default remains `false`.

The tool's packages are `yaml` and `pdfjs-dist`. Consent is once per person as the Script Contract states: answer the install request with `--install` on the same command, or `WISER_ALLOW_INSTALL=1` for an unattended run. The authorized run uses `npm ci` and completes the command; it never requires a second run after installation. You'll only be asked once: your yes also covers anything else Wiser needs to download later, including after updates. Run no package install by hand.

Print conversion requires a local CMYK ICC profile. The tool uses the first existing file in this order: `/System/Library/ColorSync/Profiles/Generic CMYK Profile.icc`, `/System/Library/ColorSync/Profiles/USWebCoatedSWOP.icc`, `/usr/share/color/icc/ghostscript/default_cmyk.icc`, `/usr/share/ghostscript/iccprofiles/default_cmyk.icc`, `/usr/local/share/ghostscript/iccprofiles/default_cmyk.icc`, `/opt/homebrew/share/ghostscript/iccprofiles/default_cmyk.icc`. If none exists, the build fails and names the missing profiles. The same profile is used for conversion and embedded in the OutputIntent; Ghostscript must exit 0 even when it has written a complete file.

There is no PDF/X preflight dependency. After conversion the PDF/X file is checked for an OutputIntent carrying `/DestOutputProfile`, CMYK color without DeviceRGB (monochrome DeviceGray images and masks are permitted), PDF version 1.3, every font embedded, and an even page count. Each failed check, including a missing output profile, fails the build. These structural checks do not certify PDF/X-1a conformance. Conformance is checked by the printer's own upload preflight or Adobe Acrobat Pro's Preflight.

## Input contract

This section is the input contract's one home. `init` produces a conforming project; `validate` proves its configuration and manuscript structure, without typesetting. A successful validation does not prove print conformance or the editorial quality of the book.

A project has `chapters/` with numbered `.md` files in leading-number then filename order, `assets/` for local images and other referenced files, `book-config.yaml`, and the project's `AGENTS.md`. Give each chapter a distinct leading number and optional letter suffix, for example `01-introduction.md`, `02a-example.md`. Asset references resolve from the chapter that contains them; use paths such as `../assets/figure.png`. Exclusions are exact filenames. A config may sit below the project; the parent of `source.chapters` owns the project's `AGENTS.md`.

The member chooses where the book project lives. When they have not said, recommend a location under `standards/user-root.md` C4 rather than choosing one silently.

### Book project instructions

The project's `AGENTS.md` carries this book's completion condition, production requirements, manuscript changes, and a layout table. It may also carry a voice selection: another root named by its path whose bound voice this book is written in, in the form `skills/Content Author/SKILL.md` Inputs defines. That selection does not move the work or change its owning root.

Keep universal book rules and every build-governing value in this input contract and `book-config.yaml`, respectively; do not duplicate either in the project's instructions. The title as a heading is the exception. The project is not a root: its frontmatter carries neither `root:` nor `type:`. The scaffold uses `book:` to identify its template and a `## Standing` section for the completion condition, initially `Awaiting its owner.`. Validation requires that section to be filled for projects identified by the frontmatter's `book:` key. Other books still require a readable `AGENTS.md`; validation reports whether Standing was found without requiring the heading.

### Configuration

Pass `--config` as an absolute path. Paths inside YAML resolve relative to that file's directory; absolute paths stay absolute. These are all the public config keys the tool reads. No credential or `--env` is involved.

| Key | Meaning | Default when omitted |
|-----|---------|----------------------|
| `title` | Book title | Required |
| `authors` and `authors[].name` | List of name strings or objects with `name` | Required nonempty list |
| `trim.width`, `trim.height` | Print dimensions in inches | Required, including for validation and EPUB-only |
| `margins.top` | Print top margin in inches, at least the template's header height plus separation (see below), even without a visible header | `0.85` |
| `margins.bottom` | Print bottom margin in inches, at least the template's footer skip (`0.45`) | `0.85` |
| `margins.outer` | Print outer margin in inches, at least the template's thumb-tab width (`0.5`), reserved for every manuscript | `0.85` |
| `margins.inner` | Print binding-side margin in inches, a finite nonnegative number | `1.1` |
| `source.chapters` | Directory of chapter Markdown files | Required |
| `source.assets` | Asset directory | Print falls back to `../assets` relative to the config; supply explicitly for EPUB |
| `source.exclude` | Filenames excluded from the merge | `[]` |
| `source.merged` | Optional persistent merged manuscript, reused in single-pass builds unless `--force-merge` or `index.terms_file` is set | No persistent file in single-pass builds; two-pass uses `temp/<slug>-merged.md` in the print output directory |
| `output.print` | Print output directory | None; required when building print |
| `output.epub` | EPUB output directory | None; required when building EPUB; validation requires at least one output directory |
| `slug` | Output filename base | Title lowercased, non-alphanumeric runs replaced by hyphens, edge hyphens stripped |
| `subtitle` | EPUB metadata subtitle | Empty string |
| `publisher.name` | EPUB metadata publisher | Empty string |
| `language` | EPUB metadata language; print template uses English | `en` |
| `description.short` | EPUB description | Empty string |
| `description.keywords` | EPUB subject list | `[]` |
| `isbn.print` | Replaces the first existing `**ISBN:**` number in the merged manuscript | No replacement |
| `covers.ebook` | Optional EPUB cover image | No cover; a named missing file is also skipped |
| `typography.font_family` | Print family: `libertinus`, `source-serif`, or `lmodern` (Latin Modern); unrecognized values also use Latin Modern. Does not select the EPUB reader's font | `lmodern` (the existing Latin Modern rendering) |
| `typography.quote_font` | Print quotation face: `body` inherits the surrounding body face; `sans` selects Source Sans Pro. Thumb-tab labels retain Source Sans Pro Bold in either case | `body` |
| `typography.url_font` | Print URL face: `mono` uses the existing monospaced face; `body` inherits surrounding text; `sans` uses the template's sans family. URLs can break inside long letter/digit segments in every face | `mono` (the existing URL face) |
| `typography.font_size` | Print base size in points | `12` |
| `typography.line_spacing` | Print line stretch | `1.15` |
| `contents.enabled` | Generate a print contents page before the manuscript; EPUB keeps its own navigation | `false` |
| `contents.depth` | Deepest print heading level listed in the contents, an integer from 1 to 5; 1 lists chapters (`#`), 2 also lists `##`, and so on. With Parts enabled, uses the promoted levels below a Part and also lists the Parts | `1` |
| `headings.numbered` | Control LaTeX's heading counters, labels and automatic number writes: `true` retains the existing numbering depth; `false` sets `secnumdepth` to -2 and stops automatic part/chapter/section counter steps. This template hides automatic heading labels on the page; generated contents also hides them regardless of this setting. Numbers written in a title remain visible. With `false`, table and figure counters have no chapter prefix while the chapter counter is zero; figure captions remain hidden | `true` (LaTeX's existing numbering depth) |
| `parts.enabled` | Recognize document-level `#` headings beginning with `parts.prefix` as print Parts and promote headings below them by one level | `false` |
| `parts.prefix` | Literal, case-sensitive prefix of the visible heading title, without the Markdown `#`; nonempty text on one line. The full title, including this prefix, is retained | `"Part "` (including the trailing space) |
| `boxes` | Mapping of fenced-div class names to box styles; names start with an ASCII letter and contain only letters, digits, underscores or hyphens, without a leading dot | `{}`; no box styling or additional TeX packages |
| `boxes.<class>` | Style mapping for that class; `{}` opts into the defaults in both formats | Class not boxed unless named |
| `boxes.<class>.print` | Mapping of print style settings below | All print style defaults below |
| `boxes.<class>.print.background_gray` | Background gray, from 0 (black) to 1 (white) | `0.95` |
| `boxes.<class>.print.border_gray` | Border gray, from 0 (black) to 1 (white) | `0.5` |
| `boxes.<class>.print.border_width` | Border width in points, finite nonnegative number | `0.5` |
| `boxes.<class>.print.padding` | Inner padding on all sides in points, finite nonnegative number | `8` |
| `boxes.<class>.epub` | Mapping of EPUB style settings below | All EPUB style defaults below |
| `boxes.<class>.epub.background` | Background, quoted six-digit hex color | `"#f2f2f2"` |
| `boxes.<class>.epub.border_color` | Border, quoted six-digit hex color | `"#808080"` |
| `boxes.<class>.epub.border_width` | Border width in CSS pixels, finite nonnegative number | `1` |
| `boxes.<class>.epub.padding` | Inner padding on all sides in ems, finite nonnegative number | `0.75` |
| `index.enabled` | Enable makeindex | `true` |
| `index.terms_file` | Optional YAML terms list for makeindex, resolved relative to this config. Regenerate index markers in the disposable print manuscript from fresh chapters at every build, including when `source.merged` exists | Absent; use only the manuscript's existing inline markers |
| `index.extractor` | Enable two-pass extraction when `index.enabled` is false | Absent |
| `index.extractor.indexHeading` | Index section boundary | `Appendix C: Index` |
| `index.extractor.glossaryHeading` | Section following the index | `Appendix D: Glossary` |
| `index.extractor.frontMatterPages` | Initial manuscript pages skipped during term and heading searches; generated contents pages never count toward this skip | `5` |
| `index.extractor.indexFallbackFromEnd` | Fallback index start, this many pages from the end | `10` |

Margins must be finite numbers and may be set independently; omitted edges keep their defaults. `validate`, `check --config` and `build` refuse margins below the template's reserved space, naming the setting and minimum in inches. The header needs `14pt` plus `0.275in` separation at the default `12pt` size and at `11pt`, a minimum of `0.275 + 14/72.27` inches (approximately `0.468718`). At `10pt`, including the book class's fallback for unsupported sizes, separation remains `0.25in`, so the minimum is `0.25 + 14/72.27` inches (approximately `0.443718`). The footer needs `0.45in`; thumb tabs need `0.5in`. These template lengths and validation minima come from the same internal layout values; they add no config setting. Thumb-tab space is always reserved because config validation precedes the manuscript merge, which may reuse `source.merged`; it does not depend on finding tab markup. The inner margin remains nonnegative. The margins in force, including when `margins` is entirely omitted, must leave a positive text width and height within the trim. The defaults pass on both 8 by 10 inch and 5.5 by 8.5 inch trim.

Automatic print image sizing uses the trim width minus the inner and outer margins. Existing two-decimal sizing is retained when it fits (including exactly `6.05in` on the default 8 inch trim). If rounding would exceed the text block, the width retains its precision and the image filter uses the actual LaTeX line width when its own rounding would exceed that limit. Explicit Markdown image widths still take precedence. EPUB sizing is unchanged.

For each boxed class, twice the sum of its print padding and border width must be smaller than the text width inside the print margins, leaving room for its content.

With `contents.enabled: true`, print builds repeat LaTeX and regenerate makeindex whenever its input changes until the contents, labels and index references stop changing. This also runs without makeindex and under `--draft`. Recoverable LaTeX errors such as missing images are tolerated as without contents, but every contents pass must produce a fresh, complete PDF before it can establish convergence. A build that does not stabilize within 12 LaTeX passes fails and retains its intermediates.

The generated contents precedes all manuscript content, has no printed folios, and ends on an even physical page, inserting an unprinted blank page when necessary. The manuscript then restarts at Arabic page 1 on a recto, with its first three folios hidden as without generated contents. Contents entries, makeindex locators and two-pass references use manuscript folios, rather than physical PDF page positions; the first three manuscript pages still have implicit numbers 1 through 3. The two-pass extractor excludes the entire generated contents and its blank page before applying `frontMatterPages` or searching for headings and terms. Generated contents displays heading titles without automatic numbers, matching the template's heading pages. With contents enabled, chapter openers use their existing chapter break without the redundant break inside the title style, and omit titlesec's chapter before-skip and spacer so titles retain their contents-off vertical position; section and subsection recto breaks run before their locators are written. This keeps each contents locator on the heading's actual page, including starred and short-title forms. A Part title's inline index markers are retained only on its Part page and omitted from its generated contents entry. Omit any hand-written contents listing or blank-page reservation it replaces. These settings affect print only. With the settings omitted, the existing print layout, numbering and pass order are preserved.

`init` supplies title/author placeholders, 6 by 9 inch trim, `chapters/`, `assets/`, `publish/print/`, `publish/epub/`, and the `none` index strategy. Other metadata is left for the member. Extra publishing metadata may be kept in YAML, but keys outside the table do not govern this build.

### Index strategies

| Strategy | Config | Manuscript requirement |
|----------|--------|------------------------|
| `none` | `index.enabled: false`, no `index.extractor` | No index markup or index section needed |
| `makeindex` | `index.enabled: true` (also the default) | Inline index markers or `index.terms_file`; the index needs no marker heading and is placed once after the body |
| `two-pass` | `index.enabled: false` with an `index.extractor` block | Matching index and glossary headings, in that order; index terms ending in `<!-- br -->`; a `<!-- toc-entry: Index heading -->` matching the configured index heading |

A makeindex index is print-only, placed once after the body; an EPUB receives none. With `contents.enabled: true`, the generated contents lists it as a chapter-level `Index` entry at every `contents.depth`, even when the manuscript has no index markers and no terms file, where that entry points at a page with no index.

For two-pass extraction, write the boundary headings as `## Heading` or a bold-only `**Heading**` line. Set the extractor keys above when the book uses different boundaries or front matter. A two-pass print `build` freshly merges chapters, builds a first pass, extracts page numbers from its PDF and LaTeX AUX, injects TOC/index page references into the merged manuscript, and rebuilds in one invocation. Source chapters are unchanged. Single-pass builds may reuse `source.merged`; two-pass always merges fresh. `--draft` skips makeindex, not the two-pass extractor.

`index.terms_file` requires the makeindex strategy. Its file is a nonempty YAML list of mappings. Each entry accepts only these keys:

| Terms-file key | Meaning | Default when omitted |
|----------------|---------|----------------------|
| `term` | Literal index label, nonempty single-line text without braces or backslashes; commas remain part of the label | Required |
| `match` | Nonempty list of literal single-line phrases; case-insensitive whole-word matching, with flexible whitespace including ordinary source line wraps and wraps within the same blockquote at any nesting depth | `[term]` |
| `scope` | `chapters` indexes the first eligible hit per source chapter file; `first` indexes only the first eligible hit in the book | `chapters` |
| `see` | Literal cross-reference target, with the same text requirements as `term`; emit once at the first eligible hit, without a page locator | No cross-reference |

Duplicate terms (ignoring case) and malformed entries fail `check`, `validate` and `build`. Matching searches prose, including text inside emphasis, lists, fenced divs and editorial brackets such as `[Agent memory, 2016]`. An unclosed `[` does not exclude the prose after it. It skips headings, code, HTML tags and comments, inline links (`[label](destination)`), full and collapsed references (`[label][reference]`, `[label][]`), images (`![label]` with their destinations or references), bare URLs, div delimiters, raw LaTeX commands and existing index markers. Shortcut references (`[label]`) are skipped only when a reference definition for that label exists anywhere in the manuscript; labels ignore case and collapse whitespace. A phrase must lie within one eligible prose interval; it cannot cross intervening markup, a blank line, or a change in blockquote nesting depth, including a boundary with ordinary text. Blockquote prefixes are treated as whitespace only for searching; the manuscript and marker positions retain the original text. A word boundary is a change between letters, digits or `_` and anything else, so `Agent` also matches in `Agent's` and `Agent-memory`. Unmatched entries produce no marker. These rules apply only when `index.terms_file` is set; its default remains absent. For example:

```yaml
- term: "Agent memory"
  match: ["Agent memory", "Agent memories"]
  scope: chapters
- term: "Data, information, knowledge, and wisdom"
- term: "Information"
  see: "Data, information, knowledge, and wisdom"
```

Generated markers are zero-width Pandoc raw LaTeX index commands placed after the matched text in the print build copy. They preserve literal punctuation and coexist with hand-written `{{idx:...}}` markers. Chapter files and the terms file are read-only. A configured `source.merged` is refreshed with the unmarked merged text; markers are written only under the print output's `temp/`. EPUB receives the unmarked text. `--draft` still skips makeindex. Omit `index.terms_file` to retain the existing merge reuse and marker-only output.

### Manuscript markup

Use ordinary Pandoc Markdown for prose, lists, headings, images and tables. In the print template, `#` starts a chapter-style page, `##` a part or appendix, `###` a chapter within a part, and `####`/`#####` sections within it. EPUB navigation includes headings through level 3.

With `parts.enabled: true`, a document-level heading such as `# Part One. Getting started` makes an unnumbered print Part page with its full title and a Part contents entry. Below it, `## Chapter 1. First steps` becomes a print chapter, and headings from `###` through `######` are also promoted one level. This scope continues across chapter files until the next document-level `#` heading; a matching heading starts the next Part, while any other `#` ends the promotion scope and keeps its normal chapter behavior. Headings before the first Part keep their existing levels. Code examples and headings inside quotes or lists do not start or end a Part. EPUB keeps the original heading hierarchy, so both Parts and their chapters remain in its native navigation. The `<!-- toc-part: -->` directive retains its compact print contents meaning and never creates a Part page. Omit `parts.enabled` or set it to `false` to retain the existing output.

Print ordered lists reserve label space for their own final counter, including lists starting above 1, so two-digit numbers stay inside the text block. Single-digit lists keep their existing indent.

Raw LaTeX `\section`, `\subsection` and `\subsubsection` retain their normal, starred and optional short-title forms. Each runs an automatic float barrier before the heading.

Fenced divs such as `::: {.under-the-hood}` become boxes only when their class is named in `boxes`. The first named class in the div's class order wins. Unnamed classes retain the existing output, including within a configured book. Print boxes use grayscale backgrounds and borders and can continue across pages; Markdown headings inside them become bold local labels retaining their link targets, without chapter page breaks or contents entries. Print images inside boxes, including explicitly sized images, are capped at the width left by the box's padding and border. EPUB retains native divs, classes, identifiers and heading hierarchy, with the configured style on the div and a `1em` vertical margin above and below it. Both formats retain the box's body markup. Box style mappings reject unknown settings and invalid values. For example:

```yaml
boxes:
  under-the-hood:
    print:
      background_gray: 0.96
      border_gray: 0.4
      border_width: 0.6
      padding: 10
    epub:
      background: "#f3f3f3"
      border_color: "#666666"
      border_width: 1
      padding: 0.8
  sidebar: {}  # Default style in both formats
```

Print boxes belong in the manuscript's normal text flow. A configured print box nested inside another configured box is refused because the TeX package cannot paginate the inner frame; close the outer box first. An unnamed div inside a box remains allowed. EPUB supports nested boxes. Use `--verbose` to see Pandoc's diagnostic if a build refuses nested print boxes.

| Markup | Meaning |
|--------|---------|
| `<!-- format: centered, font-size=small -->` ... `<!-- /format -->` | A format block; directives may be combined with commas and nested blocks close in reverse order |
| `page-style=empty`, `plain`, or `fancy` | Format directive controlling running headers and page numbers |
| `font-size=scriptsize`, `small`, `normalsize`, `large`, `Large`, `LARGE`, `huge`, or `Huge` | Format directive selecting a TeX size |
| `new-page`, `no-clearpage`, `centered`, `vfill` | Format directives for a page break, heading-break suppression, centering, or vertical fill |
| `vspace=0.5in`, `linespacing=1.0`, `needspace=3in` | Format directives taking a TeX dimension or line stretch |
| `<!-- pagebreak -->`, `<!-- cleardoublepage -->` | Print page break, or resume on an odd page |
| `<!-- br -->` | Print line break; EPUB newline; also a two-pass term delimiter |
| `<!-- toc-start -->` ... `<!-- toc-end -->` | Compact print contents block |
| `<!-- toc-entry: Title -->`, `<!-- toc-entry: Title, 12 -->` | Print TOC entry, optionally with an explicit page number |
| `<!-- toc-part: Part Title -->`, `<!-- toc-part: Part Title, 12 -->` | Print TOC part heading, optionally with a page number |
| `<!-- thumb-tab-start: label=PART, slot=1 -->` ... `<!-- thumb-tab-end -->` | Print edge tab, slots 1 through 8; omitted label is empty and omitted slot is 1 |
| `<!-- printindex -->` | Legacy marker accepted and dropped; makeindex has one home after the body |
| `<!-- epub-cover: ... -->` | Legacy comment dropped; use `covers.ebook` for the cover |
| `{{idx:Term}}`, `{{idx:Main!Sub}}` | makeindex entry or subentry; terms may contain spaces and wrap across a source line |
| `{{idx:Term\|(}}` ... `{{idx:Term\|)}}` | Balanced index page range, including across chapters |
| `{{idx:Term\|see{Other}}}`, `{{idx:Term\|seealso{Other}}}` | Index cross-reference |

Index markers become print index commands and are removed for EPUB. The EPUB cleaner drops print comments, uses native TOC navigation instead of the standalone `**Contents**` heading, and removes page-number lists from the configured two-pass index while keeping its term list. Print images use natural sizing at 300 DPI, capped at the content width; an explicit Markdown image width wins. Dimension probing tries local `sips`, ImageMagick `identify`, then `file`; a probe failure falls back to the available line width. Bold-only headings near an image automatically request space to keep them together.

A book may follow these optional EPUB front-matter conventions: a copyright block containing `All rights reserved.`, beginning around a preceding `Copyright 20...` line, is wrapped in smaller copyright styling. The block is the copyright page: it ends at the next heading as Pandoc's markdown reader finds one, an ATX `#` line at the start of a line or a setext heading, after a blank line and outside fenced code, so a chapter after it keeps its heading and its place in navigation; a line on that page containing ` is a trademark`, outside fenced code, ends it earlier, after that line. If `**Author's Note**`, a bold title line matching `title` with an initial `The ` removed, and that copyright block occur in order, the cleaner separates the note, title page and copyright with page breaks. These are conventions, not required book text. The EPUB postprocessor also unwraps a first title navigation entry holding every other entry, using that entry's matching boundaries in navigation and the NCX. It also unwraps Pandoc's duplicate title around authored lower-level title headings that share its target, including when it holds only front matter before later Parts. It removes the corresponding opening content wrapper unless a surviving navigation entry still targets its title, in which case that heading and target remain. A title entry beside the chapters stays in place, including its subtitle or other nested headings. These behaviors are on by default and need no setting. Native navigation follows the opening content, and the conventional opening figure caption `What You Get` is suppressed.

## Usage

| Command | Accepted flags | Effect |
|---------|----------------|--------|
| `node scripts/publish.js help` | `--help`, `-h` | Usage on an uninstalled copy |
| `node scripts/publish.js check` | `--install`, `--help`, `-h` | Survey four system runtimes and package presence; explicit installation repairs packages first |
| `node scripts/publish.js check --config <path>` | `--config`, `--install`, `--help`, `-h` | Also check the project, report its index strategy and require the print template's TeX files when `output.print` is set; a missing YAML reader or TeX file fails with exit 1 |
| `node scripts/publish.js validate --config <path>` | `--config`, `--install`, `--help`, `-h` | Check config, numbered chapters, local asset references, index ranges/boundaries and project instructions |
| `node scripts/publish.js build --config <path>` | `--config`, `--print-only`, `--epub-only`, `--draft`, `--force-merge`, `--cleanup`, `--verbose`, `-v`, `--install`, `--help`, `-h` | Build both formats unless narrowed |
| `node scripts/publish.js init --output <dir>` | `--output`, `--title`, `--author`, `--help`, `-h` | Write a new project without installing packages; refuse existing project paths |

| Flag | Value and default |
|------|-------------------|
| `--config <path>` | Absolute config file; required by build/validate, optional for check |
| `--output <dir>` | Absolute new project directory, required by init |
| `--title <text>` | Init title; defaults to target directory name |
| `--author <text>` | Init author; defaults to `Awaiting its owner.` |
| `--print-only` | Only standard print PDF and PDF/X variant; off by default |
| `--epub-only` | Only EPUB; off by default; mutually exclusive with `--print-only` |
| `--draft` | Skip makeindex; off by default |
| `--force-merge` | Re-merge rather than reuse a persistent manuscript; off by default |
| `--cleanup` | Remove build temp directories after success; intermediates are retained by default and always retained on failure |
| `--verbose`, `-v` | Stream engine output to stderr; off by default |
| `--install` | Authorize packages under the Script Contract; `WISER_ALLOW_INSTALL=1` is its unattended equivalent |
| `--help`, `-h` | Print help before dependencies and configuration |

A leading build option without a command implies `build`. No arguments prints help. `init` accepts no `--install` because it installs nothing.

## Writes and output

Every write location, including project scaffolding, dependencies and build intermediates, is inventoried in `tools/AGENTS.md` under Everything a tool writes, and where.

| Command | JSON fields |
|---------|-------------|
| `init` | `ok`, `project`, `config`, `title`, `indexStrategy` |
| `check` | `pandoc`, `pdflatex`, `makeindex`, `ghostscript`, `yaml`, `pdfjs`; with a readable config/package also `configChecked`, `ok`, `title`, `indexStrategy`, `standingFound`, `errors` |
| `validate` | `ok`, `title`, `authors`, `trim`, `index`, `indexStrategy`, `project`, `standingFound`, `chapters` |
| `build` | `ok`, `title`, `outputs`; requested `print_pdf`, `print_pdfx`, `pages`, `epub`; print also carries `outputs.pdfx` |

Print builds also report `outputs.print_fonts`: `faces` lists the distinct faces actually used for text in the interior; `unexpected` names each face outside the selected family and its companions, with physical PDF page numbers and the affected text; `missingCharacters` lists final-pass missing-glyph and unsupported-Unicode diagnostics. These are also warnings on stderr, even without `--verbose`; they do not certify glyph coverage or fail the build. The configured body family, its math companion, Source Sans Pro tab/quote face and the selected family's existing mono face are expected. Under pdflatex, Libertinus's four text arrows use its `newtxmath` companion because its TS1 face lacks those glyphs. No manuscript change is required. This audit uses the existing `pdfjs-dist` dependency.

`outputs.pdfx.checks` contains five booleans: `outputIntentProfile`, `cmykOnly`, `pdf13`, `fontsEmbedded`, `evenPageCount`. Its sibling fields are `version`, `fonts.embedded`, `fonts.total`, `pages`, `certified: false`, and the structural-only `scope`. All five checks gate success. The reader handles classic PDF cross-references and Flate-compressed content from this conversion, refusing encrypted PDFs, unsupported content filters or inline images instead of claiming they passed.

## Troubleshooting

Shared stops are in `tools/RUNNING.md`. Correct malformed YAML, chapter ordering, missing assets or index boundaries and run validate again. For a Standing refusal on an init project, fill the completion condition or record `Awaiting its owner.`; another book needs its own readable `AGENTS.md`. For an engine or structural failure, inspect retained build logs or use `--verbose`; install a missing CMYK ICC profile at one of the paths named in the error and rebuild. A missing OutputIntent profile fails the build. A printer's conformance refusal is resolved through its upload preflight or Acrobat Pro's Preflight.

## Success

- Help and init run with nothing installed; init refuses an occupied project and its result validates.
- Bare check surveys without an implicit install, returning one object of six booleans and exit 0. With a config it also checks the required TeX files for print; an authorized install completes that same command.
- Validation accepts each index strategy, requires project instructions, and enforces filled Standing only on template-identified projects.
- A two-pass print build merges, extracts, injects and rebuilds in one invocation; the resulting PDF has the reported page count and embedded fonts.
- Print success reports every structural property and explicitly disclaims conformance certification. A missing output profile, RGB, wrong PDF version, unembedded fonts, odd pages or any nonzero Ghostscript conversion status fail with stderr only and exit 1.
- Requested outputs exist outside the tool directory, and EPUB has native navigation with print-only markers removed.
