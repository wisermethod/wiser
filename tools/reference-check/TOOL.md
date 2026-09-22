---
name: reference-check
type: tool
category: system
description: Return a JSON scan of path-shaped and family-name references under --root, or take and restore an approved structural snapshot
version: 0.1.1
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

`references` and `fenced` contain file, line, shape, target and state; `skipped` contains paths and reasons, without source snippets. `scope` names supported formats and the required manual composed-plugin inventory. A missing scan is not zero findings. Bare-name matches are estimates. A root-local unresolved path takes one disposition, recorded before any apply. Does the surrounding text present it as a shape, an example, or a schematic, rather than as a file that must exist? Disposition: schematic. Do not create the file to satisfy the scan. Does the text declare it as a file a later named step will create? Disposition: first-use. Do not fail the scan because it is absent. Does the caller's supplied composed-plugin inventory name it? Disposition: composed-plugin. Check the concrete paths in that inventory. Do not hunt a root the inventory does not name. Two of these fit, or none does: ask. Do not apply. After the disposition, check every concrete consumer. A concrete consumer is a path inside the root, or in the supplied inventory, that points at this target and is not only a fenced example. The inventory was not supplied: check paths inside the root, and say the composed-plugin portion was not checked. No such path can be named: say that. Do not hunt.

Credential paths, declared `secrets:` bindings and hard-link aliases are excluded before content scanning; symlinks and unsupported formats are path-only. See `grammar.md` for the exact limits. Unknown flags and unsafe roots fail before scanning. Can you name one root and one set of paths the transaction covers? Yes: that is the scope. No: ask before any snapshot or apply. A scan may still run; it writes nothing. Do not take a snapshot or apply while the scope is unnamed. Composed-plugin families outside this root: did the caller supply their indexes? Yes: check those indexes. No: say that portion was not scanned. This tool does not hunt for them.

## Success

Help returns usage without setup. Scan returns deterministic JSON for unchanged inputs, including unresolved findings, with exit 0. Usage and filesystem failures return stderr only and exit 1. Scan writes no files. Recovery commands expose their snapshot location and verification result under `snapshot.md`.
