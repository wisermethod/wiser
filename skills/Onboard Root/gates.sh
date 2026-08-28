#!/usr/bin/env bash
# gates.sh: the mechanical gate harness for the onboard-root revision.
#
# Contract: the gate table in SKILL.md beside this script. Where this script
# and that table disagree, the table is what gets fixed first.
#
# Runs on macOS bash 3.2. No associative arrays, no mapfile/readarray, no
# ${var,,}. BSD-compatible flags only. Never writes to the root being checked.
#
#   gates.sh <root path>              run every gate
#   gates.sh --gate G6 <root path>    run one gate
#   gates.sh --json <root path>       one JSON object per line, plus a summary
#
# Exit 0 only when every gate passes. Exit 1 when any gate fails or skips
# in a way that is not a pass. Exit 2 on a usage error.

set -u

PROG=$(basename "$0")
US=$(printf '\037')
LC_ALL=C
export LC_ALL

usage() {
  cat <<USAGE
usage: $PROG [--json] [--gate <id>] <root path>

  --gate <id>   run a single gate (G0 G1 G2 G3 G4 G5a G5b G5c G6 G6b G7 G8
                G9 G10 G11 G11b G12 G13 G13b G14 G15 G16 G17 G18 G19 G20)
  --json        print one JSON object per gate, then a summary object
  --list        list the gates and exit
USAGE
}

# ---------------------------------------------------------------- arguments

JSON=0
ONE_GATE=""
ROOT=""

while [ $# -gt 0 ]; do
  case "$1" in
    --json) JSON=1; shift ;;
    --gate)
      if [ $# -lt 2 ]; then echo "$PROG: --gate needs an id" >&2; exit 2; fi
      ONE_GATE="$2"; shift 2 ;;
    --gate=*) ONE_GATE="${1#--gate=}"; shift ;;
    --list) LIST_ONLY=1; shift ;;
    -h|--help) usage; exit 0 ;;
    --) shift; break ;;
    -*) echo "$PROG: unknown option $1" >&2; usage >&2; exit 2 ;;
    *)
      if [ -n "$ROOT" ]; then echo "$PROG: more than one root given" >&2; exit 2; fi
      ROOT="$1"; shift ;;
  esac
done

LIST_ONLY=${LIST_ONLY:-0}

# The gate registry. id|short name|function. Order is the run order.
GATES='G0|The substantive floor|gate_G0
G1|Scope recorded|gate_G1
G2|Extraction complete and duplicates proved|gate_G2
G3|Copy established|gate_G3
G4|Evidence packages are evidence|gate_G4
G5a|Read-back coverage|gate_G5a
G5b|Read-back disposition|gate_G5b
G5c|Negative claims enumerated|gate_G5c
G6|The forward gate|gate_G6
G6b|The forward gate coverage floor|gate_G6b
G7|Deferrals are named|gate_G7
G8|Exactness claims used a second mechanism|gate_G8
G9|Headings answered|gate_G9
G10|Registers used as defined|gate_G10
G11|Label vocabulary is closed|gate_G11
G11b|Figure tables carry their provenance|gate_G11b
G12|The interview covered its classes|gate_G12
G13|Traits are checkable|gate_G13
G13b|The routing table resolves the deliverables|gate_G13b
G14|Voice authority|gate_G14
G15|Audit ran independently|gate_G15
G16|Findings disposed of, disputes preserved|gate_G16
G17|Refusal removed only for complete keys|gate_G17
G18|No placeholder token survives|gate_G18
G19|Paths resolve|gate_G19
G20|Operating file and close report|gate_G20'

if [ "$LIST_ONLY" = "1" ]; then
  printf '%s\n' "$GATES" | awk -F'|' '{printf "%-5s %s\n", $1, $2}'
  exit 0
fi

if [ -z "$ROOT" ]; then usage >&2; exit 2; fi
if [ ! -d "$ROOT" ]; then
  echo "$PROG: root not a directory: $ROOT" >&2
  exit 2
fi
# Strip a trailing slash so rel() is stable.
case "$ROOT" in
  */) ROOT="${ROOT%/}" ;;
esac

TMPD=$(mktemp -d "${TMPDIR:-/tmp}/gates.XXXXXX") || exit 2
trap 'rm -rf "$TMPD"' EXIT INT TERM

# ---------------------------------------------------------------- the tree

# The root's own AGENTS.md declares its type, and the type decides where the
# onboarding records live. A client root carries the full record set under
# `work/onboarding/` plus `sources/` and `todos/`; the other four types declare
# none of those, and their own templates say `work/onboarding/` is the
# client-root layout and does not apply to them. Reading the type here is what
# stops this harness demanding a layout the root was never given.
ROOT_TYPE=""
if [ -f "$ROOT/AGENTS.md" ]; then
  ROOT_TYPE=$(awk 'NR==1 && $0!="---" {exit} NR>1 && $0=="---" {exit} /^type:[[:space:]]/ {sub(/^type:[[:space:]]*/,""); print; exit}' "$ROOT/AGENTS.md")
fi
[ -n "$ROOT_TYPE" ] || ROOT_TYPE=unknown

case "$ROOT_TYPE" in
  client)
    ONB="$ROOT/work/onboarding"
    RUNREC="$ONB/run-record.md"
    VERIF="$ONB/verification.md"
    AUDIT="$ONB/audit.md"
    OPER="$ROOT/todos/current.md"
    CLOSE="$ONB/close-report.md"
    EXTRACT_DIR="$ONB/extraction"
    EVID_DIR="$ONB/evidence"
    SRC_DIR="$ROOT/sources"
    ;;
  personal|org|department|industry)
    # The run record sits in the working area the template declares, and the
    # operating file sits beside it. No extraction, evidence, sources or todos
    # directory exists for these types, and none is created here.
    ONB="$ROOT/work"
    RUNREC="$ONB/onboarding-run-record.md"
    VERIF="$ONB/onboarding-verification.md"
    AUDIT="$ONB/onboarding-audit.md"
    OPER="$ONB/onboarding-operating-file.md"
    CLOSE="$ONB/onboarding-close-report.md"
    EXTRACT_DIR="$ONB/onboarding-extraction"
    EVID_DIR="$ONB/onboarding-evidence"
    SRC_DIR="$ROOT/inbox"
    ;;
  *)
    echo "$PROG: $ROOT/AGENTS.md declares no recognized type: (personal, org, client, department, industry)" >&2
    echo "$PROG: a root is identified by its declaration, never by its folder name; fix the declaration and re-run" >&2
    exit 2
    ;;
esac


# Count of supplied documents. A run with none is the research-first, nothing-
# handed-over case, where extraction records cannot exist and the three gates
# that read them have nothing to be true or false about. The Tier section
# already settled how to report that: a gate that does not apply records why
# and passes, because a skip is not a pass and a correct root that can never
# exit clean from its own harness teaches the implementer to stop running it.
# The distinction that matters: no documents means not applicable, documents
# with no extraction records means failed.
source_count() {
  [ -d "$SRC_DIR" ] || { echo 0; return; }
  list_any "$SRC_DIR" 2>/dev/null | wc -l | tr -d ' '
}
MEM="$ROOT/memory"
SECRETS="$MEM/secrets"
AGENTS="$ROOT/AGENTS.md"

# The subject's own name, read from the root declaration. G5a's proper-noun
# clause uses it: a sentence whose only proper noun is the subject itself is
# structural prose, not a claim about anything a deliverable would act on.
ROOTNAME=$(sed -n 's/^root:[[:space:]]*//p' "$AGENTS" 2>/dev/null | head -1)
[ -n "$ROOTNAME" ] || ROOTNAME=$(basename "$ROOT")

