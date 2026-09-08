import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const AUTH_PROVIDERS = new Set(['catalog', 'local-file']);
const SCHEMES = new Set(['OAUTH2', 'API_KEY', 'BEARER', 'BASIC']);
const PRIVILEGES = new Set(['read', 'write', 'admin']);
const RISKS = new Set(['low', 'medium', 'high', 'destructive']);
const CONFIRMATIONS = new Set(['none', 'once', 'always']);
const PREFERS = new Set(['proxy', 'catalog', 'local_http', 'first_party_mcp']);
const FALLBACKS = new Set(['catalog', 'none']);

/**
 * @param {string} file
 * @param {string} field
 * @param {string} message
 */
export function validationError(file, field, message) {
  const err = new Error(`${file} ${field}: ${message}`);
  err.file = file;
  err.field = field;
  return err;
}

/**
 * @param {unknown} value
 * @param {string} file
 * @param {string} field
 */
function requireObject(value, file, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw validationError(file, field, 'must be an object');
  }
}

/**
 * @param {object} auth
 * @param {string} file
 * @param {string} field
 */
function validateAuth(auth, file, field) {
  requireObject(auth, file, field);
  if (!AUTH_PROVIDERS.has(auth.provider)) {
    throw validationError(file, `${field}.provider`, 'must be "catalog" or "local-file"');
  }
  if (auth.provider === 'catalog') {
    if (typeof auth.toolkit !== 'string' || !auth.toolkit) {
      throw validationError(file, `${field}.toolkit`, 'is required when provider is "catalog"');
    }
  }
  if (auth.provider === 'local-file') {
    if (typeof auth.file !== 'string' || !auth.file) {
      throw validationError(file, `${field}.file`, 'is required when provider is "local-file"');
    }
  }
  if (!SCHEMES.has(auth.scheme)) {
    throw validationError(file, `${field}.scheme`, 'must be OAUTH2 | API_KEY | BEARER | BASIC');
  }
  if (!PRIVILEGES.has(auth.privilege)) {
    throw validationError(file, `${field}.privilege`, 'must be read | write | admin');
  }
}

/**
 * @param {object} action
 * @param {string} file
 * @param {string} field
 */
function validateAction(action, file, field) {
  requireObject(action, file, field);
  if (!RISKS.has(action.risk)) {
    throw validationError(file, `${field}.risk`, 'must be low | medium | high | destructive');
  }
  if (!CONFIRMATIONS.has(action.confirmation)) {
    throw validationError(file, `${field}.confirmation`, 'must be none | once | always');
  }
  requireObject(action.execution, file, `${field}.execution`);
  if (!PREFERS.has(action.execution.prefer)) {
    throw validationError(file, `${field}.execution.prefer`, 'must be proxy | catalog | local_http | first_party_mcp');
  }
  if (action.input !== undefined) {
    requireObject(action.input, file, `${field}.input`);
  }
  if (action.description !== undefined && typeof action.description !== 'string') {
    throw validationError(file, `${field}.description`, 'must be a string');
  }
}

/**
 * @param {string} dir
 * @param {object} manifest
 * @param {object} impl
 */
function validateImpl(dir, manifest, impl) {
  const file = join(dir, 'index.js');
  if (!impl || typeof impl !== 'object' || !impl.modules || typeof impl.modules !== 'object') {
    throw validationError(file, 'modules', 'must export modules');
  }
  for (const [modName, modDef] of Object.entries(manifest.modules)) {
    const implMod = impl.modules[modName];
    if (!implMod || typeof implMod !== 'object') {
      throw validationError(file, `modules.${modName}`, 'is missing');
    }
    for (const actName of Object.keys(modDef.actions)) {
      if (typeof implMod[actName] !== 'function') {
        throw validationError(file, `modules.${modName}.${actName}`, 'is missing');
      }
    }
    for (const actName of Object.keys(implMod)) {
      if (typeof implMod[actName] !== 'function') continue;
      if (!modDef.actions[actName]) {
        throw validationError(file, `modules.${modName}.${actName}`, 'is not declared in manifest.json');
      }
    }
  }
  for (const modName of Object.keys(impl.modules)) {
    if (!manifest.modules[modName]) {
      throw validationError(file, `modules.${modName}`, 'is not declared in manifest.json');
    }
  }
}

