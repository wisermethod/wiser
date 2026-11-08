import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { CURATED } from '../providers/composio/curated.js';
import { loadConnector } from '../src/manifest.js';
import { createFakeProviders, createTestGateway, putActive } from './fake-provider.js';

const NOW = Date.parse('2026-11-07T12:00:00Z');
const ROOT = 'WISER Plugins';
const PLAYBOOK = '2026-11-07-gateway-upgrade';
const scope = (...names) => ({ actions: names.map((name) => `probe.items.${name}`), root: ROOT });

async function fixture(t, service = 'probe') {
  t.mock.method(globalThis, 'fetch', async () => assert.fail('offline test attempted network access'));
  const fake = createFakeProviders();
  let connector;
  if (service === 'probe') {
    const declarations = [
      ['a_change', 'change', 'create test items'],
      ['b_change', 'change', 'update test items'],
      ['c_send', 'send', 'send test messages'],
      ['d_pay', 'pay', 'pay test invoices'],
      ['e_publish', 'publish', 'publish test pages'],
      ['f_access', 'grant_access', 'give test access'],
    ];
    const actions = Object.fromEntries(declarations.map(([name, kind, summary]) => [name, {
      risk: 'medium', confirmation: 'always', standing_approval: { kind, summary },
      execution: { prefer: 'proxy' },
      input: { type: 'object', properties: { category: { type: 'string' }, zone: { type: 'string' } }, additionalProperties: false },
    }]));
    connector = {
      id: 'probe', service: 'probe', manifest: { modules: { items: {
        auth: { provider: 'catalog', toolkit: 'FAKE_KIT', privilege: 'write' }, actions,
      } } },
      impl: { modules: { items: Object.fromEntries(declarations.map(([name]) => [name,
        async () => assert.fail('a proposal must not execute an action')])) } },
    };
  } else {
    connector = await loadConnector(fileURLToPath(new URL(`../../connectors/${service}`, import.meta.url)));
    if (service === 'google') {
      // The shipped curated declaration and real Google module, with fake transport only.
      const row = CURATED.find(({ id }) => id === 'google.gmail.create_label');
      fake.catalog.curated = () => [row];
      fake.catalog.setSlug(row.id, row.tool);
    }
  }
  const f = await createTestGateway({ session: false, now: () => NOW, connectors: [connector], fake });
  t.after(() => rmSync(f.home, { recursive: true, force: true }));
  const module = service === 'probe' ? 'items' : service === 'google' ? 'gmail' : 'records';
  const record = await putActive(f.store, fake, { service, module });
  // Both bindings exist so labelled and unlabelled proposals take their actual lookup paths.
  f.store.putConnection({ ...record, id: 'conn-labelled', label: 'work-mail' });
  return f;
}

