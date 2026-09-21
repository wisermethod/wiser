import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTestGateway, makeHome, putActive } from './fake-provider.js';

/**
 * The disclosure policy proved through `execute` rather than through the renderer.
 *
 * `test/disclosure.test.js` proves the renderer, which is a pure function. These
 * prove the three things it cannot: that the policy is reached on every entry path
 * the confirmation block serves, that the guarantee holds over the COMPLETE status
 * object rather than the renderer's return, and that nothing it renders reaches the
 * audit file. The contract is in `gateway/AGENTS.md`.
 */

/** Any code point the policy calls unsafe, for asserting none survives. */
const RAW_UNSAFE = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}]/u;

/**
 * Every string in the object, key and value, at every depth.
 *
 * Asserting over `JSON.stringify(...)` does not work for this: serialization escapes
 * C0 and lone surrogates itself, so a raw ESC sitting in `input_values[].value` would
 * appear in the JSON text as `\u001b` and the assertion would pass while the defect
 * was real. Adversarial review found that; the canary assertions below still use the
 * serialized form, correctly, because a canary is ordinary text that survives it.
 */
function everyString(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) everyString(v, out);
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) { out.push(k); everyString(v, out); }
  }
  return out;
}

/**
 * Record every proxy call the gateway makes through the fake provider.
 * `status === undefined` proves only that the gateway did not stop; a regression
 * returning `{}` before calling the connector would pass that. Adversarial review
 * found it, so execution is asserted at the provider instead.
 */
function recordProxyCalls(fake) {
  const calls = [];
  const original = fake.auth.proxy.bind(fake.auth);
  fake.auth.proxy = async (args) => { calls.push(args); return original(args); };
  return calls;
}

/** The first raw unsafe code point anywhere in the object, or null. */
function rawUnsafeAnywhere(object) {
  for (const s of everyString(object)) {
    const m = s.match(RAW_UNSAFE);
    if (m) return `U+${m[0].codePointAt(0).toString(16)} in ${JSON.stringify(s.slice(0, 60))}`;
  }
  return null;
}

/**
 * A one-action connector, so an entry path with no shipped example can be reached.
 *
 * @param {object} action the action definition to write
 */
async function gatewayWithAction(action) {
  const root = makeHome();
  const dir = join(root, 'probe');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({
    id: 'probe',
    service: 'probe',
    modules: {
      thing: {
        auth: { provider: 'catalog', toolkit: 'FAKE_KIT', scheme: 'OAUTH2', privilege: 'write' },
        unwrap_token: false,
        fallback: 'none',
        actions: { act: action },
      },
    },
  }));
  writeFileSync(join(dir, 'index.js'),
    'export const modules = { thing: { act: async () => ({ ok: true }) } };\n');
  const made = await createTestGateway({ connectorDirs: [root] });
  await putActive(made.store, made.fake, { service: 'probe', module: 'thing', privilege: 'write' });
  return made;
}

// ------------------------------------------- the three confirmation entry paths

test('entry path one, confirmation always: the stop names its target', async () => {
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'google-cloud', module: 'services', privilege: 'write' });
  const r = await gw.execute({
    action: 'google-cloud.services.enable',
    input: { project: 'wiser-method-prod', service: 'translate.googleapis.com' },
  });
  assert.equal(r.status, 'needs_confirmation');
  assert.equal(r.confirmation, 'always');
  assert.equal(
    r.summary,
    'google-cloud.services.enable on google-cloud/services with project="wiser-method-prod", '
    + 'service="translate.googleapis.com"; risk high; Enable the named service on the named Google Cloud project',
  );
});

