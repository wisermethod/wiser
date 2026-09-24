/**
 * Four-step resolution for an action id. The order is code, not configuration.
 *
 * 1. A connector module that declares the action
 * 2. A registered first-party classifier loaded by `--classifier`
 * 3. The catalog provider, if it maps the id
 * 4. none -> needs_connector (or needs_subscription for a wiser.* id with no classifier)
 */

/**
 * Privilege, risk, confirmation, input schema and answer shape a first-party
 * action carries. The gateway decides these; a classifier directory has no
 * manifest. Every first-party action reads nothing durable and changes
 * nothing, so they are `read` / `low` / `none`.
 *
 * `answer` is the success object `executeFirstParty` checks the adapter's
 * result against. It is not the object `describe` serves, and `meta` is not a
 * member of it. A host may ignore `meta`. The checker allows it, and allows
 * any other extra key, because the reserved channel has to survive and a
 * status object is refused by a different branch before this shape is read.
 *
 * Shared shape only. An executable first-party action requires an explicit
 * entry in `FIRST_PARTY_ACTIONS`; this object is not a fallback for an id
 * the gateway does not declare.
 */
export const FIRST_PARTY_DEFAULT = {
  privilege: 'read',
  risk: 'low',
  confirmation: 'none',
  description: null,
  input: null,
};

export const FIRST_PARTY_ACTIONS = {
  'wiser.route.roster': {
    privilege: 'read',
    risk: 'low',
    confirmation: 'none',
    description: 'Hold a roster of primitives and return its digest.',
    input: {
      type: 'object',
      properties: { rows: { type: 'array' } },
      required: ['rows'],
    },
    answer: {
      roster_sha256: { type: 'string' },
      accepted: { type: 'number' },
      rejected: { type: 'number' },
    },
  },
  'wiser.route.ask': {
    privilege: 'read',
    risk: 'low',
    confirmation: 'none',
    description: 'Route an unnamed ask to a primitive on a held roster.',
    input: {
      type: 'object',
      properties: {
        ask: { type: 'string' },
        roster_sha256: { type: 'string' },
      },
      required: ['ask', 'roster_sha256'],
    },
    // `confidence` is null on the pass-2 abstention, where no shortlist question
    // was sent. Absent is a missing probability; null is that abstention.
    answer: {
      family: { type: 'string' },
      target: { type: 'string', nullable: true },
      confidence: { type: 'unit', nullable: true },
      pass: { type: 'boolean' },
    },
  },
  'wiser.gate.check': {
    privilege: 'read',
    risk: 'low',
    confirmation: 'none',
    description: 'Judge Success-line criteria against a deliverable.',
    input: {
      type: 'object',
      properties: {
        kind: { type: 'string' },
        criteria: { type: 'array' },
        deliverable: { type: 'string' },
        source_input: { type: 'string' },
        instruction_file: { type: 'string' },
      },
      required: ['kind', 'criteria', 'deliverable'],
    },
    answer: {
      judgments: {
        type: 'array',
        items: {
          index: { type: 'number', roster: 'criteria' },
          verdict: { enum: ['fail', 'below_threshold'] },
          p: { type: 'unit' },
        },
      },
    },
  },
  'wiser.decide.choice': {
    privilege: 'read',
    risk: 'low',
    confirmation: 'none',
    description: 'Choose among options for a closed decision.',
    input: {
      type: 'object',
      properties: {
        decision: { type: 'string' },
        options: { type: 'array' },
        context: { type: 'string' },
        allow_uncalibrated: { type: 'boolean' },
      },
      required: ['decision', 'options'],
    },
    answer: {
      choice: { type: 'string', roster: 'options' },
      confidence: { type: 'unit' },
      calibrated: { const: false },
    },
  },
  'wiser.recall.rank': {
    privilege: 'read',
    risk: 'low',
    confirmation: 'none',
    description: 'Rank candidates for a question.',
    input: {
      type: 'object',
      properties: {
        question: { type: 'string' },
        candidates: { type: 'array' },
        allow_uncalibrated: { type: 'boolean' },
      },
      required: ['question', 'candidates'],
    },
    answer: {
      ranked: {
        type: 'array',
        items: {
          id: { type: 'string', roster: 'candidates' },
          p: { type: 'unit' },
          calibrated: { const: false },
        },
      },
      calibrated: { const: false },
    },
  },
};

