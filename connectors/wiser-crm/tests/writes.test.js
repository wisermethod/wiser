import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { recordPath } from '../index.js';
import { installToolkitRow } from '../../../gateway/providers/composio/custom-toolkits.js';
import { confirmCall, createFakeProviders, createTestGateway, makeHome } from '../../../gateway/test/fake-provider.js';

const SERVICE = 'wiser-crm';
const LABEL = 'test-install';
const CONNECTORS = fileURLToPath(new URL('../..', import.meta.url));
const captures = JSON.parse(readFileSync(new URL('./v0.3.1-captures.json', import.meta.url), 'utf8'));
const capture = (number) => Object.entries(captures)
  .find(([name]) => name.startsWith(`${String(number).padStart(2, '0')}-`))[1];

function writeInput(action, { endpoint, body }) {
  const [, , entity, id] = endpoint.split('/');
  if (action === 'records.create') return { entity, fields: body };
  if (action === 'records.update') return { entity, id, fields: body };
  return body;
}

function getResult(entity, data) {
  const record = Object.values(data)[0];
  return { method: 'GET', endpoint: `/api/${entity}/${record.id}`, answer: { status: 200, data } };
}

function expectRequests(f, ...steps) {
  const calls = f.calls();
  assert.equal(calls.length, steps.length);
  for (const [index, { endpoint, method = 'GET', body }] of steps.entries()) {
    const request = calls[index];
    assert.equal(request.endpoint, endpoint);
    assert.match(request.endpoint, /^\/(?!\/)/);
    assert.equal(request.method, method);
    assert.deepEqual(request.body, body);
    assert.deepEqual(request.parameters ?? [], []);
  }
}

async function setup(t, { grant = true } = {}) {
  const home = makeHome();
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const answers = [];
  const fake = createFakeProviders({ proxyRules: [{ match: () => true, result: () => {
    assert.ok(answers.length, 'unexpected proxy call');
    return answers.shift();
  } }] });
  fake.auth.installToolkitRow = installToolkitRow;
  const proxy = t.mock.method(fake.auth, 'proxy');
  t.mock.method(fake.catalog, 'execute', () => assert.fail('expected proxy transport'));
  const { gw, store, connectors } = await createTestGateway({
    home, fake, connectorDirs: [CONNECTORS], session: false,
    installOrigin: (service, label) => service === SERVICE && label === LABEL ? 'https://crm.example.test' : undefined,
  });
  const connection = { service: SERVICE, module: 'records', label: LABEL };
  if (grant) {
    assert.equal((await gw.callTool('start_connect', connection)).status, 'link');
    fake.auth.setStatus(store.getConnection(connection).provider_account_id, 'ACTIVE');
    assert.equal((await gw.callTool('connect_status', connection)).status, 'connected');
  }
  return {
    manifest: connectors.find(({ id }) => id === SERVICE).manifest,
    reply(...steps) { answers.push(...steps.map(({ answer }) => answer)); },
    execute(action, input, confirm) {
      const args = { action: `${SERVICE}.${action}`, label: LABEL, input };
      return confirm ? confirmCall(gw, args) : gw.execute(args);
    },
    calls() { return proxy.mock.calls.map(({ arguments: [request] }) => request); },
    audit() { return readFileSync(join(home, 'audit.jsonl'), 'utf8'); },
  };
}

const writes = [
  ['records.create', 2, 'medium', 'fields', { fields: 'bad' }],
  ['records.update', 16, 'high', 'id', { id: 1 }],
  ['records.import_contacts', 53, 'high', 'contacts', { contacts: 'bad' }],
  ['activities.log', 47, 'medium', 'body', { body: 1 }],
];