test('entry path two, confirmation once: the first call stops with values, the confirmed call runs', async () => {
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'cloudflare', module: 'dns', privilege: 'write' });
  const calls = recordProxyCalls(fake);
  const input = { zone_id: 'zone-abc', type: 'A', name: 'www.example.com', content: '203.0.113.7' };
  const first = await gw.execute({ action: 'cloudflare.dns.create_record', input });
  assert.equal(first.status, 'needs_confirmation');
  assert.equal(first.confirmation, 'once');
  assert.match(first.summary, /zone_id="zone-abc", type="A", name="www\.example\.com", content="203\.0\.113\.7"/);
  assert.deepEqual(first.input_values.map((f) => f.name), ['zone_id', 'type', 'name', 'content']);

  // `notEqual(status, 'needs_confirmation')` alone would pass on an error, and would
  // not notice `confirmedOnce.add` being deleted. Adversarial review found both.
  assert.equal(calls.length, 0, 'a stop must not reach the vendor');

  const confirmed = await gw.execute({ action: 'cloudflare.dns.create_record', input, confirm: true });
  assert.equal(confirmed.status, undefined, `the confirmed call did not run: ${JSON.stringify(confirmed)}`);
  assert.equal(calls.length, 1, 'the confirmed call did not reach the vendor');
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].endpoint, '/zones/zone-abc/dns_records');
  assert.deepEqual(calls[0].body, { type: 'A', name: 'www.example.com', content: '203.0.113.7' });

  // `once` means once: a later call without `confirm` must run rather than stop again.
  const again = await gw.execute({ action: 'cloudflare.dns.create_record', input });
  assert.equal(again.status, undefined, `the confirmation was not remembered: ${JSON.stringify(again)}`);
  assert.equal(calls.length, 2, 'the remembered call did not reach the vendor');

  // And a DIFFERENT once-action is not covered by that memory. Deliberately another
  // action in the SAME module and on the same grant, because `onceKey` is the action
  // id: a second module would stop at `needs_connect` and prove nothing about this.
  const other = await gw.execute({
    action: 'cloudflare.dns.update_record',
    input: { zone_id: 'zone-abc', record_id: 'rec-1' },
  });
  assert.equal(other.status, 'needs_confirmation', 'one confirmation covered a different action');
});

test('entry path three, policy-driven: a destructive action that declares no confirmation still stops, and shows values', async () => {
  // No shipped action reaches this path alone: all six destructive ones also declare
  // `confirmation: always`, so both triggers fire together and neither is isolated.
  // policy.default.json's `{ role: runtime, risk: destructive, effect: confirm }` is
  // what fires here, and the action's own metadata says `none`.
  const { gw } = await gatewayWithAction({
    description: 'A destructive action declaring no confirmation of its own',
    risk: 'destructive',
    confirmation: 'none',
    execution: { prefer: 'proxy' },
    input: { type: 'object', properties: { target: { type: 'string' } }, required: ['target'] },
  });
  const r = await gw.execute({ action: 'probe.thing.act', input: { target: 'the-thing-to-destroy' } });
  assert.equal(r.status, 'needs_confirmation');
  // The metadata field and the behaviour disagree, and that is the point: a person
  // reading `confirmation` alone would conclude no stop happens here.
  assert.equal(r.confirmation, 'none');
  assert.equal(r.risk, 'destructive');
  assert.match(r.summary, /target="the-thing-to-destroy"/);
});

test('an action on both paths at once renders the same way', async () => {
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'cloudflare', module: 'dns', privilege: 'write' });
  const r = await gw.execute({
    action: 'cloudflare.dns.delete_record',
    input: { zone_id: 'zone-abc', record_id: 'rec-xyz' },
  });
  assert.equal(r.status, 'needs_confirmation');
  assert.equal(r.confirmation, 'always');
  assert.equal(r.risk, 'destructive');
  assert.match(r.summary, /zone_id="zone-abc", record_id="rec-xyz"/);
});

// ------------------------------- the guarantee, over the COMPLETE status object

test('an undeclared key is refused before the stop, and its value reaches neither the caller nor the audit file', async () => {
  // **This test changed shape on 2026-09-20 and the reason is the point.** An undeclared
  // key used to reach the confirmation stop, be counted, and then run. The gateway now
  // validates a call against its published schema before the grant, the provider and the
  // stop, so the key is refused and no person is asked to approve a call that cannot run.
  //
  // What survives, and is what the guarantee was always for: the VALUE never reaches the
  // caller. The key's NAME does, as `field`, which is the refusal shape every connector
  // suite has asserted since the eleven copies of the validator shipped; a name a caller
  // chose is a name a caller already has. Neither reaches `audit.jsonl`, whose field set
  // is closed and carries no `field`, and that is asserted here rather than assumed.
  const CANARY = 'zzq-canary-4f1c9e2b-complete-status';
  const KEY = 'x_undeclared_probe_key';
  const { gw, store, fake, audit } = await createTestGateway();
  await putActive(store, fake, { service: 'google-cloud', module: 'services', privilege: 'write' });
  const r = await gw.execute({
    action: 'google-cloud.services.enable',
    input: { project: 'wiser-method-prod', service: 'translate.googleapis.com', [KEY]: CANARY },
  });
  assert.deepEqual(r, { status: 'invalid_arguments', field: KEY });
  assert.equal(JSON.stringify(r).includes(CANARY), false, 'the canary value reached the caller');

  const raw = readFileSync(audit.file, 'utf8').trim();
  assert.ok(raw.length > 0, 'the refusal must have been audited at all');
  assert.equal(raw.includes(CANARY), false, 'the canary value reached audit.jsonl');
  assert.equal(raw.includes(KEY), false, 'the undeclared key name reached audit.jsonl');
});

