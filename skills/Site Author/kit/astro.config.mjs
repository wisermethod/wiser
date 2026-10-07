import { readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
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

// A page a site hides with noindex: true carries this robots meta, which the layout writes. When any page sets it, the sitemap reads each built page and leaves those out.
const HIDDEN_META = '<meta name="robots" content="noindex, nofollow">';
function anyHiddenPage() {
  const walk = (dir) => {
    let names;
    try { names = readdirSync(dir); } catch { return false; }
    return names.some((name) => {
      const file = `${dir}/${name}`;
      if (statSync(file).isDirectory()) return walk(file);
      if (!/\.(md|mdx)$/.test(name)) return false;
      const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(file, 'utf8'));
      return Boolean(front && /^[ \t]*["']?noindex["']?[ \t]*:/m.test(front[1]));
    });
  };
  return walk(fileURLToPath(new URL('./src/content/pages', import.meta.url)));
}
const hidesPages = anyHiddenPage();
function builtPageHidden(page) {
  const pathname = decodeURIComponent(new URL(page).pathname).replace(/\/+$/, '');
  const file = fileURLToPath(new URL(`./dist${pathname === '' ? '/index' : pathname}.html`, import.meta.url));
  try { return readFileSync(file, 'utf8').includes(HIDDEN_META); } catch { return false; }
}
const sitemapFilter = (page) => (articlesOn || !page.endsWith('/rss.xml')) && !(hidesPages && builtPageHidden(page));

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
  // Two routes writing one address fail the build, rather than one being dropped with a warning.
  prerenderConflictBehavior: 'error',
  // A route builds as <slug>.html, which Cloudflare Pages and most static hosts serve at the slashless URL;
  // the default <slug>/index.html is redirected to a trailing slash, contradicting the canonical.
  build: { format: 'file' },
  // Drafts have no generated routes, so sitemap and Pagefind cannot include them.
  // sitemap() with no options when articles are on, so that build matches a site that never set a filter.
  integrations: [
    mdx(),
    articlesOn && !hidesPages ? sitemap() : sitemap({ filter: sitemapFilter }),
    pagefind(),
    dropRssWhenArticlesOff(),
  ],
  vite: { plugins: [tailwindcss()] },
});
