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

The print template requires `book.cls`; the `geometry`, `fontenc`, `ulem`, `microtype`, `inputenc`, `babel`, `amssymb`, `xcolor`, `graphicx`, `float`, `placeins`, `caption`, `longtable`, `booktabs`, `array`, `calc`, `enumitem`, `needspace`, `fancyhdr`, `titlesec`, `setspace`, `csquotes`, `listings`, `fancyvrb`, `makeidx`, `eso-pic`, `tikz`, `hyperref` and `lmodern` packages (each checked as `<name>.sty`); and `t1enc.def`, `utf8.def` and `english.ldf`. Latin Modern is checked even for a selected family because the existing Pandoc variable form falls back to it. Every book is currently set in Latin Modern whatever `typography.font_family` names, so `check` requires only the Latin Modern files; a family's own packages are checked once the template loads that family. The existing thumb-tab face uses `T1SourceSansPro-TLF.fd`, `SourceSansPro-Bold-tlf-t1.tfm`, `SourceSansPro-Bold.pfb` and `a_emkxm5.enc` directly, without loading the Source Sans package.

`typography.quote_font: sans` additionally requires `sourcesanspro.sty`, its pdflatex dependencies `ly1enc.def`, `ot1enc.def`, `ifxetex.sty`, `ifluatex.sty`, `xkeyval.sty` (also `mweights.sty` on a LaTeX kernel that has not incorporated it), plus `SourceSansPro-{Regular,It,BoldIt}-tlf-t1.tfm` and `SourceSansPro-{Regular,It,BoldIt}.pfb`. In particular, the package requests LY1 even with T1 output. `check --config` fails on a missing TeX file with its name and `kpsewhich` command; run it before typesetting. EPUB-only builds and configs with only `output.epub` do not need TeX.

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
| `margins.top` | Print top margin in inches, a finite nonnegative number | `0.85` |
| `margins.bottom` | Print bottom margin in inches, a finite nonnegative number | `0.85` |
| `margins.outer` | Print outer margin in inches, a finite nonnegative number | `0.85` |
| `margins.inner` | Print binding-side margin in inches, a finite nonnegative number | `1.1` |
| `source.chapters` | Directory of chapter Markdown files | Required |
| `source.assets` | Asset directory | Print falls back to `../assets` relative to the config; supply explicitly for EPUB |
| `source.exclude` | Filenames excluded from the merge | `[]` |
| `source.merged` | Optional persistent merged manuscript, reused in single-pass builds unless `--force-merge` | No persistent file in single-pass builds; two-pass uses `temp/<slug>-merged.md` in the print output directory |
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
| `typography.font_family` | Print family: `libertinus`, `source-serif`, otherwise Latin Modern | Latin Modern |
| `typography.quote_font` | Print quotation face: `body` inherits the surrounding body face; `sans` selects Source Sans Pro. Thumb-tab labels retain Source Sans Pro Bold in either case | `body` |
| `typography.font_size` | Print base size in points | `12` |
| `typography.line_spacing` | Print line stretch | `1.15` |
| `index.enabled` | Enable makeindex | `true` |
| `index.extractor` | Enable two-pass extraction when `index.enabled` is false | Absent |
| `index.extractor.indexHeading` | Index section boundary | `Appendix C: Index` |
| `index.extractor.glossaryHeading` | Section following the index | `Appendix D: Glossary` |
| `index.extractor.frontMatterPages` | Initial pages skipped during term and heading searches | `5` |
| `index.extractor.indexFallbackFromEnd` | Fallback index start, this many pages from the end | `10` |

Margins may be set independently; omitted edges keep their defaults. The inner and outer margins must leave a positive text width within the trim, and the top and bottom margins must leave a positive text height. Print image sizing uses the trim width minus the inner and outer margins.

`init` supplies title/author placeholders, 6 by 9 inch trim, `chapters/`, `assets/`, `publish/print/`, `publish/epub/`, and the `none` index strategy. Other metadata is left for the member. Extra publishing metadata may be kept in YAML, but keys outside the table do not govern this build.

### Index strategies

| Strategy | Config | Manuscript requirement |
|----------|--------|------------------------|
| `none` | `index.enabled: false`, no `index.extractor` | No index markup or index section needed |
| `makeindex` | `index.enabled: true` (also the default) | Inline index markers; the index needs no marker heading and is placed once after the body |
| `two-pass` | `index.enabled: false` with an `index.extractor` block | Matching index and glossary headings, in that order; index terms ending in `<!-- br -->`; a `<!-- toc-entry: Index heading -->` matching the configured index heading |

For two-pass extraction, write the boundary headings as `## Heading` or a bold-only `**Heading**` line. Set the extractor keys above when the book uses different boundaries or front matter. A two-pass print `build` freshly merges chapters, builds a first pass, extracts page numbers from its PDF and LaTeX AUX, injects TOC/index page references into the merged manuscript, and rebuilds in one invocation. Source chapters are unchanged. Single-pass builds may reuse `source.merged`; two-pass always merges fresh. `--draft` skips makeindex, not the two-pass extractor.

### Manuscript markup

Use ordinary Pandoc Markdown for prose, lists, headings, images and tables. In the print template, `#` starts a chapter-style page, `##` a part or appendix, `###` a chapter within a part, and `####`/`#####` sections within it. EPUB navigation includes headings through level 3.

Raw LaTeX `\section`, `\subsection` and `\subsubsection` retain their normal, starred and optional short-title forms. Each runs an automatic float barrier before the heading.

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

A book may follow these optional EPUB front-matter conventions: a copyright block containing `All rights reserved.`, beginning around a preceding `Copyright 20...` line, is wrapped in smaller copyright styling. The block ends at a line containing ` is a trademark`, or at the next `##` heading. If `**Author's Note**`, a bold title line matching `title` with an initial `The ` removed, and that copyright block occur in order, the cleaner separates the note, title page and copyright with page breaks. These are conventions, not required book text. The EPUB postprocessor also removes the outer title wrapper from navigation and the first content file, places native navigation after the opening content, and suppresses the conventional opening figure caption `What You Get`.

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