test('write approval declarations include the exact documented cautions', async (t) => {
  const { manifest } = await setup(t, { grant: false });
  const guide = readFileSync(new URL('../CONNECTOR.md', import.meta.url), 'utf8');
  const cautions = {
    create: 'A contact created with a work email can be linked to a company, which is created when none matches, and a deal created at a won stage marks its company a customer.',
    update: "Setting a deal to a won stage, even the stage it already has, can post the win to the install's Slack channel where Slack is connected and marks its company a customer, with nobody seeing it first.",
  };
  for (const [id, , risk] of writes) {
    const [module, name] = id.split('.');
    const action = manifest.modules[module].actions[name];
    assert.equal(action.risk, risk);
    assert.equal(action.confirmation, 'always');
    assert.equal(action.execution.prefer, 'proxy');
    assert.equal(action.input.additionalProperties, false);
    if (name === 'import_contacts') {
      assert.equal(Object.hasOwn(action, 'standing_approval'), false);
    } else {
      assert.equal(action.standing_approval.kind, 'change');
      assert.equal(typeof action.standing_approval.summary, 'string');
      assert.equal(action.standing_approval.caution, cautions[name]);
    }
  }
  for (const [name, caution] of Object.entries(cautions)) {
    assert.ok(guide.includes(`**\`records.${name}\` caution.** ${caution}\n`), name);
  }
});

for (const [action, number, risk, field, mistyped] of writes) {
  const sample = capture(number);
  const input = writeInput(action, sample);
  test(`${action} needs a labelled grant before transport`, async (t) => {
    const f = await setup(t, { grant: false });
    const answer = await f.execute(action, input, true);
    assert.equal(answer.status, 'needs_connect');
    assert.equal(answer.label, LABEL);
    expectRequests(f);
  });

  test(`${action} stops for confirmation before transport`, async (t) => {
    const f = await setup(t);
    const answer = await f.execute(action, input);
    assert.equal(answer.status, 'needs_confirmation');
    assert.equal(answer.confirmation, 'always');
    assert.equal(answer.risk, risk);
    expectRequests(f);
  });

  test(`${action} enforces the gateway input schema before transport`, async (t) => {
    const f = await setup(t);
    const missing = { ...input };
    delete missing[field];
    for (const [args, invalidField] of [
      [{ ...input, undeclared: 'example' }, 'undeclared'],
      [{ ...input, ...mistyped }, field],
      [missing, field],
      [null, 'input'], [[], 'input'], ['example', 'input'], [1, 'input'],
    ]) {
      assert.deepEqual(await f.execute(action, args, true), { status: 'invalid_arguments', field: invalidField });
    }
    expectRequests(f);
  });

  const marker = 'invented-private-write-answer';
  test(`${action} parses JSON strings and refuses HTML without echoing contents`, async (t) => {
    const f = await setup(t);
    const { endpoint, answer } = sample;
    const stringAnswer = { ...sample, answer: { ...answer, data: JSON.stringify(answer.data), headers: { location: marker } } };
    const htmlAnswer = { ...sample, answer: { status: 200, data: `<html>${marker}</html>` } };
    f.reply(stringAnswer, htmlAnswer);
    assert.deepEqual(await f.execute(action, input, true), answer.data);
    const refusal = await f.execute(action, input, true);
    assert.deepEqual(refusal, { status: 'vendor_error', reason: 'not_crm_answer', http_status: 200, endpoint });
    assert.equal(JSON.stringify(refusal).includes(marker), false);
    assert.equal(f.audit().includes(marker), false);
    expectRequests(f, sample, sample);
  });
}

const contact = capture(4).answer.data;
const sampleContact = capture(5).answer.data;
const company = capture(2).answer.data;
const beforeDeal = capture(28).answer.data;

for (const [action, number, prechecks = []] of [
  ['records.create', 2],
  ['records.create', 4, [getResult('companies', company)]],
  ['records.create', 6],
  ['records.create', 7, [getResult('companies', company), getResult('contacts', contact)]],
  ['records.create', 8, [getResult('contacts', sampleContact)]],
  ['records.update', 16],
  ['records.update', 24],
  ['records.update', 32],
  ['records.update', 40],
  ['records.import_contacts', 53],
  ['records.import_contacts', 56],
  ['activities.log', 9],
  ['activities.log', 47],
  ['activities.log', 48],
  ['activities.log', 49],
]) {
  test(`${action} sends capture ${number} to the fixed relative route and returns its shape`, async (t) => {
    const f = await setup(t);
    const write = capture(number);
    const input = writeInput(action, write);
    const steps = [...prechecks, write];
    if (prechecks.length) steps.push(getResult(input.entity, write.answer.data));
    f.reply(...steps);
    assert.deepEqual(await f.execute(action, input, true), write.answer.data);
    expectRequests(f, ...steps);
  });
}

