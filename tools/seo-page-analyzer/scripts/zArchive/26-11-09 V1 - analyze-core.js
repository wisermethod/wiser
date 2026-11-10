/**
 * seo-page-analyzer core - the analysis, with no input or output of its own.
 *
 * Everything here is a pure function of the HTML string and the two caller
 * arguments. Nothing reads a file, opens a connection, or reads a clock beyond
 * the single timestamp the entry script stamps on the report.
 *
 * Node built-ins only; nothing here imports from outside this tool directory.
 * The rules every shipped script follows are stated once, in
 * system/templates/Script Contract.md.
 */

// Thresholds. Conventional practice for how search results display and how much
// content a page tends to need; no search platform publishes them as limits, so
// a crossing is an observation about the page, never a defect. They are fixed:
// a tool that runs the same way every time cannot take them as arguments.
const THRESHOLDS = {
  titleMax: 60,
  titleMin: 20,
  metaDescriptionMax: 160,
  metaDescriptionMin: 70,
  thinContentWords: 300,
  headingContentWords: 300,
  minInternalLinks: 3,
  maxKeywordDensity: 0.03
};

const SCANNED_TAGS = new Set(['title', 'meta', 'link', 'html', 'h1', 'h2', 'h3', 'p', 'img', 'a', 'script', 'style']);

const NAMED_ENTITIES = new Map([
  ['amp', '&'], ['lt', '<'], ['gt', '>'], ['quot', '"'], ['apos', "'"],
  ['nbsp', ' '], ['ndash', '-'], ['mdash', '-'], ['hellip', '...'], ['rsquo', "'"],
  ['lsquo', "'"], ['ldquo', '"'], ['rdquo', '"']
]);

/**
 * The whole report for one page.
 *
 * `url` is the address the caller says this HTML came from. It is parsed, to
 * separate the page's own links from links off it, and echoed; it is never
 * requested. `keyword` is optional: every keyword check reports null without it
 * rather than guessing what the page is for.
 */
export function analyzePage({ html, url, keyword, analyzedAt }) {
  const source = stripComments(String(html ?? ''));
  const lower = source.toLowerCase();
  const tags = scanTags(source, lower);
  const bodyText = extractBodyText(source);
  const wordCount = countWords(bodyText);
  const needle = keyword ? String(keyword).toLowerCase() : null;

  return {
    url,
    analyzedAt,
    targetKeyword: keyword ?? null,
    title: analyzeTitle(source, tags, needle),
    metaDescription: analyzeMetaDescription(tags, needle),
    headings: analyzeHeadings(source, tags, needle, wordCount),
    content: analyzeContent(tags, bodyText, wordCount, needle),
    links: analyzeLinks(tags, url),
    technical: analyzeTechnical(tags),
    structuredData: analyzeStructuredData(source, tags),
    openGraph: analyzeOpenGraph(tags)
  };
}

// --- Element analyzers ---

function analyzeTitle(source, tags, needle) {
  // First title wins for the reported text; more than one is still an issue.
  const titleTags = tags.filter((entry) => entry.name === 'title');
  const tag = titleTags[0];
  const text = tag ? cleanText(elementText(source, tag)) : null;
  const length = text ? [...text].length : 0;
  const issues = [];

  if (!text) {
    issues.push('No title element.');
  } else {
    if (length > THRESHOLDS.titleMax) issues.push(`Title is ${length} characters, above the ${THRESHOLDS.titleMax}-character guideline.`);
    if (length < THRESHOLDS.titleMin) issues.push(`Title is ${length} characters, below the ${THRESHOLDS.titleMin}-character guideline.`);
    if (isAllUppercase(text)) issues.push('Title is entirely uppercase.');
  }
  if (titleTags.length > 1) {
    issues.push(`${titleTags.length} title elements; the first is reported.`);
  }

  const containsKeyword = contains(text, needle);
  if (containsKeyword === false) issues.push('Target keyword does not appear in the title.');

  return { text, length, containsKeyword, issues };
}

