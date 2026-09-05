---
name: knowledge-memory
type: tool
category: knowledge
description: Builds, queries, reviews, and rebuilds one owning root's knowledge sets in an embedded Cognee store, ingesting a recipe's sources under an extraction pack, recalling from one dataset with provenance, and writing review items a human decides
version: 0.1.0
memory:
  - "secrets:openai"
gaps:
  - fully local extraction and embedding with no hosted model, so a corpus that may not leave the machine cannot be built
  - temporal filtering of recall by a date, so an as-of question is answered from the facts the set dates rather than filtered by the engine
---

# knowledge-memory

One command per job on one knowledge set: ingest its sources into its dataset, recall from that dataset alone, write the review items its graph has earned, apply a decision a human recorded, mark a node stale, report its health and run its eval, or forget what it holds. The store is the owning root's and the tool never chooses where it is.

## Context

Use it through `skills/Knowledge Set Onboarding/`, `skills/Knowledge Curation/`, and `skills/Knowledge Recall/`, which decide what to ingest, what a review item deserves, and how an answer is labeled. Called directly it does exactly what its flags say and judges nothing: it does not decide whether a source belongs to a set, whether a Candidate is Canonical, or whether an answer is good enough to ship.

Do not use it to build a knowledge map of files that already sit in a workspace with no setup; that is `skills/Knowledge Management/`, which invents nothing and needs no store. Do not use it as a general search over a workspace; every recall is scoped to one dataset, and a query that wants "everything" is refused by the absence of any flag that would allow it. Do not use it for a corpus whose owner has not agreed that the text may be sent to the model provider: extraction and embedding call a hosted model, so a corpus is not local once ingested, and the recipe's `provider_consent` is checked before any ingest.

It holds no credential of its own. The provider key comes from the bound `secrets:openai` file through `--env`, is parsed in-process, and never enters the environment, a log, a report, or stdout.

## What a knowledge set is

A directory in the owning root, `knowledge/<set>/`, holding a recipe (`set.yaml`), a confirmed canon (`canon.md`), the sources (`corpus/`), the eval (`eval.questions.yaml`), a review queue (`review/`), and reports. `templates/knowledge AGENTS.md` is the declaration the onboarding skill writes into the root's `knowledge/` directory, and it states the layout once; this file does not restate it. The store for every set in a root is `knowledge/store/`, passed as `--store`, one per root and never shared.

A set is built from its recipe, never improvised: `templates/set.yaml` carries every key the script reads and the script refuses any other. The recipe names an extraction pack; `packs/general/` ships with the tool, and a set may carry its own beside its recipe. A pack is three files: `graph_model.py`, the types the model may extract and nothing else; `ontology.ttl`, the canonical vocabulary matched after extraction; `extraction_prompt.md`, the rules the model extracts under. The tool appends the set's confirmed canonical names to that prompt on every run, so the model links to a name the set already holds rather than minting a sibling.

Every node the model extracts is a Candidate, and no tool makes a node Canonical. The recipe's two link rules, an exact ontology match or a normalized-name match to a Canonical of the same type in the same dataset, decide only whether a new extraction attaches to an existing Canonical node rather than standing beside it. Status changes come from `promote`, which applies what a named human decided: an item under `review/decided/`, or the set's confirmed `canon.md` through `--from-canon`, which writes one decided item per canonical entry and alias with the confirmer's name and date from the recipe and applies them. After a rebuild, `promote --replay` re-applies every decided item by its subject's type and normalized name, so a rebuild keeps what humans decided.

## Inputs

`--set`, the knowledge set directory, absolute. `--store`, the root's store directory, absolute; `bootstrap` creates it. `--env`, the bound credential file, absolute, parsed as `KEY=value` lines; the recipe's `llm.provider` names which key is read, and v1 reads `OPENAI_API_KEY` for `openai` and refuses any other provider by name. `--set` and `--store` are refused when they resolve inside this tool's directory.

