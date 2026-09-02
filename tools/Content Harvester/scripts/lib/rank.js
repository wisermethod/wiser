/**
 * Role weights. The vocabulary is the one REQUEST_SCHEMA.md documents; a role
 * outside it scores UNKNOWN_ROLE rather than failing, so a consumer's own label
 * still ranks, just without a claim about its standing.
 */
const ROLE_WEIGHTS = {
  primary: 25,
  independent_reporting: 20,
  expert_analysis: 18,
  curated: 16,
  community: 12,
  social_signal: 10,
  discovery: 6
};

const UNKNOWN_ROLE = 5;

export function rankCandidates(candidates, request) {
  // Recency is measured against the end of the timebox, not the wall clock, so
  // the same request over the same feeds ranks the same way on any day.
  const reference = new Date(request.timebox.to);

  return candidates
    .map((candidate) => {
      const reasons = [];
      let score = 0;

      score += ROLE_WEIGHTS[candidate.source_role] ?? UNKNOWN_ROLE;
      reasons.push(`source_role:${candidate.source_role}`);

      if (candidate.matched_topics.length > 0) {
        score += Math.min(30, candidate.matched_topics.length * 10);
        reasons.push('topic_match');
      }

      if (candidate.published_at) {
        const ageHours = Math.max(0, (reference - new Date(candidate.published_at)) / 36e5);
        if (ageHours <= 24) {
          score += 20;
          reasons.push('recent:24h');
        } else if (ageHours <= 72) {
          score += 14;
          reasons.push('recent:72h');
        } else if (ageHours <= 168) {
          score += 8;
          reasons.push('recent:week');
        }
      } else {
        reasons.push('date_missing');
      }

      if (candidate.summary.length > 120) {
        score += 8;
        reasons.push('summary_detail');
      }

      if (candidate.content.length > 500) {
        score += 8;
        reasons.push('content_detail');
      }

      if (candidate.author) {
        score += 4;
        reasons.push('author_present');
      }

      return { ...candidate, score, score_reasons: reasons };
    })
    .sort((a, b) => b.score - a.score);
}
