// Blog helpers. Absent kit.json blog leaves every caller on the 0.3.0 path.

export function tagSlug(tag) {
  return String(tag).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
}

export function readingMinutes(body) {
  const text = typeof body === "string" ? body.trim() : "";
  const words = text ? text.split(/\s+/).length : 0;
  return Math.max(1, Math.ceil(words / 200));
}

export function relatedArticles(current, articles, limit) {
  const mine = new Set((current.data.tags ?? []).map((tag) => tagSlug(tag)).filter(Boolean));
  return articles
    .filter((other) => other.id !== current.id)
    .map((other) => {
      const seen = new Set();
      let shared = 0;
      for (const tag of other.data.tags ?? []) {
        const slug = tagSlug(tag);
        if (!slug || seen.has(slug)) continue;
        seen.add(slug);
        if (mine.has(slug)) shared += 1;
      }
      return { other, shared };
    })
    .filter((row) => row.shared > 0)
    .sort((a, b) => b.shared - a.shared || b.other.data.pubDate.valueOf() - a.other.data.pubDate.valueOf() || a.other.id.localeCompare(b.other.id))
    .slice(0, limit)
    .map((row) => row.other);
}