function isPlain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * The set of choices the call itself sent. `none` is always a decide.choice
 * option. Candidate ids and criteria indexes follow the adapter's own reading
 * of those arrays, so a well-formed answer is not refused for a numbering the
 * adapter is specified to use.
 * @param {string} kind
 * @param {unknown} input
 */
function rosterValues(kind, input) {
  const args = isPlain(input) ? input : {};
  if (kind === 'options') {
    const keys = new Set(['none']);
    for (const opt of Array.isArray(args.options) ? args.options : []) {
      if (typeof opt === 'string') keys.add(opt);
      else if (isPlain(opt) && typeof opt.id === 'string') keys.add(opt.id);
    }
    return keys;
  }
  if (kind === 'candidates') {
    const keys = new Set();
    const list = Array.isArray(args.candidates) ? args.candidates : [];
    for (let i = 0; i < list.length; i += 1) {
      const c = list[i];
      keys.add(isPlain(c) && c.id != null ? String(c.id) : String(i));
    }
    return keys;
  }
  if (kind === 'elements') {
    const list = Array.isArray(args.elements) ? args.elements : [];
    const keys = new Set();
    for (let i = 0; i < list.length; i += 1) keys.add(i);
    return keys;
  }
  if (kind === 'criteria') {
    const keys = new Set();
    const list = Array.isArray(args.criteria) ? args.criteria : [];
    for (let i = 0; i < list.length; i += 1) {
      const item = list[i];
      const index = isPlain(item) && typeof item.index === 'number' && Number.isFinite(item.index)
        ? item.index
        : i;
      keys.add(index);
    }
    return keys;
  }
  return new Set();
}

function valueMatches(value, spec, input) {
  if (spec.nullable && value === null) return true;
  if (Object.hasOwn(spec, 'const')) return value === spec.const;
  if (spec.enum) return spec.enum.includes(value);
  if (spec.type === 'present') return value !== undefined;
  if (spec.type === 'string') {
    if (typeof value !== 'string') return false;
  } else if (spec.type === 'boolean') {
    if (typeof value !== 'boolean') return false;
  } else if (spec.type === 'number' || spec.type === 'integer' || spec.type === 'unit') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return false;
    if (spec.type === 'integer' && !Number.isInteger(value)) return false;
    if (spec.type === 'unit' && (value < 0 || value > 1)) return false;
  } else if (spec.type === 'array') {
    if (!Array.isArray(value)) return false;
    if (spec.items) {
      for (const item of value) {
        if (!isPlain(item) || !fieldsMatch(item, spec.items, input)) return false;
      }
    }
    return true;
  } else {
    return false;
  }
  if (spec.roster && !rosterValues(spec.roster, input).has(value)) return false;
  return true;
}

function fieldsMatch(value, fields, input) {
  if (!isPlain(value)) return false;
  for (const [name, spec] of Object.entries(fields)) {
    if (!Object.hasOwn(value, name) || !valueMatches(value[name], spec, input)) return false;
  }
  return true;
}

/**
 * True when a success result matches the action's declared answer.
 * Does not coerce. `meta` is not part of the declaration and is ignored.
 * Status objects are not this function's job; the caller lets them through.
 * @param {string} actionId
 * @param {unknown} input
 * @param {unknown} result
 */
export function validateFirstPartyAnswer(actionId, input, result) {
  const def = FIRST_PARTY_ACTIONS[actionId];
  if (!def || !def.answer) return false;
  return fieldsMatch(result, def.answer, input);
}

/**
 * @param {string} actionId
 * @returns {typeof FIRST_PARTY_DEFAULT | null}
 */
export function firstPartyDef(actionId) {
  return FIRST_PARTY_ACTIONS[actionId] || null;
}

/**
 * @param {string} id
 * @returns {{ service: string, module: string, action: string } | null}
 */
export function parseActionId(id) {
  if (typeof id !== 'string' || !id) return null;
  const parts = id.split('.');
  if (parts.length < 3) return null;
  if (parts.some((p) => p.length === 0)) return null;
  return {
    service: parts[0],
    module: parts[1],
    action: parts.slice(2).join('.'),
  };
}

