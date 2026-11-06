import '../../../tools/lib/tests/isolated-home.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {select} from '../scripts/select.mjs';
import {boardOperator} from './select-fixtures.mjs';
import {checkForm} from '../../../tools/Form/scripts/format.js';
const read = path => readFileSync(new URL('../'+path, import.meta.url), 'utf8');
const router=read('SKILL.md'), bank=read('questions.md'), sitting=read('paths/sitting.md'), lock=read('lock.md'), brief=read('paths/brief.md'), simple=read('paths/simple.md');
const section=(text,heading)=>text.split(heading)[1]?.split('\n## ')[0]??'';
const lines={
 setup:'Getting your looks ready. The first time takes a few minutes while I get set up.',
 failed:'I couldn\'t get your looks ready just now. Say "build my brand" any time and we\'ll pick up from here.',
 checking:'Checking the words on your board. A minute or two.',
 help:'To lock a board in, leave just that one ticked.',
 looks:'Your looks can\'t show in this card, so I\'ll open them on their own page instead.',
 boards:'Your boards can\'t show in this card, so I\'ll open them on their own page instead.'
};
test('RF5 B1: exact caller field contract and per-path outcomes are data',()=>{
 for(const line of [
  '`status`: `locked`, `complete` or `stopped`.',
  "`design`: the design file's path, on every return.",
  "`look`: the one-page look's path, on the simple path's `complete` only.",
  "`sitting`: the saved sitting's path, on `stopped` only.",
  '`waitsOn`: what a provisional design still waits on, in plain words, on every return where the design is provisional.',
  '`offers`: the offer list for that path, as data, never said on this caller.'
 ])assert.ok(router.includes(line),line);
 assert.match(router,/full sitting gives `locked` or `stopped`/);
 assert.match(router,/brief path gives `complete` or `stopped`/);
 assert.match(router,/simple path gives `complete`, with no close line of its own/);
});
test('RF5 B1: caller lock and brief bypass close and offers; direct runs keep both',()=>{
 for(const [text,status] of [[lock,'locked'],[brief,'complete']]){
  assert.match(text,new RegExp('return `'+status+'` with `design`'));
  assert.match(text,/say no close or offers line/);
  assert.match(text,/direct run.*close and offers/i);
  assert.match(text,/`offers`.*data/);
 }
 const step=section(bank,'## Step 6: Lock and close');
 assert.match(step,/caller.*no Done or offers line/s);
 assert.ok(step.includes('Done. Your brand is set, and everything I make for you will use it.'));
 assert.match(section(bank,'### Brief close'),/direct run/);
});
test('RF5 B1: simple returns actual design and look paths without a caller close',()=>{
 assert.match(simple,/return `complete` with `design` and `look`/);
 assert.match(simple,/say no close line of its own/);
 assert.match(simple,/direct run.*show the page/i);
 assert.match(simple,/caller.*intro.*first line only/s);
});
test('RF5 B5: leaving early saves then returns stopped instead of ending the caller',()=>{
 const leaving=section(sitting,'## Leaving early');
 assert.match(leaving,/say Questions Leaving early's line, then return `stopped` to a caller/);
 for(const key of ['design','sitting','waitsOn','offers'])assert.ok(leaving.includes('`'+key+'`'),key);
 assert.match(leaving,/direct run ends there/);
});
test('RF5 B3: both openings and the clock agree on fifteen minutes plus first-time fonts',()=>{
 const opening=section(bank,'## Opening');
 assert.equal((opening.match(/About 15 minutes\./g)||[]).length,2);
 assert.doesNotMatch(opening,/12 minutes/);
 assert.match(sitting,/about 15 minutes/);assert.match(sitting,/first-time font setup adds a few minutes/);
 assert.match(sitting,/with no page yet, resume the saved step/);
});
test('RF5 B3: missing fonts get a line before install, checked fonts stay quiet, failures return once',()=>{
 for(const text of [sitting,simple]){
  const check=text.indexOf('fonts.mjs check');
  assert.ok(check>=0);
  assert.match(text,/installed: true.*say nothing/s);
  assert.match(text,/installed: false.*Getting your looks ready/s);
  assert.ok(text.indexOf(lines.setup)<text.indexOf('fonts.mjs check --install'));
  assert.ok(text.includes(lines.failed));
  assert.match(text,/failed install or check.*return `stopped`/s);
  assert.match(text,/bounded.*no automatic retry/s);
  assert.match(text,/State: provisional/);
 }
});
test('RF5 B3: making estimate and changed-word check use the bank at the right moment',()=>{
 assert.ok(bank.includes('Making your boards now. A few minutes.'));
 assert.ok(bank.includes('Making your boards now. The first time takes a few minutes while I get set up.'));
 assert.ok(bank.includes(lines.checking));
 assert.ok(lock.indexOf(lines.checking)<lock.indexOf('reassemble the same visual board'));
});
test('RF5 B2: bank and every boards page carry the one-board help using Form help',()=>{
 assert.ok(bank.includes(lines.help));assert.ok(sitting.includes(lines.help));
 const a=boardOperator(),round=select('round1',a,{check:true});
 const variation=select('variations',{...a,picks:round.selection.boards.slice(0,2),shown:round.selection.boards,steer:{}},{check:true});
 for(const result of [round,variation]){
  assert.equal(result.form.questions[0].help,lines.help);
  assert.deepEqual(checkForm(result.form),{ok:true,problems:[]});
 }
});
test('RF5 B6: brand files use type and offer all four choices in order, including on an empty receipt',()=>{
 const files=section(bank,'### Brand files').split('### Anything missing')[0];
 const options=files.split('\n').filter(l=>l.startsWith('- ')).map(l=>l.slice(2));
 assert.deepEqual(options,["Done, they're in",'Use my website',"I don't have them: build one with me",'Leave this for later']);
 assert.doesNotMatch(files,/paste/i);assert.match(files,/Or type your website's address\./);
 assert.match(files,/Type the address here\./);assert.match(files,/or type your website's address\./);
 assert.match(brief,/empty-receipt line and the same four options/);
 assert.match(brief,/build one with me.*full sitting.*omit.*happy with/s);
 assert.match(brief,/Leave this for later.*return `stopped`.*`sitting`/s);
 assert.match(brief,/no boards.*no member line/s);
});
test('RF5 B4: any card failure and any null form opens the unchanged page with bank actions',()=>{
 for(const line of [lines.looks,lines.boards])assert.ok(bank.includes(line),line);
 assert.match(sitting,/card could not show.*`form: null` for any reason/s);
 assert.match(sitting,/looks own-page line/);assert.match(sitting,/boards own-page line/);
 assert.match(sitting,/page's actions on the question tool/);
 assert.match(sitting,/same action labels, lines and pick conditions/);
 assert.match(lock,/display-only.*never waited on/s);
 assert.match(lock,/card cannot show.*own-page/s);
});
test('RF5 B7: caller full and brand-files switch omit only the existing-brand option',()=>{
 assert.match(sitting,/caller.*`full`.*omit.*I have a brand I'm happy with/s);
 assert.match(sitting,/other three options in order/);
 assert.match(sitting,/direct run keeps all four/);
});
