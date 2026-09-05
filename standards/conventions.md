---
standard: conventions
version: 0.1.1
description: The cross-cutting conventions every file and agent in a Wiser workspace follows: formatting, dates, portable names, working files, root layout, archives, sourcing, and evidence labels
---

# Conventions

These rules bind every file in this root and every agent working in a workspace that composes it.

Division of labor: how instructions are written belongs to `instruction-quality.md`; the Play and Playbook formats, including the file naming specific to each, belong to `play.md` and `playbook.md`. Cite those standards; do not restate them here.

Precedence: a user root's AGENTS.md may localize placement, naming its own work directories and archive home. It may not lift the formatting, date, or naming rules; those hold everywhere.

## Formatting

Applies both to prose written in a response and to the files you author.

- No em dashes and no en dashes. Use a comma, a semicolon, or a period; for a range, use "to". The hyphen is the only dash this system uses.
- No emojis, anywhere.
- No horizontal rules in markdown; structure with headings. A frontmatter delimiter is not a horizontal rule.

## Dates

Absolute only, `YYYY-MM-DD`, in prose, filenames, logs, and frontmatter; never relative. When a source states a date relatively, resolve it to an absolute date before writing it down; if you cannot, ask. The archive prefix below is the single exception.

## Names

Every file and directory name must survive case-insensitive filesystems and drive-sync platforms (APFS, OneDrive, Google Drive, Windows).

- **Allowed:** letters, digits, spaces, hyphens, underscores, periods.
- **Forbidden:** `<` `>` `:` `"` `/` `\` `|` `?` `*` and control characters. A source title carrying one gets it replaced with a hyphen or dropped, never reproduced.
- **Edges:** no leading or trailing space; no trailing period; no leading period. Host adapter files and repository or sync machinery that require one (`.cursor/`, `.windsurf/`, `.gitignore`, `.stignore`, `.gitkeep`) ship with the root and are the exception.
- **Case:** no two names in the same tree may differ only by case.
- **Encoding:** prefer plain ASCII. When an accented character is unavoidable, write it in NFC form; platforms disagree on normalization, and mixed forms turn one file into two.
- **Reserved:** the Windows device names CON, PRN, AUX, NUL, COM1 to COM9, and LPT1 to LPT9 are forbidden, with or without an extension.
- **Length:** the full path from the root's top level stays under 180 characters; assume the deploy destination adds its own prefix.

A name that already violates these rules: report it; do not rename on sight, names have consumers.

## Working Files

Intermediate outputs (drafts, scratch analysis, generated data, logs) go to the active work directory in the owning root; the root's AGENTS.md declares which directories those are, and Root Layout below governs where a file sits inside one. Quick captures with no home yet go to that root's `inbox/`.

Where a write is forbidden outright, the top level of any root and a composed shared root in use, the constitution's Irreversibles states the rule and the one exception to it. If no declared work directory fits, ask; do not invent one. A root missing its declared `inbox/` or archive directory gets it created there; creating a declared home is not inventing a location.

## Root Layout

Beneath a declared directory, the next tier is subject folders: one per project, engagement, or standing topic, each named for its subject, the body of work inside this root, never the root's own name. A file and its drafts sit together in their subject folder, never loose beneath the declared directory.

A subject folder that holds folders of its own, or has outgrown a quick scan, carries its own AGENTS.md naming what it holds and where its parts sit. The constitution's chain reaches it with no further declaration.

Directories whose structure another standard already fixes are exempt:

- `skills/`, `experts/`, and `tools/` are flat: `standards/primitives.md`. A client root does not ship these; the primitives live in a plugin root, and this one carries skills, experts, and tools.
- `plays/` and `playbooks/` hold files in their own formats when those directories exist: `standards/play.md` and `standards/playbook.md`. A root's AGENTS.md may place those files in `work/<subject>/` instead, and then this exemption does not apply: the subject folder's AGENTS.md names them.
- `memory/` holds the files the root's Provides block binds.
- `inbox/` holds captures with no subject yet, per Working Files above; a capture whose subject becomes known moves to that subject's folder. `zArchive/` follows Archives, below.

**The two-hop test:** in every directory that takes subject folders, a file is findable in two hops: the root's declared-directory table names the directory, and the subject folder names the work; parts deeper than that are named by the subject folder's own AGENTS.md. A file that cannot be found that way is misfiled.

## Archives

Before deleting a file or rewriting it substantially, copy it to a `zArchive/` directory in the same directory as the file, unless the owning root's AGENTS.md declares a different archive home or declares git history as its recovery path. Only a repository that is committed and current counts.

The archive name is the date, a space, V with the version number, then " - " and the file's original name and extension unchanged. Numbering starts at 1 and resets each day:

```
26-07-25 V1 - competitors.md
```

The `YY-MM-DD` prefix is the one deliberate exception to the date format above; it is inherited convention and existing archives sort by it. Everywhere else, `YYYY-MM-DD`.

## Sourcing Registers

Any quote, or any fact about a person, that enters a file carries its source and that source's register:

- **Public statement:** said or published on the record. Cite where.
- **Firsthand:** heard or observed directly by someone in this workspace. Name who.
- **Secondhand:** relayed by another person. Name the relay.
- **Research inference:** derived rather than stated. Say what it was derived from.

Hedges travel with the content: a "likely", an "appears to", or an "as of 2026-05" is never dropped when a claim moves between files. Restating a hedged claim as fact is a fabrication, not a summary. A person-fact with no source and no register does not enter the file; find the source or drop the claim.

Durable claims about anything else (an organization, a market, a product) carry the lighter form: name the source, or mark the claim unverified.

## Evidence Labels

Sourcing registers say where a claim came from; evidence labels say how much checking stands behind it, and what to write when a reading never arrived. They govern the figures, readings, and checkable claims an output states. Which of its outputs carry which labels is each primitive's own declaration, and an output format may name its own sections for them; the definitions live only here.

An unlabeled figure asserts it was measured: taken from its source by the process delivering it. Everything else carries its label in place, exactly where the reading would have appeared, never only in a footnote.

| Label | Meaning |
|-------|---------|
| `Verified` | reported, then checked against a source that confirms it, by a check that actually ran |
| `Estimated: <method>` | derived by judgment rather than measured, the method saying how; a by-eye read is `Estimated: manual review` |
| `Unverified: requires confirmation` | supplied by another party (a requester, a document, a generated answer) and not confirmed: unchecked, uncheckable, or checked and not borne out |
| `Not available: <reason>` | not obtained; the reason names which absence it was: the source is not composed in the workspace, the credential lacks permission, nothing returned for the window, or quota ran out |

**Never fabricate.** A value the evidence did not supply is never invented and never filled with text that looks like an answer: it is asked for, marked as what it is (an estimate, an inference, a hypothetical), or dropped, and a reading that did not arrive is labeled `Not available` with its reason.

**Nothing rises unchecked.** No claim is marked `Verified` without the check having run, and no confirming source is named that the check did not return.

**Labels travel.** Like the hedges above, a label moves with its figure between files and between periods; a figure carried forward without its label and its date becomes a measurement nobody took.
