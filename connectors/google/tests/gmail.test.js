import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto, { createHash } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import { readFileSync, realpathSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { modules } from '../index.js';
import { loadConnector } from '../../../gateway/src/manifest.js';
import { validateInput } from '../../../gateway/src/input-schema.js';
import { schemaViolation } from '../../../gateway/test/agreement-harness.js';
import { createTestGateway, makeHome, putActive } from '../../../gateway/test/fake-provider.js';

const GOOGLE = fileURLToPath(new URL('..', import.meta.url));
const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
const actions = manifest.modules.gmail.actions;
const composing = ['create_draft', 'send_message'];
const writes = [...composing, 'send_draft'];
const BASE = { to: ['casey@example.test'], subject: 'Project Cedar', body: 'Plain café 😀' };
const REPLY = { thread_id: 'thread-example_1', in_reply_to: '<parent.1@example.test>', references: ['<ancestor.1@example.test>', '<parent.1@example.test>'] };
const MESSAGE = { id: 'message-example', threadId: 'thread-example_1', labelIds: ['SENT'] };
const DRAFT = { id: 'r-example-17', message: { ...MESSAGE, labelIds: ['DRAFT'] } };
const sha = (data) => createHash('sha256').update(data).digest('hex');
const record = (name, data = Buffer.from('invented PDF bytes'), media_type = 'application/pdf') => ({ name, data, media_type, size: data.length, sha256: sha(data) });

function context(name, files = [], answer) {
  const requests = [];
  let fileCalls = 0;
  const ctx = {
    inputFiles(field) { assert.equal(field, 'attachments'); fileCalls += 1; return files; },
    async proxy(request) { requests.push(request); return answer === undefined ? { status: 200, data: name === 'create_draft' ? DRAFT : MESSAGE } : answer; },
    catalog() { assert.fail('no catalog fallback or lookup'); },
  };
  return { ctx, requests, fileCalls: () => fileCalls };
}

async function run(name, input, files = [], answer) {
  const f = context(name, files, answer);
  const result = await modules.gmail[name](input, f.ctx);
  return { ...f, result };
}

async function accepted(name, input, files = []) {
  assert.equal(schemaViolation(actions[name].input, input), null, 'independent published-schema check');
  const f = await run(name, input, files);
  assert.deepEqual(f.result, name === 'create_draft' ? DRAFT : MESSAGE);
  assert.equal(f.requests.length, 1);
  return f;
}

async function refused(name, input, field) {
  const f = await run(name, input);
  assert.deepEqual(f.result, { status: 'invalid_arguments', field }, `${name}: ${field}`);
  assert.equal(f.requests.length, 0);
  assert.equal(f.fileCalls(), 0, 'argument refusal precedes capability use');
}

// Independent MIME reader: no encoder helpers are imported. Parse the tree first,
// then compare each leaf's decoded bytes and metadata with the planted records.
const utf8 = new TextDecoder('utf-8', { fatal: true });
function parsePart(wire) {
  const split = wire.indexOf('\r\n\r\n');
  assert.ok(split >= 0);
  const headerText = wire.slice(0, split);
  const body = wire.slice(split + 4);
  const headers = Object.fromEntries(headerText.replace(/\r\n[ \t]/g, ' ').split('\r\n').map((line) => {
    const colon = line.indexOf(':');
    assert.ok(colon > 0);
    return [line.slice(0, colon).toLowerCase(), line.slice(colon + 1).trim()];
  }));
  const type = headers['content-type'];
  if (type.startsWith('multipart/')) {
    const boundary = type.match(/boundary=([^; ]+)/)[1];
    assert.ok(body.startsWith(`--${boundary}\r\n`));
    assert.ok(body.endsWith(`--${boundary}--\r\n`));
    const pieces = body.split(`--${boundary}`);
    assert.equal(pieces[0], '');
    assert.equal(pieces.at(-1), '--\r\n');
    const parts = pieces.slice(1, -1).map((piece) => {
      assert.ok(piece.startsWith('\r\n') && piece.endsWith('\r\n'));
      return parsePart(piece.slice(2, -2));
    });
    return { headerText, headers, parts, boundary };
  }
  assert.equal(headers['content-transfer-encoding'], 'base64');
  const lines = body.split('\r\n');
  for (const [i, line] of lines.entries()) {
    assert.match(line, /^[A-Za-z0-9+/]*={0,2}$/);
    assert.ok(line.length <= 76);
    if (i < lines.length - 1) assert.equal(line.length, 76);
  }
  const compact = lines.join('');
  const data = Buffer.from(compact, 'base64');
  assert.equal(data.toString('base64'), compact);
  return { headerText, headers, data };
}

function decodeRaw(raw) {
  assert.match(raw, /^[A-Za-z0-9_-]+$/);
  const wire = Buffer.from(raw, 'base64url');
  assert.equal(wire.toString('base64url'), raw);
  const text = utf8.decode(wire);
  assert.equal(text.replace(/\r\n/g, '').includes('\n'), false);
  assert.equal(text.replace(/\r\n/g, '').includes('\r'), false);
  return { wire, text, tree: parsePart(text) };
}

function filename(part) {
  for (const line of part.headerText.split('\r\n')) assert.ok(line.length <= 78, line);
  assert.equal(part.headers['content-type'].includes('name='), false);
  const disposition = part.headers['content-disposition'];
  assert.ok(disposition.startsWith('attachment;'));
  const fallback = disposition.match(/filename="((?:\\.|[^"\\])*)"/)[1].replace(/\\(.)/g, '$1');
  const single = disposition.match(/filename\*=UTF-8''([^; ]+)/);
  const continuations = [...disposition.matchAll(/filename\*(\d+)\*=([^; ]+)/g)];
  if (!single && !continuations.length) return { fallback, original: fallback };
  const segments = single ? [single[1]] : continuations.map((match, i) => {
    assert.equal(Number(match[1]), i);
    return i === 0 ? match[2].replace(/^UTF-8''/, '') : match[2];
  });
  const original = segments.map((segment) => {
    assert.ok(segment.length <= 48);
    assert.match(segment, /^(?:%[0-9A-F]{2})+$/);
    return utf8.decode(Buffer.from(segment.replace(/%/g, ''), 'hex'));
  }).join('');
  assert.equal(disposition.includes('=?'), false);
  return { fallback, original };
}

