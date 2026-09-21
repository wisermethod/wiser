import { randomUUID } from 'node:crypto';
import { buildContext } from './context.js';
import { STATUS, StatusSignal, classifierAuditStatus, isStatusObject, sanitizeError, statusObject, vendorErrorFrom } from './errors.js';
import { composeSummary, discloseInput } from './disclosure.js';
import { validateInput } from './input-schema.js';
import { evaluate } from './policy.js';
import { readProviderUserId, writeProviderUserIdIfEmpty } from './paths.js';
import { readClassifierKey } from './paths.js';
import { FIRST_PARTY_ACTIONS, firstPartyDef, parseActionId, resolveAction } from './resolve.js';
// The vocabularies a store row's own `privilege` and `provider` are checked against,
// taken from where the manifest validator already defines them rather than restated.
import { AUTH_PROVIDERS, PRIVILEGES } from './manifest.js';

const CLASSIFIER_SETUP = 'Open the credential file the gateway created, paste the classifier key after WISER_CLASSIFIER_KEY=, save, and restart. Do not paste the key into chat.';
const CLASSIFIER_SETUP_MISSING = 'Pass --classifier with an absolute path to a classifier directory, set WISER_CLASSIFIER_KEY in the credential file, and restart. Do not paste the key into chat.';

/**
 * Grant states a provider may report that are not ACTIVE, and that the gateway
 * records on the connection row as the reason it stopped.
 *
 * One definition because this list lived in two places, and Session 2 of the
 * grant-lifecycle build added `ABSENT` to it: a provider answering 404 means the
 * account no longer exists there, where `INACTIVE` means it exists and is switched
 * off. Two copies would have taken the new word in one place and silently downgraded
 * it in the other, which is this family's named defect shape.
 */
const STOPPED_GRANT_STATES = ['EXPIRED', 'FAILED', 'INACTIVE', 'INITIATED', 'ABSENT'];

