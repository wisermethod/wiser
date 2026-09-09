#!/usr/bin/env node
/**
 * wiser-gateway - local stdio MCP server for connector actions.
 *
 * Usage:
 *   node server.js help
 *   node server.js [--env <abs file>] [--home <abs dir>] [--role runtime|readonly]
 *                  [--harness <name>] [--provider <name>] [--connectors <abs dir>]
 *                  [--secrets <abs dir>] [--check]
 */

import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { defaultGatewayHome, defaultProviderEnvPath, ensureProviderEnvFile } from './src/paths.js';

const GATEWAY_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_POLICY_PATH = join(GATEWAY_DIR, 'policy.default.json');
const DEFAULT_PROVIDERS_PATH = join(GATEWAY_DIR, 'providers', 'default.json');
const DEFAULT_CONNECTORS_DIR = join(GATEWAY_DIR, '..', 'connectors');
const PLUGIN_ROOT = resolve(GATEWAY_DIR, '..');
const ROLES = new Set(['runtime', 'readonly']);
const VERSION = '0.1.0';

const USAGE = `wiser-gateway - local stdio connection gateway

Usage:
  node server.js help
  node server.js --help
  node server.js [--env <abs file>] [--home <abs dir>] [--role runtime|readonly]
                 [--harness <name>] [--provider <name>] [--connectors <abs dir>]
                 [--secrets <abs dir>] [--check]

Options:
  help, --help             Print this message and exit. Reads no files.
  --env <abs file>         Provider project-key file (KEY=value lines). Optional:
                           if omitted, the platform user-config path in SETUP.md
                           is used when that file exists; otherwise every
                           provider-backed action returns needs_provider.
  --home <abs dir>         State directory (default ~/.wiser/gateway), created 0700.
  --role <role>            runtime | readonly (default: policy default_role).
  --harness <name>         Free-text label for the audit log (default: unknown).
  --provider <name>        Adapter directory under providers/ (default: the name in
                           providers/default.json).
  --connectors <abs dir>   Extra connectors directory. Repeatable. ../connectors
                           relative to this file is also loaded when it exists.
  --secrets <abs dir>      Directory the local-file provider reads named files from.
  --secret <svc>=<abs file>  Bind one service's credential file directly. Repeatable.
                           Overrides --secrets for that service.
  --check                  Validate manifests and policy, print one JSON object, exit.

State paths are screened before anything opens them: --home is canonicalised and
refused inside this plugin, inside the directory holding --env, inside --secrets,
or on a symbolic link.

Unknown flags are refused by name. Success for --check prints one JSON object to
stdout. help prints usage to stdout. The MCP server writes JSON-RPC messages to
stdout, one per line. Errors go to stderr with exit 1.`;

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const argv = process.argv.slice(2);

// Only an explicit help word prints usage. A bare `node server.js` serves, because
// --env is optional and a harness may start the gateway with no flags at all.
if (argv.includes('help') || argv.includes('--help')) {
  process.stdout.write(`${USAGE}\n`);
  process.exit(0);
}

const VALUE_FLAGS = new Set(['--env', '--home', '--role', '--harness', '--provider', '--connectors', '--secrets', '--secret']);
const BARE_FLAGS = new Set(['--check']);
const ABS_FLAGS = new Set(['--env', '--home', '--connectors', '--secrets']);

const flags = {
  env: null,
  home: null,
  role: null,
  harness: 'unknown',
  provider: null,
  connectors: [],
  secrets: null,
  secretFiles: {},
  check: false,
};

