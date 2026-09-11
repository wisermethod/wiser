"""Offline contract regressions. Python 3.11+; disposable copies stay under tests/."""
import atexit
import ast
import datetime
import importlib.util
import json
from pathlib import Path
import re
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import unittest

TOOL = Path(__file__).resolve().parents[1]
SCRIPT = TOOL / 'scripts/knowledge_memory.py'


def module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    sys.modules[name] = result
    spec.loader.exec_module(result)
    return result


# Exercise an unchanged copy with sibling work paths. This respects the tool's
# refusal to write into itself while keeping every test write under tests/.
sys.dont_write_bytecode = True
TEST_RUN = tempfile.TemporaryDirectory(prefix='run-', dir=TOOL / 'tests')
atexit.register(TEST_RUN.cleanup)
SOURCE_TOOL = TOOL
TOOL = Path(TEST_RUN.name) / 'tool'
for relative in ('scripts/knowledge_memory.py', 'TOOL.md', 'templates/set.yaml',
                 'templates/review_item.md', 'packs/general/graph_model.py',
                 'packs/general/ontology.ttl', 'packs/general/extraction_prompt.md'):
    destination = TOOL / relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(SOURCE_TOOL / relative, destination)
SCRIPT = TOOL / 'scripts/knowledge_memory.py'
km = module(SCRIPT, 'knowledge_memory_tested')
km.sqlite3 = sqlite3


