---
name: icon-set
type: tool
category: media
description: Searches two pinned open-source sets, Phosphor 2.1.1 (MIT) and Health Icons 2.0.0 (CC0 icons, MIT package), and writes one icon recoloured at the caller's size as an SVG file or a fragment to place inside a drawing
version: 0.2.0
---

# icon-set

## Context

Use it for an icon as a detail inside a picture or an interface: a sign, a glyph on a drawn screen, a pictogram for a person. Drawing a scene or an illustration belongs to `skills/Illustrator/`. Do not use it for a logo or a brand mark, or for converting or editing an existing SVG, which belongs to `tools/image/` or `tools/render/`.

Health Icons draws people in roles, ages and groups, and health subjects; Phosphor draws postures and everything else. Which set draws the people in a picture is `skills/Illustrator/drawing.md`'s People rule. `--set health` selects Health; omitting `--set` keeps Phosphor.

Classifier seam: none.

`check`, `search`, and `get` authenticate to nothing and hold no credential. They make no network request except an authorized install, which fetches the two pinned packages, `@phosphor-icons/core` at exactly 2.1.1 and `healthicons` at exactly 2.0.0, from npm at `registry.npmjs.org` (about 4.7 MB compressed together). Searching and writing an icon use only the selected local package. Nothing in an emitted SVG loads an external asset.

**Licence.** Phosphor Icons is MIT. Health Icons' project states its icons are CC0 1.0; its npm package is MIT. Every icon this tool writes carries a `data-icon` attribute naming the set, the icon, the weight and the version. A caller records each icon it places with its set's record line: `Phosphor Icons 2.1.1, MIT License, Copyright (c) 2023 Phosphor Icons` or `Health Icons 2.0.0: icons CC0 1.0 (healthicons.org); package MIT License, Copyright (c) 2021 Resolve to Save Lives`. The tool reads each copyright line from that installed package's own `LICENSE`. `NOTICE.md` carries both MIT texts and the project's CC0 statement; retain the applicable copyright and permission notice when distributing MIT material.

## Quick Start

Run these commands from this tool directory:

```bash
node scripts/icon-set.js help
node scripts/icon-set.js check
node scripts/icon-set.js search --query person --limit 5
node scripts/icon-set.js get --name person-simple --weight fill --size 48 --color '#123abc' --output /path/to/work/person.svg
node scripts/icon-set.js search --set health --query doctor --limit 5
node scripts/icon-set.js get --set health --name doctor --weight outline --size 48 --color '#123abc' --output /path/to/work/doctor.svg
```

No arguments, `help`, `--help`, and `-h` print usage without anything installed. `node scripts/icon-set.js get help` prints that command's usage; the same form works for `check` and `search`, including `--help` and `-h`.

A missing package stops `search` or `get` with the package, host, destination and the one install command: `node scripts/icon-set.js check --install`. Adding `--install` to the original command authorizes the install and completes that command in the same run. `WISER_ALLOW_INSTALL=1` authorizes an unattended `search` or `get`; a matching plugin consent marker authorizes later installs. A plain `check` always surveys without installing, even with that environment variable or a marker. `tools/RUNNING.md` owns the consent flow.

## Script Contract

Every script follows `system/templates/Script Contract.md`, pointing to `standards/script-contract.md`; what a user meets is `tools/RUNNING.md`. Help prints usage and exits 0. Successful work prints one JSON object on stdout and exits 0. A refusal leaves stdout empty, names the cause and fix on stderr, and exits 1. Every flag is closed to the subcommand declaring it; duplicates and unexpected positional arguments are refused before installation.

`get` writes only the file named by `--output`, an absolute path outside this tool directory. Its parent must already exist. Existing destinations, including hard links, are refused; symbolic links in the path are resolved before the tool boundary is checked. There is no overwrite option. `search` writes nothing. A survey `check` writes nothing; an authorized install uses `npm ci` with install scripts, audit and funding requests disabled. `tools/AGENTS.md` lists the install's writes, including the plugin consent marker and npm's configured cache and logs. No command needs configuration or accepts `--env`.

