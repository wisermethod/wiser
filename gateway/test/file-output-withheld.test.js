// Declared file outputs, held to the six conditions of the decision that admitted
// them: written only in outputs/, never at a caller's path, never returned as bytes,
// never armed on a hosted host. Written apart from the implementation, against its
// specification, so the implementation's own tests are not the only check.
// Invented data only.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import {
  existsSync, linkSync, lstatSync, lutimesSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync,
  symlinkSync, utimesSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { createAudit } from '../src/audit.js';
import { ConnectionGateway } from '../src/gateway.js';
import { loadConnectors } from '../src/manifest.js';
import { loadPolicy } from '../src/policy.js';
import { JsonFileStore } from '../src/store.js';

const DEFAULT_POLICY = fileURLToPath(new URL('../policy.default.json', import.meta.url));
const UUID_MP3 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.mp3$/;
const DAY = 24 * 60 * 60 * 1000;

const AUDIO = randomBytes(4096);
const AUDIO_B64 = AUDIO.toString('base64');

function fixtureConnectors() {
  const root = mkdtempSync(join(tmpdir(), 'withheld-connectors-'));
  const dir = join(root, 'speak');
  mkdirSync(dir);
  const out = (cap = 1048576) => ({ media_types: ['audio/mpeg'], max_bytes: cap });
  const action = (extra = {}) => ({
    description: 'invented', risk: 'low', confirmation: 'none', execution: { prefer: 'proxy' },
    input: { type: 'object', properties: {}, additionalProperties: false }, ...extra,
  });
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({
    id: 'speak',
    service: 'speak',
    modules: {
      voice: {
        auth: { provider: 'catalog', toolkit: 'FAKE_SPEAK', scheme: 'API_KEY', privilege: 'write' },
        actions: {
          say: action({ output_file: out() }),
          bad_type: action({ output_file: out() }),
          over_cap: action({ output_file: out(1024) }),
          not_bytes: action({ output_file: out() }),
          empty: action({ output_file: out() }),
          status_obj: action({ output_file: out() }),
          status_with_slot: action({ output_file: out(1024) }),
          throws_with_slot: action({ output_file: out() }),
        },
        unwrap_token: false,
        fallback: 'none',
      },
    },
  }));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'speak-fixture', private: true, type: 'module' }));
  const errorsUrl = new URL('../src/errors.js', import.meta.url).href;
  writeFileSync(join(dir, 'index.js'), `
import { StatusSignal } from '${errorsUrl}';
async function envelope(ctx) {
  const res = await ctx.proxy({ endpoint: '/v1/tts', method: 'POST', body: { text: 'invented' } });
  return res.data;
}
export const modules = {
  voice: {
    async say(_input, ctx) {
      const env = await envelope(ctx);
      return { duration: env.duration, output_file: { media_type: 'audio/mpeg', data: Buffer.from(env.audio, 'base64') } };
    },
    async bad_type(_input, ctx) {
      const env = await envelope(ctx);
      return { output_file: { media_type: 'audio/wav', data: Buffer.from(env.audio, 'base64') } };
    },
    async over_cap(_input, ctx) {
      const env = await envelope(ctx);
      return { output_file: { media_type: 'audio/mpeg', data: Buffer.from(env.audio, 'base64') } };
    },
    async not_bytes(_input, ctx) {
      const env = await envelope(ctx);
      return { output_file: { media_type: 'audio/mpeg', data: env.audio } };
    },
    async empty(_input, ctx) {
      await envelope(ctx);
      return { output_file: { media_type: 'audio/mpeg', data: Buffer.alloc(0) } };
    },
    async status_obj(_input, ctx) {
      await envelope(ctx);
      return { status: 'vendor_error', endpoint: '/v1/tts', method: 'POST', http_status: 500 };
    },
    async status_with_slot(_input, ctx) {
      const env = await envelope(ctx);
      return { status: 'vendor_error', endpoint: '/v1/tts', method: 'POST', reason: 'unexpected answer',
        output_file: { media_type: 'audio/mpeg', data: Buffer.from(env.audio, 'base64') } };
    },
    async throws_with_slot(_input, ctx) {
      const env = await envelope(ctx);
      throw new StatusSignal({ status: 'vendor_error', endpoint: '/v1/tts', method: 'POST',
        output_file: { media_type: 'audio/mpeg', data: Buffer.from(env.audio, 'base64') } });
    },
  },
};
`);
  return root;
}

