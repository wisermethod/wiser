import { createHash } from 'node:crypto';

export function normalizeCandidate(input, context) {
  const url = recordUrl(input.url || '');
  const canonicalUrl = canonicalizeUrl(url);
  const title = cleanText(input.title || canonicalUrl || 'Untitled');
  const summary = cleanText(input.summary || '');
  const content = cleanText(input.content || '');
  const publishedAt = normalizeDate(input.published_at);
  const topics = uniqueValues([
    ...(context.requestTopics || []),
    ...(context.sourceTopics || []),
    ...(input.topics || [])
  ]);

  return {
    id: hashId(`${canonicalUrl || title}|${publishedAt || ''}`),
    title,
    url,
    canonical_url: canonicalUrl || url,
    source: input.source || context.source?.source || context.source?.name || 'Unnamed source',
    adapter_type: input.adapter_type || context.source?.type || 'unknown',
    source_role: input.source_role || context.source?.role || 'discovery',
    author: cleanText(input.author || ''),
    published_at: publishedAt,
    discovered_at: context.discoveredAt,
    summary,
    content,
    topics,
    matched_topics: matchTopics({ title, summary, content, url: canonicalUrl }, topics),
    score: 0,
    score_reasons: [],
    discovered_by: {
      type: context.source?.type || 'unknown',
      source: context.source?.source || context.source?.name || 'Unnamed source',
      url: publicUrl(context.source?.url)
    },
    raw: sanitizeRaw(input.raw ?? {})
  };
}

/**
 * Query and fragment parameter names that carry authorization rather than
 * describe a resource. A caller fetching material behind a login hands this
 * tool a URL that authorizes itself, so the fetch is made with the parameter
 * and the record is written without it. Matching is deliberately wide: a
 * parameter wrongly dropped costs a record its query string, and a parameter
 * wrongly kept publishes a credential into a bundle, a summary, and a log.
 */
const CREDENTIAL_SUBSTRINGS = [
  'token', 'secret', 'signature', 'apikey', 'api_key', 'password', 'passwd',
  'credential', 'sessionid', 'accesskey', 'authorization', 'jwt'
];

const CREDENTIAL_WORDS = /(?:^|[^a-z0-9])(?:key|keys|sid|sig|auth|session|access|refresh|pass|pwd|otp|oauth|bearer|sso|ticket|private)(?:[^a-z0-9]|$)/;

export function isCredentialParam(name) {
  const normalized = String(name).toLowerCase();
  return CREDENTIAL_SUBSTRINGS.some((needle) => normalized.includes(needle)) || CREDENTIAL_WORDS.test(normalized);
}

/**
 * The form of a URL this tool is willing to record. Any embedded username and
 * password is removed, and so is every credential-bearing query or fragment
 * parameter; nothing else changes, so the address stays a usable reference to
 * the page. Every URL that reaches the bundle, the summary, or a rejection
 * passes through here. The fetch itself is made from the URL the request gave,
 * which is how a caller's signed URL still works while the record of it does
 * not carry the signature.
 */
export function recordUrl(value) {
  if (!value || typeof value !== 'string') return '';

  let url;

  try {
    url = new URL(value);
  } catch {
    return stripCredentialParamsFromText(value);
  }

  const hadUserinfo = Boolean(url.username || url.password);
  const removed = stripCredentialParams(url);
  const hash = url.hash.includes('=') ? stripCredentialParamsFromText(`#${url.hash.slice(1)}`) : url.hash;

  if (!hadUserinfo && removed === 0 && hash === url.hash) return value;

  url.username = '';
  url.password = '';
  url.hash = hash === '#' ? '' : hash;

  return url.toString();
}

/**
 * Every http and https URL inside a piece of text, recorded in the form above.
 * Titles, summaries, feed content, and raw source records all carry addresses,
 * and a credential in one of them reaches the bundle the same way a candidate
 * URL would. Text with nothing to strip comes back byte for byte.
 */