/**
 * Load and validate one connector directory.
 * @param {string} dir
 */
export async function loadConnector(dir) {
  const manifestPath = join(dir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    throw validationError(manifestPath, 'manifest.json', 'is missing');
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    throw validationError(manifestPath, 'manifest.json', 'is not valid JSON');
  }
  requireObject(manifest, manifestPath, 'manifest.json');
  const id = basename(dir);
  if (manifest.id !== id) {
    throw validationError(manifestPath, 'id', `must equal the directory name "${id}"`);
  }
  if (typeof manifest.service !== 'string' || !manifest.service) {
    throw validationError(manifestPath, 'service', 'is required');
  }
  requireObject(manifest.modules, manifestPath, 'modules');
  if (Object.keys(manifest.modules).length === 0) {
    throw validationError(manifestPath, 'modules', 'must declare at least one module');
  }
  for (const [modName, mod] of Object.entries(manifest.modules)) {
    const field = `modules.${modName}`;
    requireObject(mod, manifestPath, field);
    validateAuth(mod.auth, manifestPath, `${field}.auth`);
    requireObject(mod.actions, manifestPath, `${field}.actions`);
    if (Object.keys(mod.actions).length === 0) {
      throw validationError(manifestPath, `${field}.actions`, 'must declare at least one action');
    }
    for (const [actName, action] of Object.entries(mod.actions)) {
      validateAction(action, manifestPath, `${field}.actions.${actName}`);
    }
    if (mod.unwrap_token !== undefined && typeof mod.unwrap_token !== 'boolean') {
      throw validationError(manifestPath, `${field}.unwrap_token`, 'must be a boolean');
    }
    if (mod.unwrap_token === true) {
      const hosts = mod.auth.hosts;
      if (!Array.isArray(hosts) || hosts.length === 0 || hosts.some((h) => typeof h !== 'string' || !/^[a-z0-9.-]+$/i.test(h))) {
        throw validationError(manifestPath, `${field}.auth.hosts`, 'must list at least one hostname when unwrap_token is true');
      }
    }
    if (mod.fallback !== undefined && !FALLBACKS.has(mod.fallback)) {
      throw validationError(manifestPath, `${field}.fallback`, 'must be catalog | none');
    }
  }
  const indexPath = join(dir, 'index.js');
  if (!existsSync(indexPath)) {
    throw validationError(indexPath, 'index.js', 'is missing');
  }
  let impl;
  try {
    impl = await import(pathToFileURL(indexPath).href);
  } catch (err) {
    throw validationError(indexPath, 'index.js', `failed to load (${err instanceof Error ? err.message : 'import error'})`);
  }
  validateImpl(dir, manifest, impl);
  return {
    id: manifest.id,
    service: manifest.service,
    dir,
    manifest,
    impl,
  };
}

/**
 * Load every connector directory that contains manifest.json. Directories without a manifest are skipped.
 * @param {string[]} dirs
 */
export async function loadConnectors(dirs) {
  const seen = new Set();
  const out = [];
  for (const dir of dirs) {
    if (!dir || !existsSync(dir)) continue;
    let st;
    try { st = statSync(dir); } catch { continue; }
    if (!st.isDirectory()) continue;
    const real = resolve(dir);
    if (seen.has(real)) continue;
    seen.add(real);
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const child = join(dir, entry.name);
      if (!existsSync(join(child, 'manifest.json'))) continue;
      out.push(await loadConnector(child));
    }
  }
  const ids = new Map();
  for (const c of out) {
    if (ids.has(c.id)) {
      const previous = ids.get(c.id);
      throw validationError(join(c.dir, 'manifest.json'), 'id', 'duplicates "' + c.id + '" from ' + previous);
    }
    ids.set(c.id, c.dir);
  }
  return out;
}
