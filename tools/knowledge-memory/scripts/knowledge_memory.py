#!/usr/bin/env python3
"""Local wiki lint and databased memory. Shapes: references/schemas.md and wiki-schemas.md.

Extraction belongs to the calling session; this script makes no model calls.
"""
from __future__ import annotations

import sys

MIN_PYTHON = (3, 11)
USAGE = """Usage: knowledge_memory.py help | --help | -h
  check
  bootstrap --store FILE
  chunk --set DIR
  chunk --source FILE --out DIR --dataset NAME [--max-chars N]
  ingest --set DIR --store FILE --extraction FILE
  recall --set DIR --store FILE --query TEXT [--as-of YYYY-MM-DD] [--top-k N]
  wiki-lint --set DIR
  review-pass --set DIR --store FILE
  promote --set DIR --store FILE (--decided FILE | --from-canon | --replay)
  mark-stale --set DIR --store FILE --id NODE [--valid-to YYYY-MM-DD]
  healthcheck --set DIR --store FILE [--eval]
  forget --set DIR --store FILE (--memory-only | --dataset | --data-id ID) [--confirm]

Paths are absolute; set, store and outputs must be outside this tool.
Store is a SQLite FILE, conventionally memory/knowledge/store/databased.sqlite.
Python 3.11+ and FTS5 for databased work; wiki-lint needs neither and runs on 3.9+.
check reports Python and FTS5 without installing anything. Standard library only.
chunk accepts UTF-8 .md/.txt, preserves text, splits at headings then paragraphs
and sentences, at most 6000 characters by default. Convert binaries first.
recall returns items only, using lexical terms and outgoing idea links (one hop).
as-of is recorded, never filtered. Default top-k is 15.
Unknown, repeated and command-inapplicable flags are refused by name.
forget without confirm reports the planned store changes and writes nothing.
No model calls, downloads, configuration discovery, or installs."""


class ProbeError(Exception):
    """A caller-correctable failure, printed only on stderr."""


def fail(message):
    raise ProbeError(message)


# Help precedes even filesystem-dependent standard-library imports.
if __name__ == "__main__" and (not sys.argv[1:] or sys.argv[1] == "help"
                               or "--help" in sys.argv[1:] or "-h" in sys.argv[1:]):
    print(USAGE)
    sys.exit(0)

import datetime
import hashlib
import json
import os
from pathlib import Path
import re

TOOL_DIR = Path(__file__).resolve().parent.parent
GENERAL_PACK = TOOL_DIR / "packs" / "general"
OPTIONS = {
    "check": (set(), set()),
    "bootstrap": ({"--store"}, set()),
    "chunk": (set(), {"--set", "--source", "--out", "--dataset", "--max-chars"}),
    "ingest": ({"--set", "--store", "--extraction"}, set()),
    "recall": ({"--set", "--store", "--query"}, {"--as-of", "--top-k"}),
    "wiki-lint": ({"--set"}, set()),
    "review-pass": ({"--set", "--store"}, set()),
    "promote": ({"--set", "--store"}, {"--decided", "--from-canon", "--replay"}),
    "mark-stale": ({"--set", "--store", "--id"}, {"--valid-to"}),
    "healthcheck": ({"--set", "--store"}, {"--eval"}),
    "forget": ({"--set", "--store"}, {"--memory-only", "--dataset", "--data-id", "--confirm"}),
}
FLAGS = {"--from-canon", "--replay", "--eval", "--memory-only", "--confirm"}
ARRAYS = {
    "entities": ("entity", "name entity_type aliases summary status quote"),
    "ideas": ("idea", "name definition domain status quote"),
    "idea_links": ("idea_link", "source_name relation target_name quote"),
    "facts": ("fact", "subject predicate object valid_from valid_to confidence quote"),
    "decisions": ("decision", "summary decided_by decided_on quote"),
    "open_questions": ("open_question", "question quote"),
}
REQUIRED = {
    "entities": "name entity_type status quote", "ideas": "name definition status quote",
    "idea_links": "source_name relation target_name quote", "facts": "subject predicate object quote",
    "decisions": "summary quote", "open_questions": "question quote",
}
RELATIONS = {"EXEMPLIFIES", "DEPENDS_ON", "CONTRADICTS", "SPECIALIZES", "DECIDED_IN", "APPLIES_TO"}
ENTITY_TYPES = {"person", "organization", "work", "place", "term", "other"}
REASONS = ("quote_not_located", "bad_type", "bad_status", "bad_relation", "too_long", "unknown_key", "hash_mismatch")
HASH = re.compile(r"sha256:[0-9a-f]{64}\Z")


def parse(argv):
    command = argv[0]
    if command not in OPTIONS:
        fail('unknown command "%s". Run knowledge_memory.py help.' % command)
    required, optional = OPTIONS[command]
    values = {}
    index = 1
    while index < len(argv):
        word = argv[index]
        if word not in required | optional:
            fail('unknown option "%s"; this tool installs nothing. Run knowledge_memory.py help.' % word)
        key = word[2:].replace('-', '_')
        if key in values:
            fail('%s was given more than once.' % word)
        index += 1
        if word in FLAGS or (word == '--dataset' and command == 'forget'):
            values[key] = True
        else:
            if index == len(argv) or argv[index].startswith('--'):
                fail('%s needs a value.' % word)
            values[key] = argv[index]
            index += 1
    missing = sorted(k for k in required if k[2:].replace('-', '_') not in values)
    if missing:
        fail('required option(s): ' + ', '.join(missing))
    if command == 'chunk':
        if 'set' in values:
            if set(values) != {'set'}:
                fail('chunk --set cannot combine with source, out, dataset or max-chars.')
        elif not {'source', 'out', 'dataset'} <= set(values):
            fail('chunk requires --set or --source, --out and --dataset.')
    for cmd, modes in [('promote', ('decided', 'from_canon', 'replay')), ('forget', ('memory_only', 'dataset', 'data_id'))]:
        if command == cmd and sum(k in values for k in modes) != 1:
            fail(cmd + ' requires exactly one mode: ' + ', '.join('--' + k.replace('_', '-') for k in modes))
    return command, values


def same_file(left, right):
    try:
        a, b = os.stat(left), os.stat(right)
    except FileNotFoundError:
        return False
    return (a.st_dev, a.st_ino) == (b.st_dev, b.st_ino)


def canonical(option, candidate):
    try:
        return Path(candidate).resolve()
    except (OSError, RuntimeError):
        fail('%s cannot be canonicalized: %s. Fix its permissions or symbolic links.' % (option, candidate))


def deepest_existing(option, path):
    while True:
        try:
            os.stat(path)
            return path
        except FileNotFoundError:
            if path.parent == path:
                fail('%s has no existing ancestor. Pass an accessible absolute path.' % option)
            path = path.parent
        except OSError:
            fail('%s has an inaccessible or non-directory ancestor. Fix the path.' % option)


def inside_dir(existing, root):
    while True:
        if same_file(existing, root):
            return True
        if existing.parent == existing:
            return False
        existing = existing.parent


def screen_path(option, value, *, destination=False, must_exist=False, as_dir=False):
    given = Path(value)
    if not given.is_absolute():
        fail('%s must be absolute: %s. Pass an absolute work path.' % (option, value))
    resolved = canonical(option, given)
    existing = deepest_existing(option, resolved)
    if destination:
        forbidden = inside_dir(existing, TOOL_DIR)
        # An outside hard link retains the identity of a file inside TOOL_DIR.
        if resolved.is_file() and not forbidden:
            for root, dirs, files in os.walk(TOOL_DIR, followlinks=False):
                for name in files:
                    if same_file(resolved, Path(root) / name):
                        forbidden = True
                        break
                if forbidden:
                    break
        if forbidden:
            fail('%s resolves inside this tool directory or aliases one of its files: %s. Pass an outside work path.' % (option, resolved))
    if must_exist and not resolved.exists():
        fail('%s does not exist: %s. Supply an existing path.' % (option, resolved))
    if resolved.exists() and (not resolved.is_dir() if as_dir else not resolved.is_file()):
        fail('%s is not a %s: %s. Correct the path.' % (option, 'directory' if as_dir else 'file', resolved))
    return resolved


def digest(data):
    return "sha256:" + hashlib.sha256(data).hexdigest()


def positive(value, name):
    try:
        result = int(value)
    except ValueError:
        fail('%s must be a positive integer. Correct the value.' % name)
    if result <= 0:
        fail('%s must be a positive integer. Correct the value.' % name)
    return result


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            fail('duplicate JSON key "%s". Remove the duplicate before retrying.' % key)
        result[key] = value
    return result


def read_json(path):
    try:
        value = json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=unique_object,
                           parse_constant=lambda token: fail('invalid JSON number %s. Use a finite number.' % token))
    except json.JSONDecodeError as error:
        fail('invalid JSON in %s at line %d: %s. Correct the JSON.' % (path, error.lineno, error.msg))
    if not isinstance(value, dict):
        fail('%s must contain one JSON object. Correct the document shape.' % path)
    return value


