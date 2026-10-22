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
 * Local metadata adapter. The clock is a callback so replacing `gw.now` also
 * changes pruning. All writes use the connection store's secret and mode checks.
 * @param {import('./store.js').JsonFileStore} store
 * @param {() => number} [now]
 */
export function createStandingApprovals(store, now = Date.now) {
  return {
    async list() {
      const at = now();
      return store.read().standing_approvals.filter((row) => Date.parse(row.expires_at) > at);
    },
    async add(grant) {
      const doc = store.read();
      const at = now();
      doc.standing_approvals = [...doc.standing_approvals, grant].filter((row) => Date.parse(row.expires_at) > at);
      store.write(doc);
    },
    async revoke(id, atIso) {
      const doc = store.read();
      const at = now();
      doc.standing_approvals = doc.standing_approvals.filter((row) => Date.parse(row.expires_at) > at);
      const grant = doc.standing_approvals.find((row) => row.id === id && !row.revoked_at);
      if (grant) grant.revoked_at = atIso;
      store.write(doc);
      return grant ?? null;
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
  if (!manifestAction?.standing_approval || !root) return null;
  const matches = grants.filter((grant) => isActiveStandingApproval(grant, now)
    && Array.isArray(grant.actions) && grant.actions.includes(action)
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
 * @param {{ scope: object, summaries: string[], kinds: string[], heightened: boolean, expiresOn: string }} proposal
 */
export function buildStandingApprovalWarning({ scope, summaries, kinds, heightened, expiresOn }) {
  const heightenedText = heightened
    ? `Some of these actions ${joinWords(Object.entries(HEIGHTENED_PHRASES).filter(([kind]) => kinds.includes(kind)).map(([, phrase]) => phrase))}. Under this approval nobody looks at each one before it happens, and once done it cannot be called back. It lasts at most 7 days. `
    : '';
  return `This standing approval lets your assistant ${joinWords(summaries)} ${scopeWords(scope)}. For ${scope.days} ${scope.days === 1 ? 'day' : 'days'}, until ${expiresOn}, every call that matches runs straight away, with no approval step for you to see or refuse. Anything outside it still asks you, as today. ${heightenedText}You can end it at any time: ask your assistant to revoke it, or remove it on your Wiser account page. Answer yes to grant it, or no to leave things as they are.`;
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
