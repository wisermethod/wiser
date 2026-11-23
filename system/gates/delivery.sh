#!/bin/sh
# delivery.sh [--self-test | plugin-root]
# Reads the working tree. Exit 0 passes, 1 refuses, 2 could not measure.
set -u

die() { echo "delivery: $*; cannot measure." >&2; exit 2; }

self_test() {
  fixture=$(mktemp -d) || die "could not create a fixture"
  trap 'rm -rf "$fixture"' 0
  trap 'exit 2' HUP INT TERM
  root="$fixture/plugin root"
  mkdir -p "$root/system" "$root/skills/Example/paths" "$root/skills/Example/tests" \
    "$root/skills/Example/zArchive" "$root/skills/Legacy" "$root/skills/Optional/tests" \
    "$root/skills/Optional/zArchive" "$root/experts/Reader" "$root/tools/Other/scripts" ||
    die "could not create fixture directories"
  registry="$root/system/deliverables.json"
  page="$root/tools/DELIVERY.md"
  user="$root/skills/Example/SKILL.md"
  companion="$root/skills/Example/paths/companion.md"
  expert="$root/experts/Reader/EXPERT.md"
  : > "$root/tools/Other/TOOL.md"
  : > "$root/tools/Other/scripts/run.js"
  printf '%s\n' 'wiser.delivery.get' > "$root/skills/Example/tests/ignored.md"
  printf '%s\n' '/starter/personal-ignored' > "$root/skills/Example/zArchive/ignored.md"
  : > "$root/skills/Optional/tests/asset"
  : > "$root/skills/Optional/zArchive/asset"
  : > "$root/skills/Legacy/asset"

  clean_sets='{"name":"sample-set","source":{"kind":"personal-starter"},"maxBytes":1024,"users":["skills/Example"]}'
  clean_exceptions='{"skill":"skills/Legacy","reason":"Not yet assessed."}'
  write_registry() { printf '{"sets":[%s],"exceptions":[%s]}\n' "$1" "$2" > "$registry"; }
  reset() {
    write_registry "$clean_sets" "$clean_exceptions" || die "could not write fixture list"
    printf '%s\n' 'wiser.delivery.get' > "$page"
    printf '%s\n' 'Get the file set `sample-set` by `tools/DELIVERY.md`.' > "$user"
    : > "$companion"
    : > "$expert"
    : > "$root/skills/Legacy/SKILL.md"
    : > "$root/skills/Optional/SKILL.md"
  }

  cases=0
  expect() {
    want=$1
    label=$2
    diagnostic=$3
    result=$(sh "$0" "$root" 2>&1)
    status=$?
    if [ "$status" -ne "$want" ] || ! printf '%s\n' "$result" | grep -Fq -- "$diagnostic"; then
      printf 'delivery self-test: %s wanted exit %s and %s, got %s\n%s\n' \
        "$label" "$want" "$diagnostic" "$status" "$result" >&2
      exit 2
    fi
    printf 'delivery self-test: %s -> %s\n' "$label" "$status"
    cases=$((cases + 1))
    reset
  }

  reset
  expect 0 'clean tree including ignored files' 'delivery: pass'
  printf '%s\n' 'Get sample-set through tools/DELIVERY.md.' > "$user"
  expect 0 'unquoted citation at the end of a sentence' 'delivery: pass'
  printf '%s\n' 'https://example.invalid/starter/personal-old.tar.gz' > "$companion"
  expect 1 'starter address in skill companion' 'forbidden delivery address or action'
  printf '%s\n' 'Run wiser.starter.personal.' > "$expert"
  expect 1 'old action in expert' 'forbidden delivery address or action'
  printf '%s\n' 'wiser.delivery.get' > "$companion"
  expect 1 'delivery action in skill companion' 'forbidden delivery address or action'
  printf '%s\n' 'Get sample-set.' > "$user"
  expect 1 'declared user missing citation' 'must cite tools/DELIVERY.md'
  printf '%s\n' 'Read `tools/DELIVERY.md`.' > "$user"
  expect 1 'declared user missing set name' 'must name sample-set'
  printf '%s\n' 'Get the file set' '`unknown` by `tools/DELIVERY.md`.' > "$companion"
  expect 1 'unknown cited set' 'unknown file set unknown'
  printf '%s\n' 'Get file set missing-set through `tools/DELIVERY.md`.' > "$companion"
  expect 1 'unknown unquoted set' 'unknown file set missing-set'
  printf '%s\n' 'Get file set missing-set by [the page](../../../tools/DELIVERY.md).' > "$companion"
  expect 1 'unknown set beside a Markdown link' 'unknown file set missing-set'
  printf '%s\n' 'See `tools/DELIVERY.md` for missing-set.' > "$companion"
  expect 1 'unknown unquoted set after the page' 'unknown file set missing-set'
  printf '%s\n' 'Get the set `Missing_Set` by `tools/DELIVERY.md`.' > "$companion"
  expect 1 'invalid spelling of a cited set' 'unknown file set Missing_Set'
  write_registry '{"name":"Sample_Set","source":{"kind":"personal-starter"},"maxBytes":1024,"users":["skills/Example"]}' "$clean_exceptions"
  expect 1 'invalid set name' 'invalid set name'
  write_registry "$clean_sets,$clean_sets" "$clean_exceptions"
  expect 1 'duplicate set name' 'duplicate set name'
  write_registry '{"name":"sample-set","source":{"kind":"paths","paths":["tools/Other","tools/Other/scripts/run.js"]},"maxBytes":1024,"users":["skills/Example"]}' "$clean_exceptions"
  expect 0 'plugin-relative directory and file sources' 'delivery: pass'
  for bad_source in '{"kind":"paths"}' '{"kind":"paths","paths":[]}' \
    '{"kind":"paths","paths":["/tools/Other"]}' '{"kind":"paths","paths":["tools/../Other"]}' \
    '{"kind":"paths","paths":[".pin"]}'; do
    write_registry "{\"name\":\"sample-set\",\"source\":$bad_source,\"maxBytes\":1024,\"users\":[\"skills/Example\"]}" "$clean_exceptions"
    expect 1 "invalid source $bad_source" 'requires a personal-starter or paths source'
  done
  write_registry '{"name":"sample-set","source":{"kind":"personal-starter"},"users":["skills/Example"]}' "$clean_exceptions"
  expect 1 'missing limit' 'positive integer maxBytes'
  write_registry '{"name":"sample-set","source":{"kind":"personal-starter"},"maxBytes":1024,"users":["skills/Missing"]}' "$clean_exceptions"
  expect 1 'missing primitive' 'user skills/Missing is not a primitive'
  write_registry "$clean_sets" ''
  expect 1 'unrouted non-Markdown file' 'skills/Legacy must cite tools/DELIVERY.md'
  printf '%s\n' '`system/templates/Example/`' > "$root/skills/Optional/SKILL.md"
  expect 1 'unrouted template' 'skills/Optional must cite tools/DELIVERY.md'
  printf '%s\n' 'Run `tools/Other/scripts/run.js`.' > "$root/skills/Optional/SKILL.md"
  expect 1 'unrouted script from another primitive' 'skills/Optional must cite tools/DELIVERY.md'
  printf '%s\n' 'Run `../Example/scripts/run.js`.' > "$root/skills/Optional/SKILL.md"
  expect 1 'unrouted relative script from another primitive' 'skills/Optional must cite tools/DELIVERY.md'
  printf '%s\n' 'From `tools/Other/`, run `scripts/run.js`.' > "$root/skills/Optional/SKILL.md"
  expect 1 'unrouted script relative to a named primitive' 'skills/Optional must cite tools/DELIVERY.md'
  mkdir -p "$root/tools/Other Tool/scripts" || die "could not create script-link fixture"
  : > "$root/tools/Other Tool/TOOL.md"
  : > "$root/tools/Other Tool/scripts/run.js"
  printf '%s\n' 'Run [the script](../../tools/Other%20Tool/scripts/run.js).' > "$root/skills/Optional/SKILL.md"
  expect 1 'unrouted script in an encoded Markdown link' 'skills/Optional must cite tools/DELIVERY.md'
  printf '%s\n' 'Read `tools/DELIVERY.md`.' > "$root/skills/Legacy/SKILL.md"
  expect 1 'exception now cites the page' 'no longer needs its exception'
  write_registry "$clean_sets" "$clean_exceptions,{\"skill\":\"skills/Optional\",\"reason\":\"Not yet assessed.\"}"
  expect 1 'exception for a skill without a delivery need' 'no longer needs its exception'
  write_registry "$clean_sets" "$clean_exceptions,{\"skill\":\"skills/Missing\",\"reason\":\"Not yet assessed.\"}"
  expect 1 'exception for a missing skill' 'exception skills/Missing is not a skill'
  write_registry "$clean_sets" '{"skill":"skills/Legacy","reason":""}'
  expect 1 'missing exception reason' 'one-line reason'
  printf '%s\n' '{broken' > "$registry"
  expect 1 'malformed JSON' 'invalid JSON'
  rm "$page" || die "could not remove fixture page"
  expect 1 'missing delivery page' 'tools/DELIVERY.md is missing'
  rm "$registry" || die "could not remove fixture list"
  expect 2 'missing registry' 'cannot measure'
  printf 'delivery self-test: pass (%s cases)\n' "$cases"
}

