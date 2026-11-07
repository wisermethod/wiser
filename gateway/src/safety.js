// Safety decides whether a call may run and owns pending confirmations, disclosure and standing approval scopes.
import { createHash } from 'node:crypto';
import { STATUS, isStatusObject, statusObject, vendorErrorFrom } from './errors.js';
import { composeSummary, containsUnsafeCodePoint, discloseAttachmentFiles, discloseInput } from './disclosure.js';
import { validateInput } from './input-schema.js';
import { evaluate } from './policy.js';
import { assertNoSecrets } from './store.js';
import { STANDING_APPROVAL_DAY_MS, buildStandingApprovalWarning, isActiveStandingApproval, isHeightened, matchStandingApproval, maxStandingApprovalDays, standingApprovalSummary } from './standing-approvals.js';
import { FIRST_PARTY_ACTIONS, firstPartyDef, parseActionId, resolveAction } from './resolve.js';
import { isActive } from './connections.js';
import { getCuratedAction } from './catalog.js';
import { inputFileAccessFor } from './host.js';
import { validateArgs } from './tools.js';

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
export const STOPPED_GRANT_STATES = ['EXPIRED', 'FAILED', 'INACTIVE', 'INITIATED', 'ABSENT'];

/** How long a pending approval stays matchable. A restart drops it sooner. */
export const PENDING_CONFIRMATION_TTL_MS = 15 * 60 * 1000;

/** Oldest pending approvals past this count are dropped. */
export const PENDING_CONFIRMATION_MAX = 256;

/**
 * Canonical JSON: object keys sorted by UTF-16 code unit, array order kept.
 * `undefined` in an array is null; an undefined object member is omitted.
 * `{a:1,b:2}` and `{b:2,a:1}` are one value. `['a','b']` and `['b','a']` are two.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function canonicalJson(value) {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') {
    const text = JSON.stringify(value);
    return text === undefined ? 'null' : text;
  }
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

/**
 * sha256 hex of the canonical JSON of a confirmation tuple.
 *
 * @param {unknown[]} parts
 */
export function confirmationDigest(parts) {
  return createHash('sha256').update(canonicalJson(parts)).digest('hex');
}

/**
 * `input_values` entries. `full` is the uncapped rendered text, and it is absent
 * when the value was not cut.
 *
 * @param {{ name: string, text: string, truncated: boolean, full?: string }[]} shown
 */
export function inputValueEntries(shown) {
  return shown.map((f) => {
    const entry = { name: f.name, value: f.text, truncated: f.truncated };
    if (f.truncated) entry.full = f.full;
    return entry;
  });
}

/**
 * Disclosure for a call that needs an approval. A withheld field is refused
 * here, before a stop is recorded: the stop must not offer an approval for a
 * value it did not show. The caller computes the confirmation key only from
 * `inputForKey`, and only after this returns it, so the key is never taken on
 * a value deeper than the disclosure limit.
 *
 * @param {object} spec manifest action or first-party definition
 * @param {unknown} input
 * @returns {{ disclosure: ReturnType<typeof discloseInput>, inputForKey: object } | { refusal: Record<string, unknown> }}
 */
export function approvalDisclosure(spec, input) {
  const disclosure = discloseInput(spec, input);
  if (disclosure.withheld.length > 0) {
    const first = disclosure.withheld[0];
    return {
      refusal: statusObject(STATUS.INVALID_ARGUMENTS, {
        field: first.name,
        reason: first.reason,
      }),
    };
  }
  return { disclosure, inputForKey: input === undefined ? {} : input };
}

// Private descriptors never become a host-hydrated field or retain input buffers.
const fileConfirmations = new WeakMap();

export function initializeSafety(gateway) {
  fileConfirmations.set(gateway, new Map());
}

/** Drop pending approvals whose expiry has passed. */
export function prunePendingConfirmations(gateway) {
  const now = gateway.now();
  for (const [key, expiry] of gateway.pendingConfirmations) {
    if (expiry <= now) gateway.pendingConfirmations.delete(key);
  }
  pruneFileConfirmations(gateway);
}

/** File snapshots never outlive their entry in the numeric expiry map. */
function pruneFileConfirmations(gateway) {
  for (const [base, record] of fileConfirmations.get(gateway)) {
    if (!gateway.pendingConfirmations.has(record.fullDigest) || record.expiry <= gateway.now()) {
      fileConfirmations.get(gateway).delete(base);
    }
  }
}

