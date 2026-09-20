import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestGateway, putActive } from '../../../gateway/test/fake-provider.js';
import { modules } from '../index.js';

const DIR = fileURLToPath(new URL('..', import.meta.url));
const ACTION = 'google-apis.translate.text';
const VALID = { text: ['Hello world'], target: 'de' };
const ENDPOINT = 'https://translation.googleapis.com/language/translate/v2';

const VENDOR = {
  data: {
    translations: [
      { translatedText: 'Hallo Welt', detectedSourceLanguage: 'en' },
    ],
  },
};

async function activeGateway() {
  const fixture = await createTestGateway();
  await putActive(fixture.store, fixture.fake, { service: 'google-apis', module: 'translate', privilege: 'read' });
  fixture.fake.catalog.execute = async () => assert.fail('proxy action used catalog execute');
  const calls = [];
  fixture.fake.auth.proxy = async (request) => {
    calls.push(request);
    return { status: 200, data: structuredClone(VENDOR), headers: { 'x-example': 'secret' } };
  };
  return { ...fixture, calls };
}

function run(gw, input, extra = {}) {
  return gw.execute({ action: ACTION, input, confirm: true, ...extra });
}

test('text needs_connect until the translate read grant is active', async () => {
  const { gw, fake } = await createTestGateway();
  fake.auth.proxy = fake.catalog.execute = async () => assert.fail('unconnected action reached transport');
  const result = await gw.execute({ action: ACTION, input: VALID });
  assert.equal(result.status, 'needs_connect');
  assert.equal(result.module, 'translate');
  assert.equal(result.privilege, 'read');
  assert.equal(fake.accounts.size, 0);
});

test('text needs_confirmation after the grant without confirm', async () => {
  const { gw, fake } = await activeGateway();
  fake.auth.proxy = async () => assert.fail('unconfirmed action reached transport');
  const result = await gw.execute({ action: ACTION, input: VALID });
  assert.equal(result.status, 'needs_confirmation');
  assert.equal(result.confirmation, 'once');
  assert.equal(result.risk, 'medium');
});

test('text with confirm uses an absolute GET proxy and exposes translations only', async () => {
  const { gw, calls } = await activeGateway();
  const result = await run(gw, VALID);
  assert.deepEqual(result.translations, VENDOR.data.translations);
  assert.equal(result.translations[0].detectedSourceLanguage, 'en');
  assert.equal(Object.hasOwn(result, 'data'), false);
  assert.equal(Object.hasOwn(result, 'headers'), false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'GET');
  const url = new URL(calls[0].endpoint);
  assert.equal(url.origin, 'https://translation.googleapis.com');
  assert.equal(url.pathname, '/language/translate/v2');
  assert.equal(calls[0].endpoint.startsWith(ENDPOINT), true);
  assert.deepEqual(url.searchParams.getAll('q'), VALID.text);
  assert.equal(url.searchParams.get('target'), 'de');
  assert.equal(url.searchParams.get('source'), null);
  assert.equal(url.searchParams.get('format'), null);
});

test('confirmation once lets a later call through without confirm', async () => {
  const { gw, calls } = await activeGateway();
  assert.equal((await gw.execute({ action: ACTION, input: VALID })).status, 'needs_confirmation');
  assert.equal(calls.length, 0);
  const first = await run(gw, VALID);
  assert.equal(first.translations[0].translatedText, 'Hallo Welt');
  const second = await gw.execute({ action: ACTION, input: VALID });
  assert.equal(second.status, undefined);
  assert.equal(second.translations[0].translatedText, 'Hallo Welt');
  assert.equal(calls.length, 2);
});