function fakeProvider() {
  const calls = { proxy: 0, listAccounts: 0, status: 0, execute: 0 };
  const auth = {
    isConfigured: () => true,
    async proxy() { calls.proxy += 1; return { status: 200, data: { audio: AUDIO_B64, content_type: 'audio/mpeg', duration: 1.5 } }; },
    async status() { calls.status += 1; return 'ACTIVE'; },
    async listAccounts() { calls.listAccounts += 1; return []; },
    async initiate() { return { status: 'link', url: 'https://example.invalid/link' }; },
    async unwrap() { return { supported: false }; },
  };
  const catalog = { async execute() { calls.execute += 1; return { data: {} }; } };
  return { auth, catalog, calls };
}

async function build({ outputs = true, home = mkdtempSync(join(tmpdir(), 'withheld-home-')) } = {}) {
  const connectors = await loadConnectors([fixtureConnectors()]);
  const fake = fakeProvider();
  const store = new JsonFileStore(home);
  store.putConnection({
    id: 'conn-speak-voice', service: 'speak', module: 'voice', privilege: 'write', provider: 'catalog',
    provider_account_id: 'fake-acct-speak', scopes: [], status: 'ACTIVE',
    created: new Date().toISOString(), updated: new Date().toISOString(),
  });
  const opts = {
    home,
    role: 'runtime',
    harness: 'withheld',
    store,
    policy: loadPolicy({ home, defaultPath: DEFAULT_POLICY }),
    audit: createAudit(home),
    authProvider: fake.auth,
    catalogProvider: fake.catalog,
    localFileProvider: null,
    authConfigured: true,
    connectors,
    envPath: null,
    classifier: null,
  };
  if (outputs) opts.outputsDir = join(home, 'outputs');
  const gw = new ConnectionGateway(opts);
  return { gw, home, fake, outputsDir: join(home, 'outputs') };
}

function treeFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      const st = lstatSync(p);
      if (st.isDirectory()) walk(p);
      else out.push(relative(dir, p));
    }
  };
  if (existsSync(dir)) walk(dir);
  return out.sort();
}

function auditText(home) {
  const p = join(home, 'audit.jsonl');
  return existsSync(p) ? readFileSync(p, 'utf8') : '';
}

function noBytesIn(text) {
  assert.equal(text.includes(AUDIO_B64), false, 'base64 of the audio leaked');
  assert.equal(text.includes(AUDIO_B64.slice(0, 64)), false, 'a stretch of the base64 leaked');
  assert.equal(text.includes(AUDIO.toString('hex').slice(0, 64)), false, 'hex of the audio leaked');
  assert.equal(text.includes('"type":"Buffer"'), false, 'a serialised Buffer leaked');
  assert.equal(text.includes(JSON.stringify(Array.from(AUDIO.subarray(0, 16))).slice(1, -1)), false, 'the byte values leaked');
  assert.equal(text.includes('output_file'), false, 'the slot leaked');
}

test('T7 and T5: the file equals an independent decode of the envelope; nothing of the bytes in the result or audit', async () => {
  const { gw, home, outputsDir } = await build();
  const result = await gw.execute({ action: 'speak.voice.say', input: {} });
  assert.ok(result.file, `expected a file, got ${JSON.stringify(result).slice(0, 300)}`);
  const independent = Buffer.from(AUDIO_B64, 'base64');
  const written = readFileSync(result.file.path);
  assert.ok(written.equals(independent), 'written file differs from the independent decode');
  assert.equal(result.file.sha256, createHash('sha256').update(written).digest('hex'));
  assert.equal(result.file.bytes, written.length);
  assert.equal(result.file.media_type, 'audio/mpeg');
  assert.equal(relative(outputsDir, result.file.path).includes('/'), false);
  const name = relative(outputsDir, result.file.path);
  assert.match(name, UUID_MP3);
  const line = auditText(home).trim().split('\n').map((l) => JSON.parse(l)).at(-1);
  assert.equal(name, `${line.cid}.mp3`, 'the file is not named by the audit line cid');
  assert.equal(result.duration, 1.5);
  noBytesIn(JSON.stringify(result));
  noBytesIn(auditText(home));
  assert.equal(statSync(outputsDir).mode & 0o777, 0o700);
  assert.equal(statSync(result.file.path).mode & 0o777, 0o600);
});

