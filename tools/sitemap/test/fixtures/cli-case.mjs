import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
// One CLI argument definition for the suite and the HEAD compatibility proof.
export function cliCase(testCase, scratch) {
  const file = join(scratch, 'index.xml');
  if (testCase.offline) writeFileSync(file, testCase.offline);
  const substitute = (value) => value === '$file' ? file : String(value);
  const args = Object.entries(testCase.input).flatMap(([key, value]) =>
    Array.isArray(value) ? value.flatMap((v) => [key === 'files' ? '--file' : '--url', substitute(v)]) : [`--${key}`, substitute(value)]);
  const expected = JSON.parse(JSON.stringify(testCase.expected).replaceAll('$file', file));
  return { args, expected };
}
