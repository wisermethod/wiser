import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';

/**
 * The confirmation summary's disclosure policy, as one place.
 *
 * A `needs_confirmation` stop fires about eighty-seven lines before the module
 * validates anything, so the summary is the only reading the caller's input has
 * had when a person is asked to approve it. What that summary may show, how it
 * renders it, and what it must say it is not showing are decided here.
 *
 * Safety is the renderer's job and not the schema's. Across the 22 shipped
 * `confirmation: always` actions, 6 of 122 declared fields are bounded by their
 * own declaration against control characters, and two connectors declare no
 * pattern at all. A schema-gated rule would print nothing where it matters, so
 * every eligible value passes through the escaper whatever its schema says.
 *
 * What this does NOT guarantee, because an earlier draft claimed it did: that a
 * displayed value holds no secret. The gateway keeps provider-managed credentials
 * off the input path entirely, but a caller may put anything into a declared
 * free-form string and the renderer cannot tell. See the policy's Eligibility
 * section, which states the narrowed guarantee.
 */

/** Scalar types a value may be rendered from. Nested fields are never rendered. */
const SCALAR_TYPES = new Set(['string', 'number', 'integer', 'boolean']);

/** Escaped characters of a rendered value, before the truncation marker. */
export const VALUE_CAP = 120;

/** Characters of a whole composed summary. */
export const SUMMARY_CAP = 2000;

/**
 * Hex characters of the fingerprint on a truncated value. Sixteen, not eight:
 * eight is 32 bits, which an attacker choosing both values reaches by birthday in
 * about 2^16 tries. Sixteen is 64 bits. **It is collision resistance and not a
 * uniqueness proof**, and the policy says so rather than calling it unambiguous.
 */
const DIGEST_LENGTH = 16;

/**
 * Code points unsafe to emit raw into a summary a person reads.
 *
 * The set is defined from maintained Unicode properties rather than a hand list,
 * because a hand list is a list of the characters somebody thought of. The first
 * two versions of this file were exactly that, and each missed a class: the first
 * missed U+2028 and U+2029, the second missed U+2060 WORD JOINER, which passes
 * `google-cloud.services.enable`'s own pattern and renders as nothing at all.
 *
 * - `Cc` control, `Cf` format, `Cs` surrogate: terminal control, tag characters,
 *   bidirectional overrides, joiners, soft hyphen, the U+FFF9 annotation controls.
 * - `Zl` and `Zp`: LINE and PARAGRAPH SEPARATOR, which end a line for some consumers.
 * - `Default_Ignorable_Code_Point`: the variation selectors and the rest of the
 *   invisibles Unicode itself marks as ignorable.
 *
 * ZWNJ and ZWJ are inside `Cf` and are therefore escaped, which is a real cost:
 * it renders an emoji ZWJ sequence or correctly-spelled Persian as escapes. It is
 * accepted because this string is an identifier a person is being asked to approve,
 * where two targets looking alike is the worse failure.
 */
const UNSAFE_CLASS = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}]/u;

/** @param {string} ch one code point */
function isUnsafeCodePoint(ch) {
  return UNSAFE_CLASS.test(ch);
}

/**
 * The escaped form of exactly one code point. Always a complete token, which is
 * what lets the cap below cut without ever splitting an escape or a surrogate pair.
 *
 * The double quote is escaped because values are rendered quoted and joined with
 * a comma: without this, a value containing `", other="` prints an apparent extra
 * field and misleads the person approving, with no control character involved.
 *
 * @param {string} ch one code point
 */
function escapeCodePoint(ch) {
  if (ch === '\\') return '\\\\';
  if (ch === '"') return '\\"';
  if (!isUnsafeCodePoint(ch)) return ch;
  const code = ch.codePointAt(0) ?? 0;
  if (code < 0x100) return `\\x${code.toString(16).padStart(2, '0')}`;
  if (code <= 0xffff) return `\\u${code.toString(16).padStart(4, '0')}`;
  return `\\u{${code.toString(16)}}`;
}

/**
 * Replace every unsafe code point with a visible escape.
 *
 * @param {unknown} raw
 * @returns {string}
 */
