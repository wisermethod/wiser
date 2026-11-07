// Host applies construction options, keeps private local file access and handles user identity and output cleanup.
import { isAbsolute } from 'node:path';
import { cleanupOutputs as cleanupOutputFiles } from './file-output.js';
import { createStandingApprovals } from './standing-approvals.js';
import { readProviderUserId, writeProviderUserIdIfEmpty } from './paths.js';
import { mcpClassifierIdentity } from './first-party.js';
import { initializeCatalog, loadCatalog } from './catalog.js';

const inputFileAccess = new WeakMap();

export function inputFileAccessFor(gateway) {
  return inputFileAccess.get(gateway);
}

export function initializeHost(gateway, opts) {
  inputFileAccess.set(gateway, null);
  initializeCatalog(gateway);
  gateway.home = opts.home;
  if (opts.outputsDir != null && (typeof opts.outputsDir !== 'string' || !isAbsolute(opts.outputsDir))) {
    throw new TypeError('outputsDir must be an absolute path');
  }
  gateway.outputsDir = opts.outputsDir ?? null;
  if (opts.inputFileAccess != null) {
    const access = opts.inputFileAccess;
    const absolute = (value) => typeof value === 'string' && isAbsolute(value) && !value.includes('\u0000');
    const secrets = access.secretFiles ?? {};
    if (typeof access !== 'object' || Array.isArray(access) || access.enabled !== true ||
        !absolute(opts.home) || !absolute(access.envPath) || !secrets || typeof secrets !== 'object' ||
        !Object.values(secrets).every(absolute) || (access.secretsDir != null && !absolute(access.secretsDir))) {
      throw new TypeError('inputFileAccess requires explicit absolute local paths');
    }
    inputFileAccess.set(gateway, {
      home: opts.home, envPath: access.envPath, secretFiles: Object.values(secrets), secretsDir: access.secretsDir ?? null,
    });
  }
  gateway.role = opts.role || 'runtime';
  gateway.harness = opts.harness || 'unknown';
  gateway.store = opts.store;
  gateway.policy = opts.policy;
  gateway.audit = opts.audit;
  gateway.authProvider = opts.authProvider || null;
  gateway.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  gateway.catalogProvider = opts.catalogProvider || null;
  gateway.localFileProvider = opts.localFileProvider || null;
  gateway.authConfigured = opts.authConfigured !== undefined
    ? Boolean(opts.authConfigured)
    : (typeof gateway.authProvider?.isConfigured === 'function' ? gateway.authProvider.isConfigured() : Boolean(gateway.authProvider));
  gateway.connectors = Array.isArray(opts.connectors) ? opts.connectors : [];
  loadCatalog(gateway);
  gateway.envPath = opts.envPath || null;
  gateway.classifier = opts.classifier || null;
  gateway.classifierIdentity = typeof opts.classifierIdentity === 'function'
    ? opts.classifierIdentity
    : mcpClassifierIdentity;
  /** @type {Set<string>} */
  gateway.confirmedOnce = new Set();
  /**
   * Pending approvals, key to expiry in milliseconds. In memory only. A host
   * that builds one gateway per request hydrates and flushes this Map the
   * same way it does `confirmedOnce`.
   * @type {Map<string, number>}
   */
  gateway.pendingConfirmations = opts.pendingConfirmations instanceof Map
    ? opts.pendingConfirmations
    : new Map();
  /** Milliseconds. Read on every use so a test can reassign `gw.now`. */
  gateway.now = typeof opts.now === 'function' ? opts.now : Date.now;
  gateway.standingApprovals = opts.standingApprovals || createStandingApprovals(gateway.store?.home, () => gateway.now());
}

export function cleanupOutputs(gateway) {
  cleanupOutputFiles(gateway.outputsDir);
}

export function resolveUserId(gateway) {
  const fromEnv = readProviderUserId(gateway.envPath);
  if (fromEnv) {
    const doc = gateway.store.read();
    if (doc.userId !== fromEnv) {
      doc.userId = fromEnv;
      gateway.store.write(doc);
    }
    return fromEnv;
  }
  const fromStore = gateway.store.getUserId();
  writeProviderUserIdIfEmpty(gateway.envPath, fromStore);
  return fromStore;
}