def chunk(v):
    source = screen_path('--source', v['source'], must_exist=True)
    out = screen_path('--out', v['out'], destination=True, as_dir=True)
    if source.suffix.lower() not in ('.md', '.txt'):
        fail('--source refuses %s. Convert it to UTF-8 .md or .txt first.' % source.name)
    cap = positive(v.get('max_chars', '6000'), '--max-chars')
    dataset = v['dataset'].strip()
    if not dataset:
        fail('--dataset is empty. Pass a non-empty dataset name.')
    manifest_path = screen_path('manifest', str(out / (source.stem + '.chunks.json')), destination=True)
    if same_file(source, manifest_path):
        fail('manifest aliases the source. Choose a different --out directory.')
    raw = source.read_bytes()
    text = raw.decode('utf-8')
    if any(ord(c) < 32 and c not in '\t\n\r' for c in text):
        fail('--source refuses binary content in ' + source.name)
    start = 0
    if source.suffix.lower() == '.md':
        frontmatter = re.match(r'\A---\r?\n.*?\r?\n(?:---|\.\.\.)[^\S\r\n]*(?:\r?\n|\Z)', text, re.S)
        if frontmatter:
            start = frontmatter.end()
            while start < len(text) and text[start] in '\r\n':
                start += 1
    boundaries = []
    headings = []
    section_start = start
    if source.suffix.lower() == '.md':
        for match in re.finditer(r'(?m)^ {0,3}(#{1,6})[ \t]+([^\r\n]*)(?:\r?\n|$)', text[start:]):
            offset = start + match.start()
            if offset > section_start:
                boundaries.append((section_start, offset, [name for _, name in headings]))
            level = len(match[1])
            title = re.sub(r'[ \t]+#+[ \t]*$', '', match[2]).strip()
            headings = [(depth, name) for depth, name in headings if depth < level]
            headings.append((level, title))
            section_start = offset
    if section_start < len(text):
        boundaries.append((section_start, len(text), [name for _, name in headings]))
    chunks = []
    for left, right, heading_path in boundaries:
        while left < right:
            end = min(left + cap, right)
            if end < right:
                window = text[left:end]
                breaks = list(re.finditer(r'\r?\n[ \t]*\r?\n(?:[ \t]*\r?\n)*', window))
                if not breaks:
                    breaks = list(re.finditer(r'[.?!](?=\s)\s*', window))
                if breaks:
                    end = left + breaks[-1].end()
            body = text[left:end]
            chunks.append(dict(index=len(chunks), chunk_hash=digest(body.encode('utf-8')),
                               heading_path=heading_path, char_start=left, char_end=end, text=body))
            left = end
    manifest = dict(schema='chunks/0.1.0', dataset=dataset, source_path=v.get('source_path', str(source)),
                    source_hash=digest(raw), source_bytes=len(raw),
                    chunker=dict(max_chars=cap, split='heading-then-paragraph'), chunks=chunks)
    out.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return dict(source_path=str(source), source_hash=manifest['source_hash'], chunks=len(chunks),
                total_chars=sum(len(c['text']) for c in chunks), max_chars=cap, manifest=str(manifest_path))


def pack_hash(pack):
    data = []
    for name in ('graph_model.py', 'ontology.ttl', 'extraction_prompt.md'):
        path = screen_path('pack ' + name, str(pack / name), must_exist=True)
        data.append(path.read_bytes())
    return digest(b''.join(data))


def shape(condition, message):
    if not condition:
        fail(message + '. Correct the JSON to schemas.md version 0.1.0.')


def check_keys(obj, allowed, label):
    shape(isinstance(obj, dict), label + ' must be an object')
    extra = set(obj) - set(allowed)
    shape(not extra, label + ' has unknown key(s): ' + ', '.join(sorted(extra)))


def normalized_name(name):
    cleaned = ''.join(c for c in name.lower() if c.isalnum() or c == ' ')
    words = cleaned.split()
    if words and words[-1] in {'inc', 'corp', 'corporation', 'llc', 'ltd', 'gmbh', 'co', 'company'}:
        words.pop()
    return ' '.join(words)


def node_problem(node, array, body):
    if not isinstance(node, dict):
        return 'bad_type', 'node must be an object'
    quote = node.get('quote')
    if not isinstance(quote, str) or not quote.strip():
        return 'quote_not_located', 'quote must be a non-empty string'
    if len(quote.split()) > 40:
        return 'too_long', 'quote exceeds 40 words'
    if ' '.join(quote.split()) not in ' '.join(body.split()):
        return 'quote_not_located', 'quote not located in chunk'
    missing = set(REQUIRED[array].split()) - set(node)
    if missing:
        return 'bad_type', 'missing field ' + sorted(missing)[0]
    if array in ('entities', 'ideas') and node.get('status') != 'Candidate':
        return 'bad_status', 'status must be Candidate'
    if array == 'entities' and node.get('entity_type') not in tuple(ENTITY_TYPES):
        return 'bad_type', 'entity_type is outside the pack'
    if array == 'idea_links' and node.get('relation') not in tuple(RELATIONS):
        return 'bad_relation', 'relation is outside the pack'
    for key in ARRAYS[array][1].split():
        if key not in node:
            continue
        value = node[key]
        if key in ('valid_from', 'valid_to', 'decided_on'):
            if value is not None:
                try:
                    if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
                        raise ValueError
                    datetime.date.fromisoformat(value)
                except ValueError:
                    return 'bad_type', key + ' must be YYYY-MM-DD or null'
        elif key == 'confidence':
            if type(value) not in (int, float) or not 0 <= value <= 1:
                return 'bad_type', 'confidence must be a number from 0 to 1'
        elif key == 'aliases':
            if not isinstance(value, list) or any(not isinstance(s, str) for s in value):
                return 'bad_type', 'aliases must be a flat list of strings'
        elif not isinstance(value, str):
            return 'bad_type', key + ' must be a string'
        limit = 120 if key in ('name', 'subject', 'predicate', 'object', 'source_name', 'target_name') else 400 if key in ('definition', 'summary', 'question') else None
        if limit and len(value) > limit:
            return 'too_long', key + ' exceeds ' + str(limit) + ' characters'
    for key in ('name', 'source_name', 'target_name'):
        if key in node and not normalized_name(node[key]):
            return 'bad_type', key + ' has no normalized name'
    extra = set(node) - set(ARRAYS[array][1].split())
    if extra:
        return 'unknown_key', 'unknown key ' + sorted(extra)[0]
    return None


def validate_files(extraction_path, chunks_path, pack):
    extraction, manifest = read_json(extraction_path), read_json(chunks_path)
    shape(extraction.get('pack_version') == pack_hash(pack), 'pack_version mismatch; re-extract with the current pack')
    check_keys(extraction, 'schema dataset source_path source_hash pack pack_version entries'.split(), 'extraction')
    shape(extraction.get('schema') == 'extraction/0.1.0', 'unsupported extraction schema')
    shape(manifest.get('schema') == 'chunks/0.1.0', 'unsupported chunk schema')
    for key in ('dataset', 'source_path', 'source_hash'):
        shape(isinstance(extraction.get(key), str) and bool(extraction[key]) and extraction[key] == manifest.get(key), key + ' mismatch between extraction and manifest')
    shape(bool(HASH.fullmatch(extraction['source_hash'])), 'invalid source_hash')
    shape(isinstance(extraction.get('pack'), str) and bool(extraction['pack']), 'pack must be a non-empty string')
    shape(isinstance(manifest.get('chunks'), list), 'manifest chunks must be an array')
    chunks = {}
    last_end = None
    for index, c in enumerate(manifest['chunks']):
        check_keys(c, 'index chunk_hash heading_path char_start char_end text'.split(), 'chunk')
        shape(type(c.get('index')) is int and c['index'] == index, 'chunk indices must be dense from zero')
        shape(isinstance(c.get('text'), str), 'chunk text must be a string')
        shape(c.get('chunk_hash') == digest(c['text'].encode('utf-8')), 'manifest chunk_hash mismatch at index ' + str(index))
        shape(isinstance(c.get('heading_path'), list) and all(isinstance(h, str) for h in c['heading_path']), 'heading_path must be a list of strings')
        shape(type(c.get('char_start')) is int and type(c.get('char_end')) is int and c['char_start'] >= 0
              and c['char_end'] - c['char_start'] == len(c['text']), 'invalid chunk character offsets')
        shape(last_end is None or c['char_start'] == last_end, 'chunk offsets must be contiguous')
        last_end = c['char_end']
        chunks[index] = c
    shape(isinstance(extraction.get('entries'), list), 'entries must be an array')
    report = dict(file=str(extraction_path), pack_version_ok=True, entries=len(extraction['entries']),
                  nodes_returned=0, nodes_accepted=0, rejected={key: 0 for key in REASONS}, rejected_detail=[],
                  accepted_by_kind={kind: 0 for kind, _ in ARRAYS.values()})
    accepted = []
    seen = set()
    for entry in extraction['entries']:
        check_keys(entry, ['chunk_index', 'chunk_hash', 'extracted_on', *ARRAYS], 'entry')
        index = entry.get('chunk_index')
        shape(type(index) is int and index >= 0, 'chunk_index must be a nonnegative integer')
        shape(index not in seen, 'duplicate chunk_index ' + str(index))
        seen.add(index)
        try:
            date = entry.get('extracted_on')
            shape(isinstance(date, str) and bool(re.fullmatch(r'\d{4}-\d{2}-\d{2}', date)), 'invalid extracted_on')
            datetime.date.fromisoformat(date)
        except ValueError:
            fail('invalid extracted_on. Use a real YYYY-MM-DD date.')
        c = chunks.get(index)
        hash_ok = c is not None and entry.get('chunk_hash') == c['chunk_hash']
        for array, (kind, _) in ARRAYS.items():
            shape(isinstance(entry.get(array), list), array + ' must be an array')
            for position, node in enumerate(entry[array]):
                report['nodes_returned'] += 1
                problem = node_problem(node, array, c['text']) if hash_ok else ('hash_mismatch', 'chunk_hash does not match manifest')
                if problem:
                    reason, message = problem
                    report['rejected'][reason] += 1
                    detail = reason + ': ' + message if reason in ('unknown_key', 'too_long', 'bad_type') else reason
                    report['rejected_detail'].append(dict(chunk_index=index, array=array, position=position, reason=detail))
                else:
                    report['nodes_accepted'] += 1
                    report['accepted_by_kind'][kind] += 1
                    accepted.append((kind, node, c))
        if not hash_ok and all(not entry[array] for array in ARRAYS):
            report['rejected']['hash_mismatch'] += 1
            report['rejected_detail'].append(dict(chunk_index=index, array=None, position=None, reason='hash_mismatch'))
    return extraction, manifest, accepted, report


