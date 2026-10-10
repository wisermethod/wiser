import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confirmCall, createTestGateway, putActive } from '../../../gateway/test/fake-provider.js';
import { modules } from '../index.js';

// The shipped default denies privilege admin. These tests allow twenty so the
// action, not the policy, is what they measure. The deny test uses the default.
const allowTwenty = {
  roles: ['runtime', 'readonly'],
  default_role: 'runtime',
  rules: [
    { role: 'runtime', service: 'twenty', privilege: 'admin', op: 'execute', effect: 'allow' },
    { role: 'runtime', privilege: 'admin', effect: 'deny' },
    { role: 'runtime', risk: 'destructive', effect: 'confirm' },
    { role: '*', effect: 'allow' },
  ],
};

const OBJECT_ID = '01234567-89ab-cdef-0123-456789abcdef';
const FIELD_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const PLANTED = { authorization: 'Bearer planted' };
const COLORS = [
  'red', 'ruby', 'crimson', 'tomato', 'orange', 'amber', 'yellow', 'lime', 'grass', 'green',
  'jade', 'mint', 'turquoise', 'cyan', 'sky', 'blue', 'iris', 'violet', 'purple', 'plum',
  'pink', 'bronze', 'gold', 'brown', 'gray',
];

function option(label, value, color = 'green') {
  return { label, value, color };
}

function fieldInput(extra = {}) {
  return {
    objectMetadataId: OBJECT_ID,
    name: 'note',
    label: 'Note',
    type: 'TEXT',
    ...extra,
  };
}

function objectInput(extra = {}) {
  return {
    nameSingular: 'person',
    namePlural: 'people',
    labelSingular: 'Person',
    labelPlural: 'People',
    ...extra,
  };
}

function noLeak(result) {
  const text = JSON.stringify(result);
  assert.equal(text.includes('planted'), false);
  assert.equal(text.includes('leak-this-message'), false);
  assert.equal(text.includes('leak-rest-body'), false);
}

async function connected(policy) {
  const fixture = await createTestGateway(policy ? { policy } : {});
  for (const module of ['records', 'metadata']) {
    await putActive(fixture.store, fixture.fake, { service: 'twenty', module, privilege: 'admin' });
  }
  const calls = [];
  fixture.calls = calls;
  fixture.fake.catalog.execute = async () => {
    throw new Error('catalog execute was used');
  };
  fixture.reply = (data, status = 200) => {
    fixture.fake.auth.proxy = async (request) => {
      calls.push(request);
      return { status, data, headers: PLANTED };
    };
  };
  fixture.reply({});
  return fixture;
}

function scriptField(fixture, field) {
  fixture.fake.auth.proxy = async (request) => {
    fixture.calls.push(request);
    const query = request.body?.query ?? '';
    if (query.includes('field(id: $id)')) {
      return { status: 200, data: { data: { field } }, headers: PLANTED };
    }
    if (query.includes('updateOneField')) {
      return { status: 200, data: { data: { updateOneField: { id: FIELD_ID } } }, headers: PLANTED };
    }
    throw new Error(`unexpected query ${query}`);
  };
}

test('needs_connect before a grant', async () => {
  const { gw, fake } = await createTestGateway({ policy: allowTwenty });
  fake.auth.proxy = async () => {
    throw new Error('unconnected action reached the install');
  };
  for (const [action, module, input] of [
    ['twenty.records.list', 'records', { object: 'people' }],
    ['twenty.records.create', 'records', { object: 'person', data: { name: 'Invented Name' } }],
    ['twenty.metadata.list_objects', 'metadata', {}],
    ['twenty.metadata.create_object', 'metadata', objectInput()],
  ]) {
    const result = await confirmCall(gw, { action, input, confirm: true });
    assert.equal(result.status, 'needs_connect', action);
    assert.equal(result.module, module, action);
    assert.equal(result.privilege, 'admin', action);
  }
});

test('the shipped default policy denies admin before any install call', async () => {
  const fixture = await connected();
  fixture.fake.auth.proxy = async () => {
    throw new Error('denied action reached the install');
  };
  for (const [action, input] of [
    ['twenty.records.list', { object: 'people' }],
    ['twenty.records.create', { object: 'person', data: {} }],
    ['twenty.metadata.list_objects', {}],
    ['twenty.metadata.add_field_options', { fieldId: FIELD_ID, options: [option('Later', 'LATER')] }],
  ]) {
    const result = await confirmCall(fixture.gw, { action, input, confirm: true });
    assert.equal(result.status, 'denied', action);
  }
});