function verifyMIME(request, input, files = []) {
  const raw = request.body.message?.raw ?? request.body.raw;
  const decoded = decodeRaw(raw);
  for (const path of input.attachments ?? []) assert.equal(decoded.text.includes(path), false);
  let body = decoded.tree;
  if (files.length) {
    assert.match(body.headers['content-type'], /^multipart\/mixed;/);
    assert.equal(body.parts.length, files.length + 1);
    for (let i = 0; i < files.length; i += 1) {
      const part = body.parts[i + 1];
      assert.equal(part.headers['content-type'], files[i].media_type);
      assert.deepEqual(part.data, files[i].data);
      assert.equal(part.data.length, files[i].size);
      assert.equal(sha(part.data), files[i].sha256);
      const names = filename(part);
      assert.equal(names.original, files[i].name);
      if (!/^[\x20-\x7e]+$/.test(files[i].name) || files[i].name.replace(/[\\"]/g, '\\$&').length > 60) {
        assert.equal(names.fallback, `attachment-${i + 1}`);
      }
    }
    body = body.parts[0];
  }
  if (Object.hasOwn(input, 'body_html')) {
    assert.match(body.headers['content-type'], /^multipart\/alternative;/);
    if (files.length) assert.notEqual(body.boundary, decoded.tree.boundary);
    assert.equal(body.parts.length, 2);
    assert.equal(body.parts[1].headers['content-type'], 'text/html; charset=UTF-8');
    assert.equal(utf8.decode(body.parts[1].data), input.body_html);
    body = body.parts[0];
  }
  assert.equal(body.headers['content-type'], 'text/plain; charset=UTF-8');
  assert.equal(utf8.decode(body.data), input.body);
  return decoded;
}

function verifyReply(request, input) {
  const decoded = decodeRaw(request.body.message?.raw ?? request.body.raw);
  const expected = Buffer.from('Subject: Project Cedar\r\nIn-Reply-To: <parent.1@example.test>\r\nReferences: <ancestor.1@example.test>\r\n <parent.1@example.test>\r\nMIME-Version: 1.0\r\n');
  assert.ok(decoded.wire.includes(expected), 'exact reply-header bytes, each id bracketed once');
  assert.equal((request.body.message ?? request.body).threadId, input.thread_id);
  assert.equal(decoded.text.includes('Re: '), false);
}

test('F12 changed Gmail writes require a module grant and retain gateway schema enforcement', async (t) => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('offline only'));
  const home = realpathSync(makeHome());
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const f = await createTestGateway({ home, session: false, connectors: [await loadConnector(GOOGLE)] });
  const requests = [];
  let moduleCalls = 0;
  for (const name of writes) t.mock.method(modules.gmail, name, () => { moduleCalls += 1; assert.fail('schema-invalid call reached module'); });
  f.fake.auth.proxy = async (req) => { requests.push(req); return { status: 200, data: MESSAGE }; };
  f.fake.catalog.execute = () => assert.fail('unexpected catalog call');
  for (const name of writes) {
    const input = name === 'send_draft' ? { draft_id: 'r-example-17' } : BASE;
    assert.equal((await f.gw.execute({ action: `google.gmail.${name}`, input })).status, 'needs_connect');
  }
  await putActive(f.store, f.fake, { service: 'google', module: 'gmail' });
  for (const name of writes) {
    const input = name === 'send_draft' ? { draft_id: 'r-example-17' } : BASE;
    const required = actions[name].input.required[0];
    const missing = { ...input }; delete missing[required];
    for (const bad of [{ ...input, undeclared: 'x' }, { ...input, '': 'x' }, { ...input, [required]: 17 }, missing, null, [], 'x', 3]) {
      const result = await f.gw.execute({ action: `google.gmail.${name}`, input: bad });
      assert.equal(result.status, 'invalid_arguments', name);
      assert.equal(requests.length, 0);
      assert.equal(moduleCalls, 0);
    }
  }
});

