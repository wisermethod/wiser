import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildOwnColours} from '../scripts/own-colours.mjs';
import {select,selectionForAssembly} from '../scripts/select.mjs';
import {assemble,LIBRARY} from '../scripts/assemble.mjs';
import {bakery} from './select-fixtures.mjs';
const library=JSON.parse(readFileSync(LIBRARY));
const hex=v=>(v.length===4?'#'+[...v.slice(1)].map(c=>c+c).join(''):v).toUpperCase();
export function assertNames(board,own){
 for(const mode of ['light','dark'])for(const sw of [...board.palette.modeSwatches[mode],...board.palette.chips?.[mode]??[]]){
  const value=board.palette[mode][sw.key],member=own.values.find(v=>hex(v.value)===hex(value));
  const label=member?.name??value;
  assert.ok(sw.name===label||sw.name.startsWith(label+' '),`${value}: ${sw.name} expected ${label}`);
 }
 assert.equal(board.energy,own.lines[0]);
}
test('6: own labels survive looks, boards, variations, assembly and resume without board zero or recipe energy coverage',()=>{
 const ownColours=buildOwnColours('red white and blue'),a={...bakery(),ownColours};
 const looks=select('looks',a,{check:true});
 for(const o of looks.options)for(const p of library.palettes)assert.ok(!o.label.includes(p.name)&&!o.steps[0].label.includes(p.name));
 const answers={...a,looks:looks.options.slice(0,3).map(o=>o.value),looksShown:looks.options};
 const round=select('round1',answers,{check:true});
 const resumed=select('round1',{...answers,pageDisplayed:true,displayedBoards:round.selection.boards,mode:'dark'},{check:true});
 const variation=select('variations',{...answers,picks:round.selection.boards.slice(0,2),shown:round.selection.boards},{check:true});
 for(const r of [looks,round,resumed,variation]){
  assert.ok(r.selection.boards.every(b=>!b.zero&&b.number>0));
  for(const b of r.selection.boards){assert.equal(b.energy,ownColours.lines[0]);for(const step of b.steps??[])assert.equal(step.energy,ownColours.lines[0]);}
  const spec=assemble(selectionForAssembly(r.selection),library,{selectionDir:process.cwd()});for(const b of spec.boards)assertNames(b,ownColours);
 }
 assert.ok(round.notes.some(n=>n.includes('not chased')));
 assert.ok(!round.notes.some(n=>n.includes('still covers the available recipe energies')));
});
