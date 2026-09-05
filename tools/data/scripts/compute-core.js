/**
 * data compute core: a percentage, difference, or rate from two numeric
 * fields of one JSON object.
 *
 * executeCompute looks up --a and --b by dotted path and returns either the
 * result object or a rejection naming the field that was missing or not a
 * number. It never throws. Division by zero for percentage and rate is not a
 * rejection: it comes back as the result object with error "b is zero" and no
 * value, because that is an answer, not a usage mistake.
 *
 * This module is imported by scripts/data.js with no dependency check, since it
 * imports only Node built-ins; the test suite imports it directly. The rules
 * every shipped script follows are stated once, in
 * system/templates/Script Contract.md.
 */

/** The operations a caller may name. */
export const OPS = ['percentage', 'difference', 'rate'];

function isNumeric(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Walk a dotted path through a JSON value. A numeric segment indexes an array;
 * a non-numeric segment on an array selects the first object whose `name`
 * equals that segment, so `columns.revenue.mean` reads a describe column.
 *
 * @param {unknown} root
 * @param {string} path
 * @returns {{ found: false } | { found: true, value: unknown }}
 */
export function lookupField(root, path) {
  const parts = String(path).split('.');
  let current = root;

  for (const part of parts) {
    if (current === null || current === undefined) return { found: false };

    if (Array.isArray(current)) {
      if (/^\d+$/.test(part)) {
        const index = Number(part);
        if (index >= current.length) return { found: false };
        current = current[index];
      } else {
        const hit = current.find(
          (item) =>
            item !== null &&
            typeof item === 'object' &&
            !Array.isArray(item) &&
            item.name === part
        );
        if (!hit) return { found: false };
        current = hit;
      }
    } else if (typeof current === 'object') {
      if (!Object.prototype.hasOwnProperty.call(current, part)) return { found: false };
      current = current[part];
    } else {
      return { found: false };
    }
  }

  return { found: true, value: current };
}

function roundTo(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function notFinite(result) {
  const { value, ...rest } = result;
  return { ...rest, error: 'the result is not a finite number' };
}

/**
 * @param {{
 *   data: unknown,
 *   op: 'percentage'|'difference'|'rate',
 *   aField: string,
 *   bField: string,
 *   digits?: number,
 * }} input
 * @returns {{
 *   ok: true,
 *   result: {
 *     op: string,
 *     a: { field: string, value: number },
 *     b: { field: string, value: number },
 *     value?: number,
 *     error?: string,
 *   },
 * } | {
 *   ok: false,
 *   field: string,
 * }}
 */
export function executeCompute(input) {
  const { data, op, aField, bField, digits } = input;

  const aLookup = lookupField(data, aField);
  if (!aLookup.found || !isNumeric(aLookup.value)) {
    return { ok: false, field: aField };
  }

  const bLookup = lookupField(data, bField);
  if (!bLookup.found || !isNumeric(bLookup.value)) {
    return { ok: false, field: bField };
  }

  const a = aLookup.value;
  const b = bLookup.value;

  if ((op === 'percentage' || op === 'rate') && b === 0) {
    return {
      ok: true,
      result: {
        op,
        a: { field: aField, value: a },
        b: { field: bField, value: b },
        error: 'b is zero',
      },
    };
  }

  let value;
  switch (op) {
    case 'percentage':
      value = (a / b) * 100;
      break;
    case 'difference':
      value = a - b;
      break;
    case 'rate':
      value = a / b;
      break;
    default:
      return { ok: false, field: aField };
  }

  if (digits !== undefined) {
    value = roundTo(value, digits);
  }

  const result = {
    op,
    a: { field: aField, value: a },
    b: { field: bField, value: b },
    value,
  };
  if (!Number.isFinite(value)) {
    return { ok: true, result: notFinite(result) };
  }
  return { ok: true, result };
}
