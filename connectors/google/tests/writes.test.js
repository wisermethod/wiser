import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestGateway, putActive } from '../../../gateway/test/fake-provider.js';

const FIELDS = 'id%2Cname%2CmimeType%2Cparents%2CwebViewLink';
const DRIVE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const DRIVE_FILES = `${DRIVE}/files?supportsAllDrives=true&fields=${FIELDS}`;
const WORD = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const EXCEL = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const POWERPOINT = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const DOC = 'application/vnd.google-apps.document';
const SHEET = 'application/vnd.google-apps.spreadsheet';
const SLIDES = 'application/vnd.google-apps.presentation';
const FOLDER = 'application/vnd.google-apps.folder';
const RANGE = 'Sheet1!A1:B2';
const RANGE_PATH = 'Sheet1!A1%3AB2';

const WRITE_MODULES = ['drive', 'docs', 'sheets', 'gmail', 'calendar'];

const valid = {
  'google.drive.create_file': { name: 'Example', kind: 'document' },
  'google.drive.upload_file': { name: 'Example', source_type: 'text/plain', content: 'Hello' },
  'google.drive.rename_file': { file_id: 'file-example', name: 'Renamed' },
  'google.drive.move_file': { file_id: 'file-example', folder_id: 'folder-example' },
  'google.docs.create': { title: 'Example' },
  'google.docs.edit': { document_id: 'doc-example', operations: [{ op: 'insert_text', text: 'Hello' }] },
  'google.sheets.update_values': { spreadsheet_id: 'sheet-example', range: RANGE, values: [['a']] },
  'google.sheets.append_values': { spreadsheet_id: 'sheet-example', range: RANGE, values: [['a']] },
  'google.gmail.create_draft': { to: ['person@example.com'], subject: 'Hello', body: 'Draft' },
  'google.calendar.create_event': {
    calendar_id: 'primary', summary: 'Example', start: '2026-09-20', end: '2026-09-21',
  },
  'google.calendar.update_event': {
    calendar_id: 'primary', event_id: 'event-example', summary: 'Example',
  },
};

const mistyped = {
  'google.drive.create_file': { name: 12345, kind: 'document' },
  'google.drive.upload_file': { name: 12345, source_type: 'text/plain', content: 'Hello' },
  'google.drive.rename_file': { file_id: 12345, name: 'Renamed' },
  'google.drive.move_file': { file_id: 12345, folder_id: 'folder-example' },
  'google.docs.create': { title: 12345 },
  'google.docs.edit': { document_id: 12345, operations: [{ op: 'insert_text', text: 'Hello' }] },
  'google.sheets.update_values': { spreadsheet_id: 12345, range: RANGE, values: [['a']] },
  'google.sheets.append_values': { spreadsheet_id: 12345, range: RANGE, values: [['a']] },
  'google.gmail.create_draft': { to: ['person@example.com'], subject: 12345, body: 'Draft' },
  'google.calendar.create_event': {
    calendar_id: 'primary', summary: 12345, start: '2026-09-20', end: '2026-09-21',
  },
  'google.calendar.update_event': {
    calendar_id: 'primary', event_id: 'event-example', summary: 12345,
  },
};

function moduleOf(action) {
  return action.split('.')[1];
}

async function harness(module, respond) {
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'google', module, privilege: 'write' });
  const requests = [];
  fake.auth.proxy = async (request) => {
    requests.push(request);
    if (respond) return respond(request, requests.length);
    if (request.method === 'GET') {
      return { status: 200, data: { parents: ['folder-old', 'folder-other'] }, headers: {} };
    }
    return { status: 200, data: { ok: true }, headers: { 'set-cookie': 'secret' } };
  };
  return { gw, requests };
}

async function confirmed(gw, requests, action, input) {
  const before = requests.length;
  const stop = await gw.execute({ action, input });
  assert.equal(stop.status, 'needs_confirmation', action);
  assert.equal(stop.confirmation, 'always', action);
  assert.equal(requests.length, before, action);
  const result = await gw.execute({ action, input, confirm: true });
  return { stop, result };
}

async function refused(gw, requests, action, input, field) {
  const before = requests.length;
  const stop = await gw.execute({ action, input });
  assert.equal(requests.length, before, action);
  if (stop.status === 'needs_confirmation') {
    const result = await gw.execute({ action, input, confirm: true });
    assert.equal(requests.length, before, action);
    assert.equal(result.status, 'invalid_arguments', action);
    assert.equal(result.field, field, action);
    return result;
  }
  assert.equal(stop.status, 'invalid_arguments', action);
  assert.equal(stop.field, field, action);
  return stop;
}

