# Shell traps

The traps zsh and dash set for a check a shell runs, each with its fix.

## zsh and dash

- An environment prefix on `eval`, `source` or `.` does not reach what they run: export the variable first; `env VAR=val <command>` reaches one external command only.

## zsh

- An unquoted `$FILES` does not split: use an array, and confirm a row printed per file.
- `"$var:path"` is a history modifier: write `"${var}:path"`.
- A glob matching nothing is an error and there is no `PIPESTATUS`: run a watch loop under `bash` with `shopt -s nullglob`, and take an exit status from a command with no pipe.
- `path`, `cdpath`, `fpath`, `manpath` and `argv` are tied arrays: name a variable anything else.

## dash

- A background list's stdin is `/dev/null` unless redirected explicitly.