for (const [action, numbers] of [
  ['records.create', [14, 15, 22, 23, 30, 31]],
  ['records.update', [17, 25, 33, 39, 72, 73]],
]) {
  for (const number of numbers) {
    test(`${action} reports the body-stripped refusal in capture ${number}`, async (t) => {
      const f = await setup(t);
      const write = capture(number);
      assert.equal(Object.hasOwn(write.answer, 'data'), false);
      f.reply(write);
      assert.deepEqual(await f.execute(action, writeInput(action, write), true), {
        status: 'vendor_error', http_status: write.answer.status, endpoint: write.endpoint,
      });
      expectRequests(f, write);
    });
  }
}

for (const [action, number, malformed] of [
  ['records.create', 2, [{ company: null }, { company: {} }, { company: { id: 'not-a-uuid' } }]],
  ['records.update', 16, [{ company: [] }]],
  ['records.import_contacts', 53, Object.keys(capture(53).answer.data).map((key) => ({
    ...capture(53).answer.data, [key]: '1',
  }))],
  ['activities.log', 47, [{ ok: false }, { ok: 'true' }]],
]) {
  test(`${action} rejects each malformed constrained response field`, async (t) => {
    const f = await setup(t);
    const write = capture(number);
    for (const data of malformed) {
      f.reply({ ...write, answer: { ...write.answer, data } });
      assert.deepEqual(await f.execute(action, writeInput(action, write), true), {
        status: 'vendor_error', reason: 'not_crm_answer', http_status: write.answer.status, endpoint: write.endpoint,
      });
    }
    expectRequests(f, ...malformed.map(() => write));
  });
}

test('record write paths encode segments and the gateway refuses URL-shaped IDs', async (t) => {
  const f = await setup(t);
  for (const [id, encoded] of [
    ['https://evil.example/x', 'https%3A%2F%2Fevil.example%2Fx'],
    ['//evil.example/x', '%2F%2Fevil.example%2Fx'],
  ]) {
    assert.equal(recordPath('contacts', id), `/api/contacts/${encoded}`);
    assert.deepEqual(await f.execute('records.update', { entity: 'contacts', id, fields: {} }, true), {
      status: 'invalid_arguments', field: 'id',
    });
    assert.deepEqual(await f.execute('records.create', { entity: 'deals', fields: { contact_id: id } }, true), {
      status: 'invalid_arguments', field: 'fields',
    });
  }
  expectRequests(f);
});

test('record fields enforce key, scalar, custom and serialized UTF-8 size rules', async (t) => {
  const f = await setup(t);
  for (const fields of [
    { ['a'.repeat(65)]: 1 }, { 'uppercaseA': true }, { '_key': true }, { 'bad-key': 1 },
    { field: {} }, { field: [] }, { custom: null }, { custom: [] }, { custom: { 'bad-key': 1 } },
    { custom: { inner: {} } }, { custom: { ['a'.repeat(65)]: 'too long' } },
    { note: '🙂'.repeat(4096) }, { company_id: '..' },
  ]) {
    assert.deepEqual(await f.execute('records.create', { entity: 'companies', fields }, true), {
      status: 'invalid_arguments', field: 'fields',
    });
  }
  expectRequests(f);
  const sample = capture(2);
  const fields = { ['a'.repeat(64)]: false, name: 'Example Co', custom: { a: 2, b: null } };
  const limit = { note: '🙂'.repeat(4093) + 'a' };
  assert.equal(Buffer.byteLength(JSON.stringify(limit)), 16 * 1024);
  f.reply(sample, sample);
  for (const body of [fields, limit]) {
    assert.deepEqual(await f.execute('records.create', { entity: 'companies', fields: body }, true), sample.answer.data);
  }
  expectRequests(f, { ...sample, body: fields }, { ...sample, body: limit });
});