test('records.list sends GET /rest/people?limit=20 and returns the invented page', async () => {
  const fixture = await connected(allowTwenty);
  const page = {
    data: { people: [{ id: 'rec-1', name: 'Invented Person' }] },
    pageInfo: { hasNextPage: false, endCursor: 'cur-1' },
    totalCount: 1,
  };
  fixture.reply(page);
  const result = await fixture.gw.execute({ action: 'twenty.records.list', input: { object: 'people' } });
  assert.deepEqual(result, page);
  noLeak(result);
  assert.equal(fixture.calls.length, 1);
  assert.equal(fixture.calls[0].method, 'GET');
  assert.equal(fixture.calls[0].endpoint, '/rest/people?limit=20');
  assert.equal(fixture.calls[0].body, undefined);
});

test('records.list encodes starting_after and keeps a supplied limit', async () => {
  const fixture = await connected(allowTwenty);
  fixture.reply({ data: { people: [] }, pageInfo: { hasNextPage: true }, totalCount: 0 });
  const result = await fixture.gw.execute({
    action: 'twenty.records.list',
    input: { object: 'people', limit: 15, cursor: 'ab+c/d=e_f' },
  });
  assert.equal(result.pageInfo.hasNextPage, true);
  noLeak(result);
  assert.equal(fixture.calls[0].endpoint, '/rest/people?limit=15&starting_after=ab%2Bc%2Fd%3De_f');
  assert.equal(fixture.calls[0].method, 'GET');
});

test('records.list refuses a limit outside 1 to 60 and a bad cursor', async () => {
  const fixture = await connected(allowTwenty);
  fixture.fake.auth.proxy = async () => {
    throw new Error('invalid list reached the install');
  };
  for (const input of [
    { object: 'people', limit: 0 },
    { object: 'people', limit: 61 },
    { object: 'people', cursor: 'has space' },
  ]) {
    const result = await fixture.gw.execute({ action: 'twenty.records.list', input });
    assert.equal(result.status, 'invalid_arguments', JSON.stringify(input));
  }
});

test('records.create stops for confirmation and then sends createPerson variables only', async () => {
  const fixture = await connected(allowTwenty);
  let calls = 0;
  fixture.fake.auth.proxy = async () => {
    calls += 1;
    return { status: 200, data: { data: { createPerson: { id: 'rec-new' } } }, headers: PLANTED };
  };
  const input = { object: 'person', data: { name: 'Invented Name' } };
  const stopped = await fixture.gw.execute({ action: 'twenty.records.create', input });
  assert.equal(stopped.status, 'needs_confirmation');
  assert.equal(stopped.confirmation, 'always');
  assert.equal(calls, 0);

  fixture.calls.length = 0;
  fixture.fake.auth.proxy = async (request) => {
    fixture.calls.push(request);
    return { status: 200, data: { data: { createPerson: { id: 'rec-new' } } }, headers: PLANTED };
  };
  const result = await confirmCall(fixture.gw, { action: 'twenty.records.create', input, confirm: true });
  assert.deepEqual(result, { id: 'rec-new' });
  noLeak(result);
  assert.equal(fixture.calls.length, 1);
  assert.equal(fixture.calls[0].method, 'POST');
  assert.equal(fixture.calls[0].endpoint, '/graphql');
  const { query, variables } = fixture.calls[0].body;
  assert.equal(query.includes('createPerson'), true);
  assert.equal(query.includes('PersonCreateInput'), true);
  assert.equal(query.includes('Invented Name'), false);
  assert.deepEqual(variables, { data: { name: 'Invented Name' } });
});