test('the renderer still withholds an undeclared key, which the refusal makes unreachable through execute', async () => {
  // Defence in depth, asserted so it is not mistaken for dead code and deleted. Nothing
  // undeclared can now reach `discloseInput` through `execute`, but `discloseInput` is
  // what decides what a person is told and it must stay safe on its own terms.
  const { discloseInput } = await import('../src/disclosure.js');
  const act = {
    input: { type: 'object', properties: { project: { type: 'string' } }, additionalProperties: false },
  };
  const d = discloseInput(act, { project: 'wiser-method-prod', x_undeclared: 'zzq-renderer-canary' });
  assert.equal(d.undeclared, 1);
  assert.equal(JSON.stringify(d).includes('zzq-renderer-canary'), false);
  assert.equal(JSON.stringify(d).includes('x_undeclared'), false);
});

test('a nested field is named and its content never appears, through the whole stack', async () => {
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'google-cloud', module: 'keys', privilege: 'write' });
  const r = await gw.execute({
    action: 'google-cloud.keys.patch',
    input: {
      project: 'wiser-method-prod',
      key_id: 'key-abc-123',
      restrictions: { apiTargets: [{ service: 'translate.googleapis.com' }] },
    },
  });
  assert.equal(r.status, 'needs_confirmation');
  assert.deepEqual(r.withheld_fields, [{ name: 'restrictions', reason: 'nested' }]);
  assert.match(r.summary, /the content of restrictions is not shown, so this approves the target and not the change/);
  const complete = JSON.stringify(r);
  assert.equal(complete.includes('apiTargets'), false);
});

test('a control character in a pattern-valid value is escaped before it reaches the caller', async () => {
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'google-cloud', module: 'services', privilege: 'write' });
  const r = await gw.execute({
    action: 'google-cloud.services.enable',
    input: { project: 'wiser-method-prod', service: 'trans\u001b[31mlate⁠.googleapis.com' },
  });
  assert.equal(r.status, 'needs_confirmation');
  assert.equal(rawUnsafeAnywhere(r), null, 'a raw unsafe code point reached the caller');
  assert.match(r.summary, /\\x1b/);
  assert.match(r.summary, /\\u2060/);
  // And the structured field carries the escaped form, asserted positively rather
  // than as an absence: lacking a raw ESC is also true of a field that lost its value.
  const rendered = r.input_values.find((f) => f.name === 'service').value;
  assert.match(rendered, /\\x1b/);
  assert.match(rendered, /\\u2060/);
});

test('a declared field failing its own pattern is refused before the stop, and its value never reaches the caller', async () => {
  // The renderer withheld such a value and named it, on the stated ground that showing a
  // person a value the call will then reject wastes their approval. The gateway now
  // carries that reasoning one step further and rejects it before the stop happens, so
  // the approval is never asked for. `withheld_fields` keeps `nested`, which no schema
  // check can decide; `pattern` can no longer arise through execute.
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'google-cloud', module: 'services', privilege: 'write' });
  const r = await gw.execute({
    action: 'google-cloud.services.enable',
    input: { project: 'Not A Valid Project', service: 'translate.googleapis.com' },
  });
  assert.deepEqual(r, { status: 'invalid_arguments', field: 'project' });
  assert.equal(JSON.stringify(r).includes('Not A Valid Project'), false);
});

// --------------------------------------------------- the audit line stays closed

