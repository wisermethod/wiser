"""Local graph implementation. Dependencies load only after tool-venv re-exec.

Contract: standards/script-contract.md Dependencies, Runtimes, Output and errors,
Where files are written, Caller-named paths. Model location: AGENTS.md Writes
and tools/AGENTS.md. No model download or chat completion path exists here.
"""
import datetime
import importlib
import importlib.abc
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


def ingest(path, recipe, extraction, accepted, validation, relations):
    # Source/quote validation has already completed, before any writable open.
    assert_imports()
    skipped = {kind: dict(count=sum(len(e[array]) for e in extraction['entries']),
                         reason='unsupported graph node table')
               for array, kind in (('facts', 'fact'), ('decisions', 'decision'), ('open_questions', 'open_question'))}
    path.parent.mkdir(parents=True, exist_ok=True)
    db = open_database(path, False)
    conn = ENGINE.Connection(db)
    inserted = merged = linked = unresolved = 0
    try:
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
                status='Candidate', canonical_created=0)


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


def recall(values, recipe, screen, positive):
    query = values['query']
    match = bool(re.match(r'^\s*MATCH\b', query, re.I))
    top_k = positive(values.get('top_k', '15'), '--top-k')
    if match or recipe['retrieval'] != 'embedding':
        validate_query(query)
    runtime = None if match else embedding_runtime(recipe)
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
                items.append(item)
            items = items[:top_k]
        else:
            nodes = []
            for table in ('Idea', 'Entity'):
                nodes.extend(row[0] for row in read_query(conn, 'MATCH (n:' + table + ') RETURN n ORDER BY n.name'))
            items = embed_items(runtime, nodes, query, top_k)
    finally:
        conn.close()
        db.close()
    return dict(backend='graph', dataset=recipe['dataset'], query=query, items=items,
                retrieval='cypher' if match else 'embedding', as_of=values.get('as_of'),
                canon_confirmed=recipe.get('canon_confirmed', ''))
