// Tools publishes the gateway tools, validates their arguments and dispatches each call.
import { STATUS, statusObject } from './errors.js';

/** The pre-seam sentence. `tools/list` returns this byte for byte when no classifier is loaded. */
const SEARCH_ACTIONS_DESCRIPTION = 'Search action ids this gateway serves, with privilege, risk, and confirmation.';
/** One sentence, at most 120 characters, added only when a classifier is loaded. */
const SEARCH_ACTIONS_PICK = 'An accepted pick is listed first and marked.';
const LABEL_PATTERN = '^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$';
const LABEL_SCHEMA = { type: 'string', pattern: LABEL_PATTERN, description: 'Optional connection name. Omit to use the unlabelled binding' };

const ROOT_PATTERN = '^[A-Za-z0-9_-](?:[A-Za-z0-9 ._-]{0,62}[A-Za-z0-9_-])?$';
const PLAYBOOK_PATTERN = '^[A-Za-z0-9_-](?:[A-Za-z0-9 ._()-]{0,126}[A-Za-z0-9_()-])?$';
const ROOT_SCHEMA = { type: 'string', pattern: ROOT_PATTERN, description: 'The root from which this work is done.' };
const PLAYBOOK_SCHEMA = { type: 'string', pattern: PLAYBOOK_PATTERN, description: 'The Playbook under which this work is done.' };

