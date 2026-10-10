import { randomUUID } from 'node:crypto';

async function viaCatalog(input, ctx) {
  return ctx.catalog(`${ctx.service}.${ctx.module}.${ctx.action}`, input);
}

function invalidArguments(field) {
  return { status: 'invalid_arguments', field };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const QUERY_DIMENSIONS = new Set(['country', 'device', 'page', 'query', 'searchAppearance', 'date', 'hour']);
const FILTER_DIMENSIONS = new Set(['country', 'device', 'page', 'query', 'searchAppearance']);
const FILTER_OPERATORS = new Set(['equals', 'notEquals', 'contains', 'notContains', 'includingRegex', 'excludingRegex']);
const SEARCH_TYPES = new Set(['web', 'image', 'video', 'news', 'discover', 'googleNews']);
const AGGREGATION_TYPES = new Set(['auto', 'byPage', 'byProperty', 'byNewsShowcasePanel']);
const DATA_STATES = new Set(['final', 'all', 'hourly_all']);
const QUERY_FIELDS = [
  'site_url',
  'start_date',
  'end_date',
  'dimensions',
  'row_limit',
  'start_row',
  'dimension_filter_groups',
  'search_type',
  'aggregation_type',
  'data_state',
];
const SEARCH_CONSOLE_ALLOWED = {
  query: QUERY_FIELDS,
  sites: [],
  sitemaps: ['site_url'],
  inspect: ['site_url', 'inspection_url', 'language_code'],
  get_sitemap: ['site_url', 'feedpath'],
};

function isAbsHttpUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function isDomainProperty(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  const match = /^sc-domain:([A-Za-z0-9.-]+)$/i.exec(value.trim());
  if (!match) return false;
  const host = match[1];
  if (host.includes('..') || host.startsWith('.') || host.endsWith('.') || !host.includes('.')) return false;
  return true;
}

function isSiteUrl(value) {
  return isAbsHttpUrl(value) || isDomainProperty(value);
}

function extraKey(input, allowed) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalidArguments('input');
  const extra = Object.keys(input).find((key) => !allowed.includes(key));
  return extra === undefined ? null : invalidArguments(extra);
}

function validateDimensionFilterGroups(value) {
  if (!Array.isArray(value)) return invalidArguments('dimension_filter_groups');
  for (const group of value) {
    if (!group || typeof group !== 'object' || Array.isArray(group) || !Array.isArray(group.filters)) {
      return invalidArguments('dimension_filter_groups');
    }
    for (const filter of group.filters) {
      if (!filter || typeof filter !== 'object' || Array.isArray(filter)) return invalidArguments('dimension_filter_groups');
      if (typeof filter.dimension !== 'string' || !FILTER_DIMENSIONS.has(filter.dimension)) {
        return invalidArguments('dimension_filter_groups');
      }
      if (typeof filter.operator !== 'string' || !FILTER_OPERATORS.has(filter.operator)) {
        return invalidArguments('dimension_filter_groups');
      }
      if (typeof filter.expression !== 'string') return invalidArguments('dimension_filter_groups');
    }
  }
  return null;
}

function validateSearchConsole(input, ctx) {
  const allowed = SEARCH_CONSOLE_ALLOWED[ctx.action];
  const extra = extraKey(input, allowed);
  if (extra) return extra;
  if (ctx.action === 'query') {
    if (typeof input.site_url !== 'string' || !input.site_url.trim()) return invalidArguments('site_url');
    if (typeof input.start_date !== 'string' || !DATE.test(input.start_date)) return invalidArguments('start_date');
    if (typeof input.end_date !== 'string' || !DATE.test(input.end_date)) return invalidArguments('end_date');
    if (input.start_date > input.end_date) return invalidArguments('start_date');
    if (Object.hasOwn(input, 'dimensions') && !(
      Array.isArray(input.dimensions) &&
      input.dimensions.every((item) => typeof item === 'string' && QUERY_DIMENSIONS.has(item))
    )) return invalidArguments('dimensions');
    if (Object.hasOwn(input, 'row_limit') && !(
      Number.isInteger(input.row_limit) && input.row_limit >= 1 && input.row_limit <= 25000
    )) return invalidArguments('row_limit');
    if (Object.hasOwn(input, 'start_row') && !(Number.isInteger(input.start_row) && input.start_row >= 0)) {
      return invalidArguments('start_row');
    }
    if (Object.hasOwn(input, 'search_type') && !SEARCH_TYPES.has(input.search_type)) return invalidArguments('search_type');
    if (Object.hasOwn(input, 'aggregation_type') && !AGGREGATION_TYPES.has(input.aggregation_type)) {
      return invalidArguments('aggregation_type');
    }
    if (Object.hasOwn(input, 'data_state') && !DATA_STATES.has(input.data_state)) return invalidArguments('data_state');
    if (Object.hasOwn(input, 'dimension_filter_groups')) return validateDimensionFilterGroups(input.dimension_filter_groups);
    return null;
  }
  if (ctx.action === 'sitemaps') {
    return isSiteUrl(input.site_url) ? null : invalidArguments('site_url');
  }
  if (ctx.action === 'inspect') {
    if (!isSiteUrl(input.site_url)) return invalidArguments('site_url');
    if (!isAbsHttpUrl(input.inspection_url)) return invalidArguments('inspection_url');
    if (Object.hasOwn(input, 'language_code') && (typeof input.language_code !== 'string' || !input.language_code.trim())) {
      return invalidArguments('language_code');
    }
    return null;
  }
  if (ctx.action === 'get_sitemap') {
    if (!isSiteUrl(input.site_url)) return invalidArguments('site_url');
    if (!isAbsHttpUrl(input.feedpath)) return invalidArguments('feedpath');
    return null;
  }
  return null;
}

