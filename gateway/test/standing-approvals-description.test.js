import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS } from '../src/tools.js';

// From the second connector-launch sitting, 2026-11-12: with only this tool's description in
// front of it, an app listed the approvals, found none, and agreed in chat to stop asking.
test('standing_approvals says a chat agreement creates no approval, and names the skill', () => {
  const tool = TOOLS.find((t) => t.name === 'standing_approvals');
  assert.ok(tool);
  assert.match(tool.description, /^Propose a standing approval, grant it after the person's explicit yes to the warning, list approvals, or revoke one\./);
  assert.match(tool.description, /agreeing in the conversation creates none/);
  assert.match(tool.description, /Standing Approval skill/);
  // It must not read as forbidding the grant after a real yes, or as waiting on a skill load.
  assert.match(tool.description, /do not simply agree in the conversation: propose one here, show them its warning unchanged, and grant only after their yes to that warning/);
  assert.match(tool.description, /an empty list means none exists/);
  // Propose can answer with no warning (no account connected, a scope it refuses): nothing is invented.
  assert.match(tool.description, /where propose returns no warning, show none, grant nothing/);
  assert.doesNotMatch(tool.description, /first and follow it/);
  assert.ok(tool.description.length <= 600, String(tool.description.length));
});

// From the third connector-launch pass, 2026-11-13: an app agreed in chat to stop asking and
// never consulted the approvals tool. The one text it must read when it sends a confirmed call
// is the confirm field's own description, so the rule is there too.
test('every confirm field says an earlier request not to be asked is not an approval', () => {
  const withConfirm = TOOLS.filter((t) => t.inputSchema?.properties?.confirm);
  assert.ok(withConfirm.length >= 2, String(withConfirm.length));
  for (const tool of withConfirm) {
    const text = tool.inputSchema.properties.confirm.description;
    assert.match(text, /^True only after a person approved a needs_confirmation stop for this exact input/, tool.name);
    assert.match(text, /a request made earlier not to be asked, or an agreement in the conversation to stop asking, is not that approval/, tool.name);
  }
});