## Dependencies

| Dependency | Needed for | Check that proves it |
|------------|------------|----------------------|
| `@phosphor-icons/core` exactly 2.1.1, MIT | `search`, `get` with `--set phosphor` (default) | `node scripts/icon-set.js check`: `packages.phosphor` reports `installed:true`, `state:"ready"` and `version:"2.1.1"` |
| `healthicons` exactly 2.0.0, CC0 icons, MIT package | `search`, `get` with `--set health` | The same check: `packages.health` reports `installed:true`, `state:"ready"` and `version:"2.0.0"` |

The tool checks `node_modules/@phosphor-icons/core/package.json` inside its own directory, never a globally installed package. The installed catalog is the exported `icons` array in `node_modules/@phosphor-icons/core/dist/index.mjs`; each entry carries `name`, `tags` and `categories`. SVGs are `node_modules/@phosphor-icons/core/assets/regular/<name>.svg` for regular weight and `node_modules/@phosphor-icons/core/assets/<weight>/<name>-<weight>.svg` for the other five weights. The licence is `node_modules/@phosphor-icons/core/LICENSE`. These paths were read from the installed 2.1.1 package, not inferred from another Phosphor distribution.

Health's local manifest is `node_modules/healthicons/package.json`; its catalog is `public/icons/meta-data.json`, an array of 690 entries in 2.0.0. Their `id`, `title`, `category`, `tags` and `path` are read directly. Under that package, SVGs are `public/icons/svg/<weight>/<path>.svg`. Metadata paths map literally, including underscores and capitals, as confirmed against all installed files; names are not converted to hyphens. Only `filled` and `outline`, the 48px sources, are offered; `filled-24px` and `outline-24px` are excluded. The licence is `node_modules/healthicons/LICENSE`.

## check

One survey of both local packages. Without `--install` it opens no connection and fetches nothing. With `--install`, an absent or incomplete install causes both packages to be installed from the lockfile before the survey returns. Another installed version of either package is refused, including when installation was authorized; it is never silently accepted or replaced. `--set` is refused on `check`.

### Usage

| Command | Purpose | Writes |
|---------|---------|--------|
| `node scripts/icon-set.js check help` | Print usage | Nothing |
| `node scripts/icon-set.js check` | Survey both local packages | Nothing |
| `node scripts/icon-set.js check --install` | Install if needed, then survey | The install's writes |

| Option | Effect | Default |
|--------|--------|---------|
| `--install` | Authorize installing Phosphor 2.1.1 and Health 2.0.0 through the lockfile | Off |
| `--help`, `-h` | Print usage | Off |

### Output

One JSON object, exit 0 for ready, absent or incomplete packages. A wrong version or unreadable manifest is an error, exit 1. Each probe checks the manifest's name, version and MIT licence declaration, a readable valid catalog and licence, and one known asset per weight: Phosphor's `person-simple` in all six weights and Health's `people/doctor` in `filled` and `outline`.

| Field | Carries |
|-------|---------|
| `packages` | Separate `phosphor` and `health` objects, each with the fields below; top-level Phosphor fields are retained for existing callers |
| `package`, `requiredVersion` | `@phosphor-icons/core`, `2.1.1`, or `healthicons`, `2.0.0` |
| `state` | `ready`, `absent` or `incomplete` |
| `installed` | Whether this pinned package passed the probe |
| `version` | The installed version, or null when absent |
| `missing` | Files missing from an incomplete install; empty when ready |
| `remediation` | The install command when the package is absent or incomplete |

## search

Search the selected local catalog. All query words must match, case-insensitively, across Phosphor's name, tags and categories, or Health's metadata `id`, `title`, `tags` and `category`. Whole-name matches rank above name segments, then name substrings, then exact other fields, then their substrings. Health name segments include underscores as well as hyphens. Scores add across words; ties sort by name. Health tags starting with `dhis2:` are neither returned nor matched. Results default to 20; no matches is an empty list.