export function sanitizeUrlsInText(value) {
  if (!value || typeof value !== 'string') return value;

  return value.replace(/\bhttps?:\/\/[^\s"'<>]+/gi, (match) => {
    const trailing = match.match(/[.,;:!?)\]}]+$/);
    const address = trailing ? match.slice(0, -trailing[0].length) : match;
    const recorded = recordUrl(address);
    return recorded === address ? match : `${recorded}${trailing ? trailing[0] : ''}`;
  });
}

function stripCredentialParams(url) {
  let removed = 0;

  for (const name of [...url.searchParams.keys()]) {
    if (!isCredentialParam(name)) continue;
    url.searchParams.delete(name);
    removed++;
  }

  return removed;
}

// The same filter for a string the URL parser would not take, and for the
// fragment, which an implicit-flow token arrives in.
function stripCredentialParamsFromText(value) {
  const separator = value.includes('?') ? '?' : value.startsWith('#') ? '#' : '';
  if (separator === '') return value;

  const cut = value.indexOf(separator);
  const head = value.slice(0, cut);
  const kept = value
    .slice(cut + 1)
    .split('&')
    .filter((pair) => pair !== '' && !isCredentialParam(pair.split('=')[0]));

  return kept.length > 0 ? `${head}${separator}${kept.join('&')}` : head;
}

/**
 * The source's own record of an item, with every address in it recorded the
 * same way the candidate's own URL is. Nothing else about it changes.
 */
function sanitizeRaw(value, depth = 0) {
  if (depth > 12) return value;
  if (typeof value === 'string') return sanitizeUrlsInText(value);
  if (Array.isArray(value)) return value.map((entry) => sanitizeRaw(entry, depth + 1));

  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, sanitizeRaw(entry, depth + 1)]));
  }

  return value;
}

/**
 * The form of a URL this tool is willing to print in a message or record as a
 * source address. Userinfo and the query string are both dropped, because
 * either can carry a credential and neither is needed to name what was called.
 */
export function publicUrl(value) {
  if (!value || typeof value !== 'string') return '';

  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return '';
  }
}

export function canonicalizeUrl(value) {
  if (!value || typeof value !== 'string') return '';

  try {
    const url = new URL(value);
    url.hash = '';
    url.username = '';
    url.password = '';
    for (const param of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid']) {
      url.searchParams.delete(param);
    }
    // Also every credential-bearing parameter, so the key deduplication and
    // clustering compare is a key no credential can reach. Two arrivals of one
    // article carrying different session ids collapse to one candidate here.
    stripCredentialParams(url);
    const search = url.searchParams.toString();
    return `${url.origin}${url.pathname.replace(/\/$/, '')}${search ? `?${search}` : ''}`;
  } catch {
    return stripCredentialParamsFromText(value.trim());
  }
}

export function normalizeTitle(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Text as this tool records it: markup dropped, entities decoded, whitespace
 * collapsed, and every address inside it recorded per `recordUrl`. The last of
 * those is here rather than at each call site so that no field this tool
 * records can carry a credentialed URL, including a title that fell back to the
 * address of the page it came from.
 */
export function cleanText(value) {
  if (value === null || value === undefined) return '';
  return sanitizeUrlsInText(
    decodeEntities(String(value).replace(/<[^>]+>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim()
  );
}

export function decodeEntities(value) {
  return String(value)
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * A topic matches on its own words. The request supplies the vocabulary; this
 * tool holds no subject knowledge of its own.
 */
function matchTopics(fields, topics) {
  const haystack = `${fields.title} ${fields.summary} ${fields.content} ${fields.url}`.toLowerCase();

  return topics.filter((topic) => {
    const normalized = String(topic).toLowerCase().trim();
    if (!normalized) return false;
    return [normalized, normalized.replace(/_/g, ' ')].some((term) => matchesTerm(haystack, term));
  });
}

function matchesTerm(haystack, term) {
  if (!term) return false;
  if (!/^[a-z0-9]+$/.test(term)) return haystack.includes(term);
  return new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i').test(haystack);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function uniqueValues(values) {
  return Array.from(new Set(values.filter(Boolean).map((value) => String(value))));
}

function hashId(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}
