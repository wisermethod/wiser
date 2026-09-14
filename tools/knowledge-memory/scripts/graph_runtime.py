"""Local graph implementation. Dependencies load only after tool-venv re-exec.

Contract: standards/script-contract.md Dependencies, Runtimes, Output and errors,
Where files are written, Caller-named paths. Model location: AGENTS.md Writes
and tools/AGENTS.md. No model download or chat completion path exists here.
"""
import bisect
import datetime
import importlib
import importlib.abc
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import warnings

TOOL_DIR = Path(__file__).resolve().parent.parent
CACHE = TOOL_DIR / '.venv'
PINS = ('ladybug==0.20.4', 'onnxruntime==1.30.0', 'tokenizers==0.23.2')
WRITE_WORDS = (
    'CREATE', 'MERGE', 'DELETE', 'SET', 'COPY', 'DROP', 'ALTER', 'INSTALL',
    'LOAD', 'CALL', 'ATTACH', 'DETACH', 'REMOVE', 'FOREACH', 'BEGIN', 'COMMIT',
    'ROLLBACK', 'IMPORT', 'EXPORT', 'UNION',
)
SEMANTIC = ('APPLIES_TO', 'CONTRADICTS', 'DECIDED_IN', 'DEPENDS_ON',
            'EXEMPLIFIES', 'SPECIALIZES')
# Passage cut: the embedding window is CAP, two slots are [CLS] and [SEP].
CAP = 256
SPECIALS = 2
UNIT = CAP - SPECIALS
OVERLAP = 4
GUARD = None
ENGINE = None


def fail(message):
    raise RuntimeError(message)


class RefuseImports(importlib.abc.MetaPathFinder):
    attempts = 0

    def find_spec(self, fullname, path=None, target=None):
        if fullname.split('.')[0].lower() == 'cognee':
            self.attempts += 1
            fail('refused-import: cognee; remove the refused import.')
        return None


def assert_imports():
    if (GUARD and GUARD.attempts) or any(n.split('.')[0].lower() == 'cognee' for n in sys.modules):
        fail('refused-import: cognee; remove the refused import.')


def install_import_guard():
    global GUARD
    assert_imports()
    if GUARD is None:
        GUARD = RefuseImports()
        sys.meta_path.insert(0, GUARD)


def package_presence():
    roots = list(CACHE.glob('lib/python*/site-packages')) + [CACHE / 'Lib/site-packages']
    return {p.split('==')[0]: any((r / p.split('==')[0] / '__init__.py').is_file() for r in roots) for p in PINS}


def cache_python():
    return CACHE / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python3')


def plugin_root():
    for parent in TOOL_DIR.parents:
        if (parent / 'tools/AGENTS.md').is_file():
            return parent.resolve()
    return None


def install_packages(explicit):
    root = plugin_root()
    marker = root / '.wiser-consent' if root else None
    granted = False
    if marker:
        try:
            data = json.loads(marker.read_text(encoding='utf-8'))
            granted = isinstance(data, dict) and data.get('realpath') == str(root)
        except (OSError, ValueError):
            pass
    explicit = explicit or os.environ.get('WISER_ALLOW_INSTALL') == '1'
    if not (explicit or granted):
        fail('missing-engine: ladybug; graph packages need install consent. '
             'Fetch ' + ', '.join(PINS) + ' from pypi.org and files.pythonhosted.org '
             'into ' + str(CACHE) + '; estimated several hundred megabytes including dependencies. '
             'pip cache is off. No weights are downloaded. Re-run with --install or '
             'WISER_ALLOW_INSTALL=1. See tools/AGENTS.md for the write inventory.')
    if explicit and marker:
        marker.write_text(json.dumps(dict(realpath=str(root), date=datetime.date.today().isoformat(), tool='knowledge-memory')) + '\n', encoding='utf-8')
        marker.chmod(0o600)
    env = dict(os.environ, PIP_NO_CACHE_DIR='1', PIP_DISABLE_PIP_VERSION_CHECK='1',
               PIP_CACHE_DIR=str(CACHE / 'pip-cache'), XDG_CACHE_HOME=str(CACHE / 'cache'),
               PYTHONNOUSERSITE='1', PYTHONDONTWRITEBYTECODE='1')
    def run(args):
        result = subprocess.run(args, env=env, stdout=sys.stderr, stderr=sys.stderr)
        if result.returncode:
            fail('missing-engine: ladybug; graph package installation failed. Check the interpreter and retry --install.')
    if not cache_python().is_file():
        run([sys.executable, '-m', 'venv', str(CACHE)])
    pip = [str(cache_python()), '-m', 'pip', 'install', '--no-cache-dir', '--disable-pip-version-check']
    run(pip + list(PINS[:2]))
    run(pip + ['--no-deps', PINS[2]])


