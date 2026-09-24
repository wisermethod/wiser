/**
 * data-describe core: descriptive statistics for the numeric columns of a
 * CSV, JSON, or TSV file.
 *
 * executeDescribe reads the content once, decides which columns statistics may
 * run on, and returns one row of statistics per column alongside the columns it
 * skipped and everything that went wrong while reading. It never throws: a file
 * that cannot be read, a file with no numeric columns, and a requested column
 * that does not exist all come back inside the result, because each of those is
 * an answer the caller asked for.
 *
 * The arithmetic lives here rather than in a package: every reduction below is
 * a few lines of the standard library, and the two conventions that are not
 * obvious, a population standard deviation and linear interpolation between the
 * two values a percentile falls between, are stated in TOOL.md and pinned by the
 * tests. This module is imported by scripts/describe.js after its dependency
 * check has run; it is never an entry point itself. The rules every shipped
 * script follows are stated once, in system/templates/Script Contract.md.
 */

import { readTable, toNumber } from './read-core.js';

function round(n) {
  return Math.round(n * 10000) / 10000;
}

// Compensated summation: it carries the rounding error each addition drops and
// adds it back at the end, so a long column of large values does not
// accumulate drift the way a plain running total does.
function sumOf(values) {
  let total = 0;
  let carried = 0;
  for (const v of values) {
    const next = total + v;
    carried += Math.abs(total) >= Math.abs(v) ? total - next + v : v - next + total;
    total = next;
  }
  return total + carried;
}

function meanOf(values) {
  return sumOf(values) / values.length;
}

// Population standard deviation: the spread of the values in hand, not an
// estimate of the spread of a population they were sampled from.
function stdDevOf(values) {
  const avg = meanOf(values);
  let squares = 0;
  for (const v of values) squares += (v - avg) * (v - avg);
  return Math.sqrt(squares / values.length);
}

// Linear interpolation between the two values the percentile falls between.
// The median is the 50th percentile and takes this same path.
function quantileOf(sorted, p) {
  if (p <= 0) return sorted[0];
  if (p >= 1) return sorted[sorted.length - 1];
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (position - lower) * (sorted[upper] - sorted[lower]);
}

function describeColumn(name, rows) {
  const values = [];
  let nullCount = 0;

  for (const row of rows) {
    const num = toNumber(row[name]);
    if (num === null) nullCount++;
    else values.push(num);
  }

  // Reachable only for a column whose type came from values this reading then
  // rejects; the shape stays the same so a caller never has to branch.
  if (values.length === 0) {
    return { name, count: 0, mean: 0, median: 0, min: 0, max: 0, stdDev: 0, p25: 0, p75: 0, nullCount };
  }

  const sorted = [...values].sort((a, b) => a - b);

  return {
    name,
    count: values.length,
    mean: round(meanOf(values)),
    median: round(quantileOf(sorted, 0.5)),
    min: round(sorted[0]),
    max: round(sorted[sorted.length - 1]),
    stdDev: round(stdDevOf(values)),
    p25: round(quantileOf(sorted, 0.25)),
    p75: round(quantileOf(sorted, 0.75)),
    nullCount,
  };
}

/**
 * @param {{ content: string, format?: 'csv'|'json'|'tsv', delimiter?: string, columns?: string[] }} input
 * @returns {{ columns: Array<Record<string, number|string>>, skippedColumns: Array<{ name: string, reason: string }>, totalRows: number, errors: string[] }}
 */
export function executeDescribe(input) {
  const { content, format, delimiter, columns: requestedColumns } = input;

  const table = readTable({ content, format, delimiter });
  if (table.rows.length === 0) {
    return {
      columns: [],
      skippedColumns: [],
      totalRows: 0,
      errors: [...table.readErrors, 'No data rows to analyze'],
    };
  }

  // Rows that were dropped while reading are carried, not swallowed: nothing
  // else in a run of this tool would ever tell the caller they went missing.
  const errors = [...table.readErrors];
  const skippedColumns = [];
  const targetColumns = [];

  if (requestedColumns && requestedColumns.length > 0) {
    const available = table.columns.map((c) => c.name).join(', ');
    for (const name of requestedColumns) {
      const col = table.columns.find((c) => c.name === name);
      if (!col) {
        // Absent from the file, not a skip of a present column.
        errors.push(`Column "${name}" not found. Available: ${available}`);
      } else if (col.type !== 'number') {
        skippedColumns.push({
          name,
          reason: `type is "${col.type}", not numeric`,
        });
        errors.push(`Column "${name}" is type "${col.type}", not numeric. Skipped.`);
      } else {
        targetColumns.push(col);
      }
    }
  } else {
    for (const col of table.columns) {
      if (col.type === 'number') targetColumns.push(col);
      else skippedColumns.push({ name: col.name, reason: `type is "${col.type}", not numeric` });
    }
  }

  if (targetColumns.length === 0) {
    return {
      columns: [],
      skippedColumns,
      totalRows: table.rows.length,
      errors: [...errors, 'No numeric columns to analyze'],
    };
  }

  return {
    columns: targetColumns.map((col) => describeColumn(col.name, table.rows)),
    skippedColumns,
    totalRows: table.rows.length,
    errors,
  };
}
