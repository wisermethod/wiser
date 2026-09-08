/**
 * Our action id <-> this provider's tool slug, both directions.
 * A slug appears in this file and in a manifest's auth.toolkit, nowhere else.
 */

const ROWS = [
  ['github.repos.get', 'GITHUB_GET_A_REPOSITORY'], // confirmed 2026-09-08 catalog execute, wisermethod/wiser
  ['github.repos.list_for_user', 'GITHUB_LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER'], // UNVERIFIED; Milestone 3
  ['github.issues.list', 'GITHUB_LIST_REPOSITORY_ISSUES'], // UNVERIFIED; Milestone 3
  ['github.issues.create', 'GITHUB_CREATE_AN_ISSUE'], // UNVERIFIED; Milestone 3
  ['github.users.me', 'GITHUB_GET_THE_AUTHENTICATED_USER'], // read from the docs on 2026-09-05
  ['cloudflare.dns.list_records', 'CLOUDFLARE_LIST_DNS_RECORDS'], // read from the docs on 2026-09-05
  ['cloudflare.dns.get_record', 'CLOUDFLARE_GET_DNS_RECORD'], // UNVERIFIED; Milestone 3
  ['cloudflare.dns.create_record', 'CLOUDFLARE_CREATE_DNS_RECORD'], // read from the docs on 2026-09-05
  ['cloudflare.dns.update_record', 'CLOUDFLARE_UPDATE_DNS_RECORD'], // read from the docs on 2026-09-05
  ['cloudflare.dns.delete_record', 'CLOUDFLARE_DELETE_DNS_RECORD'], // read from the docs on 2026-09-05
];

const TO_SLUG = new Map(ROWS);
const FROM_SLUG = new Map(ROWS.map(([id, slug]) => [slug, id]));

const TOOLKITS = {
  github: 'GITHUB',
  cloudflare: 'CLOUDFLARE',
};

/**
 * @param {string} actionId
 * @returns {string | null}
 */
export function toSlug(actionId) {
  return TO_SLUG.get(actionId) ?? null;
}

/**
 * @param {string} slug
 * @returns {string | null}
 */
export function fromSlug(slug) {
  return FROM_SLUG.get(slug) ?? null;
}

/**
 * @param {string} service
 * @returns {string | null}
 */
export function toolkitFor(service) {
  return TOOLKITS[service] ?? null;
}