/**
 * Resolve a `wiser.*` id against a classifier directory loaded by `--classifier`.
 *
 * The return is spread into `resolveAction`'s result (`{ path, actionId, ...mcp }`).
 * Every key here is therefore a field on that result, and each is supplied on
 * purpose:
 *
 * - `fn` — callable dispatch target. Signature is `(input, key) =>
 *   classifier.execute({ actionId, arguments, key })`, not the connector
 *   `(input, ctx)` shape. The execute branch calls this itself and never falls
 *   through to `resolved.fn(input, ctx)`. `key` is the platform-file value (or
 *   null), handed at call time so the adapter does not read `process.env`.
 * - `def` — gateway-declared privilege, risk, confirmation, description, and
 *   input schema, or null when the adapter listed an id the gateway does not
 *   declare. Policy, `validateInput`, and the confirmation stop read these,
 *   never `act`, which is undefined for a first-party id. Execute refuses a
 *   null `def` rather than inventing `read` / `low` / `none`.
 * - `parsed` — service / module / action already split.
 * - `describe` — the adapter's `describe(id)` row (`request` / `answer`), or null.
 * - `classifier` — the adapter object that matched, if a caller needs it.
 *
 * Returns null when no classifier is loaded, the id is not `wiser.*`, or no
 * loaded classifier lists the id in `actions()`. An advertised id the gateway
 * does not declare still resolves, with `def` null, so execute can refuse it
 * as undeclared.
 *
 * @param {string} actionId
 * @param {object | object[] | null | undefined} [classifier]
 * @returns {object | null}
 */
export function resolveFirstPartyMcp(actionId, classifier) {
  const list = Array.isArray(classifier) ? classifier : (classifier ? [classifier] : []);
  if (list.length === 0) return null;
  const parsed = parseActionId(actionId);
  if (!parsed || parsed.service !== 'wiser') return null;
  for (const c of list) {
    if (!c || typeof c.actions !== 'function') continue;
    let ids;
    try {
      ids = c.actions();
    } catch {
      continue;
    }
    if (!Array.isArray(ids) || !ids.includes(actionId)) continue;
    const def = FIRST_PARTY_ACTIONS[actionId] || null;
    let described = null;
    if (typeof c.describe === 'function') {
      try { described = c.describe(actionId); } catch { described = null; }
    }
    return {
      fn: async (input, key) => {
        if (typeof c.execute !== 'function') {
          return { status: 'unavailable', reason: 'unknown action id' };
        }
        return c.execute({ actionId, arguments: input ?? {}, key });
      },
      def,
      parsed,
      describe: described,
      classifier: c,
    };
  }
  return null;
}

/**
 * @param {string} actionId
 * @param {object[]} connectors
 * @returns {object | null}
 */
export function resolveConnector(actionId, connectors) {
  const parsed = parseActionId(actionId);
  if (!parsed) return null;
  const list = Array.isArray(connectors) ? connectors : [];
  const connector = list.find((c) => c.id === parsed.service || c.service === parsed.service);
  if (!connector) return null;
  const mod = connector.manifest?.modules?.[parsed.module];
  if (!mod) return null;
  const def = mod.actions?.[parsed.action];
  if (!def) return null;
  const fn = connector.impl?.modules?.[parsed.module]?.[parsed.action];
  if (typeof fn !== 'function') return null;
  return {
    path: 'connector',
    actionId,
    parsed,
    connector,
    def,
    fn,
    auth: mod.auth,
    unwrapToken: Boolean(mod.unwrap_token),
    fallback: mod.fallback === 'none' ? 'none' : 'catalog',
  };
}

/**
 * @param {string} actionId
 * @param {{ toSlug?: (id: string) => string | null }} [catalogProvider]
 * @returns {object | null}
 */
export function resolveCatalog(actionId, catalogProvider) {
  if (!catalogProvider || typeof catalogProvider.toSlug !== 'function') return null;
  const slug = catalogProvider.toSlug(actionId);
  if (!slug) return null;
  return { path: 'catalog', actionId };
}

/**
 * @param {string} actionId
 * @param {{ connectors?: object[], catalogProvider?: { toSlug?: Function }, classifier?: object | object[] | null }} deps
 * @returns {{ path: 'connector' | 'first_party_mcp' | 'catalog' | 'none', actionId: string, [k: string]: unknown }}
 */
export function resolveAction(actionId, { connectors = [], catalogProvider, classifier } = {}) {
  const connector = resolveConnector(actionId, connectors);
  if (connector) return connector;

  const mcp = resolveFirstPartyMcp(actionId, classifier);
  if (mcp) return { path: 'first_party_mcp', actionId, ...mcp };

  const catalog = resolveCatalog(actionId, catalogProvider);
  if (catalog) return catalog;

  return { path: 'none', actionId };
}
