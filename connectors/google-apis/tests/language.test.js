import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestGateway, putActive } from '../../../gateway/test/fake-provider.js';
import { modules } from '../index.js';

const DIR = fileURLToPath(new URL('..', import.meta.url));
const ACTION = 'google-apis.language.analyze';
const ANNOTATE_ENDPOINT = 'https://language.googleapis.com/v1/documents:annotateText';
const VALID = { content: 'Hello world.', type: 'PLAIN_TEXT' };

const ENCODING_TYPES = ['NONE', 'UTF8', 'UTF16', 'UTF32'];

const FEATURE_FLAGS = [
  ['extract_document_sentiment', 'extractDocumentSentiment'],
  ['extract_syntax', 'extractSyntax'],
  ['extract_entities', 'extractEntities'],
  ['extract_entity_sentiment', 'extractEntitySentiment'],
  ['classify_text', 'classifyText'],
  ['moderate_text', 'moderateText'],
];

const ANNOTATION = {
  language: 'en',
  documentSentiment: { magnitude: 0.8, score: 0.2 },
};

const FULL_ENVELOPE = {
  documentSentiment: { magnitude: 0.8, score: 0.2 },
  categories: [{ name: '/Computers & Electronics', confidence: 0.9 }],
  moderationCategories: [{ name: 'Toxic', confidence: 0.1 }],
  entities: [{ name: 'Google', type: 'ORGANIZATION' }],
  language: 'en',
  sentences: [{ text: { content: 'Hello world.', beginOffset: 0 } }],
  tokens: [{ text: { content: 'Hello' } }],
};

async function activeGateway(data = ANNOTATION) {
  const fixture = await createTestGateway();
  await putActive(fixture.store, fixture.fake, { service: 'google-apis', module: 'language', privilege: 'read' });
  fixture.fake.catalog.execute = async () => assert.fail('proxy action used catalog execute');
  const calls = [];
  fixture.fake.auth.proxy = async (request) => {
    calls.push(request);
    return { status: 200, data: structuredClone(data), headers: { 'x-example': 'secret' } };
  };
  return { ...fixture, calls };
}

function run(gw, input, extra = {}) {
  return gw.execute({ action: ACTION, input, confirm: true, ...extra });
}

function analyze(input, data) {
  return modules.language.analyze(input, {
    proxy: async () => ({ status: 200, data, headers: { 'x-example': 'secret' } }),
  });
}

function matchesSchema(schema, value) {
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!schema.properties || !Object.hasOwn(schema.properties, key)) return false;
      }
    }
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (!Object.hasOwn(value, key)) return false;
      }
    }
    for (const [key, child] of Object.entries(schema.properties ?? {})) {
      if (Object.hasOwn(value, key) && !matchesSchema(child, value[key])) return false;
    }
    return true;
  }
  if (schema.type === 'string') {
    if (typeof value !== 'string') return false;
    if (schema.enum && !schema.enum.includes(value)) return false;
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) return false;
    if (schema.minLength !== undefined && value.length < schema.minLength) return false;
    return true;
  }
  if (schema.type === 'boolean') return typeof value === 'boolean';
  return false;
}

test('analyze needs_connect until the language read grant is active', async () => {
  const { gw, fake } = await createTestGateway();
  fake.auth.proxy = fake.catalog.execute = async () => assert.fail('unconnected action reached transport');
  const result = await gw.execute({ action: ACTION, input: VALID });
  assert.equal(result.status, 'needs_connect');
  assert.equal(result.module, 'language');
  assert.equal(result.privilege, 'read');
  assert.equal(fake.accounts.size, 0);
});

test('analyze needs_confirmation after the grant without confirm', async () => {
  const { gw, fake } = await activeGateway();
  fake.auth.proxy = async () => assert.fail('unconfirmed action reached transport');
  const result = await gw.execute({ action: ACTION, input: VALID });
  assert.equal(result.status, 'needs_confirmation');
  assert.equal(result.confirmation, 'once');
  assert.equal(result.risk, 'medium');
});