test('repeated text is one q query parameter per item', async () => {
  const { gw, calls } = await activeGateway();
  const text = ['Hello', 'Goodbye', 'Thanks'];
  const result = await run(gw, { text, target: 'fr', source: 'en', format: 'text' });
  assert.equal(result.translations[0].translatedText, 'Hallo Welt');
  assert.equal(calls.length, 1);
  const url = new URL(calls[0].endpoint);
  assert.equal(url.pathname, '/language/translate/v2');
  assert.deepEqual(url.searchParams.getAll('q'), text);
  assert.equal(url.searchParams.get('target'), 'fr');
  assert.equal(url.searchParams.get('source'), 'en');
  assert.equal(url.searchParams.get('format'), 'text');
  const query = calls[0].endpoint.split('?')[1];
  assert.equal([...query.matchAll(/(?:^|&)q=/g)].length, 3);
  assert.match(query, /q=Hello&q=Goodbye&q=Thanks/);
});

test('text accept cases reach the vendor encoded on the query string', async () => {
  const { gw, calls } = await activeGateway();
  const accepted = [
    ['Hello world'],
    [' leading'],
    ['one', 'two'],
    Array.from({ length: 128 }, (_, i) => `item ${i}`),
  ];
  for (const text of accepted) {
    const result = await run(gw, { text, target: 'de' });
    assert.equal(result.status, undefined);
    assert.deepEqual(new URL(calls.at(-1).endpoint).searchParams.getAll('q'), text);
  }
  assert.equal(calls.length, accepted.length);
});

test('text reject cases are refused before the proxy', async () => {
  const { gw, fake } = await activeGateway();
  fake.auth.proxy = async () => assert.fail('invalid text reached the proxy');
  const rejected = [
    {},
    { target: 'de' },
    { text: 'Hello world', target: 'de' },
    { text: [], target: 'de' },
    { text: [''], target: 'de' },
    { text: [' '], target: 'de' },
    { text: ['\t'], target: 'de' },
    { text: [1], target: 'de' },
    { text: [null], target: 'de' },
    { text: [{}], target: 'de' },
    { text: ['ok', ''], target: 'de' },
    { text: Array(1), target: 'de' },
    { text: Array.from({ length: 129 }, () => 'x'), target: 'de' },
  ];
  for (const input of rejected) {
    const result = await run(gw, input);
    assert.equal(result.status, 'invalid_arguments');
    assert.equal(result.field, 'text');
  }
});

test('target accepts well-formed tags and rejects malformed ones before transport', async () => {
  const { gw, calls } = await activeGateway();
  for (const target of ['en', 'en-US', 'zh-Hant-TW', 'es-419', 'de-CH-1901']) {
    const result = await run(gw, { ...VALID, target });
    assert.equal(result.status, undefined, `${target} should have reached the vendor`);
    assert.equal(new URL(calls.at(-1).endpoint).searchParams.get('target'), target);
  }
  const before = calls.length;
  for (const target of ['a', 'en-a', 'en-USA', '123', '', 'en-', '-en', 'en--US', 'en_US', 1, null, true]) {
    const result = await run(gw, { ...VALID, target });
    assert.equal(result.status, 'invalid_arguments', `${JSON.stringify(target)} should have been refused`);
    assert.equal(result.field, 'target');
  }
  assert.equal(calls.length, before, 'no malformed target reached transport');
});

test('source uses the same BCP 47 rule and is omitted when absent', async () => {
  const { gw, calls } = await activeGateway();
  const omitted = await run(gw, VALID);
  assert.equal(omitted.status, undefined);
  assert.equal(new URL(calls.at(-1).endpoint).searchParams.get('source'), null);
  for (const source of ['en', 'en-US', 'zh-Hant-TW', 'es-419', 'de-CH-1901']) {
    const result = await run(gw, { ...VALID, source });
    assert.equal(result.status, undefined, `${source} should have reached the vendor`);
    assert.equal(new URL(calls.at(-1).endpoint).searchParams.get('source'), source);
  }
  const before = calls.length;
  for (const source of ['a', 'en-a', 'en-USA', '123', '', 'en-', '-en', 'en--US', 'en_US', 1, null, true]) {
    const result = await run(gw, { ...VALID, source });
    assert.equal(result.status, 'invalid_arguments', `${JSON.stringify(source)} should have been refused`);
    assert.equal(result.field, 'source');
  }
  assert.equal(calls.length, before, 'no malformed source reached transport');
});