for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i];
  if (BARE_FLAGS.has(a)) {
    flags.check = true;
    continue;
  }
  if (VALUE_FLAGS.has(a)) {
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      fail(`Error: ${a} requires a value. Run "node server.js help" for usage.`);
    }
    i += 1;
    if (ABS_FLAGS.has(a) && !isAbsolute(value)) {
      fail(`Error: ${a} must be an absolute path; got "${value}". Run "node server.js help" for usage.`);
    }
    if (a === '--env') flags.env = value;
    else if (a === '--home') flags.home = value;
    else if (a === '--role') flags.role = value;
    else if (a === '--harness') flags.harness = value;
    else if (a === '--provider') flags.provider = value;
    else if (a === '--connectors') flags.connectors.push(value);
    else if (a === '--secrets') flags.secrets = value;
    else if (a === '--secret') {
      const eq = value.indexOf('=');
      const svc = eq > 0 ? value.slice(0, eq) : '';
      const file = eq > 0 ? value.slice(eq + 1) : '';
      if (!/^[a-z0-9][a-z0-9-]*$/.test(svc) || !isAbsolute(file)) {
        fail(`Error: --secret takes <service>=<abs file>; got "${value}". Run "node server.js help" for usage.`);
      }
      flags.secretFiles[svc] = file;
    }
    continue;
  }
  if (a.startsWith('--')) {
    fail(`Error: unknown flag "${a}". Run "node server.js help" for usage.`);
  }
  fail(`Error: unknown argument "${a}". Run "node server.js help" for usage.`);
}

if (flags.role !== null && !ROLES.has(flags.role)) {
  fail(`Error: --role must be runtime or readonly; got "${flags.role}". Run "node server.js help" for usage.`);
}

if (!flags.env) {
  if (flags.check) {
    const fallback = defaultProviderEnvPath();
    if (existsSync(fallback)) flags.env = fallback;
  } else {
    flags.env = ensureProviderEnvFile();
  }
}

if (flags.env && !existsSync(flags.env)) {
  fail(`Error: --env file does not exist: ${flags.env}. Create it at the platform path SETUP.md names, or pass --env with an absolute path.`);
}

const home = flags.home || (flags.check ? null : defaultGatewayHome());

/**
 * Canonicalise a path that may not exist yet: walk up to the deepest existing
 * ancestor, resolve it through the filesystem, and rejoin what was below it.
 * @param {string} p
 */
function canonical(p) {
  let base = resolve(p);
  const below = [];
  while (!existsSync(base)) {
    const parent = dirname(base);
    if (parent === base) return null;
    below.unshift(base.slice(parent.length + 1));
    base = parent;
  }
  let real;
  try { real = realpathSync(base); } catch { return null; }
  return below.length ? join(real, ...below) : real;
}

function isInside(child, parent) {
  if (!child || !parent) return false;
  if (child === parent) return true;
  return child.startsWith(parent.endsWith('/') ? parent : `${parent}/`);
}

/**
 * Refuse a state directory that would land inside the plugin, inside a
 * credential directory, or on a symbolic link. Returns the canonical path.
 * @param {string} dir
 */
function screenHome(dir) {
  // The symlink test runs on the path as given, before it is resolved: after
  // realpath a symlink is indistinguishable from its target.
  try {
    if (lstatSync(resolve(dir)).isSymbolicLink()) fail('Error: --home must not be a symbolic link.');
  } catch (err) {
    if (!err || err.code !== 'ENOENT') { /* fall through to canonical */ }
  }
  const canon = canonical(dir);
  if (!canon) fail(`Error: --home cannot be resolved: ${dir}`);
  const pluginRoot = canonical(PLUGIN_ROOT);
  if (isInside(canon, pluginRoot)) {
    fail('Error: --home must be outside this plugin; the plugin is read-only in use.');
  }
  // Guard both the directory a credential file sits in and the file it actually
  // resolves to, so a credential that is itself a link into the state directory is
  // caught as well as a state directory placed beside a credential.
  const guarded = [];
  const credentialFiles = [];
  if (flags.env) { guarded.push(canonical(dirname(flags.env))); credentialFiles.push(flags.env); }
  if (flags.secrets) guarded.push(canonical(flags.secrets));
  for (const file of Object.values(flags.secretFiles)) { guarded.push(canonical(dirname(file))); credentialFiles.push(file); }
  for (const g of guarded) {
    if (g && (isInside(canon, g) || isInside(g, canon))) {
      fail('Error: --home must not share a directory with a credential file.');
    }
  }
  for (const file of credentialFiles) {
    const real = canonical(file);
    if (real && isInside(real, canon)) {
      fail('Error: a credential file resolves inside --home; refusing to start.');
    }
  }
  return canon;
}

const screenedHome = home ? screenHome(home) : null;

