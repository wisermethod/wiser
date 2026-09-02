---
name: sitemap-diff
type: tool
category: seo
description: One JSON report of what changed between two sitemap snapshots of the same site, naming the URLs added, the URLs removed, the URLs whose lastmod moved, and the path segments that are new
version: 0.1.1
---

# sitemap-diff

One JSON object naming what changed between two dated snapshots of one site's sitemap: the URLs added, the URLs removed, the URLs whose `lastmod` moved, and the path segments that did not exist before.

## Context

Use it whenever the question is what a site published, retired, or revised between two points in time: tracking a competitor's output month over month, confirming what a migration actually moved, checking whether pages a client says shipped are in the sitemap, or finding the sections a site has started building that it did not have before. Its result is the authoritative change list, computed rather than estimated: a change list read off sitemap XML by eye is the highest fabrication risk in competitive work, and this tool exists so that no caller has to.

Do not use it to fetch or refresh a sitemap; that is the `sitemap-fetch` tool, which produces the snapshots this one reads. Do not reach for it on a first run: one snapshot has nothing to compare against, and the answer is to keep it as the baseline and diff the next one against it. Do not expect judgment from it. It reports what moved, never what the movement means: which changes matter, how a competitor's pattern reads, and what to do about it belong to the skill or expert that called it.

It compares one site with its earlier self. Snapshots of two different sites are a caller mistake rather than a comparison, and a run whose snapshots name different domains says so in its result and still reports every URL on one side as added and every URL on the other as removed.

It authenticates to nothing, holds no credential, reaches no other primitive, and makes no network request. It reads the two files the caller names, and writes only the one file `--output` names.

## Input Snapshots

Each input is one JSON object holding a `urls` array. These are the fields this tool reads; anything else in the snapshot is ignored, and a snapshot written by `sitemap-fetch` carries them already.

| Field | Required | Read for |
|-------|----------|----------|
| `urls` | Yes | The array of entries to compare; a file without it is not a snapshot |
| `urls[].loc` | Yes | The URL itself, which is the identity a comparison is made on |
| `urls[].lastmod` | No | The `changedLastmod` list |
| `urls[].segment` | No | The `newPathSegments` list, which reports first path segments not seen before |
| `domain` | No | Labelling the result, and detecting a mismatched pair |
| `fetchedAt` | No | The `previousDate` and `currentDate` the result reports |
| `truncated` | No | The `sourceIncomplete` field, when it is true |
| `errors` | No | The `sourceIncomplete` field, when it is a non-empty array |

A snapshot can be honestly incomplete. `sitemap-fetch` exits 0 on a partial walk, setting `truncated` when a cap stopped it and listing every sitemap that failed in `errors`, because a partial answer with its gaps named is still an answer. Diffed against a complete snapshot, the URLs that run never collected read as removals. This tool reports that rather than refusing it: `sourceIncomplete` names the side and the reason, the diff is still computed, and the run still exits 0.

Three behaviors follow from comparing on `loc` alone:

- A snapshot that lists the same URL twice contributes it once, and the totals count URLs compared rather than lines read.
- A URL is reported in `changedLastmod` only when both snapshots carry a `lastmod` for it and the two differ. One that gains or loses the field is not a content change; a site that starts or stops publishing `lastmod` would otherwise read as having revised every page at once.
- A snapshot whose entries lack `segment` produces an empty `newPathSegments`, and the rest of the diff is unaffected.

## Quick Start

```bash
node scripts/sitemap-diff.js help
```

Usage text, with nothing installed and nothing configured.

```bash
node scripts/sitemap-diff.js diff \
  --previous /path/to/a/work/directory/sitemap-example.com-2026-04-01.json \
  --current /path/to/a/work/directory/sitemap-example.com-2026-05-01.json
```

One JSON object on stdout:

```
{"domain":"example.com","previousDate":"2026-04-01","currentDate":"2026-05-01","domainMismatch":null,"addedUrls":["https://example.com/compare/a-vs-b","https://example.com/tools/calculator"],"removedUrls":["https://example.com/guide/two"],"changedLastmod":[{"loc":"https://example.com/pricing","from":"2026-02-01","to":"2026-04-20"}],"newPathSegments":["compare","tools"],"counts":{"previousTotal":4,"currentTotal":5,"added":2,"removed":1,"lastmodChanged":1,"newSegments":2},"outputPath":null}
```

Anything else, see Troubleshooting.

## Usage

| Command | Purpose | Needs configuration |
|---------|---------|---------------------|
| `node scripts/sitemap-diff.js help` | Print usage and exit | No |
| `node scripts/sitemap-diff.js diff --previous <path> --current <path>` | Compare the two snapshots and report what changed | No |

Options:

| Option | Effect | Default |
|--------|--------|---------|
| `--previous <path>` | The earlier snapshot, an absolute path | None; required |
| `--current <path>` | The later snapshot, an absolute path | None; required |
| `--output <path>` | Also write the result to this file, an absolute path outside this tool directory | None; stdout only |
| `--pretty` | Indent the JSON, for a diff a person will read | Off |
| `--help`, `-h` | Print usage and exit | Off |

The two snapshots are named rather than ordered, because which one is earlier is the whole meaning of `added` and `removed`; a pair passed the wrong way round would invert the report silently. Both paths are absolute: a relative path resolves against whatever directory the caller happened to be in, which is not a property a saved report should depend on.

This tool needs no credentials and no configuration file, so no command takes `--env` and nothing here resolves a Provides binding.

## Script Contract

The script in this tool follows `system/templates/Script Contract.md`: self-contained imports, help answered before anything is opened, the stdout and stderr rules, and the refusal of an output path inside this tool's own directory. It imports no package and reads no configuration file, so that contract's dependency check and `--env` clauses have nothing to bind here, and the tool carries no Dependencies section because Node is all it needs. The sections above state what the command does; the contract states how the script behaves getting there.

