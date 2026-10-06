import { getCollection, getEntry } from 'astro:content';
import kit from '../../kit.json';

function pageUrl(id) {
  if (id === 'index') return `${kit.siteUrl}/`;
  return `${kit.siteUrl}/${id}`;
}

// A site's own llms.txt is src/content/llms.txt, served here byte for byte. This route stays the one producer of /llms.txt, so nothing collides with it.
const ownFile = Object.values(import.meta.glob('../content/llms.txt', { query: '?raw', import: 'default', eager: true }))[0];

export async function GET() {
  if (typeof ownFile === 'string') return new Response(ownFile, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  const home = await getEntry('pages', 'index');
  if (!home) throw new Error('The index page is required for llms.txt.');
  const pages = (await getCollection('pages', ({ data }) => !data.draft))
    .sort((a, b) => (a.id === 'index' ? -1 : b.id === 'index' ? 1 : a.id.localeCompare(b.id)));
  const articles = kit.collections.articles === false
    ? []
    : (await getCollection('articles', ({ data }) => !data.draft))
        .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
  const events = Object.keys(import.meta.glob('../content/events/**/*.{md,mdx}')).length > 0
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
