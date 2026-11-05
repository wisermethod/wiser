import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

// The catalogue follows the replacement library. Container text and font
// commands retain the archived split; the other contracts have explicit pins.
const normalise=text=>text.trim().replace(/\s+/g,' ');
const hash=text=>createHash('sha256').update(normalise(text)).digest('hex');
const CONTRACT_PINS={
  "Locking a board": "87d071c73d79ca8daef0cbab119012396c2cf217b86c449c3c97a0786ea51650",
  "Opening taps as data": "6bee532422333e3937b3067ac9f795d2d346fcb39e42c8718627dc200ad941af",
  "Assembly": "4287bc83f4ec6b0eb7c1189bc666baea1c5173af6a6b253c511a2faad0a80f62",
  "Selection from answers": "d782838ce3d725a5d839d914ce1f473c8d6953ffaa4b0135cc40d82c3ce95360"
};
const CATALOGUE_PINS={
  'Settings and use': '15853880b2650344881e894c98c00cd796493dc1a6f3d390f91bc088287f4dca',
  'Extension seam': 'c67cea0a32be88d06cc00ff1bbacc17ab45028f4c648cf37f3fc3c8881b5843c'
};
function section(text,heading) {
  const marker=`## ${heading}\n`,start=text.indexOf(marker);
  assert.ok(start>=0,`missing parts section: ${heading}`);
  return text.slice(start+marker.length).split(/\n## /,1)[0].trim();
}
export function comparePartsSplit(archive, contract, catalogue) {
  const library=JSON.parse(readFileSync(new URL('../parts/parts.json',import.meta.url)));
  const compared=[];
  const rows=heading=>section(catalogue,heading).split('\n').filter(line=>line.startsWith('| ')).map(line=>line.split('|').slice(1,-1).map(cell=>cell.trim()));
  const pairingRows=rows('Pairings').slice(1);
  assert.deepEqual(pairingRows,library.pairings.map(p=>[p.id,p.name,p.type.heading.family,p.type.body.family,p.handwriting.map(f=>f.family).join(', '),String(p.tags.typeLoudness),p.tags.typeCut,p.tags.softStrong]),'catalogue: Pairings');
  compared.push('catalogue: Pairings');
  assert.deepEqual(rows('Palettes').slice(1),library.palettes.map(p=>[p.id,p.name,p.energy,String(p.paletteLoudness),p.temperature,p.description,p.tags.softStrong]),'catalogue: Palettes');
  compared.push('catalogue: Palettes');
  assert.equal(normalise(section(catalogue,'Containers')),normalise(section(archive,'Containers')),'catalogue: Containers');
  compared.push('catalogue: Containers');
  assert.deepEqual(rows('Graphic sets').slice(1),library.graphics.map(g=>[g.id,g.name,g.description,g.title,g.tags.softStrong]),'catalogue: Graphic sets');
  compared.push('catalogue: Graphic sets');
  for(const [heading,expected] of Object.entries(CATALOGUE_PINS)) {
    assert.equal(hash(section(catalogue,heading)),expected,'catalogue: '+heading);
    compared.push('catalogue: '+heading);
  }
  const licences=section(catalogue,'Font licences and provenance');
  assert.match(licences,/Every licence is SIL Open Font License 1\.1/,'catalogue: font licences');
  assert.deepEqual(rows('Font licences and provenance').slice(1),Object.entries(library.fonts).map(([name,f])=>[name,f.licence,f.reservedFontNames.length?f.reservedFontNames.join(', '):'None declared',String(f.files.reduce((n,v)=>n+v.bytes,0))]),'catalogue: font licences');
  compared.push('catalogue: font licences');
  for(const heading of ['Locking a board','Opening taps as data','Assembly','Selection from answers']) {
    assert.equal(hash(section(contract,heading)),CONTRACT_PINS[heading],`script contract: ${heading}`);
    compared.push('script contract: '+heading);
  }
  const archivedFonts=section(archive,'Font files'),licenceStart=archivedFonts.indexOf('All families are');
  const commandTail=text=>text.slice(text.indexOf('\n\n')+2);
  assert.equal(normalise(commandTail(section(contract,'Font files'))),normalise(commandTail(archivedFonts.slice(0,licenceStart).trim())),'script contract: font commands');
  compared.push('script contract: font commands');
  return compared;
}
