import { fetchText } from '../lib/fetch.js';
import { decodeEntities, normalizeCandidate } from '../lib/normalize.js';

const ACCEPT = 'text/html, application/xhtml+xml, */*;q=0.8';

export async function collectUrl(source, context) {
  const html = await fetchText(source.url, ACCEPT, context);

  return [normalizeCandidate(extractMetadata(html, source.url, source), {
    ...context,
    source,
    sourceTopics: source.topics || []
  })];
}

export async function collectManualUrls(source, context) {
  const candidates = [];
  const errors = [];

  for (const url of source.urls || []) {
    try {
      const [candidate] = await collectUrl({ ...source, type: 'url', url }, context);
      candidates.push(candidate);
    } catch (error) {
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

function extractMetadata(html, url, source) {
  return {
    title: meta(html, 'og:title') || meta(html, 'twitter:title') || titleTag(html) || url,
    url,
    source: source.source || source.name || hostName(url),
    adapter_type: source.type,
    source_role: source.role,
    author: meta(html, 'author') || meta(html, 'article:author'),
    published_at: meta(html, 'article:published_time') || meta(html, 'date') || meta(html, 'pubdate'),
    summary: meta(html, 'og:description') || meta(html, 'twitter:description') || meta(html, 'description'),
    content: '',
    raw: { extracted_meta: true }
  };
}

function meta(html, key) {
  const escaped = escapeRegex(key);
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${escaped}["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${escaped}["'][^>]*>`, 'i')
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return decodeEntities(match[1]);
  }

  return '';
}

function titleTag(html) {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match ? decodeEntities(match[1]).trim() : '';
}

function hostName(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return 'Unnamed source';
  }
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
