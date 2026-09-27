import { createHash } from 'node:crypto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  composeSummary,
  discloseInput,
  escapeForDisplay,
  renderValue,
  violatedKeyword,
  SUMMARY_CAP,
  VALUE_CAP,
} from '../src/disclosure.js';

// Every case runs against the real shipped manifest rather than a fixture, so a
// manifest that moves breaks these rather than passing a test of its own copy.
const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(
  readFileSync(join(here, '..', '..', 'connectors', 'google-cloud', 'manifest.json'), 'utf8'),
);
const servicesEnable = manifest.modules.services.actions.enable;
const keysPatch = manifest.modules.keys.actions.patch;

/**
 * The oracle is written from the policy's stated Unicode PROPERTIES, not from the
 * implementation's expression. That is what makes it independent now: a hand list
 * can only repeat whatever its author thought of, and two hand lists written by the
 * same author repeat the same omissions. Adversarial review found exactly that twice
 * — U+2028 in round one, U+2060 in round two — which is why the definition moved to
 * properties Unicode maintains.
 */
function isUnsafeByPolicy(ch) {
  return /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}]/u.test(ch);
}

/**
 * Does this rendered output still carry any code point the policy calls unsafe?
 * `for..of` yields an unpaired surrogate as itself, so one pass is enough; an
 * earlier comment here claimed otherwise and added a second loop that never fired.
 */
function carriesRawUnsafe(text) {
  for (const ch of text) if (isUnsafeByPolicy(ch)) return ch;
  return null;
}

/** Quotes preceded by an even run of backslashes: the real field delimiters. */
function countDelimiters(text) {
  let count = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '"') continue;
    let backslashes = 0;
    for (let j = i - 1; j >= 0 && text[j] === '\\'; j -= 1) backslashes += 1;
    if (backslashes % 2 === 0) count += 1;
  }
  return count;
}

test('the delimiter counter itself is right, including after a trailing backslash', () => {
  assert.equal(countDelimiters('a="b"'), 2);
  assert.equal(countDelimiters('a="b\\\\"'), 2, 'an escaped backslash leaves the quote a delimiter');
  assert.equal(countDelimiters('a="b\\""'), 2, 'an escaped quote is not a delimiter');
});

function summaryFor(action, id, input) {
  const disclosure = discloseInput(action, input);
  return {
    disclosure,
    summary: composeSummary({
      action: id,
      service: 'google-cloud',
      module: id.split('.')[1],
      risk: action.risk,
      description: action.description,
      disclosure,
    }),
  };
}

test('the shipped action this build exists for still declares what the policy assumes', () => {
  assert.equal(servicesEnable.confirmation, 'always');
  assert.equal(servicesEnable.input.properties.service.pattern, '^[^\\s/]+$');
  assert.equal(keysPatch.input.properties.restrictions.type, 'object');
});

// ---------------------------------------------------------------- the target

test('services.enable displays its project and its service, correct and within the caps', () => {
  const { summary, disclosure } = summaryFor(servicesEnable, 'google-cloud.services.enable', {
    project: 'wiser-method-prod',
    service: 'translate.googleapis.com',
  });
  assert.deepEqual(disclosure.shown.map((f) => f.name), ['project', 'service']);
  assert.match(summary, /project="wiser-method-prod"/);
  assert.match(summary, /service="translate\.googleapis\.com"/);
  assert.ok(summary.length <= SUMMARY_CAP);
  assert.equal(disclosure.shown.filter((f) => f.truncated).length, 0);
  assert.deepEqual(disclosure.withheld, []);
  assert.doesNotMatch(summary, /not shown/);
});

test('keys.patch renders restrictions in full, keys in input order', () => {
  const { summary, disclosure } = summaryFor(keysPatch, 'google-cloud.keys.patch', {
    project: 'wiser-method-prod',
    key_id: 'abc-123',
    restrictions: { apiTargets: [{ service: 'translate.googleapis.com' }] },
  });
  assert.deepEqual(disclosure.shown.map((f) => f.name), ['project', 'key_id', 'restrictions']);
  assert.equal(
    disclosure.shown.find((f) => f.name === 'restrictions').text,
    '{"apiTargets": [{"service": "translate.googleapis.com"}]}',
  );
  assert.match(summary, /restrictions=\{"apiTargets": \[\{"service": "translate\.googleapis\.com"\}\]\}/);
  assert.doesNotMatch(summary, /the content of restrictions is not shown/);
  assert.equal(disclosure.shown.find((f) => f.name === 'restrictions').truncated, false);
  assert.equal(Object.hasOwn(disclosure.shown.find((f) => f.name === 'restrictions'), 'full'), false);
});