test('analyze with confirm uses an absolute POST proxy and sends only supplied keys', async () => {
  const { gw, calls } = await activeGateway();
  const result = await run(gw, VALID);
  assert.equal(result.language, ANNOTATION.language);
  assert.deepEqual(result.documentSentiment, ANNOTATION.documentSentiment);
  assert.equal(Object.hasOwn(result, 'data'), false);
  assert.equal(Object.hasOwn(result, 'headers'), false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].endpoint, ANNOTATE_ENDPOINT);
  assert.deepEqual(calls[0].body, {
    document: { type: VALID.type, content: VALID.content },
    features: {},
  });
  assert.deepEqual(Object.keys(calls[0].body), ['document', 'features']);
  assert.deepEqual(Object.keys(calls[0].body.document), ['type', 'content']);
  assert.deepEqual(Object.keys(calls[0].body.features), []);
  assert.equal(Object.hasOwn(calls[0].body.document, 'gcsContentUri'), false);
  assert.equal(Object.hasOwn(calls[0].body, 'encodingType'), false);
});

test('confirmation once lets a later analyze through without confirm', async () => {
  const { gw, calls } = await activeGateway();
  assert.equal((await gw.execute({ action: ACTION, input: VALID })).status, 'needs_confirmation');
  assert.equal(calls.length, 0);
  const first = await run(gw, VALID);
  assert.equal(first.language, ANNOTATION.language);
  const second = await gw.execute({ action: ACTION, input: VALID });
  assert.equal(second.status, undefined);
  assert.equal(second.language, ANNOTATION.language);
  assert.equal(calls.length, 2);
});

test('supplied optional fields map onto the vendor body and unsupplied keys are omitted', async () => {
  const { gw, calls } = await activeGateway();
  const input = {
    content: '<p>Hello</p>',
    type: 'HTML',
    language_code: 'en-GB',
    encoding_type: 'UTF8',
    extract_document_sentiment: true,
    extract_syntax: false,
    extract_entities: true,
    extract_entity_sentiment: false,
    classify_text: true,
    moderate_text: false,
    classification_model_options: { v2Model: { contentCategoriesVersion: 'V2' } },
  };
  const result = await run(gw, input);
  assert.equal(result.status, undefined);
  assert.deepEqual(calls[0].body, {
    document: { type: 'HTML', content: '<p>Hello</p>', language: 'en-GB' },
    features: {
      extractDocumentSentiment: true,
      extractSyntax: false,
      extractEntities: true,
      extractEntitySentiment: false,
      classifyText: true,
      moderateText: false,
      classificationModelOptions: { v2Model: { contentCategoriesVersion: 'V2' } },
    },
    encodingType: 'UTF8',
  });
});

test('a call supplying no feature flags is accepted and sends features: {}', async () => {
  const { gw, calls } = await activeGateway();
  const result = await run(gw, VALID);
  assert.equal(result.status, undefined);
  assert.deepEqual(calls[0].body.features, {});
});

test('an empty-string content is accepted and reaches the vendor', async () => {
  const { gw, calls } = await activeGateway();
  const result = await run(gw, { content: '', type: 'PLAIN_TEXT' });
  assert.equal(result.status, undefined);
  assert.equal(calls[0].body.document.content, '');
});

test('type accepts PLAIN_TEXT and HTML and refuses TYPE_UNSPECIFIED, the deliberate opposite of speech accepting ENCODING_UNSPECIFIED', async () => {
  const { gw, fake, calls } = await activeGateway();
  for (const type of ['PLAIN_TEXT', 'HTML']) {
    const result = await run(gw, { content: 'Hello.', type });
    assert.equal(result.status, undefined, type);
    assert.equal(calls.at(-1).body.document.type, type);
  }
  fake.auth.proxy = async () => assert.fail('invalid type reached the proxy');
  for (const type of ['TYPE_UNSPECIFIED', 'TEXT', 'plain_text', 'html', '', 1, null, true]) {
    const result = await run(gw, { content: 'Hello.', type });
    assert.equal(result.status, 'invalid_arguments', JSON.stringify(type));
    assert.equal(result.field, 'type');
  }
  assert.equal(calls.length, 2);
});

test('every one of the six booleans maps to its own camelCase vendor key', async () => {
  const { gw, fake, calls } = await activeGateway();
  for (const [from, to] of FEATURE_FLAGS) {
    const result = await run(gw, { ...VALID, [from]: true });
    assert.equal(result.status, undefined, from);
    assert.equal(calls.at(-1).body.features[to], true);
    assert.deepEqual(Object.keys(calls.at(-1).body.features), [to]);
  }
  fake.auth.proxy = async () => assert.fail('invalid boolean reached the proxy');
  for (const [from] of FEATURE_FLAGS) {
    for (const value of ['true', 1, 0, null, 'false']) {
      const flagged = await run(gw, { ...VALID, [from]: value });
      assert.equal(flagged.status, 'invalid_arguments', `${from}=${String(value)}`);
      assert.equal(flagged.field, from);
    }
  }
  assert.equal(calls.length, FEATURE_FLAGS.length);
});