[ "$#" -eq 1 ] || die "usage: delivery.sh [--self-test | plugin-root]"
case $1 in
  --self-test) self_test; exit 0 ;;
  -*) die "usage: delivery.sh [--self-test | plugin-root]" ;;
esac
command -v node >/dev/null 2>&1 || die "Node is unavailable"
node --input-type=module - "$1" <<'NODE'
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const root = resolve(process.argv[2]);
const registry = 'system/deliverables.json';
const page = 'tools/DELIVERY.md';
const families = new Map([
  ['skills', 'SKILL.md'], ['experts', 'EXPERT.md'],
  ['tools', 'TOOL.md'], ['connectors', 'CONNECTOR.md'],
]);
const namePattern = /^[a-z0-9-]+$/;
const citesPage = /(?<![\w.-])tools\/DELIVERY\.md(?![\w/-]|\.[\w.-])/;
const forbidden = /\/starter\/personal-|\bwiser\.(?:starter\.personal|delivery\.get)\b/i;
const scriptPath = /(?<![\w.-])((?:skills|experts|tools|connectors)\/[^/\r\n`"'<>\[\]()]+)\/scripts\/|(?<![\w.-])((?:\.\.\/)+[^/\r\n`"'<>\[\]()]+)\/scripts\//g;
const bareScriptPath = /(?<![\w./-])scripts\/(?:[\w.-]+\/)*[\w.-]+/g;
const ignored = new Set(['tests', 'zArchive']);
const violations = [];
const refuse = (path, message) => violations.push(path + ': ' + message);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function directoryEntries(path) {
  try {
    return readdirSync(join(root, path), { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

function primitives() {
  const found = new Map();
  for (const [family, declaration] of families) {
    for (const entry of directoryEntries(family)) {
      if (!entry.isDirectory() || ignored.has(entry.name)) continue;
      const path = family + '/' + entry.name;
      const typed = lstatSync(join(root, path, declaration), { throwIfNoEntry: false });
      if (typed && !typed.isFile()) throw new Error(path + '/' + declaration + ' is not a regular file');
      if (typed) found.set(path, family);
    }
  }
  return found;
}

function linkTargets(text) {
  return text.replace(/\[[^\]\r\n]*\]\((<[^>\r\n]+>|[^\s)]+)\)/g, (match, target) => {
    try {
      return '`' + decodeURIComponent(target.replace(/^<|>$/g, '')) + '`';
    } catch {
      return match;
    }
  });
}

function readPrimitive(path) {
  const markdown = [];
  let hasFiles = false;
  function visit(dir) {
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      const child = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!ignored.has(entry.name)) visit(child);
      } else if (/\.md$/i.test(entry.name)) {
        if (!entry.isFile()) throw new Error(child + ' is not a regular Markdown file');
        const text = readFileSync(join(root, child), 'utf8');
        markdown.push({ path: child, text, references: linkTargets(text) });
      } else if (!entry.name.startsWith('.')) {
        // A dotfile, such as one a file manager writes, is not a file the skill carries.
        hasFiles = true;
      }
    }
  }
  visit(path);
  return { markdown, hasFiles, cites: markdown.some(file => citesPage.test(file.references)) };
}

function validSource(source) {
  if (!object(source)) return false;
  if (source.kind === 'personal-starter') return Object.keys(source).length === 1;
  return source.kind === 'paths' && Object.keys(source).length === 2 &&
    Array.isArray(source.paths) && source.paths.length > 0 &&
    source.paths.every(path => typeof path === 'string' && !/[\\\x00-\x1f]/.test(path) &&
      path !== '.pin' && path.split('/').every(part => part && part !== '.' && part !== '..'));
}

function readRegistry(found) {
  if (!lstatSync(join(root, registry)).isFile()) throw new Error(registry + ' is not a regular file');
  const bytes = readFileSync(join(root, registry), 'utf8');
  let data;
  try {
    data = JSON.parse(bytes);
  } catch {
    refuse(registry, 'invalid JSON');
    return;
  }
  if (!object(data) || !Array.isArray(data.sets) || !Array.isArray(data.exceptions)) {
    refuse(registry, 'expected sets and exceptions arrays');
    return;
  }
  const sets = new Map();
  const exceptions = new Set();
  for (const entry of data.sets) {
    if (!object(entry) || typeof entry.name !== 'string' || !namePattern.test(entry.name)) {
      refuse(registry, 'invalid set name; use lowercase letters, digits and hyphens');
      continue;
    }
    const { name, source, maxBytes, users } = entry;
    if (sets.has(name)) refuse(registry, 'duplicate set name ' + name);
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) refuse(registry, name + ' requires a positive integer maxBytes');
    if (!validSource(source)) refuse(registry, name + ' requires a personal-starter or paths source');
    if (!Array.isArray(users) || !users.length) {
      refuse(registry, name + ' requires at least one primitive user');
      continue;
    }
    for (const user of users) {
      if (!found.has(user)) refuse(registry, name + ': user ' + String(user) + ' is not a primitive');
    }
    sets.set(name, users);
  }
  for (const entry of data.exceptions) {
    if (!object(entry) || found.get(entry.skill) !== 'skills') {
      refuse(registry, 'exception ' + (entry?.skill ?? '(missing skill)') + ' is not a skill');
      continue;
    }
    if (exceptions.has(entry.skill)) refuse(registry, 'duplicate exception ' + entry.skill);
    if (typeof entry.reason !== 'string' || !entry.reason.trim() || /[\r\n]/.test(entry.reason)) {
      refuse(registry, entry.skill + ' requires a one-line reason');
    }
    exceptions.add(entry.skill);
  }
  return { sets, exceptions };
}

