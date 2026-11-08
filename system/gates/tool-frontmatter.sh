#!/bin/sh
# tool-frontmatter.sh [--self-test | plugin-root]
# Whole working-tree declarations: primitives.md Frontmatter, plugin-root.md C10.
# Exit 0 passes, 1 refuses, 2 could not measure. Never reads the index.
# The root constitution must open with a front matter block carrying root:,
# or nothing is measured. apps: is required where the root holds a family
# directory; a placeholder holds none, and C10 scores it N/A.
set -u
LC_ALL=C
export LC_ALL
GATES_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd) || exit 2
APPS='claude-cowork claude-code codex chatgpt-desktop grok cursor'

die() { echo "tool-frontmatter: $*; cannot measure." >&2; exit 2; }

# check_file <file> <tool|root> <plugin root> <1 if the root holds a family>
check_file() {
  [ -f "$1" ] && [ -r "$1" ] || return 2
  check_cites=$(awk -v kind="$2" -v apps="$APPS" -v families="$4" '
    function refuse(message) { errors = errors "REFUSED: " FILENAME ": " message "\n" }
    function value(s,    quoted) {
      quoted = substr(s, 1, 1) == "\""
      if (quoted) {
        if (s !~ /^"[^"\\]*"$/) refuse("use a plain double-quoted value")
        s = substr(s, 2, length(s) - 2)
      } else if (s ~ /^[\047\[\{&*!>|%@`]/ || s ~ /[:#]/ || s ~ /^[[:space:]]/) {
        refuse("value is outside the flat frontmatter grammar")
      }
      if (s == "" || s ~ /[[:cntrl:]]/) refuse("empty or control-character value")
      return s
    }
    function citation(s,    n, a, i) {
      if (s ~ /^https:\/\/[^\/?#[:space:]]+([\/?#][^[:space:]]*)?$/) return 1
      if (s == "" || s ~ /^[\/[:space:]]/ || s ~ /[:\\?#]/) return 0
      n = split(s, a, "/")
      for (i = 1; i <= n; i++) if (a[i] == ".." || a[i] == "") return 0
      cites = cites s "\n"
      return 1
    }
    NR == 1 { sub(/\r$/, ""); opened = ($0 == "---"); next }
    !opened || closed { next }
    { sub(/\r$/, "") }
    $0 == "---" { closed = 1; next }
    /^  - .+/ {
      if (key == "" || shape[key] != "list") { refuse("list item has no list key"); next }
      item = value(substr($0, 5)); count[key]++
      if (key == "hosted" && item !~ /^[a-z0-9-]+ [0-9]+(B|KiB|MiB|GiB) [0-9]+s$/)
        refuse("malformed hosted: item; expected <command> <size> <time>")
      if (key == "apps") {
        app = item; sub(/ .*/, "", app)
        rest = substr(item, length(app) + 2)
        if (index(" " apps " ", " " app " ") == 0 || app == "") refuse("unknown app in apps:")
        if (seen_app[app]++) refuse("app listed twice in apps:")
        if (rest != "steps" && !(substr(rest, 1, 4) == "run " && citation(substr(rest, 5))))
          refuse("apps: item must be <app> steps or <app> run <citation> inside the plugin or at https://")
      }
      next
    }
    /^[A-Za-z_][A-Za-z0-9_-]*:( .+)?$/ {
      key = $0; sub(/:.*/, "", key)
      if (key in shape) refuse("duplicate frontmatter key " key)
      if ($0 == key ":") shape[key] = "list"
      else { shape[key] = "scalar"; scalar[key] = value(substr($0, length(key) + 3)) }
      next
    }
    { refuse("line " NR " is outside the flat frontmatter grammar"); key = "" }
    END {
      if (kind == "root" && (!opened || !closed || !("root" in shape))) {
        print "tool-frontmatter: " FILENAME " opens with no closed front matter block carrying root:" > "/dev/stderr"
        exit 2
      }
      if (!opened || !closed) refuse("missing or unclosed frontmatter block")
      for (key in shape) if (shape[key] == "list" && count[key] == 0) refuse("empty list " key)
      if (kind == "tool") {
        if (!("runs" in shape)) refuse("missing runs:")
        else if (shape["runs"] != "scalar" || (scalar["runs"] != "local" && scalar["runs"] != "both"))
          refuse("runs: must be local or both")
        if (scalar["runs"] == "both" && (shape["hosted"] != "list" || count["hosted"] == 0))
          refuse("runs: both requires a non-empty hosted: list")
        if (scalar["runs"] == "local" && "hosted" in shape) refuse("runs: local forbids hosted:")
      } else if (families == 1 && !("apps" in shape)) {
        refuse("missing apps:")
      } else if ("apps" in shape && (shape["apps"] != "list" || count["apps"] == 0)) {
        refuse("apps: must be a non-empty list")
      }
      printf "%s", cites
      if (errors != "") { printf "%s", errors > "/dev/stderr"; exit 1 }
    }
  ' "$1")
  check_rc=$?
  [ "$check_rc" -le 1 ] || return "$check_rc"
  [ -n "$check_cites" ] || return "$check_rc"
  check_real=$(cd "$3" && pwd -P) || return 2
  while IFS= read -r check_cite; do
    [ -n "$check_cite" ] || continue
    check_dir=$(cd "$(dirname -- "$3/$check_cite")" 2>/dev/null && pwd -P) || check_dir=
    case $check_dir/ in "$check_real"/*) ;; *) check_dir= ;; esac
    if [ -z "$check_dir" ] || [ -L "$3/$check_cite" ] || [ ! -f "$3/$check_cite" ]; then
      echo "REFUSED: $1: apps: citation $check_cite is not a file inside the plugin" >&2
      check_rc=1
    fi
  done <<EOF
$check_cites
EOF
  return "$check_rc"
}

run_over() {
  [ -d "$1" ] || return 2
  sweep_root=$1
  sweep_rc=0
  sweep_count=0
  sweep_families=0
  for sweep_family in skills experts tools connectors; do
    [ -d "$sweep_root/$sweep_family" ] && sweep_families=1
  done
  for sweep_file in "$sweep_root"/tools/*/TOOL.md "$sweep_root/AGENTS.md"; do
    if [ "$sweep_file" = "$sweep_root/AGENTS.md" ]; then
      sweep_kind=root
    else
      [ -e "$sweep_file" ] || [ -L "$sweep_file" ] || continue
      sweep_kind=tool
    fi
    check_file "$sweep_file" "$sweep_kind" "$sweep_root" "$sweep_families"
    file_rc=$?
    case $file_rc in
      0|1) [ "$file_rc" -le "$sweep_rc" ] || sweep_rc=$file_rc ;;
      *) echo "tool-frontmatter: cannot read $sweep_file; cannot measure." >&2; return 2 ;;
    esac
    sweep_count=$((sweep_count + 1))
  done
  [ "$sweep_rc" -ne 0 ] || echo "tool-frontmatter: $sweep_count files checked; declarations pass."
  return "$sweep_rc"
}

vocabulary() {
  [ -r "$1" ] || return 2
  declared_apps=$(awk '
    /^## / { c10 = ($0 ~ /^## C10 /) }
    c10 && /The app vocabulary is / {
      lines++; text = $0; sub(/^.*The app vocabulary is /, "", text); sub(/\..*$/, "", text)
      while (match(text, /`[^`]+`/)) {
        printf "%s%s", separator, substr(text, RSTART + 1, RLENGTH - 2)
        separator = " "; text = substr(text, RSTART + RLENGTH)
      }
    }
    END { if (lines != 1) exit 2; print "" }
  ' "$1") || return 2
  [ "$declared_apps" = "$APPS" ]
}

self_test() {
  test_root=$(mktemp -d "${TMPDIR:-/tmp}/tool-frontmatter.XXXXXX") || die "no temporary directory"
  trap 'rm -rf -- "$test_root"' 0
  trap 'exit 2' HUP INT TERM
  mkdir -p "$test_root/tools/fixture" "$test_root/records" "$test_root/placeholder" || die "cannot build fixtures"
  : > "$test_root/records/run.md" && : > "$test_root/records/run with spaces.md" || die "cannot build fixtures"
  ln -s /etc/hosts "$test_root/records/link.md" || die "cannot build fixtures"
  refusals=0
  passes=0
  tool() {
    printf '%s\n' '---' 'name: fixture' 'type: tool' 'category: test' 'description: A fixture' 'version: 0.1.0' "$@" '---' > "$test_root/tools/fixture/TOOL.md"
  }
  plugin() { printf '%s\n' '---' 'root: fixture' "$@" '---' > "$test_root/AGENTS.md"; }
  expect() {
    test_expected=$1
    shift
    test_output=$("$@" 2>&1)
    test_rc=$?
    [ "$test_rc" -eq "$test_expected" ] || die "self-test expected $test_expected, got $test_rc: $test_output"
    if [ "$test_expected" -eq 1 ]; then
      case $test_output in *REFUSED:*) ;; *) die "self-test refusal has no finding" ;; esac
      refusals=$((refusals + 1))
    elif [ "$test_expected" -eq 0 ]; then
      passes=$((passes + 1))
    fi
  }
  for test_case in no-runs both-without-hosted malformed-hosted local-with-hosted unknown-runs no-apps type-beside-root unknown-app unknown-state run-without-citation missing-citation linked-citation duplicate-app blank-line duplicate-key single-quotes comment inline-list nesting unclosed-block outside-citation; do
    tool 'runs: local'
    plugin 'apps:' '  - claude-code steps'
    case $test_case in
      no-runs) tool ;;
      both-without-hosted) tool 'runs: both' ;;
      malformed-hosted) tool 'runs: both' 'hosted:' '  - search 2048chars none' ;;
      local-with-hosted) tool 'runs: local' 'hosted:' '  - fetch 1MiB 15s' ;;
      unknown-runs) tool 'runs: remote' ;;
      no-apps) plugin ;;
      type-beside-root) plugin 'type: personal' ;;
      unknown-app) plugin 'apps:' '  - unknown steps' ;;
      unknown-state) plugin 'apps:' '  - grok tested' ;;
      run-without-citation) plugin 'apps:' '  - codex run' ;;
      missing-citation) plugin 'apps:' '  - codex run records/missing.md' ;;
      linked-citation) plugin 'apps:' '  - codex run records/link.md' ;;
      duplicate-app) plugin 'apps:' '  - cursor steps' '  - cursor steps' ;;
      blank-line) tool 'runs: local' '' ;;
      duplicate-key) tool 'runs: local' 'runs: both' ;;
      single-quotes) tool "runs: 'local'" ;;
      comment) tool 'runs: local # comment' ;;
      inline-list) plugin 'apps: [codex steps]' ;;
      nesting) tool 'runs: both' 'hosted:' '    - fetch 1MiB 15s' ;;
      unclosed-block) printf '%s\n' '---' 'runs: local' > "$test_root/tools/fixture/TOOL.md" ;;
      outside-citation) plugin 'apps:' '  - codex run ../record.md' ;;
    esac
    expect 1 run_over "$test_root"
    tool 'runs: local'
    plugin 'apps:' '  - claude-code steps'
    case $test_case in
      both-without-hosted|malformed-hosted|local-with-hosted)
        tool 'runs: both' 'hosted:' '  - fetch 1MiB 15s' ;;
      type-beside-root) plugin 'type: personal' 'apps:' '  - claude-code steps' ;;
      run-without-citation|missing-citation|linked-citation) plugin 'apps:' '  - codex run records/run.md' ;;
      duplicate-app) plugin 'apps:' '  - cursor steps' '  - grok steps' ;;
    esac
    expect 0 run_over "$test_root"
    echo "self-test: $test_case REFUSED (1); repair PASS (0)"
  done
  # A constitution that cannot be read as a plugin's is never a pass.
  tool 'runs: local'
  printf '%s\n' '' '---' 'root: fixture' 'apps:' '  - claude-code steps' '---' > "$test_root/AGENTS.md"
  expect 2 run_over "$test_root"
  printf '%s\n' '---' 'apps:' '  - claude-code steps' '---' > "$test_root/AGENTS.md"
  expect 2 run_over "$test_root"
  echo 'self-test: a blank first line and a missing root: CANNOT MEASURE (2)'
  # Positive controls reach all vocabulary items, units, citations, quoting and a placeholder.
  tool 'runs: both' 'hosted:' '  - fetch 1B 1s' '  - fetch-2 2KiB 2s' '  - fetch 3MiB 3s' '  - fetch 4GiB 4s'
  plugin 'apps:' '  - claude-cowork steps' '  - claude-code run ./records/run with spaces.md' '  - codex steps' '  - "chatgpt-desktop run https://example.com/record"' '  - grok steps' '  - cursor steps'
  expect 0 run_over "$test_root"
  tool 'runs: "local"' 'memory:' '  - "secrets:slack"' 'gaps:' '  - A missing capability'
  plugin 'apps:' '  - claude-code steps'
  expect 0 run_over "$test_root"
  printf '%s\n' '---' 'root: fixture' '---' > "$test_root/placeholder/AGENTS.md"
  expect 0 run_over "$test_root/placeholder"
  echo 'self-test: all apps, units, citations, optional lists, quotes and a placeholder PASS (0)'
  standard="$GATES_DIR/../../standards/plugin-root.md"
  vocabulary "$standard" || die "self-test app vocabulary differs from C10 or C10 is unreadable"
  sed 's/`cursor`/`unknown`/' "$standard" > "$test_root/plugin-root.md"
  vocabulary "$test_root/plugin-root.md"
  [ "$?" -eq 1 ] || die "self-test missed a changed app vocabulary"
  vocabulary "$standard" || die "self-test refused the repaired app vocabulary"
  refusals=$((refusals + 1))
  passes=$((passes + 1))
  echo 'self-test: vocabulary mismatch REFUSED (1); repair PASS (0)'
  echo "tool-frontmatter: self-test passed ($refusals refusals, $passes passes, 2 cannot-measure)."
}

case ${1:-} in
  --self-test) [ "$#" -eq 1 ] || die "usage: $0 [--self-test | plugin-root]"; self_test; exit 0 ;;
  -*) die "usage: $0 [--self-test | plugin-root]" ;;
esac
[ "$#" -le 1 ] || die "usage: $0 [--self-test | plugin-root]"
run_over "${1:-$GATES_DIR/../..}"
exit $?