## Quick Start

```bash
python3.11 scripts/knowledge_memory.py help
```

Usage text, on a copy with nothing installed and nothing configured.

```bash
python3.11 scripts/knowledge_memory.py check
```

Reports the interpreter, whether it is new enough, which newer interpreters are on the path, and whether the package cache exists. Installs nothing.

```bash
python3.11 scripts/knowledge_memory.py bootstrap --store /path/to/root/knowledge/store --env /path/to/root/memory/secrets/openai.env
```

The first run reports what it would install and stops. With `--install` it creates this tool's package cache, installs into it, creates the store, configures the engine against it, and prints one object naming the engine version and the graph and vector providers it is using.

```bash
python3.11 scripts/knowledge_memory.py ingest --set /path/to/root/knowledge/my-set --store /path/to/root/knowledge/store --env /path/to/root/memory/secrets/openai.env
```

Hashes every source the recipe includes, skips the unchanged, prints an estimate for the rest, and stops. The same command with `--proceed` ingests them, enriches the dataset once, writes a report into the set's `reports/`, and prints it.

```bash
python3.11 scripts/knowledge_memory.py recall --set /path/to/root/knowledge/my-set --store /path/to/root/knowledge/store --env /path/to/root/memory/secrets/openai.env --query "What does the author mean by leverage?"
```

One object: the answer, the context it was built from, the references it carries, and whether the set's canon is confirmed, so the caller can label it.

Anything else, see Troubleshooting.

## Dependencies

This tool's script runs under Python rather than Node, which the Script Contract's Runtimes clause allows once the interpreter is declared here. Each dependency below is checked after help parsing and only on a command that needs it, and a missing one fails the run by naming the dependency and its check command. Install steps are never written here; when a check fails the agent derives them from the dependency's own current documentation, per that contract's System dependencies clause.

| Dependency | Needed for | Present when |
|------------|------------|--------------|
| Python 3.11 or newer, below 3.15 | Every command; the script is written for this interpreter and creates its package cache with it. The system interpreter on a Mac is 3.9 and is refused by version | `python3.11 --version` succeeds, or a newer minor does |

The interpreter is the one dependency a script cannot check from inside itself, so the agent runs its check before invoking the script the first time on a machine. `check` reports what it found and which newer interpreters are on the path.

The engine and its embedded stores are packages, not system dependencies: Cognee (Apache-2.0), with Ladybug for the graph, LanceDB for the vectors, and SQLite for the catalog, all installed into this tool's own package cache on the run that authorises it. No database server, no container, and no hosted store is involved. What is hosted is the model: extraction and embedding call the provider the recipe names, over the network, on every ingest and every recall.

## Configuration

One file, the bound `secrets:openai`, passed as `--env` to every command but `help` and `check`. The script parses it directly, reads the one key the recipe's provider names, and hands the value to the engine in-process. Nothing else is configured: the store's location is `--store`, the dataset is the recipe's, and the engine's providers are fixed to the embedded stores by the script on every run.

## Usage

| Command | Purpose |
|---------|---------|
| `help` | Print usage and exit |
| `check` | Report the interpreter, newer interpreters on the path, and whether the package cache exists; installs nothing |
| `bootstrap --store [dir] --env [file]` | Create the store and configure the engine against it |
| `ingest --set [dir] --store [dir] --env [file]` | Hash sources, skip the unchanged, estimate, and with `--proceed` ingest and enrich, writing a report; with `--estimate-all`, estimate the whole corpus and change nothing |
| `recall --set [dir] --store [dir] --env [file] --query [text]` | Recall from this set's dataset alone |
| `review-pass --set [dir] --store [dir] --env [file]` | Write review items for new findings, stale candidates, merge proposals, and conflicts |
| `promote --set [dir] --store [dir] --env [file] --decided [file]` | Apply one decision a human recorded under `review/decided/`; `--from-canon` writes and applies the decisions a confirmed `canon.md` records; `--replay` re-applies every applied item after a rebuild |
| `mark-stale --set [dir] --store [dir] --env [file] --id [node]` | Set a node Stale with a `valid_to`; deletes nothing |
| `healthcheck --set [dir] --store [dir] --env [file]` | Counts by type and status, provenance holes, backlog ages, last ingest; with `--eval`, run the set's questions |
| `forget --set [dir] --store [dir] --env [file] ... --confirm` | Forget one source, the dataset's memory for a rebuild, or the whole dataset |