def ensure_runtime(explicit=False):
    global ENGINE
    install_import_guard()
    if ENGINE is not None:
        assert_imports()
        return
    # One package's own marker, never the .venv directory itself.
    packages = package_presence()
    if not packages['ladybug'] or (explicit and not all(packages.values())):
        install_packages(explicit)
    # sys.executable resolves a symlink to the base interpreter; prefix identifies
    # the environment, as in Transcribe Audio's cache interpreter check.
    if Path(sys.prefix).resolve() != CACHE.resolve():
        if not cache_python().is_file():
            fail('missing-engine: ladybug; the tool venv interpreter is absent. Re-run with --install.')
        env = dict(os.environ, PYTHONNOUSERSITE='1', PYTHONDONTWRITEBYTECODE='1')
        target = str(cache_python())
        os.execve(target, [target, '-B', str(TOOL_DIR / 'scripts/knowledge_memory.py'), *sys.argv[1:]], env)
    try:
        ENGINE = importlib.import_module('ladybug')
    except Exception:
        assert_imports()
        fail('missing-engine: ladybug; import failed in the tool venv. Repair with --install.')
    assert_imports()


def model_files(recipe):
    # AGENTS.md Writes and tools/AGENTS.md own this person-scoped location.
    home = Path.home()
    if sys.platform == 'darwin':
        config = home / 'Library/Application Support/wiser'
    elif sys.platform == 'win32':
        config = Path(os.environ.get('APPDATA', str(home / 'AppData/Roaming'))) / 'wiser'
    else:
        config = Path(os.environ.get('XDG_CONFIG_HOME', str(home / '.config'))) / 'wiser'
    folder = (config / 'models').resolve()
    weights = (folder / recipe.get('embedding_file', 'all-MiniLM-L6-v2.onnx')).resolve()
    tokenizer = (folder / 'tokenizer.json').resolve()
    if any(p.parent != folder or not p.is_file() for p in (weights, tokenizer)):
        fail('missing-weights: local ONNX and tokenizer.json must exist inside the person-scoped models/ folder; no download is performed.')
    return weights, tokenizer


def store_path(value, writing, screen):
    path = screen('--store', value, destination=True, must_exist=not writing)
    if path.name != 'graph.lbdb':
        fail('--store for graph must name a graph.lbdb file.')
    if path.exists() and path.stat().st_nlink > 1:
        fail('graph store has multiple hard links; use a dataset-owned file.')
    for suffix in ('.wal', '.lock', '.tmp', '.shadow'):
        sidecar = Path(str(path) + suffix)
        screen('graph sidecar', str(sidecar), destination=True)
        if sidecar.is_symlink() or (sidecar.exists() and sidecar.stat().st_nlink > 1):
            fail('graph sidecar is linked; use a dataset-owned file.')
    return path


def open_database(path, read_only):
    assert_imports()
    return ENGINE.Database(str(path), read_only=read_only,
                           buffer_pool_size=64 * 1024 * 1024, max_num_threads=1)


def execute(conn, query, params=None):
    result = conn.execute(query, params or {})
    try:
        return result.get_all()
    finally:
        result.close()


def validate_query(query):
    if not isinstance(query, str) or not re.match(r'^\s*MATCH\b', query, re.I):
        fail('read-only-query: MATCH required; graph recall needs a MATCH query or retrieval: embedding.')
    if any(x in query for x in (';', '//', '/*', '*/', '\x00')):
        fail('read-only-query: comments or statement separator refused.')
    if re.search(r'\b(?:' + '|'.join(WRITE_WORDS) + r')\b', query, re.I):
        fail('read-only-query: write or unsupported clause.')


def read_query(conn, query, parameters=None):
    validate_query(query)
    with warnings.catch_warnings():
        warnings.filterwarnings('ignore', category=DeprecationWarning,
                                message='The use of separate prepare.*')
        prepared = conn.prepare(query, parameters or {})
    try:
        if not prepared.is_success():
            fail('malformed-query: prepare rejected query; correct the MATCH query.')
        return execute(conn, prepared, parameters)
    finally:
        prepared.close()


def cutting_tokenizer(recipe):
    """Load tokenizer.json with inherited truncation and padding disabled.

    tokenizer.json ships truncation 128 and padding 128. Left in place, every
    text is measured at 128 tokens and the cut is wrong by an order of magnitude.
    """
    _weights, tokenizer_path = model_files(recipe)
    try:
        tokenizers = importlib.import_module('tokenizers')
    except Exception:
        assert_imports()
        fail('missing-engine: embed runtime; repair onnxruntime and tokenizers with --install.')
    tok = tokenizers.Tokenizer.from_file(str(tokenizer_path))
    tok.no_truncation()
    tok.no_padding()
    return tok


def chunk_of(chunks, offset):
    """The index of the chunk whose declared span contains this character offset."""
    lo, hi = 0, len(chunks) - 1
    while lo < hi:
        mid = (lo + hi) // 2
        if offset >= chunks[mid]['char_end']:
            lo = mid + 1
        else:
            hi = mid
    return chunks[lo]['index']