### Usage

| Command | Purpose | Writes |
|---------|---------|--------|
| `node scripts/icon-set.js search help` | Print usage | Nothing |
| `node scripts/icon-set.js search --query "person walking" --limit 5` | Return the best catalog matches | Only an authorized install, if needed |
| `node scripts/icon-set.js search --set health --query nurse --limit 5` | Find Health people and health subjects | Only an authorized install, if needed |

| Option | Effect | Default |
|--------|--------|---------|
| `--query <words>` | Non-empty words to match; quote several words | Required |
| `--set <phosphor\|health>` | Choose the pinned catalog; unknown or duplicated values refused before installation | `phosphor` |
| `--limit <n>` | Positive whole number of results | 20 |
| `--install` | Authorize a missing package's install and finish searching | Off |
| `--help`, `-h` | Print usage | Off |

### Output

One JSON object with the fields below. Scores and package internals are not returned.

| Field | Carries |
|-------|---------|
| `results` | Best matches first: Phosphor `{name, tags, categories}`; Health `{name, path, title, category, tags, weights}`, where `name` is metadata `id`, `path` is `<category>/<id>` (what `get --name` takes when an id is in two categories) and `weights` is `["filled", "outline"]` |
| `license` | The selected set's record line from the Licence paragraph, with copyright read from its installed `LICENSE` |

## get

Write one icon at the caller's size and colours. Every source `currentColor`, and every fill or stroke drawing in the source's single colour, becomes `--color`. A `none` paint stays `none`. The default colour is `currentColor`, so the caller can let the drawing's inherited colour decide it.

For Phosphor duotone, a background path is identified by its partial source opacity. With `--accent`, that path becomes the accent colour and its opacity attributes are removed. Without `--accent`, it uses `--color` at its source opacity; the JSON explicitly reports that default. An accent on another weight or on Health is refused.

Without `--fragment`, the file is a complete SVG with `width` and `height` equal to `--size`, the package's `viewBox`, `role="img"` and a `<title>` naming the icon. With `--fragment`, the file contains exactly one nested `<svg>` element to paste inside the drawing: `x`, `y`, `width`, `height`, the same `viewBox`, `aria-hidden="true"` and optional `class`. It has no document wrapper or title. Neither form contains a transform, script, external reference or id. Unexpected source elements or attributes are refused rather than carried into the drawing.

Both forms carry `data-icon="phosphor:<name>:<weight>:2.1.1"` or `data-icon="health:<name>:<weight>:2.0.0"`, `<name>` as `--name` gave it on the outer element. The package's paths remain at their original coordinates; the nested SVG's viewport positions and sizes them without transforms. Health's `fill-rule` and `clip-rule` are preserved. A missing asset is refused. Six Health ids occur in multiple categories; `get` refuses those ambiguous names instead of choosing one silently.

### Usage

| Command | Purpose | Writes |
|---------|---------|--------|
| `node scripts/icon-set.js get help` | Print usage | Nothing |
| `node scripts/icon-set.js get --name person-simple --weight fill --size 48 --color '#123abc' --output /path/to/work/person.svg` | Write a standalone icon | Exactly `--output` |
| `node scripts/icon-set.js get --set health --name doctor --weight filled --size 48 --color '#123abc' --output /path/to/work/doctor.svg` | Write a Health icon | Exactly `--output` |
| `node scripts/icon-set.js get --name person-simple --weight duotone --size 24 --color '#223344' --accent '#ccddee' --fragment --x 30 --y 50 --class screen-glyph --output /path/to/work/fragment.svg` | Write a fragment for a drawing | Exactly `--output` |