async function searchConsole(input, ctx) {
  const invalid = validateSearchConsole(input, ctx);
  if (invalid) return invalid;
  return viaCatalog(input, ctx);
}

function catalogWith(names) {
  return (input, ctx) => {
    const args = { ...input };
    for (const [from, to] of Object.entries(names)) {
      if (Object.hasOwn(args, from)) {
        args[to] = args[from];
        delete args[from];
      }
    }
    return viaCatalog(args, ctx);
  };
}

function codePoints(value) {
  return [...value].length;
}

function isStatusObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && typeof value.status === 'string';
}

async function proxyData(ctx, req) {
  const result = await ctx.proxy(req);
  if (isStatusObject(result)) return result;
  if (result && typeof result === 'object' && Object.hasOwn(result, 'data')) return result.data;
  return result;
}

function stringBound(value, field, max, min = 0) {
  if (typeof value !== 'string') return invalidArguments(field);
  const n = codePoints(value);
  if (n < min || n > max) return invalidArguments(field);
  return null;
}

function isMinInt(value, min) {
  return typeof value === 'number' && Number.isInteger(value) && value >= min;
}

function ownsOnly(value, allowed) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

const DRIVE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const DOCS = 'https://docs.googleapis.com/v1';
const SHEETS = 'https://sheets.googleapis.com/v4';
const GMAIL = 'https://gmail.googleapis.com/gmail/v1';
const CALENDAR = 'https://www.googleapis.com/calendar/v3';
const DRIVE_FIELDS = 'id,name,mimeType,parents,webViewLink';

const KIND_MIME = {
  document: 'application/vnd.google-apps.document',
  spreadsheet: 'application/vnd.google-apps.spreadsheet',
  presentation: 'application/vnd.google-apps.presentation',
  folder: 'application/vnd.google-apps.folder',
};

const WORD = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const EXCEL = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const POWERPOINT = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const TEXT_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/html',
  'text/csv',
  'text/tab-separated-values',
]);
const GOOGLE_TYPE = {
  'text/plain': 'application/vnd.google-apps.document',
  'text/markdown': 'application/vnd.google-apps.document',
  'text/html': 'application/vnd.google-apps.document',
  [WORD]: 'application/vnd.google-apps.document',
  'text/csv': 'application/vnd.google-apps.spreadsheet',
  'text/tab-separated-values': 'application/vnd.google-apps.spreadsheet',
  [EXCEL]: 'application/vnd.google-apps.spreadsheet',
  [POWERPOINT]: 'application/vnd.google-apps.presentation',
};

const DOC_STYLES = new Set([
  'NORMAL_TEXT', 'TITLE', 'SUBTITLE',
  'HEADING_1', 'HEADING_2', 'HEADING_3', 'HEADING_4', 'HEADING_5', 'HEADING_6',
]);
const DOC_LISTS = new Set(['bulleted', 'numbered']);
const BULLET_PRESET = {
  bulleted: 'BULLET_DISC_CIRCLE_SQUARE',
  numbered: 'NUMBERED_DECIMAL_ALPHA_ROMAN',
};

