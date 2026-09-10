import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const FORBIDDEN_KEYS = new Set([
  'token',
  'access_token',
  'refresh_token',
  'api_key',
  'secret',
  'credential',
]);

const CREDENTIAL_SHAPE = /^(ghp_|gho_|sk-|xox|Bearer )/;

/**
 * @typedef {object} ConnectionRecord
 * @property {string} id
 * @property {string} service
 * @property {string} module
 * @property {string} privilege
 * @property {string} provider
 * @property {string|null} provider_account_id
 * @property {string[]} scopes
 * @property {string} status
 * @property {string} created
 * @property {string} updated
 */

/**
 * Walk a value and throw if a forbidden key or credential-shaped string appears.
 * The thrown message names the class of problem, never the value.
 * @param {unknown} value
 * @param {string} [via]
 */
export function assertNoSecrets(value, via = 'record') {
  if (value == null) return;
  if (typeof value === 'string') {
    if (CREDENTIAL_SHAPE.test(value)) {
      throw new Error(`${via} must not carry a credential-shaped value`);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) assertNoSecrets(item, via);
    return;
  }
  if (typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      const lower = key.toLowerCase();
      if (FORBIDDEN_KEYS.has(lower)) {
        throw new Error(`${via} must not carry "${lower}"`);
      }
      assertNoSecrets(child, via);
    }
  }
}

/**
 * @param {string} home
 * @returns {{ userId: string | null, connections: ConnectionRecord[] }}
 */
/**
 * A state file that is a symbolic link points somewhere this process did not choose.
 * @param {string} path
 * @param {string} what
 */
export function refuseSymlink(path, what) {
  let st;
  try {
    st = lstatSync(path);
  } catch (err) {
    if (err && err.code === 'ENOENT') return;
    throw err;
  }
  if (st.isSymbolicLink()) {
    throw new Error(`${what} must not be a symbolic link`);
  }
  // A hard link is the same inode under two names: writing here would write there.
  if (st.isFile() && st.nlink > 1) {
    throw new Error(`${what} must not be hard-linked elsewhere`);
  }
}

function emptyDoc() {
  return { userId: null, connections: [] };
}

/**
 * JSON-file store at `<home>/connections.json`, mode 0600, atomic write.
 * Holds metadata only.
 */
export class JsonFileStore {
  /**
   * @param {string} home
   */
  constructor(home) {
    this.home = home;
    this.file = join(home, 'connections.json');
  }

  ensureHome() {
    if (!existsSync(this.home)) {
      mkdirSync(this.home, { recursive: true, mode: 0o700 });
      try { chmodSync(this.home, 0o700); } catch { /* umask */ }
    }
  }

  /**
   * @returns {{ userId: string | null, connections: ConnectionRecord[] }}
   */
  read() {
    if (!existsSync(this.file)) return emptyDoc();
    refuseSymlink(this.file, 'store file');
    const raw = readFileSync(this.file, 'utf8');
    if (!raw.trim()) return emptyDoc();
    const doc = JSON.parse(raw);
    if (!doc || typeof doc !== 'object') return emptyDoc();
    if (!Array.isArray(doc.connections)) doc.connections = [];
    if (!('userId' in doc)) doc.userId = null;
    return doc;
  }

  /**
   * @param {{ userId: string | null, connections: ConnectionRecord[] }} doc
   */
  write(doc) {
    assertNoSecrets(doc, 'store');
    this.ensureHome();
    refuseSymlink(this.home, 'store directory');
    refuseSymlink(this.file, 'store file');
    const tmp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
    const payload = `${JSON.stringify(doc, null, 2)}\n`;
    try {
      writeFileSync(tmp, payload, { encoding: 'utf8', mode: 0o600 });
      renameSync(tmp, this.file);
    } catch (err) {
      try { unlinkSync(tmp); } catch { /* best effort */ }
      throw err;
    }
    try { chmodSync(this.file, 0o600); } catch { /* created with mode */ }
  }

  /**
   * @returns {ConnectionRecord[]}
   */
  listConnections() {
    return this.read().connections.slice();
  }

  /**
   * @param {{ service: string, module: string }} key
   * @returns {ConnectionRecord | null}
   */
  getConnection({ service, module }) {
    return this.read().connections.find((row) => row.service === service && row.module === module) ?? null;
  }

  /**
   * @param {ConnectionRecord} record
   * @returns {ConnectionRecord}
   */
  putConnection(record) {
    if (!record || typeof record !== 'object') {
      throw new Error('connection record is required');
    }
    assertNoSecrets(record, 'connection record');
    const now = new Date().toISOString();
    const doc = this.read();
    const existing = doc.connections.find((row) => row.service === record.service && row.module === record.module);
    const next = {
      id: existing?.id || record.id || randomUUID(),
      service: record.service,
      module: record.module,
      privilege: record.privilege,
      provider: record.provider,
      provider_account_id: record.provider_account_id ?? null,
      scopes: Array.isArray(record.scopes) ? record.scopes : [],
      status: record.status,
      created: existing?.created || record.created || now,
      updated: now,
    };
    assertNoSecrets(next, 'connection record');
    doc.connections = doc.connections.filter((row) => !(row.service === next.service && row.module === next.module));
    doc.connections.push(next);
    this.write(doc);
    return next;
  }

  /**
   * @param {{ service: string, module: string }} key
   */
  deleteConnection({ service, module }) {
    const doc = this.read();
    doc.connections = doc.connections.filter((row) => !(row.service === service && row.module === module));
    this.write(doc);
  }

  /**
   * The id the provider sees. Generated once, persisted, not a person's name or email.
   * @returns {string}
   */
  getUserId() {
    const doc = this.read();
    if (doc.userId && typeof doc.userId === 'string') return doc.userId;
    doc.userId = `wiser-${randomUUID()}`;
    this.write(doc);
    return doc.userId;
  }
}
