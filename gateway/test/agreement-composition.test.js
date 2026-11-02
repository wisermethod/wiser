import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modules as google } from '../../connectors/google/index.js';
import { modules as googleApis } from '../../connectors/google-apis/index.js';
import { validateInput } from '../src/input-schema.js';
import { call, checkComposition, makeCtx, schemaViolation } from './agreement-harness.js';

const manifest = (service) => JSON.parse(readFileSync(new URL(`../../connectors/${service}/manifest.json`, import.meta.url), 'utf8'));
const GOOGLE = manifest('google');
const GOOGLE_APIS = manifest('google-apis');
const BASE = { to: ['casey@example.test'], subject: 'Project Cedar', body: 'Invented body' };
const REPLY = { thread_id: 'thread-example_1', in_reply_to: '<parent.1@example.test>', references: ['<ancestor.1@example.test>', '<parent.1@example.test>'] };
const FIELDS = ['thread_id', 'in_reply_to', 'references'];

// Use the shipped validator and the real action. Only transport is a sentinel;
// the expected branch validity below is enumerated independently of the sampler.
function run(impl, service, module, action, declaration, input) {
  return call((value, ctx) => {
    const field = validateInput(declaration.input, value);
    return field === null ? impl[module][action](value, ctx) : { status: 'invalid_arguments', field };
  }, input, service, module, action, declaration);
}

for (const action of ['create_draft', 'send_message']) {
  const ad = GOOGLE.modules.gmail.actions[action];
  const invoke = (input) => run(google, 'google', 'gmail', action, ad, input);
  for (let mask = 0; mask < 8; mask += 1) {
    const fields = FIELDS.filter((_, index) => mask & (1 << index));
    const valid = mask === 0 || mask === 7;
    test(`F19 gmail.${action} reply ${fields.join('+') || 'none'} is ${valid ? 'valid' : 'invalid'}`, async () => {
      const input = { ...BASE, ...Object.fromEntries(fields.map((field) => [field, REPLY[field]])) };
      assert.equal(schemaViolation(ad.input, input), valid ? null : 'oneOf:0');
      // Composition is the module's responsibility, not validateInput's.
      assert.equal(validateInput(ad.input, input), null);
      assert.equal((await invoke(input)).kind, valid ? 'reached' : 'refused');
    });
  }

  test(`F19 agreement judges all eight gmail.${action} probes with no divergences`, async () => {
    const result = await checkComposition(ad.input, BASE, invoke);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.divergences, []);
    assert.equal(result.probes.length, 8);
    const expectedSubsets = new Set([
      'thread_id', 'in_reply_to', 'references',
      'thread_id,in_reply_to', 'thread_id,references', 'in_reply_to,references',
    ]);
    for (const probe of result.probes) {
      const fields = FIELDS.filter((field) => Object.hasOwn(probe.input, field));
      const valid = fields.length === 0 || fields.length === 3;
      assert.equal(probe.violation, valid ? null : 'oneOf:0');
      assert.equal(probe.result.kind, valid ? 'reached' : 'refused');
      if (!valid) assert.equal(expectedSubsets.delete(fields.join(',')), true, 'each partial subset is a separate probe');
    }
    assert.equal(expectedSubsets.size, 0);
  });

  // Recorded Gmail Message-Id shapes: both contain '='; the second adds '+' and '-'.
  // Invented ids in the shape Gmail's measured ids take: '=', '+' and '-' in the local part.
  for (const [index, id] of [
    '<CAQ7invEntedShapeOne9x=Qq2mZ8@mail.gmail.com>',
    '<CAQ7invEnted-Y-0shape+TwoQ=wk3@mail.gmail.com>',
  ].entries()) {
    test(`gmail.${action} accepts recorded Message-Id shape ${index + 1} in both reply headers`, async () => {
      assert.match(id, new RegExp(ad.input.properties.in_reply_to.pattern));
      assert.match(id, new RegExp(ad.input.properties.references.items.pattern));
      const input = { ...BASE, ...REPLY, in_reply_to: id, references: [REPLY.references[0], id] };
      assert.equal(schemaViolation(ad.input, input), null);
      assert.equal((await invoke(input)).kind, 'reached');
    });
  }

  test(`gmail.${action} agreement context has a real no-files capability with execution lifetime`, async () => {
    const probe = makeCtx('google', 'gmail', action, BASE, ad);
    try {
      assert.deepEqual(probe.ctx.inputFiles('attachments'), []);
      assert.throws(() => probe.ctx.inputFiles('other'), (err) => err.object?.status === 'invalid_arguments');
      assert.equal(probe.reached(), false);
      assert.equal((await invoke(BASE)).kind, 'reached');
    } finally { probe.release(); }
    assert.throws(() => probe.ctx.inputFiles('attachments'), (err) => err.object?.status === 'invalid_arguments');
    const unprepared = makeCtx('google', 'gmail', action, { ...BASE, attachments: ['/invented.pdf'] }, ad);
    try {
      assert.throws(() => unprepared.ctx.inputFiles('attachments'), (err) => err.object?.status === 'invalid_arguments');
      assert.equal(unprepared.reached(), false);
    } finally { unprepared.release(); }
  });
}

for (const [impl, service, manifest, module, action, base] of [
  [google, 'google', GOOGLE, 'drive', 'upload_file', { name: 'Invented', source_type: 'text/plain', content: 'Invented bytes' }],
  [googleApis, 'google-apis', GOOGLE_APIS, 'voice', 'synthesize', { language_code: 'en-US', encoding: 'MP3', text: 'Invented speech' }],
]) {
  test(`F19 ${service}.${module}.${action} exclusive choice still refuses both invalid extremes`, async () => {
    const ad = manifest.modules[module].actions[action];
    const invoke = (input) => run(impl, service, module, action, ad, input);
    assert.equal(schemaViolation(ad.input, base), null);
    assert.equal((await invoke(base)).kind, 'reached');
    const result = await checkComposition(ad.input, base, invoke);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.divergences, []);
    assert.deepEqual(result.probes.map((probe) => probe.detail), [
      'oneOf none-of-the-branch-fields', 'oneOf every-branch-field',
    ]);
    assert.deepEqual(result.probes.map((probe) => probe.violation), ['oneOf:0', 'oneOf:2']);
    assert.deepEqual(result.probes.map((probe) => probe.result.kind), ['refused', 'refused']);
  });
}

test('agreement anyOf still refuses none of the branch fields', async () => {
  const ad = GOOGLE.modules.calendar.actions.update_event;
  const invoke = (input) => run(google, 'google', 'calendar', 'update_event', ad, input);
  const base = { calendar_id: 'primary', event_id: 'event-example', summary: 'Invented event' };
  assert.equal((await invoke(base)).kind, 'reached');
  const result = await checkComposition(ad.input, base, invoke);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.divergences, []);
  assert.equal(result.probes.length, 1);
  assert.equal(result.probes[0].violation, 'anyOf:0');
  assert.equal(result.probes[0].result.kind, 'refused');
});

test('Gmail thread and draft ids share an existing satisfying pattern exemplar', async () => {
  const draft = GOOGLE.modules.gmail.actions.send_draft;
  const threadPattern = GOOGLE.modules.gmail.actions.create_draft.input.properties.thread_id.pattern;
  assert.equal(threadPattern, draft.input.properties.draft_id.pattern);
  for (const draft_id of ['effectivesc', 'r-example-17', 'thread-example_1']) {
    assert.equal(schemaViolation(draft.input, { draft_id }), null);
    assert.equal((await run(google, 'google', 'gmail', 'send_draft', draft, { draft_id })).kind, 'reached');
  }
});
