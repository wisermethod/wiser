import { readFileSync } from 'node:fs';
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

export default defineConfig({
  site: kit.siteUrl,
  output: 'static',
  trailingSlash: 'never',
  // Drafts have no generated routes, so sitemap and Pagefind cannot include them.
  integrations: [mdx(), sitemap(), pagefind()],
  vite: { plugins: [tailwindcss()] },
});