rel() {
  case "$1" in
    "$ROOT"/*) printf '%s' "${1#$ROOT/}" ;;
    *) printf '%s' "$1" ;;
  esac
}

# md files in a collection directory, scaffolding excluded.
list_md() {
  [ -d "$1" ] || return 0
  find "$1" -type f -name '*.md' ! -name 'AGENTS.md' ! -name '.*' 2>/dev/null | sort
}

# every file in a source directory, scaffolding excluded.
list_any() {
  [ -d "$1" ] || return 0
  find "$1" -type f ! -name 'AGENTS.md' ! -name '.*' ! -name '.DS_Store' 2>/dev/null | sort
}

# bound files: the markdown files under memory/, never the credential store.
bound_files() {
  [ -d "$MEM" ] || return 0
  find "$MEM" -type f -name '*.md' 2>/dev/null | grep -v "^$MEM/secrets/" | sort
}

# ---------------------------------------------------------------- awk library

# Emit a bound file with its provenance-preamble lines blanked, line numbers
# preserved. The preamble documents the register, label and anchor grammars by
# writing them out literally, so any gate that greps a bound file for those
# grammars reads the documentation as content. G5a and G5c skipped it inline
# from the start; the first real root showed G10 did not, and reported the
# template's own `(Firsthand: <person who observed it>)` as a register naming
# no person, four times.
strip_preamble() {
  awk '
    /<!--[ \t]*provenance-preamble[ \t]*-->/ { inpre=1; print ""; next }
    /<!--[ \t]*\/provenance-preamble[ \t]*-->/ { inpre=0; print ""; next }
    { if (inpre) print ""; else print }
  ' "$1"
}

AWK_LIB='
function trim(s){ sub(/^[ \t]+/,"",s); sub(/[ \t]+$/,"",s); return s }
function isrow(line){ return (trim(line) ~ /^\|/) }
function is_sep(line,   t){
  t=trim(line)
  if(t !~ /^\|/) return 0
  if(t !~ /-/) return 0
  gsub(/[|: \t-]/,"",t)
  return (t=="")
}
function ncells(line, arr,   n,i){
  line=trim(line)
  sub(/^\|/,"",line); sub(/\|[ \t]*$/,"",line)
  n=split(line,arr,"|")
  for(i=1;i<=n;i++) arr[i]=trim(arr[i])
  return n
}
function slug(s,   t){
  t=tolower(s)
  gsub(/[^a-z0-9]+/,"-",t)
  gsub(/^-+/,"",t)
  gsub(/-+$/,"",t)
  return t
}
'

# table_get FILE SECTION "Col,Col,Col"
#   Prints one line per data row: lineno US v1 US v2 ...
#   SECTION is a "## " heading text, or "" for any table in the file.
#   The header row is matched by its column names, never by line number.
#   Exit 3 when no table in that section carries all the named columns.
table_get() {
  [ -f "$1" ] || return 4
  awk -v SEC="$2" -v COLS="$3" "$AWK_LIB"'
  BEGIN{ nc=split(COLS,want,","); US=sprintf("%c",31) }
  { L[NR]=$0 }
  END{
    sec=""; hdr=0; found=0
    for(i=1;i<=NR;i++){
      line=L[i]
      if(line ~ /^#+([ \t]|$)/){
        if(line ~ /^## /) sec=trim(substr(line,4))
        hdr=0
        continue
      }
      if(SEC!="" && sec!=SEC) continue
      if(hdr==0){
        if(isrow(line) && i<NR && is_sep(L[i+1])){
          m=ncells(line,c); split("",col,":")
          for(j=1;j<=m;j++) col[c[j]]=j
          ok=1
          for(j=1;j<=nc;j++) if(!(want[j] in col)) ok=0
          if(ok){ hdr=1; found=1; i++ }
        }
        continue
      }
      if(!isrow(line)){ hdr=0; continue }
      if(is_sep(line)) continue
      m=ncells(line,c)
      out=i
      for(j=1;j<=nc;j++){
        v=""
        if(col[want[j]]<=m) v=c[col[want[j]]]
        gsub(/\037/,"",v)
        out=out US v
      }
      print out
    }
    if(!found) exit 3
  }' "$1"
}

# section_body FILE "## Heading"  -> the lines under it, to the next heading
# of the same or higher level.
section_body() {
  [ -f "$1" ] || return 4
  awk -v H="$2" '
  function trim(s){ sub(/^[ \t]+/,"",s); sub(/[ \t]+$/,"",s); return s }
  BEGIN{ hl=0; while(substr(H,hl+1,1)=="#") hl++; inb=0 }
  {
    t=trim($0)
    if(t ~ /^#+([ \t]|$)/){
      l=0; while(substr(t,l+1,1)=="#") l++
      if(inb && l>hl){ print $0; next }
      if(inb) inb=0
      if(t==H){ inb=1 }
      next
    }
    if(inb) print $0
  }' "$1"
}

# has_heading FILE "## Heading"
has_heading() {
  [ -f "$1" ] || return 1
  awk -v H="$2" '
  function trim(s){ sub(/^[ \t]+/,"",s); sub(/[ \t]+$/,"",s); return s }
  { if(trim($0)==H){ found=1; exit } }
  END{ exit (found?0:1) }' "$1"
}

# kv FILE key  -> the value after the first "key:" line
kv() {
  [ -f "$1" ] || return 1
  awk -v K="$2" '
  function trim(s){ sub(/^[ \t]+/,"",s); sub(/[ \t]+$/,"",s); return s }
  {
    idx=index($0,":")
    if(idx>0){
      k=trim(substr($0,1,idx-1))
      if(k==K){ print trim(substr($0,idx+1)); exit }
    }
  }' "$1"
}

# has_key FILE key -> 0 when the key line is present at all
has_key() {
  [ -f "$1" ] || return 1
  awk -v K="$2" '
  function trim(s){ sub(/^[ \t]+/,"",s); sub(/[ \t]+$/,"",s); return s }
  {
    idx=index($0,":")
    if(idx>0 && trim(substr($0,1,idx-1))==K){ found=1; exit }
  }
  END{ exit (found?0:1) }' "$1"
}

nonblank_count() { awk 'NF{n++} END{print n+0}' "$1" 2>/dev/null || echo 0; }

# ---------------------------------------------------------------- reporting

G_FAILS=""
G_NOTES=""
G_SKIP=""

add_fail() { G_FAILS="${G_FAILS}$1
"; }
add_note() { G_NOTES="${G_NOTES}$1
"; }
set_skip() { G_SKIP="$1"; }

# missing_file FILE label -> 0 when present, else records a failure
need_file() {
  if [ -f "$1" ]; then return 0; fi
  add_fail "$(rel "$1"): missing (required by this gate)"
  return 1
}

json_escape() {
  # With an argument, escapes it. With none, escapes stdin. Multiple lines
  # are joined with "; ".
  if [ $# -gt 0 ]; then
    printf '%s' "$1" | _json_esc
  else
    _json_esc
  fi
}

_json_esc() {
  awk '
  BEGIN{ ORS="" }
  {
    s=$0
    gsub(/\\/,"\\\\",s)
    gsub(/"/,"\\\"",s)
    gsub(/\t/,"\\t",s)
    gsub(/\r/,"",s)
    if(NR>1) printf "; "
    printf "%s", s
  }'
}

PASS_N=0; FAIL_N=0; SKIP_N=0

report_gate() {
  gid="$1"; gname="$2"; status="$3"
  detail=""
  if [ "$status" = "fail" ]; then
    detail="$G_FAILS"
  elif [ "$status" = "skip" ]; then
    detail="$G_SKIP"
  else
    detail="$G_NOTES"
  fi
  if [ "$JSON" = "1" ]; then
    d=$(printf '%s' "$detail" | sed '/^$/d' | json_escape)
    printf '{"gate":"%s","status":"%s","name":"%s","detail":"%s"}\n' \
      "$gid" "$status" "$(printf '%s' "$gname" | json_escape)" "$d"
  else
    case "$status" in
      pass) printf 'PASS %-4s %s\n' "$gid" "$gname" ;;
      fail) printf 'FAIL %-4s %s\n' "$gid" "$gname" ;;
      skip) printf 'SKIP %-4s %s\n' "$gid" "$gname" ;;
    esac
    if [ "$status" = "fail" ]; then
      printf '%s' "$G_FAILS" | sed '/^$/d' | sed 's/^/       /'
    fi
    if [ "$status" = "skip" ]; then
      printf '%s\n' "$G_SKIP" | sed '/^$/d' | sed 's/^/       reason: /'
    fi
    if [ -n "$G_NOTES" ]; then
      printf '%s' "$G_NOTES" | sed '/^$/d' | sed 's/^/       note: /'
    fi
  fi
}

run_gate() {
  gid="$1"; gname="$2"; gfn="$3"
  G_FAILS=""; G_NOTES=""; G_SKIP=""
  "$gfn"
  if [ -n "$G_SKIP" ]; then
    status=skip; SKIP_N=$((SKIP_N+1))
  elif [ -n "$G_FAILS" ]; then
    status=fail; FAIL_N=$((FAIL_N+1))
  else
    status=pass; PASS_N=$((PASS_N+1))
  fi
  report_gate "$gid" "$gname" "$status"
}

# ================================================================ the gates

# ---- G0 The substantive floor -------------------------------------------
# Required classes per key, from gates.md. key;class,class,...
# `what-was-bought` is a commercial class and only a client root has bought
# anything. A personal root onboarding someone's own notes is not a purchased
# engagement, so the other four types owe `what-this-root-is-for` in its place.
# Round 4 of the pre-push gate found this table applied to every type.
if [ "$ROOT_TYPE" = "client" ]; then
  G0_ABOUT='what-was-bought,who-confirms,hard-constraints'
else
  G0_ABOUT='what-this-root-is-for,who-confirms,hard-constraints'
fi
G0_TABLE="about;$G0_ABOUT
voice;register-decision,register-confirmation
design;design-source
competitors;set,set-confirmed-by,set-date"

perkey_value() {
  # $1 = key. Reads only the ## Per-key close section of run-record.md.
  [ -f "$RUNREC" ] || return 1
  section_body "$RUNREC" "## Per-key close" > "$TMPD/perkey.txt" 2>/dev/null
  kv "$TMPD/perkey.txt" "$1"
}

claims_located_count() {
  # $1 key, $2 class. A located row only counts when the claim actually
  # reached a bound file: it carries an anchor, names a bound file, and that
  # file contains that anchor. Counting rows alone let a key close complete on
  # detached bookkeeping while its headings said Not available.
  awk -v K="$1" -v C="$2" -v US="$US" '
  BEGIN{ n=0 }
  {
    split($0,f,US)
    if(f[2]!=K) next
    if(f[3]!=C) next
    if(f[4]!="located" && f[4]!="located-elsewhere-and-citation-corrected") next
    anch=f[5]; bf=f[6]
    if(anch=="" || anch=="-") next
    if(bf=="" || bf=="-") next
    print anch US bf
    n++
  }' "$TMPD/g0-claims.txt" | while IFS="$US" read -r anch bf; do
    [ -n "$anch" ] || continue
    id=$(printf '%s' "$anch" | tr -d '[]')
    bfp=$(printf '%s' "$bf" | tr -d '`' | sed 's#^\./##')
    case "$bfp" in
      memory/*.md) ;;
      *) continue ;;                 # a bound file, not the record itself
    esac
    [ -f "$ROOT/$bfp" ] || continue
    grep -qF "[$id]" "$ROOT/$bfp" 2>/dev/null || continue
    printf 'x\n'
  done | wc -l | tr -d ' '
}

gate_G0() {
  need_file "$RUNREC" || return
  need_file "$VERIF" || return
  if ! has_heading "$RUNREC" "## Per-key close"; then
    add_fail "$(rel "$RUNREC"): no '## Per-key close' section"
    return
  fi
  if table_get "$VERIF" "Claims" "Key,Class,Outcome,Anchor,Bound file" > "$TMPD/g0-claims.txt" 2>/dev/null; then :; else
    add_fail "$(rel "$VERIF"): no '## Claims' table carrying the columns Key, Class, Outcome, Anchor, Bound file"
    return
  fi
  while IFS=';' read -r key classes; do
    [ -n "$key" ] || continue
    val=$(perkey_value "$key")
    if [ -z "$val" ]; then
      # A key that was never offered has nothing to close. The competitors
      # offer is made for every client root, for an org root when the requester
      # wants a set on record, and for the other three when the requester asks,
      # so what decides is `competitors-offer` and not the type: a missing line
      # is the recorded answer only where that field reads `not-offered`. G1 still requires the
      # competitors-offer field itself to be present and non-empty.
      if [ "$key" = "competitors" ] && printf '%s' "$(kv "$RUNREC" "competitors-offer")" | grep -q '^not-offered'; then
        add_note "competitors: the offer was not made, so no per-key close line is owed"
        continue
      fi
      add_fail "$(rel "$RUNREC"): '## Per-key close' has no line for key '$key'"
      continue
    fi
    if [ "$key" = "competitors" ] && [ "$val" = "unbound" ]; then
      # Unbound is the answer to a declined or deferred offer. Where the offer
      # was accepted there is a set to record, so unbound would skip the
      # competitor classes on a key that owes them.
      case "$(kv "$RUNREC" "competitors-offer")" in
        not-now|no) add_note "competitors: unbound: the offer was declined or deferred, so the competitor classes are not applicable" ;;
        yes)        add_fail "$(rel "$RUNREC"): 'competitors-offer: yes' but the per-key close reads unbound; an accepted offer closes complete, provisional or blocked" ;;
        not-offered:*) add_fail "$(rel "$RUNREC"): the offer was never made, so no competitors line is owed; unbound is the answer to a declined offer" ;;
        *)          add_fail "$(rel "$RUNREC"): 'competitors: unbound' but competitors-offer does not record a declined or deferred offer" ;;
      esac
      continue
    fi
    [ "$val" = "complete" ] || continue
    if [ "$key" = "competitors" ]; then
      # A competitor set is only recorded where the key resolves. Anchors in
      # another memory file are not that, and neither is an unbound key.
      if ! grep -qE '^[[:space:]]*-[[:space:]]*competitors:[[:space:]]*memory/competitors\.md[[:space:]]*$' "$AGENTS" 2>/dev/null; then
        add_fail "$(rel "$AGENTS"): 'competitors: complete' but Provides does not bind competitors to memory/competitors.md"
      fi
      [ -s "$ROOT/memory/competitors.md" ] || add_fail "$(rel "$RUNREC"): 'competitors: complete' but memory/competitors.md is missing or empty"
    fi
    oldifs="$IFS"; IFS=','
    for cls in $classes; do
      IFS="$oldifs"
      n=$(claims_located_count "$key" "$cls")
      if [ "$n" -lt 1 ]; then
        add_fail "$(rel "$VERIF"): key '$key' closes complete but '## Claims' has no located row for required class '$cls' whose anchor appears in the bound file it names"
      fi
      IFS=','
    done
    IFS="$oldifs"
  done <<G0EOF
$G0_TABLE
G0EOF
}

# ---- G1 Scope recorded ---------------------------------------------------
gate_G1() {
  need_file "$RUNREC" || return
  for k in type name destination tier research-branch consent competitors-offer; do
    if ! has_key "$RUNREC" "$k"; then
      add_fail "$(rel "$RUNREC"): key line '$k:' missing"
      continue
    fi
    v=$(kv "$RUNREC" "$k")
    if [ -z "$v" ]; then
      add_fail "$(rel "$RUNREC"): key line '$k:' has an empty value"
      continue
    fi
    case "$k" in
      tier)
        case "$v" in full|core) ;; *) add_fail "$(rel "$RUNREC"): tier '$v' is not full or core" ;; esac ;;
      research-branch)
        case "$v" in research-first|interview-first|no-research) ;;
          *) add_fail "$(rel "$RUNREC"): research-branch '$v' is not one of research-first, interview-first, no-research" ;; esac ;;
      competitors-offer)
        case "$v" in
          yes|not-now|no) ;;
          not-offered:*)
            rest=$(printf '%s' "$v" | sed 's/^not-offered:[[:space:]]*//')
            case "$rest" in
              "")       add_fail "$(rel "$RUNREC"): competitors-offer 'not-offered:' names no type" ;;
              client)   add_fail "$(rel "$RUNREC"): competitors-offer 'not-offered: client' but the offer is made for every client root; record yes, not-now or no" ;;
              personal|org|department|industry) ;;
              *)        add_fail "$(rel "$RUNREC"): competitors-offer 'not-offered: $rest' names no root type" ;;
            esac
            [ "$rest" = "$ROOT_TYPE" ] || [ "$rest" = "" ] || [ "$rest" = "client" ] || \
              add_fail "$(rel "$RUNREC"): competitors-offer 'not-offered: $rest' but this root declares type $ROOT_TYPE" ;;
          *) add_fail "$(rel "$RUNREC"): competitors-offer '$v' is not one of yes, not-now, no, 'not-offered: <type>'" ;;
        esac ;;
    esac
  done
}

# ---- G2 Extraction complete and duplicates proved ------------------------
lead_number() { printf '%s' "$1" | awk '{print $1}'; }

gate_G2() {
  if [ ! -d "$EXTRACT_DIR" ]; then
    if [ "$(source_count)" -eq 0 ]; then
      add_note "no documents were supplied, so there is nothing to extract and this gate does not apply; the close report names it"
    else
      add_fail "$(rel "$EXTRACT_DIR") does not exist, but $(source_count) document(s) sit under $(rel "$SRC_DIR"); every source carries an extraction record"
    fi
    return
  fi
  n=0
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    n=$((n+1))
    r=$(rel "$f")
    em=$(kv "$f" "extract-measure"); cm=$(kv "$f" "check-measure")
    emech=$(kv "$f" "extract-mechanism"); cmech=$(kv "$f" "check-mechanism")
    if [ -z "$em" ]; then add_fail "$r: extract-measure missing or empty"; fi
    if [ -z "$cm" ]; then add_fail "$r: check-measure missing or empty"; fi
    if [ -n "$em" ] && [ -n "$cm" ]; then
      a=$(lead_number "$em"); b=$(lead_number "$cm")
      case "$a" in ''|*[!0-9.]*) add_fail "$r: extract-measure '$em' does not lead with a number" ; a="" ;; esac
      case "$b" in ''|*[!0-9.]*) add_fail "$r: check-measure '$cm' does not lead with a number" ; b="" ;; esac
      if [ -n "$a" ] && [ -n "$b" ] && [ "$a" != "$b" ]; then
        add_fail "$r: extract-measure ($a) and check-measure ($b) disagree"
      fi
    fi
    if [ -z "$emech" ]; then add_fail "$r: extract-mechanism missing or empty"; fi
    if [ -z "$cmech" ]; then add_fail "$r: check-mechanism missing or empty"; fi
    if [ -n "$emech" ] && [ "$emech" = "$cmech" ]; then
      add_fail "$r: extract-mechanism and check-mechanism are the same mechanism ('$emech')"
    fi
  done < <(list_md "$EXTRACT_DIR")
  if [ "$n" -eq 0 ]; then
    set_skip "$(rel "$EXTRACT_DIR") holds no extraction records"
  fi
}

