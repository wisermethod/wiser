# Onboarding records

Working artifacts from creating this root. Downstream work does not load these; the bound files in `memory/` are what it loads.

| File or folder | Holds |
|----------------|-------|
| `run-record.md` | Tier, branch, consent, competitors-offer answer, interview answers, per-key close states |
| `extraction/` | One record per source: complete text, completeness measure, provenance block, whole tables, must-reach list |
| `evidence/` | One package per research angle |
| `draft/` | Per bound file, the sentences intended for `memory/`, written in the form they will take; what Phase 3 verifies and Phase 4 copies from |
| `verification.md` | Every claim, the check, the mechanism, the outcome |
| `audit.md` | Brief, findings, disposition of each with its deciding check, disputes |
| `close-report.md` | What tier ran, what was not done, the per-key close states, and every gate that failed |

The living list of open actions is not here. It is `todos/current.md`. This folder is the evidence pack from creating the root: extracts, packages, drafts, verification, audit, close report. Do not delete it at close.

This folder is the working area the onboarding process names, except the operating file, which is the todo list and lives where a later session will actually look for it.

## The record grammars

These records are read by the close gates, which parse them by key line and by column position. The shapes below are the contract. A record written in a different shape is not a stricter record, it is an unreadable one, and the gate that depends on it cannot run.

Three grammars carry the weight, and they hold inside the bound files under `memory/` as well as here.

**The prompt line.** A whole line that begins with `*` and ends with `*`. Every one is replaced before a key can close.

**The placeholder tokens.** Exactly two: the word name in square brackets, and the word Competitor in square brackets. Both are defined literally in the preamble of `memory/about.md`, and none may survive instantiation.

**The verification anchor.** A load-bearing claim in a bound file ends with a bracketed row id naming its row in `verification.md`, written as `[V<n>]` with the row's number in place of `<n>`: row 7 is anchored as V7 in that form. An anchor written after a full stop belongs to the sentence before it. A key line carrying a date, a count, or any other checkable value takes an anchor too.

Two further written forms:

**Evidence labels** are written in square brackets, in place: `[Verified]`, `[Estimated: <method>]`, `[Unverified: requires confirmation]`, `[Not available: <reason>]`. `standards/conventions.md` owns the four meanings; the brackets are only the written form. The set is closed at four.

**Registers** are written as a parenthetical naming the payload the register requires: `(Firsthand: <person who observed it>)`, `(Secondhand: relayed by <person>)`, `(Public statement: <where>)`, `(Research inference: E3, E11)`. A disputed claim carries `(Disputed: audit.md A4)`, which is a register-shaped parenthetical and deliberately not a fifth evidence label.

**A figures heading is marked.** A heading whose body is a table of figures carries the marker `<!-- figures -->` on the heading line or on the line under it. `memory/about.md` ships that marker under Key Facts, and its table ships the header row `| Figure | Unit | Denominator | Tool | Window | Label | Source |`.

### `run-record.md`

Key lines, one per line, at the top of the file:

```
type: client
name: <the real name>
destination: <absolute path>
tier: full | core
research-branch: research-first | interview-first | no-research
consent: <the answer, or "not-applicable: <reason>">
competitors-offer: yes | not-now | no | not-offered: <type>
```

Then:

```
## Copy vantages
vantage-1: <mechanism> -> <n> files
vantage-2: <mechanism> -> <n> files

## Interview
### What was bought
### Who confirms and on what basis
### Contradictions
### What the outputs are for
### Competitor set

## Per-key close
about: complete | provisional | blocked
voice: complete | provisional | blocked
design: complete | provisional | blocked
competitors: complete | provisional | blocked | unbound
```

Under each `## Interview` heading: the answer, or a line beginning `Deferred:` followed by the consequence. `### What the outputs are for` may not be deferred, because the routing table in `memory/voice.md` carries a row for every output type named there, and it is written as a dash list with **one output type per line**. G13b reads it as a list and checks the routing table row by row against it; answered as a sentence, the split produces fragments that are not output types and reports each as an unrouted deliverable. `### Competitor set` is present only when `competitors-offer: yes`.

### `extraction/<source>.md`

```
source: sources/<file>
extract-mechanism: <name>
extract-measure: <n> <unit>
check-mechanism: <name>
check-measure: <n> <unit>
provenance-author: subject | requester | third-party | unattributed
provenance-status: final | draft
provenance-date: YYYY-MM-DD
provenance-audience: internal | client-facing
```

