import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const skill=readFileSync(new URL('../SKILL.md',import.meta.url),'utf8');
const step3=skill.split('3. **Which way')[1].split('\n4. **')[0];
const step5=skill.split('5. **Ask in chat instead.**')[1].split('\n6. **')[0];
test('RF5 B4: first permission explanation precedes show_form, once per conversation',()=>{
 const line='If your app asks whether to allow Wiser, allow it. It only shows the form.';
 assert.match(step3,/first time in a conversation/);
 assert.ok(step3.indexOf(line)<step3.indexOf('Call it with the form'));
 assert.equal(skill.split(line).length-1,1);
});
test('RF5 B4: boards cannot fall through to text labels for any unavailable card route',()=>{
 assert.match(step3,/no `show_form`, words-only, or anything else/);
 assert.match(step3,/card could not show.*calling skill/s);
 assert.match(step5,/Before saying.*contains a `boards` question.*return.*card could not show/s);
 assert.ok(step5.indexOf('card could not show')<step5.indexOf('A picture becomes'));
});
test('RF5 B4: local display-only board never enters an answer wait',()=>{
 assert.match(skill,/display-only boards form.*return to the calling skill without waiting/s);
 assert.match(skill,/Use `serve` for this display, since `ask` waits/);
 assert.match(skill,/without step 4.4's wait/);
});