test('manifest declarations and public reply/address rules match the approved contract', () => {
  assert.equal(manifest.modules.gmail.auth.privilege, 'write');
  for (const name of composing) {
    assert.deepEqual(actions[name].input_files, { field: 'attachments', max_bytes: 2097152 });
    assert.match(actions[name].description, /case-insensitively/);
    assert.match(actions[name].description, /RFC 2822/);
    assert.match(actions[name].description, /last references entry must equal in_reply_to/);
    assert.match(actions[name].description, /together or omit all three/);
    assert.equal(actions[name].confirmation, 'always');
    assert.equal(schemaViolation(actions[name].input, BASE), null);
    assert.equal(schemaViolation(actions[name].input, { ...BASE, ...REPLY }), null);
  }
  assert.equal(actions.create_draft.standing_approval, undefined);
  assert.equal(actions.send_draft.input_files, undefined);
  assert.equal(actions.send_draft.standing_approval, undefined);
  assert.equal(actions.send_draft.risk, 'high');
  assert.equal(actions.send_draft.confirmation, 'always');
  assert.equal(actions.send_message.risk, 'high');
  assert.deepEqual(actions.send_message.standing_approval, { kind: 'send', summary: 'send Gmail messages', caution: 'This grant sends messages your assistant writes, to any recipient, with no look at each one before it is sent. It never covers a message with a local file attached.' });
  assert.ok(actions.send_draft.description.startsWith("Send this saved draft only with the person's explicit go for this message. This action always asks for confirmation and cannot use a standing approval."));
  assert.ok(actions.send_message.description.startsWith("Send only with the person's explicit go for this message, or a standing approval the person granted for this action. A call naming local attachments always asks for confirmation and is never covered by a standing approval."));
});

