import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildOwnColours, coloursFromComment, PAIRS, EXTRA_PAIRS, wcag, apca } from '../scripts/own-colours.mjs';
import { select, selectionForAssembly } from '../scripts/select.mjs';
import { assemble, LIBRARY } from '../scripts/assemble.mjs';
import { boardRefusal } from '../scripts/refusals.mjs';
import { bakery } from './select-fixtures.mjs';
import { looksForm, assertFormBudget } from './form-budget.mjs';

test('ported PAIRS and reading formulae agree with the renderer', async () => {
  const source=readFileSync(new URL('../../../tools/Contact Sheet/scripts/brand-boards.js',import.meta.url),'utf8');
  const block=source.slice(source.indexOf('const PAIRS = ['),source.indexOf('];',source.indexOf('const PAIRS = [')));
  const pairs=[...block.matchAll(/\['([^']+)', '(\w+)', '(\w+)', (null|[\d.]+)(?:, (\d+))?\]/g)].map(([,label,fg,bg,need,lc])=>[label,fg,bg,need==='null'?null:+need,...(lc?[+lc]:[])]);
  assert.deepEqual(PAIRS,pairs);
  // These checks live outside PAIRS in the actual renderer, after record().
  const reading=source.slice(source.indexOf("for (const [fg, bg] of [["),source.indexOf('const drawn ='));
  const extra=[...reading.matchAll(/\['(sub|note)', '(ground)'\]/g)].map(([,fg,bg])=>[`${fg} on ${bg}`,fg,bg,4.5]);
  assert.deepEqual(EXTRA_PAIRS,extra);
  assert.match(reading,/b\.graphics\?\.pattern, 'ground', \['text', 'headline', 'smallPrint', 'sub', 'note', 'mark'\], 'mark'/);
  assert.match(reading,/b\.graphics\?\.texture, 'cardBack', \['cardBackText'\], 'cardBackMark'/);
  const renderer=await import('../../../tools/Contact Sheet/scripts/brand-boards.js');
  for(const [a,b] of [['#B22234','#FFFFFF'],['#162D50','#fff'],['#B89B58','#246247']]) {
    assert.ok(Math.abs(wcag(a,b)-renderer.wcag(a,b))<1e-12);
    assert.ok(Math.abs(apca(a,b)-renderer.apca(a,b))<1e-12);
  }
});
test('a comment naming colours gives distinct checked looks, then Round 1 and variations in those colours within budget', () => {
  const ownColours=coloursFromComment('red, white and blue'),a={...bakery(),ownColours};
  const looks=select('looks',a,{check:true});
  assert.equal(looks.options.length,Math.min(12,JSON.parse(readFileSync(LIBRARY)).styles.length));
  assert.ok(new Set(looks.looks.map(l=>l.style)).size>=6);
  assert.equal(looks.controls.strength,true);
  assertFormBudget(looksForm(a,looks),1000);
  for(const option of looks.options) {
    assert.deepEqual(option.board.palette.overrides,ownColours.kept.palette.overrides);
    assert.equal(option.steps.length,1);
  }
  const answers={...a,looks:looks.options.slice(0,3).map(o=>o.value),looksShown:looks.options};
  const round=select('round1',answers,{check:true});
  const variation=select('variations',{...answers,picks:round.selection.boards.filter(b=>!b.zero).slice(0,3),shown:round.selection.boards},{check:true});
  assert.ok(variation.positions.every(p=>!p.changedParts.includes('palette')),'a fixed own palette cannot masquerade as a changed part through its backing recipe id');
  for(const page of [round,variation]) {
    assertFormBudget(page.form,1000);
    assert.equal(page.form.questions[0].controls.strength,true);
    for(const b of page.selection.boards){assert.equal(b.steps.length,1);assert.deepEqual(b.palette.overrides,ownColours.kept.palette.overrides);}
    for(const o of page.form.questions[0].options)assert.deepEqual(o.steps,[{value:o.value}]);
    const spec=assemble(selectionForAssembly(page.selection),JSON.parse(readFileSync(LIBRARY)),{selectionDir:process.cwd()});
    for(const b of spec.boards)for(const mode of ['light','dark'])assert.deepEqual(b.palette[mode],ownColours.kept.palette.overrides[mode]);
  }
});
test('only own colours bypass a dated cluster; handwriting stays refused', () => {
  const library=JSON.parse(readFileSync(LIBRARY)),palette=library.palettes[0];
  // Pick the dated acid cluster with its declared ground and an acid accent.
  const cluster=library.refusedClusters.find(c=>!c.displayStyle);
  assert.ok(cluster);
  const pairing=library.pairings.find(p=>p.selectable!==false);
  const overrides=structuredClone({light:palette.light,dark:palette.dark});
  for(const mode of ['light','dark']){overrides[mode].ground=cluster.ground.near;for(const role of cluster.accents.roles)overrides[mode][role]='#BEF030';}
  const b={pairing:{id:pairing.id},palette:{id:palette.id,overrides}};
  assert.match(boardRefusal(library,b),/refused cluster/);
  assert.equal(boardRefusal(library,b,{ownColours:true}),null);
  const hand=Object.entries(library.fonts).find(([,f])=>f.role==='handwriting')[0];
  b.pairing.headingFrom={family:hand};
  assert.match(boardRefusal(library,b,{ownColours:true}),/handwriting/);
});
test('a new colour answer retains old history without treating old-colour looks as already shown in this set', () => {
  const a=bakery(),old=select('looks',a),ownColours=buildOwnColours('red, white and blue');
  const fresh=select('looks',{...a,ownColours});
  const comment=select('looks',{...a,ownColours,shown:old.options});
  assert.deepEqual(comment.options,fresh.options);
  assert.equal(old.options.length,12);
  assert.throws(()=>select('looks',{...a,ownColours,shown:comment.options}),/looks: library exhausted/);
});
test('bank, sitting, records, lock and journey carry C1-C5 and J1c', () => {
  const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
  const bank=read('questions.md');
  for(const line of ['Type my colours instead','Which colours? Name them, like "red, white and blue", or type their codes.','These use your colours: [colours as they said them].','I deepened your [colour] a little, so words on it stay easy to read.','I don\'t know the colour "[word]". Could you say it another way, or type its code?'])assert.ok(bank.includes(line),line);
  for(const file of ['paths/sitting.md','records.md','lock.md'])assert.match(read(file),/J1c/);
  assert.match(read('paths/sitting.md'),/coloursFromComment/);
  const journey=readFileSync(process.env.BUILD_BRAND_JOURNEY||new URL('../../../../journey.md',import.meta.url),'utf8');
  for(const id of ['C1','C2','C3','C4','C5'])assert.match(journey,new RegExp(id+'[^\\n]*\\(the operator\'s yes of 2026-11-06\\)'));
});