// Twenty's own standard objects at v2.45.6 other than the CRM's seven, read from
// STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS at 6007ad5a. A created workflow, campaign or
// message could send email, so records.create refuses every one of them by name.
const SYSTEM_OBJECTS = [
  'agentChatThread', 'agentChatThreadTarget', 'agentMessage', 'agentMessagePart', 'agentTurn',
  'agentTurnEvaluation', 'attachment', 'blocklist', 'calendarChannelEventAssociation',
  'calendarEvent', 'calendarEventParticipant', 'calendarEventTarget', 'callRecording',
  'campaignDelivery', 'dashboard', 'message', 'messageCampaign',
  'messageChannelMessageAssociation', 'messageChannelMessageAssociationMessageFolder',
  'messageList', 'messageListMember', 'messageParticipant', 'messageSuppression', 'messageThread',
  'messageThreadTarget', 'recordShare', 'shortLink', 'timelineActivity', 'workflow',
  'workflowAutomatedTrigger', 'workflowRun', 'workflowVersion', 'workspaceMember',
];

test('records.create refuses each system object at the gateway and in the module, sending nothing', async () => {
  const fixture = await connected(allowTwenty);
  fixture.fake.auth.proxy = async () => {
    throw new Error('a system object reached the install');
  };
  const ctx = {
    proxy: async () => {
      throw new Error('a system object reached the module transport');
    },
  };
  for (const object of SYSTEM_OBJECTS) {
    const refused = await fixture.gw.execute({ action: 'twenty.records.create', input: { object, data: {} } });
    assert.equal(refused.status, 'invalid_arguments', object);
    assert.deepEqual(await modules.records.create({ object, data: {} }, ctx), { status: 'invalid_arguments', field: 'object' }, object);
  }
  const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
  const pattern = manifest.modules.records.actions.create.input.properties.object.pattern;
  const named = /^\^\(\?!\(\?:([A-Za-z|]+)\)\$\)\[a-z\]\[a-zA-Z0-9\]\{0,62\}\$$/.exec(pattern);
  assert.ok(named, pattern);
  assert.deepEqual(named[1].split('|'), SYSTEM_OBJECTS);
});

test('records.create admits the CRM\'s seven objects, a custom object and names extending a refused one', async () => {
  const fixture = await connected(allowTwenty);
  for (const object of ['person', 'company', 'opportunity', 'note', 'noteTarget', 'task', 'taskTarget', 'invention', 'workflowNote']) {
    const name = object[0].toUpperCase() + object.slice(1);
    fixture.calls.length = 0;
    fixture.reply({ data: { [`create${name}`]: { id: 'rec-new' } } });
    const result = await confirmCall(fixture.gw, { action: 'twenty.records.create', input: { object, data: {} }, confirm: true });
    assert.deepEqual(result, { id: 'rec-new' }, object);
    assert.equal(fixture.calls.length, 1, object);
    assert.equal(fixture.calls[0].body.query.includes(`create${name}(`), true, object);
  }
});

test('a GraphQL errors answer fails with the code and not the message', async () => {
  const fixture = await connected(allowTwenty);
  const input = { object: 'person', data: { name: 'Invented Name' } };
  fixture.reply({
    errors: [{ message: 'leak-this-message', extensions: { code: 'UNAUTHENTICATED' } }],
    data: { createPerson: { id: 'should-not-return' } },
  });
  const result = await confirmCall(fixture.gw, { action: 'twenty.records.create', input, confirm: true });
  assert.deepEqual(result, {
    status: 'vendor_error',
    http_status: 200,
    endpoint: '/graphql',
    method: 'POST',
    code: 'UNAUTHENTICATED',
  });
  noLeak(result);
  assert.equal(JSON.stringify(result).includes('should-not-return'), false);

  fixture.calls.length = 0;
  fixture.reply({
    errors: [{ message: 'leak-this-message', extensions: { code: 'leaked-code' } }],
  });
  const omitted = await confirmCall(fixture.gw, { action: 'twenty.records.create', input, confirm: true });
  assert.deepEqual(omitted, {
    status: 'vendor_error',
    http_status: 200,
    endpoint: '/graphql',
    method: 'POST',
  });
  noLeak(omitted);
});

test('a REST failure keeps the gateway status and drops the body', async () => {
  const fixture = await connected(allowTwenty);
  fixture.fake.auth.proxy = async () => ({
    status: 404,
    error: {
      code: 'vendor_error',
      endpoint: '/rest/people?limit=20',
      method: 'GET',
      data: { message: 'leak-rest-body' },
    },
  });
  const result = await fixture.gw.execute({ action: 'twenty.records.list', input: { object: 'people' } });
  assert.deepEqual(result, {
    status: 'vendor_error',
    http_status: 404,
    endpoint: '/rest/people?limit=20',
    method: 'GET',
  });
  noLeak(result);
});