test('format enum rejection never reaches transport', async () => {
  const { gw, fake, calls } = await activeGateway();
  for (const format of ['text', 'html']) {
    const result = await run(gw, { ...VALID, format });
    assert.equal(result.status, undefined);
    assert.equal(new URL(calls.at(-1).endpoint).searchParams.get('format'), format);
  }
  fake.auth.proxy = async () => assert.fail('invalid format reached the proxy');
  for (const format of ['markdown', 'TEXT', '', 'plain', 1, null, true]) {
    const result = await run(gw, { ...VALID, format });
    assert.equal(result.status, 'invalid_arguments');
    assert.equal(result.field, 'format');
  }
});

test('undeclared keys and non-object input never reach transport', async () => {
  const { gw, fake } = await activeGateway();
  fake.auth.proxy = async () => assert.fail('invalid arguments reached the proxy');
  for (const input of [
    { ...VALID, purpose: 'example' },
    { ...VALID, q: 'Hello' },
    { ...VALID, model: 'nmt' },
  ]) {
    const result = await run(gw, input);
    assert.equal(result.status, 'invalid_arguments');
  }
  for (const input of [undefined, null, [], 'example', 1]) {
    assert.equal((await modules.translate.text(input, { proxy: async () => assert.fail('reached proxy') })).status, 'invalid_arguments');
  }
});

// Named for what it establishes and not for the broad claim. It proves the source
// names no credential surface and that one successful call returns and records none.
// It cannot prove the general case, which the module's imports and the gateway do.
test('the module source names no credential surface and a call returns none', async () => {
  const source = readFileSync(join(DIR, 'index.js'), 'utf8');
  for (const token of ['process.env', 'generic_api_key', 'X-Goog-Api-Key', 'readFileSync']) {
    assert.equal(source.includes(token), false, token);
  }
  const { gw, calls } = await activeGateway();
  const result = await run(gw, VALID);
  const dumped = JSON.stringify({ result, calls });
  assert.equal(/api[_-]?key|generic_api_key|AIza/i.test(dumped), false);
  assert.equal(Object.hasOwn(calls[0], 'headers'), false);
  assert.equal(Object.hasOwn(result, 'headers'), false);
});

test('module preserves gateway status objects untouched', async () => {
  for (const status of ['needs_connect', 'needs_provider_capability', 'vendor_error', 'denied']) {
    const result = { status };
    assert.equal(await modules.translate.text(VALID, { proxy: async () => result }), result);
  }
});

test('an envelope this module cannot read is a vendor_error, never the body', async () => {
  // Each of these reached the module as a success. None is a translations array, so
  // none may be returned: an unreadable body may be a vendor error body, and a
  // malformed one is not a translation.
  const unreadable = [
    { error: { code: 403, message: 'synthetic-private-response', key: 'AIza-example' } },
    { data: { error: { code: 403, message: 'synthetic-private-response' } } },
    { data: { translations: null } },
    { data: { translations: 'Hallo Welt' } },
    { data: {} },
    { translations: undefined },
    null,
    false,
    0,
    '',
    'synthetic-private-response',
    [{ translatedText: 'Hallo Welt' }],
  ];
  for (const data of unreadable) {
    const result = await modules.translate.text(VALID, {
      proxy: async () => ({ status: 200, data, headers: { 'x-example': 'secret' } }),
    });
    assert.equal(result.status, 'vendor_error', JSON.stringify(data));
    assert.equal(result.endpoint, ENDPOINT);
    assert.equal(result.method, 'GET');
    assert.equal(Object.hasOwn(result, 'data'), false);
    assert.equal(Object.hasOwn(result, 'headers'), false);
    const dumped = JSON.stringify(result);
    assert.equal(dumped.includes('synthetic-private-response'), false, JSON.stringify(data));
    assert.equal(dumped.includes('AIza-example'), false);
  }
});

