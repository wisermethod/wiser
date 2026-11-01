import assert from 'node:assert/strict';

// Only layout whitespace and the documented section move are normalised.
// Table cells, prose, settings and licence text remain part of the comparison.
const normalise = text => text.trim().replace(/\s+/g, ' ');
function section(text, heading) {
  const marker = `## ${heading}\n`, start = text.indexOf(marker);
  assert.ok(start >= 0, `missing parts section: ${heading}`);
  const body = text.slice(start + marker.length);
  return body.split(/\n## /, 1)[0].trim();
}
export function comparePartsSplit(archive, contract, catalogue) {
  const compared = [];
  for (const heading of ['Pairings', 'Settings and use', 'Extension seam', 'Palettes', 'Containers', 'Graphic sets']) {
    assert.equal(normalise(section(catalogue, heading)), normalise(section(archive, heading)), `catalogue: ${heading}`);
    compared.push(`catalogue: ${heading}`);
  }
  const archivedFonts = section(archive, 'Font files');
  const licenceStart = archivedFonts.indexOf('All families are');
  assert.ok(licenceStart > 0, 'archive must contain font commands followed by provenance');
  assert.equal(normalise(section(catalogue, 'Font licences and provenance')), normalise(archivedFonts.slice(licenceStart)), 'catalogue: font licences and provenance');
  compared.push('catalogue: font licences and provenance');
  for (const heading of ['Locking a board', 'Assembly', 'Opening taps as data', 'Selection from answers']) {
    assert.equal(normalise(section(contract, heading)), normalise(section(archive, heading)), `script contract: ${heading}`);
    compared.push(`script contract: ${heading}`);
  }
  // The first Font files paragraph intentionally delegates fetch permission to
  // SKILL.md. Compare the remaining command contract against its archived span.
  const commandTail = text => text.slice(text.indexOf('\n\n') + 2);
  assert.equal(normalise(commandTail(section(contract, 'Font files'))), normalise(commandTail(archivedFonts.slice(0, licenceStart).trim())), 'script contract: font commands');
  compared.push('script contract: font commands');
  return compared;
}
