#!/bin/bash
# classifier-seam.sh --tree <plugin root> --base <rev> [--staged | --head <rev>]
#
# Proves standards/primitives.md Classifier Seam against a plugin root: every
# typed file added since <rev> declares its classifier seam, or declares none,
# in one line of its Context:
#
#   Classifier seam: none.
#   Classifier seam: <each seam, naming in backticks the code that calls>. Else: <else path>.
#
# A typed file is skills/<Name>/SKILL.md, experts/<Name>/EXPERT.md or
# tools/<Name>/TOOL.md, in that exact spelling. A connector carries no
# declaration and is not in the population. A path whose first component is
# skills, experts or tools in any letter case, and whose last component is
# SKILL.md, EXPERT.md or TOOL.md in any letter case, but which is not exactly
# that flat <family>/<name>/<file>, is a violation: Placement keeps those
# directories flat, and the gate names that rule rather than skipping the
# path. A typed file stored as a symlink in the index or in a commit is a
# violation too: the object is the link text, so the declaration cannot be
# checked. In the working tree a typed-file symlink, broken or not, is refused
# as well: a typed file is a regular file in every source.
#
# --base is a commit, or the empty tree from `git hash-object -t tree
# /dev/null`, which is what an unborn branch uses when HEAD does not resolve.
#
# Two populations, and the difference is the ratchet:
#   added     typed files in the source that do not exist at <rev>. Each MUST
#             carry a well-formed declaration. This is the only population a
#             missing declaration is counted against.
#   present   every typed file in the source. A file that carries the keyword
#             anywhere is held to the form, whether or not it was added; a file
#             that carries none is not flagged. So files written before the
#             rule are never failed for lacking it, and the base is the
#             baseline: it can only move forward.
#
# The source is what is checked:
#   (default)     the working tree: tracked and untracked files git does not
#                 ignore, read from disk
#   --staged      the index, read with `git show :<path>`; what a pre-commit
#                 check should read, since the disk may differ from what lands
#   --head <rev>  a commit, read with `git show <rev>:<path>`; what a reviewer
#                 should read when naming a tested hash
#
# Every run proves it can fail before it is believed. Four planted texts go
# through the same checker the tree does: a skill whose Context lacks the
# line and one whose line sits in a code block must be refused, and a skill
# declaring none and an expert declaring a routing seam must pass. Any control
# that answers wrongly is exit 2. The listing must also show the root's own
# AGENTS.md, or the population is not trusted.
#
# Exit codes:
#   0  every added typed file declares, and every declaration present is well formed
#   1  REFUSED, at least one violation, each printed with its file and reason
#   2  could not measure: bad arguments, a rev that does not resolve, a tree
#      that is not a repository's top level, a path git had to quote, a file
#      that could not be read, or a control that answered wrongly. Never a pass.
#
# What it does not cover, so a pass is not read as more than it is: it checks
# the declaration's form, not its truth. Whether the named judgment is closed,
# whether the call really sits in that code, whether a skill's seam is one of
# its own steps in disguise, and whether the runs both ways were made and
# passed are Play Author's Review Mode and the change's own record. A rename
# of a primitive directory is an added file here, by path.
#
# Written in bash 3.2 and BWK awk, which is what macOS ships; no python, so the
# gate runs wherever git does.

set -u
export LC_ALL=C

AWK=/usr/bin/awk
[ -x "$AWK" ] || AWK=awk

die() { echo "seam-gate: $*; cannot measure." >&2; exit 2; }

# --------------------------------------------------------------- arguments ---
TREE=""; BASE=""; MODE=worktree; HEADREV=""
while [ $# -gt 0 ]; do
  case "$1" in
    --tree) [ $# -ge 2 ] || die "--tree needs a path"; TREE=$2; shift 2 ;;
    --base) [ $# -ge 2 ] || die "--base needs a rev"; BASE=$2; shift 2 ;;
    --staged) [ "$MODE" = worktree ] || die "--staged and --head are one choice"; MODE=index; shift ;;
    --head) [ $# -ge 2 ] || die "--head needs a rev"; [ "$MODE" = worktree ] || die "--staged and --head are one choice"; MODE=commit; HEADREV=$2; shift 2 ;;
    -h|--help) sed -n '2,3p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done