def quote_raw_span(chunk_text, quote):
    """Raw [start, end) of quote in chunk_text under whitespace normalisation.

    knowledge_memory.node_problem proves the quote is in the chunk under
    ' '.join(x.split()). This recovers the raw offsets the cut uses.
    """
    mapping = []
    chars = []
    i = 0
    n = len(chunk_text)
    started = False
    while i < n:
        while i < n and chunk_text[i].isspace():
            i += 1
        if i >= n:
            break
        if started:
            mapping.append(i - 1)
            chars.append(' ')
        while i < n and not chunk_text[i].isspace():
            mapping.append(i)
            chars.append(chunk_text[i])
            i += 1
        started = True
    body = ''.join(chars)
    needle = ' '.join(quote.split())
    at = body.find(needle)
    if at < 0:
        return None
    last = at + len(needle) - 1
    return mapping[at], mapping[last] + 1


def covering(passages, ends, char_start, char_end):
    """Every passage window that meets the span [char_start, char_end).

    Bisect on `ends`, not on `starts`. The first passage that can possibly
    intersect is the first one whose end is past char_start. Searching
    forward from the last passage that *begins* at or before char_start is
    wrong here, because the windows overlap: when a quote starts inside an
    overlap, the preceding passage still ends after the quote begins and was
    being skipped. The 2026-09-13 adversarial review found it, 368 edges
    written where 373 windows intersect, and named all five.
    """
    i = bisect.bisect_right(ends, char_start)
    hit = []
    while i < len(passages) and passages[i]['start'] < char_end:
        if passages[i]['end'] > char_start:
            hit.append(passages[i])
        i += 1
    return hit


def covering_brute(passages, char_start, char_end):
    """The same answer with no search at all, as an independent control.

    A bisect that is subtly wrong returns a believable number, which is how
    the five missing edges survived the first run. Every lookup is checked
    against this, and a disagreement fails the ingest rather than being
    reported.
    """
    return [p for p in passages if p['start'] < char_end and p['end'] > char_start]


def cut_passages(tok, corpus, chunks, source_path, first_name):
    """Windows of UNIT tokens at stride UNIT - OVERLAP, at token boundaries."""
    enc = tok.encode(corpus, add_special_tokens=False)
    spans = [o for o in enc.offsets if o != (0, 0)]
    total = len(spans)
    stride = UNIT - OVERLAP
    if stride < 1:
        fail('passage cut: overlap must be smaller than the unit')
    if not total:
        return []
    origin = chunks[0]['char_start'] if chunks else 0
    passages = []
    i = 0
    n = first_name
    while True:
        window = spans[i:i + UNIT]
        start = window[0][0]
        end = window[-1][1]
        text = corpus[start:end]
        char_start = origin + start
        char_end = origin + end
        passages.append(dict(
            passage_id='passage-%04d' % n,
            text=text,
            start=char_start,
            end=char_end,
            source_path=source_path,
            chunk_first=chunk_of(chunks, char_start),
            chunk_last=chunk_of(chunks, char_end - 1),
        ))
        n += 1
        if i + UNIT >= total:
            break
        i += stride
    return passages


def next_passage_index(conn):
    rows = execute(conn, 'MATCH (p:Passage) RETURN p.name')
    highest = 0
    for row in rows:
        name = row[0]
        if isinstance(name, str) and name.startswith('passage-'):
            suffix = name[8:]
            if suffix.isdigit():
                highest = max(highest, int(suffix))
    return highest + 1


def node_count(conn):
    """How many Idea and Entity nodes this store already holds."""
    total = 0
    for table in ('Idea', 'Entity'):
        try:
            rows = execute(conn, 'MATCH (n:%s) RETURN count(n)' % table)
        except Exception as error:
            text = str(error).lower()
            if 'does not exist' in text or 'not found' in text or 'binder' in text:
                continue
            raise
        if rows:
            total += rows[0][0]
    return total


def has_passages(conn):
    """Whether this store holds passages to search.

    False on a store ingested before passages existed, whose Passage table the
    binder cannot resolve, and False on a table that exists and is empty, so an
    empty table returns the nodes rather than nothing at all.
    """
    try:
        rows = execute(conn, 'MATCH (p:Passage) RETURN count(p)')
    except Exception as error:
        text = str(error).lower()
        if 'does not exist' in text or 'not found' in text or 'binder' in text:
            return False
        raise
    return bool(rows) and bool(rows[0][0])


