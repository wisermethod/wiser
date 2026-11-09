import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {comparePartsSplit} from './parts-split.mjs';
const read = path => readFileSync(new URL(`../parts/${path}`, import.meta.url), 'utf8');
const archive = read('zArchive/26-10-31 V1 - parts.md'), contract = read('parts.md'), catalogue = read('catalogue.md');

test('catalogue matches the replaced library and retained contracts match their explicit pins', () => {
  assert.equal(comparePartsSplit(archive, contract, catalogue).length, 13);
});
test('parts comparison rejects a gutted catalogue even when the archive still has all ids', () => {
  assert.throws(() => comparePartsSplit(archive, archive, catalogue.replace(/^\|.*\n/gm, '')), /catalogue: Pairings/);
});
test('parts comparison rejects changed cells, licence prose and contract commands', () => {
  assert.throws(() => comparePartsSplit(archive, contract, catalogue.replace('| Bodoni Moda |', '| Changed family |')), /catalogue: Pairings/);
  assert.throws(() => comparePartsSplit(archive, contract, catalogue.replace('Every licence is SIL', 'Every licence was SIL')), /font licences/);
  assert.throws(() => comparePartsSplit(archive, contract.replace('staged in a sibling directory', 'staged elsewhere'), catalogue), /font commands/);
});
test('parts comparison pins catalogue settings and extension text even when length is unchanged', () => {
  for (const heading of ['Settings and use','Extension seam']) {
    const marker=`## ${heading}\n`,start=catalogue.indexOf(marker)+marker.length;
    const end=catalogue.indexOf('\n## ',start);
    const section=catalogue.slice(start,end<0?undefined:end);
    const changed=section.replace(/[A-Za-z]/,letter=>letter==='X'?'Y':'X');
    assert.equal(changed.length,section.length);
    assert.throws(()=>comparePartsSplit(archive,contract,catalogue.slice(0,start)+changed+catalogue.slice(start+section.length)),
      new RegExp('catalogue: '+heading));
  }
});

test('dated own-colour contract pins reject a changed derivation or controls promise', () => {
  assert.throws(()=>comparePartsSplit(archive,contract.replace('0.0001 L','0.001 L'),catalogue), /script contract: Own colours/);
  assert.throws(()=>comparePartsSplit(archive,contract.replace('at one strength; see Own colours','at three strengths; see Own colours'),catalogue), /script contract: Selection from answers/);
});
