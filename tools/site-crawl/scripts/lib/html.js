/**
 * Small regex-based HTML extractor for site-crawl. Same discipline as
 * seo-page-analyzer: walk tags rather than matching a fixed attribute order.
 */

const SCANNED_TAGS = new Set(['title', 'meta', 'link', 'html', 'h1', 'a']);

const NAMED_ENTITIES = new Map([
  ['amp', '&'], ['lt', '<'], ['gt', '>'], ['quot', '"'], ['apos', "'"],
  ['nbsp', ' ']
]);

function decodeEntities(text) {
  return String(text).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body) => {
    const lower = body.toLowerCase();
    if (NAMED_ENTITIES.has(lower)) return NAMED_ENTITIES.get(lower);
    if (lower.startsWith('#x')) {
      const code = Number.parseInt(lower.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    if (lower.startsWith('#')) {
      const code = Number.parseInt(lower.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return whole;
  });
}

function parseAttributes(text) {
  const attrs = new Map();
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    const name = match[1].toLowerCase();
    if (name === '/') continue;
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    if (!attrs.has(name)) attrs.set(name, decodeEntities(value));
  }

  return attrs;
}

function scanTags(source, lower) {
  const tags = [];
  let index = 0;

  while (index < source.length) {
    const open = source.indexOf('<', index);
    if (open === -1) break;

    const nameStart = open + 1;
    let nameEnd = nameStart;
    while (nameEnd < source.length && /[a-zA-Z0-9]/.test(source[nameEnd])) nameEnd += 1;

    const name = lower.slice(nameStart, nameEnd);
    if (name === '') {
      index = open + 1;
      continue;
    }

    let cursor = nameEnd;
    let quote = null;
    while (cursor < source.length) {
      const character = source[cursor];
      if (quote) {
        if (character === quote) quote = null;
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === '>') {
        break;
      }
      cursor += 1;
    }
    if (cursor >= source.length) break;

    if (SCANNED_TAGS.has(name)) {
      tags.push({ name, attrs: parseAttributes(source.slice(nameEnd, cursor)), end: cursor + 1, lower });
    }

    index = cursor + 1;
    if (name === 'script' || name === 'style') {
      const close = lower.indexOf(`</${name}`, index);
      if (close === -1) break;
      index = close;
    }
  }

  return tags;
}

function elementText(source, tag) {
  const close = tag.lower.indexOf(`</${tag.name}`, tag.end);
  return close === -1 ? '' : source.slice(tag.end, close);
}

function cleanText(value) {
  const text = decodeEntities(String(value ?? '')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text === '' ? null : text;
}

function hasToken(value, token) {
  if (!value) return false;
  return String(value).toLowerCase().split(/\s+/).includes(token.toLowerCase());
}

function metaContent(tags, attribute, value) {
  const wanted = value.toLowerCase();
  for (const tag of tags) {
    if (tag.name !== 'meta') continue;
    if ((tag.attrs.get(attribute) ?? '').trim().toLowerCase() !== wanted) continue;
    return tag.attrs.get('content') ?? '';
  }
  return null;
}

/**
 * Title, heading count, description presence, canonical, robots, lang, and
 * every a[href] on the page. hasAnchorHref is true when any a href is present,
 * which is the tell that this crawler can see links at all.
 */
export function extractPage(html) {
  const source = String(html ?? '');
  const lower = source.toLowerCase();
  const tags = scanTags(source, lower);

  const titleTag = tags.find((tag) => tag.name === 'title');
  const title = titleTag ? cleanText(elementText(source, titleTag)) : null;
  const h1Count = tags.filter((tag) => tag.name === 'h1').length;
  const hasMetaDescription = tags.some(
    (tag) => tag.name === 'meta' && (tag.attrs.get('name') ?? '').trim().toLowerCase() === 'description'
  );

  const canonicalTag = tags.find((tag) => tag.name === 'link' && hasToken(tag.attrs.get('rel'), 'canonical'));
  const canonical = canonicalTag ? (canonicalTag.attrs.get('href') || null) : null;

  const robotsMeta = metaContent(tags, 'name', 'robots');
  const googlebotMeta = metaContent(tags, 'name', 'googlebot');

  const htmlTag = tags.find((tag) => tag.name === 'html');
  const lang = htmlTag ? (htmlTag.attrs.get('lang') || null) : null;

  const hrefs = [];
  let hasAnchorHref = false;
  for (const tag of tags) {
    if (tag.name !== 'a') continue;
    if (!tag.attrs.has('href')) continue;
    hasAnchorHref = true;
    hrefs.push(tag.attrs.get('href'));
  }

  return {
    title,
    h1Count,
    hasMetaDescription,
    canonical,
    robotsMeta,
    googlebotMeta,
    lang,
    hrefs,
    hasAnchorHref
  };
}

export function hasNoindex(robotsMeta, googlebotMeta, xRobotsTag) {
  const blobs = [robotsMeta, googlebotMeta, xRobotsTag]
    .filter((value) => typeof value === 'string' && value !== '')
    .map((value) => value.toLowerCase());
  return blobs.some((value) => /\bnoindex\b/.test(value));
}
