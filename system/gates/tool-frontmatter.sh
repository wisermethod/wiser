#!/bin/sh
# tool-frontmatter.sh [--self-test | plugin-root]
# Whole working-tree declarations: primitives.md Frontmatter, plugin-root.md C10.
# Exit 0 passes, 1 refuses, 2 could not measure. Never reads the index.
# The gate is a guard against an oversight, and review is what covers the import graph and packages.
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
      if (key == "hosted") {
        if (item !~ /^[a-z0-9-]+ [0-9]+(B|KiB|MiB|GiB) [0-9]+s$/) {
          refuse("malformed hosted: item; expected <command> <size> <time>")
        } else {
          split(item, limits, " ")
          size = limits[2]; unit = size; sub(/^[0-9]+/, "", unit)
          sub(/[^0-9].*/, "", size)
          scale = unit == "GiB" ? 1073741824 : unit == "MiB" ? 1048576 : unit == "KiB" ? 1024 : 1
          if (size + 0 > 8388608 / scale) refuse("hosted: " limits[1] " size " limits[2] " exceeds 8 MiB")
          if (limits[3] + 0 > 240) refuse("hosted: " limits[1] " time " limits[3] " exceeds 240 s")
        }
        command = item; sub(/ .*/, "", command)
        if (seen_command[command]++) refuse("hosted command listed twice: " command)
      }
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
        if ("local-only" in shape && (shape["local-only"] != "scalar" || scalar["local-only"] ~ /^[[:space:]]*$/))
          refuse("local-only: must be a non-empty one-line scalar saying why the tool stays local")
        if (scalar["runs"] == "both" && "local-only" in shape)
          refuse("runs: both forbids local-only:; remove local-only:")
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
  if [ "$2" = tool ]; then
    check_declaration=$(awk '
    { sub(/\r$/, "") }
    NR == 1 { opened = ($0 == "---"); next }
    opened && /^---$/ { exit }
    opened && /^runs: (local|both|"local"|"both")$/ { runs = substr($0, 7); gsub(/"/, "", runs) }
    opened && /^local-only:/ { local_only = 1 }
    END { if (runs != "") print runs " " (local_only + 0) }
    ' "$1") || return 2
    if [ -n "$check_declaration" ]; then
      check_cores "$(dirname -- "$1")" "$check_declaration"
      core_rc=$?
      [ "$core_rc" -le 1 ] || return "$core_rc"
      [ "$core_rc" -le "$check_rc" ] || check_rc=$core_rc
    fi
  fi
  [ -n "$check_cites" ] || return "$check_rc"
  check_real=$(cd "$3" && pwd -P) || return 2
  while IFS= read -r check_cite; do
    [ -n "$check_cite" ] || continue
    # Follow a linked citation to the file it names; only where that lands counts.
    check_target="$3/$check_cite"
    check_hops=0
    while [ -L "$check_target" ] && [ "$check_hops" -lt 40 ]; do
      check_link=$(readlink "$check_target") || break
      case $check_link in /*) check_target=$check_link ;; *) check_target=$(dirname -- "$check_target")/$check_link ;; esac
      check_hops=$((check_hops + 1))
    done
    check_dir=$(cd "$(dirname -- "$check_target")" 2>/dev/null && pwd -P) || check_dir=
    case $check_dir/ in "$check_real"/*) ;; *) check_dir= ;; esac
    if [ -z "$check_dir" ] || [ -L "$check_target" ] || [ ! -f "$check_target" ]; then
      echo "REFUSED: $1: apps: citation $check_cite is not a file inside the plugin" >&2
      check_rc=1
    fi
  done <<EOF
$check_cites
EOF
  return "$check_rc"
}

# Check literal static imports, re-exports, dynamic imports and require calls.
# This reads core files only; package effects and the rest of the import graph
# still need review under script-contract.md Core first. Never execute a core.
check_cores() {
  command -v node >/dev/null 2>&1 || { echo 'tool-frontmatter: Node is missing; cannot measure cores.' >&2; return 2; }
  node --input-type=commonjs - "$1" "$2" <<'JS'
const fs = require('node:fs');
const path = require('node:path');
const { isBuiltin } = require('node:module');

// Keep literal tokens and their positions, skipping comments, quoted prose and
// regular expressions. Recurse into template expressions, which can import.
function tokens(source) {
  const out = [];
  let i = 0;
  const emit = (value, start, string = false, closesBlock = false) => out.push({ value, start, string, closesBlock });
  function quoted(quote) {
    let value = '';
    while (i < source.length) {
      const c = source[i++];
      if (c === quote) return value;
      if (c !== '\\') { value += c; continue; }
      const escaped = source[i++];
      const hex = /^(?:u\{([\da-f]+)\}|u([\da-f]{4})|x([\da-f]{2}))/i.exec(escaped + source.slice(i));
      if (hex) { value += String.fromCodePoint(parseInt(hex[1] ?? hex[2] ?? hex[3], 16)); i += hex[0].length - 1; }
      else if (escaped === '\r' || escaped === '\n') { if (escaped === '\r' && source[i] === '\n') i++; }
      else value += ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', 0: '\0' })[escaped] ?? escaped;
    }
    throw new Error('unclosed string');
  }
  function scan(inTemplate = false) {
    const braces = [], parens = [];
    while (i < source.length) {
      const start = i, c = source[i], next = source[i + 1];
      if (/\s/.test(c)) { i++; continue; }
      if (c === '/' && next === '/' || i === 0 && c === '#' && next === '!') {
        while (i < source.length && source[i] !== '\n') i++;
        continue;
      }
      if (c === '/' && next === '*') {
        const end = source.indexOf('*/', i + 2);
        if (end < 0) throw new Error('unclosed comment');
        i = end + 2; continue;
      }
      if (c === '"' || c === "'") { i++; emit(quoted(c), start, true); continue; }
      if (c === '`') {
        i++;
        let value = '', interpolated = false, closed = false;
        while (i < source.length) {
          if (source[i] === '`') { i++; closed = true; break; }
          if (source[i] === '\\') { value += source.slice(i, i + 2); i += 2; continue; }
          if (source[i] === '$' && source[i + 1] === '{') {
            interpolated = true; i += 2; emit('${', i - 2); scan(true); emit('}', i - 1);
          } else value += source[i++];
        }
        if (!closed) throw new Error('unclosed template');
        // A no-substitution template is also a literal dynamic specifier.
        if (!interpolated) {
          const end = i;
          i = start + 1; value = quoted('`'); i = end;
        }
        emit(value, start, !interpolated); continue;
      }
      const previous = out[out.length - 1];
      if (c === '/' && (!previous || !previous.string && (previous.closesBlock || /^(?:[=(:,!&|?;{\[+\-*\/%^~<>]|\$\{|return|throw|case|yield|await|void|typeof|delete|=>)$/.test(previous.value)))) {
        i++;
        let bracket = false, closed = false;
        while (i < source.length && source[i] !== '\n') {
          const r = source[i++];
          if (r === '\\') { i++; continue; }
          if (r === '[') bracket = true;
          if (r === ']') bracket = false;
          if (r === '/' && !bracket) { closed = true; break; }
        }
        if (!closed) throw new Error('unclosed regular expression');
        while (/[a-z]/i.test(source[i] ?? '')) i++;
        emit('/regexp/', start); continue;
      }
      if (/[\w$]/.test(c)) {
        i++; while (/[\w$]/.test(source[i] ?? '')) i++;
        emit(source.slice(start, i), start); continue;
      }
      i++;
      if (c === '(') {
        // A function expression ends a value, while a declaration ends a
        // statement. Preserve that distinction when its body closes.
        let f = out.length - 1;
        if (/^[\w$]+$/.test(out[f]?.value ?? '') && out[f]?.value !== 'function') f--;
        if (out[f]?.value === '*') f--;
        let before = out[f - 1];
        if (before?.value === 'async') before = out[f - 2];
        parens.push(out[f]?.value === 'function'
          ? !before || !before.string && /^(?:[;{}]|export|default)$/.test(before.value)
          : undefined);
      }
      if (c === ')') {
        emit(c, start);
        out[out.length - 1].bodyIsBlock = parens.pop();
        continue;
      }
      if (c === '{') {
        // Object literals consume their own brace, including in ${...}; only
        // a brace at interpolation depth zero returns to template text.
        // A class header can carry a name and an extends path before its body.
        let classBody = false;
        for (let h = out.length - 1; h >= 0 && !out[h].string && /^(?:[\w$]+|\.)$/.test(out[h].value); h--) {
          if (out[h].value === 'class') { classBody = true; break; }
        }
        braces.push(previous?.bodyIsBlock ?? (classBody || !previous || !previous.string && /^(?:[;{}]|\)|=>|catch|else|try|finally|do)$/.test(previous.value)));
      }
      if (c === '}') {
        if (inTemplate && braces.length === 0) return;
        emit(c, start, false, braces.pop() ?? false);
        continue;
      }
      if (c === '=' && next === '>') { i++; emit('=>', start); }
      else emit(c, start);
    }
  }
  scan();
  return out;
}

function cores(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === 'zArchive' || entry.name === 'node_modules') return [];
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? cores(file) : entry.isFile() && entry.name.endsWith('-core.js') ? [file] : [];
  });
}
try {
  const tool = process.argv[2], files = cores(path.join(tool, 'scripts'));
  const [runs, localOnly] = process.argv[3].split(' ');
  let refused = false;
  if (runs === 'both' && !files.length) {
    console.error(`REFUSED: ${tool}/TOOL.md: runs: both requires at least one scripts/*-core.js`);
    refused = true;
  }
  // A tool may also name a command-line half *-core.js; what is required is one core
  // that imports no Node built-in (script-contract.md, Core first).
  const found = [];
  let portable = 0;
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8'), stream = tokens(source);
    const before_count = found.length;
    for (let i = 0; i < stream.length; i++) {
      const token = stream[i], prev = stream[i - 1], before = stream[i - 2];
      const keyword = (t, word) => t && !t.string && t.value === word;
      const imported = keyword(prev, 'from') || keyword(prev, 'import') ||
        keyword(prev, '(') && (keyword(before, 'import') || keyword(before, 'require'));
      if (token.string && imported && (token.value.startsWith('node:') || isBuiltin(token.value))) {
        const line = source.slice(0, token.start).split('\n').length;
        found.push(`${file}:${line}: imports Node built-in ${token.value}`);
      }
    }
    if (found.length === before_count) portable++;
  }
  if (runs === 'both' && files.length && !portable) {
    console.error(`REFUSED: ${tool}/TOOL.md: runs: both requires a core that imports no Node built-in; every scripts/*-core.js imports one:`);
    for (const line of found) console.error(`REFUSED: ${line}`);
    refused = true;
  }
  if (runs === 'local' && portable && localOnly === '1') {
    console.error(`REFUSED: ${tool}/TOOL.md: runs: local already holds a core that imports no Node built-in; remove local-only:`);
    refused = true;
  }
  if (runs === 'local' && !portable && localOnly !== '1') {
    console.error(`REFUSED: ${tool}/TOOL.md: runs: local requires a scripts/**/*-core.js that imports no Node built-in or a non-empty local-only: reason; add one`);
    for (const line of found) console.error(`REFUSED: ${line}`);
    refused = true;
  }
  process.exitCode = refused ? 1 : 0;
} catch (error) {
  console.error(`tool-frontmatter: cannot check cores in ${process.argv[2]}: ${error.message}; cannot measure.`);
  process.exitCode = 2;
}
JS
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
  mkdir -p "$test_root/tools/fixture/scripts/zArchive" "$test_root/tools/fixture/scripts/node_modules" "$test_root/records" "$test_root/placeholder" || die "cannot build fixtures"
  printf '%s\n' "import fs from 'node:fs';" > "$test_root/tools/fixture/scripts/zArchive/old-core.js"
  printf '%s\n' "import fs from 'node:fs';" > "$test_root/tools/fixture/scripts/node_modules/package-core.js"
  : > "$test_root/records/run.md" && : > "$test_root/records/run with spaces.md" || die "cannot build fixtures"
  ln -s /etc/hosts "$test_root/records/link.md" || die "cannot build fixtures"
  ln -s run.md "$test_root/records/inside.md" || die "cannot build fixtures"
  refusals=0
  passes=0
  tool() {
    printf '%s\n' '---' 'name: fixture' 'type: tool' 'category: test' 'description: A fixture' 'version: 0.1.0' "$@" '---' > "$test_root/tools/fixture/TOOL.md"
  }
  core() { printf '%s\n' "$@" > "$test_root/tools/fixture/scripts/fixture-core.js"; }
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
  for test_case in local-core-and-reason local-neither both-local-only local-only-empty local-only-blank local-only-list local-only-colon no-runs both-without-hosted malformed-hosted duplicate-hosted local-with-hosted unknown-runs no-apps type-beside-root unknown-app unknown-state run-without-citation missing-citation linked-citation duplicate-app blank-line duplicate-key single-quotes comment inline-list nesting unclosed-block outside-citation oversize-mib oversize-kib oversize-gib oversize-bytes oversize-existing overtime no-core node-core bare-core multiline-core dynamic-core require-core reexport-core escaped-core template-core; do
    tool 'runs: local'
    core 'export const run = input => input;'
    plugin 'apps:' '  - claude-code steps'
    case $test_case in
      local-core-and-reason) tool 'runs: local' 'local-only: needs a local app' ;;
      local-neither) rm "$test_root/tools/fixture/scripts/fixture-core.js" ;;
      both-local-only) tool 'runs: both' 'hosted:' '  - fetch 1MiB 15s' 'local-only: needs a local app' ;;
      local-only-empty|local-only-blank|local-only-list|local-only-colon)
        rm "$test_root/tools/fixture/scripts/fixture-core.js"
        case $test_case in
          local-only-empty) tool 'runs: local' 'local-only: ""' ;;
          local-only-blank) tool 'runs: local' 'local-only: "   "' ;;
          local-only-list) tool 'runs: local' 'local-only:' '  - needs a local app' ;;
          local-only-colon) tool 'runs: local' 'local-only: needs: a local app' ;;
        esac ;;
      no-runs) tool ;;
      both-without-hosted) tool 'runs: both' ;;
      malformed-hosted) tool 'runs: both' 'hosted:' '  - search 2048chars none' ;;
      duplicate-hosted) tool 'runs: both' 'hosted:' '  - fetch 1MiB 15s' '  - fetch 4MiB 15s' ;;
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
      oversize-mib) tool 'runs: both' 'hosted:' '  - fetch 9MiB 4s' ;;
      oversize-kib) tool 'runs: both' 'hosted:' '  - fetch 8193KiB 4s' ;;
      oversize-gib) tool 'runs: both' 'hosted:' '  - fetch 1GiB 4s' ;;
      oversize-bytes) tool 'runs: both' 'hosted:' '  - fetch 8388609B 4s' ;;
      oversize-existing) tool 'runs: both' 'hosted:' '  - fetch-4 4GiB 4s' ;;
      overtime) tool 'runs: both' 'hosted:' '  - fetch 8MiB 241s' ;;
      no-core|node-core|bare-core|multiline-core|dynamic-core|require-core|reexport-core|escaped-core|template-core)
        tool 'runs: both' 'hosted:' '  - fetch 8MiB 240s'
        case $test_case in
          no-core) rm "$test_root/tools/fixture/scripts/fixture-core.js" ;;
          node-core) core "import fs from 'node:fs';" ;;
          bare-core) core "import fs from 'fs';" ;;
          multiline-core) core 'import {' '  readFile' "} from 'fs/promises';" ;;
          dynamic-core) core "export const run = () => import('node:net');" ;;
          require-core) core "const path = require('path');" ;;
          reexport-core) core "export { request } from 'https';" ;;
          escaped-core) core "import fs from 'node:\\u0066s';" ;;
          template-core) core 'export const run = () => import(`node:fs`);' ;;
        esac ;;
    esac
    expect 1 run_over "$test_root"
    tool 'runs: local'
    core 'export const run = input => input;'
    plugin 'apps:' '  - claude-code steps'
    case $test_case in
      local-neither)
        rm "$test_root/tools/fixture/scripts/fixture-core.js"
        tool 'runs: local' 'local-only: needs a local app' ;;
      both-local-only) tool 'runs: both' 'hosted:' '  - fetch 1MiB 15s' ;;
      local-only-empty|local-only-blank|local-only-list|local-only-colon)
        rm "$test_root/tools/fixture/scripts/fixture-core.js"
        tool 'runs: local' 'local-only: "needs: a local app"' ;;
      both-without-hosted|malformed-hosted|duplicate-hosted|local-with-hosted)
        tool 'runs: both' 'hosted:' '  - fetch 1MiB 15s' ;;
      oversize-*|overtime|no-core|node-core|bare-core|multiline-core|dynamic-core|require-core|reexport-core|escaped-core|template-core)
        tool 'runs: both' 'hosted:' '  - fetch 8MiB 240s' ;;
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
  # Positive controls reach all apps, permitted units, exact caps and ignored
  # archives/packages. GiB cannot fit the cap except at zero; it refuses above.
  tool 'runs: both' 'hosted:' '  - fetch 8388608B 240s' '  - fetch-2 8192KiB 240s' '  - fetch-3 8MiB 240s'
  core '// import fs from "node:fs";' '/* import path from "path"; */' 'const prose = "import os from '\''os'\''";' 'const pattern = /import fs from "fs"/;' 'export const run = input => input;'
  plugin 'apps:' '  - claude-cowork steps' '  - claude-code run ./records/run with spaces.md' '  - codex run records/inside.md' '  - "chatgpt-desktop run https://example.com/record"' '  - grok steps' '  - cursor steps'
  expect 0 run_over "$test_root"
  # Regex prose after a statement block is not an import.
  core 'export function run(input) { return input; }' "/import('fs')/.test(input);"
  expect 0 run_over "$test_root"
  echo 'self-test: regex-after-block PASS (0)'
  # Regex boundaries must neither hide real built-ins nor expose regex prose.
  for test_case in arrow-hidden-import arrow-hidden-reexport arrow-hidden-require void-template-hidden-require typeof-template-hidden-require delete-template-hidden-require; do
    tool 'runs: both' 'hosted:' '  - run 1MiB 15s'
    case $test_case in
      arrow-hidden-import) core 'export const run = input => {' '  return input;' '}' '/`/;' "import fs from 'node:fs';" 'const end = "`";' ;;
      arrow-hidden-reexport) core 'export const run = input => {' '  return input;' '}' '/`/;' "export { readFile } from 'fs';" 'const end = "`";' ;;
      arrow-hidden-require) core 'export const run = input => {' '  return input;' '}' '/`/;' "const fs = require('fs');" 'const end = "`";' ;;
      void-template-hidden-require) core 'export const run = input => `${void /}/ + require('\''fs'\'')}`;' ;;
      typeof-template-hidden-require) core 'export const run = input => `${typeof /}/ + require('\''fs'\'')}`;' ;;
      delete-template-hidden-require) core 'export const run = input => `${delete /}/ + require('\''fs'\'')}`;' ;;
    esac
    expect 1 run_over "$test_root"
    echo "self-test: $test_case REFUSED (1)"
  done
  for test_case in arrow-block-regex void-regex typeof-regex delete-regex catch-block-regex class-block-regex; do
    tool 'runs: both' 'hosted:' '  - run 1MiB 15s'
    case $test_case in
      arrow-block-regex) core 'export const run = input => {' '  return input;' '}' "/import('fs')/.test('input');" ;;
      void-regex) core 'export const run = input => input;' "void /import('fs')/;" ;;
      typeof-regex) core 'export const run = input => input;' "typeof /import('fs')/;" ;;
      delete-regex) core 'export const run = input => input;' "delete /import('fs')/;" ;;
      catch-block-regex) core 'try {} catch {}' "/import('fs')/.test('input');" ;;
      class-block-regex) core 'export class Run {}' "/import('fs')/.test('input');" ;;
    esac
    expect 0 run_over "$test_root"
    echo "self-test: $test_case PASS (0)"
  done
  # A regex brace inside an interpolated object must not end the scan early
  # and expose the nested template's prose as a literal import.
  core 'export const run = input => `${JSON.stringify({ a: input + /}/.test(input) }, `import('\''fs'\'')`)}`;'
  expect 0 run_over "$test_root"
  echo 'self-test: template-object PASS (0)'
  # A command-line half may also be named *-core.js: one core free of built-ins is what is required.
  printf '%s\n' "import fs from 'node:fs';" > "$test_root/tools/fixture/scripts/cli-core.js"
  expect 0 run_over "$test_root"
  rm "$test_root/tools/fixture/scripts/cli-core.js"
  tool 'runs: "local"' 'memory:' '  - "secrets:slack"' 'gaps:' '  - A missing capability'
  plugin 'apps:' '  - claude-code steps'
  expect 0 run_over "$test_root"
  tool 'runs: local'
  core 'export const run = input => input;'
  expect 0 run_over "$test_root"
  echo 'self-test: local-portable-core PASS (0)'
  rm "$test_root/tools/fixture/scripts/fixture-core.js"
  tool 'runs: "local"' 'local-only: needs a local app'
  expect 0 run_over "$test_root"
  echo 'self-test: local-only-without-core PASS (0)'
  core "import path from 'node:path';"
  expect 0 run_over "$test_root"
  echo 'self-test: local-only-with-node-core PASS (0)'
  rm "$test_root/tools/fixture/scripts/fixture-core.js"
  mkdir -p "$test_root/tools/fixture/scripts/lib/nested" || die "cannot build nested core"
  printf '%s\n' 'export const run = input => input;' > "$test_root/tools/fixture/scripts/lib/nested/nested-core.js"
  tool 'runs: local'
  expect 0 run_over "$test_root"
  tool 'runs: local' 'local-only: needs a local app'
  expect 1 run_over "$test_root"
  echo 'self-test: local nested portable core PASS (0); with local-only REFUSED (1)'
  rm "$test_root/tools/fixture/scripts/lib/nested/nested-core.js"
  printf '%s\n' 'export const run = input => input;' > "$test_root/tools/fixture/scripts/zArchive/old-core.js"
  printf '%s\n' 'export const run = input => input;' > "$test_root/tools/fixture/scripts/node_modules/package-core.js"
  tool 'runs: local'
  expect 1 run_over "$test_root"
  tool 'runs: local' 'local-only: needs a local app'
  expect 0 run_over "$test_root"
  echo 'self-test: excluded portable cores alone REFUSED (1); local-only repair PASS (0)'
  printf '%s\n' '---' 'root: fixture' '---' > "$test_root/placeholder/AGENTS.md"
  expect 0 run_over "$test_root/placeholder"
  echo 'self-test: 8MiB 240s (and B/KiB equivalents), comments, strings, regexes, excluded cores, all apps, citations, optional lists, quotes and a placeholder PASS (0)'
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
