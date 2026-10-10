# What changed in Wiser

What changed in this plugin that a member would notice, newest first. Each release is one update to the plugin's `main` branch on GitHub, named by a tag of the form `vYYYY.MM.DD`, with `.2` or `.3` added when there was more than one that day. Each line names the commits that made the change; every commit is public at github.com/wisermethod/wiser. A line says what changed and nothing about what it is worth.

Changes before September 27, 2026 are in the commit history only.

## v2026.10.10.2, October 10, 2026

- Before a site that replaces another goes live, Webmaster now checks that every address the old site served, images and files as well as pages, is kept or redirected, and that you have said what may be retired. (e480406, bb06092)
- Content Author now asks which moment in your reader's journey a page or email serves before drafting it, and puts a list in the order that matters to your reader. (e480406)
- When a new action fits a service you have already connected, Connector Advisor now plans it onto that connection, so you are not asked to connect the same account twice. (e480406, bb06092)
- Browser Control now checks whose browser is on a port before using it, and no longer suggests closing a browser another session started. (e480406)
- The virtual machine connector's troubleshooting now explains a refusal that never reaches your machine, and how to find its cause without running anything that changes the machine. (e480406, bb06092)
- A Playbook that runs on its own, one step after another, now states what one step is, how the next one is chosen, and when the run stops. (e480406, bb06092)
- When a session working a Playbook ends, it now hands you one line, the Playbook's path, whether or not you let it commit, and the Playbook itself holds the next step and every open decision with a recommendation. Pasting that line into a new session is enough to resume. (a8b26a7, 1e7053c)

## v2026.10.10, October 10, 2026

- When you approve a site deploy that carries a scheduled article whose time has already passed, Cloudflare Pages now tells you the article goes live the moment the deploy lands, not at its scheduled time. (7f33120)
- When you run a site deploy through the Wiser connection in your app, which cannot read files on your computer, the connection troubleshooting skill now explains that and points you to the local gateway, instead of having no next step. (14cdb11)
- When an action was added to your local gateway after it started, the connection troubleshooting skill now tells you a new session will pick it up, instead of reporting a missing connector. (7f33120, 4c4f6c1, e8cad48)
- Wiser may now add a line to your working folder's `.stignore` or `.gitignore`, the files that keep sync and version control out of the wrong places. Nothing else at the top of a folder is written. (7f33120, 4c4f6c1)
- The snapshot Wiser takes before it reorganizes a folder now works when the folder holds files over 2 GB, and it includes a site's `tokens.css` instead of setting it aside as a password file. (7f33120, 4c4f6c1, e8cad48)
- Browser Control no longer closes its browser when a download click finds nothing to click. (7f33120)
- The site kit's guide now says correctly that a site carries an Organization record only when its published about page states the organization's facts. (7f33120, 4c4f6c1)

## v2026.10.09.3, October 9, 2026

- A program in your working folder can now hold programs of its own as well as projects, as deep as the work needs. A podcast program can keep guest sourcing, post-production and advertising as ongoing areas, each holding its own episodes and campaigns. Each folder says in its own AGENTS.md whether it has an end, which makes it a project, or not, which makes it a program; a project still holds no program. Moving a folder to a different parent still goes through a Housekeeping plan you approve, and a folder that turns out to have an end, or not, where it already sits only needs its own AGENTS.md changed. (614d9a2, 56904fd, 02e36b3)
- A working folder that does not nest programs is asked for nothing new, and update root leaves it as it is. Once a folder holds a program inside a program, update root proposes refreshing its programs/AGENTS.md so that file says so. (56904fd, 02e36b3)

## v2026.10.09.2, October 9, 2026

- On a Cloudflare account that has never turned on Cloudflare Access, Zone Publisher now records that as a reading, no Access application applies, instead of an unreadable refusal it had to ask you about. (0ab978c, c8cf283, f6abe78)
- When a service refuses a request, Wiser now passes along the service's own numeric error codes, and nothing else from its answer, so a refusal can be told apart from another with the same status; the connection troubleshooting skill reports them. (0ab978c, c8cf283, f6abe78)

## v2026.10.09, October 9, 2026

- Zone Publisher now reads a Cloudflare zone's settings and rules every time it pulls the zone, and keeps them in the archive with the records: the SSL mode, Always Use HTTPS, HSTS, Bot Fight Mode, the certificates, Workers routes, Page Rules, Access applications, every rule entrypoint, and, when a record is about to be proxied or a redirect changes, the account's redirect lists. A record is not proxied while a rule that could apply to it is still unread, and a rule it could not read is reported as not read, never as empty. (4128c59, 819b941)
- Zone Publisher can now publish redirects, a `www` to apex 301 or a `pages.dev` address sent to a custom domain, as Cloudflare Single Redirects and Bulk Redirects, and change the SSL mode, Always Use HTTPS, HSTS, the minimum TLS version and Automatic HTTPS Rewrites. Each goes through the same review by IT Expert, approval by name, and re-read from Cloudflare that a DNS change does. (0c0616c, 4128c59, 819b941, 9c0fb6e)
- Cloudflare Pages now reads whether a custom domain is active, with Cloudflare's own reason when it is not, for example "CNAME record not set", and can retry its validation. (0c0616c, 4128c59)
- Vercel Deploy can list a project's domains and remove one, removing a domain that redirects to another before the one it points at. (0c0616c, 4128c59, 819b941)
- All of this uses the Cloudflare and Vercel connections you already have. Where Cloudflare answers that a permission is missing, add that permission to the same token at Cloudflare (My Profile, API Tokens, Edit); the token keeps its value, so nothing is reconnected. The Cloudflare connector's guide lists the permission each action needs. (97c73b4, 21a25c2)

## v2026.10.08.2, October 8, 2026

- Webmaster's review before publishing now says exactly which record it reads for a site with server code: a site kit site's scheduled-article record, or another site's own build record, so the review of a scheduled article no longer has to work that out. (829a121)

## v2026.10.08, October 8, 2026

- A site built with the site kit can now publish a scheduled article by itself, at its moment, on Cloudflare Pages. Give the article a `pubDate` in the future and approve its deploy once, when you file it: at that moment it appears on its own page, in the site's article lists, tag pages and related articles, and in its feed, sitemap and `llms.txt`, with no rebuild and no second deploy. Until then nothing about it shows anywhere. The kit does this with a small piece of server code, the same for every site, that runs only when an article is scheduled; if it ever stops running, visitors see the site exactly as it was built, never a post early. (833afeb, 8121017, e250120, 95d9823)
- A scheduled article joins the site's own search at the next build after it goes live. On Vercel, or with a Wrangler deploy, a scheduled article still goes live at the first build and deploy after its date. (8121017)
- Site Author's check says, for each scheduled article, whether it will go live by itself and when. It refuses a scheduled article whose styling would put its words in the site's stylesheet early, a redirect that names a scheduled article, and any page that would later go live while breaking the site's page rules. (8121017, e250120, 95d9823)
- Deploying a site kit site to Cloudflare Pages carries that server code only when an article is scheduled, and only the exact code the kit released; the deploy says what it carried and when each article goes live. Before such a deploy, the Cloudflare Pages skill explains the free plan's daily limit on server requests, which the account's sites share, and what visitors see past it. (8121017)
- Webmaster reviews a scheduled article once, when it is filed, instead of again on the day it goes live. (8121017)

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
