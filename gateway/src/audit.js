import { appendFileSync, chmodSync, existsSync, mkdirSync } from 'node:fs';
import { refuseSymlink } from './store.js';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const AUDIT_FIELDS = [
  'ts',
  'harness',
  'role',
  'op',
  'action',
  'service',
  'module',
  'privilege',
  'path',
  'provider_account_id',
  'status',
  'model',
  'calibrated_model_version',
  'ms',
  'cid',
];

/**
 * Append-only JSONL audit. The field set is closed: no input, output, header, or token.
 * `model` and `calibrated_model_version` are the two version facts. A first-party
 * line carries both, and a line that cannot name one carries null rather than
 * omitting the key. Neither fact is the call's input or output.
 *
 * @param {string} home
 */
export function createAudit(home) {
  const file = join(home, 'audit.jsonl');

  function ensure() {
    if (!existsSync(home)) {
      mkdirSync(home, { recursive: true, mode: 0o700 });
      try { chmodSync(home, 0o700); } catch { /* umask */ }
    }
  }

  return {
    /**
     * @param {Record<string, unknown>} fields
     */
    write(fields) {
      ensure();
      refuseSymlink(home, 'audit directory');
      refuseSymlink(file, 'audit file');
      const line = {
        ts: new Date().toISOString(),
        harness: fields.harness ?? null,
        role: fields.role ?? null,
        op: fields.op ?? null,
        action: fields.action ?? null,
        service: fields.service ?? null,
        module: fields.module ?? null,
        privilege: fields.privilege ?? null,
        path: fields.path ?? null,
        provider_account_id: fields.provider_account_id ?? null,
        status: fields.status ?? null,
        model: fields.model ?? null,
        calibrated_model_version: fields.calibrated_model_version ?? null,
        ms: Number.isFinite(fields.ms) ? fields.ms : 0,
        cid: fields.cid || randomUUID(),
      };
      for (const key of Object.keys(line)) {
        if (!AUDIT_FIELDS.includes(key)) delete line[key];
      }
      appendFileSync(file, `${JSON.stringify(line)}\n`, { encoding: 'utf8', mode: 0o600 });
      try { chmodSync(file, 0o600); } catch { /* created with mode */ }
    },
    file,
  };
}
