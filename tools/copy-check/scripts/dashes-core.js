/** Portable single-file dash check; disk and argument parsing stay in the CLI. */
import { parseDocument, mergeRanges } from './lib/document.js';
export const MAX_INPUT_BYTES = 64 * 1024;
const EM_DASH = String.fromCodePoint(0x2014);
const fail = message => { throw new Error(message); };

function contains(index, ranges) {
  let low = 0, high = ranges.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (ranges[middle][0] <= index) low = middle + 1;
    else high = middle;
  }
  return low > 0 && index < ranges[low - 1][1];
}

function evaluateDashes(parsed) {
  const quotations = mergeRanges(parsed.exemptions.quotations);
  const titles = mergeRanges(parsed.exemptions.titles);
  const chars = Array.from(parsed.text);
  const hits = [];
  let counted = 0, exempt = 0, index = 0, line = 1, column = 1;
  for (let i = 0; i < chars.length; i++) {
    const char = chars[i], point = char.codePointAt(0);
    if (point === 0x2014 || point === 0x2013) {
      const context = contains(index, quotations) ? 'quotation' : contains(index, titles) ? 'title' : 'text';
      if (context === 'quotation') exempt++; else counted++;
      hits.push({ line, column, character: point === 0x2014 ? 'U+2014' : 'U+2013', context,
        excerpt: chars.slice(Math.max(0, i - 20), Math.min(chars.length, i + 21)).join('').replace(/\s+/g, ' ') });
    }
    if (point === 0x0A) { line++; column = 1; }
    else if (point !== 0x0D) column++;
    index += char.length;
  }
  return { command: 'dashes', pass: counted === 0, units: parsed.units.length,
    characters: parsed.characters, bomStripped: parsed.bomStripped, skippedFences: parsed.skippedFences,
    counted, exempt, charactersScanned: chars.length, hits };
}

export async function checkDashes(input, files) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => k !== 'command') || input.command !== undefined && input.command !== 'dashes') fail('Error: hosted copy-check accepts only dashes with no other arguments.');
  if (!Array.isArray(files) || files.length !== 1 || typeof files[0]?.name !== 'string' || typeof files[0]?.mediaType !== 'string' || !(files[0]?.bytes instanceof Uint8Array)) fail('Error: supply exactly one file with name, mediaType and Uint8Array bytes.');
  const file = files[0];
  if (file.bytes.byteLength > MAX_INPUT_BYTES) fail('Error: the input file exceeds 64 KiB; use a smaller copy file.');
  let copyText;
  try { copyText = new TextDecoder('utf-8', { fatal: true }).decode(file.bytes); }
  catch { fail(`Error: --copy at ${file.name} is not valid UTF-8. Pass a UTF-8 file.`); }
  const result = evaluateDashes(parseDocument(copyText));
  const planted = `${copyText}\n\nPlanted ${EM_DASH} marker.\n`;
  const control = evaluateDashes(parseDocument(planted));
  if (control.counted !== result.counted + 1) fail('Error: dashes control did not fire. A zero that cannot be shown to be a real zero is not reported.');
  const answer = { ...result, control: { planted: 'U+2014', fired: true } };
  if (JSON.stringify(answer).length > 48000) fail('Error: the answer exceeds 48,000 serialized characters; use a smaller copy file.');
  // This command returns JSON only, so its total output-file bytes are zero.
  return answer;
}