test('all four encoding_type members are accepted, NONE among them', async () => {
  const { gw, fake, calls } = await activeGateway();
  for (const encoding_type of ENCODING_TYPES) {
    const result = await run(gw, { ...VALID, encoding_type });
    assert.equal(result.status, undefined, encoding_type);
    assert.equal(calls.at(-1).body.encodingType, encoding_type);
  }
  fake.auth.proxy = async () => assert.fail('invalid encoding_type reached the proxy');
  for (const encoding_type of ['ENCODING_UNSPECIFIED', 'UTF-8', 'utf8', '', 1, null, true]) {
    const result = await run(gw, { ...VALID, encoding_type });
    assert.equal(result.status, 'invalid_arguments', JSON.stringify(encoding_type));
    assert.equal(result.field, 'encoding_type');
  }
  assert.equal(calls.length, ENCODING_TYPES.length);
});

test('language_code accepts a BCP 47 tag and a bare ISO code, and refuses a non-tag', async () => {
  const { gw, fake, calls } = await activeGateway();
  for (const language_code of ['en-US', 'en', 'zh-Hant-TW']) {
    const result = await run(gw, { ...VALID, language_code });
    assert.equal(result.status, undefined, language_code);
    assert.equal(calls.at(-1).body.document.language, language_code);
  }
  fake.auth.proxy = async () => assert.fail('invalid language_code reached the proxy');
  for (const language_code of ['a', 'en-a', 'en-USA', '123', '', 'en-', '-en', 'en--US', 'en_US', 1, null, true]) {
    const result = await run(gw, { ...VALID, language_code });
    assert.equal(result.status, 'invalid_arguments', JSON.stringify(language_code));
    assert.equal(result.field, 'language_code');
  }
  assert.equal(calls.length, 3);
});

test('classification_model_options accepts the three nested shapes and refuses unknown keys at each level', async () => {
  const { gw, fake, calls } = await activeGateway();
  const accepted = [
    { v1Model: {} },
    { v2Model: {} },
    { v2Model: { contentCategoriesVersion: 'V2' } },
  ];
  for (const classification_model_options of accepted) {
    const result = await run(gw, { ...VALID, classification_model_options });
    assert.equal(result.status, undefined, JSON.stringify(classification_model_options));
    assert.deepEqual(calls.at(-1).body.features.classificationModelOptions, classification_model_options);
  }
  fake.auth.proxy = async () => assert.fail('invalid classification_model_options reached the proxy');
  const rejected = [
    { extra: {} },
    { v1Model: {}, extra: true },
    { v1Model: { extra: true } },
    { v2Model: { extra: true } },
    { v2Model: { contentCategoriesVersion: 'V3' } },
    { v2Model: { contentCategoriesVersion: 'CONTENT_CATEGORIES_VERSION_UNSPECIFIED', extra: true } },
    [],
    'v1',
    1,
    null,
    true,
  ];
  for (const classification_model_options of rejected) {
    const result = await run(gw, { ...VALID, classification_model_options });
    assert.equal(result.status, 'invalid_arguments', JSON.stringify(classification_model_options));
    assert.equal(result.field, 'classification_model_options');
  }
  assert.equal(calls.length, accepted.length);
});

test('classification_model_options is accepted without classify_text and is forwarded nested', async () => {
  const { gw, calls } = await activeGateway();
  const classification_model_options = { v1Model: {} };
  const result = await run(gw, { ...VALID, classification_model_options });
  assert.equal(result.status, undefined);
  assert.equal(Object.hasOwn(calls[0].body.features, 'classifyText'), false);
  assert.deepEqual(calls[0].body.features.classificationModelOptions, classification_model_options);
});