Options:

| Option | Effect | Default |
|--------|--------|---------|
| `--set [dir]` | The knowledge set directory holding `set.yaml`, absolute | None; required by every command but `help`, `check`, `bootstrap` |
| `--store [dir]` | The root's store directory, absolute, outside this tool | None; required by every command but `help`, `check` |
| `--env [file]` | The bound credential file, absolute | None; required by every command but `help`, `check` |
| `--install` | Authorise the first-run package install and finish the run | Off; `WISER_ALLOW_INSTALL=1` authorises an unattended run |
| `--proceed` | On `ingest`, go past the estimate and ingest | Off; without it the estimate is printed and the run stops |
| `--estimate-all` | On `ingest`, estimate every included source regardless of the ledger, for the cost of a rebuild; ingests nothing | Off |
| `--report [dir]` | On `ingest`, where the report is written; refused inside this tool's directory | The set's `reports/` |
| `--query [text]` | On `recall`, the question | None; required |
| `--as-of [date]` | On `recall`, a `YYYY-MM-DD` the question is asked as of; appended to the query and recorded, not filtered by the engine (see gaps) | Off |
| `--top-k [n]` | On `recall`, how many items to retrieve | 15 |
| `--mode [context or answer]` | On `recall`, retrieve context only, or an answer with references | `answer` |
| `--decided [file]` | On `promote`, the decided review item, which must sit under the set's `review/decided/` and carry `status: decided` | One of `--decided`, `--from-canon`, `--replay` is required |
| `--from-canon` | On `promote`, write one decided item per canonical entry and alias in `canon.md`, reviewer and date taken from the recipe's `canon_confirmed`, and apply them; refused while `canon_confirmed` is blank | Off |
| `--replay` | On `promote`, re-apply every item under `review/decided/` with `status: applied`, matching nodes by subject type and normalized name; idempotent | Off |
| `--id [node]` | On `mark-stale`, the node | None; required |
| `--valid-to [date]` | On `mark-stale`, the end of validity | Today |
| `--eval` | On `healthcheck`, run the set's eval questions | Off |
| `--memory-only` | On `forget`, drop the dataset's graph and vectors and keep its sources, so the next ingest rebuilds every file | Off |
| `--data-id [id]` | On `forget`, drop one source and its memory | Off |
| `--dataset` | On `forget`, drop the whole dataset | Off |
| `--confirm` | On `forget`, do it; without it the run says what it would forget and stops | Off |
| `--help`, `-h` | Print usage and exit | Off |

The three `forget` modes are exclusive and each is destructive to the store, never to the set's files. `--memory-only` is the rebuild path `skills/Knowledge Curation/` takes when a pack changes: the engine does not pick up a new graph model on re-ingest, so the memory is dropped, rebuilt from the same sources, and the decided items replayed with `promote --replay`. The cost of that is what `ingest --estimate-all` prints, never the ordinary estimate, which skips every unchanged source. `--dataset` and `--data-id` are human decisions, taken through a decided review item or an explicit instruction, and never a skill's own choice.

## Script Contract

The script in this tool follows `system/templates/Script Contract.md`: self-contained imports, help before anything else, arguments and paths validated before the dependency check, the `--env` clause, and the stdout and stderr rules. Everything a run of this tool writes, and where, is listed in `tools/AGENTS.md`, which is the only place this repository states it. Beyond those, four behaviors are worth knowing.