function analyzeMetaDescription(tags, needle) {
  // First matching meta wins for the reported text; more than one is still an issue.
  const descriptionTags = tags.filter(
    (tag) => tag.name === 'meta' && (tag.attrs.get('name') ?? '').trim().toLowerCase() === 'description'
  );
  const text = cleanText(descriptionTags.length > 0 ? (descriptionTags[0].attrs.get('content') ?? '') : null);
  const length = text ? [...text].length : 0;
  const issues = [];

  if (!text) {
    issues.push('No meta description.');
  } else {
    if (length > THRESHOLDS.metaDescriptionMax) issues.push(`Meta description is ${length} characters, above the ${THRESHOLDS.metaDescriptionMax}-character guideline.`);
    if (length < THRESHOLDS.metaDescriptionMin) issues.push(`Meta description is ${length} characters, below the ${THRESHOLDS.metaDescriptionMin}-character guideline.`);
  }
  if (descriptionTags.length > 1) {
    issues.push(`${descriptionTags.length} meta description tags; the first is reported.`);
  }

  const containsKeyword = contains(text, needle);
  if (containsKeyword === false) issues.push('Target keyword does not appear in the meta description.');

  return { text, length, containsKeyword, issues };
}

function analyzeHeadings(source, tags, needle, wordCount) {
  const h1 = headingTexts(source, tags, 'h1');
  const h2 = headingTexts(source, tags, 'h2');
  const h3 = headingTexts(source, tags, 'h3');
  const issues = [];

  if (h1.length === 0) issues.push('No H1 element.');
  if (h1.length > 1) issues.push(`${h1.length} H1 elements; the guideline is one per page.`);
  if (h2.length === 0 && wordCount > THRESHOLDS.headingContentWords) {
    issues.push(`No H2 elements on a page of ${wordCount} words.`);
  }

  const containsKeywordInH1 = needle && h1.length > 0
    ? h1.some((heading) => heading.toLowerCase().includes(needle))
    : null;

  if (containsKeywordInH1 === false) issues.push('Target keyword does not appear in any H1.');

  return { h1, h2, h3, h1Count: h1.length, containsKeywordInH1, issues };
}

function analyzeContent(tags, bodyText, wordCount, needle) {
  const paragraphCount = tags.filter((entry) => entry.name === 'p').length;
  const images = tags.filter((entry) => entry.name === 'img');
  const imagesWithAlt = images.filter((entry) => (entry.attrs.get('alt') ?? '').trim() !== '').length;
  const issues = [];

  if (wordCount < THRESHOLDS.thinContentWords) {
    issues.push(`Body text is ${wordCount} words, below the ${THRESHOLDS.thinContentWords}-word guideline.`);
  }
  if (images.length > imagesWithAlt) {
    issues.push(`${images.length - imagesWithAlt} of ${images.length} images without a non-empty alt attribute.`);
  }

  let keywordDensity = null;

  if (needle && wordCount > 0) {
    const occurrences = countOccurrences(bodyText.toLowerCase(), needle);
    keywordDensity = occurrences / wordCount;

    if (occurrences === 0) {
      issues.push('Target keyword does not appear in the body text.');
    } else if (keywordDensity > THRESHOLDS.maxKeywordDensity) {
      issues.push(`Target keyword appears ${plural(occurrences, 'time')} in ${wordCount} words, ${formatPercent(keywordDensity)}, above the ${formatPercent(THRESHOLDS.maxKeywordDensity)} guideline.`);
    }
  }

  return {
    wordCount,
    paragraphCount,
    imageCount: images.length,
    imagesWithAlt,
    imagesWithoutAlt: images.length - imagesWithAlt,
    keywordDensity,
    issues
  };
}

function analyzeLinks(tags, pageUrl) {
  const pageHost = new URL(pageUrl).hostname;
  let internalLinks = 0;
  let externalLinks = 0;
  let noFollowLinks = 0;
  const issues = [];

  for (const tag of tags) {
    if (tag.name !== 'a') continue;

    const href = (tag.attrs.get('href') ?? '').trim();
    if (href === '') continue;

    let resolved;

    try {
      resolved = new URL(href, pageUrl);
    } catch {
      continue;
    }

    // A fragment, a mail or phone address, and a script href are not links to a
    // page, so none of them counts toward how well this page is connected.
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') continue;
    if (href.startsWith('#')) continue;

    if (resolved.hostname === pageHost) internalLinks++;
    else externalLinks++;

    if (hasToken(tag.attrs.get('rel'), 'nofollow')) noFollowLinks++;
  }

  if (internalLinks === 0) issues.push('No internal links.');
  else if (internalLinks < THRESHOLDS.minInternalLinks) {
    issues.push(`${plural(internalLinks, 'internal link')}, below the ${THRESHOLDS.minInternalLinks}-link guideline.`);
  }

  return { internalLinks, externalLinks, noFollowLinks, issues };
}

