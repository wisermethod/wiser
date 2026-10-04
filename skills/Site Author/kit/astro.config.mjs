import { readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import pagefind from 'astro-pagefind';
import tailwindcss from '@tailwindcss/vite';

const kit = JSON.parse(readFileSync(new URL('./kit.json', import.meta.url), 'utf8'));
const site = new URL(kit.siteUrl);
if (!['http:', 'https:'].includes(site.protocol) || site.origin !== kit.siteUrl) {
  throw new Error('kit.json siteUrl must be an HTTP(S) origin without a path or trailing slash.');
}

const articlesOn = kit.collections.articles !== false;

// The route file stays put: Upgrade copies kit files and never deletes one, so renaming rss.xml.js would leave the old route behind. When articles are off, drop the built file instead.
function dropRssWhenArticlesOff() {
  return {
    name: 'drop-rss-when-articles-off',
    hooks: {
      'astro:build:done': ({ dir }) => {
        if (articlesOn) return;
        const base = dir.href.endsWith('/') ? dir : new URL(`${dir.href}/`);
        rmSync(fileURLToPath(new URL('rss.xml', base)), { force: true });
      },
    },
  };
}

export default defineConfig({
  site: kit.siteUrl,
  output: 'static',
  trailingSlash: 'never',
  // A route builds as <slug>.html, which Cloudflare Pages and most static hosts serve at the slashless URL;
  // the default <slug>/index.html is redirected to a trailing slash, contradicting the canonical.
  build: { format: 'file' },
  // Drafts have no generated routes, so sitemap and Pagefind cannot include them.
  // sitemap() with no options when articles are on, so that build matches a site that never set a filter.
  integrations: [
    mdx(),
    articlesOn ? sitemap() : sitemap({ filter: (page) => !page.endsWith('/rss.xml') }),
    pagefind(),
    dropRssWhenArticlesOff(),
  ],
  vite: { plugins: [tailwindcss()] },
});
