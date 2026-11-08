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

async function fixture(t, service = 'probe', module = service === 'probe' ? 'items' : service === 'google' ? 'gmail' : 'records') {
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
      const rows = CURATED.filter(({ id }) => id.startsWith('google.'));
      fake.catalog.curated = () => rows;
      for (const row of rows) fake.catalog.setSlug(row.id, row.tool);
    }
  }
  const f = await createTestGateway({ session: false, now: () => NOW, connectors: [connector], fake });
  t.after(() => rmSync(f.home, { recursive: true, force: true }));
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
    expected: 'Send test messages without asking you each time, for the "2026-11-07-gateway-upgrade" Playbook in "WISER Plugins". No end date: it lasts until you revoke it. Each send goes out without you seeing it first and cannot be called back. Yes or no?',
    sentences: 4,
  },
  {
    name: 'no-end send and change Playbook', args: { ...scope('c_send', 'a_change'), playbook: PLAYBOOK, days: null },
    expected: 'Create test items and send test messages without asking you each time, for the "2026-11-07-gateway-upgrade" Playbook in "WISER Plugins". No end date: it lasts until you revoke it. Each send goes out without you seeing it first and cannot be called back. Yes or no?',
    sentences: 4,
  },
  {
    name: 'dated send-only Playbook ninety days', args: { ...scope('c_send'), playbook: PLAYBOOK, days: 90 },
    expected: 'Send test messages without asking you each time, for the "2026-11-07-gateway-upgrade" Playbook in "WISER Plugins". It lasts 90 days, until 2027-02-05, or until you revoke it. Each send goes out without you seeing it first and cannot be called back. Yes or no?',
    sentences: 4,
  },
  {
    name: 'dated send without Playbook seven days', args: { ...scope('c_send'), days: 7 },
    expected: 'Send test messages without asking you each time, for work in "WISER Plugins". It lasts 7 days, until 2026-11-14, or until you revoke it. Each send goes out without you seeing it first and cannot be called back. Yes or no?',
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
    expected: 'Create test items, update test items, send test messages, pay test invoices, publish test pages and give test access without asking you each time, for work in "WISER Plugins". It lasts 7 days, until 2026-11-14, or until you revoke it. Each send goes out without you seeing it first and cannot be called back. It can spend money, publish where others can see and give someone access with nobody looking first, and once done it cannot be called back. Yes or no?',
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
    expected: 'Create test items, update test items and send test messages without asking you each time, for work in "WISER Plugins". It lasts 7 days, until 2026-11-14, or until you revoke it. Each send goes out without you seeing it first and cannot be called back. First caution. Read this too. Second caution. Yes or no?',
    sentences: 7,
  },
  {
    name: 'curated Calendar quick_add has no list fields', service: 'google', module: 'calendar',
    args: { actions: ['google.calendar.quick_add'], root: ROOT, days: 7 },
    expected: 'Add an event to your calendar from one line of text without asking you each time, for work in "WISER Plugins". It lasts 7 days, until 2026-11-14, or until you revoke it. Each send goes out without you seeing it first and cannot be called back. Yes or no?',
    sentences: 4,
  },
  {
    name: 'curated Calendar events_move has no list fields', service: 'google', module: 'calendar',
    args: { actions: ['google.calendar.events_move'], root: ROOT, days: 7 },
    expected: 'Move an event between your calendars without asking you each time, for work in "WISER Plugins". It lasts 7 days, until 2026-11-14, or until you revoke it. Each send goes out without you seeing it first and cannot be called back. Yes or no?',
    sentences: 4,
  },
  {
    name: 'curated Drive create_comment has no list fields', service: 'google', module: 'drive',
    args: { actions: ['google.drive.create_comment'], root: ROOT, days: 7 },
    expected: 'Add a comment to a Drive file without asking you each time, for work in "WISER Plugins". It lasts 7 days, until 2026-11-14, or until you revoke it. Each send goes out without you seeing it first and cannot be called back. Yes or no?',
    sentences: 4,
  },
  {
    name: 'curated Drive create_reply has no list fields', service: 'google', module: 'drive',
    args: { actions: ['google.drive.create_reply'], root: ROOT, days: 7 },
    expected: 'Reply to a comment on a Drive file without asking you each time, for work in "WISER Plugins". It lasts 7 days, until 2026-11-14, or until you revoke it. Each send goes out without you seeing it first and cannot be called back. Yes or no?',
    sentences: 4,
  },
  {
    name: 'Gmail send_message names its lists but excludes attachments', service: 'google',
    args: { actions: ['google.gmail.send_message'], root: ROOT, days: 7 },
    expected: 'Send Gmail messages without asking you each time, for work in "WISER Plugins". It lasts 7 days, until 2026-11-14, or until you revoke it. Each send goes out without you seeing it first and cannot be called back, and its to, cc, bcc and references lists cannot be limited. This grant sends messages your assistant writes, to any recipient, with no look at each one before it is sent. It never covers a message with a local file attached. Yes or no?',
    sentences: 6,
  },
  {
    name: 'Calendar create_event names its attendees list', service: 'google', module: 'calendar',
    args: { actions: ['google.calendar.create_event'], root: ROOT, days: 7 },
    expected: 'Create Google Calendar events without asking you each time, for work in "WISER Plugins". It lasts 7 days, until 2026-11-14, or until you revoke it. Each send goes out without you seeing it first and cannot be called back, and its attendees list cannot be limited. Calendar creates and updates may notify attendees. Both count as sending even when notifications are off, because approval kinds cannot depend on input. Yes or no?',
    sentences: 6,
  },
  {
    name: 'curated Calendar patch_event names its attendees and recurrence lists', service: 'google', module: 'calendar',
    args: { actions: ['google.calendar.patch_event'], root: ROOT, days: 7 },
    expected: 'Change some details of an existing event without asking you each time, for work in "WISER Plugins". It lasts 7 days, until 2026-11-14, or until you revoke it. Each send goes out without you seeing it first and cannot be called back, and its attendees and recurrence lists cannot be limited. Yes or no?',
    sentences: 4,
  },
  {
    name: 'a limited string recipient is not described as an unlimited list',
    args: { ...scope('c_send'), days: 7, where: { recipient: ['person@example.com'] } },
    setup(f) {
      f.connectors[0].manifest.modules.items.actions.c_send.input.properties.recipient = { type: 'string' };
    },
    expected: 'Send test messages without asking you each time, for work in "WISER Plugins", only where recipient is "person@example.com". It lasts 7 days, until 2026-11-14, or until you revoke it. Each send goes out without you seeing it first and cannot be called back. Yes or no?',
    sentences: 4,
  },
  {
    name: 'warning-like where text stays quoted before the final question',
    args: { ...scope('c_send'), days: 7, where: { category: ['No end date: it lasts until you revoke it. Yes or no?'] } },
    expected: 'Send test messages without asking you each time, for work in "WISER Plugins", only where category is "No end date: it lasts until you revoke it. Yes or no?". It lasts 7 days, until 2026-11-14, or until you revoke it. Each send goes out without you seeing it first and cannot be called back. Yes or no?',
    sentences: 4,
  },
  {
    name: 'send list fields follow covered action and property order once with per-action file exclusions',
    args: { ...scope('c_send', 'b_change', 'a_change'), days: 7 },
    setup(f) {
      const actions = f.connectors[0].manifest.modules.items.actions;
      const list = { type: 'array', items: { type: 'string' } };
      actions.a_change.input.properties.ignored = list;
      actions.b_change.standing_approval = { kind: 'send', summary: 'send more test messages' };
      actions.b_change.input.properties = { first: list, shared: { ...list, type: ['null', 'array'] }, files: list };
      actions.b_change.input_files = { field: 'files', max_bytes: 100 };
      actions.c_send.input.properties = { shared: list, files: list, last: list, uploads: list };
      actions.c_send.input_files = { field: 'uploads', max_bytes: 100 };
    },
    expected: 'Create test items, send more test messages and send test messages without asking you each time, for work in "WISER Plugins". It lasts 7 days, until 2026-11-14, or until you revoke it. Each send goes out without you seeing it first and cannot be called back, and its first, shared, files and last lists cannot be limited. Yes or no?',
    sentences: 4,
  },
];