test('contact import enforces the whole nested schema and code-point bounds', async (t) => {
  const f = await setup(t);
  const sample = capture(53);
  for (const contacts of [
    capture(54).body.contacts,
    Array.from({ length: 501 }, () => ({ first_name: 'Example' })),
    capture(55).body.contacts, [{ first_name: '' }], [{ first_name: null }],
    [{ first_name: 'Example', unknown: 'value' }], [{ first_name: 'Example', custom: {} }],
    [{ first_name: 'Example', title: false }], [{ first_name: '🙂'.repeat(257) }],
    [{ first_name: 'Example', company_phone: '🙂'.repeat(257) }],
    [null], [[]], ['Example'],
  ]) {
    assert.deepEqual(await f.execute('records.import_contacts', { contacts }, true), {
      status: 'invalid_arguments', field: 'contacts',
    });
  }
  assert.deepEqual(await f.execute('records.import_contacts', {
    ...sample.body, inferCompanyFromEmail: true,
  }, true), { status: 'invalid_arguments', field: 'inferCompanyFromEmail' });
  expectRequests(f);

  const allowedKeys = [
    'first_name', 'last_name', 'email', 'phone', 'title', 'status',
    'company', 'company_domain', 'company_industry', 'company_phone',
  ];
  const limit = Object.fromEntries(allowedKeys.map((key) => [key, '🙂'.repeat(256)]));
  const contacts = [limit, ...Array.from({ length: 499 }, () => ({ first_name: 'A', last_name: '' }))];
  f.reply(sample);
  assert.deepEqual(await f.execute('records.import_contacts', { contacts }, true), sample.answer.data);
  expectRequests(f, { ...sample, body: { contacts } });
});

test('activity logging checks the input length, trims the body and requires text', async (t) => {
  const f = await setup(t);
  const sample = capture(9);
  for (const body of [capture(50).body.body, ' \n\t ']) {
    assert.deepEqual(await f.execute('activities.log', { ...sample.body, body }, true), {
      status: 'invalid_arguments', field: 'body',
    });
  }
  for (const body of ['🙂'.repeat(10001), ` ${'🙂'.repeat(10000)}`]) {
    assert.deepEqual(await f.execute('activities.log', { ...sample.body, body }, true), {
      status: 'invalid_arguments', field: 'body', reason: 'maxLength',
    });
  }
  assert.deepEqual(await f.execute('activities.log', { ...sample.body, type: 'slack' }, true), {
    status: 'invalid_arguments', field: 'type',
  });
  expectRequests(f);

  const body = '🙂'.repeat(9998);
  f.reply(sample);
  assert.deepEqual(await f.execute('activities.log', { ...sample.body, body: ` ${body}\n` }, true), { ok: true });
  expectRequests(f, { ...sample, body: { ...sample.body, body } });
});

test('link pre-check refuses a missing company before either record write', async (t) => {
  const f = await setup(t);
  const companyMissing = capture(13);
  const company_id = companyMissing.endpoint.split('/').at(-1);
  const create = { entity: 'contacts', fields: { first_name: 'Example', company_id } };
  const update = { entity: 'contacts', id: contact.contact.id, fields: { company_id } };
  f.reply(companyMissing, companyMissing);
  for (const [action, input] of [['records.create', create], ['records.update', update]]) {
    assert.deepEqual(await f.execute(action, input, true), {
      status: 'vendor_error', http_status: 404, endpoint: companyMissing.endpoint,
    });
  }
  expectRequests(f, companyMissing, companyMissing);
});

