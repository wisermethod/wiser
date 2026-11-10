/** Single-file data actions. Only portable code belongs in this import graph.
 * Lazy imports preserve compute's ability to run without the CSV package.
 */
export const MAX_INPUT_BYTES = 8 * 1024 * 1024;
export const MAX_ANSWER_CHARACTERS = 48000;
export const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
export const MAX_ROWS = 50000;
export const MAX_COLUMNS = 2048;
export const MAX_TABLE_CELLS = 250000;
const commands = new Set(['parse', 'describe', 'aggregate', 'chart', 'compute']);
const problem = message => { throw new Error(`Error: ${message}`); };

function validate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !commands.has(input.command)) problem('choose a hosted data command: parse, describe, aggregate, chart, compute.');
  for (const key of ['format', 'delimiter', 'columnsList', 'x', 'y', 'type', 'title', 'output', 'op', 'aField', 'bField']) {
    if (input[key] !== undefined && typeof input[key] !== 'string') problem(`${key} must be text.`);
  }
  if (input.format !== undefined && !['csv', 'tsv', 'json'].includes(input.format)) problem('format must be csv, tsv, or json.');
  // A long near-match delimiter makes every delimiter search superlinear (review round 2); real files use one character or a short marker.
  if (input.delimiter !== undefined && (input.delimiter.length < 1 || input.delimiter.length > 8)) problem('delimiter must be 1 to 8 characters.');
  if (input.hasHeader !== undefined && typeof input.hasHeader !== 'boolean') problem('hasHeader must be a boolean.');
  for (const key of ['columns', 'groupBy']) {
    if (input[key] !== undefined && (!Array.isArray(input[key]) || input[key].some(v => typeof v !== 'string'))) problem(`${key} must be an array of column names.`);
  }
  if (input.metrics !== undefined && (!Array.isArray(input.metrics) || input.metrics.some(m => !m || typeof m.column !== 'string' || typeof m.function !== 'string'))) problem('metrics must contain column and function strings.');
  if (input.command === 'compute') {
    if (!['percentage', 'difference', 'rate'].includes(input.op) || !input.aField || !input.bField) problem('compute needs op (percentage, difference, rate), aField and bField.');
    if (input.format !== undefined && input.format !== 'json') problem('compute reads a JSON object.');
    if (input.digits !== undefined && (!Number.isInteger(input.digits) || input.digits < 0 || input.digits > 20)) problem('digits must be an integer from 0 to 20.');
  }
}

class TableLimitError extends Error {}
function tableBudget(rows, columns) {
  if (rows > MAX_ROWS) throw new TableLimitError('Error: the table exceeds 50,000 data rows; use a smaller file.');
  if (columns > MAX_COLUMNS) throw new TableLimitError('Error: the table exceeds 2,048 columns; use a smaller file.');
  if (rows * columns > MAX_TABLE_CELLS) throw new TableLimitError('Error: the table exceeds 250,000 row-by-column cells; use a smaller file.');
}

// Count fields without constructing them: csv-parse's on_record runs only
// after it has allocated the entire record, including any ragged extra fields.
function checkDelimitedFields(content, delimiter) {
  let fields = 1, quoted = false, fieldStart = true;
  let recordDelimiter;
  for (let i = 0; i < content.length; i++) {
    const character = content[i];
    if (quoted) {
      if (character === '"') {
        if (content[i + 1] === '"') { fieldStart = false; i++; }
        else quoted = false;
      } else fieldStart = false;
      continue;
    }
    // Match csv-parse's first unquoted newline discovery. Later, a different
    // newline spelling can be field content, not a new record.
    if (recordDelimiter === undefined && (character === '\r' || character === '\n')) {
      recordDelimiter = character === '\r' && content[i + 1] === '\n' ? '\r\n' : character;
    }
    if (character === '"') {
      // A quote inside an unquoted field makes the parser stop here, before
      // any later record; preserve its established malformed-file answer.
      if (!fieldStart) return;
      quoted = true;
    } else if (recordDelimiter && content.startsWith(recordDelimiter, i)) {
      fields = 1;
      fieldStart = true;
      i += recordDelimiter.length - 1;
    } else if (content.startsWith(delimiter, i)) {
      if (++fields > MAX_COLUMNS) tableBudget(0, fields);
      fieldStart = true;
      i += delimiter.length - 1;
    } else if (!' \t\r\n\f'.includes(character)) {
      // trim:true ignores only these ASCII characters before an opening quote.
      fieldStart = false;
    }
  }
}