for (const name of composing) {
  test(`F13 ${name} recipient counts, one-mailbox pattern, code points and UTF-8 byte bounds`, async () => {
    const list = (n) => Array.from({ length: n }, (_, i) => `casey${i}@example.test`);
    for (const count of [1, 50]) await accepted(name, { ...BASE, to: list(count) });
    for (const count of [0, 51]) await refused(name, { ...BASE, to: list(count) }, 'to');
    for (const field of ['cc', 'bcc']) {
      for (const count of [0, 50]) await accepted(name, { ...BASE, [field]: list(count) });
      await refused(name, { ...BASE, [field]: list(51) }, field);
    }
    const bad = ['', 'casey', '@example.test', 'casey@', 'a@b@c', 'a b@example.test', 'a\t@example.test', 'a\r@example.test', 'a\n@example.test', 'a\0@example.test', 'a,b@example.test', 'undisclosed:bob@example.test;', 'Casey <casey@example.test>', '"casey"@example.test', ...[',', ';', ':', '<', '>', '(', ')', '[', ']', '"', '\\'].map((char) => `a${char}b@example.test`), `${'a'.repeat(253)}@b`, `${'é'.repeat(127)}@b`, `${'😀'.repeat(64)}@a`];
    for (const field of ['to', 'cc', 'bcc']) {
      for (const address of bad) await refused(name, { ...BASE, [field]: [address] }, field);
      for (const address of [`${'a'.repeat(252)}@b`, `${'é'.repeat(126)}@b`, 'a@b']) await accepted(name, { ...BASE, [field]: [address] });
      const pattern = actions[name].input.properties[field].items.pattern;
      assert.ok(new RegExp(pattern).test('person@example.com'));
      assert.equal(new RegExp(pattern).test('a,b@example.test'), false);
      assert.equal(actions[name].input.properties[field].items.maxLength, 254);
    }
  });

  test(`F13 ${name} subject/body/HTML bounds and lone surrogates in every string field`, async () => {
    for (const subject of ['', 'x'.repeat(998), '😀'.repeat(998)]) await accepted(name, { ...BASE, subject });
    for (const subject of ['x'.repeat(999), '😀'.repeat(999), 'x\r', 'x\n', 'x\0']) await refused(name, { ...BASE, subject }, 'subject');
    for (const field of ['body', 'body_html']) {
      for (const text of ['', 'a'.repeat(200000), '😀'.repeat(200000)]) await accepted(name, { ...BASE, [field]: text });
      for (const text of ['a'.repeat(200001), '😀'.repeat(200001)]) await refused(name, { ...BASE, [field]: text }, field);
    }
    for (const lone of ['\ud800', '\udfff']) {
      for (const field of ['to', 'cc', 'bcc', 'subject', 'body', 'body_html', 'attachments', 'thread_id', 'in_reply_to', 'references']) {
        const value = ['to', 'cc', 'bcc', 'attachments', 'references'].includes(field) ? [`/invented-${lone}@example.test`] : lone;
        await refused(name, { ...BASE, ...REPLY, [field]: value }, field);
      }
    }
  });

  test(`F15 ${name} all reply branches, exact header bytes and real Gmail Message-Id shapes`, async () => {
    const fresh = await accepted(name, BASE);
    assert.equal(Object.hasOwn(fresh.requests[0].body.message ?? fresh.requests[0].body, 'threadId'), false);
    const f = await accepted(name, { ...BASE, ...REPLY });
    verifyReply(f.requests[0], REPLY);
    const fields = ['thread_id', 'in_reply_to', 'references'];
    for (let mask = 1; mask < 7; mask += 1) {
      const partial = Object.fromEntries(fields.filter((_, i) => mask & (1 << i)).map((field) => [field, REPLY[field]]));
      const input = { ...BASE, ...partial };
      assert.ok(schemaViolation(actions[name].input, input));
      await refused(name, input, fields.find((field) => !Object.hasOwn(partial, field)));
    }
    for (const thread_id of ['', 'a'.repeat(101), '.', '/thread', 'x?y', 'x\r\n', 'é']) await refused(name, { ...BASE, ...REPLY, thread_id }, 'thread_id');
    for (const thread_id of ['a'.repeat(100), '_', '-']) await accepted(name, { ...BASE, ...REPLY, thread_id });
    const invalidIds = ['<a>', `<${'a'.repeat(249)}@b.c>`, '<a@example.test>\r\nBcc: x@example.test', '<a..b@example.test>', '<é@example.test>', '<"a"@example.test>', '<a(comment)@example.test>', '<a@[127.0.0.1]>', 'parent@example.test', '<a@-example.test>', '<a@example-.test>'];
    for (const id of invalidIds) {
      await refused(name, { ...BASE, ...REPLY, in_reply_to: id }, 'in_reply_to');
      await refused(name, { ...BASE, ...REPLY, references: [id, REPLY.in_reply_to] }, 'references');
    }
    for (const references of [[], Array(21).fill(REPLY.in_reply_to), [3], ['<other@example.test>']]) await refused(name, { ...BASE, ...REPLY, references }, 'references');
    await accepted(name, { ...BASE, ...REPLY, references: Array(20).fill(REPLY.in_reply_to) });
    const ids = ['<a@b>', `<${'a'.repeat(248)}@b.c>`, '<CAQ7invEntedShapeOne9x=Qq2mZ8@mail.gmail.com>', '<CAQ7invEnted-Y-0shape+TwoQ=wk3@mail.gmail.com>'];
    for (const in_reply_to of ids) await accepted(name, { ...BASE, ...REPLY, in_reply_to, references: [in_reply_to] });
  });

  test(`F14/F17 ${name} plain, HTML and nested attachment MIME round trips`, async () => {
    const files = [record('report.pdf'), record('zero.bin', Buffer.alloc(0), 'application/octet-stream'), record('bytes.bin', Buffer.from(Array.from({ length: 1024 }, (_, i) => i % 256)), 'application/octet-stream')];
    for (const withFiles of [false, true]) {
      for (const html of [undefined, '', '<p>Café 😀</p>']) {
        const input = { ...BASE, cc: ['cc@example.test'], bcc: ['bcc@example.test'], ...(html === undefined ? {} : { body_html: html }), ...(withFiles ? { attachments: files.map((_, i) => `/invented-local/file-${i}`), ...REPLY } : {}) };
        const f = await accepted(name, input, withFiles ? files : []);
        assert.equal(f.fileCalls(), withFiles ? 1 : 0);
        const req = f.requests[0];
        assert.equal(req.endpoint, `https://gmail.googleapis.com/gmail/v1/users/me/${name === 'create_draft' ? 'drafts' : 'messages/send'}`);
        assert.equal(req.method, 'POST');
        assert.deepEqual(req.parameters, [{ name: 'fields', type: 'query', value: name === 'create_draft' ? 'id,message(id,threadId,labelIds)' : 'id,threadId,labelIds' }]);
        assert.deepEqual(Object.keys(req.body).sort(), name === 'create_draft' ? ['message'] : withFiles ? ['raw', 'threadId'] : ['raw']);
        const decoded = verifyMIME(req, input, withFiles ? files : []);
        assert.equal(decoded.tree.headers.to, BASE.to[0]);
        assert.equal(decoded.tree.headers.cc, input.cc[0]);
        assert.equal(decoded.tree.headers.bcc, input.bcc[0]);
        if (withFiles) verifyReply(req, REPLY);
      }
    }
  });

  test(`F14 ${name} quoted ASCII and RFC 2231 filenames, Unicode segments and header folding`, async () => {
    const names = ['quote"back\\slash.txt', 'a'.repeat(60), 'a'.repeat(61), 'é.txt', '😀'.repeat(40) + '.pdf', 'line\r\nInjected: x\0.txt', 'a'.repeat(200) + '.txt'];
    const files = names.map((name) => record(name));
    const input = { ...BASE, attachments: names.map((_, i) => `/invented-local/file-${i}`) };
    const f = await accepted(name, input, files);
    verifyMIME(f.requests[0], input, files);
  });

  test(`F14 ${name} attachments retain folded recipients and independently decoded Unicode subjects`, async () => {
    const subject = 'Résumé 😀 '.repeat(40);
    const files = [record('slides.pptx', Buffer.from('invented slides'), 'application/vnd.openxmlformats-officedocument.presentationml.presentation')];
    const input = { ...BASE, subject, to: Array.from({ length: 50 }, (_, i) => `casey${i}@example.test`), body_html: '', attachments: ['/invented-local/slides.pptx'] };
    const f = await accepted(name, input, files);
    const { tree, text } = verifyMIME(f.requests[0], input, files);
    assert.equal(tree.headers.to, input.to.join(', '));
    assert.ok(text.startsWith(`To: ${input.to.join(',\r\n ')}\r\nSubject:`));
    const value = tree.headers.subject;
    const words = [...value.matchAll(/=\?UTF-8\?B\?([^?]+)\?=/g)];
    assert.equal(value.replace(/=\?UTF-8\?B\?[^?]+\?=/g, '').trim(), '');
    assert.equal(words.map((match) => {
      assert.ok(match[0].length <= 75);
      return utf8.decode(Buffer.from(match[1], 'base64'));
    }).join(''), subject);
    for (const line of tree.headerText.split('\r\n')) assert.ok(line.length <= 78);
  });

  test(`F05 ${name} attachment path bounds and unavailable or malformed private capability fail closed`, async () => {
    for (const attachments of [[], Array(11).fill('/invented-local/file'), [''], ['/' + 'x'.repeat(4096)], ['relative'], ['/nul\0'], [3], null]) await refused(name, { ...BASE, attachments }, 'attachments');
    for (const count of [1, 10]) await accepted(name, { ...BASE, attachments: Array(count).fill('/invented-local/file') }, Array.from({ length: count }, () => record('file')));
    for (const path of ['/' + 'x'.repeat(4095), '/' + '😀'.repeat(4095), 'C:\\invented\\file', '\\\\host\\file']) await accepted(name, { ...BASE, attachments: [path] }, [record('file')]);
    const input = { ...BASE, attachments: ['/invented-local/file'] };
    const good = record('file');
    const badFiles = [null, [], [{ ...good, data: new Uint8Array(2) }], [{ ...good, size: good.size + 1 }], [{ ...good, sha256: '0'.repeat(64) }], [{ ...good, name: '' }], [{ ...good, name: '../file' }], [{ ...good, name: '\ud800' }], [{ ...good, media_type: 'text/plain\r\nInjected: true' }], [{ ...good, media_type: 'text/plain; x=y' }], [good, good]];
    for (const files of badFiles) {
      const f = await run(name, input, files);
      assert.deepEqual(f.result, { status: 'invalid_arguments', field: 'attachments' });
      assert.equal(f.requests.length, 0);
    }
    for (const capability of [undefined, () => { throw new Error('invented private failure'); }]) {
      const f = context(name); f.ctx.inputFiles = capability;
      assert.deepEqual(await modules.gmail[name](input, f.ctx), { status: 'invalid_arguments', field: 'attachments' });
      assert.equal(f.requests.length, 0);
    }
  });
}