// ------------------------------------------------------------ forged structure

test('a value cannot forge another field, which needs no control character at all', () => {
  // Adversarial review, finding 1. `^[^/]+$` admits a double quote, values render
  // quoted, and clauses join with a comma, so without escaping the quote this
  // printed an apparent second field.
  const payload = 'abc", project="other-project';
  assert.ok(new RegExp(keysPatch.input.properties.key_id.pattern).test(payload),
    'the fixture must be pattern-valid or it proves nothing');
  const { summary, disclosure } = summaryFor(keysPatch, 'google-cloud.keys.patch', {
    project: 'wiser-method-prod',
    key_id: payload,
    restrictions: {},
  });
  assert.equal(disclosure.shown.length, 3);
  // The payload's text survives, escaped, which is honest. What must not survive is
  // its STRUCTURE. A quote is a delimiter only when an EVEN number of backslashes
  // precedes it; `(?<!\\)"` got that wrong for a value ending in a backslash, which
  // adversarial review found, so parity is counted rather than lookbehind.
  assert.equal(countDelimiters(summary), 4, 'the payload opened or closed a field');
  assert.match(summary, /key_id="abc\\", project=\\"other-project"/);
  assert.doesNotMatch(summary, /(?<!\\)"other-project"/);
  assert.doesNotMatch(summary, /(?<!\\)"other-project"/);
  assert.match(summary, /key_id="abc\\", project=\\"other-project"/);
});

test('a backslash is escaped, so an escape in the output is unambiguous', () => {
  assert.equal(escapeForDisplay('a\\x1bb'), 'a\\\\x1bb');
  assert.equal(escapeForDisplay('say "hi"'), 'say \\"hi\\"');
});

// ----------------------------------------------------------- unsafe characters

test('every code point the policy calls unsafe is escaped, swept across the whole BMP and beyond', () => {
  let checked = 0;
  const check = (code) => {
    const ch = String.fromCodePoint(code);
    if (!isUnsafeByPolicy(ch)) return;
    checked += 1;
    assert.equal(carriesRawUnsafe(escapeForDisplay(`a${ch}b`)), null,
      `U+${code.toString(16)} survived raw`);
  };
  for (let code = 0; code <= 0xffff; code += 1) check(code);
  for (let code = 0xe0000; code <= 0xe01ff; code += 1) check(code);
  for (let code = 0x1d173; code <= 0x1d17a; code += 1) check(code);
  // The named regressions from two review rounds, asserted by name so a later
  // change to the predicate cannot quietly drop them.
  for (const ch of ['\u2028', '\u2029', '\u2060', '\u00ad', '\u200c', '\u200d',
    '\ufe0f', '\u061c', '\ufeff', '\u202e', '\u0000', '\u001b', '\u007f', '\u009b']) {
    assert.ok(isUnsafeByPolicy(ch), `U+${ch.codePointAt(0).toString(16)} must be in the set`);
    assert.equal(carriesRawUnsafe(escapeForDisplay(`a${ch}b`)), null);
  }
  assert.ok(checked > 2000, `expected a large set; checked ${checked}`);
  // And legitimate text is left alone.
  for (const keep of ['caf\u00e9', '\u{1f600}', '\u4e2d\u6587', 'Stra\u00dfe']) {
    assert.equal(escapeForDisplay(keep), keep);
  }
});

test('a lone surrogate is escaped and a valid pair is left alone', () => {
  const lone = 'a\ud800b';
  assert.equal(carriesRawUnsafe(escapeForDisplay(lone)), null);
  assert.match(escapeForDisplay(lone), /\\ud800/);
  assert.equal(escapeForDisplay('a\u{1f600}b'), 'a\u{1f600}b');
});

