# Site Kit A contract

`check` walks this file. It is not a tool. Every file in the kit exists to satisfy a line here. Copy this file into `kit/KIT.md` beside the Astro tree. Expand later copies the proven tree into `wiser/skills/Site Author/kit/`.

Prep copy, 2026-09-09, taken from `playbooks/Webmaster.playbook.md` Context. If that subsection and this file disagree, the Playbook Context wins until Solve reconciles them.

## Engine (v1)

Astro, MIT, static by default. Markdown for articles. MDX allowed where a page needs one island. Tailwind CSS plus `@tailwindcss/typography`. Content Collections with typed schemas. Official sitemap and RSS integrations. Pagefind. One layout. One `src/styles/tokens.css`. Copy-paste islands only where needed; no shadcn library in v1.

## Not v1

Next.js as primary. Astro SSR / authenticated areas. A Node API, queue, or database. Payload / Sanity / Strapi. Tina. Vercel as the kit default. Nested git as default.

## kit.json

Required at the kit-folder root, the envelope's `site/`. Invoke `check` on the envelope; it walks `site/`. Schema:

```json
{
  "kitVersion": "0.1.0",
  "domain": "example-a.test",
  "siteUrl": "http://127.0.0.1:4321",
  "collections": {
    "pages": true,
    "articles": true,
    "authors": true,
    "sections": false,
    "issues": false
  }
}
```

`siteUrl` is required at stand-up, no trailing path, no trailing slash. Solve uses `http://127.0.0.1:4321` on the site being fetched so canonical and OG match the preview. `kitVersion` is this contract's version. `check` fails if it disagrees with this file's current version.

## Required SEO slots

Stand-up fails `check` without every row.

| Slot | Where it lives |
|------|----------------|
| `SITE_URL` | `kit.json` `siteUrl`, required at stand-up, no trailing path |
| Title | per-page frontmatter, unique, emitted in `<title>` |
| Meta description | per-page frontmatter, required, emitted as `meta name="description"` |
| Canonical | `SITE_URL` + path, `trailingSlash: 'never'` in the kit, sites do not change this |
| Open Graph | `og:title`, `og:description`, `og:type`, `og:url`; `og:image` from article hero or `public/images/og-default.png` |
| JSON-LD | WebSite + Organization on every page (Organization facts from bound `about` or omitted and labelled, never invented); Article on article routes |
| `robots.txt` | emitted at `/robots.txt` from `kit.json` `siteUrl` (not a static `public/` file) |
| `llms.txt` | emitted at `/llms.txt`, canonical pages only, URLs from `kit.json` `siteUrl` |
| Sitemap | Astro sitemap integration, drafts excluded |
| RSS | articles collection; omitted by `check` only when articles are disabled |
| Redirects | `public/_redirects`; a published slug is not deleted without a row |
| Drafts | `draft: true` excluded from sitemap, RSS, and canonical index |

A missing description in frontmatter fails `check` rather than shipping an empty meta tag. Empty `pubDate` on an article fails `check`.

## Content vs code

| Agents and content jobs may change | They may not |
|---|---|
| `src/content/**` | `src/components/**`, `src/layouts/**`, `src/pages/**` (routes) |
| `public/images/**` | `astro.config.mjs`, `package.json`, `package-lock.json` |
| `public/llms.txt` when SEO Assets writes it | `src/styles/**` except through a Designer-gated token update |
| | `.github/**`, `KIT.md` copies, `kit.json` (Upgrade's) |

A request to add a component or edit `astro.config.mjs` is refused. A request to add `src/content/articles/hello.md` with required frontmatter succeeds.

## Collections

`pages`, `articles`, `authors` always in the schema. `sections` / `issues` exist in the schema and stay disabled unless stand-up is magazine. A brochure and a magazine are one kit.

## Frontmatter for articles

`title`, `description`, `pubDate`, `author`, `tags`, `draft`. Hero image optional.

## Replication, check, upgrade

`check` compares `kitVersion` to this file, and **fails if a `.git` exists in the envelope or kit folder** (nested git is never the silent default). Fail if any required SEO slot is missing.

`upgrade` archives every kit-owned file it will replace, per `standards/conventions.md` (a `zArchive/` next to the file, unless that root declares git history as recovery **and** the site is in a committed current repo), then copies kit code files over and refuses to merge content. Two sites on the same `kitVersion` are maintainable as a class; a site that failed `check` is a foreign site until it is upgraded or declared foreign.

Paths in this contract are relative to `site/`. Envelope `AGENTS.md`, `memory/`, `builds.md`, and Playbooks are outside Upgrade. Kit-owned means everything except `src/content/**` and `public/images/**`. Those two trees stay byte-identical across Upgrade.

## Git and hosting

Content is file-backed, not CMS-backed. Git is optional plumbing, not the content model. **Never connect the envelope or owning Wiser root to a host.** Host payload is `site/` or `site/dist/`; envelope `memory/` stays local.

No `git init` by default. The kit writes a site `.gitignore` (`node_modules/`, `dist/`, `.astro/`). A site with no git is not a failed stand-up.

Live host is not this contract. Load `skills/Cloudflare Pages/` or `skills/Vercel Deploy/` for upload of the kit folder only.

## Optional kit furniture, not jobs

`public/admin/` for Sveltia. Commented `CODEOWNERS`. A path-guard workflow. None are required to pass `check`.

## System dependencies

Node 22.12 or newer (Astro 7's floor). The 2026-09-08 Playbook said 18; current stable Astro 7.3.2 requires `>=22.12.0`. The host runs `npm install` and `npm run dev` in the envelope's `site/` folder. Not wrapped as a Wiser tool.

## Stand-up rules this contract encodes

- Owning root `AGENTS.md` must declare `sites/`. Otherwise stop and name the missing declaration.
- Domain folder is an envelope at `sites/<domain>/`, or `work/<slug>/sites/<domain>/` when it dies with existing work. The root and that work subject must declare `sites/`. The host is lowercase, no scheme, no `www` unless `www` is a distinct property. The kit lives in `site/`.
- A current envelope has `site/kit.json`. A domain-folder `kit.json` without it is the Milestone 1 to 3 shape: wrap to envelope, or declare foreign. Neither file means foreign. Stand-up refuses all existing folders and leaves them untouched.
- Do not `git init`.
- First-party kit only. No vendored theme (not AstroWind, not AstroPaper, not a named magazine starter).

## How `check` walks this file

1. Invoke Check on the envelope. Confirm the envelope and kit folder have no nested `.git`; walk `site/` for steps 2 to 5.
2. Read `kit.json`. `kitVersion` matches this file. `siteUrl` has no trailing path or slash.
3. Confirm `trailingSlash: 'never'` in the Astro config.
4. Confirm collections schema includes `pages`, `articles`, `authors`, and disabled `sections` / `issues` unless magazine.
5. For every content file in `pages` and `articles`, required frontmatter is present. Articles: `title`, `description`, `pubDate`, `author`, `tags`, `draft`.
6. After `npm run dev` or `build` plus preview, fetch `/`, one article route, sitemap, RSS (if articles enabled), `/llms.txt`, `/robots.txt`. Homepage `<head>` carries title, meta description, canonical, `og:title`, `og:description`, `og:url`, JSON-LD WebSite + Organization. Canonical and `og:url` use `kit.json` `siteUrl`. Article route additionally carries Article JSON-LD. Drafts are absent from sitemap, RSS, and canonical index.