test('list_objects returns the invented objects', async () => {
  const fixture = await connected(allowTwenty);
  fixture.reply({
    data: {
      objects: {
        edges: [
          {
            node: {
              id: 'obj-1',
              nameSingular: 'person',
              namePlural: 'people',
              labelSingular: 'Person',
              labelPlural: 'People',
              isCustom: false,
              isActive: true,
              fields: {
                edges: [
                  {
                    node: {
                      id: 'fld-1',
                      name: 'stage',
                      label: 'Stage',
                      type: 'SELECT',
                      isCustom: false,
                      isActive: true,
                      options: [{ label: 'New', value: 'NEW', color: 'gray', position: 0 }],
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    },
  });
  const result = await fixture.gw.execute({ action: 'twenty.metadata.list_objects', input: {} });
  assert.deepEqual(result, {
    objects: [
      {
        id: 'obj-1',
        nameSingular: 'person',
        namePlural: 'people',
        labelSingular: 'Person',
        labelPlural: 'People',
        isCustom: false,
        isActive: true,
        fields: [
          {
            id: 'fld-1',
            name: 'stage',
            label: 'Stage',
            type: 'SELECT',
            isCustom: false,
            isActive: true,
            options: [{ label: 'New', value: 'NEW', color: 'gray', position: 0 }],
          },
        ],
      },
    ],
  });
  noLeak(result);
  assert.equal(fixture.calls.length, 1);
  assert.equal(fixture.calls[0].endpoint, '/metadata');
  assert.equal(fixture.calls[0].method, 'POST');
  const query = fixture.calls[0].body.query;
  assert.equal(query.includes('objects(paging: { first: 200 }, filter: {})'), true);
  assert.equal(query.includes('fields(paging: { first: 200 }, filter: {})'), true);
  assert.deepEqual(fixture.calls[0].body.variables, {});
});

test('create_object refuses equal singular and plural names', async () => {
  const fixture = await connected(allowTwenty);
  fixture.fake.auth.proxy = async () => {
    throw new Error('equal names reached the install');
  };
  const result = await confirmCall(fixture.gw, {
    action: 'twenty.metadata.create_object',
    input: objectInput({ namePlural: 'person' }),
    confirm: true,
  });
  assert.deepEqual(result, { status: 'invalid_arguments', field: 'namePlural' });
});

test('create_object sends labels as variables and counts label length in code points', async () => {
  const fixture = await connected(allowTwenty);
  fixture.reply({ data: { createOneObject: { id: 'obj-new' } } });
  const emoji = '🙂'.repeat(63);
  const result = await confirmCall(fixture.gw, {
    action: 'twenty.metadata.create_object',
    input: objectInput({ labelSingular: emoji, description: 'a'.repeat(500), icon: 'IconFlask' }),
    confirm: true,
  });
  assert.deepEqual(result, { id: 'obj-new' });
  noLeak(result);
  const { query, variables } = fixture.calls[0].body;
  assert.equal(query.includes('createOneObject'), true);
  assert.equal(query.includes(emoji), false);
  assert.deepEqual(variables.input.object, {
    nameSingular: 'person',
    namePlural: 'people',
    labelSingular: emoji,
    labelPlural: 'People',
    description: 'a'.repeat(500),
    icon: 'IconFlask',
  });

  fixture.calls.length = 0;
  fixture.fake.auth.proxy = async () => {
    throw new Error('overlong label reached the install');
  };
  for (const [field, value] of [
    ['labelSingular', '🙂'.repeat(64)],
    ['labelPlural', 'a'.repeat(64)],
    ['description', 'a'.repeat(501)],
  ]) {
    const refused = await confirmCall(fixture.gw, {
      action: 'twenty.metadata.create_object',
      input: objectInput({ [field]: value }),
      confirm: true,
    });
    assert.equal(refused.status, 'invalid_arguments', field);
    assert.equal(refused.field, field);
    assert.equal(fixture.calls.length, 0, field);
  }
});

test('create_field refuses options on TEXT, SELECT without them, and a duplicate value', async () => {
  const fixture = await connected(allowTwenty);
  fixture.fake.auth.proxy = async () => {
    throw new Error('refused field reached the install');
  };
  const cases = [
    fieldInput({ options: [option('One', 'ONE')] }),
    fieldInput({ type: 'NUMBER', options: [option('One', 'ONE')] }),
    fieldInput({ type: 'SELECT' }),
    fieldInput({ type: 'MULTI_SELECT' }),
    fieldInput({ type: 'SELECT', options: [] }),
    fieldInput({ type: 'SELECT', options: [option('One', 'ONE'), option('Two', 'ONE')] }),
    fieldInput({ type: 'SELECT', options: [option('A,B', 'ONE')] }),
    fieldInput({ type: 'SELECT', options: [option('One', 'A__B')] }),
    fieldInput({ type: 'SELECT', options: [option('One', 'ONE', 'teal')] }),
    fieldInput({ type: 'SELECT', options: [option('One', 'A'.repeat(64))] }),
  ];
  for (const input of cases) {
    const result = await confirmCall(fixture.gw, {
      action: 'twenty.metadata.create_field',
      input,
      confirm: true,
    });
    assert.equal(result.status, 'invalid_arguments', JSON.stringify(input));
    assert.equal(result.field, 'options', JSON.stringify(input));
    assert.equal(fixture.calls.length, 0);
  }
  const longLabel = await confirmCall(fixture.gw, {
    action: 'twenty.metadata.create_field',
    input: fieldInput({ label: 'a'.repeat(64) }),
    confirm: true,
  });
  assert.equal(longLabel.status, 'invalid_arguments');
  assert.equal(longLabel.field, 'label');
  assert.equal(fixture.calls.length, 0);
});

test('create_field sends a select option with position and accepts each tag colour', async () => {
  const fixture = await connected(allowTwenty);
  fixture.reply({ data: { createOneField: { id: 'fld-new' } } });
  for (const color of COLORS) {
    fixture.calls.length = 0;
    const result = await confirmCall(fixture.gw, {
      action: 'twenty.metadata.create_field',
      input: fieldInput({
        type: 'SELECT',
        options: [option('One', 'ONE', color)],
      }),
      confirm: true,
    });
    assert.deepEqual(result, { id: 'fld-new' }, color);
    noLeak(result);
    const sent = fixture.calls[0].body.variables.input.field;
    assert.equal(sent.type, 'SELECT');
    assert.deepEqual(sent.options, [{ label: 'One', value: 'ONE', color, position: 0 }]);
    assert.equal(fixture.calls[0].body.query.includes('ONE'), false);
    assert.equal(fixture.calls[0].endpoint, '/metadata');
  }

  fixture.calls.length = 0;
  const plain = await confirmCall(fixture.gw, {
    action: 'twenty.metadata.create_field',
    input: fieldInput(),
    confirm: true,
  });
  assert.deepEqual(plain, { id: 'fld-new' });
  assert.equal(Object.hasOwn(fixture.calls[0].body.variables.input.field, 'options'), false);
});

test('add_field_options sends the existing options unchanged, then the new ones', async () => {
  const fixture = await connected(allowTwenty);
  const existing = [
    { id: 'opt-a', label: 'New', value: 'NEW', color: 'gray', position: 0 },
    { id: 'opt-b', label: 'Won', value: 'WON', color: 'green', position: 1 },
  ];
  scriptField(fixture, { id: FIELD_ID, type: 'SELECT', options: existing });
  const result = await confirmCall(fixture.gw, {
    action: 'twenty.metadata.add_field_options',
    input: { fieldId: FIELD_ID, options: [option('Later', 'LATER', 'lime')] },
    confirm: true,
  });
  assert.deepEqual(result, { id: FIELD_ID });
  noLeak(result);
  assert.equal(fixture.calls.length, 2);
  assert.equal(fixture.calls[0].body.query.includes('field(id: $id)'), true);
  assert.deepEqual(fixture.calls[0].body.variables, { id: FIELD_ID });
  assert.equal(fixture.calls[0].body.query.includes(FIELD_ID), false);
  assert.equal(fixture.calls[1].body.query.includes('updateOneField'), true);
  assert.equal(fixture.calls[1].body.query.includes('LATER'), false);
  assert.deepEqual(fixture.calls[1].body.variables.input, {
    id: FIELD_ID,
    update: {
      options: [
        ...existing,
        { label: 'Later', value: 'LATER', color: 'lime', position: 2 },
      ],
    },
  });
});

test('add_field_options refuses a non-select field, a conflict, and a 101st option', async () => {
  const fixture = await connected(allowTwenty);
  const fresh = [option('Later', 'LATER')];

  scriptField(fixture, { id: FIELD_ID, type: 'TEXT', options: null });
  const nonSelect = await confirmCall(fixture.gw, {
    action: 'twenty.metadata.add_field_options',
    input: { fieldId: FIELD_ID, options: fresh },
    confirm: true,
  });
  assert.deepEqual(nonSelect, { status: 'invalid_arguments', field: 'fieldId' });
  assert.equal(fixture.calls.length, 1);
  assert.equal(fixture.calls[0].body.query.includes('updateOneField'), false);

  fixture.calls.length = 0;
  scriptField(fixture, {
    id: FIELD_ID,
    type: 'SELECT',
    options: [{ label: 'New', value: 'NEW', color: 'gray', position: 0 }],
  });
  const valueClash = await confirmCall(fixture.gw, {
    action: 'twenty.metadata.add_field_options',
    input: { fieldId: FIELD_ID, options: [option('Fresh', 'NEW')] },
    confirm: true,
  });
  assert.deepEqual(valueClash, { status: 'invalid_arguments', field: 'options' });
  assert.equal(fixture.calls.length, 1);

  fixture.calls.length = 0;
  const labelClash = await confirmCall(fixture.gw, {
    action: 'twenty.metadata.add_field_options',
    input: { fieldId: FIELD_ID, options: [option('New', 'FRESH')] },
    confirm: true,
  });
  assert.deepEqual(labelClash, { status: 'invalid_arguments', field: 'options' });
  assert.equal(fixture.calls.length, 1);

  fixture.calls.length = 0;
  const hundred = Array.from({ length: 100 }, (_, i) => ({
    label: `L${i}`,
    value: `V${i}`,
    color: 'gray',
    position: i,
  }));
  scriptField(fixture, { id: FIELD_ID, type: 'MULTI_SELECT', options: hundred });
  const tooMany = await confirmCall(fixture.gw, {
    action: 'twenty.metadata.add_field_options',
    input: { fieldId: FIELD_ID, options: [option('Extra', 'EXTRA')] },
    confirm: true,
  });
  assert.deepEqual(tooMany, { status: 'invalid_arguments', field: 'options' });
  assert.equal(fixture.calls.length, 1);
  assert.equal(fixture.calls[0].body.query.includes('updateOneField'), false);
});

test('add_field_options allows the 100th option and refuses 51 new ones before the read', async () => {
  const fixture = await connected(allowTwenty);
  const ninetyNine = Array.from({ length: 99 }, (_, i) => ({
    label: `L${i}`,
    value: `V${i}`,
    color: 'gray',
    position: i,
  }));
  scriptField(fixture, { id: FIELD_ID, type: 'SELECT', options: ninetyNine });
  const result = await confirmCall(fixture.gw, {
    action: 'twenty.metadata.add_field_options',
    input: { fieldId: FIELD_ID, options: [option('Extra', 'EXTRA', 'sky')] },
    confirm: true,
  });
  assert.deepEqual(result, { id: FIELD_ID });
  assert.equal(fixture.calls.length, 2);
  const sent = fixture.calls[1].body.variables.input.update.options;
  assert.equal(sent.length, 100);
  assert.deepEqual(sent[99], { label: 'Extra', value: 'EXTRA', color: 'sky', position: 99 });
  assert.deepEqual(sent[0], ninetyNine[0]);

  fixture.calls.length = 0;
  fixture.fake.auth.proxy = async () => {
    throw new Error('51 new options reached the install');
  };
  const many = Array.from({ length: 51 }, (_, i) => option(`L${i}`, `V${i}`));
  const refused = await confirmCall(fixture.gw, {
    action: 'twenty.metadata.add_field_options',
    input: { fieldId: FIELD_ID, options: many },
    confirm: true,
  });
  assert.deepEqual(refused, { status: 'invalid_arguments', field: 'options' });
  assert.equal(fixture.calls.length, 0);
});

test('published schema refusals happen at the gateway boundary', async () => {
  // **Keep this block when you copy the template.** The 2026-09-20 connector audit found
  // that the eleven connectors agreeing with their own manifests were the eleven that had
  // copied a validator and its tests together, and that twelve of the fourteen without it
  // asserted nothing of the kind and held every divergence. The validator now lives in the
  // gateway and no connector carries one, so what a connector still has to carry is this:
  // proof that its published schema is the one being applied to its own actions.
  const fixture = await connected(allowTwenty);
  fixture.fake.auth.proxy = async () => {
    throw new Error('schema refusal reached the install');
  };
  for (const input of [
    { object: 'people', undeclared: 'example' },
    { object: 12345 },
    {},
  ]) {
    const refused = await fixture.gw.execute({ action: 'twenty.records.list', input });
    assert.equal(refused.status, 'invalid_arguments', JSON.stringify(input));
  }
  for (const input of [null, [], 'example', 1]) {
    assert.deepEqual(
      await fixture.gw.execute({ action: 'twenty.records.list', input }),
      { status: 'invalid_arguments', field: 'input' },
    );
  }
  const write = await fixture.gw.execute({
    action: 'twenty.records.create',
    input: { object: 'person', data: { name: 'Invented Name' }, undeclared: 'example' },
  });
  assert.equal(write.status, 'invalid_arguments');
  assert.notEqual(write.status, 'needs_confirmation');
});

test('shipped files keep the header template and no other placeholder', () => {
  const dir = new URL('..', import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', dir), 'utf8'));
  const fieldEnum = manifest.modules.metadata.actions.create_field.input.properties.options.items.properties.color.enum;
  const addEnum = manifest.modules.metadata.actions.add_field_options.input.properties.options.items.properties.color.enum;
  assert.deepEqual(fieldEnum, COLORS);
  assert.deepEqual(addEnum, COLORS);
  assert.equal(
    manifest.modules.metadata.actions.create_object.input.properties.namePlural.pattern,
    '^[a-z](?:[a-zA-Z0-9]{0,62})$',
  );
  const src = readFileSync(new URL('index.js', dir), 'utf8');
  assert.equal(/https?:\/\//.test(src), false);
  assert.equal(/composio/i.test(src), false);
  for (const name of ['CONNECTOR.md', 'auth.md', 'manifest.json', 'index.js', 'package.json']) {
    const text = readFileSync(new URL(name, dir), 'utf8');
    const tokens = [...text.matchAll(/\{\{([A-Za-z0-9_]+)\}\}/g)].map((match) => match[0]);
    if (name === 'auth.md') {
      assert.deepEqual([...new Set(tokens)], ['{{generic_api_key}}']);
    } else {
      assert.deepEqual(tokens, [], name);
    }
  }
});

test('records.count asks for one record and returns totalCount alone', async () => {
  const fixture = await connected(allowTwenty);
  fixture.reply({
    data: { people: [{ id: 'rec-1', name: 'Invented Person', emails: { primaryEmail: 'invented@example.test' } }] },
    pageInfo: { hasNextPage: true, endCursor: 'cur-1' },
    totalCount: 42,
  });
  const result = await fixture.gw.execute({ action: 'twenty.records.count', input: { object: 'people' } });
  assert.deepEqual(result, { totalCount: 42 });
  assert.equal(JSON.stringify(result).includes('Invented Person'), false);
  assert.equal(fixture.calls.length, 1);
  assert.equal(fixture.calls[0].method, 'GET');
  assert.equal(fixture.calls[0].endpoint, '/rest/people?limit=1');
});

test('records.count fails when the answer carries no whole totalCount', async () => {
  const fixture = await connected(allowTwenty);
  fixture.reply({ data: { people: [] }, totalCount: 'many' });
  const result = await fixture.gw.execute({ action: 'twenty.records.count', input: { object: 'people' } });
  assert.equal(result.status, 'vendor_error');
  assert.equal(JSON.stringify(result).includes('many'), false);
});

test('workspace is read on each module and names the key\'s workspace', async () => {
  for (const action of ['twenty.records.workspace', 'twenty.metadata.workspace']) {
    const fixture = await connected(allowTwenty);
    fixture.reply({ data: { currentWorkspace: { id: '22222222-2222-4222-8222-222222222222', subdomain: 'acme', displayName: 'Acme', inviteHash: 'not-returned' } } });
    const result = await fixture.gw.execute({ action, input: {} });
    assert.deepEqual(result, { id: '22222222-2222-4222-8222-222222222222', subdomain: 'acme', displayName: 'Acme' });
    assert.equal(fixture.calls[0].method, 'POST');
    assert.equal(fixture.calls[0].endpoint, '/metadata');
    assert.match(fixture.calls[0].body.query, /currentWorkspace \{ id subdomain displayName \}/);
  }
});

test('workspace fails on an answer with no usable id', async () => {
  const fixture = await connected(allowTwenty);
  fixture.reply({ data: { currentWorkspace: { id: 'not an id!', subdomain: 'acme' } } });
  const result = await fixture.gw.execute({ action: 'twenty.metadata.workspace', input: {} });
  assert.equal(result.status, 'vendor_error');
});

test('add_field_options continues above the highest existing position, not the count', async () => {
  const fixture = await connected(allowTwenty);
  const existing = [
    { id: 'opt-a', label: 'New', value: 'NEW', color: 'gray', position: 10 },
    { id: 'opt-b', label: 'Won', value: 'WON', color: 'green', position: 20 },
  ];
  scriptField(fixture, { id: FIELD_ID, type: 'SELECT', options: existing });
  const result = await confirmCall(fixture.gw, {
    action: 'twenty.metadata.add_field_options',
    input: { fieldId: FIELD_ID, options: [option('Later', 'LATER', 'lime'), option('Lost', 'LOST', 'red')] },
    confirm: true,
  });
  assert.deepEqual(result, { id: FIELD_ID });
  const sent = fixture.calls[1].body.variables.input.update.options;
  assert.deepEqual(sent.slice(0, 2), existing);
  assert.deepEqual(sent.slice(2).map((o) => o.position), [21, 22]);
});

test('add_field_options fails on an existing option whose position is not a number', async () => {
  const fixture = await connected(allowTwenty);
  scriptField(fixture, { id: FIELD_ID, type: 'SELECT', options: [{ id: 'opt-a', label: 'New', value: 'NEW', color: 'gray', position: 'first' }] });
  const result = await confirmCall(fixture.gw, {
    action: 'twenty.metadata.add_field_options',
    input: { fieldId: FIELD_ID, options: [option('Later', 'LATER')] },
    confirm: true,
  });
  assert.equal(result.status, 'vendor_error');
  assert.equal(fixture.calls.length, 1);
});

test('list_objects refuses a partial inventory as RESULT_INCOMPLETE', async () => {
  for (const [objectsMore, fieldsMore] of [[true, false], [false, true]]) {
    const fixture = await connected(allowTwenty);
    fixture.reply({ data: { objects: {
      pageInfo: { hasNextPage: objectsMore },
      edges: [{ node: {
        id: 'obj-1', nameSingular: 'person', namePlural: 'people', labelSingular: 'Person', labelPlural: 'People', isCustom: false, isActive: true,
        fields: { pageInfo: { hasNextPage: fieldsMore }, edges: [{ node: { id: 'fld-1', name: 'name', label: 'Name', type: 'FULL_NAME', isCustom: false, isActive: true, options: null } }] },
      } }],
    } } });
    const result = await fixture.gw.execute({ action: 'twenty.metadata.list_objects', input: {} });
    assert.equal(result.status, 'vendor_error');
    assert.equal(result.code, 'RESULT_INCOMPLETE');
    assert.match(fixture.calls[0].body.query, /pageInfo \{ hasNextPage \}/);
  }
});

test('create_field refuses options on a non-select type after confirmation, sending nothing', async () => {
  const fixture = await connected(allowTwenty);
  const result = await confirmCall(fixture.gw, {
    action: 'twenty.metadata.create_field',
    input: { objectMetadataId: FIELD_ID, name: 'note', label: 'Note', type: 'TEXT', options: [option('A', 'A')] },
    confirm: true,
  });
  assert.equal(result.status, 'invalid_arguments');
  assert.equal(fixture.calls.length, 0);
});