[ -n "$TREE" ] || die "--tree is required"
[ -n "$BASE" ] || die "--base is required"
[ -d "$TREE" ] || die "--tree $TREE is not a directory"

G() { git -C "$TREE" -c core.quotePath=false "$@"; }

TOP=$(G rev-parse --show-toplevel 2>/dev/null) || die "$TREE is not inside a git work tree"
PHYS_TREE=$(cd -- "$TREE" && pwd -P) || die "cannot resolve $TREE"
PHYS_TOP=$(cd -- "$TOP" && pwd -P) || die "cannot resolve $TOP"
[ "$PHYS_TREE" = "$PHYS_TOP" ] || die "$TREE is not its repository's top level ($TOP); paths would not match"

# A commit, or the empty tree. Anything else cannot be measured. The empty
# tree is the base an unborn branch has: every typed file in the index is
# added, and `git ls-tree` of it is empty.
BASE_COMMIT=$(G rev-parse --verify --quiet "$BASE^{commit}" 2>/dev/null) || BASE_COMMIT=""
if [ -n "$BASE_COMMIT" ]; then
  BASEC=$BASE_COMMIT
else
  EMPTY_TREE=$(G hash-object -t tree /dev/null) || die "could not name the empty tree"
  BASE_TREE=$(G rev-parse --verify --quiet "$BASE^{tree}" 2>/dev/null) || BASE_TREE=""
  if [ -n "$BASE_TREE" ] && [ "$BASE_TREE" = "$EMPTY_TREE" ]; then
    BASEC=$EMPTY_TREE
  else
    die "--base $BASE does not name a commit or the empty tree"
  fi
fi
if [ "$MODE" = commit ]; then
  HEADC=$(G rev-parse --verify --quiet "$HEADREV^{commit}") || die "--head $HEADREV does not name a commit"
fi

W=$(mktemp -d "${TMPDIR:-/tmp}/seam-gate.XXXXXX") || die "no scratch directory"
trap 'rm -rf -- "$W"' EXIT

