# What changed in Wiser

What changed in this plugin that a member would notice, newest first. Each release is one update to the plugin's `main` branch on GitHub, named by a tag of the form `vYYYY.MM.DD`, with `.2` or `.3` added when there was more than one that day. Each line names the commits that made the change; every commit is public at github.com/wisermethod/wiser. A line says what changed and nothing about what it is worth.

Changes before September 27, 2026 are in the commit history only.

## v2026.10.07.7, October 7, 2026

- Deploying a site with Pages Functions now refuses more before anything is sent: a published file that is a copy of the Function's own source code, under any name; any folder inside a site kit's built output; a compiled bundle with module names outside plain letters, digits and simple punctuation; and a path written with `..` or doubled slashes. A database connection that fails still reports any other setting Cloudflare changed, and a migration runs only after Cloudflare has confirmed the record of migrations already applied. (9a4e639)
- The `pages-functions` tool keeps Wrangler off the network even when a settings file above its working folder names another package registry, and on Windows keeps Wrangler's files inside its own temporary folder. (9a4e639)

## v2026.10.07.6, October 7, 2026

- A website that was not built with the site kit can now go live on Cloudflare Pages with its own server code, the Pages Functions in its `functions/` folder. A new tool, `pages-functions`, compiles that folder on your computer with Cloudflare's own compiler and no Cloudflare sign-in; its first run asks to install about 210 MB. The Cloudflare Pages skill then deploys the site and the compiled code together, after Webmaster's review, through the local gateway. (3a7f5a7, 7856ccb)
- The Cloudflare connector now works with D1 databases: create one, set up its tables from a migration file the way Wrangler does and skip a file already applied, read it, change it with a confirmation every time, connect it to a Pages project under the name the site's code expects, and delete it. These use the Cloudflare Pages connection you already have; its token needs the Account, D1, Edit permission beside its Pages one, and nothing is reconnected. (3a7f5a7, 9df924a, 7856ccb, 3cb1178)
- A site kit site is still deployed only as it was, with no server code of its own. (3a7f5a7)

## v2026.10.07.5, October 7, 2026

- A site built with the site kit can schedule an article: give it a `pubDate` in the future, and it stays out of the site, its lists, feeds, sitemap, `llms.txt` and search until a build made at or after that moment. Until now such an article went live at the next build. A date and time with its offset sets the exact moment; a date alone means 00:00 UTC. (b0b6aa6)
- Site Author's check lists each scheduled article with the moment it goes live, says when one is due for a rebuild and deploy, and fails a build that shows an article early. Going live stays a step a person approves: build, check, Webmaster's review, then the deploy. (b0b6aa6)

## v2026.10.07.4, October 7, 2026

- Deploying a site to Cloudflare Pages sends its files in smaller requests, at most 3 MiB each, after a site whose first request was about 5 MiB was refused as too large and nothing was published. A site holding a single file too big to send this way, about 2.25 MiB or more, is refused before anything is uploaded, naming the file and pointing to Wrangler instead. If a request is still refused as too large, the answer now says so and gives the request's size, rather than a bare error. (50aff0b)

## v2026.10.07.3, October 7, 2026

- The README now says to install Wiser from this repository rather than from the plugin directory in Claude, whose copy does not update; tells Claude Cowork users to turn on Sync automatically when they install; and has a new Updating section saying how to bring each app's copy up to date. (811893b)

## v2026.10.07.2, October 7, 2026

- A site built with the site kit can hide a page: `noindex: true` in its frontmatter keeps the page at its address, for someone given the link, and keeps it out of search engines, the sitemap, `llms.txt` and the site's own search. Nothing names the address publicly. (ee7f371, e3b77d8)
- A site can publish downloads, such as PDFs, from `public/files/`, served at `/files/<name>`. Upgrades keep the folder exactly as it was, and Site Author's check refuses any file there that a browser would run as a page or script. (ee7f371, e3b77d8)
- Site Author now says which version it is, and which site kit it ships, at the top of its instructions and as the first line its scripts print. When two copies are present it uses the newer one and says the other is out of date. (ee7f371)

## v2026.10.07, October 7, 2026

- The virtual machines connector's guide now covers connecting through the Wiser endpoint as well as the local gateway, and says what happens there to a command that runs longer than 20 seconds: the answer comes back as `uncertain`, and the command may still finish on the machine. (f7a082d)
- When the Wiser endpoint answers that it could not confirm a call's outcome (`uncertain`), the setup guide's list of answers and Connection Troubleshooter now say what it means and what to check before trying again. (f7a082d)

## v2026.10.06.4, October 6, 2026

- A site built with the site kit can publish its own `llms.txt`, the summary AI tools read, by keeping it at `src/content/llms.txt`; the kit serves it exactly as written, and Site Author's check confirms the built file is the site's own. (fbbfeb5)
- A site that turns its top links off, with `nav` set to an empty list, no longer shows a blank header strip, and screen readers no longer announce an empty menu. (fbbfeb5)

## v2026.10.06.3, October 6, 2026

