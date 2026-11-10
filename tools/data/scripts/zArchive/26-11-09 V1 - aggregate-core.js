/**
 * data-aggregate core: turn CSV, JSON, or TSV content into one aggregate row
 * per group.
 *
 * executeAggregate detects the format, reads the rows, checks the requested
 * columns against what the file actually holds, then groups the rows and
 * computes each metric over each group. It never throws: content it cannot
 * read, a column that is not there, and a metric column that is not numeric all
 * come back as entries in errors beside an empty group list, so the caller
 * decides what to do rather than catching an exception.
 *
 * Reading and column typing live here rather than being borrowed from the
 * sibling profiling tool: a tool invokes no primitive (standards/primitives.md),
 * so the mechanism this one needs in order to know a column is numeric is its
 * own. This module is imported by scripts/aggregate.js after the dependency
 * check has run, and by the test suite once dependencies are installed; it is
 * never an entry point itself. The rules every shipped script follows are
 * stated once, in system/templates/Script Contract.md.
 */

import { parse as csvParse } from 'csv-parse/sync';

// A column takes a type when at least this share of its non-null values agree;
// below it the column reads as mixed, and only count will run on it.
const TYPE_THRESHOLD = 0.8;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?/;
const COMMON_DATE_RE = /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/;

/** The aggregate functions a metric may name. */
export const FUNCTIONS = ['sum', 'mean', 'median', 'min', 'max', 'count'];

function detectFormat(content, format) {
  if (format === 'json') return { format: 'json', delimiter: '' };
  if (format === 'tsv') return { format: 'csv', delimiter: '\t' };
  if (format === 'csv') return { format: 'csv', delimiter: ',' };

  // Auto-detect from the leading character and the first line.
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

function parseNumericValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const str = String(value).trim().replace(/[$,\s]/g, '');
  if (str === '') return null;
  const num = Number(str);
  return isNaN(num) || !isFinite(num) ? null : num;
}

/** Read the rows the content holds. Notes are non-fatal; an empty row list is not. */
function readRows(content, format, delimiter) {
  const detected = detectFormat(content, format);
  const effectiveDelimiter = delimiter || detected.delimiter;

  if (detected.format === 'json') {
    try {
      const parsed = JSON.parse(content);
      if (!Array.isArray(parsed)) {
        return { rows: [], notes: ['JSON content is not an array of objects'] };
      }
      const rows = parsed.filter(
        (item) => typeof item === 'object' && item !== null && !Array.isArray(item)
      );
      if (rows.length < parsed.length) {
        return {
          rows,
          notes: [`${parsed.length - rows.length} of ${parsed.length} array entries were not objects and were skipped`],
        };
      }
      return { rows, notes: [] };
    } catch {
      // The parser's own message is withheld: it can quote bytes of the input.
      return { rows: [], notes: ['The content could not be parsed as JSON'] };
    }
  }

  try {
    const records = csvParse(content, {
      delimiter: effectiveDelimiter,
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
    });
    return { rows: records, notes: [] };
  } catch {
    // Structural cause only; the parser's own message can quote input bytes.
    return {
      rows: [],
      notes: [`The content could not be parsed as delimited text with delimiter ${JSON.stringify(effectiveDelimiter)}`],
    };
  }
}

/** Every column name across all rows, each with the type its values agree on. */
function columnTypes(rows) {
  const names = new Set();
  for (const row of rows) {
    for (const key of Object.keys(row)) names.add(key);
  }

  const types = new Map();
  for (const name of names) {
    types.set(name, detectColumnType(rows.map((row) => row[name])));
  }
  return types;
}

// Compensated summation: the running error is tracked and added back at the
// end, so a long column of small values does not drift the way a plain fold
// does. Every aggregate below is built on it rather than on a package.
function sum(values) {
  let total = 0;
  let compensation = 0;
  for (const v of values) {
    const next = total + v;
    compensation += Math.abs(total) >= Math.abs(v) ? total - next + v : v - next + total;
    total = next;
  }
  return total + compensation;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const half = sorted.length / 2;
  return sorted.length % 2 === 1
    ? sorted[Math.floor(half)]
    : (sorted[half - 1] + sorted[half]) / 2;
}

// Folded rather than spread into Math.min: a single group can hold more values
// than an argument list accepts, and the spread form fails at that size.
function extreme(values, keepLeft) {
  let out = values[0];
  for (const v of values) {
    if (keepLeft(v, out)) out = v;
  }
  return out;
}

function round(n) {
  return Math.round(n * 10000) / 10000;
}

