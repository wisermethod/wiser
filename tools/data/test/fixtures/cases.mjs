// One definition consumed by the CLI and Worker proofs. No large file is committed.
export const canary = 'S4b_private_cell_9f361c7d';
const numeric = (count, mean, median, min, max, stdDev, p25, p75) =>
  ({ name: 'value', count, mean, median, min, max, stdDev, p25, p75, nullCount: 0 });
const expected = (columns, totalRows, errors = [], skippedColumns = [{ name: 'label', reason: 'type is "string", not numeric' }]) =>
  ({ columns, skippedColumns, totalRows, errors });
const three = expected([numeric(3, 2, 2, 1, 3, 0.8165, 1.5, 2.5)], 3);
export const cases = [
  { name: 'small CSV', text: 'label,value\na,1\nb,2\nc,3\n', expected: three },
  { name: 'TSV', text: 'label\tvalue\na\t1\nb\t2\nc\t3\n', expected: three },
  { name: 'JSON array', text: '[{"label":"a","value":1},{"label":"b","value":2},{"label":"c","value":3}]', expected: three },
  { name: 'parse failure', text: `label,value\n"${canary},1`, expected: expected([], 0, ['The content could not be parsed as delimited text with delimiter ","', 'No data rows to analyze'], []) },
  { name: 'canary CSV', text: `label,value\n${canary},1\nb,2\nc,3\n`, expected: three },
  { name: 'large CSV', large: true, expected: expected([numeric(100000, 2, 2, 2, 2, 0, 2, 2)], 100000) },
];
export function caseText(c) {
  // 5,000,012 bytes: fixed-width rows, independent of time, randomness and filesystem.
  return c.large ? 'label,value\n' + ('x'.repeat(47) + ',2\n').repeat(100000) : c.text;
}