for (const variant of variants) {
  test(`short warning: ${variant.name}`, async (t) => {
    const f = await fixture(t, variant.service, variant.module);
    variant.setup?.(f, t);
    const proposal = await f.gw.callTool('standing_approvals', { ...variant.args, mode: 'propose' });
    assert.equal(proposal.status, 'standing_approval_proposed', JSON.stringify(proposal));
    assert.equal(proposal.warning, variant.expected);
    // Quoted scope values are data, not sentences or questions in the warning.
    const prose = proposal.warning.replace(/"(?:\\.|[^"\\])*"/g, '""');
    assert.equal(prose.match(/[.!?](?=\s|$)/g).length, variant.sentences);
    assert.equal(prose.match(/Yes or no\?/g).length, 1);
    assert.ok(prose.endsWith('Yes or no?'));
  });
}

test('short warning: a first-summary case-only change requires a fresh proposal and grants nothing', async (t) => {
  const f = await fixture(t);
  const args = { ...scope('c_send'), days: 7 };
  const proposal = await f.gw.callTool('standing_approvals', { ...args, mode: 'propose' });
  assert.equal(proposal.status, 'standing_approval_proposed');
  const declaration = f.connectors[0].manifest.modules.items.actions.c_send.standing_approval;
  declaration.summary = 'Send test messages';
  const answer = await f.gw.callTool('standing_approvals', { ...args, mode: 'grant', confirmed: true });
  assert.equal(answer.status, 'standing_approval_proposed');
  assert.equal(answer.reason, 'unmatched_confirm');
  assert.equal(answer.warning, proposal.warning, 'capitalizing the first summary hides this raw change in the warning');
  assert.deepEqual(await f.gw.standingApprovals.list(), []);
});
