"""Graph contract, real CLI subprocesses and disposable stores outside the tool.

Set WISER_GRAPH_TEST_WORK to a writable test workspace outside the tool. Packages
must already be installed in the real tool venv; these tests never install them.
"""
import importlib.util
import json
import os
from pathlib import Path
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

    def seed(self, foreign=False, extras=False):
        text = 'Rest restores energy. Sleep supports recovery. Vehicles travel on roads.\n'
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
        if foreign:
            arrays['ideas'][1]['name'] = 'Foreign'
        arrays['idea_links'] = [dict(source_name='Rest', relation='DEPENDS_ON', target_name=arrays['ideas'][1]['name'], quote='Sleep supports recovery.')]
        if extras:
            arrays['entities'] = [dict(name='Car', entity_type='other', summary='Road transport.', aliases=['automobile'], status='Canonical', quote='Vehicles travel on roads.')]
            arrays['facts'] = [dict(subject='Sleep', predicate='supports', object='recovery', quote='Sleep supports recovery.')]
            arrays['decisions'] = [dict(summary='Rest.', quote='Rest restores energy.')]
            arrays['open_questions'] = [dict(question='More rest?', quote='Rest restores energy.')]
            arrays['ideas'].append(dict(name='Ungrounded', definition='Absent.', status='Canonical', quote='This does not occur.'))
            arrays['idea_links'] += [dict(source_name='Rest', relation=r, target_name='Car', quote='Vehicles travel on roads.') for r in sorted(km.RELATIONS)]
        chunk = manifest['chunks'][0]
        extraction = dict(schema='extraction/0.1.0', dataset=manifest['dataset'], source_path='corpus/source.md', source_hash=manifest['source_hash'], pack='general', pack_version=km.pack_hash(TOOL / 'packs/general'), entries=[dict(chunk_index=0, chunk_hash=chunk['chunk_hash'], extracted_on='2026-09-11', **arrays)])
        self.extraction = self.set / 'extraction/source.extraction.json'
        self.extraction.write_text(json.dumps(extraction))
        return json.loads(self.run_cli('ingest', '--set', str(self.set), '--store', str(self.store), '--extraction', str(self.extraction)).stdout)

    def recall(self, query, code=0, **kw):
        return self.run_cli('recall', '--set', str(self.set), '--store', str(self.store), '--query', query, code=code, **kw)

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
        self.assertEqual(json.loads(self.recall(query).stdout)['items'], [dict(name='Recovery', quote='Sleep supports recovery.', source_path='corpus/source.md')])
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


if __name__ == '__main__':
    unittest.main()
