import { existsSync } from 'node:fs';
import { getCollection, getEntry } from 'astro:content';
import kit from '../../kit.json';

function pageUrl(id) {
  if (id === 'index') return `${kit.siteUrl}/`;
  return `${kit.siteUrl}/${id}`;
}

export async function GET() {
  const home = await getEntry('pages', 'index');
  if (!home) throw new Error('The index page is required for llms.txt.');
  const pages = (await getCollection('pages', ({ data }) => !data.draft))
    .sort((a, b) => (a.id === 'index' ? -1 : b.id === 'index' ? 1 : a.id.localeCompare(b.id)));
  const articles = kit.collections.articles === false
    ? []
    : (await getCollection('articles', ({ data }) => !data.draft))
        .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
  const events = existsSync(new URL('../content/events/', import.meta.url))
    ? (await getCollection('events', ({ data }) => !data.draft))
        .sort((a, b) => Date.parse(a.data.start) - Date.parse(b.data.start) || a.id.localeCompare(b.id))
    : [];
  const lines = [
    `# ${kit.siteName ?? home.data.title}`,
    '',
    `> ${home.data.description}`,
    '',
    '## Canonical pages',
    '',
    ...pages.map((page) => `- [${page.data.title}](${pageUrl(page.id)}): ${page.data.description}`),
    ...articles.map((article) => `- [${article.data.title}](${kit.siteUrl}/articles/${article.id}): ${article.data.description}`),
    ...events.map((event) => `- [${event.data.title}](${kit.siteUrl}/events/${event.id}): ${event.data.description}`),
    '',
  ];
  return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