test('F14 no-file plain output is byte-for-byte unchanged and boundaries avoid serialized header collisions', async (t) => {
  const plain = await accepted('create_draft', { ...BASE, body: 'abc' });
  assert.equal(decodeRaw(plain.requests[0].body.message.raw).text, 'To: casey@example.test\r\nSubject: Project Cedar\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\nYWJj');
  const sequence = ['collision', 'alternative', 'alternative', 'mixed'];
  t.mock.method(crypto, 'randomUUID', () => { assert.ok(sequence.length); return sequence.shift(); });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  const files = [record('wiser-collision')];
  const input = { ...BASE, body: '--wiser-collision', body_html: '--wiser-alternative', attachments: ['/invented-local/file'] };
  const f = await accepted('create_draft', input, files);
  const decoded = verifyMIME(f.requests[0], input, files);
  assert.equal(decoded.tree.boundary, 'wiser-mixed');
  assert.equal(decoded.tree.parts[0].boundary, 'wiser-alternative');
  assert.equal(sequence.length, 0);
});

test('F13 calendar attendees keep ADDRESS while Gmail uses MAILBOX', async () => {
  const schema = manifest.modules.calendar.actions.create_event.input;
  assert.ok(new RegExp(schema.properties.attendees.items.pattern).test('a,b@example.test'));
  assert.ok(new RegExp(schema.properties.attendees.items.pattern).test('person@example.com'));
  const f = context('create_event');
  const input = { calendar_id: 'primary', summary: 'Project Cedar', start: '2026-10-30', end: '2026-10-31', attendees: ['a,b@example.test'] };
  assert.equal(validateInput(schema, input), null);
  await modules.calendar.create_event(input, f.ctx);
  assert.equal(f.requests.length, 1);
  assert.deepEqual(f.requests[0].body.attendees, [{ email: 'a,b@example.test' }]);
});