test('a pattern-valid terminal control sequence is escaped: services.enable, which admits ESC', () => {
  // `^[^\s/]+$` rejects TAB, LF and CR through `\s`, and JS `$` anchors at the true
  // end of the string, so no newline reaches this field. ESC, NUL and DEL are not
  // whitespace and pass untouched. That is why the renderer cannot trust the schema.
  const hostile = 'trans\u001b[31mlate.googleapis.com';
  assert.ok(new RegExp(servicesEnable.input.properties.service.pattern).test(hostile));
  const { summary } = summaryFor(servicesEnable, 'google-cloud.services.enable', {
    project: 'wiser-method-prod',
    service: hostile,
  });
  assert.equal(carriesRawUnsafe(summary), null);
  assert.match(summary, /\\x1b/);
});

test('a pattern-valid newline is escaped: keys.patch, whose key_id admits every character but a slash', () => {
  const hostile = 'key\u001b[31m-1\nSECOND LINE\tand a tab\u2028and a separator';
  assert.ok(new RegExp(keysPatch.input.properties.key_id.pattern).test(hostile));
  const { summary } = summaryFor(keysPatch, 'google-cloud.keys.patch', {
    project: 'wiser-method-prod', key_id: hostile, restrictions: {},
  });
  assert.equal(carriesRawUnsafe(summary), null);
  for (const esc of [/\\x1b/, /\\x0a/, /\\x09/, /\\u2028/]) assert.match(summary, esc);
});

test('the two patterns differ, and a policy written against one would be wrong about the other', () => {
  const svc = new RegExp(servicesEnable.input.properties.service.pattern);
  const key = new RegExp(keysPatch.input.properties.key_id.pattern);
  for (const ch of ['\t', '\n', '\r']) {
    assert.equal(svc.test(`a${ch}b`), false, 'services.enable excludes whitespace');
    assert.equal(key.test(`a${ch}b`), true, 'keys.patch does not');
  }
  for (const ch of ['\u001b', '\u0000', '\u007f']) {
    assert.equal(svc.test(`a${ch}b`), true, 'neither pattern excludes a non-whitespace control');
    assert.equal(key.test(`a${ch}b`), true);
  }
});

// ------------------------------------------------------------------ truncation

test('a value at the cap renders whole and one above it is marked with its true length', () => {
  const at = renderValue('a'.repeat(VALUE_CAP));
  const over = renderValue('a'.repeat(VALUE_CAP + 1));
  assert.equal(at.truncated, false);
  assert.equal(at.text, `"${'a'.repeat(VALUE_CAP)}"`);
  assert.equal(over.truncated, true);
  assert.match(over.text, new RegExp(`\\(${VALUE_CAP + 1} characters total, sha256:[0-9a-f]{16}\\)`));
});

test('two values that truncate to the same prefix AND the same length are still distinguishable', () => {
  // Adversarial review, finding 2. Neither target field declares a maxLength, so a
  // target can truncate; the earlier draft accepted collision on the false premise
  // that it could not. The digest is what retires that.
  const prefix = 'a'.repeat(VALUE_CAP);
  const first = renderValue(`${prefix}XYZ`);
  const second = renderValue(`${prefix}QRS`);
  assert.equal(first.length, second.length);
  assert.notEqual(first.text, second.text, 'same length and same prefix must still differ');
  assert.equal(renderValue(`${prefix}XYZ`).text, first.text, 'and the digest must be stable');
});