function multipartParts(binary) {
  const boundary = binary.content_type.slice('multipart/related; boundary='.length);
  assert.equal(binary.content_type, `multipart/related; boundary=${boundary}`);
  const raw = Buffer.from(binary.base64, 'base64').toString('utf8');
  assert.equal(raw.startsWith(`--${boundary}\r\n`), true);
  assert.equal(raw.endsWith(`--${boundary}--\r\n`), true);
  const pieces = raw.split(`--${boundary}`).slice(1, -1);
  return pieces.map((piece) => {
    const trimmed = piece.replace(/^\r\n/, '').replace(/\r\n$/, '');
    const split = trimmed.indexOf('\r\n\r\n');
    return { headers: trimmed.slice(0, split), body: trimmed.slice(split + 4) };
  });
}

function decodeRaw(raw) {
  assert.equal(raw.includes('='), false);
  assert.equal(raw.includes('+'), false);
  assert.equal(raw.includes('/'), false);
  const pad = raw.length % 4 === 0 ? '' : '='.repeat(4 - (raw.length % 4));
  return Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64').toString('utf8');
}

function decodeWrapped(text) {
  return Buffer.from(text.replace(/\r\n/g, ''), 'base64').toString('utf8');
}

// RFC 2047 decoding for the UTF-8 B form: whitespace between adjacent encoded-words is not
// part of the text. A value with no encoded-word is the text itself.
function decodeSubject(value) {
  if (!value.includes('=?')) return value;
  const words = [...value.matchAll(/=\?UTF-8\?B\?([^?]*)\?=/g)];
  assert.equal(value.replace(/=\?UTF-8\?B\?[^?]*\?=/g, '').trim(), '', 'only encoded-words and whitespace');
  return Buffer.concat(words.map((m) => Buffer.from(m[1], 'base64'))).toString('utf8');
}

function assertDraft(raw, { to, cc, bcc, subject, body, html }) {
  const message = decodeRaw(raw);
  assert.equal(message.replace(/\r\n/g, '').includes('\n'), false);
  const [headerText, ...rest] = message.split('\r\n\r\n');
  const payload = rest.join('\r\n\r\n');
  // Judged by the RFCs rather than by the module's own formula: every physical line within
  // RFC 5322's 998 characters, every encoded-word within RFC 2047's 75, and the unfolded
  // headers decoding back to exactly what was asked for.
  for (const line of headerText.split('\r\n')) assert.ok(line.length <= 998, `header line of ${line.length}`);
  for (const word of headerText.match(/=\?[^?]+\?[BbQq]\?[^?]*\?=/g) ?? []) assert.ok(word.length <= 75, `encoded-word of ${word.length}`);
  const headers = headerText.replace(/\r\n(?=[ \t])/g, '').split('\r\n');
  assert.equal(headers[0], `To: ${to.join(', ')}`);
  let index = 1;
  if (cc) {
    assert.equal(headers[index], `Cc: ${cc.join(', ')}`);
    index += 1;
  }
  if (bcc) {
    assert.equal(headers[index], `Bcc: ${bcc.join(', ')}`);
    index += 1;
  }
  assert.equal(headers[index].startsWith('Subject:'), true);
  assert.equal(decodeSubject(headers[index].slice('Subject:'.length).replace(/^ /, '')), subject);
  assert.equal(headers[index + 1], 'MIME-Version: 1.0');
  if (!html) {
    assert.equal(headers[index + 2], 'Content-Type: text/plain; charset=UTF-8');
    assert.equal(headers[index + 3], 'Content-Transfer-Encoding: base64');
    assert.equal(headers.length, index + 4);
    assert.equal(decodeWrapped(payload), body);
    return;
  }
  const type = headers[index + 2];
  assert.equal(type.startsWith('Content-Type: multipart/alternative; boundary='), true);
  const boundary = type.slice('Content-Type: multipart/alternative; boundary='.length);
  assert.equal(payload.startsWith(`--${boundary}\r\n`), true);
  assert.equal(payload.endsWith(`--${boundary}--\r\n`), true);
  const parts = payload.split(`--${boundary}`).slice(1, -1).map((piece) => {
    const trimmed = piece.replace(/^\r\n/, '').replace(/\r\n$/, '');
    const split = trimmed.indexOf('\r\n\r\n');
    return { headers: trimmed.slice(0, split), body: trimmed.slice(split + 4) };
  });
  assert.equal(parts[0].headers, 'Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64');
  assert.equal(parts[1].headers, 'Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64');
  assert.equal(decodeWrapped(parts[0].body), body);
  assert.equal(decodeWrapped(parts[1].body), html);
}

