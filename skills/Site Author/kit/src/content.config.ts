import { defineCollection, reference } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import kit from '../kit.json';

const text = z.string().trim().min(1);
const date = z.union([text, z.date()]).pipe(z.coerce.date());
const metadata = z.object({ title: text, description: text });
const pages = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/pages' }),
  schema: metadata.extend({
    draft: z.boolean().default(false),
    // Only the about page may supply organization facts to the layout.
    organization: z.object({
      name: text,
      url: z.string().url().optional(),
      logo: text.optional(),
      description: text.optional(),
      sameAs: z.array(z.string().url()).optional(),
    }).optional(),
  }),
});
const articles = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/articles' }),
  schema: metadata.extend({
    pubDate: date,
    author: reference('authors'),
    tags: z.array(text),
    draft: z.boolean(),
    hero: text.optional(),
  }),
});
const authors = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/authors' }),
  schema: z.object({ name: text, description: text.optional(), url: z.string().url().optional() }),
});
const sections = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/sections' }),
  schema: metadata,
});
const issues = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/issues' }),
  schema: metadata.extend({ pubDate: date }),
});

export const collections = {
  pages,
  articles,
  authors,
  ...(kit.collections.sections ? { sections } : {}),
  ...(kit.collections.issues ? { issues } : {}),
};
