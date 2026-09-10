---
root: {{domain}}
kitVersion: {{kitVersion}}
---

# {{domain}}

A kit site. Domain folder `sites/{{domain}}/`. `SITE_URL` is `{{siteUrl}}`.

Attach this folder for content work. The Wiser plugin must still be in the workspace to invoke Webmaster or Site Author.

## Collections

Enabled: `pages`, `articles`, `authors`. `sections` and `issues` stay disabled unless stand-up was magazine.

## Content vs code

Agents and content jobs may change `src/content/**`, `public/images/**`, and `public/llms.txt` when SEO Assets writes it.

They may not change `src/components/**`, `src/layouts/**`, `src/pages/**` (routes), `astro.config.mjs`, `package.json`, `package-lock.json`, `src/styles/**` except through a Designer-gated token update, `.github/**`, `KIT.md`, or `kit.json` (Upgrade's).

## Mechanics

`trailingSlash` is `never`. A published slug is not deleted without a `public/_redirects` row. Drafts (`draft: true`) stay out of sitemap, RSS, and the canonical index.

`check` walks `KIT.md` in this folder. It is not a tool.

Never connect the owning Wiser root to a host. No `git init` unless the requester opted in and a human confirmed.