# ---- G3 Copy established -------------------------------------------------
vantage_mech() { printf '%s' "$1" | awk -F'->' '{print $1}' | sed 's/[[:space:]]*$//'; }
vantage_count() { printf '%s' "$1" | awk -F'->' '{print $2}' | grep -oE '[0-9]+' | head -1; }

gate_G3() {
  need_file "$RUNREC" || return
  v1=$(kv "$RUNREC" "vantage-1")
  v2=$(kv "$RUNREC" "vantage-2")
  r=$(rel "$RUNREC")
  if [ -z "$v1" ]; then add_fail "$r: vantage-1 missing or empty"; fi
  if [ -z "$v2" ]; then add_fail "$r: vantage-2 missing or empty"; fi
  [ -n "$v1" ] && [ -n "$v2" ] || return
  if [ "$v2" = "single-vantage-host" ]; then
    if [ ! -f "$CLOSE" ]; then
      add_fail "$(rel "$CLOSE"): missing: vantage-2 is single-vantage-host and the close report must say so"
    elif ! grep -q "single-vantage-host" "$CLOSE" 2>/dev/null; then
      add_fail "$(rel "$CLOSE"): vantage-2 is single-vantage-host but the close report does not say so"
    fi
    return
  fi
  m1=$(vantage_mech "$v1"); m2=$(vantage_mech "$v2")
  c1=$(vantage_count "$v1"); c2=$(vantage_count "$v2")
  if [ -z "$m1" ] || [ -z "$m2" ]; then
    add_fail "$r: a vantage line does not read '<mechanism> -> <n> files'"
  elif [ "$m1" = "$m2" ]; then
    add_fail "$r: vantage-1 and vantage-2 name the same mechanism ('$m1')"
  fi
  if [ -z "$c1" ] || [ -z "$c2" ]; then
    add_fail "$r: a vantage line carries no file count"
  elif [ "$c1" != "$c2" ]; then
    add_fail "$r: vantage file counts disagree ($c1 vs $c2)"
  fi
}

# ---- G4 Evidence packages are evidence -----------------------------------
gate_G4() {
  if [ ! -d "$EVID_DIR" ]; then
    tierv=$(kv "$RUNREC" "tier" 2>/dev/null)
    if [ "$tierv" = "core" ]; then
      # the onboarding phases makes per-angle packages a full-tier artifact, and the Tier
      # section retires G4 with them. A skip is not a pass, so without this a
      # correctly run core-tier root could never exit 0 from its own harness.
      add_note "tier: core, so per-angle evidence packages and this gate do not apply; the close report names it"
    else
      set_skip "$(rel "$EVID_DIR") does not exist: no evidence packages to check"
    fi
    return
  fi
  n=0
  : > "$TMPD/g4-rows.txt"
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    n=$((n+1))
    r=$(rel "$f")
    for k in angle retrieval-mechanism; do
      v=$(kv "$f" "$k")
      [ -n "$v" ] || add_fail "$r: '$k:' missing or empty"
    done
    # Quotations
    if table_get "$f" "Quotations" "Row,Quote,URL,Retrieved" > "$TMPD/g4q.txt" 2>/dev/null; then
      if [ ! -s "$TMPD/g4q.txt" ]; then
        add_fail "$r: '## Quotations' table has no data rows"
      fi
      while IFS="$US" read -r ln row quote url retrieved; do
        [ -n "$ln" ] || continue
        printf '%s\t%s\t%s\n' "$row" "$r" "$ln" >> "$TMPD/g4-rows.txt"
        echo "$row" | grep -qE '^E[0-9]+$' || add_fail "$r line $ln: quotation Row '$row' is not an E<n> id"
        [ -n "$url" ] || add_fail "$r line $ln: quotation row $row carries no URL"
        echo "$retrieved" | grep -qE '[0-9]{4}-[0-9]{2}-[0-9]{2}' || \
          add_fail "$r line $ln: quotation row $row has no YYYY-MM-DD Retrieved date ('$retrieved')"
      done < "$TMPD/g4q.txt"
    else
      add_fail "$r: no '## Quotations' table with the columns Row, Quote, URL, Retrieved"
    fi
    # Values
    if table_get "$f" "Values" "Row,Value,File,Line" > "$TMPD/g4v.txt" 2>/dev/null; then
      if [ ! -s "$TMPD/g4v.txt" ]; then
        add_fail "$r: '## Values' table has no data rows"
      fi
      while IFS="$US" read -r ln row value vfile vline; do
        [ -n "$ln" ] || continue
        printf '%s\t%s\t%s\n' "$row" "$r" "$ln" >> "$TMPD/g4-rows.txt"
        echo "$row" | grep -qE '^E[0-9]+$' || add_fail "$r line $ln: value Row '$row' is not an E<n> id"
        [ -n "$vfile" ] || add_fail "$r line $ln: value row $row names no file"
        # A value read from a file has a line; a value read from a page has a
        # place on the page. Both are locators and both let someone re-find
        # it. What does not is "n/a" or a dash, which is the disguise this
        # clause exists to catch.
        vlow=$(printf '%s' "$vline" | tr 'A-Z' 'a-z' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
        case "$vlow" in
          ''|'-'|'n/a'|'na'|'none'|'various'|'unknown')
            add_fail "$r line $ln: value row $row has no locator ('$vline'); a value carries the line it was read from, or the named place on the page" ;;
        esac
      done < "$TMPD/g4v.txt"
    else
      add_fail "$r: no '## Values' table with the columns Row, Value, File, Line"
    fi
    # Not retrieved
    if table_get "$f" "Not retrieved" "Item,Reason" > "$TMPD/g4n.txt" 2>/dev/null; then
      [ -s "$TMPD/g4n.txt" ] || add_fail "$r: '## Not retrieved' table has no data rows"
      while IFS="$US" read -r ln item reason; do
        [ -n "$ln" ] || continue
        [ -n "$item" ] && [ -n "$reason" ] || add_fail "$r line $ln: '## Not retrieved' row has an empty cell"
      done < "$TMPD/g4n.txt"
    else
      add_fail "$r: no '## Not retrieved' table with the columns Item, Reason"
    fi
    # (P) spot checks: the rows must exist and each must name an outcome.
    if table_get "$f" "Spot checks" "Outcome" > "$TMPD/g4s.txt" 2>/dev/null; then
      sc=$(wc -l < "$TMPD/g4s.txt" | tr -d ' ')
      if [ "$sc" -lt 3 ]; then
        add_fail "$r: '## Spot checks' carries $sc rows, three are required"
      fi
      while IFS="$US" read -r ln outcome; do
        [ -n "$ln" ] || continue
        [ -n "$outcome" ] || add_fail "$r line $ln: spot-check row names no outcome"
      done < "$TMPD/g4s.txt"
    else
      add_fail "$r: no '## Spot checks' table with an Outcome column (P clause: rows must exist and name an outcome)"
    fi
  done < <(list_md "$EVID_DIR")
  if [ "$n" -eq 0 ]; then
    set_skip "$(rel "$EVID_DIR") holds no evidence packages"
    return
  fi
  # E ids unique across every package in the run.
  if [ -s "$TMPD/g4-rows.txt" ]; then
    while IFS= read -r dup; do
      [ -n "$dup" ] || continue
      where=$(awk -F'\t' -v d="$dup" '$1==d{printf "%s line %s; ", $2, $3}' "$TMPD/g4-rows.txt")
      add_fail "evidence row id '$dup' is not unique across packages: $where"
    done < <(awk -F'\t' '{print $1}' "$TMPD/g4-rows.txt" | sort | uniq -d)
  fi
}

# ---- G5a Read-back coverage ---------------------------------------------
verif_row_ids() {
  # every Row id in ## Claims and ## Negative claims
  { table_get "$VERIF" "Claims" "Row" 2>/dev/null
    table_get "$VERIF" "Negative claims" "Row" 2>/dev/null
  } | awk -v US="$US" '{ split($0,f,US); if(f[2]!="") print f[2] }' | sort -u
}

