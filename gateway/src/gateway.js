// Gateway composes the parts behind ConnectionGateway's public methods and ordered execute flow.
import { isStatusObject, projectProviderCodes, sanitizeError } from './errors.js';
import { standingApprovalResult } from './standing-approvals.js';
import { confirmationDigest, inputValueEntries } from './safety.js';
import * as safety from './safety.js';
import * as runner from './runner.js';
import * as connections from './connections.js';
import * as catalog from './catalog.js';
import * as tools from './tools.js';
import * as firstParty from './first-party.js';
import * as host from './host.js';

export { classifierNeedsSubscription, mcpClassifierIdentity, oneShotClassifierIdentity } from './first-party.js';
export { SEARCH_PICK_BAND } from './catalog.js';
export { validateArgs } from './tools.js';
export { buildStandingApprovalWarning, createStandingApprovals, matchStandingApproval, standingApprovalSummary } from './standing-approvals.js';
export { PENDING_CONFIRMATION_TTL_MS, PENDING_CONFIRMATION_MAX, canonicalJson, confirmationDigest } from './safety.js';

/**
 * Connection gateway: resolve, policy, execute, connect.
 */
export class ConnectionGateway {
  /**
   * @param {object} opts
   */
  constructor(opts) {
    safety.initializeSafety(this);
    // Host keeps pendingConfirmations as the public, host-hydratable numeric Map.
    host.initializeHost(this, opts);
  }

  /** Called only on stdio serve start, and by the writer before each file. */
  cleanupOutputs() {
    return host.cleanupOutputs(this);
  }

  prunePendingConfirmations() {
    return safety.prunePendingConfirmations(this);
  }

  recordPendingConfirmation(key) {
    return safety.recordPendingConfirmation(this, key);
  }

  takePendingConfirmation(key) {
    return safety.takePendingConfirmation(this, key);
  }

  takePendingConfirmationExpiry(key) {
    return safety.takePendingConfirmationExpiry(this, key);
  }

  /**
   * Verified, unrefused, with exactly one owning root, still unrefused at
   * send time. Otherwise a reason and no send.
   * @returns {{ ok: true, binding: Record<string, unknown> } | { ok: false, reason: string }}
   */
  classifierSession() {
    return firstParty.classifierSession(this);
  }

  classifiers() {
    return firstParty.classifiers(this);
  }

  needsSubscriptionResult(kind) {
    return firstParty.needsSubscriptionResult(this, kind);
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
    return connections.revokedAccounts(this);
  }

  resolveUserId() {
    return host.resolveUserId(this);
  }

  listTools() {
    return tools.listTools(this);
  }

  /**
   * @param {string} name
   * @param {object} [args]
   */
  async callTool(name, args = {}) {
    return tools.callTool(this, name, args);
  }

  lookupModule(service, module) {
    return catalog.lookupModule(this, service, module);
  }

  requireLabel(tool, service, module) {
    return connections.requireLabel(this, tool, service, module);
  }

  bindLabelledModules(found, record) {
    return connections.bindLabelledModules(this, found, record);
  }

  providerFor(auth) {
    return connections.providerFor(this, auth);
  }

  needsProviderCredential(auth) {
    return connections.needsProviderCredential(this, auth);
  }

  needsProviderResult() {
    return connections.needsProviderResult(this);
  }

  async withAudit(op, fields, fn) {
    return runner.withAudit(this, op, fields, fn);
  }

  async standingApprovalsTool(args = {}) {
    return safety.standingApprovalsTool(this, args);
  }

  standingApprovalScope(args) {
    return safety.standingApprovalScope(this, args);
  }

  listConnections() {
    return connections.listConnections(this);
  }

  /**
   * Copy ACTIVE grants the provider already holds for this user id into the
   * local store as metadata. Never tokens. Do not overwrite an ACTIVE row.
   * Skip a toolkit that has more than one ACTIVE account. Local-file modules
   * are not hydrated.
   */
  async hydrateFromProvider() {
    return connections.hydrateFromProvider(this);
  }

  listActions(args = {}) {
    return catalog.listActions(this, args);
  }

  /**
   * Null when this search is today's substring list and nothing is sent:
   * no query, no classifier loaded, or a loaded classifier whose key reads
   * null. A failed session gate is reported and still sends nothing.
   * @param {{ query?: unknown }} args
   * @returns {{ call: boolean, reason: string | null } | null}
   */
  classifierSearchAttempt(args) {
    return catalog.classifierSearchAttempt(this, args);
  }

  searchActions(args = {}) {
    return catalog.searchActions(this, args);
  }

  async rankSearch(actions, args) {
    return catalog.rankSearch(this, actions, args);
  }

  describeAction(id) {
    return catalog.describeAction(this, id);
  }

  async execute({ action, input, confirm, label, root, playbook } = {}) {
    const labelled = label === undefined ? {} : { label };
    const request = { action, input, confirm, label, root, playbook, labelled, standingGrant: null };
    const result = await this.withAudit('execute', { action: action ?? null, label }, async (line) => {
      const prepared = safety.prepareExecute(this, request, line);
      if (isStatusObject(prepared)) return prepared;
      if (prepared.firstParty) return this.executeFirstParty(prepared.firstParty);
      if (prepared.hosted) return runner.runHosted(this, prepared);
      return safety.approveExecute(this, prepared, line, {
        prepareInputFiles: runner.prepareInputFiles,
        runApproved: (approved) => runner.runApproved(this, approved, line),
      });
    });
    return standingApprovalResult(result, request.standingGrant);
  }

  /**
   * First-party dispatch. Never reads `act` (undefined for a wiser.* id).
   * @param {object} args
   */
  async executeFirstParty(args) {
    // Keep this projection guard here for consumers that inspect gateway.js.
    const projectStatus = (result) => {
      if (isStatusObject(result)) return projectProviderCodes(result);
      return null;
    };
    return firstParty.executeFirstParty(this, args, {
      prepareUnboundAction: (call) => safety.prepareUnboundAction(this, call), projectStatus,
    });
  }

  async startConnect(args = {}) {
    return connections.startConnect(this, args);
  }

  async connectStatus(args = {}) {
    return connections.connectStatus(this, args);
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
  async disconnect(args = {}) {
    return connections.disconnect(this, args, { confirmationDigest, inputValueEntries });
  }
}

export { TOOLS as GATEWAY_TOOLS } from './tools.js';
export { sanitizeError };
