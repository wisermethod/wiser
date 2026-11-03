import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {comparePartsSplit} from './parts-split.mjs';
const read = path => readFileSync(new URL(`../parts/${path}`, import.meta.url), 'utf8');
const archive = read('zArchive/26-10-31 V1 - parts.md'), contract = read('parts.md'), catalogue = read('catalogue.md');

test('normalised catalogue and script sections match the explicit parts archive', () => {
  assert.equal(comparePartsSplit(archive, contract, catalogue).length, 12);
});
test('parts comparison rejects a gutted catalogue even when the archive still has all ids', () => {
  assert.throws(() => comparePartsSplit(archive, archive, catalogue.replace(/^\|.*\n/gm, '')), /catalogue: Pairings/);
});
test('parts comparison rejects changed cells, licence prose and contract commands', () => {
  assert.throws(() => comparePartsSplit(archive, contract, catalogue.replace('Gentle serif curves', 'Changed serif curves')), /catalogue: Pairings/);
  assert.throws(() => comparePartsSplit(archive, contract, catalogue.replace('Every licence is SIL', 'Every licence was SIL')), /font licences/);
  assert.throws(() => comparePartsSplit(archive, contract.replace('staged in a sibling directory', 'staged elsewhere'), catalogue), /font commands/);
});
