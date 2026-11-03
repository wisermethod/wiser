import test from 'node:test';
import assert from 'node:assert/strict';
import { select } from '../../../skills/Build Brand/scripts/select.mjs';
import { boardOperator } from '../../../skills/Build Brand/tests/select-fixtures.mjs';
import { checkForm } from '../scripts/format.js';
import { resolveBoards } from '../scripts/boards.js';

for (const command of ['round1', 'variations']) test(`${command}: Form retains the displayed rebuilt page's unblocked options on retry`, () => {
  const a = boardOperator(), seed = select('round1', a, {check:true}).selection.boards;
  if (command === 'variations') Object.assign(a, { picks: [seed[0]], shown: seed });
  const first = select(command, a, {check:true}), avoid = [first.selection.boards[0]];
  const rebuilt = select(command, { ...a, avoid }, {check:true});
  const index = 1; avoid.push(rebuilt.selection.boards[index]);
  const result = select(command, JSON.parse(JSON.stringify({ ...a, avoid, pageDisplayed: true, displayedBoards: rebuilt.selection.boards })), {check:true});
  assert.ok(result.form); assert.deepEqual(checkForm(result.form), { ok: true, problems: [] });
  const expand = form => resolveBoards(form.brand, form.questions[0].options, form.boardDefaults).boards;
  for (let i=0;i<rebuilt.selection.boards.length;i++) {
    if (i===index) assert.notDeepEqual(expand(result.form)[i],expand(rebuilt.form)[i]);
    else assert.deepEqual(expand(result.form)[i],expand(rebuilt.form)[i]);
  }
});
