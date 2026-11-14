# Gaps

What this plugin does not do, declared by the primitive that names it.

A gap is a capability this root does not provide that a primitive's own body names as missing (`standards/primitives.md`). This file collects every declared `gaps` entry, by hand, and is corrected whenever a primitive's gaps change.

**This file carries capability gaps only.** What the operator plans to build is a separate record and is not a user's business, so nothing about future work appears here. **A gap names the capability that is missing, never where that capability went.**

Counted 2026-11-13: 48 gaps across 29 primitives. The count and each bullet are checked against the primitives' own `gaps:` frontmatter in both directions. Historical count and change records predating this cleanup are preserved in `CHANGELOG.md` under Historical gap counts.

Seven were removed on 2026-09-20 because the capability had shipped and the declaration outlived it: `page-speed readings` on Conversion Advisor and Webmaster, now `google-apis.insights.run`; `keyword research` and `keyword and backlink data source` on Webmaster and `keyword research` on SEO Assets, now `connectors/dataforseo/`; and `automated site crawling` on Webmaster and SEO Assets, now `tools/site-crawl/`. Each primitive's body said the same thing and was corrected with it, which is the half that changes behaviour: an expert that declares a reading absent declines to fetch one it can get.

## Experts

### Knowledge Expert

- hosted-unspecified, so hosted lookup, ingest and export stop before a source is read
- a stated meaning for each typed relation, so a stored link cannot be checked against what its type claims

### IT Expert

- a security review of an infrastructure change, which this expert names as a question and does not answer

### Publisher

- producing a print interior with bleed
- producing a print cover with its spine

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

### Bio Sketch

- reading a contacts database or a professional network that needs a sign-in; their values arrive only as supplied records, or through the owning root's own navigation notes on its own session

### Animated Explainer

- in a video, a motion on an element with no timed element at or above it, which the render clock leaves to the browser's clock and names in the console
- placing an explainer bundle into a site's implementation, which is handed over with placement instructions and never placed by this skill

### Build Brand

- naming a brand
- trademark search
- brand mark and logo creation

### Cloudflare Setup

- a token link for installing an app on Cloudflare Workers, its staff sign-in included

### Content Author

- recorded script for podcast, video, or voice-over
- news-desk judgment on a press piece, whether it is a story and what a desk would need from it
- crisis judgment on a statement or Q&A issued during an unfolding incident
- whether a story is worth pitching, and to whom

### Designer

- application screen assembly (dashboard, settings, admin panel)
- brand mark and logo creation
- authored motion graphics made outside a page or slide, such as a title sequence; an explainer rendered to a video is `skills/Animated Explainer/`'s

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

### Prior Art Check

- patent search, so prior work that exists only in patents is not found
- a scholarly index with citation links, so academic prior work is found through web search's paper results only

### Proposal Author

- news-desk and targeting judgment on a pitch written for a journalist

### Set Up Book

- producing a print interior with bleed

### Speech Writing

- crisis judgment on remarks delivered during an unfolding incident

### Typography Design

- right-to-left and CJK typography, which need script-specific knowledge this skill does not carry

### Zone Publisher

- changing rules in phases other than redirects
- changing Page Rules
- changing Workers routes, Access applications or certificates
- changing zone settings other than SSL mode, Always Use HTTPS, HSTS, minimum TLS version, Automatic HTTPS Rewrites, Email Obfuscation and Browser Cache TTL
- turning DNSSEC on for a zone

## Tools

### knowledge-memory

- hosted-unspecified, so hosted lookup, ingest and export stop before a source is read

- temporal filtering of recall by a date, so an as-of question is answered from the facts the set dates rather than filtered by the engine

### Screen Capture

- Desktop capture and redaction on Windows and Linux

### Transcribe Audio

- Speaker labeling, which would say which speaker said each turn

### video-render

- rendering on Windows or Linux, which no run has tested