def load_rank_passages():
    name = '_knowledge_rank_passages'
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(
        name, Path(__file__).resolve().parent / 'rank_passages.py')
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def ingest(path, recipe, extraction, accepted, validation, relations, manifest):
    # Source/quote validation has already completed, before any writable open.
    assert_imports()
    skipped = {kind: dict(count=sum(len(e[array]) for e in extraction['entries']),
                         reason='unsupported graph node table')
               for array, kind in (('facts', 'fact'), ('decisions', 'decision'), ('open_questions', 'open_question'))}
    embed = recipe.get('retrieval') == 'embedding'
    tok = cutting_tokenizer(recipe) if embed else None
    path.parent.mkdir(parents=True, exist_ok=True)
    db = open_database(path, False)
    conn = ENGINE.Connection(db)
    inserted = merged = linked = unresolved = 0
    passages_inserted = located_in_edges = unlocatable = passages_skipped = 0
    try:
        # Before the transaction, because probing for a table that does not exist raises,
        # and a raise inside a transaction leaves nothing for the rollback to roll back.
        #
        # A store whose existing knowledge predates the passage layer cannot be half
        # migrated. Recall searches passages the moment any exist, so an older source with
        # none would silently drop out of every answer: the Behavioral Core's bridge,
        # degrading a component to cover missing infrastructure. Refuse and name the repair.
        if embed and not has_passages(conn) and node_count(conn):
            fail('passage-layer-mismatch: this store holds knowledge ingested before the '
                 'passage layer, and adding passages now would leave that knowledge '
                 'unreachable by embedding recall. Rebuild the set by re-ingesting its '
                 'sources into a new store, or keep this one on retrieval: lexical.')
        if not embed and has_passages(conn):
            # The other direction of the same invariant. A lexical ingest into a passage
            # store writes nodes with no passage and no LOCATED_IN edge, and embedding
            # recall reaches an idea only through that edge, so the new source would be
            # unreachable the moment the recipe went back to embedding. A store is either
            # a passage store or it is not.
            fail('passage-layer-mismatch: this store holds passages, and a retrieval: '
                 'lexical ingest would add knowledge that embedding recall cannot reach. '
                 'Ingest this source on retrieval: embedding, or give it its own store.')
        execute(conn, 'BEGIN TRANSACTION')
        try:
            for table, text_field in (('Idea', 'definition'), ('Entity', 'summary')):
                execute(conn, 'CREATE NODE TABLE IF NOT EXISTS ' + table + '(name STRING, ' + text_field + ' STRING, aliases STRING[], quote STRING, source_path STRING, status STRING, PRIMARY KEY(name))')
            for relation in sorted(relations):
                execute(conn, 'CREATE REL TABLE IF NOT EXISTS ' + relation + '(FROM Idea TO Idea, FROM Idea TO Entity, quote STRING, source_path STRING, status STRING)')
            for kind, node, chunk in accepted:
                if kind not in ('idea', 'entity'):
                    continue
                table, field = ('Idea', 'definition') if kind == 'idea' else ('Entity', 'summary')
                exists = execute(conn, 'MATCH (n:' + table + ') WHERE n.name=$name RETURN n.name', {'name': node['name']})
                if exists:
                    merged += 1
                    continue
                params = dict(name=node['name'], text=node.get(field, ''), aliases=node.get('aliases', []), quote=node['quote'], source_path=extraction['source_path'], status='Candidate')
                execute(conn, 'CREATE (n:' + table + ' {name:$name, ' + field + ':$text, aliases:$aliases, quote:$quote, source_path:$source_path, status:$status})', params)
                inserted += 1
            for kind, node, chunk in accepted:
                if kind != 'idea_link':
                    continue
                params = dict(source=node['source_name'], target=node['target_name'], quote=node['quote'], source_path=extraction['source_path'], status='Candidate')
                targets = []
                for table in ('Idea', 'Entity'):
                    rows = execute(conn, 'MATCH (a:Idea), (b:' + table + ') WHERE a.name=$source AND b.name=$target RETURN b.name', {k: params[k] for k in ('source', 'target')})
                    if rows:
                        targets.append(table)
                if len(targets) != 1:
                    unresolved += 1
                    continue
                relation = node['relation']
                table = targets[0]
                exists = execute(conn, 'MATCH (a:Idea)-[r:' + relation + ']->(b:' + table + ') WHERE a.name=$source AND b.name=$target AND r.quote=$quote AND r.source_path=$source_path RETURN r.quote', {k: params[k] for k in ('source', 'target', 'quote', 'source_path')})
                if not exists:
                    execute(conn, 'MATCH (a:Idea), (b:' + table + ') WHERE a.name=$source AND b.name=$target CREATE (a)-[:' + relation + ' {quote:$quote, source_path:$source_path, status:$status}]->(b)', params)
                    linked += 1
            if embed:
                execute(conn, 'CREATE NODE TABLE IF NOT EXISTS Passage('
                              'name STRING, text STRING, source_path STRING, '
                              'char_start INT64, char_end INT64, '
                              'chunk_first INT64, chunk_last INT64, status STRING, '
                              'PRIMARY KEY(name))')
                execute(conn, 'CREATE REL TABLE IF NOT EXISTS LOCATED_IN('
                              'FROM Idea TO Passage, FROM Entity TO Passage, '
                              'char_start INT64, char_end INT64, status STRING)')
                chunks = list(manifest['chunks'])
                corpus = ''.join(c['text'] for c in chunks)
                passages = cut_passages(tok, corpus, chunks, extraction['source_path'],
                                        next_passage_index(conn))
                # Re-ingest skips a passage this store already holds, the way it skips an
                # existing node name and an identical edge. Without this a retried ingest
                # writes the whole cut a second time under fresh names, so the same text
                # competes with itself for top-k slots and moves the lexical statistics.
                # A held passage keeps the name it was stored under, and the edging below
                # uses that name, because a cut made now numbers from the end of the store
                # and those numbers name nothing that exists.
                held = {(r[0], r[1], r[2]): (r[3], r[4]) for r in execute(
                    conn, 'MATCH (n:Passage) '
                          'RETURN n.source_path, n.char_start, n.char_end, n.name, n.text')}
                # A changed source is refused, not half replaced. Identity by span alone
                # would skip the new text and attach this run's nodes to the old, and
                # graph ships no removal command that could retire what it replaced, so
                # the honest stop is here rather than a store mixing two versions of one
                # source behind a successful report.
                this_source = {k: v for k, v in held.items()
                               if k[0] == extraction['source_path']}
                if this_source:
                    now = {(p['source_path'], p['start'], p['end']): p['text']
                           for p in passages}
                    stale = [name for k, (name, text) in this_source.items()
                             if k not in now or now[k] != text]
                    if stale:
                        fail('passage-source-changed: this store holds %d passage(s) of %s '
                             'that the source on disk no longer matches, starting at %s. '
                             'Graph has no command to retire them, so re-ingest of a '
                             'changed source is refused; rebuild the set into a new store.'
                             % (len(stale), extraction['source_path'], sorted(stale)[0]))
                for p in passages:
                    stored = held.get((p['source_path'], p['start'], p['end']))
                    if stored is not None:
                        p['passage_id'] = stored[0]
                        passages_skipped += 1
                        continue
                    execute(conn,
                            'CREATE (n:Passage {name:$name, text:$text, source_path:$source_path, '
                            'char_start:$cs, char_end:$ce, chunk_first:$cf, chunk_last:$cl, '
                            'status:$status})',
                            dict(name=p['passage_id'], text=p['text'], source_path=p['source_path'],
                                 cs=p['start'], ce=p['end'],
                                 cf=int(p['chunk_first']), cl=int(p['chunk_last']),
                                 status='Candidate'))
                    passages_inserted += 1
                # Against every passage of this source, not only the ones written now,
                # so a retried ingest still edges a node to a passage it already holds.
                ends = [p['end'] for p in passages]
                for kind, node, chunk in accepted:
                    if kind not in ('idea', 'entity'):
                        continue
                    table = 'Idea' if kind == 'idea' else 'Entity'
                    span = quote_raw_span(chunk['text'], node['quote'])
                    if span is None:
                        unlocatable += 1
                        continue
                    char_start = chunk['char_start'] + span[0]
                    char_end = chunk['char_start'] + span[1]
                    hit = covering(passages, ends, char_start, char_end)
                    control = covering_brute(passages, char_start, char_end)
                    if [p['passage_id'] for p in hit] != [p['passage_id'] for p in control]:
                        fail('edge lookup disagrees with the independent control for %r at %d: '
                             '%s against %s' % (node['name'], char_start,
                                                [p['passage_id'] for p in hit],
                                                [p['passage_id'] for p in control]))
                    if not hit:
                        unlocatable += 1
                        continue
                    exists = execute(conn,
                                     'MATCH (n:' + table + ') WHERE n.name=$name RETURN n.name',
                                     {'name': node['name']})
                    if not exists:
                        continue
                    for p in hit:
                        # An identical edge is skipped, as an identical semantic edge is,
                        # so a retried ingest neither duplicates the hop nor reports an
                        # edge it did not write.
                        already = execute(
                            conn,
                            'MATCH (a:' + table + ')-[r:LOCATED_IN]->(b:Passage) '
                            'WHERE a.name=$name AND b.name=$pid AND r.char_start=$cs '
                            'AND r.char_end=$ce RETURN r.char_start',
                            dict(name=node['name'], pid=p['passage_id'],
                                 cs=char_start, ce=char_end))
                        if already:
                            continue
                        written = execute(
                            conn,
                            'MATCH (a:' + table + '), (b:Passage) '
                            'WHERE a.name=$name AND b.name=$pid '
                            'CREATE (a)-[:LOCATED_IN {char_start:$cs, char_end:$ce, '
                            'status:$status}]->(b) RETURN b.name',
                            dict(name=node['name'], pid=p['passage_id'],
                                 cs=char_start, ce=char_end,
                                 status='Candidate'))
                        if not written:
                            fail('located_in: no passage named %r to edge %r to; the cut and '
                                 'the store disagree.' % (p['passage_id'], node['name']))
                        located_in_edges += 1
            execute(conn, 'COMMIT')
        except BaseException:
            execute(conn, 'ROLLBACK')
            raise
    finally:
        conn.close()
        db.close()
    return dict(backend='graph', dataset=recipe['dataset'], store=str(path),
                nodes_inserted=inserted, nodes_skipped_by_name=merged, edges_inserted=linked,
                unresolved_links=unresolved, skipped=skipped,
                nodes_rejected=validation['rejected'], rejected_detail=validation['rejected_detail'],
                status='Candidate', canonical_created=0,
                passages_inserted=passages_inserted, passages_skipped=passages_skipped,
                located_in_edges=located_in_edges,
                passage_spans_unlocatable=unlocatable)