test('required fields missing are refused by name before the proxy', async () => {
  const { gw, fake } = await activeGateway();
  fake.auth.proxy = async () => assert.fail('invalid input reached the proxy');
  const { content, ...withoutContent } = VALID;
  const missingContent = await run(gw, withoutContent);
  assert.equal(missingContent.status, 'invalid_arguments');
  assert.equal(missingContent.field, 'content');
  const { type, ...withoutType } = VALID;
  const missingType = await run(gw, withoutType);
  assert.equal(missingType.status, 'invalid_arguments');
  assert.equal(missingType.field, 'type');
  for (const value of [1, null, true, {}, []]) {
    const result = await run(gw, { content: value, type: 'PLAIN_TEXT' });
    assert.equal(result.status, 'invalid_arguments', JSON.stringify(value));
    assert.equal(result.field, 'content');
  }
});

test('undeclared keys and non-object input never reach transport', async () => {
  const { gw, fake } = await activeGateway();
  fake.auth.proxy = async () => assert.fail('invalid arguments reached the proxy');
  for (const input of [
    { ...VALID, purpose: 'example' },
    { ...VALID, gcsContentUri: 'gs://bucket/object' },
    { ...VALID, uri: 'gs://bucket/object' },
  ]) {
    const result = await run(gw, input);
    assert.equal(result.status, 'invalid_arguments');
  }
  const extra = await run(gw, { ...VALID, extra: true });
  assert.equal(extra.status, 'invalid_arguments');
  assert.equal(extra.field, 'extra');
  for (const input of [undefined, null, [], 'example', 1]) {
    assert.equal(
      (await modules.language.analyze(input, { proxy: async () => assert.fail('reached proxy') })).status,
      'invalid_arguments',
    );
  }
});

test('readAnnotation returns an empty object unchanged as a success', async () => {
  const empty = await analyze(VALID, {});
  assert.deepEqual(empty, {});
});

test('readAnnotation returns a full seven-key envelope unchanged', async () => {
  const full = await analyze(VALID, FULL_ENVELOPE);
  assert.deepEqual(full, FULL_ENVELOPE);
  const wrapped = await modules.language.analyze(VALID, {
    proxy: async () => ({ status: 200, data: structuredClone(FULL_ENVELOPE), headers: {} }),
  });
  assert.deepEqual(wrapped, FULL_ENVELOPE);
});

test('an envelope analyze cannot read is a vendor_error, never the body', async () => {
  const unreadable = [
    { error: { code: 403, message: 'synthetic-private-response', key: 'AIza-example' } },
    { data: { error: { code: 403, message: 'synthetic-private-response' } } },
    { entities: 'not-an-array' },
    { entities: null },
    { undocumented: true },
    { language: 'en', extra: 'synthetic-private-response' },
    { quotaNote: 'synthetic-private-response' },
    null,
    false,
    0,
    '',
    'synthetic-private-response',
    [{ language: 'en' }],
  ];
  for (const data of unreadable) {
    const result = await modules.language.analyze(VALID, {
      proxy: async () => ({ status: 200, data, headers: { 'x-example': 'secret' } }),
    });
    assert.equal(result.status, 'vendor_error', JSON.stringify(data));
    assert.equal(result.endpoint, ANNOTATE_ENDPOINT);
    assert.equal(result.method, 'POST');
    assert.equal(Object.hasOwn(result, 'data'), false);
    assert.equal(Object.hasOwn(result, 'headers'), false);
    const dumped = JSON.stringify(result);
    assert.equal(dumped.includes('synthetic-private-response'), false, JSON.stringify(data));
    assert.equal(dumped.includes('AIza-example'), false);
  }
});

// Raised by adversarial review on 2026-09-19 and upheld: the reader typed the five
// array members and neither of the two that are not arrays, so `{ language: 42 }`
// came back to the caller as a successful annotation. This reader reads what the
// **vendor** returns, which is the direction where too loose is the defect.
test('the two non-array response members are typed without being required', async () => {
  const wrongTypes = [
    { language: 42 },
    { language: null },
    { language: ['en'] },
    { documentSentiment: 'broken' },
    { documentSentiment: null },
    { documentSentiment: [0.5] },
    { language: 'en', documentSentiment: 3 },
  ];
  for (const data of wrongTypes) {
    const result = await modules.language.analyze(VALID, {
      proxy: async () => ({ status: 200, data, headers: {} }),
    });
    assert.equal(result.status, 'vendor_error', JSON.stringify(data));
    assert.equal(result.endpoint, ANNOTATE_ENDPOINT);
    assert.equal(result.method, 'POST');
    assert.equal(Object.hasOwn(result, 'data'), false);
  }
  // Absent is not wrong: every member is conditional on a feature flag, so a
  // response omitting both is the ordinary shape and must still be a success.
  const wellTyped = [
    {},
    { language: 'en' },
    { documentSentiment: { score: 0.8, magnitude: 0.8 } },
    { language: 'en', documentSentiment: { score: -0.2, magnitude: 1.4 }, entities: [] },
  ];
  for (const data of wellTyped) {
    const result = await modules.language.analyze(VALID, {
      proxy: async () => ({ status: 200, data: structuredClone(data), headers: {} }),
    });
    assert.deepEqual(result, data, JSON.stringify(data));
  }
});