test('a write on each of the five modules needs a grant before anything else', async () => {
  const { gw, fake } = await createTestGateway();
  const requests = [];
  fake.auth.proxy = async (request) => {
    requests.push(request);
    return { status: 200, data: {}, headers: {} };
  };
  const actions = [
    'google.drive.create_file',
    'google.docs.create',
    'google.sheets.update_values',
    'google.gmail.create_draft',
    'google.calendar.create_event',
  ];
  assert.deepEqual(actions.map(moduleOf), WRITE_MODULES);
  for (const action of actions) {
    assert.equal((await gw.execute({ action, input: valid[action] })).status, 'needs_connect');
  }
  assert.equal(requests.length, 0);
});

test('every Google module declares privilege write', () => {
  const manifest = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'manifest.json'), 'utf8'));
  const modules = Object.keys(manifest.modules);
  assert.deepEqual(modules, ['search-console', 'analytics', 'drive', 'calendar', 'gmail', 'sheets', 'docs', 'slides']);
  for (const name of modules) {
    assert.equal(manifest.modules[name].auth.privilege, 'write', name);
  }
});

test('drive.create_file posts metadata and returns only the proxied data', async () => {
  const { gw, requests } = await harness('drive');
  const kinds = {
    document: DOC,
    spreadsheet: SHEET,
    presentation: SLIDES,
    folder: FOLDER,
  };
  for (const [kind, mimeType] of Object.entries(kinds)) {
    const input = { name: 'Example', kind, folder_id: 'folder-example', description: 'A note' };
    const { stop, result } = await confirmed(gw, requests, 'google.drive.create_file', input);
    assert.equal(stop.risk, 'medium');
    assert.deepEqual(result, { ok: true });
    const request = requests.at(-1);
    assert.equal(request.method, 'POST');
    assert.equal(request.endpoint, DRIVE_FILES);
    assert.equal(request.binary_body, undefined);
    assert.deepEqual(request.body, {
      name: 'Example',
      mimeType,
      parents: ['folder-example'],
      description: 'A note',
    });
  }
});

test('drive.upload_file sends multipart metadata and media, and converts unless asked not to', async () => {
  const { gw, requests } = await harness('drive');
  const text = [
    ['text/plain', DOC, 'Hello file'],
    ['text/markdown', DOC, '# Title'],
    ['text/html', DOC, '<p>Hi</p>'],
    ['text/csv', SHEET, 'a,b'],
    ['text/tab-separated-values', SHEET, 'a\tb'],
  ];
  for (const [source_type, mimeType, content] of text) {
    const input = { name: 'Notes', source_type, content, folder_id: 'folder-example', description: 'Uploaded' };
    await confirmed(gw, requests, 'google.drive.upload_file', input);
    const request = requests.at(-1);
    assert.equal(request.method, 'POST');
    assert.equal(request.endpoint, `${DRIVE_UPLOAD}/files?uploadType=multipart&supportsAllDrives=true&fields=${FIELDS}`);
    assert.equal(request.body, undefined);
    const parts = multipartParts(request.binary_body);
    assert.equal(parts[0].headers, 'Content-Type: application/json; charset=UTF-8');
    assert.deepEqual(JSON.parse(parts[0].body), {
      name: 'Notes', mimeType, parents: ['folder-example'], description: 'Uploaded',
    });
    assert.equal(parts[1].headers, `Content-Type: ${source_type}`);
    assert.equal(parts[1].body, content);
  }
  const bytes = Buffer.from('office-bytes');
  const office = [
    [WORD, DOC],
    [EXCEL, SHEET],
    [POWERPOINT, SLIDES],
  ];
  for (const [source_type, mimeType] of office) {
    await confirmed(gw, requests, 'google.drive.upload_file', {
      name: 'Office', source_type, content_base64: bytes.toString('base64'),
    });
    const parts = multipartParts(requests.at(-1).binary_body);
    assert.deepEqual(JSON.parse(parts[0].body), { name: 'Office', mimeType });
    assert.equal(parts[1].headers, `Content-Type: ${source_type}`);
    assert.equal(parts[1].body, 'office-bytes');
  }
  await confirmed(gw, requests, 'google.drive.upload_file', {
    name: 'Plain', source_type: 'text/plain', content: 'as-is', convert: false,
  });
  const kept = multipartParts(requests.at(-1).binary_body);
  assert.deepEqual(JSON.parse(kept[0].body), { name: 'Plain', mimeType: 'text/plain' });
  assert.equal(kept[1].body, 'as-is');
});

