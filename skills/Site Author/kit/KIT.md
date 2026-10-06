# Site Kit A contract

`check` walks this file. It is not a tool. Every file in the kit exists to satisfy a line here. Copy this file into `kit/KIT.md` beside the Astro tree. Expand later copies the proven tree into `wiser/skills/Site Author/kit/`.

Prep copy, 2026-09-09, from the Webmaster Playbook Context. This file is the live contract. `check` walks it.

## Engine (v1)

Astro, MIT, static by default. Markdown for articles. MDX where a page places a kit component (see Kit components). Tailwind CSS plus `@tailwindcss/typography`. Content Collections with typed schemas. Official sitemap and RSS integrations. Pagefind. One layout, whose options a site chooses in `kit.json` (see Layout options). One `src/styles/tokens.css`. No shadcn library in v1.

## Not v1

Next.js as primary. Astro SSR / authenticated areas. A Node API, queue, or database. Payload / Sanity / Strapi. Tina. Vercel as the kit default. Nested git as default.

## kit.json

Required at the kit-folder root, the envelope's `site/`. Invoke `check` on the envelope; it walks `site/`. Schema:

```json
{
  "kitVersion": "0.4.0",
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

`siteUrl` is required at stand-up, no trailing path, no trailing slash. Solve uses `http://127.0.0.1:4321` on the site being fetched so canonical and OG match the preview. `kitVersion` is this contract's version. Which values `check` accepts, and what an earlier site fails for, is Replication, check, upgrade.

`nav` and `footer` are optional site-owned keys, like `domain`, `siteUrl`, and `collections`, and Upgrade preserves them. The template does not set them. Each, when present, is an array of `{ "label": string, "href": string }`: `label` a non-empty string, `href` a string starting with `/` (a site path), `https://`, or `mailto:`. `check` fails a present key that is not that array. A content job may change them; Content vs code below lists every `kit.json` key a content job may change, and `collections.articles` is among them only on the requester's ask. Absent `nav` leaves the header as Home and RSS. Absent `footer` renders no footer.

`siteName`, also optional and site-owned, is a non-empty string naming the site. When set, it is the `WebSite` name in the JSON-LD, the RSS channel title and the `llms.txt` heading; when absent, those use the index page's title, as before.

`icon`, also optional and site-owned, is an `/images/` path whose file is in `public/images/`, by the same rules as `layout.header.brand.logo`. When set, the layout emits `<link rel="icon" href="...">` in the head. Absent, it emits no icon link, and the page is unchanged. `check` fails any other path, or a path whose file is missing.

`lang`, also optional and site-owned, is a language tag: letters, then hyphen-separated letters or digits, such as `en`, `en-GB` or `pt-BR`. When set, it is the `<html lang>` value. Absent, that value is `en`. `check` fails any other shape. Upgrade preserves `icon` and `lang`, as it preserves `siteName`.

`blog`, also optional and site-owned, is an object of article-list options. Absent, article pages and article lists stay as they were at 0.3.0. Blog below defines each key. `check` fails an unknown key or a bad value, and a site below 0.4.0 that sets `blog`. Upgrade preserves `blog`.

`layout`, also optional and site-owned, holds the site's layout options; Layout options below defines it. A `nav` item may carry `"style": "button"`, which renders that link as a button-style pill when `layout` is present and is ignored when it is absent; `check` fails any other `style` value.

Every `collections` value is `true` or `false`, and `check` fails any other. `collections.articles` must be present: the routes read a missing key as on, so `check` fails a `kit.json` without it rather than give a site articles nobody chose. `collections.articles` set to `false` turns articles off: no article routes are built even if article files exist, no `rss.xml`, no RSS link in any page's head, `llms.txt` lists no articles, no page lists articles, and the header with no `nav` shows Home only. `check` fails a published article (one without `draft: true`) while articles are off.

## Layout options

Every option is chosen by the site, and every option is absent by default. **Absent means the 0.1.0 page**: a site that sets no `layout` key and none of the page keys below builds the same HTML it built at 0.1.0. Site Author's Stand up offers these choices before a site is built; a content job may change them afterwards on the requester's ask.

```json
"layout": {
  "width": "wide",
  "sections": "bands",
  "header": {
    "brand": { "text": "Example", "logo": "/images/logo.svg" },
    "sticky": false,
    "menu": "button"
  }
}
```

| Key | Values | Missing | What it does |
|-----|--------|---------|--------------|
| `width` | `narrow`, `wide` | `narrow` | `narrow` is the 48rem column. `wide` sets the page to `--page-width` (80rem) and keeps one reading column of `--measure` (65ch), measured at the body text size and centred, with the gutter on a phone. Every block outside a `<section>`, the layout's own `<h1>` and a `not-prose` block included, sits in that column. Running text that is a direct child of a section (paragraphs, lists, headings, quotes, code, rules and tables) sits in it; every other block in a section, text inside a nested wrapper included, uses the page width, and joins the column with `mx-auto max-w-(--kit-reading-width)`. A section is how a block spans the page. The column is measured once through CSS `@property`, which Chrome 85, Safari 16.4 and Firefox 128 support; an older browser sizes each element's column at its own font size, as 0.2.0 did |
| `sections` | `column`, `bands` | `column` | `bands` makes every `<section>` that is a direct child of the page's content span the full window, flush with its neighbours, its contents at the page width. Its colour is the section's own, for example a colour class on the `<section>`. `column` keeps sections in the column |
| `header.brand` | `{ "text", "logo" }`, either or both | none | A link home at the start of the header: the logo image, the text, or both. `logo` is a `/images/` path, with no query or fragment, whose file is in `public/images/`. A logo with no text takes `siteName`, or the index page's title, as its accessible name |
| `header.sticky` | `true`, `false` | `false` | The header stays at the top of the window while the page scrolls, on an opaque background; anchor jumps and focused elements land below it |
| `header.menu` | `links`, `button` | `links` | `button` collapses the links behind a Menu control below 48rem; a `nav` item with `"style": "button"` stays beside the control, outside the menu. No script |

