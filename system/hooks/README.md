# Pre-commit check

This file travels with a clone. Git does not enable it. Once per clone, from
the plugin root:

    cp system/hooks/pre-commit .git/hooks/pre-commit
    chmod +x .git/hooks/pre-commit

The check scans the staged set only. It refuses operator build-workspace
paths so a reader who installs this plugin is not sent to a directory that
does not ship. It accepts the user-root homonym declared by
`standards/user-root.md` C3 and C8.

The pattern-definition line in `pre-commit` is a narrow disposition for the
expressions the check itself must contain. A planted operator citation on
any other line of that same file still fails.

## The typed-file check

Added 2026-09-19. When the staged set touches `tools/`, the hook runs
`system/gates/typed-file-flags.sh`, which asserts that every flag a tool's
`help` declares is also named in that tool's `TOOL.md`, per
`standards/script-contract.md`. A commit that touches nothing under `tools/`
does not run it; a full run over every tool takes about a second.

The gate distinguishes a breach from a failure to measure and never reports
the second as a pass. If it cannot run at all, the hook refuses the commit
rather than letting it through unchecked.

Run it by hand at any time:

    ./system/gates/typed-file-flags.sh

`--self-test` proves the gate can fail as well as pass, by building a fixture
whose typed file omits a flag and asserting the refusal.

## The classifier seam check

Added 2026-09-23. When any staged path of status A, C, M, R or T begins
with `skills/`, `experts/` or `tools/` in any letter case, the hook runs
`system/gates/classifier-seam.sh`, which asserts that every typed file
added in the commit declares its classifier seam, or declares that it has
none, in one line of its Context, per `standards/primitives.md` Classifier
Seam. A file that already existed at the base is not failed for lacking the
line. A line that is present is held to the form. A typed file at a depth
other than `<family>/<name>/<file>` is refused under Placement, and a typed
file staged as a symlink is refused because the index holds the link text.
On an unborn branch, where `HEAD` does not resolve, the base is the empty
tree. A commit that touches none of those directories does not run it.

The gate distinguishes a breach from a failure to measure and never reports
the second as a pass. If the script is missing, the hook refuses the commit
rather than letting it through unchecked. It reads the index, so what is
checked is what lands.

Run it by hand at any time:

    bash system/gates/classifier-seam.sh --tree . --base HEAD