function readProviderNames() {
  let defaults;
  try {
    defaults = JSON.parse(readFileSync(DEFAULT_PROVIDERS_PATH, 'utf8'));
  } catch {
    fail('Error: providers/default.json could not be read. Run "node server.js help" for usage.');
  }
  const authName = flags.provider || defaults.auth;
  const catalogName = flags.provider || defaults.catalog;
  if (typeof authName !== 'string' || !authName) {
    fail('Error: no provider name. Pass --provider <name> or set providers/default.json.');
  }
  return { authName, catalogName };
}

async function loadAdapter(name, file, factory, args) {
  const path = join(GATEWAY_DIR, 'providers', name, file);
  if (!existsSync(path)) return null;
  const mod = await import(pathToFileURL(path).href);
  if (typeof mod[factory] !== 'function') return null;
  return mod[factory](args);
}

async function main() {
  const [
    { createAudit },
    { ConnectionGateway },
    { loadConnectors },
    { loadPolicy },
    { runStdio },
    { JsonFileStore },
  ] = await Promise.all([
    import('./src/audit.js'),
    import('./src/gateway.js'),
    import('./src/manifest.js'),
    import('./src/policy.js'),
    import('./src/rpc.js'),
    import('./src/store.js'),
  ]);

  const { authName, catalogName } = readProviderNames();
  const policy = loadPolicy({ home: screenedHome, defaultPath: DEFAULT_POLICY_PATH });
  const role = flags.role || policy.default_role || 'runtime';
  if (!ROLES.has(role)) {
    fail(`Error: role "${role}" is not runtime or readonly.`);
  }

  const connectorDirs = [];
  const addDir = (dir) => {
    if (!dir || !existsSync(dir)) return;
    const abs = resolve(dir);
    if (!connectorDirs.includes(abs)) connectorDirs.push(abs);
  };
  addDir(DEFAULT_CONNECTORS_DIR);
  for (const extra of flags.connectors) addDir(extra);

  let connectors;
  try {
    connectors = await loadConnectors(connectorDirs);
  } catch (err) {
    fail(`Error: ${err instanceof Error ? err.message : 'manifest validation failed'}`);
  }

  if (flags.check) {
    const actions = [];
    const list = connectors.map((c) => {
      const modules = {};
      for (const [modName, mod] of Object.entries(c.manifest.modules)) {
        modules[modName] = Object.keys(mod.actions);
        for (const actName of Object.keys(mod.actions)) {
          actions.push(`${c.service}.${modName}.${actName}`);
        }
      }
      return { id: c.id, service: c.service, modules };
    });
    process.stdout.write(`${JSON.stringify({
      ok: true,
      connectors: list,
      actions,
      policy: { default_role: policy.default_role, rules: (policy.rules || []).length },
    })}\n`);
    process.exit(0);
  }

  mkdirSync(screenedHome, { recursive: true, mode: 0o700 });
  try { chmodSync(screenedHome, 0o700); } catch { /* umask */ }

  const factoryArgs = { envPath: flags.env, secretsDir: flags.secrets, secretFiles: flags.secretFiles };
  const authProvider = await loadAdapter(authName, 'auth-provider.js', 'createAuthProvider', factoryArgs);
  const catalogProvider = await loadAdapter(catalogName, 'catalog-provider.js', 'createCatalogProvider', factoryArgs);
  const localFileProvider = await loadAdapter('local-file', 'auth-provider.js', 'createAuthProvider', factoryArgs);

  if (!authProvider) {
    fail(`Error: provider "${authName}" could not be loaded. Run "node server.js help" for usage.`);
  }

  const store = new JsonFileStore(screenedHome);
  const audit = createAudit(screenedHome);
  const authConfigured = typeof authProvider.isConfigured === 'function'
    ? authProvider.isConfigured()
    : Boolean(flags.env);

  const gateway = new ConnectionGateway({
    home: screenedHome,
    role,
    harness: flags.harness,
    store,
    policy,
    audit,
    authProvider,
    catalogProvider,
    localFileProvider,
    authConfigured,
    connectors,
    envPath: flags.env,
  });

  runStdio({ gateway, version: VERSION });
}

main().catch((err) => {
  fail(`Error: ${err instanceof Error ? err.message : 'failed to start'}`);
});