# ----------------------------------------------------------------- checker ---
# Reads one typed file on stdin; -v kind=skill|expert|tool. Prints one FORM
# line (none, seam, missing, nocontext) and zero or more ERR lines.
# Context, code blocks and comments are read as experts/AGENTS.md reads them
# for an Owns: line: only "## Context" at column 0 opens Context and the next
# "## " heading closes it; a fence is three or more backticks or tildes,
# indented at most three spaces, closed by a run at least as long of the same
# character; a backtick run with another backtick after it on the line is a
# code span, not a fence; inside a fence nothing but its close is read. A fence
# opener and a heading are read on the raw line, a heading's name being the
# text before any comment on it, unless a comment opened on an earlier line is
# still open; any other line an HTML comment touches is never read, so a
# declaration is never joined across a comment.
cat > "$W/check.awk" <<'AWK'
function runlen(s, ch,    n) { n = 0; while (substr(s, n + 1, 1) == ch) n++; return n }
function err(m) { errs[++nerr] = m }
function trim(s) { sub(/^[ \t]+/, "", s); sub(/[ \t]+$/, "", s); return s }
function count(s, t,    n, i) { n = 0; while ((i = index(s, t)) > 0) { n++; s = substr(s, i + length(t)) } return n }
BEGIN { c = 0; f = 0; s = 0; ctx = 0; nd = 0; nerr = 0 }
{
  sub(/\r$/, "")
  raw = $0
  kraw = count(tolower(raw), "classifier seam:")
  t = raw; sub(/^ ? ? ?/, "", t)
  # Inside a fence only its closing fence is read; comment markers there are text.
  if (f) {
    if (kraw > 0) err("line " NR ": the declaration sits in a code block, where it is not read")
    if (substr(t, 1, 1) == fc) { n = runlen(t, fc); if (n >= fl && trim(substr(t, n + 1)) == "") f = 0 }
    next
  }
  # Comment state for this line. A fence opener and a heading are read on the raw
  # line below; any other line a comment touches is never read as a declaration.
  startc = c
  # A fence opener is structure and is read on the raw line, before any comment
  # marker in its info string is interpreted, unless a comment opened on an
  # earlier line is still open.
  if (!startc) {
    ch = substr(t, 1, 1)
    if (ch == "`" || ch == "~") {
      n = runlen(t, ch)
      if (n >= 3 && !(ch == "`" && index(substr(t, n + 1), "`") > 0)) {
        fc = ch; fl = n; f = 1
        if (kraw > 0) err("line " NR ": the declaration sits in a code block, where it is not read")
        next
      }
    }
  }
  cm = ""; has = startc
  line = raw
  while (length(line) > 0) {
    if (c) { i = index(line, "-->"); if (i == 0) { cm = cm " " line; break } cm = cm " " substr(line, 1, i - 1); line = substr(line, i + 3); c = 0; has = 1; continue }
    i = index(line, "<!--"); if (i == 0) break
    has = 1; line = substr(line, i + 4); c = 1
  }
  kcm = count(tolower(cm), "classifier seam:")
  if (kcm > 0) err("line " NR ": the keyword inside an HTML comment, where it is not read; a comment may not carry it")
  # A heading is a raw line that starts with "## " at column 0, outside a fence and
  # not inside a comment opened on an earlier line. Its name is the text before any
  # comment on it, so a trailing comment neither hides it nor lends it a name.
  if (!startc && raw ~ /^## /) {
    h = raw; i = index(h, "<!--"); if (i > 0) h = substr(h, 1, i - 1)
    sub(/[ #\t]*$/, "", h); s = (h == "## Context"); if (s) ctx = 1
    if (kraw > kcm) err("line " NR ": the keyword on a heading line")
    next
  }
  if (has) {
    if (kraw > kcm) err("line " NR ": the keyword on a line that carries an HTML comment; the declaration is a line of its own")
    next
  }
  if (kraw > 0) {
    if (s && substr(raw, 1, 17) == "Classifier seam: " && kraw == 1) {
      nd++; decl = substr(raw, 18); dline = NR
      if (substr(decl, 1, 1) == " " || substr(decl, 1, 1) == "\t") err("line " NR ": one space after `Classifier seam:` and no more")
      if (raw !~ /\.$/) err("line " NR ": the declaration ends with a period and nothing after it")
    }
    else if (s) err("line " NR ": the keyword in a Context line that is not the declaration; the line starts at the left margin as `Classifier seam: `")
    else err("line " NR ": the declaration sits outside Context, where it is not read")
  }
}
END {
  if (!ctx) form = "nocontext"
  else if (nd == 0) form = "missing"
  else {
    if (nd > 1) err("more than one declaration in Context")
    v = trim(decl)
    if (tolower(substr(v, 1, 4)) == "none") {
      if (v != "none.") err("line " dline ": a declaration of none reads exactly `Classifier seam: none.`")
      form = "none"
    } else {
      form = "seam"
      if (substr(v, length(v), 1) != ".") err("line " dline ": the declaration ends with a period; one without reads as wrapped")
      # `Else: ` is read only outside code spans; one inside backticks is text.
      vo = v; gsub(/`[^`]*`/, "", vo)
      ne = count(vo, "Else: ")
      if (ne != 1) err("line " dline ": the else path is named once, after `Else: `, outside backticks")
      i = 0; rest2 = v; off = 0
      while ((j = index(rest2, "Else: ")) > 0) {
        pre2 = substr(v, 1, off + j - 1); bt = count(pre2, "`")
        if (bt % 2 == 0) { i = off + j; break }
        off += j; rest2 = substr(rest2, j + 1)
      }
      pre = (i > 0) ? substr(v, 1, i - 1) : v
      post = (i > 0) ? trim(substr(v, i + 6)) : ""
      sub(/\.$/, "", post)
      if (i > 0 && trim(post) == "") err("line " dline ": nothing follows `Else: `; the else path is stated")
      spans = 0; code = 0; rest = pre
      while (match(rest, /`[^`]+`/)) {
        spans++; sp = substr(rest, RSTART + 1, RLENGTH - 2)
        if (sp ~ /^(hooks|tools|gateway)\//) code = 1
        rest = substr(rest, RSTART + RLENGTH)
      }
      if (spans == 0) err("line " dline ": the seam names the code that makes the call, in backticks, before `Else: `")
      else if ((kind == "skill" || kind == "expert") && !code) err("line " dline ": a " kind "'s seam is routing or a tool or gateway action it runs, never its own step; name that `hooks/`, `tools/` or `gateway/` code in backticks before `Else: `")
    }
  }
  print "FORM " form
  for (k = 1; k <= nerr; k++) print "ERR " errs[k]
}
AWK

kind_of() { case "$1" in skills/*) echo skill ;; experts/*) echo expert ;; tools/*) echo tool ;; esac; }

# Prints the checker's verdict for text on stdin.
check_text() { "$AWK" -v kind="$1" -f "$W/check.awk"; }

# Passes when the verdict has the wanted FORM and the wanted error state.
verdict_is() { # $1 verdict, $2 form, $3 clean|dirty
  printf '%s\n' "$1" | head -1 | "$AWK" -v w="FORM $2" '$0 != w { exit 1 }' || return 1
  if [ "$3" = clean ]; then ! printf '%s\n' "$1" | "$AWK" '/^ERR /{ f = 1 } END { exit !f }'
  else printf '%s\n' "$1" | "$AWK" '/^ERR /{ f = 1 } END { exit !f }'; fi
}

# ---------------------------------------------------------------- controls ---
ctl() { # $1 label, $2 kind, $3 expected form, $4 clean|dirty; text on stdin
  _v=$(check_text "$2") || die "the checker itself failed on control $1"
  if verdict_is "$_v" "$3" "$4"; then echo "  control $1: ok"
  else echo "  control $1: WRONG ($(printf '%s' "$_v" | tr '\n' ' '))"; die "control $1 answered wrongly, so no verdict below would mean anything"; fi
}
echo "seam-gate: controls, through the same checker the tree goes through"
ctl "P1 planted, Context without the line, must be missing" skill missing clean <<'MD'
---
name: Planted
type: skill
---
# Planted
## Context
Use when a control needs a skill with no declaration.
## Steps
1. Nothing.
MD
ctl "P2 planted, the line inside a code block, must be refused" skill missing dirty <<'MD'
# Planted
## Context
```
Classifier seam: none.
```
## Steps
MD
ctl "N1 a skill declaring none, must pass" skill none clean <<'MD'
# Clean
## Context
Use when a control needs a clean skill.

Classifier seam: none.
## Steps
MD
ctl "N2 an expert declaring routing, must pass" expert seam clean <<'MD'
# Clean
## Context
Classifier seam: routing, by `hooks/route.mjs` before the model starts. Else: the routing table, read as the constitution states.
## Jobs
MD

# -------------------------------------------------------------- population ---
case "$MODE" in
  worktree) G ls-files --cached --others --exclude-standard > "$W/src.all" || die "git ls-files failed in $TREE"; SRCDESC="the working tree" ;;
  index)    G ls-files --cached > "$W/src.all" || die "git ls-files failed in $TREE"; SRCDESC="the index" ;;
  commit)   G ls-tree -r --name-only "$HEADC" > "$W/src.all" || die "git ls-tree failed on $HEADC"; SRCDESC="commit $HEADC" ;;
esac
G ls-tree -r --name-only "$BASEC" > "$W/base.all" || die "git ls-tree failed on $BASEC"

if "$AWK" '/^"/{ f = 1 } END { exit !f }' "$W/src.all" "$W/base.all"; then
  die "git had to quote a path (a quote, backslash or control character in it); this gate does not guess at one"
fi
"$AWK" '$0 == "AGENTS.md" { f = 1 } END { exit !f }' "$W/src.all" || die "the source listing does not show the root's AGENTS.md; --tree is not a plugin root, or the listing failed"

typed() { # TYPED exact flat spelling; NEAR wrong case at that depth; DEEP any other depth
  "$AWK" '
    function fam(s) { l = tolower(s); if (l == "skills" || l == "experts" || l == "tools") return l; return "" }
    function baseok(s) { l = tolower(s); return l == "skill.md" || l == "expert.md" || l == "tool.md" }
    {
      n = split($0, a, "/")
      if (fam(a[1]) == "" || !baseok(a[n])) next
      if (n == 3 && a[2] != "" && ((a[1] == "skills" && a[3] == "SKILL.md") || (a[1] == "experts" && a[3] == "EXPERT.md") || (a[1] == "tools" && a[3] == "TOOL.md"))) { print "TYPED\t" $0; next }
      if (n == 3 && a[2] != "") { print "NEAR\t" $0; next }
      print "DEEP\t" $0
    }' "$1" | sort -u
}
typed "$W/src.all" > "$W/src.t"
typed "$W/base.all" > "$W/base.t"

WTLINK=()
SRC=(); while IFS= read -r p; do
  if [ "$MODE" = worktree ] && [ -L "$TREE/$p" ]; then WTLINK+=("$p"); continue; fi   # a symlink, broken or not
  if [ "$MODE" = worktree ] && [ ! -f "$TREE/$p" ]; then continue; fi   # deleted on disk, still in the index
  SRC+=("$p")
done < <("$AWK" -F'\t' '$1 == "TYPED" { print $2 }' "$W/src.t")
"$AWK" -F'\t' '$1 == "TYPED" { print $2 }' "$W/base.t" > "$W/base.typed"
sort -u "$W/base.all" > "$W/base.sorted"

ADDED=(); for p in ${SRC[@]+"${SRC[@]}"}; do
  "$AWK" -v p="$p" '$0 == p { f = 1 } END { exit !f }' "$W/base.typed" || ADDED+=("$p")
done
# A typed file in the wrong case is refused whether or not it existed at the
# base, for the same reason as DEEP below.
NEAR=(); while IFS= read -r p; do
  if [ "$MODE" = worktree ] && [ -L "$TREE/$p" ]; then WTLINK+=("$p"); continue; fi   # a symlink, broken or not
  if [ "$MODE" = worktree ] && [ ! -f "$TREE/$p" ]; then continue; fi   # deleted on disk, still in the index
  NEAR+=("$p")
done < <("$AWK" -F'\t' '$1 == "NEAR" { print $2 }' "$W/src.t")
# A typed file off its flat placement is refused whether or not it existed at
# the base: the earlier-file allowance covers a missing declaration, never a
# placement the standard forbids.
DEEP=(); while IFS= read -r p; do
  if [ "$MODE" = worktree ] && [ -L "$TREE/$p" ]; then WTLINK+=("$p"); continue; fi   # a symlink, broken or not
  if [ "$MODE" = worktree ] && [ ! -f "$TREE/$p" ]; then continue; fi   # deleted on disk, still in the index
  DEEP+=("$p")
done < <("$AWK" -F'\t' '$1 == "DEEP" { print $2 }' "$W/src.t")

read_src() { # $1 path; prints its content
  case "$MODE" in
    worktree) cat -- "$TREE/$1" ;;
    index)    G show ":$1" ;;
    commit)   G show "$HEADC:$1" ;;
  esac
}
size_of() {
  case "$MODE" in
    worktree) wc -c < "$TREE/$1" | tr -d ' ' ;;
    index)    G cat-file -s ":$1" ;;
    commit)   G cat-file -s "$HEADC:$1" ;;
  esac
}
is_added() { for _a in ${ADDED[@]+"${ADDED[@]}"}; do [ "$_a" = "$1" ] && return 0; done; return 1; }

NBASE=$(wc -l < "$W/base.typed" | tr -d ' ')
count_fam() { printf '%s\n' ${SRC[@]+"${SRC[@]}"} | "$AWK" -v f="$1/" 'index($0, f) == 1 { n++ } END { print n + 0 }'; }
echo
echo "seam-gate: population"
echo "  tree:    $PHYS_TREE"
echo "  source:  $SRCDESC"
echo "  base:    $BASE = $BASEC"
echo "  typed files at base: $NBASE"
echo "  typed files in source: ${#SRC[@]} (skills $(count_fam skills), experts $(count_fam experts), tools $(count_fam tools))"
echo "  added since base: ${#ADDED[@]}"
for p in ${ADDED[@]+"${ADDED[@]}"}; do echo "    + $p ($(size_of "$p") bytes)"; done
[ "${#NEAR[@]}" -eq 0 ] || for p in "${NEAR[@]}"; do echo "    ? $p (a typed file's name in the wrong case)"; done
[ "${#DEEP[@]}" -eq 0 ] || for p in "${DEEP[@]}"; do echo "    ! $p (a typed file outside the flat placement)"; done

# Index and commit modes record a symlink as mode 120000. The blob is the
# link text, not the typed file, so a declaration cannot be read from it.
if [ "$MODE" = index ]; then
  G ls-files -s > "$W/modes" || die "git ls-files -s failed in $TREE"
elif [ "$MODE" = commit ]; then
  G ls-tree -r "$HEADC" > "$W/modes" || die "git ls-tree failed on $HEADC"
fi
mode_of() {
  "$AWK" -F '\t' -v p="$1" '$2 == p { split($1, a, " "); print a[1]; exit }' "$W/modes"
}

# ------------------------------------------------------------------- check ---
VIOL=(); NCTX=0; NNONE=0; NSEAM=0
for p in ${SRC[@]+"${SRC[@]}"}; do
  if [ "$MODE" != worktree ]; then
    smode=$(mode_of "$p")
    if [ -z "$smode" ]; then die "could not read the mode of $p from $SRCDESC"; fi
    if [ "$smode" = "120000" ]; then
      VIOL+=("$p: the typed file is a symlink in this source, so the object is the link text and its declaration cannot be checked")
      continue
    fi
  fi
  read_src "$p" > "$W/file" || die "could not read $p from $SRCDESC"
  v=$(check_text "$(kind_of "$p")" < "$W/file") || die "the checker failed on $p"
  form=$(printf '%s\n' "$v" | head -1); form=${form#FORM }
  [ "$form" = nocontext ] || NCTX=$((NCTX + 1))
  [ "$form" = none ] && NNONE=$((NNONE + 1))
  [ "$form" = seam ] && NSEAM=$((NSEAM + 1))
  while IFS= read -r e; do VIOL+=("$p: ${e#ERR }"); done < <(printf '%s\n' "$v" | "$AWK" '/^ERR /')
  if is_added "$p"; then
    case "$form" in
      missing)   VIOL+=("$p: added since base and its Context carries no \`Classifier seam:\` line") ;;
      nocontext) VIOL+=("$p: added since base and has no \`## Context\` section to carry the declaration") ;;
    esac
  fi
done
for p in ${WTLINK[@]+"${WTLINK[@]}"}; do VIOL+=("$p: the typed file is a symlink in the working tree; a typed file is a regular file, as the index and commit modes also require"); done
for p in ${NEAR[@]+"${NEAR[@]}"}; do VIOL+=("$p: a typed file in a spelling no reader of typed files finds, which standards/primitives.md Placement forbids; its declaration cannot be checked"); done
for p in ${DEEP[@]+"${DEEP[@]}"}; do VIOL+=("$p: a typed file at a depth other than skills/<Name>/SKILL.md, experts/<Name>/EXPERT.md or tools/<Name>/TOOL.md; standards/primitives.md Placement keeps those directories flat"); done

echo "  Context found in $NCTX of ${#SRC[@]} typed files; declarations present: none $NNONE, seam $NSEAM"
echo
if [ "${#VIOL[@]}" -gt 0 ]; then
  for x in "${VIOL[@]}"; do echo "REFUSED: $x"; done
  echo "seam-gate: ${#VIOL[@]} violation(s). The form is standards/primitives.md Classifier Seam."
  exit 1
fi
echo "seam-gate: CLEAN. ${#ADDED[@]} added typed file(s) declare their seam; every declaration present is well formed."
exit 0
