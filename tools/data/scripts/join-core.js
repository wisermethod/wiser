/**
 * data-join core: join two CSV, JSON, or TSV tables on a shared key column.
 *
 * executeJoin reads both sides, checks that the key is present, then produces
 * the joined rows for an inner or left join. It never throws: content it cannot
 * read and a key that is missing come back as entries in errors beside an empty
 * row list, so the caller decides what to do rather than catching an exception.
 *
 * Reading lives here rather than being borrowed from a sibling tool: a tool
 * invokes no primitive (standards/primitives.md). This module is imported by
 * scripts/join.js after the dependency check has run, and by the test suite
 * once dependencies are installed; it is never an entry point itself. The rules
 * every shipped script follows are stated once, in
 * system/templates/Script Contract.md.
 */

import { parse as csvParse } from 'csv-parse/sync';

/** The join modes a caller may name. */
export const HOW = ['inner', 'left'];

function detectFormat(content, format) {
  if (format === 'json') return { format: 'json', delimiter: '' };
  if (format === 'tsv') return { format: 'csv', delimiter: '\t' };
  if (format === 'csv') return { format: 'csv', delimiter: ',' };

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

/** Read the rows one side holds. Notes are non-fatal; an empty row list is not. */
function readRows(content, format, delimiter, side) {
  if (!content || content.trim() === '') {
    return { rows: [], notes: [`${side} file content is empty`] };
  }

  const detected = detectFormat(content, format);
  const effectiveDelimiter = delimiter || detected.delimiter;

  if (detected.format === 'json') {
    try {
      const parsed = JSON.parse(content);
      if (!Array.isArray(parsed)) {
        return { rows: [], notes: [`${side}: JSON content is not an array of objects`] };
      }
      const rows = parsed.filter(
        (item) => typeof item === 'object' && item !== null && !Array.isArray(item)
      );
      if (rows.length < parsed.length) {
        return {
          rows,
          notes: [
            `${side}: ${parsed.length - rows.length} of ${parsed.length} array entries were not objects and were skipped`,
          ],
        };
      }
      return { rows, notes: [] };
    } catch {
      // The parser's own message is withheld: it can quote bytes of the input.
      return { rows: [], notes: [`${side}: the content could not be parsed as JSON`] };
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
    return {
      rows: [],
      notes: [
        `${side}: the content could not be parsed as delimited text with delimiter ${JSON.stringify(effectiveDelimiter)}`,
      ],
    };
  }
}

function columnNames(rows) {
  const names = new Set();
  for (const row of rows) {
    for (const key of Object.keys(row)) names.add(key);
  }
  return [...names];
}

function keyOf(value) {
  if (value === null || value === undefined) return 'null';
  return String(value);
}

function emptyResult(errors, extras = {}) {
  return {
    columns: [],
    rows: [],
    leftRows: extras.leftRows ?? 0,
    rightRows: extras.rightRows ?? 0,
    matchedRows: 0,
    how: extras.how ?? 'inner',
    on: extras.on ?? '',
    errors,
  };
}

/**
 * Build the result column list: every left column, then every right column that
 * is not the join key. A right column whose name collides with a left column
 * (other than the key) is renamed to `<name>_right`.
 */
function resultColumns(leftNames, rightNames, on) {
  const leftSet = new Set(leftNames);
  const columns = [...leftNames];
  for (const name of rightNames) {
    if (name === on) continue;
    if (leftSet.has(name)) columns.push(`${name}_right`);
    else columns.push(name);
  }
  return columns;
}

function mapRightColumn(name, on, leftSet) {
  if (name === on) return null;
  if (leftSet.has(name)) return `${name}_right`;
  return name;
}

/**
 * @param {{
 *   leftContent: string,
 *   rightContent: string,
 *   on: string,
 *   how?: 'inner'|'left',
 *   format?: 'csv'|'json'|'tsv',
 *   delimiter?: string,
 * }} input
 * @returns {{
 *   columns: string[],
 *   rows: Record<string, unknown>[],
 *   leftRows: number,
 *   rightRows: number,
 *   matchedRows: number,
 *   how: string,
 *   on: string,
 *   errors: string[],
 * }}
 */
export function executeJoin(input) {
  const { leftContent, rightContent, on, format, delimiter } = input;
  const how = input.how ?? 'inner';

  if (!on || String(on).trim() === '') {
    return emptyResult(['on is required and must name the key column present on both sides'], { how, on: on ?? '' });
  }
  if (!HOW.includes(how)) {
    return emptyResult([`how "${how}" is not one of ${HOW.join(', ')}`], { how, on });
  }

  const left = readRows(leftContent, format, delimiter, 'left');
  const right = readRows(rightContent, format, delimiter, 'right');
  const notes = [...left.notes, ...right.notes];

  if (left.rows.length === 0) {
    return emptyResult(
      [...notes, ...(left.notes.length > 0 ? [] : ['left: no data rows found'])],
      { leftRows: 0, rightRows: right.rows.length, how, on }
    );
  }
  if (right.rows.length === 0 && how === 'inner') {
    return emptyResult(
      [...notes, ...(right.notes.length > 0 ? [] : ['right: no data rows found'])],
      { leftRows: left.rows.length, rightRows: 0, how, on }
    );
  }

  const leftNames = columnNames(left.rows);
  const rightNames = columnNames(right.rows);
  const rejections = [];

  if (!leftNames.includes(on)) {
    rejections.push(
      `left key column "${on}" not found. Available: ${leftNames.join(', ') || '(none)'}`
    );
  }
  if (right.rows.length > 0 && !rightNames.includes(on)) {
    rejections.push(
      `right key column "${on}" not found. Available: ${rightNames.join(', ') || '(none)'}`
    );
  }

  if (rejections.length > 0) {
    return emptyResult([...notes, ...rejections], {
      leftRows: left.rows.length,
      rightRows: right.rows.length,
      how,
      on,
    });
  }

  // Index the right side by key. One key can map to many rows (one-to-many).
  const rightIndex = new Map();
  for (const row of right.rows) {
    const key = keyOf(row[on]);
    const bucket = rightIndex.get(key);
    if (bucket) bucket.push(row);
    else rightIndex.set(key, [row]);
  }

  const leftSet = new Set(leftNames);
  const columns = resultColumns(leftNames, rightNames, on);
  const rows = [];
  let matchedRows = 0;

  for (const leftRow of left.rows) {
    const key = keyOf(leftRow[on]);
    const matches = rightIndex.get(key);

    if (matches && matches.length > 0) {
      for (const rightRow of matches) {
        const out = {};
        for (const name of leftNames) out[name] = leftRow[name] ?? null;
        for (const name of rightNames) {
          const dest = mapRightColumn(name, on, leftSet);
          if (dest === null) continue;
          out[dest] = rightRow[name] ?? null;
        }
        rows.push(out);
        matchedRows += 1;
      }
    } else if (how === 'left') {
      const out = {};
      for (const name of leftNames) out[name] = leftRow[name] ?? null;
      for (const name of rightNames) {
        const dest = mapRightColumn(name, on, leftSet);
        if (dest === null) continue;
        out[dest] = null;
      }
      rows.push(out);
    }
  }

  return {
    columns,
    rows,
    leftRows: left.rows.length,
    rightRows: right.rows.length,
    matchedRows,
    how,
    on,
    errors: notes,
  };
}
