import { randomUUID } from 'node:crypto';
import { buildContext } from './context.js';
import { STATUS, StatusSignal, isStatusObject, sanitizeError, statusObject, vendorErrorFrom } from './errors.js';
import { evaluate } from './policy.js';
import { readProviderUserId, writeProviderUserIdIfEmpty } from './paths.js';
import { parseActionId, resolveAction } from './resolve.js';

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
    description: 'Ask the provider whether a grant is active and, if it is, write the connection record (metadata only).',
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
    /** @type {Set<string>} */
    this.confirmedOnce = new Set();
  }

  /**
   * Identity the provider sees. Env `WISER_USER_ID` wins; otherwise the store;
   * a newly generated id is written into an empty env line and never overwrites
   * a key or a user id that is already set.
   * @returns {string}
   */
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
      else if (result && !line.status) line.status = 'ok';
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
   * Local-file modules are not hydrated.
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

    const byToolkit = new Map();
    for (const account of accounts) {
      if (!account || account.status !== 'ACTIVE' || !account.id || !account.toolkit) continue;
      const key = String(account.toolkit).toUpperCase();
      if (!byToolkit.has(key)) byToolkit.set(key, account.id);
      const stripped = key.replace(/^CUSTOM_/, '');
      if (!byToolkit.has(stripped)) byToolkit.set(stripped, account.id);
    }

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
    const catalog = resolveAction(id, { connectors: this.connectors, catalogProvider: this.catalogProvider });
    if (catalog.path === 'catalog') {
      return {
        action: id,
        service: parsed.service,
        module: parsed.module,
        source: 'catalog',
        input: null,
      };
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
      const privilege = auth?.privilege;
      const risk = act?.risk;
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
      });
      line.path = resolved.path;

      if (resolved.path === 'none' || resolved.path === 'first_party_mcp') {
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

      const record = this.store.getConnection({ service: parsed.service, module: parsed.module });
      line.provider_account_id = record?.provider_account_id ?? null;
      if (!isActive(record)) {
        return statusObject(STATUS.NEEDS_CONNECT, {
          service: parsed.service,
          module: parsed.module,
          privilege: privilege ?? null,
        });
      }

      const confirmation = act?.confirmation || 'none';
      const onceKey = action;
      const needsConfirm =
        decision.effect === 'confirm' ||
        confirmation === 'always' ||
        (confirmation === 'once' && !this.confirmedOnce.has(onceKey));
      if (needsConfirm && confirm !== true) {
        // Only field names the manifest declares are echoed; anything else is counted,
        // so an undeclared key cannot carry a value back through its own name.
        const declared = Object.keys(act?.input?.properties ?? {});
        const given = Object.keys(input ?? {});
        const fields = given.filter((k) => declared.includes(k));
        const undeclared = given.length - fields.length;
        return statusObject(STATUS.NEEDS_CONFIRMATION, {
          action,
          service: parsed.service,
          module: parsed.module,
          risk: risk ?? null,
          confirmation,
          input_fields: fields,
          undeclared_fields: undeclared,
          summary: `${action} on ${parsed.service}/${parsed.module}${fields.length ? ` with ${fields.join(', ')}` : ''}${undeclared ? ` and ${undeclared} undeclared field${undeclared === 1 ? '' : 's'}` : ''}; risk ${risk ?? 'unknown'}`,
        });
      }
      if (confirm === true && confirmation === 'once') {
        this.confirmedOnce.add(onceKey);
      }

      if (resolved.path === 'catalog') {
        const result = await this.catalogProvider.execute({
          actionId: action,
          userId: this.resolveUserId(),
          providerAccountId: record.provider_account_id,
          arguments: input ?? {},
        });
        if (result && result.error && result.error.code === 'vendor_error') {
          return vendorErrorFrom(result);
        }
        return result;
      }

      let unwrap = null;
      if (resolved.unwrapToken) {
        const provider = this.providerFor(resolved.auth);
        if (provider && typeof provider.unwrap === 'function') {
          unwrap = await provider.unwrap({
            providerAccountId: record.provider_account_id,
            service: parsed.service,
            file: resolved.auth.file,
            variables: resolved.auth.variables,
            header: resolved.auth.header,
            prefix: resolved.auth.prefix,
          });
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
      if (isStatusObject(result)) return result;
      if (result && result.error && result.error.code === 'vendor_error') return vendorErrorFrom(result);
      return result;
    });
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
        return vendorErrorFrom(initiated);
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
        privilege: 'read',
        op: 'connectStatus',
      });
      if (decision.effect === 'deny') {
        return statusObject(STATUS.DENIED, { rule: decision.rule });
      }

      if (this.needsProviderCredential(found.auth)) {
        return this.needsProviderResult();
      }

      const provider = this.providerFor(found.auth);
      const record = this.store.getConnection({ service, module });
      line.provider_account_id = record?.provider_account_id ?? null;
      line.path = 'connector';

      const statusArgs = {
        providerAccountId: record?.provider_account_id ?? null,
        service,
        file: found.auth.file,
        variables: found.auth.variables,
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
        return statusObject(STATUS.NEEDS_CONNECT, { service, module, privilege: found.auth.privilege });
      }
      if (mapped === 'ACTIVE') {
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
        this.store.putConnection({ ...record, status: mapped });
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
}

export { TOOLS as GATEWAY_TOOLS };
export { sanitizeError };