The package cache is this tool's own, per that contract's Runtimes clause. The first run that needs the engine reports what it would install and stops; `--install` on the same command creates a virtual environment beside the scripts, installs into it with pip's download cache switched off, and finishes the run. Only the standard library is used above that install: the recipe is parsed in full only after it, because the parser lives in the cache, so a malformed command costs no download.

The engine loads a `.env` file when it is imported, searching upward from its own package directory. The script therefore disables that loader before importing the engine, changes into the store directory, and refuses a store that holds a file of that name, so no credential file anywhere on the machine is read by anything but the `--env` clause. After import, the script checks that the key's value is absent from the process environment and records the result in every report as `key_in_environ`.

Recall always names one dataset, the recipe's, and no flag widens it. The store may hold several sets; each is a dataset, and a query crosses none of them.

Every caller-named path is judged by the file it reaches rather than by its spelling. `--set` and `--store` are held outside this tool's directory by the contract's identity comparison, and `--decided` is held inside the set's `review/decided/` the same way, so a decision cannot be applied from a file that merely claims to be one.

## Output

A successful command prints one JSON object to stdout and exits 0. `ingest` prints the report it wrote: files added, skipped as unchanged, and failed, whether the ontology was applied, whether the key reached the environment, the dataset, the pack, the duration, and `review_due`. `recall` prints the answer or null, the context items, the references, and the recipe's `canon_confirmed`. `review-pass` prints counts per item type and the files written. `healthcheck` prints the counts and, with `--eval`, one row per question with pass or fail; a failed question is a result and exits 0, and only a run that could not complete exits 1.

A run that cannot finish prints nothing to stdout, names the cause on stderr, and exits 1. No message repeats the provider's own text, which can quote the request; the exception class and the operation are named instead.

## Troubleshooting

| Message | Cause | Fix |
|---------|-------|-----|
| `python 3.9.6 found; this tool needs 3.11 or newer` | The system interpreter ran it | Run it with `python3.11` or a newer minor; `check` lists what is on the path |
| `this tool is not installed yet and this run did not authorise an install` | First engine-needing run in this copy, and no `--install` | Read what it says it would fetch and from where, then re-run the same command with `--install`. `WISER_ALLOW_INSTALL=1` authorises an unattended run |
| `--env is required; resolve the secrets:openai binding` | No credential file was passed | The agent resolves the binding per the constitution's Workspace Model and passes the file as `--env` |
| `the store holds a .env file; the engine would load it` | A dotenv file sits in `--store` | Move it out; the store holds engine data and nothing else |
| `provider_consent is blank in set.yaml` | Nobody has recorded that the corpus may be sent to the provider | `skills/Knowledge Set Onboarding/` asks the set's owner; the answer and the date go in the recipe |
| `unknown recipe key: [name]` | `set.yaml` carries a key the script does not read | Remove it, or add it to `templates/set.yaml` and the script in the same change |
| `nothing new to ingest` | Every included source hashes as unchanged | Not an error; change a source or add one |
| `estimate printed; re-run with --proceed to ingest` | The first pass of `ingest` stops at the estimate by design | Put the estimate to the person, then re-run with `--proceed` |
| `--decided must sit under review/decided/` | A review item elsewhere was passed | A human moves the item there with the Decision block filled |
| `decision block incomplete` | `reviewer`, `decision`, or `date` is blank | A named person fills all three; the tool applies nothing on a blank |
| `the key cannot be supplied in-process under this engine version` | Neither in-process route the script knows exists in the installed engine | Stop. This is a Solve finding for the build Playbook, not something to work around by exporting the key |
| `graph access unavailable` | The engine exposes none of the node access paths the script tries | Stop and report; `review-pass`, `promote`, and `mark-stale` depend on it and are not approximated by hand |
