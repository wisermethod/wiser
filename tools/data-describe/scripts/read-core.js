/**
 * data-describe reader: turn CSV, JSON, or TSV content into rows plus one type
 * per column, which is all the statistics need to know about the file.
 *
 * readTable never throws. Content it cannot read comes back as no rows and a
 * populated readErrors, so the caller decides what to do rather than catching
 * an exception. It reports only what column a statistic may run on; the full
 * column profile with sample values and non-null counts is a different tool's
 * output, and this reader deliberately stops short of it.
 *
 * This module is imported by scripts/describe-core.js after the dependency
 * check in scripts/describe.js has run; it is never an entry point itself. The
 * rules every shipped script follows are stated once, in
 * system/templates/Script Contract.md.
 */

import { parse as csvParse } from 'csv-parse/sync';

// A column takes a type when at least this share of its non-null values agree.
const TYPE_THRESHOLD = 0.8;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?/;
const COMMON_DATE_RE = /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/;

function detectFormat(content, format) {
  if (format === 'json') return { format: 'json', delimiter: '' };
  if (format === 'tsv') return { format: 'delimited', delimiter: '\t' };
  if (format === 'csv') return { format: 'delimited', delimiter: ',' };

  // Auto-detect from the leading character and the first line.
  const firstLine = content.split('\n')[0] || '';
  if (content.trimStart().startsWith('[') || content.trimStart().startsWith('{')) {
    return { format: 'json', delimiter: '' };
  }
  if (firstLine.includes('\t')) return { format: 'delimited', delimiter: '\t' };
  if (firstLine.includes(';') && !firstLine.includes(',')) return { format: 'delimited', delimiter: ';' };
  if (firstLine.includes('|') && !firstLine.includes(',') && !firstLine.includes('\t')) {
    return { format: 'delimited', delimiter: '|' };
  }
  return { format: 'delimited', delimiter: ',' };
}

/**
 * The one numeric reading in this tool. A value that survives it is a number a
 * statistic may use; everything else, empty or not, counts as absent.
 */
export function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const str = String(value).trim().replace(/[$,\s]/g, '');
  if (str === '') return null;
  const num = Number(str);
  return Number.isNaN(num) || !Number.isFinite(num) ? null : num;
}

function inferType(value) {
  if (value === null || value === undefined || value === '') return null;

  const str = String(value).trim();
  if (str === '') return null;

  // Number first, before boolean, because '0' and '1' are numbers, not booleans.
  if (toNumber(str) !== null) return 'number';

  // Boolean covers only word-form values, not '0'/'1', which read as numbers.
  if (['true', 'false', 'yes', 'no'].includes(str.toLowerCase())) return 'boolean';

  if (ISO_DATE_RE.test(str) || COMMON_DATE_RE.test(str)) return 'date';

  return 'string';
}

function detectColumnType(values) {
  const types = {};
  let nonNull = 0;

  for (const v of values) {
    const t = inferType(v);
    if (t !== null) {
      types[t] = (types[t] || 0) + 1;
      nonNull++;
    }
  }

  if (nonNull === 0) return 'string'; // all null or empty

  for (const [type, count] of Object.entries(types)) {
    if (count / nonNull >= TYPE_THRESHOLD) return type;
  }

  return 'mixed';
}

function readJSON(content) {
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      const rows = parsed.filter(
        (item) => typeof item === 'object' && item !== null && !Array.isArray(item)
      );
      if (rows.length < parsed.length) {
        return { rows, errors: [`${parsed.length - rows.length} of ${parsed.length} array entries were not objects and were skipped`] };
      }
      return { rows, errors: [] };
    }
    return { rows: [], errors: ['JSON content is not an array of objects'] };
  } catch {
    // The parser's own message is withheld: it can quote bytes of the input.
    return { rows: [], errors: ['The content could not be parsed as JSON'] };
  }
}

function readDelimited(content, delimiter) {
  try {
    const rows = csvParse(content, {
      delimiter,
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
    });
    return { rows, errors: [] };
  } catch {
    // Structural cause only; the parser's own message can quote input bytes.
    return {
      rows: [],
      errors: [`The content could not be parsed as delimited text with delimiter ${JSON.stringify(delimiter)}`],
    };
  }
}

/**
 * @param {{ content: string, format?: 'csv'|'json'|'tsv', delimiter?: string }} input
 * @returns {{ rows: Record<string, unknown>[], columns: Array<{ name: string, type: string }>, readErrors: string[] }}
 */
export function readTable(input) {
  const { content, format, delimiter: userDelimiter } = input;

  if (!content || content.trim() === '') {
    return { rows: [], columns: [], readErrors: ['File content is empty'] };
  }

  const detected = detectFormat(content, format);
  const effectiveDelimiter = userDelimiter || detected.delimiter;

  const { rows, errors } =
    detected.format === 'json' ? readJSON(content) : readDelimited(content, effectiveDelimiter);

  if (rows.length === 0) {
    return { rows: [], columns: [], readErrors: errors.length > 0 ? errors : ['No data rows found'] };
  }

  // Collect every column name across all rows; a JSON row may omit a key.
  const colNames = new Set();
  for (const row of rows) {
    for (const key of Object.keys(row)) colNames.add(key);
  }

  const columns = Array.from(colNames).map((name) => ({
    name,
    type: detectColumnType(rows.map((row) => row[name])),
  }));

  return { rows, columns, readErrors: errors };
}