def embedding_runtime(recipe):
    weights, tokenizer_path = model_files(recipe)
    try:
        np = importlib.import_module('numpy')
        # The runtime initializes telemetry during import, before its public
        # disable call. Disable it first to prevent device/session files and I/O.
        os.environ['ORT_DISABLE_TELEMETRY'] = '1'
        ort = importlib.import_module('onnxruntime')
        ort.disable_telemetry_events()
        tokenizers = importlib.import_module('tokenizers')
    except Exception:
        assert_imports()
        fail('missing-engine: embed runtime; repair onnxruntime and tokenizers with --install.')
    assert_imports()
    tokenizer = tokenizers.Tokenizer.from_file(str(tokenizer_path))
    tokenizer.enable_truncation(max_length=256)
    tokenizer.enable_padding(pad_id=tokenizer.token_to_id('[PAD]'), pad_token='[PAD]')
    options = ort.SessionOptions()
    options.intra_op_num_threads = options.inter_op_num_threads = 1
    session = ort.InferenceSession(str(weights), sess_options=options, providers=['CPUExecutionProvider'])
    return np, tokenizer, session


def embed_items(runtime, items, query, top_k):
    if not items:
        return []
    np, tokenizer, session = runtime
    texts = ['\n'.join([n['name'], n.get('definition', n.get('summary', '')) or '', n['quote'], *(n.get('aliases') or [])]) for n in items]
    # Bounded batches keep a large store from requiring one tensor for all nodes.
    vectors = []
    for offset in range(0, len(texts) + 1, 32):
        encoded = tokenizer.encode_batch((texts + [query])[offset:offset + 32])
        inputs = {'input_ids': np.array([e.ids for e in encoded], dtype=np.int64),
                  'attention_mask': np.array([e.attention_mask for e in encoded], dtype=np.int64),
                  'token_type_ids': np.array([e.type_ids for e in encoded], dtype=np.int64)}
        values = session.run(None, {i.name: inputs[i.name] for i in session.get_inputs()})[0]
        if values.ndim == 3:
            mask = inputs['attention_mask'][..., None]
            values = (values * mask).sum(axis=1) / np.maximum(mask.sum(axis=1), 1)
        if values.ndim != 2 or not np.isfinite(values).all():
            fail('invalid-embedding: nonfinite values or unexpected shape.')
        norms = np.linalg.norm(values, axis=1, keepdims=True)
        if not (norms > 0).all():
            fail('invalid-embedding: zero vector.')
        vectors.extend(values / norms)
    scores = np.array(vectors[:-1]) @ vectors[-1]
    order = sorted(range(len(items)), key=lambda i: (-float(scores[i]), i))[:top_k]
    return [dict(name=items[i]['name'], quote=items[i]['quote'], source_path=items[i]['source_path'], score=float(scores[i]), rank=rank) for rank, i in enumerate(order, 1)]


