# Gaps

What this plugin does not do, declared by the primitive that names it.

A gap is a capability this root does not provide that a primitive's own body names as missing (`standards/primitives.md`). This file collects every declared `gaps` entry, by hand, and is corrected whenever a primitive's gaps change.

**This file carries capability gaps only.** What the operator plans to build is a separate record and is not a user's business, so nothing about future work appears here. **A gap names the capability that is missing, never where that capability went.**

Counted 2026-10-10: 46 gaps across 24 primitives. Bullet count: `/usr/bin/grep -E '^- ' wiser/system/GAPS.md | wc -l` returns 46, and the same count derived from the primitives' own `gaps:` frontmatter returns 46. On 2026-10-10, with Playbook Author 0.1.9, its starting-prompt gap was removed because Hand Off now hands over one line, the Playbook's path, whether or not the wrap up follows, and the Playbook carries everything a resume needs. On 2026-10-10, with Cloudflare Pages 0.8.0, the foreign static site gap was removed because the capability shipped, and the gap for switching a Pages project's Web Analytics to another site, or off, was added. On 2026-10-09, with Zone Publisher 0.8.0, its Cloudflare redirect rules API gap was removed because the capability shipped: Single Redirects, Bulk Redirects and five zone settings publish through that skill. Four were added for what that still leaves out: changing rules in phases other than redirects, changing Page Rules, changing Workers routes, Access applications or certificates, and changing zone settings other than SSL mode, Always Use HTTPS, HSTS, minimum TLS version and Automatic HTTPS Rewrites. One was added on Vercel Deploy 0.3.0: add a domain to a Vercel project. On 2026-10-08, with site kit 0.5.0 and Site Author 0.8.0, Site Author's unattended deploy at a scheduled article's go-live instant was removed because the capability shipped: the kit Function publishes a scheduled article at its instant on Cloudflare Pages with no deploy after the one that filed it. Three were added for what that still leaves out: the site's own search before the next build, a host other than Cloudflare Pages or a Wrangler deploy, and scheduled changes beyond the Function's 1.5 MiB budget. Cloudflare Pages' advanced-mode gap now names a foreign site, since a kit site carries the kit's own advanced-mode Function. Four were added on 2026-10-07 with Cloudflare Pages 0.5.0, which deploys a foreign site with Pages Functions and binds its D1 database and declares what that path still leaves out: other bindings, removing a D1 binding, an advanced-mode `_worker.js` site, and a foreign static site with no Functions. One was added on 2026-10-07: Site Author's unattended deploy at a scheduled article's go-live instant, since a deploy always takes a person's approval. One was removed on 2026-10-06 because the capability shipped: Profile Page's Person and ProfilePage structured data on a kit site, now the site kit's `person` declaration (kit 0.4.0). Verify each bullet against its primitive's frontmatter in both directions.

Seven were removed on 2026-09-20 because the capability had shipped and the declaration outlived it: `page-speed readings` on Conversion Advisor and Webmaster, now `google-apis.insights.run`; `keyword research` and `keyword and backlink data source` on Webmaster and `keyword research` on SEO Assets, now `connectors/dataforseo/`; and `automated site crawling` on Webmaster and SEO Assets, now `tools/site-crawl/`. Each primitive's body said the same thing and was corrected with it, which is the half that changes behaviour: an expert that declares a reading absent declines to fetch one it can get.

## Experts

### Knowledge Expert

- hosted-unspecified, so hosted lookup, ingest and export stop before a source is read
- a stated meaning for each typed relation, so a stored link cannot be checked against what its type claims

### IT Expert

- a security review of an infrastructure change, which this expert names as a question and does not answer

### Research Expert

- primary research, the interviews, surveys and experiments no primitive in this root performs

### Ghost Writer

- news-desk judgment on a piece written for a journalist, whether it is a story and what a desk would need from it
- crisis judgment on a piece written during an unfolding incident

### Marketing Strategist

- earned media strategy, reporter targeting, and whether something is a story
- crisis communications judgment

## Skills

### Knowledge Curation

- hosted-unspecified, so hosted lookup, ingest and export stop before a source is read

### Cloudflare Pages

- bindings other than D1 on a Pages project, such as KV, R2, environment variables and secrets
- removing a D1 binding from a Pages project
- a foreign site whose Functions are one advanced-mode _worker.js file rather than a functions/ folder
- switching a Pages project's Web Analytics to another site, or off

### Content Author

- recorded script for podcast, video, or voice-over
- news-desk judgment on a press piece, whether it is a story and what a desk would need from it
- crisis judgment on a statement or Q&A issued during an unfolding incident
- whether a story is worth pitching, and to whom

### Designer

- application screen assembly (dashboard, settings, admin panel)
- brand mark and logo creation

### Funnel Design

- earned media judgment, whether something is a story and who to pitch it to

### Knowledge Recall

- hosted-unspecified, so hosted lookup, ingest and export stop before a source is read

- temporal filtering of recall by a date, so an as-of question is answered from the facts the set dates rather than filtered by the engine

### Knowledge Set Onboarding

- hosted-unspecified, so hosted lookup, ingest and export stop before a source is read


### Marketing Page Design

- news judgment, whether an announcement is a story at all

### Media Generator

- judgment of a generated clip's motion, which no expert in this root carries; the clip is judged by its still frame

### Onboard Root

- judgment on whether a recorded competitor set names a competitor rather than describing one

### Playbook Author

- the trade-offs beside a recommendation at a session stop, so an open decision is put with one course and its reason rather than with the alternatives weighed

### Proposal Author

- news-desk and targeting judgment on a pitch written for a journalist

### Site Author

- a site whose engine is not the shipped kit
- application, authenticated, or database-backed sites
- creating a nested git repository for the site
- a scheduled article in the site's own search before the first build after its instant
- a scheduled article that goes live at its instant on a host other than Cloudflare Pages, or through a Wrangler deploy
- every scheduled article carried at once when their pages exceed the kit Function's 1.5 MiB budget

### Speech Writing

- crisis judgment on remarks delivered during an unfolding incident

### Typography Design

- right-to-left and CJK typography, which need script-specific knowledge this skill does not carry

### Vercel Deploy

- read or modify environment variables
- delete a Vercel project
- add a domain to a Vercel project

### Zone Publisher

- changing rules in phases other than redirects
- changing Page Rules
- changing Workers routes, Access applications or certificates
- changing zone settings other than SSL mode, Always Use HTTPS, HSTS, minimum TLS version and Automatic HTTPS Rewrites

## Tools

### knowledge-memory

- hosted-unspecified, so hosted lookup, ingest and export stop before a source is read

- temporal filtering of recall by a date, so an as-of question is answered from the facts the set dates rather than filtered by the engine

### Transcribe Audio

- Speaker labeling, which would say which speaker said each turn
