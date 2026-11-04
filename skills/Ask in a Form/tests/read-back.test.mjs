import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const skill = readFileSync(new URL('../SKILL.md', import.meta.url), 'utf8');
const step = skill.split('6. **')[1].split('\n7. **')[0];

test('M6 item 2: a tap-only form hands on without a read-back or wait', () => {
  assert.match(step, /every answer was picked.*step 7 without a read-back or wait/);
  assert.match(step, /skipped questions do not trigger a read-back/);
});
test('M6 item 2: a typed answer or edited-message disagreement keeps the read-back', () => {
  assert.match(step, /Read back only where the member typed an answer or the edited-message check found a disagreement/);
  assert.match(step, /Here's what I have: \[question\], \[answer\]; \.\.\. Tell me if anything's wrong/);
  assert.match(step, /then stop and wait/);
  assert.match(step, /ask which is right first/);
});
test('M6 item 2: boards and actions retain the direct handoff', () => {
  assert.match(step, /boards and actions receives the picks and the chosen action straight away at step 7/);
});
