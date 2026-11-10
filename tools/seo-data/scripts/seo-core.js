import { checkAnswerSize } from './answer-size.js';
import { readZip } from '../../lib/archive-core.js';
import { auditReport } from './audit-core.js';
import { keywordReport } from './keywords-report-core.js';
const INPUT_CAP = 8 * 1024 * 1024;
const fail = message => { throw new Error(message); };
/** JSON arguments use the CLI flag names without --; ZIP paths are relative.
 * output:true returns a JSON file. CLI adapters alone own disk destinations.
 */
export async function seoData(input = {}, files = []) {
  if (!Array.isArray(files) || files.length > 1) fail('Error: supply one export file or one ZIP of exports.');
  if (new TextEncoder().encode(JSON.stringify(input)).length > INPUT_CAP) fail('Error: arguments exceed 8 MiB.');
  let entries = files;
  if (files.length) {
    const file = files[0];
    if (!(file.bytes instanceof Uint8Array) || file.bytes.length > INPUT_CAP) fail('Error: input exceeds 8 MiB or is not bytes.');
    if (/\.zip$/i.test(file.name) || file.mediaType === 'application/zip') entries = await readZip(file.bytes, { maxBytes: INPUT_CAP });
  }
  const read = (name, what) => {
    const entry = entries.find(file => file.name === name);
    if (!entry) fail(`Error: the supplied file or ZIP has no file named ${name} for ${what}.`);
    return new TextDecoder('utf-8').decode(entry.bytes);
  };
  let answer;
  if (input.command === 'audit') {
    const name = input.input || (entries.length === 1 ? entries[0].name : 'audit-input.json');
    let bundle;
    try { bundle = JSON.parse(read(name, 'the audit input bundle')); }
    catch (error) { if (error.message.startsWith('Error:')) throw error; fail(`Error: ${name} is not JSON. Pass the audit input bundle described in TOOL.md.`); }
    answer = auditReport(bundle, name);
  } else if (input.command === 'keywords' || input.command === 'previous-window') {
    const args = { ...input };
    if (input.command === 'keywords' && !args.queries && entries.length === 1) args.queries = entries[0].name;
    const aliases = input.labels || {};
    // Preserve CLI diagnostic paths while reads remain confined to supplied bytes.
    for (const key of ['queries', 'query-pages', 'previous-queries', 'targets']) if (aliases[args[key]]) args[key] = aliases[args[key]];
    answer = keywordReport(args, (name, what) => read(Object.keys(aliases).find(key => aliases[key] === name) || name, what));
  } else fail('Error: hosted command must be audit, keywords or previous-window.');
  checkAnswerSize(JSON.stringify(answer).length);
  if (!input.output) return answer;
  const bytes = new TextEncoder().encode(`${JSON.stringify(answer, null, 2)}\n`);
  if (bytes.length > 4 * 1024 * 1024) fail('Error: output files exceed 4 MiB; refused whole.');
  return { answer, files: [{ name: `seo-keywords-${new Date().toISOString().slice(0, 10)}.json`, mediaType: 'application/json', bytes }] };
}
