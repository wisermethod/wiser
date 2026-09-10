---
domain: {{domain}}
kitVersion: {{kitVersion}}
---

# {{domain}}

This site envelope wraps the kit in `site/`. Its origin is `{{siteUrl}}`. It is not a Wiser root, has no constitution of its own, and does not run Onboard Root.

Attach this envelope for content work, with the Wiser plugin and owning root available for the instruction chain and inherited keys.

## Provides

{{provides}}

These local keys overlay the owning root's Provides. Stand-up copies available owning-root memory, then the skill asks what changes, if anything. Missing or unavailable local keys fall back to the owning root; say when that happens.

## Layout

| Path | Holds |
|------|-------|
| `memory/` | Site about, voice, and design bound above |
| `site/` | Kit tree and host payload |
| `builds.md` | This site's planned-change roster |
| `<does-this-thing>.playbook.md` | A plan for this site, per `standards/playbook.md` |
| `zArchive/` | Envelope recovery, per `standards/conventions.md` |

## Content vs code

Content jobs may change `site/src/content/**` and `site/public/images/**`. SEO Assets may write `site/public/llms.txt`. A changed published slug needs a `site/public/_redirects` row and Webmaster Job 3 before publish.

Content jobs may not change `site/src/components/**`, `site/src/layouts/**`, `site/src/pages/**`, `site/astro.config.mjs`, `site/package.json`, `site/package-lock.json`, `site/src/styles/**` except a Designer-gated token update, `site/.github/**`, `site/KIT.md`, or `site/kit.json`. Load `site/KIT.md` for collection schemas, required frontmatter, and SEO mechanics.

## Check and preview

Invoke Site Author Check on this envelope; it walks `site/` against `site/KIT.md`. Run `npm install` and `npm run dev` in `site/`. Report the check result and served-HTML verification before stand-up is done.

## Publish boundary

Host payload is `site/` or `site/dist/`. Never connect this envelope or the owning root to a host. Envelope `memory/` never rides to a host. Site Author does not publish or run `git init`; the host skill takes the kit folder, and Webmaster Job 3 gates publish.
