/** Minimum module privilege and action metadata, derived only from the reviewed kind. */
export const CURATED_KINDS = Object.freeze({
  read: Object.freeze({ privilege: 'read', risk: 'low', confirmation: 'none' }),
  change: Object.freeze({ privilege: 'write', risk: 'medium', confirmation: 'always' }),
  send: Object.freeze({ privilege: 'write', risk: 'high', confirmation: 'always' }),
  delete: Object.freeze({ privilege: 'write', risk: 'destructive', confirmation: 'always' }),
});

const PRIVILEGE_LEVEL = { read: 0, write: 1, admin: 2 };
const ANNOTATIONS = new Set([
  'title', 'description', 'default', 'examples', 'human_parameter_name', 'human_parameter_description',
]);
const TYPES = new Set(['string', 'boolean', 'number', 'integer', 'array', 'object']);
const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));

/**
 * Fail closed on constraints validateInput/matches do not enforce. Metadata is
 * retained verbatim. Nested object constraints, composition, references, unions
 * and numeric/array bounds need a different validator before they can be curated.
 */
export function supportsCuratedSchema(schema, root = true, depth = 0) {
  if (!plain(schema) || depth > 32) return false;
  const allowed = root
    ? new Set(['type', 'properties', 'required', 'additionalProperties'])
    : new Set(['type', 'enum', 'pattern', 'minLength', 'items']);
  if (Object.keys(schema).some((key) => !allowed.has(key) && !ANNOTATIONS.has(key))) return false;
  if (root) {
    if (schema.type !== 'object' || (schema.additionalProperties !== undefined && schema.additionalProperties !== false)) return false;
    const properties = schema.properties === undefined ? {} : schema.properties;
    if (!plain(properties) || !Object.values(properties).every((value) => supportsCuratedSchema(value, false, depth + 1))) return false;
    if (schema.required !== undefined && (!Array.isArray(schema.required)
      || schema.required.some((field) => typeof field !== 'string' || !Object.hasOwn(properties, field)))) return false;
    return true;
  }
  if (schema.type !== undefined && !TYPES.has(schema.type)) return false;
  if (schema.enum !== undefined && (!Array.isArray(schema.enum) || schema.enum.length === 0
    || schema.enum.some((value) => value !== null && !['string', 'boolean', 'number'].includes(typeof value))
    || schema.enum.some((value) => typeof value === 'number' && !Number.isFinite(value)))) return false;
  if (schema.pattern !== undefined) {
    if (schema.type !== 'string' || typeof schema.pattern !== 'string') return false;
    try { new RegExp(schema.pattern); } catch { return false; }
  }
  if (schema.minLength !== undefined && (schema.type !== 'string'
    || !Number.isSafeInteger(schema.minLength) || schema.minLength < 0)) return false;
  if (schema.items !== undefined && (schema.type !== 'array'
    || !supportsCuratedSchema(schema.items, false, depth + 1))) return false;
  return true;
}

/**
 * Shared by construction and --check. Read the optional synchronous seam once;
 * return diagnostics rather than throwing, and snapshot accepted plain data so
 * a later provider mutation cannot change a loaded action's safety declaration.
 */
export function loadCuratedActions(catalogProvider, connectors = []) {
  const rows = [];
  const errors = [];
  let supplied;
  try {
    if (typeof catalogProvider?.curated !== 'function') return { rows, errors };
    supplied = catalogProvider.curated();
  } catch {
    return { rows, errors: [{ id: null, reason: 'curated_unavailable' }] };
  }
  if (!Array.isArray(supplied)) return { rows, errors: [{ id: null, reason: 'curated_not_array' }] };
  const seen = new Set();
  for (const entry of supplied) {
    let row;
    let reason;
    try {
      row = structuredClone(entry);
      if (!plain(row) || typeof row.id !== 'string'
        || !/^[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9_-]*$/.test(row.id)) reason = 'invalid_id';
      else {
        const [service, module, action] = row.id.split('.');
        const connector = connectors.find((c) => c.id === service || c.service === service);
        const mod = connector?.manifest?.modules?.[module];
        if (!mod || mod.auth?.provider !== 'catalog' || mod.auth.toolkit !== row.toolkit) reason = 'module_auth_mismatch';
        else if (Object.hasOwn(mod.actions ?? {}, action)) reason = 'manifest_action';
        else if (typeof row.kind !== 'string' || !Object.hasOwn(CURATED_KINDS, row.kind)) reason = 'invalid_kind';
        else if (!(PRIVILEGE_LEVEL[mod.auth.privilege] >= PRIVILEGE_LEVEL[CURATED_KINDS[row.kind].privilege])) reason = 'insufficient_privilege';
        else if (!supportsCuratedSchema(row.input_schema)) reason = 'unsupported_input_schema';
        else if (typeof row.tool !== 'string' || !row.tool || typeof row.summary !== 'string' || !row.summary
          || !Array.isArray(row.key_fields) || row.key_fields.some((field) => typeof field !== 'string'
            || !Object.hasOwn(row.input_schema.properties ?? {}, field)) || !Object.hasOwn(row, 'hint')) reason = 'invalid_row';
        else if (seen.has(row.id)) reason = 'duplicate_id';
      }
    } catch {
      reason = 'invalid_row';
    }
    if (reason) errors.push({ id: typeof row?.id === 'string' ? row.id : null, reason });
    else { seen.add(row.id); rows.push(row); }
  }
  return { rows, errors };
}

/** A curated action has no standing_approval declaration. */
export function curatedActionDefinition(row) {
  return {
    ...CURATED_KINDS[row.kind],
    description: row.summary,
    execution: { prefer: 'catalog' },
    input: row.input_schema,
  };
}