def embed_texts(runtime, texts):
    """Embed raw texts. Pooling, L2, batching of 32 and finite/zero checks match embed_items."""
    if not texts:
        np = runtime[0]
        return np.zeros((0, 0))
    np, tokenizer, session = runtime
    vectors = []
    for offset in range(0, len(texts), 32):
        encoded = tokenizer.encode_batch(texts[offset:offset + 32])
        inputs = {'input_ids': np.array([e.ids for e in encoded], dtype=np.int64),
                  'attention_mask': np.array([e.attention_mask for e in encoded], dtype=np.int64),
                  'token_type_ids': np.array([e.type_ids for e in encoded], dtype=np.int64)}
        values = session.run(None, {i.name: inputs[i.name] for i in session.get_inputs()})[0]
        if values.ndim == 3:
            mask = inputs['attention_mask'][..., None]
            values = (values * mask).sum(axis=1) / np.maximum(mask.sum(axis=1), 1)
        if values.ndim != 2 or not np.isfinite(values).all():
            fail('invalid-embedding: nonfinite values or unexpected shape.')
        norms = np.linalg.norm(values, axis=1, keepdims=True)
        if not (norms > 0).all():
            fail('invalid-embedding: zero vector.')
        vectors.extend(values / norms)
    return np.array(vectors)


