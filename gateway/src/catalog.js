// Catalog lists, searches and describes actions and owns the validated curated action snapshots.
import { STATUS, statusObject } from './errors.js';
import { readClassifierKey } from './paths.js';
import { FIRST_PARTY_ACTIONS, firstPartyDef, parseActionId, resolveAction } from './resolve.js';

/** The lowest classifier confidence at which a search pick is accepted. */
export const SEARCH_PICK_BAND = 0.51;

/** Reviewed policy: reads run, changes/sends stop, deletes always stop and never match a grant. */
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
const TYPES = new Set(['string', 'boolean', 'number', 'integer', 'array']);
export const CURATED_FORBIDDEN_INPUT_FIELDS = new Set([
  'user_id', 'userId', 'user_principal_name', 'access_token', 'oauth_token', 'key',
  'callback', 'quotaUser', 'alt', 'xgafv', '$.xgafv', 'uploadType', 'upload_protocol',
  'prettyPrint', 'useDomainAdminAccess', 'supportsAllDrives', 'includeItemsFromAllDrives', 'corpora',
]);
const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));

/**
 * Fail closed on any property whose shape validateInput cannot check: no type, an
 * object, an array of arrays, composition, references or unions. Metadata is
 * retained verbatim. Numeric and length bounds (`maximum`, `maxLength`, `maxItems`
 * and the like) are accepted on the same terms as a manifest action's, which uses
 * them 74 times: validateInput does not read them, the stop's disclosure checks a
 * number's bounds and a string's maxLength, and the provider enforces them.
 */
