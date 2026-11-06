import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildOwnColours, coloursFromComment, wcag, oklch, full, minimumLightnessMove} from '../scripts/own-colours.mjs';
import {select} from '../scripts/select.mjs';
import {bakery} from './select-fixtures.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
for(const said of ['black and white','just black','navy and blue','#181a1b and #181A1B','#162D50 and #172E51'])test(`1: visible pop and mark: ${said}`,()=>{
 const r=buildOwnColours(said);for(const c of Object.values(r.kept.palette.overrides))for(const role of ['pop','mark'])assert.ok(wcag(c[role],c.ground)>=1.5,role);
});
for(const said of ['just white','cream','snow','ivory','chalk'])test(`2: single light colour: ${said}`,()=>{
 const r=buildOwnColours(said),p=r.kept.palette.overrides;
 assert.equal(p.light.ground,'#FFFFFF');assert.equal(p.light.text,'#181A1B');assert.equal(p.dark.ground,'#181A1B');
 assert.notEqual(p.light.pop.toUpperCase(),r.values[0].value.toUpperCase());assert.equal(p.light.onPop,'#FFFFFF');
 if(said!=='just white')assert.ok([p.light.panel,p.light.mark].includes(r.values[0].value));
});
test('3: C4 only names moved input hexes, once per value, with measured direction',()=>{
 for(const said of ['#737373 and white','grey and white','green and gold','#FF0000','#F00']){
  const r=buildOwnColours(said),seen=new Set();
  for(const line of r.lines.slice(1)){
   const m=r.moves.find(m=>r.values.some(v=>v.name===m.colour&&v.value===m.from)&&line===`I ${m.direction} your ${m.colour} a little, so words on it stay easy to read.`);
   assert.ok(m,`${said}: ${line}`);assert.ok(!seen.has(m.from));seen.add(m.from);
   assert.equal(m.direction,oklch(m.to).L>oklch(m.from).L?'lightened':'deepened');
  }
  assert.ok(!r.lines.includes('I lightened your white a little, so words on it stay easy to read.'));
 }
});
test('4: whitespace names, longest names, opaque alpha and unknown prose',()=>{
 assert.deepEqual(buildOwnColours('red white and blue').values.map(v=>v.name),['red','white','blue']);
 assert.deepEqual(buildOwnColours('forest green royal blue').values.map(v=>v.name),['forest green','royal blue']);
 assert.equal(buildOwnColours('#B22234fF').values[0].value,'#B22234');
 for(const said of ['#FF000080','#FF000000','the colours of a sunset','my brand\'s teal'])assert.deepEqual(buildOwnColours(said).unknown,[said]);
});
test('5: comments distinguish requests and entire sets from steer and prose',()=>{
 for(const said of ['less red','more red','too much red','not so red','without red','I like red','Use less red'])assert.equal(coloursFromComment(said).status,'steer',said);
 for(const said of ['red white and blue','Use red and blue','Please use forest green and gold','I want red and white'])assert.equal(coloursFromComment(said).status,'ready',said);
 assert.equal(coloursFromComment('Use blurple').status,'unknown');
 assert.match(read('paths/sitting.md'),/less, more, too, not or without/);
});
test('7: recomputed sub and note, and composites, pass every board at select --check',()=>{
 for(const said of ['black and white','just white','cream','snow','ivory','chalk','navy and blue','red white and blue','#737373 and white','grey and white','#FF0000','#F00','yellow','green and gold']){
  const ownColours=buildOwnColours(said);
  for(const [mode,c] of Object.entries(ownColours.kept.palette.overrides)){
   for(const role of ['sub','note'])assert.ok(wcag(c[role],c.ground)>=4.5,`${said} ${mode} ${role}`);
   // The filed roles derive from the repaired base; reading may move them further.
   const derived=full(c,mode);assert.ok(derived.sub);
  }
  const page=select('round1',{...bakery(),looksShown:[],ownColours},{check:true});
  assert.ok(page.checks);assert.equal(page.selection.boards.length,12);
 }
});
test('8: endpoint surface repairs allow chroma softening',()=>{
 const passes=v=>wcag('#FFFFFF',v)>=4.5;assert.throws(()=>minimumLightnessMove('#FF0000',passes));assert.ok(passes(minimumLightnessMove('#FF0000',passes,{soften:true}).value));
 const source=read('scripts/own-colours.mjs');assert.match(source,/move\(c\[bg\],onSurface,[^;\n]*mode,true\)/);
});
test('9: sitting projects typed palette ahead of guide colours, retaining fonts',()=>{
 const ownColours=buildOwnColours('red white and blue'),guide=buildOwnColours('green and gold');
 const kept={palette:guide.kept.palette,headingFrom:'editorial-classic'};
 const library=JSON.parse(read('parts/parts.json'));kept.headingFrom=library.pairings.find(p=>p.selectable!==false).id;
 // The sitting sends only the latest colour source to selection.
 const a={...bakery(),ownColours,kept:{...kept,palette:ownColours.kept.palette}};
 const result=select('looks',a);
 for(const option of result.options){assert.deepEqual(option.board.palette.overrides,ownColours.kept.palette.overrides);assert.equal(option.board.pairing.headingFrom,kept.headingFrom);}
 assert.match(read('paths/sitting.md'),/typed colours win/i);
});
test('10: contract keeps own-colour controls and permits chroma repairs',()=>{
 const parts=read('parts/parts.md');assert.ok(!parts.includes('Reading repair never reduces C.'));
 const selection=parts.slice(parts.indexOf('## Selection from answers'));
 assert.match(selection,/own colours[^\n]*Light\s*\/\s*Dark[^\n]*More muted[^\n]*More bold/i);
});
