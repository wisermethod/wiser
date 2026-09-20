/**
 * The published input schema, enforced.
 *
 * A connector publishes `input` for every action in its `manifest.json` and, until
 * 2026-09-20, nothing applied it: `src/manifest.js` type-checks that `input` is an object
 * and never validates a call against it. Eleven connectors carried a byte-identical copy
 * of this code and agreed with their own schemas; the other fourteen hand-rolled their
 * checks and held all 189 divergences the agreement gate measured. A mechanism copied
 * eleven times and owned nowhere is a convention twenty-five directories have to keep.
 *
 * So it is owned here, and no connector carries one. **A connector cannot import this**:
 * across all twenty-five the only imports are node builtins, and `--connectors <abs dir>`
 * lets a connector directory sit anywhere on disk, so there is no path from a connector to
 * `gateway/src/`. The choice was twenty-five copies or none, and none is the one that does
 * not depend on connector twenty-six remembering.
 *
 * ## What it checks, and what it deliberately does not
 *
 * This is the eleven copies' semantics, not a JSON Schema implementation. It reads
 * `required`, `properties`, and within a property `type`, `enum`, `pattern`, `minLength`
 * and `items`. It refuses any key `properties` does not declare, whatever the schema says
 * about `additionalProperties`, which is why every shipped action declares
 * `additionalProperties: false`: the published schema and the applied rule say the same
 * thing rather than one being wider than the other.
 *
 * It does not read `maxLength`, `minimum`, `maximum`, `oneOf`, `anyOf` or `if`/`then`, and
 * it does not recurse into object properties. A module that enforces one of those keeps
 * enforcing it itself. `gateway/test/agreement.test.js` is what holds the two sides
 * together: it fails when a module enforces a rule its schema does not publish, and when a
 * schema publishes a rule nothing applies.
 *
 * ## Two corrections to the copied text, both measured
 *
 * `schema.items ?? {}`: the copies recurse into `schema.items` unguarded, so a declared
 * array with no `items` read `.type` off `undefined` and crashed. Thirteen such arrays
 * ship, in `cloudflare`, `dataforseo`, `google` and `vercel`. None of the eleven declares
 * one, which is why it never fired, and all four that do are connectors the copies never
 * reached.
 *
 * `schema.type !== undefined &&`: the copies compare `typeof value` against an absent
 * `type` and refuse every value, because `typeof value` is always a string and `undefined`
 * is not. A property that declares only an `enum` or only a `pattern` was unreachable.
 */

/**
 * @param {unknown} value
 * @param {Record<string, any>} schema
 */
export function matches(value, schema) {
  if (schema.type === 'array') return Array.isArray(value) && Array.from(value).every((item) => matches(item, schema.items ?? {}));
  if (schema.type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (schema.type === 'integer') return Number.isInteger(value);
  if (schema.type !== undefined && typeof value !== schema.type) return false;
  if (schema.minLength && value.length < schema.minLength) return false;
  if (schema.pattern && !new RegExp(schema.pattern).test(value)) return false;
  return !schema.enum || schema.enum.includes(value);
}

/**
 * The name of the first field that does not satisfy the schema, or `null` when the input
 * does. A supplied input that is not a plain object is reported as `input`, which is the
 * field name the eleven copies used and the one every connector suite already asserts.
 *
 * An action that publishes no `input` is not validated. That is a manifest to fix, not a
 * call to refuse: `manifest.js` already decides what a well-formed manifest is.
 *
 * @param {Record<string, any>|undefined} schema
 * @param {unknown} input
 * @returns {string|null}
 */
export function validateInput(schema, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return 'input';
  if (!schema || typeof schema !== 'object') return null;
  const properties = schema.properties ?? {};
  for (const field of schema.required ?? []) {
    if (!Object.hasOwn(input, field) || !matches(input[field], properties[field] ?? {})) return field;
  }
  for (const [field, value] of Object.entries(input)) {
    if (!Object.hasOwn(properties, field) || !matches(value, properties[field])) return field;
  }
  return null;
}
