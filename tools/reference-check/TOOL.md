---
name: reference-check
type: tool
category: system
description: Return a JSON scan of path-shaped and family-name references under --root, or take and restore an approved structural snapshot
version: 0.1.0
---

# reference-check

## Context

Use for a repeatable reference inventory before and after structural edits. `scan` reads the caller's root and writes nothing. It does not judge which moves are right, resolve a composed workspace, or prove universal recall. Read `grammar.md` before interpreting the report.

The companion snapshot command supports the same structural transaction for Housekeeping and Onboard Root. Its writes and recovery limits are exclusively in `snapshot.md`; scan never takes a snapshot implicitly. Neither command installs, opens a network connection, reads stdin, or invokes another primitive.

## Objective and inputs

Return references, fenced hits and path-only exclusions as one JSON object. The caller supplies `<root>` as `--root`, a directory outside this tool. No configuration or `--env` is used. Composed-plugin family indexes are explicit manual input to the calling skill when those families are not inside the root; this tool does not hunt for them.

## Usage

Run help before work:

```bash
node check.cjs help
node check.cjs scan --root /absolute/working/directory
node snapshot.cjs help
```

`check.cjs` accepts only `help`, `--help`, or `scan --root <dir>`. `snapshot.cjs` accepts only the commands and flags documented in `snapshot.md` and its help. Node built-ins only. `--install` is refused by name. Every script follows `system/templates/Script Contract.md`; user-facing conventions are in `tools/RUNNING.md`.

## Output and interpretation

`references` and `fenced` contain file, line, shape, target and state; `skipped` contains paths and reasons, without source snippets. `scope` names supported formats and the required manual composed-plugin inventory. A missing scan is not zero findings. Bare-name matches are estimates. A root-local unresolved path may be a schematic, first-use declaration or composed-plugin citation; the caller records a disposition before apply and checks every concrete consumer using the inventory it supplied.

Credential paths, declared `secrets:` bindings and hard-link aliases are excluded before content scanning; symlinks and unsupported formats are path-only. See `grammar.md` for the exact limits. Unknown flags and unsafe roots fail before scanning. Ambiguous scope is resolved by the caller before any structural transaction.

## Success

Help returns usage without setup. Scan returns deterministic JSON for unchanged inputs, including unresolved findings, with exit 0. Usage and filesystem failures return stderr only and exit 1. Scan writes no files. Recovery commands expose their snapshot location and verification result under `snapshot.md`.