const B64 = /^[A-Za-z0-9+/_-]+={0,2}$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/;
// The published patterns for an address and for header text, applied here as well because a
// nested item and a header are the module's to check before it builds a message.
const ADDRESS = /^[^\s@\u0000]+@[^\s@\u0000]+$/;
const HEADER_TEXT = /^[^\r\n\u0000]*$/;
const CALENDAR_CHANGES = ['summary', 'description', 'location', 'start', 'end', 'attendees'];

function driveUrl(path, query) {
  const params = new URLSearchParams();
  params.set('supportsAllDrives', 'true');
  for (const [key, value] of Object.entries(query)) params.set(key, value);
  return `${DRIVE}${path}?${params}`;
}

function decodeBase64(value) {
  if (typeof value !== 'string' || !B64.test(value)) return null;
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const bare = normalized.replace(/=+$/, '');
  if (bare.length % 4 === 1) return null;
  const padded = bare + (bare.length % 4 === 0 ? '' : '='.repeat(4 - (bare.length % 4)));
  if (normalized !== bare && normalized !== padded) return null;
  const buf = Buffer.from(padded, 'base64');
  if (buf.toString('base64') !== padded) return null;
  return buf;
}

function multipartRelated(metadata, mediaType, media) {
  const meta = Buffer.from(JSON.stringify(metadata), 'utf8');
  const body = Buffer.isBuffer(media) ? media : Buffer.from(media);
  let boundary;
  do {
    boundary = `wiser-${randomUUID()}`;
  } while (meta.includes(Buffer.from(boundary)) || body.includes(Buffer.from(boundary)));
  const chunks = [
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`),
    meta,
    Buffer.from(`\r\n--${boundary}\r\nContent-Type: ${mediaType}\r\n\r\n`),
    body,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ];
  return {
    base64: Buffer.concat(chunks).toString('base64'),
    content_type: `multipart/related; boundary=${boundary}`,
  };
}

function optionalText(input, field, max) {
  if (!Object.hasOwn(input, field)) return null;
  return stringBound(input[field], field, max, 0);
}

async function create_file(input, ctx) {
  const name = stringBound(input.name, 'name', 1000, 1);
  if (name) return name;
  const description = optionalText(input, 'description', 4000);
  if (description) return description;
  const mimeType = KIND_MIME[input.kind];
  if (!mimeType) return invalidArguments('kind');
  const body = { name: input.name, mimeType };
  if (Object.hasOwn(input, 'folder_id')) body.parents = [input.folder_id];
  if (Object.hasOwn(input, 'description')) body.description = input.description;
  return proxyData(ctx, {
    endpoint: driveUrl('/files', { fields: DRIVE_FIELDS }),
    method: 'POST',
    body,
  });
}

async function upload_file(input, ctx) {
  const name = stringBound(input.name, 'name', 1000, 1);
  if (name) return name;
  const description = optionalText(input, 'description', 4000);
  if (description) return description;
  if (Object.hasOwn(input, 'convert') && typeof input.convert !== 'boolean') return invalidArguments('convert');
  const hasContent = Object.hasOwn(input, 'content');
  const hasEncoded = Object.hasOwn(input, 'content_base64');
  if (hasContent === hasEncoded) return invalidArguments(hasContent ? 'content_base64' : 'content');
  const googleType = GOOGLE_TYPE[input.source_type];
  if (!googleType) return invalidArguments('source_type');
  let media;
  if (hasContent) {
    if (!TEXT_TYPES.has(input.source_type)) return invalidArguments('content');
    const length = stringBound(input.content, 'content', 200000, 0);
    if (length) return length;
    media = Buffer.from(input.content, 'utf8');
  } else {
    const length = stringBound(input.content_base64, 'content_base64', 700000, 0);
    if (length) return length;
    media = decodeBase64(input.content_base64);
    if (!media) return invalidArguments('content_base64');
  }
  const convert = input.convert !== false;
  const metadata = {
    name: input.name,
    mimeType: convert ? googleType : input.source_type,
  };
  if (Object.hasOwn(input, 'folder_id')) metadata.parents = [input.folder_id];
  if (Object.hasOwn(input, 'description')) metadata.description = input.description;
  const query = new URLSearchParams();
  query.set('uploadType', 'multipart');
  query.set('supportsAllDrives', 'true');
  query.set('fields', DRIVE_FIELDS);
  return proxyData(ctx, {
    endpoint: `${DRIVE_UPLOAD}/files?${query}`,
    method: 'POST',
    binary_body: multipartRelated(metadata, input.source_type, media),
  });
}

async function rename_file(input, ctx) {
  const name = stringBound(input.name, 'name', 1000, 1);
  if (name) return name;
  return proxyData(ctx, {
    endpoint: driveUrl(`/files/${encodeURIComponent(input.file_id)}`, { fields: DRIVE_FIELDS }),
    method: 'PATCH',
    body: { name: input.name },
  });
}

async function move_file(input, ctx) {
  const read = new URLSearchParams();
  read.set('fields', 'parents');
  read.set('supportsAllDrives', 'true');
  const got = await proxyData(ctx, {
    endpoint: `${DRIVE}/files/${encodeURIComponent(input.file_id)}?${read}`,
    method: 'GET',
  });
  if (isStatusObject(got) || !got || typeof got !== 'object' || Array.isArray(got)) return got;
  const parents = Array.isArray(got.parents) ? got.parents.filter((id) => typeof id === 'string') : [];
  const query = new URLSearchParams();
  query.set('addParents', input.folder_id);
  if (parents.length) query.set('removeParents', parents.join(','));
  query.set('supportsAllDrives', 'true');
  query.set('fields', DRIVE_FIELDS);
  return proxyData(ctx, {
    endpoint: `${DRIVE}/files/${encodeURIComponent(input.file_id)}?${query}`,
    method: 'PATCH',
  });
}

async function create_document(input, ctx) {
  const title = stringBound(input.title, 'title', 1000, 1);
  if (title) return title;
  return proxyData(ctx, {
    endpoint: `${DOCS}/documents`,
    method: 'POST',
    body: { title: input.title },
  });
}

function readOperation(op) {
  if (!op || typeof op !== 'object' || Array.isArray(op)) return invalidArguments('operations');
  if (op.op === 'insert_text') {
    if (!ownsOnly(op, ['op', 'text', 'index'])) return invalidArguments('operations');
    if (typeof op.text !== 'string' || codePoints(op.text) > 100000) return invalidArguments('operations');
    const insertText = { text: op.text };
    if (Object.hasOwn(op, 'index')) {
      if (!isMinInt(op.index, 1)) return invalidArguments('operations');
      insertText.location = { index: op.index };
    } else {
      // An empty segment id is the document body. The text lands at its end.
      insertText.endOfSegmentLocation = { segmentId: '' };
    }
    return { insertText };
  }
  if (op.op === 'replace_text') {
    if (!ownsOnly(op, ['op', 'find', 'replace', 'match_case'])) return invalidArguments('operations');
    if (typeof op.find !== 'string' || codePoints(op.find) < 1 || codePoints(op.find) > 10000) {
      return invalidArguments('operations');
    }
    if (typeof op.replace !== 'string' || codePoints(op.replace) > 100000) return invalidArguments('operations');
    if (Object.hasOwn(op, 'match_case') && typeof op.match_case !== 'boolean') return invalidArguments('operations');
    return {
      replaceAllText: {
        containsText: { text: op.find, matchCase: op.match_case !== false },
        replaceText: op.replace,
      },
    };
  }
  if (op.op === 'set_style') {
    if (!ownsOnly(op, ['op', 'start_index', 'end_index', 'style'])) return invalidArguments('operations');
    if (!isMinInt(op.start_index, 1) || !isMinInt(op.end_index, 1) || op.end_index <= op.start_index) {
      return invalidArguments('operations');
    }
    if (!DOC_STYLES.has(op.style)) return invalidArguments('operations');
    return {
      updateParagraphStyle: {
        range: { startIndex: op.start_index, endIndex: op.end_index },
        paragraphStyle: { namedStyleType: op.style },
        fields: 'namedStyleType',
      },
    };
  }
  if (op.op === 'create_list') {
    if (!ownsOnly(op, ['op', 'start_index', 'end_index', 'list'])) return invalidArguments('operations');
    if (!isMinInt(op.start_index, 1) || !isMinInt(op.end_index, 1) || op.end_index <= op.start_index) {
      return invalidArguments('operations');
    }
    if (!DOC_LISTS.has(op.list)) return invalidArguments('operations');
    return {
      createParagraphBullets: {
        range: { startIndex: op.start_index, endIndex: op.end_index },
        bulletPreset: BULLET_PRESET[op.list],
      },
    };
  }
  return invalidArguments('operations');
}

async function edit_document(input, ctx) {
  if (!Array.isArray(input.operations) || input.operations.length < 1 || input.operations.length > 50) {
    return invalidArguments('operations');
  }
  if (Object.hasOwn(input, 'required_revision_id')) {
    const revision = stringBound(input.required_revision_id, 'required_revision_id', 200, 1);
    if (revision) return revision;
  }
  const requests = [];
  for (const op of input.operations) {
    const request = readOperation(op);
    if (isStatusObject(request)) return request;
    requests.push(request);
  }
  const body = { requests };
  if (Object.hasOwn(input, 'required_revision_id')) {
    body.writeControl = { requiredRevisionId: input.required_revision_id };
  }
  return proxyData(ctx, {
    endpoint: `${DOCS}/documents/${encodeURIComponent(input.document_id)}:batchUpdate`,
    method: 'POST',
    body,
  });
}

function readValues(values) {
  if (!Array.isArray(values) || values.length < 1 || values.length > 500) return invalidArguments('values');
  for (const row of values) {
    if (!Array.isArray(row) || row.length < 1 || row.length > 50) return invalidArguments('values');
    for (const cell of row) {
      if (typeof cell === 'string') {
        if (codePoints(cell) > 5000) return invalidArguments('values');
      } else if (typeof cell === 'number') {
        if (!Number.isFinite(cell)) return invalidArguments('values');
      } else if (typeof cell !== 'boolean') {
        return invalidArguments('values');
      }
    }
  }
  return null;
}

function valueOption(input) {
  const option = Object.hasOwn(input, 'value_input_option') ? input.value_input_option : 'RAW';
  if (option !== 'RAW' && option !== 'USER_ENTERED') return invalidArguments('value_input_option');
  return option;
}

async function write_values(input, ctx, append) {
  const range = stringBound(input.range, 'range', 500, 1);
  if (range) return range;
  // encodeURIComponent leaves `.` and `..` as they are, and a URL parser resolves them.
  if (input.range === '.' || input.range === '..') return invalidArguments('range');
  const values = readValues(input.values);
  if (values) return values;
  const option = valueOption(input);
  if (isStatusObject(option)) return option;
  const query = new URLSearchParams();
  query.set('valueInputOption', option);
  if (append) query.set('insertDataOption', 'INSERT_ROWS');
  const id = encodeURIComponent(input.spreadsheet_id);
  const encodedRange = encodeURIComponent(input.range);
  const suffix = append ? `${encodedRange}:append` : encodedRange;
  return proxyData(ctx, {
    endpoint: `${SHEETS}/spreadsheets/${id}/values/${suffix}?${query}`,
    method: append ? 'POST' : 'PUT',
    body: { range: input.range, majorDimension: 'ROWS', values: input.values },
  });
}

// RFC 5321 bounds a path at 256 octets, so an address of 254 bytes in UTF-8 is the most a
// mailbox can be; a character count alone admits four times that in emoji.
const ADDRESS_BYTES = 254;

function readAddresses(value, field, min, max) {
  if (!Array.isArray(value) || value.length < min || value.length > max) return invalidArguments(field);
  for (const item of value) {
    if (typeof item !== 'string' || codePoints(item) > ADDRESS_BYTES || !ADDRESS.test(item)) return invalidArguments(field);
    if (Buffer.byteLength(item, 'utf8') > ADDRESS_BYTES) return invalidArguments(field);
  }
  return null;
}

function wrapBase64(buf) {
  const text = Buffer.from(buf).toString('base64');
  const lines = [];
  for (let i = 0; i < text.length; i += 76) lines.push(text.slice(i, i + 76));
  return lines.join('\r\n');
}

// RFC 2047 caps an encoded-word at 75 characters and any line holding one at 76. A word of
// n bytes is 12 + 4 * ceil(n / 3) characters, so 45 bytes make 72, which fits a continuation
// line after its one space, and the first word, after `Subject: `, takes 39 bytes, making
// 64 and a line of 73. Each word is cut on a character boundary, so every word is valid UTF-8
// alone, as RFC 2047 requires.
const SUBJECT_PREFIX = 'Subject: ';
const FIRST_WORD_BYTES = 39;
const WORD_BYTES = 45;

function subjectHeader(value) {
  const ascii = [...value].every((ch) => ch.codePointAt(0) >= 32 && ch.codePointAt(0) < 127);
  // Plain text that looks like an encoded-word would be decoded by a reader into other text.
  if (ascii && !value.includes('=?') && SUBJECT_PREFIX.length + value.length <= 78) return `${SUBJECT_PREFIX}${value}`;
  if (value.length === 0) return SUBJECT_PREFIX.trimEnd();
  const words = [];
  let chunk = [];
  let bytes = 0;
  for (const ch of value) {
    const size = Buffer.byteLength(ch, 'utf8');
    const limit = words.length === 0 ? FIRST_WORD_BYTES : WORD_BYTES;
    if (bytes + size > limit && chunk.length) {
      words.push(chunk.join(''));
      chunk = [];
      bytes = 0;
    }
    chunk.push(ch);
    bytes += size;
  }
  if (chunk.length) words.push(chunk.join(''));
  const encoded = words.map((word) => `=?UTF-8?B?${Buffer.from(word, 'utf8').toString('base64')}?=`);
  return `${SUBJECT_PREFIX}${encoded.join('\r\n ')}`;
}

function addressHeader(name, list) {
  return `${name}: ${list.join(',\r\n ')}`;
}

function draftRaw(input) {
  const headers = [addressHeader('To', input.to)];
  if (Array.isArray(input.cc) && input.cc.length) headers.push(addressHeader('Cc', input.cc));
  if (Array.isArray(input.bcc) && input.bcc.length) headers.push(addressHeader('Bcc', input.bcc));
  headers.push(subjectHeader(input.subject));
  headers.push('MIME-Version: 1.0');
  let body;
  if (Object.hasOwn(input, 'body_html')) {
    const text = wrapBase64(Buffer.from(input.body, 'utf8'));
    const html = wrapBase64(Buffer.from(input.body_html, 'utf8'));
    let boundary;
    do {
      boundary = `wiser-${randomUUID()}`;
    } while (text.includes(boundary) || html.includes(boundary) || headers.some((line) => line.includes(boundary)));
    headers.push(`Content-Type: multipart/alternative; boundary=${boundary}`);
    body = [
      `--${boundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      text,
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      html,
      `--${boundary}--`,
      '',
    ].join('\r\n');
  } else {
    headers.push('Content-Type: text/plain; charset=UTF-8');
    headers.push('Content-Transfer-Encoding: base64');
    body = wrapBase64(Buffer.from(input.body, 'utf8'));
  }
  const message = `${headers.join('\r\n')}\r\n\r\n${body}`;
  return Buffer.from(message, 'utf8').toString('base64url').replace(/=+$/, '');
}

