import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { confirmCall, createFakeProviders, createTestGateway, putActive } from '../../../gateway/test/fake-provider.js';
import { statusSignal } from '../../../gateway/src/errors.js';
import { inputs, routes } from '../routes.js';
import { validateArgs } from '../../../gateway/src/tools.js';

const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
const connectorDirs = [fileURLToPath(new URL('../../', import.meta.url))];
const entries = Object.entries(manifest.modules).flatMap(([module, { actions }]) =>
  Object.entries(actions).map(([name, action]) => ({ id: `calcom.${module}.${name}`, module, action })));
const byRoute = (method, path) => {
  const row = entries.find(({ id }) => routes[id].method === method && routes[id].path === path);
  assert.ok(row, `${method} ${path}`);
  return row;
};

const examples = {
  '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$': 'example_id-1',
  '^[A-Za-z0-9_][A-Za-z0-9_-]{0,1023}$': '_example_event-1',
  '^#?([0-9A-F]{3}|[0-9A-F]{4}|[0-9A-F]{6}|[0-9A-F]{8})$': '#ABC',
  '^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$': '#aBc123',
  '^#[0-9a-f]{6}$': '#abc123',
  '^[\\w-]{1,64}$': 'condition-1',
  '\\S': 'title',
  '^\\d+,.+$': '135,calendar@example.test',
  '^[a-z0-9-]+$': 'personal-services',
};

function sample(schema, index = 0) {
  if (schema.enum) return schema.enum[index % schema.enum.length];
  switch (schema.type) {
    case 'boolean': return index % 2 === 0;
    case 'number':
    case 'integer': return Math.min((schema.minimum ?? 10) + index, schema.maximum ?? Infinity);
    case 'string': {
      if (schema.pattern) {
        assert.ok(new RegExp(schema.pattern).test(examples[schema.pattern] ?? ''), schema.pattern);
        return examples[schema.pattern];
      }
      return (index ? 'two' : 'one').repeat(Math.max(1, schema.minLength ?? 0)).slice(0, schema.maxLength);
    }
    case 'array': {
      const length = Math.min(Math.max(2, schema.minItems ?? 0), schema.maxItems ?? Infinity);
      return Array.from({ length }, (_, i) => sample(schema.items ?? {}, i));
    }
    case 'object': return Object.fromEntries(Object.entries(schema.properties ?? {}).map(([key, property]) => [key, sample(property)]));
    default: return 'fixture';
  }
}

async function fixture(t, { grant = true, proxyRules = [] } = {}) {
  const fake = createFakeProviders({ proxyRules });
  const proxy = fake.auth.proxy.bind(fake.auth);
  const calls = [];
  fake.auth.proxy = (request, options) => {
    calls.push(request);
    return proxy(request, options);
  };
  const f = await createTestGateway({ connectorDirs, fake });
  t.after(() => rmSync(f.home, { recursive: true, force: true }));
  if (grant) {
    for (const module of Object.keys(manifest.modules)) {
      await putActive(f.store, fake, { service: 'calcom', module });
    }
  }
  return { ...f, calls };
}

test('a grant is required and a labelled grant only answers under its label', async (t) => {
  const { gw, fake, store, calls } = await fixture(t, { grant: false });
  const call = { action: 'calcom.profile.get', input: {} };
  assert.equal((await gw.execute(call)).status, 'needs_connect');
  const key = { service: 'calcom', module: 'profile', label: 'sample-account' };
  const link = await gw.callTool('start_connect', key);
  assert.equal(link.status, 'link');
  const bound = store.getConnection(key);
  fake.auth.setStatus(bound.provider_account_id, 'ACTIVE');
  assert.equal((await gw.callTool('connect_status', key)).status, 'connected');
  for (const module of Object.keys(manifest.modules)) {
    assert.equal(store.getConnection({ ...key, module }).provider_account_id, bound.provider_account_id, module);
  }
  assert.deepEqual(await gw.execute(call), {
    status: 'invalid_arguments', tool: 'execute', field: 'label', labels: [key.label],
  });
  assert.deepEqual(await gw.execute({ ...call, label: key.label }), {});
  assert.equal(calls[0].providerAccountId, bound.provider_account_id);

  const second = { ...key, label: 'another-account' };
  assert.equal((await gw.callTool('start_connect', second)).status, 'link');
  const other = store.getConnection(second);
  assert.notEqual(other.provider_account_id, bound.provider_account_id);
  fake.auth.setStatus(other.provider_account_id, 'ACTIVE');
  assert.equal((await gw.callTool('connect_status', second)).status, 'connected');
  assert.deepEqual(await gw.execute({ action: 'calcom.bookings.list', input: {}, label: second.label }), {});
  assert.equal(calls.length, 2);
  assert.equal(calls[1].providerAccountId, other.provider_account_id);
});