def attach(conn, ordered):
    """The three parts for an ordered list of passages, in the order given.

    Shared by the ranked path and the selection path so the two cannot drift, and
    so a selection gets the ideas of the passages it actually asked for: dedupe is
    scoped to `ordered`, not to the full top-k. An idea located in two passages is
    emitted under the first of them that appears here, which on the ranked path is
    the better-ranked one and on the selection path is the better-chosen one.

    Each entry is a dict with name, text, source_path, rank, and optionally score
    and candidate_rank.

    **An attachment keeps the table it came from and is deduplicated by both.** An
    Entity and an Idea may carry the same name, since the primary key is per table,
    and matching a one-hop traversal on the name alone attributes one's relations to
    the other. The traversal also has to follow the endpoint's real type: a relation
    runs from an Idea to an Idea or an Entity, so an Entity is only ever a target, and
    a pattern that requires the attached node to be an Idea in both directions finds
    nothing at all for an attached Entity.
    """
    items = []
    seen_idea = set()
    seen_related = set()
    for entry in ordered:
        name, text, source_path = entry['name'], entry['text'], entry['source_path']
        # Key insertion order is fixed: a default-path result must be byte-identical
        # whether or not the selection path is compiled in.
        item = dict(name=name, quote=text, source_path=source_path)
        if entry.get('score') is not None:
            item['score'] = entry['score']
        item['rank'] = entry['rank']
        item['part'] = 'passage'
        if entry.get('candidate_rank') is not None:
            # The position this passage held in the list the caller chose from,
            # whatever ranking produced that list. Named for what it carries: under a
            # non-default ranking it is not a cosine rank, and a field named for one
            # would be false on every call the shipped skill makes.
            item['candidate_rank'] = entry['candidate_rank']
        for key in ('vector_rank', 'lexical_rank'):
            # Carried through a selection when the caller kept them, so the component
            # ranks that produced the order are not lost at the second call.
            if entry.get(key) is not None:
                item[key] = entry[key]
        # Present only when a non-default ranking produced this list, so a default-path
        # result is unchanged. They say which ranker found each passage, which is what
        # makes a non-default ranking auditable rather than asserted.
        for key, value in (entry.get('rank_detail') or {}).items():
            item[key] = value
        items.append(item)

        attached = []
        for table in ('Idea', 'Entity'):
            for row in execute(
                    conn,
                    'MATCH (n:' + table + ')-[:LOCATED_IN]->(p:Passage) WHERE p.name=$pid '
                    'RETURN n.name, n.quote, n.source_path ORDER BY n.name',
                    {'pid': name}):
                attached.append((table, *row))
        for itable, iname, iquote, ipath in attached:
            if (itable, iname) in seen_idea:
                continue
            seen_idea.add((itable, iname))
            items.append(dict(name=iname, quote=iquote, source_path=ipath,
                              part='idea', via=name))

            for rel in SEMANTIC:
                directions = [
                    # Incoming, and the attached node's own table is what the pattern
                    # binds. Requiring an Idea here loses every relation into an Entity.
                    ('in', 'MATCH (a)-[r:%s]->(b:%s) WHERE b.name=$name '
                           'RETURN a.name, r.quote, r.source_path' % (rel, itable)),
                ]
                if itable == 'Idea':
                    # Outgoing exists only from an Idea: a relation runs from an Idea to
                    # an Idea or an Entity, so an Entity is never a source.
                    directions.insert(0, (
                        'out', 'MATCH (a:Idea)-[r:%s]->(b) WHERE a.name=$name '
                               'RETURN b.name, r.quote, r.source_path' % rel))
                for direction, pattern in directions:
                    for bname, rquote, rpath in execute(conn, pattern, {'name': iname}):
                        key = (itable, iname, rel, direction, bname)
                        if key in seen_related:
                            continue
                        seen_related.add(key)
                        items.append(dict(name=bname, quote=rquote, source_path=rpath,
                                          part='related', relation=rel,
                                          direction=direction, via=iname))
    return items


def three_part(conn, runtime, query, top_k, mode='cosine'):
    """Ranked passages, the ideas located in them, one typed hop out from those.

    `mode` is strictly additive: 'cosine' is the default and reproduces the ranking
    this path returned before any mode existed, byte for byte. Any other mode is
    `rank_passages.rank`, which changes which passages are offered to the caller and
    nothing else: same store, same `--top-k`, same evidence downstream, and a lexical
    index built in this process from the same `Passage.text` column the embedder reads.
    """
    passages = execute(conn, 'MATCH (p:Passage) RETURN p.name, p.text, p.source_path '
                             'ORDER BY p.name')
    if not passages:
        return []
    # A Passage is embedded on its own text and nothing else. Wrapping a name, a
    # definition and aliases around it overflows the window and leaves half of every
    # passage unread, while every coverage measure still reports the whole corpus.
    texts = [t for _, t, _ in passages]
    matrix = embed_texts(runtime, texts)
    scores = [float(x) for x in (matrix @ embed_texts(runtime, [query])[0])]

    if mode == 'cosine':
        order = sorted(range(len(passages)), key=lambda i: (-scores[i], i))[:top_k]
        detail = {}
    else:
        rank_passages = load_rank_passages()
        order, detail = rank_passages.rank(
            mode, query,
            lambda text: [float(x) for x in (matrix @ embed_texts(runtime, [text])[0])],
            rank_passages.Lexical(texts), top_k)

    return attach(conn, [
        dict(name=passages[i][0], text=passages[i][1], source_path=passages[i][2],
             score=scores[i], rank=rank, rank_detail=detail.get(i))
        for rank, i in enumerate(order, 1)])


