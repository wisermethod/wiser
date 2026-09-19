#!/bin/sh
# typed-file-flags.sh [--self-test] [tools directory]
#
# Proves standards/script-contract.md 0.7.2: a tool's typed file names every
# flag the tool's own help declares. The clause binds help, which ships beside
# the code; the typed file is what a person opens first, and a partial list
# there tells a reader the tool is smaller than it is.
#
# Written 2026-09-19, and the build that proposed it argued for waiting: a gate
# that has never seen its rule fail proves only that it agrees with itself.
# --self-test is the answer to that objection rather than a convenience. It
# builds a fixture whose typed file is missing one flag, asserts this gate
# refuses it, then repairs the fixture and asserts the gate passes it. A gate
# that cannot demonstrate both answers has not been tested.
#
# It ships here rather than in the build workspace because it proves a standard
# this plugin carries against tools this plugin ships, and because the
# pre-commit check calls it: a hook in a repo that ships alone cannot reach a
# path that does not ship with it. Someone who clones this plugin and adds a
# tool gets the check that keeps their typed file honest.
#
# Three exit codes, and the difference between the last two is the whole point:
#   0  every typed file names every flag
#   1  REFUSED, a flag is declared in help and absent from the typed file
#   2  could not measure, which is never reported as a pass
#
# The distinction is not pedantry. Earlier on 2026-09-19 a sweep of this same
# family resolved each entry script as the first .js in a tool's scripts
# directory, alphabetically. For several tools that is a core module rather than
# the entry script, so running help on it printed nothing, and the sweep read
# that silence as a missing declaration. It produced six false accusations. This
# gate resolves the entry script from the tool's own TOOL.md, and treats a help
# that exits non-zero or prints nothing as a failure to measure, never as a
# finding.

set -u

GATES_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

