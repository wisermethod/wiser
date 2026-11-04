import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
for (const [file, start, end] of [['SKILL.md', '### Step 3: Fill about and design', '### Step 4: Read back'], ['full-path.md', '## Phase 7', '## Phase 8']]) {
  test('M6 item 6: ' + file + ' routes Build Brand entry taps to the question tool', () => {
    const text = readFileSync(new URL('../' + file, import.meta.url), 'utf8').split(start)[1].split(end)[0];
    assert.match(text, /skills\/Build Voice\/paths\/coach.md.*How you ask/);
    assert.match(text, /app's question tool/);
    assert.match(text, /one question per message with lettered options/);
    assert.match(text, /Do not send these taps through a form/);
  });
}