export const TOOLS = [
  {
    name: 'execute',
    description: 'Run a connector action by id (service.module.action). Returns the result or a status object naming the next step.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Action id, service.module.action' },
        input: { type: 'object', description: 'Action arguments' },
        root: ROOT_SCHEMA,
        playbook: PLAYBOOK_SCHEMA,
        label: LABEL_SCHEMA,
        confirm: { type: 'boolean', description: 'True only after a person approved a needs_confirmation stop for this exact input. The approval is used once. A confirm with no matching stop is answered with a fresh stop' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  },
  {
    name: 'start_connect',
    description: 'Begin a human connect flow for a service module. Returns a link to open or a file to write. Never completes a grant and never accepts a key.',
    inputSchema: {
      type: 'object',
      properties: {
        service: { type: 'string' },
        module: { type: 'string' },
        label: LABEL_SCHEMA,
      },
      required: ['service', 'module'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  {
    name: 'connect_status',
    description: 'Ask the provider what a grant\'s status is and write it to the connection record (metadata only). Answers connected only when the provider says active and a connector still declares the module; a row whose connector was retired is answered needs_connector, refreshed when the provider gave a status to refresh it with.',
    inputSchema: {
      type: 'object',
      properties: {
        service: { type: 'string' },
        module: { type: 'string' },
        label: LABEL_SCHEMA,
      },
      required: ['service', 'module'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  },
  {
    name: 'disconnect',
    description: 'Revoke a connected credential at the provider and remove every local record of it. DESTRUCTIVE: one credential backs every module of its toolkit that has no grant of its own, so this ends all of them, not only the module named. Stops for confirmation first and names what it will end.',
    inputSchema: {
      type: 'object',
      properties: {
        service: { type: 'string' },
        module: { type: 'string' },
        label: LABEL_SCHEMA,
        provider_account_id: { type: 'string', description: 'The account the confirmation named. Required with confirm, and refused if the binding has changed since' },
        confirm: { type: 'boolean', description: 'True only after a person approved a needs_confirmation stop for this exact input. The approval is used once. A confirm with no matching stop is answered with a fresh stop' },
      },
      required: ['service', 'module'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  },
  {
    name: 'standing_approvals',
    description: "Propose a standing approval, grant it after the person's explicit yes to the warning, list approvals, or revoke one.",
    inputSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['propose', 'grant', 'list', 'revoke'], description: 'Choose whether to propose, grant, list or revoke a standing approval.' },
        actions: { type: 'array', minItems: 1, maxItems: 20, items: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]*\\.[a-z0-9][a-z0-9-]*\\.[a-z0-9][a-z0-9_.-]*$' }, description: 'Name the eligible action ids to approve within one module.' },
        module: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]*\\.[a-z0-9][a-z0-9-]*$', description: 'Name one service.module to approve all its currently eligible actions.' },
        label: { ...LABEL_SCHEMA, description: 'Name the connection label, or omit it for the unlabelled connection.' },
        root: ROOT_SCHEMA,
        playbook: PLAYBOOK_SCHEMA,
        where: { type: 'object', additionalProperties: { type: 'array', minItems: 1, maxItems: 20, items: { type: 'string', minLength: 1, maxLength: 120 } }, description: 'Restrict declared string fields to these exact allowed values.' },
        days: { type: 'integer', minimum: 1, maximum: 365, description: 'Set the duration in days, at most 7 for heightened actions, or 90 for a grant that only sends and names a Playbook.' },
        confirmed: { type: 'boolean', description: 'Use true only after the person answers yes to this exact proposed warning.' },
        id: { type: 'string', description: 'Identify the standing approval to revoke.' },
      },
      required: ['mode'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  {
    name: 'list_connections',
    description: 'Check project-key configuration, then list connection records. Returns needs_provider when unconfigured. Metadata only; never tokens.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: 'search_actions',
    description: SEARCH_ACTIONS_DESCRIPTION,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        service: { type: 'string' },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: 'describe_action',
    description: 'Return the input schema and manifest row for an action id.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Action id, service.module.action' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
];

const NAME_RE = /^[a-z0-9][a-z0-9-]*$/;
const ACTION_RE = /^[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9_.-]*$/;
const LABEL_RE = new RegExp(LABEL_PATTERN);
const ROOT_RE = new RegExp(ROOT_PATTERN);
const PLAYBOOK_RE = new RegExp(PLAYBOOK_PATTERN);
const MODULE_RE = /^[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/;

function isPlainObject(v) {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

/**
 * The published inputSchema is enforced here, before anything is audited or echoed,
 * so an argument that is not an identifier never reaches a log line or a result.
 * @param {string} name
 * @param {unknown} args
 */
export function validateArgs(name, args) {
  const bad = (field) => statusObject(STATUS.INVALID_ARGUMENTS, { tool: name, field });
  if (!isPlainObject(args)) return name === 'standing_approvals'
    ? statusObject(STATUS.INVALID_ARGUMENTS, { tool: name, field: 'arguments', reason: 'type' })
    : bad('arguments');
  const a = args;
  // Every tool publishes additionalProperties: false, so an undeclared key is refused by name,
  // never ignored: a host's misspelled `inputs` once ran an action with no input at all.
  const declared = TOOLS.find((tool) => tool.name === name)?.inputSchema.properties;
  if (declared) {
    for (const key of Object.keys(a)) {
      if (!Object.hasOwn(declared, key)) {
        return statusObject(STATUS.INVALID_ARGUMENTS, { tool: name, field: key, reason: 'not_declared' });
      }
    }
  }
  if (['execute', 'start_connect', 'connect_status', 'disconnect', 'standing_approvals'].includes(name)
    && Object.hasOwn(a, 'label')
    && (typeof a.label !== 'string' || !LABEL_RE.test(a.label))) {
    return name === 'standing_approvals'
      ? statusObject(STATUS.INVALID_ARGUMENTS, { tool: name, field: 'label', reason: 'pattern' })
      : bad('label');
  }
  const optString = (k, re) => a[k] === undefined || (typeof a[k] === 'string' && (!re || re.test(a[k])));
  switch (name) {
    case 'execute':
      if (typeof a.action !== 'string' || !ACTION_RE.test(a.action)) return bad('action');
      if (a.input !== undefined && !isPlainObject(a.input)) return bad('input');
      if (a.confirm !== undefined && typeof a.confirm !== 'boolean') return bad('confirm');
      if (!optString('root', ROOT_RE)) return bad('root');
      if (!optString('playbook', PLAYBOOK_RE)) return bad('playbook');
      return null;
    case 'standing_approvals': {
      const invalid = (field, reason) => statusObject(STATUS.INVALID_ARGUMENTS, { tool: name, field, reason });
      const schema = TOOLS.find((tool) => tool.name === name).inputSchema;
      if (!schema.properties.mode.enum.includes(a.mode)) return invalid('mode', 'enum');
      if (!optString('root', ROOT_RE)) return invalid('root', 'pattern');
      if (!optString('playbook', PLAYBOOK_RE)) return invalid('playbook', 'pattern');
      if (!optString('module', MODULE_RE)) return invalid('module', 'pattern');
      if (!optString('id')) return invalid('id', 'type');
      if (a.confirmed !== undefined && typeof a.confirmed !== 'boolean') return invalid('confirmed', 'type');
      if (a.actions !== undefined) {
        if (!Array.isArray(a.actions)) return invalid('actions', 'type');
        if (a.actions.length < 1 || a.actions.length > 20) return invalid('actions', a.actions.length < 1 ? 'min' : 'max');
        if (a.actions.some((id) => typeof id !== 'string' || !ACTION_RE.test(id))) return invalid('actions', 'pattern');
      }
      if (a.days !== undefined) {
        if (!Number.isInteger(a.days)) return invalid('days', 'type');
        if (a.days < 1 || a.days > 365) return invalid('days', a.days < 1 ? 'min' : 'max');
      }
      if (a.where !== undefined) {
        if (!isPlainObject(a.where)) return invalid('where', 'type');
        for (const [field, values] of Object.entries(a.where)) {
          const at = `where.${field}`;
          if (!Array.isArray(values)) return invalid(at, 'type');
          if (values.length < 1 || values.length > 20) return invalid(at, values.length < 1 ? 'min' : 'max');
          if (values.some((value) => typeof value !== 'string')) return invalid(at, 'type');
          if (values.some((value) => value.length < 1 || value.length > 120)) return invalid(at, 'length');
        }
      }
      return null;
    }
    case 'start_connect':
    case 'connect_status':
      if (typeof a.service !== 'string' || !NAME_RE.test(a.service)) return bad('service');
      if (typeof a.module !== 'string' || !NAME_RE.test(a.module)) return bad('module');
      return null;
    case 'disconnect':
      if (typeof a.service !== 'string' || !NAME_RE.test(a.service)) return bad('service');
      if (typeof a.module !== 'string' || !NAME_RE.test(a.module)) return bad('module');
      // The account id comes from the provider and is not ours to shape, so it is
      // checked for being a non-empty string and nothing more. It is never used to
      // build a path here; the adapter encodes it.
      if (a.provider_account_id !== undefined
        && (typeof a.provider_account_id !== 'string' || a.provider_account_id.length === 0)) return bad('provider_account_id');
      if (a.confirm !== undefined && typeof a.confirm !== 'boolean') return bad('confirm');
      return null;
    case 'search_actions':
      if (!optString('query')) return bad('query');
      if (!optString('service', NAME_RE)) return bad('service');
      return null;
    case 'describe_action':
      if (typeof a.action !== 'string' || !ACTION_RE.test(a.action)) return bad('action');
      return null;
    case 'list_connections':
      return null;
    default:
      return null;
  }
}

export function listTools(gateway) {
  if (gateway.classifiers().length === 0) return TOOLS;
  return TOOLS.map((tool) => {
    if (tool.name !== 'search_actions') return tool;
    return {
      ...tool,
      description: `${SEARCH_ACTIONS_DESCRIPTION} ${SEARCH_ACTIONS_PICK}`,
    };
  });
}

export async function callTool(gateway, name, args = {}) {
  const invalid = validateArgs(name, args);
  if (invalid) return invalid;
  switch (name) {
    case 'execute':
      return gateway.execute(args);
    case 'start_connect':
      return gateway.startConnect(args);
    case 'connect_status':
      return gateway.connectStatus(args);
    case 'disconnect':
      return gateway.disconnect(args);
    case 'standing_approvals':
      return gateway.standingApprovalsTool(args);
    case 'list_connections':
      return gateway.listConnections();
    case 'search_actions':
      return gateway.searchActions(args);
    case 'describe_action':
      return gateway.describeAction(args.action ?? args.id);
    default: {
      const err = new Error(`unknown tool "${name}"`);
      err.unknownTool = true;
      throw err;
    }
  }
}
