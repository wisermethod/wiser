import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadConnector } from '../src/manifest.js';
import { createTestGateway, putActive } from './fake-provider.js';

const GOOGLE = fileURLToPath(new URL('../../connectors/google', import.meta.url));
const NOW = Date.parse('2026-10-31T12:00:00Z');
const DAY = 86400000;
const SEND = 'google.gmail.send_message';
const DRAFT_SEND = 'google.gmail.send_draft';
const CREATE = 'google.gmail.create_draft';
const SCOPE = { module: 'google.gmail', root: 'cedar-project', playbook: 'cedar-mail.plan.md' };
const BASE = { to: ['casey@example.test'], subject: 'Project Cedar', body: 'Invented café 😀 body' };
const REPLY = { thread_id: 'thread-example_1', in_reply_to: '<parent.1@example.test>', references: ['<ancestor.1@example.test>', '<parent.1@example.test>'] };
const MESSAGE = { id: 'message-example', threadId: REPLY.thread_id, labelIds: ['SENT'] };
const DRAFT = { id: 'r-example-17', message: { ...MESSAGE, labelIds: ['DRAFT'] } };
const CAUTION = 'This grant sends messages your assistant writes, to any recipient, with no look at each one before it is sent. It never covers a message with a local file attached.';
const sha = (data) => createHash('sha256').update(data).digest('hex');

async function fixture(t, options = {}) {
  t.mock.method(globalThis, 'fetch', () => assert.fail('offline test attempted network access'));
  // Only invented files in a canonical temporary directory. No default credential
  // path, operator directory or live provider is consulted by this fixture.
  const root = fs.mkdtempSync(join(fs.realpathSync(os.tmpdir()), 'wiser-gmail-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (name, data) => {
    const path = join(root, name);
    fs.mkdirSync(dirname(path), { recursive: true });
    fs.writeFileSync(path, data);
    return path;
  };
  const home = join(root, 'gateway');
  fs.mkdirSync(home);
  const envPath = write('config/invented-config', '');
  const connector = await loadConnector(GOOGLE);
  connector.manifest = structuredClone(connector.manifest);
  let now = NOW;
  const f = await createTestGateway({ home, session: false, now: () => now, connectors: [connector], envPath,
    ...(options.armed === false ? {} : { inputFileAccess: { enabled: true, envPath, secretFiles: {} } }) });
  await putActive(f.store, f.fake, { service: 'google', module: 'gmail' });
  const calls = [];
  f.fake.auth.proxy = async (req) => { calls.push(req); return { status: 200, data: req.endpoint.endsWith('/drafts') ? DRAFT : MESSAGE }; };
  f.fake.catalog.execute = () => assert.fail('no catalog lookup, retry or fallback');
  return { ...f, root, write, calls, actions: connector.manifest.modules.gmail.actions,
    tick(days) { now += days * DAY; },
    execute(action, input, extra = {}) { return f.gw.callTool('execute', { action, input, ...extra }); } };
}

async function grant(f) {
  const proposal = await f.gw.callTool('standing_approvals', { ...SCOPE, mode: 'propose' });
  assert.equal(proposal.status, 'standing_approval_proposed');
  assert.deepEqual(proposal.kinds, ['send']);
  assert.equal(proposal.scope.days, 90);
  assert.ok(proposal.warning.includes(CAUTION));
  assert.match(proposal.warning, /to any recipient/);
  assert.match(proposal.warning, /90 days/);
  const answer = await f.gw.callTool('standing_approvals', { ...SCOPE, mode: 'grant', confirmed: true });
  assert.equal(answer.status, 'ok');
  const saved = answer.standing_approval;
  assert.equal(Date.parse(saved.expires_at) - NOW, 90 * DAY);
  assert.deepEqual(saved.cautions, [CAUTION]);
  return saved;
}

const scope = { root: SCOPE.root, playbook: SCOPE.playbook };
function noContent(value, files) {
  const text = JSON.stringify(value);
  for (const bytes of files) {
    if (!bytes.length) continue;
    assert.equal(text.includes(bytes.toString()), false);
    assert.equal(text.includes(bytes.toString('base64')), false);
    assert.equal(text.includes(sha(bytes)), false);
  }
}

// Independent recursive MIME decoding at the actual provider boundary.
function mime(raw) {
  assert.match(raw, /^[A-Za-z0-9_-]+$/);
  const text = Buffer.from(raw, 'base64url').toString('utf8');
  const parse = (wire) => {
    const at = wire.indexOf('\r\n\r\n');
    assert.ok(at >= 0);
    const head = wire.slice(0, at).replace(/\r\n[ \t]/g, ' ');
    const body = wire.slice(at + 4);
    const boundary = head.match(/Content-Type: multipart\/[^;]+; boundary=([^\r\n ]+)/)?.[1];
    if (boundary) {
      assert.ok(body.endsWith(`--${boundary}--\r\n`));
      return { head, parts: body.split(`--${boundary}`).slice(1, -1).map((part) => parse(part.slice(2, -2))) };
    }
    assert.match(head, /Content-Transfer-Encoding: base64/);
    const compact = body.replace(/\r\n/g, '');
    const data = Buffer.from(compact, 'base64');
    assert.equal(data.toString('base64'), compact);
    return { head, data };
  };
  return { text, tree: parse(text) };
}

test('F16 send_draft is ungrantable and always stops under a matching Playbook send grant', async (t) => {
  const f = await fixture(t);
  const saved = await grant(f);
  const input = { draft_id: 'r-example-17' };
  const stop = await f.execute(DRAFT_SEND, input, scope);
  assert.equal(stop.status, 'needs_confirmation');
  assert.equal(stop.confirmation, 'always');
  assert.equal(stop.risk, 'high');
  assert.equal(Object.hasOwn(stop, 'standing_approval'), false);
  assert.ok(stop.input_values.some((entry) => entry.name === 'draft_id' && entry.value === '"r-example-17"'));
  assert.equal(f.calls.length, 0);
  const answer = await f.execute(DRAFT_SEND, input, { ...scope, confirm: true });
  assert.deepEqual(answer, MESSAGE);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].endpoint, 'https://gmail.googleapis.com/gmail/v1/users/me/drafts/send');
  assert.deepEqual(f.calls[0].body, { id: input.draft_id });
  assert.deepEqual(f.calls[0].parameters, [{ name: 'fields', type: 'query', value: 'id,threadId,labelIds' }]);
  assert.ok(saved.id);
});