test('F16 send_draft validates only a saved Draft id and sends exactly once with only id', async () => {
  const f = await accepted('send_draft', { draft_id: 'r-example-17' });
  assert.equal(f.fileCalls(), 0);
  assert.deepEqual(f.requests[0], { endpoint: 'https://gmail.googleapis.com/gmail/v1/users/me/drafts/send', method: 'POST', body: { id: 'r-example-17' }, parameters: [{ name: 'fields', type: 'query', value: 'id,threadId,labelIds' }] });
  for (const draft_id of [undefined, '', 'a'.repeat(101), 'x/y', 'x?y', 'x\r\n', 'é', '\ud800', 3]) await refused('send_draft', { draft_id }, 'draft_id');
  for (const field of ['to', 'raw', 'attachments', '']) await refused('send_draft', { draft_id: 'r-example-17', [field]: 'x' }, field);
  await accepted('send_draft', { draft_id: 'a'.repeat(100) });
});

for (const name of writes) {
  test(`F18 ${name} selected resource projection, optional members, fixed malformed-success failure and statuses`, async () => {
    const input = name === 'send_draft' ? { draft_id: 'r-example-17' } : BASE;
    const message = { ...MESSAGE, raw: 'private-MIME-marker', payload: { bytes: 'private-bytes-marker' }, bytes: [1, 2] };
    const resource = name === 'create_draft' ? { id: DRAFT.id, message, raw: 'private-marker' } : message;
    for (const answer of [resource, { status: 200, data: resource }]) {
      const f = await run(name, input, [], answer);
      assert.deepEqual(f.result, name === 'create_draft' ? { id: DRAFT.id, message: MESSAGE } : MESSAGE);
      assert.equal(f.requests.length, 1);
    }
    const minimal = name === 'create_draft' ? { id: DRAFT.id, message: { id: MESSAGE.id } } : { id: MESSAGE.id };
    assert.deepEqual((await run(name, input, [], { status: 200, data: minimal })).result, minimal);
    const malformedMessages = [null, [], {}, { id: '' }, { id: 17 }, { id: 'm', threadId: 3 }, { id: 'm', labelIds: 'SENT' }, { id: 'm', labelIds: [3] }];
    const malformed = name === 'create_draft' ? [...malformedMessages.map((message) => ({ id: 'r-example-17', message })), { message: MESSAGE }, { id: '', message: MESSAGE }, { id: 3, message: MESSAGE }] : malformedMessages;
    for (const data of malformed) {
      const f = await run(name, input, [], { status: 200, data, raw: 'private-marker' });
      assert.deepEqual(f.result, { status: 'vendor_error', reason: 'unexpected_response' });
      assert.equal(f.requests.length, 1);
    }
    for (const status of [{ status: 'needs_connect' }, { status: 'vendor_error', reason: 'invented refusal' }, { status: 'unavailable' }]) {
      const f = await run(name, input, [], status);
      assert.deepEqual(f.result, status);
      assert.equal(f.requests.length, 1);
    }
    const f = context(name);
    f.ctx.proxy = async (request) => { f.requests.push(request); throw new Error('invented timeout'); };
    await assert.rejects(modules.gmail[name](input, f.ctx), /invented timeout/);
    assert.equal(f.requests.length, 1);
  });
}