test('a readable envelope yields translations and nothing else', async () => {
  const result = await modules.translate.text(VALID, {
    proxy: async () => ({
      status: 200,
      data: { data: { translations: [{ translatedText: 'Hallo Welt' }], quotaNote: 'synthetic-private-response' } },
      headers: { 'x-example': 'secret' },
    }),
  });
  assert.deepEqual(Object.keys(result), ['translations']);
  assert.deepEqual(result.translations, [{ translatedText: 'Hallo Welt' }]);
  assert.equal(JSON.stringify(result).includes('synthetic-private-response'), false);
});

test('an empty translations array is a success, not an unreadable envelope', async () => {
  const result = await modules.translate.text(VALID, {
    proxy: async () => ({ status: 200, data: { data: { translations: [] } }, headers: {} }),
  });
  assert.deepEqual(result, { translations: [] });
});

test('the BCP 47 subset is the one the comment documents', async () => {
  const { gw, calls } = await activeGateway();
  // Inside the subset, including one shape RFC 5646 forbids: a repeated variant. It is
  // admitted here and refused by the vendor, which is a vendor_error and not a wrong
  // translation. Recorded so a later reader does not read this as an oversight.
  for (const target of ['en', 'de-DE-1901-1901']) {
    assert.equal((await run(gw, { ...VALID, target })).status, undefined, target);
  }
  // Outside the subset on purpose: extlang, and an extension sequence. Both are valid
  // BCP 47 and neither means anything to a translator.
  const before = calls.length;
  for (const target of ['zh-cmn', 'en-US-u-ca-gregory']) {
    const result = await run(gw, { ...VALID, target });
    assert.equal(result.status, 'invalid_arguments', target);
    assert.equal(result.field, 'target');
  }
  // A trailing newline is refused. JavaScript's `$` without the `m` flag is strict
  // end-of-input, unlike the same expression read as Python.
  for (const target of ['en\n', 'en\r', 'en ']) {
    assert.equal((await run(gw, { ...VALID, target })).status, 'invalid_arguments', JSON.stringify(target));
  }
  assert.equal(calls.length, before, 'nothing outside the subset reached transport');
});

test('text carrying query and URL metacharacters round trips encoded', async () => {
  const { gw, calls } = await activeGateway();
  const text = ['a&target=fr', 'b#frag', 'c+plus', 'd%25', 'e=equals', 'ünïcøde 日本語', 'dup', 'dup'];
  const result = await run(gw, { text, target: 'de' });
  assert.equal(result.status, undefined);
  const url = new URL(calls.at(-1).endpoint);
  assert.deepEqual(url.searchParams.getAll('q'), text);
  assert.equal(url.searchParams.get('target'), 'de', 'an injected target did not displace the real one');
  assert.equal(url.origin + url.pathname, ENDPOINT);
});

test('gateway preserves proxy capability and vendor failure stops without the vendor body', async () => {
  const { gw, fake } = await activeGateway();
  fake.auth.proxy = async () => ({ supported: false });
  assert.equal((await run(gw, VALID)).status, 'needs_provider_capability');
  fake.auth.proxy = async ({ endpoint, method }) => ({
    status: 429,
    data: { error: { message: 'synthetic-private-response', key: 'AIza-example' } },
    error: { code: 'vendor_error', endpoint, method },
  });
  const result = await run(gw, VALID);
  assert.equal(result.status, 'vendor_error');
  assert.equal(Object.hasOwn(result, 'data'), false);
  assert.equal(Object.hasOwn(result, 'headers'), false);
  assert.equal(JSON.stringify(result).includes('synthetic-private-response'), false);
  assert.equal(JSON.stringify(result).includes('AIza-example'), false);
});

test('detected source language is left off when the vendor omits it', async () => {
  const { gw, fake } = await activeGateway();
  fake.auth.proxy = async () => ({
    status: 200,
    data: { data: { translations: [{ translatedText: 'Hallo Welt' }] } },
    headers: {},
  });
  const result = await run(gw, { ...VALID, source: 'en' });
  assert.deepEqual(result.translations, [{ translatedText: 'Hallo Welt' }]);
  assert.equal(Object.hasOwn(result.translations[0], 'detectedSourceLanguage'), false);
});
