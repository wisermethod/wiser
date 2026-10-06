import { existsSync } from 'node:fs';
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
    showTitle: z.boolean().optional(),
    listArticles: z.boolean().optional(),
    listEvents: z.boolean().optional(),
    image: text.optional(),
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
    heroAlt: text.optional(),
  }),
});
const authors = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/authors' }),
  schema: z.object({ name: text, description: text.optional(), url: z.string().url().optional(), type: z.enum(['Person', 'Organization']).optional() }),
});
const sections = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/sections' }),
  schema: metadata,
});
const issues = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/issues' }),
  schema: metadata.extend({ pubDate: date }),
});

const line = z.object({
  from: z.enum(['member', 'assistant', 'status']),
  text,
}).strict();
const savedFile = z.object({
  name: text,
  folder: text.optional(),
}).strict();
const moment = z.object({
  caption: text.optional(),
  lines: z.array(line).min(1),
  files: z.array(savedFile).optional(),
}).strict();
const conversations = defineCollection({
  loader: glob({ pattern: '**/*.{yaml,yml,json}', base: './src/content/conversations' }),
  schema: z.object({
    title: text,
    window: text.optional(),
    folder: text,
    people: z.object({ member: text, assistant: text }).strict(),
    moments: z.array(moment).min(1),
    notice: z.object({
      title: text.optional(),
      text,
      after: z.number().int().min(1),
    }).strict().optional(),
    timing: z.object({
      line: z.number().positive().optional(),
      moment: z.number().positive().optional(),
    }).strict().optional(),
  }).strict().superRefine((data, ctx) => {
    if (data.notice && data.notice.after > data.moments.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['notice', 'after'],
        message: `notice.after ${data.notice.after} is beyond the ${data.moments.length} moments`,
      });
    }
  }),
});

// A declared collection whose folder is missing makes every build warn. Upgrade never creates content folders, so declare these only when the folder is already there.
const hasConversations = existsSync(new URL('./content/conversations/', import.meta.url));
const hasEvents = existsSync(new URL('./content/events/', import.meta.url));
// Quoted, the value is text and must carry its offset. Unquoted, YAML has already read it as an instant, offset applied; check holds the source to an offset either way.
const offsetInstant = z.union([
  z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/, 'a date and time with an offset, such as 2026-10-15T18:00:00-06:00'),
  z.date().transform((date) => date.toISOString()),
]).refine((value) => Number.isFinite(Date.parse(value)), 'a real date and time');

function eventsCollection() {
  return defineCollection({
    loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/events' }),
    schema: metadata.extend({
      start: offsetInstant,
      end: offsetInstant.optional(),
      timezone: text,
      location: text.optional(),
      online: z.literal(true).optional(),
      signup: z.string().url().refine((value) => value.startsWith('https://'), { message: 'signup must be an https:// URL' }).optional(),
      draft: z.boolean().default(false),
    }).strict().superRefine((data, ctx) => {
      if ((data.online === true) === (data.location !== undefined)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'set location or online: true, and not both', path: ['location'] });
      }
      if (data.end && Date.parse(data.end) <= Date.parse(data.start)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'end must be after start', path: ['end'] });
      }
      try { Intl.DateTimeFormat('en-US', { timeZone: data.timezone }); }
      catch { ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'timezone must be an IANA name, such as America/Denver', path: ['timezone'] }); }
    }),
  });
}

export const collections = {
  pages,
  articles,
  authors,
  ...(kit.collections.sections ? { sections } : {}),
  ...(kit.collections.issues ? { issues } : {}),
  ...(hasConversations ? { conversations } : {}),
  ...(hasEvents ? { events: eventsCollection() } : {}),
};