gate_G5a() {
  if [ ! -d "$MEM" ]; then
    set_skip "$(rel "$MEM") does not exist: no bound files to read back"
    return
  fi
  bf=$(bound_files | wc -l | tr -d ' ')
  if [ "$bf" -eq 0 ]; then
    set_skip "$(rel "$MEM") holds no bound markdown files"
    return
  fi
  need_file "$VERIF" || return
  verif_row_ids > "$TMPD/g5a-rows.txt"

  # Forward: every anchor in a bound file has a row.
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    r=$(rel "$f")
    while IFS= read -r hit; do
      [ -n "$hit" ] || continue
      ln=$(printf '%s' "$hit" | awk -F: '{print $1}')
      anchor=$(printf '%s' "$hit" | sed 's/^[0-9]*://')
      id=$(printf '%s' "$anchor" | tr -d '[]')
      if ! grep -qx "$id" "$TMPD/g5a-rows.txt" 2>/dev/null; then
        add_fail "$r line $ln: anchor [$id] has no row in verification.md '## Claims' or '## Negative claims'"
      fi
    done < <(grep -onE '\[V[0-9]+\]' "$f" 2>/dev/null | sort -u -t: -k1,1n -k2,2)
  done < <(bound_files)

  # Backward: every candidate load-bearing sentence carries an anchor.
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    r=$(rel "$f")
    while IFS= read -r msg; do
      [ -n "$msg" ] || continue
      add_fail "$r $msg"
    done < <(awk -v rootname="$ROOTNAME" "$AWK_LIB"'
    BEGIN{
      nr=split(tolower(rootname),RW,/[^a-z0-9'\'']+/)
      for(q=1;q<=nr;q++) if(RW[q]!="") ROOTW[RW[q]]=1
      no=split("the this that these those a an it its their his her our your my we they he she there here what when where which who whom whose how why if unless because although though while after before since until once every each all both any some no none one two three four five next last other another such same both either neither not never do does did is are was were be been being has have had can could might must shall should would about above across against among around at by for from in into of off on onto over per through to under upon with within without and or but so yet for nor as than then thus hence therefore however moreover furthermore instead rather still also only just even",OP," ")
      for(q=1;q<=no;q++) OPENER[OP[q]]=1
    }
    { L[NR]=$0 }
    END{
      inpre=0
      for(i=1;i<=NR;i++){
        line=L[i]
        if(line ~ /<!--[ \t]*provenance-preamble[ \t]*-->/){ inpre=1; continue }
        if(line ~ /<!--[ \t]*\/provenance-preamble[ \t]*-->/){ inpre=0; continue }
        if(inpre) continue
        t=trim(line)
        if(t=="") continue
        if(t ~ /^#/) continue                      # heading
        if(t ~ /^\|/) continue                     # table row: G11b and G13b own tables
        if(t ~ /^\*.*\*$/) continue                # prompt line
        if(is_sep(t)) continue                     # table separator
        if(isrow(t) && i<NR && is_sep(L[i+1])) continue   # table header
        n=split(line,S,/\. /)
        # A dotted abbreviation is not a full stop. Splitting on ". " cuts
        # "e.g. Example Ltd." in half and reports the orphan as an unanchored
        # sentence while the anchor sits on the other half. Rejoin any
        # fragment whose last token is a dotted abbreviation or a single
        # initial, which is what the split left behind when it ate the dot.
        k=1
        while(k<n){
          nw=split(S[k],AW,/[ \t]+/)
          lastw=AW[nw]
          if(lastw ~ /^[A-Za-z](\.[A-Za-z])+$/ || lastw ~ /^[A-Z]$/ || lastw ~ /^(Mr|Mrs|Ms|Dr|Prof|Inc|Ltd|Co|St|No|vs|etc|Jr|Sr)$/){
            S[k]=S[k] ". " S[k+1]
            for(m=k+1;m<n;m++) S[m]=S[m+1]
            n--
          } else k++
        }
        # an anchor written after the full stop belongs to the sentence
        # before it, so pull it back before testing.
        for(k=2;k<=n;k++){
          tmp=S[k]
          while(match(tmp,/^[ \t]*\[V[0-9]+\]/)){
            S[k-1]=S[k-1] " " substr(tmp,RSTART,RLENGTH)
            tmp=substr(tmp,RSTART+RLENGTH)
          }
          S[k]=tmp
        }
        for(k=1;k<=n;k++){
          s=trim(S[k])
          if(s=="") continue
          low=tolower(s)
          cand=0
          # The spec names five claim triggers, not three. Phase 3 of the skill:
          # "a number, a proper noun, a quotation, a prohibition, or a comparative".
          if(s ~ /[0-9]/) cand=1
          # The trigger is "a number", not "a digit". A figure spelled out in
          # words is still a figure, and F20 in the catalogue is an auditor
          # missing exactly that.
          if(low ~ /(^|[^a-z])(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|dozen|half|quarter|third|twice|thrice)([^a-z]|$)/) cand=1
          if(index(s,"\"")>0) cand=1
          if(low ~ /must not|never|may not|forbidden|prohibited|do not|not permitted/) cand=1
          # A declared absence has nothing to read back against.
          if(s ~ /\[Not available:/) continue
          # Proper noun: a capitalized word that is not the first word of the
          # sentence, and that is not part of the root name. A sentence whose
          # only proper noun is the subject itself is structural prose, not a
          # claim; anything load-bearing names a person, a competitor, a
          # document or a place as well. Over-flags rather than under-flags: a
          # false positive costs one anchor, a false negative costs an
          # unread claim.
          body=s
          sub(/^[-*+][ \t]+/,"",body)             # strip a list marker
          sub(/^[0-9]+\.[ \t]+/,"",body)          # strip an ordered marker
          nb=split(body,W,/[ \t]+/)
          # Word 1 is capitalized in every sentence, so it is tested against a
          # stoplist of ordinary sentence openers instead of being skipped.
          # Skipping it let "Nakamura chairs the review board" close unread.
          if(nb>=1){
            w1=W[1]
            gsub(/^[("\x27`\[]+/,"",w1)
            gsub(/[)"\x27`\].,;:!?]+$/,"",w1)
            if(w1 ~ /^[A-Z][A-Za-z\x27-]+$/ && !OPENER[tolower(w1)] \
               && !(ROOTW[tolower(w1)] && index(tolower(s),tolower(rootname))>0)) cand=1
          }
          for(w=2;w<=nb;w++){
            word=W[w]
            gsub(/^[("'\''`\[]+/,"",word)
            gsub(/[)"'\''`\].,;:!?]+$/,"",word)
            if(word !~ /^[A-Z][A-Za-z'\''-]+$/) continue
            if(ROOTW[tolower(word)] && index(tolower(s),tolower(rootname))>0) continue
            cand=1; break
          }
          # Comparative: closed marker list plus the "-er than" construction.
          # Bare "than" is deliberately absent: "rather than" is not a claim.
          # This awk does not honor \b. Written with explicit boundaries, and
          # verified against the platform rather than assumed.
          if(low ~ /(^|[^a-z])(more|less|fewer|greater|larger|smaller|higher|lower|better|worse|stronger|weaker|faster|slower|outperform|outperforms|outpace|outpaces|outsell|outsells|lead|leads|leading|largest|biggest|smallest|highest|lowest|best|worst|most|least|only|top|dominant|rank|ranks|ranked|ranking|versus|first|second|third|ahead|behind|premier|foremost|unmatched|unrivalled|unrivaled)([^a-z]|$)/) cand=1
          if(low ~ /ahead of|[a-z]er than/) cand=1
          if(!cand) continue
          if(s ~ /\[V[0-9]+\]/) continue
          disp=s
          if(length(disp)>90) disp=substr(disp,1,90) "..."
          printf "line %d: candidate load-bearing sentence carries no [V<n>] anchor: %s\n", i, disp
        }
      }
    }' "$f")
  done < <(bound_files)
}

# ---- G5b Read-back disposition ------------------------------------------
gate_G5b() {
  need_file "$VERIF" || return
  ok=0
  if table_get "$VERIF" "Claims" "Row,Anchor,Outcome,Label,Search" > "$TMPD/g5b.txt" 2>/dev/null; then
    ok=1
    while IFS="$US" read -r ln row anchor outcome label search; do
      [ -n "$ln" ] || continue
      case "$outcome" in
        located|located-elsewhere-and-citation-corrected|not-located) ;;
        *) add_fail "$(rel "$VERIF") line $ln: row $row Outcome '$outcome' is not one of located, located-elsewhere-and-citation-corrected, not-located" ; continue ;;
      esac
      if [ "$outcome" = "not-located" ] && [ "$anchor" != "-" ] && [ -n "$anchor" ]; then
        if [ "$label" != "Unverified" ]; then
          add_fail "$(rel "$VERIF") line $ln: row $row is not-located with anchor $anchor but Label is '$label', not Unverified"
        fi
        if [ -z "$search" ] || [ "$search" = "-" ]; then
          add_fail "$(rel "$VERIF") line $ln: row $row is not-located with anchor $anchor but Search is empty"
        fi
      fi
    done < "$TMPD/g5b.txt"
  else
    add_fail "$(rel "$VERIF"): no '## Claims' table with the columns Row, Anchor, Outcome, Label, Search"
  fi
  if table_get "$VERIF" "Negative claims" "Row,Outcome" > "$TMPD/g5bn.txt" 2>/dev/null; then
    ok=1
    while IFS="$US" read -r ln row outcome; do
      [ -n "$ln" ] || continue
      case "$outcome" in
        located|located-elsewhere-and-citation-corrected|not-located) ;;
        *) add_fail "$(rel "$VERIF") line $ln: negative row $row Outcome '$outcome' is not one of the three permitted values" ;;
      esac
    done < "$TMPD/g5bn.txt"
  else
    add_fail "$(rel "$VERIF"): no '## Negative claims' table with the columns Row, Outcome"
  fi
  [ "$ok" = "1" ] || true
}

# ---- G5c Negative claims enumerated -------------------------------------
NEG_GRAMMAR='not attributed|unattributed|does not say|does not contain|does not state|no such|nowhere|never said|never stated|never attributed'

gate_G5c() {
  if [ ! -d "$MEM" ]; then
    set_skip "$(rel "$MEM") does not exist: no bound files to scan"
    return
  fi
  need_file "$VERIF" || return
  # negative rows, keyed by anchor
  if table_get "$VERIF" "Negative claims" "Row,Anchor,All containers,Second reader,Outcome" > "$TMPD/g5c-neg.txt" 2>/dev/null; then :; else
    add_fail "$(rel "$VERIF"): no '## Negative claims' table with the columns Row, Anchor, All containers, Second reader, Outcome"
    : > "$TMPD/g5c-neg.txt"
  fi
  if table_get "$VERIF" "Claims" "Row,Anchor,Label" > "$TMPD/g5c-claims.txt" 2>/dev/null; then :; else
    : > "$TMPD/g5c-claims.txt"
  fi

  while IFS= read -r f; do
    [ -n "$f" ] || continue
    r=$(rel "$f")
    while IFS= read -r rec; do
      [ -n "$rec" ] || continue
      ln=$(printf '%s' "$rec" | awk -v US="$US" '{split($0,f,US); print f[1]}')
      anchor=$(printf '%s' "$rec" | awk -v US="$US" '{split($0,f,US); print f[2]}')
      isproh=$(printf '%s' "$rec" | awk -v US="$US" '{split($0,f,US); print f[3]}')
      snip=$(printf '%s' "$rec" | awk -v US="$US" '{split($0,f,US); print f[4]}')
      if [ -z "$anchor" ]; then
        add_fail "$r line $ln: negative claim carries no [V<n>] anchor: $snip"
        continue
      fi
      negrow=$(awk -v US="$US" -v a="$anchor" '{split($0,f,US); if(f[3]==a || f[3]=="["a"]" || f[2]==a) print $0}' "$TMPD/g5c-neg.txt" | head -1)
      if [ -z "$negrow" ]; then
        add_fail "$r line $ln: anchor [$anchor] on a negative claim has no row in '## Negative claims'"
        continue
      fi
      nrow=$(printf '%s' "$negrow" | awk -v US="$US" '{split($0,f,US); print f[2]}')
      allc=$(printf '%s' "$negrow" | awk -v US="$US" '{split($0,f,US); print f[4]}')
      second=$(printf '%s' "$negrow" | awk -v US="$US" '{split($0,f,US); print f[5]}')
      outcome=$(printf '%s' "$negrow" | awk -v US="$US" '{split($0,f,US); print f[6]}')
      if [ "$allc" != "yes" ]; then
        lbl=$(awk -v US="$US" -v a="$anchor" '{split($0,f,US); if(f[3]==a || f[3]=="["a"]") print f[4]}' "$TMPD/g5c-claims.txt" | head -1)
        if [ "$outcome" = "not-located" ] && [ "$lbl" = "Unverified" ]; then
          :
        else
          add_fail "$(rel "$VERIF"): negative row $nrow (anchor $anchor) has 'All containers: $allc' and is not a not-located claim labeled Unverified"
        fi
      fi
      if [ "$isproh" = "1" ] && { [ "$second" = "-" ] || [ -z "$second" ]; }; then
        add_fail "$(rel "$VERIF"): negative row $nrow (anchor $anchor) anchors a prohibition but 'Second reader' is '-'"
      fi
    done < <(awk -v US="$US" -v NEG="$NEG_GRAMMAR" "$AWK_LIB"'
    { L[NR]=$0 }
    END{
      inpre=0
      for(i=1;i<=NR;i++){
        line=L[i]
        if(line ~ /<!--[ \t]*provenance-preamble[ \t]*-->/){ inpre=1; continue }
        if(line ~ /<!--[ \t]*\/provenance-preamble[ \t]*-->/){ inpre=0; continue }
        if(inpre) continue
        t=trim(line)
        if(t=="") continue
        if(t ~ /^#/) continue
        if(t ~ /^\*.*\*$/) continue
        if(is_sep(t)) continue
        if(isrow(t) && i<NR && is_sep(L[i+1])) continue
        n=split(line,S,/\. /)
        for(k=2;k<=n;k++){
          tmp=S[k]
          while(match(tmp,/^[ \t]*\[V[0-9]+\]/)){
            S[k-1]=S[k-1] " " substr(tmp,RSTART,RLENGTH)
            tmp=substr(tmp,RSTART+RLENGTH)
          }
          S[k]=tmp
        }
        for(k=1;k<=n;k++){
          s=trim(S[k]); if(s=="") continue
          low=tolower(s)
          if(low !~ NEG) continue
          anchor=""
          if(match(s,/\[V[0-9]+\]/)) anchor=substr(s,RSTART+1,RLENGTH-2)
          proh=0
          if(low ~ /must not|never|may not|forbidden|prohibited|do not/) proh=1
          disp=s; if(length(disp)>90) disp=substr(disp,1,90) "..."
          printf "%d%s%s%s%d%s%s\n", i, US, anchor, US, proh, US, disp
        }
      }
    }' "$f")
  done < <(bound_files)
}

# ---- G6 The forward gate -------------------------------------------------
F15_DISGUISE='not present in source|no prohibitions in source|none found|nothing to disposition|n/a'

where_resolves() {
  # $1 = Where cell for an in-bound-file row. Prints an error, or nothing.
  w="$1"
  path=$(printf '%s' "$w" | awk -F'#' '{print $1}' | sed 's/[[:space:]]*$//' | sed 's/^[[:space:]]*//' | tr -d '`')
  anchor=$(printf '%s' "$w" | sed 's/^[^#]*#//' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
  if [ -z "$path" ]; then printf '%s' "Where names no file"; return; fi
  case "$w" in
    *'#'*) ;;
    *) printf '%s' "Where '$w' carries no #anchor-or-heading"; return ;;
  esac
  target="$ROOT/$path"
  case "$path" in
    /*) target="$path" ;;
  esac
  if [ ! -f "$target" ]; then printf '%s' "Where names '$path', which does not exist under the root"; return; fi
  if [ -z "$anchor" ]; then printf '%s' "Where '$w' carries an empty anchor"; return; fi
  if awk -v A="$anchor" "$AWK_LIB"'
    BEGIN{ la=tolower(A); sa=slug(A); found=0 }
    {
      if(index(tolower($0),la)>0) found=1
      t=trim($0)
      if(t ~ /^#+([ \t])/){
        h=t; sub(/^#+[ \t]+/,"",h)
        if(slug(h)==sa) found=1
      }
    }
    END{ exit (found?0:1) }' "$target"; then
    return
  fi
  printf '%s' "Where anchor '$anchor' is not in $path"
}

gate_G6() {
  if [ ! -d "$EXTRACT_DIR" ]; then
    if [ "$(source_count)" -eq 0 ]; then
      add_note "no documents were supplied, so there is no must-reach list and this gate does not apply; the close report names it"
    else
      add_fail "$(rel "$EXTRACT_DIR") does not exist, but $(source_count) document(s) sit under $(rel "$SRC_DIR"); the forward gate needs a must-reach list per source"
    fi
    return
  fi
  n=0
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    n=$((n+1))
    r=$(rel "$f")
    if table_get "$f" "Must-reach list" "Item,Kind,Text,Disposition,Where" > "$TMPD/g6.txt" 2>/dev/null; then :; else
      add_fail "$r: no '## Must-reach list' table with the columns Item, Kind, Text, Disposition, Where"
      continue
    fi
    if [ ! -s "$TMPD/g6.txt" ]; then
      add_fail "$r: '## Must-reach list' has no rows"
      continue
    fi
    while IFS="$US" read -r ln item kind text disp where; do
      [ -n "$ln" ] || continue
      low=$(printf '%s %s' "$text" "$where" | tr 'A-Z' 'a-z')
      if printf '%s' "$low" | grep -qE "$F15_DISGUISE"; then
        add_fail "$r line $ln: row $item disposes of a must-reach item as absent from its own source (F15 disguise grammar)"
      fi
      # Version 4 closed the operating-file escape: downstream work loads
      # bound files and does not load the todo list, so a prohibition or a
      # compliance flag routed to the operating file reproduces F15 exactly
      # while satisfying the disposition check. Those two kinds discharge
      # only in-bound-file; commercial, person and review-note take either.
      case "$kind" in
        prohibition|compliance)
          if [ "$disp" = "in-operating-file" ]; then
            add_fail "$r line $ln: row $item is kind $kind and disposes in-operating-file; prohibition and compliance items discharge only to a bound file, because downstream work does not load the operating file"
          fi
          ;;
      esac
      case "$disp" in
        in-bound-file)
          err=$(where_resolves "$where")
          [ -z "$err" ] || add_fail "$r line $ln: row $item $err"
          ;;
        in-operating-file)
          oid=$(printf '%s' "$where" | grep -oE 'O[0-9]+' | head -1)
          if [ -z "$oid" ]; then
            add_fail "$r line $ln: row $item is in-operating-file but Where '$where' names no O<n> item"
          elif [ ! -f "$OPER" ]; then
            add_fail "$r line $ln: row $item points at $(rel "$OPER"), which is missing"
          elif ! grep -qE "(^|[^A-Za-z0-9])$oid([^0-9]|$)" "$OPER"; then
            add_fail "$r line $ln: row $item points at $oid, which is not in $(rel "$OPER")"
          fi
          ;;
        *)
          add_fail "$r line $ln: row $item Disposition '$disp' is not in-bound-file or in-operating-file"
          ;;
      esac
    done < "$TMPD/g6.txt"
  done < <(list_md "$EXTRACT_DIR")
  [ "$n" -gt 0 ] || set_skip "$(rel "$EXTRACT_DIR") holds no extraction records"
}

# ---- G6b The forward gate's coverage floor ------------------------------
# Widened in round 1. A reviewer showed that a constraint worded outside the
# list ("Only regulator-cleared claims may appear") is invisible to the floor as
# well as to the row check, so the count is satisfied without the item ever
# existing. Widening narrows that hole. It cannot close it: no keyword list is
# the set of all prohibitions. run-log.md states the residual rather than
# claiming this gate catches omission in general.
CONSTRAINT_GRAMMAR='must not|may not|must only|may only|only |never|not permitted|permitted only|prohibited|forbidden|do not|cannot|shall not|no [a-z]+ may|restricted|require[sd]? approval|sign-?off|approval|cleared|clearance|embargo|compliance|regulat|legal|confidential|under nda|not for|internal only|do not share|fee|retainer|term of|pricing|priced|invoice|scope of work|deliverable count|review note|reviewer|comment|tracked change|redline|struck out'

gate_G6b() {
  if [ ! -d "$SRC_DIR" ]; then
    add_note "no documents were supplied, so there is no coverage floor to meet and this gate does not apply; the close report names it"
    return
  fi
  if [ ! -d "$EXTRACT_DIR" ]; then
    if [ "$(source_count)" -eq 0 ]; then
      add_note "no documents were supplied, so there is no coverage floor to meet and this gate does not apply; the close report names it"
    else
      add_fail "$(rel "$EXTRACT_DIR") does not exist, but $(source_count) document(s) sit under $(rel "$SRC_DIR"); the coverage floor needs an extraction record per source"
    fi
    return
  fi
  n=0
  while IFS= read -r s; do
    [ -n "$s" ] || continue
    n=$((n+1))
    srel=$(rel "$s")
    # Headings are excluded from the floor. A section heading such as
    # "## 5. Claims and sign-off" matches the constraint grammar without being
    # a must-reach item, and counting it would demand a row for a heading.
    # Excluding a false match is honest; writing a row to satisfy a counter is
    # the bookkeeping failure this suite exists to catch.
    want=$(grep -av '^[[:space:]]*#' "$s" 2>/dev/null | grep -aciE "$CONSTRAINT_GRAMMAR")
    [ -n "$want" ] || want=0
    # Find the extraction record whose source: key names this file.
    rec=""
    base=$(basename "$s")
    while IFS= read -r e; do
      [ -n "$e" ] || continue
      sv=$(kv "$e" "source")
      [ -n "$sv" ] || continue
      sv=$(printf '%s' "$sv" | tr -d '`' | sed 's#^\./##')
      if [ "$sv" = "$srel" ] || [ "$(basename "$sv")" = "$base" ]; then
        rec="$e"; break
      fi
    done < <(list_md "$EXTRACT_DIR")
    if [ -z "$rec" ]; then
      add_fail "$srel: no extraction record under $(rel "$EXTRACT_DIR") carries 'source: $srel'"
      continue
    fi
    got=0
    if table_get "$rec" "Must-reach list" "Item,Kind" > "$TMPD/g6b.txt" 2>/dev/null; then
      got=$(awk -v US="$US" '
        { split($0,f,US); k=tolower(f[3])
          if(k=="prohibition"||k=="compliance"||k=="commercial"||k=="review-note") n++ }
        END{ print n+0 }' "$TMPD/g6b.txt")
    else
      add_fail "$(rel "$rec"): no '## Must-reach list' table with the columns Item, Kind"
      continue
    fi
    if [ "$got" -lt "$want" ]; then
      add_fail "$(rel "$rec"): $got must-reach rows of kind prohibition/compliance/commercial/review-note, but $srel has $want lines matching the constraint grammar"
    fi
  done < <(list_any "$SRC_DIR")
  [ "$n" -gt 0 ] || add_note "no documents were supplied, so there is no coverage floor to meet and this gate does not apply; the close report names it"
}

# ---- G7 Deferrals are named ---------------------------------------------
gate_G7() {
  need_file "$OPER" || return
  if table_get "$OPER" "" "Item,Status,Blocker,Attempt" > "$TMPD/g7.txt" 2>/dev/null; then :; else
    add_fail "$(rel "$OPER"): no table with the columns Item, Status, Blocker, Attempt"
    return
  fi
  while IFS="$US" read -r ln item status blocker attempt; do
    [ -n "$ln" ] || continue
    case "$status" in
      gating|blocking) ;;
      *) continue ;;
    esac
    if ! printf '%s' "$blocker" | grep -qE '^(person|credential|capability): .+'; then
      add_fail "$(rel "$OPER") line $ln: row $item is $status but Blocker '$blocker' does not match '^(person|credential|capability): .+'"
    fi
    if [ -z "$attempt" ] || [ "$attempt" = "-" ]; then
      add_fail "$(rel "$OPER") line $ln: row $item is $status but records no Attempt"
    fi
  done < "$TMPD/g7.txt"
}

# ---- G8 Exactness claims used a second mechanism ------------------------
gate_G8() {
  need_file "$VERIF" || return
  if table_get "$VERIF" "Claims" "Row,Mechanism,Exactness,Second mechanism,Label" > "$TMPD/g8.txt" 2>/dev/null; then :; else
    add_fail "$(rel "$VERIF"): no '## Claims' table with the columns Row, Mechanism, Exactness, Second mechanism, Label"
    return
  fi
  while IFS="$US" read -r ln row mech exact second label; do
    [ -n "$ln" ] || continue
    [ "$exact" = "yes" ] || continue
    [ "$label" = "Unverified" ] && continue
    if [ -z "$second" ] || [ "$second" = "-" ]; then
      add_fail "$(rel "$VERIF") line $ln: row $row is Exactness yes with an empty 'Second mechanism' and Label '$label'"
    elif [ "$second" = "$mech" ]; then
      add_fail "$(rel "$VERIF") line $ln: row $row is Exactness yes but 'Second mechanism' repeats Mechanism ('$mech')"
    fi
  done < "$TMPD/g8.txt"
}

# ---- G9 Headings answered ------------------------------------------------
gate_G9() {
  if [ ! -d "$MEM" ]; then
    set_skip "$(rel "$MEM") does not exist: nothing to check"
    return
  fi
  bf=$(bound_files | wc -l | tr -d ' ')
  if [ "$bf" -eq 0 ]; then
    set_skip "$(rel "$MEM") holds no bound markdown files"
    return
  fi
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    r=$(rel "$f")
    # (a) prompt lines
    while IFS= read -r hit; do
      [ -n "$hit" ] || continue
      add_fail "$r line ${hit%%:*}: a prompt line survives (^\\*.*\\*\$)"
    done < <(strip_preamble "$f" | grep -nE '^\*.*\*$' 2>/dev/null)
    # (b) and (c). The prompt-line scan above strips the preamble; this one
    # must too, or fenced instruction reads as a section body. strip_preamble
    # blanks its lines rather than removing them, so line numbers still match.
    strip_preamble "$f" > "$TMPD/g9body.txt"
    while IFS= read -r msg; do
      [ -n "$msg" ] || continue
      add_fail "$r $msg"
    done < <(awk "$AWK_LIB"'
    { L[NR]=$0 }
    END{
      seenhead=0
      for(i=1;i<=NR;i++){
        t=trim(L[i])
        if(t !~ /^#+([ \t]|$)/) continue
        lvl=0; while(substr(t,lvl+1,1)=="#") lvl++
        title = (seenhead==0 && lvl==1)   # the document title carries no body
        seenhead=1
        # find the next non-blank line
        j=i+1
        while(j<=NR && trim(L[j])=="") j++
        if(j>NR){
          if(!title) printf "line %d: heading \"%s\" has an empty body\n", i, t
          continue
        }
        if(trim(L[j]) ~ /^#+([ \t]|$)/){
          # A deeper heading is structure, not an empty section: the parent
          # holds children rather than prose, and each child is checked on its
          # own pass. Only a sibling or shallower heading means nothing here.
          nlvl=0; while(substr(trim(L[j]),nlvl+1,1)=="#") nlvl++
          if(nlvl>lvl) continue
          if(!title) printf "line %d: heading \"%s\" is followed by another heading with no body\n", i, t
          continue
        }
        if(title) continue
        # (c) a body that is one bare sentence carrying no label, no anchor
        # and no register parenthetical is an unlabeled deferral.
        k=j; nb=0; body=""
        while(k<=NR && trim(L[k]) !~ /^#+([ \t]|$)/){
          if(trim(L[k])!=""){ nb++; body=body " " trim(L[k]) }
          k++
        }
        body=trim(body)
        ns=split(body,SS,/\. /)
        if(ns==1 && body ~ /\.$/) ns=1
        if(nb<=1 && ns<=1 \
           && body !~ /\[(Verified|Estimated|Unverified|Not available)/ \
           && body !~ /\[V[0-9]+\]/ \
           && body !~ /\((Firsthand|Secondhand|Public statement|Research inference)/){
          d=body; if(length(d)>70) d=substr(d,1,70) "..."
          printf "line %d: heading \"%s\" is answered by a bare sentence with no bracketed label: %s\n", i, t, d
        }
      }
    }' "$TMPD/g9body.txt")
  done < <(bound_files)
}

# ---- G10 Registers used as defined --------------------------------------
DOC_GRAMMAR='\.pdf|\.docx|\.pptx|\.md|deck|document|report|guide|memo|slide'
# A person name: at least two capitalized parts, joined by a space or a
# hyphen. This is a whitelist on purpose. The document blacklist above can
# always be evaded by naming a document without a document word in it, so the
# firsthand payload has to positively look like an observer.
PERSON_GRAMMAR="(^|[^A-Za-z])[A-Z][a-z]+([ -][A-Z][a-z']+)+"
# The head noun of a role, a body, or a document. A two-capitalized-word phrase
# ending in one of these is a title or a thing, not an observer. This is a
# blacklist and it is deliberately a second line of defence behind the person
# registry, not the primary check.
NONPERSON_TAIL='(Director|Owner|Manager|Lead|Head|Officer|Chief|Counsel|Partner|Partnership|Analyst|Executive|Coordinator|Specialist|Adviser|Advisor|President|Secretary|Treasurer|Board|Council|Committee|Panel|Group|Team|Department|Division|Review|Summary|Brief|Report|Meeting|Minutes|Session|Workshop|Update|Notes|Note|Log|Register|Record|Series|Programme|Program|Project|Account|Relations|Communications|Marketing|Compliance|Legal|Operations|Function|Practice|Unit|Office|Desk|Bureau|Agency|Authority|Trust|Fund|Holdings|Ventures|Labs|Studio|Works|Outlook|Steward|Insights|Analytics)s?$'

build_person_registry() {
  : > "$TMPD/people.txt"
  # People named in the must-reach lists, and people named in the interview's
  # who-confirms answer. Both are records the run had to write anyway.
  if [ -d "$EXTRACT_DIR" ]; then
    while IFS= read -r e; do
      [ -n "$e" ] || continue
      table_get "$e" "" "Item,Kind,Text" 2>/dev/null | awk -v US="$US" '
        { split($0,f,US); if(tolower(f[3])=="person") print f[4] }'
    done < <(find "$EXTRACT_DIR" -type f -name '*.md' ! -name 'AGENTS.md' 2>/dev/null | sort) \
      >> "$TMPD/people.txt"
  fi
  if [ -f "$RUNREC" ]; then
    section_body "$RUNREC" "### Who confirms and on what basis" 2>/dev/null >> "$TMPD/people.txt"
  fi
  # Second readers are people the run named as people, so they count too.
  if [ -f "$VERIF" ]; then
    table_get "$VERIF" "Negative claims" "Row,Second reader" 2>/dev/null | awk -v US="$US" '
      { split($0,f,US); if(f[3]!="" && f[3]!="-") print f[3] }' >> "$TMPD/people.txt"
    # A person named as having run a check is a person this run recorded. On a
    # root with supplied documents the must-reach person rows carry everyone;
    # a research-first root has no extraction records at all, and the reader
    # who did the read-back was reachable nowhere, so every Firsthand register
    # naming them failed. The mechanism columns are where that run wrote them.
    table_get "$VERIF" "Claims" "Row,Mechanism,Second mechanism" 2>/dev/null | awk -v US="$US" '
      { split($0,f,US); if(f[3]!="" && f[3]!="-") print f[3]; if(f[4]!="" && f[4]!="-") print f[4] }' \
      >> "$TMPD/people.txt"
  fi
  # Reduce the registry to NAMES. Matching a payload against raw prose let
  # "Marketing Director" pass because that title sits inside a sentence about a
  # person. A name is compared to a name.
  grep -oE "$PERSON_GRAMMAR" "$TMPD/people.txt" 2>/dev/null \
    | sed 's/^[^A-Za-z]*//' | grep -vE "$NONPERSON_TAIL" | sort -u > "$TMPD/people-names.txt" || :
  mv "$TMPD/people-names.txt" "$TMPD/people.txt"
}

gate_G10() {
  build_person_registry
  if [ ! -d "$MEM" ]; then
    set_skip "$(rel "$MEM") does not exist: nothing to check"
    return
  fi
  bf=$(bound_files | wc -l | tr -d ' ')
  if [ "$bf" -eq 0 ]; then
    set_skip "$(rel "$MEM") holds no bound markdown files"
    return
  fi
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    r=$(rel "$f")
    while IFS= read -r hit; do
      [ -n "$hit" ] || continue
      ln=${hit%%:*}
      tok=$(printf '%s' "$hit" | sed 's/^[0-9]*://')
      name=$(printf '%s' "$tok" | sed 's/^(//' | awk -F: '{print $1}')
      payload=$(printf '%s' "$tok" | sed 's/^([^:)]*//' | sed 's/^://' | sed 's/)$//' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
      case "$tok" in
        *:*) ;;
        *) add_fail "$r line $ln: register '$tok' carries no payload"; continue ;;
      esac
      if [ -z "$payload" ]; then
        add_fail "$r line $ln: register '($name: )' has an empty payload"
        continue
      fi
      case "$name" in
        Firsthand)
          # Round 1 replaced a document blacklist with a name-shape test, and
          # round 2 showed a shape test is not a person test: "Category Review",
          # "Review Board" and "Account Owner" all have the shape. No regex
          # separates a person from a title-cased document, so the payload is
          # checked against the people this run actually recorded: the person
          # rows of the must-reach lists and the interview's who-confirms
          # answer. An observer nobody wrote down is not an observer.
          if printf '%s' "$payload" | tr 'A-Z' 'a-z' | grep -qE "$DOC_GRAMMAR"; then
            add_fail "$r line $ln: (Firsthand: $payload) names a document as the observer"
          elif ! printf '%s' "$payload" | grep -qE "$PERSON_GRAMMAR"; then
            add_fail "$r line $ln: (Firsthand: $payload) does not name a person who observed it; firsthand names an observer, never a document or a role alone"
          elif printf '%s' "$payload" | grep -qE "$NONPERSON_TAIL"; then
            add_fail "$r line $ln: (Firsthand: $payload) names a role, a body, or a document, not the person who observed it"
          elif [ -s "$TMPD/people.txt" ]; then
            pn=$(printf '%s' "$payload" | grep -oE "$PERSON_GRAMMAR" | sed 's/^[^A-Za-z]*//' | head -1)
            if [ -n "$pn" ] && ! grep -qixF "$pn" "$TMPD/people.txt"; then
              add_fail "$r line $ln: (Firsthand: $payload) names '$pn', who is not recorded as a person anywhere in this run; a firsthand observer appears in the must-reach person rows or in who-confirms"
            fi
          else
            add_fail "$r line $ln: (Firsthand: $payload) cannot be checked because no person was recorded anywhere in this run; who-confirms is a mandatory interview class and every named person belongs in a must-reach row"
          fi
          ;;
        'Research inference')
          if ! printf '%s' "$payload" | grep -qE 'E[0-9]+'; then
            add_fail "$r line $ln: (Research inference: $payload) names no E<n> evidence row"
          fi
          ;;
      esac
    done < <(strip_preamble "$f" | grep -onE '\((Firsthand|Secondhand|Public statement|Research inference)[^)]*\)' 2>/dev/null)
  done < <(bound_files)
}

# ---- G11 Label vocabulary is closed --------------------------------------
gate_G11() {
  if [ ! -d "$MEM" ]; then
    set_skip "$(rel "$MEM") does not exist: nothing to check"
    return
  fi
  bf=$(bound_files | wc -l | tr -d ' ')
  if [ "$bf" -eq 0 ]; then
    set_skip "$(rel "$MEM") holds no bound markdown files"
    return
  fi
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    r=$(rel "$f")
    while IFS= read -r hit; do
      [ -n "$hit" ] || continue
      ln=${hit%%:*}
      tok=$(printf '%s' "$hit" | sed 's/^[0-9]*://')
      head=$(printf '%s' "$tok" | sed 's/^\[//' | sed 's/\]$//' | awk -F: '{print $1}' | sed 's/[[:space:]]*$//')
      case "$head" in
        Verified|Estimated|Unverified|'Not available') continue ;;
        Competitor) continue ;;
      esac
      add_fail "$r line $ln: label token '[$head]' is outside the standard's four (Verified, Estimated, Unverified, Not available)"
    done < <(strip_preamble "$f" | grep -onE '\[[A-Z][A-Za-z ]*(:[^]]*)?\]' 2>/dev/null)
  done < <(bound_files)
}

# ---- G11b Figure tables carry their provenance ---------------------------
# A figures heading is one the template marks with an <!-- figures --> comment
# (on the heading line or immediately under it) or whose text names figures.
# Any table carrying a Figure column is treated as a figures table as well, so
# a table that lost its Label column is still caught.
gate_G11b() {
  if [ ! -d "$MEM" ]; then
    set_skip "$(rel "$MEM") does not exist: nothing to check"
    return
  fi
  bf=$(bound_files | wc -l | tr -d ' ')
  if [ "$bf" -eq 0 ]; then
    set_skip "$(rel "$MEM") holds no bound markdown files"
    return
  fi
  found_any=0
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    r=$(rel "$f")
    out=$(awk "$AWK_LIB"'
    BEGIN{
      nreq=split("Figure,Unit,Denominator,Tool,Window,Label,Source",req,",")
    }
    { L[NR]=$0 }
    END{
      figs=0; hdr=0
      for(i=1;i<=NR;i++){
        line=L[i]; t=trim(line)
        if(t ~ /^#+([ \t]|$)/){
          hdr=0; figs=0
          h=t; sub(/^#+[ \t]*/,"",h)
          if(tolower(h) ~ /figure/) figs=1
          if(line ~ /<!--[ \t]*figures[ \t]*-->/) figs=1
          j=i+1
          while(j<=NR && trim(L[j])=="") j++
          if(j<=NR && trim(L[j]) ~ /<!--[ \t]*figures[ \t]*-->/) figs=1
          heading=t
          continue
        }
        if(hdr==0){
          if(isrow(line) && i<NR && is_sep(L[i+1])){
            m=ncells(line,c); split("",col,":")
            for(k=1;k<=m;k++) col[c[k]]=k
            istable = figs
            if("Figure" in col) istable=1
            if(!istable) continue
            print "TABLE"
            miss=""
            for(k=1;k<=nreq;k++) if(!(req[k] in col)) miss=miss (miss==""?"":", ") req[k]
            if(miss!="") printf "line %d: figures table under \"%s\" is missing the column(s): %s\n", i, heading, miss
            hdr=1; ncols=m
            i++
            continue
          }
          continue
        }
        if(!isrow(line)){ hdr=0; continue }
        if(is_sep(line)) continue
        m=ncells(line,c)
        for(k=1;k<=nreq;k++){
          if(!(req[k] in col)) continue
          v = (col[req[k]]<=m) ? c[col[req[k]]] : ""
          if(v=="") printf "line %d: figures table under \"%s\" has an empty %s cell\n", i, heading, req[k]
        }
      }
    }' "$f")
    if printf '%s' "$out" | grep -q '^TABLE$'; then found_any=1; fi
    while IFS= read -r msg; do
      [ -n "$msg" ] || continue
      [ "$msg" = "TABLE" ] && continue
      add_fail "$r $msg"
    done <<G11BEOF
$out
G11BEOF
  done < <(bound_files)
  if [ "$found_any" -eq 0 ] && [ -z "$G_FAILS" ]; then
    set_skip "no figures heading and no table with a Figure column under $(rel "$MEM")"
  fi
}

# ---- G12 The interview covered its classes -------------------------------
gate_G12() {
  need_file "$RUNREC" || return
  if [ "$ROOT_TYPE" = "client" ]; then
    G12_FIRST="What was bought"
  else
    G12_FIRST="What this root is for"
  fi
  prev_ln=0
  for h in "$G12_FIRST" "Who confirms and on what basis" "Contradictions" "What the outputs are for"; do
    if ! has_heading "$RUNREC" "### $h"; then
      add_fail "$(rel "$RUNREC"): '### $h' missing"
      continue
    fi
    this_ln=$(grep -n -F -x "### $h" "$RUNREC" 2>/dev/null | head -1 | cut -d: -f1)
    if [ -n "$this_ln" ] && [ "$this_ln" -lt "$prev_ln" ]; then
      add_fail "$(rel "$RUNREC"): '### $h' is out of order; the table gives these four in one order and the record has to keep it"
    fi
    [ -z "$this_ln" ] || prev_ln="$this_ln"
    section_body "$RUNREC" "### $h" > "$TMPD/g12.txt"
    nb=$(nonblank_count "$TMPD/g12.txt")
    if [ "$nb" -eq 0 ]; then
      add_fail "$(rel "$RUNREC"): '### $h' has an empty body"
      continue
    fi
    if grep -qE '^[[:space:]]*Deferred:' "$TMPD/g12.txt"; then
      if [ "$h" = "What the outputs are for" ]; then
        add_fail "$(rel "$RUNREC"): '### What the outputs are for' is deferred, which is not permitted"
      fi
      conseq=$(grep -E '^[[:space:]]*Deferred:' "$TMPD/g12.txt" | head -1 | sed 's/^[[:space:]]*Deferred:[[:space:]]*//')
      words=$(printf '%s' "$conseq" | wc -w | tr -d ' ')
      if [ "$words" -lt 3 ]; then
        add_fail "$(rel "$RUNREC"): '### $h' defers with no consequence ('Deferred: $conseq')"
      fi
    fi
  done
  offer=$(kv "$RUNREC" "competitors-offer")
  if [ "$offer" = "yes" ]; then
    if ! has_heading "$RUNREC" "### Competitor set"; then
      add_fail "$(rel "$RUNREC"): competitors-offer is yes but '### Competitor set' is missing"
    else
      section_body "$RUNREC" "### Competitor set" > "$TMPD/g12c.txt"
      nb=$(nonblank_count "$TMPD/g12c.txt")
      [ "$nb" -gt 0 ] || add_fail "$(rel "$RUNREC"): '### Competitor set' has an empty body"
    fi
    # (P) mechanical clause: every name in the competitor evidence angle
    # appears in memory/competitors.md.
    comp="$MEM/competitors.md"
    angle=""
    if [ -d "$EVID_DIR" ]; then
      while IFS= read -r e; do
        [ -n "$e" ] || continue
        a=$(kv "$e" "angle")
        if printf '%s' "$a" | tr 'A-Z' 'a-z' | grep -q 'competit'; then angle="$e"; break; fi
      done < <(list_md "$EVID_DIR")
    fi
    if [ -z "$angle" ]; then
      add_note "no evidence package with a competitor angle: the competitor-name clause did not run"
    elif [ ! -f "$comp" ]; then
      add_fail "$(rel "$comp"): missing, but a competitor evidence angle exists"
    else
      names=""
      for colname in Name Competitor Names; do
        if table_get "$angle" "" "$colname" > "$TMPD/g12n.txt" 2>/dev/null; then
          names=$(awk -v US="$US" '{split($0,f,US); if(f[2]!="") print f[2]}' "$TMPD/g12n.txt" | sort -u)
          [ -n "$names" ] && break
        fi
      done
      if [ -z "$names" ]; then
        add_note "$(rel "$angle") has no Name/Competitor column: the competitor-name clause is not mechanical here"
      else
        while IFS= read -r nm; do
          [ -n "$nm" ] || continue
          if ! grep -qiF "$nm" "$comp"; then
            add_fail "$(rel "$comp"): competitor '$nm' from $(rel "$angle") appears nowhere in the file"
          fi
        done <<G12EOF
$names
G12EOF
      fi
    fi
  fi
}

# ---- G13 Traits are checkable (M clause) --------------------------------
BARE_ADJ='measured|institutional|aspirational|sensory|warm|authoritative|playful|professional|engaging|compelling'

gate_G13() {
  VOICE="$MEM/voice.md"
  need_file "$VOICE" || return
  while IFS= read -r hit; do
    [ -n "$hit" ] || continue
    ln=${hit%%:*}
    txt=$(printf '%s' "$hit" | sed 's/^[0-9]*://' | sed 's/^[[:space:]]*//')
    [ ${#txt} -gt 90 ] && txt=$(printf '%s' "$txt" | cut -c1-90)
    words=$(printf '%s' "$txt" | tr 'A-Z' 'a-z' | awk -v L="$BARE_ADJ" '
      { n=split(L,a,"|"); out=""
        for(i=1;i<=n;i++) if($0 ~ "(^|[^a-z])" a[i] "([^a-z]|$)") out = out (out==""?"":", ") a[i]
        print out }')
    add_fail "$(rel "$VOICE") line $ln: closed-list adjective(s) '$words' used as a bare trait: $txt"
  done < <(grep -nEi "(^|[^A-Za-z])($BARE_ADJ)([^A-Za-z]|\$)" "$VOICE" 2>/dev/null)
}

# ---- G13b The routing table resolves the root's deliverables ------------
gate_G13b() {
  VOICE="$MEM/voice.md"
  need_file "$VOICE" || return
  need_file "$RUNREC" || return
  if ! has_heading "$VOICE" "## Routing Table"; then
    add_fail "$(rel "$VOICE"): '## Routing Table' is missing"
  fi
  if ! has_heading "$RUNREC" "### What the outputs are for"; then
    add_fail "$(rel "$RUNREC"): '### What the outputs are for' is missing, so no output type can be routed"
    return
  fi
  section_body "$RUNREC" "### What the outputs are for" > "$TMPD/g13b-out.txt"
  if grep -qE '^[[:space:]]*Deferred:' "$TMPD/g13b-out.txt"; then
    add_note "'### What the outputs are for' is deferred; the routing clause did not run (G12 carries that failure)"
    return
  fi
  # output types: list items where present, otherwise the prose split on
  # commas and " and ".
  awk '
  function trim(s){ sub(/^[ \t]+/,"",s); sub(/[ \t]+$/,"",s); return s }
  {
    t=trim($0)
    if(t=="") next
    if(t ~ /^[-*+][ \t]/ || t ~ /^[0-9]+[.)][ \t]/){
      sub(/^[-*+][ \t]+/,"",t); sub(/^[0-9]+[.)][ \t]+/,"",t)
      items[++ni]=t
    } else prose = prose " " t
  }
  END{
    for(i=1;i<=ni;i++) print items[i]
  }' "$TMPD/g13b-out.txt" | sed 's/[.;:]*$//' | sed 's/^[Tt]he //' > "$TMPD/g13b-types.txt"

  # The answer is a list, one output type per line, because this gate reads it
  # as a list. Version 4 let it be prose and split on punctuation; the first
  # real root answered in a sentence and the split produced eight "output
  # types", among them "see memory/voice.md" and "todos/current.md", each
  # reported as an unrouted deliverable. A gate cannot parse prose, and a
  # routing table checked against garbage is worse than one not checked.
  if [ ! -s "$TMPD/g13b-types.txt" ]; then
    add_fail "$(rel "$RUNREC"): '### What the outputs are for' names no output type as a list item; write one output type per line as a dash list, because the routing table is checked row by row against it"
    return
  fi
  if ! has_heading "$VOICE" "## Routing Table"; then return; fi
  section_body "$VOICE" "## Routing Table" > "$TMPD/g13b-rt.txt"
  awk "$AWK_LIB"'
  { L[NR]=$0 }
  END{
    for(i=1;i<=NR;i++){
      if(!isrow(L[i])) continue
      if(is_sep(L[i])) continue
      if(i<NR && is_sep(L[i+1])) continue
      m=ncells(L[i],c)
      if(m>=1 && c[1]!="") print tolower(c[1])
    }
  }' "$TMPD/g13b-rt.txt" > "$TMPD/g13b-rows.txt"
  while IFS= read -r ot; do
    [ -n "$ot" ] || continue
    otl=$(printf '%s' "$ot" | tr 'A-Z' 'a-z')
    if ! awk -v t="$otl" 'index($0,t)>0 || index(t,$0)>0 {found=1} END{exit(found?0:1)}' "$TMPD/g13b-rows.txt"; then
      add_fail "$(rel "$VOICE"): '## Routing Table' has no row for the output type '$ot'"
    fi
  done < "$TMPD/g13b-types.txt"
}

# ---- G14 Voice authority -------------------------------------------------
gate_G14() {
  VOICE="$MEM/voice.md"
  need_file "$VOICE" || return
  for k in voice-authority-name voice-authority-basis voice-confirmation-date; do
    v=$(kv "$VOICE" "$k")
    if [ -z "$v" ]; then
      add_fail "$(rel "$VOICE"): '$k:' missing or empty"
    fi
  done
  # An identifiable but unqualified confirmer is the residual risk F17 names,
  # so the name has to be a person and the basis has to say something the name
  # does not. "name: account owner / basis: account owner" passed before.
  van=$(kv "$VOICE" "voice-authority-name")
  vab=$(kv "$VOICE" "voice-authority-basis")
  if [ -n "$van" ]; then
    if ! printf '%s' "$van" | grep -qE "$PERSON_GRAMMAR"; then
      add_fail "$(rel "$VOICE"): 'voice-authority-name: $van' does not name a person; a role is not an authority anyone can identify"
    elif printf '%s' "$van" | grep -qE "$NONPERSON_TAIL"; then
      add_fail "$(rel "$VOICE"): 'voice-authority-name: $van' names a role or a body, not a person. An identifiable but unqualified confirmer is the residual risk, and an unidentifiable one is worse"
    else
      build_person_registry
      if [ -s "$TMPD/people.txt" ]; then
        vpn=$(printf '%s' "$van" | grep -oE "$PERSON_GRAMMAR" | sed 's/^[^A-Za-z]*//' | head -1)
        if [ -n "$vpn" ] && ! grep -qixF "$vpn" "$TMPD/people.txt"; then
          add_fail "$(rel "$VOICE"): 'voice-authority-name: $van' is not recorded as a person anywhere in this run; the confirming authority appears in who-confirms or in a must-reach person row"
        fi
      fi
    fi
    if [ -n "$vab" ]; then
      lan=$(printf '%s' "$van" | tr 'A-Z' 'a-z')
      lab=$(printf '%s' "$vab" | tr 'A-Z' 'a-z')
      if [ "$lan" = "$lab" ]; then
        add_fail "$(rel "$VOICE"): 'voice-authority-basis' repeats the name and records no basis for authority in any domain"
      elif printf '%s' "$lab" | grep -qF "$lan"; then
        add_fail "$(rel "$VOICE"): 'voice-authority-basis' only restates the name and records no basis for authority in any domain"
      else
        # A basis has to name what the authority rests on, not assert that it
        # exists. "she signs off" and "is the right person" are assertions.
        nw=$(printf '%s' "$vab" | wc -w | tr -d ' ')
        if [ "${nw:-0}" -lt 6 ]; then
          add_fail "$(rel "$VOICE"): 'voice-authority-basis: $vab' is too thin to be a basis; name the domain and what the authority rests on"
        elif ! printf '%s' "$lab" | grep -qE "(sign-?off|approv|owns|accountab|responsib|authorit|mandate|named in|appointed|delegat|holds|remit|per the|under the|section|brief|contract|policy|role of|as the)"; then
          add_fail "$(rel "$VOICE"): 'voice-authority-basis: $vab' asserts authority without naming what it rests on"
        fi
      fi
    fi
  fi
  d=$(kv "$VOICE" "voice-confirmation-date")
  if [ -n "$d" ] && ! printf '%s' "$d" | grep -qE '[0-9]{4}-[0-9]{2}-[0-9]{2}'; then
    add_fail "$(rel "$VOICE"): voice-confirmation-date '$d' is not a YYYY-MM-DD date"
  fi
  basis=$(kv "$VOICE" "voice-authority-basis")
  fb=$(kv "$VOICE" "voice-authority-fallback")
  if printf '%s %s' "$basis" "$fb" | tr 'A-Z' 'a-z' | grep -q 'fallback'; then
    s=$(kv "$VOICE" "voice-authority-fallback-signoff")
    [ -n "$s" ] || add_fail "$(rel "$VOICE"): the authority is a fallback but 'voice-authority-fallback-signoff:' is missing or empty"
  fi
  add_note "the archiving of rejected attempts is not mechanical and is not checked here"
}

# ---- G15 Audit ran independently ----------------------------------------
gate_G15() {
  need_file "$AUDIT" || return
  ic=$(kv "$AUDIT" "independent-context")
  rv=$(kv "$AUDIT" "reviewers")
  case "$ic" in
    yes|no) ;;
    '') add_fail "$(rel "$AUDIT"): 'independent-context:' missing or empty" ;;
    *) add_fail "$(rel "$AUDIT"): independent-context '$ic' is not yes or no" ;;
  esac
  [ -n "$rv" ] || add_fail "$(rel "$AUDIT"): 'reviewers:' missing or empty"
  if [ "$ic" = "no" ]; then
    if [ ! -f "$CLOSE" ]; then
      add_fail "$(rel "$CLOSE"): missing: independent-context is no and the close report must say so"
    else
      section_body "$CLOSE" "## Audit disposition" > "$TMPD/g15.txt"
      nb=$(nonblank_count "$TMPD/g15.txt")
      if [ "$nb" -eq 0 ]; then
        add_fail "$(rel "$CLOSE"): '## Audit disposition' is empty but independent-context is no"
      elif ! grep -qi 'independen' "$TMPD/g15.txt"; then
        add_fail "$(rel "$CLOSE"): '## Audit disposition' does not record that the audit was not independent"
      fi
    fi
  fi
}

# Containers a claim can hide in. A rejection has to name at least two, which
# is what distinguishes a search from an assertion that one happened.
CONTAINER_GRAMMAR='body|main text|heading|section|notes?|speaker note|comment|footnote|endnote|tracked change|revision|appendix|header|footer|caption|alt text|metadata|margin|annotation|slide|transcript|attachment|table|figure|chart|abstract|summary|title|index|glossary'

# ---- G16 Findings disposed of, disputes preserved -----------------------
gate_G16() {
  need_file "$AUDIT" || return
  if table_get "$AUDIT" "Findings" "Finding,Disposition,Deciding check,Where checker looked,Bound file entry" > "$TMPD/g16.txt" 2>/dev/null; then :; else
    add_fail "$(rel "$AUDIT"): no '## Findings' table with the columns Finding, Disposition, Deciding check, Where checker looked, Bound file entry"
    return
  fi
  while IFS="$US" read -r ln fid disp deciding looked bound; do
    [ -n "$ln" ] || continue
    if [ -z "$deciding" ] || [ "$deciding" = "-" ]; then
      add_fail "$(rel "$AUDIT") line $ln: finding $fid has an empty 'Deciding check'"
    fi
    case "$disp" in
      accepted) ;;
      rejected)
        if [ -z "$looked" ] || [ "$looked" = "-" ]; then
          add_fail "$(rel "$AUDIT") line $ln: finding $fid is rejected with an empty 'Where checker looked'"
        else
          # Rejecting a finding costs a real search. A claim is searched in
          # every container the format has, so the cell must ENUMERATE the
          # containers, not merely assert that the producer looked. Round 2
          # found this recorded as fixed while the gate still tested non-empty.
          # A rejection has to name where the checker looked, specifically
          # enough that someone else can go there. Round 2 established that
          # non-empty is not enough. The count was containers-only until the
          # first real root, whose research-first audit rejected findings by
          # naming evidence files and re-fetched URLs: entirely specific, and
          # zero container words, so thirteen honest rejections failed. A
          # place is now any of the four things a checker can actually name.
          ncont=$(printf '%s' "$looked" | tr 'A-Z' 'a-z' \
            | grep -oE "(^|[^a-z])($CONTAINER_GRAMMAR)([^a-z]|\$)" \
            | sed 's/^[^a-z]*//; s/[^a-z]*$//' | sort -u | wc -l | tr -d ' ')
          nurl=$(printf '%s' "$looked" | grep -oE 'https?://[^ ,;)]+' | sort -u | wc -l | tr -d ' ')
          nfile=$(printf '%s' "$looked" | grep -oE '[A-Za-z0-9_./-]+\.(md|txt|pdf|docx?|pptx?|csv|html?)' | sort -u | wc -l | tr -d ' ')
          nrow=$(printf '%s' "$looked" | grep -oE '\b[EVA][0-9]+\b' | sort -u | wc -l | tr -d ' ')
          nplace=$(( ${ncont:-0} + ${nurl:-0} + ${nfile:-0} + ${nrow:-0} ))
          if [ "$nplace" -lt 1 ]; then
            add_fail "$(rel "$AUDIT") line $ln: finding $fid is rejected but 'Where checker looked' names no place: a rejection names a container, a file, a URL or an evidence row, not that the producer looked"
          fi
        fi
        ;;
      disputed)
        # Trailing punctuation is not part of the path. "memory/design.md,
        # \"Source Assets\" section" named a real file and failed as missing.
        p=$(printf '%s' "$bound" | tr -d '`' | awk '{print $1}' | awk -F'#' '{print $1}' | sed 's/[.,;:]*$//')
        if [ -z "$p" ]; then
          add_fail "$(rel "$AUDIT") line $ln: finding $fid is disputed but 'Bound file entry' names no file"
          continue
        fi
        t="$ROOT/$p"
        case "$p" in /*) t="$p" ;; esac
        if [ ! -f "$t" ]; then
          add_fail "$(rel "$AUDIT") line $ln: finding $fid is disputed but '$p' does not exist under the root"
        elif ! awk -v id="$fid" 'index($0,"(Disputed:")>0 && index($0,id)>0 {f=1} END{exit(f?0:1)}' "$t"; then
          add_fail "$(rel "$AUDIT") line $ln: finding $fid is disputed but $p carries no '(Disputed: ... $fid' entry"
        fi
        ;;
      *)
        add_fail "$(rel "$AUDIT") line $ln: finding $fid Disposition '$disp' is not accepted, rejected or disputed"
        ;;
    esac
  done < "$TMPD/g16.txt"
}

# ---- G17 Refusal removed only for complete keys -------------------------
gate_G17() {
  need_file "$RUNREC" || return
  if ! has_heading "$RUNREC" "## Per-key close"; then
    add_fail "$(rel "$RUNREC"): no '## Per-key close' section"
    return
  fi
  if [ ! -f "$AGENTS" ]; then
    add_fail "$(rel "$AGENTS"): missing"
    return
  fi
  open_keys=""
  missing=0
  for key in about voice design competitors; do
    v=$(perkey_value "$key")
    if [ -z "$v" ]; then
      if [ "$key" = "competitors" ] && printf '%s' "$(kv "$RUNREC" "competitors-offer")" | grep -q '^not-offered'; then
        continue
      fi
      add_fail "$(rel "$RUNREC"): '## Per-key close' has no line for key '$key'"
      missing=1
      continue
    fi
    case "$v" in
      complete) ;;
      unbound)
        # The grammar allows `unbound` for competitors and for no other key, and
        # only where the offer was declined or deferred rather than accepted.
        if [ "$key" != "competitors" ]; then
          add_fail "$(rel "$RUNREC"): per-key close '$key: unbound' is allowed only for competitors"; missing=1
        else
          case "$(kv "$RUNREC" "competitors-offer")" in
            not-now|no) ;;
            yes)        add_fail "$(rel "$RUNREC"): 'competitors-offer: yes' but 'competitors: unbound'; an accepted offer has a set to close"; missing=1 ;;
            not-offered:*) add_fail "$(rel "$RUNREC"): the offer was never made, so no competitors line is owed"; missing=1 ;;
            *)          add_fail "$(rel "$RUNREC"): 'competitors: unbound' but competitors-offer records no declined or deferred offer"; missing=1 ;;
          esac
        fi
        ;;
      provisional|blocked) open_keys="$open_keys $key" ;;
      *) add_fail "$(rel "$RUNREC"): per-key close '$key: $v' is not complete, provisional, blocked or unbound"; missing=1 ;;
    esac
  done
  [ "$missing" = "0" ] || return
  has_inst=1
  has_heading "$AGENTS" "## Instantiation" || has_inst=0
  if [ -z "$open_keys" ]; then
    if [ "$has_inst" = "1" ]; then
      add_fail "$(rel "$AGENTS"): every key closes complete or unbound but '## Instantiation' is still present"
    fi
  else
    if [ "$has_inst" = "0" ]; then
      add_fail "$(rel "$AGENTS"): keys$open_keys are provisional or blocked but '## Instantiation' is absent"
      return
    fi
    section_body "$AGENTS" "## Instantiation" > "$TMPD/g17.txt"
    for key in $open_keys; do
      if ! grep -qi "$key" "$TMPD/g17.txt"; then
        add_fail "$(rel "$AGENTS"): '## Instantiation' does not name the key '$key'"
      fi
    done
  fi
}

# ---- G18 No placeholder token survives ----------------------------------
gate_G18() {
  hits=$(grep -rInE '\[name\]|\[Competitor\]' "$ROOT" 2>/dev/null | awk -F: '{print $1":"$2}' | sort -u)
  [ -n "$hits" ] || return
  while IFS= read -r h; do
    [ -n "$h" ] || continue
    file=${h%%:*}
    ln=${h##*:}
    case "$file" in
      "$SECRETS"/*) add_fail "$(rel "$file") line $ln: a placeholder token survives in the credential store"; continue ;;
    esac
    r=$(rel "$file")
    if [ "$file" = "$CLOSE" ]; then
      add_note "$r line $ln: placeholder token in the close report (where exceptions are listed)"
      continue
    fi
    if [ -f "$CLOSE" ] && grep -qF "$r" "$CLOSE" 2>/dev/null; then
      add_note "$r line $ln: placeholder token, listed as an exception in the close report"
      continue
    fi
    add_fail "$r line $ln: a placeholder token ([name] or [Competitor]) survives and is not listed as an exception in the close report"
  done <<G18EOF
$hits
G18EOF
}

# ---- G19 Paths resolve ---------------------------------------------------
gate_G19() {
  ran=0
  if [ -d "$MEM" ] && [ "$(bound_files | wc -l | tr -d ' ')" -gt 0 ]; then
    ran=1
    while IFS= read -r f; do
      [ -n "$f" ] || continue
      r=$(rel "$f")
      while IFS= read -r rec; do
        [ -n "$rec" ] || continue
        ln=${rec%%:*}
        tok=$(printf '%s' "$rec" | sed 's/^[0-9]*://')
        [ -n "$tok" ] || continue
        target="$ROOT/$tok"
        case "$tok" in
          /*) target="$tok" ;;
        esac
        if [ ! -e "$target" ]; then
          add_fail "$r line $ln: path '$tok' does not resolve under the root"
        fi
      done < <(awk '
      function trim(s){ sub(/^[ \t]+/,"",s); sub(/[ \t]+$/,"",s); return s }
      function clean(t){
        gsub(/^[("\[<]+/,"",t)
        gsub(/[)"\]>.,;:!?]+$/,"",t)
        return t
      }
      function emit(t,   lt){
        t=clean(t)
        if(t=="") return
        if(index(t,"://")>0) return
        if(index(t,"/")==0) return
        if(t ~ /[ \t]/) return
        lt=tolower(t)
        if(lt=="n/a" || lt=="and/or" || lt=="he/she" || lt=="yes/no" || lt=="either/or") return
        if(t ~ /^[0-9]+\/[0-9]+$/) return
        if(t !~ /^[A-Za-z0-9._~\/-]+$/) return
        if(t !~ /[A-Za-z0-9]/) return
        # This gate asks one question: does a path this root names exist in
        # this root? So only a root-relative path is its business. The first
        # real root showed the old any-token-with-a-slash rule reporting
        # thirty-two failures, none of them a path: bare domains
        # (example.com/pages/about-us), slashed word pairs
        # (plain/minimal, one/two/three), and references to the
        # standards of the composed plugin (standards/conventions.md), which
        # correctly do not resolve under a client root and never should.
        if(t !~ /^(\.\/)?(memory|work|sources|todos|inbox|zArchive)\//) return
        seen[t]=1
        print NR ":" t
      }
      {
        line=$0
        # html comments are markers, not prose: they hold no paths
        while(match(line,/<!--.*-->/)) line=substr(line,1,RSTART-1) " " substr(line,RSTART+RLENGTH)
        if(index(line,"<!--")>0) line=substr(line,1,index(line,"<!--")-1)
        # backticked spans first, then the line with them removed
        rest=line
        while(match(rest,/`[^`]+`/)){
          span=substr(rest,RSTART+1,RLENGTH-2)
          emit(span)
          rest=substr(rest,1,RSTART-1) " " substr(rest,RSTART+RLENGTH)
        }
        n=split(rest,W,/[ \t]+/)
        for(i=1;i<=n;i++) emit(W[i])
      }' "$f" | sort -u -t: -k1,1n -k2,2)
    done < <(bound_files)
  else
    add_note "no bound files under $(rel "$MEM"): the path clause did not run"
  fi

  if [ -d "$SECRETS" ]; then
    n=0
    while IFS= read -r cf; do
      [ -n "$cf" ] || continue
      n=$((n+1)); ran=1
      keys=$(grep -cE '^[A-Za-z_][A-Za-z0-9_]*=' "$cf" 2>/dev/null); [ -n "$keys" ] || keys=0
      empty=$(grep -cE '^[A-Za-z_][A-Za-z0-9_]*=[[:space:]]*$' "$cf" 2>/dev/null); [ -n "$empty" ] || empty=0
      add_note "$(rel "$cf"): key lines=$keys, empty values=$empty"
      if [ "$keys" -lt 1 ]; then
        add_fail "$(rel "$cf"): carries no KEY= lines (the key list is empty)"
      fi
      # An unfilled credential file is legitimate; an unfilled credential file
      # nobody owns is not. Empty values above zero pass only when the root's
      # operating file carries a row whose Blocker names this credential.
      if [ "$empty" -gt 0 ]; then
        cfbase=$(basename "$cf")
        cfstem=${cfbase%.*}
        owned=0
        if [ -f "$OPER" ]; then
          if grep -qiE "(person|credential|capability):[^|]*($(printf '%s' "$cfstem" | sed 's/[][\.*^$/]/\\&/g'))" "$OPER" 2>/dev/null; then
            owned=1
          else
            while IFS= read -r kn; do
              [ -n "$kn" ] || continue
              if grep -qiE "(person|credential|capability):[^|]*$kn" "$OPER" 2>/dev/null; then
                owned=1; break
              fi
            done < <(grep -oE '^[A-Za-z_][A-Za-z0-9_]*' "$cf" 2>/dev/null | sort -u)
          fi
        fi
        if [ "$owned" = "1" ]; then
          add_note "$(rel "$cf"): $empty empty value(s), owned by an operating row naming the credential"
        else
          add_fail "$(rel "$cf"): $empty empty value(s) and no $(rel "$OPER") row whose Blocker names this credential"
        fi
      fi
    done < <(find "$SECRETS" -type f ! -name '.*' 2>/dev/null | sort)
    [ "$n" -gt 0 ] || add_note "$(rel "$SECRETS") holds no credential files"
  else
    add_note "no $(rel "$SECRETS") directory: the credential clause did not run"
  fi

  if [ "$ran" = "0" ]; then
    set_skip "no bound files and no credential store: nothing to resolve"
  fi
}

# ---- G20 Operating file and close report --------------------------------
gate_G20() {
  if need_file "$OPER"; then
    if table_get "$OPER" "" "Item,Owner,Status,Result and date" > "$TMPD/g20.txt" 2>/dev/null; then
      while IFS="$US" read -r ln item owner status result; do
        [ -n "$ln" ] || continue
        ol=$(printf '%s' "$owner" | tr 'A-Z' 'a-z' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
        case "$ol" in
          ''|'-'|'the requester'|'requester'|'the client'|'tbd'|'whoever asked')
            add_fail "$(rel "$OPER") line $ln: row $item Owner '$owner' is not a named person or role" ;;
        esac
        case "$status" in
          gating|blocking|needed|done) ;;
          *) add_fail "$(rel "$OPER") line $ln: row $item Status '$status' is not gating, blocking, needed or done" ;;
        esac
        if [ "$status" = "done" ]; then
          if [ -z "$result" ] || [ "$result" = "-" ]; then
            add_fail "$(rel "$OPER") line $ln: row $item is done but 'Result and date' is empty"
          elif ! printf '%s' "$result" | grep -qE '[0-9]{4}-[0-9]{2}-[0-9]{2}'; then
            add_fail "$(rel "$OPER") line $ln: row $item is done but 'Result and date' carries no YYYY-MM-DD date"
          fi
        fi
      done < "$TMPD/g20.txt"
    else
      add_fail "$(rel "$OPER"): no table with the columns Item, Owner, Status, Result and date"
    fi
  fi
  if need_file "$CLOSE"; then
    for h in "## Tier" "## Type and scope" "## Destination" "## Per-key close" \
             "## Open headings" "## Gates that failed" "## Audit disposition" "## Outstanding"; do
      if ! has_heading "$CLOSE" "$h"; then
        add_fail "$(rel "$CLOSE"): heading '$h' is missing"
        continue
      fi
      section_body "$CLOSE" "$h" > "$TMPD/g20c.txt"
      nb=$(nonblank_count "$TMPD/g20c.txt")
      [ "$nb" -gt 0 ] || add_fail "$(rel "$CLOSE"): heading '$h' has an empty body"
    done
  fi
}

# ================================================================== driver

MATCHED=0
while IFS='|' read -r gid gname gfn; do
  [ -n "$gid" ] || continue
  if [ -n "$ONE_GATE" ] && [ "$ONE_GATE" != "$gid" ]; then continue; fi
  MATCHED=1
  run_gate "$gid" "$gname" "$gfn"
done <<DRIVEREOF
$GATES
DRIVEREOF

if [ -n "$ONE_GATE" ] && [ "$MATCHED" = "0" ]; then
  echo "$PROG: no such gate: $ONE_GATE" >&2
  exit 2
fi

TOTAL=$((PASS_N+FAIL_N+SKIP_N))
if [ "$JSON" = "1" ]; then
  printf '{"summary":true,"root":"%s","total":%d,"pass":%d,"fail":%d,"skip":%d,"exit":%d}\n' \
    "$(json_escape "$ROOT")" "$TOTAL" "$PASS_N" "$FAIL_N" "$SKIP_N" \
    "$( [ "$FAIL_N" -eq 0 ] && [ "$SKIP_N" -eq 0 ] && echo 0 || echo 1 )"
else
  echo
  printf '%d gates run: %d passed, %d failed, %d skipped  (root: %s)\n' \
    "$TOTAL" "$PASS_N" "$FAIL_N" "$SKIP_N" "$ROOT"
fi

if [ "$FAIL_N" -eq 0 ] && [ "$SKIP_N" -eq 0 ]; then exit 0; fi
exit 1
