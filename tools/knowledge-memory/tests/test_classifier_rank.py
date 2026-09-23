"""Graph recall --rank classifier. Offline: the caller is stubbed and no gateway is started.

The fixture helpers live on test_graph_memory.GraphContract. This class uses one
of those instances rather than subclassing it, so discovering this file does not
run that suite a second time.
"""
import json
import os
import unittest

import test_graph_memory as graph_tests


class ClassifierRank(unittest.TestCase):
    def setUp(self):
        self.fx = graph_tests.GraphContract('setUp')
        try:
            self.fx.setUp()
        except Exception:
            self.fx.doCleanups()
            raise
        self.root = self.fx.root
        self.env = self.fx.env
        self.set = self.fx.set
        self.store = self.fx.store

    def tearDown(self):
        self.fx.doCleanups()

    def seed(self, *args, **kwargs):
        return self.fx.seed(*args, **kwargs)

    def recall(self, *args, **kwargs):
        return self.fx.recall(*args, **kwargs)

    def run_cli(self, *args, **kwargs):
        return self.fx.run_cli(*args, **kwargs)

    def owning_root(self):
        root = self.root / 'owning'
        root.mkdir(exist_ok=True)
        agents = root / 'AGENTS.md'
        if not agents.exists():
            agents.write_text('---\ntype: personal\n---\n\n# Owning\n')
        return root

    def gateway_home(self, attached=False):
        home = self.root / ('gateway-attached' if attached else 'gateway-empty')
        home.mkdir(exist_ok=True)
        if attached:
            status = home / 'classifier-status'
            status.mkdir(exist_ok=True)
            (home / 'classifier').mkdir(exist_ok=True)
            (status / 'claude-code.json').write_text(json.dumps({
                'attached': True,
                'classifier_dirs': [str((home / 'classifier').resolve())],
                'pid': os.getpid(),
                'started_at': '2026-09-23T00:00:00.000Z',
            }))
        return home

    def stub(self, answer):
        path = self.root / 'classifier-stub.json'
        path.write_text(json.dumps({'wiser.recall.rank': answer}))
        log = self.root / 'classifier-stub.log'
        if log.exists():
            log.unlink()
        self.env['WISER_HOOK_STUB_FILE'] = str(path)
        self.env['WISER_HOOK_STUB_LOG'] = str(log)
        return log

    def recall_classifier(self, query, home, owning, extra=(), code=0):
        args = ('--rank', 'classifier', '--owning-root', str(owning),
                '--gateway-home', str(home), *extra)
        return self.recall(query, code=code, extra=args)

    def test_items_match_hybrid_and_no_presence_is_builtin(self):
        self.seed(embedded=True, extras=True, long=True)
        query = 'Rest recovery sleep roads'
        hybrid = json.loads(self.recall(query, extra=('--rank', 'hybrid')).stdout)
        # A stub that would keep a name if a call were made. No presence, so it must not be.
        log = self.stub({'ranked': [{'id': 'not-a-passage', 'p': 0.99, 'calibrated': False}]})
        result = json.loads(self.recall_classifier(query, self.gateway_home(), self.owning_root()).stdout)
        self.assertEqual(json.dumps(result['items'], ensure_ascii=False),
                         json.dumps(hybrid['items'], ensure_ascii=False))
        self.assertIsInstance(result['classifier'].pop('ms'), int)
        self.assertEqual(result['classifier'], {
            'path': 'builtin', 'reason': 'no-classifier', 'kept': [], 'record': None,
        })
        self.assertFalse(log.exists())

    def test_stub_keeps_known_names_in_answer_order_at_most_three(self):
        self.seed(embedded=True, extras=True, long=True, many=80)
        query = 'Rest recovery sleep roads'
        hybrid = json.loads(self.recall(query, extra=('--rank', 'hybrid')).stdout)
        names = [item['name'] for item in hybrid['items']
                 if item.get('part') == 'passage' and isinstance(item.get('name'), str)]
        self.assertGreaterEqual(len(names), 4, names)
        chosen = list(reversed(names))
        answer = {
            'ranked': [
                {'id': 'not-a-passage', 'p': 0.99, 'calibrated': False},
                {'id': 'also-unknown', 'p': 0.98, 'calibrated': False},
            ] + [{'id': name, 'p': 0.25, 'calibrated': False} for name in chosen],
            'calibrated': False,
        }
        log = self.stub(answer)
        result = json.loads(self.recall_classifier(
            query, self.gateway_home(attached=True), self.owning_root()).stdout)
        self.assertEqual(json.dumps(result['items'], ensure_ascii=False),
                         json.dumps(hybrid['items'], ensure_ascii=False))
        self.assertEqual(result['classifier']['path'], 'classifier')
        self.assertIsNone(result['classifier']['reason'])
        self.assertEqual(result['classifier']['kept'], chosen[:3])
        self.assertEqual(result['classifier']['record']['answer']['ranked'][0]['p'], 0.99)
        self.assertEqual(result['classifier']['record']['answer']['ranked'][2]['p'], 0.25)
        self.assertIn('wiser.recall.rank', log.read_text())
        for left, right in zip(result['items'], hybrid['items']):
            self.assertEqual(left.get('score'), right.get('score'))
            self.assertEqual(left.get('rank'), right.get('rank'))

    def test_stub_without_ranked_is_not_accepted(self):
        self.seed(embedded=True, extras=True, long=True)
        query = 'Rest recovery sleep roads'
        self.stub({'calibrated': False})
        result = json.loads(self.recall_classifier(
            query, self.gateway_home(attached=True), self.owning_root()).stdout)
        self.assertIsInstance(result['classifier'].pop('ms'), int)
        self.assertEqual(result['classifier'], {
            'path': 'builtin', 'reason': 'not-accepted', 'kept': [], 'record': None,
        })

    def test_replay_keeps_the_same_names_and_makes_no_call(self):
        self.seed(embedded=True, extras=True, long=True, many=80)
        query = 'Rest recovery sleep roads'
        hybrid = json.loads(self.recall(query, extra=('--rank', 'hybrid')).stdout)
        names = [item['name'] for item in hybrid['items']
                 if item.get('part') == 'passage' and isinstance(item.get('name'), str)]
        self.assertGreaterEqual(len(names), 1)
        answer = {
            'ranked': [
                {'id': 'not-a-passage', 'p': 0.9, 'calibrated': False},
                {'id': names[0], 'p': 0.25, 'calibrated': False},
            ],
            'calibrated': False,
        }
        log = self.stub(answer)
        owning = self.owning_root()
        home = self.gateway_home(attached=True)
        first = json.loads(self.recall_classifier(query, home, owning).stdout)
        self.assertEqual(first['classifier']['kept'], [names[0]])
        record = self.root / 'record.json'
        record.write_text(json.dumps(first['classifier']['record']))
        log.write_text('')
        replayed = json.loads(self.recall_classifier(
            query, home, owning, extra=('--classifier-record', str(record))).stdout)
        self.assertEqual(log.read_text(), '')
        self.assertEqual(replayed['classifier']['path'], 'replay')
        self.assertEqual(replayed['classifier']['kept'], first['classifier']['kept'])
        self.assertEqual(json.dumps(replayed['items'], ensure_ascii=False),
                         json.dumps(hybrid['items'], ensure_ascii=False))

        other = self.recall_classifier(
            'A different question about vehicles on roads', home, owning,
            extra=('--classifier-record', str(record)), code=1)
        self.assertEqual(other.stdout, '')
        self.assertIn('does not match', other.stderr)
        self.assertEqual(log.read_text(), '')

    def test_owning_root_without_classifier_rank_is_refused_by_name(self):
        for flag in ('--owning-root', '--gateway-home', '--classifier-record'):
            run = self.recall('rest', code=1, extra=(flag, str(self.root / 'unused')))
            self.assertIn(flag, run.stderr)
            self.assertEqual(run.stdout, '')
        hybrid = self.recall('rest', code=1, extra=('--rank', 'hybrid', '--owning-root', str(self.root)))
        self.assertIn('--owning-root', hybrid.stderr)
        self.assertEqual(hybrid.stdout, '')
        other = self.run_cli('check', '--owning-root', str(self.root), code=1)
        self.assertIn('unknown option', other.stderr)
        self.assertIn('--owning-root', other.stderr)
        self.assertEqual(other.stdout, '')
