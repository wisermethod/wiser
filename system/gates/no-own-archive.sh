#!/bin/bash
# no-own-archive.sh [--staged] [plugin-root] | --self-test
# Exit 0 passes, 1 refuses a path, 2 could not measure.
set -u

die() { printf 'no-own-archive: %s; cannot measure.\n' "$*" >&2; exit 2; }

list_paths() {
  if [ "$2" = staged ]; then
    git -C "$1" diff --cached --name-only --diff-filter=ACMR -z
  else
    git -C "$1" ls-files --full-name -z
  fi
}

check_paths() {
  local path lower refused=0
  while IFS= read -r -d '' path; do
    # Any spelling of the folder counts: on a filesystem that ignores case,
    # zarchive/ is the same directory and ships the same way.
    lower=$(printf '%s' "$path" | tr '[:upper:]' '[:lower:]')
    case "/$lower" in */zarchive/*) ;; *) continue ;; esac
    case $path in
      system/templates/*/zArchive/.gitkeep)
        # A template's own placeholder is allowed only outside archived trees.
        case ${path%/zArchive/.gitkeep} in
          */zArchive|*/zArchive/*) ;;
          *) continue ;;
        esac ;;
    esac
    printf 'REFUSED: %s\n' "$path" >&2
    refused=1
  done
  return "$refused"
}

run_over() {
  local -a status
  list_paths "$1" "$2" | check_paths
  status=("${PIPESTATUS[@]}")
  [ "${status[0]}" -eq 0 ] || die "git could not list $2 paths in $1"
  return "${status[1]}"
}

self_test() (
  local git_env
  git_env=$(git rev-parse --local-env-vars) || die "cannot identify repository environment variables"
  # Clear the fixed names Git lists so a caller's index cannot receive fixtures.
  unset $git_env
  test_root=$(mktemp -d "${TMPDIR:-/tmp}/no-own-archive.XXXXXX") || die "no temporary directory"
  trap 'rm -rf -- "$test_root"' EXIT
  trap 'exit 2' HUP INT TERM
  local planted='tools/example/zArchive/old file.md'
  local allowed='system/templates/User Root Template/work/zArchive/.gitkeep'
  local ordinary='tools/example/README.md'
  local mode output rc
  git init -q --template= "$test_root" || die "cannot initialise the self-test repository"
  mkdir -p "$test_root/${planted%/*}" "$test_root/${allowed%/*}" &&
    touch "$test_root/$planted" "$test_root/$allowed" "$test_root/$ordinary" || die "cannot build fixtures"
  git -C "$test_root" add -f -- "$planted" "$allowed" "$ordinary" || die "cannot stage fixtures"
  for mode in tracked staged; do
    output=$(run_over "$test_root" "$mode" 2>&1)
    rc=$?
    [ "$rc" -eq 1 ] && [ "$output" = "REFUSED: $planted" ] ||
      die "self-test expected only the $mode archive to be refused, got $rc: $output"
  done
  rm -- "$test_root/$planted" && git -C "$test_root" add -u -- "$planted" || die "cannot remove the planted fixture"
  for mode in tracked staged; do
    run_over "$test_root" "$mode" || die "self-test refused the allowed $mode paths"
  done
  output=$(run_over "$test_root/missing" tracked 2>&1)
  rc=$?
  [ "$rc" -eq 2 ] && [[ $output == *"cannot measure"* ]] || die "self-test did not catch a git failure"
  printf '%s\n' 'no-own-archive: self-test passed (2 refusals, 2 passes, 1 cannot-measure).'
)

usage() { die "usage: $0 [--staged] [plugin-root] | --self-test"; }

mode=tracked
case ${1:-} in
  --self-test) [ "$#" -eq 1 ] || usage; self_test; exit $? ;;
  --staged) mode=staged; shift ;;
esac
[ "$#" -le 1 ] || usage
case ${1:-} in -*) usage ;; esac
GATES_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd) || die "cannot locate the gate directory"
run_over "${1:-$GATES_DIR/../..}" "$mode"