class MemoryContract(unittest.TestCase):
    def setUp(self):
        self.scratch = tempfile.TemporaryDirectory(prefix='fixture-', dir=TEST_RUN.name)
        self.root = Path(self.scratch.name).resolve()
        self.set = self.root / 'book'
        self.set.mkdir()
        (self.set / 'corpus').mkdir()
        recipe = (TOOL / 'templates/set.yaml').read_text()
        recipe = recipe.replace('set: example-set', 'set: book').replace('backend: wiki', 'backend: databased').replace('session_permission: ""', 'session_permission: "Tester, 2026-09-10"')
        (self.set / 'set.yaml').write_text(recipe)
        self.store = self.root / 'graph.sqlite'
        km.bootstrap(dict(store=str(self.store)))
        self.v = dict(set=str(self.set), store=str(self.store))

    def tearDown(self):
        self.scratch.cleanup()

    def cli(self, *args, code=0):
        run = subprocess.run([sys.executable, str(SCRIPT), *args], text=True, capture_output=True)
        self.assertEqual(run.returncode, code, run.stderr)
        if code:
            self.assertEqual(run.stdout, '')
        return run

    def add(self, stem='source', text='# Economy\n\nEconomy is freedom. Simplicity supports economy.\n', entries=None):
        source = self.set / 'corpus' / (stem + '.md')
        source.write_text(text)
        km.chunk_set(dict(set=str(self.set)))
        manifest = json.loads((self.set / 'extraction' / (stem + '.chunks.json')).read_text())
        arrays = {key: [] for key in km.ARRAYS}
        arrays['ideas'] = [dict(name='Economy', definition=text.splitlines()[2], domain='', status='Candidate', quote=text.splitlines()[2])]
        if entries is not None:
            arrays.update(entries)
        chunk = manifest['chunks'][0]
        extraction = dict(schema='extraction/0.1.0', dataset=manifest['dataset'], source_path='corpus/' + source.name, source_hash=manifest['source_hash'], pack='general', pack_version=km.pack_hash(TOOL / 'packs/general'), entries=[dict(chunk_index=0, chunk_hash=chunk['chunk_hash'], extracted_on='2026-07-01', **arrays)])
        path = self.set / 'extraction' / (stem + '.extraction.json')
        path.write_text(json.dumps(extraction))
        return path, extraction, manifest

    def ingest(self, path):
        return km.ingest(dict(self.v, extraction=str(path)))

    def decision(self, name, action, date='2026-09-10', norm='economy', target=''):
        with km.graph_connection(self.store) as con:
            node = dict(con.execute('SELECT * FROM nodes WHERE normalized_name=?', (norm,)).fetchone())
        path = self.set / 'review/decided' / (name + '.md')
        path.parent.mkdir(parents=True, exist_ok=True)
        text = km.render_review_item('exampleroot_example_set', node, 'new_finding', action, 'Test human decision', name, target, dict(reviewer='Tester', decision=action, date=date, note='test'))
        path.write_text(text)
        return path

    def test_cli_help_check_and_refusal(self):
        self.assertIn('Usage:', self.cli('help').stdout)
        result = json.loads(self.cli('check').stdout)
        self.assertTrue(result['fts5'])
        self.assertFalse(result['installed'])
        for flag in ('--install', '--env', '--unknown'):
            self.assertIn(flag, self.cli('check', flag, code=1).stderr)
        self.cli('hosted', code=1)
        self.cli('wiki-lint', '--set', str(self.set), '--store', str(self.store), code=1)
        self.cli('bootstrap', '--store', str(TOOL / 'bad.sqlite'), code=1)
        self.cli('recall', '--set', 'relative', '--store', str(self.store), '--query', 'economy', code=1)

    def test_stub_recipes_stop_before_sources_or_store_writes(self):
        from unittest.mock import patch
        recipe = self.set / 'set.yaml'
        original = recipe.read_text()
        store_before = self.store.read_bytes()
        for backend in ('graph', 'hosted'):
            with self.subTest(backend=backend):
                recipe.write_text(original.replace('backend: databased', 'backend: ' + backend))
                # Any attempt to enumerate corpus fails this direct command test.
                with patch.object(km, 'corpus_sources', side_effect=AssertionError('source read')):
                    with self.assertRaisesRegex(km.ProbeError, backend + '-unspecified'):
                        km.chunk_set(dict(set=str(self.set)))
                for version in ((3, 9, 6), sys.version_info):
                    with patch.object(km.sys, 'version_info', version), patch.object(km, 'check', side_effect=AssertionError('databased runtime checked')):
                        with self.assertRaisesRegex(km.ProbeError, backend + '-unspecified'):
                            km.main(['recall', '--set', str(self.set), '--store', str(self.root / 'missing.sqlite'), '--query', 'anything'])
                result = self.cli('chunk', '--set', str(self.set), code=1)
                self.assertIn('experts/Memory Expert/' + backend + '.md', result.stderr)
                absent_store = self.root / (backend + '-absent.sqlite')
                result = self.cli('recall', '--set', str(self.set), '--store', str(absent_store), '--query', 'anything', code=1)
                self.assertIn(backend + '-unspecified', result.stderr)
                self.assertFalse(absent_store.exists())
                self.assertFalse((self.set / 'extraction').exists())
                self.assertEqual(self.store.read_bytes(), store_before)
        recipe.write_text(original)

    def test_stdlib_and_schema(self):
        for path in (SCRIPT, TOOL / 'packs/general/graph_model.py'):
            tree = ast.parse(path.read_text())
            for node in ast.walk(tree):
                names = [a.name for a in node.names] if isinstance(node, ast.Import) else [node.module] if isinstance(node, ast.ImportFrom) else []
                for name in names:
                    self.assertIn(name.split('.')[0], sys.stdlib_module_names)
        pack = module(TOOL / 'packs/general/graph_model.py', 'general_tested')
        self.assertEqual(set(pack.SCHEMA['properties']), set('schema dataset source_path source_hash pack pack_version entries'.split()))
        self.assertEqual(set(pack.NODE_SCHEMAS), set(km.ARRAYS))
        self.assertEqual(len(pack.GeneralExtraction().ideas), 0)
        self.assertEqual(pack.Entity('A', 'person', 'A').status, 'Candidate')

    def test_q6_shapes_and_recipe_keys(self):
        cases = [('plain', 'plain'), ('- a\n- b', ['a', 'b']), ('a:\n  b:\n    - x\n    - y', {'a': {'b': ['x','y']}}), ('questions:\n  - id: one\n    question: test', {'questions': [{'id':'one','question':'test'}]})]
        for text, expected in cases:
            self.assertEqual(km.Q6Reader(text).read(), expected)
        for text in ('a:\n  b:\n    c: no', '- - nested', 'a: [x]', 'a: x\na: y', 'a:\n\tb: bad', '- id: []'):
            with self.assertRaisesRegex(km.ProbeError, 'line'):
                km.Q6Reader(text).read()
        recipe = self.set / 'set.yaml'
        recipe.write_text(recipe.read_text() + '\nunknown_recipe: true\n')
        with self.assertRaisesRegex(km.ProbeError, 'unknown_recipe'):
            km.set_recipe(str(self.set))

    def test_chunk_boundaries_and_binary(self):
        path = self.set / 'corpus/splits.md'
        text = '---\nmeta: x\n---\n\n# A\n\n' + ('Long sentence. ' * 70) + '\n\n## B\n\nNext.\n'
        path.write_text(text)
        output = self.root / 'chunks'
        result = km.chunk(dict(source=str(path), out=str(output), dataset='test', max_chars='200'))
        data = json.loads(Path(result['manifest']).read_text())
        self.assertTrue(all(len(c['text']) <= 200 and c['text'] == text[c['char_start']:c['char_end']] for c in data['chunks']))
        self.assertEqual(data['chunks'][-1]['heading_path'], ['A','B'])
        path.write_bytes(b'abc\x00bad')
        with self.assertRaisesRegex(km.ProbeError, 'binary'):
            km.chunk(dict(source=str(path), out=str(output), dataset='test'))
        pdf = self.root / 'book.pdf'
        pdf.write_bytes(b'%PDF')
        with self.assertRaisesRegex(km.ProbeError, 'book.pdf'):
            km.chunk(dict(source=str(pdf), out=str(output), dataset='test'))

    def test_ingest_hash_rejection_and_recall(self):
        path, extraction, _ = self.add()
        first = self.ingest(path)
        self.assertEqual(first['sources_added'], 1)
        self.assertEqual(self.ingest(path)['skipped_by_hash'], 1)
        result = km.recall(dict(self.v, query='What is economy?', as_of='2026-01-01'))
        self.assertNotIn('answer', result)
        self.assertEqual(result['as_of'], '2026-01-01')
        self.assertEqual(result['items'][0]['status'], 'Candidate')
        extraction['entries'][0]['ideas'][0]['status'] = 'Canonical'
        path.write_text(json.dumps(extraction))
        rejected = self.ingest(path)
        self.assertEqual(rejected['nodes_rejected']['bad_status'], 1)
        extraction['pack_version'] = 'sha256:' + '0' * 64
        path.write_text(json.dumps(extraction))
        with self.assertRaisesRegex(km.ProbeError, 'pack_version'):
            self.ingest(path)

    def test_source_hash_and_path_screen(self):
        path, _, _ = self.add()
        (self.set / 'corpus/source.md').write_text('Changed source')
        with self.assertRaisesRegex(km.ProbeError, 'source_hash'):
            self.ingest(path)
        alias = self.root / 'tool-alias'
        alias.symlink_to(TOOL, target_is_directory=True)
        with self.assertRaisesRegex(km.ProbeError, 'inside this tool'):
            km.bootstrap(dict(store=str(alias / 'bad.sqlite')))
        outside = self.root / 'outside'
        outside.mkdir()
        (self.set / 'reports').symlink_to(outside, target_is_directory=True)
        with self.assertRaisesRegex(km.ProbeError, 'escapes'):
            km.report_path(self.set, 'ingest')

    def test_review_decisions_rebuild_replay(self):
        path, _, _ = self.add()
        self.ingest(path)
        findings = km.review_pass(self.v)
        self.assertEqual(findings['counts']['new_finding'], 1)
        self.assertEqual(findings['counts']['stale'], 1)
        self.assertFalse(km.review_pass(self.v)['items'])
        item = self.decision('z-old', 'promote', '2026-09-01')
        km.promote(dict(self.v, decided=str(item)))
        item = self.decision('a-new', 'mark-stale', '2026-09-02')
        km.promote(dict(self.v, decided=str(item)))
        before = km.recall(dict(self.v, query='Economy'))['items']
        km.forget(dict(self.v, memory_only=True, confirm=True))
        self.assertEqual(km.recall(dict(self.v, query='Economy'))['items'], [])
        self.ingest(path)
        km.promote(dict(self.v, replay=True))
        after = km.recall(dict(self.v, query='Economy'))['items']
        self.assertEqual(before, after)
        km.promote(dict(self.v, replay=True))
        self.assertEqual(after, km.recall(dict(self.v, query='Economy'))['items'])

    def test_forget_maintains_grounding(self):
        first, _, _ = self.add('one', '# Economy\n\nEconomy is freedom.\n')
        self.ingest(first)
        second, _, _ = self.add('two', '# Economy\n\nEconomy is thrift.\n')
        self.ingest(second)
        before = self.store.read_bytes()
        dry = km.forget(dict(self.v, data_id='corpus/one.md'))
        self.assertFalse(dry['confirmed'])
        self.assertEqual(before, self.store.read_bytes())
        km.forget(dict(self.v, data_id='corpus/one.md', confirm=True))
        result = km.recall(dict(self.v, query='freedom'))
        self.assertEqual(result['items'], [])
        result = km.recall(dict(self.v, query='thrift'))
        self.assertEqual(result['items'][0]['text'], 'Economy is thrift.')
        self.assertEqual(result['items'][0]['source_path'], 'corpus/two.md')
        self.assertTrue((self.set / 'corpus/one.md').exists())

    def test_eval_negative_isolation_and_other_dataset(self):
        path, _, _ = self.add()
        self.ingest(path)
        with km.graph_connection(self.store) as con:
            cursor = con.execute("INSERT INTO nodes VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)", ('elsewhere', 'idea', 'idea:secret', 'Secret', 'secret', 'isolation secret', 'Canonical', 'secret', 'corpus/secret.md', '[]', 'hash', None, None, None))
            con.execute('INSERT INTO nodes_fts(rowid,dataset,name,text,quote) VALUES (?,?,?,?,?)', (cursor.lastrowid, 'elsewhere', 'Secret', 'isolation secret', 'secret'))
        result = km.recall(dict(self.v, query='secret economy'))
        self.assertFalse(any(i['name'] == 'Secret' for i in result['items']))
        (self.set / 'eval.questions.yaml').write_text('questions:\n  - id: iso\n    type: isolation\n    question: "secret economy"\n    must_not_match: "Secret"\n')
        health = km.healthcheck(dict(self.v, eval=True))
        self.assertTrue(health['eval']['passed'])
        self.assertEqual(health['facts_missing_provenance'], 0)

    def test_canon_alias_and_same_date_replay(self):
        path, _, _ = self.add('canon', '# Economy\n\nEconomy is freedom.\n', {'ideas': [], 'entities': [dict(name='Economy', entity_type='term', aliases=[], summary='Economy is freedom.', status='Candidate', quote='Economy is freedom.')]})
        self.ingest(path)
        recipe = self.set / 'set.yaml'
        recipe.write_text(recipe.read_text().replace('canon_confirmed: ""', 'canon_confirmed: "Tester, 2026-09-10"'))
        (self.set / 'canon.md').write_text('# Canon: book\n\n## Canonical entities\n| Entity | Type | Aliases | Quote | Source | Register |\n|---|---|---|---|---|---|\n| Economy | term | thrift | Economy is freedom. | corpus/canon.md | Research inference |\n')
        result = km.promote(dict(self.v, from_canon=True))
        self.assertEqual(len(result['applied']), 2)
        with km.graph_connection(self.store) as con:
            self.assertEqual(con.execute("SELECT status FROM nodes WHERE normalized_name='thrift'").fetchone()[0], 'Alias')
            before = [tuple(r) for r in con.execute('SELECT * FROM aliases')]
        old = self.decision('z-same-date', 'promote', norm='economy')
        km.promote(dict(self.v, decided=str(old)))
        new = self.decision('a-same-date', 'mark-stale', norm='economy')
        km.promote(dict(self.v, decided=str(new)))
        km.forget(dict(self.v, memory_only=True, confirm=True))
        self.ingest(path)
        km.promote(dict(self.v, replay=True))
        km.promote(dict(self.v, replay=True))
        with km.graph_connection(self.store) as con:
            self.assertEqual(con.execute("SELECT status,valid_to FROM nodes WHERE normalized_name='economy'").fetchone()[:], ('Stale','2026-09-10'))
            self.assertEqual(before, [tuple(r) for r in con.execute('SELECT * FROM aliases')])

    def test_alias_recall_and_evidence_refresh(self):
        entries = {'ideas': [], 'entities': [dict(name='Economy', entity_type='term', aliases=[], summary='Economy is freedom.', status='Candidate', quote='Economy is freedom.')]}
        first, _, _ = self.add('one', '# One\n\nEconomy is freedom.\n', entries)
        self.ingest(first)
        second, _, _ = self.add('two', '# Two\n\nEconomy is freedom.\n', entries)
        self.ingest(second)
        recipe = self.set / 'set.yaml'
        recipe.write_text(recipe.read_text().replace('canon_confirmed: ""', 'canon_confirmed: "Tester, 2026-09-10"'))
        (self.set / 'canon.md').write_text('# Canon\n\n## Canonical entities\n| Entity | Type | Aliases | Quote | Source | Register |\n|---|---|---|---|---|---|\n| Economy | term | thrift | Economy is freedom. | corpus/one.md | Research inference |\n')
        km.promote(dict(self.v, from_canon=True))
        items = km.recall(dict(self.v, query='thrift'))['items']
        self.assertEqual([(r['name'], r['status']) for r in items], [('Economy','Canonical')])
        km.forget(dict(self.v, data_id='corpus/one.md', confirm=True))
        items = km.recall(dict(self.v, query='thrift'))['items']
        self.assertEqual(items[0]['name'], 'Economy')
        self.assertEqual(items[0]['source_path'], 'corpus/two.md')
        with km.graph_connection(self.store) as con:
            self.assertEqual(con.execute("SELECT name FROM nodes WHERE normalized_name='thrift'").fetchone()[0], 'thrift')

    def test_typed_hop_review_conflict_and_delete_shared_chunk(self):
        quote = 'Economy depends on simplicity. Tax is 10. Tax is 20.'
        arrays = dict(ideas=[dict(name=n, definition=n, status='Candidate', quote=quote) for n in ('Economy','Simplicity','Simplicity method')],
            facts=[dict(subject='Tax', predicate='is', object=n, confidence=0.8, quote=quote) for n in ('10','20')],
            idea_links=[dict(source_name='Economy', relation='DEPENDS_ON', target_name='Simplicity', quote=quote)])
        path, _, manifest = self.add('one', '# Economy\n\n' + quote + '\n', arrays)
        self.ingest(path)
        items = km.recall(dict(self.v, query='Economy', top_k='1'))['items']
        self.assertTrue(any(r['hop'] == 1 and r['via']['relation'] == 'DEPENDS_ON' for r in items))
        report = km.review_pass(self.v)
        self.assertGreaterEqual(report['counts']['conflict'], 1)
        # A retained source with the same chunk still supports the typed link.
        with km.graph_connection(self.store) as con:
            con.execute("INSERT INTO sources SELECT dataset,'corpus/two.md',source_hash,source_bytes FROM sources")
            con.execute("INSERT INTO chunks SELECT dataset,'corpus/two.md',source_hash,chunk_index,chunk_hash,heading_path,text FROM chunks")
            con.execute("INSERT INTO provenance SELECT dataset,node_id,'corpus/two.md',chunk_hash,quote,payload FROM provenance")
        km.forget(dict(self.v, data_id='corpus/one.md', confirm=True))
        with km.graph_connection(self.store) as con:
            self.assertEqual(con.execute('SELECT count(*) FROM edges').fetchone()[0], 1)
        km.mark_stale(dict(self.v, id='idea:economy', valid_to='2026-09-05'))
        self.assertEqual(km.recall(dict(self.v, query='Economy'))['items'][0]['valid_to'], '2026-09-05')
        km.forget(dict(self.v, dataset=True, confirm=True))
        with km.graph_connection(self.store) as con:
            self.assertEqual(con.execute('SELECT count(*) FROM datasets').fetchone()[0], 0)

    def test_wiki_lint_safe_fixes_and_append_only(self):
        wiki = self.root / 'wiki-fixture'
        (wiki / 'wiki/topic').mkdir(parents=True)
        (wiki / 'corpus/topic').mkdir(parents=True)
        (wiki / 'corpus/topic/source.md').write_text('# Source\n\nThere are 12 apples.\n')
        page = wiki / 'wiki/topic/concept.md'
        page.write_text('# Concept\n\n- Updated: 2026-09-10\n- Sources: Source\n- Raw: [source](../../corpus/moved/source.md)\n\n"There are 12 apples." There are 999 pears.\n\n## See Also\n')
        (wiki / 'wiki/log.md').write_text('# Wiki Log\n\n## [2026-09-09] ingest | Existing\n')
        original_log = (wiki / 'wiki/log.md').read_text()
        result = km.wiki_lint(dict(set=str(wiki)))
        self.assertEqual(result['auto_fixed'], 2)
        self.assertTrue(any(i.get('literal') == '999' for i in result['issues']))
        self.assertIn('../../corpus/topic/source.md', page.read_text())
        self.assertIn('999', page.read_text())
        self.assertTrue((wiki / 'wiki/log.md').read_text().startswith(original_log))
        self.assertEqual(km.wiki_lint(dict(set=str(wiki)))['auto_fixed'], 0)


    stderr_captures = {}

    def command(self, command, *args, code=0):
        return self.cli(command, '--set', str(self.set), '--store', str(self.store), *args, code=code)

    def snapshot(self):
        with km.graph_connection(self.store) as con:
            return (
                [tuple(r) for r in con.execute('SELECT dataset,kind,normalized_name,status,valid_to FROM nodes ORDER BY dataset,kind,normalized_name')],
                [tuple(r) for r in con.execute('SELECT * FROM aliases ORDER BY dataset,kind,normalized_name')],
            )

    def test_m2_ingest_reports_on_disk(self):
        path, _, _ = self.add()
        reports = []
        for skipped in (0, 1):
            result = json.loads(self.command('ingest', '--extraction', str(path)).stdout)
            report = Path(result['report'])
            self.assertEqual(report.parent, self.set / 'reports')
            self.assertRegex(report.name, r'^ingest-.*\.json$')
            saved = json.loads(report.read_text())
            self.assertEqual(saved, result)
            self.assertEqual(saved['sources_added'], 1 - skipped)
            self.assertEqual(saved['skipped_by_hash'], skipped)
            self.assertEqual(saved['nodes_ingested'], 1 - skipped)
            self.assertTrue(saved['review_due'])
            self.assertEqual(sum(saved['nodes_rejected'].values()), 0)
            self.assertEqual(saved['rejected_detail'], [])
            reports.append(report)
        self.assertNotEqual(*reports)
        bad, extraction, _ = self.add('bad', '# Bad\n\nA different source.\n')
        extraction['entries'][0]['ideas'][0]['quote'] = 'Not present in this source.'
        bad.write_text(json.dumps(extraction))
        result = json.loads(self.command('ingest', '--extraction', str(bad)).stdout)
        saved = json.loads(Path(result['report']).read_text())
        self.assertEqual(saved['nodes_rejected']['quote_not_located'], 1)
        self.assertEqual(saved['rejected_detail'][0]['reason'], 'quote_not_located')
        self.assertEqual(saved['nodes_ingested'], 0)
        self.assertEqual(len(list((self.set / 'reports').glob('ingest-*.json'))), 3)

    def test_m2_review_all_shapes_and_duplicate_ids(self):
        quote = 'Economy and Economies matter. Tax is 10. Tax is 20.'
        entries = dict(
            ideas=[dict(name=n, definition=n, status='Candidate', quote=quote) for n in ('Economy', 'Economies')],
            facts=[dict(subject='Tax', predicate='is', object=n, quote=quote) for n in ('10', '20')])
        path, extraction, _ = self.add(text='# Review\n\n' + quote + '\n', entries=entries)
        extraction['entries'][0]['extracted_on'] = (datetime.date.today() - datetime.timedelta(days=90)).isoformat()
        path.write_text(json.dumps(extraction))
        self.ingest(path)
        before = self.snapshot()
        result = json.loads(self.command('review-pass').stdout)
        expected = {'new_finding': 'new_findings', 'stale': 'stale', 'merge_proposal': 'merge_proposals', 'conflict': 'conflicts'}
        self.assertEqual(set(result['counts']), set(expected))
        self.assertTrue(all(result['counts'].values()), result)
        template = (TOOL / 'templates/review_item.md').read_text()
        headings = re.findall(r'^## (.+)$', template, re.M)
        self.assertEqual(headings, ['Surface forms', 'Subject', 'Proposed action', 'Evidence', 'Why this is not auto-decidable', 'Recommendation', 'Decision'])
        files, ids = {}, set()
        with km.graph_connection(self.store) as con:
            for item in result['items']:
                path = Path(item['file'])
                self.assertEqual(path.parent, self.set / 'review' / expected[item['type']])
                text = path.read_text()
                self.assertRegex(text, r'(?s)\A---\n.*?\n---\n')
                self.assertEqual(re.findall(r'^## (.+)$', text, re.M), headings)
                meta, subject, decision, _ = km.item_parts(path)
                self.assertEqual(meta['status'], 'open')
                self.assertEqual(meta['type'], item['type'])
                self.assertEqual(meta['dataset'], 'exampleroot_example_set')
                self.assertEqual(set(subject), {'node_type', 'normalized_name', 'node_id', 'data_id', 'target'})
                self.assertTrue(all(isinstance(v, str) for v in subject.values()))
                node = con.execute('SELECT * FROM nodes WHERE dataset=? AND node_id=?', (meta['dataset'], subject['node_id'])).fetchone()
                self.assertIsNotNone(node)
                self.assertEqual((subject['node_type'], subject['normalized_name'], subject['data_id']), (node['kind'], node['normalized_name'], node['source_path']))
                self.assertIn(node['quote'], text)
                self.assertIn(node['chunk_hash'], text)
                if item['type'] in ('merge_proposal', 'conflict'):
                    self.assertTrue(subject['target'])
                self.assertEqual(set(decision), {'reviewer', 'decision', 'date', 'note'})
                self.assertFalse(any(decision.values()))
                self.assertNotIn(meta['id'], ids)
                ids.add(meta['id'])
                files[path] = text
        second = json.loads(self.command('review-pass').stdout)
        self.assertEqual(second['items'], [])
        self.assertTrue(all(n == 0 for n in second['counts'].values()))
        self.assertEqual({p: p.read_text() for p in km.review_files(self.set)}, files)
        self.assertEqual(before, self.snapshot())

    def test_m2_contradicts_conflict_target_is_normalized_name(self):
        quote = 'Economy contradicts luxury. Luxury contradicts economy.'
        entries = dict(
            ideas=[dict(name=n, definition=n, status='Candidate', quote=quote) for n in ('Economy', 'Luxury')],
            idea_links=[dict(source_name='Economy', relation='CONTRADICTS', target_name='Luxury', quote=quote)])
        path, _, _ = self.add(text='# Source\n\n' + quote + '\n', entries=entries)
        self.ingest(path)
        result = json.loads(self.command('review-pass').stdout)
        conflicts = [i for i in result['items'] if i['type'] == 'conflict']
        self.assertTrue(conflicts)
        for item in conflicts:
            subject = km.item_parts(Path(item['file']))[1]
            self.assertEqual(subject['target'], 'luxury')
            self.assertNotEqual(subject['target'], 'idea:luxury')
            self.assertEqual(km.normalized_name(subject['target']), subject['target'])
            with km.graph_connection(self.store) as con:
                row = con.execute(
                    'SELECT 1 FROM nodes WHERE dataset=? AND kind=? AND normalized_name=?',
                    ('exampleroot_example_set', subject['node_type'], subject['target'])).fetchone()
            self.assertIsNotNone(row)

    def test_m2_same_date_replay_needs_changelog(self):
        path, _, _ = self.add()
        self.ingest(path)
        first = self.decision('z-old', 'promote')
        self.command('promote', '--decided', str(first))
        second = self.decision('a-new', 'mark-stale')
        self.command('promote', '--decided', str(second))
        (self.set / 'review/changelog.md').unlink()
        self.command('forget', '--memory-only', '--confirm')
        self.command('ingest', '--extraction', str(path))
        self.assertIn(
            'same-date replay decisions need application order in review/changelog.md',
            self.command('promote', '--replay', code=1).stderr)

    def test_m2_decided_rejects_open_and_wrong_directory(self):
        path, _, _ = self.add()
        self.ingest(path)
        item = self.decision('human', 'promote')
        original = item.read_text()
        before = self.snapshot()
        outside = self.set / 'review/new_findings/outside.md'
        outside.parent.mkdir(parents=True)
        outside.write_text(original)
        self.assertIn('--decided must sit under review/decided/', self.command('promote', '--decided', str(outside), code=1).stderr)
        item.write_text(original.replace('status: decided', 'status: open'))
        self.assertIn('item must have status: decided', self.command('promote', '--decided', str(item), code=1).stderr)
        self.assertEqual(before, self.snapshot())
        self.assertEqual(km.item_parts(item)[0]['status'], 'open')
        item.write_text(original)
        result = json.loads(self.command('promote', '--decided', str(item)).stdout)
        self.assertEqual([r['status'] for r in result['applied']], ['Canonical'])
        self.assertEqual(km.item_parts(item)[0]['status'], 'applied')
        self.assertEqual(km.item_parts(outside)[0]['status'], 'decided')

    def test_m2_canon_gates_and_replay_full_state(self):
        path, _, _ = self.add(entries={'ideas': [], 'entities': [dict(name='Economy', entity_type='term', aliases=[], summary='Economy is freedom.', status='Candidate', quote='Economy is freedom.')]})
        self.ingest(path)
        canon = self.set / 'canon.md'
        text = '# Canon\n\n## Canonical entities\n| Entity | Type | Aliases | Quote | Source | Register |\n|---|---|---|---|---|---|\n| Economy | term | thrift | Economy is freedom. | corpus/source.md | Research inference |\n'
        canon.write_text(text)
        recipe = self.set / 'set.yaml'
        original = recipe.read_text()
        before = self.snapshot()
        for confirmation in ('', 'Tester', '2026-09-10'):
            recipe.write_text(original.replace('canon_confirmed: ""', 'canon_confirmed: ' + json.dumps(confirmation)))
            self.assertIn('canon_confirmed must name a person and YYYY-MM-DD', self.command('promote', '--from-canon', code=1).stderr)
        recipe.write_text(original.replace('canon_confirmed: ""', 'canon_confirmed: "Tester, 2026-09-10"'))
        for changed, error in ((text.replace('Economy is freedom.', 'An invented quote.'), 'canon quote not located'),
                               (text.replace('| Economy |', '| Missing |'), 'canon entry has no ingested node')):
            canon.write_text(changed)
            self.assertIn(error, self.command('promote', '--from-canon', code=1).stderr)
            self.assertEqual(before, self.snapshot())
            self.assertFalse(km.review_files(self.set))
        canon.write_text(text)
        result = json.loads(self.command('promote', '--from-canon').stdout)
        self.assertEqual({r['status'] for r in result['applied']}, {'Canonical', 'Alias'})
        self.assertEqual(len(result['applied']), 2)
        for row in result['applied']:
            item = Path(row['file'])
            self.assertEqual(item.parent, self.set / 'review/decided')
            meta, subject, decision, rendered = km.item_parts(item)
            self.assertEqual(meta['status'], 'applied')
            self.assertEqual((decision['reviewer'], decision['date']), ('Tester', '2026-09-10'))
            self.assertIn('Economy is freedom.', rendered)
        stale = self.decision('stale-after-canon', 'mark-stale', date='2026-09-11')
        self.command('promote', '--decided', str(stale))
        baseline = self.snapshot()
        self.assertEqual({r[3] for r in baseline[0]}, {'Stale', 'Alias'})
        self.assertTrue(baseline[1])
        decision_bytes = {p: p.read_bytes() for p in km.review_files(self.set)}
        changelog = (self.set / 'review/changelog.md').read_bytes()
        self.command('forget', '--memory-only', '--confirm')
        self.assertEqual(self.snapshot(), ([], []))
        self.command('ingest', '--extraction', str(path))
        self.assertEqual({r[3] for r in self.snapshot()[0]}, {'Candidate'})
        for _ in range(2):
            replay = json.loads(self.command('promote', '--replay').stdout)
            self.assertTrue(replay['replay'])
            self.assertEqual(len(replay['applied']), 3)
            self.assertEqual(self.snapshot(), baseline)
            self.assertEqual({p: p.read_bytes() for p in km.review_files(self.set)}, decision_bytes)
            self.assertEqual((self.set / 'review/changelog.md').read_bytes(), changelog)

    def test_m2_mark_stale_keeps_row_and_refuses_missing(self):
        path, _, _ = self.add()
        self.ingest(path)
        with km.graph_connection(self.store) as con:
            before = dict(con.execute('SELECT rowid,* FROM nodes').fetchone())
        for args, date in (([], km.today()), (['--valid-to', '2026-08-01'], '2026-08-01')):
            result = json.loads(self.command('mark-stale', '--id', before['node_id'], *args).stdout)
            self.assertEqual((result['status'], result['valid_to'], result['deleted']), ('Stale', date, 0))
            with km.graph_connection(self.store) as con:
                rows = [dict(r) for r in con.execute('SELECT rowid,* FROM nodes')]
            self.assertEqual(rows, [dict(before, status='Stale', valid_to=date)])
        saved = self.snapshot()
        self.assertIn('node not found in this dataset: missing', self.command('mark-stale', '--id', 'missing', code=1).stderr)
        self.assertEqual(self.snapshot(), saved)

    def test_m2_healthcheck_counts_backlog_and_retrieval_only(self):
        self.assertIsNone(json.loads(self.command('healthcheck').stdout)['last_ingest'])
        path, _, _ = self.add(entries={'facts': [dict(subject='Tax', predicate='is', object='10', quote='Economy is freedom.')]})
        self.ingest(path)
        review = km.review_pass(self.v)
        applied = self.decision('applied', 'promote')
        self.command('promote', '--decided', str(applied))
        old_date = (datetime.date.today() - datetime.timedelta(days=12)).isoformat()
        for row in review['items']:
            p = Path(row['file'])
            p.write_text(re.sub(r'^created: .*$', 'created: ' + old_date, p.read_text(), flags=re.M))
        result = json.loads(self.command('healthcheck').stdout)
        self.assertEqual({(r['kind'], r['status']): r['count'] for r in result['counts']}, {('idea', 'Canonical'): 1, ('fact', 'Candidate'): 1})
        self.assertEqual(result['facts_missing_provenance'], 0)
        self.assertEqual(result['last_ingest'], km.today())
        self.assertEqual({r['file'] for r in result['backlog']}, {r['file'] for r in review['items']})
        self.assertTrue(all(r['age_days'] == 12 and r['status'] == 'open' for r in result['backlog']))
        self.assertNotIn('eval', result)
        # Deliberate corruption proves the missing-provenance counter can detect a fact.
        with km.graph_connection(self.store) as con:
            con.execute("DELETE FROM provenance WHERE node_id IN (SELECT node_id FROM nodes WHERE kind='fact')")
        self.assertEqual(json.loads(self.command('healthcheck').stdout)['facts_missing_provenance'], 1)
        (self.set / 'eval.questions.yaml').write_text('questions:\n  - id: retrieve\n    type: direct\n    question: economy\n    expected: "path:corpus/source.md"\n  - id: isolate\n    type: isolation\n    question: economy\n    must_not_match: forbidden\n')
        evaluated = json.loads(self.command('healthcheck', '--eval').stdout)
        self.assertEqual(evaluated['eval']['scope'], 'databased retrieval only')
        self.assertTrue(evaluated['eval']['passed'])
        self.assertEqual({q['id'] for q in evaluated['eval']['questions']}, {'retrieve', 'isolate'})
        retrieve = next(q for q in evaluated['eval']['questions'] if q['id'] == 'retrieve')
        self.assertEqual(retrieve['question'], 'economy')
        self.assertEqual(retrieve['expected'], 'path:corpus/source.md')
        self.assertNotIn('answer', json.dumps(evaluated))
        saved = [json.loads(p.read_text()) for p in (self.set / 'reports').glob('healthcheck-*.json')]
        self.assertIn(evaluated, saved)

    def test_m2_isolation_leaky_join_trips_shared_guard(self):
        def seed():
            quote = 'A shared token. Liberty matters.'
            entries = dict(ideas=[dict(name=n, definition=n, status='Candidate', quote=quote) for n in ('Economy', 'Liberty')],
                           idea_links=[dict(source_name='Economy', relation='DEPENDS_ON', target_name='Liberty', quote=quote)])
            path, _, _ = self.add(text='# Source\n\n' + quote + '\n', entries=entries)
            km.ingest(dict(set=str(self.set), store=str(self.store), extraction=str(path)))
        seed()
        first = self.set
        second = self.root / 'other'
        (second / 'corpus').mkdir(parents=True)
        (second / 'set.yaml').write_text((first / 'set.yaml').read_text().replace('set: book', 'set: other').replace('dataset: exampleroot_example_set', 'dataset: other'))
        self.set = second
        try:
            seed()
        finally:
            self.set = first
        with km.graph_connection(self.store) as con:
            con.execute("UPDATE nodes SET text='forbidden tenant B' WHERE dataset='other'")
        dataset = 'exampleroot_example_set'
        for result in (km.query(dict(store=str(self.store), dataset=dataset, query='Economy', top_k='1')),
                       km.recall(dict(self.v, query='Economy', top_k='1')),
                       json.loads(self.command('recall', '--query', 'Economy', '--top-k', '1').stdout)):
            self.assertEqual([(r['node_id'], r['hop']) for r in result['items']], [('idea:economy', 0), ('idea:liberty', 1)])
            self.assertNotIn('forbidden', json.dumps(result))
        with km.graph_connection(self.store) as con:
            # Intentionally omit dataset from JOIN and WHERE in test-only SQL.
            leaky = con.execute('SELECT n.*,e.relation FROM edges e JOIN nodes n ON n.node_id=e.to_node_id WHERE e.from_node_id=?', ('idea:economy',)).fetchall()
            lexical_leak = con.execute('SELECT n.* FROM nodes_fts JOIN nodes n ON n.rowid=nodes_fts.rowid WHERE nodes_fts MATCH ?', ('Economy',)).fetchall()
        for rows in (leaky, lexical_leak):
            self.assertEqual({r['dataset'] for r in rows}, {dataset, 'other'})
            for row in rows:
                if row['dataset'] == dataset:
                    km.check_dataset(row, dataset)
                else:
                    with self.assertRaisesRegex(km.ProbeError, 'dataset isolation self-check'):
                        km.check_dataset(row, dataset)
        tree = ast.parse(SCRIPT.read_text())
        query = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'query')
        sql = [n.args[0].value for n in ast.walk(query) if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute) and n.func.attr == 'execute']
        self.assertEqual(len(sql), 4)
        self.assertTrue(all('dataset=?' in statement for statement in sql))
        fts = next(s for s in sql if 'MATCH' in s)
        hop = next(s for s in sql if 'FROM edges' in s)
        for fragment in ('n.dataset=nodes_fts.dataset', 'nodes_fts.dataset=?', 'n.dataset=?'):
            self.assertIn(fragment, fts)
        for fragment in ('n.dataset=e.dataset', 'e.dataset=?', 'n.dataset=?'):
            self.assertIn(fragment, hop)
        checks = [n for n in ast.walk(query) if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id == 'check_dataset']
        self.assertEqual(len(checks), 2)
        (self.set / 'eval.questions.yaml').write_text('questions:\n  - id: isolation\n    type: isolation\n    question: Economy\n    expected: Economy\n    must_not_match: "forbidden tenant B"\n')
        self.assertTrue(json.loads(self.command('healthcheck', '--eval').stdout)['eval']['passed'])

    def wiki_fixture(self):
        root = self.root / 'wiki-fixture'
        for relative in ('wiki/topic', 'corpus/topic', 'corpus/other'):
            (root / relative).mkdir(parents=True)
        (root / 'corpus/topic/source.md').write_text('# Source\n\nThere are\n  12 apples. Exact\twords survive.\n')
        for relative in ('corpus/topic/duplicate.md', 'corpus/other/duplicate.md'):
            (root / relative).write_text('Ambiguous sources.\n')
        body = '"There are\n   12 apples." \'Exact\nwords survive.\' "Missing\nwords." \'Missing\nsingle quote.\' 999 pears.\n'
        raw_links = {
            'repair': '../../corpus/moved/source.md',
            'ambiguous': '../../corpus/moved/duplicate.md',
            'absent': '../../corpus/moved/absent.md',
            'outside': '../../../source.md',
        }
        for name, raw in raw_links.items():
            (root / ('wiki/topic/' + name + '.md')).write_text('# ' + name.title() + '\n\n- Updated: 2026-09-10\n- Sources: Supplied\n- Raw: [source](' + raw + ')\n\n' + (body if name == 'repair' else 'A paraphrase.\n') + '\n## See Also\n')
        (root / 'wiki/index.md').write_text('# Knowledge Base Index\n\n## topic\n\n- [Ambiguous](topic/ambiguous.md)\n- [Ambiguous duplicate](topic/ambiguous.md)\n- [Absent](topic/absent.md)\n- [Outside](topic/outside.md)\n- [Ghost](topic/ghost.md)\n')
        (root / 'wiki/log.md').write_text('# Wiki Log\n\n## [2026-09-09] ingest | Existing\n- Disposition: New\n')
        return root

    def test_m2_wiki_lint_locate_and_safe_fix_boundaries(self):
        root = self.wiki_fixture()
        pages = {p: p.read_text() for p in (root / 'wiki/topic').glob('*.md')}
        corpus = {p: p.read_bytes() for p in (root / 'corpus').rglob('*.md')}
        index = (root / 'wiki/index.md').read_text()
        log = (root / 'wiki/log.md').read_text()
        result = json.loads(self.cli('wiki-lint', '--set', str(root)).stdout)
        self.assertEqual(result['auto_fixed'], 2)
        self.assertEqual(len(result['fixes']), 2)
        self.assertIn(dict(file='wiki/index.md', added='topic/repair.md'), result['fixes'])
        self.assertIn(dict(file='wiki/topic/repair.md', before='../../corpus/moved/source.md', after='../../corpus/topic/source.md'), result['fixes'])
        located_failures = [km.collapse(i['literal']) for i in result['issues'] if i['reason'] == 'literal not located in linked corpus']
        self.assertCountEqual(located_failures, ['Missing words.', 'Missing single quote.', '999'])
        for name in ('ambiguous', 'absent', 'outside'):
            self.assertTrue(any(i['file'] == 'wiki/topic/' + name + '.md' and i['reason'] == 'Raw broken or outside link' for i in result['issues']))
        self.assertTrue(any(i['reason'] == 'duplicate index entry' for i in result['issues']))
        self.assertTrue(any(i['reason'] == 'index broken or outside link' and i['link'] == 'topic/ghost.md' for i in result['issues']))
        for page, original in pages.items():
            self.assertEqual(page.read_text(), original.replace('../../corpus/moved/source.md', '../../corpus/topic/source.md') if page.stem == 'repair' else original)
        self.assertEqual({p: p.read_bytes() for p in corpus}, corpus)
        fixed_index = (root / 'wiki/index.md').read_text()
        self.assertTrue(fixed_index.startswith(index))
        self.assertEqual(fixed_index.count('(topic/repair.md)'), 1)
        self.assertIn('(topic/ghost.md)', fixed_index)
        first_log = (root / 'wiki/log.md').read_text()
        self.assertTrue(first_log.startswith(log))
        self.assertIn(' lint | ', first_log[len(log):])
        second = json.loads(self.cli('wiki-lint', '--set', str(root)).stdout)
        self.assertEqual(second['auto_fixed'], 0)
        self.assertCountEqual([km.collapse(i['literal']) for i in second['issues'] if 'literal' in i], located_failures)
        self.assertEqual((root / 'wiki/index.md').read_text(), fixed_index)
        second_log = (root / 'wiki/log.md').read_text()
        self.assertTrue(second_log.startswith(first_log))
        self.assertEqual(len(re.findall(r'^## \[.*\] lint \|', second_log, re.M)), 2)

    def test_m2_python39_help_lint_and_graph_refusal(self):
        interpreter = '/usr/bin/python3'
        version = subprocess.run([interpreter, '--version'], capture_output=True, text=True, check=True)
        self.assertIn('Python 3.9.', version.stdout)
        help_run = subprocess.run([interpreter, str(SCRIPT), 'help'], capture_output=True, text=True)
        self.assertEqual(help_run.returncode, 0, help_run.stderr)
        self.assertIn('Usage:', help_run.stdout)
        root = self.wiki_fixture()
        lint = subprocess.run([interpreter, str(SCRIPT), 'wiki-lint', '--set', str(root)], capture_output=True, text=True)
        self.assertEqual(lint.returncode, 0, lint.stderr)
        self.assertEqual(json.loads(lint.stdout)['auto_fixed'], 2)
        blocked_store = self.root / 'python39.sqlite'
        graph = subprocess.run([interpreter, str(SCRIPT), 'bootstrap', '--store', str(blocked_store)], capture_output=True, text=True)
        self.assertEqual(graph.returncode, 1)
        self.assertEqual(graph.stdout, '')
        self.assertIn('this script needs Python 3.11 or newer', graph.stderr)
        self.assertFalse(blocked_store.exists())
        self.stderr_captures['python39'] = graph.stderr.strip()

    def test_m2_troubleshooting_actual_stderr(self):
        captures = {}
        for flag in ('--install', '--env'):
            captures[flag] = self.cli('check', flag, code=1).stderr.strip()
        path, extraction, _ = self.add()
        self.ingest(path)
        recipe = self.set / 'set.yaml'
        original = recipe.read_text()
        for key, changed in (
            ('unknown recipe key', original + '\nunsupported_key: true\n'),
            ('owner and session_permission', original.replace('session_permission: "Tester, 2026-09-10"', 'session_permission: ""')),
            ('hosted-unspecified', original.replace('backend: databased', 'backend: hosted')),
            ('graph-unspecified', original.replace('backend: databased', 'backend: graph')),
        ):
            recipe.write_text(changed)
            captures[key] = self.cli('chunk', '--set', str(self.set), code=1).stderr.strip()
            recipe.write_text(original)
        extraction['pack_version'] = 'sha256:' + '0' * 64
        path.write_text(json.dumps(extraction))
        captures['pack_version mismatch'] = self.command('ingest', '--extraction', str(path), code=1).stderr.strip()
        extraction['pack_version'] = km.pack_hash(TOOL / 'packs/general')
        path.write_text(json.dumps(extraction))
        source = self.set / 'corpus/source.md'
        original_source = source.read_text()
        source.write_text('Changed source.\n')
        captures['source_hash mismatch'] = self.command('ingest', '--extraction', str(path), code=1).stderr.strip()
        source.write_text(original_source)
        item = self.decision('incomplete', 'promote')
        wrong = self.set / 'wrong.md'
        wrong.write_text(item.read_text())
        captures['--decided'] = self.command('promote', '--decided', str(wrong), code=1).stderr.strip()
        item.write_text(item.read_text().replace('reviewer: "Tester"', 'reviewer: ""'))
        captures['decision block incomplete'] = self.command('promote', '--decided', str(item), code=1).stderr.strip()
        graph39 = subprocess.run(['/usr/bin/python3', str(SCRIPT), 'bootstrap', '--store', str(self.root / 'refused.sqlite')], capture_output=True, text=True)
        self.assertEqual((graph39.returncode, graph39.stdout), (1, ''))
        captures['python39'] = graph39.stderr.strip()
        self.stderr_captures.update(captures)
        table = (TOOL / 'TOOL.md').read_text().split('## Troubleshooting\n', 1)[1]
        messages = re.findall(r'^\| `([^`]+)` \|', table, re.M)
        self.assertEqual(len(messages), len(captures) + 1)
        # This interpreter has FTS5, so check its exact fail() literal without
        # pretending that a real missing-FTS5 runtime failure was reproduced.
        main = next(n for n in ast.parse(SCRIPT.read_text()).body if isinstance(n, ast.FunctionDef) and n.name == 'main')
        fts_error = next(n.args[0].value for n in ast.walk(main) if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id == 'fail' and isinstance(n.args[0], ast.Constant) and str(n.args[0].value).startswith('databased work needs SQLite FTS5'))
        self.assertTrue(km.check({})['fts5'])
        for message in messages:
            self.assertTrue(any(message in stderr for stderr in [*captures.values(), fts_error]), message)
        for key, stderr in captures.items():
            self.assertTrue(any(message in stderr for message in messages), (key, stderr))


if __name__ == '__main__':
    unittest.main()
