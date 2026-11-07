// Connections manages account bindings, provider hydration and the connect, status and disconnect flows.
import { randomUUID } from 'node:crypto';
import { STATUS, statusObject, vendorErrorFrom } from './errors.js';
import { composeSummary, containsUnsafeCodePoint, discloseInput } from './disclosure.js';
import { evaluate } from './policy.js';
// Stored rows use the manifest validator's provider and privilege vocabularies.
import { AUTH_PROVIDERS, PRIVILEGES } from './manifest.js';

function nowIso() {
  return new Date().toISOString();
}

export function isActive(record) {
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
 * A rejected account listing, as a provider error for the request that failed.
 * `listingRequest` is the adapter's `{ status, endpoint, method }` and nothing
 * from the body. A rejection that names no request is still not a missing grant.
 * @param {unknown} err
 */
function listingProviderError(err) {
  const named = err && typeof err === 'object' && !Array.isArray(err) ? err.listingRequest : null;
  const request = named && typeof named === 'object' && !Array.isArray(named) ? named : null;
  const endpoint = request && typeof request.endpoint === 'string' && request.endpoint.length > 0
    ? request.endpoint
    : null;
  const method = request && typeof request.method === 'string' ? request.method : null;
  const httpStatus = request && Object.hasOwn(request, 'status') ? request.status : null;
  return vendorErrorFrom({
    status: httpStatus,
    error: { code: 'vendor_error', endpoint, method },
  });
}

export function revokedAccounts(gateway) {
  if (!gateway._revokedAccounts) gateway._revokedAccounts = new Set();
  return gateway._revokedAccounts;
}

export function requireLabel(gateway, tool, service, module) {
  const labels = gateway.store.listConnections()
    .filter((row) => row.service === service && row.module === module && typeof row.label === 'string')
    .map((row) => row.label).sort();
  return labels.length ? statusObject(STATUS.INVALID_ARGUMENTS, { tool, field: 'label', labels }) : null;
}

export function bindLabelledModules(gateway, found, record) {
  const toolkit = (value) => String(value || '').toUpperCase().replace(/^CUSTOM_/, '');
  if (!toolkit(found.auth.toolkit)) return;
  for (const [module, definition] of Object.entries(found.connector.manifest.modules)) {
    const auth = definition.auth;
    if (module === record.module || auth.provider !== found.auth.provider
      || toolkit(auth.toolkit) !== toolkit(found.auth.toolkit)) continue;
    // One label holds one credential per toolkit, so a sibling on another account moves too.
    const current = gateway.store.getConnection({ service: record.service, module, label: record.label });
    if (isActive(current) && current.provider_account_id === record.provider_account_id) continue;
    // A sibling mid-reconnect onto a new account is left to finish; a refresh must not undo it.
    if (current?.status === 'INITIATED' && current.provider_account_id !== record.provider_account_id) continue;
    gateway.store.putConnection({
      service: record.service,
      module,
      label: record.label,
      privilege: auth.privilege,
      provider: auth.provider,
      provider_account_id: record.provider_account_id,
      scopes: [],
      status: 'ACTIVE',
    });
  }
}

export function providerFor(gateway, auth) {
  if (auth?.provider === 'local-file') return gateway.localFileProvider;
  return gateway.authProvider;
}

export function needsProviderCredential(gateway, auth) {
  if (!auth) return !gateway.authConfigured;
  if (auth.provider === 'local-file') return false;
  return !gateway.authConfigured;
}

export function needsProviderResult(gateway) {
  const setup = typeof gateway.authProvider?.setupText === 'function'
    ? gateway.authProvider.setupText()
    : 'Open the credential file the gateway created, paste the project key after WISER_AUTH_PROVIDER_KEY=, save, and restart. Do not paste the key into chat.';
  return statusObject(STATUS.NEEDS_PROVIDER, { setup });
}

export function listConnections(gateway) {
  if (gateway.needsProviderCredential()) return gateway.needsProviderResult();
  return gateway.hydrateFromProvider().then(() => ({ connections: gateway.store.listConnections() }));
}

export async function hydrateFromProvider(gateway) {
  const list = gateway.authProvider?.listAccounts;
  if (typeof list !== 'function') return;
  let accounts;
  try {
    accounts = await list.call(gateway.authProvider, { userId: gateway.resolveUserId() });
  } catch (err) {
    // Returned, not swallowed, so connect_status can tell a failed list from
    // an empty one. execute and list_connections ignore this value. They still
    // write nothing, which is what they already did.
    return { failed: true, error: err };
  }
  if (!Array.isArray(accounts) || accounts.length === 0) return;

  const byToolkit = activeAccountIdsByToolkit(accounts);
  // A toolkit with a labelled row is named call by call, so adoption never guesses there:
  // an account a label just let go of would otherwise land on the unlabelled binding.
  const toolkitKey = (value) => String(value || '').toUpperCase().replace(/^CUSTOM_/, '');
  const labelledToolkits = new Set(gateway.store.listConnections()
    .filter((row) => row.label !== undefined)
    .map((row) => toolkitKey(gateway.lookupModule(row.service, row.module)?.auth?.toolkit))
    .filter(Boolean));

  for (const connector of gateway.connectors) {
    const service = connector.id || connector.service;
    const modules = connector.manifest?.modules || {};
    for (const [module, definition] of Object.entries(modules)) {
      const auth = definition?.auth;
      if (!auth || auth.provider === 'local-file') continue;
      const toolkit = auth.toolkit && String(auth.toolkit).toUpperCase();
      if (!toolkit) continue;
      if (labelledToolkits.has(toolkitKey(toolkit))) continue;
      const accountId = byToolkit.get(toolkit) || byToolkit.get(toolkit.replace(/^CUSTOM_/, ''));
      if (!accountId) continue;
      // A listing captured before a teardown still carries the revoked account. Writing
      // it back recreates the stale ACTIVE rows this build exists to remove, and
      // checking whether a row exists cannot catch it, because writing missing rows is
      // what hydration is for.
      if (gateway.revokedAccounts.has(accountId)) continue;
      if (gateway.store.listConnections().some((row) => row.label !== undefined && row.provider_account_id === accountId)) continue;
      const existing = gateway.store.getConnection({ service, module });
      if (isActive(existing) && existing.provider_account_id) continue;
      gateway.store.putConnection({
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

export async function startConnect(gateway, { service, module, label } = {}) {
  return gateway.withAudit('startConnect', { service, module, label, action: null }, async (line) => {
    if (!service || !module) {
      return statusObject(STATUS.NEEDS_CONNECTOR, { action: null, service: service ?? null, module: module ?? null });
    }
    const found = gateway.lookupModule(service, module);
    if (!found) {
      line.path = 'none';
      return statusObject(STATUS.NEEDS_CONNECTOR, { service, module });
    }
    if (label !== undefined && found.auth.provider === 'local-file') {
      return statusObject(STATUS.INVALID_ARGUMENTS, { tool: 'start_connect', field: 'label' });
    }
    line.privilege = found.auth.privilege;
    const decision = evaluate(gateway.policy, {
      harness: gateway.harness,
      role: gateway.role,
      service,
      module,
      privilege: found.auth.privilege,
      op: 'startConnect',
    });
    if (decision.effect === 'deny') {
      return statusObject(STATUS.DENIED, { rule: decision.rule });
    }

    if (gateway.needsProviderCredential(found.auth)) {
      return gateway.needsProviderResult();
    }

    const provider = gateway.providerFor(found.auth);
    if (!provider || typeof provider.initiate !== 'function') {
      return gateway.needsProviderResult();
    }

    const initiated = await provider.initiate({
      userId: gateway.resolveUserId(),
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
      gateway.store.putConnection({
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
    gateway.store.putConnection({
      id: randomUUID(),
      service,
      module,
      ...(label === undefined ? {} : { label }),
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

export async function connectStatus(gateway, { service, module, label } = {}) {
  const labelled = label === undefined ? {} : { label };
  return gateway.withAudit('connectStatus', { service, module, label, action: null }, async (line) => {
    if (!service || !module) {
      return statusObject(STATUS.NEEDS_CONNECTOR, { service: service ?? null, module: module ?? null });
    }
    const found = gateway.lookupModule(service, module);
    if (label !== undefined && found?.auth?.provider === 'local-file') {
      return statusObject(STATUS.INVALID_ARGUMENTS, { tool: 'connect_status', field: 'label' });
    }
    const stored = gateway.store.getConnection({ service, module, label });

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
    const decision = evaluate(gateway.policy, {
      harness: gateway.harness,
      role: gateway.role,
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

    if (label !== undefined && !stored?.provider_account_id) {
      return statusObject(STATUS.NEEDS_CONNECT, { service, module, privilege: target.auth.privilege, label });
    }

    if (gateway.needsProviderCredential(target.auth)) {
      return gateway.needsProviderResult();
    }

    const provider = gateway.providerFor(target.auth);
    let record = stored;
    if (!provider || typeof provider.status !== 'function') {
      line.provider_account_id = record?.provider_account_id ?? null;
      line.path = 'connector';
      return gateway.needsProviderResult();
    }

    // A catalog account is asked for by id. With none, the catalog adapter
    // requests `/connected_accounts/`. That URL answers 200 with a listing,
    // and a listing has no account status, so it arrives here as
    // vendor_error. Measured live on 2026-09-19 for dataforseo and for bing,
    // each with no row. execute does not ask that URL. It refreshes from
    // the account list first and, when that still leaves no account id,
    // answers needs_connect. The same refresh here. The account endpoint
    // is called only once an id exists. local-file status reads a file.
    // An orphan already carries an id, and that path is unchanged.
    //
    // A list that could not be read is not an empty list. listAccounts
    // rejects on an HTTP error, a malformed body, or a transport error, and
    // hydrateFromProvider used to catch that and return, so this branch
    // answered needs_connect when the provider was never read. The answer
    // is the provider error for that listing request, and the row is left
    // as it was. execute still ignores the rejection and answers
    // needs_connect. That path is not this one.
    const storedId = record?.provider_account_id;
    const hasAccount = typeof storedId === 'string' && storedId.length > 0;
    if (label === undefined && !orphaned && target.auth.provider !== 'local-file' && !hasAccount) {
      const listed = await gateway.hydrateFromProvider();
      if (listed && listed.failed) {
        line.provider_account_id = record?.provider_account_id ?? null;
        line.path = 'connector';
        return listingProviderError(listed.error);
      }
      record = gateway.store.getConnection({ service, module, label });
      const refreshed = record?.provider_account_id;
      if (typeof refreshed !== 'string' || refreshed.length === 0) {
        line.provider_account_id = null;
        line.path = 'connector';
        return statusObject(STATUS.NEEDS_CONNECT, {
          service,
          module,
          privilege: found.auth.privilege,
          ...labelled,
        });
      }
    }

    line.provider_account_id = record?.provider_account_id ?? null;
    line.path = 'connector';

    const statusArgs = {
      providerAccountId: record?.provider_account_id ?? null,
      service,
      file: found?.auth?.file,
      variables: found?.auth?.variables,
    };
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
      return statusObject(STATUS.NEEDS_CONNECT, { service, module, privilege: found.auth.privilege, ...labelled });
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
      const current = gateway.store.getConnection({ service, module, label });
      const accountNow = current?.provider_account_id ?? null;
      const accountThen = record.provider_account_id ?? null;
      if (!current) {
        return statusObject(STATUS.NEEDS_CONNECTOR, { service, module, reason: 'removed_while_checking' });
      }
      if (accountNow !== accountThen) {
        return statusObject(STATUS.NEEDS_CONNECTOR, { service, module, reason: 'rebound_while_checking' });
      }
      gateway.store.putConnection({
        id: record.id,
        service,
        module,
        ...labelled,
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
      const current = gateway.store.getConnection({ service, module, label });
      const accountNow = current?.provider_account_id ?? null;
      const accountThen = record?.provider_account_id ?? null;
      if (!current && record) {
        return statusObject(STATUS.NEEDS_CONNECT, { service, module, privilege: found.auth.privilege, ...labelled, reason: 'removed_while_checking' });
      }
      if (record && accountNow !== accountThen) {
        return statusObject(STATUS.NEEDS_CONNECT, { service, module, privilege: found.auth.privilege, ...labelled, reason: 'rebound_while_checking' });
      }
      const saved = gateway.store.putConnection({
        id: record?.id || randomUUID(),
        service,
        module,
        privilege: found.auth.privilege,
        ...labelled,
        provider: found.auth.provider,
        provider_account_id: record?.provider_account_id ?? statusArgs.providerAccountId,
        scopes: record?.scopes || [],
        status: 'ACTIVE',
        created: record?.created || nowIso(),
        updated: nowIso(),
      });
      if (label !== undefined) gateway.bindLabelledModules(found, saved);
      return { status: 'connected', connection: saved };
    }
    if (record) {
      // The same guard as the ACTIVE branch above. A non-ACTIVE answer that overtakes
      // a teardown put the deleted row back, and where a reconnect had landed it
      // overwrote the new binding with the old one. Found by adversarial review after
      // the first fix covered only the ACTIVE path.
      const current = gateway.store.getConnection({ service, module, label });
      const accountNow = current?.provider_account_id ?? null;
      if (current && accountNow === (record.provider_account_id ?? null)) {
        gateway.store.putConnection({ ...record, status: mapped });
      }
    }
    if (mapped === 'INITIATED') {
      return { status: 'INITIATED', service, module };
    }
    return statusObject(STATUS.NEEDS_CONNECT, {
      service,
      module,
      privilege: found.auth.privilege,
      ...labelled,
      provider_status: mapped,
    });
  });
}

export async function disconnect(gateway, { service, module, label, provider_account_id: approvedAccount, confirm } = {}, { confirmationDigest, inputValueEntries }) {
  return gateway.withAudit('disconnect', { service, module, label }, async (line) => {
    const found = gateway.lookupModule(service, module);
    if (label !== undefined && found?.auth?.provider === 'local-file') {
      return statusObject(STATUS.INVALID_ARGUMENTS, { tool: 'disconnect', field: 'label' });
    }
    const stored = gateway.store.getConnection({ service, module, label });
    if (label === undefined && !stored) {
      const missing = gateway.requireLabel('disconnect', service, module);
      if (missing) return missing;
    }

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
    // on it, the approval binds to the account id and to those modules, and removal still needs ABSENT
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

    const authorize = (svc, mod, privilege) => evaluate(gateway.policy, {
      harness: gateway.harness,
      role: gateway.role,
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

    // A stored id is echoed raw on the stop, because the caller sends it back.
    // One that contains a code point the disclosure policy will not emit raw is
    // refused before that stop, and the id is not copied onto the refusal.
    if (containsUnsafeCodePoint(accountId)) {
      return statusObject(STATUS.DENIED, {
        service,
        module,
        reason: 'unsafe_account_id',
      });
    }

    // Every row on this credential, because every one of them ends.
    const boundRows = gateway.store.listConnections()
      .filter((row) => row.provider_account_id === accountId);
    const bound = boundRows.map((row) => ({
      service: row.service,
      module: row.module,
      ...(row.label === undefined ? {} : { label: row.label }),
    }));

    // **Every one of them is authorized, not only the one named.** The policy is
    // written per service and module, so an override may deny disconnecting one
    // module and permit another; because this acts on the credential, calling
    // through the permitted module would otherwise end the denied one. Found by
    // adversarial review, and it is this build's own lesson committed again: a
    // decision scoped to the unit the caller named, applied to the unit the system
    // shares.
    const authorizeBound = (rows) => {
      for (const row of rows) {
        const sibling = gateway.lookupModule(row.service, row.module);
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

    // The account id is rendered through the same escaper and cap as any other
    // displayed value; the module list rides the description, which that function
    // also escapes. The pending key is the stored account and the modules bound
    // to it, not the caller's copy of the account. The list is sorted so two
    // stores that hold the same rows in a different order are one approval.
    const boundName = (row) => `${row.service}/${row.module}${row.label === undefined ? '' : `@${row.label}`}`;
    const boundNames = bound.map(boundName).sort();
    const confirmKey = confirmationDigest(['disconnect', service, module, accountId, boundNames, ...(label === undefined ? [] : [label])]);
    const confirmationStop = (reason) => {
      gateway.recordPendingConfirmation(confirmKey);
      const disclosure = discloseInput(
        { input: { properties: { provider_account_id: { type: 'string' } } } },
        { provider_account_id: accountId },
      );
      const names = bound.map(boundName).join(', ');
      const summary = composeSummary({
        action: 'disconnect',
        service,
        module,
        risk: 'destructive',
        description: `revokes this credential at the provider and removes ${bound.length} local record${bound.length === 1 ? '' : 's'}, ending ${names}. You are approving this credential and these modules. A module bound to it after this stop is not covered by this approval${orphaned ? `. NOTE: nothing declares ${service}/${module} any more, so this record has outlived what made it; other bindings listed above may still be declared and still able to use this credential` : ''}`,
        disclosure,
      });
      return statusObject(STATUS.NEEDS_CONFIRMATION, {
        op: 'disconnect',
        service,
        module,
        risk: 'destructive',
        confirmation: 'always',
        label: label ?? null,
        provider_account_id: accountId,
        modules_ending: bound,
        input_fields: disclosure.fields,
        undeclared_fields: disclosure.undeclared,
        input_values: inputValueEntries(disclosure.shown),
        withheld_fields: disclosure.withheld,
        summary,
        description: null,
        ...(reason ? { reason } : {}),
      });
    };

    if (confirm !== true) return confirmationStop();

    // The approval named an account. If the binding moved between the stop and here,
    // the approval is for something else. `startConnect` is the mechanism that moves
    // it, and it installs a DIFFERENT id, so the delete below would skip the new row
    // in any case; this refuses audibly instead of removing nothing in silence.
    // These checks run before the pending-approval match.
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
    if (!gateway.takePendingConfirmation(confirmKey)) return confirmationStop('unmatched_confirm');

    const provider = gateway.providerFor(target.auth);
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
      // verification of the instructions that read gateway.
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
    // a DELETE in the measured sequence, which is why the case where the
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
    const boundNow = gateway.store.listConnections().filter((row) => row.provider_account_id === accountId);
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
    gateway.revokedAccounts.add(accountId);
    const removed = gateway.store.deleteConnection({ providerAccountId: accountId });
    // **What succeeded is not always what a reader assumes.** The teardown is the
    // adapter's sequence, and its last call is the one this gate requires: for the
    // measured sequence that is the DELETE, which removes the provider's record of the
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
      removed: removed.map((row) => ({
        service: row.service,
        module: row.module,
        ...(row.label === undefined ? {} : { label: row.label }),
      })),
    };
  });
}