export function escapeForDisplay(raw) {
  let out = '';
  for (const ch of String(raw)) out += escapeCodePoint(ch);
  return out;
}

/**
 * Escape up to `cap` characters of output, stopping on a complete token.
 *
 * @param {string} raw
 * @param {number} cap
 */
function escapeToCap(raw, cap) {
  let out = '';
  for (const ch of raw) {
    const token = escapeCodePoint(ch);
    if (out.length + token.length > cap) return { out, truncated: true };
    out += token;
  }
  return { out, truncated: false };
}

/**
 * Does the value satisfy any scalar type the declaration permits? A union is
 * checked member by member: `["string","number"]` accepts either, and taking the
 * first scalar member alone would withhold the other.
 *
 * @param {object} declaration
 * @param {unknown} value
 */
function isEligible(declaration, value) {
  const declared = declaration?.type;
  const candidates = (Array.isArray(declared) ? declared : [declared]).filter((t) => SCALAR_TYPES.has(t));
  if (!candidates.length) return false;
  return candidates.some((type) => {
    if (type === 'boolean') return typeof value === 'boolean';
    if (type === 'integer') return typeof value === 'number' && Number.isInteger(value);
    if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
    return typeof value === 'string';
  });
}

/** JSON Schema counts a string's length in characters, which are code points. */
function codePointLength(value) {
  let n = 0;
  for (const _ of value) n += 1;
  return n;
}

/**
 * Check a value against its own declaration. Returns null when it holds, or the
 * name of the keyword it failed.
 *
 * An unrecognised keyword is ignored rather than failed, so a connector adding one
 * does not lose its field from every summary. **This is why validation is not a
 * safety mechanism and the policy says so**: the escaper above is what makes a
 * value safe to print, and validation only spares a person approving a value the
 * call will reject.
 *
 * @param {object} declaration
 * @param {unknown} value
 * @returns {string | null}
 */
export function violatedKeyword(declaration, value) {
  const d = declaration ?? {};
  if (Array.isArray(d.enum) && !d.enum.includes(value)) return 'enum';
  if (typeof value === 'string') {
    if (typeof d.pattern === 'string') {
      let re;
      // An unparseable pattern is the manifest's defect, not the caller's. Withhold.
      try { re = new RegExp(d.pattern); } catch { return 'pattern'; }
      if (!re.test(value)) return 'pattern';
    }
    const length = codePointLength(value);
    if (Number.isFinite(d.maxLength) && length > d.maxLength) return 'maxLength';
    if (Number.isFinite(d.minLength) && length < d.minLength) return 'minLength';
  }
  if (typeof value === 'number') {
    if (Number.isFinite(d.minimum) && value < d.minimum) return 'minimum';
    if (Number.isFinite(d.maximum) && value > d.maximum) return 'maximum';
    if (Number.isFinite(d.multipleOf) && d.multipleOf !== 0) {
      // Three counterexamples killed the previous tolerance, which scaled with the
      // ratio: 1e-17 was a multiple of 1 because the floor swallowed it; 2**51 + 0.5
      // was a multiple of 1 because the tolerance had grown past 0.5; and 1e308 over
      // 1e-308 divided to Infinity, whose difference from itself is NaN, and NaN is
      // greater than nothing. The tolerance is now relative to the divisor, which
      // does not grow with the quotient, and a non-finite ratio is a failure.
      const ratio = value / d.multipleOf;
      if (!Number.isFinite(ratio)) return 'multipleOf';
      const rounded = Math.round(ratio);
      if (rounded === 0 && value !== 0) return 'multipleOf';
      if (Math.abs(value - rounded * d.multipleOf) > Math.abs(d.multipleOf) * 1e-9) return 'multipleOf';
    }
  }
  return null;
}

/**
 * Render one eligible, validated value: escaped, capped, and, when cut, marked
 * with its true length and a digest of the whole value.
 *
 * The digest is what makes truncation honest. Two identifiers sharing a 120
 * character prefix render alike without it, and neither of the two target fields
 * this build exists for, `services.enable`'s `service` and `keys.patch`'s
 * `key_id`, declares a `maxLength`, so a target can reach this path. An earlier
 * draft asserted that a target never truncates; that was inferred from the
 * length-bounded fields alone and it was wrong.
 *
 * @param {unknown} value
 */
