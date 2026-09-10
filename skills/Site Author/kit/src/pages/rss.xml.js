import rss from '@astrojs/rss';
import { getCollection, getEntry } from 'astro:content';
import kit from '../../kit.json';

export async function GET() {
  const home = await getEntry('pages', 'index');
  if (!home) throw new Error('The index page is required for RSS metadata.');
  const articles = await getCollection('articles', ({ data }) => !data.draft);
  return rss({
    title: home.data.title,
    description: home.data.description,
    site: kit.siteUrl,
    items: articles.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf()).map(({ id, data }) => ({
      title: data.title,
      description: data.description,
      pubDate: data.pubDate,
      categories: data.tags,
      link: `${kit.siteUrl}/articles/${id}`,
    })),
    trailingSlash: false,
  });
}
