"""Graph contract, real CLI subprocesses and disposable stores outside the tool.

Set WISER_GRAPH_TEST_WORK to a writable test workspace outside the tool. Packages
must already be installed in the real tool venv; these tests never install them.
"""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

TOOL = Path(__file__).resolve().parents[1]
SCRIPT = TOOL / 'scripts/knowledge_memory.py'
VENV = TOOL / '.venv' / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python3')


class GraphContract(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='graph-test-', dir=os.environ.get('WISER_GRAPH_TEST_WORK'))
        self.root = Path(self.tmp.name).resolve()
        self.addCleanup(self.tmp.cleanup)
        self.env = dict(os.environ, PYTHONDONTWRITEBYTECODE='1', PYTHONNOUSERSITE='1')
        self.env.pop('WISER_ALLOW_INSTALL', None)
        self.set = self.root / 'fixture'
        (self.set / 'corpus').mkdir(parents=True)
        text = (TOOL / 'templates/set.yaml').read_text().replace('set: example-set', 'set: fixture').replace('backend: wiki', 'backend: graph').replace('session_permission: ""', 'session_permission: "Synthetic test permission, 2026-09-11"')
        (self.set / 'set.yaml').write_text(text)
        self.store = self.root / 'a/graph.lbdb'
        self.assertTrue(VENV.is_file(), 'Install the approved graph packages once before running this suite.')

    def run_cli(self, *args, code=0, wrapper=None, interpreter=None):
        # Native dependencies must not write ambient session/cache files.
        cmd = [str(interpreter or sys.executable), '-B']
        if wrapper:
            cmd += ['-c', wrapper, str(SCRIPT), *args]
        else:
            cmd += [str(SCRIPT), *args]
        run = subprocess.run(cmd, env=self.env, text=True, capture_output=True, cwd=self.root)
        self.assertFalse((self.root / ':memory:.ses').exists(), 'native telemetry session write')
        self.assertEqual(run.returncode, code, run.stderr)
        if code:
            self.assertEqual(run.stdout, '')
        return run

    def recipe(self, **changes):
        p = self.set / 'set.yaml'
        text = p.read_text()
        for key, value in changes.items():
            import re
            if re.search(r'^' + key + ':', text, re.M):
                text = re.sub(r'^' + key + ':.*$', key + ': ' + value, text, flags=re.M)
            else:
                text += '\n' + key + ': ' + value + '\n'
        p.write_text(text)

    def seed(self, foreign=False, extras=False, embedded=False, long=False, collide=False, many=0):
        if embedded:
            self.recipe(retrieval='embedding')
        if long:
            text = ('Rest restores energy. Sleep supports recovery. Vehicles travel on roads. ') * 60 + '\n'
        else:
            text = 'Rest restores energy. Sleep supports recovery. Vehicles travel on roads.\n'
        # `many` adds distinct grounded nodes so a path that slices to a default can be
        # read off the returned count rather than argued about. Every added quote is a
        # sentence of the corpus, because ingest refuses a node without a located one.
        extra = ['Fact %02d is recorded here.' % n for n in range(1, many + 1)]
        if extra:
            text = text.rstrip('\n') + ' ' + ' '.join(extra) + '\n'
        source = self.set / 'corpus/source.md'
        source.write_text(text)
        self.run_cli('chunk', '--set', str(self.set))
        manifest = json.loads((self.set / 'extraction/source.chunks.json').read_text())
        # Read the stdlib pack hash using the entry script without invoking main.
        spec = importlib.util.spec_from_file_location('graph_test_shapes', SCRIPT)
        km = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(km)
        arrays = {key: [] for key in km.ARRAYS}
        arrays['ideas'] = [dict(name='Rest', definition='A pause that replenishes stamina.', status='Canonical', quote='Rest restores energy.'),
                           dict(name='Recovery', definition='Regaining energy through sleeping.', status='Canonical', quote='Sleep supports recovery.')]
        arrays['ideas'] += [dict(name='Topic %02d' % n, definition='A distinct seeded idea.',
                                 status='Canonical', quote=quote)
                            for n, quote in enumerate(extra, 1)]
        if foreign:
            arrays['ideas'][1]['name'] = 'Foreign'
        arrays['idea_links'] = [dict(source_name='Rest', relation='DEPENDS_ON', target_name=arrays['ideas'][1]['name'], quote='Sleep supports recovery.')]
        if extras:
            arrays['entities'] = [dict(name='Car', entity_type='other', summary='Road transport.', aliases=['automobile'], status='Canonical', quote='Vehicles travel on roads.')]
            arrays['facts'] = [dict(subject='Sleep', predicate='supports', object='recovery', quote='Sleep supports recovery.')]
            arrays['decisions'] = [dict(summary='Rest.', quote='Rest restores energy.')]
            arrays['open_questions'] = [dict(question='More rest?', quote='Rest restores energy.')]
            arrays['ideas'].append(dict(name='Ungrounded', definition='Absent.', status='Canonical', quote='This does not occur.'))
            if collide:
                # An Idea and an Entity may carry the same name: the primary key is per
                # table. A traversal matching on name alone attributes one's relations
                # to the other, which is what the test below proves it no longer does.
                arrays['ideas'].append(dict(name='Car', definition='A shared name.', status='Canonical', quote='Vehicles travel on roads.'))
                arrays['idea_links'].append(dict(source_name='Car', relation='SPECIALIZES', target_name='Recovery', quote='Sleep supports recovery.'))
            arrays['idea_links'] += [dict(source_name='Rest', relation=r, target_name='Car', quote='Vehicles travel on roads.') for r in sorted(km.RELATIONS)]
        chunk = manifest['chunks'][0]
        extraction = dict(schema='extraction/0.1.0', dataset=manifest['dataset'], source_path='corpus/source.md', source_hash=manifest['source_hash'], pack='general', pack_version=km.pack_hash(TOOL / 'packs/general'), entries=[dict(chunk_index=0, chunk_hash=chunk['chunk_hash'], extracted_on='2026-09-11', **arrays)])
        self.extraction = self.set / 'extraction/source.extraction.json'
        self.extraction.write_text(json.dumps(extraction))
        return json.loads(self.run_cli('ingest', '--set', str(self.set), '--store', str(self.store), '--extraction', str(self.extraction)).stdout)

    def recall(self, query, code=0, extra=(), **kw):
        return self.run_cli('recall', '--set', str(self.set), '--store', str(self.store), '--query', query, *extra, code=code, **kw)

    def raw(self, query):
        # Test-only mutation and scalar inspection; never imports native code in unittest.
        code = "import importlib,json,sys; e=importlib.import_module('ladybug'); d=e.Database(sys.argv[1],buffer_pool_size=64*1024*1024,max_num_threads=1); c=e.Connection(d); r=c.execute(sys.argv[2]); print(json.dumps(r.get_all())); r.close(); c.close(); d.close()"
        run = subprocess.run([str(VENV), '-B', '-c', code, str(self.store), query], env=self.env, capture_output=True, text=True)
        self.assertEqual(run.returncode, 0, run.stderr)
        return json.loads(run.stdout)

    def test_persist_reopen_edge_and_candidate(self):
        result = self.seed()
        self.assertEqual(result['nodes_inserted'], 2)
        self.assertTrue(self.store.is_file())
        query = 'MATCH (a:Idea)-[:DEPENDS_ON]->(b:Idea) RETURN b.name,b.quote,b.source_path'
        self.assertEqual(json.loads(self.recall(query).stdout)['items'], [dict(name='Recovery', quote='Sleep supports recovery.', source_path='corpus/source.md', part='match')])
        self.assertEqual(self.raw("MATCH (n) WHERE n.status='Canonical' RETURN count(n)"), [[0]])
        self.assertEqual(self.raw("MATCH (n) WHERE n.status='Candidate' RETURN count(n)"), [[2]])
        self.raw('MATCH (a)-[r:DEPENDS_ON]->(b) DELETE r')
        self.assertEqual(json.loads(self.recall(query).stdout)['items'], [])
        self.assertEqual(self.raw('MATCH (n:Idea) RETURN count(n)'), [[2]])

    def test_two_files_isolate_overlapping_names(self):
        self.seed()
        first = self.store
        self.store = self.root / 'b/graph.lbdb'
        self.seed(foreign=True)
        self.assertEqual(len(json.loads(self.recall("MATCH (n:Idea) WHERE n.name='Foreign' RETURN n").stdout)['items']), 1)
        self.store = first
        self.assertEqual(json.loads(self.recall("MATCH (n:Idea) WHERE n.name='Foreign' RETURN n").stdout)['items'], [])
        self.assertEqual(len(json.loads(self.recall("MATCH (n:Idea) WHERE n.name='Rest' RETURN n").stdout)['items']), 1)

    def test_writes_and_malformed_refused_before_execute(self):
        self.seed()
        before = self.raw('MATCH (n) RETURN count(n)')
        queries = ['CREATE (n:Idea)', 'DELETE (n:Idea)', 'SET n.name="x"',
                   'MATCH (n) DELETE n', 'MATCH (n) SET n.name="x"',
                   'MATCH (n) RETURN n; CREATE (x:Idea)', 'MATCH (n) RETURN n // comment',
                   'MATCH (n) /* comment */ RETURN n', 'MATCH (n RETURN n']
        for query in queries:
            run = self.recall(query, code=1)
            self.assertRegex(run.stderr, 'read-only-query|malformed-query')
        self.assertEqual(self.raw('MATCH (n) RETURN count(n)'), before)
        # A fake connection proves refusal timing, including prepare failure.
        wrapper = "import runpy,sys; m=runpy.run_path(sys.argv[1]); r=m['runtime_module'](); "
        wrapper += "\nclass Prepared:\n def is_success(self): return False\n def close(self): pass\nclass Conn:\n def prepare(self,*a): return Prepared()\n def execute(self,*a): raise AssertionError('execute reached')\n"
        wrapper += "\ntry: r.read_query(Conn(), 'MATCH malformed')\nexcept RuntimeError as e: print(e,file=sys.stderr);sys.exit(1)"
        self.assertIn('malformed-query', self.run_cli(code=1, wrapper=wrapper, interpreter=VENV).stderr)

    def test_reingest_all_relations_skips_and_quotes(self):
        report = self.seed(extras=True)
        self.assertEqual(report['nodes_inserted'], 3)
        self.assertEqual(report['edges_inserted'], 7)
        self.assertEqual(report['nodes_rejected']['quote_not_located'], 1)
        self.assertEqual({k:v['count'] for k,v in report['skipped'].items()}, dict(fact=1, decision=1, open_question=1))
        self.assertTrue(all(v['reason'] for v in report['skipped'].values()))
        source_bytes = (self.set / 'corpus/source.md').read_bytes()
        again = json.loads(self.run_cli('ingest', '--set', str(self.set), '--store', str(self.store), '--extraction', str(self.extraction)).stdout)
        self.assertEqual((again['nodes_inserted'], again['edges_inserted']), (0, 0))
        self.assertEqual(self.raw("MATCH (n) WHERE n.status='Canonical' RETURN count(n)"), [[0]])
        self.assertEqual((self.set / 'corpus/source.md').read_bytes(), source_bytes)

    def audit_wrapper(self, injection=''):
        # A source or store open would turn the expected named stop into a failure.
        return "import sys,runpy,importlib.abc\n" + "blocked=" + repr([str(self.set / 'corpus'), str(self.store)]) + "\ndef audit(event,args):\n if event=='open' and isinstance(args[0],(str,bytes)) and any(str(args[0]).startswith(p) for p in blocked): raise AssertionError('source or compiled access before stop')\nsys.addaudithook(audit)\n" + injection + "\nsys.argv=sys.argv[1:];runpy.run_path(sys.argv[0],run_name='__main__')"

    def test_missing_engine_before_source_and_store(self):
        injection = "class Block(importlib.abc.MetaPathFinder):\n def find_spec(self,name,path=None,target=None):\n  if name=='ladybug': raise ModuleNotFoundError('blocked engine')\nsys.meta_path.insert(0,Block())\n"
        run = self.run_cli('ingest', '--set', str(self.set), '--store', str(self.store), '--extraction', str(self.set / 'absent.json'), code=1, wrapper=self.audit_wrapper(injection), interpreter=VENV)
        self.assertIn('missing-engine: ladybug', run.stderr)
        self.assertFalse(self.store.exists())

    def test_missing_weights_before_source_and_store_even_install(self):
        self.recipe(retrieval='embedding', embedding_file='not-present.onnx')
        run = self.run_cli('recall', '--set', str(self.set), '--store', str(self.store), '--query', 'rest', '--install', code=1, wrapper=self.audit_wrapper(), interpreter=VENV)
        self.assertIn('missing-weights', run.stderr)
        self.assertFalse(self.store.exists())

    def test_cognee_injected_transitive_and_preloaded(self):
        for injection in ("class Inject(importlib.abc.MetaPathFinder):\n def find_spec(self,name,path=None,target=None):\n  if name=='ladybug': __import__('cognee')\nsys.meta_path.insert(0,Inject())\n", "sys.modules['cognee']=object()\n"):
            run = self.run_cli('ingest', '--set', str(self.set), '--store', str(self.store), '--extraction', str(self.set / 'absent.json'), code=1, wrapper=self.audit_wrapper(injection), interpreter=VENV)
            self.assertIn('refused-import: cognee', run.stderr)
            self.assertFalse(self.store.exists())

    def test_graph_databased_only_commands(self):
        commands = [('bootstrap', []), ('review-pass', []), ('promote', ['--from-canon']), ('mark-stale', ['--id','absent']), ('healthcheck', []), ('forget', ['--memory-only'])]
        for cmd, args in commands:
            run = self.run_cli(cmd, '--set', str(self.set), '--store', str(self.store), *args, code=1, wrapper=self.audit_wrapper(), interpreter=VENV)
            self.assertIn('databased-only', run.stderr)
            self.assertFalse(self.store.exists())

    def test_embedding_paraphrase_items_and_match_override(self):
        self.seed(extras=True)
        self.recipe(retrieval='embedding')
        result = json.loads(self.recall('How can I regain stamina by sleeping?').stdout)
        self.assertNotIn('answer', result)
        self.assertEqual(len(result['items']), 3)
        self.assertIn(result['items'][0]['name'], ('Rest', 'Recovery'))
        self.assertEqual([n['rank'] for n in result['items']], [1,2,3])
        self.assertTrue(all(set(n) == {'name','quote','source_path','score','rank'} for n in result['items']))
        limited = json.loads(self.run_cli('recall','--set',str(self.set),'--store',str(self.store),'--query','Rest','--top-k','1').stdout)
        self.assertEqual(len(limited['items']), 1)
        self.recipe(embedding_file='not-present.onnx')
        self.assertEqual(json.loads(self.recall('  mAtCh (n:Idea) RETURN n').stdout)['retrieval'], 'cypher')

    def add_source(self, stem, text, ideas, code=0):
        """Chunk and ingest one more source into the set, with the nodes it declares.

        A second source is what makes a repeated node name possible at all, and every
        provenance claim below is about what happens when one arrives.
        """
        (self.set / ('corpus/%s.md' % stem)).write_text(text)
        self.run_cli('chunk', '--set', str(self.set))
        manifest = json.loads((self.set / ('extraction/%s.chunks.json' % stem)).read_text())
        spec = importlib.util.spec_from_file_location('graph_test_shapes', SCRIPT)
        km = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(km)
        arrays = {key: [] for key in km.ARRAYS}
        arrays['ideas'] = ideas
        chunk = manifest['chunks'][0]
        path = self.set / ('extraction/%s.extraction.json' % stem)
        path.write_text(json.dumps(dict(
            schema='extraction/0.1.0', dataset=manifest['dataset'],
            source_path='corpus/%s.md' % stem, source_hash=manifest['source_hash'],
            pack='general', pack_version=km.pack_hash(TOOL / 'packs/general'),
            entries=[dict(chunk_index=0, chunk_hash=chunk['chunk_hash'],
                          extracted_on='2026-09-14', **arrays)])))
        return self.run_cli('ingest', '--set', str(self.set), '--store', str(self.store),
                            '--extraction', str(path), code=code)

    def test_a_repeated_node_keeps_every_source_and_recall_names_the_reaching_one(self):
        """A node whose name a later source repeats carries every source's located quote.

        The complaint this repairs is an item reached through one source presenting
        another source's quote as its own, so the claim under test is not that both are
        stored. It is that **the pair shown belongs to the passage the item was reached
        through**. Storing both and still showing the first satisfies a weaker test and
        none of the reading that asked for this.
        """
        self.seed(embedded=True)
        report = json.loads(self.add_source(
            'second', 'Rest is also the absence of demand. Quiet supports focus.\n',
            [dict(name='Rest', definition='A pause that replenishes stamina.',
                  status='Canonical', quote='Rest is also the absence of demand.')]).stdout)
        # The node is still not re-created, so the shipped counter keeps its meaning.
        self.assertEqual(report['nodes_inserted'], 0)
        self.assertEqual(report['nodes_skipped_by_name'], 1)

        held = self.raw("MATCH (n:Idea) WHERE n.name='Rest' RETURN n.quotes, n.source_paths")
        self.assertEqual(held, [[['Rest restores energy.', 'Rest is also the absence of demand.'],
                                 ['corpus/source.md', 'corpus/second.md']]])
        # The first source's pair is still on the scalar columns, so anything reading the
        # old shape reads what it read before.
        self.assertEqual(self.raw("MATCH (n:Idea) WHERE n.name='Rest' RETURN n.quote, n.source_path"),
                         [['Rest restores energy.', 'corpus/source.md']])

        def idea_item(query):
            items = json.loads(self.recall(query).stdout)['items']
            found = [i for i in items if i.get('part') == 'idea' and i['name'] == 'Rest']
            self.assertTrue(found, 'Rest was not reached at all by %r' % query)
            return found[0]

        through_second = idea_item('the absence of demand and quiet focus')
        through_first = idea_item('restoring energy and supporting recovery')
        self.assertEqual((through_second['quote'], through_second['source_path']),
                         ('Rest is also the absence of demand.', 'corpus/second.md'))
        self.assertEqual((through_first['quote'], through_first['source_path']),
                         ('Rest restores energy.', 'corpus/source.md'))
        # The two readings must differ, or the assertions above would both hold on a tool
        # that ignored the reaching passage entirely and always returned the first source.
        self.assertNotEqual(through_second['source_path'], through_first['source_path'])

    def old_shape(self, label, drops, empty=False):
        """An independent copy of the store with exactly the named columns removed.

        One copy per arm, so each arm removes one thing and the others stay intact. A
        single store mutated in place can only ever test the columns in the order they
        were dropped, which is how an Idea-only probe survives a suite that drops
        `Idea.quotes` first.
        """
        source, target = self.store.parent, self.root / label
        shutil.copytree(source, target)
        store, keep = target / self.store.name, self.store
        self.store = store
        try:
            for table, column in drops:
                self.raw('ALTER TABLE %s DROP %s' % (table, column))
            if empty:
                for table in ('Idea', 'Entity'):
                    self.raw('MATCH (n:%s) DETACH DELETE n' % table)
                self.assertEqual(self.raw('MATCH (n:Idea) RETURN count(n)'), [[0]])
        finally:
            self.store = keep
        return store

    def test_a_store_without_the_provenance_lists_is_refused_on_every_path_that_reads_them(self):
        """A store built before the change is refused wherever the new columns are read.

        A refusal put on one path is not a refusal. `three_part` and `select_path` both
        funnel through `attach`, whose query reads the two new columns, so guarding
        ingest alone leaves an existing user's very next recall dying with an engine
        error naming an internal column.

        **And a refusal that fires on everything is a broken ingest, not a refusal**, so
        the controls run first and the two paths that read neither column, MATCH and a
        store with no passages, are asserted to keep working rather than assumed to.
        """
        self.seed(embedded=True)
        extraction = None
        later = ('second', 'Rest is also the absence of demand. Quiet supports focus.\n',
                 [dict(name='Rest', definition='A pause that replenishes stamina.',
                       status='Canonical', quote='Rest is also the absence of demand.')])

        # CONTROL, first: the store as the shipped tool builds it is refused on neither
        # path. Asserting only that the old shape is refused is satisfied by a tool that
        # refuses every store.
        self.add_source(*later)
        extraction = self.set / 'extraction/second.extraction.json'
        self.assertTrue(json.loads(self.recall('rest and recovery').stdout)['items'])
        passage = self.raw("MATCH (p:Passage) RETURN p.name ORDER BY p.name LIMIT 1")[0][0]
        selection = self.root / 'selection.json'
        selection.write_text(json.dumps([dict(name=passage)]))

        def ingest_into(store, code=0):
            return self.run_cli('ingest', '--set', str(self.set), '--store', str(store),
                                '--extraction', str(extraction), code=code)

        def recall_on(store, extra=(), code=0):
            return self.run_cli('recall', '--set', str(self.set), '--store', str(store),
                                '--query', 'rest and recovery', *extra, code=code)

        # **Each column, on each table, removed on its own.** Dropping `Idea.quotes` first
        # and then everything is satisfied by a probe that only ever looks at `Idea`, which
        # is the regression an earlier round already shipped once.
        for table in ('Idea', 'Entity'):
            for column in ('quotes', 'source_paths'):
                label = 'missing-%s-%s' % (table.lower(), column)
                store = self.old_shape(label, [(table, column)])
                self.assertIn('provenance-shape-mismatch', ingest_into(store, code=1).stderr,
                              'ingest accepted a store missing %s.%s' % (table, column))
                self.assertIn('provenance-shape-mismatch', recall_on(store, code=1).stderr,
                              'recall accepted a store missing %s.%s' % (table, column))

        # The full old shape, and every door into it.
        every = [(t, c) for t in ('Idea', 'Entity') for c in ('quotes', 'source_paths')]
        old = self.old_shape('old-shape', every)
        ingest = ingest_into(old, code=1)
        ranked = recall_on(old, code=1)
        selected = recall_on(old, extra=('--select', str(selection)), code=1)
        for run in (ingest, ranked, selected):
            self.assertIn('provenance-shape-mismatch', run.stderr)
            self.assertIn('Rebuild the set by re-ingesting its sources into a new store',
                          run.stderr)
            # The failure the review reproduced: an engine error instead of the repair.
            self.assertNotIn('Cannot find property', run.stderr)

        # **Zero nodes is not an absent schema.** The guard used to read
        # `node_count(conn) and not has_provenance_lists(conn)`, so an old-shape store
        # someone had emptied passed it, `CREATE NODE TABLE IF NOT EXISTS` preserved the
        # old tables, and ingest died inside the transaction on the missing column.
        emptied = self.old_shape('old-shape-emptied', every, empty=True)
        self.assertIn('provenance-shape-mismatch', ingest_into(emptied, code=1).stderr)

        # CONTROL: the two paths that read neither new column are not refused and are not
        # harmed. A guard that fired here would break stores this change never touched.
        match = recall_on(old, extra=(), code=1)  # ranked path, refused above
        self.assertEqual(json.loads(self.run_cli(
            'recall', '--set', str(self.set), '--store', str(old),
            '--query', "MATCH (n:Idea) WHERE n.name='Rest' RETURN n.name,n.quote,n.source_path"
        ).stdout)['items'][0]['name'], 'Rest')

        # CONTROL: a fresh store with no node tables at all is not an old store.
        fresh = self.root / 'fresh/graph.lbdb'
        ingest_into(fresh)
        self.assertTrue(fresh.is_file())

    def spy_top_k(self, *args):
        """Run one recall and return the `top_k` each wrapped path was called with.

        Two of the four call sites are function calls and two are an inline slice, so
        the argument is recorded where there is a boundary and the count is read where
        there is not. Recording is not a substitute for the counts below it: a spy says
        what a path was handed, never what the path then did with it.
        """
        record = self.root / 'top-k-seen.json'
        wrapper = (
            "import runpy,sys,json\n"
            "m=runpy.run_path(sys.argv[1]); r=m['runtime_module']()\n"
            "seen={}\n"
            "def spy(label, fn, index):\n"
            " def wrapped(*a, **k):\n"
            "  seen[label]=a[index]\n"
            "  return fn(*a, **k)\n"
            " return wrapped\n"
            "r.three_part=spy('three_part', r.three_part, 3)\n"
            "r.embed_items=spy('embed_items', r.embed_items, 3)\n"
            "r.select_path=spy('select_path', r.select_path, 2)\n"
            "try:\n"
            " m['main'](sys.argv[2:])\n"
            "finally:\n"
            " open(" + repr(str(record)) + ",'w').write(json.dumps(seen))\n")
        self.run_cli(*args, wrapper=wrapper, interpreter=VENV)
        return json.loads(record.read_text())

    def test_default_top_k_splits_and_a_flag_governs_every_path(self):
        """The default splits between the passage pool and the other paths; a flag does not.

        One `top_k` is derived in `recall` and spent on four call sites. The passage
        candidate pool is the only one any figure was measured on, so it is the only
        default that moves: a value chosen on passage-ranking evidence does not get to
        move paths that evidence says nothing about. An explicit `--top-k` is the
        caller's own choice and still governs every path, so the two defaults cannot
        diverge under a flag.
        """
        self.seed(many=20)
        self.assertEqual(self.raw("MATCH (n:Idea) RETURN count(n)"), [[22]])

        # The MATCH path slices inline, so it is read off the count. 22 nodes match and
        # an unflagged call returns 15 of them; the flag takes all 22.
        match = "MATCH (n:Idea) RETURN n.name,n.quote,n.source_path"
        self.assertEqual(len(json.loads(self.recall(match).stdout)['items']), 15)
        self.assertEqual(len(json.loads(self.recall(match, extra=('--top-k', '22')).stdout)['items']), 22)

        # Legacy node retrieval: a store ingested before passages, which is what every
        # store built on `retrieval: lexical` is. Same reading, same two values.
        self.recipe(retrieval='embedding')
        legacy = self.spy_top_k('recall', '--set', str(self.set), '--store', str(self.store),
                                '--query', 'Rest')
        # There is no Passage table at all on such a store, not an empty one, which is
        # why `has_passages` probes rather than counts. That the pool was never reached
        # is asserted here and not inferred from the value beside it.
        self.assertNotIn('three_part', legacy)
        self.assertEqual(legacy['embed_items'], 15)
        flagged = self.spy_top_k('recall', '--set', str(self.set), '--store', str(self.store),
                                 '--query', 'Rest', '--top-k', '40')
        self.assertEqual(flagged['embed_items'], 40)

        # The passage candidate pool, on a store that actually holds passages. This is
        # the one default that moves, and the only one any measurement reached.
        self.store = self.root / 'passaged/graph.lbdb'
        # The directory keeps the recipe's own `set` name: the shipped probe refuses a
        # set directory not named for its recipe, so a second fixture is a second
        # parent, never a second name.
        self.set = self.root / 'second/fixture'
        (self.set / 'corpus').mkdir(parents=True)
        (self.set / 'set.yaml').write_text((self.root / 'fixture/set.yaml').read_text())
        self.seed(embedded=True, long=True)
        self.assertGreater(self.raw("MATCH (p:Passage) RETURN count(p)")[0][0], 0)
        pooled = self.spy_top_k('recall', '--set', str(self.set), '--store', str(self.store),
                                '--query', 'Rest')
        self.assertNotIn('embed_items', pooled)
        self.assertEqual(pooled['three_part'], 25)
        pooled_flag = self.spy_top_k('recall', '--set', str(self.set), '--store', str(self.store),
                                     '--query', 'Rest', '--top-k', '40')
        self.assertEqual(pooled_flag['three_part'], 40)

        # The selection path is unaffected, which is a claim and is therefore asserted
        # rather than left in a note: it spends the unsplit default either way, so a
        # caller that hand-wrote a longer selection gets exactly what it got before.
        name = self.raw("MATCH (p:Passage) RETURN p.name ORDER BY p.name LIMIT 1")[0][0]
        selection = self.root / 'selection.json'
        selection.write_text(json.dumps([dict(name=name)]))
        selected = self.spy_top_k('recall', '--set', str(self.set), '--store', str(self.store),
                                  '--query', 'Rest', '--select', str(selection))
        self.assertEqual(selected['select_path'], 15)
        selected_flag = self.spy_top_k('recall', '--set', str(self.set), '--store', str(self.store),
                                       '--query', 'Rest', '--select', str(selection),
                                       '--top-k', '40')
        self.assertEqual(selected_flag['select_path'], 40)

    def test_recipe_and_consent_without_packages(self):
        for value in ('../bad.onnx', 'a/b.onnx', 'a\\\\b.onnx', '""'):
            self.recipe(embedding_file=value)
            self.assertIn('embedding_file', self.run_cli('chunk','--set',str(self.set),code=1).stderr)
        self.recipe(embedding_file='absent.onnx', backend='databased', retrieval='embedding')
        self.assertIn('invalid recipe retrieval: embedding', self.run_cli('chunk','--set',str(self.set),code=1).stderr)
        wrapper = "import runpy,sys; m=runpy.run_path(sys.argv[1]); r=m['runtime_module'](); r.CACHE=r.Path(" + repr(str(self.root / 'empty-venv')) + ");r.plugin_root=lambda:None\ntry:r.ensure_runtime()\nexcept RuntimeError as e:print(e,file=sys.stderr);sys.exit(1)"
        run = self.run_cli(code=1, wrapper=wrapper, interpreter=VENV)
        for text in ('missing-engine: ladybug','--install','pypi.org','files.pythonhosted.org','ladybug==0.20.4','onnxruntime==1.30.0','tokenizers==0.23.2'):
            self.assertIn(text, run.stderr)
        self.assertFalse((self.root / 'empty-venv').exists())

    def test_interrupted_ingest_rolls_back(self):
        self.seed()
        before = self.raw('MATCH (n) RETURN count(n)')
        source = self.set / 'corpus/source.md'
        corpus_before = source.read_bytes()
        extraction = json.loads(self.extraction.read_text())
        extraction['entries'][0]['ideas'][0]['name'] = 'Interrupted'
        self.extraction.write_text(json.dumps(extraction))
        wrapper = "import runpy,sys; m=runpy.run_path(sys.argv[1]); r=m['runtime_module'](); original=r.execute\ndef interrupt(conn,query,params=None):\n result=original(conn,query,params)\n if isinstance(query,str) and query.startswith('CREATE (n:Idea'): raise RuntimeError('test interruption after node insert')\n return result\nr.execute=interrupt\ntry:m['main'](sys.argv[2:])\nexcept Exception as e:print(e,file=sys.stderr);sys.exit(1)"
        run = self.run_cli('ingest','--set',str(self.set),'--store',str(self.store),'--extraction',str(self.extraction),code=1,wrapper=wrapper,interpreter=VENV)
        self.assertIn('test interruption', run.stderr)
        self.assertEqual(self.raw('MATCH (n) RETURN count(n)'), before)
        self.assertEqual(self.raw("MATCH (n:Idea) WHERE n.name='Interrupted' RETURN count(n)"), [[0]])
        self.assertEqual(source.read_bytes(), corpus_before)

    def test_install_contract_with_fake_installer(self):
        # Verify exact installer argv, marker and cache settings without pip/network.
        wrapper = "import runpy,sys,json; m=runpy.run_path(sys.argv[1]); r=m['runtime_module'](); root=r.Path(" + repr(str(self.root / 'plugin')) + "); root.mkdir(); r.CACHE=root/'tool/.venv'; r.plugin_root=lambda:root; calls=[]\nclass Result: returncode=0\ndef fake(args,**kwargs):\n calls.append(dict(args=args,env={k:kwargs['env'][k] for k in ('PIP_NO_CACHE_DIR','PIP_CACHE_DIR','XDG_CACHE_HOME')}));return Result()\nr.subprocess.run=fake\nr.install_packages(True)\nprint(json.dumps(dict(calls=calls,marker=json.loads((root/'.wiser-consent').read_text()))))"
        result = json.loads(self.run_cli(wrapper=wrapper,interpreter=VENV).stdout)
        calls = result['calls']
        self.assertEqual(len(calls), 3)
        self.assertEqual(calls[1]['args'][-2:], ['ladybug==0.20.4','onnxruntime==1.30.0'])
        self.assertEqual(calls[2]['args'][-2:], ['--no-deps','tokenizers==0.23.2'])
        for call in calls[1:]:
            self.assertIn('--no-cache-dir', call['args'])
            self.assertIn('--disable-pip-version-check', call['args'])
        self.assertTrue(all(c['env']['PIP_NO_CACHE_DIR']=='1' for c in calls))
        self.assertTrue(all('/tool/.venv/' in c['env']['PIP_CACHE_DIR'] for c in calls))
        self.assertEqual(result['marker']['tool'], 'knowledge-memory')
        self.assertEqual(result['marker']['realpath'], str(self.root / 'plugin'))
        self.assertNotIn('huggingface', json.dumps(calls))

    def test_check_does_not_write_consent(self):
        marker = TOOL.parents[1] / '.wiser-consent'
        before = marker.read_bytes() if marker.exists() else None
        report = json.loads(self.run_cli('check').stdout)
        self.assertTrue(all(report['graph_packages'].values()))
        self.assertEqual(marker.read_bytes() if marker.exists() else None, before)
        # Unknown flags win over installation, and --install remains a bare flag.
        self.assertIn('--env', self.run_cli('check','--install','--env',code=1).stderr)
        self.assertIn('unknown option', self.run_cli('check','--install=true',code=1).stderr)
        self.assertEqual(marker.read_bytes() if marker.exists() else None, before)

    def test_stdlib_paths_never_import_ladybug(self):
        injection = "class Block(importlib.abc.MetaPathFinder):\n def find_spec(self,name,path=None,target=None):\n  if name in ('ladybug','onnxruntime','tokenizers','numpy'): raise AssertionError('native import on stdlib path')\nsys.meta_path.insert(0,Block())\n"
        wrapper = "import sys,runpy,importlib.abc\n" + injection + "sys.argv=sys.argv[1:];runpy.run_path(sys.argv[0],run_name='__main__')"
        self.run_cli('check', wrapper=wrapper)
        self.run_cli('chunk','--set',str(self.set),wrapper=wrapper)
        self.recipe(backend='databased')
        self.run_cli('bootstrap','--store',str(self.root/'stdlib.sqlite'),wrapper=wrapper)

    def test_passage_ingest_on_embedding_recipe(self):
        report = self.seed(embedded=True, extras=True)
        self.assertGreater(report['passages_inserted'], 0)
        self.assertGreater(report['located_in_edges'], 0)
        self.assertEqual(self.raw('MATCH (n:Passage) RETURN count(n)')[0][0], report['passages_inserted'])
        self.assertEqual(self.raw('MATCH ()-[r:LOCATED_IN]->() RETURN count(r)')[0][0], report['located_in_edges'])
        self.assertGreater(self.raw('MATCH (a:Idea)-[r:LOCATED_IN]->(p:Passage) RETURN count(r)')[0][0], 0)
        self.assertGreater(self.raw('MATCH (a:Entity)-[r:LOCATED_IN]->(p:Passage) RETURN count(r)')[0][0], 0)
        self.assertEqual(self.raw("MATCH (n:Passage) WHERE n.status='Candidate' RETURN count(n)")[0][0],
                         report['passages_inserted'])

    def test_cypher_only_recipe_stores_no_passages(self):
        report = self.seed()
        self.assertEqual(report['passages_inserted'], 0)
        self.assertEqual(report['located_in_edges'], 0)
        self.assertEqual(report.get('passage_spans_unlocatable', 0), 0)
        code = "import importlib,json,sys; e=importlib.import_module('ladybug'); d=e.Database(sys.argv[1],buffer_pool_size=64*1024*1024,max_num_threads=1); c=e.Connection(d); r=c.execute(sys.argv[2]); print(json.dumps(r.get_all())); r.close(); c.close(); d.close()"
        run = subprocess.run([str(VENV), '-B', '-c', code, str(self.store), 'MATCH (n:Passage) RETURN count(n)'],
                             env=self.env, capture_output=True, text=True)
        self.assertTrue(run.returncode != 0 or json.loads(run.stdout) == [[0]], run.stderr)

    def test_three_labelled_parts(self):
        self.seed(embedded=True, extras=True)
        result = json.loads(self.recall('How can I regain stamina by sleeping?').stdout)
        self.assertNotIn('answer', result)
        self.assertIn('parts', result)
        items = result['items']
        self.assertTrue(items)
        self.assertEqual(items[0]['part'], 'passage')
        labels = {n['part'] for n in items}
        self.assertTrue({'passage', 'idea', 'related'} <= labels)
        related = [n for n in items if n['part'] == 'related']
        self.assertTrue(related)
        self.assertTrue(all('relation' in n and 'direction' in n and 'via' in n for n in related))
        self.assertTrue(all('answer' not in n for n in items))

    def test_select_named_passages_order_and_missing_name(self):
        self.seed(embedded=True, extras=True, long=True)
        ranked = json.loads(self.recall('Rest recovery sleep roads').stdout)
        passages = [n for n in ranked['items'] if n['part'] == 'passage']
        self.assertGreaterEqual(len(passages), 2)
        chosen = [dict(name=passages[1]['name'], score=passages[1]['score'], rank=passages[1]['rank']),
                  dict(name=passages[0]['name'], score=passages[0]['score'], rank=passages[0]['rank'])]
        select = self.root / 'chosen.json'
        select.write_text(json.dumps(chosen))
        result = json.loads(self.recall('Rest recovery sleep roads', extra=('--select', str(select))).stdout)
        selected_passages = [n for n in result['items'] if n['part'] == 'passage']
        self.assertEqual([n['name'] for n in selected_passages], [chosen[0]['name'], chosen[1]['name']])
        self.assertEqual(result['selected'], [chosen[0]['name'], chosen[1]['name']])
        self.assertEqual(selected_passages[0]['rank'], 1)
        self.assertEqual(selected_passages[0]['candidate_rank'], chosen[0]['rank'])
        missing = self.root / 'missing.json'
        missing.write_text(json.dumps([dict(name='passage-9999', score=0.1, rank=1)]))
        run = self.recall('Rest recovery sleep roads', code=1, extra=('--select', str(missing)))
        self.assertIn('select:', run.stderr)
        self.assertEqual(run.stdout, '')

    def test_inline_select_matches_file_and_creates_no_file(self):
        self.seed(embedded=True, extras=True, long=True)
        query = 'Rest recovery sleep roads'
        ranked = json.loads(self.recall(query).stdout)
        passages = [n for n in ranked['items'] if n['part'] == 'passage']
        self.assertGreaterEqual(len(passages), 2)
        payload = [dict(name=passages[1]['name'], score=passages[1]['score'], rank=passages[1]['rank']),
                   dict(name=passages[0]['name'], score=passages[0]['score'], rank=passages[0]['rank'])]
        select = self.root / 'chosen.json'
        select.write_text(json.dumps(payload))
        from_file = json.loads(self.recall(query, extra=('--select', str(select))).stdout)
        before_json = sorted(p for p in self.root.rglob('*.json') if p.is_file())
        from_inline = json.loads(self.recall(query, extra=('--select', json.dumps(payload))).stdout)
        self.assertEqual(sorted(p for p in self.root.rglob('*.json') if p.is_file()), before_json)
        self.assertEqual(len(from_inline['items']), len(from_file['items']))
        for left, right in zip(from_file['items'], from_inline['items']):
            self.assertEqual(left, right)
        self.assertEqual(from_file.get('selected'), from_inline.get('selected'))
        padded = '  ' + json.dumps(payload)
        from_padded = json.loads(self.recall(query, extra=('--select', padded)).stdout)
        for left, right in zip(from_file['items'], from_padded['items']):
            self.assertEqual(left, right)

    def test_inline_select_malformed_empty_and_path_fallback(self):
        self.seed(embedded=True, extras=True, long=True)
        query = 'Rest recovery sleep roads'
        message = 'select: expected a JSON list of objects each carrying a name.'
        # A JSON object does not begin with `[`, so the discrimination rule treats it
        # as a path. The list-check that refuses an object is the file form's, and the
        # inline cases that do begin with `[` share that same check after json.loads.
        for payload in ('[not-json', '["passage-0001"]', '[{"score": 1}]'):
            run = self.recall(query, code=1, extra=('--select', payload))
            self.assertIn(message, run.stderr)
            self.assertEqual(run.stdout, '')
        # The object-not-list arm of the shared check: inline `{...}` never reaches it,
        # because it does not begin with `[`. The file form is how that arm still fires.
        obj = self.root / 'object.json'
        obj.write_text('{"name": "x"}')
        run = self.recall(query, code=1, extra=('--select', str(obj)))
        self.assertIn(message, run.stderr)
        self.assertEqual(run.stdout, '')
        empty = json.loads(self.recall(query, extra=('--select', '[]')).stdout)
        self.assertEqual(empty['items'], [])
        self.assertEqual(empty['selected'], [])
        missing = str(self.root / 'absent-select.json')
        run = self.recall(query, code=1, extra=('--select', missing))
        self.assertIn('--select', run.stderr)
        self.assertIn('does not exist', run.stderr)
        self.assertEqual(run.stdout, '')
        run = self.recall(query, code=1, extra=('--select', '{"name": "x"}'))
        self.assertIn('--select', run.stderr)
        self.assertNotIn(message, run.stderr)
        self.assertEqual(run.stdout, '')

    def test_select_absent_leaves_default_path_unchanged(self):
        self.seed(embedded=True, extras=True)
        query = 'How can I regain stamina by sleeping?'
        default = json.loads(self.recall(query).stdout)
        again = json.loads(self.recall(query, extra=('--install',)).stdout)
        self.assertEqual(json.dumps(default['items']), json.dumps(again['items']))
        for result in (default, again):
            self.assertNotIn('selected', result)
            self.assertNotIn('ranking', result)
        # Two runs of one implementation show determinism and nothing more. What makes the
        # default path unchanged is that it carries none of the keys the two flags add, so
        # a caller that never passes them sees exactly the shape it saw before they existed.
        for item in default['items']:
            for added in ('candidate_rank', 'vector_rank', 'lexical_rank'):
                self.assertNotIn(added, item)
        # The whole-corpus comparison against the runtime this was ported from is a control
        # in the gate that measured it; it needs that corpus and does not belong here.

    def test_rank_hybrid_and_cosine_byte_identity(self):
        self.seed(embedded=True, extras=True, long=True)
        query = 'Rest recovery sleep roads'
        omitted = json.loads(self.recall(query).stdout)
        cosine = json.loads(self.recall(query, extra=('--rank', 'cosine')).stdout)
        self.assertEqual(json.dumps(omitted['items']), json.dumps(cosine['items']))
        self.assertNotIn('ranking', omitted)
        self.assertNotIn('ranking', cosine)
        hybrid = json.loads(self.recall(query, extra=('--rank', 'hybrid')).stdout)
        self.assertEqual(hybrid['ranking'], 'hybrid')
        self.assertTrue(any(n.get('part') == 'passage' for n in hybrid['items']))
        self.assertTrue(any('vector_rank' in n or 'lexical_rank' in n for n in hybrid['items']))

    def test_rank_refused_on_match_select_and_unknown_mode(self):
        self.seed(embedded=True)
        run = self.recall('MATCH (n:Idea) RETURN n', code=1, extra=('--rank', 'hybrid'))
        self.assertIn('rank: a ranking applies to the embedding path, not to MATCH.', run.stderr)
        self.assertEqual(run.stdout, '')
        select = self.root / 'chosen.json'
        select.write_text(json.dumps([dict(name='passage-0001', score=0.5, rank=1)]))
        run = self.recall('rest', code=1, extra=('--rank', 'hybrid', '--select', str(select)))
        self.assertIn('rank: a selection already fixes the passages; --rank ranks nothing.', run.stderr)
        self.assertEqual(run.stdout, '')
        run = self.recall('rest', code=1, extra=('--rank', 'no-such-mode'))
        self.assertIn("rank: unknown mode 'no-such-mode'", run.stderr)
        self.assertEqual(run.stdout, '')

    def test_match_path_labelled_match(self):
        self.seed()
        result = json.loads(self.recall('MATCH (n:Idea) WHERE n.name=\'Rest\' RETURN n').stdout)
        self.assertEqual(result['retrieval'], 'cypher')
        self.assertTrue(result['items'])
        self.assertTrue(all(n['part'] == 'match' for n in result['items']))
        self.assertEqual(result['parts'].get('match'), len(result['items']))
        self.assertNotIn('selected', result)
        self.assertNotIn('ranking', result)

    def test_select_and_rank_refused_on_databased_recipe(self):
        self.recipe(backend='databased')
        run = self.run_cli('recall', '--set', str(self.set), '--store', str(self.store),
                           '--query', 'rest', '--select', str(self.root / 'absent.json'), code=1)
        self.assertIn('--select', run.stderr)
        self.assertIn('graph-only', run.stderr)
        self.assertEqual(run.stdout, '')
        run = self.run_cli('recall', '--set', str(self.set), '--store', str(self.store),
                           '--query', 'rest', '--rank', 'hybrid', code=1)
        self.assertIn('--rank', run.stderr)
        self.assertIn('graph-only', run.stderr)
        self.assertEqual(run.stdout, '')

    def test_store_without_passage_nodes_still_recalls(self):
        self.seed(extras=True)
        self.recipe(retrieval='embedding')
        result = json.loads(self.recall('How can I regain stamina by sleeping?').stdout)
        self.assertEqual(result['retrieval'], 'embedding')
        self.assertGreater(len(result['items']), 0)
        self.assertTrue(all(set(n) == {'name', 'quote', 'source_path', 'score', 'rank'} for n in result['items']))
        self.assertTrue(all(n['name'] in ('Rest', 'Recovery', 'Car') for n in result['items']))


    def test_reingest_is_idempotent_for_passages_and_their_edges(self):
        first = self.seed(embedded=True, extras=True, long=True)
        self.assertGreater(first['passages_inserted'], 0)
        self.assertEqual(first['passages_skipped'], 0)
        self.assertGreater(first['located_in_edges'], 0)
        before = (self.raw('MATCH (p:Passage) RETURN count(p)'),
                  self.raw('MATCH ()-[r:LOCATED_IN]->() RETURN count(r)'))
        again = json.loads(self.run_cli('ingest', '--set', str(self.set), '--store', str(self.store), '--extraction', str(self.extraction)).stdout)
        # The whole cut is recognised and none of it is written a second time. Without
        # this a retried ingest doubles the searchable corpus under fresh names.
        self.assertEqual(again['passages_inserted'], 0)
        self.assertEqual(again['passages_skipped'], first['passages_inserted'])
        self.assertEqual(again['located_in_edges'], 0)
        self.assertEqual((self.raw('MATCH (p:Passage) RETURN count(p)'),
                          self.raw('MATCH ()-[r:LOCATED_IN]->() RETURN count(r)')), before)

    def test_changed_source_is_refused_rather_than_half_replaced(self):
        self.seed(embedded=True, extras=True, long=True)
        before = self.raw('MATCH (p:Passage) RETURN count(p)')
        held = self.raw('MATCH (p:Passage) RETURN p.text ORDER BY p.name LIMIT 1')
        # The same source path with different text. Identity by span alone would skip the
        # new passage and attach this run's nodes to the old one, behind a success.
        (self.set / 'corpus/source.md').write_text(
            ('Rest renews vigour. Sleep aids recuperation. Lorries travel on roads. ') * 60 + '\n')
        self.run_cli('chunk', '--set', str(self.set))
        manifest = json.loads((self.set / 'extraction/source.chunks.json').read_text())
        extraction = json.loads(self.extraction.read_text())
        extraction['source_hash'] = manifest['source_hash']
        extraction['entries'][0]['chunk_hash'] = manifest['chunks'][0]['chunk_hash']
        for idea in extraction['entries'][0]['ideas']:
            idea['quote'] = 'Rest renews vigour.'
        extraction['entries'][0]['idea_links'] = []
        extraction['entries'][0]['entities'] = []
        self.extraction.write_text(json.dumps(extraction))
        run = self.run_cli('ingest', '--set', str(self.set), '--store', str(self.store), '--extraction', str(self.extraction), code=1)
        self.assertIn('passage-source-changed', run.stderr)
        self.assertEqual(self.raw('MATCH (p:Passage) RETURN count(p)'), before)
        self.assertEqual(self.raw('MATCH (p:Passage) RETURN p.text ORDER BY p.name LIMIT 1'), held)

    def test_lexical_ingest_into_a_passage_store_is_refused(self):
        self.seed(embedded=True, extras=True, long=True)
        before = self.raw('MATCH (n) RETURN count(n)')
        # The other direction of the same invariant: a node with no passage is unreachable
        # by embedding recall the moment the recipe goes back to embedding.
        self.recipe(retrieval='lexical')
        run = self.run_cli('ingest', '--set', str(self.set), '--store', str(self.store), '--extraction', str(self.extraction), code=1)
        self.assertIn('passage-layer-mismatch', run.stderr)
        self.assertEqual(self.raw('MATCH (n) RETURN count(n)'), before)

    def test_half_migrated_store_is_refused_not_degraded(self):
        self.seed(extras=True)
        before = self.raw('MATCH (n) RETURN count(n)')
        self.recipe(retrieval='embedding')
        run = self.run_cli('ingest', '--set', str(self.set), '--store', str(self.store), '--extraction', str(self.extraction), code=1)
        self.assertIn('passage-layer-mismatch', run.stderr)
        # Refused before any write: the node count is unmoved and no Passage table was
        # created, so the store is not left half converted by the refusal itself.
        self.assertEqual(self.raw('MATCH (n) RETURN count(n)'), before)
        probe = subprocess.run([str(VENV), '-B', '-c',
                                "import importlib,sys; e=importlib.import_module('ladybug'); "
                                "d=e.Database(sys.argv[1],buffer_pool_size=64*1024*1024,max_num_threads=1); "
                                "c=e.Connection(d); c.execute('MATCH (p:Passage) RETURN count(p)')",
                                str(self.store)], env=self.env, capture_output=True, text=True)
        self.assertNotEqual(probe.returncode, 0, 'a Passage table was created by a refused ingest')

    def test_rank_refused_where_it_ranks_nothing_whatever_its_value(self):
        self.seed(embedded=True, extras=True, long=True)
        # Supplied and inapplicable is refused by name, `cosine` included: a flag accepted
        # and ignored is indistinguishable from one that applied.
        for value in ('cosine', 'hybrid'):
            run = self.recall('  mAtCh (n:Idea) RETURN n', code=1, extra=('--rank', value))
            self.assertIn('rank:', run.stderr)
        chosen = self.root / 'chosen.json'
        items = json.loads(self.recall('rest').stdout)['items']
        names = [i['name'] for i in items if i.get('part') == 'passage'][:1]
        chosen.write_text(json.dumps([dict(name=n, score=0.5, rank=1) for n in names]))
        for value in ('cosine', 'hybrid'):
            run = self.recall('rest', code=1, extra=('--select', str(chosen), '--rank', value))
            self.assertIn('rank:', run.stderr)

    def test_rank_refused_on_a_store_holding_no_passages(self):
        self.seed(extras=True)
        self.recipe(retrieval='embedding')
        run = self.recall('How can I regain stamina by sleeping?', code=1, extra=('--rank', 'hybrid'))
        self.assertIn('rank:', run.stderr)
        self.assertIn('no passages', run.stderr)
        # And the same call without the flag still answers from the nodes.
        result = json.loads(self.recall('How can I regain stamina by sleeping?').stdout)
        self.assertTrue(result['items'])
        self.assertNotIn('ranking', result)

    def test_candidates_only_trims_parts_and_leaves_passages_identical(self):
        self.seed(embedded=True, extras=True, long=True)
        query = 'Rest recovery sleep roads'
        default = json.loads(self.recall(query).stdout)
        flagged = json.loads(self.recall(query, extra=('--candidates-only',)).stdout)
        labels = {n['part'] for n in default['items']}
        self.assertTrue({'passage', 'idea', 'related'} <= labels)
        default_passages = [n for n in default['items'] if n['part'] == 'passage']
        self.assertTrue(default_passages)
        self.assertGreater(len(default['items']), len(default_passages))
        self.assertNotIn('candidates_only', default)
        self.assertEqual(flagged['candidates_only'], True)
        self.assertEqual(set(flagged['parts']), {'passage'})
        self.assertEqual(flagged['parts']['passage'], len(default_passages))
        self.assertEqual(len(flagged['items']), len(default_passages))
        self.assertTrue(all(n['part'] == 'passage' for n in flagged['items']))
        for left, right in zip(default_passages, flagged['items']):
            self.assertEqual(left, right)
        self.assertEqual([n['rank'] for n in flagged['items']],
                         list(range(1, len(flagged['items']) + 1)))
        # The flag must not skip attach: a store the default path refuses is refused here too.
        every = [(t, c) for t in ('Idea', 'Entity') for c in ('quotes', 'source_paths')]
        old = self.old_shape('old-shape-candidates', every)
        run = self.run_cli('recall', '--set', str(self.set), '--store', str(old),
                           '--query', query, '--candidates-only', code=1)
        self.assertIn('provenance-shape-mismatch', run.stderr)
        self.assertEqual(run.stdout, '')

    def test_candidates_only_refused_on_match_select_and_databased(self):
        self.seed(embedded=True, extras=True, long=True)
        run = self.recall('MATCH (n:Idea) RETURN n', code=1, extra=('--candidates-only',))
        self.assertIn('candidates-only:', run.stderr)
        self.assertIn('MATCH', run.stderr)
        self.assertEqual(run.stdout, '')
        select = self.root / 'chosen.json'
        select.write_text(json.dumps([dict(name='passage-0001', score=0.5, rank=1)]))
        run = self.recall('rest', code=1, extra=('--candidates-only', '--select', str(select)))
        self.assertIn('candidates-only:', run.stderr)
        self.assertIn('selection', run.stderr)
        self.assertEqual(run.stdout, '')
        self.recipe(backend='databased', retrieval='lexical')
        run = self.run_cli('recall', '--set', str(self.set), '--store', str(self.store),
                           '--query', 'rest', '--candidates-only', code=1)
        self.assertIn('--candidates-only', run.stderr)
        self.assertIn('graph-only', run.stderr)
        self.assertEqual(run.stdout, '')

    def test_candidates_only_refused_on_a_store_holding_no_passages(self):
        self.seed(extras=True)
        self.recipe(retrieval='embedding')
        run = self.recall('How can I regain stamina by sleeping?', code=1,
                          extra=('--candidates-only',))
        self.assertIn('candidates-only:', run.stderr)
        self.assertIn('no passages', run.stderr)
        self.assertEqual(run.stdout, '')
        result = json.loads(self.recall('How can I regain stamina by sleeping?').stdout)
        self.assertTrue(result['items'])
        self.assertNotIn('candidates_only', result)

    def test_embedding_ingest_stops_before_source_when_weights_absent(self):
        self.seed(extras=True)
        store_before = self.store.read_bytes()
        self.recipe(retrieval='embedding', embedding_file='not-present.onnx')
        # The audit hook fails the run if the corpus or the store is opened at all, so this
        # proves the stop precedes source access rather than merely preceding the write.
        run = self.run_cli('ingest', '--set', str(self.set), '--store', str(self.store), '--extraction', str(self.extraction), code=1, wrapper=self.audit_wrapper(), interpreter=VENV)
        self.assertIn('missing-weights', run.stderr)
        # The audit hook watches this store and this corpus, so the run is failed if either
        # is opened at all. The store exists because the seed ingest created it, so what is
        # asserted is that this refused run left it untouched.
        self.assertEqual(self.store.read_bytes(), store_before)

    def test_hybrid_is_an_interleave_and_rrf_is_not(self):
        # The CLI test above proves the wiring; this proves the merge is the one declared.
        # A hybrid that simply decorated the cosine order with metadata would pass that
        # test and fail this one.
        spec = importlib.util.spec_from_file_location('rank_passages_under_test', TOOL / 'scripts/rank_passages.py')
        rank_passages = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(rank_passages)
        texts = ['alpha alpha alpha', 'beta beta', 'gamma', 'delta', 'epsilon']
        lexical = rank_passages.Lexical(texts)
        # Cosine and lexical disagree completely: cosine likes the last, lexical the first.
        cosine_of = lambda _text: [0.1, 0.2, 0.3, 0.4, 0.5]
        order, detail = rank_passages.rank('hybrid', 'alpha', cosine_of, lexical, 4)
        vector = rank_passages.order_of(cosine_of('alpha'))
        lex = rank_passages.order_of(lexical.scores('alpha'))
        self.assertEqual(order, rank_passages.interleave([vector, lex], 4))
        self.assertNotEqual(order, vector[:4], 'hybrid returned the cosine order unchanged')
        self.assertEqual(order[0], vector[0], 'the interleave takes the vector ranking first')
        self.assertEqual(order[1], lex[0], 'the interleave takes the lexical ranking second')
        rrf_order, _ = rank_passages.rank('hybrid-rrf', 'alpha', cosine_of, lexical, 4)
        self.assertNotEqual(rrf_order, order, 'the consensus merge is not the interleave')
        self.assertTrue(all('vector_rank' in d for d in detail.values()))


    def related_of(self, items, name):
        return [i for i in items if i.get('part') == 'related' and i.get('via') == name]

    def test_an_attached_entity_keeps_its_incoming_relations(self):
        self.seed(embedded=True, extras=True, long=True)
        # `Car` is an Entity and the fixture points six typed relations at it from `Rest`.
        # A relation runs from an Idea to an Idea or an Entity, so an Entity is only ever a
        # target: a traversal that requires the attached node to be an Idea in both
        # directions finds nothing at all for it.
        found = None
        for query in ('Vehicles travel on roads', 'roads transport vehicles', 'Car'):
            items = json.loads(self.recall(query).stdout)['items']
            if any(i.get('part') == 'idea' and i['name'] == 'Car' for i in items):
                found = items
                break
        self.assertIsNotNone(found, 'no recall attached the Entity Car; fixture cannot test this')
        incoming = self.related_of(found, 'Car')
        self.assertTrue(incoming, 'an attached Entity returned no related items at all')
        self.assertTrue(all(i['direction'] == 'in' for i in incoming),
                        'an Entity is never a relation source')
        self.assertEqual({i['name'] for i in incoming}, {'Rest'})
        self.assertTrue({i['relation'] for i in incoming} <= set(
            'EXEMPLIFIES DEPENDS_ON CONTRADICTS SPECIALIZES DECIDED_IN APPLIES_TO'.split()))

    def test_an_ambiguous_endpoint_is_unresolved_rather_than_guessed(self):
        # The one-hop traversal is keyed on (table, name), because an Idea and an Entity
        # may carry the same name and matching on the name alone would give each the
        # other's relations. **That collision cannot arise through ingest**, and this is
        # why: an edge whose target name matches in both tables is counted unresolved and
        # no edge is written. Asserted rather than assumed, because the traversal fix is
        # only load-bearing for a store built some other way.
        report = self.seed(embedded=True, extras=True, long=True, collide=True)
        self.assertGreater(report['unresolved_links'], 0,
                           'an ambiguous endpoint was resolved rather than counted')
        rows = self.raw("MATCH (a)-[r]->(b) WHERE b.name='Car' RETURN label(a), label(b)")
        for a_label, b_label in rows:
            self.assertNotEqual(b_label, 'Idea',
                                'an edge was written to the colliding Idea named Car')