function forgetFileConfirmation(gateway, base, fullDigest) {
  gateway.pendingConfirmations.delete(fullDigest);
  if (fileConfirmations.get(gateway).get(base)?.fullDigest === fullDigest) fileConfirmations.get(gateway).delete(base);
}

/** One live stop per base call, with descriptors only, never buffers. */
function recordFileConfirmation(gateway, base, fullDigest, descriptors) {
  const previous = fileConfirmations.get(gateway).get(base);
  if (previous) forgetFileConfirmation(gateway, base, previous.fullDigest);
  gateway.recordPendingConfirmation(fullDigest);
  fileConfirmations.get(gateway).set(base, {
    fullDigest, descriptors: descriptors.map((entry) => ({ ...entry })),
    expiry: gateway.pendingConfirmations.get(fullDigest),
  });
}

/**
 * Record a stop. A repeated key is deleted and set again, so expiry and
 * recency both refresh. Past the maximum, the oldest entry is dropped.
 * @param {string} key
 */
export function recordPendingConfirmation(gateway, key) {
  gateway.prunePendingConfirmations();
  gateway.pendingConfirmations.delete(key);
  gateway.pendingConfirmations.set(key, gateway.now() + PENDING_CONFIRMATION_TTL_MS);
  while (gateway.pendingConfirmations.size > PENDING_CONFIRMATION_MAX) {
    const oldest = gateway.pendingConfirmations.keys().next().value;
    gateway.pendingConfirmations.delete(oldest);
  }
  pruneFileConfirmations(gateway);
}

/**
 * A matching unexpired approval is deleted and returns true. Single use.
 * @param {string} key
 */
export function takePendingConfirmation(gateway, key) {
  return gateway.takePendingConfirmationExpiry(key) !== null;
}

/** Consume a matching proposal and return its fixed expiry, or null. */
export function takePendingConfirmationExpiry(gateway, key) {
  gateway.prunePendingConfirmations();
  const expiry = gateway.pendingConfirmations.get(key);
  if (expiry === undefined || expiry <= gateway.now()) {
    if (expiry !== undefined) gateway.pendingConfirmations.delete(key);
    return null;
  }
  gateway.pendingConfirmations.delete(key);
  pruneFileConfirmations(gateway);
  return expiry;
}


/**
 * Standing approvals use the same pending map as a per-call stop. Only a
 * canonical, freshly checked scope can consume the warning's single use.
 * @param {object} args
 */
export async function standingApprovalsTool(gateway, args = {}) {
  const { mode, label } = args;
  const parsed = args.module ? args.module.split('.') : parseActionId(args.actions?.[0]);
  const service = Array.isArray(parsed) ? parsed[0] : parsed?.service;
  const module = Array.isArray(parsed) ? parsed[1] : parsed?.module;
  return gateway.withAudit(`standing_approvals.${mode}`, { service, module, label }, async (line) => {
    if (mode !== 'list') {
      const decision = evaluate(gateway.policy, {
        harness: gateway.harness, role: gateway.role, service, module, op: 'standingApproval',
      });
      if (decision.effect === 'deny') return statusObject(STATUS.DENIED, { rule: decision.rule });
    }
    const invalid = validateArgs('standing_approvals', args);
    if (invalid) return invalid;
    if (mode === 'list') {
      const stored = await gateway.standingApprovals.list();
      const grants = stored.filter((grant) => isActiveStandingApproval(grant, gateway.now()))
        .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
      return { status: 'ok', standing_approvals: grants.map((grant) => ({ ...grant, summary: standingApprovalSummary(grant) })) };
    }
    if (mode === 'revoke') {
      if (typeof args.id !== 'string' || !args.id) {
        return statusObject(STATUS.INVALID_ARGUMENTS, { field: 'id', reason: 'required' });
      }
      const grants = await gateway.standingApprovals.list();
      const active = grants.find((grant) => grant.id === args.id && isActiveStandingApproval(grant, gateway.now()));
      const revoked = active ? await gateway.standingApprovals.revoke(args.id, new Date(gateway.now()).toISOString()) : null;
      if (!revoked) return statusObject(STATUS.INVALID_ARGUMENTS, { field: 'id', reason: 'not_found' });
      line.service = revoked.service;
      line.module = revoked.module;
      line.label = revoked.label;
      line.grant_id = revoked.id;
      return { status: 'ok', revoked };
    }
    const checked = gateway.standingApprovalScope(args);
    if (checked.refusal) return checked.refusal;
    const { scope, summaries, cautions, kinds, heightened } = checked;
    const at = gateway.now();
    const expiresOn = new Date(at + scope.days * STANDING_APPROVAL_DAY_MS).toISOString().slice(0, 10);
    const warning = buildStandingApprovalWarning({ scope, summaries, cautions, kinds, heightened, expiresOn });
    const key = confirmationDigest(['standing_approval', scope, warning]);
    const proposalExpiry = mode === 'grant' && args.confirmed === true ? gateway.takePendingConfirmationExpiry(key) : null;
    if (proposalExpiry === null) {
      gateway.recordPendingConfirmation(key);
      return {
        status: 'standing_approval_proposed', scope, expires_on: expiresOn, heightened, kinds,
        warning,
        next: 'Show the warning to the person word for word; only their own yes in their next turn creates it, by calling standing_approvals with mode grant, the same scope and confirmed: true.',
        ...(mode === 'grant' && args.confirmed === true ? { reason: 'unmatched_confirm' } : {}),
      };
    }
    const { days, ...storedScope } = scope;
    const grant = {
      id: `sa_${createHash('sha256').update(`${key}:${proposalExpiry}`).digest('hex').slice(0, 32)}`,
      service, module, ...storedScope, summaries, cautions, kinds, heightened,
      created_at: new Date(at).toISOString(),
      expires_at: new Date(at + days * STANDING_APPROVAL_DAY_MS).toISOString(), revoked_at: null,
    };
    await gateway.standingApprovals.add(grant);
    const stored = (await gateway.standingApprovals.list()).find((row) => row.id === grant.id);
    if (!stored) throw new Error('standing approval was not saved');
    line.grant_id = stored.id;
    return { status: 'ok', standing_approval: stored, summary: standingApprovalSummary(stored) };
  });
}