test('F11/F17 a 90-day Playbook send grant runs one attachment-free message with grant and audit metadata', async (t) => {
  const f = await fixture(t);
  const saved = await grant(f);
  assert.deepEqual(saved.actions, [SEND]);
  f.tick(30); // Exercise the Milestone 2 lifetime beyond the old seven-day cap.
  const answer = await f.execute(SEND, BASE, scope);
  assert.deepEqual(answer, { ...MESSAGE, standing_approval: { id: saved.id, expires_at: saved.expires_at } });
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].endpoint, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
  assert.deepEqual(Object.keys(f.calls[0].body), ['raw']);
  assert.equal(f.gw.pendingConfirmations.size, 0);
  const audit = fs.readFileSync(f.audit.file, 'utf8').trim().split('\n').map(JSON.parse).filter((line) => line.op === 'execute');
  assert.equal(audit.length, 1);
  assert.equal(audit[0].grant_id, saved.id);
  for (const extra of [{ root: 'another-project', playbook: scope.playbook }, { root: scope.root, playbook: 'another.plan.md' }, {}]) {
    assert.equal((await f.execute(SEND, BASE, extra)).status, 'needs_confirmation');
    assert.equal(f.calls.length, 1);
  }
});

test('F17 the same grant-covered message with one local attachment restores the stop and sends only on confirmation', async (t) => {
  const f = await fixture(t);
  await grant(f);
  assert.equal((await f.execute(SEND, BASE, scope)).id, MESSAGE.id);
  const bytes = Buffer.from('invented-private-attachment-marker');
  const path = f.write('files/report.pdf', bytes);
  const input = { ...BASE, attachments: [path] };
  const stop = await f.execute(SEND, input, scope);
  assert.equal(stop.status, 'needs_confirmation');
  assert.equal(stop.risk, 'high');
  assert.equal(Object.hasOwn(stop, 'standing_approval'), false);
  assert.equal(f.calls.length, 1);
  assert.deepEqual(stop.attachment_files, [{ name: { value: '"report.pdf"', truncated: false }, path: { value: JSON.stringify(path), truncated: false }, size: bytes.length }]);
  noContent(stop, [bytes]);
  const answer = await f.execute(SEND, input, { ...scope, confirm: true });
  assert.deepEqual(answer, MESSAGE);
  assert.equal(f.calls.length, 2);
  const decoded = mime(f.calls[1].body.raw);
  assert.match(decoded.tree.head, /multipart\/mixed/);
  assert.equal(decoded.tree.parts[0].data.toString('utf8'), BASE.body);
  assert.deepEqual(decoded.tree.parts[1].data, bytes);
  assert.equal(decoded.text.includes(path), false);
  noContent(answer, [bytes]);
  noContent(fs.readFileSync(f.audit.file, 'utf8'), [bytes]);
});