test('the generated table builds a proxy request for every emitted action', async (t) => {
  const { gw, calls } = await fixture(t);
  assert.deepEqual(new Set(entries.map(({ id }) => id)), new Set(Object.keys(routes)));
  for (const { id, action } of entries) {
    const route = routes[id];
    const input = sample(action.input);
    const before = calls.length;
    const args = { action: id, input };
    assert.deepEqual(await confirmCall(gw, args), {}, id);
    assert.equal(calls.length, before + 1, id);
    const request = calls.at(-1);
    assert.equal(request.toolkit, 'CAL', id);
    assert.equal(request.method, route.method, id);
    let endpoint = route.path;
    for (const key of route.pathParameters) endpoint = endpoint.replace(`{${key}}`, encodeURIComponent(input[key]));
    assert.equal(request.endpoint, endpoint, id);
    assert.match(request.endpoint, /^\/v2\//);
    const query = (request.parameters ?? []).filter(({ type }) => type === 'query');
    assert.deepEqual([...new Set(query.map(({ name }) => name))], route.queryParameters.map(({ name }) => name), id);
    for (const { name, style, explode } of route.queryParameters) {
      const values = query.filter((entry) => entry.name === name).map(({ value }) => value);
      const source = input[name];
      const array = Array.isArray(source);
      const delimiter = style === 'pipeDelimited' ? '|' : style === 'spaceDelimited' ? ' ' : ',';
      assert.deepEqual(values, array && !explode ? [source.join(delimiter)] : [source].flat().map(String), `${id} ${name}`);
    }
    const headers = (request.parameters ?? []).filter(({ type }) => type === 'header');
    assert.deepEqual(headers, route.version ? [{ name: 'cal-api-version', value: route.version, type: 'header' }] : [], id);
    const expectedBody = route.wholeBody ? input[route.wholeBody]
      : Object.fromEntries(route.bodyProperties.map((name) => [name, input[name]]));
    assert.deepEqual(request.body, route.bodyRequired || route.wholeBody || route.bodyProperties.length ? expectedBody : undefined, id);
    assert.equal(request.binary_body, undefined, id);
  }
});

test('path interpolation percent-encodes numeric exponent signs and rejects unsafe string IDs', async (t) => {
  const { gw, calls } = await fixture(t);
  const action = byRoute('GET', '/v2/bookings/{bookingUid}/attendees/{attendeeId}').id;
  assert.deepEqual(await gw.execute({ action, input: { bookingUid: 'booking_1', attendeeId: 1e22 } }), {});
  assert.equal(calls[0].endpoint, '/v2/bookings/booking_1/attendees/1e%2B22');
  for (const bookingUid of ['..', 'one/two', '%2F']) {
    assert.deepEqual(await gw.execute({ action, input: { bookingUid, attendeeId: 1 } }),
      { status: 'invalid_arguments', field: 'bookingUid' });
  }
  assert.equal(calls.length, 1);
});

test('query arrays use repeated calendar pairs and a comma-delimited status filter', async (t) => {
  const { gw, calls } = await fixture(t);
  const calendars = ['135,one@example.test', '200,calendar,with,commas'];
  const action = byRoute('GET', '/v2/calendars/busy-times').id;
  assert.deepEqual(await gw.execute({ action, input: { dateFrom: '2026-01-01', dateTo: '2026-01-02', calendar: calendars } }), {});
  assert.deepEqual(calls[0].parameters.filter(({ name }) => name === 'calendar').map(({ value }) => value), calendars);
  const eventBookings = byRoute('GET', '/v2/events/{uuid}/bookings').id;
  assert.deepEqual(await gw.execute({ action: eventBookings, input: { uuid: 'event-1', status: ['CONFIRMED', 'WAITLISTED'] } }), {});
  assert.deepEqual(calls[1].parameters, [{ name: 'status', value: 'CONFIRMED,WAITLISTED', type: 'query' }]);
});

test('the template schema enforcement block applies in each module', async (t) => {
  const { gw, calls } = await fixture(t);
  for (const module of Object.keys(manifest.modules)) {
    const row = entries.find((entry) => entry.module === module && entry.action.input.required?.length);
    assert.ok(row, module);
    const valid = sample(row.action.input);
    const [name] = row.action.input.required;
    const missing = { ...valid };
    delete missing[name];
    const wrong = typeof valid[name] === 'string' ? 12345 : 'wrong-type';
    for (const input of [{ ...valid, undeclared: 'example' }, { ...valid, [name]: wrong }, missing, null, [], 'example', 1]) {
      const result = await gw.execute({ action: row.id, input });
      assert.equal(result.status, 'invalid_arguments', `${row.id}: ${JSON.stringify(input)}`);
      if (!input || typeof input !== 'object' || Array.isArray(input)) assert.equal(result.field, 'input', row.id);
    }
  }
  assert.equal(calls.length, 0);
});

test('every non-read stops for confirmation without transport', async (t) => {
  const { gw, calls } = await fixture(t);
  for (const { id, action } of entries.filter(({ action }) => action.risk !== 'low')) {
    assert.equal(action.confirmation, 'always', id);
    assert.equal((await gw.execute({ action: id, input: sample(action.input) })).status, 'needs_confirmation', id);
  }
  assert.equal(calls.length, 0);
});

test('published nested required fields, numeric bounds, array bounds and code point lengths are enforced', async (t) => {
  const { gw, calls } = await fixture(t);
  const action = 'calcom.schedules.create';
  const args = { action, input: {
    name: 'Weekdays', timeZone: 'UTC', isDefault: false,
    availability: [{ days: ['Monday'], startTime: '09:00' }],
  } };
  assert.deepEqual(await confirmCall(gw, args), { status: 'invalid_arguments', field: 'availability[0].endTime' });
  const search = 'calcom.contacts.list';
  assert.deepEqual(await gw.execute({ action: search, input: { search: '🙂'.repeat(101) } }),
    { status: 'invalid_arguments', field: 'search' });
  const listings = byRoute('GET', '/v2/discover/listings').id;
  for (const [ids, field] of [[[], 'ids'], [[0], 'ids[0]'], [[2147483648], 'ids[0]'], [Array(51).fill(1), 'ids']]) {
    assert.deepEqual(await gw.execute({ action: listings, input: { ids } }), { status: 'invalid_arguments', field });
  }
  assert.equal(calls.length, 0);
  assert.deepEqual(await gw.execute({ action: search, input: { search: '🙂'.repeat(100), limit: 1 } }), {});
  assert.equal(calls.length, 1);
});

test('answers withhold exact keys recursively and retain flags and IDs', async (t) => {
  const data = { status: 'success', data: [{ secret: 'fake-webhook-value', hasSecret: true, credentialId: 8,
    location: { password: 'fake-pin' }, recording: { shareToken: 'fake-recording-value' } }] };
  const { gw } = await fixture(t, { proxyRules: [{ match: () => true, result: { status: 200, data } }] });
  const result = await gw.execute({ action: 'calcom.webhooks.get', input: { webhookId: 'hook-1' } });
  assert.deepEqual(result, { status: 'success', data: [{ secret: null, hasSecret: true, credentialId: 8,
    location: { password: null }, recording: { shareToken: null } }],
  withheld: ['data[0].secret', 'data[0].location.password', 'data[0].recording.shareToken'] });
  assert.equal(data.data[0].secret, 'fake-webhook-value');
});

test('D8 HTTP refusals omit code and message, while a 2xx application error keeps only its code', async (t) => {
  const { gw } = await fixture(t, { proxyRules: [
    { match: (endpoint) => endpoint === '/v2/me', result: { status: 400,
      data: { status: 'error', error: { code: 'INVALID_EXAMPLE', message: 'Private vendor detail' } } } },
    { match: (endpoint) => endpoint === '/v2/timezones', result: { status: 403,
      error: { code: 'vendor_error', endpoint: '/v2/timezones', method: 'GET' } } },
    { match: (endpoint) => endpoint === '/v2/credits/available', result: { status: 200,
      data: { status: 'error', error: { code: 'INVALID_EXAMPLE', message: 'Private vendor detail' } } } },
    { match: (endpoint) => endpoint === '/v2/schedules', result: { status: 200, data: 'unexpected text' } },
    { match: (endpoint) => endpoint === '/v2/events', result: { status: 'needs_provider_capability' } },
    { match: (endpoint) => endpoint === '/v2/bookings', result: () => {
      throw statusSignal('vendor_error', { reason: 'proxy_body_too_large' });
    } },
  ] });
  assert.deepEqual(await gw.execute({ action: 'calcom.profile.get', input: {} }),
    { status: 'vendor_error', http_status: 400, endpoint: '/v2/me', method: 'GET' });
  assert.deepEqual(await gw.execute({ action: 'calcom.profile.list_timezones', input: {} }),
    { status: 'vendor_error', http_status: 403, endpoint: '/v2/timezones', method: 'GET' });
  assert.deepEqual(await gw.execute({ action: 'calcom.account.check_credits', input: {} }),
    { status: 'vendor_error', http_status: 200, endpoint: '/v2/credits/available', method: 'GET', code: 'INVALID_EXAMPLE' });
  assert.deepEqual(await gw.execute({ action: 'calcom.schedules.list', input: {} }),
    { status: 'vendor_error', http_status: 200, endpoint: '/v2/schedules', method: 'GET' });
  assert.deepEqual(await gw.execute({ action: 'calcom.events.list', input: {} }), { status: 'needs_provider_capability' });
  assert.deepEqual(await gw.execute({ action: 'calcom.bookings.list', input: {} }),
    { status: 'vendor_error', reason: 'proxy_body_too_large' });
});

test('D1 sends booking variant fields flat and still validates the shared attendee schema', async (t) => {
  const { gw, calls } = await fixture(t);
  const action = 'calcom.bookings.create';
  const attendee = { name: 'Sample attendee', timeZone: 'UTC', email: 'attendee@example.test' };
  const regular = { attendee, start: '2026-12-01T09:00:00Z', eventTypeId: 10 };
  const instant = { attendee, instant: true, eventTypeId: 20 };
  const recurring = { attendee, start: '2026-12-01T09:00:00Z', eventTypeId: 30, recurrenceCount: 3 };
  for (const input of [regular, instant, recurring]) {
    assert.deepEqual(await confirmCall(gw, { action, input }), {});
    assert.deepEqual(calls.at(-1).body, input);
  }
  assert.deepEqual(await gw.execute({ action, input: { instant: true } }),
    { status: 'invalid_arguments', field: 'attendee' });
  assert.deepEqual(await confirmCall(gw, { action, input: { attendee: {}, instant: true } }),
    { status: 'invalid_arguments', field: 'attendee.name' });
  assert.equal(calls.length, 3);
});

test('D2 sends a mixed event type ID as a string and repeats host usernames', async (t) => {
  const { gw, calls } = await fixture(t);
  const action = 'calcom.event-types.get';
  for (const eventTypeId of ['123', '5b894f24-c54f-4722-a99e-fc11e36416ff']) {
    assert.deepEqual(await gw.execute({ action, input: { eventTypeId } }), {});
    assert.equal(calls.at(-1).endpoint, `/v2/event-types/${eventTypeId}`);
  }
  assert.deepEqual(await gw.execute({ action, input: { eventTypeId: 123 } }),
    { status: 'invalid_arguments', field: 'eventTypeId' });
  assert.deepEqual(await gw.execute({ action: 'calcom.insights.get_booking_limits_usage',
    input: { scope: 'user', offset: 0, limit: 10, eventTypeId: '123' } }), {});
  assert.equal(calls.at(-1).body.eventTypeId, '123');

  const dates = { start: '2026-12-01', end: '2026-12-02' };
  const slots = 'calcom.slots.list';
  assert.deepEqual(await gw.execute({ action: slots, input: { ...dates, hostUsernames: ['alice', 'bob'] } }), {});
  assert.deepEqual(calls.at(-1).parameters.filter(({ name }) => name === 'hostUsernames'), [
    { name: 'hostUsernames', value: 'alice', type: 'query' },
    { name: 'hostUsernames', value: 'bob', type: 'query' },
  ]);
  assert.deepEqual(await gw.execute({ action: slots, input: { ...dates, hostUsernames: 'alice,bob' } }),
    { status: 'invalid_arguments', field: 'hostUsernames' });
  assert.equal(calls.length, 4);
});

test('D3 rejects null on a PATCH field and accepts its published type', async (t) => {
  const { gw, calls } = await fixture(t);
  const action = 'calcom.contacts.update';
  const id = '0192f3a1-7c2b-7d4e-9a10-000000000001';
  assert.deepEqual(await gw.execute({ action, input: { id, note: null } }),
    { status: 'invalid_arguments', field: 'note' });
  assert.equal(calls.length, 0);
  assert.deepEqual(await confirmCall(gw, { action, input: { id, note: '' } }), {});
  assert.deepEqual(calls[0].body, { note: '' });

  const calendar = 'calcom.calendars.update_event';
  const input = { calendar: 'google', eventUid: 'event-1', attendees: [{ email: 'person@example.test', optional: null }] };
  assert.deepEqual(await confirmCall(gw, { action: calendar, input }),
    { status: 'invalid_arguments', field: 'attendees[0].optional' });
  assert.equal(calls.length, 1);
});

test('D4 passes metadata keys intact and sends the routing response without a wrapper', async (t) => {
  const { gw, calls } = await fixture(t);
  const metadata = { department: 'Sales', 'custom key': 'example' };
  assert.deepEqual(await confirmCall(gw, { action: 'calcom.profile.update', input: { metadata } }), {});
  assert.deepEqual(calls[0].body, { metadata });

  const response = { email: 'person@example.test', department: 'Sales' };
  const input = { routingFormId: 'form-1', response, start: '2026-12-01', end: '2026-12-02' };
  assert.deepEqual(await gw.execute({ action: 'calcom.slots.calculate', input }), {});
  assert.equal(calls[1].endpoint, '/v2/routing-forms/form-1/calculate-slots');
  assert.deepEqual(calls[1].body, response);
  assert.deepEqual(calls[1].parameters, [
    { name: 'start', value: input.start, type: 'query' },
    { name: 'end', value: input.end, type: 'query' },
  ]);
});

test('D5 rejects a secret key on any workflow step before transport, including null', async (t) => {
  const { gw, calls } = await fixture(t);
  const webhook = { type: 'webhook', url: 'https://example.test/hook' };
  const email = { type: 'email_host' };
  for (const name of ['create', 'update']) {
    const action = `calcom.workflows.${name}`;
    const base = sample(manifest.modules.workflows.actions[name].input);
    for (const secret of [null, 'fake-value']) {
      const input = { ...base, steps: [email, { ...webhook, secret }] };
      assert.deepEqual(await confirmCall(gw, { action, input }), { status: 'invalid_arguments', field: 'steps' });
    }
    const input = { ...base, steps: [email, webhook] };
    assert.deepEqual(await confirmCall(gw, { action, input }), {});
    assert.deepEqual(calls.at(-1).body.steps, input.steps);
  }
  assert.equal(calls.length, 2);
});

test('D9 treats calendar disconnect as destructive and sends only after confirmation', async (t) => {
  const { gw, calls } = await fixture(t);
  const action = 'calcom.calendars.disconnect';
  const args = { action, input: sample(manifest.modules.calendars.actions.disconnect.input) };
  assert.equal(manifest.modules.calendars.actions.disconnect.risk, 'destructive');
  const stop = await gw.execute(args);
  assert.equal(stop.status, 'needs_confirmation');
  assert.equal(calls.length, 0);
  assert.deepEqual(await gw.execute({ ...args, confirm: true }), {});
  assert.equal(calls.length, 1);
  assert.equal(calls[0].endpoint, `/v2/calendars/${args.input.calendar}/disconnect`);
  assert.equal(calls[0].method, 'POST');
});

// Found live on 2026-11-23: modules named with an underscore loaded under --check, and every call
// to them was refused at the execute tool's action-id check. Every action id must pass the same
// tool-layer check a caller meets, for execute and for describe_action.
test('every action id passes the execute and describe_action argument checks', () => {
  const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
  const ids = Object.entries(manifest.modules).flatMap(([mod, def]) => Object.keys(def.actions).map((act) => `calcom.${mod}.${act}`));
  assert.equal(ids.length, 185);
  for (const action of ids) {
    assert.equal(validateArgs('execute', { action, input: {}, label: 'personal' }), null, action);
    assert.equal(validateArgs('describe_action', { action }), null, action);
  }
});

// Found on the Wiser endpoint on 2026-11-23: Cal.com returns Google event ids that begin with an
// underscore, and the shared path pattern refused them, so neither calendar event action could take
// an id Cal.com had just handed back. Both accept one now, and still refuse a path separator.
test('the calendar event actions accept a Google event id with a leading underscore and nothing path-like', () => {
  for (const action of ['calcom.calendars.get_event', 'calcom.calendars.update_event']) {
    const [, mod, name] = action.split('.');
    const pattern = new RegExp(manifest.modules[mod].actions[name].input.properties.eventUid.pattern);
    assert.equal(pattern.test('_6abc123def456ghi789jkl0mn1op2qr3st4uv5'), true, action);
    assert.equal(pattern.test('abc123_20261201T170000Z'), true, action);
    for (const bad of ['', '.', '..', 'a/b', 'a.b', 'a%2Fb', '-abc']) assert.equal(pattern.test(bad), false, `${action} ${bad}`);
  }
  const other = new RegExp(manifest.modules.bookings.actions.get.input.properties.bookingUid.pattern);
  assert.equal(other.test('_abc'), false, 'every other path id keeps the shared pattern');
});

// Adversarial review of 0.1.2: the id reaches Cal.com as one path segment, and a path-like id never leaves the gateway.
test('get_event sends an underscore id as one segment and refuses a path-like id before the proxy', async (t) => {
  const { gw, calls } = await fixture(t);
  const id = '_6abc123def456ghi789jkl0mn1op2qr3st4uv5';
  const result = await gw.execute({ action: 'calcom.calendars.get_event', input: { calendar: 'google', eventUid: id } });
  assert.notEqual(result.status, 'invalid_arguments');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].endpoint, `/v2/calendars/google/event/${id}`);
  for (const bad of ['..', 'a/b', 'a.b']) {
    const refused = await gw.execute({ action: 'calcom.calendars.get_event', input: { calendar: 'google', eventUid: bad } });
    assert.equal(refused.status, 'invalid_arguments', bad);
  }
  assert.equal(calls.length, 1);
});