function scriptFromAnotherPrimitive(file, skill, found) {
  for (const [, qualified, local] of file.references.matchAll(scriptPath)) {
    const target = qualified ?? relative(root, resolve(root, dirname(file.path), local));
    if (target !== skill && found.has(target)) return true;
  }
  // Some skills cite a tool and spell its command relative to that tool.
  const relativeScripts = (file.references.match(bareScriptPath) ?? []).filter(path =>
    path.split('/').every(part => part !== '.' && part !== '..'));
  if (!relativeScripts.length) return false;
  for (const target of found.keys()) {
    if (target === skill || !file.references.includes(target + '/')) continue;
    if (relativeScripts.some(path => lstatSync(join(root, target, path), { throwIfNoEntry: false })?.isFile())) return true;
  }
  return false;
}

function citedSets(text) {
  const names = new Set();
  for (const paragraph of text.split(/\r?\n[ \t]*\r?\n/)) {
    if (!citesPage.test(paragraph)) continue;
    // Accept a named file set in the same paragraph, or an inline name next
    // to the page citation (for example, `sample-set` by `tools/DELIVERY.md`).
    const explicit = /\b(?:set|deliverable)\s+(?:named\s+)?`([A-Za-z0-9_.-]+)`/g;
    const before = /(?:`([A-Za-z0-9_.-]+)`|\b(?:set|deliverable)\s+(?:named\s+)?([A-Za-z0-9_.-]+))\s+(?:by|via|through|from|with|per|and|in)\s+`?(?:\.{1,2}\/)*tools\/DELIVERY\.md/g;
    const after = /tools\/DELIVERY\.md`?\s+(?:for|with|and)\s+(?:`([A-Za-z0-9_.-]+)`|([A-Za-z0-9_]+(?:-[A-Za-z0-9_]+)+)\b)/g;
    for (const pattern of [explicit, before, after]) {
      for (const [, quoted, unquoted] of paragraph.matchAll(pattern)) names.add(quoted ?? unquoted);
    }
  }
  return names;
}