export function renderValue(value) {
  const raw = String(value);
  const quote = typeof value === 'string' ? '"' : '';
  const { out, truncated } = escapeToCap(raw, VALUE_CAP);
  if (!truncated) {
    return { text: `${quote}${out}${quote}`, truncated: false, length: codePointLength(raw) };
  }
  // UTF-16LE, not the default UTF-8: UTF-8 encoding replaces an unpaired surrogate
  // with U+FFFD, so `x + '\ud800'` and `x + '\ud801'` hashed identically and the
  // fingerprint lost the distinction before SHA-256 ever saw it.
  const digest = createHash('sha256').update(Buffer.from(raw, 'utf16le')).digest('hex').slice(0, DIGEST_LENGTH);
  const length = codePointLength(raw);
  return {
    text: `${quote}${out}${quote}… (${length} characters total, sha256:${digest})`,
    truncated: true,
    length,
  };
}

/**
 * Decide and render every part of a confirmation summary that comes from input.
 *
 * `fields` and `undeclared` keep the exact meanings `input_fields` and
 * `undeclared_fields` have carried since before this policy; nothing is renamed.
 *
 * @param {object} [action] the manifest action, or undefined for an unknown id
 * @param {object} [input] the caller's supplied arguments
 */
export function discloseInput(action, input) {
  const properties = action?.input?.properties ?? {};
  const declaredKeys = Object.keys(properties);
  const given = Object.keys(input ?? {});
  const fields = given.filter((k) => declaredKeys.includes(k));

  const shown = [];
  const nested = [];
  const withheld = [];

  for (const name of fields) {
    const declaration = properties[name];
    const value = input[name];
    const declared = declaration?.type;
    const types = Array.isArray(declared) ? declared : [declared];
    // A declaration permitting a nested type is never rendered, whatever else it
    // permits, because one member of the union is enough to carry a structure.
    if (types.some((t) => t === 'object' || t === 'array')) { nested.push(name); continue; }
    if (!isEligible(declaration, value)) { withheld.push({ name, reason: 'type' }); continue; }
    const violated = violatedKeyword(declaration, value);
    if (violated) { withheld.push({ name, reason: violated }); continue; }
    shown.push({ name, ...renderValue(value) });
  }

  return {
    fields,
    undeclared: given.length - fields.length,
    shown,
    nested,
    withheld,
  };
}

/**
 * Compose the summary a person reads. Values land here and not only in a
 * structured field: of the shipped set, 43 files mention `needs_confirmation` and
 * every reader outside the gateway's own tests reads this string.
 *
 * The budget is spent in safety order. The head, every warning clause and the
 * risk are reserved first and always survive; values fill what is left and the
 * summary says how many did not fit; the description takes the remainder. So a
 * long description can never push out the sentence saying what is not shown.
 *
 * @param {object} parts
 * @param {string} parts.action
 * @param {string} parts.service
 * @param {string} parts.module
 * @param {string|null} [parts.risk]
 * @param {string|null} [parts.description]
 * @param {ReturnType<typeof discloseInput>} parts.disclosure
 */
/** Characters reserved for the action, service and module, which lead the summary. */
const HEAD_BUDGET = 200;

/** Characters reserved for the risk word. */
const RISK_BUDGET = 40;

/** Characters reserved for the clauses saying what is NOT being shown. */
const WARNING_BUDGET = 600;

/** Characters reserved for the list of nested field names inside that clause. */
const NESTED_NAME_BUDGET = 400;

/** Escape anything bound for the summary, whatever it came from. */
const esc = (value) => escapeForDisplay(value ?? '');

/** Escape and hard-cap one fragment, marking a cut. */
function cap(text, limit) {
  const { out, truncated } = escapeToCap(text, limit);
  return truncated ? `${out}…` : out;
}

/**
 * Keep as many whole clauses as fit a budget, and announce the rest rather than
 * cutting one in half. `more` renders the announcement; it is reserved at its
 * worst case before anything is kept.
 *
 * @param {string[]} clauses
 * @param {number} budget
 * @param {(n: number) => string} more
 * @param {string} [join]
 */