for (const [action, detail] of [['bad_type', 'undeclared_type'], ['over_cap', 'over_cap'], ['not_bytes', 'not_bytes'], ['empty', 'empty']]) {
  test(`T1: ${action} is neither written nor returned`, async () => {
    const { gw, home, outputsDir } = await build();
    const result = await gw.execute({ action: `speak.voice.${action}`, input: {} });
    assert.equal(result.status, 'vendor_error');
    assert.equal(result.reason, 'output_refused');
    assert.equal(result.detail, detail);
    assert.deepEqual(treeFiles(outputsDir).filter((f) => !f.startsWith('.')), []);
    noBytesIn(JSON.stringify(result));
    noBytesIn(auditText(home));
  });
}

test('T1: a status object from the module writes nothing', async () => {
  const { gw, outputsDir } = await build();
  const result = await gw.execute({ action: 'speak.voice.status_obj', input: {} });
  assert.equal(result.status, 'vendor_error');
  assert.deepEqual(treeFiles(outputsDir), []);
});

for (const action of ['status_with_slot', 'throws_with_slot']) {
  test(`T5: a status from ${action} reaches the answer without its slot or bytes, and nothing is written`, async () => {
    const { gw, home, outputsDir } = await build();
    const result = await gw.execute({ action: `speak.voice.${action}`, input: {} });
    assert.equal(result.status, 'vendor_error');
    noBytesIn(JSON.stringify(result));
    noBytesIn(auditText(home));
    assert.deepEqual(treeFiles(outputsDir), []);
  });
}

test('T2: no write outside outputs/ for any action', async () => {
  const { gw, home } = await build();
  const before = new Set(treeFiles(home));
  for (const action of ['say', 'bad_type', 'over_cap', 'not_bytes', 'empty', 'status_obj', 'status_with_slot', 'throws_with_slot']) {
    await gw.execute({ action: `speak.voice.${action}`, input: {} });
  }
  const added = treeFiles(home).filter((f) => !before.has(f));
  const outside = added.filter((f) => !f.startsWith('outputs/') && f !== 'audit.jsonl' && f !== 'connections.json');
  assert.deepEqual(outside, []);
});

test('T3: outputs/ that is a symbolic link is refused and its target untouched', async () => {
  const home = mkdtempSync(join(tmpdir(), 'withheld-home-'));
  const elsewhere = mkdtempSync(join(tmpdir(), 'withheld-elsewhere-'));
  symlinkSync(elsewhere, join(home, 'outputs'));
  const { gw } = await build({ home });
  const result = await gw.execute({ action: 'speak.voice.say', input: {} });
  assert.equal(result.status, 'vendor_error');
  assert.equal(result.reason, 'output_refused');
  assert.deepEqual(readdirSync(elsewhere), []);
  noBytesIn(JSON.stringify(result));
});

for (const [label, plant] of [
  ['a symbolic link', (dir, outside) => symlinkSync(join(outside, 'target.bin'), join(dir, 'planted'))],
  ['a hard-linked file', (dir, outside) => linkSync(join(outside, 'target.bin'), join(dir, 'planted'))],
  ['a directory', (dir) => mkdirSync(join(dir, 'planted'))],
]) {
  test(`T3: ${label} inside outputs/ refuses the write and is named`, async () => {
    const home = mkdtempSync(join(tmpdir(), 'withheld-home-'));
    const outside = mkdtempSync(join(tmpdir(), 'withheld-outside-'));
    writeFileSync(join(outside, 'target.bin'), 'invented target');
    const dir = join(home, 'outputs');
    mkdirSync(dir, { mode: 0o700 });
    plant(dir, outside);
    const { gw } = await build({ home });
    const result = await gw.execute({ action: 'speak.voice.say', input: {} });
    assert.equal(result.status, 'vendor_error');
    assert.equal(result.reason, 'output_refused');
    assert.equal(result.detail, 'outputs_not_clean');
    assert.equal(result.entry, 'planted');
    assert.deepEqual(readdirSync(dir), ['planted']);
    assert.equal(readFileSync(join(outside, 'target.bin'), 'utf8'), 'invented target');
  });
}