const variants = [
  {
    name: 'approved curated Gmail label grant', service: 'google',
    args: { actions: ['google.gmail.create_label'], root: ROOT, playbook: PLAYBOOK, days: null },
    expected: 'Create a new Gmail label without asking you each time, for the "2026-11-07-gateway-upgrade" Playbook in "WISER Plugins". No end date: it lasts until you revoke it. Yes or no?',
    sentences: 3,
  },
  {
    name: 'dated ordinary singular day', args: { ...scope('a_change'), days: 1 },
    expected: 'Create test items without asking you each time, for work in "WISER Plugins". It lasts 1 day, until 2026-11-08, or until you revoke it. Yes or no?',
    sentences: 3,
  },
  {
    name: 'dated ordinary plural days', args: { ...scope('a_change'), days: 30 },
    expected: 'Create test items without asking you each time, for work in "WISER Plugins". It lasts 30 days, until 2026-12-07, or until you revoke it. Yes or no?',
    sentences: 3,
  },
  {
    name: 'no-end ordinary Playbook', args: { ...scope('a_change'), playbook: PLAYBOOK, days: null },
    expected: 'Create test items without asking you each time, for the "2026-11-07-gateway-upgrade" Playbook in "WISER Plugins". No end date: it lasts until you revoke it. Yes or no?',
    sentences: 3,
  },
  {
    name: 'no-end send-only Playbook', args: { ...scope('c_send'), playbook: PLAYBOOK, days: null },
    expected: 'Send test messages without asking you each time, for the "2026-11-07-gateway-upgrade" Playbook in "WISER Plugins". No end date: it lasts until you revoke it. Each send goes out without you seeing it first, and recipients given as a list cannot be limited. Yes or no?',
    sentences: 4,
  },
  {
    name: 'no-end send and change Playbook', args: { ...scope('c_send', 'a_change'), playbook: PLAYBOOK, days: null },
    expected: 'Create test items and send test messages without asking you each time, for the "2026-11-07-gateway-upgrade" Playbook in "WISER Plugins". No end date: it lasts until you revoke it. Each send goes out without you seeing it first, and recipients given as a list cannot be limited. Yes or no?',
    sentences: 4,
  },
  {
    name: 'dated send-only Playbook ninety days', args: { ...scope('c_send'), playbook: PLAYBOOK, days: 90 },
    expected: 'Send test messages without asking you each time, for the "2026-11-07-gateway-upgrade" Playbook in "WISER Plugins". It lasts 90 days, until 2027-02-05, or until you revoke it. Each send goes out without you seeing it first, and recipients given as a list cannot be limited. Yes or no?',
    sentences: 4,
  },
  {
    name: 'dated send without Playbook seven days', args: { ...scope('c_send'), days: 7 },
    expected: 'Send test messages without asking you each time, for work in "WISER Plugins". It lasts 7 days, until 2026-11-14, or until you revoke it. Each send goes out without you seeing it first, and recipients given as a list cannot be limited. Yes or no?',
    sentences: 4,
  },
  {
    name: 'heightened pay', args: { ...scope('d_pay'), days: 7 },
    expected: 'Pay test invoices without asking you each time, for work in "WISER Plugins". It lasts 7 days, until 2026-11-14, or until you revoke it. It can spend money with nobody looking first, and once done it cannot be called back. Yes or no?',
    sentences: 4,
  },
  {
    name: 'heightened pay and publish', args: { ...scope('e_publish', 'd_pay'), days: 7 },
    expected: 'Pay test invoices and publish test pages without asking you each time, for work in "WISER Plugins". It lasts 7 days, until 2026-11-14, or until you revoke it. It can spend money and publish where others can see with nobody looking first, and once done it cannot be called back. Yes or no?',
    sentences: 4,
  },
  {
    name: 'module-wide expands every eligible phrase', args: { module: 'probe.items', root: ROOT, days: 7 },
    expected: 'Create test items, update test items, send test messages, pay test invoices, publish test pages and give test access without asking you each time, for work in "WISER Plugins". It lasts 7 days, until 2026-11-14, or until you revoke it. Each send goes out without you seeing it first, and recipients given as a list cannot be limited. It can spend money, publish where others can see and give someone access with nobody looking first, and once done it cannot be called back. Yes or no?',
    sentences: 5,
  },
  {
    name: 'labelled connection includes its quoted label', args: { ...scope('a_change'), label: 'work-mail', days: 30 },
    expected: 'Create test items without asking you each time, on your connection labelled "work-mail", for work in "WISER Plugins". It lasts 30 days, until 2026-12-07, or until you revoke it. Yes or no?',
    sentences: 3,
  },
  {
    name: 'unlabelled connection omits label words', args: { ...scope('b_change'), days: 30 },
    expected: 'Update test items without asking you each time, for work in "WISER Plugins". It lasts 30 days, until 2026-12-07, or until you revoke it. Yes or no?',
    sentences: 3,
  },
  {
    name: 'where one field and two sorted values', args: { ...scope('a_change'), days: 30, where: { category: ['review', 'ready'] } },
    expected: 'Create test items without asking you each time, for work in "WISER Plugins", only where category is "ready" or "review". It lasts 30 days, until 2026-12-07, or until you revoke it. Yes or no?',
    sentences: 3,
  },
  {
    name: 'where two sorted fields JSON quote values', args: { ...scope('a_change'), days: 30, where: { zone: ['west'], category: ['review "only"'] } },
    expected: 'Create test items without asking you each time, for work in "WISER Plugins", only where category is "review \\"only\\"" and zone is "west". It lasts 30 days, until 2026-12-07, or until you revoke it. Yes or no?',
    sentences: 3,
  },
  {
    name: 'real Twenty shared caution once', service: 'twenty',
    args: { actions: ['twenty.records.update', 'twenty.records.create'], root: ROOT, days: 30 },
    expected: 'Create records in Twenty and change fields on existing Twenty records without asking you each time, for work in "WISER Plugins". It lasts 30 days, until 2026-12-07, or until you revoke it. Creating or changing a Twenty record can start your workspace\'s own workflows, and a workflow may send email from a connected mailbox, so under this approval nobody looks at the record before that happens. Yes or no?',
    sentences: 4,
  },
  {
    name: 'root and Playbook JSON quote embedded double quotes',
    args: { ...scope('a_change'), playbook: PLAYBOOK, days: null },
    setup(f, t) {
      // Public names exclude quotes. Inject them at the checked-scope boundary
      // so the real propose path still renders and binds the defensive quoting.
      const checkedScope = f.gw.standingApprovalScope.bind(f.gw);
      t.mock.method(f.gw, 'standingApprovalScope', (args) => {
        const checked = checkedScope(args);
        return { ...checked, scope: { ...checked.scope, root: 'WISER "Plugins"', playbook: 'gateway "upgrade"' } };
      });
    },
    expected: 'Create test items without asking you each time, for the "gateway \\"upgrade\\"" Playbook in "WISER \\"Plugins\\"". No end date: it lasts until you revoke it. Yes or no?',
    sentences: 3,
  },
  {
    name: 'distinct cautions retain action order after send and count their own sentences',
    args: { ...scope('c_send', 'b_change', 'a_change'), days: 7 },
    setup(f) {
      const actions = f.connectors[0].manifest.modules.items.actions;
      actions.a_change.standing_approval.caution = 'First caution. Read this too.';
      actions.b_change.standing_approval.caution = 'First caution. Read this too.';
      actions.c_send.standing_approval.caution = 'Second caution.';
    },
    expected: 'Create test items, update test items and send test messages without asking you each time, for work in "WISER Plugins". It lasts 7 days, until 2026-11-14, or until you revoke it. Each send goes out without you seeing it first, and recipients given as a list cannot be limited. First caution. Read this too. Second caution. Yes or no?',
    sentences: 7,
  },
];

for (const variant of variants) {
  test(`short warning: ${variant.name}`, async (t) => {
    const f = await fixture(t, variant.service);
    variant.setup?.(f, t);
    const proposal = await f.gw.callTool('standing_approvals', { ...variant.args, mode: 'propose' });
    assert.equal(proposal.status, 'standing_approval_proposed', JSON.stringify(proposal));
    assert.equal(proposal.warning, variant.expected);
    // Three base sentences, one per send/other heightened kind group, plus caution sentences.
    assert.equal(proposal.warning.match(/[.!?](?=\s|$)/g).length, variant.sentences);
  });
}