Both path options can be pointed at any file on the machine, including one holding credentials, so no failure message repeats a byte of what was read: a file that is not JSON, or is JSON but not a snapshot, is named by path and by what was wrong with it, never quoted.

## Output

One JSON object on stdout, exit 0.

| Field | Carries |
|-------|---------|
| `domain` | The domain the snapshots name, the current one preferred, or null when neither carries one |
| `previousDate`, `currentDate` | Each snapshot's `fetchedAt`, or null, which is what dates the report |
| `domainMismatch` | Null when the pair agrees; otherwise both domains, marking the result as a comparison of two different sites |
| `sourceIncomplete` | Present only when a snapshot says it is partial: `side`, which is `previous`, `current`, or `both`, and for each affected side the reasons, `truncated`, `errors`, or both |
| `addedUrls` | URLs in the current snapshot and not the previous one, sorted |
| `removedUrls` | URLs in the previous snapshot and not the current one, sorted |
| `changedLastmod` | One entry per URL whose `lastmod` moved, with its `loc`, `from`, and `to`, sorted by `loc` |
| `newPathSegments` | First path segments that appear only among the added URLs, sorted |
| `counts` | `previousTotal`, `currentTotal`, `added`, `removed`, `lastmodChanged`, and `newSegments` |
| `outputPath` | Where the result was also written, or null when it was only printed |

Every other field is always present, so a pair of complete snapshots yields exactly the shape callers already read; test for the `sourceIncomplete` key rather than for a null.

The same pair of snapshots always produces the same bytes: every list is sorted and nothing in the result is read from the clock. Two snapshots that differ in no URL and no `lastmod` produce empty lists and zero counts, which is a result and not a failure; the run still exits 0.

A file is written only when `--output` is given, and the file holds the same object that goes to stdout. `Script Contract.md` governs where that path may point: a work directory in the owning root, never inside this tool.

## Troubleshooting

| Message | Cause | Fix |
|---------|-------|-----|
| `Error: --previous is required.` | The command ran with only one snapshot, or with none | Pass both, the earlier as `--previous` and the later as `--current` |
| `Error: --current is required.` | Same, the other way round | Pass both |
| `Error: --previous must be an absolute path` | A relative path was passed | Pass the full path the work directory resolves to |
| `Error: could not read the previous snapshot <path>: no file at that path` | The path is wrong, or the snapshot was never written | Check the path; list the snapshot directory and pass a file that is there |
| `Error: the current snapshot <path> is not valid JSON.` | The file is not JSON, usually a truncated write or the wrong file entirely | Re-fetch the snapshot with `sitemap-fetch`; the file's own content is not quoted back, so open it to see what it is |
| `Error: the previous snapshot <path> carries no urls array` | A JSON file that is not a sitemap snapshot | Pass a snapshot written by `sitemap-fetch`, not a report or a config file |
| `Error: the current snapshot <path> has N url entries with no loc string` | The snapshot is partial or hand-edited | Re-fetch it; diffing it would report the entries with no URL as removals |
| `Error: --output resolves inside this tool directory` | The output path resolved inside this tool's own directory, which is the one place it may never write | Pass a path in a work directory in the owning root |
| `Error: --output names a directory that does not exist` | The parent directory was never created, or the path has a typo | Create the work directory, or fix the path |
| `Error: unknown command` | A command word other than `diff` | Run `help` |
| `Error: unknown option "<flag>"` | A misspelled or invented flag | Check `help`; the flag was refused rather than ignored |
| `domainMismatch` is populated | Two different sites were compared | Re-run with two snapshots of the same site; the lists in this result describe two sites, not one site's change |
| A routine re-fetch reports removals in the thousands | The current snapshot is partial: a cap stopped the walk, or a sitemap failed to read, so URLs that still exist were never collected | Check `sourceIncomplete`. Named there, those removals are a gap in the fetch and not pages the site retired; re-fetch with a higher `--max`, or once the failing sitemap reads, then diff again |
| Every URL reports as added and removed | The snapshots come from different sites, or one site changed protocol or host and every `loc` changed with it | Check `domainMismatch` and the `loc` values; a host or protocol move is a real change, and the pair before it is not comparable |
| `changedLastmod` is empty on a site that plainly republished | One or both snapshots carry no `lastmod` for those URLs | Confirm the sitemap publishes `lastmod`; without it on both sides, revisions are invisible to a sitemap diff |
| `newPathSegments` is empty while `addedUrls` is not | The snapshots carry no `segment`, or the new URLs sit under sections that already existed | Both are normal; read `addedUrls` for the detail |

## Success

- `help` prints usage to stdout and exits 0 on a copy with nothing installed and nothing configured.
- `diff` over two readable snapshots exits 0 with one parseable JSON object on stdout, and re-running the same pair prints the same bytes.
- A URL only in the current snapshot appears in `addedUrls`, one only in the previous appears in `removedUrls`, one whose `lastmod` moved on both sides appears in `changedLastmod`, and a first path segment new to the added URLs appears in `newPathSegments`.
- Either path option omitted, or a snapshot that is missing, unparseable, or not a snapshot, exits 1 naming the cause on stderr with stdout empty, and no message quotes the file's content.
- An `--output` path that is relative, that resolves inside this tool directory, or whose parent directory does not exist is refused before either snapshot is read.
- A snapshot carrying `truncated` or a non-empty `errors` still diffs and still exits 0, with `sourceIncomplete` naming the side and the reason; a pair of complete snapshots carries no `sourceIncomplete` key at all.
- No run reads a credential, opens a network connection, reads stdin, or writes any file other than the one `--output` names.