test('drive.upload_file carries bytes that are not UTF-8 unchanged', async () => {
  const { gw, requests } = await harness('drive');
  // Every byte value, so a step that decoded the media as text would change it.
  const bytes = Buffer.from(Array.from({ length: 512 }, (_, i) => i % 256));
  await confirmed(gw, requests, 'google.drive.upload_file', {
    name: 'Binary', source_type: WORD, content_base64: bytes.toString('base64'), convert: false,
  });
  const sent = Buffer.from(requests[0].binary_body.base64, 'base64');
  const boundary = requests[0].binary_body.content_type.split('boundary=')[1];
  const head = Buffer.from(`\r\n--${boundary}\r\nContent-Type: ${WORD}\r\n\r\n`);
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  const start = sent.indexOf(head) + head.length;
  assert.ok(start > head.length);
  assert.equal(sent.subarray(sent.length - tail.length).equals(tail), true);
  assert.equal(sent.subarray(start, sent.length - tail.length).equals(bytes), true);
});

test('drive.rename_file patches only the name', async () => {
  const { gw, requests } = await harness('drive');
  const { stop, result } = await confirmed(gw, requests, 'google.drive.rename_file', {
    file_id: 'file-example', name: 'Renamed',
  });
  assert.equal(stop.risk, 'high');
  assert.deepEqual(result, { ok: true });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, 'PATCH');
  assert.equal(requests[0].endpoint, `${DRIVE}/files/file-example?supportsAllDrives=true&fields=${FIELDS}`);
  assert.deepEqual(requests[0].body, { name: 'Renamed' });
});

test('drive.move_file reads parents and removes exactly the parents that read returned', async () => {
  const { gw, requests } = await harness('drive');
  const { stop } = await confirmed(gw, requests, 'google.drive.move_file', {
    file_id: 'file-example', folder_id: 'folder-example',
  });
  assert.equal(stop.risk, 'high');
  assert.equal(requests.length, 2);
  assert.equal(requests[0].method, 'GET');
  assert.equal(requests[0].endpoint, `${DRIVE}/files/file-example?fields=parents&supportsAllDrives=true`);
  assert.equal(requests[0].body, undefined);
  assert.equal(requests[1].method, 'PATCH');
  assert.equal(requests[1].body, undefined);
  assert.equal(
    requests[1].endpoint,
    `${DRIVE}/files/file-example?addParents=folder-example&removeParents=folder-old%2Cfolder-other&supportsAllDrives=true&fields=${FIELDS}`,
  );
});

test('drive.move_file omits removeParents when the read returned none, and stops when the read is a status', async () => {
  const empty = await harness('drive', () => ({ status: 200, data: { parents: [] }, headers: {} }));
  await confirmed(empty.gw, empty.requests, 'google.drive.move_file', {
    file_id: 'file-example', folder_id: 'folder-example',
  });
  assert.equal(empty.requests.length, 2);
  assert.equal(
    empty.requests[1].endpoint,
    `${DRIVE}/files/file-example?addParents=folder-example&supportsAllDrives=true&fields=${FIELDS}`,
  );

  const stopped = await harness('drive', () => ({ status: 'unavailable' }));
  const result = await confirmed(stopped.gw, stopped.requests, 'google.drive.move_file', {
    file_id: 'file-example', folder_id: 'folder-example',
  });
  assert.deepEqual(result.result, { status: 'unavailable' });
  assert.equal(stopped.requests.length, 1);
  assert.equal(stopped.requests[0].method, 'GET');
});

test('docs.create posts the title', async () => {
  const { gw, requests } = await harness('docs');
  const { stop, result } = await confirmed(gw, requests, 'google.docs.create', { title: 'Example' });
  assert.equal(stop.risk, 'medium');
  assert.deepEqual(result, { ok: true });
  assert.equal(requests[0].method, 'POST');
  assert.equal(requests[0].endpoint, 'https://docs.googleapis.com/v1/documents');
  assert.deepEqual(requests[0].body, { title: 'Example' });
});

