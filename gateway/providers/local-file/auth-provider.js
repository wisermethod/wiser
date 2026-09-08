import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * @param {string} text
 * @returns {Record<string, string>}
 */
function parseEnvText(text) {
  const map = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    map[line.slice(0, eq)] = line.slice(eq + 1);
  }
  return map;
}

// Without --secrets there is no directory to resolve against, and a bare file name
// would be relative to wherever the harness started the process. Return null so the
// gateway answers needs_provider with this adapter's setup text instead.
function resolvePath(secretsDir, file, bound) {
  if (bound) return bound;
  if (!file || !secretsDir) return null;
  return join(secretsDir, file);
}

/**
 * Bound credential file. Never writes the file. Values never logged, never returned to a module.
 * @param {{ secretsDir?: string | null }} opts
 */
export function createAuthProvider({ secretsDir, secretFiles } = {}) {
  const dir = secretsDir || null;
  // --secret <service>=<abs file> bindings, resolved by the caller from the
  // workspace's Provides block. They win over the manifest's file name under --secrets.
  const bound = secretFiles && typeof secretFiles === 'object' ? { ...secretFiles } : {};

  return {
    name: 'local-file',
    isConfigured() {
      return true;
    },
    setupText() {
      return 'Bind the credential file: pass --secret <service>=<abs file>, resolved from the workspace Provides block, or pass --secrets <abs dir> holding the file the manifest names. Write the named variables into it yourself. Restart the harness.';
    },
    async initiate({ service, file, variables }) {
      const vars = Array.isArray(variables) && variables.length ? variables : ['API_KEY'];
      return {
        kind: 'file',
        path: resolvePath(dir, file, bound[service]),
        variables: vars,
      };
    },
    async status({ service, file, variables }) {
      const vars = Array.isArray(variables) && variables.length ? variables : ['API_KEY'];
      const path = resolvePath(dir, file, bound[service]);
      if (!path || !existsSync(path)) return 'INACTIVE';
      let text;
      try {
        text = readFileSync(path, 'utf8');
      } catch {
        return 'INACTIVE';
      }
      if (!text.trim()) return 'INACTIVE';
      const map = parseEnvText(text);
      for (const name of vars) {
        if (!map[name]) return 'INACTIVE';
      }
      return 'ACTIVE';
    },
    async proxy() {
      return { supported: false };
    },
    async unwrap({ service, file, variables, header, prefix }) {
      const vars = Array.isArray(variables) && variables.length ? variables : ['API_KEY'];
      const path = resolvePath(dir, file, bound[service]);
      if (!path || !existsSync(path)) return { supported: false };
      const text = readFileSync(path, 'utf8');
      const map = parseEnvText(text);
      const raw = map[vars[0]] || '';
      const h = header || 'Authorization';
      const pre = prefix !== undefined ? prefix : 'Bearer ';
      return { supported: true, header: h, value: `${pre}${raw}` };
    },
    async revoke() {
      return { supported: false, how: 'delete the file' };
    },
  };
}