The two measures carry equal leading numbers and are taken by different mechanisms; a completeness claim measured by the mechanism that did the extracting proves nothing.

Then the must-reach list, which is the forward check from source to memory:

```
## Must-reach list

| Item | Kind | Text | Disposition | Where |
|------|------|------|-------------|-------|
```

`Kind` is one of `prohibition`, `compliance`, `commercial`, `person`, `review-note`.
`Disposition` is one of `in-bound-file`, `in-operating-file`.
A row of kind `prohibition` or `compliance` may only be `in-bound-file`: downstream work loads bound files and does not load the todo list, so a constraint routed to `todos/current.md` is a constraint nothing reads.
`Where` is `<path>#<anchor or heading>` for `in-bound-file`, or `todos/current.md O<n>` for `in-operating-file`.

An item is never disposed of as absent from the source. The list is drawn from the source, so "none found" and "not present in source" are contradictions, not dispositions.

### `evidence/<angle>.md`

```
angle: <name>
retrieval-mechanism: <tool>, <what it does to content>

## Quotations
| Row | Quote | URL | Retrieved |

## Values
| Row | Value | File | Line |

## Not retrieved
| Item | Reason |

## Spot checks
| Row | Check | Outcome |
```

Row ids match `E<n>` and are unique across all packages in the run. Quotation rows carry a URL and a YYYY-MM-DD date; value rows carry a file and a line number. `## Spot checks` carries three rows, each naming the check that ran and its outcome.

A package whose angle is the competitive set carries one further table:

```
## Suggested names
| Name | Source | Retrieved | Why suggested |
```

### `verification.md`

```
## Claims

| Row | Key | Class | Claim | Anchor | Bound file | Cites | Mechanism | Exactness | Second mechanism | Outcome | Label | Search |

## Negative claims

| Row | Claim | Anchor | Containers searched | All containers | Second reader | Outcome |
```

`Row` matches `V<n>` and is unique across both tables.
`Key` is `about`, `voice`, `design`, `competitors`, or `none`.
`Class` is one of `what-was-bought`, `who-confirms`, `hard-constraints`, `register-decision`, `register-confirmation`, `design-source`, `set`, `set-confirmed-by`, `set-date`, `other`.
`Anchor` is the bracketed row id as it appears in the bound file, or `-` when the claim did not enter a bound file.
`Exactness` is `yes` for any claim about wording, length, completeness, extent, a count, or a file comparison; `no` otherwise. An exactness claim carries a second mechanism different from the first, or it is labeled Unverified.
`Outcome` is `located`, `located-elsewhere-and-citation-corrected`, or `not-located`.
`Label` is one of the four labels' first words (`Verified`, `Estimated`, `Unverified`, `Not available`) or `-`.
`Search` is the search string actually run; required when `Outcome` is `not-located`.
`All containers` is `yes` or `no`. `Second reader` names a person or an agent, or `-`.

The two tables join by `Anchor`, not by `Row`, because row ids are unique across both and therefore cannot join them.

### `audit.md`

```
independent-context: yes | no
reviewers: <what ran, by name or type>
rounds: <n>

## Findings

| Finding | Claim | Disposition | Deciding check | Where checker looked | Bound file entry |
```

`Finding` matches `A<n>`. `Disposition` is `accepted`, `rejected`, or `disputed`. A rejected finding says where the checker looked. A disputed finding names the bound file entry that carries its `(Disputed: ...)` parenthetical. An audit's findings are claims, and they are checked before anything is edited on their account.

### `todos/current.md`

The operating file. Onboarding writes it; later sessions keep it. Grammar:

```
| Item | Gap | Owner | Status | Blocker | Attempt | Result and date |
```

`Item` matches `O<n>`.
`Owner` is a named person or a named role. "the requester", "the client", "TBD", "whoever asked", and an empty cell all fail.
`Status` is `gating`, `blocking`, `needed`, or `done`.
`Blocker` matches `person: <who>`, `credential: <which>`, or `capability: <what>` for `gating` and `blocking` rows, and is `-` otherwise. A category with no name after it is not a blocker.
`Attempt` records the attempt that established the blocker; required for `gating` and `blocking`.
`Result and date` is required for `done` rows and carries a YYYY-MM-DD date.

### `close-report.md`

Prose, under these headings, each non-empty: `## Tier`, `## Type and scope`, `## Destination`, `## Per-key close`, `## Open headings`, `## Gates that failed`, `## Audit disposition`, `## Outstanding`.