const TOOLS = [
  {
    name: 'execute',
    description: 'Run a connector action by id (service.module.action). Returns the result or a status object naming the next step.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Action id, service.module.action' },
        input: { type: 'object', description: 'Action arguments' },
        confirm: { type: 'boolean', description: 'True only after a person approved a needs_confirmation stop' },
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
        provider_account_id: { type: 'string', description: 'The account the confirmation named. Required with confirm, and refused if the binding has changed since' },
        confirm: { type: 'boolean', description: 'True only after a person approved a needs_confirmation stop' },
      },
      required: ['service', 'module'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  },
  {
    name: 'list_connections',
    description: 'Check project-key configuration, then list connection records. Returns needs_provider when unconfigured. Metadata only; never tokens.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: 'search_actions',
    description: 'Search action ids this gateway serves, with privilege, risk, and confirmation.',
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

function nowIso() {
  return new Date().toISOString();
}

const NAME_RE = /^[a-z0-9][a-z0-9-]*$/;
const ACTION_RE = /^[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9_.-]*$/;

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
  if (!isPlainObject(args)) return bad('arguments');
  const a = args;
  const optString = (k, re) => a[k] === undefined || (typeof a[k] === 'string' && (!re || re.test(a[k])));
  switch (name) {
    case 'execute':
      if (typeof a.action !== 'string' || !ACTION_RE.test(a.action)) return bad('action');
      if (a.input !== undefined && !isPlainObject(a.input)) return bad('input');
      if (a.confirm !== undefined && typeof a.confirm !== 'boolean') return bad('confirm');
      return null;
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

function isActive(record) {
  return Boolean(record && record.status === 'ACTIVE');
}

// Omit a toolkit when two ACTIVE accounts share its raw key or its CUSTOM_-stripped key.
function activeAccountIdsByToolkit(accounts) {
  const idsByKey = new Map();
  const addId = (key, id) => {
    if (!idsByKey.has(key)) idsByKey.set(key, new Set());
    idsByKey.get(key).add(id);
  };
  for (const account of accounts) {
    if (!account || account.status !== 'ACTIVE' || !account.id || !account.toolkit) continue;
    const key = String(account.toolkit).toUpperCase();
    addId(key, account.id);
    addId(key.replace(/^CUSTOM_/, ''), account.id);
  }
  const ambiguousIds = new Set();
  for (const ids of idsByKey.values()) {
    if (ids.size > 1) {
      for (const id of ids) ambiguousIds.add(id);
    }
  }
  const byToolkit = new Map();
  for (const [key, ids] of idsByKey) {
    if (ids.size !== 1) continue;
    const [id] = ids;
    if (ambiguousIds.has(id)) continue;
    byToolkit.set(key, id);
  }
  return byToolkit;
}

/**
 * Connection gateway: resolve, policy, execute, connect.
 */
export class ConnectionGateway {
  /**
   * @param {object} opts
   */
  constructor(opts) {
    this.home = opts.home;
    this.role = opts.role || 'runtime';
    this.harness = opts.harness || 'unknown';
    this.store = opts.store;
    this.policy = opts.policy;
    this.audit = opts.audit;
    this.authProvider = opts.authProvider || null;
    this.catalogProvider = opts.catalogProvider || null;
    this.localFileProvider = opts.localFileProvider || null;
    this.authConfigured = opts.authConfigured !== undefined
      ? Boolean(opts.authConfigured)
      : (typeof this.authProvider?.isConfigured === 'function' ? this.authProvider.isConfigured() : Boolean(this.authProvider));
    this.connectors = Array.isArray(opts.connectors) ? opts.connectors : [];
    this.envPath = opts.envPath || null;
    this.classifier = opts.classifier || null;
    /** @type {Set<string>} */
    this.confirmedOnce = new Set();
  }

  classifiers() {
    if (!this.classifier) return [];
    return Array.isArray(this.classifier) ? this.classifier : [this.classifier];
  }

  needsSubscriptionResult(kind) {
    return statusObject(STATUS.NEEDS_SUBSCRIPTION, {
      setup: kind === 'missing' ? CLASSIFIER_SETUP_MISSING : CLASSIFIER_SETUP,
    });
  }

  /**
   * Identity the provider sees. Env `WISER_USER_ID` wins; otherwise the store;
   * a newly generated id is written into an empty env line and never overwrites
   * a key or a user id that is already set.
   * @returns {string}
   */
  /**
   * Provider accounts this process has revoked. Hydration and any other writer that
   * works from a provider listing must not reinstate one. Not persisted: it guards an
   * in-flight response within one process, and the cross-process case is the unlocked
   * store race recorded in `src/store.js`.
   */
  get revokedAccounts() {
    if (!this._revokedAccounts) this._revokedAccounts = new Set();
    return this._revokedAccounts;
  }

  resolveUserId() {
    const fromEnv = readProviderUserId(this.envPath);
    if (fromEnv) {
      const doc = this.store.read();
      if (doc.userId !== fromEnv) {
        doc.userId = fromEnv;
        this.store.write(doc);
      }
      return fromEnv;
    }
    const fromStore = this.store.getUserId();
    writeProviderUserIdIfEmpty(this.envPath, fromStore);
    return fromStore;
  }

  listTools() {
    return TOOLS;
  }

  /**
   * @param {string} name
   * @param {object} [args]
   */
  async callTool(name, args = {}) {
    const invalid = validateArgs(name, args);
    if (invalid) return invalid;
    switch (name) {
      case 'execute':
        return this.execute(args);
      case 'start_connect':
        return this.startConnect(args);
      case 'connect_status':
        return this.connectStatus(args);
      case 'disconnect':
        return this.disconnect(args);
      case 'list_connections':
        return this.listConnections();
      case 'search_actions':
        return this.searchActions(args);
      case 'describe_action':
        return this.describeAction(args.action ?? args.id);
      default: {
        const err = new Error(`unknown tool "${name}"`);
        err.unknownTool = true;
        throw err;
      }
    }
  }

  lookupModule(service, module) {
    const connector = this.connectors.find((c) => c.id === service || c.service === service);
    if (!connector) return null;
    const mod = connector.manifest?.modules?.[module];
    if (!mod) return null;
    return { connector, mod, auth: mod.auth };
  }

  providerFor(auth) {
    if (auth?.provider === 'local-file') return this.localFileProvider;
    return this.authProvider;
  }

  needsProviderCredential(auth) {
    if (!auth) return !this.authConfigured;
    if (auth.provider === 'local-file') return false;
    return !this.authConfigured;
  }

  needsProviderResult() {
    const setup = typeof this.authProvider?.setupText === 'function'
      ? this.authProvider.setupText()
      : 'Open the credential file the gateway created, paste the project key after WISER_AUTH_PROVIDER_KEY=, save, and restart. Do not paste the key into chat.';
    return statusObject(STATUS.NEEDS_PROVIDER, { setup });
  }

  /**
   * @param {string} op
   * @param {Record<string, unknown>} fields
   * @param {() => Promise<unknown>} fn
   */
  async withAudit(op, fields, fn) {
    const started = Date.now();
    const cid = fields.cid || randomUUID();
    const line = {
      harness: this.harness,
      role: this.role,
      op,
      cid,
      path: fields.path ?? null,
      action: fields.action ?? null,
      service: fields.service ?? null,
      module: fields.module ?? null,
      privilege: fields.privilege ?? null,
      provider_account_id: fields.provider_account_id ?? null,
    };
    let result;
    try {
      result = await fn(line);
      return result;
    } catch (err) {
      if (err instanceof StatusSignal) {
        result = err.object;
        return result;
      }
      line.status = 'error';
      throw err;
    } finally {
      line.ms = Date.now() - started;
      if (result && isStatusObject(result)) line.status = result.status;
      else if (result && result.status === 'connected') line.status = 'connected';
      else if (result && (result.status === 'link' || result.status === 'file')) line.status = result.status;
      else if (result && result.status === 'disconnected') line.status = 'disconnected';
      else if (line.path === 'first_party_mcp' && result && typeof result.status === 'string' && result.status) {
        line.status = classifierAuditStatus(result.status);
      } else if (result && !line.status) line.status = 'ok';
      this.audit.write(line);
    }
  }

  listConnections() {
    if (this.needsProviderCredential()) return this.needsProviderResult();
    return this.hydrateFromProvider().then(() => ({ connections: this.store.listConnections() }));
  }

  /**
   * Copy ACTIVE grants the provider already holds for this user id into the
   * local store as metadata. Never tokens. Do not overwrite an ACTIVE row.
   * Skip a toolkit that has more than one ACTIVE account. Local-file modules
   * are not hydrated.
   */
  async hydrateFromProvider() {
    const list = this.authProvider?.listAccounts;
    if (typeof list !== 'function') return;
    let accounts;
    try {
      accounts = await list.call(this.authProvider, { userId: this.resolveUserId() });
    } catch {
      return;
    }
    if (!Array.isArray(accounts) || accounts.length === 0) return;

    const byToolkit = activeAccountIdsByToolkit(accounts);

    for (const connector of this.connectors) {
      const service = connector.id || connector.service;
      const modules = connector.manifest?.modules || {};
      for (const [module, definition] of Object.entries(modules)) {
        const auth = definition?.auth;
        if (!auth || auth.provider === 'local-file') continue;
        const toolkit = auth.toolkit && String(auth.toolkit).toUpperCase();
        if (!toolkit) continue;
        const accountId = byToolkit.get(toolkit) || byToolkit.get(toolkit.replace(/^CUSTOM_/, ''));
        if (!accountId) continue;
        // A listing captured before a teardown still carries the revoked account. Writing
        // it back recreates the stale ACTIVE rows this build exists to remove, and
        // checking whether a row exists cannot catch it, because writing missing rows is
        // what hydration is for.
        if (this.revokedAccounts.has(accountId)) continue;
        const existing = this.store.getConnection({ service, module });
        if (isActive(existing) && existing.provider_account_id) continue;
        this.store.putConnection({
          service,
          module,
          privilege: auth.privilege,
          provider: auth.provider,
          provider_account_id: accountId,
          scopes: [],
          status: 'ACTIVE',
        });
      }
    }
  }

  searchActions({ query, service } = {}) {
    const q = typeof query === 'string' ? query.toLowerCase() : '';
    const actions = [];
    for (const c of this.connectors) {
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
    const seen = new Set(actions.map((a) => a.action));
    for (const c of this.classifiers()) {
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
    return { actions };
  }

  describeAction(id) {
    const parsed = parseActionId(id);
    if (!parsed) return statusObject(STATUS.NEEDS_CONNECTOR, { action: id ?? null });
    const found = this.lookupModule(parsed.service, parsed.module);
    const act = found?.mod?.actions?.[parsed.action];
    if (act) {
      return {
        action: `${parsed.service}.${parsed.module}.${parsed.action}`,
        service: parsed.service,
        module: parsed.module,
        privilege: found.auth.privilege,
        risk: act.risk,
        confirmation: act.confirmation,
        execution: act.execution,
        input: act.input ?? null,
        description: act.description ?? null,
      };
    }
    const resolved = resolveAction(id, {
      connectors: this.connectors,
      catalogProvider: this.catalogProvider,
      classifier: this.classifier,
    });
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
      return this.needsSubscriptionResult('missing');
    }
    return statusObject(STATUS.NEEDS_CONNECTOR, { action: id });
  }

  async execute({ action, input, confirm } = {}) {
    return this.withAudit('execute', { action: action ?? null }, async (line) => {
      const parsed = parseActionId(action);
      if (!parsed) {
        line.path = 'none';
        return statusObject(STATUS.NEEDS_CONNECTOR, { action: action ?? null });
      }
      line.service = parsed.service;
      line.module = parsed.module;

      const found = this.lookupModule(parsed.service, parsed.module);
      const act = found?.mod?.actions?.[parsed.action];
      const auth = found?.auth;
      const firstParty = !act ? firstPartyDef(action) : null;
      const privilege = auth?.privilege ?? firstParty?.privilege;
      const risk = act?.risk ?? firstParty?.risk;
      line.privilege = privilege ?? null;

      const decision = evaluate(this.policy, {
        harness: this.harness,
        role: this.role,
        service: parsed.service,
        module: parsed.module,
        privilege,
        risk,
        op: 'execute',
      });
      if (decision.effect === 'deny') {
        line.path = 'none';
        return statusObject(STATUS.DENIED, { rule: decision.rule });
      }

      const resolved = resolveAction(action, {
        connectors: this.connectors,
        catalogProvider: this.catalogProvider,
        classifier: this.classifier,
      });
      line.path = resolved.path;

      // First-party branch. Clears connector guards 1–4 and 6 (needs_connector on
      // this path, undeclared act, provider credential, active connection, local-file
      // status) and the two unwrap exits below the confirmation stop, all of which
      // ask after connector machinery a wiser.* id does not have. Lands before
      // `act.input` so that expression is never evaluated. Preserves the confirmation
      // stop (guard 7) and hands validateInput the first-party action's own schema.
      if (resolved.path === 'first_party_mcp') {
        // An advertised wiser.* id the gateway does not declare is
        // needs_connector / undeclared. The gateway cannot tell a new write
        // from a read because it would have to invent privilege, risk and
        // confirmation; that is the same refusal an undeclared catalog action
        // already receives. unavailable is an adapter outcome after a declared
        // action ran. needs_subscription would tell the caller to paste a key,
        // which is the wrong next step when a classifier is already loaded.
        if (!FIRST_PARTY_ACTIONS[action]) {
          return statusObject(STATUS.NEEDS_CONNECTOR, { action, reason: 'undeclared' });
        }
        return this.executeFirstParty({ action, input, confirm, parsed, decision, resolved, line });
      }
      if (resolved.path === 'none') {
        if (parsed.service === 'wiser') return this.needsSubscriptionResult('missing');
        return statusObject(STATUS.NEEDS_CONNECTOR, { action });
      }
      // An action no manifest declares has no privilege, risk or confirmation, so a
      // bare mapping row never runs. In v1 the catalog step is reached only through a
      // manifest row whose module delegates via ctx.catalog.
      if (!act) {
        line.path = 'none';
        return statusObject(STATUS.NEEDS_CONNECTOR, { action, reason: 'undeclared' });
      }

      const authForRun = resolved.path === 'connector' ? resolved.auth : auth;
      if (this.needsProviderCredential(authForRun || { provider: 'catalog' })) {
        return this.needsProviderResult();
      }

      let record = this.store.getConnection({ service: parsed.service, module: parsed.module });
      if (!isActive(record) && authForRun?.provider !== 'local-file') {
        await this.hydrateFromProvider();
        record = this.store.getConnection({ service: parsed.service, module: parsed.module });
      }
      line.provider_account_id = record?.provider_account_id ?? null;
      if (!isActive(record)) {
        return statusObject(STATUS.NEEDS_CONNECT, {
          service: parsed.service,
          module: parsed.module,
          privilege: privilege ?? null,
        });
      }

      // The published input schema is applied here, once, for every connector, and no
      // connector carries a validator of its own. Why it lives in the gateway rather than
      // in twenty-five copies is in src/input-schema.js; what it reads and what it leaves
      // to the module is there too.
      //
      // **Where it sits is a decision and each side of it was measured.** It is after the
      // policy, so a denied action's input is never inspected or echoed; after the grant
      // checks, so a caller with no connection is told that rather than told about its
      // arguments, which is the common case and the one the whole connect flow serves; and
      // before the confirmation stop, so a person is never asked to approve a call that
      // cannot run. src/disclosure.js already withheld a value failing its own declaration
      // on the ground that showing it wastes an approval; this carries that one step
      // further and does not ask for the approval at all.
      //
      // `undefined` means no input was supplied and is validated as `{}`, which is what
      // every path below already coerces it to. `null`, an array and a scalar were
      // supplied and are malformed, and are reported as `input`.
      // `!== null` and not truthiness: a field name is a string and `""` is falsy, so a
      // truthiness test accepts any input whose first offending key is the empty string
      // and stops checking the rest. src/input-schema.js says so at the function.
      const invalidField = validateInput(act.input, input === undefined ? {} : input);
      if (invalidField !== null) return statusObject(STATUS.INVALID_ARGUMENTS, { field: invalidField });

      const provider = this.providerFor(authForRun);
      const statusArgs = {
        providerAccountId: record.provider_account_id ?? null,
        service: parsed.service,
        file: authForRun?.file,
        variables: authForRun?.variables,
      };
      const stopGrant = (providerStatus) => {
        this.store.putConnection({ ...record, status: providerStatus });
        return statusObject(STATUS.NEEDS_CONNECT, {
          service: parsed.service,
          module: parsed.module,
          privilege: privilege ?? null,
          provider_status: providerStatus,
        });
      };

      if (authForRun?.provider === 'local-file' && typeof provider?.status === 'function') {
        let raw;
        try {
          raw = await provider.status(statusArgs);
        } catch {
          // A thrown local-file status is an unreadable grant file, not a hosted
          // outage. Mark the row inactive rather than leaking an MCP tool error.
          return stopGrant('INACTIVE');
        }
        if (raw && typeof raw === 'object' && raw.error) return vendorErrorFrom(raw);
        const mapped = typeof raw === 'string' ? raw : raw?.status;
        if (mapped !== 'ACTIVE') {
          return stopGrant(STOPPED_GRANT_STATES.includes(mapped) ? mapped : 'INACTIVE');
        }
      }

      const confirmation = act?.confirmation || 'none';
      const onceKey = action;
      const needsConfirm =
        decision.effect === 'confirm' ||
        confirmation === 'always' ||
        (confirmation === 'once' && !this.confirmedOnce.has(onceKey));
      if (needsConfirm && confirm !== true) {
        // What may be shown, how it is rendered, and what the summary must say it is
        // NOT showing all live in src/disclosure.js; the contract is stated in
        // gateway/AGENTS.md under "What the confirmation stop shows, and what it
        // does not". This block decides only that a stop happens and on which of
        // the three entry paths; it does not decide what a person is told.
        const disclosure = discloseInput(act, input);
        const summary = composeSummary({
          action,
          service: parsed.service,
          module: parsed.module,
          risk,
          description: act?.description,
          disclosure,
        });
        return statusObject(STATUS.NEEDS_CONFIRMATION, {
          action,
          service: parsed.service,
          module: parsed.module,
          risk: risk ?? null,
          confirmation,
          // Unchanged in meaning since before the disclosure policy. Values arrived
          // as new fields beside them; nothing here was renamed or given a new sense.
          input_fields: disclosure.fields,
          undeclared_fields: disclosure.undeclared,
          // Added. `value` is already escaped and capped; it is display text, not the
          // input. A consumer wanting the input has the input.
          input_values: disclosure.shown.map((f) => ({
            name: f.name,
            value: f.text,
            truncated: f.truncated,
          })),
          // Added. Declared fields the policy would not render, and why, so a person
          // knows something was supplied that they are not being shown.
          withheld_fields: [
            ...disclosure.nested.map((name) => ({ name, reason: 'nested' })),
            ...disclosure.withheld,
          ],
          summary,
          description: act?.description ?? null,
        });
      }
      if (confirm === true && confirmation === 'once') {
        this.confirmedOnce.add(onceKey);
      }

      // Refresh hosted grants only after an auth-class refusal. Provider outages
      // and unmapped statuses preserve both the original error and the ACTIVE row.
      const classifyExecuteResult = async (result) => {
        if (!isStatusObject(result) && result?.error?.code === 'vendor_error') result = vendorErrorFrom(result);
        if (authForRun?.provider === 'local-file' || result?.status !== STATUS.VENDOR_ERROR ||
            ![401, 403].includes(result.http_status) || typeof provider?.status !== 'function') {
          return result;
        }
        let raw;
        try {
          raw = await provider.status(statusArgs);
        } catch {
          return result;
        }
        if (raw && typeof raw === 'object' && raw.error) return result;
        const mapped = typeof raw === 'string' ? raw : raw?.status;
        if (STOPPED_GRANT_STATES.includes(mapped)) return stopGrant(mapped);
        return result;
      };

      try {
        if (resolved.path === 'catalog') {
          const result = await this.catalogProvider.execute({
            actionId: action,
            userId: this.resolveUserId(),
            providerAccountId: record.provider_account_id,
            arguments: input ?? {},
          });
          return classifyExecuteResult(result);
        }

        let unwrap = null;
        if (resolved.unwrapToken) {
          if (provider && typeof provider.unwrap === 'function') {
            try {
              unwrap = await provider.unwrap({
                providerAccountId: record.provider_account_id,
                service: parsed.service,
                file: resolved.auth.file,
                variables: resolved.auth.variables,
                header: resolved.auth.header,
                prefix: resolved.auth.prefix,
              });
            } catch (err) {
              if (authForRun?.provider === 'local-file') return stopGrant('INACTIVE');
              throw err;
            }
          }
          if (authForRun?.provider === 'local-file' && unwrap?.supported !== true) {
            return stopGrant('INACTIVE');
          }
        }

        const ctx = buildContext({
          service: parsed.service,
          module: parsed.module,
          action: parsed.action,
          input: input ?? {},
          confirm: Boolean(confirm),
          record,
          auth: resolved.auth,
          authProvider: this.providerFor(resolved.auth),
          catalogProvider: this.catalogProvider,
          unwrap,
        });
        if (this.catalogProvider && typeof this.catalogProvider.execute === 'function') {
          ctx.catalog = async (actionId, catalogInput) => {
            const res = await this.catalogProvider.execute({
              actionId,
              userId: this.resolveUserId(),
              providerAccountId: record.provider_account_id,
              arguments: catalogInput ?? input ?? {},
            });
            if (res && res.error && res.error.code === 'vendor_error') {
              throw new StatusSignal(vendorErrorFrom(res));
            }
            return res;
          };
        }

        const result = await resolved.fn(input ?? {}, ctx);
        return classifyExecuteResult(result);
      } catch (err) {
        // Classify ctx.proxy / ctx.catalog signals before withAudit sees them.
        if (err instanceof StatusSignal) return classifyExecuteResult(err.object);
        throw err;
      }
    });
  }

  /**
   * First-party dispatch. Never reads `act` (undefined for a wiser.* id).
   * @param {object} args
   */
  async executeFirstParty({ action, input, confirm, parsed, decision, resolved, line }) {
    const def = resolved.def || firstPartyDef(action) || {};
    line.privilege = def.privilege ?? line.privilege ?? null;

    const invalidField = validateInput(def.input, input === undefined ? {} : input);
    if (invalidField !== null) return statusObject(STATUS.INVALID_ARGUMENTS, { field: invalidField });

    const confirmation = def.confirmation || 'none';
    const onceKey = action;
    const needsConfirm =
      decision.effect === 'confirm' ||
      confirmation === 'always' ||
      (confirmation === 'once' && !this.confirmedOnce.has(onceKey));
    if (needsConfirm && confirm !== true) {
      const disclosure = discloseInput(def, input);
      const summary = composeSummary({
        action,
        service: parsed.service,
        module: parsed.module,
        risk: def.risk,
        description: def.description,
        disclosure,
      });
      return statusObject(STATUS.NEEDS_CONFIRMATION, {
        action,
        service: parsed.service,
        module: parsed.module,
        risk: def.risk ?? null,
        confirmation,
        input_fields: disclosure.fields,
        undeclared_fields: disclosure.undeclared,
        input_values: disclosure.shown.map((f) => ({
          name: f.name,
          value: f.text,
          truncated: f.truncated,
        })),
        withheld_fields: [
          ...disclosure.nested.map((name) => ({ name, reason: 'nested' })),
          ...disclosure.withheld,
        ],
        summary,
        description: def.description ?? null,
      });
    }
    if (confirm === true && confirmation === 'once') {
      this.confirmedOnce.add(onceKey);
    }

    try {
      if (typeof resolved.fn !== 'function') {
        return { status: 'unavailable', reason: 'unknown action id' };
      }
      const key = readClassifierKey(this.envPath);
      const result = await resolved.fn(input ?? {}, key);
      if (result == null || typeof result !== 'object' || Array.isArray(result)) {
        return { status: 'unavailable', reason: 'malformed answer' };
      }
      if (isStatusObject(result)) return result;
      if (result.error && result.error.code === 'vendor_error') return vendorErrorFrom(result);
      return result;
    } catch (err) {
      if (err instanceof StatusSignal) return err.object;
      return { status: 'unavailable', reason: 'adapter_error' };
    }
  }

  async startConnect({ service, module } = {}) {
    return this.withAudit('startConnect', { service, module, action: null }, async (line) => {
      if (!service || !module) {
        return statusObject(STATUS.NEEDS_CONNECTOR, { action: null, service: service ?? null, module: module ?? null });
      }
      const found = this.lookupModule(service, module);
      if (!found) {
        line.path = 'none';
        return statusObject(STATUS.NEEDS_CONNECTOR, { service, module });
      }
      line.privilege = found.auth.privilege;
      const decision = evaluate(this.policy, {
        harness: this.harness,
        role: this.role,
        service,
        module,
        privilege: found.auth.privilege,
        op: 'startConnect',
      });
      if (decision.effect === 'deny') {
        return statusObject(STATUS.DENIED, { rule: decision.rule });
      }

      if (this.needsProviderCredential(found.auth)) {
        return this.needsProviderResult();
      }

      const provider = this.providerFor(found.auth);
      if (!provider || typeof provider.initiate !== 'function') {
        return this.needsProviderResult();
      }

      const initiated = await provider.initiate({
        userId: this.resolveUserId(),
        service,
        module,
        toolkit: found.auth.toolkit,
        scheme: found.auth.scheme,
        file: found.auth.file,
        variables: found.auth.variables,
      });

      if (initiated && initiated.error && initiated.error.code === 'vendor_error') {
        const mapped = vendorErrorFrom(initiated);
        if (typeof initiated.toolkit === 'string') mapped.toolkit = initiated.toolkit;
        if (Number.isFinite(initiated.configs)) mapped.configs = initiated.configs;
        return mapped;
      }

      if (initiated?.kind === 'file') {
        if (!initiated.path) {
          const setup = typeof provider.setupText === 'function' ? provider.setupText() : null;
          return statusObject(STATUS.NEEDS_PROVIDER, { setup, provider: 'local-file' });
        }
        line.path = 'connector';
        this.store.putConnection({
          id: randomUUID(),
          service,
          module,
          privilege: found.auth.privilege,
          provider: found.auth.provider,
          provider_account_id: found.auth.file,
          scopes: [],
          status: 'INITIATED',
          created: nowIso(),
          updated: nowIso(),
        });
        return {
          status: 'file',
          path: initiated.path,
          variables: initiated.variables,
          next: 'connectStatus',
        };
      }

      line.path = 'connector';
      line.provider_account_id = initiated?.providerAccountId ?? null;
      this.store.putConnection({
        id: randomUUID(),
        service,
        module,
        privilege: found.auth.privilege,
        provider: found.auth.provider,
        provider_account_id: initiated?.providerAccountId ?? null,
        scopes: [],
        status: 'INITIATED',
        created: nowIso(),
        updated: nowIso(),
      });
      return {
        status: 'link',
        url: initiated?.url ?? null,
        next: 'connectStatus',
      };
    });
  }

  async connectStatus({ service, module } = {}) {
    return this.withAudit('connectStatus', { service, module, action: null }, async (line) => {
      if (!service || !module) {
        return statusObject(STATUS.NEEDS_CONNECTOR, { service: service ?? null, module: module ?? null });
      }
      const found = this.lookupModule(service, module);
      const stored = this.store.getConnection({ service, module });

      // **A record can outlive whatever made it, and that is when its status most
      // needs refreshing.** Retiring a connector leaves its row here reading ACTIVE
      // against nothing that declares it. Refusing on `undeclared` meant the row
      // could never be written, so it kept lying. Found 2026-09-20 by running a real
      // teardown against the real row `pagespeed/insights`: the teardown returned
      // `absent_but_teardown_failed`, the row survived, and `connect_status` could
      // not correct it. `disconnect` was taught this at e84467a; this is the same
      // shape on the status path.
      //
      // Any row carrying an account qualifies, not only an ACTIVE one: a stale row
      // is exactly what needs refreshing. **A store row is not a manifest.** The
      // vocabularies come from `manifest.js`, not restated: a second copy is how a
      // list drifts. Policy matching is strict equality, so `"ADMIN"` or `""`
      // matches no privilege rule; `connectStatus` evaluates with `privilege: 'read'`
      // regardless, so an unvalidated stored privilege would not even be the value
      // policy saw. An unrecognised provider is worse: `providerFor` sends
      // everything that is not exactly `local-file` to the catalog adapter, so a row
      // naming nothing would query the wrong vendor about an account that is not
      // theirs.
      const orphaned = !found && stored?.provider_account_id ? {
        auth: { privilege: stored.privilege ?? null, provider: stored.provider ?? null },
      } : null;
      if (orphaned && !PRIVILEGES.has(orphaned.auth.privilege)) {
        return statusObject(STATUS.DENIED, {
          rule: { effect: 'deny', reason: 'unknown_privilege' },
          service,
          module,
          reason: 'orphaned_record_without_privilege',
          privilege: typeof orphaned.auth.privilege === 'string' ? orphaned.auth.privilege : null,
        });
      }
      if (orphaned && !AUTH_PROVIDERS.has(orphaned.auth.provider)) {
        return statusObject(STATUS.DENIED, {
          rule: { effect: 'deny', reason: 'unknown_provider' },
          service,
          module,
          reason: 'orphaned_record_without_provider',
          provider: typeof orphaned.auth.provider === 'string' ? orphaned.auth.provider : null,
        });
      }
      if (!found && !orphaned) {
        line.path = 'none';
        return statusObject(STATUS.NEEDS_CONNECTOR, { service, module, reason: 'undeclared' });
      }
      const target = found || orphaned;

      // Policy still runs, and still with `privilege: 'read'` / `op: 'connectStatus'`
      // regardless of the module's own privilege. The audit line takes privilege from
      // the validated stored value when there is no manifest to read it from.
      line.privilege = target.auth.privilege;
      const decision = evaluate(this.policy, {
        harness: this.harness,
        role: this.role,
        service,
        module,
        privilege: 'read',
        op: 'connectStatus',
      });
      if (decision.effect === 'deny') {
        return statusObject(STATUS.DENIED, { rule: decision.rule });
      }

      // `local-file` status({ service, file, variables }) needs `file` and
      // `variables`, which live in the manifest the orphan no longer has. With them
      // undefined it returns INACTIVE because no path resolved, which is a guess
      // about a file we never located, dressed as an answer. `needs_connector` is
      // the refusal: `denied` is for authorization, and this is inability to
      // interpret a credential whose path is gone. Do not guess.
      if (orphaned && orphaned.auth.provider === 'local-file') {
        line.path = 'none';
        return statusObject(STATUS.NEEDS_CONNECTOR, {
          service,
          module,
          reason: 'orphaned_local_file_record',
        });
      }

      if (this.needsProviderCredential(target.auth)) {
        return this.needsProviderResult();
      }

      const provider = this.providerFor(target.auth);
      const record = stored;
      line.provider_account_id = record?.provider_account_id ?? null;
      line.path = 'connector';

      const statusArgs = {
        providerAccountId: record?.provider_account_id ?? null,
        service,
        file: found?.auth?.file,
        variables: found?.auth?.variables,
      };
      if (!provider || typeof provider.status !== 'function') {
        return this.needsProviderResult();
      }
      const raw = await provider.status(statusArgs);
      if (raw && typeof raw === 'object' && raw.error) {
        // A transport or provider failure is not a grant status. The record is left as
        // it was, so an outage does not turn a working connection into needs_connect.
        return vendorErrorFrom(raw);
      }
      const mapped = typeof raw === 'string' ? raw : raw?.status;
      if (!mapped) {
        if (orphaned) {
          // **A distinct reason, because `orphaned_record` promises a refresh and this
          // is the one orphan path that cannot deliver one.** The provider answered
          // nothing a status can be read from, so there is no word to write and the row
          // keeps whatever it held. Returning `orphaned_record` here would have told
          // three documents' worth of readers that the row now matches the provider
          // when nobody had asked the provider successfully. Found by adversarial
          // review round two, which is where the first fix's own description broke.
          return statusObject(STATUS.NEEDS_CONNECTOR, {
            service, module, reason: 'orphaned_status_unreadable',
          });
        }
        return statusObject(STATUS.NEEDS_CONNECT, { service, module, privilege: found.auth.privilege });
      }

      if (orphaned) {
        // Re-read before writing, exactly as both declared branches do.
        // `disconnect` can remove this row while the provider call is in flight,
        // which is how an orphan gets taken down at all, and a status answer that
        // overtakes a teardown must not recreate it.
        //
        // Rebound: `startConnect` refuses `!found` at the lookup and hydration
        // writes only declared modules, so no current gateway path rebinds an
        // undeclared service. The store is still shared, and this is the check
        // the declared path already paid for, not a new claim that rebound cannot
        // happen.
        const current = this.store.getConnection({ service, module });
        const accountNow = current?.provider_account_id ?? null;
        const accountThen = record.provider_account_id ?? null;
        if (!current) {
          return statusObject(STATUS.NEEDS_CONNECTOR, { service, module, reason: 'removed_while_checking' });
        }
        if (accountNow !== accountThen) {
          return statusObject(STATUS.NEEDS_CONNECTOR, { service, module, reason: 'rebound_while_checking' });
        }
        this.store.putConnection({
          id: record.id,
          service,
          module,
          privilege: record.privilege,
          provider: record.provider,
          provider_account_id: record.provider_account_id,
          scopes: record.scopes || [],
          status: mapped,
          created: record.created,
          updated: nowIso(),
        });
        // Never answer `connected` for an orphan. `execute` still refuses with
        // `needs_connector`; telling a person "connected" sends them to use a
        // thing that cannot be used. `needs_connector` is already truthful;
        // a new STATUS value is not added.
        return statusObject(STATUS.NEEDS_CONNECTOR, {
          service,
          module,
          reason: 'orphaned_record',
          provider_status: mapped,
        });
      }

      if (mapped === 'ACTIVE') {
        // Re-read before writing back. The row was captured before the provider round
        // trip, and since 2026-09-20 something can remove it while that call is in
        // flight: `disconnect` deletes rows, which nothing did before. Without this, a
        // status answer that overtakes a teardown recreates an ACTIVE row for a
        // credential that has just been revoked. Found by adversarial review; it is a
        // defect the new tool created in an old function rather than one it inherited.
        const current = this.store.getConnection({ service, module });
        const accountNow = current?.provider_account_id ?? null;
        const accountThen = record?.provider_account_id ?? null;
        if (!current && record) {
          return statusObject(STATUS.NEEDS_CONNECT, { service, module, privilege: found.auth.privilege, reason: 'removed_while_checking' });
        }
        if (record && accountNow !== accountThen) {
          return statusObject(STATUS.NEEDS_CONNECT, { service, module, privilege: found.auth.privilege, reason: 'rebound_while_checking' });
        }
        const saved = this.store.putConnection({
          id: record?.id || randomUUID(),
          service,
          module,
          privilege: found.auth.privilege,
          provider: found.auth.provider,
          provider_account_id: record?.provider_account_id ?? statusArgs.providerAccountId,
          scopes: record?.scopes || [],
          status: 'ACTIVE',
          created: record?.created || nowIso(),
          updated: nowIso(),
        });
        return { status: 'connected', connection: saved };
      }
      if (record) {
        // The same guard as the ACTIVE branch above. A non-ACTIVE answer that overtakes
        // a teardown put the deleted row back, and where a reconnect had landed it
        // overwrote the new binding with the old one. Found by adversarial review after
        // the first fix covered only the ACTIVE path.
        const current = this.store.getConnection({ service, module });
        const accountNow = current?.provider_account_id ?? null;
        if (current && accountNow === (record.provider_account_id ?? null)) {
          this.store.putConnection({ ...record, status: mapped });
        }
      }
      if (mapped === 'INITIATED') {
        return { status: 'INITIATED', service, module };
      }
      return statusObject(STATUS.NEEDS_CONNECT, {
        service,
        module,
        privilege: found.auth.privilege,
        provider_status: mapped,
      });
    });
  }

  /**
   * Take a grant down: revoke the credential at the provider, and remove every local
   * record of it once the provider confirms it is gone.
   *
   * **The unit is the credential and not the module**, decided by the operator on
   * 2026-09-20 and independently by the audit: `hydrateFromProvider` writes one
   * provider account into every module of its toolkit that has no grant of its own,
   * measured at five modules on one account. A teardown scoped to the named module
   * would revoke a credential four other modules were executing on and leave their rows
   * ACTIVE against an account that no longer exists, which is the stale-row defect this
   * build removes, recreated by the tool built to remove it.
   *
   * Confirmation is implemented here rather than inherited. A `confirmation` field is
   * manifest metadata read inside `execute`, and a top-level tool is not on that path.
   */
  async disconnect({ service, module, provider_account_id: approvedAccount, confirm } = {}) {
    return this.withAudit('disconnect', { service, module }, async (line) => {
      const found = this.lookupModule(service, module);
      const stored = this.store.getConnection({ service, module });

      // **A record can outlive whatever made it, and that is when it most
      // needs taking down.** Retiring a connector leaves its grant live at the provider
      // and its row here pointing at nothing, which is how a row is orphaned in the
      // first place. Refusing on `undeclared` meant the tool built to clear stale rows
      // could not clear the one kind the tree actually produces. Found in Refine by
      // trying it on a real one.
      //
      // Any row carrying an account qualifies, not only an ACTIVE one: a stale or
      // inactive row is exactly what a teardown is for. Nothing else is relaxed. The
      // row carries its own `privilege` and `provider`, validated above, and every gate
      // below still runs: the policy is
      // evaluated on that stored privilege, the stop names the account and every module
      // on it, the approval binds to the account id, and removal still needs ABSENT
      // corroborated by the teardown's final step. **A row with no stored privilege is
      // refused**, because authorizing on nothing is what the sibling check already
      // taught this function not to do.
      // **A store row is not a manifest.** `manifest.js` validates `privilege` against
      // read|write|admin and `providers/` decides what a provider name may be; a row
      // has been through neither, and policy matching is strict equality, so `"ADMIN"`
      // or `""` matches no privilege rule and slips past a privilege-specific denial.
      // An unrecognised provider is worse: `providerFor` sends everything that is not
      // exactly `local-file` to the catalog adapter, so a row naming nothing would have
      // revoked against the catalog on no evidence it belonged there. Both found by
      // adversarial review before this path saw a real account.
      const orphaned = !found && stored?.provider_account_id ? {
        auth: { privilege: stored.privilege ?? null, provider: stored.provider ?? null },
      } : null;
      if (orphaned && !PRIVILEGES.has(orphaned.auth.privilege)) {
        return statusObject(STATUS.DENIED, {
          rule: { effect: 'deny', reason: 'unknown_privilege' },
          service,
          module,
          reason: 'orphaned_record_without_privilege',
          privilege: typeof orphaned.auth.privilege === 'string' ? orphaned.auth.privilege : null,
        });
      }
      if (orphaned && !AUTH_PROVIDERS.has(orphaned.auth.provider)) {
        return statusObject(STATUS.DENIED, {
          rule: { effect: 'deny', reason: 'unknown_provider' },
          service,
          module,
          reason: 'orphaned_record_without_provider',
          provider: typeof orphaned.auth.provider === 'string' ? orphaned.auth.provider : null,
        });
      }
      if (!found && !orphaned) {
        return statusObject(STATUS.NEEDS_CONNECTOR, { service, module, reason: 'undeclared' });
      }
      const target = found || orphaned;

      const authorize = (svc, mod, privilege) => evaluate(this.policy, {
        harness: this.harness,
        role: this.role,
        service: svc,
        module: mod,
        privilege,
        risk: 'destructive',
        op: 'disconnect',
      });

      const decision = authorize(service, module, target.auth?.privilege);
      if (decision.effect === 'deny') return statusObject(STATUS.DENIED, { rule: decision.rule });
      line.privilege = target.auth?.privilege ?? null;

      const record = stored;
      const accountId = record?.provider_account_id ?? null;
      if (!record || !accountId) {
        // Nothing here to take down. Said plainly rather than reported as a success
        // that removed nothing, and rather than as an error the caller must interpret.
        return statusObject(STATUS.NEEDS_CONNECT, {
          service,
          module,
          privilege: target.auth?.privilege ?? null,
          reason: 'nothing_to_disconnect',
        });
      }
      line.provider_account_id = accountId;

      // Every row on this credential, because every one of them ends.
      const boundRows = this.store.listConnections()
        .filter((row) => row.provider_account_id === accountId);
      const bound = boundRows.map((row) => ({ service: row.service, module: row.module }));

      // **Every one of them is authorized, not only the one named.** The policy is
      // written per service and module, so an override may deny disconnecting one
      // module and permit another; because this acts on the credential, calling
      // through the permitted module would otherwise end the denied one. Found by
      // adversarial review, and it is this build's own lesson committed again: a
      // decision scoped to the unit the caller named, applied to the unit the system
      // shares.
      const authorizeBound = (rows) => {
        for (const row of rows) {
          const sibling = this.lookupModule(row.service, row.module);
          // Fail closed on missing metadata. A row whose module no longer resolves has
          // no manifest privilege, and passing `undefined` made every privilege rule
          // skip — so an `admin` binding left behind by a retired module authorized as
          // though it had no privilege at all. The stored privilege is used instead,
          // and a row carrying neither is denied rather than waved through.
          const privilege = sibling?.auth?.privilege ?? row.privilege ?? null;
          if (!PRIVILEGES.has(privilege)) {
            return statusObject(STATUS.DENIED, {
              rule: { effect: 'deny', reason: 'unknown_privilege' },
              service: row.service,
              module: row.module,
              reason: 'bound_module_denied',
            });
          }
          // **A sibling's provider is checked too, and only checking the caller's was a
          // hole.** Bindings are collected by account id alone, so two orphaned rows can
          // share an account while naming different providers; validating the requested
          // row and then deleting account-wide removed a row whose provider the gateway
          // had explicitly refused to establish. A declared sibling is covered by its
          // manifest, which `manifest.js` already validated. Adversarial review, round two.
          if (!sibling && !AUTH_PROVIDERS.has(row.provider)) {
            return statusObject(STATUS.DENIED, {
              rule: { effect: 'deny', reason: 'unknown_provider' },
              service: row.service,
              module: row.module,
              reason: 'bound_module_denied',
            });
          }
          const verdict = authorize(row.service, row.module, privilege);
          if (verdict.effect === 'deny') {
            return statusObject(STATUS.DENIED, {
              rule: verdict.rule,
              service: row.service,
              module: row.module,
              reason: 'bound_module_denied',
            });
          }
        }
        return null;
      };
      const denied = authorizeBound(boundRows);
      if (denied) return denied;

      if (confirm !== true) {
        // The first consumer of the confirmation summary Session 1 wrote. The account
        // id is rendered through the same escaper and cap as any other displayed value;
        // the module list rides the description, which that function also escapes.
        const disclosure = discloseInput(
          { input: { properties: { provider_account_id: { type: 'string' } } } },
          { provider_account_id: accountId },
        );
        const names = bound.map((row) => `${row.service}/${row.module}`).join(', ');
        const summary = composeSummary({
          action: 'disconnect',
          service,
          module,
          risk: 'destructive',
          description: `revokes this credential at the provider and removes ${bound.length} local record${bound.length === 1 ? '' : 's'}, ending ${names}. You are approving the credential, so anything else bound to it before you answer ends too${orphaned ? `. NOTE: nothing declares ${service}/${module} any more, so this record has outlived what made it; other bindings listed above may still be declared and still able to use this credential` : ''}`,
          disclosure,
        });
        return statusObject(STATUS.NEEDS_CONFIRMATION, {
          op: 'disconnect',
          service,
          module,
          risk: 'destructive',
          confirmation: 'always',
          provider_account_id: accountId,
          modules_ending: bound,
          input_fields: disclosure.fields,
          undeclared_fields: disclosure.undeclared,
          input_values: disclosure.shown.map((f) => ({ name: f.name, value: f.text, truncated: f.truncated })),
          withheld_fields: [
            ...disclosure.nested.map((name) => ({ name, reason: 'nested' })),
            ...disclosure.withheld,
          ],
          summary,
          description: null,
        });
      }

      // The approval named an account. If the binding moved between the stop and here,
      // the approval is for something else. `startConnect` is the mechanism that moves
      // it, and it installs a DIFFERENT id, so the delete below would skip the new row
      // in any case; this refuses audibly instead of removing nothing in silence.
      if (approvedAccount === undefined) {
        return statusObject(STATUS.INVALID_ARGUMENTS, { tool: 'disconnect', field: 'provider_account_id' });
      }
      if (approvedAccount !== accountId) {
        return statusObject(STATUS.DENIED, {
          rule: { effect: 'deny', reason: 'account_changed' },
          service,
          module,
        });
      }

      const provider = this.providerFor(target.auth);
      if (!provider || typeof provider.revoke !== 'function') {
        return statusObject(STATUS.NEEDS_PROVIDER_CAPABILITY, { op: 'disconnect', capability: 'revoke' });
      }

      let outcome;
      try {
        outcome = await provider.revoke({ providerAccountId: accountId, service, file: target.auth?.file });
      } catch {
        // An adapter that throws is a transport or adapter failure, not a capability it
        // lacks. Reporting it as a missing capability told a caller to report a broken
        // connector when the right move is to retry. Adversarial review found four
        // situations wearing one status word; they are four now.
        return statusObject(STATUS.VENDOR_ERROR, {
          op: 'disconnect', http_status: null, endpoint: null, method: 'revoke',
        });
      }
      const steps = Array.isArray(outcome?.steps) ? outcome.steps : [];
      // The adapter reports a failed final call as an error alongside `supported: true`.
      // Absence is still worth checking — the account may be gone regardless — but that
      // check can fail too, and its error was then the only one reported while the
      // teardown's own was dropped. Carried so it survives whatever follows. Found by
      // exercising a teardown that fails at the provider, in Refine.
      const teardownError = outcome && outcome.error ? {
        http_status: outcome.status ?? null,
        endpoint: outcome.error.endpoint ?? null,
        method: outcome.error.method ?? null,
      } : null;
      if (outcome?.supported !== true) {
        return statusObject(STATUS.NEEDS_PROVIDER_CAPABILITY, {
          op: 'disconnect',
          capability: 'revoke',
          how: typeof outcome?.how === 'string' ? outcome.how : null,
          steps,
        });
      }

      // **Absence is verified, never inferred from the revoke returning.** The adapter
      // reports what each step did and a step can fail while the call succeeds; only
      // the provider saying the account is not there justifies removing a local row.
      // Removing on anything-not-ACTIVE would also remove rows for a suspended grant.
      let after;
      try {
        after = await provider.status({ providerAccountId: accountId, service, file: target.auth?.file });
      } catch {
        after = null;
      }
      if (after && typeof after === 'object' && after.error) {
        return { ...vendorErrorFrom(after), op: 'disconnect', steps, teardown_error: teardownError, removed: [] };
      }
      const observed = typeof after === 'string' ? after : after?.status ?? null;
      if (observed === null) {
        // Not the same as the provider saying the credential is still there. The check
        // threw or answered nothing, so the state is unknown, and a caller told "still
        // there" would retry against something it cannot see. Separated on the cold
        // verification of the instructions that read this.
        return statusObject(STATUS.TEARDOWN_INCOMPLETE, {
          op: 'disconnect',
          reason: 'absence_unverified',
          provider_status: null,
          steps,
          teardown_error: teardownError,
          removed: [],
        });
      }
      if (observed !== 'ABSENT') {
        // The credential may still exist. Report what happened and change nothing.
        return statusObject(STATUS.TEARDOWN_INCOMPLETE, {
          op: 'disconnect',
          reason: 'not_absent_after_revoke',
          provider_status: observed,
          steps,
          teardown_error: teardownError,
          removed: [],
        });
      }

      // **Absence alone is not deletion evidence when the teardown itself failed.**
      // `providers/AGENTS.md` records that ABSENT means absent within the scope this
      // credential can see, which is narrower than deleted: a project change or a
      // visibility restriction also reads as 404. If the adapter's final step failed
      // and the account then reads absent, the two readings are indistinguishable, so
      // this fails closed rather than deleting every local row on an ambiguity. The
      // final step is the one the contract says a top-level error reports, and it is
      // the DELETE for the composio adapter — which is why the measured case where the
      // revoke POST is refused and the DELETE succeeds still passes here.
      // An adapter that reports nothing has established nothing. `{ supported: true,
      // steps: [] }` plus an ABSENT reading was accepted until adversarial review found
      // it, which is the original ambiguity returning through the gate built to close it.
      if (steps.length === 0) {
        return statusObject(STATUS.TEARDOWN_INCOMPLETE, {
          op: 'disconnect',
          reason: 'no_teardown_evidence',
          provider_status: observed,
          steps,
          teardown_error: teardownError,
          removed: [],
        });
      }
      const last = steps[steps.length - 1];
      if (last.ok !== true) {
        return statusObject(STATUS.TEARDOWN_INCOMPLETE, {
          op: 'disconnect',
          reason: 'absent_but_teardown_failed',
          provider_status: observed,
          steps,
          teardown_error: teardownError,
          removed: [],
        });
      }

      // Bindings were authorized before the provider round trip; a module attached to
      // this credential during it was never checked. Re-collect and re-authorize now.
      // The credential is already revoked at this point, so a denial here is reported
      // as an incomplete teardown rather than pretended away.
      const boundNow = this.store.listConnections().filter((row) => row.provider_account_id === accountId);
      const deniedNow = authorizeBound(boundNow);
      if (deniedNow) {
        return statusObject(STATUS.TEARDOWN_INCOMPLETE, {
          op: 'disconnect',
          reason: 'binding_denied_after_revoke',
          service: deniedNow.service,
          module: deniedNow.module,
          provider_status: observed,
          steps,
          removed: [],
        });
      }

      // Hydration writes an ACTIVE row for any module of a toolkit with no grant of its
      // own, from a listing it may have captured before this revoke. Remembering the
      // account stops a delayed listing recreating exactly the stale rows this tool
      // exists to remove. In-process only; the cross-process race is recorded in store.js.
      this.revokedAccounts.add(accountId);
      const removed = this.store.deleteConnection({ providerAccountId: accountId });
      // **What succeeded is not always what a reader assumes.** The teardown is the
      // adapter's sequence, and its last call is the one this gate requires: for the
      // composio adapter that is the DELETE, which removes the provider's record of the
      // credential. An earlier step failing means the credential may still be live at
      // the vendor while the provider has forgotten it — the measured `API_KEY` case
      // exactly, where the revoke POST is refused and the DELETE does the work. Saying
      // only `disconnected` let that read as "the credential is dead". Found by the
      // cold discoverability test in Refine, not by a review of this function.
      const everyStepOk = steps.every((step) => step.ok === true);
      return {
        status: 'disconnected',
        service,
        module,
        provider_account_id: accountId,
        steps,
        credential_revoked: everyStepOk ? 'yes' : 'unknown',
        removed: removed.map((row) => ({ service: row.service, module: row.module })),
      };
    });
  }
}

export { TOOLS as GATEWAY_TOOLS };
export { sanitizeError };