for (const action of [CREATE, SEND]) {
  for (const variant of ['plain', 'reply', 'html-files-reply']) {
    test(`F14/F17 ${action} ${variant} stops before transport and confirms exactly one request`, async (t) => {
      const f = await fixture(t);
      const files = [Buffer.from('invented PDF bytes'), Buffer.from(Array.from({ length: 512 }, (_, i) => i % 256)), Buffer.alloc(0)];
      const paths = files.map((bytes, i) => f.write(`files/part-${i}.pdf`, bytes));
      const input = { ...BASE, ...(variant === 'plain' ? {} : REPLY), ...(variant === 'html-files-reply' ? { body_html: '<p>Invented café 😀</p>', attachments: paths } : {}) };
      const stop = await f.execute(action, input);
      assert.equal(stop.status, 'needs_confirmation');
      assert.equal(stop.risk, action === CREATE ? 'medium' : 'high');
      assert.equal(f.calls.length, 0);
      noContent(stop, files);
      const answer = await f.execute(action, input, { confirm: true });
      assert.deepEqual(answer, action === CREATE ? DRAFT : MESSAGE);
      assert.equal(f.calls.length, 1);
      const req = f.calls[0];
      assert.equal(req.endpoint, `https://gmail.googleapis.com/gmail/v1/users/me/${action === CREATE ? 'drafts' : 'messages/send'}`);
      assert.equal(req.method, 'POST');
      const message = action === CREATE ? req.body.message : req.body;
      assert.deepEqual(Object.keys(message).sort(), variant === 'plain' ? ['raw'] : ['raw', 'threadId']);
      const decoded = mime(message.raw);
      for (const path of paths) assert.equal(decoded.text.includes(path), false);
      if (variant !== 'plain') {
        assert.equal(message.threadId, REPLY.thread_id);
        assert.ok(Buffer.from(decoded.text).includes(Buffer.from('Subject: Project Cedar\r\nIn-Reply-To: <parent.1@example.test>\r\nReferences: <ancestor.1@example.test>\r\n <parent.1@example.test>\r\nMIME-Version: 1.0')));
      }
      if (variant === 'html-files-reply') {
        const parts = decoded.tree.parts;
        assert.equal(parts.length, 4);
        assert.equal(parts[0].parts[0].data.toString(), input.body);
        assert.equal(parts[0].parts[1].data.toString(), input.body_html);
        for (let i = 0; i < files.length; i += 1) {
          assert.deepEqual(parts[i + 1].data, files[i]);
          assert.equal(sha(parts[i + 1].data), sha(files[i]));
          assert.equal(parts[i + 1].data.length, files[i].length);
        }
      }
      noContent(answer, files);
      noContent(fs.readFileSync(f.audit.file, 'utf8'), files);
    });
  }
}

test('F17 a forged confirm with no pending stop runs no module transport, including real attachments', async (t) => {
  const f = await fixture(t);
  let moduleCalls = 0;
  for (const name of ['send_draft', 'send_message']) t.mock.method(f.connectors[0].impl.modules.gmail, name, () => {
    moduleCalls += 1;
    assert.fail('forged confirmation reached the module');
  });
  const path = f.write('files/invented.txt', 'invented-private-forged-marker');
  for (const [action, input] of [[DRAFT_SEND, { draft_id: 'r-example-17' }], [SEND, BASE], [SEND, { ...BASE, attachments: [path] }]]) {
    const stop = await f.execute(action, input, { confirm: true });
    assert.equal(stop.status, 'needs_confirmation');
    assert.equal(stop.reason, 'unmatched_confirm');
    assert.equal(f.calls.length, 0);
    assert.equal(moduleCalls, 0);
  }
});

test('F09 the real composing actions without file permission remain usable without attachments and local_only with them', async (t) => {
  const f = await fixture(t, { armed: false });
  const path = f.write('files/invented.txt', 'invented-only');
  for (const action of [CREATE, SEND]) {
    assert.equal((await f.execute(action, BASE)).status, 'needs_confirmation');
    assert.deepEqual(await f.execute(action, { ...BASE, attachments: [path] }), {
      status: 'local_only', action, reason: 'Calls naming local input files run only on the local stdio gateway.',
    });
  }
  assert.equal(f.calls.length, 0);
});

for (const action of [CREATE, DRAFT_SEND, SEND]) {
  test(`F18 ${action} 403, 413 and timeout failures are sanitized with one request and no compensating send`, async (t) => {
    const f = await fixture(t);
    const input = action === DRAFT_SEND ? { draft_id: 'r-example-17' } : BASE;
    for (const http_status of [403, 413, 0]) {
      const before = f.calls.length;
      f.fake.auth.proxy = async (req) => {
        f.calls.push(req);
        return { status: http_status, error: { code: 'vendor_error', endpoint: req.endpoint, method: 'POST', message: 'invented-private-error-body' }, data: { raw: 'invented-private-MIME' } };
      };
      assert.equal((await f.execute(action, input)).status, 'needs_confirmation');
      const answer = await f.execute(action, input, { confirm: true });
      assert.deepEqual(answer, { status: 'vendor_error', http_status, endpoint: f.calls.at(-1).endpoint, method: 'POST' });
      assert.equal(f.calls.length - before, 1);
      assert.equal(JSON.stringify(answer).includes('invented-private'), false);
    }
  });
}
