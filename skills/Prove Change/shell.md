# Shell traps

Apply Every shell to every shell check, then each section naming the shell in use.

## Every shell

- Does a script rewrite a file in place? Yes: read it whole before opening it for writing. No: go on.
- Does a copied BusyBox run through a musl loader? Yes: invoke a link named for the applet, since BusyBox selects it from `argv[0]`'s base name. No: go on.
- Does a hash use a value captured by `$(...)`? Yes: hash the bytes written straight to a file instead, since command substitution drops trailing newlines. No: hash the original bytes.
- Does recovery follow a bounded command under `set -eu`? Yes: handle the bound's nonzero status explicitly, with `|| true` where failure is deliberately ignored; otherwise hitting the bound exits before any later wait loop. No: follow the shell's exit rules.

## zsh and dash

- An environment prefix on `eval`, `source` or `.` does not reach what they run: export the variable first; `env VAR=val <command>` reaches one external command only.

## zsh

- An unquoted `$FILES` does not split: use an array, and confirm a row printed per file.
- `"$var:path"` is a history modifier: write `"${var}:path"`.
- A glob matching nothing is an error and there is no `PIPESTATUS`: run a watch loop under `bash` with `shopt -s nullglob`, and take an exit status from a command with no pipe.
- `path`, `cdpath`, `fpath`, `manpath` and `argv` are tied arrays: name a variable anything else.
- Does a path use `"${f/\/a-/\/b-}"`? Yes: its replacement keeps backslashes and names no file; construct the path without that substitution and confirm it exists. No: go on.

## dash

- A background list's stdin is `/dev/null` unless redirected explicitly.