| Option | Effect | Default |
|--------|--------|---------|
| `--name <icon>` | Exact catalog name; for Health, the id or `<category>/<id>`, which settles an id two categories share. Unknown names report the three nearest by edit distance, ties by name | Required |
| `--set <phosphor\|health>` | Choose the pinned set; unknown or duplicated values refused before installation | `phosphor` |
| `--weight <weight>` | Phosphor: `thin`, `light`, `regular`, `bold`, `fill`, `duotone`; Health: `filled`, `outline`. A weight absent from the set is refused, naming its supported weights | Required |
| `--size <n>` | Positive finite number, width and height in pixels, without units | Required |
| `--output <path>` | Absolute file path outside this tool, unoccupied, with an existing parent | Required |
| `--color <css colour>` | Foreground CSS colour: word, hex, colour function or `var(--name)`; URLs and markup refused | `currentColor` |
| `--accent <css colour>` | Phosphor duotone background colour, with source opacity removed; refused for Health | `--color` at source opacity |
| `--fragment` | Emit one nested SVG for a drawing | Off; complete SVG |
| `--x <n>` | Finite horizontal coordinate without units; requires `--fragment` | Required with fragment |
| `--y <n>` | Finite vertical coordinate without units; requires `--fragment` | Required with fragment |
| `--class <name>` | One CSS class on the outer SVG | Omitted |
| `--install` | Authorize a missing package's install and finish writing | Off |
| `--help`, `-h` | Print usage | Off |

### Output

One JSON object on stdout after the file is written, exit 0.

| Field | Carries |
|-------|---------|
| `output` | The resolved absolute file path written |
| `name`, `weight`, `size`, `fragment`, `color` | The icon and rendering options used |
| `background` | Null for other weights; for duotone, `color`, `opacity` (1 or `source`), `sourceOpacities` and an explicit default or accent `note` |
| `license` | The selected set's record line from the Licence paragraph, with copyright read from its installed `LICENSE` |

## Troubleshooting

Shared stops are in `tools/RUNNING.md`.

| Message | Cause | Fix |
|---------|-------|-----|
| `@phosphor-icons/core@2.1.1 is absent` | No local package | Run `node scripts/icon-set.js check --install`, or add `--install` to the original command |
| `healthicons@2.0.0 is absent` | No local Health package | Run the same install check, or add `--install` to the original command |
| `must be exactly 2.1.1` or `must be exactly 2.0.0` | Another installed version | Remove this tool's `node_modules/`, then run `node scripts/icon-set.js check --install` |
| `incomplete`, missing SVG or unreadable catalog/licence | Interrupted or damaged install | Remove this tool's `node_modules/`, then run the same install check |
| `npm ci failed` | Node version, write permission or manifest/lockfile mismatch | Confirm Node 18 or newer, a writable tool directory and matching shipped manifests; retry the install check |
| `unknown icon` | Name is absent from the pinned set | Choose one of the three nearest names or run `search` |
| `unknown set`, repeated `--set`, or unknown option on `check` | Set is invalid, duplicated or used on a subcommand that does not accept it | Pass `--set phosphor` or `--set health` once, on `search` or `get` only |
| `unknown weight` | Weight is absent from the selected set | Pass a `--weight` named in the refusal; `fill` belongs to Phosphor, `filled` and `outline` to Health |
| `ambiguous health icon` | Metadata repeats the id in more than one category (six ids, `diabetes` among them) | Pass `--name <category>/<id>`, as the refusal and `search`'s `path` give it |
| `--output already exists` | Destination is occupied | Choose a free path; this tool replaces no file |
| `--output parent must be an existing directory` | Destination's parent is absent | Create the caller's work directory before running `get` |
| `--accent requires --weight duotone and --set phosphor` | Accent would not apply | Select Phosphor duotone or omit the accent |
| `unexpected SVG` | Source contains an element or attribute outside the pinned path-only formats | Restore the pinned package with the install check; transforms, ids, scripts and external references are refused |
| `--x` or `--y` requires a value or fragment | Fragment coordinates are incomplete or used on a standalone SVG | Pass `--fragment --x <n> --y <n>` together |
