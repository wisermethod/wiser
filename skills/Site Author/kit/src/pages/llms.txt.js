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
  const articles = (await getCollection('articles', ({ data }) => !data.draft))
    .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
  const lines = [
    `# ${home.data.title}`,
    '',
    `> ${home.data.description}`,
    '',
    '## Canonical pages',
    '',
    ...pages.map((page) => `- [${page.data.title}](${pageUrl(page.id)}): ${page.data.description}`),
    ...articles.map((article) => `- [${article.data.title}](${kit.siteUrl}/articles/${article.id}): ${article.data.description}`),
    '',
  ];
  return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
