import test from 'node:test';
import assert from 'node:assert/strict';
import { browserKit } from '../../../tools/Form/tests/boards-harness.js';
import { buildOwnColours } from '../scripts/own-colours.mjs';
import { select } from '../scripts/select.mjs';
import { bakery } from './select-fixtures.mjs';
import { looksForm } from './form-budget.mjs';
import { checkForm } from '../../../tools/Form/scripts/format.js';

test('existing Form rule greys both strength buttons on own-colour looks and boards; modes and picks work offline', async () => {
  const a={...bakery(),ownColours:buildOwnColours('red, white and blue')};
  const looks=select('looks',a),round=select('round1',{...a,looksShown:looks.options});
  const kit=await browserKit();
  try {
    for(const [view,form] of [['look',looksForm(a,looks)],['board',round.form]]) {
      assert.deepEqual(checkForm(form),{ok:true,problems:[]});
      const h=await kit.open(form,390,'light');
      try {
        assert.equal(await h.f.locator('.boards-tile').count(),form.questions[0].options.length);
        if(view==='look') {
          const initial=await h.f.locator('.look-art').evaluateAll(nodes=>nodes.map(n=>n.dataset.mode));
          assert.deepEqual(initial,form.questions[0].options.map(o=>o.board.primaryMode));
        }
        // Select through the native checkbox: thumbnail and caption click
        // semantics belong to the board-card design, not this colour test.
        await h.f.locator('.tile-input').first().focus();
        await h.f.locator('.tile-input').first().press('Space');
        const value=await h.f.locator('.tile-input').first().inputValue();
        for(const mode of ['dark','light']) {
          await h.f.getByRole('group',{name:'Light or dark',exact:true}).getByRole('button',{name:mode==='light'?'Light':'Dark',exact:true}).click();
          for(const label of ['More muted','More bold']) {
            const button=h.f.getByRole('button',{name:label,exact:true});
            assert.equal(await button.isDisabled(),true,`${view}: ${label}`);
            assert.ok(await button.evaluate(n=>parseFloat(getComputedStyle(n).opacity)<1));
          }
          assert.equal(await h.f.locator('fieldset').getAttribute('data-mode'),mode);
          if(view==='look')assert.ok((await h.f.locator('.look-art').evaluateAll(nodes=>nodes.map(n=>n.dataset.mode))).every(value=>value===mode));
          assert.equal(await h.f.locator('.tile-input').first().isChecked(),true);
          assert.equal(await h.f.locator('.tile-input').first().inputValue(),value);
        }
        assert.deepEqual(h.errors,[]);
      } finally {await h.context.close();}
    }
  } finally {await kit.browser.close();}
});
