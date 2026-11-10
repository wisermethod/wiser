import { fetchText } from '../lib/fetch.js';
import { decodeEntities, normalizeCandidate } from '../lib/normalize.js';

const ACCEPT = 'text/html, application/xhtml+xml, */*;q=0.8';

export async function collectUrl(source, context) {
  const html = await fetchText(source.url, ACCEPT, context);
  context.check?.();
  context.acceptItems?.(1);

  return [await normalizeCandidate(extractMetadata(html, source.url, source, context.check), {
    ...context,
    source,
    sourceTopics: source.topics || []
  })];
}

export async function collectManualUrls(source, context) {
  const candidates = [];
  const errors = [];

  for (const url of source.urls || []) {
    context.check?.();
    try {
      const [candidate] = await collectUrl({ ...source, type: 'url', url }, context);
      candidates.push(candidate);
    } catch (error) {
      context.check?.();
      if (error.fatal) throw error;
      errors.push({
        source: source.source || source.name || 'Unnamed source',
        adapter_type: source.type,
        message: error.message,
        retryable: Boolean(error.retryable),
        ...(error.reason ? { reason: error.reason } : {})
      });
    }
  }

  return { candidates, errors };
}

function extractMetadata(html, url, source, check = () => {}) {
  const { values, title } = scanTags(html, check);
  const meta = key => {
    for (const group of values) if (group.has(key)) return decodeEntities(group.get(key));
    return '';
  };
  return {
    title: meta('og:title') || meta('twitter:title') || title || url,
    url,
    source: source.source || source.name || hostName(url),
    adapter_type: source.type,
    source_role: source.role,
    author: meta('author') || meta('article:author'),
    published_at: meta('article:published_time') || meta('date') || meta('pubdate'),
    summary: meta('og:description') || meta('twitter:description') || meta('description'),
    content: '',
    raw: { extracted_meta: true }
  };
}

const META_KEYS = new Set(['og:title','twitter:title','author','article:author','article:published_time','date','pubdate','og:description','twitter:description','description']);
const space = char => char === ' ' || char === '\t' || char === '\r' || char === '\n' || char === '\f';

// Each code unit is visited a bounded number of times, even in an unfinished
// tag. Poll inside tag and attribute scans, rather than around one native match.
function scanTags(html, check) {
  const values = Array.from({length:4}, () => new Map());
  let steps = 0, title = '';
  const tick = () => { if (++steps >= 2048) { steps = 0; check(); } };
  check();
  for (let i = 0; i < html.length; i++) {
    tick();
    if (html[i] !== '<') continue;
    let nameEnd = i + 1;
    while (nameEnd < html.length && !space(html[nameEnd]) && html[nameEnd] !== '>' && html[nameEnd] !== '/') { tick(); nameEnd++; }
    const name = html.slice(i + 1, nameEnd).toLowerCase();
    let end = nameEnd, quote = '';
    for (; end < html.length; end++) {
      tick();
      const char = html[end];
      if (quote) { if (char === quote) quote = ''; }
      else if (char === '"' || char === "'") quote = char;
      else if (char === '>') break;
    }
    if (end === html.length) break;
    if (name === 'meta') {
      const groups = scanAttributes(html, nameEnd, end, tick);
      groups.forEach((group, index) => {
        for (const [key, value] of group) if (!values[index].has(key)) values[index].set(key, value);
      });
    } else if (name === 'title' && !title) {
      let close = end + 1;
      while (close < html.length && html[close] !== '<') { tick(); close++; }
      if (html.slice(close, close + 8).toLowerCase() === '</title>') title = decodeEntities(html.slice(end + 1, close)).trim();
    }
    i = end;
  }
  check();
  return {values, title};
}

function scanAttributes(html, start, end, tick) {
  // Preserve the old four-pattern priority: property before content, content
  // before property, name before content, content before name; first tag wins.
  const groups = Array.from({length:4}, () => new Map());
  const seen = [new Set(),new Set()];
  let content;
  for (let i = start; i < end;) {
    tick();
    if (space(html[i]) || html[i] === '/') { i++; continue; }
    const begin = i;
    while (i < end && !space(html[i]) && html[i] !== '=') { tick(); i++; }
    const name = html.slice(begin,i).toLowerCase();
    while (i < end && space(html[i])) { tick(); i++; }
    if (html[i] !== '=') continue;
    i++;
    while (i < end && space(html[i])) { tick(); i++; }
    const quote = html[i];
    if (quote !== '"' && quote !== "'") {
      while (i < end && !space(html[i])) { tick(); i++; }
      continue;
    }
    const valueStart = ++i;
    while (i < end && html[i] !== quote) { tick(); i++; }
    if (i === end) break;
    const value = html.slice(valueStart,i++);
    if (name === 'content' && !value.includes('"') && !value.includes("'")) {
      content = value;
      seen.forEach((keys,index) => { for (const key of keys) groups[index * 2].set(key,value); });
    } else if ((name === 'property' || name === 'name') && META_KEYS.has(value.toLowerCase())) {
      const index = name === 'property' ? 0 : 1, key = value.toLowerCase();
      seen[index].add(key);
      if (content !== undefined) groups[index * 2 + 1].set(key,content);
    }
  }
  return groups;
}

function hostName(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return 'Unnamed source';
  }
}