// Check the work before any row-by-union-column profile is allocated. After
// the field preflight, CSV records are discarded as rows are counted; malformed
// data still reaches the calculators' established parse-error answers.
async function checkTableWork(input, content) {
  if (input.command === 'compute' || !content.trim()) return;
  const first = content.trimStart()[0];
  if (input.format === 'json' || input.format === undefined && (first === '[' || first === '{')) {
    let data;
    try { data = JSON.parse(content); } catch { return; }
    if (!Array.isArray(data)) return;
    let rows = 0;
    const names = new Set();
    for (const row of data) {
      if (row === null || typeof row !== 'object' || Array.isArray(row)) continue;
      rows++;
      for (const key of Object.keys(row)) names.add(key);
      tableBudget(rows, names.size);
    }
    return;
  }
  const firstLine = content.split('\n', 1)[0];
  const detected = input.format === 'tsv' ? '\t' : input.format === 'csv' ? ',' :
    firstLine.includes('\t') ? '\t' : firstLine.includes(';') && !firstLine.includes(',') ? ';' :
    firstLine.includes('|') && !firstLine.includes(',') ? '|' : ',';
  const delimiter = input.delimiter || detected;
  checkDelimitedFields(content, delimiter);
  const { parse } = await import('csv-parse/browser/esm/sync');
  let records = 0, columns = 0;
  const hasHeader = input.command !== 'parse' || input.hasHeader !== false;
  try {
    parse(content, { delimiter, columns: false,
      skip_empty_lines: true, relax_column_count: true, trim: true,
      on_record(record) {
        records++;
        if (records === 1) columns = record.length;
        tableBudget(records - (hasHeader ? 1 : 0), columns);
        return null;
      }
    });
  } catch (error) { if (error instanceof TableLimitError) throw error; }
}

async function describeColumns(input, content) {
  if (input.columnsList === undefined) return input.columns;
  if (input.columns?.length) problem('--column and --columns were both given. Use --column for one header, including a header that contains a comma; --columns cannot name such a header.');
  const parts = input.columnsList.split(',').map(name => name.trim()).filter(Boolean);
  if (!parts.length) problem('--columns needs at least one column name. Omit it to describe every numeric column.');
  const { readTable } = await import('./read-core.js');
  const headers = readTable({ ...input, content }).columns.map(column => column.name).filter(name => typeof name === 'string');
  const names = new Set(headers);
  if (!parts.every(name => names.has(name))) {
    for (const name of headers) {
      if (name.includes(',') && input.columnsList.includes(name)) problem(`--columns cannot name a header that contains a comma ("${name}"). Use --column for that header.`);
    }
  }
  return parts;
}

export function checkDataOutput(result) {
  const answer = result?.files ? result.answer : result;
  if (JSON.stringify(answer).length > MAX_ANSWER_CHARACTERS) problem('the answer exceeds 48,000 serialized characters; request a smaller result.');
  if (result?.files?.reduce((total, file) => total + file.bytes.byteLength, 0) > MAX_OUTPUT_BYTES) problem('output files exceed 4 MiB in total; use a smaller input.');
  return result;
}

export async function runData(input, files) {
  validate(input);
  if (!Array.isArray(files) || files.length !== 1 || typeof files[0]?.name !== 'string' || typeof files[0]?.mediaType !== 'string' || !(files[0]?.bytes instanceof Uint8Array)) problem('supply exactly one file with name, mediaType and Uint8Array bytes.');
  const file = files[0];
  if (file.bytes.byteLength > MAX_INPUT_BYTES) problem('the input file exceeds 8 MiB; use a smaller file.');
  // Match Node's UTF-8 file reading, which preserves a leading BOM.
  const content = new TextDecoder('utf-8', { ignoreBOM: true }).decode(file.bytes);
  await checkTableWork(input, content);
  const args = { ...input, content };
  let result;
  switch (input.command) {
    case 'parse': result = (await import('./parse-core.js')).executeParse(args); break;
    case 'describe': result = (await import('./describe-core.js')).executeDescribe({ ...args, columns: await describeColumns(input, content) }); break;
    case 'aggregate': result = (await import('./aggregate-core.js')).executeAggregate(args); break;
    case 'compute': {
      let data;
      try { data = JSON.parse(content); }
      catch { problem(`${file.name} is not valid JSON. Pass a file holding one JSON object, such as a saved aggregate or describe result.`); }
      if (data === null || typeof data !== 'object' || Array.isArray(data)) problem(`${file.name} does not hold one JSON object. Pass a file holding one JSON object, such as a saved aggregate or describe result.`);
      const computed = (await import('./compute-core.js')).executeCompute({ ...input, data });
      if (!computed.ok) problem(`field ${computed.field} is missing or not a number in ${file.name}`);
      result = computed.result;
      break;
    }
    case 'chart': {
      const built = (await import('./chart-core.js')).buildChart(args);
      if (!built.ok) problem(built.errors.join('; '));
      const output = input.output ?? 'chart.html';
      const name = output.split(/[\\/]/).pop();
      if (!name || !/\.html$/i.test(name)) problem('chart output must name an .html file.');
      const { type, points, width, height, skipped, notes } = built;
      result = { answer: { output, type, points, width, height, skipped, notes },
        files: [{ name, mediaType: 'text/html', bytes: new TextEncoder().encode(built.html) }] };
    }
  }
  return checkDataOutput(result);
}
