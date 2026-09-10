# Structural transaction recovery

## Context

Supporting commands of `reference-check`, used by Housekeeping apply and Onboard Root adoption. This is recovery for an approved, bounded structural transaction, not a general backup or a mover. `standards/script-contract.md` governs execution; `standards/conventions.md` Archives still governs each replacement. Snapshot copies are additional recovery and eligible adoption sources.

## Inputs and commands

Run `node snapshot.cjs help` before work. Every path is caller-named and canonicalized. Root and snapshot must be disjoint and outside this tool, and the snapshot parent must already exist in an authorized working or evidence directory. The tool never chooses a sibling root or credentials home. `take` requires a new snapshot directory; an existing snapshot is never overwritten.

```text
node snapshot.cjs take --root <dir> --snapshot <new-dir> --changes <json-file>
node snapshot.cjs g3 --root <dir> --snapshot <dir>
node snapshot.cjs verify --root <dir> --snapshot <dir>
node snapshot.cjs restore --root <dir> --snapshot <dir>
```

`--changes` is a regular JSON file containing only `{"paths":["relative/file.md","new/directory"]}`. The list is the union of approved Housekeeping rows, declaration and memory producer edits, reference edits, moved sources, destinations, replacement archives, records, plan files and every newly created or removed directory, including ancestors. List exact paths, no globs and no subtree shorthand. An absent destination is recorded as absent. A snapshot is taken only after this concrete union is reviewed; if the plan grows, take a new snapshot before any mutation. After mutation, do not extend the approval list to excuse an unexpected change.

## Write and protection contract

`take` writes only its new snapshot directory: `manifest.json`, `copies/`, and copies of eligible files and directories. It reads and hashes eligible originals under root; it never changes root. Metadata screening and the root Provides declaration use the shared `tree.cjs` screen. Credential files and inode aliases, links, repository history and special files are path-only exclusions. Excluded objects are never copied or restored. A requested change touching an exclusion or any ancestor directory containing one, crossing a link, or changing a hard-linked file is refused. Use filewise rows leaving protected paths and their parents in place; the path-only change set grants no whole-directory exception. A root with excluded files may be processed only when the approved transaction leaves those files in place.

The manifest fixes root realpath, eligible original existence, file size, mode, SHA256, directories and the approved path set. G3 reads that manifest and independently enumerates the copies, comparing exact file and directory sets and hashes. `verify` additionally compares the root with the original snapshot, so it is a baseline or rollback check, not the success test for a changed tree.

`restore` validates the complete snapshot before writes. It compares current eligible files and directories with baseline and refuses any changed path not explicitly approved, a changed exclusion inventory, link crossing, hard-link alias or file/directory type swap. It removes approved new files and directories, restores missing directories and changed originals, then verifies hashes and the complete eligible path set. It writes only approved paths under root; snapshot bytes remain unchanged. A failure during filesystem mutation may leave partial recovery: stderr names the cause; the caller reports the snapshot and failed operation, and does not claim rollback succeeded. Preserve that snapshot for operator recovery.

No command installs or accepts `--install`, configuration, network or stdin. Success is one JSON object, help is usage, failure is stderr only with exit 1. Failure after snapshot creation leaves the incomplete snapshot for inspection; choose a fresh destination on retry. Concurrent writers invalidate the baseline and stop the transaction.

## Caller close

Before apply, re-run `verify` and the reference baseline. After apply, use `g3`, the reference scan and clause scores, and the bound-memory hash comparison Housekeeping requires. On abort, run `restore`, then `verify`, then compare the reference scan with baseline. Exclusions and unsupported reference formats remain explicit limits, never a claimed complete backup or universal reference closure.
