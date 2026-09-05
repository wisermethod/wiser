/**
 * data-parse core: turn CSV, JSON, or TSV content into a column profile.
 *
 * executeParse detects the format, reads the rows, and reports each column's
 * name, detected type, non-null count, and up to five sample values, alongside
 * the row count and any parse errors. It never throws: a file it cannot read
 * comes back as a profile with an empty column list and a populated parseErrors,
 * so the caller decides what to do rather than catching an exception.
 *
 * This module is imported by scripts/parse.js after the dependency check has
 * run, and by the test suite once dependencies are installed; it is never an
 * entry point itself. The rules every shipped script follows are stated once,
 * in system/templates/Script Contract.md.
 */

import { parse as csvParse } from 'csv-parse/sync';

const MAX_SAMPLE_VALUES = 5;
// A column takes a type when at least this share of its non-null values agree;
// below it, the column reads as mixed.
const TYPE_THRESHOLD = 0.8;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?/;
const COMMON_DATE_RE = /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/;

function detectFormat(content, format) {
  if (format === 'json') return { format: 'json', delimiter: '' };
  if (format === 'tsv') return { format: 'csv', delimiter: '\t' };
  if (format === 'csv') return { format: 'csv', delimiter: ',' };

  // Auto-detect from the first line and the leading character.
  const firstLine = content.split('\n')[0] || '';
  if (content.trimStart().startsWith('[') || content.trimStart().startsWith('{')) {
    return { format: 'json', delimiter: '' };
  }
  if (firstLine.includes('\t')) return { format: 'csv', delimiter: '\t' };
  if (firstLine.includes(';') && !firstLine.includes(',')) return { format: 'csv', delimiter: ';' };
  if (firstLine.includes('|') && !firstLine.includes(',') && !firstLine.includes('\t')) {
    return { format: 'csv', delimiter: '|' };
  }
  return { format: 'csv', delimiter: ',' };
}

function inferType(value) {
  if (value === null || value === undefined || value === '') return null;

  const str = String(value).trim();
  if (str === '') return null;

  // Number first, before boolean, because '0' and '1' are numbers, not booleans.
  const numStr = str.replace(/[$,\s]/g, '');
  if (numStr !== '' && !isNaN(Number(numStr)) && isFinite(Number(numStr))) return 'number';

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

function parseJSON(content) {
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

function parseCSV(content, delimiter, hasHeader) {
  const errors = [];
  try {
    // Always parse as arrays so a row's field count is visible. With columns
    // true, a short or long row is quietly reshaped and the unevenness is lost.
    const records = csvParse(content, {
      delimiter,
      columns: false,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
    });

    if (!Array.isArray(records) || records.length === 0) {
      return { rows: [], errors, raggedRowCount: 0 };
    }

    let colNames;
    let dataRecords;
    if (hasHeader) {
      colNames = records[0].map((name, i) => {
        const text = name === null || name === undefined ? '' : String(name).trim();
        return text === '' ? `column_${i + 1}` : text;
      });
      dataRecords = records.slice(1);
    } else {
      const width = Array.isArray(records[0]) ? records[0].length : 0;
      colNames = Array.from({ length: width }, (_, i) => `column_${i + 1}`);
      dataRecords = records;
    }

    const expectedWidth = colNames.length;
    let raggedRowCount = 0;
    const rows = dataRecords.map((row) => {
      if (!Array.isArray(row) || row.length !== expectedWidth) raggedRowCount += 1;
      const obj = {};
      // Short rows fill missing columns as null; long rows drop the extras.
      // Either way the row still contributes, and the unevenness is counted.
      for (let i = 0; i < expectedWidth; i += 1) {
        obj[colNames[i]] = i < row.length ? row[i] : null;
      }
      return obj;
    });

    if (raggedRowCount > 0) {
      errors.push(
        `${raggedRowCount} of ${dataRecords.length} data rows had a column count different from the header (${expectedWidth}); short rows filled missing columns as null and long rows dropped extra values`
      );
    }

    return { rows, errors, raggedRowCount };
  } catch {
    // Structural cause only; the parser's own message can quote input bytes.
    return { rows: [], errors: [`The content could not be parsed as delimited text with delimiter ${JSON.stringify(delimiter)}`], raggedRowCount: 0 };
  }
}

/**
 * @param {{ content: string, format?: 'csv'|'json'|'tsv', delimiter?: string, hasHeader?: boolean }} input
 * @returns {{ columns: Array<{ name: string, type: string, nonNullCount: number, sampleValues: unknown[] }>, rowCount: number, raggedRowCount: number, parseErrors: string[] }}
 */
export function executeParse(input) {
  const { content, delimiter: userDelimiter, hasHeader = true } = input;

  if (!content || content.trim() === '') {
    return { columns: [], rowCount: 0, raggedRowCount: 0, parseErrors: ['File content is empty'] };
  }

  const detected = detectFormat(content, input.format);
  const effectiveDelimiter = userDelimiter || detected.delimiter;

  let rows;
  let errors;
  let raggedRowCount = 0;
  if (detected.format === 'json') {
    ({ rows, errors } = parseJSON(content));
  } else {
    ({ rows, errors, raggedRowCount } = parseCSV(content, effectiveDelimiter, hasHeader));
  }

  if (rows.length === 0) {
    return {
      columns: [],
      rowCount: 0,
      raggedRowCount: 0,
      parseErrors: errors.length > 0 ? errors : ['No data rows found'],
    };
  }

  // Collect every column name across all rows.
  const colNamesSet = new Set();
  for (const row of rows) {
    for (const key of Object.keys(row)) colNamesSet.add(key);
  }
  const colNames = Array.from(colNamesSet);

  const columns = colNames.map((name) => {
    const values = rows.map((row) => row[name]);
    const nonNullValues = values.filter((v) => v !== null && v !== undefined && v !== '');
    const sampleValues = nonNullValues
      .slice(0, MAX_SAMPLE_VALUES)
      .map((v) => (typeof v === 'string' ? v.trim() : v));

    return {
      name,
      type: detectColumnType(values),
      nonNullCount: nonNullValues.length,
      sampleValues,
    };
  });

  return { columns, rowCount: rows.length, raggedRowCount, parseErrors: errors };
}