class ShippedRecallPolicy(unittest.TestCase):
    """The callers invoke the shipped retrieval policy, not just the flags that exist.

    A flag on the tool is not a policy running. Every other test here passes while an
    ordinary Knowledge Recall issues one plain `recall` and retrieves a worse candidate
    set, which is the whole failure this case exists to catch. So these assertions are
    about the skills that call the tool, and each one is run against a doctored copy of
    the same text and required to fail, because a check that cannot fail is not a check.
    """

    PLUGIN = TOOL.parents[1]

    def branch(self, path, start, end=None):
        text = (self.PLUGIN / path).read_text(encoding='utf-8')
        self.assertIn(start, text, '%s no longer contains %r' % (path, start))
        body = text.split(start, 1)[1]
        return body.split(end, 1)[0] if end and end in body else body

    def assert_policy(self, recall_branch, probe_branch):
        # The ranked candidate call names the ranking on its own call.
        self.assertIn('--rank hybrid', recall_branch)
        # The selection is carried through to a second call on the same question.
        self.assertIn('--select', recall_branch)
        # The chooser's own rules ship with it, or the step is a second reader.
        for rule in ('selecting, not answering', 'defect', 'at most three'):
            self.assertIn(rule, recall_branch)
        # The second caller runs the shipped policy rather than one plain recall.
        self.assertIn('skills/Knowledge Recall/', probe_branch)
        # Neither caller names `--top-k`, so both inherit whatever the tool defaults to
        # and keep tracking it the next time it moves. A skill that hard-codes the value
        # is a second home for it and stops tracking, which is what made the default the
        # right route rather than the flag. This is the caller half of the acceptance;
        # the tool half is test_default_top_k_splits_and_a_flag_governs_every_path, and
        # neither is sufficient alone: a default nobody inherits ships nothing, and a
        # caller that inherits the wrong default ships the wrong thing.
        for branch in (recall_branch, probe_branch):
            self.assertNotIn('--top-k', branch)
            self.assertNotIn('top_k', branch)

    def test_callers_name_the_shipped_policy(self):
        recall_branch = self.branch('skills/Knowledge Recall/SKILL.md',
                                    '**Graph.** Load', '**Hosted.**')
        probe_branch = self.branch('skills/Knowledge Set Onboarding/SKILL.md',
                                   '**Graph.** MATCH relation probes', '### Phase 8')
        self.assert_policy(recall_branch, probe_branch)

        # Proved able to fail, on the exact edit that would ship the flag without the
        # policy: the ranking dropped from the caller, and the probe returned to one
        # plain call. Neither doctored copy touches disk.
        for doctored_recall, doctored_probe in (
            (recall_branch.replace('--rank hybrid', ''), probe_branch),
            (recall_branch.replace('--select', ''), probe_branch),
            (recall_branch.replace('selecting, not answering', ''), probe_branch),
            (recall_branch, probe_branch.replace('skills/Knowledge Recall/', '')),
            # A caller that pins the window: it would keep working and stop tracking the
            # default, which is the failure the default route exists to avoid.
            (recall_branch.replace('--rank hybrid', '--rank hybrid --top-k 25'), probe_branch),
            (recall_branch, probe_branch.replace('--query "<MATCH query>"',
                                                 '--query "<MATCH query>" --top-k 25')),
        ):
            with self.assertRaises(AssertionError):
                self.assert_policy(doctored_recall, doctored_probe)


if __name__ == '__main__':
    unittest.main()