test('link pre-check requires the linked record to match the requested ID', async (t) => {
  const f = await setup(t);
  const write = capture(8);
  const precheck = getResult('contacts', sampleContact);
  f.reply({ ...precheck, answer: { status: 200, data: contact } });
  assert.deepEqual(await f.execute('records.create', writeInput('records.create', write), true), {
    status: 'vendor_error', reason: 'not_crm_answer', http_status: 200, endpoint: precheck.endpoint,
  });
  expectRequests(f, precheck);
});

for (const postReadFails of [false, true]) {
  test(`create leaves the record in place without DELETE when readback ${postReadFails ? 'fails' : 'finds a mismatch'}`, async (t) => {
    const f = await setup(t);
    const write = capture(4);
    const precheck = getResult('companies', company);
    const id = contact.contact.id;
    const postcheck = getResult('contacts', { contact: { ...contact.contact, company_id: null } });
    if (postReadFails) {
      postcheck.answer = {
        ...capture(21).answer, error: { ...capture(21).answer.error, endpoint: postcheck.endpoint },
      };
    }
    f.reply(precheck, write, postcheck);
    assert.deepEqual(await f.execute('records.create', writeInput('records.create', write), true), {
      status: 'vendor_error', endpoint: postcheck.endpoint,
      ...(postReadFails ? { http_status: 404 } : { reason: 'link_mismatch', links: { company_id: null } }),
      id, message: 'the record was created and left in place',
    });
    expectRequests(f, precheck, write, postcheck);
  });
}

for (const retainCompany of [false, true]) {
  test(`deal update ${retainCompany ? 'keeps its company' : 'inherits the new contact company'}`, async (t) => {
    const f = await setup(t);
    const { id, company_id } = beforeDeal.deal;
    const prior = { deal: { ...beforeDeal.deal, company_id: retainCompany ? company_id : null } };
    const updated = { deal: {
      ...prior.deal,
      contact_id: sampleContact.contact.id,
      company_id: retainCompany ? company_id : sampleContact.contact.company_id,
    } };
    const before = getResult('deals', prior);
    const body = { contact_id: updated.deal.contact_id };
    const write = { ...capture(32), body, answer: { status: 200, data: updated } };
    const precheck = getResult('contacts', sampleContact);
    const after = getResult('deals', updated);
    f.reply(precheck, before, write, after);
    assert.deepEqual(await f.execute('records.update', { entity: 'deals', id, fields: body }, true), updated);
    expectRequests(f, precheck, before, write, after);
  });
}

test('an explicit null clears a link and overrides company inheritance', async (t) => {
  const f = await setup(t);
  const { id } = beforeDeal.deal;
  const body = { contact_id: sampleContact.contact.id, company_id: null };
  const updated = { deal: { ...beforeDeal.deal, ...body } };
  const before = getResult('deals', beforeDeal);
  const write = { ...capture(32), body, answer: { status: 200, data: updated } };
  const precheck = getResult('contacts', sampleContact);
  const after = getResult('deals', updated);
  f.reply(precheck, before, write, after);
  assert.deepEqual(await f.execute('records.update', { entity: 'deals', id, fields: body }, true), updated);
  expectRequests(f, precheck, before, write, after);
});

for (const [postReadFails, rollbackFails] of [[false, false], [true, false], [false, true], [true, true]]) {
  test(`update writes back prior values after ${postReadFails ? 'a failed readback' : 'a link mismatch'} and reports ${rollbackFails ? 'the failed restoration' : 'the original failure'}`, async (t) => {
    const f = await setup(t);
    const prior = { deal: { ...beforeDeal.deal, company_id: null, custom_field: 'Before' } };
    const body = { contact_id: sampleContact.contact.id, value: 42, custom: { custom_field: 'After' } };
    const updated = { deal: { ...prior.deal, ...body, custom_field: 'After' } };
    const precheck = getResult('contacts', sampleContact);
    const before = getResult('deals', prior);
    const write = { ...capture(32), body, answer: { status: 200, data: updated } };
    const after = getResult('deals', updated);
    if (postReadFails) {
      const missing = capture(29).answer;
      after.answer = { ...missing, error: { ...missing.error, endpoint: after.endpoint } };
    }
    const rollback = {
      ...write,
      body: {
        contact_id: prior.deal.contact_id, company_id: null,
        value: prior.deal.value, custom: { custom_field: 'Before' },
      },
      answer: { status: 200, data: prior },
    };
    if (rollbackFails) {
      const readOnly = capture(72).answer;
      rollback.answer = { ...readOnly, error: { ...readOnly.error, endpoint: rollback.endpoint } };
    }

    f.reply(precheck, before, write, after, rollback);
    const result = await f.execute('records.update', { entity: 'deals', id: prior.deal.id, fields: body }, true);
    assert.deepEqual(result, {
      status: 'vendor_error', endpoint: after.endpoint,
      ...(postReadFails ? { http_status: 404 } : { reason: 'link_mismatch' }),
      ...(rollbackFails ? { rollback_status: 503, message: 'the new values may still be in place' } : {}),
    });
    expectRequests(f, precheck, before, write, after, rollback);
  });
}