function analyzeTechnical(tags) {
  // First canonical wins for the reported URL; more than one is still an issue.
  const canonicalTags = tags.filter(
    (entry) => entry.name === 'link' && hasToken(entry.attrs.get('rel'), 'canonical')
  );
  const canonical = canonicalTags[0];
  const canonicalUrl = canonical ? (canonical.attrs.get('href') ?? null) : null;
  const robots = metaContent(tags, 'name', 'robots');
  const hasViewportMeta = metaContent(tags, 'name', 'viewport') !== null;
  const htmlTag = tags.find((entry) => entry.name === 'html');
  const language = htmlTag ? (htmlTag.attrs.get('lang') ?? null) : null;
  const directives = (robots ?? '').toLowerCase();
  const isNoindex = directives.includes('noindex');
  const isNofollow = directives.includes('nofollow');
  const issues = [];

  if (isNoindex) issues.push('Robots meta contains noindex.');
  if (isNofollow) issues.push('Robots meta contains nofollow.');
  if (!canonicalUrl) issues.push('No canonical link.');
  if (canonicalTags.length > 1) {
    issues.push(`${canonicalTags.length} canonical links; the first is reported.`);
  }
  if (!hasViewportMeta) issues.push('No viewport meta.');
  if (!language) issues.push('No lang attribute on the html element.');

  return { canonicalUrl, robots, isNoindex, isNofollow, hasViewportMeta, language, issues };
}

function analyzeStructuredData(source, tags) {
  const schemas = [];
  const issues = [];
  let invalidBlocks = 0;

  for (const tag of tags) {
    if (tag.name !== 'script') continue;
    if ((tag.attrs.get('type') ?? '').trim().toLowerCase() !== 'application/ld+json') continue;

    let data;

    try {
      data = JSON.parse(elementText(source, tag));
    } catch {
      // The block's own text is never quoted back: a page can put anything in it.
      invalidBlocks++;
      continue;
    }

    for (const item of flattenSchemaItems(data)) {
      const type = item['@type'];
      if (type === undefined) continue;

      schemas.push({
        type: Array.isArray(type) ? type.map(String).join(', ') : String(type),
        properties: Object.keys(item).filter((key) => !key.startsWith('@'))
      });
    }
  }

  if (invalidBlocks > 0) {
    issues.push(`${plural(invalidBlocks, 'JSON-LD block')} did not parse as JSON.`);
  }
  if (schemas.length === 0) issues.push('No JSON-LD structured data.');

  return { schemas, hasSchema: schemas.length > 0, issues };
}

function analyzeOpenGraph(tags) {
  const title = cleanText(metaContent(tags, 'property', 'og:title'));
  const description = cleanText(metaContent(tags, 'property', 'og:description'));
  const image = metaContent(tags, 'property', 'og:image');
  const type = metaContent(tags, 'property', 'og:type');
  const issues = [];

  if (!title) issues.push('No og:title.');
  if (!image) issues.push('No og:image.');

  return { title, description, image, type, issues };
}

// --- HTML reading ---

/**
 * Every tag this analysis asks about, in document order, each with its
 * attributes.
 *
 * The scan walks the string rather than matching a tag shape, because an
 * attribute value can hold a `>` and an attribute list has no fixed order: a
 * pattern written around one order silently misses `<meta content="..."
 * id="x" name="description">`, which is the same tag.
 */