test('docs.edit sends one ordered batch and writeControl only when a revision is given', async () => {
  const { gw, requests } = await harness('docs');
  const operations = [
    { op: 'insert_text', text: 'Hello', index: 1 },
    { op: 'insert_text', text: 'End' },
    { op: 'replace_text', find: 'Hello', replace: 'Hi', match_case: false },
    { op: 'replace_text', find: 'Hi', replace: 'Hey' },
    { op: 'set_style', start_index: 1, end_index: 5, style: 'HEADING_1' },
    { op: 'create_list', start_index: 1, end_index: 5, list: 'bulleted' },
    { op: 'create_list', start_index: 1, end_index: 8, list: 'numbered' },
  ];
  await confirmed(gw, requests, 'google.docs.edit', {
    document_id: 'doc-example', operations, required_revision_id: 'rev-example',
  });
  assert.equal(requests[0].method, 'POST');
  assert.equal(requests[0].endpoint, 'https://docs.googleapis.com/v1/documents/doc-example:batchUpdate');
  assert.deepEqual(requests[0].body, {
    requests: [
      { insertText: { text: 'Hello', location: { index: 1 } } },
      { insertText: { text: 'End', endOfSegmentLocation: { segmentId: '' } } },
      { replaceAllText: { containsText: { text: 'Hello', matchCase: false }, replaceText: 'Hi' } },
      { replaceAllText: { containsText: { text: 'Hi', matchCase: true }, replaceText: 'Hey' } },
      {
        updateParagraphStyle: {
          range: { startIndex: 1, endIndex: 5 },
          paragraphStyle: { namedStyleType: 'HEADING_1' },
          fields: 'namedStyleType',
        },
      },
      {
        createParagraphBullets: {
          range: { startIndex: 1, endIndex: 5 },
          bulletPreset: 'BULLET_DISC_CIRCLE_SQUARE',
        },
      },
      {
        createParagraphBullets: {
          range: { startIndex: 1, endIndex: 8 },
          bulletPreset: 'NUMBERED_DECIMAL_ALPHA_ROMAN',
        },
      },
    ],
    writeControl: { requiredRevisionId: 'rev-example' },
  });
  await confirmed(gw, requests, 'google.docs.edit', {
    document_id: 'doc-example', operations: [{ op: 'insert_text', text: 'End' }],
  });
  assert.equal(Object.hasOwn(requests[1].body, 'writeControl'), false);
});

