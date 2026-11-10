import { fetchText } from '../lib/fetch.js';
import { decodeEntities, normalizeCandidate } from '../lib/normalize.js';

import { XMLParser } from 'fast-xml-parser';

const ACCEPT = 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8';

export async function collectFeed(source, context) {
  const xml = await fetchText(source.url, ACCEPT, context);
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    updateTag(name) { context.check?.(); return name; },
    tagValueProcessor(_name, value) { context.check?.(); return value; },
    attributeValueProcessor(_name, value) { context.check?.(); return value; },
    isArray() { context.check?.(); return false; }
  });

  context.check?.();
  const items = extractItems(parser.parse(xml));
  context.check?.();
  context.acceptItems?.(items.length);
  const candidates = [];
  for (const item of items) {
    context.check?.();
    // Await each item so an abort never strands promises created by a map.
    candidates.push(await normalizeCandidate(mapItem(item, source), {
      ...context, source, sourceTopics: source.topics || []
    }));
  }
  return candidates;
}

function extractItems(parsed) {
  if (parsed?.rss?.channel?.item) return asArray(parsed.rss.channel.item);
  if (parsed?.feed?.entry) return asArray(parsed.feed.entry);
  return [];
}

function mapItem(item, source) {
  return {
    title: nodeText(item.title),
    url: extractLink(item.link),
    source: source.source || source.name,
    adapter_type: source.type,
    source_role: source.role,
    author: extractAuthor(item),
    published_at: nodeText(item.pubDate || item.published || item.updated || item['dc:date']),
    summary: nodeText(item.description || item.summary),
    content: nodeText(item['content:encoded'] || item.content || item.summary || item.description),
    raw: item
  };
}

function extractLink(link) {
  if (Array.isArray(link)) {
    return extractLink(link.find((entry) => entry?.['@_rel'] === 'alternate') || link[0]);
  }

  if (link && typeof link === 'object') {
    return decodeEntities(link['@_href'] || link.href || link['#text'] || '');
  }

  return decodeEntities(nodeText(link));
}

function extractAuthor(item) {
  const author = item.author || item['dc:creator'] || item.creator;

  if (author && typeof author === 'object') {
    return nodeText(author.name || author.email || author['#text']);
  }

  return nodeText(author);
}

function nodeText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return String(value['#text'] ?? '');
  return String(value);
}

function asArray(value) {
  return Array.isArray(value) ? value : [value];
}