DDL = (
    'CREATE TABLE IF NOT EXISTS datasets (dataset TEXT PRIMARY KEY)',
    'CREATE TABLE IF NOT EXISTS sources (dataset TEXT, source_path TEXT, source_hash TEXT, source_bytes INTEGER, PRIMARY KEY(dataset, source_path, source_hash))',
    'CREATE TABLE IF NOT EXISTS chunks (dataset TEXT, source_path TEXT, source_hash TEXT, chunk_index INTEGER, chunk_hash TEXT, heading_path TEXT, text TEXT, PRIMARY KEY(dataset, source_path, source_hash, chunk_index))',
    '''CREATE TABLE IF NOT EXISTS nodes (dataset TEXT, kind TEXT, node_id TEXT, name TEXT, normalized_name TEXT, text TEXT, status TEXT, quote TEXT, source_path TEXT, heading_path TEXT, chunk_hash TEXT, valid_from TEXT, valid_to TEXT, confidence REAL, PRIMARY KEY(dataset, node_id), UNIQUE(dataset, kind, normalized_name))''',
    'CREATE TABLE IF NOT EXISTS provenance (dataset TEXT, node_id TEXT, source_path TEXT, chunk_hash TEXT, quote TEXT, payload TEXT, UNIQUE(dataset, node_id, source_path, chunk_hash, quote, payload))',
    'CREATE TABLE IF NOT EXISTS edges (dataset TEXT, from_node_id TEXT, relation TEXT, to_node_id TEXT, quote TEXT, chunk_hash TEXT, UNIQUE(dataset, from_node_id, relation, to_node_id, quote, chunk_hash))',
    'CREATE TABLE IF NOT EXISTS unresolved_links (dataset TEXT, source_name TEXT, relation TEXT, target_name TEXT, quote TEXT, chunk_hash TEXT, UNIQUE(dataset, source_name, relation, target_name, quote, chunk_hash))',
    'CREATE TABLE IF NOT EXISTS aliases (dataset TEXT, kind TEXT, normalized_name TEXT, target_name TEXT, PRIMARY KEY(dataset,kind,normalized_name))',
    'CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(dataset UNINDEXED, name, text, quote)',
)


def node_record(kind, node):
    if kind in ('entity', 'idea'):
        name = node['name']
        text = node.get('summary', '') if kind == 'entity' else node['definition']
    elif kind == 'fact':
        name = text = ' '.join(node[k] for k in ('subject', 'predicate', 'object'))
    else:
        name = text = node['summary' if kind == 'decision' else 'question']
    norm = normalized_name(name)
    shape(bool(norm), kind + ' has no normalized identity')
    return name, text, norm, kind + ':' + norm.replace(' ', '-')


def db_path(value, writing):
    path = screen_path('--store', value, destination=True, must_exist=not writing)
    # SQLite can create these automatically. Screen each before connecting.
    for suffix in ('-journal', '-wal', '-shm'):
        sidecar = screen_path('SQLite sidecar', str(path) + suffix, destination=True)
        if sidecar.is_symlink() or Path(str(path) + suffix).is_symlink():
            fail('SQLite sidecar is a symbolic link. Use a database without linked sidecars.')
    return path