- Sites built with the site kit can turn on blog features one at a time: a page for each tag, a blog page split into pages of a set length, reading time, the date written out under each article's title, a picture beside each post in the list, and related posts at the end of an article. (bed3f4c, 0e22bda)
- A site can list classes and live sessions: each event gets its own page with the time written in its own time zone, a place or "Online", and a sign-up link, and a page can list upcoming sessions, then past ones. (bed3f4c, b9de292, 0e22bda)
- Pages can place a video (YouTube, Vimeo or a file on the site) and questions that open to show their answers. (bed3f4c, 0e22bda)
- Site Author can copy ready-made sections into a site's own folder: a testimonial, a grid of cards, numbered steps and a closing call to action, which the site then owns and can restyle. (bed3f4c, 7ad687c)
- A profile site can describe the person it is about, their work, the organisations they founded and their books, and search engines read it as that person's profile page. A site that states no organisation details no longer carries an empty one. (427d136, 0e22bda)
- Site Author's check on a built site now looks for images without descriptions, links and buttons without names, form fields without labels, embedded frames without titles and repeated ids. (bed3f4c, 0e22bda)
- Profile Page hands a kit site the person's confirmed facts for that description, instead of naming a gap. (427d136)

## v2026.10.06.2, October 6, 2026

- Sites built with the site kit can have a folder of their own code, `src/custom/`: their own header, footer, stylesheet and components, which a page places by name. Upgrading the kit never touches that folder, and a site without one looks exactly as before. Site Author files the code into it after the Creative Director has checked the design. (c0105de, 64d0cc3)
- A site can name its own icon and its language, and a page can choose the picture shown when it is shared. (c0105de, 64d0cc3)
- Site Author's check on a built site now looks at every page: each needs its title, description, link to itself, sharing details and one main heading, and none may load a script or stylesheet from another website. (c0105de, 64d0cc3)

## v2026.10.06, October 6, 2026

- Sites built with the site kit: a page set to list the site's articles (`listArticles: true`) shows each one as its title, a short description and the date written out, such as "September 24, 2026". That list no longer has a bullet beside each article or a large gap under the page title. A homepage that lists articles without that setting is unchanged. A site sets the spacing and title size through three new design tokens. (a9e7f66, 54ca841)
- Site Author's check can read a site after it is built, and stops when a link sits inside another link. That happens when an email address or a web address is written as a link's own text; the check says how to write it instead. It also stops when the built site is older than a change to its pages. (a9e7f66, 54ca841, 048ee6b)
- Site Author's check now works on a site still on an earlier kit version, and says an upgrade is available, instead of refusing it. (a9e7f66, 54ca841, 048ee6b)
- Site Author's check stops when an article's date gives a time with no time zone, because the site could then show a different day depending on the computer that built it. (54ca841, 048ee6b)
- This changelog, from this release on, with the six releases before it since September 27, 2026. (6c9d11d)

## v2026.10.05.3, October 5, 2026

- Setting up a website asks whether it should have an articles or blog section, and builds none until you answer. (7ac4622, 911df54)

## v2026.10.05.2, October 5, 2026

- New skill, Profile Page: the words for a page about one person, with every fact checked against a list of that person's claims, held for that person, or someone they name, to approve, then handed to whoever builds the page. (d0674ba, 69316fe)

## v2026.10.05, October 5, 2026

- Sites built with the site kit: on a wide page, headings and text share one reading width, with a margin on phones; the conversation player's buttons show where the keyboard is on any background; the skip link and article lists are easier to tap; and a site can set the line height of its text and the hover and pressed colours of its buttons. (c4e84c3, a04def6, 1435649)
- Upgrading a site's kit keeps the site's redirects. Before, an upgrade replaced them, and published a copy of the old redirects file with the site. (469f9c2, a04def6)

## v2026.10.04.2, October 4, 2026

- Site Author asks how a new site should look before it builds it: a narrow or wide page, sections in full-width colour bands, the site's name or logo in the header, a header that stays on screen, a Menu button on phones, an articles section, and the homepage headline. Nothing changes on an existing site until it turns a choice on. (afcb968, 66cb10e, d27f8cc, 2242630)
- A page can play a scripted conversation, with files appearing in a folder as they are saved. It holds still for people who have reduced motion turned on, and its full text is always on the page. (afcb968, 66cb10e)
- Upgrading a site's kit keeps the site's colours and fonts. (afcb968, d27f8cc, 2242630)

## v2026.10.04, October 4, 2026

- In Claude's apps, installing Wiser brings the connection to your Wiser account with it. You connect it and sign in once. (6dc7a1d, 98aa948, 740d360)
- In Claude Cowork, Wiser sends you to the plugin's own Connectors tab to connect, and says what to do when your organization has to add it for you. (f44143b, 6fb7076, a41a5c9)
- In Claude Code, the current notice about the Wiser service, when there is one, shows as one line when a session starts. You can turn it off. (5dcfc4b, 8b88aab)
- Connecting an account works the same way through your Wiser account or a local gateway, and you can ask for it in plain words. (efa996c, d9f8804, 6d97f5f)
- A list of your connected accounts reads every page of them, or says it could not, rather than showing part of the list. (6a5615c, 26bb9c8, 1fff0fc, 248efd9, 4794716)
- Site Author's description no longer uses angle brackets, so Claude Cowork's plugin upload accepts it. (0a7d313)

## v2026.09.27, September 27, 2026

- When Wiser asks before acting on an account you've connected, it shows every value it will use in full, lists included, and your approval covers exactly that action with those values, once, within fifteen minutes. (24b4551, 3668acd, 3d8b6ad)
- The vm connector reaches your servers through your own router, set up in your own account, and refuses a service name that could be read as an option. (fe63a9b, 1e80329, 6d43f38, 8bbd431)
