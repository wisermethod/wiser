// Runner executes one resolved and approved call, prepares and publishes files, and writes its audit outcome.
import { randomUUID } from 'node:crypto';
import { buildContext } from './context.js';
import { STATUS, StatusSignal, classifierAuditStatus, isStatusObject, projectProviderCodes, statusObject, vendorErrorFrom } from './errors.js';
import { stripSlot, writeOutputFile } from './file-output.js';
import { readInputFiles, screenInputFiles } from './file-input.js';
import { createResponseHeaderGuard } from './response-headers.js';
import { firstPartyVersionFacts } from './first-party.js';
import { inputFileAccessFor } from './host.js';
import { STOPPED_GRANT_STATES } from './safety.js';

// These refusals may mean the grant itself failed. The status read decides:
// only a stopped reading changes the result or the connection row.
const GRANT_REFUSAL_STATUSES = [401, 403, 410, 422];

/**
 * @param {string} op
 * @param {Record<string, unknown>} fields
 * @param {() => Promise<unknown>} fn
 */
export async function withAudit(gateway, op, fields, fn) {
  const started = Date.now();
  const cid = fields.cid || randomUUID();
  const line = {
    harness: gateway.harness,
    role: gateway.role,
    op,
    cid,
    path: fields.path ?? null,
    action: fields.action ?? null,
    service: fields.service ?? null,
    module: fields.module ?? null,
    label: fields.label ?? null,
    grant_id: fields.grant_id ?? null,
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
    else if (op.startsWith('standing_approvals.') && result && result.status === 'standing_approval_proposed') line.status = result.status;
    else if (result && result.status === 'disconnected') line.status = 'disconnected';
    else if ((line.path === 'first_party_mcp' || line.path === 'hosted_tool') && result && typeof result.status === 'string' && result.status) {
      line.status = classifierAuditStatus(result.status);
    } else if (result && !line.status) line.status = 'ok';
    // executeFirstParty stamps these from the adapter result before a
    // conversion can drop meta. A call that never reached the adapter has
    // not stamped them, and both keys are null.
    if (line.firstParty && !Object.hasOwn(line, 'model')) {
      const facts = firstPartyVersionFacts(result);
      line.model = facts.model;
      line.calibrated_model_version = facts.calibrated_model_version;
    }
    gateway.audit.write(line);
  }
}


/** Invoke the host capability only after Safety has accepted the call. */
export function runHosted(gateway, { hosted, input }) {
  return hosted.execute(input ?? {});
}

/** Read each screened occurrence once, returning only call-local buffers and descriptors. */
export function prepareInputFiles(gateway, { hasInputFiles, input, inputDeclaration, inputFileSchema }) {
  if (!hasInputFiles) return { preparedInputFiles: inputDeclaration ? [] : undefined, fileDescriptors: [] };
  const screened = screenInputFiles(input[inputDeclaration.field], inputDeclaration, inputFileSchema, inputFileAccessFor(gateway));
  const files = isStatusObject(screened) ? screened : readInputFiles(screened);
  if (isStatusObject(files)) return files;
  return {
    preparedInputFiles: files,
    fileDescriptors: files.map((file, index) => ({
      field: inputDeclaration.field, index, ...screened[index], size: file.size, sha256: file.sha256,
    })),
  };
}

/** Run with the approved account and the same input buffers that were checked for confirmation. */
export async function runApproved(gateway, call, line) {
  const {
    action, input, confirm, label, parsed, act, resolved, authForRun, record, provider, statusArgs, stopGrant,
    outputDeclaration, inputDeclaration, downloadDeclaration, proxyBodyMaxBytes,
  } = call;
  let { preparedInputFiles } = call;
  // Refresh hosted grants only after an auth-class refusal. Provider outages
  // and unmapped statuses preserve both the original error and the ACTIVE row.
  const responseHeaderGuard = createResponseHeaderGuard();
  const classifyExecuteResult = async (result) => {
    if (responseHeaderGuard.holdsValue(result)) {
      return statusObject(STATUS.VENDOR_ERROR, { reason: 'output_refused', detail: responseHeaderGuard.detail });
    }
    if (!isStatusObject(result) && result?.error?.code === 'vendor_error') result = vendorErrorFrom(result);
    result = projectProviderCodes(result);
    if (result?.status === STATUS.NEEDS_CONNECT && label !== undefined) result = { ...result, label };
    if (result?.reason === 'media_download_failed' || authForRun?.provider === 'local-file' || result?.status !== STATUS.VENDOR_ERROR ||
        !GRANT_REFUSAL_STATUSES.includes(result.http_status) || typeof provider?.status !== 'function') {
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
    if (STOPPED_GRANT_STATES.includes(mapped)) return stopGrant(mapped, 'refused_by_provider');
    return result;
  };

  const execution = new AbortController();
  try {
    if (resolved.path === 'catalog') {
      const result = await gateway.catalogProvider.execute({
        actionId: action,
        userId: gateway.resolveUserId(),
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
      authProvider: gateway.providerFor(resolved.auth),
      catalogProvider: gateway.catalogProvider,
      unwrap,
      responseHeaders: act.response_headers,
      responseHeaderGuard,
      releaseHosts: resolved.connector?.manifest.modules[parsed.module].release_hosts,
      fetchImpl: gateway.fetchImpl,
      downloadMedia: downloadDeclaration,
      proxyBodyMaxBytes,
      outputFile: outputDeclaration,
      inputFileDeclaration: inputDeclaration,
      preparedInputFiles,
      outputsDir: gateway.outputsDir,
      executionSignal: execution.signal,
    });
    if (gateway.catalogProvider && typeof gateway.catalogProvider.execute === 'function') {
      ctx.catalog = async (actionId, catalogInput) => {
        const args = catalogInput ?? input ?? {};
        if (responseHeaderGuard.holdsValue({ actionId, arguments: args })) {
          throw new StatusSignal(statusObject(STATUS.VENDOR_ERROR, { reason: 'output_refused', detail: responseHeaderGuard.detail }));
        }
        const res = await gateway.catalogProvider.execute({
          actionId,
          userId: gateway.resolveUserId(),
          providerAccountId: record.provider_account_id,
          arguments: args,
        });
        if (res && res.error && res.error.code === 'vendor_error') {
          throw new StatusSignal(vendorErrorFrom(res));
        }
        return res;
      };
    }

    const result = await resolved.fn(input ?? {}, ctx);
    // Screen every public field (including extra fields and the byte slot)
    // before publication, not just the metadata returned by the writer.
    if (responseHeaderGuard.holdsOutput(result)) {
      return statusObject(STATUS.VENDOR_ERROR, { reason: 'output_refused', detail: responseHeaderGuard.detail });
    }
    return classifyExecuteResult(outputDeclaration
      ? writeOutputFile(outputDeclaration, result, gateway.outputsDir, line.cid)
      : result);
  } catch (err) {
    // Classify ctx.proxy / ctx.catalog signals before withAudit sees them. A
    // file-output module's thrown status never carries its slot out.
    if (err instanceof StatusSignal) {
      if (responseHeaderGuard.holdsOutput(err.object) || responseHeaderGuard.holdsError(err)) {
        return statusObject(STATUS.VENDOR_ERROR, { reason: 'output_refused', detail: responseHeaderGuard.detail });
      }
      return classifyExecuteResult(outputDeclaration ? stripSlot(err.object) : err.object);
    }
    if (responseHeaderGuard.holdsError(err)) throw new Error('internal error');
    throw err;
  } finally {
    execution.abort();
    preparedInputFiles = undefined;
  }
}