const BOUNDS = new Set(['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'maxLength', 'minItems', 'maxItems']);
const NUMERIC_TYPES = new Set(['number', 'integer']);

function boundsFit(schema) {
  for (const key of BOUNDS) {
    if (schema[key] === undefined) continue;
    const value = schema[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) return false;
    if (['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf'].includes(key) && !NUMERIC_TYPES.has(schema.type)) return false;
    if (key === 'multipleOf' && value <= 0) return false;
    if (key === 'maxLength' && (schema.type !== 'string' || !Number.isSafeInteger(value) || value < 0)) return false;
    if ((key === 'minItems' || key === 'maxItems') && (schema.type !== 'array' || !Number.isSafeInteger(value) || value < 0)) return false;
  }
  return true;
}

export function supportsCuratedSchema(schema, root = true, depth = 0) {
  if (!plain(schema) || depth > 32) return false;
  const allowed = root
    ? new Set(['type', 'properties', 'required', 'additionalProperties'])
    : new Set(['type', 'enum', 'pattern', 'minLength', 'items', ...BOUNDS]);
  if (Object.keys(schema).some((key) => !allowed.has(key) && !ANNOTATIONS.has(key))) return false;
  if (root) {
    if (schema.type !== 'object' || (schema.additionalProperties !== undefined && schema.additionalProperties !== false)) return false;
    const properties = schema.properties === undefined ? {} : schema.properties;
    if (!plain(properties) || !Object.values(properties).every((value) => supportsCuratedSchema(value, false, depth + 1))) return false;
    if (schema.required !== undefined && (!Array.isArray(schema.required)
      || schema.required.some((field) => typeof field !== 'string' || !Object.hasOwn(properties, field)))) return false;
    return true;
  }
  if (!TYPES.has(schema.type)) return false;
  if (!boundsFit(schema)) return false;
  if (schema.type === 'array' && (!plain(schema.items) || schema.items.type === 'array')) return false;
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
  // Count all copies, including malformed ones. No duplicate may supply metadata
  // while another copy supplies the tool slug in the provider.
  const counts = new Map();
  for (const entry of supplied) {
    try {
      if (typeof entry?.id === 'string') counts.set(entry.id, (counts.get(entry.id) ?? 0) + 1);
    } catch { /* An unreadable entry is diagnosed in the validation pass. */ }
  }
  for (const entry of supplied) {
    let row;
    let reason;
    try {
      row = structuredClone(entry);
      if (!plain(row) || typeof row.id !== 'string'
        || !/^[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9_-]*$/.test(row.id)) reason = 'invalid_id';
      else if (counts.get(row.id) !== 1) reason = 'duplicate_id';
      else {
        const [service, module, action] = row.id.split('.');
        const connector = connectors.find((c) => c.id === service || c.service === service);
        const mod = connector?.manifest?.modules?.[module];
        if (!mod || mod.auth?.provider !== 'catalog' || mod.auth.toolkit !== row.toolkit) reason = 'module_auth_mismatch';
        else if (Object.hasOwn(mod.actions ?? {}, action)) reason = 'manifest_action';
        else if (typeof row.kind !== 'string' || !Object.hasOwn(CURATED_KINDS, row.kind)) reason = 'invalid_kind';
        else if (!(PRIVILEGE_LEVEL[mod.auth.privilege] >= PRIVILEGE_LEVEL[CURATED_KINDS[row.kind].privilege])) reason = 'insufficient_privilege';
        else if (!supportsCuratedSchema(row.input_schema)) reason = 'unsupported_input_schema';
        else if (Object.keys(row.input_schema.properties ?? {}).some((field) => CURATED_FORBIDDEN_INPUT_FIELDS.has(field))) reason = 'forbidden_input_field';
        else if (typeof row.tool !== 'string' || !row.tool || typeof row.summary !== 'string' || !row.summary
          || !Array.isArray(row.key_fields) || row.key_fields.some((field) => typeof field !== 'string'
            || !Object.hasOwn(row.input_schema.properties ?? {}, field))
          || !Array.isArray(row.hint) || row.hint.some((hint) => typeof hint !== 'string')) reason = 'invalid_row';
        else if ((row.kind === 'read' && row.hint.some((hint) => ['createHint', 'updateHint', 'destructiveHint'].includes(hint)))
          || (row.hint.includes('destructiveHint') && row.kind !== 'delete')) reason = 'kind_hint_mismatch';
        else if (typeof catalogProvider.toSlug !== 'function' || catalogProvider.toSlug(row.id) !== row.tool) reason = 'slug_mismatch';
      }
    } catch {
      reason = 'invalid_row';
    }
    if (reason) errors.push({ id: typeof row?.id === 'string' ? row.id : null, reason });
    else rows.push(row);
  }
  return { rows, errors };
}

/**
 * A row's summary is a sentence for a stop ("Create a new Gmail label."); a grant's
 * warning and summary line embed it after "lets your assistant", as a manifest's
 * standing_approval.summary is written ("send Gmail messages").
 * @param {string} summary
 */
export function approvalPhrase(summary) {
  const phrase = summary.trim().replace(/\.$/, '');
  return /^[A-Z][a-z]/.test(phrase) ? phrase[0].toLowerCase() + phrase.slice(1) : phrase;
}

/** Reviewed changes and sends use the same grant checks as manifest actions. */
export function curatedActionDefinition(row) {
  return {
    ...CURATED_KINDS[row.kind],
    ...(['change', 'send'].includes(row.kind)
      ? { standing_approval: { kind: row.kind, summary: approvalPhrase(row.summary) } } : {}),
    description: row.summary,
    execution: { prefer: 'catalog' },
    input: row.input_schema,
  };
}

// These snapshots stay private to the catalog, as the class fields were.
const catalogs = new WeakMap();

export function initializeCatalog(gateway) {
  catalogs.set(gateway, { actions: new Map(), invalidIds: new Set() });
}

export function loadCatalog(gateway) {
  const state = catalogs.get(gateway);
  const curated = loadCuratedActions(gateway.catalogProvider, gateway.connectors);
  for (const row of curated.rows) {
    state.actions.set(row.id, { row, def: curatedActionDefinition(row) });
  }
  state.invalidIds = new Set(curated.errors.map((error) => error.id));
}

export function getCuratedAction(gateway, id) {
  return catalogs.get(gateway).actions.get(id);
}

/** Module grants freeze the currently loaded curated rows too. */
export function curatedModuleActions(gateway, service, module) {
  return [...catalogs.get(gateway).actions.keys()].filter((id) => id.startsWith(`${service}.${module}.`));
}

export function isInvalidCuratedId(gateway, id) {
  return catalogs.get(gateway).invalidIds.has(id);
}

export function lookupModule(gateway, service, module) {
  const connector = gateway.connectors.find((c) => c.id === service || c.service === service);
  if (!connector) return null;
  const mod = connector.manifest?.modules?.[module];
  if (!mod) return null;
  return { connector, mod, auth: mod.auth };
}

export function listActions(gateway, { query, service } = {}) {
  const q = typeof query === 'string' ? query.toLowerCase() : '';
  const actions = [];
  for (const c of gateway.connectors) {
    if (service && c.service !== service && c.id !== service) continue;
    for (const [modName, mod] of Object.entries(c.manifest.modules)) {
      for (const [actName, act] of Object.entries(mod.actions)) {
        const id = `${c.service}.${modName}.${actName}`;
        const description = act.description || '';
        if (q && !id.toLowerCase().includes(q) && !description.toLowerCase().includes(q)) continue;
        actions.push({
          action: id,
          privilege: mod.auth.privilege,
          risk: act.risk,
          confirmation: act.confirmation,
          description: description || null,
        });
      }
    }
  }
  for (const { definition: def } of gateway.hostedActions.values()) {
    if (service && def.service !== service) continue;
    if (q && !`${def.action} ${def.description || ''}`.toLowerCase().includes(q)) continue;
    const { action, privilege, risk, confirmation, description } = def;
    actions.push({ action, privilege, risk, confirmation, description: description || null });
  }
  const seen = new Set(actions.map((a) => a.action));
  for (const c of gateway.classifiers()) {
    if (typeof c.actions !== 'function') continue;
    let ids;
    try { ids = c.actions(); } catch { continue; }
    if (!Array.isArray(ids)) continue;
    for (const id of ids) {
      if (seen.has(id)) continue;
      const parsed = parseActionId(id);
      if (!parsed) continue;
      if (service && parsed.service !== service) continue;
      const def = firstPartyDef(id);
      if (!def) continue;
      const description = def.description || '';
      if (q && !id.toLowerCase().includes(q) && !description.toLowerCase().includes(q)) continue;
      seen.add(id);
      actions.push({
        action: id,
        privilege: def.privilege ?? null,
        risk: def.risk ?? null,
        confirmation: def.confirmation ?? null,
        description: description || null,
      });
    }
  }
  // Append in reviewed order. Existing matches keep their relative rank and
  // remain ahead of new matches; the same substring filter and classifier apply.
  for (const { row, def } of catalogs.get(gateway).actions.values()) {
    const [rowService, module] = row.id.split('.');
    if (seen.has(row.id) || (service && service !== rowService)) continue;
    if (q && !row.id.toLowerCase().includes(q) && !row.summary.toLowerCase().includes(q)) continue;
    const found = gateway.lookupModule(rowService, module);
    actions.push({
      action: row.id,
      privilege: found.auth.privilege,
      risk: def.risk,
      confirmation: def.confirmation,
      description: row.summary,
      curated: true,
      kind: row.kind,
      summary: row.summary,
    });
  }
  return actions;
}

export function classifierSearchAttempt(gateway, args) {
  const query = args.query;
  if (typeof query !== 'string' || query.length === 0) return null;
  if (gateway.classifiers().length === 0) return null;
  const session = gateway.classifierSession();
  if (!session.ok) return { call: false, reason: session.reason };
  if (readClassifierKey(gateway.envPath) == null) return null;
  return { call: true, reason: null };
}

export function searchActions(gateway, args = {}) {
  const actions = gateway.listActions({ query: args.query, service: args.service });
  const attempt = gateway.classifierSearchAttempt(args);
  if (!attempt) return { actions };
  if (!attempt.call) {
    return {
      actions,
      classifier: { path: 'builtin', reason: attempt.reason },
    };
  }
  return gateway.rankSearch(actions, args);
}

export async function rankSearch(gateway, actions, args) {
  const universe = gateway.listActions({ service: args.service })
    .filter((row) => !String(row.action).startsWith('wiser.'));
  const options = universe.map((row) => ({ id: row.action, label: row.description || '' }));
  const answer = await gateway.execute({
    action: 'wiser.decide.choice',
    input: { decision: args.query, options, allow_uncalibrated: true },
  });
  const choice = answer && typeof answer.choice === 'string' ? answer.choice : null;
  const confidence = answer && Object.hasOwn(answer, 'confidence') ? answer.confidence : null;
  const accepted = choice !== null
    && !(typeof answer.status === 'string' && answer.status.length > 0)
    && options.some((opt) => opt.id === choice);
  // The confidence band: a pick below it is not acted on, and today's results stand. Set by rule on a
  // calibration set of its own, the lowest confidence at which the pick was at least as precise as a
  // host choosing, then tested on a second set.
  const inBand = typeof confidence === 'number' && Number.isFinite(confidence)
    && confidence >= 0 && confidence <= 1 && confidence >= SEARCH_PICK_BAND;
  if (!accepted || !inBand) {
    const reason = answer && typeof answer.status === 'string' && answer.status
      ? answer.status
      : (accepted ? 'below-band' : 'not-accepted');
    return {
      actions,
      classifier: { path: 'builtin', reason, choice, confidence },
    };
  }
  const chosen = universe.find((row) => row.action === choice);
  const rest = actions.filter((row) => row.action !== choice);
  return {
    actions: [{ ...chosen, classifier: true }, ...rest],
    classifier: { path: 'classifier', reason: null, choice, confidence },
  };
}

export function describeAction(gateway, id) {
  const hosted = gateway.hostedActions.get(id);
  if (hosted) return structuredClone(hosted.definition);
  const parsed = parseActionId(id);
  if (!parsed) return statusObject(STATUS.NEEDS_CONNECTOR, { action: id ?? null });
  const found = gateway.lookupModule(parsed.service, parsed.module);
  const act = found?.mod?.actions?.[parsed.action];
  if (act) {
    let description = act.description ?? null;
    if (act.output_file) {
      description = `${description ? `${description} ` : ''}This action writes a file into the gateway's outputs/ directory and runs on the local gateway only.`;
    }
    if (act.input_files) {
      description = `${description ? `${description} ` : ''}Calls naming ${act.input_files.field} run only on local stdio, with an aggregate cap of ${act.input_files.max_bytes} bytes. Symbolic links at any component and all multiply linked files are refused; give the real path when an ancestor is linked.`;
    }
    return {
      action: `${parsed.service}.${parsed.module}.${parsed.action}`,
      service: parsed.service,
      module: parsed.module,
      privilege: found.auth.privilege,
      risk: act.risk,
      confirmation: act.confirmation,
      execution: act.execution,
      input: act.input ?? null,
      description,
      ...(act.input_files ? { input_files: { ...act.input_files } } : {}),
      ...(act.output_file ? { output_file: act.output_file, local_only: true } : {}),
    };
  }
  const curated = getCuratedAction(gateway, id);
  if (curated) {
    return {
      action: id,
      service: parsed.service,
      module: parsed.module,
      source: 'catalog',
      curated: true,
      kind: curated.row.kind,
      summary: curated.row.summary,
      key_fields: [...curated.row.key_fields],
      privilege: found.auth.privilege,
      risk: curated.def.risk,
      confirmation: curated.def.confirmation,
      execution: { ...curated.def.execution },
      input: structuredClone(curated.row.input_schema),
      description: curated.row.summary,
    };
  }
  const resolved = resolveAction(id, {
    connectors: gateway.connectors,
    catalogProvider: gateway.catalogProvider,
    classifier: gateway.classifier,
  });
  if (isInvalidCuratedId(gateway, id) && !firstPartyDef(id) && resolved.path !== 'catalog') {
    return statusObject(STATUS.NEEDS_CONNECTOR, { action: id, reason: 'undeclared' });
  }
  // Widened by name: the fallback is an equality test against a path word, not
  // a general "resolution succeeded" test. Filling resolveFirstPartyMcp alone
  // does not change this surface; `first_party_mcp` has to be named here.
  if (resolved.path === 'catalog') {
    return {
      action: id,
      service: parsed.service,
      module: parsed.module,
      source: 'catalog',
      input: null,
    };
  }
  if (resolved.path === 'first_party_mcp') {
    const def = FIRST_PARTY_ACTIONS[id];
    if (!def) {
      return statusObject(STATUS.NEEDS_CONNECTOR, { action: id, reason: 'undeclared' });
    }
    const described = resolved.describe && typeof resolved.describe === 'object' ? resolved.describe : {};
    return {
      action: id,
      service: parsed.service,
      module: parsed.module,
      privilege: def.privilege ?? null,
      risk: def.risk ?? null,
      confirmation: def.confirmation ?? null,
      source: 'first_party_mcp',
      input: def.input ?? described.request ?? null,
      description: def.description ?? null,
      answer: described.answer ?? null,
    };
  }
  if (parsed.service === 'wiser') {
    return gateway.needsSubscriptionResult('missing');
  }
  return statusObject(STATUS.NEEDS_CONNECTOR, { action: id });
}
