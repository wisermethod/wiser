import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {assembleCore} from '../scripts/assemble-core.mjs';
import {assemble,LIBRARY} from '../scripts/assemble.mjs';
import {board,selection} from './selections.mjs';
const library=JSON.parse(readFileSync(LIBRARY));
test('pure assembly has no imports or file/runtime access and leaves choices untouched',()=>{
 const source=readFileSync(new URL('../scripts/assemble-core.mjs',import.meta.url),'utf8');assert.doesNotMatch(source,/^import |\b(?:Buffer|process|require|readFile)\b/m);
 vm.runInNewContext(source.replace(/\bexport /g,''),{structuredClone});
 const s=selection([board(library)],library),before=structuredClone(s),pure=assembleCore(s,library),disk=assemble(s,library);
 for(const role of Object.keys(disk.boards[0].type))disk.boards[0].type[role].files=pure.boards[0].type[role].files;
 assert.deepEqual(disk,pure);assert.deepEqual(s,before);
});
test('assembly accepts caller mark caption and nullable closing without changing defaults',()=>{
 for(const closing of [null,'Which is closest?']){const s=selection([board(library)],library);Object.assign(s.boards[0].content,{markCaption:'A place for your logo.',closing});assert.deepEqual(assemble(s,library).boards[0].content,s.boards[0].content);}
 for(const value of ['',1,false]){const s=selection([board(library)],library);s.boards[0].content.closing=value;assert.throws(()=>assemble(s,library),/closing/);}
});

test('simple path wires the bank caption through assembly while other boards retain their default',()=>{
 const caption='These initials hold the place of a logo. Ask for a logo any time.';
 const path=readFileSync(new URL('../paths/simple.md',import.meta.url),'utf8'),bank=readFileSync(new URL('../questions.md',import.meta.url),'utf8');
 assert.ok(bank.includes('> '+caption));assert.ok(path.includes('`content.markCaption`'));assert.ok(path.includes(caption));
 const s=selection([board(library)],library);s.boards[0].content.markCaption=caption;s.footnote=caption;
 assert.equal(assemble(s,library).boards[0].content.markCaption,caption);assert.equal(assemble(s,library).footnote,caption);
 const ordinary=selection([board(library)],library);assert.ok(!Object.hasOwn(assemble(ordinary,library).boards[0].content,'markCaption'));
});


test('m51-r3: one locked board drops unused page groups without changing choices', () => {
  const first = board(library);
  // Retain the page metadata after reducing its board array to the locked pick.
  const s = selection([first], library);
  s.groups.push({ id: 'unused', label: 'Unused page group' });
  const before = structuredClone(s), expected = assembleCore(selection([first], library), library);
  assert.deepEqual(assembleCore(s, library), expected);
  assert.deepEqual(assemble(s, library), assemble(selection([first], library), library));
  assert.deepEqual(s, before);
  const multi = structuredClone(s); multi.boards.push({ ...first, number: 2 });
  assert.throws(() => assembleCore(multi, library), /empty group/);
  const unknown = structuredClone(s); unknown.boards[0].group = 'missing';
  assert.throws(() => assembleCore(unknown, library), /unknown group/);
  const malformed = structuredClone(s); malformed.groups[1].typo = true;
  assert.throws(() => assembleCore(malformed, library), /unknown field/);
  assert.match(readFileSync(new URL('../lock.md', import.meta.url), 'utf8'), /single.board[^\n]*empty groups|empty groups[^\n]*single.board/i);
});
