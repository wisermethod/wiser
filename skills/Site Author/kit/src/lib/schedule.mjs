// Scheduled articles. An article is published when it is not a draft and its pubDate is at or before the build instant.
// astro.config.mjs fixes that instant once, at the start of a build, in KIT_BUILD_TIME; set KIT_BUILD_TIME yourself,
// a date and time with an offset or a date alone, to build as of another moment for a preview or a test.

// A date alone is 00:00 UTC, as a pubDate given as a date alone is.
export const BUILD_TIME_SHAPE = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2}))?$/;

export function buildInstant() {
  const set = process.env.KIT_BUILD_TIME;
  if (set === undefined || set === '') return Date.now();
  const at = Date.parse(set);
  if (!BUILD_TIME_SHAPE.test(set) || !Number.isFinite(at)) {
    throw new Error(`KIT_BUILD_TIME must be a date, 2026-10-09, read as 00:00 UTC, or a date and time with an offset, 2026-10-09T09:00:00-06:00; it is ${set}`);
  }
  return at;
}

export function isPublished(data) {
  return !data.draft && data.pubDate.valueOf() <= buildInstant();
}