Any `layout` key, even `{}`, switches the header and footer to a full-width bar with their links in an inner container at the page width. `check` fails an unknown key, an unknown value, a logo path outside `/images/` or whose file is missing, and a brand with neither `text` nor `logo`.

Two page frontmatter keys, both optional booleans:

- `showTitle: false`: the layout prints no `<h1>`, and the page's body writes its own, so a homepage can carry a designed headline. The title still fills `<title>` and `og:title`. `check` fails such a page unless its source has exactly one `<h1>`, counting `#` and underlined headings and `<h1>` tags outside code and comments; an `<h1>` that only an MDX expression decides is counted as written, and step 6 counts the rendered page.
- `listArticles`: `true` lists the site's published articles after the page's content. Each item is its own block, with no bullet: the title as a link at a 44px target, the description, and the date written out in full. The list is spaced as its own block rather than a band. It reads `--list-spacing` (the space above the list, 1.5rem), `--list-gap` (between items, 2rem) and `--list-title-size` (1.375rem), each in `tokens.css` with that fallback. `false` lists none. Missing: the index page lists them under an "Articles" heading, as at 0.1.0, and no other page does. A page that lists articles is how a site gets an articles page, at whatever address and under whatever title it chooses. A page whose id is `articles` builds `articles.html` beside the `articles/` routes; Vercel serves it at `/articles`, and Cloudflare Pages has not been verified, so prefer another name.

Every role and spacing token the kit layers read carries the kit's default as a fallback, so a site whose `@theme` block predates a token, which Upgrade keeps, renders as the kit intends. The options' styles live in `src/styles/tokens.css`, below the `@theme` block, each reading its tokens with a fallback: `--page-width`, `--measure`, `--logo-height`, `--header-background`, `--sticky-offset`, `--nav-button-background`, `--nav-button-ink`, `--nav-button-hover-ring`, `--nav-button-active-background`, `--nav-button-active-ink`, `--band-padding`, `--text-prose-weight`, `--prose-leading`, `--list-spacing`, `--list-gap`, `--list-title-size`. `--prose-leading` is the line height of running text; missing, it is the typography plugin's 1.75, so a site that never sets it renders as before. A token update may set any of them in the `@theme` block. `--measure` is a length or a percentage, such as `65ch`; `check` fails a keyword, such as `auto` or `max-content`, and a bare number other than 0, and does not evaluate an expression, so `calc()` and `var()` values are the token update's to get right. On a wide page the layout sets `--kit-reading-width` to the measure resolved at the body text size; content may read it, for example `mx-auto max-w-(--kit-reading-width)` on a block inside a section, and a token update does not set it. A token must be read by a rule in `tokens.css` to reach the page: Tailwind drops a theme variable nothing in that file reads.

## Kit components

`src/components/index.js` exports the components a content file may place without importing anything; the page and article routes pass them to the page body. A content job places one in an `.mdx` file and writes its data as content. Components are kit code: Upgrade replaces them and a content job never edits them.

| Component | Place it as | Its data |
|-----------|-------------|----------|
| `ConversationPlayer` | `<ConversationPlayer id="<name>" />` | `src/content/conversations/<name>.yaml`, `.yml` or `.json` |
| `Video` | `<Video youtube="<id>" title="..." />`, or `vimeo`, or `src` | the title, and exactly one source |
| `Faq` | `<Faq q="Question">Answer</Faq>` | the question and the answer; no data file |

A conversation's file name is its id: lowercase letters, digits and hyphens, ending `.yaml`, `.yml` or `.json`, directly in `src/content/conversations/` with no subfolders. `check` fails any other name or place, because Astro would give the file a different id than the one written, or give two files one id.

`ConversationPlayer` plays a scripted conversation in a small app window, one moment at a time, with a folder panel where files appear as they are saved, an optional notice shown once, and Pause and Replay controls. It starts when scrolled into view and pauses when scrolled away. With reduced motion, or with no script, the whole conversation shows still. The full transcript is always in the page for assistive technology. Its schema:

```yaml
title: "A session, shortened"     # required: the player's accessible name
window: "Assistant"               # optional: title-bar text; defaults to title
folder: "Client folder"           # required: the folder panel's heading
people:
  member: "Dana"                  # required
  assistant: "Assistant"          # required
moments:                          # required, at least one
  - caption: "Before starting"    # optional
    lines:                        # required, at least one
      - from: member              # member, assistant, or status
        text: "Plain text, never HTML"
    files:                        # optional: saved during this moment
      - name: "proposal.pdf"
        folder: "proposals"       # optional
notice:                           # optional, shown once per page view
  title: "New"                    # optional
  text: "..."
  after: 2                        # the moment, counted from 1, after which it shows
timing:                           # optional, milliseconds
  line: 1600
  moment: 3000
```