async function create_draft(input, ctx) {
  const to = readAddresses(input.to, 'to', 1, 50);
  if (to) return to;
  if (Object.hasOwn(input, 'cc')) {
    const cc = readAddresses(input.cc, 'cc', 0, 50);
    if (cc) return cc;
  }
  if (Object.hasOwn(input, 'bcc')) {
    const bcc = readAddresses(input.bcc, 'bcc', 0, 50);
    if (bcc) return bcc;
  }
  const subject = stringBound(input.subject, 'subject', 998, 0);
  if (subject) return subject;
  if (!HEADER_TEXT.test(input.subject)) return invalidArguments('subject');
  const body = stringBound(input.body, 'body', 200000, 0);
  if (body) return body;
  if (Object.hasOwn(input, 'body_html')) {
    const html = stringBound(input.body_html, 'body_html', 200000, 0);
    if (html) return html;
  }
  return proxyData(ctx, {
    endpoint: `${GMAIL}/users/me/drafts`,
    method: 'POST',
    body: { message: { raw: draftRaw(input) } },
  });
}

function validYmd(year, month, day) {
  if (month < 1 || month > 12 || day < 1) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function parseWhen(value) {
  if (typeof value !== 'string') return null;
  const date = DATE_RE.exec(value);
  if (date) {
    const year = Number(date[1]);
    const month = Number(date[2]);
    const day = Number(date[3]);
    if (!validYmd(year, month, day)) return null;
    return { kind: 'date', value };
  }
  const stamp = DATETIME_RE.exec(value);
  if (!stamp) return null;
  const year = Number(stamp[1]);
  const month = Number(stamp[2]);
  const day = Number(stamp[3]);
  const hour = Number(stamp[4]);
  const minute = Number(stamp[5]);
  const second = Number(stamp[6]);
  const offset = stamp[8] || '';
  if (!validYmd(year, month, day) || hour > 23 || minute > 59 || second > 60) return null;
  if (offset && offset !== 'Z') {
    const offHour = Number(offset.slice(1, 3));
    const offMinute = Number(offset.slice(4, 6));
    if (offHour > 23 || offMinute > 59) return null;
  }
  return { kind: 'dateTime', value, offset };
}

function validZone(value) {
  // Google wants an IANA name. Newer Intl also accepts a bare offset such as `+01:00`,
  // which Google does not, so a value that does not start with a letter is refused first.
  if (!/^[A-Za-z]/.test(value)) return false;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function readTimeZone(input) {
  if (!Object.hasOwn(input, 'time_zone')) return { timeZone: undefined };
  const length = stringBound(input.time_zone, 'time_zone', 64, 0);
  if (length) return { error: length };
  if (!validZone(input.time_zone)) return { error: invalidArguments('time_zone') };
  return { timeZone: input.time_zone };
}

function googleWhen(parsed, timeZone) {
  if (parsed.kind === 'date') return { date: parsed.value };
  const out = { dateTime: parsed.value };
  if (timeZone) out.timeZone = timeZone;
  return out;
}

function readSpan(startValue, endValue, timeZone, fieldForStart) {
  const start = parseWhen(startValue);
  if (!start) return { error: invalidArguments(fieldForStart) };
  const end = parseWhen(endValue);
  if (!end) return { error: invalidArguments('end') };
  if (start.kind !== end.kind) return { error: invalidArguments('end') };
  // Whether end is after start is Google's to refuse. Comparing them here would need the
  // event's time zone rules for a wall-clock time, and the agreement gate samples one
  // exemplar for both fields, so a local check would refuse the schema's own instance.
  if (start.kind === 'dateTime' && (!start.offset || !end.offset) && !timeZone) {
    return { error: invalidArguments('time_zone') };
  }
  return { start: googleWhen(start, timeZone), end: googleWhen(end, timeZone) };
}

function readOneWhen(value, field, timeZone) {
  const parsed = parseWhen(value);
  if (!parsed) return { error: invalidArguments(field) };
  if (parsed.kind === 'dateTime' && !parsed.offset && !timeZone) return { error: invalidArguments('time_zone') };
  return { value: googleWhen(parsed, timeZone) };
}

function calendarIdError(value) {
  const length = stringBound(value, 'calendar_id', 254, 1);
  if (length) return length;
  if (value === '.' || value === '..' || value.includes('/')) return invalidArguments('calendar_id');
  return null;
}

function sendUpdates(input) {
  if (Object.hasOwn(input, 'notify_guests') && typeof input.notify_guests !== 'boolean') {
    return invalidArguments('notify_guests');
  }
  return input.notify_guests === true ? 'all' : 'none';
}

function eventBody(input, span) {
  const body = {};
  if (Object.hasOwn(input, 'summary')) body.summary = input.summary;
  if (Object.hasOwn(input, 'description')) body.description = input.description;
  if (Object.hasOwn(input, 'location')) body.location = input.location;
  if (span?.start) body.start = span.start;
  if (span?.end) body.end = span.end;
  if (Object.hasOwn(input, 'attendees')) body.attendees = input.attendees.map((email) => ({ email }));
  return body;
}

function eventText(input) {
  const summary = Object.hasOwn(input, 'summary') ? stringBound(input.summary, 'summary', 1024, 1) : null;
  if (summary) return summary;
  const description = optionalText(input, 'description', 8192);
  if (description) return description;
  const location = optionalText(input, 'location', 1024);
  if (location) return location;
  if (Object.hasOwn(input, 'attendees')) {
    const attendees = readAddresses(input.attendees, 'attendees', 0, 100);
    if (attendees) return attendees;
  }
  return null;
}

async function create_event(input, ctx) {
  const calendar = calendarIdError(input.calendar_id);
  if (calendar) return calendar;
  const text = eventText(input);
  if (text) return text;
  const zone = readTimeZone(input);
  if (zone.error) return zone.error;
  const span = readSpan(input.start, input.end, zone.timeZone, 'start');
  if (span.error) return span.error;
  const updates = sendUpdates(input);
  if (isStatusObject(updates)) return updates;
  const query = new URLSearchParams();
  query.set('sendUpdates', updates);
  return proxyData(ctx, {
    endpoint: `${CALENDAR}/calendars/${encodeURIComponent(input.calendar_id)}/events?${query}`,
    method: 'POST',
    body: eventBody(input, span),
  });
}

async function update_event(input, ctx) {
  const calendar = calendarIdError(input.calendar_id);
  if (calendar) return calendar;
  // A time zone is part of a start or an end, never a change of its own.
  if (Object.hasOwn(input, 'time_zone') && !Object.hasOwn(input, 'start') && !Object.hasOwn(input, 'end')) {
    return invalidArguments('time_zone');
  }
  if (!CALENDAR_CHANGES.some((key) => Object.hasOwn(input, key))) return invalidArguments('summary');
  const text = eventText(input);
  if (text) return text;
  const zone = readTimeZone(input);
  if (zone.error) return zone.error;
  const span = {};
  if (Object.hasOwn(input, 'start') && Object.hasOwn(input, 'end')) {
    const both = readSpan(input.start, input.end, zone.timeZone, 'start');
    if (both.error) return both.error;
    span.start = both.start;
    span.end = both.end;
  } else if (Object.hasOwn(input, 'start')) {
    const one = readOneWhen(input.start, 'start', zone.timeZone);
    if (one.error) return one.error;
    span.start = one.value;
  } else if (Object.hasOwn(input, 'end')) {
    const one = readOneWhen(input.end, 'end', zone.timeZone);
    if (one.error) return one.error;
    span.end = one.value;
  }
  // Calendar merges a patch into the event's nested start and end, so moving an all-day
  // event to a time, or back, has to clear the representation it leaves.
  for (const key of ['start', 'end']) {
    if (!span[key]) continue;
    span[key] = Object.hasOwn(span[key], 'date')
      ? { ...span[key], dateTime: null, timeZone: null }
      : { ...span[key], date: null };
  }
  const updates = sendUpdates(input);
  if (isStatusObject(updates)) return updates;
  const query = new URLSearchParams();
  query.set('sendUpdates', updates);
  return proxyData(ctx, {
    endpoint: `${CALENDAR}/calendars/${encodeURIComponent(input.calendar_id)}/events/${encodeURIComponent(input.event_id)}?${query}`,
    method: 'PATCH',
    body: eventBody(input, span),
  });
}

// A lone surrogate is a JavaScript string that is not Unicode: UTF-8 encoding replaces it
// with U+FFFD, so what Google saved would differ from what the person approved. Every write
// refuses one, anywhere in its input, naming the top-level field that holds it.
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

function holdsLoneSurrogate(value, depth = 0) {
  if (typeof value === 'string') return LONE_SURROGATE.test(value);
  if (depth > 32 || !value || typeof value !== 'object') return false;
  return Object.values(value).some((item) => holdsLoneSurrogate(item, depth + 1));
}

function wellFormed(action) {
  return (input, ctx) => {
    if (input && typeof input === 'object' && !Array.isArray(input)) {
      const field = Object.keys(input).find((key) => holdsLoneSurrogate(input[key]));
      if (field !== undefined) return invalidArguments(field);
    }
    return action(input, ctx);
  };
}

export const modules = {
  'search-console': {
    query: searchConsole,
    sites: searchConsole,
    sitemaps: searchConsole,
    inspect: searchConsole,
    get_sitemap: searchConsole,
  },
  'analytics': {
    run_report: catalogWith({ date_ranges: 'dateRanges' }),
    list_account_summaries: catalogWith({ page_size: 'pageSize', page_token: 'pageToken' }),
    get_property: viaCatalog,
  },
  'drive': {
    find_file: catalogWith({ page_size: 'pageSize', page_token: 'pageToken' }),
    get_file: catalogWith({ file_id: 'fileId' }),
    create_file: wellFormed(create_file),
    upload_file: wellFormed(upload_file),
    rename_file: wellFormed(rename_file),
    move_file: wellFormed(move_file),
  },
  'calendar': {
    list_events: catalogWith({ calendar_id: 'calendarId', time_min: 'timeMin', time_max: 'timeMax', max_results: 'maxResults', page_token: 'pageToken' }),
    get_event: catalogWith({ calendar_id: 'calendarId', event_id: 'eventId' }),
    create_event: wellFormed(create_event),
    update_event: wellFormed(update_event),
  },
  'gmail': {
    list_messages: viaCatalog,
    get_message: viaCatalog,
    create_draft: wellFormed(create_draft),
  },
  'sheets': {
    search: viaCatalog,
    get_values: catalogWith({
      major_dimension: 'majorDimension',
      value_render_option: 'valueRenderOption',
      date_time_render_option: 'dateTimeRenderOption',
    }),
    update_values: wellFormed((input, ctx) => write_values(input, ctx, false)),
    append_values: wellFormed((input, ctx) => write_values(input, ctx, true)),
  },
  'docs': {
    search: viaCatalog,
    get: catalogWith({
      document_id: 'id',
      include_tabs_content: 'includeTabsContent',
    }),
    create: wellFormed(create_document),
    edit: wellFormed(edit_document),
  },
  'slides': {
    get: catalogWith({
      presentation_id: 'presentationId',
      presentation_name: 'presentationName',
    }),
    get_page: catalogWith({
      presentation_id: 'presentationId',
      page_object_id: 'pageObjectId',
    }),
  },
};
