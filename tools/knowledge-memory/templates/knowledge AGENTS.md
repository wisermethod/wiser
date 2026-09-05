# Knowledge

This root's knowledge sets: bodies of knowledge built once from named sources, confirmed by a named person, kept accurate by review, and queried with provenance. The composed Wiser root's `experts/Memory Expert/`, `skills/Knowledge Set Onboarding/`, `skills/Knowledge Curation/`, and `skills/Knowledge Recall/` are the only things that write here, through `tools/knowledge-memory/`.

**Store:** `store/`, this root's Cognee stores, one per root and never shared with another root. Ignored by git and by drive sync; it is rebuilt from the sets below with `Knowledge Curation`'s rebuild path, so it is never the thing to back up. The sets are.

## Sets

| Set | Dataset | Kind | Owner | Canon confirmed | Last ingest |
|-----|---------|------|-------|-----------------|-------------|

## What a set holds

| Path | Holds |
|------|-------|
| `<set>/set.yaml` | The recipe: sources, pack, node sets, consent, confirmation, cadence, policies |
| `<set>/canon.md` | The confirmed canonical ideas and entities, each with its definition, status, and a quote from the corpus that grounds it |
| `<set>/corpus/` | The sources, as received. On a client root these may be pointers into `sources/` rather than copies |
| `<set>/eval.questions.yaml` | The questions the set must answer to count as built |
| `<set>/review/` | `new_findings/`, `stale/`, `merge_proposals/`, `conflicts/` written by the review pass; `decided/` holding what a human decided, replayed after every rebuild; `changelog.md` written by promote |
| `<set>/reports/` | Ingest reports, healthchecks, and the onboarding run record |
| `<set>/pack/` | Only where the set carries its own extraction pack rather than the tool's `general` pack |

## Rules that hold here

- Nothing is promoted from Candidate to Canonical, merged, or deleted except by a human decision the tool applies: an item under `review/decided/`, or the confirmed `canon.md`, whose entries `promote --from-canon` turns into decided items carrying the confirmer's name and date. A rebuild replays those items.
- A set whose `canon_confirmed` is blank is usable and its answers carry `Unverified: requires confirmation`.
- A set's corpus is sent to the model provider named in its recipe during ingest. `provider_consent` records who agreed and when; an ingest with it blank is refused.
- Two sets in this store are separate datasets and recall is always scoped to one. Material from another root never enters this store.
