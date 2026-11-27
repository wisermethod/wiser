import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { test } from 'node:test';
import { createFakeProviders, createTestGateway, putActive } from './fake-provider.js';

const SCOPE = { root: 'booking-project', playbook: 'add-show-team' };
const MODULE = 'calcom.bookings';
const NOW = Date.parse('2026-11-27T12:00:00.000Z');
const BOOKING_UID = 'sample-booking';
const EMAIL = 'team-member@example.test';
const CASES = [
  {
    action: `${MODULE}.add_attendee`,
    summary: 'add an attendee to a booking',
    caution: 'Cal.com emails the new attendee the booking details and updates the calendar event.',
    endpoint: `/v2/bookings/${BOOKING_UID}/attendees`,
    input: { bookingUid: BOOKING_UID, email: EMAIL, name: 'Team Member', timeZone: 'America/Denver' },
  },
  {
    action: `${MODULE}.add_guests`,
    summary: 'add guests to a booking',
    caution: "Recipients can come from typed email addresses, the account's contacts or contact tags. Cal.com can email new and existing guests, the organizer and team members. The grant cannot limit these recipient lists.",
    endpoint: `/v2/bookings/${BOOKING_UID}/guests`,
    input: { bookingUid: BOOKING_UID, guests: [{ email: EMAIL }] },
  },
];

async function setup(t, proxyRules = []) {
  const fake = createFakeProviders({ proxyRules });
  const f = await createTestGateway({ fake, now: () => NOW });
  t.after(() => rmSync(f.home, { recursive: true, force: true }));
  await putActive(f.store, fake, { service: 'calcom', module: 'bookings' });
  return f;
}

for (const { action, summary, caution, endpoint, input } of CASES) {
  test(`${action} warns before granting and runs under the matching approval`, async (t) => {
    const response = { bookingUid: BOOKING_UID };
    const { gw } = await setup(t, [{
      match: (path, method) => path === endpoint && method === 'POST',
      result: { status: 200, data: response },
    }]);
    const scope = { ...SCOPE, actions: [action] };
    const proposal = await gw.callTool('standing_approvals', { ...scope, mode: 'propose' });
    assert.equal(proposal.status, 'standing_approval_proposed');
    assert.deepEqual(proposal.scope.actions, [action]);
    assert.deepEqual(proposal.kinds, ['send']);
    assert.equal(proposal.heightened, true);
    const displaySummary = summary[0].toUpperCase() + summary.slice(1);
    assert.ok(proposal.warning.startsWith(`${displaySummary} without asking you each time`), proposal.warning);
    assert.ok(proposal.warning.endsWith(`${caution} Yes or no?`), proposal.warning);

    const granted = await gw.callTool('standing_approvals', { ...scope, mode: 'grant', confirmed: true });
    assert.equal(granted.status, 'ok');
    const { id, expires_at } = granted.standing_approval;
    assert.deepEqual(granted.standing_approval.summaries, [summary]);
    assert.deepEqual(granted.standing_approval.cautions, [caution]);
    assert.deepEqual(await gw.callTool('execute', { ...SCOPE, action, input }), {
      ...response,
      standing_approval: { id, expires_at },
    });
    assert.equal(gw.pendingConfirmations.size, 0);
    assert.equal(gw.confirmedOnce.size, 0);
    const outside = await gw.callTool('execute', { action, input, root: SCOPE.root });
    assert.equal(outside.status, 'needs_confirmation');
    assert.equal(outside.standing_approval, undefined);
  });
}

test('a Cal.com bookings module proposal covers only guest and attendee additions', async (t) => {
  const { gw, connectors } = await setup(t);
  const { modules } = connectors.find(({ service }) => service === 'calcom').manifest;
  const eligible = Object.entries(modules).flatMap(([module, { actions }]) =>
    Object.entries(actions)
      .filter(([, action]) => action.standing_approval)
      .map(([name]) => `calcom.${module}.${name}`));
  const expected = CASES.map(({ action }) => action);
  assert.deepEqual(eligible.sort(), expected);

  for (const name of Object.keys(modules.bookings.actions)) {
    const action = `${MODULE}.${name}`;
    if (expected.includes(action)) continue;
    assert.deepEqual(await gw.callTool('standing_approvals', { ...SCOPE, mode: 'propose', actions: [action] }), {
      status: 'invalid_arguments', field: 'actions', reason: 'not_eligible',
    }, action);
  }

  // Cancellation and rescheduling are high risk, so module expansion omits them as ineligible.
  const proposal = await gw.callTool('standing_approvals', { ...SCOPE, mode: 'propose', module: MODULE });
  assert.equal(proposal.status, 'standing_approval_proposed');
  assert.equal(proposal.scope.module_wide, true);
  assert.deepEqual(proposal.scope.actions, expected);
});