Its styles read `--player-surface`, `--player-ink`, `--player-member`, `--player-member-ink`, `--player-assistant`, `--player-chrome`, `--player-folder`, `--player-radius`, `--player-height`, `--player-width`, `--player-text`, `--player-focus`, `--player-button-hover-ring`, `--player-button-active-background` and `--player-button-active-ink`, each with a fallback. The colour fallbacks are a light window of the player's own, white with near-black ink, whatever the page's ground; a site whose palette should reach the player sets them. Pause and Replay draw their focus ring inside the button, in `--player-focus` (the player's ink when missing), so it shows on any ground; while a button is pressed the ring takes `--player-button-active-ink`, the pressed label's colour. A site that sets `--player-button-active-background` sets `--player-button-active-ink` with it, at 4.5:1 or more against it, or the pressed label and its ring both disappear. `check` fails a `<ConversationPlayer>` whose `id` is not a literal naming a file in `src/content/conversations/`; the build fails a script outside the schema.

## Blog

`blog` is an optional object. Absent means the 0.3.0 article page and the 0.3.0 lists. Each key is optional and independent. `check` fails an unknown key, a value of the wrong shape, and a site below 0.4.0 that sets the object.

| Key | Values | Absent | What it does |
|-----|--------|--------|--------------|
| `tags` | `true`, `false` | off | One page per tag used by a published article, and tag links on the article |
| `perPage` | a whole number from 2 to 50 | one page | The compact list pages after the newest n |
| `readingTime` | `true`, `false` | off | `<n> min read` on the compact list and the article |
| `byline` | `author-date`, `date`, `none` | today's line | How the article page writes the byline |
| `hero` | `true`, `false` | off | The compact list shows each article's hero |
| `related` | a whole number from 1 to 6 | off | Other articles that share tags, at the end of the article |

`tags: true` builds `/tags/<slug>` for each tag a published article uses. The slug is the tag lowercased, with a run of spaces or anything that is not a letter or digit turned into one hyphen, and hyphens at either end dropped. The page's title is the tag. Its description is `Articles tagged <tag>.` It lists that tag's articles in the compact list, newest first, with its own canonical. The sitemap includes the tag pages. `llms.txt` does not. The article page shows its tags as links under its title. The same tag string on one article is one link. Two different strings that slug to one address fail the build, and `check` fails them too. `check` also fails a tag that slugs to nothing, and a content page whose id is `tags` or starts with `tags/`, while this is on.

`perPage` applies to a page that sets `listArticles: true`. That page lists the newest n. The rest are at `/<page id>/2`, `/<page id>/3` and on. The first page keeps its address. The index page's id is `index`, so its second page is `/index/2`, not `/2`. A later page puts the page title plus ` (page 2)` in `<title>` only. `og:title` and the description stay the page's. Each later page has its own canonical. Newer and Older links sit at the foot of the list: Newer moves toward the first page, Older toward the last. One page of articles draws no pager. `check` fails a content page whose id is `<listing page id>/<number>` for a whole number from 2 up, not `1` and not a zero-padded number. A site that does not set `perPage` keeps the list on the one page.

`readingTime: true` shows `<n> min read` on the compact list and on the article page. n is the body's words divided by 200, rounded up, and at least 1.

`byline` set to `author-date` writes `By <author> · <date written out>`. `date` writes that date alone. `none` writes no line. Absent keeps today's line exactly: `By <author> ·` the ISO date. The written-out date is the date the compact list already writes, `en-US` with `timeZone: 'UTC'`.

`hero: true` shows each article's `hero` above its title in the compact list. The image's alt is the article's `heroAlt`, and it is empty when `heroAlt` is unset. `heroAlt` is optional text on an article. Whenever it is set, it is also the alt of the hero on the article page, whether or not `blog` is set. When it is unset, that hero keeps `alt=""`.

`related` ends the article page with up to n other published articles that share the most tags with it. A tie goes to the newer article. They use the compact list, under a heading Related.

None of this adds a rule to `tokens.css`. The lists reuse the compact list's classes. Newer and Older use an inline style. A rule added to `tokens.css` would change the stylesheet's file name on a site that never opts in, and Tailwind drops a theme variable nothing in that file reads.

## Events

An `events` collection is declared only when `src/content/events/` exists, as `conversations` is. The glob is `**/*.{md,mdx}`. The folder is content. `check` does not ask the envelope router to name it. A site below 0.4.0 that has the folder fails `check`.

| Field | Required | Rule |
|-------|----------|------|
| `title`, `description` | yes | text |
| `start` | yes | a date and time with an offset, such as `2026-10-15T18:00:00-06:00`. No offset is refused by the schema and by `check`. `Z` counts as an offset |
| `end` | no | the same form, and after `start` |
| `timezone` | yes | an IANA name `Intl` accepts, such as `America/Denver`. The page writes the time in this zone |
| `location` or `online` | one of them | `location` is text, or `online: true`. Not both, and not neither |
| `signup` | no | an `https://` URL |
| `draft` | no | boolean, default false |

`src/pages/events/[...slug].astro` builds `/events/<id>` for each published event. The layout's `<h1>` is the title. Under it is the date and time in the event's timezone, for example `Thursday, October 15, 2026, 6:00 PM MDT`, with the end time when `end` is set. Then the place, or Online. Then a Sign up link when `signup` is set. Then the body. A draft is not built.

The page's JSON-LD graph gains an Event: `@type` Event, name, description, startDate, endDate when set, eventAttendanceMode online or offline, location as a Place with the place name or a VirtualLocation whose url is `signup` or the page's URL, and url. The layout's other head slots are unchanged.

A page with `listEvents: true` lists, after its content, the upcoming published events and then the past ones. Upcoming means `start` is at or after the time of the build, soonest first. Past events sit under a heading Past, newest first. Each row is a compact list item: the title linking to the event page, the date and time, and the place or Online. The split is fixed at build time. Rebuild the site to move an event from upcoming to past.

`llms.txt` and the sitemap include published event pages. Drafts are excluded from the routes, the list, `llms.txt` and the sitemap.

A content page whose id is `events` builds `events.html` beside the `events/` routes. That is the same static-host caveat as a page id of `articles`. Prefer another name.

## Video and Faq

Both are kit components, exported from `src/components/index.js` with `ConversationPlayer`. A content `.mdx` page places them the same way. A site below 0.4.0 that places either fails `check`.

`<Video>` takes exactly one of `youtube`, `vimeo` or `src`, and a `title`. YouTube's address is `https://www.youtube-nocookie.com/embed/<id>`. Vimeo's is `https://player.vimeo.com/video/<id>?dnt=1`. Each sits in an `<iframe>` with that `title`, `loading="lazy"` and `allowfullscreen`, inside a 16:9 box. A local file is `<video controls preload="metadata">`, and the title is its `aria-label`. The id is letters, digits, hyphens and underscores. `src` is an `/images/` path whose file exists, by the same rules as a logo. `check` fails a missing literal title, no source, two sources, a bad id, a `src` outside `/images/` or whose file is missing, and a spread or an expression, which `check` cannot read.

`<Faq q="Question">Answer</Faq>` is a `<details>` element. The `<summary>` is the question, with a 44px target. The answer is the body. It adds no structured data.

The video frame and the question use inline styles, not a new `tokens.css` rule.

## The site's own folder

`src/custom/` is the site's own code. It is optional. A site with no `src/custom/` folder renders the kit's own header and footer. A site with no folder and none of `icon`, `lang` or a page's `image` builds the same files it built at 0.2.2, the stylesheet's file name included. A site that sets no `blog` key, has no `src/content/events/` folder, places neither `<Video>` nor `<Faq>`, and has copied no starter builds the same files it built at 0.3.0, the stylesheet's file name included.

The folder may hold only:

- `Header.astro`, rendered where the kit's header would be
- `Footer.astro`, rendered where the kit's footer would be
- `custom.css`, loaded after the kit's layers
- `components/<Name>.astro`, placed in an `.mdx` page by its file name, the same way a kit component is. `<Name>` starts with a capital letter and holds only letters and digits, and is not the name of a kit component. The kit's own components take precedence on a clash, and `check` fails that name

Anything else fails `check`, and `check` names it: another file, another folder, a nested folder under `components/`, or a symbolic link.

`Header.astro` receives `nav` (the `kit.json` `nav` array, or the kit's default links when `nav` is absent, the same links the kit's header computes), `siteName` (the brand label the kit computes), `brand` (`layout.header.brand`, or absent when the site sets none), and `path` (the page's public path, the one the canonical uses). `Footer.astro` receives `footer` (the `kit.json` `footer` array, or an empty array), `siteName`, and `path`. These props are the folder's contract. The skip link, the `<head>` and everything in it, `<main id="content">` and the layout's own `<h1>` stay the kit's markup, whatever markup the folder writes. A script the folder adds runs in the visitor's browser, where `check` cannot follow it; what a script does is judged at the Creative Director's gate before it is filed and at Webmaster Job 3 before publish. `check --built` reads the built markup of every page, so a header or component that adds a second `<h1>` or drops a head slot fails there.

Upgrade keeps `src/custom/**` byte-identical: it never copies over the folder and never archives it. A content job never writes it. Site Author's File site code job files a header, footer, stylesheet or component that `skills/Component Design/` or `skills/Marketing Page Design/` produced and `experts/Creative Director/` passed, and it refuses a file that skipped that gate.

In each `.astro` file, every import must be a static `import ... from '...'` or `import '...'`; a dynamic `import()` or `import.meta`, however written, fails, because `check` cannot read where it leads before the build. Each import must be a relative path that stays inside `src/custom/`, or `astro:content`, or a bare package name that is a key of the kit's `package.json` `dependencies`. `check` fails any other import and names the file and the import. A `<script src>` or a `<link href>` with an absolute `http:`, `https:` or `//` address fails, and so does one written as an expression, `src={...}`, which `check` cannot read. `id="content"` belongs to the frame's skip-link target and fails. In `custom.css` and in a component's `<style>`, an `@import` or a `url()` with an absolute `http:`, `https:` or `//` address fails, a remote font belonging in `tokens.css`'s font slot; a CSS escape outside a string fails; and a rule aimed at `.skip-link` or `#content` fails, because those belong to the frame. Whatever wrote it, `check --built` fails a built page that loads a script, or a stylesheet, preload or module preload, from any origin other than `siteUrl`.

When `src/custom/` exists, the envelope `AGENTS.md` must mention `src/custom/`, or `check` fails and tells the site to refresh its Content vs code section from `site-AGENTS.md`. A site below 0.3.0 with the folder, or with `icon`, `lang` or a page's `image`, fails `check`, which names 0.3.0 and says to run Upgrade.

## Starters

`starters/` sits beside this skill's `kit/`, outside it, so Stand-up and Upgrade never copy it. It holds five components written to the `src/custom/` contract above. `Testimonial.astro` is a quote, who said it, and an optional role. `CardGrid.astro` and `Card.astro` are a responsive grid of cards: a title, text, and an optional link. `Steps.astro` is a numbered list of steps, and a step may carry an image and that image's alt. `CallToAction.astro` is a heading, a sentence, and one link styled as a button at 44px. Each names its controls, keeps focus visible, and gives a link a 44px target. They are styled with Tailwind classes and the site's tokens. The comment at the top of each file says it is a starter the site now owns.

`scripts/starter.mjs --site <envelope> --name <Starter>` copies one starter into `site/src/custom/components/`. `--name CardGrid` also copies `Card`. The script refuses a site below 0.3.0, a name it does not ship, or a file that already exists, and it writes nowhere else. `--list` prints the names. File site code runs that script. A copied starter left as it shipped needs no Creative Director gate, because it shipped reviewed. A starter the site restyles takes that gate, like any other file under `src/custom/`.

## Required SEO slots

Stand-up fails `check` without every row.

| Slot | Where it lives |
|------|----------------|
| `SITE_URL` | `kit.json` `siteUrl`, required at stand-up, no trailing path |
| Title | per-page frontmatter, unique, emitted in `<title>` |
| Meta description | per-page frontmatter, required, emitted as `meta name="description"` |
| Canonical | `SITE_URL` + path, `trailingSlash: 'never'` in the kit, sites do not change this |
| Open Graph | `og:title`, `og:description`, `og:type`, `og:url`; `og:image` from a page's `image`, an article's hero, or `public/images/og-default.png`. An article keeps its hero |
| JSON-LD | WebSite + Organization on every page (Organization facts from bound `about` or omitted and labelled, never invented); Article on article routes; Event on event routes |
| One `h1` | the page title, printed by the layout; or the page's own when it sets `showTitle: false`, which `check` holds to exactly one |
| `robots.txt` | emitted at `/robots.txt` from `kit.json` `siteUrl` (not a static `public/` file) |
| `llms.txt` | emitted at `/llms.txt`, canonical pages, published articles and published events, URLs from `kit.json` `siteUrl`. Tag pages are not listed |
| Sitemap | Astro sitemap integration, drafts excluded |
| RSS | articles collection; omitted by `check` only when articles are disabled |
| Redirects | `public/_redirects`; a published slug is not deleted without a row |
| Drafts | `draft: true` excluded from sitemap, RSS, and canonical index |

Routes build as `<slug>.html` (`build.format: 'file'`), so a static host serves them at the slashless URL the canonical names; the default `<slug>/index.html` is redirected to a trailing slash by Cloudflare Pages. A top-level `404.html` ships from `src/pages/404.astro`, marked `noindex` and left out of Pagefind's index; without it Cloudflare Pages serves the homepage for every missing path. The page id `404` is reserved: `check` fails a `src/content/pages/404.md`. `vercel.json` at the kit root and `public/vercel.json` both turn on Vercel's `cleanUrls` with `trailingSlash: false`, which Vercel needs to serve `<slug>.html` at the slashless URL. The first covers an upload of `site/`, the second lands at the root of `dist/`. Cloudflare Pages ignores both. `check` fails a site missing any of the three, so an older site is told to run Upgrade.

A missing description in frontmatter fails `check` rather than shipping an empty meta tag. Empty `pubDate` on an article fails `check`.

## Content vs code

| Agents and content jobs may change | Site code | They may not |
|---|---|---|
| `src/content/**` | `src/custom/**`, site code: filed only by Site Author's File site code job after the Creative Director's gate, never by a content job. Upgrade keeps it byte-identical | `src/components/**`, `src/layouts/**`, `src/pages/**` (routes) |
| `public/images/**` | | `astro.config.mjs`, `package.json`, `package-lock.json` |
| `public/llms.txt` when SEO Assets writes it | | `src/styles/**`, except `src/styles/tokens.css` when `skills/Designer/` has already gated that token update. Any other write under `src/styles/**` is refused |
| `public/fonts/**` only within a Designer-gated token update | | `.github/**`, `KIT.md` copies |
| `kit.json` keys `nav`, `footer`, `siteName` and `layout`, `blog` on the requester's ask, and `articles` inside `collections`, only | | any other key in `kit.json` |

A request to add a kit component or edit `astro.config.mjs` is refused; placing a kit component in an `.mdx` page and writing its data under `src/content/` is content. Filing a header, footer, stylesheet or component into `src/custom/` is site code, Site Author's File site code job, not a content job. A request to add `src/content/articles/hello.md` with required frontmatter succeeds. Turning articles on or off, or a new page that lists them, is a new or retired URL and takes Webmaster Job 3 before publish.

An email address or a web address written as the visible text of a link is a second link inside the first. The Markdown compiler and the MDX compiler both do that, and `check --built` fails the built page. Write the address as a Markdown link, `[support@example.com](mailto:support@example.com)`, or in MDX as an expression, `{"support@example.com"}`.

A token update changes the values in `tokens.css`'s `@theme` block and may replace one of the two font slots. The font-source comment is the first statement in the file and may become one `@import url(...)` line loading the site's web fonts from a remote host. The self-hosted slot sits after `@plugin "@tailwindcss/typography";` and before `@theme`, and may become `@font-face` rules whose `src` is `url("/fonts/<file>")` pointing at files in `public/fonts/`. `@font-face` cannot precede `@import`, which is why that slot is separate. A site uses one mechanism or the other. Self-hosting keeps every font request on the site's own origin, and those files are written only within the Designer-gated token update. `check` requires every `url()` inside an `@font-face` rule to be a root-relative `/fonts/` path whose file is present under `public/fonts/`, and it names the file when that path is missing. An absolute `url()` (`http:`, `https:`, or `//`) fails: a font-face must load from `/fonts/` on the site's own origin, and a remote font belongs in the font-source `@import`, if at all. Any other path fails. Where `public/fonts/` holds a `.woff2`, `.woff`, `.ttf`, or `.otf` file, it must also hold a licence file whose name matches licence, license, or OFL, or `check` fails because font files ship without their licence. A remote `@import` with no `@font-face`, and a site that uses no web fonts, still pass. The base and utilities layers below the `@theme` block are kit code: a token update never edits them, and Upgrade replaces them. The role tokens (`--color-title`, `--color-heading`, `--color-meta`, `--color-nav`, `--font-title`, `--font-heading`, `--title-style`, `--text-prose`) default to the palette tokens, so a site that sets only `--color-paper`, `--color-ink` and `--color-link` needs nothing else. The kit's prose colours sit in the utilities layer, beside `@tailwindcss/typography`'s own, so the tokens reach body text and headings on a dark palette as well as a light one. Until 2026-09-24 they sat in the base layer, which the typography plugin's defaults outrank, so prose text rendered in the plugin's slate whatever `--color-ink` said. `check` fails a `tokens.css` that still sets prose colours in the base layer. Upgrade keeps everything in a site's `tokens.css` before its first `@layer base`, which is the two font slots and the `@theme` block, and replaces everything from there on with the kit's layers, archiving the old file first. A site whose `tokens.css` has no `@layer base` gets the kit's whole file, and Upgrade says so: that site reapplies its token update. Header and footer navigation links carry a 44px minimum target. So do the links of a list a page asks for with `listArticles: true`, and, on a site that sets `layout`, the skip link and the index page's own article list; a site that sets neither keeps the 0.1.0 page.

## Collections

`pages`, `articles`, `authors` always in the schema. An author may set `type: Organization` for an organisation byline; it defaults to `Person` in the Article JSON-LD. `sections` / `issues` exist in the schema and stay disabled unless stand-up is magazine. A brochure and a magazine are one kit. `conversations` is declared only when `src/content/conversations/` exists, so a site with no conversation builds without a warning. `events` is declared only when `src/content/events/` exists, for the same reason. Events above is the schema.

## Frontmatter

Articles: `title`, `description`, `pubDate`, `author`, `tags`, `draft`. Hero image optional. `heroAlt`, also optional, is the alt of that hero when set; unset, the hero keeps `alt=""`. `pubDate` is a date, `2026-09-24`, or a date and time with its offset, `2026-09-24T09:00:00Z`; `check` fails a date and time with no offset, quoted or not, which the build can read in its own machine's zone, so its day could differ between two builds. `check` reads frontmatter one plain `key: value` line at a time, and fails a top-level line it cannot read that way (an explicit `?` key, a `<<` merge, a flow mapping, a tagged or escaped key), because such a line can set an option where `check` does not look.

Pages: `title`, `description`. Optional: `draft`, `showTitle`, `listArticles`, `listEvents`, `image`, and `organization` on the about page only. `image` is an `/images/` path whose file exists, by the same rules as a logo, and it is that page's `og:image`. Absent, the page uses `public/images/og-default.png`, as before. An article keeps its `hero` and does not read `image`. `listEvents` is Events above.

Event files: `title`, `description`, `start`, `timezone`, and `location` or `online: true`. Optional: `end`, `signup`, `draft`. Events above is the full rule, including the offset on `start`.

## Replication, check, upgrade

`check` reads `kitVersion` against the versions below, and **fails if a `.git` exists in the envelope or kit folder** (nested git is never the silent default). Fail if any required SEO slot is missing. `check` accepts a site at `kitVersion` 0.1.0, 0.2.0, 0.2.1, 0.2.2, 0.3.0 or 0.4.0, and fails any other value or a missing one, naming the versions it knows and saying to run Upgrade. A site below 0.4.0 runs every rule this file states, and also fails each thing its own kit cannot render, naming the version that introduced it and saying to run Upgrade. Those things are the 0.2.0 options, and, at 0.3.0, the `src/custom/` folder, `kit.json` `icon`, `kit.json` `lang`, and a page's `image`. 0.2.2 adds no key, so a site at 0.2.0 or 0.2.1 is checked as 0.2.2 is. 0.4.0 adds `kit.json` `blog`, a page's `listEvents`, an article's `heroAlt`, the `src/content/events/` folder, and the `Video` and `Faq` components. A site below the version that introduced one of those fails, naming that version and saying to run Upgrade. When a site below 0.4.0 passes, the PASS line names its `kitVersion`, says this check is 0.4.0, and says Upgrade takes the site to it.

`upgrade` archives every kit-owned file it will replace, per `standards/conventions.md` (a `zArchive/` next to the file, except that a file under `src/` or `public/` archives to `zArchive/src/<its path>/` or `zArchive/public/<its path>/` at the kit root, because a `zArchive/` inside `src/pages/` would build as routes and one inside `public/` would be published; unless that root declares git history as recovery **and** the site is in a committed current repo), then copies kit code files over and refuses to merge `src/content/**`, `src/custom/**`, `public/images/**` and `public/fonts/**`. It takes a site at `kitVersion` 0.1.0, 0.2.0, 0.2.1, 0.2.2, 0.3.0 or 0.4.0 to 0.4.0 and refuses any other, and it keeps a site's `tokens.css` font slots and `@theme` block, as Content vs code states. `blog` stays the site's, with `domain`, `siteUrl`, `collections`, `nav`, `footer`, `siteName`, `layout`, `icon` and `lang`. It changes none of a site's pages until the site sets an option. `src/custom/**` is site-owned: Upgrade never copies over it and never archives it, and it stays byte-identical. It does not write the envelope `AGENTS.md`, and says so when that file's frontmatter names another `kitVersion`. Two sites on the same `kitVersion` are maintainable as a class; a site that failed `check` is a foreign site until it is upgraded or declared foreign.

Paths in this contract are relative to `site/`. Envelope `AGENTS.md`, `memory/`, `builds.md`, and Playbooks are outside Upgrade. Kit-owned means everything except `src/content/**`, `src/custom/**`, `public/images/**`, `public/fonts/**` and `public/_redirects`. Those stay byte-identical across Upgrade; the kit's `_redirects` is written only where a site has none, and Upgrade stops, replacing nothing, where `public/_redirects` is not a file. Until 0.2.1, Upgrade replaced a site's `_redirects` with the kit's and archived the old file inside `public/`, where it was published: Upgrade now moves any `public/zArchive/` to `zArchive/public/` first, and names an archived `_redirects` that differs from the site's, whose rows the site may need to restore.

## Git and hosting

Content is file-backed, not CMS-backed. Git is optional plumbing, not the content model. **Never connect the envelope or owning Wiser root to a host.** Host payload is `site/` or `site/dist/`; envelope `memory/` stays local.

No `git init` by default. The kit writes a site `.gitignore` (`node_modules/`, `dist/`, `.astro/`). A site with no git is not a failed stand-up.

Live host is not this contract. Which host is named? Cloudflare Pages, or the requester called the site simple and did not call it managed: load `skills/Cloudflare Pages/`. Vercel, or the requester called the site managed and did not call it simple: load `skills/Vercel Deploy/`. Both hosts, or the requester called it both simple and managed, or the named host disagrees with the word: ask, and do not pick. Neither a host nor simple or managed is stated: ask which it is, and do not pick one. No answer: do not load either. The upload is the kit folder only.

## Optional kit furniture, not jobs

`public/admin/` for Sveltia. Commented `CODEOWNERS`. A path-guard workflow. None are required to pass `check`.

## System dependencies

Node 22.12 or newer (Astro 7's floor). The 2026-09-08 Playbook said 18; current stable Astro 7.3.2 requires `>=22.12.0`. The host runs `npm install` and `npm run dev` in the envelope's `site/` folder. Not wrapped as a Wiser tool.

## Stand-up rules this contract encodes

- Owning root `AGENTS.md` must declare `sites/`. Otherwise stop and name the missing declaration.
- Domain folder is an envelope at `sites/<domain>/`, or `work/<slug>/sites/<domain>/` when it dies with existing work. The root and that work subject must declare `sites/`. The host is lowercase, no scheme, no `www` unless `www` is a distinct property. The kit lives in `site/`.
- A current envelope has `site/kit.json`. A domain-folder `kit.json` without it is the Milestone 1 to 3 shape. Did the requester declare it foreign? Yes: leave it untouched. No, or they do not say: wrap to the envelope. Do not write the current kit until that wrap runs. Neither file means foreign. Stand-up refuses all existing folders and leaves them untouched.
- Do not `git init`.
- First-party kit only. No vendored theme (not AstroWind, not AstroPaper, not a named magazine starter).

## How `check` walks this file

1. Invoke Check on the envelope. Confirm the envelope and kit folder have no nested `.git`; walk `site/` for steps 2 to 5.
2. Read `kit.json`. `kitVersion` is 0.1.0, 0.2.0, 0.2.1, 0.2.2, 0.3.0 or 0.4.0. Any other value, or a missing one, fails, names those versions, and says to run Upgrade. A site below 0.4.0 is checked by every rule in this file, and also fails each thing its own kit cannot render, naming the version that introduced it and saying to run Upgrade. Those things are the 0.2.0 options: a `layout` key, a `style` key on a `nav` or `footer` item, `showTitle` or `listArticles` in a page's frontmatter, a `<ConversationPlayer` in an `.mdx` file, and `collections.articles` set to `false`. 0.2.2 adds no key. 0.3.0 adds the `src/custom/` folder, `kit.json` `icon`, `kit.json` `lang`, and a page's `image`; a site below 0.3.0 that uses any of them fails, naming 0.3.0 and saying to run Upgrade. 0.4.0 adds `kit.json` `blog`, a page's `listEvents`, an article's `heroAlt`, the `src/content/events/` folder, and a `<Video` or `<Faq` in an `.mdx` file; a site below 0.4.0 that uses any of them fails, naming 0.4.0 and saying to run Upgrade. When `blog` is present, its keys and values are those Blog names. `siteUrl` has no trailing path or slash. When `nav` or `footer` is present, it is an array of `{label, href}` as this file's kit.json section states, and a `nav` item's `style` is `button`. When `layout` is present, its keys and values are those Layout options names. When `icon` is present it is an `/images/` path whose file exists, by the same rules as a logo. When `lang` is present it is a language tag as this file's kit.json section states. When `src/custom/` exists it holds only what The site's own folder allows: `Header.astro`, `Footer.astro`, `custom.css`, and `components/<Name>.astro` with that name rule, and no other file, folder, nested folder or symbolic link. Each `.astro` import stays inside `src/custom/`, or is `astro:content`, or is a kit dependency; a remote `<script src>` or `<link href>` fails; a remote or escaped `@import` or `url()` in `custom.css` fails. When `src/custom/` exists, the envelope `AGENTS.md` names `src/custom/`. When `layout` is set, the envelope `AGENTS.md` names `layout`; when articles are off, it names `collections.articles`; otherwise it predates them and is refreshed from `site-AGENTS.md`. The envelope router is not required to name `src/content/events/`.
3. Confirm `trailingSlash: 'never'` in the Astro config.
4. Confirm collections schema includes `pages`, `articles`, `authors`, and disabled `sections` / `issues` unless magazine.
5. For every content file in `pages` and `articles`, required frontmatter is present. Articles: `title`, `description`, `pubDate`, `author`, `tags`, `draft`. A page that sets `showTitle: false` has exactly one `<h1>` in its body; `showTitle`, `listArticles` and `listEvents` are booleans. A page's `image`, when set, is an `/images/` path whose file exists, by the same rules as a logo. An article's `heroAlt`, when set, is non-empty text. Every `<ConversationPlayer>` names a file in `src/content/conversations/`. Every `<Video>` has a literal title and exactly one literal source, as Video and Faq states. With articles off, every article is a draft. With `blog.tags` on, no content page id is `tags` or `tags/<rest>`, no published tag slugs to nothing, and two different tag strings do not slug to one address. With `blog.perPage` set, no content page id is a later page of a `listArticles: true` page. Every file under `src/content/events/` has the frontmatter Events requires, including the offset on `start`, a timezone `Intl` accepts, and an `https://` signup when signup is set. `src/styles/tokens.css` carries the kit's `@layer base` and `@layer utilities` blocks, sets its prose colours in the utilities block, and sets none in the base block. A `--measure` it sets is not a keyword or a bare number. An `@font-face` `url()` in that file is a `/fonts/` path on this site whose file exists under `public/fonts/`, a file with `@font-face` rules carries no remote `@import`, no `@import` or `@font-face` rule uses a CSS escape, and a `.woff2`, `.woff`, `.ttf`, or `.otf` there ships with a licence file.
6. `check --built` reads `dist/` for nested anchors and a stale build, and fails a folder or file in `dist/` it cannot read and a symbolic link there. The scan follows HTML's own parsing where content can reach it (comments, raw-text elements, `<template>`, SVG and MathML with their CDATA and self-closing tags, and the HTML elements that end them); it is not a full HTML parser. A build is stale when any file or folder under `src/` or `public/`, or `kit.json` or `astro.config.mjs`, changed after the oldest built page; a folder changes when a file in it is added, removed or renamed, so a page deleted after the build counts. A file copied in with its old modification time kept is not seen, so rebuild before a publish rather than rely on this alone. Every `.html` file the kit built, which is every `.html` in `dist/` except one copied from `public/` and except anything under `dist/pagefind/`, must carry a non-empty `<title>`, a `meta name="description"`, a `link rel="canonical"`, `og:title`, `og:url`, a `script type="application/ld+json"`, and exactly one `<h1>` outside comments, scripts and templates. `check` fails each missing one and names the page. On those same pages, outside comments, scripts, styles and templates, `check` also fails and names the page and the element for each of six rules, at every `kitVersion` it accepts: an `<img>` with no `alt` attribute (an empty `alt=""` is allowed); an `<a href>` with no accessible name, which is text, an image `alt` inside it, `aria-label`, `aria-labelledby`, or `title`; a `<button>` with no accessible name, by that same test; an `<iframe>` with no non-empty `title`; an `<input>` other than type hidden, submit, reset, button or image, or a `<select>` or `<textarea>`, with no label, which is a `<label for>` naming its `id`, a wrapping `<label>`, `aria-label`, or `aria-labelledby`; and an `id` value used twice on one page. Then the served-HTML fetch: after `npm run dev` or `build` plus preview, fetch `/`, one article route (if articles enabled), sitemap, RSS (if articles enabled), `/llms.txt`, `/robots.txt`. Homepage `<head>` carries title, meta description, canonical, `og:title`, `og:description`, `og:url`, JSON-LD WebSite + Organization, and its body exactly one `<h1>`. Canonical and `og:url` use `kit.json` `siteUrl`. Article route additionally carries Article JSON-LD. Drafts are absent from sitemap, RSS, and canonical index.