/**
 * Recheck the manifest and account for both propose and grant. Module scope
 * expands now and is frozen in the stored record, never at execute time.
 * @param {object} args
 */
export function standingApprovalScope(gateway, args) {
  const bad = (field, reason) => ({ refusal: statusObject(STATUS.INVALID_ARGUMENTS, { field, reason }) });
  const allowed = new Set(['mode', 'actions', 'module', 'label', 'root', 'playbook', 'where', 'days']);
  if (args.mode === 'grant') allowed.add('confirmed');
  for (const field of Object.keys(args)) if (!allowed.has(field)) return bad(field, 'not_declared');
  if (args.root === undefined) return bad('root', 'required');
  if ((args.actions !== undefined) === (args.module !== undefined)) return bad('actions', 'exactly_one');
  let actions = args.actions;
  if (args.module) {
    const [service, module] = args.module.split('.');
    const found = gateway.lookupModule(service, module);
    actions = Object.entries(found?.mod.actions ?? {})
      .filter(([, action]) => action.standing_approval)
      .map(([name]) => `${service}.${module}.${name}`);
    if (actions.length === 0) return bad('module', 'not_eligible');
  }
  actions = [...new Set(actions)].sort();
  const covered = [];
  for (const action of actions) {
    const parsed = parseActionId(action);
    if (!parsed || parsed.service === 'wiser') return bad('actions', 'not_eligible');
    const resolved = resolveAction(action, { connectors: gateway.connectors });
    if (resolved.path !== 'connector' || !resolved.def.standing_approval) return bad('actions', 'not_eligible');
    covered.push(resolved);
  }
  const { service, module } = covered[0].parsed;
  if (covered.some((item) => item.parsed.service !== service || item.parsed.module !== module)) {
    return bad('actions', 'mixed_modules');
  }
  const auth = covered[0].auth;
  if (args.label !== undefined && auth.provider === 'local-file') return bad('label', 'not_eligible');
  const record = gateway.store.getConnection({ service, module, label: args.label });
  if (!isActive(record) || typeof record.provider_account_id !== 'string' || !record.provider_account_id) {
    return { refusal: statusObject(STATUS.NEEDS_CONNECT, {
      service, module, privilege: auth.privilege ?? null,
      ...(args.label === undefined ? {} : { label: args.label }),
    }) };
  }
  const entries = [];
  for (const field of Object.keys(args.where ?? {}).sort()) {
    if (containsUnsafeCodePoint(field)) return bad(`where.${field}`, 'unsafe');
    if (covered.some(({ def }) => {
      const properties = def.input?.properties ?? {};
      if (!Object.hasOwn(properties, field)) return true;
      const type = properties[field]?.type;
      return !(Array.isArray(type) ? type : [type]).includes('string');
    })) return bad(`where.${field}`, 'not_declared');
    const values = args.where[field];
    if (values.some((value) => containsUnsafeCodePoint(value))) return bad(`where.${field}`, 'unsafe');
    if (new Set(values).size !== values.length) return bad(`where.${field}`, 'duplicate');
    try { assertNoSecrets({ [field]: values }); } catch { return bad(`where.${field}`, 'credential_like'); }
    entries.push([field, values.slice().sort()]);
  }
  const kinds = [...new Set(covered.map(({ def }) => def.standing_approval.kind))].sort();
  const heightened = isHeightened(kinds);
  const maxDays = maxStandingApprovalDays(kinds, args.playbook);
  const days = args.days ?? Math.min(90, maxDays);
  if (days > maxDays) return bad('days', 'max');
  const scope = {
    actions, module_wide: Boolean(args.module), label: args.label ?? null,
    provider_account_id: record.provider_account_id, root: args.root,
    playbook: args.playbook ?? null, where: entries.length ? Object.fromEntries(entries) : null, days,
  };
  // Root identifiers can themselves resemble credentials; reject before the
  // local adapter would throw, and before a hosted adapter could save them.
  for (const field of ['root', 'playbook', 'provider_account_id']) {
    try { assertNoSecrets(scope[field]); } catch { return bad(field, 'credential_like'); }
  }
  return {
    scope, kinds, heightened,
    summaries: covered.map(({ def }) => def.standing_approval.summary),
    cautions: [...new Set(covered.map(({ def }) => def.standing_approval.caution).filter((caution) => caution !== undefined))],
  };
}