test('truncation never cuts an escape token in half', () => {
  // 119 ASCII then ESC: the escape costs 4 characters and only 1 remains.
  const value = `${'a'.repeat(VALUE_CAP - 1)}\u001b`;
  const rendered = renderValue(value);
  assert.equal(rendered.truncated, true);
  assert.equal(carriesRawUnsafe(rendered.text), null);
  assert.doesNotMatch(rendered.text, /\\x1?"/, 'a half-written escape reached the output');
  assert.doesNotMatch(rendered.text, /\\"\u2026/, 'a half-written escape reached the output');
});

test('truncation never splits a surrogate pair', () => {
  const value = `${'a'.repeat(VALUE_CAP - 1)}\u{1f600}bbbb`;
  const rendered = renderValue(value);
  assert.equal(rendered.truncated, true);
  assert.equal(carriesRawUnsafe(rendered.text), null);
});

test('escapes are measured against the cap, so a value of escapes cannot slip past it', () => {
  const rendered = renderValue('\u001b'.repeat(VALUE_CAP));
  assert.equal(rendered.truncated, true);
  assert.equal(rendered.length, VALUE_CAP);
  assert.equal(carriesRawUnsafe(rendered.text), null);
});

// --------------------------------------------------------------- summary budget

test('a long description can never push out the sentence saying what is not shown', () => {
  // Adversarial review, finding 5. The warning clauses are reserved before the
  // description gets any budget at all. The nested-content clause is gone;
  // a withheld scalar and an undeclared key are the warnings that remain.
  const disclosure = discloseInput(servicesEnable, {
    project: 'Not A Valid Project', service: 'translate.googleapis.com', extra_key: 'v',
  });
  const summary = composeSummary({
    action: 'google-cloud.services.enable',
    service: 'google-cloud',
    module: 'services',
    risk: 'high',
    description: 'd'.repeat(SUMMARY_CAP * 3),
    disclosure,
  });
  assert.ok(summary.length <= SUMMARY_CAP);
  assert.match(summary, /project was supplied and is not shown, because it fails its own pattern/);
  assert.match(summary, /1 undeclared field not shown/);
  assert.match(summary, /risk high/);
  assert.match(summary, /\u2026$/);
});

test('a field that does not fit the summary is counted, never cut', () => {
  const action = {
    risk: 'high',
    confirmation: 'always',
    input: { properties: {} },
  };
  const input = {};
  for (let i = 0; i < 40; i += 1) {
    action.input.properties[`field_${i}`] = { type: 'string' };
    input[`field_${i}`] = 'v'.repeat(VALUE_CAP - 20);
  }
  const disclosure = discloseInput(action, input);
  assert.equal(disclosure.shown.length, 40);
  const summary = composeSummary({
    action: 'test.mod.act', service: 'test', module: 'mod', risk: 'high', disclosure,
  });
  assert.ok(summary.length <= SUMMARY_CAP, `summary was ${summary.length}`);
  assert.match(summary, /more fields not shown, because the summary reached its length limit/);

  // Exact accounting, so this cannot pass by emitting nothing. Adversarial review
  // found the previous loop vacuous: zero matches satisfied it.
  const matched = [...summary.matchAll(/(field_\d+)="(v*)"/g)];
  assert.ok(matched.length > 0, 'no field was rendered at all');
  const omittedMatch = summary.match(/; (\d+) more fields not shown/);
  assert.equal(Number(omittedMatch[1]) + matched.length, 40, 'kept plus omitted must be the whole set');
  for (const [, , value] of matched) assert.equal(value.length, VALUE_CAP - 20, 'a field was cut');
  // And no half-written value fragment survived anywhere.
  assert.equal(countDelimiters(summary) % 2, 0, 'an unterminated value fragment is present');
});

// ------------------------------------------------------------------ eligibility

test('an undeclared key carries neither its name nor its value into anything returned', () => {
  const CANARY = 'zzq-canary-4f1c9e2b';
  const KEY = 'x_undeclared_probe';
  const { summary, disclosure } = summaryFor(servicesEnable, 'google-cloud.services.enable', {
    project: 'wiser-method-prod', service: 'translate.googleapis.com', [KEY]: CANARY,
  });
  const everything = JSON.stringify({ summary, ...disclosure });
  assert.equal(disclosure.undeclared, 1);
  assert.doesNotMatch(everything, new RegExp(CANARY));
  assert.doesNotMatch(everything, new RegExp(KEY));
  assert.match(summary, /1 undeclared field not shown/);
});

test('a declared field failing its own pattern is refused from the summary and named', () => {
  const { summary, disclosure } = summaryFor(servicesEnable, 'google-cloud.services.enable', {
    project: 'Not A Valid Project', service: 'translate.googleapis.com',
  });
  assert.deepEqual(disclosure.withheld, [{ name: 'project', reason: 'pattern' }]);
  assert.deepEqual(disclosure.shown.map((f) => f.name), ['service']);
  assert.match(summary, /project was supplied and is not shown, because it fails its own pattern/);
  assert.doesNotMatch(summary, /Not A Valid Project/);
});

test('a scalar whose runtime type contradicts its declaration is withheld, not coerced', () => {
  const { disclosure } = summaryFor(servicesEnable, 'google-cloud.services.enable', {
    project: 12345, service: 'translate.googleapis.com',
  });
  assert.deepEqual(disclosure.withheld, [{ name: 'project', reason: 'type' }]);
});

test('a scalar union accepts either member, and a structured member renders when the value matches it', () => {
  // Adversarial review, finding 6: taking the first scalar member withheld the other.
  // A union that also permits object used to withhold every value. It now renders
  // whichever member the value matches.
  const action = { input: { properties: {
    either: { type: ['string', 'number'] },
    mixed: { type: ['string', 'object'] },
  } } };
  const asNumber = discloseInput(action, { either: 42 });
  const asString = discloseInput(action, { either: 'forty-two' });
  assert.deepEqual(asNumber.shown.map((f) => f.name), ['either']);
  assert.equal(asNumber.shown[0].text, '42');
  assert.deepEqual(asString.shown.map((f) => f.name), ['either']);
  const asText = discloseInput(action, { mixed: 'a plain string' });
  assert.equal(asText.shown[0].text, '"a plain string"');
  const asObject = discloseInput(action, { mixed: { cpu: 2 } });
  assert.equal(asObject.shown[0].text, '{"cpu": 2}');
  const mismatch = discloseInput(action, { mixed: ['no'] });
  assert.deepEqual(mismatch.withheld, [{ name: 'mixed', reason: 'type' }]);
});

test('an object supplied to a string declaration is withheld rather than stringified', () => {
  const action = { input: { properties: { s: { type: 'string' } } } };
  const disclosure = discloseInput(action, { s: { secret: 'value' } });
  assert.deepEqual(disclosure.withheld, [{ name: 's', reason: 'type' }]);
  assert.doesNotMatch(JSON.stringify(disclosure.shown), /secret/);
});

test('an unknown action declares nothing, so every supplied key is undeclared', () => {
  const disclosure = discloseInput(undefined, { anything: 'at all' });
  assert.deepEqual(disclosure.fields, []);
  assert.equal(disclosure.undeclared, 1);
  assert.deepEqual(disclosure.shown, []);
});

// ------------------------------------------------------------------- validation

test('multipleOf uses a relative tolerance, so a tiny non-multiple is caught', () => {
  // Adversarial review, finding 6: rounding the ratio to ten decimal places
  // reported 1e-11 as a multiple of 1.
  assert.equal(violatedKeyword({ multipleOf: 1 }, 1e-11), 'multipleOf');
  assert.equal(violatedKeyword({ multipleOf: 10 }, 20), null);
  assert.equal(violatedKeyword({ multipleOf: 10 }, 25), 'multipleOf');
  assert.equal(violatedKeyword({ multipleOf: 0.1 }, 0.3), null);
});

test('schema length is counted in code points, as JSON Schema defines it', () => {
  // Adversarial review, finding 6: UTF-16 units rejected a single emoji at maxLength 1.
  assert.equal(violatedKeyword({ maxLength: 1 }, '\u{1f600}'), null);
  assert.equal(violatedKeyword({ maxLength: 1 }, 'ab'), 'maxLength');
  assert.equal(violatedKeyword({ minLength: 2 }, '\u{1f600}\u{1f600}'), null);
});

test('both directions of every validator: a passing and a failing case each', () => {
  const cases = [
    [{ enum: ['a', 'b'] }, 'a', null], [{ enum: ['a', 'b'] }, 'c', 'enum'],
    [{ pattern: '^x+$' }, 'xxx', null], [{ pattern: '^x+$' }, 'xy', 'pattern'],
    [{ maxLength: 3 }, 'abc', null], [{ maxLength: 3 }, 'abcd', 'maxLength'],
    [{ minLength: 3 }, 'abc', null], [{ minLength: 3 }, 'ab', 'minLength'],
    [{ minimum: 5 }, 5, null], [{ minimum: 5 }, 4, 'minimum'],
    [{ maximum: 5 }, 5, null], [{ maximum: 5 }, 6, 'maximum'],
    [{ unknownKeyword: true }, 'anything', null],
    [{ pattern: '[' }, 'anything', 'pattern'],
  ];
  for (const [declaration, value, expected] of cases) {
    assert.equal(violatedKeyword(declaration, value), expected,
      `${JSON.stringify(declaration)} with ${JSON.stringify(value)}`);
  }
});

test('a string is quoted and a boolean is not, so "true" and true are distinguishable', () => {
  assert.equal(renderValue('true').text, '"true"');
  assert.equal(renderValue(true).text, 'true');
});

// ------------------------------------------- regressions from review round two

test('the fingerprint survives a lone surrogate, which UTF-8 hashing destroyed', () => {
  // Review finding 1. `Buffer.from(raw)` defaults to UTF-8, which replaces an
  // unpaired surrogate with U+FFFD, so these two hashed identically.
  const prefix = 'a'.repeat(VALUE_CAP);
  const first = renderValue(`${prefix}\ud800`);
  const second = renderValue(`${prefix}\ud801`);
  assert.ok(first.truncated && second.truncated);
  assert.notEqual(first.text, second.text);
});

test('an invisible that passes the shipped service pattern is escaped', () => {
  // Review finding 2. U+2060 WORD JOINER is not whitespace, so `^[^\s/]+$` admits
  // it, and it renders as nothing: two different service names look identical.
  const hidden = 'translate\u2060.googleapis.com';
  assert.ok(new RegExp(servicesEnable.input.properties.service.pattern).test(hidden));
  const { summary } = summaryFor(servicesEnable, 'google-cloud.services.enable', {
    project: 'wiser-method-prod', service: hidden,
  });
  assert.equal(carriesRawUnsafe(summary), null);
  assert.match(summary, /\\u2060/);
  assert.notEqual(summary.includes('service="translate.googleapis.com"'), true,
    'the invisible must be visible, not silently dropped');
});

test('multipleOf rejects the three values the scaled tolerance accepted', () => {
  // Review finding 4, each counterexample by name.
  assert.equal(violatedKeyword({ multipleOf: 1 }, 1e-17), 'multipleOf', 'tolerance floor');
  assert.equal(violatedKeyword({ multipleOf: 1 }, 2 ** 51 + 0.5), 'multipleOf', 'tolerance grew past 0.5');
  assert.equal(violatedKeyword({ multipleOf: 1e-308 }, 1e308), 'multipleOf', 'non-finite ratio');
  assert.equal(violatedKeyword({ multipleOf: 5 }, 0), null, 'zero is a multiple of everything');
  assert.equal(violatedKeyword({ multipleOf: 10 }, 20), null);
});

test('the summary cap holds when the mandatory material alone would exceed it', () => {
  // Review finding 3, already closed by the budget rebuild but asserted so it stays so.
  const properties = {};
  const input = {};
  for (let i = 0; i < 40; i += 1) {
    properties[`a_declared_scalar_field_named_${i}`] = { type: 'string', pattern: '^ONLY$' };
    input[`a_declared_scalar_field_named_${i}`] = 'invalid';
  }
  const summary = composeSummary({
    action: 'N'.repeat(3000), service: 'S'.repeat(3000), module: 'M'.repeat(3000),
    risk: 'R'.repeat(3000), description: 'd'.repeat(3000),
    disclosure: discloseInput({ input: { properties } }, input),
  });
  assert.ok(summary.length <= SUMMARY_CAP, `summary was ${summary.length}`);
  assert.match(summary, /further warnings not shown/);
  assert.match(summary, /risk /, 'the risk clause must survive');
});

test('many long structured values stay inside the summary cap and name input_values', () => {
  const properties = {};
  const input = {};
  for (let i = 0; i < 30; i += 1) {
    properties[`field_${i}`] = { type: 'array' };
    input[`field_${i}`] = ['\u0000'.repeat(80), { note: 'x'.repeat(80) }];
  }
  const disclosure = discloseInput({ input: { properties } }, input);
  assert.equal(disclosure.shown.length, 30);
  assert.equal(disclosure.shown.every((f) => f.truncated && typeof f.full === 'string' && f.full.length > VALUE_CAP), true);
  const summary = composeSummary({
    action: 'a.b.c', service: 's', module: 'm', risk: 'high',
    description: 'd'.repeat(SUMMARY_CAP),
    disclosure,
  });
  assert.ok(summary.length <= SUMMARY_CAP, `summary was ${summary.length}`);
  assert.match(summary, /input_values/);
  assert.match(summary, /shortened here/);
  assert.equal(carriesRawUnsafe(summary), null);
  for (const field of disclosure.shown) assert.equal(carriesRawUnsafe(field.full), null);
});

test('structured values render in the stated form, and a hostile element or key is escaped', () => {
  const action = { input: { properties: {
    argv: { type: 'array' },
    limits: { type: 'object' },
    hostile: { type: 'array' },
    keyed: { type: 'object' },
  } } };
  const argv = discloseInput(action, { argv: ['sh', '-c', 'echo hi'] });
  assert.equal(argv.shown[0].text, '["sh", "-c", "echo hi"]');
  const limits = discloseInput(action, { limits: { cpu: 2, list: [1, 'a'] } });
  assert.equal(limits.shown[0].text, '{"cpu": 2, "list": [1, "a"]}');
  const ordered = discloseInput(action, { limits: { b: 1, a: 2 } });
  assert.equal(ordered.shown[0].text, '{"b": 1, "a": 2}');
  const hostile = discloseInput(action, { hostile: ['a", "b', 'c\\d', 'e\u0000f'] });
  assert.equal(hostile.shown[0].text, '["a\\", \\"b", "c\\\\d", "e\\x00f"]');
  assert.equal(carriesRawUnsafe(hostile.shown[0].text), null);
  const keyed = discloseInput(action, { keyed: { 'a"b': 1, 'c\\d': true, 'e\u0000f': null } });
  assert.equal(keyed.shown[0].text, '{"a\\"b": 1, "c\\\\d": true, "e\\x00f": null}');
  assert.equal(carriesRawUnsafe(keyed.shown[0].text), null);
});

test('a value nested deeper than 32 levels is withheld with reason depth and never rendered', () => {
  const action = { input: { properties: { box: { type: 'array' } } } };
  const nest = (levels, leaf) => {
    let value = leaf;
    for (let i = 0; i < levels; i += 1) value = [value];
    return value;
  };
  const shown = discloseInput(action, { box: nest(32, 'canary-32') });
  assert.equal(shown.withheld.length, 0);
  assert.match(shown.shown[0].text, /canary-32/);
  const hidden = discloseInput(action, { box: nest(33, 'canary-33') });
  assert.deepEqual(hidden.withheld, [{ name: 'box', reason: 'depth' }]);
  assert.equal(hidden.shown.length, 0);
  assert.equal(JSON.stringify(hidden).includes('canary-33'), false);
  const hostile = discloseInput(action, { box: nest(10000, 'canary-deep') });
  assert.deepEqual(hostile.withheld, [{ name: 'box', reason: 'depth' }]);
  assert.equal(JSON.stringify(hostile).includes('canary-deep'), false);
});

test('a truncated scalar keeps today\'s length and digest, and carries full only when cut', () => {
  const raw = 'a'.repeat(VALUE_CAP + 1);
  const rendered = renderValue(raw);
  assert.equal(rendered.truncated, true);
  assert.equal(rendered.length, VALUE_CAP + 1);
  assert.equal(rendered.full, `"${raw}"`);
  const digest = createHash('sha256').update(Buffer.from(raw, 'utf16le')).digest('hex').slice(0, 16);
  assert.match(rendered.text, new RegExp(`sha256:${digest}\\)`));
  const whole = renderValue('short');
  assert.equal(whole.truncated, false);
  assert.equal(Object.hasOwn(whole, 'full'), false);
});

test('a 60000-character scalar is carried whole in full and capped in value', () => {
  const content = `${'z'.repeat(60000)}\u0000`;
  assert.equal([...content].length, 60001);
  const action = { input: { properties: { content: { type: 'string' } } } };
  const field = discloseInput(action, { content }).shown[0];
  assert.equal(field.truncated, true);
  assert.equal(field.full, `"${escapeForDisplay(content)}"`);
  assert.ok(field.full.length > VALUE_CAP);
  assert.equal(carriesRawUnsafe(field.full), null);
  assert.equal(carriesRawUnsafe(field.text), null);
  assert.doesNotMatch(field.text, /\\x0(?![0-9a-f])/);
});

test('a truncated structured value caps on whole escape tokens and digests the rendered text', () => {
  const action = { input: { properties: { argv: { type: 'array' } } } };
  const field = discloseInput(action, { argv: ['\u001b'.repeat(40)] }).shown[0];
  const rendered = `["${'\\x1b'.repeat(40)}"]`;
  assert.equal(field.full, rendered);
  assert.equal(field.truncated, true);
  assert.ok(field.text.startsWith('["'));
  assert.match(field.text, /… \(/);
  assert.doesNotMatch(field.text, /\\x[0-9a-f]?…/);
  const digest = createHash('sha256').update(Buffer.from(rendered, 'utf16le')).digest('hex').slice(0, 16);
  assert.match(field.text, new RegExp(`sha256:${digest}\\)`));
  assert.equal(field.length, [...rendered].length);
  assert.equal(carriesRawUnsafe(field.text), null);
  assert.equal(carriesRawUnsafe(field.full), null);
});