function measure() {
  const found = primitives();
  const data = readRegistry(found);
  if (violations.length) return;
  if (!lstatSync(join(root, page), { throwIfNoEntry: false })?.isFile()) {
    refuse(page, 'tools/DELIVERY.md is missing or is not a regular file');
    return;
  }
  const { sets, exceptions } = data;
  const read = new Map();
  let skills = 0, experts = 0;
  for (const [path, family] of found) {
    if (family !== 'skills' && family !== 'experts') continue;
    const primitive = readPrimitive(path);
    read.set(path, primitive);
    for (const file of primitive.markdown) {
      if (forbidden.test(file.text)) refuse(file.path, 'forbidden delivery address or action; cite ' + page);
    }
    if (family === 'experts') {
      experts++;
      continue;
    }
    skills++;
    const needsDelivery = primitive.hasFiles || primitive.markdown.some(file =>
      file.references.includes('system/templates/') || scriptFromAnotherPrimitive(file, path, found));
    if (needsDelivery && !primitive.cites && !exceptions.has(path)) refuse(path, path + ' must cite ' + page + ' or have an exception');
    if (exceptions.has(path) && (primitive.cites || !needsDelivery)) refuse(path, 'no longer needs its exception');
    for (const file of primitive.markdown) {
      for (const name of citedSets(file.references)) {
        if (!sets.has(name)) refuse(file.path, 'unknown file set ' + name);
      }
    }
  }
  for (const [name, users] of sets) {
    const named = new RegExp('(?<![\\w-])' + name + '(?![\\w-])');
    for (const user of users) {
      const primitive = read.get(user) ?? readPrimitive(user);
      if (!primitive.cites) refuse(user, name + ' user must cite ' + page);
      if (!primitive.markdown.some(file => named.test(file.text))) refuse(user, 'must name ' + name);
    }
  }
  if (!violations.length) {
    console.log('delivery: pass (sets %s, skills %s, experts %s, exceptions %s)', sets.size, skills, experts, exceptions.size);
  }
}

try {
  measure();
  for (const violation of violations) console.error('REFUSED: ' + violation);
  if (violations.length) process.exitCode = 1;
} catch (error) {
  console.error('delivery: ' + error.message + '; cannot measure.');
  process.exitCode = 2;
}
NODE
status=$?
case $status in 0|1|2) exit "$status" ;; *) die "Node exited $status" ;; esac