test('a string payload is a vendor_error and carries no body', async () => {
  const result = await modules.language.analyze(VALID, {
    proxy: async () => 'synthetic-private-response',
  });
  assert.equal(result.status, 'vendor_error');
  assert.equal(result.endpoint, ANNOTATE_ENDPOINT);
  assert.equal(result.method, 'POST');
  assert.equal(JSON.stringify(result).includes('synthetic-private-response'), false);
});

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
    assert.equal(await modules.language.analyze(VALID, { proxy: async () => result }), result);
  }
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

test('the published input schema matches the module and the BCP47 source cannot drift', async () => {
  const source = readFileSync(join(DIR, 'index.js'), 'utf8');
  const match = source.match(/const BCP47 = \/(\^.*\$)\//);
  assert.ok(match, 'BCP47 constant source is present');
  const manifest = JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf8'));
  const schema = manifest.modules.language.actions.analyze.input;
  assert.equal(schema.properties.language_code.pattern, match[1]);
  assert.equal(Object.hasOwn(schema.properties.content, 'minLength'), false);
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, ['content', 'type']);
  assert.deepEqual(schema.properties.type.enum, ['PLAIN_TEXT', 'HTML']);
  assert.deepEqual(schema.properties.encoding_type.enum, ['NONE', 'UTF8', 'UTF16', 'UTF32']);
  assert.equal(schema.properties.classification_model_options.additionalProperties, false);
  assert.equal(schema.properties.classification_model_options.properties.v1Model.additionalProperties, false);
  assert.equal(schema.properties.classification_model_options.properties.v2Model.additionalProperties, false);
  assert.deepEqual(
    schema.properties.classification_model_options.properties.v2Model.properties.contentCategoriesVersion.enum,
    ['CONTENT_CATEGORIES_VERSION_UNSPECIFIED', 'V1', 'V2'],
  );

  const accepted = [
    VALID,
    { content: '', type: 'PLAIN_TEXT' },
    { content: 'Hello.', type: 'HTML' },
    { ...VALID, language_code: 'en' },
    { ...VALID, language_code: 'en-US' },
    { ...VALID, encoding_type: 'NONE' },
    { ...VALID, encoding_type: 'UTF32' },
    { ...VALID, extract_document_sentiment: false },
    { ...VALID, extract_syntax: true },
    { ...VALID, extract_entities: true },
    { ...VALID, extract_entity_sentiment: false },
    { ...VALID, classify_text: true },
    { ...VALID, moderate_text: false },
    { ...VALID, classification_model_options: { v1Model: {} } },
    { ...VALID, classification_model_options: { v2Model: {} } },
    { ...VALID, classification_model_options: { v2Model: { contentCategoriesVersion: 'V2' } } },
  ];
  for (const input of accepted) {
    assert.equal(matchesSchema(schema, input), true, JSON.stringify(input));
  }

  const refused = [
    { type: 'PLAIN_TEXT' },
    { content: 'Hello.' },
    { ...VALID, type: 'TYPE_UNSPECIFIED' },
    { ...VALID, language_code: 'en-a' },
    { ...VALID, encoding_type: 'UTF-8' },
    { ...VALID, extra: true },
    { ...VALID, gcsContentUri: 'gs://bucket/object' },
    { ...VALID, extract_syntax: 'true' },
    { ...VALID, classification_model_options: { extra: {} } },
    { ...VALID, classification_model_options: { v1Model: { extra: true } } },
    { ...VALID, classification_model_options: { v2Model: { extra: true } } },
    { ...VALID, classification_model_options: { v2Model: { contentCategoriesVersion: 'V3' } } },
  ];
  for (const input of refused) {
    assert.equal(matchesSchema(schema, input), false, JSON.stringify(input));
  }
});