# ---------------------------------------------------------------- one tool ---
# Prints the flags a tool's help declares, or fails with exit 2.
help_flags() {
  _dir=$1
  _md="$_dir/TOOL.md"

  # The entry script is whatever the typed file tells a reader to run, and so is
  # the interpreter. Reading both from here rather than from a directory listing
  # is the correction above; taking the interpreter rather than assuming it is
  # the same correction one layer down, because knowledge-memory is invoked as
  # python3.11 and a gate that substituted python3 would be measuring a
  # different run than the one the typed file documents.
  _cmd=$(grep -oE '(node|python3(\.[0-9]+)?) [A-Za-z0-9_./-]+\.(js|cjs|py)' "$_md" 2>/dev/null | head -1)
  _runner=${_cmd%% *}
  _entry=${_cmd##* }
  if [ -z "$_cmd" ] || [ -z "$_entry" ]; then
    echo "typed-file-flags: $_md names no command to run; cannot measure." >&2
    return 2
  fi
  if [ ! -f "$_dir/$_entry" ]; then
    echo "typed-file-flags: $_md names $_entry, which is not there; cannot measure." >&2
    return 2
  fi
  command -v "$_runner" >/dev/null 2>&1 || {
    echo "typed-file-flags: $_md names $_runner, which is not on this machine; cannot measure." >&2
    return 2
  }

  _out=$( (cd -- "$_dir" && "$_runner" "$_entry" help 2>/dev/null) ) || {
    echo "typed-file-flags: $_entry help exited non-zero in $_dir; cannot measure." >&2
    return 2
  }
  if [ -z "$_out" ]; then
    echo "typed-file-flags: $_entry help printed nothing in $_dir; cannot measure." >&2
    return 2
  fi

  # Long flags only. -h is a short alias and is matched by the long form the
  # same line always carries; matching it alone would reintroduce the substring
  # trap this family already paid for once, -h being inside --headless.
  printf '%s\n' "$_out" | grep -oE '\-\-[a-z][a-z0-9-]*' | sort -u
}

# Prints the flags a typed file names.
doc_flags() {
  grep -oE '\-\-[a-z][a-z0-9-]*' "$1/TOOL.md" 2>/dev/null | sort -u
}

# --------------------------------------------------------------- self test ---
self_test() {
  _tmp=${TMPDIR:-/tmp}/typed-file-flags-selftest.$$
  rm -rf -- "$_tmp"
  mkdir -p -- "$_tmp/fixture/scripts" || {
    echo "typed-file-flags: could not build the self-test fixture." >&2; exit 2; }

  cat > "$_tmp/fixture/scripts/fixture.js" <<'JS'
process.stdout.write('Usage:\n  node scripts/fixture.js help\n  --alpha  one\n  --beta   two\n  --help, -h  three\n');
JS

  # A typed file that names --alpha and --help and omits --beta.
  cat > "$_tmp/fixture/TOOL.md" <<'MD'
---
name: fixture
---
Run `node scripts/fixture.js help`.
Options: `--alpha`, `--help`, `-h`.
MD

  printf 'self-test 1 of 2: a typed file missing --beta must be REFUSED ... '
  if run_over "$_tmp" >/dev/null 2>&1; then
    echo "FAILED"
    echo "typed-file-flags: the gate passed a fixture it had to refuse. It cannot" >&2
    echo "                  fail, so a clean run of it means nothing." >&2
    rm -rf -- "$_tmp"; exit 2
  fi
  echo "ok"

  printf 'self-test 2 of 2: the same fixture repaired must PASS ......... '
  printf 'Options: `--alpha`, `--beta`, `--help`, `-h`.\n' >> "$_tmp/fixture/TOOL.md"
  if run_over "$_tmp" >/dev/null 2>&1; then
    echo "ok"
  else
    echo "FAILED"
    echo "typed-file-flags: the gate refused a fixture that satisfies the clause." >&2
    rm -rf -- "$_tmp"; exit 2
  fi

  rm -rf -- "$_tmp"
  echo "typed-file-flags: self-test passed. The gate fails when it should and passes when it should."
}

# ------------------------------------------------------------------- sweep ---
# Walks every directory holding a TOOL.md. A directory without one is not a
# tool, which is how tools/lib/ stays out of the population without being named.
run_over() {
  _root=$1
  _checked=0
  _flags=0
  _breaches=0

  for _md in "$_root"/*/TOOL.md; do
    [ -f "$_md" ] || continue
    _dir=$(dirname -- "$_md")
    _name=$(basename -- "$_dir")

    _hf=$(help_flags "$_dir") || return 2
    _df=$(doc_flags "$_dir")

    _n=$(printf '%s\n' "$_hf" | grep -c '^--' || true)
    case "$_n" in ''|*[!0-9]*) _n=0 ;; esac
    if [ "$_n" -eq 0 ]; then
      echo "typed-file-flags: $_name declares no flag at all in help; cannot measure." >&2
      return 2
    fi

    _missing=$(printf '%s\n' "$_hf" | while IFS= read -r f; do
                 [ -n "$f" ] || continue
                 printf '%s\n' "$_df" | grep -qxF -- "$f" || printf '%s\n' "$f"
               done)

    _checked=$((_checked + 1))
    _flags=$((_flags + _n))

    if [ -n "$_missing" ]; then
      _breaches=$((_breaches + 1))
      echo "REFUSED: $_name/TOOL.md does not name $(printf '%s' "$_missing" | tr '\n' ' ')" >&2
    fi
  done

  if [ "$_checked" -eq 0 ]; then
    echo "typed-file-flags: found no typed file under $_root; cannot measure." >&2
    return 2
  fi

  if [ "$_breaches" -gt 0 ]; then
    echo "         standards/script-contract.md: the typed file lists them too." >&2
    echo "         Add the flag where a caller choosing that command will meet it," >&2
    echo "         not in a footnote, then run this again." >&2
    return 1
  fi

  echo "typed-file-flags: $_checked typed files, $_flags flags in help, every one named."
  return 0
}

# -------------------------------------------------------------------- main ---
if [ "${1:-}" = "--self-test" ]; then
  self_test
  shift
fi

ROOT=${1:-$(CDPATH= cd -- "$GATES_DIR/../.." && pwd)/tools}
[ -d "$ROOT" ] || { echo "typed-file-flags: $ROOT is not a directory." >&2; exit 2; }

run_over "$ROOT"
exit $?
