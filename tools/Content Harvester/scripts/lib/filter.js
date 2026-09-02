export function filterCandidates(candidates, request) {
  const accepted = [];
  const rejected = [];
  const timebox = {
    from: new Date(request.timebox.from),
    to: new Date(request.timebox.to)
  };
  const filters = request.filters || {};
  const perSource = new Map();

  for (const candidate of candidates) {
    const reason = rejectionReason(candidate, filters, timebox, perSource);

    if (reason) {
      rejected.push(toRejected(candidate, reason));
      continue;
    }

    const key = sourceKey(candidate);
    perSource.set(key, (perSource.get(key) || 0) + 1);
    accepted.push(candidate);
  }

  return { accepted, rejected };
}

function rejectionReason(candidate, filters, timebox, perSource) {
  if (!candidate.url && !candidate.canonical_url) {
    return 'missing_url';
  }

  if (candidate.published_at) {
    const published = new Date(candidate.published_at);
    if (published < timebox.from || published > timebox.to) {
      return 'outside_timebox';
    }
  }

  const text = candidateText(candidate);

  if (Array.isArray(filters.exclude_terms)) {
    const matched = filters.exclude_terms.find((term) => text.includes(String(term).toLowerCase()));
    if (matched) return `excluded_term:${matched}`;
  }

  if (Array.isArray(filters.include_terms) && filters.include_terms.length > 0) {
    const matched = filters.include_terms.some((term) => text.includes(String(term).toLowerCase()));
    if (!matched) return 'missing_include_term';
  }

  if (Number.isFinite(Number(filters.min_score)) && candidate.score < Number(filters.min_score)) {
    return 'below_min_score';
  }

  if (Number.isFinite(Number(filters.max_items_per_source))) {
    if ((perSource.get(sourceKey(candidate)) || 0) >= Number(filters.max_items_per_source)) {
      return 'source_cap_reached';
    }
  }

  return null;
}

function candidateText(candidate) {
  return [candidate.title, candidate.summary, candidate.content, candidate.url, candidate.source]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function sourceKey(candidate) {
  return `${candidate.adapter_type}:${candidate.source}`;
}

function toRejected(candidate, reason) {
  return {
    reason,
    title: candidate.title,
    url: candidate.url || candidate.canonical_url,
    source: candidate.source,
    adapter_type: candidate.adapter_type
  };
}