test('sheets update overwrites a range and append inserts rows', async () => {
  const { gw, requests } = await harness('sheets');
  const values = [['a', 1, true], ['=1+1']];
  await confirmed(gw, requests, 'google.sheets.update_values', {
    spreadsheet_id: 'sheet-example', range: RANGE, values,
  });
  assert.equal(requests[0].method, 'PUT');
  assert.equal(
    requests[0].endpoint,
    `https://sheets.googleapis.com/v4/spreadsheets/sheet-example/values/${RANGE_PATH}?valueInputOption=RAW`,
  );
  assert.deepEqual(requests[0].body, { range: RANGE, majorDimension: 'ROWS', values });
  await confirmed(gw, requests, 'google.sheets.append_values', {
    spreadsheet_id: 'sheet-example', range: RANGE, values, value_input_option: 'USER_ENTERED',
  });
  assert.equal(requests[1].method, 'POST');
  assert.equal(
    requests[1].endpoint,
    `https://sheets.googleapis.com/v4/spreadsheets/sheet-example/values/${RANGE_PATH}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
  );
  assert.deepEqual(requests[1].body, { range: RANGE, majorDimension: 'ROWS', values });
});

test('gmail.create_draft saves a raw RFC 5322 message and does not send it', async () => {
  const { gw, requests } = await harness('gmail');
  const plain = {
    to: ['one@example.com', 'two@example.com'],
    subject: 'Hello',
    body: 'x'.repeat(80),
  };
  const { stop } = await confirmed(gw, requests, 'google.gmail.create_draft', plain);
  assert.equal(stop.risk, 'medium');
  assert.equal(requests[0].method, 'POST');
  assert.equal(requests[0].endpoint, 'https://gmail.googleapis.com/gmail/v1/users/me/drafts');
  assert.equal(Object.keys(requests[0].body).join(','), 'message');
  assert.equal(Object.keys(requests[0].body.message).join(','), 'raw');
  assertDraft(requests[0].body.message.raw, plain);

  const rich = {
    to: ['person@example.com'],
    cc: ['cc@example.com'],
    bcc: ['bcc@example.com'],
    subject: 'Café',
    body: 'Plain line',
    body_html: '<p>Café</p>',
  };
  await confirmed(gw, requests, 'google.gmail.create_draft', rich);
  assertDraft(requests[1].body.message.raw, { ...rich, html: rich.body_html });
  assert.equal(
    decodeRaw(requests[1].body.message.raw).includes('Subject: =?UTF-8?B?Q2Fmw6k=?='),
    true,
  );

  // A subject past one line, ASCII or not, is folded into encoded-words that each stay
  // within RFC 2047's limit and cut no character in half.
  for (const subject of ['é'.repeat(24), 'x'.repeat(998), 'Résumé '.repeat(40).trim(), '😀'.repeat(30)]) {
    const long = { to: Array.from({ length: 50 }, (_, i) => `person${i}@example.com`), subject, body: 'Draft' };
    const at = requests.length;
    await confirmed(gw, requests, 'google.gmail.create_draft', long);
    assertDraft(requests[at].body.message.raw, long);
  }
});

test('calendar.create_event parses dates and date-times and sends sendUpdates all only when notify_guests is true', async () => {
  const { gw, requests } = await harness('calendar');
  await confirmed(gw, requests, 'google.calendar.create_event', {
    calendar_id: 'primary',
    summary: 'Example',
    description: 'A note',
    location: 'Room',
    start: '2026-09-20',
    end: '2026-09-21',
    attendees: ['person@example.com'],
  });
  assert.equal(requests[0].method, 'POST');
  assert.equal(requests[0].endpoint, 'https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=none');
  assert.deepEqual(requests[0].body, {
    summary: 'Example',
    description: 'A note',
    location: 'Room',
    start: { date: '2026-09-20' },
    end: { date: '2026-09-21' },
    attendees: [{ email: 'person@example.com' }],
  });

  await confirmed(gw, requests, 'google.calendar.create_event', {
    calendar_id: 'person@example.com',
    summary: 'Timed',
    start: '2026-09-20T12:00:00',
    end: '2026-09-20T13:00:00',
    time_zone: 'America/New_York',
    notify_guests: true,
  });
  assert.equal(
    requests[1].endpoint,
    'https://www.googleapis.com/calendar/v3/calendars/person%40example.com/events?sendUpdates=all',
  );
  assert.deepEqual(requests[1].body, {
    summary: 'Timed',
    start: { dateTime: '2026-09-20T12:00:00', timeZone: 'America/New_York' },
    end: { dateTime: '2026-09-20T13:00:00', timeZone: 'America/New_York' },
  });

  await confirmed(gw, requests, 'google.calendar.create_event', {
    calendar_id: 'primary',
    summary: 'Offset',
    start: '2026-09-20T15:00:00Z',
    end: '2026-09-20T16:00:00Z',
  });
  assert.deepEqual(requests[2].body.start, { dateTime: '2026-09-20T15:00:00Z' });
  assert.deepEqual(requests[2].body.end, { dateTime: '2026-09-20T16:00:00Z' });
  assert.equal(requests[2].endpoint.endsWith('sendUpdates=none'), true);
});

test('calendar.update_event patches only the fields given', async () => {
  const { gw, requests } = await harness('calendar');
  const { stop } = await confirmed(gw, requests, 'google.calendar.update_event', {
    calendar_id: 'primary', event_id: 'event-example', summary: 'Renamed',
  });
  assert.equal(stop.risk, 'high');
  assert.equal(requests[0].method, 'PATCH');
  assert.equal(
    requests[0].endpoint,
    'https://www.googleapis.com/calendar/v3/calendars/primary/events/event-example?sendUpdates=none',
  );
  assert.deepEqual(requests[0].body, { summary: 'Renamed' });

  await confirmed(gw, requests, 'google.calendar.update_event', {
    calendar_id: 'primary',
    event_id: 'event-example',
    start: '2026-09-20',
    end: '2026-09-22',
    attendees: ['person@example.com', 'other@example.com'],
    notify_guests: false,
  });
  assert.deepEqual(requests[1].body, {
    start: { date: '2026-09-20', dateTime: null, timeZone: null },
    end: { date: '2026-09-22', dateTime: null, timeZone: null },
    attendees: [{ email: 'person@example.com' }, { email: 'other@example.com' }],
  });

  // From all-day to a time: the patch clears the date it leaves, which Calendar would
  // otherwise merge back in beside the new time.
  await confirmed(gw, requests, 'google.calendar.update_event', {
    calendar_id: 'primary', event_id: 'event-example', start: '2026-10-11T10:00:00Z', end: '2026-10-11T11:00:00Z',
  });
  assert.deepEqual(requests[2].body, {
    start: { dateTime: '2026-10-11T10:00:00Z', date: null },
    end: { dateTime: '2026-10-11T11:00:00Z', date: null },
  });
});

test('calendar leaves end-after-start to Google and sends the span as given', async () => {
  const { gw, requests } = await harness('calendar');
  // Google refuses an empty or reversed span; the module does not compare the two.
  await confirmed(gw, requests, 'google.calendar.create_event', {
    calendar_id: 'primary', summary: 'Example', start: '2026-09-21', end: '2026-09-20',
  });
  assert.deepEqual(requests[0].body.start, { date: '2026-09-21' });
  assert.deepEqual(requests[0].body.end, { date: '2026-09-20' });
});

test('published schemas refuse an undeclared key, a mistyped field, a missing field, and a non-object', async () => {
  const byModule = new Map();
  for (const action of Object.keys(valid)) {
    const module = moduleOf(action);
    if (!byModule.has(module)) byModule.set(module, await harness(module));
    const { gw, requests } = byModule.get(module);
    // The template's schema block, applied to each write. The gateway applies it
    // before confirmation, so none of these reach the transport.
    for (const input of [
      { ...valid[action], undeclared: 'example' },
      mistyped[action],
      {},
    ]) {
      const refusedCall = await gw.execute({ action, input });
      assert.equal(refusedCall.status, 'invalid_arguments', `${action} ${JSON.stringify(input)}`);
      assert.equal(requests.length, 0, action);
    }
    for (const input of [null, [], 'example', 1]) {
      assert.deepEqual(
        await gw.execute({ action, input }),
        { status: 'invalid_arguments', field: 'input' },
      );
    }
    assert.equal(requests.length, 0, action);
  }
});

test('module rules refuse before any proxy call', async () => {
  const drive = await harness('drive');
  const docs = await harness('docs');
  const sheets = await harness('sheets');
  const gmail = await harness('gmail');
  const calendar = await harness('calendar');
  const cases = [
    [drive, 'google.drive.upload_file', {
      name: 'Example', source_type: 'text/plain', content: 'Hello', content_base64: 'YQ==',
    }, 'content_base64'],
    [drive, 'google.drive.upload_file', { name: 'Example', source_type: 'text/plain' }, 'content'],
    [drive, 'google.drive.upload_file', { name: 'Example', source_type: WORD, content: 'Hello' }, 'content'],
    [drive, 'google.drive.upload_file', {
      name: 'Example', source_type: EXCEL, content_base64: 'A',
    }, 'content_base64'],
    [drive, 'google.drive.upload_file', {
      name: 'Example', source_type: EXCEL, content_base64: 'YQ=',
    }, 'content_base64'],
    [drive, 'google.drive.create_file', { name: 'x'.repeat(1001), kind: 'document' }, 'name'],
    [docs, 'google.docs.edit', {
      document_id: 'doc-example', operations: [{ op: 'insert_text', text: 'Hello', index: 0 }],
    }, 'operations'],
    [docs, 'google.docs.edit', {
      document_id: 'doc-example',
      operations: [{ op: 'set_style', start_index: 4, end_index: 4, style: 'TITLE' }],
    }, 'operations'],
    [docs, 'google.docs.edit', {
      document_id: 'doc-example', operations: [{ op: 'replace_text', find: '', replace: 'x' }],
    }, 'operations'],
    [docs, 'google.docs.edit', {
      document_id: 'doc-example', operations: [{ op: 'insert_text', text: 'x'.repeat(100001) }],
    }, 'operations'],
    [docs, 'google.docs.edit', { document_id: 'doc-example', operations: [] }, 'operations'],
    [docs, 'google.docs.edit', {
      document_id: 'doc-example',
      operations: Array.from({ length: 51 }, () => ({ op: 'insert_text', text: 'x' })),
    }, 'operations'],
    [sheets, 'google.sheets.update_values', {
      spreadsheet_id: 'sheet-example', range: RANGE, values: [[]],
    }, 'values'],
    [sheets, 'google.sheets.update_values', {
      spreadsheet_id: 'sheet-example', range: RANGE, values: [[{}]],
    }, 'values'],
    [sheets, 'google.sheets.update_values', {
      spreadsheet_id: 'sheet-example', range: RANGE, values: [[null]],
    }, 'values'],
    [sheets, 'google.sheets.append_values', {
      spreadsheet_id: 'sheet-example', range: RANGE, values: [['x'.repeat(5001)]],
    }, 'values'],
    [sheets, 'google.sheets.update_values', {
      spreadsheet_id: 'sheet-example', range: RANGE, values: [Array.from({ length: 51 }, () => 'a')],
    }, 'values'],
    [gmail, 'google.gmail.create_draft', {
      to: ['person@example.com\r'], subject: 'Hello', body: 'Draft',
    }, 'to'],
    [gmail, 'google.gmail.create_draft', {
      to: ['person@example.com'], subject: 'Hello\n', body: 'Draft',
    }, 'subject'],
    [gmail, 'google.gmail.create_draft', {
      to: ['person@example.com'], cc: ['person@example.com\u0000'], subject: 'Hello', body: 'Draft',
    }, 'cc'],
    [gmail, 'google.gmail.create_draft', {
      to: ['person.example.com'], subject: 'Hello', body: 'Draft',
    }, 'to'],
    [gmail, 'google.gmail.create_draft', {
      to: ['@example.com'], subject: 'Hello', body: 'Draft',
    }, 'to'],
    [gmail, 'google.gmail.create_draft', {
      to: ['a@b@example.com'], subject: 'Hello', body: 'Draft',
    }, 'to'],
    [calendar, 'google.calendar.create_event', {
      calendar_id: '.', summary: 'Example', start: '2026-09-20', end: '2026-09-21',
    }, 'calendar_id'],
    [calendar, 'google.calendar.create_event', {
      calendar_id: '..', summary: 'Example', start: '2026-09-20', end: '2026-09-21',
    }, 'calendar_id'],
    [calendar, 'google.calendar.create_event', {
      calendar_id: 'primary/extra', summary: 'Example', start: '2026-09-20', end: '2026-09-21',
    }, 'calendar_id'],
    [calendar, 'google.calendar.create_event', {
      calendar_id: 'primary', summary: 'Example', start: '2026-09-20', end: '2026-09-20T12:00:00Z',
    }, 'end'],
    [calendar, 'google.calendar.create_event', {
      calendar_id: 'primary', summary: 'Example', start: '2026-09-20T12:00:00', end: '2026-09-20T13:00:00',
    }, 'time_zone'],
    [calendar, 'google.calendar.update_event', {
      calendar_id: 'primary', event_id: 'event-example',
    }, 'summary'],
    [calendar, 'google.calendar.update_event', {
      calendar_id: 'primary', event_id: 'event-example', time_zone: 'America/New_York',
    }, 'time_zone'],
    [calendar, 'google.calendar.create_event', {
      calendar_id: 'primary', summary: 'Example', start: '2026-09-20T12:00:00', end: '2026-09-20T13:00:00', time_zone: '+01:00',
    }, 'time_zone'],
    [sheets, 'google.sheets.update_values', {
      spreadsheet_id: 'sheet-example', range: '..', values: [['a']],
    }, 'range'],
    [sheets, 'google.sheets.append_values', {
      spreadsheet_id: 'sheet-example', range: '.', values: [['a']],
    }, 'range'],
    [calendar, 'google.calendar.create_event', {
      calendar_id: 'primary', summary: 'Example', start: '20 September 2026', end: '2026-09-21',
    }, 'start'],
    [calendar, 'google.calendar.create_event', {
      calendar_id: 'primary', summary: 'Example', start: '2026-02-30', end: '2026-03-01',
    }, 'start'],
    [gmail, 'google.gmail.create_draft', {
      to: ['person @example.com'], subject: 'Hello', body: 'Draft',
    }, 'to'],
    [calendar, 'google.calendar.create_event', {
      calendar_id: 'primary', summary: 'Example', start: '2026-09-20', end: '2026-09-21', attendees: ['nobody'],
    }, 'attendees'],
    [calendar, 'google.calendar.update_event', {
      calendar_id: 'primary', event_id: 'event-example', notify_guests: true,
    }, 'summary'],
  ];
  for (const [env, action, input, field] of cases) {
    await refused(env.gw, env.requests, action, input, field);
  }
  assert.equal(drive.requests.length, 0);
  assert.equal(docs.requests.length, 0);
  assert.equal(sheets.requests.length, 0);
  assert.equal(gmail.requests.length, 0);
  assert.equal(calendar.requests.length, 0);
});