def select_path(conn, chosen, top_k):
    """The three parts for named passages, in the order a chooser put them.

    It does no embedding: the caller ranked these in the step before, and re-embedding
    every passage to rediscover numbers it already holds would spend a step for
    nothing. Each entry
    carries forward the `score` and `rank` the ranked path gave it, so no number is
    invented here; `rank` becomes the position in the chosen order and the position it
    held in the list the caller chose from is preserved as `candidate_rank`, because a
    reordering that hides what it reordered is not auditable. **It is not named for the
    cosine ranking**: under any other ranking that position is not a cosine rank, and
    the shipped caller uses one. Component ranks the caller kept are carried through.

    `chosen` is a list of {"name", "score", "rank"}, best first.
    """
    by_name = {n: (t, s) for n, t, s in execute(
        conn, 'MATCH (p:Passage) RETURN p.name, p.text, p.source_path')}
    ordered = []
    for rank, ch in enumerate(chosen[:top_k], 1):
        found = by_name.get(ch['name'])
        if found is None:
            fail('select: no passage named %r in this store.' % ch['name'])
        ordered.append(dict(name=ch['name'], text=found[0], source_path=found[1],
                            score=ch.get('score'), rank=rank,
                            candidate_rank=ch.get('rank'),
                            vector_rank=ch.get('vector_rank'),
                            lexical_rank=ch.get('lexical_rank')))
    return attach(conn, ordered)


def recall(values, recipe, screen, positive):
    query = values['query']
    match = bool(re.match(r'^\s*MATCH\b', query, re.I))
    top_k = positive(values.get('top_k', '15'), '--top-k')
    mode = values.get('rank', 'cosine')
    # Whether the flag was supplied, not what it was set to. A call that ranks nothing
    # must refuse `--rank cosine` exactly as it refuses `--rank hybrid`: accepting a flag
    # and printing success is how a mistyped option comes to look like it applied.
    ranked = 'rank' in values
    select_value = values.get('select')
    if match or recipe['retrieval'] != 'embedding':
        validate_query(query)
    if ranked:
        if match:
            fail('rank: a ranking applies to the embedding path, not to MATCH.')
        if select_value is not None:
            fail('rank: a selection already fixes the passages; --rank ranks nothing.')
        rank_passages = load_rank_passages()
        if mode not in rank_passages.MODES:
            fail('rank: unknown mode %r; one of %s' % (mode,
                                                       ', '.join(rank_passages.MODES)))
    chosen = None
    if select_value is not None:
        if match:
            fail('select: a selection applies to the embedding path, not to MATCH.')
        select_path_resolved = screen('--select', select_value, must_exist=True)
        try:
            chosen = json.loads(select_path_resolved.read_text(encoding='utf-8'))
        except json.JSONDecodeError:
            fail('select: expected a JSON list of objects each carrying a name.')
        if not isinstance(chosen, list) or any(
                not isinstance(c, dict) or not isinstance(c.get('name'), str)
                for c in chosen):
            fail('select: expected a JSON list of objects each carrying a name.')
    runtime = None if match or chosen is not None else embedding_runtime(recipe)
    path = store_path(values['store'], False, screen)
    db = open_database(path, True)
    conn = ENGINE.Connection(db)
    try:
        if match:
            rows = read_query(conn, query)
            items = []
            for row in rows:
                if len(row) == 1 and isinstance(row[0], dict):
                    item = {key: row[0].get(key) for key in ('name', 'quote', 'source_path')}
                elif len(row) == 3:
                    item = dict(zip(('name', 'quote', 'source_path'), row))
                else:
                    fail('graph-result: RETURN a node or name, quote, source_path in that order.')
                if any(not isinstance(v, str) or not v.strip() for v in item.values()):
                    fail('graph-result: every item needs name, quote, source_path.')
                item['part'] = 'match'
                items.append(item)
            items = items[:top_k]
        else:
            if chosen is not None:
                items = select_path(conn, chosen, top_k)
            elif has_passages(conn):
                items = three_part(conn, runtime, query, top_k, mode)
            else:
                if ranked:
                    fail('rank: this store holds no passages, so a passage ranking ranks '
                         'nothing here. Re-ingest the set on retrieval: embedding, or drop '
                         '--rank.')
                nodes = []
                for table in ('Idea', 'Entity'):
                    nodes.extend(row[0] for row in read_query(conn, 'MATCH (n:' + table + ') RETURN n ORDER BY n.name'))
                items = embed_items(runtime, nodes, query, top_k)
    finally:
        conn.close()
        db.close()
    counts = {}
    for it in items:
        part = it.get('part')
        if part is not None:
            counts[part] = counts.get(part, 0) + 1
    out = dict(backend='graph', dataset=recipe['dataset'], query=query, items=items,
               parts=counts,
               retrieval='cypher' if match else 'embedding', as_of=values.get('as_of'),
               canon_confirmed=recipe.get('canon_confirmed', ''))
    if chosen is not None:
        out['selected'] = [c['name'] for c in chosen[:top_k]]
    if mode != 'cosine':
        out['ranking'] = mode
    return out