// Adversarial review round 1, 2026-11-23: a calendar event's join codes travel beside its password.
test('a calendar event location withholds its password, PIN, access code and meeting code', async (t) => {
  const data = { status: 'success', data: { locations: [{ type: 'phone', url: 'tel:+15550100', password: 'fake-pw',
    pin: 'fake-pin', accessCode: 'fake-access', meetingCode: 'fake-meeting', label: 'Dial in' }] } };
  const { gw } = await fixture(t, { proxyRules: [{ match: () => true, result: { status: 200, data } }] });
  const result = await gw.execute({ action: 'calcom.calendars.get_event', input: { calendar: 'google', eventUid: 'event-1' } });
  assert.deepEqual(result.data.locations[0], { type: 'phone', url: 'tel:+15550100', password: null, pin: null,
    accessCode: null, meetingCode: null, label: 'Dial in' });
  assert.deepEqual(result.withheld.sort(), ['data.locations[0].accessCode', 'data.locations[0].meetingCode',
    'data.locations[0].password', 'data.locations[0].pin']);
});

// Found by the hosted service's Workers suites on 2026-11-23: index.js read manifest.json at load,
// and Cloudflare Workers has no filesystem, so every hosted connector failed to load.
test('the module loads without a filesystem and its inputs match the manifest', () => {
  for (const file of ['../index.js', '../routes.js']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /node:fs|['"]fs['"]|readFileSync|import\.meta\.url/, file);
  }
  const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
  for (const [mod, def] of Object.entries(manifest.modules)) {
    for (const [act, spec] of Object.entries(def.actions)) assert.deepEqual(inputs[`calcom.${mod}.${act}`], spec.input, `${mod}.${act}`);
  }
});
