function invalidArguments(field) {
  return { status: 'invalid_arguments', field };
}

function extraKey(input, allowed) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalidArguments('input');
  const extra = Object.keys(input).find((key) => !allowed.includes(key));
  return extra === undefined ? null : invalidArguments(extra);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function isAbsHttpUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const URL_FIELDS = ['site_url', 'page_url', 'url', 'target_url', 'feed_url'];

function optionalPageNumber(input) {
  if (!Object.hasOwn(input, 'page_number')) return null;
  return Number.isInteger(input.page_number) && input.page_number >= 1
    ? null
    : invalidArguments('page_number');
}

function optionalDates(input) {
  for (const field of ['start_date', 'end_date']) {
    if (Object.hasOwn(input, field) && (typeof input[field] !== 'string' || !DATE.test(input[field]))) {
      return invalidArguments(field);
    }
  }
  if (Object.hasOwn(input, 'start_date') && Object.hasOwn(input, 'end_date') && input.start_date > input.end_date) {
    return invalidArguments('start_date');
  }
  return null;
}

function requireReport(input, allowed) {
  if (!isNonEmptyString(input.report) || !allowed.includes(input.report)) return invalidArguments('report');
  return null;
}

async function viaCatalog(input, ctx) {
  return ctx.catalog(`${ctx.service}.${ctx.module}.${ctx.action}`, input);
}

/**
 * The vendor's site list carries ownership-verification secrets beside each
 * site: an account-level `authentication_code`, identical across every site,
 * and a per-site `dns_verification_code`. Either one is enough to assert
 * ownership of a property at the vendor, so neither belongs in a reading that
 * flows into a transcript, an audit ledger or a gate file. Observed live
 * 2026-09-20 on the first real call. An audit needs the site and whether it is
 * verified; it never needs the proof of ownership. Unknown fields are kept, so a
 * vendor addition still reaches the caller, and only these two are dropped.
 */
const SITE_SECRET_FIELDS = [
  'authentication_code',
  'dns_verification_code',
  'AuthenticationCode',
  'DnsVerificationCode',
];

const MAX_STRIP_DEPTH = 12;

/**
 * Remove the secret keys wherever they appear in the response, at any depth and
 * under any wrapper.
 *
 * The first version matched only the one envelope observed live, a `sites`
 * array of flat objects, and returned anything else unchanged. Review found that
 * fails open: a wrapper the catalog layer has not shown us yet, or a secret
 * nested one level inside a site object, would silently restore the disclosure.
 * Matching on key name rather than on position removes that dependence on shape.
 * No consumer of either field exists in this repository, so removing them
 * wherever they occur cannot break a reader.
 *
 * Depth is bounded so a pathological response cannot recurse without end. At the
 * bound the branch is dropped rather than returned, because returning it would
 * be returning exactly the unexamined content this function exists to examine.
 */
function stripSecrets(value, depth = 0) {
  if (Array.isArray(value)) {
    if (depth >= MAX_STRIP_DEPTH) return [];
    return value.map((entry) => stripSecrets(entry, depth + 1));
  }
  if (!value || typeof value !== 'object') return value;
  if (depth >= MAX_STRIP_DEPTH) return {};
  const kept = {};
  for (const [key, entry] of Object.entries(value)) {
    if (SITE_SECRET_FIELDS.includes(key)) continue;
    kept[key] = stripSecrets(entry, depth + 1);
  }
  return kept;
}

function action(allowed, required, extras) {
  return async (input, ctx) => {
    const extra = extraKey(input, allowed);
    if (extra) return extra;
    for (const field of required) {
      if (!Object.hasOwn(input, field)) return invalidArguments(field);
    }
    for (const field of URL_FIELDS) {
      if (Object.hasOwn(input, field) && !isAbsHttpUrl(input[field])) return invalidArguments(field);
    }
    const more = extras ? extras(input) : null;
    if (more) return more;
    return viaCatalog(input, ctx);
  };
}

export const modules = {
  webmaster: {
    list_sites: async (input, ctx) => stripSecrets(await action([], [])(input, ctx)),
    search_performance: action(
      ['site_url', 'report'],
      ['site_url', 'report'],
      (input) => requireReport(input, ['daily_totals', 'top_queries', 'top_pages']),
    ),
    query_performance: action(
      ['site_url', 'query', 'report', 'page_url', 'start_date', 'end_date'],
      ['site_url', 'query', 'report'],
      (input) => {
        if (!isNonEmptyString(input.query)) return invalidArguments('query');
        const report = requireReport(input, ['daily', 'pages', 'page_daily']);
        if (report) return report;
        if ((input.report === 'page_daily' || input.report === 'pages') && !Object.hasOwn(input, 'page_url')) {
          return invalidArguments('page_url');
        }
        return optionalDates(input);
      },
    ),
    page_performance: action(
      ['site_url', 'page_url', 'report', 'page_number'],
      ['site_url', 'page_url', 'report'],
      (input) => {
        const report = requireReport(input, ['summary', 'queries', 'children']);
        if (report) return report;
        if (input.report !== 'children' && Object.hasOwn(input, 'page_number')) return invalidArguments('page_number');
        return optionalPageNumber(input);
      },
    ),
    crawl_diagnostics: action(
      ['site_url', 'report'],
      ['site_url', 'report'],
      (input) => requireReport(input, ['issues', 'stats']),
    ),
    inspect_url: action(['site_url', 'url'], ['site_url', 'url']),
    feeds: action(['site_url', 'feed_url'], ['site_url']),
    inbound_links: action(
      ['site_url', 'target_url', 'page_number'],
      ['site_url'],
      (input) => optionalPageNumber(input),
    ),
    research_keywords: action(
      ['query', 'country', 'language', 'report', 'start_date', 'end_date'],
      ['query', 'country', 'language', 'report'],
      (input) => {
        if (!isNonEmptyString(input.query)) return invalidArguments('query');
        if (!isNonEmptyString(input.country)) return invalidArguments('country');
        if (!isNonEmptyString(input.language)) return invalidArguments('language');
        const report = requireReport(input, ['impressions', 'history', 'related']);
        if (report) return report;
        if (input.report === 'impressions' || input.report === 'history') {
          if (!Object.hasOwn(input, 'start_date')) return invalidArguments('start_date');
          if (!Object.hasOwn(input, 'end_date')) return invalidArguments('end_date');
        }
        if (input.report === 'related') {
          if (Object.hasOwn(input, 'start_date')) return invalidArguments('start_date');
          if (Object.hasOwn(input, 'end_date')) return invalidArguments('end_date');
        }
        return optionalDates(input);
      },
    ),
  },
};