/** Synchronous checks and the file approval snapshot all precede the first await. */
export function prepareExecute(gateway, request, line) {
  const { action, input, confirm, label, root, playbook, labelled } = request;
  const parsed = parseActionId(action);
  if (!parsed) {
    line.path = 'none';
    return statusObject(STATUS.NEEDS_CONNECTOR, { action: action ?? null });
  }
  line.service = parsed.service;
  line.module = parsed.module;

  const found = gateway.lookupModule(parsed.service, parsed.module);
  const declaredAct = found?.mod?.actions?.[parsed.action];
  const curated = declaredAct ? null : getCuratedAction(gateway, action);
  const act = declaredAct ?? curated?.def;
  const auth = found?.auth;
  // Call-local permissions also govern the writer after the module returns.
  const outputDeclaration = act?.output_file ? {
    media_types: [...act.output_file.media_types], max_bytes: act.output_file.max_bytes,
  } : null;
  const inputDeclaration = act?.input_files ? { ...act.input_files } : null;
  const inputFileSchema = inputDeclaration ? structuredClone(act.input.properties[inputDeclaration.field]) : null;
  const downloadDeclaration = act?.download_media ? { hosts: [...act.download_media.hosts] } : null;
  const proxyBodyMaxBytes = act?.proxy_body_max_bytes;
  if (label !== undefined && auth?.provider === 'local-file') {
    return statusObject(STATUS.INVALID_ARGUMENTS, { tool: 'execute', field: 'label' });
  }
  const firstParty = !act ? firstPartyDef(action) : null;
  const privilege = auth?.privilege ?? firstParty?.privilege;
  const risk = act?.risk ?? firstParty?.risk;
  line.privilege = privilege ?? null;
  // Set before the deny return. A wiser.* id with no connector action is a
  // first-party call on every exit, including the ones that never reach
  // the adapter: denied, needs_subscription, invalid_arguments,
  // needs_confirmation, and undeclared.
  if (parsed.service === 'wiser' && !act) line.firstParty = true;

  const decision = evaluate(gateway.policy, {
    harness: gateway.harness,
    role: gateway.role,
    service: parsed.service,
    module: parsed.module,
    privilege,
    risk,
    op: 'execute',
  });
  if (decision.effect === 'deny') {
    line.path = curated ? 'catalog' : 'none';
    return statusObject(STATUS.DENIED, { rule: decision.rule });
  }

  const resolved = curated ? { path: 'catalog', actionId: action } : resolveAction(action, {
    connectors: gateway.connectors,
    catalogProvider: gateway.catalogProvider,
    classifier: gateway.classifier,
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
    return { firstParty: { action, input, confirm, label, parsed, decision, resolved, line } };
  }
  if (resolved.path === 'none') {
    if (parsed.service === 'wiser') return gateway.needsSubscriptionResult('missing');
    return statusObject(STATUS.NEEDS_CONNECTOR, { action });
  }
  // A bare mapping row never runs. Only a manifest action or a validated
  // curated row supplies the safety declaration used by the common flow.
  if (!act) {
    line.path = 'none';
    return statusObject(STATUS.NEEDS_CONNECTOR, { action, reason: 'undeclared' });
  }

  // Curated rows have no module validator. Refuse bad input before even a
  // provider account listing can run; declared actions retain their ordering.
  if (curated) {
    const invalidField = validateInput(act.input, input === undefined ? {} : input);
    if (invalidField !== null) return statusObject(STATUS.INVALID_ARGUMENTS, { field: invalidField });
  }

  const hasInputFiles = inputDeclaration && input !== null && typeof input === 'object' &&
    !Array.isArray(input) && Object.hasOwn(input, inputDeclaration.field);
  if (hasInputFiles && !inputFileAccessFor(gateway)) {
    return statusObject(STATUS.LOCAL_ONLY, {
      action, reason: 'Calls naming local input files run only on the local stdio gateway.',
    });
  }
  if (act.output_file && !gateway.outputsDir) {
    return statusObject(STATUS.LOCAL_ONLY, {
      action,
      reason: 'This action writes a file on your own computer, which only the local gateway can do.',
    });
  }

  const authForRun = resolved.path === 'connector' ? resolved.auth : auth;
  let record = gateway.store.getConnection({ service: parsed.service, module: parsed.module, label });
  if (label === undefined && !record) {
    const missing = gateway.requireLabel('execute', parsed.service, parsed.module);
    if (missing) return missing;
  }
  if (label !== undefined && !isActive(record)) {
    return statusObject(STATUS.NEEDS_CONNECT, {
      service: parsed.service,
      module: parsed.module,
      privilege: privilege ?? null,
      label,
    });
  }
  // Copy the one pending snapshot before hydration, status or any other await.
  // A concurrent stop may replace the slot while this confirm prepares files.
  let fileApproval = null;
  let fileApprovalBase = null;
  if (hasInputFiles && confirm === true && isActive(record)) {
    gateway.prunePendingConfirmations();
    const approval = approvalDisclosure(act, input);
    if (!approval.refusal) {
      const base = confirmationDigest(['execute', action, approval.inputForKey, record.provider_account_id,
        ...(label === undefined ? [] : [label])]);
      fileApprovalBase = base;
      const pending = fileConfirmations.get(gateway).get(base);
      if (pending) fileApproval = {
        fullDigest: pending.fullDigest, descriptors: pending.descriptors.map((entry) => ({ ...entry })),
      };
    }
  }
  if (gateway.needsProviderCredential(authForRun || { provider: 'catalog' })) {
    return gateway.needsProviderResult();
  }

  return {
    request, labelled, action, input, confirm, label, root, playbook, parsed, act, curated,
    outputDeclaration, inputDeclaration, inputFileSchema, downloadDeclaration, proxyBodyMaxBytes,
    privilege, risk, decision, resolved, hasInputFiles, authForRun, record, fileApproval, fileApprovalBase,
  };
}

/** Check the connection, inputs and approval, then continue without adding an await before execution. */
export async function approveExecute(gateway, call, line, { prepareInputFiles, runApproved }) {
  const {
    request, labelled, action, input, confirm, label, root, playbook, parsed, act, curated,
    inputDeclaration, privilege, risk, decision, resolved, hasInputFiles, authForRun,
    fileApproval, fileApprovalBase,
  } = call;
  let { record } = call;
  if (label === undefined && !isActive(record) && authForRun?.provider !== 'local-file') {
    await gateway.hydrateFromProvider();
    record = gateway.store.getConnection({ service: parsed.service, module: parsed.module });
  }
  line.provider_account_id = record?.provider_account_id ?? null;
  if (!isActive(record)) {
    return statusObject(STATUS.NEEDS_CONNECT, {
      service: parsed.service,
      module: parsed.module,
      privilege: privilege ?? null,
      ...labelled,
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
  const invalidField = curated ? null : validateInput(act.input, input === undefined ? {} : input);
  if (invalidField !== null) return statusObject(STATUS.INVALID_ARGUMENTS, { field: invalidField });

  const provider = gateway.providerFor(authForRun);
  const statusArgs = {
    providerAccountId: record.provider_account_id ?? null,
    service: parsed.service,
    file: authForRun?.file,
    variables: authForRun?.variables,
  };
  const stopGrant = (providerStatus, reason) => {
    gateway.store.putConnection({ ...record, status: providerStatus });
    return statusObject(STATUS.NEEDS_CONNECT, {
      service: parsed.service,
      module: parsed.module,
      privilege: privilege ?? null,
      provider_status: providerStatus,
      ...(reason === undefined ? {} : { reason }),
      ...labelled,
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

  const prepared = prepareInputFiles(gateway, call);
  if (isStatusObject(prepared)) {
    if (fileApproval) forgetFileConfirmation(gateway, fileApprovalBase, fileApproval.fullDigest);
    return prepared;
  }
  const { preparedInputFiles, fileDescriptors } = prepared;
  if (hasInputFiles && fileApproval && canonicalJson(fileDescriptors) !== canonicalJson(fileApproval.descriptors)) {
    forgetFileConfirmation(gateway, fileApprovalBase, fileApproval.fullDigest);
    return statusObject(STATUS.INVALID_ARGUMENTS, { field: inputDeclaration.field, reason: 'input_file_changed' });
  }

  const confirmation = act?.confirmation || 'none';
  const onceKey = label === undefined ? action : canonicalJson([action, label, record.provider_account_id]);
  const needsConfirm =
    hasInputFiles || decision.effect === 'confirm' ||
    confirmation === 'always' ||
    (confirmation === 'once' && !gateway.confirmedOnce.has(onceKey));
  // What may be shown lives in src/disclosure.js. This block decides that a
  // stop happens, on which of the three entry paths, and that `confirm: true`
  // matches the stop for this exact input. Disclosure runs first. A withheld
  // field is refused, and the key is taken only when a stop or a match is
  // needed, after that check, so it is a valid input no deeper than the
  // disclosure limit. A call that needs no approval does not reach either.
  if (needsConfirm) {
    const approval = approvalDisclosure(act, input);
    if (approval.refusal) return approval.refusal;
    if (!hasInputFiles && confirm !== true && root && act.standing_approval && resolved.path === 'connector') {
      request.standingGrant = matchStandingApproval(await gateway.standingApprovals.list(), {
        action, manifestAction: act, label, providerAccountId: record.provider_account_id,
        root, playbook, input, now: gateway.now(),
      });
      if (request.standingGrant) line.grant_id = request.standingGrant.id;
    }
    if (!request.standingGrant) {
      const identity = [
        'execute',
        action,
        approval.inputForKey,
        record.provider_account_id,
        // A label joins the key only when given, so an unlabelled approval keeps today's key.
        ...(label === undefined ? [] : [label]),
      ];
      const baseKey = confirmationDigest(identity);
      const confirmKey = hasInputFiles ? confirmationDigest([...identity, fileDescriptors]) : baseKey;
      const matched = confirm === true && (hasInputFiles
        ? fileApproval !== null && fileApproval.fullDigest === confirmKey && gateway.takePendingConfirmation(fileApproval.fullDigest)
        : gateway.takePendingConfirmation(confirmKey));
      if (!matched) {
        // A missed take records only the current read, never the copied digest.
        if (hasInputFiles) recordFileConfirmation(gateway, baseKey, confirmKey, fileDescriptors);
        else gateway.recordPendingConfirmation(confirmKey);
        const disclosure = approval.disclosure;
        const attachmentFiles = hasInputFiles ? discloseAttachmentFiles(fileDescriptors) : [];
        const summary = composeSummary({
          action,
          service: parsed.service,
          module: parsed.module,
          risk,
          description: act?.description,
          leadingSummary: curated?.row.summary,
          keyFields: curated?.row.key_fields ?? act?.key_fields,
          disclosure, attachmentFiles,
        });
        return statusObject(STATUS.NEEDS_CONFIRMATION, {
          action,
          service: parsed.service,
          module: parsed.module,
          risk: risk ?? null,
          confirmation,
          label: label ?? null,
          input_fields: disclosure.fields,
          undeclared_fields: disclosure.undeclared,
          input_values: inputValueEntries(disclosure.shown),
          ...(hasInputFiles ? { attachment_files: attachmentFiles } : {}),
          withheld_fields: disclosure.withheld,
          summary,
          description: act?.description ?? null,
          ...(confirm === true ? { reason: 'unmatched_confirm' } : {}),
        });
      }
    }
  }
  if (confirm === true && confirmation === 'once') {
    gateway.confirmedOnce.add(onceKey);
  }

  return runApproved({ ...call, record, provider, statusArgs, stopGrant, preparedInputFiles });
}