test('a contact create with a null company and a work email is left in place, naming the company the CRM linked', async (t) => {
  const f = await setup(t);
  const created = capture(6);
  const inferred = created.answer.data.contact.company_id;
  assert.match(inferred, /^[0-9a-f-]{36}$/);
  const body = { ...created.body, company_id: null };
  const write = { ...created, body };
  const postcheck = getResult('contacts', created.answer.data);
  f.reply(write, postcheck);
  assert.deepEqual(await f.execute('records.create', writeInput('records.create', write), true), {
    status: 'vendor_error', reason: 'link_mismatch', endpoint: postcheck.endpoint,
    id: created.answer.data.contact.id, links: { company_id: inferred },
    message: 'the record was created and left in place',
  });
  expectRequests(f, write, postcheck);
  assert.equal(f.calls().some(({ method }) => method === 'DELETE'), false);
});

for (const rollbackFails of [false, true]) {
  test(`an update that set a stage says a won-stage post or customer mark stays in place when the restore ${rollbackFails ? 'fails' : 'succeeds'}`, async (t) => {
    const f = await setup(t);
    const prior = { deal: { ...beforeDeal.deal, company_id: null } };
    const body = { contact_id: sampleContact.contact.id, stage: 'won' };
    const updated = { deal: { ...prior.deal, ...body } };
    const precheck = getResult('contacts', sampleContact);
    const before = getResult('deals', prior);
    const write = { ...capture(32), body, answer: { status: 200, data: updated } };
    const missing = capture(29).answer;
    const after = getResult('deals', updated);
    after.answer = { ...missing, error: { ...missing.error, endpoint: after.endpoint } };
    const rollback = {
      ...write,
      body: { contact_id: prior.deal.contact_id, stage: prior.deal.stage, company_id: null },
      answer: { status: 200, data: prior },
    };
    if (rollbackFails) {
      const readOnly = capture(72).answer;
      rollback.answer = { ...readOnly, error: { ...readOnly.error, endpoint: rollback.endpoint } };
    }
    f.reply(precheck, before, write, after, rollback);
    const result = await f.execute('records.update', { entity: 'deals', id: prior.deal.id, fields: body }, true);
    const kept = '; a won-stage Slack post or customer mark, if one ran, stays in place';
    assert.deepEqual(result, {
      status: 'vendor_error', endpoint: after.endpoint, http_status: 404,
      ...(rollbackFails
        ? { rollback_status: 503, message: `the new values may still be in place${kept}` }
        : { message: `the prior values were written back${kept}` }),
    });
    expectRequests(f, precheck, before, write, after, rollback);
  });
}

for (const entity_id of ['https://evil.example/x', '//evil.example/x']) {
  test(`activities.log refuses a URL-shaped entity_id ${entity_id} before transport`, async (t) => {
    const f = await setup(t);
    const result = await f.execute('activities.log', { entity_type: 'contact', entity_id, type: 'note', body: 'Invented note' });
    assert.equal(result.status, 'invalid_arguments');
    assert.equal(f.calls().length, 0);
  });
}