// NO VALUES IS NOT ZERO, EXCEPT WHERE IT GENUINELY IS.
//
// This returned 0 for every function over an empty set, so a group whose rows
// all carry a blank in the metric column reported `revenue_mean: 0` -- read by
// anyone as "that group averaged zero revenue" rather than "that group had no
// revenue figures". Round 11 found it; `data-describe` gets the same situation
// right by reporting `nullCount` beside the statistics.
//
// `count` of nothing is 0 and `sum` of nothing is 0, which are the two answers
// that are true. A mean, median, min or max over no values does not exist, and
// `null` is how the rest of this repository says so -- the same convention the
// other primitives use for a figure that was not produced.
function computeAggregate(values, fn) {
  if (values.length === 0) return (fn === 'count' || fn === 'sum') ? 0 : null;
  switch (fn) {
    case 'sum': return round(sum(values));
    case 'mean': return round(sum(values) / values.length);
    case 'median': return round(median(values));
    case 'min': return round(extreme(values, (v, best) => v < best));
    case 'max': return round(extreme(values, (v, best) => v > best));
    case 'count': return values.length;
    default: return 0;
  }
}

function noGroups(errors, totalRows = 0) {
  return { groups: [], groupCount: 0, totalRows, errors };
}

/**
 * @param {{ content: string, format?: 'csv'|'json'|'tsv', delimiter?: string, groupBy: string[], metrics: Array<{ column: string, function: string }> }} input
 * @returns {{ groups: Array<{ key: Record<string, string>, values: Record<string, number> }>, groupCount: number, totalRows: number, errors: string[] }}
 */
export function executeAggregate(input) {
  const { content, format, delimiter, groupBy, metrics } = input;

  if (!Array.isArray(groupBy) || groupBy.length === 0) {
    return noGroups(['groupBy is required and must name at least one column']);
  }
  if (!Array.isArray(metrics) || metrics.length === 0) {
    return noGroups(['metrics is required and must name at least one column and function']);
  }
  if (!content || content.trim() === '') {
    return noGroups(['File content is empty', 'No data rows to aggregate']);
  }

  const { rows, notes } = readRows(content, format, delimiter);
  if (rows.length === 0) {
    return noGroups([...(notes.length > 0 ? notes : ['No data rows found']), 'No data rows to aggregate']);
  }

  // Requested columns are checked against the file before anything is computed,
  // so a typo comes back naming what the file does hold.
  const types = columnTypes(rows);
  const available = [...types.keys()];
  const rejections = [];

  for (const col of groupBy) {
    if (!types.has(col)) {
      rejections.push(`groupBy column "${col}" not found. Available: ${available.join(', ')}`);
    }
  }

  for (const m of metrics) {
    if (!FUNCTIONS.includes(m.function)) {
      rejections.push(`Metric function "${m.function}" is not one of ${FUNCTIONS.join(', ')}`);
    } else if (!types.has(m.column)) {
      rejections.push(`Metric column "${m.column}" not found. Available: ${available.join(', ')}`);
    } else if (m.function !== 'count' && types.get(m.column) !== 'number') {
      rejections.push(
        `Metric column "${m.column}" is type "${types.get(m.column)}", not numeric. Only count works on a non-numeric column.`
      );
    }
  }

  if (rejections.length > 0) {
    return noGroups([...notes, ...rejections], rows.length);
  }

  // Group. The map key is the JSON form of the value tuple, so no value can
  // carry a separator and split back into a different tuple than it went in as.
  const groupMap = new Map();
  for (const row of rows) {
    const key = {};
    for (const col of groupBy) key[col] = String(row[col] ?? 'null');
    const id = JSON.stringify(groupBy.map((col) => key[col]));
    const existing = groupMap.get(id);
    if (existing) existing.rows.push(row);
    else groupMap.set(id, { key, rows: [row] });
  }

  const groups = [];
  for (const group of groupMap.values()) {
    const values = {};
    for (const m of metrics) {
      const field = `${m.column}_${m.function}`;
      if (m.function === 'count') {
        values[field] = group.rows.length;
      } else {
        const numbers = [];
        for (const row of group.rows) {
          const num = parseNumericValue(row[m.column]);
          if (num !== null) numbers.push(num);
        }
        values[field] = computeAggregate(numbers, m.function);
      }
    }
    groups.push({ key: group.key, values });
  }

  groups.sort((a, b) => (a.key[groupBy[0]] ?? '').localeCompare(b.key[groupBy[0]] ?? ''));

  return { groups, groupCount: groups.length, totalRows: rows.length, errors: notes };
}