function scanTags(source, lower) {
  const tags = [];
  let index = 0;

  while (index < source.length) {
    const open = source.indexOf('<', index);
    if (open === -1) break;

    const nameStart = open + 1;
    let nameEnd = nameStart;
    while (nameEnd < source.length && /[a-zA-Z0-9]/.test(source[nameEnd])) nameEnd++;

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
      cursor++;
    }

    if (cursor >= source.length) break;

    if (SCANNED_TAGS.has(name)) {
      tags.push({ name, attrs: parseAttributes(source.slice(nameEnd, cursor)), end: cursor + 1, lower });
    }

    index = cursor + 1;

    // A script's or a style's contents are code, not markup: a heading a script
    // writes at runtime is not on the page as delivered, and a stylesheet's `>`
    // is not a tag. The element itself is kept, since a JSON-LD block is read
    // from it, and the scan resumes at its closing tag.
    if (name === 'script' || name === 'style') {
      const close = lower.indexOf(`</${name}`, index);
      if (close === -1) break;
      index = close;
    }
  }

  return tags;
}

/** Attribute names lowercased, values entity-decoded; a bare attribute holds ''. */
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

/** The raw text between a scanned tag and its closing tag, empty when unclosed. */
function elementText(source, tag) {
  const close = tag.lower.indexOf(`</${tag.name}`, tag.end);
  return close === -1 ? '' : source.slice(tag.end, close);
}

function headingTexts(source, tags, name) {
  return tags
    .filter((tag) => tag.name === name)
    .map((tag) => cleanText(stripTags(elementText(source, tag))))
    .filter((text) => text !== null);
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
 * The page's visible words. Head, script, and style elements go first, contents
 * and all: a page's own code is not its content, and the title is measured on
 * its own, so counting it again here would inflate every measurement that
 * divides by the word count.
 */
function extractBodyText(source) {
  let text = source;

  for (const name of ['head', 'script', 'style']) {
    text = removeElements(text, name);
  }

  return stripTags(text) ?? '';
}

function removeElements(source, name) {
  const lower = source.toLowerCase();
  const open = `<${name}`;
  const close = `</${name}`;
  let out = '';
  let index = 0;

  while (index < source.length) {
    const start = lower.indexOf(open, index);
    if (start === -1) break;

    const end = lower.indexOf(close, start);
    out += source.slice(index, start);

    if (end === -1) return out;

    const tagEnd = source.indexOf('>', end);
    index = tagEnd === -1 ? source.length : tagEnd + 1;
  }

  return out + source.slice(index);
}

function stripComments(source) {
  // A commented-out heading is not on the page, so it is removed before anything
  // counts it.
  return source.replace(/<!--[\s\S]*?-->/g, ' ');
}

function stripTags(text) {
  const stripped = decodeEntities(text.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
  return stripped === '' ? null : stripped;
}

function cleanText(value) {
  if (value === null || value === undefined) return null;
  const text = decodeEntities(String(value)).replace(/\s+/g, ' ').trim();
  return text === '' ? null : text;
}

/**
 * Named and numeric character references, so a length is the length of what a
 * reader sees: `&amp;` is one character in a title, not five.
 */
function decodeEntities(text) {
  return String(text).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES.get(body.toLowerCase()) ?? whole;
  });
}

// --- Small shared judgments ---

function contains(text, needle) {
  if (!needle || !text) return null;
  return text.toLowerCase().includes(needle);
}

function hasToken(value, token) {
  return String(value ?? '').toLowerCase().split(/[\s,]+/).includes(token);
}

function countWords(text) {
  return text.split(/\s+/).filter((word) => word.length > 0).length;
}

function countOccurrences(haystack, needle) {
  let count = 0;
  let index = haystack.indexOf(needle);

  while (index !== -1) {
    count++;
    index = haystack.indexOf(needle, index + needle.length);
  }

  return count;
}

function isAllUppercase(text) {
  return /[a-zA-Z]/.test(text) && text === text.toUpperCase();
}

function plural(count, noun) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function formatPercent(ratio) {
  return `${(ratio * 100).toFixed(1)} percent`;
}

function flattenSchemaItems(data) {
  const items = [];
  const queue = Array.isArray(data) ? [...data] : [data];

  while (queue.length > 0) {
    const item = queue.shift();
    if (!item || typeof item !== 'object') continue;

    if (Array.isArray(item['@graph'])) {
      queue.push(...item['@graph']);
      continue;
    }

    items.push(item);
  }

  return items;
}