function fit(clauses, budget, more, join = '') {
  const reserve = clauses.length ? more(clauses.length).length : 0;
  const kept = [];
  let used = 0;
  let dropped = 0;
  for (const clause of clauses) {
    const cost = clause.length + (kept.length ? join.length : 0);
    if (used + cost + reserve > budget) { dropped += 1; continue; }
    kept.push(clause);
    used += cost;
  }
  return { kept, dropped, text: kept.join(join) + (dropped ? more(dropped) : '') };
}

export function composeSummary({ action, service, module, risk, description, disclosure }) {
  // Every part of the summary is escaped and budgeted, including the parts that come
  // from the manifest rather than from the caller. A field NAME reaching the output
  // raw is the same defect as a field value reaching it raw, one layer up: the
  // manifest is trusted input, but "trusted" is not a property the renderer can check.
  const head = cap(`${esc(action)} on ${esc(service)}/${esc(module)}`, HEAD_BUDGET);
  const riskClause = `; risk ${cap(esc(risk ?? 'unknown'), RISK_BUDGET)}`;

  // Warning clauses carry what is NOT being shown, so they are budgeted before values
  // and before the description, and an overflow is itself announced rather than cut.
  const warningTexts = [];
  if (disclosure.nested.length) {
    // The names are fitted one at a time rather than joined into a single clause.
    // Joined, a long list overran the budget and the WHOLE warning was dropped, so a
    // person was told nothing about what was hidden. A truncated list beats no list.
    const verb = disclosure.nested.length === 1 ? 'is' : 'are';
    const tail = ` ${verb} not shown, so this approves the target and not the change`;
    const names = fit(
      disclosure.nested.map(esc),
      Math.max(0, NESTED_NAME_BUDGET - tail.length),
      (n) => ` and ${n} more`,
      ', ',
    );
    warningTexts.push(`; the content of ${names.text}${tail}`);
  }
  for (const item of disclosure.withheld) {
    warningTexts.push(`; ${esc(item.name)} was supplied and is not shown, because it fails its own ${esc(item.reason)}`);
  }
  if (disclosure.undeclared) {
    const n = disclosure.undeclared;
    warningTexts.push(`; ${n} undeclared field${n === 1 ? '' : 's'} not shown`);
  }
  const moreWarnings = (n) => `; and ${n} further warning${n === 1 ? '' : 's'} not shown, because the summary reached its length limit`;
  const warnings = fit(warningTexts, WARNING_BUDGET, moreWarnings);

  // Values, as many whole ones as fit. A field that does not fit is counted, not cut.
  const rendered = disclosure.shown.map((f) => `${esc(f.name)}=${f.text}`);
  const moreValues = (n) => `; ${n} more field${n === 1 ? '' : 's'} not shown, because the summary reached its length limit`;

  const spent = head.length + warnings.text.length + riskClause.length;
  let valueClause = '';
  let omitted = 0;
  if (rendered.length) {
    // The clause announcing omissions is reserved at its worst case BEFORE any value
    // is fitted. Fitting first and appending it afterwards overran the cap.
    const budget = SUMMARY_CAP - spent - moreValues(rendered.length).length - ' with '.length;
    const chosen = fit(rendered, Math.max(0, budget), () => '', ', ');
    if (chosen.kept.length) valueClause = ` with ${chosen.kept.join(', ')}`;
    omitted = chosen.dropped;
  } else if (disclosure.fields.length) {
    // Nothing was eligible; name the fields as the summary always has.
    const names = ` with ${disclosure.fields.map(esc).join(', ')}`;
    if (spent + names.length <= SUMMARY_CAP) valueClause = names;
  }

  let summary = `${head}${valueClause}${warnings.text}${omitted ? moreValues(omitted) : ''}${riskClause}`;

  if (description) {
    // Budget for the `; ` that introduces it and the ellipsis that may end it, so a
    // truncated description lands exactly on the cap rather than one past it.
    const remaining = SUMMARY_CAP - summary.length - '; '.length - 1;
    if (remaining > 0) {
      const { out, truncated } = escapeToCap(description, remaining);
      summary += truncated ? `; ${out}…` : `; ${out}`;
    }
  }
  return summary;
}
