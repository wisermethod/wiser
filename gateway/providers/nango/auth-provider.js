function notImplemented() {
  throw { code: 'not_implemented', provider: 'nango' };
}

/**
 * Interface stub. A second adapter is a directory, not a rewrite.
 * @param {object} [_opts]
 */
export function createAuthProvider(_opts = {}) {
  return {
    name: 'nango',
    isConfigured: notImplemented,
    setupText: notImplemented,
    initiate: notImplemented,
    status: notImplemented,
    proxy: notImplemented,
    unwrap: notImplemented,
    revoke: notImplemented,
  };
}
