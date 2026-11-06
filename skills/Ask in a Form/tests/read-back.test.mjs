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
  assert.match(step, /boards and actions receives the picks, the chosen action and, with page mode controls, `mode` straight away at step 7/);
});
test('M6 review: the description and the catalog no longer say every form is read back', () => {
  const catalog = readFileSync(new URL('../../AGENTS.md', import.meta.url), 'utf8');
  const description = skill.match(/^description: (.*)$/m)[1];
  for (const text of [description, catalog.split('\n').find((l) => l.startsWith('| `Ask in a Form/SKILL.md`'))]) {
    assert.match(text, /handed to the calling skill, read back only where the member typed one/);
    assert.doesNotMatch(text, /with the answers read back and handed/);
  }
});

test('boards handoff includes the page mode when supplied', () => {
 assert.match(skill, /Include the chosen action value when the form has actions, and the switch's `mode` when a boards question has `controls.mode`/);
});

test('missed-wait recovery scrapes controlled board mode before handing answers on',()=>{
 const gone=skill.split('`gone`:')[1].split('5. Clean up:')[0];
 assert.match(gone,/controls.mode/);assert.match(gone,/fieldset\[data-type="boards"\]/);
 assert.match(gone,/`data-mode`/);assert.match(gone,/hand it on as `mode`/);
});
