import { createHash } from 'node:crypto';
import { normalizeTitle } from './normalize.js';

export function dedupeCandidates(candidates) {
  const seenUrls = new Map();
  const seenTitles = new Map();
  const accepted = [];
  const rejected = [];

  for (const candidate of candidates) {
    const urlKey = candidate.canonical_url || candidate.url;
    const titleKey = normalizeTitle(candidate.title);

    if (urlKey && seenUrls.has(urlKey)) {
      rejected.push(toRejected(candidate, 'duplicate:url', seenUrls.get(urlKey)));
      continue;
    }

    if (titleKey && seenTitles.has(titleKey)) {
      rejected.push(toRejected(candidate, 'duplicate:title', seenTitles.get(titleKey)));
      continue;
    }

    if (urlKey) seenUrls.set(urlKey, candidate.id);
    if (titleKey) seenTitles.set(titleKey, candidate.id);
    accepted.push(candidate);
  }

  return { accepted, rejected };
}

/**
 * Clusters are built before deduplication, which is the only order in which
 * they carry information: after it, every group holds one item. So a cluster's
 * item_ids can name an item that deduplication later dropped. OUTPUT_SCHEMA.md
 * states that; do not read item_ids as an index into candidates.
 *
 * A cluster is a connected group under both of deduplication's tests at once,
 * not a group keyed on one of them. Two items belong together when they share a
 * canonical URL or a title that normalizes the same, and belonging is carried
 * along: an item joined to a second by title and to a third by URL puts all
 * three in one cluster. Keying on the URL and falling back to the title would
 * split exactly the case a cluster exists to show, one story carried by several
 * sources under one headline at several addresses, and would then disagree with
 * deduplication, which drops those as duplicates by title. An item with neither
 * key joins nothing and stands alone.
 */
export function clusterCandidates(candidates) {
  const parents = candidates.map((_, index) => index);

  const find = (index) => {
    let root = index;
    while (parents[root] !== root) root = parents[root];
    while (parents[index] !== root) {
      const next = parents[index];
      parents[index] = root;
      index = next;
    }
    return root;
  };

  const join = (left, right) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot === rightRoot) return;
    // The lower index wins, so a cluster's first item stays the highest ranked
    // of its members: candidates arrive here sorted by score.
    parents[Math.max(leftRoot, rightRoot)] = Math.min(leftRoot, rightRoot);
  };

  const firstHolder = new Map();

  candidates.forEach((candidate, index) => {
    for (const key of clusterKeys(candidate)) {
      if (firstHolder.has(key)) join(firstHolder.get(key), index);
      else firstHolder.set(key, index);
    }
  });

  const groups = new Map();

  candidates.forEach((candidate, index) => {
    const root = find(index);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(candidate);
  });

  return Array.from(groups.values())
    .map((items) => ({
      cluster_id: hashId(items.map((item) => item.id).join('|')),
      title: items[0].title,
      item_ids: items.map((item) => item.id),
      urls: unique(items.map((item) => item.canonical_url || item.url)),
      sources: unique(items.map((item) => item.source)),
      top_score: Math.max(...items.map((item) => item.score || 0))
    }))
    .sort((a, b) => b.top_score - a.top_score);
}

/**
 * What an item can be joined to another by, namespaced so a title can never
 * match a URL, and read exactly as deduplication reads them so the two agree.
 */
function clusterKeys(candidate) {
  const keys = [];
  const urlKey = candidate.canonical_url || candidate.url;
  const titleKey = normalizeTitle(candidate.title);

  if (urlKey) keys.push(`url:${urlKey}`);
  if (titleKey) keys.push(`title:${titleKey}`);

  return keys;
}

function toRejected(candidate, reason, duplicateOf) {
  return {
    reason,
    duplicate_of: duplicateOf,
    title: candidate.title,
    url: candidate.url || candidate.canonical_url,
    source: candidate.source,
    adapter_type: candidate.adapter_type
  };
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function hashId(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}