def load_graph(path, extraction, manifest, accepted, report):
    # Prepare identities before opening a writable database.
    records = [(kind, n, c, node_record(kind, n)) for kind, n, c in accepted if kind != 'idea_link']
    dataset = extraction['dataset']
    path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(path)
    inserted = merged = 0
    try:
        with con:
            for sql in DDL:
                con.execute(sql)
            con.execute('INSERT OR IGNORE INTO datasets VALUES (?)', (dataset,))
            con.execute('INSERT OR IGNORE INTO sources VALUES (?,?,?,?)', (dataset, extraction['source_path'], extraction['source_hash'], manifest.get('source_bytes')))
            for c in manifest['chunks']:
                con.execute('INSERT OR IGNORE INTO chunks VALUES (?,?,?,?,?,?,?)', (dataset, extraction['source_path'], extraction['source_hash'], c['index'], c['chunk_hash'], json.dumps(c['heading_path']), c['text']))
            for kind, n, c, (name, text, norm, node_id) in records:
                existing = con.execute('SELECT node_id FROM nodes WHERE dataset=? AND kind=? AND normalized_name=?', (dataset, kind, norm)).fetchone()
                if existing:
                    merged += 1
                else:
                    inserted += 1
                    cursor = con.execute('INSERT INTO nodes VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                                         (dataset, kind, node_id, name, norm, text, n.get('status', 'Candidate'), n['quote'], extraction['source_path'], json.dumps(c['heading_path']), c['chunk_hash'], n.get('valid_from'), n.get('valid_to'), n.get('confidence')))
                    con.execute('INSERT INTO nodes_fts(rowid,dataset,name,text,quote) VALUES (?,?,?,?,?)', (cursor.lastrowid, dataset, name, text, n['quote']))
                con.execute('INSERT OR IGNORE INTO provenance VALUES (?,?,?,?,?,?)', (dataset, node_id, extraction['source_path'], c['chunk_hash'], n['quote'], json.dumps(dict(n, _extracted_on=next(e['extracted_on'] for e in extraction['entries'] if e['chunk_index'] == c['index'])), sort_keys=True, ensure_ascii=False)))
            for kind, n, c in accepted:
                if kind == 'idea_link':
                    con.execute('INSERT OR IGNORE INTO unresolved_links VALUES (?,?,?,?,?,?)', (dataset, n['source_name'], n['relation'], n['target_name'], n['quote'], c['chunk_hash']))
            pending = con.execute('SELECT source_name,relation,target_name,quote,chunk_hash FROM unresolved_links WHERE dataset=? ORDER BY rowid', (dataset,)).fetchall()
            for source, relation, target, quote, chunk_hash in pending:
                ends = []
                for name, kinds in ((source, ('idea',)), (target, ('idea', 'entity'))):
                    placeholders = ','.join('?' for _ in kinds)
                    ends.append(con.execute('SELECT node_id FROM nodes WHERE dataset=? AND normalized_name=? AND kind IN (' + placeholders + ')', (dataset, normalized_name(name), *kinds)).fetchall())
                # Ambiguous names stay unresolved, rather than choosing silently.
                if len(ends[0]) == len(ends[1]) == 1:
                    con.execute('INSERT OR IGNORE INTO edges VALUES (?,?,?,?,?,?)', (dataset, ends[0][0][0], relation, ends[1][0][0], quote, chunk_hash))
                    con.execute('DELETE FROM unresolved_links WHERE dataset=? AND source_name=? AND relation=? AND target_name=? AND quote=? AND chunk_hash=?', (dataset, source, relation, target, quote, chunk_hash))
            edges = con.execute('SELECT count(*) FROM edges WHERE dataset=?', (dataset,)).fetchone()[0]
            unresolved = con.execute('SELECT count(*) FROM unresolved_links WHERE dataset=?', (dataset,)).fetchone()[0]
    finally:
        con.close()
    return dict(store=str(path), dataset=dataset, nodes_inserted=inserted, nodes_merged_by_name=merged, edges=edges, unresolved_links=unresolved)


def check_dataset(row, dataset, recovery='Stop using this database and rebuild it.'):
    if row['dataset'] != dataset:
        fail('dataset isolation self-check failed. ' + recovery)


def query(v):
    path = db_path(v['store'], False)
    top_k = positive(v.get('top_k', '15'), '--top-k')
    dataset = v['dataset']
    con = sqlite3.connect(path.as_uri() + '?mode=ro', uri=True)
    con.row_factory = sqlite3.Row
    items, seen = [], set()

    def item(row, score, hop, via):
        check_dataset(row, dataset)
        keys = 'kind node_id name text status quote source_path heading_path chunk_hash valid_from valid_to'.split()
        result = {key: row[key] for key in keys}
        result['heading_path'] = json.loads(result['heading_path'])
        result.update(score=score, hop=hop, via=via)
        seen.add(row['node_id'])
        items.append(result)

    try:
        rows = con.execute('''SELECT n.*, bm25(nodes_fts) AS score FROM nodes_fts JOIN nodes n
                              ON n.rowid=nodes_fts.rowid AND n.dataset=nodes_fts.dataset
                              WHERE nodes_fts MATCH ? AND nodes_fts.dataset=? AND n.dataset=?
                              ORDER BY score, n.rowid LIMIT ?''', (lexical_query(v['query']), dataset, dataset, top_k)).fetchall()
        resolved_rows = []
        for row in rows:
            score = row['score']
            aliases_seen = set()
            while row['status'] == 'Alias':
                if row['node_id'] in aliases_seen:
                    fail('alias cycle in this dataset; review the human alias decisions.')
                aliases_seen.add(row['node_id'])
                target = con.execute('SELECT target_name FROM aliases WHERE dataset=? AND kind=? AND normalized_name=?', (dataset, row['kind'], row['normalized_name'])).fetchone()
                if target is None:
                    fail('Alias has no recorded target; replay its human decision.')
                row = con.execute('SELECT * FROM nodes WHERE dataset=? AND kind=? AND normalized_name=?', (dataset, row['kind'], target['target_name'])).fetchone()
                if row is None:
                    fail('Alias target is absent; rebuild and replay the human decisions.')
            if row['node_id'] not in seen:
                item(row, score, 0, None)
                resolved_rows.append(row)
        for row in resolved_rows:
            if row['kind'] != 'idea':
                continue
            linked = con.execute('''SELECT n.*, e.relation FROM edges e JOIN nodes n
                                    ON n.node_id=e.to_node_id AND n.dataset=e.dataset
                                    WHERE e.dataset=? AND n.dataset=? AND e.from_node_id=? ORDER BY e.rowid''', (dataset, dataset, row['node_id'])).fetchall()
            for other in linked:
                check_dataset(other, dataset, 'Rebuild the database.')
                if other['node_id'] not in seen:
                    item(other, None, 1, dict(relation=other['relation'], node_id=row['node_id']))
    finally:
        con.close()
    return dict(schema='recall/0.1.0', dataset=dataset, query=v['query'], as_of=None, items=items, canon_confirmed=None)


class Q6Reader:
    """Small block-YAML recognizer; no YAML libraries, constructors or execution.

    Root mappings may contain one flat mapping or a list of flat mappings.
    A nested mapping may contain scalar lists, but no further mappings.
    [] is the sole flow spelling, used for an empty scalar list.
    """

    def __init__(self, text):
        self.lines = []
        for number, raw in enumerate(text.splitlines(), 1):
            if '\t' in raw:
                self.error(number, 'tabs are not allowed')
            content = self.uncomment(raw, number).rstrip()
            if content.strip():
                indent = len(content) - len(content.lstrip(' '))
                self.lines.append((number, indent, content.strip()))
        self.index = 0

    @staticmethod
    def error(line, message):
        fail('YAML line %d: %s. Use Q6 block scalars, flat lists and flat mappings.' % (line, message))

    def uncomment(self, raw, number):
        quote = None
        i = 0
        while i < len(raw):
            c = raw[i]
            if quote:
                if quote == '"' and c == '\\':
                    i += 2
                    continue
                if c == quote:
                    if quote == "'" and i + 1 < len(raw) and raw[i + 1] == "'":
                        i += 2
                        continue
                    quote = None
            elif c == '#' and (i == 0 or raw[i - 1].isspace()):
                return raw[:i]
            elif c in "\"'" and (i == 0 or raw[i - 1].isspace() or raw[i - 1] == ':'):
                quote = c
            i += 1
        if quote:
            self.error(number, 'unterminated quoted scalar')
        return raw

    def scalar(self, text, line):
        if not text:
            return None
        if text[0] in "\"'":
            if text[0] == '"':
                try:
                    value = json.loads(text)
                except json.JSONDecodeError:
                    self.error(line, 'invalid double-quoted scalar')
                if not isinstance(value, str):
                    self.error(line, 'expected a string scalar')
                return value
            if not re.fullmatch(r"'(?:[^']|'')*'", text):
                self.error(line, 'invalid single-quoted scalar')
            return text[1:-1].replace("''", "'")
        if text == '[]':
            return []
        if text[0] in '[{&*!|>@`' or text in ('---', '...') or re.search(r'(^|\s)[&*][^\s]+', text):
            self.error(line, 'anchors, tags, multi-line scalars or flow collections are not allowed')
        if re.search(r':(?:\s|$)', text) or text.startswith('- '):
            self.error(line, 'collection where a scalar is required')
        if text in ('null', '~'):
            return None
        if text in ('true', 'false'):
            return text == 'true'
        if re.fullmatch(r'-?\d+', text):
            return int(text)
        if re.fullmatch(r'-?\d+\.\d+', text):
            return float(text)
        return text

    @staticmethod
    def pair(text):
        return re.fullmatch(r'([A-Za-z_][A-Za-z0-9_.-]*):(?:\s+(.*)|$)', text)

    def put(self, result, match, line, indent, depth, flat):
        key, raw = match[1], match[2] or ''
        if key in result:
            self.error(line, 'duplicate key ' + key)
        child = self.index < len(self.lines) and self.lines[self.index][1] > indent
        if raw:
            result[key] = self.scalar(raw, line)
            if flat and isinstance(result[key], list):
                self.error(line, 'list mappings must contain only scalars')
            if child:
                self.error(self.lines[self.index][0], 'a scalar cannot have indented children')
        elif child:
            child_line, child_indent, body = self.lines[self.index]
            if flat:
                self.error(child_line, 'list mappings must be flat')
            if body.startswith('- '):
                result[key] = self.sequence(child_indent, allow_maps=depth == 0)
            else:
                if depth >= 1:
                    self.error(child_line, 'nested mapping two deep')
                result[key] = self.mapping(child_indent, depth + 1)
        else:
            result[key] = None

    def mapping(self, indent, depth, flat=False):
        result = {}
        while self.index < len(self.lines):
            line, level, body = self.lines[self.index]
            if level < indent:
                break
            if level != indent:
                self.error(line, 'inconsistent mapping indentation')
            match = self.pair(body)
            if not match:
                self.error(line, 'expected a mapping key')
            self.index += 1
            self.put(result, match, line, indent, depth, flat)
        return result

    def sequence(self, indent, allow_maps):
        result = []
        mapping_items = None
        while self.index < len(self.lines):
            line, level, body = self.lines[self.index]
            if level < indent:
                break
            if level != indent or not body.startswith('- '):
                self.error(line, 'expected a list item at the same indentation')
            body = body[2:].strip()
            match = self.pair(body)
            is_map = bool(match)
            if mapping_items is not None and mapping_items != is_map:
                self.error(line, 'mixed scalar and mapping list')
            mapping_items = is_map
            self.index += 1
            if match:
                if not allow_maps:
                    self.error(line, 'nested list mappings are not allowed')
                entry = {}
                self.put(entry, match, line, indent + 2, 1, True)
                if self.index < len(self.lines) and self.lines[self.index][1] > indent:
                    if self.lines[self.index][1] != indent + 2:
                        self.error(self.lines[self.index][0], 'inconsistent list mapping indentation')
                    more = self.mapping(indent + 2, 1, flat=True)
                    if set(entry) & set(more):
                        self.error(line, 'duplicate key in list mapping')
                    entry.update(more)
                result.append(entry)
            else:
                value = self.scalar(body, line)
                if isinstance(value, list):
                    self.error(line, 'nested lists are not allowed')
                result.append(value)
                if self.index < len(self.lines) and self.lines[self.index][1] > indent:
                    self.error(self.lines[self.index][0], 'list scalars cannot have children')
        return result

    def read(self):
        if not self.lines:
            return None
        line, indent, body = self.lines[0]
        if indent:
            self.error(line, 'root must start in column one')
        if body.startswith('- '):
            value = self.sequence(0, True)
        elif self.pair(body):
            value = self.mapping(0, 0)
        else:
            value = self.scalar(body, line)
            self.index = 1
        if self.index != len(self.lines):
            self.error(self.lines[self.index][0], 'unexpected additional content')
        return value


RECIPE_KEYS = set('set dataset backend kind owner sensitivity session_permission canon_confirmed sources pack node_sets chunking close_intensity retrieval review_cadence_days stale_after_days write_policy link_policy eval'.split())
REVIEW_DIRS = dict(new_finding='new_findings', stale='stale', merge_proposal='merge_proposals', conflict='conflicts')


def today():
    return datetime.date.today().isoformat()


def dated(value, label):
    if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
        fail(label + ' must be YYYY-MM-DD.')
    datetime.date.fromisoformat(value)
    return value


def child(root, relative, *, exists=False, directory=False):
    if not isinstance(relative, str) or Path(relative).is_absolute():
        fail('set-relative path required: ' + str(relative))
    path = screen_path('set path', str(root / relative), destination=True, must_exist=exists, as_dir=directory)
    if not path.is_relative_to(root):
        fail('path escapes its set: ' + relative)
    # Also refuse outside hardlinks: a mutation must affect only this set.
    if path.exists() and path.is_file() and path.stat().st_nlink > 1:
        fail('set file has multiple hard links: ' + relative)
    return path


def write_text(path, text, append=False):
    path = screen_path('output', str(path), destination=True)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('a' if append else 'w', encoding='utf-8') as handle:
        handle.write(text)


def write_json(path, value):
    write_text(path, json.dumps(value, ensure_ascii=False, allow_nan=False, indent=2) + '\n')


def set_recipe(value, backend=None):
    root = screen_path('--set', value, destination=True, must_exist=True, as_dir=True)
    data = Q6Reader(child(root, 'set.yaml', exists=True).read_text(encoding='utf-8')).read()
    if not isinstance(data, dict):
        fail('set.yaml must be a mapping.')
    unknown = set(data) - RECIPE_KEYS
    if unknown:
        fail('unknown recipe key: ' + sorted(unknown)[0])
    for key in ('set', 'dataset', 'backend', 'kind', 'owner', 'close_intensity', 'session_permission'):
        if key not in data or not isinstance(data[key], str):
            fail('missing or non-string recipe key: ' + key)
    if not re.fullmatch('[a-z0-9-]+', data['set']) or data['set'] != root.name:
        fail('recipe set must be a lowercase slug equal to its directory name.')
    if not re.fullmatch('[a-z0-9_]+', data['dataset']):
        fail('dataset must use lowercase letters, digits and underscores.')
    for key, allowed in [('backend', ('wiki', 'databased', 'graph', 'hosted')), ('kind', ('book', 'blog', 'website', 'domain', 'mixed')), ('close_intensity', ('core', 'full')), ('retrieval', ('lexical',)), ('chunking', ('heading-aware',)), ('sensitivity', ('public', 'internal', 'confidential'))]:
        if key in data and data[key] not in allowed:
            fail('invalid recipe ' + key + ': ' + str(data[key]))
    for key in ('review_cadence_days', 'stale_after_days'):
        data.setdefault(key, 7 if key == 'review_cadence_days' else 30)
        if type(data[key]) is not int or data[key] <= 0:
            fail(key + ' must be a positive integer.')
    for key, allowed in [('sources', {'include', 'exclude'}), ('write_policy', {'agents_may_remember_episodes'}), ('link_policy', {'auto_link'})]:
        block = data.get(key, {})
        if not isinstance(block, dict):
            fail(key + ' must be a mapping.')
        if set(block) - allowed:
            fail('unknown recipe key: ' + key + '.' + sorted(set(block) - allowed)[0])
    sources = data.setdefault('sources', {'include': ['corpus/**/*.md', 'corpus/**/*.txt'], 'exclude': ['corpus/originals/**']})
    for key in ('include', 'exclude'):
        if not isinstance(sources.get(key, []), list) or any(not isinstance(x, str) or Path(x).is_absolute() or '..' in Path(x).parts for x in sources.get(key, [])):
            fail('sources.' + key + ' must be flat relative globs without parent traversal.')
    if not isinstance(data.get('node_sets', []), list) or any(not isinstance(x, str) for x in data.get('node_sets', [])):
        fail('node_sets must be a flat string list.')
    if type(data.get('write_policy', {}).get('agents_may_remember_episodes', False)) is not bool:
        fail('write_policy.agents_may_remember_episodes must be boolean.')
    links = data.get('link_policy', {}).get('auto_link', [])
    if not isinstance(links, list) or any(x not in ('exact_ontology_match', 'normalized_name_match_same_type') for x in links):
        fail('link_policy.auto_link contains an unsupported rule.')
    for key in ('pack', 'eval', 'canon_confirmed'):
        if key in data and not isinstance(data[key], str):
            fail(key + ' must be a string.')
    if data['backend'] == 'hosted':
        fail('hosted-unspecified: read experts/Memory Expert/hosted.md; stop before reading sources.')
    if data['backend'] == 'graph':
        fail('graph-unspecified: read experts/Memory Expert/graph.md; stop before reading sources.')
    if backend and data['backend'] != backend:
        fail('this command requires backend: ' + backend)
    if not data['owner'].strip() or not data['session_permission'].strip():
        fail('owner and session_permission must name who permitted this session to process the material and when.')
    return root, data


def corpus_sources(root, recipe):
    corpus = child(root, 'corpus', exists=True, directory=True)
    included, excluded = set(), set()
    for pattern in recipe['sources'].get('exclude', []):
        excluded.update(p.resolve() for p in root.glob(pattern) if p.is_file())
    for pattern in recipe['sources'].get('include', []):
        for candidate in root.glob(pattern):
            if candidate.is_dir():
                continue
            source = child(root, str(candidate.relative_to(root)), exists=True)
            if not source.is_relative_to(corpus) or source.is_relative_to(corpus / 'originals'):
                continue
            if source not in excluded:
                if source.suffix.lower() not in ('.md', '.txt'):
                    fail('source refuses ' + source.name + '; convert to UTF-8 .md or .txt first.')
                included.add(source)
    paths = sorted(included)
    stems = [p.stem for p in paths]
    if len(stems) != len(set(stems)):
        fail('duplicate source stems would overwrite manifests; give corpus files distinct stems.')
    return paths


def chunk_set(v):
    if 'set' not in v:
        return chunk(v)
    root, recipe = set_recipe(v['set'], 'databased')
    paths = corpus_sources(root, recipe)
    out = child(root, 'extraction', directory=True)
    results = [chunk(dict(source=str(p), out=str(out), dataset=recipe['dataset'], source_path=p.relative_to(root).as_posix())) for p in paths]
    return dict(dataset=recipe['dataset'], chunks=sum(r['chunks'] for r in results), sources=results)


def lexical_query(text):
    terms = re.findall(r'\w+', text, re.UNICODE)
    if not terms:
        fail('query needs at least one letter or numeral.')
    return ' OR '.join('"' + term + '"' for term in terms)


def check(v):
    result = dict(interpreter=sys.executable, version='.'.join(map(str, sys.version_info[:3])), databased_python_ok=sys.version_info >= MIN_PYTHON, fts5=False, installed=False)
    try:
        import sqlite3
        with sqlite3.connect(':memory:') as con:
            con.execute('CREATE VIRTUAL TABLE t USING fts5(x)')
        result['fts5'] = True
    except Exception as error:
        result['fts5_error'] = str(error)
    return result


def graph_connection(path):
    con = sqlite3.connect(path)
    con.row_factory = sqlite3.Row
    return con


def bootstrap(v):
    path = db_path(v['store'], True)
    path.parent.mkdir(parents=True, exist_ok=True)
    with graph_connection(path) as con:
        for sql in DDL:
            con.execute(sql)
    return dict(store=str(path), schema='databased/0.1.0', fts5=True)


def ledger(root):
    path = child(root, 'extraction/ledger.json')
    return read_json(path) if path.exists() else dict(sources={})


def report_path(root, command):
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H%M%S%fZ')
    return child(root, 'reports/' + command + '-' + stamp + '.json')


def review_due(root, recipe):
    reports = child(root, 'reports', directory=True)
    dates = sorted(reports.glob('review-pass-*.json')) if reports.exists() else []
    if not dates:
        return True
    last = read_json(child(root, str(dates[-1].relative_to(root)), exists=True)).get('date')
    return not last or (datetime.date.today() - datetime.date.fromisoformat(last)).days >= recipe['review_cadence_days']


def ingest(v):
    root, recipe = set_recipe(v['set'], 'databased')
    path = db_path(v['store'], False)
    extraction_path = screen_path('--extraction', v['extraction'], must_exist=True)
    if not extraction_path.is_relative_to(child(root, 'extraction', exists=True, directory=True)):
        fail('--extraction must sit under this set extraction directory.')
    preliminary = read_json(extraction_path)
    source = child(root, preliminary.get('source_path', ''), exists=True)
    if source not in corpus_sources(root, recipe):
        fail('extraction source is not included by the recipe: ' + str(source))
    chunks_path = child(root, 'extraction/' + source.stem + '.chunks.json', exists=True)
    pack_name = recipe.get('pack', 'general')
    pack = GENERAL_PACK if pack_name == 'general' else child(root, pack_name, exists=True, directory=True)
    extraction, manifest, accepted, validation = validate_files(extraction_path, chunks_path, pack)
    shape(extraction['dataset'] == recipe['dataset'], 'dataset mismatch with recipe')
    shape(extraction['pack'] == pack_name, 'pack mismatch with recipe')
    raw = source.read_bytes()
    shape(digest(raw) == manifest['source_hash'], 'source_hash mismatch with source on disk')
    text = raw.decode('utf-8')
    for c in manifest['chunks']:
        shape(text[c['char_start']:c['char_end']] == c['text'], 'manifest text differs from source on disk')
    state = ledger(root)
    identity = dict(dataset=recipe['dataset'], source_hash=extraction['source_hash'], chunk_hashes=[c['chunk_hash'] for c in manifest['chunks']], pack_hash=extraction['pack_version'])
    key = extraction['source_hash']
    previous = state['sources'].get(key)
    with graph_connection(path) as con:
        in_store = con.execute('SELECT 1 FROM sources WHERE dataset=? AND source_hash=?', (recipe['dataset'], key)).fetchone()
    skipped = bool(previous and previous.get('identity') == identity and previous.get('complete') and in_store)
    result = dict(dataset=recipe['dataset'], date=today(), sources_added=0, skipped_by_hash=int(skipped), nodes_ingested=0, nodes_rejected=validation['rejected'], rejected_detail=validation['rejected_detail'], review_due=review_due(root, recipe))
    if not skipped:
        loaded = load_graph(path, extraction, manifest, accepted, validation)
        result.update(loaded)
        result.update(sources_added=int(not in_store), nodes_ingested=validation['nodes_accepted'])
        complete = len(extraction['entries']) == len(manifest['chunks']) and not validation['rejected_detail']
        state['sources'][key] = dict(identity=identity, source_path=extraction['source_path'], last_ingest=today(), complete=complete)
        write_json(child(root, 'extraction/ledger.json'), state)
    result['report'] = str(report_path(root, 'ingest'))
    write_json(Path(result['report']), result)
    return result


def recall(v):
    root, recipe = set_recipe(v['set'], 'databased')
    if 'as_of' in v:
        dated(v['as_of'], '--as-of')
    result = query(dict(v, dataset=recipe['dataset']))
    result.update(as_of=v.get('as_of'), canon_confirmed=recipe.get('canon_confirmed', ''))
    return result

LINK = re.compile(r'\[([^\]]+)\]\(([^)]+)\)')


def collapse(value):
    return ' '.join(value.split())


def wiki_lint(v):
    root = screen_path('--set', v['set'], destination=True, must_exist=True, as_dir=True)
    if child(root, 'set.yaml').exists():
        root, _ = set_recipe(v['set'], 'wiki')
    wiki = child(root, 'wiki', exists=True, directory=True)
    corpus = child(root, 'corpus', exists=True, directory=True)
    index = child(root, 'wiki/index.md')
    log = child(root, 'wiki/log.md')
    issues, fixes = [], []
    articles = []
    for p in sorted(wiki.rglob('*.md')):
        path = child(root, p.relative_to(root).as_posix(), exists=True)
        if path in (index, log):
            continue
        relative = path.relative_to(wiki)
        if len(relative.parts) != 2 or not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*\.md', path.name):
            issues.append(dict(file=str(relative), reason='article must be wiki/<topic>/<concept-kebab-case>.md'))
        articles.append(path)
    corpus_files = [child(root, p.relative_to(root).as_posix(), exists=True) for p in sorted(corpus.rglob('*')) if p.is_file() and p.suffix.lower() in ('.md', '.txt') and not p.is_relative_to(corpus / 'originals')]

    def inspect_links(path, text, allowed, label):
        replacements = []
        for match in LINK.finditer(text):
            target_text = match[2].split('#', 1)[0]
            if not target_text:
                issues.append(dict(file=str(path.relative_to(root)), reason=label + ' empty link', link=match[2]))
                continue
            candidate = canonical('wiki link', path.parent / target_text)
            if candidate not in allowed:
                matches = [p for p in allowed if p.name == Path(target_text).name]
                issues.append(dict(file=str(path.relative_to(root)), reason=label + ' broken or outside link', link=match[2]))
                # An outside or absolute link is unsafe, even if its basename matches.
                if len(matches) == 1 and not Path(target_text).is_absolute() and candidate.is_relative_to(root) and not re.match(r'[A-Za-z][A-Za-z0-9+.-]*:', target_text):
                    replacement = os.path.relpath(matches[0], path.parent).replace(os.sep, '/')
                    replacements.append((match.start(2), match.end(2), replacement))
                    fixes.append(dict(file=str(path.relative_to(root)), before=match[2], after=replacement))
        for start, end, replacement in reversed(replacements):
            text = text[:start] + replacement + text[end:]
        return text

    index_text = index.read_text(encoding='utf-8') if index.exists() else '# Knowledge Base Index\n'
    fixed_index = inspect_links(index, index_text, articles, 'index')
    catalogued = [canonical('index link', index.parent / m[2].split('#', 1)[0]) for m in LINK.finditer(fixed_index)]
    for path in set(catalogued):
        if catalogued.count(path) > 1:
            issues.append(dict(file='wiki/index.md', reason='duplicate index entry', article=str(path.relative_to(root)) if path.is_relative_to(root) else str(path)))
    missing_rows = {}
    for path in articles:
        original = path.read_text(encoding='utf-8')
        title_match = re.search(r'^# (.+)$', original, re.M)
        updated = re.search(r'^- Updated: (\d{4}-\d{2}-\d{2})\s*$', original, re.M)
        if not title_match or not updated or not re.search(r'^- Sources: .+', original, re.M):
            issues.append(dict(file=str(path.relative_to(root)), reason='missing title, Updated or Sources metadata'))
        elif path not in catalogued:
            issues.append(dict(file='wiki/index.md', reason='missing index entry', article=str(path.relative_to(wiki))))
            row = '- [%s](%s): %s. Updated: %s\n' % (title_match[1], path.relative_to(wiki).as_posix(), title_match[1].rstrip('.'), updated[1])
            missing_rows.setdefault(path.parent.name, []).append(row)
            fixes.append(dict(file='wiki/index.md', added=str(path.relative_to(wiki))))
        raw_match = re.search(r'^- Raw: (.*)$', original, re.M)
        if not raw_match:
            # Archive pages cite wiki articles in Sources and have no Raw field.
            sources = re.search(r'^- Sources: (.*)$', original, re.M)
            links = list(LINK.finditer(sources[1])) if sources else []
            if not links or any(canonical('archive source', path.parent / m[2].split('#', 1)[0]) not in articles for m in links):
                issues.append(dict(file=str(path.relative_to(root)), reason='missing Raw; archive Sources must link wiki articles'))
            continue
        raw_line = inspect_links(path, raw_match[0], corpus_files, 'Raw')
        revised = original[:raw_match.start()] + raw_line + original[raw_match.end():]
        # See Also links share the same safe repair class.
        see = re.search(r'^## See Also\s*\n', revised, re.M)
        if see:
            revised = revised[:see.end()] + inspect_links(path, revised[see.end():], articles, 'See Also')
        else:
            issues.append(dict(file=str(path.relative_to(root)), reason='missing See Also section'))
        raw_links = list(LINK.finditer(raw_line))
        if not raw_links:
            issues.append(dict(file=str(path.relative_to(root)), reason='Raw has no corpus links'))
        texts = []
        for link in raw_links:
            linked = canonical('Raw', path.parent / link[2].split('#', 1)[0])
            if linked in corpus_files:
                texts.append(collapse(linked.read_text(encoding='utf-8')))
        body = revised.split(raw_line, 1)[1].split('## See Also', 1)[0]
        literals = re.findall(r'"([^"]+)"|“([^”]+)”|‘([^’]+)’|(?<!\w)\'(?!\s)([^\']+)\'(?!\w)', body)
        quoted = [next(part for part in match if part) for match in literals]
        numerals = re.findall(r'(?<!\w)\d+(?:[.,:/-]\d+)*(?:[%½¼¾])?', body)
        for literal in dict.fromkeys(quoted + numerals):
            if not any(collapse(literal) in text for text in texts):
                issues.append(dict(file=str(path.relative_to(root)), reason='literal not located in linked corpus', literal=literal))
        if revised != original:
            write_text(path, revised)
    for topic, rows in missing_rows.items():
        heading = re.search(r'^## ' + re.escape(topic) + r'\s*$', fixed_index, re.M)
        if heading:
            next_heading = re.search(r'^## ', fixed_index[heading.end():], re.M)
            at = heading.end() + next_heading.start() if next_heading else len(fixed_index)
            fixed_index = fixed_index[:at].rstrip() + '\n' + ''.join(rows) + '\n' + fixed_index[at:]
        else:
            fixed_index = fixed_index.rstrip() + '\n\n## ' + topic + '\n\n' + ''.join(rows)
    if not index.exists() or fixed_index != index_text:
        write_text(index, fixed_index)
    if not log.exists():
        write_text(log, '# Wiki Log\n')
    write_text(log, '\n## [%s] lint | %d issues found, %d auto-fixed\n' % (today(), len(issues), len(fixes)), append=True)
    return dict(backend='wiki', issues_found=len(issues), auto_fixed=len(fixes), issues=issues, fixes=fixes, log=str(log))


def item_parts(path):
    text = path.read_text(encoding='utf-8')
    front = re.match(r'\A---\n(.*?)\n---\n', text, re.S)
    if not front:
        fail('review item needs closed YAML frontmatter: ' + path.name)
    meta = Q6Reader(front[1]).read()
    body = text[front.end():]
    blocks = {}
    for name in ('Subject', 'Decision'):
        match = re.search(r'^## ' + name + r'\s*\n(.*?)(?=^## |\Z)', body, re.S | re.M)
        if not match:
            fail('review item missing ' + name + ': ' + path.name)
        blocks[name] = Q6Reader(match[1]).read() or {}
    return meta, blocks['Subject'], blocks['Decision'], text


def review_files(root):
    directory = child(root, 'review', directory=True)
    return [child(root, p.relative_to(root).as_posix(), exists=True) for p in sorted(directory.rglob('*.md')) if p.name != 'changelog.md'] if directory.exists() else []


def render_review_item(dataset, node, item_type, action, why, identity, target='', decision=None):
    # Field ordering and lifecycle follow templates/review_item.md.
    q = lambda value: json.dumps(str(value), ensure_ascii=False)
    safe = lambda value: str(value or '').replace('|', '&#124;').replace('\n', ' ')
    decision = decision or dict(reviewer='', decision='', date='', note='')
    return ('---\nid: %s\ntype: %s\ndataset: %s\nstatus: %s\ncreated: %s\n---\n\n'
            '# %s\n\n## Surface forms\n\n- %s (1 occurrences)\n\n## Subject\n\n'
            'node_type: %s\nnormalized_name: %s\nnode_id: %s\ndata_id: %s\ntarget: %s\n\n'
            '## Proposed action\n\n%s\n\n## Evidence\n\n'
            '| Quote (40 words at most) | Source path | Content hash | Extractor confidence |\n'
            '|--------------------------|------------|--------------|----------------------|\n'
            '| "%s" | %s | %s | %s |\n\n## Why this is not auto-decidable\n\n%s\n\n'
            '## Recommendation\n\n\n## Decision\n\nreviewer: %s\ndecision: %s\ndate: %s\nnote: %s\n') % (
                identity, item_type, dataset, 'decided' if decision['reviewer'] else 'open', today(), safe(node['name']), q(node['name']),
                node['kind'], q(node['normalized_name']), q(node['node_id']), q(node['source_path']), q(target), action,
                safe(node['quote']), safe(node['source_path']), node['chunk_hash'], node['confidence'] if node['confidence'] is not None else '', why,
                q(decision['reviewer']), q(decision['decision']), q(decision['date']), q(decision.get('note', '')))


def review_pass(v):
    import difflib
    root, recipe = set_recipe(v['set'], 'databased')
    path = db_path(v['store'], False)
    dataset = recipe['dataset']
    existing = {item_parts(p)[0]['id'] for p in review_files(root)}
    results = []
    with graph_connection(path) as con:
        nodes = [dict(r) for r in con.execute('SELECT * FROM nodes WHERE dataset=? ORDER BY rowid', (dataset,))]
        def add(node, kind, action, why, target=''):
            token = digest(json.dumps([dataset, kind, node['kind'], node['normalized_name'], target, node['chunk_hash']], sort_keys=True).encode())[7:23]
            identity = dataset + '-' + token
            if identity in existing:
                return
            destination = child(root, 'review/' + REVIEW_DIRS[kind] + '/' + identity + '.md')
            write_text(destination, render_review_item(dataset, node, kind, action, why, identity, target))
            existing.add(identity)
            results.append(dict(type=kind, file=str(destination)))
        for node in nodes:
            evidence = con.execute('SELECT DISTINCT source_path,payload FROM provenance WHERE dataset=? AND node_id=?', (dataset, node['node_id'])).fetchall()
            if node['status'] == 'Candidate':
                add(node, 'new_finding', 'promote', 'Candidate needs a human decision; %d provenance records.' % len(evidence))
                days = []
                for row in evidence:
                    payload = json.loads(row['payload'])
                    if payload.get('_extracted_on'):
                        days.append((datetime.date.today() - datetime.date.fromisoformat(payload['_extracted_on'])).days)
                missing = not child(root, node['source_path']).exists()
                if missing or (len({r['source_path'] for r in evidence}) <= 1 and days and min(days) >= recipe['stale_after_days']):
                    add(node, 'stale', 'mark-stale', 'Source missing or single-source Candidate beyond stale_after_days.')
        for i, left in enumerate(nodes):
            for right in nodes[i + 1:]:
                if left['kind'] == right['kind'] and left['normalized_name'] != right['normalized_name'] and difflib.SequenceMatcher(None, left['normalized_name'], right['normalized_name']).ratio() >= 0.85:
                    add(left, 'merge_proposal', 'merge-into ' + right['node_id'], 'Similar names are evidence for review only, including protected types.', right['normalized_name'])
        facts = con.execute("SELECT n.*, p.payload FROM nodes n JOIN provenance p ON n.dataset=p.dataset AND n.node_id=p.node_id WHERE n.dataset=? AND n.kind='fact'", (dataset,)).fetchall()
        for i, left in enumerate(facts):
            a = json.loads(left['payload'])
            for right in facts[i + 1:]:
                b = json.loads(right['payload'])
                if a.get('subject') == b.get('subject') and a.get('predicate') == b.get('predicate') and a.get('object') != b.get('object'):
                    add(dict(left), 'conflict', 'review', 'Same subject and predicate have different objects; human checks dates and scope.', right['normalized_name'])
        for edge in con.execute("SELECT * FROM edges WHERE dataset=? AND relation='CONTRADICTS'", (dataset,)):
            left = next(n for n in nodes if n['node_id'] == edge['from_node_id'])
            right = next(n for n in nodes if n['node_id'] == edge['to_node_id'])
            add(left, 'conflict', 'review', 'An extracted typed link asserts a contradiction.', right['normalized_name'])
    result = dict(dataset=dataset, date=today(), counts={k: sum(r['type'] == k for r in results) for k in REVIEW_DIRS}, items=results)
    write_json(report_path(root, 'review-pass'), result)
    return result


def canon_items(root, recipe, con):
    confirmation = re.fullmatch(r'(.+),\s*(\d{4}-\d{2}-\d{2})', recipe.get('canon_confirmed', ''))
    if not confirmation:
        fail('canon_confirmed must name a person and YYYY-MM-DD before --from-canon.')
    reviewer, date = confirmation.groups()
    dated(date, 'canon_confirmed date')
    text = child(root, 'canon.md', exists=True).read_text(encoding='utf-8')
    proposals, kind, headers = [], None, None
    for line in text.splitlines():
        if line.startswith('## '):
            kind = {'## Canonical ideas': 'idea', '## Canonical entities': 'entity'}.get(line.strip())
            headers = None
        elif kind and line.startswith('|'):
            cells = [c.strip() for c in re.split(r'(?<!\\)\|', line.strip().strip('|'))]
            if headers is None:
                headers = [c.lower() for c in cells]
                continue
            if all(re.fullmatch(r'[-: ]+', c) for c in cells):
                continue
            if len(cells) != len(headers):
                fail('canon table row does not match its header.')
            row = dict(zip(headers, cells))
            name = row.get(kind, '')
            quote = row.get('quote', '').strip('"')
            source_text = row.get('source', '').strip('`')
            link = LINK.fullmatch(source_text)
            source_text = link[2] if link else source_text
            source = child(root, source_text, exists=True)
            if not source.is_relative_to(root / 'corpus') or source.is_relative_to(root / 'corpus/originals'):
                fail('canon Source must name compiled-from corpus text.')
            if not quote or len(quote.split()) > 40 or collapse(quote) not in collapse(source.read_text(encoding='utf-8')):
                fail('canon quote not located or exceeds 40 words: ' + name)
            node = con.execute('SELECT * FROM nodes WHERE dataset=? AND kind=? AND normalized_name=?', (recipe['dataset'], kind, normalized_name(name))).fetchone()
            if node is None:
                fail('canon entry has no ingested node: ' + name + '; extract and ingest it first.')
            node = dict(node)
            grounded = con.execute('SELECT c.chunk_hash,c.text FROM provenance p JOIN chunks c ON p.dataset=c.dataset AND p.source_path=c.source_path AND p.chunk_hash=c.chunk_hash WHERE p.dataset=? AND p.node_id=? AND p.source_path=?', (recipe['dataset'], node['node_id'], source_text)).fetchall()
            grounded = next((r for r in grounded if collapse(quote) in collapse(r['text'])), None)
            if not grounded:
                fail('canon entry source differs from its ingested evidence: ' + name)
            node.update(quote=quote, source_path=source_text, chunk_hash=grounded['chunk_hash'])
            proposals.append((node, 'promote', ''))
            for alias in re.split(r';', row.get('aliases', '')):
                alias = alias.strip().strip('"')
                if not alias or normalized_name(alias) == node['normalized_name']:
                    continue
                alias_node = con.execute('SELECT * FROM nodes WHERE dataset=? AND kind=? AND normalized_name=?', (recipe['dataset'], kind, normalized_name(alias))).fetchone()
                if alias_node is None:
                    alias_node = dict(node, name=alias, normalized_name=normalized_name(alias), node_id=kind + ':' + normalized_name(alias).replace(' ', '-'))
                proposals.append((dict(alias_node), 'alias-of ' + node['node_id'], node['normalized_name']))
    if not proposals:
        fail('confirmed canon has no Canonical ideas or Canonical entities table rows.')
    paths = []
    for node, action, target in proposals:
        identity = recipe['dataset'] + '-canon-' + digest(json.dumps([node['kind'], node['normalized_name'], action, reviewer, date]).encode())[7:23]
        path = child(root, 'review/decided/' + identity + '.md')
        if not path.exists():
            decision = dict(reviewer=reviewer, decision=action, date=date, note='Confirmed canon.md')
            write_text(path, render_review_item(recipe['dataset'], node, 'new_finding', action, 'Human confirmed canon with located quote.', identity, target, decision))
        paths.append(path)
    return paths


def promote(v):
    root, recipe = set_recipe(v['set'], 'databased')
    path = db_path(v['store'], False)
    dataset = recipe['dataset']
    decided_root = child(root, 'review/decided', directory=True)
    plans, deferred, results = [], [], []
    with graph_connection(path) as con:
        if 'from_canon' in v:
            paths = canon_items(root, recipe, con)
        elif 'decided' in v:
            candidate = screen_path('--decided', v['decided'], destination=True, must_exist=True)
            if not candidate.is_relative_to(decided_root):
                fail('--decided must sit under review/decided/.')
            paths = [child(root, candidate.relative_to(root).as_posix(), exists=True)]
        else:
            paths = [p for p in review_files(root) if p.is_relative_to(decided_root) and item_parts(p)[0].get('status') == 'applied']
        if v.get('replay'):
            log_path = child(root, 'review/changelog.md')
            log_lines = log_path.read_text(encoding='utf-8').splitlines() if log_path.exists() else []
            order = {}
            for i, line in enumerate(log_lines):
                parts = line.split(' | ')
                if len(parts) >= 2:
                    order[parts[1]] = i
            parsed = {p: item_parts(p) for p in paths}
            paths.sort(key=lambda p: (parsed[p][2].get('date', ''), order.get(parsed[p][0].get('id'), -1), p.name))
            by_date = {}
            for p in paths:
                meta, subject, decision, _ = parsed[p]
                key = (subject.get('node_type'), subject.get('normalized_name'), decision.get('date'))
                if key in by_date and (meta.get('id') not in order or by_date[key] not in order):
                    fail('same-date replay decisions need application order in review/changelog.md.')
                by_date[key] = meta.get('id')
        for item in paths:
            meta, subject, decision, original = item_parts(item)
            expected = 'applied' if v.get('replay') else 'decided'
            if meta.get('status') != expected:
                if v.get('from_canon') and meta.get('status') == 'applied':
                    continue
                fail('item must have status: ' + expected + ': ' + item.name)
            if meta.get('dataset') != dataset:
                fail('review item dataset mismatch: ' + item.name)
            for key in ('reviewer', 'decision', 'date'):
                if not isinstance(decision.get(key), str) or not decision[key].strip():
                    fail('decision block incomplete: ' + key)
            dated(decision['date'], 'decision date')
            kind = str(subject.get('node_type', '')).lower().replace(' ', '_')
            norm = subject.get('normalized_name', '')
            if not isinstance(norm, str) or normalized_name(norm) != norm:
                fail('Subject normalized_name is not normalized.')
            node = con.execute('SELECT * FROM nodes WHERE dataset=? AND kind=? AND normalized_name=?', (dataset, kind, norm)).fetchone()
            action, _, target_text = decision['decision'].partition(' ')
            if node is None and action not in ('alias-of', 'merge-into'):
                fail('Subject has no matching (dataset, kind, normalized_name): ' + norm)
            if action == 'edit-ontology':
                deferred.append(dict(file=str(item), action=action, reason='Human edit required in the set pack; no databased change applied.'))
                continue
            if action not in ('promote', 'mark-stale', 'reject', 'alias-of', 'merge-into'):
                fail('unknown decision: ' + action)
            target = None
            if action in ('alias-of', 'merge-into'):
                stable = subject.get('target')
                if not stable:
                    fail('alias and merge decisions need Subject target normalized_name for replay.')
                # Subject target carries normalized identity; a legacy appended node id is accepted.
                stable = stable.split(' (', 1)[0]
                target = con.execute('SELECT * FROM nodes WHERE dataset=? AND kind=? AND normalized_name=?', (dataset, kind, normalized_name(stable))).fetchone()
                if target is None or target['normalized_name'] == norm:
                    fail('alias or merge target must be another node of the same kind in this dataset.')
                if not v.get('replay') and target_text and target_text != target['node_id']:
                    fail('decision target and Subject target disagree.')
            if node is None:
                node = dict(target, name=norm, normalized_name=norm, node_id=kind + ':' + norm.replace(' ', '-'), _new_alias=True)
            plans.append((item, meta, decision, original, node, action, target))
        for item, meta, decision, original, node, action, target in plans:
            if isinstance(node, dict) and node.get('_new_alias'):
                columns = 'dataset kind node_id name normalized_name text status quote source_path heading_path chunk_hash valid_from valid_to confidence'.split()
                cursor = con.execute('INSERT OR IGNORE INTO nodes VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', tuple(node[k] for k in columns))
                if cursor.rowcount:
                    con.execute('INSERT INTO nodes_fts(rowid,dataset,name,text,quote) VALUES (?,?,?,?,?)', (cursor.lastrowid, dataset, node['name'], node['text'], node['quote']))
                    con.execute('INSERT OR IGNORE INTO provenance SELECT dataset,?,source_path,chunk_hash,quote,payload FROM provenance WHERE dataset=? AND node_id=?', (node['node_id'], dataset, target['node_id']))
            status = {'promote': 'Canonical', 'mark-stale': 'Stale', 'reject': 'Rejected', 'alias-of': 'Alias', 'merge-into': 'Alias'}[action]
            con.execute('UPDATE nodes SET status=?,valid_to=CASE WHEN ? THEN ? ELSE valid_to END WHERE dataset=? AND node_id=?', (status, action == 'mark-stale', decision['date'], dataset, node['node_id']))
            if target:
                con.execute('INSERT OR REPLACE INTO aliases VALUES (?,?,?,?)', (dataset, node['kind'], node['normalized_name'], target['normalized_name']))
            else:
                con.execute('DELETE FROM aliases WHERE dataset=? AND kind=? AND normalized_name=?', (dataset, node['kind'], node['normalized_name']))
            results.append(dict(file=str(item), action=action, node_id=node['node_id'], status=status))
    # Database commits first; replaying a decided item after an interrupted file write is idempotent.
    for item, meta, decision, original, node, action, target in plans:
        if not v.get('replay'):
            write_text(item, re.sub(r'(?m)^status: decided$', 'status: applied', original, count=1))
            changelog = child(root, 'review/changelog.md')
            marker = '- %s | %s | %s | %s\n' % (decision['date'], meta['id'], decision['reviewer'], decision['decision'])
            if not changelog.exists() or marker not in changelog.read_text(encoding='utf-8'):
                write_text(changelog, marker, append=True)
    return dict(dataset=dataset, applied=results, deferred=deferred, replay=bool(v.get('replay')))


def mark_stale(v):
    root, recipe = set_recipe(v['set'], 'databased')
    path = db_path(v['store'], False)
    date = dated(v.get('valid_to', today()), '--valid-to')
    with graph_connection(path) as con:
        cursor = con.execute("UPDATE nodes SET status='Stale',valid_to=? WHERE dataset=? AND node_id=?", (date, recipe['dataset'], v['id']))
        if not cursor.rowcount:
            fail('node not found in this dataset: ' + v['id'])
    return dict(dataset=recipe['dataset'], node_id=v['id'], status='Stale', valid_to=date, deleted=0)


def healthcheck(v):
    root, recipe = set_recipe(v['set'], 'databased')
    path = db_path(v['store'], False)
    dataset = recipe['dataset']
    with graph_connection(path) as con:
        counts = [dict(row) for row in con.execute('SELECT kind,status,count(*) AS count FROM nodes WHERE dataset=? GROUP BY kind,status', (dataset,))]
        missing = con.execute("SELECT count(*) FROM nodes n WHERE dataset=? AND kind='fact' AND (quote='' OR source_path='' OR NOT EXISTS (SELECT 1 FROM provenance p WHERE p.dataset=n.dataset AND p.node_id=n.node_id))", (dataset,)).fetchone()[0]
    backlog = []
    for item in review_files(root):
        meta, _, _, _ = item_parts(item)
        if meta.get('status') != 'applied':
            created = dated(meta.get('created'), 'review created')
            backlog.append(dict(file=str(item), type=meta.get('type'), status=meta.get('status'), age_days=(datetime.date.today() - datetime.date.fromisoformat(created)).days))
    state = ledger(root)
    dates = [r['last_ingest'] for r in state['sources'].values() if r.get('last_ingest')]
    result = dict(dataset=dataset, date=today(), counts=counts, facts_missing_provenance=missing, backlog=backlog, last_ingest=max(dates) if dates else None)
    if v.get('eval'):
        evaluation = Q6Reader(child(root, recipe.get('eval', 'eval.questions.yaml'), exists=True).read_text(encoding='utf-8')).read()
        questions = evaluation.get('questions') if isinstance(evaluation, dict) else evaluation
        if isinstance(evaluation, dict) and set(evaluation) != {'questions'}:
            fail('eval mapping accepts only questions.')
        if not isinstance(questions, list):
            fail('eval questions must be a list of flat mappings.')
        checks = []
        for q in questions:
            if not isinstance(q, dict) or set(q) - set('id type question expected must_not_match as_of'.split()):
                fail('eval question has unknown keys or is not a flat mapping.')
            if any(k in q and not isinstance(q[k], str) for k in ('id', 'type', 'question', 'expected', 'must_not_match', 'as_of')):
                fail('eval question fields must be strings.')
            if not q.get('question') or not (q.get('expected') or q.get('must_not_match')):
                checks.append(dict(id=q.get('id'), passed=False, reason='question and at least one of expected or must_not_match must be filled'))
                continue
            if q.get('type') == 'as-of':
                checks.append(dict(id=q.get('id'), passed=False, reason='as-of filtering is a declared gap; human dated-item read required'))
                continue
            retrieved = query(dict(store=str(path), dataset=dataset, query=q['question']))['items']
            blob = json.dumps(retrieved, ensure_ascii=False).casefold()
            expected = q.get('expected', '')
            matched = any(x['source_path'] == expected[5:] for x in retrieved) if expected.startswith('path:') else expected.casefold() in blob
            forbidden = q.get('must_not_match', '')
            checks.append(dict(id=q.get('id'), passed=matched and (not forbidden or forbidden.casefold() not in blob), items=len(retrieved)))
        result['eval'] = dict(scope='databased retrieval only', passed=bool(checks) and all(r['passed'] for r in checks), questions=checks)
    write_json(report_path(root, 'healthcheck'), result)
    return result


def drop_source(con, dataset, source):
    affected = [r[0] for r in con.execute('SELECT DISTINCT node_id FROM provenance WHERE dataset=? AND source_path=?', (dataset, source))]
    hashes = [r[0] for r in con.execute('SELECT chunk_hash FROM chunks WHERE dataset=? AND source_path=?', (dataset, source))]
    con.execute('DELETE FROM provenance WHERE dataset=? AND source_path=?', (dataset, source))
    for node_id in affected:
        remaining = con.execute('SELECT * FROM provenance WHERE dataset=? AND node_id=? ORDER BY rowid LIMIT 1', (dataset, node_id)).fetchone()
        if remaining:
            chunk = con.execute('SELECT heading_path FROM chunks WHERE dataset=? AND source_path=? AND chunk_hash=?', (dataset, remaining['source_path'], remaining['chunk_hash'])).fetchone()
            current = con.execute('SELECT kind,name,status FROM nodes WHERE dataset=? AND node_id=?', (dataset, node_id)).fetchone()
            payload = json.loads(remaining['payload'])
            name, text, _, _ = node_record(current['kind'], payload)
            if current['status'] == 'Alias':
                name = current['name']
            con.execute('UPDATE nodes SET name=?,text=?,source_path=?,quote=?,chunk_hash=?,heading_path=?,confidence=?,valid_from=? WHERE dataset=? AND node_id=?', (name, text, remaining['source_path'], remaining['quote'], remaining['chunk_hash'], chunk['heading_path'], payload.get('confidence'), payload.get('valid_from'), dataset, node_id))
        else:
            row = con.execute('SELECT rowid,kind,normalized_name FROM nodes WHERE dataset=? AND node_id=?', (dataset, node_id)).fetchone()
            if row:
                con.execute('DELETE FROM nodes_fts WHERE rowid=? AND dataset=?', (row['rowid'], dataset))
                con.execute('DELETE FROM aliases WHERE dataset=? AND kind=? AND (normalized_name=? OR target_name=?)', (dataset, row['kind'], row['normalized_name'], row['normalized_name']))
            con.execute('DELETE FROM nodes WHERE dataset=? AND node_id=?', (dataset, node_id))
            con.execute('DELETE FROM edges WHERE dataset=? AND (from_node_id=? OR to_node_id=?)', (dataset, node_id, node_id))
    for h in hashes:
        if con.execute('SELECT 1 FROM chunks WHERE dataset=? AND chunk_hash=? AND source_path<>?', (dataset, h, source)).fetchone():
            continue
        for table in ('edges', 'unresolved_links'):
            con.execute('DELETE FROM ' + table + ' WHERE dataset=? AND chunk_hash=?', (dataset, h))
    for table in ('chunks', 'sources'):
        con.execute('DELETE FROM ' + table + ' WHERE dataset=? AND source_path=?', (dataset, source))
    # Refresh indexed evidence when one of several supporting sources was removed.
    for node_id in affected:
        node = con.execute('SELECT rowid,* FROM nodes WHERE dataset=? AND node_id=?', (dataset, node_id)).fetchone()
        if node:
            con.execute('UPDATE nodes_fts SET name=?,text=?,quote=? WHERE rowid=? AND dataset=?', (node['name'], node['text'], node['quote'], node['rowid'], dataset))


def forget(v):
    root, recipe = set_recipe(v['set'], 'databased')
    path = db_path(v['store'], False)
    dataset = recipe['dataset']
    mode = next(k for k in ('memory_only', 'dataset', 'data_id') if k in v)
    result = dict(dataset=dataset, mode=mode, confirmed=bool(v.get('confirm')), keeps_corpus=True, action='drop one source and its databased evidence' if mode == 'data_id' else 'drop databased rows for this dataset')
    if mode == 'data_id':
        result['data_id'] = v['data_id']
    if not v.get('confirm'):
        return result
    state = ledger(root)
    with graph_connection(path) as con:
        if mode == 'data_id':
            sources = [r[0] for r in con.execute('SELECT DISTINCT source_path FROM sources WHERE dataset=? AND (source_path=? OR source_hash=?)', (dataset, v['data_id'], v['data_id']))]
            if len(sources) != 1:
                fail('--data-id must identify exactly one ingested source path or hash.')
            drop_source(con, dataset, sources[0])
            state['sources'] = {k: r for k, r in state['sources'].items() if r['source_path'] != sources[0]}
        else:
            for table in ('nodes_fts', 'nodes', 'provenance', 'edges', 'unresolved_links', 'chunks', 'sources', 'aliases'):
                con.execute('DELETE FROM ' + table + ' WHERE dataset=?', (dataset,))
            if mode == 'dataset':
                con.execute('DELETE FROM datasets WHERE dataset=?', (dataset,))
            state['sources'] = {}
    write_json(child(root, 'extraction/ledger.json'), state)
    return result


def main(argv=None):
    global sqlite3
    argv = list(sys.argv[1:] if argv is None else argv)
    if not argv or argv[0] == 'help' or '--help' in argv or '-h' in argv:
        print(USAGE)
        return
    command, values = parse(argv)
    # Route recipe stubs before checking the databased runtime or opening a store.
    if 'set' in values and command != 'wiki-lint':
        set_recipe(values['set'])
    if command not in ('check', 'wiki-lint') and sys.version_info < MIN_PYTHON:
        fail('this script needs Python 3.11 or newer; this interpreter is %s. Run with python3.11 or newer.' % '.'.join(map(str, sys.version_info[:3])))
    if command not in ('check', 'wiki-lint', 'chunk'):
        import sqlite3
        if not check({})['fts5']:
            fail('databased work needs SQLite FTS5. Check with knowledge_memory.py check using a Python build with FTS5.')
    commands = {'check': check, 'bootstrap': bootstrap, 'chunk': chunk_set, 'ingest': ingest, 'recall': recall, 'wiki-lint': wiki_lint, 'review-pass': review_pass, 'promote': promote, 'mark-stale': mark_stale, 'healthcheck': healthcheck, 'forget': forget}
    result = commands[command](values)
    print(json.dumps(result, ensure_ascii=False, allow_nan=False))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('%s: %s' % (type(error).__name__, error), file=sys.stderr)
        sys.exit(1)