test('a value rendered into a summary does not reach the audit file', async () => {
  // audit.js declares AUDIT_FIELDS as a closed set. Values now reach a summary,
  // so the closure is asserted rather than assumed. The two version facts are
  // members of that set; a rendered input value is not.
  const MARKER = 'audit-marker-9c3f1e';
  const { gw, store, fake, audit } = await createTestGateway();
  await putActive(store, fake, { service: 'google-cloud', module: 'services', privilege: 'write' });
  const r = await gw.execute({
    action: 'google-cloud.services.enable',
    input: { project: 'wiser-method-prod', service: `${MARKER}.googleapis.com` },
  });
  assert.equal(r.status, 'needs_confirmation');
  assert.ok(r.summary.includes(MARKER), 'the marker must be in the summary or this proves nothing');

  const raw = readFileSync(audit.file, 'utf8').trim();
  assert.ok(raw.length > 0, 'the stop must have been audited at all');
  assert.equal(raw.includes(MARKER), false, 'a rendered value reached audit.jsonl');
  for (const text of raw.split('\n')) {
    const line = JSON.parse(text);
    for (const forbidden of ['input', 'input_values', 'summary', 'output', 'headers']) {
      assert.equal(forbidden in line, false, `audit line carries ${forbidden}`);
    }
  }
});

// ------------------------------------------------------ the structured additions

test('input_fields and undeclared_fields keep their meaning, and values arrive beside them', async () => {
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'google-cloud', module: 'keys', privilege: 'write' });
  const r = await gw.execute({
    action: 'google-cloud.keys.patch',
    input: { project: 'p-abcdef', key_id: 'k1', restrictions: {} },
  });
  // Unchanged: every declared key supplied, nested included, and a count of the rest.
  // The count is now structurally 0 at any stop, because an undeclared key is refused
  // before the stop is reached. The field keeps its meaning and keeps being asserted.
  assert.deepEqual(r.input_fields, ['project', 'key_id', 'restrictions']);
  assert.equal(r.undeclared_fields, 0);
  // Added: only what the policy renders, and why the rest was not.
  assert.deepEqual(r.input_values.map((f) => f.name), ['project', 'key_id']);
  assert.deepEqual(r.withheld_fields, [{ name: 'restrictions', reason: 'nested' }]);
});

// ----------------------------------------------- the test helpers, tested themselves

test('the unsafe walker finds what it is meant to, not only what it is given', () => {
  // These helpers are new logic inside a test file, asserting on shipped code. Every
  // other use of them expects null, so without these they could return null always.
  assert.equal(rawUnsafeAnywhere({ a: 'plain' }), null);
  assert.equal(rawUnsafeAnywhere({ a: null, b: 7, c: [1, 'two'], d: { e: true } }), null);
  assert.ok(rawUnsafeAnywhere({ a: 'x\u001by' }), 'missed a control in a value');
  assert.ok(rawUnsafeAnywhere({ a: ['ok', { b: 'x\u2060y' }] }), 'missed one nested in an array');
  assert.ok(rawUnsafeAnywhere({ 'key\u001bname': 'ok' }), 'missed one in a KEY');
  assert.ok(rawUnsafeAnywhere({ a: 'x\ud800y' }), 'missed a lone surrogate');
  assert.ok(rawUnsafeAnywhere({ a: 'x\u2028y' }), 'missed a line separator');
  assert.deepEqual(everyString({ a: 'one', b: ['two'], c: { d: 'three' } }).sort(),
    ['a', 'b', 'c', 'd', 'one', 'three', 'two']);
});

test('keys.create omitting the optional key_id: the stop shows what was supplied and nothing else', async () => {
  // The connector document promises only what the caller supplied and what passed its
  // own declaration. Adversarial review found the first correction overstating it.
  const { gw, store, fake } = await createTestGateway();
  await putActive(store, fake, { service: 'google-cloud', module: 'keys', privilege: 'write' });
  const r = await gw.execute({
    action: 'google-cloud.keys.create',
    input: {
      project: 'wiser-method-prod',
      display_name: 'Translate key',
      restrictions: { apiTargets: [{ service: 'translate.googleapis.com' }] },
    },
  });
  assert.equal(r.status, 'needs_confirmation');
  // key_id was not supplied, so it is absent entirely: not shown, and not named.
  assert.deepEqual(r.input_values.map((f) => f.name), ['project', 'display_name']);
  assert.deepEqual(r.input_fields, ['project', 'display_name', 'restrictions']);
  assert.deepEqual(r.withheld_fields, [{ name: 'restrictions', reason: 'nested' }]);
  assert.doesNotMatch(r.summary, /key_id/);
  assert.match(r.summary, /display_name="Translate key"/);
});
