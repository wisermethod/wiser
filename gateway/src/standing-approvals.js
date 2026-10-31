import { appendFileSync, chmodSync, closeSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { assertNoSecrets, refuseSymlink } from './store.js';

/** Milliseconds in a grant day, independent of the local timezone. */
export const STANDING_APPROVAL_DAY_MS = 24 * 60 * 60 * 1000;

const HEIGHTENED_PHRASES = {
  delete: 'delete things',
  send: 'send messages to other people',
  pay: 'spend money',
  publish: 'publish where others can see',
  grant_access: 'give someone access',
};

/** @param {string[]} kinds */
export function isHeightened(kinds) {
  return kinds.some((kind) => Object.hasOwn(HEIGHTENED_PHRASES, kind));
}

/** @param {string[]} kinds @param {string | null | undefined} playbook */
export function maxStandingApprovalDays(kinds, playbook) {
  if (!isHeightened(kinds)) return 365;
  if (new Set(kinds).size === 1 && kinds.includes('send')
      && typeof playbook === 'string' && playbook.length > 0) return 90;
  return 7;
}

/** @param {string[]} parts */
function joinWords(parts) {
  if (parts.length < 2) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** @param {object} grant @param {number} now */
export function isActiveStandingApproval(grant, now) {
  return Boolean(grant && !grant.revoked_at && Date.parse(grant.expires_at) > now);
}

/**
 * Local append-only metadata, separate from connection read-modify-writes.
 * The clock is a callback so replacing `gw.now` also changes pruning. Lock
 * deadlines use elapsed real time, independent of that grant clock.
 * @param {string} home
 * @param {() => number} [now]
 */
export function createStandingApprovals(home, now = Date.now) {
  const sleeper = new Int32Array(new SharedArrayBuffer(4));

  // Hosts that never use local grants need no local home at construction time.
  function paths() {
    return { file: join(home, 'standing-approvals.jsonl'), lock: join(home, 'standing-approvals.lock') };
  }

  function readEntries() {
    const { file, lock } = paths();
    refuseSymlink(home, 'standing approval directory');
    refuseSymlink(lock, 'standing approval lock');
    refuseSymlink(file, 'standing approval file');
    let raw;
    try { raw = readFileSync(file, 'utf8'); } catch (err) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
    const entries = [];
    for (const line of raw.split('\n')) {
      let entry;
      try { entry = JSON.parse(line); } catch { continue; }
      if (entry && typeof entry === 'object' && (entry.grant || entry.revoke)) entries.push(entry);
    }
    return entries;
  }

  function grantsFrom(entries, at) {
    const revokes = new Map(entries.filter((entry) => entry.revoke).map(({ revoke }) => [revoke.id, revoke.at]));
    return entries.filter((entry) => entry.grant && Date.parse(entry.grant.expires_at) > at)
      .map(({ grant }) => revokes.has(grant.id) ? { ...grant, revoked_at: revokes.get(grant.id) } : grant);
  }

  function withLock(write) {
    const { lock } = paths();
    const ownerFile = join(lock, 'owner');
    const owner = `${process.pid} ${randomUUID()}`;
    refuseSymlink(home, 'standing approval directory');
    mkdirSync(home, { recursive: true, mode: 0o700 });
    const started = performance.now();
    while (true) {
      if (performance.now() - started >= 2000) throw new Error('standing approval lock could not be taken within 2 seconds');
      refuseSymlink(lock, 'standing approval lock');
      let acquired = false;
      try {
        mkdirSync(lock, { mode: 0o700 });
        acquired = true;
      } catch (err) {
        if (err.code !== 'EEXIST') throw err;
      }
      if (acquired) {
        writeFileSync(ownerFile, owner, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
        break;
      }
      refuseSymlink(lock, 'standing approval lock');
      try {
        if (Date.now() - lstatSync(lock).mtimeMs > 10000 && ownerGone()) {
          try { unlinkSync(ownerFile); } catch (err) { if (err.code !== 'ENOENT') throw err; }
          rmdirSync(lock);
          continue;
        }
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
      }
      const remaining = 2000 - (performance.now() - started);
      if (remaining <= 0) throw new Error('standing approval lock could not be taken within 2 seconds');
      Atomics.wait(sleeper, 0, 0, Math.min(20, remaining));
    }
    try { return write(); } finally {
      let currentOwner;
      try { currentOwner = readFileSync(ownerFile, 'utf8'); } catch { /* A replaced lock is not ours to release. */ }
      if (currentOwner === owner) {
        unlinkSync(ownerFile);
        rmdirSync(lock);
      }
    }

    function ownerGone() {
      let recorded;
      try { recorded = readFileSync(ownerFile, 'utf8'); } catch { return true; }
      const pid = Number(recorded.match(/^([1-9][0-9]*) \S+$/)?.[1]);
      if (!Number.isSafeInteger(pid)) return true;
      try { process.kill(pid, 0); } catch (err) { return err.code === 'ESRCH'; }
      return false;
    }
  }

  function encode(entry) {
    assertNoSecrets(entry, 'standing approval record');
    return `${JSON.stringify(entry)}\n`;
  }

  function append(entry) {
    const { file } = paths();
    const line = encode(entry);
    refuseSymlink(file, 'standing approval file');
    // A crashed append may leave a partial last line. Keep the next record on
    // its own line so skipping that fragment cannot also discard a new revoke.
    let separator = '';
    try {
      const raw = readFileSync(file, 'utf8');
      if (raw && !raw.endsWith('\n')) separator = '\n';
    } catch (err) { if (err.code !== 'ENOENT') throw err; }
    appendFileSync(file, separator + line, { encoding: 'utf8', mode: 0o600 });
    chmodSync(file, 0o600);
  }

  function compact(entries, at) {
    const { file } = paths();
    const expired = new Set(entries.filter(({ grant }) => grant && Date.parse(grant.expires_at) <= at)
      .map(({ grant }) => grant.id));
    if (!expired.size) return;
    const kept = entries.filter(({ grant, revoke }) => !expired.has(grant?.id ?? revoke?.id));
    const payload = kept.map(encode).join('');
    const tmp = `${file}.${randomUUID()}.tmp`;
    try {
      writeFileSync(tmp, payload, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      const fd = openSync(tmp, 'r+');
      try { fsyncSync(fd); } finally { closeSync(fd); }
      refuseSymlink(file, 'standing approval file');
      renameSync(tmp, file);
    } finally {
      try { unlinkSync(tmp); } catch (err) { if (err.code !== 'ENOENT') throw err; }
    }
  }

  return {
    async list() {
      return grantsFrom(readEntries(), now());
    },
    async add(grant) {
      // Validate before compaction, so a rejected record never changes the file.
      encode({ grant });
      withLock(() => {
        const entries = readEntries();
        const exists = entries.some((entry) => entry.grant?.id === grant.id);
        compact(entries, now());
        if (!exists) append({ grant });
      });
    },
    async revoke(id, atIso) {
      return withLock(() => {
        const grant = grantsFrom(readEntries(), now()).find((row) => row.id === id && !row.revoked_at);
        if (!grant) return null;
        append({ revoke: { id, at: atIso } });
        return { ...grant, revoked_at: atIso };
      });
    },
  };
}

/**
 * A module-wide grant is still a frozen action list. Current manifest eligibility
 * is required separately so removing the marker immediately restores the stop.
 * @param {object[]} grants
 * @param {{ action: string, manifestAction: object, label?: string | null, providerAccountId: string, root?: string, playbook?: string, input?: object, now: number }} call
 * @returns {object | null}
 */
export function matchStandingApproval(grants, { action, manifestAction, label, providerAccountId, root, playbook, input, now }) {
  if (manifestAction?.input_files && input !== null && typeof input === 'object' &&
      !Array.isArray(input) && Object.hasOwn(input, manifestAction.input_files.field)) return null;
  if (!manifestAction?.standing_approval || !root) return null;
  const kind = manifestAction.standing_approval.kind;
  const matches = grants.filter((grant) => isActiveStandingApproval(grant, now)
    && Array.isArray(grant.actions) && grant.actions.includes(action)
    && Array.isArray(grant.kinds) && grant.kinds.includes(kind)
    && Array.isArray(grant.summaries) && grant.summaries.includes(manifestAction.standing_approval.summary)
    && (manifestAction.standing_approval.caution === undefined
      || (Array.isArray(grant.cautions) && grant.cautions.includes(manifestAction.standing_approval.caution)))
    && (!isHeightened(grant.kinds) || (grant.heightened === true
      && Date.parse(grant.expires_at) - Date.parse(grant.created_at) > 0
      && Date.parse(grant.expires_at) - Date.parse(grant.created_at)
        <= maxStandingApprovalDays(grant.kinds, grant.playbook) * STANDING_APPROVAL_DAY_MS))
    && grant.label === (label ?? null)
    && grant.provider_account_id === providerAccountId
    && grant.root === root
    && (!grant.playbook || grant.playbook === playbook)
    && Object.entries(grant.where ?? {}).every(([field, values]) =>
      Object.hasOwn(input ?? {}, field) && typeof input[field] === 'string' && values.includes(input[field])));
  matches.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  return matches[0] ?? null;
}

/** Values are quoted as JSON so quotes inside a value cannot invent a scope. */
function connectionWords(label) {
  return label === null ? 'with no label' : `labelled ${JSON.stringify(label)}`;
}

/** @param {object} scope */
function scopeWords(scope) {
  const playbook = scope.playbook ? `, in the Playbook ${JSON.stringify(scope.playbook)}` : '';
  const where = Object.keys(scope.where ?? {}).sort().map((field) =>
    `, and only where ${field} is ${scope.where[field].map((value) => JSON.stringify(value)).join(' or ')}`).join('');
  return `on your connection ${connectionWords(scope.label)} without asking you first, for work done from the root ${JSON.stringify(scope.root)}${playbook}${where}`;
}

/**
 * Fixed warning shown word for word before a grant can exist.
 * @param {{ scope: object, summaries: string[], cautions?: string[], kinds: string[], heightened: boolean, expiresOn: string }} proposal
 */
export function buildStandingApprovalWarning({ scope, summaries, cautions = [], kinds, heightened, expiresOn }) {
  const cautionText = [...new Set(cautions)].map((caution) => `${caution} `).join('');
  const heightenedText = heightened
    ? maxStandingApprovalDays(kinds, scope.playbook) === 90
      ? `This approval sends messages to other people, ${Object.keys(scope.where ?? {}).length ? 'to any recipient the limits above allow' : 'to any recipient'}, and nobody looks at each one before it is sent; once sent, a message cannot be called back. Because it covers only sending, and only in one Playbook, it lasts at most 90 days. `
      : `Some of these actions ${joinWords(Object.entries(HEIGHTENED_PHRASES).filter(([kind]) => kinds.includes(kind)).map(([, phrase]) => phrase))}. Under this approval nobody looks at each one before it happens, and once done it cannot be called back. It lasts at most 7 days. `
    : '';
  return `This standing approval lets your assistant ${joinWords(summaries)} ${scopeWords(scope)}. For ${scope.days} ${scope.days === 1 ? 'day' : 'days'}, until ${expiresOn}, every call that matches runs straight away, with no approval step for you to see or refuse. Anything outside it still asks you, as today. ${cautionText}${heightenedText}You can end it at any time: ask your assistant to revoke it, or remove it on your Wiser account page. Answer yes to grant it, or no to leave things as they are.`;
}

/**
 * One plain line for a list or an account page. A grant keeps the summaries it
 * was warned with, so the line still reads after its connector has gone; a row
 * written before summaries were kept falls back to its action ids.
 * @param {object} grant
 */
export function standingApprovalSummary(grant) {
  const named = Array.isArray(grant.summaries) && grant.summaries.length ? grant.summaries : grant.actions;
  return `Lets your assistant ${joinWords(named)} ${scopeWords(grant)}, until ${grant.expires_at.slice(0, 10)}.`;
}

/**
 * Stamp every result after a grant matched, including a provider refusal. Arrays
 * and scalar results are wrapped so the answer is always a plain object.
 * @param {unknown} result
 * @param {object | null} grant
 */
export function standingApprovalResult(result, grant) {
  if (!grant) return result;
  const standing_approval = { id: grant.id, expires_at: grant.expires_at };
  return result && typeof result === 'object' && !Array.isArray(result)
    ? { ...result, standing_approval }
    : { result, standing_approval };
}