test('T4: cleanup removes only old, matching, singly linked regular files in outputs/', async () => {
  const home = mkdtempSync(join(tmpdir(), 'withheld-home-'));
  const outside = mkdtempSync(join(tmpdir(), 'withheld-outside-'));
  const dir = join(home, 'outputs');
  mkdirSync(dir, { mode: 0o700 });
  const old = new Date(Date.now() - 8 * DAY);
  const id = () => '11111111-2222-4333-8444-' + randomBytes(6).toString('hex');
  const oldMatch = `${id()}.mp3`;
  const oldPartial = `${id()}.mp3.partial`;
  const newMatch = `${id()}.mp3`;
  const oldOtherName = 'notes.mp3';
  const oldOtherExt = `${id()}.wav`;
  for (const n of [oldMatch, oldPartial, newMatch, oldOtherName, oldOtherExt]) writeFileSync(join(dir, n), 'x');
  for (const n of [oldMatch, oldPartial, oldOtherName, oldOtherExt]) utimesSync(join(dir, n), old, old);
  for (const n of ['connections.json.keep', 'audit-old.jsonl']) { writeFileSync(join(home, n), 'keep'); utimesSync(join(home, n), old, old); }
  mkdirSync(join(home, 'classifier-sessions'));
  writeFileSync(join(home, 'classifier-sessions', `${id()}.mp3`), 'keep');
  utimesSync(join(home, 'classifier-sessions'), old, old);
  const { gw } = await build({ home });
  // The cleanup runs before a write; the planted entries below would refuse that write,
  // so the links and hard links are tested in a separate home.
  const result = await gw.execute({ action: 'speak.voice.say', input: {} });
  const left = readdirSync(dir);
  assert.equal(left.includes(oldMatch), false, 'an old matching file was kept');
  assert.equal(left.includes(oldPartial), false, 'an old matching .partial was kept');
  for (const n of [newMatch, oldOtherName, oldOtherExt]) assert.ok(left.includes(n), `${n} was removed`);
  assert.ok(existsSync(join(home, 'connections.json.keep')));
  assert.ok(existsSync(join(home, 'audit-old.jsonl')));
  assert.equal(readdirSync(join(home, 'classifier-sessions')).length, 1);
  assert.ok(result.file || result.status, 'the call answered');

  // Links: an old matching symbolic link and an old hard-linked matching file stay,
  // and the link's target is untouched. The write refuses while they are there.
  const home2 = mkdtempSync(join(tmpdir(), 'withheld-home-'));
  const dir2 = join(home2, 'outputs');
  mkdirSync(dir2, { mode: 0o700 });
  writeFileSync(join(outside, 'target.mp3'), 'target');
  const linkName = `${id()}.mp3`;
  const hardName = `${id()}.mp3`;
  symlinkSync(join(outside, 'target.mp3'), join(dir2, linkName));
  lutimesSync(join(dir2, linkName), old, old);
  writeFileSync(join(outside, 'hard.mp3'), 'hard');
  linkSync(join(outside, 'hard.mp3'), join(dir2, hardName));
  utimesSync(join(outside, 'hard.mp3'), old, old);
  const { gw: gw2 } = await build({ home: home2 });
  await gw2.execute({ action: 'speak.voice.say', input: {} });
  const left2 = readdirSync(dir2);
  assert.ok(left2.includes(linkName), 'an old matching symbolic link was removed');
  assert.ok(left2.includes(hardName), 'an old hard-linked matching file was removed');
  assert.equal(readFileSync(join(outside, 'target.mp3'), 'utf8'), 'target');
  assert.equal(readFileSync(join(outside, 'hard.mp3'), 'utf8'), 'hard');
});

test('T6a: built as the hosted service builds it, the action is local_only and nothing is called', async () => {
  const { gw, fake, home } = await build({ outputs: false });
  const result = await gw.execute({ action: 'speak.voice.say', input: {} });
  assert.equal(result.status, 'local_only');
  assert.equal(typeof result.reason, 'string');
  assert.equal(/read/i.test(result.reason), false, 'the reason says the action reads files');
  assert.deepEqual(fake.calls, { proxy: 0, listAccounts: 0, status: 0, execute: 0 });
  assert.equal(existsSync(join(home, 'outputs')), false);
  const line = auditText(home).trim().split('\n').map((l) => JSON.parse(l)).at(-1);
  assert.equal(line.status, 'local_only');
});

test('T6a: a gateway with a home and no outputsDir never derives one from home', async () => {
  const home = mkdtempSync(join(tmpdir(), 'withheld-home-'));
  mkdirSync(join(home, 'outputs'), { mode: 0o700 });
  const { gw, fake } = await build({ outputs: false, home });
  const result = await gw.execute({ action: 'speak.voice.say', input: {} });
  assert.equal(result.status, 'local_only');
  assert.equal(fake.calls.proxy, 0);
  assert.deepEqual(readdirSync(join(home, 'outputs')), []);
});

test('T11: two calls never overwrite each other', async () => {
  const { gw } = await build();
  const a = await gw.execute({ action: 'speak.voice.say', input: {} });
  const b = await gw.execute({ action: 'speak.voice.say', input: {} });
  assert.notEqual(a.file.path, b.file.path);
  assert.ok(existsSync(a.file.path) && existsSync(b.file.path));
});
